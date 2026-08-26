/**
 * DOM controllers for the deep-dive curriculum's interactive figures.
 *
 * Three-layer split, the same one the games and the terminal use:
 *
 *   1. `src/lib/deepDiveMath.ts` — the mathematics, pure and unit-tested. **Every number
 *      a widget shows comes from there**, which is what stops a slider disagreeing with
 *      the prose beside it.
 *   2. This file — DOM and SVG only. No formulas of its own beyond plotting arithmetic.
 *   3. `src/components/deepdive/Widget.astro` — the markup shell.
 *
 * Two house rules it must not break. **Nothing here writes raw markup**: every node is
 * `createElementNS` + `textContent`, and `audit-security.mjs` fails the build on the bare
 * token of either raw-markup sink anyway — in a comment as readily as in code, which is
 * why this one is phrased around it. And **every colour goes through `currentColor` or a `--color-*` token**,
 * because a figure authored in one theme and never looked at in the other is the standard
 * way these go wrong.
 */

import {
  effectiveIndependentCells,
  clusteredFalsePositiveRate,
  designEffect,
  markerEvidenceMultiple,
  markerContrastCeiling,
  markerContrast,
  markerEnrichment,
  expectedMarkerCounts,
  ambientExpectedCounts,
  soupShare,
  trustworthiness,
  adjustedRandIndex,
  graphModularity,
  relativeContrast,
  neighborPurity,
  knnGraph,
  seededNormals,
  transformSd,
  transformMean,
  poissonZeroProbability,
  poissonPmf,
  nbZeroProbability,
  nbVariance,
  negBinomialPmf,
  breedersResponseFromIntensity,
  credibleSet,
  csPurity,
  driftVariance,
  expectedR2,
  expectedTmrca,
  haldaneMorgans,
  heterozygosityDecay,
  ldHalfLife,
  ncp,
  normalPdf,
  normalQuantile,
  pipsFromAbf,
  powerFromNcp,
  sampleSizeForPower,
  selectionIntensity,
  shrinkageFactor,
  varianceExplained,
  wakefieldAbf,
  type Matrix,
} from '../lib/deepDiveMath';
import {
  biasVarianceToy,
  binaryMetricsAtThreshold,
  quadraticDescent,
  softmaxWithTemperature,
  type BinaryScore,
} from '../lib/mlInterviewMath';
import type { DeepDiveWidgetKind } from '../lib/deepDiveWidgetKinds';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 660;
const H = 320;
const PAD = { top: 22, right: 22, bottom: 46, left: 62 };
const PLOT = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

const ACCENT = 'var(--color-accent, #2e6e5e)';

// ── SVG helpers ───────────────────────────────────────────────────────────────

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function label(x: number, y: number, s: string, attrs: Record<string, string | number> = {}) {
  const t = el('text', { x, y, 'font-size': 11, fill: 'currentColor', ...attrs });
  t.textContent = s;
  return t;
}

/** A value-to-pixel map, plus the tick positions to draw for it. */
interface Scale {
  (v: number): number;
  ticks: number[];
  format: (v: number) => string;
}

function linear(
  d0: number,
  d1: number,
  r0: number,
  r1: number,
  ticks: number[],
  format = fmt
): Scale {
  const f = ((v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)) as Scale;
  f.ticks = ticks;
  f.format = format;
  return f;
}

function logarithmic(
  d0: number,
  d1: number,
  r0: number,
  r1: number,
  ticks: number[],
  format = fmt
): Scale {
  const l0 = Math.log10(d0);
  const l1 = Math.log10(d1);
  const f = ((v: number) => r0 + ((Math.log10(v) - l0) / (l1 - l0)) * (r1 - r0)) as Scale;
  f.ticks = ticks;
  f.format = format;
  return f;
}

/** Compact number formatting: enough digits to see a change, never more. */
function fmt(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toPrecision(3).replace(/\.?0+$/, '')}M`;
  if (a >= 1e3) return `${(v / 1e3).toPrecision(3).replace(/\.?0+$/, '')}k`;
  if (a >= 10) return v.toFixed(0);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.01) return v.toFixed(3);
  return v.toExponential(1);
}

const whole = (v: number): string => v.toLocaleString('en-US', { maximumFractionDigits: 0 });

/** Always scientific, so a log axis does not mix "1000" with "1.0×10⁴". */
const power10 = (v: number): string => `10${superscript(Math.round(Math.log10(v)))}`;

const sci = (v: number, digits = 2): string => {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e <= 3) return v.toFixed(Math.max(0, digits - 1 - e));
  return `${(v / 10 ** e).toFixed(digits)}×10${superscript(e)}`;
};

function superscript(n: number): string {
  const map: Record<string, string> = {
    '-': '⁻',
    0: '⁰',
    1: '¹',
    2: '²',
    3: '³',
    4: '⁴',
    5: '⁵',
    6: '⁶',
    7: '⁷',
    8: '⁸',
    9: '⁹',
  };
  return String(n)
    .split('')
    .map((c) => map[c] ?? c)
    .join('');
}

/** The frame: axes, gridlines, ticks and both axis titles. Returns the empty plot group. */
function frame(
  x: Scale,
  y: Scale,
  xTitle: string,
  yTitle: string,
  root: SVGSVGElement
): SVGGElement {
  const g = el('g');

  for (const t of y.ticks) {
    const py = y(t);
    g.appendChild(
      el('line', {
        x1: PAD.left,
        y1: py,
        x2: PAD.left + PLOT.w,
        y2: py,
        stroke: 'currentColor',
        'stroke-width': 1,
        opacity: 0.12,
      })
    );
    g.appendChild(
      label(PAD.left - 8, py + 4, y.format(t), { 'text-anchor': 'end', opacity: 0.75 })
    );
  }
  for (const t of x.ticks) {
    const px = x(t);
    g.appendChild(
      el('line', {
        x1: px,
        y1: PAD.top + PLOT.h,
        x2: px,
        y2: PAD.top + PLOT.h + 5,
        stroke: 'currentColor',
      })
    );
    g.appendChild(
      label(px, PAD.top + PLOT.h + 19, x.format(t), { 'text-anchor': 'middle', opacity: 0.75 })
    );
  }

  g.appendChild(
    el('line', {
      x1: PAD.left,
      y1: PAD.top,
      x2: PAD.left,
      y2: PAD.top + PLOT.h,
      stroke: 'currentColor',
      'stroke-width': 1.25,
    })
  );
  g.appendChild(
    el('line', {
      x1: PAD.left,
      y1: PAD.top + PLOT.h,
      x2: PAD.left + PLOT.w,
      y2: PAD.top + PLOT.h,
      stroke: 'currentColor',
      'stroke-width': 1.25,
    })
  );

  g.appendChild(
    label(PAD.left + PLOT.w / 2, H - 8, xTitle, { 'text-anchor': 'middle', 'font-size': 12 })
  );
  g.appendChild(
    label(16, PAD.top + PLOT.h / 2, yTitle, {
      'text-anchor': 'middle',
      'font-size': 12,
      transform: `rotate(-90 16 ${PAD.top + PLOT.h / 2})`,
    })
  );

  root.appendChild(g);
  return g;
}

function curve(points: [number, number][], attrs: Record<string, string | number> = {}) {
  const d = points
    .map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`)
    .join(' ');
  return el('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, ...attrs });
}

function newSvg(): SVGSVGElement {
  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    width: W,
    height: H,
    'font-family': 'inherit',
    role: 'presentation',
  });
  return svg;
}

// ── Controls ──────────────────────────────────────────────────────────────────

interface ControlSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Render the current value beside the label. */
  format: (v: number) => string;
  /** Map the slider position to the modelled quantity (for log-scaled controls). */
  scale?: (v: number) => number;
}

interface Controls {
  /** The modelled value of one control, after `scale`. */
  get: (key: string) => number;
  /** The raw slider position, for controls that need it. */
  raw: (key: string) => number;
}

function buildControls(host: HTMLElement, specs: ControlSpec[], onChange: () => void): Controls {
  const inputs = new Map<string, HTMLInputElement>();
  const scales = new Map<string, (v: number) => number>();
  host.replaceChildren();

  for (const spec of specs) {
    const wrap = document.createElement('div');
    wrap.className = 'dd-widget__control';

    const lab = document.createElement('label');
    lab.className = 'dd-widget__label';
    const name = document.createElement('span');
    name.textContent = spec.label;
    const value = document.createElement('span');
    value.className = 'dd-widget__value';
    lab.append(name, value);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(spec.value);
    lab.htmlFor = `dd-${spec.key}-${Math.abs(hash(host.baseURI + spec.key))}`;
    input.id = lab.htmlFor;

    const paint = () => {
      const raw = Number(input.value);
      value.textContent = spec.format(spec.scale ? spec.scale(raw) : raw);
    };
    input.addEventListener('input', () => {
      paint();
      onChange();
    });
    paint();

    wrap.append(lab, input);
    host.appendChild(wrap);
    inputs.set(spec.key, input);
    if (spec.scale) scales.set(spec.key, spec.scale);
  }

  const raw = (key: string) => Number(inputs.get(key)!.value);
  return { raw, get: (key) => (scales.get(key) ?? ((v: number) => v))(raw(key)) };
}

