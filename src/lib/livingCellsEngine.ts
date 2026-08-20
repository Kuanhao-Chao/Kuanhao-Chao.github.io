/**
 * Calm, fixed-timestep somatic animal-cell background.
 *
 * The biology is intentionally schematic but coherent: interphase growth,
 * open bipolar mitosis with cytokinesis, and membrane-bound apoptosis. The
 * simulation advances at 60 fixed updates per second independently of display
 * refresh rate.
 */

export interface ApoptoticBleb {
  angle: number;
  dist: number;
  radius: number;
  maxRadius: number;
  growthSpeed: number;
  detached: boolean;
  alpha: number;
  onset: number;
  detachAt: number;
  carriesFragment: boolean;
  drift: number;
}

export interface VertexSpring {
  angle: number;
  displacement: number;
  velocity: number;
  equilibriumOffset: number;
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

interface Point {
  x: number;
  y: number;
}

export interface LivingCell {
  id: string;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  baseRadius: number;
  radius: number;
  previousRadius: number;
  birthRadius: number;
  targetRadius: number;
  angle: number;
  vAngle: number;
  wobblePhase: number;
  wobbleSpeed: number;
  harmonics: [number, number, number, number];
  vertices: VertexSpring[];
  breathPhase: number;
  breathSpeed: number;
  morphPhase: number;
  morphSpeed: number;
  nucleusOffset: { x: number; y: number };
  nucleusAngle: number;
  organelles: Organelle[];
  state: CellState;
  stateElapsed: number;
  growthProgress: number;
  growthDuration: number;
  matureElapsed: number;
  life: number;
  age: number;
  isGrabbed: boolean;
  grabOffset: { x: number; y: number };
  targetDragPos?: { x: number; y: number };
  divisionQueued: boolean;
  mitosisProgress?: number;
  mitosisAngle?: number;
  divisionRadius?: number;
  mitosisEntryContour?: Point[];
  apoptosisProgress?: number;
  apoptosisStartRadius?: number;
  apoptosisEntryContour?: Point[];
  blebs?: ApoptoticBleb[];
  glowIntensity: number;
}

interface Palette {
  accent: string;
  ink: string;
  glow: string;
  dark: boolean;
}

interface DebugCounters {
  attaches: number;
  detaches: number;
  starts: number;
  stops: number;
  divisions: number;
  deaths: number;
  clickRequests: number;
  drags: number;
  pointerCancels: number;
  resizeEvents: number;
  eventBindings: number;
}

interface DebugSnapshot {
  running: boolean;
  attached: boolean;
  reduced: boolean;
  targetCount: number;
  projectedCount: number;
  activeLifecycle: number;
  queuedRequests: number;
  updateCount: number;
  renderCount: number;
  counters: DebugCounters;
  dpr: number;
  width: number;
  height: number;
  particles: number;
  cells: Array<{
    id: string;
    x: number;
    y: number;
    radius: number;
    targetRadius: number;
    state: CellState;
    progress: number;
    isGrabbed: boolean;
    divisionQueued: boolean;
  }>;
}

interface DebugSurface {
  snapshot(): DebugSnapshot;
  setCellState(id: string, state: CellState, progress?: number): boolean;
}

declare global {
  interface Window {
    __khcCellsDebug?: DebugSurface;
  }
}

const TAU = Math.PI * 2;
const VERTEX_COUNT = 16;
const CONTOUR_SEGMENTS = 64;
const STEP = 1 / 60;
const MAX_STEPS = 4;
const MITOSIS_SECONDS = 8;
const APOPTOSIS_SECONDS = 7;
const SIZE_CHECKPOINT = 0.97;
const MATURE_DWELL = 8;
const DAUGHTER_RATIO = Math.cbrt(0.5);
const BASE_ALPHA = 0.8;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smootherstep = (value: number) => {
  const x = clamp(value, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
const windowed = (progress: number, start: number, end: number) =>
  smootherstep((progress - start) / Math.max(0.0001, end - start));
const mixPoint = (a: Point, b: Point, t: number): Point => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

function cloneOrganelle(org: Organelle): Organelle {
  if (org.type === 'golgi') return { ...org, vesicles: org.vesicles.map((v) => ({ ...v })) };
  if (org.type === 'er') return { ...org, ribosomes: org.ribosomes.map((r) => ({ ...r })) };
  return { ...org };
}

export class LivingCellsEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private attached = false;
  private cells: LivingCell[] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;
  private coarse = false;
  private targetCount = 0;
  private baseCount = 0;
  private isHomepage = false;
  private seeded = false;
  private nextId = 1;
  private divisionQueue: string[] = [];
  private controllerElapsed = 0;
  private quietRemaining = 0;
  private turnoverRemaining = 35;
  private replacementOwed = false;
  private pointer = { x: -1000, y: -1000, down: false, type: 'mouse', id: -1 };
  private pointerCandidate: LivingCell | null = null;
  private pointerDown = { x: 0, y: 0, time: 0 };
  private grabbedCell: LivingCell | null = null;
  private rafId = 0;
  private isRunning = false;
  private lastTime = 0;
  private lastRenderTime = 0;
  private accumulator = 0;
  private isBound = false;
  private reducedMotion = false;
  private motionQuery: MediaQueryList | null = null;
  private resizeRaf = 0;
  private updateCount = 0;
  private renderCount = 0;
  private counters: DebugCounters = {
    attaches: 0,
    detaches: 0,
    starts: 0,
    stops: 0,
    divisions: 0,
    deaths: 0,
    clickRequests: 0,
    drags: 0,
    pointerCancels: 0,
    resizeEvents: 0,
    eventBindings: 0,
  };
  private palette: Palette = {
    accent: '46, 110, 94',
    ink: '20, 20, 20',
    glow: '60, 140, 120',
    dark: false,
  };
  private visualScale = 1;
  private readonly random: () => number;

  public constructor(random: () => number = Math.random) {
    this.random = random;
  }

  private rand(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  public attach(canvas: HTMLCanvasElement): void {
    const sameCanvas = this.canvas === canvas && Boolean(this.ctx);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;
    this.attached = true;
    this.counters.attaches++;
    this.bindEvents();
    this.refreshEnvironment();
    this.resize();
    if (!this.seeded) this.seed();
    this.installDebug();
    if (!sameCanvas || !this.isRunning) this.start();
  }

  public detach(): void {
    if (!this.attached && !this.canvas) return;
    this.stop();
    this.cancelPointer(false);
    this.attached = false;
    this.canvas = null;
    this.ctx = null;
    this.counters.detaches++;
  }

  private seed(): void {
    this.cells = Array.from({ length: this.targetCount || this.baseCount || 6 }, () =>
      this.createCell()
    );
    this.seeded = true;
    this.turnoverRemaining = this.turnoverDelay();
  }

  private createCell(
    x?: number,
    y?: number,
    asBud = false,
    targetR?: number,
    initialR?: number
  ): LivingCell {
    const targetRadius = targetR ?? (this.coarse ? this.rand(27, 47) : this.rand(34, 64));
    const birthRadius = initialR ?? (asBud ? Math.max(8, targetRadius * 0.45) : targetRadius);
    const growing = asBud || birthRadius < targetRadius * SIZE_CHECKPOINT;
    const vertices = Array.from({ length: VERTEX_COUNT }, (_, index) => ({
      angle: (index / VERTEX_COUNT) * TAU,
      displacement: 0,
      velocity: 0,
      equilibriumOffset: 0,
    }));
    const organelles: Organelle[] = [];
    for (let i = 0; i < (targetRadius > 44 ? 2 : 1); i++) {
      organelles.push({
        type: 'mitochondria',
        angle: this.rand(0, TAU),
        dist: this.rand(0.31, 0.47),
        length: Math.max(4, targetRadius * 0.18),
        width: Math.max(2.2, targetRadius * 0.08),
        cristaeCount: Math.round(this.rand(3, 5)),
        rotAngle: this.rand(0, TAU),
        spinSpeed: this.rand(-0.07, 0.07),
      });
    }
    organelles.push({
      type: 'golgi',
      angle: this.rand(0, TAU),
      dist: this.rand(0.31, 0.43),
      arcSpan: this.rand(0.5, 0.72),
      layers: targetRadius > 48 ? 3 : 2,
      spinSpeed: this.rand(-0.04, 0.04),
      vesicles: Array.from({ length: Math.round(this.rand(2, 4)) }, () => ({
        angle: this.rand(-0.35, 0.35),
        dist: this.rand(0.04, 0.08),
        size: Math.max(0.65, targetRadius * 0.022),
      })),
    });
    organelles.push({
      type: 'er',
      arcStart: this.rand(0, TAU),
      arcEnd: this.rand(1.35, 2.1),
      layers: 2,
      ribosomes: Array.from({ length: Math.round(this.rand(4, 7)) }, () => ({
        angle: this.rand(0, 1),
        rOffset: this.rand(0, 1),
      })),
    });
    organelles.push({
      type: 'centrosome',
      angle: this.rand(0, TAU),
      dist: this.rand(0.27, 0.4),
      spinSpeed: this.rand(-0.03, 0.03),
    });
    const px = x ?? this.rand(targetRadius, Math.max(targetRadius, this.width - targetRadius));
    const py = y ?? this.rand(targetRadius, Math.max(targetRadius, this.height - targetRadius));
    return {
      id: `cell-${this.nextId++}`,
      x: px,
      y: py,
      previousX: px,
      previousY: py,
      vx: this.rand(-7, 7),
      vy: this.rand(-7, 7),
      baseRadius: birthRadius,
      radius: birthRadius,
      previousRadius: birthRadius,
      birthRadius,
      targetRadius,
      angle: this.rand(0, TAU),
      vAngle: this.rand(-0.07, 0.07),
      wobblePhase: this.rand(0, TAU),
      wobbleSpeed: this.rand(0.2, 0.38),
      harmonics: [
        this.rand(0.008, 0.016),
        this.rand(0.005, 0.01),
        this.rand(0.003, 0.006),
        this.rand(0.002, 0.004),
      ],
      vertices,
      breathPhase: this.rand(0, TAU),
      breathSpeed: this.rand(0.28, 0.46),
      morphPhase: this.rand(0, TAU),
      morphSpeed: this.rand(0.14, 0.25),
      nucleusOffset: { x: this.rand(-0.08, 0.08), y: this.rand(-0.08, 0.08) },
      nucleusAngle: this.rand(0, TAU),
      organelles,
      state: growing ? 'growing' : 'mature',
      stateElapsed: 0,
      growthProgress: growing ? 0 : 1,
      growthDuration: this.rand(28, 38),
      matureElapsed: growing ? 0 : this.rand(8, 28),
      life: 1,
      age: growing ? 0 : this.rand(20, 80),
      isGrabbed: false,
      grabOffset: { x: 0, y: 0 },
      divisionQueued: false,
      glowIntensity: growing ? 1.08 : 1,
    };
  }

  public triggerMitosis(cell: LivingCell, explicit = false): void {
    if (cell.state === 'mitosis' || cell.state === 'apoptosis') return;
    if (
      !explicit &&
      (cell.state !== 'mature' ||
        cell.baseRadius < cell.targetRadius * SIZE_CHECKPOINT ||
        cell.matureElapsed < MATURE_DWELL)
    )
      return;
    const radius = Math.max(4, cell.baseRadius);
    const axis = this.rand(0, Math.PI);
    cell.mitosisEntryContour = this.sampleNormalContour(cell, axis);
    cell.state = 'mitosis';
    cell.stateElapsed = 0;
    cell.mitosisProgress = 0;
    cell.mitosisAngle = axis;
    cell.divisionRadius = radius;
    cell.baseRadius = radius;
    cell.radius = radius;
    cell.previousRadius = radius;
    cell.divisionQueued = false;
    cell.isGrabbed = false;
    cell.targetDragPos = undefined;
    cell.glowIntensity = clamp(cell.glowIntensity, 1, 1.15);
    this.divisionQueue = this.divisionQueue.filter((id) => id !== cell.id);
    this.counters.divisions++;
  }

  public triggerApoptosis(cell: LivingCell): void {
    if (cell.state === 'mitosis' || cell.state === 'apoptosis') return;
    const radius = Math.max(4, cell.baseRadius);
    cell.apoptosisEntryContour = this.sampleNormalContour(cell);
    cell.state = 'apoptosis';
    cell.stateElapsed = 0;
    cell.apoptosisProgress = 0;
    cell.apoptosisStartRadius = radius;
    cell.baseRadius = radius;
    cell.radius = radius;
    cell.previousRadius = radius;
    cell.divisionQueued = false;
    cell.isGrabbed = false;
    cell.targetDragPos = undefined;
    this.divisionQueue = this.divisionQueue.filter((id) => id !== cell.id);
    const count = Math.round(this.rand(3, 6));
    cell.blebs = Array.from({ length: count }, (_, i) => {
      const onset = clamp(
        0.18 + (i / Math.max(1, count - 1)) * 0.25 + this.rand(-0.025, 0.025),
        0.16,
        0.46
      );
      return {
        angle: (i / count) * TAU + this.rand(-0.22, 0.22),
        dist: 0.86,
        radius: 0,
        maxRadius: radius * this.rand(0.08, 0.15),
        growthSpeed: this.rand(0.8, 1.1),
        detached: false,
        alpha: 1,
        onset,
        detachAt: clamp(onset + this.rand(0.26, 0.38), 0.48, 0.72),
        carriesFragment: this.random() < 0.55,
        drift: this.rand(0.12, 0.26),
      };
    });
    this.counters.deaths++;
  }

  private queueDivision(cell: LivingCell): void {
    if (
      cell.state === 'mitosis' ||
      cell.state === 'apoptosis' ||
      cell.divisionQueued ||
      this.divisionQueue.includes(cell.id)
    )
      return;
    cell.divisionQueued = true;
    cell.glowIntensity = clamp(Math.max(1.08, cell.glowIntensity), 1, 1.16);
    this.divisionQueue.push(cell.id);
    this.controllerElapsed = 1;
    this.counters.clickRequests++;
  }

  private resize = (): void => {
    if (!this.canvas || !this.ctx || typeof window === 'undefined') return;
    const oldWidth = this.width;
    const oldHeight = this.height;
    this.isHomepage = window.location.pathname === '/';
    this.coarse = window.matchMedia('(pointer: coarse)').matches;
    const dprCap = this.isHomepage ? (this.coarse ? 1 : 1.5) : this.coarse ? 1.5 : 2;
    this.dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.targetCount = this.coarse
      ? clamp(Math.round((this.width * this.height) / 80000), 3, 5)
      : clamp(Math.round((this.width * this.height) / 120000), 5, 9);
    if (this.isHomepage) this.targetCount = Math.min(this.targetCount, this.coarse ? 4 : 7);
    this.baseCount = this.targetCount;

    if (oldWidth > 0 && oldHeight > 0 && (oldWidth !== this.width || oldHeight !== this.height)) {
      const sx = this.width / oldWidth;
      const sy = this.height / oldHeight;
      for (const cell of this.cells) {
        cell.x = clamp(cell.x * sx, -cell.radius, this.width + cell.radius);
        cell.y = clamp(cell.y * sy, -cell.radius, this.height + cell.radius);
        cell.previousX = cell.x;
        cell.previousY = cell.y;
      }
    }
    this.visualScale = (this.coarse ? 0.8 : 1) * (this.isHomepage ? 0.75 : 1);
    this.counters.resizeEvents++;
    if (!this.isRunning) this.render(0, this.reducedMotion);
  };

  private scheduleResize = (): void => {
    if (this.resizeRaf) return;
    this.resizeRaf = requestAnimationFrame(() => {
      this.resizeRaf = 0;
      this.resize();
    });
  };

  private bindEvents(): void {
    if (this.isBound || typeof window === 'undefined') return;
    this.isBound = true;
    this.counters.eventBindings++;
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.motionQuery.matches;
    window.addEventListener('resize', this.scheduleResize, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.onPointerCancel, { passive: true });
    window.addEventListener('blur', this.onWindowBlur, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('khc:theme-change', this.onThemeChange);
    document.addEventListener('khc:crt-change', this.onThemeChange);
    this.motionQuery.addEventListener('change', this.onMotionChange);
  }

  private interactiveTarget(target: EventTarget | null): boolean {
    return Boolean(
      (target as HTMLElement | null)?.closest(
        'a, button, input, textarea, select, summary, label, [contenteditable="true"], [role="button"], [role="menuitem"], [role="dialog"]'
      )
    );
  }

  private hitCell(x: number, y: number): LivingCell | null {
    let hit: LivingCell | null = null;
    let nearest = Number.POSITIVE_INFINITY;
    for (const cell of this.cells) {
      if (cell.state === 'mitosis' || cell.state === 'apoptosis') continue;
      const distance = Math.hypot(cell.x - x, cell.y - y);
      if (distance <= cell.radius * 1.18 && distance < nearest) {
        hit = cell;
        nearest = distance;
      }
    }
    return hit;
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.attached || this.reducedMotion || this.interactiveTarget(event.target)) return;
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const cell = this.hitCell(event.clientX, event.clientY);
    if (!cell) return;
    this.pointer = {
      x: event.clientX,
      y: event.clientY,
      down: true,
      type: event.pointerType || 'mouse',
      id: event.pointerId,
    };
    this.pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
    this.pointerCandidate = cell;
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.attached || !this.pointer.down) return;
    if (this.pointer.id >= 0 && event.pointerId !== this.pointer.id) return;
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    const distance = Math.hypot(
      event.clientX - this.pointerDown.x,
      event.clientY - this.pointerDown.y
    );
    if (this.pointer.type === 'touch') {
      if (distance > 8) this.pointerCandidate = null;
      return;
    }
    if (!this.grabbedCell && this.pointerCandidate && distance > 6) {
      this.grabbedCell = this.pointerCandidate;
      this.grabbedCell.isGrabbed = true;
      this.grabbedCell.grabOffset = {
        x: this.grabbedCell.x - event.clientX,
        y: this.grabbedCell.y - event.clientY,
      };
      this.grabbedCell.targetDragPos = {
        x: event.clientX + this.grabbedCell.grabOffset.x,
        y: event.clientY + this.grabbedCell.grabOffset.y,
      };
      this.pointerCandidate = null;
      this.counters.drags++;
    } else if (this.grabbedCell) {
      this.grabbedCell.targetDragPos = {
        x: event.clientX + this.grabbedCell.grabOffset.x,
        y: event.clientY + this.grabbedCell.grabOffset.y,
      };
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.pointer.down) return;
    if (this.pointer.id >= 0 && event.pointerId !== this.pointer.id) return;
    const candidate = this.pointerCandidate;
    const distance = Math.hypot(
      event.clientX - this.pointerDown.x,
      event.clientY - this.pointerDown.y
    );
    const duration = performance.now() - this.pointerDown.time;
    const threshold = this.pointer.type === 'touch' ? 8 : 6;
    if (this.grabbedCell) {
      this.commitGrabbed(event.clientX, event.clientY);
      this.releaseGrabbed();
    } else if (candidate && distance <= threshold && duration <= 350) this.queueDivision(candidate);
    this.pointer.down = false;
    this.pointer.id = -1;
    this.pointerCandidate = null;
  };

  private onPointerCancel = (event: PointerEvent): void => {
    if (this.pointer.id >= 0 && event.pointerId !== this.pointer.id) return;
    this.cancelPointer(true);
  };
  private onWindowBlur = (): void => this.cancelPointer(false);
  private onVisibilityChange = (): void => {
    if (document.hidden) this.stop();
    else if (this.attached) this.start();
  };
  private onMotionChange = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches;
    if (event.matches) {
      this.stop();
      this.cancelPointer(false);
      this.render(0, true);
    } else if (this.attached && !document.hidden) this.start();
  };
  private onThemeChange = (): void => {
    this.refreshPalette();
    if (!this.isRunning) this.render(0, this.reducedMotion);
  };

  private releaseGrabbed(): void {
    if (!this.grabbedCell) return;
    this.grabbedCell.isGrabbed = false;
    this.grabbedCell.targetDragPos = undefined;
    this.grabbedCell.vx = clamp(this.grabbedCell.vx, -32, 32);
    this.grabbedCell.vy = clamp(this.grabbedCell.vy, -32, 32);
    this.grabbedCell = null;
  }

  private commitGrabbed(clientX: number, clientY: number): void {
    const cell = this.grabbedCell;
    if (!cell) return;
    const radius = this.collisionRadius(cell);
    const x = clamp(clientX + cell.grabOffset.x, radius, Math.max(radius, this.width - radius));
    const y = clamp(clientY + cell.grabOffset.y, radius, Math.max(radius, this.height - radius));
    cell.x = x;
    cell.y = y;
    cell.previousX = x;
    cell.previousY = y;
    cell.targetDragPos = { x, y };
  }

  private cancelPointer(count: boolean): void {
    if (count && (this.pointer.down || this.pointerCandidate || this.grabbedCell))
      this.counters.pointerCancels++;
    this.releaseGrabbed();
    this.pointer.down = false;
    this.pointer.id = -1;
    this.pointerCandidate = null;
    this.pointer.x = -1000;
    this.pointer.y = -1000;
  }

  private refreshEnvironment(): void {
    if (typeof window === 'undefined') return;
    this.coarse = window.matchMedia('(pointer: coarse)').matches;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.isHomepage = window.location.pathname === '/';
    this.visualScale = (this.coarse ? 0.8 : 1) * (this.isHomepage ? 0.75 : 1);
    this.refreshPalette();
  }

  private refreshPalette(): void {
    if (typeof document === 'undefined') return;
    const theme = document.documentElement.dataset.theme || 'light';
    const crt = document.documentElement.dataset.crtMode || 'off';
    let accent = '46, 110, 94';
    let ink = '20, 20, 20';
    let glow = '60, 140, 120';
    let dark = theme !== 'light' && theme !== 'parchment';
    if (crt === 'amber' || crt === 'green' || crt === 'cyan') {
      accent = crt === 'amber' ? '255, 176, 0' : crt === 'green' ? '51, 255, 51' : '56, 253, 248';
      ink = accent;
      glow = accent;
      dark = true;
    } else if (theme === 'nord') {
      accent = '136, 192, 208';
      ink = '236, 239, 244';
      glow = '143, 188, 187';
    } else if (theme === 'monokai') {
      accent = '255, 216, 102';
      ink = '252, 252, 250';
      glow = '255, 97, 136';
    } else if (theme === 'cyberdeck') {
      accent = '34, 211, 238';
      ink = '226, 246, 253';
      glow = '0, 229, 255';
    } else if (theme === 'parchment') {
      accent = '194, 65, 12';
      ink = '46, 36, 30';
      glow = '234, 88, 12';
    } else if (theme === 'dark') {
      accent = '117, 199, 175';
      ink = '242, 240, 234';
      glow = '120, 235, 215';
    }
    this.palette = { accent, ink, glow, dark };
  }

  private loop = (time: number): void => {
    if (!this.isRunning) return;
    this.rafId = requestAnimationFrame(this.loop);
    if (this.lastTime === 0) {
      this.lastTime = time;
      this.lastRenderTime = time;
      this.render(0);
      return;
    }
    this.accumulator += Math.min(0.1, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    let steps = 0;
    while (this.accumulator >= STEP && steps < MAX_STEPS) {
      this.update(STEP);
      this.accumulator -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS && this.accumulator >= STEP) this.accumulator = 0;
    const renderInterval = this.isHomepage ? (this.coarse ? 48 : 24) : this.coarse ? 32 : 15;
    if (this.lastRenderTime === 0 || time - this.lastRenderTime >= renderInterval) {
      this.lastRenderTime = time;
      this.render(this.accumulator / STEP);
    }
  };

  public start(): void {
    if (
      this.isRunning ||
      !this.attached ||
      !this.ctx ||
      (typeof document !== 'undefined' && document.hidden)
    )
      return;
    if (this.reducedMotion) {
      this.render(0, true);
      return;
    }
    this.isRunning = true;
    this.lastTime = 0;
    this.lastRenderTime = 0;
    this.accumulator = 0;
    this.counters.starts++;
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    const active = this.isRunning || this.rafId !== 0;
    this.isRunning = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.lastTime = 0;
    this.lastRenderTime = 0;
    this.accumulator = 0;
    if (active) this.counters.stops++;
  }

  private update(dt = STEP): void {
    this.updateCount++;
    this.quietRemaining = Math.max(0, this.quietRemaining - dt);
    this.turnoverRemaining -= dt;
    this.controllerElapsed += dt;
    this.resolveCollisions(dt);
    for (let index = this.cells.length - 1; index >= 0; index--) {
      const cell = this.cells[index];
      this.updateMotion(cell, dt);
      if (this.updateLifecycle(cell, index, dt)) continue;
      this.updateMembrane(cell, dt);
    }
    if (this.controllerElapsed >= 1) {
      this.controllerElapsed %= 1;
      this.updateHomeostasis();
    }
  }

  private updateMotion(cell: LivingCell, dt: number): void {
    cell.previousX = cell.x;
    cell.previousY = cell.y;
    cell.previousRadius = cell.radius;
    cell.age += dt;
    cell.stateElapsed += dt;
    cell.breathPhase += cell.breathSpeed * dt;
    cell.morphPhase += cell.morphSpeed * dt;
    cell.wobblePhase += cell.wobbleSpeed * dt;
    cell.angle += cell.vAngle * dt;
    cell.nucleusAngle += cell.vAngle * 0.7 * dt;
    cell.glowIntensity = Math.max(1, cell.glowIntensity - 0.08 * dt);
    for (const org of cell.organelles) if ('spinSpeed' in org) org.angle += org.spinSpeed * dt;

    if (cell.isGrabbed && cell.targetDragPos) {
      const ease = 1 - Math.exp(-12 * dt);
      const dx = (cell.targetDragPos.x - cell.x) * ease;
      const dy = (cell.targetDragPos.y - cell.y) * ease;
      cell.x += dx;
      cell.y += dy;
      cell.vx = clamp(dx / dt, -120, 120);
      cell.vy = clamp(dy / dt, -120, 120);
    } else {
      cell.x += cell.vx * dt;
      cell.y += cell.vy * dt;
      const drag = Math.exp(-0.018 * dt);
      cell.vx *= drag;
      cell.vy *= drag;
      const speed = Math.hypot(cell.vx, cell.vy);
      if (speed > 32) {
        cell.vx = (cell.vx / speed) * 32;
        cell.vy = (cell.vy / speed) * 32;
      }
    }
    if (!cell.isGrabbed && this.width > 0 && this.height > 0) {
      const margin = this.collisionRadius(cell) * 1.25;
      if (cell.x < -margin) {
        cell.x = this.width + margin;
        cell.previousX = cell.x;
      } else if (cell.x > this.width + margin) {
        cell.x = -margin;
        cell.previousX = cell.x;
      }
      if (cell.y < -margin) {
        cell.y = this.height + margin;
        cell.previousY = cell.y;
      } else if (cell.y > this.height + margin) {
        cell.y = -margin;
        cell.previousY = cell.y;
      }
    }
  }

  private updateLifecycle(cell: LivingCell, index: number, dt: number): boolean {
    const breathing = 1 + 0.015 * Math.sin(cell.breathPhase);
    if (cell.state === 'growing') {
      cell.growthProgress = clamp(cell.growthProgress + dt / cell.growthDuration, 0, 1);
      const progress = smootherstep(cell.growthProgress);
      cell.baseRadius = Math.cbrt(lerp(cell.birthRadius ** 3, cell.targetRadius ** 3, progress));
      cell.radius = cell.baseRadius * breathing;
      cell.life = 1;
      if (cell.growthProgress >= 1 || cell.baseRadius >= cell.targetRadius * 0.9995) {
        cell.state = 'mature';
        cell.stateElapsed = 0;
        cell.matureElapsed = 0;
        cell.growthProgress = 1;
        cell.baseRadius = cell.targetRadius;
        cell.radius = cell.targetRadius * breathing;
      }
      return false;
    }
    if (cell.state === 'mature') {
      cell.matureElapsed += dt;
      cell.baseRadius = cell.targetRadius;
      cell.radius = cell.targetRadius * breathing;
      cell.life = 1;
      return false;
    }
    if (cell.state === 'mitosis') {
      cell.mitosisProgress = clamp(cell.stateElapsed / MITOSIS_SECONDS, 0, 1);
      cell.baseRadius = cell.divisionRadius ?? cell.baseRadius;
      cell.radius = cell.baseRadius;
      if (cell.mitosisProgress >= 1) {
        this.completeMitosis(cell, index);
        return true;
      }
      return false;
    }
    cell.apoptosisProgress = clamp(cell.stateElapsed / APOPTOSIS_SECONDS, 0, 1);
    const progress = cell.apoptosisProgress;
    const startRadius = cell.apoptosisStartRadius ?? cell.baseRadius;
    cell.baseRadius = startRadius * (1 - 0.24 * windowed(progress, 0.02, 0.72));
    cell.radius = cell.baseRadius;
    cell.life = 1 - windowed(progress, 0.72, 1);
    this.updateBlebs(cell, progress);
    if (progress >= 1) {
      this.cells.splice(index, 1);
      this.quietRemaining = Math.max(4, this.quietRemaining);
      return true;
    }
    return false;
  }

  private completeMitosis(parent: LivingCell, index: number): void {
    const axis = parent.mitosisAngle ?? 0;
    const divisionRadius = parent.divisionRadius ?? parent.baseRadius;
    const birthRadius = divisionRadius * DAUGHTER_RATIO;
    const pole = divisionRadius * 0.82;
    const first = this.createCell(
      parent.x + Math.cos(axis) * pole,
      parent.y + Math.sin(axis) * pole,
      false,
      parent.targetRadius,
      birthRadius
    );
    const second = this.createCell(
      parent.x - Math.cos(axis) * pole,
      parent.y - Math.sin(axis) * pole,
      false,
      parent.targetRadius,
      birthRadius
    );
    for (const [daughter, side] of [
      [first, 1],
      [second, -1],
    ] as const) {
      daughter.state = birthRadius < daughter.targetRadius * SIZE_CHECKPOINT ? 'growing' : 'mature';
      daughter.stateElapsed = 0;
      daughter.growthProgress = daughter.state === 'growing' ? 0 : 1;
      daughter.birthRadius = birthRadius;
      daughter.baseRadius = birthRadius;
      daughter.radius = birthRadius;
      daughter.previousRadius = birthRadius;
      daughter.age = 0;
      daughter.matureElapsed = 0;
      daughter.life = 1;
      daughter.vx = parent.vx + Math.cos(axis) * side * 8;
      daughter.vy = parent.vy + Math.sin(axis) * side * 8;
      daughter.angle = parent.angle;
      daughter.breathPhase = parent.breathPhase + side * 0.18;
      daughter.morphPhase = parent.morphPhase + side * 0.12;
      daughter.harmonics = parent.harmonics.map(
        (value) => value * this.rand(0.92, 1.08)
      ) as LivingCell['harmonics'];
      daughter.organelles = this.inheritOrganelles(parent, side);
      daughter.nucleusOffset = {
        x: clamp(parent.nucleusOffset.x + side * 0.015, -0.08, 0.08),
        y: parent.nucleusOffset.y * 0.75,
      };
      daughter.glowIntensity = 1.06;
    }
    this.cells.splice(index, 1, first, second);
    this.quietRemaining = Math.max(4, this.quietRemaining);
  }

  private inheritOrganelles(parent: LivingCell, side: 1 | -1): Organelle[] {
    const result: Organelle[] = [];
    const mitochondria = parent.organelles.filter((org) => org.type === 'mitochondria');
    const sourceMito = mitochondria[side === 1 ? 0 : Math.min(1, mitochondria.length - 1)];
    if (sourceMito) {
      const clone = cloneOrganelle(sourceMito);
      if (clone.type === 'mitochondria') clone.angle += side * 0.12;
      result.push(clone);
    }
    for (const type of ['golgi', 'er', 'centrosome'] as const) {
      const source = parent.organelles.find((org) => org.type === type);
      if (!source) continue;
      const clone = cloneOrganelle(source);
      if ('angle' in clone) clone.angle += side * 0.15;
      result.push(clone);
    }
    return result;
  }

  private updateBlebs(cell: LivingCell, progress: number): void {
    for (const bleb of cell.blebs ?? []) {
      const growth = windowed(
        progress,
        bleb.onset,
        Math.min(bleb.detachAt, bleb.onset + 0.2 / bleb.growthSpeed)
      );
      const clearance = windowed(progress, 0.72, 1);
      bleb.radius = bleb.maxRadius * growth * (1 - clearance * 0.35);
      bleb.detached = progress >= bleb.detachAt;
      bleb.dist = 0.86 + growth * 0.14 + windowed(progress, bleb.detachAt, 1) * bleb.drift;
      bleb.alpha = 1 - clearance;
    }
  }

  private updateMembrane(cell: LivingCell, dt: number): void {
    if (cell.state === 'mitosis' || cell.state === 'apoptosis') return;
    const damping = Math.exp(-9 * dt);
    for (const vertex of cell.vertices) {
      const theta = vertex.angle;
      const harmonic =
        cell.harmonics[0] * Math.sin(theta * 3 + cell.wobblePhase) +
        cell.harmonics[1] * Math.sin(theta * 5 - cell.wobblePhase * 0.8) +
        cell.harmonics[2] * Math.sin(theta * 7 + cell.wobblePhase * 1.2) +
        cell.harmonics[3] * Math.sin(theta * 9 - cell.wobblePhase * 0.45) +
        0.012 * Math.sin(theta * 2 + cell.morphPhase);
      vertex.equilibriumOffset = harmonic * cell.radius;
      vertex.velocity += (vertex.equilibriumOffset - vertex.displacement) * 42 * dt;
      vertex.velocity *= damping;
      vertex.displacement = clamp(
        vertex.displacement + vertex.velocity * dt,
        -cell.radius * 0.08,
        cell.radius * 0.08
      );
    }
  }

  private collisionRadius(cell: LivingCell): number {
    if (cell.state === 'mitosis') {
      const radius = cell.divisionRadius ?? cell.radius;
      return radius * lerp(1, 1.62, windowed(cell.mitosisProgress ?? 0, 0.15, 0.9));
    }
    return Math.max(4, cell.radius);
  }

  private resolveCollisions(dt: number): void {
    for (let i = 0; i < this.cells.length; i++) {
      for (let j = i + 1; j < this.cells.length; j++) {
        const first = this.cells[i];
        const second = this.cells[j];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.hypot(dx, dy);
        const minimum = this.collisionRadius(first) + this.collisionRadius(second);
        if (distance >= minimum) continue;
        const nx = distance > 0.001 ? dx / distance : Math.cos((i + 1) * 2.1);
        const ny = distance > 0.001 ? dy / distance : Math.sin((i + 1) * 2.1);
        const impulse = clamp(Math.min(minimum * 0.22, minimum - distance) * 5 * dt, 0, 3.5);
        if (!first.isGrabbed) {
          first.vx -= nx * impulse;
          first.vy -= ny * impulse;
        }
        if (!second.isGrabbed) {
          second.vx += nx * impulse;
          second.vy += ny * impulse;
        }
      }
    }
  }

  private projectedCount(): number {
    return this.cells.reduce((total, cell) => {
      if (cell.state === 'apoptosis') return total;
      return total + (cell.state === 'mitosis' ? 2 : 1);
    }, 0);
  }

  private updateHomeostasis(): void {
    if (
      this.quietRemaining > 0 ||
      this.cells.some((cell) => cell.state === 'mitosis' || cell.state === 'apoptosis')
    )
      return;
    this.pruneQueue();
    const projected = this.projectedCount();
    const target = this.targetCount || this.baseCount || 6;
    if (projected > target) {
      const candidate = this.apoptosisCandidate();
      if (candidate) this.triggerApoptosis(candidate);
      return;
    }
    if (this.divisionQueue.length) {
      const cell = this.cells.find((candidate) => candidate.id === this.divisionQueue[0]);
      if (cell && cell.state !== 'mitosis' && cell.state !== 'apoptosis') {
        this.triggerMitosis(cell, true);
      }
      return;
    }
    if (projected < target) {
      const candidate = this.divisionCandidate();
      if (candidate) {
        this.triggerMitosis(candidate);
      }
      return;
    }
    if (this.replacementOwed) {
      this.replacementOwed = false;
      this.turnoverRemaining = this.turnoverDelay();
      return;
    }
    if (this.turnoverRemaining <= 0) {
      const candidate = this.apoptosisCandidate();
      if (candidate) {
        this.replacementOwed = true;
        this.turnoverRemaining = this.turnoverDelay();
        this.triggerApoptosis(candidate);
      }
    }
  }

  private pruneQueue(): void {
    const seen = new Set<string>();
    this.divisionQueue = this.divisionQueue.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      const cell = this.cells.find((candidate) => candidate.id === id);
      return Boolean(
        cell && cell.divisionQueued && cell.state !== 'mitosis' && cell.state !== 'apoptosis'
      );
    });
  }

