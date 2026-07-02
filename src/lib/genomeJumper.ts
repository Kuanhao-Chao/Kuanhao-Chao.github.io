/**
 * Pure, deterministic Genome Jumper engine.
 *
 * World coordinates use an upward-positive Y axis. The player position is the
 * centre of their feet, and each platform's Y coordinate is its top surface.
 * Rendering, wall-clock timing, browser input, persistence, audio, and sharing
 * belong to the controller in `src/scripts/genomeJumper.ts`.
 */

export const WORLD_WIDTH = 420;
export const VIEW_HEIGHT = 600;

export const PHYSICS = {
  playerWidth: 34,
  playerHeight: 42,
  gravity: -1120,
  jumpVelocity: 720,
  springVelocity: 920,
  jetpackVelocity: 470,
  jetpackDuration: 2.25,
  horizontalAcceleration: 1750,
  horizontalDrag: 2100,
  maxHorizontalSpeed: 285,
  terminalVelocity: -900,
  projectileSpeed: 560,
  shotCooldown: 0.28,
} as const;

export type GameStatus = 'ready' | 'playing' | 'paused' | 'over';
export type PlatformKind = 'static' | 'moving' | 'breakable' | 'disappearing';
export type Base = 'A' | 'C' | 'G' | 'T';
export type PowerUpKind = 'jetpack';

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
}

export interface Platform {
  id: number;
  x: number;
  y: number;
  width: number;
  kind: PlatformKind;
  vx: number;
  removed: boolean;
  disappearAt: number | null;
  spring: boolean;
}

export interface Collectible {
  id: number;
  x: number;
  y: number;
  base: Base;
  collected: boolean;
}

export interface PowerUp {
  id: number;
  x: number;
  y: number;
  kind: PowerUpKind;
  collected: boolean;
}

export interface Enemy {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  alive: boolean;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vy: number;
  alive: boolean;
}

export interface GameState {
  seed: number;
  rngState: number;
  status: GameStatus;
  time: number;
  player: Player;
  steering: -1 | 0 | 1;
  cameraY: number;
  maxHeight: number;
  height: number;
  bonus: number;
  score: number;
  difficulty: number;
  sequence: Base[];
  platforms: Platform[];
  collectibles: Collectible[];
  powerUps: PowerUp[];
  enemies: Enemy[];
  projectiles: Projectile[];
  shotCooldown: number;
  jetpackUntil: number;
  nextId: number;
  nextPlatformY: number;
  lastPlatformX: number;
  lastPlatformWidth: number;
  lastEvent: 'none' | 'jump' | 'spring' | 'jetpack' | 'collect' | 'shot' | 'enemy' | 'over';
}

const BASES: readonly Base[] = ['A', 'C', 'G', 'T'];
const START_Y = 60;
const CAMERA_PLAYER_LINE = 0.58;
const CULL_MARGIN = 220;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Serializable, deterministic 32-bit PRNG. */
function random(state: GameState): number {
  let x = state.rngState || 0x6d2b79f5;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rngState = x >>> 0;
  return state.rngState / 4294967296;
}

function nextId(state: GameState): number {
  return state.nextId++;
}

function makePlatform(
  id: number,
  x: number,
  y: number,
  width: number,
  kind: PlatformKind = 'static'
): Platform {
  return {
    id,
    x,
    y,
    width,
    kind,
    vx: kind === 'moving' ? 48 : 0,
    removed: false,
    disappearAt: null,
    spring: false,
  };
}

function difficultyForHeight(height: number): number {
  return clamp(height / 3200, 0, 1);
}

function platformKind(state: GameState): PlatformKind {
  const d = state.difficulty;
  const roll = random(state);
  if (roll < 0.1 + d * 0.08) return 'moving';
  if (roll < 0.16 + d * 0.13) return 'breakable';
  if (roll < 0.2 + d * 0.17) return 'disappearing';
  return 'static';
}

