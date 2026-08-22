import { describe, expect, it } from 'vitest';
import {
  biasVarianceToy,
  binaryMetricsAtThreshold,
  quadraticDescent,
  softmaxWithTemperature,
} from './mlInterviewMath';

describe('ML interview widget mathematics', () => {
  it('computes a thresholded confusion matrix and derived rates', () => {
    const result = binaryMetricsAtThreshold(
      [
        { score: 0.9, label: 1 },
        { score: 0.7, label: 0 },
        { score: 0.4, label: 1 },
        { score: 0.1, label: 0 },
      ],
      0.5
    );
    expect(result).toMatchObject({ tp: 1, fp: 1, tn: 1, fn: 1 });
    expect(result.precision).toBeCloseTo(0.5);
    expect(result.recall).toBeCloseTo(0.5);
    expect(result.specificity).toBeCloseTo(0.5);
    expect(result.f1).toBeCloseTo(0.5);
  });

  it('defines zero-denominator rates without NaN', () => {
    const result = binaryMetricsAtThreshold([{ score: 0.2, label: 0 }], 0.9);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(Object.values(result).every(Number.isFinite)).toBe(true);
  });

  it('normalizes temperature-scaled softmax and sharpens it at low temperature', () => {
    const cold = softmaxWithTemperature([3, 1, 0], 0.3);
    const warm = softmaxWithTemperature([3, 1, 0], 2);
    expect(cold.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    expect(warm.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    expect(cold[0]).toBeGreaterThan(warm[0]);
    expect(cold.every(Number.isFinite)).toBe(true);
  });

  it('uses the stable max-shift softmax for large logits', () => {
    expect(softmaxWithTemperature([10_000, 9_999], 1)).toEqual([
      expect.closeTo(0.7310585786, 9),
      expect.closeTo(0.2689414214, 9),
    ]);
  });

  it('shows the quadratic learning-rate stability boundary', () => {
    const stable = quadraticDescent({ initial: 2, learningRate: 0.5, curvature: 1, steps: 8 });
    const unstable = quadraticDescent({ initial: 2, learningRate: 2.1, curvature: 1, steps: 8 });
    expect(stable.at(-1)?.loss).toBeLessThan(stable[0].loss);
    expect(unstable.at(-1)?.loss).toBeGreaterThan(unstable[0].loss);
    expect(stable).toHaveLength(9);
  });

  it('keeps the toy bias-variance decomposition explicit', () => {
    const point = biasVarianceToy(4, 100, 0.08);
    expect(point.expectedTestError).toBeCloseTo(point.biasSquared + point.variance + point.noise);
    expect(biasVarianceToy(8, 100, 0.08).biasSquared).toBeLessThan(point.biasSquared);
    expect(biasVarianceToy(8, 100, 0.08).variance).toBeGreaterThan(point.variance);
  });

  it('rejects invalid inputs instead of drawing misleading values', () => {
    expect(() => softmaxWithTemperature([1, 2], 0)).toThrow(RangeError);
    expect(() =>
      quadraticDescent({ initial: 1, learningRate: -1, curvature: 1, steps: 3 })
    ).toThrow(RangeError);
    expect(() => biasVarianceToy(0, 10, 0.1)).toThrow(RangeError);
  });
});