  private peripheral(candidates: LivingCell[]): LivingCell[] {
    const outer = candidates.filter(
      (cell) => cell.x < this.width * 0.22 || cell.x > this.width * 0.78
    );
    return outer.length ? outer : candidates;
  }

  private divisionCandidate(): LivingCell | null {
    const candidates = this.peripheral(
      this.cells.filter(
        (cell) =>
          cell.state === 'mature' &&
          cell.baseRadius >= cell.targetRadius * SIZE_CHECKPOINT &&
          cell.matureElapsed >= MATURE_DWELL &&
          !cell.isGrabbed &&
          !cell.divisionQueued
      )
    );
    return candidates.length ? candidates[Math.floor(this.random() * candidates.length)] : null;
  }

  private apoptosisCandidate(): LivingCell | null {
    return (
      this.peripheral(
        this.cells.filter(
          (cell) =>
            cell.state === 'mature' &&
            cell.matureElapsed >= MATURE_DWELL &&
            !cell.isGrabbed &&
            !cell.divisionQueued
        )
      ).sort((a, b) => b.age - a.age)[0] ?? null
    );
  }

  private turnoverDelay(): number {
    return this.coarse ? this.rand(45, 70) : this.rand(30, 50);
  }

  private render(interpolation = 0, reducedFrame = false): void {
    if (!this.ctx || !this.canvas) return;
    this.renderCount++;
    this.ctx.clearRect(0, 0, this.width, this.height);
    for (const cell of this.cells) {
      if (reducedFrame) this.renderReducedCell(cell);
      else this.renderCell(cell, interpolation);
    }
  }

