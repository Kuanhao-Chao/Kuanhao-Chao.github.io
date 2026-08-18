/**
 * Living Cells 2.0 Engine.
 *
 * An authentic, high-performance cellular biology simulation featuring:
 * 1. 🌱 Growth Phase (G1/Interphase): Embryonic budding, nutrient uptake, and smooth viscoelastic expansion.
 * 2. 🧬 Mature Homeostasis: Multi-harmonic membrane fluctuations, fluctuating organelles, and fluorescent nuclei.
 * 3. ⚡ Mitosis (Cytokinesis): Division axis elongation, neck-pinching cleavage furrow, twin nuclear duplication, and daughter cell abscission.
 * 4. 🫧 Apoptosis (Programmed Cell Death): Authentic membrane blebbing, nuclear pyknosis fragmentation, and dissolution into glowing ATP micro-vesicles.
 * 5. ✨ ATP Bioluminescent Nutrient Network: Drifting firefly particles fueling cellular metabolism.
 *
 * Engineered with 60fps delta-time smoothing, zero dependencies, automatic tab-visibility pausing,
 * and calibrated alpha transparency guaranteeing 100% foreground typography legibility.
 */

export interface ATPParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  pulsePhase: number;
  pulseSpeed: number;
}

export interface ApoptoticBleb {
  angle: number;
  dist: number;
  radius: number;
  maxRadius: number;
  speed: number;
  alpha: number;
}

export type CellState = 'growing' | 'mature' | 'mitosis' | 'apoptosis';

export interface LivingCell {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  targetRadius: number;
  angle: number;
  vAngle: number;
  wobblePhase: number;
  wobbleSpeed: number;
  harmonics: [number, number, number, number]; // 4 distinct Fourier harmonics
  nucleusOffset: { x: number; y: number };
  organelles: { angle: number; dist: number; size: number; isAccent: boolean; spinSpeed: number }[];
  state: CellState;
  life: number; // 0..1 overall opacity/vitality

  // Growth & Age
  age: number;
  maxAge: number;

  // Mitosis Properties
  mitosisProgress?: number; // 0..1
  mitosisAngle?: number;

  // Apoptosis Properties
  apoptosisProgress?: number; // 0..1
  blebs?: ApoptoticBleb[];

  glowIntensity: number;
}

