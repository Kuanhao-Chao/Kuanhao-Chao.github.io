/**
 * Classic Living Cells Renderer.
 *
 * Preserves the original beloved soft ambient biological cell field verbatim.
 */
import type { BackgroundPointer, BackgroundRenderer } from './types';

interface Cell {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  spin: number;
  vspin: number;
  phase: number;
  vphase: number;
  nx: number;
  ny: number;
  orgs: { a: number; d: number; s: number }[];
  life: number;
  state: 'in' | 'live' | 'out';
}

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

export class ClassicCellsRenderer implements BackgroundRenderer {
  readonly mode = 'classic' as const;

  private cells: Cell[] = [];
  private width = 0;
  private height = 0;
  private baseCount = 0;
  private maxCount = 0;
  private tick = 0;
  private nextDivide = 300;

  init(_canvas: HTMLCanvasElement, _ctx: CanvasRenderingContext2D, _dpr: number): void {
    this.seed();
  }

  resize(width: number, height: number, _dpr: number): void {
    this.width = width;
    this.height = height;
    const isCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    const target = Math.round((width * height) / (isCoarse ? 52000 : 48000));
    this.baseCount = Math.max(isCoarse ? 4 : 5, Math.min(isCoarse ? 9 : 14, target));
    this.maxCount = this.baseCount + 2;

    if (this.cells.length === 0) {
      this.seed();
    }
  }

  private seed(): void {
    this.cells = Array.from({ length: this.baseCount || 8 }, () => this.makeCell());
  }

  private makeCell(x?: number, y?: number, fresh = false): Cell {
    return {
      x: x ?? rand(0, this.width || 800),
      y: y ?? rand(0, this.height || 600),
      vx: rand(-0.16, 0.16),
      vy: rand(-0.16, 0.16),
      r: rand(26, 68),
      spin: rand(0, TAU),
      vspin: rand(-0.0016, 0.0016),
      phase: rand(0, TAU),
      vphase: rand(0.003, 0.006),
      nx: rand(-0.18, 0.18),
      ny: rand(-0.18, 0.18),
      orgs: Array.from({ length: Math.random() < 0.6 ? 2 : 1 }, () => ({
        a: rand(0, TAU),
        d: rand(0.25, 0.6),
        s: rand(1.4, 2.6),
      })),
      life: fresh ? 0 : 1,
      state: fresh ? 'in' : 'live',
    };
  }

  onPointerMove(_x: number, _y: number): void {}

  onClick(x: number, y: number): void {
    // Interactive division on click if clicked near a live cell
    for (const p of this.cells) {
      if (p.state === 'live') {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < p.r * 1.2) {
          const ang = Math.random() * TAU;
          const child = this.makeCell(p.x + Math.cos(ang) * (p.r * 0.4), p.y + Math.sin(ang) * (p.r * 0.4), true);
          child.vx = p.vx + Math.cos(ang) * 0.15;
          child.vy = p.vy + Math.sin(ang) * 0.15;
          child.r = p.r * 0.85;
          this.cells.push(child);
          break;
        }
      }
    }
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

    const inkRgb = isCrt ? '51, 255, 51' : isDark ? '230, 230, 230' : '20, 20, 20';
    const accentRgb = isCrt ? '51, 255, 51' : isDark ? '80, 180, 160' : '46, 110, 94';

    for (const c of this.cells) {
      c.x += c.vx;
      c.y += c.vy;
      c.spin += c.vspin;
      c.phase += c.vphase;
      const m = c.r * 1.4;
      if (c.x < -m) c.x = width + m;
      else if (c.x > width + m) c.x = -m;
      if (c.y < -m) c.y = height + m;
      else if (c.y > height + m) c.y = -m;

      if (c.state === 'in') {
        c.life += 0.014;
        if (c.life >= 1) {
          c.life = 1;
          c.state = 'live';
        }
      } else if (c.state === 'out') {
        c.life -= 0.012;
      }
    }

    this.cells = this.cells.filter((c) => !(c.state === 'out' && c.life <= 0));
    const liveN = this.cells.reduce((n, c) => (c.state !== 'out' ? n + 1 : n), 0);

    // Natural cell division
    if (this.tick > this.nextDivide && liveN < this.maxCount) {
      const parents = this.cells.filter((c) => c.state === 'live');
      if (parents.length) {
        const p = parents[(Math.random() * parents.length) | 0];
        const ang = Math.random() * TAU;
        const child = this.makeCell(p.x + Math.cos(ang) * (p.r * 0.5), p.y + Math.sin(ang) * (p.r * 0.5), true);
        child.vx = p.vx + Math.cos(ang) * 0.06;
        child.vy = p.vy + Math.sin(ang) * 0.06;
        child.r = p.r * rand(0.7, 0.95);
        this.cells.push(child);
      }
      this.nextDivide = this.tick + (rand(520, 1100) | 0);
    }

    // Natural cull
    if (liveN > this.baseCount && Math.random() < 0.004) {
      const live = this.cells.filter((c) => c.state === 'live');
      if (live.length) live[(Math.random() * live.length) | 0].state = 'out';
    }

    // Draw all cells
    for (const c of this.cells) {
      const grow = ease(c.life);
      const a = c.life;
      let px = c.x;
      let py = c.y;
      let bright = 1;

      if (pointer.isActive) {
        const dx = c.x - pointer.x;
        const dy = c.y - pointer.y;
        const d = Math.hypot(dx, dy) || 1;
        const R = 175;
        if (d < R) {
          const f = 1 - d / R;
          px += (dx / d) * f * 24;
          py += (dy / d) * f * 24;
          bright = 1 + f * 0.9;
        }
      }

      const r = c.r * grow;

      // Membrane
      ctx.beginPath();
      const SEG = 22;
      for (let i = 0; i <= SEG; i++) {
        const ang = (i / SEG) * TAU;
        const wob = 1 + 0.1 * Math.sin(ang * 3 + c.phase) + 0.055 * Math.sin(ang * 5 - c.phase * 0.7);
        const rr = r * wob;
        const x = px + Math.cos(ang + c.spin) * rr;
        const y = py + Math.sin(ang + c.spin) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      const fill = ctx.createRadialGradient(px, py, 0, px, py, r || 1);
      fill.addColorStop(0, `rgba(${accentRgb}, ${0.026 * bright * a})`);
      fill.addColorStop(1, `rgba(${accentRgb}, 0)`);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${inkRgb}, ${0.04 * bright * a})`;
      ctx.stroke();

      // Nucleus + nucleolus
      const ncx = px + c.nx * r;
      const ncy = py + c.ny * r;
      const nucR = r * 0.3;
      ctx.beginPath();
      ctx.arc(ncx, ncy, nucR, 0, TAU);
      ctx.fillStyle = `rgba(${accentRgb}, ${0.038 * bright * a})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ncx, ncy, nucR * 0.4, 0, TAU);
      ctx.fillStyle = `rgba(${inkRgb}, ${0.032 * bright * a})`;
      ctx.fill();

      // Organelles
      for (const o of c.orgs) {
        ctx.beginPath();
        ctx.arc(px + Math.cos(o.a) * r * o.d, py + Math.sin(o.a) * r * o.d, o.s, 0, TAU);
        ctx.fillStyle = `rgba(${inkRgb}, ${0.026 * a})`;
        ctx.fill();
      }
    }
  }

  destroy(): void {
    this.cells = [];
  }
}
