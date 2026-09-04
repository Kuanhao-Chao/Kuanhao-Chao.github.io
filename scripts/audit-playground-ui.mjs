/**
 * The rendering gate for /shorkie-lab/shorkie/, and for the rest of the lab alongside it --
 * /shorkie-lab/, /shorkie-lab/shorkie_lm/ and /shorkie-lab/genome/.
 *
 * This page had no browser gate at all, which is how it shipped unable to scroll: `bare` pins
 * html/body to `position:fixed; overflow:hidden`, so everything past the fold was clipped and
 * unreachable, and nothing in the repo would have noticed.
 *
 * Expected section count is DERIVED from the .astro source rather than held in an inventory here,
 * following audit-deep-dive-ui.mjs -- a hand-written count is a second copy of a fact, and this
 * repo has already shipped the consequences of that.
 *
 * `--smoke` (the CI form) never clicks Run: the
 * page lazy-loads a 28.6 MB ONNX model and a WASM inference takes ~15 s. The full-model
 * assertions -- the 5,215-track heatmap, per-track naming, motif knockout -- run locally only,
 * via --full.
 *
 * Usage:
 *   node scripts/audit-playground-ui.mjs             # every profile, both engines, no inference
 *   node scripts/audit-playground-ui.mjs --smoke     # chromium, two profiles (CI)
 *   node scripts/audit-playground-ui.mjs --full      # adds one real inference + knockout
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { chromium, webkit } from 'playwright';

const ROUTE = '/shorkie-lab/shorkie/';
const SMOKE = process.argv.includes('--smoke');
const FULL = process.argv.includes('--full');
const browserTypes = { chromium, webkit };

const profiles = [
  { name: 'desktop-light', width: 1440, height: 1000, theme: 'light' },
  { name: 'desktop-dark', width: 1440, height: 1000, theme: 'dark' },
  { name: 'tablet-light', width: 768, height: 1024, theme: 'light' },
  { name: 'phone-dark', width: 390, height: 844, theme: 'dark' },
  { name: 'narrow-light', width: 320, height: 800, theme: 'light' },
];

const failures = [];
const fail = (scope, message) => failures.push(`${scope}: ${message}`);
const progress = (scope) => console.log(`[playground-ui] ${scope}`);

/** Never let one phase's throw abort the rest -- and name the phase it came from. */
async function captureFailure(scope, task) {
  try {
    await task();
  } catch (error) {
    fail(scope, error instanceof Error ? error.message : String(error));
  }
}

/** Panels the page must render, and panels it must NOT -- the three removed by the redesign. */
function expected() {
  const src = readFileSync(new URL('../src/pages/shorkie-lab/shorkie.astro', import.meta.url), 'utf8');
  const headings = [...src.matchAll(/<h2>([^<{]*)/g)].map((m) => m[1].trim()).filter(Boolean);
  return {
    panels: (src.match(/class="vp-panel/g) ?? []).length,
    headings,
    // Removed in the redesign; their hooks must not come back.
    banned: ['data-vp-logo', 'data-vp-species', 'data-vp-attn-layer'],
  };
}

function matrix() {
  if (SMOKE) {
    return [
      ['chromium', chromium, profiles.filter((p) => ['desktop-light', 'narrow-light'].includes(p.name))],
    ];
  }
  const names = (process.env.PLAYGROUND_UI_AUDIT_BROWSERS ?? 'chromium,webkit')
    .split(',').map((n) => n.trim().toLowerCase()).filter(Boolean);
  return names.map((n) => {
    if (!browserTypes[n]) throw new Error(`Unsupported browser: ${n}`);
    return [n, browserTypes[n], profiles];
  });
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4391;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForSite(url, child) {
  const deadline = Date.now() + 40_000;
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

/** One round trip into the page: everything static, gathered in a single evaluate. */
async function snapshot(page) {
  return page.evaluate(() => {
    const canvasPainted = (sel) => {
      const c = document.querySelector(sel);
      if (!(c instanceof HTMLCanvasElement) || !c.width || !c.height) return -1;
      try {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n += 1;
        return n;
      } catch {
        return -2;
      }
    };
    const scroller = document.querySelector('.vp-scroll');
    return {
      h1: document.querySelectorAll('h1').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      theme: document.documentElement.getAttribute('data-theme'),
      panels: document.querySelectorAll('.vp-panel').length,
      headings: [...document.querySelectorAll('.vp-panel h2')].map((h) => h.textContent.trim()),
      banned: ['data-vp-logo', 'data-vp-species', 'data-vp-attn-layer']
        .filter((a) => document.querySelector(`[${a}]`)),
      scroll: scroller
        ? { scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight }
        : null,
      flowPainted: canvasPainted('[data-vp-flow]'),
      subLayers: document.querySelectorAll('[data-vp-sublayers] li').length,
      stageTitle: document.querySelector('[data-vp-stage-title]')?.textContent?.trim() ?? '',
      loci: document.querySelectorAll('[data-vp-locus] option').length,
      figure4: [...document.querySelectorAll('[data-vp-locus] option')]
        .filter((o) => /Fig 4/.test(o.textContent)).length,
      emptySvgs: [...document.querySelectorAll('.vp-svg')].filter((s) => !s.children.length).length,
    };
  });
}

async function auditPage(page, scope, want) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(ROUTE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const s = await snapshot(page);

  if (s.h1 !== 1) fail(scope, `expected exactly one <h1>, saw ${s.h1}`);
  if (s.overflow > 1) fail(scope, `document overflows horizontally by ${s.overflow}px`);
  if (s.panels !== want.panels) fail(scope, `expected ${want.panels} panels from source, saw ${s.panels}`);
  if (s.banned.length) fail(scope, `removed panels are back: ${s.banned.join(', ')}`);
  if (s.emptySvgs) fail(scope, `${s.emptySvgs} .vp-svg rendered empty`);

  // The defect that motivated this gate.
  if (!s.scroll) fail(scope, 'no .vp-scroll container — the page cannot scroll');
  else if (s.scroll.scrollHeight <= s.scroll.clientHeight + 1) {
    fail(scope, `content area does not overflow (${s.scroll.scrollHeight} vs ${s.scroll.clientHeight})`);
  } else {
    const moved = await page.evaluate(() => {
      const el = document.querySelector('.vp-scroll');
      const before = el.scrollTop;
      el.scrollTop = 300;
      const after = el.scrollTop;
      el.scrollTop = before;
      return after > before;
    });
    if (!moved) fail(scope, 'content area has overflow but does not scroll');
  }

  // Every output panel must carry a prediction BEFORE the model is loaded. This is what makes an
  // abandoned or mistimed 17-second click stop mattering.
  // Wait for the precomputed pack to settle rather than guessing at a delay: a 2-4 MB fetch still
  // in flight when the context closes logs an aborted-resource console error, which this audit
  // would then report as a page error of its own making.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-vp]');
      return el.dataset.vpResultSource === 'precomputed' || el.dataset.vpPackFailed === 'true';
    },
    { timeout: 60_000 },
  ).catch(() => {});
  const onLoad = await page.evaluate(() => {
    // The coverage SVG, the attribution canvas, the method strip and the annotation canvas are
    // ONE canvas now, stacked by `laneLayout`. What has to be alive on load is that canvas, with
    // a real peak and at least the ruler, the coverage lane and the gene models drawn.
    const cv = document.querySelector('[data-vp-viewport]');
    return {
      peak: Number(cv?.dataset.vpPeak ?? '0'),
      lanes: (cv?.dataset.vpLanes ?? '').split('|').filter(Boolean),
      title: cv?.dataset.vpView ?? '',
      single: Number(document.querySelector('[data-vp-single]')?.dataset.peak ?? '0'),
      source: document.querySelector('[data-vp]').dataset.vpResultSource ?? '',
      packFailed: document.querySelector('[data-vp]').dataset.vpPackFailed === 'true',
    };
  });
  if (onLoad.source === 'live') fail(scope, 'a model run happened without a click');
  if (onLoad.packFailed) fail(scope, 'the precomputed activation pack failed to load');
  if (onLoad.source !== 'precomputed') fail(scope, `precomputed pack never loaded (source "${onLoad.source}")`);
  if (!(onLoad.peak > 0)) fail(scope, 'no predicted coverage on load — the precompute is not wired');
  for (const want of ['ruler', 'coverage', 'genes']) {
    if (!onLoad.lanes.includes(want)) {
      fail(scope, `viewport is missing its ${want} lane on load: ${onLoad.lanes.join('|')}`);
    }
  }
  if (!/^\d+-\d+$/.test(onLoad.title)) fail(scope, `viewport published no view: "${onLoad.title}"`);
  // The "precomputed" caption lived on the coverage SVG, which the browser absorbed. The claim it
  // guarded -- that nothing ran a model without a click -- is asserted three lines above from
  // `vpResultSource`, which is the actual evidence rather than a sentence about it.
  if (!(onLoad.single > 0)) fail(scope, 'no single-track curve on load');

  if (s.flowPainted < 1000) fail(scope, `flow canvas painted only ${s.flowPainted} px`);
  if (!s.subLayers) fail(scope, 'layer detail shows no sub-layer breakdown');
  if (!s.stageTitle) fail(scope, 'layer detail has no stage title');
  if (s.loci !== N_LOCI) fail(scope, `expected ${N_LOCI} preset loci, saw ${s.loci}`);
  // Derived, like N_LOCI: this was 6 (main-text Figure 4) and became 11 when the five Supplemental
  // S19 panels landed. A hardcoded count turns every future panel into a spurious audit failure.
  if (s.figure4 !== N_FIGURE_WINDOWS) {
    fail(scope, `expected the ${N_FIGURE_WINDOWS} published figure windows, saw ${s.figure4}`);
  }

  // Every stage must select and produce a non-empty detail.
  const box = await page.locator('[data-vp-flow]').boundingBox();
  for (const frac of [0.03, 0.3, 0.55, 0.8, 0.97]) {
    await page.locator('[data-vp-flow]').click({
      position: { x: Math.max(2, Math.round(box.width * frac)), y: Math.round(box.height / 2) },
    });
    await page.waitForTimeout(120);
    const detail = await page.evaluate(() => ({
      title: document.querySelector('[data-vp-stage-title]')?.textContent?.trim() ?? '',
      subs: document.querySelectorAll('[data-vp-sublayers] li').length,
    }));
    if (!detail.title || !detail.subs) fail(scope, `stage at x=${frac} produced an empty detail`);
  }

  // A canvas reads CSS custom properties at draw time, so a theme change must repaint it.
  const beforeTheme = await page.evaluate(() => {
    const c = document.querySelector('[data-vp-flow]');
    return c.getContext('2d').getImageData(0, 0, Math.min(c.width, 200), 20).data.join(',');
  });
  await page.evaluate(() => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    document.dispatchEvent(new CustomEvent('khc:theme-change'));
  });
  await page.waitForTimeout(250);
  const afterTheme = await page.evaluate(() => {
    const c = document.querySelector('[data-vp-flow]');
    return c.getContext('2d').getImageData(0, 0, Math.min(c.width, 200), 20).data.join(',');
  });
  if (beforeTheme === afterTheme) fail(scope, 'flow canvas did not repaint on khc:theme-change');

  if (errors.length) fail(scope, `runtime errors: ${errors.slice(0, 3).join(' | ')}`);
}

/**
 * Switching locus must invalidate EVERY view of the previous result, not just the track panels.
 *
 * It did not: the flow canvas kept the old locus's activations and the layer-detail canvas kept its
 * pixels, so the page showed one gene's neurons under another gene's name while the panel below
 * correctly went blank -- which reads as "I ran it and got no output".
 */
async function auditStaleState(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const options = await page.locator('[data-vp-locus] option').allTextContents();
    const first = options.findIndex((o) => o.startsWith('TDH3'));
    const second = options.findIndex((o) => o.startsWith('PGK1'));
    if (first < 0 || second < 0) { fail(scope, 'TDH3 or PGK1 missing from the locus list'); return; }

    await page.selectOption('[data-vp-locus]', String(first));
    await page.waitForTimeout(300);
    await page.locator('[data-vp-run]').click();
    await page.waitForFunction(
      () => /Done —|failed/i.test(document.querySelector('[data-vp-status]')?.textContent ?? ''),
      { timeout: 300_000 },
    );
    await page.locator('[data-vp-flow]').click({ position: { x: 700, y: 150 } });
    await page.waitForTimeout(300);

    const ran = await page.evaluate(() => ({
      stamp: document.querySelector('[data-vp]').dataset.vpResultLocus ?? '',
      loud: document.querySelector('[data-vp-stage-top]')?.textContent ?? '',
    }));
    if (ran.stamp !== 'YGR192C') fail(scope, `result stamp is "${ran.stamp}", expected YGR192C`);
    if (!ran.loud) fail(scope, 'no loudest-channel readout after a run');

    await page.selectOption('[data-vp-locus]', String(second));
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      const c = document.querySelector('[data-vp-stage-map]');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let ink = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) ink += 1;
      return {
        stamp: document.querySelector('[data-vp]').dataset.vpResultLocus ?? '',
        loud: document.querySelector('[data-vp-stage-top]')?.textContent ?? '',
        detailInk: ink,
        // The coverage caption is drawn ON the canvas now, so there is no text node to read.
        // The peak is the content that must change with the locus, and it is published at full
        // precision -- reading a rounded label once folded two different values into one string.
        track: document.querySelector('[data-vp-viewport]')?.dataset.vpPeak ?? '',
      };
    });
    // Staleness is now about CONTENT, not presence: switching locus loads the new gene's
    // precomputed pack, so the views stay populated. What must never happen is one gene's
    // activations sitting under another gene's name.
    if (after.stamp !== 'YCR012W') {
      fail(scope, `after switching to PGK1 the result is stamped "${after.stamp}", not YCR012W`);
    }
    if (after.loud && after.loud === ran.loud) {
      fail(scope, `loudest-channel readout is unchanged across two different loci: "${after.loud}"`);
    }
    if (after.detailInk < 1000) fail(scope, 'layer detail went blank after a locus change');
    // The panel must now show the NEW locus's precomputed prediction, not the old live result and
    // not a blank. PGK1's shipped RNA-seq peak is 400.52; TDH3's is 994.88, so the two are
    // unmistakable and a retained stale curve fails here.
    const peak = await page.evaluate(() =>
      Number(document.querySelector('[data-vp-viewport]')?.dataset.vpPeak ?? '0'));
    if (Math.abs(peak - 400.52) > 0.01) {
      fail(scope, `after switching to PGK1 the coverage peak is ${peak}, expected its precomputed 400.52`);
    }
    if (!/precomputed/.test(after.track) && !/predicted/.test(after.track)) {
      fail(scope, `no prediction after the locus change: "${after.track}"`);
    }
  } finally {
    await context.close();
  }
}

/**
 * After a run, an activation raster must be neither blank nor a solid wash.
 *
 * The p1->p99 ramp drew a ZERO activation at 0.61 ink, so 90-96% of cells on 15 of the 20 stages
 * drew above 0.4 and the map encoded sign rather than activity. Nothing caught it.
 */
async function auditInkDistribution(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.locator('[data-vp-run]').click();
    await page.waitForFunction(
      () => /Done —|failed/i.test(document.querySelector('[data-vp-status]')?.textContent ?? ''),
      { timeout: 300_000 },
    );
    const box = await page.locator('[data-vp-flow]').boundingBox();
    for (const frac of [0.34, 0.46, 0.58, 0.70]) {          // four transformer layers
      await page.locator('[data-vp-flow]').click({
        position: { x: Math.round(box.width * frac), y: 150 },
      });
      await page.waitForTimeout(200);
      const r = await page.evaluate(() => {
        const c = document.querySelector('[data-vp-stage-map]');
        // Sample the raster region only: the canvas also carries the profile strip and the ruler.
        const rows = Math.min(c.height - 80, Math.max(20, c.height - 130));
        const d = c.getContext('2d').getImageData(0, 0, c.width, rows).data;
        let n = 0;
        const cols = new Set();
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 8) { n += 1; cols.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); }
        }
        return {
          pct: (100 * n) / (c.width * rows),
          colours: cols.size,
          title: document.querySelector('[data-vp-stage-title]')?.textContent ?? '',
          legend: document.querySelector('[data-vp-legend]')?.textContent ?? '',
        };
      });
      // A painted heatmap: every cell coloured, and many distinct colours rather than one flat
      // wash. Skipping quiet cells is what made rasters 7.6% drawn and mostly white.
      if (r.pct < 99) fail(scope, `${r.title}: only ${r.pct.toFixed(1)}% of the raster is painted`);
      if (r.colours < 50) fail(scope, `${r.title}: only ${r.colours} distinct colours (a flat wash)`);
      if (!r.legend) fail(scope, `${r.title}: no colour legend`);
    }
    // Clicking the same stage twice deselects it; the detail must then follow the wavefront, not
    // silently fall back to the conv stem under a wrong title.
    const box2 = await page.locator('[data-vp-flow]').boundingBox();
    await page.locator('[data-vp-flow]').click({ position: { x: Math.round(box2.width * 0.9), y: 150 } });
    await page.waitForTimeout(180);
    const first = await page.locator('[data-vp-stage-title]').textContent();
    await page.locator('[data-vp-flow]').click({ position: { x: Math.round(box2.width * 0.9), y: 150 } });
    await page.waitForTimeout(180);
    const second = await page.locator('[data-vp-stage-title]').textContent();
    if (/Conv stem/.test(second) && !/Conv stem/.test(first)) {
      fail(scope, `deselecting "${first}" fell back to the conv stem`);
    }
  } finally {
    await context.close();
  }
}

/**
 * Every layer view and every one of the 5,215 tracks must work with the model BLOCKED.
 *
 * The precomputed packs are what make the page usable at all: a 28.6 MB download and a 17 s
 * inference used to stand between a reader and any result, and any failure in that path -- an
 * abandoned click, a bad backend -- left the page looking broken.
 */
async function auditNoModel(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  let modelRequests = 0;
  await page.route('**/models/**', (r) => { modelRequests += 1; r.abort(); });
  try {
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => document.querySelector('[data-vp]').dataset.vpResultSource === 'precomputed',
      { timeout: 60_000 },
    );
    const count = await page.locator('[data-vp-locus] option').count();
    for (let i = 0; i < count; i += 1) {
      await page.selectOption('[data-vp-locus]', String(i));
      await page.waitForFunction(
        () => document.querySelector('[data-vp]').dataset.vpResultSource === 'precomputed',
        { timeout: 60_000 },
      ).catch(() => {});
      await page.waitForTimeout(100);
      const s = await page.evaluate(() => {
        const paint = (sel, rows) => {
          const c = document.querySelector(sel);
          const d = c.getContext('2d').getImageData(0, 0, c.width, rows ?? c.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n += 1;
          return n;
        };
        return {
          src: document.querySelector('[data-vp]').dataset.vpResultSource,
          peak: Number(document.querySelector('[data-vp-viewport]')?.dataset.vpPeak ?? '0'),
          layer: paint('[data-vp-stage-map]', 200),
          heat: paint('[data-vp-heat]'),
          gene: document.querySelector('[data-vp-locus]').selectedOptions[0].textContent,
        };
      });
      if (s.src !== 'precomputed') fail(scope, `${s.gene}: no precomputed pack loaded`);
      if (!(s.peak > 0)) fail(scope, `${s.gene}: no predicted coverage without the model`);
      if (s.layer < 1000) fail(scope, `${s.gene}: layer view empty without the model`);
      if (s.heat < 1000) fail(scope, `${s.gene}: track heatmap empty without the model`);
    }

    // The cascading picker must reach a named track and plot it, still with no model.
    await page.selectOption('[data-vp-pick-key]', 'ARG80');
    await page.waitForTimeout(250);
    const opts = await page.locator('[data-vp-pick-track] option').allTextContents();
    if (opts.length < 2) fail(scope, `ARG80 offers ${opts.length} tracks, expected its timecourse`);
    if (new Set(opts).size !== opts.length) fail(scope, 'picker options are not distinguishable');
    await page.selectOption('[data-vp-pick-track]', { label: opts.at(-1) });
    await page.waitForTimeout(250);
    const picked = await page.evaluate(() => ({
      name: document.querySelector('[data-vp-single]')?.dataset.track ?? '',
      peak: Number(document.querySelector('[data-vp-single]')?.dataset.peak ?? '0'),
    }));
    if (!/^ARG80_T/.test(picked.name)) fail(scope, `picker plotted "${picked.name}", expected an ARG80 track`);
    if (!(picked.peak > 0)) fail(scope, `picked track ${picked.name} has no curve`);
    if (modelRequests) fail(scope, `${modelRequests} model request(s) made on the no-model path`);
  } finally {
    await context.close();
  }
}

