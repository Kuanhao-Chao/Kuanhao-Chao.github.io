import { describe, it, expect } from 'vitest';
import {
  createGame,
  createLevel,
  start,
  pause,
  step,
  fire,
  reload,
  switchWeapon,
  turnBy,
  interact,
  retryCheckpoint,
  proofResult,
  pathTo,
  hasLineOfSight,
  hazardPhase,
  objectiveTarget,
  WEAPONS,
  WEAPON_IDS,
  IDLE_INPUT,
  eye,
  enemyCenter,
  v3,
  type Enemy,
  type GameState,
  type ProofLevel,
  type StepInput,
  type Vec3,
} from './proofreader';
import {
  compileWorld,
  solidGeometry,
  rayDistance,
  resolveBody,
  visible,
  add,
  unit,
  subtract,
} from './proofreaderWorld';
import { emptyProgress, recordResult, decodeProgress, rulesVersion, challengeUrl } from './arcade';
import { driveProofreader3D } from '../../scripts/lib/proofreaderAgent.mjs';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

describe('legal-input campaign witnesses', () => {
  for (const difficulty of ['standard', 'expert'] as const)
    for (let stage = 1; stage <= 6; stage++)
      it(`${difficulty} sector ${stage} is completable without teleportation or granted health`, () => {
        const s = createGame(2100 + stage, { stage, difficulty });
        start(s);
        const input = { ...IDLE_INPUT };
        const api = {
          state: () => s,
          target: () => objectiveTarget(s),
          route: (p: Vec3) => pathTo(s, p),
          visible: (a: Vec3, b: Vec3) => hasLineOfSight(s, a, b),
          turn: (yaw: number, pitch: number) => turnBy(s, yaw, pitch),
          setInput: (next: Partial<StepInput>) => Object.assign(input, next),
          interact: () => interact(s),
          tick: (n: number) => ticks(s, n, input),
        };
        const result = driveProofreader3D({ api, maxIterations: 7000 });
        expect(result, result.error ? JSON.stringify(result) : undefined).toMatchObject({
          status: 'won',
          retries: 0,
        });
      }, 30000);
});

function room(): ProofLevel {
  const level = createLevel(1);
  return {
    ...level,
    solids: [level.solids[0]],
    encounters: [],
    objectives: [{ id: 1, position: v3(15, 0, -18), label: 'Test relay', kind: 'relay' }],
    checkpoints: [],
    terminals: [],
    crates: [],
    doors: [],
    hazards: [],
    decor: [],
    spawn: v3(0, 0.02, 10),
  };
}
function playing(level = room(), practice = false) {
  const s = createGame(42, { mode: practice ? 'practice' : 'campaign' }, level);
  start(s);
  return s;
}
function ticks(s: GameState, n: number, input = IDLE_INPUT) {
  for (let i = 0; i < n; i++) step(s, 1 / 120, input);
}
function enemy(position = v3(0, 0, 0), kind: Enemy['kind'] = 'scout'): Enemy {
  return {
    id: 100,
    kind,
    position,
    previous: { ...position },
    velocity: v3(),
    hp: kind === 'guardian' ? 180 : 108,
    maxHp: kind === 'guardian' ? 180 : 108,
    alive: true,
    yaw: Math.PI,
    attackIn: 100,
    windup: 0,
    attacking: false,
    charge: null,
    chargeFor: 0,
    hurtFor: 0,
    path: [],
    pathIn: 100,
    phase: 0,
  };
}
function aim(s: GameState, target: Enemy) {
  const d = unit(subtract(enemyCenter(target), eye(s)));
  s.player.yaw = Math.atan2(d.x, -d.z);
  s.player.pitch = Math.asin(d.y);
}

