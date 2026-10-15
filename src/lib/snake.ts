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

import { CAMPAIGNS, type RunOptions, type RunResult } from './arcade';

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

export type Status = 'ready' | 'playing' | 'paused' | 'over' | 'won';

export interface GameConfig {
  cols: number;
  rows: number;
  /** When true the snake wraps around edges instead of dying. Default false. */
  wrap?: boolean;
  /** Starting snake length. Default 3. */
  startLength?: number;
  run?: RunOptions;
  obstacles?: Point[];
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
  run: RunOptions;
  turnQueue: Dir[];
  obstacles: Point[];
  alternatives: Food[];
  sequence: Base[];
  target: Base[];
  matched: number;
  motifs: number;
  wrong: number;
  bonus: Point | null;
  bonusTaken: boolean;
  collision: Point | null;
  elapsedMs: number;
  events: Array<'eat' | 'bonus' | 'wrong' | 'motif' | 'over' | 'won'>;
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
export function placeFood(
  cols: number,
  rows: number,
  snake: Point[],
  rng: RNG,
  blocked: Point[] = []
): Food {
  const occupied = new Set([...snake, ...blocked].map(cellKey));
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
  const { cols, rows, startLength = 3 } = config;
  const run = config.run ?? { mode: 'classic', stage: 1, seed: 1, difficulty: 'standard' };
  const staged = run.mode === 'campaign' || run.mode === 'practice';
  const wrap = config.wrap ?? (staged && [3, 6].includes(run.stage));
  const obstacles = config.obstacles ?? (staged ? snakeTerrain(run.stage) : []);
  const cy = Math.floor(rows / 2);
  const headX = Math.floor(cols / 2);
  // Head first; body extends left so the initial heading 'right' is legal.
  const snake: Point[] = [];
  for (let i = 0; i < startLength; i++) {
    snake.push({ x: Math.max(0, headX - i), y: cy });
  }
  const game: GameState = {
    cols,
    rows,
    wrap,
    snake,
    dir: 'right',
    pendingDir: null,
    food: placeFood(cols, rows, snake, rng, obstacles),
    score: 0,
    status: 'ready',
    ticks: 0,
    run,
    turnQueue: [],
    obstacles,
    alternatives: [],
    sequence: [],
    target: ['A', 'C', 'G', 'T'],
    matched: 0,
    motifs: 0,
    wrong: 0,
    bonus: staged ? { x: 1, y: 1 } : null,
    bonusTaken: false,
    collision: null,
    elapsedMs: 0,
    events: [],
  };
  if (run.mode === 'motif') refillMotifFood(game, rng);
  return game;
}

/** Fixed, connected terrain, with a clear initial runway through the center. */
export function snakeTerrain(stage: number): Point[] {
  const obstacles: Point[] = [];
  const add = (x: number, y: number) => obstacles.push({ x, y });
  if ([2, 3, 6].includes(stage))
    for (const x of [3, 12])
      for (const y of [3, 12]) {
        add(x, y);
        add(x + 1, y);
        add(x, y + 1);
        add(x + 1, y + 1);
      }
  if (stage === 4)
    for (const x of [5, 11]) for (let y = 2; y <= 14; y++) if (y < 7 || y > 9) add(x, y);
  if (stage === 5)
    for (const x of [4, 8, 12])
      for (let y = 2; y <= 14; y++) if (![4, 5, 8, 9, 12, 13].includes(y)) add(x, y);
  if (stage === 6) for (const x of [7, 9]) for (const y of [4, 12]) add(x, y);
  return obstacles;
}

function refillMotifFood(state: GameState, rng: RNG) {
  const remaining = state.cols * state.rows - state.snake.length - state.obstacles.length;
  const count = Math.min(3, remaining);
  const next = state.target[state.matched];
  const choices: Food[] = [];
  const available = BASES.filter((b) => b !== next);
  for (let i = 0; i < count; i++) {
    const food = placeFood(state.cols, state.rows, state.snake, rng, [
      ...state.obstacles,
      ...choices,
    ]);
    food.base = i === 0 ? next : available[(i - 1 + state.motifs) % available.length];
    choices.push(food);
  }
  if (choices[0]) state.food = choices[0];
  state.alternatives = choices.slice(1);
}

export function tickInterval(state: GameState): number {
  const campaign = state.run.mode === 'campaign' || state.run.mode === 'practice';
  const base = campaign ? 160 - state.run.stage * 10 : Math.max(70, 145 - state.score * 3);
  return state.run.difficulty === 'expert' ? Math.max(55, base * 0.8) : base;
}

export function reset(state: GameState, rng: RNG): GameState {
  Object.assign(
    state,
    createGame(
      {
        cols: state.cols,
        rows: state.rows,
        wrap: state.wrap,
        run: state.run,
        obstacles: state.obstacles,
      },
      rng
    )
  );
  return state;
}

export function start(state: GameState): void {
  if (state.status === 'ready' || state.status === 'paused') state.status = 'playing';
}

export function pause(state: GameState): void {
  if (state.status === 'playing') state.status = 'paused';
}

/**
 * Buffer a turn. Rejects a 180° reversal of the committed heading, and rejects
 * reversing an already-buffered turn — so two fast key presses in one tick can
 * never fold the snake back into itself.
 */
export function turn(state: GameState, dir: Dir): void {
  if (state.status === 'over' || state.status === 'won' || state.status === 'paused') return;
  const last = state.turnQueue.at(-1) ?? state.dir;
  if (state.turnQueue.length >= 2 || dir === last || dir === OPPOSITE[last]) return;
  state.turnQueue.push(dir);
  state.pendingDir = state.turnQueue[0] ?? null;
}

/** Advance one tick. Mutates and returns `state`. No-op unless playing. */
export function step(state: GameState, rng: RNG): GameState {
  if (state.status !== 'playing') return state;
  state.ticks += 1;
  state.elapsedMs += tickInterval(state);
  state.events = [];

  const queued = state.turnQueue.shift() ?? state.pendingDir;
  if (queued && queued !== OPPOSITE[state.dir]) {
    state.dir = queued;
  }
  state.pendingDir = state.turnQueue[0] ?? null;

  const d = DELTA[state.dir];
  let nx = state.snake[0].x + d.x;
  let ny = state.snake[0].y + d.y;

  if (state.wrap) {
    nx = (nx + state.cols) % state.cols;
    ny = (ny + state.rows) % state.rows;
  } else if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) {
    state.status = 'over';
    state.collision = { x: nx, y: ny };
    state.events.push('over');
    return state;
  }

