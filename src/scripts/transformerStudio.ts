/**
 * Transformer Layer Interactive Studio Client Controller
 *
 * Drives the interactive attention heatmap, X-Ray arithmetic dot-product drawer,
 * GQA/MQA head grouping visualizer, forward pass step-by-step playback engine,
 * domain presets (NLP Winograd / Genomics promoter & enhancer), real-time
 * architectural switcher (Classical Vaswani vs Modern LLaMA), live hyperparameter
 * sliders, stat cards (Parameters, FLOPs, KV Cache), and live PyTorch generator.
 */

import {
  calculateAttention,
  computeGQAHeadMapping,
  applyRoPE,
  applySinusoidalPositionalEncoding,
  calculateTransformerParams,
  calculateTransformerFlops,
  calculateKVCacheMemory,
  generateTransformerPyTorchSnippet,
  type TransformerConfig,
  type AttentionResult,
  type GqaMapping,
  type TransformerParams,
  type TransformerFlops,
  type KvCacheMemory,
} from '../lib/transformerCore';

declare global {
  interface Window {
    __transformerStudioInitialized?: boolean;
    __activeTransformerStudio?: TransformerStudioController | null;
  }
}

export interface PipelineStageInfo {
  id: string;
  name: string;
  badge: string;
  formula: string;
  description: string;
}

export const PIPELINE_STAGES: PipelineStageInfo[] = [
  {
    id: 'tokens',
    name: 'Tokens',
    badge: '1/8: Input Token Embeddings',
    formula: 'X \\in \\mathbb{R}^{N \\times d_{\\text{model}}}',
    description: 'Discrete input sequence mapped to continuous d-dimensional embedding vectors.',
  },
  {
    id: 'qkv',
    name: 'QKV Linear',
    badge: '2/8: Linear Projections',
    formula: 'Q = X W_Q, \\quad K = X W_K, \\quad V = X W_V',
    description: 'Projects input representations into Query, Key, and Value subspaces.',
  },
  {
    id: 'scaled_dot',
    name: 'Scaled Dot-Product',
    badge: '3/8: Scaled Dot-Product Scores',
    formula: 'S = \\frac{Q K^T}{\\sqrt{d_k}}',
    description: 'Computes pairwise compatibility matrix divided by temperature scale \\sqrt{d_k}.',
  },
  {
    id: 'softmax',
    name: 'Softmax Weights',
    badge: '4/8: Softmax Attention Weights',
    formula: 'A = \\text{softmax}(S + M)',
    description: 'Row-wise exponentiation and normalization with causal lower-triangular masking.',
  },
  {
    id: 'context',
    name: 'Context AV',
    badge: '5/8: Context Aggregation',
    formula: 'C = A V',
    description: 'Linearly blends Value vectors weighted by attention probability coefficients.',
  },
  {
    id: 'out_proj',
    name: 'Output Wo',
    badge: '6/8: Output Linear Projection',
    formula: 'H = C W_O',
    description: 'Multi-head output projection maps aggregated representations back to d_{model}.',
  },
  {
    id: 'add_norm',
    name: 'Add & Norm',
    badge: '7/8: Residual Add & Normalization',
    formula: "X' = \\text{Norm}(X + H)",
    description: 'Residual skip connection preserves gradient flow followed by RMSNorm or LayerNorm.',
  },
  {
    id: 'mlp',
    name: 'MLP / SwiGLU',
    badge: '8/8: Feed-Forward Network',
    formula: "Y = \\text{FFN}(X') = W_2(\\text{SiLU}(W_1 X') \\odot W_3 X')",
    description: 'Position-wise feed-forward block using SwiGLU gating or standard 2-layer MLP.',
  },
];

export interface TransformerPreset {
  id: string;
  name: string;
  domain: 'nlp' | 'genomics';
  description: string;
  text: string;
  tokens: string[];
}

export const TRANSFORMER_PRESETS: Record<string, TransformerPreset> = {
  nlpWinograd: {
    id: 'nlpWinograd',
    name: 'Winograd Coreference',
    domain: 'nlp',
    description: "Pronoun 'it' disambiguation attending strongly to antecedent 'animal'.",
    text: "The animal didn't cross the street because it was too tired",
    tokens: ['The', 'animal', "didn't", 'cross', 'the', 'street', 'because', 'it', 'was', 'too', 'tired'],
  },
  nlpAttention: {
    id: 'nlpAttention',
    name: 'Attention Is All You Need',
    domain: 'nlp',
    description: 'Foundational 2017 landmark paper title sequence.',
    text: 'Attention is all you need',
    tokens: ['Attention', 'is', 'all', 'you', 'need'],
  },
  dnaPromoter: {
    id: 'dnaPromoter',
    name: 'TATA Promoter & Splice Sites',
    domain: 'genomics',
    description: 'TATA box promoter sequence flanked by canonical splice site motifs.',
    text: 'TATAAA CGCTAG ATCGAA AGGT AGTC',
    tokens: ['TATAAA', 'CGCTAG', 'ATCGAA', 'AGGT', 'AGTC'],
  },
  dnaEnhancer: {
    id: 'dnaEnhancer',
    name: 'GC-box Sp1 Enhancer Interaction',
    domain: 'genomics',
    description: 'Sp1 zinc-finger transcription factor binding site interaction with distal enhancer.',
    text: 'GC-box Sp1 Enhancer Interaction',
    tokens: ['GC-box', 'Sp1', 'Enhancer', 'Interaction'],
  },
};

