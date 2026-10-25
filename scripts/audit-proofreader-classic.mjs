/** Local/manual only. Save migration, edition isolation, controls, metadata, and shared footer. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { newAuditContext } from './lib/builtSiteBrowser.mjs';
import { startPreview } from './lib/previewServer.mjs';
import { clickControl, waitForPageReady } from './lib/gameAuditUi.mjs';

const evidence = process.env.PROOF_CLASSIC_EVIDENCE ?? '/tmp/khc-proofreader-classic';
const engines = (process.env.PROOF_CLASSIC_BROWSERS ?? 'chromium,webkit').split(',');
const classicRoute = '/games/proofreader-classic/';
const newProgress = 'khc-arcade-proofreader-classic-v2';
const newSettings = 'khc-arcade-proofreader-classic-settings-v2';
const oldProgress = 'khc-arcade-proofreader-v2';
const oldSettings = 'khc-arcade-proofreader-settings-v2';

async function ready(page, query = '') {
  await page.goto(classicRoute + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__proofreaderClassic));
  await waitForPageReady(page);
}

async function migration(browser, baseURL) {
  const original = JSON.stringify({
    version: 2,
    unlocked: 99,
    cleared: [1],
    records: {
      'campaign:1:standard:standard': { score: 120, seconds: 25, medals: [true, true, false] },
    },
  });
  const sources = {
    [oldProgress]: original,
    [oldSettings]: JSON.stringify({ sound: false, speed: 0.8, assist: true, sensitivity: 1.2 }),
    'khc-arcade-proofreader-v3': JSON.stringify({
      version: 3,
      unlocked: 1,
      cleared: [],
      records: {},
    }),
    'khc-arcade-proofreader-settings-v3': '{"fov":80,"graphics":"low"}',
  };
  const context = await newAuditContext(browser, { baseURL, reducedMotion: 'reduce' });
  await context.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, sources);
  try {
    const page = await context.newPage();
    await ready(page);
    let saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), newProgress);
    assert.equal(saved.unlocked, 2);
    assert.equal(saved.records['campaign:1:standard:standard'].score, 120);
    assert.equal(await page.locator('[data-arcade-speed]').inputValue(), '0.8');
    assert.equal(await page.locator('[data-arcade-assist]').isChecked(), true);
    const settings = await page.evaluate((key) => localStorage.getItem(key), newSettings);
    await page.evaluate(
      ({ key, settingsKey }) => {
        const value = JSON.parse(localStorage.getItem(key));
        value.cleared = [1, 2];
        value.unlocked = 3;
        localStorage.setItem(key, JSON.stringify(value));
        localStorage.setItem(settingsKey, '{"sensitivity":1.7}');
      },
      { key: newProgress, settingsKey: newSettings }
    );
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__proofreaderClassic));
    saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), newProgress);
    assert.deepEqual(saved.cleared, [1, 2]);
    assert.equal(await page.locator('[data-arcade-sensitivity]').inputValue(), '1.7');
    assert.ok(settings.includes('1.2'));
    for (const [key, value] of Object.entries(sources))
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), value);
  } finally {
    await context.close();
  }

  for (const scenario of ['corrupt-legacy', 'corrupt-classic', 'denied']) {
    const context = await newAuditContext(browser, { baseURL, reducedMotion: 'reduce' });
    await context.addInitScript(
      ({ scenario, oldProgress, newProgress }) => {
        if (scenario === 'denied') {
          Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() {
              throw new DOMException('Audit: storage denied', 'SecurityError');
            },
          });
        } else localStorage.setItem(scenario === 'corrupt-legacy' ? oldProgress : newProgress, '{');
      },
      { scenario, oldProgress, newProgress }
    );
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await ready(page, '?mode=practice&stage=6');
      await clickControl(page.locator('[data-arcade-primary]'));
      await page.evaluate(() => window.__proofreaderClassic.endRun());
      assert.equal(await page.evaluate(() => window.__proofreaderClassic.state().status), 'over');
      if (scenario === 'denied')
        assert.match(await page.locator('[data-arcade-storage]').textContent(), /this visit only/);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
}

async function controls(browser, baseURL, engine) {
  for (const profile of [
    { label: 'desktop', width: 1440, height: 1000, touch: false },
    { label: 'phone', width: 390, height: 844, touch: true },
  ]) {
    const context = await newAuditContext(browser, {
      baseURL,
      viewport: { width: profile.width, height: profile.height },
      hasTouch: profile.touch,
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() => {
      window.__classicContexts = [];
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (this.hasAttribute('data-proofclassic-canvas')) window.__classicContexts.push(kind);
        return getContext.call(this, kind, ...args);
      };
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data) => {
          window.__classicShare = data;
        },
      });
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await ready(page, '?mode=practice&stage=3&rules=2');
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        'https://khchao.com' + classicRoute
      );
      assert.equal(await page.locator('h1').textContent(), 'Proofreader Classic');
      const data = await page.locator('script[type="application/ld+json"]').allTextContents();
      assert.ok(
        data.some((raw) => {
          const d = JSON.parse(raw);
          return d['@type'] === 'VideoGame' && d.url.endsWith(classicRoute);
        })
      );
      assert.deepEqual(await page.evaluate(() => [...new Set(window.__classicContexts)]), ['2d']);
      assert.equal(await page.evaluate(() => Boolean(window.__proofreader)), false);
      assert.equal(await page.locator('[data-arcade-graphics]').count(), 0);
      assert.equal(await page.evaluate(() => window.__proofreaderClassic.state().time), 0);
      assert.equal(await page.locator('[data-proofclassic-sound]').textContent(), 'Sound off');
      const canvas = page.locator('[data-proofclassic-canvas]');
      await canvas.scrollIntoViewIfNeeded();
      await clickControl(page.locator('[data-arcade-primary]'));
      const initial = await page.evaluate(() => ({
        ...window.__proofreaderClassic.state().player,
      }));
      if (profile.touch) {
        const box = await canvas.boundingBox();
        const point = {
          pointerId: 41,
          pointerType: 'touch',
          clientX: box.x + box.width * 0.2,
          clientY: box.y + box.height * 0.6,
          button: 0,
        };
        await canvas.dispatchEvent('pointerdown', point);
        await canvas.dispatchEvent('pointermove', { ...point, clientY: point.clientY - 50 });
        const look = { ...point, pointerId: 42, clientX: box.x + box.width * 0.75 };
        await canvas.dispatchEvent('pointerdown', look);
        await canvas.dispatchEvent('pointermove', { ...look, clientX: look.clientX + 20 });
        await page.evaluate(() => window.__proofreaderClassic.tick(24));
        assert.ok(
          await page.evaluate(
            (angle) => window.__proofreaderClassic.state().player.angle > angle,
            initial.angle
          )
        );
        await canvas.dispatchEvent('pointercancel', point);
        await canvas.dispatchEvent('pointerup', look);
      } else {
        await canvas.focus();
        await page.keyboard.down('w');
        await page.evaluate(() => window.__proofreaderClassic.tick(24));
        await page.keyboard.up('w');
      }
      assert.ok(
        await page.evaluate(
          (x) => window.__proofreaderClassic.state().player.x > x + 0.1,
          initial.x
        )
      );
      const stopped = await page.evaluate(() => ({
        ...window.__proofreaderClassic.state().player,
      }));
      await page.evaluate(() => window.__proofreaderClassic.tick(24));
      assert.equal(
        await page.evaluate(() => window.__proofreaderClassic.state().player.x),
        stopped.x
      );
      const shots = await page.evaluate(() => window.__proofreaderClassic.state().shots);
      await clickControl(page.locator('[data-proofclassic-pulse]'));
      assert.ok(await page.evaluate((n) => window.__proofreaderClassic.state().shots > n, shots));
      await canvas.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${evidence}/${engine}-${profile.label}-playing.png` });
      await clickControl(page.locator('[data-proofclassic-pause]'));
      const time = await page.evaluate(() => window.__proofreaderClassic.state().time);
      const pixels = await canvas.evaluate((c) => c.toDataURL());
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => window.__proofreaderClassic.state().time), time);
      assert.equal(await canvas.evaluate((c) => c.toDataURL()), pixels);
      await page.evaluate(async () => {
        window.__proofreaderClassic.endRun();
        await window.__proofreaderClassic.share();
      });
      const shared = new URL(await page.evaluate(() => window.__classicShare.url));
      assert.equal(shared.pathname, classicRoute);
      assert.equal(shared.searchParams.get('rules'), '2');
      assert.equal(shared.searchParams.get('mode'), 'practice');
      assert.equal(shared.searchParams.get('stage'), '3');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
}

async function editionsAndFooter(browser, baseURL, engine) {
  const context = await newAuditContext(browser, {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => {
      if (!error.message.includes('Transition was aborted')) errors.push(error.message);
    });
    await ready(page);
    for (let trip = 0; trip < 2; trip++) {
      await page.locator('[data-proofclassic-canvas]').scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        window.__classicRetired = window.__proofreaderClassic;
        window.__proofreaderClassic.start();
      });
      await page.locator('.proofreader-editions a[href="/games/proofreader/"]').click();
      await page.waitForFunction(
        () => Boolean(window.__proofreader) && !window.__proofreaderClassic
      );
      assert.equal(await page.evaluate(() => window.__proofreaderClassicInstances), 0);
      assert.equal(await page.evaluate(() => window.__proofreaderInstances), 1);
      assert.equal(await page.evaluate(() => window.__classicRetired.isRunning()), false);
      const retired = await page.evaluate(() => window.__classicRetired.state().time);
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => window.__classicRetired.state().time), retired);
      await page.locator('.proofreader-editions a[href="/games/proofreader-classic/"]').click();
      await page.waitForFunction(
        () => Boolean(window.__proofreaderClassic) && !window.__proofreader
      );
      assert.equal(await page.evaluate(() => window.__proofreaderInstances), 0);
      assert.equal(await page.evaluate(() => window.__proofreaderClassicInstances), 1);
    }
    await page.getByRole('link', { name: 'Software', exact: true }).first().click();
    await page.waitForURL('**/software/');
    await page.waitForFunction(() => !window.__proofreaderClassic && !window.__proofreader);
    await page.getByRole('link', { name: 'Proofreader Classic', exact: true }).click();
    await page.waitForFunction(() => window.__proofreaderClassicInstances === 1);
    await page.goBack();
    await page.waitForURL('**/software/');
    await page.waitForFunction(() => !window.__proofreaderClassic);
    await page.goForward();
    await page.waitForFunction(() => window.__proofreaderClassicInstances === 1);
    for (const route of ['/', '/software/', '/research/', '/games/proofreader/', classicRoute]) {
      await page.goto(route, { waitUntil: 'networkidle' });
      await waitForPageReady(page);
      const footer = page.locator('.site-footer');
      for (const name of ['Deep Dives', 'Papers', 'NN Lab', 'Fun Lab', 'Photos', 'Projects', 'CV'])
        assert.equal(
          await footer.getByRole('link', { name, exact: true }).count(),
          0,
          `${route}: ${name} footer link remains`
        );
      for (const name of [
        'Research',
        'Publications',
        'Software',
        'Talks',
        'Teaching',
        'Posts',
        'News',
        'Algorithms',
        'Cell Lab',
        'Shorkie Lab',
        'Terminal',
        'Search',
      ])
        assert.equal(
          await footer.getByRole('link', { name, exact: true }).count(),
          1,
          `${route}: missing ${name}`
        );
      // Desktop and mobile header menus both retain this destination.
      assert.ok(await page.locator('header a[href="/deep_dives/"]').count() >= 1);
      if (route === '/') await footer.screenshot({ path: `${evidence}/${engine}-footer.png` });
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

await mkdir(evidence, { recursive: true });
const preview = process.env.GAME_UI_AUDIT_BASE_URL
  ? { baseURL: process.env.GAME_UI_AUDIT_BASE_URL, stop: async () => {} }
  : await startPreview({ port: 4398, route: classicRoute });
try {
  for (const engine of engines) {
    assert.ok({ chromium, webkit }[engine], `Unsupported browser: ${engine}`);
    const browser = await { chromium, webkit }[engine].launch({ headless: true });
    try {
      await migration(browser, preview.baseURL);
      console.log(
        `PASS ${engine}: original saves copied safely; corrupt and denied storage supported`
      );
      await controls(browser, preview.baseURL, engine);
      console.log(
        `PASS ${engine}: Canvas2D metadata, keyboard/touch aim/movement, pulse, pause, share`
      );
      await editionsAndFooter(browser, preview.baseURL, engine);
      console.log(
        `PASS ${engine}: edition lifecycle, history navigation, shared footer and header`
      );
    } finally {
      await browser.close();
    }
  }
  console.log(`Proofreader Classic audit passed. Evidence: ${evidence}`);
} finally {
  await preview.stop();
}
