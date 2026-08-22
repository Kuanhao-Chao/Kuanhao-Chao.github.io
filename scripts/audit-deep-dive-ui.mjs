import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { chromium, webkit } from 'playwright';

/**
 * Rendering audit for the deep-dive curriculum — every track, not one of them.
 *
 * Modelled on `audit-post-ui.mjs`, with one deliberate difference: the expected number of
 * figures and widgets per lesson is **derived from the MDX source**, not held in a
 * hand-maintained inventory. A hand-written count is a second copy of a fact, and this
 * repo has already shipped the consequences of that twice. Deriving it means the audit
 * fails when a `<Figure>` silently renders nothing, and never fails merely because
 * someone added one.
 *
 * What it asserts, per route, per engine, per viewport, in both themes:
 *   · the page is 200 and carries a visible h1
 *   · the document does not scroll horizontally
 *   · no `.katex-error`, and no literal `$…$` left in the rendered prose
 *   · no empty `<svg>` — the failure mode that left 112 blank icons on the live site
 *   · every citation link resolves to a bibliography entry that exists
 *   · every figure and widget the source declares is actually on the page
 *   · every widget mounts, and its readout *changes* when a control moves
 */

const browserTypes = { chromium, webkit };
const actionTimeout = 10_000;
const navigationTimeout = 30_000;

const CONTENT_DIR = 'src/content/deepDives';
const PAGES_DIR = 'src/pages/deep_dives';

const profiles = [
  { name: 'desktop-light', width: 1440, height: 1000, theme: 'light', mobile: false },
  { name: 'desktop-dark', width: 1440, height: 1000, theme: 'dark', mobile: false },
  { name: 'tablet-light', width: 768, height: 1024, theme: 'light', mobile: true },
  { name: 'phone-light', width: 390, height: 844, theme: 'light', mobile: true },
  { name: 'phone-dark', width: 390, height: 844, theme: 'dark', mobile: true },
  { name: 'narrow-light', width: 320, height: 720, theme: 'light', mobile: true },
];

const failures = [];
const fail = (scope, message) => failures.push(`${scope}: ${message}`);
const progress = (scope) => console.log(`[deep-dive-ui] ${scope}`);
const shotDir = 'scripts/figures/out/deep-dive-ui';

async function captureFailure(scope, task) {
  try {
    await task();
  } catch (error) {
    fail(scope, error instanceof Error ? error.message : String(error));
  }
}

