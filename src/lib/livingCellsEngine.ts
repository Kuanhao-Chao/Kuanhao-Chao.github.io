/**
 * Calm, fixed-timestep somatic animal-cell background.
 *
 * The biology is intentionally schematic but coherent: interphase growth,
 * open bipolar mitosis with cytokinesis, and membrane-bound apoptosis. The
 * simulation advances at 60 fixed updates per second independently of display
 * refresh rate.
 */

export interface ApoptoticBleb {
  ownerId: string;
  angle: number;
  dist: number;
  radius: number;
  maxRadius: number;
  growthSpeed: number;
  detached: boolean;
  alpha: number;
  onset: number;
  detachAt: number;
  peakAt: number;
  retractAt: number;
  releases: boolean;
  neck: number;
  carriesFragment: boolean;
  drift: number;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  independent: boolean;
  age: number;
  lifetime: number;
}

export interface VertexSpring {
  angle: number;
  displacement: number;
  velocity: number;
  equilibriumOffset: number;
}

export type CellMode = 'ambient' | 'calm' | 'lab' | 'off';
export type CellAction = 'divide' | 'apoptosis';
export type CellState = 'growing' | 'mature' | 'mitosis' | 'postmitotic' | 'apoptosis';
type LifecycleSource = 'user' | 'automatic';
type DetailLevel = 'full' | 'reduced' | 'minimal';

export interface CellSimParams {
  targetPopulation: number;
  growthMultiplier: number;
  mitosisMultiplier: number;
  apoptosisMultiplier: number;
  timeScale: number;
  isPaused: boolean;
  visualAlpha: number;
  darkContrast: boolean;
}

export interface CellTelemetry {
  total: number;
  interphase: number;
  mitosis: number;
  postmitotic: number;
  apoptosis: number;
  births: number;
  deaths: number;
  fps: number;
}

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

interface MitosisPlan {
  axis: number;
  radius: number;
  daughterRadius: number;
  daughters: [LivingCell, LivingCell];
  source: LifecycleSource;
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
  harmonicPhases: [number, number, number, number];
  harmonicSpeeds: [number, number, number, number];
  aspect: number;
  vertices: VertexSpring[];
  breathPhase: number;
  breathSpeed: number;
  morphPhase: number;
  morphSpeed: number;
  nucleusOffset: { x: number; y: number };
  nucleusRatio: number;
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
  mitosisPlan?: MitosisPlan;
  postmitoticProgress?: number;
  siblingId?: string;
  siblingRestDistance?: number;
  siblingAxis?: number;
  siblingSide?: -1 | 1;
  recoveryOffset?: number;
  recoveryBaseVelocity?: Point;
  recoveryRecoil?: number;
  lineageId?: string;
  apoptosisProgress?: number;
  apoptosisStartRadius?: number;
  apoptosisEntryContour?: Point[];
  apoptosisFragmentAngles?: number[];
  blebs?: ApoptoticBleb[];
  glowIntensity: number;
  contactCount: number;
  lifecycleSource?: LifecycleSource;
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
  mode: CellMode;
  labAction: CellAction;
  selectedCellId: string | null;
  bodyCount: number;
  controllerFrozen: boolean;
  detailLevel: DetailLevel;
  timings: {
    updateP50: number;
    updateP95: number;
    updateMax: number;
    renderP50: number;
    renderP95: number;
    renderMax: number;
  };
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
    phase: string;
    aspect: number;
    contourArea: number;
    targetArea: number;
    organelleCount: number;
    organelleTypes: string[];
    contactCount: number;
    siblingId?: string;
    apoptoticBodyCount: number;
  }>;
}

interface DebugSurface {
  snapshot(): DebugSnapshot;
  setCellState(id: string, state: CellState, progress?: number): boolean;
  setControllerFrozen(frozen: boolean): void;
}

declare global {
  interface Window {
    __khcCellsDebug?: DebugSurface;
  }
}

