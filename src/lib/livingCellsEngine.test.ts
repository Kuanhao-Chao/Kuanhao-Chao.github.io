import { describe, expect, it } from 'vitest';
import {
  LivingCellsEngine,
  getLivingCellsEngine,
  type LivingCell,
  type Organelle,
} from './livingCellsEngine';

const STEP = 1 / 60;
const MITOSIS_SECONDS = 8;
const APOPTOSIS_SECONDS = 7;
const DAUGHTER_RATIO = Math.cbrt(0.5);

function seededRandom(seed = 1): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function makeEngine(seed = 1): LivingCellsEngine {
  const engine = new LivingCellsEngine(seededRandom(seed));
  Object.assign(engine as any, {
    width: 1200,
    height: 800,
    targetCount: 8,
    baseCount: 8,
    quietRemaining: 1_000_000,
    turnoverRemaining: 1_000_000,
  });
  return engine;
}

function createCell(
  engine: LivingCellsEngine,
  targetRadius = 50,
  initialRadius?: number
): LivingCell {
  return (engine as any).createCell(300, 260, false, targetRadius, initialRadius) as LivingCell;
}

function update(engine: LivingCellsEngine, seconds: number, step = STEP): void {
  const iterations = Math.ceil(seconds / step);
  for (let index = 0; index < iterations; index++) (engine as any).update(step);
}

