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
import {
  BASES,
  N_BINS,
  TRACK_GROUPS,
  RNA_SEQ_GROUP,
  pearson,
  activationInk,
  percentileRange,
  subLayers,
  knockoutMotif,
  geneBodyBins,
  trackGroupOf,
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
  stemPeak: Float32Array;     // [96]
  blockPeaks: Float32Array;   // [1536]
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
  const heatCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-heat]');
  const heatStat = $('[data-vp-heat-stat]');
  const trackNameEl = $('[data-vp-track-name]');
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
  // ARG80_T0_S757 -- a real T0 baseline experiment, which is the set Figure 4's ISM uses,
  // rather than a mean over all 3,053 induction tracks.
  let selectedTrack: number = TRACK_GROUPS[RNA_SEQ_GROUP].start;
  let useLogAxis = true;
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

    // Percentile, matching the layer detail and this panel's own caption.
    const { lo, hi } = percentileRange(act.map);
    const cellW = cssW / Math.max(act.positions, 1);
    const fire = getComputedStyle(host).getPropertyValue('--vp-fire').trim() || '#b0455a';

    ctx.fillStyle = fire;
    for (let f = 0; f < act.filters; f += 1) {
      for (let p = 0; p < act.positions; p += 1) {
        const ink = activationInk(act.map[f * act.positions + p], lo, hi, FIRE_FLOOR);
        if (ink === 0) continue;
        ctx.globalAlpha = ink;
        ctx.fillRect(p * cellW, f * rowH, Math.max(cellW, 0.7), rowH - 0.4);
      }
    }
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
    if (!current) {
      trackSvg.append(text(W / 2, H / 2, 'Run the model to see the predicted track', 'vp-ax'));
      return;
    }
    const n = N_BINS;
    const vals = new Float32Array(n);
    for (let i = 0; i < n; i += 1) vals[i] = current.tracks[i * 4 + groupIndex];
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

    if (reference && reference !== current) {
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
        + ` at bin ${argmax} · ${useLogAxis ? 'log' : 'linear'} axis`,
        'vp-ax', 'start'),
    );
  }

  async function ensureSession(): Promise<boolean> {
    if (session) return true;
    setStatus('Loading ONNX Runtime…');
    ort = await import('onnxruntime-web');
    ort.env.wasm.wasmPaths = '/ort/';
    ort.env.wasm.numThreads = 1; // no cross-origin isolation on GitHub Pages, so no SharedArrayBuffer
    setStatus('Downloading Shorkie (28.6 MB)…');
    // Try WebGPU first, then fall back -- and record which one actually initialised. Reporting
    // "WebGPU or maybe WASM" would be a guess, and the whole point of the readout is the real
    // number attached to the real backend.
    if ('gpu' in navigator) {
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
    if (runBtn) runBtn.disabled = true;
    try {
      await ensureSession();
      setStatus('Running inference…');
      const t0 = performance.now();
      // `sequence` -- not the locus -- because a motif knockout edits it in place, and reading
      // the locus here would silently run the unmodified window and report no effect.
      const input = encodeInput(sequence, SPECIES_S_CEREVISIAE);
      const o = ort as NonNullable<typeof ort>;
      const feeds = { sequence: new o.Tensor('float32', input, [1, SEQ_LEN, 170]) };
      const out = await (session as { run: (f: unknown) => Promise<Record<string, { data: Float32Array }>> }).run(feeds);
      const ms = performance.now() - t0;
      current = {
        tracks: out.tracks.data,
        stemProfile: out.stem_profile.data,
        stemPeak: out.stem_peak.data,
        blockPeaks: out.block_peaks.data,
        attention: out.attention.data,
        stageMaps: out.stage_maps.data,
        allTracks: out.all_tracks.data,
        backend,
        ms,
      };
      if (!reference) reference = current;
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
      setStatus(`Done — ${ms.toFixed(0)} ms on ${current.backend}.`);
    } catch (err) {
      setStatus(`Inference failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (runBtn) runBtn.disabled = false;
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
      ctx.fillText('Run the model to see all 5,215 predicted tracks.', 4, 22);
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
    const group = trackGroupOf(selectedTrack);
    if (trackNameEl) {
      trackNameEl.textContent =
        `track ${selectedTrack.toLocaleString()} · ${TRACK_NAMES[selectedTrack]} · ${group.label}`;
    }
    if (!current) {
      singleSvg.append(text(W / 2, H / 2, 'no inference yet', 'vp-ax'));
      return;
    }
    const vals = new Float32Array(N_BINS);
    for (let b = 0; b < N_BINS; b += 1) vals[b] = current.allTracks[b * N_TRACKS + selectedTrack];
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
        `${TRACK_NAMES[selectedTrack]} · peak ${max.toFixed(2)} at bin ${argmax}`
        + ` · ${useLogAxis ? 'log' : 'linear'} axis`,
        'vp-ax', 'start'),
    );
    singleSvg.dataset.peak = String(max);
    singleSvg.dataset.track = TRACK_NAMES[selectedTrack];
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
      reference = null;
      current = null;
      renderTrack();
      if (seqInput) seqInput.value = editable;
    } else {
      editable = cleanSequence(seqInput?.value ?? '') || editable;
      sequence = editable;
      if (seqInput) seqInput.value = editable;
    }
    if (knockoutStat) knockoutStat.textContent = '';
    renderMotifs();
    renderHeatmap();
    renderSingleTrack();
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
    const rowH = map ? Math.max(1, Math.min(5, Math.floor(300 / map.channels))) : 3;
    const cssH = map ? map.channels * rowH + 34 : 40;   // + the single-channel profile strip
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
      ctx.fillText('Run the model to fill this layer with its activations.', 4, 22);
      if (stageTop) stageTop.textContent = '';
      if (stageNote) stageNote.textContent = '';
      return;
    }

    const { data, channels, positions } = map;
    // Percentile, not min-max. These tensors are heavy-tailed and a handful of outliers otherwise
    // set the range, flattening every other cell onto the same ink -- measured, the drawn contrast
    // falls tenfold from block 1 to block 7.
    const { lo, hi } = percentileRange(data);
    const cellW = cssW / positions;
    ctx.fillStyle = getComputedStyle(host).getPropertyValue('--vp-fire').trim() || '#b0455a';
    for (let c = 0; c < channels; c += 1) {
      for (let p = 0; p < positions; p += 1) {
        const inkV = activationInk(data[c * positions + p], lo, hi, FIRE_FLOOR);
        if (inkV === 0) continue;
        ctx.globalAlpha = inkV;
        ctx.fillRect(p * cellW, c * rowH, Math.max(cellW, 0.7), Math.max(rowH - 0.3, 0.7));
      }
    }
    ctx.globalAlpha = 1;

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
    const span = Math.max(chHi - chLo, 1e-9);
    ctx.strokeStyle = getComputedStyle(host).getPropertyValue('--vp-accent').trim() || '#3976a8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let p = 0; p < positions; p += 1) {
      const x = p * cellW;
      const y = cssH - profH + (1 - (data[ch * positions + p] - chLo) / span) * (profH - 4);
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = getComputedStyle(host).getPropertyValue('--color-muted').trim() || '#6b7280';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(`channel #${ch}  ${chLo.toFixed(2)} … ${chHi.toFixed(2)}`, 3, cssH - profH + 9);

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
          : `${drawn}One row per channel, one column per position; ink is the activation between ` +
            `its 1st and 99th percentile. Each column covers ${bp} bp of input. The line below is ` +
            `channel #${ch} alone — click a row in the conv-stem raster to change it.`;
    }
  }

  // ---------------------------------------------------------------- the flow canvas
  if (flowCanvas) {
    flow = createFlow(flowCanvas, host);
    flow.onChange((t, stage, isPlaying) => {
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
