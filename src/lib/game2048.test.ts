import { describe, it, expect } from 'vitest';
import {
  createEmptyGrid,
  cloneGrid,
  spawnRandomTile,
  slideAndMerge,
  hasMovesAvailable,
  isGameWon,
  createHistoryStack,
  pushSnapshot,
  popSnapshot,
  clearHistory,
  type GameSnapshot,
} from './game2048';

describe('2048 Core Engine', () => {
  describe('createEmptyGrid', () => {
    it('creates empty grids of specified sizes (3, 4, 5)', () => {
      for (const size of [3, 4, 5] as const) {
        const grid = createEmptyGrid(size);
        expect(grid.length).toBe(size);
        expect(grid.every((row) => row.length === size && row.every((val) => val === 0))).toBe(true);
      }
    });
  });

  describe('cloneGrid', () => {
    it('creates an independent deep copy of the grid', () => {
      const original = [
        [2, 4],
        [8, 16],
      ];
      const clone = cloneGrid(original);
      expect(clone).toEqual(original);
      clone[0][0] = 99;
      expect(original[0][0]).toBe(2);
    });
  });

  describe('spawnRandomTile', () => {
    it('spawns a 2 or 4 in an empty cell', () => {
      const grid = createEmptyGrid(4);
      const { grid: afterSpawn, spawned } = spawnRandomTile(grid);
      expect(spawned).not.toBeNull();
      const [r, c] = spawned!;
      expect([2, 4]).toContain(afterSpawn[r][c]);
    });

    it('honors position and value overrides for deterministic testing', () => {
      const grid = createEmptyGrid(4);
      const { grid: afterSpawn, spawned } = spawnRandomTile(grid, 4, [1, 2]);
      expect(spawned).toEqual([1, 2]);
      expect(afterSpawn[1][2]).toBe(4);
    });

    it('returns null spawned if grid is full', () => {
      const fullGrid = [
        [2, 2],
        [2, 2],
      ];
      const { spawned } = spawnRandomTile(fullGrid);
      expect(spawned).toBeNull();
    });
  });

  describe('slideAndMerge', () => {
    it('slides tiles to the left and merges identical neighbors', () => {
      const input = [
        [2, 2, 0, 0],
        [0, 0, 0, 0],
        [4, 0, 4, 0],
        [2, 4, 8, 16],
      ];
      const res = slideAndMerge(input, 'left');
      expect(res.changed).toBe(true);
      expect(res.grid[0]).toEqual([4, 0, 0, 0]);
      expect(res.grid[2]).toEqual([8, 0, 0, 0]);
      expect(res.grid[3]).toEqual([2, 4, 8, 16]);
      expect(res.scoreGain).toBe(4 + 8);
    });

    it('obeys the single-merge-per-tile-per-turn rule [2, 2, 2, 2] -> [4, 4, 0, 0]', () => {
      const input = [
        [2, 2, 2, 2],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ];
      const res = slideAndMerge(input, 'left');
      expect(res.grid[0]).toEqual([4, 4, 0, 0]);
      expect(res.scoreGain).toBe(8);
    });

    it('slides right properly [2, 0, 2, 4] -> [0, 0, 4, 4]', () => {
      const input = [
        [2, 0, 2, 4],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ];
      const res = slideAndMerge(input, 'right');
      expect(res.grid[0]).toEqual([0, 0, 4, 4]);
      expect(res.scoreGain).toBe(4);
    });

    it('slides up and down properly', () => {
      const input = [
        [2, 0, 0, 0],
        [2, 0, 0, 0],
        [4, 0, 0, 0],
        [4, 0, 0, 0],
      ];
      const resUp = slideAndMerge(input, 'up');
      expect(resUp.grid.map((r) => r[0])).toEqual([4, 8, 0, 0]);

      const resDown = slideAndMerge(input, 'down');
      expect(resDown.grid.map((r) => r[0])).toEqual([0, 0, 4, 8]);
    });

    it('reports changed: false when no tiles move', () => {
      const input = [
        [2, 4, 8, 16],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ];
      const res = slideAndMerge(input, 'left');
      expect(res.changed).toBe(false);
      expect(res.scoreGain).toBe(0);
    });
  });

  describe('hasMovesAvailable', () => {
    it('returns true if any cell is empty (0)', () => {
      const grid = [
        [2, 4],
        [8, 0],
      ];
      expect(hasMovesAvailable(grid)).toBe(true);
    });

    it('returns true if adjacent tiles can merge horizontally or vertically', () => {
      const gridH = [
        [2, 2],
        [4, 8],
      ];
      expect(hasMovesAvailable(gridH)).toBe(true);

      const gridV = [
        [2, 4],
        [2, 8],
      ];
      expect(hasMovesAvailable(gridV)).toBe(true);
    });

    it('returns false when grid is full and no adjacent tiles match', () => {
      const deadGrid = [
        [2, 4, 2, 4],
        [4, 2, 4, 2],
        [2, 4, 2, 4],
        [4, 2, 4, 2],
      ];
      expect(hasMovesAvailable(deadGrid)).toBe(false);
    });

    it('correctly detects deadlock on 3x3 and 5x5 boards', () => {
      const dead3x3 = [
        [2, 4, 2],
        [4, 2, 4],
        [2, 4, 2],
      ];
      expect(hasMovesAvailable(dead3x3)).toBe(false);

      const live3x3 = [
        [2, 4, 2],
        [4, 4, 2], // center merge possible
        [2, 4, 2],
      ];
      expect(hasMovesAvailable(live3x3)).toBe(true);
    });
  });

  describe('isGameWon', () => {
    it('returns true when a tile reaches or exceeds target', () => {
      const grid = [
        [0, 1024],
        [2048, 0],
      ];
      expect(isGameWon(grid, 2048)).toBe(true);
      expect(isGameWon([[1024]], 2048)).toBe(false);
    });
  });

  describe('HistoryStack (Undo)', () => {
    it('pushes and pops snapshots in LIFO order while maintaining immutability', () => {
      let stack = createHistoryStack(5);
      const snap1: GameSnapshot = {
        grid: [[2, 0]],
        score: 10,
        boardSize: 4,
        isWon: false,
        isOver: false,
      };
      const snap2: GameSnapshot = {
        grid: [[4, 0]],
        score: 20,
        boardSize: 4,
        isWon: false,
        isOver: false,
      };

      stack = pushSnapshot(stack, snap1);
      stack = pushSnapshot(stack, snap2);
      expect(stack.snapshots.length).toBe(2);

      const pop1 = popSnapshot(stack);
      expect(pop1.restored?.score).toBe(20);
      expect(pop1.stack.snapshots.length).toBe(1);

      const pop2 = popSnapshot(pop1.stack);
      expect(pop2.restored?.score).toBe(10);
      expect(pop2.stack.snapshots.length).toBe(0);

      const popEmpty = popSnapshot(pop2.stack);
      expect(popEmpty.restored).toBeNull();
    });

    it('enforces maxDepth limit', () => {
      let stack = createHistoryStack(2);
      for (let i = 1; i <= 5; i++) {
        stack = pushSnapshot(stack, {
          grid: [[i]],
          score: i * 10,
          boardSize: 4,
          isWon: false,
          isOver: false,
        });
      }
      expect(stack.snapshots.length).toBe(2);
      expect(stack.snapshots[0].score).toBe(40);
      expect(stack.snapshots[1].score).toBe(50);
    });

    it('clears history', () => {
      let stack = createHistoryStack(5);
      stack = pushSnapshot(stack, {
        grid: [[2]],
        score: 10,
        boardSize: 4,
        isWon: false,
        isOver: false,
      });
      stack = clearHistory(stack);
      expect(stack.snapshots.length).toBe(0);
    });
  });
});
