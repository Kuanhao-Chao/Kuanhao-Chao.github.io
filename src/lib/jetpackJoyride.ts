/**
 * Pure Jetpack Joyride engine: no DOM, no timers, no rendering.
 *
 * The controller owns input, canvas drawing, and wall-clock scheduling. This
 * module owns the deterministic side-scroller rules — hold-to-thrust physics,
 * the horizontal spawn→move→cull hazard pipeline, collision, pickups, and
 * scoring — so unit tests can replay a run from a seed and assert directly.
 *
 * Coordinates are screen-space, y-down (up is negative vy), matching the canvas.
 * The flyer stays at a fixed x; the world scrolls left past it.
 *
 * Genomic riff (skin only): the flyer is an enzyme, coins are A/C/G/T bases,
 * zappers / lasers / missiles are arcade hazards. Distance uses an arcade scale,
 * not bases replicated; these rules are not a biochemical simulation.
 */

import { CAMPAIGNS, type RunOptions, type RunResult } from './arcade';

export type JetpackStatus = 'ready' | 'playing' | 'paused' | 'over' | 'won';
export type Base = 'A' | 'C' | 'G' | 'T';
export type HazardKind = 'zapper' | 'laser' | 'missile';
export type LastEvent =
  'none' | 'thrust' | 'coin' | 'shield' | 'hit' | 'over' | 'magnet' | 'near' | 'won';

export const BASES: Base[] = ['A', 'C', 'G', 'T'];

export interface Flyer {
  /** Fixed x (world units). */
  x: number;
  /** Center y (world units). */
  y: number;
  vy: number;
  thrusting: boolean;
  shielded: boolean;
}

/** A zapper is a thick line segment, stored as center + half-length + angle. */
export interface Zapper {
  id: number;
  kind: 'zapper';
  cx: number;
  cy: number;
  halfLen: number;
  angle: number;
  /** Angular velocity (rad/s); 0 for static zappers. */
  spin: number;
  thickness: number;
  closest?: number;
  rewarded?: boolean;
}

/** A laser is a screen-anchored, full-width horizontal beam that telegraphs. */
export interface Laser {
  id: number;
  kind: 'laser';
  y: number;
  thickness: number;
  phase: 'warn' | 'active' | 'done';
  timer: number;
  closest?: number;
  rewarded?: boolean;
}

/** A missile enters behind an edge warning arrow, then flies left. */
export interface Missile {
  id: number;
  kind: 'missile';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: 'warn' | 'active';
  timer: number;
  locked?: boolean;
  closest?: number;
  rewarded?: boolean;
}

export interface Coin {
  id: number;
  x: number;
  y: number;
  radius: number;
  base: Base;
  missed?: boolean;
}

export interface PowerUp {
  id: number;
  x: number;
  y: number;
  radius: number;
  kind: 'shield' | 'magnet';
}

export interface JetpackConfig {
  width?: number;
  height?: number;
  ceilingY?: number;
  groundY?: number;
  flyerX?: number;
  flyerRadius?: number;
  gravity?: number;
  thrust?: number;
  maxRise?: number;
  maxFall?: number;
  startSpeed?: number;
  maxSpeed?: number;
  speedRamp?: number;
  baseScale?: number;
  coinValue?: number;
  initialGap?: number;
  laserUnlock?: number;
  missileUnlock?: number;
  shieldMinDistance?: number;
  invulnMs?: number;
}

