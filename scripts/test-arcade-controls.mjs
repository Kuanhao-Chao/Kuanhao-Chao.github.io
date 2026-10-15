/** Small real-browser regression loop. Run against an owned dev/preview server. */
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { waitForPageReady } from './lib/gameAuditUi.mjs';

const baseURL = process.env.GAME_UI_AUDIT_BASE_URL ?? 'http://127.0.0.1:4321';
const engines = (process.env.ARCADE_TEST_BROWSERS ?? 'chromium').split(',');
const games = (process.env.ARCADE_TEST_GAMES ?? 'snake').split(',');
const registry = {
  snake: ['__snake', 'snake'],
  proofreader: ['__proofreader', 'proof'],
  'jetpack-joyride': ['__jetpackJoyride', 'jetpack'],
};
for (const engine of engines) {
  const browser = await { chromium, webkit }[engine].launch({ headless: true });
  try {
    for (const game of games) {
      const [api, prefix] = registry[game];
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      try {
        await page.goto(`${baseURL}/games/${game}/?seed=2026`, { waitUntil: 'networkidle' });
        await page.waitForFunction((name) => Boolean(window[name]), api);
        await waitForPageReady(page);
        await page.evaluate((name) => window[name].start(), api);
        const button = page.locator(`[data-${prefix}-pause]`);
        assert.equal(await page.evaluate((name) => window[name].state().status, api), 'playing');
        await button.click();
        assert.equal(
          await page.evaluate((name) => window[name].state().status, api),
          'paused',
          `${engine}/${game}: one Pause click must pause`
        );
        await button.click();
        assert.equal(
          await page.evaluate((name) => window[name].state().status, api),
          'playing',
          `${engine}/${game}: one Resume click must resume`
        );
        if (game === 'proofreader') {
          const surface = page.locator('[data-proof-canvas]');
          await surface.scrollIntoViewIfNeeded();
          const box = await surface.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          const before = await page.evaluate(() => window.__proofreader.state().shots);
          await page.keyboard.down('w');
          await page.evaluate(() => window.__proofreader.tick(120));
          const during = await page.evaluate(() => window.__proofreader.state().shots);
          assert.ok(during >= before + 2, 'movement cancelled held mouse fire');
          await page.mouse.up();
          await page.keyboard.up('w');
          await page.evaluate(() => window.__proofreader.tick(60));
          assert.equal(
            await page.evaluate(() => window.__proofreader.state().shots),
            during,
            'mouse release left firing stuck'
          );
        }
        if (game === 'jetpack-joyride') {
          const thrust = page.locator('[data-jetpack-thrust]');
          await thrust.focus();
          await page.keyboard.down(' ');
          assert.equal(
            await page.evaluate(() => window.__jetpackJoyride.state().flyer.thrusting),
            true
          );
          await page.keyboard.up(' ');
          assert.equal(
            await page.evaluate(() => window.__jetpackJoyride.state().flyer.thrusting),
            false,
            'focus change stranded keyboard button thrust'
          );
          await page.evaluate(() => window.dispatchEvent(new Event('blur')));
          assert.equal(await page.evaluate(() => window.__jetpackJoyride.state().status), 'paused');
        }
        await page.evaluate((name) => window[name].resume(), api);
        await page
          .locator('[data-arcade-bindings]')
          .evaluate((el) =>
            el.closest('details').scrollIntoView({ block: 'start', behavior: 'instant' })
          );
        assert.ok(
          await page.locator(`[data-${prefix}-canvas]`).evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.bottom <= 0 || r.top >= innerHeight;
          }),
          'offscreen probe did not move the canvas outside the viewport'
        );
        await page.waitForFunction((name) => window[name].state().status === 'paused', api, {
          timeout: 3000,
        });
        assert.equal(
          await page.locator('[data-game-root]').evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight;
          }),
          true,
          'offscreen probe must keep the game root visible'
        );
        console.log(`PASS ${engine}/${game}: pause/resume`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