  private renderReducedCell(cell: LivingCell): void {
    if (!this.ctx) return;
    const radius =
      cell.state === 'apoptosis'
        ? (cell.apoptosisStartRadius ?? cell.targetRadius)
        : cell.targetRadius;
    this.ctx.save();
    this.ctx.translate(cell.x, cell.y);
    this.path(this.circlePoints(radius));
    this.fillStroke(1, 0.72);
    this.ctx.restore();
  }

  private renderCell(cell: LivingCell, interpolation: number): void {
    const x = lerp(cell.previousX, cell.x, interpolation);
    const y = lerp(cell.previousY, cell.y, interpolation);
    const radius = lerp(cell.previousRadius, cell.radius, interpolation);
    if (radius <= 1 || cell.life <= 0.002) return;
    if (cell.state === 'mitosis') this.renderMitosis(cell, x, y);
    else if (cell.state === 'apoptosis') this.renderApoptosis(cell, x, y);
    else this.renderInterphase(cell, x, y, radius);
  }

  private renderInterphase(cell: LivingCell, x: number, y: number, radius: number): void {
    if (!this.ctx) return;
    this.ctx.save();
    this.ctx.translate(x, y);
    this.path(this.sampleNormalContour(cell, 0, radius));
    this.fillStroke(cell.glowIntensity, cell.life, cell.isGrabbed);
    this.ctx.clip();
    this.renderInterior(cell, radius, cell.life);
    this.ctx.restore();
  }