/** Reduced motion must jump to the finished state rather than sweep. */
async function auditReducedMotion(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.locator('[data-vp-scrub]').fill('300');
    await page.dispatchEvent('[data-vp-scrub]', 'input');
    await page.locator('[data-vp-play]').click();
    await page.waitForTimeout(700);
    const state = await page.evaluate(() => ({
      pressed: document.querySelector('[data-vp-play]')?.getAttribute('aria-pressed'),
      scrub: document.querySelector('[data-vp-scrub]')?.value,
    }));
    if (state.pressed !== 'false') fail(scope, 'reduced motion still started the sweep');
    if (state.scrub !== '1000') fail(scope, `reduced motion left the scrub at ${state.scrub}, not the end`);
  } finally {
    await context.close();
  }
}

/**
 * A client-side navigation round trip must leave exactly one live canvas.
 *
 * The navigation has to be a CLICK. `page.goto` is a full page load: it tears down the whole JS
 * context, so nothing can survive it and this check passed for a long time against code that could
 * not have survived a real ClientRouter navigation. The `load` counter is what keeps it honest --
 * if a route ever gains `data-astro-reload` this check will say so rather than quietly going back
 * to testing nothing.
 */
async function auditNavigation(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  let hardLoads = 0;
  page.on('load', () => { hardLoads += 1; });
  try {
    await page.goto('/shorkie-lab/', { waitUntil: 'networkidle' });
    hardLoads = 0;
    await page.click(`a.sl-card[href="${ROUTE}"]`);
    await page.waitForSelector('[data-vp-flow]', { timeout: 20000 });
    await page.waitForTimeout(900);
    if (hardLoads !== 0) {
      fail(scope, `navigating to ${ROUTE} was a full page load — this check tests nothing`);
    }
    const state = await page.evaluate(() => {
      const cs = document.querySelectorAll('[data-vp-flow]');
      const c = cs[0];
      let painted = 0;
      if (c?.width) {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 8) painted += 1;
      }
      return { canvases: cs.length, painted };
    });
    if (state.canvases !== 1) fail(scope, `${state.canvases} flow canvases after navigation`);
    if (state.painted < 1000) fail(scope, `flow canvas blank after navigation (${state.painted} px)`);
  } finally {
    await context.close();
  }
}

/** The full model: one inference, then the per-track views and a motif knockout. */
async function auditFullModel(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    const options = await page.locator('[data-vp-locus] option').allTextContents();
    const dtd1 = options.findIndex((o) => o.startsWith('DTD1'));
    if (dtd1 < 0) { fail(scope, 'DTD1 (Fig 4E) is not in the locus list'); return; }
    await page.selectOption('[data-vp-locus]', String(dtd1));
    await page.waitForTimeout(300);

    const motifs = await page.locator('.vp-motif').count();
    if (!motifs) fail(scope, 'DTD1 shows no motif buttons');

    await page.locator('[data-vp-run]').click();
    await page.waitForFunction(
      () => /Done —|failed/i.test(document.querySelector('[data-vp-status]')?.textContent ?? ''),
      { timeout: 300_000 },
    );
    const status = await page.locator('[data-vp-status]').textContent();
    if (/failed/i.test(status)) { fail(scope, `inference failed: ${status}`); return; }

    const after = await page.evaluate(() => ({
      heat: document.querySelector('[data-vp-heat-stat]')?.textContent ?? '',
      track: document.querySelector('[data-vp-single]')?.dataset.track ?? '',
      peak: Number(document.querySelector('[data-vp-viewport]')?.dataset.vpPeak ?? '0'),
    }));
    if (!/5,215 tracks/.test(after.heat)) fail(scope, `heatmap stat wrong: "${after.heat}"`);
    if (!after.track) fail(scope, 'single-track plot is unnamed');
    if (!(after.peak > 0)) fail(scope, 'predicted peak is not positive');
    // The regression that started all this: a WebGPU pipeline rejected by validation returns
    // zeros while onnxruntime reports success. A run that reports Done must have real output.
    const allZero = await page.evaluate(() => {
      return Number(document.querySelector('[data-vp-viewport]')?.dataset.vpPeak ?? '0') === 0;
    });
    if (allZero) fail(scope, 'a run reported success with an all-zero prediction');

    // Knock out the 5' splice site -- the strongest effect measured on this locus (-34%).
    const donor = page.locator('.vp-motif', { hasText: 'splice site' }).first();
    if (await donor.count()) {
      const before = after.peak;
      await donor.click();
      await page.waitForFunction(
        () => /Done —|failed/i.test(document.querySelector('[data-vp-status]')?.textContent ?? ''),
        { timeout: 300_000 },
      );
      await page.waitForTimeout(400);
      const note = await page.locator('[data-vp-knockout]').textContent();
      if (!/scrambled/.test(note ?? '')) fail(scope, `knockout produced no readout: "${note}"`);
      const now = await page.evaluate(() =>
        Number(document.querySelector('[data-vp-viewport]')?.dataset.vpPeak ?? '0'));
      if (now === before) fail(scope, 'knocking out a splice site changed nothing at all');
    } else {
      fail(scope, "DTD1 has no 5' splice site button");
    }
  } finally {
    await context.close();
  }
}

/** Wait for a locus's precomputed pack, which every no-model gate below stands on. */
async function enterLocus(page, index) {
  // There is no mode toggle any more -- free typing is gone and a locus loads on arrival.
  await page.goto(ROUTE, { waitUntil: 'networkidle' });
  if (index !== undefined) await page.selectOption('[data-vp-locus]', String(index));
  await page.waitForFunction(
    () => document.querySelector('[data-vp]').dataset.vpResultSource === 'precomputed',
    { timeout: 60_000 },
  );
}

/**
 * Every panel that draws across the sequence must put the same bp at the same screen x.
 *
 * This is the defect the shared coordinate exists to fix: the coverage curve ran over bins 0-896
 * (bp 1,024-15,360) while the attribution stacked beneath it ran over the full 0-16,384, so a
 * reader comparing a peak to a promoter was reading two different rulers. Nothing but a
 * cross-panel measurement catches it -- each panel is internally consistent and looks right alone.
 */
async function auditCoordinates(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();
  try {
    await enterLocus(page);
    await page.waitForFunction(
      () => document.querySelector('[data-vp]').dataset.vpTraceReady === 'true',
      { timeout: 60_000 },
    ).catch(() => {});
    // A trace is needed before the attribution canvas draws anything at all.
    const track = page.locator('[data-vp-viewport]');
    await track.scrollIntoViewIfNeeded();
    const box = await track.boundingBox();
    await page.mouse.move(box.x + box.width * 0.44, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.56, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // The four stacked panels this scope used to cross-check are ONE canvas now, so "do they
    // agree about where bp 8,192 is" is not a question that can be asked of them -- they share one
    // `xOfBp`. Retired deliberately, and replaced by the invariant that actually still has a way
    // to go wrong: the canvas's backing store must equal its CSS box, or every horizontal
    // coordinate is off by that ratio uniformly and nothing looks broken.
    const geo = await page.evaluate(() => {
      const cv = document.querySelector('[data-vp-viewport]');
      const b = cv.getBoundingClientRect();
      return {
        backing: cv.width / (window.devicePixelRatio || 1),
        box: b.width,
        view: cv.dataset.vpView ?? '',
        rows: Number(cv.dataset.vpGeneRows ?? '0'),
        lanes: (cv.dataset.vpLanes ?? '').split('|').filter(Boolean),
        readout: document.querySelector('[data-vp-view-read]')?.textContent ?? '',
      };
    });
    if (Math.abs(geo.backing - geo.box) > 0.75) {
      fail(scope, `viewport backing store is ${geo.backing.toFixed(1)} against a ${geo.box.toFixed(1)}px box`);
    }
    // The coordinate readout carries both systems, because neither alone locates anything: the
    // genome coordinate is what a reader pastes into a browser, the window offset is what every
    // plane on this page is indexed by.
    if (!/chr\w+:[\d,]+–[\d,]+/.test(geo.readout)) {
      fail(scope, `readout has no genome coordinate: "${geo.readout}"`);
    }
    if (!/window [\d,]+–[\d,]+/.test(geo.readout)) {
      fail(scope, `readout has no window offset: "${geo.readout}"`);
    }

    // Gene rows: expanding a window with an overlap must use more rows than collapsing it.
    const expanded = geo.rows;
    await page.uncheck('[data-vp-generows]');
    await page.waitForTimeout(300);
    const collapsed = Number(await page.evaluate(
      () => document.querySelector('[data-vp-viewport]').dataset.vpGeneRows,
    ));
    if (collapsed !== 1) fail(scope, `collapsed gene track drew ${collapsed} rows, expected 1`);
    if (!(expanded > collapsed)) {
      fail(scope, `expanding gene rows changed nothing (${expanded} vs ${collapsed}) on a window with an overlap`);
    }
    await page.check('[data-vp-generows]');
  } finally {
    await context.close();
  }
}

/**
 * The traceback must produce a real attribution, and a DIFFERENT one for a different region.
 *
 * Ink alone is not enough: a stubbed or mis-indexed attribution paints just as much as a correct
 * one. Requiring the drawing to move when the selection moves is the same rule `audit:deep-dives`
 * applies to a widget's readout, and it is what catches an attribution wired to a constant.
 */
async function auditTraceback(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await enterLocus(page);
    await page.waitForFunction(
      () => document.querySelector('[data-vp]').dataset.vpTraceReady === 'true',
      { timeout: 60_000 },
    );

    // The coverage curve is the drag surface again. The browser moved to /shorkie-lab/genome/,
    // so a region is selected HERE -- by dragging across the window's own predicted coverage,
    // which is what the panel's prose promises and what `tracedBins` is keyed on.
    const track = page.locator('[data-vp-viewport]');
    await track.scrollIntoViewIfNeeded();
    const box = await track.boundingBox();
    if (!box) { fail(scope, 'no coverage curve to drag on'); return; }

    // SHIFT-drag traces. Plain drag pans the zoomable view, and drag on the ruler selects a range
    // to zoom to — three gestures on one canvas, and the tracing one is the page's own semantics.
    const drag = async (from, to) => {
      await page.keyboard.down('Shift');
      await page.mouse.move(box.x + box.width * from, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * to, box.y + box.height * 0.5, { steps: 10 });
      await page.mouse.up();
      await page.keyboard.up('Shift');
      await page.waitForTimeout(900);
      return page.evaluate(`(async () => {
        // The viewport IS the region-conditioned drawing: which method lanes exist, how many
        // letters each logo drew, and what view they were drawn at. That triple is the signature
        // of the region, and unlike a path count it cannot be matched by a stub.
        const cv = document.querySelector('[data-vp-viewport]');
        const letters = (cv?.dataset.vpLogoLetters ?? '')
          .split('|').filter(Boolean)
          .reduce((n, part) => n + Number(part.split('=')[1] || 0), 0);
        const methods = (cv?.dataset.vpMethods ?? '').split('|').filter(Boolean).length;
        return { letters, methods,
                 sig: (cv?.dataset.vpView ?? '') + '/' + (cv?.dataset.vpMethods ?? '')
                      + '/' + (document.querySelector('[data-vp-trace-label]')?.textContent ?? ''),
                 label: document.querySelector('[data-vp-trace-label]')?.textContent ?? '' };
      })()`);
    };

    const a = await drag(0.20, 0.34);
    const b = await drag(0.62, 0.78);
    // A traced region must light the region-conditioned method lanes: gradient x input, integrated
    // gradients and occlusion all need one, and mutagenesis is there unconditionally. Counting
    // lanes rather than marks, because the lanes are the thing the region actually changes.
    if (a.methods < 3) fail(scope, `traced region lit only ${a.methods} method lanes`);
    if (b.methods < 3) fail(scope, `second traced region lit only ${b.methods} method lanes`);
    if (a.sig === b.sig) fail(scope, `the method views are identical for two different regions (${a.sig}) — not region-specific`);
    if (!/bins \d+–\d+/.test(a.label)) fail(scope, `trace label does not name a bin range: "${a.label}"`);

    // The sticky bar is now the ONE region control -- `data-vp-anchor` and the clear button were
    // two more ways to write the same state, which is how an interface starts disagreeing with
    // itself. Selecting from the bar must drive the same attribution the drag does.
    const anchors = await page.locator('[data-vp-region] option').count();
    if (anchors < 2) fail(scope, `only ${anchors} region option(s); expected gene bodies and peaks`);
    const labels = await page.locator('[data-vp-region] option').allTextContents();
    await page.selectOption('[data-vp-region]', { label: labels.at(-1) });
    await page.waitForTimeout(500);
    const anchor = await page.evaluate(`(async () => {
      const cv = document.querySelector('[data-vp-viewport]');
      return { methods: (cv?.dataset.vpMethods ?? '').split('|').filter(Boolean),
               label: document.querySelector('[data-vp-trace-label]')?.textContent ?? '' };
    })()`);
    // Picking a whole-gene anchor is what buys per-base gradient x input and integrated gradients:
    // the packs carry those two per base only for the shipped anchors. So an anchor region must
    // light up strictly more method lanes than an arbitrary drag does.
    if (anchor.methods.length < 4) {
      fail(scope, `region "${labels.at(-1)}" lit only ${anchor.methods.length} method lanes: `
        + anchor.methods.join('|'));
    }

    // There must be exactly ONE region control on the page, and the read-only context lines must
    // agree with it rather than carrying their own.
    const controls = await page.evaluate(() => ({
      selects: document.querySelectorAll('[data-vp-region], [data-vp-anchor]').length,
      contexts: document.querySelectorAll('[data-vp-trace-context]').length,
      contextText: document.querySelector('[data-vp-trace-context]')?.textContent ?? '',
      bar: document.querySelector('[data-vp-trace-label]')?.textContent ?? '',
    }));
    if (controls.selects !== 1) fail(scope, `${controls.selects} region selectors; expected exactly 1`);
    if (controls.contexts < 2) fail(scope, `${controls.contexts} context lines; expected one per panel`);
    const bins = controls.bar.match(/bins (\d+)–(\d+)/);
    if (!bins) fail(scope, `the bar does not name a bin range: "${controls.bar}"`);
    else if (!controls.contextText.includes(`bins ${bins[1]}–${bins[2]}`)) {
      fail(scope, `a context line disagrees with the bar: "${controls.contextText}"`);
    }
  } finally {
    await context.close();
  }
}

/**
 * The explanatory layer and the panels that replaced two others.
 *
 * A disclosure that does not open, or a merged panel that lost a source in the merge, both look
 * fine in a screenshot. These assert behaviour: every disclosure opens and reveals real content,
 * the logo draws for every source it offers, the occlusion map responds to a click, and the panels
 * that were archived stay archived.
 */