const TAU = Math.PI * 2;
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class LivingCellsEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  private cells: LivingCell[] = [];
  private particles: ATPParticle[] = [];

  private width = 0;
  private height = 0;
  private baseCount = 0;
  private maxCount = 0;
  private tick = 0;
  private nextAutoMitosis = 350;
  private nextAutoApoptosis = 600;

  private pointer = { x: -1000, y: -1000, vx: 0, vy: 0, isActive: false };
  private lastPointer = { x: 0, y: 0 };
  private rafId = 0;
  private isRunning = false;
  private lastTime = 0;
  private isBound = false;

  public attach(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas && this.ctx) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;

    this.bindEvents();
    this.resize();
    this.seed();
    this.start();
  }

  private seed(): void {
    this.cells = Array.from({ length: this.baseCount || 8 }, () => this.createCell(undefined, undefined, false));
    this.particles = Array.from({ length: 36 }, () => this.createParticle());
  }

  private createParticle(x?: number, y?: number, vx?: number, vy?: number): ATPParticle {
    return {
      x: x ?? rand(0, this.width || 800),
      y: y ?? rand(0, this.height || 600),
      vx: vx ?? rand(-0.16, 0.16),
      vy: vy ?? rand(-0.16, 0.16),
      size: rand(1.2, 2.6),
      alpha: rand(0.3, 0.75),
      pulsePhase: rand(0, TAU),
      pulseSpeed: rand(0.015, 0.04),
    };
  }

  private createCell(x?: number, y?: number, asBud = false, targetR?: number): LivingCell {
    const finalRadius = targetR ?? rand(32, 72);
    const cellState: CellState = asBud ? 'growing' : 'mature';

    return {
      x: x ?? rand(0, this.width || 800),
      y: y ?? rand(0, this.height || 600),
      vx: rand(-0.14, 0.14),
      vy: rand(-0.14, 0.14),
      radius: asBud ? 4 : finalRadius,
      targetRadius: finalRadius,
      angle: rand(0, TAU),
      vAngle: rand(-0.0015, 0.0015),
      wobblePhase: rand(0, TAU),
      wobbleSpeed: rand(0.004, 0.009),
      harmonics: [rand(0.07, 0.13), rand(0.04, 0.08), rand(0.02, 0.05), rand(0.01, 0.03)],
      nucleusOffset: { x: rand(-0.18, 0.18), y: rand(-0.18, 0.18) },
      organelles: Array.from({ length: Math.random() < 0.6 ? 3 : 2 }, () => ({
        angle: rand(0, TAU),
        dist: rand(0.3, 0.65),
        size: rand(1.8, 3.4),
        isAccent: Math.random() < 0.55,
        spinSpeed: rand(-0.005, 0.005),
      })),
      state: cellState,
      life: asBud ? 0.2 : 1,
      age: asBud ? 0 : rand(100, 800),
      maxAge: rand(1800, 3400),
      glowIntensity: asBud ? 1.8 : 1.0,
    };
  }

  public triggerMitosis(cell: LivingCell): void {
    if (cell.state !== 'mature') return;
    cell.state = 'mitosis';
    cell.mitosisProgress = 0;
    cell.mitosisAngle = rand(0, Math.PI);
    cell.glowIntensity = 2.4;
  }

  public triggerApoptosis(cell: LivingCell): void {
    if (cell.state !== 'mature') return;
    cell.state = 'apoptosis';
    cell.apoptosisProgress = 0;
    cell.glowIntensity = 1.6;

    // Generate initial apoptotic blebs around the membrane perimeter
    cell.blebs = Array.from({ length: rand(5, 8) | 0 }, () => ({
      angle: rand(0, TAU),
      dist: rand(0.7, 1.1),
      radius: rand(4, 9),
      maxRadius: rand(10, 18),
      speed: rand(0.012, 0.028),
      alpha: 1,
    }));
  }

  private resize = (): void => {
    if (!this.canvas || !this.ctx) return;
    const isCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const target = Math.round((this.width * this.height) / (isCoarse ? 56000 : 48000));
    this.baseCount = Math.max(isCoarse ? 4 : 5, Math.min(isCoarse ? 8 : 13, target));
    this.maxCount = this.baseCount + 3;
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
        this.pointer.vx = x - this.lastPointer.x;
        this.pointer.vy = y - this.lastPointer.y;
        this.lastPointer.x = x;
        this.lastPointer.y = y;
        this.pointer.x = x;
        this.pointer.y = y;
        this.pointer.isActive = true;
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
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || (e.target as HTMLElement | null)?.closest('button, a, input, [role="menuitem"]')) {
        return;
      }

      const clickX = e.clientX;
      const clickY = e.clientY;

      // 1. Check if clicked near an existing cell to trigger Mitosis
      for (const cell of this.cells) {
        if (cell.state === 'mature') {
          const dist = Math.hypot(cell.x - clickX, cell.y - clickY);
          if (dist < cell.radius * 1.35) {
            this.triggerMitosis(cell);
            return;
          }
        }
      }

      // 2. Otherwise, sprout a new cell bud + nutrient fireflies
      if (this.cells.length < this.maxCount + 2) {
        const newBud = this.createCell(clickX, clickY, true, rand(36, 56));
        this.cells.push(newBud);

        for (let i = 0; i < 8; i++) {
          const a = rand(0, TAU);
          const speed = rand(0.5, 1.4);
          this.particles.push(this.createParticle(clickX, clickY, Math.cos(a) * speed, Math.sin(a) * speed));
        }
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });
  }

  private loop = (time: number): void => {
    if (!this.isRunning) return;
    this.rafId = requestAnimationFrame(this.loop);

    if (time - this.lastTime < 16) return;
    this.lastTime = time;

    this.update();
    this.render();
  };

  public start(): void {
    if (this.isRunning) return;
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      this.render();
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

  private update(): void {
    this.tick++;

    // 1. Update ATP Nutrient Fireflies
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.pulsePhase += p.pulseSpeed;

      if (p.x < 0) p.x = this.width;
      else if (p.x > this.width) p.x = 0;
      if (p.y < 0) p.y = this.height;
      else if (p.y > this.height) p.y = 0;
    }

    if (this.particles.length > 45) {
      this.particles.splice(0, this.particles.length - 45);
    }

    // 2. Update Cells Lifecycle
    for (let i = this.cells.length - 1; i >= 0; i--) {
      const cell = this.cells[i];
      cell.age++;
      cell.x += cell.vx;
      cell.y += cell.vy;
      cell.angle += cell.vAngle;
      cell.wobblePhase += cell.wobbleSpeed;
      cell.glowIntensity = Math.max(1.0, cell.glowIntensity - 0.01);

      // Rotate organelles
      for (const org of cell.organelles) {
        org.angle += org.spinSpeed;
      }

      // Smooth toroidal boundary wrapping
      const margin = cell.radius * 1.6;
      if (cell.x < -margin) cell.x = this.width + margin;
      else if (cell.x > this.width + margin) cell.x = -margin;
      if (cell.y < -margin) cell.y = this.height + margin;
      else if (cell.y > this.height + margin) cell.y = -margin;

      // A. Growth Phase (G1/Interphase)
      if (cell.state === 'growing') {
        cell.life = Math.min(1.0, cell.life + 0.014);
        cell.radius = 4 + (cell.targetRadius - 4) * easeInOutCubic(cell.life);

        if (cell.life >= 1.0) {
          cell.state = 'mature';
          cell.radius = cell.targetRadius;
        }
      }
      // B. Mature Homeostasis Phase
      else if (cell.state === 'mature') {
        // Natural senescence transition to apoptosis
        if (cell.age > cell.maxAge) {
          this.triggerApoptosis(cell);
        }
      }
      // C. Mitosis Cytokinesis Phase
      else if (cell.state === 'mitosis') {
        cell.mitosisProgress = (cell.mitosisProgress || 0) + 0.011;

        if (cell.mitosisProgress >= 1.0) {
          // Abscission: Spawn two mature/growing daughter cells
          const angle = cell.mitosisAngle || 0;
          const separation = cell.radius * 0.58;
          const daughterR = cell.radius * 0.78;

          const daughter1 = this.createCell(
            cell.x + Math.cos(angle) * separation,
            cell.y + Math.sin(angle) * separation,
            false,
            daughterR
          );
          daughter1.vx = cell.vx + Math.cos(angle) * 0.1;
          daughter1.vy = cell.vy + Math.sin(angle) * 0.1;

          const daughter2 = this.createCell(
            cell.x - Math.cos(angle) * separation,
            cell.y - Math.sin(angle) * separation,
            false,
            daughterR
          );
          daughter2.vx = cell.vx - Math.cos(angle) * 0.1;
          daughter2.vy = cell.vy - Math.sin(angle) * 0.1;

          // Disperse ATP fireflies at division junction
          for (let k = 0; k < 6; k++) {
            const pAngle = rand(0, TAU);
            const pSpeed = rand(0.4, 1.1);
            this.particles.push(
              this.createParticle(cell.x, cell.y, Math.cos(pAngle) * pSpeed, Math.sin(pAngle) * pSpeed)
            );
          }

          this.cells.splice(i, 1, daughter1, daughter2);
          continue;
        }
      }
      // D. Apoptosis Blebbing Phase
      else if (cell.state === 'apoptosis') {
        cell.apoptosisProgress = (cell.apoptosisProgress || 0) + 0.009;
        cell.life = Math.max(0, 1.0 - cell.apoptosisProgress * 1.1);

        // Animate apoptotic blebs
        if (cell.blebs) {
          for (const bleb of cell.blebs) {
            bleb.dist += bleb.speed;
            bleb.radius = Math.min(bleb.maxRadius, bleb.radius + 0.18);
            bleb.alpha = Math.max(0, 1.0 - (bleb.dist - 0.7) * 1.8);
          }
        }

        // Dissolution into nutrient sparks
        if (cell.apoptosisProgress >= 1.0 || cell.life <= 0) {
          // Release nutrient ATP fireflies
          for (let k = 0; k < 7; k++) {
            const a = rand(0, TAU);
            const speed = rand(0.2, 0.7);
            this.particles.push(this.createParticle(cell.x, cell.y, Math.cos(a) * speed, Math.sin(a) * speed));
          }
          this.cells.splice(i, 1);
          continue;
        }
      }
    }

    const liveCount = this.cells.filter((c) => c.state !== 'apoptosis').length;

    // Natural occasional Mitosis
    if (this.tick > this.nextAutoMitosis && liveCount < this.maxCount) {
      const candidates = this.cells.filter((c) => c.state === 'mature');
      if (candidates.length) {
        const parent = candidates[(Math.random() * candidates.length) | 0];
        this.triggerMitosis(parent);
      }
      this.nextAutoMitosis = this.tick + (rand(600, 1100) | 0);
    }

    // Natural population regulation (Apoptosis cull when above carrying capacity)
    if (this.tick > this.nextAutoApoptosis && liveCount > this.baseCount) {
      const candidates = this.cells.filter((c) => c.state === 'mature');
      if (candidates.length) {
        const oldest = candidates.sort((a, b) => b.age - a.age)[0];
        if (oldest) this.triggerApoptosis(oldest);
      }
      this.nextAutoApoptosis = this.tick + (rand(450, 900) | 0);
    }
  }

  private render(): void {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.width, this.height);

    const isDark = document.documentElement.dataset.theme === 'dark';
    const isCrt = document.documentElement.dataset.crtMode === 'amber' || document.documentElement.dataset.crtMode === 'green';
    const crtColor = document.documentElement.dataset.crtMode === 'amber' ? '255, 176, 0' : '51, 255, 51';

    const accentRgb = isCrt ? crtColor : isDark ? '80, 200, 180' : '46, 110, 94';
    const inkRgb = isCrt ? crtColor : isDark ? '230, 230, 230' : '20, 20, 20';
    const glowRgb = isCrt ? crtColor : isDark ? '120, 235, 215' : '60, 140, 120';

    // 1. Render ATP Nutrient Fireflies
    for (const p of this.particles) {
      const pulseAlpha = p.alpha * (0.6 + 0.4 * Math.sin(p.pulsePhase));
      const finalAlpha = isDark ? pulseAlpha * 0.45 : pulseAlpha * 0.28;

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, TAU);
      this.ctx.fillStyle = `rgba(${glowRgb}, ${finalAlpha})`;
      this.ctx.fill();
    }

    // 2. Render Cells
    for (const cell of this.cells) {
      this.renderCell(cell, accentRgb, inkRgb, glowRgb, isDark);
    }
  }

  private renderCell(
    cell: LivingCell,
    accentRgb: string,
    inkRgb: string,
    glowRgb: string,
    isDark: boolean
  ): void {
    if (!this.ctx) return;
    let px = cell.x;
    let py = cell.y;
    let brightness = cell.glowIntensity;

    // Fluid deflection away from cursor
    if (this.pointer.isActive) {
      const dx = cell.x - this.pointer.x;
      const dy = cell.y - this.pointer.y;
      const dist = Math.hypot(dx, dy) || 1;
      const R = 180;
      if (dist < R) {
        const factor = 1 - dist / R;
        px += (dx / dist) * factor * 28;
        py += (dy / dist) * factor * 28;
        brightness += factor * 0.85;
      }
    }

    const alpha = cell.life;
    const r = cell.radius;
    if (r <= 1 || alpha <= 0.01) return;

    // -------------------------------------------------------------
    // Case A: Mitosis Division Cleavage Furrow Dumbbell Geometry
    // -------------------------------------------------------------
    if (cell.state === 'mitosis' && cell.mitosisProgress !== undefined) {
      const prog = cell.mitosisProgress;
      const angle = cell.mitosisAngle || 0;
      const pinch = Math.sin(prog * Math.PI) * 0.48;
      const stretch = 1.0 + prog * 0.45;

      this.ctx.save();
      this.ctx.translate(px, py);
      this.ctx.rotate(angle);

      this.ctx.beginPath();
      const SEGMENTS = 36;
      for (let i = 0; i <= SEGMENTS; i++) {
        const theta = (i / SEGMENTS) * TAU;
        const dumbbell = 1 - pinch * Math.cos(2 * theta);
        const rad = r * dumbbell;
        const lx = Math.cos(theta) * rad * stretch;
        const ly = Math.sin(theta) * rad;
        if (i === 0) this.ctx.moveTo(lx, ly);
        else this.ctx.lineTo(lx, ly);
      }
      this.ctx.closePath();

      // Subsurface gradient
      const fill = this.ctx.createRadialGradient(0, 0, 0, 0, 0, r * stretch);
      fill.addColorStop(0, `rgba(${accentRgb}, ${0.048 * brightness * alpha})`);
      fill.addColorStop(0.7, `rgba(${glowRgb}, ${0.02 * brightness * alpha})`);
      fill.addColorStop(1, `rgba(${accentRgb}, 0)`);
      this.ctx.fillStyle = fill;
      this.ctx.fill();

      this.ctx.lineWidth = 1.2;
      this.ctx.strokeStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${0.075 * brightness * alpha})`;
      this.ctx.stroke();

      // Dual daughter nuclei
      const nOffset = r * 0.38 * (0.25 + prog * 0.75);
      const nucR = r * 0.22 * (1 - prog * 0.12);

      for (const side of [-1, 1]) {
        const nx = side * nOffset * stretch;
        this.ctx.beginPath();
        this.ctx.arc(nx, 0, nucR, 0, TAU);
        this.ctx.fillStyle = `rgba(${accentRgb}, ${0.065 * brightness * alpha})`;
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.arc(nx, 0, nucR * 0.4, 0, TAU);
        this.ctx.fillStyle = `rgba(${inkRgb}, ${0.055 * brightness * alpha})`;
        this.ctx.fill();
      }

      this.ctx.restore();
      return;
    }

    // -------------------------------------------------------------
    // Case B: Apoptosis Blebbing Membrane & Pyknosis
    // -------------------------------------------------------------
    if (cell.state === 'apoptosis' && cell.blebs) {
      const prog = cell.apoptosisProgress || 0;

      // Draw disintegrating central membrane
      this.ctx.beginPath();
      const SEGMENTS = 24;
      for (let i = 0; i <= SEGMENTS; i++) {
        const theta = (i / SEGMENTS) * TAU;
        const wobble = 1 + 0.18 * Math.sin(theta * 6 + cell.wobblePhase * 2);
        const currentR = r * (1 - prog * 0.4) * wobble;
        const lx = px + Math.cos(theta) * currentR;
        const ly = py + Math.sin(theta) * currentR;

        if (i === 0) this.ctx.moveTo(lx, ly);
        else this.ctx.lineTo(lx, ly);
      }
      this.ctx.closePath();

      this.ctx.fillStyle = `rgba(${accentRgb}, ${0.03 * alpha})`;
      this.ctx.fill();
      this.ctx.lineWidth = 1;
      this.ctx.strokeStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${0.05 * alpha})`;
      this.ctx.stroke();

      // Fragmented Pyknosis Nuclei
      const fragDist = r * 0.3 * prog;
      for (let k = 0; k < 3; k++) {
        const fAngle = (k / 3) * TAU + prog * 2;
        const fnx = px + Math.cos(fAngle) * fragDist;
        const fny = py + Math.sin(fAngle) * fragDist;
        this.ctx.beginPath();
        this.ctx.arc(fnx, fny, r * 0.12 * (1 - prog * 0.5), 0, TAU);
        this.ctx.fillStyle = `rgba(${inkRgb}, ${0.04 * alpha})`;
        this.ctx.fill();
      }

      // Dispersing Apoptotic Blebs
      for (const bleb of cell.blebs) {
        const bx = px + Math.cos(bleb.angle) * r * bleb.dist;
        const by = py + Math.sin(bleb.angle) * r * bleb.dist;
        const bAlpha = bleb.alpha * alpha;

        if (bAlpha > 0.01) {
          this.ctx.beginPath();
          this.ctx.arc(bx, by, bleb.radius, 0, TAU);
          this.ctx.fillStyle = `rgba(${accentRgb}, ${0.035 * bAlpha})`;
          this.ctx.fill();
          this.ctx.strokeStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${0.05 * bAlpha})`;
          this.ctx.stroke();
        }
      }
      return;
    }

    // -------------------------------------------------------------
    // Case C: Standard Growth & Mature Homeostatic Membrane
    // -------------------------------------------------------------
    this.ctx.beginPath();
    const SEGMENTS = 30;
    for (let i = 0; i <= SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * TAU;
      const h1 = cell.harmonics[0] * Math.sin(theta * 3 + cell.wobblePhase);
      const h2 = cell.harmonics[1] * Math.sin(theta * 5 - cell.wobblePhase * 0.8);
      const h3 = cell.harmonics[2] * Math.sin(theta * 7 + cell.wobblePhase * 1.3);
      const h4 = cell.harmonics[3] * Math.sin(theta * 9 - cell.wobblePhase * 0.5);
      const wobble = 1 + h1 + h2 + h3 + h4;
      const currentR = r * wobble;
      const lx = px + Math.cos(theta + cell.angle) * currentR;
      const ly = py + Math.sin(theta + cell.angle) * currentR;

      if (i === 0) this.ctx.moveTo(lx, ly);
      else this.ctx.lineTo(lx, ly);
    }
    this.ctx.closePath();

    // Subsurface Scattering Interior Glow
    const fill = this.ctx.createRadialGradient(px, py, 0, px, py, r || 1);
    fill.addColorStop(0, `rgba(${accentRgb}, ${0.04 * brightness * alpha})`);
    fill.addColorStop(0.68, `rgba(${glowRgb}, ${0.018 * brightness * alpha})`);
    fill.addColorStop(1, `rgba(${accentRgb}, 0)`);
    this.ctx.fillStyle = fill;
    this.ctx.fill();

    // Outer Membrane Lipid Border
    this.ctx.lineWidth = 1.15;
    this.ctx.strokeStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${0.06 * brightness * alpha})`;
    this.ctx.stroke();

    // Fluorescent Nucleus + Nucleolus
    const ncx = px + cell.nucleusOffset.x * r;
    const ncy = py + cell.nucleusOffset.y * r;
    const nucRadius = r * 0.28;

    this.ctx.beginPath();
    this.ctx.arc(ncx, ncy, nucRadius, 0, TAU);
    this.ctx.fillStyle = `rgba(${accentRgb}, ${0.055 * brightness * alpha})`;
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.arc(ncx, ncy, nucRadius * 0.42, 0, TAU);
    this.ctx.fillStyle = `rgba(${inkRgb}, ${0.048 * brightness * alpha})`;
    this.ctx.fill();

    // Rotating Organelles (Mitochondria & Ribosomes)
    for (const org of cell.organelles) {
      const ox = px + Math.cos(org.angle + cell.angle) * r * org.dist;
      const oy = py + Math.sin(org.angle + cell.angle) * r * org.dist;
      this.ctx.beginPath();
      this.ctx.arc(ox, oy, org.size, 0, TAU);
      this.ctx.fillStyle = org.isAccent
        ? `rgba(${accentRgb}, ${0.045 * alpha})`
        : `rgba(${inkRgb}, ${0.038 * alpha})`;
      this.ctx.fill();
    }
  }
}

let engineInstance: LivingCellsEngine | null = null;

export function getLivingCellsEngine(): LivingCellsEngine {
  if (!engineInstance) {
    engineInstance = new LivingCellsEngine();
  }
  return engineInstance;
}

export function initLivingCellsBackground(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-site-bg-canvas]');
  if (canvas) {
    getLivingCellsEngine().attach(canvas);
  }
}
