import { describe, expect, it } from 'vitest';
import { fitHorizontal } from './morphLighting';
import { sampleDna, rotateMorphPoint } from './morphModel';

describe('whole-form horizontal fitting', () => {
  it('moves a right-clipped form inside the inset without changing scale', () => {
    expect(fitHorizontal(320, 240, 80, 1.25)).toEqual({
      origin: 204,
      scale: 80,
      halfWidth: 100,
    });
  });
  it('uniformly reduces an oversized form rather than squashing an axis', () => {
    expect(fitHorizontal(320, 240, 200, 1.2)).toEqual({ origin: 160, scale: 120, halfWidth: 144 });
  });
  it('preserves a centered form and handles a viewport smaller than both insets', () => {
    expect(fitHorizontal(800, 400, 200, 1)).toEqual({ origin: 400, scale: 200, halfWidth: 200 });
    expect(fitHorizontal(20, 15, 100, 1)).toEqual({ origin: 10, scale: 0, halfWidth: 0 });
  });
  it('keeps complete projected strands inside six viewports over rotation and depth extremes', () => {
    const point = { x: 0, y: 0, z: 0, alpha: 1 };
    for (const width of [320, 360, 390, 414, 768, 1440]) {
      const fit = fitHorizontal(width, width * 0.79, width * 0.36, 1.18);
      for (const time of [0, 12, 23, 45])
        for (const yaw of [-0.25, 0, 0.25])
          for (const pitch of [-0.125, 0.125])
            for (const strand of [0, 1]) {
              for (let i = 0; i <= 96; i++) {
                sampleDna(i / 96, strand, time, point);
                rotateMorphPoint(point, yaw, pitch);
                const x = fit.origin + point.x * fit.scale * (1 + point.z * 0.22);
                expect(x).toBeGreaterThanOrEqual(16);
                expect(x).toBeLessThanOrEqual(width - 16);
              }
            }
    }
  });
});
