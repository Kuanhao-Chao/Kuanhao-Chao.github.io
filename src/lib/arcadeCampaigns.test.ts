import { describe, expect, it } from 'vitest';
import { CAMPAIGNS, type RunOptions } from './arcade';
import * as proof from './proofreader';
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
const idle = { forward: 0, strafe: 0, turn: 0, fire: false };
function reachable(map: number[][], start: [number, number]) {
  const queue = [start];
  const seen = new Set([start.join(',')]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (map[ny]?.[nx] === 0 && !seen.has(key)) {
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return seen;
}

describe('Proofreader authored campaign', () => {
  for (let stage = 1; stage <= 6; stage++)
    it(`stage ${stage} has reachable terrain, supplies, relays and exit`, () => {
      const game = proof.createGame(0, 17, 17, options('proofreader', stage));
      const seen = reachable(game.map, [1, 1]);
      expect(seen.size).toBe(game.map.flat().filter((n) => n === 0).length);
      expect(seen.has('15,15')).toBe(true);
      for (const relay of game.relays)
        expect(seen.has(`${Math.floor(relay.x)},${Math.floor(relay.y)}`)).toBe(true);
      proof.start(game);
      expect(game.enemies.length).toBeLessThanOrEqual(7);
      for (const enemy of game.enemies) {
        expect(proof.collides(game.map, enemy.x, enemy.y, 0.3)).toBe(false);
        expect(Math.hypot(enemy.x - 1.5, enemy.y - 1.5)).toBeGreaterThan(5);
      }
      expect(game.pickups.some((p) => p.x === 2.5 && p.y === 1.5)).toBe(true);
    });
  it('requires relays AND encounter completion before exit activation', () => {
    const game = proof.createGame(0, 17, 17, options('proofreader', 4));
    proof.start(game);
    game.wave = 2;
    game.enemies = [];
    game.intermission = 0;
    proof.step(game, 1 / 120, idle);
    expect(game.exit.open).toBe(false);
    for (const relay of game.relays) {
      game.player.x = relay.x;
      game.player.y = relay.y;
      proof.step(game, 1 / 120, idle);
    }
    expect(game.relays.every((r) => r.active)).toBe(true);
    expect(game.exit.open).toBe(true);
    game.player.x = game.exit.x;
    game.player.y = game.exit.y;
    proof.step(game, 1 / 120, idle);
    expect(game.status).toBe('won');
    expect(proof.proofResult(game).medals[0]).toBe(true);
    const saved = structuredClone(game);
    proof.step(game, 1, idle);
    expect(game).toEqual(saved);
  });
  it('pierces aligned targets, costs three charges, and does not pass through walls', () => {
    const game = proof.createGame(0, 17, 17, options('proofreader', 1));
    proof.start(game);
    game.enemies = [2.5, 3.5, 6.5].map((x, i) => ({
      id: i + 1,
      kind: 'substitution',
      x,
      y: 1.5,
      hp: 1,
      speed: 0,
      heading: 0,
      retargetIn: 99,
      attackIn: 99,
      hurtFor: 0,
      alive: true,
    }));
    game.map[1][5] = 1;
    expect(proof.firePulse(game)).toBe(true);
    expect(game.player.ammo).toBe(21);
    expect(game.kills).toBe(2);
    expect(game.enemies[2].alive).toBe(true);
    expect(game.shots).toBe(1);
    expect(game.hits).toBe(1);
    expect(game.events.filter((e) => e === 'kill')).toHaveLength(2);
    expect(proof.firePulse(game)).toBe(false);
  });
  it('guards the boss core, exposes it on schedule, and bounds minion summons', () => {
    const game = proof.createGame(0, 17, 17, options('proofreader', 6));
    proof.start(game);
    const boss = game.enemies[0];
    game.player.x = boss.x - 2;
    game.player.y = boss.y;
    game.player.angle = 0;
    expect(proof.fire(game).hitId).toBeNull();
    expect(boss.hp).toBe(18);
    game.time = 4;
    game.fireCooldown = 0;
    expect(proof.fire(game).hitId).toBe(boss.id);
    boss.hp = 11;
    proof.step(game, 1 / 120, idle);
    expect(boss.bossPhase).toBe(1);
    expect(game.enemies.filter((e) => !e.boss)).toHaveLength(2);
    for (let i = 0; i < 50; i++) proof.step(game, 1 / 120, idle);
    expect(game.enemies.filter((e) => e.alive).length).toBeLessThanOrEqual(5);
  });
  it('projectiles cannot tunnel through cover or persist forever', () => {
    const game = proof.createGame(0, 17, 17, options('proofreader', 1));
    proof.start(game);
    game.enemies = [];
    game.player.x = 6.5;
    game.player.y = 1.5;
    game.map[1][4] = 1;
    game.projectiles = [{ id: 1, x: 2.5, y: 1.5, vx: 8, vy: 0, life: 6 }];
    proof.step(game, 0.6, idle);
    expect(game.player.health).toBe(100);
    expect(game.projectiles).toHaveLength(0);
  });
  it('practice prevents damage and normal pause freezes every timer', () => {
    const game = proof.createGame(0, 17, 17, { ...options('proofreader', 1), mode: 'practice' });
    proof.start(game);
    game.projectiles = [{ id: 1, x: game.player.x, y: game.player.y, vx: 0, vy: 0, life: 1 }];
    proof.step(game, 1 / 120, idle);
    expect(game.player.health).toBe(100);
    for (let i = 0; i < 30; i++) {
      game.pulseCooldown = 0;
      expect(proof.firePulse(game)).toBe(true);
    }
    expect(game.player.ammo).toBe(proof.TUNING.maxAmmo);
    proof.pause(game);
    const snapshot = structuredClone(game);
    proof.step(game, 0.1, idle);
    expect(game).toEqual(snapshot);
  });
  it('an insertion telegraphs before charging and locks its charge heading', () => {
    const game = proof.createGame(0, 17, 17, options('proofreader', 2));
    proof.start(game);
    game.player.x = 7.5;
    game.player.y = 7.5;
    game.enemies = [
      {
        id: 90,
        kind: 'insertion',
        x: 10.5,
        y: 7.5,
        hp: 2,
        speed: 1.1,
        heading: 0,
        retargetIn: 0,
        attackIn: 0,
        hurtFor: 0,
        alive: true,
      },
    ];
    const enemy = game.enemies[0];
    for (let i = 0; i < 48; i++) proof.step(game, 1 / 120, idle);
    expect(proof.collides(game.map, enemy.x, enemy.y, 0.3)).toBe(false);
    expect(enemy.x).toBe(10.5);
    expect(enemy.attackWindup).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) proof.step(game, 1 / 120, idle);
    expect(enemy.x).toBeLessThan(10.5);
    const angle = enemy.chargeHeading;
    game.player.y = 9.5;
    proof.step(game, 1 / 120, idle);
    expect(enemy.chargeHeading).toBe(angle);
    expect(enemy.y).toBeCloseTo(7.5);
  });
  it('culls defeated enemies at the simulation seam', () => {
    const game = proof.createGame(5);
    proof.start(game);
    game.enemies.forEach((e) => {
      e.alive = false;
    });
    proof.step(game, 1 / 120, idle);
    expect(game.enemies).toHaveLength(0);
  });
});

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
