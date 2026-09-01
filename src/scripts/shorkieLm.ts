/**
 * The Shorkie_LM page controller.
 *
 * DOM and drawing only: every number it prints comes from `src/lib/shorkieLm.ts` or
 * `src/lib/shorkieModel.ts`, both of which are tested, so a panel cannot contradict the prose
 * beside it.
 *
 * Nothing here loads a model. The iterative masked pass covers every one of the 16,384 positions
 * and ships as a 4 x 16,384 PNG, so the page works instantly with no download -- which is why the
 * one thing it cannot do is score a sequence the reader edits. That trade is stated on the page.
 */

import {
  BASES, LOGO_GLYPHS, LOGO_COLOURS, LOGO_GLOBSCALE,
  ANNOTATION_CLASSES, motifTier, featureMask, poolCoverage, weightedEnrichment, packGeneRows,
  windowFraction, bpTicks,
  type Base, type AnnotationFeature,
} from '../lib/shorkieModel';
import {
  LM_SPEC, entropyBits, informationContent, constraintColumn, crossEntropyBits, regionConstraint,
  dequantizeRow, renormalise, homopolymerFraction, pca2,
} from '../lib/shorkieLm';
import loci from '../data/shorkieLoci.json';
import lmSummary from '../data/shorkieLmSummary.json';
import { drawGeneRows, type GeneTrackFeature } from './geneTrack';

const SEQ_LEN = LM_SPEC.seqLength;
const PLOT = { left: 46, right: 10 };
/** Fewest annotated bases inside a gene for a within-gene enrichment ratio to be worth printing. */
const MIN_REGION_BASES = 30;
/** Below this many features a cross-locus enrichment ratio is muted: it is a draw, not a measurement. */
const LOW_N_FEATURES = 10;
const LOCI = loci.loci as any[];

/**
 * bp -> x, the page's single horizontal coordinate.
 *
 * Every track on this page is stacked under every other, so a reader reads down a column expecting
 * one bp. The expression page shipped two closures that disagreed by up to 1,024 bp; one helper is
 * how that cannot happen here.
 */
function xOfBp(bp: number, width: number): number {
  return PLOT.left + (bp / SEQ_LEN) * (width - PLOT.left - PLOT.right);
}

interface RowSpec { rows: number; cols: number; space: 'linear' | 'log'; lo: number[]; hi: number[] }
interface MotifRow {
  name: string; start: number; end: number; evidence: string;
  reference: string; recalled: string; identity: number; meanRefProb: number;
}
interface LmMeta {
  gene: string; k: number;
  masked: RowSpec; unmasked: RowSpec; embed: RowSpec;
  motifs: MotifRow[];
  metrics: Record<string, number>;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}
function attr(node: Element, values: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(values)) node.setAttribute(k, String(v));
}
/** Built with createElement + textContent throughout: `audit:security` fails the bare
 *  markup-assignment token even inside a comment saying not to use it, and none of this
 *  page needs markup anyway. */
function svgText(x: number, y: number, value: string, cls: string, anchor = 'middle') {
  const t = el('text');
  attr(t, { x, y, class: cls, 'text-anchor': anchor });
  t.textContent = value;
  return t;
}
function clear(node: Element | null): void {
  while (node?.firstChild) node.removeChild(node.firstChild);
}

