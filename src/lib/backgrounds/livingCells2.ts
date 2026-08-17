/**
 * Bioluminescent Living Cells 2.0 Renderer.
 *
 * An elevated biological experience featuring:
 * - Fluid multi-harmonic lipid membranes with subtle subsurface scattering
 * - Fluorescent nuclei & inner chromatin density
 * - Drifting ATP bioluminescent firefly particles
 * - Interactive mitotic cytokinesis: clicking a cell initiates a realistic
 *   cleavage furrow division into two daughter cells
 * - Calibrated alpha transparency ensuring zero foreground distraction
 */
import type { BackgroundPointer, BackgroundRenderer } from './types';

interface ATPParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  pulsePhase: number;
  pulseSpeed: number;
}

interface Cell2 {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetRadius: number;
  radius: number;
  angle: number;
  vAngle: number;
  wobblePhase: number;
  wobbleSpeed: number;
  harmonics: number[];
  nucleusOffset: { x: number; y: number };
  organelles: { angle: number; dist: number; size: number; color: 'accent' | 'ink' }[];
  life: number; // 0..1
  state: 'entering' | 'live' | 'dividing' | 'exiting';
  // Mitosis properties
  divideProgress?: number; // 0..1
  divideAngle?: number;
  glowIntensity: number;
}

const TAU = Math.PI * 2;
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

export class LivingCells2Renderer implements BackgroundRenderer {
  readonly mode = 'cells2' as const;

  private cells: Cell2[] = [];
  private particles: ATPParticle[] = [];
  private width = 0;
  private height = 0;
  private baseCount = 0;
  private maxCount = 0;
  private tick = 0;
  private nextAutoDivide = 400;

  init(_canvas: HTMLCanvasElement, _ctx: CanvasRenderingContext2D, _dpr: number): void {
    this.seed();
  }

  resize(width: number, height: number, _dpr: number): void {
    this.width = width;
    this.height = height;
    const isCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    const target = Math.round((width * height) / (isCoarse ? 56000 : 50000));
    this.baseCount = Math.max(isCoarse ? 4 : 5, Math.min(isCoarse ? 8 : 12, target));
    this.maxCount = this.baseCount + 3;

    if (this.cells.length === 0) {
      this.seed();
    }
  }

  private seed(): void {
    this.cells = Array.from({ length: this.baseCount || 7 }, () => this.createCell());
    this.particles = Array.from({ length: 30 }, () => this.createParticle());
  }

  private createParticle(x?: number, y?: number): ATPParticle {
    return {
      x: x ?? rand(0, this.width || 800),
      y: y ?? rand(0, this.height || 600),
      vx: rand(-0.15, 0.15),
      vy: rand(-0.15, 0.15),
      size: rand(1.2, 2.5),
      alpha: rand(0.3, 0.7),
      pulsePhase: rand(0, TAU),
      pulseSpeed: rand(0.015, 0.04),
    };
  }

  private createCell(x?: number, y?: number, fresh = false, targetR?: number): Cell2 {
    const r = targetR ?? rand(30, 72);
    return {
      x: x ?? rand(0, this.width || 800),
      y: y ?? rand(0, this.height || 600),
      vx: rand(-0.14, 0.14),
      vy: rand(-0.14, 0.14),
      targetRadius: r,
      radius: fresh ? 0 : r,
      angle: rand(0, TAU),
      vAngle: rand(-0.0012, 0.0012),
      wobblePhase: rand(0, TAU),
      wobbleSpeed: rand(0.004, 0.008),
      harmonics: [rand(0.08, 0.14), rand(0.04, 0.08), rand(0.02, 0.05)],
      nucleusOffset: { x: rand(-0.16, 0.16), y: rand(-0.16, 0.16) },
      organelles: Array.from({ length: Math.random() < 0.65 ? 3 : 2 }, () => ({
        angle: rand(0, TAU),
        dist: rand(0.3, 0.65),
        size: rand(1.8, 3.2),
        color: Math.random() < 0.5 ? 'accent' : 'ink',
      })),
      life: fresh ? 0 : 1,
      state: fresh ? 'entering' : 'live',
      glowIntensity: 1,
    };
  }

