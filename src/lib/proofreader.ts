/**
 * Pure, deterministic Proofreader engine — no DOM, no timers, no rendering.
 *
 * Proofreader is a first-person raycast shooter. You play the proofreading domain
 * of DNA polymerase, sweeping a chromatin maze and clearing replication *mutations*
 * (substitution / insertion / deletion enemies) before they overwhelm you. Nucleotide
 * pickups (A/C/G/T) restore correction charges (ammo) and integrity (health).
 *
 * Every rule is a pure function of an explicit `GameState`, so the whole thing is
 * unit-testable (see `proofreader.test.ts`): raycasting, collision, line-of-sight,
 * hitscan combat, enemy AI, and wave progression. Rendering, input, wall-clock timing,
 * and audio live in the controller (`src/scripts/proofreader.ts`).
 *
 * World units are grid cells; `map[y][x]` is 0 for open floor and 1–4 for a wall
 * style. Cell centers sit at `(x + 0.5, y + 0.5)`. Angle 0 points along +x; a positive
 * angle turns clockwise on screen (screen y points down). All gameplay randomness is
 * held in `state.rngState` via the mulberry32 recurrence, so a given seed reproduces a
 * run exactly and a full `GameState` is serializable and comparable in tests.
 */

export type Status = 'ready' | 'playing' | 'paused' | 'over';
export type Base = 'A' | 'C' | 'G' | 'T';
export const BASES: readonly Base[] = ['A', 'C', 'G', 'T'];

export type EnemyKind = 'substitution' | 'insertion' | 'deletion';
export type PickupKind = 'ammo' | 'health';

/** The single most salient thing that happened during the last `step`, for sound/particles. */
export type GameEvent =
  'none' | 'fire' | 'empty' | 'hit' | 'kill' | 'hurt' | 'pickup' | 'wave' | 'over';

export interface Player {
  x: number;
  y: number;
  angle: number;
  health: number;
  ammo: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  speed: number; // cells/s, scaled by wave
  heading: number; // current travel direction (rad)
  retargetIn: number; // s until the wander heading is re-rolled
  attackIn: number; // s until the next melee is allowed
  hurtFor: number; // s of hit-flash left (render hint)
  alive: boolean;
}

export interface Pickup {
  id: number;
  kind: PickupKind;
  base: Base;
  x: number;
  y: number;
  taken: boolean;
}

export interface StepInput {
  forward: number; // -1..1
  strafe: number; // -1..1
  turn: number; // -1..1 (keyboard turn; pointer look calls turnBy directly)
  fire: boolean;
}

export interface GameState {
  status: Status;
  seed: number;
  rngState: number;
  time: number;
  map: number[][];
  cols: number;
  rows: number;
  player: Player;
  aimAssist: boolean; // widened hit cone for touch aiming
  enemies: Enemy[];
  pickups: Pickup[];
  wave: number; // 0 until the first wave spawns
  intermission: number; // s until the next wave; 0 while a wave is live
  kills: number;
  score: number;
  sequence: Base[]; // collected bases, HUD flavor
  fireCooldown: number;
  muzzleFor: number; // s of muzzle flash left (render hint)
  damageFor: number; // s of damage vignette left (render hint)
  nextId: number;
  lastEvent: GameEvent;
}

export interface RayHit {
  distance: number; // Euclidean distance along the ray to the wall face
  wallType: number; // 0 when nothing was hit within maxDist
  side: 0 | 1; // 0 = x-facing wall, 1 = y-facing wall
  hitX: number;
  hitY: number;
  u: number; // fractional coordinate along the wall face, for texture detail
}

export interface FireResult {
  fired: boolean;
  hitId: number | null;
  killed: boolean;
}

export const TUNING = {
  fov: Math.PI / 3, // 60° horizontal field of view
  playerRadius: 0.22,
  moveSpeed: 3.1,
  strafeSpeed: 2.5,
  turnSpeed: 2.7, // rad/s keyboard turn
  maxHealth: 100,
  startAmmo: 24,
  maxAmmo: 40,
  fireCooldown: 0.28,
  fireRange: 14,
  hitCone: 0.1, // rad half-angle (desktop precision)
  assistCone: 0.19, // rad half-angle (touch aim assist)
  enemyRadius: 0.3,
  aggroRange: 8,
  attackRange: 0.85,
  attackDamage: 12,
  attackInterval: 1.0,
  pickupRadius: 0.55,
  ammoPerPickup: 8,
  healthPerPickup: 20,
  dropChance: 0.35,
  intermission: 1.6,
  maxRayDistance: 32,
} as const;

