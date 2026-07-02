import { describe, expect, it } from 'vitest';
import {
  PHYSICS,
  VIEW_HEIGHT,
  WORLD_WIDTH,
  createGame,
  fire,
  generatePlatform,
  isJetpackActive,
  pause,
  reset,
  setSteering,
  start,
  step,
  type Enemy,
  type Platform,
} from './genomeJumper';

const DT = 1 / 120;
const advance = (state: ReturnType<typeof createGame>, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / DT) && state.status === 'playing'; i++) step(state, DT);
};

describe('game setup and determinism', () => {
  it('creates a ready game with a safe starting runway', () => {
    const game = createGame(42);
    expect(game.status).toBe('ready');
    expect(game.player.x).toBe(WORLD_WIDTH / 2);
    expect(game.platforms.length).toBeGreaterThan(7);
    expect(game.platforms[0]).toMatchObject({ x: 140, y: 60, width: 140, kind: 'static' });
    expect(game.platforms.every((platform) => platform.y <= game.cameraY + VIEW_HEIGHT * 1.8)).toBe(
      true
    );
  });

  it('reproduces generated worlds and play from the same seed', () => {
    const run = (seed: number) => {
      const game = createGame(seed);
      start(game);
      setSteering(game, 1);
      advance(game, 0.75);
      fire(game);
      advance(game, 0.4);
      return JSON.stringify(game);
    };
    expect(run(81)).toBe(run(81));
    expect(run(81)).not.toBe(run(82));
  });

  it('keeps generated platform gaps within the approachable jump envelope', () => {
    const game = createGame(9);
    game.platforms = [];
    game.nextPlatformY = 700;
    game.lastPlatformX = 150;
    game.lastPlatformWidth = 100;
    game.difficulty = 1;
    let previousY = game.nextPlatformY;
    let previousCentre = game.lastPlatformX + game.lastPlatformWidth / 2;
    for (let i = 0; i < 200; i++) {
      const platform = generatePlatform(game);
      expect(platform.y - previousY).toBeGreaterThanOrEqual(62);
      expect(platform.y - previousY).toBeLessThanOrEqual(119);
      expect(Math.abs(platform.x + platform.width / 2 - previousCentre)).toBeLessThanOrEqual(144);
      expect(platform.x).toBeGreaterThanOrEqual(0);
      expect(platform.x + platform.width).toBeLessThanOrEqual(WORLD_WIDTH);
      previousY = platform.y;
      previousCentre = platform.x + platform.width / 2;
    }
  });
});

describe('state transitions', () => {
  it('starts, pauses, resumes, and ignores simulation while paused', () => {
    const game = createGame(1);
    start(game);
    expect(game.status).toBe('playing');
    pause(game);
    const before = JSON.stringify(game);
    step(game, DT);
    expect(JSON.stringify(game)).toBe(before);
    start(game);
    expect(game.status).toBe('playing');
  });

  it('resets every run-specific field while retaining the requested seed', () => {
    const game = createGame(1);
    start(game);
    game.bonus = 999;
    game.sequence.push('T');
    reset(game, 55);
    expect(game.status).toBe('ready');
    expect(game.seed).toBe(55);
    expect(game.score).toBe(0);
    expect(game.sequence).toEqual([]);
  });
});

describe('movement and jumping', () => {
  it('automatically bounces from the starting platform', () => {
    const game = createGame(2);
    start(game);
    step(game, DT);
    expect(game.player.vy).toBe(PHYSICS.jumpVelocity);
    expect(game.lastEvent).toBe('jump');
  });

  it('accelerates, slows without input, and wraps horizontally', () => {
    const game = createGame(2);
    start(game);
    setSteering(game, 1);
    advance(game, 0.1);
    expect(game.player.vx).toBeGreaterThan(0);
    setSteering(game, 0);
    advance(game, 0.2);
    expect(game.player.vx).toBe(0);
    game.player.x = WORLD_WIDTH - 1;
    game.player.vx = PHYSICS.maxHorizontalSpeed;
    step(game, 0.02);
    expect(game.player.x).toBeLessThan(20);
  });

  it('lands only while descending', () => {
    const game = createGame(2);
    const platform = game.platforms[1];
    game.platforms = [platform];
    game.player.x = platform.x + platform.width / 2;
    game.player.y = platform.y - 1;
    game.player.vy = 300;
    game.status = 'playing';
    step(game, DT);
    expect(game.player.vy).toBeLessThan(300);
    expect(game.player.vy).not.toBe(PHYSICS.jumpVelocity);
  });

  it('advances the camera upward but never back down', () => {
    const game = createGame(2);
    game.status = 'playing';
    game.player.y = 700;
    game.player.vy = 100;
    step(game, DT);
    const highCamera = game.cameraY;
    expect(highCamera).toBeGreaterThan(0);
    game.player.y = highCamera + 100;
    game.player.vy = -10;
    step(game, DT);
    expect(game.cameraY).toBe(highCamera);
  });

  it('ends the run when the player falls below the camera', () => {
    const game = createGame(2);
    game.status = 'playing';
    game.cameraY = 500;
    game.player.y = 400;
    game.player.vy = -500;
    step(game, DT);
    expect(game.status).toBe('over');
    expect(game.lastEvent).toBe('over');
  });
});

