import { describe, it, expect } from 'vitest';
import {
  createGame,
  duck,
  jump,
  makeObstacle,
  mulberry32,
  nextGap,
  playerHitbox,
  releaseDuck,
  reset,
  spawnObstacle,
  start,
  step,
  type DinoState,
} from './dino';

const seeded = (seed = 1) => mulberry32(seed);

const runFor = (state: DinoState, rng = seeded(), frames = 60, dtMs = 1000 / 60) => {
  for (let i = 0; i < frames; i++) step(state, rng, dtMs);
  return state;
};

describe('mulberry32', () => {
  it('is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('createGame / reset', () => {
  it('creates a ready runner on the ground with no obstacles', () => {
    const game = createGame({}, seeded());
    expect(game.status).toBe('ready');
    expect(game.runner.grounded).toBe(true);
    expect(game.runner.y).toBe(game.groundY);
    expect(game.obstacles).toHaveLength(0);
    expect(game.score).toBe(0);
    expect(game.speed).toBe(game.startSpeed);
  });

  it('resets a mutated game to a fresh ready state', () => {
    const game = createGame({}, seeded(9));
    jump(game);
    runFor(game, seeded(9), 12);
    game.obstacles.push(makeObstacle('variant-block', 99, game.runner.x, game.groundY));
    reset(game, seeded(9));
    expect(game.status).toBe('ready');
    expect(game.runner.grounded).toBe(true);
    expect(game.obstacles).toHaveLength(0);
    expect(game.score).toBe(0);
  });
});

describe('start / step gating', () => {
  it('does not advance while ready', () => {
    const game = createGame({}, seeded());
    const before = JSON.stringify(game);
    step(game, seeded());
    expect(JSON.stringify(game)).toBe(before);
  });

  it('advances time, distance, score, and speed while playing', () => {
    const game = createGame({}, seeded());
    start(game);
    runFor(game, seeded(), 90);
    expect(game.elapsedMs).toBeGreaterThan(0);
    expect(game.distance).toBeGreaterThan(0);
    expect(game.score).toBe(Math.floor(game.distance / 10));
    expect(game.speed).toBeGreaterThan(game.startSpeed);
  });
});

describe('runner actions', () => {
  it('jumps only from the ground and lands again', () => {
    const game = createGame({}, seeded());
    expect(jump(game)).toBe(true);
    expect(game.status).toBe('playing');
    expect(game.runner.grounded).toBe(false);
    expect(game.runner.vy).toBeLessThan(0);
    const firstVy = game.runner.vy;
    expect(jump(game)).toBe(false);
    expect(game.runner.vy).toBe(firstVy);

    runFor(game, seeded(), 80);
    expect(game.runner.grounded).toBe(true);
    expect(game.runner.y).toBe(game.groundY);
  });

  it('ducks only while grounded and restores the standing hitbox on release', () => {
    const game = createGame({}, seeded());
    const standing = playerHitbox(game);
    expect(duck(game)).toBe(true);
    const crouched = playerHitbox(game);
    expect(crouched.height).toBeLessThan(standing.height);
    expect(crouched.width).toBeGreaterThan(standing.width);
    releaseDuck(game);
    expect(playerHitbox(game)).toEqual(standing);

    jump(game);
    expect(duck(game)).toBe(false);
    expect(game.runner.ducking).toBe(false);
  });
});

describe('obstacles', () => {
  it('spawns obstacles at the right edge and advances the next id', () => {
    const game = createGame({}, seeded());
    const obstacle = spawnObstacle(game, seeded(3));
    expect(game.obstacles).toContain(obstacle);
    expect(obstacle.x).toBeGreaterThan(game.width);
    expect(game.nextObstacleId).toBe(2);
  });

  it('uses fair gaps that grow as speed approaches max speed', () => {
    const game = createGame({}, seeded());
    const slowGap = nextGap(game, seeded(5));
    game.speed = game.maxSpeed;
    const fastGap = nextGap(game, seeded(5));
    expect(slowGap).toBeGreaterThanOrEqual(290);
    expect(fastGap).toBeGreaterThan(slowGap);
  });

  it('moves obstacles left and removes offscreen ones', () => {
    const game = createGame({}, seeded());
    game.obstacles.push(makeObstacle('variant-block', 1, 200, game.groundY));
    game.obstacles.push(makeObstacle('repeat-stack', 2, -200, game.groundY));
    start(game);
    step(game, seeded(), 1000 / 60);
    expect(game.obstacles.some((obstacle) => obstacle.id === 2)).toBe(false);
    expect(game.obstacles.find((obstacle) => obstacle.id === 1)?.x).toBeLessThan(200);
  });
});

describe('collisions', () => {
  it('ends the run when a low obstacle overlaps the runner', () => {
    const game = createGame({}, seeded());
    game.obstacles.push(makeObstacle('variant-block', 1, game.runner.x + 8, game.groundY));
    start(game);
    step(game, seeded(), 1000 / 60);
    expect(game.status).toBe('over');
  });

  it('clears a low obstacle while jumping', () => {
    const game = createGame({ gravity: 2200, jumpVelocity: -760 }, seeded());
    game.obstacles.push(makeObstacle('variant-block', 1, game.runner.x + 100, game.groundY));
    jump(game);
    runFor(game, seeded(), 12);
    expect(game.status).toBe('playing');
  });

  it('ducking avoids a high obstacle that standing would hit', () => {
    const standing = createGame({}, seeded());
    standing.obstacles.push(
      makeObstacle('splice-arch', 1, standing.runner.x + 8, standing.groundY)
    );
    start(standing);
    step(standing, seeded(), 1000 / 60);
    expect(standing.status).toBe('over');

    const crouched = createGame({}, seeded());
    crouched.obstacles.push(
      makeObstacle('splice-arch', 1, crouched.runner.x + 8, crouched.groundY)
    );
    duck(crouched);
    step(crouched, seeded(), 1000 / 60);
    expect(crouched.status).toBe('playing');
  });

  it('freezes after game over until reset', () => {
    const game = createGame({}, seeded());
    game.obstacles.push(makeObstacle('variant-block', 1, game.runner.x + 8, game.groundY));
    start(game);
    step(game, seeded(), 1000 / 60);
    const snapshot = JSON.stringify(game);
    runFor(game, seeded(), 10);
    expect(JSON.stringify(game)).toBe(snapshot);
  });
});

describe('determinism', () => {
  it('replays the same run with the same seed', () => {
    const run = (seed: number) => {
      const rng = mulberry32(seed);
      const game = createGame({}, rng);
      start(game);
      for (let i = 0; i < 240; i++) {
        if (i === 20 || i === 98 || i === 170) jump(game);
        if (i === 60 || i === 138) duck(game);
        if (i === 82 || i === 150) releaseDuck(game);
        step(game, rng);
      }
      return JSON.stringify(game);
    };
    expect(run(77)).toEqual(run(77));
    expect(run(77)).not.toEqual(run(78));
  });
});
