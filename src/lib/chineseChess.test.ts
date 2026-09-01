import { describe, it, expect } from 'vitest';
import {
  createGame,
  generateLegalMoves,
  makeMove,
  isSideInCheck,
  formatXiangqiNotation,
  getAIMove,
  inPalace,
  hasCrossedRiver,
  areGeneralsFacing,
  type Piece,
  type Move,
} from './chineseChess';

describe('Chinese Chess (Xiangqi) Engine', () => {
  it('initializes board with correct piece counts and positions', () => {
    const game = createGame();
    expect(game.turn).toBe('red');
    expect(game.status).toBe('ready');

    let redCount = 0;
    let blackCount = 0;
    for (let x = 0; x < 9; x++) {
      for (let y = 0; y < 10; y++) {
        const p = game.board[x][y];
        if (p) {
          if (p.side === 'red') redCount++;
          else blackCount++;
        }
      }
    }
    expect(redCount).toBe(16);
    expect(blackCount).toBe(16);

    // Verify Red King at (4, 0) and Black King at (4, 9)
    expect(game.board[4][0]?.kind).toBe('general');
    expect(game.board[4][0]?.side).toBe('red');
    expect(game.board[4][9]?.kind).toBe('general');
    expect(game.board[4][9]?.side).toBe('black');
  });

  it('correctly identifies palace coordinates and river boundaries', () => {
    expect(inPalace(4, 0, 'red')).toBe(true);
    expect(inPalace(3, 2, 'red')).toBe(true);
    expect(inPalace(2, 1, 'red')).toBe(false);
    expect(inPalace(4, 3, 'red')).toBe(false);

    expect(inPalace(4, 9, 'black')).toBe(true);
    expect(inPalace(5, 7, 'black')).toBe(true);
    expect(inPalace(6, 8, 'black')).toBe(false);
    expect(inPalace(4, 6, 'black')).toBe(false);

    expect(hasCrossedRiver(4, 'red')).toBe(false);
    expect(hasCrossedRiver(5, 'red')).toBe(true);
    expect(hasCrossedRiver(5, 'black')).toBe(false);
    expect(hasCrossedRiver(4, 'black')).toBe(true);
  });

  it('generates 44 initial legal moves for Red on starting turn', () => {
    const game = createGame();
    const moves = generateLegalMoves(game.board, 'red');
    expect(moves.length).toBe(44);
    // Cannons at (1,2) and (7,2) have legal slide moves
    const cannonMoves = moves.filter((m) => m.piece.kind === 'cannon');
    expect(cannonMoves.length).toBe(24);
  });

  it('properly enforces horse leg blocking (拐馬腳 / 蹩馬腿)', () => {
    const board: (Piece | null)[][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 10 }, () => null)
    );
    // Put Kings on non-facing files so they don't block other moves
    board[3][0] = { id: 1, side: 'red', kind: 'general', x: 3, y: 0 };
    board[5][9] = { id: 2, side: 'black', kind: 'general', x: 5, y: 9 };
    // Put a horse at (4, 4)
    board[4][4] = { id: 3, side: 'red', kind: 'horse', x: 4, y: 4 };

    // With no obstacles, horse has 8 moves
    let moves = generateLegalMoves(board, 'red').filter((m) => m.piece.kind === 'horse');
    expect(moves.length).toBe(8);

    // Place an obstacle directly above the horse at (4, 5) -> blocks upward jumps (3,6) and (5,6)
    board[4][5] = { id: 4, side: 'red', kind: 'soldier', x: 4, y: 5 };
    moves = generateLegalMoves(board, 'red').filter((m) => m.piece.kind === 'horse');
    expect(moves.length).toBe(6);
    expect(moves.some((m) => m.toX === 3 && m.toY === 6)).toBe(false);
    expect(moves.some((m) => m.toX === 5 && m.toY === 6)).toBe(false);

    // Place another obstacle to the right at (5, 4) -> blocks rightward jumps (6,5) and (6,3)
    board[5][4] = { id: 5, side: 'black', kind: 'soldier', x: 5, y: 4 };
    moves = generateLegalMoves(board, 'red').filter((m) => m.piece.kind === 'horse');
    expect(moves.length).toBe(4);
    expect(moves.some((m) => m.toX === 6 && m.toY === 5)).toBe(false);
    expect(moves.some((m) => m.toX === 6 && m.toY === 3)).toBe(false);
  });

  it('properly enforces elephant eye blocking (塞象眼) and river limits', () => {
    const board: (Piece | null)[][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 10 }, () => null)
    );
    board[3][0] = { id: 1, side: 'red', kind: 'general', x: 3, y: 0 };
    board[5][9] = { id: 2, side: 'black', kind: 'general', x: 5, y: 9 };
    // Red Elephant at (2, 4) - near river
    board[2][4] = { id: 3, side: 'red', kind: 'elephant', x: 2, y: 4 };

    // Elephant cannot cross the river (y >= 5 is illegal)
    let moves = generateLegalMoves(board, 'red').filter((m) => m.piece.kind === 'elephant');
    // From (2, 4): (0, 2) and (4, 2) are valid; (0, 6) and (4, 6) across river are invalid
    expect(moves.length).toBe(2);
    expect(moves.map((m) => `(${m.toX},${m.toY})`)).toContain('(0,2)');
    expect(moves.map((m) => `(${m.toX},${m.toY})`)).toContain('(4,2)');

    // Place an obstacle in the eye towards (0, 2) at (1, 3)
    board[1][3] = { id: 4, side: 'black', kind: 'soldier', x: 1, y: 3 };
    moves = generateLegalMoves(board, 'red').filter((m) => m.piece.kind === 'elephant');
    expect(moves.length).toBe(1);
    expect(moves[0].toX).toBe(4);
    expect(moves[0].toY).toBe(2);
  });

  it('cannon can slide when not capturing and must hop exactly one screen piece to capture', () => {
    const board: (Piece | null)[][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 10 }, () => null)
    );
    board[3][0] = { id: 1, side: 'red', kind: 'general', x: 3, y: 0 };
    board[5][9] = { id: 2, side: 'black', kind: 'general', x: 5, y: 9 };
    // Red Cannon at (1, 2)
    board[1][2] = { id: 3, side: 'red', kind: 'cannon', x: 1, y: 2 };
    // Friendly screen at (1, 5)
    board[1][5] = { id: 4, side: 'red', kind: 'soldier', x: 1, y: 5 };
    // Enemy target at (1, 8)
    board[1][8] = { id: 5, side: 'black', kind: 'horse', x: 1, y: 8 };

    const moves = generateLegalMoves(board, 'red').filter((m) => m.piece.kind === 'cannon');
    // Slides up to (1, 3) and (1, 4)
    expect(moves.some((m) => m.toX === 1 && m.toY === 3)).toBe(true);
    expect(moves.some((m) => m.toX === 1 && m.toY === 4)).toBe(true);
    // Cannot land on friendly screen (1, 5)
    expect(moves.some((m) => m.toX === 1 && m.toY === 5)).toBe(false);
    // Cannot slide to empty squares past screen without capturing
    expect(moves.some((m) => m.toX === 1 && m.toY === 6)).toBe(false);
    // Can capture enemy target across screen at (1, 8)
    const capMove = moves.find((m) => m.toX === 1 && m.toY === 8);
    expect(capMove).toBeDefined();
    expect(capMove?.captured?.kind).toBe('horse');
  });

  it('enforces Flying General (飛將 / 對面笑) rule', () => {
    const board: (Piece | null)[][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 10 }, () => null)
    );
    board[4][0] = { id: 1, side: 'red', kind: 'general', x: 4, y: 0 };
    board[4][9] = { id: 2, side: 'black', kind: 'general', x: 4, y: 9 };

    // With nothing between them, generals face each other!
    expect(areGeneralsFacing(board)).toBe(true);

    // Place an intervening piece at (4, 5)
    board[4][5] = { id: 3, side: 'red', kind: 'soldier', x: 4, y: 5 };
    expect(areGeneralsFacing(board)).toBe(false);

    // The soldier at (4, 5) cannot move sideways because it would expose the generals to each other
    const soldierMoves = generateLegalMoves(board, 'red').filter((m) => m.piece.kind === 'soldier');
    expect(soldierMoves.some((m) => m.toX === 3 && m.toY === 5)).toBe(false);
    expect(soldierMoves.some((m) => m.toX === 5 && m.toY === 5)).toBe(false);
    // Moving forward is legal
    expect(soldierMoves.some((m) => m.toX === 4 && m.toY === 6)).toBe(true);
  });

  it('soldiers gain lateral movement after crossing the river', () => {
    const board: (Piece | null)[][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 10 }, () => null)
    );
    board[3][0] = { id: 1, side: 'red', kind: 'general', x: 3, y: 0 };
    board[5][9] = { id: 2, side: 'black', kind: 'general', x: 5, y: 9 };

    // Soldier before river at (0, 3)
    board[0][3] = { id: 3, side: 'red', kind: 'soldier', x: 0, y: 3 };
    let moves = generateLegalMoves(board, 'red').filter((m) => m.fromX === 0 && m.fromY === 3);
    expect(moves.length).toBe(1);
    expect(moves[0].toX).toBe(0);
    expect(moves[0].toY).toBe(4);

    // Soldier across river at (2, 6)
    board[2][6] = { id: 4, side: 'red', kind: 'soldier', x: 2, y: 6 };
    moves = generateLegalMoves(board, 'red').filter((m) => m.fromX === 2 && m.fromY === 6);
    expect(moves.length).toBe(3); // (2,7), (1,6), (3,6)
    expect(moves.some((m) => m.toX === 2 && m.toY === 7)).toBe(true);
    expect(moves.some((m) => m.toX === 1 && m.toY === 6)).toBe(true);
    expect(moves.some((m) => m.toX === 3 && m.toY === 6)).toBe(true);
  });

  it('formats traditional Xiangqi notation correctly', () => {
    const game = createGame();
    // Move Red central cannon from file 2 (x=7): (7, 2) to (4, 2) -> 炮二平五
    const cannonMove: Move = {
      fromX: 7,
      fromY: 2,
      toX: 4,
      toY: 2,
      piece: game.board[7][2]!,
    };
    expect(formatXiangqiNotation(game.board, cannonMove)).toBe('炮二平五');

    // Move Red horse from file 8 (x=1): (1, 0) to (2, 2) -> 傌八進七
    const horseMove: Move = {
      fromX: 1,
      fromY: 0,
      toX: 2,
      toY: 2,
      piece: game.board[1][0]!,
    };
    expect(formatXiangqiNotation(game.board, horseMove)).toBe('傌八進七');

    // Move Black horse from file 2 (x=1): (1, 9) to (2, 7) -> 馬2進3
    const blackHorseMove: Move = {
      fromX: 1,
      fromY: 9,
      toX: 2,
      toY: 7,
      piece: game.board[1][9]!,
    };
    expect(formatXiangqiNotation(game.board, blackHorseMove)).toBe('馬2進3');
  });

  it('handles check and checkmate detection accurately', () => {
    const board: (Piece | null)[][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 10 }, () => null)
    );
    // Put kings on different files to avoid flying general check
    board[3][0] = { id: 1, side: 'red', kind: 'general', x: 3, y: 0 };
    board[4][9] = { id: 2, side: 'black', kind: 'general', x: 4, y: 9 };
    // Red Chariot delivers check at (4, 8)
    board[4][8] = { id: 3, side: 'red', kind: 'chariot', x: 4, y: 8 };

    expect(isSideInCheck(board, 'black')).toBe(true);

    // Black can capture the checking chariot with King (4,9)->(4,8) or move King (4,9)->(5,9)
    const legalMoves = generateLegalMoves(board, 'black');
    expect(legalMoves.length).toBeGreaterThan(0);
    expect(legalMoves.some((m) => m.toX === 4 && m.toY === 8)).toBe(true);
  });

  it('evaluates AI moves deterministically across Novice, Intermediate, and Master levels', () => {
    const game = createGame();
    const noviceMove = getAIMove(game, 'novice');
    expect(noviceMove).toBeDefined();
    expect(noviceMove?.piece.side).toBe('red');

    const intermediateMove = getAIMove(game, 'intermediate');
    expect(intermediateMove).toBeDefined();
    expect(intermediateMove?.piece.side).toBe('red');

    const masterMove = getAIMove(game, 'master');
    expect(masterMove).toBeDefined();
    expect(masterMove?.piece.side).toBe('red');
  });
});