/** Every route in the curriculum, migrated or not, with what its source promises. */
function routes() {
  const out = [];

  if (existsSync(CONTENT_DIR)) {
    for (const file of readdirSync(CONTENT_DIR).filter((f) => /\.mdx?$/.test(f))) {
      const raw = readFileSync(join(CONTENT_DIR, file), 'utf8');
      const front = raw.split(/^---$/m)[1] ?? '';
      const body = raw.split(/^---$/m).slice(2).join('---');
      // Any hub. This once read `statistical-genetics`, which quietly left the whole
      // Genomic Data track outside the only gate that checks overflow, KaTeX errors,
      // empty <svg> and dead citation anchors.
      if (!/^hub:\s*\S+\s*$/m.test(front)) continue;
      out.push({
        slug: file.replace(/\.mdx?$/, ''),
        migrated: true,
        figures: (body.match(/<Figure\b/g) ?? []).length,
        widgets: [...body.matchAll(/<Widget[\s\S]*?kind="([^"]+)"/g)].map((m) => m[1]),
      });
    }
  }

  const migrated = new Set(out.map((r) => r.slug));
  for (const file of readdirSync(PAGES_DIR)) {
    if (!file.endsWith('.astro') || file.startsWith('[')) continue;
    const slug = file.replace(/\.astro$/, '');
    if (!/^statgen-/.test(slug) && slug !== 'statistical-genetics') continue;
    if (migrated.has(slug)) continue;
    out.push({ slug, migrated: false, figures: 0, widgets: [] });
  }

  return out.sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

async function auditPage(page, scope, route, profile, screenshot) {
  const response = await page.goto(`/deep_dives/${route.slug}/`, {
    waitUntil: 'networkidle',
    timeout: navigationTimeout,
  });
  if (!response?.ok()) fail(scope, `HTTP ${response?.status() ?? 'no response'}`);

  const state = await page.evaluate(() => {
    const article = document.querySelector('.deep-dive-article') ?? document.querySelector('main');
    const text = article instanceof HTMLElement ? article.innerText : '';
    const svgs = Array.from(document.querySelectorAll('main svg'));
    const cites = Array.from(document.querySelectorAll('a[href^="#ref-"]'));
    return {
      h1: (document.querySelector('main h1')?.textContent ?? '').trim(),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      katexErrors: document.querySelectorAll('.katex-error').length,
      katexNodes: document.querySelectorAll('.katex').length,
      emptySvgs: svgs.filter((s) => s.children.length === 0).length,
      // A LaTeX span that never rendered still shows its delimiters.
      rawMath: (text.match(/\$[^$\n]{1,80}\$/g) ?? []).slice(0, 3),
      danglingCites: cites
        .map((a) => a.getAttribute('href').slice(1))
        .filter((id) => !document.getElementById(id)),
      figures: document.querySelectorAll('.dd-figure').length,
      widgets: Array.from(document.querySelectorAll('[data-dd-widget]')).map((w) => ({
        kind: w.getAttribute('data-dd-widget'),
        ready: w.getAttribute('data-dd-ready') === 'true',
        sliders: w.querySelectorAll('input[type="range"]').length,
        drawn: w.querySelectorAll('[data-dd-canvas] svg *').length,
        readout: (w.querySelector('[data-dd-readout]')?.textContent ?? '').trim(),
      })),
    };
  });

  if (!state.h1) fail(scope, 'no visible h1');
  if (state.scrollWidth > state.clientWidth + 1) {
    fail(scope, `document overflows by ${state.scrollWidth - state.clientWidth}px at ${profile.width}px`);
  }
  if (state.katexErrors) fail(scope, `${state.katexErrors} .katex-error node(s)`);
  if (state.emptySvgs) fail(scope, `${state.emptySvgs} empty <svg>`);
  if (state.rawMath.length) fail(scope, `literal math in the prose: ${state.rawMath.join(' | ')}`);
  if (state.danglingCites.length) {
    fail(scope, `citation links with no anchor: ${[...new Set(state.danglingCites)].join(', ')}`);
  }
  if (route.migrated && state.katexNodes === 0) fail(scope, 'no rendered math at all');
  if (state.figures !== route.figures) {
    fail(scope, `source declares ${route.figures} figure(s), page shows ${state.figures}`);
  }
  if (state.widgets.length !== route.widgets.length) {
    fail(scope, `source declares ${route.widgets.length} widget(s), page shows ${state.widgets.length}`);
  }

  for (const [i, w] of state.widgets.entries()) {
    const tag = `${scope}/widget-${i + 1}(${w.kind})`;
    if (!w.ready) fail(tag, 'never mounted');
    if (!w.sliders) fail(tag, 'no controls');
    if (w.drawn < 5) fail(tag, `drew only ${w.drawn} SVG node(s)`);
    if (!w.readout) fail(tag, 'empty readout');
  }

  // Drive the first control of each widget and require the readout to respond.
  const widgets = page.locator('[data-dd-widget]');
  for (let i = 0; i < (await widgets.count()); i += 1) {
    const root = widgets.nth(i);
    const slider = root.locator('input[type="range"]').first();
    if (!(await slider.count())) continue;
    const out = root.locator('[data-dd-readout]');
    const before = (await out.textContent()) ?? '';
    await slider.evaluate((el) => {
      const min = Number(el.min);
      const max = Number(el.max);
      const now = Number(el.value);
      el.value = String(Math.abs(now - min) > Math.abs(now - max) ? min : max);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const after = (await out.textContent()) ?? '';
    if (before === after) fail(`${scope}/widget-${i + 1}`, 'readout did not change when a control moved');
  }

  if (screenshot) {
    mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: join(shotDir, `${route.slug}--${profile.name}.png`), fullPage: true });
  }
}

async function auditPrint(browser, baseURL, list) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  for (const route of list.filter((r) => r.widgets.length)) {
    const scope = `chromium/print/${route.slug}`;
    progress(scope);
    const page = await context.newPage();
    page.setDefaultTimeout(actionTimeout);
    try {
      await captureFailure(scope, async () => {
        await page.goto(`/deep_dives/${route.slug}/`, { waitUntil: 'networkidle', timeout: navigationTimeout });
        await page.emulateMedia({ media: 'print' });
        const state = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-dd-widget]')).map((w) => ({
            controls: getComputedStyle(w.querySelector('[data-dd-controls]')).display,
            drawn: w.querySelectorAll('[data-dd-canvas] svg *').length,
          }))
        );
        state.forEach((w, i) => {
          if (w.controls !== 'none') fail(`${scope}/widget-${i + 1}`, 'controls still print');
          if (w.drawn < 5) fail(`${scope}/widget-${i + 1}`, 'nothing to print');
        });
      });
    } finally {
      await page.close();
    }
  }
  await context.close();
}