/** Generate one platform and its optional arcade entities above the current run. */
export function generatePlatform(state: GameState): Platform {
  const d = state.difficulty;
  const gap = 62 + random(state) * (32 + d * 24);
  const y = state.nextPlatformY + gap;
  const width = Math.round(112 - d * 32 + random(state) * 18);

  // Keep consecutive centres near enough for an approachable jump. Horizontal
  // world wrapping gives an additional route at both edges.
  const previousCentre = state.lastPlatformX + state.lastPlatformWidth / 2;
  const maxShift = 125 + d * 18;
  const centre = clamp(
    previousCentre + (random(state) * 2 - 1) * maxShift,
    width / 2,
    WORLD_WIDTH - width / 2
  );
  const kind = platformKind(state);
  const platform = makePlatform(nextId(state), centre - width / 2, y, width, kind);
  if (kind === 'moving' && random(state) < 0.5) platform.vx *= -1;
  platform.spring = kind !== 'breakable' && random(state) < 0.055 + d * 0.025;
  state.platforms.push(platform);

  const entityX = clamp(centre + (random(state) * 2 - 1) * width * 0.25, 18, WORLD_WIDTH - 18);
  if (!platform.spring && random(state) < 0.36) {
    state.collectibles.push({
      id: nextId(state),
      x: entityX,
      y: y + 32,
      base: BASES[Math.floor(random(state) * BASES.length)] ?? 'A',
      collected: false,
    });
  }
  if (y > 650 && random(state) < 0.045 + d * 0.035) {
    state.powerUps.push({
      id: nextId(state),
      x: entityX,
      y: y + 38,
      kind: 'jetpack',
      collected: false,
    });
  }
  if (y > 850 && random(state) < 0.045 + d * 0.15) {
    const enemyWidth = 34;
    state.enemies.push({
      id: nextId(state),
      x: clamp(centre, enemyWidth / 2, WORLD_WIDTH - enemyWidth / 2),
      y: y + 34,
      width: enemyWidth,
      height: 30,
      vx: (random(state) < 0.5 ? -1 : 1) * (34 + d * 34),
      alive: true,
    });
  }

  state.nextPlatformY = y;
  state.lastPlatformX = platform.x;
  state.lastPlatformWidth = platform.width;
  return platform;
}

function populateAhead(state: GameState): void {
  const ceiling = state.cameraY + VIEW_HEIGHT * 1.65;
  while (state.nextPlatformY < ceiling) generatePlatform(state);
}

export function createGame(seed = 1): GameState {
  const normalizedSeed = seed >>> 0 || 1;
  const platforms = [
    makePlatform(1, 140, START_Y, 140),
    makePlatform(2, 252, 148, 112),
    makePlatform(3, 102, 238, 116),
    makePlatform(4, 246, 330, 108, 'moving'),
    makePlatform(5, 118, 424, 106),
    makePlatform(6, 258, 520, 104, 'breakable'),
    makePlatform(7, 126, 614, 104),
  ];
  const state: GameState = {
    seed: normalizedSeed,
    rngState: normalizedSeed,
    status: 'ready',
    time: 0,
    player: {
      x: WORLD_WIDTH / 2,
      y: START_Y,
      vx: 0,
      vy: 0,
      width: PHYSICS.playerWidth,
      height: PHYSICS.playerHeight,
    },
    steering: 0,
    cameraY: 0,
    maxHeight: START_Y,
    height: 0,
    bonus: 0,
    score: 0,
    difficulty: 0,
    sequence: [],
    platforms,
    collectibles: [
      { id: 8, x: 308, y: 184, base: 'A', collected: false },
      { id: 9, x: 160, y: 274, base: 'C', collected: false },
      { id: 10, x: 302, y: 366, base: 'G', collected: false },
    ],
    powerUps: [],
    enemies: [],
    projectiles: [],
    shotCooldown: 0,
    jetpackUntil: 0,
    nextId: 11,
    nextPlatformY: 614,
    lastPlatformX: 126,
    lastPlatformWidth: 104,
    lastEvent: 'none',
  };
  populateAhead(state);
  return state;
}

export function reset(state: GameState, seed = state.seed): GameState {
  Object.assign(state, createGame(seed));
  return state;
}

export function start(state: GameState): void {
  if (state.status === 'ready' || state.status === 'paused') state.status = 'playing';
}

export function pause(state: GameState): void {
  if (state.status === 'playing') state.status = 'paused';
}

