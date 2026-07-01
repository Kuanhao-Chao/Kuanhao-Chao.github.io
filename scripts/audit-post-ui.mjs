import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import process from 'node:process';
import { chromium, webkit } from 'playwright';

const browserTypes = { chromium, webkit };
const actionTimeout = 10_000;
const navigationTimeout = 30_000;
const imageDecodeTimeout = 5_000;

const inventory = {
  han1: { animations: 0, figures: 3 },
  lifton: { animations: 4, figures: 4 },
  openspliceai: { animations: 5, figures: 1 },
  sangeranalyser: { animations: 0, figures: 3 },
  shorkie: { animations: 3, figures: 4 },
  splam: { animations: 2, figures: 3 },
  wgt: { animations: 2, figures: 5 },
};

const profiles = [
  { name: 'desktop-light', width: 1440, height: 1000, theme: 'light', mobile: false },
  { name: 'desktop-dark', width: 1440, height: 1000, theme: 'dark', mobile: false },
  { name: 'phone-light', width: 390, height: 844, theme: 'light', mobile: true },
  { name: 'phone-dark', width: 390, height: 844, theme: 'dark', mobile: true },
];

const failures = [];
const fail = (scope, message) => failures.push(`${scope}: ${message}`);
const progress = (scope) => console.log(`[post-ui] ${scope}`);

async function captureFailure(scope, task) {
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(scope, message);
  }
}

function selectedBrowsers() {
  const names = (process.env.POST_UI_AUDIT_BROWSERS ?? 'chromium,webkit')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  return names.map((name) => {
    const browserType = browserTypes[name];
    if (!browserType) throw new Error(`Unsupported POST_UI_AUDIT_BROWSERS entry: ${name}`);
    return [name, browserType];
  });
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4387;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForSite(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Preview exited with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function auditImages(page, scope) {
  const images = page.locator('main img:visible');
  for (let index = 0; index < (await images.count()); index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(async (element, timeout) => {
      if (!element.decode) return;
      await Promise.race([
        element.decode().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, timeout)),
      ]);
    }, imageDecodeTimeout);
    const result = await image.evaluate((element) => ({
      alt: element.getAttribute('alt'),
      complete: element.complete,
      width: element.naturalWidth,
      height: element.naturalHeight,
    }));
    if (result.alt === null) fail(scope, `image ${index + 1} is missing an alt attribute`);
    if (!result.complete || result.width < 1 || result.height < 1) {
      fail(scope, `image ${index + 1} did not load`);
    }
  }
}

async function auditZoomFigures(page, scope, expected) {
  const figures = page.locator('[data-zoom]');
  const count = await figures.count();
  if (count !== expected) fail(scope, `expected ${expected} zoom figures, found ${count}`);

  for (let index = 0; index < count; index += 1) {
    const button = figures.nth(index);
    await button.scrollIntoViewIfNeeded();
    await button.click();
    const dialog = button.locator('xpath=ancestor::figure[1]').locator('[data-zoom-dialog]');
    if (!(await dialog.evaluate((element) => element.open))) {
      fail(scope, `zoom figure ${index + 1} did not open`);
    }
    await page.keyboard.press('Escape');
    if (await dialog.evaluate((element) => element.open)) {
      fail(scope, `zoom figure ${index + 1} did not close with Escape`);
    }
  }
}