export interface GameState {
  width: number;
  height: number;
  ceilingY: number;
  groundY: number;
  flyerX: number;
  flyerRadius: number;
  gravity: number;
  thrust: number;
  maxRise: number;
  maxFall: number;
  startSpeed: number;
  maxSpeed: number;
  speedRamp: number;
  baseScale: number;
  coinValue: number;
  initialGap: number;
  laserUnlock: number;
  missileUnlock: number;
  shieldMinDistance: number;
  invulnCap: number;
  status: JetpackStatus;
  flyer: Flyer;
  zappers: Zapper[];
  lasers: Laser[];
  missiles: Missile[];
  coins: Coin[];
  powerUps: PowerUp[];
  spawnIn: number;
  nextId: number;
  seed: number;
  rngState: number;
  elapsedMs: number;
  distance: number;
  bases: number;
  coinCount: number;
  score: number;
  speed: number;
  ticks: number;
  invulnMs: number;
  lastEvent: LastEvent;
  events: LastEvent[];
  run: RunOptions;
  encounters: number;
  certified: number;
  certifying: boolean;
  nearMisses: number;
  shieldsUsed: number;
  chain: number;
  coinPoints: number;
  magnetMs: number;
  safeY: number;
}

/** Deterministic RNG returning a float in [0, 1). Same seed -> same sequence. */
export type RNG = () => number;

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * In-state RNG. Advances `state.rngState` with the same mulberry32 arithmetic as
 * the exported `mulberry32`, so a run is fully reproducible from the state alone.
 * Seeding `rngState = s` yields the identical sequence to `mulberry32(s)()`.
 */
