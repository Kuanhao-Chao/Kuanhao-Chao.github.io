/**
 * The constructive panels: what the model does to sequence that was BUILT rather than found.
 *
 * Everything else on this page perturbs a real yeast window and reports what changed. These three
 * start from nothing -- dinucleotide-shuffled background -- and add one thing at a time, which is
 * how a sufficiency claim is made rather than a necessity one.
 *
 *   1. Effective receptive field   how much of the 16,384 bp window the prediction actually uses
 *   2. Motif sufficiency (GIA)     what a consensus does alone, against its own scramble
 *   3. Spacing grammar             whether two motifs interact, and whether it depends on phasing
 *
 * Three-layer split as everywhere here: the numbers are computed offline by
 * `scripts/shorkie/make_receptive.py`, `make_gia.py` and `make_spacing.py`, this file is DOM and
 * canvas only, and it invents nothing.
 */

import receptiveData from '../data/shorkieReceptive.json';
import giaData from '../data/shorkieGia.json';
import spacingData from '../data/shorkieSpacing.json';
import positionData from '../data/shorkiePosition.json';

interface RecLocus {
  gene: string; full: number; radii: number[]; curve: number[];
  spread: number[]; convergenceBp: number | null;
}
interface GiaMotif {
  name: string; consensus: string; forward: number; reverse: number; scramble: number;
  marginOverScramble: number; marginZ: number | null; verdict: string; palindromic: boolean;
  distinctScrambles: number;
}
interface JoinRow {
  name: string; sites: number; necessity: number; sufficiency: number;
  z: number | null; quadrant: string;
}
interface SpacePair {
  label: string; a: string; b: string; separations: number[];
  interaction: Record<string, number[]>; helicalRatio: number | null;
  topPeriods: number[]; windowHarmonics: number[]; topPeriodsAllHarmonic: boolean;
  orientationMeans: Record<string, number>; maxInteraction: number; maxAtBp: number;
}

const css = (el: HTMLElement, name: string, fallback: string) =>
  getComputedStyle(el).getPropertyValue(name).trim() || fallback;

/** Fit a canvas to its box at device resolution. NO minimum width: a floor makes the backing store
 *  wider than the element, `width: 100%` scales it back, and every x is off by that ratio. */
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

/** The widest caption that fits, never a clipped one. A canvas has no `overflow` to report a
 *  caption running off the right edge -- it just renders as a different, shorter sentence. */
function caption(ctx: CanvasRenderingContext2D, tiers: string[], x: number, y: number, max: number) {
  for (const t of tiers) {
    if (ctx.measureText(t).width <= max) { ctx.fillText(t, x, y); return; }
  }
}

