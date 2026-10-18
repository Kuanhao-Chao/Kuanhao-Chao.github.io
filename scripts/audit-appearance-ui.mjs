import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright';
import { startPreview } from './lib/previewServer.mjs';
import { waitForPageReady } from './lib/gameAuditUi.mjs';

// Local/manual regression coverage. Deliberately not part of the lightweight push workflow.
const quick = process.argv.includes('--quick');
const logosOnly = process.argv.includes('--logos-only');
const storageOnly = process.argv.includes('--storage-only');
const engines = (
  process.env.APPEARANCE_UI_BROWSERS || (quick ? 'chromium' : 'chromium,webkit')
).split(',');
const widths =
  process.env.APPEARANCE_UI_WIDTHS?.split(',').map(Number) || (quick ? [1440] : [1440, 390, 320]);
const themes =
  process.env.APPEARANCE_UI_THEMES?.split(',') ||
  (quick ? ['light'] : ['light', 'dark', 'parchment', 'nord', 'monokai', 'cyberdeck']);
const artifacts = await mkdtemp(join(tmpdir(), 'khc-appearance-ui-'));
console.log(`[appearance-ui] Artifacts: ${artifacts}`);

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function openAppearance(page) {
  const trigger = page.getByRole('button', { name: 'Appearance settings', exact: true });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  const panel = page.getByRole('dialog', { name: 'Appearance', exact: true });
  await panel.waitFor({ state: 'visible' });
  return panel;
}

async function checkEssentials(page, width, scope) {
  const panel = await openAppearance(page);
  assert.equal(await panel.getByRole('button', { name: 'Close appearance settings' }).count(), 1);
  assert.deepEqual(
    (await panel.getByRole('radio').filter({ visible: true }).allTextContents()).map((text) =>
      text.trim()
    ),
    ['Light', 'Dark']
  );
  assert.equal(
    await panel.locator('details[open]').count(),
    0,
    `${scope}: advanced settings start collapsed`
  );
  assert.equal(await panel.getByLabel('Background', { exact: true }).inputValue(), 'morph');
  assert.equal(await panel.getByLabel('Motion', { exact: true }).inputValue(), 'ambient');
  const dimensions = await panel.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      x: box.x,
      right: box.right,
      y: box.y,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  });
  assert.ok(
    dimensions.x >= 15 && dimensions.right <= width - 15,
    `${scope}: panel stays within viewport`
  );
  assert.ok(
    dimensions.bottom <= 900 && dimensions.height < 470,
    `${scope}: compact essentials panel`
  );
  assert.ok(
    Math.abs(dimensions.width - (width < 620 ? width - 32 : 288)) < 1,
    `${scope}: approved panel width`
  );
  if (/-(?:light|dark)$/.test(scope))
    await page.screenshot({ path: join(artifacts, `${scope}-appearance.png`) });
  const targets = await panel
    .locator('button:visible, select:visible, summary:visible')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.textContent.trim(),
        height: element.getBoundingClientRect().height,
      }))
    );
  for (const target of targets)
    assert.ok(
      target.height >= 43.9,
      `${scope}: ${target.name} has a 44px touch target (measured ${target.height}px)`
    );
  await panel.getByRole('button', { name: 'Close appearance settings' }).click();
  assert.equal(await page.locator('[data-top-theme-btn]').getAttribute('aria-expanded'), 'false');
  assert.equal(
    await page
      .locator('[data-top-theme-btn]')
      .evaluate((element) => element === document.activeElement),
    true
  );
}