async function auditAnimation(root, scope, profile) {
  const label = await root.getAttribute('aria-label');
  if (!label) fail(scope, 'animation has no accessible label');

  const bounds = await root.boundingBox();
  if (!bounds || bounds.x < -1 || bounds.x + bounds.width > profile.width + 1) {
    fail(scope, `animation exceeds viewport: ${JSON.stringify(bounds)}`);
  }

  const jumps = root.locator('[data-wgi-jump]');
  const stepCount = await jumps.count();
  if (stepCount < 2) fail(scope, `expected multiple steps, found ${stepCount}`);

  const selectors = root.locator('select');
  for (let selectIndex = 0; selectIndex < (await selectors.count()); selectIndex += 1) {
    const select = selectors.nth(selectIndex);
    const name = await select.evaluate((element) =>
      Array.from(element.labels ?? []).map((item) => item.textContent?.trim()).filter(Boolean).join(' ')
    );
    if (!name) fail(scope, `selector ${selectIndex + 1} has no accessible label`);
    const optionCount = await select.locator('option').count();
    for (let optionIndex = 0; optionIndex < optionCount; optionIndex += 1) {
      await select.selectOption({ index: optionIndex });
      if ((await root.locator('[data-wgi-step]:visible').count()) !== 1) {
        fail(scope, `selector ${selectIndex + 1}, option ${optionIndex + 1} has invalid visible state`);
      }
    }
  }

  for (let step = 0; step < stepCount; step += 1) {
    await jumps.nth(step).click();
    const position = (await root.locator('[data-wgi-pos]').textContent())?.trim();
    if (position !== `${step + 1} / ${stepCount}`) {
      fail(scope, `step ${step + 1} reports position ${position}`);
    }
    if ((await root.locator('[data-wgi-step]:visible').count()) !== 1) {
      fail(scope, `step ${step + 1} does not have exactly one visible scene`);
    }
    const caption = (await root.locator('[data-wgi-caption]').textContent())?.trim();
    if (!caption) fail(scope, `step ${step + 1} has an empty caption`);
    const sceneBounds = await root.locator('[data-wgi-step]:visible').boundingBox();
    if (!sceneBounds || sceneBounds.width < 80 || sceneBounds.height < 80) {
      fail(scope, `step ${step + 1} has invalid scene bounds ${JSON.stringify(sceneBounds)}`);
    }
  }

  const desktopScene = root.locator('.lvz-visual--desktop').first();
  const mobileScene = root.locator('.lvz-visual--mobile').first();
  if ((await desktopScene.count()) && (await mobileScene.count())) {
    const desktopDisplay = await desktopScene.evaluate((element) => getComputedStyle(element).display);
    const mobileDisplay = await mobileScene.evaluate((element) => getComputedStyle(element).display);
    if (profile.mobile && (desktopDisplay !== 'none' || mobileDisplay === 'none')) {
      fail(scope, 'responsive scene selection is incorrect on phone');
    }
    if (!profile.mobile && (desktopDisplay === 'none' || mobileDisplay !== 'none')) {
      fail(scope, 'responsive scene selection is incorrect on desktop');
    }
  }

  await jumps.first().focus();
  await root.page().keyboard.press('End');
  if ((await root.locator('[data-wgi-pos]').textContent())?.trim() !== `${stepCount} / ${stepCount}`) {
    fail(scope, 'End key did not select the final step');
  }
  await root.page().keyboard.press('Home');
  if ((await root.locator('[data-wgi-pos]').textContent())?.trim() !== `1 / ${stepCount}`) {
    fail(scope, 'Home key did not select the first step');
  }

  await root.locator('[data-wgi-next]').click();
  await root.locator('[data-wgi-prev]').click();
  await root.locator('[data-wgi-reset]').click();
  if ((await root.locator('[data-wgi-pos]').textContent())?.trim() !== `1 / ${stepCount}`) {
    fail(scope, 'reset did not restore the first step');
  }

  const play = root.locator('[data-wgi-play]');
  await play.click();
  if ((await play.getAttribute('aria-pressed')) !== 'true') fail(scope, 'play did not start');
  await play.click();
  if ((await play.getAttribute('aria-pressed')) !== 'false') fail(scope, 'pause did not stop');

  const graphNode = root.locator('[data-wgi-step]:visible [data-wgt-node]:visible').first();
  if (await graphNode.count()) {
    await graphNode.click();
    if ((await graphNode.getAttribute('aria-pressed')) !== 'true') {
      fail(scope, 'interactive graph node did not enter its focused state');
    }
  }
}

async function auditPage(page, engineName, profile, slug, expected) {
  const scope = `${engineName}/${profile.name}/${slug}`;
  progress(scope);
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await page.goto(`/posts/${slug}/`, { waitUntil: 'networkidle', timeout: navigationTimeout });
  if ((await page.locator('html').getAttribute('data-theme')) !== profile.theme) {
    fail(scope, `theme did not resolve to ${profile.theme}`);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  if (overflow > 1) fail(scope, `page has ${overflow}px horizontal overflow`);

  const animations = page.locator('.lvz');
  const animationCount = await animations.count();
  if (animationCount !== expected.animations) {
    fail(scope, `expected ${expected.animations} animations, found ${animationCount}`);
  }
  for (let index = 0; index < animationCount; index += 1) {
    await auditAnimation(animations.nth(index), `${scope}/animation-${index + 1}`, profile);
  }

  await auditZoomFigures(page, scope, expected.figures);
  await auditImages(page, scope);
  if (runtimeErrors.length) fail(scope, `runtime errors: ${runtimeErrors.join(' | ')}`);
}

async function auditReducedMotion(browser, baseURL) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  for (const slug of Object.keys(inventory).filter((item) => inventory[item].animations > 0)) {
    const scope = `chromium/reduced-motion/${slug}`;
    progress(scope);
    const page = await context.newPage();
    page.setDefaultTimeout(actionTimeout);
    try {
      await captureFailure(scope, async () => {
        await page.goto(`/posts/${slug}/`, { waitUntil: 'networkidle', timeout: navigationTimeout });
        const animations = page.locator('.lvz');
        for (let index = 0; index < (await animations.count()); index += 1) {
          const root = animations.nth(index);
          const total = await root.locator('[data-wgi-jump]').count();
          await root.locator('[data-wgi-play]').click();
          const position = (await root.locator('[data-wgi-pos]').textContent())?.trim();
          const pressed = await root.locator('[data-wgi-play]').getAttribute('aria-pressed');
          if (position !== `${total} / ${total}` || pressed !== 'false') {
            fail(`${scope}/animation-${index + 1}`, 'play did not jump to final state');
          }
        }
      });
    } finally {
      await page.close();
    }
  }
  await context.close();
}

