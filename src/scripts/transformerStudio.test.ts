import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  initTransformerStudio,
  generateTokenVector,
  generateSyntheticQKV,
  formatNumber,
  formatFlops,
  TRANSFORMER_PRESETS,
  PIPELINE_STAGES,
} from './transformerStudio';

describe('Transformer Studio: Helper Functions', () => {
  it('generates reproducible, bounded float vectors of requested dimension', () => {
    const vec1 = generateTokenVector('hello', 0, 'Q', 16);
    const vec2 = generateTokenVector('hello', 0, 'Q', 16);
    expect(vec1).toHaveLength(16);
    expect(vec1).toEqual(vec2); // Deterministic

    // Values should be bounded numbers roughly in [-1, 1]
    vec1.forEach((val) => {
      expect(typeof val).toBe('number');
      expect(Number.isFinite(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(-1.5);
      expect(val).toBeLessThanOrEqual(1.5);
    });

    const vecK = generateTokenVector('hello', 0, 'K', 16);
    // K should be different from Q due to role offset
    expect(vecK).not.toEqual(vec1);
  });

  it('generates synthetic Q, K, V matrices and sets Winograd affinity between "it" and "animal"', () => {
    const tokens = ['The', 'animal', "didn't", 'cross', 'the', 'street', 'because', 'it', 'was', 'too', 'tired'];
    const { Q, K, V } = generateSyntheticQKV(tokens, 16);

    expect(Q).toHaveLength(tokens.length);
    expect(K).toHaveLength(tokens.length);
    expect(V).toHaveLength(tokens.length);

    // Verify animal (index 1) and it (index 7) have custom correlated embedding
    const animalIdx = tokens.indexOf('animal');
    const itIdx = tokens.indexOf('it');
    expect(animalIdx).toBe(1);
    expect(itIdx).toBe(7);

    // Q[it] was modulated with K[animal]
    expect(Q[itIdx][0]).toBeCloseTo(Number((K[animalIdx][0] * 1.5 + 0.3).toFixed(3)));
  });

  it('formats parameter counts into human-readable strings', () => {
    expect(formatNumber(500)).toBe('500');
    expect(formatNumber(1500)).toBe('1.5K');
    expect(formatNumber(12500000)).toBe('12.50M');
    expect(formatNumber(7000000000)).toBe('7.00B');
  });

  it('formats FLOP counts into human-readable strings', () => {
    expect(formatFlops(800)).toBe('800 FLOPs');
    expect(formatFlops(250000)).toBe('250.0 KFLOPs');
    expect(formatFlops(420000000)).toBe('420.00 MFLOPs');
    expect(formatFlops(4200000000)).toBe('4.20 GFLOPs');
    expect(formatFlops(3500000000000)).toBe('3.50 TFLOPs');
  });
});

describe('Transformer Studio: DOM Controller & Lifecycle', () => {
  let originalWindow: any;
  let originalDocument: any;

  // Mock DOM Node creator
  const createMockElement = (tag: string = 'div', dataset: Record<string, string> = {}) => {
    const listeners: Record<string, Function[]> = {};
    const classes = new Set<string>();
    const attributes: Record<string, string> = {};
    const children: any[] = [];
    let innerHtmlVal = '';

    const el: any = {
      tagName: tag.toUpperCase(),
      dataset: { ...dataset },
      style: {
        backgroundColor: '',
        setProperty: vi.fn(),
      },
      classList: {
        add: vi.fn((cls: string) => classes.add(cls)),
        remove: vi.fn((cls: string) => classes.delete(cls)),
        toggle: vi.fn((cls: string, force?: boolean) => {
          if (force === true) classes.add(cls);
          else if (force === false) classes.delete(cls);
          else if (classes.has(cls)) classes.delete(cls);
          else classes.add(cls);
          return classes.has(cls);
        }),
        contains: (cls: string) => classes.has(cls),
      },
      get innerHTML() {
        return innerHtmlVal;
      },
      set innerHTML(val: string) {
        innerHtmlVal = val;
        if (val === '') {
          children.length = 0;
        }
      },
      textContent: '',
      title: '',
      value: '',
      type: tag === 'button' ? 'button' : tag === 'input' ? 'range' : '',
      setAttribute: vi.fn((name: string, val: string) => {
        attributes[name] = val;
      }),
      getAttribute: vi.fn((name: string) => attributes[name] ?? null),
      appendChild: vi.fn((child: any) => {
        children.push(child);
        return child;
      }),
      removeChild: vi.fn((child: any) => {
        const idx = children.indexOf(child);
        if (idx !== -1) children.splice(idx, 1);
        return child;
      }),
      children,
      select: vi.fn(),
      addEventListener: vi.fn((event: string, fn: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(fn);
      }),
      removeEventListener: vi.fn((event: string, fn: Function) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((l) => l !== fn);
        }
      }),
      dispatchEvent: vi.fn((event: { type: string }) => {
        const fns = listeners[event.type] || [];
        fns.forEach((fn) => fn(event));
      }),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
    };

    return el;
  };

  let originalClipboardDesc: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalWindow = globalThis.window;
    originalDocument = globalThis.document;
    if (typeof globalThis.navigator !== 'undefined') {
      originalClipboardDesc = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
    }
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    if (typeof globalThis.navigator !== 'undefined') {
      if (originalClipboardDesc) {
        Object.defineProperty(globalThis.navigator, 'clipboard', originalClipboardDesc);
      } else {
        delete (globalThis.navigator as any).clipboard;
      }
    }
    vi.restoreAllMocks();
  });

  it('returns null cleanly when window or document is missing', () => {
    // @ts-expect-error simulating non-browser environment
    delete globalThis.window;
    expect(initTransformerStudio()).toBeNull();
  });

  it('returns null if container matching [data-transformer-studio] is not found', () => {
    const mockRoot = {
      querySelector: () => null,
    } as unknown as ParentNode;

    (globalThis as any).window = {};
    (globalThis as any).document = mockRoot;

    const controller = initTransformerStudio(mockRoot);
    expect(controller).toBeNull();
  });

  function setupMockStudioDOM() {
    const elementsMap = new Map<string, any>();

    const getOrCreate = (selector: string, tag: string = 'div', dataset: Record<string, string> = {}) => {
      if (!elementsMap.has(selector)) {
        elementsMap.set(selector, createMockElement(tag, dataset));
      }
      return elementsMap.get(selector);
    };

    // Pre-create standard elements
    const container = createMockElement('div', { transformerStudio: 'true' });
    getOrCreate('[data-transformer-heatmap]', 'div');
    getOrCreate('[data-transformer-xray]', 'div');
    getOrCreate('[data-transformer-gqa-diagram]', 'div');
    getOrCreate('[data-transformer-token-list]', 'div');
    getOrCreate('[data-transformer-custom-input]', 'input');
    const playBtn = getOrCreate('[data-transformer-play]', 'button');
    const nextBtn = getOrCreate('[data-transformer-next]', 'button');
    const prevBtn = getOrCreate('[data-transformer-prev]', 'button');
    const resetBtn = getOrCreate('[data-transformer-reset]', 'button');
    getOrCreate('[data-transformer-speed]', 'select');
    const stageBadge = getOrCreate('[data-transformer-stage-badge]', 'span');
    getOrCreate('[data-transformer-pipeline-steps]', 'div');

    const archClassicalBtn = getOrCreate('[data-transformer-arch-btn="classical"]', 'button');
    const archModernBtn = getOrCreate('[data-transformer-arch-btn="modern"]', 'button');

    const headModeMha = getOrCreate('[data-transformer-head-mode="mha"]', 'button', {
      transformerHeadMode: 'mha',
    });
    const headModeGqa = getOrCreate('[data-transformer-head-mode="gqa"]', 'button', {
      transformerHeadMode: 'gqa',
    });
    const headModeMqa = getOrCreate('[data-transformer-head-mode="mqa"]', 'button', {
      transformerHeadMode: 'mqa',
    });

    getOrCreate('[data-transformer-norm-type]', 'select');
    getOrCreate('[data-transformer-pos-encoding]', 'select');
    getOrCreate('[data-transformer-mask-type]', 'select');

    getOrCreate('[data-transformer-seq-len]', 'input');
    getOrCreate('[data-transformer-seq-len-val]', 'span');
    getOrCreate('[data-transformer-d-model]', 'input');
    getOrCreate('[data-transformer-d-model-val]', 'span');
    getOrCreate('[data-transformer-num-heads]', 'input');
    getOrCreate('[data-transformer-num-heads-val]', 'span');
    getOrCreate('[data-transformer-kv-heads]', 'input');
    getOrCreate('[data-transformer-kv-heads-val]', 'span');
    getOrCreate('[data-transformer-d-ffn]', 'input');
    getOrCreate('[data-transformer-d-ffn-val]', 'span');

    const paramsTotal = getOrCreate('[data-transformer-params-total]', 'span');
    const flopsTotal = getOrCreate('[data-transformer-flops-total]', 'span');
    const kvCacheTotal = getOrCreate('[data-transformer-kv-cache]', 'span');

    const pytorchCode = getOrCreate('[data-transformer-pytorch-code]', 'code');
    const copyPytorchBtn = getOrCreate('[data-transformer-copy-pytorch]', 'button');

    // Preset buttons
    const presetWinograd = getOrCreate('[data-transformer-preset="nlpWinograd"]', 'button', {
      transformerPreset: 'nlpWinograd',
    });
    const presetAttention = getOrCreate('[data-transformer-preset="nlpAttention"]', 'button', {
      transformerPreset: 'nlpAttention',
    });
    const presetPromoter = getOrCreate('[data-transformer-preset="dnaPromoter"]', 'button', {
      transformerPreset: 'dnaPromoter',
    });
    const presetEnhancer = getOrCreate('[data-transformer-preset="dnaEnhancer"]', 'button', {
      transformerPreset: 'dnaEnhancer',
    });

    // Container query selector routing
    container.querySelector = vi.fn((sel: string) => {
      if (elementsMap.has(sel)) return elementsMap.get(sel);
      return null;
    });

    container.querySelectorAll = vi.fn((sel: string) => {
      if (sel === '[data-transformer-preset]') {
        return [presetWinograd, presetAttention, presetPromoter, presetEnhancer];
      }
      if (sel === '[data-transformer-head-mode]') {
        return [headModeMha, headModeGqa, headModeMqa];
      }
      if (sel === '[data-pipeline-step]') {
        return [];
      }
      if (sel === '[data-cell-i]') {
        return [];
      }
      return [];
    });

    const mockDoc = {
      querySelector: (sel: string) => {
        if (sel.includes('data-transformer-studio') || sel.includes('transformer-studio-root')) {
          return container;
        }
        return container.querySelector(sel);
      },
      querySelectorAll: (sel: string) => container.querySelectorAll(sel),
      createElement: createMockElement,
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      execCommand: vi.fn(() => true),
    };

    (globalThis as any).document = mockDoc;
    (globalThis as any).window = {
      __transformerStudioInitialized: false,
      __activeTransformerStudio: null,
      setInterval: vi.fn(() => 42),
      clearInterval: vi.fn(),
    };

    return {
      container,
      elementsMap,
      mockDoc,
      playBtn,
      nextBtn,
      prevBtn,
      resetBtn,
      stageBadge,
      presetAttention,
      presetPromoter,
      archClassicalBtn,
      archModernBtn,
      headModeMha,
      headModeGqa,
      headModeMqa,
      pytorchCode,
      copyPytorchBtn,
      paramsTotal,
      flopsTotal,
      kvCacheTotal,
    };
  }

  it('initializes controller, binds controls, and exposes interactive state', () => {
    const { container } = setupMockStudioDOM();

    const controller = initTransformerStudio(container);
    expect(controller).not.toBeNull();
    expect(container.dataset.transformerStudioReady).toBe('true');
    expect((window as any).__transformerStudioInitialized).toBe(true);

    const state = controller!.getState();
    expect(state.activePresetKey).toBe('nlpWinograd');
    expect(state.tokens).toHaveLength(11);
    expect(state.config.dModel).toBe(64);
    expect(state.config.numHeads).toBe(4);
    expect(state.config.numKvHeads).toBe(2); // GQA by default
    expect(state.architecture).toBe('modern');
    expect(state.currentStageIndex).toBe(0);

    controller!.destroy();
    expect(container.dataset.transformerStudioReady).toBe('false');
  });

  it('navigates through the 8-stage forward execution pipeline', () => {
    const { container, stageBadge } = setupMockStudioDOM();
    const controller = initTransformerStudio(container)!;

    expect(controller.getState().currentStageIndex).toBe(0);
    expect(stageBadge.textContent).toBe(PIPELINE_STAGES[0].badge);

    // Step forward
    controller.stepForward();
    expect(controller.getState().currentStageIndex).toBe(1);
    expect(stageBadge.textContent).toBe(PIPELINE_STAGES[1].badge);

    // Jump to stage 4 (Context AV)
    controller.setStage(4);
    expect(controller.getState().currentStageIndex).toBe(4);
    expect(stageBadge.textContent).toBe(PIPELINE_STAGES[4].badge);

    // Step backward
    controller.stepBackward();
    expect(controller.getState().currentStageIndex).toBe(3);

    // Reset back to 0
    controller.reset();
    expect(controller.getState().currentStageIndex).toBe(0);

    controller.destroy();
  });

  it('controls playback engine (play, pause, speed)', () => {
    const { container, playBtn } = setupMockStudioDOM();
    const controller = initTransformerStudio(container)!;

    expect(controller.getState().isPlaying).toBe(false);

    controller.play();
    expect(controller.getState().isPlaying).toBe(true);
    expect(playBtn.textContent).toBe('Pause');

    controller.setPlaybackSpeed(800);
    expect(controller.getState().playbackSpeed).toBe(800);

    controller.pause();
    expect(controller.getState().isPlaying).toBe(false);
    expect(playBtn.textContent).toBe('Play');

    controller.destroy();
  });

  it('switches presets (NLP Winograd, Attention Is All You Need, DNA Promoter, DNA Enhancer)', () => {
    const { container } = setupMockStudioDOM();
    const controller = initTransformerStudio(container)!;

    // Switch to nlpAttention
    controller.setPreset('nlpAttention');
    expect(controller.getState().activePresetKey).toBe('nlpAttention');
    expect(controller.getState().tokens).toEqual(TRANSFORMER_PRESETS.nlpAttention.tokens);
    expect(controller.getState().attentionResult).not.toBeNull();
    expect(controller.getState().attentionResult!.weights).toHaveLength(5);

    // Switch to dnaPromoter
    controller.setPreset('dnaPromoter');
    expect(controller.getState().activePresetKey).toBe('dnaPromoter');
    expect(controller.getState().tokens).toEqual(TRANSFORMER_PRESETS.dnaPromoter.tokens);
    expect(controller.getState().attentionResult!.weights).toHaveLength(5);

    // Switch to dnaEnhancer
    controller.setPreset('dnaEnhancer');
    expect(controller.getState().activePresetKey).toBe('dnaEnhancer');
    expect(controller.getState().tokens).toEqual(TRANSFORMER_PRESETS.dnaEnhancer.tokens);

    // Set custom tokens
    controller.setCustomTokens('ATG CGA TTT GAC');
    expect(controller.getState().activePresetKey).toBe('custom');
    expect(controller.getState().tokens).toEqual(['ATG', 'CGA', 'TTT', 'GAC']);

    controller.destroy();
  });

  it('switches architectural variants between Classical (Vaswani 2017) and Modern (LLaMA)', () => {
    const { container } = setupMockStudioDOM();
    const controller = initTransformerStudio(container)!;

    // Switch to Classical
    controller.setArchitecture('classical');
    const classicState = controller.getState();
    expect(classicState.architecture).toBe('classical');
    expect(classicState.config.normType).toBe('layernorm');
    expect(classicState.config.normPosition).toBe('post');
    expect(classicState.config.posEncoding).toBe('sinusoidal');
    expect(classicState.config.ffnType).toBe('standard');
    expect(classicState.config.maskType).toBe('none');
    expect(classicState.config.hasBias).toBe(true);
    expect(classicState.config.numKvHeads).toBe(classicState.config.numHeads); // MHA

    // Switch to Modern
    controller.setArchitecture('modern');
    const modernState = controller.getState();
    expect(modernState.architecture).toBe('modern');
    expect(modernState.config.normType).toBe('rmsnorm');
    expect(modernState.config.normPosition).toBe('pre');
    expect(modernState.config.posEncoding).toBe('rope');
    expect(modernState.config.ffnType).toBe('swiglu');
    expect(modernState.config.maskType).toBe('causal');
    expect(modernState.config.hasBias).toBe(false);
    expect(modernState.config.numKvHeads).toBeLessThan(modernState.config.numHeads); // GQA

    controller.destroy();
  });

  it('toggles GQA head grouping modes (MHA, GQA, MQA) and validates invariants', () => {
    const { container } = setupMockStudioDOM();
    const controller = initTransformerStudio(container)!;

    controller.setConfig({ numHeads: 8, numKvHeads: 8 });

    // Test MHA
    controller.setHeadMode('mha');
    expect(controller.getState().config.numKvHeads).toBe(8);

    // Test GQA
    controller.setHeadMode('gqa');
    expect(controller.getState().config.numKvHeads).toBe(4);

    // Test MQA
    controller.setHeadMode('mqa');
    expect(controller.getState().config.numKvHeads).toBe(1);

    controller.destroy();
  });

  it('selects attention matrix cells and inspects arithmetic X-Ray', () => {
    const { container } = setupMockStudioDOM();
    const controller = initTransformerStudio(container)!;

    controller.selectCell(1, 2);
    expect(controller.getState().selectedCell).toEqual({ i: 1, j: 2 });

    // Out of bounds selection is ignored
    controller.selectCell(99, 99);
    expect(controller.getState().selectedCell).toEqual({ i: 1, j: 2 });

    // Hover state
    controller.setHoveredCell({ i: 0, j: 1 });
    expect(controller.getState().hoveredCell).toEqual({ i: 0, j: 1 });
    controller.setHoveredCell(null);
    expect(controller.getState().hoveredCell).toBeNull();

    controller.destroy();
  });

  it('updates live stat cards (params, flops, kv-cache) on hyperparameter change', () => {
    const { container, paramsTotal, flopsTotal, kvCacheTotal } = setupMockStudioDOM();
    const controller = initTransformerStudio(container)!;

    expect(paramsTotal.textContent).toContain('params');
    expect(flopsTotal.textContent).toContain('FLOPs');
    expect(kvCacheTotal.textContent).toContain('per seq');

    const prevParams = paramsTotal.textContent;
    controller.setConfig({ dModel: 128 });
    const newParams = paramsTotal.textContent;
    expect(newParams).not.toEqual(prevParams);

    controller.destroy();
  });

  it('dynamically regenerates modern PyTorch code and provides clipboard copy with fallback', async () => {
    const { container, pytorchCode, copyPytorchBtn } = setupMockStudioDOM();
    const controller = initTransformerStudio(container)!;

    // Verify initial PyTorch code
    expect(pytorchCode.textContent).toContain('class TransformerBlock(nn.Module):');
    expect(pytorchCode.textContent).toContain('RMSNorm');
    expect(pytorchCode.textContent).toContain('repeat_interleave');

    // Clipboard API test
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    const copySuccess = await controller.copyPyTorchCode();
    expect(copySuccess).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith(pytorchCode.textContent);
    expect(copyPytorchBtn.textContent).toBe('Copied!');

    // Test fallback when navigator.clipboard is unavailable
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const fallbackSuccess = await controller.copyPyTorchCode();
    expect(fallbackSuccess).toBe(true); // document.execCommand mock succeeds

    controller.destroy();
  });

  it('handles indivisible GQA head configuration (e.g. H=7, H_KV=3) gracefully without throwing', () => {
    const { container, elementsMap } = setupMockStudioDOM();
    const controller = initTransformerStudio(container)!;

    expect(() => {
      controller.setConfig({ numHeads: 7, numKvHeads: 3 });
    }).not.toThrow();

    const gqaEl = elementsMap.get('[data-transformer-gqa-diagram]');
    expect(gqaEl.innerHTML).toContain('Non-Integer GQA Head Ratio');

    controller.destroy();
  });

  it('handles odd head dimension with RoPE active safely without crashing', () => {
    const { container } = setupMockStudioDOM();
    const controller = initTransformerStudio(container)!;

    expect(() => {
      // dModel=24, numHeads=5 -> raw dHead would be 4, dModel=25, numHeads=5 -> raw dHead would be 5 (odd)
      controller.setConfig({ posEncoding: 'rope', dModel: 25, numHeads: 5 });
    }).not.toThrow();

    // dHead was rounded/constrained to an even integer
    expect(controller.getState().config.dHead % 2).toBe(0);

    controller.destroy();
  });

  it('handles DOM click events on preset and playback buttons', () => {
    const { container, presetPromoter, playBtn, nextBtn } = setupMockStudioDOM();
    const controller = initTransformerStudio(container)!;

    // Simulate click on DNA promoter preset button
    presetPromoter.dispatchEvent({ type: 'click' });
    expect(controller.getState().activePresetKey).toBe('dnaPromoter');
    expect(controller.getState().tokens).toEqual(TRANSFORMER_PRESETS.dnaPromoter.tokens);

    // Simulate click on Play button
    playBtn.dispatchEvent({ type: 'click' });
    expect(controller.getState().isPlaying).toBe(true);

    // Simulate click on Next button
    const stageBefore = controller.getState().currentStageIndex;
    nextBtn.dispatchEvent({ type: 'click' });
    expect(controller.getState().currentStageIndex).toBe((stageBefore + 1) % PIPELINE_STAGES.length);

    controller.destroy();
  });

  it('updates token badge selection when selectCell is called', () => {
    const { container, elementsMap } = setupMockStudioDOM();
    const controller = initTransformerStudio(container)!;

    controller.selectCell(2, 2);
    expect(controller.getState().selectedCell).toEqual({ i: 2, j: 2 });

    const tokenList = elementsMap.get('[data-transformer-token-list]');
    expect(tokenList.children.length).toBeGreaterThan(0);
    const badge2 = tokenList.children[2];
    expect(badge2.classList.contains('active')).toBe(true);

    controller.destroy();
  });
});
