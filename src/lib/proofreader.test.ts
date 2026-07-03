import { describe, it, expect } from 'vitest';
import {
  mulberry32,
  generateMap,
  createGame,
  reset,
  start,
  pause,
  step,
  fire,
  castRay,
  collides,
  movePlayer,
  hasLineOfSight,
  setAimAssist,
  TUNING,
  BASES,
  type GameState,
  type Enemy,
  type EnemyKind,
  type StepInput,
} from './proofreader';

const IDLE: StepInput = { forward: 0, strafe: 0, turn: 0, fire: false };

/** A square map with a solid border ring (style 1) and open interior. */
const box = (n: number): number[][] =>
  Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => (x === 0 || y === 0 || x === n - 1 || y === n - 1 ? 1 : 0))
  );

/** A playing game on a custom map with a clean slate of entities. */
function playing(map: number[][], px: number, py: number, angle = 0): GameState {
  const g = createGame(1);
  g.map = map;
  g.cols = map[0].length;
  g.rows = map.length;
  g.player.x = px;
  g.player.y = py;
  g.player.angle = angle;
  g.player.ammo = TUNING.startAmmo;
  g.player.health = TUNING.maxHealth;
  g.status = 'playing';
  g.enemies = [];
  g.pickups = [];
  g.wave = 0;
  g.intermission = 0;
  g.fireCooldown = 0;
  g.nextId = 1;
  g.lastEvent = 'none';
  return g;
}

function mkEnemy(
  id: number,
  x: number,
  y: number,
  kind: EnemyKind = 'substitution',
  hp = 1
): Enemy {
  return {
    id,
    kind,
    x,
    y,
    hp,
    speed: 1.4,
    heading: 0,
    retargetIn: 0,
    attackIn: 0,
    hurtFor: 0,
    alive: true,
  };
}

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

describe('generateMap', () => {
  it('is deterministic per seed and varies across seeds', () => {
    expect(JSON.stringify(generateMap(mulberry32(3)))).toBe(
      JSON.stringify(generateMap(mulberry32(3)))
    );
    expect(JSON.stringify(generateMap(mulberry32(3)))).not.toBe(
      JSON.stringify(generateMap(mulberry32(4)))
    );
  });
  it('has a solid border ring and an open 2×2 spawn room', () => {
    const m = generateMap(mulberry32(9));
    const h = m.length;
    const w = m[0].length;
    for (let x = 0; x < w; x++) {
      expect(m[0][x]).toBeGreaterThan(0);
      expect(m[h - 1][x]).toBeGreaterThan(0);
    }
    for (let y = 0; y < h; y++) {
      expect(m[y][0]).toBeGreaterThan(0);
      expect(m[y][w - 1]).toBeGreaterThan(0);
    }
    expect(m[1][1]).toBe(0);
    expect(m[1][2]).toBe(0);
    expect(m[2][1]).toBe(0);
    expect(m[2][2]).toBe(0);
  });
  it('assigns only wall styles 1–4', () => {
    const m = generateMap(mulberry32(21));
    for (const row of m) for (const cell of row) expect(cell >= 0 && cell <= 4).toBe(true);
  });
  it('leaves every open cell reachable from the spawn (no isolated pockets)', () => {
    const m = generateMap(mulberry32(11));
    const h = m.length;
    const w = m[0].length;
    const seen = new Set<string>(['1,1']);
    const stack: Array<[number, number]> = [[1, 1]];
    while (stack.length) {
      const [x, y] = stack.pop() as [number, number];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && m[ny][nx] === 0 && !seen.has(`${nx},${ny}`)) {
          seen.add(`${nx},${ny}`);
          stack.push([nx, ny]);
        }
      }
    }
    let open = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y][x] === 0) open++;
    expect(seen.size).toBe(open);
  });
});

describe('castRay (DDA)', () => {
  it('returns the exact perpendicular distance to an x-facing wall', () => {
    const m = box(6);
    m[1][3] = 2; // wall cell straight ahead of the origin
    const hit = castRay(m, 1.5, 1.5, 0);
    expect(hit.distance).toBeCloseTo(1.5, 6);
    expect(hit.side).toBe(0);
    expect(hit.hitX).toBeCloseTo(3, 6);
    expect(hit.wallType).toBe(2);
  });
  it('returns a y-facing hit and a correct diagonal distance', () => {
    const m = box(6);
    m[3][1] = 3;
    const down = castRay(m, 1.5, 1.5, Math.PI / 2);
    expect(down.distance).toBeCloseTo(1.5, 6);
    expect(down.side).toBe(1);
    expect(down.hitY).toBeCloseTo(3, 6);

    const m2 = box(8);
    m2[3][3] = 1;
    const diag = castRay(m2, 1.5, 1.5, Math.PI / 4);
    expect(diag.distance).toBeCloseTo(1.5 * Math.SQRT2, 3);
    expect(diag.wallType).toBe(1);
  });
  it('reports no hit (wallType 0) beyond maxDist', () => {
    const m = box(20);
    const hit = castRay(m, 1.5, 1.5, 0, 2);
    expect(hit.wallType).toBe(0);
    expect(hit.distance).toBe(2);
  });
});