describe('LivingCellsEngine', () => {
  it('provides one shared engine instance', () => {
    expect(getLivingCellsEngine()).toBe(getLivingCellsEngine());
    expect(getLivingCellsEngine()).toBeInstanceOf(LivingCellsEngine);
  });

  it('creates a restrained animal-cell organelle ensemble', () => {
    const engine = makeEngine();
    const cell = createCell(engine, 52);

    expect(cell.state).toBe('mature');
    expect(cell.organelles.some((org) => org.type === 'mitochondria')).toBe(true);
    expect(cell.organelles.some((org) => org.type === 'golgi')).toBe(true);
    expect(cell.organelles.some((org) => org.type === 'er')).toBe(true);
    expect(cell.organelles.some((org) => org.type === 'centrosome')).toBe(true);
    expect(cell.harmonics.reduce((sum, value) => sum + value, 0)).toBeLessThan(0.04);
  });

  it('keeps nuclei and organelles inside cells across responsive radii', () => {
    const engine = makeEngine();
    for (const radius of [20, 28, 36, 50, 64]) {
      for (let sample = 0; sample < 20; sample++) {
        const cell = createCell(engine, radius);
        const nucleusReach =
          Math.hypot(cell.nucleusOffset.x * radius, cell.nucleusOffset.y * radius) + radius * 0.25;
        expect(nucleusReach).toBeLessThan(radius * 0.45);
        for (const org of cell.organelles) assertOrganelleContained(org, radius);
      }
    }
  });

  it('grows in volume space without a first-update size jump', () => {
    const engine = makeEngine();
    const cell = createCell(engine, 50, 20);
    cell.growthDuration = 30;
    (engine as any).cells = [cell];
    const initial = cell.baseRadius;

    (engine as any).update(STEP);
    expect(cell.baseRadius).toBeGreaterThanOrEqual(initial);
    expect(cell.baseRadius - initial).toBeLessThan(0.001);

    update(engine, 29.95);
    expect(cell.state).toBe('mature');
    expect(cell.baseRadius).toBeCloseTo(50, 8);
  });

  it('has wall-clock lifecycle progress independent of update frequency', () => {
    const fine = makeEngine(4);
    const coarse = makeEngine(4);
    const fineCell = createCell(fine, 50, 25);
    const coarseCell = createCell(coarse, 50, 25);
    fineCell.growthDuration = coarseCell.growthDuration = 30;
    (fine as any).cells = [fineCell];
    (coarse as any).cells = [coarseCell];

    update(fine, 12, 1 / 120);
    update(coarse, 12, 1 / 30);
    expect(fineCell.growthProgress).toBeCloseTo(coarseCell.growthProgress, 10);
    expect(fineCell.baseRadius).toBeCloseTo(coarseCell.baseRadius, 7);
  });

  it('enforces the natural size checkpoint and mature dwell', () => {
    const engine = makeEngine();
    const growing = createCell(engine, 50, 35);
    engine.triggerMitosis(growing);
    expect(growing.state).toBe('growing');

    const newlyMature = createCell(engine, 50);
    newlyMature.matureElapsed = 7.99;
    engine.triggerMitosis(newlyMature);
    expect(newlyMature.state).toBe('mature');

    newlyMature.matureElapsed = 8;
    engine.triggerMitosis(newlyMature);
    expect(newlyMature.state).toBe('mitosis');
    expect(newlyMature.mitosisProgress).toBe(0);
  });

  it('lets an explicit click divide at the actual current size without an expansion pop', () => {
    const engine = makeEngine();
    const cell = createCell(engine, 60, 24);
    engine.triggerMitosis(cell, true);

    expect(cell.state).toBe('mitosis');
    expect(cell.divisionRadius).toBe(24);
    expect(cell.radius).toBe(24);
    expect(cell.mitosisEntryContour).toHaveLength(64);
  });

  it('runs eight-second mitosis and conserves daughter volume', () => {
    const engine = makeEngine();
    const parent = createCell(engine, 50, 30);
    (engine as any).cells = [parent];
    engine.triggerMitosis(parent, true);

    parent.stateElapsed = MITOSIS_SECONDS - STEP * 1.5;
    (engine as any).update(STEP);
    expect((engine as any).cells).toHaveLength(1);
    (engine as any).update(STEP);
    const daughters = (engine as any).cells as LivingCell[];
    expect(daughters).toHaveLength(2);
    for (const daughter of daughters) {
      expect(daughter.state).toBe('growing');
      expect(daughter.birthRadius).toBeCloseTo(30 * DAUGHTER_RATIO, 8);
      expect(daughter.life).toBe(1);
    }
    const daughterVolume = daughters.reduce((sum, daughter) => sum + daughter.birthRadius ** 3, 0);
    expect(daughterVolume).toBeCloseTo(30 ** 3, 6);
  });

  it('uses a continuous, non-self-intersecting dual-lobe contour', () => {
    const engine = makeEngine();
    const circle = (engine as any).dualLobePoints(0, 50, 50) as Array<{ x: number; y: number }>;
    const late = (engine as any).dualLobePoints(40, 39.685, 2) as Array<{ x: number; y: number }>;

    expect(circle).toHaveLength(64);
    expect(late).toHaveLength(64);
    for (const points of [circle, late]) {
      expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(
        true
      );
      expect(hasStrictIntersection(points)).toBe(false);
    }
    expect(circle[0].y).toBeCloseTo(0, 8);
    expect(late[0].y).toBeCloseTo(0, 8);
  });

  it('stages seven-second apoptosis with staggered blebs and late-only fading', () => {
    const engine = makeEngine(9);
    const cell = createCell(engine, 48);
    (engine as any).cells = [cell];
    engine.triggerApoptosis(cell);

    expect(cell.blebs!.length).toBeGreaterThanOrEqual(3);
    expect(cell.blebs!.length).toBeLessThanOrEqual(6);
    expect(new Set(cell.blebs!.map((bleb) => bleb.onset)).size).toBe(cell.blebs!.length);

    update(engine, APOPTOSIS_SECONDS * 0.7);
    expect(cell.life).toBe(1);
    expect(cell.blebs!.some((bleb) => bleb.detached)).toBe(true);

    update(engine, APOPTOSIS_SECONDS * 0.15);
    expect(cell.life).toBeLessThan(1);
    expect((engine as any).debugSnapshot().particles).toBe(0);

    update(engine, APOPTOSIS_SECONDS * 0.2);
    expect((engine as any).cells).toHaveLength(0);
    expect((engine as any).debugSnapshot().particles).toBe(0);
  });

  it('accounts for committed outcomes and permits only one major lifecycle event', () => {
    const engine = makeEngine();
    (engine as any).quietRemaining = 0;
    (engine as any).seed();
    const cells = (engine as any).cells as LivingCell[];
    for (const cell of cells) cell.matureElapsed = 20;
    (engine as any).queueDivision(cells[0]);
    (engine as any).queueDivision(cells[1]);
    (engine as any).updateHomeostasis();

    expect(cells.filter((cell) => cell.state === 'mitosis')).toHaveLength(1);
    expect((engine as any).projectedCount()).toBe(9);
    expect((engine as any).divisionQueue).toHaveLength(1);

    // The active lifecycle prevents a second controller action.
    (engine as any).updateHomeostasis();
    expect(
      cells.filter((cell) => cell.state === 'mitosis' || cell.state === 'apoptosis')
    ).toHaveLength(1);
  });

  it('weights projected outcomes as growing 1, mature 1, mitosis 2, and apoptosis 0', () => {
    const engine = makeEngine();
    const growing = createCell(engine, 50, 24);
    const mature = createCell(engine, 50);
    const mitotic = createCell(engine, 50);
    const apoptotic = createCell(engine, 50);
    engine.triggerMitosis(mitotic, true);
    engine.triggerApoptosis(apoptotic);
    (engine as any).cells = [growing, mature, mitotic, apoptotic];

    expect((engine as any).projectedCount()).toBe(4);
  });

  it('maintains target ± 1 across seeded long-running simulations', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const engine = makeEngine(seed);
      Object.assign(engine as any, { quietRemaining: 0, turnoverRemaining: 1 });
      (engine as any).seed();
      let minimum = Number.POSITIVE_INFINITY;
      let maximum = 0;
      for (let frame = 0; frame < 60 * 180; frame++) {
        (engine as any).update(STEP);
        const projected = (engine as any).projectedCount() as number;
        minimum = Math.min(minimum, projected);
        maximum = Math.max(maximum, projected);
        const active = ((engine as any).cells as LivingCell[]).filter(
          (cell) => cell.state === 'mitosis' || cell.state === 'apoptosis'
        ).length;
        expect(active).toBeLessThanOrEqual(1);
      }
      expect(minimum).toBeGreaterThanOrEqual(7);
      expect(maximum).toBeLessThanOrEqual(9);
      expect((engine as any).debugSnapshot().particles).toBe(0);
    }
  });

  it('clears stale queue and grab state when diagnostics force a lifecycle phase', () => {
    const engine = makeEngine();
    const cell = createCell(engine);
    (engine as any).cells = [cell];
    (engine as any).queueDivision(cell);
    cell.isGrabbed = true;
    (engine as any).grabbedCell = cell;

    expect((engine as any).debugSetState(cell.id, 'mitosis', 0.5)).toBe(true);
    expect(cell.state).toBe('mitosis');
    expect(cell.divisionQueued).toBe(false);
    expect(cell.isGrabbed).toBe(false);
    expect((engine as any).divisionQueue).toHaveLength(0);

    expect((engine as any).debugSetState(cell.id, 'apoptosis', 0.5)).toBe(true);
    expect(cell.state).toBe('apoptosis');
    expect(cell.apoptosisProgress).toBe(0.5);
  });

  it('commits a fast desktop drag on pointerup and clamps it inside the viewport', () => {
    const engine = makeEngine();
    const cell = createCell(engine, 50);
    Object.assign(cell, {
      isGrabbed: true,
      grabOffset: { x: 8, y: -6 },
      targetDragPos: { x: 420, y: 300 },
    });
    Object.assign(engine as any, {
      cells: [cell],
      grabbedCell: cell,
      pointer: { x: 420, y: 300, down: true, type: 'mouse' },
      pointerDown: { x: 300, y: 260, time: performance.now() },
    });

    (engine as any).onPointerUp({ clientX: 2_000, clientY: -100 });

    expect(cell.x).toBe(1_150);
    expect(cell.y).toBe(50);
    expect(cell.previousX).toBe(cell.x);
    expect(cell.previousY).toBe(cell.y);
    expect(cell.isGrabbed).toBe(false);
    expect(cell.targetDragPos).toBeUndefined();
    expect((engine as any).grabbedCell).toBeNull();
  });

  it('ignores right-clicks and secondary touch pointers', () => {
    const engine = makeEngine();
    const cell = createCell(engine, 50);
    Object.assign(engine as any, { cells: [cell], attached: true });

    (engine as any).onPointerDown({
      clientX: cell.x,
      clientY: cell.y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 2,
      isPrimary: true,
      target: null,
    });
    expect((engine as any).pointer.down).toBe(false);

    (engine as any).onPointerDown({
      clientX: cell.x,
      clientY: cell.y,
      pointerId: 2,
      pointerType: 'touch',
      button: 0,
      isPrimary: false,
      target: null,
    });
    expect((engine as any).pointer.down).toBe(false);
    expect(cell.divisionQueued).toBe(false);
  });
});

function assertOrganelleContained(org: Organelle, radius: number): void {
  if (org.type === 'mitochondria') {
    expect(radius * org.dist + org.length / 2).toBeLessThan(radius * 0.66);
  } else if (org.type === 'golgi') {
    const outerLayer = radius * (0.04 + (org.layers - 1) * 0.025);
    expect(radius * org.dist + outerLayer).toBeLessThan(radius * 0.66);
  } else if (org.type === 'centrosome') {
    expect(radius * org.dist + Math.max(1.1, radius * 0.032)).toBeLessThan(radius * 0.55);
  }
}

function hasStrictIntersection(points: Array<{ x: number; y: number }>): boolean {
  const orientation = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number }
  ) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let first = 0; first < points.length; first++) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 2; second < points.length; second++) {
      const secondNext = (second + 1) % points.length;
      if (first === 0 && secondNext === 0) continue;
      const a = orientation(points[first], points[firstNext], points[second]);
      const b = orientation(points[first], points[firstNext], points[secondNext]);
      const c = orientation(points[second], points[secondNext], points[first]);
      const d = orientation(points[second], points[secondNext], points[firstNext]);
      if (a * b < 0 && c * d < 0) return true;
    }
  }
  return false;
}
