/**
 * Types and interfaces for the Multi-Mode Background System.
 */

export type BackgroundMode = 'pangenome' | 'cells' | 'neural' | 'chromatin' | 'off';

export interface BackgroundPointer {
  x: number;
  y: number;
  active: boolean;
}

export interface BackgroundRenderer {
  id: BackgroundMode;
  name: string;
  init(canvas: HTMLCanvasElement, width: number, height: number, dpr: number): void;
  resize(width: number, height: number, dpr: number): void;
  render(
    ctx: CanvasRenderingContext2D,
    dt: number,
    pointer: BackgroundPointer,
    theme: 'light' | 'dark',
    crtMode: 'off' | 'amber' | 'green'
  ): void;
  onClick?(x: number, y: number): void;
  destroy(): void;
}

export interface BackgroundApi {
  get: () => BackgroundMode;
  set: (mode: BackgroundMode) => void;
  next: () => void;
  sync: () => void;
}
