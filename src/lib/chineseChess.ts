/**
 * Pure deterministic Chinese Chess (Xiangqi / 象棋) engine: no DOM, no timers, no canvas.
 *
 * Coordinates:
 *   x in [0..8] (9 files / columns, left to right from Red's perspective)
 *   y in [0..9] (10 ranks / rows, bottom to top from Red's perspective)
 *
 * Board Zones:
 *   Red Side: y in [0..4], Red Palace: x in [3..5], y in [0..2]
 *   River: separates y=4 and y=5
 *   Black Side: y in [5..9], Black Palace: x in [3..5], y in [7..9]
 */

export type Side = 'red' | 'black';

export type PieceKind =
  | 'general'  // 帥 (Red) / 將 (Black)
  | 'advisor'  // 仕 (Red) / 士 (Black)
  | 'elephant' // 相 (Red) / 象 (Black)
  | 'horse'    // 傌 (Red) / 馬 (Black)
  | 'chariot'  // 俥 (Red) / 車 (Black)
  | 'cannon'   // 炮 (Red) / 砲 (Black)
  | 'soldier'; // 兵 (Red) / 卒 (Black)

export interface Piece {
  id: number;
  side: Side;
  kind: PieceKind;
  x: number;
  y: number;
}

export interface Move {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  piece: Piece;
  captured?: Piece;
  notation?: string;
}

export type GameStatus = 'ready' | 'playing' | 'check' | 'checkmate' | 'stalemate';

export type AIDifficulty = 'novice' | 'intermediate' | 'master';

export interface GameState {
  board: (Piece | null)[][]; // 9 files x 10 ranks: board[x][y]
  turn: Side;
  status: GameStatus;
  winner: Side | null;
  history: Move[];
  capturedRed: Piece[];
  capturedBlack: Piece[];
  isCheck: boolean;
  lastMove: Move | null;
}

export const CHINESE_PIECE_CHARS: Record<Side, Record<PieceKind, string>> = {
  red: {
    general: '帥',
    advisor: '仕',
    elephant: '相',
    horse: '傌',
    chariot: '俥',
    cannon: '炮',
    soldier: '兵',
  },
  black: {
    general: '將',
    advisor: '士',
    elephant: '象',
    horse: '馬',
    chariot: '車',
    cannon: '砲',
    soldier: '卒',
  },
};

export const CHINESE_DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

// Piece Base Material Values for AI evaluation
export const PIECE_VALUES: Record<PieceKind, number> = {
  general: 10000,
  chariot: 950,
  cannon: 450,
  horse: 400,
  elephant: 200,
  advisor: 200,
  soldier: 100,
};

// Piece-Square Positional Bonus Tables (from Red's perspective: y=0 bottom to y=9 top)
// Evaluates piece activity, river crossing, and tactical outpost control.
const HORSE_PST = [
  [0, -10, 0, 0, 0, 0, 0, -10, 0],
  [0, 5, 10, 10, 10, 10, 10, 5, 0],
  [2, 10, 15, 20, 20, 20, 15, 10, 2],
  [4, 12, 20, 25, 25, 25, 20, 12, 4],
  [6, 16, 25, 30, 30, 30, 25, 16, 6],
  [8, 20, 30, 35, 35, 35, 30, 20, 8],
  [10, 24, 35, 40, 40, 40, 35, 24, 10],
  [12, 25, 35, 40, 40, 40, 35, 25, 12],
  [10, 20, 30, 30, 30, 30, 30, 20, 10],
  [0, 10, 15, 15, 15, 15, 15, 10, 0],
];

const CANNON_PST = [
  [0, 0, 2, 6, 6, 6, 2, 0, 0],
  [0, 2, 4, 6, 8, 6, 4, 2, 0],
  [0, 4, 8, 10, 12, 10, 8, 4, 0],
  [0, 6, 10, 14, 16, 14, 10, 6, 0],
  [2, 8, 12, 16, 18, 16, 12, 8, 2],
  [2, 8, 12, 16, 18, 16, 12, 8, 2],
  [2, 8, 12, 16, 18, 16, 12, 8, 2],
  [4, 10, 14, 18, 20, 18, 14, 10, 4],
  [2, 6, 8, 10, 12, 10, 8, 6, 2],
  [0, 2, 4, 6, 8, 6, 4, 2, 0],
];

