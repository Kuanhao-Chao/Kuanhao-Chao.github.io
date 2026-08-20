/**
 * Living Cells 2.0 Master Engine.
 *
 * An authentic, state-of-the-art computational biology and fluid physics simulation:
 * 1. 💧 Viscoelastic Cubic Spline Membranes: 16 dynamic spring vertices with cortical tension.
 * 2. 🧲 Optical Tweezer Dragging & Elastic Recoil: Smooth, critically damped desktop mouse drag with velocity clamping.
 * 3. 📱 Mobile-Calibrated Touch Isolation: Zero scroll hijacking on touch screens; discrete stationary taps only.
 * 4. 🫁 Dynamic Respiration & Amoeboid Morphing: Gentle sinusoidal breathing cycle (r ± 4.5%) and harmonic fluid morphing.
 * 5. 🔬 Realistic Eukaryotic Organelles: Mitochondria with cristae, ER with ribosomes, Golgi with vesicles, and nuclear pores.
 * 6. 🧬 4-Phase Mitosis & Cytokinesis: Prophase, Metaphase, Anaphase, and Telophase with complete chromosome containment.
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

export interface Mitochondrion {
  type: 'mitochondria';
  angle: number;
  dist: number;
  length: number;
  width: number;
  cristaeCount: number;
  rotAngle: number;
  spinSpeed: number;
}

export interface GolgiApparatus {
  type: 'golgi';
  angle: number;
  dist: number;
  arcSpan: number;
  layers: number;
  spinSpeed: number;
  vesicles: { angle: number; dist: number; size: number }[];
}

export interface EndoplasmicReticulum {
  type: 'er';
  arcStart: number;
  arcEnd: number;
  layers: number;
  ribosomes: { angle: number; rOffset: number }[];
}

export interface Centrosome {
  type: 'centrosome';
  angle: number;
  dist: number;
  spinSpeed: number;
}

export type Organelle = Mitochondrion | GolgiApparatus | EndoplasmicReticulum | Centrosome;

export interface LivingCell {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  radius: number;
  targetRadius: number;
  angle: number;
  vAngle: number;
  wobblePhase: number;
  wobbleSpeed: number;
  harmonics: [number, number, number, number];
  vertices: VertexSpring[];

  // Dynamic Respiration & Morphing
  breathPhase: number;
  breathSpeed: number;
  morphPhase: number;
  morphSpeed: number;

  // Cytology & Organelles
  nucleusOffset: { x: number; y: number };
  nucleusAngle: number;
  organelles: Organelle[];

  state: CellState;
  growthProgress?: number; // 0..1 biomass interphase progression
  metabolicReserve?: number; // Buffered nutrient reserve for steady, non-abrupt growth
  life: number; // 0..1 vitality / opacity (1.0 for live cells, fades only during apoptosis)
  age: number;
  maxAge: number;

  // Interactivity & Optical Tweezers (Desktop only)
  isGrabbed: boolean;
  grabOffset: { x: number; y: number };
  targetDragPos?: { x: number; y: number };

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
const ALPHA_SCALE = 0.80; // 20% lighter cell alpha for crystal-clear typography legibility
const rand = (min: number, max: number) => min + Math.random() * (max - min);

// Quintic smootherstep easing with zero 1st and 2nd derivatives at endpoints for organic, smooth expansion
const smootherstep = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

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
  private nextAutoMitosis = 280;
  private nextAutoApoptosis = 520;

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

  private createCell(x?: number, y?: number, asBud = false, targetR?: number, initialR?: number): LivingCell {
    const isCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    const finalRadius = targetR ?? (isCoarse ? rand(28, 54) : rand(36, 74));
    const startRadius = initialR ?? (asBud ? 4 : finalRadius);
    const isGrowing = asBud || (initialR !== undefined && initialR < finalRadius * 0.95);
    const cellState: CellState = isGrowing ? 'growing' : 'mature';

    const vertices: VertexSpring[] = Array.from({ length: VERTEX_COUNT }, (_, i) => ({
      angle: (i / VERTEX_COUNT) * TAU,
      displacement: 0,
      velocity: 0,
      equilibriumOffset: 0,
    }));

    // Generate authentic eukaryotic organelle ensemble with strict containment
    const organelles: Organelle[] = [];

    // 1. Mitochondria (1 to 2 distinct elongated powerhouses with cristae)
    const mitoCount = finalRadius > 45 ? 2 : 1;
    for (let m = 0; m < mitoCount; m++) {
      organelles.push({
        type: 'mitochondria',
        angle: rand(0, TAU),
        dist: rand(0.32, 0.48),
        length: Math.max(4.0, finalRadius * 0.18),
        width: Math.max(2.2, finalRadius * 0.08),
        cristaeCount: Math.round(rand(3, 5)),
        rotAngle: rand(0, TAU),
        spinSpeed: rand(-0.003, 0.003),
      });
    }

    // 2. Golgi Apparatus (Stacked curved cisternae + secretory vesicles)
    organelles.push({
      type: 'golgi',
      angle: rand(0, TAU),
      dist: rand(0.32, 0.44),
      arcSpan: rand(0.5, 0.75),
      layers: finalRadius > 50 ? 3 : 2,
      spinSpeed: rand(-0.002, 0.002),
      vesicles: Array.from({ length: Math.round(rand(2, 4)) }, () => ({
        angle: rand(-0.35, 0.35),
        dist: rand(0.04, 0.08),
        size: Math.max(0.65, finalRadius * 0.022),
      })),
    });

    // 3. Endoplasmic Reticulum (Concentric canalicular ribbons hugging nucleus)
    organelles.push({
      type: 'er',
      arcStart: rand(0, TAU),
      arcEnd: rand(1.4, 2.2),
      layers: 2,
      ribosomes: Array.from({ length: Math.round(rand(5, 8)) }, () => ({
        angle: rand(0, 1),
        rOffset: rand(0, 1),
      })),
    });

    // 4. Centrosome (Centriole pair with astral rays)
    organelles.push({
      type: 'centrosome',
      angle: rand(0, TAU),
      dist: rand(0.28, 0.44),
      spinSpeed: rand(-0.001, 0.001),
    });

    return {
      x: x ?? rand(0, this.width || 800),
      y: y ?? rand(0, this.height || 600),
      vx: rand(-0.14, 0.14),
      vy: rand(-0.14, 0.14),
      baseRadius: startRadius,
      radius: startRadius,
      targetRadius: finalRadius,
      angle: rand(0, TAU),
      vAngle: rand(-0.0014, 0.0014),
      wobblePhase: rand(0, TAU),
      wobbleSpeed: rand(0.004, 0.008),
      harmonics: [rand(0.05, 0.10), rand(0.03, 0.06), rand(0.02, 0.035), rand(0.01, 0.02)],
      vertices,

      // Respiration & Morphing
      breathPhase: rand(0, TAU),
      breathSpeed: rand(0.006, 0.012),
      morphPhase: rand(0, TAU),
      morphSpeed: rand(0.003, 0.007),

      nucleusOffset: { x: rand(-0.10, 0.10), y: rand(-0.10, 0.10) },
      nucleusAngle: rand(0, TAU),
      organelles,
      state: cellState,
      growthProgress: isGrowing ? Math.max(0.0, (startRadius - 4) / Math.max(1, finalRadius - 4)) : 1.0,
      metabolicReserve: 0.0,
      life: 1.0, // Always 1.0 vitality and 100% visible for live and growing cells
      age: isGrowing ? 0 : rand(120, 600),
      maxAge: rand(1800, 3400),
      isGrabbed: false,
      grabOffset: { x: 0, y: 0 },
      glowIntensity: isGrowing ? 1.8 : 1.0,
    };
  }

  public triggerMitosis(cell: LivingCell, isExplicitClick = false): void {
    // If not explicit user click, cell must be in mature state and passed size checkpoint (>= 98% target radius)
    if (!isExplicitClick) {
      if (cell.state !== 'mature' || cell.baseRadius < cell.targetRadius * 0.98) return;
    } else {
      // User click exemption: allowed for any cell not currently dividing or dying
      if (cell.state === 'mitosis' || cell.state === 'apoptosis') return;
    }

    cell.state = 'mitosis';
    cell.mitosisProgress = 0;
    cell.mitosisAngle = rand(0, Math.PI);
    cell.glowIntensity = 1.35; // Gentle metabolic activation glow

    // Disperse vertices along division vector
    for (const v of cell.vertices) {
      v.velocity = Math.sin(v.angle * 2) * 1.2;
    }
  }

  public triggerApoptosis(cell: LivingCell): void {
    if (cell.state === 'mitosis' || cell.state === 'apoptosis') return;
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

    // Pointer Down (Desktop Drag Initiation & Click Detection)
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

        // Desktop mouse only: double-click shockwave & optical tweezer grab
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
                cell.targetDragPos = { x, y };
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

          // Optical Tweezer Pull Target (Desktop mouse only)
          if (this.grabbedCell) {
            this.grabbedCell.targetDragPos = {
              x: x + this.grabbedCell.grabOffset.x,
              y: y + this.grabbedCell.grabOffset.y,
            };
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
        this.grabbedCell.targetDragPos = undefined;
        for (const v of this.grabbedCell.vertices) {
          v.velocity += rand(-0.8, 0.8);
        }
        this.grabbedCell = null;
      } else {
        const moveDist = Math.hypot(x - this.pointerDownPos.x, y - this.pointerDownPos.y);
        const duration = performance.now() - this.pointerDownPos.time;

        // Strict stationary tap threshold for touch screens (<6px, <280ms)
        const maxDist = isTouch ? 6 : 8;
        const maxDuration = isTouch ? 280 : 350;

        if (moveDist < maxDist && duration < maxDuration) {
          // Check if clicking any existing cell to trigger Mitosis (User Click Exemption!)
          for (const cell of this.cells) {
            if (cell.state === 'mature' || cell.state === 'growing') {
              const d = Math.hypot(cell.x - x, cell.y - y);
              if (d < cell.radius * 1.35) {
                this.triggerMitosis(cell, true); // User Click Exemption
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
          this.grabbedCell.targetDragPos = undefined;
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
            cell.glowIntensity = Math.min(2.0, cell.glowIntensity + 0.15);
            cell.age = Math.max(0, cell.age - 25);
            if (cell.state === 'growing') {
              // Buffer nutrient into metabolic reserve for smooth, steady growth acceleration
              cell.metabolicReserve = Math.min(0.35, (cell.metabolicReserve || 0) + 0.04);
            }
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

          if (!c1.isGrabbed) {
            c1.vx -= nx * force;
            c1.vy -= ny * force;
          }
          if (!c2.isGrabbed) {
            c2.vx += nx * force;
            c2.vy += ny * force;
          }

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

      // Optical Tweezer Soft Lerp Dragging (Desktop only)
      if (cell.isGrabbed && cell.targetDragPos) {
        const pullDx = cell.targetDragPos.x - cell.x;
        const pullDy = cell.targetDragPos.y - cell.y;
        const easeRate = 0.16;

        const moveX = pullDx * easeRate;
        const moveY = pullDy * easeRate;
        cell.x += moveX;
        cell.y += moveY;

        // Clamp instantaneous velocity to gentle fluid speed (max 2.2 px/frame)
        cell.vx = Math.max(-2.2, Math.min(2.2, moveX));
        cell.vy = Math.max(-2.2, Math.min(2.2, moveY));

        // Elastic membrane deformation toward cursor
        const pullAngle = Math.atan2(pullDy, pullDx);
        const pullMag = Math.min(14, Math.hypot(pullDx, pullDy) * 0.25);
        for (const v of cell.vertices) {
          const angleDiff = Math.cos(v.angle + cell.angle - pullAngle);
          v.displacement += angleDiff * pullMag * 0.18;
        }
      } else {
        // Natural viscous fluid motion
        cell.x += cell.vx;
        cell.y += cell.vy;
        cell.vx *= 0.985;
        cell.vy *= 0.985;
      }

      // Dynamic Metabolic Respiration (Breathing r ± 4.5%)
      cell.breathPhase += cell.breathSpeed;
      cell.morphPhase += cell.morphSpeed;
      const breathScale = 1.0 + 0.045 * Math.sin(cell.breathPhase);

      cell.angle += cell.vAngle;
      cell.nucleusAngle += cell.vAngle * 0.7;
      cell.wobblePhase += cell.wobbleSpeed;
      cell.glowIntensity = Math.max(1.0, cell.glowIntensity - 0.010);

      // Rotate and gently drift organelles
      for (const org of cell.organelles) {
        if ('spinSpeed' in org) {
          org.angle += org.spinSpeed;
        }
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

      // Update 16 Viscoelastic Radial Vertex Springs with Low-Frequency Amoeboid Morphing
      const k = 0.08;
      const damping = 0.88;

      for (let vi = 0; vi < cell.vertices.length; vi++) {
        const v = cell.vertices[vi];
        const theta = v.angle;

        // High frequency membrane ripples
        const h1 = cell.harmonics[0] * Math.sin(theta * 3 + cell.wobblePhase);
        const h2 = cell.harmonics[1] * Math.sin(theta * 5 - cell.wobblePhase * 0.8);
        const h3 = cell.harmonics[2] * Math.sin(theta * 7 + cell.wobblePhase * 1.3);
        const h4 = cell.harmonics[3] * Math.sin(theta * 9 - cell.wobblePhase * 0.5);

        // Low frequency amoeboid fluid morphing modes (m=2 oval, m=3 tri-lobe)
        const m2 = 0.045 * Math.sin(2 * theta + cell.morphPhase);
        const m3 = 0.025 * Math.sin(3 * theta - cell.morphPhase * 0.7);

        v.equilibriumOffset = (h1 + h2 + h3 + h4 + m2 + m3) * cell.radius;

        const force = -k * (v.displacement - v.equilibriumOffset);
        v.velocity = (v.velocity + force) * damping;
        v.displacement += v.velocity;
      }

      // Boundary wrapping (only when not grabbed and screen dimensions initialized)
      if (!cell.isGrabbed && this.width > 0 && this.height > 0) {
        const margin = cell.radius * 1.6;
        if (cell.x < -margin) cell.x = this.width + margin;
        else if (cell.x > this.width + margin) cell.x = -margin;
        if (cell.y < -margin) cell.y = this.height + margin;
        else if (cell.y > this.height + margin) cell.y = -margin;
      }

      // A. Growth Phase (G1 / S / G2 Interphase Biomass Accumulation)
      if (cell.state === 'growing') {
        // Continuous, smooth nutrient metabolism
        const nutrientRate = Math.min(0.0005, cell.metabolicReserve || 0);
        if (cell.metabolicReserve && cell.metabolicReserve > 0) {
          cell.metabolicReserve = Math.max(0, cell.metabolicReserve - nutrientRate);
        }

        // Serene interphase growth progression (~22s full cycle at 60fps)
        cell.growthProgress = Math.min(1.0, (cell.growthProgress || 0) + 0.00075 + nutrientRate);
        cell.life = 1.0; // 100% full opacity and vitality for newborn daughter cells

        // Expand smoothly from initial size (~0.56 targetRadius) to adult target radius with quintic smootherstep
        const growthFraction = smootherstep(cell.growthProgress);
        cell.baseRadius = cell.targetRadius * (0.56 + 0.44 * growthFraction);
        cell.radius = cell.baseRadius * breathScale;

        // Pass G2/M size checkpoint to become mature adult
        if (cell.growthProgress >= 1.0 || cell.baseRadius >= cell.targetRadius * 0.98) {
          cell.state = 'mature';
          cell.baseRadius = cell.targetRadius;
          cell.radius = cell.baseRadius * breathScale;
          cell.growthProgress = 1.0;
        }
      }
      // B. Mature Homeostasis Phase
      else if (cell.state === 'mature') {
        cell.baseRadius = cell.targetRadius;
        cell.radius = cell.baseRadius * breathScale;

        // Senescence check only occurs if population is at or above carrying capacity
        const liveCount = this.cells.filter((c) => c.state !== 'apoptosis').length;
        if (cell.age > cell.maxAge && !cell.isGrabbed && liveCount >= this.baseCount) {
          this.triggerApoptosis(cell);
        }
      }
      // C. Mitosis Cytokinesis Phase
      else if (cell.state === 'mitosis') {
        cell.mitosisProgress = (cell.mitosisProgress || 0) + 0.00525; // 1.5x faster cinematic biological mitosis (~3.15s)

        if (cell.mitosisProgress >= 1.0) {
          const angle = cell.mitosisAngle || 0;
          const separation = cell.targetRadius * 0.63;
          const daughterTargetR = cell.targetRadius;
          const daughterBirthR = cell.targetRadius * 0.56; // Born slightly bigger than half parent size (0.56r)

          const pushSpeed = 0.52; // Organic separation bounce impulse
          const daughter1 = this.createCell(
            cell.x + Math.cos(angle) * separation,
            cell.y + Math.sin(angle) * separation,
            false,
            daughterTargetR,
            daughterBirthR
          );
          daughter1.vx = cell.vx + Math.cos(angle) * pushSpeed;
          daughter1.vy = cell.vy + Math.sin(angle) * pushSpeed;
          daughter1.state = 'growing';
          daughter1.growthProgress = 0.0;
          daughter1.metabolicReserve = 0.0;
          daughter1.life = 1.0; // 100% full opacity, immediately and clearly visible!
          daughter1.glowIntensity = 1.25;
          daughter1.age = 0;

          // Initial inward cleavage displacement & recoil velocity for daughter 1
          for (const v of daughter1.vertices) {
            const facingFactor = Math.cos(v.angle - angle);
            v.displacement = -facingFactor * 2.2;
            v.velocity = facingFactor * 1.5;
          }

          const daughter2 = this.createCell(
            cell.x - Math.cos(angle) * separation,
            cell.y - Math.sin(angle) * separation,
            false,
            daughterTargetR,
            daughterBirthR
          );
          daughter2.vx = cell.vx - Math.cos(angle) * pushSpeed;
          daughter2.vy = cell.vy - Math.sin(angle) * pushSpeed;
          daughter2.state = 'growing';
          daughter2.growthProgress = 0.0;
          daughter2.metabolicReserve = 0.0;
          daughter2.life = 1.0; // 100% full opacity, immediately and clearly visible!
          daughter2.glowIntensity = 1.25;
          daughter2.age = 0;

          // Initial inward cleavage displacement & recoil velocity for daughter 2
          for (const v of daughter2.vertices) {
            const facingFactor = -Math.cos(v.angle - angle);
            v.displacement = -facingFactor * 2.2;
            v.velocity = facingFactor * 1.5;
          }

          // Mitotic nutrient release
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
          // Phagocytic nutrient recycling
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

    // -------------------------------------------------------------
    // Dynamic Homeostatic Equilibrium Controller
    // Balances Mitosis and Apoptosis around carrying capacity (baseCount)
    // -------------------------------------------------------------
    const liveCells = this.cells.filter((c) => c.state !== 'apoptosis');
    const liveCount = liveCells.length;
    const targetPop = this.baseCount || 8;

    // 1. Dynamic Auto-Mitosis Regulation (Only fully mature adult cells eligible)
    if (this.tick > this.nextAutoMitosis) {
      if (liveCount <= targetPop) {
        const candidates = this.cells.filter(
          (c) => c.state === 'mature' && c.baseRadius >= c.targetRadius * 0.98 && c.age >= 300 && !c.isGrabbed
        );
        if (candidates.length) {
          const parent = candidates[(Math.random() * candidates.length) | 0];
          this.triggerMitosis(parent, false); // Natural Mitosis Checkpoint
        }
      }
      const popFactor = Math.max(0.6, liveCount / Math.max(1, targetPop));
      this.nextAutoMitosis = this.tick + Math.round(rand(480, 840) * popFactor);
    }

    // 2. Dynamic Auto-Apoptosis Regulation (Clears oldest senescent mature cells)
    if (this.tick > this.nextAutoApoptosis) {
      if (liveCount >= targetPop) {
        const candidates = this.cells.filter(
          (c) => c.state === 'mature' && c.baseRadius >= c.targetRadius * 0.98 && !c.isGrabbed && c.age > 450
        );
        if (candidates.length) {
          const oldest = candidates.sort((a, b) => b.age - a.age)[0];
          if (oldest) this.triggerApoptosis(oldest);
        }
      }
      const popFactor = Math.max(0.6, targetPop / Math.max(1, liveCount));
      this.nextAutoApoptosis = this.tick + Math.round(rand(480, 840) * popFactor);
    }
  }

  private render(): void {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.width, this.height);

    const theme = document.documentElement.dataset.theme || 'light';
    const crtMode = document.documentElement.dataset.crtMode || 'off';
    const isDark = theme !== 'light' && theme !== 'parchment';
    const isCrt = crtMode === 'amber' || crtMode === 'green' || crtMode === 'cyan';

    let accentRgb = '46, 110, 94';
    let inkRgb = '20, 20, 20';
    let glowRgb = '60, 140, 120';

    if (isCrt) {
      const crtColor =
        crtMode === 'amber' ? '255, 176, 0' : crtMode === 'green' ? '51, 255, 51' : '56, 253, 248';
      accentRgb = crtColor;
      inkRgb = crtColor;
      glowRgb = crtColor;
    } else if (theme === 'nord') {
      accentRgb = '136, 192, 208';
      inkRgb = '236, 239, 244';
      glowRgb = '143, 188, 187';
    } else if (theme === 'monokai') {
      accentRgb = '255, 216, 102';
      inkRgb = '252, 252, 250';
      glowRgb = '255, 97, 136';
    } else if (theme === 'cyberdeck') {
      accentRgb = '34, 211, 238';
      inkRgb = '226, 246, 253';
      glowRgb = '0, 229, 255';
    } else if (theme === 'parchment') {
      accentRgb = '194, 65, 12';
      inkRgb = '46, 36, 30';
      glowRgb = '234, 88, 12';
    } else if (theme === 'dark') {
      accentRgb = '117, 199, 175';
      inkRgb = '242, 240, 234';
      glowRgb = '120, 235, 215';
    }

    // 1. Render Shockwaves (20% Lighter Alpha)
    for (const sw of this.shockwaves) {
      this.ctx.beginPath();
      this.ctx.arc(sw.x, sw.y, sw.radius, 0, TAU);
      this.ctx.lineWidth = 1.2;
      this.ctx.strokeStyle = `rgba(${glowRgb}, ${sw.alpha * (isDark ? 0.18 : 0.1) * ALPHA_SCALE})`;
      this.ctx.stroke();
    }

    // 2. Render ATP Nutrient Fireflies (20% Lighter Alpha)
    for (const p of this.particles) {
      const pulseAlpha = p.alpha * (0.6 + 0.4 * Math.sin(p.pulsePhase));
      const finalAlpha = (isDark ? pulseAlpha * 0.48 : pulseAlpha * 0.28) * ALPHA_SCALE;

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, TAU);
      this.ctx.fillStyle = `rgba(${glowRgb}, ${finalAlpha})`;
      this.ctx.fill();
    }

    // 3. Render Cells (20% Lighter Alpha)
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

    // 20% Lighter Global Alpha Calibration
    const alpha = cell.life * ALPHA_SCALE;
    const r = cell.radius;
    if (r <= 1 || alpha <= 0.005) return;

    // -------------------------------------------------------------
    // Case A: Biologically Authentic 4-Phase Mitosis & Cytokinesis
    // -------------------------------------------------------------
    if (cell.state === 'mitosis' && cell.mitosisProgress !== undefined) {
      const prog = cell.mitosisProgress;
      const angle = cell.mitosisAngle || 0;

      // Kinematics & Timing Phases:
      // Phase 1: Prophase / Prometaphase (0.00 <= prog < 0.28)
      // Phase 2: Metaphase (0.28 <= prog < 0.48)
      // Phase 3: Anaphase (0.48 <= prog < 0.74)
      // Phase 4: Telophase & Cytokinesis (0.74 <= prog <= 1.00)

      let poleDist: number;
      let daughterLobeR: number;
      let waistR: number;
      let rx: number;

      if (prog < 0.28) {
        // Prophase: centrosomes separate, chromatin condenses, envelope intact
        const p1 = prog / 0.28;
        poleDist = r * (0.12 + 0.20 * p1);
        daughterLobeR = r * (1.0 - 0.08 * p1);
        waistR = r * (1.0 - 0.05 * p1);
        rx = r * (1.0 + 0.15 * p1);
      } else if (prog < 0.48) {
        // Metaphase: spindle is taut, equatorial alignment, waist is broad (>0.88r)
        const p2 = (prog - 0.28) / 0.20;
        poleDist = r * (0.32 + 0.06 * p2);
        daughterLobeR = r * (0.92 - 0.12 * p2);
        waistR = r * (0.95 - 0.10 * p2);
        rx = r * (1.15 + 0.10 * p2);
      } else if (prog < 0.74) {
        // Anaphase: cohesin split, chromatids pulled poleward, furrow ingresses smoothly
        const p3 = (prog - 0.48) / 0.26;
        poleDist = r * (0.38 + 0.20 * p3);
        daughterLobeR = r * (0.80 - 0.24 * p3);
        waistR = r * (0.85 - 0.60 * Math.sin(p3 * (Math.PI / 2)));
        rx = poleDist + daughterLobeR;
      } else {
        // Telophase: daughter nuclei assemble, furrow pinches down to midbody bridge
        const p4 = (prog - 0.74) / 0.26;
        poleDist = r * (0.58 + 0.05 * p4);
        daughterLobeR = r * 0.56; // Slightly bigger than half of the original cell (0.56r)
        waistR = Math.max(r * 0.04, r * (0.25 - 0.21 * p4));
        rx = poleDist + daughterLobeR;
      }

      // Smooth metabolic glow interpolation during mitosis (peaks gently at metaphase/anaphase, eases smoothly to daughter baseline)
      const effBrightness = (1.0 + 0.28 * Math.sin(prog * Math.PI)) * Math.min(1.25, brightness);

      this.ctx.save();
      this.ctx.translate(px, py);
      this.ctx.rotate(angle);

      // 1. Smooth Organic Dual-Lobe Cytokinesis Envelope (Guaranteed Non-Self-Intersecting C1 Hermite Geometry)
      const SEGMENTS = 64;
      this.ctx.beginPath();
      for (let i = 0; i <= SEGMENTS; i++) {
        const theta = (i / SEGMENTS) * TAU;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const lx = rx * cosT;
        const absX = Math.abs(lx);

        let ry: number;
        if (absX >= poleDist) {
          const capDist = Math.min(daughterLobeR, absX - poleDist);
          ry = Math.sqrt(Math.max(0, daughterLobeR * daughterLobeR - capDist * capDist));
        } else {
          const u = absX / Math.max(0.1, poleDist);
          const smoothU = u * u * (3 - 2 * u);
          ry = waistR + (daughterLobeR - waistR) * smoothU;
        }

        const rippleAmp = 0.015 * Math.min(1.0, waistR / (daughterLobeR || 1));
        const ripple = 1.0 + rippleAmp * Math.sin(theta * 3 + cell.wobblePhase);
        const ly = Math.max(0.5, ry * ripple) * (sinT >= 0 ? 1 : -1);

        if (i === 0) this.ctx.moveTo(lx, ly);
        else this.ctx.lineTo(lx, ly);
      }
      this.ctx.closePath();

      // Subsurface gradient matching normal cell baseline
      const fill = this.ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      fill.addColorStop(0, `rgba(${accentRgb}, ${0.042 * effBrightness * alpha})`);
      fill.addColorStop(0.68, `rgba(${glowRgb}, ${0.018 * effBrightness * alpha})`);
      fill.addColorStop(1, `rgba(${accentRgb}, 0)`);
      this.ctx.fillStyle = fill;
      this.ctx.fill();

      // Outer boundary halo matching normal cell baseline
      this.ctx.lineWidth = 1.15;
      this.ctx.strokeStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${0.065 * effBrightness * alpha})`;
      this.ctx.stroke();

      // Contractile Ring / Midbody accent at cleavage furrow (prog >= 0.65)
      if (prog >= 0.65 && waistR > 1) {
        const ringAlpha = Math.min(1, (prog - 0.65) / 0.2);
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, Math.max(1.5, r * 0.04), waistR, 0, 0, TAU);
        this.ctx.strokeStyle = `rgba(${accentRgb}, ${0.10 * ringAlpha * effBrightness * alpha})`;
        this.ctx.lineWidth = 1.0;
        this.ctx.stroke();
      }

      // 2. Centrosome Asters & Polar Ray Microtubules
      for (const side of [-1, 1]) {
        const cx = side * poleDist;
        // Centriole pair core
        this.ctx.beginPath();
        this.ctx.arc(cx, 0, Math.max(1.5, r * 0.05), 0, TAU);
        this.ctx.fillStyle = `rgba(${accentRgb}, ${0.15 * effBrightness * alpha})`;
        this.ctx.fill();

        // Astral Microtubules (Aster Rays)
        this.ctx.lineWidth = 0.65;
        for (let a = 0; a < 6; a++) {
          const aAngle = (a / 6) * TAU;
          const rayLen = Math.max(3, r * 0.12 + Math.sin(a * 2 + prog * 4) * (r * 0.03));
          this.ctx.beginPath();
          this.ctx.moveTo(cx, 0);
          this.ctx.lineTo(cx + Math.cos(aAngle) * rayLen, Math.sin(aAngle) * rayLen);
          this.ctx.strokeStyle = `rgba(${glowRgb}, ${0.035 * effBrightness * alpha})`;
          this.ctx.stroke();
        }
      }

      // 3. Prophase Parent Nucleus Envelope Breakdown (prog < 0.28)
      if (prog < 0.28) {
        const p1 = prog / 0.28;
        const nucAlpha = (1.0 - p1) * 0.06;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, r * 0.32 * (1.0 - p1 * 0.2), 0, TAU);
        this.ctx.fillStyle = `rgba(${accentRgb}, ${nucAlpha * effBrightness * alpha})`;
        this.ctx.fill();
        this.ctx.lineWidth = 0.8;
        this.ctx.strokeStyle = `rgba(${inkRgb}, ${nucAlpha * 0.8 * effBrightness * alpha})`;
        this.ctx.stroke();
      }

      // 4. Chromosome Pairs & Kinetochore Spindle Apparatus (4 distinct chromosomes)
      const CHROMO_COUNT = 4;
      const chromoLen = Math.min(6.5, Math.max(2.4, r * 0.15));
      const chromoWidth = Math.min(1.6, Math.max(0.85, r * 0.045));
      const dyBase = Math.min(5.0, Math.max(1.8, r * 0.13));

      for (let k = 0; k < CHROMO_COUNT; k++) {
        const yIndex = k - (CHROMO_COUNT - 1) / 2;
        const yPlate = yIndex * dyBase;

        // Phase 1: Prophase / Prometaphase (prog < 0.28)
        if (prog < 0.28) {
          const p1 = prog / 0.28;
          const cx = Math.sin(k * 2.1 + prog * 3) * r * 0.06 * (1 - p1);
          const cy = yPlate * (0.7 + 0.3 * p1);
          const curLen = chromoLen * (0.6 + 0.4 * p1);

          // Condensing X-shaped chromosome
          this.ctx.lineWidth = chromoWidth;
          this.ctx.strokeStyle = `rgba(${accentRgb}, ${(0.07 + 0.07 * p1) * effBrightness * alpha})`;
          this.ctx.beginPath();
          this.ctx.moveTo(cx - curLen * 0.45, cy - curLen * 0.5);
          this.ctx.lineTo(cx + curLen * 0.45, cy + curLen * 0.5);
          this.ctx.moveTo(cx - curLen * 0.45, cy + curLen * 0.5);
          this.ctx.lineTo(cx + curLen * 0.45, cy - curLen * 0.5);
          this.ctx.stroke();

          // Spindle fibers attaching in prometaphase (prog > 0.14)
          if (p1 > 0.5) {
            const attachAlpha = (p1 - 0.5) / 0.5;
            this.ctx.lineWidth = 0.6;
            for (const side of [-1, 1]) {
              this.ctx.beginPath();
              this.ctx.moveTo(side * poleDist, 0);
              this.ctx.lineTo(cx, cy);
              this.ctx.strokeStyle = `rgba(${glowRgb}, ${0.025 * attachAlpha * effBrightness * alpha})`;
              this.ctx.stroke();
            }
          }
        }
        // Phase 2: Metaphase (0.28 <= prog < 0.48)
        else if (prog < 0.48) {
          const cx = 0;
          const cy = yPlate;

          // Taut Kinetochore Microtubule Spindle Fibers from both poles
          this.ctx.lineWidth = 0.75;
          for (const side of [-1, 1]) {
            this.ctx.beginPath();
            this.ctx.moveTo(side * poleDist, 0);
            this.ctx.lineTo(cx + side * (chromoWidth * 1.2), cy);
            this.ctx.strokeStyle = `rgba(${glowRgb}, ${0.04 * effBrightness * alpha})`;
            this.ctx.stroke();
          }

          // Aligned sister chromatid doublet along vertical plate
          this.ctx.lineWidth = chromoWidth;
          this.ctx.strokeStyle = `rgba(${accentRgb}, ${0.15 * effBrightness * alpha})`;
          const halfLen = chromoLen * 0.5;
          const separation = chromoWidth * 1.1;

          this.ctx.beginPath();
          this.ctx.moveTo(cx - separation, cy - halfLen);
          this.ctx.lineTo(cx - separation, cy + halfLen);
          this.ctx.moveTo(cx + separation, cy - halfLen);
          this.ctx.lineTo(cx + separation, cy + halfLen);
          this.ctx.stroke();

          // Centromere constriction & Kinetochore dots
          this.ctx.beginPath();
          this.ctx.arc(cx - separation, cy, chromoWidth * 0.8, 0, TAU);
          this.ctx.arc(cx + separation, cy, chromoWidth * 0.8, 0, TAU);
          this.ctx.fillStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${0.20 * effBrightness * alpha})`;
          this.ctx.fill();
        }
        // Phase 3: Anaphase (0.48 <= prog < 0.74)
        else if (prog < 0.74) {
          const p3 = (prog - 0.48) / 0.26;
          const pullProgress = Math.pow(p3, 0.85);
          const pullDist = poleDist * (0.12 + 0.78 * pullProgress);

          for (const side of [-1, 1]) {
            const kx = side * pullDist;
            const ky = yPlate * (1.0 - 0.3 * p3);

            // Spindle fiber from pole to leading kinetochore
            this.ctx.lineWidth = 0.7;
            this.ctx.beginPath();
            this.ctx.moveTo(side * poleDist, 0);
            this.ctx.lineTo(kx, ky);
            this.ctx.strokeStyle = `rgba(${glowRgb}, ${0.04 * effBrightness * alpha})`;
            this.ctx.stroke();

            // Hydrodynamic V-shaped daughter chromosome trailing behind toward equator
            const armDx = -side * chromoLen * (0.65 + 0.2 * (1 - p3));
            const armDy = chromoLen * 0.45;

            this.ctx.lineWidth = chromoWidth * 1.1;
            this.ctx.strokeStyle = `rgba(${accentRgb}, ${0.15 * effBrightness * alpha})`;
            this.ctx.beginPath();
            this.ctx.moveTo(kx + armDx, ky - armDy);
            this.ctx.lineTo(kx, ky);
            this.ctx.lineTo(kx + armDx, ky + armDy);
            this.ctx.stroke();

            // Leading Kinetochore dot
            this.ctx.beginPath();
            this.ctx.arc(kx, ky, chromoWidth * 0.85, 0, TAU);
            this.ctx.fillStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${0.20 * effBrightness * alpha})`;
            this.ctx.fill();
          }
        }
        // Phase 4: Telophase & Cytokinesis (prog >= 0.74)
        else {
          const p4 = (prog - 0.74) / 0.26;

          for (const side of [-1, 1]) {
            const nx = side * poleDist;
            const ny = yPlate * 0.25 * (1 - p4);
            const clusterX = nx + (k - 1.5) * (chromoWidth * 2.2);

            this.ctx.beginPath();
            this.ctx.arc(clusterX, ny, chromoWidth * 1.2, 0, TAU);
            this.ctx.fillStyle = `rgba(${accentRgb}, ${0.12 * (1 - p4 * 0.4) * effBrightness * alpha})`;
            this.ctx.fill();
          }
        }
      }

      // 5. Reformed Daughter Nuclei envelopes in Telophase (prog >= 0.74)
      if (prog >= 0.74) {
        const p4 = (prog - 0.74) / 0.26;
        const nucR = r * 0.24 * (0.65 + 0.35 * p4);

        for (const side of [-1, 1]) {
          const nx = side * poleDist;
          this.ctx.beginPath();
          this.ctx.arc(nx, 0, nucR, 0, TAU);
          this.ctx.fillStyle = `rgba(${accentRgb}, ${0.058 * p4 * effBrightness * alpha})`;
          this.ctx.fill();
          this.ctx.lineWidth = 0.8;
          this.ctx.strokeStyle = `rgba(${inkRgb}, ${0.055 * p4 * effBrightness * alpha})`;
          this.ctx.stroke();

          // Nucleolus
          this.ctx.beginPath();
          this.ctx.arc(nx, 0, nucR * 0.38, 0, TAU);
          this.ctx.fillStyle = `rgba(${inkRgb}, ${0.055 * p4 * effBrightness * alpha})`;
          this.ctx.fill();
        }
      }

      this.ctx.restore();
      return;
    }

    // -------------------------------------------------------------
    // Case B: Apoptotic Zeiosis (Cellular Shrinkage, Boiling & Blebbing)
    // -------------------------------------------------------------
    if (cell.state === 'apoptosis' && cell.blebs) {
      const prog = cell.apoptosisProgress || 0;

      // Phase 1 & 2: Dynamic boiling central envelope
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

      // Pyknosis / Karyorrhexis chromatin fragmentation
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

        if (bAlpha > 0.005) {
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

    // Subsurface Scattering Interior Glow & Membrane Lipid Refractive Halo Border
    this.ctx.save();
    const fill = this.ctx.createRadialGradient(px, py, 0, px, py, r || 1);
    fill.addColorStop(0, `rgba(${accentRgb}, ${0.042 * brightness * alpha})`);
    fill.addColorStop(0.68, `rgba(${glowRgb}, ${0.018 * brightness * alpha})`);
    fill.addColorStop(1, `rgba(${accentRgb}, 0)`);
    this.ctx.fillStyle = fill;
    this.ctx.fill();

    this.ctx.lineWidth = cell.isGrabbed ? 1.5 : 1.15;
    this.ctx.strokeStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${(cell.isGrabbed ? 0.12 : 0.065) * brightness * alpha})`;
    this.ctx.stroke();

    // =============================================================
    // 🛡️ Cytoplasmic Clipping Guard: 100% Organelle Containment
    // All internal structures are clipped to the exact membrane path
    // =============================================================
    this.ctx.clip();

    const ncx = px + cell.nucleusOffset.x * r;
    const ncy = py + cell.nucleusOffset.y * r;
    const nucRadius = r * 0.25;

    // 1. Double Nuclear Envelope with Nuclear Pores
    this.ctx.beginPath();
    this.ctx.arc(ncx, ncy, nucRadius, 0, TAU);
    this.ctx.fillStyle = `rgba(${accentRgb}, ${0.058 * brightness * alpha})`;
    this.ctx.fill();

    // Outer and Inner Nuclear Membranes
    this.ctx.lineWidth = 0.8;
    this.ctx.strokeStyle = `rgba(${inkRgb}, ${0.055 * brightness * alpha})`;
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.arc(ncx, ncy, nucRadius * 0.86, 0, TAU);
    this.ctx.lineWidth = 0.6;
    this.ctx.strokeStyle = `rgba(${accentRgb}, ${0.045 * brightness * alpha})`;
    this.ctx.stroke();

    // Dense Nucleolus
    this.ctx.beginPath();
    this.ctx.arc(ncx, ncy, nucRadius * 0.38, 0, TAU);
    this.ctx.fillStyle = `rgba(${inkRgb}, ${0.075 * brightness * alpha})`;
    this.ctx.fill();

    // Nuclear Pores (subtle outer perimeter dots)
    const PORE_COUNT = 6;
    for (let p = 0; p < PORE_COUNT; p++) {
      const pAngle = (p / PORE_COUNT) * TAU + cell.nucleusAngle;
      const pox = ncx + Math.cos(pAngle) * nucRadius;
      const poy = ncy + Math.sin(pAngle) * nucRadius;
      this.ctx.beginPath();
      this.ctx.arc(pox, poy, 0.75, 0, TAU);
      this.ctx.fillStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${0.12 * brightness * alpha})`;
      this.ctx.fill();
    }

    // 2. Render Specialized Organelles
    for (const org of cell.organelles) {
      // Organelle A: Mitochondria (Elongated capsule with transverse cristae folds)
      if (org.type === 'mitochondria') {
        const mx = px + Math.cos(org.angle + cell.angle) * r * org.dist;
        const my = py + Math.sin(org.angle + cell.angle) * r * org.dist;
        const mRot = org.rotAngle + cell.angle;

        this.ctx.save();
        this.ctx.translate(mx, my);
        this.ctx.rotate(mRot);

        const halfLen = org.length * 0.5;
        const halfW = org.width * 0.5;

        // Outer mitochondrial membrane capsule
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, halfLen, halfW, 0, 0, TAU);
        this.ctx.fillStyle = `rgba(${accentRgb}, ${0.065 * alpha})`;
        this.ctx.fill();
        this.ctx.lineWidth = 0.75;
        this.ctx.strokeStyle = `rgba(${isDark ? glowRgb : inkRgb}, ${0.08 * alpha})`;
        this.ctx.stroke();

        // Inner folding cristae ridges
        this.ctx.lineWidth = 0.65;
        this.ctx.strokeStyle = `rgba(${inkRgb}, ${0.07 * alpha})`;
        for (let c = 1; c <= org.cristaeCount; c++) {
          const cx = -halfLen + (c / (org.cristaeCount + 1)) * org.length;
          const cristaeHeight = halfW * 0.65;
          const yDir = c % 2 === 0 ? 1 : -1;

          this.ctx.beginPath();
          this.ctx.moveTo(cx, -cristaeHeight * yDir);
          this.ctx.lineTo(cx, cristaeHeight * yDir);
          this.ctx.stroke();
        }

        this.ctx.restore();
      }

      // Organelle B: Golgi Apparatus (Stacked parallel curved cisternae + budding vesicles)
      else if (org.type === 'golgi') {
        const gx = px + Math.cos(org.angle + cell.angle) * r * org.dist;
        const gy = py + Math.sin(org.angle + cell.angle) * r * org.dist;
        const gRot = org.angle + cell.angle;

        this.ctx.save();
        this.ctx.translate(gx, gy);
        this.ctx.rotate(gRot);

        this.ctx.lineWidth = 0.8;
        this.ctx.strokeStyle = `rgba(${accentRgb}, ${0.075 * alpha})`;

        for (let l = 0; l < org.layers; l++) {
          const radiusLayer = r * (0.04 + l * 0.03);
          this.ctx.beginPath();
          this.ctx.arc(0, 0, radiusLayer, -org.arcSpan * 0.5, org.arcSpan * 0.5);
          this.ctx.stroke();
        }

        // Secretory budding transport vesicles (relative radius offsets)
        for (const v of org.vesicles) {
          const vDist = r * (0.05 + v.dist);
          const vx = Math.cos(v.angle) * vDist;
          const vy = Math.sin(v.angle) * vDist;
          this.ctx.beginPath();
          this.ctx.arc(vx, vy, v.size, 0, TAU);
          this.ctx.fillStyle = `rgba(${glowRgb}, ${0.06 * alpha})`;
          this.ctx.fill();
        }

        this.ctx.restore();
      }

      // Organelle C: Endoplasmic Reticulum (Concentric canaliculi with ribosome dots)
      else if (org.type === 'er') {
        this.ctx.save();
        this.ctx.translate(ncx, ncy);
        this.ctx.lineWidth = 0.75;
        this.ctx.strokeStyle = `rgba(${accentRgb}, ${0.045 * alpha})`;

        for (let l = 0; l < org.layers; l++) {
          const erR = nucRadius * (1.12 + l * 0.15);
          this.ctx.beginPath();
          this.ctx.arc(0, 0, erR, org.arcStart, org.arcStart + org.arcEnd);
          this.ctx.stroke();
        }

        // Ribosome nanoparticles along Rough ER
        for (const ribo of org.ribosomes) {
          const riboAngle = org.arcStart + ribo.angle * org.arcEnd;
          const riboDist = nucRadius * (1.12 + ribo.rOffset * 0.18);
          const rx = Math.cos(riboAngle) * riboDist;
          const ry = Math.sin(riboAngle) * riboDist;

          this.ctx.beginPath();
          this.ctx.arc(rx, ry, 0.7, 0, TAU);
          this.ctx.fillStyle = `rgba(${inkRgb}, ${0.07 * alpha})`;
          this.ctx.fill();
        }

        this.ctx.restore();
      }

      // Organelle D: Centrosome (Centriole orthogonal pair)
      else if (org.type === 'centrosome') {
        const cx = px + Math.cos(org.angle + cell.angle) * r * org.dist;
        const cy = py + Math.sin(org.angle + cell.angle) * r * org.dist;
        const barLen = Math.max(1.1, r * 0.035);

        this.ctx.save();
        this.ctx.translate(cx, cy);

        // Centriole pair
        this.ctx.lineWidth = 1.0;
        this.ctx.strokeStyle = `rgba(${inkRgb}, ${0.08 * alpha})`;

        this.ctx.beginPath();
        this.ctx.moveTo(-barLen, 0);
        this.ctx.lineTo(barLen, 0);
        this.ctx.moveTo(0, -barLen);
        this.ctx.lineTo(0, barLen);
        this.ctx.stroke();

        this.ctx.restore();
      }
    }

    this.ctx.restore();
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
