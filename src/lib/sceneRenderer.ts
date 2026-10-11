import type { BackgroundMotion, Point } from './backgroundModel';
import type { FinaleVariant } from './morphFinale';

/** The lifecycle seam for the particle scene adapter. */
export interface SceneRenderer {
  resize(): void;
  refreshPalette(): void;
  setMotion(motion: BackgroundMotion): void;
  setRunning(running: boolean): void;
  setMask(mask: HTMLCanvasElement | null): void;
  reset(): void;
  step(): void;
  configure(options: {
    labels?: boolean;
    finaleVariant?: FinaleVariant;
    finaleTransition?: 'immediate' | 'smooth';
    motifFocus?: number;
  }): void;
  interact(x: number, y: number, options?: { animate?: boolean }): void;
  /** Optional, passive hover input; null releases the pointer without changing playback. */
  setPointer?(point: Point | null): void;
  status(): string;
  dispose(): void;
  setProgress?(progress: number, options?: { transition?: 'immediate' | 'smooth' }): void;
  getProgress?(): number;
}