  const selected = [state.food, ...state.alternatives].find((f) => nx === f.x && ny === f.y);
  const eating = Boolean(selected);
  // The tail cell is vacated this tick unless we grow, so exclude it when not eating.
  const body = eating ? state.snake : state.snake.slice(0, -1);
  if ([...body, ...state.obstacles].some((p) => p.x === nx && p.y === ny)) {
    state.status = 'over';
    state.collision = { x: nx, y: ny };
    state.events.push('over');
    return state;
  }

  state.snake.unshift({ x: nx, y: ny });
  if (state.bonus && nx === state.bonus.x && ny === state.bonus.y) {
    state.bonusTaken = true;
    state.bonus = null;
    state.events.push('bonus');
  }
  if (eating) {
    state.score += 1;
    state.sequence.push(selected!.base);
    state.events.push('eat');
    if (state.run.mode === 'motif') {
      if (selected!.base === state.target[state.matched]) {
        state.matched++;
        if (state.matched === state.target.length) {
          state.motifs++;
          state.matched = 0;
          state.events.push('motif');
          state.target = Array.from(
            { length: Math.min(8, 4 + state.motifs) },
            () => BASES[Math.floor(rng() * 4)]
          );
        }
      } else {
        state.matched = 0;
        state.wrong++;
        state.events.push('wrong');
      }
    }
    const staged = state.run.mode === 'campaign' || state.run.mode === 'practice';
    if (
      state.snake.length >= state.cols * state.rows - state.obstacles.length ||
      (staged && state.score >= CAMPAIGNS.snake[state.run.stage - 1].goal)
    ) {
      state.status = 'won';
      state.events.push('won');
      return state;
    }
    if (state.run.mode === 'motif') refillMotifFood(state, rng);
    else state.food = placeFood(state.cols, state.rows, state.snake, rng, state.obstacles);
  } else {
    state.snake.pop();
  }
  return state;
}

export function snakeResult(state: GameState): RunResult {
  const won = state.status === 'won';
  const seconds = state.elapsedMs / 1000;
  return {
    score: state.run.mode === 'motif' ? state.score + state.motifs * 20 : state.score,
    seconds,
    won,
    medals: [
      won,
      won &&
        seconds <=
          CAMPAIGNS.snake[state.run.stage - 1].par * (state.run.difficulty === 'expert' ? 0.8 : 1),
      won && state.bonusTaken,
    ],
    detail: `${state.score} bases · ${seconds.toFixed(1)} s${state.run.mode === 'motif' ? ` · ${state.motifs} motifs · ${state.wrong} sequence resets` : state.bonusTaken ? ' · bonus chip found' : ' · bonus chip missed'}`,
  };
}
