import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { webkit } from 'playwright';
import { startPreview } from './previewServer.mjs';
import { checkDinoPauseResume, checkPhagePlacement } from './gameAuditActions.mjs';
import { waitForPageReady } from './gameAuditUi.mjs';

let preview;
let browser;
before(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  preview = await startPreview({ port, route: '/games/dino-run/' });
  browser = await webkit.launch({ headless: true });
});
after(async () => {
  try { await browser?.close(); } finally { await preview?.stop(); }
});

test('Dino pause audit still exercises Pause after a legitimate blur auto-pause', { timeout: 20000 }, async () => {
  const context = await browser.newContext({ baseURL: preview.baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
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
  const context = await browser.newContext({ baseURL: preview.baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
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