/** Stable per-page id suffix so two widgets never share a label's `for`. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

/** Build the readout line from name/value pairs, as text nodes rather than a markup string. */
function readout(host: HTMLElement, pairs: [string, string][]) {
  host.replaceChildren();
  pairs.forEach(([name, value], i) => {
    if (i) host.appendChild(document.createTextNode(' · '));
    host.appendChild(document.createTextNode(`${name} `));
    const strong = document.createElement('strong');
    strong.textContent = value;
    host.appendChild(strong);
  });
}

// ── A seeded generator, for the one widget that samples ───────────────────────

/** mulberry32 — small, fast and fully deterministic, so the same seed redraws the same run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A binomial draw. Inversion from zero while np is small — exact, and the usual case for
 * a drifting allele near an absorbing boundary — and the normal approximation with a
 * continuity correction above it, where inversion would be slow and the approximation is
 * good to well under one count.
 */
function binomial(n: number, p: number, u: () => number): number {
  if (p <= 0) return 0;
  if (p >= 1) return n;
  if (n * Math.min(p, 1 - p) < 30) {
    const flip = p > 0.5;
    const q = flip ? 1 - p : p;
    let x = 0;
    let cdf = (1 - q) ** n;
    let term = cdf;
    const target = u();
    while (target > cdf && x < n) {
      term *= ((n - x) / (x + 1)) * (q / (1 - q));
      cdf += term;
      x += 1;
    }
    return flip ? n - x : x;
  }
  const mean = n * p;
  const sd = Math.sqrt(n * p * (1 - p));
  // Box–Muller, so the sampler needs no library either.
  const z = Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
  return Math.max(0, Math.min(n, Math.round(mean + sd * z)));
}

// ── The widgets ───────────────────────────────────────────────────────────────

type Renderer = (canvas: HTMLElement, controlHost: HTMLElement, readoutHost: HTMLElement) => void;

/** Linkage disequilibrium: how fast recombination erases it, and what that dates. */
const ldDecay: Renderer = (canvas, controlHost, readoutHost) => {
  const draw = () => {
    const theta = c.get('theta');
    const t = c.get('t');

    const x = linear(
      0,
      3000,
      PAD.left,
      PAD.left + PLOT.w,
      [0, 500, 1000, 1500, 2000, 2500, 3000],
      (v) => v.toLocaleString('en-US')
    );
    const y = linear(0, 1, PAD.top + PLOT.h, PAD.top, [0, 0.25, 0.5, 0.75, 1], (v) => v.toFixed(2));
    const svg = newSvg();
    const g = frame(x, y, 'Generations since the haplotype arose', 'Dₜ / D₀', svg);

    const points: [number, number][] = [];
    for (let gen = 0; gen <= 3000; gen += 10) points.push([x(gen), y((1 - theta) ** gen)]);
    g.appendChild(curve(points));

    const half = ldHalfLife(theta);
    if (half <= 3000) {
      g.appendChild(
        el('line', {
          x1: x(half),
          y1: y(0.5),
          x2: x(half),
          y2: PAD.top + PLOT.h,
          stroke: ACCENT,
          'stroke-width': 1.25,
          'stroke-dasharray': '5 4',
        })
      );
      g.appendChild(
        el('line', {
          x1: PAD.left,
          y1: y(0.5),
          x2: x(half),
          y2: y(0.5),
          stroke: ACCENT,
          'stroke-width': 1.25,
          'stroke-dasharray': '5 4',
        })
      );
      g.appendChild(
        label(x(half) + 6, y(0.5) - 8, `half-life ${half.toFixed(0)} gen`, {
          fill: ACCENT,
          'font-size': 11,
          'font-weight': 600,
        })
      );
    }

    const remaining = (1 - theta) ** t;
    g.appendChild(el('circle', { cx: x(Math.min(t, 3000)), cy: y(remaining), r: 5, fill: ACCENT }));

    canvas.replaceChildren(svg);
    readout(readoutHost, [
      ['θ', sci(theta, 2)],
      ['map distance', `${(haldaneMorgans(theta) * 100).toFixed(3)} cM`],
      ['half-life', `${Number(half.toFixed(0)).toLocaleString('en-US')} generations`],
      [
        `D remaining after ${t.toLocaleString('en-US')} generations`,
        `${(remaining * 100).toFixed(1)}%`,
      ],
      ['which is roughly', `${(Math.round((t * 29) / 100) * 100).toLocaleString('en-US')} years`],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'theta',
        label: 'Recombination fraction θ',
        min: -5,
        max: -0.7,
        step: 0.02,
        value: -3,
        scale: (v) => 10 ** v,
        format: (v) => sci(v, 2),
      },
      {
        key: 't',
        label: 'Generations',
        min: 0,
        max: 3000,
        step: 10,
        value: 700,
        format: (v) => v.toLocaleString('en-US'),
      },
    ],
    draw
  );
  draw();
};

/** Genetic drift: heterozygosity decay, and the trajectories that produce it. */
const drift: Renderer = (canvas, controlHost, readoutHost) => {
  const draw = () => {
    const ne = Math.round(c.get('ne'));
    const gens = Math.round(c.get('gens'));
    const p0 = c.get('p0');

    const x = linear(
      0,
      gens,
      PAD.left,
      PAD.left + PLOT.w,
      [0, gens / 4, gens / 2, (3 * gens) / 4, gens].map((v) => Math.round(v)),
      whole
    );
    const y = linear(0, 1, PAD.top + PLOT.h, PAD.top, [0, 0.25, 0.5, 0.75, 1], (v) => v.toFixed(2));
    const svg = newSvg();
    const g = frame(x, y, 'Generations', 'Allele frequency', svg);

    // Eight replicate populations from one fixed seed, so the picture is reproducible
    // and the reader can be told exactly what they are looking at.
    let fixed = 0;
    let lost = 0;
    for (let r = 0; r < 8; r += 1) {
      const u = rng(20260821 + r * 7919);
      let p = p0;
      const pts: [number, number][] = [[x(0), y(p)]];
      for (let t = 1; t <= gens; t += 1) {
        p = binomial(2 * ne, p, u) / (2 * ne);
        pts.push([x(t), y(p)]);
      }
      if (p >= 1) fixed += 1;
      if (p <= 0) lost += 1;
      g.appendChild(curve(pts, { 'stroke-width': 1.25, opacity: 0.55 }));
    }

    // The deterministic statement drift makes, on the axis the trajectories are drawn on:
    // E[p_t] = p₀ always, and the spread around it widens as √Var(p_t). Plotting expected
    // heterozygosity here instead would put a different quantity on the frequency axis —
    // 2pq and p share the interval [0,1] and mean nothing like the same thing.
    const step = Math.max(1, Math.round(gens / 200));
    const upper: [number, number][] = [];
    const lower: [number, number][] = [];
    for (let t = 0; t <= gens; t += step) {
      const sd = Math.sqrt(driftVariance(p0, ne, t));
      upper.push([x(t), y(Math.min(1, p0 + sd))]);
      lower.push([x(t), y(Math.max(0, p0 - sd))]);
    }
    for (const band of [upper, lower]) {
      g.appendChild(curve(band, { stroke: ACCENT, 'stroke-width': 2, 'stroke-dasharray': '7 4' }));
    }
    g.appendChild(
      el('line', {
        x1: PAD.left,
        y1: y(p0),
        x2: PAD.left + PLOT.w,
        y2: y(p0),
        stroke: ACCENT,
        'stroke-width': 1.25,
        opacity: 0.55,
      })
    );
    g.appendChild(
      // Top-left rather than on the line itself: at t = 0 every trajectory is still at
      // p₀, so the line's own neighbourhood is the busiest part of the plot.
      label(PAD.left + 8, PAD.top + 14, 'E[p] = p₀, with its ±1 SD band', {
        fill: ACCENT,
        'font-size': 11,
        'font-weight': 600,
        // Eight trajectories cross this label, so it needs to be lifted off them. A stroke
        // in the page background painted underneath the glyphs is the only halo that stays
        // correct in both themes — a literal colour would be right in one and wrong in the
        // other. It has to go through `style`: var() does not resolve inside an SVG
        // presentation attribute, only inside a CSS declaration.
        style:
          'paint-order:stroke;stroke:var(--color-bg,#fff);stroke-width:3.5px;stroke-linejoin:round',
      })
    );

    canvas.replaceChildren(svg);
    const h0 = 2 * p0 * (1 - p0);
    const hEnd = heterozygosityDecay(h0, ne, gens);
    readout(readoutHost, [
      ['Nₑ', ne.toLocaleString('en-US')],
      ['heterozygosity retained', `${((hEnd / h0) * 100).toFixed(1)}%`],
      ['half-life', `${whole(Math.log(0.5) / Math.log(1 - 1 / (2 * ne)))} generations`],
      ['SD of p by then', Math.sqrt(driftVariance(p0, ne, gens)).toFixed(3)],
      [
        'expected TMRCA',
        `${Math.round(expectedTmrca(1e9, ne)).toLocaleString('en-US')} generations`,
      ],
      ['of 8 runs', `${fixed} fixed, ${lost} lost`],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'ne',
        label: 'Effective population size Nₑ',
        min: 1,
        max: 3.7,
        step: 0.05,
        value: 2,
        scale: (v) => 10 ** v,
        format: (v) => Math.round(v).toLocaleString('en-US'),
      },
      {
        key: 'gens',
        label: 'Generations',
        min: 20,
        max: 600,
        step: 10,
        value: 200,
        format: (v) => String(v),
      },
      {
        key: 'p0',
        label: 'Starting frequency',
        min: 0.02,
        max: 0.98,
        step: 0.02,
        value: 0.5,
        format: (v) => v.toFixed(2),
      },
    ],
    draw
  );
  draw();
};

