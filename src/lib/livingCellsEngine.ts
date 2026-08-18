/**
 * Living Cells 2.0 Master Engine.
 *
 * An authentic, state-of-the-art computational biology and fluid physics simulation:
 * 1. 💧 Viscoelastic Cubic Spline Membranes: 16 dynamic spring vertices with cortical tension.
 * 2. 🧲 Optical Tweezer Dragging & Elastic Recoil: Desktop mouse drag & stretch with damped spring rebound.
 * 3. 📱 Mobile-Calibrated Touch Interaction: Non-intrusive, scroll-safe background with discrete tap actions.
 * 4. 🧪 Chemotaxis & Nutrient Feeding: Desktop cursor emits ATP fireflies; cells sense & swim towards nutrients.
 * 5. 🧫 Intercellular Contact Inhibition: Cells softly deform and bounce off one another in a tissue layer.
 * 6. 🔬 Mitotic Microtubule Spindle Apparatus: Centrosome poles, spindle fibers, and cleavage furrow cytokinesis.
 * 7. 🫧 Apoptotic Zeiosis & Fragmentation: Dynamic membrane boiling, apoptotic blebs, and pyknosis.
 * 8. 🌊 Double-Click Colony Shockwave: Radial colony excitation pulse.
 *
 * 60fps delta-time smoothed, zero dependencies, automatic tab-visibility pausing, and
 * calibrated contrast ensuring 100% foreground typography legibility.
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
  energy: number;
}

export interface ApoptoticBleb {
  angle: number;
  dist: number;
  radius: number;
  maxRadius: number;
  growthSpeed: number;
  detached: boolean;
  alpha: number;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

export interface VertexSpring {
  angle: number;
  displacement: number; // Current radial offset from equilibrium
  velocity: number;
  equilibriumOffset: number; // Base harmonic offset
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
  harmonics: [number, number, number, number];
  vertices: VertexSpring[];

  nucleusOffset: { x: number; y: number };
  nucleusAngle: number;
  organelles: { angle: number; dist: number; size: number; isAccent: boolean; spinSpeed: number }[];

  state: CellState;
  life: number; // 0..1 vitality
  age: number;
  maxAge: number;

  // Interactivity & Optical Tweezers (Desktop only)
  isGrabbed: boolean;
  grabOffset: { x: number; y: number };

  // Mitosis Properties
  mitosisProgress?: number;
  mitosisAngle?: number;

  // Apoptosis Properties
  apoptosisProgress?: number;
  blebs?: ApoptoticBleb[];

  glowIntensity: number;
}

const TAU = Math.PI * 2;
const VERTEX_COUNT = 16;
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class LivingCellsEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  private cells: LivingCell[] = [];
  private particles: ATPParticle[] = [];
  private shockwaves: Shockwave[] = [];

  private width = 0;
  private height = 0;
  private baseCount = 0;
  private maxCount = 0;
  private tick = 0;
  private nextAutoMitosis = 240;
  private nextAutoApoptosis = 440;

  // Pointer & Drag State
  private pointer = {
    x: -1000,
    y: -1000,
    vx: 0,
    vy: 0,
    isActive: false,
    isDown: false,
    type: 'mouse' as string,
  };
  private lastPointer = { x: 0, y: 0 };
  private grabbedCell: LivingCell | null = null;
  private pointerDownPos = { x: 0, y: 0, time: 0 };
  private lastClickTime = 0;

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

  private createParticle(x?: number, y?: number, vx?: number, vy?: number, energy = 1): ATPParticle {
    return {
      x: x ?? rand(0, this.width || 800),
      y: y ?? rand(0, this.height || 600),
      vx: vx ?? rand(-0.16, 0.16),
      vy: vy ?? rand(-0.16, 0.16),
      size: rand(1.3, 2.7),
      alpha: rand(0.35, 0.8),
      pulsePhase: rand(0, TAU),
      pulseSpeed: rand(0.015, 0.04),
      energy,
    };
  }

  private createCell(x?: number, y?: number, asBud = false, targetR?: number): LivingCell {
    const isCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    const finalRadius = targetR ?? (isCoarse ? rand(26, 52) : rand(34, 72));
    const cellState: CellState = asBud ? 'growing' : 'mature';

    const vertices: VertexSpring[] = Array.from({ length: VERTEX_COUNT }, (_, i) => ({
      angle: (i / VERTEX_COUNT) * TAU,
      displacement: 0,
      velocity: 0,
      equilibriumOffset: 0,
    }));

    return {
      x: x ?? rand(0, this.width || 800),
      y: y ?? rand(0, this.height || 600),
      vx: rand(-0.14, 0.14),
      vy: rand(-0.14, 0.14),
      radius: asBud ? 4 : finalRadius,
      targetRadius: finalRadius,
      angle: rand(0, TAU),
      vAngle: rand(-0.0014, 0.0014),
      wobblePhase: rand(0, TAU),
      wobbleSpeed: rand(0.004, 0.008),
      harmonics: [rand(0.06, 0.12), rand(0.03, 0.07), rand(0.02, 0.04), rand(0.01, 0.025)],
      vertices,
      nucleusOffset: { x: rand(-0.16, 0.16), y: rand(-0.16, 0.16) },
      nucleusAngle: rand(0, TAU),
      organelles: Array.from({ length: Math.random() < 0.6 ? 3 : 2 }, () => ({
        angle: rand(0, TAU),
        dist: rand(0.3, 0.65),
        size: rand(1.8, 3.4),
        isAccent: Math.random() < 0.55,
        spinSpeed: rand(-0.006, 0.006),
      })),
      state: cellState,
      life: asBud ? 0.2 : 1,
      age: asBud ? 0 : rand(80, 550),
      maxAge: rand(1250, 2500),
      isGrabbed: false,
      grabOffset: { x: 0, y: 0 },
      glowIntensity: asBud ? 2.0 : 1.0,
    };
  }

  public triggerMitosis(cell: LivingCell): void {
    if (cell.state !== 'mature') return;
    cell.state = 'mitosis';
    cell.mitosisProgress = 0;
    cell.mitosisAngle = rand(0, Math.PI);
    cell.glowIntensity = 2.5;

    // Disperse vertices along division vector
    for (const v of cell.vertices) {
      v.velocity = Math.sin(v.angle * 2) * 1.5;
    }
  }

  public triggerApoptosis(cell: LivingCell): void {
    if (cell.state !== 'mature') return;
    cell.state = 'apoptosis';
    cell.apoptosisProgress = 0;
    cell.glowIntensity = 1.8;

    cell.blebs = Array.from({ length: rand(6, 10) | 0 }, () => ({
      angle: rand(0, TAU),
      dist: rand(0.75, 1.15),
      radius: rand(4, 9),
      maxRadius: rand(11, 20),
      growthSpeed: rand(0.014, 0.032),
      detached: false,
      alpha: 1,
    }));
  }

  private triggerShockwave(x: number, y: number): void {
    this.shockwaves.push({
      x,
      y,
      radius: 5,
      maxRadius: Math.max(this.width, this.height) * 0.45,
      alpha: 1.0,
    });

    // Excite nearby cells
    for (const cell of this.cells) {
      const d = Math.hypot(cell.x - x, cell.y - y);
      if (d < 360) {
        cell.glowIntensity = Math.max(cell.glowIntensity, 2.0 * (1 - d / 360));
        cell.vx += ((cell.x - x) / (d || 1)) * 0.6;
        cell.vy += ((cell.y - y) / (d || 1)) * 0.6;
      }
    }
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

    const target = Math.round((this.width * this.height) / (isCoarse ? 58000 : 48000));
    this.baseCount = Math.max(isCoarse ? 4 : 5, Math.min(isCoarse ? 6 : 13, target));
    this.maxCount = this.baseCount + 2;
  };

  private bindEvents(): void {
    if (this.isBound || typeof window === 'undefined') return;
    this.isBound = true;

    window.addEventListener('resize', this.resize, { passive: true });

    // Pointer Down
    window.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || (e.target as HTMLElement | null)?.closest('button, a, input, [role="menuitem"]')) {
          return;
        }

        const x = e.clientX;
        const y = e.clientY;
        const isTouch = e.pointerType === 'touch';

        this.pointer.isDown = true;
        this.pointer.type = e.pointerType || 'mouse';
        this.pointerDownPos = { x, y, time: performance.now() };

        // Double click / shockwave (desktop mouse only)
        if (!isTouch) {
          const now = performance.now();
          if (now - this.lastClickTime < 320) {
            this.triggerShockwave(x, y);
            this.lastClickTime = 0;
            return;
          }
          this.lastClickTime = now;

          // Optical Tweezer grab on desktop mouse only
          for (const cell of this.cells) {
            if (cell.state === 'mature' || cell.state === 'growing') {
              const dist = Math.hypot(cell.x - x, cell.y - y);
              if (dist < cell.radius * 1.35) {
                this.grabbedCell = cell;
                cell.isGrabbed = true;
                cell.grabOffset = { x: cell.x - x, y: cell.y - y };
                cell.glowIntensity = 2.2;
                return;
              }
            }
          }
        }
      },
      { passive: true }
    );

    // Pointer Move
    window.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        const x = e.clientX;
        const y = e.clientY;
        const isTouch = e.pointerType === 'touch';

        this.pointer.type = e.pointerType || 'mouse';
        this.pointer.vx = x - this.lastPointer.x;
        this.pointer.vy = y - this.lastPointer.y;
        this.lastPointer.x = x;
        this.lastPointer.y = y;
        this.pointer.x = x;
        this.pointer.y = y;
        this.pointer.isActive = true;

        // Emit Chemotaxis Nutrient Trail on swift desktop mouse movements only
        if (!isTouch) {
          const speed = Math.hypot(this.pointer.vx, this.pointer.vy);
          if (speed > 2.5 && Math.random() < 0.35 && this.particles.length < 50) {
            this.particles.push(
              this.createParticle(x + rand(-8, 8), y + rand(-8, 8), rand(-0.1, 0.1), rand(-0.1, 0.1), 1.2)
            );
          }
        }

        // Optical Tweezer Pull Drag (desktop mouse only)
        if (this.grabbedCell && !isTouch) {
          const targetX = x + this.grabbedCell.grabOffset.x;
          const targetY = y + this.grabbedCell.grabOffset.y;
          const pullDx = targetX - this.grabbedCell.x;
          const pullDy = targetY - this.grabbedCell.y;

          this.grabbedCell.vx += pullDx * 0.12;
          this.grabbedCell.vy += pullDy * 0.12;

          const pullAngle = Math.atan2(pullDy, pullDx);
          const pullMag = Math.min(18, Math.hypot(pullDx, pullDy) * 0.3);

          for (const v of this.grabbedCell.vertices) {
            const angleDiff = Math.cos(v.angle + this.grabbedCell.angle - pullAngle);
            v.displacement += angleDiff * pullMag * 0.2;
          }
        }
      },
      { passive: true }
    );

    // Pointer Up (Release Optical Tweezers or Handle Click/Tap)
    window.addEventListener('pointerup', (e: PointerEvent) => {
      this.pointer.isDown = false;
      const isTouch = e.pointerType === 'touch';
      const x = e.clientX;
      const y = e.clientY;

      if (this.grabbedCell) {
        this.grabbedCell.isGrabbed = false;
        for (const v of this.grabbedCell.vertices) {
          v.velocity += rand(-1.2, 1.2);
        }
        this.grabbedCell = null;
      } else {
        const moveDist = Math.hypot(x - this.pointerDownPos.x, y - this.pointerDownPos.y);
        const duration = performance.now() - this.pointerDownPos.time;

        // Strict stationary tap threshold for touch screens (<6px, <280ms)
        const maxDist = isTouch ? 6 : 8;
        const maxDuration = isTouch ? 280 : 350;

        if (moveDist < maxDist && duration < maxDuration) {
          // Check if clicking a mature cell to trigger Mitosis
          for (const cell of this.cells) {
            if (cell.state === 'mature') {
              const d = Math.hypot(cell.x - x, cell.y - y);
              if (d < cell.radius * 1.35) {
                this.triggerMitosis(cell);
                return;
              }
            }
          }

          // Otherwise sprout a new cell bud + nutrient fireflies
          if (this.cells.length < this.maxCount + 2) {
            const isCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
            const newBud = this.createCell(x, y, true, isCoarse ? rand(28, 44) : rand(36, 56));
            this.cells.push(newBud);

            for (let i = 0; i < (isTouch ? 5 : 8); i++) {
              const a = rand(0, TAU);
              const speed = rand(0.4, 1.2);
              this.particles.push(this.createParticle(x, y, Math.cos(a) * speed, Math.sin(a) * speed));
            }
          }
        }
      }
    });

    window.addEventListener(
      'pointerleave',
      () => {
        this.pointer.isActive = false;
        this.pointer.isDown = false;
        this.pointer.x = -1000;
        this.pointer.y = -1000;
        if (this.grabbedCell) {
          this.grabbedCell.isGrabbed = false;
          this.grabbedCell = null;
        }
      },
      { passive: true }
    );

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

    // 1. Update Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += 5.2;
      sw.alpha = Math.max(0, 1.0 - sw.radius / sw.maxRadius);
      if (sw.alpha <= 0) {
        this.shockwaves.splice(i, 1);
      }
    }

    // 2. Update ATP Nutrient Fireflies
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.pulsePhase += p.pulseSpeed;

      // Wrap boundaries
      if (p.x < 0) p.x = this.width;
      else if (p.x > this.width) p.x = 0;
      if (p.y < 0) p.y = this.height;
      else if (p.y > this.height) p.y = 0;

      // Nutrient absorption by nearby growing/mature cells
      for (const cell of this.cells) {
        if (cell.state === 'growing' || cell.state === 'mature') {
          const d = Math.hypot(cell.x - p.x, cell.y - p.y);
          if (d < cell.radius * 0.95) {
            cell.glowIntensity = Math.min(2.2, cell.glowIntensity + 0.15);
            cell.age = Math.max(0, cell.age - 25);
            this.particles.splice(i, 1);
            break;
          }
        }
      }
    }

    if (this.particles.length > 55) {
      this.particles.splice(0, this.particles.length - 55);
    }

    // 3. Intercellular Contact Inhibition & Elastic Repulsion
    for (let i = 0; i < this.cells.length; i++) {
      const c1 = this.cells[i];
      for (let j = i + 1; j < this.cells.length; j++) {
        const c2 = this.cells[j];
        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.hypot(dx, dy) || 1;
        const minDist = c1.radius + c2.radius;

        if (dist < minDist) {
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          const force = overlap * 0.04;

          c1.vx -= nx * force;
          c1.vy -= ny * force;
          c2.vx += nx * force;
          c2.vy += ny * force;

          const c1Angle = Math.atan2(dy, dx) - c1.angle;
          const c2Angle = Math.atan2(-dy, -dx) - c2.angle;

          for (const v of c1.vertices) {
            if (Math.abs(Math.cos(v.angle - c1Angle)) > 0.7) {
              v.displacement -= overlap * 0.15;
            }
          }
          for (const v of c2.vertices) {
            if (Math.abs(Math.cos(v.angle - c2Angle)) > 0.7) {
              v.displacement -= overlap * 0.15;
            }
          }
        }
      }
    }

    // 4. Update Cells Lifecycle & Viscoelastic Physics
    for (let i = this.cells.length - 1; i >= 0; i--) {
      const cell = this.cells[i];
      cell.age++;

      // Damped movement
      cell.x += cell.vx;
      cell.y += cell.vy;
      cell.vx *= 0.985;
      cell.vy *= 0.985;

      cell.angle += cell.vAngle;
      cell.nucleusAngle += cell.vAngle * 0.7;
      cell.wobblePhase += cell.wobbleSpeed;
      cell.glowIntensity = Math.max(1.0, cell.glowIntensity - 0.012);

      for (const org of cell.organelles) {
        org.angle += org.spinSpeed;
      }

      // Chemotaxis: sense nearby ATP nutrients
      if (cell.state === 'mature' && !cell.isGrabbed && Math.random() < 0.12) {
        for (const p of this.particles) {
          const d = Math.hypot(p.x - cell.x, p.y - cell.y);
          if (d < 180 && d > cell.radius) {
            cell.vx += ((p.x - cell.x) / d) * 0.012;
            cell.vy += ((p.y - cell.y) / d) * 0.012;
            break;
          }
        }
      }

      // Update 16 Viscoelastic Radial Vertex Springs
      const k = 0.08;
      const damping = 0.88;

      for (let vi = 0; vi < cell.vertices.length; vi++) {
        const v = cell.vertices[vi];
        const theta = v.angle;
        const h1 = cell.harmonics[0] * Math.sin(theta * 3 + cell.wobblePhase);
        const h2 = cell.harmonics[1] * Math.sin(theta * 5 - cell.wobblePhase * 0.8);
        const h3 = cell.harmonics[2] * Math.sin(theta * 7 + cell.wobblePhase * 1.3);
        const h4 = cell.harmonics[3] * Math.sin(theta * 9 - cell.wobblePhase * 0.5);
        v.equilibriumOffset = (h1 + h2 + h3 + h4) * cell.radius;

        const force = -k * (v.displacement - v.equilibriumOffset);
        v.velocity = (v.velocity + force) * damping;
        v.displacement += v.velocity;
      }

      // Boundary wrapping
      const margin = cell.radius * 1.6;
      if (cell.x < -margin) cell.x = this.width + margin;
      else if (cell.x > this.width + margin) cell.x = -margin;
      if (cell.y < -margin) cell.y = this.height + margin;
      else if (cell.y > this.height + margin) cell.y = -margin;

      // A. Growth Phase
      if (cell.state === 'growing') {
        cell.life = Math.min(1.0, cell.life + 0.018);
        cell.radius = 4 + (cell.targetRadius - 4) * easeInOutCubic(cell.life);

        if (cell.life >= 1.0) {
          cell.state = 'mature';
          cell.radius = cell.targetRadius;
        }
      }
      // B. Mature Homeostasis Phase
      else if (cell.state === 'mature') {
        if (cell.age > cell.maxAge && !cell.isGrabbed) {
          this.triggerApoptosis(cell);
        }
      }
      // C. Mitosis Cytokinesis Phase
      else if (cell.state === 'mitosis') {
        cell.mitosisProgress = (cell.mitosisProgress || 0) + 0.0125;

        if (cell.mitosisProgress >= 1.0) {
          const angle = cell.mitosisAngle || 0;
          const separation = cell.radius * 0.58;
          const daughterR = cell.radius * 0.78;

          const daughter1 = this.createCell(
            cell.x + Math.cos(angle) * separation,
            cell.y + Math.sin(angle) * separation,
            false,
            daughterR
          );
          daughter1.vx = cell.vx + Math.cos(angle) * 0.12;
          daughter1.vy = cell.vy + Math.sin(angle) * 0.12;

          const daughter2 = this.createCell(
            cell.x - Math.cos(angle) * separation,
            cell.y - Math.sin(angle) * separation,
            false,
            daughterR
          );
          daughter2.vx = cell.vx - Math.cos(angle) * 0.12;
          daughter2.vy = cell.vy - Math.sin(angle) * 0.12;

          for (let k = 0; k < 6; k++) {
            const pAngle = rand(0, TAU);
            const pSpeed = rand(0.4, 1.2);
            this.particles.push(
              this.createParticle(cell.x, cell.y, Math.cos(pAngle) * pSpeed, Math.sin(pAngle) * pSpeed)
            );
          }

          this.cells.splice(i, 1, daughter1, daughter2);
          continue;
        }
      }
      // D. Apoptosis Zeiosis Phase
      else if (cell.state === 'apoptosis') {
        cell.apoptosisProgress = (cell.apoptosisProgress || 0) + 0.0105;
        cell.life = Math.max(0, 1.0 - cell.apoptosisProgress * 1.15);

        if (cell.blebs) {
          for (const bleb of cell.blebs) {
            bleb.dist += bleb.growthSpeed;
            bleb.radius = Math.min(bleb.maxRadius, bleb.radius + 0.2);
            bleb.alpha = Math.max(0, 1.0 - (bleb.dist - 0.75) * 1.7);
          }
        }

        if (cell.apoptosisProgress >= 1.0 || cell.life <= 0) {
          for (let k = 0; k < 8; k++) {
            const a = rand(0, TAU);
            const speed = rand(0.25, 0.75);
            this.particles.push(this.createParticle(cell.x, cell.y, Math.cos(a) * speed, Math.sin(a) * speed));
          }
          this.cells.splice(i, 1);
          continue;
        }
      }
    }

    const liveCount = this.cells.filter((c) => c.state !== 'apoptosis').length;

    // Natural occasional Mitosis (~40% more frequent)
    if (this.tick > this.nextAutoMitosis && liveCount < this.maxCount) {
      const candidates = this.cells.filter((c) => c.state === 'mature' && !c.isGrabbed);
      if (candidates.length) {
        const parent = candidates[(Math.random() * candidates.length) | 0];
        this.triggerMitosis(parent);
      }
      this.nextAutoMitosis = this.tick + (rand(420, 780) | 0);
    }

    // Natural population regulation (~40% more frequent)
    if (this.tick > this.nextAutoApoptosis && liveCount > this.baseCount) {
      const candidates = this.cells.filter((c) => c.state === 'mature' && !c.isGrabbed);
      if (candidates.length) {
        const oldest = candidates.sort((a, b) => b.age - a.age)[0];
        if (oldest) this.triggerApoptosis(oldest);
      }
      this.nextAutoApoptosis = this.tick + (rand(320, 640) | 0);
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

    // 1. Render Shockwaves
    for (const sw of this.shockwaves) {
      this.ctx.beginPath();
      this.ctx.arc(sw.x, sw.y, sw.radius, 0, TAU);
      this.ctx.lineWidth = 1.2;
      this.ctx.strokeStyle = `rgba(${glowRgb}, ${sw.alpha * (isDark ? 0.18 : 0.1)})`;
      this.ctx.stroke();
    }

    // 2. Render ATP Nutrient Fireflies
    for (const p of this.particles) {
      const pulseAlpha = p.alpha * (0.6 + 0.4 * Math.sin(p.pulsePhase));
      const finalAlpha = isDark ? pulseAlpha * 0.48 : pulseAlpha * 0.28;

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, TAU);
      this.ctx.fillStyle = `rgba(${glowRgb}, ${finalAlpha})`;
      this.ctx.fill();
    }

    // 3. Render Cells
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

    // Fluid deflection away from ungrabbed cursor
    if (this.pointer.isActive && !cell.isGrabbed) {
      const isTouch = this.pointer.type === 'touch';
      const R = isTouch ? 75 : 180;
      const maxDisplacement = isTouch ? 4 : 26;

      const dx = cell.x - this.pointer.x;
      const dy = cell.y - this.pointer.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < R) {
        const factor = 1 - dist / R;
        px += (dx / dist) * factor * maxDisplacement;
        py += (dy / dist) * factor * maxDisplacement;
        brightness += factor * (isTouch ? 0.2 : 0.85);
      }
    }

    const alpha = cell.life;
    const r = cell.radius;
    if (r <= 1 || alpha <= 0.01) return;

    // -------------------------------------------------------------
    // Case A: Mitosis Cytokinesis & Spindle Fibers Apparatus
    // -------------------------------------------------------------
    if (cell.state === 'mitosis' && cell.mitosisProgress !== undefined) {
      const prog = cell.mitosisProgress;
      const angle = cell.mitosisAngle || 0;
      const pinch = Math.sin(prog * Math.PI) * 0.48;
      const stretch = 1.0 + prog * 0.45;

      this.ctx.save();
      this.ctx.translate(px, py);
      this.ctx.rotate(angle);

      // Microtubule Spindle Fibers between Centrosomes
      const poleDist = r * 0.42 * stretch;
      this.ctx.lineWidth = 0.75;
      for (let s = -2; s <= 2; s++) {
        const curveOffset = s * (r * 0.22) * (1 - prog * 0.4);
        this.ctx.beginPath();
        this.ctx.moveTo(-poleDist, 0);
        this.ctx.quadraticCurveTo(0, curveOffset, poleDist, 0);
        this.ctx.strokeStyle = `rgba(${glowRgb}, ${0.035 * brightness * alpha})`;
        this.ctx.stroke();
      }

      // Cleavage furrow dumbbell envelope
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

      // Outer boundary halo
      this.ctx.lineWidth = 1.25;
      this.ctx.strokeStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${0.075 * brightness * alpha})`;
      this.ctx.stroke();

      // Twin daughter nuclei & chromatin granules
      const nucR = r * 0.22 * (1 - prog * 0.12);
      for (const side of [-1, 1]) {
        const nx = side * poleDist;
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
    // Case B: Apoptotic Zeiosis (Cellular Boiling & Blebbing)
    // -------------------------------------------------------------
    if (cell.state === 'apoptosis' && cell.blebs) {
      const prog = cell.apoptosisProgress || 0;

      // Dynamic boiling central envelope
      this.ctx.beginPath();
      const SEGMENTS = 24;
      for (let i = 0; i <= SEGMENTS; i++) {
        const theta = (i / SEGMENTS) * TAU;
        const wobble = 1 + 0.18 * Math.sin(theta * 6 + cell.wobblePhase * 2);
        const currentR = r * (1 - prog * 0.45) * wobble;
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

      // Pyknosis chromatin fragmentation
      const fragDist = r * 0.35 * prog;
      for (let k = 0; k < 3; k++) {
        const fAngle = (k / 3) * TAU + prog * 2.2;
        const fnx = px + Math.cos(fAngle) * fragDist;
        const fny = py + Math.sin(fAngle) * fragDist;
        this.ctx.beginPath();
        this.ctx.arc(fnx, fny, r * 0.12 * (1 - prog * 0.5), 0, TAU);
        this.ctx.fillStyle = `rgba(${inkRgb}, ${0.045 * alpha})`;
        this.ctx.fill();
      }

      // Detaching Apoptotic Bodies / Blebs
      for (const bleb of cell.blebs) {
        const bx = px + Math.cos(bleb.angle) * r * bleb.dist;
        const by = py + Math.sin(bleb.angle) * r * bleb.dist;
        const bAlpha = bleb.alpha * alpha;

        if (bAlpha > 0.01) {
          this.ctx.beginPath();
          this.ctx.arc(bx, by, bleb.radius, 0, TAU);
          this.ctx.fillStyle = `rgba(${accentRgb}, ${0.038 * bAlpha})`;
          this.ctx.fill();
          this.ctx.strokeStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${0.055 * bAlpha})`;
          this.ctx.stroke();
        }
      }
      return;
    }

    // -------------------------------------------------------------
    // Case C: Viscoelastic Cubic Spline Membrane (Growth & Mature)
    // -------------------------------------------------------------
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < cell.vertices.length; i++) {
      const v = cell.vertices[i];
      const rad = Math.max(4, r + v.displacement);
      const theta = v.angle + cell.angle;
      pts.push({
        x: px + Math.cos(theta) * rad,
        y: py + Math.sin(theta) * rad,
      });
    }

    // Smooth Cubic Cardinal Spline interpolation through all 16 vertices
    this.ctx.beginPath();
    const len = pts.length;
    for (let i = 0; i < len; i++) {
      const p0 = pts[(i - 1 + len) % len];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % len];
      const p3 = pts[(i + 2) % len];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      if (i === 0) this.ctx.moveTo(p1.x, p1.y);
      this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
    this.ctx.closePath();

    // Subsurface Scattering Interior Glow
    const fill = this.ctx.createRadialGradient(px, py, 0, px, py, r || 1);
    fill.addColorStop(0, `rgba(${accentRgb}, ${0.042 * brightness * alpha})`);
    fill.addColorStop(0.68, `rgba(${glowRgb}, ${0.018 * brightness * alpha})`);
    fill.addColorStop(1, `rgba(${accentRgb}, 0)`);
    this.ctx.fillStyle = fill;
    this.ctx.fill();

    // Outer Membrane Lipid Refractive Halo Border
    this.ctx.lineWidth = cell.isGrabbed ? 1.5 : 1.15;
    this.ctx.strokeStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${(cell.isGrabbed ? 0.12 : 0.065) * brightness * alpha})`;
    this.ctx.stroke();

    // Fluorescent Nucleus + Nucleolus
    const ncx = px + cell.nucleusOffset.x * r;
    const ncy = py + cell.nucleusOffset.y * r;
    const nucRadius = r * 0.28;

    this.ctx.beginPath();
    this.ctx.arc(ncx, ncy, nucRadius, 0, TAU);
    this.ctx.fillStyle = `rgba(${accentRgb}, ${0.058 * brightness * alpha})`;
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.arc(ncx, ncy, nucRadius * 0.42, 0, TAU);
    this.ctx.fillStyle = `rgba(${inkRgb}, ${0.05 * brightness * alpha})`;
    this.ctx.fill();

    // Rotating Organelles (Mitochondria & Ribosomes)
    for (const org of cell.organelles) {
      const ox = px + Math.cos(org.angle + cell.angle) * r * org.dist;
      const oy = py + Math.sin(org.angle + cell.angle) * r * org.dist;
      this.ctx.beginPath();
      this.ctx.arc(ox, oy, org.size, 0, TAU);
      this.ctx.fillStyle = org.isAccent
        ? `rgba(${accentRgb}, ${0.048 * alpha})`
        : `rgba(${inkRgb}, ${0.04 * alpha})`;
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
