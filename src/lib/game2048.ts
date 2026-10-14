/**
 * Pure functional, deterministic 2048 game core engine.
 *
 * Implements standard 2048 game rules:
 * - Single-merge per tile per turn
 * - Directional sliding (left, right, up, down)
 * - Deterministic score calculation and merged position tracking
 * - Game over / win detection
 * - Zero external dependencies, pure immutable transformations
 * - Multi-step undo history stack
 */

export type BoardSize = 3 | 4 | 5;

export type Direction = 'left' | 'right' | 'up' | 'down';
export interface TileMotion { from: [number, number]; to: [number, number]; value: number; merged: boolean; }
export interface TileMerge { to: [number, number]; sources: [[number, number], [number, number]]; value: number; }

export interface MoveResult {
  grid: number[][];
  scoreGain: number;
  changed: boolean;
  mergedPositions: [number, number][];
  movements: TileMotion[];
  merges: TileMerge[];
}

/**
 * Creates a deep copy of a 2D number grid.
 */
export function cloneGrid(grid: number[][]): number[][] {
  return grid.map((row) => [...row]);
}

/**
 * Creates an empty N x N grid initialized to 0.
 */
export function createEmptyGrid(size: BoardSize): number[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
}

/**
 * Spawns a new tile (value 2 with 90% probability, 4 with 10% probability)
 * into a random empty cell.
 * Supports optional valueOverride and positionOverride for deterministic testing.
 */
export function spawnRandomTile(
  grid: number[][],
  valueOverride?: number,
  positionOverride?: [number, number],
  random: () => number = Math.random
): { grid: number[][]; spawned: [number, number] | null } {
  const newGrid = cloneGrid(grid);

  if (positionOverride) {
    const [r, c] = positionOverride;
    if (r < 0 || r >= newGrid.length || c < 0 || c >= newGrid[r].length) {
      return { grid: newGrid, spawned: null };
    }
    if (newGrid[r][c] !== 0) return { grid: newGrid, spawned: null };
    const value = valueOverride ?? (random() < 0.9 ? 2 : 4);
    newGrid[r][c] = value;
    return { grid: newGrid, spawned: [r, c] };
  }

  const emptyCells: [number, number][] = [];
  for (let r = 0; r < newGrid.length; r++) {
    for (let c = 0; c < newGrid[r].length; c++) {
      if (newGrid[r][c] === 0) {
        emptyCells.push([r, c]);
      }
    }
  }

  if (emptyCells.length === 0) {
    return { grid: newGrid, spawned: null };
  }

  const chosenIndex = Math.floor(random() * emptyCells.length);
  const [row, col] = emptyCells[chosenIndex];
  const value = valueOverride ?? (random() < 0.9 ? 2 : 4);
  newGrid[row][col] = value;

  return { grid: newGrid, spawned: [row, col] };
}

interface SlideLineResult {
  line: number[];
  scoreGain: number;
  mergedIndices: number[];
  motions: Array<{ from: number; to: number; value: number; merged: boolean }>;
  merges: Array<{ to: number; sources: [number, number]; value: number }>;
}

/**
 * Slides a single 1D line to the left, merging adjacent identical numbers once.
 */
function slideLine(line: number[]): SlideLineResult {
  const nonZero = line.map((value, index) => ({ value, index })).filter((tile) => tile.value !== 0);
  const result: number[] = [];
  const mergedIndices: number[] = [];
  let scoreGain = 0;
  const motions: SlideLineResult['motions'] = [];
  const merges: SlideLineResult['merges'] = [];

  let i = 0;
  while (i < nonZero.length) {
    if (i + 1 < nonZero.length && nonZero[i].value === nonZero[i + 1].value) {
      const mergedVal = nonZero[i].value * 2;
      const to = result.length;
      merges.push({ to, sources: [nonZero[i].index, nonZero[i + 1].index], value: mergedVal });
      for (const source of [nonZero[i], nonZero[i + 1]]) motions.push({ from: source.index, to, value: source.value, merged: true });
      scoreGain += mergedVal;
      result.push(mergedVal);
      mergedIndices.push(result.length - 1);
      i += 2;
    } else {
      motions.push({ from: nonZero[i].index, to: result.length, value: nonZero[i].value, merged: false });
      result.push(nonZero[i].value);
      i += 1;
    }
  }

  while (result.length < line.length) {
    result.push(0);
  }

  return { line: result, scoreGain, mergedIndices, motions, merges };
}

/**
 * Pure slide and merge function for 2D grids in all 4 directions.
 * Returns the new grid, score gain, whether any tile moved/merged, and coordinates of merged tiles.
 */
