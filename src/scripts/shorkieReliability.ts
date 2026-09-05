/**
 * Act 9 — the two panels that need a drawing rather than a table.
 *
 * The fold ledger and the grammar calibration both make a comparison that a number cannot carry:
 * one is a paired contrast across 23 loci, the other is a scatter whose shape decides whether a
 * correlation means anything. The method scorecard and the reference menu are genuinely tabular
 * and are rendered as real tables in the page, where a screen reader can walk them.
 *
 * Nothing here runs a model. Every value was computed offline by `make_folds.py` and
 * `make_grammar.py` and ships in `src/data/`.
 */
import foldsData from '../data/shorkieFolds.json';
import grammarData from '../data/shorkieGrammar.json';

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
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** The widest caption that fits. A clipped canvas caption reads as a different sentence. */
function caption(ctx: CanvasRenderingContext2D, tiers: string[], x: number, y: number, max: number) {
  for (const t of tiers) {
    if (ctx.measureText(t).width <= max) { ctx.fillText(t, x, y); return; }
  }
}

type Folds = typeof foldsData;
/** Declared, not inferred. `hess` is null whenever the generator ran with `--no-hessian`, so
 *  `typeof grammarData` types it from whichever run happens to be on disk -- which made the same
 *  file compile or not compile depending on a CLI flag used hours earlier. */
interface GrammarPoint { locus: string; resid: number; hess: number | null; sep: number; bothStrong: boolean; }
type Grammar = Omit<typeof grammarData, 'scatter'> & { scatter: GrammarPoint[] };

