import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright';
import { preview } from 'astro';

// Local mode uses a running server; --ci owns a preview of the already-built dist/.
const ci = process.argv.includes('--ci');
const baseURL = process.env.BACKGROUND_UI_BASE_URL || (ci ? 'http://127.0.0.1:4337' : 'http://127.0.0.1:4321');
const previewServer = ci ? await preview({ root: process.cwd(), server: { host: '127.0.0.1', port: 4337 } }) : null;
const artifacts = await mkdtemp(join(tmpdir(), 'khc-background-'));
const engines = process.env.BACKGROUND_UI_BROWSERS?.split(',') || ['chromium', 'webkit'];
const errors = [];
async function openAppearance(page) {
  const button = page.locator('[data-top-theme-btn]');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}
async function choose(page, kind, value) {
  await openAppearance(page);
  await page.locator(`button[data-background-${kind}="${value}"]`).click();
  await page.waitForFunction(() => document.documentElement.dataset.backgroundSwitching !== 'true');
}
async function frames(page, demo = false) {
  return page
    .locator(demo ? '[data-background-demo-canvas]' : '[data-art-bg-canvas]')
    .evaluate((c) => Number(c.dataset.bgTicks || 0));
}
async function still(page, demo = false) {
  await page.waitForTimeout(150);
  const before = await frames(page, demo);
  await page.waitForTimeout(400);
  assert.equal(await frames(page, demo), before, 'paused renderer must not continue drawing');
}
for (const name of engines) {
  const browser = await { chromium, webkit }[name].launch();
  try {
    for (const phone of [false, true]) {
      const label = `${name}-${phone ? 'phone' : 'desktop'}`;
      console.log(`[background-ui] ${label}`);
      const context = await browser.newContext({
        baseURL,
        viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        hasTouch: phone,
        isMobile: phone,
        deviceScaleFactor: phone ? 3 : 1,
      });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
      await page.goto('/?cell-audit=1');
      await page.waitForFunction(() => window.__khcCellsDebug?.snapshot().running);
      await choose(page, 'scene', 'flow');
      assert.equal(await page.locator('[data-site-bg-canvas]').isVisible(), false);
      assert.equal(await page.locator('[data-hero-canvas]').isVisible(), false);
      assert.equal(await page.evaluate(() => window.__khcCellsDebug.snapshot().attached), false);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1200);
      assert.ok((await frames(page)) > 5);
      await page.screenshot({ path: join(artifacts, `${label}-flow.png`) });
      await choose(page, 'motion', 'paused');
      await still(page);
      await choose(page, 'motion', 'calm');
      const start = await frames(page);
      await page.waitForTimeout(300);
      assert.ok((await frames(page)) > start);
      const scrollBefore = await page.evaluate(() => scrollY);
      await page.locator('[data-background-explore]').click();
      await page.locator('[data-background-dialog]').waitFor({ state: 'visible' });
      await still(page);
      await page.locator('[data-background-play]').click();
      await still(page, true);
      await page.locator('[data-background-vortex]').click();
      assert.match(
        await page.locator('[data-background-demo-status]').textContent(),
        /1 temporary/
      );
      await page.screenshot({ path: join(artifacts, `${label}-flow-demo.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-background-dialog]').isVisible(), false);
      assert.equal(
        await page.locator('[data-top-theme-btn]').evaluate((e) => e === document.activeElement),
        true
      );
      assert.equal(
        await page.evaluate(() => scrollY),
        scrollBefore,
        'opening a demo must preserve reading position'
      );

      await choose(page, 'scene', 'landscape');
      await choose(page, 'motion', 'ambient');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1500);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: join(artifacts, `${label}-landscape.png`) });
      await page.evaluate(() => window.__khcTheme.set('dark'));
      await page.screenshot({ path: join(artifacts, `${label}-landscape-dark.png`) });
      await page.evaluate(() => window.__khcCrt.set('amber'));
      await page.screenshot({ path: join(artifacts, `${label}-landscape-crt.png`) });
      await page.evaluate(() => {
        window.__khcCrt.set('off');
        window.__khcTheme.set('light');
      });
      await openAppearance(page);
      await page.locator('[data-background-explore]').click();
      await page.waitForFunction(() =>
        document
          .querySelector('[data-background-demo-status]')
          .textContent.includes('Gradient descent')
      );
      await page.locator('[data-background-play]').click();
      await page.locator('[data-background-reset]').click();
      await page.locator('[data-background-step]').click();
      assert.match(await page.locator('[data-background-demo-status]').textContent(), /1 steps/);
      await page.locator('[data-background-rate]').fill('0.1');
      await page.locator('[data-background-rate]').press('Tab');
      await page.locator('[data-background-x]').fill('-1');
      await page.locator('[data-background-y]').fill('-0.35');
      await page.locator('[data-background-start]').click();
      assert.match(
        await page.locator('[data-background-demo-status]').textContent(),
        /loss 0.0000/
      );
      await page.locator('[data-background-play]').click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: join(artifacts, `${label}-landscape-demo.png`) });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'page must not overflow horizontally'
      );
      await page.locator('[data-background-close]').click();

      await choose(page, 'scene', 'morph');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('[data-art-bg-canvas]')?.dataset.bgScene === 'morph');
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(700);
      assert.ok((await frames(page)) > 5, 'particle scene must animate');
      await page.screenshot({ path: join(artifacts, `${label}-morph-dna.png`) });
      for (const [stage, threshold] of [['cell', 0.43], ['signal', 0.9]]) {
        await page.evaluate((name) => {
          const element = document.querySelector(`[data-background-stage="${name}"]`);
          const rect = element.getBoundingClientRect();
          scrollTo({ top: rect.top + scrollY + rect.height / 2 - innerHeight / 2, behavior: 'instant' });
        }, stage);
        await page.waitForFunction((minimum) =>
          Number(document.querySelector('[data-art-bg-canvas]')?.dataset.bgProgress) > minimum,
          threshold
        );
        await page.waitForTimeout(900);
        const visiblePixels = await page.evaluate((name) => {
          const canvas = document.querySelector('[data-art-bg-canvas]');
          const window = document.querySelector(`[data-background-stage="${name}"]`).getBoundingClientRect();
          const ratio = canvas.width / canvas.clientWidth;
          const data = canvas.getContext('2d').getImageData(
            Math.max(0, Math.round(window.left * ratio)),
            Math.max(0, Math.round(window.top * ratio)),
            Math.min(canvas.width, Math.round(window.width * ratio)),
            Math.min(canvas.height, Math.round(window.height * ratio))
          ).data;
          let count = 0;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 10) count++;
          return count;
        }, stage);
        assert.ok(visiblePixels > 50, `${stage} form must be visible in its reading-safe window`);
        await page.screenshot({ path: join(artifacts, `${label}-morph-${stage}.png`) });
      }
      await openAppearance(page);
      await page.locator('[data-background-explore]').click();
      await page.locator('[data-background-dialog]').waitFor({ state: 'visible' });
      await page.locator('[data-background-scrub]').evaluate((input) => {
        input.value = '0.5';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      assert.match(await page.locator('[data-background-demo-status]').textContent(), /Cell membrane/);
      await page.locator('[data-background-form="1"]').click();
      assert.match(await page.locator('[data-background-demo-status]').textContent(), /expression signal/i);
      await still(page, true);
      await page.screenshot({ path: join(artifacts, `${label}-morph-demo.png`) });
      await page.locator('[data-background-close]').click();

      await choose(page, 'scene', 'off');
      assert.equal(await page.locator('[data-site-bg-canvas]').isVisible(), false);
      assert.equal(await page.locator('[data-art-bg-canvas]').isVisible(), false);
      assert.equal(await page.locator('[data-hero-canvas]').isVisible(), false);
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.backgroundScene === 'off');
      assert.equal(await page.locator('[data-hero-canvas]').isVisible(), false);
      await choose(page, 'scene', 'cells');
      await page.waitForFunction(() => window.__khcCellsDebug.snapshot().running);
      await choose(page, 'motion', 'paused');
      assert.equal(await page.evaluate(() => window.__khcCellsDebug.snapshot().running), false);
      assert.equal(await page.evaluate(() => window.__khcHeroDebug.snapshot().running), false);
      await choose(page, 'scene', 'landscape');
      await page.keyboard.press('Escape');
      // Exercise Astro client navigation rather than only hard reloads.
      await page.locator('a[href="/research/"]').filter({ visible: true }).first().click();
      await page.waitForURL('**/research/');
      await page.waitForFunction(
        () => document.querySelector('[data-art-bg-canvas]')?.hidden === false
      );
      await still(page);
      assert.equal(
        await page.evaluate(() => JSON.parse(localStorage.getItem('khc-background-v1')).motion),
        'paused'
      );
      await page.goto('/lab/?cell-audit=1');
      await page.waitForFunction(() => window.__khcCellsDebug?.snapshot().running);
      assert.equal(await page.evaluate(() => window.__khcCellsDebug.snapshot().mode), 'lab');
      await page.goto('/?cell-audit=1');
      await page.waitForFunction(
        () => document.querySelector('[data-art-bg-canvas]')?.hidden === false
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.backgroundScene),
        'landscape'
      );
      await still(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await choose(page, 'motion', 'ambient');
      await still(page);
      await page.locator('[data-background-explore]').click();
      await page.waitForTimeout(300);
      assert.equal(await page.locator('[data-background-play]').isDisabled(), true);
      await still(page, true);
      await page.locator('[data-background-step]').click();
      assert.match(await page.locator('[data-background-demo-status]').textContent(), /1 steps/);
      await page.keyboard.press('Escape');
      await choose(page, 'scene', 'morph');
      await page.keyboard.press('Escape');
      await still(page);
      await openAppearance(page);
      await page.locator('[data-background-explore]').click();
      assert.equal(await page.locator('[data-background-play]').isDisabled(), true);
      await still(page, true);
      await page.locator('[data-background-form="0.5"]').click();
      assert.match(await page.locator('[data-background-demo-status]').textContent(), /Cell membrane/);
      await page.locator('[data-background-close]').click();
      if (phone) {
        await page.setViewportSize({ width: 320, height: 568 });
        await openAppearance(page);
        await page.locator('button[data-background-scene="flow"]').focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(
          await page
            .locator('button[data-background-scene="landscape"]')
            .getAttribute('aria-checked'),
          'true'
        );
        await page.locator('[data-background-explore]').click();
        assert.ok(
          await page
            .locator('[data-background-dialog]')
            .evaluate((e) => e.scrollWidth <= e.clientWidth),
          'compact dialog must not overflow horizontally'
        );
        await page.locator('[data-background-close]').click();
      }
      await context.close();
    }
    // Storage failure must leave working in-memory controls, not crash startup.
    const context = await browser.newContext({ baseURL });
    await context.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new DOMException('Blocked', 'SecurityError');
      };
      Storage.prototype.setItem = () => {
        throw new DOMException('Blocked', 'SecurityError');
      };
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${name}-storage: ${e.message}`));
    await page.goto('/');
    await choose(page, 'scene', 'flow');
    assert.equal(await page.locator('[data-art-bg-canvas]').isVisible(), true);
    await context.close();
  } finally {
    await browser.close();
  }
}
assert.deepEqual(errors, [], 'browser runtime errors');
console.log(`[background-ui] Passed. Screenshots: ${artifacts}`);
await previewServer?.stop();
