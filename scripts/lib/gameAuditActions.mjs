import assert from 'node:assert/strict';
import { clickControl, pointOnSurface } from './gameAuditUi.mjs';

/** Exercise keyboard steering without mistaking an auto-paused run for play. */
export async function checkGenomeKeyboardSteering(page) {
  await page.locator('[data-game-root]').focus();
  if (await page.evaluate(() => window.__genomeJumper.state().status === 'paused')) {
    await clickControl(page.locator('[data-jumper-pause]'));
    await page.locator('[data-game-root]').focus();
  }
  await page.keyboard.down('ArrowRight');
  try {
    await page.waitForFunction(() => window.__genomeJumper.state().status === 'playing' && window.__genomeJumper.state().steering === 1);
    await page.evaluate(() => window.__genomeJumper.tick(12));
    assert.ok(await page.evaluate(() => window.__genomeJumper.state().player.vx > 0), 'Keyboard steering did not accelerate right');
  } finally {
    await page.keyboard.up('ArrowRight');
  }
}

/** Exercise the real pause control, observing the public runner state. */
export async function checkDinoPauseResume(page) {
  const pause = page.locator('[data-dino-pause]');
  // Blur legitimately auto-pauses. Resume explicitly before testing Pause; a
  // manual physics tick is not evidence that the animation loop is running.
  if (await pause.getAttribute('aria-label') === 'Resume') await clickControl(pause);
  await page.waitForFunction(() => window.__dinoRun.isRunning());
  assert.equal(await pause.getAttribute('aria-label'), 'Pause');
  await clickControl(pause);
  await page.waitForFunction(() => window.__dinoRun.status() === 'playing' && !window.__dinoRun.isRunning());
  assert.equal(await pause.getAttribute('aria-label'), 'Resume');
  const distance = await page.evaluate(() => window.__dinoRun.state().distance);
  // Sample over elapsed real time, without the manual tick API which bypasses pause.
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__dinoRun.state().distance), distance, 'Paused Dino distance kept advancing');
  await clickControl(pause);
  await page.waitForFunction(() => window.__dinoRun.isRunning());
  await page.waitForFunction(before => window.__dinoRun.state().distance > before, distance);
  assert.equal(await pause.getAttribute('aria-label'), 'Pause');
}

/** Test preview → touch confirmation → inspection through actual UI controls. */
export async function checkPhagePlacement(page, touch) {
  const canvas = page.locator('[data-phage-canvas]');
  await clickControl(page.locator('[data-phage-next-wave]'));
  await page.waitForFunction(() => window.__phageDefense.state().currentWave === 1);
  await clickControl(page.locator('[data-tower-type="restriction_enzyme"]'));
  await pointOnSurface(canvas, { x: .3, y: .7 }, touch);
  if (touch) {
    assert.equal(await page.evaluate(() => window.__phageDefense.state().towers.length), 0, 'Touch preview deployed before confirmation');
    await clickControl(page.locator('[data-phage-confirm]'));
  }
  await page.waitForFunction(() => window.__phageDefense.state().towers.length === 1);
  await pointOnSurface(canvas, { x: .3, y: .7 }, touch);
  await page.locator('[data-selected-tower-panel]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-phage-tower-select]').inputValue(), await page.evaluate(() => window.__phageDefense.state().towers[0].id));
}