export function slideAndMerge(grid: number[][], direction: Direction): MoveResult {
  const size = grid.length;
  const newGrid: number[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 0)
  );
  const mergedPositions: [number, number][] = [];
  let scoreGain = 0;
  const movements: TileMotion[] = [];
  const merges: TileMerge[] = [];
  const trace = (res: SlideLineResult, coordinate: (index: number) => [number, number]) => {
    movements.push(...res.motions.map((motion) => ({ from: coordinate(motion.from), to: coordinate(motion.to), value: motion.value, merged: motion.merged })));
    merges.push(...res.merges.map((merge) => ({ to: coordinate(merge.to), sources: [coordinate(merge.sources[0]), coordinate(merge.sources[1])] as TileMerge['sources'], value: merge.value })));
  };

  if (direction === 'left') {
    for (let r = 0; r < size; r++) {
      const res = slideLine(grid[r]);
      trace(res, (index) => [r, index]);
      scoreGain += res.scoreGain;
      for (let c = 0; c < size; c++) {
        newGrid[r][c] = res.line[c];
      }
      for (const idx of res.mergedIndices) {
        mergedPositions.push([r, idx]);
      }
    }
  } else if (direction === 'right') {
    for (let r = 0; r < size; r++) {
      const reversed = [...grid[r]].reverse();
      const res = slideLine(reversed);
      trace(res, (index) => [r, size - 1 - index]);
      scoreGain += res.scoreGain;
      for (let c = 0; c < size; c++) {
        newGrid[r][size - 1 - c] = res.line[c];
      }
      for (const idx of res.mergedIndices) {
        mergedPositions.push([r, size - 1 - idx]);
      }
    }
  } else if (direction === 'up') {
    for (let c = 0; c < size; c++) {
      const colLine = Array.from({ length: size }, (_, r) => grid[r][c]);
      const res = slideLine(colLine);
      trace(res, (index) => [index, c]);
      scoreGain += res.scoreGain;
      for (let r = 0; r < size; r++) {
        newGrid[r][c] = res.line[r];
      }
      for (const idx of res.mergedIndices) {
        mergedPositions.push([idx, c]);
      }
    }
  } else if (direction === 'down') {
    for (let c = 0; c < size; c++) {
      const colLine = Array.from({ length: size }, (_, r) => grid[size - 1 - r][c]);
      const res = slideLine(colLine);
      trace(res, (index) => [size - 1 - index, c]);
      scoreGain += res.scoreGain;
      for (let r = 0; r < size; r++) {
        newGrid[size - 1 - r][c] = res.line[r];
      }
      for (const idx of res.mergedIndices) {
        mergedPositions.push([size - 1 - idx, c]);
      }
    }
  }

  let changed = false;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (newGrid[r][c] !== grid[r][c]) {
        changed = true;
        break;
      }
    }
    if (changed) break;
  }

  return {
    grid: newGrid,
    scoreGain,
    changed,
    mergedPositions,
    movements,
    merges,
  };
}

/**
 * Checks whether any moves are available (empty cell exists or adjacent cells can merge).
 */
export function hasMovesAvailable(grid: number[][]): boolean {
  const size = grid.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const val = grid[r][c];
      if (val === 0) {
        return true;
      }
      // Horizontal neighbor
      if (c + 1 < size && val === grid[r][c + 1]) {
        return true;
      }
      // Vertical neighbor
      if (r + 1 < size && val === grid[r + 1][c]) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks whether the winning target tile (default 2048) has been reached.
 */
export function isGameWon(grid: number[][], target = 2048): boolean {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] >= target) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Snapshot of a game's state used for undo operations.
 */
export interface GameSnapshot {
  grid: number[][];
  score: number;
  boardSize: BoardSize;
  isWon: boolean;
  isOver: boolean;
  rngState?: number;
  keepPlaying?: boolean;
}

/**
 * LIFO history stack maintaining a maximum depth of game snapshots.
 */
export interface HistoryStack {
  snapshots: GameSnapshot[];
  maxDepth: number;
}

/**
 * Creates an empty history stack with an optional maximum depth (default: 20).
 */
export function createHistoryStack(maxDepth = 20): HistoryStack {
  return {
    snapshots: [],
    maxDepth: Math.max(1, maxDepth),
  };
}

/**
 * Pushes a snapshot to the history stack, maintaining immutability and enforcing maxDepth.
 */
export function pushSnapshot(stack: HistoryStack, snapshot: GameSnapshot): HistoryStack {
  const clonedSnapshot: GameSnapshot = {
    ...(snapshot.rngState !== undefined ? { rngState: snapshot.rngState } : {}),
    ...(snapshot.keepPlaying !== undefined ? { keepPlaying: snapshot.keepPlaying } : {}),
    grid: cloneGrid(snapshot.grid),
    score: snapshot.score,
    boardSize: snapshot.boardSize,
    isWon: snapshot.isWon,
    isOver: snapshot.isOver,
  };

  const nextSnapshots = [...stack.snapshots, clonedSnapshot];
  if (nextSnapshots.length > stack.maxDepth) {
    nextSnapshots.splice(0, nextSnapshots.length - stack.maxDepth);
  }

  return {
    snapshots: nextSnapshots,
    maxDepth: stack.maxDepth,
  };
}