describe('Proofreader real 3D levels', () => {
  it('merges stairs and sloped ramps into one visible terrain mesh', () => {
    const pieces = createLevel(2)
      .solids.filter((s) => s.surface === 'ramp')
      .map(solidGeometry)
      .map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = mergeGeometries(pieces);
    expect(merged).not.toBeNull();
    pieces.forEach((g) => g.dispose());
    merged?.dispose();
  });
  it('never places navigation nodes fully inside a thick solid', () => {
    const level = room();
    level.solids.push({
      id: 'thick-wall',
      kind: 'box',
      position: v3(0, 1.5, 0),
      size: v3(3, 3, 3),
      surface: 'wall',
    });
    const nodes = compileWorld(level).nodes;
    expect(nodes.some((n) => n.x === 0 && n.z === 0 && n.y < 1)).toBe(false);
  });
  it('does not cut a diagonal off a ramp before reaching the upper deck', () => {
    const world = compileWorld(createLevel(3));
    const a = world.nodes.find((n) => n.x === -12 && n.z === -12 && n.y > 6);
    const b = world.nodes.find((n) => n.x === -10 && n.z === -14 && n.y > 7);
    expect(a).toBeDefined();
    expect(!b || !a!.links.includes(b.id)).toBe(true);
  });
  for (let stage = 1; stage <= 6; stage++)
    it(`sector ${stage} has reachable objectives, terminals, checkpoints and exits on distinct floors`, () => {
      const s = playing(createLevel(stage));
      const world = compileWorld(s.level);
      expect(world.nodes.length).toBeGreaterThan(200);
      expect(s.level.floors).toBe(stage < 3 ? 2 : 3);
      const targets = [
        s.level.exit,
        ...s.level.objectives.map((o) => o.position),
        ...s.level.terminals,
        ...s.level.checkpoints,
        ...s.level.encounters.map((e) => e.trigger),
      ];
      for (const target of targets)
        expect(pathTo(s, target), `No path to ${JSON.stringify(target)}`).not.toHaveLength(0);
      expect(new Set(world.nodes.map((n) => Math.round(n.y))).size).toBeGreaterThan(2);
    });
  it('supports walking under a bridge and standing on its upper surface', () => {
    const world = compileWorld(createLevel(1));
    const below = resolveBody(world, v3(0, -0.02, -4), v3(0, -1, 0));
    const above = resolveBody(world, v3(0, 3.59, -4), v3(0, -1, 0));
    expect(below.position.y).toBeCloseTo(0, 3);
    expect(below.grounded).toBe(true);
    expect(above.position.y).toBeCloseTo(3.6, 3);
    expect(above.grounded).toBe(true);
    expect(visible(world, v3(0, 1, -4), v3(0, 5, -4))).toBe(false);
  });
  it('stops rays at walls and ceilings but not open space', () => {
    const world = compileWorld(createLevel(1));
    expect(rayDistance(world, v3(0, 1, -4), v3(0, 1, 0), 10)).toBeCloseTo(2.3, 2);
    expect(rayDistance(world, v3(0, 1, 18), v3(1, 0, 0), 50)).toBeCloseTo(20, 1);
    expect(visible(world, v3(-13, 4.7, 0), v3(13, 4.7, 0))).toBe(true);
  });
});

