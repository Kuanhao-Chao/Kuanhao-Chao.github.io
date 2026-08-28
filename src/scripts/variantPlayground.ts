/**
 * The Live Variant Playground controller.
 *
 * Two inference paths, kept deliberately distinct because they make different promises:
 *
 *   LIVE  — src/lib/shorkieModel.ts runs the real conv stem in TypeScript on every keystroke.
 *           4,224 weights, a few microseconds, genuinely 60 FPS. Valid on a bare typed sequence
 *           because convolutions are translation-equivariant.
 *   FULL  — the exported ONNX graph (28.7 MB fp16) through onnxruntime-web, debounced. Produces
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
  BASES,
  N_BINS,
  SEQ_LEN,
  SPECIES_S_CEREVISIAE,
  cleanSequence,
  encodeInput,
  filterLogo,
  layerSpecs,
  stemActivations,
  type StemActivation,
  type StemWeights,
} from '../lib/shorkieModel';

const STEM = stemWeightsJson as StemWeights;

interface Locus {
  id: string;
  gene: string;
  blurb: string;
  chrom: string;
  start: number;
  strand: string;
  sequence: string;
  features: { name: string; start: number; end: number; strand: string }[];
}
const LOCI = (lociJson as { loci: Locus[] }).loci;

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
  const speciesInput = $<HTMLInputElement>('[data-vp-species]');
  const speciesLabel = $('[data-vp-species-label]');
  const runBtn = $<HTMLButtonElement>('[data-vp-run]');
  const statusEl = $('[data-vp-status]');
  const neuronCanvas = host.querySelector<HTMLCanvasElement>('[data-vp-neurons]');
  const logoSvg = host.querySelector<SVGSVGElement>('[data-vp-logo]');
  const trackSvg = host.querySelector<SVGSVGElement>('[data-vp-track]');
  const attnSvg = host.querySelector<SVGSVGElement>('[data-vp-attn]');
  const layerList = $('[data-vp-layers]');
  const liveStat = $('[data-vp-livestat]');
  const attnLayer = $<HTMLInputElement>('[data-vp-attn-layer]');

  let mode: 'type' | 'locus' = 'type';
  /** The full 16,384 bp window fed to ONNX. In free-typing mode it is just the typed text. */
  let sequence = 'GGCTATAAAAGGGCATCGATCACGTGACCGGTAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCC';
  /** The slice shown in the box and rastered live -- never the whole window. */
  let editable = sequence;
  const SLICE_START = 7000;
  const SLICE_LEN = 400;
  let locusIndex = 0;
  let species = SPECIES_S_CEREVISIAE;
  let selectedFilter = 0;
  let reference: FullResult | null = null;
  let current: FullResult | null = null;
  let session: unknown = null;
  let ort: typeof import('onnxruntime-web') | null = null;
  let backend = 'not loaded';

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

    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < act.map.length; i += 1) {
      if (act.map[i] < lo) lo = act.map[i];
      if (act.map[i] > hi) hi = act.map[i];
    }
    const span = Math.max(hi - lo, 1e-6);
    const cellW = cssW / Math.max(act.positions, 1);
    const fire = getComputedStyle(host).getPropertyValue('--vp-fire').trim() || '#b0455a';

    ctx.fillStyle = fire;
    for (let f = 0; f < act.filters; f += 1) {
      for (let p = 0; p < act.positions; p += 1) {
        const v = (act.map[f * act.positions + p] - lo) / span;
        if (v < FIRE_FLOOR) continue;
        ctx.globalAlpha = (v - FIRE_FLOOR) / (1 - FIRE_FLOOR);
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
      }
    };
  }

  function renderLogo(act: StemActivation): void {
    if (!logoSvg) return;
    clear(logoSvg);
    const rows = filterLogo(selectedFilter, STEM);
    const W = 300;
    const H = 130;
    attr(logoSvg, { viewBox: `0 0 ${W} ${H}` });
    const colW = W / rows.length;
    const maxAbs = Math.max(...rows.flat().map(Math.abs), 1e-6);
    const mid = H / 2;
    rows.forEach((row, i) => {
      const order = row.map((v, b) => ({ v, b })).sort((a, b) => b.v - a.v);
      let up = mid;
      let down = mid;
      for (const { v, b } of order) {
        const h = (Math.abs(v) / maxAbs) * (H / 2 - 12);
        if (h < 0.5) continue;
        const g = text(i * colW + colW / 2, v > 0 ? up : down + h, BASES[b], `vp-base vp-base-${BASES[b]}`);
        attr(g, { 'font-size': h * 1.9 });
        logoSvg.append(g);
        if (v > 0) up -= h;
        else down += h;
      }
    });
    const axis = el('line');
    attr(axis, { x1: 0, y1: mid, x2: W, y2: mid, stroke: 'var(--color-rule)', 'stroke-width': 1 });
    logoSvg.append(axis);
    logoSvg.append(
      text(2, 12, `filter ${selectedFilter} · peak ${act.peak[selectedFilter].toFixed(2)}`, 'vp-ax', 'start'),
    );
  }

  function refreshLive(): void {
    const t0 = performance.now();
    const act = stemActivations(editable, STEM);
    const tCompute = performance.now() - t0;
    renderNeurons(act);
    renderLogo(act);
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
    for (let i = 0; i < n; i += 1) vals[i] = current.tracks[i * 4]; // RNA-seq (TF perturbation)
    const max = Math.max(...vals, 1e-6);
    const bw = W / n;

    const locus = LOCI[locusIndex];
    for (const f of locus.features) {
      const r = el('rect');
      attr(r, {
        x: f.start * bw, y: H - 18, width: Math.max((f.end - f.start) * bw, 1), height: 10,
        fill: 'var(--vp-orf)', 'fill-opacity': 0.55,
      });
      trackSvg.append(r);
    }

    let d = `M0 ${H - 26}`;
    for (let i = 0; i < n; i += 1) d += ` L${(i * bw).toFixed(2)} ${(H - 26 - (vals[i] / max) * (H - 46)).toFixed(2)}`;
    const path = el('path');
    attr(path, { d, fill: 'none', stroke: 'var(--vp-track)', 'stroke-width': 1.4 });
    trackSvg.append(path);

    if (reference && reference !== current) {
      let rd = `M0 ${H - 26}`;
      for (let i = 0; i < n; i += 1) {
        rd += ` L${(i * bw).toFixed(2)} ${(H - 26 - (reference.tracks[i * 4] / max) * (H - 46)).toFixed(2)}`;
      }
      const rp = el('path');
      attr(rp, { d: rd, fill: 'none', stroke: 'var(--color-muted)', 'stroke-width': 1, 'stroke-dasharray': '3 3' });
      trackSvg.insertBefore(rp, path);
    }
    let argmax = 0;
    for (let i = 1; i < n; i += 1) if (vals[i] > vals[argmax]) argmax = i;
    trackSvg.append(
      text(4, 14, `predicted RNA-seq · 896 bins × 16 bp · peak ${max.toFixed(2)} at bin ${argmax}`, 'vp-ax', 'start'),
    );
    trackSvg.dataset.peak = max.toFixed(4);
    trackSvg.dataset.argmax = String(argmax);
  }

  function renderAttention(): void {
    if (!attnSvg) return;
    clear(attnSvg);
    const S = 220;
    attr(attnSvg, { viewBox: `0 0 ${S} ${S}` });
    if (!current) {
      attnSvg.append(text(S / 2, S / 2, 'no inference yet', 'vp-ax'));
      return;
    }
    const layer = Number(attnLayer?.value ?? 0);
    const T = 128;
    const off = layer * T * T;
    let max = 1e-6;
    for (let i = 0; i < T * T; i += 1) max = Math.max(max, current.attention[off + i]);
    const c = S / T;
    for (let i = 0; i < T; i += 1) {
      for (let j = 0; j < T; j += 1) {
        const v = current.attention[off + i * T + j] / max;
        if (v < 0.08) continue;
        const r = el('rect');
        attr(r, { x: j * c, y: i * c, width: c, height: c, fill: 'var(--vp-accent)', 'fill-opacity': v.toFixed(3) });
        attnSvg.append(r);
      }
    }
  }

  // ---------------------------------------------------------------- ONNX
  async function ensureSession(): Promise<boolean> {
    if (session) return true;
    setStatus('Loading ONNX Runtime…');
    ort = await import('onnxruntime-web');
    ort.env.wasm.wasmPaths = '/ort/';
    ort.env.wasm.numThreads = 1; // no cross-origin isolation on GitHub Pages, so no SharedArrayBuffer
    setStatus('Downloading Shorkie (28.7 MB)…');
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
      const input = encodeInput(LOCI[locusIndex].sequence, species);
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
        backend,
        ms,
      };
      if (!reference) reference = current;
      renderTrack();
      renderAttention();
      setStatus(`Done — ${ms.toFixed(0)} ms on ${current.backend}.`);
    } catch (err) {
      setStatus(`Inference failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (runBtn) runBtn.disabled = false;
    }
  }

  function setStatus(msg: string): void {
    if (statusEl) statusEl.textContent = msg;
  }

  // ---------------------------------------------------------------- wiring
  function setMode(next: 'type' | 'locus'): void {
    mode = next;
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vpMode === next)));
    host.dataset.vpActiveMode = next;
    if (next === 'locus') {
      sequence = LOCI[locusIndex].sequence;
      editable = sequence.slice(SLICE_START, SLICE_START + SLICE_LEN);
      reference = null;
      current = null;
      renderTrack();
      renderAttention();
      if (seqInput) seqInput.value = editable;
    } else {
      editable = cleanSequence(seqInput?.value ?? '') || editable;
      sequence = editable;
      if (seqInput) seqInput.value = editable;
    }
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

  speciesInput?.addEventListener('input', () => {
    species = Number(speciesInput.value);
    if (speciesLabel) {
      speciesLabel.textContent =
        species === SPECIES_S_CEREVISIAE ? `${species} — S. cerevisiae` : `${species} — related fungus`;
    }
  });

  attnLayer?.addEventListener('input', renderAttention);
  runBtn?.addEventListener('click', () => void runFull());

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
  renderAttention();
  setStatus('Live conv-stem view is running. Load the full model to predict a track.');

  return { destroy: () => { host.dataset.vpReady = 'false'; } };
}

function boot() {
  initVariantPlayground(document);
}
boot();
document.addEventListener('astro:page-load', boot);