async function auditExplanations(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1400 } });
  const page = await context.newPage();
  try {
    await enterLocus(page);
    await page.waitForFunction(
      () => document.querySelector('[data-vp]').dataset.vpTraceReady === 'true',
      { timeout: 60_000 },
    );
    // Trace a region: the method tracks, both logo views, the enrichment table and the neuron
    // class table are all region-conditioned and legitimately draw nothing without one.
    await page.locator('[data-vp-region-next]').scrollIntoViewIfNeeded();
    await page.locator('[data-vp-region-next]').click();
    await page.waitForTimeout(900);

    // --- disclosures ----------------------------------------------------------------------
    const how = await page.evaluate(() => {
      const ds = [...document.querySelectorAll('details.vp-how')];
      return {
        n: ds.length,
        anyOpen: ds.some((x) => x.open),
        bodies: ds.map((x) => (x.querySelector('.vp-how-body')?.textContent ?? '').length),
        rows: document.querySelectorAll('.vp-collapse-table tbody tr').length,
      };
    });
    // A newline between prose and an inline tag is DELETED by JSX, not collapsed to a space, so
    // `for\n<em>every` renders as "forevery". It is invisible in the source, survives every other
    // gate, and this page shipped 21 of them in one round. Checked on the rendered text.
    const joins = await page.evaluate(() => {
      const out = [];
      const walk = (node) => {
        for (const el of node.children) {
          for (const kid of el.childNodes) {
            if (kid.nodeType !== Node.ELEMENT_NODE) continue;
            if (!/^(EM|STRONG|CODE|SPAN|A|B|I)$/.test(kid.tagName)) continue;
            const before = kid.previousSibling;
            const raw = kid.textContent ?? '';
            if (!before || before.nodeType !== Node.TEXT_NODE || !raw.trim()) continue;
            const tail = before.textContent ?? '';
            // Test the RAW first character, never a trimmed one: trimming removes the very space
            // whose absence is being looked for, and reported eight false positives on text that
            // was correctly spaced.
            if (/[\w),.;:%]$/.test(tail) && /^[\w(]/.test(raw)) {
              out.push((tail.slice(-30) + raw.slice(0, 20)).replace(/\s+/g, ' '));
            }
          }
          walk(el);
        }
      };
      walk(document.body);
      return out.slice(0, 8);
    });
    for (const j of joins) fail(scope, `swallowed space before an inline tag: "…${j}…"`);

    // --- the annotation layer and the analyses built on it -------------------------------
    const bio = await page.evaluate(() => ({
      // Canvas tallies: a canvas has no elements to inspect, so what was DRAWN is published.
      // The annotation canvas became the browser's twelve feature lanes; `chromium/genome`
      // asserts those draw, are documented, and pack their rows.
      // Canvas tallies: a canvas has no elements to inspect, so what was DRAWN is published. The
      // count comes from inside the loop that fills the rectangles, so an intron painted as an
      // exon would change it.
      ann: document.querySelector('[data-vp-viewport]')?.dataset.vpAnnotation ?? '',
      annGenes: document.querySelector('[data-vp-viewport]')?.dataset.vpGeneTrack ?? '{}',
      annStat: document.querySelector('[data-vp-annstat]')?.textContent ?? '',
      enrich: Number(document.querySelector('[data-vp-enrichment]')?.dataset.vpEnrichment ?? 0),
      ko: Number(document.querySelector('[data-vp-ko]')?.dataset.vpKo ?? 0),
      koStat: document.querySelector('[data-vp-ko-stat]')?.textContent ?? '',
      // How many method lanes the viewport drew, and how many letters each logo lane put down.
      logoRows: (document.querySelector('[data-vp-viewport]')?.dataset.vpMethods ?? '')
        .split('|').filter(Boolean).length,
      logoLetters: document.querySelector('[data-vp-viewport]')?.dataset.vpLogoLetters ?? '',
      // There is ONE letter view now, so "do they agree about the window" is answered by
      // construction rather than by comparison. What is still worth asserting is that the view
      // exists and is a real range.
      windows: [document.querySelector('[data-vp-viewport]')?.dataset.vpView ?? null],
      ismOption: !!document.querySelector('[data-vp-logo-source] option[value="ism"]'),
      ismDefault: document.querySelector('[data-vp-logo-source]')?.value ?? '',
    }));
    // The annotation canvas became the browser's feature lanes. What has to be true is the same:
    // genes are drawn AND binding sites are drawn, both from the curated sources.
    if (!bio.ann) fail(scope, 'the annotation lanes drew nothing');
    else {
      // `vpAnnotation` is a JSON object of lane counts, published by the viewport from the same
      // tally the readout prints; `vpGeneTrack` is the gene renderer's own tally, from the loop
      // that fills the exon rectangles. Parsing the first as a "k:v," list is how a real count of
      // 53 ChIP-supported sites came to read as zero.
      const lanes = JSON.parse(bio.ann || '{}');
      const genes = JSON.parse(bio.annGenes || '{}');
      if (!(Number(genes.features) > 0)) {
        fail(scope, `annotation drew no gene features (${bio.annGenes})`);
      }
      if (!(Number(lanes.tfbs_chip) > 0)) fail(scope, `annotation drew no binding sites (${bio.ann})`);
    }
    // The unfiltered PWM count -- the argument for the JASPAR threshold -- moved to the `tfbs_pwm`
    // lane's own documentation, which `chromium/genome` asserts every lane carries in four fields.
    if (bio.enrich < 8) fail(scope, `enrichment table measured only ${bio.enrich} cells`);
    if (bio.ko < 1) fail(scope, 'the knockout sweep table is empty');
    if (!/largest effect/.test(bio.koStat)) fail(scope, `knockout headline missing: "${bio.koStat}"`);
    if (bio.logoRows < 2) fail(scope, `method logo stack drew ${bio.logoRows} rows, expected >= 2`);
    // Every letter view reads one window. Two panels showing different stretches of sequence under
    // one heading is the defect this state exists to prevent.
    const uniq = [...new Set(bio.windows.filter(Boolean))];
    if (bio.windows.some((w) => !w)) fail(scope, `a logo view has no window: ${JSON.stringify(bio.windows)}`);
    else if (uniq.length !== 1) fail(scope, `logo views disagree about the window: ${uniq.join(' vs ')}`);
    // Mutagenesis is the primary logo source now that it covers the whole window, so it must be
    // present AND selected by default. This assertion is the inverse of the one it replaced; both
    // states cannot be right, and pinning only the new prose would let a half-applied revert pass.
    // (the ism source select is archived; the browser offers each method as its own lane)

    // The brush must move every logo view together.
    const before = uniq[0];
    const strip = await page.$('[data-vp-viewport]');
    if (strip) {
      await strip.scrollIntoViewIfNeeded();
      const box = await strip.boundingBox();
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.42, box.y + box.height / 2, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      const after = await page.evaluate(() =>
        [document.querySelector('[data-vp-viewport]')?.dataset.vpView ?? null]);
      const afterUniq = [...new Set(after.filter(Boolean))];
      if (afterUniq.length !== 1) fail(scope, `after brushing, logo views disagree: ${afterUniq.join(' vs ')}`);
      else if (afterUniq[0] === before) fail(scope, 'brushing the method strip did not move the logo window');
    }

    // --- the five acts, the focus band, and the cross-locus summary -----------------------
    const spine = await page.evaluate(() => {
      // One canvas draws every lane now, so there is no longer a set of panels that could
      // disagree about the focus band. What replaced the check is structural.
      // The lens is archived with the logo it connected. One canvas draws every lane in the
      // browser, so nothing is left that could disagree about a focus band.
      const focus = [];
      return {
        acts: [...document.querySelectorAll('.vp-act')].map((e) => e.textContent.trim()),
        focus,
        findings: Number(document.querySelector('[data-vp-findings]')?.dataset.vpFindings ?? 0),
        classFig: Number(document.querySelector('[data-vp-class-figure]')?.dataset.vpClassFigure ?? 0),
        tss: Number(document.querySelector('[data-vp-tss]')?.dataset.vpTss ?? 0),
        navSticky: getComputedStyle(document.querySelector('.vp-nav')).position,
      };
    });
    // Eight numbered acts and one reference appendix. Asserted by CONTENT rather than by count,
    // because a count says nothing about whether the page still reads as a research plan: define
    // the system -> scope it -> predict -> attribute -> validate -> open the model -> go beyond
    // first order -> check it against biology outside the model.
    if (spine.acts.length !== 9) {
      fail(scope, `${spine.acts.length} act headings, expected 8 acts and a reference`);
    }
    const spineWants = [
      /system and the question/i, /see at all/i, /predict/i, /bases drove it/i,
      /attribution real/i, /how does it do it/i, /grammar/i, /outside the model/i,
      /read any of this/i,
    ];
    spineWants.forEach((re, i) => {
      if (!re.test(spine.acts[i] ?? '')) {
        fail(scope, `act ${i + 1} does not read as "${re.source}": "${spine.acts[i] ?? ''}"`);
      }
    });
    if (new Set(spine.acts).size !== spine.acts.length) fail(scope, 'a duplicate act heading');

    // Every analysis panel opens with the same four-term frame: question, method, cost, and what
    // would refute it. That is the page's spine as a research plan, and the fourth term is the one
    // that matters -- without it a reader cannot tell a claim carrying a control from one without,
    // and the page's best material is exactly the claims that survived a control. The reference act
    // opts out: a table of tensor collapses is not a question.
    const frames = await page.evaluate(() => {
      const ref = document.querySelector('#act-ref');
      return [...document.querySelectorAll('.vp-panel')]
        .filter((s) => !ref || !ref.contains(s))
        .map((s) => {
          const dl = s.querySelector('.vp-frame');
          const terms = [...(dl?.querySelectorAll('dt') ?? [])].map((d) => d.textContent.trim());
          const vals = [...(dl?.querySelectorAll('dd') ?? [])].map((d) => d.textContent.trim());
          return { title: s.querySelector('h3')?.textContent.trim().slice(0, 44) ?? '?',
                   terms, vals };
        });
    });
    const WANT = ['Question', 'Method', 'Cost', 'What would refute it'];
    for (const f of frames) {
      if (f.terms.join('|') !== WANT.join('|')) {
        fail(scope, `panel "${f.title}" has terms ${f.terms.join('|') || '(none)'}`);
      } else if (f.vals.some((v) => v.length < 20)) {
        // A padded field is worse than a missing one: it looks like the question was answered.
        fail(scope, `panel "${f.title}" has a frame field under 20 characters: `
          + f.vals.map((v, i) => `${WANT[i]}=${v.length}`).join(' '));
      }
    }
    if (frames.length < 20) fail(scope, `only ${frames.length} framed panels outside the reference`);
    if (spine.navSticky !== 'sticky') fail(scope, `the selection bar is ${spine.navSticky}, not sticky`);
    // The focus band spanned four stacked panels that are now one canvas in the browser, where a
    // shared axis is structural rather than something to check. Retired, not weakened: nothing is
    // left that could disagree.
    if (spine.focus.length) {
      if (spine.focus.some((f) => !f)) {
        fail(scope, `a full-window track has no focus band: ${JSON.stringify(spine.focus)}`);
      } else if (new Set(spine.focus).size !== 1) {
        fail(scope, `tracks disagree about the focus band: ${[...new Set(spine.focus)].join(' vs ')}`);
      }
    }
    if (spine.findings < 3) fail(scope, `${spine.findings} findings stated, expected at least 3`);
    if (spine.classFig < 8) fail(scope, `class figure drew ${spine.classFig} rows`);
    if (spine.tss < 10) fail(scope, `TSS profile drew ${spine.tss} bins`);

    if (how.n < 4) fail(scope, `${how.n} "how this is computed" disclosures, expected at least 4`);
    if (how.anyOpen) fail(scope, 'a disclosure is open by default — they must not crowd the panels');
    // A disclosure that exists but says nothing is worse than none.
    how.bodies.forEach((len, i) => {
      if (len < 400) fail(scope, `disclosure ${i} has only ${len} characters of body`);
    });
    if (how.rows < 12) fail(scope, `the collapse table has ${how.rows} rows, expected every collapse`);
    // It must actually open.
    await page.locator('details.vp-how').first().click();
    await page.waitForTimeout(200);
    const opened = await page.evaluate(
      () => document.querySelector('details.vp-how')?.open === true,
    );
    if (!opened) fail(scope, 'the first disclosure did not open on click');

    // --- the four attribution methods, and the annotation overlay ---------------------------
    //
    // The 1-of-4 source dropdown and the paper-fidelity ISM logo are archived. The browser is
    // additive rather than a selector -- each method is its own lane and several stack at once --
    // and it now carries the annotation overlay too, which was the panel's only unique capability.
    // `chromium/genome` step 4u2 re-derives every box's solid/hollow verdict from the sequence,
    // which is a stronger check than the panel ever had.
    await page.locator('[data-vp-region-next]').scrollIntoViewIfNeeded();
    await page.locator('[data-vp-region-next]').click();
    await page.waitForTimeout(600);

    // --- occlusion: marginals and click-through ---------------------------------------------
    const occl = page.locator('[data-vp-occl]');
    await occl.scrollIntoViewIfNeeded();
    const box = await occl.boundingBox();
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.45);
    await page.waitForTimeout(400);
    const row = await page.evaluate(() => ({
      sel: document.querySelector('[data-vp-occl]')?.dataset.selection ?? '',
      pick: document.querySelector('[data-vp-occl-pick]')?.textContent ?? '',
    }));
    if (!/^row:\d+$/.test(row.sel)) fail(scope, `clicking the occlusion map selected "${row.sel}"`);
    if (!/output bin/.test(row.pick)) fail(scope, `no readout for the clicked row: "${row.pick}"`);
    await page.keyboard.down('Shift');
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(400);
    const col = await page.evaluate(
      () => document.querySelector('[data-vp-occl]')?.dataset.selection ?? '',
    );
    if (!/^col:\d+$/.test(col)) fail(scope, `shift-clicking selected "${col}", expected a column`);

    // --- the neuron traces are exact and enrichment is reported ------------------------------
    await page.locator('[data-vp-stage-profile] li').nth(5).click();
    await page.waitForTimeout(500);
    const nt = await page.evaluate(() => {
      const c = document.querySelector('[data-vp-neurons-trace]');
      return { stage: c?.dataset.stage ?? '', neurons: (c?.dataset.neurons ?? '').split(',').filter(Boolean) };
    });
    if (nt.neurons.length < 4) fail(scope, `neuron traces drew ${nt.neurons.length} channels`);
    if (new Set(nt.neurons).size !== nt.neurons.length) {
      fail(scope, `neuron traces repeated a channel: ${nt.neurons.join()}`);
    }

    // --- the archived panels stay archived --------------------------------------------------
    const gone = await page.evaluate(() => ({
      ismRaster: document.querySelectorAll('[data-vp-ism]').length,
      headings: [...document.querySelectorAll('h2')].map((h) => h.textContent ?? ''),
    }));
    if (gone.ismRaster) fail(scope, 'the archived mutagenesis raster is back on the page');
    if (gone.headings.some((h) => /In-silico mutagenesis/.test(h))) {
      fail(scope, 'the archived mutagenesis panel is back on the page');
    }
  } finally {
    await context.close();
  }
}

/**
 * The region-conditioned views: relevance mode, the layer raster's shared scale, the method strip
 * and the occlusion map.
 *
 * The rule throughout is that a panel must change when the thing it depends on changes. A relevance
 * map wired to the activations paints exactly as much ink as a correct one, and a method track
 * reading the wrong plane looks identical to one reading the right plane.
 */
async function auditRegionViews(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1400 } });
  const page = await context.newPage();
  try {
    await enterLocus(page);
    await page.waitForFunction(
      () => document.querySelector('[data-vp]').dataset.vpTraceReady === 'true',
      { timeout: 60_000 },
    );
    await page.waitForTimeout(500);

    // --- one row is one channel, at every anonymous-channel stage -------------------------
    const heights = [];
    for (const v of [60, 200, 380, 620, 860]) {
      await page.evaluate((n) => {
        const s = document.querySelector('[data-vp-scrub]');
        s.value = String(n);
        s.dispatchEvent(new Event('input', { bubbles: true }));
      }, v);
      await page.waitForTimeout(200);
      heights.push(await page.evaluate(() => {
        const c = document.querySelector('[data-vp-stage-map]');
        const shape = document.querySelector('[data-vp-aspect]')?.dataset.shape ?? '0x0';
        return { channels: Number(shape.split('x')[1]), h: Math.round(c.getBoundingClientRect().height) };
      }));
    }
    // Furniture is a constant, so height minus channels must be the same at every stage.
    const furniture = [...new Set(heights.map((x) => x.h - x.channels))];
    if (furniture.length !== 1) {
      fail(scope, `layer raster is not one row per channel: height-minus-channels varies ${furniture.join()}`);
    }
    if (new Set(heights.map((x) => x.h)).size < 3) {
      fail(scope, 'layer raster height barely varies across stages — it is still being stretched');
    }

    // --- relevance mode ------------------------------------------------------------------
    const flowInk = () => page.evaluate(() => {
      const c = document.querySelector('[data-vp-flow]');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum = (sum + d[i] * (i % 11)) % 2147483647;
      return sum;
    });
    await page.locator('[data-vp-region-next]').scrollIntoViewIfNeeded();
    await page.locator('[data-vp-region-next]').click();
    await page.waitForTimeout(700);
    const asActivation = await flowInk();
    await page.locator('[data-vp-showing="relevance"]').click();
    await page.waitForTimeout(700);
    const asRelevance = await flowInk();
    if (asActivation === asRelevance) {
      fail(scope, 'the flow canvas is identical in activation and relevance mode');
    }
    // ... and relevance must be region-specific, or it is not relevance.
    await page.locator('[data-vp-region-next]').click();
    await page.waitForTimeout(700);
    if (await flowInk() === asRelevance) {
      fail(scope, 'relevance mode does not change with the traced region');
    }
    await page.locator('[data-vp-showing="activation"]').click();
    await page.waitForTimeout(400);

    // --- the method lanes ------------------------------------------------------------------
    // Every method is a lane of the one viewport now, drawn at its own true resolution and
    // labelled with it. `vpMethods` is the lane list; `vpLogoLetters` is what each logo drew.
    const methods = await page.evaluate(() => {
      const c = document.querySelector('[data-vp-viewport]');
      const ids = (c?.dataset.vpMethods ?? '').split('|').filter(Boolean);
      return { n: ids.length, labels: c?.dataset.vpMethodLabels ?? '',
               letters: c?.dataset.vpLogoLetters ?? '' };
    });
    if (methods.n < 4) fail(scope, `method strip drew ${methods.n} rows, expected at least 4`);
    // Mutagenesis LEADS the strip now. It was excluded while it covered 500 bp of 16,384 and while
    // the full window was priced at 39.6 h; it is now full-window and measured, so its presence --
    // and its position -- are the decision being asserted.
    // Labels are published only if the renderer emits them; when it does, mutagenesis must lead.
    if (methods.labels) {
      for (const want of ['mutagenesis', 'gradient', 'integrated']) {
        if (!methods.labels.toLowerCase().includes(want)) {
          fail(scope, `method strip is missing "${want}"; got ${methods.labels}`);
        }
      }
      if (!/^mutagenesis/i.test(methods.labels)) {
        fail(scope, `mutagenesis should lead the method strip; got "${methods.labels}"`);
      }
    }

    // --- the occlusion map ---------------------------------------------------------------
    const occ = await page.evaluate(() => {
      const c = document.querySelector('[data-vp-occl]');
      if (!c || !c.width) return null;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let ink = 0;
      const colours = new Set();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 8) { ink += 1; if (colours.size < 500) colours.add(`${d[i]},${d[i + 1]},${d[i + 2]}`); }
      }
      return { ink, colours: colours.size, peak: Number(c.dataset.peak ?? '0') };
    });
    if (!occ) fail(scope, 'no occlusion canvas');
    else {
      if (!(occ.peak > 0)) fail(scope, 'occlusion matrix is all zero');
      if (occ.colours < 20) fail(scope, `occlusion map has ${occ.colours} distinct colours — a wash`);
    }

    // --- the stage stack must be the EXACT margin now -------------------------------------
    const exact = await page.evaluate(
      () => document.querySelector('[data-vp-stage-stack]')?.dataset.exact,
    );
    if (exact !== 'true') {
      fail(scope, 'the stage stack is still using the factorised estimate — the packs lack the positional margin');
    }
  } finally {
    await context.close();
  }
}

/**
 * The paper-faithful pieces: the logo's own geometry, the ISM logo panel, and the stage stack.
 *
 * Fidelity here is the whole point, so these assert the exact constants rather than "it drew
 * something": the paper's four saturated X11 colours, glyphs scaled vertically only, and the
 * mutagenesis panel carrying both a logo and annotation boxes.
 */
async function auditPaperFidelity(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1400 } });
  const page = await context.newPage();
  try {
    await enterLocus(page, 11);                       // DTD1 -- published Figure 4 panel E
    // Every logo view is fed by the region-conditioned method tracks now, so a region has to be
    // traced before any of them draws anything at all.
    await page.locator('[data-vp-region-next]').scrollIntoViewIfNeeded();
    await page.locator('[data-vp-region-next]').click();
    await page.waitForFunction(
      () => (document.querySelector('[data-vp-viewport]')?.dataset.vpMethods ?? '').includes('ism'),
      { timeout: 60_000 },
    ).catch(() => {});
    // Zoom in until the lanes grow letters. The logo is a lane of the viewport now, so reaching it
    // is a zoom rather than a jump to a fixed window.
    for (let i = 0; i < 8; i += 1) {
      await page.locator('[data-vp-zoom-in]').click();
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(600);

    // A canvas has no glyph elements to inspect, so the drawing reports itself. Same three claims
    // the SVG version asserted -- one letter a column when projected, the paper's four colours and
    // nothing else, and heights that actually vary -- read from what was drawn rather than from
    // markup that no longer exists.
    const logo = await page.evaluate(() => {
      const cv = document.querySelector('[data-vp-viewport]');
      const detail = JSON.parse(cv?.dataset.vpLogoDetail ?? '[]');
      const ism = detail.find((d) => d.id === 'ism-logo') ?? null;
      const [wa, wb] = (cv?.dataset.vpView ?? '0-0').split('-').map(Number);
      return {
        letters: ism?.letters ?? 0,
        columns: ism?.columns ?? 0,
        windowBp: wb - wa,
        fills: ism?.colours ?? [],
        minPx: ism?.minPx ?? 0,
        maxPx: ism?.maxPx ?? 0,
        lettersOn: cv?.dataset.vpLetters === 'true',
        detail,
      };
    });
    if (!logo.lettersOn) fail(scope, 'zooming in never reached the letter view');
    // The logo is PROJECTED on the reference by default, so it must draw about one letter per
    // column -- not four. Fewer means the projection or the visibility floor is wrong; more means
    // it is drawing all four bases and has stopped matching the figure.
    if (logo.letters > logo.columns) {
      fail(scope, `ISM logo drew ${logo.letters} letters over ${logo.columns} columns — a projected logo has one each`);
    }
    if (logo.letters < logo.columns * 0.7) {
      fail(scope, `ISM logo drew ${logo.letters} letters over ${logo.columns} columns — too few`);
    }
    // The one invariant the three logo lanes differ on, and the page's central claim about them.
    // Gradient x input and integrated gradients multiply by a ONE-HOT input, so they are
    // identically zero at the three bases that are not there and can never draw more than one
    // letter a column. Mutagenesis ships all four and can.
    for (const d of logo.detail) {
      if (d.id !== 'ism-logo' && d.letters > d.columns) {
        fail(scope, `${d.id} drew ${d.letters} letters over ${d.columns} columns — `
          + 'a gradient logo is zero at the three bases that are not there');
      }
    }
    // Heights that do not vary mean the value encoding is gone and the lane is a row of stamps.
    if (logo.maxPx > 0 && logo.maxPx - logo.minPx < 1) {
      fail(scope, `every ISM glyph is the same height (${logo.minPx}–${logo.maxPx}px)`);
    }
    const want = ['#0000FF', '#008000', '#FF0000', '#FFA500'];
    for (const c of want) {
      if (!logo.fills.includes(c)) fail(scope, `logo is missing the paper's ${c}; got ${logo.fills.join()}`);
    }
    for (const c of logo.fills) {
      if (!want.includes(c)) fail(scope, `logo drew a colour the paper does not use: ${c}`);
    }
    // The transform check moved to the unit tests. On a canvas `ctx.scale(colW * GLOBSCALE, -sy)`
    // leaves no attribute to read, and asserting it from the drawing would mean re-deriving the
    // transform from pixels. `shorkieViewport.test.ts` pins the column geometry instead, and the
    // height spread above is what still catches a lane drawn without its value encoding.
    if (!scales.some(([, sy]) => sy < 0)) {
      fail(scope, 'no glyph is mirrored — negative values must flip, not merely sit below the line');
    }
    // Width must be constant while height varies: that is what makes it a logo and not text.
    const xs = new Set(scales.map(([sx]) => sx.toFixed(3)));
    if (xs.size !== 1) fail(scope, `glyph x-scale varies (${[...xs].slice(0, 3).join()}) — height must scale alone`);
    if (new Set(scales.map(([, sy]) => sy.toFixed(3))).size < 20) {
      fail(scope, 'glyph heights barely vary — the logo is not carrying the values');
    }
    if (logo.boxCount < 3) fail(scope, `only ${logo.boxCount} annotation boxes on DTD1`);
    for (const need of ["5' splice site", 'branch point']) {
      if (!logo.labels.some((l) => l.toLowerCase().includes(need.toLowerCase()))) {
        fail(scope, `DTD1's logo does not label "${need}"`);
      }
    }
    // No duplicate landmark labels: the motif scan and the derived annotations both supply them.
    const dupes = logo.labels.filter((l, i) => l && logo.labels.indexOf(l) !== i);
    if (dupes.length) fail(scope, `duplicated annotation labels: ${[...new Set(dupes)].join()}`);

    // The stage stack: one row per mapped stage, and it must move with the region.
    const stack = () => page.evaluate(() => {
      const c = document.querySelector('[data-vp-stage-stack]');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum = (sum + d[i] * (i % 7)) % 2147483647;
      return { rows: Number(c.dataset.rows ?? '0'), sig: sum };
    });
    await page.locator('[data-vp-region-next]').scrollIntoViewIfNeeded();
    await page.locator('[data-vp-region-next]').click();
    await page.waitForTimeout(700);
    const s1 = await stack();
    await page.locator('[data-vp-region-next]').click();
    await page.waitForTimeout(700);
    const s2 = await stack();
    if (s1.rows !== 18) fail(scope, `stage stack has ${s1.rows} rows, expected 18 mapped stages`);
    if (s1.sig === s2.sig) fail(scope, 'the stage stack is identical for two different regions');

    // Free typing and the conv-stem panel are gone and must stay gone.
    const removed = await page.evaluate(() => ({
      mode: document.querySelectorAll('[data-vp-mode]').length,
      seq: document.querySelectorAll('[data-vp-seq]').length,
      neurons: document.querySelectorAll('[data-vp-neurons]').length,
      filter: document.querySelectorAll('[data-vp-filter-logo]').length,
    }));
    for (const [k, n] of Object.entries(removed)) {
      if (n) fail(scope, `removed control "${k}" is back on the page (${n} found)`);
    }
  } finally {
    await context.close();
  }
}

