/**
 * Mamba & State Space Model (SSM) Interactive Studio Client Controller
 *
 * Drives the dual-mode execution switcher (recurrent inference vs parallel associative scan),
 * recurrent step-by-step playback with animated Delta gate meter and latent state heatmap,
 * Blelloch parallel prefix scan tree diagram, X-Ray state space inspector,
 * ZOH discretization explorer, domain presets (NLP & Genomics), Mamba vs Transformer
 * memory benchmark calculator, and live PyTorch generator.
 */

import {
  initializeDiagonalA,
  computeSelectiveScan,
  computeParallelAssociativeScan,
  calculateMambaParams,
  calculateMambaFlops,
  calculateMambaMemoryBenchmark,
  formatBytes,
  generateMambaPyTorchSnippet,
  type MambaConfig,
  type SelectiveScanResult,
  type ParallelScanNode,
  type MambaParams,
  type MambaFlops,
  type MambaBenchmark,
} from '../lib/mambaCore';

declare global {
  interface Window {
    __mambaStudioInitialized?: boolean;
    __activeMambaStudio?: MambaStudioController | null;
  }
}

export interface MambaPreset {
  id: string;
  name: string;
  category: 'NLP' | 'Genomics';
  description: string;
  text: string;
  tokens: string[];
  tokenDeltas?: Record<string, number>;
  tokenX?: Record<string, number>;
}

export const MAMBA_PRESETS: Record<string, MambaPreset> = {
  nlpFilter: {
    id: 'nlpFilter',
    name: 'Selective Information Filtering',
    category: 'NLP',
    description:
      'Mamba uses input-dependent Delta gating to filter low-information stopwords (small Delta, retaining memory) while latching informative sentiment cues into state.',
    text: 'The movie was not terrible at all, actually quite fantastic',
    tokens: [
      'The',
      'movie',
      'was',
      'not',
      'terrible',
      'at',
      'all,',
      'actually',
      'quite',
      'fantastic',
    ],
    tokenDeltas: {
      The: 0.05,
      movie: 0.35,
      was: 0.08,
      not: 0.85,
      terrible: 0.8,
      at: 0.04,
      'all,': 0.06,
      actually: 0.4,
      quite: 0.3,
      fantastic: 0.95,
    },
    tokenX: {
      The: 0.05,
      movie: 0.2,
      was: 0.05,
      not: -0.7,
      terrible: -0.85,
      at: 0.02,
      'all,': 0.03,
      actually: 0.4,
      quite: 0.25,
      fantastic: 0.95,
    },
  },
  nlpRecall: {
    id: 'nlpRecall',
    name: 'Induction Head & Associative Recall',
    category: 'NLP',
    description:
      'Demonstrates variable recall across sequence length: the model stores a key/passcode in hidden state, ignores intervening distractors, and outputs it on query.',
    text: 'Passcode is ALPHA_42 filler noise context distractor Recall: ALPHA_42',
    tokens: [
      'Passcode',
      'is',
      'ALPHA_42',
      'filler',
      'noise',
      'context',
      'distractor',
      'Recall:',
      'ALPHA_42',
    ],
    tokenDeltas: {
      Passcode: 0.75,
      is: 0.08,
      ALPHA_42: 0.92,
      filler: 0.05,
      noise: 0.04,
      context: 0.06,
      distractor: 0.05,
      'Recall:': 0.88,
    },
    tokenX: {
      Passcode: 0.6,
      is: 0.05,
      ALPHA_42: 0.88,
      filler: 0.04,
      noise: 0.02,
      context: 0.03,
      distractor: 0.02,
      'Recall:': 0.75,
    },
  },
  dnaDistal: {
    id: 'dnaDistal',
    name: 'Distal Enhancer-Promoter Regulation',
    category: 'Genomics',
    description:
      'Causal modeling of long-range cis-regulatory elements: upstream enhancer motif modulates latent state across neutral non-coding spacer sequence to activate core promoter.',
    text: 'GATA3_Enhancer ATCG GCTA TTTA PolyA_Spacer TATA_Promoter TSS_Start',
    tokens: [
      'GATA3_Enhancer',
      'ATCG',
      'GCTA',
      'TTTA',
      'PolyA_Spacer',
      'TATA_Promoter',
      'TSS_Start',
    ],
    tokenDeltas: {
      GATA3_Enhancer: 0.92,
      ATCG: 0.08,
      GCTA: 0.06,
      TTTA: 0.07,
      PolyA_Spacer: 0.05,
      TATA_Promoter: 0.88,
      TSS_Start: 0.75,
    },
    tokenX: {
      GATA3_Enhancer: 0.85,
      ATCG: 0.05,
      GCTA: 0.03,
      TTTA: 0.02,
      PolyA_Spacer: 0.01,
      TATA_Promoter: 0.78,
      TSS_Start: 0.92,
    },
  },
  dnaSplice: {
    id: 'dnaSplice',
    name: 'Causal Splice Site Detection (GT/AG)',
    category: 'Genomics',
    description:
      'Detects canonical RNA splicing junctions: invariant 5-prime donor (GT) and 3-prime acceptor (AG) dinucleotides trigger sharp state shifts while intervening introns are filtered.',
    text: 'Exon1_End Donor_GT Intron_Deep Intron_Neutral Branch_A Acceptor_AG Exon2_Start',
    tokens: [
      'Exon1_End',
      'Donor_GT',
      'Intron_Deep',
      'Intron_Neutral',
      'Branch_A',
      'Acceptor_AG',
      'Exon2_Start',
    ],
    tokenDeltas: {
      Exon1_End: 0.35,
      Donor_GT: 0.95,
      Intron_Deep: 0.05,
      Intron_Neutral: 0.04,
      Branch_A: 0.65,
      Acceptor_AG: 0.95,
      Exon2_Start: 0.45,
    },
    tokenX: {
      Exon1_End: 0.3,
      Donor_GT: 0.9,
      Intron_Deep: 0.04,
      Intron_Neutral: 0.02,
      Branch_A: 0.55,
      Acceptor_AG: 0.92,
      Exon2_Start: 0.4,
    },
  },
};

