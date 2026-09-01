/**
 * The rendering gate for /shorkie-lab/shorkie/.
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
import { readFileSync } from 'node:fs';
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

    // The sticky bar is now the ONE region control -- `data-vp-anchor` and the clear button were
    // two more ways to write the same state, which is how an interface starts disagreeing with
    // itself. Selecting from the bar must drive the same attribution the drag does.
    const anchors = await page.locator('[data-vp-region] option').count();
    if (anchors < 2) fail(scope, `only ${anchors} region option(s); expected gene bodies and peaks`);
    const labels = await page.locator('[data-vp-region] option').allTextContents();
    await page.selectOption('[data-vp-region]', { label: labels.at(-1) });
    await page.waitForTimeout(500);
    const anchor = await page.evaluate(`(async () => {
      const c = document.querySelector('[data-vp-attr]');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let ink = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) ink += 1;
      return { ink, label: document.querySelector('[data-vp-trace-label]').textContent };
    })()`);
    if (anchor.ink < 500) fail(scope, `region "${labels.at(-1)}" painted only ${anchor.ink} pixels`);

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
      ann: document.querySelector('[data-vp-annotation]')?.dataset.vpAnnotation ?? null,
      annStat: document.querySelector('[data-vp-annstat]')?.textContent ?? '',
      enrich: Number(document.querySelector('[data-vp-enrichment]')?.dataset.vpEnrichment ?? 0),
      ko: Number(document.querySelector('[data-vp-ko]')?.dataset.vpKo ?? 0),
      koStat: document.querySelector('[data-vp-ko-stat]')?.textContent ?? '',
      logoRows: Number(document.querySelector('[data-vp-method-logos]')?.dataset.rows ?? 0),
      // The one window every letter view must agree on.
      windows: [...document.querySelectorAll('[data-vp-method-logos],[data-vp-ism-logo],[data-vp-lens]')]
        .map((e) => e.dataset.window ?? null),
      ismOption: !!document.querySelector('[data-vp-logo-source] option[value="ism"]'),
      ismDefault: document.querySelector('[data-vp-logo-source]')?.value ?? '',
    }));
    if (!bio.ann) fail(scope, 'the annotation track drew nothing');
    else {
      const lanes = Object.fromEntries(bio.ann.split(',').map((p) => p.split(':')));
      if (!(Number(lanes.gene) > 0)) fail(scope, `annotation drew no gene features (${bio.ann})`);
      if (!(Number(lanes.tfbs) > 0)) fail(scope, `annotation drew no binding sites (${bio.ann})`);
    }
    // The unfiltered PWM count is the argument for the threshold and must be on the control.
    if (!/of [\d,]+ scanned/.test(bio.annStat)) {
      fail(scope, `the annotation status does not state what the PWM scan discarded: "${bio.annStat}"`);
    }
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
    if (!bio.ismOption) fail(scope, 'the mutagenesis logo source is missing from the dropdown');
    if (bio.ismDefault !== 'ism') fail(scope, `logo source defaults to "${bio.ismDefault}", expected ism`);

    // The brush must move every logo view together.
    const before = uniq[0];
    const strip = await page.$('[data-vp-methods]');
    if (strip) {
      await strip.scrollIntoViewIfNeeded();
      const box = await strip.boundingBox();
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.42, box.y + box.height / 2, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      const after = await page.evaluate(() =>
        [...document.querySelectorAll('[data-vp-method-logos],[data-vp-ism-logo],[data-vp-lens]')]
          .map((e) => e.dataset.window ?? null));
      const afterUniq = [...new Set(after.filter(Boolean))];
      if (afterUniq.length !== 1) fail(scope, `after brushing, logo views disagree: ${afterUniq.join(' vs ')}`);
      else if (afterUniq[0] === before) fail(scope, 'brushing the method strip did not move the logo window');
    }

    // --- the five acts, the focus band, and the cross-locus summary -----------------------
    const spine = await page.evaluate(() => {
      const focus = [...document.querySelectorAll(
        '[data-vp-track],[data-vp-attr],[data-vp-methods],[data-vp-annotation]')]
        .map((e) => e.dataset.vpFocus ?? null);
      return {
        acts: [...document.querySelectorAll('.vp-act')].map((e) => e.textContent.trim()),
        focus,
        findings: Number(document.querySelector('[data-vp-findings]')?.dataset.vpFindings ?? 0),
        classFig: Number(document.querySelector('[data-vp-class-figure]')?.dataset.vpClassFigure ?? 0),
        tss: Number(document.querySelector('[data-vp-tss]')?.dataset.vpTss ?? 0),
        navSticky: getComputedStyle(document.querySelector('.vp-nav')).position,
      };
    });
    if (spine.acts.length !== 4) fail(scope, `${spine.acts.length} act headings, expected 4`);
    if (new Set(spine.acts).size !== spine.acts.length) fail(scope, 'a duplicate act heading');
    if (spine.navSticky !== 'sticky') fail(scope, `the selection bar is ${spine.navSticky}, not sticky`);
    // Every full-window track must carry the focus band, and they must agree about it -- the whole
    // point of the shared axis is that the eye can follow one band down the column.
    if (spine.focus.some((f) => !f)) {
      fail(scope, `a full-window track has no focus band: ${JSON.stringify(spine.focus)}`);
    } else if (new Set(spine.focus).size !== 1) {
      fail(scope, `tracks disagree about the focus band: ${[...new Set(spine.focus)].join(' vs ')}`);
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

    // --- the merged logo draws for every source it offers ----------------------------------
    await page.locator('[data-vp-region-next]').scrollIntoViewIfNeeded();
    await page.locator('[data-vp-region-next]').click();
    await page.waitForTimeout(600);
    const sources = await page.locator('[data-vp-logo-source] option').evaluateAll(
      (os) => os.map((o) => o.value),
    );
    // Four: mutagenesis rejoined as the primary source once it covered all 16,384 bp rather than
    // the ~500 bp promoter window that had it sitting blank across 97% of the axis.
    if (sources.length !== 4) fail(scope, `logo offers ${sources.length} sources, expected 4`);
    if (!sources.includes('ism')) fail(scope, 'the mutagenesis source is missing');
    if (sources[0] !== 'ism') fail(scope, `mutagenesis should lead the source list; got "${sources[0]}"`);
    const seen = new Set();
    for (const src of sources) {
      await page.selectOption('[data-vp-logo-source]', src);
      await page.waitForTimeout(300);
      const s = await page.evaluate(() => {
        const e = document.querySelector('[data-vp-ism-logo]');
        return { letters: Number(e?.dataset.letters ?? '0'), stat: e?.dataset.window ?? '' };
      });
      if (!(s.letters > 20)) fail(scope, `logo source "${src}" drew ${s.letters} letters`);
      seen.add(src);
    }
    // The annotated whole-window logo came over from the archived panel and must still be here.
    const panel = await page.evaluate(() => ({
      letters: Number(document.querySelector('[data-vp-ism-logo]')?.dataset.letters ?? '0'),
      boxes: Number(document.querySelector('[data-vp-ism-logo]')?.dataset.boxes ?? '0'),
    }));
    if (!(panel.letters > 100)) fail(scope, `the annotated logo drew ${panel.letters} letters`);
    if (!(panel.boxes > 0)) fail(scope, 'the annotated logo lost its motif and splice boxes in the merge');

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

    // --- the method strip ----------------------------------------------------------------
    const methods = await page.evaluate(() => {
      const c = document.querySelector('[data-vp-methods]');
      return { n: Number(c?.dataset.tracks ?? '0'), labels: c?.dataset.labels ?? '' };
    });
    if (methods.n < 5) fail(scope, `method strip drew ${methods.n} tracks, expected at least 5`);
    // Mutagenesis LEADS the strip now. It was excluded while it covered 500 bp of 16,384 and while
    // the full window was priced at 39.6 h; it is now full-window and measured, so its presence --
    // and its position -- are the decision being asserted.
    for (const want of ['mutagenesis', 'gradient', 'integrated', 'rollout', 'occlusion']) {
      if (!methods.labels.toLowerCase().includes(want)) {
        fail(scope, `method strip is missing "${want}"; got ${methods.labels}`);
      }
    }
    if (!/^mutagenesis/i.test(methods.labels)) {
      fail(scope, `mutagenesis should lead the method strip; got "${methods.labels}"`);
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
      () => document.querySelector('[data-vp-ism-logo]')?.dataset.letters !== undefined,
      { timeout: 60_000 },
    ).catch(() => {});
    // Then jump to the window the figure actually publishes -- the logo now follows the traced
    // region, which for most regions is nowhere near it.
    await page.locator('[data-vp-logo-figure]').click();
    await page.waitForTimeout(600);

    const logo = await page.evaluate(() => {
      const s = document.querySelector('[data-vp-ism-logo]');
      const paths = [...(s?.querySelectorAll('path.vp-glyph') ?? [])];
      const boxes = [...(s?.querySelectorAll('rect[stroke]') ?? [])];
      const ism = s?.dataset.window ?? '0-0';
      const [wa, wb] = ism.split('-').map(Number);
      return {
        letters: Number(s?.dataset.letters ?? '0'),
        windowBp: wb - wa,
        boxCount: Number(s?.dataset.boxes ?? '0'),
        fills: [...new Set(paths.map((p) => p.getAttribute('fill')))].sort(),
        // A logo glyph must be scaled, never re-typeset: x and y scales differ, and negatives flip.
        transforms: paths.slice(0, 400).map((p) => p.getAttribute('transform') ?? ''),
        labels: [...(s?.querySelectorAll('text') ?? [])].map((x) => x.textContent ?? ''),
      };
    });
    // The logo is PROJECTED on the reference, so it must draw about one letter per position --
    // not four. Fewer means the projection or the visibility floor is wrong; more means it is
    // drawing all four bases and has stopped matching the figure.
    if (logo.letters > logo.windowBp) {
      fail(scope, `ISM logo drew ${logo.letters} letters over ${logo.windowBp} bp — a projected logo has one per position`);
    }
    if (logo.letters < logo.windowBp * 0.8) {
      fail(scope, `ISM logo drew ${logo.letters} letters over ${logo.windowBp} bp — too few`);
    }
    const want = ['#0000FF', '#008000', '#FF0000', '#FFA500'];
    for (const c of want) {
      if (!logo.fills.includes(c)) fail(scope, `logo is missing the paper's ${c}; got ${logo.fills.join()}`);
    }
    for (const c of logo.fills) {
      if (!want.includes(c)) fail(scope, `logo drew a colour the paper does not use: ${c}`);
    }
    const scales = logo.transforms
      .map((s) => /scale\(([-\d.]+) ([-\d.]+)\)/.exec(s))
      .filter(Boolean)
      .map((m) => [Number(m[1]), Number(m[2])]);
    if (scales.length < 100) fail(scope, 'logo glyphs are not scaled by transform');
    if (scales.some(([sx]) => sx <= 0)) fail(scope, 'a glyph has a non-positive x scale');
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
      letters: Number(document.querySelector('[data-vp-ism-logo]')?.dataset.letters ?? '0'),
      logoWindow: document.querySelector('[data-vp-ism-logo]')?.dataset.window ?? '',
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
    if (!(a.letters > 20)) fail(scope, `sequence logo drew ${a.letters} letters`);
    if (!a.inside) fail(scope, 'attention rollout produced no value');
    if (a.region === b.region) fail(scope, 'the region stepper did not advance');
    if (a.inside === b.inside) fail(scope, 'attention rollout is identical for two regions');
    if (a.logoWindow === b.logoWindow) {
      fail(scope, `sequence logo stayed at ${a.logoWindow} across two regions — it does not follow the selection`);
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
const LAB_ROUTES = ['/shorkie-lab/', '/shorkie-lab/shorkie/', LM_ROUTE];

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

/**
 * The same base must land at the same x on every full-window track.
 *
 * The existing focus-band check compares each track's `data-vp-focus` STRING, which only says they
 * intend to show the same range. It passed for a whole round while the drawing was misaligned: the
 * SVG tracks used a 1000-unit viewBox, so `PLOT.left = 46` meant 4.6% of the width, while the
 * canvases used the same constant as 46 CSS pixels. Offsets ran +20 px at 1440 and -31 px at 320,
 * with the SIGN FLIPPING at ~1043 -- which is why that width is measured here deliberately: a
 * regression that reintroduces the bug would be invisible at exactly one width.
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
      const r = await page.evaluate(() => {
        const BP = 8192, SEQ = 16384, PLOT = { left: 46, right: 10 };
        const out = {};
        for (const sel of ['[data-vp-track]', '[data-vp-attr]', '[data-vp-methods]',
                           '[data-vp-annotation]']) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const box = el.getBoundingClientRect();
          if (!box.width) continue;
          let left;
          let inner;
          if (el.tagName.toLowerCase() === 'svg') {
            const vb = el.getAttribute('viewBox').split(' ').map(Number);
            const s = box.width / vb[2];
            left = PLOT.left * s;
            inner = (vb[2] - PLOT.left - PLOT.right) * s;
          } else {
            left = PLOT.left;
            inner = box.width - PLOT.left - PLOT.right;
          }
          out[sel] = box.left + left + (BP / SEQ) * inner;
        }
        return out;
      });
      const vals = Object.values(r);
      if (vals.length < 3) {
        fail(scope, `${width}px: only ${vals.length} full-window tracks measured`);
        continue;
      }
      const spread = Math.max(...vals) - Math.min(...vals);
      if (spread > 1) {
        const detail = Object.entries(r)
          .map(([k, v]) => `${k}=${v.toFixed(1)}`).join(' ');
        fail(scope, `${width}px: bp 8,192 lands ${spread.toFixed(1)}px apart across tracks — ${detail}`);
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
          progress(`chromium/annotation (${N_LOCI} loci)`);
          await captureFailure('chromium/annotation', () => auditAnnotation(browser, baseURL, 'chromium/annotation'));
          progress('chromium/explanations');
          await captureFailure('chromium/explanations', () => auditExplanations(browser, baseURL, 'chromium/explanations'));
          progress('chromium/language-model');
          await captureFailure('chromium/language-model', () => auditLanguageModel(browser, baseURL, 'chromium/language-model'));
          progress('chromium/axis-alignment (5 widths)');
          await captureFailure('chromium/axis-alignment', () => auditAxisAlignment(browser, baseURL, 'chromium/axis-alignment'));
          progress('chromium/lab-prose (all three routes)');
          await captureFailure('chromium/lab-prose', () => auditSwallowedSpaces(browser, baseURL, 'chromium/lab-prose'));
          progress('chromium/region-views');
          await captureFailure('chromium/region-views', () => auditRegionViews(browser, baseURL, 'chromium/region-views'));
          progress('chromium/paper-fidelity');
          await captureFailure('chromium/paper-fidelity', () => auditPaperFidelity(browser, baseURL, 'chromium/paper-fidelity'));
          progress('chromium/interpretation');
          await captureFailure('chromium/interpretation', () => auditInterpretation(browser, baseURL, 'chromium/interpretation'));
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