/** Association power: what sample size a given effect actually needs. */
const power: Renderer = (canvas, controlHost, readoutHost) => {
  const draw = () => {
    const maf = c.get('maf');
    const beta = c.get('beta');
    const n = c.get('n');
    const q2 = varianceExplained(maf, beta);

    const x = logarithmic(
      1e3,
      1e7,
      PAD.left,
      PAD.left + PLOT.w,
      [1e3, 1e4, 1e5, 1e6, 1e7],
      power10
    );
    const y = linear(0, 1, PAD.top + PLOT.h, PAD.top, [0, 0.2, 0.4, 0.6, 0.8, 1], (v) =>
      v.toFixed(1)
    );
    const svg = newSvg();
    const g = frame(x, y, 'Discovery sample size N (log scale)', 'Power at 5×10⁻⁸', svg);

    g.appendChild(
      el('line', {
        x1: PAD.left,
        y1: y(0.8),
        x2: PAD.left + PLOT.w,
        y2: y(0.8),
        stroke: 'currentColor',
        'stroke-width': 1,
        opacity: 0.35,
        'stroke-dasharray': '4 4',
      })
    );
    g.appendChild(
      label(PAD.left + PLOT.w - 4, y(0.8) - 6, '80%', { 'text-anchor': 'end', opacity: 0.7 })
    );

    const pts: [number, number][] = [];
    for (let l = 3; l <= 7; l += 0.02) {
      const nn = 10 ** l;
      pts.push([x(nn), y(powerFromNcp(ncp(nn, q2)))]);
    }
    g.appendChild(curve(pts));

    const p = powerFromNcp(ncp(n, q2));
    g.appendChild(el('circle', { cx: x(n), cy: y(p), r: 5, fill: ACCENT }));

    const need = sampleSizeForPower(q2, 0.8);
    if (need >= 1e3 && need <= 1e7) {
      g.appendChild(
        el('line', {
          x1: x(need),
          y1: y(0.8),
          x2: x(need),
          y2: PAD.top + PLOT.h,
          stroke: ACCENT,
          'stroke-width': 1.25,
          'stroke-dasharray': '5 4',
        })
      );
      g.appendChild(
        label(x(need) + 6, PAD.top + PLOT.h - 8, `${sci(need, 2)} for 80%`, {
          fill: ACCENT,
          'font-size': 11,
          'font-weight': 600,
        })
      );
    }

    canvas.replaceChildren(svg);
    readout(readoutHost, [
      ['q² (variance explained)', sci(q2, 2)],
      ['NCP λ', ncp(n, q2).toFixed(2)],
      [`power at N = ${sci(n, 2)}`, `${(p * 100).toFixed(1)}%`],
      ['N for 80% power', sci(need, 3)],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'maf',
        label: 'Minor allele frequency',
        min: 0.005,
        max: 0.5,
        step: 0.005,
        value: 0.25,
        format: (v) => v.toFixed(3),
      },
      {
        key: 'beta',
        label: 'Effect β (phenotype SD per allele)',
        min: 0.005,
        max: 0.4,
        step: 0.005,
        value: 0.03,
        format: (v) => v.toFixed(3),
      },
      {
        key: 'n',
        label: 'Sample size N',
        min: 3,
        max: 7,
        step: 0.02,
        value: 5,
        scale: (v) => 10 ** v,
        format: (v) => sci(v, 2),
      },
    ],
    draw
  );
  draw();
};

/**
 * Response to truncation selection: why R is smaller than S, drawn rather than asserted.
 *
 * A cumulative-response line would be a straight line and would teach nothing. The two
 * distributions do teach it: the shaded tail is who gets to breed, S is how far their
 * mean sits above the population's, and R — the offspring shift — is only h² of that,
 * because only the additive part of a parent's superiority is transmitted.
 */
const selection: Renderer = (canvas, controlHost, readoutHost) => {
  const draw = () => {
    const h2 = c.get('h2');
    const prop = c.get('prop');
    const i = selectionIntensity(prop);
    const cut = normalQuantile(1 - prop);
    const shift = h2 * i; // R in phenotypic SD units

    const x = linear(-3.5, 4.5, PAD.left, PAD.left + PLOT.w, [-3, -2, -1, 0, 1, 2, 3, 4], whole);
    const peak = normalPdf(0);
    const y = linear(0, peak * 1.28, PAD.top + PLOT.h, PAD.top, [], () => '');
    const svg = newSvg();
    const g = frame(x, y, 'Phenotype (population SD from the mean)', 'Density', svg);

    const density = (mu: number): [number, number][] => {
      const pts: [number, number][] = [];
      for (let v = -3.5; v <= 4.5001; v += 0.02) pts.push([x(v), y(normalPdf(v - mu))]);
      return pts;
    };

    // Who breeds: the tail above the truncation point.
    const tail: string[] = [`M${x(cut).toFixed(1)},${(PAD.top + PLOT.h).toFixed(1)}`];
    for (let v = cut; v <= 4.5001; v += 0.02)
      tail.push(`L${x(v).toFixed(1)},${y(normalPdf(v)).toFixed(1)}`);
    tail.push(`L${x(4.5).toFixed(1)},${(PAD.top + PLOT.h).toFixed(1)}Z`);
    g.appendChild(el('path', { d: tail.join(' '), fill: ACCENT, opacity: 0.22, stroke: 'none' }));

    g.appendChild(curve(density(0), { 'stroke-width': 2 }));
    g.appendChild(
      curve(density(shift), { stroke: ACCENT, 'stroke-width': 2, 'stroke-dasharray': '7 4' })
    );

    // Label heights are staggered so the four rules' texts cannot stack, and every one
    // carries a background halo because no fixed height clears both densities at every
    // setting of the dials.
    const rule = (v: number, text: string, colour: string, dy: number, anchor = 'start') => {
      g.appendChild(
        el('line', {
          x1: x(v),
          y1: PAD.top + 6,
          x2: x(v),
          y2: PAD.top + PLOT.h,
          stroke: colour,
          'stroke-width': 1.25,
          'stroke-dasharray': '3 3',
          opacity: 0.8,
        })
      );
      g.appendChild(
        label(x(v) + (anchor === 'end' ? -5 : 5), PAD.top + dy, text, {
          fill: colour,
          'font-size': 11,
          'font-weight': 600,
          'text-anchor': anchor,
          // Four rules and two densities cross this plot, so no label height misses
          // everything at every setting of the dials. A stroke in the page background
          // painted under the glyphs lifts the text off whatever it lands on, and stays
          // correct in both themes; it has to go through `style` because var() does not
          // resolve inside an SVG presentation attribute.
          style:
            'paint-order:stroke;stroke:var(--color-bg,#fff);stroke-width:3.5px;stroke-linejoin:round',
        })
      );
    };
    rule(0, 'population mean', 'currentColor', PLOT.h - 10, 'end');
    rule(cut, `truncation, top ${(prop * 100).toFixed(0)}%`, 'currentColor', PLOT.h - 26);
    rule(i, `mean of the selected: S = ${i.toFixed(2)} SD`, ACCENT, 16, 'end');
    rule(shift, `offspring mean: R = h²S = ${shift.toFixed(2)} SD`, ACCENT, PLOT.h - 48);

    canvas.replaceChildren(svg);
    readout(readoutHost, [
      ['selected fraction', `top ${(prop * 100).toFixed(0)}%`],
      ['truncation point', `${cut.toFixed(3)} SD`],
      ['intensity i', i.toFixed(4)],
      ['differential S', `${i.toFixed(3)} SD`],
      ['response R', `${shift.toFixed(3)} SD`],
      // Ten generations of the same regime. Linear only because the model holds h² and
      // σ_P fixed, which sustained selection does not.
      ['after 10 generations', `${(10 * breedersResponseFromIntensity(h2, i, 1)).toFixed(2)} SD`],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'h2',
        label: 'Narrow-sense heritability h²',
        min: 0.02,
        max: 0.95,
        step: 0.01,
        value: 0.4,
        format: (v) => v.toFixed(2),
      },
      {
        key: 'prop',
        label: 'Fraction selected',
        min: 0.01,
        max: 0.9,
        step: 0.01,
        value: 0.05,
        format: (v) => `${(v * 100).toFixed(0)}%`,
      },
    ],
    draw
  );
  draw();
};

