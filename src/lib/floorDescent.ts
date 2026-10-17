/** Original 100-Floor Descent simulation. No browser, rendering, audio, or wall clock. */
import { courseRow, type Platform } from './floorDescentCourse';
export { courseRow } from './floorDescentCourse';
export type { Platform, PlatformKind } from './floorDescentCourse';
export type RunMode = 'classic' | 'trial' | 'remix' | 'practice';
export type Status = 'ready' | 'playing' | 'paused' | 'over' | 'won';
export interface RunOptions {
  mode: RunMode;
  seed: number;
  startFloor?: number;
}
export interface Input {
  steer: number;
  dash?: boolean;
}
export const TUNING = {
  width: 420,
  height: 600,
  rowGap: 70,
  halfWidth: 13,
  bodyHeight: 35,
  speed: 300,
  acceleration: 4200,
  drag: 4200,
  gravity: 1800,
  terminal: 900,
} as const;
export interface GameState {
  options: RunOptions;
  status: Status;
  time: number;
  worldTime: number;
  floor: number;
  camera: number;
  previousCamera: number;
  platforms: Platform[];
  nextRow: number;
  deepestRow: number;
  lastHurt: number;
  nextHeal: number;
  damageFor: number;
  cause: 'fall' | 'spikes' | 'ceiling' | '';
  events: string[];
  slowFor: number;
  pickups: { id: number; x: number; y: number; kind: 'shield' | 'slow' }[];
  player: {
    x: number;
    y: number;
    previousX: number;
    previousY: number;
    vx: number;
    vy: number;
    health: number;
    standing: number | null;
    facing: number;
    ignoreId: number;
    ignoreUntil: number;
    dashFor: number;
    dashCooldown: number;
    shield: boolean;
  };
}
export function createGame(options: RunOptions): GameState {
  const initial =
    options.mode === 'practice' && Number.isFinite(options.startFloor)
      ? Math.max(0, Math.min(80, Math.floor(options.startFloor! / 20) * 20))
      : 0;
  const row = initial * 5,
    base = courseRow(options.seed, row)[0],
    x = base.x + base.width / 2,
    y = base.y;
  const s: GameState = {
    options: { ...options, seed: options.seed >>> 0 },
    status: 'ready',
    time: 0,
    worldTime: 0,
    floor: initial,
    camera: y - 330,
    previousCamera: y - 330,
    platforms: [],
    nextRow: row - 3,
    deepestRow: row,
    lastHurt: -100,
    nextHeal: 1e12,
    damageFor: 0,
    cause: '',
    events: [],
    pickups: [],
    slowFor: 0,
    player: {
      x,
      y,
      previousX: x,
      previousY: y,
      vx: 0,
      vy: 0,
      health: 10,
      standing: row * 2,
      facing: 1,
      ignoreId: -999,
      ignoreUntil: 0,
      dashFor: 0,
      dashCooldown: 0,
      shield: false,
    },
  };
  fillCourse(s);
  if (initial) {
    const checkpoint = s.platforms.find((p) => p.id === row * 2)!;
    checkpoint.kind = 'normal';
  }
  return s;
}
function fillCourse(s: GameState) {
  while (
    330 + s.nextRow * 70 < s.camera + 1150 &&
    (s.options.mode !== 'trial' || s.nextRow <= 500)
  ) {
    const row = courseRow(s.options.seed, s.nextRow, s.options.mode === 'trial');
    s.platforms.push(...row);
    if (s.options.mode === 'remix' && s.nextRow > 0 && s.nextRow % 17 === 0 && row[0]) {
      const f = row[0];
      s.pickups.push({
        id: f.row,
        x: f.x + f.width / 2,
        y: f.y - 28,
        kind: f.row % 34 === 0 ? 'slow' : 'shield',
      });
    }
    s.nextRow++;
  }
  s.platforms = s.platforms.filter((p) => p.y > s.camera - 180);
  s.pickups = s.pickups.filter((p) => p.y > s.camera - 100);
}
export function start(s: GameState) {
  if (s.status === 'ready' || s.status === 'paused') s.status = 'playing';
}
export function pause(s: GameState) {
  if (s.status === 'playing') s.status = 'paused';
}
function damage(s: GameState, amount: number, cause: 'spikes' | 'ceiling') {
  if (s.time - s.lastHurt < 0.75) return;
  if (s.player.shield) {
    s.player.shield = false;
    s.lastHurt = s.time;
    s.events.push('shield-break');
    return;
  }
  s.player.health = Math.max(0, s.player.health - amount);
  s.lastHurt = s.time;
  s.nextHeal = s.time + 2;
  s.damageFor = 0.35;
  s.events.push('hurt');
  if (!s.player.health) {
    s.status = 'over';
    s.cause = cause;
    s.events.push('over');
  }
}
const approach = (value: number, target: number, amount: number) =>
  value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