  onPointerMove(_x: number, _y: number): void {}

  onClick(x: number, y: number): void {
    // Check if clicked near an existing cell to trigger mitosis
    for (const cell of this.cells) {
      if (cell.state === 'live') {
        const dist = Math.hypot(cell.x - x, cell.y - y);
        if (dist < cell.radius * 1.3) {
          this.triggerMitosis(cell);
          return;
        }
      }
    }

    // Otherwise, create a gentle new cell embryo and a burst of ATP particles
    if (this.cells.length < this.maxCount + 2) {
      const newCell = this.createCell(x, y, true, rand(35, 55));
      this.cells.push(newCell);
      for (let i = 0; i < 8; i++) {
        const a = rand(0, TAU);
        const p = this.createParticle(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
        p.vx = Math.cos(a) * rand(0.4, 1.2);
        p.vy = Math.sin(a) * rand(0.4, 1.2);
        this.particles.push(p);
      }
    }
  }

  private triggerMitosis(cell: Cell2): void {
    if (cell.state !== 'live') return;
    cell.state = 'dividing';
    cell.divideProgress = 0;
    cell.divideAngle = rand(0, Math.PI);
    cell.glowIntensity = 2.2;
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    pointer: BackgroundPointer,
    isDark: boolean,
    isCrt: boolean
  ): void {
    this.width = width;
    this.height = height;
    this.tick++;

    const accentRgb = isCrt ? '51, 255, 51' : isDark ? '80, 200, 180' : '46, 110, 94';
    const inkRgb = isCrt ? '51, 255, 51' : isDark ? '230, 230, 230' : '20, 20, 20';
    const glowRgb = isCrt ? '51, 255, 51' : isDark ? '120, 230, 210' : '60, 140, 120';

    // 1. Update & Render ATP particles
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.pulsePhase += p.pulseSpeed;

      if (p.x < 0) p.x = width;
      else if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      else if (p.y > height) p.y = 0;

      const alphaPulse = p.alpha * (0.6 + 0.4 * Math.sin(p.pulsePhase));
      const particleAlpha = isDark ? alphaPulse * 0.45 : alphaPulse * 0.25;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fillStyle = `rgba(${glowRgb}, ${particleAlpha})`;
      ctx.fill();
    }

    // Keep particles array bounded
    if (this.particles.length > 40) {
      this.particles.splice(0, this.particles.length - 40);
    }

    // 2. Update Cells
    for (let i = this.cells.length - 1; i >= 0; i--) {
      const cell = this.cells[i];
      cell.x += cell.vx;
      cell.y += cell.vy;
      cell.angle += cell.vAngle;
      cell.wobblePhase += cell.wobbleSpeed;

      // Wrap boundaries smoothly
      const margin = cell.radius * 1.5;
      if (cell.x < -margin) cell.x = width + margin;
      else if (cell.x > width + margin) cell.x = -margin;
      if (cell.y < -margin) cell.y = height + margin;
      else if (cell.y > height + margin) cell.y = -margin;

      // State transitions
      if (cell.state === 'entering') {
        cell.life += 0.015;
        cell.radius = cell.targetRadius * easeInOutQuad(Math.min(1, cell.life));
        if (cell.life >= 1) {
          cell.life = 1;
          cell.state = 'live';
        }
      } else if (cell.state === 'dividing') {
        cell.divideProgress = (cell.divideProgress || 0) + 0.012;
        cell.glowIntensity = Math.max(1, cell.glowIntensity - 0.015);

        if (cell.divideProgress >= 1) {
          // Complete division: spawn two daughter cells
          const angle = cell.divideAngle || 0;
          const offsetDist = cell.radius * 0.55;
          const daughterR = cell.radius * 0.78;

          const daughter1 = this.createCell(
            cell.x + Math.cos(angle) * offsetDist,
            cell.y + Math.sin(angle) * offsetDist,
            false,
            daughterR
          );
          daughter1.vx = cell.vx + Math.cos(angle) * 0.08;
          daughter1.vy = cell.vy + Math.sin(angle) * 0.08;

          const daughter2 = this.createCell(
            cell.x - Math.cos(angle) * offsetDist,
            cell.y - Math.sin(angle) * offsetDist,
            false,
            daughterR
          );
          daughter2.vx = cell.vx - Math.cos(angle) * 0.08;
          daughter2.vy = cell.vy - Math.sin(angle) * 0.08;

          // Spawn burst of ATP particles at cleavage furrow
          for (let k = 0; k < 6; k++) {
            const p = this.createParticle(cell.x, cell.y);
            const a = rand(0, TAU);
            p.vx = Math.cos(a) * rand(0.3, 0.8);
            p.vy = Math.sin(a) * rand(0.3, 0.8);
            this.particles.push(p);
          }

          this.cells.splice(i, 1, daughter1, daughter2);
          continue;
        }
      } else if (cell.state === 'exiting') {
        cell.life -= 0.01;
        if (cell.life <= 0) {
          this.cells.splice(i, 1);
          continue;
        }
      }
    }

    const liveN = this.cells.reduce((count, c) => (c.state !== 'exiting' ? count + 1 : count), 0);

    // Natural occasional mitosis
    if (this.tick > this.nextAutoDivide && liveN < this.maxCount) {
      const candidates = this.cells.filter((c) => c.state === 'live');
      if (candidates.length) {
        const parent = candidates[(Math.random() * candidates.length) | 0];
        this.triggerMitosis(parent);
      }
      this.nextAutoDivide = this.tick + (rand(600, 1200) | 0);
    }

    // Natural gentle cull when above density baseline
    if (liveN > this.baseCount && Math.random() < 0.0035) {
      const candidates = this.cells.filter((c) => c.state === 'live');
      if (candidates.length) {
        candidates[(Math.random() * candidates.length) | 0].state = 'exiting';
      }
    }

    // 3. Render Each Cell
    for (const cell of this.cells) {
      this.renderCell(ctx, cell, pointer, accentRgb, inkRgb, glowRgb, isDark);
    }
  }