/** Fine-mapping: what LD does to a credible set, and what the null prior does to a PIP. */
const finemap: Renderer = (canvas, controlHost, readoutHost) => {
  const M = 21;
  const V = 0.0025;
  const PRIOR_W = 0.04;

  const draw = () => {
    const causal = Math.round(c.get('causal'));
    const rho = c.get('rho');
    const zCausal = c.get('z');
    const pi0 = c.get('pi0');

    // A one-dimensional locus: correlation decays geometrically with distance from the
    // causal variant, and a marginal z is the causal z scaled by that correlation.
    const r = Array.from({ length: M }, (_, j) => rho ** Math.abs(j - causal));
    const zs = r.map((rj) => zCausal * rj);
    const abfs = zs.map((z) => wakefieldAbf(z, V, PRIOR_W));
    const priors = new Array<number>(M).fill(1 / M);
    const pips = pipsFromAbf(abfs, priors, pi0);
    const cs = credibleSet(pips, 0.95);
    const ld: Matrix = r.map((_, a) => r.map((__, b) => rho ** Math.abs(a - b)));
    const purity = csPurity(cs.indices, ld);
    const inSet = new Set(cs.indices);

    const x = linear(-0.5, M - 0.5, PAD.left, PAD.left + PLOT.w, [0, 5, 10, 15, 20], whole);
    const y = linear(0, 1, PAD.top + PLOT.h, PAD.top, [0, 0.25, 0.5, 0.75, 1], (v) => v.toFixed(2));
    const svg = newSvg();
    const g = frame(x, y, 'Variant position in the locus', 'Posterior inclusion probability', svg);

    const barW = PLOT.w / M - 4;
    pips.forEach((p, j) => {
      const height = Math.max(0, PAD.top + PLOT.h - y(p));
      g.appendChild(
        el('rect', {
          x: x(j) - barW / 2,
          y: y(p),
          width: barW,
          height,
          fill: inSet.has(j) ? ACCENT : 'currentColor',
          opacity: inSet.has(j) ? 0.9 : 0.28,
        })
      );
    });

    // Mark the truth, which the reader knows and the method does not.
    g.appendChild(
      el('line', {
        x1: x(causal),
        y1: PAD.top,
        x2: x(causal),
        y2: PAD.top + PLOT.h,
        stroke: 'currentColor',
        'stroke-width': 1,
        opacity: 0.4,
        'stroke-dasharray': '3 3',
      })
    );
    g.appendChild(
      label(x(causal), PAD.top - 6, 'causal', { 'text-anchor': 'middle', opacity: 0.7 })
    );

    canvas.replaceChildren(svg);
    readout(readoutHost, [
      ['credible set', `${cs.indices.length} variant${cs.indices.length === 1 ? '' : 's'}`],
      ['coverage', cs.coverage.toFixed(3)],
      ['purity', purity.toFixed(3)],
      ['contains the causal variant', inSet.has(causal) ? 'yes' : 'no'],
      ['PIP of the causal variant', pips[causal].toFixed(3)],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'causal',
        label: 'Causal variant',
        min: 0,
        max: M - 1,
        step: 1,
        value: 10,
        format: (v) => `#${v}`,
      },
      {
        key: 'rho',
        label: 'LD decay per variant',
        min: 0.5,
        max: 0.995,
        step: 0.005,
        value: 0.95,
        format: (v) => v.toFixed(3),
      },
      {
        key: 'z',
        label: 'z at the causal variant',
        min: 0,
        max: 12,
        step: 0.1,
        value: 6,
        format: (v) => v.toFixed(1),
      },
      {
        key: 'pi0',
        label: 'Null prior π₀',
        min: 0,
        max: 5,
        step: 0.1,
        value: 1,
        format: (v) => v.toFixed(1),
      },
    ],
    draw
  );
  draw();
};

/** Polygenic score accuracy: the ceiling, and what it costs to approach it. */
const prs: Renderer = (canvas, controlHost, readoutHost) => {
  const draw = () => {
    const h2 = c.get('h2');
    const m = c.get('m');
    const n = c.get('n');

    const x = logarithmic(
      1e4,
      1e8,
      PAD.left,
      PAD.left + PLOT.w,
      [1e4, 1e5, 1e6, 1e7, 1e8],
      power10
    );
    const y = linear(0, h2, PAD.top + PLOT.h, PAD.top, [0, h2 / 4, h2 / 2, (3 * h2) / 4, h2], (v) =>
      v.toFixed(2)
    );
    const svg = newSvg();
    const g = frame(x, y, 'Discovery sample size N (log scale)', 'Expected R² of the score', svg);

    g.appendChild(
      el('line', {
        x1: PAD.left,
        y1: y(h2),
        x2: PAD.left + PLOT.w,
        y2: y(h2),
        stroke: 'currentColor',
        'stroke-width': 1,
        opacity: 0.35,
        'stroke-dasharray': '4 4',
      })
    );
    // Left-anchored: the curve asymptotes to this line on the right, so a right-anchored
    // label sits on top of it exactly where the reader is looking.
    g.appendChild(
      label(PAD.left + 8, y(h2) + 15, `ceiling h² = ${h2.toFixed(2)}`, { opacity: 0.75 })
    );

    const pts: [number, number][] = [];
    for (let l = 4; l <= 8; l += 0.02) pts.push([x(10 ** l), y(expectedR2(10 ** l, m, h2))]);
    g.appendChild(curve(pts));

    const r2 = expectedR2(n, m, h2);
    g.appendChild(el('circle', { cx: x(n), cy: y(r2), r: 5, fill: ACCENT }));

    canvas.replaceChildren(svg);
    const k = shrinkageFactor(n, m, h2);
    readout(readoutHost, [
      ['shrinkage factor', k.toFixed(4)],
      ['expected R²', r2.toFixed(4)],
      ['fraction of the ceiling', `${((r2 / h2) * 100).toFixed(1)}%`],
      ['N for half the ceiling', sci(m / h2, 3)],
      ['N for 90% of it', sci((9 * m) / h2, 3)],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'h2',
        label: 'SNP heritability h²',
        min: 0.05,
        max: 0.8,
        step: 0.01,
        value: 0.5,
        format: (v) => v.toFixed(2),
      },
      {
        key: 'm',
        label: 'Effective markers M',
        min: 4,
        max: 6.3,
        step: 0.02,
        value: 6,
        scale: (v) => 10 ** v,
        format: (v) => sci(v, 2),
      },
      {
        key: 'n',
        label: 'Discovery N',
        min: 4,
        max: 8,
        step: 0.02,
        value: 6,
        scale: (v) => 10 ** v,
        format: (v) => sci(v, 2),
      },
    ],
    draw
  );
  draw();
};

/** Bias–variance: one explicit toy decomposition, not a universal empirical curve. */
const biasVariance: Renderer = (canvas, controlHost, readoutHost) => {
  const draw = () => {
    const complexity = c.get('complexity');
    const sampleSize = c.get('sampleSize');
    const points = Array.from({ length: 91 }, (_, index) => {
      const current = 1 + index / 10;
      return biasVarianceToy(current, sampleSize);
    });
    const ymax = Math.max(0.6, ...points.map((point) => point.expectedTestError)) * 1.05;
    const x = linear(1, 10, PAD.left, PAD.left + PLOT.w, [1, 2, 4, 6, 8, 10], whole);
    const y = linear(
      0,
      ymax,
      PAD.top + PLOT.h,
      PAD.top,
      [0, ymax / 4, ymax / 2, (3 * ymax) / 4, ymax],
      (value) => value.toFixed(2)
    );
    const svg = newSvg();
    const g = frame(x, y, 'Illustrative model complexity', 'Expected squared error', svg);
    g.appendChild(
      curve(
        points.map((point) => [x(point.complexity), y(point.biasSquared)]),
        { opacity: 0.48, 'stroke-dasharray': '7 4' }
      )
    );
    g.appendChild(
      curve(
        points.map((point) => [x(point.complexity), y(point.variance)]),
        { opacity: 0.7, 'stroke-dasharray': '2 4' }
      )
    );
    g.appendChild(
      curve(
        points.map((point) => [x(point.complexity), y(point.expectedTestError)]),
        { stroke: ACCENT, 'stroke-width': 2.6 }
      )
    );
    const selected = biasVarianceToy(complexity, sampleSize);
    g.appendChild(
      el('circle', {
        cx: x(complexity),
        cy: y(selected.expectedTestError),
        r: 5,
        fill: ACCENT,
      })
    );
    g.appendChild(label(PAD.left + 8, PAD.top + 15, 'dashed: bias²', { opacity: 0.65 }));
    g.appendChild(label(PAD.left + 8, PAD.top + 31, 'dotted: variance', { opacity: 0.65 }));
    g.appendChild(label(PAD.left + 8, PAD.top + 47, 'accent: total + noise', { fill: ACCENT }));

    canvas.replaceChildren(svg);
    readout(readoutHost, [
      ['bias²', selected.biasSquared.toFixed(3)],
      ['variance', selected.variance.toFixed(3)],
      ['irreducible noise', selected.noise.toFixed(3)],
      ['expected test error', selected.expectedTestError.toFixed(3)],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'complexity',
        label: 'Illustrative complexity',
        min: 1,
        max: 10,
        step: 0.1,
        value: 4,
        format: (value) => value.toFixed(1),
      },
      {
        key: 'sampleSize',
        label: 'Training sample size',
        min: 20,
        max: 400,
        step: 10,
        value: 100,
        format: whole,
      },
    ],
    draw
  );
  draw();
};