const ENEMY_POINTS: Record<EnemyKind, number> = {
  substitution: 10,
  insertion: 15,
  deletion: 25,
};

const ENEMY_HP: Record<EnemyKind, number> = {
  substitution: 1,
  insertion: 2,
  deletion: 3,
};

const ENEMY_BASE_SPEED: Record<EnemyKind, number> = {
  substitution: 1.4,
  insertion: 1.1,
  deletion: 0.9,
};

/** Deterministic RNG returning a float in [0, 1). Same seed → same sequence. */
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

/** In-state RNG (mulberry32 recurrence over `rngState`) so a full state is reproducible. */
function random(state: GameState): number {
  state.rngState = (state.rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(state.rngState ^ (state.rngState >>> 15), 1 | state.rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Wrap an angle to (−π, π]. */
export function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let r = (((a + Math.PI) % twoPi) + twoPi) % twoPi;
  return r - Math.PI;
}

/** 4-connected flood fill of open cells (value 0) from (sx, sy); returns the reachable mask. */
function reachableFrom(grid: number[][], sx: number, sy: number): boolean[][] {
  const h = grid.length;
  const w = grid[0].length;
  const seen: boolean[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => false));
  if (grid[sy][sx] !== 0) return seen;
  const stack: Array<[number, number]> = [[sx, sy]];
  seen[sy][sx] = true;
  const dirs: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (stack.length) {
    const [x, y] = stack.pop() as [number, number];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && grid[ny][nx] === 0 && !seen[ny][nx]) {
        seen[ny][nx] = true;
        stack.push([nx, ny]);
      }
    }
  }
  return seen;
}

/**
 * Carve 2–3 rectangular chambers into the maze so the space is not uniform corridors.
 * Each room is linked back to the spawn by an interior L-corridor, so it is reachable by
 * construction. Returns the room centres (used as guaranteed cover-post sites).
 */
function carveRooms(grid: number[][], rng: RNG, w: number, h: number): Array<[number, number]> {
  const centers: Array<[number, number]> = [];
  const count = 2 + Math.floor(rng() * 2); // 2–3
  for (let i = 0; i < count; i++) {
    const rw = 3 + Math.floor(rng() * 3); // 3–5
    const rh = 3 + Math.floor(rng() * 3);
    const rx = 1 + Math.floor(rng() * Math.max(1, w - 2 - rw));
    const ry = 1 + Math.floor(rng() * Math.max(1, h - 2 - rh));
    for (let y = ry; y < ry + rh && y < h - 1; y++) {
      for (let x = rx; x < rx + rw && x < w - 1; x++) grid[y][x] = 0;
    }
    const cx = Math.min(w - 2, rx + (rw >> 1));
    const cy = Math.min(h - 2, ry + (rh >> 1));
    // L-path (interior only) from the room centre to the spawn corner.
    for (let x = Math.min(cx, 1); x <= Math.max(cx, 1); x++) grid[cy][x] = 0;
    for (let y = Math.min(cy, 1); y <= Math.max(cy, 1); y++) grid[y][1] = 0;
    centers.push([cx, cy]);
  }
  return centers;
}

/**
 * Drop a few single-cell cover posts into open areas (room centres first, then random),
 * reverting any placement that would isolate part of the map.
 */
