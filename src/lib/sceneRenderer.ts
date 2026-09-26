import type { BackgroundMotion, Point } from './backgroundModel';

/** The lifecycle seam shared by the existing field/landscape and particle adapters. */
export interface SceneRenderer {
  resize(): void;
  refreshPalette(): void;
  setMotion(motion: BackgroundMotion): void;
  setRunning(running: boolean): void;
  setMask(mask: HTMLCanvasElement | null): void;
  reset(): void;
  step(): void;
  configure(options: { strength?: number; rate?: number; method?: string; start?: Point }): void;
  interact(x: number, y: number): void;
  status(): string;
  dispose(): void;
  setProgress?(progress: number): void;
  getProgress?(): number;
}