export interface MambaStudioState {
  config: MambaConfig;
  activeMode: 'recurrent' | 'parallel';
  activePresetKey: string;
  tokens: string[];
  customText: string;
  currentStepIndex: number;
  isPlaying: boolean;
  playbackSpeed: number; // ms
  zohDelta: number; // For ZOH explorer slider (0.01 - 2.0)
  benchmarkSeqLen: number; // Sequence length for benchmark (1k to 128k)
  benchmarkNumLayers: number;
  benchmarkPrecisionBytes: number;
  selectiveScanResult: SelectiveScanResult | null;
  parallelScanResult: { outputs: number[]; tree: ParallelScanNode[] } | null;
}

/**
 * Deterministically generates reproducible SSM inputs (x, delta, B, C)
 * with bounded float vectors for canonical presets or arbitrary custom sequences.
 */
export function generateSyntheticSSMData(
  tokens: string[],
  dState: number,
  preset?: MambaPreset
): { x: number[]; delta: number[]; B: number[][]; C: number[][] } {
  const T = tokens.length;
  const x: number[] = new Array(T);
  const delta: number[] = new Array(T);
  const B: number[][] = new Array(T);
  const C: number[][] = new Array(T);

  for (let t = 0; t < T; t++) {
    const token = tokens[t];
    let hash = (t + 1) * 31;
    for (let c = 0; c < token.length; c++) {
      hash = (hash * 37 + token.charCodeAt(c)) & 0x7fffffff;
    }

    // Determine delta
    if (preset?.tokenDeltas && preset.tokenDeltas[token] !== undefined) {
      delta[t] = preset.tokenDeltas[token];
    } else {
      // Deterministic pseudo-random delta in [0.05, 0.95]
      delta[t] = Number((0.05 + ((hash % 900) / 1000)).toFixed(3));
    }

    // Determine x
    if (preset?.tokenX && preset.tokenX[token] !== undefined) {
      x[t] = preset.tokenX[token];
    } else {
      // Deterministic x in [-1.0, 1.0]
      x[t] = Number((((hash % 2000) - 1000) / 1000).toFixed(3));
    }

    // B vector of dimension dState
    const bRow: number[] = new Array(dState);
    for (let n = 0; n < dState; n++) {
      const angle = (((hash + n * 17) % 1000) / 1000) * 2 * Math.PI + 1.2;
      bRow[n] = Number((Math.sin(angle) * 0.8).toFixed(3));
    }
    B[t] = bRow;

    // C vector of dimension dState
    const cRow: number[] = new Array(dState);
    for (let n = 0; n < dState; n++) {
      const angle = (((hash + n * 29) % 1000) / 1000) * 2 * Math.PI + 2.7;
      cRow[n] = Number((Math.cos(angle) * 0.8).toFixed(3));
    }
    C[t] = cRow;
  }

  return { x, delta, B, C };
}

export function formatNumber(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
}

export function formatFlops(flops: number): string {
  if (flops >= 1e12) return (flops / 1e12).toFixed(2) + ' TFLOPs';
  if (flops >= 1e9) return (flops / 1e9).toFixed(2) + ' GFLOPs';
  if (flops >= 1e6) return (flops / 1e6).toFixed(2) + ' MFLOPs';
  if (flops >= 1e3) return (flops / 1e3).toFixed(1) + ' KFLOPs';
  return flops.toString() + ' FLOPs';
}

export class MambaStudioController {
  private container: HTMLElement;
  private state: MambaStudioState;
  private playbackTimer: any = null;
  private boundListeners: Array<{
    el: EventTarget;
    event: string;
    fn: EventListenerOrEventListenerObject;
  }> = [];

  constructor(container: HTMLElement) {
    this.container = container;

    const initialConfig: MambaConfig = {
      dModel: 16,
      dState: 8,
      dConv: 4,
      expand: 2,
      dtRank: 2,
    };

    const initialPreset = MAMBA_PRESETS.nlpFilter;

    this.state = {
      config: initialConfig,
      activeMode: 'recurrent',
      activePresetKey: 'nlpFilter',
      tokens: [...initialPreset.tokens],
      customText: initialPreset.text,
      currentStepIndex: 0,
      isPlaying: false,
      playbackSpeed: 1000,
      zohDelta: 0.25,
      benchmarkSeqLen: 32768,
      benchmarkNumLayers: 24,
      benchmarkPrecisionBytes: 2,
      selectiveScanResult: null,
      parallelScanResult: null,
    };

    this.recomputeScan();
    this.bindEvents();
    this.renderAll();
    this.container.dataset.mambaStudioReady = 'true';
  }

  public getState(): MambaStudioState {
    return {
      ...this.state,
      config: { ...this.state.config },
      tokens: [...this.state.tokens],
    };
  }