/**
 * Pops the most recent snapshot from the history stack.
 * Returns the updated stack and the restored snapshot (or null if empty).
 */
export function popSnapshot(stack: HistoryStack): {
  stack: HistoryStack;
  restored: GameSnapshot | null;
} {
  if (stack.snapshots.length === 0) {
    return {
      stack,
      restored: null,
    };
  }

  const nextSnapshots = [...stack.snapshots];
  const restored = nextSnapshots.pop()!;

  return {
    stack: {
      snapshots: nextSnapshots,
      maxDepth: stack.maxDepth,
    },
    restored: {
      ...restored,
      grid: cloneGrid(restored.grid),
      score: restored.score,
      boardSize: restored.boardSize,
      isWon: restored.isWon,
      isOver: restored.isOver,
    },
  };
}

/**
 * Resets the history stack to empty.
 */
export function clearHistory(stack: HistoryStack): HistoryStack {
  return {
    snapshots: [],
    maxDepth: stack.maxDepth,
  };
}

export interface Game2048State extends GameSnapshot {
  rngState: number;
  keepPlaying: boolean;
  history: HistoryStack;
}

function nextRandom(state: { rngState: number }): number {
  let value = state.rngState || 0x6d2b79f5;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  state.rngState = value >>> 0;
  return state.rngState / 4294967296;
}

export function create2048Game(boardSize: BoardSize = 4, seed = 1): Game2048State {
  const state: Game2048State = { grid: createEmptyGrid(boardSize), score: 0, boardSize, isWon: false, isOver: false, keepPlaying: false, rngState: seed >>> 0 || 0x6d2b79f5, history: createHistoryStack() };
  for (let i = 0; i < 2; i++) state.grid = spawnRandomTile(state.grid, undefined, undefined, () => nextRandom(state)).grid;
  return state;
}

export function move2048Game(state: Game2048State, direction: Direction): { state: Game2048State; move: MoveResult; spawned: [number, number] | null } {
  const move = slideAndMerge(state.grid, direction);
  if (state.isOver || state.isWon && !state.keepPlaying || !move.changed) return { state, move: { ...move, changed: false }, spawned: null };
  const next: Game2048State = { ...state, grid: move.grid, score: state.score + move.scoreGain, history: pushSnapshot(state.history, state) };
  const spawned = spawnRandomTile(next.grid, undefined, undefined, () => nextRandom(next));
  next.grid = spawned.grid;
  next.isWon = state.isWon || isGameWon(next.grid);
  next.isOver = !hasMovesAvailable(next.grid);
  return { state: next, move, spawned: spawned.spawned };
}

export function undo2048Game(state: Game2048State): Game2048State {
  const { restored, stack } = popSnapshot(state.history);
  return restored ? { ...restored, rngState: restored.rngState ?? state.rngState, keepPlaying: restored.keepPlaying ?? false, history: stack } : state;
}

export function serialize2048Game(state: Game2048State): string {
  return JSON.stringify({ version: 2, ...state });
}

export function restore2048Game(raw: string, size: BoardSize): Game2048State | null {
  if (raw.length > 100000) return null;
  try {
    const value = JSON.parse(raw);
    const snapshot = (input: unknown): GameSnapshot | null => {
      if (!input || typeof input !== 'object') return null;
      const s = input as Record<string, unknown>;
      if (s.boardSize !== size || !Array.isArray(s.grid) || s.grid.length !== size || !s.grid.every((row: unknown) => Array.isArray(row) && row.length === size && row.every((tile: unknown) => typeof tile === 'number' && (tile === 0 || tile >= 2 && Number.isSafeInteger(tile) && Number.isInteger(Math.log2(tile)))))) return null;
      if (typeof s.score !== 'number' || !Number.isSafeInteger(s.score) || s.score < 0 || typeof s.rngState !== 'number' || !Number.isInteger(s.rngState) || s.rngState <= 0 || s.rngState > 0xffffffff || typeof s.keepPlaying !== 'boolean' || typeof s.isWon !== 'boolean' || typeof s.isOver !== 'boolean') return null;
      const grid = s.grid as number[][];
      if (grid.flat().filter(Boolean).length < 2 || s.isWon !== isGameWon(grid) || s.isOver !== !hasMovesAvailable(grid) || s.keepPlaying && !s.isWon) return null;
      return { grid: cloneGrid(grid), score: s.score, boardSize: size, rngState: s.rngState, keepPlaying: s.keepPlaying, isWon: s.isWon, isOver: s.isOver };
    };
    if (value?.version !== 2) return null;
    const current = snapshot(value);
    if (!current || !Array.isArray(value.history?.snapshots) || value.history.snapshots.length > 20) return null;
    const snapshots = value.history.snapshots.map(snapshot);
    if (snapshots.some((item: GameSnapshot | null) => item === null)) return null;
    return { ...current, rngState: current.rngState!, keepPlaying: current.keepPlaying!, history: { maxDepth: 20, snapshots } };
  } catch { return null; }
}
