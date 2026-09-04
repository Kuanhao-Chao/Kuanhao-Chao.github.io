import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  initMambaStudio,
  generateSyntheticSSMData,
  formatNumber,
  formatFlops,
  MAMBA_PRESETS,
} from './mambaStudio';

describe('Mamba Studio: Helper Functions & Synthetic Data Generator', () => {
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

  it('generates reproducible, bounded float vectors for synthetic SSM data', () => {
    const tokens = ['The', 'quick', 'brown', 'fox'];
    const data1 = generateSyntheticSSMData(tokens, 8);
    const data2 = generateSyntheticSSMData(tokens, 8);

    expect(data1.x).toHaveLength(4);
    expect(data1.delta).toHaveLength(4);
    expect(data1.B).toHaveLength(4);
    expect(data1.C).toHaveLength(4);
    expect(data1.B[0]).toHaveLength(8);
    expect(data1.C[0]).toHaveLength(8);

    // Deterministic equivalence
    expect(data1).toEqual(data2);

    // Bounded ranges
    data1.x.forEach((val) => {
      expect(val).toBeGreaterThanOrEqual(-1.5);
      expect(val).toBeLessThanOrEqual(1.5);
    });

    data1.delta.forEach((dt) => {
      expect(dt).toBeGreaterThan(0);
      expect(dt).toBeLessThanOrEqual(2.0);
    });
  });

  it('applies preset-specific Delta and x values for educational demonstration', () => {
    const preset = MAMBA_PRESETS.nlpFilter;
    const data = generateSyntheticSSMData(preset.tokens, 8, preset);

    // Filler word 'The' has small delta (filtering)
    const theIdx = preset.tokens.indexOf('The');
    expect(data.delta[theIdx]).toBe(0.05);

    // Sentiment cue 'not' and 'terrible' have large delta (latching)
    const notIdx = preset.tokens.indexOf('not');
    const terribleIdx = preset.tokens.indexOf('terrible');
    expect(data.delta[notIdx]).toBe(0.85);
    expect(data.delta[terribleIdx]).toBe(0.8);

    // Sentiment cue 'fantastic' has large delta
    const fantasticIdx = preset.tokens.indexOf('fantastic');
    expect(data.delta[fantasticIdx]).toBe(0.95);
  });
});

