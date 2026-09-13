/** Genome-only browser gate. No model inference. Defaults to serving the built dist directory.
 * npm run audit:genome -- --url http://127.0.0.1:4321 --browsers chromium,firefox
 * --smoke: two viewports per engine; --full: also exercise every track at three scales.
 * Missing browser engines fail explicitly rather than silently reducing coverage.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const ROUTE = '/shorkie-lab/genome/';
const DEFAULT = ['lm-masked', 'sk-rnaseq', 'phastcons', 'sequence', 'genes'];
const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const artifactDir = resolve(arg('--artifacts', '/tmp/genome-audit'));

async function settled(page, allowFailure = false) {
  await page.waitForSelector('[data-gb-ready="1"]', { timeout: 60000 });
  await page.waitForFunction(() => {
    const host = document.querySelector('[data-genome-browser]');
    const canvas = host?.querySelector('[data-gb-track]');
    return canvas?.dataset.gbLanes && host.dataset.gbPending === '0';
  }, { timeout: 60000 });
  // A completed request schedules one final paint; wait for that paint, not an arbitrary delay.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (!allowFailure) assert.equal(await page.locator('[data-genome-browser]').getAttribute('data-gb-failed'), '0');
}

async function navigate(page, hash) {
  await page.evaluate((value) => { location.hash = value; }, hash);
  await settled(page);
}

async function toolsOpen(page, open = true) {
  await page.locator('.gb-tools').evaluate((el, value) => { el.open = value; }, open);
}

async function download(page, selector) {
  await toolsOpen(page);
  const waiting = page.waitForEvent('download', { timeout: 30000 });
  await page.locator(selector).click();
  const file = await waiting;
  assert.equal(await file.failure(), null);
  return readFileSync(await file.path());
}

function parseCsv(line) {
  return [...line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)]
    .map((m) => m[1] === undefined ? m[2] : m[1].replace(/""/g, '"'));
}

async function layout(page, width, height, engine) {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => { document.querySelector('[data-gb-scroll]').scrollTop = 0; });
  await settled(page);
  const data = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    const visible = (selector) => {
      const el = document.querySelector(selector), r = el.getBoundingClientRect();
      return r.width > 0 && r.left >= 0 && r.right <= innerWidth + 1
        && r.top >= 0 && r.bottom <= innerHeight;
    };
    return {
      overflow: document.querySelector('[data-gb-scroll]').scrollWidth - innerWidth,
      controls: ['[data-gb-locus]', '[data-gb-go]', '[data-gb-chrom]', '[data-gb-zoom="0.5"]', '.gb-tools > summary'].map(visible),
      tracks: innerWidth >= 1024 || visible('[data-gb-panel-toggle]'),
      track: box('[data-gb-track]'),
      lanes: JSON.parse(document.querySelector('[data-gb-track]').dataset.gbLanes),
      selected: [...document.querySelectorAll('[data-gb-toggle]:checked')].map((el) => el.dataset.gbToggle),
      nav: box('.gb-toolbar'),
    };
  });
  assert.ok(data.overflow <= 1, `${engine}/${width}: page overflows ${data.overflow}px`);
  assert.ok(data.controls.every(Boolean), `${engine}/${width}: primary controls leave the viewport`);
  assert.ok(data.tracks, `${engine}/${width}: Tracks is unreachable`);
  assert.deepEqual(data.selected.slice().sort(), DEFAULT.slice().sort());
  assert.ok(data.lanes.includes('genes') && data.lanes.includes('lm-masked'));
  assert.ok(data.track.width >= width * (width < 1024 ? 0.8 : 0.6));
  if (width === 1366) assert.ok(data.track.bottom < height, 'Focused comparison must fit the laptop viewport');
  const scrolled = await page.evaluate(() => {
    const scroller = document.querySelector('[data-gb-scroll]');
    scroller.scrollTop = 500; return scroller.scrollTop;
  });
  assert.ok(scrolled > 0);
  await page.evaluate(() => { document.querySelector('[data-gb-scroll]').scrollTop = 0; });
  if (width < 1024) {
    await page.locator('[data-gb-panel-toggle]').click();
    assert.equal(await page.locator('.gb-panel').getAttribute('aria-modal'), 'true');
    assert.ok(await page.locator('[data-gb-panel-close]').evaluate((el) => el === document.activeElement));
    assert.ok((await page.locator('.gb-mode').first().boundingBox()).height >= 44, 'Mobile model controls need a full touch target');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-gb-panel-toggle]').getAttribute('aria-expanded'), 'false');
    assert.ok(await page.locator('[data-gb-panel-toggle]').evaluate((el) => el === document.activeElement));
  }
  await page.screenshot({ path: resolve(artifactDir, `${engine}-${width}x${height}.png`) });
  if (width === 1366 || width === 390 || width === 320) {
    const scrollToSection = (selector) => page.locator(selector).evaluate((el) => {
      const scroller = document.querySelector('[data-gb-scroll]');
      scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top
        - document.querySelector('.gb-toolbar').getBoundingClientRect().height - 12;
    });
    await scrollToSection('.gb-guide');
    await page.screenshot({ path: resolve(artifactDir, `${engine}-guide-${width}.png`) });
    await page.locator('.gb-methods details').evaluateAll((els) => els.forEach((el) => { el.open = true; }));
    assert.ok(await page.locator('[data-gb-scroll]').evaluate((el) => el.scrollWidth <= innerWidth + 1), 'Expanded methods overflow the page');
    assert.ok(await page.locator('.gb-methods td').evaluateAll((els) => els.every((el) => el.getBoundingClientRect().width >= 70)), 'Methods columns are squeezed into unreadable strips');
    await scrollToSection('.gb-methods');
    await page.screenshot({ path: resolve(artifactDir, `${engine}-methods-${width}.png`) });
    await scrollToSection('.gb-track-catalog thead');
    await page.screenshot({ path: resolve(artifactDir, `${engine}-catalog-${width}.png`) });
    if (width < 700) {
      await page.locator('.gb-track-catalog').evaluate((table) => {
        const scroller = table.parentElement;
        scroller.scrollLeft = scroller.scrollWidth;
      });
      assert.ok(await page.locator('.gb-track-catalog').evaluate((table) =>
        table.querySelector('tbody td:last-child').getBoundingClientRect().width <= table.parentElement.clientWidth + 1), 'A catalog description must fit within the phone scrollport');
      await page.screenshot({ path: resolve(artifactDir, `${engine}-catalog-detail-${width}.png`) });
    }
    await page.locator('.gb-methods details').evaluateAll((els) => els.forEach((el) => { el.open = false; }));
    await page.evaluate(() => { document.querySelector('[data-gb-scroll]').scrollTop = 0; });
  }
  return data;
}

export async function auditGenomePage(browser, baseURL, { smoke = false, full = false } = {}) {
  mkdirSync(artifactDir, { recursive: true });
  const engine = browser.browserType().name();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const measurements = [];
  const progress = (s) => console.log(`[genome/${engine}] ${s}`);
  try {
    progress('loading and responsive layout');
    const start = Date.now();
    await page.goto(`${baseURL}${ROUTE}`, { waitUntil: 'networkidle', timeout: 90000 });
    await settled(page);
    const firstReadyMs = Date.now() - start;
    for (const [w, h] of smoke ? [[1366,768],[320,800]] : [[1366,768],[1440,900],[1024,768],[768,1024],[390,844],[320,800],[844,390]]) {
      measurements.push({ width: w, height: h, ...await layout(page, w, h, engine) });
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    progress('state, coordinate boundaries and keyboard navigation');
    await navigate(page, 'chrI:1-200;t=;m=lm;d=dense;a=1;h=lm-masked:120;roi=chrVII:882011-884610');
    assert.equal(await page.locator('[data-genome-browser]').getAttribute('data-gb-model-on'), 'lm');
    assert.equal(await page.locator('[data-gb-roi]').textContent(), 'marked chrVII:882,012–884,610');
    const stateHash = await page.evaluate(() => location.hash);
    await page.locator('a[href="#gb-guide"]').last().click();
    assert.equal(await page.evaluate(() => location.hash), stateHash, 'Reading guide must preserve the shared view');
    await page.evaluate(() => { document.querySelector('[data-gb-scroll]').scrollTop = 0; });
    assert.deepEqual(JSON.parse(await page.locator('[data-gb-track]').getAttribute('data-gb-lanes')), ['ruler']);
    await page.reload({ waitUntil: 'networkidle' }); await settled(page);
    assert.deepEqual(JSON.parse(await page.locator('[data-gb-track]').getAttribute('data-gb-lanes')), ['ruler']);
    await toolsOpen(page);
    await page.locator('[data-gb-export-csv]').click();
    await page.waitForFunction(() => document.querySelector('[data-gb-export-status]').textContent.includes('Select a score track'));
    await toolsOpen(page, false);
    await navigate(page, 'chrVII:882012-884610;t=lm-masked,sk-rnaseq,phastcons,genes,sequence');
    assert.equal(await page.locator('[data-genome-browser]').getAttribute('data-gb-model-on'), 'both');
    assert.equal(await page.locator('[data-genome-browser]').getAttribute('data-gb-density-on'), 'compact');
    assert.equal(await page.locator('[data-genome-browser]').getAttribute('data-gb-autoscale-on'), 'false');
    assert.equal(await page.locator('[data-gb-roi]').textContent(), '');
    await page.locator('[data-gb-locus]').fill('not-a-real-gene'); await page.locator('[data-gb-go]').click();
    assert.equal(await page.locator('[data-gb-locus]').getAttribute('aria-invalid'), 'true');
    await page.locator('[data-gb-locus]').fill('ACT1'); await page.locator('[data-gb-go]').click(); await settled(page);
    assert.ok((await page.locator('[data-gb-readout]').textContent()).startsWith('chrVI:'));
    await page.locator('[data-gb-track]').focus(); await page.keyboard.press('+'); await settled(page);
    await page.keyboard.press('Enter');
    assert.ok((await page.locator('[data-gb-score-readout]').textContent()).startsWith('chrVI:'));
    for (const region of ['chrI:1-20', 'chrI:230199-230218', 'chrM:1-85779']) {
      await navigate(page, `${region};t=lm-masked,genes,sequence`);
      assert.ok(Number(await page.locator('[data-gb-track]').getAttribute('data-gb-drawn')) > 0);
    }

    progress('mixed-resolution statistics and three export formats');
    await navigate(page, 'chrVII:882012-884610;t=lm-masked,sk-rnaseq,genes,sequence');
    const before = await page.locator('[data-gb-track]').getAttribute('data-gb-correlation');
    assert.ok(before && Number.isFinite(Number(before)));
    assert.equal(await page.locator('[data-gb-track]').getAttribute('data-gb-analysis-bin'), '16');
    const wideStats = await page.locator('[data-gb-stats] table').textContent();
    await page.setViewportSize({ width: 390, height: 844 }); await settled(page);
    assert.equal(await page.locator('[data-gb-track]').getAttribute('data-gb-correlation'), before);
    assert.equal(await page.locator('[data-gb-stats] table').textContent(), wideStats);
    await page.setViewportSize({ width: 1366, height: 768 }); await settled(page);
    const csv = (await download(page, '[data-gb-export-csv]')).toString();
    const rows = csv.split('\n').filter((s) => s && !s.startsWith('#')).map(parseCsv);
    assert.ok(rows.length > 100);
    for (const row of rows) assert.equal(row.length, 5, 'CSV fields must stay aligned even when headings contain commas');
    const values = rows.slice(1).filter((r) => r[3] !== '' && r[4] !== '').map((r) => [Number(r[3]), Number(r[4])]);
    const means = [0, 1].map((i) => values.reduce((sum, r) => sum + r[i], 0) / values.length);
    const sums = values.reduce((out, [a, b]) => [out[0] + (a-means[0])*(b-means[1]), out[1] + (a-means[0])**2, out[2] + (b-means[1])**2], [0,0,0]);
    assert.ok(Math.abs(sums[0] / Math.sqrt(sums[1] * sums[2]) - Number(before)) < 0.0001, 'CSV and plotted correlation disagree');
    assert.equal(Number(await page.locator('[data-gb-scatter]').getAttribute('data-gb-scatter-points')), values.length);
    const svg = (await download(page, '[data-gb-export-svg]')).toString();
    assert.ok(svg.includes('<svg') && svg.includes('sacCer3'));
    const png = await download(page, '[data-gb-export]');
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    await toolsOpen(page, false);

    progress('feature inspection, search and request recovery');
    await page.locator('[data-gb-feature-details] > summary').click();
    await page.locator('.gb-feature-items button').first().click();
    assert.equal(await page.locator('[data-gb-motif]').getAttribute('hidden'), null);
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('.gb-feature-items button').first().evaluate((el) => el === document.activeElement));
    await toolsOpen(page);
    await page.locator('[data-gb-find-seq]').fill('GAATTC'); await page.locator('[data-gb-find-go]').click();
    await page.waitForFunction(() => Number(document.querySelector('[data-genome-browser]').dataset.gbSearchHits) > 0);
    await page.locator('[data-gb-find-seq]').fill('NNNN');
    await page.evaluate(() => {
      document.querySelector('[data-gb-find-go]').click();
      document.querySelector('[data-gb-find-cancel]').click();
    });
    assert.equal(await page.locator('[data-genome-browser]').getAttribute('data-gb-search-hits'), '');
    await toolsOpen(page, false);

    let failedRequests = 0;
    await page.route('**/genome-data/chrVII/genes.json', (route) => { failedRequests++; return route.fulfill({ status: 503, body: 'Unavailable' }); });
    await page.goto(`${baseURL}${ROUTE}`, { waitUntil: 'networkidle' }); await settled(page, true);
    assert.equal(failedRequests, 1);
    assert.equal(await page.locator('[data-gb-retry]').isVisible(), true);
    await page.locator('[data-gb-zoom="0.5"]').click(); await settled(page, true);
    assert.equal(failedRequests, 1, 'A redraw must not retry a failed resource');
    await toolsOpen(page);
    await page.locator('[data-gb-export]').click();
    await page.waitForFunction(() => document.querySelector('[data-gb-export-status]').textContent.includes('failed to load'));
    await toolsOpen(page, false);
    await page.unroute('**/genome-data/chrVII/genes.json');
    await page.locator('[data-gb-retry]').click(); await settled(page);
    assert.ok(JSON.parse(await page.locator('[data-gb-track]').getAttribute('data-gb-gene-track')).features > 0);

    if (!smoke) {
      progress('themes, reduced motion, touch cancellation and repeated navigation');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const theme of ['light','dark','nord','monokai','cyberdeck','parchment']) {
        await page.evaluate((value) => { window.__khcTheme.set(value); }, theme); await settled(page);
        await page.screenshot({ path: resolve(artifactDir, `${engine}-${theme}.png`) });
      }
      await page.evaluate(() => window.__khcTheme.set('light'));
      await page.locator('[data-gb-track]').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 350 });
      await page.locator('[data-gb-track]').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 350 });
      assert.equal(await page.locator('[data-gb-motif]').isVisible(), false);
      for (let i = 0; i < 3; i++) {
        await page.locator('.gb-brand a').click(); await page.waitForURL('**/shorkie-lab/');
        await page.goBack(); await settled(page);
      }
      await page.goto(`${baseURL}/`, { waitUntil: 'networkidle', timeout: 90000 });
      await page.locator('[data-genome-browser]').scrollIntoViewIfNeeded();
      await settled(page);
      assert.equal(await page.locator('[data-genome-browser]').getAttribute('data-gb-minimal'), '1');
      const homeHash = await page.evaluate(() => location.hash);
      await page.locator('[data-gb-zoom="0.5"]').click(); await settled(page);
      assert.equal(await page.evaluate(() => location.hash), homeHash);
      await page.goto(`${baseURL}${ROUTE}`, { waitUntil: 'networkidle' }); await settled(page);
      if (engine === 'chromium') {
        progress('mobile touch scrolling across the canvas');
        const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
        try {
          const touchPage = await touchContext.newPage();
          await touchPage.goto(`${baseURL}${ROUTE}`, { waitUntil: 'networkidle' }); await settled(touchPage);
          const initial = await touchPage.locator('[data-gb-readout]').textContent();
          const box = await touchPage.locator('[data-gb-track]').boundingBox();
          const cdp = await touchContext.newCDPSession(touchPage);
          const x = Math.round(box.x + box.width / 2), y = Math.round(Math.min(box.y + box.height - 10, 720));
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          for (let i = 1; i <= 8; i++) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 25 }] });
            await touchPage.waitForTimeout(20);
          }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await touchPage.waitForFunction(() => document.querySelector('[data-gb-scroll]').scrollTop > 50);
          assert.equal(await touchPage.locator('[data-gb-readout]').textContent(), initial, 'Vertical scrolling must not pan the genome');
          await touchPage.screenshot({ path: resolve(artifactDir, 'chromium-touch-phone.png') });
        } finally { await touchContext.close(); }
      }
    }

    if (full) {
      progress('every score and annotation track at chromosome, gene and base scales');
      const index = await page.evaluate(() => fetch('/genome-data/index.json').then((r) => r.json()));
      const annotationIds = await page.locator('[data-gb-panel] input[type="checkbox"]').evaluateAll((els) => els.map((e) => e.dataset.gbToggle).filter(Boolean));
      const ids = [...new Set([...index.tracks.map((t) => t.id), ...annotationIds, 'genes', 'sequence'])];
      for (const id of ids) {
        for (const region of ['chrVII:1-1090940', 'chrVII:880000-888000', 'chrVII:883000-883059']) {
          await navigate(page, `${region};t=${id},genes,sequence`);
          const data = await page.locator('[data-gb-track]').evaluate((el) => ({ ...el.dataset }));
          const cache = await page.locator('[data-genome-browser]').evaluate((el) => ({ ...el.dataset }));
          assert.ok(Number(cache.gbCached) <= Number(cache.gbCacheLimit), 'Decoded cache exceeded its bound');
          if (id !== 'sequence' || region.endsWith('883059')) assert.ok(JSON.parse(data.gbLanes).includes(id), `${id} is not drawn`);
          const spec = index.tracks.find((t) => t.id === id);
          if (spec) assert.ok(JSON.parse(data.gbDrawnLevels)[id] >= (spec.nativeBp ?? 1));
        }
      }
    }
    assert.deepEqual(errors, [], 'Uncaught browser errors');
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.includes('/genome-data/')).map((r) => ({ bytes: r.transferSize, duration: r.duration })));
    const report = { engine, smoke, full, firstReadyMs, measurements, lastDocumentGenomeResources: resources.length,
      lastDocumentTransferredBytes: resources.reduce((s, r) => s + r.bytes, 0), errors };
    writeFileSync(resolve(artifactDir, `${engine}-report.json`), JSON.stringify(report, null, 2));
    progress('PASS');
    return report;
  } catch (error) {
    await page.screenshot({ path: resolve(artifactDir, `${engine}-failure.png`) }).catch(() => {});
    console.error(`[genome/${engine}] page errors:`, errors);
    throw error;
  } finally { await context.close(); }
}