function random(state: GameState): number {
  let a = state.rngState >>> 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  state.rngState = a >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const rangeRandom = (state: GameState, min: number, max: number): number =>
  min + random(state) * (max - min);

export const DEFAULT_CONFIG = {
  width: 960,
  height: 540,
  ceilingY: 44,
  groundY: 496,
  flyerX: 210,
  flyerRadius: 17,
  gravity: 2100,
  thrust: 2650,
  maxRise: 560,
  maxFall: 780,
  startSpeed: 300,
  maxSpeed: 720,
  speedRamp: 7,
  baseScale: 8,
  coinValue: 15,
  initialGap: 540,
  laserUnlock: 1600,
  missileUnlock: 3400,
  shieldMinDistance: 2400,
  invulnMs: 950,
} as const;

const OFFSCREEN_PAD = 90;

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Shortest distance from point (px,py) to segment (x1,y1)-(x2,y2). */
export function pointSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean {
  return Math.hypot(ax - bx, ay - by) <= ar + br;
}

/** Endpoints of a zapper segment given its center, half-length, and angle. */
export function zapperEndpoints(z: Zapper): { x1: number; y1: number; x2: number; y2: number } {
  const cos = Math.cos(z.angle);
  const sin = Math.sin(z.angle);
  return {
    x1: z.cx - cos * z.halfLen,
    y1: z.cy - sin * z.halfLen,
    x2: z.cx + cos * z.halfLen,
    y2: z.cy + sin * z.halfLen,
  };
}

/** Inclusive [top, bottom] range the flyer center may occupy. */
export function flyerBounds(state: GameState): { top: number; bottom: number } {
  return {
    top: state.ceilingY + state.flyerRadius,
    bottom: state.groundY - state.flyerRadius,
  };
}

export function isShielded(state: GameState): boolean {
  return state.flyer.shielded;
}

export function createGame(seed = 1, config: JetpackConfig = {}, options?: RunOptions): GameState {
  const run: RunOptions = options
    ? { ...options }
    : { mode: 'classic', stage: 1, seed, difficulty: 'standard' };
  if (run.mode === 'campaign' || run.mode === 'practice')
    seed = CAMPAIGNS.jetpack[run.stage - 1].seed;
  const merged = { ...DEFAULT_CONFIG, ...config };
  const normalizedSeed = seed >>> 0 || 1;
  return {
    width: merged.width,
    height: merged.height,
    ceilingY: merged.ceilingY,
    groundY: merged.groundY,
    flyerX: merged.flyerX,
    flyerRadius: merged.flyerRadius,
    gravity: merged.gravity,
    thrust: merged.thrust,
    maxRise: merged.maxRise,
    maxFall: merged.maxFall,
    startSpeed: merged.startSpeed,
    maxSpeed: merged.maxSpeed,
    speedRamp: merged.speedRamp,
    baseScale: merged.baseScale,
    coinValue: merged.coinValue,
    initialGap: merged.initialGap,
    laserUnlock: merged.laserUnlock,
    missileUnlock: merged.missileUnlock,
    shieldMinDistance: merged.shieldMinDistance,
    invulnCap: merged.invulnMs,
    status: 'ready',
    flyer: {
      x: merged.flyerX,
      y: (merged.ceilingY + merged.groundY) / 2,
      vy: 0,
      thrusting: false,
      shielded: false,
    },
    zappers: [],
    lasers: [],
    missiles: [],
    coins: [],
    powerUps: [],
    spawnIn: merged.initialGap,
    nextId: 1,
    seed: normalizedSeed,
    rngState: normalizedSeed,
    elapsedMs: 0,
    distance: 0,
    bases: 0,
    coinCount: 0,
    score: 0,
    speed: merged.startSpeed,
    ticks: 0,
    invulnMs: 0,
    lastEvent: 'none',
    events: [],
    run,
    encounters: 0,
    certified: 0,
    certifying: false,
    nearMisses: 0,
    shieldsUsed: 0,
    chain: 0,
    coinPoints: 0,
    magnetMs: 0,
    safeY: (merged.ceilingY + merged.groundY) / 2,
  };
}

export function reset(state: GameState, seed = state.seed): GameState {
  Object.assign(
    state,
    createGame(
      seed,
      {
        width: state.width,
        height: state.height,
        ceilingY: state.ceilingY,
        groundY: state.groundY,
        flyerX: state.flyerX,
        flyerRadius: state.flyerRadius,
        gravity: state.gravity,
        thrust: state.thrust,
        maxRise: state.maxRise,
        maxFall: state.maxFall,
        startSpeed: state.startSpeed,
        maxSpeed: state.maxSpeed,
        speedRamp: state.speedRamp,
        baseScale: state.baseScale,
        coinValue: state.coinValue,
        initialGap: state.initialGap,
        laserUnlock: state.laserUnlock,
        missileUnlock: state.missileUnlock,
        shieldMinDistance: state.shieldMinDistance,
        invulnMs: state.invulnCap,
      },
      { ...state.run, seed }
    )
  );
  return state;
}

export function start(state: GameState): void {
  if (state.status === 'ready' || state.status === 'paused') state.status = 'playing';
}

export function pause(state: GameState): void {
  if (state.status === 'playing') {
    state.status = 'paused';
    state.flyer.thrusting = false;
  }
}

export function setThrust(state: GameState, on: boolean): void {
  state.flyer.thrusting = on;
  if (on) state.lastEvent = 'thrust';
}

// --- Spawning ---------------------------------------------------------------

const laneY = (state: GameState): number =>
  rangeRandom(state, state.ceilingY + 54, state.groundY - 54);

export function spawnZapper(state: GameState, cy = laneY(state)): Zapper {
  const roll = random(state);
  let angle: number;
  let spin = 0;
  let halfLen: number;
  if (roll < 0.4) {
    angle = Math.PI / 2; // vertical wall
    halfLen = rangeRandom(state, 60, 96);
  } else if (roll < 0.68) {
    angle = 0; // horizontal bar
    halfLen = rangeRandom(state, 78, 128);
  } else if (roll < 0.86) {
    angle = random(state) < 0.5 ? Math.PI / 4 : -Math.PI / 4; // diagonal
    halfLen = rangeRandom(state, 72, 104);
  } else {
    angle = random(state) * Math.PI; // rotating
    spin = (random(state) < 0.5 ? -1 : 1) * rangeRandom(state, 1, 1.6);
    halfLen = rangeRandom(state, 66, 92);
  }
  const bounds = flyerBounds(state);
  const cyClamped = clamp(cy, bounds.top + 10, bounds.bottom - 10);
  const zapper: Zapper = {
    id: state.nextId++,
    kind: 'zapper',
    cx: state.width + halfLen + 20,
    cy: cyClamped,
    halfLen,
    angle,
    spin,
    thickness: 12,
  };
  state.zappers.push(zapper);
  return zapper;
}

export function spawnLaser(state: GameState, y = laneY(state)): Laser {
  const laser: Laser = {
    id: state.nextId++,
    kind: 'laser',
    y,
    thickness: 26,
    phase: 'warn',
    timer: 780,
  };
  state.lasers.push(laser);
  return laser;
}

export function spawnMissile(state: GameState, y = state.flyer.y): Missile {
  const missile: Missile = {
    id: state.nextId++,
    kind: 'missile',
    x: state.width - 18,
    y: clamp(y, state.ceilingY + 20, state.groundY - 20),
    vx: 0,
    vy: 0,
    radius: 14,
    phase: 'warn',
    timer: 850,
  };
  state.missiles.push(missile);
  return missile;
}

export function spawnCoin(
  state: GameState,
  x: number,
  y: number,
  base: Base = BASES[Math.floor(random(state) * 4)] ?? 'A'
): Coin {
  const coin: Coin = { id: state.nextId++, x, y, radius: 12, base };
  state.coins.push(coin);
  return coin;
}

export function spawnCoinArc(state: GameState, centerY = laneY(state)): void {
  const count = 5;
  const spacing = 46;
  const amp = 42;
  const baseX = state.width + 44;
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const y = clamp(centerY - Math.sin(t * Math.PI) * amp, state.ceilingY + 30, state.groundY - 30);
    spawnCoin(state, baseX + i * spacing, y);
  }
}

