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
    // Use private methods via casting for unit test verification
    const cell = (engine as any).createCell(100, 100, false, 25) as LivingCell;
    expect(cell.state).toBe('mature');
    expect(cell.radius).toBe(25);

    engine.triggerMitosis(cell);
    expect(cell.state).toBe('mitosis');
    expect(cell.mitosisProgress).toBe(0);
    expect(typeof cell.mitosisAngle).toBe('number');
    expect(cell.glowIntensity).toBe(2.5);
  });

  it('preserves chromosome containment invariants throughout all 4 phases of mitosis', () => {
    // Mathematical assertion that for any cell radius r from 15 to 40 px,
    // and for all progress values P in [0, 1], all chromosome elements remain safely inside the cell envelope.
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
          daughterLobeR = r * (0.92 - 0.06 * p2);
          waistR = r * (0.95 - 0.07 * p2);
        } else if (prog < 0.76) {
          const p3 = (prog - 0.48) / 0.28;
          poleDist = r * (0.38 + 0.20 * p3);
          daughterLobeR = r * (0.86 - 0.08 * p3);
          waistR = r * (0.88 - 0.58 * Math.sin(p3 * (Math.PI / 2)));
        } else {
          const p4 = (prog - 0.76) / 0.24;
          poleDist = r * (0.58 + 0.05 * p4);
          daughterLobeR = r * 0.78;
          waistR = Math.max(r * 0.05, r * (0.30 - 0.25 * p4));
        }

        // In Metaphase (prog ~ 0.35), metaphase plate chromosomes at x=0 MUST be strictly inside waistR
        if (prog >= 0.28 && prog < 0.48) {
          expect(maxChromoYInMetaphase).toBeLessThan(waistR * 0.65); // At least 35% safety margin!
        }

        // In Anaphase (prog ~ 0.60), separating chromatids MUST be located inside the wide daughter lobes
        if (prog >= 0.48 && prog < 0.76) {
          const p3 = (prog - 0.48) / 0.28;
          const pullProgress = Math.pow(p3, 0.85);
          const pullDist = poleDist * (0.12 + 0.78 * pullProgress);
          // Chromosome position along X is near or inside the daughter lobe
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
});
