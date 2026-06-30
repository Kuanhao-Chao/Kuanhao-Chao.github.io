import { chromium } from 'playwright';

const url = 'http://127.0.0.1:4326/posts/splam/';
const cases = [
  { name: 'desktop-light', width: 1440, height: 1000, theme: 'light' },
  { name: 'desktop-dark', width: 1440, height: 1000, theme: 'dark' },
  { name: 'mobile-light', width: 390, height: 844, theme: 'light' },
  { name: 'mobile-dark', width: 390, height: 844, theme: 'dark' },
];

const browser = await chromium.launch({ headless: true });
const failures = [];

for (const testCase of cases) {
  const page = await browser.newPage({ viewport: { width: testCase.width, height: testCase.height } });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.addInitScript((theme) => localStorage.setItem('khc-theme', theme), testCase.theme);
  await page.goto(url, { waitUntil: 'networkidle' });

  const visualizations = page.locator('.splam-viz');
  const count = await visualizations.count();
  if (count !== 4) failures.push(`${testCase.name}: expected 4 visualizations, found ${count}`);

  const expectedSteps = [5, 5, 4, 6];
  for (let index = 0; index < count; index += 1) {
    const root = visualizations.nth(index);
    const jumps = root.locator('[data-wgi-jump]');
    const jumpCount = await jumps.count();
    if (jumpCount !== expectedSteps[index]) failures.push(`${testCase.name}: visualization ${index + 1} has ${jumpCount} steps`);

    await jumps.last().click();
    const position = await root.locator('[data-wgi-pos]').textContent();
    if (position?.trim() !== `${expectedSteps[index]} / ${expectedSteps[index]}`) {
      failures.push(`${testCase.name}: visualization ${index + 1} final position is ${position}`);
    }
    const visibleScenes = await root.locator('[data-wgi-step]:visible').count();
    if (visibleScenes !== 1) failures.push(`${testCase.name}: visualization ${index + 1} has ${visibleScenes} visible scenes`);

    await root.locator('[data-wgi-reset]').click();
    await root.locator('[data-wgi-next]').focus();
    await page.keyboard.press('ArrowRight');
    if ((await root.locator('[data-wgi-pos]').textContent())?.trim() !== `2 / ${expectedSteps[index]}`) {
      failures.push(`${testCase.name}: visualization ${index + 1} keyboard navigation failed`);
    }

    const play = root.locator('[data-wgi-play]');
    await play.click();
    if ((await play.getAttribute('aria-pressed')) !== 'true') failures.push(`${testCase.name}: visualization ${index + 1} did not start playing`);
    await play.click();
    if ((await play.getAttribute('aria-pressed')) !== 'false') failures.push(`${testCase.name}: visualization ${index + 1} did not pause`);
    await jumps.last().click();
  }

  const candidate = visualizations.first();
  const selector = candidate.locator('[data-splam-mode]');
  for (const mode of ['overlap', 'padded', 'standard']) {
    await selector.selectOption(mode);
    const activeGroup = candidate.locator(`[data-splam-group="${mode}"]`);
    if (await activeGroup.getAttribute('hidden') !== null) failures.push(`${testCase.name}: ${mode} candidate mode remained hidden`);
    if (await activeGroup.locator('[data-wgi-step]:visible').count() !== 1) failures.push(`${testCase.name}: ${mode} candidate mode has invalid visible-step count`);
  }

  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  if (overflow.scroll !== overflow.client) failures.push(`${testCase.name}: horizontal overflow ${overflow.scroll}px > ${overflow.client}px`);
  if (consoleErrors.length) failures.push(`${testCase.name}: console errors: ${consoleErrors.join(' | ')}`);

  for (let index = 0; index < count; index += 1) {
    const root = visualizations.nth(index);
    await root.scrollIntoViewIfNeeded();
    await root.screenshot({ path: `/tmp/splam-${testCase.name}-${index + 1}.png` });
  }
  console.log(`${testCase.name}: ${count} visualizations, no overflow, ${consoleErrors.length} console errors`);
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