async function checkNavigation(page, width, scope) {
  const expected = [
    'Genome Browser',
    'Algorithms',
    'Deep Dives',
    'Shorkie Lab',
    'Cell Lab',
    'Terminal',
  ];
  for (const selector of ['.nav-lab-title', '.mobile-lab-title'])
    assert.deepEqual(
      await page.locator(selector).allTextContents(),
      expected,
      `${scope}: header Labs order`
    );
  assert.equal(
    await page.locator('header [role="menu"], header [role="menuitem"]').count(),
    0,
    `${scope}: Labs is disclosure navigation`
  );
  assert.equal(await page.locator('header a[href="/fun-lab/"]').count(), 0);
  for (const href of ['/fun-lab/', '/nn-lab/', '/deep_dives/'])
    assert.ok(
      (await page.locator(`footer a[href="${href}"]`).count()) > 0,
      `${scope}: footer keeps ${href}`
    );
  if (width > 960) {
    const trigger = page.locator('[data-nav-labs-trigger]');
    assert.equal(await trigger.getAttribute('aria-controls'), 'nav-labs-popover');
    await trigger.click();
    assert.equal(
      await trigger.getAttribute('aria-expanded'),
      'true',
      `${scope}: clicking Labs opens it`
    );
    // Begin keyboard navigation on the trigger; mouse clicks need not focus buttons in WebKit.
    await trigger.focus();
    await page.keyboard.press('Tab');
    // macOS WebKit's native keyboard policy may skip anchors with plain Tab.
    if (
      scope.startsWith('webkit-') &&
      process.platform === 'darwin' &&
      (await page.evaluate(() => document.activeElement?.getAttribute('href'))) !==
        '/shorkie-lab/genome/'
    ) {
      await trigger.focus();
      await page.keyboard.press('Alt+Tab');
    }
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('href')),
      '/shorkie-lab/genome/'
    );
    await page.keyboard.press('Escape');
    assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
    await trigger.click();
    await openAppearance(page);
    assert.equal(
      await trigger.getAttribute('aria-expanded'),
      'false',
      `${scope}: only one panel is open`
    );
  } else {
    const toggle = page.locator('.nav-toggle');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await openAppearance(page);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click();
    assert.equal(await page.locator('[data-top-theme-btn]').getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('Escape');
    assert.equal(await toggle.evaluate((element) => element === document.activeElement), true);
  }
  await openAppearance(page);
  // On a phone the full-width panel covers the headline; choose a real exposed margin.
  if (width < 620) await page.touchscreen.tap(4, page.viewportSize().height - 12);
  else await page.mouse.click(4, page.viewportSize().height - 12);
  await page.waitForFunction(
    () => document.querySelector('[data-top-theme-btn]')?.getAttribute('aria-expanded') === 'false',
    undefined,
    { timeout: 2000 }
  );
  assert.equal(
    await page.locator('[data-top-theme-btn]').getAttribute('aria-expanded'),
    'false',
    `${scope}: outside click closes Appearance`
  );
}

