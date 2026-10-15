/** Local/manual only: actual input witnesses for all eighteen campaign stages. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { startPreview } from './lib/previewServer.mjs';
import { clickControl, waitForPageReady } from './lib/gameAuditUi.mjs';
import { driveProofreader3D } from './lib/proofreaderAgent.mjs';

const registry = [
  { slug: 'proofreader', game: 'proofreader', api: '__proofreader', prefix: 'proof' },
  { slug: 'snake', game: 'snake', api: '__snake', prefix: 'snake' },
  { slug: 'jetpack-joyride', game: 'jetpack', api: '__jetpackJoyride', prefix: 'jetpack' },
];
const evidence = process.env.ARCADE_UI_EVIDENCE ?? '/tmp/khc-arcade-campaigns';

/** Reads state, issues legal inputs, never changes health/position or forces wins.
 * These deliberately precise witnesses establish completion, not human balance.
 */
function campaignAgent({ game, api: name }) {
  const api = window[name];
  const dirs = [
    ['right', 1, 0],
    ['down', 0, 1],
    ['left', -1, 0],
    ['up', 0, -1],
  ];
  function path(start, goal, width, height, blocked, wrap = false) {
    const queue = [{ x: start.x, y: start.y, first: null }],
      seen = new Set([`${start.x},${start.y}`]);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      if (p.x === goal.x && p.y === goal.y) return p.first;
      for (const [dir, dx, dy] of dirs) {
        let x = p.x + dx,
          y = p.y + dy;
        if (wrap) {
          x = (x + width) % width;
          y = (y + height) % height;
        }
        const key = `${x},${y}`;
        if (x < 0 || y < 0 || x >= width || y >= height || seen.has(key) || blocked.has(key))
          continue;
        seen.add(key);
        queue.push({ x, y, first: p.first ?? { x, y, dir } });
      }
    }
    return null;
  }
  let encounter = -1,
    waitY = 0;
  for (let i = 0; i < 16000 && api.state().status === 'playing'; i++) {
    const s = api.state();
    if (game === 'snake') {
      const blocked = new Set(
        [...s.obstacles, ...s.snake.slice(1, -1)].map((p) => `${p.x},${p.y}`)
      );
      const next =
        path(s.snake[0], s.bonus ?? s.food, s.cols, s.rows, blocked, s.wrap) ??
        path(s.snake[0], s.snake.at(-1), s.cols, s.rows, blocked, s.wrap);
      if (!next)
        return { status: s.status, error: 'No safe input path', iteration: i, score: s.score };
      api.turn(next.dir);
      api.tick();
    } else {
      if (encounter !== s.encounters) {
        encounter = s.encounters;
        waitY = s.flyer.y;
      }
      const target = s.missiles.some((m) => m.phase === 'warn' && m.timer > 400) ? waitY : s.safeY;
      const desired = Math.max(-360, Math.min(360, (target - s.flyer.y) * 5));
      api.setThrust(s.flyer.vy > desired);
      api.tick(1);
    }
  }
  const s = api.state();
  return {
    status: s.status,
    score: s.score,
    time: s.elapsedMs / 1000,
    encounters: s.encounters,
    certified: s.certified,
  };
}