export interface TransformerStudioState {
  config: TransformerConfig;
  tokens: string[];
  activePresetKey: string;
  customText: string;
  currentStageIndex: number;
  isPlaying: boolean;
  playbackSpeed: number; // ms
  activeHeadIdx: number;
  selectedCell: { i: number; j: number } | null;
  hoveredCell: { i: number; j: number } | null;
  hoveredTokenIdx: number | null;
  attentionResult: AttentionResult | null;
  architecture: 'classical' | 'modern';
  numLayers: number;
  precisionBytes: number;
}

/**
 * Deterministic pseudo-random token vector generator.
 * Produces reproducible, normalized float vectors for interactive arithmetic inspection.
 */
export function generateTokenVector(token: string, tokenIdx: number, role: 'Q' | 'K' | 'V', dim: number): number[] {
  const vec: number[] = [];
  let hash = (tokenIdx + 1) * 31;
  for (let c = 0; c < token.length; c++) {
    hash = (hash * 37 + token.charCodeAt(c)) & 0x7fffffff;
  }
  const roleOffset = role === 'Q' ? 1.1 : role === 'K' ? 2.3 : 3.7;

  for (let d = 0; d < dim; d++) {
    const angle = ((hash + d * 17) % 1000) / 1000 * 2 * Math.PI + roleOffset;
    const val = Math.sin(angle) * Math.cos(d + roleOffset);
    vec.push(Number(val.toFixed(3)));
  }
  return vec;
}

/**
 * Generates synthetic Q, K, V matrices for tokens with semantic affinity for canonical presets.
 */
