/**
 * Pure functional & deterministic Minesweeper core engine.
 *
 * Implements:
 * - Guaranteed first-click safe opening (3x3 cleared zone around first click)
 * - Standard presets: Beginner (9x9, 10 mines), Intermediate (16x16, 40 mines), Expert (16x30, 99 mines)
 * - Cascade flood-fill reveal for 0-neighbor cells
 * - Flag & question mark cycling
 * - Intelligent chording on revealed numbers
 * - Deterministic neighbor calculation & win/loss detection
 */

export type Difficulty = 'beginner' | 'intermediate' | 'expert' | 'custom';

export interface DifficultyConfig {
  rows: number;
  cols: number;
  mines: number;
}

export const DIFFICULTY_PRESETS: Record<'beginner' | 'intermediate' | 'expert', DifficultyConfig> = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};

export type CellState = 'hidden' | 'revealed' | 'flagged' | 'question';

export interface Cell {
  row: number;
  col: number;
  isMine: boolean;
  neighborMines: number;
  state: CellState;
}

export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';

export interface MinesweeperGame {
  difficulty: Difficulty;
  rows: number;
  cols: number;
  totalMines: number;
  grid: Cell[][];
  status: GameStatus;
  flagsPlaced: number;
  revealedCount: number;
  minesGenerated: boolean;
  explodedCell: [number, number] | null;
}

/**
 * Returns all valid orthogonal and diagonal neighbor coordinates.
 */
export function getAdjacentCoords(
  row: number,
  col: number,
  rows: number,
  cols: number
): [number, number][] {
  const neighbors: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        neighbors.push([r, c]);
      }
    }
  }
  return neighbors;
}

/**
 * Creates a new, ready-to-play Minesweeper board.
 * Mines are not planted until the first click to guarantee an initial safe opening.
 */
export function createGame(
  difficulty: Difficulty = 'beginner',
  customConfig?: DifficultyConfig
): MinesweeperGame {
  const config =
    difficulty === 'custom' && customConfig
      ? customConfig
      : DIFFICULTY_PRESETS[difficulty as keyof typeof DIFFICULTY_PRESETS] ||
        DIFFICULTY_PRESETS.beginner;

  const integer = (value: number, min: number, max: number, fallback: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? Math.floor(value) : fallback));
  const rows = integer(config.rows, 4, 40, 9);
  const cols = integer(config.cols, 4, 50, 9);
  const maxMines = rows * cols - 9;
  const totalMines = integer(config.mines, 1, maxMines, 10);

  const grid: Cell[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      row: r,
      col: c,
      isMine: false,
      neighborMines: 0,
      state: 'hidden',
    }))
  );

  return {
    difficulty,
    rows,
    cols,
    totalMines,
    grid,
    status: 'ready',
    flagsPlaced: 0,
    revealedCount: 0,
    minesGenerated: false,
    explodedCell: null,
  };
}

/**
 * Plants mines across the grid, guaranteeing that the first-clicked cell
 * and its adjacent cells (3x3 safe zone) remain free of mines.
 */
export function populateMines(
  game: MinesweeperGame,
  safeRow: number,
  safeCol: number,
  randomFn = Math.random
): void {
  const { rows, cols, totalMines, grid } = game;
  const safeZone = new Set<string>();

  safeZone.add(`${safeRow},${safeCol}`);
  for (const [nr, nc] of getAdjacentCoords(safeRow, safeCol, rows, cols)) {
    safeZone.add(`${nr},${nc}`);
  }

  // Available cells outside the safe zone
  const available: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!safeZone.has(`${r},${c}`)) {
        available.push([r, c]);
      }
    }
  }

  // Fallback if safe zone is too large for the total mine count
  if (available.length < totalMines) {
    available.length = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r !== safeRow || c !== safeCol) {
          available.push([r, c]);
        }
      }
    }
  }

  // Shuffle and place mines
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }

  const mineCount = Math.min(totalMines, available.length);
  for (let i = 0; i < mineCount; i++) {
    const [mr, mc] = available[i];
    grid[mr][mc].isMine = true;
  }

  // Compute neighbor counts
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].isMine) continue;
      let count = 0;
      for (const [nr, nc] of getAdjacentCoords(r, c, rows, cols)) {
        if (grid[nr][nc].isMine) count++;
      }
      grid[r][c].neighborMines = count;
    }
  }

  game.minesGenerated = true;
}