/** A round trip through another page: `ClientRouter` must not leave a widget unbound. */
async function auditNavigation(browser, baseURL, list) {
  const route = list.find((r) => r.widgets.length);
  if (!route) return;
  const scope = 'chromium/navigation';
  progress(scope);
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(actionTimeout);
  try {
    await captureFailure(scope, async () => {
      await page.goto(`/deep_dives/${route.slug}/`, { waitUntil: 'networkidle', timeout: navigationTimeout });
      await page.goto('/deep_dives/', { waitUntil: 'networkidle', timeout: navigationTimeout });
      await page.goBack({ waitUntil: 'networkidle' });
      const ready = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-dd-widget]')).map((w) => ({
          ready: w.getAttribute('data-dd-ready') === 'true',
          sliders: w.querySelectorAll('input[type="range"]').length,
          drawn: w.querySelectorAll('[data-dd-canvas] svg *').length,
        }))
      );
      if (!ready.length) fail(scope, 'no widget after navigating back');
      ready.forEach((w, i) => {
        if (!w.ready || !w.sliders || w.drawn < 5) {
          fail(`${scope}/widget-${i + 1}`, 'did not rebind after a client-side navigation');
        }
      });
      // One set of controls, not two: mounting must be idempotent.
      const dupes = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-dd-controls]')).map((c) => c.childElementCount)
      );
      dupes.forEach((n, i) => {
        if (n > 6) fail(`${scope}/widget-${i + 1}`, `${n} controls — mounted more than once`);
      });
    });
  } finally {
    await page.close();
    await context.close();
  }
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4388;
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

function selected(list, envName, key) {
  const names = process.env[envName]?.split(',').map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (!names?.length) return list;
  return list.filter((item) => names.includes(String(key(item)).toLowerCase()));
}

async function main() {
  const list = routes();
  const smoke = process.argv.includes('--smoke');
  const screenshots = process.argv.includes('--screenshots');
  if (!list.length) throw new Error('no statistical-genetics routes found');

  const port = await availablePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const preview = spawn(npm, ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let previewLog = '';
  preview.stdout.on('data', (chunk) => { previewLog += chunk; });
  preview.stderr.on('data', (chunk) => { previewLog += chunk; });

  const engines = smoke
    ? [['chromium', chromium]]
    : selected(Object.entries(browserTypes), 'DEEP_DIVE_AUDIT_BROWSERS', ([n]) => n);
  const views = smoke
    ? profiles.filter((p) => p.name === 'desktop-light' || p.name === 'phone-dark')
    : selected(profiles, 'DEEP_DIVE_AUDIT_PROFILES', (p) => p.name);

  try {
    await waitForSite(`${baseURL}/deep_dives/`, preview);
    for (const [engineName, browserType] of engines) {
      progress(`${engineName}/start`);
      const browser = await browserType.launch({ headless: true });
      try {
        for (const profile of views) {
          const context = await browser.newContext({
            baseURL,
            viewport: { width: profile.width, height: profile.height },
            colorScheme: profile.theme,
            hasTouch: profile.mobile,
          });
          await context.addInitScript((theme) => localStorage.setItem('khc-theme', theme), profile.theme);
          for (const route of list) {
            const scope = `${engineName}/${profile.name}/${route.slug}`;
            progress(scope);
            const page = await context.newPage();
            page.setDefaultTimeout(actionTimeout);
            try {
              await captureFailure(scope, () =>
                auditPage(page, scope, route, profile, screenshots && engineName === 'chromium')
              );
            } finally {
              await page.close();
            }
          }
          await context.close();
        }
        if (engineName === 'chromium') {
          await auditPrint(browser, baseURL, list);
          await auditNavigation(browser, baseURL, list);
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
    console.error(`Deep-dive UI audit failed with ${failures.length} issue(s):`);
    failures.forEach((f) => console.error(`- ${f}`));
    if (previewLog.trim()) console.error(`\nPreview output:\n${previewLog.trim()}`);
    process.exitCode = 1;
    return;
  }

  const widgetCount = list.reduce((s, r) => s + r.widgets.length, 0);
  const figureCount = list.reduce((s, r) => s + r.figures, 0);
  console.log(
    `Deep-dive UI audit passed: ${list.length} routes (${list.filter((r) => r.migrated).length} migrated), ` +
    `${figureCount} figures, ${widgetCount} widgets, across ` +
    `${engines.map(([n]) => n).join(' and ')} at ${views.map((p) => p.name).join(', ')}.`
  );
  if (screenshots) console.log(`Screenshots written to ${shotDir}/`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
