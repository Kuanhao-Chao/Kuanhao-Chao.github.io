/**
 * Bioluminescent Cell Colony 2.0 Background Renderer.
 *
 * Renders living, organic cellular membranes with fluorescent nuclei,
 * drifting ATP firefly particles, and interactive mitotic cytokinesis.
 */

import type { BackgroundRenderer, BackgroundPointer } from './types';

interface Cell2 {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  targetR: number;
  phase: number;
  vphase: number;
  numLobes: number;
  lobeDepth: number;
  nucleusX: number;
  nucleusY: number;
  organelles: { angle: number; dist: number; size: number }[];
  state: 'normal' | 'dividing' | 'spawning';
  divideProgress: number; // 0 to 1
  divideAngle: number;
  alpha: number;
}

interface AtpParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  pulsePhase: number;
}

export class LivingCells2Renderer implements BackgroundRenderer {
  id = 'cells' as const;
  name = 'Bioluminescent Cell Colony 2.0';

  private width = 0;
  private height = 0;
  private dpr = 1;
  private time = 0;
  private cells: Cell2[] = [];
  private atpParticles: AtpParticle[] = [];

  init(_canvas: HTMLCanvasElement, width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.time = 0;
    this.initCells();
    this.initAtp();
  }

  private initCells(): void {
    const cellCount = Math.max(6, Math.min(14, Math.round((this.width * this.height) / 50000)));
    this.cells = Array.from({ length: cellCount }, () => this.createCell());
  }

