import { describe, it, expect } from 'vitest';
import {
  COLS,
  ROWS,
  PIECES,
  createGame,
  start,
  tryMove,
  tryRotate,
  ghostY,
  softDrop,
  hardDrop,
  hold,
  lockPiece,
  reset,
  collides,
  type GameState,
} from './tetris';

const playing = (seed = 1): GameState => {
  const g = createGame(seed);
  start(g);
  return g;
};
const emptyRow = () => new Array(COLS).fill(0);
const fullRowExcept = (...gaps: number[]) => {
  const r = new Array(COLS).fill(1);
  for (const x of gaps) r[x] = 0;
  return r;
};
const T = 2,
  O = 1,
  I = 0;

describe('createGame', () => {
  it('is a ready game with an empty board and a spawned piece', () => {
    const g = createGame(1);
    expect(g.status).toBe('ready');
    expect(g.board.length).toBe(ROWS);
    expect(g.board[0].length).toBe(COLS);
    expect(g.board.flat().every((c) => c === 0)).toBe(true);
    expect(g.current).toBeDefined();
    expect(g.score).toBe(0);
    expect(g.lines).toBe(0);
    expect(g.level).toBe(1);
    expect(g.hold).toBeNull();
    expect(g.canHold).toBe(true);
  });
});

describe('7-bag randomiser', () => {
  it('emits each of the seven pieces once per bag, deterministically', () => {
    const g = createGame(123);
    const seq = [g.current.type, ...g.queue];
    expect([...seq.slice(0, 7)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([...seq.slice(7, 14)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it('same seed → same sequence; different seed → different', () => {
    const a = createGame(42);
    const b = createGame(42);
    const c = createGame(7);
    expect([a.current.type, ...a.queue].slice(0, 14)).toEqual([b.current.type, ...b.queue].slice(0, 14));
    expect([a.current.type, ...a.queue].slice(0, 14)).not.toEqual([c.current.type, ...c.queue].slice(0, 14));
  });
});

describe('spawn positions', () => {
  it('centres pieces on the board', () => {
    expect(PIECES[I].spawnX).toBe(3);
    expect(PIECES[O].spawnX).toBe(4);
    expect(PIECES[T].spawnX).toBe(3);
  });
});

describe('movement & collision', () => {
  it('moves within bounds and is blocked by walls', () => {
    const g = playing();
    g.current = { type: O, rotation: 0, x: 4, y: 5 };
    expect(tryMove(g, -1, 0)).toBe(true);
    expect(g.current.x).toBe(3);
    // shove to the left wall
    while (tryMove(g, -1, 0)) {}
    expect(g.current.x).toBe(0);
    expect(tryMove(g, -1, 0)).toBe(false);
  });
  it('detects floor and stack collisions', () => {
    const g = playing();
    expect(collides(g.board, { type: O, rotation: 0, x: 0, y: ROWS - 1 })).toBe(true); // below floor
    g.board[10][5] = 1;
    expect(collides(g.board, { type: O, rotation: 0, x: 4, y: 9 })).toBe(true); // overlaps (5,10)
  });
});

describe('SRS rotation & wall kicks', () => {
  it('rotates on an empty board and advances the rotation state', () => {
    const g = playing();
    g.current = { type: T, rotation: 0, x: 4, y: 5 };
    expect(tryRotate(g, 1)).toBe(true);
    expect(g.current.rotation).toBe(1);
    expect(tryRotate(g, -1)).toBe(true);
    expect(g.current.rotation).toBe(0);
  });
  it('applies a wall kick when the basic rotation is blocked', () => {
    const g = playing();
    // One block at (x=5,y=6) forces the T 0->R rotation off its first two tests.
    g.board[6][5] = 1;
    g.current = { type: T, rotation: 0, x: 4, y: 5 };
    expect(tryRotate(g, 1)).toBe(true);
    expect(g.current.rotation).toBe(1);
    // kicked away from the origin (SRS test 3 → (-1,-1))
    expect([g.current.x, g.current.y]).toEqual([3, 4]);
    expect(collides(g.board, g.current)).toBe(false);
  });
  it('O piece rotation is a no-op that succeeds', () => {
    const g = playing();
    g.current = { type: O, rotation: 0, x: 4, y: 5 };
    expect(tryRotate(g, 1)).toBe(true);
  });
});

describe('ghost & drops', () => {
  it('ghost rests on the floor on an empty board', () => {
    const g = playing();
    g.current = { type: O, rotation: 0, x: 4, y: 0 };
    expect(ghostY(g)).toBe(ROWS - 2); // O is 2 tall → top row at ROWS-2
  });
  it('soft drop moves down one and scores a point', () => {
    const g = playing();
    g.current = { type: O, rotation: 0, x: 4, y: 0 };
    expect(softDrop(g)).toBe(true);
    expect(g.current.y).toBe(1);
    expect(g.score).toBe(1);
  });
  it('hard drop lands, locks, and scores 2 per cell', () => {
    const g = playing();
    g.current = { type: O, rotation: 0, x: 4, y: 0 };
    const dist = hardDrop(g);
    expect(dist).toBe(ROWS - 2);
    expect(g.score).toBe(dist * 2);
    // O now sits on the floor
    expect(g.board[ROWS - 1][4]).not.toBe(0);
    expect(g.board[ROWS - 1][5]).not.toBe(0);
  });
});

describe('line clears & scoring', () => {
  it('clears a single line and scores 100 × level', () => {
    const g = playing();
    g.board[ROWS - 1] = fullRowExcept(4, 5);
    g.current = { type: O, rotation: 0, x: 4, y: ROWS - 2 };
    lockPiece(g);
    expect(g.lines).toBe(1);
    expect(g.score).toBe(100);
  });
  it('scores a single clear at the current level', () => {
    const g = playing();
    g.level = 3;
    g.board[ROWS - 1] = fullRowExcept(4, 5);
    g.current = { type: O, rotation: 0, x: 4, y: ROWS - 2 };
    lockPiece(g);
    expect(g.score).toBe(300);
  });
  it('clears four lines (tetris) for 800 × level', () => {
    const g = playing();
    for (let y = ROWS - 4; y < ROWS; y++) g.board[y] = fullRowExcept(4);
    g.current = { type: I, rotation: 3, x: 3, y: 0 }; // vertical I over column 4
    hardDrop(g);
    expect(g.lines).toBe(4);
    // hard-drop distance (16) × 2 plus the 800 tetris bonus
    expect(g.score).toBe(16 * 2 + 800);
  });
  it('levels up every ten lines', () => {
    const g = playing();
    g.lines = 9;
    g.board[ROWS - 1] = fullRowExcept(4, 5);
    g.current = { type: O, rotation: 0, x: 4, y: ROWS - 2 };
    lockPiece(g);
    expect(g.lines).toBe(10);
    expect(g.level).toBe(2);
  });
});

describe('hold', () => {
  it('holds, blocks a second hold, then swaps after a lock', () => {
    const g = playing();
    const a = g.current.type;
    expect(hold(g)).toBe(true);
    expect(g.hold).toBe(a);
    expect(g.canHold).toBe(false);
    expect(hold(g)).toBe(false); // cannot hold twice before locking
    const b = g.current.type;
    g.canHold = true; // simulate a lock re-enabling hold
    expect(hold(g)).toBe(true);
    expect(g.hold).toBe(b);
    expect(g.current.type).toBe(a);
  });
});

describe('game over', () => {
  it('ends when a newly spawned piece has no room (block out)', () => {
    const g = playing();
    for (let x = 3; x <= 6; x++) {
      g.board[0][x] = 1;
      g.board[1][x] = 1;
    }
    g.current = { type: O, rotation: 0, x: 4, y: ROWS - 2 }; // locks at the bottom, no clear
    lockPiece(g); // spawns next into the blocked top → over
    expect(g.status).toBe('over');
  });
});

describe('reset', () => {
  it('returns to a fresh ready game', () => {
    const g = playing();
    hardDrop(g);
    reset(g, 5);
    expect(g.status).toBe('ready');
    expect(g.score).toBe(0);
    expect(g.lines).toBe(0);
    expect(g.board.flat().every((c) => c === 0)).toBe(true);
  });
});