  private addListener(
    el: EventTarget | null,
    event: string,
    fn: EventListenerOrEventListenerObject
  ) {
    if (!el) return;
    el.addEventListener(event, fn);
    this.boundListeners.push({ el, event, fn });
  }

  public destroy() {
    this.pause();
    this.boundListeners.forEach(({ el, event, fn }) => {
      el.removeEventListener(event, fn);
    });
    this.boundListeners = [];
    this.container.dataset.mambaStudioReady = 'false';
    if (typeof window !== 'undefined') {
      (window as any).__mambaStudioInitialized = false;
      if ((window as any).__activeMambaStudio === this) {
        (window as any).__activeMambaStudio = null;
      }
    }
  }

  /**
   * Recomputes selective scan recurrence and parallel associative scan tree
   */
  public recomputeScan() {
    const { tokens, config, activePresetKey } = this.state;
    const preset = MAMBA_PRESETS[activePresetKey];
    const { x, delta, B, C } = generateSyntheticSSMData(
      tokens,
      config.dState,
      preset
    );
    const A_diag = initializeDiagonalA(config.dState);
    const D = 0.5;

    this.state.selectiveScanResult = computeSelectiveScan(
      x,
      delta,
      B,
      C,
      A_diag,
      D,
      tokens
    );
    this.state.parallelScanResult = computeParallelAssociativeScan(
      x,
      delta,
      B,
      C,
      A_diag,
      D
    );

    if (this.state.currentStepIndex >= tokens.length) {
      this.state.currentStepIndex = 0;
    }
  }

  // ==========================================
  // Public Control API
  // ==========================================

  public setMode(mode: 'recurrent' | 'parallel') {
    this.state.activeMode = mode;
    this.renderModeSwitcher();
    if (mode === 'parallel') {
      this.renderParallelScan();
    }
  }

  public setPreset(presetKey: string) {
    const preset = MAMBA_PRESETS[presetKey];
    if (!preset) return;
    this.state.activePresetKey = presetKey;
    this.state.tokens = [...preset.tokens];
    this.state.customText = preset.text;
    this.state.currentStepIndex = 0;
    this.recomputeScan();
    this.renderAll();
  }

  public setCustomTokens(input: string | string[]) {
    let tokens: string[] = [];
    if (Array.isArray(input)) {
      tokens = input.map((t) => t.trim()).filter(Boolean);
    } else if (typeof input === 'string') {
      tokens = input.trim().split(/\s+/).filter(Boolean);
      this.state.customText = input;
    }

    if (tokens.length === 0) {
      tokens = ['Token_A', 'Token_B', 'Token_C', 'Token_D'];
    }

    if (tokens.length > 24) {
      tokens = tokens.slice(0, 24);
    }

    this.state.tokens = tokens;
    this.state.activePresetKey = 'custom';
    this.state.currentStepIndex = 0;
    this.recomputeScan();
    this.renderAll();
  }

  public setConfig(partialConfig: Partial<MambaConfig>) {
    const newConfig = { ...this.state.config, ...partialConfig };

    if (newConfig.dModel < 4) newConfig.dModel = 4;
    if (newConfig.dState < 2) newConfig.dState = 2;
    if (newConfig.dConv < 1) newConfig.dConv = 1;
    if (newConfig.expand < 1) newConfig.expand = 1;
    newConfig.dtRank = Math.max(1, Math.ceil(newConfig.dModel / 16));

    this.state.config = newConfig;
    this.recomputeScan();
    this.renderAll();
  }

  public play() {
    if (this.state.isPlaying) return;
    this.state.isPlaying = true;
    this.updatePlayButton();
    const intervalFn =
      typeof window !== 'undefined' && typeof window.setInterval === 'function'
        ? window.setInterval.bind(window)
        : setInterval;
    this.playbackTimer = intervalFn(() => {
      this.nextStep();
    }, this.state.playbackSpeed);
  }

  public pause() {
    if (this.playbackTimer) {
      const clearIntervalFn =
        typeof window !== 'undefined' &&
        typeof window.clearInterval === 'function'
          ? window.clearInterval.bind(window)
          : clearInterval;
      clearIntervalFn(this.playbackTimer);
      this.playbackTimer = null;
    }
    this.state.isPlaying = false;
    this.updatePlayButton();
  }

  public togglePlay() {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public nextStep() {
    const len = this.state.tokens.length;
    if (len === 0) return;
    this.state.currentStepIndex = (this.state.currentStepIndex + 1) % len;
    this.renderStep();
  }

  public prevStep() {
    const len = this.state.tokens.length;
    if (len === 0) return;
    this.state.currentStepIndex =
      (this.state.currentStepIndex - 1 + len) % len;
    this.renderStep();
  }

  public setStep(index: number) {
    const len = this.state.tokens.length;
    if (len === 0) return;
    this.state.currentStepIndex = Math.max(0, Math.min(len - 1, index));
    this.renderStep();
  }

  public reset() {
    this.pause();
    this.state.currentStepIndex = 0;
    this.renderStep();
  }

  public setSpeed(speedMs: number) {
    this.state.playbackSpeed = Math.max(100, speedMs);
    if (this.state.isPlaying) {
      this.pause();
      this.play();
    }
  }

  public setZohDelta(delta: number) {
    this.state.zohDelta = Math.max(0.01, Math.min(2.0, delta));
    this.renderZOH();
  }

  public setBenchmarkSeqLen(seqLen: number) {
    this.state.benchmarkSeqLen = Math.max(1024, Math.min(131072, seqLen));
    this.renderBenchmark();
  }

  public async copyPyTorchCode(): Promise<boolean> {
    const code = generateMambaPyTorchSnippet(this.state.config);
    let copied = false;
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(code);
        copied = true;
      } else {
        copied = this.fallbackCopyText(code);
      }
    } catch {
      copied = this.fallbackCopyText(code);
    }

