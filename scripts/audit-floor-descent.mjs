/** Local/manual only. This script never adds work to push CI. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { chromium, webkit } from 'playwright';
import { waitForPageReady, clickControl } from './lib/gameAuditUi.mjs';
import { driveFloorDescent } from './lib/floorDescentAgent.mjs';
import { startPreview } from './lib/previewServer.mjs';
const evidence = process.env.DESCENT_UI_EVIDENCE ?? '/tmp/khc-floor-descent';
await mkdir(evidence, { recursive: true });
async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
let preview;
const baseURL =
  process.env.DESCENT_UI_BASE_URL ??
  (preview = await startPreview({
    port: await availablePort(),
    route: '/games/100-floor-descent/',
  })).baseURL;
const browsers = (process.env.DESCENT_UI_BROWSERS ?? 'chromium,webkit').split(',');
const measurements = [];
async function ready(page, path = '?seed=42') {
  const response = await page.goto('/games/100-floor-descent/' + path, {
    waitUntil: 'networkidle',
  });
  assert.ok(response.ok(), 'Game route failed');
  await waitForPageReady(page);
  await page.waitForFunction(() => Boolean(window.__floorDescent));
}
async function presentation(browser, name, profile) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: profile.width, height: profile.height },
    hasTouch: profile.width < 900,
    deviceScaleFactor: profile.width < 900 ? 2 : 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await ready(page, `?mode=practice&seed=42&start=${profile.start}`);
    const root = page.locator('[data-descent-root]'),
      canvas = page.locator('[data-descent-canvas]');
    for (const theme of ['light', 'dark', 'nord', 'monokai', 'cyberdeck', 'parchment']) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${name}/${profile.width}/${theme}: horizontal overflow`
      );
    }
    for (const control of await root.locator('button,select,input[type=text]').all()) {
      if (!(await control.isVisible())) continue;
      const b = await control.boundingBox();
      assert.ok(
        b.height >= 43.5,
        `Control under 44 CSS pixels: ${await control.evaluate((e) => e.outerHTML)} ${JSON.stringify(b)}`
      );
    }
    await clickControl(page.locator('[data-descent-primary]'));
    await canvas.focus();
    await page.keyboard.down('ArrowRight');
    await page.evaluate(() => window.__floorDescent.tick(10));
    await page.keyboard.up('ArrowRight');
    const languageChange = await page.evaluate(() => {
      const before = window.__floorDescent.state(),
        select = document.querySelector('[data-descent-language]');
      select.value = 'zh-Hant';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { before, after: window.__floorDescent.state() };
    });
    assert.equal(languageChange.after.status, 'paused');
    assert.deepEqual(languageChange.before.player, languageChange.after.player);
    assert.equal(languageChange.before.time, languageChange.after.time);
    assert.equal(await root.getAttribute('lang'), 'zh-Hant');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.locator('[data-descent-primary]').textContent(), '繼續探險');
    await root.screenshot({ path: `${evidence}/${name}-${profile.width}-zh.png` });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__floorDescent));
    assert.equal(await root.getAttribute('lang'), 'zh-Hant', 'Locale did not survive reload');
    await page.locator('[data-descent-language]').selectOption('en');
    await clickControl(page.locator('[data-game-focus]'));
    const fit = await canvas.boundingBox(),
      viewport = page.viewportSize();
    assert.ok(
      fit.x >= 0 &&
        fit.x + fit.width <= viewport.width + 1 &&
        fit.y >= 0 &&
        fit.y + fit.height <= viewport.height + 1,
      `Focus cave was cropped: ${JSON.stringify(fit)}`
    );
    assert.ok(fit.height > 200, 'Focus cave too small');
    assert.ok(
      Math.abs(fit.width / fit.height - 0.7) < 0.005,
      'Focus view distorted the logical world'
    );
    const startBox = await page.locator('[data-descent-primary]').boundingBox();
    assert.ok(
      startBox.y >= fit.y && startBox.y + startBox.height <= fit.y + fit.height - 3,
      'Focus instruction card clipped the Start button'
    );
    await page.screenshot({ path: `${evidence}/${name}-${profile.width}-focus.png` });
    await page.keyboard.press('Escape');
    assert.equal(
      await page.evaluate(() => document.body.style.overflow === 'hidden'),
      false,
      'Focus exit locked page scroll'
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(
      () =>
        matchMedia('(prefers-reduced-motion: reduce)').matches &&
        window.__floorDescent.graphics().reducedEffects
    );
    assert.equal(await page.evaluate(() => window.__floorDescent.graphics().reducedEffects), true);
    await clickControl(page.locator('[data-descent-primary]'));
    const start = await page.evaluate(() => ({
      frames: window.__floorDescent.graphics().frames,
      time: window.__floorDescent.state().time,
    }));
    await page.waitForTimeout(500);
    const active = await page.evaluate(() => ({
      graphics: window.__floorDescent.graphics(),
      time: window.__floorDescent.state().time,
    }));
    assert.ok(active.time > start.time, 'Animation did not advance under reduced motion');
    assert.ok(
      active.graphics.width <= 840 && active.graphics.height <= 1200,
      'Unbounded backing buffer'
    );
    measurements.push({
      browser: name,
      ...profile,
      viewportWidth: profile.width,
      viewportHeight: profile.height,
      environment: 'Headless desktop; phone dimensions and touch are emulated',
      sampleFrames: active.graphics.frames - start.frames,
      wallMs: 500,
      ...active.graphics,
    });
    await canvas.screenshot({
      path: `${evidence}/${name}-${profile.width}-region-${profile.start}-playing.png`,
    });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.evaluate(() => window.__floorDescent.state().status), 'paused');
    await page.waitForTimeout(80);
    const frozen = await page.evaluate(() => window.__floorDescent.graphics().frames);
    await page.waitForTimeout(120);
    assert.equal(
      await page.evaluate(() => window.__floorDescent.graphics().frames),
      frozen,
      'Paused game kept rendering'
    );
    assert.equal(await page.evaluate(() => window.__floorDescent.graphics().running), false);
    await page
      .locator('[data-descent-canvas]')
      .screenshot({ path: `${evidence}/${name}-${profile.width}-region-${profile.start}.png` });
    await page.locator('[data-descent-share]').click();
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-descent-copy]').hidden ||
        document.querySelector('[data-descent-status]').textContent.includes('Course link copied')
    );
    const share = (await page.locator('[data-descent-copy]').isVisible())
      ? await page.locator('[data-descent-copy-value]').inputValue()
      : await page.locator('[data-descent-status]').textContent();
    assert.ok(
      share.includes('rules=1') || share.includes('Course link copied'),
      'Share link missing rules version'
    );
    if (profile.width === 390) {
      await page.locator('[data-descent-mode]').selectOption('remix');
      await clickControl(page.locator('[data-descent-primary]'));
      const button = page.locator('[data-descent-right]'),
        b = await button.boundingBox();
      const pointer = {
        pointerId: 31,
        pointerType: 'touch',
        clientX: b.x + b.width / 2,
        clientY: b.y + b.height / 2,
      };
      await button.dispatchEvent('pointerdown', pointer);
      await page
        .locator('[data-descent-dash]')
        .dispatchEvent('pointerdown', { pointerId: 32, pointerType: 'touch' });
      await page.evaluate(() => window.__floorDescent.tick(3));
      assert.ok(
        await page.evaluate(() => window.__floorDescent.state().player.dashCooldown > 3.8),
        'Second-finger dash failed'
      );
      await button.dispatchEvent('pointermove', { ...pointer, clientX: b.x - 20 });
      await button.dispatchEvent('pointercancel', pointer);
      await page.evaluate(() => window.__floorDescent.tick(40));
      assert.ok(
        Math.abs(await page.evaluate(() => window.__floorDescent.state().player.vx)) < 1,
        'Released touch steering stuck'
      );
      await page.evaluate(() => window.__floorDescent.pause());
      await page.locator('.descent-settings summary').click();
      await page.locator('[data-descent-touch-mode]').selectOption('halves');
      await clickControl(page.locator('[data-descent-primary]'));
      const box = await canvas.boundingBox();
      await canvas.dispatchEvent('pointerdown', {
        pointerId: 41,
        pointerType: 'touch',
        clientX: box.x + box.width * 0.2,
        clientY: box.y + box.height * 0.5,
      });
      await page.evaluate(() => window.__floorDescent.tick(12));
      assert.ok(
        await page.evaluate(() => window.__floorDescent.state().player.vx < 0),
        'Optional half-cave touch failed'
      );
      await canvas.dispatchEvent('pointercancel', { pointerId: 41, pointerType: 'touch' });
      await page.evaluate(() => window.__floorDescent.pause());
    }
    await page.evaluate(() => window.__floorDescent.resume());
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
    );
    await page.waitForFunction(() => window.__floorDescent.state().status === 'paused');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.getByRole('link', { name: 'Software', exact: true }).first().click();
    await page.waitForURL('**/software/');
    await page.waitForFunction(() => !window.__floorDescent);
    assert.equal(await page.evaluate(() => window.__floorDescentInstances), 0);
    await page.getByRole('link', { name: '100-Floor Descent', exact: true }).first().click();
    await page.waitForURL('**/games/100-floor-descent/');
    await page.waitForFunction(() => Boolean(window.__floorDescent));
    assert.equal(await page.evaluate(() => window.__floorDescentInstances), 1);
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${name}/${profile.width}: themes, bilingual persistence, Focus fit, reduced motion, input, lifecycle`
    );
  } catch (error) {
    await page
      .screenshot({ path: `${evidence}/${name}-${profile.width}-failure.png`, fullPage: true })
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
try {
  for (const name of browsers) {
    assert.ok({ chromium, webkit }[name], `Unknown browser: ${name}`);
    const browser = await { chromium, webkit }[name].launch({ headless: true });
    try {
      const page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 1000 } });
      page.setDefaultTimeout(12000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/games/100-floor-descent/?seed=42', { waitUntil: 'networkidle' });
      await waitForPageReady(page);
      await page.waitForFunction(() => Boolean(window.__floorDescent));
      const canvas = page.locator('[data-descent-canvas]');
      await clickControl(page.locator('[data-descent-primary]'));
      await canvas.focus();
      const x = await page.evaluate(() => window.__floorDescent.state().player.x);
      await page.keyboard.down('ArrowRight');
      await page.evaluate(() => window.__floorDescent.tick(20));
      await page.keyboard.up('ArrowRight');
      assert.ok(await page.evaluate((x) => window.__floorDescent.state().player.x > x + 20, x));
      const choosingLanguage = await page.evaluate(() => {
        const before = window.__floorDescent.state();
        document.querySelector('[data-descent-language]').focus({ preventScroll: true });
        return { before, after: window.__floorDescent.state() };
      });
      assert.equal(
        choosingLanguage.after.status,
        'paused',
        'Opening language controls should pause before a choice is made'
      );
      assert.deepEqual(choosingLanguage.before.player, choosingLanguage.after.player);
      assert.equal(choosingLanguage.before.time, choosingLanguage.after.time);
      await page.evaluate(() => window.__floorDescent.resume());
      await clickControl(page.locator('[data-descent-pause]'));
      assert.equal(await page.evaluate(() => window.__floorDescent.state().status), 'paused');
      const time = await page.evaluate(() => window.__floorDescent.state().time);
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => window.__floorDescent.state().time), time);
      assert.deepEqual(errors, []);
      await page
        .locator('[data-game-root]')
        .screenshot({ path: `${evidence}/${name}-desktop.png` });
      console.log(`PASS ${name}: keyboard steering, pause, stopped clock`);
      if (!process.argv.includes('--quick')) {
        await page.locator('[data-descent-mode]').selectOption('trial');
        await clickControl(page.locator('[data-descent-primary]'));
        const finish = await page.evaluate(driveFloorDescent);
        assert.equal(finish.status, 'won', JSON.stringify(finish));
        assert.ok(finish.seconds > 180 && finish.seconds < 300);
        const saved = await page.evaluate(() =>
          JSON.parse(localStorage.getItem('khc-floor-descent-v1-records'))
        );
        assert.ok(
          saved.trials.some(
            (r) => r.seed === 42 && r.floor === 100 && r.seconds === finish.seconds
          ),
          'Trial finish not saved'
        );
        await page
          .locator('[data-descent-canvas]')
          .screenshot({ path: `${evidence}/${name}-trial-finish.png` });
        console.log(`PASS ${name}: input-only 100-floor Trial`, JSON.stringify(finish));
      }
      await page.close();
      for (const profile of process.argv.includes('--quick')
        ? [{ width: 390, height: 844, start: 40 }]
        : [
            { width: 1440, height: 1000, start: 0 },
            { width: 1024, height: 900, start: 20 },
            { width: 390, height: 844, start: 40 },
            { width: 320, height: 720, start: 80 },
            { width: 844, height: 390, start: 60 },
          ])
        await presentation(browser, name, profile);
      const restricted = await browser.newContext({
        baseURL,
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      });
      await restricted.addInitScript(() =>
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('Denied', 'SecurityError');
          },
        })
      );
      const denied = await restricted.newPage(),
        deniedErrors = [];
      denied.on('pageerror', (e) => deniedErrors.push(e.message));
      await ready(denied);
      assert.ok(await denied.locator('[data-descent-notice]').isVisible());
      await clickControl(denied.locator('[data-descent-primary]'));
      await denied.evaluate(() => window.__floorDescent.tick(12));
      assert.ok(await denied.evaluate(() => window.__floorDescent.state().time > 0));
      assert.deepEqual(deniedErrors, [], 'Storage-denied page threw a runtime error');
      await restricted.close();
      console.log(`PASS ${name}: storage-denied fallback`);
    } finally {
      await browser.close();
    }
  }
  await writeFile(`${evidence}/measurements.json`, JSON.stringify(measurements, null, 2));
  console.log(`100-Floor Descent audit passed. Evidence: ${evidence}`);
} finally {
  await preview?.stop();
}