async function auditPrint(browser, baseURL) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  for (const slug of Object.keys(inventory).filter((item) => inventory[item].animations > 0)) {
    const scope = `chromium/print/${slug}`;
    progress(scope);
    const page = await context.newPage();
    page.setDefaultTimeout(actionTimeout);
    try {
      await captureFailure(scope, async () => {
        await page.goto(`/posts/${slug}/`, { waitUntil: 'networkidle', timeout: navigationTimeout });
        await page.emulateMedia({ media: 'print' });
        const animations = page.locator('.lvz');
        for (let index = 0; index < (await animations.count()); index += 1) {
          const root = animations.nth(index);
          if ((await root.locator('[data-print-final="true"]:visible').count()) < 1) {
            fail(`${scope}/animation-${index + 1}`, 'no final state is visible');
          }
          if ((await root.locator('.lvz-controls').evaluate((element) => getComputedStyle(element).display)) !== 'none') {
            fail(`${scope}/animation-${index + 1}`, 'controls remain visible');
          }
        }
      });
    } finally {
      await page.close();
    }
  }
  await context.close();
}

async function main() {
  const port = await availablePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const preview = spawn(npm, ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let previewLog = '';
  preview.stdout.on('data', (chunk) => { previewLog += chunk; });
  preview.stderr.on('data', (chunk) => { previewLog += chunk; });

  try {
    await waitForSite(`${baseURL}/posts/`, preview);
    const browsers = selectedBrowsers();
    for (const [engineName, browserType] of browsers) {
      progress(`${engineName}/start`);
      const browser = await browserType.launch({ headless: true });
      try {
        for (const profile of profiles) {
          const context = await browser.newContext({
            baseURL,
            viewport: { width: profile.width, height: profile.height },
            colorScheme: profile.theme,
            hasTouch: profile.mobile,
          });
          await context.addInitScript((theme) => localStorage.setItem('khc-theme', theme), profile.theme);
          for (const [slug, expected] of Object.entries(inventory)) {
            const page = await context.newPage();
            page.setDefaultTimeout(actionTimeout);
            try {
              await captureFailure(`${engineName}/${profile.name}/${slug}`, () =>
                auditPage(page, engineName, profile, slug, expected)
              );
            } finally {
              await page.close();
            }
          }
          await context.close();
        }
        if (engineName === 'chromium') {
          await auditReducedMotion(browser, baseURL);
          await auditPrint(browser, baseURL);
        }
      } finally {
        await browser.close();
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
  } finally {
    preview.kill('SIGTERM');
    await new Promise((resolve) => {
      if (preview.exitCode !== null) resolve();
      else {
        preview.once('exit', resolve);
        setTimeout(resolve, 2_000);
      }
    });
  }

  if (failures.length) {
    console.error(`Post UI audit failed with ${failures.length} issue(s):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    if (previewLog.trim()) console.error(`\nPreview output:\n${previewLog.trim()}`);
    process.exitCode = 1;
    return;
  }

  const animationCount = Object.values(inventory).reduce((sum, item) => sum + item.animations, 0);
  const figureCount = Object.values(inventory).reduce((sum, item) => sum + item.figures, 0);
  const browserLabel = selectedBrowsers().map(([name]) => name).join(' and ');
  console.log(
    `Post UI audit passed for ${Object.keys(inventory).length} live posts, ${animationCount} animations, and ${figureCount} zoom figures in ${browserLabel}.`
  );
}

await main();