export function initShorkieReliability(host: HTMLElement): void {
  if (host.dataset.rlBound === '1') return;
  host.dataset.rlBound = '1';

  const foldsCv = host.querySelector<HTMLCanvasElement>('[data-rl-folds]');
  const grammarCv = host.querySelector<HTMLCanvasElement>('[data-rl-grammar]');
  const foldsStat = host.querySelector<HTMLElement>('[data-rl-folds-stat]');
  const grammarStat = host.querySelector<HTMLElement>('[data-rl-grammar-stat]');

  function drawFolds(): void {
    if (!foldsCv) return;
    const fd = foldsData as unknown as Folds;
    const rows = fd.perLocus ?? [];
    if (!rows.length) return;
    const ROW = 16;
    const H = rows.length * ROW + 54;
    const ctx = fit(foldsCv, H);
    if (!ctx) return;
    const w = Math.max(1, Math.round(foldsCv.clientWidth));
    const ink = css(host, '--color-ink', '#1a1a1a');
    const muted = css(host, '--color-muted', '#6b7280');
    const strong = css(host, '--color-accent', '#2563eb');
    const ctl = css(host, '--color-muted', '#9ca3af');
    ctx.clearRect(0, 0, w, H);
    ctx.font = '10px system-ui, sans-serif';

    const lab = Math.min(88, Math.max(...rows.map((r) => ctx.measureText(r.id).width)) + 8);
    const right = 46;
    const plot = Math.max(40, w - lab - right);
    const x0 = lab;

    // Gridlines at 0/25/50/75/100%: without them a paired bar is a length with no scale.
    ctx.strokeStyle = muted;
    ctx.globalAlpha = 0.18;
    for (let g = 0; g <= 4; g += 1) {
      const x = x0 + (plot * g) / 4;
      ctx.beginPath(); ctx.moveTo(x, 16); ctx.lineTo(x, H - 22); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = muted;
    ctx.textAlign = 'center';
    for (let g = 0; g <= 4; g += 1) ctx.fillText(`${g * 25}%`, x0 + (plot * g) / 4, 12);
    // A key on the drawing itself. The caption below says the same thing in words, but a reader
    // scanning the rows needs to know which mark is which without leaving them.
    ctx.fillStyle = strong; ctx.globalAlpha = 0.85;
    ctx.fillRect(2, 5, 14, 5); ctx.globalAlpha = 1;
    ctx.strokeStyle = ctl; ctx.lineWidth = 1;
    ctx.strokeRect(2.5, 12.5, 13, 4);

    rows.forEach((r, i) => {
      const y = 18 + i * ROW;
      ctx.textAlign = 'right';
      ctx.fillStyle = ink;
      ctx.fillText(r.id, lab - 5, y + ROW / 2 + 1);
      // Two bars from a common zero. The control is the whole point: "how many survive" needs
      // something to survive against, and a distance-to-TSS matched base is that something.
      //
      // FILLED against OUTLINED, not two fills at different alpha. Two fills of the same hue read
      // as one thick bar with a lighter half at a glance -- verified by screenshotting it -- and
      // the whole panel is the contrast between them. Fill versus outline survives both themes and
      // any accent colour the site ships.
      ctx.fillStyle = strong;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x0, y + 1, Math.max(0, plot * r.stableTop), 5);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ctl;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y + 8.5, Math.max(1, plot * r.stableControl), 4);
      ctx.textAlign = 'left';
      ctx.fillStyle = muted;
      ctx.fillText(`${(r.stableTop * 100).toFixed(0)}/${(r.stableControl * 100).toFixed(0)}`,
                   x0 + plot + 5, y + ROW / 2 + 1);
    });

    ctx.textAlign = 'left';
    ctx.fillStyle = muted;
    caption(ctx, [
      'Filled: strongest bases whose sign and interval survive f1–f7. Outlined: distance-to-TSS matched controls.',
      'Filled: strongest bases surviving f1–f7. Outlined: matched controls.',
      'filled: strong bases · outlined: matched controls',
      'filled: strong · outlined: control',
      'strong vs control',
    ], x0, H - 8, plot + right - 4);
    if (foldsStat) {
      foldsStat.textContent =
        `${fd.evidenceFolds.length} evidence folds (f0 selected the panel and is excluded) · `
        + `${(fd.stableFractionTop * 100).toFixed(1)}% of strong bases fold-stable against `
        + `${(fd.stableFractionControl * 100).toFixed(1)}% of matched controls · `
        + `strand deviation is ${fd.strandOverFold ?? '—'}× the cross-fold sd`;
    }
  }

  function drawGrammar(): void {
    if (!grammarCv) return;
    const gd = grammarData as unknown as Grammar;
    const pts = (gd.scatter ?? [])
      .filter((p): p is GrammarPoint & { hess: number } => typeof p.hess === 'number');
    const H = 240;
    const ctx = fit(grammarCv, H);
    if (!ctx) return;
    const w = Math.max(1, Math.round(grammarCv.clientWidth));
    const ink = css(host, '--color-ink', '#1a1a1a');
    const muted = css(host, '--color-muted', '#6b7280');
    const strong = css(host, '--color-accent', '#2563eb');
    ctx.clearRect(0, 0, w, H);
    ctx.font = '10px system-ui, sans-serif';
    const L = 52; const R = 10; const T = 14; const B = 34;
    const pw = Math.max(20, w - L - R); const ph = H - T - B;

    // The stat line is written FIRST, so it survives the early return below. A panel that draws a
    // "no data" notice and also leaves its readout blank looks like two failures instead of one,
    // and the readout is where the measured numbers live even when the scatter cannot be drawn.
    if (grammarStat) {
      const hc = gd.hessianCalibration;
      grammarStat.textContent =
        `${gd.pairsTotal.toLocaleString()} exact double substitutions over ${gd.loci} loci · `
        + `median |residual| is ${gd.medianResidualOverSingle}× a median single-base effect`
        + (hc.medianR === null || hc.medianR === undefined
          ? ' · no Hessian predictions in this pack'
          : ` · Hessian calibration r = ${hc.medianR} (range ${hc.minR} to ${hc.maxR})`);
    }
    if (!pts.length) {
      ctx.fillStyle = muted; ctx.textAlign = 'left';
      ctx.fillText('No Hessian predictions in this pack — regenerate with make_grammar.py.', L, T + 20);
      return;
    }
    // Percentile bounds, not min-max: a handful of extreme pairs squash every other point into a
    // corner, which is the same failure the browser's scatter already documents.
    const q = (a: number[], p: number) => {
      const s = [...a].sort((x, y) => x - y);
      return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
    };
    const xs = pts.map((p) => p.hess);
    const ys = pts.map((p) => p.resid);
    const xlo = q(xs, 0.02); const xhi = q(xs, 0.98);
    const ylo = q(ys, 0.02); const yhi = q(ys, 0.98);
    const sx = (v: number) => L + pw * ((v - xlo) / Math.max(1e-12, xhi - xlo));
    const sy = (v: number) => T + ph * (1 - (v - ylo) / Math.max(1e-12, yhi - ylo));

    ctx.strokeStyle = muted; ctx.globalAlpha = 0.3;
    ctx.strokeRect(L, T, pw, ph);
    // Zero rules, drawn only where the data actually crosses zero.
    ctx.globalAlpha = 0.45;
    if (xlo < 0 && xhi > 0) { ctx.beginPath(); ctx.moveTo(sx(0), T); ctx.lineTo(sx(0), T + ph); ctx.stroke(); }
    if (ylo < 0 && yhi > 0) { ctx.beginPath(); ctx.moveTo(L, sy(0)); ctx.lineTo(L + pw, sy(0)); ctx.stroke(); }
    ctx.globalAlpha = 1;

    pts.forEach((p) => {
      const x = sx(p.hess); const y = sy(p.resid);
      if (x < L - 2 || x > L + pw + 2 || y < T - 2 || y > T + ph + 2) return;
      ctx.fillStyle = p.bothStrong ? strong : muted;
      ctx.globalAlpha = p.bothStrong ? 0.75 : 0.4;
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = muted;
    ctx.textAlign = 'center';
    caption(ctx, [
      'Hessian-predicted interaction (second derivative at the reference)',
      'Hessian-predicted interaction',
      'Hessian prediction',
      'Hessian',
    ], L + pw / 2, H - 18, pw);
    caption(ctx, [
      'Filled: both positions among the locus’s strongest bases. Axes are p2–p98.',
      'Filled: both bases strong. Axes p2–p98.',
      'filled: both bases strong',
      'p2–p98',
    ], L + pw / 2, H - 6, pw);
    ctx.save();
    ctx.translate(12, T + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = ink;
    caption(ctx, ['measured residual (exact double edit)', 'measured residual', 'residual', 'resid'],
            0, 0, ph);
    ctx.restore();

  }

  drawFolds();
  drawGrammar();
  host.dataset.reliabilityReady = '1';

  // Canvases read CSS custom properties, so a theme change repaints or they keep the old palette.
  const onTheme = () => { drawFolds(); drawGrammar(); };
  document.addEventListener('khc:theme-change', () => { if (host.isConnected) onTheme(); });
  let t: number | undefined;
  let lastW = host.clientWidth;
  window.addEventListener('resize', () => {
    if (!host.isConnected || host.clientWidth === lastW) return;
    lastW = host.clientWidth;
    window.clearTimeout(t);
    t = window.setTimeout(onTheme, 120);
  });
}

function mount(): void {
  document.querySelectorAll<HTMLElement>('[data-shorkie-reliability]').forEach(initShorkieReliability);
}
document.addEventListener('astro:page-load', mount);
if (document.readyState !== 'loading') mount();
else document.addEventListener('DOMContentLoaded', mount);