export function spawnShield(state: GameState, x = state.width + 40, y = laneY(state)): PowerUp {
  const power: PowerUp = { id: state.nextId++, x, y, radius: 16, kind: 'shield' };
  state.powerUps.push(power);
  return power;
}

export function nextGap(state: GameState): number {
  // A time-sized gap prevents late-run speed from erasing all reaction time.
  return state.speed * (5.2 + random(state) * 0.8);
}

/** Pick and spawn the next hazard, weighted by how far the run has progressed. */
export function spawnPattern(state: GameState): void {
  const staged = state.run.mode === 'campaign' || state.run.mode === 'practice';
  const stage = staged
    ? state.run.stage
    : state.distance < state.laserUnlock
      ? 1
      : state.distance < state.missileUnlock
        ? 3
        : 6;
  const kinds: Array<HazardKind | 'rotor'> =
    stage <= 2
      ? ['zapper']
      : stage === 3
        ? ['zapper', 'laser']
        : stage === 4
          ? ['zapper', 'missile', 'laser']
          : ['zapper', 'laser', 'rotor', 'missile'];
  const index = staged ? state.encounters % kinds.length : Math.floor(random(state) * kinds.length);
  const kind = kinds[index];
  const bounds = flyerBounds(state);
  const upper = bounds.top + 85;
  const lower = bounds.bottom - 85;
  const safeY =
    kind === 'missile'
      ? state.flyer.y < state.height / 2
        ? lower
        : upper
      : state.encounters % 2
        ? upper
        : lower;
  state.safeY = safeY;
  const oldIds = new Set([...state.zappers, ...state.lasers, ...state.missiles].map((h) => h.id));
  if (kind === 'laser') {
    const laser = spawnLaser(state, safeY === upper ? lower : upper);
    laser.timer = state.run.difficulty === 'expert' ? 1100 : 1400;
  } else if (kind === 'missile') {
    const missile = spawnMissile(state);
    missile.timer = state.run.difficulty === 'expert' ? 1100 : 1400;
  } else {
    const z = spawnZapper(state, safeY === upper ? lower : upper);
    z.angle = Math.PI / 2;
    z.halfLen = stage === 1 ? 52 : 80;
    z.spin = kind === 'rotor' ? 0.9 * (state.encounters % 2 ? -1 : 1) : 0;
    z.cx = state.flyer.x + state.speed * 2.2 + z.halfLen;
  }
  state.encounters++;
  if (certifyEncounter(state, safeY, kind === 'missile')) state.certified++;
  else {
    // Conservative fallback: never publish an encounter without a winning input witness.
    state.zappers = state.zappers.filter((h) => oldIds.has(h.id));
    state.lasers = state.lasers.filter((h) => oldIds.has(h.id));
    state.missiles = state.missiles.filter((h) => oldIds.has(h.id));
  }
  spawnCoinArc(state, safeY);
  if (state.encounters % 4 === 0) spawnShield(state, state.width + 80, safeY);
  if (state.encounters % 5 === 0)
    state.powerUps.push({
      id: state.nextId++,
      kind: 'magnet',
      x: state.width + 40,
      y: safeY,
      radius: 16,
    });
}