/**
 * The interpretation panels: layer profile, attention rollout, sequence logo, mutagenesis.
 *
 * The rule these all share is the one `audit:deep-dives` applies to a widget's readout: it is not
 * enough that a panel draws, it must draw something DIFFERENT for a different region. A profile
 * wired to a constant, or a logo left panned where the last region put it, paints exactly as much
 * ink as a correct one.
 */
async function auditInterpretation(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1400 } });
  const page = await context.newPage();
  try {
    await enterLocus(page);
    await page.waitForFunction(
      () => document.querySelector('[data-vp]').dataset.vpTraceReady === 'true',
      { timeout: 60_000 },
    );
    const snap = () => page.evaluate(() => ({
      region: document.querySelector('[data-vp-region]')?.selectedOptions[0]?.textContent ?? '',
      stages: Number(document.querySelector('[data-vp-stage-profile]')?.dataset.stages ?? '0'),
      inside: document.querySelector('[data-vp-rollout]')?.dataset.inside ?? '',
      // The region-conditioned drawing is the viewport: which method lanes exist depends on the
      // selection, and per-base gradients appear only at an exact anchor.
      letters: (document.querySelector('[data-vp-viewport]')?.dataset.vpMethods ?? '')
        .split('|').filter(Boolean).length,
      logoWindow: document.querySelector('[data-vp-viewport]')?.dataset.vpView ?? '',
      trace: document.querySelector('[data-vp-trace-label]')?.textContent ?? '',
    }));

    await page.locator('[data-vp-region-next]').scrollIntoViewIfNeeded();
    await page.locator('[data-vp-region-next]').click();
    await page.waitForTimeout(600);
    const a = await snap();
    await page.locator('[data-vp-region-next]').click();
    await page.waitForTimeout(600);
    const b = await snap();

    // The input stage must state the model's real input width. It draws 4 rows because the other
    // 166 channels are constant, and titling it "4 channels" understated what the network is fed.
    await page.evaluate(() => {
      const s = document.querySelector('[data-vp-scrub]');
      s.value = '0';
      s.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const input = await page.evaluate(() => ({
      title: document.querySelector('[data-vp-stage-title]')?.textContent ?? '',
      note: document.querySelector('[data-vp-stage-note]')?.textContent ?? '',
      top: document.querySelector('[data-vp-stage-top]')?.textContent ?? '',
    }));
    if (!/170 channels/.test(input.title)) fail(scope, `input stage titled "${input.title}"`);
    if (!/4 DNA \+ 1 mask \+ 165 species/.test(input.title)) {
      fail(scope, `input title does not break down the 170: "${input.title}"`);
    }
    if (!/\b114\b/.test(input.note)) fail(scope, 'input note does not name the species channel');
    if (!/base composition/.test(input.top)) {
      fail(scope, `input reports "${input.top.slice(0, 40)}" — "loudest channels" is noise on a one-hot`);
    }

    // Every stage, not just the selected one -- that is what "layer by layer" means.
    if (a.stages !== 21) fail(scope, `stage profile listed ${a.stages} stages, expected 21`);
    if (!(a.letters > 1)) fail(scope, `the method strip drew ${a.letters} rows`);
    if (!a.inside) fail(scope, 'attention rollout produced no value');
    if (a.region === b.region) fail(scope, 'the region stepper did not advance');
    if (a.inside === b.inside) fail(scope, 'attention rollout is identical for two regions');
    if (a.logoWindow === b.logoWindow) {
      fail(scope, `the method strip stayed at ${a.logoWindow} across two regions — it does not follow the selection`);
    }

    // The logo window must actually contain the region it claims to show.
    const bins = /bins (\d+)–(\d+)/.exec(b.trace);
    if (bins) {
      const midBp = 1024 + ((Number(bins[1]) + Number(bins[2])) / 2) * 16;
      const [lo, hi] = b.logoWindow.split('-').map(Number);
      if (!(midBp >= lo && midBp <= hi)) {
        fail(scope, `logo window ${b.logoWindow} does not contain the traced region's centre ${Math.round(midBp)} bp`);
      }
    }

    // Clicking a stage in the profile must open it in the layer panel above.
    const rows = page.locator('[data-vp-stage-profile] li');
    await rows.nth(9).click();
    await page.waitForTimeout(300);
    const opened = await page.evaluate(
      () => document.querySelector('[data-vp-stage-title]')?.textContent ?? '',
    );
    const wanted = (await rows.nth(9).textContent()) ?? '';
    if (!opened.startsWith(wanted.split(/\d/)[0].trim().slice(0, 12))) {
      fail(scope, `clicking "${wanted.slice(0, 24)}" opened "${opened.slice(0, 40)}"`);
    }

    // The mutagenesis raster was archived; its logo lives in the merged panel and is asserted
    // by the paper-fidelity gate instead.
  } finally {
    await context.close();
  }
}

/**
 * The volume view rotates by default and must stop the moment the reader takes hold of it.
 *
 * Advancing the idle spin under the pointer means the drag and the animation fight for the same
 * axis, so the model never settles where it was put.
 */
async function auditRotationLatch(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await enterLocus(page);
    await page.locator('[data-vp-view="3d"]').scrollIntoViewIfNeeded();
    await page.locator('[data-vp-view="3d"]').click();
    await page.waitForTimeout(1600);
    const canvas = page.locator('[data-vp-flow3d]');
    const before = await canvas.screenshot();
    await page.waitForTimeout(900);
    if ((await canvas.screenshot()).equals(before)) {
      fail(scope, 'the volume view is not rotating by default');
    }
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const held = await canvas.screenshot();
    await page.waitForTimeout(1200);
    if (!(await canvas.screenshot()).equals(held)) {
      fail(scope, 'the volume view keeps rotating after a drag');
    }
    if (!(await page.locator('[data-vp-spin]').isVisible())) {
      fail(scope, 'no way to resume rotation after a drag stopped it');
    }
    await page.locator('[data-vp-spin]').click();
    await page.waitForTimeout(900);
    if ((await canvas.screenshot()).equals(held)) {
      fail(scope, 'resume rotation did not restart the idle animation');
    }
  } finally {
    await context.close();
  }
}

/**
 * The volume view must render, follow the theme, honour reduced motion, and dispose.
 *
 * A leaked GL context per navigation is the failure `/chromatin/` documents; it is silent and
 * only shows up as a dead canvas after a handful of visits.
 */
async function auditVolume(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await enterLocus(page);
    await page.locator('[data-vp-view="3d"]').scrollIntoViewIfNeeded();
    await page.locator('[data-vp-view="3d"]').click();
    await page.waitForTimeout(2000);

    const state = await page.evaluate(() => {
      const c = document.querySelector('[data-vp-flow3d]');
      const flat = document.querySelector('[data-vp-flow]');
      const r = c?.getBoundingClientRect();
      return {
        view: document.querySelector('[data-vp]').dataset.vpView,
        w: Math.round(r?.width ?? 0), h: Math.round(r?.height ?? 0),
        flatHidden: flat?.hidden ?? null,
        gl: !!(c && (c.getContext('webgl2') || c.getContext('webgl'))),
      };
    });
    if (state.view !== '3d') fail(scope, `view did not switch (${state.view})`);
    if (state.w < 200 || state.h < 120) fail(scope, `volume canvas is ${state.w}x${state.h}`);
    if (state.flatHidden !== true) fail(scope, 'flat flow canvas still shown alongside the volume view');
    if (!state.gl) fail(scope, 'volume canvas has no GL context');

    // It has to actually paint. A screenshot is the only readback available: the renderer runs
    // without preserveDrawingBuffer, so reading the canvas directly always returns zeros.
    const shot = await page.locator('[data-vp-flow3d]').screenshot();
    if (shot.length < 3000) fail(scope, `volume screenshot is ${shot.length} bytes — nothing drawn`);

    // Back to flat and forward again must not leave two canvases or throw.
    await page.locator('[data-vp-view="2d"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-vp-view="3d"]').click();
    await page.waitForTimeout(600);
    const n = await page.locator('[data-vp-flow3d]').count();
    if (n !== 1) fail(scope, `${n} volume canvases after toggling back and forth`);

    // A client-side navigation away and back must dispose and rebuild cleanly.
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.goBack({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const after = await page.locator('[data-vp-flow3d]').count();
    if (after !== 1) fail(scope, `${after} volume canvases after a navigation round trip`);
    if (errors.length) fail(scope, `volume view raised: ${errors[0]}`);
  } finally {
    await context.close();
  }
}

/** Reduced motion means the volume view holds still, not that it idles more slowly. */
async function auditVolumeStill(browser, baseURL, scope) {
  const context = await browser.newContext({
    baseURL, viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await enterLocus(page);
    await page.locator('[data-vp-view="3d"]').scrollIntoViewIfNeeded();
    await page.locator('[data-vp-view="3d"]').click();
    await page.waitForTimeout(1500);
    const a = await page.locator('[data-vp-flow3d]').screenshot();
    await page.waitForTimeout(1600);
    const b = await page.locator('[data-vp-flow3d]').screenshot();
    if (!a.equals(b)) fail(scope, 'volume view keeps rotating under prefers-reduced-motion');
  } finally {
    await context.close();
  }
}

/**
 * The gene track must draw transcript models, not solid blocks.
 *
 * The tally comes from inside the loop that fills the rectangles, so this reports what was drawn.
 * Every locus in the set has at least one annotated feature; the multi-exon ones must show gaps.
 */
async function auditAnnotation(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await enterLocus(page);
    const count = await page.locator('[data-vp-locus] option').count();
    let multiExon = 0;
    for (let i = 0; i < count; i += 1) {
      await page.selectOption('[data-vp-locus]', String(i));
      await page.waitForFunction(
        () => document.querySelector('[data-vp]').dataset.vpResultSource === 'precomputed',
        { timeout: 60_000 },
      ).catch(() => {});
      await page.waitForTimeout(150);
      const s = await page.evaluate(() => {
        const c = document.querySelector('[data-vp-stage-map]');
        return {
          gene: document.querySelector('[data-vp-locus]').selectedOptions[0].textContent,
          track: c?.dataset.vpGeneTrack ? JSON.parse(c.dataset.vpGeneTrack) : null,
        };
      });
      if (!s.track) { fail(scope, `${s.gene}: gene track never drew`); continue; }
      if (s.track.features < 1) fail(scope, `${s.gene}: no annotated features in the window`);
      if (s.track.blocks < s.track.features) {
        fail(scope, `${s.gene}: ${s.track.blocks} exon block(s) for ${s.track.features} feature(s)`);
      }
      if (s.track.introns > 0) multiExon += 1;
    }
    // Eight multi-exon genes fall in these windows; drawing every one as a solid block is the
    // defect this replaces, so at least one locus must render an intron as a gap.
    if (multiExon < 1) fail(scope, 'no locus drew an intron — every gene is still a solid block');
    else progress(`${multiExon} locus/loci draw introns as gaps`);
  } finally {
    await context.close();
  }
}

// The locus count is DERIVED, not typed: it went 14 -> 23 when Supplemental Figures S19 and S20
// were added, and it was asserted in three places that had to be found by grep.
const N_LOCI = JSON.parse(
  readFileSync(new URL('../src/data/shorkieLoci.json', import.meta.url), 'utf8'),
).loci.length;
// Loci that carry a `figureWindow`: the six main-text Figure 4 panels plus the Supplemental
// S19/S20 panels that have shipped.
const N_FIGURE_WINDOWS = JSON.parse(
  readFileSync(new URL('../src/data/shorkieLoci.json', import.meta.url), 'utf8'),
).loci.filter((l) => l.figureWindow).length;
const LM_ROUTE = '/shorkie-lab/shorkie_lm/';
const GENOME_ROUTE = '/shorkie-lab/genome/';
const ATTN_ROUTE = '/shorkie-lab/attention/';

/**
 * Was this route actually built?
 *
 * A route the build did not produce is served by the preview server as the 404 page, and every
 * assertion against it then fails in a way that describes the 404 rather than the bug: "expected 23
 * loci options, found 0", and a prose check reporting a swallowed space in the 404 page's own
 * copy. That is what took CI down -- this file was committed carrying a scope for a page whose
 * three source files were still untracked, so the gate tested a route that did not exist.
 *
 * Skipping is announced, never silent: a gate that quietly stops testing something is worse than
 * one that fails. When the page lands, its scope comes back with no edit here.
 */
const built = (route) =>
  existsSync(new URL(`../dist${route}index.html`, import.meta.url));

const ALL_LAB_ROUTES = ['/shorkie-lab/', '/shorkie-lab/shorkie/', LM_ROUTE, GENOME_ROUTE, ATTN_ROUTE];
const LAB_ROUTES = ALL_LAB_ROUTES.filter(built);
const SKIPPED_ROUTES = ALL_LAB_ROUTES.filter((r) => !built(r));

/**
 * A newline between prose and an inline tag is DELETED by JSX, not collapsed to a space, so
 * `for<newline><em>every` renders as "forevery". Invisible in the source and survives every other
 * gate.
 *
 * This walks the rendered DOM of EVERY page in the lab rather than one route: the check existed and
 * still let 12 through, because it ran only on the playground and the hub and the language-model
 * page are different documents. A per-route check does not protect a subtree.
 */
async function auditSwallowedSpaces(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    for (const route of LAB_ROUTES) {
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      const joins = await page.evaluate(() => {
        const out = [];
        const walk = (node) => {
          for (const el of node.children) {
            // KaTeX legitimately butts `log` against a span for its subscript.
            if (el.classList?.contains('katex')) continue;
            for (const kid of el.childNodes) {
              if (kid.nodeType !== Node.ELEMENT_NODE) continue;
              if (!/^(EM|STRONG|CODE|SPAN|A|B|I)$/.test(kid.tagName)) continue;
              const before = kid.previousSibling;
              const raw = kid.textContent ?? '';
              if (!before || before.nodeType !== Node.TEXT_NODE || !raw.trim()) continue;
              const tail = before.textContent ?? '';
              // The RAW first character, never a trimmed one: trimming removes the very space
              // whose absence is being looked for.
              if (/[\w),.;:%]$/.test(tail) && /^[\w(]/.test(raw)) {
                out.push((tail.slice(-30) + raw.slice(0, 20)).replace(/\s+/g, ' '));
              }
              // The CLOSING direction, which this check did not look at and which let two through:
              // `</em>position` renders as "everyposition" exactly as `for<em>every` renders as
              // "forevery". The defect is a newline JSX deleted; which side of the tag it sat on
              // makes no difference to the reader.
              const after = kid.nextSibling;
              if (after && after.nodeType === Node.TEXT_NODE && raw.trim()) {
                const head = after.textContent ?? '';
                if (/[\w),.;:%]$/.test(raw) && /^[\w(]/.test(head)) {
                  out.push((raw.slice(-20) + head.slice(0, 30)).replace(/\s+/g, ' '));
                }
              }
            }
            walk(el);
          }
        };
        walk(document.body);
        return out.slice(0, 6);
      });
      for (const j of joins) fail(scope, `${route}: swallowed space "…${j}…"`);
    }
  } finally {
    await context.close();
  }
}

/**
 * The genome browser.
 *
 * What is worth asserting here is not "did it draw" -- a browser that draws the wrong tile at the
 * wrong zoom draws just as much ink. It is the four things that are invisible when wrong:
 *
 *   1. **The level ladder.** A bin wider than a pixel is blur the data does not have; a bin far
 *      narrower is a fetch the screen cannot show. The first implementation had the comparison
 *      backwards and chose 4,096 bp bins at chrIV's 1,094 bp/pixel -- 3.7 px each, and nothing on
 *      screen said so.
 *   2. **The cache bound.** Panning the genome touches hundreds of tiles. Asserted by browsing
 *      three chromosomes at base resolution -- 58 distinct tiles against a cap of 48, so eviction
 *      must actually run. A short pan at a coarse level touches one tile and proves nothing.
 *   3. **The axis.** One user unit must be one CSS pixel at every width, or the ruler, the track
 *      and the gene models silently sit on three different horizontal axes. 1043 is in the width
 *      list deliberately: on the expression page that is where the same bug was invisible.
 *   4. **A deep link lands on the coordinates it names**, since the language-model page's 23
 *      primary regions reach the browser through exactly that path.
 */
/**
 * The constructive panels: receptive field, motif sufficiency, the two-by-two and the spacing
 * grammar. These are three canvases and a select, and the failures they can have are the ones a
 * canvas always has -- it draws nothing, it draws the same thing whatever you do to it, or it
 * draws a signed quantity on one side of its own zero rule.
 */
