/**
 * Background Manager: Coordinates active background renderer, animation loop,
 * user interactions, and view transitions.
 */

import type { BackgroundMode, BackgroundRenderer, BackgroundPointer, BackgroundApi } from './types';
import { PangenomeFlowRenderer } from './pangenomeFlow';
import { LivingCells2Renderer } from './livingCells2';
import { NeuralSpliceWavesRenderer } from './neuralSpliceWaves';
import { ChromatinLoopsRenderer } from './chromatinLoops';

const STORAGE_KEY = 'khc-bg-mode';
const MODES: BackgroundMode[] = ['pangenome', 'cells', 'neural', 'chromatin', 'off'];

class BackgroundManager {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private currentMode: BackgroundMode = 'pangenome';
  private renderers: Map<BackgroundMode, BackgroundRenderer> = new Map();
  private activeRenderer: BackgroundRenderer | null = null;

  private running = false;
  private rafId = 0;
  private lastTime = 0;
  private pointer: BackgroundPointer = { x: 0, y: 0, active: false };
  private bound = false;

  constructor() {
    this.renderers.set('pangenome', new PangenomeFlowRenderer());
    this.renderers.set('cells', new LivingCells2Renderer());
    this.renderers.set('neural', new NeuralSpliceWavesRenderer());
    this.renderers.set('chromatin', new ChromatinLoopsRenderer());
  }

  public init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.canvas || !this.ctx) return;

    const saved = (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) as BackgroundMode | null;
    this.currentMode = saved && MODES.includes(saved) ? saved : 'pangenome';

    this.bindEvents();
    this.switchRenderer(this.currentMode);
    this.start();
  }

  public getMode(): BackgroundMode {
    return this.currentMode;
  }

  public setMode(mode: BackgroundMode): void {
    if (!MODES.includes(mode) || mode === this.currentMode) return;
    this.currentMode = mode;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, mode);
    }
    this.switchRenderer(mode);
    document.dispatchEvent(new CustomEvent('khc:bg-change', { detail: { mode } }));
  }

  public nextMode(): void {
    const idx = MODES.indexOf(this.currentMode);
    const nextIdx = (idx + 1) % MODES.length;
    this.setMode(MODES[nextIdx]);
  }

  public sync(): void {
    document.dispatchEvent(new CustomEvent('khc:bg-change', { detail: { mode: this.currentMode } }));
  }

  private switchRenderer(mode: BackgroundMode): void {
    if (this.activeRenderer) {
      this.activeRenderer.destroy();
      this.activeRenderer = null;
    }

    if (mode === 'off' || !this.canvas) {
      if (this.ctx) {
        this.ctx.clearRect(0, 0, this.canvas?.width || 0, this.canvas?.height || 0);
      }
      return;
    }

    const renderer = this.renderers.get(mode);
    if (renderer && this.canvas) {
      this.activeRenderer = renderer;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.canvas.clientWidth || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;
      this.activeRenderer.init(this.canvas, w, h, dpr);
    }
  }

  private handleResize = (): void => {
    if (!this.canvas || !this.ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (this.activeRenderer) {
      this.activeRenderer.resize(w, h, dpr);
    }
  };

  private bindEvents(): void {
    if (this.bound) return;
    this.bound = true;

    window.addEventListener('resize', this.handleResize, { passive: true });

    window.addEventListener(
      'pointermove',
      (e) => {
        this.pointer.x = e.clientX;
        this.pointer.y = e.clientY;
        this.pointer.active = true;
      },
      { passive: true }
    );

    window.addEventListener(
      'pointerleave',
      () => {
        this.pointer.active = false;
      },
      { passive: true }
    );

    window.addEventListener(
      'click',
      (e) => {
        if (this.activeRenderer?.onClick) {
          this.activeRenderer.onClick(e.clientX, e.clientY);
        }
      },
      { passive: true }
    );

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stop();
      } else {
        this.start();
      }
    });
  }

  private loop = (now: number): void => {
    if (!this.running) return;

    if (!this.lastTime) this.lastTime = now;
    const dt = Math.min(now - this.lastTime, 50); // clamp lag spikes
    this.lastTime = now;

    if (this.activeRenderer && this.ctx && this.canvas) {
      const theme = (document.documentElement.dataset.theme as 'light' | 'dark') || 'light';
      const crtMode = (document.documentElement.dataset.crtMode as 'off' | 'amber' | 'green') || 'off';
      this.activeRenderer.render(this.ctx, dt, this.pointer, theme, crtMode);
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  public start(): void {
    if (this.running) return;
    this.handleResize();
    this.running = true;
    this.lastTime = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  public attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.handleResize();
    this.switchRenderer(this.currentMode);
  }
}

// Global Singleton Instance
let globalManager: BackgroundManager | null = null;

export function getBackgroundManager(): BackgroundManager {
  if (!globalManager) {
    globalManager = new BackgroundManager();
  }
  return globalManager;
}

export function initSiteBackground(canvas: HTMLCanvasElement): void {
  const mgr = getBackgroundManager();
  mgr.init(canvas);

  const api: BackgroundApi = {
    get: () => mgr.getMode(),
    set: (m: BackgroundMode) => mgr.setMode(m),
    next: () => mgr.nextMode(),
    sync: () => {
      document.dispatchEvent(new CustomEvent('khc:bg-change', { detail: { mode: mgr.getMode() } }));
    },
  };

  (window as unknown as { __khcBg: BackgroundApi }).__khcBg = api;
}