/** A constructive reachability certificate using the exact engine physics.
 * This proves one route, not that every player input is safe. No shield or magnet
 * is needed by the witness. Failing candidates are omitted by spawnPattern.
 */
export function certifyEncounter(source: GameState, safeY: number, missile = false): boolean {
  const probe = structuredClone(source);
  probe.status = 'playing';
  probe.certifying = true;
  probe.spawnIn = Infinity;
  probe.run.mode = 'classic';
  probe.flyer.shielded = false;
  probe.invulnMs = 0;
  probe.coins = [];
  probe.powerUps = [];
  probe.magnetMs = 0;
  for (let frame = 0; frame < 300 && probe.status === 'playing'; frame++) {
    const waiting = missile && probe.missiles.some((m) => m.phase === 'warn' && m.timer > 400);
    const target = waiting ? source.flyer.y : safeY;
    const desiredVy = clamp((target - probe.flyer.y) * 5, -360, 360);
    setThrust(probe, probe.flyer.vy > desiredVy);
    step(probe, 1000 / 60);
  }
  return probe.status === 'playing';
}

// --- Per-tick updates -------------------------------------------------------

function updateMissiles(state: GameState, dt: number, dtMs: number): void {
  for (const m of state.missiles) {
    if (m.phase === 'warn') {
      // Track the flyer's y so the warning arrow is meaningful, then lock aim.
      if (m.timer > 350) m.y += (state.flyer.y - m.y) * Math.min(1, 6 * dt);
      else m.locked = true;
      m.timer -= dtMs;
      if (m.timer <= 0) {
        m.phase = 'active';
        m.vx = -(state.speed + 300);
        m.vy = 0; // aim is visibly locked; it does not secretly re-target at launch
      }
    } else {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
    }
  }
}

function updateLasers(state: GameState, dtMs: number): void {
  for (const l of state.lasers) {
    l.timer -= dtMs;
    if (l.timer <= 0) {
      if (l.phase === 'warn') {
        l.phase = 'active';
        l.timer = 620;
      } else if (l.phase === 'active') {
        l.phase = 'done';
      }
    }
  }
}

function cull(state: GameState): void {
  state.zappers = state.zappers.filter((z) => z.cx + z.halfLen > -OFFSCREEN_PAD);
  state.missiles = state.missiles.filter((m) => m.x + m.radius > -OFFSCREEN_PAD);
  state.coins = state.coins.filter((c) => c.x + c.radius > -OFFSCREEN_PAD);
  state.powerUps = state.powerUps.filter((p) => p.x + p.radius > -OFFSCREEN_PAD);
  state.lasers = state.lasers.filter((l) => l.phase !== 'done');
}

/** Register a hazard hit: consume a shield (+ i-frames) or end the run. */
function hitFlyer(state: GameState): void {
  if (state.run.mode === 'practice') {
    state.invulnMs = 950;
    emit(state, 'hit');
    return;
  }
  if (state.flyer.shielded) {
    state.flyer.shielded = false;
    state.shieldsUsed++;
    state.invulnMs = state.invulnCap;
    emit(state, 'hit');
  } else {
    state.status = 'over';
    state.flyer.thrusting = false;
    emit(state, 'over');
  }
}

