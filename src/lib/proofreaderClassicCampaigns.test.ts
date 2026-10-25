import { describe, expect, it } from 'vitest';
import { CAMPAIGNS, type RunOptions } from './arcade';
import * as proof from './proofreaderClassic';

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

describe('Proofreader Classic authored campaign', () => {
  for (let stage = 1; stage <= 6; stage++)
    it(`stage ${stage} has reachable terrain, supplies, relays and exit`, () => {
      const game = proof.createGame(0, 17, 17, options('proofreader-classic', stage));
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
    const game = proof.createGame(0, 17, 17, options('proofreader-classic', 4));
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
    const game = proof.createGame(0, 17, 17, options('proofreader-classic', 1));
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
    const game = proof.createGame(0, 17, 17, options('proofreader-classic', 6));
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
    const game = proof.createGame(0, 17, 17, options('proofreader-classic', 1));
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
    const game = proof.createGame(0, 17, 17, {
      ...options('proofreader-classic', 1),
      mode: 'practice',
    });
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
    const game = proof.createGame(0, 17, 17, options('proofreader-classic', 2));
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
