import { describe, expect, it } from 'vitest';
import {
  createDefaultInput,
  initCnnStudio,
  resizeMatrix,
} from './cnnStudio';

describe('CNN Studio: createDefaultInput', () => {
  it('creates an H x W matrix with correct dimensions', () => {
    const mat5 = createDefaultInput(5, 5);
    expect(mat5).toHaveLength(5);
    mat5.forEach((row) => expect(row).toHaveLength(5));

    const mat7 = createDefaultInput(7, 7);
    expect(mat7).toHaveLength(7);
    mat7.forEach((row) => expect(row).toHaveLength(7));
  });

  it('places peak activation at the spatial center', () => {
    const mat = createDefaultInput(5, 5);
    expect(mat[2][2]).toBe(4); // Center of 5x5 is (2, 2)
  });

  it('produces symmetric values around the center cross', () => {
    const mat = createDefaultInput(5, 5);
    expect(mat[2][1]).toBe(3);
    expect(mat[2][3]).toBe(3);
    expect(mat[1][2]).toBe(3);
    expect(mat[3][2]).toBe(3);
  });
});

describe('CNN Studio: resizeMatrix', () => {
  it('preserves existing values when expanding dimensions', () => {
    const original = [
      [1, 2],
      [3, 4],
    ];
    const expanded = resizeMatrix(original, 3, 3, 0);
    expect(expanded).toEqual([
      [1, 2, 0],
      [3, 4, 0],
      [0, 0, 0],
    ]);
  });

  it('truncates cleanly when shrinking dimensions', () => {
    const original = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    const shrunk = resizeMatrix(original, 2, 2);
    expect(shrunk).toEqual([
      [1, 2],
      [4, 5],
    ]);
  });

  it('uses specified default value for new entries', () => {
    const original = [[9]];
    const expanded = resizeMatrix(original, 2, 2, -1);
    expect(expanded).toEqual([
      [9, -1],
      [-1, -1],
    ]);
  });
});

describe('CNN Studio: initCnnStudio Environment & Lifecycle', () => {
  it('returns null when document or window is not available', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error simulating non-browser environment
    delete globalThis.window;

    const controller = initCnnStudio();
    expect(controller).toBeNull();

    // Restore
    globalThis.window = originalWindow;
  });

  it('returns null if no matching container element is found', () => {
    // Create mock document with no [data-cnn-studio]
    const mockRoot = {
      querySelector: () => null,
    } as unknown as ParentNode;

    const controller = initCnnStudio(mockRoot);
    expect(controller).toBeNull();
  });

  it('initializes controller, binds controls, and exposes interactive state', () => {
    // Setup mock DOM tree
    const dataset: Record<string, string> = {};
    const elements = new Map<string, any>();

    const createMockElement = (tag: string = 'div') => {
      const elDataset: Record<string, string> = {};
      const listeners: Record<string, Function[]> = {};
      const el = {
        tagName: tag.toUpperCase(),
        dataset: elDataset,
        innerHTML: '',
        textContent: '',
        style: {
          display: '',
          gridTemplateColumns: '',
          gap: '',
          setProperty: () => {},
        },
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
        appendChild: (child: any) => child,
        addEventListener: (event: string, fn: Function) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(fn);
        },
        removeEventListener: (event: string, fn: Function) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((l) => l !== fn);
          }
        },
        setAttribute: () => {},
        getAttribute: () => null,
        closest: () => null,
        title: '',
        value: '3',
        checked: true,
        querySelector: (s: string) => {
          if (!elements.has(s)) {
            elements.set(s, createMockElement());
          }
          return elements.get(s);
        },
        querySelectorAll: (_s: string) => [],
      };
      return el;
    };

    const containerEl = createMockElement('div');
    containerEl.dataset = dataset;

    const mockRoot = {
      querySelector: (sel: string) => {
        if (sel.includes('data-cnn-studio') || sel.includes('cnn-studio-root')) {
          return containerEl;
        }
        if (!elements.has(sel)) {
          elements.set(sel, createMockElement());
        }
        return elements.get(sel);
      },
      querySelectorAll: (_sel: string) => [],
    } as unknown as ParentNode;

    const mockDoc = {
      querySelector: mockRoot.querySelector,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: createMockElement,
      createElementNS: () => createMockElement(),
      head: { appendChild: () => {} },
    };

    const originalDoc = globalThis.document;
    const originalWin = globalThis.window;

    (globalThis as any).document = mockDoc;
    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      setInterval: () => 123,
      clearInterval: () => {},
      prompt: () => null,
    };

    try {
      const controller = initCnnStudio(mockRoot);
      expect(controller).not.toBeNull();
      if (!controller) return;

      const state = controller.getState();
      expect(state.mode).toBe('2d');
      expect(state.inH).toBe(5);
      expect(state.inW).toBe(5);
      expect(state.kernelSize).toBe(3);
      expect(state.stride).toBe(1);
      expect(state.activePreset).toBe('sobelHorizontal');

      // Test stepping
      const initialStep = state.currentStepIdx;
      controller.stepForward();
      expect(controller.getState().currentStepIdx).toBe(initialStep + 1);

      controller.stepBackward();
      expect(controller.getState().currentStepIdx).toBe(initialStep);

      // Test reset
      controller.stepForward();
      controller.reset();
      expect(controller.getState().currentStepIdx).toBe(0);

      // Test mode switch
      controller.setMode('1d');
      expect(controller.getState().mode).toBe('1d');

      controller.setMode('2d');
      expect(controller.getState().mode).toBe('2d');

      // Test preset change
      controller.setKernelPreset('laplacian');
      expect(controller.getState().activePreset).toBe('laplacian');

      // Test playback toggle
      controller.play();
      expect(controller.getState().isPlaying).toBe(true);
      controller.pause();
      expect(controller.getState().isPlaying).toBe(false);

      // Test destruction
      controller.destroy();
      expect(containerEl.dataset.cnnStudioReady).toBe('false');
    } finally {
      globalThis.document = originalDoc;
      globalThis.window = originalWin;
    }
  });
});