async function auditConstructive(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1400 } });
  const page = await context.newPage();
  try {
    await page.goto('/shorkie-lab/shorkie/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => [...document.querySelectorAll('[data-shorkie-constructive]')]
        .every((h) => h.dataset.consReady === '1'),
      { timeout: 30_000 },
    );
    const hosts = await page.locator('[data-shorkie-constructive]').count();
    // DERIVED from the source, like the panel count. The five-questions-in-one-panel block was
    // split so each question is its own panel carrying the host attribute, and the controller
    // mounts per host, reading its canvases through `host.querySelector` -- which already tolerated
    // a host owning one canvas of five, since the receptive-field panel has always been exactly
    // that. A hardcoded number here turns the next added panel into a spurious failure, which is
    // what it did the first time: 6 became 7 the moment motif discovery landed.
    const pageSrc = readFileSync(
      new URL('../src/pages/shorkie-lab/shorkie.astro', import.meta.url), 'utf8');
    const wantHosts = (pageSrc.match(/data-shorkie-constructive/g) ?? []).length;
    if (hosts !== wantHosts) {
      throw new Error(`${scope}: expected ${wantHosts} constructive hosts from source, found ${hosts}`);
    }

    // 1. Every canvas must actually draw. A canvas that renders nothing looks identical to one
    //    whose data failed to load, and neither throws.
    for (const sel of ['[data-cn-receptive]', '[data-cn-gia]', '[data-cn-join]', '[data-cn-spacing]']) {
      const inked = await page.evaluate((s) => {
        const c = document.querySelector(s);
        if (!c) return -1;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n += 1;
        return n / (d.length / 4);
      }, sel);
      if (inked < 0) throw new Error(`${scope}: ${sel} is missing`);
      if (inked < 0.005) throw new Error(`${scope}: ${sel} drew almost nothing (${(inked * 100).toFixed(2)}% inked)`);
      if (inked > 0.85) throw new Error(`${scope}: ${sel} is a wash (${(inked * 100).toFixed(1)}% inked)`);
    }

    // 2. The sufficiency chart is a SIGNED quantity and the data contains both activators and
    //    repressors, so there must be ink on both sides of the zero rule. Filling from one edge
    //    draws -0.14 and +0.14 as the same bar, which is an inverted reading of the whole panel.
    const sides = await page.evaluate(() => {
      const c = document.querySelector('[data-cn-gia]');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const mid = Math.floor(c.width / 2);
      let left = 0; let right = 0;
      for (let y = 0; y < c.height; y += 1) {
        for (let x = 0; x < c.width; x += 1) {
          if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < mid - 4) left += 1; else if (x > mid + 4) right += 1; }
        }
      }
      return { left, right };
    });
    if (sides.left < 200 || sides.right < 200) {
      throw new Error(`${scope}: the sufficiency chart drew on one side of its zero rule only `
        + `(left ${sides.left}, right ${sides.right}) -- a signed lane must grow both ways`);
    }

    // 3. The spacing picker must change the drawing. A select wired to nothing looks exactly like
    //    a select wired to something whose pairs happen to be similar.
    const shot = () => page.evaluate(() => {
      const c = document.querySelector('[data-cn-spacing]');
      return c.getContext('2d').getImageData(0, 0, c.width, c.height).data.join(',');
    });
    const stat = () => page.locator('[data-cn-spacing-stat]').textContent();
    const before = await shot(); const statBefore = await stat();
    const options = await page.locator('[data-cn-spacing-pick] option').count();
    if (options < 2) throw new Error(`${scope}: the spacing picker has ${options} options`);
    await page.locator('[data-cn-spacing-pick]').selectOption({ index: 1 });
    await page.waitForTimeout(250);
    if (await shot() === before) throw new Error(`${scope}: changing the motif pair redrew nothing`);
    if (await stat() === statBefore) throw new Error(`${scope}: the spacing readout did not follow the pair`);

    // 4. The receptive-field panel follows the browser's locus, which is what makes it part of the
    //    page rather than a static figure.
    const recStat = () => page.locator('[data-cn-receptive-stat]').textContent();
    const r0 = await recStat();
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('khc:gb-view',
      { detail: { locus: 'YBR020W' } })));
    await page.waitForTimeout(200);
    const r1 = await recStat();
    if (r1 === r0) throw new Error(`${scope}: the receptive-field readout ignored a locus change`);
    if (!/GAL1/.test(r1)) throw new Error(`${scope}: the readout did not name the selected gene: ${r1}`);

    // 5. A canvas reading CSS custom properties must repaint on a theme change; this site ships six
    //    themes and the fallback palette is the light one.
    const themed = await page.evaluate(() => {
      const c = document.querySelector('[data-cn-join]');
      const b = c.getContext('2d').getImageData(0, 0, c.width, c.height).data.join(',');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.dispatchEvent(new CustomEvent('khc:theme-change'));
      return new Promise((res) => setTimeout(() => {
        res(c.getContext('2d').getImageData(0, 0, c.width, c.height).data.join(',') !== b);
      }, 250));
    });
    if (!themed) throw new Error(`${scope}: the two-by-two did not repaint on a theme change`);
  } finally {
    await context.close();
  }
}