export function initShorkieLm(host: HTMLElement): { destroy: () => void } {
  const $ = <T extends Element>(sel: string) => host.querySelector<T>(sel);

  const icCanvas = $<HTMLCanvasElement>('[data-lm-ic]');
  const annCanvas = $<HTMLCanvasElement>('[data-lm-annotation]');
  const embedCanvas = $<HTMLCanvasElement>('[data-lm-embed]');
  const logoSvg = $<SVGSVGElement>('[data-lm-logo]');
  const panEl = $<HTMLInputElement>('[data-lm-pan]');
  const passEl = $<HTMLSelectElement>('[data-lm-pass]');
  const widthEl = $<HTMLSelectElement>('[data-lm-width]');
  const passesTable = $<HTMLTableElement>('[data-lm-passes]');
  const motifTable = $<HTMLTableElement>('[data-lm-motifs]');
  const enrichTable = $<HTMLTableElement>('[data-lm-enrichment]');
  const baseGrid = $<HTMLElement>('[data-lm-base]');
  const locusSelect = $<HTMLSelectElement>('[data-lm-pick-locus]');
  const regionSelect = $<HTMLSelectElement>('[data-lm-region]');
  const regionStat = $<HTMLElement>('[data-lm-region-stat]');

  let meta: LmMeta | null = null;
  let masked: Float64Array | null = null;      // [16384 x 4]
  let unmasked: Float64Array | null = null;
  let embed: Float64Array | null = null;       // [128 x 384]
  let annotations: AnnotationFeature[] = [];
  let locusIndex = 0;
  let logoWindow = { start: 7900, width: 150 };
  let selectedBase = -1;
  /** The gene the region stepper is on, by systematic name; null means the whole window. */
  let selectedGene: string | null = null;

  // Same defaults as the expression page: every lane on, and of the three binding-site tiers only
  // ChIP-supported. The conserved-only tier is ~8x larger and the PWM scan larger again -- 1.4 hits
  // a base -- so showing all three by default buries the genes under the weakest evidence.
  const annLanesOn: Record<string, boolean> = {
    gene: true, rna: true, element: true, tfbs: true, regulatory: true,
  };
  const motifTiersOn: Record<string, boolean> = {
    chip: true, conserved: false, pwm: false, paper: true,
  };

  /**
   * A record with no tier is not a binding-site claim (a gene, an ARS) and is governed only by its
   * lane. A record WITH one is governed by its tier: the three tiers are three different strengths
   * of evidence and must not be toggled together.
   */
  function visibleAnnotations(): AnnotationFeature[] {
    return annotations.filter((f) => {
      const info = ANNOTATION_CLASSES[f.cls];
      if (!info || !annLanesOn[info.lane]) return false;
      const tier = motifTier(f);
      return tier === null || motifTiersOn[tier];
    });
  }

  /** The selected region's gene model, or null when the selection is the whole window. */
  function selectedFeature(): GeneTrackFeature | null {
    if (!selectedGene) return null;
    return (LOCI[locusIndex].features as GeneTrackFeature[])
      .find((f) => f.name === selectedGene) ?? null;
  }

  const css = (name: string, fallback: string) =>
    getComputedStyle(host).getPropertyValue(name).trim() || fallback;

  // ---------------------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------------------
  async function loadPlane(url: string, spec: RowSpec): Promise<Float64Array | null> {
    const blob = await fetch(url).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
    if (!blob) return null;
    const bitmap = await createImageBitmap(blob);
    const cv = document.createElement('canvas');
    cv.width = spec.cols;
    cv.height = spec.rows;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    if (!cx) return null;
    cx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const px = cx.getImageData(0, 0, spec.cols, spec.rows).data;
    // Stored row-major as [rows x cols]; returned transposed to [cols x rows] so a position's
    // four probabilities are contiguous, which is how every consumer reads them.
    const out = new Float64Array(spec.rows * spec.cols);
    for (let r = 0; r < spec.rows; r += 1) {
      const row = new Uint8Array(spec.cols);
      for (let c = 0; c < spec.cols; c += 1) row[c] = px[(r * spec.cols + c) * 4];
      const vals = dequantizeRow(row, spec.lo[r], spec.hi[r], spec.space);
      for (let c = 0; c < spec.cols; c += 1) out[c * spec.rows + r] = vals[c];
    }
    return out;
  }

  async function load(index: number): Promise<void> {
    const id = LOCI[index].id;
    const base = `${import.meta.env.BASE_URL.replace(/\/$/, '')}`;
    const m: LmMeta | null = await fetch(`${base}/lm-data/${id}-lm.json`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!m) return;
    meta = m;
    [masked, unmasked, embed] = await Promise.all([
      loadPlane(`${base}/lm-data/${id}-masked.png`, m.masked),
      loadPlane(`${base}/lm-data/${id}-unmasked.png`, m.unmasked),
      loadPlane(`${base}/lm-data/${id}-embed.png`, m.embed),
    ]);
    const ann = await fetch(`${base}/vp-data/${id}-ann.json`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    annotations = ann?.features ?? [];
    host.dataset.lmLocus = id;
    renderAll();
  }

  /** The four probabilities at one position, renormalised after quantisation. */
  function at(plane: Float64Array | null, pos: number): Float64Array | null {
    if (!plane || pos < 0 || pos >= SEQ_LEN) return null;
    return renormalise(plane.subarray(pos * 4, pos * 4 + 4));
  }

  function activePlane(): Float64Array | null {
    return passEl?.value === 'unmasked' ? unmasked : masked;
  }

  // ---------------------------------------------------------------------------------------
  // Panels
  // ---------------------------------------------------------------------------------------
  function renderPasses(): void {
    if (!passesTable || !meta) return;
    clear(passesTable);
    const m = meta.metrics;
    const head = passesTable.createTHead().insertRow();
    for (const h of ['pass', 'what it is', 'argmax = reference', 'cross-entropy', 'is it a prediction?']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.append(th);
    }
    const body = passesTable.createTBody();
    const rows: [string, string, string, string, string][] = [
      ['unmasked', 'the model sees the base it scores',
        `${(m.unmaskedArgmax * 100).toFixed(1)}%`, `${m.unmaskedCrossEntropy.toFixed(3)} bits`,
        'no — it is copying its input'],
      [`iteratively masked (K=${meta.k})`, `${(100 / meta.k).toFixed(1)}% hidden per pass, matching the 15% it was trained with`,
        `${(m.maskedArgmax * 100).toFixed(1)}%`, `${m.maskedCrossEntropy.toFixed(3)} bits`,
        'yes — this is the number to quote'],
      ['chance', 'guessing uniformly at random', '25.0%', '2.000 bits', '—'],
    ];
    for (const r of rows) {
      const tr = body.insertRow();
      r.forEach((v, i) => {
        const td = tr.insertCell();
        td.textContent = v;
        if (i === 1 || i === 4) td.style.textAlign = 'left';
        if (i === 1 || i === 4) td.className = 'n';
      });
    }
    passesTable.dataset.lmPasses = '3';
    const stat = $<HTMLElement>('[data-lm-metrics]');
    if (stat) {
      stat.textContent = `${meta.gene} · perplexity ${m.maskedPerplexity.toFixed(3)} · `
        + `mean entropy ${m.meanEntropy.toFixed(3)} of 2 bits`;
    }
  }

  /** Information content across the whole window, min/max banded per pixel column. */
  function renderIc(): void {
    if (!icCanvas) return;
    const plane = activePlane();
    const cssW = icCanvas.clientWidth || 900;
    const cssH = 132;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    icCanvas.width = Math.round(cssW * dpr);
    icCanvas.height = Math.round(cssH * dpr);
    icCanvas.style.height = `${cssH}px`;
    const ctx = icCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const muted = css('--color-muted', '#6b7280');
    const accent = css('--vp-accent', '#3976a8');
    ctx.font = '9px system-ui, sans-serif';
    if (!plane) {
      ctx.fillStyle = muted;
      ctx.fillText('Loading…', PLOT.left, 20);
      return;
    }
    const top = 14;
    const h = cssH - top - 26;
    const inner = cssW - PLOT.left - PLOT.right;
    const y = (ic: number) => top + h - (Math.max(ic, 0) / 2) * h;

    // One pixel column covers many bases; draw the min-max band so a lone constrained base is not
    // averaged out of existence, with the mean over it.
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    for (let px = 0; px < inner; px += 1) {
      const a = Math.floor((px / inner) * SEQ_LEN);
      const b = Math.max(a + 1, Math.floor(((px + 1) / inner) * SEQ_LEN));
      let lo = Infinity;
      let hi = -Infinity;
      for (let p = a; p < b; p += 1) {
        const ic = informationContent(renormalise(plane.subarray(p * 4, p * 4 + 4)));
        if (ic < lo) lo = ic;
        if (ic > hi) hi = ic;
      }
      ctx.moveTo(PLOT.left + px + 0.5, y(hi));
      ctx.lineTo(PLOT.left + px + 0.5, y(lo));
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let px = 0; px < inner; px += 1) {
      const a = Math.floor((px / inner) * SEQ_LEN);
      const b = Math.max(a + 1, Math.floor(((px + 1) / inner) * SEQ_LEN));
      let s = 0;
      for (let p = a; p < b; p += 1) {
        s += informationContent(renormalise(plane.subarray(p * 4, p * 4 + 4)));
      }
      const yy = y(s / (b - a));
      if (px === 0) ctx.moveTo(PLOT.left + px, yy); else ctx.lineTo(PLOT.left + px, yy);
    }
    ctx.stroke();

    // The selected gene, behind the curve, so the span the numbers in the bar describe is visible
    // on the drawing. Drawn before the brush band and fainter, because the two are different
    // things: this is the region being measured, that is the window being zoomed.
    const selIc = selectedFeature();
    if (selIc) {
      ctx.fillStyle = css('--vp-orf', '#6f62a8');
      ctx.globalAlpha = 0.08;
      const gx = xOfBp(selIc.txStart, cssW);
      ctx.fillRect(gx, 0, Math.max(xOfBp(selIc.txEnd, cssW) - gx, 1), cssH);
      ctx.globalAlpha = 1;
    }

    // The brushed window, painted behind nothing -- it is a marker, not data.
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.12;
    const bx0 = PLOT.left + (logoWindow.start / SEQ_LEN) * inner;
    const bx1 = PLOT.left + ((logoWindow.start + logoWindow.width) / SEQ_LEN) * inner;
    ctx.fillRect(bx0, top, Math.max(bx1 - bx0, 2), h);
    ctx.globalAlpha = 1;

    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    for (const v of [0, 1, 2]) ctx.fillText(`${v}`, PLOT.left - 4, y(v) + 3);
    ctx.save();
    ctx.translate(11, top + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('bits', 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
    for (const bp of bpTicks(4000)) {
      ctx.textAlign = bp === 0 ? 'left' : bp >= SEQ_LEN ? 'right' : 'center';
      ctx.fillText(bp >= 1000 ? `${(bp / 1000).toFixed(1)}k` : `${bp}`,
        PLOT.left + (bp / SEQ_LEN) * inner, cssH - 12);
    }
    ctx.textAlign = 'left';
    // Tiers chosen by measureText, not a fixed string. A canvas caption has no `overflow` to report
    // and no element to inspect, so at 320px the single long form simply ran off the right edge and
    // rendered as "... iteratively maske" -- which reads as a typo rather than as a clipped line.
    const pass = passEl?.value === 'unmasked'
      ? 'unmasked pass' : `iteratively masked, K=${meta?.k ?? 7}`;
    const gene = meta?.gene ?? '';
    const caption = [
      `${gene} · information content, 2 − H(p) · ${pass}`
        + ' · band is min–max within each pixel column, line is the mean',
      `${gene} · information content, 2 − H(p) · ${pass}`,
      `${gene} · 2 − H(p) · ${pass}`,
      `${gene} · 2 − H(p)`,
    ].find((s) => PLOT.left + ctx.measureText(s).width <= cssW - PLOT.right) ?? gene;
    ctx.fillText(caption, PLOT.left, cssH - 2);
    icCanvas.dataset.lmIc = '1';
  }

  /**
   * The curated annotation, on the same axis, so constraint can be read against the biology.
   *
   * Genes go through `drawGeneRows` -- the SAME renderer the expression page uses -- rather than
   * being filled as one rectangle from txStart to txEnd. That is not a cosmetic difference: a
   * plain rectangle paints a solid bar over every intron, and eight of the fourteen windows have
   * one. The two pages would otherwise be making contradictory claims about the same coordinates.
   */
  function renderAnnotation(): void {
    if (!annCanvas) return;
    const locus = LOCI[locusIndex];
    const cssW = annCanvas.clientWidth || 900;
    const LANES: { id: string; label: string; colour: string }[] = [
      { id: 'rna', label: 'RNA', colour: css('--vp-rna', '#2f8f6f') },
      { id: 'element', label: 'elem', colour: css('--vp-element', '#a8762a') },
      { id: 'tfbs', label: 'TFBS', colour: css('--vp-tfbs', '#b4485f') },
      { id: 'regulatory', label: 'reg', colour: css('--vp-reg', '#4a7fb5') },
    ];
    const ROW = 9;
    const GENE_ROW = 11;

    const visible = visibleAnnotations();
    // Height is measured before drawing, because the canvas must be sized once: lanes vary from
    // window to window and a fixed height either clips the busy ones or leaves the sparse ones
    // floating in margin.
    const geneRows = annLanesOn.gene
      ? Math.max(...packGeneRows(locus.features as GeneTrackFeature[]), 0) + 1
      : 0;
    const laneRows = LANES.map((l) => {
      if (!annLanesOn[l.id]) return 0;
      const inLane = visible.filter((f) => ANNOTATION_CLASSES[f.cls]?.lane === l.id);
      if (!inLane.length) return 0;
      return Math.max(...packGeneRows(inLane.map((f) => ({ txStart: f.start, txEnd: f.end }))), 0) + 1;
    });
    const cssH = Math.max(
      geneRows * GENE_ROW + (geneRows ? 6 : 0)
      + laneRows.reduce((a, n) => a + (n ? n * ROW + 3 : 0), 0) + 6,
      20,
    );

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    annCanvas.width = Math.round(cssW * dpr);
    annCanvas.height = Math.round(cssH * dpr);
    annCanvas.style.height = `${cssH}px`;
    const ctx = annCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.font = '9px system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    const muted = css('--color-muted', '#6b7280');
    let y = 2;
    let drawn = 0;

    if (geneRows) {
      ctx.fillStyle = muted;
      ctx.textAlign = 'right';
      ctx.fillText('genes', PLOT.left - 4, y + 9);
      ctx.textAlign = 'left';
      const tally = drawGeneRows(ctx, {
        features: locus.features as GeneTrackFeature[],
        ownId: locus.id,
        ownLabel: locus.gene,
        width: cssW,
        top: y,
        rowH: GENE_ROW,
        expanded: true,
        xOfBp,
        colours: { orf: css('--vp-orf', '#6f62a8'), muted },
        highlight: selectedGene,
      });
      annCanvas.dataset.lmGeneTrack = JSON.stringify(tally);
      drawn += tally.features;
      y += geneRows * GENE_ROW + 6;
    } else {
      delete annCanvas.dataset.lmGeneTrack;
    }

    LANES.forEach((lane, li) => {
      if (!laneRows[li]) return;
      const inLane = visible.filter((f) => ANNOTATION_CLASSES[f.cls]?.lane === lane.id);
      const rows = packGeneRows(inLane.map((f) => ({ txStart: f.start, txEnd: f.end })));
      ctx.fillStyle = muted;
      ctx.textAlign = 'right';
      ctx.fillText(lane.label, PLOT.left - 4, y + ROW - 2);
      ctx.textAlign = 'left';
      inLane.forEach((f, i) => {
        const x0 = xOfBp(f.start, cssW);
        const x1 = Math.max(xOfBp(f.end, cssW), x0 + 1.2);
        const ry = y + rows[i] * ROW;
        const tier = motifTier(f);
        // Evidence is drawn, not merely recorded: ChIP-supported solid, conserved-only hollow, a
        // PWM hit a hairline. Three tiers that looked alike would be three claims shown as one.
        ctx.globalAlpha = tier === 'pwm' ? 0.4 : tier === 'conserved' ? 0.55 : 0.85;
        if (tier === 'conserved' || tier === 'pwm') {
          ctx.strokeStyle = lane.colour;
          ctx.lineWidth = 1;
          ctx.strokeRect(x0 + 0.5, ry + 1.5, Math.max(x1 - x0 - 1, 0.5), ROW - 4);
        } else {
          ctx.fillStyle = lane.colour;
          ctx.fillRect(x0, ry + 1, Math.max(x1 - x0, 1.2), ROW - 3);
        }
        // A clipped edge is not a real boundary; mark it so the window edge is never read as one.
        if (f.truncated) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = muted;
          ctx.fillRect(f.start <= 0 ? x0 : x1 - 2, ry + 1, 2, ROW - 3);
        }
        drawn += 1;
      });
      ctx.globalAlpha = 1;
      y += laneRows[li] * ROW + 3;
    });

    // The selected gene, banded across every lane, so the region the numbers describe is visible
    // on the drawing rather than only named in the bar above.
    const sel = selectedFeature();
    if (sel) {
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = css('--vp-fire', '#b0455a');
      const a = xOfBp(sel.txStart, cssW);
      ctx.fillRect(a, 0, Math.max(xOfBp(sel.txEnd, cssW) - a, 1), cssH);
      ctx.globalAlpha = 1;
    }

    annCanvas.dataset.lmAnnotation = String(drawn);
  }

  /** The constraint logo: p x IC, all four bases, ascending, on a fixed 0-2 bit axis. */
  function renderLogo(): void {
    if (!logoSvg) return;
    clear(logoSvg);
    const plane = activePlane();
    const W = 1000;
    const H = 190;
    attr(logoSvg, { viewBox: `0 0 ${W} ${H}` });
    if (!plane) {
      logoSvg.append(svgText(W / 2, H / 2, 'Loading…', 'vp-ax'));
      return;
    }
    const { start, width } = logoWindow;
    const seq = LOCI[locusIndex].sequence as string;
    const inner = W - PLOT.left - PLOT.right;
    const colW = inner / width;
    const top = 16;
    const plotH = H - top - 34;
    // A FIXED 0-2 bit axis, never auto-scaled: the whole point of information content is that a
    // column's height is comparable between positions, loci and models. Auto-scaling would make a
    // uniformly unconstrained window look as structured as a constrained one.
    const yOf = (bits: number) => top + plotH - (bits / 2) * plotH;

    for (const v of [0, 1, 2]) {
      const line = el('line');
      attr(line, { x1: PLOT.left, x2: W - PLOT.right, y1: yOf(v), y2: yOf(v),
                   stroke: 'currentColor', 'stroke-width': 0.5, opacity: v === 0 ? 0.45 : 0.15 });
      logoSvg.append(line);
      logoSvg.append(svgText(PLOT.left - 5, yOf(v) + 3, `${v}`, 'vp-ax', 'end'));
    }
    logoSvg.append(svgText(12, top + plotH / 2, 'bits', 'vp-ax', 'middle'));

    let letters = 0;
    for (let i = 0; i < width; i += 1) {
      const p = at(plane, start + i);
      if (!p) continue;
      let stack = 0;
      for (const { base, height } of constraintColumn(p)) {
        // The glyph is ONE EM TALL before scaling and the paper's per-letter x-offsets are already
        // baked into the outlines -- so the transform is translate-to-baseline then scale, with a
        // negative y to flip. Dividing by 1000 and re-applying the offsets (as a first attempt did)
        // draws 581 letters at a millionth of their size: present in the DOM, invisible on screen.
        const sy = (height / 2) * plotH * LOGO_GLOBSCALE;
        if (sy < 0.12) { stack += height; continue; }       // below a pixel at this scale
        const path = el('path');
        attr(path, {
          d: LOGO_GLYPHS[base as Base],
          fill: LOGO_COLOURS[base as Base],
          transform: `translate(${(PLOT.left + (i + 0.5) * colW).toFixed(3)} `
            + `${yOf(stack).toFixed(3)}) `
            + `scale(${(colW * LOGO_GLOBSCALE).toFixed(4)} ${(-sy).toFixed(4)})`,
        });
        logoSvg.append(path);
        stack += height;
        letters += 1;
      }
      // A click target per column, so any base can be interrogated.
      const hit = el('rect');
      attr(hit, { x: PLOT.left + i * colW, y: top, width: Math.max(colW, 1), height: plotH,
                  fill: 'transparent', 'data-pos': start + i });
      (hit as unknown as HTMLElement).style.cursor = 'pointer';
      hit.addEventListener('click', () => { selectedBase = start + i; renderBase(); renderLogo(); });
      logoSvg.append(hit);
      if (start + i === selectedBase) {
        const mark = el('rect');
        attr(mark, { x: PLOT.left + i * colW, y: top, width: Math.max(colW, 1), height: plotH,
                     fill: 'currentColor', opacity: 0.12 });
        logoSvg.append(mark);
      }
    }

    const locus = LOCI[locusIndex];
    const step = Math.max(10, Math.round(width / 8 / 10) * 10);
    for (let k = 0; k <= width; k += step) {
      const anchor = k === 0 ? 'start' : k + step > width ? 'end' : 'middle';
      logoSvg.append(svgText(PLOT.left + k * colW, H - 14,
        (locus.start + start + k).toLocaleString(), 'vp-ax', anchor));
    }
    logoSvg.append(svgText(PLOT.left, H - 2,
      `${locus.gene} · bp ${start.toLocaleString()}–${(start + width).toLocaleString()} of the window`
      + ` · ${passEl?.value === 'unmasked' ? 'unmasked' : 'iteratively masked'}`
      + ' · height = p × (2 − H), click a column',
      'vp-ax vp-caption', 'start'));
    logoSvg.dataset.letters = String(letters);
    logoSvg.dataset.window = `${start}-${start + width}`;
    const stat = $<HTMLElement>('[data-lm-logo-stat]');
    if (stat) {
      let sum = 0;
      for (let i = 0; i < width; i += 1) {
        const p = at(plane, start + i);
        if (p) sum += informationContent(p);
      }
      stat.textContent = `mean ${(sum / width).toFixed(3)} bits over ${width} bp`;
    }
  }

  /** One position's distribution, as a labelled bar per base. */
  function renderBase(): void {
    if (!baseGrid) return;
    clear(baseGrid);
    const note = $<HTMLElement>('[data-lm-base-note]');
    const stat = $<HTMLElement>('[data-lm-base-stat]');
    const p = at(activePlane(), selectedBase);
    if (!p) {
      const hint = document.createElement('p');
      hint.className = 'vp-notes';
      hint.style.margin = '0';
      hint.textContent = 'Click a column in the logo above.';
      baseGrid.append(hint);
      if (stat) stat.textContent = '';
      if (note) note.textContent = '';
      delete baseGrid.dataset.lmBase;
      return;
    }
    const seq = LOCI[locusIndex].sequence as string;
    const ref = (seq[selectedBase] ?? 'N').toUpperCase();
    const accent = css('--vp-accent', '#3976a8');
    const order = BASES.map((b, i) => ({ b, v: p[i] })).sort((a, b) => b.v - a.v);
    for (const { b, v } of order) {
      const row = document.createElement('div');
      row.className = 'vp-baserow';
      const name = document.createElement('span');
      // The logo's own colours, inline: the `.vp-base-*` classes are scoped to `.vp-svg` and would
      // silently not apply to a plain span.
      name.style.color = LOGO_COLOURS[b as Base];
      name.style.fontWeight = '700';
      name.textContent = b + (b === ref ? ' ·' : '');
      const bar = document.createElement('span');
      bar.className = 'vp-basebar';
      bar.style.width = `${Math.max(v * 100, 0.6)}%`;
      bar.style.background = b === ref ? accent : 'currentColor';
      bar.style.opacity = b === ref ? '0.85' : '0.3';
      const val = document.createElement('span');
      val.className = 'n';
      val.textContent = v.toFixed(4);
      row.append(name, bar, val);
      baseGrid.append(row);
    }
    const ic = informationContent(p);
    const ce = crossEntropyBits(p, ref);
    if (stat) {
      stat.textContent = `${LOCI[locusIndex].chrom}:`
        + `${(LOCI[locusIndex].start + selectedBase).toLocaleString()} · reference ${ref}`;
    }
    if (note) {
      const top = order[0];
      note.textContent =
        `The model's most likely base here is ${top.b} at ${(top.v * 100).toFixed(1)}%; the base `
        + `actually there is ${ref} at ${(p[BASES.indexOf(ref as Base)] * 100).toFixed(1)}%. `
        + `Information content ${ic.toFixed(3)} of 2 bits`
        + (ce === null ? '.' : `, cross-entropy ${ce.toFixed(3)} bits.`)
        + (top.b === ref
          ? ' The model agrees with the genome here.'
          : ' The model disagrees with the genome here — which is common and is not an error: '
            + 'at 43% argmax accuracy it disagrees at most positions.');
    }
    baseGrid.dataset.lmBase = String(selectedBase);
  }

  function renderMotifs(): void {
    if (!motifTable || !meta) return;
    clear(motifTable);
    const verdict = $<HTMLElement>('[data-lm-motif-verdict]');
    const stat = $<HTMLElement>('[data-lm-motif-stat]');
    const floor = meta.metrics.compositionFloor ?? 0;
    const sites = meta.motifs ?? [];
    if (!sites.length) {
      const c = motifTable.insertRow().insertCell();
      c.className = 'n';
      c.textContent = 'No ChIP-supported binding sites in this window.';
      delete motifTable.dataset.lmMotifs;
      if (stat) stat.textContent = '';
      if (verdict) verdict.textContent = '';
      return;
    }
    const head = motifTable.createTHead().insertRow();
    for (const h of ['site', 'reference', 'what the LM put back', 'identity', 'one base?']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.append(th);
    }
    const body = motifTable.createTBody();
    const CAP = 10;
    for (const s of sites.slice(0, CAP)) {
      const tr = body.insertRow();
      const n = tr.insertCell();
      n.textContent = s.name;
      n.style.textAlign = 'left';
      const r = tr.insertCell();
      r.className = 'mono';
      r.textContent = s.reference;
      const g = tr.insertCell();
      g.className = 'mono';
      g.textContent = s.recalled;
      const id = tr.insertCell();
      id.textContent = `${(s.identity * 100).toFixed(0)}%`;
      // Against the floor, never against zero: a promoter that is 60% A/T rewards a constant-A
      // guess, so an unanchored identity has no scale.
      id.style.color = s.identity > floor ? '' : css('--color-muted', '#6b7280');
      const hp = tr.insertCell();
      const frac = homopolymerFraction(s.recalled);
      hp.textContent = `${(frac * 100).toFixed(0)}%`;
      hp.className = frac >= 0.8 ? '' : 'n';
      if (frac >= 0.8) hp.title = 'the reconstruction is essentially one repeated base';
    }
    if (sites.length > CAP) {
      const tr = body.insertRow();
      const c = tr.insertCell();
      c.colSpan = 5;
      c.className = 'n';
      c.textContent = `…and ${sites.length - CAP} more, ranked by identity.`;
    }
    motifTable.dataset.lmMotifs = String(sites.length);
    const mean = sites.reduce((a, s) => a + s.identity, 0) / sites.length;
    const homo = sites.filter((s) => homopolymerFraction(s.recalled) >= 0.8).length;
    if (stat) {
      stat.textContent = `${sites.length} sites · mean identity ${(mean * 100).toFixed(1)}% · `
        + `composition floor ${(floor * 100).toFixed(1)}%`;
    }
    if (verdict) {
      verdict.textContent = mean > floor
        ? `Mean identity ${(mean * 100).toFixed(1)}% against a ${(floor * 100).toFixed(1)}% floor: `
          + `the model recovers slightly more than base composition alone, but far less than it `
          + `recovers the same positions under the scattered masking it was trained with `
          + `(${((meta.metrics.maskedArgmax ?? 0) * 100).toFixed(1)}%). `
          + `${homo} of ${sites.length} reconstructions are ≥80% a single repeated base.`
        : `Mean identity ${(mean * 100).toFixed(1)}% against a ${(floor * 100).toFixed(1)}% floor — `
          + `BELOW it. Masked whole, these sites are not reconstructed at all: the model falls back `
          + `to the base-composition prior, and ${homo} of ${sites.length} reconstructions are ≥80% `
          + `a single repeated base. The same positions under scattered masking are recovered `
          + `${((meta.metrics.maskedArgmax ?? 0) * 100).toFixed(1)}% of the time. A contiguous hole `
          + `removes the local context this model was trained to rely on.`;
    }
  }

  function renderEnrichment(): void {
    if (!enrichTable) return;
    clear(enrichTable);
    const plane = activePlane();
    const verdict = $<HTMLElement>('[data-lm-exon-verdict]');
    const stat = $<HTMLElement>('[data-lm-enrich-stat]');
    if (!plane || !annotations.length) {
      const c = enrichTable.insertRow().insertCell();
      c.className = 'n';
      c.textContent = 'Loading…';
      delete enrichTable.dataset.lmEnrichment;
      return;
    }
    // The signal is information content per base -- constraint, not attribution.
    const signal = new Float64Array(SEQ_LEN);
    for (let p = 0; p < SEQ_LEN; p += 1) {
      signal[p] = Math.max(informationContent(renormalise(plane.subarray(p * 4, p * 4 + 4))), 0);
    }
    const groups = new Map<string, AnnotationFeature[]>();
    for (const f of annotations) {
      const key = f.cls === 'tfbs' ? `tfbs:${motifTier(f)}` : f.cls;
      const list = groups.get(key) ?? [];
      list.push(f);
      groups.set(key, list);
    }
    // The selected gene gets its own column: the same statistic restricted to that gene's span,
    // which is what makes the region stepper answer a question rather than only move the view.
    const sel = selectedFeature();
    const head = enrichTable.createTHead().insertRow();
    const cols = ['annotation class', 'n', 'constraint ratio', 'null', 'p'];
    if (sel) cols.push(`in ${sel.name}`);
    for (const h of cols) {
      const th = document.createElement('th');
      th.textContent = h;
      head.append(th);
    }
    const body = enrichTable.createTBody();
    const fire = css('--vp-fire', '#b0455a');
    const TIER: Record<string, string> = {
      chip: 'ChIP-supported', conserved: 'conserved only', pwm: 'PWM scan', paper: "the paper's",
    };
    let cds: number | null = null;
    let measured = 0;
    const ordered = [...groups].sort((a, b) => b[1].length - a[1].length);
    for (const [key, list] of ordered) {
      const mask = featureMask(list, SEQ_LEN);
      const r = weightedEnrichment(signal, mask, 256);
      if (!r) continue;
      measured += 1;
      const label = key.startsWith('tfbs:')
        ? `TFBS · ${TIER[key.slice(5)] ?? key.slice(5)}`
        : ANNOTATION_CLASSES[key]?.label ?? key;
      if (key === 'cds') cds = r.ratio;
      const tr = body.insertRow();
      const n = tr.insertCell();
      n.textContent = label;
      n.style.textAlign = 'left';
      const cnt = tr.insertCell();
      cnt.className = 'n';
      cnt.textContent = String(list.length);
      const ratio = tr.insertCell();
      ratio.textContent = `${r.ratio.toFixed(3)}×`;
      const a = Math.min(Math.abs(r.z) / 8, 1) * 0.3;
      if (Math.abs(r.z) > 2) {
        ratio.style.background = `color-mix(in srgb, ${fire} ${a * 100}%, transparent)`;
      }
      const nul = tr.insertCell();
      nul.className = 'n';
      nul.textContent = `${r.nullMean.toFixed(3)}±${r.nullSd.toFixed(3)}`;
      const pv = tr.insertCell();
      pv.className = 'n';
      pv.textContent = r.p <= 1 / 257 ? '<0.004' : r.p.toFixed(3);

      if (sel) {
        const cell = tr.insertCell();
        cell.className = 'n';
        const a = Math.max(0, sel.txStart);
        const b = Math.min(SEQ_LEN, sel.txEnd);
        const sub = mask.subarray(a, b);
        let inside = 0;
        for (let i = 0; i < sub.length; i += 1) inside += sub[i];
        // A gene is 1-3 kb and most classes put only a handful of bases inside it. Below a floor
        // the circular-shift null has almost nothing to permute, so the ratio is a number the
        // statistic cannot support -- show that it is absent rather than print it.
        const local = inside >= MIN_REGION_BASES
          ? weightedEnrichment(signal.subarray(a, b), sub, 256)
          : null;
        cell.textContent = local ? `${local.ratio.toFixed(2)}×` : '—';
        cell.title = local
          ? `${inside} bp of this class inside ${sel.name}, p ${local.p <= 1 / 257 ? '<0.004' : local.p.toFixed(3)}`
          : `only ${inside} bp of this class inside ${sel.name}; below ${MIN_REGION_BASES} bp the `
            + 'circular-shift null has too little to permute for the ratio to mean anything';
      }
    }
    enrichTable.dataset.lmEnrichment = String(measured);
    if (stat) stat.textContent = `${measured} classes · null from 256 circular shifts`;
    if (verdict && cds !== null) {
      verdict.textContent = cds < 0.98
        ? `The prediction holds: coding sequence scores ${cds.toFixed(3)}× — the model is `
          + `measurably LESS certain over exons than over the window at large, which is what `
          + `training with exon_loss_scale = 0.1 was for.`
        : cds > 1.02
          ? `The prediction fails here, as it does everywhere: coding sequence scores `
            + `${cds.toFixed(3)}×, so the model is MORE certain over exons despite being trained to `
            + `weight them at a tenth. That holds in 14 of 14 windows (mean 1.128×). The three solo `
            + `LTRs in this set go the other way at 0.68–0.80×, but that is three features in three `
            + `windows — see the disclosure below.`
          : `Coding sequence scores ${cds.toFixed(3)}× — indistinguishable from the rest of the `
            + `window. The tenfold down-weighting of exon loss left no measurable trace here.`;
    }
  }

  /** The bottleneck embeddings, projected and coloured by what the annotation says is there. */
  function renderEmbed(): void {
    if (!embedCanvas || !meta) return;
    const cssW = embedCanvas.clientWidth || 900;
    const cssH = 300;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    embedCanvas.width = Math.round(cssW * dpr);
    embedCanvas.height = Math.round(cssH * dpr);
    embedCanvas.style.height = `${cssH}px`;
    const ctx = embedCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.font = '9px system-ui, sans-serif';
    const muted = css('--color-muted', '#6b7280');
    const note = $<HTMLElement>('[data-lm-embed-note]');
    const stat = $<HTMLElement>('[data-lm-embed-stat]');
    if (!embed) {
      ctx.fillStyle = muted;
      ctx.fillText('Loading…', PLOT.left, 20);
      return;
    }
    const N = meta.embed.cols;      // 128 positions
    const D = meta.embed.rows;      // 384 channels
    // The pack is [channels x positions]; the projection wants [positions x channels].
    const pts = new Float64Array(N * D);
    for (let i = 0; i < N; i += 1) for (let j = 0; j < D; j += 1) pts[i * D + j] = embed[i * D + j];
    const proj = pca2(pts, N, D);

    // Label each bottleneck cell by whichever class covers most of its 128 bp.
    const CLASSES: { key: string; label: string; colour: string }[] = [
      { key: 'cds', label: 'CDS', colour: css('--vp-orf', '#6f62a8') },
      { key: 'tfbs', label: 'TFBS', colour: css('--vp-tfbs', '#b4485f') },
      { key: 'regulatory', label: 'regulatory', colour: css('--vp-reg', '#4a7fb5') },
      { key: 'other', label: 'intergenic / other', colour: muted },
    ];
    const covers = new Map<string, Float64Array>();
    for (const c of CLASSES) {
      if (c.key === 'other') continue;
      const list = annotations.filter((f) => f.cls === c.key);
      covers.set(c.key, list.length ? poolCoverage(featureMask(list, SEQ_LEN), N) : new Float64Array(N));
    }
    const labelOf = (i: number): number => {
      let best = CLASSES.length - 1;
      let bestV = 0.15;                     // a cell must be meaningfully covered to be labelled
      CLASSES.forEach((c, ci) => {
        const v = covers.get(c.key)?.[i] ?? 0;
        if (v > bestV) { bestV = v; best = ci; }
      });
      return best;
    };

    const xs = proj.map((p) => p.x);
    const ys = proj.map((p) => p.y);
    const pad = 26;
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const sx = (v: number) => PLOT.left + pad + ((v - x0) / Math.max(x1 - x0, 1e-9)) * (cssW - PLOT.left - pad * 2);
    const sy = (v: number) => cssH - 30 - ((v - y0) / Math.max(y1 - y0, 1e-9)) * (cssH - 56);
    const counts = new Array(CLASSES.length).fill(0);
    proj.forEach((p, i) => {
      const ci = labelOf(i);
      counts[ci] += 1;
      ctx.fillStyle = CLASSES[ci].colour;
      ctx.globalAlpha = ci === CLASSES.length - 1 ? 0.35 : 0.85;
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    let lx = PLOT.left;
    CLASSES.forEach((c, ci) => {
      if (!counts[ci]) return;
      ctx.fillStyle = c.colour;
      ctx.beginPath();
      ctx.arc(lx + 4, 10, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = muted;
      const label = `${c.label} (${counts[ci]})`;
      ctx.fillText(label, lx + 11, 13);
      lx += 18 + ctx.measureText(label).width;
    });
    ctx.fillStyle = muted;
    ctx.fillText(
      `${meta.gene} · ${N} bottleneck positions × ${D} channels, first self-attention layer · `
      + 'PCA, deterministic · one point is 128 bp', PLOT.left, cssH - 4);
    embedCanvas.dataset.lmEmbed = String(N);
    if (stat) stat.textContent = `${N} positions · ${D} channels`;
    if (note) {
      note.textContent =
        `Each point is 128 bp of sequence, labelled by whichever class covers at least 15% of it; `
        + `${counts[CLASSES.length - 1]} of ${N} cells have no dominant annotation and are drawn in `
        + `grey. At this resolution a 7 bp binding site cannot claim a point of its own, so read `
        + `separation here as a statement about large features, not about motifs.`;
    }
  }

  function renderAll(): void {
    renderPasses();
    renderIc();
    renderAnnotation();
    renderLogo();
    renderBase();
    renderMotifs();
    renderEnrichment();
    renderEmbed();
    renderRegionList();
    renderRegionContext();
    renderSummary();
  }

  /**
   * The locus list. Gene and systematic name only, with the blurb on `title`.
   *
   * A select sizes itself to its widest option, and on the expression page one long label made the
   * sticky bar wider than a 320 px viewport and set the whole scroll pane moving sideways. The
   * document-level overflow check cannot see that, because the bar sits inside `overflow-x: auto`.
   */
  function renderLocusList(): void {
    if (!locusSelect) return;
    clear(locusSelect);
    LOCI.forEach((l, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `${l.gene} · ${l.id}${l.figureWindow ? ' · Fig 4' : ''}`;
      o.title = l.blurb ?? '';
      locusSelect.append(o);
    });
    locusSelect.value = String(locusIndex);
  }

  /**
   * The region list: the genes in this window.
   *
   * The expression page's regions are its traceback anchors, which are also genes -- so the two
   * pages step through the same things, and a reader who has walked ACT1's neighbours on one page
   * finds the same list here. The whole window leads, because constraint is defined everywhere and
   * "no region" is a legitimate state rather than a missing selection.
   */
  function renderRegionList(): void {
    if (!regionSelect) return;
    const feats = LOCI[locusIndex].features as GeneTrackFeature[];
    clear(regionSelect);
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'whole window';
    regionSelect.append(all);
    for (const f of feats) {
      const o = document.createElement('option');
      o.value = f.name;
      const kb = ((f.txEnd - f.txStart) / 1000).toFixed(1);
      o.textContent = `${f.name === LOCI[locusIndex].id ? LOCI[locusIndex].gene : f.name} · ${kb} kb`;
      regionSelect.append(o);
    }
    regionSelect.value = selectedGene ?? '';
    if (regionStat) {
      regionStat.textContent = `${feats.length} gene${feats.length === 1 ? '' : 's'} in this window`;
    }
  }

  function stepRegion(delta: number): void {
    const feats = LOCI[locusIndex].features as GeneTrackFeature[];
    const names: (string | null)[] = [null, ...feats.map((f) => f.name)];
    const at = names.indexOf(selectedGene);
    const next = names[(((at < 0 ? 0 : at + delta) % names.length) + names.length) % names.length];
    setRegion(next);
  }

  /**
   * Select a gene, or the whole window.
   *
   * Moves the logo onto the gene as well as scoping the numbers: a selection that changed the
   * statistics while leaving the letters where they were would put one gene's letters under
   * another gene's heading.
   */
  function setRegion(name: string | null): void {
    selectedGene = name;
    if (regionSelect) regionSelect.value = name ?? '';
    const f = selectedFeature();
    if (f) {
      const mid = (f.txStart + f.txEnd) / 2;
      logoWindow = {
        start: Math.max(0, Math.min(SEQ_LEN - logoWindow.width, Math.round(mid - logoWindow.width / 2))),
        width: logoWindow.width,
      };
      if (panEl) {
        panEl.value = String(Math.round(((logoWindow.start + logoWindow.width / 2) / SEQ_LEN) * 1000));
      }
    }
    renderRegionContext();
    renderIc();
    renderAnnotation();
    renderLogo();
    renderEnrichment();
  }

  /**
   * Point the genome-browser link at whatever is selected here.
   *
   * The coordinates are DERIVED -- the locus start plus the feature's window-relative span, both
   * of which the page already holds -- so the link and the panel below it cannot disagree about
   * where the region is. With no region selected it frames the whole 16,384 bp window.
   */
  function renderGenomeLink(): void {
    const a = $<HTMLAnchorElement>('[data-lm-genome-link]');
    if (!a) return;
    const l = LOCI[locusIndex];
    const f = selectedFeature();
    // 1-based inclusive, the convention the browser's locus box prints and parses back.
    const from = l.start + (f ? f.txStart : 0) + 1;
    const to = l.start + (f ? f.txEnd : 16384);
    const pad = f ? 800 : 0;
    a.href = `/shorkie-lab/genome/#${l.chrom}:${Math.max(1, from - pad)}-${to + pad}`;
    a.title = f
      ? `Open ${f.name} in the genome browser`
      : `Open this ${(16384).toLocaleString()} bp window in the genome browser`;
  }

  /** The read-only context line: one control owns the selection, every panel reports it. */
  function renderRegionContext(): void {
    renderGenomeLink();
    const el = $<HTMLElement>('[data-lm-region-context]');
    if (!el) return;
    const f = selectedFeature();
    const plane = activePlane();
    if (!f || !plane) {
      el.textContent = LOCI[locusIndex].features.length
        ? 'whole window · 16,384 bp'
        : '';
      return;
    }
    const r = regionConstraint(plane, LOCI[locusIndex].sequence as string, f.txStart, f.txEnd);
    if (!r) { el.textContent = ''; return; }
    el.textContent =
      `${f.name} · ${r.bases.toLocaleString()} bp · IC ${r.meanIc.toFixed(3)} vs window `
      + `${r.windowMeanIc.toFixed(3)} bits · ${r.ratio.toFixed(2)}× · argmax `
      + `${(r.argmax * 100).toFixed(1)}%`;
  }

  /**
   * Constraint across every shipped window, from `shorkieLmSummary.json`.
   *
   * Precomputed rather than measured live: the enrichment statistic runs 256 circular shifts per
   * class, so doing it for every locus in the browser would mean fetching every plane. The
   * generator uses the same statistic and the same null as `renderEnrichment` below, so the two
   * cannot drift -- and the panel exists because the prose already makes cross-locus claims that a
   * reader looking at one window has no way to check.
   */
  function renderSummary(): void {
    const table = $<HTMLTableElement>('[data-lm-summary]');
    if (!table) return;
    clear(table);
    const rows = [...(lmSummary.loci as any[])]
      .sort((a, b) => b.metrics.maskedArgmax - a.metrics.maskedArgmax);
    const head = table.createTHead().insertRow();
    for (const h of ['gene', 'argmax', 'perplexity', 'mean IC', 'CDS', 'LTR', 'ChIP sites']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.append(th);
    }
    const body = table.createTBody();
    const fire = css('--vp-fire', '#b0455a');
    for (const r of rows) {
      const tr = body.insertRow();
      const here = r.id === LOCI[locusIndex].id;
      if (here) tr.style.fontWeight = '600';
      const g = tr.insertCell();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vp-chan';   // the page's existing in-table link button
      btn.textContent = r.gene;
      btn.addEventListener('click', () => { void setLocus(LOCI.findIndex((l) => l.id === r.id)); });
      g.append(btn);
      if (here) g.append(' ◀');
      const cell = (text: string, colour?: string) => {
        const c = tr.insertCell();
        c.textContent = text;
        if (colour) c.style.color = colour;
      };
      cell(`${(r.metrics.maskedArgmax * 100).toFixed(1)}%`);
      cell(r.metrics.maskedPerplexity.toFixed(3));
      cell(r.meanIc.toFixed(3));
      // Above 1 is the direction the page's own claim is about, so it is the one that gets colour.
      const cds = r.classes.cds?.ratio;
      cell(cds === undefined ? '—' : `${cds.toFixed(2)}×`, cds > 1 ? fire : undefined);
      const ltr = r.classes.ltr?.ratio;
      cell(ltr === undefined ? '—' : `${ltr.toFixed(2)}×`);
      const chip = r.classes['tfbs:chip'];
      const chipCell = tr.insertCell();
      chipCell.textContent = chip === undefined
        ? '—' : `${chip.ratio.toFixed(2)}× (${chip.features})`;
      // A ratio over a handful of sites is a draw, not a measurement -- MMS2's 2.32x rests on four
      // and DTD1's 0.30x on three. The count alone does not stop a reader taking them as equivalent
      // to a 53-site row, so the thin ones are muted and say why. Same discipline as the LTR column,
      // which was overstated in prose for a round before anyone counted its features.
      if (chip !== undefined && chip.features < LOW_N_FEATURES) {
        chipCell.className = 'n';
        chipCell.title = `only ${chip.features} ChIP-supported sites in this window — too few for `
          + 'the circular-shift null to separate this ratio from chance';
      }
    }
    table.dataset.lmSummary = String(rows.length);
  }

  /**
   * Switch locus, resetting every piece of state that indexes into the old one.
   *
   * `selectedBase` and `selectedGene` are positions and names in the PREVIOUS window and mean
   * nothing in this one; `logoWindow` is a coordinate that is legal in both and therefore the most
   * dangerous, because keeping it silently shows the new locus's letters at the old locus's offset
   * under a heading naming the new gene.
   */
  async function setLocus(index: number): Promise<void> {
    if (index < 0 || index >= LOCI.length) return;
    locusIndex = index;
    selectedGene = null;
    selectedBase = -1;
    logoWindow = { start: 0, width: logoWindow.width };
    if (locusSelect) locusSelect.value = String(index);
    await load(index);
    // Open on the window's own gene, which is the reader's likely first question -- after `load`,
    // so the plane the context line reads is this locus's.
    const own = (LOCI[index].features as GeneTrackFeature[]).find((f) => f.name === LOCI[index].id);
    setRegion(own ? own.name : null);
  }

  function setWindow(start: number, width: number): void {
    const w = Math.max(20, Math.min(SEQ_LEN, Math.round(width)));
    logoWindow = { start: Math.max(0, Math.min(SEQ_LEN - w, Math.round(start))), width: w };
    if (panEl) panEl.value = String(Math.round(((logoWindow.start + w / 2) / SEQ_LEN) * 1000));
    renderLogo();
    renderIc();
  }

  // ---------------------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------------------
  locusSelect?.addEventListener('change', () => { void setLocus(Number(locusSelect.value)); });
  regionSelect?.addEventListener('change', () => { setRegion(regionSelect.value || null); });
  host.querySelector('[data-lm-region-prev]')?.addEventListener('click', () => stepRegion(-1));
  host.querySelector('[data-lm-region-next]')?.addEventListener('click', () => stepRegion(1));

  // The lane and tier toggles. A tier is not a lane: the three tiers are three strengths of
  // evidence for the same claim, so they are toggled separately and drawn differently.
  // Only the drawing follows these. The enrichment table below deliberately measures EVERY tier
  // whatever the canvas shows: tying it to the toggles would hide the three-tier comparison, which
  // is the finding rather than a display option.
  host.querySelectorAll<HTMLInputElement>('[data-lm-lane]').forEach((box) => {
    box.addEventListener('change', () => {
      annLanesOn[box.dataset.lmLane ?? ''] = box.checked;
      renderAnnotation();
    });
  });
  host.querySelectorAll<HTMLInputElement>('[data-lm-tier]').forEach((box) => {
    box.addEventListener('change', () => {
      motifTiersOn[box.dataset.lmTier ?? ''] = box.checked;
      renderAnnotation();
    });
  });

  panEl?.addEventListener('input', () => {
    // Read the DOM value into a local FIRST: setWindow writes the slider back, and reading it
    // afterwards returns the value just written rather than the one dragged to.
    const pan = Number(panEl.value) / 1000;
    setWindow(pan * SEQ_LEN - logoWindow.width / 2, logoWindow.width);
  });
  widthEl?.addEventListener('change', () => {
    const w = Number(widthEl.value);
    setWindow(logoWindow.start + logoWindow.width / 2 - w / 2, w);
  });
  // The pass drives every panel, not just the logo: an entropy panel showing the unmasked pass
  // while the table beside it quotes the masked one is the confusion this page exists to prevent.
  passEl?.addEventListener('change', renderAll);

  if (icCanvas) {
    let anchor: number | null = null;
    const bpAt = (ev: PointerEvent) => {
      const r = icCanvas.getBoundingClientRect();
      const inner = r.width - PLOT.left - PLOT.right;
      return Math.max(0, Math.min(SEQ_LEN,
        ((ev.clientX - r.left - PLOT.left) / inner) * SEQ_LEN));
    };
    icCanvas.addEventListener('pointerdown', (ev) => {
      anchor = bpAt(ev);
      icCanvas.setPointerCapture(ev.pointerId);
    });
    icCanvas.addEventListener('pointermove', (ev) => {
      if (anchor === null) return;
      const b = bpAt(ev);
      if (Math.abs(b - anchor) >= 20) setWindow(Math.min(anchor, b), Math.abs(b - anchor));
    });
    icCanvas.addEventListener('pointerup', (ev) => {
      if (anchor === null) return;
      const b = bpAt(ev);
      if (Math.abs(b - anchor) < 20) setWindow(b - logoWindow.width / 2, logoWindow.width);
      anchor = null;
    });
    icCanvas.addEventListener('pointercancel', () => { anchor = null; });
  }

  // Canvases read CSS custom properties at draw time, so they keep the old palette across a theme
  // change unless repainted. SVG restyles itself and hides the problem.
  const onTheme = () => { renderIc(); renderAnnotation(); renderEmbed(); };
  document.addEventListener('khc:theme-change', onTheme);
  const onResize = () => { renderIc(); renderAnnotation(); renderEmbed(); };
  window.addEventListener('resize', onResize);

  renderLocusList();
  renderSummary();
  // Through setLocus, not load, so the first render lands in the same state a locus switch does --
  // region selected, window opened on it. A first paint that differs from every subsequent one is
  // how a stale-state bug hides.
  void setLocus(locusIndex);

  return {
    destroy: () => {
      document.removeEventListener('khc:theme-change', onTheme);
      window.removeEventListener('resize', onResize);
    },
  };
}

// Bind on astro:page-load and stay idempotent: ClientRouter is active, so the module is evaluated
// once and a controller that bound only at module scope is dead after one navigation, while one
// that re-binds without a guard grows a second set of listeners.
let active: { destroy: () => void } | null = null;
function mount(): void {
  const host = document.querySelector<HTMLElement>('[data-lm]');
  if (!host) {
    active?.destroy();
    active = null;
    return;
  }
  if (host.dataset.lmReady === 'true') return;
  host.dataset.lmReady = 'true';
  active = initShorkieLm(host);
}
document.addEventListener('astro:page-load', mount);
document.addEventListener('astro:before-swap', () => { active?.destroy(); active = null; });
if (document.readyState !== 'loading') mount();