export interface RevealResult {
  revealed: [number, number][];
  exploded: boolean;
  won: boolean;
}

export interface VisibleCell { state: CellState; number?: number; }
export interface VisibleHint { kind: 'safe' | 'mine' | 'none'; cells: [number, number][]; reason: string; }
/** Hidden numbers and mine bits never cross this interface. Flags are guesses,
 * not premises: the helper treats flagged cells as unknown too. */
export function getVisibleBoard(game: MinesweeperGame): VisibleCell[][] {
  return game.grid.map((row) => row.map((cell) => cell.state === 'revealed' ? { state: cell.state, number: cell.neighborMines } : { state: cell.state }));
}

export function findVisibleHint(board: VisibleCell[][]): VisibleHint {
  const constraints: Array<{ cells: [number, number][]; keys: Set<string>; number: number; row: number; col: number }> = [];
  for (let row = 0; row < board.length; row++) for (let col = 0; col < board[row].length; col++) {
    const cell = board[row][col];
    if (cell.state !== 'revealed' || cell.number === undefined) continue;
    const cells = getAdjacentCoords(row, col, board.length, board[0].length).filter(([r, c]) => board[r][c].state !== 'revealed');
    if (!cells.length) continue;
    if (cell.number === 0) return { kind: 'safe', cells, reason: `Row ${row + 1}, column ${col + 1} is zero: all its unrevealed neighbors are safe. Flags are not assumed correct.` };
    if (cell.number === cells.length) return { kind: 'mine', cells, reason: `Row ${row + 1}, column ${col + 1} needs ${cell.number} mines among exactly ${cells.length} unknown neighbors: all are mines.` };
    constraints.push({ cells, keys: new Set(cells.map(([r, c]) => `${r},${c}`)), number: cell.number, row, col });
  }
  for (const a of constraints) for (const b of constraints) {
    if (a === b || Math.abs(a.row - b.row) > 2 || Math.abs(a.col - b.col) > 2 || a.cells.length >= b.cells.length) continue;
    if (!a.cells.every(([r, c]) => b.keys.has(`${r},${c}`))) continue;
    const difference = b.cells.filter(([r, c]) => !a.keys.has(`${r},${c}`));
    const remaining = b.number - a.number;
    if (remaining === 0 || remaining === difference.length) return { kind: remaining === 0 ? 'safe' : 'mine', cells: difference, reason: `Subtract the smaller visible constraint at (${a.row + 1}, ${a.col + 1}) from (${b.row + 1}, ${b.col + 1}): ${b.number} − ${a.number} = ${remaining} mines in ${difference.length} remaining cells. ${remaining === 0 ? 'They are safe.' : 'They are all mines.'}` };
  }
  return { kind: 'none', cells: [], reason: 'No certain move was found by this visible local/subset helper. It does not peek at mines, assume flags are correct, or guarantee a no-guess board.' };
}

/**
 * Reveals a cell at (row, col).
 * If the board is unseeded, seeds mines with safe first click.
 * If the cell is 0-neighbor, cascades outwards.
 */
