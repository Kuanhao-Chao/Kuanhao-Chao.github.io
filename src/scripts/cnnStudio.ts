/**
 * CNN Interactive Studio Client Controller
 *
 * Drives the interactive 2D sliding kernel visualization, X-Ray dot product inspector,
 * heat-mapped editable weight matrix, playback engine, 1D biological motif scanner,
 * real-time hyperparameter & FLOP/MAC calculators, receptive field ladder, and
 * live PyTorch snippet generator.
 */

import {
  calculateConvFlops,
  calculateConvOutputDim,
  calculateConvParams,
  calculateReceptiveField,
  convolve1D,
  convolve2D,
  generatePyTorchSnippet,
  getPresetKernels,
  getPresetMotifs,
  type Convolve2DStep,
  type PresetKernel,
  type PresetMotif,
  type ReceptiveFieldStep,
} from '../lib/cnnCore';

declare global {
  interface Window {
    __cnnStudioInitialized?: boolean;
    __activeCnnStudio?: CnnStudioController | null;
  }
}

export interface CnnStudioState {
  mode: '2d' | '1d';
  // 2D Hyperparameters
  inH: number;
  inW: number;
  kernelSize: number;
  stride: number;
  padding: number;
  dilation: number;
  inChannels: number;
  outChannels: number;
  groups: number;
  isDepthwise: boolean;
  hasBias: boolean;
  biasVal: number;

  // Grids
  inputMatrix: number[][];
  kernelMatrix: number[][];
  activePreset: string;
  currentStepIdx: number;

  // Playback
  isPlaying: boolean;
  playbackSpeed: number; // ms

  // 1D Sequence Scanner
  sequence: string;
  activeMotifKey: string;
  seqStride: number;
  seqStepIdx: number;
  seqIsPlaying: boolean;
  seqSpeed: number;

  // Receptive Field Ladder
  rfLayers: Array<{ kernel: number; stride: number; dilation: number }>;
}

export interface CnnStudioController {
  getState: () => CnnStudioState;
  stepForward: () => void;
  stepBackward: () => void;
  reset: () => void;
  play: () => void;
  pause: () => void;
  setMode: (mode: '2d' | '1d') => void;
  setKernelPreset: (presetKey: string) => void;
  destroy: () => void;
}

/**
 * Creates default sample 2D input matrix with a structured spatial pattern.
 */
export function createDefaultInput(h: number, w: number): number[][] {
  const mat: number[][] = [];
  const midH = Math.floor(h / 2);
  const midW = Math.floor(w / 2);

  for (let r = 0; r < h; r++) {
    const row: number[] = [];
    for (let c = 0; c < w; c++) {
      if (r === midH && c === midW) {
        row.push(4);
      } else if (r === midH || c === midW) {
        row.push(3);
      } else if (Math.abs(r - midH) <= 1 && Math.abs(c - midW) <= 1) {
        row.push(2);
      } else {
        row.push((r + c) % 2 === 0 ? 1 : 0);
      }
    }
    mat.push(row);
  }
  return mat;
}

/**
 * Resizes a 2D matrix while preserving existing entries.
 */
export function resizeMatrix(oldMat: number[][], newH: number, newW: number, defaultVal = 0): number[][] {
  const result: number[][] = [];
  for (let r = 0; r < newH; r++) {
    const row: number[] = [];
    for (let c = 0; c < newW; c++) {
      if (r < oldMat.length && c < (oldMat[r]?.length ?? 0)) {
        row.push(oldMat[r][c]);
      } else {
        row.push(defaultVal);
      }
    }
    result.push(row);
  }
  return result;
}

/**
 * Injects required stylesheet rules for the interactive grids and animations if not already present.
 */