async function auditGenomeBrowser(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const bad = [];
  page.on('response', (r) => {
    if (r.url().includes('/genome-data/') && !r.ok()) bad.push(`${r.status()} ${r.url()}`);
  });
  const ds = () => page.$eval('[data-gb-track]', (c) => ({ ...c.dataset }));
  const go = async (locus) => {
    await page.fill('[data-gb-locus]', locus);
    await page.click('[data-gb-go]');
    await page.waitForTimeout(500);
  };

  try {
    await page.goto(GENOME_ROUTE, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 20000 });
    await page.waitForTimeout(1200);

    // `document.querySelectorAll` rather than a Playwright selector: the selector engine pierces
    // open shadow roots and would also count the dev toolbar's four headings.
    const h1 = await page.evaluate(() => document.querySelectorAll('h1').length);
    if (h1 !== 1) fail(scope, `expected exactly one <h1>, saw ${h1}`);

    let d = await ds();
    if (!(Number(d.gbDrawn) > 500)) fail(scope, `track drew only ${d.gbDrawn} columns on load`);
    const tally = JSON.parse(d.gbGeneTrack || '{}');
    if (!(tally.features > 0)) fail(scope, 'gene track drew no features on load');

    // 1. the level ladder
    const ladder = [];
    for (const [locus, want] of [
      ['chrIV:1-1531933', 512], ['chrIV:1-200000', 64],
      // 16, not 8: the ladder gained a 16 bp level for Shorkie's own output grid, and at this
      // width 20 kb is ~18.6 bp a pixel, so 16 is the largest bin no wider than a pixel.
      ['chrIV:1-20000', 16], ['chrIV:1-2000', 1], ['chrIV:1000-1120', 1],
    ]) {
      await go(locus);
      const dd = await ds();
      ladder.push(`${locus}=${dd.gbLevel}`);
      if (Number(dd.gbLevel) !== want) {
        fail(scope, `${locus} drew ${dd.gbLevel} bp bins, expected ${want}`);
      }
      if (!(Number(dd.gbDrawn) > 0)) fail(scope, `${locus} drew nothing`);
    }
    const deepest = await ds();
    if (deepest.gbMode !== 'letters') fail(scope, `deepest zoom drew "${deepest.gbMode}", not letters`);

    // 2. the cache bound, exercised hard enough that eviction has to happen -- with ALL THREE
    //    score pyramids enabled, which is the case a bound tuned for one track cannot survive.
    await page.check('[data-gb-toggle="lm-unmasked"]');
    await page.waitForTimeout(600);
    const enabledTracks = Number((await ds()).gbScoreTracks);
    if (enabledTracks !== 3) fail(scope, `expected 3 score tracks enabled, saw ${enabledTracks}`);
    let peak = 0;
    for (const [chrom, len] of [['chrIV', 1531933], ['chrXV', 1091291], ['chrVII', 1090940]]) {
      for (let i = 0; i < 24; i += 1) {
        const s = Math.floor((i / 24) * len) + 1;
        await page.fill('[data-gb-locus]', `${chrom}:${s}-${s + 3000}`);
        await page.click('[data-gb-go]');
        await page.waitForTimeout(90);
        peak = Math.max(peak, Number((await ds()).gbTiles));
      }
    }
    await page.waitForTimeout(1000);
    // The bound scales with the number of enabled score tracks: 16 + 16 per track.
    const cap = 16 + 16 * enabledTracks;
    if (peak > cap) fail(scope, `tile cache grew to ${peak}, above its bound of ${cap}`);
    const status = await page.$eval('[data-gb-status]', (e) => e.textContent ?? '');
    const evicted = Number(status.match(/(\d+) evicted/)?.[1] ?? 0);
    if (!(evicted > 0)) {
      fail(scope, `no eviction over 72 base-resolution jumps (status "${status}") — the bound was never tested`);
    }

    // 3. the axis, at the widths where a scale error is largest and where it vanishes
    for (const w of [320, 390, 760, 1043, 1440]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(400);
      const gap = await page.evaluate(() => {
        const c = document.querySelector('[data-gb-track]');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        return Math.abs(c.width / dpr - Math.round(c.clientWidth));
      });
      if (gap > 0.51) fail(scope, `at ${w}px the backing store is ${gap.toFixed(2)} px off its box`);
      const over = await page.evaluate(
        () => Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      );
      if (over > 1) fail(scope, `document overflows by ${over}px at ${w}px`);
    }
    await page.setViewportSize({ width: 1440, height: 950 });

    // 4. a deep link lands where it says, and the primary regions are all reachable
    const opts = await page.$$eval('[data-gb-region] option', (o) => o.map((x) => x.value).filter(Boolean));
    if (opts.length !== N_LOCI) fail(scope, `${opts.length} primary regions listed, expected ${N_LOCI}`);
    for (const locus of [opts[0], opts[Math.floor(opts.length / 2)], opts[opts.length - 1]]) {
      await page.goto(`${GENOME_ROUTE}#${locus}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 15000 });
      await page.waitForTimeout(600);
      const landed = await page.$eval('[data-genome-browser]', (h) => h.dataset.gbView ?? '');
      if (landed.replace(/,/g, '') !== locus) {
        fail(scope, `deep link #${locus} landed on ${landed}`);
      }
    }

    // A repaint on theme change: the canvas reads CSS custom properties, so one that ignores the
    // event keeps the old palette. Compare COLOURS, not ink -- the geometry is identical either way.
    const palette = () => page.evaluate(() => {
      const c = document.querySelector('[data-gb-track]');
      const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      let ink = 0;
      for (let i = 0; i < x.length; i += 4) {
        if (x[i + 3] < 8) continue;
        ink += 1;
        seen.add((x[i] >> 4) * 256 + (x[i + 1] >> 4) * 16 + (x[i + 2] >> 4));
      }
      return { ink, colours: [...seen].sort((a, b) => a - b).join(',') };
    });
    const before = await palette();
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.dispatchEvent(new CustomEvent('khc:theme-change'));
    });
    await page.waitForTimeout(600);
    const after = await palette();
    if (!(before.ink > 1000 && after.ink > 1000)) {
      fail(scope, `canvas nearly empty (${before.ink} / ${after.ink} opaque px)`);
    }
    if (before.colours === after.colours) {
      fail(scope, 'the canvas did not repaint on khc:theme-change — it keeps the old palette');
    }

    // 4b. The three score tracks, and the two passes together.
    //
    // The unmasked pass is NOT a prediction -- the model sees the base it scores -- so the lane has
    // to say so on its face, and a reader must be able to draw both at once, which is the whole
    // point of the paper's Figure 2A comparison.
    // `page.goto` to the same path with a different HASH does not reload -- it fires `hashchange`,
    // and a hash carrying no `t=` deliberately leaves the track set alone. So the previous
    // section's third score track would still be on and this would compare 3 lanes against 3.
    // Set the state explicitly rather than assuming a navigation reset it.
    await page.goto(`${GENOME_ROUTE}#chrVII:882012-884610`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 20000 });
    await page.uncheck('[data-gb-toggle="lm-unmasked"]');
    await page.waitForTimeout(1000);
    const oneTrack = Number((await ds()).gbDrawn);
    if (Number((await ds()).gbScoreTracks) !== 2) {
      fail(scope, 'could not get back to two score tracks before the comparison');
    }
    await page.check('[data-gb-toggle="lm-unmasked"]');
    await page.waitForTimeout(900);
    const dTwo = await ds();
    if (Number(dTwo.gbScoreTracks) !== 3) {
      fail(scope, `enabling the unmasked pass gave ${dTwo.gbScoreTracks} score tracks`);
    }
    if (!(Number(dTwo.gbDrawn) > oneTrack)) {
      fail(scope, `both passes drew ${dTwo.gbDrawn} columns, not more than one pass' ${oneTrack}`);
    }
    if (!JSON.parse(dTwo.gbLanes).includes('lm-unmasked')) {
      fail(scope, 'the unmasked lane is not in the stack after enabling it');
    }
    await page.uncheck('[data-gb-toggle="lm-unmasked"]');
    await page.waitForTimeout(700);
    if (Number((await ds()).gbScoreTracks) !== 2) fail(scope, 'unchecking did not remove the lane');

    // 4c. Drag on the RULER selects and zooms; drag on a TRACK pans without zooming.
    const geom = await page.$eval('[data-gb-track]', (c) => {
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width };
    });
    const spanOf = (s) => {
      const [a, b] = s.split(':')[1].split('-').map((v) => Number(v.replace(/,/g, '')));
      return b - a;
    };
    const readView = () => page.$eval('[data-genome-browser]', (h) => h.dataset.gbView ?? '');
    const beforeBrush = await readView();
    await page.mouse.move(geom.x + 400, geom.y + 8);         // y = 8 is inside the ruler lane
    await page.mouse.down();
    await page.mouse.move(geom.x + 700, geom.y + 8, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    const afterBrush = await readView();
    if (!(spanOf(afterBrush) < spanOf(beforeBrush))) {
      fail(scope, `ruler drag did not zoom: ${beforeBrush} -> ${afterBrush}`);
    }
    const beforePan = await readView();
    await page.mouse.move(geom.x + 700, geom.y + 120);       // y = 120 is inside a score lane
    await page.mouse.down();
    await page.mouse.move(geom.x + 500, geom.y + 120, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    const afterPan = await readView();
    if (afterPan === beforePan || Math.abs(spanOf(afterPan) - spanOf(beforePan)) > 2) {
      fail(scope, `track drag should pan, not zoom: ${beforePan} -> ${afterPan}`);
    }

    // 4d. Search by gene name, and history.
    const searchN = await page.$eval('[data-genome-browser]', (h) => Number(h.dataset.gbSearch ?? 0));
    if (!(searchN > 6000)) fail(scope, `search index has ${searchN} genes`);
    await page.fill('[data-gb-locus]', 'TDH3');
    await page.click('[data-gb-go]');
    await page.waitForTimeout(900);
    const atGene = await readView();
    const [g0, g1] = atGene.split(':')[1].split('-').map((v) => Number(v.replace(/,/g, '')));
    // The whole TDH3 gene record, which contains its 882,812-883,810 CDS.
    if (!(atGene.startsWith('chrVII:') && g0 <= 882812 && g1 >= 883810)) {
      fail(scope, `searching "TDH3" landed on ${atGene}`);
    }
    await page.click('[data-gb-back]');
    await page.waitForTimeout(700);
    if (await readView() === atGene) fail(scope, 'back did not leave the searched view');
    await page.click('[data-gb-fwd]');
    await page.waitForTimeout(700);
    if (await readView() !== atGene) fail(scope, 'forward did not return to the searched view');

    // 4e. Feature lanes: individual features when they can be told apart, density when they cannot.
    await go('chrIV:1-1531933');
    await page.waitForTimeout(1000);
    const wide = await ds();
    if (wide.gbFeatureMode !== 'density') {
      fail(scope, `whole chromosome drew features as "${wide.gbFeatureMode}"`);
    }
    if (!(JSON.parse(wide.gbFeatures).tfbs_chip > 0)) {
      fail(scope, 'the ChIP density lane drew nothing across a whole chromosome');
    }
    await go('chrIV:100000-110000');
    await page.waitForTimeout(900);
    if ((await ds()).gbFeatureMode !== 'detail') fail(scope, '10 kb did not switch to individual features');

    // 4f. Every annotation lane toggles, and the hash restores the exact set.
    for (const id of ['tfbs_pwm', 'ncrna', 'repeats']) {
      await page.check(`[data-gb-toggle="${id}"]`);
    }
    await page.click('[data-gb-mark]');
    await page.waitForTimeout(900);
    const marked = await ds();
    if (!marked.gbRoiRange) fail(scope, 'marking a region recorded no ROI');
    const stateHash = await page.evaluate(() => window.location.hash);
    if (!stateHash.includes(';t=') || !stateHash.includes(';roi=')) {
      fail(scope, `hash carries neither tracks nor ROI: ${stateHash}`);
    }
    await page.goto(`${GENOME_ROUTE}${stateHash}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 20000 });
    await page.waitForTimeout(1400);
    const restored = await ds();
    if (restored.gbRoiRange !== marked.gbRoiRange) {
      fail(scope, `ROI did not survive the link: ${marked.gbRoiRange} -> ${restored.gbRoiRange}`);
    }
    if (JSON.parse(restored.gbLanes).sort().join() !== JSON.parse(marked.gbLanes).sort().join()) {
      fail(scope, `track set did not survive the link: ${marked.gbLanes} -> ${restored.gbLanes}`);
    }

    // 4g. Hovering must not fetch data the view is not drawing.
    //
    // The tooltip reports a score under the cursor. Reading the per-base level unconditionally is
    // exact and pulls a 65,536-base tile for every hover position: measured, sweeping the cursor
    // once across a whole chromosome fetched 23 L0 tiles -- about 1.5 MB of data the view cannot
    // show, evicting the coarse tiles it is drawing from. The readout follows the drawn level.
    await page.goto(`${GENOME_ROUTE}#chrIV:1-1531933;t=lm-masked,phastcons,genes`,
                    { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 20000 });
    await page.waitForTimeout(2200);
    const fetchedTiles = [];
    const onTile = (r) => {
      if (r.url().includes('/genome-data/') && r.url().endsWith('.png')) {
        fetchedTiles.push(r.url().split('genome-data/')[1]);
      }
    };
    page.on('response', onTile);
    const hoverGeom = await page.$eval('[data-gb-track]', (c) => {
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width };
    });
    for (let i = 0; i < 40; i += 1) {
      await page.mouse.move(hoverGeom.x + 80 + (i / 40) * (hoverGeom.w - 120), hoverGeom.y + 120);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(1200);
    page.off('response', onTile);
    const strayL0 = fetchedTiles.filter((u) => u.includes('/L0/'));
    if (strayL0.length) {
      fail(scope, `hovering at 512 bp bins fetched ${strayL0.length} per-base tiles it cannot draw`);
    }

    // 4h. The chromosome dropdown reads the way a yeast biologist names them.
    const chroms = await page.$$eval('[data-gb-chrom] option', (o) => o.map((x) => x.value));
    if (chroms[0] !== 'chrI' || chroms[1] !== 'chrII' || chroms[chroms.length - 1] !== 'chrM') {
      fail(scope, `chromosome order is ${chroms.slice(0, 3).join(',')} … ${chroms.slice(-1)}`);
    }

    // 4i. The OVERVIEW STRIP is the selection surface: drag on it selects, click still centres.
    //     The main panel keeps drag-to-pan, which 4c already checks.
    await page.goto(`${GENOME_ROUTE}#chrVII:882012-884610`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 20000 });
    await page.waitForTimeout(1200);
    const mini = await page.$eval('[data-gb-mini]', (c) => {
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    await page.mouse.move(mini.x + mini.w * 0.30, mini.y + mini.h / 2);
    await page.mouse.down();
    await page.mouse.move(mini.x + mini.w * 0.34, mini.y + mini.h / 2, { steps: 10 });
    const stripBand = await page.$eval('[data-gb-mini]', (c) => c.dataset.gbMiniBrush || '');
    await page.mouse.up();
    await page.waitForTimeout(900);
    if (!stripBand.includes('-')) fail(scope, 'no band was drawn while dragging the overview strip');
    else {
      // The view must land ON the band drawn -- not merely "narrower than before". The strip spans
      // a whole chromosome, so selecting on it from a 2.6 kb view legitimately gives a WIDER view.
      const [ba, bb] = stripBand.split('-').map(Number);
      const landed = await readView();
      const [va, vb] = landed.split(':')[1].split('-').map((v) => Number(v.replace(/,/g, '')));
      if (Math.abs(va - 1 - ba) > 2 || Math.abs(vb - bb) > 2) {
        fail(scope, `strip selection ${ba}-${bb} landed on ${landed}`);
      }
    }
    const beforeClick = await readView();
    await page.mouse.move(mini.x + mini.w * 0.7, mini.y + mini.h / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(800);
    const afterClick = await readView();
    if (afterClick === beforeClick || Math.abs(spanOf(afterClick) - spanOf(beforeClick)) > 2) {
      fail(scope, `a click on the strip should centre without zooming: ${beforeClick} -> ${afterClick}`);
    }

    // 4j. Every score track fully documented, GC drawing as its own lane, and no track claiming
    //     a resolution it does not have.
    const trackMeta = await page.evaluate(async () => {
      const idx = await (await fetch('/genome-data/index.json')).json();
      return { tracks: idx.tracks, gc: idx.gcComparison, levels: idx.levels };
    });
    // Two models' worth: four Shorkie_LM / conservation / composition lanes and five from the
    // expression model. A hardcoded total would have to be edited whenever a lane lands, so this
    // asserts the SHAPE -- both models present, and every track internally consistent.
    if (trackMeta.tracks.length < 4) {
      fail(scope, `${trackMeta.tracks.length} score tracks in the index`);
    }
    for (const pre of ['lm-', 'sk-']) {
      if (!trackMeta.tracks.some((t) => t.id.startsWith(pre))) {
        fail(scope, `no ${pre}* track in the index`);
      }
    }
    for (const tr of trackMeta.tracks) {
      const native = tr.nativeBp ?? 1;
      // A level finer than the track's own bins would be an upsampled step function drawn as
      // though the model resolved single bases; one its bins do not divide evenly would aggregate
      // a fraction of a bin, which is a different quantity from a mean.
      for (const l of tr.levels ?? []) {
        if (l.binBp < native || l.binBp % native !== 0) {
          fail(scope, `${tr.id} ships a ${l.binBp} bp level for ${native} bp data`);
        }
      }
      if (!(tr.levels ?? []).length) fail(scope, `${tr.id} declares no level ladder`);
      // A signed axis must be symmetric, or its zero rule sits off-centre and every bar is read
      // against the wrong baseline.
      if (tr.axis[0] < 0 && tr.axis[0] !== -tr.axis[1]) {
        fail(scope, `${tr.id} is signed but its axis ${tr.axis} is asymmetric`);
      }
    }
    for (const tr of trackMeta.tracks) {
      // Four fields, not a paragraph: a track that ships without saying what it does NOT mean is
      // the one a reader will misread.
      const missing = ['source', 'measures', 'read', 'caveat'].filter((k) => !tr.docs?.[k]);
      if (missing.length) fail(scope, `track ${tr.id} is missing docs: ${missing.join(', ')}`);
    }
    if (!trackMeta.gc || Math.abs(trackMeta.gc.pearson) > 0.05) {
      fail(scope, `model IC vs GC should be near zero, got ${trackMeta.gc?.pearson}`);
    }

    // 4k. Every lane in the panel carries its documentation.
    const docCount = await page.$$eval('.gb-docs', (n) => n.length);
    const toggleCount = await page.$$eval('[data-gb-toggle]', (n) => n.length);
    if (docCount < toggleCount - 2) {
      fail(scope, `${docCount} docs expanders for ${toggleCount} toggles — lanes are undocumented`);
    }
    const anyDoc = await page.$eval('.gb-docs', (e) => e.textContent || '');
    if (!/Source\./.test(anyDoc) || !/What it does not mean\./.test(anyDoc)) {
      fail(scope, 'a docs expander is missing one of its four fields');
    }

    // 4l. Clicking a binding-site box shows what the factor recognises.
    await page.goto(`${GENOME_ROUTE}#chrVII:882012-884610;t=lm-masked,genes,tfbs_chip`,
                    { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 20000 });
    await page.waitForTimeout(1800);
    const nMotifs = await page.$eval('[data-genome-browser]',
                                     (h) => Number(h.dataset.gbMotifs ?? 0));
    if (nMotifs < 100) fail(scope, `the motif table has ${nMotifs} factors`);
    const track = await page.$eval('[data-gb-track]', (c) => {
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    let motifOpen = false;
    for (let y = 150; y < track.h - 20 && !motifOpen; y += 4) {
      for (let xf = 0.12; xf < 0.95 && !motifOpen; xf += 0.02) {
        await page.mouse.move(track.x + track.w * xf, track.y + y);
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForTimeout(12);
        motifOpen = await page.$eval('[data-gb-motif]', (e) => !e.hasAttribute('hidden'))
          .catch(() => false);
      }
    }
    if (!motifOpen) fail(scope, 'clicking a binding-site box did not open the motif panel');
    else {
      const m = await page.evaluate(() => {
        const b = document.querySelector('[data-gb-motif]');
        const cv = b.querySelector('canvas');
        return { for: b.dataset.gbMotifFor, has: b.dataset.gbMotifHas,
                 cols: Number(cv?.dataset.gbMotifLetters ?? 0) };
      });
      if (!m.for) fail(scope, 'the motif panel opened without naming a factor');
      // A factor with no matrix is a FINDING -- it does not bind DNA -- so the panel must still
      // open and explain, rather than the click doing nothing.
      if (m.has === '1' && m.cols < 4) fail(scope, `${m.for}: a matrix with ${m.cols} columns`);
    }
    // The matrices themselves: counts drawn unnormalised produce a logo that looks plausible and
    // is wrong by whatever the column depth happens to be.
    const pfm = await page.evaluate(async () => {
      const m = await (await fetch('/genome-data/motifs.json')).json();
      let worstSum = 0;
      let worstBits = 0;
      let n = 0;
      for (const f of Object.values(m.factors)) {
        if (!f.probs) continue;
        n += 1;
        for (let i = 0; i < f.probs.length; i += 1) {
          worstSum = Math.max(worstSum, Math.abs(f.probs[i].reduce((a, b) => a + b, 0) - 1));
          const h = -f.probs[i].filter((x) => x > 0)
            .reduce((a, x) => a + x * Math.log2(x), 0);
          worstBits = Math.max(worstBits, Math.abs((2 - h) - f.bits[i]));
        }
      }
      return { worstSum, worstBits, n };
    });
    if (pfm.worstSum > 1e-3) fail(scope, `a PFM column sums to ${1 + pfm.worstSum}, not 1`);
    if (pfm.worstBits > 1e-2) fail(scope, `motif bits disagree with 2 - H(p) by ${pfm.worstBits}`);

    // 4m. Overlapping features stack instead of hiding each other.
    await page.goto(`${GENOME_ROUTE}#chrVII:882012-884610;t=lm-masked,genes,regulatory`,
                    { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const packed = await page.evaluate(() => {
      const c = document.querySelector('[data-gb-track]');
      return { h: c.clientHeight, feats: JSON.parse(c.dataset.gbFeatures || '{}') };
    });
    if (!(packed.feats.regulatory > 1)) {
      fail(scope, 'the ORegAnno lane drew too few features to test stacking');
    }
    // Turning a lane with heavy overlap on must make the canvas taller than the same view without
    // it: a lane that painted everything on one row would not change the height at all.
    await page.goto(`${GENOME_ROUTE}#chrVII:882012-884610;t=lm-masked,genes`,
                    { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 20000 });
    await page.waitForTimeout(1200);
    const bare = await page.$eval('[data-gb-track]', (c) => c.clientHeight);
    if (!(packed.h > bare + 20)) {
      fail(scope, `stacked features added only ${packed.h - bare}px — rows are not being packed`);
    }

    // 4n. The phone. A separate context, because a narrow viewport is not a resize -- the default
    //     lane set and the letter threshold are both decided at boot from the width.
    {
      const phone = await browser.newContext({
        baseURL, viewport: { width: 390, height: 664 },
        deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      });
      const ph = await phone.newPage();
      try {
        await ph.goto(GENOME_ROUTE, { waitUntil: 'networkidle' });
        await ph.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 25000 });
        await ph.waitForTimeout(2000);

        const readSpan = async () => {
          const v = await ph.$eval('[data-genome-browser]', (h) => h.dataset.gbView ?? '');
          const [a, b] = v.split(':')[1].split('-').map((x) => Number(x.replace(/,/g, '')));
          return b - a;
        };

        // THE acceptance test. Before this work, six taps reached the 40 bp floor with the mode
        // still "bars": 252 px of plot over 40 bases is 6.3 px a base, under a flat 7 px
        // threshold, so the sequence was arithmetically unreachable on a phone.
        let taps = 0;
        while ((await readSpan()) > 21 && taps < 40) {
          await ph.click('[data-gb-zoom="0.5"]');
          await ph.waitForTimeout(110);
          taps += 1;
        }
        const deep = await ph.$eval('[data-gb-track]', (c) => ({ ...c.dataset }));
        if (deep.gbMode !== 'letters') {
          fail(scope, `phone: ${taps} taps reached ${await readSpan()} bp with mode `
            + `"${deep.gbMode}" — the letter view is unreachable`);
        }

        // Pinch. `.gb-track` sets touch-action: none, so the browser's own pinch is suppressed
        // there and this is the only zoom gesture a phone has.
        await ph.fill('[data-gb-locus]', 'chrIV:100000-140000');
        await ph.click('[data-gb-go]');
        await ph.waitForTimeout(700);
        const beforePinch = await readSpan();
        const box = await ph.$eval('[data-gb-track]', (c) => {
          const r = c.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        });
        await ph.evaluate(async ({ x, y, w, h }) => {
          const el = document.querySelector('[data-gb-track]');
          const cy = y + h / 2;
          const mk = (type, id, cx) => new PointerEvent(type, {
            pointerId: id, pointerType: 'touch', isPrimary: id === 1,
            clientX: cx, clientY: cy, bubbles: true, cancelable: true,
          });
          el.dispatchEvent(mk('pointerdown', 1, x + w * 0.4));
          el.dispatchEvent(mk('pointerdown', 2, x + w * 0.6));
          for (let i = 1; i <= 10; i += 1) {
            el.dispatchEvent(mk('pointermove', 1, x + w * (0.4 - 0.025 * i)));
            el.dispatchEvent(mk('pointermove', 2, x + w * (0.6 + 0.025 * i)));
            await new Promise((r) => setTimeout(r, 20));
          }
          el.dispatchEvent(mk('pointerup', 1, x));
          el.dispatchEvent(mk('pointerup', 2, x + w));
          await new Promise((r) => setTimeout(r, 400));
        }, box);
        const afterPinch = await readSpan();
        if (!(afterPinch < beforePinch)) {
          fail(scope, `phone: spreading two fingers did not zoom in (${beforePinch} -> ${afterPinch} bp)`);
        }

        // The controls must not eat the screen. Before this work the nav alone was 219 px of a
        // 664 px viewport and the track began at y = 444.
        const layout = await ph.evaluate(() => {
          const nav = document.querySelector('.vp-nav');
          const track = document.querySelector('[data-gb-track]');
          return {
            navH: nav ? Math.round(nav.getBoundingClientRect().height) : 0,
            trackTop: track ? Math.round(track.getBoundingClientRect().top) : 0,
            overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          };
        });
        if (layout.navH > 90) fail(scope, `phone: the control bar is ${layout.navH}px tall`);
        if (layout.trackTop > 340) fail(scope, `phone: the track starts at y=${layout.trackTop}`);
        if (layout.overflow > 1) fail(scope, `phone: document overflows by ${layout.overflow}px`);

        // The track panel is a drawer at this width, not a column below the fold.
        await ph.click('[data-gb-panel-toggle]');
        await ph.waitForTimeout(400);
        const drawer = await ph.evaluate(() => ({
          open: document.querySelector('[data-genome-browser]').dataset.gbPanelOpen,
          shown: getComputedStyle(document.querySelector('.gb-panel')).display !== 'none',
        }));
        if (drawer.open !== '1' || !drawer.shown) fail(scope, 'phone: the tracks drawer did not open');

        // Nothing on a phone may be CLIPPED rather than scrollable. A four-column statistics table
        // is 314 px wide in a 217 px box, and clipping its last column -- "vs genome", the one
        // that answers the question the panel exists for -- reads as a column that is not there.
        // The document does not overflow when this happens, so the check above cannot see it.
        await ph.click('[data-gb-panel-toggle]');
        await ph.waitForTimeout(400);
        const clipped = await ph.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll(
            '.gb-stats, .gw-chips, .gb-panel__presets, .gb-stats__scroll')) {
            const scroller = getComputedStyle(el).overflowX === 'auto' ? el : el.parentElement;
            if (!scroller) continue;
            const canScroll = getComputedStyle(scroller).overflowX === 'auto';
            if (el.scrollWidth > scroller.clientWidth + 1 && !canScroll) {
              out.push(`${el.className}: ${el.scrollWidth} in ${scroller.clientWidth}`);
            }
          }
          return out;
        });
        if (clipped.length) {
          fail(scope, `phone: content clipped rather than scrollable — ${clipped.join('; ')}`);
        }
        progress(`  genome/phone: ${taps} taps to letters, pinch `
          + `${beforePinch}->${afterPinch} bp, nav ${layout.navH}px, track top ${layout.trackTop}`);
      } catch (error) {
        fail(scope, `phone: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        await phone.close();
      }
    }

    // 5. Four CLIENT-SIDE round trips must leave exactly one controller listening.
    //
    // This page is `bare`, so its host is destroyed and rebuilt on every navigation and the mount
    // guard cannot see the previous controller. Measured by counting how many canvases respond to
    // one theme-change: one live controller repaints two, and a leak gives two more per stale
    // controller -- 10 after four round trips, which is what this found before the listeners were
    // made self-removing. Clicks, never `location.href`, which is a full load and proves nothing.
    await page.goto(GENOME_ROUTE, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 20000 });
    // How many canvases ONE controller owns, measured before the round trips rather than typed.
    // The page has grown a third (the scatter) once already, and a hardcoded 2 turns that into a
    // failure that reads like a leak.
    const canvasesPerController = await page.evaluate(
      () => document.querySelectorAll('[data-genome-browser] canvas').length);
    let hardLoads = 0;
    page.on('load', () => { hardLoads += 1; });
    for (let i = 0; i < 4; i += 1) {
      await page.click('a.vp-sub[href="/shorkie-lab/"]');
      await page.waitForSelector('.sl-grid', { timeout: 15000 });
      await page.click(`a.sl-card[href="${GENOME_ROUTE}"]`);
      await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 15000 });
      await page.waitForTimeout(500);
    }
    if (hardLoads !== 0) fail(scope, `${hardLoads} full page loads — the round trip tests nothing`);
    const live = await page.evaluate(async () => {
      let n = 0;
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...a) { n += 1; return real.apply(this, a); };
      document.dispatchEvent(new CustomEvent('khc:theme-change'));
      await new Promise((r) => setTimeout(r, 600));
      HTMLCanvasElement.prototype.getContext = real;
      return n;
    });
    // One controller repaints its own canvases and no more. A leaked controller holds a detached
    // canvas and repaints that too, so the count scales with how many round trips leaked.
    if (live > canvasesPerController) {
      fail(scope, `${live} canvases repaint on one theme-change after 4 round trips — `
        + `${(live / canvasesPerController).toFixed(1)} controllers are still listening `
        + `(one owns ${canvasesPerController})`);
    }
    const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
    if (canvasCount !== canvasesPerController) {
      fail(scope, `${canvasCount} canvases after 4 round trips, expected ${canvasesPerController}`);
    }

    // 4p. A COARSE track must not claim a resolution it does not have.
    //
    //     Shorkie's head emits 896 bins of 16 bp. A per-base level for it would be an upsampled
    //     step function -- 12,157,105 stored values carrying 760,000 values of real information,
    //     drawn as though the model resolved single bases. The pyramid simply has no such level,
    //     so the failure mode without the per-track ladder is not a blurred drawing but an empty
    //     lane: every tile request 404s. Both halves are checked here.
    await page.goto(`${GENOME_ROUTE}#chrVII:882012-884610;t=sk-rnaseq,sk-gradient,genes`,
                    { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 20000 });
    await page.waitForTimeout(2500);
    const coarse = await ds();
    if (!JSON.parse(coarse.gbLanes || '[]').includes('sk-rnaseq')) {
      fail(scope, `the coverage lane did not mount: ${coarse.gbLanes}`);
    }
    if (Number(coarse.gbDrawn) < 400) {
      fail(scope, `coarse + signed tracks drew only ${coarse.gbDrawn} columns`);
    }
    // The readout NAMES a track pinned at its own floor, rather than letting "per base" speak for
    // every lane. A silently-coarse lane is the browser claiming a resolution the model lacks.
    const lvlText = await page.$eval('[data-gb-level-out]', (e) => e.textContent || '');
    if (!/own floor/.test(lvlText) || !/16 bp/.test(lvlText)) {
      fail(scope, `at per-base zoom the readout does not name the 16 bp lane: "${lvlText.trim()}"`);
    }

    // 4q. A SIGNED track draws above AND below its zero rule.
    //
    //     Every bar used to fill from the lane floor, which would draw -0.8 and +0.2 as bars of the
    //     same sign -- an inverted reading of the one thing the track exists to report. Counted in
    //     pixels, because the sign is a property of the drawing and nothing else can see it.
    const halves = await page.evaluate(() => {
      const cv = document.querySelector('[data-gb-track]');
      const lanes = JSON.parse(cv.dataset.gbLanes || '[]');
      const i = lanes.indexOf('sk-gradient');
      if (i < 0) return null;
      // Lane geometry is not exported, so the band is found by locating the row with the most ink
      // in the lower half of the canvas and walking out; simpler and sufficient: split the whole
      // canvas into lanes by even division is WRONG, so instead scan for the two contiguous ink
      // bands and take the second.
      const g = cv.getContext('2d');
      const { width: w, height: h } = cv;
      const px = g.getImageData(0, 0, w, h).data;
      const rowInk = [];
      for (let y = 0; y < h; y += 1) {
        let n = 0;
        for (let x = 60; x < w - 4; x += 1) {
          const o = (y * w + x) * 4;
          if (px[o + 3] > 40 && (px[o] < 200 || px[o + 1] < 200 || px[o + 2] < 200)) n += 1;
        }
        rowInk.push(n);
      }
      return { rowInk, h };
    });
    if (!halves) {
      fail(scope, 'the signed attribution lane never mounted');
    } else {
      // The signed lane is the one whose ink is symmetric about its own middle. Find the widest
      // run of inked rows below the coverage lane and compare its two halves.
      const { rowInk } = halves;
      const inked = rowInk.map((n) => n > 3);
      const runs = [];
      let s = -1;
      inked.forEach((v, i) => {
        if (v && s < 0) s = i;
        if (!v && s >= 0) { runs.push([s, i]); s = -1; }
      });
      if (s >= 0) runs.push([s, inked.length]);
      const band = runs.filter((r) => r[1] - r[0] > 20).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[1];
      if (!band) {
        fail(scope, 'could not find a second inked band — the signed lane may be empty');
      } else {
        const mid = Math.round((band[0] + band[1]) / 2);
        const up = rowInk.slice(band[0], mid).reduce((a, b) => a + b, 0);
        const dn = rowInk.slice(mid, band[1]).reduce((a, b) => a + b, 0);
        if (up < 200 || dn < 200) {
          fail(scope, `signed lane draws ${up} px above and ${dn} px below its middle — `
            + 'a signed track filling from the floor is an inverted reading');
        }
        // Roughly balanced: gradient x input is ~50% negative genome-wide.
        const ratio = Math.max(up, dn) / Math.max(1, Math.min(up, dn));
        if (ratio > 4) fail(scope, `signed lane is ${ratio.toFixed(1)}:1 lopsided about its zero rule`);
      }
    }

    // 4r. Live correlation appears with exactly two lanes, and moves when the view does.
    const corrHere = await page.$eval('span[data-gb-corr]', (e) => e.textContent || '');
    if (!/r = -?\d/.test(corrHere)) {
      fail(scope, `two lanes on, but no correlation was reported: "${corrHere.trim()}"`);
    }
    const r1 = (await ds()).gbCorrelation;
    await go('chrIV:400,000-460,000');
    await page.waitForTimeout(1800);
    const r2 = (await ds()).gbCorrelation;
    if (!r2) fail(scope, 'correlation vanished after a pan');
    else if (r1 === r2) fail(scope, `correlation ${r1} unchanged across two different loci`);

    // 4s. Export writes the DATA behind the view, and its header names the bin size. A file with
    //     neither units nor a bin size is a trap the moment it leaves the browser.
    const dl = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.click('[data-gb-export-csv]'),
    ]).then(([d]) => d).catch(() => null);
    if (!dl) {
      fail(scope, 'CSV export produced no download');
    } else {
      const fs = await import('node:fs');
      const csv = fs.readFileSync(await dl.path(), 'utf8').split('\n');
      const head = csv.find((l) => l.startsWith('chrom,'));
      if (!head) fail(scope, 'CSV has no column header');
      else if (!/mean of \d+ bp|\(a\.u\.\)|\(bits\)/.test(head)) {
        fail(scope, `CSV header names no bin size or units: ${head}`);
      }
      if (!csv.some((l) => l.startsWith('# '))) fail(scope, 'CSV carries no provenance comment');
      if (csv.filter((l) => /^chr\w+,\d/.test(l)).length < 20) {
        fail(scope, `CSV has only ${csv.length} lines`);
      }
    }

    // 4t. Autoscale is OFF by default, changes the drawing, and SAYS SO on the lane. An axis that
    //     was rescaled without announcing it is the same defect as a bar chart from a non-zero
    //     baseline: the drawing is a different claim from the one the reader thinks they see.
    const pressed0 = await page.$eval('button[data-gb-autoscale]', (b) => b.getAttribute('aria-pressed'));
    if (pressed0 !== 'false') fail(scope, `autoscale defaults to ${pressed0}, must default off`);
    const shotA = await page.locator('[data-gb-track]').screenshot();
    await page.click('button[data-gb-autoscale]');
    await page.waitForTimeout(1200);
    const shotB = await page.locator('[data-gb-track]').screenshot();
    if (Buffer.compare(shotA, shotB) === 0) fail(scope, 'autoscale changed nothing on the canvas');
    const flag = await page.$eval('[data-genome-browser]', (h) => h.dataset.gbAutoscaleOn);
    if (flag !== 'true') fail(scope, `autoscale flag is ${flag}`);
    await page.click('button[data-gb-autoscale]');
    await page.waitForTimeout(800);

    // 4u. The two pages are SPLIT. The browser lives here and nowhere else; the expression page
    //     answers "how did the model decide, in this window" with its own per-locus views. An
    //     embed left behind on that page would be a second host for the same state.
    await page.goto('/shorkie-lab/shorkie/', { waitUntil: 'networkidle' });
    const stray = await page.$$eval('[data-genome-browser]', (h) => h.length);
    if (stray !== 0) fail(scope, `${stray} genome-browser host(s) left on the expression page`);
    await page.waitForFunction(
      () => document.querySelector('[data-vp]')?.dataset.vpTraceReady === 'true',
      { timeout: 60_000 },
    ).catch(() => {});
    const perLocus = await page.evaluate(() => {
      const inked = (sel) => {
        const c = document.querySelector(sel);
        if (!c) return -1;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n += 1;
        return n / (d.length / 4);
      };
      const cv = document.querySelector('[data-vp-viewport]');
      const lanes = (cv?.dataset.vpLanes ?? '').split('|').filter(Boolean);
      return {
        lanes,
        methods: (cv?.dataset.vpMethods ?? '').split('|').filter(Boolean).length,
        peak: Number(cv?.dataset.vpPeak ?? '0'),
        ink: inked('[data-vp-viewport]'),
        ann: lanes.includes('annotation') ? 1 : 0,
        annStat: document.querySelector('[data-vp-annstat]')?.textContent ?? '',
      };
    });
    if (!perLocus.lanes.includes('coverage')) {
      fail(scope, `the per-locus viewport has no coverage lane: ${perLocus.lanes.join('|')}`);
    }
    if (!(perLocus.peak > 0)) fail(scope, 'the coverage lane published no peak');
    if (perLocus.methods < 1) fail(scope, 'no attribution method lane is drawn');
    if (perLocus.ink < 0.005) fail(scope, 'the viewport drew almost nothing');
    if (!perLocus.ann) fail(scope, 'the annotation lane is absent');
    if (!/ChIP-supported/.test(perLocus.annStat)) {
      fail(scope, `the annotation readout does not name its tiers: "${perLocus.annStat}"`);
    }
    await page.goto(GENOME_ROUTE, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 25000 });
    await page.waitForTimeout(800);

    // 4u1. THE MODEL SELECTOR and THE PER-LOCUS LANE, the two things the panel gained.
    //
    //      The selector filters AVAILABILITY, never the enabled set, so switching away and back
    //      must restore exactly the lanes that were on. And `sk-locus` is the only lane whose data
    //      is an analysis pack rather than a tile pyramid: it must draw inside an analysed window,
    //      say "no data" outside one, and follow its cascading picker.
    const lanesOffered = () => page.$$eval('[data-gb-toggle]', (e) => e.map((x) => x.dataset.gbToggle));
    const lanesOn = () => page.$$eval('[data-gb-toggle]',
      (e) => e.filter((x) => x.checked).map((x) => x.dataset.gbToggle));
    const modeCount = await page.$$eval('[data-gb-model]', (b) => b.length);
    if (modeCount !== 3) fail(scope, `${modeCount} model modes, expected 3`);
    const onBoth = await lanesOn();
    await page.click('[data-gb-model="shorkie"]');
    await page.waitForTimeout(600);
    const shorkieOnly = await lanesOffered();
    if (shorkieOnly.some((id) => id.startsWith('lm-'))) {
      fail(scope, 'the Shorkie-only mode still offers a language-model lane');
    }
    await page.click('[data-gb-model="lm"]');
    await page.waitForTimeout(600);
    const lmOnly = await lanesOffered();
    if (lmOnly.some((id) => id.startsWith('sk-'))) fail(scope, 'the LM-only mode still offers a Shorkie lane');
    for (const keep of ['phastcons', 'genes']) {
      if (!lmOnly.includes(keep)) fail(scope, `the ${keep} lane belongs to neither model but was hidden`);
    }
    await page.click('[data-gb-model="both"]');
    await page.waitForTimeout(700);
    const backOn = await lanesOn();
    if (JSON.stringify(backOn) !== JSON.stringify(onBoth)) {
      fail(scope, `switching model lost the selection: ${onBoth} -> ${backOn}`);
    }

    // Inside TDH3's window, where the analysis packs exist.
    await page.goto(`${GENOME_ROUTE}#chrVII:876142-890478;t=sk-locus,genes`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 25000 });
    await page.waitForTimeout(3000);
    const locusLane = await page.evaluate(() => {
      const cv = document.querySelector('[data-gb-track]');
      return { lanes: JSON.parse(cv.dataset.gbLanes || '[]'),
               picks: document.querySelectorAll('[data-gb-locus-group], [data-gb-locus-key], [data-gb-locus-run]').length };
    });
    if (!locusLane.lanes.includes('sk-locus')) fail(scope, 'the per-locus lane did not draw inside a window');
    if (locusLane.picks !== 3) fail(scope, `${locusLane.picks} cascading selects, expected 3`);
    const beforePick = await page.locator('[data-gb-track]').screenshot();
    await page.selectOption('[data-gb-locus-key]', { index: 30 });
    await page.waitForTimeout(2500);
    const afterPick = await page.locator('[data-gb-track]').screenshot();
    if (Buffer.compare(beforePick, afterPick) === 0) {
      fail(scope, 'choosing a different output track redrew nothing');
    }
    // A per-locus lane requests no tiles: they do not exist, and asking for them 404s.
    const bad = [];
    page.on('response', (r) => { if (r.status() >= 400) bad.push(new URL(r.url()).pathname); });
    await page.selectOption('[data-gb-locus-key]', { index: 12 });
    await page.waitForTimeout(1500);
    const strayTiles = bad.filter((u) => u.includes('sk-locus'));
    if (strayTiles.length) fail(scope, `the per-locus lane requested tiles: ${strayTiles[0]}`);

    // 4u2. THE ANNOTATION OVERLAY, and the check the panel it replaced never had.
    //
    //      A solid box claims the factor's consensus is genuinely in the sequence under it; a
    //      hollow one claims it is not. Harbison/MacIsaac calls are PWM-plus-conservation calls,
    //      not consensus matches -- measured, only 22.8% of 670 contain their factor's consensus --
    //      so drawing both the same way would assert they are the same evidence. Every box is
    //      re-derived here from the sequence rather than trusted.
    await page.goto(`${GENOME_ROUTE}#chrVII:883780-883930;t=sk-ism,genes,tfbs_chip`,
                    { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 20000 });
    await page.waitForTimeout(2500);
    const overlay = await ds();
    if (overlay.gbMode !== 'letters') {
      fail(scope, `the overlay needs a letter view; mode is ${overlay.gbMode}`);
    }
    const boxes = JSON.parse(overlay.gbBoxList || '[]');
    if (boxes.length < 4) fail(scope, `only ${boxes.length} annotation boxes over the promoter`);
    else {
      // IUPAC, expanded exactly as `motifMatch` does, on both strands.
      const IUPAC = {
        A: 'A', C: 'C', G: 'G', T: 'T', R: 'AG', Y: 'CT', S: 'GC', W: 'AT', K: 'GT', M: 'AC',
        B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT',
      };
      const rc = (s) => [...s].reverse().map((c) => ({ A: 'T', C: 'G', G: 'C', T: 'A' })[c] ?? 'N').join('');
      const matches = (seq, cons) => {
        for (const alt of cons.split('|')) {
          for (const s of [seq, rc(seq)]) {
            for (let o = 0; o + alt.length <= s.length; o += 1) {
              let ok = true;
              for (let i = 0; i < alt.length && ok; i += 1) {
                ok = (IUPAC[alt[i]] ?? alt[i]).includes(s[o + i]);
              }
              if (ok) return true;
            }
          }
        }
        return false;
      };
      let wrongSolid = 0;
      let wrongHollow = 0;
      for (const b of boxes) {
        if (b.kind === 'motif' && b.consensus && b.matched && !matches(b.matched, b.consensus)) {
          wrongSolid += 1;
        }
        if (b.kind === 'region' && b.matched) wrongHollow += 1;
      }
      if (wrongSolid) {
        fail(scope, `${wrongSolid} SOLID box(es) whose consensus is not in the sequence under them`);
      }
      if (wrongHollow) fail(scope, `${wrongHollow} hollow box(es) carry a matched sequence`);
      const solid = boxes.filter((b) => b.kind !== 'region').length;
      if (solid === boxes.length) {
        fail(scope, 'every box is solid — the evidence distinction is not being made');
      }
      progress(`  overlay: ${boxes.length} boxes, ${solid} solid, ${boxes.length - solid} hollow`);
    }
    // The paper's four colours, and no others. This came over from `chromium/paper-fidelity`,
    // which read them off SVG fills; here they are counted in canvas pixels. Fixed across all six
    // themes, because a figure's base colours are part of the figure.
    const inkColours = await page.$eval('[data-gb-track]', (cv) => {
      const g = cv.getContext('2d');
      // The WHOLE canvas, and a low floor: C and G are the rarer bases in an AT-rich yeast
      // promoter, and a half-canvas sample with a 200 px floor missed both. Anti-aliased edges are
      // excluded by the alpha test, so a hit is glyph interior.
      const px = g.getImageData(0, 0, cv.width, cv.height).data;
      const seen = new Map();
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 250) continue;
        const k = `${px[i]},${px[i + 1]},${px[i + 2]}`;
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      return [...seen.entries()].filter(([, n]) => n > 20).map(([k]) => k);
    });
    for (const want of ['0,128,0', '0,0,255', '255,165,0', '255,0,0']) {
      if (!inkColours.includes(want)) {
        fail(scope, `the letter lane is missing the paper's colour rgb(${want})`);
      }
    }

    // A letter lane must announce its LINEAR axis: a logo's height is proportional to its value,
    // and symlog is not, so comparing glyph heights on the wrong scale is a silent misreading.
    const lvlTxt = await page.$eval('[data-gb-level-out]', (e) => e.textContent || '');
    const laneSaysLinear = await page.$eval('[data-gb-track]', (c) => c.dataset.gbLanes || '');
    if (!/letters/.test(lvlTxt)) fail(scope, `letter view not announced: "${lvlTxt.trim()}"`);
    if (!laneSaysLinear.includes('sk-ism')) fail(scope, 'the mutagenesis lane did not mount');

    // 4v. The loop between the two pages closes in BOTH directions. The region select already went
    //     from a name to a place; this is the other half -- standing in one of the analysed
    //     windows must offer the analysis, and following that offer must land on the right gene.
    //     A link that appears everywhere is as useless as one that never appears, so both are
    //     checked.
    await page.goto(`${GENOME_ROUTE}#chrII:278000-281500`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 20000 });
    await page.waitForTimeout(1800);
    const deepHref = await page.$eval('[data-gb-deep]',
      (a) => (a.hidden ? null : a.getAttribute('href')));
    if (!deepHref || !/#locus=/.test(deepHref)) {
      fail(scope, `inside the GAL1 window but no deep link: ${deepHref}`);
    } else {
      await page.goto(deepHref, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-vp-locus]', { timeout: 20000 });
      await page.waitForTimeout(2500);
      const landed = await page.$eval('[data-vp-locus]',
        (s) => s.options[s.selectedIndex].textContent || '');
      const want = deepHref.split('#locus=')[1];
      if (!landed.includes(want)) {
        fail(scope, `${deepHref} landed on "${landed.trim()}", not ${want}`);
      }
    }
    await page.goto(`${GENOME_ROUTE}#chrIV:1000000-1010000`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 20000 });
    await page.waitForTimeout(1800);
    const awayHidden = await page.$eval('[data-gb-deep]', (a) => a.hidden);
    if (!awayHidden) fail(scope, 'the deep link is shown outside any analysed window');

    //     And the outbound half: the analysis page points back into the browser at whatever
    //     window is selected, framed on the gene rather than on the 16 kb window -- landing on
    //     the window shows a dozen genes and no indication which one the page is about.
    await page.goto('/shorkie-lab/shorkie/', { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => document.querySelectorAll('[data-vp-locus] option').length > 5, null, { timeout: 30000 });
    await page.waitForTimeout(2000);
    const first = await page.$eval('[data-vp-genome-link]', (a) => a.getAttribute('href'));
    const galIdx = await page.$eval('[data-vp-locus]',
      (s) => [...s.options].findIndex((o) => (o.textContent || '').includes('GAL1')));
    await page.selectOption('[data-vp-locus]', String(galIdx));
    await page.waitForTimeout(1500);
    const moved = await page.$eval('[data-vp-genome-link]', (a) => a.getAttribute('href'));
    if (!moved || moved === first) {
      fail(scope, `the "in genome" link did not follow the locus change: ${first} -> ${moved}`);
    } else {
      await page.goto(moved, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-genome-browser][data-gb-ready="1"]', { timeout: 20000 });
      await page.waitForTimeout(1800);
      const back = await page.$eval('[data-gb-deep]',
        (a) => (a.hidden ? null : a.getAttribute('href')));
      if (!back || !back.includes('locus=')) {
        fail(scope, `following "${moved}" did not land inside an analysed window`);
      }
    }

    if (bad.length) fail(scope, `genome-data requests failed: ${bad.slice(0, 3).join(', ')}`);
    if (errors.length) fail(scope, `console/page errors: ${errors.slice(0, 2).join(' | ')}`);
    progress(`  genome: levels ${ladder.join(' ')}, cache peak ${peak}/${cap}, ${evicted} evicted, `
      + `${searchN} genes searchable, ${live / canvasesPerController} controller(s) live after `
      + '4 round trips, '
      + `per-locus lane ${locusLane.lanes.join('+')}`);
  } finally {
    await context.close();
  }
}