export function setSteering(state: GameState, steering: number): void {
  state.steering = steering < -0.1 ? -1 : steering > 0.1 ? 1 : 0;
}

export function fire(state: GameState): boolean {
  if (state.status !== 'playing' || state.shotCooldown > 0) return false;
  state.projectiles.push({
    id: nextId(state),
    x: state.player.x,
    y: state.player.y + state.player.height + 4,
    vy: PHYSICS.projectileSpeed,
    alive: true,
  });
  state.shotCooldown = PHYSICS.shotCooldown;
  state.lastEvent = 'shot';
  return true;
}

function wrappedCentres(x: number): readonly number[] {
  return [x, x - WORLD_WIDTH, x + WORLD_WIDTH];
}

function playerOverlapsRange(state: GameState, left: number, right: number): boolean {
  const half = state.player.width * 0.42; // slightly forgiving landing/collision footprint
  return wrappedCentres(state.player.x).some((x) => x + half >= left && x - half <= right);
}

function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean {
  const dy = ay - by;
  return wrappedCentres(ax).some((x) => {
    const dx = x - bx;
    return dx * dx + dy * dy <= (ar + br) * (ar + br);
  });
}

function activePlatform(state: GameState, platform: Platform): boolean {
  if (platform.removed) return false;
  if (platform.disappearAt !== null && state.time >= platform.disappearAt) return false;
  return true;
}

function updatePlatforms(state: GameState, dt: number): void {
  for (const platform of state.platforms) {
    if (platform.kind !== 'moving' || platform.removed) continue;
    platform.x += platform.vx * dt;
    if (platform.x <= 0) {
      platform.x = 0;
      platform.vx = Math.abs(platform.vx);
    } else if (platform.x + platform.width >= WORLD_WIDTH) {
      platform.x = WORLD_WIDTH - platform.width;
      platform.vx = -Math.abs(platform.vx);
    }
  }
}

function landOnPlatform(state: GameState, previousY: number): Platform | null {
  if (state.player.vy > 0) return null;
  const candidates = state.platforms
    .filter(
      (platform) =>
        activePlatform(state, platform) &&
        previousY >= platform.y &&
        state.player.y <= platform.y &&
        playerOverlapsRange(state, platform.x, platform.x + platform.width)
    )
    .sort((a, b) => b.y - a.y);
  const platform = candidates[0];
  if (!platform) return null;

  state.player.y = platform.y;
  state.player.vy = platform.spring ? PHYSICS.springVelocity : PHYSICS.jumpVelocity;
  state.lastEvent = platform.spring ? 'spring' : 'jump';
  if (platform.kind === 'breakable') platform.removed = true;
  if (platform.kind === 'disappearing' && platform.disappearAt === null) {
    platform.disappearAt = state.time + 0.48;
  }
  return platform;
}

function collectEntities(state: GameState): void {
  const centreY = state.player.y + state.player.height * 0.52;
  for (const collectible of state.collectibles) {
    if (collectible.collected) continue;
    if (circlesOverlap(state.player.x, centreY, 16, collectible.x, collectible.y, 12)) {
      collectible.collected = true;
      state.sequence.push(collectible.base);
      if (state.sequence.length > 16) state.sequence.shift();
      state.bonus += 25;
      state.lastEvent = 'collect';
    }
  }
  for (const powerUp of state.powerUps) {
    if (powerUp.collected) continue;
    if (circlesOverlap(state.player.x, centreY, 17, powerUp.x, powerUp.y, 15)) {
      powerUp.collected = true;
      state.jetpackUntil = state.time + PHYSICS.jetpackDuration;
      state.player.vy = PHYSICS.jetpackVelocity;
      state.bonus += 75;
      state.lastEvent = 'jetpack';
    }
  }
}

