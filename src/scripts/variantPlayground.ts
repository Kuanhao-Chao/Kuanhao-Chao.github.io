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

import stemWeightsJson from '../data/shorkieStem.json';
import lociJson from '../data/shorkieLoci.json';
import {
  createFlow,
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
  trackGroupOf,
  trackIndex,
  type ParsedTrack,
  trackRowBinning,
  logAxis,
  N_TRACKS,
  BIN_BP,
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

const STEM = stemWeightsJson as StemWeights;

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
  features: { name: string; start: number; end: number; strand: string }[];
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
  const seqInput = $<HTMLTextAreaElement>('[data-vp-seq]');
  const modeBtns = host.querySelectorAll<HTMLButtonElement>('[data-vp-mode]');
  const locusSelect = $<HTMLSelectElement>('[data-vp-locus]');
  const runBtn = $<HTMLButtonElement>('[data-vp-run]');
  const statusEl = $('[data-vp-status]');
  const neuronCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-neurons]');
  const trackSvg = host.querySelector<SVGSVGElement>('[data-vp-track]');
  const layerList = $('[data-vp-layers]');
  const liveStat = $('[data-vp-livestat]');
  const flowCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-flow]');
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
  const motifBox = $('[data-vp-motifs]');
  const motifList = $('[data-vp-motif-list]');
  const knockoutStat = $('[data-vp-knockout]');
  const stageTitle = $('[data-vp-stage-title]');
  const stageTop = $('[data-vp-stage-top]');
  const stageMapCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-stage-map]');

  let mode: 'type' | 'locus' = 'type';
  /** The full 16,384 bp window fed to ONNX. In free-typing mode it is just the typed text. */
  let sequence = 'GGCTATAAAAGGGCATCGATCACGTGACCGGTAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCC';
  /** The slice shown in the box and rastered live -- never the whole window. */
  let editable = sequence;
  const SLICE_START = 7000;
  const SLICE_LEN = 400;
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
  let groupIndex = RNA_SEQ_GROUP;
  let showTruth = true;
  let stageTab: 'activation' | 'attention' = 'activation';
  /** Which stage the detail last followed, so the sweep only redraws on a real change. */
  let lastFrontStage = '';
  /** Guards against a slow fetch for a locus the reader has left. */
  let precomputeToken = 0;
  // ARG80_T0_S757 -- a real T0 baseline experiment, which is the set Figure 4's ISM uses,
  // rather than a mean over all 3,053 induction tracks.
  let selectedTrack: number = TRACK_GROUPS[RNA_SEQ_GROUP].start;
  let useLogAxis = true;
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

  function renderNeurons(act: StemActivation): void {
    if (!neuronCanvas) return;
    const cssW = neuronCanvas.clientWidth || 900;
    const rowH = 3;
    const cssH = act.filters * rowH;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    neuronCanvas.width = Math.round(cssW * dpr);
    neuronCanvas.height = Math.round(cssH * dpr);
    neuronCanvas.style.height = `${cssH}px`;
    const ctx = neuronCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // The same scale the layer detail uses, so the two rasters of the same stage agree.
    const scale = activationScale(act.map);
    blitMap(ctx, act.map, act.filters, act.positions, scale, 0, 0, cssW, act.filters * rowH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = getComputedStyle(host).getPropertyValue('--vp-accent').trim() || '#3976a8';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, selectedFilter * rowH + 0.5, cssW - 1, rowH - 1);

    neuronCanvas.onclick = (ev) => {
      const box = neuronCanvas.getBoundingClientRect();
      const f = Math.floor(((ev.clientY - box.top) / box.height) * act.filters);
      if (f >= 0 && f < act.filters) {
        selectedFilter = f;
        refreshLive();
        // Show that channel where the detail view shows channels.
        flow?.select(0);
        renderStageDetail(flow?.selected() ?? null);
      }
    };
  }

  function refreshLive(): void {
    const t0 = performance.now();
    const act = stemActivations(editable, STEM);
    const tCompute = performance.now() - t0;
    renderNeurons(act);
    const fired = Array.from(act.peak).filter((v) => v > 0).length;
    if (liveStat) {
      liveStat.textContent =
        `${editable.length} bp · ${act.positions} positions · ${fired}/96 filters above zero · ` +
        `${tCompute.toFixed(1)} ms compute, ${(performance.now() - t0).toFixed(1)} ms total`;
    }
  }

  // ---------------------------------------------------------------- predicted track
  function renderTrack(): void {
    if (!trackSvg) return;
    clear(trackSvg);
    const W = 960;
    const H = 220;
    attr(trackSvg, { viewBox: `0 0 ${W} ${H}` });
    const n = N_BINS;
    const locusId = mode === 'locus' ? LOCI[locusIndex].id : '';
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
    const bw = W / n;
    // The SAME axis mapping the per-track plot uses. Two panels showing predicted coverage on two
    // different axes is how a page contradicts itself; a linear axis against a 995 peak is also
    // what made this curve look wrong in the first place -- 642 of the 896 bins are above 1.0 and
    // a linear axis puts all of them on the floor.
    const yOf = (v: number, ceiling: number) =>
      H - 26 - (useLogAxis ? logAxis(v, ceiling) : ceiling > 0 ? v / ceiling : 0) * (H - 46);

    const locus = LOCI[locusIndex];
    // The window the paper's figure prints, so a reader can see which slice of the 896 bins
    // Figure 4 was looking at.
    if (locus.figureWindow) {
      const { binStart, binEnd } = locus.figureWindow;
      const frame = el('rect');
      attr(frame, {
        x: binStart * bw, y: 18, width: Math.max((binEnd - binStart) * bw, 2), height: H - 44,
        fill: 'var(--vp-orf)', 'fill-opacity': 0.08,
        stroke: 'var(--vp-orf)', 'stroke-opacity': 0.5, 'stroke-dasharray': '3 2',
      });
      trackSvg.append(frame);
      trackSvg.append(text(binStart * bw + 3, 28, locus.figurePanel ?? 'figure window', 'vp-ax', 'start'));
    }
    for (const f of locus.features) {
      const r = el('rect');
      attr(r, {
        x: f.start * bw, y: H - 18, width: Math.max((f.end - f.start) * bw, 1), height: 10,
        fill: 'var(--vp-orf)', 'fill-opacity': 0.55,
      });
      trackSvg.append(r);
    }

    let d = `M0 ${H - 26}`;
    for (let i = 0; i < n; i += 1) d += ` L${(i * bw).toFixed(2)} ${yOf(vals[i], max).toFixed(2)}`;
    const path = el('path');
    attr(path, { d, fill: 'none', stroke: 'var(--vp-track)', 'stroke-width': 1.4 });
    trackSvg.append(path);

    if (current && reference && reference !== current) {
      let rd = `M0 ${H - 26}`;
      for (let i = 0; i < n; i += 1) {
        rd += ` L${(i * bw).toFixed(2)} ${yOf(reference.tracks[i * 4 + groupIndex], max).toFixed(2)}`;
      }
      const rp = el('path');
      attr(rp, { d: rd, fill: 'none', stroke: 'var(--color-muted)', 'stroke-width': 1, 'stroke-dasharray': '3 3' });
      trackSvg.insertBefore(rp, path);
    }
    if (truth) {
      let td = `M0 ${H - 26}`;
      for (let i = 0; i < n; i += 1) {
        td += ` L${(i * bw).toFixed(2)} ${yOf(truth[i], truthMax).toFixed(2)}`;
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

    let argmax = 0;
    for (let i = 1; i < n; i += 1) if (vals[i] > vals[argmax]) argmax = i;
    // Full precision, for the python-vs-browser parity check. The visible label is rounded, and
    // comparing rounded labels is how two different numbers come to look identical.
    trackSvg.dataset.peak = String(max);
    trackSvg.dataset.peakBin = String(argmax);
    trackSvg.append(
      text(4, 14,
        `predicted ${TRACK_GROUPS[groupIndex].label} · 896 bins × 16 bp · peak ${max.toFixed(2)}`
        + ` at bin ${argmax} · ${useLogAxis ? 'log' : 'linear'} axis`
        + (current?.backend === 'precomputed' || !current ? ' · precomputed' : ' · live run'),
        'vp-ax', 'start'),
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
    const base = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/shorkie`;
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
    if (mode !== 'locus') {
      setStatus('Switch to a locus to run the full model — a typed fragment is not a 16,384 bp window.');
      return;
    }
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
    const W = 960;
    const H = 150;
    attr(singleSvg, { viewBox: `0 0 ${W} ${H}` });

    const locusId = mode === 'locus' ? LOCI[locusIndex].id : '';
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
    const bw = W / N_BINS;
    const y = (v: number) =>
      H - 24 - (useLogAxis ? logAxis(v, max) : max > 0 ? v / max : 0) * (H - 40);

    let d = `M0 ${y(vals[0])}`;
    for (let i = 1; i < N_BINS; i += 1) d += ` L${(i * bw).toFixed(2)} ${y(vals[i]).toFixed(2)}`;
    const path = el('path');
    attr(path, { d, fill: 'none', stroke: 'var(--vp-track)', 'stroke-width': 1.2 });
    singleSvg.append(path);

    let argmax = 0;
    for (let i = 1; i < N_BINS; i += 1) if (vals[i] > vals[argmax]) argmax = i;
    singleSvg.append(
      text(4, 14,
        `${label} · peak ${max.toFixed(2)} at bin ${argmax} · ${useLogAxis ? 'log' : 'linear'} axis`,
        'vp-ax', 'start'),
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
    const locus = mode === 'locus' ? LOCI[locusIndex] : null;
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
    const got = await loadPrecomputed(locusId);
    // A slower fetch for a locus the reader has already navigated away from must not overwrite the
    // one they are looking at now.
    if (token !== precomputeToken || locusId !== LOCI[locusIndex].id) return;
    if (!got) {
      emptyReason = `${LOCI[locusIndex].gene}: precomputed layers unavailable — load the model to compute them.`;
      renderStageDetail(flow?.selected() ?? null);
      setStatus(emptyReason);
      return;
    }
    current = got;
    reference = got;
    host.dataset.vpResultLocus = locusId;
    host.dataset.vpResultSource = 'precomputed';
    emptyReason = `${LOCI[locusIndex].gene} — precomputed.`;
    flow?.setActivations({
      stemProfile: got.stemProfile,
      stageMaps: got.stageMaps,
      attention: got.attention,
      tracks: got.tracks,
    } satisfies FlowActivations);
    renderTrack();
    renderStageDetail(flow?.selected() ?? null);
    renderHeatmap();
    renderSingleTrack();
    setStatus(`${LOCI[locusIndex].gene}: all layers and all ${N_TRACKS.toLocaleString()} tracks, precomputed.`);
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

  function setStatus(msg: string): void {
    if (statusEl) statusEl.textContent = msg;
  }

  // ---------------------------------------------------------------- wiring
  function setMode(next: 'type' | 'locus'): void {
    mode = next;
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vpMode === next)));
    if (next === 'locus') {
      knockedOut = null;
      sequence = LOCI[locusIndex].sequence;
      editable = sequence.slice(SLICE_START, SLICE_START + SLICE_LEN);
      if (seqInput) seqInput.value = editable;
      clearResults(`Loading ${LOCI[locusIndex].gene}…`);
      void adoptPrecomputed(LOCI[locusIndex].id);
    } else {
      editable = cleanSequence(seqInput?.value ?? '') || editable;
      sequence = editable;
      if (seqInput) seqInput.value = editable;
      clearResults('Free typing — switch to a locus to predict a track.');
    }
    if (knockoutStat) knockoutStat.textContent = '';
    refreshLive();
  }

  seqInput?.addEventListener('input', () => {
    const cleaned = cleanSequence(seqInput.value);
    editable = cleaned;
    if (mode === 'type') {
      sequence = cleaned;
    } else {
      // The box edits a 400 bp slice in place; the window fed to the model stays 16,384 bp, so a
      // shorter or longer edit is padded back from the reference rather than shifting the frame.
      const full = LOCI[locusIndex].sequence;
      const slice = (cleaned + full.slice(SLICE_START + cleaned.length, SLICE_START + SLICE_LEN))
        .slice(0, SLICE_LEN);
      sequence = full.slice(0, SLICE_START) + slice + full.slice(SLICE_START + SLICE_LEN);
    }
    refreshLive();
  });

  modeBtns.forEach((b) =>
    b.addEventListener('click', () => setMode(b.dataset.vpMode === 'locus' ? 'locus' : 'type')),
  );

  locusSelect?.addEventListener('change', () => {
    locusIndex = Number(locusSelect.value);
    setMode('locus');
  });


  // The neuron raster is a canvas painted with tokens read at draw time; SVG panels restyle
  // themselves, but a canvas does not.
  const onTheme = () => {
    renderHeatmap();
    refreshLive();
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
      stageTitle.textContent =
        `${spec.label} · ${spec.positions.toLocaleString()} positions × ` +
        `${spec.channels.toLocaleString()} channels`;
    }

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
          stemProfile: current.stemProfile,
          stageMaps: current.stageMaps,
          attention: current.attention,
          tracks: current.tracks,
        }
      : null;

    const map =
      stageTab === 'attention'
        ? (() => {
            const a = attentionMap(spec as FlowStage, acts);
            return a ? { data: a, channels: 128, positions: 128 } : null;
          })()
        : stageMap(spec as FlowStage, acts);

    const ctx = stageMapCanvas.getContext('2d');
    const cssW = stageMapCanvas.clientWidth || 900;
    // A stage with few channels should use the height, not squeeze into 5 px rows: the output
    // head has four, and they are the most consequential rows on the page.
    const rowH = map ? Math.max(1, Math.min(34, Math.floor(300 / map.channels))) : 3;
    const RULER_H = 30;
    const cssH = map ? map.channels * rowH + 34 + RULER_H : 40;   // + profile strip + genome ruler
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
    // Percentile, not min-max. These tensors are heavy-tailed and a handful of outliers otherwise
    // set the range, flattening every other cell onto the same ink -- measured, the drawn contrast
    // falls tenfold from block 1 to block 7.
    const cellW = cssW / positions;

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
        0, 0, cssW, channels * rowH);
    } else {
      blitMap(ctx, data, channels, positions, scale!, 0, 0, cssW, channels * rowH);
    }

    const peaks: { c: number; v: number }[] = [];
    for (let c = 0; c < channels; c += 1) {
      let m = -Infinity;
      for (let p = 0; p < positions; p += 1) if (data[c * positions + p] > m) m = data[c * positions + p];
      peaks.push({ c, v: m });
    }
    peaks.sort((a, b) => b.v - a.v);
    if (stageTop) {
      stageTop.textContent =
        stageTab === 'attention'
          ? `${positions} × ${positions} over the bottleneck, mean of ${N_HEADS} heads`
          : 'loudest channels: ' + peaks.slice(0, 5).map((q) => `#${q.c} (${q.v.toFixed(2)})`).join(', ');
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
      const x = p * cellW;
      const y = profTop + (1 - (data[ch * positions + p] - chLo) / span) * (profH - 4);
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(`channel #${ch}  ${chLo.toFixed(2)} … ${chHi.toFixed(2)}`, 3, profTop + 9);

    // Name the head's four rows; with 5,215 channels collapsed to four group means, "channel #2"
    // is not a useful label.
    if (perChannel && rowH >= 10) {
      ctx.fillStyle = getComputedStyle(host).getPropertyValue('--color-ink').trim() || '#141414';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      TRACK_GROUPS.forEach((g, i) => {
        ctx.fillText(g.label, 4, i * rowH + rowH / 2 + 3.5);
      });
    }

    // A genome ruler under the raster: without it the x-axis is an index, and you cannot tell
    // which neurons fire over the gene. Positions map to bp through positionToBp, which knows the
    // head's 896 bins start CROP_BP into the window while every other stage spans the whole input.
    if (mode === 'locus') {
      const locus = LOCI[locusIndex];
      const rulerY = cssH - RULER_H;
      const fx = (bp: number) => bpToFraction(spec.id, bp, positions) * cssW;
      const muted = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';
      const rule = getComputedStyle(host).getPropertyValue('--color-rule').trim() || '#e5e7eb';

      ctx.strokeStyle = rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, rulerY + 0.5);
      ctx.lineTo(cssW, rulerY + 0.5);
      ctx.stroke();

      // Annotated ORFs. `features` are in output-bin coordinates, so convert bins -> bp -> x.
      ctx.fillStyle = getComputedStyle(host).getPropertyValue('--vp-orf').trim() || '#6f62a8';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'left';
      for (const f of locus.features) {
        const x0 = fx(binToWindowOffset(f.start));
        const x1 = fx(binToWindowOffset(f.end));
        if (x1 - x0 < 0.5) continue;
        ctx.globalAlpha = f.name === locus.id ? 0.75 : 0.32;
        ctx.fillRect(x0, rulerY + 4, Math.max(x1 - x0, 1), 7);
        if (f.name === locus.id && x1 - x0 > 34) {
          ctx.globalAlpha = 1;
          ctx.fillText(locus.gene, x0 + 2, rulerY + 10.5);
        }
      }
      ctx.globalAlpha = 1;

      // The window the paper's figure prints, where there is one.
      if (locus.figureWindow) {
        const a = fx(locus.figureWindow.seqStart);
        const b = fx(locus.figureWindow.seqEnd);
        ctx.strokeStyle = getComputedStyle(host).getPropertyValue('--vp-orf').trim() || '#6f62a8';
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(a, rulerY + 2, Math.max(b - a, 2), 11);
        ctx.setLineDash([]);
      }

      // bp ticks, labelled with real chromosome coordinates.
      ctx.fillStyle = muted;
      ctx.textAlign = 'center';
      const ticks = 6;
      for (let i = 0; i <= ticks; i += 1) {
        const bp = positionToBp(spec.id, (i / ticks) * positions, positions);
        const x = Math.min(Math.max(fx(bp), 14), cssW - 14);
        ctx.fillRect(x, rulerY + 14, 1, 3);
        const kb = (locus.start + bp) / 1000;
        ctx.fillText(`${kb.toFixed(1)} kb`, x, rulerY + 26);
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
          : '';
      stageNote.textContent =
        stageTab === 'attention'
          ? `Row = query position, column = key position. Each position covers ${bp} bp.`
          : `${drawn}One row per channel, one column per position. ` +
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
  if (seqInput) seqInput.value = editable;
  refreshLive();
  renderTrack();
  renderMotifs();
  renderStageDetail(null);
  renderPicker(true);
  renderHeatmap();
  renderSingleTrack();
  setStatus('Live conv-stem view is running. Load the full model to predict a track.');

  return {
    destroy: () => {
      document.removeEventListener('khc:theme-change', onTheme);
      flow?.destroy();
      flow = null;
      host.dataset.vpReady = 'false';
    },
  };
}

function boot() {
  initVariantPlayground(document);
}
boot();
document.addEventListener('astro:page-load', boot);
