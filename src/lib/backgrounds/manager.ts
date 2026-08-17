/**
 * Global Background Manager Singleton.
 *
 * Coordinates canvas lifecycle, DPR scaling, pointer tracking, theme synchronization,
 * and high-performance switching between background modes:
 * - 'classic': Classic Living Cells (Original background)
 * - 'cells2':  Bioluminescent Living Cells 2.0
 * - 'synteny': Synteny Constellation & Graph
 * - 'off':     Minimal Clean Paper (Off)
 */
import type { BackgroundMode, BackgroundPointer, BackgroundRenderer, BackgroundApi } from './types';
import { ClassicCellsRenderer } from './classicCells';
import { LivingCells2Renderer } from './livingCells2';
import { SyntenyGraphRenderer } from './syntenyGraph';

const STORAGE_KEY = 'khc-bg-mode';
const MODES: BackgroundMode[] = ['classic', 'cells2', 'synteny', 'off'];

class BackgroundManager {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private renderers: Map<BackgroundMode, BackgroundRenderer> = new Map();
  private activeRenderer: BackgroundRenderer | null = null;
  private currentMode: BackgroundMode = 'classic';

  private pointer: BackgroundPointer = { x: -1000, y: -1000, vx: 0, vy: 0, isActive: false };
  private lastPointerPos = { x: 0, y: 0 };
  private rafId = 0;
  private isRunning = false;
  private lastRenderTime = 0;
  private isBound = false;

  constructor() {
    this.renderers.set('classic', new ClassicCellsRenderer());
    this.renderers.set('cells2', new LivingCells2Renderer());
    this.renderers.set('synteny', new SyntenyGraphRenderer());

    const saved = typeof localStorage !== 'undefined' ? (localStorage.getItem(STORAGE_KEY) as BackgroundMode) : null;
    this.currentMode = saved && MODES.includes(saved) ? saved : 'classic';
  }

  public attach(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas && this.ctx) return;

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;

    this.bindEvents();
    this.resize();
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
    this.sync();
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
    if (renderer && this.canvas && this.ctx) {
      this.activeRenderer = renderer;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.canvas.clientWidth || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;
      renderer.init(this.canvas, this.ctx, dpr);
      renderer.resize(w, h, dpr);
    }
  }

  private resize = (): void => {
    if (!this.canvas || !this.ctx) return;
    const isCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2);
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this.activeRenderer) {
      this.activeRenderer.resize(w, h, dpr);
    }
  };

  private bindEvents(): void {
    if (this.isBound || typeof window === 'undefined') return;
    this.isBound = true;

    window.addEventListener('resize', this.resize, { passive: true });

    window.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        const x = e.clientX;
        const y = e.clientY;
        this.pointer.vx = x - this.lastPointerPos.x;
        this.pointer.vy = y - this.lastPointerPos.y;
        this.lastPointerPos.x = x;
        this.lastPointerPos.y = y;
        this.pointer.x = x;
        this.pointer.y = y;
        this.pointer.isActive = true;

        if (this.activeRenderer) {
          this.activeRenderer.onPointerMove(x, y);
        }
      },
      { passive: true }
    );

    window.addEventListener(
      'pointerleave',
      () => {
        this.pointer.isActive = false;
        this.pointer.x = -1000;
        this.pointer.y = -1000;
      },
      { passive: true }
    );

    window.addEventListener('click', (e: MouseEvent) => {
      // Ignore clicks on buttons/links
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || (e.target as HTMLElement | null)?.closest('button, a, input, [role="menuitem"]')) {
        return;
      }
      if (this.activeRenderer) {
        this.activeRenderer.onClick(e.clientX, e.clientY);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stop();
      } else {
        this.start();
      }
    });
  }

  private loop = (ts: number): void => {
    if (!this.isRunning) return;
    this.rafId = requestAnimationFrame(this.loop);

    // Frame throttle: ~30-60fps depending on device
    if (ts - this.lastRenderTime < 16) return;
    this.lastRenderTime = ts;

    if (!this.canvas || !this.ctx) return;
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.ctx.clearRect(0, 0, w, h);

    if (this.activeRenderer && this.currentMode !== 'off') {
      const isDark = document.documentElement.dataset.theme === 'dark';
      const isCrt = document.documentElement.dataset.crtMode === 'amber' || document.documentElement.dataset.crtMode === 'green';
      this.activeRenderer.render(this.ctx, w, h, this.pointer, isDark, isCrt);
    }
  };

  public start(): void {
    if (this.isRunning) return;
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      // Render single static frame
      this.renderStaticFrame();
      return;
    }
    this.isRunning = true;
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private renderStaticFrame(): void {
    if (!this.canvas || !this.ctx || !this.activeRenderer || this.currentMode === 'off') return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ctx.clearRect(0, 0, w, h);
    const isDark = document.documentElement.dataset.theme === 'dark';
    const isCrt = document.documentElement.dataset.crtMode === 'amber' || document.documentElement.dataset.crtMode === 'green';
    this.activeRenderer.render(this.ctx, w, h, { x: -1000, y: -1000, vx: 0, vy: 0, isActive: false }, isDark, isCrt);
  }
}

let managerInstance: BackgroundManager | null = null;

export function getBackgroundManager(): BackgroundManager {
  if (!managerInstance) {
    managerInstance = new BackgroundManager();
  }
  return managerInstance;
}

export function initSiteBackground(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-site-bg-canvas]');
  if (canvas) {
    const mgr = getBackgroundManager();
    mgr.attach(canvas);

    // Expose global API
    const api: BackgroundApi = {
      get: () => mgr.getMode(),
      set: (mode: BackgroundMode) => mgr.setMode(mode),
      next: () => mgr.nextMode(),
      sync: () => mgr.sync(),
    };
    (window as Window & { __khcBg?: BackgroundApi }).__khcBg = api;
  }
}
