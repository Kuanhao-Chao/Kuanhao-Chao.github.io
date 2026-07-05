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
 * hazards are "mutagen" zappers / lasers / missiles, distance is bases replicated.
 */

export type JetpackStatus = 'ready' | 'playing' | 'over';
export type Base = 'A' | 'C' | 'G' | 'T';
export type HazardKind = 'zapper' | 'laser' | 'missile';
export type LastEvent = 'none' | 'thrust' | 'coin' | 'shield' | 'hit' | 'over';

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
}

/** A laser is a screen-anchored, full-width horizontal beam that telegraphs. */
export interface Laser {
  id: number;
  kind: 'laser';
  y: number;
  thickness: number;
  phase: 'warn' | 'active' | 'done';
  timer: number;
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
}

export interface Coin {
  id: number;
  x: number;
  y: number;
  radius: number;
  base: Base;
}

export interface PowerUp {
  id: number;
  x: number;
  y: number;
  radius: number;
  kind: 'shield';
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

export function createGame(seed = 1, config: JetpackConfig = {}): GameState {
  const merged = { ...DEFAULT_CONFIG, ...config };
  const normalizedSeed = (seed >>> 0) || 1;
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
  };
}

export function reset(state: GameState, seed = state.seed): GameState {
  Object.assign(
    state,
    createGame(seed, {
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
    })
  );
  return state;
}

export function start(state: GameState): void {
  if (state.status === 'ready') state.status = 'playing';
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
    const y = clamp(
      centerY - Math.sin(t * Math.PI) * amp,
      state.ceilingY + 30,
      state.groundY - 30
    );
    spawnCoin(state, baseX + i * spacing, y);
  }
}

export function spawnShield(state: GameState, x = state.width + 40, y = laneY(state)): PowerUp {
  const power: PowerUp = { id: state.nextId++, x, y, radius: 16, kind: 'shield' };
  state.powerUps.push(power);
  return power;
}

function difficulty(state: GameState): number {
  return clamp(state.distance / 6000, 0, 1);
}

export function nextGap(state: GameState): number {
  const speedFactor = clamp(state.speed / state.maxSpeed, 0, 1);
  const min = 360 + speedFactor * 170;
  const max = min + 200 + speedFactor * 120;
  return rangeRandom(state, min, max);
}

/** Pick and spawn the next hazard, weighted by how far the run has progressed. */
export function spawnPattern(state: GameState): void {
  const d = difficulty(state);
  const laserOk = state.distance >= state.laserUnlock;
  const missileOk = state.distance >= state.missileUnlock;
  const wZapper = 1;
  const wLaser = laserOk ? 0.4 + d * 0.5 : 0;
  const wMissile = missileOk ? 0.3 + d * 0.6 : 0;
  const total = wZapper + wLaser + wMissile;
  const roll = random(state) * total;

  if (roll < wZapper) {
    spawnZapper(state);
    if (random(state) < 0.5) spawnZapper(state, laneY(state));
  } else if (roll < wZapper + wLaser) {
    spawnLaser(state);
    if (d > 0.4 && random(state) < 0.45) spawnLaser(state, laneY(state));
  } else {
    spawnMissile(state);
  }

  if (random(state) < 0.7) spawnCoinArc(state);
  if (state.distance >= state.shieldMinDistance && random(state) < 0.08) spawnShield(state);
}

// --- Per-tick updates -------------------------------------------------------

function updateMissiles(state: GameState, dt: number, dtMs: number): void {
  for (const m of state.missiles) {
    if (m.phase === 'warn') {
      // Track the flyer's y so the warning arrow is meaningful, then lock aim.
      m.y += (state.flyer.y - m.y) * Math.min(1, 6 * dt);
      m.timer -= dtMs;
      if (m.timer <= 0) {
        m.phase = 'active';
        m.vx = -(state.speed + 300);
        m.vy = clamp((state.flyer.y - m.y) * 1.1, -240, 240);
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
  if (state.flyer.shielded) {
    state.flyer.shielded = false;
    state.invulnMs = state.invulnCap;
    state.lastEvent = 'shield';
  } else {
    state.status = 'over';
    state.flyer.thrusting = false;
    state.lastEvent = 'over';
  }
}

function checkHazards(state: GameState): void {
  const { x, y } = state.flyer;
  const r = state.flyerRadius;

  for (const z of state.zappers) {
    const { x1, y1, x2, y2 } = zapperEndpoints(z);
    if (pointSegmentDistance(x, y, x1, y1, x2, y2) <= r + z.thickness / 2) {
      hitFlyer(state);
      return;
    }
  }
  for (const l of state.lasers) {
    if (l.phase === 'active' && Math.abs(y - l.y) <= r + l.thickness / 2) {
      hitFlyer(state);
      return;
    }
  }
  for (const m of state.missiles) {
    if (m.phase === 'active' && circlesOverlap(x, y, r, m.x, m.y, m.radius)) {
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
      state.lastEvent = 'coin';
    } else {
      remainingCoins.push(c);
    }
  }
  state.coins = remainingCoins;

  const remainingPowers: PowerUp[] = [];
  for (const p of state.powerUps) {
    if (circlesOverlap(x, y, r, p.x, p.y, p.radius)) {
      state.flyer.shielded = true;
      state.lastEvent = 'shield';
    } else {
      remainingPowers.push(p);
    }
  }
  state.powerUps = remainingPowers;
}

export function step(state: GameState, dtMs = 1000 / 60): GameState {
  if (state.status !== 'playing') return state;

  const dt = clamp(dtMs, 0, 100) / 1000;
  state.ticks += 1;
  state.elapsedMs += dtMs;
  state.lastEvent = 'none';
  state.invulnMs = Math.max(0, state.invulnMs - dtMs);
  state.speed = Math.min(
    state.maxSpeed,
    state.startSpeed + (state.elapsedMs / 1000) * state.speedRamp
  );

  // Flyer physics: thrust replaces gravity while held.
  const flyer = state.flyer;
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
  cull(state);

  // Spawn by distance.
  state.spawnIn -= dx;
  if (state.spawnIn <= 0) {
    spawnPattern(state);
    state.spawnIn += nextGap(state);
  }

  // Collisions (hazards respect i-frames; pickups always apply while alive).
  if (state.invulnMs <= 0) checkHazards(state);
  if (state.status === 'playing') checkPickups(state);

  state.score = state.bases + state.coinCount * state.coinValue;
  return state;
}