describe('3D movement, timing and input', () => {
  it('is deterministic and serializable, including snapshots', () => {
    const level = room(),
      a = playing(level),
      b = playing(level);
    ticks(a, 240, { ...IDLE_INPUT, forward: 1, strafe: 0.5, turn: 0.2, fire: true });
    ticks(b, 240, { ...IDLE_INPUT, forward: 1, strafe: 0.5, turn: 0.2, fire: true });
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a)).player.position).toEqual(a.player.position);
  });
  it('normalizes diagonal movement and accelerates/decelerates smoothly', () => {
    const a = playing(),
      b = playing();
    ticks(a, 120, { ...IDLE_INPUT, forward: 1 });
    ticks(b, 120, { ...IDLE_INPUT, forward: 1, strafe: 1 });
    expect(Math.hypot(b.player.position.x, b.player.position.z - 10)).toBeCloseTo(
      Math.hypot(a.player.position.x, a.player.position.z - 10),
      2
    );
    const old = Math.abs(a.player.velocity.z);
    step(a, 1 / 120, IDLE_INPUT);
    expect(Math.abs(a.player.velocity.z)).toBeLessThan(old);
    expect(Math.abs(a.player.velocity.z)).toBeGreaterThan(0);
  });
  it('jumps once per press, lands, and does not automatically bunny-hop', () => {
    const s = playing();
    ticks(s, 30);
    const heights = [];
    for (let i = 0; i < 180; i++) {
      step(s, 1 / 120, { ...IDLE_INPUT, jump: true });
      heights.push(s.player.position.y);
    }
    expect(Math.max(...heights)).toBeGreaterThan(0.9);
    expect(Math.max(...heights)).toBeLessThan(1.3);
    expect(s.player.grounded).toBe(true);
    expect(heights.slice(100).every((y) => y < 0.01)).toBe(true);
  });
  it('looks vertically, clamps pitch, and preserves grounded forward movement', () => {
    const s = playing();
    turnBy(s, 0, 100);
    expect(s.player.pitch).toBe(1.38);
    ticks(s, 120, { ...IDLE_INPUT, forward: 1 });
    expect(s.player.position.z).toBeLessThan(7);
    expect(s.player.position.y).toBeCloseTo(0, 3);
  });
  it('freezes every timer and state while paused or terminal', () => {
    const s = playing();
    ticks(s, 30);
    pause(s);
    const saved = structuredClone(s);
    ticks(s, 60, { ...IDLE_INPUT, fire: true });
    expect(s).toEqual(saved);
    s.status = 'won';
    const ended = structuredClone(s);
    ticks(s, 10);
    expect(s).toEqual(ended);
  });
  it('rejects nonfinite deltas and sanitizes analog inputs', () => {
    const s = playing(),
      old = structuredClone(s);
    step(s, NaN);
    step(s, Infinity);
    step(s, -1);
    expect(s).toEqual(old);
    step(s, 10, { ...IDLE_INPUT, forward: NaN, strafe: Infinity, turn: NaN, look: Infinity });
    expect(s.time).toBeCloseTo(1 / 30);
    expect(Number.isFinite(s.player.position.x)).toBe(true);
  });
  it('walks continuously up a real ramp without a jump', () => {
    const s = playing(createLevel(1), true);
    s.player.position = v3(-13, 0.01, 18);
    s.player.previous = { ...s.player.position };
    ticks(s, 390, { ...IDLE_INPUT, forward: 1 });
    expect(s.player.position.y).toBeGreaterThan(3.5);
    expect(s.player.position.z).toBeLessThan(7);
  });
  it('walks up the authored staircase without requiring repeated jumps', () => {
    const s = playing(createLevel(2), true);
    s.mission.triggered = [1, 2];
    s.player.position = v3(13, 0.01, 18);
    ticks(s, 390, { ...IDLE_INPUT, forward: 1 });
    expect(s.player.position.y).toBeGreaterThan(3.5);
    expect(s.player.position.z).toBeLessThan(7);
  });
});