const THRESHOLD_EXAMPLE: BinaryScore[] = [
  { score: 0.96, label: 1 },
  { score: 0.91, label: 1 },
  { score: 0.86, label: 0 },
  { score: 0.82, label: 1 },
  { score: 0.77, label: 0 },
  { score: 0.72, label: 1 },
  { score: 0.66, label: 0 },
  { score: 0.61, label: 1 },
  { score: 0.57, label: 0 },
  { score: 0.52, label: 0 },
  { score: 0.47, label: 1 },
  { score: 0.42, label: 0 },
  { score: 0.36, label: 0 },
  { score: 0.31, label: 1 },
  { score: 0.27, label: 0 },
  { score: 0.22, label: 0 },
  { score: 0.17, label: 0 },
  { score: 0.11, label: 1 },
  { score: 0.08, label: 0 },
  { score: 0.04, label: 0 },
];

/** Decision threshold: the same ranking can imply many operational confusion matrices. */
const decisionThreshold: Renderer = (canvas, controlHost, readoutHost) => {
  const draw = () => {
    const threshold = c.get('threshold');
    const metrics = binaryMetricsAtThreshold(THRESHOLD_EXAMPLE, threshold);
    const x = linear(0, 1, PAD.left, PAD.left + PLOT.w, [0, 0.25, 0.5, 0.75, 1], (v) =>
      v.toFixed(2)
    );
    const y = linear(0, 1, PAD.top + PLOT.h, PAD.top, [0, 1], (v) => (v ? 'positive' : 'negative'));
    const svg = newSvg();
    const g = frame(x, y, 'Model score', 'True class', svg);
    for (const [index, observation] of THRESHOLD_EXAMPLE.entries()) {
      const predicted = observation.score >= threshold;
      g.appendChild(
        el('circle', {
          cx: x(observation.score),
          cy: y(observation.label) + ((index % 3) - 1) * 7,
          r: 6,
          fill: predicted ? ACCENT : 'none',
          stroke: predicted ? ACCENT : 'currentColor',
          'stroke-width': 1.7,
          opacity: 0.85,
        })
      );
    }
    g.appendChild(
      el('line', {
        x1: x(threshold),
        y1: PAD.top,
        x2: x(threshold),
        y2: PAD.top + PLOT.h,
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-dasharray': '5 4',
      })
    );
    g.appendChild(
      label(x(threshold), PAD.top - 6, `t=${threshold.toFixed(2)}`, { 'text-anchor': 'middle' })
    );
    g.appendChild(
      label(PAD.left + PLOT.w - 4, PAD.top + 18, 'filled = predicted positive', {
        'text-anchor': 'end',
        opacity: 0.68,
      })
    );

    canvas.replaceChildren(svg);
    readout(readoutHost, [
      ['TP / FP / TN / FN', `${metrics.tp} / ${metrics.fp} / ${metrics.tn} / ${metrics.fn}`],
      ['precision', metrics.precision.toFixed(3)],
      ['recall', metrics.recall.toFixed(3)],
      ['specificity', metrics.specificity.toFixed(3)],
      ['F1', metrics.f1.toFixed(3)],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'threshold',
        label: 'Decision threshold',
        min: 0,
        max: 1,
        step: 0.01,
        value: 0.5,
        format: (v) => v.toFixed(2),
      },
    ],
    draw
  );
  draw();
};

/** Gradient descent on a quadratic: eta times curvature determines convergence. */
const gradientDescent: Renderer = (canvas, controlHost, readoutHost) => {
  const draw = () => {
    const learningRate = c.get('learningRate');
    const steps = Math.round(c.get('steps'));
    const history = quadraticDescent({ initial: 2.5, learningRate, curvature: 1, steps });
    const domain = Math.max(3.2, ...history.map((point) => Math.abs(point.parameter))) * 1.08;
    const topLoss = Math.max(5.2, ...history.map((point) => point.loss)) * 1.08;
    const x = linear(
      -domain,
      domain,
      PAD.left,
      PAD.left + PLOT.w,
      [-domain, -domain / 2, 0, domain / 2, domain],
      (v) => v.toFixed(1)
    );
    const y = linear(0, topLoss, PAD.top + PLOT.h, PAD.top, [0, topLoss / 2, topLoss], (v) =>
      v.toFixed(1)
    );
    const svg = newSvg();
    const g = frame(x, y, 'Parameter θ', 'Quadratic loss L(θ)', svg);
    const parabola: [number, number][] = [];
    for (let index = 0; index <= 120; index += 1) {
      const theta = -domain + (2 * domain * index) / 120;
      parabola.push([x(theta), y(0.5 * theta * theta)]);
    }
    g.appendChild(curve(parabola, { opacity: 0.45 }));
    g.appendChild(
      curve(
        history.map((point) => [x(point.parameter), y(point.loss)]),
        { stroke: ACCENT, 'stroke-width': 2.4 }
      )
    );
    history.forEach((point, index) => {
      g.appendChild(
        el('circle', {
          cx: x(point.parameter),
          cy: y(point.loss),
          r: index === history.length - 1 ? 5 : 3,
          fill: ACCENT,
          opacity: 0.35 + (0.65 * index) / Math.max(1, history.length - 1),
        })
      );
    });

    const contraction = Math.abs(1 - learningRate);
    const last = history.at(-1)!;
    canvas.replaceChildren(svg);
    readout(readoutHost, [
      ['|1 − ηλ|', contraction.toFixed(3)],
      ['regime', contraction < 1 ? 'convergent' : contraction === 1 ? 'boundary' : 'divergent'],
      ['final θ', last.parameter.toFixed(4)],
      ['final loss', last.loss.toFixed(4)],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'learningRate',
        label: 'Learning rate η',
        min: 0.02,
        max: 2.2,
        step: 0.02,
        value: 0.45,
        format: (v) => v.toFixed(2),
      },
      { key: 'steps', label: 'Update steps', min: 2, max: 14, step: 1, value: 8, format: whole },
    ],
    draw
  );
  draw();
};

/** Attention temperature: the logits stay fixed while the normalized allocation changes. */
const attentionTemperature: Renderer = (canvas, controlHost, readoutHost) => {
  const logits = [3, 1.4, 0.6, -0.4];
  const tokens = ['signal', 'context', 'modifier', 'distractor'];
  const draw = () => {
    const temperature = c.get('temperature');
    const weights = softmaxWithTemperature(logits, temperature);
    const x = linear(
      -0.5,
      3.5,
      PAD.left,
      PAD.left + PLOT.w,
      [0, 1, 2, 3],
      (value) => tokens[Math.round(value)]
    );
    const y = linear(0, 1, PAD.top + PLOT.h, PAD.top, [0, 0.25, 0.5, 0.75, 1], (value) =>
      value.toFixed(2)
    );
    const svg = newSvg();
    const g = frame(x, y, 'Key token', 'Attention weight', svg);
    const barWidth = PLOT.w / 5;
    weights.forEach((weight, index) => {
      g.appendChild(
        el('rect', {
          x: x(index) - barWidth / 2,
          y: y(weight),
          width: barWidth,
          height: PAD.top + PLOT.h - y(weight),
          fill: index === 0 ? ACCENT : 'currentColor',
          opacity: index === 0 ? 0.9 : 0.3,
        })
      );
      g.appendChild(label(x(index), y(weight) - 7, weight.toFixed(3), { 'text-anchor': 'middle' }));
    });
    canvas.replaceChildren(svg);
    readout(readoutHost, [
      ['temperature', temperature.toFixed(2)],
      ['largest weight', Math.max(...weights).toFixed(3)],
      ['weights sum', weights.reduce((sum, weight) => sum + weight, 0).toFixed(6)],
      ['argmax token', tokens[weights.indexOf(Math.max(...weights))]],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'temperature',
        label: 'Softmax temperature',
        min: 0.2,
        max: 3,
        step: 0.05,
        value: 1,
        format: (v) => v.toFixed(2),
      },
    ],
    draw
  );
  draw();
};

/**
 * Where a single-cell zero comes from.
 *
 * Draws the count distribution of one gene under Poisson sampling and under the negative
 * binomial that the same mean with overdispersion implies, so the reader can see that most
 * zeros are ordinary counting statistics rather than a separate dropout process. Every
 * number comes from deepDiveMath, so the widget cannot disagree with the prose beside it.
 */