async function main() {
  let server;
  let development;
  let baseURL = arg('--url', '');
  if (process.argv.includes('--dev')) {
    const { dev } = await import('astro');
    development = await dev({ server: { host: '127.0.0.1', port: 4398 } });
    baseURL = `http://127.0.0.1:${development.address.port}`;
  } else if (!baseURL) {
    const root = resolve('dist');
    assert.ok(existsSync(resolve(root, 'shorkie-lab/genome/index.html')), 'Run npm run build first');
    const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.wasm':'application/wasm' };
    server = createServer((req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        let file = resolve(root, `.${pathname}`);
        if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
        if (statSync(file).isDirectory()) file = resolve(file, 'index.html');
        res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
        createReadStream(file).pipe(res);
      } catch { res.writeHead(404).end(); }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseURL = `http://127.0.0.1:${server.address().port}`;
  }
  const failures = [];
  try {
    for (const name of arg('--browsers', 'chromium,firefox,webkit').split(',')) {
      let browser;
      try {
        assert.ok({ chromium,firefox,webkit }[name], `Unknown engine: ${name}`);
        browser = await { chromium,firefox,webkit }[name].launch();
        await auditGenomePage(browser, baseURL, { smoke: process.argv.includes('--smoke'), full: process.argv.includes('--full') && name === 'chromium' });
      } catch (error) { failures.push(`${name}: ${error.stack ?? error}`); }
      finally { await browser?.close(); }
    }
  } finally { server?.close(); await development?.stop(); }
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