  private initAtp(): void {
    this.atpParticles = Array.from({ length: 28 }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      size: 1.5 + Math.random() * 2,
      alpha: 0.2 + Math.random() * 0.4,
      pulsePhase: Math.random() * Math.PI * 2,
    }));
  }

  private createCell(x?: number, y?: number, radius?: number): Cell2 {
    const r = radius ?? (32 + Math.random() * 45);
    return {
      x: x ?? Math.random() * this.width,
      y: y ?? Math.random() * this.height,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r,
      targetR: r,
      phase: Math.random() * Math.PI * 2,
      vphase: 0.003 + Math.random() * 0.005,
      numLobes: 5 + Math.floor(Math.random() * 4),
      lobeDepth: 0.06 + Math.random() * 0.08,
      nucleusX: (Math.random() - 0.5) * 0.3,
      nucleusY: (Math.random() - 0.5) * 0.3,
      organelles: Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => ({
        angle: Math.random() * Math.PI * 2,
        dist: 0.25 + Math.random() * 0.4,
        size: 2.5 + Math.random() * 3,
      })),
      state: 'normal',
      divideProgress: 0,
      divideAngle: Math.random() * Math.PI,
      alpha: 1,
    };
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  onClick(x: number, y: number): void {
    // Find closest cell to divide
    let closestCell: Cell2 | null = null;
    let minDist = 120;

    for (const cell of this.cells) {
      if (cell.state !== 'normal') continue;
      const dist = Math.hypot(cell.x - x, cell.y - y);
      if (dist < minDist) {
        minDist = dist;
        closestCell = cell;
      }
    }

    if (closestCell) {
      closestCell.state = 'dividing';
      closestCell.divideProgress = 0;
      closestCell.divideAngle = Math.atan2(y - closestCell.y, x - closestCell.x);
    } else {
      // Spawn new small daughter cell
      if (this.cells.length < 20) {
        this.cells.push(this.createCell(x, y, 28));
      }
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    dt: number,
    pointer: BackgroundPointer,
    theme: 'light' | 'dark',
    crtMode: 'off' | 'amber' | 'green'
  ): void {
    this.time += dt * 0.001;
    ctx.clearRect(0, 0, this.width, this.height);

    const isDark = theme === 'dark' || crtMode !== 'off';

    // 1. Update and render ATP molecular fireflies
    this.atpParticles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.pulsePhase += dt * 0.002;

      if (p.x < 0) p.x = this.width;
      if (p.x > this.width) p.x = 0;
      if (p.y < 0) p.y = this.height;
      if (p.y > this.height) p.y = 0;

      const currentAlpha = p.alpha * (0.6 + 0.4 * Math.sin(p.pulsePhase));

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * this.dpr, 0, Math.PI * 2);

      if (crtMode === 'amber') {
        ctx.fillStyle = `rgba(255, 176, 0, ${currentAlpha * 0.4})`;
      } else if (crtMode === 'green') {
        ctx.fillStyle = `rgba(51, 255, 51, ${currentAlpha * 0.4})`;
      } else {
        ctx.fillStyle = isDark
          ? `rgba(78, 201, 176, ${currentAlpha * 0.45})`
          : `rgba(46, 110, 94, ${currentAlpha * 0.35})`;
      }
      ctx.fill();
    });

    // 2. Update and render cells
    const newCells: Cell2[] = [];

    for (let i = this.cells.length - 1; i >= 0; i--) {
      const cell = this.cells[i];
      cell.phase += cell.vphase;

      // Brownian drift + viewport bounds
      cell.x += cell.vx;
      cell.y += cell.vy;

      if (cell.x < -cell.r) cell.x = this.width + cell.r;
      if (cell.x > this.width + cell.r) cell.x = -cell.r;
      if (cell.y < -cell.r) cell.y = this.height + cell.r;
      if (cell.y > this.height + cell.r) cell.y = -cell.r;

      // Pointer repulsion
      if (pointer.active) {
        const dx = cell.x - pointer.x;
        const dy = cell.y - pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 180 && dist > 0) {
          const force = (1 - dist / 180) * 0.8;
          cell.x += (dx / dist) * force;
          cell.y += (dy / dist) * force;
        }
      }

      // Mitotic Cytokinesis Division Progression
      if (cell.state === 'dividing') {
        cell.divideProgress += dt * 0.0012;

        if (cell.divideProgress >= 1) {
          // Split into two daughter cells
          const offset = cell.r * 0.7;
          const daughterR = Math.max(24, cell.r * 0.75);

          const c1 = this.createCell(
            cell.x + Math.cos(cell.divideAngle) * offset,
            cell.y + Math.sin(cell.divideAngle) * offset,
            daughterR
          );
          const c2 = this.createCell(
            cell.x - Math.cos(cell.divideAngle) * offset,
            cell.y - Math.sin(cell.divideAngle) * offset,
            daughterR
          );

          this.cells.splice(i, 1);
          newCells.push(c1, c2);
          continue;
        }
      }

      // Draw cellular membrane
      this.drawCellMembrane(ctx, cell, isDark, crtMode);
    }

    if (newCells.length) {
      this.cells.push(...newCells);
    }
  }

  private drawCellMembrane(
    ctx: CanvasRenderingContext2D,
    cell: Cell2,
    isDark: boolean,
    crtMode: 'off' | 'amber' | 'green'
  ): void {
    const points = 36;
    const isDividing = cell.state === 'dividing';
    const divP = cell.divideProgress;

    ctx.save();
    ctx.translate(cell.x, cell.y);

    if (isDividing) {
      ctx.rotate(cell.divideAngle);
    }

    ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      let r =
        cell.r *
        (1 + Math.sin(angle * cell.numLobes + cell.phase) * cell.lobeDepth);

      if (isDividing) {
        // Pinch in along Y axis (cleavage furrow)
        const furrow = Math.abs(Math.sin(angle));
        r *= 1 + divP * 0.6 * Math.abs(Math.cos(angle)) - divP * 0.45 * furrow;
      }

      const px = Math.cos(angle) * r * this.dpr;
      const py = Math.sin(angle) * r * this.dpr;

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    // Fill membrane interior
    if (crtMode === 'amber') {
      ctx.fillStyle = 'rgba(255, 176, 0, 0.035)';
      ctx.strokeStyle = 'rgba(255, 176, 0, 0.18)';
    } else if (crtMode === 'green') {
      ctx.fillStyle = 'rgba(51, 255, 51, 0.035)';
      ctx.strokeStyle = 'rgba(51, 255, 51, 0.18)';
    } else {
      ctx.fillStyle = isDark ? 'rgba(78, 201, 176, 0.04)' : 'rgba(46, 110, 94, 0.03)';
      ctx.strokeStyle = isDark ? 'rgba(78, 201, 176, 0.22)' : 'rgba(46, 110, 94, 0.16)';
    }

    ctx.lineWidth = 1.6 * this.dpr;
    ctx.fill();
    ctx.stroke();

    // Draw Nucleus
    const nX = cell.nucleusX * cell.r * this.dpr;
    const nY = cell.nucleusY * cell.r * this.dpr;
    const nR = cell.r * 0.28 * this.dpr;

    ctx.beginPath();
    ctx.arc(nX, nY, nR, 0, Math.PI * 2);
    ctx.fillStyle = crtMode === 'amber'
      ? 'rgba(255, 176, 0, 0.12)'
      : crtMode === 'green'
      ? 'rgba(51, 255, 51, 0.12)'
      : isDark
      ? 'rgba(78, 201, 176, 0.14)'
      : 'rgba(46, 110, 94, 0.09)';
    ctx.fill();

    // Draw Organelles
    cell.organelles.forEach((org) => {
      const oX = Math.cos(org.angle + cell.phase * 0.5) * (org.dist * cell.r) * this.dpr;
      const oY = Math.sin(org.angle + cell.phase * 0.5) * (org.dist * cell.r) * this.dpr;
      ctx.beginPath();
      ctx.arc(oX, oY, org.size * this.dpr, 0, Math.PI * 2);
      ctx.fillStyle = crtMode === 'amber'
        ? 'rgba(255, 176, 0, 0.08)'
        : crtMode === 'green'
        ? 'rgba(51, 255, 51, 0.08)'
        : isDark
        ? 'rgba(78, 201, 176, 0.10)'
        : 'rgba(46, 110, 94, 0.07)';
      ctx.fill();
    });

    ctx.restore();
  }

  destroy(): void {
    this.cells = [];
    this.atpParticles = [];
  }
}
