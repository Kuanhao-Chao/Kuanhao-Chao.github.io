/**
 * Pure, deterministic Tetris engine — no DOM, no timers, no rendering.
 *
 * Modern "guideline" behaviour: 7-bag randomiser, SRS rotation with wall kicks,
 * hold, ghost piece, standard line-clear scoring, and level-based gravity. Every
 * rule is a pure function of an explicit `GameState`, so it is fully unit-tested
 * (see `tetris.test.ts`). Timing (gravity clock, lock delay, DAS/ARR) and colour
 * live in the controller (`src/scripts/tetris.ts`); food-for-thought here is only
 * the board state machine. Randomness comes from an injected seedable RNG.
 */

export const COLS = 10;
export const ROWS = 20;

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

export type Cell = number; // 0 = empty, else pieceType + 1 (1..7) for colour
export type KickKind = 'I' | 'O' | 'JLSTZ';
type Offset = readonly [number, number];

export interface PieceDef {
  name: string;
  kind: KickKind;
  spawnX: number;
  /** Filled cells [x,y] within the piece bounding box, per rotation state 0..3. */
  cells: readonly Offset[][];
}

// Rotation state 0 = spawn, 1 = R (cw), 2 = 180, 3 = L (ccw). SRS spawn shapes.
export const PIECES: readonly PieceDef[] = [
  // 0 — I
  {
    name: 'I',
    kind: 'I',
    spawnX: 3,
    cells: [
      [[0, 1], [1, 1], [2, 1], [3, 1]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[1, 0], [1, 1], [1, 2], [1, 3]],
    ],
  },
  // 1 — O
  {
    name: 'O',
    kind: 'O',
    spawnX: 4,
    cells: [
      [[0, 0], [1, 0], [0, 1], [1, 1]],
      [[0, 0], [1, 0], [0, 1], [1, 1]],
      [[0, 0], [1, 0], [0, 1], [1, 1]],
      [[0, 0], [1, 0], [0, 1], [1, 1]],
    ],
  },
  // 2 — T
  {
    name: 'T',
    kind: 'JLSTZ',
    spawnX: 3,
    cells: [
      [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [1, 2]],
      [[1, 0], [0, 1], [1, 1], [1, 2]],
    ],
  },
  // 3 — S
  {
    name: 'S',
    kind: 'JLSTZ',
    spawnX: 3,
    cells: [
      [[1, 0], [2, 0], [0, 1], [1, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[1, 1], [2, 1], [0, 2], [1, 2]],
      [[0, 0], [0, 1], [1, 1], [1, 2]],
    ],
  },
  // 4 — Z
  {
    name: 'Z',
    kind: 'JLSTZ',
    spawnX: 3,
    cells: [
      [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[2, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 0], [0, 1], [1, 1], [0, 2]],
    ],
  },
  // 5 — J
  {
    name: 'J',
    kind: 'JLSTZ',
    spawnX: 3,
    cells: [
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [0, 2], [1, 2]],
    ],
  },
  // 6 — L
  {
    name: 'L',
    kind: 'JLSTZ',
    spawnX: 3,
    cells: [
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1], [0, 2]],
      [[0, 0], [1, 0], [1, 1], [1, 2]],
    ],
  },
];

// SRS wall-kick tables, converted to board coordinates (y grows downward).
// Keyed by `${from}${to}` rotation-state pair.
const KICKS_JLSTZ: Record<string, Offset[]> = {
  '01': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '10': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '12': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '21': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '23': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '32': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '30': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '03': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};
const KICKS_I: Record<string, Offset[]> = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export const LINE_SCORES = [0, 100, 300, 500, 800] as const;
// Gravity milliseconds per cell by level (1-based); the controller reads this.
const GRAVITY_MS = [
  0, 800, 720, 630, 550, 470, 380, 300, 220, 130, 100, 90, 80, 80, 70, 70, 60, 50, 50, 40, 30,
];
export function gravityMs(level: number): number {
  return GRAVITY_MS[Math.min(Math.max(level, 1), GRAVITY_MS.length - 1)];
}

export type Status = 'ready' | 'playing' | 'paused' | 'over';
export interface Piece {
  type: number; // 0..6
  rotation: number; // 0..3
  x: number;
  y: number;
}
export interface GameState {
  cols: number;
  rows: number;
  board: Cell[][]; // [y][x]
  current: Piece;
  queue: number[]; // upcoming piece types (head = next)
  hold: number | null;
  canHold: boolean;
  bagRng: RNG;
  score: number;
  lines: number;
  level: number;
  status: Status;
}

function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => new Array<Cell>(COLS).fill(0));
}