async function checkPreferences(page, scope) {
  const panel = await openAppearance(page);
  await panel.getByRole('radio', { name: 'Light', exact: true }).click();
  await panel.getByRole('radio', { name: 'Light', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await page.locator('html').getAttribute('data-theme'),
    'dark',
    `${scope}: arrow keys select visible themes`
  );
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await page.locator('html').getAttribute('data-theme'),
    'light',
    `${scope}: collapsed themes are skipped`
  );
  await panel.locator('[data-more-themes] summary').click();
  await panel.getByRole('radio', { name: 'Nord', exact: true }).click();
  assert.equal(await panel.isVisible(), true, `${scope}: changing a theme keeps settings open`);
  await panel.locator('[data-more-themes] summary').click();
  assert.match(await panel.locator('[data-theme-summary]').textContent(), /Nord/);
  const scene = panel.getByLabel('Background', { exact: true });
  const motion = panel.getByLabel('Motion', { exact: true });
  await motion.selectOption('calm');
  await scene.selectOption('off');
  assert.equal(await motion.isDisabled(), true, `${scope}: Motion is disabled while Off`);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-site-bg-canvas], [data-art-bg-canvas]')].every(
      (canvas) => getComputedStyle(canvas).display === 'none'
    )
  );
  await scene.selectOption('morph');
  assert.equal(await motion.isDisabled(), false);
  assert.equal(await motion.inputValue(), 'calm', `${scope}: Off preserves the chosen Motion`);
  await motion.selectOption('paused');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await motion.inputValue(),
    'paused',
    `${scope}: OS preference does not rewrite the saved choice`
  );
  await page.waitForFunction(() =>
    document.querySelector('[data-background-hint]')?.textContent.includes('Reduced motion')
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await panel.locator('[data-retro-effects] summary').click();
  assert.equal(await panel.locator('[data-crt-choice="green"]').isDisabled(), true);
  await panel.getByRole('switch', { name: 'CRT display' }).click();
  for (const mode of ['green', 'cyan', 'amber']) {
    await panel.locator(`[data-crt-choice="${mode}"]`).click();
    assert.equal(await page.locator('html').getAttribute('data-crt-mode'), mode);
    assert.equal(await panel.isVisible(), true);
  }
  const viewport = page.viewportSize();
  await panel.locator('[data-more-themes] summary').click();
  await page.setViewportSize({ width: viewport.width, height: 360 });
  const expanded = await panel.evaluate((element) => ({
    bottom: element.getBoundingClientRect().bottom,
    scrolling: element.scrollHeight > element.clientHeight,
  }));
  assert.ok(
    expanded.bottom <= 345 && expanded.scrolling,
    `${scope}: expanded settings scroll within a short viewport`
  );
  await page.setViewportSize(viewport);
  await panel.locator('[data-more-themes] summary').click();
  await panel.locator('[data-retro-effects] summary').click();
  assert.match(await panel.locator('[data-crt-summary]').textContent(), /Amber · On/);
  await page.keyboard.press('Escape');
  assert.equal(
    await page
      .locator('[data-top-theme-btn]')
      .evaluate((element) => element === document.activeElement),
    true
  );
  await page.reload();
  await waitForPageReady(page);
  await openAppearance(page);
  assert.equal(await scene.inputValue(), 'morph');
  assert.equal(await motion.inputValue(), 'paused');
  assert.match(await panel.locator('[data-crt-summary]').textContent(), /Amber · On/);
  await page.keyboard.press('Escape');
  // Footer now reuses the same compact panel and the same preference owner.
  const footerAppearance = page.locator('footer [data-open-appearance]');
  await footerAppearance.click();
  await panel.locator('[data-retro-effects] summary').click();
  await panel.locator('[data-crt-choice="cyan"]').click();
  assert.equal(await page.locator('html').getAttribute('data-crt-mode'), 'cyan');
  await panel.getByRole('radio', { name: 'Dark', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal((await page.locator('html').getAttribute('data-crt-mode')) ?? 'off', 'off');
  assert.equal(
    await panel.getByRole('radio', { name: 'Dark', exact: true }).getAttribute('aria-checked'),
    'true'
  );
  // Real Astro navigation, not a full reload: preferences and listeners survive the swap.
  await page.keyboard.press('Escape');
  assert.equal(await footerAppearance.evaluate(element => element === document.activeElement), true);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  if (page.viewportSize().width > 960)
    await page.locator('header a[href="/research/"]').first().click();
  else {
    await page.locator('.nav-toggle').click();
    await page.locator('#mobile-menu a[href="/research/"]').click();
  }
  await page.waitForURL('**/research/');
  await waitForPageReady(page);
  await openAppearance(page);
  assert.equal(await motion.inputValue(), 'paused');
  await motion.selectOption('ambient');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.querySelector('[data-art-bg-canvas]')?.dataset.bgVeil === '0.10'
  );
  await page.locator('main h1').first().click();
  // A second toggle must perform exactly one action after navigation.
  await page.locator('[data-top-theme-btn]').click();
  assert.equal(await panel.isVisible(), true);
  await page.keyboard.press('Escape');
  // Updates from another tab use the same native selects and keep Motion in sync.
  const otherTab = await page.context().newPage();
  try {
    await otherTab.goto('/research/');
    await otherTab.evaluate(() =>
      localStorage.setItem('khc-background-v1', JSON.stringify({ scene: 'off', motion: 'calm' }))
    );
    await page.waitForFunction(() => document.documentElement.dataset.backgroundScene === 'off');
    await openAppearance(page);
    assert.equal(await scene.inputValue(), 'off');
    assert.equal(await motion.inputValue(), 'calm');
    assert.equal(await motion.isDisabled(), true);
  } finally {
    await otherTab.close();
  }
}

async function checkTextContrast(page, scope) {
  await page.waitForFunction(
    () => Number(document.querySelector('[data-art-bg-canvas]')?.dataset.bgFrames) > 0
  );
  const readings = await page.evaluate(() => {
    const canvas = document.querySelector('[data-art-bg-canvas]');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const ratio = canvas.width / canvas.clientWidth;
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    const parser = probe.getContext('2d', { willReadFrequently: true });
    const rgba = (color) => {
      parser.clearRect(0, 0, 1, 1);
      parser.fillStyle = color;
      parser.fillRect(0, 0, 1, 1);
      return [...parser.getImageData(0, 0, 1, 1).data];
    };
    const over = (paint, base) =>
      base.map((value, i) =>
        i < 3 ? (paint[i] * paint[3]) / 255 + value * (1 - paint[3] / 255) : 255
      );
    const luminance = (rgb) =>
      rgb
        .slice(0, 3)
        .map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    const base = rgba(getComputedStyle(document.documentElement).backgroundColor);
    const selected = document.querySelector('.hero-bio')
      ? '.hero-title, .hero-lead, .hero-bio p'
      : 'main h1, main p';
    return [...document.querySelectorAll(selected)].flatMap((element) => {
      const box = element.getBoundingClientRect();
      if (box.bottom < 0 || box.top >= innerHeight) return [];
      const style = getComputedStyle(element);
      const layers = [];
      for (
        let parent = element;
        parent && parent !== document.documentElement;
        parent = parent.parentElement
      )
        layers.unshift(rgba(getComputedStyle(parent).backgroundColor));
      const text = rgba(style.color);
      const large =
        parseFloat(style.fontSize) >= 24 ||
        (parseFloat(style.fontSize) >= 18.667 && Number(style.fontWeight) >= 700);
      let minimum = Infinity;
      for (let y = Math.max(0, box.top + 2); y < Math.min(innerHeight, box.bottom - 2); y += 4)
        for (let x = Math.max(0, box.left + 2); x < Math.min(innerWidth, box.right - 2); x += 4) {
          const offset = (Math.floor(y * ratio) * canvas.width + Math.floor(x * ratio)) * 4;
          let background = over(pixels.slice(offset, offset + 4), base);
          for (const layer of layers) background = over(layer, background);
          const foreground = over(text, background);
          const a = luminance(background),
            b = luminance(foreground);
          minimum = Math.min(minimum, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
        }
      return Number.isFinite(minimum)
        ? [{ text: element.textContent.trim().slice(0, 45), minimum, required: large ? 3 : 4.5 }]
        : [];
    });
  });
  assert.ok(readings.length > 0, `${scope}: sample visible text`);
  for (const reading of readings)
    assert.ok(
      reading.minimum >= reading.required,
      `${scope}: ${reading.text} contrast ${reading.minimum.toFixed(2)}:1, needs ${reading.required}:1`
    );
  return Math.min(...readings.map((reading) => reading.minimum)).toFixed(2);
}

async function checkLogoReview(page, scope) {
  assert.ok((await page.goto('/logo-options/'))?.ok());
  await waitForPageReady(page);
  assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
  assert.deepEqual(
    await page.locator('[data-logo-featured] h2').allTextContents(),
    ['Current branch', 'Connected KH', 'Cellular C', 'Regulatory Bridge'],
    `${scope}: three distinct new directions alongside the live baseline`
  );
  const archive = page.locator('[data-logo-archive]');
  assert.equal(
    await archive.getAttribute('open'),
    null,
    `${scope}: earlier concepts are collapsed`
  );
  assert.equal(await page.locator('.logo-card').count(), 22);
  for (const id of [0, 19, 20, 21]) {
    const card = page.locator(`#option-${id}`);
    for (const selector of [
      '.preview-large svg',
      '.preview-dark svg',
      '.preview-mono svg',
      '.header-mark svg',
      '.tiny--32 svg',
      '.tiny--16 svg',
    ])
      assert.equal(await card.locator(selector).count(), 1, `${scope}: ${id} ${selector}`);
    assert.equal(
      await card.locator('svg text, svg image').count(),
      0,
      `${scope}: font-independent vector artwork`
    );
    assert.match(await card.locator('.tradeoff').textContent(), /\S/);
    for (const size of [16, 32]) {
      const box = await card.locator(`.tiny--${size} svg`).boundingBox();
      assert.equal(box.width, size);
      assert.equal(box.height, size);
    }
  }
  assert.equal(
    await page.locator('header .wordmark-mark img').getAttribute('src'),
    '/favicon.svg',
    `${scope}: live logo is unchanged`
  );
  await page.screenshot({ path: join(artifacts, `${scope}-logo-review.png`) });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.evaluate(() => {
    location.hash = 'option-8';
  });
  await page.waitForFunction(() => document.querySelector('[data-logo-archive]')?.open === true);
  assert.equal(
    await page.locator('#option-8').isVisible(),
    true,
    `${scope}: archived anchors still work`
  );
}

async function checkDeniedStorage(browser, baseURL, engine, mode = 'blocked') {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 320, height: 844 },
    reducedMotion: 'reduce',
  });
  await context.addInitScript((mode) => {
    if (mode === 'full') {
      localStorage.setItem('khc-theme', 'parchment');
      localStorage.setItem('khc-crt-mode', 'amber');
    }
    for (const method of mode === 'full' ? ['setItem'] : ['getItem', 'setItem', 'removeItem'])
      Storage.prototype[method] = () => {
        throw new DOMException(
          'Storage unavailable in audit',
          mode === 'full' ? 'QuotaExceededError' : 'SecurityError'
        );
      };
  }, mode);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    assert.ok((await page.goto('/research/'))?.ok());
    await waitForPageReady(page);
    const panel = await openAppearance(page);
    await panel.getByRole('radio', { name: 'Dark', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.locator('.nav-toggle').click();
    await page.locator('#mobile-menu a[href="/publications/"]').click();
    await page.waitForURL('**/publications/');
    await waitForPageReady(page);
    await openAppearance(page);
    assert.equal(
      await page.locator('html').getAttribute('data-theme'),
      'dark',
      `${engine}: in-memory theme survives navigation with storage denied`
    );
    await panel.locator('[data-retro-effects] summary').click();
    await panel.getByRole('switch', { name: 'CRT display' }).click();
    await panel.locator('[data-crt-choice="green"]').click();
    await panel.getByLabel('Motion', { exact: true }).selectOption('calm');
    await panel.getByLabel('Background', { exact: true }).selectOption('off');
    await page.keyboard.press('Escape');
    await page.locator('.nav-toggle').click();
    await page.locator('#mobile-menu a[href="/research/"]').click();
    await page.waitForURL('**/research/');
    await waitForPageReady(page);
    await openAppearance(page);
    assert.equal(await panel.getByLabel('Background', { exact: true }).inputValue(), 'off');
    assert.equal(await panel.getByLabel('Motion', { exact: true }).inputValue(), 'calm');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(
      await page.locator('html').getAttribute('data-crt-mode'),
      'green',
      `${engine}: in-memory CRT choice survives navigation`
    );
    await panel.getByLabel('Background', { exact: true }).selectOption('morph');
    await page.waitForFunction(
      () => document.querySelector('[data-art-bg-canvas]')?.dataset.bgVeil === '0.10'
    );
    assert.equal(await panel.getByLabel('Motion', { exact: true }).isDisabled(), false);
    assert.deepEqual(errors, [], `${engine}: storage denial never breaks settings or navigation`);
    console.log(
      `[appearance-ui] ${engine}: ${mode} storage retains working in-memory preferences across Astro navigation`
    );
  } finally {
    await context.close();
  }
}