export function generateSyntheticQKV(tokens: string[], dHead: number): { Q: number[][]; K: number[][]; V: number[][] } {
  const N = tokens.length;
  const Q: number[][] = [];
  const K: number[][] = [];
  const V: number[][] = [];

  for (let i = 0; i < N; i++) {
    Q.push(generateTokenVector(tokens[i], i, 'Q', dHead));
    K.push(generateTokenVector(tokens[i], i, 'K', dHead));
    V.push(generateTokenVector(tokens[i], i, 'V', dHead));
  }

  // Winograd semantic affinity: 'it' (idx 7) attends to 'animal' (idx 1)
  const animalIdx = tokens.findIndex((t) => t.toLowerCase() === 'animal');
  const itIdx = tokens.findIndex((t) => t.toLowerCase() === 'it');
  if (animalIdx !== -1 && itIdx !== -1) {
    for (let d = 0; d < dHead; d++) {
      Q[itIdx][d] = Number((K[animalIdx][d] * 1.5 + (d % 2 === 0 ? 0.3 : -0.2)).toFixed(3));
    }
  }

  // Genomics promoter affinity: 'TATAAA' attends to downstream motifs
  const tataIdx = tokens.findIndex((t) => t.toUpperCase() === 'TATAAA');
  if (tataIdx !== -1) {
    for (let d = 0; d < dHead; d++) {
      Q[tataIdx][d] = Number((K[tataIdx][d] * 1.3).toFixed(3));
    }
  }

  return { Q, K, V };
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

export class TransformerStudioController {
  private container: HTMLElement;
  private state: TransformerStudioState;
  private playbackTimer: any = null;
  private boundListeners: Array<{ el: EventTarget; event: string; fn: EventListenerOrEventListenerObject }> = [];

  constructor(container: HTMLElement) {
    this.container = container;

    // Modern LLaMA default configuration
    const initialConfig: TransformerConfig = {
      dModel: 64,
      numHeads: 4,
      numKvHeads: 2,
      dHead: 16,
      dFfn: 256,
      normType: 'rmsnorm',
      normPosition: 'pre',
      posEncoding: 'rope',
      ffnType: 'swiglu',
      maskType: 'causal',
      hasBias: false,
    };

    const initialTokens = [...TRANSFORMER_PRESETS.nlpWinograd.tokens];

    this.state = {
      config: initialConfig,
      tokens: initialTokens,
      activePresetKey: 'nlpWinograd',
      customText: TRANSFORMER_PRESETS.nlpWinograd.text,
      currentStageIndex: 0,
      isPlaying: false,
      playbackSpeed: 1200,
      activeHeadIdx: 0,
      selectedCell: { i: 0, j: 0 },
      hoveredCell: null,
      hoveredTokenIdx: null,
      attentionResult: null,
      architecture: 'modern',
      numLayers: 12,
      precisionBytes: 2,
    };

    this.recomputeAttention();
    this.bindEvents();
    this.renderAll();
    this.container.dataset.transformerStudioReady = 'true';
  }

  public getState(): TransformerStudioState {
    return {
      ...this.state,
      config: { ...this.state.config },
      tokens: [...this.state.tokens],
      selectedCell: this.state.selectedCell ? { ...this.state.selectedCell } : null,
      hoveredCell: this.state.hoveredCell ? { ...this.state.hoveredCell } : null,
    };
  }

  private addListener(el: EventTarget | null, event: string, fn: EventListenerOrEventListenerObject) {
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
    this.container.dataset.transformerStudioReady = 'false';
    if (typeof window !== 'undefined') {
      window.__transformerStudioInitialized = false;
      if (window.__activeTransformerStudio === this) {
        window.__activeTransformerStudio = null;
      }
    }
  }

  /**
   * Recomputes attention scores, weights, context, and arithmetic traces
   */
  public recomputeAttention() {
    const { config, tokens } = this.state;
    let { Q, K, V } = generateSyntheticQKV(tokens, config.dHead);

    // Apply positional embeddings
    if (config.posEncoding === 'rope') {
      const ropeRes = applyRoPE(Q, K);
      Q = ropeRes.Q_rot;
      K = ropeRes.K_rot;
    } else if (config.posEncoding === 'sinusoidal') {
      Q = applySinusoidalPositionalEncoding(Q);
      K = applySinusoidalPositionalEncoding(K);
    }

    const attentionResult = calculateAttention(Q, K, V, config.dHead, config.maskType);
    this.state.attentionResult = attentionResult;

    // Validate selected cell coordinates within bounds
    const N = tokens.length;
    if (this.state.selectedCell) {
      if (this.state.selectedCell.i >= N || this.state.selectedCell.j >= N) {
        this.state.selectedCell = { i: 0, j: 0 };
      }
    } else if (N > 0) {
      this.state.selectedCell = { i: 0, j: 0 };
    }
  }

  // ==========================================
  // Public Control API
  // ==========================================

  public setPreset(presetKey: string) {
    const preset = TRANSFORMER_PRESETS[presetKey];
    if (!preset) return;
    this.state.activePresetKey = presetKey;
    this.state.tokens = [...preset.tokens];
    this.state.customText = preset.text;
    this.state.selectedCell = { i: 0, j: 0 };
    this.recomputeAttention();
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
      tokens = ['Token1', 'Token2', 'Token3'];
    }

    // Limit tokens to max 24 for UI clarity
    if (tokens.length > 24) {
      tokens = tokens.slice(0, 24);
    }

    this.state.tokens = tokens;
    this.state.activePresetKey = 'custom';
    this.state.selectedCell = { i: 0, j: 0 };
    this.recomputeAttention();
    this.renderAll();
  }

  public setConfig(partialConfig: Partial<TransformerConfig>) {
    const newConfig = { ...this.state.config, ...partialConfig };

    // Maintain mathematical invariants
    if (newConfig.dModel < 8) newConfig.dModel = 8;
    if (newConfig.numHeads < 1) newConfig.numHeads = 1;
    if (newConfig.numKvHeads < 1) newConfig.numKvHeads = 1;
    if (newConfig.numKvHeads > newConfig.numHeads) {
      newConfig.numKvHeads = newConfig.numHeads;
    }
    newConfig.dHead = Math.max(1, Math.floor(newConfig.dModel / newConfig.numHeads));

    this.state.config = newConfig;
    this.recomputeAttention();
    this.renderAll();
  }

  public setHeadMode(mode: 'mha' | 'gqa' | 'mqa') {
    const { numHeads } = this.state.config;
    let numKvHeads = numHeads;

    if (mode === 'mha') {
      numKvHeads = numHeads;
    } else if (mode === 'gqa') {
      numKvHeads = Math.max(1, Math.min(numHeads - 1, Math.floor(numHeads / 2)));
      if (numKvHeads === numHeads && numHeads > 1) {
        numKvHeads = numHeads - 1;
      }
    } else if (mode === 'mqa') {
      numKvHeads = 1;
    }

    this.setConfig({ numKvHeads });
  }

  public setArchitecture(arch: 'classical' | 'modern') {
    this.state.architecture = arch;

    if (arch === 'classical') {
      this.setConfig({
        normType: 'layernorm',
        normPosition: 'post',
        posEncoding: 'sinusoidal',
        ffnType: 'standard',
        maskType: 'none',
        hasBias: true,
        numKvHeads: this.state.config.numHeads, // Classical is MHA
      });
    } else {
      this.setConfig({
        normType: 'rmsnorm',
        normPosition: 'pre',
        posEncoding: 'rope',
        ffnType: 'swiglu',
        maskType: 'causal',
        hasBias: false,
        numKvHeads: Math.max(1, Math.floor(this.state.config.numHeads / 2)), // Modern is GQA
      });
    }
  }

  public selectCell(i: number, j: number) {
    const N = this.state.tokens.length;
    if (i >= 0 && i < N && j >= 0 && j < N) {
      this.state.selectedCell = { i, j };
      this.renderHeatmap();
      this.renderXRay();
    }
  }

  public setHoveredCell(cell: { i: number; j: number } | null) {
    this.state.hoveredCell = cell;
    this.renderHeatmapHighlights();
  }

  public setHoveredToken(tokenIdx: number | null) {
    this.state.hoveredTokenIdx = tokenIdx;
    this.renderHeatmapHighlights();
  }

  public stepForward() {
    this.state.currentStageIndex = (this.state.currentStageIndex + 1) % PIPELINE_STAGES.length;
    this.renderStage();
  }

  public stepBackward() {
    this.state.currentStageIndex =
      (this.state.currentStageIndex - 1 + PIPELINE_STAGES.length) % PIPELINE_STAGES.length;
    this.renderStage();
  }

  public setStage(stageIdx: number) {
    if (stageIdx >= 0 && stageIdx < PIPELINE_STAGES.length) {
      this.state.currentStageIndex = stageIdx;
      this.renderStage();
    }
  }

  public play() {
    if (this.state.isPlaying) return;
    this.state.isPlaying = true;
    this.renderPlaybackButtons();
    this.playbackTimer = setInterval(() => {
      this.stepForward();
    }, this.state.playbackSpeed);
  }

  public pause() {
    if (!this.state.isPlaying) return;
    this.state.isPlaying = false;
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
    this.renderPlaybackButtons();
  }

  public reset() {
    this.pause();
    this.state.currentStageIndex = 0;
    this.renderStage();
  }

  public setPlaybackSpeed(speedMs: number) {
    this.state.playbackSpeed = speedMs;
    if (this.state.isPlaying) {
      this.pause();
      this.play();
    }
  }

  public async copyPyTorchCode(): Promise<boolean> {
    const code = generateTransformerPyTorchSnippet(this.state.config);
    let success = false;

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(code);
        success = true;
      } catch {
        success = false;
      }
    }

    if (!success && typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        success = false;
      }
    }

    const copyBtn = this.container.querySelector<HTMLElement>('[data-transformer-copy-pytorch]');
    if (copyBtn) {
      const originalText = copyBtn.textContent || 'Copy PyTorch Code';
      copyBtn.textContent = success ? 'Copied!' : 'Copy Failed';
      setTimeout(() => {
        copyBtn.textContent = originalText;
      }, 2000);
    }

    return success;
  }

  // ==========================================
  // Event Binding
  // ==========================================

  private bindEvents() {
    // Preset buttons
    const presetBtns = this.container.querySelectorAll<HTMLElement>('[data-transformer-preset]');
    presetBtns.forEach((btn) => {
      this.addListener(btn, 'click', () => {
        const key = btn.dataset.transformerPreset;
        if (key) this.setPreset(key);
      });
    });

    // Custom input
    const customInput = this.container.querySelector<HTMLInputElement>('[data-transformer-custom-input]');
    if (customInput) {
      this.addListener(customInput, 'change', () => {
        this.setCustomTokens(customInput.value);
      });
      this.addListener(customInput, 'keydown', (e: Event) => {
        if ((e as KeyboardEvent).key === 'Enter') {
          this.setCustomTokens(customInput.value);
        }
      });
    }

    // Playback buttons
    const playBtn = this.container.querySelector<HTMLElement>('[data-transformer-play]');
    if (playBtn) {
      this.addListener(playBtn, 'click', () => {
        if (this.state.isPlaying) {
          this.pause();
        } else {
          this.play();
        }
      });
    }

    const nextBtn = this.container.querySelector<HTMLElement>('[data-transformer-next]');
    if (nextBtn) {
      this.addListener(nextBtn, 'click', () => this.stepForward());
    }

    const prevBtn = this.container.querySelector<HTMLElement>('[data-transformer-prev]');
    if (prevBtn) {
      this.addListener(prevBtn, 'click', () => this.stepBackward());
    }

    const resetBtn = this.container.querySelector<HTMLElement>('[data-transformer-reset]');
    if (resetBtn) {
      this.addListener(resetBtn, 'click', () => this.reset());
    }

    const speedEl = this.container.querySelector<HTMLInputElement | HTMLSelectElement>(
      '[data-transformer-speed]'
    );
    if (speedEl) {
      this.addListener(speedEl, 'change', () => {
        const val = Number(speedEl.value);
        if (!isNaN(val) && val > 0) {
          this.setPlaybackSpeed(val);
        }
      });
    }

    // Head Mode buttons (MHA, GQA, MQA)
    const headModeBtns = this.container.querySelectorAll<HTMLElement>('[data-transformer-head-mode]');
    headModeBtns.forEach((btn) => {
      this.addListener(btn, 'click', () => {
        const mode = btn.dataset.transformerHeadMode as 'mha' | 'gqa' | 'mqa';
        if (mode) this.setHeadMode(mode);
      });
    });

    // Architecture buttons (classical vs modern)
    const archClassicalBtn = this.container.querySelector<HTMLElement>(
      '[data-transformer-arch-btn="classical"]'
    );
    if (archClassicalBtn) {
      this.addListener(archClassicalBtn, 'click', () => this.setArchitecture('classical'));
    }

    const archModernBtn = this.container.querySelector<HTMLElement>(
      '[data-transformer-arch-btn="modern"]'
    );
    if (archModernBtn) {
      this.addListener(archModernBtn, 'click', () => this.setArchitecture('modern'));
    }

    // Select dropdowns
    const normSelect = this.container.querySelector<HTMLSelectElement>('[data-transformer-norm-type]');
    if (normSelect) {
      this.addListener(normSelect, 'change', () => {
        this.setConfig({ normType: normSelect.value as 'rmsnorm' | 'layernorm' });
      });
    }

    const posSelect = this.container.querySelector<HTMLSelectElement>('[data-transformer-pos-encoding]');
    if (posSelect) {
      this.addListener(posSelect, 'change', () => {
        this.setConfig({ posEncoding: posSelect.value as 'rope' | 'sinusoidal' | 'none' });
      });
    }

    const maskSelect = this.container.querySelector<HTMLSelectElement>('[data-transformer-mask-type]');
    if (maskSelect) {
      this.addListener(maskSelect, 'change', () => {
        this.setConfig({ maskType: maskSelect.value as 'causal' | 'none' });
      });
    }

    // Sliders
    const bindSlider = (
      selector: string,
      onChange: (val: number) => void
    ) => {
      const slider = this.container.querySelector<HTMLInputElement>(selector);
      if (slider) {
        const handler = () => {
          const val = Number(slider.value);
          if (!isNaN(val)) onChange(val);
        };
        this.addListener(slider, 'input', handler);
        this.addListener(slider, 'change', handler);
      }
    };

    bindSlider('[data-transformer-seq-len]', (val) => {
      // Adjust tokens count
      if (val !== this.state.tokens.length) {
        if (val < this.state.tokens.length) {
          this.state.tokens = this.state.tokens.slice(0, val);
        } else {
          const added = Array.from(
            { length: val - this.state.tokens.length },
            (_, idx) => `Tok${this.state.tokens.length + idx + 1}`
          );
          this.state.tokens = [...this.state.tokens, ...added];
        }
        this.recomputeAttention();
        this.renderAll();
      }
    });

    bindSlider('[data-transformer-d-model]', (val) => {
      this.setConfig({ dModel: val });
    });

    bindSlider('[data-transformer-num-heads]', (val) => {
      this.setConfig({ numHeads: val });
    });

    bindSlider('[data-transformer-kv-heads]', (val) => {
      this.setConfig({ numKvHeads: val });
    });

    bindSlider('[data-transformer-d-ffn]', (val) => {
      this.setConfig({ dFfn: val });
    });

    // Copy PyTorch button
    const copyBtn = this.container.querySelector<HTMLElement>('[data-transformer-copy-pytorch]');
    if (copyBtn) {
      this.addListener(copyBtn, 'click', () => this.copyPyTorchCode());
    }
  }

  // ==========================================
  // Rendering
  // ==========================================

  public renderAll() {
    this.renderPresets();
    this.renderTokenList();
    this.renderSlidersAndControls();
    this.renderStage();
    this.renderHeatmap();
    this.renderXRay();
    this.renderGqaDiagram();
    this.renderStats();
    this.renderPyTorch();
  }

  private renderPresets() {
    const presetBtns = this.container.querySelectorAll<HTMLElement>('[data-transformer-preset]');
    presetBtns.forEach((btn) => {
      const key = btn.dataset.transformerPreset;
      const isActive = key === this.state.activePresetKey;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    const customInput = this.container.querySelector<HTMLInputElement>('[data-transformer-custom-input]');
    if (customInput && customInput.value !== this.state.customText) {
      customInput.value = this.state.customText;
    }
  }

  private renderTokenList() {
    const listEl = this.container.querySelector<HTMLElement>('[data-transformer-token-list]');
    if (!listEl) return;

    listEl.innerHTML = '';
    this.state.tokens.forEach((token, idx) => {
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'transformer-token-badge';
      badge.dataset.tokenIdx = idx.toString();
      badge.textContent = token;
      badge.title = `Token #${idx}: ${token}`;

      if (this.state.hoveredTokenIdx === idx || this.state.selectedCell?.i === idx) {
        badge.classList.add('active');
      }

      badge.addEventListener('mouseenter', () => this.setHoveredToken(idx));
      badge.addEventListener('mouseleave', () => this.setHoveredToken(null));
      badge.addEventListener('click', () => this.selectCell(idx, idx));

      listEl.appendChild(badge);
    });
  }

  private renderSlidersAndControls() {
    const { config, tokens, architecture } = this.state;

    // Architecture buttons
    const archClassicalBtn = this.container.querySelector<HTMLElement>(
      '[data-transformer-arch-btn="classical"]'
    );
    if (archClassicalBtn) {
      const isClassical = architecture === 'classical';
      archClassicalBtn.classList.toggle('active', isClassical);
      archClassicalBtn.setAttribute('aria-pressed', isClassical ? 'true' : 'false');
    }

    const archModernBtn = this.container.querySelector<HTMLElement>(
      '[data-transformer-arch-btn="modern"]'
    );
    if (archModernBtn) {
      const isModern = architecture === 'modern';
      archModernBtn.classList.toggle('active', isModern);
      archModernBtn.setAttribute('aria-pressed', isModern ? 'true' : 'false');
    }

    // Head Mode buttons
    const headModeBtns = this.container.querySelectorAll<HTMLElement>('[data-transformer-head-mode]');
    const currentMode =
      config.numKvHeads === config.numHeads ? 'mha' : config.numKvHeads === 1 ? 'mqa' : 'gqa';
    headModeBtns.forEach((btn) => {
      const mode = btn.dataset.transformerHeadMode;
      const isActive = mode === currentMode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // Selects
    const normSelect = this.container.querySelector<HTMLSelectElement>('[data-transformer-norm-type]');
    if (normSelect && normSelect.value !== config.normType) normSelect.value = config.normType;

    const posSelect = this.container.querySelector<HTMLSelectElement>('[data-transformer-pos-encoding]');
    if (posSelect && posSelect.value !== config.posEncoding) posSelect.value = config.posEncoding;

    const maskSelect = this.container.querySelector<HTMLSelectElement>('[data-transformer-mask-type]');
    if (maskSelect && maskSelect.value !== config.maskType) maskSelect.value = config.maskType;

    // Sliders & Readouts
    const updateSliderVal = (selector: string, val: number, readoutSel: string, readoutText: string) => {
      const slider = this.container.querySelector<HTMLInputElement>(selector);
      if (slider && Number(slider.value) !== val) {
        slider.value = val.toString();
      }
      const readout = this.container.querySelector<HTMLElement>(readoutSel);
      if (readout) {
        readout.textContent = readoutText;
      }
    };

    updateSliderVal(
      '[data-transformer-seq-len]',
      tokens.length,
      '[data-transformer-seq-len-val]',
      `${tokens.length}`
    );
    updateSliderVal(
      '[data-transformer-d-model]',
      config.dModel,
      '[data-transformer-d-model-val]',
      `${config.dModel}`
    );
    updateSliderVal(
      '[data-transformer-num-heads]',
      config.numHeads,
      '[data-transformer-num-heads-val]',
      `${config.numHeads}`
    );
    updateSliderVal(
      '[data-transformer-kv-heads]',
      config.numKvHeads,
      '[data-transformer-kv-heads-val]',
      `${config.numKvHeads}`
    );
    updateSliderVal(
      '[data-transformer-d-ffn]',
      config.dFfn,
      '[data-transformer-d-ffn-val]',
      `${config.dFfn}`
    );
  }

  private renderPlaybackButtons() {
    const playBtn = this.container.querySelector<HTMLElement>('[data-transformer-play]');
    if (playBtn) {
      playBtn.textContent = this.state.isPlaying ? 'Pause' : 'Play';
      playBtn.setAttribute('aria-pressed', this.state.isPlaying ? 'true' : 'false');
    }
  }

  private renderStage() {
    const current = PIPELINE_STAGES[this.state.currentStageIndex];

    const badgeEl = this.container.querySelector<HTMLElement>('[data-transformer-stage-badge]');
    if (badgeEl) {
      badgeEl.textContent = current.badge;
    }

    const stepsContainer = this.container.querySelector<HTMLElement>('[data-transformer-pipeline-steps]');
    if (stepsContainer) {
      // If child elements exist, toggle active
      let stepEls = stepsContainer.querySelectorAll<HTMLElement>('[data-pipeline-step]');
      if (stepEls.length === 0) {
        // Build the 8 steps pills dynamically
        stepsContainer.innerHTML = '';
        PIPELINE_STAGES.forEach((stage, idx) => {
          const stepBtn = document.createElement('button');
          stepBtn.type = 'button';
          stepBtn.className = 'transformer-pipeline-pill';
          stepBtn.dataset.pipelineStep = idx.toString();
          stepBtn.textContent = stage.name;
          stepBtn.title = stage.badge;
          stepBtn.addEventListener('click', () => this.setStage(idx));
          stepsContainer.appendChild(stepBtn);
        });
        stepEls = stepsContainer.querySelectorAll<HTMLElement>('[data-pipeline-step]');
      }

      stepEls.forEach((el, idx) => {
        const isActive = idx === this.state.currentStageIndex;
        el.classList.toggle('active', isActive);
        el.setAttribute('aria-current', isActive ? 'step' : 'false');
        el.dataset.active = isActive ? 'true' : 'false';
      });
    }

    this.renderPlaybackButtons();
  }

  private renderHeatmap() {
    const heatmapEl = this.container.querySelector<HTMLElement>('[data-transformer-heatmap]');
    if (!heatmapEl || !this.state.attentionResult) return;

    const { weights } = this.state.attentionResult;
    const tokens = this.state.tokens;
    const N = tokens.length;

    heatmapEl.innerHTML = '';

    // Create table grid structure
    const table = document.createElement('table');
    table.className = 'transformer-heatmap-table';
    table.setAttribute('role', 'grid');

    // Header row (Keys j)
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const cornerTh = document.createElement('th');
    cornerTh.textContent = 'Q \\ K';
    cornerTh.className = 'heatmap-corner';
    headerRow.appendChild(cornerTh);

    for (let j = 0; j < N; j++) {
      const th = document.createElement('th');
      th.className = 'heatmap-col-header';
      th.dataset.colHeader = j.toString();
      th.textContent = tokens[j];
      th.title = `Key #${j}: ${tokens[j]}`;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body rows (Queries i)
    const tbody = document.createElement('tbody');
    for (let i = 0; i < N; i++) {
      const tr = document.createElement('tr');
      tr.dataset.row = i.toString();

      const rowHeader = document.createElement('th');
      rowHeader.className = 'heatmap-row-header';
      rowHeader.dataset.rowHeader = i.toString();
      rowHeader.textContent = tokens[i];
      rowHeader.title = `Query #${i}: ${tokens[i]}`;
      tr.appendChild(rowHeader);

      for (let j = 0; j < N; j++) {
        const weight = weights[i]?.[j] ?? 0;
        const td = document.createElement('td');
        td.className = 'transformer-heatmap-cell';
        td.dataset.cellI = i.toString();
        td.dataset.cellJ = j.toString();
        td.dataset.weight = weight.toFixed(4);
        td.setAttribute('role', 'gridcell');
        td.setAttribute('tabindex', '0');
        td.title = `Q[${i}] "${tokens[i]}" -> K[${j}] "${tokens[j]}": ${(weight * 100).toFixed(1)}%`;

        const isSelected = this.state.selectedCell?.i === i && this.state.selectedCell?.j === j;
        if (isSelected) {
          td.classList.add('selected');
        }

        // Color intensity
        td.style.backgroundColor = `rgba(59, 130, 246, ${Math.max(0.04, weight).toFixed(3)})`;
        td.textContent = (weight * 100).toFixed(0) + '%';

        td.addEventListener('mouseenter', () => this.setHoveredCell({ i, j }));
        td.addEventListener('mouseleave', () => this.setHoveredCell(null));
        td.addEventListener('click', () => this.selectCell(i, j));

        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    heatmapEl.appendChild(table);
  }

  private renderHeatmapHighlights() {
    const heatmapEl = this.container.querySelector<HTMLElement>('[data-transformer-heatmap]');
    if (!heatmapEl) return;

    const { hoveredCell, hoveredTokenIdx } = this.state;

    const cells = heatmapEl.querySelectorAll<HTMLElement>('[data-cell-i]');
    cells.forEach((cell) => {
      const i = Number(cell.dataset.cellI);
      const j = Number(cell.dataset.cellJ);

      let isHighlightRow = false;
      let isHighlightCol = false;

      if (hoveredCell) {
        isHighlightRow = i === hoveredCell.i;
        isHighlightCol = j === hoveredCell.j;
      } else if (hoveredTokenIdx !== null) {
        isHighlightRow = i === hoveredTokenIdx;
        isHighlightCol = j === hoveredTokenIdx;
      }

      cell.classList.toggle('highlight-row', isHighlightRow);
      cell.classList.toggle('highlight-col', isHighlightCol);
    });
  }

  private renderXRay() {
    const xrayEl = this.container.querySelector<HTMLElement>('[data-transformer-xray]');
    if (!xrayEl || !this.state.attentionResult) return;

    const { selectedCell, tokens, config } = this.state;
    if (!selectedCell) {
      xrayEl.innerHTML = '<p class="xray-placeholder">Click any attention matrix cell to inspect dot product arithmetic.</p>';
      return;
    }

    const { i, j } = selectedCell;
    const qTok = tokens[i] ?? `Tok[${i}]`;
    const kTok = tokens[j] ?? `Tok[${j}]`;

    const trace = this.state.attentionResult.traces.find(
      (t) => t.qTokenIdx === i && t.kTokenIdx === j
    );

    const rawScore = trace?.rawDotProduct ?? 0;
    const scaledScore = trace?.scaledScore ?? 0;
    const weight = trace?.attentionWeight ?? 0;
    const mults = trace?.multiplications ?? [];
    const isCausalMasked = config.maskType === 'causal' && j > i;

    // Build the mathematical breakdown HTML
    let multsRowsHtml = '';
    const displayMults = mults.slice(0, 8); // show first up to 8 dimensions for readability
    displayMults.forEach((m, d) => {
      multsRowsHtml += `
        <tr>
          <td>d_${d}</td>
          <td>${m.qVal >= 0 ? '+' : ''}${m.qVal.toFixed(3)}</td>
          <td>${m.kVal >= 0 ? '+' : ''}${m.kVal.toFixed(3)}</td>
          <td class="prod-col">${m.prod >= 0 ? '+' : ''}${m.prod.toFixed(3)}</td>
        </tr>
      `;
    });
    if (mults.length > 8) {
      multsRowsHtml += `<tr><td colspan="4" class="dim-ellipsis">... + ${mults.length - 8} more dimensions</td></tr>`;
    }

    xrayEl.innerHTML = `
      <div class="xray-content">
        <div class="xray-header">
          <div class="xray-title">Attention Arithmetic X-Ray</div>
          <div class="xray-tokens">
            <span class="xray-q-token">Q[${i}] <strong>"${qTok}"</strong></span>
            <span class="xray-arrow">→ attending to →</span>
            <span class="xray-k-token">K[${j}] <strong>"${kTok}"</strong></span>
          </div>
          <div class="xray-badge-weight">Attention Weight: <strong>${(weight * 100).toFixed(2)}%</strong></div>
        </div>

        <div class="xray-step-card">
          <div class="xray-step-title">Step 1: Pairwise Inner Dot Product (q_${i} · k_${j})</div>
          <div class="xray-formula">\\mathbf{q}_i \\cdot \\mathbf{k}_j = \\sum_{d=0}^{${config.dHead - 1}} q_{i,d} k_{j,d} = <strong>${rawScore.toFixed(3)}</strong></div>
          <table class="xray-mult-table">
            <thead>
              <tr><th>Dim</th><th>q[i]</th><th>k[j]</th><th>Product</th></tr>
            </thead>
            <tbody>
              ${multsRowsHtml}
            </tbody>
          </table>
        </div>

        <div class="xray-step-card">
          <div class="xray-step-title">Step 2: Temperature Scaling (/ √d_k)</div>
          <div class="xray-formula">
            S_{${i},${j}} = \\frac{\\mathbf{q}_i \\cdot \\mathbf{k}_j}{\\sqrt{${config.dHead}}} = \\frac{${rawScore.toFixed(3)}}{${Math.sqrt(config.dHead).toFixed(3)}} = <strong>${scaledScore.toFixed(3)}</strong>
          </div>
        </div>

        <div class="xray-step-card">
          <div class="xray-step-title">Step 3: Masking & Softmax Exponentiation</div>
          ${
            isCausalMasked
              ? `<div class="xray-masked-note">Causal mask active (j &gt; i). Logit masked to -∞, resulting in attention probability <strong>0.00%</strong>.</div>`
              : `<div class="xray-formula">
                   \\alpha_{${i},${j}} = \\frac{e^{S_{${i},${j}} - \\max_k S_{${i},k}}}{\\sum_m e^{S_{${i},m} - \\max_k S_{${i},k}}} = <strong>${weight.toFixed(4)}</strong> (${(weight * 100).toFixed(2)}%)
                 </div>`
          }
        </div>

        <div class="xray-step-card">
          <div class="xray-step-title">Step 4: Value Vector Linear Weighting</div>
          <div class="xray-formula">
            \\text{Contribution to context } \\mathbf{c}_i = \\alpha_{${i},${j}} \\mathbf{v}_j = ${(weight).toFixed(3)} \\times \\mathbf{v}_j
          </div>
        </div>
      </div>
    `;
  }

  private renderGqaDiagram() {
    const gqaEl = this.container.querySelector<HTMLElement>('[data-transformer-gqa-diagram]');
    if (!gqaEl) return;

    const { numHeads, numKvHeads } = this.state.config;
    const mapping: GqaMapping = computeGQAHeadMapping(numHeads, numKvHeads);

    const modeName =
      numKvHeads === numHeads ? 'MHA (Multi-Head)' : numKvHeads === 1 ? 'MQA (Multi-Query)' : 'GQA (Grouped-Query)';
    const ratioLabel =
      numKvHeads === numHeads ? '1:1 ratio' : `${mapping.groupSize}:1 sharing ratio`;

    let groupsHtml = '';
    mapping.headsPerKvHead.forEach((qGroup, kvIdx) => {
      const qBadges = qGroup
        .map(
          (qIdx) =>
            `<span class="gqa-q-pill ${qIdx === this.state.activeHeadIdx ? 'active' : ''}">Q Head ${qIdx}</span>`
        )
        .join('');

      groupsHtml += `
        <div class="gqa-group-card">
          <div class="gqa-kv-pill">KV Head #${kvIdx}</div>
          <div class="gqa-group-arrow">↳ serves ↳</div>
          <div class="gqa-q-group">${qBadges}</div>
        </div>
      `;
    });

    gqaEl.innerHTML = `
      <div class="gqa-summary">
        <span class="gqa-mode-badge">${modeName}</span>
        <span class="gqa-ratio-badge">${ratioLabel}</span>
      </div>
      <div class="gqa-groups-container">
        ${groupsHtml}
      </div>
    `;
  }

  private renderStats() {
    const { config, tokens, numLayers, precisionBytes } = this.state;
    const seqLen = tokens.length;

    const params: TransformerParams = calculateTransformerParams(config, numLayers);
    const flops: TransformerFlops = calculateTransformerFlops(seqLen, config);
    const kvCache: KvCacheMemory = calculateKVCacheMemory(
      seqLen,
      config.numKvHeads,
      config.dHead,
      numLayers,
      precisionBytes
    );

    const paramsEl = this.container.querySelector<HTMLElement>('[data-transformer-params-total]');
    if (paramsEl) {
      paramsEl.textContent = `${formatNumber(params.modelTotal)} params (${formatNumber(params.layerTotal)} / layer)`;
    }

    const flopsEl = this.container.querySelector<HTMLElement>('[data-transformer-flops-total]');
    if (flopsEl) {
      flopsEl.textContent = `${formatFlops(flops.totalLayerFlops)} / layer`;
    }

    const kvEl = this.container.querySelector<HTMLElement>('[data-transformer-kv-cache]');
    if (kvEl) {
      kvEl.textContent = `${kvCache.formattedSize} per seq`;
    }
  }

  private renderPyTorch() {
    const codeEl = this.container.querySelector<HTMLElement>('[data-transformer-pytorch-code]');
    if (!codeEl) return;

    const snippet = generateTransformerPyTorchSnippet(this.state.config);
    codeEl.textContent = snippet;
  }
}

/**
 * Initializes the Transformer Layer Interactive Studio on root or document.
 * Returns the controller instance or null if container element is not found.
 */
export function initTransformerStudio(root?: ParentNode): TransformerStudioController | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const searchRoot = root ?? document;
  let container: HTMLElement | null = null;
  const anyRoot = searchRoot as any;

  if (
    anyRoot?.dataset?.transformerStudio !== undefined ||
    anyRoot?.id === 'transformer-studio-root' ||
    (typeof anyRoot?.getAttribute === 'function' && anyRoot.getAttribute('data-transformer-studio') !== null) ||
    (typeof anyRoot?.matches === 'function' && anyRoot.matches('[data-transformer-studio], #transformer-studio-root'))
  ) {
    container = anyRoot as HTMLElement;
  } else if (typeof searchRoot.querySelector === 'function') {
    container = searchRoot.querySelector<HTMLElement>('[data-transformer-studio], #transformer-studio-root');
  }

  if (!container) {
    return null;
  }

  const controller = new TransformerStudioController(container);
  window.__activeTransformerStudio = controller;
  window.__transformerStudioInitialized = true;
  return controller;
}

// Auto-initialize lifecycle hook
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const boot = () => {
    if (window.__transformerStudioInitialized) {
      const container = document.querySelector<HTMLElement>(
        '[data-transformer-studio], #transformer-studio-root'
      );
      if (!container || container.dataset.transformerStudioReady === 'true') {
        return;
      }
    }
    initTransformerStudio();
  };

  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('astro:page-load', () => {
    if (window.__activeTransformerStudio) {
      window.__activeTransformerStudio.destroy();
      window.__activeTransformerStudio = null;
    }
    window.__transformerStudioInitialized = false;
    boot();
  });

  if (document.readyState !== 'loading') {
    boot();
  }
}