const CHARIOT_PST = [
  [0, 0, 4, 8, 8, 8, 4, 0, 0],
  [4, 8, 10, 12, 12, 12, 10, 8, 4],
  [4, 8, 10, 14, 14, 14, 10, 8, 4],
  [6, 10, 12, 16, 16, 16, 12, 10, 6],
  [8, 12, 14, 18, 20, 18, 14, 12, 8],
  [10, 14, 16, 20, 22, 20, 16, 14, 10],
  [12, 16, 18, 22, 24, 22, 18, 16, 12],
  [14, 18, 20, 24, 26, 24, 20, 18, 14],
  [14, 18, 20, 24, 26, 24, 20, 18, 14],
  [10, 14, 16, 20, 20, 20, 16, 14, 10],
];

const SOLDIER_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 2, 4, 6, 4, 2, 0, 0],
  [0, 4, 8, 12, 16, 12, 8, 4, 0],
  [10, 18, 22, 35, 40, 35, 22, 18, 10],
  [20, 30, 40, 55, 60, 55, 40, 30, 20],
  [30, 45, 60, 75, 80, 75, 60, 45, 30],
  [40, 60, 80, 95, 100, 95, 80, 60, 40],
  [20, 30, 40, 50, 50, 50, 40, 30, 20],
];

/**
 * Creates the initial starting Chinese Chess game state.
 */
export function createGame(): GameState {
  const board: (Piece | null)[][] = Array.from({ length: 9 }, () =>
    Array.from({ length: 10 }, () => null)
  );

  let idCounter = 1;
  const addPiece = (side: Side, kind: PieceKind, x: number, y: number) => {
    const piece: Piece = { id: idCounter++, side, kind, x, y };
    board[x][y] = piece;
  };

  // 1. Red Pieces (Bottom, y=0..3)
  addPiece('red', 'chariot', 0, 0);
  addPiece('red', 'horse', 1, 0);
  addPiece('red', 'elephant', 2, 0);
  addPiece('red', 'advisor', 3, 0);
  addPiece('red', 'general', 4, 0);
  addPiece('red', 'advisor', 5, 0);
  addPiece('red', 'elephant', 6, 0);
  addPiece('red', 'horse', 7, 0);
  addPiece('red', 'chariot', 8, 0);
  addPiece('red', 'cannon', 1, 2);
  addPiece('red', 'cannon', 7, 2);
  addPiece('red', 'soldier', 0, 3);
  addPiece('red', 'soldier', 2, 3);
  addPiece('red', 'soldier', 4, 3);
  addPiece('red', 'soldier', 6, 3);
  addPiece('red', 'soldier', 8, 3);

  // 2. Black Pieces (Top, y=6..9)
  addPiece('black', 'chariot', 0, 9);
  addPiece('black', 'horse', 1, 9);
  addPiece('black', 'elephant', 2, 9);
  addPiece('black', 'advisor', 3, 9);
  addPiece('black', 'general', 4, 9);
  addPiece('black', 'advisor', 5, 9);
  addPiece('black', 'elephant', 6, 9);
  addPiece('black', 'horse', 7, 9);
  addPiece('black', 'chariot', 8, 9);
  addPiece('black', 'cannon', 1, 7);
  addPiece('black', 'cannon', 7, 7);
  addPiece('black', 'soldier', 0, 6);
  addPiece('black', 'soldier', 2, 6);
  addPiece('black', 'soldier', 4, 6);
  addPiece('black', 'soldier', 6, 6);
  addPiece('black', 'soldier', 8, 6);

  return {
    board,
    turn: 'red',
    status: 'ready',
    winner: null,
    history: [],
    capturedRed: [],
    capturedBlack: [],
    isCheck: false,
    lastMove: null,
  };
}