function fillBag(rng: RNG): number[] {
  const b = [0, 1, 2, 3, 4, 5, 6];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function ensureQueue(state: GameState): void {
  while (state.queue.length <= 7) state.queue.push(...fillBag(state.bagRng));
}

export function collides(board: Cell[][], piece: Piece): boolean {
  const cells = PIECES[piece.type].cells[piece.rotation];
  for (const [cx, cy] of cells) {
    const x = piece.x + cx;
    const y = piece.y + cy;
    if (x < 0 || x >= COLS || y >= ROWS) return true; // walls / floor
    if (y >= 0 && board[y][x] !== 0) return true; // stack (cells above the top are free)
  }
  return false;
}

function spawnFromQueue(state: GameState): void {
  const type = state.queue.shift()!;
  ensureQueue(state);
  state.current = { type, rotation: 0, x: PIECES[type].spawnX, y: 0 };
  if (collides(state.board, state.current)) state.status = 'over'; // block out
}

export function createGame(seed: number): GameState {
  const state: GameState = {
    cols: COLS,
    rows: ROWS,
    board: emptyBoard(),
    current: { type: 0, rotation: 0, x: 0, y: 0 },
    queue: [],
    hold: null,
    canHold: true,
    bagRng: mulberry32(seed),
    score: 0,
    lines: 0,
    level: 1,
    status: 'ready',
  };
  ensureQueue(state);
  spawnFromQueue(state);
  state.canHold = true;
  return state;
}

export function reset(state: GameState, seed: number): GameState {
  Object.assign(state, createGame(seed));
  return state;
}

export function start(state: GameState): void {
  if (state.status === 'ready') state.status = 'playing';
}

export function tryMove(state: GameState, dx: number, dy: number): boolean {
  const next: Piece = { ...state.current, x: state.current.x + dx, y: state.current.y + dy };
  if (collides(state.board, next)) return false;
  state.current = next;
  return true;
}

export function tryRotate(state: GameState, dir: 1 | -1): boolean {
  const cur = state.current;
  const kind = PIECES[cur.type].kind;
  if (kind === 'O') return true; // O never needs to rotate/kick
  const from = cur.rotation;
  const to = (from + dir + 4) % 4;
  const table = kind === 'I' ? KICKS_I : KICKS_JLSTZ;
  const kicks = table[`${from}${to}`] ?? [[0, 0]];
  for (const [kx, ky] of kicks) {
    const next: Piece = { ...cur, rotation: to, x: cur.x + kx, y: cur.y + ky };
    if (!collides(state.board, next)) {
      state.current = next;
      return true;
    }
  }
  return false;
}

export function ghostY(state: GameState): number {
  let y = state.current.y;
  while (!collides(state.board, { ...state.current, y: y + 1 })) y++;
  return y;
}

function clearLines(state: GameState): number {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (state.board[y].every((c) => c !== 0)) {
      state.board.splice(y, 1);
      state.board.unshift(new Array<Cell>(COLS).fill(0));
      cleared++;
      y++; // re-check the row that shifted down into this index
    }
  }
  return cleared;
}

/** Merge the current piece, clear lines, score, level up, and spawn the next. */
export function lockPiece(state: GameState): number {
  const cells = PIECES[state.current.type].cells[state.current.rotation];
  let anyVisible = false;
  for (const [cx, cy] of cells) {
    const x = state.current.x + cx;
    const y = state.current.y + cy;
    if (y >= 0) {
      state.board[y][x] = state.current.type + 1;
      anyVisible = true;
    }
  }
  const cleared = clearLines(state);
  if (cleared) {
    state.score += LINE_SCORES[cleared] * state.level;
    state.lines += cleared;
    state.level = 1 + Math.floor(state.lines / 10);
  }
  if (!anyVisible) {
    state.status = 'over'; // locked entirely above the field (lock out)
    return cleared;
  }
  spawnFromQueue(state);
  state.canHold = true;
  return cleared;
}

export function softDrop(state: GameState): boolean {
  if (state.status !== 'playing') return false;
  if (tryMove(state, 0, 1)) {
    state.score += 1;
    return true;
  }
  return false;
}

export function hardDrop(state: GameState): number {
  if (state.status !== 'playing') return 0;
  const gy = ghostY(state);
  const dist = gy - state.current.y;
  state.current.y = gy;
  state.score += dist * 2;
  lockPiece(state);
  return dist;
}

export function hold(state: GameState): boolean {
  if (state.status !== 'playing' || !state.canHold) return false;
  const cur = state.current.type;
  if (state.hold === null) {
    state.hold = cur;
    spawnFromQueue(state);
  } else {
    const h = state.hold;
    state.hold = cur;
    state.current = { type: h, rotation: 0, x: PIECES[h].spawnX, y: 0 };
    if (collides(state.board, state.current)) state.status = 'over';
  }
  state.canHold = false;
  return true;
}

/** One gravity step: move down, or lock if grounded. (Controller uses tryMove +
 *  a lock-delay timer for feel; this is the simple auto version for tests/e2e.) */
export function stepGravity(state: GameState): void {
  if (state.status !== 'playing') return;
  if (!tryMove(state, 0, 1)) lockPiece(state);
}