const TAU = Math.PI * 2;
const VERTEX_COUNT = 24;
const CONTOUR_SEGMENTS = 72;
const STEP = 1 / 60;
const MAX_STEPS = 4;
const MITOSIS_SECONDS = 4;
const POSTMITOTIC_SECONDS = 1.6;
const APOPTOSIS_SECONDS = 5.4;
const SIZE_CHECKPOINT = 0.97;
const MATURE_DWELL = 8;
const DAUGHTER_RATIO = Math.cbrt(0.5);
const BASE_ALPHA = 1.0;

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
const polygonArea = (points: Point[]): number => {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length];
    twiceArea += points[index].x * next.y - next.x * points[index].y;
  }
  return Math.abs(twiceArea) * 0.5;
};
const seededRandom = (seed: number): (() => number) => {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
};
const percentile = (values: number[], q: number): number => {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
};

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
  private apoptoticBodies: ApoptoticBleb[] = [];
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
  private rebalanceCooldown = 0;
  private inputQuietRemaining = 0;
  private pointer = { x: -1000, y: -1000, down: false, type: 'mouse', id: -1 };
  private pointerCandidate: LivingCell | null = null;
  private pointerDown = { x: 0, y: 0, time: 0 };
  private pointerSamples: Array<{ x: number; y: number; time: number }> = [];
  private preGrabVelocity: Point = { x: 0, y: 0 };
  private grabbedCell: LivingCell | null = null;
  private hoveredCell: LivingCell | null = null;
  private lastHoverTime = Number.NEGATIVE_INFINITY;
  private scrollActivityRemaining = 0;
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
  private mode: CellMode = 'ambient';
  private labAction: CellAction = 'divide';
  private selectedCellId: string | null = null;
  private selectedStatusPhase: string | null = null;
  private controllerFrozen = false;
  private detailLevel: DetailLevel = 'full';
  private updateTimings: number[] = [];
  private renderTimings: number[] = [];
  private adaptiveElapsed = 0;
  private random: () => number;
  private simParams: CellSimParams = {
    targetPopulation: 0,
    growthMultiplier: 1.0,
    mitosisMultiplier: 1.0,
    apoptosisMultiplier: 1.0,
    timeScale: 1.0,
    isPaused: false,
    visualAlpha: 1.0,
    darkContrast: false,
  };

  public constructor(random: () => number = Math.random) {
    this.random = random;
  }

  private rand(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  public getMode(): CellMode {
    return this.mode;
  }

  public setMode(mode: CellMode): void {
    const normalizedMode = mode === 'calm' ? 'ambient' : mode;
    if (!['ambient', 'calm', 'lab', 'off'].includes(mode)) return;
    this.mode = normalizedMode;
    if (typeof document !== 'undefined') document.documentElement.dataset.cellMode = normalizedMode;
    try {
      localStorage.setItem('khc-cell-mode', normalizedMode);
    } catch {}
    if (normalizedMode === 'off') {
      this.stop();
      this.cancelPointer(false);
      this.clearHover();
      this.clearCanvas();
      this.hideStatus();
    } else if (this.attached && typeof document !== 'undefined' && !document.hidden) {
      if (this.reducedMotion) this.render(0, true);
      else this.start();
    }
    this.dispatch('khc:cell-mode-change', { mode: normalizedMode });
  }

  public getParams(): CellSimParams {
    return { ...this.simParams };
  }

  public setParams(partial: Partial<CellSimParams>): void {
    this.simParams = { ...this.simParams, ...partial };
    if (partial.targetPopulation !== undefined && partial.targetPopulation > 0) {
      this.targetCount = partial.targetPopulation;
      this.baseCount = partial.targetPopulation;
    }
    this.dispatch('khc:cell-params-change', { params: this.getParams() });
  }

  public resetParams(): void {
    this.simParams = {
      targetPopulation: 0,
      growthMultiplier: 1.0,
      mitosisMultiplier: 1.0,
      apoptosisMultiplier: 1.0,
      timeScale: 1.0,
      isPaused: false,
      visualAlpha: 1.0,
      darkContrast: false,
    };
    this.dispatch('khc:cell-params-change', { params: this.getParams() });
  }

  public stepSingleFrame(): void {
    this.update(STEP);
    this.render(0, true);
  }

  public spawnRandomCell(x?: number, y?: number): LivingCell {
    const spawnX = x ?? this.rand(60, Math.max(120, this.width - 60));
    const spawnY = y ?? this.rand(60, Math.max(120, this.height - 60));
    const newCell = this.createCell(spawnX, spawnY, false);
    newCell.x = spawnX;
    newCell.y = spawnY;
    newCell.previousX = spawnX;
    newCell.previousY = spawnY;
    newCell.glowIntensity = 1.6;
    this.cells.push(newCell);
    this.counters.divisions++;
    this.dispatch('khc:cell-telemetry-update', { telemetry: this.getTelemetry() });
    return newCell;
  }

  public triggerRandomMitosis(): boolean {
    const candidates = this.cells.filter(
      (c) => c.state === 'mature' || (c.state === 'growing' && c.radius >= c.birthRadius * 1.05)
    );
    if (!candidates.length) return false;
    const chosen = candidates[Math.floor(this.random() * candidates.length)];
    this.triggerMitosis(chosen, true, 'user');
    return true;
  }

  public triggerRandomApoptosis(): boolean {
    const candidates = this.cells.filter((c) => c.state === 'mature' || c.state === 'growing');
    if (!candidates.length) return false;
    const chosen = candidates[Math.floor(this.random() * candidates.length)];
    this.triggerApoptosis(chosen, 'user');
    return true;
  }

  public resetPopulation(count?: number): void {
    this.cells = [];
    this.apoptoticBodies = [];
    this.divisionQueue = [];
    this.seeded = false;
    if (count && count > 0) {
      this.simParams.targetPopulation = count;
      this.targetCount = count;
      this.baseCount = count;
    }
    this.seed();
  }

  public clearAllCells(): void {
    this.cells = [];
    this.apoptoticBodies = [];
    this.divisionQueue = [];
  }

  public getTelemetry(): CellTelemetry {
    let interphase = 0;
    let mitosis = 0;
    let postmitotic = 0;
    let apoptosis = 0;
    for (const c of this.cells) {
      if (c.state === 'growing' || c.state === 'mature') interphase++;
      else if (c.state === 'mitosis') mitosis++;
      else if (c.state === 'postmitotic') postmitotic++;
      else if (c.state === 'apoptosis') apoptosis++;
    }
    const avgRender =
      this.renderTimings.length > 0
        ? this.renderTimings.reduce((a, b) => a + b, 0) / this.renderTimings.length
        : 16.6;
    const fps = Math.round(1000 / Math.max(1, avgRender));
    return {
      total: this.cells.length,
      interphase,
      mitosis,
      postmitotic,
      apoptosis,
      births: this.counters.divisions,
      deaths: this.counters.deaths,
      fps: clamp(fps, 1, 60),
    };
  }

  public getLabAction(): CellAction {
    return this.labAction;
  }

  public setLabAction(action: CellAction): void {
    if (!['divide', 'apoptosis'].includes(action) || action === this.labAction) return;
    this.labAction = action;
    if (typeof document !== 'undefined') document.documentElement.dataset.cellAction = action;
    try {
      sessionStorage.setItem('khc-cell-action', action);
    } catch {}
    this.dispatch('khc:cell-action-change', { action });
  }

  private dispatch(name: string, detail: Record<string, unknown>): void {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  private clearCanvas(): void {
    if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
  }

  public attach(canvas: HTMLCanvasElement): void {
    const sameCanvas = this.canvas === canvas && Boolean(this.ctx);
    if (sameCanvas && this.attached) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;
    this.attached = true;
    this.counters.attaches++;
    this.bindEvents();
    this.hydrateControls();
    this.refreshEnvironment();
    this.resize();
    if (!this.seeded) this.seed();
    this.installDebug();
    if (this.mode !== 'off' && (!sameCanvas || !this.isRunning)) this.start();
  }

  private hydrateControls(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    try {
      const storedMode = localStorage.getItem('khc-cell-mode');
      if (storedMode === 'calm' || storedMode === 'lab' || storedMode === 'off')
        this.mode = storedMode;
      const storedAction = sessionStorage.getItem('khc-cell-action');
      if (storedAction === 'divide' || storedAction === 'apoptosis') this.labAction = storedAction;
    } catch {}
    document.documentElement.dataset.cellMode = this.mode;
    document.documentElement.dataset.cellAction = this.labAction;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    if (local) {
      const params = new URLSearchParams(window.location.search);
      const seed = Number(params.get('cell-seed'));
      if (!this.seeded && Number.isFinite(seed) && seed >= 0) this.random = seededRandom(seed);
      this.controllerFrozen = params.get('cell-freeze') === '1';
    }
  }

  public detach(): void {
    if (!this.attached && !this.canvas) return;
    this.stop();
    this.cancelPointer(false);
    this.clearHover();
    this.attached = false;
    this.canvas = null;
    this.ctx = null;
    this.counters.detaches++;
  }

  private seed(): void {
    const count = this.targetCount || this.baseCount || 6;
    this.cells = [];
    for (let index = 0; index < count; index++) {
      const cell = this.createCell();
      for (let attempt = 0; attempt < 36; attempt++) {
        const margin = this.collisionRadius(cell);
        cell.x = this.rand(margin, Math.max(margin, this.width - margin));
        cell.y = this.rand(margin, Math.max(margin, this.height - margin));
        const separated = this.cells.every(
          (other) =>
            Math.hypot(other.x - cell.x, other.y - cell.y) >=
            (this.collisionRadius(other) + margin) * 0.94
        );
        if (separated) break;
      }
      cell.previousX = cell.x;
      cell.previousY = cell.y;
      this.cells.push(cell);
    }
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
    const aspect = this.rand(this.coarse ? 0.84 : 0.78, this.coarse ? 1.2 : 1.26);
    const deformationScale = this.coarse ? 0.75 : 1;
    const harmonics: LivingCell['harmonics'] = [
      this.rand(0.032, 0.068) * deformationScale,
      this.rand(0.024, 0.048) * deformationScale,
      this.rand(0.016, 0.034) * deformationScale,
      this.rand(0.010, 0.022) * deformationScale,
    ];
    const harmonicPhases: LivingCell['harmonicPhases'] = [
      this.rand(0, TAU),
      this.rand(0, TAU),
      this.rand(0, TAU),
      this.rand(0, TAU),
    ];
    const harmonicSpeeds: LivingCell['harmonicSpeeds'] = [
      this.rand(-0.15, 0.15),
      this.rand(-0.12, 0.12),
      this.rand(-0.09, 0.09),
      this.rand(-0.07, 0.07),
    ];
    const vertices = Array.from({ length: VERTEX_COUNT }, (_, index) => {
      const theta = (index / VERTEX_COUNT) * TAU;
      const equilibriumOffset = this.morphologyOffset(
        theta,
        birthRadius,
        harmonics,
        harmonicPhases
      );
      return {
        angle: theta,
        displacement: equilibriumOffset,
        velocity: 0,
        equilibriumOffset,
      };
    });
    const organelles: Organelle[] = [];
    const mitochondriaCount = this.coarse
      ? targetRadius > 38
        ? 2
        : 1
      : clamp(Math.round(targetRadius / 18), 2, 5);
    for (let i = 0; i < mitochondriaCount; i++) {
      organelles.push({
        type: 'mitochondria',
        angle: this.rand(0, TAU),
        dist: this.rand(0.31, 0.47),
        length: Math.max(4.5, targetRadius * 0.20),
        width: Math.max(2.4, targetRadius * 0.09),
        cristaeCount: Math.round(this.rand(4, 7)),
        rotAngle: this.rand(0, TAU),
        spinSpeed: this.rand(-0.07, 0.07),
      });
    }
    organelles.push({
      type: 'golgi',
      angle: this.rand(0, TAU),
      dist: this.rand(0.31, 0.43),
      arcSpan: this.rand(0.52, 0.78),
      layers: targetRadius > 48 ? 4 : 3,
      spinSpeed: this.rand(-0.04, 0.04),
      vesicles: Array.from({ length: Math.round(this.rand(3, 5)) }, () => ({
        angle: this.rand(-0.4, 0.4),
        dist: this.rand(0.04, 0.09),
        size: Math.max(0.7, targetRadius * 0.024),
      })),
    });
    organelles.push({
      type: 'er',
      arcStart: this.rand(0, TAU),
      arcEnd: this.rand(1.4, 2.2),
      layers: targetRadius > 46 ? 4 : 3,
      ribosomes: Array.from({ length: Math.round(this.rand(5, 9)) }, () => ({
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
      harmonics,
      harmonicPhases,
      harmonicSpeeds,
      aspect,
      vertices,
      breathPhase: this.rand(0, TAU),
      breathSpeed: this.rand(0.28, 0.46),
      morphPhase: this.rand(0, TAU),
      morphSpeed: this.rand(0.14, 0.25),
      nucleusOffset: (() => {
        const distance = Math.sqrt(this.random()) * 0.085;
        const theta = this.rand(0, TAU);
        return { x: Math.cos(theta) * distance, y: Math.sin(theta) * distance };
      })(),
      nucleusRatio: this.rand(0.22, 0.29),
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
      glowIntensity: growing ? 1.12 : 1,
      contactCount: 0,
    };
  }

  private morphologyOffset(
    theta: number,
    radius: number,
    amplitudes: LivingCell['harmonics'],
    phases: LivingCell['harmonicPhases'],
    morphPhase = 0
  ): number {
    const harmonicSum = amplitudes.reduce((sum, amplitude, index) => {
      return sum + amplitude * Math.cos((index + 2) * theta + phases[index]);
    }, 0);
    const pseudopod =
      0.038 * Math.sin(2 * theta + morphPhase) +
      0.024 * Math.sin(3 * theta - morphPhase * 0.7);
    return radius * (harmonicSum + pseudopod);
  }

  public triggerMitosis(
    cell: LivingCell,
    explicit = false,
    source: LifecycleSource = explicit ? 'user' : 'automatic'
  ): void {
    if (cell.state === 'mitosis' || cell.state === 'apoptosis') return;
    if (
      !explicit &&
      (cell.state !== 'mature' ||
        cell.baseRadius < cell.targetRadius * SIZE_CHECKPOINT ||
        cell.matureElapsed < MATURE_DWELL)
    )
      return;
    const radius = Math.max(4, cell.baseRadius);
    const axis = this.chooseDivisionAxis(cell, radius);
    cell.mitosisEntryContour = this.sampleNormalContour(cell, axis);
    cell.mitosisPlan = this.buildMitosisPlan(cell, axis, radius, source);
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
    cell.lifecycleSource = source;
    this.divisionQueue = this.divisionQueue.filter((id) => id !== cell.id);
    this.counters.divisions++;
    if (source === 'user') {
      this.inputQuietRemaining = 1.5;
      this.selectedCellId = cell.id;
      this.selectedStatusPhase = null;
      this.emitStatus(cell.id, 'mitosis', 'rounding', source, true);
    }
  }

  public triggerApoptosis(cell: LivingCell, source: LifecycleSource = 'automatic'): void {
    if (cell.state === 'mitosis' || cell.state === 'apoptosis') return;
    const radius = Math.max(4, cell.baseRadius);
    cell.apoptosisEntryContour = this.sampleNormalContour(cell);
    const fragmentBase = this.rand(0, TAU);
    cell.apoptosisFragmentAngles = [0, 1, 2, 3].map(
      (index) => fragmentBase + (index / 4) * TAU + this.rand(-0.14, 0.14)
    );
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
    const count = 4 + Math.floor(this.random() * 3);
    const releaseCount = Math.max(2, count - 1);
    cell.blebs = Array.from({ length: count }, (_, i) => {
      const onset = clamp(
        0.16 + (i / Math.max(1, count - 1)) * 0.26 + this.rand(-0.02, 0.02),
        0.16,
        0.44
      );
      const releases = i < releaseCount;
      const detachAt = releases
        ? clamp(
            0.52 + (i / Math.max(1, releaseCount - 1)) * 0.30 + this.rand(-0.015, 0.015),
            0.52,
            0.85
          )
        : clamp(onset + this.rand(0.20, 0.30), 0.40, 0.70);
      const peakAt = Math.min(detachAt - 0.08, onset + this.rand(0.08, 0.14));
      return {
        ownerId: cell.id,
        angle: (i / count) * TAU + this.rand(-0.20, 0.20),
        dist: 0.86,
        radius: 0,
        maxRadius: radius * this.rand(0.09, 0.16),
        growthSpeed: this.rand(0.9, 1.25),
        detached: false,
        alpha: 1,
        onset,
        detachAt,
        peakAt,
        retractAt: releases ? detachAt : clamp(peakAt + this.rand(0.12, 0.20), peakAt + 0.08, 0.74),
        releases,
        neck: 0,
        carriesFragment: releases && this.random() < 0.6,
        drift: this.rand(0.14, 0.28),
        x: cell.x,
        y: cell.y,
        previousX: cell.x,
        previousY: cell.y,
        vx: cell.vx,
        vy: cell.vy,
        independent: false,
        age: 0,
        lifetime: this.rand(2.0, 3.0),
      };
    });
    cell.lifecycleSource = source;
    this.counters.deaths++;
    if (source === 'user') {
      this.inputQuietRemaining = 1.5;
      this.selectedCellId = cell.id;
      this.selectedStatusPhase = null;
      this.emitStatus(cell.id, 'apoptosis', 'condensation', source, true);
    }
  }

  private chooseDivisionAxis(cell: LivingCell, radius: number): number {
    const daughterRadius = radius * DAUGHTER_RATIO;
    let bestAxis = this.rand(0, Math.PI);
    let bestClearance = Number.NEGATIVE_INFINITY;
    for (let sample = 0; sample < 12; sample++) {
      const axis = (sample / 12) * Math.PI + this.rand(-0.035, 0.035);
      let clearance = Number.POSITIVE_INFINITY;
      for (const side of [-1, 1]) {
        const x = cell.x + Math.cos(axis) * side * daughterRadius;
        const y = cell.y + Math.sin(axis) * side * daughterRadius;
        clearance = Math.min(
          clearance,
          x - daughterRadius,
          this.width - x - daughterRadius,
          y - daughterRadius,
          this.height - y - daughterRadius
        );
        for (const other of this.cells) {
          if (other === cell) continue;
          clearance = Math.min(
            clearance,
            Math.hypot(other.x - x, other.y - y) - daughterRadius - this.collisionRadius(other)
          );
        }
      }
      if (clearance > bestClearance) {
        bestClearance = clearance;
        bestAxis = axis;
      }
    }
    return ((bestAxis % Math.PI) + Math.PI) % Math.PI;
  }

  private buildMitosisPlan(
    parent: LivingCell,
    axis: number,
    radius: number,
    source: LifecycleSource
  ): MitosisPlan {
    const daughterRadius = radius * DAUGHTER_RATIO;
    const daughters = ([1, -1] as const).map((side) => {
      const daughter = this.createCell(
        parent.x + Math.cos(axis) * side * daughterRadius,
        parent.y + Math.sin(axis) * side * daughterRadius,
        false,
        parent.targetRadius,
        daughterRadius
      );
      daughter.state = 'postmitotic';
      daughter.stateElapsed = 0;
      daughter.postmitoticProgress = 0;
      daughter.birthRadius = daughterRadius;
      daughter.baseRadius = daughterRadius;
      daughter.radius = daughterRadius;
      daughter.previousRadius = daughterRadius;
      daughter.age = 0;
      daughter.matureElapsed = 0;
      daughter.life = 1;
      daughter.vx = parent.vx;
      daughter.vy = parent.vy;
      daughter.angle = parent.angle + this.rand(-0.04, 0.04);
      daughter.breathPhase = parent.breathPhase + side * 0.18;
      daughter.morphPhase = parent.morphPhase + side * 0.12;
      daughter.organelles = this.inheritOrganelles(parent, side);
      daughter.nucleusOffset = {
        x: clamp(parent.nucleusOffset.x + side * 0.015, -0.08, 0.08),
        y: parent.nucleusOffset.y * 0.75,
      };
      daughter.glowIntensity = 1.25;
      daughter.siblingAxis = axis;
      daughter.siblingSide = side;
      const recoil = clamp(radius * 0.55, 18, 34);
      daughter.recoveryRecoil = recoil;
      daughter.siblingRestDistance = daughterRadius * 2 + recoil * POSTMITOTIC_SECONDS;
      daughter.recoveryOffset = 0;
      daughter.recoveryBaseVelocity = { x: parent.vx, y: parent.vy };
      daughter.lineageId = parent.id;
      daughter.lifecycleSource = source;
      return daughter;
    }) as [LivingCell, LivingCell];
    daughters[0].siblingId = daughters[1].id;
    daughters[1].siblingId = daughters[0].id;
    return { axis, radius, daughterRadius, daughters, source };
  }

  private queueDivision(cell: LivingCell): void {
    if (cell.state === 'mitosis' || cell.state === 'apoptosis' || cell.state === 'postmitotic')
      return;
    cell.divisionQueued = false;
    cell.glowIntensity = clamp(Math.max(1.08, cell.glowIntensity), 1, 1.16);
    this.counters.clickRequests++;
    if (this.mode === 'lab' && this.labAction === 'apoptosis') this.triggerApoptosis(cell, 'user');
    else this.triggerMitosis(cell, true, 'user');
  }

  private resize = (): void => {
    if (!this.canvas || !this.ctx || typeof window === 'undefined') return;
    const oldWidth = this.width;
    const oldHeight = this.height;
    this.isHomepage = window.location.pathname === '/';
    this.coarse = window.matchMedia('(pointer: coarse)').matches;
    const dprCap = this.coarse ? (this.isHomepage ? 1 : 1.25) : 1.5;
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
    window.addEventListener('mouseout', this.onPointerOut, { passive: true });
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('blur', this.onWindowBlur, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('khc:theme-change', this.onThemeChange);
    document.addEventListener('khc:crt-change', this.onThemeChange);
    this.motionQuery.addEventListener('change', this.onMotionChange);
  }

  private interactiveTarget(target: EventTarget | null): boolean {
    return Boolean(
      (target as HTMLElement | null)?.closest(
        'a, button, input, textarea, select, summary, label, dialog, h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, pre, code, figure, figcaption, picture, img, video, audio, canvas, iframe, svg, table, thead, tbody, tr, th, td, details, header, footer, [contenteditable="true"], [role="button"], [role="menuitem"], [role="dialog"], [role="log"], [data-cell-interaction="off"], [data-cell-protected], [data-game-root], [data-terminal]'
      )
    );
  }

  private hitCell(x: number, y: number): LivingCell | null {
    for (let index = this.cells.length - 1; index >= 0; index--) {
      const cell = this.cells[index];
      if (cell.state === 'mitosis' || cell.state === 'postmitotic' || cell.state === 'apoptosis')
        continue;
      const points = this.sampleNormalContour(cell).map((point) => ({
        x: point.x + cell.x,
        y: point.y + cell.y,
      }));
      if (this.pointInContour(x, y, points) || this.distanceToContour(x, y, points) <= 5)
        return cell;
    }
    return null;
  }

  private clearHover(): void {
    this.hoveredCell = null;
  }

  private updateHover(event: PointerEvent): void {
    if (
      this.coarse ||
      this.reducedMotion ||
      this.mode === 'off' ||
      this.pointer.down ||
      (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') ||
      this.interactiveTarget(event.target)
    ) {
      this.clearHover();
      return;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : event.timeStamp;
    if (now - this.lastHoverTime < 50) return;
    this.lastHoverTime = now;
    let nearest: LivingCell | null = null;
    let nearestDistance = 26;
    for (let index = this.cells.length - 1; index >= 0; index--) {
      const cell = this.cells[index];
      if (
        (cell.state !== 'growing' && cell.state !== 'mature') ||
        cell.life <= 0.01 ||
        cell.isGrabbed
      )
        continue;
      if (
        Math.hypot(event.clientX - cell.x, event.clientY - cell.y) >
        this.collisionRadius(cell) + nearestDistance
      )
        continue;
      const contour = this.sampleNormalContour(cell).map((point) => ({
        x: point.x + cell.x,
        y: point.y + cell.y,
      }));
      const distance = this.pointInContour(event.clientX, event.clientY, contour)
        ? 0
        : this.distanceToContour(event.clientX, event.clientY, contour);
      if (distance <= nearestDistance) {
        nearest = cell;
        nearestDistance = distance;
      }
    }
    this.hoveredCell = nearest;
    if (nearest) this.deformAtHover(nearest, event.clientX, event.clientY, nearestDistance);
  }

  private pointInContour(x: number, y: number, points: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i];
      const b = points[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
        inside = !inside;
    }
    return inside;
  }

  private distanceToContour(x: number, y: number, points: Point[]): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < points.length; index++) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared ? clamp(((x - a.x) * dx + (y - a.y) * dy) / lengthSquared, 0, 1) : 0;
      nearest = Math.min(nearest, Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)));
    }
    return nearest;
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.clearHover();
    if (
      !this.attached ||
      this.mode === 'off' ||
      this.reducedMotion ||
      this.interactiveTarget(event.target)
    )
      return;
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const cell = this.hitCell(event.clientX, event.clientY);
    this.pointer = {
      x: event.clientX,
      y: event.clientY,
      down: true,
      type: event.pointerType || 'mouse',
      id: event.pointerId,
    };
    this.pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
    this.pointerSamples = [{ x: event.clientX, y: event.clientY, time: performance.now() }];
    this.pointerCandidate = cell;
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.attached) return;
    if (!this.pointer.down) {
      this.updateHover(event);
      return;
    }
    if (this.pointer.id >= 0 && event.pointerId !== this.pointer.id) return;
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    const sampleTime = performance.now();
    this.pointerSamples.push({ x: event.clientX, y: event.clientY, time: sampleTime });
    this.pointerSamples = this.pointerSamples.filter((sample) => sampleTime - sample.time <= 120);
    const distance = Math.hypot(
      event.clientX - this.pointerDown.x,
      event.clientY - this.pointerDown.y
    );
    if (this.pointer.type !== 'mouse') {
      if (distance > 10) this.pointerCandidate = null;
      return;
    }
    if (!this.grabbedCell && this.pointerCandidate && distance > 6) {
      this.grabbedCell = this.pointerCandidate;
      this.preGrabVelocity = { x: this.grabbedCell.vx, y: this.grabbedCell.vy };
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
    const threshold = this.pointer.type === 'mouse' ? 6 : 10;
    const durationLimit = this.pointer.type === 'mouse' ? 350 : 500;
    if (this.grabbedCell) {
      this.commitGrabbed(event.clientX, event.clientY);
      const first = this.pointerSamples[0];
      const last = this.pointerSamples[this.pointerSamples.length - 1];
      const elapsed = Math.max(0.016, ((last?.time ?? 0) - (first?.time ?? 0)) / 1000);
      const pointerVx = first && last ? (last.x - first.x) / elapsed : 0;
      const pointerVy = first && last ? (last.y - first.y) / elapsed : 0;
      const vx = this.preGrabVelocity.x * 0.75 + pointerVx * 0.25;
      const vy = this.preGrabVelocity.y * 0.75 + pointerVy * 0.25;
      const speed = Math.hypot(vx, vy);
      const scale = speed > 12 ? 12 / speed : 1;
      this.releaseGrabbed({ x: vx * scale, y: vy * scale });
    } else if (candidate && distance <= threshold && duration <= durationLimit) {
      this.queueDivision(candidate);
    } else if (!candidate && !this.grabbedCell && distance <= threshold && duration <= durationLimit) {
      this.spawnCellAt(event.clientX, event.clientY);
    }
    this.pointer.down = false;
    this.pointer.id = -1;
    this.pointerCandidate = null;
    this.pointerSamples = [];
  };

  private spawnCellAt(clientX: number, clientY: number): void {
    if (this.mode === 'off' || this.reducedMotion) return;
    const targetRadius = this.coarse ? this.rand(28, 48) : this.rand(36, 56);
    const birthRadius = Math.max(10, targetRadius * 0.48);
    const newCell = this.createCell(clientX, clientY, true, targetRadius, birthRadius);
    newCell.vx = this.rand(-16, 16);
    newCell.vy = this.rand(-16, 16);
    newCell.glowIntensity = 1.35;
    for (const v of newCell.vertices) {
      v.displacement = Math.sin(v.angle * 3) * 2.5;
      v.velocity = Math.cos(v.angle * 3) * 6;
    }
    this.cells.push(newCell);
    this.quietRemaining = Math.max(4, this.quietRemaining);
    this.counters.divisions++;
  }

  private onPointerCancel = (event: PointerEvent): void => {
    if (this.pointer.id >= 0 && event.pointerId !== this.pointer.id) return;
    this.cancelPointer(true);
  };
  private onPointerOut = (event: MouseEvent): void => {
    if (!event.relatedTarget) this.clearHover();
  };
  private onScroll = (): void => {
    this.scrollActivityRemaining = 0.65;
    this.clearHover();
  };
  private onWindowBlur = (): void => {
    this.cancelPointer(false);
    this.clearHover();
  };
  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearHover();
      this.stop();
    } else if (this.attached) this.start();
  };
  private onMotionChange = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches;
    if (event.matches) {
      this.stop();
      this.cancelPointer(false);
      this.clearHover();
      this.render(0, true);
    } else if (this.attached && !document.hidden) this.start();
  };
  private onThemeChange = (): void => {
    this.refreshPalette();
    if (!this.isRunning) this.render(0, this.reducedMotion);
  };

  private releaseGrabbed(velocity?: Point): void {
    if (!this.grabbedCell) return;
    this.grabbedCell.isGrabbed = false;
    this.grabbedCell.targetDragPos = undefined;
    this.grabbedCell.vx = velocity?.x ?? clamp(this.grabbedCell.vx, -12, 12);
    this.grabbedCell.vy = velocity?.y ?? clamp(this.grabbedCell.vy, -12, 12);
    this.grabbedCell = null;
  }

  private commitGrabbed(clientX: number, clientY: number): void {
    const cell = this.grabbedCell;
    if (!cell) return;
    const contour = this.collisionContour(cell);
    const left = this.supportFromContour(contour, -1, 0);
    const right = this.supportFromContour(contour, 1, 0);
    const top = this.supportFromContour(contour, 0, -1);
    const bottom = this.supportFromContour(contour, 0, 1);
    const x = clamp(clientX + cell.grabOffset.x, left, Math.max(left, this.width - right));
    const y = clamp(clientY + cell.grabOffset.y, top, Math.max(top, this.height - bottom));
    cell.x = x;
    cell.y = y;
    cell.previousX = x;
    cell.previousY = y;
    cell.targetDragPos = { x, y };
  }

  private cancelPointer(count: boolean): void {
    if (count && (this.pointer.down || this.pointerCandidate || this.grabbedCell))
      this.counters.pointerCancels++;
    if (this.grabbedCell) this.releaseGrabbed(this.preGrabVelocity);
    this.pointer.down = false;
    this.pointer.id = -1;
    this.pointerCandidate = null;
    this.pointer.x = -1000;
    this.pointer.y = -1000;
    this.pointerSamples = [];
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
    const delta = Math.min(0.1, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    if (!this.simParams.isPaused) {
      this.accumulator += delta * this.simParams.timeScale;
      let steps = 0;
      while (this.accumulator >= STEP && steps < MAX_STEPS) {
        this.update(STEP);
        this.accumulator -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS && this.accumulator >= STEP) this.accumulator = 0;
    }
    const renderInterval = this.currentRenderInterval();
    if (this.lastRenderTime === 0 || time - this.lastRenderTime >= renderInterval) {
      this.lastRenderTime = time;
      this.render(this.accumulator / STEP);
    }
  };

  private currentRenderInterval(): number {
    if (this.mode === 'lab') return 15;
    const baseInterval = this.isHomepage ? 50 : this.coarse ? 32 : 15;
    if (this.scrollActivityRemaining > 0) return Math.max(baseInterval, this.coarse ? 67 : 42);
    return baseInterval;
  }

  public start(): void {
    if (
      this.isRunning ||
      !this.attached ||
      !this.ctx ||
      this.mode === 'off' ||
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
    const timingStart = typeof performance !== 'undefined' ? performance.now() : 0;
    this.updateCount++;
    this.quietRemaining = Math.max(0, this.quietRemaining - dt);
    this.rebalanceCooldown = Math.max(0, this.rebalanceCooldown - dt);
    this.inputQuietRemaining = Math.max(0, this.inputQuietRemaining - dt);
    this.scrollActivityRemaining = Math.max(0, this.scrollActivityRemaining - dt);
    this.turnoverRemaining -= dt * this.simParams.apoptosisMultiplier;
    this.controllerElapsed += dt;
    this.adaptiveElapsed += dt;
    for (const cell of this.cells) cell.contactCount = 0;
    this.resolveCollisions(dt);
    for (let index = this.cells.length - 1; index >= 0; index--) {
      const cell = this.cells[index];
      this.updateMotion(cell, dt);
      if (this.updateLifecycle(cell, index, dt)) continue;
      this.updateMembrane(cell, dt);
    }
    this.updatePostmitoticPairs();
    this.updateApoptoticBodies(dt);
    if (!this.controllerFrozen && this.controllerElapsed >= 1) {
      this.controllerElapsed %= 1;
      this.updateHomeostasis();
    }
    if (this.adaptiveElapsed >= 2) {
      this.adaptiveElapsed %= 2;
      const renderP95 = percentile(this.renderTimings, 0.95);
      this.detailLevel =
        renderP95 > 5
          ? 'minimal'
          : renderP95 > 3 || this.coarse || this.isHomepage
            ? 'reduced'
            : 'full';
    }
    if (timingStart) this.recordTiming(this.updateTimings, performance.now() - timingStart);
  }

  private recordTiming(samples: number[], value: number): void {
    samples.push(value);
    if (samples.length > 240) samples.splice(0, samples.length - 240);
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
    for (let index = 0; index < cell.harmonicPhases.length; index++)
      cell.harmonicPhases[index] += cell.harmonicSpeeds[index] * dt;
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
      const apoptosisDamping =
        cell.state === 'apoptosis' ? lerp(0.65, 1.15, cell.apoptosisProgress ?? 0) : 0;
      const targetSpeed = cell.state === 'apoptosis' ? 0 : this.coarse ? 3.8 : 5.2;
      const heading = cell.angle + 0.45 * Math.sin(cell.morphPhase);
      const targetVx = Math.cos(heading) * targetSpeed;
      const targetVy = Math.sin(heading) * targetSpeed;
      const response =
        cell.state === 'postmitotic' ? 0 : 1 - Math.exp(-(0.2 + apoptosisDamping) * dt);
      cell.vx += (targetVx - cell.vx) * response;
      cell.vy += (targetVy - cell.vy) * response;
      const speed = Math.hypot(cell.vx, cell.vy);
      const speedCap = cell.state === 'postmitotic' ? 40 : 16;
      if (speed > speedCap) {
        cell.vx = (cell.vx / speed) * speedCap;
        cell.vy = (cell.vy / speed) * speedCap;
      }
    }
    if (!cell.isGrabbed && this.width > 0 && this.height > 0) {
      const contour = this.collisionContour(cell);
      const left = this.supportFromContour(contour, -1, 0);
      const right = this.supportFromContour(contour, 1, 0);
      const top = this.supportFromContour(contour, 0, -1);
      const bottom = this.supportFromContour(contour, 0, 1);
      if (cell.x - left < 0) {
        cell.x = left;
        if (cell.vx < 0) cell.vx = -cell.vx * 0.08;
      } else if (cell.x + right > this.width) {
        cell.x = this.width - right;
        if (cell.vx > 0) cell.vx = -cell.vx * 0.08;
      }
      if (cell.y - top < 0) {
        cell.y = top;
        if (cell.vy < 0) cell.vy = -cell.vy * 0.08;
      } else if (cell.y + bottom > this.height) {
        cell.y = this.height - bottom;
        if (cell.vy > 0) cell.vy = -cell.vy * 0.08;
      }
    }
  }

  private updateLifecycle(cell: LivingCell, index: number, dt: number): boolean {
    const breathing = 1 + 0.015 * Math.sin(cell.breathPhase);
    const growthSpeed = this.simParams.growthMultiplier;
    if (cell.state === 'growing') {
      cell.growthProgress = clamp(
        cell.growthProgress + (dt * growthSpeed) / cell.growthDuration,
        0,
        1
      );
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
      this.updateSelectedStatus(cell);
      cell.baseRadius = cell.divisionRadius ?? cell.baseRadius;
      cell.radius = cell.baseRadius;
      if (cell.mitosisProgress >= 1) {
        this.completeMitosis(cell, index);
        return true;
      }
      return false;
    }
    if (cell.state === 'postmitotic') {
      cell.postmitoticProgress = clamp(cell.stateElapsed / POSTMITOTIC_SECONDS, 0, 1);
      cell.baseRadius = cell.birthRadius;
      cell.radius = cell.birthRadius * breathing;
      cell.life = 1;
      if (cell.postmitoticProgress >= 1) {
        cell.state = cell.birthRadius < cell.targetRadius * 0.9995 ? 'growing' : 'mature';
        cell.stateElapsed = 0;
        cell.growthProgress = cell.state === 'growing' ? 0 : 1;
        cell.matureElapsed = 0;
        const lineageId = cell.lineageId;
        cell.postmitoticProgress = undefined;
        cell.siblingId = undefined;
        cell.siblingRestDistance = undefined;
        cell.siblingAxis = undefined;
        cell.siblingSide = undefined;
        cell.recoveryOffset = undefined;
        cell.recoveryRecoil = undefined;
        if (cell.recoveryBaseVelocity) {
          cell.vx = cell.recoveryBaseVelocity.x;
          cell.vy = cell.recoveryBaseVelocity.y;
        }
        cell.recoveryBaseVelocity = undefined;
        if (
          lineageId === this.selectedCellId &&
          !this.cells.some(
            (candidate) =>
              candidate !== cell &&
              candidate.lineageId === lineageId &&
              candidate.state === 'postmitotic'
          )
        )
          this.hideStatus();
      }
      return false;
    }
    cell.apoptosisProgress = clamp(cell.stateElapsed / APOPTOSIS_SECONDS, 0, 1);
    const progress = cell.apoptosisProgress;
    const startRadius = cell.apoptosisStartRadius ?? cell.baseRadius;
    cell.baseRadius = startRadius * (1 - 0.28 * windowed(progress, 0.02, 0.68));
    cell.radius = cell.baseRadius;
    cell.life = 1 - windowed(progress, 0.84, 1);
    this.updateBlebs(cell, progress, dt);
    this.updateSelectedStatus(cell);
    if (progress >= 1) {
      this.cells.splice(index, 1);
      this.quietRemaining = Math.max(4, this.quietRemaining);
      if (cell.id === this.selectedCellId) this.hideStatus();
      return true;
    }
    return false;
  }

  private completeMitosis(parent: LivingCell, index: number): void {
    const plan =
      parent.mitosisPlan ??
      this.buildMitosisPlan(
        parent,
        parent.mitosisAngle ?? 0,
        parent.divisionRadius ?? parent.baseRadius,
        parent.lifecycleSource ?? 'automatic'
      );
    const axis = plan.axis;
    const [first, second] = plan.daughters;
    const recoil = clamp(plan.radius * 0.55, 18, 34);
    for (const daughter of plan.daughters) {
      const side = daughter.siblingSide ?? 1;
      daughter.x = parent.x + Math.cos(axis) * side * plan.daughterRadius;
      daughter.y = parent.y + Math.sin(axis) * side * plan.daughterRadius;
      daughter.previousX = daughter.x;
      daughter.previousY = daughter.y;
      daughter.recoveryBaseVelocity = { x: parent.vx, y: parent.vy };
      daughter.vx = parent.vx + Math.cos(axis) * side * recoil;
      daughter.vy = parent.vy + Math.sin(axis) * side * recoil;
      daughter.glowIntensity = 1.35;
      for (const v of daughter.vertices) {
        const facingFactor = Math.cos(v.angle - axis) * side;
        v.displacement = -facingFactor * 3.5;
        v.velocity = facingFactor * 2.8;
      }
    }
    this.cells.splice(index, 1, first, second);
    this.quietRemaining = Math.max(4, this.quietRemaining);
    if (parent.id === this.selectedCellId)
      this.emitStatus(parent.id, 'postmitotic', 'recovery', plan.source, true);
  }

  private updatePostmitoticPairs(): void {
    const handled = new Set<string>();
    for (const first of this.cells) {
      if (first.state !== 'postmitotic' || !first.siblingId || handled.has(first.id)) continue;
      const second = this.cells.find(
        (candidate) => candidate.id === first.siblingId && candidate.state === 'postmitotic'
      );
      if (!second) continue;
      handled.add(first.id);
      handled.add(second.id);
      const progress = clamp(
        ((first.postmitoticProgress ?? 0) + (second.postmitoticProgress ?? 0)) / 2,
        0,
        1
      );
      const axis = first.siblingAxis ?? second.siblingAxis ?? 0;
      const ax = Math.cos(axis);
      const ay = Math.sin(axis);
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      const recoil = first.recoveryRecoil ?? second.recoveryRecoil ?? 20;
      const omega = Math.PI * 2.0;
      const gamma = 2.4;
      const bounce = 1 - Math.exp(-gamma * progress) * Math.cos(omega * progress);
      const maximumOffset = (recoil * POSTMITOTIC_SECONDS) / 2;
      const halfDistance =
        (first.birthRadius + second.birthRadius) / 2 + maximumOffset * bounce;
      const firstSide = first.siblingSide ?? 1;
      first.x = centerX + ax * firstSide * halfDistance;
      first.y = centerY + ay * firstSide * halfDistance;
      second.x = centerX - ax * firstSide * halfDistance;
      second.y = centerY - ay * firstSide * halfDistance;
      const firstContour = this.collisionContour(first);
      const secondContour = this.collisionContour(second);
      const minimumX = Math.min(
        first.x - this.supportFromContour(firstContour, -1, 0),
        second.x - this.supportFromContour(secondContour, -1, 0)
      );
      const maximumX = Math.max(
        first.x + this.supportFromContour(firstContour, 1, 0),
        second.x + this.supportFromContour(secondContour, 1, 0)
      );
      const minimumY = Math.min(
        first.y - this.supportFromContour(firstContour, 0, -1),
        second.y - this.supportFromContour(secondContour, 0, -1)
      );
      const maximumY = Math.max(
        first.y + this.supportFromContour(firstContour, 0, 1),
        second.y + this.supportFromContour(secondContour, 0, 1)
      );
      const correctionX =
        minimumX < 0 ? -minimumX : maximumX > this.width ? this.width - maximumX : 0;
      const correctionY =
        minimumY < 0 ? -minimumY : maximumY > this.height ? this.height - maximumY : 0;
      first.x += correctionX;
      first.y += correctionY;
      second.x += correctionX;
      second.y += correctionY;
      let baseVx = (first.vx + second.vx) / 2;
      let baseVy = (first.vy + second.vy) / 2;
      if ((correctionX > 0 && baseVx < 0) || (correctionX < 0 && baseVx > 0)) baseVx *= -0.08;
      if ((correctionY > 0 && baseVy < 0) || (correctionY < 0 && baseVy > 0)) baseVy *= -0.08;
      const separationSpeed =
        recoil *
        Math.exp(-gamma * progress) *
        (Math.cos(omega * progress) + 0.35 * Math.sin(omega * progress));
      first.vx = baseVx + ax * firstSide * separationSpeed;
      first.vy = baseVy + ay * firstSide * separationSpeed;
      second.vx = baseVx - ax * firstSide * separationSpeed;
      second.vy = baseVy - ay * firstSide * separationSpeed;
    }
  }

  private updateSelectedStatus(cell: LivingCell): void {
    if (cell.lifecycleSource !== 'user' || cell.id !== this.selectedCellId) return;
    if (cell.state === 'mitosis') {
      this.emitStatus(cell.id, 'mitosis', this.biologicalPhase(cell), 'user', true);
    } else if (cell.state === 'apoptosis') {
      this.emitStatus(cell.id, 'apoptosis', this.biologicalPhase(cell), 'user', true);
    }
  }

  private biologicalPhase(cell: LivingCell): string {
    if (cell.state === 'mitosis') {
      const progress = cell.mitosisProgress ?? 0;
      return progress >= 0.95
        ? 'abscission'
        : progress >= 0.82
          ? 'cytokinesis'
          : progress >= 0.68
            ? 'telophase'
            : progress >= 0.48
              ? 'anaphase'
              : progress >= 0.28
                ? 'metaphase'
                : progress >= 0.12
                  ? 'prometaphase'
                  : 'rounding';
    }
    if (cell.state === 'postmitotic') return 'recovery';
    if (cell.state === 'apoptosis') {
      const progress = cell.apoptosisProgress ?? 0;
      return progress >= 0.86
        ? 'clearance'
        : progress >= 0.68
          ? 'apoptotic-bodies'
          : progress >= 0.45
            ? 'fragmentation'
            : progress >= 0.2
              ? 'blebbing'
              : 'condensation';
    }
    return cell.state === 'growing' ? 'interphase-growth' : 'interphase';
  }

  private emitStatus(
    cellId: string,
    lifecycle: 'mitosis' | 'postmitotic' | 'apoptosis' | 'idle',
    phase: string,
    source: LifecycleSource,
    visible: boolean
  ): void {
    if (source !== 'user' || cellId !== this.selectedCellId) return;
    const key = `${visible}:${lifecycle}:${phase}`;
    if (key === this.selectedStatusPhase) return;
    this.selectedStatusPhase = key;
    this.dispatch('khc:cell-status', { visible, cellId, lifecycle, phase, source });
  }

  private hideStatus(): void {
    if (!this.selectedCellId) return;
    const cellId = this.selectedCellId;
    this.dispatch('khc:cell-status', {
      visible: false,
      cellId,
      lifecycle: 'idle',
      phase: 'complete',
      source: 'user',
    });
    this.selectedCellId = null;
    this.selectedStatusPhase = null;
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

  private updateBlebs(cell: LivingCell, progress: number, _dt: number): void {
    const attached: ApoptoticBleb[] = [];
    const coreRadius = cell.apoptosisStartRadius
      ? cell.apoptosisStartRadius * (1 - 0.28 * windowed(progress, 0.02, 0.68))
      : cell.radius;
    for (const bleb of cell.blebs ?? []) {
      const growth = windowed(progress, bleb.onset, bleb.peakAt);
      const retraction = bleb.releases ? 0 : windowed(progress, bleb.peakAt, bleb.retractAt);
      bleb.radius = bleb.maxRadius * growth * (1 - retraction);
      bleb.detached = bleb.releases && progress >= bleb.detachAt;
      bleb.neck = bleb.releases ? windowed(progress, bleb.detachAt - 0.14, bleb.detachAt) : 0;
      bleb.dist =
        0.86 +
        growth * 0.16 -
        retraction * 0.06 +
        (bleb.releases ? bleb.neck * 0.12 + windowed(progress, bleb.detachAt, 1) * bleb.drift : 0);
      bleb.alpha = 1;
      const distance = coreRadius * bleb.dist;
      bleb.previousX = bleb.x;
      bleb.previousY = bleb.y;
      bleb.x = cell.x + Math.cos(bleb.angle) * distance;
      bleb.y = cell.y + Math.sin(bleb.angle) * distance;
      if (bleb.detached && !bleb.independent) {
        bleb.independent = true;
        const outwardSpeed = 3.5 + bleb.drift * 14;
        bleb.vx = cell.vx + Math.cos(bleb.angle) * outwardSpeed;
        bleb.vy = cell.vy + Math.sin(bleb.angle) * outwardSpeed;
        bleb.alpha = 1;
        bleb.age = 0;
        this.apoptoticBodies.push(bleb);
      } else if (
        !bleb.independent &&
        (bleb.releases || progress < bleb.retractAt || bleb.radius > 0.1)
      )
        attached.push(bleb);
    }
    cell.blebs = attached;
  }

  private updateApoptoticBodies(dt: number): void {
    for (let index = this.apoptoticBodies.length - 1; index >= 0; index--) {
      const body = this.apoptoticBodies[index];
      body.previousX = body.x;
      body.previousY = body.y;
      body.age += dt;
      const damping = Math.exp(-0.8 * dt);
      body.vx *= damping;
      body.vy *= damping;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      const progress = clamp(body.age / body.lifetime, 0, 1);
      body.alpha = 1 - windowed(progress, 0.56, 1);
      body.radius = body.maxRadius * (1 - 0.38 * windowed(progress, 0.62, 1));
      if (progress >= 1) this.apoptoticBodies.splice(index, 1);
    }
    this.resolveApoptoticBodyContacts(dt);
  }

  private resolveApoptoticBodyContacts(dt: number): void {
    if (!this.apoptoticBodies.length) return;
    const contours = this.cells.map((cell) => this.collisionContour(cell));
    for (const body of this.apoptoticBodies) {
      for (let index = 0; index < this.cells.length; index++) {
        const cell = this.cells[index];
        if (cell.id === body.ownerId || cell.life <= 0.01) continue;
        const dx = body.x - cell.x;
        const dy = body.y - cell.y;
        const distance = Math.hypot(dx, dy);
        const nx = distance > 0.001 ? dx / distance : Math.cos(index * 1.7 + body.angle);
        const ny = distance > 0.001 ? dy / distance : Math.sin(index * 1.7 + body.angle);
        const minimum = this.supportFromContour(contours[index], nx, ny) + body.radius;
        const penetration = minimum - distance;
        if (penetration <= 0) continue;
        body.x += nx * penetration * 0.88;
        body.y += ny * penetration * 0.88;
        const relativeNormal = (body.vx - cell.vx) * nx + (body.vy - cell.vy) * ny;
        if (relativeNormal < 0) {
          const impulse = -(1.08 * relativeNormal);
          body.vx += nx * impulse;
          body.vy += ny * impulse;
          const cellShare = Math.min(0.018, body.radius ** 3 / Math.max(1, cell.radius ** 3));
          cell.vx -= nx * impulse * cellShare;
          cell.vy -= ny * impulse * cellShare;
        }
      }
    }
    for (let solver = 0; solver < 2; solver++) {
      for (let firstIndex = 0; firstIndex < this.apoptoticBodies.length; firstIndex++) {
        const first = this.apoptoticBodies[firstIndex];
        for (
          let secondIndex = firstIndex + 1;
          secondIndex < this.apoptoticBodies.length;
          secondIndex++
        ) {
          const second = this.apoptoticBodies[secondIndex];
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const distance = Math.hypot(dx, dy);
          const minimum = first.radius + second.radius;
          if (distance >= minimum) continue;
          const nx = distance > 0.001 ? dx / distance : Math.cos((firstIndex + 1) * 2.13);
          const ny = distance > 0.001 ? dy / distance : Math.sin((firstIndex + 1) * 2.13);
          const inverseFirst = 1 / Math.max(1, first.radius ** 3);
          const inverseSecond = 1 / Math.max(1, second.radius ** 3);
          const inverseSum = inverseFirst + inverseSecond;
          const penetration = minimum - distance;
          first.x -= nx * penetration * (inverseFirst / inverseSum) * 0.9;
          first.y -= ny * penetration * (inverseFirst / inverseSum) * 0.9;
          second.x += nx * penetration * (inverseSecond / inverseSum) * 0.9;
          second.y += ny * penetration * (inverseSecond / inverseSum) * 0.9;
          const relativeNormal = (second.vx - first.vx) * nx + (second.vy - first.vy) * ny;
          if (relativeNormal < 0) {
            const impulse = -(1.08 * relativeNormal) / inverseSum;
            first.vx -= nx * impulse * inverseFirst;
            first.vy -= ny * impulse * inverseFirst;
            second.vx += nx * impulse * inverseSecond;
            second.vy += ny * impulse * inverseSecond;
          }
        }
      }
    }
    for (const body of this.apoptoticBodies) this.confineApoptoticBody(body, dt);
  }

  private confineApoptoticBody(body: ApoptoticBleb, dt: number): void {
    const response = 1 - Math.exp(-42 * dt);
    if (body.x - body.radius < 0) {
      body.x += (body.radius - body.x) * response;
      if (body.vx < 0) body.vx *= -0.12;
    } else if (body.x + body.radius > this.width) {
      body.x -= (body.x + body.radius - this.width) * response;
      if (body.vx > 0) body.vx *= -0.12;
    }
    if (body.y - body.radius < 0) {
      body.y += (body.radius - body.y) * response;
      if (body.vy < 0) body.vy *= -0.12;
    } else if (body.y + body.radius > this.height) {
      body.y -= (body.y + body.radius - this.height) * response;
      if (body.vy > 0) body.vy *= -0.12;
    }
  }

  private updateMembrane(cell: LivingCell, dt: number): void {
    if (cell.state === 'mitosis' || cell.state === 'apoptosis') return;
    const damping = Math.exp(-8.5 * dt);
    const previousDisplacements = cell.vertices.map((vertex) => vertex.displacement);
    for (let index = 0; index < cell.vertices.length; index++) {
      const vertex = cell.vertices[index];
      const theta = vertex.angle;
      vertex.equilibriumOffset = this.morphologyOffset(
        theta,
        cell.radius,
        cell.harmonics,
        cell.harmonicPhases,
        cell.morphPhase
      );
      const previous =
        previousDisplacements[(index - 1 + cell.vertices.length) % cell.vertices.length];
      const next = previousDisplacements[(index + 1) % cell.vertices.length];
      const laplacian = previous - 2 * vertex.displacement + next;
      vertex.velocity +=
        ((vertex.equilibriumOffset - vertex.displacement) * 38 + laplacian * 16) * dt;
      vertex.velocity *= damping;
      vertex.displacement = clamp(
        vertex.displacement + vertex.velocity * dt,
        -cell.radius * (this.coarse ? 0.075 : 0.105),
        cell.radius * (this.coarse ? 0.075 : 0.105)
      );
    }
    const mean =
      cell.vertices.reduce((sum, vertex) => sum + vertex.displacement, 0) / cell.vertices.length;
    for (const vertex of cell.vertices) vertex.displacement -= mean;
  }

  private collisionRadius(cell: LivingCell): number {
    if (cell.state === 'mitosis') {
      const radius = cell.divisionRadius ?? cell.radius;
      const daughterRadius = radius * DAUGHTER_RATIO;
      const separation = daughterRadius * windowed(cell.mitosisProgress ?? 0, 0.14, 0.94);
      return (
        separation + lerp(radius, daughterRadius, windowed(cell.mitosisProgress ?? 0, 0.14, 0.82))
      );
    }
    return Math.max(
      4,
      cell.radius * (Math.max(Math.sqrt(cell.aspect), 1 / Math.sqrt(cell.aspect)) + 0.08)
    );
  }

  private supportFromContour(points: Point[], nx: number, ny: number): number {
    let support = 0;
    for (const point of points) support = Math.max(support, point.x * nx + point.y * ny);
    return Math.max(4, support);
  }

  private collisionContour(cell: LivingCell): Point[] {
    if (cell.state === 'mitosis') {
      const progress = cell.mitosisProgress ?? 0;
      const radius = cell.divisionRadius ?? cell.radius;
      const geometry = this.mitosisGeometry(progress, radius);
      const entry = cell.mitosisEntryContour ?? this.circlePoints(radius);
      const blend = windowed(progress, 0, 0.16);
      const cos = Math.cos(cell.mitosisAngle ?? 0);
      const sin = Math.sin(cell.mitosisAngle ?? 0);
      return geometry.points.map((point, index) => {
        const mixed = mixPoint(entry[index] ?? point, point, blend);
        return { x: mixed.x * cos - mixed.y * sin, y: mixed.x * sin + mixed.y * cos };
      });
    }
    if (cell.state === 'apoptosis') return this.circlePoints(Math.max(4, cell.radius));
    return this.sampleNormalContour(cell);
  }

  private resolveCollisions(dt: number): void {
    const correctionBeta = 1 - Math.exp(-55 * dt);
    const pairs = this.collisionPairs();
    // Contours are local-space shapes and stay valid while positional contact
    // corrections run. Cache one per update instead of rebuilding 72 samples
    // for every support query in every solver pass.
    const contours = this.cells.map((cell) => this.collisionContour(cell));
    for (let solver = 0; solver < 3; solver++) {
      for (const [i, j] of pairs) {
        const first = this.cells[i];
        const second = this.cells[j];
        if (
          first.state === 'postmitotic' &&
          second.state === 'postmitotic' &&
          first.lineageId &&
          first.lineageId === second.lineageId
        )
          continue;
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.hypot(dx, dy);
        const broadMinimum = this.collisionRadius(first) + this.collisionRadius(second);
        if (distance >= broadMinimum) continue;
        const nx = distance > 0.001 ? dx / distance : Math.cos((i + 1) * 2.1);
        const ny = distance > 0.001 ? dy / distance : Math.sin((i + 1) * 2.1);
        const minimum =
          this.supportFromContour(contours[i], nx, ny) +
          this.supportFromContour(contours[j], -nx, -ny);
        const penetration = minimum - distance;
        if (penetration <= 0) continue;
        const inverseFirst = first.isGrabbed ? 0 : 1 / Math.max(64, first.radius ** 3);
        const inverseSecond = second.isGrabbed ? 0 : 1 / Math.max(64, second.radius ** 3);
        const inverseSum = inverseFirst + inverseSecond;
        if (inverseSum <= 0) continue;
        const correction = Math.min(2.5, Math.max(0, penetration - 0.35) * correctionBeta);
        first.x -= nx * correction * (inverseFirst / inverseSum);
        first.y -= ny * correction * (inverseFirst / inverseSum);
        second.x += nx * correction * (inverseSecond / inverseSum);
        second.y += ny * correction * (inverseSecond / inverseSum);
        const relativeX = second.vx - first.vx;
        const relativeY = second.vy - first.vy;
        const relativeNormal = relativeX * nx + relativeY * ny;
        if (relativeNormal < 0) {
          const impulse = -(1.06 * relativeNormal) / inverseSum;
          first.vx -= nx * impulse * inverseFirst;
          first.vy -= ny * impulse * inverseFirst;
          second.vx += nx * impulse * inverseSecond;
          second.vy += ny * impulse * inverseSecond;
        }
        const tx = -ny;
        const ty = nx;
        const tangentSpeed = relativeX * tx + relativeY * ty;
        const tangentImpulse = (-tangentSpeed * 0.08) / inverseSum;
        first.vx -= tx * tangentImpulse * inverseFirst;
        first.vy -= ty * tangentImpulse * inverseFirst;
        second.vx += tx * tangentImpulse * inverseSecond;
        second.vy += ty * tangentImpulse * inverseSecond;
        if (solver === 0) {
          first.contactCount++;
          second.contactCount++;
          this.deformAtContact(first, nx, ny, penetration);
          this.deformAtContact(second, -nx, -ny, penetration);
        }
      }
    }
  }

  private collisionPairs(): Array<[number, number]> {
    if (this.cells.length < 2) return [];
    const maximumRadius = this.cells.reduce(
      (maximum, cell) => Math.max(maximum, this.collisionRadius(cell)),
      1
    );
    const cellSize = Math.max(32, maximumRadius * 2);
    const buckets = new Map<string, number[]>();
    const coordinates = this.cells.map((cell, index) => {
      const gx = Math.floor(cell.x / cellSize);
      const gy = Math.floor(cell.y / cellSize);
      const key = `${gx},${gy}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(index);
      buckets.set(key, bucket);
      return { gx, gy };
    });
    const seen = new Set<string>();
    const pairs: Array<[number, number]> = [];
    for (let first = 0; first < this.cells.length; first++) {
      const { gx, gy } = coordinates[first];
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (const second of buckets.get(`${gx + ox},${gy + oy}`) ?? []) {
            if (second <= first) continue;
            const key = `${first}:${second}`;
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push([first, second]);
          }
        }
      }
    }
    return pairs;
  }

  private deformAtContact(cell: LivingCell, nx: number, ny: number, penetration: number): void {
    if (cell.state === 'mitosis' || cell.state === 'apoptosis') return;
    const localAngle = (((Math.atan2(ny, nx) - cell.angle) % TAU) + TAU) % TAU;
    const center = Math.round((localAngle / TAU) * cell.vertices.length) % cell.vertices.length;
    const impulse = Math.min(18, penetration * 2.4);
    cell.vertices[center].velocity -= impulse;
    cell.vertices[(center - 1 + cell.vertices.length) % cell.vertices.length].velocity -=
      impulse * 0.45;
    cell.vertices[(center + 1) % cell.vertices.length].velocity -= impulse * 0.45;
    cell.vertices[
      (center + Math.floor(cell.vertices.length / 2)) % cell.vertices.length
    ].velocity += impulse * 0.28;
    cell.vertices[(center + 4) % cell.vertices.length].velocity += impulse * 0.12;
    cell.vertices[(center - 4 + cell.vertices.length) % cell.vertices.length].velocity +=
      impulse * 0.12;
  }

  private deformAtHover(cell: LivingCell, x: number, y: number, distance: number): void {
    const dx = x - cell.x;
    const dy = y - cell.y;
    if (Math.hypot(dx, dy) < 1) return;
    const localAngle = (((Math.atan2(dy, dx) - cell.angle) % TAU) + TAU) % TAU;
    const center = Math.round((localAngle / TAU) * cell.vertices.length) % cell.vertices.length;
    const impulse = 0.8 * (1 - clamp(distance / 26, 0, 1));
    cell.vertices[center].velocity += impulse;
    cell.vertices[(center - 1 + cell.vertices.length) % cell.vertices.length].velocity +=
      impulse * 0.28;
    cell.vertices[(center + 1) % cell.vertices.length].velocity += impulse * 0.28;
  }

  private projectedCount(): number {
    return this.cells.reduce((total, cell) => {
      if (cell.state === 'apoptosis') return total;
      return total + (cell.state === 'mitosis' ? 2 : 1);
    }, 0);
  }

  private updateHomeostasis(): void {
    this.pruneQueue();
    if (this.inputQuietRemaining > 0) return;
    const projected = this.projectedCount();
    const target =
      this.simParams.targetPopulation > 0
        ? this.simParams.targetPopulation
        : this.targetCount || this.baseCount || 6;
    if (projected > target) {
      const automaticDeaths = this.cells.filter(
        (cell) => cell.state === 'apoptosis' && cell.lifecycleSource === 'automatic'
      ).length;
      const maximumDeaths = this.coarse ? 1 : 2;
      if (this.rebalanceCooldown <= 0 && automaticDeaths < maximumDeaths) {
        const candidate = this.apoptosisCandidate(true);
        if (candidate) {
          this.triggerApoptosis(candidate, 'automatic');
          this.rebalanceCooldown = this.rebalanceDelay();
        }
      }
      return;
    }
    if (projected < target) {
      const automaticDivisionActive = this.cells.some(
        (cell) =>
          (cell.state === 'mitosis' || cell.state === 'postmitotic') &&
          cell.lifecycleSource === 'automatic'
      );
      if (automaticDivisionActive) return;
      if (this.rebalanceCooldown <= 0) {
        const candidate = this.divisionCandidate();
        if (candidate) {
          this.triggerMitosis(candidate, false, 'automatic');
          this.rebalanceCooldown = this.rebalanceDelay();
        }
      }
      return;
    }
    const activeLifecycle = this.cells.some(
      (cell) =>
        cell.state === 'mitosis' || cell.state === 'postmitotic' || cell.state === 'apoptosis'
    );
    if (this.quietRemaining > 0 || activeLifecycle) return;
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
        this.triggerApoptosis(candidate, 'automatic');
        this.rebalanceCooldown = this.rebalanceDelay();
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

  private apoptosisCandidate(allowGrowingFallback = false): LivingCell | null {
    const protectedCell = (cell: LivingCell) =>
      cell.id === this.selectedCellId ||
      Boolean(this.selectedCellId && cell.lineageId === this.selectedCellId);
    const mature = this.peripheral(
      this.cells.filter(
        (cell) =>
          cell.state === 'mature' &&
          cell.matureElapsed >= MATURE_DWELL &&
          !cell.isGrabbed &&
          !cell.divisionQueued &&
          !protectedCell(cell)
      )
    ).sort((a, b) => b.age - a.age);
    if (mature.length || !allowGrowingFallback) return mature[0] ?? null;
    // A wave of explicit divisions can leave every surplus daughter growing.
    // Once recovery has ended, the oldest peripheral daughter is the least
    // surprising compensating loss and prevents the controller from stalling.
    return (
      this.peripheral(
        this.cells.filter(
          (cell) =>
            cell.state === 'growing' &&
            !cell.siblingId &&
            !cell.isGrabbed &&
            !cell.divisionQueued &&
            !protectedCell(cell)
        )
      ).sort((a, b) => b.age - a.age)[0] ?? null
    );
  }

  private turnoverDelay(): number {
    return this.coarse ? this.rand(45, 70) : this.rand(30, 50);
  }

  private rebalanceDelay(): number {
    return this.coarse ? 5 : 3.5;
  }

  private effectiveDetailLevel(): DetailLevel {
    const rank: Record<DetailLevel, number> = { full: 0, reduced: 1, minimal: 2 };
    const fromRank = (value: number): DetailLevel =>
      value >= 2 ? 'minimal' : value >= 1 ? 'reduced' : 'full';
    let effectiveRank = rank[this.detailLevel];
    if (this.scrollActivityRemaining > 0)
      effectiveRank = Math.max(effectiveRank, this.coarse || this.isHomepage ? 2 : 1);
    const profileLimit = this.coarse ? 5 : this.isHomepage ? 7 : 9;
    const paintedPopulation = this.cells.length + Math.ceil(this.apoptoticBodies.length * 0.5);
    if (paintedPopulation > profileLimit) effectiveRank = Math.max(effectiveRank, 1);
    if (paintedPopulation > profileLimit + (this.coarse ? 2 : 3)) effectiveRank = 2;
    return fromRank(effectiveRank);
  }

  private render(interpolation = 0, reducedFrame = false): void {
    if (!this.ctx || !this.canvas) return;
    if (this.mode === 'off') {
      this.clearCanvas();
      return;
    }
    const timingStart = typeof performance !== 'undefined' ? performance.now() : 0;
    this.renderCount++;
    this.ctx.clearRect(0, 0, this.width, this.height);
    for (const cell of this.cells) {
      if (reducedFrame) this.renderReducedCell(cell);
      else this.renderCell(cell, interpolation);
    }
    if (!reducedFrame)
      for (const body of this.apoptoticBodies) this.renderApoptoticBody(body, interpolation);
    if (timingStart) this.recordTiming(this.renderTimings, performance.now() - timingStart);
  }

  private renderApoptoticBody(body: ApoptoticBleb, interpolation: number): void {
    if (!this.ctx || body.alpha <= 0.002 || body.radius <= 0.1) return;
    const x = lerp(body.previousX, body.x, interpolation);
    const y = lerp(body.previousY, body.y, interpolation);
    this.ctx.save();
    this.ctx.translate(x, y);
    this.path(this.circlePoints(body.radius));
    this.fillStroke(0.98, body.alpha);
    if (body.carriesFragment) {
      this.ctx.beginPath();
      this.ctx.arc(0, 0, Math.max(0.65, body.radius * 0.24), 0, TAU);
      this.ctx.fillStyle = `rgba(${this.palette.ink}, ${0.04 * body.alpha * this.visualScale})`;
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  private renderReducedCell(cell: LivingCell): void {
    if (!this.ctx) return;
    const radius =
      cell.state === 'apoptosis'
        ? (cell.apoptosisStartRadius ?? cell.targetRadius)
        : cell.targetRadius;
    this.ctx.save();
    this.ctx.translate(cell.x, cell.y);
    this.path(this.sampleNormalContour(cell, 0, radius));
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
    this.fillStroke(
      cell.glowIntensity + (cell === this.hoveredCell ? 0.025 : 0),
      cell.life,
      cell.isGrabbed,
      cell === this.hoveredCell
    );
    this.ctx.clip();
    this.renderInterior(cell, radius, cell.life, true, this.recoveryMorphology(cell));
    this.ctx.restore();
  }

  private effectiveAlpha(opacity = 1): number {
    const modeAlpha =
      this.mode === 'ambient' || this.mode === 'calm'
        ? 0.8
        : (this.simParams.visualAlpha ?? 1.0);
    return BASE_ALPHA * modeAlpha * this.visualScale * opacity;
  }

  private renderInterior(
    cell: LivingCell,
    radius: number,
    opacity = 1,
    showNucleus = true,
    recovery = 1
  ): void {
    if (!this.ctx) return;
    const detailLevel = this.effectiveDetailLevel();
    const { accent, ink, glow, dark } = this.palette;
    const alpha = this.effectiveAlpha(opacity);
    const scale = radius / Math.max(1, cell.targetRadius);
    const nx = cell.nucleusOffset.x * radius;
    const ny = cell.nucleusOffset.y * radius;
    const nr = radius * cell.nucleusRatio * lerp(0.72, 1, recovery);
    if (showNucleus) {
      const nucleusRecovery = lerp(0.56, 1, recovery);
      const nucleusAspect = lerp(
        1,
        clamp(1 + (cell.aspect - 1) * 0.22, 0.94, 1.06),
        lerp(0.45, 1, recovery)
      );
      const nucleusA = nr * Math.sqrt(nucleusAspect);
      const nucleusB = nr / Math.sqrt(nucleusAspect);

      // Outer nuclear envelope with soft translucent nucleoplasm
      this.ctx.beginPath();
      this.ctx.ellipse(nx, ny, nucleusA, nucleusB, cell.nucleusAngle, 0, TAU);
      this.ctx.fillStyle = `rgba(${accent}, ${0.078 * alpha * nucleusRecovery})`;
      this.ctx.fill();
      this.ctx.lineWidth = 0.95;
      this.ctx.strokeStyle = `rgba(${dark ? glow : ink}, ${0.078 * alpha * nucleusRecovery})`;
      this.ctx.stroke();

      // Inner dense nucleolus
      this.ctx.beginPath();
      this.ctx.arc(
        nx + Math.cos(cell.nucleusAngle) * nr * 0.14,
        ny + Math.sin(cell.nucleusAngle) * nr * 0.14,
        nr * 0.36,
        0,
        TAU
      );
      this.ctx.fillStyle = `rgba(${ink}, ${0.098 * alpha * nucleusRecovery})`;
      this.ctx.fill();
    }
    // Subcellular decoration
    if (
      detailLevel === 'minimal' ||
      (this.isHomepage && this.coarse) ||
      (this.coarse && radius < 34)
    )
      return;

    for (const org of cell.organelles) {
      const recoveryOpacity =
        org.type === 'mitochondria'
          ? lerp(0.36, 1, recovery)
          : org.type === 'centrosome'
            ? lerp(0.68, 1, recovery)
            : org.type === 'golgi'
              ? windowed(recovery, 0.06, 0.82)
              : windowed(recovery, 0.12, 0.9);
      if (recoveryOpacity <= 0.002) continue;
      this.ctx.save();
      this.ctx.globalAlpha *= recoveryOpacity;
      if (org.type === 'mitochondria') {
        const ox = Math.cos(org.angle + cell.angle) * radius * org.dist;
        const oy = Math.sin(org.angle + cell.angle) * radius * org.dist;
        this.ctx.save();
        this.ctx.translate(ox, oy);
        this.ctx.rotate(org.rotAngle + cell.angle);
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, (org.length * scale) / 2, (org.width * scale) / 2, 0, 0, TAU);
        this.ctx.fillStyle = `rgba(${accent}, ${0.075 * alpha})`;
        this.ctx.fill();
        this.ctx.lineWidth = 0.85;
        this.ctx.strokeStyle = `rgba(${dark ? glow : ink}, ${0.088 * alpha})`;
        this.ctx.stroke();
        if (detailLevel === 'full') {
          this.ctx.lineWidth = 0.65;
          this.ctx.strokeStyle = `rgba(${ink}, ${0.068 * alpha})`;
          for (let crista = 1; crista <= org.cristaeCount; crista++) {
            const cx =
              -org.length * scale * 0.32 +
              (crista / (org.cristaeCount + 1)) * org.length * scale * 0.64;
            this.ctx.beginPath();
            this.ctx.moveTo(cx, -org.width * scale * 0.26);
            this.ctx.quadraticCurveTo(
              cx + org.width * scale * 0.12,
              0,
              cx,
              org.width * scale * 0.26
            );
            this.ctx.stroke();
          }
        }
        this.ctx.restore();
      } else if (org.type === 'golgi') {
        const ox = Math.cos(org.angle + cell.angle) * radius * org.dist;
        const oy = Math.sin(org.angle + cell.angle) * radius * org.dist;
        this.ctx.save();
        this.ctx.translate(ox, oy);
        this.ctx.rotate(org.angle + cell.angle);
        this.ctx.lineWidth = 0.95;
        this.ctx.strokeStyle = `rgba(${accent}, ${0.085 * alpha})`;
        for (let layer = 0; layer < org.layers; layer++) {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, radius * (0.045 + layer * 0.028), -org.arcSpan / 2, org.arcSpan / 2);
          this.ctx.stroke();
        }
        if (detailLevel === 'full') {
          for (const vesicle of org.vesicles) {
            const angle = vesicle.angle;
            const distance = radius * (0.095 + vesicle.dist);
            this.ctx.beginPath();
            this.ctx.arc(
              Math.cos(angle) * distance,
              Math.sin(angle) * distance,
              vesicle.size * scale,
              0,
              TAU
            );
            this.ctx.fillStyle = `rgba(${accent}, ${0.068 * alpha})`;
            this.ctx.fill();
            this.ctx.lineWidth = 0.55;
            this.ctx.strokeStyle = `rgba(${dark ? glow : ink}, ${0.078 * alpha})`;
            this.ctx.stroke();
          }
        }
        this.ctx.restore();
      } else if (org.type === 'er') {
        this.ctx.save();
        this.ctx.translate(nx, ny);
        this.ctx.lineWidth = 0.85;
        this.ctx.strokeStyle = `rgba(${accent}, ${0.058 * alpha})`;
        for (let layer = 0; layer < org.layers; layer++) {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, nr * (1.14 + layer * 0.15), org.arcStart, org.arcStart + org.arcEnd);
          this.ctx.stroke();
        }
        if (detailLevel === 'full') {
          this.ctx.fillStyle = `rgba(${ink}, ${0.075 * alpha})`;
          for (const ribosome of org.ribosomes) {
            const angle = org.arcStart + ribosome.angle * org.arcEnd;
            const rr = nr * (1.13 + ribosome.rOffset * 0.32);
            this.ctx.beginPath();
            this.ctx.arc(Math.cos(angle) * rr, Math.sin(angle) * rr, 0.7, 0, TAU);
            this.ctx.fill();
          }
        }
        this.ctx.restore();
      } else {
        const ox = Math.cos(org.angle + cell.angle) * radius * org.dist;
        const oy = Math.sin(org.angle + cell.angle) * radius * org.dist;
        const length = Math.max(1.4, radius * 0.038);
        this.ctx.beginPath();
        this.ctx.moveTo(ox - length, oy);
        this.ctx.lineTo(ox + length, oy);
        this.ctx.moveTo(ox, oy - length);
        this.ctx.lineTo(ox, oy + length);
        this.ctx.lineWidth = 0.95;
        this.ctx.strokeStyle = `rgba(${dark ? glow : ink}, ${0.088 * alpha})`;
        this.ctx.stroke();
      }
      this.ctx.restore();
    }
  }

  private renderMitosis(cell: LivingCell, x: number, y: number): void {
    if (!this.ctx) return;
    const progress = cell.mitosisProgress ?? 0;
    const radius = cell.divisionRadius ?? cell.baseRadius;
    const axis = cell.mitosisAngle ?? 0;
    const daughterRadius = radius * DAUGHTER_RATIO;
    const geometry = this.mitosisGeometry(progress, radius);
    const { waist } = geometry;
    const analytic = geometry.points;
    const entry = cell.mitosisEntryContour ?? this.circlePoints(radius);
    const roundingProgress = smootherstep(clamp(progress / 0.28, 0, 1));
    const points = analytic.map((point, index) =>
      mixPoint(entry[index] ?? point, point, roundingProgress)
    );
    const alpha = this.effectiveAlpha(cell.life);
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

    const count = 6;
    const spacing = clamp(radius * 0.088, 1.6, 4.2);
    const length = clamp(radius * 0.13, 2.2, 5.8);
    const width = clamp(radius * 0.034, 0.8, 1.5);
    const prophase = windowed(progress, 0.02, 0.12) * (1 - windowed(progress, 0.31, 0.38));
    const metaphase = windowed(progress, 0.22, 0.32) * (1 - windowed(progress, 0.46, 0.51));
    const anaphase = windowed(progress, 0.44, 0.5) * (1 - windowed(progress, 0.68, 0.76));
    const separation = radius * 0.48 * windowed(progress, 0.46, 0.64);
    for (let index = 0; index < count; index++) {
      const cy = (index - 2.5) * spacing;
      if (prophase > 0.002) {
        const cx = Math.sin(index * 1.9 + 0.4) * radius * 0.06 * (1 - windowed(progress, 0.08, 0.3));
        this.chromosomeX(cx, cy, length, width, prophase * alpha);
      }
      if (metaphase > 0.002) {
        const gap = width * 1.1;
        this.ctx.lineWidth = width;
        this.ctx.strokeStyle = `rgba(${accent}, ${0.18 * metaphase * alpha})`;
        this.ctx.beginPath();
        this.ctx.moveTo(-gap, cy - length / 2);
        this.ctx.lineTo(-gap, cy + length / 2);
        this.ctx.moveTo(gap, cy - length / 2);
        this.ctx.lineTo(gap, cy + length / 2);
        this.ctx.stroke();
        this.ctx.strokeStyle = `rgba(${glow}, ${0.045 * metaphase * alpha})`;
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
          this.ctx.strokeStyle = `rgba(${accent}, ${0.18 * anaphase * alpha})`;
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
    if (progress >= 0.94) {
      const sparkAlpha = Math.sin(((progress - 0.94) / 0.06) * Math.PI);
      this.ctx.beginPath();
      this.ctx.arc(0, 0, Math.max(1.8, radius * 0.05), 0, TAU);
      this.ctx.fillStyle = `rgba(${glow}, ${0.45 * sparkAlpha * alpha})`;
      this.ctx.fill();
      this.ctx.strokeStyle = `rgba(${accent}, ${0.65 * sparkAlpha * alpha})`;
      this.ctx.lineWidth = 0.8;
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private chromosomeX(x: number, y: number, length: number, width: number, alpha: number): void {
    if (!this.ctx) return;
    this.ctx.lineWidth = width;
    this.ctx.strokeStyle = `rgba(${this.palette.accent}, ${0.18 * alpha})`;
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
    const coreRadius = startRadius * (1 - 0.28 * windowed(progress, 0.02, 0.68));
    const entry = cell.apoptosisEntryContour ?? this.circlePoints(startRadius);
    const blend = windowed(progress, 0, 0.16);

    // Dynamic zeiosis surface ripples during active blebbing (0.14 to 0.70)
    const zeiosis = windowed(progress, 0.14, 0.3) * (1 - windowed(progress, 0.65, 0.82));
    const points = Array.from({ length: CONTOUR_SEGMENTS }, (_, index) => {
      const phi = (index / CONTOUR_SEGMENTS) * TAU;
      const ripple = zeiosis * 0.042 * Math.sin(phi * 5 + progress * 28);
      const r = coreRadius * (1 + ripple);
      const base = { x: Math.cos(phi) * r, y: Math.sin(phi) * r };
      return mixPoint(entry[index] ?? base, base, blend);
    });

    const alpha = this.effectiveAlpha(cell.life);
    const { accent, ink, glow, dark } = this.palette;
    this.ctx.save();
    this.ctx.translate(x, y);
    this.path(points);
    this.fillStroke(1.02 + 0.08 * zeiosis, cell.life);

    // Organelle/cytoplasmic clearance
    const oldInterior = 1 - windowed(progress, 0.12, 0.48);
    if (oldInterior > 0.002) {
      this.ctx.save();
      this.ctx.clip();
      this.renderInterior(cell, coreRadius, oldInterior, false);
      this.ctx.restore();
    }

    // Pyknosis (0.02 to 0.35): nuclear chromatin condenses into a hyper-dense, dark core
    const pyknosis = windowed(progress, 0.02, 0.22);
    const fragmentFade = windowed(progress, 0.38, 0.62);
    if (fragmentFade < 0.99) {
      this.ctx.beginPath();
      this.ctx.arc(0, 0, startRadius * lerp(0.24, 0.11, pyknosis), 0, TAU);
      this.ctx.fillStyle = `rgba(${ink}, ${(0.08 + 0.06 * pyknosis) * (1 - fragmentFade) * alpha})`;
      this.ctx.fill();
    }

    // Karyorrhexis (0.38 to 0.75): dense chromatin splits into distinct fragments migrating into blebs
    const fragmentation = windowed(progress, 0.38, 0.68);
    if (fragmentation > 0.01 && fragmentFade > 0.05) {
      const fragCount = cell.apoptosisFragmentAngles?.length ?? 4;
      for (let index = 0; index < fragCount; index++) {
        const angle = cell.apoptosisFragmentAngles?.[index] ?? (index / fragCount) * TAU;
        const distance = startRadius * 0.28 * fragmentation;
        this.ctx.beginPath();
        this.ctx.arc(
          Math.cos(angle) * distance,
          Math.sin(angle) * distance,
          startRadius * 0.065 * fragmentation * (1 - windowed(progress, 0.75, 0.92)),
          0,
          TAU
        );
        this.ctx.fillStyle = `rgba(${ink}, ${0.075 * fragmentation * alpha})`;
        this.ctx.fill();
      }
    }

    // Dynamic blebs with narrowing necks and vesicular chromatin cargo
    for (const bleb of cell.blebs ?? []) {
      if (bleb.radius <= 0.1 || bleb.alpha <= 0.002) continue;
      const distance = coreRadius * bleb.dist;
      const bx = Math.cos(bleb.angle) * distance;
      const by = Math.sin(bleb.angle) * distance;
      const ba = alpha * bleb.alpha;
      if (bleb.releases && !bleb.detached) {
        const ux = Math.cos(bleb.angle);
        const uy = Math.sin(bleb.angle);
        const cortex = coreRadius * 0.92;
        const neckEnd = Math.max(cortex, distance - bleb.radius * 0.72);
        this.ctx.beginPath();
        this.ctx.moveTo(ux * cortex, uy * cortex);
        this.ctx.lineTo(ux * neckEnd, uy * neckEnd);
        this.ctx.lineCap = 'round';
        this.ctx.lineWidth = Math.max(0.45, bleb.radius * lerp(0.58, 0.08, bleb.neck));
        this.ctx.strokeStyle = `rgba(${dark ? glow : ink}, ${0.065 * ba})`;
        this.ctx.stroke();
      }
      this.ctx.beginPath();
      this.ctx.arc(bx, by, bleb.radius, 0, TAU);
      this.ctx.fillStyle = `rgba(${accent}, ${0.048 * ba})`;
      this.ctx.fill();
      this.ctx.strokeStyle = `rgba(${dark ? glow : ink}, ${0.068 * ba})`;
      this.ctx.stroke();
      if (bleb.detached && bleb.carriesFragment) {
        this.ctx.beginPath();
        this.ctx.arc(bx, by, Math.max(0.7, bleb.radius * 0.28), 0, TAU);
        this.ctx.fillStyle = `rgba(${ink}, ${0.065 * ba})`;
        this.ctx.fill();
      }
    }
    this.ctx.restore();
  }

  private daughterSeveredRadius(phi: number, radius: number, side: number): number {
    const innerFactor = Math.max(0, -Math.cos(phi) * side);
    return radius * (1 - 0.26 * innerFactor * innerFactor);
  }

  private sampleNormalContour(cell: LivingCell, localAxis = 0, radiusOverride?: number): Point[] {
    const radius = radiusOverride ?? cell.radius;
    const isPostmitotic = cell.state === 'postmitotic';
    const recovery = isPostmitotic ? smootherstep(cell.postmitoticProgress ?? 0) : 1;
    const aspect = isPostmitotic ? lerp(1, cell.aspect, recovery) : cell.aspect;
    const a = radius * Math.sqrt(aspect);
    const b = radius / Math.sqrt(aspect);
    const displacementScale = radius / Math.max(1, cell.radius);
    const side = cell.siblingSide ?? 1;
    const siblingAxis = cell.siblingAxis ?? cell.angle;

    const raw = Array.from({ length: CONTOUR_SEGMENTS }, (_, index) => {
      const phi = (index / CONTOUR_SEGMENTS) * TAU;
      let theta = (phi + localAxis - cell.angle) % TAU;
      if (theta < 0) theta += TAU;
      const position = (theta / TAU) * VERTEX_COUNT;
      const ellipseRadius =
        (a * b) / Math.sqrt((b * Math.cos(theta)) ** 2 + (a * Math.sin(theta)) ** 2);
      const displacement =
        this.splineDisplacement(cell.vertices, position) * displacementScale;
      let targetR = Math.max(4, ellipseRadius + displacement * recovery);

      if (isPostmitotic && recovery < 0.999) {
        let severancePhi = (phi + localAxis - siblingAxis) % TAU;
        if (severancePhi < 0) severancePhi += TAU;
        const severedR = this.daughterSeveredRadius(severancePhi, radius, side);
        targetR = lerp(severedR, targetR, recovery);
      }

      return { x: Math.cos(phi) * targetR, y: Math.sin(phi) * targetR };
    });
    const area = polygonArea(raw);
    const areaScale = area > 0 ? Math.sqrt((Math.PI * radius * radius) / area) : 1;
    return raw.map((point) => ({ x: point.x * areaScale, y: point.y * areaScale }));
  }

  private recoveryMorphology(cell: LivingCell): number {
    return cell.state === 'postmitotic' ? smootherstep(cell.postmitoticProgress ?? 0) : 1;
  }

  private splineDisplacement(vertices: VertexSpring[], position: number): number {
    const base = Math.floor(position);
    const t = position - base;
    const count = vertices.length;
    const p0 = vertices[(base - 1 + count) % count].displacement;
    const p1 = vertices[base % count].displacement;
    const p2 = vertices[(base + 1) % count].displacement;
    const p3 = vertices[(base + 2) % count].displacement;
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
    );
  }

  private circlePoints(radius: number): Point[] {
    return Array.from({ length: CONTOUR_SEGMENTS }, (_, index) => {
      const theta = (index / CONTOUR_SEGMENTS) * TAU;
      return { x: Math.cos(theta) * radius, y: Math.sin(theta) * radius };
    });
  }

  private mitosisGeometry(
    progress: number,
    radius: number
  ): {
    points: Point[];
    separation: number;
    lobe: number;
    waist: number;
  } {
    const daughterRadius = radius * DAUGHTER_RATIO;
    const separation = daughterRadius * windowed(progress, 0.14, 0.98);
    const lobe = lerp(radius, daughterRadius, windowed(progress, 0.12, 0.8));
    const waist = lobe * (1 - windowed(progress, 0.5, 0.985));
    return {
      points: this.dualLobePoints(separation, lobe, waist),
      separation,
      lobe,
      waist,
    };
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

  private fillStroke(brightness: number, opacity: number, grabbed = false, hovered = false): void {
    if (!this.ctx) return;
    const { accent, ink, glow, dark } = this.palette;
    const level = clamp(brightness, 0.8, 1.25);
    const isLab = this.mode === 'lab';
    const alpha = this.effectiveAlpha(opacity);
    const fillBase = isLab || this.simParams.darkContrast ? 0.065 : 0.045;
    this.ctx.fillStyle = `rgba(${accent}, ${fillBase * level * alpha})`;
    this.ctx.fill();
    this.ctx.lineWidth = grabbed ? 1.6 : hovered ? 1.35 : isLab ? 1.28 : 1.15;
    const strokeBase = isLab || this.simParams.darkContrast
      ? (grabbed ? 0.16 : hovered ? 0.13 : 0.105)
      : (grabbed ? 0.12 : hovered ? 0.092 : 0.082);
    this.ctx.strokeStyle = `rgba(${dark ? glow : ink}, ${strokeBase * level * alpha})`;
    this.ctx.stroke();
  }

  private installDebug(): void {
    if (typeof window === 'undefined') return;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    if (!local || new URLSearchParams(window.location.search).get('cell-audit') !== '1') return;
    window.__khcCellsDebug = {
      snapshot: () => this.debugSnapshot(),
      setCellState: (id, state, progress) => this.debugSetState(id, state, progress),
      setControllerFrozen: (frozen) => {
        this.controllerFrozen = Boolean(frozen);
      },
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
        (cell) =>
          cell.state === 'mitosis' || cell.state === 'postmitotic' || cell.state === 'apoptosis'
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
      mode: this.mode,
      labAction: this.labAction,
      selectedCellId: this.selectedCellId,
      bodyCount: this.apoptoticBodies.length,
      controllerFrozen: this.controllerFrozen,
      detailLevel: this.effectiveDetailLevel(),
      timings: {
        updateP50: percentile(this.updateTimings, 0.5),
        updateP95: percentile(this.updateTimings, 0.95),
        updateMax: this.updateTimings.length ? Math.max(...this.updateTimings) : 0,
        renderP50: percentile(this.renderTimings, 0.5),
        renderP95: percentile(this.renderTimings, 0.95),
        renderMax: this.renderTimings.length ? Math.max(...this.renderTimings) : 0,
      },
      cells: this.cells.map((cell) => {
        const contour = this.collisionContour(cell);
        return {
          id: cell.id,
          x: cell.x,
          y: cell.y,
          radius: cell.radius,
          targetRadius: cell.targetRadius,
          state: cell.state,
          progress:
            cell.state === 'mitosis'
              ? (cell.mitosisProgress ?? 0)
              : cell.state === 'postmitotic'
                ? (cell.postmitoticProgress ?? 0)
                : cell.state === 'apoptosis'
                  ? (cell.apoptosisProgress ?? 0)
                  : cell.state === 'growing'
                    ? cell.growthProgress
                    : 1,
          isGrabbed: cell.isGrabbed,
          divisionQueued: cell.divisionQueued,
          phase: this.biologicalPhase(cell),
          aspect: cell.aspect,
          contourArea: polygonArea(contour),
          targetArea: Math.PI * cell.radius * cell.radius,
          organelleCount: cell.organelles.length,
          organelleTypes: [...new Set(cell.organelles.map((organelle) => organelle.type))],
          contactCount: cell.contactCount,
          siblingId: cell.siblingId,
          apoptoticBodyCount:
            (cell.blebs?.length ?? 0) +
            this.apoptoticBodies.filter((body) => body.ownerId === cell.id).length,
        };
      }),
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
    if (cell.state === 'mitosis' || cell.state === 'postmitotic' || cell.state === 'apoptosis') {
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
      cell.mitosisPlan = undefined;
      cell.postmitoticProgress = undefined;
      cell.siblingId = undefined;
      cell.siblingRestDistance = undefined;
      cell.siblingAxis = undefined;
      cell.siblingSide = undefined;
      cell.recoveryOffset = undefined;
      cell.recoveryRecoil = undefined;
      cell.recoveryBaseVelocity = undefined;
      cell.apoptosisProgress = undefined;
      cell.apoptosisStartRadius = undefined;
      cell.apoptosisEntryContour = undefined;
      cell.apoptosisFragmentAngles = undefined;
      cell.blebs = undefined;
      this.apoptoticBodies = this.apoptoticBodies.filter((body) => body.ownerId !== id);
    }

    if (state === 'mitosis') {
      this.triggerMitosis(cell, true, 'automatic');
      cell.stateElapsed = normalized * MITOSIS_SECONDS;
      cell.mitosisProgress = normalized;
    } else if (state === 'apoptosis') {
      this.triggerApoptosis(cell, 'automatic');
      cell.stateElapsed = normalized * APOPTOSIS_SECONDS;
      cell.apoptosisProgress = normalized;
      this.updateBlebs(cell, normalized, 0);
    } else if (state === 'postmitotic') {
      cell.state = 'postmitotic';
      cell.stateElapsed = normalized * POSTMITOTIC_SECONDS;
      cell.postmitoticProgress = normalized;
      cell.birthRadius = cell.baseRadius;
      cell.siblingAxis = 0;
      cell.siblingSide = 1;
      cell.siblingRestDistance = cell.radius * 2.1;
      cell.recoveryOffset = cell.radius * 0.05 * smootherstep(normalized);
      cell.recoveryBaseVelocity = { x: cell.vx, y: cell.vy };
      cell.life = 1;
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