function addPillars(
  grid: number[][],
  rng: RNG,
  w: number,
  h: number,
  centers: Array<[number, number]>
): void {
  const tryPlace = (x: number, y: number): boolean => {
    if (x <= 2 && y <= 2) return false; // keep the spawn room clear
    if (grid[y][x] !== 0) return false;
    // Only where all four orthogonal neighbours are open (interior of a room/arena).
    if (
      grid[y - 1][x] !== 0 ||
      grid[y + 1][x] !== 0 ||
      grid[y][x - 1] !== 0 ||
      grid[y][x + 1] !== 0
    )
      return false;
    grid[y][x] = 1; // tentative post
    const seen = reachableFrom(grid, 1, 1);
    for (let yy = 1; yy < h - 1; yy++) {
      for (let xx = 1; xx < w - 1; xx++) {
        if (grid[yy][xx] === 0 && !seen[yy][xx]) {
          grid[y][x] = 0; // would isolate a cell — revert
          return false;
        }
      }
    }
    return true;
  };
  const target = 2 + Math.floor(rng() * 3); // 2–4
  let placed = 0;
  for (const [cx, cy] of centers) {
    if (placed >= target) break;
    if (tryPlace(cx, cy)) placed++;
  }
  let attempts = 0;
  while (placed < target && attempts < 200) {
    attempts++;
    const x = 2 + Math.floor(rng() * (w - 4));
    const y = 2 + Math.floor(rng() * (h - 4));
    if (tryPlace(x, y)) placed++;
  }
}

/** Refill any open cell not reachable from the spawn, so no isolated pockets can exist. */
function repairConnectivity(grid: number[][], w: number, h: number): void {
  const seen = reachableFrom(grid, 1, 1);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[y][x] === 0 && !seen[y][x]) grid[y][x] = 1;
    }
  }
}

/** Coherent, role-legible wall style (1–4): border membrane, cover post, or zoned interior. */
function wallStyle(grid: number[][], x: number, y: number, w: number, h: number): number {
  if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return 4; // outer membrane ring
  const isPillar =
    grid[y - 1][x] === 0 && grid[y + 1][x] === 0 && grid[y][x - 1] === 0 && grid[y][x + 1] === 0;
  if (isPillar) return 3; // free-standing cover post
  return y < h / 2 ? 1 : 2; // two coherent interior zones (top / bottom)
}

/**
 * Procedural maze-arena. A recursive-backtracker maze on the odd lattice, then ~22% of
 * interior walls between two open cells are removed for FPS sightlines, then a few rooms
 * and cover pillars are added for layout variety. The 2×2 spawn room is force-carved,
 * connectivity is guaranteed, the border ring is solid, and every wall gets a coherent
 * style 1–4 (border / pillar / zoned interior).
 */
export function generateMap(rng: RNG, cols = 17, rows = 17): number[][] {
  const w = cols % 2 === 0 ? cols + 1 : cols;
  const h = rows % 2 === 0 ? rows + 1 : rows;
  const grid: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 1));

  // Carve corridors with an explicit-stack recursive backtracker.
  grid[1][1] = 0;
  const stack: Array<[number, number]> = [[1, 1]];
  const dirs: Array<[number, number]> = [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options: Array<[number, number]> = [];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1 && grid[ny][nx] === 1) {
        options.push([dx, dy]);
      }
    }
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const [dx, dy] = options[Math.floor(rng() * options.length)];
    grid[cy + dy / 2][cx + dx / 2] = 0; // knock down the wall between cells
    grid[cy + dy][cx + dx] = 0; // carve the neighbour
    stack.push([cx + dx, cy + dy]);
  }

  // Arena-ify: open interior walls that separate two open cells (never creates a pocket).
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[y][x] !== 1) continue;
      const horiz = grid[y][x - 1] === 0 && grid[y][x + 1] === 0;
      const vert = grid[y - 1][x] === 0 && grid[y + 1][x] === 0;
      if ((horiz || vert) && rng() < 0.22) grid[y][x] = 0;
    }
  }

  const roomCenters = carveRooms(grid, rng, w, h);
  addPillars(grid, rng, w, h, roomCenters);

  // Force-carve the 2×2 spawn room so the player never starts boxed in.
  grid[1][1] = 0;
  grid[1][2] = 0;
  grid[2][1] = 0;
  grid[2][2] = 0;

  repairConnectivity(grid, w, h);

  // Solid border ring, then assign coherent wall styles.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (border) {
        grid[y][x] = 4;
      } else if (grid[y][x] !== 0) {
        grid[y][x] = wallStyle(grid, x, y, w, h);
      }
    }
  }
  return grid;
}

export function createGame(seed: number, cols = 17, rows = 17): GameState {
  const rng = mulberry32(seed);
  const map = generateMap(rng, cols, rows);
  return {
    status: 'ready',
    seed: seed >>> 0,
    rngState: seed | 0,
    time: 0,
    map,
    cols: map[0].length,
    rows: map.length,
    player: { x: 1.5, y: 1.5, angle: 0, health: TUNING.maxHealth, ammo: TUNING.startAmmo },
    aimAssist: false,
    enemies: [],
    pickups: [],
    wave: 0,
    intermission: 0,
    kills: 0,
    score: 0,
    sequence: [],
    fireCooldown: 0,
    muzzleFor: 0,
    damageFor: 0,
    nextId: 1,
    lastEvent: 'none',
  };
}