    const btn = this.container.querySelector<HTMLElement>(
      '[data-mamba-copy-pytorch]'
    );
    if (btn) {
      const originalText =
        btn.dataset.originalText || btn.textContent || 'Copy PyTorch Code';
      btn.dataset.originalText = originalText;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('copied');
      }, 2000);
    }
    return copied;
  }

  private fallbackCopyText(text: string): boolean {
    if (typeof document === 'undefined') return false;
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch {
      return false;
    }
  }

  // ==========================================
  // Event Binding
  // ==========================================

  private bindEvents() {
    // Mode switcher tabs
    const modeTabs = this.container.querySelectorAll<HTMLElement>(
      '[data-mamba-mode-tab]'
    );
    modeTabs.forEach((tab) => {
      this.addListener(tab, 'click', () => {
        const mode = tab.dataset.mambaModeTab as 'recurrent' | 'parallel';
        if (mode === 'recurrent' || mode === 'parallel') {
          this.setMode(mode);
        }
      });
    });

    // Recurrent playback controls
    const playBtn = this.container.querySelector<HTMLElement>(
      '[data-mamba-play]'
    );
    this.addListener(playBtn, 'click', () => this.togglePlay());

    const prevBtn = this.container.querySelector<HTMLElement>(
      '[data-mamba-prev]'
    );
    this.addListener(prevBtn, 'click', () => this.prevStep());

    const nextBtn = this.container.querySelector<HTMLElement>(
      '[data-mamba-next]'
    );
    this.addListener(nextBtn, 'click', () => this.nextStep());

    const resetBtn = this.container.querySelector<HTMLElement>(
      '[data-mamba-reset]'
    );
    this.addListener(resetBtn, 'click', () => this.reset());

    const speedEl = this.container.querySelector<HTMLSelectElement | HTMLInputElement>(
      '[data-mamba-speed]'
    );
    if (speedEl) {
      const handleSpeed = () => {
        const val = parseInt(speedEl.value, 10);
        if (!isNaN(val)) this.setSpeed(val);
      };
      this.addListener(speedEl, 'change', handleSpeed);
      this.addListener(speedEl, 'input', handleSpeed);
    }

    // Presets
    const presetBtns = this.container.querySelectorAll<HTMLElement>(
      '[data-mamba-preset]'
    );
    presetBtns.forEach((btn) => {
      this.addListener(btn, 'click', () => {
        const presetKey = btn.dataset.mambaPreset;
        if (presetKey) this.setPreset(presetKey);
      });
    });

    // Custom input
    const customInput = this.container.querySelector<HTMLInputElement>(
      '[data-mamba-custom-input]'
    );
    if (customInput) {
      const handleCustom = () => {
        this.setCustomTokens(customInput.value);
      };
      this.addListener(customInput, 'change', handleCustom);
    }

    // Token list delegation
    const tokenListEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-token-list]'
    );
    if (tokenListEl) {
      this.addListener(tokenListEl, 'click', (e) => {
        const target = (e.target as HTMLElement)?.closest<HTMLElement>(
          '[data-token-idx]'
        );
        if (target && target.dataset.tokenIdx) {
          const idx = parseInt(target.dataset.tokenIdx, 10);
          if (!isNaN(idx)) this.setStep(idx);
        }
      });
    }

    // Output track delegation
    const outputTrackEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-output-track]'
    );
    if (outputTrackEl) {
      this.addListener(outputTrackEl, 'click', (e) => {
        const target = (e.target as HTMLElement)?.closest<HTMLElement>(
          '[data-step-idx]'
        );
        if (target && target.dataset.stepIdx) {
          const idx = parseInt(target.dataset.stepIdx, 10);
          if (!isNaN(idx)) this.setStep(idx);
        }
      });
    }

    // ZOH Delta slider
    const zohSlider = this.container.querySelector<HTMLInputElement>(
      '[data-mamba-delta-slider]'
    );
    if (zohSlider) {
      const handleZoh = () => {
        const val = parseFloat(zohSlider.value);
        if (!isNaN(val)) this.setZohDelta(val);
      };
      this.addListener(zohSlider, 'input', handleZoh);
      this.addListener(zohSlider, 'change', handleZoh);
    }

    // Benchmark slider
    const benchmarkSlider = this.container.querySelector<HTMLInputElement>(
      '[data-mamba-benchmark-slider]'
    );
    if (benchmarkSlider) {
      const handleBench = () => {
        const val = parseInt(benchmarkSlider.value, 10);
        if (!isNaN(val)) this.setBenchmarkSeqLen(val);
      };
      this.addListener(benchmarkSlider, 'input', handleBench);
      this.addListener(benchmarkSlider, 'change', handleBench);
    }

    // Hyperparameter sliders
    const bindHyper = (
      selector: string,
      prop: keyof MambaConfig,
      isFloat: boolean = false
    ) => {
      const el = this.container.querySelector<HTMLInputElement>(selector);
      if (el) {
        const update = () => {
          const val = isFloat ? parseFloat(el.value) : parseInt(el.value, 10);
          if (!isNaN(val)) {
            this.setConfig({ [prop]: val });
          }
        };
        this.addListener(el, 'input', update);
        this.addListener(el, 'change', update);
      }
    };

    bindHyper('[data-mamba-d-model]', 'dModel');
    bindHyper('[data-mamba-d-state]', 'dState');
    bindHyper('[data-mamba-d-conv]', 'dConv');
    bindHyper('[data-mamba-expand]', 'expand');

    // Copy PyTorch button
    const copyBtn = this.container.querySelector<HTMLElement>(
      '[data-mamba-copy-pytorch]'
    );
    this.addListener(copyBtn, 'click', () => this.copyPyTorchCode());
  }

  // ==========================================
  // Rendering Orchestration
  // ==========================================

  public renderAll() {
    this.renderModeSwitcher();
    this.renderPresets();
    this.renderStep();
    this.renderZOH();
    this.renderBenchmark();
    this.renderHyperparameters();
    this.renderStats();
    this.renderPyTorch();
    if (this.state.activeMode === 'parallel') {
      this.renderParallelScan();
    }
  }

  private renderPresets() {
    const { activePresetKey } = this.state;
    const presetBtns = this.container.querySelectorAll<HTMLElement>(
      '[data-mamba-preset]'
    );
    presetBtns.forEach((btn) => {
      const key = btn.dataset.mambaPreset;
      const isActive = key === activePresetKey;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    const customInput = this.container.querySelector<HTMLInputElement>(
      '[data-mamba-custom-input]'
    );
    if (customInput && this.state.activePresetKey !== 'custom') {
      customInput.value = this.state.customText;
    }
  }

  private renderModeSwitcher() {
    const { activeMode } = this.state;
    const tabs = this.container.querySelectorAll<HTMLElement>(
      '[data-mamba-mode-tab]'
    );
    tabs.forEach((tab) => {
      const isCurrent = tab.dataset.mambaModeTab === activeMode;
      tab.classList.toggle('active', isCurrent);
      tab.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    });

    const panels = this.container.querySelectorAll<HTMLElement>(
      '[data-mamba-panel]'
    );
    panels.forEach((panel) => {
      const isCurrent = panel.dataset.mambaPanel === activeMode;
      panel.classList.toggle('active', isCurrent);
      panel.classList.toggle('hidden', !isCurrent);
      panel.hidden = !isCurrent;
      panel.style.display = isCurrent ? 'block' : 'none';
    });
  }

  private updatePlayButton() {
    const playBtn = this.container.querySelector<HTMLElement>(
      '[data-mamba-play]'
    );
    if (!playBtn) return;
    const isPlaying = this.state.isPlaying;
    playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
    playBtn.dataset.playing = isPlaying ? 'true' : 'false';
    const icon = isPlaying ? '❚❚' : '▶';
    playBtn.textContent = `${icon} ${isPlaying ? 'Pause' : 'Play'}`;
  }

  private renderStep() {
    if (
      !this.state.selectiveScanResult ||
      this.state.selectiveScanResult.steps.length === 0
    ) {
      return;
    }

    const stepIdx = this.state.currentStepIndex;
    const stepData = this.state.selectiveScanResult.steps[stepIdx];
    const totalSteps = this.state.tokens.length;

    // 1. Step badge
    const badgeEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-step-badge]'
    );
    if (badgeEl) {
      badgeEl.textContent = `Step ${stepIdx + 1} of ${totalSteps}: token "${stepData.token}"`;
    }

    // 2. Animated Delta Gate Meter
    const deltaMeterEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-delta-meter]'
    );
    if (deltaMeterEl) {
      const isLatch = stepData.delta >= 0.4;
      const statusBadgeText = isLatch
        ? 'Latching New State'
        : 'Retaining Memory / Filtering';
      const pctWidth = Math.min(100, Math.max(0, stepData.delta * 100)).toFixed(
        1
      );
      const retainPct = (stepData.retainedRatio * 100).toFixed(1);

      deltaMeterEl.dataset.meterStatus = isLatch ? 'latch' : 'filter';
      deltaMeterEl.innerHTML = `
        <div class="mamba-delta-meter-inner">
          <div class="meter-header">
            <span class="meter-label">Selective Delta Gate (&Delta;<sub>t</sub>)</span>
            <span class="meter-val">${stepData.delta.toFixed(3)}</span>
            <span class="meter-badge ${isLatch ? 'badge-latch' : 'badge-filter'}">${statusBadgeText}</span>
          </div>
          <div class="meter-track">
            <div class="meter-bar" style="width: ${pctWidth}%;"></div>
          </div>
          <div class="meter-meta">
            <span class="meter-retained">Past State Retention: ${retainPct}%</span>
            <span class="meter-influx">New Input Influx: ${(Math.min(1, stepData.delta) * 100).toFixed(1)}%</span>
          </div>
        </div>
      `;
    }

    // 3. Latent State Vector Heatmap
    const stateVecEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-state-vector]'
    );
    if (stateVecEl) {
      const cells = stepData.hNext
        .map((val, idx) => {
          const signClass =
            val > 0.001 ? 'positive' : val < -0.001 ? 'negative' : 'neutral';
          const absMag = Math.min(1, Math.abs(val));
          const opacity = (0.2 + absMag * 0.8).toFixed(2);
          const barWidth = (absMag * 100).toFixed(1);
          return `
            <div class="state-cell ${signClass}" data-dim="${idx}" style="--cell-opacity: ${opacity};" title="h_${idx} = ${val.toFixed(4)}">
              <span class="cell-label">h<sub>${idx}</sub></span>
              <span class="cell-val">${val >= 0 ? '+' : ''}${val.toFixed(3)}</span>
              <div class="cell-bar" style="width: ${barWidth}%;"></div>
            </div>
          `;
        })
        .join('');

      stateVecEl.innerHTML = `
        <div class="mamba-state-grid">
          ${cells}
        </div>
      `;
    }

    // 4. Output Track
    const outputTrackEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-output-track]'
    );
    if (outputTrackEl) {
      const items = this.state.selectiveScanResult.steps
        .map((s, idx) => {
          const isActive = idx === stepIdx;
          return `
            <button type="button" class="output-track-step ${isActive ? 'active' : ''}" data-step-idx="${idx}" title="Step ${idx + 1}: ${s.token}">
              <span class="track-token">${s.token}</span>
              <span class="track-y">y = ${s.yVal.toFixed(3)}</span>
              <span class="track-delta">&Delta; = ${s.delta.toFixed(2)}</span>
            </button>
          `;
        })
        .join('');

      outputTrackEl.innerHTML = `
        <div class="output-track-scroll">
          ${items}
        </div>
      `;
    }

    // 5. Token List clickable badges
    const tokenListEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-token-list]'
    );
    if (tokenListEl) {
      const badges = this.state.tokens
        .map((tok, idx) => {
          const isActive = idx === stepIdx;
          return `
            <button type="button" class="token-badge ${isActive ? 'active' : ''}" data-token-idx="${idx}">
              <span class="token-num">t${idx}</span>
              <span class="token-str">${tok}</span>
            </button>
          `;
        })
        .join('');

      tokenListEl.innerHTML = badges;
    }

    // 6. X-Ray State Space Inspector
    const xrayEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-xray]'
    );
    if (xrayEl) {
      const bStr = stepData.bVal.map((v) => v.toFixed(3)).join(', ');
      const cStr = stepData.cVal.map((v) => v.toFixed(3)).join(', ');
      const aBarStr = stepData.aBarDiag.map((v) => v.toFixed(3)).join(', ');
      const bBarStr = stepData.bBar.map((v) => v.toFixed(3)).join(', ');
      const decayStr = stepData.aBarDiag
        .map((a, i) => (a * stepData.hPrev[i]).toFixed(3))
        .join(', ');
      const inputStr = stepData.bBar
        .map((b) => (b * stepData.xVal).toFixed(3))
        .join(', ');
      const hNextStr = stepData.hNext.map((v) => v.toFixed(3)).join(', ');

      xrayEl.innerHTML = `
        <div class="xray-container">
          <div class="xray-header">
            <h4>X-Ray State Space Arithmetic &mdash; Step ${stepData.step}: token "${stepData.token}"</h4>
            <span class="xray-pill">Scalar input x<sub>t</sub> = ${stepData.xVal.toFixed(3)}</span>
          </div>
          <div class="xray-grid">
            <div class="xray-card">
              <h5>1. Input-Dependent Parameters</h5>
              <div class="xray-item"><span class="lbl">B<sub>t</sub>:</span> [${bStr}]</div>
              <div class="xray-item"><span class="lbl">C<sub>t</sub>:</span> [${cStr}]</div>
              <div class="xray-item"><span class="lbl">&Delta;<sub>t</sub>:</span> ${stepData.delta.toFixed(3)} (Softplus projected)</div>
            </div>
            <div class="xray-card">
              <h5>2. ZOH Discretization</h5>
              <div class="xray-item"><span class="lbl">A&#772;<sub>t</sub> = exp(&Delta;<sub>t</sub> A):</span> [${aBarStr}]</div>
              <div class="xray-item"><span class="lbl">B&#772;<sub>t</sub> = ((exp(&Delta;<sub>t</sub> A) - I) / A) B<sub>t</sub>:</span> [${bBarStr}]</div>
            </div>
            <div class="xray-card">
              <h5>3. Recurrence State Evolution</h5>
              <div class="xray-item"><span class="lbl">Decayed Past State (A&#772;<sub>t</sub> h<sub>t-1</sub>):</span> [${decayStr}]</div>
              <div class="xray-item"><span class="lbl">New Input Influx (B&#772;<sub>t</sub> x<sub>t</sub>):</span> [${inputStr}]</div>
              <div class="xray-item"><span class="lbl">Next State h<sub>t</sub>:</span> [${hNextStr}]</div>
            </div>
            <div class="xray-card">
              <h5>4. Output Readout</h5>
              <div class="xray-item"><span class="lbl">y<sub>t</sub> = C<sub>t</sub> &middot; h<sub>t</sub> + D x<sub>t</sub>:</span> <strong>${stepData.yVal.toFixed(4)}</strong></div>
            </div>
          </div>
        </div>
      `;
    }
  }

  private renderParallelScan() {
    const treeEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-tree-diagram]'
    );
    const mathEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-assoc-math]'
    );

    if (mathEl) {
      mathEl.innerHTML = `
        <div class="assoc-math-box">
          <h4>Blelloch Parallel Associative Prefix Scan</h4>
          <div class="assoc-formula">
            <code>(h<sub>j</sub>, A&#772;<sub>j</sub>) &comp; (h<sub>i</sub>, A&#772;<sub>i</sub>) = (A&#772;<sub>j</sub> h<sub>i</sub> + h<sub>j</sub>, A&#772;<sub>j</sub> A&#772;<sub>i</sub>)</code>
          </div>
          <p class="assoc-desc">
            Associativity permits computing all sequence states in <strong>O(log T)</strong> parallel GPU steps across <strong>${Math.ceil(Math.log2(Math.max(1, this.state.tokens.length)))}</strong> reduction levels, unifying Transformer training parallelism with SSM linear inference.
          </p>
        </div>
      `;
    }

    if (treeEl && this.state.parallelScanResult) {
      const { tree } = this.state.parallelScanResult;
      const levelsMap = new Map<number, ParallelScanNode[]>();
      tree.forEach((node) => {
        if (!levelsMap.has(node.level)) {
          levelsMap.set(node.level, []);
        }
        levelsMap.get(node.level)!.push(node);
      });

      const sortedLevels = Array.from(levelsMap.keys()).sort((a, b) => a - b);

      const rows = sortedLevels
        .map((lvl) => {
          const nodes = levelsMap.get(lvl)!;
          const stride = 1 << Math.max(0, lvl - 1);
          const nodeCards = nodes
            .map((node) => {
              const isCombined = lvl > 0 && node.stepIdx >= stride;
              const hNorm = Math.sqrt(
                node.bSum.reduce((acc, v) => acc + v * v, 0)
              ).toFixed(2);
              return `
                <div class="tree-node ${isCombined ? 'node-combined' : 'node-leaf'}" title="Span [t_${node.span[0]}..t_${node.span[1]}], ||h|| = ${hNorm}">
                  <span class="node-span">[t<sub>${node.span[0]}</sub>&hellip;t<sub>${node.span[1]}</sub>]</span>
                  <span class="node-idx">Step ${node.stepIdx}</span>
                  <span class="node-val">||h|| = ${hNorm}</span>
                </div>
              `;
            })
            .join('');

          return `
            <div class="tree-level-row" data-level="${lvl}">
              <div class="tree-level-label">
                <span class="lvl-title">Level ${lvl}</span>
                <span class="lvl-stride">${lvl === 0 ? 'Leaf Projections' : `Stride 2^${lvl - 1} = ${stride}`}</span>
              </div>
              <div class="tree-nodes-row">
                ${nodeCards}
              </div>
            </div>
          `;
        })
        .join('');

      treeEl.innerHTML = `<div class="parallel-tree-container">${rows}</div>`;
    }
  }

  private renderZOH() {
    const valEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-delta-val]'
    );
    if (valEl) {
      valEl.textContent = this.state.zohDelta.toFixed(2);
    }

    const sliderEl = this.container.querySelector<HTMLInputElement>(
      '[data-mamba-delta-slider]'
    );
    if (sliderEl && parseFloat(sliderEl.value) !== this.state.zohDelta) {
      sliderEl.value = this.state.zohDelta.toString();
    }

    const matrixEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-a-bar-matrix]'
    );
    if (matrixEl) {
      const N = this.state.config.dState;
      const A_diag = initializeDiagonalA(N);
      const delta = this.state.zohDelta;

      const items = A_diag.map((an, idx) => {
        const aBar = Math.exp(delta * an);
        const contractionPct = ((1 - aBar) * 100).toFixed(1);
        const halfLife = (Math.log(2) / (delta * Math.abs(an))).toFixed(2);
        return `
          <div class="a-bar-card" data-dim="${idx}">
            <div class="a-bar-title">Dimension n = ${idx}</div>
            <div class="a-bar-continuous">Continuous A<sub>n</sub> = ${an}</div>
            <div class="a-bar-discrete">Discrete A&#772;<sub>n</sub> = ${aBar.toFixed(4)}</div>
            <div class="a-bar-progress">
              <div class="a-bar-fill" style="width: ${(aBar * 100).toFixed(1)}%;"></div>
            </div>
            <div class="a-bar-meta">
              <span>Decay: ${contractionPct}%</span>
              <span>Half-life: &tau; = ${halfLife} steps</span>
            </div>
          </div>
        `;
      }).join('');

      matrixEl.innerHTML = `
        <div class="a-bar-matrix-grid">
          ${items}
        </div>
      `;
    }
  }

  private renderBenchmark() {
    const valEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-benchmark-val]'
    );
    const len = this.state.benchmarkSeqLen;
    const kLabel = len >= 1024 ? `${(len / 1024).toFixed(0)}k` : `${len}`;
    if (valEl) {
      valEl.textContent = `${len.toLocaleString()} tokens (${kLabel})`;
    }

    const sliderEl = this.container.querySelector<HTMLInputElement>(
      '[data-mamba-benchmark-slider]'
    );
    if (sliderEl && parseInt(sliderEl.value, 10) !== len) {
      sliderEl.value = len.toString();
    }

    const benchmark: MambaBenchmark = calculateMambaMemoryBenchmark(
      len,
      this.state.config.dModel,
      this.state.config.dState,
      this.state.benchmarkNumLayers,
      this.state.benchmarkPrecisionBytes
    );

    const readoutEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-benchmark-readout]'
    );
    if (readoutEl) {
      readoutEl.innerHTML = `
        <div class="benchmark-readout-grid">
          <div class="bench-stat ssm">
            <span class="bench-lbl">Mamba SSM State</span>
            <span class="bench-val">${benchmark.mambaFormatted}</span>
            <span class="bench-badge">O(1) Constant Footprint</span>
          </div>
          <div class="bench-stat transformer">
            <span class="bench-lbl">Transformer KV Cache</span>
            <span class="bench-val">${benchmark.transformerFormatted}</span>
            <span class="bench-badge">O(N) Linear Scaling</span>
          </div>
          <div class="bench-stat advantage">
            <span class="bench-lbl">Memory Advantage</span>
            <span class="bench-val">${benchmark.ratio}</span>
            <span class="bench-badge">Smaller Memory Footprint</span>
          </div>
        </div>
      `;
    }

    const chartEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-kv-vs-ssm-chart]'
    );
    if (chartEl) {
      const maxBytes = Math.max(
        benchmark.mambaStateBytes,
        benchmark.transformerKvBytes
      );
      const mambaPct = Math.max(
        2,
        (benchmark.mambaStateBytes / maxBytes) * 100
      ).toFixed(1);
      const transformerPct = (
        (benchmark.transformerKvBytes / maxBytes) *
        100
      ).toFixed(1);

      chartEl.innerHTML = `
        <div class="bench-chart-container">
          <div class="bench-bar-group">
            <div class="bench-bar-label">
              <span>Mamba SSM: ${benchmark.mambaFormatted}</span>
            </div>
            <div class="bench-track">
              <div class="bench-fill ssm-fill" style="width: ${mambaPct}%;"></div>
            </div>
          </div>
          <div class="bench-bar-group">
            <div class="bench-bar-label">
              <span>Transformer KV Cache: ${benchmark.transformerFormatted}</span>
            </div>
            <div class="bench-track">
              <div class="bench-fill kv-fill" style="width: ${transformerPct}%;"></div>
            </div>
          </div>
        </div>
      `;
    }
  }

  private renderHyperparameters() {
    const updateVal = (selector: string, val: string | number) => {
      const el = this.container.querySelector<HTMLElement>(selector);
      if (el) el.textContent = val.toString();
    };

    updateVal('[data-mamba-d-model-val]', this.state.config.dModel);
    updateVal('[data-mamba-d-state-val]', this.state.config.dState);
    updateVal('[data-mamba-d-conv-val]', this.state.config.dConv);
    updateVal('[data-mamba-expand-val]', this.state.config.expand);
  }

  private renderStats() {
    const { config, tokens } = this.state;
    const seqLen = tokens.length;
    const params: MambaParams = calculateMambaParams(
      config,
      this.state.benchmarkNumLayers
    );
    const flops: MambaFlops = calculateMambaFlops(seqLen, config);
    const stateBytesPerLayer = config.dModel * config.dState * 2;

    const paramsEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-params-total]'
    );
    if (paramsEl) {
      paramsEl.textContent = `${formatNumber(params.modelTotal)} params (${formatNumber(params.layerTotal)} / layer)`;
    }

    const flopsEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-flops-total]'
    );
    if (flopsEl) {
      flopsEl.textContent = `${formatFlops(flops.totalLayerFlops)} / layer`;
    }

    const memoryEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-memory-total]'
    );
    if (memoryEl) {
      memoryEl.textContent = `${formatBytes(stateBytesPerLayer)} / layer`;
    }
  }

  private renderPyTorch() {
    const codeEl = this.container.querySelector<HTMLElement>(
      '[data-mamba-pytorch-code]'
    );
    if (!codeEl) return;
    codeEl.textContent = generateMambaPyTorchSnippet(this.state.config);
  }
}