const scDropout: Renderer = (canvas, controlHost, readoutHost) => {
  const KMAX = 10;

  const draw = () => {
    const mu = c.get('mu');
    const theta = c.get('theta');

    const pPois = Array.from({ length: KMAX + 1 }, (_, k) => poissonPmf(k, mu));
    const pNb = Array.from({ length: KMAX + 1 }, (_, k) => negBinomialPmf(k, mu, theta));
    const top = Math.max(...pPois, ...pNb, 0.05);

    const x = linear(-0.5, KMAX + 0.5, PAD.left, PAD.left + PLOT.w,
      Array.from({ length: KMAX + 1 }, (_, k) => k), (v) => String(v));
    const y = linear(0, top, PAD.top + PLOT.h, PAD.top,
      [0, top / 2, top], (v) => v.toFixed(2));

    const svg = newSvg();
    const g = frame(x, y, 'UMIs of this gene in one cell', 'Probability', svg);

    const slot = (x(1) - x(0)) * 0.42;
    for (let k = 0; k <= KMAX; k += 1) {
      const base = y(0);
      // negative binomial: filled, the model the field settled on
      g.appendChild(
        el('rect', {
          x: x(k) - slot,
          y: y(pNb[k]),
          width: slot,
          height: Math.max(0, base - y(pNb[k])),
          fill: ACCENT,
          opacity: 0.85,
        })
      );
      // Poisson: outlined, so the overlap is visible rather than hidden
      g.appendChild(
        el('rect', {
          x: x(k),
          y: y(pPois[k]),
          width: slot,
          height: Math.max(0, base - y(pPois[k])),
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.4,
          opacity: 0.75,
        })
      );
    }

    g.appendChild(
      label(PAD.left + PLOT.w - 4, PAD.top + 16, 'filled = negative binomial', {
        'text-anchor': 'end',
        opacity: 0.72,
      })
    );
    g.appendChild(
      label(PAD.left + PLOT.w - 4, PAD.top + 32, 'outlined = Poisson, same mean', {
        'text-anchor': 'end',
        opacity: 0.72,
      })
    );

    canvas.replaceChildren(svg);

    const zPois = poissonZeroProbability(mu);
    const zNb = nbZeroProbability(mu, theta);
    readout(readoutHost, [
      ['zeros, Poisson', `${(100 * zPois).toFixed(1)}%`],
      ['zeros, NB', `${(100 * zNb).toFixed(1)}%`],
      ['of the NB zeros, sampling alone explains', `${(100 * (zPois / zNb)).toFixed(1)}%`],
      ['variance', `${nbVariance(mu, theta).toFixed(2)} vs ${mu.toFixed(2)} Poisson`],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'mu',
        label: 'Mean UMIs per cell',
        min: 0.05,
        max: 3,
        step: 0.05,
        value: 0.5,
        format: (v) => v.toFixed(2),
      },
      {
        key: 'theta',
        label: 'Dispersion theta (higher = closer to Poisson)',
        min: -0.7,
        max: 2,
        step: 0.05,
        value: Math.log10(2),
        scale: (v) => 10 ** v,
        format: (v) => v.toFixed(2),
      },
    ],
    draw
  );
  draw();
};

/**
 * Whether a transform stabilises the variance it is chosen to stabilise.
 *
 * Draws the sd of the transformed count against the gene's mean for the four transforms a
 * pipeline picks between, with a marker the reader drags along the mean. A flat line is the
 * whole point of the exercise, and log1p — the default — is the least flat of them.
 */
const scNormalize: Renderer = (canvas, controlHost, readoutHost) => {
  const MU_MIN = 0.05;
  const MU_MAX = 200;
  const CURVES = [
    { kind: 'anscombe' as const, opacity: 0.7, width: 2 },
    { kind: 'sqrt' as const, opacity: 0.42, width: 2 },
    { kind: 'log1p' as const, opacity: 1, width: 2.4, accent: true },
  ];

  const draw = () => {
    const mu = c.get('mu');
    const x = logarithmic(MU_MIN, MU_MAX, PAD.left, PAD.left + PLOT.w,
      [0.1, 1, 10, 100], (v) => String(v));
    const y = linear(0, 1.2, PAD.top + PLOT.h, PAD.top, [0, 0.5, 1], (v) => v.toFixed(1));

    const svg = newSvg();
    const g = frame(x, y, 'Mean UMIs per cell', 'SD of transformed count', svg);

    // Pearson is flat at 1 by construction, so it is the reference the others are read against
    g.appendChild(
      el('line', {
        x1: PAD.left, y1: y(1), x2: PAD.left + PLOT.w, y2: y(1),
        stroke: 'currentColor', 'stroke-width': 2, opacity: 0.85, 'stroke-dasharray': '6 4',
      })
    );

    const sample = (kind: 'log1p' | 'sqrt' | 'anscombe') => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= 80; i += 1) {
        const m = 10 ** (Math.log10(MU_MIN) + (Math.log10(MU_MAX) - Math.log10(MU_MIN)) * (i / 80));
        pts.push([x(m), y(transformSd(kind, m))]);
      }
      return pts;
    };
    for (const cv of CURVES)
      g.appendChild(curve(sample(cv.kind), {
        stroke: cv.accent ? ACCENT : 'currentColor',
        'stroke-width': cv.width,
        opacity: cv.opacity,
      }));

    g.appendChild(
      el('line', {
        x1: x(mu), y1: PAD.top, x2: x(mu), y2: PAD.top + PLOT.h,
        stroke: 'currentColor', 'stroke-width': 1.1, opacity: 0.32, 'stroke-dasharray': '3 3',
      })
    );
    g.appendChild(el('circle', { cx: x(mu), cy: y(transformSd('log1p', mu)), r: 4.4, fill: ACCENT }));

    g.appendChild(label(PAD.left + PLOT.w - 4, PAD.top + 16, 'dashed = Pearson residual, flat at 1', {
      'text-anchor': 'end', opacity: 0.7,
    }));

    canvas.replaceChildren(svg);

    const bias = transformMean('log1p', mu) / Math.log1p(mu);
    readout(readoutHost, [
      ['SD log1p', transformSd('log1p', mu).toFixed(3)],
      ['sqrt', transformSd('sqrt', mu).toFixed(3)],
      ['Anscombe', transformSd('anscombe', mu).toFixed(3)],
      ['E[log1p] as a share of log1p(mean)', `${(100 * bias).toFixed(1)}%`],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'mu',
        label: 'Mean UMIs per cell',
        min: Math.log10(MU_MIN),
        max: Math.log10(MU_MAX),
        step: 0.02,
        value: Math.log10(0.5),
        scale: (v) => 10 ** v,
        format: (v) => v.toFixed(2),
      },
    ],
    draw
  );
  draw();
};

/**
 * What a neighbour graph is actually joining.
 *
 * Ninety cells in three clusters, separated by three standard deviations in dimensions 0 and
 * 1 and by nothing at all in every dimension after that. The plot always shows those first
 * two dimensions — the true picture, unchanged by any slider — while the edges are the graph
 * built in `d` dimensions. Raising `d` adds only noise, and the edges start joining clusters
 * that are plainly separate on screen.
 *
 * The matrix is regenerated at exactly `d` columns rather than sliced from a wider one, so
 * the widget draws the same numbers the lesson's tests assert.
 */
const scKnnGraph: Renderer = (canvas, controlHost, readoutHost) => {
  const N = 90;
  const PER = 30;
  const CENTRES = [[3, 0], [-3, 0], [0, 3]];
  const CHANCE = (PER - 1) / (N - 1);

  const build = (d: number) => {
    const M = seededNormals(N, d, 77);
    const labels: number[] = [];
    for (let i = 0; i < N; i += 1) {
      const c = Math.floor(i / PER);
      labels.push(c);
      M[i][0] += CENTRES[c][0];
      if (d > 1) M[i][1] += CENTRES[c][1];
    }
    return { M, labels };
  };

  const draw = () => {
    const d = Math.max(2, Math.round(c.get('dims')));
    const k = Math.round(c.get('k'));
    const { M, labels } = build(d);
    const adjacency = knnGraph(M, k);

    const x = linear(-7, 7, PAD.left, PAD.left + PLOT.w, [-6, -3, 0, 3, 6], (v) => String(v));
    const y = linear(-5, 7, PAD.top + PLOT.h, PAD.top, [-4, 0, 4], (v) => String(v));
    const svg = newSvg();
    const g = frame(x, y, 'Dimension 1 — where the biology is', 'Dimension 2', svg);

    // edges that join different clusters are the mistakes; draw them last and darker
    const wrong: [number, number][] = [];
    for (let i = 0; i < N; i += 1)
      for (const j of adjacency[i]) {
        if (labels[i] === labels[j])
          g.appendChild(el('line', {
            x1: x(M[i][0]), y1: y(M[i][1]), x2: x(M[j][0]), y2: y(M[j][1]),
            stroke: ACCENT, 'stroke-width': 1, opacity: 0.3,
          }));
        else wrong.push([i, j]);
      }
    for (const [i, j] of wrong)
      g.appendChild(el('line', {
        x1: x(M[i][0]), y1: y(M[i][1]), x2: x(M[j][0]), y2: y(M[j][1]),
        stroke: 'currentColor', 'stroke-width': 1.4, opacity: 0.75,
      }));

    for (let i = 0; i < N; i += 1) {
      const cluster = labels[i];
      g.appendChild(el('circle', {
        cx: x(M[i][0]), cy: y(M[i][1]), r: 3.4,
        fill: cluster === 0 ? ACCENT : cluster === 1 ? 'currentColor' : 'none',
        stroke: cluster === 2 ? 'currentColor' : 'none',
        'stroke-width': 1.4,
        opacity: 0.9,
      }));
    }

    g.appendChild(label(PAD.left + PLOT.w - 4, PAD.top + 16, 'dark edges join different clusters', {
      'text-anchor': 'end', opacity: 0.72,
    }));

    canvas.replaceChildren(svg);

    const purity = neighborPurity(adjacency, labels);
    const contrast = relativeContrast(M[0], M.slice(1));
    readout(readoutHost, [
      ['edges joining the same cluster', `${(100 * purity).toFixed(1)}%`],
      ['chance', `${(100 * CHANCE).toFixed(1)}%`],
      ['relative contrast', contrast.toFixed(2)],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'dims',
        label: 'Dimensions the graph is built in',
        min: Math.log10(2),
        max: Math.log10(2000),
        step: 0.02,
        value: Math.log10(2),
        scale: (v) => 10 ** v,
        format: (v) => String(Math.max(2, Math.round(v))),
      },
      {
        key: 'k',
        label: 'Neighbours per cell (k)',
        min: 1,
        max: 20,
        step: 1,
        value: 10,
        format: (v) => String(Math.round(v)),
      },
    ],
    draw
  );
  draw();
};

