/**
 * Types and interfaces for the Multi-Mode Background System.
 */

export type BackgroundMode = 'classic' | 'cells2' | 'synteny' | 'off';

export interface BackgroundPointer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  isActive: boolean;
}

export interface BackgroundRenderer {
  readonly mode: BackgroundMode;
  init(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, dpr: number): void;
  resize(width: number, height: number, dpr: number): void;
  render(ctx: CanvasRenderingContext2D, width: number, height: number, pointer: BackgroundPointer, isDark: boolean, isCrt: boolean): void;
  onPointerMove(x: number, y: number): void;
  onClick(x: number, y: number): void;
  destroy(): void;
}

export interface BackgroundApi {
  get: () => BackgroundMode;
  set: (mode: BackgroundMode) => void;
  next: () => void;
  sync: () => void;
}
