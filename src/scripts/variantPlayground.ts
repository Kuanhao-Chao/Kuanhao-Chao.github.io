/**
 * The Live Variant Playground controller.
 *
 * Two inference paths, kept deliberately distinct because they make different promises:
 *
 *   LIVE  — src/lib/shorkieModel.ts runs the real conv stem in TypeScript on every keystroke.
 *           4,224 weights, a few microseconds, genuinely 60 FPS. Valid on a bare typed sequence
 *           because convolutions are translation-equivariant.
 *   FULL  — the exported ONNX graph (28.6 MB fp16) through onnxruntime-web, debounced. Produces
 *           the real 896-bin predicted track and the deep activations. Needs the full 16,384 bp
 *           window, so it only runs in locus mode.
 *
 * The page states which path produced what. Multi-threaded WASM is unavailable (GitHub Pages
 * cannot send COOP/COEP, so there is no SharedArrayBuffer), so the backend is WebGPU where the
 * browser has it and single-threaded WASM otherwise, and the readout says which ran.
 */

import lociJson from '../data/shorkieLoci.json';
import { createFlow3d, type Flow3dController } from './shorkieFlow3d';
import {
  createFlow,
  FLOW_STAGES,
  stageMap,
  attentionMap,
  type FlowController,
  type FlowActivations,
  type FlowStage,
} from './shorkieFlow';
import truthJson from '../data/shorkieTruth.json';
import trackNamesJson from '../data/shorkieTrackNames.json';
import predictionsJson from '../data/shorkiePredictions.json';
import {
  BASES,
  type Base,
  N_BINS,
  TRACK_GROUPS,
  RNA_SEQ_GROUP,
  pearson,
  activationInk,
  activationScale,
  scaledInk,
  paintActivationMap,
  type Rgb,
  binToWindowOffset,
  positionToBp,
  bpToFraction,
  subLayers,
  knockoutMotif,
  geneBodyBins,
  windowFraction,
  fractionToBp,
  predictedSpan,
  axisTicks,
  bpTicks,
  packGeneRows,
  attentionRollout,
  stageRelevanceProfile,
  exactStageProfiles,
  relevanceMap,
  STAGE_MAP_POSITIONS,
  LOGO_GLOBSCALE,
  LOGO_GLYPHS,
  LOGO_COLOURS,
  logoColumn,
  logoRange,
  ismSaliency,
  spliceAnnotations,
  stageRasterHeight,
  PX_PER_CHANNEL,
  binsToBottleneck,
  BOTTLENECK_LEN,
  N_DNA,
  N_MASK,
  N_SPECIES,
  IN_CHANNELS,
  geneTrackShapes,
  stageMapOffsets,
  sumAttributionRows,
  trackGroupOf,
  trackIndex,
  type ParsedTrack,
  trackRowBinning,
  logAxis,
  N_TRACKS,
  BIN_BP,
  CROP_BP,
  SEQ_LEN,
  SPECIES_S_CEREVISIAE,
  cleanSequence,
  encodeInput,
  layerSpecs,
  N_HEADS,
  stemActivations,
  type StemActivation,
  type StemWeights,
} from '../lib/shorkieModel';


interface Motif {
  name: string;
  consensus: string;
  strand: string;
  start: number;
  end: number;
}

interface Locus {
  id: string;
  gene: string;
  blurb: string;
  chrom: string;
  start: number;
  strand: string;
  sequence: string;
  features: {
    name: string;
    strand: string;
    start: number;      // bins, for the coverage plot
    end: number;
    txStart: number;    // bp offsets into the window, for the gene track
    txEnd: number;
    cdsStart: number;
    cdsEnd: number;
    exons: number[][];
  }[];
  /** Present only on the six Figure 4 windows. */
  motifs?: Motif[];
  figurePanel?: string;
  figureWindow?: { seqStart: number; seqEnd: number; binStart: number; binEnd: number };
}
const LOCI = (lociJson as { loci: Locus[] }).loci;

/** Measured coverage per locus per group, binned exactly as the model's labels were. */
interface Truth { loci: Record<string, Record<string, number[]>>; tracks: Record<string, string[]>; }
const TRUTH = truthJson as Truth;
const TRACK_NAMES = (trackNamesJson as { identifiers: string[] }).identifiers;
/** The cascading structure behind the track picker: assay -> regulator/target/run -> timepoint. */
const TRACK_INDEX = trackIndex(TRACK_NAMES);

/**
 * Predictions for every preset locus, computed offline at the full 16,384 bp context.
 *
 * The page used to have a prediction only after a ~17 s WASM inference the reader had to click for
 * and wait through; a missed or abandoned click left every output panel legitimately empty. These
 * are shipped so the output is populated on load, and the model is loaded for live activations,
 * sequence editing and motif knockouts -- not to get a number that already exists.
 */
interface Predictions {
  loci: Record<string, { gene: string; groups: number[][]; baseline: number[] }>;
  baselineTracks: number;
}
const PREDICTIONS = predictionsJson as Predictions;

/** The predicted curve for a group, from the live run if there is one, else the shipped one. */
function predictedGroup(locusId: string, group: number, live: FullResult | null): Float32Array | null {
  if (live) {
    const out = new Float32Array(N_BINS);
    for (let i = 0; i < N_BINS; i += 1) out[i] = live.tracks[i * 4 + group];
    return out;
  }
  const rows = PREDICTIONS.loci[locusId]?.groups;
  return rows?.[group] ? Float32Array.from(rows[group]) : null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K) => document.createElementNS(SVG_NS, tag);

function attr(node: SVGElement, values: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(values)) node.setAttribute(k, String(v));
}

/** Never inject raw HTML: the sequence is visitor-typed and audit:security fails the bare token anyway. */
function text(x: number, y: number, value: string, cls: string, anchor = 'middle'): SVGTextElement {
  const t = el('text');
  attr(t, { x, y, class: cls, 'text-anchor': anchor });
  t.textContent = value;
  return t;
}

function clear(node: Element | null): void {
  while (node?.firstChild) node.removeChild(node.firstChild);
}

interface FullResult {
  /** The one-hot sequence, [4, 16384]. Not from the model -- it IS the model's input. */
  input?: Float32Array;
  tracks: Float32Array;       // [896, 4]
  stemProfile: Float32Array;  // [96, 1024]
  attention: Float32Array;    // [8, 128, 128]
  stageMaps: Float32Array;    // [5760, 128] -- every mapped stage, in flow order
  allTracks: Float32Array;    // [896, 5215] -- every track, unreduced
  backend: string;
  ms: number;
}