describe('platform variants and boosts', () => {
  const landingGame = (platform: Platform) => {
    const game = createGame(3);
    game.status = 'playing';
    game.platforms = [platform];
    game.player.x = platform.x + platform.width / 2;
    game.player.y = platform.y + 1;
    game.player.vy = -200;
    return game;
  };

  it('removes a breakable platform after one landing', () => {
    const platform: Platform = {
      id: 1,
      x: 100,
      y: 200,
      width: 120,
      kind: 'breakable',
      vx: 0,
      removed: false,
      disappearAt: null,
      spring: false,
    };
    const game = landingGame(platform);
    step(game, 0.01);
    expect(platform.removed).toBe(true);
    expect(game.player.vy).toBe(PHYSICS.jumpVelocity);
  });

  it('arms a disappearing platform after landing', () => {
    const platform: Platform = {
      id: 1,
      x: 100,
      y: 200,
      width: 120,
      kind: 'disappearing',
      vx: 0,
      removed: false,
      disappearAt: null,
      spring: false,
    };
    const game = landingGame(platform);
    step(game, 0.01);
    expect(platform.disappearAt).toBeCloseTo(game.time + 0.48);
  });

  it('uses the stronger spring velocity', () => {
    const platform: Platform = {
      id: 1,
      x: 100,
      y: 200,
      width: 120,
      kind: 'static',
      vx: 0,
      removed: false,
      disappearAt: null,
      spring: true,
    };
    const game = landingGame(platform);
    step(game, 0.01);
    expect(game.player.vy).toBe(PHYSICS.springVelocity);
    expect(game.lastEvent).toBe('spring');
  });

  it('moves moving platforms and reverses them at world edges', () => {
    const game = createGame(3);
    const platform = game.platforms.find((item) => item.kind === 'moving')!;
    game.status = 'playing';
    platform.x = WORLD_WIDTH - platform.width - 1;
    platform.vx = 100;
    step(game, 0.02);
    expect(platform.x).toBe(WORLD_WIDTH - platform.width);
    expect(platform.vx).toBeLessThan(0);
  });

  it('collects a jetpack and grants temporary protected ascent', () => {
    const game = createGame(4);
    game.status = 'playing';
    game.platforms = [];
    game.powerUps = [
      {
        id: 90,
        x: game.player.x,
        y: game.player.y + game.player.height / 2,
        kind: 'jetpack',
        collected: false,
      },
    ];
    step(game, DT);
    expect(game.powerUps[0]?.collected ?? true).toBe(true);
    expect(isJetpackActive(game)).toBe(true);
    expect(game.player.vy).toBe(PHYSICS.jetpackVelocity);
    expect(game.bonus).toBe(75);
  });
});

describe('collectibles, combat, and scoring', () => {
  it('collects nucleotide bases and updates score', () => {
    const game = createGame(5);
    game.status = 'playing';
    game.platforms = [];
    game.collectibles = [
      {
        id: 1,
        x: game.player.x,
        y: game.player.y + game.player.height / 2,
        base: 'G',
        collected: false,
      },
    ];
    step(game, DT);
    expect(game.sequence).toEqual(['G']);
    expect(game.bonus).toBe(25);
    expect(game.score).toBeGreaterThanOrEqual(25);
  });

  it('enforces projectile cooldown and destroys an enemy for a bonus', () => {
    const game = createGame(5);
    game.status = 'playing';
    game.platforms = [];
    const enemy: Enemy = {
      id: 80,
      x: game.player.x,
      y: game.player.y + 100,
      width: 34,
      height: 30,
      vx: 0,
      alive: true,
    };
    game.enemies = [enemy];
    expect(fire(game)).toBe(true);
    expect(fire(game)).toBe(false);
    advance(game, 0.3);
    expect(enemy.alive).toBe(false);
    expect(game.bonus).toBe(100);
  });

  it('ends on enemy contact without a jetpack', () => {
    const game = createGame(6);
    game.status = 'playing';
    game.enemies = [
      {
        id: 1,
        x: game.player.x,
        y: game.player.y + game.player.height / 2,
        width: 34,
        height: 30,
        vx: 0,
        alive: true,
      },
    ];
    step(game, DT);
    expect(game.status).toBe('over');
  });

  it('destroys a contacted enemy while jetpack-protected', () => {
    const game = createGame(6);
    game.status = 'playing';
    game.jetpackUntil = 2;
    game.enemies = [
      {
        id: 1,
        x: game.player.x,
        y: game.player.y + game.player.height / 2,
        width: 34,
        height: 30,
        vx: 0,
        alive: true,
      },
    ];
    step(game, DT);
    expect(game.status).toBe('playing');
    expect(game.enemies[0]?.alive ?? false).toBe(false);
    expect(game.bonus).toBe(100);
  });

  it('raises height, score, and difficulty together', () => {
    const game = createGame(7);
    game.status = 'playing';
    game.player.y = 3060;
    game.player.vy = 1;
    step(game, DT);
    expect(game.height).toBeGreaterThan(590);
    expect(game.score).toBe(game.height + game.bonus);
    expect(game.difficulty).toBeGreaterThan(0.18);
  });
});
