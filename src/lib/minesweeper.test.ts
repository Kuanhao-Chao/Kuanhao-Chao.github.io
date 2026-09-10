import { describe, it, expect } from 'vitest';
import {
  createGame,
  populateMines,
  revealCell,
  toggleFlag,
  chordCell,
  getAdjacentCoords,
  DIFFICULTY_PRESETS,
} from './minesweeper';

describe('Minesweeper Core Engine', () => {
  describe('createGame', () => {
    it('creates standard difficulty grids correctly', () => {
      const beg = createGame('beginner');
      expect(beg.rows).toBe(9);
      expect(beg.cols).toBe(9);
      expect(beg.totalMines).toBe(10);
      expect(beg.status).toBe('ready');
      expect(beg.minesGenerated).toBe(false);

      const inter = createGame('intermediate');
      expect(inter.rows).toBe(16);
      expect(inter.cols).toBe(16);
      expect(inter.totalMines).toBe(40);

      const exp = createGame('expert');
      expect(exp.rows).toBe(16);
      expect(exp.cols).toBe(30);
      expect(exp.totalMines).toBe(99);
    });
  });

  describe('getAdjacentCoords', () => {
    it('returns 8 neighbors for interior cells', () => {
      const adj = getAdjacentCoords(4, 4, 9, 9);
      expect(adj.length).toBe(8);
    });

    it('returns 3 neighbors for corner cells', () => {
      const adj = getAdjacentCoords(0, 0, 9, 9);
      expect(adj.length).toBe(3);
      expect(adj).toEqual(
        expect.arrayContaining([
          [0, 1],
          [1, 0],
          [1, 1],
        ])
      );
    });

    it('returns 5 neighbors for edge cells', () => {
      const adj = getAdjacentCoords(0, 4, 9, 9);
      expect(adj.length).toBe(5);
    });
  });

  describe('populateMines (First-Click Safety)', () => {
    it('guarantees the clicked cell and its adjacent cells are free of mines', () => {
      const game = createGame('beginner');
      populateMines(game, 4, 4);

      expect(game.minesGenerated).toBe(true);
      expect(game.grid[4][4].isMine).toBe(false);

      for (const [r, c] of getAdjacentCoords(4, 4, game.rows, game.cols)) {
        expect(game.grid[r][c].isMine).toBe(false);
      }

      // Total mines count matches
      let count = 0;
      for (let r = 0; r < game.rows; r++) {
        for (let c = 0; c < game.cols; c++) {
          if (game.grid[r][c].isMine) count++;
        }
      }
      expect(count).toBe(10);
    });
  });

  describe('revealCell and Cascade', () => {
    it('automatically generates mines on first click and reveals starting cell', () => {
      const game = createGame('beginner');
      const res = revealCell(game, 4, 4);
      expect(game.status).toBe('playing');
      expect(game.minesGenerated).toBe(true);
      expect(res.exploded).toBe(false);
      expect(res.revealed.length).toBeGreaterThanOrEqual(1);
    });

    it('cascades flood-fill across zero-neighbor cells', () => {
      const game = createGame('beginner');
      // Create a deterministic board where row 0-2 has no mines
      // and row 3 has mines
      game.minesGenerated = true;
      for (let c = 0; c < 9; c++) {
        game.grid[3][c].isMine = true;
      }
      game.totalMines = 9;
      // Recalculate neighbor counts
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (game.grid[r][c].isMine) continue;
          game.grid[r][c].neighborMines = getAdjacentCoords(r, c, 9, 9).filter(
            ([nr, nc]) => game.grid[nr][nc].isMine
          ).length;
        }
      }

      const res = revealCell(game, 0, 0);
      expect(res.exploded).toBe(false);
      // Row 0, 1 (all 0s) and row 2 (perimeter numbers) should all be revealed
      expect(res.revealed.length).toBe(27);
    });

    it('triggers game over when revealing a mine', () => {
      const game = createGame('beginner');
      game.minesGenerated = true;
      game.grid[2][2].isMine = true;

      const res = revealCell(game, 2, 2);
      expect(res.exploded).toBe(true);
      expect(game.status).toBe('lost');
      expect(game.explodedCell).toEqual([2, 2]);
    });
  });

  describe('toggleFlag', () => {
    it('cycles hidden -> flagged -> question -> hidden', () => {
      const game = createGame('beginner');
      expect(game.grid[1][1].state).toBe('hidden');

      const s1 = toggleFlag(game, 1, 1);
      expect(s1).toBe('flagged');
      expect(game.flagsPlaced).toBe(1);

      const s2 = toggleFlag(game, 1, 1);
      expect(s2).toBe('question');
      expect(game.flagsPlaced).toBe(0);

      const s3 = toggleFlag(game, 1, 1);
      expect(s3).toBe('hidden');
      expect(game.flagsPlaced).toBe(0);
    });

    it('does not flag revealed cells', () => {
      const game = createGame('beginner');
      revealCell(game, 0, 0);
      const state = toggleFlag(game, 0, 0);
      expect(state).toBe('revealed');
    });
  });

  describe('chordCell', () => {
    it('chords successfully when surrounding flags match neighbor count', () => {
      const game = createGame('beginner');
      game.minesGenerated = true;
      game.status = 'playing';

      // Setup: (1, 1) has neighbor count 1, and mine is at (0, 0)
      game.grid[0][0].isMine = true;
      game.totalMines = 1;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (game.grid[r][c].isMine) continue;
          game.grid[r][c].neighborMines = getAdjacentCoords(r, c, 9, 9).filter(
            ([nr, nc]) => game.grid[nr][nc].isMine
          ).length;
        }
      }

      game.grid[1][1].state = 'revealed';
      game.grid[0][0].state = 'flagged'; // correct flag
      game.flagsPlaced = 1;

      const res = chordCell(game, 1, 1);
      expect(res.exploded).toBe(false);
      expect(res.revealed.length).toBeGreaterThanOrEqual(1);
    });

    it('explodes if chord reveals a misplaced flag covering a non-mine and leaving a mine unflagged', () => {
      const game = createGame('beginner');
      game.minesGenerated = true;
      game.status = 'playing';

      game.grid[0][0].isMine = true; // real mine
      game.grid[1][1].neighborMines = 1;
      game.grid[1][1].state = 'revealed';
      game.grid[0][1].state = 'flagged'; // wrong flag!

      const res = chordCell(game, 1, 1);
      expect(res.exploded).toBe(true);
      expect(game.status).toBe('lost');
    });
  });

  describe('Win Condition', () => {
    it('sets won status and auto-flags all mines when all non-mines are revealed', () => {
      const game = createGame('custom', { rows: 3, cols: 3, mines: 1 });
      game.minesGenerated = true;
      game.grid[0][0].isMine = true;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (r === 0 && c === 0) continue;
          game.grid[r][c].neighborMines = 1;
        }
      }

      // Reveal all 8 safe cells
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (r === 0 && c === 0) continue;
          revealCell(game, r, c);
        }
      }

      expect(game.status).toBe('won');
      expect(game.grid[0][0].state).toBe('flagged');
      expect(game.flagsPlaced).toBe(1);
    });
  });
});