/**
 * The resolution dial, on a graph whose right answer is known.
 *
 * A ring of complete K5 cliques joined by single edges: every clique is a maximally distinct
 * community, so the correct partition is one per clique and any merger is unambiguously
 * wrong. The bars are the modularity of each candidate partition at the chosen resolution.
 * The reader's job is to notice how large a range of resolution returns the same wrong answer.
 */
const scResolution: Renderer = (canvas, controlHost, readoutHost) => {
  const K = 5;

  const ringOfCliques = (n: number) => {
    const adjacency: number[][] = Array.from({ length: n * K }, () => []);
    const join = (a: number, b: number) => {
      adjacency[a].push(b);
      adjacency[b].push(a);
    };
    for (let c = 0; c < n; c += 1) {
      const base = c * K;
      for (let i = 0; i < K; i += 1)
        for (let j = i + 1; j < K; j += 1) join(base + i, base + j);
      join(base, ((c + 1) % n) * K);
    }
    return adjacency;
  };
  const grouped = (n: number, g: number) =>
    Array.from({ length: n * K }, (_, i) => Math.floor(Math.floor(i / K) / g));

  const draw = () => {
    const n = 2 * Math.round(c.get('cliques') / 2);
    const gamma = c.get('gamma');
    const adjacency = ringOfCliques(n);
    const truth = grouped(n, 1);

    const groupings: number[] = [];
    for (let g = 1; g <= n; g += 1) if (n % g === 0 && n / g >= 2) groupings.push(g);
    const scored = groupings.map((g) => ({
      g,
      communities: n / g,
      q: graphModularity(adjacency, grouped(n, g), gamma),
    }));
    const best = scored.reduce((a, b) => (b.q > a.q ? b : a));

    const lo = Math.min(0, ...scored.map((s) => s.q));
    const hi = Math.max(...scored.map((s) => s.q));
    const x = linear(-0.5, scored.length - 0.5, PAD.left, PAD.left + PLOT.w,
      scored.map((_, i) => i), (v) => String(scored[Math.round(v)]?.communities ?? ''));
    const y = linear(lo, hi * 1.08, PAD.top + PLOT.h, PAD.top, [lo, hi], (v) => v.toFixed(2));

    const svg = newSvg();
    const g2 = frame(x, y, 'Communities in the candidate partition', 'Modularity', svg);
    const slot = ((x(1) - x(0)) || 30) * 0.34;

    for (const [i, s] of scored.entries()) {
      const isBest = s.g === best.g;
      const isTruth = s.communities === n;
      g2.appendChild(el('rect', {
        x: x(i) - slot,
        y: y(Math.max(s.q, y.ticks[0])),
        width: slot * 2,
        height: Math.max(0, y(Math.min(s.q, 0)) - y(Math.max(s.q, 0))) || 1,
        fill: isBest ? ACCENT : 'currentColor',
        opacity: isBest ? 0.9 : 0.35,
      }));
      if (isTruth)
        g2.appendChild(label(x(i), y(s.q) - 8, 'the truth', {
          'text-anchor': 'middle', opacity: 0.85,
        }));
    }

    canvas.replaceChildren(svg);
    readout(readoutHost, [
      ['best-scoring partition', `${best.communities} communities`],
      ['the truth', `${n}`],
      ['ARI against the truth', adjustedRandIndex(truth, grouped(n, best.g)).toFixed(3)],
      ['its modularity', best.q.toFixed(4)],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'gamma',
        label: 'Resolution',
        min: 0.3,
        max: 3,
        step: 0.02,
        value: 1,
        format: (v) => v.toFixed(2),
      },
      {
        key: 'cliques',
        label: 'Cliques in the ring (the true number of communities)',
        min: 8,
        max: 48,
        step: 2,
        value: 40,
        format: (v) => String(2 * Math.round(v / 2)),
      },
    ],
    draw
  );
  draw();
};

/**
 * What an embedding's faithfulness score can and cannot see.
 *
 * Two clusters of fifteen points whose true centres sit ten apart. The slider scales only the
 * gap between them in the embedding — no point ever changes which cluster it belongs to or
 * which points are nearest within it. Trustworthiness therefore sits at 1 across almost the
 * whole range, while the picture goes from two specks at opposite ends to a single blob.
 *
 * The reader is meant to notice that the number stays put while the thing they would actually
 * conclude from the plot reverses completely.
 */
const scEmbedding: Renderer = (canvas, controlHost, readoutHost) => {
  const PER = 15;
  const TRUE_GAP = 10;
  const base = seededNormals(2 * PER, 2, 909);
  const high = base.map((p, i) => [p[0] + (i < PER ? 0 : TRUE_GAP), p[1]]);

  const spread = (pts: number[][]) => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length;
  };

  const draw = () => {
    const scale = c.get('gap');
    const k = Math.round(c.get('k'));
    const low = base.map((p, i) => [p[0] + (i < PER ? 0 : TRUE_GAP * scale), p[1]]);

    const xs = low.map((p) => p[0]);
    const pad = Math.max(1.5, (Math.max(...xs) - Math.min(...xs)) * 0.12);
    const x = linear(Math.min(...xs) - pad, Math.max(...xs) + pad,
      PAD.left, PAD.left + PLOT.w, [], () => '');
    const y = linear(-4, 4, PAD.top + PLOT.h, PAD.top, [-3, 0, 3], (v) => String(v));

    const svg = newSvg();
    const g = frame(x, y, 'The embedding, as you would look at it', '', svg);
    for (const [i, p] of low.entries())
      g.appendChild(el('circle', {
        cx: x(p[0]), cy: y(p[1]), r: 3.6,
        fill: i < PER ? ACCENT : 'none',
        stroke: i < PER ? 'none' : 'currentColor',
        'stroke-width': 1.5,
        opacity: 0.85,
      }));

    canvas.replaceChildren(svg);

    const gapNow = Math.abs(
      low.slice(PER).reduce((s, p) => s + p[0], 0) / PER
      - low.slice(0, PER).reduce((s, p) => s + p[0], 0) / PER,
    );
    const within = (spread(low.slice(0, PER)) + spread(low.slice(PER))) / 2;
    readout(readoutHost, [
      ['trustworthiness', trustworthiness(high, low, k).toFixed(4)],
      ['how separated it looks', `${(gapNow / within).toFixed(1)}x`],
      ['true separation', `${(TRUE_GAP / within).toFixed(1)}x`],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'gap',
        label: 'Stretch or squash the gap between the clusters',
        min: -1.7,
        max: 1.7,
        step: 0.02,
        value: 0,
        scale: (v) => 10 ** v,
        format: (v) => `${v.toFixed(2)}x`,
      },
      {
        key: 'k',
        label: 'Neighbourhood size the score uses (k)',
        min: 2,
        max: 12,
        step: 1,
        value: 5,
        format: (v) => String(Math.round(v)),
      },
    ],
    draw
  );
  draw();
};

/**
 * What a marker gene is worth against the ambient soup.
 *
 * Draws the two expected counts — in a cell that expresses the marker and in one that does
 * not — as a dumbbell on a logarithmic axis, so the connector's length *is* the log contrast.
 * Dragging the marker's own expression slides both ends together and leaves the connector
 * exactly as long, which is the cancellation the lesson proves algebraically.
 */
