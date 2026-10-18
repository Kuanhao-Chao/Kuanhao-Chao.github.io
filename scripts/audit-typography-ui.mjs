import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright';
import { startPreview } from './lib/previewServer.mjs';

// Local/manual only: do not add this browser matrix to the lightweight push build.
const quick = process.argv.includes('--quick');
const allRoutes = process.argv.includes('--all-routes');
const engines = (process.env.TYPOGRAPHY_UI_BROWSERS || (quick ? 'chromium' : 'chromium,webkit')).split(',');
const widths = quick ? [390] : [320, 390, 820, 1024, 1440];
const artifacts = await mkdtemp(join(tmpdir(), 'khc-typography-ui-'));
const failures = [];
let checks = 0;
let activePage;
console.log(`[typography-ui] Artifacts: ${artifacts}`);

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function check(name, run) {
  checks++;
  try {
    await run();
    if (!name.startsWith('all-routes/') || checks % 30 === 0) console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
    if (activePage && !activePage.isClosed()) {
      await activePage.evaluate(() => document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close())).catch(() => {});
    }
  }
}

async function visit(page, route) {
  const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
  // WebKit exposes a validated cache entry as 304 on repeat navigation.
  assert.ok(response?.ok() || response?.status() === 304, `${route}: HTTP ${response?.status() ?? 'no response'}; current URL ${page.url()}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
}

async function fits(page) {
  const state = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  // innerWidth grows with mobile overflow and can falsely report a passing layout.
  assert.ok(state.scroll <= state.client + 1, `${state.scroll}px document exceeds ${state.client}px viewport`);
}

async function readingChecks(page, width, scope) {
  await visit(page, '/');
  await check(`${scope}: homepage hierarchy and art spacing`, async () => {
    const state = await page.evaluate(() => ({
      actions: document.querySelector('.hero-actions').getBoundingClientRect().top,
      bio: document.querySelector('.hero-bio').getBoundingClientRect().top,
      contacts: document.querySelector('.hero-socials').getBoundingClientRect().top,
      terminal: document.querySelector('.hero-terminal').getBoundingClientRect().bottom,
      windows: [...document.querySelectorAll('.home-morph-window')].map(e => e.getBoundingClientRect().height),
    }));
    assert.ok(state.actions < state.bio, 'Research/CV actions precede the complete biography');
    assert.ok(state.contacts >= state.terminal, 'contact links close the profile after the inline shell');
    if (width <= 640) assert.ok(state.windows.every(h => h <= 180), 'phone art windows stay compact');
    assert.equal(await page.locator('.news--card .news-read-more').count(), 4);
    assert.equal(await page.locator('.news--card .news-text a').count(), 0, 'teasers cannot contain clipped focusable links');
    await fits(page);
  });
  await check(`${scope}: footer opens the shared appearance panel`, async () => {
    const trigger = page.locator('footer [data-open-appearance]');
    assert.equal(await trigger.count(), 1);
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Appearance', exact: true });
    await panel.waitFor({ state: 'visible', timeout: 2000 });
    await page.keyboard.press('Escape');
    assert.equal(await trigger.evaluate(e => e === document.activeElement), true);
  });
  await check(`${scope}: full mobile lab titles`, async () => {
    if (!(await page.locator('.nav-toggle').isVisible())) return;
    await page.locator('.nav-toggle').click();
    const titles = await page.locator('.mobile-lab-title').evaluateAll(elements => elements.map(e => ({
      text: e.textContent,
      clipped: e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis',
    })));
    assert.ok(titles.length > 0);
    assert.deepEqual(titles.filter(t => t.clipped), []);
    await page.keyboard.press('Escape');
  });
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: join(artifacts, `${scope}-home.png`) });

  await visit(page, '/research/');
  await check(`${scope}: research links remain visible`, async () => {
    const links = page.locator('.rcard--index .rcard-links');
    assert.ok(await links.count());
    for (const link of await links.all()) assert.equal(await link.isVisible(), true);
  });

  await visit(page, '/software/');
  await check(`${scope}: software descriptions use the row width`, async () => {
    if (width > 620) return;
    const box = await page.locator('.tool').filter({ hasText: 'OpenSpliceAI' }).first().evaluate(e => ({
      row: e.getBoundingClientRect().width,
      text: e.querySelector('.tool-blurb').getBoundingClientRect().width,
    }));
    assert.ok(box.text >= box.row - 2, `${box.text}px description inside ${box.row}px row`);
  });
  await check(`${scope}: artwork backed in every dark theme`, async () => {
    const logo = page.locator('[data-logo="openspliceai"]').first();
    for (const theme of ['dark', 'nord', 'monokai', 'cyberdeck']) {
      await page.evaluate(t => window.__khcTheme.set(t), theme);
      const background = await logo.evaluate(e => ({ color: getComputedStyle(e).backgroundColor, image: getComputedStyle(e).backgroundImage }));
      assert.ok(background.color !== 'rgba(0, 0, 0, 0)' || background.image !== 'none', `${theme}: transparent logo backing`);
    }
    await page.evaluate(() => window.__khcTheme.set('light'));
  });
  await page.screenshot({ path: join(artifacts, `${scope}-software.png`) });

  await visit(page, '/publications/');
  await check(`${scope}: one citation disclosure per paper`, async () => {
    assert.equal(await page.locator('.pub .pub-citation').count(), await page.locator('.pub').count());
    assert.equal(await page.locator('.pub > .pub-body > .pub-links .bib').count(), 0);
    if (width <= 560) {
      const authors = page.locator('.pub-authors-disclosure').first();
      assert.ok(await authors.count(), 'long author lists remain expandable');
      await authors.locator('summary').click();
      assert.equal(await authors.getAttribute('open'), '');
    }
  });
  await check(`${scope}: citation copying and RIS export remain usable`, async () => {
    const cite = page.locator('.pub-citation').first();
    assert.equal(await cite.count(), 1);
    await cite.locator('summary').click();
    await fits(page);
    const copy = cite.getByRole('button', { name: 'Copy citation', exact: true });
    await copy.click();
    await page.waitForFunction(() => document.querySelector('.pub-citation [data-copy-label]')?.textContent === 'Copied', undefined, { timeout: 3000 });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }),
      cite.getByRole('button', { name: 'Download RIS', exact: true }).click({ timeout: 5000 }),
    ]);
    assert.equal(download.suggestedFilename(), 'citation.ris');
    const stream = await download.createReadStream();
    let text = '';
    for await (const chunk of stream) text += chunk.toString();
    assert.match(text, /TY  - /);
    assert.match(text, /Kuan-Hao/);
    await page.screenshot({ path: join(artifacts, `${scope}-citation.png`) });
    await cite.locator('summary').click();
  });

  await visit(page, '/posts/openspliceai/');
  await check(`${scope}: section anchors clear the sticky header`, async () => {
    const id = await page.locator('.prose h2[id]').first().getAttribute('id');
    await page.evaluate(id => { location.hash = id; }, id);
    await page.waitForTimeout(120);
    const state = await page.evaluate(id => ({
      heading: document.getElementById(id).getBoundingClientRect().top,
      header: document.querySelector('.site-header').getBoundingClientRect().bottom,
    }), id);
    assert.ok(state.heading >= state.header + 4, `${state.heading}px heading beneath ${state.header}px header`);
  });

  await visit(page, '/papers/alphagenome/');
  await check(`${scope}: single contents numbering`, async () => {
    const numbered = await page.locator('.paper-toc-list a').evaluateAll(links => links.filter(a => /^\d+[.)]/.test(a.textContent.trim())).length);
    assert.equal(numbered, 0, 'native ordered-list markers supply the numbering');
    await page.locator('.paper-toc').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(artifacts, `${scope}-contents.png`) });
  });

  await visit(page, '/reports/lifton-v1-0-9-technical-report/');
  await check(`${scope}: long report math stays local and tables keep semantics`, async () => {
    await fits(page);
    const tables = page.locator('.prose table');
    assert.ok(await tables.count());
    assert.equal(await tables.filter({ has: page.locator('[role="region"]') }).count(), 0);
    assert.deepEqual(await tables.evaluateAll(elements => elements.filter(e => e.getAttribute('role') === 'region').map(e => e.outerHTML.slice(0, 100))), []);
  });

  await visit(page, '/deep_dives/statgen-mathematical-foundations/');
  await check(`${scope}: fast lesson entry and mobile disclosures`, async () => {
    assert.equal(await page.locator('.dd-reading-nav a[href="#lesson-content"]').count(), 1);
    const objectives = page.locator('[data-lesson-disclosure]').first();
    assert.ok(await objectives.count());
    if (width <= 640) assert.equal(await objectives.getAttribute('open'), null);
  });
  await check(`${scope}: diagram reader opens, zooms and returns focus`, async () => {
    const figure = page.locator('[data-figure-reader]').first();
    assert.equal(await figure.count(), 1);
    const open = figure.locator('[data-figure-open]');
    await open.click();
    const dialog = figure.locator('[data-figure-dialog]');
    assert.equal(await dialog.evaluate(e => e.open), true);
    const svg = dialog.locator('svg').first();
    const before = (await svg.boundingBox()).width;
    await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.waitForFunction(before => document.querySelector('[data-figure-dialog][open] svg')?.getBoundingClientRect().width > before, before, { timeout: 3000 });
    const minimum = await svg.evaluate(svg => Math.min(...[...svg.querySelectorAll('text')].map(e =>
      parseFloat(getComputedStyle(e).fontSize) * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width
    )));
    assert.ok(minimum >= 12, `diagram labels ${minimum.toFixed(1)}px`);
    await page.screenshot({ path: join(artifacts, `${scope}-diagram.png`) });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const figure = document.querySelector('[data-figure-reader]');
      return figure?.querySelector('[data-figure-frame] svg') && figure.querySelector('[data-figure-open]') === document.activeElement;
    }, undefined, { timeout: 3000 });
    assert.equal(await figure.locator('[data-figure-frame] svg').count(), 1, 'original SVG returned; no duplicate IDs');
    assert.equal(await open.evaluate(e => e === document.activeElement), true);
    await fits(page);
  });
  await check(`${scope}: figure controls survive real Astro navigation`, async () => {
    if (await page.locator('.nav-toggle').isVisible()) {
      await page.locator('.nav-toggle').click();
      await page.locator('#mobile-menu a[href="/research/"]').click();
    } else await page.locator('.nav-desktop a[href="/research/"]').click();
    await page.waitForURL('**/research/');
    await page.goBack();
    await page.waitForURL('**/deep_dives/statgen-mathematical-foundations/');
    const figure = page.locator('[data-figure-reader]').first();
    await figure.locator('[data-figure-open]').click();
    await figure.getByRole('button', { name: 'Fit to window', exact: true }).click();
    await page.waitForFunction(() => {
      const dialog = document.querySelector('[data-figure-dialog][open]');
      if (!dialog) return false;
      const viewport = dialog.querySelector('[data-figure-viewport]');
      const svg = dialog.querySelector('svg').getBoundingClientRect();
      return svg.width <= viewport.clientWidth + 1 && svg.height <= viewport.clientHeight + 1;
    }, undefined, { timeout: 3000 });
    await page.keyboard.press('Escape');
  });

  for (const route of ['/publications/', '/talks/', '/posts/', '/deep_dives/', '/algorithms/', '/games/100-floor-descent/']) {
    await visit(page, route);
    await check(`${scope}: ${route} readable fields`, async () => {
      const small = await page.locator('main input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), main select, main textarea').evaluateAll(elements =>
        elements.filter(e => e.checkVisibility() && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.outerHTML.slice(0, 100))
      );
      assert.deepEqual(small, []);
      await fits(page);
    });
  }

  await visit(page, '/');
  await page.addStyleTag({ content: ':root { font-size: 200% !important; }' });
  await page.waitForTimeout(150);
  await check(`${scope}: 200% text keeps navigation in the viewport`, async () => {
    await fits(page);
    const controls = await page.locator('.header-actions').boundingBox();
    assert.ok(controls.x >= 0 && controls.x + controls.width <= width + 1);
    const toggle = page.locator('.nav-toggle');
    if (await toggle.isVisible()) {
      await toggle.click();
      await fits(page);
      await page.keyboard.press('Escape');
    }
  });
  await page.screenshot({ path: join(artifacts, `${scope}-enlarged.png`) });
  await visit(page, '/');
  await page.addStyleTag({ content: 'body *:not(svg):not(svg *) { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }' });
  await check(`${scope}: increased text spacing reflows`, () => fits(page));
}

async function scanBuiltRoutes(browser, baseURL) {
  const files = (await readdir('dist', { recursive: true })).filter(file => file === 'index.html' || file === '404.html' || file.endsWith('/index.html'));
  const routes = [];
  for (const file of files) {
    const html = await readFile(join('dist', file), 'utf8');
    if (!html.includes('name="generator" content="Astro') || /<meta\s+http-equiv=["']refresh/i.test(html)) continue;
    routes.push(`/${file.replace(/index.html$/, '')}`);
  }
  for (const width of [320, 820, 1440]) {
    const context = await browser.newContext({ baseURL, viewport: { width, height: 1000 }, isMobile: width < 1100, hasTouch: width < 1100, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      activePage = page;
      for (const route of routes) {
        await check(`all-routes/${width}: ${route}`, async () => { await visit(page, route); await fits(page); });
      }
    } finally { await context.close(); }
  }
  console.log(`[typography-ui] Full layout coverage: ${routes.length} built routes × 3 widths`);
}

let preview;
try {
  const baseURL = process.env.TYPOGRAPHY_UI_BASE_URL || (preview = await startPreview({ port: await availablePort() })).baseURL;
  for (const engine of engines) {
    const browser = await { chromium, webkit }[engine].launch();
    try {
      for (const width of widths) {
        const context = await browser.newContext({ baseURL, viewport: { width, height: 900 }, isMobile: width < 1100, hasTouch: width < 1100, colorScheme: 'light', reducedMotion: 'reduce' });
        if (engine === 'chromium') await context.grantPermissions(['clipboard-write']);
        try {
          activePage = await context.newPage();
          try { await readingChecks(activePage, width, `${engine}-${width}`); }
          catch (error) {
            failures.push({ name: `${engine}-${width}: unexpected runtime failure`, error: error.message });
            console.error(error.message);
          }
        } finally { await context.close(); }
      }
      if (allRoutes && engine === 'chromium') await scanBuiltRoutes(browser, baseURL);
    } finally { await browser.close(); }
  }
} finally { await preview?.stop(); }
await writeFile(join(artifacts, 'results.json'), JSON.stringify({ checks, failures }, null, 2));
console.log(`[typography-ui] ${checks - failures.length}/${checks} checks passed. Artifacts: ${artifacts}`);
if (failures.length) process.exitCode = 1;