export function revealCell(
  game: MinesweeperGame,
  row: number,
  col: number,
  randomFn = Math.random
): RevealResult {
  if (game.status === 'won' || game.status === 'lost') {
    return { revealed: [], exploded: false, won: false };
  }

  if (game.grid[row][col].state === 'revealed' || game.grid[row][col].state === 'flagged') return { revealed: [], exploded: false, won: false };

  if (!game.minesGenerated) {
    populateMines(game, row, col, randomFn);
    game.status = 'playing';
  } else if (game.status === 'ready') {
    game.status = 'playing';
  }

  const cell = game.grid[row][col];

  if (cell.isMine) {
    cell.state = 'revealed';
    game.status = 'lost';
    game.explodedCell = [row, col];
    return { revealed: [[row, col]], exploded: true, won: false };
  }

  const revealedCoords: [number, number][] = [];
  const queue: [number, number][] = [[row, col]];
  cell.state = 'revealed';
  revealedCoords.push([row, col]);
  game.revealedCount++;

  while (queue.length > 0) {
    const [currR, currC] = queue.shift()!;
    const currCell = game.grid[currR][currC];

    if (currCell.neighborMines === 0) {
      for (const [nr, nc] of getAdjacentCoords(currR, currC, game.rows, game.cols)) {
        const neighbor = game.grid[nr][nc];
        if (neighbor.state === 'hidden' || neighbor.state === 'question') {
          neighbor.state = 'revealed';
          revealedCoords.push([nr, nc]);
          game.revealedCount++;
          if (!neighbor.isMine && neighbor.neighborMines === 0) {
            queue.push([nr, nc]);
          }
        }
      }
    }
  }

  const totalSafeCells = game.rows * game.cols - game.totalMines;
  let won = false;
  if (game.revealedCount >= totalSafeCells) {
    game.status = 'won';
    won = true;
    // Automatically flag all unflagged mines upon win
    for (let r = 0; r < game.rows; r++) {
      for (let c = 0; c < game.cols; c++) {
        if (game.grid[r][c].isMine && game.grid[r][c].state !== 'flagged') {
          game.grid[r][c].state = 'flagged';
          game.flagsPlaced++;
        }
      }
    }
  }

  return { revealed: revealedCoords, exploded: false, won };
}

/**
 * Cycles a cell through hidden -> flagged -> question -> hidden.
 */
export function toggleFlag(game: MinesweeperGame, row: number, col: number): CellState {
  if (game.status === 'won' || game.status === 'lost') {
    return game.grid[row][col].state;
  }

  const cell = game.grid[row][col];
  if (cell.state === 'revealed') {
    return 'revealed';
  }

  if (cell.state === 'hidden') {
    cell.state = 'flagged';
    game.flagsPlaced++;
  } else if (cell.state === 'flagged') {
    cell.state = 'question';
    game.flagsPlaced--;
  } else {
    cell.state = 'hidden';
  }

  return cell.state;
}

/**
 * Chords a revealed numbered cell: if the number of surrounding flagged cells
 * matches cell.neighborMines, reveals all remaining unflagged neighbors.
 */
export function chordCell(game: MinesweeperGame, row: number, col: number): RevealResult {
  if (game.status !== 'playing') {
    return { revealed: [], exploded: false, won: false };
  }

  const cell = game.grid[row][col];
  if (cell.state !== 'revealed' || cell.neighborMines <= 0) {
    return { revealed: [], exploded: false, won: false };
  }

  const neighbors = getAdjacentCoords(row, col, game.rows, game.cols);
  const flaggedCount = neighbors.filter(([nr, nc]) => game.grid[nr][nc].state === 'flagged').length;

  if (flaggedCount !== cell.neighborMines) {
    return { revealed: [], exploded: false, won: false };
  }

  const revealedCoords: [number, number][] = [];
  let exploded = false;

  for (const [nr, nc] of neighbors) {
    const neighbor = game.grid[nr][nc];
    if (neighbor.state === 'hidden' || neighbor.state === 'question') {
      const res = revealCell(game, nr, nc);
      revealedCoords.push(...res.revealed);
      if (res.exploded) {
        exploded = true;
        break;
      }
    }
  }

  return {
    revealed: revealedCoords,
    exploded,
    won: (game.status as GameStatus) === 'won',
  };
}