export function initVariantPlayground(root: ParentNode = document) {
  const found = root.querySelector<HTMLElement>('[data-vp]');
  if (!found || found.dataset.vpReady === 'true') return null;
  const host: HTMLElement = found;
  host.dataset.vpReady = 'true';

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => host.querySelector<T>(sel);
  const locusSelect = $<HTMLSelectElement>('[data-vp-locus]');
  const runBtn = $<HTMLButtonElement>('[data-vp-run]');
  const statusEl = $('[data-vp-status]');
  const aspectCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-aspect]');
  const spinBtn = host.querySelector<HTMLButtonElement>('[data-vp-spin]');
  const stageProfileEl = host.querySelector<HTMLElement>('[data-vp-stage-profile]');
  const rolloutCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-rollout]');
  const stackCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-stage-stack]');
  const neuronTraceCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-neurons-trace]');
  const showingBtns = host.querySelectorAll<HTMLButtonElement>('[data-vp-showing]');
  const regionSelect = host.querySelector<HTMLSelectElement>('[data-vp-region]');
  const regionStat = host.querySelector<HTMLElement>('[data-vp-region-stat]');
  const seqLogoSvg = host.querySelector<SVGSVGElement>('[data-vp-seq-logo]');
  const logoPan = host.querySelector<HTMLInputElement>('[data-vp-logo-pan]');
  const logoWidth = host.querySelector<HTMLSelectElement>('[data-vp-logo-width]');
  const logoSource = host.querySelector<HTMLSelectElement>('[data-vp-logo-source]');
  const logoStat = host.querySelector<HTMLElement>('[data-vp-logo-stat]');
  const ismLogoSvg = host.querySelector<SVGSVGElement>('[data-vp-ism-logo]');
  const trackSvg = host.querySelector<SVGSVGElement>('[data-vp-track]');
  const layerList = $('[data-vp-layers]');
  const liveStat = $('[data-vp-livestat]');
  const flowCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-flow]');
  const flow3dCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-flow3d]');
  const viewBtns = host.querySelectorAll<HTMLButtonElement>('[data-vp-view]');
  const playBtn = $<HTMLButtonElement>('[data-vp-play]');
  const scrubInput = $<HTMLInputElement>('[data-vp-scrub]');
  const stageStat = $('[data-vp-stagestat]');
  const truthToggle = $<HTMLInputElement>('[data-vp-truth]');
  const groupSelect = $<HTMLSelectElement>('[data-vp-group]');
  const truthStat = $('[data-vp-truthstat]');
  const stageDetail = $('[data-vp-stage-detail]');
  const subLayerList = $('[data-vp-sublayers]');
  const stageNote = $('[data-vp-stage-note]');
  const tabBtns = host.querySelectorAll<HTMLButtonElement>('[data-vp-tab]');
  const legendEl = $('[data-vp-legend]');
  const heatCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-heat]');
  const heatStat = $('[data-vp-heat-stat]');
  const trackNameEl = $('[data-vp-track-name]');
  const pickGroup = $<HTMLSelectElement>('[data-vp-pick-group]');
  const pickKey = $<HTMLSelectElement>('[data-vp-pick-key]');
  const pickTrack = $<HTMLSelectElement>('[data-vp-pick-track]');
  const singleSvg = host.querySelector<SVGSVGElement>('[data-vp-single]');
  const logToggle = $<HTMLInputElement>('[data-vp-logaxis]');
  const attrCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-attr]');
  const methodsCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-methods]');
  const occlCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-occl]');
  const occlStat = host.querySelector<HTMLElement>('[data-vp-occl-stat]');
  const occlNorm = host.querySelector<HTMLInputElement>('[data-vp-occl-norm]');
  const occlPick = host.querySelector<HTMLElement>('[data-vp-occl-pick]');
  /** A clicked row (output bin) or column (input window) on the occlusion map, or null. */
  let occlSel: { kind: 'row' | 'col'; index: number } | null = null;
  const traceLabel = $('[data-vp-trace-label]');
  const anchorSelect = $<HTMLSelectElement>('[data-vp-anchor]');
  const traceClear = $<HTMLButtonElement>('[data-vp-trace-clear]');
  const motifBox = $('[data-vp-motifs]');
  const motifList = $('[data-vp-motif-list]');
  const knockoutStat = $('[data-vp-knockout]');
  const stageTitle = $('[data-vp-stage-title]');
  const stageTop = $('[data-vp-stage-top]');
  const stageMapCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-stage-map]');

  /** The full 16,384 bp window fed to ONNX. In free-typing mode it is just the typed text. */
  let sequence = 'GGCTATAAAAGGGCATCGATCACGTGACCGGTAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCC';
  /** The slice shown in the box and rastered live -- never the whole window. */
  let locusIndex = 0;
  // The channel highlighted in the conv-stem raster AND profiled in the layer detail. Clicking a
  // raster row used to drive the sequence-logo panel; that panel is gone, so the click now selects
  // the channel whose positional profile the detail view plots.
  let selectedFilter = 0;
  let reference: FullResult | null = null;
  let current: FullResult | null = null;
  let session: unknown = null;
  let ort: typeof import('onnxruntime-web') | null = null;
  let backend = 'not loaded';
  let flow: FlowController | null = null;
  let flow3d: Flow3dController | null = null;
  let groupIndex = RNA_SEQ_GROUP;
  let showTruth = true;
  let stageTab: 'activation' | 'attention' = 'activation';
  /** Which stage the detail last followed, so the sweep only redraws on a real change. */
  let lastFrontStage = '';
  /** Guards against a slow fetch for a locus the reader has left. */
  let precomputeToken = 0;
  /** The loaded traceback for the current locus, and the region currently traced. */
  let attribution: Attribution | null = null;
  let tracedBins: { start: number; end: number; label: string } | null = null;
  // ARG80_T0_S757 -- a real T0 baseline experiment, which is the set Figure 4's ISM uses,
  // rather than a mean over all 3,053 induction tracks.
  let selectedTrack: number = TRACK_GROUPS[RNA_SEQ_GROUP].start;
  let useLogAxis = true;
  // Expanded by default: eight of the fourteen windows contain an overlap, and collapsing is the
  // compact view rather than the honest one.
  let geneRowsExpanded = true;
  let ism: Ism | null = null;
  let occl: Occl | null = null;
  /** Whether the flow canvas and layer raster show activations or the traced region's relevance. */
  let showing: 'activation' | 'relevance' = 'activation';
  /** Why there is no result to show, named so the empty state can say it. */
  let emptyReason = 'No prediction yet.';
  /** Which motif is currently knocked out, and the peak before it was. */
  let knockedOut: Motif | null = null;
  let peakBeforeKnockout = 0;

  // ---------------------------------------------------------------- layer map (static)
  function renderLayers(): void {
    if (!layerList) return;
    clear(layerList);
    for (const spec of layerSpecs()) {
      const row = document.createElement('li');
      row.className = 'vp-layer';
      const name = document.createElement('span');
      name.className = 'vp-layer-name';
      name.textContent = spec.label;
      const shape = document.createElement('span');
      shape.className = 'vp-layer-shape';
      shape.textContent = `${spec.positions.toLocaleString()} × ${spec.channels.toLocaleString()}`;
      const detail = document.createElement('span');
      detail.className = 'vp-layer-detail';
      detail.textContent = spec.detail;
      row.append(name, shape, detail);
      layerList.append(row);
    }
  }

  // ---------------------------------------------------------------- live conv-stem raster
  const FIRE_FLOOR = 0.55; // only paint where a neuron is meaningfully above its baseline




  // ---------------------------------------------------------------- predicted track
  /**
   * The one plot geometry every panel that draws across the sequence uses.
   *
   * These panels are stacked, so a reader reads down a column expecting one bp. They did not share
   * one: the coverage curve spanned bins 0-896 -- bp 1,024-15,360 -- while the attribution beneath
   * it spanned the full 0-16,384, putting the same screen x 1,024 bp apart at the left edge. The
   * domain is now the whole window everywhere, and the interior the model actually predicts is
   * drawn where it really falls, with its two cropped flanks shaded rather than scaled away.
   */
  const PLOT = { left: 46, right: 10, top: 20, bottom: 34 };
  const GENE_H = 46;   // 18 px of bp ruler + two 11 px gene rows + slack

  /** A window offset in bp to an x coordinate, in whatever unit space the caller is drawing in. */
  function xOfBp(bp: number, width: number): number {
    return PLOT.left + windowFraction(bp) * (width - PLOT.left - PLOT.right);
  }

  /** The inverse, so a pointer lands on the base it is over rather than 1,024 bp away from it. */
  function bpOfX(x: number, width: number): number {
    const inner = width - PLOT.left - PLOT.right;
    return fractionToBp(inner > 0 ? (x - PLOT.left) / inner : 0);
  }

  /** Short bp labels for a ruler: 0, 2k, 4k … rather than 0, 2048, 4096. */
  function bpLabel(bp: number): string {
    return bp === 0 ? '0' : bp % 1000 === 0 ? `${bp / 1000}k` : `${(bp / 1000).toFixed(1)}k`;
  }

  /**
   * The shared axis furniture: a labelled value axis on the left and a bp ruler along the bottom.
   *
   * Neither coverage plot had a single tick before this -- only a caption naming the peak -- so a
   * reader could see the shape and not the scale. Ticks come from `axisTicks`, which places them
   * THROUGH the axis in use: on the log axis this page defaults to, evenly spaced values are not
   * evenly spaced positions, and generating them linearly bunches every tick against the top.
   */
  function drawAxes(
    svg: SVGSVGElement,
    W: number,
    plotTop: number,
    plotBottom: number,
    max: number,
    unit: string,
    locus: Locus | undefined,
    bottomY: number,
  ): void {
    const h = plotBottom - plotTop;
    for (const tick of axisTicks(max, useLogAxis)) {
      const y = plotBottom - tick.at * h;
      const line = el('line');
      attr(line, {
        x1: PLOT.left, x2: W - PLOT.right, y1: y, y2: y,
        stroke: 'var(--color-rule)', 'stroke-width': 0.5,
        'stroke-opacity': tick.value === 0 ? 0.9 : 0.35,
      });
      svg.append(line);
      svg.append(text(PLOT.left - 5, y + 3, formatTick(tick.value), 'vp-ax', 'end'));
    }
    // The unit, turned up the axis, so the numbers beside it mean something.
    const label = text(0, 0, unit, 'vp-ax', 'middle');
    attr(label, { transform: `translate(11 ${(plotTop + plotBottom) / 2}) rotate(-90)` });
    svg.append(label);

    for (const bp of bpTicks()) {
      const x = xOfBp(bp, W);
      const tickLine = el('line');
      attr(tickLine, {
        x1: x, x2: x, y1: plotBottom, y2: plotBottom + 4,
        stroke: 'var(--color-rule)', 'stroke-width': 0.5,
      });
      svg.append(tickLine);
      // The first and last ticks sit on the panel edge, so a centred label runs half off it.
      svg.append(text(x, plotBottom + 13, bpLabel(bp), 'vp-ax',
        bp === 0 ? 'start' : bp >= SEQ_LEN ? 'end' : 'middle'));
    }
    // The real chromosome coordinates, so the window can be found in a genome browser.
    const axisName = locus
      ? `${locus.chrom}:${locus.start.toLocaleString()}–${(locus.start + SEQ_LEN).toLocaleString()}`
        + ` · window offset, bp · ${useLogAxis ? 'log' : 'linear'} value axis`
      : `window offset, bp · ${useLogAxis ? 'log' : 'linear'} value axis`;
    // At the very bottom, clear of the gene rows -- it used to be drawn straight through them.
    svg.append(text(W - PLOT.right, bottomY, axisName, 'vp-ax', 'end'));
  }

  /** Tick labels that stay short across the four assay groups' ~40x range difference. */
  function formatTick(v: number): string {
    if (v === 0) return '0';
    if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
    if (v >= 10) return v.toFixed(0);
    if (v >= 1) return v.toFixed(1);
    return v.toFixed(2);
  }

  /** Shade the two flanks the head never predicts, rather than pretending the window is 14,336 bp. */
  function drawCropShading(svg: SVGSVGElement, W: number, top: number, bottom: number): void {
    const { lo, hi } = predictedSpan();
    for (const [a, b] of [[0, fractionToBp(lo)], [fractionToBp(hi), SEQ_LEN]] as [number, number][]) {
      const r = el('rect');
      attr(r, {
        x: xOfBp(a, W), y: top, width: Math.max(xOfBp(b, W) - xOfBp(a, W), 0), height: bottom - top,
        fill: 'var(--color-muted)', 'fill-opacity': 0.1,
      });
      svg.append(r);
    }
    svg.append(text(xOfBp(0, W) + 2, top + 10, 'cropped', 'vp-ax', 'start'));
    svg.append(text(xOfBp(SEQ_LEN, W) - 2, top + 10, 'cropped', 'vp-ax', 'end'));
  }

  /**
   * A labelled channel axis down the left of a stage's raster.
   *
   * Without it the vertical axis is an unlabelled block: a reader can see that 384 rows are drawn
   * and cannot tell which row is channel 200. The raster keeps its full width -- shrinking it to
   * the tensor's true aspect would make the bottleneck unreadable -- so the DIMENSIONS are carried
   * by this axis, the bp ruler beneath, and the aspect swatch beside the title.
   */
  function drawChannelAxis(
    ctx: CanvasRenderingContext2D,
    channels: number,
    rowH: number,
    width: number,
    named: boolean,
  ): void {
    if (named) return;                    // the head labels its four rows by assay group instead
    const muted = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';
    const rule = getComputedStyle(host).getPropertyValue('--color-rule').trim() || '#e5e7eb';
    const h = channels * rowH;
    // Round tick counts, so the labels read 0/96/192/288/384 rather than 0/77/154.
    const step = channels <= 8 ? 1
      : channels <= 128 ? Math.round(channels / 4)
        : Math.round(channels / 4 / 32) * 32 || 32;
    ctx.save();
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = muted;
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    for (let c = 0; c <= channels; c += step) {
      const y = Math.min((c / channels) * h, h - 0.5);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(PLOT.left - 4, y + 0.5);
      ctx.lineTo(PLOT.left, y + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(String(c), PLOT.left - 6, y + 8);
    }
    ctx.save();
    ctx.translate(10, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('channel', 0, 0);
    ctx.restore();
    ctx.restore();
  }

  /**
   * A swatch at the tensor's REAL positions:channels ratio, beside the title.
   *
   * The raster is drawn full width at every stage, which is what makes it readable and also what
   * hides the shape: 16,384 x 4 and 128 x 384 render as blocks of similar size. The swatch carries
   * the proportion the raster cannot -- a sliver for the input, a tall block for the bottleneck --
   * on a log scale, because the true ratio spans four orders of magnitude and a linear swatch for
   * the input would be one pixel tall.
   */
  function drawAspectSwatch(positions: number, channels: number): void {
    if (!aspectCanvas) return;
    const W = 34;
    const H = 22;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    aspectCanvas.width = Math.round(W * dpr);
    aspectCanvas.height = Math.round(H * dpr);
    aspectCanvas.style.width = `${W}px`;
    aspectCanvas.style.height = `${H}px`;
    const ctx = aspectCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // log2 of each extent, mapped onto the swatch. Monotone in the true quantity, so the ordering
    // between stages is exact even though the ratio is compressed.
    const lp = Math.log2(Math.max(positions, 1)) / Math.log2(SEQ_LEN);
    const lc = Math.log2(Math.max(channels, 1)) / Math.log2(N_TRACKS);
    const w = Math.max(2, lp * (W - 2));
    const h = Math.max(2, lc * (H - 2));
    ctx.fillStyle = getComputedStyle(host).getPropertyValue('--vp-accent').trim() || '#3976a8';
    ctx.globalAlpha = 0.75;
    ctx.fillRect((W - w) / 2, (H - h) / 2, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = getComputedStyle(host).getPropertyValue('--color-rule').trim() || '#e5e7eb';
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    aspectCanvas.dataset.shape = `${positions}x${channels}`;
  }

  /**
   * Gene models as a genome browser draws them: one row per non-overlapping set.
   *
   * Every feature used to draw on a single line, distinguished only by opacity, so in the eight
   * shipped windows that contain an overlap one gene was painted over another and simply could not
   * be read. `packGeneRows` is the standard greedy assignment; measured, no window needs more than
   * two rows, so expanding costs one row and hides nothing.
   */
  function drawGeneRowsSvg(svg: SVGSVGElement, locus: Locus, W: number, top: number): number {
    const rows = geneRowsExpanded ? packGeneRows(locus.features) : locus.features.map(() => 0);
    const nRows = Math.max(...rows) + 1;
    const rowH = 11;
    locus.features.forEach((f, i) => {
      const own = f.name === locus.id;
      const mid = top + rows[i] * rowH + 5;
      const x0 = xOfBp(f.txStart, W);
      const x1 = xOfBp(f.txEnd, W);
      const line = el('line');
      attr(line, {
        x1: x0, x2: x1, y1: mid, y2: mid,
        stroke: 'var(--vp-orf)', 'stroke-width': 1, 'stroke-opacity': own ? 0.9 : 0.5,
      });
      svg.append(line);
      // Direction, drawn on the intron line where a browser puts it.
      const fwd = f.strand === '+';
      for (let x = x0 + 7; x < x1 - 3; x += 13) {
        const chev = el('path');
        attr(chev, {
          d: `M${(x - (fwd ? 2 : -2)).toFixed(1)} ${mid - 2.4} L${(x + (fwd ? 2 : -2)).toFixed(1)} ${mid}`
            + ` L${(x - (fwd ? 2 : -2)).toFixed(1)} ${mid + 2.4}`,
          fill: 'none', stroke: 'var(--vp-orf)', 'stroke-width': 0.7,
          'stroke-opacity': own ? 0.85 : 0.45,
        });
        svg.append(chev);
      }
      for (const piece of geneTrackShapes(f)) {
        if (piece.kind === 'intron') continue;
        const h = piece.kind === 'cds' ? 8 : 4;
        const r = el('rect');
        attr(r, {
          x: xOfBp(piece.start, W), y: mid - h / 2,
          width: Math.max(xOfBp(piece.end, W) - xOfBp(piece.start, W), 1), height: h,
          fill: 'var(--vp-orf)', 'fill-opacity': own ? 0.85 : 0.45,
        });
        svg.append(r);
      }
      // After the gene rather than above it: above put the name straight through the bp ruler.
      if (own) svg.append(text(x1 + 4, mid + 3, locus.gene, 'vp-ax', 'start'));
    });
    svg.dataset.geneRows = String(nRows);
    return nRows;
  }

  // ---------------------------------------------------------------- predicted track
  function renderTrack(): void {
    if (!trackSvg) return;
    clear(trackSvg);
    const W = 1000;
    const H = 250;
    attr(trackSvg, { viewBox: `0 0 ${W} ${H}` });
    const n = N_BINS;
    const locusId = LOCI[locusIndex].id;
    const vals = predictedGroup(locusId, groupIndex, current);
    if (!vals) {
      trackSvg.append(text(W / 2, H / 2, emptyReason, 'vp-ax'));
      return;
    }
    const truth = showTruth
      ? TRUTH.loci?.[LOCI[locusIndex].id]?.[TRACK_GROUPS[groupIndex].id]
      : undefined;
    // Prediction and measurement live on different absolute scales, so each is drawn against its
    // own maximum; the number that carries the comparison is the correlation, not the overlap.
    const max = Math.max(...vals, 1e-6);
    const truthMax = truth ? Math.max(...truth, 1e-6) : 1;
    const plotTop = PLOT.top;
    const plotBottom = H - PLOT.bottom - GENE_H;
    const locus = LOCI[locusIndex];

    drawCropShading(trackSvg, W, plotTop, plotBottom);
    drawAxes(trackSvg, W, plotTop, plotBottom, max, 'predicted coverage (a.u.)', locus, H - 3);

    // Bin i covers CROP_BP + i*BIN_BP, which is where it is now drawn -- not stretched across the
    // whole panel as if the model predicted the flanks it never sees.
    const bx = (i: number) => xOfBp(CROP_BP + i * BIN_BP, W);
    const yOf = (v: number, ceiling: number) =>
      plotBottom - (useLogAxis ? logAxis(v, ceiling) : ceiling > 0 ? v / ceiling : 0)
        * (plotBottom - plotTop);

    // The window the paper's figure prints, so a reader can see which slice of the 896 bins
    // Figure 4 was looking at.
    if (locus.figureWindow) {
      const { binStart, binEnd } = locus.figureWindow;
      const frame = el('rect');
      attr(frame, {
        x: bx(binStart), y: plotTop, width: Math.max(bx(binEnd) - bx(binStart), 2),
        height: plotBottom - plotTop,
        fill: 'var(--vp-orf)', 'fill-opacity': 0.08,
        stroke: 'var(--vp-orf)', 'stroke-opacity': 0.5, 'stroke-dasharray': '3 2',
      });
      trackSvg.append(frame);
      trackSvg.append(text(bx(binStart) + 3, plotTop + 10, locus.figurePanel ?? 'figure window', 'vp-ax', 'start'));
    }

    drawGeneRowsSvg(trackSvg, locus, W, plotBottom + 18);

    let d = `M${bx(0).toFixed(2)} ${yOf(vals[0], max).toFixed(2)}`;
    for (let i = 1; i < n; i += 1) d += ` L${bx(i).toFixed(2)} ${yOf(vals[i], max).toFixed(2)}`;
    const path = el('path');
    attr(path, { d, fill: 'none', stroke: 'var(--vp-track)', 'stroke-width': 1.4 });
    trackSvg.append(path);

    if (current && reference && reference !== current) {
      let rd = `M${bx(0).toFixed(2)} ${yOf(reference.tracks[groupIndex], max).toFixed(2)}`;
      for (let i = 1; i < n; i += 1) {
        rd += ` L${bx(i).toFixed(2)} ${yOf(reference.tracks[i * 4 + groupIndex], max).toFixed(2)}`;
      }
      const rp = el('path');
      attr(rp, { d: rd, fill: 'none', stroke: 'var(--color-muted)', 'stroke-width': 1, 'stroke-dasharray': '3 3' });
      trackSvg.insertBefore(rp, path);
    }
    if (truth) {
      let td = `M${bx(0).toFixed(2)} ${yOf(truth[0], truthMax).toFixed(2)}`;
      for (let i = 1; i < n; i += 1) {
        td += ` L${bx(i).toFixed(2)} ${yOf(truth[i], truthMax).toFixed(2)}`;
      }
      const tp = el('path');
      attr(tp, { d: td, fill: 'none', stroke: 'var(--vp-fire)', 'stroke-width': 1.1, 'stroke-opacity': 0.85 });
      trackSvg.append(tp);
      const r = pearson(Array.from(vals), truth);
      if (truthStat) truthStat.textContent = `Pearson r = ${r.toFixed(3)} vs measured`;
      trackSvg.dataset.pearson = r.toFixed(4);
    } else if (truthStat) {
      truthStat.textContent = showTruth ? 'no measured coverage loaded' : '';
      delete trackSvg.dataset.pearson;
    }

    // The traced region, marked on the curve it was selected from.
    if (tracedBins) {
      const r = el('rect');
      attr(r, {
        x: bx(tracedBins.start), y: plotTop,
        width: Math.max(bx(tracedBins.end) - bx(tracedBins.start), 1.5), height: plotBottom - plotTop,
        fill: 'var(--vp-accent)', 'fill-opacity': 0.12,
        stroke: 'var(--vp-accent)', 'stroke-opacity': 0.55,
      });
      trackSvg.append(r);
    }

    let argmax = 0;
    for (let i = 1; i < n; i += 1) if (vals[i] > vals[argmax]) argmax = i;
    // Full precision, for the python-vs-browser parity check. The visible label is rounded, and
    // comparing rounded labels is how two different numbers come to look identical.
    trackSvg.dataset.peak = String(max);
    trackSvg.dataset.peakBin = String(argmax);
    trackSvg.dataset.domainBp = `0-${SEQ_LEN}`;
    trackSvg.append(
      text(PLOT.left, 13,
        `predicted ${TRACK_GROUPS[groupIndex].label} · 896 bins × 16 bp over bp `
        + `${CROP_BP.toLocaleString()}–${(CROP_BP + N_BINS * BIN_BP).toLocaleString()}`
        + ` · peak ${max.toFixed(2)} at bin ${argmax}`
        + (current?.backend === 'precomputed' || !current ? ' · precomputed' : ' · live run'),
        'vp-ax vp-caption', 'start'),
    );
  }

  /**
   * Load a locus's precomputed activations and per-track predictions.
   *
   * Everything the model would produce, packed as uint8 PNGs with per-row scales: 2-4 MB against a
   * 28.6 MB model download and a 17 s inference, and it means every layer view and all 5,215 track
   * curves work with no model at all. The browser's own PNG decoder does the decompression.
   */
  async function loadPrecomputed(locusId: string): Promise<FullResult | null> {
    // NOT /shorkie/: with a custom apex domain on the user site, GitHub serves each project repo's
    // Pages at khchao.com/<repo>/, and the `shorkie` repo already owns that path. Files deployed
    // there from this site are shadowed and 404 -- they did.
    const base = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/vp-data`;
    const meta = (await fetch(`${base}/${locusId}.json`).then((r) =>
      r.ok ? r.json() : null,
    ).catch(() => null)) as Record<
      string,
      { rows: number; cols: number; lo: number[]; hi: number[]; space?: string }
    > | null;
    if (!meta) return null;

    const plane = async (suffix: string): Promise<Float32Array | null> => {
      const spec = meta[suffix];
      if (!spec) return null;
      const blob = await fetch(`${base}/${locusId}-${suffix}.png`).then((r) => (r.ok ? r.blob() : null));
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
      const out = new Float32Array(spec.rows * spec.cols);
      for (let r = 0; r < spec.rows; r += 1) {
        const lo = spec.lo[r];
        const range = Math.max(spec.hi[r] - lo, 1e-9);
        for (let c = 0; c < spec.cols; c += 1) {
          // Greyscale: R is the value; the PNG carries one channel.
          const v = (px[(r * spec.cols + c) * 4] / 255) * range + lo;
          // Coverage is quantized in log space -- 256 levels spread linearly across a range that
          // spans orders of magnitude leaves a visible staircase in the low values on a log plot
          // (2.2e-1 of the axis, against 1.96e-3 this way).
          out[r * spec.cols + c] = spec.space === 'log' ? Math.expm1(v) : v;
        }
      }
      return out;
    };

    const [tracksT, stages, stem, attn] = await Promise.all(
      ['tracks', 'stages', 'stem', 'attn'].map(plane),
    );
    if (!tracksT || !stages || !stem || !attn) return null;

    // The PNG is track-major [5215, 896]; the renderers read bin-major [896, 5215].
    const allTracks = new Float32Array(N_BINS * N_TRACKS);
    for (let k = 0; k < N_TRACKS; k += 1) {
      for (let b = 0; b < N_BINS; b += 1) allTracks[b * N_TRACKS + k] = tracksT[k * N_BINS + b];
    }
    // The group means come from shorkiePredictions.json, which stores them at full precision.
    // Recomputing them from the uint8 per-track planes would give a slightly different headline
    // number than the file the page already loaded -- two sources for one quantity.
    const exact = PREDICTIONS.loci[locusId]?.groups;
    const tracks = new Float32Array(N_BINS * 4);
    for (let gi = 0; gi < 4; gi += 1) {
      const row = exact?.[gi];
      for (let b = 0; b < N_BINS; b += 1) {
        if (row) {
          tracks[b * 4 + gi] = row[b];
        } else {
          const g = TRACK_GROUPS[gi];
          let sum = 0;
          for (let k = g.start; k < g.end; k += 1) sum += allTracks[b * N_TRACKS + k];
          tracks[b * 4 + gi] = sum / g.count;
        }
      }
    }

    return {
      input: inputPlane(LOCI[locusIndex].sequence),
      tracks,
      stemProfile: stem,
      attention: attn,
      stageMaps: stages,
      allTracks,
      backend: 'precomputed',
      ms: 0,
    };
  }

  /**
   * Is this a result we are willing to show?
   *
   * A WebGPU pipeline that fails validation does not throw: onnxruntime reports the run as
   * successful and the graph emits ZEROS. That is how the page came to print "Done — 1689 ms on
   * WebGPU" beside four predicted peaks of 0.0000. Never trust a run without looking at it.
   */
  function outputLooksReal(tracks: Float32Array): boolean {
    let sum = 0;
    for (let i = 0; i < tracks.length; i += 1) {
      const v = tracks[i];
      if (!Number.isFinite(v)) return false;
      sum += Math.abs(v);
    }
    return sum > 0;
  }

  async function ensureSession(force?: 'wasm'): Promise<boolean> {
    if (session && !force) return true;
    setBusy(true, 'Loading runtime…');
    setStatus('Loading ONNX Runtime…');
    ort = await import('onnxruntime-web');
    ort.env.wasm.wasmPaths = '/ort/';
    ort.env.wasm.numThreads = 1; // no cross-origin isolation on GitHub Pages, so no SharedArrayBuffer
    setBusy(true, 'Downloading 28.6 MB…');
    setStatus('Downloading Shorkie (28.6 MB) — this happens once.');
    // Try WebGPU first, then fall back -- and record which one actually initialised. Reporting
    // "WebGPU or maybe WASM" would be a guess, and the whole point of the readout is the real
    // number attached to the real backend.
    if (force === 'wasm') {
      // Drop the WebGPU session, or the create below is skipped and the retry runs on the very
      // backend that just failed.
      await (session as { release?: () => Promise<void> } | null)?.release?.().catch(() => {});
      session = null;
    }
    if ('gpu' in navigator && force !== 'wasm') {
      try {
        session = await ort.InferenceSession.create('/models/shorkie-fp16.onnx', {
          executionProviders: ['webgpu'],
        });
        backend = 'WebGPU';
      } catch {
        session = null;
      }
    }
    if (!session) {
      session = await ort.InferenceSession.create('/models/shorkie-fp16.onnx', {
        executionProviders: ['wasm'],
      });
      backend = 'WASM, single-threaded';
    }
    return true;
  }

  async function runFull(): Promise<void> {
    try {
      // `sequence` -- not the locus -- because a motif knockout edits it in place, and reading
      // the locus here would silently run the unmodified window and report no effect.
      const input = encodeInput(sequence, SPECIES_S_CEREVISIAE);

      /** One attempt on whichever backend ensureSession picks. */
      const attempt = async (force?: 'wasm') => {
        await ensureSession(force);
        setBusy(true, backend.startsWith('WebGPU') ? 'Running on GPU…' : 'Running…');
        setStatus(
          backend.startsWith('WebGPU')
            ? 'Running inference on WebGPU — about a second.'
            : 'Running inference — about 17 s on WebAssembly.',
        );
        const started = performance.now();
        const o = ort as NonNullable<typeof ort>;
        const feeds = { sequence: new o.Tensor('float32', input, [1, SEQ_LEN, 170]) };
        const res = await (session as {
          run: (f: unknown) => Promise<Record<string, { data: Float32Array }>>;
        }).run(feeds);
        return { res, ms: performance.now() - started };
      };

      let { res: out, ms } = await attempt().catch(async (err) => {
        setStatus(`WebGPU run failed (${err instanceof Error ? err.message : err}) — retrying on WebAssembly.`);
        return attempt('wasm');
      });

      // A WebGPU pipeline rejected by validation does not throw; it returns zeros and onnxruntime
      // calls that a success. Check before believing it, and fall back rather than show a flat line.
      if (!outputLooksReal(out.tracks.data)) {
        if (backend.startsWith('WebGPU')) {
          setStatus('WebGPU returned an empty prediction — retrying on WebAssembly.');
          ({ res: out, ms } = await attempt('wasm'));
        }
        if (!outputLooksReal(out.tracks.data)) {
          throw new Error('the model returned an all-zero or non-finite prediction');
        }
      }
      current = {
        input: inputPlane(sequence),
        tracks: out.tracks.data,
        stemProfile: out.stem_profile.data,
        attention: out.attention.data,
        stageMaps: out.stage_maps.data,
        allTracks: out.all_tracks.data,
        backend,
        ms,
      };
      if (!reference) reference = current;
      // Stamp which locus this forward pass belongs to. The audit asserts it matches the selected
      // one, so a view that survives a locus change fails the gate instead of quietly misleading.
      host.dataset.vpResultLocus = LOCI[locusIndex].id;
      host.dataset.vpResultSource = 'live';
      emptyReason = `${LOCI[locusIndex].gene} predicted.`;
      flow?.setActivations({
        input: current.input,
        stemProfile: current.stemProfile,
        stageMaps: current.stageMaps,
        attention: current.attention,
        tracks: current.tracks,
      } satisfies FlowActivations);
      renderTrack();
      renderStageDetail(flow?.selected() ?? null);
      renderHeatmap();
      renderSingleTrack();
      setBusy(false);
      setStatus(`Done — ${ms.toFixed(0)} ms on ${current.backend}.`);
    } catch (err) {
      setStatus(`Inference failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      // Whatever happened -- success, a failed download, a thrown session -- the button comes back.
      setBusy(false);
    }
  }

  /**
   * Every predicted track, one row each, in the order the targets sheet lists them -- so the four
   * assay blocks read as contiguous bands rather than needing a legend to believe.
   */
  function renderHeatmap(): void {
    if (!heatCanvas) return;
    const cssW = heatCanvas.clientWidth || 900;
    const cssH = 300;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    heatCanvas.width = Math.round(cssW * dpr);
    heatCanvas.height = Math.round(cssH * dpr);
    heatCanvas.style.height = `${cssH}px`;
    const ctx = heatCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const muted = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';

    if (!current) {
      ctx.fillStyle = muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`${emptyReason}  All 5,215 tracks appear here once it has run.`, 4, 22);
      if (heatStat) heatStat.textContent = '';
      return;
    }

    const labelW = 78;
    const plotW = cssW - labelW;
    const bins = renderHeatmapRows(ctx, plotW, cssH, labelW);
    if (heatStat) {
      heatStat.textContent = `${N_TRACKS.toLocaleString()} tracks × ${N_BINS} bins`
        + (bins < N_TRACKS
          ? ` · ${bins} drawn rows, each the max of ${Math.floor(N_TRACKS / bins)}–${Math.ceil(N_TRACKS / bins)}`
          : '');
    }
  }

  function renderHeatmapRows(
    ctx: CanvasRenderingContext2D, plotW: number, cssH: number, labelW: number,
  ): number {
    const all = current!.allTracks;                      // [896, 5215], bin-major
    const rows = trackRowBinning(N_TRACKS, cssH);
    const rowH = cssH / rows.length;
    const colW = plotW / N_BINS;
    const fire = getComputedStyle(host).getPropertyValue('--vp-fire').trim() || '#b0455a';
    const rule = getComputedStyle(host).getPropertyValue('--color-rule').trim() || '#e5e7eb';
    const muted = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';

    // One scale for the whole matrix, so the bands are comparable to each other. Log, because the
    // assays differ by orders of magnitude and a linear ramp shows only RNA-seq.
    let max = 0;
    for (let i = 0; i < all.length; i += 1) if (all[i] > max) max = all[i];

    ctx.fillStyle = fire;
    rows.forEach((span, r) => {
      for (let b = 0; b < N_BINS; b += 1) {
        let peak = 0;
        for (let k = span.start; k < span.end; k += 1) {
          const v = all[b * N_TRACKS + k];
          if (v > peak) peak = v;
        }
        const a = logAxis(peak, max);
        if (a < 0.06) continue;
        ctx.globalAlpha = a;
        ctx.fillRect(labelW + b * colW, r * rowH, Math.max(colW, 0.7), Math.max(rowH, 0.7));
      }
    });
    ctx.globalAlpha = 1;

    // Band boundaries and labels down the left edge.
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'left';
    let labelY = -Infinity;
    for (const g of TRACK_GROUPS) {
      const y0 = (g.start / N_TRACKS) * cssH;
      const y1 = (g.end / N_TRACKS) * cssH;
      ctx.strokeStyle = rule;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(labelW, y0);
      ctx.lineTo(labelW + plotW, y0);
      ctx.stroke();
      ctx.fillStyle = muted;
      // ChIP-MNase is 20 tracks of 5,215, so its band is under 2 px tall and its label would sit
      // on its neighbour's. Give every label the row it needs and push it down past the last one.
      const label = `${g.label.replace('RNA-seq · ', '')} ${g.count.toLocaleString()}`;
      const wanted = Math.max(y0 + 9, labelY + 11);
      if (wanted < cssH - 2) {
        ctx.fillText(label, 2, wanted);
        labelY = wanted;
      }
    }
    // Where the selected track sits.
    ctx.strokeStyle = getComputedStyle(host).getPropertyValue('--vp-accent').trim() || '#3976a8';
    ctx.lineWidth = 1.4;
    const sy = (selectedTrack / N_TRACKS) * cssH;
    ctx.beginPath();
    ctx.moveTo(labelW, sy);
    ctx.lineTo(labelW + plotW, sy);
    ctx.stroke();

    heatCanvas!.onclick = (ev) => {
      const box = heatCanvas!.getBoundingClientRect();
      const frac = (ev.clientY - box.top) / box.height;
      selectedTrack = Math.min(N_TRACKS - 1, Math.max(0, Math.floor(frac * N_TRACKS)));
      renderPicker(true);
      renderHeatmap();
      renderSingleTrack();
    };
    return rows.length;
  }

  /** The one track the reader picked, at full 896-bin resolution, named. */
  function renderSingleTrack(): void {
    if (!singleSvg) return;
    clear(singleSvg);
    const W = 1000;
    const H = 178;
    attr(singleSvg, { viewBox: `0 0 ${W} ${H}` });

    const locusId = LOCI[locusIndex].id;
    const shipped = PREDICTIONS.loci[locusId];
    const vals = new Float32Array(N_BINS);
    let label: string;
    if (current) {
      for (let b = 0; b < N_BINS; b += 1) vals[b] = current.allTracks[b * N_TRACKS + selectedTrack];
      label = TRACK_NAMES[selectedTrack];
    } else if (shipped) {
      // Every one of the 5,215 tracks needs a live forward pass; the shipped file carries the T0
      // baseline mean, which is the set the paper's Figure 4 ISM uses.
      vals.set(shipped.baseline.slice(0, N_BINS));
      label = `T0 baseline · mean of ${PREDICTIONS.baselineTracks.toLocaleString()} tracks`;
    } else {
      singleSvg.append(text(W / 2, H / 2, emptyReason, 'vp-ax'));
      return;
    }
    let max = 0;
    for (let i = 0; i < N_BINS; i += 1) if (vals[i] > max) max = vals[i];
    const plotTop = PLOT.top;
    const plotBottom = H - PLOT.bottom;
    // The same full-window axis as the plot above, so the two coverage panels can be read against
    // each other and against the attribution -- they used to run on three different domains.
    const bx = (i: number) => xOfBp(CROP_BP + i * BIN_BP, W);
    const y = (v: number) =>
      plotBottom - (useLogAxis ? logAxis(v, max) : max > 0 ? v / max : 0) * (plotBottom - plotTop);

    drawCropShading(singleSvg, W, plotTop, plotBottom);
    drawAxes(singleSvg, W, plotTop, plotBottom, max, 'predicted (a.u.)',
      LOCI[locusIndex], H - 3);

    let d = `M${bx(0).toFixed(2)} ${y(vals[0]).toFixed(2)}`;
    for (let i = 1; i < N_BINS; i += 1) d += ` L${bx(i).toFixed(2)} ${y(vals[i]).toFixed(2)}`;
    const path = el('path');
    attr(path, { d, fill: 'none', stroke: 'var(--vp-track)', 'stroke-width': 1.2 });
    singleSvg.append(path);

    let argmax = 0;
    for (let i = 1; i < N_BINS; i += 1) if (vals[i] > vals[argmax]) argmax = i;
    singleSvg.append(
      text(PLOT.left, 13,
        `${label} · peak ${max.toFixed(2)} at bin ${argmax}`,
        'vp-ax vp-caption', 'start'),
    );
    singleSvg.dataset.peak = String(max);
    singleSvg.dataset.track = label;
    if (trackNameEl) {
      trackNameEl.textContent = current
        ? `track ${selectedTrack.toLocaleString()} · ${TRACK_NAMES[selectedTrack]} · ${trackGroupOf(selectedTrack).label}`
        : 'Load the model to pick any of the 5,215 tracks individually.';
    }
  }

  /**
   * The Figure 4 motifs for this locus, as buttons that knock the motif out.
   *
   * These are consensus matches found by scanning the shipped sequence, so their positions are
   * checkable -- and the caption says so, because the scan is not the paper's annotation: it finds
   * sites Figure 4 does not label and misses at least one that it does.
   */
  function renderMotifs(): void {
    if (!motifBox || !motifList) return;
    const locus = LOCI[locusIndex];
    const motifs = locus?.motifs ?? [];
    motifBox.hidden = motifs.length === 0;
    clear(motifList);
    if (!motifs.length) return;

    for (const m of motifs) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vp-motif';
      const active = knockedOut?.start === m.start && knockedOut?.name === m.name;
      b.setAttribute('aria-pressed', String(active));
      const label = document.createElement('span');
      label.textContent = `${m.name}${m.strand === '-' ? ' (−)' : ''}`;
      const pos = document.createElement('span');
      pos.className = 'pos';
      pos.textContent = sequence.slice(m.start, m.end);
      b.append(label, pos);
      b.addEventListener('click', () => void toggleKnockout(m));
      motifList.append(b);
    }
    if (knockoutStat && !knockedOut) {
      knockoutStat.textContent = current
        ? ''
        : 'Load the model first — a knockout is measured by re-running it.';
    }
  }

  /** Scramble a motif (or restore it) and re-run, reporting what the prediction did. */
  async function toggleKnockout(m: Motif): Promise<void> {
    if (!session) {
      setStatus('Load the full model before knocking a motif out.');
      return;
    }
    const restoring = knockedOut?.start === m.start && knockedOut?.name === m.name;
    const original = LOCI[locusIndex].sequence;

    if (restoring) {
      knockedOut = null;
      sequence = original;
    } else {
      if (!knockedOut) peakBeforeKnockout = peakOf(current);
      knockedOut = m;
      // Try seeds until the span actually changes; a shuffle can return the identity, and a
      // knockout that did not knock anything out would report a spurious zero effect.
      let out = original;
      for (let seed = 1; seed <= 12; seed += 1) {
        out = knockoutMotif(original, m.start, m.end, seed);
        if (out.slice(m.start, m.end) !== original.slice(m.start, m.end)) break;
      }
      sequence = out;
    }
    renderMotifs();
    await runFull();

    if (knockoutStat) {
      const after = peakOf(current);
      knockoutStat.textContent = knockedOut
        ? `${knockedOut.name} scrambled — predicted peak over ${LOCI[locusIndex].gene} `
          + `${peakBeforeKnockout.toFixed(2)} → ${after.toFixed(2)} `
          + `(${((after / Math.max(peakBeforeKnockout, 1e-9) - 1) * 100).toFixed(1)}%).`
          + ' Click again to restore.'
        : `Restored — predicted peak over ${LOCI[locusIndex].gene} back to ${after.toFixed(2)}.`;
    }
  }

  /**
   * Predicted peak over the gene this window is named for -- NOT over the whole window.
   *
   * A 14,336 bp yeast window holds a dozen genes and the tallest is rarely the one whose promoter
   * you just edited: on the KRE33 window the global peak is 114.3 at bin 249 (YNL135C) while
   * KRE33's own body peaks at 7.8. Measuring the global peak reported a 0.4% effect for a motif
   * knockout, which is a measurement of an unrelated gene, not of the motif.
   */
  function peakOf(r: FullResult | null): number {
    if (!r) return 0;
    const locus = LOCI[locusIndex];
    const span = geneBodyBins(locus.features, locus.id) ?? { start: 0, end: N_BINS };
    let max = 0;
    for (let i = span.start; i < span.end; i += 1) {
      const v = r.tracks[i * 4 + groupIndex];
      if (v > max) max = v;
    }
    return max;
  }

  /**
   * Throw away the current forward pass and every view of it, together.
   *
   * `setMode` used to null `current` and re-render only the track panels. The flow canvas kept the
   * previous locus's activations and the layer-detail canvas kept its pixels, so switching from
   * TDH3 to PGK1 left 133,405 px of TDH3's neurons on screen under PGK1's name while the track
   * panel below correctly went blank -- which reads as "I ran it and got no output".
   */
  function clearResults(reason: string): void {
    ism = null;
    occl = null;
    delete host.dataset.vpResultLocus;
    delete host.dataset.vpResultSource;
    current = null;
    reference = null;
    flow?.setActivations(null);
    emptyReason = reason;
    renderTrack();
    renderStageDetail(flow?.selected() ?? null);
    renderHeatmap();
    renderSingleTrack();
    renderMotifs();
  }

  /** Mark the run button busy so a 17 s inference does not look like a frozen page. */
  function setBusy(on: boolean, label?: string): void {
    if (!runBtn) return;
    runBtn.disabled = on;
    runBtn.dataset.busy = String(on);
    if (label) runBtn.textContent = label;
    else if (!on) runBtn.textContent = session ? 'Re-run live layers' : 'Load model — live layers & editing';
  }

  /**
   * The card's own background, so a neutral cell sits flush with it in any of the six themes.
   *
   * Read off a real ELEMENT, not a custom property: `getPropertyValue('--vp-panel')` hands back the
   * literal `var(--color-surface, #fff)` rather than a colour. And walk up past transparent
   * ancestors -- an unpainted element computes to `rgba(0, 0, 0, 0)`, which parses as black and
   * turned the whole raster near-black on a white page.
   */
  function neutralRgb(): Rgb {
    let el: HTMLElement | null = stageMapCanvas?.parentElement ?? host;
    while (el) {
      const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).backgroundColor);
      if (m) {
        const parts = m[1].split(',').map((v) => Number.parseFloat(v));
        if (parts.length < 4 || parts[3] > 0.5) {
          return [parts[0], parts[1], parts[2]];
        }
      }
      el = el.parentElement;
    }
    // Nothing opaque above us: pick from the resolved ink instead of assuming a light page.
    const ink = /rgba?\(([^)]+)\)/.exec(getComputedStyle(host).color);
    const lum = ink ? Number.parseFloat(ink[1].split(',')[0]) : 0;
    return lum > 128 ? [24, 26, 30] : [255, 255, 255];
  }

  /** Blit a [channels][positions] map, one pixel per cell, scaled to fill `w` x `h`. */
  function blitMap(
    ctx: CanvasRenderingContext2D,
    data: ArrayLike<number>,
    channels: number,
    positions: number,
    scale: Parameters<typeof paintActivationMap>[3],
    x: number, y: number, w: number, h: number,
  ): void {
    const rgba = paintActivationMap(data, channels, positions, scale, neutralRgb());
    // Draw at native cell size on an offscreen canvas, then scale it up in one call: 49,000
    // fillRects per redraw is what made painting every cell unaffordable before.
    const off = document.createElement('canvas');
    off.width = positions;
    off.height = channels;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;
    // createImageData + set, rather than the ImageData constructor, so the buffer type is the
    // canvas's own rather than whatever ArrayBuffer flavour the caller's array carries.
    const img = offCtx.createImageData(positions, channels);
    img.data.set(rgba);
    offCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, x, y, w, h);
  }

  /** Take a locus's precomputed pack as the current result, so every view fills with no model. */
  async function adoptPrecomputed(locusId: string): Promise<void> {
    const token = (precomputeToken += 1);
    delete host.dataset.vpPackFailed;
    const got = await loadPrecomputed(locusId);
    // A slower fetch for a locus the reader has already navigated away from must not overwrite the
    // one they are looking at now.
    if (token !== precomputeToken || locusId !== LOCI[locusIndex].id) return;
    if (!got) {
      // A flag the gate can wait on, so a failed fetch is a reported failure rather than a timeout.
      host.dataset.vpPackFailed = 'true';
      emptyReason = `${LOCI[locusIndex].gene}: precomputed layers unavailable — load the model to compute them.`;
      renderStageDetail(flow?.selected() ?? null);
      setStatus(emptyReason);
      return;
    }
    delete host.dataset.vpPackFailed;
    current = got;
    reference = got;
    host.dataset.vpResultLocus = locusId;
    host.dataset.vpResultSource = 'precomputed';
    emptyReason = `${LOCI[locusIndex].gene} — precomputed.`;
    flow?.setActivations({
      input: got.input,
      stemProfile: got.stemProfile,
      stageMaps: got.stageMaps,
      attention: got.attention,
      tracks: got.tracks,
    } satisfies FlowActivations);
    renderTrack();
    renderStageDetail(flow?.selected() ?? null);
    renderHeatmap();
    renderSingleTrack();
    paint3dFaces();
    setStatus(`${LOCI[locusIndex].gene}: all layers and all ${N_TRACKS.toLocaleString()} tracks, precomputed.`);

    // The traceback and mutagenesis packs, fetched after the activations so the page is usable
    // first. Both are small beside the 2-4 MB activation pack.
    const [attr, gotIsm, gotOccl] = await Promise.all([
      loadAttribution(locusId), loadIsm(locusId), loadOccl(locusId),
    ]);
    if (token !== precomputeToken || locusId !== LOCI[locusIndex].id) return;
    attribution = attr;
    ism = gotIsm;
    occl = gotOccl;
    // Open the sequence logo on the mutagenesis window. It is only ~500 bp of a 16,384 bp window,
    // so the default centre misses it entirely and the panel would greet every reader with "pan
    // into it" -- while the paper's own picture sits just off screen.
    if (ism && logoPan) {
      logoPan.value = String(Math.round(windowFraction(ism.start + ism.width / 2) * 1000));
    }
    renderIsmLogo();
    host.dataset.vpTraceReady = attribution ? 'true' : 'false';
    if (anchorSelect) {
      clear(anchorSelect);
      const none = document.createElement('option');
      none.value = '';
      none.textContent = attribution ? 'trace a gene…' : 'traceback unavailable';
      anchorSelect.append(none);
      for (const [i, a] of (attribution?.anchors ?? []).entries()) {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = `${a.label} (${(a.massInside * 100).toFixed(0)}% of its mass)`;
        anchorSelect.append(o);
      }
    }
    renderRegionList();
    renderAttribution();
    refreshRegionViews();
    renderSeqLogo();
  }

  /**
   * Draw a gene track the way a genome browser does.
   *
   * Exons are blocks, thick where coding and thin where UTR; introns are a line with directional
   * chevrons; orientation follows the strand. This replaces one solid bar per gene drawn from
   * txStart/txEnd, which painted straight over introns -- HOP2's own 70 bp intron among them.
   *
   * `fx` maps a bp offset in the window to an x coordinate, so the same routine serves the coverage
   * plot and the layer ruler, which have different horizontal scales.
   */
  /**
   * Gene models on a canvas, in rows, sharing `drawGeneRowsSvg`'s geometry exactly.
   *
   * Two renderers rather than one because the coverage plot is SVG and the attribution and layer
   * rulers are canvas -- but both take bp through `xOfBp`, so they cannot disagree about where an
   * intron is. The tally is counted inside the loop that fills the rectangles, so the gate reads
   * what was drawn rather than what the decomposition returned.
   */
  function drawGeneRowsCanvas(
    ctx: CanvasRenderingContext2D,
    locus: Locus,
    width: number,
    top: number,
    rowH = 11,
  ): number {
    const orf = getComputedStyle(host).getPropertyValue('--vp-orf').trim() || '#6f62a8';
    const muted = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';
    const rows = geneRowsExpanded ? packGeneRows(locus.features) : locus.features.map(() => 0);
    const nRows = Math.max(...rows, 0) + 1;
    let blocks = 0;
    let introns = 0;

    locus.features.forEach((f, i) => {
      const own = f.name === locus.id;
      const mid = top + rows[i] * rowH + rowH / 2;
      const x0 = xOfBp(f.txStart, width);
      const x1 = xOfBp(f.txEnd, width);
      ctx.globalAlpha = own ? 0.95 : 0.45;
      ctx.strokeStyle = orf;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, mid + 0.5);
      ctx.lineTo(x1, mid + 0.5);
      ctx.stroke();

      const fwd = f.strand === '+';
      for (let x = x0 + 7; x < x1 - 3; x += 13) {
        ctx.beginPath();
        ctx.moveTo(x - (fwd ? 2 : -2), mid - 2.4);
        ctx.lineTo(x + (fwd ? 2 : -2), mid);
        ctx.lineTo(x - (fwd ? 2 : -2), mid + 2.4);
        ctx.stroke();
      }

      ctx.fillStyle = orf;
      for (const piece of geneTrackShapes(f)) {
        if (piece.kind === 'intron') {
          introns += 1;                              // drawn as the line + chevrons above
          continue;
        }
        blocks += 1;
        const bh = piece.kind === 'cds' ? Math.max(rowH * 0.72, 5) : Math.max(rowH * 0.38, 3);
        const bx = xOfBp(piece.start, width);
        ctx.fillRect(bx, mid - bh / 2, Math.max(xOfBp(piece.end, width) - bx, 1), bh);
      }

      if (own) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = muted;
        ctx.font = '9px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(locus.gene, x1 + 4, mid + 3);
      }
    });
    ctx.globalAlpha = 1;
    ctx.canvas.dataset.vpGeneTrack = JSON.stringify({
      features: locus.features.length, blocks, introns, rows: nRows,
      mode: geneRowsExpanded ? 'expanded' : 'collapsed',
    });
    return nRows;
  }


  /**
   * The cascading track picker: assay block, then regulator / ChIP target / run, then timepoint.
   *
   * 5,215 tracks in one flat list is unusable, and their names carry the experiment's own
   * structure -- ARG80_T0_S757 is a regulator, a timepoint and a sample. `sync` is called after a
   * heatmap click too, so the menus never disagree with the plotted curve.
   */
  function renderPicker(sync = false): void {
    if (!pickGroup || !pickKey || !pickTrack) return;
    const gi = TRACK_GROUPS.findIndex((g) => selectedTrack >= g.start && selectedTrack < g.end);
    const group = TRACK_INDEX.byGroup[gi];
    const parsed = group.tracks.get(
      [...group.tracks.keys()].find((k) => group.tracks.get(k)!.some((p) => p.index === selectedTrack))
        ?? group.keys[0],
    )!;
    const key = parsed[0].regulator ?? parsed[0].accession ?? 'unparsed';

    if (sync || !pickGroup.options.length) {
      clear(pickGroup);
      TRACK_GROUPS.forEach((g, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = `${g.label} (${g.count.toLocaleString()})`;
        pickGroup.append(o);
      });
    }
    pickGroup.value = String(gi);

    clear(pickKey);
    for (const k of group.keys) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = group.tracks.get(k)!.length > 1 ? `${k} (${group.tracks.get(k)!.length})` : k;
      pickKey.append(o);
    }
    pickKey.value = key;

    clear(pickTrack);
    for (const p of parsed) {
      const o = document.createElement('option');
      o.value = String(p.index);
      // Several samples share a timepoint, so the label carries both or two options read alike.
      o.textContent =
        p.timepoint !== undefined ? `T${p.timepoint} · S${p.replicate}`
        : p.replicate !== undefined ? `replicate ${p.replicate}`
        : p.name;
      pickTrack.append(o);
    }
    pickTrack.value = String(selectedTrack);
    pickTrack.disabled = parsed.length < 2;
  }

  function firstTrackOf(groupIdx: number, key?: string): number {
    const group = TRACK_INDEX.byGroup[groupIdx];
    const k = key && group.tracks.has(key) ? key : group.keys[0];
    return group.tracks.get(k)![0].index;
  }

  /**
   * The traceback: which input bases, and which neurons, drive a chosen region of the output.
   *
   * Gradient x input, precomputed offline. Gradients superpose -- d(sum over S)/dx is the sum of
   * the per-bin gradients -- so a dragged region is an EXACT row-sum of the matrix, not an
   * interpolation. `input` is [112 groups x 1024 input bins], `channels` is [112 x 5760] in the
   * same channel order as stage_maps so a stage is a slice, and `anchor` is single-base
   * attribution for each annotated gene and the top peak.
   */
  interface Attribution {
    groupBins: number;
    groups: number;
    inputBins: number;
    anchors: { label: string; kind: string; binStart: number; binEnd: number; massInside: number;
               windowFraction: number; igSum?: number; igGap?: number; igAbsError?: number }[];
    stagePositions: number;
    input: Float32Array;
    channels: Float32Array;
    anchor: Float32Array;
    /** The exact per-stage positional margin, [groups x (stages x stagePositions)]. */
    positions: Float32Array | null;
    /** Integrated gradients per anchor, [anchors x 16384]. */
    ig: Float32Array | null;
    cols: { input: number; channels: number; anchor: number; positions: number; ig: number };
  }

  async function loadAttribution(locusId: string): Promise<Attribution | null> {
    const base = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/vp-data`;
    const meta = await fetch(`${base}/${locusId}-attr.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (!meta) return null;
    const planes = await Promise.all(['input', 'channels', 'anchor', 'positions', 'ig'].map(async (key) => {
      const spec = meta[key];
      const blob = await fetch(`${base}/${locusId}-${key}.png`).then((r) => (r.ok ? r.blob() : null));
      if (!blob || !spec) return null;
      const bitmap = await createImageBitmap(blob);
      const cv = document.createElement('canvas');
      cv.width = spec.cols;
      cv.height = spec.rows;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      if (!cx) return null;
      cx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const px = cx.getImageData(0, 0, spec.cols, spec.rows).data;
      const out = new Float32Array(spec.rows * spec.cols);
      for (let r = 0; r < spec.rows; r += 1) {
        const lo = spec.lo[r];
        const range = Math.max(spec.hi[r] - lo, 1e-12);
        for (let c = 0; c < spec.cols; c += 1) {
          out[r * spec.cols + c] = (px[(r * spec.cols + c) * 4] / 255) * range + lo;
        }
      }
      return out;
    }));
    // `positions` and `ig` arrived after the first three, so a pack written by the older
    // generator has neither. Degrade to the exact-margins-unavailable path rather than failing.
    if (planes.slice(0, 3).some((p) => !p)) return null;
    return {
      groupBins: meta.groupBins, groups: meta.groups, inputBins: meta.inputBins,
      anchors: meta.anchors,
      stagePositions: meta.stagePositions ?? 128,
      input: planes[0]!, channels: planes[1]!, anchor: planes[2]!,
      positions: planes[3] ?? null, ig: planes[4] ?? null,
      cols: {
        input: meta.input.cols, channels: meta.channels.cols, anchor: meta.anchor.cols,
        positions: meta.positions?.cols ?? 0, ig: meta.ig?.cols ?? 0,
      },
    };
  }

  interface Occl {
    plane: Float32Array;   // [windows x 896], logSED per output bin when that window is ablated
    rows: number;
    cols: number;
    win: number;
  }

  interface Ism {
    plane: Float32Array;      // [4 x width], rows A/C/G/T, the reference base's row exactly zero
    start: number;
    width: number;
    ref: number;
    tss: number;
  }

  /**
   * Load a locus's mutagenesis plane. It rides in the same sidecar as the activation packs, so a
   * locus without one simply has no `ism` key and the panel says so rather than failing.
   */
  /**
   * Load a locus's occlusion matrix: what every output bin loses when each input window is ablated.
   *
   * The only genuinely two-dimensional thing on the page. Every other method collapses to one
   * profile over the input; this keeps the output axis, so a vertical stripe is an input window
   * many outputs depend on and a horizontal one is an output bin that reads widely.
   */
  async function loadOccl(locusId: string): Promise<Occl | null> {
    const base = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/vp-data`;
    const meta = await fetch(`${base}/${locusId}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const spec = meta?.occl;
    if (!spec) return null;
    const blob = await fetch(`${base}/${locusId}-occl.png`).then((r) => (r.ok ? r.blob() : null));
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
    const plane = new Float32Array(spec.rows * spec.cols);
    for (let r = 0; r < spec.rows; r += 1) {
      const lo = spec.lo[r];
      const range = Math.max(spec.hi[r] - lo, 1e-12);
      for (let c = 0; c < spec.cols; c += 1) {
        plane[r * spec.cols + c] = (px[(r * spec.cols + c) * 4] / 255) * range + lo;
      }
    }
    return { plane, rows: spec.rows, cols: spec.cols, win: spec.win };
  }

  async function loadIsm(locusId: string): Promise<Ism | null> {
    const base = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/vp-data`;
    const meta = await fetch(`${base}/${locusId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const spec = meta?.ism;
    if (!spec) return null;
    const blob = await fetch(`${base}/${locusId}-ism.png`).then((r) => (r.ok ? r.blob() : null));
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
    const plane = new Float32Array(spec.rows * spec.cols);
    for (let r = 0; r < spec.rows; r += 1) {
      const lo = spec.lo[r];
      const range = Math.max(spec.hi[r] - lo, 1e-12);
      for (let c = 0; c < spec.cols; c += 1) {
        plane[r * spec.cols + c] = (px[(r * spec.cols + c) * 4] / 255) * range + lo;
      }
    }
    return { plane, start: spec.start, width: spec.cols, ref: spec.ref, tss: spec.tss };
  }

  const traceRegion = (a: Attribution, s: number, e: number) =>
    sumAttributionRows(a.input, a.cols.input, a.groupBins, a.groups, s, e);
  const traceChannels = (a: Attribution, s: number, e: number) =>
    sumAttributionRows(a.channels, a.cols.channels, a.groupBins, a.groups, s, e);

  /** Draw the traced attribution: which input positions drive the selected output region. */
  function renderAttribution(): void {
    if (!attrCanvas) return;
    const cssW = attrCanvas.clientWidth || 900;
    const cssH = 150;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    attrCanvas.width = Math.round(cssW * dpr);
    attrCanvas.height = Math.round(cssH * dpr);
    attrCanvas.style.height = `${cssH}px`;
    const ctx = attrCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const muted = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';
    const rule = getComputedStyle(host).getPropertyValue('--color-rule').trim() || '#e5e7eb';
    const pos = getComputedStyle(host).getPropertyValue('--vp-fire').trim() || '#b0455a';
    const neg = getComputedStyle(host).getPropertyValue('--vp-accent').trim() || '#3976a8';
    ctx.font = '10px system-ui, sans-serif';

    if (!attribution || !tracedBins) {
      ctx.fillStyle = muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('No region traced yet.', PLOT.left, 22);
      delete attrCanvas.dataset.peak;
      return;
    }

    const anchorIdx = attribution.anchors.findIndex(
      (a) => a.binStart === tracedBins!.start && a.binEnd === tracedBins!.end,
    );
    // An anchor carries single-base attribution; a dragged region is the 16 bp matrix.
    const series = anchorIdx >= 0
      ? attribution.anchor.subarray(anchorIdx * attribution.cols.anchor,
                                    (anchorIdx + 1) * attribution.cols.anchor)
      : traceRegion(attribution, tracedBins.start, tracedBins.end);
    let peak = 0;
    for (let i = 0; i < series.length; i += 1) peak = Math.max(peak, Math.abs(series[i]));

    const plotTop = 16;
    const geneTop = cssH - 34;
    const plotBottom = geneTop - 12;
    const mid = (plotTop + plotBottom) / 2;
    const half = (plotBottom - plotTop) / 2;

    // The same cropped flanks the curve above shades, so a reader can see at a glance which part of
    // the attribution lies under a bin the model actually predicts -- and that the rest is real.
    const { lo, hi } = predictedSpan();
    ctx.fillStyle = muted;
    ctx.globalAlpha = 0.1;
    for (const [a, b] of [[0, fractionToBp(lo)], [fractionToBp(hi), SEQ_LEN]] as [number, number][]) {
      ctx.fillRect(xOfBp(a, cssW), plotTop, xOfBp(b, cssW) - xOfBp(a, cssW), plotBottom - plotTop);
    }
    ctx.globalAlpha = 1;

    // Bars, positioned in bp rather than by array index, so this panel and the curve above put the
    // same base at the same x.
    const perStep = SEQ_LEN / series.length;
    for (let i = 0; i < series.length; i += 1) {
      const v = series[i];
      if (v === 0) continue;
      const h = (Math.abs(v) / Math.max(peak, 1e-12)) * half;
      const x = xOfBp(i * perStep, cssW);
      const w = Math.max(xOfBp((i + 1) * perStep, cssW) - x, 0.6);
      ctx.fillStyle = v < 0 ? neg : pos;
      ctx.fillRect(x, v < 0 ? mid : mid - h, w, h);
    }

    // A signed axis: zero in the middle, +/- peak at the edges.
    ctx.strokeStyle = rule;
    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    for (const [y, label] of [
      [plotTop, `+${formatTick(peak)}`], [mid, '0'], [plotBottom, `−${formatTick(peak)}`],
    ] as [number, string][]) {
      ctx.globalAlpha = y === mid ? 0.8 : 0.35;
      ctx.beginPath();
      ctx.moveTo(PLOT.left, y + 0.5);
      ctx.lineTo(cssW - PLOT.right, y + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(label, PLOT.left - 5, y + 3);
    }
    ctx.save();
    ctx.translate(11, mid);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('gradient × input', 0, 0);
    ctx.restore();

    // The same bp ruler as the curve above.
    ctx.textAlign = 'center';
    for (const bp of bpTicks()) {
      const x = xOfBp(bp, cssW);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, plotBottom);
      ctx.lineTo(x, plotBottom + 3);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textAlign = bp === 0 ? 'left' : bp >= SEQ_LEN ? 'right' : 'center';
      ctx.fillText(bpLabel(bp), x, plotBottom + 12);
    }
    ctx.textAlign = 'left';

    {
      drawGeneRowsCanvas(ctx, LOCI[locusIndex], cssW, geneTop);
    }
    ctx.fillStyle = muted;
    ctx.fillText(
      `${tracedBins.label} · ${anchorIdx >= 0 ? 'single base' : `${series.length} bins of 16 bp`}`
      + ` · peak |attribution| ${peak.toFixed(3)} · same 0–${SEQ_LEN.toLocaleString()} bp axis as the curve above`,
      PLOT.left, 11,
    );
    attrCanvas.dataset.peak = String(peak);
    attrCanvas.dataset.region = tracedBins.label;
    attrCanvas.dataset.domainBp = `0-${SEQ_LEN}`;
  }

  /**
   * Every stage's share of the traced region's relevance, in one list.
   *
   * The layer panel answers "which channels" for the ONE stage you happen to have selected. This
   * answers it for all twenty-one at once, which is what "trace it layer by layer" actually asks
   * for. Built from the `channels` plane already in every pack, so it costs no download.
   */
  function renderStageProfile(): void {
    if (!stageProfileEl) return;
    clear(stageProfileEl);
    if (!attribution || !tracedBins) {
      const li = document.createElement('li');
      li.textContent = 'Trace a region to see which stages carry it.';
      stageProfileEl.append(li);
      delete stageProfileEl.dataset.stages;
      return;
    }
    const rel = traceChannels(attribution, tracedBins.start, tracedBins.end);
    const offsets = stageMapOffsets();
    const rows = layerSpecs().map((spec) => {
      const off = offsets.find((o) => o.id === spec.id);
      if (!off) return { spec, mean: null as number | null, top: [] as { c: number; v: number }[] };
      let sum = 0;
      const chans: { c: number; v: number }[] = [];
      for (let c = 0; c < off.channels; c += 1) {
        const v = Math.abs(rel[off.start + c]);
        sum += v;
        chans.push({ c, v });
      }
      chans.sort((a, b) => b.v - a.v);
      // A MEAN, not a sum: summing ranks a wide stage above a narrow one on width alone.
      return { spec, mean: sum / off.channels, top: chans.slice(0, 3) };
    });
    const hi = Math.max(...rows.map((r) => r.mean ?? 0), 1e-12);

    for (const row of rows) {
      const li = document.createElement('li');
      li.setAttribute('aria-selected', String(row.spec.id === (flow?.selected()?.id ?? '')));
      const name = document.createElement('span');
      name.textContent = row.spec.label;
      const val = document.createElement('span');
      // A stage with no per-layer relevance in the pack says so, rather than reporting zero --
      // which would read as "contributes nothing" when it means "not measured here".
      val.textContent = row.mean === null ? 'own tensor' : row.mean.toPrecision(3);
      li.append(name, val);
      const bar = document.createElement('i');
      bar.className = 'bar';
      bar.style.width = `${row.mean === null ? 0 : (row.mean / hi) * 100}%`;
      li.append(bar);
      if (row.top.length) {
        const chans = document.createElement('span');
        chans.className = 'chans';
        row.top.forEach((q, i) => {
          if (i) chans.append(document.createTextNode(' · '));
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = `#${q.c} (${q.v.toPrecision(2)})`;
          b.addEventListener('click', (ev) => {
            ev.stopPropagation();
            selectedFilter = q.c;
            selectStage(row.spec.id);
          });
          chans.append(b);
        });
        li.append(chans);
      }
      li.addEventListener('click', () => selectStage(row.spec.id));
      stageProfileEl.append(li);
    }
    stageProfileEl.dataset.stages = String(rows.length);
  }

  /** Open one stage in the flow and the detail panel together. */
  function selectStage(id: string): void {
    const i = FLOW_STAGES.findIndex((s) => s.id === id);
    if (i < 0) return;
    flow?.select(i);
    flow3d?.select(id);
    renderStageDetail(FLOW_STAGES[i]);
    refreshRegionViews();
  }

  /**
   * The top contributing neurons for the traced region, each as its own real activation profile.
   *
   * Everything else in this panel collapses a dimension. The stage profile sums over position, the
   * stack sums over channel, the map reconstructs the interior as an outer product. This collapses
   * nothing: it picks the handful of channels that matter most -- ranked by their EXACT relevance
   * margin -- and draws each one's actual activation across the window, straight from the shipped
   * stage maps.
   *
   * Eight of them, because that is about what a reader can hold at once; the 384-row raster above
   * contains the same information and is unreadable per-neuron, which is the point of having both.
   */
  function renderNeuronTraces(): void {
    if (!neuronTraceCanvas) return;
    const TOP = 8;
    const rowH = 26;
    const cssW = neuronTraceCanvas.clientWidth || 900;
    const cssH = TOP * rowH + 26;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    neuronTraceCanvas.width = Math.round(cssW * dpr);
    neuronTraceCanvas.height = Math.round(cssH * dpr);
    neuronTraceCanvas.style.height = `${cssH}px`;
    const ctx = neuronTraceCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const muted = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';
    const accent = getComputedStyle(host).getPropertyValue('--vp-accent').trim() || '#3976a8';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillStyle = muted;

    const spec = flow?.selected() ?? null;
    const off = spec ? stageMapOffsets().find((o) => o.id === spec.id) : undefined;
    if (!current || !attribution || !tracedBins || !off) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(
        off ? 'Trace a region to see its strongest neurons.'
          : 'Select a residual, transformer or decoder stage above — the input, conv stem and head '
            + 'have no per-layer relevance.',
        PLOT.left, 20,
      );
      delete neuronTraceCanvas.dataset.neurons;
      return;
    }
    const rel = traceChannels(attribution, tracedBins.start, tracedBins.end);
    const ranked = Array.from({ length: off.channels }, (_, c) => ({ c, v: Math.abs(rel[off.start + c]) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, TOP);

    const P = off.positions;
    const regionLoBp = CROP_BP + tracedBins.start * BIN_BP;
    const regionHiBp = CROP_BP + tracedBins.end * BIN_BP;
    const windowShare = (regionHiBp - regionLoBp) / SEQ_LEN;
    ranked.forEach((n, i) => {
      const top = i * rowH + 4;
      const mid = top + rowH / 2;
      const half = rowH / 2 - 3;
      const base = (off.start + n.c) * P;
      let lo = Infinity;
      let hi = -Infinity;
      for (let p = 0; p < P; p += 1) {
        const v = current!.stageMaps[base + p];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const span = Math.max(hi - lo, 1e-9);
      const zero = mid + half - ((0 - lo) / span) * (2 * half);
      ctx.strokeStyle = muted;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(PLOT.left, zero + 0.5);
      ctx.lineTo(cssW - PLOT.right, zero + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let p = 0; p < P; p += 1) {
        // The stage's positions span the whole window, so p maps straight onto the shared bp axis.
        const x = xOfBp((p / P) * SEQ_LEN, cssW);
        const y = mid + half - ((current!.stageMaps[base + p] - lo) / span) * (2 * half);
        if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // How much of this channel's activity actually sits inside the traced region, against how
      // much of the window that region is. The traces otherwise read as noise and leave a reader
      // to judge concentration by eye -- and the answer is usually "barely concentrated", which is
      // a real result about the model rather than a defect in the drawing.
      const pLo = Math.floor((regionLoBp / SEQ_LEN) * P);
      const pHi = Math.ceil((regionHiBp / SEQ_LEN) * P);
      let inside = 0;
      let all = 0;
      for (let p = 0; p < P; p += 1) {
        const m = Math.abs(current!.stageMaps[base + p]);
        all += m;
        if (p >= pLo && p < pHi) inside += m;
      }
      const share = all > 0 ? inside / all : 0;
      const enrich = windowShare > 0 ? share / windowShare : 0;
      ctx.fillStyle = muted;
      ctx.textAlign = 'right';
      ctx.fillText(`#${n.c}`, PLOT.left - 4, mid + 3);
      ctx.textAlign = 'left';
      ctx.fillText(
        `relevance ${n.v.toPrecision(2)} · fires ${lo.toFixed(2)} … ${hi.toFixed(2)}`
        + ` · ${(share * 100).toFixed(1)}% of its activity is in the region (${enrich.toFixed(2)}× enriched)`,
        PLOT.left + 3, top + 8);
    });

    // The traced region, so "does this neuron fire where I asked" is answerable by eye.
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.5;
    const a = xOfBp(CROP_BP + tracedBins.start * BIN_BP, cssW);
    const b2 = xOfBp(CROP_BP + tracedBins.end * BIN_BP, cssW);
    ctx.strokeRect(a, 2, Math.max(b2 - a, 2), TOP * rowH);
    ctx.globalAlpha = 1;

    ctx.fillStyle = muted;
    ctx.textAlign = 'center';
    for (const bp of bpTicks(4000)) {
      ctx.textAlign = bp === 0 ? 'left' : bp >= SEQ_LEN ? 'right' : 'center';
      ctx.fillText(bpLabel(bp), xOfBp(bp, cssW), cssH - 12);
    }
    ctx.textAlign = 'left';
    ctx.fillText(
      `${spec!.label} · top ${TOP} of ${off.channels} channels by exact relevance · real activations, `
      + `each scaled to its own range · the region is ${(windowShare * 100).toFixed(1)}% of the window, `
      + `so 1.0× enrichment means a channel fires there no more than anywhere else`,
      PLOT.left, cssH - 2);
    neuronTraceCanvas.dataset.neurons = ranked.map((n) => n.c).join(',');
    neuronTraceCanvas.dataset.stage = spec!.id;
  }

  /**
   * Where each stage's contributing neurons fire, stacked by depth on the page's shared bp axis.
   *
   * This is the picture the layer-by-layer traceback was missing. The profile list answers "which
   * stages and which channels"; this answers "and where in the window", and stacking it by depth
   * makes the receptive field visible as a widening band -- 11 bp at the stem, the whole window
   * once the transformer is reached.
   */
  function renderStageStack(): void {
    if (!stackCanvas) return;
    const cssW = stackCanvas.clientWidth || 900;
    const rows = stageMapOffsets();
    const rowH = 9;
    const cssH = rows.length * rowH + 34;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    stackCanvas.width = Math.round(cssW * dpr);
    stackCanvas.height = Math.round(cssH * dpr);
    stackCanvas.style.height = `${cssH}px`;
    const ctx = stackCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const muted = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillStyle = muted;

    if (!current || !attribution || !tracedBins) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('Trace a region to see where each stage draws from.', PLOT.left, 20);
      delete stackCanvas.dataset.rows;
      return;
    }
    // Exact when the pack carries the positional margin -- a row-sum of the groups the region
    // covers, with no model run. The factorised estimate is the fallback for an older pack, and
    // the caption says which one is on screen because they answer different questions.
    const exact = attribution.positions
      ? exactStageProfiles(
        sumAttributionRows(attribution.positions, attribution.cols.positions,
          attribution.groupBins, attribution.groups, tracedBins.start, tracedBins.end),
        attribution.stagePositions,
      )
      : null;
    const profiles = exact
      ?? stageRelevanceProfile(current.stageMaps,
        traceChannels(attribution, tracedBins.start, tracedBins.end), STAGE_MAP_POSITIONS);
    const neutral = neutralRgb();
    const top = 4;

    profiles.forEach((row, i) => {
      // Painted against the row's OWN MEAN on a diverging scale, not from zero on a sequential one.
      // The early residual blocks are spatially near-uniform once pooled to 128 positions -- which
      // is a true fact about them -- and a sequential ramp renders that as a saturated bar reading
      // "maximally relevant everywhere" instead of "no positional preference". Against the mean, a
      // flat row is uniformly neutral and a structured row shows its structure, which is the
      // distinction the panel exists to make.
      const centred = new Float64Array(STAGE_MAP_POSITIONS);
      let mean = 0;
      for (const v of row.profile) mean += v;
      mean /= STAGE_MAP_POSITIONS;
      for (let p = 0; p < STAGE_MAP_POSITIONS; p += 1) centred[p] = row.profile[p] - mean;
      const scale = activationScale(centred);
      const rgba = paintActivationMap(centred, 1, STAGE_MAP_POSITIONS, scale, neutral);
      const off = document.createElement('canvas');
      off.width = STAGE_MAP_POSITIONS;
      off.height = 1;
      const octx = off.getContext('2d');
      if (!octx) return;
      const img = octx.createImageData(STAGE_MAP_POSITIONS, 1);
      img.data.set(rgba);
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      // Every stage in the pack spans the whole window, so the row spans the whole plot band.
      ctx.drawImage(off, PLOT.left, top + i * rowH, cssW - PLOT.left - PLOT.right, rowH - 1);
      ctx.fillStyle = muted;
      ctx.textAlign = 'right';
      ctx.fillText(row.id, PLOT.left - 4, top + i * rowH + rowH - 2);
    });

    // The traced region itself, so "the band widens away from it" is visible rather than inferred.
    ctx.strokeStyle = getComputedStyle(host).getPropertyValue('--vp-accent').trim() || '#3976a8';
    const a = xOfBp(CROP_BP + tracedBins.start * BIN_BP, cssW);
    const b = xOfBp(CROP_BP + tracedBins.end * BIN_BP, cssW);
    ctx.strokeRect(a, top, Math.max(b - a, 2), profiles.length * rowH);

    ctx.fillStyle = muted;
    ctx.textAlign = 'center';
    for (const bp of bpTicks(4000)) {
      ctx.textAlign = bp === 0 ? 'left' : bp >= SEQ_LEN ? 'right' : 'center';
      ctx.fillText(bpLabel(bp), xOfBp(bp, cssW), cssH - 14);
    }
    ctx.textAlign = 'left';
    ctx.fillText(
      `${tracedBins.label} · ${profiles.length} stages · `
      + (exact
        ? 'EXACT per-stage relevance for this region, summed over each stage\'s channels'
        : 'estimated: per-channel relevance x per-position activation')
      + ' · each row against its own mean: red above average, blue below, neutral no preference',
      PLOT.left, cssH - 3);
    stackCanvas.dataset.rows = String(profiles.length);
    stackCanvas.dataset.exact = String(!!exact);
    stackCanvas.dataset.region = tracedBins.label;
  }

  /**
   * Attention rollout for the traced region: what the transformer can read, composed over 8 layers.
   *
   * Drawn on the page's one bp axis so it can be laid against the attribution above it. This is an
   * ARCHITECTURAL quantity -- where it disagrees with gradient x input, that is the finding.
   */
  function renderRollout(): void {
    if (!rolloutCanvas) return;
    const cssW = rolloutCanvas.clientWidth || 700;
    const cssH = 78;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    rolloutCanvas.width = Math.round(cssW * dpr);
    rolloutCanvas.height = Math.round(cssH * dpr);
    rolloutCanvas.style.height = `${cssH}px`;
    const ctx = rolloutCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const muted = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = muted;

    if (!current?.attention || !tracedBins) {
      ctx.fillText('Trace a region to see what the transformer reads for it.', 4, 20);
      delete rolloutCanvas.dataset.peak;
      return;
    }
    const roll = attentionRollout(current.attention, BOTTLENECK_LEN);
    const { start, end } = binsToBottleneck(tracedBins.start, tracedBins.end);
    // Average the rollout rows the region occupies: where those positions' representations came
    // from, over the 128 bottleneck positions.
    const profile = new Float64Array(BOTTLENECK_LEN);
    const n = Math.max(end - start, 1);
    for (let i = start; i < end; i += 1) {
      for (let j = 0; j < BOTTLENECK_LEN; j += 1) profile[j] += roll[i * BOTTLENECK_LEN + j] / n;
    }
    let peak = 0;
    for (const v of profile) peak = Math.max(peak, v);

    const top = 16;
    const bottom = cssH - 18;
    const per = SEQ_LEN / BOTTLENECK_LEN;
    ctx.fillStyle = getComputedStyle(host).getPropertyValue('--vp-orf').trim() || '#6f62a8';
    for (let j = 0; j < BOTTLENECK_LEN; j += 1) {
      const x = xOfBp(j * per, cssW);
      const w = Math.max(xOfBp((j + 1) * per, cssW) - x, 1);
      const h = (profile[j] / Math.max(peak, 1e-12)) * (bottom - top);
      ctx.fillRect(x, bottom - h, w, h);
    }
    // Mark the region itself, so "it reads mostly itself" is visible rather than inferred.
    ctx.strokeStyle = getComputedStyle(host).getPropertyValue('--vp-accent').trim() || '#3976a8';
    ctx.strokeRect(xOfBp(start * per, cssW), top,
      Math.max(xOfBp(end * per, cssW) - xOfBp(start * per, cssW), 2), bottom - top);

    let inside = 0;
    for (let j = start; j < end; j += 1) inside += profile[j];
    ctx.fillStyle = muted;
    ctx.fillText(
      `attention rollout · ${BOTTLENECK_LEN} bottleneck positions of ${per} bp · `
      + `${(inside * 100).toFixed(1)}% of the region's attention stays inside it`,
      4, 11,
    );
    ctx.textAlign = 'center';
    for (const bp of bpTicks(4000)) {
      ctx.textAlign = bp === 0 ? 'left' : bp >= SEQ_LEN ? 'right' : 'center';
      ctx.fillText(bpLabel(bp), xOfBp(bp, cssW), cssH - 5);
    }
    ctx.textAlign = 'left';
    rolloutCanvas.dataset.peak = String(peak);
    rolloutCanvas.dataset.inside = inside.toFixed(4);
  }

  /**
   * Draw a (L, 4) attribution matrix as the Shorkie paper draws it.
   *
   * This is `dna_letter_at` + `plot_seq_scores` from the paper's own renderer, in SVG. Every
   * constant lives in the pure layer and is documented there; what matters here is the transform.
   *
   * The glyph path is in the paper's coordinate system -- y up, baseline 0 -- so the transform
   * flips y and scales by the value. Scaling the PATH is the whole point: setting `font-size`
   * instead would scale width with height, and the letters would stop being a logo. A negative
   * value gives a negative y-scale, which mirrors the glyph rather than merely dropping it below
   * the line -- that is what the paper does and what its negative letters look like.
   */
  function drawLogo(
    svg: SVGSVGElement,
    values: (i: number) => number[],
    n: number,
    x0: number,
    width: number,
    top: number,
    height: number,
  ): { lo: number; hi: number; letters: number } {
    const flat: number[] = [];
    for (let i = 0; i < n; i += 1) for (const v of values(i)) flat.push(v);
    const { lo, hi } = logoRange(flat);
    const span = Math.max(hi - lo, 1e-12);
    const yOf = (v: number) => top + ((hi - v) / span) * height;
    const colW = width / n;
    let letters = 0;

    for (let i = 0; i < n; i += 1) {
      for (const letter of logoColumn(values(i))) {
        // Height in user units for one unit of value, and the glyph is 1 em tall before scaling.
        const sy = (letter.value / span) * height * LOGO_GLOBSCALE;
        if (Math.abs(sy) < 0.12) continue;
        const g = el('path');
        attr(g, {
          d: LOGO_GLYPHS[letter.base],
          class: 'vp-glyph',
          fill: LOGO_COLOURS[letter.base],
          // translate to the column centre and the letter's baseline, then flip y and scale.
          transform: `translate(${(x0 + (i + 0.5) * colW).toFixed(3)} ${yOf(letter.y).toFixed(3)})`
            + ` scale(${(colW * LOGO_GLOBSCALE).toFixed(4)} ${(-sy).toFixed(4)})`,
        });
        svg.append(g);
        letters += 1;
      }
    }
    // The zero rule. Always drawn, always black -- logoRange guarantees zero is inside the range.
    const axis = el('line');
    attr(axis, {
      x1: x0, x2: x0 + width, y1: yOf(0), y2: yOf(0), stroke: '#000', 'stroke-width': 1,
    });
    svg.append(axis);
    return { lo, hi, letters };
  }

  /**
   * The traced region's attribution as the paper's sequence logo.
   *
   * 16,384 letters across 900 px is 0.05 px each, so this pans a window of 60-400 bp. Two sources
   * are selectable and they are NOT the same method:
   *
   *   - **mutagenesis** is the paper's: every substitution actually run, reduced to the reference
   *     base's importance by mean-centring across the four bases and projecting on the one-hot.
   *     This is what Figure 4 plots.
   *   - **gradient x input** is a local linear sensitivity. The paper's published figures do not
   *     use gradients at all -- its one gradient function is unreached scaffolding -- so this is
   *     the fast interactive companion, not a reproduction.
   */
  function renderSeqLogo(): void {
    if (!seqLogoSvg) return;
    clear(seqLogoSvg);
    const W = 1000;
    const H = 150;
    attr(seqLogoSvg, { viewBox: `0 0 ${W} ${H}` });
    const width = Number(logoWidth?.value ?? 150);
    const seq = LOCI[locusIndex].sequence;
    const src = logoSource?.value ?? 'ism';

    const pan = Number(logoPan?.value ?? 500) / 1000;
    const centre = Math.round(pan * SEQ_LEN);
    const start = Math.max(0, Math.min(SEQ_LEN - width, centre - Math.floor(width / 2)));

    // Per-position values, four per column. Mutagenesis gives all four; gradient x input is zero
    // at the three bases that are not there, because the input is one-hot.
    let column: ((i: number) => number[]) | null = null;
    let note = '';
    // Mutagenesis covers only the promoter window (~500 bp) while a traced region can be anywhere
    // in the 16,384 bp window, so asking for it outside its span would leave the panel empty.
    // Fall through to the gradient, which covers everything, and say which one is being shown.
    const ismCovers = !!ism && start + width > ism.start && start < ism.start + ism.width;
    if (src === 'ism' && ism && ismCovers) {
      // Captured, because `ism` is a mutable module-scope binding and TS will not narrow it
      // inside the closure below -- a locus change could null it between the check and the call.
      const plane = ism;
      const k0 = start - plane.start;
      // The paper's steps 2 and 3, exactly as the panel below draws them: mean-centre across the
      // four bases, then project on the reference. One label, one meaning -- rendering the same
      // named source two different ways in two panels is how a reader stops trusting either.
      const sal = ismSaliency(plane.plane, plane.width, seq, plane.start);
      column = (i) => {
        const k = k0 + i;
        const out = [0, 0, 0, 0];
        if (k < 0 || k >= plane.width) return out;
        const b = BASES.indexOf((seq[start + i] ?? 'N').toUpperCase() as Base);
        if (b >= 0) out[b] = sal[k];
        return out;
      };
      note = 'in-silico mutagenesis, mean-centred and projected on the reference — the paper\'s '
        + 'Figure 4 quantity';
    } else if (src === 'occl' && occl && tracedBins) {
      // Occlusion is a 64 bp measurement, so every base inside a window carries that window's
      // value. The logo therefore reads as blocks rather than per-base spikes -- which is exactly
      // what the method resolves, and pretending otherwise by interpolating would be a lie about
      // its resolution.
      const o = occl;
      const prof = new Float64Array(o.rows);
      for (let w = 0; w < o.rows; w += 1) {
        let s = 0;
        for (let b = tracedBins.start; b < tracedBins.end; b += 1) s += o.plane[w * o.cols + b];
        prof[w] = s / Math.max(tracedBins.end - tracedBins.start, 1);
      }
      column = (i) => {
        const at = start + i;
        const out = [0, 0, 0, 0];
        const b = BASES.indexOf((seq[at] ?? 'N').toUpperCase() as Base);
        // Negated: occlusion measures what is LOST when the stretch goes, so a base that matters
        // has a negative logSED. The logo convention is that height means importance and up means
        // "raises the prediction", so the sign has to be flipped to read like the others.
        if (b >= 0) out[b] = -(prof[Math.min(o.rows - 1, Math.floor(at / o.win))] ?? 0);
        return out;
      };
      note = `occlusion at ${o.win} bp — every base in a window carries that window's value`;
    } else if (attribution && tracedBins) {
      const anchorIdx = attribution.anchors.findIndex(
        (a) => a.binStart === tracedBins!.start && a.binEnd === tracedBins!.end,
      );
      const useIg = src === 'ig' && attribution.ig && anchorIdx >= 0;
      const series = useIg
        ? attribution.ig!.subarray(anchorIdx * attribution.cols.ig, (anchorIdx + 1) * attribution.cols.ig)
        : anchorIdx >= 0
          ? attribution.anchor.subarray(anchorIdx * attribution.cols.anchor,
                                        (anchorIdx + 1) * attribution.cols.anchor)
          : traceRegion(attribution, tracedBins.start, tracedBins.end);
      const perBase = anchorIdx >= 0;
      column = (i) => {
        const at = start + i;
        const v = perBase ? series[at] : series[Math.floor((at / SEQ_LEN) * series.length)];
        const out = [0, 0, 0, 0];
        const b = BASES.indexOf((seq[at] ?? 'N').toUpperCase() as Base);
        if (b >= 0) out[b] = v;
        return out;
      };
      const why = src === 'ig' && !useIg
        ? ' (integrated gradients exist only for the precomputed regions — pick one from the stepper)'
        : src === 'ism' && ism && !ismCovers
        ? ` (mutagenesis covers only bp ${ism.start.toLocaleString()}–`
          + `${(ism.start + ism.width).toLocaleString()}, so this window falls back to the gradient)`
        : '';
      note = (useIg
        ? 'integrated gradients, single base — the only method here whose values sum to the '
          + 'prediction difference'
        : perBase
          ? 'gradient × input, single base — a local sensitivity, not the paper\'s method'
          : 'gradient × input at 128 bp — pick a gene below the curve for single-base letters') + why;
    }

    if (!column) {
      seqLogoSvg.append(text(W / 2, H / 2,
        !ism && src === 'ism'
          ? 'Mutagenesis has not loaded for this locus.'
          : 'Trace a region on the curve above, or pan into the mutagenesis window.', 'vp-ax'));
      if (logoStat) logoStat.textContent = '';
      delete seqLogoSvg.dataset.letters;
      return;
    }

    const { lo, hi, letters } = drawLogo(seqLogoSvg, column, width, 0, W, 14, H - 34);
    for (let k = 0; k <= width; k += Math.max(10, Math.round(width / 10))) {
      seqLogoSvg.append(text((k / width) * W, H - 4, String(start + k), 'vp-ax'));
    }
    seqLogoSvg.dataset.letters = String(letters);
    seqLogoSvg.dataset.window = `${start}-${start + width}`;
    seqLogoSvg.dataset.source = src;
    if (logoStat) {
      logoStat.textContent = `bp ${start.toLocaleString()}–${(start + width).toLocaleString()}`
        + ` · ${width} bp · ${note} · range ${lo.toFixed(3)} … ${hi.toFixed(3)}`;
    }
  }

  /**
   * The mutagenesis window as the paper's Figure 4 logo, annotated the way the paper annotates it.
   *
   * This is the panel the site was missing: Figure 4 has no ISM raster anywhere -- all fourteen of
   * its saliency views are stacked letter logos, with red dashed boxes over matched motifs, the
   * splice and codon landmarks labelled above, and an IGV-style gene model beneath. The raster
   * below this is kept because it shows all three substitutions at once, which the logo cannot;
   * the paper computes that same position x base array (`run_ism_eqtl.py` builds exactly it, with
   * the reference pinned to zero) and simply never plots it.
   */
  function renderIsmLogo(): void {
    if (!ismLogoSvg) return;
    clear(ismLogoSvg);
    const W = 1000;
    const H = 210;
    attr(ismLogoSvg, { viewBox: `0 0 ${W} ${H}` });
    if (!ism) {
      ismLogoSvg.append(text(W / 2, H / 2, 'Mutagenesis has not loaded for this locus.', 'vp-ax'));
      delete ismLogoSvg.dataset.letters;
      return;
    }
    const plane = ism;
    const locus = LOCI[locusIndex];
    const seq = locus.sequence;
    const lo = plane.start;
    const hi = plane.start + plane.width;
    const px = (bp: number) => PLOT.left + ((bp - lo) / plane.width) * (W - PLOT.left - PLOT.right);
    const logoTop = 46;
    const logoH = 96;

    // The paper's steps 2 and 3: mean-centre across the four bases, then PROJECT on the reference
    // one-hot. That leaves exactly one letter per position -- the importance of the base that is
    // actually there -- which is what Figure 4's panels plot. The raster below keeps the full
    // position x base view, so nothing is lost by matching the figure here.
    const sal = ismSaliency(plane.plane, plane.width, seq, plane.start);
    const column = (i: number): number[] => {
      const out = [0, 0, 0, 0];
      const b = BASES.indexOf((seq[plane.start + i] ?? 'N').toUpperCase() as Base);
      if (b >= 0) out[b] = sal[i];
      return out;
    };
    const { lo: yLo, hi: yHi, letters } = drawLogo(
      ismLogoSvg, column, plane.width, PLOT.left, W - PLOT.left - PLOT.right, logoTop, logoH,
    );

    // Motif hits from this locus's own scan, boxed and labelled as Figure 4 boxes them.
    const boxes: { label: string; a: number; b: number }[] = [];
    for (const m of locus.motifs ?? []) {
      if (m.end <= lo || m.start >= hi) continue;
      boxes.push({ label: m.name, a: Math.max(m.start, lo), b: Math.min(m.end, hi) });
    }
    // Splice and codon landmarks derived from the gene model -- but only where the scan above has
    // not already found them. Several loci carry the splice sites in their motif list with a real
    // matched consensus (DTD1's branch point is a scanned TACTAAC at 8,210), which beats the
    // paper's fixed acceptor-minus-30 heuristic that would put it at 8,206. Take the measured one
    // where it exists and derive only what is missing -- otherwise the panel labels each landmark
    // twice, once from each source.
    const own = locus.features.find((f) => f.name === locus.id);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    const already = new Set(boxes.map((b) => norm(b.label)));
    if (own) {
      for (const a of spliceAnnotations(own)) {
        if (a.at < lo || a.at > hi) continue;
        if (already.has(norm(a.label))) continue;
        boxes.push({ label: a.label, a: a.at - 3, b: a.at + 3 });
      }
    }
    boxes.sort((x, y) => x.a - y.a);
    // Two label rows, alternating. Splice landmarks cluster within a few dozen bp of each other --
    // a branch point sits 30 bp from its acceptor by construction -- so one row overprints them
    // into a smear, which is what "Branch poin3' splice site" looked like.
    const labelRowY = [logoTop - 8, logoTop - 21];
    const lastAt = [-Infinity, -Infinity];
    boxes.forEach((box) => {
      const x0 = px(box.a);
      const x1 = px(box.b);
      const r = el('rect');
      attr(r, {
        x: x0, y: logoTop - 4, width: Math.max(x1 - x0, 2), height: logoH + 8,
        fill: 'none', stroke: '#d1495b', 'stroke-width': 1, 'stroke-dasharray': '3 2',
        'stroke-opacity': 0.85,
      });
      ismLogoSvg.append(r);
      r.dataset.motif = box.label;
      const row = lastAt[0] <= lastAt[1] ? 0 : 1;
      if (x0 - lastAt[row] > 52) {
        const lbl = text((x0 + x1) / 2, labelRowY[row], box.label, 'vp-ax');
        ismLogoSvg.append(lbl);
        // A leader from the label down to its box, so a label on the upper row is unambiguous.
        const lead = el('line');
        attr(lead, {
          x1: (x0 + x1) / 2, x2: (x0 + x1) / 2, y1: labelRowY[row] + 3, y2: logoTop - 5,
          stroke: '#d1495b', 'stroke-width': 0.5, 'stroke-opacity': 0.5,
        });
        ismLogoSvg.append(lead);
        lastAt[row] = x1;
      }
      r.style.cursor = 'pointer';
      r.addEventListener('click', () => {
        // Zoom the sequence logo onto this motif.
        if (logoPan) logoPan.value = String(Math.round(windowFraction((box.a + box.b) / 2) * 1000));
        if (logoWidth) logoWidth.value = '60';
        if (logoSource) logoSource.value = 'ism';
        renderSeqLogo();
        seqLogoSvg?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    // The gene model, in the paper's IGV style: royal blue, solid exon blocks, intron line.
    const geneY = H - 40;
    for (const f of locus.features) {
      if (f.txEnd <= lo || f.txStart >= hi) continue;
      const a = px(Math.max(f.txStart, lo));
      const b = px(Math.min(f.txEnd, hi));
      const line = el('line');
      attr(line, { x1: a, x2: b, y1: geneY, y2: geneY, stroke: '#4169E1', 'stroke-width': 1 });
      ismLogoSvg.append(line);
      const fwd = f.strand === '+';
      for (let x = a + 8; x < b - 3; x += 16) {
        const c = el('path');
        attr(c, {
          d: `M${(x - (fwd ? 2.5 : -2.5)).toFixed(1)} ${geneY - 3} L${(x + (fwd ? 2.5 : -2.5)).toFixed(1)} ${geneY}`
            + ` L${(x - (fwd ? 2.5 : -2.5)).toFixed(1)} ${geneY + 3}`,
          fill: 'none', stroke: '#4169E1', 'stroke-width': 0.8,
        });
        ismLogoSvg.append(c);
      }
      for (const piece of geneTrackShapes(f)) {
        if (piece.kind === 'intron' || piece.end <= lo || piece.start >= hi) continue;
        const s = px(Math.max(piece.start, lo));
        const e2 = px(Math.min(piece.end, hi));
        const rect = el('rect');
        attr(rect, {
          x: s, y: geneY - 5, width: Math.max(e2 - s, 1), height: 10, fill: '#4169E1',
        });
        ismLogoSvg.append(rect);
      }
      if (f.name === locus.id) {
        const lbl = text((a + b) / 2, geneY - 9, locus.gene, 'vp-ax');
        attr(lbl, { 'font-style': 'italic' });
        ismLogoSvg.append(lbl);
      }
    }

    // A bp ruler on the window's own coordinates -- this panel is a zoom, not the full window.
    const step = Math.max(50, Math.round(plane.width / 8 / 50) * 50);
    for (let bp = Math.ceil(lo / step) * step; bp <= hi; bp += step) {
      ismLogoSvg.append(text(px(bp), H - 4, `${(locus.start + bp) / 1000}`.slice(0, 7) + ' kb', 'vp-ax'));
    }
    ismLogoSvg.append(text(PLOT.left, 12,
      `${locus.gene} · ${lo.toLocaleString()}–${hi.toLocaleString()} bp of the window`
      + ` · logSED range ${yLo.toFixed(2)} … ${yHi.toFixed(2)}`, 'vp-ax vp-caption', 'start'));
    ismLogoSvg.dataset.letters = String(letters);
    ismLogoSvg.dataset.boxes = String(boxes.length);
    ismLogoSvg.dataset.window = `${lo}-${hi}`;
  }


  /**
   * The traced region's relevance for one stage, as a [channels x positions] map.
   *
   * Returns null when there is nothing to show -- no region traced, or a pack without the
   * positional margin -- so the caller falls back to activations rather than drawing zeros.
   */
  function stageRelevance(stageId: string): {
    data: ArrayLike<number>; channels: number; positions: number;
  } | null {
    if (!attribution?.positions || !tracedBins) return null;
    const offsets = stageMapOffsets();
    const si = offsets.findIndex((o) => o.id === stageId);
    if (si < 0) return null;
    const off = offsets[si];
    const chan = traceChannels(attribution, tracedBins.start, tracedBins.end);
    const pos = sumAttributionRows(attribution.positions, attribution.cols.positions,
      attribution.groupBins, attribution.groups, tracedBins.start, tracedBins.end);
    const data = relevanceMap(chan, pos, si, off.start, off.channels, attribution.stagePositions);
    return { data, channels: off.channels, positions: attribution.stagePositions };
  }

  /** Point the flow canvas and the layer raster at whichever tensor is selected. */
  function applyShowing(): void {
    showingBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vpShowing === showing)));
    flow?.setRelevance(showing === 'relevance' ? (s) => stageRelevance(s.id) : null);
    renderStageDetail(flow?.selected() ?? null);
  }

  showingBtns.forEach((b) => b.addEventListener('click', () => {
    showing = b.dataset.vpShowing === 'relevance' ? 'relevance' : 'activation';
    applyShowing();
  }));

  /** One interpretability method, as a per-position signal over the window. */
  interface MethodTrack {
    label: string;
    /** Value per position, and the bp each position covers. Sparse coverage is allowed. */
    at: (bp: number) => number | null;
    peak: number;
    note: string;
  }

  /**
   * Every method that has data, as a signal, on the page's one bp axis.
   *
   * The point is comparison. Each track is scaled to its own peak -- they are in different units
   * and a shared scale would be meaningless -- so what is comparable is WHERE each one puts its
   * weight, read against the same gene models below.
   */
  function methodTracks(): MethodTrack[] {
    const out: MethodTrack[] = [];
    const locus = LOCI[locusIndex];

    // Mutagenesis is deliberately NOT a track here. It covers ~500 bp of a 16,384 bp window, so
    // it sat blank across 97% of this axis; and the full window is not affordable -- a forward pass
    // is 104 ms and the ONNX batch axis is fixed at 1, so 16,384 x 3 substitutions is 1.4 h a locus
    // one strand, 39.6 h for all fourteen both strands. The full window is covered here by
    // occlusion (exact, measured) and by integrated gradients (single base). Mutagenesis lives in
    // the logo panel, where its window is the whole point rather than a gap.
    if (attribution && tracedBins) {
      const ai = attribution.anchors.findIndex(
        (a) => a.binStart === tracedBins!.start && a.binEnd === tracedBins!.end,
      );
      const grad = ai >= 0
        ? attribution.anchor.subarray(ai * attribution.cols.anchor, (ai + 1) * attribution.cols.anchor)
        : traceRegion(attribution, tracedBins.start, tracedBins.end);
      const perBase = ai >= 0;
      let peak = 0;
      for (let i = 0; i < grad.length; i += 1) peak = Math.max(peak, Math.abs(grad[i]));
      out.push({
        label: 'gradient × input',
        at: (bp) => grad[perBase ? Math.round(bp) : Math.floor((bp / SEQ_LEN) * grad.length)] ?? null,
        peak,
        note: perBase ? 'single base' : '128 bp',
      });
      if (ai >= 0 && attribution.ig) {
        const ig = attribution.ig.subarray(ai * attribution.cols.ig, (ai + 1) * attribution.cols.ig);
        let ipk = 0;
        for (let i = 0; i < ig.length; i += 1) ipk = Math.max(ipk, Math.abs(ig[i]));
        const a = attribution.anchors[ai];
        out.push({
          label: 'integrated gradients',
          at: (bp) => ig[Math.round(bp)] ?? null,
          peak: ipk,
          note: a.igAbsError !== undefined
            ? `sums to ${a.igSum?.toFixed(2)} vs a true gap of ${a.igGap?.toFixed(2)}`
            : 'single base',
        });
      }
    }

    if (current?.attention && tracedBins) {
      // The architecture-derived view, on the same axis as the three attribution ones. It is NOT
      // an attribution: it says what the transformer can read for this region, not what changed
      // the prediction, and it is unsigned by construction. Where it disagrees with the others,
      // that is a fact about the architecture rather than about this locus.
      const roll = attentionRollout(current.attention, BOTTLENECK_LEN);
      const { start, end } = binsToBottleneck(tracedBins.start, tracedBins.end);
      const prof = new Float64Array(BOTTLENECK_LEN);
      const n = Math.max(end - start, 1);
      for (let i = start; i < end; i += 1) {
        for (let j = 0; j < BOTTLENECK_LEN; j += 1) prof[j] += roll[i * BOTTLENECK_LEN + j] / n;
      }
      let peak = 0;
      for (const v of prof) peak = Math.max(peak, v);
      const per = SEQ_LEN / BOTTLENECK_LEN;
      out.push({
        label: 'attention rollout',
        at: (bp) => prof[Math.min(BOTTLENECK_LEN - 1, Math.floor(bp / per))] ?? null,
        peak,
        note: `${BOTTLENECK_LEN} × ${per} bp · architecture, not attribution`,
      });
    }

    if (occl && tracedBins) {
      // Occlusion is a matrix; the track is the column-sum over the traced output bins -- how much
      // each input window matters to THIS region, which is the same question the others answer.
      const o = occl;
      const prof = new Float64Array(o.rows);
      for (let w = 0; w < o.rows; w += 1) {
        let s = 0;
        for (let b = tracedBins.start; b < tracedBins.end; b += 1) s += o.plane[w * o.cols + b];
        prof[w] = s / Math.max(tracedBins.end - tracedBins.start, 1);
      }
      let peak = 0;
      for (const v of prof) peak = Math.max(peak, Math.abs(v));
      out.push({
        label: `occlusion (${o.win} bp)`,
        at: (bp) => prof[Math.min(o.rows - 1, Math.floor(bp / o.win))] ?? null,
        peak,
        note: `${o.rows} windows`,
      });
    }
    return out;
  }

  /** Draw every available method as a small signal track on the shared bp axis. */
  function renderMethods(): void {
    if (!methodsCanvas) return;
    const tracks = methodTracks();
    const cssW = methodsCanvas.clientWidth || 900;
    const rowH = 38;   // room for the label above each track
    const cssH = Math.max(tracks.length, 1) * rowH + 20;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    methodsCanvas.width = Math.round(cssW * dpr);
    methodsCanvas.height = Math.round(cssH * dpr);
    methodsCanvas.style.height = `${cssH}px`;
    const ctx = methodsCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const muted = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';
    const pos = getComputedStyle(host).getPropertyValue('--vp-fire').trim() || '#b0455a';
    const neg = getComputedStyle(host).getPropertyValue('--vp-accent').trim() || '#3976a8';
    ctx.font = '9px system-ui, sans-serif';

    if (!tracks.length) {
      ctx.fillStyle = muted;
      ctx.fillText('Trace a region to compare the attribution methods.', 8, 18);
      delete methodsCanvas.dataset.tracks;
      return;
    }

    // The plot band starts at PLOT.left, exactly like every other panel, because the entire point
    // of this strip is that the four methods line up with the coverage curve and the gene models
    // above them. An earlier version gave it a wider gutter to fit the method names and silently
    // broke that registration -- the labels go ABOVE each track instead.
    const GUTTER = PLOT.left;
    tracks.forEach((tr, i) => {
      const mid = i * rowH + rowH / 2 + 4;
      const half = rowH / 2 - 3;
      ctx.strokeStyle = muted;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(GUTTER, mid + 0.5);
      ctx.lineTo(cssW - PLOT.right, mid + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (let x = GUTTER; x < cssW - PLOT.right; x += 1) {
        // bp across the plot band, which starts at GUTTER here rather than PLOT.left.
        const v = tr.at(((x - GUTTER) / Math.max(cssW - GUTTER - PLOT.right, 1)) * SEQ_LEN);
        if (v === null || v === 0) continue;
        const h = (Math.abs(v) / Math.max(tr.peak, 1e-12)) * half;
        ctx.fillStyle = v < 0 ? neg : pos;
        ctx.fillRect(x, v < 0 ? mid : mid - h, 1, h);
      }
      ctx.fillStyle = muted;
      ctx.textAlign = 'left';
      ctx.fillText(tr.label, GUTTER + 2, mid - half + 7);
      ctx.textAlign = 'right';
      ctx.fillText(`±${tr.peak.toPrecision(2)} · ${tr.note}`, cssW - PLOT.right, mid - half + 7);
    });

    ctx.fillStyle = muted;
    ctx.textAlign = 'center';
    for (const bp of bpTicks(4000)) {
      const x = GUTTER + (bp / SEQ_LEN) * (cssW - GUTTER - PLOT.right);
      ctx.textAlign = bp === 0 ? 'left' : bp >= SEQ_LEN ? 'right' : 'center';
      ctx.fillText(bpLabel(bp), x, cssH - 4);
    }
    ctx.textAlign = 'left';
    methodsCanvas.dataset.tracks = String(tracks.length);
    methodsCanvas.dataset.labels = tracks.map((t) => t.label).join('|');
  }

  /**
   * The occlusion matrix: input window on x, output bin on y.
   *
   * Drawn with the input axis horizontal so it shares the page's bp ruler, and the output axis
   * vertical. The two axes cover DIFFERENT spans -- the input is the whole 16,384 bp window and the
   * output only the cropped 1,024-15,360 interior -- so the diagonal is not the identity line and
   * the panel draws where it actually falls rather than leaving a reader to assume.
   */
  function renderOcclusion(): void {
    if (!occlCanvas) return;
    const cssW = occlCanvas.clientWidth || 900;
    const cssH = 300;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    occlCanvas.width = Math.round(cssW * dpr);
    occlCanvas.height = Math.round(cssH * dpr);
    occlCanvas.style.height = `${cssH}px`;
    const ctx = occlCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const muted = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = muted;

    if (!occl) {
      ctx.fillText('Occlusion has not loaded for this locus.', PLOT.left, 20);
      if (occlStat) occlStat.textContent = '';
      delete occlCanvas.dataset.peak;
      return;
    }
    const o = occl;
    const MARG = 22;                 // the marginal strips, top and right
    const top = 16 + MARG;
    const plotH = cssH - top - 30;
    const x0 = PLOT.left;
    const plotW = cssW - PLOT.left - PLOT.right - MARG;

    // One diverging scale across the whole matrix by default -- the cells are all logSED, so they
    // ARE comparable, and a per-row scale hides which windows matter most. The toggle exists
    // because output bins differ in expression by orders of magnitude, so the raw map is dominated
    // by a handful of loud bins and the quiet ones are unreadable; per-bin scaling trades the
    // between-bin comparison for the within-bin one.
    const perBin = occlNorm?.checked ?? false;
    let shown = o.plane;
    if (perBin) {
      shown = new Float32Array(o.plane.length);
      for (let b = 0; b < o.cols; b += 1) {
        let m = 0;
        for (let w = 0; w < o.rows; w += 1) m = Math.max(m, Math.abs(o.plane[w * o.cols + b]));
        if (m <= 0) continue;
        for (let w = 0; w < o.rows; w += 1) shown[w * o.cols + b] = o.plane[w * o.cols + b] / m;
      }
    }
    const scale = activationScale(shown);
    const rgba = paintActivationMap(shown, o.rows, o.cols, scale, neutralRgb());
    // The pack is [windows x bins]; the drawing wants bins down and windows across, so transpose.
    const off = document.createElement('canvas');
    off.width = o.rows;
    off.height = o.cols;
    const octx = off.getContext('2d');
    if (octx) {
      const img = octx.createImageData(o.rows, o.cols);
      const d = img.data;
      for (let w = 0; w < o.rows; w += 1) {
        for (let b = 0; b < o.cols; b += 1) {
          const src = (w * o.cols + b) * 4;
          const dst = (b * o.rows + w) * 4;
          d[dst] = rgba[src];
          d[dst + 1] = rgba[src + 1];
          d[dst + 2] = rgba[src + 2];
          d[dst + 3] = rgba[src + 3];
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, x0, top, plotW, plotH);
    }

    // --- the margins: what each axis totals, drawn on the axis it belongs to ---------------
    const colSum = new Float64Array(o.rows);
    const rowSum = new Float64Array(o.cols);
    for (let w = 0; w < o.rows; w += 1) {
      for (let b = 0; b < o.cols; b += 1) {
        const v = Math.abs(o.plane[w * o.cols + b]);
        colSum[w] += v;
        rowSum[b] += v;
      }
    }
    const cMax = Math.max(...colSum, 1e-12);
    const rMax = Math.max(...rowSum, 1e-12);
    ctx.fillStyle = getComputedStyle(host).getPropertyValue('--vp-orf').trim() || '#6f62a8';
    for (let w = 0; w < o.rows; w += 1) {
      const h = (colSum[w] / cMax) * (MARG - 4);
      ctx.fillRect(x0 + (w / o.rows) * plotW, top - 3 - h, Math.max(plotW / o.rows, 1), h);
    }
    for (let b = 0; b < o.cols; b += 1) {
      const wdt = (rowSum[b] / rMax) * (MARG - 4);
      ctx.fillRect(x0 + plotW + 3, top + (b / o.cols) * plotH, wdt, Math.max(plotH / o.cols, 1));
    }

    // --- a clicked row or column, and what it says -------------------------------------------
    if (occlSel) {
      ctx.strokeStyle = getComputedStyle(host).getPropertyValue('--vp-fire').trim() || '#b0455a';
      ctx.lineWidth = 1;
      if (occlSel.kind === 'row') {
        const y = top + (occlSel.index / o.cols) * plotH;
        ctx.strokeRect(x0, y - 1, plotW, Math.max(plotH / o.cols, 2) + 2);
      } else {
        const x = x0 + (occlSel.index / o.rows) * plotW;
        ctx.strokeRect(x - 1, top, Math.max(plotW / o.rows, 2) + 2, plotH);
      }
    }

    // Where the diagonal actually is. The input spans 0-16,384 and the output only the cropped
    // interior, so it is a line of slope < 1 that does not reach either corner.
    ctx.strokeStyle = muted;
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let b = 0; b <= N_BINS; b += 32) {
      const bp = CROP_BP + b * BIN_BP;
      const px = x0 + (bp / SEQ_LEN) * plotW;
      const py = top + (b / N_BINS) * plotH;
      if (b === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // The traced region, as a band on the output axis.
    if (tracedBins) {
      ctx.strokeStyle = getComputedStyle(host).getPropertyValue('--vp-accent').trim() || '#3976a8';
      const ya = top + (tracedBins.start / N_BINS) * plotH;
      const yb = top + (tracedBins.end / N_BINS) * plotH;
      ctx.strokeRect(x0, ya, plotW, Math.max(yb - ya, 2));
    }

    ctx.fillStyle = muted;
    ctx.textAlign = 'center';
    for (const bp of bpTicks(4000)) {
      const px = x0 + (bp / SEQ_LEN) * plotW;
      ctx.textAlign = bp === 0 ? 'left' : bp >= SEQ_LEN ? 'right' : 'center';
      ctx.fillText(bpLabel(bp), px, cssH - 16);
    }
    ctx.textAlign = 'left';
    ctx.fillText('input window, bp →', x0, cssH - 3);
    ctx.save();
    ctx.translate(11, top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('output bin', 0, 0);
    ctx.restore();
    let peak = 0;
    for (let i = 0; i < o.plane.length; i += 1) peak = Math.max(peak, Math.abs(o.plane[i]));
    ctx.fillText(`dashed line = the diagonal · blue: ablating that window LOWERS that bin`, x0 + 130, cssH - 3);
    occlCanvas.dataset.peak = String(peak);
    occlCanvas.dataset.selection = occlSel ? `${occlSel.kind}:${occlSel.index}` : '';
    // Click to pick a row or a column. Which one depends on where the pointer lands relative to
    // the diagonal's own geometry -- so the handler is registered once, here, against the same
    // plot rectangle the drawing used, rather than recomputed from the element box.
    occlCanvas.onclick = (ev) => {
      const box = occlCanvas.getBoundingClientRect();
      const px = ((ev.clientX - box.left) / box.width) * cssW;
      const py = ((ev.clientY - box.top) / box.height) * cssH;
      if (px < x0 || px > x0 + plotW || py < top || py > top + plotH) {
        occlSel = null;
      } else {
        const col = Math.floor(((px - x0) / plotW) * o.rows);
        const row = Math.floor(((py - top) / plotH) * o.cols);
        // A row is an output bin and a column an input window; pick whichever the pointer is
        // nearer to selecting uniquely -- the map is 256 wide and 896 tall, so a vertical drag
        // resolves rows far more finely than columns.
        const same = occlSel && ((occlSel.kind === 'row' && occlSel.index === row)
          || (occlSel.kind === 'col' && occlSel.index === col));
        occlSel = same ? null
          : ev.shiftKey ? { kind: 'col', index: col } : { kind: 'row', index: row };
      }
      renderOcclusion();
      renderMethods();
    };
    if (occlPick) {
      if (!occlSel) {
        occlPick.textContent = 'click a row for one output bin, shift-click for an input window';
      } else if (occlSel.kind === 'row') {
        const bp = CROP_BP + occlSel.index * BIN_BP;
        occlPick.textContent = `output bin ${occlSel.index} (${bp.toLocaleString()} bp) · `
          + `depends on the sequence by ${rowSum[occlSel.index].toFixed(2)} summed |logSED|`;
      } else {
        occlPick.textContent = `input window ${occlSel.index * o.win}–${(occlSel.index + 1) * o.win} bp · `
          + `drives ${colSum[occlSel.index].toFixed(2)} summed |logSED| across all 896 bins`;
      }
    }
    if (occlStat) {
      occlStat.textContent = `${o.rows} windows × ${o.win} bp vs ${o.cols} output bins · `
        + `${(o.rows).toLocaleString()} real forward passes · peak |logSED| ${peak.toFixed(2)}`;
    }
  }

  /**
   * Every view that depends on the traced region, refreshed together.
   *
   * One call site rather than five scattered ones. The five renderers were being invoked from four
   * places each, in slightly different orders and with one place missing the flow-canvas repaint --
   * which is exactly how the relevance mode came to be stale for a new region while every panel
   * below it updated correctly.
   */
  function refreshRegionViews(): void {
    renderStageProfile();
    renderRollout();
    renderStageStack();
    renderNeuronTraces();
    renderMethods();
    renderOcclusion();
    applyShowing();          // the flow canvas is region-specific in relevance mode
  }

  /** Trace a bin range and update every view that shows it. */
  function traceBins(start: number, end: number, label: string): void {
    tracedBins = { start: Math.max(0, start), end: Math.min(N_BINS, end), label };
    // Centre the logo on the region just selected. Leaving the pan where it was showed the letters
    // of wherever the reader last looked, which under a new region's heading reads as that
    // region's bases -- the same class of stale-view bug as a locus change that kept its canvases.
    if (logoPan) {
      const midBp = CROP_BP + ((tracedBins.start + tracedBins.end) / 2) * BIN_BP;
      logoPan.value = String(Math.round(windowFraction(midBp) * 1000));
    }
    renderTrack();          // the curve carries the selection marker, so it has to redraw too
    renderAttribution();
    refreshRegionViews();
    renderSeqLogo();
    trace3d();
    renderStageDetail(flow?.selected() ?? null);
    if (traceLabel) {
      const frac = ((tracedBins.end - tracedBins.start) * BIN_BP) / SEQ_LEN;
      traceLabel.textContent =
        `Tracing ${label} — bins ${tracedBins.start}–${tracedBins.end}`
        + ` (${(frac * 100).toFixed(1)}% of the window)`;
    }
  }

  /**
   * Light the traced path through the volume: each stage's slab is dimmed in proportion to how
   * little of the selected region's relevance passes through it.
   *
   * Relevance is a MEAN over the stage's channels, not a sum -- summing would rank a 1,536-channel
   * stage above a 384-channel one on width alone, which is a fact about the architecture and not
   * about this selection. Stages whose activations live on their own tensors (the input one-hot,
   * the conv stem, the head) have no per-layer relevance in the pack, so they are left undimmed
   * rather than shown at the floor, which would read as "contributes nothing".
   */
  function trace3d(): void {
    if (!flow3d) return;
    if (!attribution || !tracedBins) {
      flow3d.setTrace(null);
      return;
    }
    const rel = traceChannels(attribution, tracedBins.start, tracedBins.end);
    const per = new Map<string, number>();
    let hi = 0;
    for (const off of stageMapOffsets()) {
      let s = 0;
      for (let c = 0; c < off.channels; c += 1) s += Math.abs(rel[off.start + c]);
      const v = s / off.channels;
      per.set(off.id, v);
      if (v > hi) hi = v;
    }
    // Relevance spans orders of magnitude across stages, so a linear normalisation leaves one
    // slab lit and the other seventeen at the floor -- which reports a single stage rather than a
    // path. Map log-relevance onto [0, 1] instead: strictly monotone in the true quantity, so the
    // ordering is exactly preserved, and the whole path stays legible. Same rule the flow
    // canvas's channel axis follows.
    const lo = Math.min(...[...per.values()].filter((v) => v > 0), hi);
    if (hi > 0 && lo > 0 && hi > lo) {
      const span = Math.log(hi) - Math.log(lo);
      for (const [k, v] of per) per.set(k, v > 0 ? (Math.log(v) - Math.log(lo)) / span : 0);
    } else {
      for (const [k, v] of per) per.set(k, hi > 0 ? v / hi : 0);
    }
    flow3d.setTrace(per);
  }

  /** Paint each slab's face from the same activation map its 2D raster draws. */
  function paint3dFaces(): void {
    if (!flow3d || !current) return;
    const acts: FlowActivations = {
      input: current.input,
      stemProfile: current.stemProfile,
      stageMaps: current.stageMaps,
      attention: current.attention,
      tracks: current.tracks,
    };
    const neutral = neutralRgb();
    for (const stage of FLOW_STAGES) {
      const map = stageMap(stage, acts);
      if (!map) continue;
      // Cap the texture: a 16,384-position face is more pixels than any screen shows of one slab.
      const cols = Math.min(map.positions, 256);
      const rows = Math.min(map.channels, 256);
      const sub = new Float64Array(rows * cols);
      for (let r = 0; r < rows; r += 1) {
        const c0 = Math.floor((r / rows) * map.channels);
        for (let c = 0; c < cols; c += 1) {
          sub[r * cols + c] = map.data[c0 * map.positions + Math.floor((c / cols) * map.positions)];
        }
      }
      flow3d.setFace(stage.id, paintActivationMap(sub, rows, cols, activationScale(sub), neutral), cols, rows);
    }
  }

  /** The one-hot the model is fed, channel-major, so the chain can start at the sequence. */
  function inputPlane(seq: string): Float32Array {
    const out = new Float32Array(4 * SEQ_LEN);
    for (let i = 0; i < Math.min(seq.length, SEQ_LEN); i += 1) {
      const j = BASES.indexOf(seq[i].toUpperCase() as (typeof BASES)[number]);
      if (j >= 0) out[j * SEQ_LEN + i] = 1;
    }
    return out;
  }

  function setStatus(msg: string): void {
    if (statusEl) statusEl.textContent = msg;
  }

  // ---------------------------------------------------------------- wiring
  /**
   * Load a locus. There is no other mode.
   *
   * Free typing ran the conv stem live in TypeScript over a bare fragment, which was legitimate --
   * a convolution is translation-equivariant -- but it could never predict a track, and the stem
   * panel it fed made a claim the architecture does not support: `conv_dna` has
   * `activation: linear, norm_type: null`, so its 96 filters are a basis that any invertible
   * recombination leaves unchanged. The paper reads motifs off ISM contributions, not off
   * first-layer weights.
   */
  function loadLocus(): void {
    knockedOut = null;
    sequence = LOCI[locusIndex].sequence;
    clearResults(`Loading ${LOCI[locusIndex].gene}…`);
    void adoptPrecomputed(LOCI[locusIndex].id);
    if (knockoutStat) knockoutStat.textContent = '';
  }

  locusSelect?.addEventListener('change', () => {
    locusIndex = Number(locusSelect.value);
    loadLocus();
  });

  // Canvases are painted with tokens read at draw time; SVG panels restyle themselves, canvases
  // do not.
  const onTheme = () => {
    renderHeatmap();
    renderIsmLogo();
    refreshRegionViews();
    renderStageDetail(flow?.selected() ?? null);
  };
  document.addEventListener('khc:theme-change', onTheme);
  runBtn?.addEventListener('click', () => void runFull());

  /**
   * The clicked stage at full resolution: every channel of that stage as one row, drawn from the
   * same forward pass the prediction came from. The named top channels are its loudest neurons.
   */
  function renderStageDetail(stage: FlowStage | null): void {
    if (!stageDetail || !stageMapCanvas) return;
    const spec = stage ?? layerSpecs().find((s) => s.id === 'stem')!;
    const isAttn = spec.id.startsWith('attn');

    if (stageTitle) {
      // The input is the one stage whose drawn channel count is not its real one: the model is fed
      // 170 channels and only the 4 DNA rows vary, so titling it "4 channels" understates what the
      // network actually receives.
      stageTitle.textContent = spec.id === 'input'
        ? `${spec.label} · ${SEQ_LEN.toLocaleString()} positions × ${IN_CHANNELS} channels`
          + ` (${N_DNA} DNA + ${N_MASK} mask + ${N_SPECIES} species; ${N_DNA} vary)`
        : `${spec.label} · ${spec.positions.toLocaleString()} positions × `
          + `${spec.channels.toLocaleString()} channels`;
    }
    drawAspectSwatch(spec.positions, spec.channels);

    // Attention is a second view of a transformer layer, not a panel of its own: it is that
    // layer's most characteristic internal state, but it is not an activation map.
  
  tabBtns.forEach((b) => {
      const which = b.dataset.vpTab;
      if (which === 'attention') b.hidden = !isAttn;
      b.setAttribute('aria-pressed', String(which === stageTab));
    });
    if (!isAttn) stageTab = 'activation';

    // The operations inside this stage, each with the tensor it produces.
    if (subLayerList) {
      clear(subLayerList);
      for (const sub of subLayers(spec)) {
        const li = document.createElement('li');
        if (sub.handoff) li.dataset.handoff = 'true';
        const op = document.createElement('span');
        op.className = 'op';
        op.textContent = sub.op;
        const shape = document.createElement('span');
        shape.className = 'shape';
        shape.textContent = `${sub.positions.toLocaleString()} × ${sub.channels.toLocaleString()}`;
        li.append(op, shape);
        subLayerList.append(li);
      }
    }

    const acts: FlowActivations | null = current
      ? {
          input: current.input,
          stemProfile: current.stemProfile,
          stageMaps: current.stageMaps,
          attention: current.attention,
          tracks: current.tracks,
        }
      : null;

    // In relevance mode the raster shows what this stage contributed to the traced region, with
    // every other output bin masked out -- the same tensor the flow canvas paints above.
    const rel = showing === 'relevance' ? stageRelevance(spec.id) : null;
    const map =
      stageTab === 'attention'
        ? (() => {
            const a = attentionMap(spec as FlowStage, acts);
            return a ? { data: a, channels: 128, positions: 128 } : null;
          })()
        : rel ?? stageMap(spec as FlowStage, acts);

    const ctx = stageMapCanvas.getContext('2d');
    const cssW = stageMapCanvas.clientWidth || 900;
    // One row is one channel, at every stage -- so the raster's height IS the channel count and
    // stages are comparable. The two stages whose rows are NAMED rather than numbered (the input's
    // four bases, the head's four assay groups) keep legible rows and say so below.
    const namedRows = spec.id === 'input' || spec.id === 'head';
    const geom = map
      ? stageRasterHeight(map.channels, namedRows)
      : { height: 12, rowH: 3, shared: true };
    const rowH = geom.rowH;
    // Deep enough for the tick labels AND two gene rows below them. At 30 px the two bands
    // overlapped by 4 px, so a gene block was painted through the top of a coordinate label.
    const RULER_H = 56;
    const cssH = map ? geom.height + 34 + RULER_H : 40;   // + profile strip + genome ruler
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    stageMapCanvas.width = Math.round(cssW * dpr);
    stageMapCanvas.height = Math.round(cssH * dpr);
    stageMapCanvas.style.height = `${cssH}px`;
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (!map) {
      ctx.fillStyle = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`${emptyReason}  This layer will fill with that run's activations.`, 4, 22);
      if (stageTop) stageTop.textContent = '';
      if (stageNote) stageNote.textContent = '';
      if (legendEl) clear(legendEl);
      return;
    }

    const { data, channels, positions } = map;
    // The band this stage's raster occupies, in the page's one coordinate. Every stage but the
    // head spans the whole window; the head's 896 bins cover only the cropped interior, so it is
    // INSET rather than stretched to fill -- which is what makes its rows line up with the
    // coverage curve above, bin for bin.
    const stageLo = stageTab === 'attention' ? 0 : positionToBp(spec.id, 0, positions);
    const stageHi = stageTab === 'attention' ? SEQ_LEN : positionToBp(spec.id, positions, positions);
    const bandX0 = xOfBp(stageLo, cssW);
    const bandW = Math.max(xOfBp(stageHi, cssW) - bandX0, 1);
    // Percentile, not min-max. These tensors are heavy-tailed and a handful of outliers otherwise
    // set the range, flattening every other cell onto the same ink -- measured, the drawn contrast
    // falls tenfold from block 1 to block 7.
    const cellW = 1;   // replaced by the band mapping below; kept for the profile's step

    // The output head's four assay groups differ ~40x in range, so one shared scale left three of
    // them drawing 0.0% of their 896 bins. Each gets its own, on the log axis coverage is read on
    // everywhere else on this page.
    const perChannel = spec.id === 'head';
    const scale = perChannel ? null : activationScale(data);
    const rowMax = new Float64Array(perChannel ? channels : 0);
    if (perChannel) {
      for (let c = 0; c < channels; c += 1) {
        let m = 0;
        for (let p = 0; p < positions; p += 1) if (data[c * positions + p] > m) m = data[c * positions + p];
        rowMax[c] = m;
      }
    }

    if (perChannel) {
      // The head's four assay groups differ ~40x, so each is scaled to its own peak on the log
      // axis the rest of the page reads coverage on -- then painted like everything else.
      const norm = new Float64Array(channels * positions);
      for (let c = 0; c < channels; c += 1) {
        for (let p = 0; p < positions; p += 1) {
          norm[c * positions + p] = logAxis(data[c * positions + p], rowMax[c]);
        }
      }
      blitMap(ctx, norm, channels, positions, { kind: 'sequential', lo: 0, hi: 1, half: 1 },
        bandX0, 0, bandW, geom.height);
    } else {
      blitMap(ctx, data, channels, positions, scale!, bandX0, 0, bandW, geom.height);
    }
    drawChannelAxis(ctx, channels, rowH, cssW, perChannel);

    const peaks: { c: number; v: number }[] = [];
    for (let c = 0; c < channels; c += 1) {
      let m = -Infinity;
      for (let p = 0; p < positions; p += 1) if (data[c * positions + p] > m) m = data[c * positions + p];
      peaks.push({ c, v: m });
    }
    peaks.sort((a, b) => b.v - a.v);

    // With a region traced, rank this stage's channels by how much they CARRIED that region
    // rather than by how loudly they fired. `traceChannels` returns relevance in stage_maps
    // channel order, so a stage is a slice of it -- the same offsets stageMap uses.
    let contributing: { c: number; v: number }[] | null = null;
    if (attribution && tracedBins) {
      const off = stageMapOffsets().find((o) => o.id === spec.id);
      if (off) {
        const rel = traceChannels(attribution, tracedBins.start, tracedBins.end);
        contributing = [];
        for (let c = 0; c < off.channels; c += 1) {
          contributing.push({ c, v: rel[off.start + c] });
        }
        contributing.sort((a, b) => b.v - a.v);
      }
    }

    if (stageTop) {
      // Two stages need their own summary, because "loudest channels" is meaningless at both ends
      // of the network. At the input every channel's maximum is exactly 1.00 by construction, so
      // the ranking is noise; at the head the four rows are ASSAY GROUPS, and numbering them #0-#3
      // beside a title reading "5,215 channels" invites reading them as channel indices.
      const summary = (): string => {
        if (spec.id === 'input') {
          const n = [0, 0, 0, 0];
          for (let c = 0; c < 4; c += 1) {
            for (let p = 0; p < positions; p += 1) if (data[c * positions + p] > 0.5) n[c] += 1;
          }
          const tot = n.reduce((a, b) => a + b, 0) || 1;
          const gc = ((n[1] + n[2]) / tot) * 100;
          return `base composition: ${'ACGT'.split('').map((b, i) => `${b} ${((n[i] / tot) * 100).toFixed(1)}%`).join(', ')}`
            + ` · GC ${gc.toFixed(1)}%`;
        }
        if (spec.id === 'head') {
          return 'peak per assay group: '
            + peaks.slice(0, 4)
              .map((q) => `${TRACK_GROUPS[q.c]?.label ?? `#${q.c}`} (${q.v.toFixed(2)})`)
              .join(', ');
        }
        return 'loudest channels: ' + peaks.slice(0, 5).map((q) => `#${q.c} (${q.v.toFixed(2)})`).join(', ');
      };
      stageTop.textContent =
        stageTab === 'attention'
          ? `${positions} × ${positions} over the bottleneck, mean of ${N_HEADS} heads`
          : contributing
            ? `channels carrying ${tracedBins!.label}: `
              + contributing.slice(0, 5).map((q) => `#${q.c} (${q.v.toFixed(2)})`).join(', ')
            : summary();
    }
    // The selected channel, on its own, at this stage's resolution -- one neuron's activation
    // across the window, which a 384-row raster cannot show you.
    const ch = Math.min(selectedFilter, channels - 1);
    let chLo = Infinity;
    let chHi = -Infinity;
    for (let p = 0; p < positions; p += 1) {
      const v = data[ch * positions + p];
      if (v < chLo) chLo = v;
      if (v > chHi) chHi = v;
    }
    const profH = 34;
    const profTop = cssH - RULER_H - profH;   // the ruler owns the bottom RULER_H px
    const span = Math.max(chHi - chLo, 1e-9);
    ctx.strokeStyle = getComputedStyle(host).getPropertyValue('--vp-accent').trim() || '#3976a8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let p = 0; p < positions; p += 1) {
      const x = bandX0 + ((p + 0.5) / positions) * bandW;
      const y = profTop + (1 - (data[ch * positions + p] - chLo) / span) * (profH - 4);
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(`channel #${ch}  ${chLo.toFixed(2)} … ${chHi.toFixed(2)}`, PLOT.left + 3, profTop + 9);

    // Name the head's four rows; with 5,215 channels collapsed to four group means, "channel #2"
    // is not a useful label.
    if (perChannel && rowH >= 10) {
      ctx.fillStyle = getComputedStyle(host).getPropertyValue('--color-ink').trim() || '#141414';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      TRACK_GROUPS.forEach((g, i) => {
        ctx.fillText(g.label, bandX0 + 4, i * rowH + rowH / 2 + 3.5);
      });
    }

    // A genome ruler under the raster: without it the x-axis is an index, and you cannot tell
    // which neurons fire over the gene. Positions map to bp through positionToBp, which knows the
    // head's 896 bins start CROP_BP into the window while every other stage spans the whole input.
    {
      const locus = LOCI[locusIndex];
      const rulerY = cssH - RULER_H;
      const muted = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';
      const rule = getComputedStyle(host).getPropertyValue('--color-rule').trim() || '#e5e7eb';

      ctx.strokeStyle = rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PLOT.left, rulerY + 0.5);
      ctx.lineTo(cssW - PLOT.right, rulerY + 0.5);
      ctx.stroke();

      // Gene models go BELOW the coordinate labels, not through them.
      drawGeneRowsCanvas(ctx, locus, cssW, rulerY + 30, 11);

      // The window the paper's figure prints, where there is one.
      if (locus.figureWindow) {
        const a = xOfBp(locus.figureWindow.seqStart, cssW);
        const b = xOfBp(locus.figureWindow.seqEnd, cssW);
        ctx.strokeStyle = getComputedStyle(host).getPropertyValue('--vp-orf').trim() || '#6f62a8';
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(a, rulerY + 29, Math.max(b - a, 2), 24);
        ctx.setLineDash([]);
      }

      // bp ticks, labelled with real chromosome coordinates.
      ctx.fillStyle = muted;
      ctx.textAlign = 'center';
      for (const bp of bpTicks(4000)) {
        const x = xOfBp(bp, cssW);
        ctx.fillRect(x, rulerY + 4, 1, 3);
        ctx.textAlign = bp === 0 ? 'left' : bp >= SEQ_LEN ? 'right' : 'center';
        ctx.fillText(`${((locus.start + bp) / 1000).toFixed(1)} kb`, x, rulerY + 17);
      }
      ctx.textAlign = 'left';
    }

    // Say what the colours mean. A diverging map is meaningless without it: blue and red are not
    // "two kinds of neuron", they are the sign of one number.
    if (legendEl) {
      clear(legendEl);
      const swatch = document.createElement('i');
      const posC = getComputedStyle(host).getPropertyValue('--vp-fire').trim() || '#b0455a';
      const negC = getComputedStyle(host).getPropertyValue('--vp-accent').trim() || '#3976a8';
      const label = document.createElement('span');
      if (perChannel) {
        swatch.style.background = `linear-gradient(90deg, transparent, ${posC})`;
        label.textContent = '0 → peak, per track, log';
      } else if (scale && scale.kind === 'diverging') {
        swatch.style.background =
          `linear-gradient(90deg, ${negC}, transparent 50%, ${posC})`;
        label.textContent = `−${scale.half.toFixed(2)} ← 0 → +${scale.half.toFixed(2)}`;
      } else {
        swatch.style.background = `linear-gradient(90deg, transparent, ${posC})`;
        label.textContent = scale ? `${scale.lo.toFixed(2)} → ${scale.hi.toFixed(2)}` : '';
      }
      legendEl.append(swatch, label);
    }

    if (stageNote) {
      // The head's 896 positions are 16 bp BINS covering the cropped 14,336 bp interior, not
      // SEQ_LEN/896 = 18.3. Every other stage does span the whole 16,384 bp input.
      const bp = spec.id === 'head' ? BIN_BP : Math.round(SEQ_LEN / positions);
      // The head's 5,215 channels are drawn in full by the per-track section; here it shows the
      // four assay-group means, so say which is which rather than let the header imply 5,215 rows.
      const drawn =
        spec.id === 'head'
          ? `The four assay-group means of the head's ${spec.channels.toLocaleString()} channels — ` +
            `every track individually is in "Every output track" below. `
          : spec.id === 'input'
            // The model is fed 170 channels and only 4 of them vary, so drawing 4 rows is right --
            // but leaving the other 166 unmentioned understates the input, and the species channel
            // is not a detail: setting it wrong produces silent garbage.
            ? `${IN_CHANNELS} channels go in — ${N_DNA} DNA, 1 more, ${N_SPECIES} species. Only the `
              + `${N_DNA} DNA rows vary along the sequence, so only those are drawn; the other `
              + `${N_MASK + N_SPECIES} are constant and carry no positional information. The species `
              + `one-hot is one channel held at 1 everywhere — species ${SPECIES_S_CEREVISIAE} of `
              + `${N_SPECIES}, S. cerevisiae, which is absolute channel `
              + `${N_DNA + N_MASK + SPECIES_S_CEREVISIAE}. The fifth channel is never written by any `
              + `code the paper ships and is zero here; the language model masks by zeroing the DNA `
              + `channels, not by setting it. `
            : '';
      // Say when a stage is NOT on the shared scale, rather than leaving a reader to wonder why
      // the input's four rows are 30 px each and a transformer layer's 384 are one.
      const scaleNote = geom.shared
        ? `One row is one channel, ${PX_PER_CHANNEL} px each — the same scale at every stage, so this `
          + `raster's height is its channel count. `
        : `These ${spec.channels === IN_CHANNELS ? N_DNA : 4} rows are NAMED, not numbered, so they `
          + `are drawn legibly rather than on the one-pixel-per-channel scale the other stages share. `;
      const modeNote = rel
        ? `Showing this stage's RELEVANCE to ${tracedBins?.label ?? 'the traced region'}, not its `
          + 'activation: every other output bin masked out. Both margins are exact; the interior is '
          + 'their outer product. '
        : showing !== 'relevance'
          ? ''
          // Three distinct reasons, and conflating them reads as a bug on the two stages where it
          // is simply not measurable: the input, stem and head live on their own tensors and have
          // no per-layer relevance in the pack at all.
          : !stageMapOffsets().some((o) => o.id === spec.id)
            ? 'This stage has no per-layer relevance in the pack — the input, conv stem and head '
              + 'live on their own tensors — so it shows its activation. '
            : !tracedBins
              ? 'Trace a region below and this stage will show its relevance to that region. '
              : 'Relevance is unavailable for this locus — showing the activation instead. ';
      stageNote.textContent =
        stageTab === 'attention'
          ? `Row = query position, column = key position. Each position covers ${bp} bp.`
          : `${modeNote}${drawn}${scaleNote}` +
            (perChannel
              ? 'Each track is scaled to its own peak on a log axis, because the four assay groups differ ~40x. '
              : scale && scale.kind === 'diverging'
                ? 'Every cell is painted: red is a positive activation, blue negative, and a neuron near zero takes the colour of the card behind it. '
                : 'Ink runs low to high across the range this stage occupies. ') +
            `Each column covers ${bp} bp of input; the ruler beneath is the real coordinate, with ` +
            `annotated ORFs. The line above it is channel #${ch} alone — click a row in the ` +
            `conv-stem raster to change it.`;
    }
  }

  // ---------------------------------------------------------------- the flow canvas
  if (flowCanvas) {
    flow = createFlow(flowCanvas, host);
    flow.onChange((t, stage, isPlaying) => {
      // The sweep walks the network: as the front crosses a stage, the detail panel below becomes
      // that stage, so playing it is a tour rather than a decoration. A held selection wins.
      if (!flow?.selected() && stage.id !== lastFrontStage) {
        lastFrontStage = stage.id;
        renderStageDetail(stage);
      }
      if (stageStat) {
        stageStat.textContent =
          `${stage.label} · ${stage.positions.toLocaleString()} × ${stage.channels.toLocaleString()}` +
          ` · receptive field ${stage.receptiveField.toLocaleString()} bp`;
      }
      // Do not fight the user's grip on the slider: only the animation writes back to it.
      if (scrubInput && isPlaying && document.activeElement !== scrubInput) {
        scrubInput.value = String(Math.round(t * 1000));
      }
    });
    flow.onSelect((stage) => renderStageDetail(stage));
    flow.setScrub(1);
  }

  scrubInput?.addEventListener('input', () => {
    // Read the DOM value first: setPlaying reports state, which writes back into this input.
    const v = Number(scrubInput.value) / 1000;
    if (flow?.isPlaying()) {
      flow.setPlaying(false);
      if (playBtn) { playBtn.textContent = '▶ Play'; playBtn.setAttribute('aria-pressed', 'false'); }
    }
    flow?.setScrub(v);
  });

  playBtn?.addEventListener('click', () => {
    if (!flow) return;
    const next = !flow.isPlaying();
    flow.setPlaying(next);
    const on = flow.isPlaying();
    playBtn.textContent = on ? '❙❙ Pause' : '▶ Play';
    playBtn.setAttribute('aria-pressed', String(on));
    // Reduced motion refuses to sweep and jumps to the finished state; the slider must follow.
    if (next && !on && scrubInput) scrubInput.value = '1000';
  });

  pickGroup?.addEventListener('change', () => {
    selectedTrack = firstTrackOf(Number(pickGroup.value));
    renderPicker(true);
    renderHeatmap();
    renderSingleTrack();
  });
  pickKey?.addEventListener('change', () => {
    selectedTrack = firstTrackOf(Number(pickGroup!.value), pickKey.value);
    renderPicker();
    renderHeatmap();
    renderSingleTrack();
  });
  pickTrack?.addEventListener('change', () => {
    selectedTrack = Number(pickTrack.value);
    renderHeatmap();
    renderSingleTrack();
  });

  /**
   * The region stepper. Iterating regions is the workflow this panel exists for -- picking one
   * region from a dropdown answers one question, walking them answers "which region behaves
   * differently", which is the one worth asking.
   */
  function renderRegionList(): void {
    if (!regionSelect) return;
    clear(regionSelect);
    for (const a of attribution?.anchors ?? []) {
      const o = document.createElement('option');
      o.value = `${a.binStart}:${a.binEnd}`;
      o.textContent = `${a.label} (${(a.massInside * 100).toFixed(0)}% of its mass)`;
      regionSelect.append(o);
    }
    if (tracedBins) regionSelect.value = `${tracedBins.start}:${tracedBins.end}`;
    if (regionStat) {
      regionStat.textContent = attribution
        ? `${attribution.anchors.length} precomputed regions · or drag on the curve above`
        : 'no traceback pack for this locus';
    }
  }

  function stepRegion(delta: number): void {
    const anchors = attribution?.anchors ?? [];
    if (!anchors.length) return;
    const at = anchors.findIndex(
      (a) => tracedBins && a.binStart === tracedBins.start && a.binEnd === tracedBins.end,
    );
    const next = anchors[(((at < 0 ? 0 : at + delta) % anchors.length) + anchors.length) % anchors.length];
    traceBins(next.binStart, next.binEnd, next.label);
    if (regionSelect) regionSelect.value = `${next.binStart}:${next.binEnd}`;
  }

  host.querySelector('[data-vp-region-prev]')?.addEventListener('click', () => stepRegion(-1));
  host.querySelector('[data-vp-region-next]')?.addEventListener('click', () => stepRegion(1));
  regionSelect?.addEventListener('change', () => {
    const [s, e] = regionSelect.value.split(':').map(Number);
    const a = attribution?.anchors.find((x) => x.binStart === s && x.binEnd === e);
    if (a) traceBins(a.binStart, a.binEnd, a.label);
  });
  logoPan?.addEventListener('input', renderSeqLogo);
  logoWidth?.addEventListener('change', renderSeqLogo);
  logoSource?.addEventListener('change', renderSeqLogo);

  occlNorm?.addEventListener('change', renderOcclusion);

  spinBtn?.addEventListener('click', () => {
    flow3d?.resumeSpin();
    spinBtn.hidden = true;
  });

  host.querySelector<HTMLInputElement>('[data-vp-generows]')?.addEventListener('change', (ev) => {
    geneRowsExpanded = (ev.target as HTMLInputElement).checked;
    renderTrack();
    renderAttribution();
    renderStageDetail(flow?.selected() ?? null);
  });

  if (trackSvg) {
    // Drag across the predicted curve to choose a region. The plot is inset by PLOT.left and runs
    // over the FULL window, so a pointer must go x -> bp -> bin rather than straight to a bin
    // fraction: doing the latter put every selection about 1,024 bp left of the pointer.
    let dragFrom: number | null = null;
    const binAt = (ev: PointerEvent) => {
      const box = trackSvg.getBoundingClientRect();
      const bp = bpOfX(((ev.clientX - box.left) / box.width) * 1000, 1000);
      return Math.round((bp - CROP_BP) / BIN_BP);
    };
    trackSvg.classList.add('vp-track-select');
    trackSvg.addEventListener('pointerdown', (ev) => {
      if (!attribution) return;
      dragFrom = binAt(ev);
      trackSvg.setPointerCapture(ev.pointerId);
    });
    trackSvg.addEventListener('pointerup', (ev) => {
      if (dragFrom === null || !attribution) return;
      const to = binAt(ev);
      const [a, b] = dragFrom <= to ? [dragFrom, to] : [to, dragFrom];
      dragFrom = null;
      // A click rather than a drag: take one group's width so there is something to show.
      const width = Math.max(b - a, attribution.groupBins);
      if (anchorSelect) anchorSelect.value = '';
      traceBins(a, a + width, 'dragged region');
    });
  }

  anchorSelect?.addEventListener('change', () => {
    const i = Number(anchorSelect.value);
    const a = attribution?.anchors[i];
    if (!a) return;
    traceBins(a.binStart, a.binEnd, a.label);
  });

  traceClear?.addEventListener('click', () => {
    tracedBins = null;
    if (anchorSelect) anchorSelect.value = '';
    if (traceLabel) traceLabel.textContent = 'Drag across the curve above to trace a region back to the sequence.';
    renderTrack();
    renderAttribution();
    refreshRegionViews();
    renderSeqLogo();
    trace3d();
    renderStageDetail(flow?.selected() ?? null);
  });

  viewBtns.forEach((b) =>
    b.addEventListener('click', () => {
      const want3d = b.dataset.vpView === '3d';
      viewBtns.forEach((x) => x.setAttribute('aria-pressed', String((x.dataset.vpView === '3d') === want3d)));
      if (flowCanvas) flowCanvas.hidden = want3d;
      if (flow3dCanvas) flow3dCanvas.hidden = !want3d;
      if (spinBtn) spinBtn.hidden = !want3d || (flow3d?.spinning() ?? true);
      host.dataset.vpView = want3d ? '3d' : '2d';
      if (want3d && flow3dCanvas && !flow3d) {
        // Built on first use: the three chunk is only worth fetching for a reader who asks for it.
        flow3d = createFlow3d(flow3dCanvas, host);
        paint3dFaces();
        trace3d();   // a region traced while the flat view was up must be lit on arrival here
        // The first drag stops the idle rotation; this is how a reader gets it back.
        flow3d.onSpinChange((on) => { if (spinBtn) spinBtn.hidden = on; });
        flow3d.onSelect((id: string | null) => {
          const i = FLOW_STAGES.findIndex((s) => s.id === id);
          if (i >= 0) {
            flow?.select(i);
            renderStageDetail(FLOW_STAGES[i]);
          }
        });
      }
      flow3d?.resize();
    }),
  );

  logToggle?.addEventListener('change', () => {
    useLogAxis = logToggle.checked;
    renderTrack();       // one control, both plots -- they show the same quantity
    renderSingleTrack();
  });

  tabBtns.forEach((b) =>
    b.addEventListener('click', () => {
      stageTab = b.dataset.vpTab === 'attention' ? 'attention' : 'activation';
      renderStageDetail(flow?.selected() ?? null);
    }),
  );

  truthToggle?.addEventListener('change', () => {
    showTruth = truthToggle.checked;
    renderTrack();
  });

  if (groupSelect) {
    clear(groupSelect);
    TRACK_GROUPS.forEach((g, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `${g.label} (${g.count.toLocaleString()})`;
      if (i === groupIndex) opt.selected = true;
      groupSelect.append(opt);
    });
    groupSelect.addEventListener('change', () => {
      groupIndex = Number(groupSelect.value);
      renderTrack();
    });
  }

  if (locusSelect) {
    clear(locusSelect);
    LOCI.forEach((l, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `${l.gene} — ${l.blurb}`;
      locusSelect.append(opt);
    });
  }

  renderLayers();
  renderTrack();
  renderMotifs();
  renderStageDetail(null);
  renderPicker(true);
  renderHeatmap();
  renderSingleTrack();
  renderAttribution();
  refreshRegionViews();
  renderSeqLogo();
  renderIsmLogo();
  // Locus mode is the only mode, so the first locus loads immediately rather than waiting for a
  // click on a toggle that no longer exists.
  loadLocus();

  return {
    destroy: () => {
      document.removeEventListener('khc:theme-change', onTheme);
      flow?.destroy();
      flow = null;
      // Without this a client-side navigation leaks a WebGL context per visit.
      flow3d?.destroy();
      flow3d = null;
      host.dataset.vpReady = 'false';
    },
  };
}

function boot() {
  initVariantPlayground(document);
}
boot();
document.addEventListener('astro:page-load', boot);
