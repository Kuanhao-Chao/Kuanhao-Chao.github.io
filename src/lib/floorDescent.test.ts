import { describe, expect, it } from 'vitest';
import { createGame, start, pause, step, result, forecast, courseRow } from './floorDescent';
import { createGameClock } from './gameClock';
import { driveFloorDescent } from '../../scripts/lib/floorDescentAgent.mjs';

describe('100-Floor Descent public engine', () => {
  it('starts a new classic expedition with full health and no earned floors', () => {
    const s = createGame({ mode: 'classic', seed: 42 });
    expect({
      status: s.status,
      health: s.player.health,
      floor: s.floor,
      mode: s.options.mode,
    }).toEqual({ status: 'ready', health: 10, floor: 0, mode: 'classic' });
    expect(result(s).eligible).toBe(true);
  });
  it('steers horizontally, falls, and freezes completely when paused', () => {
    const s = createGame({ mode: 'classic', seed: 42 });
    start(s);
    for (let i = 0; i < 30; i++) step(s, { steer: 1 }, 1 / 120);
    expect(s.player.x).toBeGreaterThan(250);
    expect(s.time).toBeCloseTo(0.25);
    pause(s);
    const before = structuredClone(s);
    step(s, { steer: -1, dash: true }, 1);
    expect(s).toEqual(before);
  });
  it('replays a seeded course and counts five rows per earned floor, not repeated landings', () => {
    const s = createGame({ mode: 'classic', seed: 42 });
    const other = createGame({ mode: 'classic', seed: 42 });
    expect(s.platforms.length).toBeGreaterThan(8);
    expect(s.platforms).toEqual(other.platforms);
    const platform = s.platforms.find((p) => p.row === 5)!;
    s.player.x = platform.x + platform.width / 2;
    s.player.y = platform.y - 2;
    s.player.standing = null;
    s.player.vy = 400;
    s.camera = platform.y - 400;
    start(s);
    step(s, { steer: 0 }, 1 / 120);
    expect(s.floor).toBe(1);
    for (let i = 0; i < 20; i++) step(s, { steer: 0 }, 1 / 120);
    expect(s.floor).toBe(1);
  });
  it('takes spike damage once per contact and regenerates after two safe seconds', () => {
    const s = createGame({ mode: 'classic', seed: 1 });
    s.platforms = [
      { id: 2, row: 1, x: 130, y: 350, width: 160, kind: 'spikes', touched: null, broken: false },
    ];
    s.player.standing = null;
    s.player.y = 348;
    s.player.vy = 400;
    start(s);
    step(s, { steer: 0 }, 1 / 120);
    expect(s.player.health).toBe(6);
    for (let i = 0; i < 239; i++) step(s, { steer: 0 }, 1 / 120);
    expect(s.player.health).toBe(6);
    step(s, { steer: 0 }, 1 / 120);
    expect(s.player.health).toBe(7);
  });
  it.each(['spring', 'crumble', 'left', 'right'] as const)(
    'implements %s platform behavior',
    (kind) => {
      const s = createGame({ mode: 'classic', seed: 1 });
      s.platforms = [
        { id: 0, row: 0, x: 120, y: 330, width: 180, kind, touched: 0, broken: false },
      ];
      start(s);
      let highest = 330;
      for (let i = 0; i < 75; i++) {
        step(s, { steer: 0 }, 1 / 120);
        highest = Math.min(highest, s.player.y);
      }
      if (kind === 'spring') expect(highest).toBeLessThan(300);
      if (kind === 'crumble') expect(s.platforms[0].broken).toBe(true);
      if (kind === 'left') expect(s.player.x).toBeLessThan(190);
      if (kind === 'right') expect(s.player.x).toBeGreaterThan(230);
    }
  );
  it('punishes ceiling contact but releases a pinned character, and makes falling fatal', () => {
    const s = createGame({ mode: 'classic', seed: 3 });
    start(s);
    s.camera = 280;
    step(s, { steer: 0 }, 1 / 120);
    expect(s.player.health).toBe(5);
    expect(s.player.standing).toBeNull();
    s.player.y = s.camera + 650;
    step(s, { steer: 0 }, 1 / 120);
    expect(s.status).toBe('over');
    expect(s.cause).toBe('fall');
  });
  it('starts Practice at the selected region without record eligibility', () => {
    const s = createGame({ mode: 'practice', seed: 3, startFloor: 60 });
    expect(s.floor).toBe(60);
    expect(result(s).eligible).toBe(false);
    const trial = createGame({ mode: 'trial', seed: 3, startFloor: 60 });
    expect(trial.floor).toBe(0);
  });
  it('isolates Remix dash and pickups from Classic', () => {
    const s = createGame({ mode: 'remix', seed: 2 });
    start(s);
    step(s, { steer: 1, dash: true }, 1 / 120);
    expect(s.player.dashCooldown).toBeGreaterThan(3);
    expect(s.player.vx).toBeGreaterThan(500);
    const classic = createGame({ mode: 'classic', seed: 2 });
    start(classic);
    step(classic, { steer: 1, dash: true }, 1 / 120);
    expect(classic.player.dashCooldown).toBe(0);
    expect(classic.pickups).toHaveLength(0);
  });
  it('collects a non-stacking shield and slows the world, not the active timer or steering', () => {
    const s = createGame({ mode: 'remix', seed: 2 });
    start(s);
    s.pickups = [
      { id: 1, x: 210, y: 310, kind: 'shield' },
      { id: 2, x: 210, y: 310, kind: 'shield' },
    ];
    step(s, { steer: 0 }, 1 / 120);
    expect(s.player.shield).toBe(true);
    s.platforms = [
      { id: 2, row: 1, x: 130, y: 350, width: 160, kind: 'spikes', touched: null, broken: false },
    ];
    s.player.standing = null;
    s.player.y = 348;
    s.player.vy = 400;
    step(s, { steer: 0 }, 1 / 120);
    expect(s.player.health).toBe(10);
    expect(s.player.shield).toBe(false);
    const slow = createGame({ mode: 'remix', seed: 4 }),
      normal = createGame({ mode: 'remix', seed: 4 });
    slow.pickups = [{ id: 9, x: 210, y: 310, kind: 'slow' }];
    start(slow);
    start(normal);
    for (let i = 0; i < 60; i++) {
      step(slow, { steer: 1 }, 1 / 120);
      step(normal, { steer: 1 }, 1 / 120);
    }
    expect(slow.time).toBeCloseTo(normal.time);
    expect(slow.camera).toBeLessThan(normal.camera * 0.7);
    expect(slow.player.x).toBeCloseTo(normal.player.x);
    expect(slow.slowFor).toBeGreaterThan(2);
  });
  it('can finish a 100-floor Trial through steering alone in three to five minutes', () => {
    const s = createGame({ mode: 'trial', seed: 42 });
    start(s);
    const finish = driveFloorDescent({
      api: { state: () => s, input: (i) => step(s, i, 1 / 120), forecast },
    });
    expect(finish.status, JSON.stringify(finish)).toBe('won');
    expect(finish.floor).toBe(100);
    expect(finish.health).toBeGreaterThan(0);
    expect(finish.seconds).toBeGreaterThan(180);
    expect(finish.seconds).toBeLessThan(300);
  }, 30000);
  it('gives a visible spring bounce without throwing the explorer onto the previous row', () => {
    const s = createGame({ mode: 'practice', seed: 1 });
    s.platforms = [
      { id: 0, row: 0, x: 130, y: 330, width: 160, kind: 'spring', touched: 0, broken: false },
    ];
    start(s);
    let highest = 330;
    for (let i = 0; i < 80; i++) {
      step(s, { steer: 0 }, 1 / 120);
      highest = Math.min(highest, s.player.y);
    }
    expect(highest).toBeGreaterThan(265);
    expect(highest).toBeLessThan(300);
  });
  it.each([1, 2026, 4294967295])(
    'has an input-only Trial completion witness for seed %i',
    (seed) => {
      const s = createGame({ mode: 'trial', seed });
      start(s);
      const end = driveFloorDescent({
        api: { state: () => s, input: (i) => step(s, i, 1 / 120), forecast },
      });
      expect(end.status, JSON.stringify(end)).toBe('won');
      expect(end.seconds).toBeGreaterThan(180);
      expect(end.seconds).toBeLessThan(300);
      expect(s.platforms.length).toBeLessThan(48);
    },
    30000
  );
  it('keeps seeded pattern connectors in a reachable envelope and never forces a damaging landing', () => {
    const types = new Set<string>();
    for (let seed = 0; seed < 64; seed++)
      for (let row = 1; row <= 500; row++) {
        const fs = courseRow(seed, row, true),
          prev = courseRow(seed, row - 1, true)[0],
          main = fs[0];
        expect(['spikes', 'spring']).not.toContain(main.kind);
        const gap = Math.max(0, main.x - prev.x - prev.width, prev.x - main.x - main.width) - 26;
        // At 300 units/s, a 70-unit drop permits >70 horizontal units even
        // allowing for steering acceleration. The kit keeps the gap below 65.
        expect(gap).toBeLessThan(65);
        for (const f of fs) {
          types.add(f.kind);
          expect(f.x).toBeGreaterThanOrEqual(26);
          expect(f.x + f.width).toBeLessThanOrEqual(394);
        }
        if (fs[1])
          expect(
            Math.max(fs[0].x - fs[1].x - fs[1].width, fs[1].x - fs[0].x - fs[0].width)
          ).toBeGreaterThanOrEqual(24);
      }
    expect([...types].sort()).toEqual(['crumble', 'left', 'normal', 'right', 'spikes', 'spring']);
    expect(courseRow(1, 501, true)).toEqual([]);
  });
  it('advances the same simulation at 30, 60, and 144 Hz and keeps forecasts read-only', () => {
    const states = [30, 60, 144].map((hz) => {
      const s = createGame({ mode: 'remix', seed: 42 }),
        clock = createGameClock(1 / 120, 12);
      start(s);
      for (let i = 0; i < hz * 2; i++)
        clock.advance(1 / hz, (dt) => step(s, { steer: s.time < 0.4 ? 1 : -0.3 }, dt));
      return s;
    });
    expect(states[0]).toEqual(states[1]);
    expect(states[1]).toEqual(states[2]);
    const before = JSON.stringify(states[0]);
    forecast(states[0], { steer: 1 }, 60);
    expect(JSON.stringify(states[0])).toBe(before);
    expect(JSON.parse(before)).toEqual(states[0]);
  });
});