async function campaignCheck(browser, baseURL, engine, game) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`/games/${game.slug}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction((name) => Boolean(window[name]), game.api);
    await waitForPageReady(page);
    if (process.env.ARCADE_UI_DIFFICULTY === 'expert')
      await page.locator('[data-arcade-difficulty]').selectOption('expert');
    await clickControl(page.locator('[data-arcade-primary]'));
    for (let stage = 1; stage <= 6; stage++) {
      const result =
        game.game === 'proofreader'
          ? await page.evaluate(driveProofreader3D)
          : await page.evaluate(campaignAgent, game);
      console.log(`[arcade] ${engine}/${game.slug}/stage-${stage}`, JSON.stringify(result));
      assert.equal(
        result.status,
        'won',
        `${engine}/${game.slug}/stage-${stage}: ${JSON.stringify(result)}`
      );
      const progress = await page.evaluate(
        (id) =>
          JSON.parse(localStorage.getItem(`khc-arcade-${id}-v${id === 'proofreader' ? 3 : 2}`)),
        game.game
      );
      assert.ok(progress.cleared.includes(stage), 'clear was not saved');
      assert.equal(progress.unlocked, Math.min(6, stage + 1));
      if ([1, 6].includes(stage))
        await page
          .locator('[data-game-root]')
          .screenshot({ path: `${evidence}/${engine}-${game.slug}-stage-${stage}.png` });
      if (stage < 6) await clickControl(page.locator('[data-arcade-next]'));
    }
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction((name) => Boolean(window[name]), game.api);
    assert.equal(
      await page.locator('[data-arcade-stage] option:disabled').count(),
      0,
      'unlocks did not survive reload'
    );
    assert.equal(
      await page.locator('[data-arcade-palette] option:disabled').count(),
      0,
      'cosmetics did not unlock'
    );
    assert.deepEqual(errors, []);
  } catch (error) {
    await page
      .screenshot({ path: `${evidence}/${engine}-${game.slug}-failure.png` })
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

async function presentationCheck(browser, baseURL, engine, game, quick) {
  for (const width of quick ? [390] : [1440, 390, 320, 844]) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width, height: width === 844 ? 390 : width === 1440 ? 1000 : 844 },
      hasTouch: width !== 1440,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(`/games/${game.slug}/?mode=practice&stage=3`, { waitUntil: 'networkidle' });
      await page.waitForFunction((name) => Boolean(window[name]), game.api);
      await waitForPageReady(page);
      for (const theme of ['light', 'dark', 'parchment', 'nord', 'monokai', 'cyberdeck']) {
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
          document.dispatchEvent(new CustomEvent('khc:theme-change', { detail: { theme: t } }));
        }, theme);
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${engine}/${game.slug}/${width}/${theme}: overflow`
        );
        for (const control of await page
          .locator('.arcade-controls button, .arcade-fields select, .arcade-action-row button')
          .all()) {
          if (!(await control.isVisible())) continue;
          const box = await control.boundingBox();
          if (box) assert.ok(box.height >= 43.5, `small control: ${await control.textContent()}`);
        }
      }
      await clickControl(page.locator('[data-arcade-primary]'));
      const surface = page.locator(`[data-${game.prefix}-canvas]`);
      await surface.scrollIntoViewIfNeeded();
      if (game.game === 'snake') {
        await clickControl(page.getByRole('button', { name: 'Steer up', exact: true }));
        await page.evaluate(() => window.__snake.tick());
        assert.equal(await page.evaluate(() => window.__snake.state().dir), 'up');
      } else {
        const control = page.locator(
          game.game === 'jetpack' ? '[data-jetpack-thrust]' : '[data-proof-fire]'
        );
        await control.scrollIntoViewIfNeeded();
        const box = await control.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(100);
        await page.mouse.up();
        if (game.game === 'jetpack')
          assert.equal(
            await page.evaluate(() => window.__jetpackJoyride.state().flyer.thrusting),
            false
          );
      }
      await clickControl(page.locator(`[data-${game.prefix}-pause]`));
      assert.equal(await page.evaluate((name) => window[name].state().status, game.api), 'paused');
      const before =
        game.game === 'proofreader'
          ? await page.evaluate(() =>
              JSON.stringify({
                frames: window.__proofreader.graphics().frames,
                time: window.__proofreader.state().time,
              })
            )
          : await surface.evaluate((c) => c.toDataURL());
      await page.waitForTimeout(180);
      assert.equal(
        game.game === 'proofreader'
          ? await page.evaluate(() =>
              JSON.stringify({
                frames: window.__proofreader.graphics().frames,
                time: window.__proofreader.state().time,
              })
            )
          : await surface.evaluate((c) => c.toDataURL()),
        before,
        'paused pixels kept animating'
      );
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await clickControl(page.locator('[data-game-focus]'));
      assert.equal(await page.locator('.game-focus-view').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if ([390, 1440].includes(width))
        await page.screenshot({ path: `${evidence}/${engine}-${game.slug}-${width}-focus.png` });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.game-focus-view').count(), 0);
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
      assert.deepEqual(errors, []);
      console.log(
        `[arcade] ${engine}/${game.slug}/${width}: six themes, controls, paused pixels, focus exit`
      );
    } finally {
      await context.close();
    }
  }
}

const quick = process.argv.includes('--quick');
const engines = (process.env.ARCADE_UI_BROWSERS ?? (quick ? 'chromium' : 'chromium,webkit'))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const filter = process.env.ARCADE_UI_GAMES?.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (!engines.length || engines.some((engine) => !['chromium', 'webkit'].includes(engine)))
  throw new Error('ARCADE_UI_BROWSERS must select chromium and/or webkit');
if (
  filter &&
  (!filter.length || filter.some((slug) => !registry.some((game) => game.slug === slug)))
)
  throw new Error('ARCADE_UI_GAMES must select known game slugs');
if (process.argv.includes('--campaigns-only') && process.argv.includes('--presentation-only'))
  throw new Error('Choose campaigns-only OR presentation-only, not both');
await mkdir(evidence, { recursive: true });
let preview;
try {
  preview = process.env.GAME_UI_AUDIT_BASE_URL
    ? { baseURL: process.env.GAME_UI_AUDIT_BASE_URL, stop: async () => {} }
    : await startPreview({ port: 4399, route: '/games/proofreader/' });
  for (const engine of engines) {
    const browser = await { chromium, webkit }[engine].launch({ headless: true });
    try {
      for (const game of registry.filter((g) => !filter || filter.includes(g.slug))) {
        if (!process.argv.includes('--presentation-only'))
          await campaignCheck(browser, preview.baseURL, engine, game);
        if (!process.argv.includes('--campaigns-only'))
          await presentationCheck(browser, preview.baseURL, engine, game, quick);
      }
    } finally {
      await browser.close();
    }
  }
  console.log(`Arcade campaign audit passed. Evidence: ${evidence}`);
} finally {
  await preview?.stop();
}
