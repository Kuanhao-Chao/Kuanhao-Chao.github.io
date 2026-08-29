/**
 * The rendering gate for /variant-playground/.
 *
 * This page had no browser gate at all, which is how it shipped unable to scroll: `bare` pins
 * html/body to `position:fixed; overflow:hidden`, so everything past the fold was clipped and
 * unreachable, and nothing in the repo would have noticed.
 *
 * Expected section count is DERIVED from the .astro source rather than held in an inventory here,
 * following audit-deep-dive-ui.mjs -- a hand-written count is a second copy of a fact, and this
 * repo has already shipped the consequences of that.
 *
 * `--smoke` (the CI form) stays on the live TypeScript conv-stem path and NEVER clicks Run: the
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
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { chromium, webkit } from 'playwright';

const ROUTE = '/variant-playground/';
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
  const src = readFileSync(new URL('../src/pages/variant-playground.astro', import.meta.url), 'utf8');
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
      neuronsPainted: canvasPainted('[data-vp-neurons]'),
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
  await page.locator('[data-vp-mode="locus"]').click();
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
    const svg = document.querySelector('[data-vp-track]');
    // The caption is marked, not found by document order: adding a y-axis label put a second
    // "predicted …" text ahead of it and this silently started reading the axis instead.
    const title = svg.querySelector('.vp-caption')?.textContent ?? '';
    return {
      peak: Number(svg?.dataset.peak ?? '0'),
      title: title ?? '',
      single: Number(document.querySelector('[data-vp-single]')?.dataset.peak ?? '0'),
      source: document.querySelector('[data-vp]').dataset.vpResultSource ?? '',
      packFailed: document.querySelector('[data-vp]').dataset.vpPackFailed === 'true',
    };
  });
  if (onLoad.source === 'live') fail(scope, 'a model run happened without a click');
  if (onLoad.packFailed) fail(scope, 'the precomputed activation pack failed to load');
  if (onLoad.source !== 'precomputed') fail(scope, `precomputed pack never loaded (source "${onLoad.source}")`);
  if (!(onLoad.peak > 0)) fail(scope, 'no predicted coverage on load — the precompute is not wired');
  if (!/precomputed/.test(onLoad.title)) fail(scope, `coverage does not say it is precomputed: "${onLoad.title}"`);
  if (!(onLoad.single > 0)) fail(scope, 'no single-track curve on load');

  if (s.flowPainted < 1000) fail(scope, `flow canvas painted only ${s.flowPainted} px`);
  if (s.neuronsPainted < 500) fail(scope, `conv-stem raster painted only ${s.neuronsPainted} px`);
  if (!s.subLayers) fail(scope, 'layer detail shows no sub-layer breakdown');
  if (!s.stageTitle) fail(scope, 'layer detail has no stage title');
  if (s.loci !== 14) fail(scope, `expected 14 preset loci, saw ${s.loci}`);
  if (s.figure4 !== 6) fail(scope, `expected the 6 Figure 4 windows, saw ${s.figure4}`);

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
    await page.locator('[data-vp-mode="locus"]').click();
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
        track: [...document.querySelectorAll('[data-vp-track] text')]
          .map((x) => x.textContent).find((x) => /predicted/.test(x)) ?? '',
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
      Number(document.querySelector('[data-vp-track]')?.dataset.peak ?? '0'));
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
    await page.locator('[data-vp-mode="locus"]').click();
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
    await page.locator('[data-vp-mode="locus"]').click();
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
          peak: Number(document.querySelector('[data-vp-track]')?.dataset.peak ?? '0'),
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

/** A client-side navigation round trip must leave exactly one live canvas. */
async function auditNavigation(browser, baseURL, scope) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
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
    await page.locator('[data-vp-mode="locus"]').click();
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
      peak: Number(document.querySelector('[data-vp-track]')?.dataset.peak ?? '0'),
    }));
    if (!/5,215 tracks/.test(after.heat)) fail(scope, `heatmap stat wrong: "${after.heat}"`);
    if (!after.track) fail(scope, 'single-track plot is unnamed');
    if (!(after.peak > 0)) fail(scope, 'predicted peak is not positive');
    // The regression that started all this: a WebGPU pipeline rejected by validation returns
    // zeros while onnxruntime reports success. A run that reports Done must have real output.
    const allZero = await page.evaluate(() => {
      const svg = document.querySelector('[data-vp-track]');
      return Number(svg?.dataset.peak ?? '0') === 0;
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
        Number(document.querySelector('[data-vp-track]')?.dataset.peak ?? '0'));
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
  await page.goto(ROUTE, { waitUntil: 'networkidle' });
  await page.locator('[data-vp-mode="locus"]').click();
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
    const track = page.locator('[data-vp-track]');
    await track.scrollIntoViewIfNeeded();
    const box = await track.boundingBox();
    await page.mouse.move(box.x + box.width * 0.44, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.56, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const geo = await page.evaluate(() => {
      const svg = document.querySelector('[data-vp-track]');
      const attr = document.querySelector('[data-vp-attr]');
      const single = document.querySelector('[data-vp-single]');
      const r = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, width: b.width }; };
      return {
        track: r(svg), attr: r(attr), single: r(single),
        domains: [svg.dataset.domainBp, attr.dataset.domainBp],
        rows: svg.dataset.geneRows,
      };
    });
    for (const [name, d] of Object.entries(geo.domains)) {
      if (d !== '0-16384') fail(scope, `panel ${name} declares domain "${d}", expected the full window`);
    }
    // Same element width and offset, so identical bp fractions land on identical screen x.
    for (const [name, box2] of [['attribution', geo.attr], ['single-track', geo.single]]) {
      if (Math.abs(box2.left - geo.track.left) > 1) {
        fail(scope, `${name} panel starts ${Math.abs(box2.left - geo.track.left).toFixed(1)}px from the coverage track`);
      }
      if (Math.abs(box2.width - geo.track.width) > 1) {
        fail(scope, `${name} panel is ${Math.abs(box2.width - geo.track.width).toFixed(1)}px wider/narrower than the coverage track`);
      }
    }

    // Axes must actually be labelled, not merely present.
    const axes = await page.evaluate(() => {
      const svg = document.querySelector('[data-vp-track]');
      const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent.trim());
      return {
        caption: svg.querySelector('.vp-caption')?.textContent ?? '',
        unit: texts.some((t) => /coverage|a\.u\./.test(t)),
        bpTicks: texts.filter((t) => /^\d+(\.\d+)?k$|^0$/.test(t)).length,
        cropped: texts.filter((t) => t === 'cropped').length,
      };
    });
    if (!axes.unit) fail(scope, 'coverage plot has no value-axis unit label');
    if (axes.bpTicks < 5) fail(scope, `coverage plot has ${axes.bpTicks} bp tick labels, expected the full ruler`);
    if (axes.cropped !== 2) fail(scope, `${axes.cropped} cropped-flank markers, expected 2`);
    if (!/1,024–15,360/.test(axes.caption)) fail(scope, `caption does not state the predicted span: "${axes.caption}"`);

    // Gene rows: expanding a window with an overlap must use more rows than collapsing it.
    const expanded = Number(geo.rows);
    await page.uncheck('[data-vp-generows]');
    await page.waitForTimeout(300);
    const collapsed = Number(await page.evaluate(
      () => document.querySelector('[data-vp-track]').dataset.geneRows,
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

    const track = page.locator('[data-vp-track]');
    await track.scrollIntoViewIfNeeded();
    const box = await track.boundingBox();
    if (!box) { fail(scope, 'no coverage track to drag on'); return; }

    const drag = async (from, to) => {
      await page.mouse.move(box.x + box.width * from, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * to, box.y + box.height * 0.5, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      return page.evaluate(`(async () => {
        const c = document.querySelector('[data-vp-attr]');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let ink = 0, sum = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 8) { ink += 1; sum += i * (d[i] + d[i + 1] + d[i + 2]); } }
        return { ink, sig: sum % 2147483647,
                 label: document.querySelector('[data-vp-trace-label]').textContent };
      })()`);
    };

    const a = await drag(0.20, 0.34);
    const b = await drag(0.62, 0.78);
    if (a.ink < 500) fail(scope, `traced region painted only ${a.ink} attribution pixels`);
    if (b.ink < 500) fail(scope, `second traced region painted only ${b.ink} attribution pixels`);
    if (a.sig === b.sig) fail(scope, 'attribution is identical for two different regions — not region-specific');
    if (!/bins \d+–\d+/.test(a.label)) fail(scope, `trace label does not name a bin range: "${a.label}"`);

    // An anchor is the base-resolution half of the same feature.
    const anchors = await page.locator('[data-vp-anchor] option').count();
    if (anchors < 2) fail(scope, `only ${anchors} anchor option(s); expected gene bodies and peaks`);
    const labels = await page.locator('[data-vp-anchor] option').allTextContents();
    await page.selectOption('[data-vp-anchor]', { label: labels.at(-1) });
    await page.waitForTimeout(400);
    const anchor = await page.evaluate(`(async () => {
      const c = document.querySelector('[data-vp-attr]');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let ink = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) ink += 1;
      return { ink, label: document.querySelector('[data-vp-trace-label]').textContent };
    })()`);
    if (anchor.ink < 500) fail(scope, `anchor "${labels.at(-1)}" painted only ${anchor.ink} pixels`);
    // Clearing must actually clear, not leave the last region lit.
    await page.locator('[data-vp-trace-clear]').click();
    await page.waitForTimeout(300);
    const cleared = await page.evaluate(() => document.querySelector('[data-vp-trace-label]').textContent);
    if (/bins \d+/.test(cleared)) fail(scope, `clearing left a trace: "${cleared}"`);
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
          await captureFailure('chromium/coordinates', () => auditCoordinates(browser, baseURL, 'chromium/coordinates'));
          progress('chromium/traceback');
          await captureFailure('chromium/traceback', () => auditTraceback(browser, baseURL, 'chromium/traceback'));
          progress('chromium/annotation (14 loci)');
          await captureFailure('chromium/annotation', () => auditAnnotation(browser, baseURL, 'chromium/annotation'));
          progress('chromium/volume');
          await captureFailure('chromium/volume', () => auditVolume(browser, baseURL, 'chromium/volume'));
          await captureFailure('chromium/volume-still', () => auditVolumeStill(browser, baseURL, 'chromium/volume-still'));
        }
        if (FULL && engineName === 'chromium') {
          progress('chromium/full-model (one real inference, ~20 s)');
          await captureFailure('chromium/full-model', () => auditFullModel(browser, baseURL, 'chromium/full-model'));
          progress('chromium/stale-state (two inferences, ~40 s)');
          await captureFailure('chromium/stale-state', () => auditStaleState(browser, baseURL, 'chromium/stale-state'));
          progress('chromium/no-model (14 loci, model blocked)');
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
