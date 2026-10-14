/** Wait for fonts and the finite route transition, not ongoing game animation. */
export async function waitForPageReady(page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForFunction(() => {
    const transitioning = document.getAnimations().some(animation =>
      animation.playState === 'running' && animation.effect?.pseudoElement?.startsWith('::view-transition'));
    return !transitioning && Number(getComputedStyle(document.body).opacity) >= .99;
  });
}

/** Keep controls away from the sticky header; retain Playwright's hit-test gates. */
export async function centerControl(locator) {
  await locator.waitFor({ state: 'visible' });
  await locator.evaluate(async element => {
    await document.fonts.ready;
    element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const element = await locator.elementHandle();
  try {
    await locator.page().waitForFunction(element => {
      if (!element?.isConnected) return false;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        if (Number(getComputedStyle(ancestor).opacity) < .99) return false;
      }
      return true;
    }, element, { polling: 50 });
  } finally {
    await element?.dispose();
  }
}

export async function clickControl(locator) {
  await centerControl(locator);
  await locator.click();
}

/** Coordinates are measured only after scrolling and any placement-panel reflow. */
export async function pointOnSurface(locator, { x, y }, touch) {
  await centerControl(locator);
  const box = await locator.boundingBox();
  if (!box) throw new Error('Game surface has no bounding box');
  const position = { x: box.width * x, y: box.height * y };
  if (touch) await locator.tap({ position });
  else await locator.click({ position });
}