  private renderInterior(
    cell: LivingCell,
    radius: number,
    opacity: number,
    showNucleus = true
  ): void {
    if (!this.ctx) return;
    const { accent, ink, glow, dark } = this.palette;
    const alpha = BASE_ALPHA * this.visualScale * opacity;
    const scale = radius / Math.max(1, cell.targetRadius);
    const nx = cell.nucleusOffset.x * radius;
    const ny = cell.nucleusOffset.y * radius;
    const nr = radius * 0.25;
    if (showNucleus) {
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, nr, 0, TAU);
      this.ctx.fillStyle = `rgba(${accent}, ${0.055 * alpha})`;
      this.ctx.fill();
      this.ctx.lineWidth = 0.75;
      this.ctx.strokeStyle = `rgba(${ink}, ${0.052 * alpha})`;
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, nr * 0.36, 0, TAU);
      this.ctx.fillStyle = `rgba(${ink}, ${0.065 * alpha})`;
      this.ctx.fill();
    }
    // The homepage already has a foreground DNA canvas. On coarse pointers,
    // retain the cell/nucleus silhouette but omit subcellular decoration so the
    // two ambient layers do not compete for attention or mobile paint time.
    if ((this.isHomepage && this.coarse) || (this.coarse && radius < 34)) return;

    for (const org of cell.organelles) {
      if (org.type === 'mitochondria') {
        const ox = Math.cos(org.angle + cell.angle) * radius * org.dist;
        const oy = Math.sin(org.angle + cell.angle) * radius * org.dist;
        this.ctx.save();
        this.ctx.translate(ox, oy);
        this.ctx.rotate(org.rotAngle + cell.angle);
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, (org.length * scale) / 2, (org.width * scale) / 2, 0, 0, TAU);
        this.ctx.fillStyle = `rgba(${accent}, ${0.052 * alpha})`;
        this.ctx.fill();
        this.ctx.strokeStyle = `rgba(${dark ? glow : ink}, ${0.062 * alpha})`;
        this.ctx.stroke();
        this.ctx.restore();
      } else if (org.type === 'golgi') {
        const ox = Math.cos(org.angle + cell.angle) * radius * org.dist;
        const oy = Math.sin(org.angle + cell.angle) * radius * org.dist;
        this.ctx.save();
        this.ctx.translate(ox, oy);
        this.ctx.rotate(org.angle + cell.angle);
        this.ctx.lineWidth = 0.7;
        this.ctx.strokeStyle = `rgba(${accent}, ${0.06 * alpha})`;
        for (let layer = 0; layer < org.layers; layer++) {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, radius * (0.04 + layer * 0.025), -org.arcSpan / 2, org.arcSpan / 2);
          this.ctx.stroke();
        }
        this.ctx.restore();
      } else if (org.type === 'er') {
        this.ctx.save();
        this.ctx.translate(nx, ny);
        this.ctx.lineWidth = 0.65;
        this.ctx.strokeStyle = `rgba(${accent}, ${0.038 * alpha})`;
        for (let layer = 0; layer < org.layers; layer++) {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, nr * (1.13 + layer * 0.14), org.arcStart, org.arcStart + org.arcEnd);
          this.ctx.stroke();
        }
        this.ctx.restore();
      } else {
        const ox = Math.cos(org.angle + cell.angle) * radius * org.dist;
        const oy = Math.sin(org.angle + cell.angle) * radius * org.dist;
        const length = Math.max(1.1, radius * 0.032);
        this.ctx.beginPath();
        this.ctx.moveTo(ox - length, oy);
        this.ctx.lineTo(ox + length, oy);
        this.ctx.moveTo(ox, oy - length);
        this.ctx.lineTo(ox, oy + length);
        this.ctx.strokeStyle = `rgba(${ink}, ${0.065 * alpha})`;
        this.ctx.stroke();
      }
    }
  }

  private renderMitosis(cell: LivingCell, x: number, y: number): void {
    if (!this.ctx) return;
    const progress = cell.mitosisProgress ?? 0;
    const radius = cell.divisionRadius ?? cell.baseRadius;
    const axis = cell.mitosisAngle ?? 0;
    const daughterRadius = radius * DAUGHTER_RATIO;
    const pole = radius * 0.82 * windowed(progress, 0.14, 0.9);
    const lobe = lerp(radius, daughterRadius, windowed(progress, 0.14, 0.84));
    const waist = lobe * (1 - 0.975 * windowed(progress, 0.52, 0.98));
    const analytic = this.dualLobePoints(pole, lobe, waist);
    const entry = cell.mitosisEntryContour ?? this.circlePoints(radius);
    const blend = windowed(progress, 0, 0.16);
    const points = analytic.map((point, index) => mixPoint(entry[index] ?? point, point, blend));
    const alpha = BASE_ALPHA * this.visualScale * cell.life;
    const { accent, ink, glow, dark } = this.palette;

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(axis);
    this.path(points);
    this.fillStroke(1 + 0.12 * Math.sin(progress * Math.PI), cell.life);
    this.ctx.clip();

    const oldInterior = 1 - windowed(progress, 0.06, 0.3);
    if (oldInterior > 0.002) {
      this.ctx.save();
      this.ctx.rotate(-axis);
      this.renderInterior(cell, radius, oldInterior, false);
      this.ctx.restore();
    }

    const spindleAlpha = windowed(progress, 0.14, 0.28) * (1 - windowed(progress, 0.7, 0.92));
    const spindlePole = radius * lerp(0.12, 0.56, windowed(progress, 0.08, 0.7));
    for (const side of [-1, 1]) {
      const px = side * spindlePole;
      this.ctx.beginPath();
      this.ctx.arc(px, 0, Math.max(1.4, radius * 0.042), 0, TAU);
      this.ctx.fillStyle = `rgba(${accent}, ${0.13 * spindleAlpha * alpha})`;
      this.ctx.fill();
      this.ctx.strokeStyle = `rgba(${glow}, ${0.034 * spindleAlpha * alpha})`;
      this.ctx.lineWidth = 0.6;
      for (let ray = 0; ray < 6; ray++) {
        const angle = (ray / 6) * TAU;
        this.ctx.beginPath();
        this.ctx.moveTo(px, 0);
        this.ctx.lineTo(px + Math.cos(angle) * radius * 0.11, Math.sin(angle) * radius * 0.11);
        this.ctx.stroke();
      }
    }

    const count = 4;
    const spacing = clamp(radius * 0.12, 1.8, 5);
    const length = clamp(radius * 0.14, 2.4, 6.2);
    const width = clamp(radius * 0.035, 0.8, 1.5);
    const prophase = windowed(progress, 0.02, 0.12) * (1 - windowed(progress, 0.31, 0.38));
    const metaphase = windowed(progress, 0.22, 0.32) * (1 - windowed(progress, 0.46, 0.51));
    const anaphase = windowed(progress, 0.44, 0.5) * (1 - windowed(progress, 0.68, 0.76));
    const separation = radius * 0.48 * windowed(progress, 0.46, 0.64);
    for (let index = 0; index < count; index++) {
      const cy = (index - 1.5) * spacing;
      if (prophase > 0.002) {
        const cx = Math.sin(index * 1.9) * radius * 0.06 * (1 - windowed(progress, 0.08, 0.3));
        this.chromosomeX(cx, cy, length, width, prophase * alpha);
      }
      if (metaphase > 0.002) {
        const gap = width * 1.1;
        this.ctx.lineWidth = width;
        this.ctx.strokeStyle = `rgba(${accent}, ${0.14 * metaphase * alpha})`;
        this.ctx.beginPath();
        this.ctx.moveTo(-gap, cy - length / 2);
        this.ctx.lineTo(-gap, cy + length / 2);
        this.ctx.moveTo(gap, cy - length / 2);
        this.ctx.lineTo(gap, cy + length / 2);
        this.ctx.stroke();
        this.ctx.strokeStyle = `rgba(${glow}, ${0.035 * metaphase * alpha})`;
        for (const side of [-1, 1]) {
          this.ctx.beginPath();
          this.ctx.moveTo(side * spindlePole, 0);
          this.ctx.lineTo(side * gap, cy);
          this.ctx.stroke();
        }
      }
      if (anaphase > 0.002) {
        for (const side of [-1, 1]) {
          const cx = side * separation;
          this.ctx.lineWidth = width;
          this.ctx.strokeStyle = `rgba(${accent}, ${0.14 * anaphase * alpha})`;
          this.ctx.beginPath();
          this.ctx.moveTo(cx - side * length * 0.62, cy - length * 0.4);
          this.ctx.lineTo(cx, cy);
          this.ctx.lineTo(cx - side * length * 0.62, cy + length * 0.4);
          this.ctx.stroke();
        }
      }
    }

    const oldNucleus = 1 - windowed(progress, 0.12, 0.3);
    if (oldNucleus > 0.002) {
      this.ctx.beginPath();
      this.ctx.arc(0, 0, radius * lerp(0.25, 0.2, windowed(progress, 0, 0.16)), 0, TAU);
      this.ctx.fillStyle = `rgba(${accent}, ${0.05 * oldNucleus * alpha})`;
      this.ctx.fill();
      this.ctx.strokeStyle = `rgba(${ink}, ${0.048 * oldNucleus * alpha})`;
      this.ctx.stroke();
    }
    const newNuclei = windowed(progress, 0.64, 0.84);
    if (newNuclei > 0.002) {
      const distance = radius * lerp(0.45, 0.82, windowed(progress, 0.64, 0.94));
      for (const side of [-1, 1]) {
        this.ctx.beginPath();
        this.ctx.arc(side * distance, 0, daughterRadius * 0.24, 0, TAU);
        this.ctx.fillStyle = `rgba(${accent}, ${0.052 * newNuclei * alpha})`;
        this.ctx.fill();
        this.ctx.strokeStyle = `rgba(${ink}, ${0.05 * newNuclei * alpha})`;
        this.ctx.stroke();
      }
    }
    const daughterOrganelleAlpha = windowed(progress, 0.72, 0.94);
    if (daughterOrganelleAlpha > 0.002) {
      const distance = radius * lerp(0.55, 0.82, windowed(progress, 0.72, 0.94));
      for (const side of [-1, 1]) {
        this.ctx.save();
        this.ctx.translate(side * distance, 0);
        this.ctx.rotate(side * 0.28);
        this.ctx.beginPath();
        this.ctx.ellipse(
          0,
          daughterRadius * 0.31,
          daughterRadius * 0.095,
          daughterRadius * 0.038,
          0,
          0,
          TAU
        );
        this.ctx.fillStyle = `rgba(${accent}, ${0.045 * daughterOrganelleAlpha * alpha})`;
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(0, -daughterRadius * 0.3, daughterRadius * 0.09, -0.45, 0.45);
        this.ctx.strokeStyle = `rgba(${accent}, ${0.045 * daughterOrganelleAlpha * alpha})`;
        this.ctx.stroke();
        this.ctx.restore();
      }
    }
    const ring = windowed(progress, 0.5, 0.6) * (1 - windowed(progress, 0.94, 1));
    if (ring > 0.002) {
      // In this side-on optical section, the actomyosin ring is visible only where
      // it meets the upper and lower cortex. A full ellipse would read as an
      // implausible line drawn through the entire cell.
      this.ctx.strokeStyle = `rgba(${dark ? glow : accent}, ${0.085 * ring * alpha})`;
      this.ctx.lineWidth = 0.85;
      this.ctx.lineCap = 'round';
      const ringHalfWidth = Math.max(2.4, radius * 0.065);
      const ringDepth = Math.max(1.2, radius * 0.025);
      for (const side of [-1, 1]) {
        this.ctx.beginPath();
        this.ctx.moveTo(-ringHalfWidth, side * (waist + ringDepth * 0.15));
        this.ctx.quadraticCurveTo(
          0,
          side * (waist - ringDepth),
          ringHalfWidth,
          side * (waist + ringDepth * 0.15)
        );
        this.ctx.stroke();
      }
    }
    this.ctx.restore();
  }

  private chromosomeX(x: number, y: number, length: number, width: number, alpha: number): void {
    if (!this.ctx) return;
    this.ctx.lineWidth = width;
    this.ctx.strokeStyle = `rgba(${this.palette.accent}, ${0.13 * alpha})`;
    this.ctx.beginPath();
    this.ctx.moveTo(x - length * 0.38, y - length * 0.5);
    this.ctx.lineTo(x + length * 0.38, y + length * 0.5);
    this.ctx.moveTo(x - length * 0.38, y + length * 0.5);
    this.ctx.lineTo(x + length * 0.38, y - length * 0.5);
    this.ctx.stroke();
  }

  private renderApoptosis(cell: LivingCell, x: number, y: number): void {
    if (!this.ctx) return;
    const progress = cell.apoptosisProgress ?? 0;
    const startRadius = cell.apoptosisStartRadius ?? cell.baseRadius;
    const coreRadius = startRadius * (1 - 0.24 * windowed(progress, 0.02, 0.72));
    const entry = cell.apoptosisEntryContour ?? this.circlePoints(startRadius);
    const circle = this.circlePoints(coreRadius);
    const blend = windowed(progress, 0, 0.18);
    const points = circle.map((point, index) => mixPoint(entry[index] ?? point, point, blend));
    const alpha = BASE_ALPHA * this.visualScale * cell.life;
    const { accent, ink, glow, dark } = this.palette;
    this.ctx.save();
    this.ctx.translate(x, y);
    this.path(points);
    this.fillStroke(1.02, cell.life);

    const oldInterior = 1 - windowed(progress, 0.16, 0.54);
    if (oldInterior > 0.002) {
      this.ctx.save();
      this.ctx.clip();
      this.renderInterior(cell, coreRadius, oldInterior, false);
      this.ctx.restore();
    }

    const pyknosis = windowed(progress, 0.02, 0.18);
    const fragmentation = windowed(progress, 0.42, 0.7);
    if (fragmentation < 0.98) {
      this.ctx.beginPath();
      this.ctx.arc(0, 0, startRadius * lerp(0.24, 0.12, pyknosis), 0, TAU);
      this.ctx.fillStyle = `rgba(${ink}, ${0.07 * (1 - fragmentation) * alpha})`;
      this.ctx.fill();
    }
    for (let index = 0; index < 3; index++) {
      const angle = (index / 3) * TAU + 0.3;
      const distance = startRadius * 0.24 * fragmentation;
      this.ctx.beginPath();
      this.ctx.arc(
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
        startRadius * 0.075 * fragmentation,
        0,
        TAU
      );
      this.ctx.fillStyle = `rgba(${ink}, ${0.055 * fragmentation * alpha})`;
      this.ctx.fill();
    }

    for (const bleb of cell.blebs ?? []) {
      if (bleb.radius <= 0.1 || bleb.alpha <= 0.002) continue;
      const distance = coreRadius * bleb.dist;
      const bx = Math.cos(bleb.angle) * distance;
      const by = Math.sin(bleb.angle) * distance;
      const ba = alpha * bleb.alpha;
      this.ctx.beginPath();
      this.ctx.arc(bx, by, bleb.radius, 0, TAU);
      this.ctx.fillStyle = `rgba(${accent}, ${0.04 * ba})`;
      this.ctx.fill();
      this.ctx.strokeStyle = `rgba(${dark ? glow : ink}, ${0.055 * ba})`;
      this.ctx.stroke();
      if (bleb.detached && bleb.carriesFragment) {
        this.ctx.beginPath();
        this.ctx.arc(bx, by, Math.max(0.7, bleb.radius * 0.26), 0, TAU);
        this.ctx.fillStyle = `rgba(${ink}, ${0.05 * ba})`;
        this.ctx.fill();
      }
    }
    this.ctx.restore();
  }

  private sampleNormalContour(cell: LivingCell, localAxis = 0, radiusOverride?: number): Point[] {
    const radius = radiusOverride ?? cell.radius;
    return Array.from({ length: CONTOUR_SEGMENTS }, (_, index) => {
      const position = (index / CONTOUR_SEGMENTS) * VERTEX_COUNT;
      const lower = Math.floor(position) % VERTEX_COUNT;
      const upper = (lower + 1) % VERTEX_COUNT;
      const amount = position - Math.floor(position);
      const displacement = lerp(
        cell.vertices[lower].displacement,
        cell.vertices[upper].displacement,
        amount
      );
      const theta = (index / CONTOUR_SEGMENTS) * TAU + cell.angle - localAxis;
      const r = Math.max(4, radius + displacement);
      return { x: Math.cos(theta) * r, y: Math.sin(theta) * r };
    });
  }

  private circlePoints(radius: number): Point[] {
    return Array.from({ length: CONTOUR_SEGMENTS }, (_, index) => {
      const theta = (index / CONTOUR_SEGMENTS) * TAU;
      return { x: Math.cos(theta) * radius, y: Math.sin(theta) * radius };
    });
  }

  private dualLobePoints(pole: number, lobe: number, waist: number): Point[] {
    if (pole < 0.001) return this.circlePoints(lobe);
    const extent = pole + lobe;
    return Array.from({ length: CONTOUR_SEGMENTS }, (_, index) => {
      const theta = (index / CONTOUR_SEGMENTS) * TAU;
      const x = extent * Math.cos(theta);
      const absoluteX = Math.abs(x);
      let halfHeight: number;
      if (absoluteX >= pole) {
        const cap = Math.min(lobe, absoluteX - pole);
        halfHeight = Math.sqrt(Math.max(0, lobe * lobe - cap * cap));
      } else {
        halfHeight = lerp(waist, lobe, smootherstep(absoluteX / pole));
      }
      return { x, y: halfHeight * (Math.sin(theta) >= 0 ? 1 : -1) };
    });
  }

  private path(points: Point[]): void {
    if (!this.ctx || !points.length) return;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index++)
      this.ctx.lineTo(points[index].x, points[index].y);
    this.ctx.closePath();
  }

  private fillStroke(brightness: number, opacity: number, grabbed = false): void {
    if (!this.ctx) return;
    const { accent, ink, glow, dark } = this.palette;
    const level = clamp(brightness, 0.8, 1.2);
    const alpha = BASE_ALPHA * this.visualScale * opacity;
    this.ctx.fillStyle = `rgba(${accent}, ${0.028 * level * alpha})`;
    this.ctx.fill();
    this.ctx.lineWidth = grabbed ? 1.4 : 1.1;
    this.ctx.strokeStyle = `rgba(${dark ? glow : ink}, ${(grabbed ? 0.09 : 0.06) * level * alpha})`;
    this.ctx.stroke();
  }

  private installDebug(): void {
    if (typeof window === 'undefined') return;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    if (!local || new URLSearchParams(window.location.search).get('cell-audit') !== '1') return;
    window.__khcCellsDebug = {
      snapshot: () => this.debugSnapshot(),
      setCellState: (id, state, progress) => this.debugSetState(id, state, progress),
    };
  }

  private debugSnapshot(): DebugSnapshot {
    return {
      running: this.isRunning,
      attached: this.attached,
      reduced: this.reducedMotion,
      targetCount: this.targetCount,
      projectedCount: this.projectedCount(),
      activeLifecycle: this.cells.filter(
        (cell) => cell.state === 'mitosis' || cell.state === 'apoptosis'
      ).length,
      queuedRequests: this.divisionQueue.length,
      updateCount: this.updateCount,
      renderCount: this.renderCount,
      counters: { ...this.counters },
      dpr: this.dpr,
      width: this.width,
      height: this.height,
      // Kept in the audit schema to assert that the removed particle system
      // cannot silently return.
      particles: 0,
      cells: this.cells.map((cell) => ({
        id: cell.id,
        x: cell.x,
        y: cell.y,
        radius: cell.radius,
        targetRadius: cell.targetRadius,
        state: cell.state,
        progress:
          cell.state === 'mitosis'
            ? (cell.mitosisProgress ?? 0)
            : cell.state === 'apoptosis'
              ? (cell.apoptosisProgress ?? 0)
              : cell.state === 'growing'
                ? cell.growthProgress
                : 1,
        isGrabbed: cell.isGrabbed,
        divisionQueued: cell.divisionQueued,
      })),
    };
  }

  private debugSetState(id: string, state: CellState, progress = 0): boolean {
    const cell = this.cells.find((candidate) => candidate.id === id);
    if (!cell) return false;
    const normalized = clamp(progress, 0, 0.999);
    cell.divisionQueued = false;
    cell.isGrabbed = false;
    cell.targetDragPos = undefined;
    if (this.grabbedCell?.id === id) this.grabbedCell = null;
    if (this.pointerCandidate?.id === id) this.pointerCandidate = null;
    this.divisionQueue = this.divisionQueue.filter((queued) => queued !== id);

    // Diagnostics may jump directly between lifecycle branches. Normalize the
    // cell first so the public biological guards cannot retain stale payloads.
    if (cell.state === 'mitosis' || cell.state === 'apoptosis') {
      const restoredRadius = cell.divisionRadius ?? cell.apoptosisStartRadius ?? cell.baseRadius;
      cell.state = 'mature';
      cell.stateElapsed = 0;
      cell.baseRadius = restoredRadius;
      cell.radius = restoredRadius;
      cell.previousRadius = restoredRadius;
      cell.mitosisProgress = undefined;
      cell.mitosisAngle = undefined;
      cell.divisionRadius = undefined;
      cell.mitosisEntryContour = undefined;
      cell.apoptosisProgress = undefined;
      cell.apoptosisStartRadius = undefined;
      cell.apoptosisEntryContour = undefined;
      cell.blebs = undefined;
    }

    if (state === 'mitosis') {
      this.triggerMitosis(cell, true);
      cell.stateElapsed = normalized * MITOSIS_SECONDS;
      cell.mitosisProgress = normalized;
    } else if (state === 'apoptosis') {
      this.triggerApoptosis(cell);
      cell.stateElapsed = normalized * APOPTOSIS_SECONDS;
      cell.apoptosisProgress = normalized;
      this.updateBlebs(cell, normalized);
    } else if (state === 'growing') {
      cell.state = 'growing';
      cell.stateElapsed = normalized * cell.growthDuration;
      cell.growthProgress = normalized;
      cell.birthRadius = Math.min(cell.birthRadius, cell.targetRadius * 0.8);
      cell.baseRadius = Math.cbrt(
        lerp(cell.birthRadius ** 3, cell.targetRadius ** 3, smootherstep(normalized))
      );
      cell.radius = cell.baseRadius;
      cell.life = 1;
      cell.mitosisProgress = undefined;
      cell.apoptosisProgress = undefined;
    } else {
      cell.state = 'mature';
      cell.stateElapsed = 0;
      cell.growthProgress = 1;
      cell.matureElapsed = Math.max(MATURE_DWELL, cell.matureElapsed);
      cell.baseRadius = cell.targetRadius;
      cell.radius = cell.targetRadius;
      cell.life = 1;
      cell.mitosisProgress = undefined;
      cell.apoptosisProgress = undefined;
    }
    if (!this.isRunning) this.render(0, this.reducedMotion);
    return true;
  }
}

let engineInstance: LivingCellsEngine | null = null;

export function getLivingCellsEngine(): LivingCellsEngine {
  if (!engineInstance) engineInstance = new LivingCellsEngine();
  return engineInstance;
}

export function initLivingCellsBackground(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-site-bg-canvas]');
  if (canvas) getLivingCellsEngine().attach(canvas);
  else getLivingCellsEngine().detach();
}
