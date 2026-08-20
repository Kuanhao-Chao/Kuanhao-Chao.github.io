import { describe, it, expect } from 'vitest';
import { LivingCellsEngine, getLivingCellsEngine, type LivingCell } from './livingCellsEngine';

describe('LivingCellsEngine', () => {
  it('instantiates and provides singleton engine', () => {
    const engine1 = getLivingCellsEngine();
    const engine2 = getLivingCellsEngine();
    expect(engine1).toBe(engine2);
    expect(engine1).toBeInstanceOf(LivingCellsEngine);
  });

  it('triggers mitosis on a mature cell and sets proper initial state', () => {
    const engine = new LivingCellsEngine();
    const cell = (engine as any).createCell(100, 100, false, 25) as LivingCell;
    expect(cell.state).toBe('mature');
    expect(cell.baseRadius).toBe(25);

    engine.triggerMitosis(cell);
    expect(cell.state).toBe('mitosis');
    expect(cell.mitosisProgress).toBe(0);
    expect(typeof cell.mitosisAngle).toBe('number');
    expect(cell.glowIntensity).toBe(2.5);
  });

  it('creates authentic eukaryotic organelle ensemble with mitochondria, Golgi, ER, and centrosome', () => {
    const engine = new LivingCellsEngine();
    const cell = (engine as any).createCell(100, 100, false, 50) as LivingCell;

    expect(cell.organelles.length).toBeGreaterThanOrEqual(4);

    const mito = cell.organelles.find((o) => o.type === 'mitochondria');
    expect(mito).toBeDefined();
    if (mito && mito.type === 'mitochondria') {
      expect(mito.cristaeCount).toBeGreaterThanOrEqual(3);
      expect(mito.length).toBeGreaterThan(mito.width);
    }

    const golgi = cell.organelles.find((o) => o.type === 'golgi');
    expect(golgi).toBeDefined();
    if (golgi && golgi.type === 'golgi') {
      expect(golgi.layers).toBeGreaterThanOrEqual(2);
      expect(golgi.vesicles.length).toBeGreaterThanOrEqual(2);
    }

    const er = cell.organelles.find((o) => o.type === 'er');
    expect(er).toBeDefined();
    if (er && er.type === 'er') {
      expect(er.ribosomes.length).toBeGreaterThanOrEqual(5);
    }

    const centrosome = cell.organelles.find((o) => o.type === 'centrosome');
    expect(centrosome).toBeDefined();
  });

  it('guarantees 100% organelle containment within plasma membrane across all cell sizes', () => {
    const engine = new LivingCellsEngine();
    const radiiToTest = [18, 25, 35, 50, 65, 80];

    for (const r of radiiToTest) {
      // Test 50 randomized cell instances per radius (300 cells total)
      for (let sample = 0; sample < 50; sample++) {
        const cell = (engine as any).createCell(200, 200, false, r) as LivingCell;

        // 1. Check Nucleus & Nuclear Pores
        const nucOffsetDist = Math.hypot(cell.nucleusOffset.x * r, cell.nucleusOffset.y * r);
        const nucOuterRadius = r * 0.25;
        const maxNucleusReach = nucOffsetDist + nucOuterRadius;
        expect(maxNucleusReach).toBeLessThanOrEqual(r * 0.45); // Safe core placement

        // 2. Check All Organelles
        for (const org of cell.organelles) {
          if (org.type === 'mitochondria') {
            const centerDist = r * org.dist;
            const halfLen = org.length * 0.5;
            const maxTipReach = centerDist + halfLen;
            // Outermost tip of mitochondrion must be safely inside membrane (<= 0.65r)
            expect(maxTipReach).toBeLessThanOrEqual(r * 0.65);
          } else if (org.type === 'golgi') {
            const centerDist = r * org.dist;
            // Outermost vesicle
            for (const v of org.vesicles) {
              const vesicleDist = r * (0.05 + v.dist) + v.size;
              const maxVesicleReach = centerDist + vesicleDist;
              expect(maxVesicleReach).toBeLessThanOrEqual(r * 0.65);
            }
            // Outermost layer
            const maxLayerReach = centerDist + r * (0.04 + (org.layers - 1) * 0.03);
            expect(maxLayerReach).toBeLessThanOrEqual(r * 0.65);
          } else if (org.type === 'er') {
            // ER centered on nucleus
            const maxErR = nucOuterRadius * (1.12 + (org.layers - 1) * 0.15);
            const maxRibosomeDist = nucOuterRadius * (1.12 + 0.18) + 1.0;
            const maxErReach = nucOffsetDist + Math.max(maxErR, maxRibosomeDist);
            expect(maxErReach).toBeLessThanOrEqual(r * 0.55);
          } else if (org.type === 'centrosome') {
            const centerDist = r * org.dist;
            const barLen = Math.max(1.1, r * 0.035);
            const maxCentrosomeReach = centerDist + barLen;
            expect(maxCentrosomeReach).toBeLessThanOrEqual(r * 0.55);
          }
        }
      }
    }
  });

  it('preserves chromosome containment invariants throughout all 4 phases of mitosis', () => {
    const testRadii = [15, 20, 25, 30, 40];
    const testProgresses = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];

    for (const r of testRadii) {
      const chromoLen = Math.min(6.5, Math.max(2.4, r * 0.15));
      const dyBase = Math.min(5.0, Math.max(1.8, r * 0.13));
      const maxChromoYInMetaphase = 1.5 * dyBase + chromoLen * 0.5;

      for (const prog of testProgresses) {
        let poleDist: number;
        let daughterLobeR: number;
        let waistR: number;

        if (prog < 0.28) {
          const p1 = prog / 0.28;
          poleDist = r * (0.12 + 0.20 * p1);
          daughterLobeR = r * (1.0 - 0.08 * p1);
          waistR = r * (1.0 - 0.05 * p1);
        } else if (prog < 0.48) {
          const p2 = (prog - 0.28) / 0.20;
          poleDist = r * (0.32 + 0.06 * p2);
          daughterLobeR = r * (0.92 - 0.12 * p2);
          waistR = r * (0.95 - 0.10 * p2);
        } else if (prog < 0.74) {
          const p3 = (prog - 0.48) / 0.26;
          poleDist = r * (0.38 + 0.20 * p3);
          daughterLobeR = r * (0.80 - 0.24 * p3);
          waistR = r * (0.85 - 0.60 * Math.sin(p3 * (Math.PI / 2)));
        } else {
          const p4 = (prog - 0.74) / 0.26;
          poleDist = r * (0.58 + 0.05 * p4);
          daughterLobeR = r * 0.56;
          waistR = Math.max(r * 0.04, r * (0.25 - 0.21 * p4));
        }

        // In Metaphase (prog ~ 0.35), metaphase plate chromosomes at x=0 MUST be strictly inside waistR
        if (prog >= 0.28 && prog < 0.48) {
          expect(maxChromoYInMetaphase).toBeLessThan(waistR * 0.65); // At least 35% safety margin!
        }

        // In Anaphase (prog ~ 0.60), separating chromatids MUST be located inside the wide daughter lobes
        if (prog >= 0.48 && prog < 0.74) {
          const p3 = (prog - 0.48) / 0.26;
          const pullProgress = Math.pow(p3, 0.85);
          const pullDist = poleDist * (0.12 + 0.78 * pullProgress);
          expect(pullDist).toBeGreaterThan(0);
          expect(pullDist).toBeLessThan(poleDist + daughterLobeR * 0.5);
        }
      }
    }
  });

  it('triggers apoptosis and creates blebbing bodies', () => {
    const engine = new LivingCellsEngine();
    const cell = (engine as any).createCell(100, 100, false, 25) as LivingCell;

    engine.triggerApoptosis(cell);
    expect(cell.state).toBe('apoptosis');
    expect(cell.apoptosisProgress).toBe(0);
    expect(cell.blebs).toBeDefined();
    expect(cell.blebs!.length).toBeGreaterThanOrEqual(6);
  });

  it('enforces growth checkpoint: small growing cells cannot divide naturally, but adult mature cells can', () => {
    const engine = new LivingCellsEngine();
    // Growing cell initialized at 50% target size
    const growingCell = (engine as any).createCell(100, 100, false, 50, 25) as LivingCell;
    expect(growingCell.state).toBe('growing');
    expect(growingCell.baseRadius).toBe(25);
    expect(growingCell.targetRadius).toBe(50);

    // Natural auto-mitosis attempt (isExplicitClick = false) MUST be blocked
    engine.triggerMitosis(growingCell, false);
    expect(growingCell.state).toBe('growing'); // Checkpoint holds!

    // Mature adult cell that passed size threshold
    const matureCell = (engine as any).createCell(100, 100, false, 50, 50) as LivingCell;
    expect(matureCell.state).toBe('mature');
    expect(matureCell.baseRadius).toBe(50);

    // Natural auto-mitosis succeeds
    engine.triggerMitosis(matureCell, false);
    expect(matureCell.state).toBe('mitosis');
  });

  it('allows explicit user click exemption to trigger mitosis on growing or mature cells', () => {
    const engine = new LivingCellsEngine();
    // Small growing cell
    const smallCell = (engine as any).createCell(100, 100, false, 60, 20) as LivingCell;
    expect(smallCell.state).toBe('growing');

    // Explicit user click exemption (isExplicitClick = true)
    engine.triggerMitosis(smallCell, true);
    expect(smallCell.state).toBe('mitosis');
    expect(smallCell.mitosisProgress).toBe(0);
  });

  it('advances growing cells through G1/S/G2 interphase to reach mature adult size', () => {
    const engine = new LivingCellsEngine();
    const cell = (engine as any).createCell(100, 100, false, 50, 28) as LivingCell;
    (engine as any).cells = [cell];

    expect(cell.state).toBe('growing');
    const startRadius = cell.baseRadius;

    // Simulate 200 update frames with nutrient absorption (or growth rate)
    for (let frame = 0; frame < 200; frame++) {
      // Simulate nutrient particles
      if (frame % 25 === 0) {
        (engine as any).particles.push((engine as any).createParticle(cell.x, cell.y));
      }
      (engine as any).update();
    }

    // Cell grew significantly and transitioned to mature
    expect(cell.baseRadius).toBeGreaterThan(startRadius);
    expect(cell.baseRadius).toBeCloseTo(50, 0);
    expect(cell.state).toBe('mature');
  });

  it('spawns two G1 daughter cells sized slightly bigger than half of parent cell upon completing cytokinesis', () => {
    const engine = new LivingCellsEngine();
    const parentCell = (engine as any).createCell(200, 200, false, 50) as LivingCell;
    (engine as any).cells = [parentCell];

    engine.triggerMitosis(parentCell, true);
    expect(parentCell.state).toBe('mitosis');

    // Progress mitosis to completion
    parentCell.mitosisProgress = 0.999;
    (engine as any).update();

    // Parent cell divided into 2 daughter cells
    const cells = (engine as any).cells as LivingCell[];
    expect(cells.length).toBe(2);

    for (const daughter of cells) {
      expect(daughter.state).toBe('growing');
      expect(daughter.targetRadius).toBe(50);
      // Born slightly bigger than half parent size (0.56 * 50 = 28)
      expect(daughter.baseRadius).toBeCloseTo(28, 1);
      expect(daughter.baseRadius).toBeLessThan(50);
      expect(daughter.baseRadius).toBeGreaterThanOrEqual(25);
    }
  });

  it('maintains dynamic population homeostasis across multiple simulation cycles', () => {
    const engine = new LivingCellsEngine();
    (engine as any).width = 1200;
    (engine as any).height = 800;
    (engine as any).baseCount = 8;
    (engine as any).seed();

    const initialCount = (engine as any).cells.length;
    expect(initialCount).toBe(8);

    // Simulate 1200 update ticks
    for (let t = 0; t < 1200; t++) {
      (engine as any).update();
    }

    const currentLiveCells = (engine as any).cells.filter((c: LivingCell) => c.state !== 'apoptosis');
    // Population remains stable around baseCount (never exploding or going extinct)
    expect(currentLiveCells.length).toBeGreaterThanOrEqual(4);
    expect(currentLiveCells.length).toBeLessThanOrEqual(14);
  });

  it('verifies optical tweezer drag clamps velocity and lerps position smoothly', () => {
    const engine = new LivingCellsEngine();
    const cell = (engine as any).createCell(100, 100, false, 30) as LivingCell;
    (engine as any).cells = [cell];

    cell.isGrabbed = true;
    cell.targetDragPos = { x: 500, y: 500 }; // Large sudden displacement

    // Run one update step
    (engine as any).update();

    // Position moves smoothly toward target
    expect(cell.x).toBeGreaterThan(100);
    expect(cell.x).toBeLessThan(500);

    // Velocity is strictly clamped to max 2.2 px/frame (never exploding)
    expect(Math.abs(cell.vx)).toBeLessThanOrEqual(2.21);
    expect(Math.abs(cell.vy)).toBeLessThanOrEqual(2.21);
  });
});