  private renderCell(
    ctx: CanvasRenderingContext2D,
    cell: Cell2,
    pointer: BackgroundPointer,
    accentRgb: string,
    inkRgb: string,
    glowRgb: string,
    isDark: boolean
  ): void {
    let px = cell.x;
    let py = cell.y;
    let brightness = cell.glowIntensity;

    if (pointer.isActive) {
      const dx = cell.x - pointer.x;
      const dy = cell.y - pointer.y;
      const dist = Math.hypot(dx, dy) || 1;
      const influenceRadius = 180;
      if (dist < influenceRadius) {
        const factor = 1 - dist / influenceRadius;
        px += (dx / dist) * factor * 26;
        py += (dy / dist) * factor * 26;
        brightness += factor * 0.8;
      }
    }

    const alpha = cell.life;
    const r = cell.radius;
    if (r <= 1) return;

    // Handle dividing cell geometry (cleavage furrow)
    if (cell.state === 'dividing' && cell.divideProgress !== undefined) {
      const prog = cell.divideProgress;
      const angle = cell.divideAngle || 0;
      const pinch = Math.sin(prog * Math.PI) * 0.45;
      const stretch = 1 + prog * 0.4;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);

      // Cleavage furrow double lobe
      ctx.beginPath();
      const SEGMENTS = 36;
      for (let i = 0; i <= SEGMENTS; i++) {
        const theta = (i / SEGMENTS) * TAU;
        // Dumbbell shape formula
        const dumbbell = 1 - pinch * Math.cos(2 * theta);
        const rad = r * dumbbell;
        const lx = Math.cos(theta) * rad * stretch;
        const ly = Math.sin(theta) * rad;
        if (i === 0) ctx.moveTo(lx, ly);
        else ctx.lineTo(lx, ly);
      }
      ctx.closePath();

      // Lipid interior & glow
      const fill = ctx.createRadialGradient(0, 0, 0, 0, 0, r * stretch);
      fill.addColorStop(0, `rgba(${accentRgb}, ${0.045 * brightness * alpha})`);
      fill.addColorStop(0.7, `rgba(${glowRgb}, ${0.02 * brightness * alpha})`);
      fill.addColorStop(1, `rgba(${accentRgb}, 0)`);
      ctx.fillStyle = fill;
      ctx.fill();

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${0.07 * brightness * alpha})`;
      ctx.stroke();

      // Dividing dual nuclei
      const nOffset = r * 0.35 * (0.3 + prog * 0.7);
      const nucR = r * 0.22 * (1 - prog * 0.15);

      for (const side of [-1, 1]) {
        const nx = side * nOffset * stretch;
        ctx.beginPath();
        ctx.arc(nx, 0, nucR, 0, TAU);
        ctx.fillStyle = `rgba(${accentRgb}, ${0.06 * brightness * alpha})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(nx, 0, nucR * 0.4, 0, TAU);
        ctx.fillStyle = `rgba(${inkRgb}, ${0.05 * brightness * alpha})`;
        ctx.fill();
      }

      ctx.restore();
      return;
    }

    // Normal non-dividing organic cell membrane
    ctx.beginPath();
    const SEGMENTS = 28;
    for (let i = 0; i <= SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * TAU;
      const h1 = cell.harmonics[0] * Math.sin(theta * 3 + cell.wobblePhase);
      const h2 = cell.harmonics[1] * Math.sin(theta * 5 - cell.wobblePhase * 0.8);
      const h3 = cell.harmonics[2] * Math.sin(theta * 7 + cell.wobblePhase * 1.2);
      const wobble = 1 + h1 + h2 + h3;
      const currentR = r * wobble;
      const lx = px + Math.cos(theta + cell.angle) * currentR;
      const ly = py + Math.sin(theta + cell.angle) * currentR;

      if (i === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    }
    ctx.closePath();

    // Subsurface scattering interior gradient
    const fill = ctx.createRadialGradient(px, py, 0, px, py, r || 1);
    fill.addColorStop(0, `rgba(${accentRgb}, ${0.038 * brightness * alpha})`);
    fill.addColorStop(0.65, `rgba(${glowRgb}, ${0.018 * brightness * alpha})`);
    fill.addColorStop(1, `rgba(${accentRgb}, 0)`);
    ctx.fillStyle = fill;
    ctx.fill();

    // Outer membrane lipid line
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${0.055 * brightness * alpha})`;
    ctx.stroke();

    // Nucleus & inner chromatin
    const ncx = px + cell.nucleusOffset.x * r;
    const ncy = py + cell.nucleusOffset.y * r;
    const nucRadius = r * 0.28;

    ctx.beginPath();
    ctx.arc(ncx, ncy, nucRadius, 0, TAU);
    ctx.fillStyle = `rgba(${accentRgb}, ${0.05 * brightness * alpha})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ncx, ncy, nucRadius * 0.4, 0, TAU);
    ctx.fillStyle = `rgba(${inkRgb}, ${0.045 * brightness * alpha})`;
    ctx.fill();

    // Organelles (Mitochondria & Ribosome clusters)
    for (const org of cell.organelles) {
      const ox = px + Math.cos(org.angle + cell.angle) * r * org.dist;
      const oy = py + Math.sin(org.angle + cell.angle) * r * org.dist;
      ctx.beginPath();
      ctx.arc(ox, oy, org.size, 0, TAU);
      ctx.fillStyle = org.color === 'accent' ? `rgba(${accentRgb}, ${0.04 * alpha})` : `rgba(${inkRgb}, ${0.035 * alpha})`;
      ctx.fill();
    }
  }

  destroy(): void {
    this.cells = [];
    this.particles = [];
  }
}
