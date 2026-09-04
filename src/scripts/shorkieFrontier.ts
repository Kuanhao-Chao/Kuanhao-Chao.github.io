/**
 * The three frontier analyses: species steering, second-order epistasis, and induction kinetics.
 *
 * All three are per-locus and all three follow the genome browser above them, through the same
 * `khc:gb-view` event the paper-fidelity logo uses. Nothing here runs a model: every number was
 * computed offline and ships either in `src/data/` (the small tables) or as a uint8 pack in
 * `public/vp-data/` (the per-base profiles).
 *
 * Packs are decoded through `decodePackedPlane` and never by a local inverse -- writing that
 * inverse a second time is how this repo shipped a wrong correlation while every sign check passed.
 */
import { decodePackedPlane, type PackedPlaneSpec } from '../lib/shorkieModel';
import speciesData from '../data/shorkieSpecies.json';
import epistasisData from '../data/shorkieEpistasis.json';
import kineticsData from '../data/shorkieKinetics.json';
import headsData from '../data/shorkieHeads.json';
import variationData from '../data/shorkieVariation.json';

const DATA = `${import.meta.env.BASE_URL}/vp-data`.replace(/\/{2,}/g, '/');
const SEQ_LEN = 16384;

type Sp = typeof speciesData;
type Kin = typeof kineticsData;

interface HessPack extends PackedPlaneSpec {
  sites: { name: string; start: number; end: number; evidence: string | null; peak: number; self: number }[];
  symmetryResidual: number;
}
interface KinPack extends PackedPlaneSpec {
  regulators: { reg: string; early: number; late: number; r: number; overlap: number }[];
}

/** The widest caption that fits. A clipped canvas caption reads as a different sentence. */
function caption(ctx: CanvasRenderingContext2D, tiers: string[], x: number, y: number, max: number) {
  for (const t of tiers) {
    if (ctx.measureText(t).width <= max) { ctx.fillText(t, x, y); return; }
  }
}

const css = (el: HTMLElement, name: string, fallback: string) =>
  getComputedStyle(el).getPropertyValue(name).trim() || fallback;

/** Fit a canvas to its box at device resolution. NO minimum width: a floor makes the backing
 *  store wider than the element, `width: 100%` scales it back, and every x is off by that ratio. */
function fit(cv: HTMLCanvasElement, cssHeight: number): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(cv.clientWidth));
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(cssHeight * dpr);
  cv.style.height = `${cssHeight}px`;
  const ctx = cv.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

async function loadPack<T extends PackedPlaneSpec>(id: string, kind: string):
Promise<{ spec: T; plane: Float32Array } | null> {
  try {
    const [meta, img] = await Promise.all([
      fetch(`${DATA}/${id}-${kind}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${DATA}/${id}-${kind}.png`).then((r) => (r.ok ? r.blob() : null)),
    ]);
    if (!meta || !img) return null;
    const bmp = await createImageBitmap(img);
    const cv = document.createElement('canvas');
    cv.width = meta.cols; cv.height = meta.rows;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    if (!cx) return null;
    cx.drawImage(bmp, 0, 0);
    bmp.close();
    const px = cx.getImageData(0, 0, meta.cols, meta.rows).data;
    return { spec: meta as T, plane: decodePackedPlane(px, meta) };
  } catch {
    return null;
  }
}

