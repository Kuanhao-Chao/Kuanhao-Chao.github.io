import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { webkit } from 'playwright';
import { startPreview } from './previewServer.mjs';
import { checkDinoPauseResume, checkPhagePlacement, checkGenomeKeyboardSteering } from './gameAuditActions.mjs';
import { waitForPageReady, clickControl } from './gameAuditUi.mjs';

let preview;
let browser;
let baseURL;
before(async () => {
  // CI owns a built preview. Locally an existing dev server can be reused when
  // there is not enough disk space for another dist build; it is never stopped.
  baseURL = process.env.GAME_UI_TEST_BASE_URL;
  if (!baseURL) {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    preview = await startPreview({ port, route: '/games/dino-run/' });
    baseURL = preview.baseURL;
  }
  browser = await webkit.launch({ headless: true });
});
after(async () => {
  try { await browser?.close(); } finally { await preview?.stop(); }
});

test('Genome Jumper keyboard start survives blur while acquiring game focus', { timeout: 20000 }, async () => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  try {
    await page.goto('/games/genome-jumper/?seed=2026');
    await page.waitForFunction(() => Boolean(window.__genomeJumper));
    await waitForPageReady(page);
    await page.evaluate(() => {
      // Exercise the real suspension listener at the same input boundary that
      // failed on CI, without reaching into the controller's paused flags.
      document.querySelector('[data-game-root]').addEventListener('focus', () => {
        window.dispatchEvent(new Event('blur'));
      }, { once: true });
    });
    await checkGenomeKeyboardSteering(page);
    assert.equal(await page.evaluate(() => window.__genomeJumper.state().status), 'playing');
  } finally {
    await context.close();
  }
});

test('Dino pause audit still exercises Pause after a legitimate blur auto-pause', { timeout: 20000 }, async () => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  try {
    await page.goto('/games/dino-run/?seed=2026');
    await page.waitForFunction(() => Boolean(window.__dinoRun));
    await waitForPageReady(page);
    await page.locator('[data-dino-jump]').click();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.locator('[data-dino-pause]').getAttribute('aria-label'), 'Resume');
    assert.equal(await page.evaluate(() => window.__dinoRun.isRunning()), false);
    await checkDinoPauseResume(page);
  } finally {
    await context.close();
  }
});

test('Phage touch preview, confirmation, and inspection survive mobile layout changes', { timeout: 30000 }, async () => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  try {
    await page.goto('/games/phage-defense/');
    await page.waitForFunction(() => Boolean(window.__phageDefense));
    await waitForPageReady(page);
    await checkPhagePlacement(page, true);
    await page.setViewportSize({ width: 430, height: 740 });
    await page.locator('[data-phage-tower-select]').selectOption('');
    await checkTowerInspectionAfterResize(page);
  } finally {
    await context.close();
  }
});

async function checkTowerInspectionAfterResize(page) {
  // The accessible picker must select the same defense after its canvas resizes.
  const id = await page.evaluate(() => window.__phageDefense.state().towers[0].id);
  await page.locator('[data-phage-tower-select]').selectOption(id);
  assert.equal(await page.locator('[data-selected-tower-panel]').isVisible(), true);
}

test('a real gameplay control is not activated during its ancestor content fade', { timeout: 20000 }, async () => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  try {
    await page.goto('/games/dino-run/?seed=2026');
    await page.waitForFunction(() => Boolean(window.__dinoRun));
    await waitForPageReady(page);
    await page.locator('.page-body').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.page-body')).opacity) >= .99);
    await page.evaluate(() => {
      const content = document.querySelector('.page-body');
      content.style.transition = 'none';
      content.style.opacity = '.1';
      document.querySelector('[data-dino-jump]').addEventListener('click', () => {
        window.__gameOpacityAtActivation = Number(getComputedStyle(content).opacity);
      }, { capture: true, once: true });
      setTimeout(() => { content.style.opacity = '1'; }, 750);
    });
    await clickControl(page.locator('[data-dino-jump]'));
    assert.equal(await page.evaluate(() => window.__gameOpacityAtActivation), 1, 'Gameplay started before the actual content fade finished');
    assert.equal(await page.evaluate(() => window.__dinoRun.status()), 'playing');
  } finally {
    await context.close();
  }
});

test('Dino Pause and Resume survive a held press while animation frames refresh the HUD', { timeout: 20000 }, async () => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  try {
    await page.goto('/games/dino-run/?seed=2026');
    await page.waitForFunction(() => Boolean(window.__dinoRun));
    await waitForPageReady(page);
    await clickControl(page.locator('[data-dino-jump]'));
    const pause = page.locator('[data-dino-pause]');
    // Keep all native actionability checks, but allow real HUD frames between
    // mousedown and mouseup. Replacing textContent mid-press loses WebKit clicks.
    await pause.click({ delay: 250 });
    assert.equal(await page.evaluate(() => window.__dinoRun.status()), 'playing');
    assert.equal(await pause.getAttribute('aria-label'), 'Resume', 'Held Pause press was swallowed during HUD refresh');
    assert.equal(await page.evaluate(() => window.__dinoRun.isRunning()), false);
    await pause.click({ delay: 250 });
    assert.equal(await pause.getAttribute('aria-label'), 'Pause', 'Held Resume press was swallowed during HUD refresh');
    assert.equal(await page.evaluate(() => window.__dinoRun.isRunning()), true);
  } finally {
    await context.close();
  }
});

for (const game of [
  { slug: 'genome-jumper', api: '__genomeJumper', control: 'jumper' },
  { slug: 'snake', api: '__snake', control: 'snake' },
  { slug: 'proofreader', api: '__proofreader', control: 'proof' },
  { slug: 'phage-defense', api: '__phageDefense', control: 'phage' },
  { slug: 'crispr-commander', api: '__crisprCommander', control: 'crispr' },
  { slug: 'tetris', api: '__tetris', control: 'tetris' },
]) {
  test(`${game.slug} Pause and Resume survive held presses during HUD refresh`, { timeout: 20000 }, async () => {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    try {
      await page.goto(`/games/${game.slug}/?seed=2026`);
      await page.waitForFunction(name => Boolean(window[name]), game.api);
      await waitForPageReady(page);
      await clickControl(page.locator(`[data-${game.control}-${game.control === 'crispr' ? 'start' : 'restart'}]`));
      const pause = page.locator(`[data-${game.control}-pause]`);
      await pause.click({ delay: 250 });
      assert.equal(await pause.textContent(), 'Resume', 'Held Pause press was swallowed during HUD refresh');
      assert.equal(await page.evaluate(name => {
        const api = window[name];
        return api.isRunning ? api.isRunning() : 'isPaused' in api.state() ? !api.state().isPaused : api.state().status === 'playing';
      }, game.api), false);
      await pause.click({ delay: 250 });
      assert.equal(await pause.textContent(), 'Pause', 'Held Resume press was swallowed during HUD refresh');
      assert.equal(await page.evaluate(name => {
        const api = window[name];
        return api.isRunning ? api.isRunning() : 'isPaused' in api.state() ? !api.state().isPaused : api.state().status === 'playing';
      }, game.api), true);
    } finally {
      await context.close();
    }
  });
}