function updateEnemies(state: GameState, dt: number): boolean {
  const playerCentreY = state.player.y + state.player.height / 2;
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    enemy.x += enemy.vx * dt;
    if (enemy.x - enemy.width / 2 <= 0) {
      enemy.x = enemy.width / 2;
      enemy.vx = Math.abs(enemy.vx);
    } else if (enemy.x + enemy.width / 2 >= WORLD_WIDTH) {
      enemy.x = WORLD_WIDTH - enemy.width / 2;
      enemy.vx = -Math.abs(enemy.vx);
    }
    if (
      circlesOverlap(
        state.player.x,
        playerCentreY,
        Math.min(state.player.width, state.player.height) * 0.4,
        enemy.x,
        enemy.y,
        enemy.width * 0.42
      )
    ) {
      if (state.time < state.jetpackUntil) {
        enemy.alive = false;
        state.bonus += 100;
        state.lastEvent = 'enemy';
      } else {
        state.status = 'over';
        state.lastEvent = 'over';
        return true;
      }
    }
  }
  return false;
}

function updateProjectiles(state: GameState, dt: number): void {
  for (const projectile of state.projectiles) {
    if (!projectile.alive) continue;
    projectile.y += projectile.vy * dt;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      if (circlesOverlap(projectile.x, projectile.y, 5, enemy.x, enemy.y, enemy.width * 0.45)) {
        projectile.alive = false;
        enemy.alive = false;
        state.bonus += 100;
        state.lastEvent = 'enemy';
        break;
      }
    }
    if (projectile.y > state.cameraY + VIEW_HEIGHT + 100) projectile.alive = false;
  }
}

function cullBehind(state: GameState): void {
  const floor = state.cameraY - CULL_MARGIN;
  state.platforms = state.platforms.filter((platform) => platform.y >= floor);
  state.collectibles = state.collectibles.filter((item) => !item.collected && item.y >= floor);
  state.powerUps = state.powerUps.filter((item) => !item.collected && item.y >= floor);
  state.enemies = state.enemies.filter((enemy) => enemy.alive && enemy.y >= floor);
  state.projectiles = state.projectiles.filter(
    (projectile) => projectile.alive && projectile.y >= floor
  );
}

/** Advance the simulation by `dt` seconds. Mutates and returns `state`. */
export function step(state: GameState, dt: number): GameState {
  if (state.status !== 'playing') return state;
  const frame = clamp(dt, 0, 1 / 30);
  state.time += frame;
  state.lastEvent = 'none';
  state.shotCooldown = Math.max(0, state.shotCooldown - frame);

  const targetVx = state.steering * PHYSICS.maxHorizontalSpeed;
  const rate = state.steering === 0 ? PHYSICS.horizontalDrag : PHYSICS.horizontalAcceleration;
  if (state.player.vx < targetVx)
    state.player.vx = Math.min(targetVx, state.player.vx + rate * frame);
  else if (state.player.vx > targetVx)
    state.player.vx = Math.max(targetVx, state.player.vx - rate * frame);
  state.player.x = (state.player.x + state.player.vx * frame + WORLD_WIDTH) % WORLD_WIDTH;

  updatePlatforms(state, frame);
  const previousY = state.player.y;
  if (state.time < state.jetpackUntil) {
    state.player.vy = PHYSICS.jetpackVelocity;
  } else {
    state.player.vy = Math.max(PHYSICS.terminalVelocity, state.player.vy + PHYSICS.gravity * frame);
  }
  state.player.y += state.player.vy * frame;
  if (state.time >= state.jetpackUntil) landOnPlatform(state, previousY);

  collectEntities(state);
  if (updateEnemies(state, frame)) return state;
  updateProjectiles(state, frame);

  state.maxHeight = Math.max(state.maxHeight, state.player.y);
  state.height = Math.max(0, Math.floor((state.maxHeight - START_Y) / 5));
  state.difficulty = difficultyForHeight(state.height);
  state.score = state.height + state.bonus;

  const desiredCamera = state.player.y - VIEW_HEIGHT * CAMERA_PLAYER_LINE;
  state.cameraY = Math.max(state.cameraY, desiredCamera, 0);
  populateAhead(state);
  cullBehind(state);

  if (state.player.y + state.player.height < state.cameraY - 32) {
    state.status = 'over';
    state.steering = 0;
    state.lastEvent = 'over';
  }
  return state;
}

export function isJetpackActive(state: GameState): boolean {
  return state.status === 'playing' && state.time < state.jetpackUntil;
}