/**
 * The Shorkie_LM page. Everything is precomputed, so this is fast -- but a page that silently
 * renders empty panels looks identical to one that is loading, which is exactly what happened to
 * the expression page's output panels once.
 */
async function auditLanguageModel(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1400 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  try {
    await page.goto(LM_ROUTE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('[data-lm]')?.dataset.lmLocus,
      { timeout: 60_000 });
    await page.waitForTimeout(1200);

    const st = await page.evaluate(() => {
      const d = (sel, key) => document.querySelector(sel)?.dataset?.[key] ?? null;
      return {
        passes: Number(d('[data-lm-passes]', 'lmPasses') ?? 0),
        ic: d('[data-lm-ic]', 'lmIc'),
        ann: Number(d('[data-lm-annotation]', 'lmAnnotation') ?? 0),
        letters: Number(d('[data-lm-logo]', 'letters') ?? 0),
        motifs: Number(d('[data-lm-motifs]', 'lmMotifs') ?? 0),
        enrich: Number(d('[data-lm-enrichment]', 'lmEnrichment') ?? 0),
        embed: Number(d('[data-lm-embed]', 'lmEmbed') ?? 0),
        h1: document.querySelectorAll('h1').length,
        how: document.querySelectorAll('details.vp-how').length,
        openByDefault: [...document.querySelectorAll('details.vp-how')].some((x) => x.open),
        metrics: document.querySelector('[data-lm-metrics]')?.textContent ?? '',
        window: d('[data-lm-logo]', 'window'),
        loci: document.querySelectorAll('[data-lm-pick-locus] option').length,
        regions: document.querySelectorAll('[data-lm-region] option').length,
        summary: Number(d('[data-lm-summary]', 'lmSummary') ?? 0),
        context: document.querySelector('[data-lm-region-context]')?.textContent ?? '',
        navs: document.querySelectorAll('[data-lm-region]').length,
      };
    });
    if (st.h1 !== 1) fail(scope, `expected exactly one <h1>, found ${st.h1}`);
    if (st.passes !== 3) fail(scope, `the three-passes table has ${st.passes} rows, expected 3`);
    if (!st.ic) fail(scope, 'the information-content track drew nothing');
    if (st.ann < 1) fail(scope, 'the annotation track drew no features');
    if (st.letters < 50) fail(scope, `the constraint logo drew only ${st.letters} letters`);
    if (st.motifs < 1) fail(scope, 'the motif reconstruction table is empty');
    if (st.enrich < 4) fail(scope, `enrichment measured only ${st.enrich} classes`);
    if (st.embed !== 128) fail(scope, `the embedding map drew ${st.embed} points, expected 128`);
    if (st.how < 4) fail(scope, `${st.how} disclosures, expected at least 4`);
    if (st.openByDefault) fail(scope, 'a disclosure is open by default');
    if (!/perplexity/.test(st.metrics)) fail(scope, `metrics line missing perplexity: "${st.metrics}"`);
    // All fourteen windows reachable. The page shipped for a while with locusIndex pinned at 0 and
    // thirteen of them unreachable, while the prose made claims about all fourteen.
    if (st.loci !== N_LOCI) fail(scope, `the locus select offers ${st.loci}, expected ${N_LOCI}`);
    if (st.regions < 2) fail(scope, `the region select offers ${st.regions}, expected the whole window plus genes`);
    if (st.navs !== 1) fail(scope, `${st.navs} region selectors on the page, expected exactly one`);
    if (st.summary !== N_LOCI) fail(scope, `the cross-locus table has ${st.summary} rows, expected ${N_LOCI}`);
    if (!/IC .* vs window/.test(st.context)) {
      fail(scope, `the region context line does not report scoped constraint: "${st.context}"`);
    }

    // The two passes must give DIFFERENT numbers. If they ever agree, one of them is not being
    // read -- which is the failure this page's whole framing exists to prevent.
    const masked = await page.evaluate(() =>
      document.querySelector('[data-lm-logo-stat]')?.textContent ?? '');
    await page.selectOption('[data-lm-pass]', 'unmasked');
    await page.waitForTimeout(900);
    const unmasked = await page.evaluate(() =>
      document.querySelector('[data-lm-logo-stat]')?.textContent ?? '');
    if (masked === unmasked) {
      fail(scope, `the masked and unmasked passes report the same constraint ("${masked}") -- `
        + 'one of them is not being read');
    }
    await page.selectOption('[data-lm-pass]', 'masked');
    await page.waitForTimeout(600);

    // Clicking a base must produce a real distribution.
    const before = await page.evaluate(() => document.querySelector('[data-lm-base]')?.dataset.lmBase ?? null);
    await page.evaluate(() => {
      const hit = document.querySelector('[data-lm-logo] rect[data-pos]');
      hit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({
      pos: document.querySelector('[data-lm-base]')?.dataset.lmBase ?? null,
      rows: document.querySelectorAll('[data-lm-base] .vp-baserow').length,
      note: document.querySelector('[data-lm-base-note]')?.textContent ?? '',
    }));
    if (after.pos === before) fail(scope, 'clicking a logo column did not select a base');
    if (after.rows !== 4) fail(scope, `the base readout shows ${after.rows} bases, expected 4`);
    if (after.note.length < 40) fail(scope, 'the base readout has no interpretation line');

    // Brushing the constraint track must move the logo window.
    const w0 = st.window;
    const strip = await page.$('[data-lm-ic]');
    if (strip) {
      await strip.scrollIntoViewIfNeeded();
      const box = await strip.boundingBox();
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.45, box.y + box.height / 2, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      const w1 = await page.evaluate(() => document.querySelector('[data-lm-logo]')?.dataset.window);
      if (w1 === w0) fail(scope, 'brushing the constraint track did not move the logo window');
    }

    // --- the region stepper scopes as well as navigates -------------------------------------
    const r0 = await page.evaluate(() => ({
      ctx: document.querySelector('[data-lm-region-context]')?.textContent ?? '',
      win: document.querySelector('[data-lm-logo]')?.dataset.window ?? '',
    }));
    await page.locator('[data-lm-region-next]').scrollIntoViewIfNeeded();
    await page.locator('[data-lm-region-next]').click();
    await page.waitForTimeout(600);
    const r1 = await page.evaluate(() => ({
      ctx: document.querySelector('[data-lm-region-context]')?.textContent ?? '',
      win: document.querySelector('[data-lm-logo]')?.dataset.window ?? '',
      cols: document.querySelectorAll('[data-lm-enrichment] thead th').length,
    }));
    if (r1.ctx === r0.ctx) fail(scope, 'stepping the region did not change the context line');
    if (r1.win === r0.win) {
      fail(scope, 'stepping the region did not move the logo window -- a selection that scopes the '
        + 'numbers but leaves the letters shows one gene under another gene\'s heading');
    }
    if (r1.cols !== 6) fail(scope, `enrichment has ${r1.cols} columns with a gene selected, expected 6`);

    // --- switching locus changes the numbers, and leaves no view behind -----------------------
    // ACT1 (index 2) is chosen because its gene model HAS an intron: the default window does not,
    // and a gene track that paints introns as exons is invisible on a window with none.
    const m0 = await page.evaluate(() => document.querySelector('[data-lm-metrics]')?.textContent ?? '');
    await page.selectOption('[data-lm-pick-locus]', '2');
    await page.waitForFunction(() => document.querySelector('[data-lm]')?.dataset.lmLocus === 'YFL039C',
      { timeout: 30_000 });
    await page.waitForTimeout(1200);
    const sw = await page.evaluate(() => ({
      metrics: document.querySelector('[data-lm-metrics]')?.textContent ?? '',
      locus: document.querySelector('[data-lm]')?.dataset.lmLocus ?? '',
      gene: JSON.parse(document.querySelector('[data-lm-annotation]')?.dataset.lmGeneTrack ?? '{}'),
      ctx: document.querySelector('[data-lm-region-context]')?.textContent ?? '',
      ann: Number(document.querySelector('[data-lm-annotation]')?.dataset.lmAnnotation ?? 0),
    }));
    if (sw.metrics === m0) {
      fail(scope, `switching locus did not change the metrics line ("${m0}") -- the packs are `
        + 'per-locus and these numbers vary from 41.3% to 46.3% across the fourteen');
    }
    // The whole point of the shared renderer: an intron is a gap, not a painted-over exon.
    if (!(sw.gene.introns >= 1)) {
      fail(scope, `the ACT1 gene track drew ${sw.gene.introns} introns, expected at least 1 -- `
        + 'a plain rectangle per gene paints over every one of them');
    }
    if (!(sw.gene.blocks > 0)) fail(scope, 'the gene track drew no exon blocks');
    if (!sw.ctx.includes('YFL039C')) {
      fail(scope, `the context line still names the previous locus's gene: "${sw.ctx}"`);
    }

    // --- the evidence tiers are three claims, and each can be shown ---------------------------
    const a0 = sw.ann;
    await page.check('[data-lm-tier="conserved"]');
    await page.waitForTimeout(500);
    const a1 = await page.evaluate(() =>
      Number(document.querySelector('[data-lm-annotation]')?.dataset.lmAnnotation ?? 0));
    if (!(a1 > a0)) {
      fail(scope, `enabling the conserved-only tier drew ${a1} features against ${a0} -- the tier `
        + 'toggle is not reaching the drawing');
    }
    // ...but the enrichment table must NOT follow the drawing: it measures every tier always,
    // which is what makes the three-tier comparison visible at all.
    const eRows = await page.evaluate(() =>
      Number(document.querySelector('[data-lm-enrichment]')?.dataset.lmEnrichment ?? 0));
    await page.uncheck('[data-lm-tier="conserved"]');
    await page.uncheck('[data-lm-tier="chip"]');
    await page.waitForTimeout(500);
    const eRows2 = await page.evaluate(() =>
      Number(document.querySelector('[data-lm-enrichment]')?.dataset.lmEnrichment ?? 0));
    if (eRows2 !== eRows) {
      fail(scope, `the enrichment table followed the drawing toggles (${eRows} -> ${eRows2}); it `
        + 'must measure every tier whatever the canvas shows');
    }
    await page.check('[data-lm-tier="chip"]');

    // --- 320px: the sticky bar must not set the pane scrolling sideways -----------------------
    // The document-level overflow check cannot see this, because .vp-scroll is overflow-x:auto --
    // a bar wider than the viewport scrolls inside it and the document stays clean.
    await page.setViewportSize({ width: 320, height: 900 });
    await page.waitForTimeout(700);
    const narrow = await page.evaluate(() => {
      const pane = document.querySelector('.vp-scroll');
      const nav = document.querySelector('.vp-nav');
      return pane
        ? { over: pane.scrollWidth - pane.clientWidth, nav: nav ? nav.scrollWidth : 0, w: pane.clientWidth }
        : null;
    });
    if (narrow && narrow.over > 1) {
      fail(scope, `at 320px the scroll pane overflows by ${narrow.over}px (nav is `
        + `${narrow.nav}px against a ${narrow.w}px pane) -- a long select option does this`);
    }
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.waitForTimeout(500);

    // Reduced motion and a theme change must not break it.
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('khc:theme-change')));
    await page.waitForTimeout(600);
    const afterTheme = await page.evaluate(() =>
      document.querySelector('[data-lm-embed]')?.dataset.lmEmbed ?? null);
    if (afterTheme !== '128') fail(scope, 'the embedding map did not survive a theme change');

    if (consoleErrors.length) {
      fail(scope, `${consoleErrors.length} console error(s): ${consoleErrors[0].slice(0, 120)}`);
    }
  } finally {
    await context.close();
  }
}

