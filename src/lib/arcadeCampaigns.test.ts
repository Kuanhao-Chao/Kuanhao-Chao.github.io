import { describe, expect, it } from 'vitest';
import { CAMPAIGNS, type RunOptions } from './arcade';
import * as snake from './snake';
import * as jet from './jetpackJoyride';

function options(game: keyof typeof CAMPAIGNS, stage: number, expert = false): RunOptions {
  return {
    mode: 'campaign',
    stage,
    seed: CAMPAIGNS[game][stage - 1].seed,
    difficulty: expert ? 'expert' : 'standard',
  };
}
function reachable(map: number[][], start: [number, number]) {
  const queue = [start],
    seen = new Set([start.join(',')]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy,
        key = `${nx},${ny}`;
      if (map[ny]?.[nx] === 0 && !seen.has(key)) {
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return seen;
}

describe('Snake campaigns and input semantics', () => {
  it('applies two fast valid turns on separate ticks, never in one tick', () => {
    const rng = snake.mulberry32(5);
    const game = snake.createGame({ cols: 17, rows: 17 }, rng);
    snake.start(game);
    snake.turn(game, 'up');
    snake.turn(game, 'left');
    snake.turn(game, 'down');
    expect(game.turnQueue).toEqual(['up', 'left']);
    snake.step(game, rng);
    expect(game.dir).toBe('up');
    snake.step(game, rng);
    expect(game.dir).toBe('left');
  });
  it('does not queue key-repeat noise or reversal of the queued direction', () => {
    const game = snake.createGame({ cols: 17, rows: 17 }, snake.mulberry32(5));
    snake.turn(game, 'up');
    snake.turn(game, 'up');
    snake.turn(game, 'down');
    expect(game.turnQueue).toEqual(['up']);
  });
  for (let stage = 1; stage <= 6; stage++)
    it(`garden ${stage} is connected and has legal food, runway and bonus placement`, () => {
      const run = options('snake', stage);
      const game = snake.createGame({ cols: 17, rows: 17, run }, snake.mulberry32(run.seed));
      const map = Array.from({ length: 17 }, () => Array(17).fill(0));
      for (const p of game.obstacles) map[p.y][p.x] = 1;
      expect(reachable(map, [8, 8]).size).toBe(289 - game.obstacles.length);
      expect(map[game.food.y][game.food.x]).toBe(0);
      expect(game.snake.every((p) => map[p.y][p.x] === 0)).toBe(true);
      expect(map[game.bonus!.y][game.bonus!.x]).toBe(0);
      expect(snake.tickInterval(game)).toBe(160 - stage * 10);
      snake.start(game);
      game.score = CAMPAIGNS.snake[stage - 1].goal - 1;
      game.food = { x: 9, y: 8, base: 'A' };
      snake.step(game, snake.mulberry32(1));
      expect(game.status).toBe('won');
      expect(game.sequence.at(-1)).toBe('A');
    });
  it('Motif Hunt always offers the next target and treats wrong bases as a reset', () => {
    const rng = snake.mulberry32(8);
    const game = snake.createGame(
      { cols: 17, rows: 17, run: { ...options('snake', 1), mode: 'motif' } },
      rng
    );
    expect([game.food, ...game.alternatives].map((f) => f.base)).toContain('A');
    expect(new Set([game.food, ...game.alternatives].map((p) => `${p.x},${p.y}`)).size).toBe(3);
    snake.start(game);
    game.matched = 2;
    game.food = { x: 9, y: 8, base: 'T' };
    game.alternatives = [];
    snake.step(game, rng);
    expect(game.status).toBe('playing');
    expect(game.matched).toBe(0);
    expect(game.wrong).toBe(1);
    expect(game.score).toBe(1);
    expect([game.food, ...game.alternatives].some((f) => f.base === 'A')).toBe(true);
  });
  it('awards a bonus even when it shares the final food cell', () => {
    const rng = snake.mulberry32(8);
    const game = snake.createGame({ cols: 17, rows: 17, run: options('snake', 1) }, rng);
    snake.start(game);
    game.score = 7;
    game.bonus = { x: 9, y: 8 };
    game.food = { x: 9, y: 8, base: 'A' };
    snake.step(game, rng);
    expect(game.status).toBe('won');
    expect(snake.snakeResult(game).medals[2]).toBe(true);
  });
});

describe('Jetpack encounter and progression safety', () => {
  it('clamps all timing consistently and rejects non-finite deltas', () => {
    const game = jet.createGame(3);
    jet.start(game);
    game.spawnIn = Infinity;
    jet.step(game, 1000);
    expect(game.elapsedMs).toBe(100);
    const snapshot = structuredClone(game);
    jet.step(game, NaN);
    jet.step(game, -3);
    expect(game).toEqual(snapshot);
  });
  it('sweeps missile collisions rather than checking only the endpoint', () => {
    const game = jet.createGame(3);
    jet.start(game);
    game.spawnIn = Infinity;
    game.missiles.push({
      id: 99,
      kind: 'missile',
      x: game.flyer.x + 100,
      y: game.flyer.y,
      vx: -2500,
      vy: 0,
      radius: 14,
      phase: 'active',
      timer: 0,
    });
    jet.step(game, 80);
    expect(game.status).toBe('over');
  });
  it('locks missile aim before launch and does not secretly home afterward', () => {
    const game = jet.createGame(3);
    jet.start(game);
    game.spawnIn = Infinity;
    const missile = jet.spawnMissile(game, 200);
    missile.timer = 300;
    game.flyer.y = 400;
    jet.step(game, 16);
    expect(missile.y).toBe(200);
    expect(missile.locked).toBe(true);
  });
  it('magnet attracts coins, not shield pickups; chains and pickup events are ordered', () => {
    const game = jet.createGame(3);
    jet.start(game);
    game.spawnIn = Infinity;
    game.powerUps.push({ id: 10, kind: 'magnet', x: game.flyer.x, y: game.flyer.y, radius: 16 });
    jet.step(game, 16);
    expect(game.magnetMs).toBe(6000);
    expect(game.events).toContain('magnet');
    const coin = jet.spawnCoin(game, game.flyer.x + 100, game.flyer.y + 40);
    const shield = jet.spawnShield(game, game.flyer.x + 100, game.flyer.y + 40);
    const before = Math.abs(coin.y - game.flyer.y);
    const shieldY = shield.y;
    jet.step(game, 16);
    expect(Math.abs(coin.y - game.flyer.y)).toBeLessThan(before);
    expect(shield.y).toBe(shieldY);
  });
  for (const expert of [false, true])
    for (let stage = 1; stage <= 6; stage++)
      it(`route ${stage}/${expert ? 'expert' : 'standard'} completes without relying on shields`, () => {
        const run = options('jetpack', stage, expert);
        const game = jet.createGame(
          run.seed,
          {
            width: 960,
            height: 640,
            groundY: 596,
            startSpeed: expert ? 360 : 300,
            maxSpeed: expert ? 650 : 540,
            speedRamp: expert ? 2 : 1.6,
            initialGap: 960,
          },
          run
        );
        jet.start(game);
        let encounter = 0;
        let waitY = game.flyer.y;
        for (let frame = 0; frame < 7000 && game.status === 'playing'; frame++) {
          if (game.encounters !== encounter) {
            encounter = game.encounters;
            waitY = game.flyer.y;
          }
          const target = game.missiles.some((m) => m.phase === 'warn' && m.timer > 400)
            ? waitY
            : game.safeY;
          const desired = Math.max(-360, Math.min(360, (target - game.flyer.y) * 5));
          jet.setThrust(game, game.flyer.vy > desired);
          game.powerUps = []; // witness does not use shields or magnets
          jet.step(game, 1000 / 60);
        }
        expect(
          game.status,
          `encounter ${game.encounters}, certified ${game.certified}, y=${game.flyer.y}`
        ).toBe('won');
        expect(game.certified).toBeGreaterThan(5);
        expect(game.zappers.length + game.lasers.length + game.missiles.length).toBeLessThan(5);
        expect(jet.jetpackResult(game).won).toBe(true);
      });
});