describe('collision', () => {
  it('never lets the player enter a wall and stops a radius from the face', () => {
    const g = playing(box(6), 1.5, 1.5, 0);
    for (let i = 0; i < 200; i++) {
      movePlayer(g, 1, 0, 1 / 60);
      expect(collides(g.map, g.player.x, g.player.y, TUNING.playerRadius)).toBe(false);
    }
    // The wall face is at x = 5; the player halts about one radius short of it.
    expect(g.player.x).toBeGreaterThan(4.7);
    expect(g.player.x).toBeLessThan(5 - TUNING.playerRadius + 1e-6);
  });
  it('slides along a wall instead of sticking', () => {
    const g = playing(box(6), 4.7, 1.5, 0); // hard against the +x wall
    for (let i = 0; i < 40; i++) movePlayer(g, 1, 1, 1 / 60); // forward into wall, strafe +y is open
    expect(g.player.x).toBeLessThan(5 - TUNING.playerRadius + 1e-6);
    expect(g.player.y).toBeGreaterThan(1.9);
  });
});

describe('line of sight', () => {
  it('is blocked by a wall and clear otherwise', () => {
    const m = box(7);
    for (let y = 1; y <= 5; y++) m[y][3] = 1; // vertical wall at x = 3
    expect(hasLineOfSight(m, 1.5, 3.5, 5.5, 3.5)).toBe(false);
    expect(hasLineOfSight(m, 1.5, 3.5, 2.5, 3.5)).toBe(true);
  });
});

describe('fire', () => {
  it('kills an enemy dead ahead, spends ammo, scores, and sets cooldown', () => {
    const g = playing(box(12), 4.5, 4.5, 0);
    g.enemies = [mkEnemy(1, 7.5, 4.5)];
    const res = fire(g);
    expect(res).toEqual({ fired: true, hitId: 1, killed: true });
    expect(g.player.ammo).toBe(TUNING.startAmmo - 1);
    expect(g.fireCooldown).toBeCloseTo(TUNING.fireCooldown, 6);
    expect(g.kills).toBe(1);
    expect(g.score).toBe(10);
    expect(g.lastEvent).toBe('kill');
  });
  it('misses an enemy outside the cone or behind a wall (but still spends the shot)', () => {
    const wide = playing(box(12), 4.5, 4.5, 0);
    wide.enemies = [mkEnemy(1, 7.5, 7.5)]; // ~45° off the view axis
    const miss = fire(wide);
    expect(miss.fired).toBe(true);
    expect(miss.hitId).toBeNull();
    expect(wide.enemies[0].hp).toBe(1);
    expect(wide.kills).toBe(0);

    const occluded = playing(box(12), 4.5, 4.5, 0);
    occluded.map[4][6] = 1; // wall between player and enemy
    occluded.enemies = [mkEnemy(1, 8.5, 4.5)];
    expect(fire(occluded).hitId).toBeNull();
    expect(occluded.enemies[0].hp).toBe(1);
  });
  it('is gated by cooldown and by empty ammo', () => {
    const g = playing(box(12), 4.5, 4.5, 0);
    expect(fire(g).fired).toBe(true);
    expect(fire(g).fired).toBe(false); // cooldown still active

    const dry = playing(box(12), 4.5, 4.5, 0);
    dry.player.ammo = 0;
    const res = fire(dry);
    expect(res.fired).toBe(false);
    expect(dry.lastEvent).toBe('empty');
  });
  it('aim assist widens the cone enough to connect a borderline shot', () => {
    const without = playing(box(12), 4.5, 4.5, 0);
    without.enemies = [mkEnemy(1, 8.5, 5.4)];
    expect(fire(without).hitId).toBeNull();

    const withAssist = playing(box(12), 4.5, 4.5, 0);
    setAimAssist(withAssist, true);
    withAssist.enemies = [mkEnemy(1, 8.5, 5.4)];
    const res = fire(withAssist);
    expect(res.hitId).toBe(1);
    expect(res.killed).toBe(true);
  });
});