export function reset(state: GameState, seed: number): GameState {
  Object.assign(state, createGame(seed, state.cols, state.rows));
  return state;
}

export function start(state: GameState): void {
  if (state.status === 'ready' || state.status === 'paused') {
    state.status = 'playing';
    if (state.wave === 0) startWave(state);
  }
}

export function pause(state: GameState): void {
  if (state.status === 'playing') state.status = 'paused';
}

export function setAimAssist(state: GameState, on: boolean): void {
  state.aimAssist = on;
}

export function turnBy(state: GameState, delta: number): void {
  state.player.angle = normalizeAngle(state.player.angle + delta);
}

/** True if a circle of radius `r` centred at (x, y) overlaps any solid or out-of-bounds cell. */
export function collides(map: number[][], x: number, y: number, r: number): boolean {
  const rows = map.length;
  const cols = map[0].length;
  const minX = Math.floor(x - r);
  const maxX = Math.floor(x + r);
  const minY = Math.floor(y - r);
  const maxY = Math.floor(y + r);
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return true;
      if (map[cy][cx] > 0) return true;
    }
  }
  return false;
}

/** Axis-separated move so a circle slides along walls instead of sticking. */
function moveCircle(
  map: number[][],
  x: number,
  y: number,
  dx: number,
  dy: number,
  r: number
): { x: number; y: number } {
  let nx = x;
  let ny = y;
  if (!collides(map, x + dx, y, r)) nx = x + dx;
  if (!collides(map, nx, y + dy, r)) ny = y + dy;
  return { x: nx, y: ny };
}

export function movePlayer(state: GameState, forward: number, strafe: number, dt: number): void {
  let f = forward;
  let s = strafe;
  const mag = Math.hypot(f, s);
  if (mag > 1) {
    f /= mag;
    s /= mag;
  }
  const a = state.player.angle;
  const cosA = Math.cos(a);
  const sinA = Math.sin(a);
  // Strafe axis is the view direction rotated +90° (cos(a+π/2) = −sin a, sin(a+π/2) = cos a).
  const dx = (cosA * f * TUNING.moveSpeed - sinA * s * TUNING.strafeSpeed) * dt;
  const dy = (sinA * f * TUNING.moveSpeed + cosA * s * TUNING.strafeSpeed) * dt;
  const moved = moveCircle(state.map, state.player.x, state.player.y, dx, dy, TUNING.playerRadius);
  state.player.x = moved.x;
  state.player.y = moved.y;
}

/** Cast a ray through the grid (DDA) and return the first wall it hits. */
export function castRay(
  map: number[][],
  ox: number,
  oy: number,
  angle: number,
  maxDist: number = TUNING.maxRayDistance
): RayHit {
  const rows = map.length;
  const cols = map[0].length;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  let mapX = Math.floor(ox);
  let mapY = Math.floor(oy);
  const deltaDistX = dirX === 0 ? Infinity : Math.abs(1 / dirX);
  const deltaDistY = dirY === 0 ? Infinity : Math.abs(1 / dirY);
  let stepX: number;
  let stepY: number;
  let sideDistX: number;
  let sideDistY: number;
  if (dirX < 0) {
    stepX = -1;
    sideDistX = (ox - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - ox) * deltaDistX;
  }
  if (dirY < 0) {
    stepY = -1;
    sideDistY = (oy - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - oy) * deltaDistY;
  }

  const noHit = (): RayHit => ({
    distance: maxDist,
    wallType: 0,
    side: 0,
    hitX: ox + dirX * maxDist,
    hitY: oy + dirY * maxDist,
    u: 0,
  });

  let side: 0 | 1 = 0;
  for (let guard = 0; guard < 512; guard++) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }
    const distance = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
    if (distance > maxDist) return noHit();
    if (mapX < 0 || mapY < 0 || mapX >= cols || mapY >= rows) return noHit();
    const cell = map[mapY][mapX];
    if (cell > 0) {
      const hitX = ox + dirX * distance;
      const hitY = oy + dirY * distance;
      const u = side === 0 ? hitY - Math.floor(hitY) : hitX - Math.floor(hitX);
      return { distance, wallType: cell, side, hitX, hitY, u };
    }
  }
  return noHit();
}