describe('weapons, cover, supply and enemy tells', () => {
  it('starts with all three weapons and independent ammunition', () => {
    const s = playing();
    expect(Object.keys(s.player.magazines)).toEqual(WEAPON_IDS);
    fire(s);
    expect(s.player.magazines.carbine).toBe(23);
    expect(s.player.magazines.scatter).toBe(6);
    switchWeapon(s, 'scatter');
    expect(s.player.weapon).toBe('scatter');
    expect(fire(s)).toBe(false);
  });
  it('aims in true 3D and cannot damage an enemy through an upper floor', () => {
    const s = playing(createLevel(1));
    s.player.position = v3(0, 0, -4);
    const e = enemy(v3(0, 3.6, -4));
    s.enemies = [e];
    aim(s, e);
    fire(s);
    expect(e.hp).toBe(108);
    s.player.position = v3(0, 0, 5);
    s.player.cooldown = 0;
    aim(s, e);
    fire(s);
    expect(e.hp).toBeLessThan(108);
  });
  it('counts an entire scatter volley once for accuracy', () => {
    const s = playing();
    const e = enemy(v3(0, 0, 7));
    s.enemies = [e];
    aim(s, e);
    switchWeapon(s, 'scatter');
    s.player.cooldown = 0;
    fire(s);
    expect(s.shots).toBe(1);
    expect(s.hits).toBe(1);
    expect(e.hp).toBeLessThan(70);
  });
  it('reloads only the selected magazine and conserves reserve ammunition', () => {
    const s = playing();
    s.player.magazines.carbine = 4;
    s.player.reserves.carbine = 5;
    expect(reload(s)).toBe(true);
    ticks(s, 160);
    expect(s.player.magazines.carbine).toBe(9);
    expect(s.player.reserves.carbine).toBe(0);
    expect(s.player.magazines.scatter).toBe(6);
  });
  it('makes practice invulnerable with unlimited shots', () => {
    const s = playing(room(), true);
    for (const id of WEAPON_IDS) {
      switchWeapon(s, id);
      s.player.cooldown = 0;
      for (let i = 0; i < 40; i++) {
        fire(s);
        s.player.cooldown = 0;
      }
      expect(s.player.magazines[id]).toBe(WEAPONS[id].capacity);
    }
    s.projectiles = [
      {
        id: 1,
        position: add(s.player.position, v3(0, 0.9, -0.5)),
        previous: v3(),
        velocity: v3(0, 0, 60),
        life: 1,
        hostile: true,
        damage: 100,
        radius: 0.16,
        shot: 0,
      },
    ];
    ticks(s, 2);
    expect(s.player.health).toBe(100);
  });
  it('prevents fast hostile projectiles from tunneling through a wall', () => {
    const level = room();
    level.solids.push({
      id: 'wall',
      kind: 'box',
      position: v3(0, 2, 5),
      size: v3(20, 4, 0.4),
      surface: 'wall',
    });
    const s = playing(level);
    s.projectiles = [
      {
        id: 1,
        position: v3(0, 0.9, 0),
        previous: v3(),
        velocity: v3(0, 0, 1000),
        life: 1,
        hostile: true,
        damage: 100,
        radius: 0.16,
        shot: 0,
      },
    ];
    step(s, 1 / 30);
    expect(s.player.health).toBe(100);
    expect(s.projectiles).toHaveLength(0);
  });
  it('does not let an explosion damage targets on the other side of cover', () => {
    const level = room();
    level.solids.push({
      id: 'wall',
      kind: 'box',
      position: v3(0, 2, 5),
      size: v3(20, 4, 0.4),
      surface: 'wall',
    });
    const s = playing(level),
      e = enemy(v3(0, 0, 4));
    s.enemies = [e];
    switchWeapon(s, 'pulse');
    s.player.cooldown = 0;
    aim(s, e);
    fire(s);
    ticks(s, 60);
    expect(e.hp).toBe(108);
  });
  it('requires a shield relay for each guardian phase', () => {
    const s = playing(),
      boss = enemy(v3(0, 0, 5), 'guardian');
    s.enemies = [boss];
    aim(s, boss);
    fire(s);
    expect(boss.hp).toBe(180);
    s.mission.objectives = [1];
    s.player.cooldown = 0;
    boss.hp = 1;
    fire(s);
    expect(boss.phase).toBe(1);
    expect(boss.hp).toBe(180);
    s.player.cooldown = 0;
    fire(s);
    expect(boss.hp).toBe(180);
  });
  it('telegraphs chargers before moving or dealing damage', () => {
    const s = playing(),
      e = enemy(v3(0, 0, 5), 'charger');
    e.attackIn = 0;
    s.enemies = [e];
    ticks(s, 1);
    const initial = { ...e.position };
    expect(e.attacking).toBe(true);
    ticks(s, 60);
    expect(e.position).toEqual(initial);
    expect(s.player.health).toBe(100);
    ticks(s, 70);
    expect(e.position.z).toBeGreaterThan(5);
  });
  it('makes repeated terminal refills score-free and opens a relay door', () => {
    const level = room();
    level.terminals = [v3(0, 0, 10)];
    const s = playing(level);
    s.player.reserves.carbine = 0;
    expect(interact(s)).toBe(true);
    expect(s.player.reserves.carbine).toBe(120);
    expect(s.score).toBe(0);
    interact(s);
    expect(s.score).toBe(0);
  });
});

