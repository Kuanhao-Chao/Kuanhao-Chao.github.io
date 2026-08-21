import { describe, expect, it } from 'vitest';
import {
  LivingCellsEngine,
  getLivingCellsEngine,
  type LivingCell,
  type Organelle,
} from './livingCellsEngine';

const STEP = 1 / 60;
const MITOSIS_SECONDS = 4;
const POSTMITOTIC_SECONDS = 1.6;
const APOPTOSIS_SECONDS = 5.4;
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
    expect(cell.vertices).toHaveLength(24);
    expect(cell.aspect).toBeGreaterThanOrEqual(0.78);
    expect(cell.aspect).toBeLessThanOrEqual(1.26);
    const deformation = cell.harmonics.reduce((sum, value) => sum + value, 0);
    expect(deformation).toBeGreaterThanOrEqual(0.05);
    expect(deformation).toBeLessThanOrEqual(0.20);
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

  it('preserves projected area across strong, smooth seeded morphologies', () => {
    const engine = makeEngine(1);
    const aspects: number[] = [];
    for (let sample = 0; sample < 40; sample++) {
      const cell = createCell(engine, 52);
      const contour = (engine as any).sampleNormalContour(cell) as Array<{ x: number; y: number }>;
      aspects.push(cell.aspect);
      expect(contour).toHaveLength(72);
      expect(contour.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(
        true
      );
      expect(hasStrictIntersection(contour)).toBe(false);
      expect(polygonArea(contour)).toBeCloseTo(Math.PI * cell.radius ** 2, 7);
    }
    expect(Math.max(...aspects) - Math.min(...aspects)).toBeGreaterThan(0.35);
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
    expect(cell.mitosisEntryContour).toHaveLength(72);
    expect(cell.mitosisPlan?.daughters).toHaveLength(2);
  });

  it('runs four-second mitosis, conserves volume, and hands off cached daughters exactly', () => {
    const engine = makeEngine();
    const parent = createCell(engine, 50, 30);
    (engine as any).cells = [parent];
    engine.triggerMitosis(parent, true);

    parent.stateElapsed = MITOSIS_SECONDS - STEP * 2.5;
    (engine as any).update(STEP);
    expect((engine as any).cells).toHaveLength(1);
    update(engine, STEP * 2);
    const daughters = (engine as any).cells as LivingCell[];
    expect(daughters).toHaveLength(2);
    for (const daughter of daughters) {
      expect(daughter.state).toBe('postmitotic');
      expect(daughter.birthRadius).toBeCloseTo(30 * DAUGHTER_RATIO, 8);
      expect(daughter.life).toBe(1);
    }
    const daughterVolume = daughters.reduce((sum, daughter) => sum + daughter.birthRadius ** 3, 0);
    expect(daughterVolume).toBeCloseTo(30 ** 3, 6);
    expect(daughters[0]).toBe(parent.mitosisPlan?.daughters[0]);
    expect(daughters[1]).toBe(parent.mitosisPlan?.daughters[1]);
    expect((daughters[0].x + daughters[1].x) / 2).toBeCloseTo(parent.x, 8);
    expect((daughters[0].y + daughters[1].y) / 2).toBeCloseTo(parent.y, 8);
    expect((daughters[0].vx + daughters[1].vx) / 2).toBeCloseTo(parent.vx, 8);
    expect((daughters[0].vy + daughters[1].vy) / 2).toBeCloseTo(parent.vy, 8);
    const recoil = Math.hypot(daughters[0].vx - parent.vx, daughters[0].vy - parent.vy);
    expect(recoil).toBeGreaterThanOrEqual(18 - 1e-8);
    expect(recoil).toBeLessThanOrEqual(36 + 1e-8);

    const initialCenter = {
      x: (daughters[0].x + daughters[1].x) / 2,
      y: (daughters[0].y + daughters[1].y) / 2,
    };
    for (let frame = 0; frame < 90; frame++) {
      (engine as any).update(STEP);
      const separation = Math.hypot(
        daughters[0].x - daughters[1].x,
        daughters[0].y - daughters[1].y
      );
      expect(separation).toBeGreaterThanOrEqual(2 * daughters[0].birthRadius - 1e-7);
      expect(separation).toBeLessThanOrEqual(daughters[0].siblingRestDistance! * 1.15);
    }
    expect((daughters[0].x + daughters[1].x) / 2).toBeCloseTo(initialCenter.x + parent.vx * 1.5, 6);
    expect((daughters[0].y + daughters[1].y) / 2).toBeCloseTo(initialCenter.y + parent.vy * 1.5, 6);

    update(engine, POSTMITOTIC_SECONDS - 1.5 + STEP);
    expect(daughters.every((daughter) => daughter.state === 'growing')).toBe(true);
  });

  it('uses a continuous, non-self-intersecting dual-lobe contour', () => {
    const engine = makeEngine();
    const circle = (engine as any).dualLobePoints(0, 50, 50) as Array<{ x: number; y: number }>;
    const late = (engine as any).dualLobePoints(40, 39.685, 2) as Array<{ x: number; y: number }>;

    expect(circle).toHaveLength(72);
    expect(late).toHaveLength(72);
    for (const points of [circle, late]) {
      expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(
        true
      );
      expect(hasStrictIntersection(points)).toBe(false);
    }
    expect(circle[0].y).toBeCloseTo(0, 8);
    expect(late[0].y).toBeCloseTo(0, 8);
  });

  it('hands off round daughters exactly, then restores morphology while keeping edge pairs bounded', () => {
    const engine = makeEngine(13);
    const parent = createCell(engine, 50, 30);
    Object.assign(parent, { x: 50, y: 260, vx: -4, vy: 0 });
    (engine as any).cells = [parent];
    engine.triggerMitosis(parent, true);
    const plan = parent.mitosisPlan!;
    parent.mitosisAngle = 0;
    plan.axis = 0;
    for (const daughter of plan.daughters) {
      daughter.aspect = 1.24;
      daughter.angle = 0;
      daughter.siblingAxis = 0;
    }
    const plannedContours = plan.daughters.map((daughter) =>
      (engine as any).sampleNormalContour(daughter, 0, plan.daughterRadius)
    );
    for (const contour of plannedContours) {
      const extentX = Math.max(...contour.map((point: { x: number }) => Math.abs(point.x)));
      const extentY = Math.max(...contour.map((point: { y: number }) => Math.abs(point.y)));
      expect(extentX / extentY).toBeCloseTo(1, 6);
    }

    parent.stateElapsed = MITOSIS_SECONDS;
    (engine as any).updateLifecycle(parent, 0, 0);
    const daughters = (engine as any).cells as LivingCell[];
    expect(daughters).toHaveLength(2);
    daughters.forEach((daughter, index) => {
      expect((engine as any).sampleNormalContour(daughter)).toEqual(plannedContours[index]);
    });

    update(engine, 1.5);
    for (const daughter of daughters) {
      const contour = (engine as any).collisionContour(daughter);
      const left = (engine as any).supportFromContour(contour, -1, 0);
      const right = (engine as any).supportFromContour(contour, 1, 0);
      const top = (engine as any).supportFromContour(contour, 0, -1);
      const bottom = (engine as any).supportFromContour(contour, 0, 1);
      expect(daughter.x - left).toBeGreaterThanOrEqual(-1e-7);
      expect(daughter.x + right).toBeLessThanOrEqual(1_200 + 1e-7);
      expect(daughter.y - top).toBeGreaterThanOrEqual(-1e-7);
      expect(daughter.y + bottom).toBeLessThanOrEqual(800 + 1e-7);
      const restored = (engine as any).sampleNormalContour(daughter);
      const extentX = Math.max(...restored.map((point: { x: number }) => Math.abs(point.x)));
      const extentY = Math.max(...restored.map((point: { y: number }) => Math.abs(point.y)));
      expect(Math.abs(extentX / extentY - 1)).toBeGreaterThan(0.075);
    }
  });

  it('stages seven-second apoptosis with staggered blebs and late-only fading', () => {
    const engine = makeEngine(9);
    const cell = createCell(engine, 48);
    (engine as any).cells = [cell];
    engine.triggerApoptosis(cell);

    expect(cell.blebs!.length).toBeGreaterThanOrEqual(4);
    expect(cell.blebs!.length).toBeLessThanOrEqual(6);
    expect(new Set(cell.blebs!.map((bleb) => bleb.onset)).size).toBe(cell.blebs!.length);
    expect(cell.blebs!.some((bleb) => bleb.releases)).toBe(true);
    expect(cell.blebs!.some((bleb) => !bleb.releases)).toBe(true);
    const releaseTimes = cell.blebs!.filter((bleb) => bleb.releases).map((bleb) => bleb.detachAt);
    expect(Math.min(...releaseTimes)).toBeLessThan(0.58);
    expect(Math.max(...releaseTimes)).toBeGreaterThan(0.80);
    expect(Math.max(...releaseTimes)).toBeLessThanOrEqual(0.86);

    update(engine, APOPTOSIS_SECONDS * 0.7);
    expect(cell.life).toBe(1);
    expect((engine as any).apoptoticBodies.length).toBeGreaterThan(0);

    update(engine, APOPTOSIS_SECONDS * 0.13);
    expect(cell.life).toBe(1);
    update(engine, APOPTOSIS_SECONDS * 0.03);
    expect(cell.life).toBeLessThan(1);
    expect((engine as any).debugSnapshot().particles).toBe(0);

    update(engine, APOPTOSIS_SECONDS * 0.2);
    expect((engine as any).cells).toHaveLength(0);
    expect((engine as any).debugSnapshot().particles).toBe(0);
  });

  it('retracts transient blebs and narrows releasing blebs before detachment', () => {
    const engine = makeEngine(14);
    const cell = createCell(engine, 50);
    (engine as any).cells = [cell];
    engine.triggerApoptosis(cell);
    const transient = cell.blebs!.find((bleb) => !bleb.releases)!;
    const lastRelease = cell
      .blebs!.filter((bleb) => bleb.releases)
      .sort((a, b) => b.detachAt - a.detachAt)[0];

    (engine as any).updateBlebs(cell, transient.peakAt, 0);
    expect(transient.radius).toBeCloseTo(transient.maxRadius, 8);
    (engine as any).updateBlebs(cell, transient.retractAt, 0);
    expect(transient.radius).toBeCloseTo(0, 8);
    expect(transient.independent).toBe(false);

    (engine as any).updateBlebs(cell, lastRelease.detachAt - 0.035, 0);
    expect(lastRelease.neck).toBeGreaterThan(0);
    expect(lastRelease.neck).toBeLessThan(1);
    expect(lastRelease.independent).toBe(false);
    (engine as any).updateBlebs(cell, lastRelease.detachAt, 0);
    expect(lastRelease.independent).toBe(true);
    expect((engine as any).apoptoticBodies).toContain(lastRelease);
  });

  it('detaches apoptotic bodies into independent world-space trajectories', () => {
    const engine = makeEngine(18);
    const cell = createCell(engine, 50);
    (engine as any).cells = [cell];
    engine.triggerApoptosis(cell);
    cell.stateElapsed = APOPTOSIS_SECONDS * 0.72;
    (engine as any).updateLifecycle(cell, 0, STEP);
    const bodies = (engine as any).apoptoticBodies as Array<any>;
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.every((body) => body.independent && body.ownerId === cell.id)).toBe(true);
    const body = bodies[0];
    const before = { x: body.x, y: body.y };
    cell.x += 200;
    cell.y += 100;
    (engine as any).updateApoptoticBodies(0.5);
    expect(Math.hypot(body.x - before.x, body.y - before.y)).toBeGreaterThan(0);
    expect(Math.hypot(body.x - cell.x, body.y - cell.y)).toBeGreaterThan(50);
  });

  it('gives apoptotic bodies soft, low-restitution contacts and viewport bounds', () => {
    const engine = makeEngine(22);
    const cell = createCell(engine, 50);
    Object.assign(cell, { x: 300, y: 300, vx: 0, vy: 0 });
    const template = {
      ownerId: 'removed-parent',
      angle: 0,
      dist: 1,
      radius: 6,
      maxRadius: 6,
      growthSpeed: 1,
      detached: true,
      alpha: 1,
      onset: 0,
      detachAt: 0.5,
      peakAt: 0.3,
      retractAt: 0.5,
      releases: true,
      neck: 1,
      carriesFragment: false,
      drift: 0.1,
      previousX: 0,
      previousY: 0,
      independent: true,
      age: 0,
      lifetime: 4,
    };
    const cellBody = { ...template, x: 340, y: 300, vx: -8, vy: 0 };
    const edgeBody = { ...template, x: 2, y: 100, vx: -8, vy: 0 };
    const firstBody = { ...template, x: 100, y: 200, vx: 5, vy: 0 };
    const secondBody = { ...template, x: 108, y: 200, vx: -5, vy: 0 };
    Object.assign(engine as any, {
      cells: [cell],
      apoptoticBodies: [cellBody, edgeBody, firstBody, secondBody],
    });

    (engine as any).resolveApoptoticBodyContacts(STEP);
    expect(cellBody.x).toBeGreaterThan(340);
    expect(cellBody.vx).toBeGreaterThan(0);
    expect(edgeBody.x).toBeGreaterThan(2);
    expect(edgeBody.vx).toBeGreaterThan(0);
    expect(Math.hypot(secondBody.x - firstBody.x, secondBody.y - firstBody.y)).toBeGreaterThan(
      11.8
    );
    expect(secondBody.vx - firstBody.vx).toBeGreaterThan(-10);
  });

  it('resolves shape-aware soft contacts without an energetic bounce', () => {
    const engine = makeEngine(21);
    const first = createCell(engine, 50);
    const second = createCell(engine, 50);
    Object.assign(first, { x: 300, y: 300, vx: 8, vy: 0 });
    Object.assign(second, { x: 370, y: 300, vx: -8, vy: 0 });
    (engine as any).cells = [first, second];
    const momentumBefore = first.radius ** 3 * first.vx + second.radius ** 3 * second.vx;

    (engine as any).resolveCollisions(STEP);
    const momentumAfter = first.radius ** 3 * first.vx + second.radius ** 3 * second.vx;
    expect(momentumAfter).toBeCloseTo(momentumBefore, 5);
    expect(second.vx - first.vx).toBeGreaterThan(-16);
    expect(first.contactCount).toBe(1);
    expect(second.contactCount).toBe(1);

    update(engine, 0.5);
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const distance = Math.hypot(dx, dy);
    const nx = dx / distance;
    const ny = dy / distance;
    const firstContour = (engine as any).collisionContour(first);
    const secondContour = (engine as any).collisionContour(second);
    const penetration =
      (engine as any).supportFromContour(firstContour, nx, ny) +
      (engine as any).supportFromContour(secondContour, -nx, -ny) -
      distance;
    expect(penetration).toBeLessThanOrEqual(0.75);
  });

  it('starts explicit divisions immediately and allows selected cells to divide concurrently', () => {
    const engine = makeEngine();
    (engine as any).quietRemaining = 0;
    (engine as any).seed();
    const cells = (engine as any).cells as LivingCell[];
    for (const cell of cells) cell.matureElapsed = 20;
    (engine as any).queueDivision(cells[0]);
    (engine as any).queueDivision(cells[1]);

    expect(cells.filter((cell) => cell.state === 'mitosis')).toHaveLength(2);
    expect((engine as any).projectedCount()).toBe(10);
    expect((engine as any).divisionQueue).toHaveLength(0);
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
    for (let seed = 1; seed <= 3; seed++) {
      const engine = makeEngine(seed);
      Object.assign(engine as any, { quietRemaining: 0, turnoverRemaining: 1 });
      (engine as any).seed();
      let minimum = Number.POSITIVE_INFINITY;
      let maximum = 0;
      for (let frame = 0; frame < 60 * 90; frame++) {
        (engine as any).update(STEP);
        const projected = (engine as any).projectedCount() as number;
        minimum = Math.min(minimum, projected);
        maximum = Math.max(maximum, projected);
        const active = ((engine as any).cells as LivingCell[]).filter(
          (cell) => cell.state === 'mitosis' || cell.state === 'apoptosis'
        ).length;
        expect(active).toBeLessThanOrEqual(2);
      }
      expect(minimum).toBeGreaterThanOrEqual(7);
      expect(maximum).toBeLessThanOrEqual(9);
      expect((engine as any).debugSnapshot().particles).toBe(0);
    }
  }, 30_000);

  it('uses recovered growing cells for persistent excess while protecting the selected lineage', () => {
    const engine = makeEngine(27);
    const cells = Array.from({ length: 10 }, (_, index) => {
      const cell = createCell(engine, 50, 30);
      Object.assign(cell, { x: 100, age: 20 + index, lifecycleSource: 'user' });
      return cell;
    });
    Object.assign(engine as any, {
      cells,
      targetCount: 8,
      inputQuietRemaining: 0,
      rebalanceCooldown: 0,
      selectedCellId: cells[9].id,
    });

    (engine as any).updateHomeostasis();
    expect(cells[9].state).toBe('growing');
    expect(cells[8].state).toBe('apoptosis');
    expect(cells[8].lifecycleSource).toBe('automatic');
  });

  it('serializes automatic division through postmitotic recovery without blocking explicit actions', () => {
    const engine = makeEngine(28);
    const recovering = createCell(engine, 50, 38);
    Object.assign(recovering, {
      state: 'postmitotic',
      postmitoticProgress: 0.5,
      lifecycleSource: 'automatic',
    });
    const mature = createCell(engine, 50);
    mature.matureElapsed = 20;
    Object.assign(engine as any, {
      cells: [recovering, mature],
      targetCount: 8,
      inputQuietRemaining: 0,
      rebalanceCooldown: 0,
    });

    (engine as any).updateHomeostasis();
    expect(mature.state).toBe('mature');
    recovering.state = 'growing';
    recovering.postmitoticProgress = undefined;
    (engine as any).updateHomeostasis();
    expect(mature.state).toBe('mitosis');

    const explicit = createCell(engine, 50, 30);
    (engine as any).queueDivision(explicit);
    expect(explicit.state).toBe('mitosis');
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

  it('supports postmitotic debug jumps and exposes v2 audit metrics', () => {
    const engine = makeEngine();
    const cell = createCell(engine);
    (engine as any).cells = [cell];
    expect((engine as any).debugSetState(cell.id, 'postmitotic', 0.5)).toBe(true);
    expect(cell.state).toBe('postmitotic');
    expect(cell.postmitoticProgress).toBe(0.5);
    const snapshot = (engine as any).debugSnapshot();
    expect(snapshot.mode).toBe('ambient');
    expect(snapshot.labAction).toBe('divide');
    expect(snapshot.timings).toEqual(
      expect.objectContaining({ updateP50: expect.any(Number), renderP95: expect.any(Number) })
    );
    expect(snapshot.cells[0]).toEqual(
      expect.objectContaining({
        phase: 'recovery',
        aspect: expect.any(Number),
        contourArea: expect.any(Number),
        targetArea: expect.any(Number),
        organelleCount: expect.any(Number),
      })
    );
  });

  it('reports biological phases at diagnostics milestones', () => {
    const engine = makeEngine();
    const cell = createCell(engine);
    (engine as any).cells = [cell];
    const mitosis = [
      [0.05, 'rounding'],
      [0.12, 'prometaphase'],
      [0.28, 'metaphase'],
      [0.48, 'anaphase'],
      [0.68, 'telophase'],
      [0.82, 'cytokinesis'],
      [0.95, 'abscission'],
    ] as const;
    for (const [progress, phase] of mitosis) {
      expect((engine as any).debugSetState(cell.id, 'mitosis', progress)).toBe(true);
      expect((engine as any).debugSnapshot().cells[0].phase).toBe(phase);
    }
    const apoptosis = [
      [0.05, 'condensation'],
      [0.2, 'blebbing'],
      [0.45, 'fragmentation'],
      [0.68, 'apoptotic-bodies'],
      [0.86, 'clearance'],
    ] as const;
    for (const [progress, phase] of apoptosis) {
      expect((engine as any).debugSetState(cell.id, 'apoptosis', progress)).toBe(true);
      expect((engine as any).debugSnapshot().cells[0].phase).toBe(phase);
    }
  });

  it('provides idempotent mode and lab-action controls', () => {
    const engine = makeEngine();
    expect(engine.getMode()).toBe('ambient');
    engine.setMode('lab');
    engine.setMode('lab');
    expect(engine.getMode()).toBe('lab');
    expect(engine.getLabAction()).toBe('divide');
    engine.setLabAction('apoptosis');
    engine.setLabAction('apoptosis');
    expect(engine.getLabAction()).toBe('apoptosis');
    engine.setMode('off');
    expect(engine.getMode()).toBe('off');
    engine.setMode('ambient');
    expect(engine.getMode()).toBe('ambient');
  });

  it('manages hyperparameter controls, presets, direct actions, and telemetry', () => {
    const engine = makeEngine();
    (engine as any).cells = [createCell(engine, 50), createCell(engine, 50)];

    const params = engine.getParams();
    expect(params.growthMultiplier).toBe(1.0);
    expect(params.timeScale).toBe(1.0);
    expect(params.isPaused).toBe(false);

    engine.setParams({ growthMultiplier: 2.5, timeScale: 1.5, isPaused: true });
    expect(engine.getParams().growthMultiplier).toBe(2.5);
    expect(engine.getParams().timeScale).toBe(1.5);
    expect(engine.getParams().isPaused).toBe(true);

    const spawned = engine.spawnRandomCell(400, 300);
    expect(spawned.x).toBe(400);
    expect(spawned.y).toBe(300);

    const telemetry = engine.getTelemetry();
    expect(telemetry.total).toBe(3);
    expect(telemetry.interphase).toBe(3);
    expect(telemetry.births).toBeGreaterThanOrEqual(1);

    expect(engine.triggerRandomMitosis()).toBe(true);
    expect(engine.getTelemetry().mitosis).toBe(1);

    engine.resetParams();
    expect(engine.getParams().growthMultiplier).toBe(1.0);
    expect(engine.getParams().isPaused).toBe(false);

    engine.clearAllCells();
    expect(engine.getTelemetry().total).toBe(0);
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

    const contour = (engine as any).collisionContour(cell);
    const rightSupport = (engine as any).supportFromContour(contour, 1, 0);
    const topSupport = (engine as any).supportFromContour(contour, 0, -1);
    expect(cell.x).toBeCloseTo(1_200 - rightSupport, 8);
    expect(cell.y).toBeCloseTo(topSupport, 8);
    expect(cell.x + rightSupport).toBeLessThanOrEqual(1_200);
    expect(cell.y - topSupport).toBeGreaterThanOrEqual(0);
    expect(cell.previousX).toBe(cell.x);
    expect(cell.previousY).toBe(cell.y);
    expect(cell.isGrabbed).toBe(false);
    expect(cell.targetDragPos).toBeUndefined();
    expect((engine as any).grabbedCell).toBeNull();
  });

  it('uses throttled fine-pointer contour proximity and clears hover for protected or calm states', () => {
    const engine = makeEngine(31);
    const near = createCell(engine, 50);
    const far = createCell(engine, 50);
    Object.assign(near, { x: 300, y: 260 });
    Object.assign(far, { x: 430, y: 260 });
    Object.assign(engine as any, {
      attached: true,
      cells: [near, far],
      coarse: false,
      reducedMotion: false,
      lastHoverTime: Number.NEGATIVE_INFINITY,
    });
    const before = near.vertices.map((vertex) => vertex.velocity);

    (engine as any).updateHover({
      clientX: 351,
      clientY: 260,
      pointerType: 'mouse',
      target: null,
      timeStamp: 100,
    });
    expect((engine as any).hoveredCell).toBe(near);
    expect(near.vertices.some((vertex, index) => vertex.velocity !== before[index])).toBe(true);

    (engine as any).updateHover({
      clientX: 351,
      clientY: 260,
      pointerType: 'mouse',
      target: {
        closest: (selector: string) => {
          expect(selector).toContain('h1');
          expect(selector).toContain('table');
          expect(selector).toContain('details');
          return {};
        },
      },
      timeStamp: 200,
    });
    expect((engine as any).hoveredCell).toBeNull();
    (engine as any).coarse = true;
    (engine as any).lastHoverTime = Number.NEGATIVE_INFINITY;
    (engine as any).updateHover({
      clientX: 351,
      clientY: 260,
      pointerType: 'mouse',
      target: null,
      timeStamp: 300,
    });
    expect((engine as any).hoveredCell).toBeNull();
  });

  it('caps scroll rendering and degrades anatomy for scroll and profile overflow', () => {
    const engine = makeEngine(32);
    Object.assign(engine as any, {
      coarse: false,
      isHomepage: false,
      detailLevel: 'full',
      scrollActivityRemaining: 0.5,
    });
    expect((engine as any).currentRenderInterval()).toBe(42);
    expect((engine as any).effectiveDetailLevel()).toBe('full');

    (engine as any).coarse = true;
    expect((engine as any).currentRenderInterval()).toBe(67);
    expect((engine as any).effectiveDetailLevel()).toBe('reduced');

    Object.assign(engine as any, {
      coarse: false,
      scrollActivityRemaining: 0,
      cells: Array.from({ length: 10 }, () => createCell(engine)),
    });
    expect((engine as any).effectiveDetailLevel()).toBe('reduced');
    (engine as any).cells.push(createCell(engine), createCell(engine), createCell(engine));
    expect((engine as any).effectiveDetailLevel()).toBe('minimal');

    Object.assign(engine as any, {
      coarse: false,
      isHomepage: true,
      scrollActivityRemaining: 0,
      cells: Array.from({ length: 6 }, () => createCell(engine)),
    });
    expect((engine as any).effectiveDetailLevel()).toBe('full');
    expect((engine as any).currentRenderInterval()).toBe(50);
    (engine as any).scrollActivityRemaining = 0.5;
    expect((engine as any).currentRenderInterval()).toBe(50);
    expect((engine as any).effectiveDetailLevel()).toBe('full');

    Object.assign(engine as any, {
      coarse: true,
      scrollActivityRemaining: 0,
    });
    expect((engine as any).currentRenderInterval()).toBe(50);
    (engine as any).scrollActivityRemaining = 0.5;
    expect((engine as any).currentRenderInterval()).toBe(67);
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

  it('spawns a new growing cell when clicking on empty space in lab mode', () => {
    const engine = makeEngine();
    Object.assign(engine as any, { cells: [], attached: true, width: 800, height: 600, mode: 'lab' });

    (engine as any).onPointerDown({
      clientX: 250,
      clientY: 300,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      isPrimary: true,
      target: null,
    });
    expect((engine as any).pointer.down).toBe(true);
    expect((engine as any).pointerCandidate).toBeNull();

    (engine as any).onPointerUp({
      clientX: 250,
      clientY: 300,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      isPrimary: true,
      target: null,
    });
    expect((engine as any).cells).toHaveLength(1);
    const spawned = (engine as any).cells[0];
    expect(spawned.x).toBe(250);
    expect(spawned.y).toBe(300);
    expect(spawned.state).toBe('growing');
    expect(spawned.birthRadius).toBeLessThan(spawned.targetRadius);

    // In ambient mode, empty clicks do not spawn cells
    (engine as any).mode = 'ambient';
    (engine as any).cells = [];
    (engine as any).onPointerDown({
      clientX: 400,
      clientY: 400,
      pointerId: 2,
      pointerType: 'mouse',
      button: 0,
      isPrimary: true,
      target: null,
    });
    (engine as any).onPointerUp({
      clientX: 400,
      clientY: 400,
      pointerId: 2,
      pointerType: 'mouse',
      button: 0,
      isPrimary: true,
      target: null,
    });
    expect((engine as any).cells).toHaveLength(0);
  });

  it('locks to full detail and 1.0 alpha in lab mode while ambient uses 0.6 alpha', () => {
    const engine = makeEngine();
    Object.assign(engine as any, { cells: Array.from({ length: 25 }, () => createCell(engine, 40, 40)) });

    engine.setMode('lab');
    expect((engine as any).effectiveDetailLevel()).toBe('full');
    expect((engine as any).effectiveAlpha()).toBe(1.0);

    engine.setMode('ambient');
    expect((engine as any).effectiveAlpha()).toBe(0.6);
    // On ambient with 25 cells (population > limit + 10), detail level gracefully degrades to minimal
    expect((engine as any).effectiveDetailLevel()).toBe('minimal');
  });

  it('allows direct canvas pointer interaction and click mitosis in lab mode', () => {
    const engine = makeEngine();
    const canvas = {
      tagName: 'CANVAS',
      id: 'lab-canvas',
      hasAttribute: (attr: string) => attr === 'id' || attr === 'data-site-bg-canvas',
      closest: () => null,
    } as unknown as HTMLCanvasElement;
    expect((engine as any).interactiveTarget(canvas)).toBe(false);

    engine.setMode('lab');
    const cell = createCell(engine, 100, 100);
    Object.assign(cell, { state: 'mature', x: 100, y: 100, radius: 40 });
    Object.assign(engine as any, { cells: [cell], attached: true, canvas });

    // Pointer down on cell
    (engine as any).onPointerDown({
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      isPrimary: true,
      target: canvas,
    });
    expect((engine as any).pointerCandidate).toBe(cell);

    // Pointer up without moving -> queues division (mitosis)
    (engine as any).onPointerUp({
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      isPrimary: true,
      target: canvas,
    });
    expect(cell.state).toBe('mitosis');
  });

  it('accelerates apoptosis clearance when ambient mode is overcrowded', () => {
    const engine = makeEngine(12);
    const cells = Array.from({ length: 20 }, (_, i) => {
      const cell = createCell(engine, 50, 30);
      Object.assign(cell, { age: 30 + i });
      return cell;
    });
    Object.assign(engine as any, {
      cells,
      targetCount: 6,
      baseCount: 6,
      mode: 'ambient',
      inputQuietRemaining: 0,
      rebalanceCooldown: 0,
    });

    (engine as any).updateHomeostasis();
    const apoptotic = cells.filter((c) => c.state === 'apoptosis');
    expect(apoptotic.length).toBeGreaterThanOrEqual(1);
    expect((engine as any).rebalanceCooldown).toBeLessThan(1.5);
  });

  it('persists and restores cell state across mode transitions without count inflation', () => {
    const engine = makeEngine(99);
    Object.assign(engine as any, { width: 800, height: 600 });
    (engine as any).seed();
    const initialCellCount = (engine as any).cells.length;
    expect(initialCellCount).toBeGreaterThan(0);

    engine.setMode('lab');
    expect((engine as any).cells.length).toBe(initialCellCount);

    // Simulate 2 cells dying during ambient idle
    engine.setMode('ambient');
    (engine as any).cells.splice(0, 2);
    const reducedCount = (engine as any).cells.length;
    expect(reducedCount).toBe(initialCellCount - 2);

    // Transition back to lab: must retain the exact reduced count
    engine.setMode('lab');
    expect((engine as any).cells.length).toBe(reducedCount);
  });

  it('supports touch tap-to-divide in ambient mode while touch drag is supported in lab mode', () => {
    const engine = makeEngine();
    const canvas = {
      tagName: 'CANVAS',
      id: 'lab-canvas',
      hasAttribute: (attr: string) => attr === 'id' || attr === 'data-site-bg-canvas',
      closest: () => null,
    } as unknown as HTMLCanvasElement;

    // Ambient mode touch tap
    engine.setMode('ambient');
    const cell1 = createCell(engine, 100, 100);
    Object.assign(cell1, { state: 'mature', x: 100, y: 100, radius: 40 });
    Object.assign(engine as any, { cells: [cell1], attached: true, canvas });

    (engine as any).onPointerDown({
      clientX: 100,
      clientY: 100,
      pointerId: 5,
      pointerType: 'touch',
      button: 0,
      isPrimary: true,
      target: canvas,
    });
    expect((engine as any).pointerCandidate).toBe(cell1);

    (engine as any).onPointerUp({
      clientX: 100,
      clientY: 100,
      pointerId: 5,
      pointerType: 'touch',
      button: 0,
      isPrimary: true,
      target: canvas,
    });
    expect(cell1.state).toBe('mitosis');

    // Lab mode touch drag
    engine.setMode('lab');
    const cell2 = createCell(engine, 200, 200);
    Object.assign(cell2, { state: 'mature', x: 200, y: 200, radius: 40 });
    Object.assign(engine as any, { cells: [cell2], attached: true, canvas });

    (engine as any).onPointerDown({
      clientX: 200,
      clientY: 200,
      pointerId: 6,
      pointerType: 'touch',
      button: 0,
      isPrimary: true,
      target: canvas,
    });
    (engine as any).onPointerMove({
      clientX: 250,
      clientY: 250,
      pointerId: 6,
      pointerType: 'touch',
      isPrimary: true,
      target: canvas,
    });
    expect((engine as any).grabbedCell).toBe(cell2);
  });

  it('initializes ambient mode with 12 cells equilibrium on desktop and 8 on coarse mobile', () => {
    const desktopEngine = new LivingCellsEngine();
    Object.assign(desktopEngine as any, { coarse: false, isHomepage: false });
    desktopEngine.setMode('ambient');
    expect((desktopEngine as any).targetCount).toBe(12);

    const mobileEngine = new LivingCellsEngine();
    Object.assign(mobileEngine as any, { coarse: true, isHomepage: false });
    mobileEngine.setMode('ambient');
    expect((mobileEngine as any).targetCount).toBe(8);

    const desktopHomepage = new LivingCellsEngine();
    Object.assign(desktopHomepage as any, { coarse: false, isHomepage: true });
    desktopHomepage.setMode('ambient');
    expect((desktopHomepage as any).targetCount).toBe(6);

    const homepageMobile = new LivingCellsEngine();
    Object.assign(homepageMobile as any, { coarse: true, isHomepage: true });
    homepageMobile.setMode('ambient');
    expect((homepageMobile as any).targetCount).toBe(4);
  });

  it('supports scaling cell population up to 300 in lab mode with always-full detail', () => {
    const engine = makeEngine();
    engine.setMode('lab');
    engine.setParams({ targetPopulation: 300 });
    expect(engine.getParams().targetPopulation).toBe(300);
    expect((engine as any).targetCount).toBe(300);

    // Lab mode always renders full organelle detail regardless of population
    (engine as any).cells = Array.from({ length: 250 }, () => createCell(engine, 30));
    expect((engine as any).effectiveDetailLevel()).toBe('full');

    (engine as any).cells = Array.from({ length: 80 }, () => createCell(engine, 30));
    expect((engine as any).effectiveDetailLevel()).toBe('full');

    (engine as any).cells = Array.from({ length: 20 }, () => createCell(engine, 30));
    expect((engine as any).effectiveDetailLevel()).toBe('full');
  });

  it('smoothly reduces population back to ~12 cells equilibrium via accelerated apoptosis clearance waves when returning to ambient', () => {
    const engine = makeEngine();
    engine.setMode('lab');
    (engine as any).cells = Array.from({ length: 60 }, () => createCell(engine, 35));
    expect((engine as any).cells.length).toBe(60);

    // Switch back to ambient mode
    engine.setMode('ambient');
    expect((engine as any).targetCount).toBe(12);

    // Run homeostasis step: excess is 60 - 12 = 48
    (engine as any).rebalanceCooldown = 0;
    (engine as any).inputQuietRemaining = 0;
    (engine as any).updateHomeostasis();

    const apoptoticCount = (engine as any).cells.filter((c: LivingCell) => c.state === 'apoptosis').length;
    expect(apoptoticCount).toBeGreaterThanOrEqual(1);

    // Rapid successive clearance without hanging
    for (let frame = 0; frame < 180; frame++) {
      (engine as any).update(STEP * 2);
    }
    expect((engine as any).cells.length).toBeLessThan(60);
  });

  it('supports dispensing nutrient droplets and attracts cells via chemotaxis', () => {
    const engine = makeEngine();
    engine.setMode('lab');
    const cell = createCell(engine, 40);
    Object.assign(cell, { x: 200, y: 200, vx: 0, vy: 0, state: 'mature' });
    (engine as any).cells = [cell];

    engine.dispenseNutrient(260, 200, 2);
    expect(engine.getNutrients().length).toBe(2);

    (engine as any).update(0.5);
    // Cell should have moved or accelerated toward nutrient
    expect(cell.vx).toBeGreaterThan(0);
  });

  it('applies repulsive force from optical laser tweezers and microfluidic vortex', () => {
    const engine = makeEngine();
    engine.setMode('lab');
    const cell = createCell(engine, 40);
    Object.assign(cell, { x: 300, y: 300, vx: 0, vy: 0 });
    (engine as any).cells = [cell];

    // Laser repulsion
    engine.setLaser(true, 280, 300, 300, 100);
    (engine as any).update(0.2);
    expect(cell.vx).toBeGreaterThan(0);

    // Microfluidic vortex
    engine.setLaser(false, 0, 0);
    engine.applyVortex(300, 300, 200, 200);
    (engine as any).update(0.2);
    expect(Math.hypot(cell.vx, cell.vy)).toBeGreaterThan(0);
  });

  it('triggers mutagen pulses and activates epifluorescent staining modes', () => {
    const engine = makeEngine();
    engine.setMode('lab');
    const matureCell = createCell(engine, 45);
    Object.assign(matureCell, { x: 250, y: 250, state: 'mature', matureElapsed: 12 });
    (engine as any).cells = [matureCell];

    engine.triggerMutagenPulse(250, 250);
    expect(matureCell.state).toBe('mitosis');

    for (const mode of ['phase', 'gfp', 'dapi', 'mcherry', 'lineage'] as const) {
      engine.setStainingMode(mode);
      expect(engine.getStainingMode()).toBe(mode);
    }
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

function polygonArea(points: Array<{ x: number; y: number }>): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length];
    twiceArea += points[index].x * next.y - next.x * points[index].y;
  }
  return Math.abs(twiceArea) / 2;
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
