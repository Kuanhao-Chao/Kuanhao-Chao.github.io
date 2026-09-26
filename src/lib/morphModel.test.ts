import { describe, expect, it } from 'vitest';
import { cellRadius, createMorphTargets, morphPoint, storyProgress } from './morphModel';

describe('genome-to-cell particle story', () => {
  it('creates stable, finite targets for every form', () => {
    const a = createMorphTargets(300);
    const b = createMorphTargets(300);
    for (const form of ['scatter', 'dna', 'cell', 'signal'] as const) {
      expect(a[form]).toHaveLength(300);
      expect(a[form]).toEqual(b[form]);
      expect(a[form].every((p) => Number.isFinite(p.x + p.y))).toBe(true);
    }
  });
  it('lands on the DNA, cell, and signal forms without a discontinuity', () => {
    const targets = createMorphTargets(240);
    for (const index of [0, 72, 137, 239]) {
      expect(morphPoint(targets, index, 0)).toEqual(targets.dna[index]);
      expect(morphPoint(targets, index, 0.5)).toEqual(targets.cell[index]);
      expect(morphPoint(targets, index, 1)).toEqual(targets.signal[index]);
      const before = morphPoint(targets, index, 0.4999);
      const after = morphPoint(targets, index, 0.5001);
      expect(Math.hypot(before.x - after.x, before.y - after.y)).toBeLessThan(0.001);
    }
  });
  it('uses an irregular but bounded membrane and monotone scroll chapters', () => {
    const radii = Array.from({ length: 60 }, (_, i) => cellRadius((i * Math.PI) / 30));
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.1);
    expect(Math.min(...radii)).toBeGreaterThan(0.65);
    const values = [0, 250, 500, 800, 1100, 1500, 2000].map((focus) =>
      storyProgress(focus, 250, 1100, 2000)
    );
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(1);
    expect(values.every((value, i) => i === 0 || value >= values[i - 1])).toBe(true);
  });
});