const scMarkerContrast: Renderer = (canvas, controlHost, readoutHost) => {
  const DEPTH = 8000;

  const draw = () => {
    const alpha = c.get('alpha');
    const phi = c.get('phi');
    const own = c.get('own');

    // the marker is expressed only by this type, so the soup carries it in proportion to phi
    const soup = soupShare([{ share: phi, geneShare: own }]);
    const expressing = expectedMarkerCounts(DEPTH, alpha, own, soup);
    const silent = ambientExpectedCounts(DEPTH, alpha, soup);
    const contrast = markerContrast(alpha, markerEnrichment(own, soup));
    const ceiling = markerContrastCeiling(alpha, phi);

    const x = logarithmic(1e-3, 1e4, PAD.left, PAD.left + PLOT.w,
      [1e-2, 1, 100, 1e4], (v) => (v >= 1 ? whole(v) : String(v)));
    const y = linear(0, 1, PAD.top + PLOT.h, PAD.top, [], () => '');

    const svg = newSvg();
    const g = frame(x, y, `Expected counts at ${whole(DEPTH)} UMIs`, '', svg);
    const row = y(0.55);

    g.appendChild(el('line', {
      x1: x(Math.max(silent, 1e-3)), y1: row, x2: x(Math.max(expressing, 1e-3)), y2: row,
      stroke: 'currentColor', 'stroke-width': 3, opacity: 0.45,
    }));
    g.appendChild(el('circle', {
      cx: x(Math.max(silent, 1e-3)), cy: row, r: 6,
      fill: 'none', stroke: 'currentColor', 'stroke-width': 2, opacity: 0.8,
    }));
    g.appendChild(el('circle', {
      cx: x(Math.max(expressing, 1e-3)), cy: row, r: 6, fill: ACCENT,
    }));
    g.appendChild(label((x(Math.max(silent, 1e-3)) + x(Math.max(expressing, 1e-3))) / 2, row - 14,
      `${contrast.toFixed(2)}x`, { 'text-anchor': 'middle', opacity: 0.9 }));
    g.appendChild(label(PAD.left + PLOT.w - 4, PAD.top + 16,
      'filled = expresses it, open = does not', { 'text-anchor': 'end', opacity: 0.7 }));

    canvas.replaceChildren(svg);
    readout(readoutHost, [
      ['contrast', `${contrast.toFixed(3)}x`],
      ['the ceiling for this type', `${ceiling.toFixed(3)}x`],
      ['evidence balances at', `${markerEvidenceMultiple(contrast).toFixed(2)}x ambient`],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'alpha',
        label: 'Ambient fraction of the run',
        min: Math.log10(0.005),
        max: Math.log10(0.3),
        step: 0.01,
        value: Math.log10(0.05),
        scale: (v) => 10 ** v,
        format: (v) => `${(100 * v).toFixed(1)}%`,
      },
      {
        key: 'phi',
        label: 'This cell type’s share of the soup',
        min: 0.01,
        max: 0.8,
        step: 0.01,
        value: 0.6,
        format: (v) => `${(100 * v).toFixed(0)}%`,
      },
      {
        key: 'own',
        label: 'The marker’s share of this type’s transcripts',
        min: Math.log10(0.0005),
        max: Math.log10(0.3),
        step: 0.01,
        value: Math.log10(0.05),
        scale: (v) => 10 ** v,
        format: (v) => `${(100 * v).toFixed(2)}%`,
      },
    ],
    draw
  );
  draw();
};

/**
 * More cells, worse test — and where the information actually is.
 *
 * Two bars driven by the same three controls. The upper one is the false-positive rate of a
 * per-cell test at nominal 5%; the lower is how many independent cells the design is worth,
 * against its own hard ceiling of n/ρ. Dragging cells-per-sample to the right grows the first
 * and stops moving the second, which is the whole lesson in one gesture.
 */
const scPseudobulk: Renderer = (canvas, controlHost, readoutHost) => {
  const draw = () => {
    const samples = Math.round(c.get('samples'));
    const cells = Math.round(c.get('cells'));
    const icc = c.get('icc');

    const de = designEffect(cells, icc);
    const fpr = clusteredFalsePositiveRate(cells, icc);
    const eff = effectiveIndependentCells(samples, cells, icc);
    const ceiling = samples / icc;

    const svg = newSvg();
    const g = el('g');
    const left = PAD.left + 46;
    const right = PAD.left + PLOT.w - 10;
    const track = right - left;

    const bar = (row: number, frac: number, title: string, value: string, accent: boolean) => {
      const y0 = PAD.top + 24 + row * 74;
      g.appendChild(label(left, y0 - 8, title, { opacity: 0.8 }));
      g.appendChild(el('rect', {
        x: left, y: y0, width: track, height: 22, fill: 'currentColor', opacity: 0.1, rx: 2,
      }));
      g.appendChild(el('rect', {
        x: left, y: y0, width: Math.max(1, track * Math.min(1, Math.max(0, frac))), height: 22,
        fill: accent ? ACCENT : 'currentColor', opacity: accent ? 0.85 : 0.5, rx: 2,
      }));
      g.appendChild(label(left + track + 6, y0 + 16, value, { opacity: 0.95 }));
      return y0;
    };

    const y0 = bar(0, fpr, 'True nulls a per-cell test calls significant',
      `${(100 * fpr).toFixed(1)}%`, true);
    // the nominal rate, for scale
    g.appendChild(el('line', {
      x1: left + track * 0.05, y1: y0 - 4, x2: left + track * 0.05, y2: y0 + 26,
      stroke: 'currentColor', 'stroke-width': 1.6, opacity: 0.75,
    }));
    g.appendChild(label(left + track * 0.05 + 5, y0 - 8, 'nominal 5%', { opacity: 0.65 }));

    const y1 = bar(1, eff / ceiling, 'Independent cells the design is worth',
      `${eff.toFixed(1)}`, false);
    g.appendChild(el('line', {
      x1: left + track, y1: y1 - 4, x2: left + track, y2: y1 + 26,
      stroke: 'currentColor', 'stroke-width': 1.6, opacity: 0.75,
    }));
    g.appendChild(label(left + track - 5, y1 - 8, `ceiling ${ceiling.toFixed(0)}`,
      { 'text-anchor': 'end', opacity: 0.65 }));

    svg.appendChild(g);
    canvas.replaceChildren(svg);

    const perSample = effectiveIndependentCells(samples + 1, cells, icc) - eff;
    const perCells = effectiveIndependentCells(samples, 2 * cells, icc) - eff;
    readout(readoutHost, [
      ['design effect', de.toFixed(2)],
      ['standard error too small by', `${Math.sqrt(de).toFixed(2)}x`],
      ['one more sample buys', perSample.toFixed(2)],
      ['doubling the cells buys', perCells.toFixed(2)],
    ]);
  };

  const c = buildControls(
    controlHost,
    [
      {
        key: 'cells',
        label: 'Cells per sample',
        min: 1,
        max: 4,
        step: 0.02,
        value: Math.log10(200),
        scale: (v) => 10 ** v,
        format: (v) => whole(Math.round(v)),
      },
      {
        key: 'samples',
        label: 'Samples per group (donors, mice, patients)',
        min: 2,
        max: 20,
        step: 1,
        value: 4,
        format: (v) => String(Math.round(v)),
      },
      {
        key: 'icc',
        label: 'Intra-sample correlation',
        min: 0.005,
        max: 0.3,
        step: 0.005,
        value: 0.05,
        format: (v) => v.toFixed(3),
      },
    ],
    draw
  );
  draw();
};

const RENDERERS: Record<DeepDiveWidgetKind, Renderer> = {
  'ld-decay': ldDecay,
  drift,
  power,
  selection,
  finemap,
  prs,
  'bias-variance': biasVariance,
  'decision-threshold': decisionThreshold,
  'gradient-descent': gradientDescent,
  'attention-temperature': attentionTemperature,
  'sc-dropout': scDropout,
  'sc-normalize': scNormalize,
  'sc-knn-graph': scKnnGraph,
  'sc-resolution': scResolution,
  'sc-embedding': scEmbedding,
  'sc-marker-contrast': scMarkerContrast,
  'sc-pseudobulk': scPseudobulk,
};

/**
 * Mount every widget under `root` that has not been mounted already.
 *
 * Idempotent by a `dataset` flag rather than by unbinding: `ClientRouter` swaps the
 * document on navigation, so this runs again on every `astro:page-load`, and a persisted
 * or re-rendered node must not acquire a second set of controls.
 */
export function mountDeepDiveWidgets(root: ParentNode = document): number {
  let mounted = 0;
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-dd-widget]'))) {
    if (node.dataset.ddReady === 'true') continue;
    const kind = node.dataset.ddWidget as DeepDiveWidgetKind | undefined;
    const render = kind ? RENDERERS[kind] : undefined;
    const canvas = node.querySelector<HTMLElement>('[data-dd-canvas]');
    const controls = node.querySelector<HTMLElement>('[data-dd-controls]');
    const out = node.querySelector<HTMLElement>('[data-dd-readout]');
    if (!render || !canvas || !controls || !out) continue;

    node.dataset.ddReady = 'true';
    controls.hidden = false;
    out.hidden = false;
    render(canvas, controls, out);
    mounted += 1;
  }
  return mounted;
}