describe('enemies', () => {
  it('chase the player with line of sight and deal melee damage in range', () => {
    const chase = playing(box(9), 4.5, 4.5, 0);
    chase.enemies = [mkEnemy(1, 7.5, 4.5)];
    for (let i = 0; i < 60; i++) step(chase, 1 / 60, IDLE);
    expect(chase.enemies[0].x).toBeLessThan(7.0); // closed the distance

    const melee = playing(box(9), 4.5, 4.5, 0);
    melee.enemies = [mkEnemy(1, 5.1, 4.5)]; // within attackRange
    step(melee, 1 / 60, IDLE);
    expect(melee.player.health).toBe(TUNING.maxHealth - TUNING.attackDamage);
    expect(melee.damageFor).toBeGreaterThan(0);
    expect(melee.lastEvent).toBe('hurt');
  });
});

describe('death', () => {
  it('ends the run at zero health and then ignores further steps', () => {
    const g = playing(box(9), 4.5, 4.5, 0);
    g.player.health = 5;
    g.enemies = [mkEnemy(1, 5.1, 4.5)];
    step(g, 1 / 60, IDLE);
    expect(g.player.health).toBe(0);
    expect(g.status).toBe('over');
    expect(g.lastEvent).toBe('over');
    const snapshot = JSON.stringify(g);
    step(g, 1 / 60, IDLE);
    expect(JSON.stringify(g)).toBe(snapshot);
  });
});

describe('pickups', () => {
  it('grant ammo, extend the sequence, and score when walked over', () => {
    const g = playing(box(9), 4.5, 4.5, 0);
    g.player.ammo = 10;
    g.pickups = [{ id: 1, kind: 'ammo', base: 'A', x: 4.5, y: 4.5, taken: false }];
    step(g, 1 / 60, IDLE);
    expect(g.player.ammo).toBe(18);
    expect(g.sequence).toContain('A');
    expect(g.score).toBe(5);
    expect(g.pickups.length).toBe(0);
    expect(g.lastEvent).toBe('pickup');
  });
});

describe('waves', () => {
  it('bonuses on clear and spawns a larger next wave away from the player', () => {
    const g = playing(box(12), 5.5, 5.5, 0);
    g.wave = 1;
    g.enemies = [mkEnemy(1, 8.5, 5.5)];
    const res = fire(g);
    expect(res.killed).toBe(true);
    expect(g.intermission).toBeGreaterThan(0);
    expect(g.score).toBeGreaterThanOrEqual(10 + 25); // kill points + wave bonus

    step(g, 2, IDLE); // exhaust the intermission → next wave spawns
    expect(g.wave).toBe(2);
    const alive = g.enemies.filter((e) => e.alive);
    expect(alive.length).toBe(5); // min(3 + wave, 12)
    for (const e of alive) {
      expect(Math.hypot(e.x - 5.5, e.y - 5.5)).toBeGreaterThanOrEqual(5.9);
    }
  });
});

describe('lifecycle and determinism', () => {
  it('gates stepping to the playing state and transitions correctly', () => {
    const g = createGame(2);
    const before = JSON.stringify(g);
    step(g, 1 / 60, IDLE);
    expect(JSON.stringify(g)).toBe(before); // no-op while ready

    start(g);
    expect(g.status).toBe('playing');
    expect(g.wave).toBe(1); // first wave spawned on start
    pause(g);
    expect(g.status).toBe('paused');
    const paused = JSON.stringify(g);
    step(g, 1 / 60, IDLE);
    expect(JSON.stringify(g)).toBe(paused); // no-op while paused
    start(g); // resume
    expect(g.status).toBe('playing');
  });

  it('reproduces a full scripted run exactly from the same seed', () => {
    const inputs: StepInput[] = [
      { forward: 1, strafe: 0, turn: 0.5, fire: true },
      { forward: 1, strafe: 1, turn: 0, fire: true },
      { forward: 0, strafe: -1, turn: -0.5, fire: false },
      { forward: -1, strafe: 0, turn: 0, fire: true },
    ];
    const run = (seed: number) => {
      const g = createGame(seed);
      start(g);
      for (let i = 0; i < 600; i++) step(g, 1 / 120, inputs[i % inputs.length]);
      return JSON.stringify(g);
    };
    expect(run(2026)).toBe(run(2026));
    expect(run(2026)).not.toBe(run(7));
  });

  it('reset restores a fresh ready game on the same board size', () => {
    const g = createGame(5);
    start(g);
    for (let i = 0; i < 30; i++) step(g, 1 / 60, { ...IDLE, forward: 1 });
    const cols = g.cols;
    reset(g, 5);
    expect(g.status).toBe('ready');
    expect(g.wave).toBe(0);
    expect(g.kills).toBe(0);
    expect(g.enemies.length).toBe(0);
    expect(g.cols).toBe(cols);
    expect(BASES).toContain('A');
  });
});