/** True if no wall lies between the two points (walls block shots and enemy chases). */
export function hasLineOfSight(
  map: number[][],
  x1: number,
  y1: number,
  x2: number,
  y2: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return true;
  const hit = castRay(map, x1, y1, Math.atan2(dy, dx), dist);
  return hit.distance > dist - 1e-4;
}

/**
 * Fire the proofreading pulse: a hitscan shot at the nearest visible enemy within an
 * angular cone. The cone widens for close enemies (their angular radius) and further
 * with aim assist, so touch aiming feels forgiving while staying skill-based on desktop.
 */
export function fire(state: GameState): FireResult {
  const miss: FireResult = { fired: false, hitId: null, killed: false };
  if (state.status !== 'playing') return miss;
  if (state.fireCooldown > 0) return miss;
  if (state.player.ammo <= 0) {
    state.lastEvent = 'empty';
    return miss;
  }
  state.player.ammo -= 1;
  state.fireCooldown = TUNING.fireCooldown;
  state.muzzleFor = 0.09;
  state.lastEvent = 'fire';

  const { x: px, y: py, angle } = state.player;
  const cone = state.aimAssist ? TUNING.assistCone : TUNING.hitCone;
  let target: Enemy | null = null;
  let targetDist = Infinity;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = e.x - px;
    const dy = e.y - py;
    const dist = Math.hypot(dx, dy);
    if (dist > TUNING.fireRange || dist >= targetDist) continue;
    const angDiff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - angle));
    const angularRadius = Math.asin(Math.min(1, TUNING.enemyRadius / Math.max(dist, 1e-4)));
    if (angDiff > cone + angularRadius) continue;
    if (!hasLineOfSight(state.map, px, py, e.x, e.y)) continue;
    target = e;
    targetDist = dist;
  }

  if (!target) return { fired: true, hitId: null, killed: false };

  target.hp -= 1;
  target.hurtFor = 0.15;
  if (target.hp > 0) {
    state.lastEvent = 'hit';
    return { fired: true, hitId: target.id, killed: false };
  }

  target.alive = false;
  state.kills += 1;
  state.score += ENEMY_POINTS[target.kind];
  state.lastEvent = 'kill';
  if (random(state) < TUNING.dropChance) {
    state.pickups.push({
      id: state.nextId++,
      kind: random(state) < 0.5 ? 'ammo' : 'health',
      base: BASES[Math.floor(random(state) * BASES.length)],
      x: target.x,
      y: target.y,
      taken: false,
    });
  }
  if (!state.enemies.some((e) => e.alive) && state.intermission <= 0) {
    state.score += 25 * state.wave;
    state.intermission = TUNING.intermission;
  }
  return { fired: true, hitId: target.id, killed: true };
}

function emptyCells(state: GameState): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      if (state.map[y][x] === 0) cells.push([x, y]);
    }
  }
  return cells;
}

function shuffle<T>(arr: T[], state: GameState): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function startWave(state: GameState): void {
  state.wave += 1;
  const wave = state.wave;
  const count = Math.min(3 + wave, 12);
  const speedScale = Math.min(1 + 0.04 * (wave - 1), 1.5);
  const kinds: EnemyKind[] = ['substitution'];
  if (wave >= 2) kinds.push('insertion');
  if (wave >= 3) kinds.push('deletion');

  const px = state.player.x;
  const py = state.player.y;
  const far = shuffle(
    emptyCells(state).filter(([x, y]) => Math.hypot(x + 0.5 - px, y + 0.5 - py) >= 6),
    state
  );
  const pool = far.length >= count ? far : far.concat(shuffle(emptyCells(state), state));
  for (let i = 0; i < count; i++) {
    const [cx, cy] = pool[i % pool.length];
    const kind = kinds[Math.floor(random(state) * kinds.length)];
    state.enemies.push({
      id: state.nextId++,
      kind,
      x: cx + 0.5,
      y: cy + 0.5,
      hp: ENEMY_HP[kind],
      speed: ENEMY_BASE_SPEED[kind] * speedScale,
      heading: random(state) * Math.PI * 2 - Math.PI,
      retargetIn: random(state),
      attackIn: 0,
      hurtFor: 0,
      alive: true,
    });
  }

  // Scatter two ammo pickups so a long wave is survivable.
  const spots = shuffle(emptyCells(state), state);
  for (let i = 0; i < 2 && i < spots.length; i++) {
    const [cx, cy] = spots[i];
    state.pickups.push({
      id: state.nextId++,
      kind: 'ammo',
      base: BASES[Math.floor(random(state) * BASES.length)],
      x: cx + 0.5,
      y: cy + 0.5,
      taken: false,
    });
  }
  state.lastEvent = 'wave';
}