export function step(s: GameState, input: Input, elapsed: number) {
  if (s.status !== 'playing' || !Number.isFinite(elapsed) || elapsed <= 0) return;
  const dt = Math.min(elapsed, 1 / 30),
    p = s.player;
  s.events = [];
  s.time += dt;
  if (s.options.mode === 'remix')
    s.pickups = s.pickups.filter((item) => {
      if (Math.hypot(item.x - p.x, item.y - (p.y - 18)) > 28) return true;
      if (item.kind === 'shield') p.shield = true;
      else s.slowFor = 3;
      s.events.push(item.kind);
      return false;
    });
  const worldDt = dt * (s.slowFor > 0 ? 0.65 : 1);
  s.slowFor = Math.max(0, s.slowFor - dt);
  s.worldTime += worldDt;
  s.damageFor = Math.max(0, s.damageFor - dt);
  if (s.time + 1e-8 >= s.nextHeal && p.health < 10) {
    p.health++;
    s.nextHeal += 1;
    s.events.push('heal');
  }
  s.previousCamera = s.camera;
  s.camera +=
    (90 + Math.min(s.floor, 100) + Math.min(40, Math.max(0, s.floor - 100) * 0.2)) * worldDt;
  fillCourse(s);
  p.previousX = p.x;
  p.previousY = p.y;
  const steer = Number.isFinite(input.steer) ? Math.max(-1, Math.min(1, input.steer)) : 0;
  if (steer) p.facing = Math.sign(steer);
  p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  p.dashFor = Math.max(0, p.dashFor - dt);
  if (s.options.mode === 'remix' && input.dash && p.dashCooldown === 0) {
    p.dashFor = 0.16;
    p.dashCooldown = 4;
    s.events.push('dash');
  }
  p.vx =
    p.dashFor > 0
      ? p.facing * 650
      : approach(p.vx, steer * TUNING.speed, (steer ? TUNING.acceleration : TUNING.drag) * dt);
  const floor = s.platforms.find((f) => f.id === p.standing && !f.broken);
  for (const f of s.platforms)
    if (f.kind === 'crumble' && f.touched !== null && s.worldTime - f.touched >= 0.45)
      f.broken = true;
  if (floor?.kind === 'spring' && floor.touched !== null && s.worldTime - floor.touched >= 0.12) {
    // A ~47-unit bounce stays below the previous row (70 units above),
    // avoiding involuntary loops that repeatedly carry the player upwards.
    p.standing = null;
    p.vy = -420;
    s.events.push('spring');
  }
  const belt =
    floor && p.standing !== null
      ? floor.kind === 'left'
        ? -80
        : floor.kind === 'right'
          ? 80
          : 0
      : 0;
  p.x = Math.max(26, Math.min(394, p.x + p.vx * dt + belt * worldDt));
  if (
    !floor ||
    floor.broken ||
    p.x + TUNING.halfWidth <= floor.x ||
    p.x - TUNING.halfWidth >= floor.x + floor.width
  )
    p.standing = null;
  if (p.standing !== null && floor) {
    p.y = floor.y;
    p.vy = 0;
  } else {
    p.vy = Math.min(TUNING.terminal, p.vy + TUNING.gravity * worldDt);
    p.y += p.vy * worldDt;
    const landing = s.platforms
      .filter(
        (f) =>
          !f.broken &&
          (f.id !== p.ignoreId || s.worldTime >= p.ignoreUntil) &&
          p.previousY <= f.y &&
          p.y >= f.y
      )
      .sort((a, b) => a.y - b.y)
      .find((f) => {
        const t = (f.y - p.previousY) / Math.max(0.0001, p.y - p.previousY);
        const x = p.previousX + (p.x - p.previousX) * t;
        return x + TUNING.halfWidth > f.x && x - TUNING.halfWidth < f.x + f.width;
      });
    if (landing && p.vy >= 0) {
      p.y = landing.y;
      p.vy = 0;
      p.standing = landing.id;
      s.deepestRow = Math.max(s.deepestRow, landing.row);
      s.floor = Math.floor(s.deepestRow / 5);
      landing.touched = s.worldTime;
      s.events.push('land');
      if (landing.kind === 'spikes') damage(s, 4, 'spikes');
    }
  }
  if (p.y - s.camera - TUNING.bodyHeight < 32) {
    p.ignoreId = p.standing ?? p.ignoreId;
    p.ignoreUntil = s.worldTime + 0.3;
    p.standing = null;
    p.y = s.camera + TUNING.bodyHeight + 33;
    p.vy = Math.max(150, p.vy);
    damage(s, 5, 'ceiling');
  }
  if (s.status === 'playing' && p.y - s.camera > TUNING.height + 40) {
    s.status = 'over';
    s.cause = 'fall';
    s.events.push('over');
  }
  if (s.status === 'playing' && s.options.mode === 'trial' && p.standing === 1000 && p.health > 0) {
    s.status = 'won';
    s.events.push('won');
  }
}
export function result(s: GameState) {
  return {
    floor: s.floor,
    seconds: s.time,
    won: s.status === 'won',
    eligible: s.options.mode !== 'practice',
  };
}

/** Read-only planning for the legal-input audit pilot. Never advances a live run. */
export function forecast(s: GameState, input: Input, ticks: number): GameState {
  const copy = {
    ...s,
    options: { ...s.options },
    player: { ...s.player },
    events: [],
    platforms: s.platforms.map((f) => ({ ...f })),
    pickups: s.pickups.map((p) => ({ ...p })),
  };
  for (let i = 0; i < Math.min(120, Math.max(0, ticks)); i++) step(copy, input, 1 / 120);
  return copy;
}