function injectStyles(): void {
  if (typeof document === 'undefined') return;
  const styleId = 'cnn-studio-injected-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .cnn-cell {
      aspect-ratio: 1 / 1;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 0.85rem;
      font-weight: 500;
      border-radius: 6px;
      border: 1px solid var(--color-rule, #e5e4df);
      transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
      user-select: none;
      background: var(--color-surface, #ffffff);
      color: var(--color-ink, #141414);
      min-width: 0;
      min-height: 0;
    }
    .cnn-cell:hover {
      filter: brightness(0.96);
      transform: scale(1.02);
    }
    .cnn-cell-pad {
      border-style: dashed;
      opacity: 0.6;
      color: var(--color-muted, #6b6b6b);
      background: rgba(0, 0, 0, 0.02);
    }
    :root[data-theme='dark'] .cnn-cell-pad {
      background: rgba(255, 255, 255, 0.02);
    }
    .cnn-cell-window-gap {
      outline: 2px dashed rgba(99, 102, 241, 0.45);
      outline-offset: -1px;
      background: rgba(99, 102, 241, 0.08) !important;
    }
    .cnn-cell-sample {
      outline: 2px solid #6366f1 !important;
      outline-offset: -1px;
      background: rgba(99, 102, 241, 0.22) !important;
      font-weight: 700 !important;
      box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
      z-index: 2;
    }
    .cnn-cell-active {
      outline: 2px solid #10b981 !important;
      outline-offset: -1px;
      background: rgba(16, 185, 129, 0.25) !important;
      font-weight: 700 !important;
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
      z-index: 2;
    }
    .cnn-badge-idx {
      position: absolute;
      top: 1px;
      left: 2px;
      font-size: 0.62rem;
      font-weight: 700;
      color: #6366f1;
      line-height: 1;
      pointer-events: none;
    }
    .cnn-term-chip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 0.78rem;
      background: rgba(99, 102, 241, 0.12);
      border: 1px solid rgba(99, 102, 241, 0.25);
    }
    .cnn-seq-nuc {
      width: 28px;
      height: 38px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      font-family: var(--font-mono, monospace);
      font-weight: 700;
      font-size: 0.95rem;
      cursor: pointer;
      transition: all 0.15s ease;
      position: relative;
    }
    .cnn-seq-nuc:hover {
      transform: translateY(-2px);
    }
    .cnn-seq-nuc.in-window {
      outline: 2px solid #6366f1;
      outline-offset: -1px;
      box-shadow: 0 0 8px rgba(99, 102, 241, 0.45);
      z-index: 2;
    }
    .cnn-bar-hit {
      fill: #10b981 !important;
      filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.5));
    }
    .cnn-bar-active {
      stroke: #6366f1 !important;
      stroke-width: 2px !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Initializes the CNN Interactive Studio.
 */
export function initCnnStudio(root?: ParentNode): CnnStudioController | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const searchRoot = root ?? document;
  const container = searchRoot.querySelector<HTMLElement>('[data-cnn-studio], #cnn-studio-root');
  if (!container) return null;

  if (container.dataset.cnnStudioReady === 'true') {
    return window.__activeCnnStudio ?? null;
  }
  container.dataset.cnnStudioReady = 'true';
  window.__cnnStudioInitialized = true;

  injectStyles();

  // Presets
  const presetKernels: Record<string, PresetKernel> = getPresetKernels();
  const presetMotifs: Record<string, PresetMotif> = getPresetMotifs();

  // Initial State
  const state: CnnStudioState = {
    mode: '2d',
    inH: 5,
    inW: 5,
    kernelSize: 3,
    stride: 1,
    padding: 1,
    dilation: 1,
    inChannels: 3,
    outChannels: 16,
    groups: 1,
    isDepthwise: false,
    hasBias: true,
    biasVal: 0,

    inputMatrix: createDefaultInput(5, 5),
    kernelMatrix: presetKernels.sobelHorizontal.kernel.map((row) => [...row]),
    activePreset: 'sobelHorizontal',
    currentStepIdx: 0,

    isPlaying: false,
    playbackSpeed: 500,

    sequence: 'CCGCTATAAAAGGAGCGGCTA',
    activeMotifKey: 'tataBox',
    seqStride: 1,
    seqStepIdx: 0,
    seqIsPlaying: false,
    seqSpeed: 600,

    rfLayers: [
      { kernel: 3, stride: 1, dilation: 1 },
      { kernel: 3, stride: 1, dilation: 1 },
      { kernel: 3, stride: 1, dilation: 1 },
    ],
  };

  // Timers
  let playbackTimerId: number | null = null;
  let seqPlaybackTimerId: number | null = null;

  // DOM Elements: Mode Tabs
  const mode2dTab = container.querySelector<HTMLElement>('[data-cnn-tab="2d"], [data-cnn-mode-2d]');
  const mode1dTab = container.querySelector<HTMLElement>('[data-cnn-tab="1d"], [data-cnn-mode-1d]');
  const panel2d = container.querySelector<HTMLElement>('[data-cnn-panel="2d"]');
  const panel1d = container.querySelector<HTMLElement>('[data-cnn-panel="1d"]');

  // DOM Elements: 2D Visualizer
  const inputGridEl = container.querySelector<HTMLElement>('[data-cnn-input-grid]');
  const kernelGridEl = container.querySelector<HTMLElement>('[data-cnn-kernel-grid]');
  const outputGridEl = container.querySelector<HTMLElement>('[data-cnn-output-grid]');
  const inspectorEl = container.querySelector<HTMLElement>('[data-cnn-inspector], [data-cnn-xray]');
  const stepInfoEl = container.querySelector<HTMLElement>('[data-cnn-step-info], [data-cnn-step-counter]');

  // DOM Elements: Playback Controls
  const playBtn = container.querySelector<HTMLButtonElement>('[data-cnn-play]');
  const prevBtn = container.querySelector<HTMLButtonElement>('[data-cnn-step-prev]');
  const nextBtn = container.querySelector<HTMLButtonElement>('[data-cnn-step-next]');
  const resetBtn = container.querySelector<HTMLButtonElement>('[data-cnn-reset]');
  const speedSelect = container.querySelector<HTMLSelectElement>('[data-cnn-speed]');

  // DOM Elements: Hyperparameter Inputs
  const inSizeInput = container.querySelector<HTMLInputElement>('[data-cnn-in-size]');
  const inSizeReadout = container.querySelector<HTMLElement>('[data-cnn-in-size-val]');
  const kernelSizeSelect = container.querySelector<HTMLSelectElement | HTMLInputElement>('[data-cnn-kernel-size]');
  const strideSelect = container.querySelector<HTMLSelectElement | HTMLInputElement>('[data-cnn-stride]');
  const paddingSelect = container.querySelector<HTMLSelectElement | HTMLInputElement>('[data-cnn-padding]');
  const padModeBtns = container.querySelectorAll<HTMLButtonElement>('[data-cnn-pad-mode]');
  const dilationSelect = container.querySelector<HTMLSelectElement | HTMLInputElement>('[data-cnn-dilation]');
  const inChannelsInput = container.querySelector<HTMLInputElement>('[data-cnn-in-channels]');
  const outChannelsInput = container.querySelector<HTMLInputElement>('[data-cnn-out-channels]');
  const groupsInput = container.querySelector<HTMLInputElement>('[data-cnn-groups]');
  const depthwiseToggle = container.querySelector<HTMLInputElement>('[data-cnn-depthwise]');
  const biasToggle = container.querySelector<HTMLInputElement>('[data-cnn-bias-toggle]');
  const biasValInput = container.querySelector<HTMLInputElement>('[data-cnn-bias-val]');
  const presetSelect = container.querySelector<HTMLSelectElement>('[data-cnn-kernel-preset]');
  const presetBtns = container.querySelectorAll<HTMLButtonElement>('[data-cnn-preset-kernel]');

  // DOM Elements: Stat Readouts
  const outDimEl = container.querySelector<HTMLElement>('[data-cnn-out-dim]');
  const paramCountEl = container.querySelector<HTMLElement>('[data-cnn-param-count]');
  const flopsEl = container.querySelector<HTMLElement>('[data-cnn-flops]');
  const memoryEl = container.querySelector<HTMLElement>('[data-cnn-memory]');

  // DOM Elements: PyTorch Code
  const pytorchCodeEl = container.querySelector<HTMLElement>('[data-cnn-pytorch-code]');
  const copyPytorchBtn = container.querySelector<HTMLButtonElement>('[data-cnn-copy-pytorch]');

  // DOM Elements: 1D Motif Scanner
  const motifSelect = container.querySelector<HTMLSelectElement>('[data-cnn-motif-select]');
  const seqInput = container.querySelector<HTMLInputElement>('[data-cnn-seq-input]');
  const seqStrideSelect = container.querySelector<HTMLSelectElement>('[data-cnn-seq-stride]');
  const seqTrackEl = container.querySelector<HTMLElement>('[data-cnn-seq-track]');
  const scoreChartEl = container.querySelector<HTMLElement>('[data-cnn-score-chart]');
  const matchSummaryEl = container.querySelector<HTMLElement>('[data-cnn-match-summary]');
  const seqStepInfoEl = container.querySelector<HTMLElement>('[data-cnn-seq-step-info]');
  const seqXrayEl = container.querySelector<HTMLElement>('[data-cnn-seq-xray]');
  const seqPlayBtn = container.querySelector<HTMLButtonElement>('[data-cnn-seq-play]');
  const seqPrevBtn = container.querySelector<HTMLButtonElement>('[data-cnn-seq-prev]');
  const seqNextBtn = container.querySelector<HTMLButtonElement>('[data-cnn-seq-next]');
  const seqResetBtn = container.querySelector<HTMLButtonElement>('[data-cnn-seq-reset]');

  // DOM Elements: Receptive Field Ladder
  const rfLadderEl = container.querySelector<HTMLElement>('[data-cnn-rf-ladder]');
  const vggCalloutEl = container.querySelector<HTMLElement>('[data-cnn-vgg-callout]');
  const rfAddLayerBtn = container.querySelector<HTMLButtonElement>('[data-cnn-rf-add-layer]');
  const rfResetBtn = container.querySelector<HTMLButtonElement>('[data-cnn-rf-reset]');

  // DOM Elements: Accordions
  const accordionTriggers = container.querySelectorAll<HTMLElement>('[data-cnn-accordion-trigger]');

  // --------------------------------------------------------------------------
  // Core Compute & State Helpers
  // --------------------------------------------------------------------------

  function getEffectiveGroups(): number {
    if (state.isDepthwise) return state.inChannels;
    const g = Math.max(1, state.groups);
    return Math.min(g, state.inChannels);
  }

  function getConvResult() {
    return convolve2D(
      state.inputMatrix,
      state.kernelMatrix,
      state.stride,
      state.padding,
      state.dilation,
      state.hasBias ? state.biasVal : 0
    );
  }

  // --------------------------------------------------------------------------
  // Renderers: 2D Visualizer
  // --------------------------------------------------------------------------

  function render2DVisualizer(): void {
    const { output, steps } = getConvResult();

    // Guard step index
    if (steps.length === 0) {
      state.currentStepIdx = 0;
    } else {
      if (state.currentStepIdx >= steps.length) state.currentStepIdx = steps.length - 1;
      if (state.currentStepIdx < 0) state.currentStepIdx = 0;
    }

    const currentStep: Convolve2DStep | undefined = steps[state.currentStepIdx];

    // Render Padded Input Grid
    if (inputGridEl) {
      inputGridEl.innerHTML = '';
      const paddedH = state.inH + 2 * state.padding;
      const paddedW = state.inW + 2 * state.padding;

      inputGridEl.style.display = 'grid';
      inputGridEl.style.gridTemplateColumns = `repeat(${paddedW}, minmax(0, 1fr))`;
      inputGridEl.style.gap = '4px';

      // Receptive field bounding box
      let minR = -1;
      let maxR = -1;
      let minC = -1;
      let maxC = -1;
      const sampleMap = new Map<string, number>();

      if (currentStep) {
        minR = currentStep.outR * state.stride;
        maxR = minR + (state.kernelSize - 1) * state.dilation;
        minC = currentStep.outC * state.stride;
        maxC = minC + (state.kernelSize - 1) * state.dilation;

        currentStep.inWindow.forEach((pt, idx) => {
          sampleMap.set(`${pt.r},${pt.c}`, idx);
        });
      }

      for (let pr = 0; pr < paddedH; pr++) {
        for (let pc = 0; pc < paddedW; pc++) {
          const isPad =
            pr < state.padding ||
            pr >= state.padding + state.inH ||
            pc < state.padding ||
            pc >= state.padding + state.inW;

          const val = isPad ? 0 : (state.inputMatrix[pr - state.padding]?.[pc - state.padding] ?? 0);
          const inWindow = currentStep && pr >= minR && pr <= maxR && pc >= minC && pc <= maxC;
          const sampleIdx = sampleMap.get(`${pr},${pc}`);
          const isSample = sampleIdx !== undefined;

          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'cnn-cell';

          if (isPad) {
            cell.classList.add('cnn-cell-pad');
            cell.title = `Padding Cell (0)`;
            cell.textContent = '0';
          } else {
            const inR = pr - state.padding;
            const inC = pc - state.padding;
            cell.title = `Input [${inR}, ${inC}] = ${val} (Click to cycle 0→1→2→3→4→0)`;
            cell.textContent = String(val);

            cell.addEventListener('click', (e) => {
              e.preventDefault();
              state.inputMatrix[inR][inC] = (state.inputMatrix[inR][inC] + 1) % 5;
              recomputeAndRender();
            });
          }

          if (isSample) {
            cell.classList.add('cnn-cell-sample');
            const badge = document.createElement('span');
            badge.className = 'cnn-badge-idx';
            badge.textContent = `#${sampleIdx + 1}`;
            cell.appendChild(badge);
          } else if (inWindow) {
            cell.classList.add('cnn-cell-window-gap');
            cell.title += ' — Dilation gap (skipped sampling position)';
          }

          inputGridEl.appendChild(cell);
        }
      }
    }

    // Render Kernel Grid
    if (kernelGridEl) {
      kernelGridEl.innerHTML = '';
      kernelGridEl.style.display = 'grid';
      kernelGridEl.style.gridTemplateColumns = `repeat(${state.kernelSize}, minmax(0, 1fr))`;
      kernelGridEl.style.gap = '4px';

      // Find max weight for normalization
      let maxK = 1;
      for (const row of state.kernelMatrix) {
        for (const v of row) {
          if (Math.abs(v) > maxK) maxK = Math.abs(v);
        }
      }

      for (let kr = 0; kr < state.kernelSize; kr++) {
        for (let kc = 0; kc < state.kernelSize; kc++) {
          const val = state.kernelMatrix[kr]?.[kc] ?? 0;
          const idx = kr * state.kernelSize + kc;

          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'cnn-cell';
          cell.title = `Weight W[${kr}, ${kc}] = ${val} (Click to edit weight)`;

          // Color heat-map
          if (val > 0) {
            const alpha = 0.15 + 0.35 * Math.min(1, Math.abs(val) / maxK);
            cell.style.background = `rgba(59, 130, 246, ${alpha})`;
            cell.style.borderColor = 'rgba(59, 130, 246, 0.4)';
          } else if (val < 0) {
            const alpha = 0.15 + 0.35 * Math.min(1, Math.abs(val) / maxK);
            cell.style.background = `rgba(239, 68, 68, ${alpha})`;
            cell.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          }

          const badge = document.createElement('span');
          badge.className = 'cnn-badge-idx';
          badge.textContent = `#${idx + 1}`;
          cell.appendChild(badge);

          const textSpan = document.createElement('span');
          textSpan.textContent = Number.isInteger(val) ? String(val) : val.toFixed(2);
          cell.appendChild(textSpan);

          // Allow user to click to edit weight
          cell.addEventListener('click', (e) => {
            e.preventDefault();
            const inputVal = window.prompt(
              `Enter new weight for W[${kr}, ${kc}] (currently ${val}):`,
              String(val)
            );
            if (inputVal !== null) {
              const parsed = parseFloat(inputVal.trim());
              if (!isNaN(parsed)) {
                state.kernelMatrix[kr][kc] = parsed;
                state.activePreset = 'custom';
                updatePresetUI();
                recomputeAndRender();
              }
            }
          });

          kernelGridEl.appendChild(cell);
        }
      }
    }

    // Render Output Feature Map
    if (outputGridEl) {
      outputGridEl.innerHTML = '';
      const outH = output.length;
      const outW = output[0]?.length ?? 0;

      if (outH === 0 || outW === 0) {
        outputGridEl.innerHTML = `<div style="grid-column: 1 / -1; padding: 1rem; text-align: center; color: var(--color-muted); font-size: 0.85rem;">Output spatial dimensions are 0 with current parameters.</div>`;
      } else {
        outputGridEl.style.display = 'grid';
        outputGridEl.style.gridTemplateColumns = `repeat(${outW}, minmax(0, 1fr))`;
        outputGridEl.style.gap = '4px';

        for (let outR = 0; outR < outH; outR++) {
          for (let outC = 0; outC < outW; outC++) {
            const val = output[outR][outC];
            const isActive = currentStep && currentStep.outR === outR && currentStep.outC === outC;

            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'cnn-cell';
            if (isActive) cell.classList.add('cnn-cell-active');
            cell.title = `Output Y[${outR}, ${outC}] = ${val} (Click to jump to this step)`;
            cell.textContent = Number.isInteger(val) ? String(val) : val.toFixed(2);

            cell.addEventListener('click', (e) => {
              e.preventDefault();
              const targetIdx = steps.findIndex((s) => s.outR === outR && s.outC === outC);
              if (targetIdx !== -1) {
                state.currentStepIdx = targetIdx;
                pausePlayback();
                render2DVisualizer();
              }
            });

            outputGridEl.appendChild(cell);
          }
        }
      }
    }

    // Render "X-Ray" Dot Product Inspector
    if (inspectorEl) {
      if (!currentStep) {
        inspectorEl.innerHTML = `<div style="color: var(--color-muted); font-size: 0.85rem;">No active convolution step. Ensure output dimensions are greater than 0.</div>`;
      } else {
        const termsHtml = currentStep.multiplications
          .map((m, i) => {
            const kStr = Number.isInteger(m.kVal) ? String(m.kVal) : m.kVal.toFixed(2);
            const inStr = Number.isInteger(m.inVal) ? String(m.inVal) : m.inVal.toFixed(2);
            return `<span class="cnn-term-chip" title="Weight #${i + 1}"><span style="color:#6366f1;font-weight:700;">#${i + 1}</span> (${inStr} × ${kStr})</span>`;
          })
          .join(' + ');

        const sumStr = Number.isInteger(currentStep.sum) ? String(currentStep.sum) : currentStep.sum.toFixed(2);
        const biasStr = state.hasBias
          ? ` + ${state.biasVal >= 0 ? state.biasVal : `(${state.biasVal})`} (bias)`
          : '';
        const finalStr = Number.isInteger(currentStep.finalVal)
          ? String(currentStep.finalVal)
          : currentStep.finalVal.toFixed(2);

        inspectorEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.85rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-rule); padding-bottom: 0.35rem;">
              <span style="font-weight: 600; color: var(--color-ink);">
                Active Cell: <code style="color: #10b981; font-weight: 700;">Output[${currentStep.outR}, ${currentStep.outC}]</code>
              </span>
              <span style="color: var(--color-muted); font-size: 0.75rem;">
                Step ${state.currentStepIdx + 1} of ${steps.length}
              </span>
            </div>
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px; line-height: 1.6;">
              <span style="font-weight: 600; color: var(--color-muted);">Terms:</span>
              ${termsHtml}
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.03); padding: 0.4rem 0.6rem; border-radius: 6px;">
              <span style="font-family: var(--font-mono); color: var(--color-ink);">
                Σ = ${sumStr}${biasStr} =
              </span>
              <span style="font-family: var(--font-mono); font-size: 1.1rem; font-weight: 700; color: #10b981;">
                ${finalStr}
              </span>
            </div>
          </div>
        `;
      }
    }

    // Step Info
    if (stepInfoEl) {
      if (currentStep) {
        stepInfoEl.textContent = `Step ${state.currentStepIdx + 1} / ${steps.length} (Row ${currentStep.outR}, Col ${currentStep.outC})`;
      } else {
        stepInfoEl.textContent = `Step 0 / 0`;
      }
    }

    // Play button state
    if (playBtn) {
      playBtn.innerHTML = state.isPlaying
        ? '<span aria-hidden="true">⏸</span> Pause'
        : '<span aria-hidden="true">▶</span> Play';
      playBtn.setAttribute('aria-label', state.isPlaying ? 'Pause Convolution' : 'Play Convolution');
    }
  }

  // --------------------------------------------------------------------------
  // Renderers: Hyperparameters & Stat Readouts
  // --------------------------------------------------------------------------

  function renderStats(): void {
    const groups = getEffectiveGroups();

    // Dimensions
    const outH = calculateConvOutputDim(
      state.inH,
      state.kernelSize,
      state.stride,
      state.padding,
      state.dilation
    );
    const outW = calculateConvOutputDim(
      state.inW,
      state.kernelSize,
      state.stride,
      state.padding,
      state.dilation
    );

    if (outDimEl) {
      outDimEl.textContent = `${outH} × ${outW}${outH === 0 || outW === 0 ? ' (0)' : ''}`;
    }

    // Parameters
    const params = calculateConvParams(
      state.inChannels,
      state.outChannels,
      state.kernelSize,
      state.kernelSize,
      groups,
      state.hasBias
    );
    if (paramCountEl) {
      paramCountEl.textContent = `${params.total.toLocaleString()} (${params.weights.toLocaleString()} W, ${params.biases.toLocaleString()} b)`;
    }

    // FLOPs / MACs
    const flops = calculateConvFlops(
      state.inH,
      state.inW,
      state.inChannels,
      state.outChannels,
      state.kernelSize,
      state.kernelSize,
      state.stride,
      state.stride,
      state.padding,
      state.padding,
      state.dilation,
      state.dilation,
      groups
    );
    if (flopsEl) {
      flopsEl.textContent = `${flops.macs.toLocaleString()} MACs / ${flops.flops.toLocaleString()} FLOPs`;
    }

    // Activation Memory Footprint (FP32: 4 bytes per element)
    const bytes = outH * outW * state.outChannels * 4;
    const kb = (bytes / 1024).toFixed(2);
    if (memoryEl) {
      memoryEl.textContent = `${kb} KB (${bytes.toLocaleString()} B)`;
    }

    // PyTorch Code Snippet
    if (pytorchCodeEl) {
      const snippet = generatePyTorchSnippet({
        inChannels: state.inChannels,
        outChannels: state.outChannels,
        kernelSize: state.kernelSize,
        stride: state.stride,
        padding: state.padding,
        dilation: state.dilation,
        groups,
        bias: state.hasBias,
      });
      pytorchCodeEl.textContent = snippet;
    }
  }

  // --------------------------------------------------------------------------
  // Renderers: 1D Biological Motif Scanner
  // --------------------------------------------------------------------------

  function render1DSequenceScanner(): void {
    const motif = presetMotifs[state.activeMotifKey] ?? presetMotifs.tataBox;
    const res1d = convolve1D(state.sequence, motif.pwm, state.seqStride);

    const k = motif.consensus.length;
    const nSteps = res1d.scores.length;

    if (nSteps === 0) {
      state.seqStepIdx = 0;
    } else {
      if (state.seqStepIdx >= nSteps) state.seqStepIdx = nSteps - 1;
      if (state.seqStepIdx < 0) state.seqStepIdx = 0;
    }

    const currentStartPos = state.seqStepIdx * state.seqStride;
    const currentEndPos = currentStartPos + k;

    // Render Sequence Track
    if (seqTrackEl) {
      seqTrackEl.innerHTML = '';
      seqTrackEl.style.display = 'flex';
      seqTrackEl.style.gap = '3px';
      seqTrackEl.style.overflowX = 'auto';
      seqTrackEl.style.padding = '0.5rem 0.25rem';

      const nucColors: Record<string, { bg: string; text: string }> = {
        A: { bg: 'rgba(16, 185, 129, 0.15)', text: '#059669' },
        C: { bg: 'rgba(59, 130, 246, 0.15)', text: '#2563eb' },
        G: { bg: 'rgba(245, 158, 11, 0.15)', text: '#d97706' },
        T: { bg: 'rgba(239, 68, 68, 0.15)', text: '#dc2626' },
      };

      for (let i = 0; i < state.sequence.length; i++) {
        const char = state.sequence[i].toUpperCase();
        const inWindow = i >= currentStartPos && i < currentEndPos;
        const color = nucColors[char] ?? { bg: 'rgba(156, 163, 175, 0.15)', text: '#4b5563' };

        const nuc = document.createElement('div');
        nuc.className = `cnn-seq-nuc ${inWindow ? 'in-window' : ''}`;
        nuc.style.background = color.bg;
        nuc.style.color = color.text;
        nuc.title = `Position ${i}: ${char} (Click to inspect window here)`;

        const letter = document.createElement('span');
        letter.textContent = char;
        nuc.appendChild(letter);

        const posTag = document.createElement('span');
        posTag.style.fontSize = '0.58rem';
        posTag.style.opacity = '0.7';
        posTag.textContent = String(i);
        nuc.appendChild(posTag);

        nuc.addEventListener('click', () => {
          const targetStep = Math.floor(i / state.seqStride);
          if (targetStep < nSteps) {
            state.seqStepIdx = targetStep;
            pauseSeqPlayback();
            render1DSequenceScanner();
          }
        });

        seqTrackEl.appendChild(nuc);
      }
    }

    // Render Score Chart (SVG)
    if (scoreChartEl) {
      scoreChartEl.innerHTML = '';
      if (nSteps > 0) {
        const maxScore = Math.max(1, ...res1d.scores);
        const minScore = Math.min(0, ...res1d.scores);
        const scoreRange = maxScore - minScore || 1;

        const svgWidth = Math.max(320, nSteps * 24);
        const svgHeight = 120;
        const padL = 35;
        const padR = 15;
        const padT = 15;
        const padB = 25;
        const plotW = svgWidth - padL - padR;
        const plotH = svgHeight - padT - padB;
        const barWidth = Math.max(4, plotW / nSteps - 3);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '120');
        svg.style.overflow = 'visible';

        // Base axis line
        const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        axis.setAttribute('x1', String(padL));
        axis.setAttribute('x2', String(padL + plotW));
        axis.setAttribute('y1', String(padT + plotH));
        axis.setAttribute('y2', String(padT + plotH));
        axis.setAttribute('stroke', 'var(--color-rule, #e5e4df)');
        axis.setAttribute('stroke-width', '1');
        svg.appendChild(axis);

        for (let s = 0; s < nSteps; s++) {
          const score = res1d.scores[s];
          const isHit = res1d.matches.includes(s * state.seqStride);
          const isActive = s === state.seqStepIdx;

          const barH = Math.max(2, (Math.max(0, score - minScore) / scoreRange) * plotH);
          const x = padL + s * (plotW / nSteps) + (plotW / nSteps - barWidth) / 2;
          const y = padT + plotH - barH;

          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', String(x));
          rect.setAttribute('y', String(y));
          rect.setAttribute('width', String(barWidth));
          rect.setAttribute('height', String(barH));
          rect.setAttribute('rx', '2');
          rect.setAttribute('fill', isHit ? '#10b981' : '#6366f1');
          rect.setAttribute('opacity', isActive ? '1' : isHit ? '0.85' : '0.45');
          rect.style.cursor = 'pointer';
          rect.style.transition = 'all 0.15s ease';

          if (isActive) {
            rect.classList.add('cnn-bar-active');
          }

          rect.addEventListener('click', () => {
            state.seqStepIdx = s;
            pauseSeqPlayback();
            render1DSequenceScanner();
          });

          const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          title.textContent = `Pos ${s * state.seqStride}: Score ${score.toFixed(2)}${isHit ? ' (Hit!)' : ''}`;
          rect.appendChild(title);

          svg.appendChild(rect);
        }

        scoreChartEl.appendChild(svg);
      }
    }

    // Match Summary
    if (matchSummaryEl) {
      if (res1d.matches.length > 0) {
        matchSummaryEl.innerHTML = `<span style="color: #10b981; font-weight: 600;">✓ Found ${res1d.matches.length} motif hit(s)</span> at sequence position(s): <code>[${res1d.matches.join(', ')}]</code>`;
      } else {
        matchSummaryEl.innerHTML = `<span style="color: var(--color-muted);">No motif hits detected at current threshold.</span>`;
      }
    }

    // Step Info
    if (seqStepInfoEl) {
      seqStepInfoEl.textContent = `Scanning Window: ${state.seqStepIdx + 1} / ${nSteps} (Index: ${currentStartPos}..${currentEndPos - 1})`;
    }

    // 1D X-Ray Breakdown
    if (seqXrayEl) {
      if (nSteps > 0) {
        let activeScore = res1d.scores[state.seqStepIdx] ?? 0;
        const breakdownTerms: string[] = [];

        for (let j = 0; j < k; j++) {
          const char = state.sequence[currentStartPos + j]?.toUpperCase() ?? '';
          const w = motif.pwm[char]?.[j] ?? 0;
          breakdownTerms.push(
            `<span class="cnn-term-chip"><code>${char}[${j}]</code> = ${w.toFixed(1)}</span>`
          );
        }

        seqXrayEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.82rem;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Window Consensus Match: <strong>${motif.name}</strong></span>
              <span style="font-family: var(--font-mono); font-weight: 700; color: #6366f1;">Score: ${activeScore.toFixed(2)}</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
              ${breakdownTerms.join(' + ')}
            </div>
          </div>
        `;
      } else {
        seqXrayEl.innerHTML = `<span style="color: var(--color-muted);">Sequence too short for selected motif length (${k} bp).</span>`;
      }
    }

    // Play Button
    if (seqPlayBtn) {
      seqPlayBtn.innerHTML = state.seqIsPlaying
        ? '<span aria-hidden="true">⏸</span> Pause'
        : '<span aria-hidden="true">▶</span> Scan';
    }
  }

  // --------------------------------------------------------------------------
  // Renderers: Receptive Field Ladder
  // --------------------------------------------------------------------------

  function renderReceptiveFieldLadder(): void {
    if (!rfLadderEl) return;
    const rfSteps: ReceptiveFieldStep[] = calculateReceptiveField(state.rfLayers);

    rfLadderEl.innerHTML = '';
    rfLadderEl.style.display = 'grid';
    rfLadderEl.style.gridTemplateColumns = 'repeat(auto-fit, minmax(180px, 1fr))';
    rfLadderEl.style.gap = '0.75rem';

    rfSteps.forEach((step) => {
      const card = document.createElement('div');
      card.style.border = '1px solid var(--color-rule, #e5e4df)';
      card.style.borderRadius = '8px';
      card.style.padding = '0.75rem';
      card.style.background = 'var(--color-surface, #ffffff)';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '0.4rem';

      card.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-weight: 600; font-size: 0.85rem; color: var(--color-ink);">Layer ${step.layerIndex}</span>
          <span style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: rgba(99, 102, 241, 0.1); color: #6366f1; font-weight: 600;">
            K=${step.kernel}, S=${step.stride}${step.dilation > 1 ? `, D=${step.dilation}` : ''}
          </span>
        </div>
        <div style="font-size: 1.25rem; font-weight: 700; color: #10b981; font-family: var(--font-mono);">
          RF = ${step.receptiveField} × ${step.receptiveField}
        </div>
        <div style="font-size: 0.75rem; color: var(--color-muted);">
          Cumulative Stride (Jump): <code>${step.jump} px</code>
        </div>
      `;

      rfLadderEl.appendChild(card);
    });

    if (vggCalloutEl) {
      vggCalloutEl.innerHTML = `
        <div style="display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.75rem; background: rgba(16, 185, 129, 0.08); border-left: 3px solid #10b981; border-radius: 4px; font-size: 0.85rem;">
          <div>
            <strong>The VGG Architectural Insight:</strong> Two stacked 3&times;3 convolutions yield an effective receptive field of 5&times;5 (<em>RF</em> = 1 + 2 + 2 = 5).
            For <em>C</em> channels, two stacked layers cost 2 &times; (3<sup>2</sup> &times; <em>C</em><sup>2</sup>) = 18<em>C</em><sup>2</sup> parameters, whereas a single 5&times;5 layer costs 1 &times; (5<sup>2</sup> &times; <em>C</em><sup>2</sup>) = 25<em>C</em><sup>2</sup>.
            Stacking provides <strong>28% fewer parameters</strong>, faster compute, and introduces an extra non-linear activation (ReLU) in between!
          </div>
        </div>
      `;
    }
  }

  // --------------------------------------------------------------------------
  // Update Preset & UI Controls
  // --------------------------------------------------------------------------

  function updatePresetUI(): void {
    if (presetSelect) {
      presetSelect.value = state.activePreset;
    }
    presetBtns.forEach((btn) => {
      const presetKey = btn.dataset.cnnPresetKernel;
      if (presetKey === state.activePreset) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function recomputeAndRender(): void {
    render2DVisualizer();
    renderStats();
  }

  // --------------------------------------------------------------------------
  // Playback Logic
  // --------------------------------------------------------------------------

  function stepForward(): void {
    const { steps } = getConvResult();
    if (steps.length === 0) return;
    state.currentStepIdx = (state.currentStepIdx + 1) % steps.length;
    render2DVisualizer();
  }

  function stepBackward(): void {
    const { steps } = getConvResult();
    if (steps.length === 0) return;
    state.currentStepIdx = (state.currentStepIdx - 1 + steps.length) % steps.length;
    render2DVisualizer();
  }

  function resetPlayback(): void {
    pausePlayback();
    state.currentStepIdx = 0;
    render2DVisualizer();
  }

  function playPlayback(): void {
    if (state.isPlaying) return;
    state.isPlaying = true;
    if (playBtn) {
      playBtn.innerHTML = '<span aria-hidden="true">⏸</span> Pause';
      playBtn.setAttribute('aria-label', 'Pause Convolution');
    }
    playbackTimerId = window.setInterval(() => {
      stepForward();
    }, state.playbackSpeed);
  }

  function pausePlayback(): void {
    if (!state.isPlaying) return;
    state.isPlaying = false;
    if (playbackTimerId !== null) {
      clearInterval(playbackTimerId);
      playbackTimerId = null;
    }
    if (playBtn) {
      playBtn.innerHTML = '<span aria-hidden="true">▶</span> Play';
      playBtn.setAttribute('aria-label', 'Play Convolution');
    }
  }

  // 1D Playback
  function playSeqPlayback(): void {
    if (state.seqIsPlaying) return;
    state.seqIsPlaying = true;
    if (seqPlayBtn) seqPlayBtn.innerHTML = '<span aria-hidden="true">⏸</span> Pause';
    seqPlaybackTimerId = window.setInterval(() => {
      const motif = presetMotifs[state.activeMotifKey] ?? presetMotifs.tataBox;
      const res1d = convolve1D(state.sequence, motif.pwm, state.seqStride);
      if (res1d.scores.length === 0) return;
      state.seqStepIdx = (state.seqStepIdx + 1) % res1d.scores.length;
      render1DSequenceScanner();
    }, state.seqSpeed);
  }

  function pauseSeqPlayback(): void {
    if (!state.seqIsPlaying) return;
    state.seqIsPlaying = false;
    if (seqPlaybackTimerId !== null) {
      clearInterval(seqPlaybackTimerId);
      seqPlaybackTimerId = null;
    }
    if (seqPlayBtn) seqPlayBtn.innerHTML = '<span aria-hidden="true">▶</span> Scan';
  }

  // --------------------------------------------------------------------------
  // Event Bindings
  // --------------------------------------------------------------------------

  // Mode Switcher
  function setMode(mode: '2d' | '1d'): void {
    state.mode = mode;
    if (mode === '2d') {
      panel2d?.style.setProperty('display', 'block');
      panel1d?.style.setProperty('display', 'none');
      mode2dTab?.classList.add('active');
      mode1dTab?.classList.remove('active');
      pauseSeqPlayback();
    } else {
      panel2d?.style.setProperty('display', 'none');
      panel1d?.style.setProperty('display', 'block');
      mode2dTab?.classList.remove('active');
      mode1dTab?.classList.add('active');
      pausePlayback();
      render1DSequenceScanner();
    }
  }

  mode2dTab?.addEventListener('click', (e) => {
    e.preventDefault();
    setMode('2d');
  });

  mode1dTab?.addEventListener('click', (e) => {
    e.preventDefault();
    setMode('1d');
  });

  // Playback Buttons
  playBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (state.isPlaying) pausePlayback();
    else playPlayback();
  });

  prevBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    pausePlayback();
    stepBackward();
  });

  nextBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    pausePlayback();
    stepForward();
  });

  resetBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    resetPlayback();
  });

  speedSelect?.addEventListener('change', () => {
    state.playbackSpeed = parseInt(speedSelect.value, 10) || 500;
    if (state.isPlaying) {
      pausePlayback();
      playPlayback();
    }
  });

  // Hyperparameter Inputs
  inSizeInput?.addEventListener('input', () => {
    const val = parseInt(inSizeInput.value, 10) || 5;
    state.inH = val;
    state.inW = val;
    if (inSizeReadout) inSizeReadout.textContent = `${val} × ${val}`;
    state.inputMatrix = resizeMatrix(state.inputMatrix, val, val);
    state.currentStepIdx = 0;
    recomputeAndRender();
  });

  kernelSizeSelect?.addEventListener('change', () => {
    const k = parseInt(kernelSizeSelect.value, 10) || 3;
    state.kernelSize = k;
    if (k === 3 && presetKernels[state.activePreset]) {
      state.kernelMatrix = presetKernels[state.activePreset].kernel.map((row) => [...row]);
    } else if (k === 1) {
      state.kernelMatrix = [[1]];
      state.activePreset = 'custom';
    } else if (k === 5) {
      state.kernelMatrix = [
        [0, 0, 1, 0, 0],
        [0, 1, 2, 1, 0],
        [1, 2, 4, 2, 1],
        [0, 1, 2, 1, 0],
        [0, 0, 1, 0, 0],
      ];
      state.activePreset = 'custom';
    }
    updatePresetUI();
    state.currentStepIdx = 0;
    recomputeAndRender();
  });

  strideSelect?.addEventListener('change', () => {
    state.stride = parseInt(strideSelect.value, 10) || 1;
    state.currentStepIdx = 0;
    recomputeAndRender();
  });

  paddingSelect?.addEventListener('change', () => {
    state.padding = parseInt(paddingSelect.value, 10) || 0;
    state.currentStepIdx = 0;
    recomputeAndRender();
  });

  padModeBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const mode = btn.dataset.cnnPadMode;
      if (mode === 'same') {
        state.padding = Math.floor(state.kernelSize / 2);
      } else if (mode === 'valid') {
        state.padding = 0;
      }
      if (paddingSelect) paddingSelect.value = String(state.padding);
      state.currentStepIdx = 0;
      recomputeAndRender();
    });
  });

  dilationSelect?.addEventListener('change', () => {
    state.dilation = parseInt(dilationSelect.value, 10) || 1;
    state.currentStepIdx = 0;
    recomputeAndRender();
  });

  inChannelsInput?.addEventListener('input', () => {
    state.inChannels = parseInt(inChannelsInput.value, 10) || 1;
    if (groupsInput) {
      groupsInput.max = String(state.inChannels);
    }
    renderStats();
  });

  outChannelsInput?.addEventListener('input', () => {
    state.outChannels = parseInt(outChannelsInput.value, 10) || 1;
    renderStats();
  });

  groupsInput?.addEventListener('input', () => {
    state.groups = parseInt(groupsInput.value, 10) || 1;
    renderStats();
  });

  depthwiseToggle?.addEventListener('change', () => {
    state.isDepthwise = depthwiseToggle.checked;
    if (groupsInput) {
      groupsInput.disabled = state.isDepthwise;
    }
    renderStats();
  });

  biasToggle?.addEventListener('change', () => {
    state.hasBias = biasToggle.checked;
    if (biasValInput) biasValInput.disabled = !state.hasBias;
    recomputeAndRender();
  });

  biasValInput?.addEventListener('input', () => {
    state.biasVal = parseFloat(biasValInput.value) || 0;
    recomputeAndRender();
  });

  // Preset Kernel Selector
  function setKernelPreset(presetKey: string): void {
    const p = presetKernels[presetKey];
    if (!p) return;
    state.activePreset = presetKey;
    state.kernelSize = p.kernel.length;
    if (kernelSizeSelect) kernelSizeSelect.value = String(state.kernelSize);
    state.kernelMatrix = p.kernel.map((row) => [...row]);
    state.biasVal = p.bias ?? 0;
    if (biasValInput) biasValInput.value = String(state.biasVal);
    state.currentStepIdx = 0;
    updatePresetUI();
    recomputeAndRender();
  }

  presetSelect?.addEventListener('change', () => {
    setKernelPreset(presetSelect.value);
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const key = btn.dataset.cnnPresetKernel;
      if (key) setKernelPreset(key);
    });
  });

  // PyTorch Copy Button
  copyPytorchBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!pytorchCodeEl) return;
    const text = pytorchCodeEl.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      const origHtml = copyPytorchBtn.innerHTML;
      copyPytorchBtn.innerHTML = '<span aria-hidden="true">✓</span> Copied!';
      copyPytorchBtn.style.color = '#10b981';
      setTimeout(() => {
        copyPytorchBtn.innerHTML = origHtml;
        copyPytorchBtn.style.color = '';
      }, 2000);
    } catch {
      // Fallback
    }
  });

  // 1D Sequence Scanner Controls
  motifSelect?.addEventListener('change', () => {
    state.activeMotifKey = motifSelect.value;
    state.seqStepIdx = 0;
    render1DSequenceScanner();
  });

  seqInput?.addEventListener('input', () => {
    state.sequence = (seqInput.value || 'TATAAA').trim().toUpperCase();
    state.seqStepIdx = 0;
    render1DSequenceScanner();
  });

  seqStrideSelect?.addEventListener('change', () => {
    state.seqStride = parseInt(seqStrideSelect.value, 10) || 1;
    state.seqStepIdx = 0;
    render1DSequenceScanner();
  });

  seqPlayBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (state.seqIsPlaying) pauseSeqPlayback();
    else playSeqPlayback();
  });

  seqPrevBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    pauseSeqPlayback();
    const motif = presetMotifs[state.activeMotifKey] ?? presetMotifs.tataBox;
    const res = convolve1D(state.sequence, motif.pwm, state.seqStride);
    if (res.scores.length > 0) {
      state.seqStepIdx = (state.seqStepIdx - 1 + res.scores.length) % res.scores.length;
      render1DSequenceScanner();
    }
  });

  seqNextBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    pauseSeqPlayback();
    const motif = presetMotifs[state.activeMotifKey] ?? presetMotifs.tataBox;
    const res = convolve1D(state.sequence, motif.pwm, state.seqStride);
    if (res.scores.length > 0) {
      state.seqStepIdx = (state.seqStepIdx + 1) % res.scores.length;
      render1DSequenceScanner();
    }
  });

  seqResetBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    pauseSeqPlayback();
    state.seqStepIdx = 0;
    render1DSequenceScanner();
  });

  // Receptive Field Controls
  rfAddLayerBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (state.rfLayers.length < 8) {
      state.rfLayers.push({ kernel: 3, stride: 1, dilation: 1 });
      renderReceptiveFieldLadder();
    }
  });

  rfResetBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    state.rfLayers = [
      { kernel: 3, stride: 1, dilation: 1 },
      { kernel: 3, stride: 1, dilation: 1 },
      { kernel: 3, stride: 1, dilation: 1 },
    ];
    renderReceptiveFieldLadder();
  });

  // Accordions
  accordionTriggers.forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const parent = trigger.closest('[data-cnn-accordion]');
      if (parent) {
        parent.classList.toggle('open');
      }
    });
  });

  // Keyboard Shortcuts
  function handleKeydown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (state.mode === '2d') {
        if (state.isPlaying) pausePlayback();
        else playPlayback();
      } else {
        if (state.seqIsPlaying) pauseSeqPlayback();
        else playSeqPlayback();
      }
    } else if (e.code === 'ArrowRight' || e.key === 'l' || e.key === 'n') {
      e.preventDefault();
      if (state.mode === '2d') {
        pausePlayback();
        stepForward();
      } else {
        pauseSeqPlayback();
        seqNextBtn?.click();
      }
    } else if (e.code === 'ArrowLeft' || e.key === 'j' || e.key === 'p') {
      e.preventDefault();
      if (state.mode === '2d') {
        pausePlayback();
        stepBackward();
      } else {
        pauseSeqPlayback();
        seqPrevBtn?.click();
      }
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      if (state.mode === '2d') {
        resetPlayback();
      } else {
        pauseSeqPlayback();
        state.seqStepIdx = 0;
        render1DSequenceScanner();
      }
    }
  }

  window.addEventListener('keydown', handleKeydown);

  // Initial Execution
  updatePresetUI();
  recomputeAndRender();
  render1DSequenceScanner();
  renderReceptiveFieldLadder();

  const controller: CnnStudioController = {
    getState: () => ({ ...state }),
    stepForward: () => {
      pausePlayback();
      stepForward();
    },
    stepBackward: () => {
      pausePlayback();
      stepBackward();
    },
    reset: () => {
      resetPlayback();
    },
    play: () => {
      playPlayback();
    },
    pause: () => {
      pausePlayback();
    },
    setMode,
    setKernelPreset,
    destroy: () => {
      pausePlayback();
      pauseSeqPlayback();
      window.removeEventListener('keydown', handleKeydown);
      container.dataset.cnnStudioReady = 'false';
      window.__cnnStudioInitialized = false;
      if (window.__activeCnnStudio === controller) {
        window.__activeCnnStudio = null;
      }
    },
  };

  window.__activeCnnStudio = controller;
  return controller;
}

// Auto-initialize on DOMContentLoaded and astro:page-load
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const boot = () => {
    if (window.__cnnStudioInitialized) {
      const container = document.querySelector<HTMLElement>('[data-cnn-studio], #cnn-studio-root');
      if (!container || container.dataset.cnnStudioReady === 'true') {
        return;
      }
    }
    initCnnStudio();
  };

  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('astro:page-load', () => {
    if (window.__activeCnnStudio) {
      window.__activeCnnStudio.destroy();
      window.__activeCnnStudio = null;
    }
    window.__cnnStudioInitialized = false;
    boot();
  });

  if (document.readyState !== 'loading') {
    boot();
  }
}