/**
 * Initializes the Mamba Interactive Studio on root or document.
 * Returns the controller instance or null if container element is not found.
 */
export function initMambaStudio(
  root?: ParentNode
): MambaStudioController | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  if ((window as any).__mambaStudioInitialized && !root) {
    return (window as any).__activeMambaStudio ?? null;
  }

  const searchRoot = root ?? document;
  let container: HTMLElement | null = null;
  const anyRoot = searchRoot as any;

  if (
    anyRoot?.dataset?.mambaStudio !== undefined ||
    anyRoot?.id === 'mamba-studio-root' ||
    (typeof anyRoot?.getAttribute === 'function' &&
      anyRoot.getAttribute('data-mamba-studio') !== null) ||
    (typeof anyRoot?.matches === 'function' &&
      anyRoot.matches('[data-mamba-studio], #mamba-studio-root'))
  ) {
    container = anyRoot as HTMLElement;
  } else if (typeof searchRoot.querySelector === 'function') {
    container = searchRoot.querySelector<HTMLElement>(
      '[data-mamba-studio], #mamba-studio-root'
    );
  }

  if (!container) {
    return null;
  }

  const controller = new MambaStudioController(container);
  (window as any).__activeMambaStudio = controller;
  (window as any).__mambaStudioInitialized = true;
  return controller;
}

// Auto-initialize lifecycle hook
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const boot = () => {
    if ((window as any).__mambaStudioInitialized) {
      const container = document.querySelector<HTMLElement>(
        '[data-mamba-studio], #mamba-studio-root'
      );
      if (!container || container.dataset.mambaStudioReady === 'true') {
        return;
      }
    }
    initMambaStudio();
  };

  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('astro:page-load', () => {
    if ((window as any).__activeMambaStudio) {
      (window as any).__activeMambaStudio.destroy();
      (window as any).__activeMambaStudio = null;
    }
    (window as any).__mambaStudioInitialized = false;
    boot();
  });

  if (document.readyState !== 'loading') {
    boot();
  }
}
