/**
 * Pure, deterministic Snake engine — no DOM, no timers, no rendering.
 *
 * Every rule is a pure function of an explicit `GameState`, so the whole thing is
 * unit-testable (see `snake.test.ts`). Rendering, input, and wall-clock timing
 * live in the controller (`src/scripts/snake.ts`). Food placement uses an
 * injectable seedable RNG, so a given seed reproduces a game exactly.
 *
 * The genomic twist: food carries a nucleotide `base` (A/C/G/T), and the snake
 * reads as a growing "sequence" — but the mechanics are classic Snake.
 */

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Point {
  x: number;
  y: number;
}

export type Base = 'A' | 'C' | 'G' | 'T';
export const BASES: readonly Base[] = ['A', 'C', 'G', 'T'];

export interface Food extends Point {
  base: Base;
}

export type Status = 'ready' | 'playing' | 'over' | 'won';

export interface GameConfig {
  cols: number;
  rows: number;
  /** When true the snake wraps around edges instead of dying. Default false. */
  wrap?: boolean;
  /** Starting snake length. Default 3. */
  startLength?: number;
}

export interface GameState {
  cols: number;
  rows: number;
  wrap: boolean;
  snake: Point[]; // head first
  dir: Dir; // committed heading
  pendingDir: Dir | null; // buffered turn, applied on the next step
  food: Food;
  score: number; // bases collected
  status: Status;
  ticks: number;
}

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

const DELTA: Record<Dir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const cellKey = (p: Point): string => `${p.x},${p.y}`;

/** Pick a food cell uniformly from the empty cells, with a random base. */
export function placeFood(cols: number, rows: number, snake: Point[], rng: RNG): Food {
  const occupied = new Set(snake.map(cellKey));
  const empty: Point[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!occupied.has(`${x},${y}`)) empty.push({ x, y });
    }
  }
  // Callers guarantee at least one empty cell (a full board is handled as a win).
  const cell = empty[Math.floor(rng() * empty.length)] ?? { x: 0, y: 0 };
  const base = BASES[Math.floor(rng() * BASES.length)];
  return { x: cell.x, y: cell.y, base };
}

export function createGame(config: GameConfig, rng: RNG): GameState {
  const { cols, rows, wrap = false, startLength = 3 } = config;
  const cy = Math.floor(rows / 2);
  const headX = Math.floor(cols / 2);
  // Head first; body extends left so the initial heading 'right' is legal.
  const snake: Point[] = [];
  for (let i = 0; i < startLength; i++) {
    snake.push({ x: Math.max(0, headX - i), y: cy });
  }
  return {
    cols,
    rows,
    wrap,
    snake,
    dir: 'right',
    pendingDir: null,
    food: placeFood(cols, rows, snake, rng),
    score: 0,
    status: 'ready',
    ticks: 0,
  };
}

export function reset(state: GameState, rng: RNG): GameState {
  Object.assign(
    state,
    createGame({ cols: state.cols, rows: state.rows, wrap: state.wrap }, rng)
  );
  return state;
}

export function start(state: GameState): void {
  if (state.status === 'ready') state.status = 'playing';
}

/**
 * Buffer a turn. Rejects a 180° reversal of the committed heading, and rejects
 * reversing an already-buffered turn — so two fast key presses in one tick can
 * never fold the snake back into itself.
 */
export function turn(state: GameState, dir: Dir): void {
  if (state.status === 'over' || state.status === 'won') return;
  if (dir === OPPOSITE[state.dir]) return;
  if (state.pendingDir && dir === OPPOSITE[state.pendingDir]) return;
  state.pendingDir = dir;
}

/** Advance one tick. Mutates and returns `state`. No-op unless playing. */
export function step(state: GameState, rng: RNG): GameState {
  if (state.status !== 'playing') return state;
  state.ticks += 1;

  if (state.pendingDir && state.pendingDir !== OPPOSITE[state.dir]) {
    state.dir = state.pendingDir;
  }
  state.pendingDir = null;

  const d = DELTA[state.dir];
  let nx = state.snake[0].x + d.x;
  let ny = state.snake[0].y + d.y;

  if (state.wrap) {
    nx = (nx + state.cols) % state.cols;
    ny = (ny + state.rows) % state.rows;
  } else if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) {
    state.status = 'over';
    return state;
  }

  const eating = nx === state.food.x && ny === state.food.y;
  // The tail cell is vacated this tick unless we grow, so exclude it when not eating.
  const body = eating ? state.snake : state.snake.slice(0, -1);
  if (body.some((p) => p.x === nx && p.y === ny)) {
    state.status = 'over';
    return state;
  }

  state.snake.unshift({ x: nx, y: ny });
  if (eating) {
    state.score += 1;
    if (state.snake.length >= state.cols * state.rows) {
      state.status = 'won';
      return state;
    }
    state.food = placeFood(state.cols, state.rows, state.snake, rng);
  } else {
    state.snake.pop();
  }
  return state;
}