describe('checkpoint and progress rules', () => {
  it('restores an independent world snapshot, preserves time, and marks retries unranked', () => {
    const s = playing();
    ticks(s, 60);
    s.player.health = 0;
    s.status = 'over';
    s.score = 999;
    expect(retryCheckpoint(s)).toBe(true);
    expect(s.score).toBe(0);
    expect(s.player.health).toBe(100);
    expect(s.runTime).toBeCloseTo(0.5);
    expect(s.retries).toBe(1);
    expect(s.status).toBe('paused');
    s.player.health = 5;
    expect(s.checkpoint?.data.player.health).toBe(100);
    s.status = 'won';
    const result = proofResult(s);
    expect(result.recordEligible).toBe(false);
    expect(result.medals).toEqual([false, false, false]);
    const progress = recordResult(emptyProgress(3), s.run, result);
    expect(progress.unlocked).toBe(2);
    expect(progress.records).toEqual({});
  });
  it('does not retry a checkpoint from endless, or from a live run', () => {
    const s = playing();
    expect(retryCheckpoint(s)).toBe(false);
    s.status = 'over';
    s.run.mode = 'classic';
    expect(retryCheckpoint(s)).toBe(false);
  });
  it('keeps the v2 games separate from Proofreader v3', () => {
    expect(rulesVersion('snake')).toBe(2);
    expect(rulesVersion('jetpack')).toBe(2);
    expect(rulesVersion('proofreader')).toBe(3);
    const old = JSON.stringify(emptyProgress());
    expect(decodeProgress(old, 3)).toEqual(emptyProgress(3));
    expect(challengeUrl('/games/proofreader/', playing().run, 3)).toContain('rules=3');
  });
  it('advances the lockdown only in the defended control zone', () => {
    const s = playing(createLevel(5), true);
    s.mission.objectives = [1, 2];
    s.mission.triggered = s.level.encounters.map((e) => e.id);
    ticks(s, 120);
    expect(s.mission.holdout).toBe(0);
    s.player.position = v3(0, 0, 6);
    ticks(s, 120);
    expect(s.mission.holdout).toBeCloseTo(1, 2);
    expect(s.mission.holdoutWaves).toBe(1);
    s.player.position = v3(0, 0, 19);
    const time = s.mission.holdout;
    ticks(s, 120);
    expect(s.mission.holdout).toBe(time);
  });
  it('returns supply packets to the entry-side recovery dock', () => {
    const s = playing(createLevel(4));
    expect(s.level.exit.z).toBeGreaterThan(15);
    s.mission.exitOpen = true;
    expect(objectiveTarget(s).label).toContain('recovery dock');
  });
  it('warns before hazards become harmful and provides a navigation target', () => {
    const s = playing(createLevel(3));
    const h = s.level.hazards[0];
    s.time = h.period - h.offset - 1.5;
    expect(hazardPhase(s, 0)).toBe('warning');
    s.time = h.period - h.offset - 0.4;
    expect(hazardPhase(s, 0)).toBe('active');
    expect(objectiveTarget(s).label.length).toBeGreaterThan(5);
  });
});
