/**
 * Pure Dino Run engine: no DOM, no timers, no rendering.
 *
 * The controller owns input, canvas drawing, and wall-clock scheduling. This
 * module owns the deterministic runner rules so unit tests can replay a run
 * from a seed and assert physics, spawning, scoring, and collisions directly.
 */

export type DinoStatus = 'ready' | 'playing' | 'over';

export type ObstacleKind = 'variant-block' | 'splice-arch' | 'repeat-stack';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RunnerState {
  x: number;
  /** Bottom y coordinate. */
  y: number;
  vy: number;
  grounded: boolean;
  ducking: boolean;
}

export interface Obstacle extends Rect {
  id: number;
  kind: ObstacleKind;
}

export interface DinoConfig {
  width?: number;
  height?: number;
  groundY?: number;
  runnerX?: number;
  startSpeed?: number;
  maxSpeed?: number;
  speedRamp?: number;
  gravity?: number;
  jumpVelocity?: number;
  initialGap?: number;
}

export interface DinoState {
  width: number;
  height: number;
  groundY: number;
  runnerX: number;
  startSpeed: number;
  maxSpeed: number;
  speedRamp: number;
  gravity: number;
  jumpVelocity: number;
  status: DinoStatus;
  runner: RunnerState;
  obstacles: Obstacle[];
  spawnIn: number;
  nextObstacleId: number;
  elapsedMs: number;
  distance: number;
  score: number;
  speed: number;
  ticks: number;
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

export const DEFAULT_DINO_CONFIG = {
  width: 960,
  height: 420,
  groundY: 318,
  runnerX: 92,
  startSpeed: 310,
  maxSpeed: 720,
  speedRamp: 8.5,
  gravity: 2200,
  jumpVelocity: -760,
  initialGap: 430,
} as const;

const STANDING = { width: 46, height: 66 } as const;
const DUCKING = { width: 68, height: 38 } as const;
const OFFSCREEN_PAD = 80;

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

export function createGame(config: DinoConfig = {}, rng: RNG = mulberry32(1)): DinoState {
  const merged = { ...DEFAULT_DINO_CONFIG, ...config };
  return {
    width: merged.width,
    height: merged.height,
    groundY: merged.groundY,
    runnerX: merged.runnerX,
    startSpeed: merged.startSpeed,
    maxSpeed: merged.maxSpeed,
    speedRamp: merged.speedRamp,
    gravity: merged.gravity,
    jumpVelocity: merged.jumpVelocity,
    status: 'ready',
    runner: {
      x: merged.runnerX,
      y: merged.groundY,
      vy: 0,
      grounded: true,
      ducking: false,
    },
    obstacles: [],
    spawnIn: merged.initialGap + rng() * 120,
    nextObstacleId: 1,
    elapsedMs: 0,
    distance: 0,
    score: 0,
    speed: merged.startSpeed,
    ticks: 0,
  };
}

export function reset(state: DinoState, rng: RNG = mulberry32(1)): DinoState {
  Object.assign(
    state,
    createGame(
      {
        width: state.width,
        height: state.height,
        groundY: state.groundY,
        runnerX: state.runnerX,
        startSpeed: state.startSpeed,
        maxSpeed: state.maxSpeed,
        speedRamp: state.speedRamp,
        gravity: state.gravity,
        jumpVelocity: state.jumpVelocity,
      },
      rng
    )
  );
  return state;
}

export function start(state: DinoState): void {
  if (state.status === 'ready') state.status = 'playing';
}

export function jump(state: DinoState): boolean {
  if (state.status === 'over') return false;
  if (state.status === 'ready') start(state);
  if (!state.runner.grounded) return false;
  state.runner.vy = state.jumpVelocity;
  state.runner.grounded = false;
  state.runner.ducking = false;
  return true;
}

export function duck(state: DinoState): boolean {
  if (state.status === 'over') return false;
  if (state.status === 'ready') start(state);
  if (!state.runner.grounded) return false;
  state.runner.ducking = true;
  return true;
}

export function releaseDuck(state: DinoState): void {
  state.runner.ducking = false;
}

export function playerHitbox(state: DinoState): Rect {
  const box = state.runner.ducking && state.runner.grounded ? DUCKING : STANDING;
  return {
    x: state.runner.x,
    y: state.runner.y - box.height,
    width: box.width,
    height: box.height,
  };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function obstacleKind(rng: RNG): ObstacleKind {
  const roll = rng();
  if (roll < 0.46) return 'variant-block';
  if (roll < 0.76) return 'splice-arch';
  return 'repeat-stack';
}

export function makeObstacle(
  kind: ObstacleKind,
  id: number,
  x: number,
  groundY: number,
  rng: RNG = mulberry32(id)
): Obstacle {
  if (kind === 'splice-arch') {
    const width = 50 + Math.floor(rng() * 3) * 6;
    return { id, kind, x, y: groundY - 82, width, height: 24 };
  }
  if (kind === 'repeat-stack') {
    const width = 70 + Math.floor(rng() * 3) * 8;
    const height = 38 + Math.floor(rng() * 2) * 8;
    return { id, kind, x, y: groundY - height, width, height };
  }
  const width = 34 + Math.floor(rng() * 3) * 8;
  const height = 44 + Math.floor(rng() * 2) * 8;
  return { id, kind, x, y: groundY - height, width, height };
}

export function nextGap(state: DinoState, rng: RNG): number {
  const speedFactor = clamp(state.speed / state.maxSpeed, 0, 1);
  const min = 290 + speedFactor * 210;
  const max = min + 150 + speedFactor * 130;
  return min + rng() * (max - min);
}

export function spawnObstacle(state: DinoState, rng: RNG): Obstacle {
  const obstacle = makeObstacle(
    obstacleKind(rng),
    state.nextObstacleId,
    state.width + 28,
    state.groundY,
    rng
  );
  state.nextObstacleId += 1;
  state.obstacles.push(obstacle);
  return obstacle;
}

export function step(state: DinoState, rng: RNG, dtMs = 1000 / 60): DinoState {
  if (state.status !== 'playing') return state;

  const dt = clamp(dtMs, 0, 100) / 1000;
  state.ticks += 1;
  state.elapsedMs += dtMs;
  state.speed = Math.min(
    state.maxSpeed,
    state.startSpeed + (state.elapsedMs / 1000) * state.speedRamp
  );

  const runner = state.runner;
  if (!runner.grounded) {
    runner.vy += state.gravity * dt;
    runner.y += runner.vy * dt;
    if (runner.y >= state.groundY) {
      runner.y = state.groundY;
      runner.vy = 0;
      runner.grounded = true;
    }
  } else {
    runner.y = state.groundY;
    runner.vy = 0;
  }

  const dx = state.speed * dt;
  state.distance += dx;
  state.score = Math.floor(state.distance / 10);

  for (const obstacle of state.obstacles) obstacle.x -= dx;
  state.obstacles = state.obstacles.filter(
    (obstacle) => obstacle.x + obstacle.width > -OFFSCREEN_PAD
  );

  state.spawnIn -= dx;
  if (state.spawnIn <= 0) {
    spawnObstacle(state, rng);
    state.spawnIn += nextGap(state, rng);
  }

  const runnerBox = playerHitbox(state);
  if (state.obstacles.some((obstacle) => intersects(runnerBox, obstacle))) {
    state.status = 'over';
    state.runner.ducking = false;
  }

  return state;
}