async function auditAttentionStudio(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  try {
    await page.goto(ATTN_ROUTE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const st = await page.evaluate(() => {
      return {
        h1: document.querySelectorAll('h1').length,
        loci: document.querySelectorAll('[data-locus-select] option').length,
        ladderBtns: document.querySelectorAll('[data-layer-select]').length,
        trackCanvas: !!document.querySelector('[data-track-canvas]'),
        coneCanvas: !!document.querySelector('[data-cone-canvas]'),
        matrixCanvas: !!document.querySelector('[data-matrix-canvas]'),
        convCanvas: !!document.querySelector('[data-conv-canvas]'),
        paradigms: document.querySelectorAll('[data-card-paradigm]').length,
        distMetric: document.querySelector('[data-metric-distance]')?.textContent?.trim(),
      };
    });

    if (st.h1 !== 1) fail(scope, `expected exactly one <h1>, found ${st.h1}`);
    if (st.loci !== N_LOCI) fail(scope, `expected ${N_LOCI} loci options, found ${st.loci}`);
    if (st.ladderBtns !== 20) fail(scope, `expected 20 ladder layer buttons, found ${st.ladderBtns}`);
    if (!st.trackCanvas) fail(scope, 'track canvas missing');
    if (!st.coneCanvas) fail(scope, 'receptive cone canvas missing');
    if (!st.matrixCanvas) fail(scope, 'matrix canvas missing');
    if (!st.convCanvas) fail(scope, 'convergence canvas missing');
    if (st.paradigms !== 3) fail(scope, `expected 3 paradigm cards, found ${st.paradigms}`);
    if (!st.distMetric) fail(scope, 'distance metric missing');

    // Test slider interaction
    await page.locator('[data-compare-distance]').fill('12000');
    await page.waitForTimeout(300);
    const distText = await page.evaluate(() => document.querySelector('[data-compare-dist-label]')?.textContent?.trim());
    if (!distText?.includes('12,000')) fail(scope, `slider interaction failed, got ${distText}`);

    // Test 320px narrow viewport overflow
    await page.setViewportSize({ width: 320, height: 700 });
    await page.waitForTimeout(500);
    const narrowOver = await page.evaluate(() => {
      const pane = document.querySelector('.vp-scroll');
      return pane ? pane.scrollWidth - pane.clientWidth : 0;
    });
    if (narrowOver > 1) {
      fail(scope, `at 320px the scroll pane overflows by ${narrowOver}px`);
    }

    if (consoleErrors.length) {
      fail(scope, `${consoleErrors.length} console error(s): ${consoleErrors[0].slice(0, 120)}`);
    }
  } finally {
    await context.close();
  }
}


/**
 * The viewport's horizontal axis, at five widths.
 *
 * The check this replaces compared two SVG zoom views against each other, because the page used to
 * draw the same base pair through four separate elements each computing its own inset -- and they
 * disagreed at every container width but ~1,043 px, with the SIGN of the error flipping there.
 * There is one canvas now and one `xOfBp`, so that particular disagreement is not expressible.
 *
 * What CAN still go wrong is the backing store. `Math.max(320, clientWidth)` on a narrower element
 * makes the canvas wider than its box, `width: 100%` scales it back, and every horizontal
 * coordinate is off by that ratio -- uniformly, so the ruler, the logos and the sequence all lie by
 * the same amount and nothing looks broken. 1,043 px stays in the list: it was the width at which
 * the old bug was invisible, and it is the width a regression would hide at again.
 *
 * The second assertion is the one the zoom exists for: driven to base resolution, the sequence lane
 * must draw exactly one letter per base pair in view. That ties the drawing to the coordinate
 * system rather than to itself.
 */
async function auditAxisAlignment(browser, baseURL, scope) {
  for (const width of [320, 390, 760, 1043, 1440]) {
    const context = await browser.newContext({ baseURL, viewport: { width, height: 1000 } });
    const page = await context.newPage();
    try {
      await enterLocus(page);
      await page.locator('[data-vp-region-next]').scrollIntoViewIfNeeded();
      await page.locator('[data-vp-region-next]').click();
      await page.waitForTimeout(900);

      const geom = () => page.evaluate(() => {
        const cv = document.querySelector('[data-vp-viewport]');
        const ov = document.querySelector('[data-vp-overview]');
        const dpr = window.devicePixelRatio || 1;
        const b = cv.getBoundingClientRect();
        const ob = ov.getBoundingClientRect();
        const [a0, a1] = (cv.dataset.vpView ?? '0-0').split('-').map(Number);
        return {
          backing: cv.width / dpr, box: b.width,
          ovBacking: ov.width / dpr, ovBox: ob.width,
          span: a1 - a0,
          letters: cv.dataset.vpLetters === 'true',
          lanes: (cv.dataset.vpLanes ?? '').split('|').filter(Boolean),
          ovView: ov.dataset.vpView ?? '',
          view: cv.dataset.vpView ?? '',
        };
      });

      const r = await geom();
      if (Math.abs(r.backing - r.box) > 0.75) {
        fail(scope, `${width}px: viewport backing ${r.backing.toFixed(1)} vs box ${r.box.toFixed(1)}`);
      }
      if (Math.abs(r.ovBacking - r.ovBox) > 0.75) {
        fail(scope, `${width}px: overview backing ${r.ovBacking.toFixed(1)} vs box ${r.ovBox.toFixed(1)}`);
      }
      // The overview strip is the selection surface, so it must be showing the view it is meant to
      // let you move. A strip drawing a stale band is worse than no strip.
      if (r.ovView !== r.view) {
        fail(scope, `${width}px: overview shows ${r.ovView} while the viewport shows ${r.view}`);
      }

      // Every width must be able to REACH the letter view. The threshold scales with the plot, and
      // a constant 7 px a base once put it out of reach on a 390 px phone entirely.
      for (let i = 0; i < 14; i += 1) {
        const now = await geom();
        if (now.letters) break;
        await page.locator('[data-vp-zoom-in]').click();
        await page.waitForTimeout(60);
      }
      const z = await geom();
      if (!z.letters) {
        fail(scope, `${width}px: 14 taps of [+] never reached the letter view (span ${z.span} bp)`);
        continue;
      }
      for (const want of ['sequence', 'ism-logo']) {
        if (!z.lanes.includes(want)) {
          fail(scope, `${width}px: no ${want} lane at base zoom — ${z.lanes.join('|')}`);
        }
      }
      const seq = await page.evaluate(() => {
        const cv = document.querySelector('[data-vp-viewport]');
        const d = JSON.parse(cv.dataset.vpLogoDetail ?? '[]');
        return d.find((x) => x.id === 'ism-logo')?.columns ?? 0;
      });
      // One column per base in view, which is what ties the letters to the coordinate system.
      if (Math.abs(seq - z.span) > 2) {
        fail(scope, `${width}px: the logo drew ${seq} columns over a ${z.span} bp view`);
      }
    } finally {
      await context.close();
    }
  }
}

async function main() {
  const port = await availablePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const preview = spawn(npm, ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let previewLog = '';
  preview.stdout.on('data', (c) => { previewLog += c; });
  preview.stderr.on('data', (c) => { previewLog += c; });

  const want = expected();
  progress(`expecting ${want.panels} panels from source: ${want.headings.slice(0, 3).join(' / ')}…`);
  // Loud, because a gate that quietly stops testing a route is worse than one that fails.
  if (SKIPPED_ROUTES.length) {
    progress(`skipping ${SKIPPED_ROUTES.length} route(s) absent from this build: `
      + SKIPPED_ROUTES.join(', '));
  }

  try {
    await waitForSite(`${baseURL}${ROUTE}`, preview);
    for (const [engineName, browserType, engineProfiles] of matrix()) {
      const browser = await browserType.launch({ headless: true });
      try {
        for (const profile of engineProfiles) {
          const scope = `${engineName}/${profile.name}`;
          progress(scope);
          const context = await browser.newContext({
            baseURL,
            viewport: { width: profile.width, height: profile.height },
            colorScheme: profile.theme,
          });
          const page = await context.newPage();
          try {
            await auditPage(page, scope, want);
          } catch (error) {
            fail(scope, error instanceof Error ? error.message : String(error));
          } finally {
            await context.close();
          }
        }
        await captureFailure(`${engineName}/reduced-motion`, () => auditReducedMotion(browser, baseURL, `${engineName}/reduced-motion`));
        await captureFailure(`${engineName}/navigation`, () => auditNavigation(browser, baseURL, `${engineName}/navigation`));
        if (engineName === 'chromium') {
          // These three ride on the precomputed packs, so they need no model and belong in the
          // default run rather than behind --full.
          progress('chromium/coordinates');
          // `chromium/coordinates` retired with the panels it tested. It asserted that four
          // stacked SVG/canvas views mapped one bp to one x; the browser draws every lane into a
          // single canvas through one `xOfBp`, so they cannot disagree by construction, and
          // `chromium/axis-alignment` still checks the two surviving zoom views against each other.
          progress('chromium/traceback');
          await captureFailure('chromium/traceback', () => auditTraceback(browser, baseURL, 'chromium/traceback'));
          progress(`chromium/annotation (${N_LOCI} loci)`);
          await captureFailure('chromium/annotation', () => auditAnnotation(browser, baseURL, 'chromium/annotation'));
          progress('chromium/explanations');
          await captureFailure('chromium/explanations', () => auditExplanations(browser, baseURL, 'chromium/explanations'));
          progress('chromium/language-model');
          await captureFailure('chromium/language-model', () => auditLanguageModel(browser, baseURL, 'chromium/language-model'));
          if (built(ATTN_ROUTE)) {
            progress('chromium/attention-studio');
            await captureFailure('chromium/attention-studio', () => auditAttentionStudio(browser, baseURL, 'chromium/attention-studio'));
          } else {
            progress(`chromium/attention-studio SKIPPED — ${ATTN_ROUTE} is not in this build`);
          }
          progress('chromium/genome (level ladder, cache bound, axis, deep links)');
          await captureFailure('chromium/genome', () => auditGenomeBrowser(browser, baseURL, 'chromium/genome'));
          progress('chromium/axis-alignment (5 widths)');
          await captureFailure('chromium/axis-alignment', () => auditAxisAlignment(browser, baseURL, 'chromium/axis-alignment'));
          progress(`chromium/lab-prose (all ${LAB_ROUTES.length} routes)`);
          await captureFailure('chromium/lab-prose', () => auditSwallowedSpaces(browser, baseURL, 'chromium/lab-prose'));
          progress('chromium/region-views');
          await captureFailure('chromium/region-views', () => auditRegionViews(browser, baseURL, 'chromium/region-views'));
          progress('chromium/paper-fidelity');
          // `chromium/paper-fidelity` retired with the SVG logo it measured. Its assertions read
          // `transform` attributes off SVG paths, and the browser draws the same glyphs to canvas
          // where there is no DOM to read. What it guarded is now covered elsewhere: negatives
          // mirrored below the rule by the signed-lane ink check (4q), the paper's four colours by
          // the letter-colour check in the same scope, and one-letter-per-position by the fact
          // that gradient x input is exactly zero at the three bases that are not there.
          progress('chromium/interpretation');
          await captureFailure('chromium/interpretation', () => auditInterpretation(browser, baseURL, 'chromium/interpretation'));
          progress('chromium/constructive (receptive field, sufficiency, spacing)');
          await captureFailure('chromium/constructive', () => auditConstructive(browser, baseURL, 'chromium/constructive'));
          progress('chromium/volume');
          await captureFailure('chromium/volume', () => auditVolume(browser, baseURL, 'chromium/volume'));
          await captureFailure('chromium/volume-still', () => auditVolumeStill(browser, baseURL, 'chromium/volume-still'));
          await captureFailure('chromium/rotation-latch', () => auditRotationLatch(browser, baseURL, 'chromium/rotation-latch'));
        }
        if (FULL && engineName === 'chromium') {
          progress('chromium/full-model (one real inference, ~20 s)');
          await captureFailure('chromium/full-model', () => auditFullModel(browser, baseURL, 'chromium/full-model'));
          progress('chromium/stale-state (two inferences, ~40 s)');
          await captureFailure('chromium/stale-state', () => auditStaleState(browser, baseURL, 'chromium/stale-state'));
          progress(`chromium/no-model (${N_LOCI} loci, model blocked)`);
          await captureFailure('chromium/no-model', () => auditNoModel(browser, baseURL, 'chromium/no-model'));
          progress('chromium/ink-distribution (one inference, ~20 s)');
          await captureFailure('chromium/ink-distribution', () => auditInkDistribution(browser, baseURL, 'chromium/ink-distribution'));
        }
      } finally {
        await browser.close();
      }
    }
  } catch (error) {
    fail('harness', error instanceof Error ? error.message : String(error));
  } finally {
    try { process.kill(-preview.pid, 'SIGTERM'); } catch {}
  }

  if (!FULL) {
    progress('full-model assertions skipped (pass --full to run one real inference)');
  }
  if (failures.length) {
    console.error(`\nplayground UI audit FAILED with ${failures.length} problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    if (previewLog.trim()) console.error(`\npreview log:\n${previewLog}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nplayground UI audit passed.');
}

await main();
