import type { BackgroundMotion, Point } from './backgroundModel';

/** The lifecycle seam for the particle scene adapter. */
export interface SceneRenderer {
  resize(): void;
  refreshPalette(): void;
  setMotion(motion: BackgroundMotion): void;
  setRunning(running: boolean): void;
  setMask(mask: HTMLCanvasElement | null): void;
  reset(): void;
  step(): void;
  configure(options: { labels?: boolean }): void;
  interact(x: number, y: number): void;
  /** Optional, passive hover input; null releases the pointer without changing playback. */
  setPointer?(point: Point | null): void;
  status(): string;
  dispose(): void;
  setProgress?(progress: number, options?: { transition?: 'immediate' | 'smooth' }): void;
  getProgress?(): number;
}