export function initShorkieFrontier(host: HTMLElement): void {
  if (host.dataset.frontierBound === '1') return;
  host.dataset.frontierBound = '1';
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => host.querySelector<T>(s);

  const sp = speciesData as Sp;
  const kin = kineticsData as Kin;
  let locus: string = Object.keys(sp.loci)[0];

  // ---------------------------------------------------------------------------------------
  // 1. Species steering
  // ---------------------------------------------------------------------------------------
  const spCanvas = $<HTMLCanvasElement>('[data-fr-species]');
  const spStat = $('[data-fr-species-stat]');

  function drawSpecies(): void {
    if (!spCanvas) return;
    const rec = (sp.loci as Record<string, { gene: string; values: number[]; cerevisiaeRank: number }>)[locus];
    if (!rec) return;
    const H = 190;
    const ctx = fit(spCanvas, H);
    if (!ctx) return;
    const w = Math.max(1, Math.round(spCanvas.clientWidth));
    const pad = { l: 6, r: 6, t: 18, b: 26 };
    const inner = w - pad.l - pad.r;
    const plot = H - pad.t - pad.b;
    const vals = rec.values;
    const order = vals.map((v, i) => i).sort((a, b) => vals[b] - vals[a]);
    const lo = Math.min(...vals); const hi = Math.max(...vals);
    const span = Math.max(hi - lo, 1e-9);
    const ink = css(host, '--color-ink', '#1a1a1a');
    const muted = css(host, '--color-muted', '#6b7280');
    const accent = css(host, '--color-accent', '#3d6ea8');
    const mark = css(host, '--gb-roi', '#b8860b');

    ctx.strokeStyle = css(host, '--color-rule', '#d8d8d8');
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t + plot + 0.5);
    ctx.lineTo(pad.l + inner, pad.t + plot + 0.5);
    ctx.stroke();

    const bw = inner / order.length;
    order.forEach((sIdx, rank) => {
      const v = vals[sIdx];
      const h = ((v - lo) / span) * plot;
      const isCer = sIdx === sp.speciesIndex;
      ctx.fillStyle = isCer ? mark : accent;
      ctx.globalAlpha = isCer ? 1 : 0.42;
      ctx.fillRect(pad.l + rank * bw, pad.t + plot - h, Math.max(1, bw - 0.4), h);
      if (isCer) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = mark;
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = rank > order.length * 0.6 ? 'right' : 'left';
        const x = pad.l + rank * bw + (rank > order.length * 0.6 ? -4 : 4);
        ctx.fillText(`S. cerevisiae — rank ${rec.cerevisiaeRank} of ${vals.length}`, x, pad.t + 9);
      }
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = muted;
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${sp.names[order[0]]}`, pad.l, H - 14);
    ctx.textAlign = 'right';
    ctx.fillText(`${sp.names[order[order.length - 1]]}`, pad.l + inner, H - 14);
    ctx.textAlign = 'left';
    ctx.fillStyle = ink;
    ctx.fillText('165 species, ranked by predicted expression of this gene — the DNA never changes',
      pad.l, H - 3);
    spCanvas.dataset.frSpecies = String(rec.cerevisiaeRank);

    if (spStat) {
      const s = sp.summary;
      spStat.textContent = `${rec.gene}: rank ${rec.cerevisiaeRank}/165 · `
        + `across all ${s.loci} windows cerevisiae leads ${s.cerevisiaeFirst}`;
    }
  }

  // ---------------------------------------------------------------------------------------
  // 2. Epistasis — H·v for a chosen binding site
  // ---------------------------------------------------------------------------------------
  const epCanvas = $<HTMLCanvasElement>('[data-fr-epistasis]');
  const epPick = $<HTMLSelectElement>('[data-fr-epistasis-pick]');
  const epStat = $('[data-fr-epistasis-stat]');
  let hess: { spec: HessPack; plane: Float32Array } | null = null;

  function drawEpistasis(): void {
    if (!epCanvas || !hess) return;
    const i = Math.max(0, Number(epPick?.value ?? 0));
    const site = hess.spec.sites[i];
    if (!site) return;
    const H = 150;
    const ctx = fit(epCanvas, H);
    if (!ctx) return;
    const w = Math.max(1, Math.round(epCanvas.clientWidth));
    const pad = { l: 8, r: 8, t: 16, b: 20 };
    const inner = w - pad.l - pad.r;
    const plot = H - pad.t - pad.b;
    const row = hess.plane.subarray(i * SEQ_LEN, (i + 1) * SEQ_LEN);
    let m = 0;
    for (let k = 0; k < row.length; k += 1) m = Math.max(m, Math.abs(row[k]));
    const t = Math.max(m / 400, 1e-12);
    const frac = (v: number) => Math.sign(v) * (Math.log1p(Math.abs(v) / t) / Math.log1p(m / t));
    const mid = pad.t + plot / 2;

    ctx.strokeStyle = css(host, '--color-rule', '#d8d8d8');
    ctx.beginPath(); ctx.moveTo(pad.l, mid + 0.5); ctx.lineTo(pad.l + inner, mid + 0.5); ctx.stroke();
    // the anchoring motif, behind the data
    ctx.fillStyle = css(host, '--gb-roi', '#b8860b');
    ctx.globalAlpha = 0.18;
    ctx.fillRect(pad.l + (site.start / SEQ_LEN) * inner, pad.t,
      Math.max(2, ((site.end - site.start) / SEQ_LEN) * inner), plot);
    ctx.globalAlpha = 1;

    ctx.fillStyle = css(host, '--color-accent', '#3d6ea8');
    const step = SEQ_LEN / inner;
    for (let x = 0; x < inner; x += 1) {
      let peak = 0;
      for (let k = Math.floor(x * step); k < Math.floor((x + 1) * step); k += 1) {
        if (Math.abs(row[k]) > Math.abs(peak)) peak = row[k];
      }
      if (!peak) continue;
      const y = mid - frac(peak) * (plot / 2);
      ctx.fillRect(pad.l + x, Math.min(mid, y), 1, Math.max(1, Math.abs(mid - y)));
    }
    ctx.fillStyle = css(host, '--color-muted', '#6b7280');
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(`H·v for ${site.name} at ${site.start}–${site.end} bp — every base that changes `
      + 'this site’s own sensitivity', pad.l, H - 5);
    epCanvas.dataset.frEpistasis = `${site.name}:${site.start}`;

    if (epStat) {
      const h = (epistasisData as { helical: { ratio: number; verdict: string } }).helical;
      epStat.textContent = `peak |H·v| ${site.peak.toExponential(2)} · symmetry residual `
        + `${hess.spec.symmetryResidual.toExponential(1)} · helical phasing ${h.verdict} `
        + `(ratio ${h.ratio.toFixed(3)})`;
    }
  }

  async function loadEpistasis(): Promise<void> {
    hess = await loadPack<HessPack>(locus, 'hess');
    if (!epPick) return;
    epPick.replaceChildren();
    if (!hess) {
      epPick.disabled = true;
      if (epStat) epStat.textContent = 'no ChIP-supported sites in this window';
      if (epCanvas) { const c = fit(epCanvas, 150); c?.clearRect(0, 0, epCanvas.width, epCanvas.height); }
      return;
    }
    epPick.disabled = false;
    // Strongest interaction first: that is the site worth looking at, and it makes the default
    // view the informative one rather than whichever site happens to come first in the window.
    const idx = hess.spec.sites.map((s, i) => i).sort(
      (a, b) => hess!.spec.sites[b].peak - hess!.spec.sites[a].peak);
    for (const i of idx) {
      const s = hess.spec.sites[i];
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `${s.name} · ${s.start}–${s.end} · ${s.evidence ?? '—'}`;
      epPick.append(o);
    }
    epPick.value = String(idx[0]);
    drawEpistasis();
  }

  // ---------------------------------------------------------------------------------------
  // 3. Kinetics — early vs late drivers, per regulator
  // ---------------------------------------------------------------------------------------
  const kinBox = $('[data-fr-kinetics]');
  const kinStat = $('[data-fr-kinetics-stat]');

  function drawKinetics(): void {
    if (!kinBox) return;
    const rec = (kin.loci as Record<string, { gene: string; pairs: { reg: string; r: number; overlap: number; early: number; late: number }[] }>)[locus];
    kinBox.replaceChildren();
    if (!rec) return;
    const table = document.createElement('table');
    table.className = 'gb-stats';
    const head = document.createElement('tr');
    for (const h of ['regulator', 'early → late', 'r', 'top 500 shared']) {
      const th = document.createElement('th'); th.textContent = h; head.appendChild(th);
    }
    table.appendChild(head);
    for (const p of rec.pairs.slice(0, 8)) {
      const tr = document.createElement('tr');
      const cell = (txt: string, cls?: string) => {
        const td = document.createElement('td'); td.textContent = txt;
        if (cls) td.className = cls; tr.appendChild(td);
      };
      cell(p.reg);
      cell(`T${p.early} → T${p.late}`);
      cell(p.r.toFixed(3), p.r < 0.9 ? 'is-high' : '');
      cell(`${(p.overlap * 100).toFixed(0)}%`);
      table.appendChild(tr);
    }
    const wrap = document.createElement('div');
    wrap.className = 'gb-stats__scroll';
    wrap.appendChild(table);
    kinBox.appendChild(wrap);
    kinBox.dataset.frKinetics = String(rec.pairs.length);
    if (kinStat) {
      const worst = rec.pairs[0];
      kinStat.textContent = `${rec.gene}: ${worst.reg} moves most (r ${worst.r.toFixed(3)}) · `
        + `across every window the median is ${kin.median} and the floor ${kin.min}`;
    }
  }

  // ---------------------------------------------------------------------------------------
  // 4. Attention-head specialisation
  // ---------------------------------------------------------------------------------------
  const headsCv = $<HTMLCanvasElement>('[data-fr-heads]');
  const headsStat = $('[data-fr-heads-stat]');

  function drawHeads(): void {
    if (!headsCv) return;
    const hd = headsData as unknown as {
      heads: number;
      classes: { cls: string; meanCoverage: number; ceiling: number | null;
                 byHead: number[]; best: number; bestEnrichment: number }[];
    };
    // Only the classes with something to say: a class every head reads at 1.0 is a row of
    // identical cells, and eight of those would bury the four that separate.
    const rows = hd.classes.filter((r) => r.bestEnrichment >= 1.1 || Math.min(...r.byHead) <= 0.9);
    const ROW = 20;
    const H = rows.length * ROW + 40;
    const ctx = fit(headsCv, H);
    if (!ctx) return;
    const w = Math.max(1, Math.round(headsCv.clientWidth));
    const ink = css(host, '--color-ink', '#1a1a1a');
    const muted = css(host, '--color-muted', '#6b7280');
    const up = css(host, '--color-accent', '#2563eb');
    const dn = css(host, '--vp-tfbs', '#dc2626');
    ctx.clearRect(0, 0, w, H);
    ctx.font = '10px system-ui, sans-serif';
    const lab = Math.min(112, Math.max(...rows.map((r) => ctx.measureText(r.cls).width)) + 8);
    const cell = Math.max(18, Math.min(72, (w - lab - 10) / hd.heads));
    const gridW = cell * hd.heads;
    ctx.textAlign = 'center';
    ctx.fillStyle = muted;
    for (let h = 0; h < hd.heads; h += 1) ctx.fillText(`h${h}`, lab + cell * (h + 0.5), 12);
    rows.forEach((r, i) => {
      const y = 20 + i * ROW;
      ctx.textAlign = 'right';
      ctx.fillStyle = ink;
      ctx.fillText(r.cls, lab - 5, y + ROW / 2 + 2);
      r.byHead.forEach((v, h) => {
        // Diverging around 1.0, which is "this head reads the class no more than its share of the
        // sequence". A sequential ramp would draw 0.7 and 1.0 as merely different amounts of ink.
        const d = Math.max(-1, Math.min(1, (v - 1) / 0.9));
        ctx.fillStyle = d >= 0 ? up : dn;
        ctx.globalAlpha = Math.abs(d) * 0.85;
        ctx.fillRect(lab + cell * h + 1, y + 2, cell - 2, ROW - 5);
        ctx.globalAlpha = 1;
        ctx.fillStyle = Math.abs(d) > 0.55 ? css(host, '--color-bg', '#fff') : muted;
        ctx.textAlign = 'center';
        ctx.fillText(v.toFixed(2), lab + cell * (h + 0.5), y + ROW / 2 + 2);
      });
    });
    ctx.fillStyle = muted;
    ctx.textAlign = 'center';
    caption(ctx, [
      'attention mass on each class against a circular-shift null · 1.00 = no preference',
      'vs a circular-shift null · 1.00 = no preference',
      '1.00 = no preference',
    ], lab + gridW / 2, H - 6, gridW + lab);
    if (headsStat) {
      const best = rows.reduce((a, b) => (b.bestEnrichment > a.bestEnrichment ? b : a));
      headsStat.textContent = `${hd.heads} heads · strongest is ${best.cls} on head `
        + `${best.best} at ${best.bestEnrichment.toFixed(2)}×`
        + (best.ceiling ? ` of ${best.ceiling.toFixed(2)}× possible` : '');
    }
  }

  // ---------------------------------------------------------------------------------------
  // 5. Natural variation
  // ---------------------------------------------------------------------------------------
  const varCv = $<HTMLCanvasElement>('[data-fr-variation]');

  function drawVariation(): void {
    if (!varCv) return;
    const vd = variationData as unknown as {
      classes: Record<string, { n: number; medianRatio: number; fractionBelow1: number;
                                signTestZ: number }>;
    };
    const rows = Object.entries(vd.classes);
    const ROW = 34;
    const H = rows.length * ROW + 54;
    const ctx = fit(varCv, H);
    if (!ctx) return;
    const w = Math.max(1, Math.round(varCv.clientWidth));
    const ink = css(host, '--color-ink', '#1a1a1a');
    const muted = css(host, '--color-muted', '#6b7280');
    const rule = css(host, '--color-rule', '#e5e7eb');
    const acc = css(host, '--color-accent', '#2563eb');
    ctx.clearRect(0, 0, w, H);
    ctx.font = '10px system-ui, sans-serif';
    const lab = Math.min(110, Math.max(...rows.map(([k]) => ctx.measureText(k.replace('variant_', '')).width)) + 10);
    const pad = { l: lab, r: 58, t: 24, b: 26 };
    const inner = w - pad.l - pad.r;
    // Centred on 50%, because the design is paired: under neutrality the observed allele is the
    // milder one exactly half the time, so 50% is the null and the deviation is the finding.
    const span = 0.12;
    const X = (f: number) => pad.l + inner * (0.5 + Math.max(-1, Math.min(1, (f - 0.5) / span)) / 2);
    ctx.strokeStyle = rule;
    ctx.beginPath(); ctx.moveTo(X(0.5), pad.t - 4); ctx.lineTo(X(0.5), H - pad.b); ctx.stroke();
    rows.forEach(([k, v], i) => {
      const y = pad.t + i * ROW;
      ctx.fillStyle = ink; ctx.textAlign = 'right';
      ctx.fillText(k.replace('variant_', ''), pad.l - 6, y + ROW / 2);
      ctx.fillStyle = acc;
      ctx.fillRect(Math.min(X(0.5), X(v.fractionBelow1)), y + 6,
        Math.abs(X(v.fractionBelow1) - X(0.5)), ROW - 18);
      ctx.fillStyle = muted; ctx.textAlign = 'left';
      ctx.fillText(`${(v.fractionBelow1 * 100).toFixed(1)}%  z ${v.signTestZ.toFixed(1)}`,
        X(v.fractionBelow1) + 6, y + ROW / 2);
      ctx.fillText(`n = ${v.n.toLocaleString()}`, pad.l + 4, y + ROW - 4);
    });
    ctx.fillStyle = muted; ctx.textAlign = 'center';
    ctx.fillText('50% — no selection', X(0.5), pad.t - 6);
    caption(ctx, [
      'how often the allele that actually segregates is the milder of the three at that base',
      'how often the observed allele is the milder one',
      'observed allele milder',
    ], pad.l + inner / 2, H - 8, inner + pad.r);
  }

    // ---------------------------------------------------------------------------------------
  function setLocus(id: string): void {
    if (id === locus) return;
    locus = id;
    drawSpecies();
    drawKinetics();
    void loadEpistasis();
  }

  epPick?.addEventListener('change', drawEpistasis);
  document.addEventListener('khc:gb-view', (e) => {
    const d = (e as CustomEvent).detail as { locus: string | null };
    if (d.locus && d.locus in sp.loci) setLocus(d.locus);
  });
  // A canvas that reads CSS custom properties must repaint when the theme changes; this site
  // ships six themes and `css()` falls back to the light palette.
  document.addEventListener('khc:theme-change', () => {
    drawSpecies(); drawEpistasis(); drawHeads(); drawVariation();
  });
  let resizeT = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeT);
    resizeT = window.setTimeout(() => {
      drawSpecies(); drawEpistasis(); drawHeads(); drawVariation();
    }, 150);
  });

  drawSpecies();
  drawKinetics();
  drawHeads();
  drawVariation();
  void loadEpistasis();
  host.dataset.frontierReady = '1';
}

function mount(): void {
  document.querySelectorAll<HTMLElement>('[data-shorkie-frontier]').forEach(initShorkieFrontier);
}
document.addEventListener('astro:page-load', mount);
if (document.readyState !== 'loading') mount();
else document.addEventListener('DOMContentLoaded', mount);