function checkHazards(
  state: GameState,
  previous = { x: state.flyer.x, y: state.flyer.y },
  dt = 0
): void {
  const { x, y } = state.flyer;
  const r = state.flyerRadius;

  for (const z of state.zappers) {
    const { x1, y1, x2, y2 } = zapperEndpoints(z);
    let distance = pointSegmentDistance(x, y, x1, y1, x2, y2);
    // Sample the relative swept path, including rotor motion, at <= 6-unit intervals.
    const samples = Math.max(
      1,
      Math.ceil(
        (Math.abs(y - previous.y) + state.speed * dt + Math.abs(z.spin * dt * z.halfLen)) / 6
      )
    );
    for (let i = 0; i < samples; i++) {
      const t = i / samples;
      const edge = zapperEndpoints({
        ...z,
        cx: z.cx + state.speed * dt * (1 - t),
        angle: z.angle - z.spin * dt * (1 - t),
      });
      distance = Math.min(
        distance,
        pointSegmentDistance(
          x,
          previous.y + (y - previous.y) * t,
          edge.x1,
          edge.y1,
          edge.x2,
          edge.y2
        )
      );
    }
    z.closest = Math.min(z.closest ?? Infinity, distance - r - z.thickness / 2);
    if (distance <= r + z.thickness / 2) {
      hitFlyer(state);
      return;
    }
  }
  for (const l of state.lasers) {
    const distance =
      l.y >= Math.min(previous.y, y) && l.y <= Math.max(previous.y, y)
        ? 0
        : Math.min(Math.abs(y - l.y), Math.abs(previous.y - l.y));
    if (l.phase === 'active')
      l.closest = Math.min(l.closest ?? Infinity, distance - r - l.thickness / 2);
    if (l.phase === 'active' && distance <= r + l.thickness / 2) {
      hitFlyer(state);
      return;
    }
  }
  for (const m of state.missiles) {
    const distance = pointSegmentDistance(
      0,
      0,
      m.x - m.vx * dt - previous.x,
      m.y - m.vy * dt - previous.y,
      m.x - x,
      m.y - y
    );
    if (m.phase === 'active') m.closest = Math.min(m.closest ?? Infinity, distance - r - m.radius);
    if (m.phase === 'active' && distance <= r + m.radius) {
      hitFlyer(state);
      return;
    }
  }
}

function checkPickups(state: GameState): void {
  const { x, y } = state.flyer;
  const r = state.flyerRadius;
  const remainingCoins: Coin[] = [];
  for (const c of state.coins) {
    if (circlesOverlap(x, y, r, c.x, c.y, c.radius)) {
      state.coinCount += 1;
      state.chain++;
      state.coinPoints += state.coinValue * Math.min(4, 1 + Math.floor((state.chain - 1) / 5));
      emit(state, 'coin');
    } else {
      if (!c.missed && c.x + c.radius < x) {
        c.missed = true;
        state.chain = 0;
      }
      remainingCoins.push(c);
    }
  }
  state.coins = remainingCoins;

  const remainingPowers: PowerUp[] = [];
  for (const p of state.powerUps) {
    if (circlesOverlap(x, y, r, p.x, p.y, p.radius)) {
      if (p.kind === 'shield') state.flyer.shielded = true;
      else state.magnetMs = 6000;
      emit(state, p.kind);
    } else {
      remainingPowers.push(p);
    }
  }
  state.powerUps = remainingPowers;
}

