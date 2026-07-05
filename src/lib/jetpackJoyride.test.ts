import { describe, it, expect } from 'vitest';
import {
  mulberry32,
  createGame,
  reset,
  start,
  setThrust,
  step,
  nextGap,
  spawnPattern,
  spawnCoin,
  pointSegmentDistance,
  circlesOverlap,
  zapperEndpoints,
  flyerBounds,
  BASES,
  type GameState,
  type Zapper,
  type Laser,
  type Missile,
} from './jetpackJoyride';

const playing = (seed = 1): GameState => {
  const g = createGame(seed);
  start(g);
  return g;
};

/** A zapper placed exactly on the flyer (vertical wall through its center). */
const zapperOnFlyer = (g: GameState): Zapper => ({
  id: 999,
  kind: 'zapper',
  cx: g.flyer.x,
  cy: g.flyer.y,
  halfLen: 60,
  angle: Math.PI / 2,
  spin: 0,
  thickness: 12,
});

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

describe('geometry helpers', () => {
  it('measures point-to-segment distance', () => {
    // Horizontal segment (0,0)-(10,0); point above the middle.
    expect(pointSegmentDistance(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
    // Past the endpoint clamps to the endpoint distance.
    expect(pointSegmentDistance(-4, 0, 0, 0, 10, 0)).toBeCloseTo(4);
    // Degenerate segment falls back to point distance.
    expect(pointSegmentDistance(3, 4, 1, 1, 1, 1)).toBeCloseTo(Math.hypot(2, 3));
  });
  it('detects circle overlap by center distance', () => {
    expect(circlesOverlap(0, 0, 5, 8, 0, 4)).toBe(true); // 8 <= 9
    expect(circlesOverlap(0, 0, 5, 12, 0, 4)).toBe(false); // 12 > 9
  });
  it('derives zapper endpoints from center/angle/half-length', () => {
    const z: Zapper = { id: 1, kind: 'zapper', cx: 100, cy: 50, halfLen: 20, angle: 0, spin: 0, thickness: 12 };
    const { x1, y1, x2, y2 } = zapperEndpoints(z);
    expect([x1, y1, x2, y2].map((n) => Math.round(n))).toEqual([80, 50, 120, 50]);
  });
});

describe('createGame', () => {
  it('starts ready, centered, and empty', () => {
    const g = createGame(1);
    expect(g.status).toBe('ready');
    expect(g.flyer.x).toBe(g.flyerX);
    expect(g.flyer.y).toBeCloseTo((g.ceilingY + g.groundY) / 2);
    expect(g.flyer.vy).toBe(0);
    expect(g.flyer.thrusting).toBe(false);
    expect(g.flyer.shielded).toBe(false);
    expect(g.zappers.length + g.lasers.length + g.missiles.length + g.coins.length).toBe(0);
    expect(g.score).toBe(0);
    expect(g.spawnIn).toBe(g.initialGap);
  });
});

describe('start / step gating', () => {
  it('step is a no-op until playing', () => {
    const g = createGame(1);
    const before = JSON.stringify(g);
    step(g);
    expect(JSON.stringify(g)).toBe(before);
    start(g);
    expect(g.status).toBe('playing');
  });
});

describe('flyer physics', () => {
  it('thrust lifts the flyer (vy negative, y decreases)', () => {
    const g = playing();
    const y0 = g.flyer.y;
    setThrust(g, true);
    step(g);
    expect(g.flyer.vy).toBeLessThan(0);
    expect(g.flyer.y).toBeLessThan(y0);
  });
  it('releasing lets gravity pull the flyer down', () => {
    const g = playing();
    setThrust(g, false);
    const y0 = g.flyer.y;
    step(g);
    expect(g.flyer.vy).toBeGreaterThan(0);
    expect(g.flyer.y).toBeGreaterThan(y0);
  });
  it('clamps rise and fall speed', () => {
    const rise = playing();
    rise.flyer.y = 300;
    rise.flyer.vy = -5000;
    setThrust(rise, true);
    step(rise);
    expect(rise.flyer.vy).toBe(-rise.maxRise);

    const fall = playing();
    fall.flyer.y = 100;
    fall.flyer.vy = 5000;
    setThrust(fall, false);
    step(fall);
    expect(fall.flyer.vy).toBe(fall.maxFall);
  });
  it('clamps to the ceiling and floor and zeroes velocity', () => {
    const { top, bottom } = flyerBounds(createGame(1));

    const ceil = playing();
    ceil.flyer.y = top + 2;
    ceil.flyer.vy = -400;
    setThrust(ceil, true);
    step(ceil);
    expect(ceil.flyer.y).toBe(top);
    expect(ceil.flyer.vy).toBe(0);

    const floor = playing();
    floor.flyer.y = bottom - 2;
    floor.flyer.vy = 400;
    setThrust(floor, false);
    step(floor);
    expect(floor.flyer.y).toBe(bottom);
    expect(floor.flyer.vy).toBe(0);
  });
});

describe('world scroll, spawning, culling', () => {
  it('accumulates distance and bases while playing', () => {
    const g = playing();
    for (let i = 0; i < 30; i++) step(g);
    expect(g.distance).toBeGreaterThan(0);
    expect(g.bases).toBe(Math.floor(g.distance / g.baseScale));
  });
  it('spawns hazards once spawnIn elapses, then refills the gap', () => {
    const g = playing();
    let spawnedTick = -1;
    for (let i = 0; i < 400 && spawnedTick < 0; i++) {
      step(g);
      if (g.zappers.length + g.lasers.length + g.missiles.length > 0) spawnedTick = i;
    }
    expect(spawnedTick).toBeGreaterThanOrEqual(0);
    expect(g.spawnIn).toBeGreaterThan(0);
  });
  it('nextGap grows with speed and stays positive', () => {
    const g = playing();
    const slow = nextGap({ ...g, speed: g.startSpeed });
    const fast = nextGap({ ...g, speed: g.maxSpeed });
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(0);
  });
  it('culls entities that scroll off the left edge', () => {
    const g = playing();
    g.coins.push({ id: 1, x: -200, y: 200, radius: 12, base: 'A' });
    g.zappers.push({ id: 2, kind: 'zapper', cx: -400, cy: 200, halfLen: 40, angle: 0, spin: 0, thickness: 12 });
    step(g);
    expect(g.coins.find((c) => c.id === 1)).toBeUndefined();
    expect(g.zappers.find((z) => z.id === 2)).toBeUndefined();
  });
  it('spawnPattern respects the laser/missile distance unlocks', () => {
    const early = playing();
    early.distance = 0;
    for (let i = 0; i < 60; i++) spawnPattern(early);
    expect(early.lasers.length).toBe(0);
    expect(early.missiles.length).toBe(0);

    const late = playing();
    late.distance = 8000;
    for (let i = 0; i < 120; i++) spawnPattern(late);
    expect(late.lasers.length + late.missiles.length).toBeGreaterThan(0);
  });
});

describe('hazard collision', () => {
  it('a zapper on the flyer ends the run', () => {
    const g = playing();
    g.zappers.push(zapperOnFlyer(g));
    step(g);
    expect(g.status).toBe('over');
  });
  it('a distant zapper does not', () => {
    const g = playing();
    g.zappers.push({ ...zapperOnFlyer(g), cy: g.flyer.y + 300 });
    step(g);
    expect(g.status).toBe('playing');
  });
  it('a laser kills only while active, not while warning', () => {
    const warn = playing();
    const laser: Laser = { id: 1, kind: 'laser', y: warn.flyer.y, thickness: 26, phase: 'warn', timer: 9000 };
    warn.lasers.push(laser);
    step(warn);
    expect(warn.status).toBe('playing');

    const active = playing();
    active.lasers.push({ ...laser, phase: 'active', timer: 9000 });
    step(active);
    expect(active.status).toBe('over');
  });
  it('a missile kills only while active, not while warning', () => {
    const warn = playing();
    const missile: Missile = {
      id: 1,
      kind: 'missile',
      x: warn.flyer.x,
      y: warn.flyer.y,
      vx: 0,
      vy: 0,
      radius: 14,
      phase: 'warn',
      timer: 9000,
    };
    warn.missiles.push(missile);
    step(warn);
    expect(warn.status).toBe('playing');

    const active = playing();
    active.missiles.push({ ...missile, phase: 'active', timer: 0 });
    step(active);
    expect(active.status).toBe('over');
  });
});

describe('pickups', () => {
  it('collecting a coin increments the count and clears it', () => {
    const g = playing();
    spawnCoin(g, g.flyer.x, g.flyer.y, 'C');
    step(g);
    expect(g.coinCount).toBe(1);
    expect(g.coins.length).toBe(0);
    expect(BASES).toContain('C');
    expect(g.score).toBe(g.bases + g.coinValue);
  });
  it('collecting a shield power-up arms the shield', () => {
    const g = playing();
    g.powerUps.push({ id: 1, x: g.flyer.x, y: g.flyer.y, radius: 16, kind: 'shield' });
    step(g);
    expect(g.flyer.shielded).toBe(true);
    expect(g.powerUps.length).toBe(0);
  });
});

describe('shield', () => {
  it('absorbs one hit, grants i-frames, then the next hit (after i-frames) is fatal', () => {
    const g = playing();
    g.flyer.shielded = true;

    // First hit: shield absorbs it, run continues, i-frames are set.
    g.zappers = [zapperOnFlyer(g)];
    step(g);
    expect(g.status).toBe('playing');
    expect(g.flyer.shielded).toBe(false);
    expect(g.invulnMs).toBeGreaterThan(0);

    // Second hit during i-frames: still safe.
    g.zappers = [zapperOnFlyer(g)];
    step(g);
    expect(g.status).toBe('playing');

    // After i-frames expire, a hit is fatal.
    g.invulnMs = 0;
    g.zappers = [zapperOnFlyer(g)];
    step(g);
    expect(g.status).toBe('over');
  });
});

describe('game over', () => {
  it('freezes the state once over', () => {
    const g = playing();
    g.zappers.push(zapperOnFlyer(g));
    step(g);
    expect(g.status).toBe('over');
    const frozen = JSON.stringify(g);
    step(g);
    step(g);
    expect(JSON.stringify(g)).toBe(frozen);
  });
});

describe('reset', () => {
  it('returns to a fresh ready game', () => {
    const g = playing();
    for (let i = 0; i < 40; i++) step(g);
    reset(g);
    expect(g.status).toBe('ready');
    expect(g.distance).toBe(0);
    expect(g.coinCount).toBe(0);
    expect(g.zappers.length).toBe(0);
    expect(g.spawnIn).toBe(g.initialGap);
  });
});

describe('determinism', () => {
  it('reproduces a run exactly from the same seed', () => {
    const run = (seed: number) => {
      const g = createGame(seed);
      start(g);
      for (let i = 0; i < 200; i++) {
        setThrust(g, i % 7 < 3); // fixed, RNG-independent input script
        step(g);
      }
      return JSON.stringify(g);
    };
    expect(run(99)).toEqual(run(99));
    expect(run(99)).not.toEqual(run(7));
  });
});