export function initShorkieConstructive(host: HTMLElement): void {
  if (host.dataset.consBound === '1') return;
  host.dataset.consBound = '1';
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => host.querySelector<T>(s);

  const rec = receptiveData as unknown as {
    radii: number[]; medianConvergenceBp: number; loci: Record<string, RecLocus>;
  };
  const gia = giaData as unknown as {
    motifs: Record<string, GiaMotif>;
    necessityJoin?: { medianNecessity: number; rows: JoinRow[] };
  };
  const space = spacingData as unknown as {
    helicalPeriodBp: number; medianHelicalRatio: number | null;
    pairs: Record<string, SpacePair>;
  };

  let locus = Object.keys(rec.loci)[0];

  // -----------------------------------------------------------------------------------------
  // 1. Effective receptive field
  // -----------------------------------------------------------------------------------------
  const recCanvas = $<HTMLCanvasElement>('[data-cn-receptive]');
  const recStat = $('[data-cn-receptive-stat]');

  function drawReceptive(): void {
    if (!recCanvas) return;
    const H = 210;
    const ctx = fit(recCanvas, H);
    if (!ctx) return;
    const w = Math.max(1, Math.round(recCanvas.clientWidth));
    const muted = css(host, '--color-muted', '#6b7280');
    const rule = css(host, '--color-rule', '#e5e7eb');
    const accent = css(host, '--color-accent', '#2563eb');
    const pad = { l: 34, r: 8, t: 14, b: 30 };
    const inner = w - pad.l - pad.r;
    const plot = H - pad.t - pad.b;
    ctx.clearRect(0, 0, w, H);

    const radii = rec.radii;
    // Radii double each step, so a log axis puts them evenly and shows the convergence knee.
    const X = (i: number) => pad.l + (inner * i) / Math.max(1, radii.length - 1);
    // Every locus is normalised to its OWN full-context prediction, which is what makes 23 genes
    // spanning 4.6 to 16.4 log2 units comparable on one axis.
    const Y = (f: number) => pad.t + plot - plot * Math.max(0, Math.min(1.15, f)) / 1.15;

    ctx.strokeStyle = rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, Y(1)); ctx.lineTo(w - pad.r, Y(1)); ctx.stroke();
    // The +-5% band is the convergence criterion drawn, not a decoration.
    ctx.fillStyle = accent; ctx.globalAlpha = 0.09;
    ctx.fillRect(pad.l, Y(1.05), inner, Y(0.95) - Y(1.05));
    ctx.globalAlpha = 1;

    for (const [id, r] of Object.entries(rec.loci)) {
      const cur = id === locus;
      ctx.strokeStyle = cur ? accent : muted;
      ctx.globalAlpha = cur ? 1 : 0.22;
      ctx.lineWidth = cur ? 2 : 1;
      ctx.beginPath();
      r.curve.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v / r.full)) : ctx.moveTo(X(i), Y(v / r.full))));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (const f of [0, 0.5, 1]) ctx.fillText(f === 1 ? 'full' : f.toFixed(1), pad.l - 5, Y(f) + 3);
    radii.forEach((r, i) => {
      if (i % 2 !== 0 && i !== radii.length - 1) return;
      ctx.textAlign = i === 0 ? 'left' : i === radii.length - 1 ? 'right' : 'center';
      ctx.fillText(r >= 1024 ? `${r / 1024}k` : String(r), X(i), H - 16);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = muted;
    caption(ctx, [
      'radius of real sequence kept (bp); everything outside is dinucleotide-shuffled',
      'radius of real sequence kept (bp), flanks shuffled',
      'radius kept (bp)',
    ], pad.l + inner / 2, H - 4, inner);
  }

  function statReceptive(): void {
    if (!recStat) return;
    const r = rec.loci[locus];
    if (!r) return;
    recStat.textContent = `${r.gene}: converges at ±${r.convergenceBp?.toLocaleString() ?? '>8,192'}`
      + ` bp of the ±8,192 available — median across the ${Object.keys(rec.loci).length} windows is`
      + ` ±${rec.medianConvergenceBp.toLocaleString()} bp.`;
  }

  // -----------------------------------------------------------------------------------------
  // 2. Motif sufficiency
  // -----------------------------------------------------------------------------------------
  const giaCanvas = $<HTMLCanvasElement>('[data-cn-gia]');

  function drawGia(): void {
    if (!giaCanvas) return;
    const rows = Object.values(gia.motifs)
      .filter((m) => m.distinctScrambles > 1)
      .sort((a, b) => b.forward - a.forward);
    const ROW = 17;
    const H = rows.length * ROW + 34;
    const ctx = fit(giaCanvas, H);
    if (!ctx) return;
    const w = Math.max(1, Math.round(giaCanvas.clientWidth));
    const ink = css(host, '--color-ink', '#1a1a1a');
    const muted = css(host, '--color-muted', '#6b7280');
    const rule = css(host, '--color-rule', '#e5e7eb');
    const up = css(host, '--vp-rna', '#2563eb');
    const dn = css(host, '--vp-tfbs', '#dc2626');
    // The label column is measured, never assumed: a name clipped to its first letters reads as a
    // different factor rather than as a truncation.
    ctx.font = '10px system-ui, sans-serif';
    const lab = Math.min(96, Math.max(...rows.map((r) => ctx.measureText(r.name).width)) + 8);
    const pad = { l: lab, r: 46, t: 14, b: 18 };
    const inner = w - pad.l - pad.r;
    ctx.clearRect(0, 0, w, H);
    const span = Math.max(...rows.map((r) => Math.abs(r.forward))) * 1.12 || 1;
    // A signed quantity grows both ways from a zero rule; filling from the left would draw
    // -0.14 and +0.14 as the same bar.
    const zero = pad.l + inner / 2;
    const X = (v: number) => zero + (inner / 2) * (v / span);

    ctx.strokeStyle = rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(zero, pad.t - 4); ctx.lineTo(zero, H - pad.b); ctx.stroke();

    rows.forEach((r, i) => {
      const y = pad.t + i * ROW;
      ctx.fillStyle = r.forward >= 0 ? up : dn;
      ctx.globalAlpha = r.verdict.startsWith('sufficient') ? 0.85 : 0.28;
      ctx.fillRect(Math.min(zero, X(r.forward)), y + 3, Math.abs(X(r.forward) - zero), ROW - 8);
      ctx.globalAlpha = 1;
      // The scramble is a MARK, not a second bar: it is the control the bar must beat, and drawn
      // as a bar it reads as a second measurement of equal standing.
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X(r.scramble), y + 2); ctx.lineTo(X(r.scramble), y + ROW - 4);
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = ink; ctx.textAlign = 'right';
      ctx.fillText(r.name, pad.l - 5, y + ROW / 2 + 2);
      ctx.fillStyle = muted; ctx.textAlign = 'left';
      ctx.fillText(r.verdict.startsWith('sufficient') ? `z ${r.marginZ?.toFixed(1)}` : 'n.s.',
        w - pad.r + 4, y + ROW / 2 + 2);
    });
    ctx.fillStyle = muted; ctx.textAlign = 'center';
    caption(ctx, [
      '← represses    change in predicted expression vs empty background    activates →',
      '← represses     effect on a shuffled background     activates →',
      '← represses   ·   activates →',
    ], zero, H - 5, inner + pad.r);
  }

  // -----------------------------------------------------------------------------------------
  // 3. Necessity against sufficiency
  // -----------------------------------------------------------------------------------------
  const joinCanvas = $<HTMLCanvasElement>('[data-cn-join]');

  function drawJoin(): void {
    if (!joinCanvas || !gia.necessityJoin) return;
    const rows = gia.necessityJoin.rows;
    const H = 230;
    const ctx = fit(joinCanvas, H);
    if (!ctx) return;
    const w = Math.max(1, Math.round(joinCanvas.clientWidth));
    const ink = css(host, '--color-ink', '#1a1a1a');
    const muted = css(host, '--color-muted', '#6b7280');
    const rule = css(host, '--color-rule', '#e5e7eb');
    const accent = css(host, '--color-accent', '#2563eb');
    const pad = { l: 44, r: 10, t: 16, b: 34 };
    const inner = w - pad.l - pad.r;
    const plot = H - pad.t - pad.b;
    ctx.clearRect(0, 0, w, H);
    const nx = Math.max(...rows.map((r) => r.necessity)) * 1.15 || 1;
    const sy = Math.max(...rows.map((r) => Math.abs(r.sufficiency))) * 1.2 || 1;
    const X = (v: number) => pad.l + (inner * v) / nx;
    const Y = (v: number) => pad.t + plot / 2 - (plot / 2) * (v / sy);

    ctx.strokeStyle = rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(w - pad.r, Y(0)); ctx.stroke();
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(X(gia.necessityJoin.medianNecessity), pad.t);
    ctx.lineTo(X(gia.necessityJoin.medianNecessity), pad.t + plot);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '10px system-ui, sans-serif';
    // Below the plot, not above it: the page's sticky control bar covers roughly the top 120 px of
    // whatever is scrolled under it, so a label on a canvas's first rows is the one most often
    // hidden.
    ctx.fillStyle = muted; ctx.textAlign = 'center';
    ctx.fillText('median', X(gia.necessityJoin.medianNecessity), pad.t + plot + 12);

    for (const r of rows) {
      const x = X(r.necessity); const y = Y(r.sufficiency);
      const sig = r.quadrant.includes('and sufficient') || r.quadrant.startsWith('sufficient');
      ctx.fillStyle = sig ? accent : muted;
      ctx.beginPath(); ctx.arc(x, y, 4 + Math.min(3, r.sites / 8), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ink;
      ctx.textAlign = x > pad.l + inner * 0.72 ? 'right' : 'left';
      ctx.fillText(r.name, x + (ctx.textAlign === 'right' ? -8 : 8), y + 3);
    }
    ctx.fillStyle = muted; ctx.textAlign = 'left';
    ctx.fillText('activates ↑', pad.l + 2, pad.t + 8);
    ctx.fillText('represses ↓', pad.l + 2, pad.t + plot - 2);
    ctx.fillText('no effect', pad.l + 2, Y(0) - 4);
    // Sufficiency is the FILL, not the height: a filled marker cleared its own scramble, a hollow
    // one did not. Two of the hollow ones are the whole point of the panel.
    const lx = pad.l + inner - 118;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(lx, pad.t + plot - 6, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = muted;
    ctx.fillText('sufficient', lx + 8, pad.t + plot - 3);
    ctx.beginPath(); ctx.arc(lx + 62, pad.t + plot - 6, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillText('not', lx + 70, pad.t + plot - 3);
    ctx.textAlign = 'center';
    caption(ctx, [
      'necessary where it already sits (mean |logSED| when knocked out) →',
      'necessity: mean |logSED| when knocked out →',
      'necessity →',
    ], pad.l + inner / 2, H - 6, inner);
  }

  // -----------------------------------------------------------------------------------------
  // 4. Spacing grammar
  // -----------------------------------------------------------------------------------------
  const spCanvas = $<HTMLCanvasElement>('[data-cn-spacing]');
  const spPick = $<HTMLSelectElement>('[data-cn-spacing-pick]');
  const spStat = $('[data-cn-spacing-stat]');
  const ORIENT = ['FF', 'FR', 'RF', 'RR'];

  function currentPair(): SpacePair | null {
    const keys = Object.keys(space.pairs);
    const k = spPick?.value && keys.includes(spPick.value) ? spPick.value : keys[0];
    return space.pairs[k] ?? null;
  }

  function drawSpacing(): void {
    if (!spCanvas) return;
    const p = currentPair();
    if (!p) return;
    const H = 220;
    const ctx = fit(spCanvas, H);
    if (!ctx) return;
    const w = Math.max(1, Math.round(spCanvas.clientWidth));
    const muted = css(host, '--color-muted', '#6b7280');
    const rule = css(host, '--color-rule', '#e5e7eb');
    const pal = [css(host, '--color-accent', '#2563eb'), css(host, '--vp-tfbs', '#dc2626'),
      css(host, '--vp-reg', '#059669'), css(host, '--vp-element', '#a855f7')];
    // The legend is a right-hand margin column: dense annotation inside a plot area collides
    // with the data at some viewport or theme, every time.
    const pad = { l: 40, r: 42, t: 14, b: 32 };
    const inner = w - pad.l - pad.r;
    const plot = H - pad.t - pad.b;
    ctx.clearRect(0, 0, w, H);
    const seps = p.separations;
    const all = ORIENT.flatMap((o) => p.interaction[o] ?? []);
    const span = Math.max(...all.map(Math.abs)) * 1.1 || 1;
    // Linear in BASE PAIRS, not in index. The scan is 1 bp apart out to 64 and 5 bp apart beyond,
    // so an index-linear axis gives the fine half 69% of the width: the tick reading "50" lands at
    // mid-width when 50 bp is a quarter of the range, and -- fatally for this panel -- the 10.5 bp
    // helical rules come out unevenly spaced, which is the one reading it exists to support.
    const lo = seps[0]; const hi = seps[seps.length - 1];
    const X = (bp: number) => pad.l + (inner * (bp - lo)) / Math.max(1, hi - lo);
    const Y = (v: number) => pad.t + plot / 2 - (plot / 2) * (v / span);

    // Helical guides at every integer multiple of the period, so a reader can see for themselves
    // whether the curve has anything at those separations.
    // Dashed, and at full token strength: these are the guides a reader checks the curve against,
    // and at 0.8 alpha in the rule colour they were invisible against a dark background.
    ctx.strokeStyle = muted; ctx.globalAlpha = 0.35; ctx.setLineDash([2, 4]);
    for (let k = 1; k * space.helicalPeriodBp <= seps[seps.length - 1]; k += 1) {
      const d = k * space.helicalPeriodBp;
      if (d < lo) continue;
      ctx.beginPath(); ctx.moveTo(X(d), pad.t); ctx.lineTo(X(d), pad.t + plot); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.strokeStyle = rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(w - pad.r, Y(0)); ctx.stroke();

    ORIENT.forEach((o, k) => {
      const y = p.interaction[o];
      if (!y) return;
      ctx.strokeStyle = pal[k]; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      y.forEach((v, i) => (i ? ctx.lineTo(X(seps[i]), Y(v)) : ctx.moveTo(X(seps[i]), Y(v))));
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal[k]; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(o, w - pad.r + 5, pad.t + 10 + k * 13);
    });

    ctx.fillStyle = muted; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(`+${span.toFixed(2)}`, pad.l - 4, pad.t + 8);
    ctx.fillText('0', pad.l - 4, Y(0) + 3);
    ctx.fillText(`−${span.toFixed(2)}`, pad.l - 4, pad.t + plot);
    ctx.textAlign = 'center';
    // An axis tick centred on the endpoint is clipped mid-number, which reads as a different
    // coordinate rather than a cut-off one.
    seps.forEach((s, i) => {
      if (s % 50 !== 0 && i !== 0) return;
      ctx.textAlign = i === 0 ? 'left' : i === seps.length - 1 ? 'right' : 'center';
      ctx.fillText(String(s), X(s), H - 16);
    });
    ctx.textAlign = 'center';
    caption(ctx, [
      'separation between the two motifs (bp); grey rules mark multiples of 10.5 bp, one helical turn',
      'separation (bp); grey rules are multiples of 10.5 bp',
      'separation (bp)',
    ], pad.l + inner / 2, H - 4, inner);
  }

  function statSpacing(): void {
    if (!spStat) return;
    const p = currentPair();
    if (!p) return;
    spStat.textContent = `${p.a} × ${p.b}: strongest interaction ${p.maxInteraction.toFixed(4)}`
      + ` log₂ at ${p.maxAtBp} bp; in-phase / anti-phase ratio `
      + `${p.helicalRatio?.toFixed(3) ?? 'n/a'} (1.00 = no helical preference)`
      + (p.topPeriodsAllHarmonic
        ? '; every apparent period is an artefact of the scan window.'
        : `; apparent periods ${p.topPeriods.join(', ')} bp.`);
  }

  // -----------------------------------------------------------------------------------------
  // 5. Where does a motif work?
  // -----------------------------------------------------------------------------------------
  const posCv = $<HTMLCanvasElement>('[data-cn-position]');
  const posStat = $('[data-cn-position-stat]');

  function drawPosition(): void {
    if (!posCv) return;
    const pd = positionData as unknown as {
      motifs: Record<string, { name: string; profileEdges: number[]; profile: (number | null)[];
                               upstream500: number; inside500: number }>;
    };
    const entries = Object.entries(pd.motifs);
    const H = 230;
    const ctx = fit(posCv, H);
    if (!ctx) return;
    const w = Math.max(1, Math.round(posCv.clientWidth));
    const ink = css(host, '--color-ink', '#1a1a1a');
    const muted = css(host, '--color-muted', '#6b7280');
    const rule = css(host, '--color-rule', '#e5e7eb');
    const pal = [css(host, '--color-accent', '#2563eb'), css(host, '--vp-tfbs', '#dc2626'),
      css(host, '--vp-reg', '#059669'), css(host, '--vp-element', '#a855f7')];
    // Legend in a right-hand margin column: dense annotation inside a plot area collides with the
    // data at some viewport or theme, every time.
    const pad = { l: 44, r: 74, t: 14, b: 32 };
    const inner = w - pad.l - pad.r;
    const plot = H - pad.t - pad.b;
    ctx.clearRect(0, 0, w, H);
    const edges = entries[0][1].profileEdges;
    const lo = edges[0]; const hi = edges[edges.length - 1];
    const all = entries.flatMap(([, m]) => m.profile.filter((v): v is number => v != null));
    const span = Math.max(...all.map(Math.abs)) * 1.15 || 0.1;
    const X = (bp: number) => pad.l + (inner * (bp - lo)) / Math.max(1, hi - lo);
    const Y = (v: number) => pad.t + plot / 2 - (plot / 2) * (v / span);

    // The TSS, which is what every distance on this axis is measured from.
    ctx.strokeStyle = muted; ctx.globalAlpha = 0.45; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(X(0), pad.t); ctx.lineTo(X(0), pad.t + plot); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.strokeStyle = rule;
    ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(w - pad.r, Y(0)); ctx.stroke();

    ctx.font = '10px system-ui, sans-serif';
    entries.forEach(([, m], k) => {
      ctx.strokeStyle = pal[k % pal.length]; ctx.lineWidth = 1.6;
      ctx.beginPath();
      let started = false;
      m.profile.forEach((v, i) => {
        if (v == null) return;
        const x = X((edges[i] + edges[i + 1]) / 2);
        if (started) ctx.lineTo(x, Y(v)); else { ctx.moveTo(x, Y(v)); started = true; }
      });
      ctx.stroke();
      ctx.fillStyle = pal[k % pal.length]; ctx.textAlign = 'left';
      ctx.fillText(m.name, w - pad.r + 5, pad.t + 11 + k * 13);
    });

    ctx.fillStyle = muted; ctx.textAlign = 'right';
    ctx.fillText(`+${span.toFixed(2)}`, pad.l - 4, pad.t + 8);
    ctx.fillText('0', pad.l - 4, Y(0) + 3);
    ctx.fillText(`−${span.toFixed(2)}`, pad.l - 4, pad.t + plot);
    for (const bp of [-4000, -2000, 0, 2000, 4000]) {
      ctx.textAlign = bp === lo ? 'left' : bp === hi ? 'right' : 'center';
      ctx.fillText(bp === 0 ? 'TSS' : `${bp > 0 ? '+' : ''}${bp / 1000}k`, X(bp), H - 16);
    }
    ctx.textAlign = 'center';
    caption(ctx, [
      'distance from the transcription start site (bp), in the gene’s own direction',
      'distance from the TSS (bp), in the gene’s direction',
      'distance from the TSS (bp)',
    ], pad.l + inner / 2, H - 4, inner);
    if (posStat) {
      const best = entries.reduce((a, b) => (b[1].upstream500 > a[1].upstream500 ? b : a));
      posStat.textContent = `${best[1].name} is the strongest upstream: `
        + `${best[1].upstream500 >= 0 ? '+' : ''}${best[1].upstream500.toFixed(3)} log₂ in the `
        + `500 bp before the TSS against `
        + `${best[1].inside500 >= 0 ? '+' : ''}${best[1].inside500.toFixed(3)} inside the gene.`;
    }
  }

  function drawAll(): void {
    drawReceptive(); statReceptive(); drawGia(); drawJoin();
    drawSpacing(); statSpacing(); drawPosition();
  }

  spPick?.addEventListener('change', () => { drawSpacing(); statSpacing(); });
  document.addEventListener('khc:gb-view', (e) => {
    const d = (e as CustomEvent).detail as { locus: string | null };
    if (d.locus && d.locus in rec.loci && d.locus !== locus) {
      locus = d.locus; drawReceptive(); statReceptive();
    }
  });
  document.addEventListener('khc:theme-change', drawAll);
  let resizeT = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeT);
    resizeT = window.setTimeout(drawAll, 150);
  });

  drawAll();
  host.dataset.consReady = '1';
}

function mount(): void {
  document.querySelectorAll<HTMLElement>('[data-shorkie-constructive]')
    .forEach(initShorkieConstructive);
}
document.addEventListener('astro:page-load', mount);
if (document.readyState !== 'loading') mount();
else document.addEventListener('DOMContentLoaded', mount);