let preview;
let browser;
try {
  const baseURL =
    process.env.APPEARANCE_UI_BASE_URL ||
    (preview = await startPreview({ port: await availablePort() })).baseURL;
  for (const engine of engines) {
    assert.ok({ chromium, webkit }[engine], `Unknown browser ${engine}`);
    browser = await { chromium, webkit }[engine].launch();
    if (storageOnly) {
      await checkDeniedStorage(browser, baseURL, engine);
      await checkDeniedStorage(browser, baseURL, engine, 'full');
      await browser.close();
      browser = null;
      continue;
    }
    for (const width of widths) {
      for (const theme of themes) {
        const scope = `${engine}-${width}-${theme}`;
        const context = await browser.newContext({
          baseURL,
          viewport: { width, height: 900 },
          hasTouch: width < 620,
        });
        await context.addInitScript((theme) => localStorage.setItem('khc-theme', theme), theme);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        try {
          assert.ok((await page.goto('/'))?.ok(), `${scope}: homepage loads`);
          await waitForPageReady(page);
          if (!logosOnly && ['light', 'dark'].includes(theme))
            await page.screenshot({ path: join(artifacts, `${scope}-home.png`) });
          if (logosOnly) await checkLogoReview(page, scope);
          else {
            await checkEssentials(page, width, scope);
            await checkNavigation(page, width, scope);
            const contrast = await checkTextContrast(page, scope);
            if (theme === 'light') await checkPreferences(page, scope);
            assert.ok((await page.goto('/research/'))?.ok());
            await waitForPageReady(page);
            const panel = await openAppearance(page);
            await panel.getByLabel('Background', { exact: true }).selectOption('morph');
            await panel.getByLabel('Motion', { exact: true }).selectOption('ambient');
            await page.keyboard.press('Escape');
            await page.waitForFunction(() =>
              [...document.querySelectorAll('[data-reveal]')].every((element) => {
                const rect = element.getBoundingClientRect();
                if (rect.bottom < 0 || rect.top > innerHeight) return true;
                const style = getComputedStyle(element);
                return (
                  style.opacity === '1' &&
                  (style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)')
                );
              })
            );
            const contentContrast = await checkTextContrast(page, scope);
            assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
            if (['light', 'dark'].includes(theme))
              await page.screenshot({ path: join(artifacts, `${scope}-research.png`) });
            console.log(
              `[appearance-ui] ${scope}: sampled text contrast home ≥ ${contrast}:1, research ≥ ${contentContrast}:1`
            );
          }
          assert.deepEqual(errors, [], `${scope}: no browser errors`);
          console.log(`[appearance-ui] ${scope}: passed`);
        } finally {
          await context.close();
        }
      }
    }
    if (!quick && !logosOnly) {
      await checkDeniedStorage(browser, baseURL, engine);
      await checkDeniedStorage(browser, baseURL, engine, 'full');
    }
    await browser.close();
    browser = null;
  }
  console.log(`[appearance-ui] Passed. Screenshots: ${artifacts}`);
} finally {
  await browser?.close();
  await preview?.stop();
}