describe('Mamba Studio: DOM Controller & Lifecycle', () => {
  let originalWindow: any;
  let originalDocument: any;
  let originalClipboardDesc: PropertyDescriptor | undefined;

  // Mock DOM Node creator
  const createMockElement = (
    tag: string = 'div',
    dataset: Record<string, string> = {}
  ) => {
    const listeners: Record<string, Function[]> = {};
    const classes = new Set<string>();
    const attributes: Record<string, string> = {};
    const children: any[] = [];
    let innerHtmlVal = '';

    const el: any = {
      tagName: tag.toUpperCase(),
      dataset: { ...dataset },
      style: {
        display: '',
        width: '',
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
      hidden: false,
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
      focus: vi.fn(),
      addEventListener: vi.fn((event: string, fn: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(fn);
      }),
      removeEventListener: vi.fn((event: string, fn: Function) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((l) => l !== fn);
        }
      }),
      dispatchEvent: vi.fn((event: { type: string; [key: string]: any }) => {
        const fns = listeners[event.type] || [];
        fns.forEach((fn) => fn(event));
      }),
      closest: vi.fn((sel: string) => {
        if (sel === '[data-token-idx]' && el.dataset.tokenIdx !== undefined)
          return el;
        if (sel === '[data-step-idx]' && el.dataset.stepIdx !== undefined)
          return el;
        return null;
      }),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
    };

    return el;
  };

  beforeEach(() => {
    originalWindow = globalThis.window;
    originalDocument = globalThis.document;
    if (typeof globalThis.navigator !== 'undefined') {
      originalClipboardDesc = Object.getOwnPropertyDescriptor(
        globalThis.navigator,
        'clipboard'
      );
    }
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    if (typeof globalThis.navigator !== 'undefined') {
      if (originalClipboardDesc) {
        Object.defineProperty(
          globalThis.navigator,
          'clipboard',
          originalClipboardDesc
        );
      } else {
        delete (globalThis.navigator as any).clipboard;
      }
    }
    vi.restoreAllMocks();
  });

  it('returns null cleanly when window or document is missing', () => {
    // @ts-expect-error simulating non-browser environment
    delete globalThis.window;
    expect(initMambaStudio()).toBeNull();
  });

  it('returns null if container matching [data-mamba-studio] is not found', () => {
    const mockRoot = {
      querySelector: () => null,
    } as unknown as ParentNode;

    (globalThis as any).window = {};
    (globalThis as any).document = mockRoot;

    const controller = initMambaStudio(mockRoot);
    expect(controller).toBeNull();
  });

  function setupMockStudioDOM() {
    const elementsMap = new Map<string, any>();

    const getOrCreate = (
      selector: string,
      tag: string = 'div',
      dataset: Record<string, string> = {}
    ) => {
      if (!elementsMap.has(selector)) {
        elementsMap.set(selector, createMockElement(tag, dataset));
      }
      return elementsMap.get(selector);
    };

    // Container
    const container = createMockElement('div', { mambaStudio: 'true' });

    // Mode tabs & panels
    const tabRecurrent = getOrCreate(
      '[data-mamba-mode-tab="recurrent"]',
      'button',
      { mambaModeTab: 'recurrent' }
    );
    const tabParallel = getOrCreate(
      '[data-mamba-mode-tab="parallel"]',
      'button',
      { mambaModeTab: 'parallel' }
    );
    const panelRecurrent = getOrCreate(
      '[data-mamba-panel="recurrent"]',
      'div',
      { mambaPanel: 'recurrent' }
    );
    const panelParallel = getOrCreate(
      '[data-mamba-panel="parallel"]',
      'div',
      { mambaPanel: 'parallel' }
    );

    // Recurrent playback controls
    const playBtn = getOrCreate('[data-mamba-play]', 'button');
    const nextBtn = getOrCreate('[data-mamba-next]', 'button');
    const prevBtn = getOrCreate('[data-mamba-prev]', 'button');
    const resetBtn = getOrCreate('[data-mamba-reset]', 'button');
    const speedSelect = getOrCreate('[data-mamba-speed]', 'select');
    const stepBadge = getOrCreate('[data-mamba-step-badge]', 'span');
    const deltaMeter = getOrCreate('[data-mamba-delta-meter]', 'div');
    const stateVector = getOrCreate('[data-mamba-state-vector]', 'div');
    const outputTrack = getOrCreate('[data-mamba-output-track]', 'div');
    const tokenList = getOrCreate('[data-mamba-token-list]', 'div');
    const customInput = getOrCreate('[data-mamba-custom-input]', 'input');

    // Parallel scan
    const treeDiagram = getOrCreate('[data-mamba-tree-diagram]', 'div');
    const assocMath = getOrCreate('[data-mamba-assoc-math]', 'div');

    // X-Ray inspector
    const xrayInspector = getOrCreate('[data-mamba-xray]', 'div');

    // ZOH Explorer
    const deltaSlider = getOrCreate('[data-mamba-delta-slider]', 'input');
    const deltaVal = getOrCreate('[data-mamba-delta-val]', 'span');
    const aBarMatrix = getOrCreate('[data-mamba-a-bar-matrix]', 'div');

    // Benchmark
    const benchmarkSlider = getOrCreate(
      '[data-mamba-benchmark-slider]',
      'input'
    );
    const benchmarkVal = getOrCreate(
      '[data-mamba-benchmark-val]',
      'span'
    );
    const benchmarkReadout = getOrCreate(
      '[data-mamba-benchmark-readout]',
      'div'
    );
    const kvVsSsmChart = getOrCreate('[data-mamba-kv-vs-ssm-chart]', 'div');

    // Presets
    const presetFilter = getOrCreate(
      '[data-mamba-preset="nlpFilter"]',
      'button',
      { mambaPreset: 'nlpFilter' }
    );
    const presetRecall = getOrCreate(
      '[data-mamba-preset="nlpRecall"]',
      'button',
      { mambaPreset: 'nlpRecall' }
    );
    const presetDistal = getOrCreate(
      '[data-mamba-preset="dnaDistal"]',
      'button',
      { mambaPreset: 'dnaDistal' }
    );
    const presetSplice = getOrCreate(
      '[data-mamba-preset="dnaSplice"]',
      'button',
      { mambaPreset: 'dnaSplice' }
    );

    // Hyperparameters
    getOrCreate('[data-mamba-d-model]', 'input');
    getOrCreate('[data-mamba-d-model-val]', 'span');
    getOrCreate('[data-mamba-d-state]', 'input');
    getOrCreate('[data-mamba-d-state-val]', 'span');
    getOrCreate('[data-mamba-d-conv]', 'input');
    getOrCreate('[data-mamba-d-conv-val]', 'span');
    getOrCreate('[data-mamba-expand]', 'input');
    getOrCreate('[data-mamba-expand-val]', 'span');

    // Stats
    const paramsTotal = getOrCreate('[data-mamba-params-total]', 'span');
    const flopsTotal = getOrCreate('[data-mamba-flops-total]', 'span');
    const memoryTotal = getOrCreate('[data-mamba-memory-total]', 'span');

    // PyTorch
    const pytorchCode = getOrCreate('[data-mamba-pytorch-code]', 'code');
    const copyPytorchBtn = getOrCreate('[data-mamba-copy-pytorch]', 'button');

    // Container query selector routing
    container.querySelector = vi.fn((sel: string) => {
      if (elementsMap.has(sel)) return elementsMap.get(sel);
      return null;
    });

    container.querySelectorAll = vi.fn((sel: string) => {
      if (sel === '[data-mamba-mode-tab]') {
        return [tabRecurrent, tabParallel];
      }
      if (sel === '[data-mamba-panel]') {
        return [panelRecurrent, panelParallel];
      }
      if (sel === '[data-mamba-preset]') {
        return [presetFilter, presetRecall, presetDistal, presetSplice];
      }
      return [];
    });

    const mockDoc = {
      querySelector: (sel: string) => {
        if (
          sel.includes('data-mamba-studio') ||
          sel.includes('mamba-studio-root')
        ) {
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
      __mambaStudioInitialized: false,
      __activeMambaStudio: null,
      setInterval: vi.fn(() => 42),
      clearInterval: vi.fn(),
    };

    return {
      container,
      elementsMap,
      mockDoc,
      tabRecurrent,
      tabParallel,
      panelRecurrent,
      panelParallel,
      playBtn,
      nextBtn,
      prevBtn,
      resetBtn,
      speedSelect,
      stepBadge,
      deltaMeter,
      stateVector,
      outputTrack,
      tokenList,
      customInput,
      treeDiagram,
      assocMath,
      xrayInspector,
      deltaSlider,
      deltaVal,
      aBarMatrix,
      benchmarkSlider,
      benchmarkVal,
      benchmarkReadout,
      kvVsSsmChart,
      presetFilter,
      presetRecall,
      presetDistal,
      presetSplice,
      paramsTotal,
      flopsTotal,
      memoryTotal,
      pytorchCode,
      copyPytorchBtn,
    };
  }

  it('initializes controller, binds controls, and exposes interactive state', () => {
    const { container, stepBadge, deltaMeter, stateVector, pytorchCode } =
      setupMockStudioDOM();

    const controller = initMambaStudio(container);
    expect(controller).not.toBeNull();
    expect(container.dataset.mambaStudioReady).toBe('true');
    expect((window as any).__mambaStudioInitialized).toBe(true);

    const state = controller!.getState();
    expect(state.activeMode).toBe('recurrent');
    expect(state.activePresetKey).toBe('nlpFilter');
    expect(state.tokens).toHaveLength(10);
    expect(state.config.dModel).toBe(16);
    expect(state.config.dState).toBe(8);
    expect(state.currentStepIndex).toBe(0);

    // Recurrent visual checks
    expect(stepBadge.textContent).toContain('Step 1 of 10: token "The"');
    expect(deltaMeter.innerHTML).toContain('Selective Delta Gate');
    expect(stateVector.innerHTML).toContain('mamba-state-grid');
    expect(pytorchCode.textContent).toContain('class MambaBlock(nn.Module):');

    controller!.destroy();
    expect(container.dataset.mambaStudioReady).toBe('false');
    expect((window as any).__mambaStudioInitialized).toBe(false);
  });

  it('navigates through recurrent steps forward and backward and wraps around', () => {
    const { container, stepBadge, deltaMeter, stateVector } =
      setupMockStudioDOM();
    const controller = initMambaStudio(container)!;

    expect(controller.getState().currentStepIndex).toBe(0);
    expect(stepBadge.textContent).toContain('token "The"');

    // Step next
    controller.nextStep();
    expect(controller.getState().currentStepIndex).toBe(1);
    expect(stepBadge.textContent).toContain('token "movie"');
    expect(stateVector.innerHTML).toContain('mamba-state-grid');

    // Jump to step 3 ("not")
    controller.setStep(3);
    expect(controller.getState().currentStepIndex).toBe(3);
    expect(stepBadge.textContent).toContain('token "not"');
    // "not" has high delta (0.85) -> "Latching New State"
    expect(deltaMeter.innerHTML).toContain('Latching New State');

    // Jump to step 5 ("at") -> low delta (0.04) -> "Retaining Memory / Filtering"
    controller.setStep(5);
    expect(controller.getState().currentStepIndex).toBe(5);
    expect(stepBadge.textContent).toContain('token "at"');
    expect(deltaMeter.innerHTML).toContain('Retaining Memory / Filtering');

    // Step previous
    controller.prevStep();
    expect(controller.getState().currentStepIndex).toBe(4);
    expect(stepBadge.textContent).toContain('token "terrible"');

    // Reset back to 0
    controller.reset();
    expect(controller.getState().currentStepIndex).toBe(0);
    expect(stepBadge.textContent).toContain('token "The"');

    // Prev from 0 wraps around to last token (index 9)
    controller.prevStep();
    expect(controller.getState().currentStepIndex).toBe(9);
    expect(stepBadge.textContent).toContain('token "fantastic"');

    // Next from 9 wraps around to 0
    controller.nextStep();
    expect(controller.getState().currentStepIndex).toBe(0);

    controller.destroy();
  });

  it('handles playback engine (play, pause, togglePlay, setSpeed)', () => {
    const { container, playBtn } = setupMockStudioDOM();
    const controller = initMambaStudio(container)!;

    expect(controller.getState().isPlaying).toBe(false);

    controller.play();
    expect(controller.getState().isPlaying).toBe(true);
    expect(playBtn.textContent).toContain('Pause');
    expect(globalThis.window.setInterval).toHaveBeenCalled();

    controller.setSpeed(500);
    expect(controller.getState().playbackSpeed).toBe(500);

    controller.pause();
    expect(controller.getState().isPlaying).toBe(false);
    expect(playBtn.textContent).toContain('Play');

    controller.togglePlay();
    expect(controller.getState().isPlaying).toBe(true);

    controller.togglePlay();
    expect(controller.getState().isPlaying).toBe(false);

    controller.destroy();
  });

  it('switches between recurrent mode and parallel associative scan mode', () => {
    const {
      container,
      tabRecurrent,
      tabParallel,
      panelRecurrent,
      panelParallel,
      treeDiagram,
      assocMath,
    } = setupMockStudioDOM();
    const controller = initMambaStudio(container)!;

    expect(controller.getState().activeMode).toBe('recurrent');
    expect(tabRecurrent.classList.contains('active')).toBe(true);
    expect(panelRecurrent.style.display).toBe('block');
    expect(panelParallel.style.display).toBe('none');

    // Switch to parallel mode
    controller.setMode('parallel');
    expect(controller.getState().activeMode).toBe('parallel');
    expect(tabParallel.classList.contains('active')).toBe(true);
    expect(tabRecurrent.classList.contains('active')).toBe(false);
    expect(panelParallel.style.display).toBe('block');
    expect(panelRecurrent.style.display).toBe('none');

    // Verifies parallel scan visual tree diagram and associative math
    expect(treeDiagram.innerHTML).toContain('parallel-tree-container');
    expect(treeDiagram.innerHTML).toContain('Leaf Projections');
    expect(assocMath.innerHTML).toContain('Blelloch Parallel Associative Prefix Scan');

    // Switch back to recurrent mode
    controller.setMode('recurrent');
    expect(controller.getState().activeMode).toBe('recurrent');
    expect(panelRecurrent.style.display).toBe('block');
    expect(panelParallel.style.display).toBe('none');

    controller.destroy();
  });

  it('switches domain presets (NLP Filter, NLP Recall, DNA Distal, DNA Splice)', () => {
    const { container, stepBadge } = setupMockStudioDOM();
    const controller = initMambaStudio(container)!;

    // Switch to nlpRecall
    controller.setPreset('nlpRecall');
    expect(controller.getState().activePresetKey).toBe('nlpRecall');
    expect(controller.getState().tokens).toContain('ALPHA_42');
    expect(stepBadge.textContent).toContain('token "Passcode"');

    // Switch to dnaDistal
    controller.setPreset('dnaDistal');
    expect(controller.getState().activePresetKey).toBe('dnaDistal');
    expect(controller.getState().tokens).toContain('GATA3_Enhancer');
    expect(controller.getState().tokens).toContain('TATA_Promoter');

    // Switch to dnaSplice
    controller.setPreset('dnaSplice');
    expect(controller.getState().activePresetKey).toBe('dnaSplice');
    expect(controller.getState().tokens).toContain('Donor_GT');
    expect(controller.getState().tokens).toContain('Acceptor_AG');

    // Non-existent preset does nothing
    controller.setPreset('nonExistentPreset');
    expect(controller.getState().activePresetKey).toBe('dnaSplice');

    controller.destroy();
  });

  it('parses custom token inputs and clamps to maximum length', () => {
    const { container } = setupMockStudioDOM();
    const controller = initMambaStudio(container)!;

    // String input
    controller.setCustomTokens('Exon1 Intron1 Exon2 Intron2 Exon3');
    expect(controller.getState().tokens).toEqual([
      'Exon1',
      'Intron1',
      'Exon2',
      'Intron2',
      'Exon3',
    ]);
    expect(controller.getState().activePresetKey).toBe('custom');

    // Empty input fallback
    controller.setCustomTokens('');
    expect(controller.getState().tokens.length).toBeGreaterThan(0);

    // Clamping large sequences
    const longSequence = new Array(30).fill('motif').join(' ');
    controller.setCustomTokens(longSequence);
    expect(controller.getState().tokens.length).toBe(24);

    controller.destroy();
  });

  it('updates ZOH Discretization slider and eigenvalues inside unit disk', () => {
    const { container, deltaVal, aBarMatrix } = setupMockStudioDOM();
    const controller = initMambaStudio(container)!;

    controller.setZohDelta(0.5);
    expect(controller.getState().zohDelta).toBe(0.5);
    expect(deltaVal.textContent).toBe('0.50');
    expect(aBarMatrix.innerHTML).toContain('a-bar-matrix-grid');
    expect(aBarMatrix.innerHTML).toContain('Discrete A&#772;');

    controller.destroy();
  });

  it('calculates Mamba vs Transformer memory benchmark for long sequences', () => {
    const { container, benchmarkVal, benchmarkReadout, kvVsSsmChart } =
      setupMockStudioDOM();
    const controller = initMambaStudio(container)!;

    // Default 32k tokens
    expect(controller.getState().benchmarkSeqLen).toBe(32768);
    expect(benchmarkVal.textContent).toContain('32,768 tokens');
    expect(benchmarkReadout.innerHTML).toContain('O(1) Constant Footprint');
    expect(benchmarkReadout.innerHTML).toContain('O(N) Linear Scaling');
    expect(kvVsSsmChart.innerHTML).toContain('bench-chart-container');

    // Update to 128k tokens
    controller.setBenchmarkSeqLen(131072);
    expect(controller.getState().benchmarkSeqLen).toBe(131072);
    expect(benchmarkVal.textContent).toContain('131,072 tokens');

    controller.destroy();
  });

  it('modifies architectural hyperparameters and updates param/FLOP counts', () => {
    const { container, paramsTotal, flopsTotal, memoryTotal, pytorchCode } =
      setupMockStudioDOM();
    const controller = initMambaStudio(container)!;

    const initialParams = paramsTotal.textContent;

    // Expand dimension
    controller.setConfig({ dModel: 32, dState: 16 });
    expect(controller.getState().config.dModel).toBe(32);
    expect(controller.getState().config.dState).toBe(16);

    expect(paramsTotal.textContent).not.toBe(initialParams);
    expect(flopsTotal.textContent).toContain('FLOPs');
    expect(memoryTotal.textContent).toContain('/ layer');
    expect(pytorchCode.textContent).toContain('d_model: int = 32');
    expect(pytorchCode.textContent).toContain('d_state: int = 16');

    controller.destroy();
  });

  it('renders X-Ray state space arithmetic breakdown for active token', () => {
    const { container, xrayInspector } = setupMockStudioDOM();
    const controller = initMambaStudio(container)!;

    expect(xrayInspector.innerHTML).toContain('X-Ray State Space Arithmetic');
    expect(xrayInspector.innerHTML).toContain('ZOH Discretization');
    expect(xrayInspector.innerHTML).toContain('Recurrence State Evolution');
    expect(xrayInspector.innerHTML).toContain('Output Readout');

    controller.destroy();
  });

  it('copies generated PyTorch code to clipboard with visual confirmation', async () => {
    const { container, copyPytorchBtn } = setupMockStudioDOM();
    const controller = initMambaStudio(container)!;

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    const success = await controller.copyPyTorchCode();
    expect(success).toBe(true);
    expect(writeTextMock).toHaveBeenCalled();
    expect(copyPytorchBtn.textContent).toBe('Copied!');
    expect(copyPytorchBtn.classList.contains('copied')).toBe(true);

    controller.destroy();
  });

  it('falls back to execCommand copy when navigator.clipboard is unavailable', async () => {
    const { container, copyPytorchBtn, mockDoc } = setupMockStudioDOM();
    const controller = initMambaStudio(container)!;

    // Delete clipboard
    delete (globalThis.navigator as any).clipboard;

    const success = await controller.copyPyTorchCode();
    expect(success).toBe(true);
    expect(mockDoc.execCommand).toHaveBeenCalledWith('copy');
    expect(copyPytorchBtn.textContent).toBe('Copied!');

    controller.destroy();
  });

  it('responds to DOM button click events for mode tabs, presets, and playback', () => {
    const {
      container,
      tabParallel,
      presetRecall,
      playBtn,
      nextBtn,
      prevBtn,
      resetBtn,
    } = setupMockStudioDOM();
    const controller = initMambaStudio(container)!;

    // Click parallel tab
    tabParallel.dispatchEvent({ type: 'click' });
    expect(controller.getState().activeMode).toBe('parallel');

    // Click recall preset
    presetRecall.dispatchEvent({ type: 'click' });
    expect(controller.getState().activePresetKey).toBe('nlpRecall');

    // Click play
    playBtn.dispatchEvent({ type: 'click' });
    expect(controller.getState().isPlaying).toBe(true);

    // Click next
    nextBtn.dispatchEvent({ type: 'click' });
    expect(controller.getState().currentStepIndex).toBe(1);

    // Click prev
    prevBtn.dispatchEvent({ type: 'click' });
    expect(controller.getState().currentStepIndex).toBe(0);

    // Click reset
    resetBtn.dispatchEvent({ type: 'click' });
    expect(controller.getState().isPlaying).toBe(false);
    expect(controller.getState().currentStepIndex).toBe(0);

    controller.destroy();
  });
});