/** Check if coordinates are inside the 9x10 board. */
export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x <= 8 && y >= 0 && y <= 9;
}

/** Check if coordinates are inside the Palace. */
export function inPalace(x: number, y: number, side: Side): boolean {
  if (x < 3 || x > 5) return false;
  return side === 'red' ? y >= 0 && y <= 2 : y >= 7 && y <= 9;
}

/** Check if coordinates have crossed the river from the given side's perspective. */
export function hasCrossedRiver(y: number, side: Side): boolean {
  return side === 'red' ? y >= 5 : y <= 4;
}

/** Count pieces strictly between (x1, y1) and (x2, y2) along orthogonal ray. */
export function countPiecesBetween(
  board: (Piece | null)[][],
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  let count = 0;
  if (x1 === x2) {
    const minY = Math.min(y1, y2) + 1;
    const maxY = Math.max(y1, y2);
    for (let y = minY; y < maxY; y++) {
      if (board[x1][y] !== null) count++;
    }
  } else if (y1 === y2) {
    const minX = Math.min(x1, x2) + 1;
    const maxX = Math.max(x1, x2);
    for (let x = minX; x < maxX; x++) {
      if (board[x][y1] !== null) count++;
    }
  }
  return count;
}

/** Find the General for a given side. */
export function findGeneral(board: (Piece | null)[][], side: Side): Piece | null {
  const minY = side === 'red' ? 0 : 7;
  const maxY = side === 'red' ? 2 : 9;
  for (let x = 3; x <= 5; x++) {
    for (let y = minY; y <= maxY; y++) {
      const p = board[x][y];
      if (p && p.side === side && p.kind === 'general') return p;
    }
  }
  return null;
}

/**
 * Checks if the two Generals face each other directly with no intervening pieces (Flying General / 飛將).
 */
export function areGeneralsFacing(board: (Piece | null)[][]): boolean {
  const redGen = findGeneral(board, 'red');
  const blackGen = findGeneral(board, 'black');
  if (!redGen || !blackGen) return false;
  if (redGen.x !== blackGen.x) return false;
  return countPiecesBetween(board, redGen.x, redGen.y, blackGen.x, blackGen.y) === 0;
}

/**
 * Generates all candidate pseudo-legal moves for a specific piece.
 */
export function generatePiecePseudoMoves(
  board: (Piece | null)[][],
  piece: Piece
): Move[] {
  const moves: Move[] = [];
  const { x, y, side, kind } = piece;

  const tryAdd = (toX: number, toY: number) => {
    if (!inBounds(toX, toY)) return;
    const target = board[toX][toY];
    if (target && target.side === side) return; // friendly piece occupied
    moves.push({
      fromX: x,
      fromY: y,
      toX,
      toY,
      piece,
      captured: target || undefined,
    });
  };

  if (kind === 'general') {
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (inPalace(nx, ny, side)) tryAdd(nx, ny);
    }
  } else if (kind === 'advisor') {
    const dirs = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (inPalace(nx, ny, side)) tryAdd(nx, ny);
    }
  } else if (kind === 'elephant') {
    const dirs = [
      [2, 2, 1, 1],
      [2, -2, 1, -1],
      [-2, 2, -1, 1],
      [-2, -2, -1, -1],
    ];
    for (const [dx, dy, eyeX, eyeY] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      // Elephant cannot cross the river
      if (hasCrossedRiver(ny, side)) continue;
      // Check eye obstruction (塞象眼)
      if (board[x + eyeX][y + eyeY] !== null) continue;
      tryAdd(nx, ny);
    }
  } else if (kind === 'horse') {
    // 8 possible L-shaped destinations with leg obstruction (拐馬腳) checks
    const jumps = [
      [1, 2, 0, 1],
      [-1, 2, 0, 1],
      [1, -2, 0, -1],
      [-1, -2, 0, -1],
      [2, 1, 1, 0],
      [2, -1, 1, 0],
      [-2, 1, -1, 0],
      [-2, -1, -1, 0],
    ];
    for (const [dx, dy, legX, legY] of jumps) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      // Check horse leg obstruction (蹩馬腿)
      if (board[x + legX][y + legY] !== null) continue;
      tryAdd(nx, ny);
    }
  } else if (kind === 'chariot') {
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    for (const [dx, dy] of dirs) {
      let nx = x + dx;
      let ny = y + dy;
      while (inBounds(nx, ny)) {
        const target = board[nx][ny];
        if (target === null) {
          tryAdd(nx, ny);
        } else {
          if (target.side !== side) tryAdd(nx, ny);
          break;
        }
        nx += dx;
        ny += dy;
      }
    }
  } else if (kind === 'cannon') {
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    for (const [dx, dy] of dirs) {
      let nx = x + dx;
      let ny = y + dy;
      let foundScreen = false;
      while (inBounds(nx, ny)) {
        const target = board[nx][ny];
        if (!foundScreen) {
          if (target === null) {
            tryAdd(nx, ny); // normal slide
          } else {
            foundScreen = true; // found screen / 炮架
          }
        } else {
          if (target !== null) {
            if (target.side !== side) tryAdd(nx, ny); // capture jump
            break;
          }
        }
        nx += dx;
        ny += dy;
      }
    }
  } else if (kind === 'soldier') {
    const forward = side === 'red' ? 1 : -1;
    // Always can move 1 step forward
    tryAdd(x, y + forward);
    // Across the river: can also move 1 step sideways
    if (hasCrossedRiver(y, side)) {
      tryAdd(x - 1, y);
      tryAdd(x + 1, y);
    }
  }

  return moves;
}

