import { describe, expect, it } from 'vitest';
import {
  backgroundRouteAllowed,
  createTrajectory,
  flowVelocity,
  landscapeContours,
  landscapeGradient,
  landscapeLoss,
  resolveBackground,
  seededBackgroundRandom,
  stepTrajectory,
} from './backgroundModel';

describe('background preferences', () => {
  it('validates saved choices and migrates legacy controls without importing Lab mode', () => {
    expect(resolveBackground(null, null)).toEqual({ scene: 'cells', motion: 'ambient' });
    expect(resolveBackground(null, 'calm')).toEqual({ scene: 'cells', motion: 'calm' });
    expect(resolveBackground('{broken', 'off').scene).toBe('off');
    expect(resolveBackground('{"scene":"lab","motion":"fast"}', 'lab')).toEqual({
      scene: 'cells',
      motion: 'ambient',
    });
    expect(resolveBackground('{"scene":"landscape","motion":"paused"}', 'off')).toEqual({
      scene: 'landscape',
      motion: 'paused',
    });
  });
  it('keeps dedicated experiences independent without excluding ordinary articles', () => {
    for (const route of [
      '/lab/',
      '/games/snake/',
      '/nn-lab',
      '/shorkie-lab/genome/',
      '/terminal/',
      '/chromatin/',
      '/algorithms/',
    ])
      expect(backgroundRouteAllowed(route)).toBe(false);
    for (const route of [
      '/',
      '/posts/example/',
      '/deep_dives/statistical-genetics/',
      '/research/',
      '/laboratory-notes/',
    ])
      expect(backgroundRouteAllowed(route)).toBe(true);
  });
});

describe('illustrative optimization landscape', () => {
  it('has the declared minima and an analytic gradient matching finite differences', () => {
    expect(landscapeLoss({ x: 1, y: 0.35 })).toBe(0);
    expect(landscapeLoss({ x: -1, y: -0.35 })).toBe(0);
    for (const p of [
      { x: 0.4, y: 1.7 },
      { x: -1.3, y: -0.6 },
      { x: 0, y: 0 },
    ]) {
      const h = 1e-5;
      const g = landscapeGradient(p);
      expect(g.x).toBeCloseTo(
        (landscapeLoss({ ...p, x: p.x + h }) - landscapeLoss({ ...p, x: p.x - h })) / (2 * h),
        7
      );
      expect(g.y).toBeCloseTo(
        (landscapeLoss({ ...p, y: p.y + h }) - landscapeLoss({ ...p, y: p.y - h })) / (2 * h),
        7
      );
    }
  });
  it('applies standard heavy-ball momentum and converges from the shared default', () => {
    for (const momentum of [false, true]) {
      const t = createTrajectory({ x: 0.45, y: 1.65 }, momentum);
      stepTrajectory(t, 0.035);
      const first = { ...t.velocity };
      const g = landscapeGradient(t.point);
      stepTrajectory(t, 0.035);
      expect(t.velocity.x).toBeCloseTo((momentum ? 0.85 : 0) * first.x + g.x);
      for (let i = 0; i < 1000; i++) stepTrajectory(t, 0.035);
      expect(t.status).toBe('converged');
      expect(landscapeLoss(t.point)).toBeLessThan(1e-6);
      expect(t.path.length).toBeLessThanOrEqual(700);
    }
  });
  it('reports leaving the plotted domain without clamping or drawing an invalid segment', () => {
    const t = createTrajectory({ x: 1.9, y: -1.9 });
    stepTrajectory(t, 10);
    expect(t.status).toBe('outside plot');
    expect(t.path).toHaveLength(1);
    expect(t.point).toEqual({ x: 1.9, y: -1.9 });
  });
  it('places contour vertices near their declared objective values', () => {
    const segments = landscapeContours();
    expect(segments.length).toBeGreaterThan(1000);
    for (const s of segments)
      for (const p of [s.a, s.b]) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(2.00001);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(2.00001);
        expect(Math.abs(landscapeLoss(p) - s.level)).toBeLessThan(0.003);
      }
  });
});

describe('flow field', () => {
  it('is deterministic, bounded, and numerically divergence-free', () => {
    const a = seededBackgroundRandom(),
      b = seededBackgroundRandom();
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
    for (let i = 0; i < 20; i++) {
      const x = a() * 10,
        y = a() * 10,
        time = a() * 100,
        h = 1e-4;
      const v = flowVelocity(x, y, time);
      expect(Math.hypot(v.x, v.y)).toBeLessThan(3);
      const divergence =
        (flowVelocity(x + h, y, time).x -
          flowVelocity(x - h, y, time).x +
          flowVelocity(x, y + h, time).y -
          flowVelocity(x, y - h, time).y) /
        (2 * h);
      expect(divergence).toBeCloseTo(0, 6);
    }
  });
});