export function step(state: GameState, dtMs = 1000 / 60): GameState {
  if (state.status !== 'playing') return state;
  if (!Number.isFinite(dtMs) || dtMs < 0) return state;
  dtMs = Math.min(100, dtMs);

  const dt = clamp(dtMs, 0, 100) / 1000;
  state.ticks += 1;
  state.elapsedMs += dtMs;
  state.lastEvent = 'none';
  state.events = [];
  state.invulnMs = Math.max(0, state.invulnMs - dtMs);
  state.magnetMs = Math.max(0, state.magnetMs - dtMs);
  state.speed = Math.min(
    state.maxSpeed,
    state.startSpeed + (state.elapsedMs / 1000) * state.speedRamp
  );

  // Flyer physics: thrust replaces gravity while held.
  const flyer = state.flyer;
  const previous = { x: flyer.x, y: flyer.y };
  flyer.vy = flyer.thrusting ? flyer.vy - state.thrust * dt : flyer.vy + state.gravity * dt;
  flyer.vy = clamp(flyer.vy, -state.maxRise, state.maxFall);
  flyer.y += flyer.vy * dt;
  const bounds = flyerBounds(state);
  if (flyer.y < bounds.top) {
    flyer.y = bounds.top;
    if (flyer.vy < 0) flyer.vy = 0;
  } else if (flyer.y > bounds.bottom) {
    flyer.y = bounds.bottom;
    if (flyer.vy > 0) flyer.vy = 0;
  }

  // Scroll the world left.
  const dx = state.speed * dt;
  state.distance += dx;
  state.bases = Math.floor(state.distance / state.baseScale);
  for (const z of state.zappers) {
    z.cx -= dx;
    z.angle += z.spin * dt;
  }
  for (const c of state.coins) c.x -= dx;
  for (const p of state.powerUps) p.x -= dx;
  updateMissiles(state, dt, dtMs);
  updateLasers(state, dtMs);
  if (state.magnetMs > 0)
    for (const coin of state.coins) {
      const d = Math.hypot(coin.x - flyer.x, coin.y - flyer.y);
      if (d < 180 && d > 1) {
        coin.x += ((flyer.x - coin.x) / d) * 420 * dt;
        coin.y += ((flyer.y - coin.y) / d) * 420 * dt;
      }
    }

  // Spawn by distance.
  state.spawnIn -= dx;
  const staged = state.run.mode === 'campaign' || state.run.mode === 'practice';
  const finishing =
    staged && state.elapsedMs / 1000 > CAMPAIGNS.jetpack[state.run.stage - 1].goal - 5;
  if (state.spawnIn <= 0 && !state.certifying && !finishing) {
    spawnPattern(state);
    state.spawnIn += nextGap(state);
  }

  // Collisions (hazards respect i-frames; pickups always apply while alive).
  if (state.invulnMs <= 0) checkHazards(state, previous, dt);
  if (state.status === 'playing') checkPickups(state);

  for (const hazard of [...state.zappers, ...state.missiles, ...state.lasers]) {
    const passed =
      hazard.kind === 'zapper'
        ? hazard.cx + hazard.halfLen < flyer.x - state.flyerRadius
        : hazard.kind === 'missile'
          ? hazard.x + hazard.radius < flyer.x - state.flyerRadius
          : hazard.phase === 'done';
    if (passed && !hazard.rewarded) {
      hazard.rewarded = true;
      if (
        hazard.closest !== undefined &&
        hazard.closest > 0 &&
        hazard.closest <= 18 &&
        state.invulnMs <= 0
      ) {
        state.nearMisses++;
        emit(state, 'near');
      }
    }
  }
  cull(state);
  if (
    state.status === 'playing' &&
    staged &&
    state.elapsedMs >= CAMPAIGNS.jetpack[state.run.stage - 1].goal * 1000
  ) {
    state.status = 'won';
    flyer.thrusting = false;
    emit(state, 'won');
  }

  state.score = state.bases + state.coinPoints + state.nearMisses * 25;
  return state;
}

function emit(state: GameState, event: LastEvent) {
  state.lastEvent = event;
  if (state.events.length < 32) state.events.push(event);
}

export function jetpackResult(state: GameState): RunResult {
  const won = state.status === 'won';
  return {
    score: state.score,
    seconds: state.elapsedMs / 1000,
    won,
    medals: [
      won,
      won && state.coinCount >= CAMPAIGNS.jetpack[state.run.stage - 1].par,
      won && state.shieldsUsed === 0,
    ],
    detail: `${state.coinCount} bases · ${state.nearMisses} near misses · ${state.shieldsUsed} shields spent`,
  };
}
