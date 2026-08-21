/**
 * Calm, fixed-timestep somatic animal-cell background & interactive biology playground.
 *
 * The biology is intentionally schematic but coherent: interphase growth,
 * open bipolar mitosis with cytokinesis, membrane-bound apoptosis with blebbing,
 * chemotaxis toward nutrient sources, optical laser tweezers, mutagenic pulses,
 * and multi-channel epifluorescent staining.
 *
 * The simulation advances at 60 fixed updates per second independently of display
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
export type LabTool =
  | 'pointer'
  | 'feed'
  | 'laser'
  | 'mutagen'
  | 'vortex'
  | 'spawn'
  | 'mitosis'
  | 'apoptosis';
export type StainingMode = 'phase' | 'gfp' | 'dapi' | 'mcherry' | 'lineage';
export type CellState = 'growing' | 'mature' | 'mitosis' | 'postmitotic' | 'apoptosis';
type LifecycleSource = 'user' | 'automatic';
type DetailLevel = 'full' | 'reduced' | 'minimal';

export interface NutrientDroplet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  energy: number;
  age: number;
  lifetime: number;
  hue: number;
}

export interface MutagenPulse {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  age: number;
  lifetime: number;
  alpha: number;
}

export interface VortexField {
  active: boolean;
  x: number;
  y: number;
  strength: number;
  radius: number;
}

export interface LaserBeam {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  power: number;
}

export interface CellSimParams {
  targetPopulation: number;
  growthMultiplier: number;
  mitosisMultiplier: number;
  apoptosisMultiplier: number;
  timeScale: number;
  isPaused: boolean;
  visualAlpha: number;
  darkContrast: boolean;
  viscosity?: number;
  temperature?: number;
  stainingMode?: StainingMode;
}

export interface CellTelemetry {
  total: number;
  interphase: number;
  mitosis: number;
  postmitotic: number;
  apoptosis: number;
  births: number;
  deaths: number;
  nutrients: number;
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
  colorHue: number;
  nutritionEnergy: number;
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
  private nutrientDroplets: NutrientDroplet[] = [];
  private mutagenPulses: MutagenPulse[] = [];
  private laser: LaserBeam = { active: false, x: -1000, y: -1000, radius: 140, power: 200 };
  private vortex: VortexField = { active: false, x: 0, y: 0, strength: 0, radius: 300 };
  private labTool: LabTool = 'pointer';
  private width = 0;
  private height = 0;
  private dpr = 1;
  private coarse = false;
  private targetCount = 0;
  private baseCount = 0;
  private isHomepage = false;
  private seeded = false;
  private nextId = 1;
  private nextNutrientId = 1;
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
    viscosity: 1.0,
    temperature: 1.0,
    stainingMode: 'phase',
  };

  public constructor(randomFn?: () => number) {
    this.random = randomFn ?? Math.random;
    this.targetCount = this.coarse ? (this.isHomepage ? 8 : 10) : 12;
    this.baseCount = this.targetCount;
    this.refreshPalette();
  }

  private rand(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  public getMode(): CellMode {
    return this.mode;
  }

  private persistCells(): void {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
    try {
      const activeCells = this.cells.filter((c) => c.state !== 'apoptosis' || c.life > 0.05);
      if (!activeCells.length) return;
      const data = activeCells.map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        vx: c.vx,
        vy: c.vy,
        baseRadius: c.baseRadius,
        radius: c.radius,
        targetRadius: c.targetRadius,
        birthRadius: c.birthRadius,
        state: c.state,
        stateElapsed: c.stateElapsed,
        growthProgress: c.growthProgress ?? 1,
        growthDuration: c.growthDuration ?? 10,
        life: c.life ?? 1,
        mitosisProgress: c.mitosisProgress,
        apoptosisProgress: c.apoptosisProgress,
        age: c.age,
        colorHue: c.colorHue ?? 180,
        nutritionEnergy: c.nutritionEnergy ?? 0,
        matureElapsed: c.matureElapsed,
        aspect: c.aspect,
        angle: c.angle,
        vAngle: c.vAngle,
        wobblePhase: c.wobblePhase ?? 0,
        breathPhase: c.breathPhase ?? 0,
        morphPhase: c.morphPhase ?? 0,
        nucleusRatio: c.nucleusRatio,
        nucleusOffset: c.nucleusOffset,
        nucleusAngle: c.nucleusAngle,
        harmonics: c.harmonics,
        harmonicPhases: c.harmonicPhases,
        harmonicSpeeds: c.harmonicSpeeds,
        organelles: c.organelles,
        lifecycleSource: c.lifecycleSource,
      }));
      sessionStorage.setItem('khc-cells-persist', JSON.stringify({ cells: data, nextId: this.nextId }));
    } catch {}
  }

  private restorePersistedCells(): boolean {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return false;
    try {
      const raw = sessionStorage.getItem('khc-cells-persist');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.cells) || !parsed.cells.length) return false;
      const activeItems = parsed.cells.filter(
        (item: any) => item && (item.state !== 'apoptosis' || (Number(item.life) || 1) > 0.05)
      );
      if (!activeItems.length) return false;
      this.cells = activeItems.map((item: any) => {
        const birthRadius = Number(item.birthRadius) || 20;
        const harmonics: LivingCell['harmonics'] = Array.isArray(item.harmonics) && item.harmonics.length === 4
          ? (item.harmonics as [number, number, number, number])
          : [0.05, 0.035, 0.025, 0.015];
        const harmonicPhases: LivingCell['harmonicPhases'] = Array.isArray(item.harmonicPhases) && item.harmonicPhases.length === 4
          ? (item.harmonicPhases as [number, number, number, number])
          : [0, 0, 0, 0];
        const harmonicSpeeds: LivingCell['harmonicSpeeds'] = Array.isArray(item.harmonicSpeeds) && item.harmonicSpeeds.length === 4
          ? (item.harmonicSpeeds as [number, number, number, number])
          : [0.05, -0.04, 0.03, -0.02];
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
        const cell: LivingCell = {
          id: String(item.id || this.nextId++),
          x: Number(item.x) || (this.width > 0 ? this.width * 0.5 : 400),
          y: Number(item.y) || (this.height > 0 ? this.height * 0.5 : 300),
          previousX: Number(item.x) || (this.width > 0 ? this.width * 0.5 : 400),
          previousY: Number(item.y) || (this.height > 0 ? this.height * 0.5 : 300),
          vx: Number(item.vx) || 0,
          vy: Number(item.vy) || 0,
          baseRadius: Number(item.baseRadius) || 30,
          radius: Number(item.radius) || 30,
          previousRadius: Number(item.radius) || 30,
          targetRadius: Number(item.targetRadius) || 30,
          birthRadius,
          angle: Number(item.angle) || 0,
          vAngle: Number(item.vAngle) || 0,
          wobblePhase: Number(item.wobblePhase) || 0,
          wobbleSpeed: 0.8,
          harmonics,
          harmonicPhases,
          harmonicSpeeds,
          aspect: Number(item.aspect) || 1,
          vertices,
          breathPhase: Number(item.breathPhase) || 0,
          breathSpeed: 0.6,
          morphPhase: Number(item.morphPhase) || 0,
          morphSpeed: 0.5,
          nucleusOffset: item.nucleusOffset || { x: 0, y: 0 },
          nucleusRatio: Number(item.nucleusRatio) || 0.34,
          nucleusAngle: Number(item.nucleusAngle) || 0,
          organelles: Array.isArray(item.organelles) ? item.organelles.map(cloneOrganelle) : [],
          state: item.state === 'mitosis' ? 'mature' : (item.state || 'mature'),
          stateElapsed: Number(item.stateElapsed) || 0,
          growthProgress: typeof item.growthProgress === 'number' ? item.growthProgress : 1,
          growthDuration: typeof item.growthDuration === 'number' ? item.growthDuration : 10,
          matureElapsed: Number(item.matureElapsed) || 0,
          life: typeof item.life === 'number' ? item.life : 1,
          colorHue: Number(item.colorHue) || this.rand(0, 360),
          nutritionEnergy: Number(item.nutritionEnergy) || 0,
          mitosisProgress: item.mitosisProgress,
          apoptosisProgress: item.apoptosisProgress,
          age: Number(item.age) || 0,
          isGrabbed: false,
          grabOffset: { x: 0, y: 0 },
          divisionQueued: false,
          glowIntensity: 1,
          contactCount: 0,
          lifecycleSource: item.lifecycleSource || 'automatic',
        };
        const margin = cell.radius * 1.1;
        if (this.width > 0 && this.height > 0) {
          cell.x = clamp(cell.x, margin, Math.max(margin, this.width - margin));
          cell.y = clamp(cell.y, margin, Math.max(margin, this.height - margin));
          cell.previousX = cell.x;
          cell.previousY = cell.y;
        }
        return cell;
      });
      if (parsed.nextId && Number.isFinite(parsed.nextId)) {
        this.nextId = Math.max(this.nextId, parsed.nextId);
      }
      this.seeded = true;
      return true;
    } catch {
      return false;
    }
  }

  public setMode(mode: CellMode): void {
    const normalizedMode = mode === 'calm' ? 'ambient' : mode;
    if (!['ambient', 'calm', 'lab', 'off'].includes(mode)) return;
    this.persistCells();
    this.mode = normalizedMode;
    if (normalizedMode === 'ambient') {
      this.simParams = {
        targetPopulation: 0,
        growthMultiplier: 1.0,
        mitosisMultiplier: 1.0,
        apoptosisMultiplier: 1.0,
        timeScale: 1.0,
        isPaused: false,
        visualAlpha: 0.6,
        darkContrast: false,
        viscosity: 1.0,
        temperature: 1.0,
        stainingMode: 'phase',
      };
      this.targetCount = this.coarse ? (this.isHomepage ? 8 : 10) : 12;
      this.baseCount = this.targetCount;
    } else if (normalizedMode === 'lab') {
      this.simParams.visualAlpha = 1.0;
      this.simParams.darkContrast = true;
      if (this.simParams.targetPopulation <= 0) {
        this.simParams.targetPopulation = this.cells.length || (this.coarse ? 16 : 24);
      }
      this.targetCount = this.simParams.targetPopulation;
      this.baseCount = this.simParams.targetPopulation;
    }
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
    this.dispatch('khc:cell-params-change', { params: this.getParams() });
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
      viscosity: 1.0,
      temperature: 1.0,
      stainingMode: 'phase',
    };
    this.dispatch('khc:cell-params-change', { params: this.getParams() });
  }

  public stepSingleFrame(): void {
    this.update(STEP);
    this.render(0, true);
  }

  public setLabTool(tool: LabTool): void {
    this.labTool = tool;
  }

  public getLabTool(): LabTool {
    return this.labTool;
  }

  public setStainingMode(mode: StainingMode): void {
    this.simParams.stainingMode = mode;
    this.dispatch('khc:cell-params-change', { params: this.getParams() });
  }

  public getStainingMode(): StainingMode {
    return this.simParams.stainingMode ?? 'phase';
  }

  public dispenseNutrient(x: number, y: number, count = 1): void {
    for (let i = 0; i < count; i++) {
      const angle = this.rand(0, TAU);
      const speed = this.rand(10, 45);
      this.nutrientDroplets.push({
        id: `nut-${this.nextNutrientId++}`,
        x: x + this.rand(-8, 8),
        y: y + this.rand(-8, 8),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: this.rand(3.5, 6.0),
        energy: 1.0,
        age: 0,
        lifetime: this.rand(14, 24),
        hue: this.rand(40, 60),
      });
    }
  }

  public setLaser(active: boolean, x: number, y: number, power = 200, radius = 140): void {
    this.laser = { active, x, y, radius, power };
  }

  public triggerMutagenPulse(x: number, y: number): void {
    this.mutagenPulses.push({
      x,
      y,
      radius: 5,
      maxRadius: Math.max(220, Math.min(this.width, this.height) * 0.42),
      age: 0,
      lifetime: 1.4,
      alpha: 1.0,
    });
    for (const cell of this.cells) {
      const dist = Math.hypot(cell.x - x, cell.y - y);
      if (dist <= 300 && cell.state === 'mature' && cell.baseRadius >= cell.targetRadius * 0.85) {
        cell.glowIntensity = 1.6;
        this.triggerMitosis(cell, true, 'user');
      }
    }
  }

  public applyVortex(x: number, y: number, strength = 180, radius = 320): void {
    this.vortex = { active: true, x, y, strength, radius };
  }

  public getNutrients(): NutrientDroplet[] {
    return this.nutrientDroplets;
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
    this.nutrientDroplets = [];
    this.mutagenPulses = [];
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
    this.nutrientDroplets = [];
    this.mutagenPulses = [];
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
      nutrients: this.nutrientDroplets.length,
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
    this.persistCells();
    this.counters.detaches++;
  }

  private seed(): void {
    if (this.cells.length > 0) {
      this.seeded = true;
      this.turnoverRemaining = this.turnoverDelay();
      return;
    }
    if (this.restorePersistedCells()) {
      this.turnoverRemaining = this.turnoverDelay();
      return;
    }
    const count = this.targetCount || this.baseCount || 12;
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
    const colorHue = (((px * 17.3 + py * 31.7) % 360) + 360) % 360;
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
      colorHue,
      nutritionEnergy: 0,
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
    const isAmbient = this.mode === 'ambient' || this.mode === 'calm';
    const excess = isAmbient ? Math.max(0, this.projectedCount() - (this.targetCount || 12)) : 0;
    const lifetimeSpeedup = excess > 0 ? 1.8 : 1.0;
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
        lifetime: this.rand(2.0, 3.0) / lifetimeSpeedup,
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
      daughter.colorHue = parent.colorHue;
      daughter.nutritionEnergy = 0;
      daughter.vx = parent.vx;
      daughter.vy = parent.vy;
      daughter.angle = parent.angle + this.rand(-0.04, 0.04);
      daughter.vAngle = parent.vAngle * 0.5 + this.rand(-0.02, 0.02);
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
    if (this.mode === 'lab' && (this.labTool === 'apoptosis' || this.labAction === 'apoptosis'))
      this.triggerApoptosis(cell, 'user');
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
    if (this.mode === 'lab' && this.simParams.targetPopulation > 0) {
      this.targetCount = this.simParams.targetPopulation;
    } else {
      this.targetCount = this.coarse ? (this.isHomepage ? 8 : 10) : 12;
    }
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
    this.visualScale = this.coarse ? 0.8 : 0.85;
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
    if (!target || target === this.canvas) return false;
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (
      el.tagName === 'CANVAS' &&
      (el === this.canvas || el.id === 'lab-canvas' || el.hasAttribute('data-site-bg-canvas'))
    ) {
      return false;
    }
    return Boolean(
      el.closest(
        'a, button, input, textarea, select, summary, label, dialog, h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, pre, code, figure, figcaption, picture, img, video, audio, iframe, svg, table, thead, tbody, tr, th, td, details, header, footer, [contenteditable="true"], [role="button"], [role="menuitem"], [role="dialog"], [role="log"], [data-cell-interaction="off"], [data-cell-protected], [data-game-root], [data-terminal]'
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

    if (this.mode === 'lab') {
      if (this.labTool === 'feed') {
        this.dispenseNutrient(event.clientX, event.clientY, 3);
      } else if (this.labTool === 'laser') {
        this.setLaser(true, event.clientX, event.clientY);
      } else if (this.labTool === 'vortex') {
        this.applyVortex(event.clientX, event.clientY, 180);
      }
    }

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

    if (this.mode === 'lab') {
      if (this.labTool === 'feed') {
        if (Math.random() < 0.3) this.dispenseNutrient(event.clientX, event.clientY, 1);
      } else if (this.labTool === 'laser') {
        this.setLaser(true, event.clientX, event.clientY);
      } else if (this.labTool === 'vortex') {
        this.applyVortex(event.clientX, event.clientY, 180);
      }
    }

    const sampleTime = performance.now();
    this.pointerSamples.push({ x: event.clientX, y: event.clientY, time: sampleTime });
    this.pointerSamples = this.pointerSamples.filter((sample) => sampleTime - sample.time <= 120);
    const distance = Math.hypot(
      event.clientX - this.pointerDown.x,
      event.clientY - this.pointerDown.y
    );
    if (this.pointer.type !== 'mouse') {
      if (this.mode === 'lab') {
        if (this.labTool === 'pointer' && !this.grabbedCell && this.pointerCandidate && distance > 10) {
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
      } else {
        if (distance > 10) this.pointerCandidate = null;
      }
      return;
    }
    if (this.labTool === 'pointer' && !this.grabbedCell && this.pointerCandidate && distance > 6) {
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

    if (this.mode === 'lab') {
      if (this.labTool === 'laser') {
        this.laser.active = false;
      } else if (this.labTool === 'vortex') {
        this.vortex.active = false;
      } else if (this.labTool === 'mutagen' && distance <= threshold && duration <= durationLimit) {
        this.triggerMutagenPulse(event.clientX, event.clientY);
      } else if (this.labTool === 'spawn' && distance <= threshold && duration <= durationLimit) {
        this.spawnCellAt(event.clientX, event.clientY);
      } else if (this.labTool === 'mitosis' && distance <= threshold && duration <= durationLimit) {
        if (candidate) this.triggerMitosis(candidate, true, 'user');
        else this.triggerRandomMitosis();
      } else if (this.labTool === 'apoptosis' && distance <= threshold && duration <= durationLimit) {
        if (candidate) this.triggerApoptosis(candidate, 'user');
        else this.triggerRandomApoptosis();
      }
    }

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
    } else if (
      this.labTool === 'pointer' &&
      candidate &&
      distance <= threshold &&
      duration <= durationLimit
    ) {
      this.queueDivision(candidate);
    } else if (
      this.mode === 'lab' &&
      this.labTool === 'pointer' &&
      !candidate &&
      !this.grabbedCell &&
      distance <= threshold &&
      duration <= durationLimit
    ) {
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
    this.laser.active = false;
    this.vortex.active = false;
  }

  public refreshEnvironment(): void {
    if (typeof window === 'undefined') return;
    this.coarse = window.matchMedia('(pointer: coarse)').matches;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.visualScale = this.coarse ? 0.8 : 0.85;
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

    this.updateNutrients(dt);
    this.updateMutagenPulses(dt);

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

  private updateNutrients(dt: number): void {
    for (let i = this.nutrientDroplets.length - 1; i >= 0; i--) {
      const drop = this.nutrientDroplets[i];
      drop.age += dt;
      drop.vx *= Math.exp(-1.8 * dt);
      drop.vy *= Math.exp(-1.8 * dt);
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      if (drop.age >= drop.lifetime || drop.energy <= 0.05) {
        this.nutrientDroplets.splice(i, 1);
      }
    }
  }

  private updateMutagenPulses(dt: number): void {
    for (let i = this.mutagenPulses.length - 1; i >= 0; i--) {
      const pulse = this.mutagenPulses[i];
      pulse.age += dt;
      const progress = clamp(pulse.age / pulse.lifetime, 0, 1);
      pulse.radius = pulse.maxRadius * smootherstep(progress);
      pulse.alpha = 1 - progress;
      if (progress >= 1) {
        this.mutagenPulses.splice(i, 1);
      }
    }
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
    const tempScale = this.simParams.temperature ?? 1.0;
    cell.breathPhase += cell.breathSpeed * dt * tempScale;
    cell.morphPhase += cell.morphSpeed * dt * tempScale;
    cell.wobblePhase += cell.wobbleSpeed * dt * tempScale;
    cell.angle += cell.vAngle * dt * tempScale;
    cell.nucleusAngle += cell.vAngle * 0.7 * dt * tempScale;
    cell.glowIntensity = Math.max(1, cell.glowIntensity - 0.08 * dt);
    for (let index = 0; index < cell.harmonicPhases.length; index++)
      cell.harmonicPhases[index] += cell.harmonicSpeeds[index] * dt * tempScale;
    for (const org of cell.organelles) if ('spinSpeed' in org) org.angle += org.spinSpeed * dt * tempScale;

    // Chemotaxis: sense nearby nutrient droplets and steer toward them
    if (this.nutrientDroplets.length > 0 && cell.state !== 'apoptosis' && cell.state !== 'mitosis') {
      let closestDrop: NutrientDroplet | null = null;
      let minDistance = 180;
      for (const drop of this.nutrientDroplets) {
        const d = Math.hypot(drop.x - cell.x, drop.y - cell.y);
        if (d < minDistance) {
          minDistance = d;
          closestDrop = drop;
        }
      }
      if (closestDrop) {
        const nx = (closestDrop.x - cell.x) / Math.max(1, minDistance);
        const ny = (closestDrop.y - cell.y) / Math.max(1, minDistance);
        const attractSpeed = 24 * (1 - minDistance / 180);
        cell.vx += (nx * attractSpeed - cell.vx) * (0.45 * dt);
        cell.vy += (ny * attractSpeed - cell.vy) * (0.45 * dt);

        // Nutrient consumption on contact
        if (minDistance <= cell.radius + closestDrop.radius + 2) {
          closestDrop.energy -= 0.5;
          cell.glowIntensity = Math.min(1.8, cell.glowIntensity + 0.4);
          cell.nutritionEnergy = Math.min(1, cell.nutritionEnergy + 0.35);
          if (cell.state === 'growing') {
            cell.growthProgress = Math.min(1, (cell.growthProgress ?? 0) + 0.25);
          } else if (cell.state === 'mature' && cell.matureElapsed >= 4 && Math.random() < 0.45) {
            this.triggerMitosis(cell, true, 'user');
          }
        }
      }
    }

    // Optical laser repellent force field
    if (this.laser.active && cell.state !== 'apoptosis') {
      const dx = cell.x - this.laser.x;
      const dy = cell.y - this.laser.y;
      const dist = Math.hypot(dx, dy);
      if (dist < this.laser.radius && dist > 1) {
        const force = (1 - dist / this.laser.radius) * this.laser.power;
        cell.vx += (dx / dist) * force * dt;
        cell.vy += (dy / dist) * force * dt;
        cell.glowIntensity = Math.min(1.5, cell.glowIntensity + 0.05);
      }
    }

    // Microfluidic vortex force field
    if (this.vortex.active) {
      const dx = cell.x - this.vortex.x;
      const dy = cell.y - this.vortex.y;
      const dist = Math.hypot(dx, dy);
      if (dist < this.vortex.radius && dist > 1) {
        const swirl = (1 - dist / this.vortex.radius) * this.vortex.strength;
        const tx = -dy / dist;
        const ty = dx / dist;
        cell.vx += tx * swirl * dt;
        cell.vy += ty * swirl * dt;
      }
    }

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
      const targetSpeed = (cell.state === 'apoptosis' ? 0 : this.coarse ? 3.8 : 5.2) * tempScale;
      const heading = cell.angle + 0.45 * Math.sin(cell.morphPhase);
      const targetVx = Math.cos(heading) * targetSpeed;
      const targetVy = Math.sin(heading) * targetSpeed;
      const viscosity = this.simParams.viscosity ?? 1.0;
      const response =
        cell.state === 'postmitotic' ? 0 : 1 - Math.exp(-(0.2 * viscosity + apoptosisDamping) * dt);
      cell.vx += (targetVx - cell.vx) * response;
      cell.vy += (targetVy - cell.vy) * response;
      const speed = Math.hypot(cell.vx, cell.vy);
      const speedCap = cell.state === 'postmitotic' ? 40 : 18;
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
    const growthSpeed = this.simParams.growthMultiplier * (1 + cell.nutritionEnergy * 0.8);
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
    const isAmbient = this.mode === 'ambient' || this.mode === 'calm';
    const projected = this.projectedCount();
    const target = this.targetCount || this.baseCount || 12;
    const excess = isAmbient ? Math.max(0, projected - target) : 0;
    const clearanceSpeedup = excess > 0 ? 1 + Math.min(5.0, excess * 0.08) : 1;
    const effectiveDuration = isAmbient
      ? APOPTOSIS_SECONDS / (this.simParams.apoptosisMultiplier * clearanceSpeedup)
      : APOPTOSIS_SECONDS / this.simParams.apoptosisMultiplier;
    cell.apoptosisProgress = clamp(cell.stateElapsed / effectiveDuration, 0, 1);
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
            second.vy -= ny * impulse * inverseSecond;
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
    const cellSize = Math.max(26, maximumRadius * 1.6);
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
        : this.targetCount || this.baseCount || 12;
    const excess = Math.max(0, projected - target);
    if (projected > target) {
      const isAmbient = this.mode === 'ambient' || this.mode === 'calm';
      const automaticDeaths = this.cells.filter(
        (cell) => cell.state === 'apoptosis' && cell.lifecycleSource === 'automatic'
      ).length;
      const maximumDeaths = isAmbient && excess > 0
        ? Math.min(16, Math.max(2, Math.ceil(excess * 0.28)))
        : this.coarse ? 1 : 2;
      if (this.rebalanceCooldown <= 0 && automaticDeaths < maximumDeaths) {
        const candidate = this.apoptosisCandidate(true);
        if (candidate) {
          this.triggerApoptosis(candidate, 'automatic');
          const delayBase = this.rebalanceDelay();
          this.rebalanceCooldown = isAmbient && excess > 0
            ? Math.max(0.04, delayBase / (1 + excess * 0.5))
            : delayBase;
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
    const profileLimit = this.coarse ? 6 : this.isHomepage ? 6 : 8;
    const paintedPopulation = this.cells.length + Math.ceil(this.apoptoticBodies.length * 0.5);
    if (this.mode === 'lab') {
      if (paintedPopulation > 120) effectiveRank = 2;
      else if (paintedPopulation > 40) effectiveRank = Math.max(effectiveRank, 1);
    } else {
      if (paintedPopulation > profileLimit) effectiveRank = Math.max(effectiveRank, 1);
      if (paintedPopulation > profileLimit + (this.coarse ? 4 : 4)) effectiveRank = 2;
    }
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

    if (!reducedFrame) {
      this.renderNutrientDroplets(interpolation);
      this.renderLaserBeam();
      this.renderMutagenPulses();
    }

    for (const cell of this.cells) {
      if (reducedFrame) this.renderReducedCell(cell);
      else this.renderCell(cell, interpolation);
    }
    if (!reducedFrame)
      for (const body of this.apoptoticBodies) this.renderApoptoticBody(body, interpolation);

    if (timingStart) this.recordTiming(this.renderTimings, performance.now() - timingStart);
  }

  private renderNutrientDroplets(interpolation: number): void {
    if (!this.ctx || !this.nutrientDroplets.length) return;
    const alpha = this.effectiveAlpha(1.0);
    for (const drop of this.nutrientDroplets) {
      const x = drop.x + drop.vx * STEP * interpolation;
      const y = drop.y + drop.vy * STEP * interpolation;
      const pulse = 1 + 0.15 * Math.sin(drop.age * 6);
      const r = drop.radius * pulse;

      const grad = this.ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.8);
      grad.addColorStop(0, `rgba(245, 158, 11, ${0.45 * alpha * drop.energy})`);
      grad.addColorStop(1, `rgba(245, 158, 11, 0)`);
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(x, y, r * 2.8, 0, TAU);
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, TAU);
      this.ctx.fillStyle = `rgba(251, 191, 36, ${0.9 * alpha * drop.energy})`;
      this.ctx.fill();
      this.ctx.lineWidth = 1;
      this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * alpha * drop.energy})`;
      this.ctx.stroke();
    }
  }

  private renderLaserBeam(): void {
    if (!this.ctx || !this.laser.active) return;
    const { x, y, radius } = this.laser;
    const alpha = this.effectiveAlpha(0.85);
    const grad = this.ctx.createRadialGradient(x, y, 4, x, y, radius);
    grad.addColorStop(0, `rgba(239, 68, 68, ${0.65 * alpha})`);
    grad.addColorStop(0.5, `rgba(239, 68, 68, ${0.2 * alpha})`);
    grad.addColorStop(1, `rgba(239, 68, 68, 0)`);
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, TAU);
    this.ctx.fill();

    this.ctx.lineWidth = 1.2;
    this.ctx.strokeStyle = `rgba(239, 68, 68, ${0.75 * alpha})`;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius * 0.35, 0, TAU);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(x - radius * 0.5, y);
    this.ctx.lineTo(x + radius * 0.5, y);
    this.ctx.moveTo(x, y - radius * 0.5);
    this.ctx.lineTo(x, y + radius * 0.5);
    this.ctx.stroke();
  }

  private renderMutagenPulses(): void {
    if (!this.ctx || !this.mutagenPulses.length) return;
    const alpha = this.effectiveAlpha(1.0);
    for (const pulse of this.mutagenPulses) {
      this.ctx.save();
      this.ctx.lineWidth = 2.5 * pulse.alpha;
      this.ctx.strokeStyle = `rgba(168, 85, 247, ${0.85 * pulse.alpha * alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(pulse.x, pulse.y, pulse.radius, 0, TAU);
      this.ctx.stroke();

      const grad = this.ctx.createRadialGradient(
        pulse.x,
        pulse.y,
        pulse.radius * 0.75,
        pulse.x,
        pulse.y,
        pulse.radius
      );
      grad.addColorStop(0, 'rgba(168, 85, 247, 0)');
      grad.addColorStop(1, `rgba(168, 85, 247, ${0.25 * pulse.alpha * alpha})`);
      this.ctx.fillStyle = grad;
      this.ctx.fill();
      this.ctx.restore();
    }
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
    this.fillStroke(1, 0.72, false, false, cell);
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
      cell === this.hoveredCell,
      cell
    );
    this.ctx.clip();
    this.renderInterior(cell, radius, cell.life, true, this.recoveryMorphology(cell));
    this.ctx.restore();
  }

  private effectiveAlpha(opacity = 1): number {
    const modeAlpha =
      this.mode === 'ambient' || this.mode === 'calm'
        ? 0.6
        : (this.simParams.visualAlpha ?? 1.0);
    return BASE_ALPHA * modeAlpha * this.visualScale * opacity;
  }

  private getEffectivePalette(cell?: LivingCell): Palette {
    const staining = this.simParams.stainingMode ?? 'phase';
    if (staining === 'gfp') {
      return {
        accent: '52, 211, 153',
        ink: '240, 253, 244',
        glow: '16, 185, 129',
        dark: true,
      };
    }
    if (staining === 'dapi') {
      return {
        accent: '56, 189, 248',
        ink: '240, 249, 255',
        glow: '14, 165, 233',
        dark: true,
      };
    }
    if (staining === 'mcherry') {
      return {
        accent: '244, 63, 94',
        ink: '255, 241, 242',
        glow: '225, 29, 72',
        dark: true,
      };
    }
    if (staining === 'lineage' && cell) {
      const hue = Math.round(cell.colorHue ?? 180);
      return {
        accent: `${hue}, 70%, 55%`,
        ink: '245, 245, 245',
        glow: `${hue}, 85%, 65%`,
        dark: true,
      };
    }
    return this.palette;
  }

  private renderInterior(
    cell: LivingCell,
    radius: number,
    opacity = 1,
    showNucleus = true,
    recovery = 1
  ): void {
    if (!this.ctx || radius < 10) return;
    const detailLevel = this.effectiveDetailLevel();
    const isLab = this.mode === 'lab';
    const effectivePalette = this.getEffectivePalette(cell);
    const { accent, ink, glow, dark } = effectivePalette;
    const isHsl = accent.includes('%');
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

      this.ctx.beginPath();
      this.ctx.ellipse(nx, ny, nucleusA, nucleusB, cell.nucleusAngle, 0, TAU);
      this.ctx.fillStyle = isHsl
        ? `hsla(${accent}, ${(isLab ? 0.16 : 0.11) * alpha * nucleusRecovery})`
        : `rgba(${accent}, ${(isLab ? 0.11 : 0.078) * alpha * nucleusRecovery})`;
      this.ctx.fill();
      this.ctx.lineWidth = isLab ? 1.15 : 0.95;
      this.ctx.strokeStyle = isHsl
        ? `hsla(${glow}, ${(isLab ? 0.22 : 0.14) * alpha * nucleusRecovery})`
        : `rgba(${dark ? glow : ink}, ${(isLab ? 0.13 : 0.078) * alpha * nucleusRecovery})`;
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.arc(
        nx + Math.cos(cell.nucleusAngle) * nr * 0.14,
        ny + Math.sin(cell.nucleusAngle) * nr * 0.14,
        nr * 0.36,
        0,
        TAU
      );
      this.ctx.fillStyle = isHsl
        ? `hsla(${glow}, ${(isLab ? 0.25 : 0.16) * alpha * nucleusRecovery})`
        : `rgba(${ink}, ${(isLab ? 0.15 : 0.098) * alpha * nucleusRecovery})`;
      this.ctx.fill();
    }

    if (detailLevel === 'minimal') return;

    for (const org of cell.organelles) {
      if (detailLevel === 'reduced' && org.type !== 'mitochondria' && org.type !== 'centrosome') {
        continue;
      }
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
        this.ctx.fillStyle = isHsl
          ? `hsla(${accent}, ${(isLab ? 0.15 : 0.10) * alpha})`
          : `rgba(${accent}, ${(isLab ? 0.10 : 0.075) * alpha})`;
        this.ctx.fill();
        this.ctx.lineWidth = isLab ? 1.05 : 0.85;
        this.ctx.strokeStyle = isHsl
          ? `hsla(${glow}, ${(isLab ? 0.20 : 0.12) * alpha})`
          : `rgba(${dark ? glow : ink}, ${(isLab ? 0.13 : 0.088) * alpha})`;
        this.ctx.stroke();
        if (detailLevel === 'full') {
          this.ctx.lineWidth = isLab ? 0.8 : 0.65;
          this.ctx.strokeStyle = isHsl
            ? `hsla(${glow}, ${(isLab ? 0.16 : 0.10) * alpha})`
            : `rgba(${ink}, ${(isLab ? 0.095 : 0.068) * alpha})`;
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
        this.ctx.lineWidth = isLab ? 1.15 : 0.95;
        this.ctx.strokeStyle = isHsl
          ? `hsla(${accent}, ${(isLab ? 0.18 : 0.11) * alpha})`
          : `rgba(${accent}, ${(isLab ? 0.12 : 0.085) * alpha})`;
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
            this.ctx.fillStyle = isHsl
              ? `hsla(${accent}, ${(isLab ? 0.15 : 0.10) * alpha})`
              : `rgba(${accent}, ${(isLab ? 0.095 : 0.068) * alpha})`;
            this.ctx.fill();
            this.ctx.lineWidth = 0.55;
            this.ctx.strokeStyle = isHsl
              ? `hsla(${glow}, ${(isLab ? 0.18 : 0.12) * alpha})`
              : `rgba(${dark ? glow : ink}, ${(isLab ? 0.11 : 0.078) * alpha})`;
            this.ctx.stroke();
          }
        }
        this.ctx.restore();
      } else if (org.type === 'er') {
        this.ctx.save();
        this.ctx.translate(nx, ny);
        this.ctx.lineWidth = isLab ? 1.05 : 0.85;
        this.ctx.strokeStyle = isHsl
          ? `hsla(${accent}, ${(isLab ? 0.15 : 0.09) * alpha})`
          : `rgba(${accent}, ${(isLab ? 0.095 : 0.058) * alpha})`;
        for (let layer = 0; layer < org.layers; layer++) {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, nr * (1.14 + layer * 0.15), org.arcStart, org.arcStart + org.arcEnd);
          this.ctx.stroke();
        }
        if (detailLevel === 'full') {
          this.ctx.fillStyle = isHsl
            ? `hsla(${glow}, ${(isLab ? 0.18 : 0.12) * alpha})`
            : `rgba(${ink}, ${(isLab ? 0.11 : 0.075) * alpha})`;
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
        this.ctx.lineWidth = isLab ? 1.25 : 0.95;
        this.ctx.strokeStyle = isHsl
          ? `hsla(${glow}, ${(isLab ? 0.22 : 0.14) * alpha})`
          : `rgba(${dark ? glow : ink}, ${(isLab ? 0.14 : 0.088) * alpha})`;
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
    const effectivePalette = this.getEffectivePalette(cell);
    const { accent, ink, glow, dark } = effectivePalette;
    const isHsl = accent.includes('%');

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(axis);
    this.path(points);
    this.fillStroke(1 + 0.12 * Math.sin(progress * Math.PI), cell.life, false, false, cell);
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
      this.ctx.fillStyle = isHsl
        ? `hsla(${accent}, ${0.20 * spindleAlpha * alpha})`
        : `rgba(${accent}, ${0.13 * spindleAlpha * alpha})`;
      this.ctx.fill();
      this.ctx.strokeStyle = isHsl
        ? `hsla(${glow}, ${0.08 * spindleAlpha * alpha})`
        : `rgba(${glow}, ${0.034 * spindleAlpha * alpha})`;
      this.ctx.lineWidth = 0.6;
      for (let ray = 0; ray < 6; ray++) {
        const angle = (ray / 6) * TAU;
        this.ctx.beginPath();
        this.ctx.moveTo(px, 0);
        this.ctx.lineTo(px + Math.cos(angle) * radius * 0.11, Math.sin(angle) * radius * 0.11);
        this.ctx.stroke();
      }
    }

    // Doubled chromosome karyotype (12 distinct chromosome pairs)
    const count = 12;
    const spacing = clamp(radius * 0.052, 0.9, 2.4);
    const length = clamp(radius * 0.095, 1.5, 3.8);
    const width = clamp(radius * 0.024, 0.55, 1.1);
    const prophase = windowed(progress, 0.02, 0.12) * (1 - windowed(progress, 0.31, 0.38));
    const metaphase = windowed(progress, 0.22, 0.32) * (1 - windowed(progress, 0.46, 0.51));
    const anaphase = windowed(progress, 0.44, 0.5) * (1 - windowed(progress, 0.68, 0.76));
    const separation = radius * 0.48 * windowed(progress, 0.46, 0.64);
    for (let index = 0; index < count; index++) {
      const cy = (index - (count - 1) / 2) * spacing;
      if (prophase > 0.002) {
        const cx = Math.sin(index * 1.9 + 0.4) * radius * 0.06 * (1 - windowed(progress, 0.08, 0.3));
        this.chromosomeX(cx, cy, length, width, prophase * alpha, accent, isHsl);
      }
      if (metaphase > 0.002) {
        const gap = width * 1.1;
        this.ctx.lineWidth = width;
        this.ctx.strokeStyle = isHsl
          ? `hsla(${accent}, ${0.28 * metaphase * alpha})`
          : `rgba(${accent}, ${0.18 * metaphase * alpha})`;
        this.ctx.beginPath();
        this.ctx.moveTo(-gap, cy - length / 2);
        this.ctx.lineTo(-gap, cy + length / 2);
        this.ctx.moveTo(gap, cy - length / 2);
        this.ctx.lineTo(gap, cy + length / 2);
        this.ctx.stroke();
        this.ctx.strokeStyle = isHsl
          ? `hsla(${glow}, ${0.08 * metaphase * alpha})`
          : `rgba(${glow}, ${0.045 * metaphase * alpha})`;
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
          this.ctx.strokeStyle = isHsl
            ? `hsla(${accent}, ${0.28 * anaphase * alpha})`
            : `rgba(${accent}, ${0.18 * anaphase * alpha})`;
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
      this.ctx.fillStyle = isHsl
        ? `hsla(${accent}, ${0.08 * oldNucleus * alpha})`
        : `rgba(${accent}, ${0.05 * oldNucleus * alpha})`;
      this.ctx.fill();
      this.ctx.strokeStyle = isHsl
        ? `hsla(${glow}, ${0.08 * oldNucleus * alpha})`
        : `rgba(${ink}, ${0.048 * oldNucleus * alpha})`;
      this.ctx.stroke();
    }
    const newNuclei = windowed(progress, 0.64, 0.84);
    if (newNuclei > 0.002) {
      const distance = radius * lerp(0.45, 0.82, windowed(progress, 0.64, 0.94));
      for (const side of [-1, 1]) {
        this.ctx.beginPath();
        this.ctx.arc(side * distance, 0, daughterRadius * 0.24, 0, TAU);
        this.ctx.fillStyle = isHsl
          ? `hsla(${accent}, ${0.08 * newNuclei * alpha})`
          : `rgba(${accent}, ${0.052 * newNuclei * alpha})`;
        this.ctx.fill();
        this.ctx.strokeStyle = isHsl
          ? `hsla(${glow}, ${0.08 * newNuclei * alpha})`
          : `rgba(${ink}, ${0.05 * newNuclei * alpha})`;
        this.ctx.stroke();
      }
    }
    const ring = windowed(progress, 0.5, 0.6) * (1 - windowed(progress, 0.94, 1));
    if (ring > 0.002) {
      this.ctx.strokeStyle = isHsl
        ? `hsla(${glow}, ${0.16 * ring * alpha})`
        : `rgba(${dark ? glow : accent}, ${0.085 * ring * alpha})`;
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
      this.ctx.fillStyle = isHsl
        ? `hsla(${glow}, ${0.65 * sparkAlpha * alpha})`
        : `rgba(${glow}, ${0.45 * sparkAlpha * alpha})`;
      this.ctx.fill();
      this.ctx.strokeStyle = isHsl
        ? `hsla(${accent}, ${0.85 * sparkAlpha * alpha})`
        : `rgba(${accent}, ${0.65 * sparkAlpha * alpha})`;
      this.ctx.lineWidth = 0.8;
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private chromosomeX(
    x: number,
    y: number,
    length: number,
    width: number,
    alpha: number,
    color: string,
    isHsl: boolean
  ): void {
    if (!this.ctx) return;
    this.ctx.lineWidth = width;
    this.ctx.strokeStyle = isHsl
      ? `hsla(${color}, ${0.28 * alpha})`
      : `rgba(${color}, ${0.18 * alpha})`;
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

    const zeiosis = windowed(progress, 0.14, 0.3) * (1 - windowed(progress, 0.65, 0.82));
    const points = Array.from({ length: CONTOUR_SEGMENTS }, (_, index) => {
      const phi = (index / CONTOUR_SEGMENTS) * TAU;
      const ripple = zeiosis * 0.042 * Math.sin(phi * 5 + progress * 28);
      const r = coreRadius * (1 + ripple);
      const base = { x: Math.cos(phi) * r, y: Math.sin(phi) * r };
      return mixPoint(entry[index] ?? base, base, blend);
    });

    const alpha = this.effectiveAlpha(cell.life);
    const effectivePalette = this.getEffectivePalette(cell);
    const { accent, ink, glow, dark } = effectivePalette;
    const isHsl = accent.includes('%');
    this.ctx.save();
    this.ctx.translate(x, y);
    this.path(points);
    this.fillStroke(1.02 + 0.08 * zeiosis, cell.life, false, false, cell);

    const oldInterior = 1 - windowed(progress, 0.12, 0.48);
    if (oldInterior > 0.002) {
      this.ctx.save();
      this.ctx.clip();
      this.renderInterior(cell, coreRadius, oldInterior, false);
      this.ctx.restore();
    }

    const pyknosis = windowed(progress, 0.02, 0.22);
    const fragmentFade = windowed(progress, 0.38, 0.62);
    if (fragmentFade < 0.99) {
      this.ctx.beginPath();
      this.ctx.arc(0, 0, startRadius * lerp(0.24, 0.11, pyknosis), 0, TAU);
      this.ctx.fillStyle = isHsl
        ? `hsla(${glow}, ${(0.14 + 0.08 * pyknosis) * (1 - fragmentFade) * alpha})`
        : `rgba(${ink}, ${(0.08 + 0.06 * pyknosis) * (1 - fragmentFade) * alpha})`;
      this.ctx.fill();
    }

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
        this.ctx.fillStyle = isHsl
          ? `hsla(${glow}, ${0.15 * fragmentation * alpha})`
          : `rgba(${ink}, ${0.075 * fragmentation * alpha})`;
        this.ctx.fill();
      }
    }

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
        this.ctx.strokeStyle = isHsl
          ? `hsla(${glow}, ${0.12 * ba})`
          : `rgba(${dark ? glow : ink}, ${0.065 * ba})`;
        this.ctx.stroke();
      }
      this.ctx.beginPath();
      this.ctx.arc(bx, by, bleb.radius, 0, TAU);
      this.ctx.fillStyle = isHsl
        ? `hsla(${accent}, ${0.08 * ba})`
        : `rgba(${accent}, ${0.048 * ba})`;
      this.ctx.fill();
      this.ctx.strokeStyle = isHsl
        ? `hsla(${glow}, ${0.12 * ba})`
        : `rgba(${dark ? glow : ink}, ${0.068 * ba})`;
      this.ctx.stroke();
      if (bleb.detached && bleb.carriesFragment) {
        this.ctx.beginPath();
        this.ctx.arc(bx, by, Math.max(0.7, bleb.radius * 0.28), 0, TAU);
        this.ctx.fillStyle = isHsl
          ? `hsla(${glow}, ${0.12 * ba})`
          : `rgba(${ink}, ${0.065 * ba})`;
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

  private fillStroke(
    brightness: number,
    opacity: number,
    grabbed = false,
    hovered = false,
    cell?: LivingCell
  ): void {
    if (!this.ctx) return;
    const effectivePalette = this.getEffectivePalette(cell);
    const { accent, ink, glow, dark } = effectivePalette;
    const isHsl = accent.includes('%');
    const level = clamp(brightness, 0.8, 1.25);
    const isLab = this.mode === 'lab';
    const alpha = this.effectiveAlpha(opacity);
    const fillBase = isLab ? 0.105 : this.simParams.darkContrast ? 0.065 : 0.045;

    this.ctx.fillStyle = isHsl
      ? `hsla(${accent}, ${fillBase * 1.6 * level * alpha})`
      : `rgba(${accent}, ${fillBase * level * alpha})`;
    this.ctx.fill();

    this.ctx.lineWidth = grabbed ? 1.65 : hovered ? 1.4 : isLab ? 1.45 : 1.15;
    const strokeBase = isLab
      ? (grabbed ? 0.24 : hovered ? 0.20 : 0.165)
      : this.simParams.darkContrast
      ? (grabbed ? 0.16 : hovered ? 0.13 : 0.105)
      : (grabbed ? 0.12 : hovered ? 0.092 : 0.082);

    this.ctx.strokeStyle = isHsl
      ? `hsla(${glow}, ${strokeBase * 1.6 * level * alpha})`
      : `rgba(${dark ? glow : ink}, ${strokeBase * level * alpha})`;
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
  if (canvas) {
    const engine = getLivingCellsEngine();
    if (typeof window !== 'undefined' && window.location.pathname !== '/lab' && engine.getMode() === 'lab') {
      const stored = localStorage.getItem('khc-cell-mode');
      engine.setMode(stored === 'off' ? 'off' : 'ambient');
    }
    engine.attach(canvas);
  } else {
    getLivingCellsEngine().detach();
  }
}