function stepEnemies(state: GameState, dt: number): void {
  const px = state.player.x;
  const py = state.player.y;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    e.hurtFor = Math.max(0, e.hurtFor - dt);
    e.attackIn = Math.max(0, e.attackIn - dt);
    e.retargetIn = Math.max(0, e.retargetIn - dt);

    const dx = px - e.x;
    const dy = py - e.y;
    const dist = Math.hypot(dx, dy);
    let speed: number;
    if (dist <= TUNING.aggroRange && hasLineOfSight(state.map, e.x, e.y, px, py)) {
      e.heading = Math.atan2(dy, dx);
      speed = e.speed;
    } else {
      if (e.retargetIn <= 0) {
        e.heading = random(state) * Math.PI * 2 - Math.PI;
        e.retargetIn = 0.6 + random(state) * 1.2;
      }
      speed = e.speed * 0.5;
    }

    const beforeX = e.x;
    const beforeY = e.y;
    const moved = moveCircle(
      state.map,
      e.x,
      e.y,
      Math.cos(e.heading) * speed * dt,
      Math.sin(e.heading) * speed * dt,
      TUNING.enemyRadius
    );
    e.x = moved.x;
    e.y = moved.y;
    if (Math.abs(e.x - beforeX) < 1e-4 && Math.abs(e.y - beforeY) < 1e-4) {
      e.retargetIn = 0; // blocked → pick a fresh heading next tick
    }

    if (dist <= TUNING.attackRange && e.attackIn <= 0) {
      state.player.health -= TUNING.attackDamage;
      e.attackIn = TUNING.attackInterval;
      state.damageFor = 0.4;
      state.lastEvent = 'hurt';
    }
  }
}

function collectPickups(state: GameState): void {
  let collected = false;
  for (const p of state.pickups) {
    if (p.taken) continue;
    if (Math.hypot(p.x - state.player.x, p.y - state.player.y) <= TUNING.pickupRadius) {
      p.taken = true;
      collected = true;
      if (p.kind === 'ammo') {
        state.player.ammo = Math.min(TUNING.maxAmmo, state.player.ammo + TUNING.ammoPerPickup);
      } else {
        state.player.health = Math.min(
          TUNING.maxHealth,
          state.player.health + TUNING.healthPerPickup
        );
      }
      state.sequence.push(p.base);
      if (state.sequence.length > 60) state.sequence.shift();
      state.score += 5;
    }
  }
  if (collected) {
    state.lastEvent = 'pickup';
    state.pickups = state.pickups.filter((p) => !p.taken);
  }
}

/** Advance the world by `dt` seconds. Mutates and returns `state`. No-op unless playing. */
export function step(state: GameState, dt: number, input: StepInput): GameState {
  if (state.status !== 'playing') return state;
  state.lastEvent = 'none';
  state.time += dt;
  state.fireCooldown = Math.max(0, state.fireCooldown - dt);
  state.muzzleFor = Math.max(0, state.muzzleFor - dt);
  state.damageFor = Math.max(0, state.damageFor - dt);

  if (input.turn) turnBy(state, input.turn * TUNING.turnSpeed * dt);
  movePlayer(state, input.forward, input.strafe, dt);
  if (input.fire) fire(state);
  stepEnemies(state, dt);
  collectPickups(state);

  if (state.intermission > 0) {
    state.intermission = Math.max(0, state.intermission - dt);
    if (state.intermission === 0) startWave(state);
  }

  if (state.player.health <= 0) {
    state.player.health = 0;
    state.status = 'over';
    state.lastEvent = 'over';
  }
  return state;
}