/**
 * Check if the given side's General is currently in check.
 */
export function isSideInCheck(board: (Piece | null)[][], side: Side): boolean {
  if (areGeneralsFacing(board)) return true;

  const general = findGeneral(board, side);
  if (!general) return true; // Captured / invalid state

  const opponentSide: Side = side === 'red' ? 'black' : 'red';
  for (let x = 0; x < 9; x++) {
    for (let y = 0; y < 10; y++) {
      const piece = board[x][y];
      if (piece && piece.side === opponentSide) {
        const moves = generatePiecePseudoMoves(board, piece);
        if (moves.some((m) => m.toX === general.x && m.toY === general.y)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Apply a move to the board (mutating), returns an undo token.
 */
export function applyMove(board: (Piece | null)[][], move: Move): () => void {
  const { fromX, fromY, toX, toY, piece, captured } = move;
  board[fromX][fromY] = null;
  board[toX][toY] = { ...piece, x: toX, y: toY };

  return () => {
    board[fromX][fromY] = piece;
    board[toX][toY] = captured || null;
  };
}

/**
 * Formats a move in authentic traditional Chinese Chess notation (e.g. 炮二平五, 馬8進7).
 */
export function formatXiangqiNotation(
  board: (Piece | null)[][],
  move: Move
): string {
  const { fromX, fromY, toX, toY, piece } = move;
  const side = piece.side;
  const char = CHINESE_PIECE_CHARS[side][piece.kind];

  // From Red's perspective, files are numbered 1 to 9 right-to-left: fileNum = 9 - x.
  // From Black's perspective, files are numbered 1 to 9 right-to-left: fileNum = x + 1.
  const fromFile = side === 'red' ? 9 - fromX : fromX + 1;
  const toFile = side === 'red' ? 9 - toX : toX + 1;

  const fromFileStr = side === 'red' ? CHINESE_DIGITS[fromFile - 1] : String(fromFile);
  const toFileStr = side === 'red' ? CHINESE_DIGITS[toFile - 1] : String(toFile);

  const dy = toY - fromY;
  const isAdvancing = side === 'red' ? dy > 0 : dy < 0;
  const isRetreating = side === 'red' ? dy < 0 : dy > 0;
  const isHorizontal = dy === 0;

  let action = '';
  let target = '';

  if (isHorizontal) {
    action = '平';
    target = toFileStr;
  } else if (isAdvancing) {
    action = '進';
    if (piece.kind === 'horse' || piece.kind === 'elephant' || piece.kind === 'advisor') {
      target = toFileStr;
    } else {
      const steps = Math.abs(dy);
      target = side === 'red' ? CHINESE_DIGITS[steps - 1] : String(steps);
    }
  } else if (isRetreating) {
    action = '退';
    if (piece.kind === 'horse' || piece.kind === 'elephant' || piece.kind === 'advisor') {
      target = toFileStr;
    } else {
      const steps = Math.abs(dy);
      target = side === 'red' ? CHINESE_DIGITS[steps - 1] : String(steps);
    }
  }

  return `${char}${fromFileStr}${action}${target}`;
}

/**
 * Generates all strictly legal moves for a side (filtering out check and flying general violations).
 */
export function generateLegalMoves(
  board: (Piece | null)[][],
  side: Side
): Move[] {
  const legalMoves: Move[] = [];
  for (let x = 0; x < 9; x++) {
    for (let y = 0; y < 10; y++) {
      const piece = board[x][y];
      if (piece && piece.side === side) {
        const candidates = generatePiecePseudoMoves(board, piece);
        for (const move of candidates) {
          const undo = applyMove(board, move);
          const inCheck = isSideInCheck(board, side);
          undo();
          if (!inCheck) {
            move.notation = formatXiangqiNotation(board, move);
            legalMoves.push(move);
          }
        }
      }
    }
  }
  return legalMoves;
}

/**
 * Executes a move on the game state.
 */
export function makeMove(state: GameState, move: Move): GameState {
  const nextBoard = state.board.map((col) => col.map((p) => (p ? { ...p } : null)));
  const undo = applyMove(nextBoard, move);
  void undo;

  const nextTurn: Side = state.turn === 'red' ? 'black' : 'red';
  const capturedRed = [...state.capturedRed];
  const capturedBlack = [...state.capturedBlack];

  if (move.captured) {
    if (move.captured.side === 'red') capturedRed.push(move.captured);
    else capturedBlack.push(move.captured);
  }

  const inCheck = isSideInCheck(nextBoard, nextTurn);
  const nextLegalMoves = generateLegalMoves(nextBoard, nextTurn);

  let status: GameStatus = 'playing';
  let winner: Side | null = null;

  if (nextLegalMoves.length === 0) {
    if (inCheck) {
      status = 'checkmate';
      winner = state.turn; // Attacker won by checkmate
    } else {
      status = 'stalemate';
      winner = state.turn; // In Xiangqi, stalemated player LOSES
    }
  } else if (inCheck) {
    status = 'check';
  }

  return {
    board: nextBoard,
    turn: nextTurn,
    status,
    winner,
    history: [...state.history, move],
    capturedRed,
    capturedBlack,
    isCheck: inCheck,
    lastMove: move,
  };
}

/**
 * Static position evaluation from Red's perspective (positive = Red advantage).
 */
export function evaluateBoard(board: (Piece | null)[][]): number {
  let score = 0;

  for (let x = 0; x < 9; x++) {
    for (let y = 0; y < 10; y++) {
      const p = board[x][y];
      if (!p) continue;

      let val = PIECE_VALUES[p.kind];
      let pstBonus = 0;

      // Add PST bonuses
      if (p.kind === 'horse') {
        pstBonus = p.side === 'red' ? HORSE_PST[y][x] : HORSE_PST[9 - y][x];
      } else if (p.kind === 'cannon') {
        pstBonus = p.side === 'red' ? CANNON_PST[y][x] : CANNON_PST[9 - y][x];
      } else if (p.kind === 'chariot') {
        pstBonus = p.side === 'red' ? CHARIOT_PST[y][x] : CHARIOT_PST[9 - y][x];
      } else if (p.kind === 'soldier') {
        pstBonus = p.side === 'red' ? SOLDIER_PST[y][x] : SOLDIER_PST[9 - y][x];
      }

      val += pstBonus;

      if (p.side === 'red') score += val;
      else score -= val;
    }
  }

  return score;
}

/**
 * Quiescence search to evaluate noisy capture positions.
 */
function quiescence(
  board: (Piece | null)[][],
  side: Side,
  alpha: number,
  beta: number,
  maxQDepth: number
): number {
  const standPat = side === 'red' ? evaluateBoard(board) : -evaluateBoard(board);
  if (standPat >= beta || maxQDepth <= 0) return beta;
  if (standPat > alpha) alpha = standPat;

  const moves = generateLegalMoves(board, side).filter((m) => m.captured !== undefined);
  // Sort captures by MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
  moves.sort((a, b) => {
    const valA = PIECE_VALUES[a.captured!.kind] - PIECE_VALUES[a.piece.kind] * 0.1;
    const valB = PIECE_VALUES[b.captured!.kind] - PIECE_VALUES[b.piece.kind] * 0.1;
    return valB - valA;
  });

  const nextSide: Side = side === 'red' ? 'black' : 'red';
  for (const move of moves) {
    const undo = applyMove(board, move);
    const score = -quiescence(board, nextSide, -beta, -alpha, maxQDepth - 1);
    undo();

    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

/**
 * Minimax Alpha-Beta search.
 */
function minimaxAlphaBeta(
  board: (Piece | null)[][],
  side: Side,
  depth: number,
  alpha: number,
  beta: number,
  useQuiescence: boolean
): { score: number; bestMove: Move | null } {
  const legalMoves = generateLegalMoves(board, side);
  if (legalMoves.length === 0) {
    const inCheck = isSideInCheck(board, side);
    // If checkmated or stalemated, massive negative penalty
    return { score: inCheck ? -20000 - depth : -10000 - depth, bestMove: null };
  }

  if (depth <= 0) {
    const score = useQuiescence
      ? quiescence(board, side, alpha, beta, 3)
      : side === 'red'
        ? evaluateBoard(board)
        : -evaluateBoard(board);
    return { score, bestMove: null };
  }

  // Sort candidate moves (captures first)
  legalMoves.sort((a, b) => {
    const capA = a.captured ? PIECE_VALUES[a.captured.kind] : 0;
    const capB = b.captured ? PIECE_VALUES[b.captured.kind] : 0;
    return capB - capA;
  });

  let bestMove: Move | null = legalMoves[0] || null;
  const nextSide: Side = side === 'red' ? 'black' : 'red';

  for (const move of legalMoves) {
    const undo = applyMove(board, move);
    const { score: resScore } = minimaxAlphaBeta(
      board,
      nextSide,
      depth - 1,
      -beta,
      -alpha,
      useQuiescence
    );
    const evalScore = -resScore;
    undo();

    if (evalScore > alpha) {
      alpha = evalScore;
      bestMove = move;
    }
    if (alpha >= beta) break; // Beta cutoff
  }

  return { score: alpha, bestMove };
}

/**
 * Computes the best AI move for the active turn according to difficulty.
 */
export function getAIMove(state: GameState, difficulty: AIDifficulty): Move | null {
  const legalMoves = generateLegalMoves(state.board, state.turn);
  if (legalMoves.length === 0) return null;

  if (difficulty === 'novice') {
    // Novice: Depth 2 + random move perturbation
    if (Math.random() < 0.25) {
      return legalMoves[Math.floor(Math.random() * legalMoves.length)];
    }
    const { bestMove } = minimaxAlphaBeta(
      state.board,
      state.turn,
      2,
      -Infinity,
      Infinity,
      false
    );
    return bestMove || legalMoves[0];
  }

  if (difficulty === 'intermediate') {
    // Intermediate: Depth 3 with Alpha-Beta
    const { bestMove } = minimaxAlphaBeta(
      state.board,
      state.turn,
      3,
      -Infinity,
      Infinity,
      false
    );
    return bestMove || legalMoves[0];
  }

  // Master: Depth 4 with Quiescence search
  const { bestMove } = minimaxAlphaBeta(
    state.board,
    state.turn,
    4,
    -Infinity,
    Infinity,
    true
  );
  return bestMove || legalMoves[0];
}
