import { describe, it, expect } from 'vitest';
import {
  mulberry32,
  createGame,
  step,
  turn,
  reset,
  start,
  placeFood,
  BASES,
  type GameState,
  type Dir,
} from './snake';

const seeded = (s = 1) => mulberry32(s);
const occ = (state: GameState) => new Set(state.snake.map((p) => `${p.x},${p.y}`));

describe('mulberry32', () => {
  it('is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('createGame', () => {
  it('sets up a ready, head-first snake heading right', () => {
    const g = createGame({ cols: 17, rows: 17 }, seeded());
    expect(g.status).toBe('ready');
    expect(g.dir).toBe('right');
    expect(g.snake.length).toBe(3);
    expect(g.snake[0].x).toBe(g.snake[1].x + 1); // head right of neck
    expect(g.snake[0].y).toBe(g.snake[1].y);
    expect(g.score).toBe(0);
  });
  it('places food on an empty cell with a valid base', () => {
    const g = createGame({ cols: 17, rows: 17 }, seeded());
    expect(occ(g).has(`${g.food.x},${g.food.y}`)).toBe(false);
    expect(BASES).toContain(g.food.base);
    expect(g.food.x).toBeGreaterThanOrEqual(0);
    expect(g.food.x).toBeLessThan(17);
  });
});

describe('start / step gating', () => {
  it('step is a no-op until the game is playing', () => {
    const g = createGame({ cols: 17, rows: 17 }, seeded());
    const before = JSON.stringify(g.snake);
    step(g, seeded());
    expect(JSON.stringify(g.snake)).toBe(before);
    start(g);
    expect(g.status).toBe('playing');
  });
});

describe('movement', () => {
  it('advances the head one cell and keeps length when not eating', () => {
    const g = createGame({ cols: 17, rows: 17 }, seeded());
    g.food = { x: 0, y: 0, base: 'A' }; // far from center; no accidental eating
    start(g);
    const head0 = { ...g.snake[0] };
    const len0 = g.snake.length;
    step(g, seeded());
    expect(g.snake[0]).toEqual({ x: head0.x + 1, y: head0.y });
    expect(g.snake.length).toBe(len0);
  });
  it('applies a buffered turn on the next step', () => {
    const g = createGame({ cols: 17, rows: 17 }, seeded());
    g.food = { x: 0, y: 0, base: 'A' };
    start(g);
    turn(g, 'down');
    const head0 = { ...g.snake[0] };
    step(g, seeded());
    expect(g.dir).toBe('down');
    expect(g.snake[0]).toEqual({ x: head0.x, y: head0.y + 1 });
  });
});

describe('turn legality', () => {
  it('rejects a 180° reversal of the committed direction', () => {
    const g = createGame({ cols: 17, rows: 17 }, seeded());
    turn(g, 'left'); // opposite of the initial 'right'
    expect(g.pendingDir).toBeNull();
  });
  it('rejects reversing an already-buffered turn (two inputs in one tick)', () => {
    const g = createGame({ cols: 17, rows: 17 }, seeded());
    turn(g, 'down');
    turn(g, 'up'); // would reverse the buffered turn
    expect(g.pendingDir).toBe('down');
  });
  it('cannot fold back into itself via two quick turns within a tick', () => {
    const g = createGame({ cols: 17, rows: 17 }, seeded());
    g.food = { x: 0, y: 0, base: 'A' };
    start(g);
    turn(g, 'up');
    turn(g, 'left');
    step(g, seeded());
    expect(g.status).toBe('playing');
  });
});

describe('collisions', () => {
  it('dies on a wall when wrap is off', () => {
    const g = createGame({ cols: 5, rows: 5 }, seeded());
    g.food = { x: 0, y: 0, base: 'A' };
    start(g);
    for (let i = 0; i < 10 && g.status === 'playing'; i++) step(g, seeded());
    expect(g.status).toBe('over');
  });
  it('wraps instead of dying when wrap is on', () => {
    const g = createGame({ cols: 5, rows: 5, wrap: true, startLength: 1 }, seeded());
    g.food = { x: 0, y: 0, base: 'A' };
    start(g);
    for (let i = 0; i < 20; i++) step(g, seeded());
    expect(g.status).toBe('playing');
    expect(g.snake[0].x).toBeGreaterThanOrEqual(0);
    expect(g.snake[0].x).toBeLessThan(5);
  });
  it('dies when biting a non-tail body cell', () => {
    const g = createGame({ cols: 10, rows: 10 }, seeded());
    g.snake = [
      { x: 2, y: 2 }, // head
      { x: 1, y: 2 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 }, // tail
    ];
    g.dir = 'up';
    g.pendingDir = null;
    g.food = { x: 9, y: 9, base: 'A' };
    g.status = 'playing';
    step(g, seeded()); // head -> (2,1), a non-tail body cell
    expect(g.status).toBe('over');
  });
  it('may move into the vacating tail cell', () => {
    const g = createGame({ cols: 10, rows: 10 }, seeded());
    g.snake = [
      { x: 1, y: 1 }, // head
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 1 }, // tail, directly right of the head
    ];
    g.dir = 'up';
    g.food = { x: 9, y: 9, base: 'A' };
    g.status = 'playing';
    turn(g, 'right'); // into the tail cell, which vacates this tick
    step(g, seeded());
    expect(g.status).toBe('playing');
  });
});

