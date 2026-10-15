/** Proofreader v3: deterministic, serializable 3D gameplay. No DOM, GPU, clocks, or audio. */
import type { RunOptions, RunResult, RunStatus } from './arcade';
import { createLevel, type EnemyKind, type ProofLevel } from './proofreaderLevels';
import {
  add,
  compileWorld,
  direction,
  distance,
  findWorldPath,
  rayBox,
  rayDistance,
  resolveBody,
  moveBody,
  scale,
  subtract,
  unit,
  v3,
  visible,
  type DynamicBox,
  type Vec3,
} from './proofreaderWorld';
export { createLevel } from './proofreaderLevels';
export { compileWorld, direction, distance, findWorldPath, v3 } from './proofreaderWorld';
export type { Vec3, ProofLevel, EnemyKind };

export type WeaponId = 'carbine' | 'scatter' | 'pulse';
export const WEAPONS = {
  carbine: {
    name: 'Precision carbine',
    capacity: 24,
    reserve: 120,
    damage: 18,
    pellets: 1,
    cooldown: 0.16,
    reload: 1.2,
    range: 46,
    spread: 0.004,
  },
  scatter: {
    name: 'Scatter emitter',
    capacity: 6,
    reserve: 30,
    damage: 9,
    pellets: 7,
    cooldown: 0.8,
    reload: 1.6,
    range: 15,
    spread: 0.075,
  },
  pulse: {
    name: 'Pulse caster',
    capacity: 3,
    reserve: 15,
    damage: 75,
    pellets: 1,
    cooldown: 1.1,
    reload: 1.8,
    range: 40,
    spread: 0,
  },
} as const;
export const WEAPON_IDS: WeaponId[] = ['carbine', 'scatter', 'pulse'];
export const TUNING = {
  playerRadius: 0.3,
  playerHeight: 1.75,
  eyeHeight: 1.58,
  moveSpeed: 4.5,
  sprintSpeed: 6.5,
  gravity: 22,
  jumpSpeed: 7,
  turnSpeed: 2.1,
  maxHealth: 100,
  maxEnemies: 16,
  maxProjectiles: 48,
  maxEffects: 48,
  maxPickups: 24,
} as const;
export interface Player {
  position: Vec3;
  previous: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  health: number;
  grounded: boolean;
  coyote: number;
  jumpBuffer: number;
  jumpHeld: boolean;
  weapon: WeaponId;
  magazines: Record<WeaponId, number>;
  reserves: Record<WeaponId, number>;
  reloading: number;
  cooldown: number;
}
export interface Enemy {
  id: number;
  kind: EnemyKind;
  position: Vec3;
  previous: Vec3;
  velocity: Vec3;
  hp: number;
  maxHp: number;
  alive: boolean;
  yaw: number;
  attackIn: number;
  windup: number;
  attacking: boolean;
  charge: Vec3 | null;
  chargeFor: number;
  hurtFor: number;
  path: Vec3[];
  pathIn: number;
  phase: number;
}
export interface ProofProjectile {
  id: number;
  position: Vec3;
  previous: Vec3;
  velocity: Vec3;
  life: number;
  hostile: boolean;
  damage: number;
  radius: number;
  shot: number;
}
export interface ProofEffect {
  id: number;
  kind: 'tracer' | 'impact' | 'blast' | 'hit' | 'pickup';
  position: Vec3;
  end: Vec3;
  life: number;
  duration: number;
  hostile: boolean;
}
export interface ProofPickup {
  id: number;
  position: Vec3;
  kind: 'ammo' | 'health';
  taken: boolean;
}
export interface StepInput {
  forward: number;
  strafe: number;
  turn: number;
  fire: boolean;
  look?: number;
  jump?: boolean;
  sprint?: boolean;
  reload?: boolean;
  interact?: boolean;
  weapon?: WeaponId;
}
export const IDLE_INPUT: StepInput = { forward: 0, strafe: 0, turn: 0, fire: false };
interface MissionState {
  triggered: number[];
  objectives: number[];
  checkpoints: number[];
  crates: { id: number; hp: number }[];
  holdout: number;
  holdoutSpawned: boolean;
  holdoutWaves: number;
  exitOpen: boolean;
  objectiveTimes: Record<number, number>;
}
export interface GameState {
  status: RunStatus;
  run: RunOptions;
  level: ProofLevel;
  seed: number;
  rngState: number;
  time: number;
  runTime: number;
  player: Player;
  enemies: Enemy[];
  projectiles: ProofProjectile[];
  pickups: ProofPickup[];
  effects: ProofEffect[];
  mission: MissionState;
  score: number;
  kills: number;
  shots: number;
  hits: number;
  damageTaken: number;
  wave: number;
  aimAssist: boolean;
  events: string[];
  lastEvent: string;
  nextId: number;
  muzzleFor: number;
  hitFor: number;
  damageFor: number;
  retries: number;
  checkpoint: { label: string; data: Snapshot } | null;
  notice: string;
  intermission: number;
  lastDamageYaw: number;
  context: string;
  interactHeld: boolean;
}
type Snapshot = Omit<GameState, 'level' | 'checkpoint' | 'runTime' | 'retries'>;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function random(s: GameState) {
  s.rngState = (s.rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rngState ^ (s.rngState >>> 15), 1 | s.rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const normalizeAngle = (a: number) =>
  ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
export const eye = (s: GameState) => add(s.player.position, v3(0, TUNING.eyeHeight, 0));
export const enemyCenter = (e: Enemy) =>
  add(e.position, v3(0, e.kind === 'guardian' ? 1.7 : e.kind === 'flyer' ? 0.35 : 0.8, 0));
const radius = (e: Enemy) =>
  e.kind === 'guardian' ? 1.3 : e.kind === 'charger' ? 0.6 : e.kind === 'flyer' ? 0.55 : 0.45;
const maxHp: Record<EnemyKind, number> = {
  scout: 36,
  charger: 90,
  sentry: 108,
  flyer: 54,
  guardian: 180,
};
function emit(s: GameState, event: string) {
  s.lastEvent = event;
  if (s.events.length < 32) s.events.push(event);
}
function effect(
  s: GameState,
  kind: ProofEffect['kind'],
  position: Vec3,
  end = position,
  hostile = false
) {
  const duration = kind === 'blast' ? 0.5 : kind === 'tracer' ? 0.085 : 0.25;
  if (s.effects.length >= TUNING.maxEffects) s.effects.shift();
  s.effects.push({
    id: s.nextId++,
    kind,
    position: { ...position },
    end: { ...end },
    duration,
    life: duration,
    hostile,
  });
}
export function createGame(seed = 1, options?: Partial<RunOptions>, level?: ProofLevel): GameState {
  const run: RunOptions = {
    mode: 'campaign',
    stage: 1,
    difficulty: 'standard',
    seed: seed >>> 0,
    ...options,
  };
  const world = level ?? createLevel(run.mode === 'classic' ? (seed % 6) + 1 : run.stage);
  const position = { ...world.spawn };
  const magazines = {
    carbine: WEAPONS.carbine.capacity,
    scatter: WEAPONS.scatter.capacity,
    pulse: WEAPONS.pulse.capacity,
  };
  const reserves = {
    carbine: WEAPONS.carbine.reserve,
    scatter: WEAPONS.scatter.reserve,
    pulse: WEAPONS.pulse.reserve,
  };
  compileWorld(world);
  return {
    status: 'ready',
    run,
    level: world,
    seed: run.seed,
    rngState: run.seed | 0,
    time: 0,
    runTime: 0,
    player: {
      position,
      previous: { ...position },
      velocity: v3(),
      yaw: 0,
      pitch: 0,
      health: 100,
      grounded: false,
      coyote: 0,
      jumpBuffer: 0,
      jumpHeld: false,
      weapon: 'carbine',
      magazines,
      reserves,
      reloading: 0,
      cooldown: 0,
    },
    enemies: [],
    projectiles: [],
    pickups: [],
    effects: [],
    mission: {
      triggered: [],
      objectives: [],
      checkpoints: [],
      crates: world.crates.map((_, i) => ({ id: i, hp: 36 })),
      holdout: 0,
      holdoutSpawned: false,
      holdoutWaves: 0,
      exitOpen: false,
      objectiveTimes: {},
    },
    score: 0,
    kills: 0,
    shots: 0,
    hits: 0,
    damageTaken: 0,
    wave: 0,
    aimAssist: false,
    events: [],
    lastEvent: 'none',
    nextId: 1,
    muzzleFor: 0,
    hitFor: 0,
    damageFor: 0,
    retries: 0,
    checkpoint: null,
    notice: 'All three tools are ready. Find the first encounter.',
    intermission: 0,
    lastDamageYaw: 0,
    context: '',
    interactHeld: false,
  };
}
export function start(s: GameState) {
  if (s.status !== 'ready' && s.status !== 'paused') return;
  const fresh = s.status === 'ready';
  s.status = 'playing';
  if (fresh) {
    saveCheckpoint(s, 'Mission entry');
    if (s.run.mode === 'classic') spawnWave(s);
  }
}
export function pause(s: GameState) {
  if (s.status === 'playing') s.status = 'paused';
}
export function turnBy(s: GameState, yaw: number, pitch = 0) {
  if (s.status !== 'playing') return;
  if (Number.isFinite(yaw))
    s.player.yaw = normalizeAngle(s.player.yaw + Math.max(-Math.PI, Math.min(Math.PI, yaw)));
  if (Number.isFinite(pitch))
    s.player.pitch = Math.max(-1.38, Math.min(1.38, s.player.pitch + pitch));
}
export function setAimAssist(s: GameState, on: boolean) {
  s.aimAssist = Boolean(on);
}
export function dynamicBoxes(s: GameState): DynamicBox[] {
  return [
    ...s.level.doors
      .map((d, i) => ({ d, i, fraction: doorOpenFraction(s, i) }))
      .filter(({ fraction }) => fraction < 1)
      .map(({ d, i, fraction }) => ({
        id: -i - 1,
        position: add(d.position, v3(0, (d.size.y + 0.4) * fraction, 0)),
        size: d.size,
      })),
    ...s.mission.crates
      .filter((c) => c.hp > 0)
      .map((c) => ({
        id: c.id,
        position: add(s.level.crates[c.id], v3(0, 0.55, 0)),
        size: v3(1.1, 1.1, 1.1),
      })),
  ];
}
export function doorOpenFraction(s: GameState, index: number): number {
  const relay = s.level.doors[index].relay;
  if (!s.mission.objectives.includes(relay)) return 0;
  const time = s.mission.objectiveTimes[relay];
  if (time === undefined) return 1;
  const t = Math.max(0, Math.min(1, (s.time - time) / 0.6));
  return t * t * (3 - 2 * t);
}
export function pathTo(s: GameState, to: Vec3, from = s.player.position): Vec3[] {
  return findWorldPath(compileWorld(s.level), from, to, dynamicBoxes(s));
}
export function hasLineOfSight(s: GameState, a: Vec3, b: Vec3) {
  return visible(compileWorld(s.level), a, b, dynamicBoxes(s));
}
export function switchWeapon(s: GameState, id: WeaponId) {
  if (s.status !== 'playing' || !WEAPON_IDS.includes(id) || s.player.weapon === id) return;
  s.player.weapon = id;
  s.player.reloading = 0;
  s.player.cooldown = Math.max(s.player.cooldown, 0.18);
  emit(s, 'switch');
}
export function reload(s: GameState) {
  const p = s.player,
    w = WEAPONS[p.weapon];
  if (
    s.status !== 'playing' ||
    p.reloading > 0 ||
    p.magazines[p.weapon] >= w.capacity ||
    p.reserves[p.weapon] <= 0
  )
    return false;
  p.reloading = w.reload;
  emit(s, 'reload');
  return true;
}
function refill(s: GameState) {
  for (const id of WEAPON_IDS) {
    s.player.magazines[id] = WEAPONS[id].capacity;
    s.player.reserves[id] = WEAPONS[id].reserve;
  }
}
function sphereRay(origin: Vec3, dir: Vec3, center: Vec3, r: number): number {
  const delta = subtract(center, origin),
    along = delta.x * dir.x + delta.y * dir.y + delta.z * dir.z;
  const d2 = delta.x ** 2 + delta.y ** 2 + delta.z ** 2 - along ** 2;
  if (d2 > r * r || along < 0) return Infinity;
  return Math.max(0, along - Math.sqrt(Math.max(0, r * r - d2)));
}
function hurtEnemy(s: GameState, e: Enemy, damage: number) {
  if (!e.alive) return false;
  if (e.kind === 'guardian' && !s.mission.objectives.includes(e.phase + 1)) return false;
  if (e.kind === 'sentry') {
    const toward = unit(subtract(s.player.position, e.position)),
      facing = direction(e.yaw);
    if (toward.x * facing.x + toward.z * facing.z > 0.8 && e.windup <= 0) damage *= 0.45;
  }
  e.hp -= damage;
  e.hurtFor = 0.16;
  s.hitFor = 0.13;
  emit(s, 'hit');
  if (e.hp > 0) return true;
  if (e.kind === 'guardian' && e.phase < 2) {
    e.phase++;
    e.hp = e.maxHp;
    e.attacking = false;
    e.windup = 0;
    e.attackIn = 2;
    s.score += 100;
    s.notice = `Guardian phase ${e.phase + 1}: reach shield relay ${e.phase + 1}.`;
    emit(s, 'wave');
  } else {
    e.alive = false;
    s.kills++;
    s.score += e.kind === 'guardian' ? 500 : e.kind === 'scout' ? 30 : 50;
    emit(s, 'kill');
    effect(s, 'blast', enemyCenter(e));
    if (s.pickups.length < TUNING.maxPickups && e.kind !== 'flyer' && e.kind !== 'guardian')
      s.pickups.push({
        id: s.nextId++,
        position: { ...e.position },
        kind: random(s) < 0.3 ? 'health' : 'ammo',
        taken: false,
      });
  }
  return true;
}
function damageCrate(s: GameState, id: number, damage: number) {
  const crate = s.mission.crates.find((c) => c.id === id);
  if (!crate || crate.hp <= 0) return;
  crate.hp -= damage;
  if (crate.hp <= 0) {
    if (s.pickups.length < TUNING.maxPickups)
      s.pickups.push({
        id: s.nextId++,
        position: { ...s.level.crates[id] },
        kind: 'ammo',
        taken: false,
      });
    effect(s, 'blast', add(s.level.crates[id], v3(0, 0.5, 0)));
    emit(s, 'pickup');
  }
}
export function fire(s: GameState): boolean {
  const p = s.player,
    w = WEAPONS[p.weapon];
  if (s.status !== 'playing' || p.cooldown > 0 || p.reloading > 0) return false;
  if (p.magazines[p.weapon] <= 0) {
    if (!reload(s)) {
      p.cooldown = 0.25;
      emit(s, 'empty');
    }
    return false;
  }
  if (s.run.mode !== 'practice') p.magazines[p.weapon]--;
  p.cooldown = w.cooldown;
  s.muzzleFor = 0.08;
  s.shots++;
  emit(s, p.weapon === 'pulse' ? 'pulse' : p.weapon === 'scatter' ? 'scatter' : 'fire');
  const origin = eye(s),
    world = compileWorld(s.level),
    boxes = dynamicBoxes(s);
  let central = direction(p.yaw, p.pitch);
  if (s.aimAssist) {
    const targets = s.enemies
      .filter(
        (e) =>
          e.alive &&
          distance(origin, enemyCenter(e)) < w.range &&
          hasLineOfSight(s, origin, enemyCenter(e))
      )
      .map((e) => ({ e, d: unit(subtract(enemyCenter(e), origin)) }))
      .filter(({ d }) => d.x * central.x + d.y * central.y + d.z * central.z > Math.cos(0.075))
      .sort((a, b) => distance(origin, enemyCenter(a.e)) - distance(origin, enemyCenter(b.e)));
    if (targets[0]) central = targets[0].d;
  }
  if (p.weapon === 'pulse') {
    if (s.projectiles.length < TUNING.maxProjectiles)
      s.projectiles.push({
        id: s.nextId++,
        position: { ...origin },
        previous: { ...origin },
        velocity: scale(central, 19),
        life: 2.5,
        hostile: false,
        damage: w.damage,
        radius: 0.16,
        shot: s.shots,
      });
    return true;
  }
  let connected = false;
  for (let i = 0; i < w.pellets; i++) {
    const dir =
      w.pellets === 1
        ? central
        : unit(
            add(
              central,
              v3(
                (random(s) - 0.5) * w.spread * 2,
                (random(s) - 0.5) * w.spread * 2,
                (random(s) - 0.5) * w.spread * 2
              )
            )
          );
    let limit = rayDistance(world, origin, dir, w.range, boxes),
      target: Enemy | null = null,
      crateId: number | null = null;
    for (const box of boxes)
      if (box.id >= 0 && Math.abs(rayBox(origin, dir, box, w.range) - limit) < 0.001)
        crateId = box.id;
    for (const enemy of s.enemies) {
      if (!enemy.alive) continue;
      const d = sphereRay(origin, dir, enemyCenter(enemy), radius(enemy));
      if (d < limit) {
        limit = d;
        target = enemy;
        crateId = null;
      }
    }
    const end = add(origin, scale(dir, limit));
    if (i < 3) effect(s, 'tracer', origin, end);
    effect(s, 'impact', end);
    if (target) connected = hurtEnemy(s, target, w.damage) || connected;
    else if (crateId !== null) damageCrate(s, crateId, w.damage);
  }
  if (connected) s.hits++;
  return true;
}
function hurtPlayer(s: GameState, damage: number, source: Vec3) {
  if (s.run.mode === 'practice' || s.status !== 'playing') return;
  const amount = damage * (s.run.difficulty === 'expert' ? 1.4 : 1),
    announce = s.damageFor <= 0;
  s.player.health = Math.max(0, s.player.health - amount);
  s.damageTaken += amount;
  s.damageFor = 0.35;
  s.lastDamageYaw = Math.atan2(source.x - s.player.position.x, -(source.z - s.player.position.z));
  if (announce) emit(s, 'hurt');
  if (s.player.health <= 0) {
    s.status = 'over';
    s.notice = 'Integrity depleted. Retry your checkpoint or restart for mastery.';
    emit(s, 'over');
  }
}
function spawn(s: GameState, kind: EnemyKind, position: Vec3) {
  if (s.enemies.filter((e) => e.alive).length >= TUNING.maxEnemies) return;
  const resolved =
    kind === 'flyer'
      ? position
      : resolveBody(
          compileWorld(s.level),
          position,
          v3(),
          kind === 'guardian' ? 3.4 : 1.6,
          kind === 'guardian' ? 1.1 : 0.4,
          dynamicBoxes(s)
        ).position;
  s.enemies.push({
    id: s.nextId++,
    kind,
    position: { ...resolved },
    previous: { ...resolved },
    velocity: v3(),
    hp: maxHp[kind],
    maxHp: maxHp[kind],
    alive: true,
    yaw: 0,
    attackIn: 1.3,
    windup: 0,
    attacking: false,
    charge: null,
    chargeFor: 0,
    hurtFor: 0,
    path: [],
    pathIn: 0,
    phase: 0,
  });
}
function spawnWave(s: GameState) {
  s.wave++;
  const nodes = compileWorld(s.level).nodes.filter((n) => distance(n, s.player.position) > 10);
  for (let i = 0; i < Math.min(12, 3 + s.wave); i++) {
    const node = nodes[Math.floor(random(s) * nodes.length)];
    const kind = (['scout', 'charger', 'sentry', 'flyer'] as const)[i % Math.min(4, 1 + s.wave)];
    if (node) spawn(s, kind, v3(node.x, node.y + (kind === 'flyer' ? 1 : 0), node.z));
  }
  s.intermission = 0;
  emit(s, 'wave');
}
function hostileShot(s: GameState, e: Enemy, dir: Vec3, offset = 0) {
  if (s.projectiles.length >= TUNING.maxProjectiles) return;
  const heading = direction(Math.atan2(dir.x, -dir.z) + offset, Math.asin(dir.y));
  const origin = add(enemyCenter(e), scale(heading, radius(e) + 0.15));
  s.projectiles.push({
    id: s.nextId++,
    position: origin,
    previous: { ...origin },
    velocity: scale(heading, e.kind === 'guardian' ? 9 : 8),
    life: 5,
    hostile: true,
    damage: e.kind === 'guardian' ? 15 : 10,
    radius: 0.16,
    shot: 0,
  });
}
function updateEnemies(s: GameState, dt: number) {
  const world = compileWorld(s.level),
    boxes = dynamicBoxes(s),
    expert = s.run.difficulty === 'expert' ? 1.15 : 1;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    e.previous = { ...e.position };
    e.hurtFor = Math.max(0, e.hurtFor - dt);
    e.attackIn -= dt;
    e.pathIn -= dt;
    const center = enemyCenter(e),
      delta = subtract(eye(s), center),
      d = distance(center, eye(s));
    const canSee = visible(world, center, eye(s), boxes);
    e.yaw = Math.atan2(delta.x, -delta.z);
    if (e.chargeFor > 0 && e.charge) {
      e.chargeFor -= dt;
      const next = add(e.position, scale(e.charge, 7 * dt));
      const support = rayDistance(world, add(next, v3(0, 0.5, 0)), v3(0, -1, 0), 1.2);
      if (support >= 1.2) e.chargeFor = 0;
      else e.position = resolveBody(world, next, e.velocity, 1.6, 0.4, boxes).position;
      if (distance(e.position, s.player.position) < 1.1 && canSee) {
        hurtPlayer(s, 20, e.position);
        e.chargeFor = 0;
      }
      continue;
    }
    if (e.attacking) {
      e.windup -= dt;
      if (e.windup <= 0) {
        e.attacking = false;
        e.attackIn = e.kind === 'guardian' ? 1.8 : 2.2;
        if (e.kind === 'charger') {
          e.charge ??= unit(v3(delta.x, 0, delta.z));
          e.chargeFor = 0.7;
        } else if (canSee) {
          hostileShot(s, e, unit(delta));
          if (e.kind === 'guardian' && e.phase > 0) {
            hostileShot(s, e, unit(delta), -0.18);
            hostileShot(s, e, unit(delta), 0.18);
          }
        }
      }
      continue;
    }
    if (e.attackIn <= 0 && canSee && d < (e.kind === 'charger' ? 7 : 30)) {
      e.attacking = true;
      if (e.kind === 'charger') e.charge = unit(v3(delta.x, 0, delta.z));
      e.windup = e.kind === 'guardian' ? 1.2 : e.kind === 'charger' ? 0.85 : 0.7;
      continue;
    }
    if (e.kind === 'guardian') continue;
    if (e.kind === 'flyer') {
      const desired = add(
        s.player.position,
        v3(Math.sin(s.time * 0.65 + e.id) * 5, 2.5, Math.cos(s.time * 0.65 + e.id) * 5)
      );
      const next = add(e.position, scale(unit(subtract(desired, e.position)), 1.7 * expert * dt));
      e.position = resolveBody(world, next, e.velocity, 0.7, 0.35, boxes).position;
      continue;
    }
    if (d < 1.2 && canSee) {
      if (e.attackIn <= 0) {
        hurtPlayer(s, 8, e.position);
        e.attackIn = 1;
      }
      continue;
    }
    if (canSee && d < (e.kind === 'sentry' ? 9 : 4) && d > 2.2) continue;
    if (e.pathIn <= 0) {
      e.path = findWorldPath(world, e.position, s.player.position, boxes);
      e.pathIn = 0.8 + (e.id % 5) * 0.08;
    }
    while (
      e.path.length &&
      Math.hypot(e.path[0].x - e.position.x, e.path[0].z - e.position.z) < 0.5
    )
      e.path.shift();
    const target = e.path[0];
    if (target) {
      const heading = unit(v3(target.x - e.position.x, 0, target.z - e.position.z)),
        speed = (e.kind === 'charger' ? 2.1 : e.kind === 'sentry' ? 1.1 : 1.8) * expert;
      e.velocity.x = heading.x * speed;
      e.velocity.z = heading.z * speed;
    } else {
      e.velocity.x = 0;
      e.velocity.z = 0;
    }
    e.velocity.y -= TUNING.gravity * dt;
    e.position = resolveBody(
      world,
      add(e.position, scale(e.velocity, dt)),
      e.velocity,
      1.6,
      0.4,
      boxes
    ).position;
  }
  for (let i = 0; i < s.enemies.length; i++)
    for (let j = i + 1; j < s.enemies.length; j++) {
      const a = s.enemies[i],
        b = s.enemies[j];
      if (
        !a.alive ||
        !b.alive ||
        a.kind === 'guardian' ||
        b.kind === 'guardian' ||
        Math.abs(a.position.y - b.position.y) > 0.8
      )
        continue;
      const d = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
      if (d >= 0.8 || d < 0.001) continue;
      const correction = scale(
        unit(v3(a.position.x - b.position.x, 0, a.position.z - b.position.z)),
        Math.min(0.02, (0.8 - d) * 0.2)
      );
      a.position = resolveBody(
        world,
        add(a.position, correction),
        a.velocity,
        1.6,
        0.4,
        boxes
      ).position;
      b.position = resolveBody(
        world,
        subtract(b.position, correction),
        b.velocity,
        1.6,
        0.4,
        boxes
      ).position;
    }
}
function updateProjectiles(s: GameState, dt: number) {
  const world = compileWorld(s.level),
    boxes = dynamicBoxes(s);
  for (const p of s.projectiles) {
    p.previous = { ...p.position };
    p.life -= dt;
    if (p.life <= 0) continue;
    const delta = scale(p.velocity, dt),
      length = Math.hypot(delta.x, delta.y, delta.z),
      dir = unit(delta);
    let travel = rayDistance(world, p.position, dir, length + p.radius, boxes) - p.radius;
    let target: Enemy | null = null;
    if (p.hostile) {
      const hit = sphereRay(
        p.position,
        dir,
        add(s.player.position, v3(0, 0.9, 0)),
        0.65 + p.radius
      );
      if (hit <= Math.min(length, travel)) {
        p.position = add(p.position, scale(dir, Math.max(0, hit)));
        hurtPlayer(s, p.damage, p.previous);
        p.life = 0;
        effect(s, 'impact', p.position, p.position, true);
        continue;
      }
    } else
      for (const e of s.enemies)
        if (e.alive) {
          const hit = sphereRay(p.position, dir, enemyCenter(e), radius(e) + p.radius);
          if (hit < Math.min(length, travel)) {
            travel = hit;
            target = e;
          }
        }
    if (travel < length) {
      p.position = add(p.position, scale(dir, Math.max(0, travel)));
      p.life = 0;
      effect(s, p.hostile ? 'impact' : 'blast', p.position, p.position, p.hostile);
      if (!p.hostile) {
        let connected = false;
        for (const e of s.enemies)
          if (e.alive) {
            const center = enemyCenter(e),
              d = distance(p.position, center);
            if (
              (e === target || d < 3) &&
              visible(world, add(p.position, scale(dir, -0.06)), center, boxes)
            )
              connected = hurtEnemy(s, e, p.damage * Math.max(0.3, 1 - d / 4)) || connected;
          }
        if (connected) s.hits++;
        for (const box of boxes)
          if (
            box.id >= 0 &&
            distance(box.position, p.position) < 3 &&
            visible(
              world,
              p.position,
              box.position,
              boxes.filter((b) => b.id !== box.id)
            )
          )
            damageCrate(s, box.id, p.damage);
      }
    } else p.position = add(p.position, delta);
  }
  s.projectiles = s.projectiles.filter((p) => p.life > 0);
}
export function hazardPhase(s: GameState, index: number): 'safe' | 'warning' | 'active' {
  const h = s.level.hazards[index],
    t = (s.time + h.offset) % h.period;
  return t < h.period - 2 ? 'safe' : t < h.period - 0.9 ? 'warning' : 'active';
}
function interactable(
  s: GameState
): { kind: 'terminal' | 'objective'; id: number; label: string } | null {
  for (let i = 0; i < s.level.terminals.length; i++) {
    const p = s.level.terminals[i];
    if (distance(s.player.position, p) < 2.2 && hasLineOfSight(s, eye(s), add(p, v3(0, 1.1, 0))))
      return { kind: 'terminal', id: i, label: 'Refill all ammunition' };
  }
  for (const objective of s.level.objectives) {
    if (s.mission.objectives.includes(objective.id)) continue;
    if (
      distance(s.player.position, objective.position) > 2.3 ||
      !hasLineOfSight(s, eye(s), add(objective.position, v3(0, 1.1, 0)))
    )
      continue;
    return { kind: 'objective', id: objective.id, label: objective.label };
  }
  return null;
}
export function interact(s: GameState): boolean {
  if (s.status !== 'playing') return false;
  const item = interactable(s);
  if (!item) return false;
  if (item.kind === 'terminal') {
    refill(s);
    s.notice = 'All three weapons resupplied. Terminals never award points.';
    emit(s, 'pickup');
    return true;
  }
  const objective = s.level.objectives.find((o) => o.id === item.id)!;
  if (objective.requires && !s.mission.objectives.includes(objective.requires)) {
    s.notice = 'Restore bridge power at relay 1 first.';
    return false;
  }
  if (objective.kind === 'shield') {
    const boss = s.enemies.find((e) => e.alive && e.kind === 'guardian');
    if (!boss || boss.phase + 1 !== objective.id) {
      s.notice = 'This shield relay belongs to a later guardian phase.';
      return false;
    }
  } else if (s.enemies.some((e) => e.alive && distance(e.position, s.player.position) < 6)) {
    s.notice = 'Clear nearby threats before using the console.';
    return false;
  }
  s.mission.objectives.push(item.id);
  s.mission.objectiveTimes[item.id] = s.time;
  s.score += 100;
  emit(s, 'relay');
  effect(s, 'pickup', objective.position);
  s.notice =
    objective.kind === 'shield'
      ? 'Guardian core exposed. Choose your firing position.'
      : `${objective.label} secured. Follow the next objective marker.`;
  return true;
}
function saveCheckpoint(s: GameState, label: string) {
  const { level: _level, checkpoint: _checkpoint, runTime: _time, retries: _retries, ...data } = s;
  s.checkpoint = { label, data: structuredClone(data) };
  emit(s, 'checkpoint');
}
export function retryCheckpoint(s: GameState): boolean {
  if (s.status !== 'over' || !s.checkpoint || s.run.mode === 'classic') return false;
  const checkpoint = s.checkpoint,
    time = s.runTime,
    retries = s.retries + 1;
  Object.assign(s, structuredClone(checkpoint.data));
  s.checkpoint = checkpoint;
  s.runTime = time;
  s.retries = retries;
  s.status = 'paused';
  s.player.previous = { ...s.player.position };
  s.player.velocity = v3();
  s.player.jumpHeld = false;
  s.player.jumpBuffer = 0;
  s.interactHeld = false;
  s.effects = [];
  s.events = [];
  s.notice = 'Checkpoint restored · completion unlocks the next sector, but this run is unranked.';
  return true;
}
function updateMission(s: GameState, dt: number) {
  if (s.run.mode === 'classic') {
    if (!s.enemies.some((e) => e.alive)) {
      s.intermission += dt;
      if (s.intermission >= 2.5) spawnWave(s);
    }
    return;
  }
  for (const encounter of s.level.encounters) {
    if (
      s.mission.triggered.includes(encounter.id) ||
      distance(s.player.position, encounter.trigger) > encounter.radius
    )
      continue;
    s.mission.triggered.push(encounter.id);
    s.wave = s.mission.triggered.length;
    for (const e of encounter.enemies) spawn(s, e.kind, e.position);
    emit(s, 'wave');
    s.notice = `Encounter ${encounter.id}: use cover and watch the attack indicators.`;
  }
  const alive = s.enemies.some(
    (e) =>
      e.alive &&
      distance(e.position, s.player.position) < 12 &&
      hasLineOfSight(s, eye(s), enemyCenter(e))
  );
  for (let i = 0; i < s.level.checkpoints.length; i++) {
    if (
      s.mission.checkpoints.includes(i) ||
      distance(s.player.position, s.level.checkpoints[i]) > 1.6 ||
      alive ||
      s.projectiles.some((p) => p.hostile && distance(p.position, s.player.position) < 10)
    )
      continue;
    s.mission.checkpoints.push(i);
    s.player.health = 100;
    refill(s);
    saveCheckpoint(s, `Safe sector ${i + 1}`);
    s.notice = `Checkpoint ${i + 1} saved · integrity and ammunition restored.`;
  }
  const objectivesDone = s.mission.objectives.length === s.level.objectives.length;
  if (s.level.id === 5 && objectivesDone && distance(s.player.position, v3(0, 0, 6)) < 8.5) {
    const wavesDue = s.mission.holdout >= 34 ? 3 : s.mission.holdout >= 18 ? 2 : 1;
    if (s.mission.holdoutWaves < wavesDue) {
      s.mission.holdoutSpawned = true;
      s.mission.holdoutWaves++;
      for (const p of [v3(-8, 0, 12), v3(8, 0, 12), v3(0, 5, -10)])
        spawn(s, p.y > 0 ? 'flyer' : 'scout', p);
      emit(s, 'wave');
    }
    s.mission.holdout = Math.min(45, s.mission.holdout + dt);
  }
  s.mission.exitOpen =
    objectivesDone &&
    s.mission.triggered.length === s.level.encounters.length &&
    !s.enemies.some((e) => e.alive) &&
    (s.level.id !== 5 || s.mission.holdout >= 45);
  if (s.mission.exitOpen && distance(s.player.position, s.level.exit) < 1.5) {
    s.status = 'won';
    s.score += 300;
    emit(s, 'won');
  }
}
export function objectiveTarget(s: GameState): { position: Vec3; label: string } {
  if (s.run.mode === 'classic')
    return {
      position: s.level.terminals[0],
      label: `Survive wave ${s.wave} · ammunition terminal`,
    };
  if (s.mission.exitOpen)
    return {
      position: s.level.exit,
      label: s.level.id === 4 ? 'Deliver packets to the recovery dock' : 'Exit airlock is open',
    };
  const encounter = s.level.encounters.find((e) => !s.mission.triggered.includes(e.id));
  const boss = s.enemies.find((e) => e.alive && e.kind === 'guardian');
  const objective = s.level.objectives.find(
    (o) =>
      !s.mission.objectives.includes(o.id) &&
      (!o.requires || s.mission.objectives.includes(o.requires)) &&
      (o.kind !== 'shield' || boss?.phase === o.id - 1)
  );
  const enemy = s.enemies
    .filter((e) => e.alive)
    .sort(
      (a, b) => distance(a.position, s.player.position) - distance(b.position, s.player.position)
    )[0];
  if (boss && objective && !s.mission.objectives.includes(boss.phase + 1))
    return { position: objective.position, label: `Disable ${objective.label.toLowerCase()}` };
  if (enemy)
    return {
      position: enemy.position,
      label: enemy.kind === 'guardian' ? 'Guardian core exposed' : 'Clear the active encounter',
    };
  if (objective) return { position: objective.position, label: objective.label };
  if (encounter)
    return { position: encounter.trigger, label: `Investigate encounter ${encounter.id}` };
  return {
    position: s.level.id === 5 ? v3(0, 0, 6) : s.level.exit,
    label:
      s.level.id === 5
        ? `${distance(s.player.position, v3(0, 0, 6)) >= 8.5 ? 'Reach control zone' : 'Defend control zone'} · ${Math.ceil(45 - s.mission.holdout)} s`
        : 'Return to the airlock',
  };
}
export function step(s: GameState, elapsed: number, input: StepInput = IDLE_INPUT) {
  if (s.status !== 'playing' || !Number.isFinite(elapsed) || elapsed <= 0) return;
  const dt = Math.min(elapsed, 1 / 30);
  s.events = [];
  s.time += dt;
  s.runTime += dt;
  s.effects = s.effects.filter((e) => (e.life -= dt) > 0);
  s.muzzleFor = Math.max(0, s.muzzleFor - dt);
  s.hitFor = Math.max(0, s.hitFor - dt);
  s.damageFor = Math.max(0, s.damageFor - dt);
  const p = s.player;
  p.previous = { ...p.position };
  p.cooldown = Math.max(0, p.cooldown - dt);
  if (p.reloading > 0) {
    p.reloading = Math.max(0, p.reloading - dt);
    if (!p.reloading) {
      const n = Math.min(WEAPONS[p.weapon].capacity - p.magazines[p.weapon], p.reserves[p.weapon]);
      p.magazines[p.weapon] += n;
      p.reserves[p.weapon] -= n;
    }
  }
  turnBy(
    s,
    (Number.isFinite(input.turn) ? input.turn : 0) * TUNING.turnSpeed * dt,
    (Number.isFinite(input.look) ? input.look! : 0) * TUNING.turnSpeed * dt
  );
  if (input.weapon) switchWeapon(s, input.weapon);
  if (input.reload) reload(s);
  const forward = Math.max(-1, Math.min(1, Number.isFinite(input.forward) ? input.forward : 0)),
    strafe = Math.max(-1, Math.min(1, Number.isFinite(input.strafe) ? input.strafe : 0));
  const n = Math.max(1, Math.hypot(forward, strafe)),
    speed = input.sprint ? TUNING.sprintSpeed : TUNING.moveSpeed;
  const f = direction(p.yaw),
    side = direction(p.yaw + Math.PI / 2),
    blend = 1 - Math.exp(-(p.grounded ? 18 : 5) * dt);
  p.velocity.x += (((f.x * forward + side.x * strafe) / n) * speed - p.velocity.x) * blend;
  p.velocity.z += (((f.z * forward + side.z * strafe) / n) * speed - p.velocity.z) * blend;
  p.coyote = p.grounded ? 0.1 : Math.max(0, p.coyote - dt);
  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (input.jump && !p.jumpHeld) p.jumpBuffer = 0.12;
  p.jumpHeld = Boolean(input.jump);
  if (p.jumpBuffer > 0 && p.coyote > 0) {
    p.velocity.y = TUNING.jumpSpeed;
    p.grounded = false;
    p.coyote = 0;
    p.jumpBuffer = 0;
    emit(s, 'jump');
  }
  p.velocity.y -= TUNING.gravity * dt;
  const resolved = moveBody(
    compileWorld(s.level),
    p.position,
    p.velocity,
    dt,
    p.grounded,
    dynamicBoxes(s)
  );
  p.position = resolved.position;
  p.grounded = resolved.grounded;
  if (p.position.y < -5) {
    hurtPlayer(s, 25, p.position);
    p.position = { ...s.level.spawn };
    p.previous = { ...p.position };
    p.velocity = v3();
  }
  if (input.fire) fire(s);
  updateEnemies(s, dt);
  updateProjectiles(s, dt);
  for (let i = 0; i < s.level.hazards.length; i++) {
    const h = s.level.hazards[i],
      pos = p.position;
    if (
      hazardPhase(s, i) === 'active' &&
      Math.abs(pos.x - h.position.x) < h.size.x / 2 + 0.25 &&
      Math.abs(pos.z - h.position.z) < h.size.z / 2 + 0.25 &&
      Math.abs(pos.y - h.position.y) < 1.5
    )
      hurtPlayer(s, 16 * dt, h.position);
  }
  for (const item of s.pickups)
    if (!item.taken && distance(item.position, p.position) < 1) {
      item.taken = true;
      if (item.kind === 'health') p.health = Math.min(100, p.health + 25);
      else
        for (const id of WEAPON_IDS)
          p.reserves[id] = Math.min(
            WEAPONS[id].reserve,
            p.reserves[id] + Math.ceil(WEAPONS[id].capacity * 0.75)
          );
      emit(s, 'pickup');
      effect(s, 'pickup', item.position);
    }
  s.pickups = s.pickups.filter((p) => !p.taken);
  s.enemies = s.enemies.filter((e) => e.alive);
  s.context = interactable(s)?.label ?? '';
  if (input.interact && !s.interactHeld) interact(s);
  s.interactHeld = Boolean(input.interact);
  if (s.status === 'playing') updateMission(s, dt);
}
export function proofResult(s: GameState): RunResult {
  const won = s.status === 'won',
    eligible = s.retries === 0;
  return {
    score: Math.floor(s.score),
    seconds: s.runTime,
    won,
    recordEligible: eligible,
    medals: [
      won && eligible,
      won && eligible && s.shots > 0 && s.hits / s.shots >= 0.7,
      won && eligible && s.damageTaken === 0,
    ],
    detail: `${won ? 'Sector complete' : 'Run ended'} · ${s.kills} threats · ${s.shots ? Math.round((s.hits / s.shots) * 100) : 0}% accuracy · ${s.runTime.toFixed(1)} s${eligible ? '' : ` · ${s.retries} checkpoint retries · unranked`}`,
  };
}
