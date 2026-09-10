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

export interface MoveResult {
  grid: number[][];
  scoreGain: number;
  changed: boolean;
  mergedPositions: [number, number][];
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
  positionOverride?: [number, number]
): { grid: number[][]; spawned: [number, number] | null } {
  const newGrid = cloneGrid(grid);

  if (positionOverride) {
    const [r, c] = positionOverride;
    if (r < 0 || r >= newGrid.length || c < 0 || c >= newGrid[r].length) {
      return { grid: newGrid, spawned: null };
    }
    const value = valueOverride ?? (Math.random() < 0.9 ? 2 : 4);
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

  const chosenIndex = Math.floor(Math.random() * emptyCells.length);
  const [row, col] = emptyCells[chosenIndex];
  const value = valueOverride ?? (Math.random() < 0.9 ? 2 : 4);
  newGrid[row][col] = value;

  return { grid: newGrid, spawned: [row, col] };
}

interface SlideLineResult {
  line: number[];
  scoreGain: number;
  mergedIndices: number[];
}

/**
 * Slides a single 1D line to the left, merging adjacent identical numbers once.
 */
function slideLine(line: number[]): SlideLineResult {
  const nonZero = line.filter((v) => v !== 0);
  const result: number[] = [];
  const mergedIndices: number[] = [];
  let scoreGain = 0;

  let i = 0;
  while (i < nonZero.length) {
    if (i + 1 < nonZero.length && nonZero[i] === nonZero[i + 1]) {
      const mergedVal = nonZero[i] * 2;
      scoreGain += mergedVal;
      result.push(mergedVal);
      mergedIndices.push(result.length - 1);
      i += 2;
    } else {
      result.push(nonZero[i]);
      i += 1;
    }
  }

  while (result.length < line.length) {
    result.push(0);
  }

  return { line: result, scoreGain, mergedIndices };
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

  if (direction === 'left') {
    for (let r = 0; r < size; r++) {
      const res = slideLine(grid[r]);
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