describe('eating', () => {
  it('grows, scores, and replaces food off the snake', () => {
    const g = createGame({ cols: 10, rows: 10 }, seeded());
    g.snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ];
    g.dir = 'right';
    g.food = { x: 6, y: 5, base: 'C' };
    g.status = 'playing';
    step(g, seeded());
    expect(g.score).toBe(1);
    expect(g.snake.length).toBe(4);
    expect(g.snake[0]).toEqual({ x: 6, y: 5 });
    expect(occ(g).has(`${g.food.x},${g.food.y}`)).toBe(false);
    expect(BASES).toContain(g.food.base);
  });
  it('never places food on the snake across many placements', () => {
    const rng = seeded(7);
    for (let trial = 0; trial < 500; trial++) {
      const snake = [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
      ];
      const food = placeFood(6, 6, snake, rng);
      expect(new Set(snake.map((p) => `${p.x},${p.y}`)).has(`${food.x},${food.y}`)).toBe(false);
    }
  });
});

describe('winning', () => {
  it('wins when the snake fills the board', () => {
    const g = createGame({ cols: 2, rows: 2 }, seeded());
    g.snake = [
      { x: 1, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ];
    g.dir = 'left';
    g.food = { x: 0, y: 1, base: 'G' };
    g.status = 'playing';
    step(g, seeded());
    expect(g.status).toBe('won');
    expect(g.snake.length).toBe(4);
  });
});

describe('reset', () => {
  it('returns to a fresh ready game', () => {
    const g = createGame({ cols: 12, rows: 12 }, seeded());
    start(g);
    for (let i = 0; i < 3; i++) step(g, seeded());
    reset(g, seeded());
    expect(g.status).toBe('ready');
    expect(g.snake.length).toBe(3);
    expect(g.score).toBe(0);
  });
});

describe('determinism', () => {
  it('reproduces a game exactly from the same seed', () => {
    const run = (seed: number) => {
      const rng = mulberry32(seed);
      const g = createGame({ cols: 12, rows: 12 }, rng);
      start(g);
      const turns: Dir[] = ['down', 'right', 'up', 'left'];
      for (let i = 0; i < 20; i++) {
        if (i % 4 === 0) turn(g, turns[(i / 4) % 4]);
        step(g, rng);
      }
      return JSON.stringify(g);
    };
    expect(run(99)).toEqual(run(99));
    expect(run(99)).not.toEqual(run(7));
  });
});
