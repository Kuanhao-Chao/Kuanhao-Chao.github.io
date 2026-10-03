import { describe, expect, it } from 'vitest';
import {
  cellRadius,
  createMorphParticles,
  MORPH_ROLES,
  playbackProgress,
  playbackTime,
  particleVisibility,
  sampleMorphAtmosphere,
  rotateMorphPoint,
  morphPointerFalloff,
  sampleCell,
  sampleCellParticle,
  sampleDna,
  sampleMorph,
  sampleMorphTarget,
  springStep,
  storyProgress,
  visibleParticle,
  type MorphPoint,
} from './morphModel';
import { MORPH_STAGES } from './morphStory';
import {
  sampleProteinParticle,
  sampleNetworkParticle,
  sampleDistributionParticle,
} from './morphTargets';
import { sampleRnaParticle } from './morphSplice';

const point = (): MorphPoint => ({ x: 0, y: 0, z: 0, alpha: 1 });
describe('dimensional genome-to-cell story', () => {
  it('keeps decorative streams subdued and removes them from expression and distribution', () => {
    const out = point(),
      again = point();
    for (const progress of [0, 1 / 6, 1 / 3, 0.5, 2 / 3, 5 / 6, 1]) {
      for (let i = 0; i < 240; i++) {
        sampleMorphAtmosphere(i, 240, progress, 17, out);
        sampleMorphAtmosphere(i, 240, progress, 17, again);
        expect(again).toEqual(out);
        expect(Math.abs(out.x)).toBeLessThan(1.2);
        expect(Math.abs(out.y)).toBeLessThan(0.8);
        expect(out.alpha).toBeGreaterThanOrEqual(0);
        expect(out.alpha).toBeLessThanOrEqual(0.1);
        if (progress === 2 / 3 || progress === 1) expect(out.alpha).toBe(0);
      }
    }
  });
  it('rotates without scaling and bounds pointer influence to a small radius', () => {
    const out = { x: 0.8, y: -0.3, z: 0.4, alpha: 0.7 };
    const length = Math.hypot(out.x, out.y, out.z);
    rotateMorphPoint(out, 0.25, -0.1);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(length, 12);
    expect(out.alpha).toBe(0.7);
    expect(morphPointerFalloff(0, 100)).toBe(1);
    expect(morphPointerFalloff(50, 100)).toBe(0.5);
    expect(morphPointerFalloff(100, 100)).toBe(0);
    expect(morphPointerFalloff(1000, 100)).toBe(0);
  });
  it('keeps all anatomical groups at phone size and minimum quality', () => {
    for (const count of [1000, 1600, 3200, 5000]) {
      const particles = createMorphParticles(count);
      expect(particles).toEqual(createMorphParticles(count));
      expect(particles).toHaveLength(count);
      for (const role of MORPH_ROLES) {
        expect(
          particles.filter((p) => p.role === role && visibleParticle(p, 0.35)).length
        ).toBeGreaterThan(2);
      }
    }
  });
  it('fills surfaces and interiors while preserving anatomical containment', () => {
    const p = point();
    for (const time of [0, 30, 80]) {
      for (const particle of createMorphParticles(5000)) {
        sampleCellParticle(particle, time, p);
        expect([p.x, p.y, p.z, p.alpha].every(Number.isFinite)).toBe(true);
        const theta = Math.atan2(p.y / 0.79, p.x);
        // A 3D shell projects inside its outer silhouette, with slight angular irregularity.
        expect(Math.hypot(p.x, p.y / 0.79)).toBeLessThanOrEqual(cellRadius(theta, time) + 0.001);
        if (particle.role === 'chromatin' || particle.role === 'nucleolus') {
          expect(((p.x + 0.13) / 0.29) ** 2 + ((p.y + 0.07) / 0.25) ** 2).toBeLessThan(1);
        }
        if (particle.role === 'cytoplasm') {
          expect(((p.x + 0.13) / 0.34) ** 2 + ((p.y + 0.07) / 0.3) ** 2).toBeGreaterThan(0.999);
        }
      }
    }
    const shell = createMorphParticles(1000).filter((p) => p.role === 'membrane');
    const depths = shell.map((particle) => {
      sampleCellParticle(particle, 0, p);
      return p.z;
    });
    expect(Math.min(...depths)).toBeLessThan(-0.4);
    expect(Math.max(...depths)).toBeGreaterThan(0.4);
  });
  it('keeps every particle participating in complete forms and transformations', () => {
    const out = point(),
      scratch = point();
    // The RNA form splices over a loop (a released lariat leaves, the finished mRNA departs), so a
    // particle can be absent at one instant of it. Participation is therefore asked of a particle over
    // the loop, at every form, while geometry is held to its bounds at every single sample.
    const times = [0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5];
    for (const p of createMorphParticles(1600)) {
      for (const stage of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
        let most = 0;
        for (const time of times) {
          sampleMorph(p, stage, time, out, scratch);
          most = Math.max(most, out.alpha);
          expect(out.alpha).toBeLessThanOrEqual(1);
          expect([out.x, out.y, out.z].every(Number.isFinite)).toBe(true);
          expect(Math.max(Math.abs(out.x), Math.abs(out.y), Math.abs(out.z))).toBeLessThan(1.3);
        }
        expect(most).toBeGreaterThan(0.1);
      }
    }
  });
  it('returns the same geometry after reverse scrubbing and settles smoothly at endpoints', () => {
    const a = point(),
      b = point(),
      scratch = point();
    for (const p of createMorphParticles(1000)) {
      sampleMorph(p, 0.25, 3, a, scratch);
      sampleMorph(p, 0.9, 3, b, scratch);
      sampleMorph(p, 0.25, 3, b, scratch);
      expect(b).toEqual(a);
      for (const endpoint of MORPH_STAGES.map((s) => s.progress)) {
        sampleMorph(p, endpoint, 3, a, scratch);
        for (const side of [-1, 1]) {
          sampleMorph(p, endpoint + side * 0.00001, 3, b, scratch);
          expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.000001);
        }
      }
    }
  });
  it('fades quality changes without changing surviving particle identities', () => {
    for (const p of createMorphParticles(1000)) {
      const end = visibleParticle(p, 0.35) ? 1 : 0;
      expect(particleVisibility(p, 1, 0.35, 0)).toBe(1);
      expect(particleVisibility(p, 1, 0.35, 0.5)).toBe((1 + end) / 2);
      expect(particleVisibility(p, 1, 0.35, 1)).toBe(end);
    }
  });
  it('keeps chromatin in the nucleus and organelles inside the deforming membrane', () => {
    const p = point();
    for (const time of [0, 5, 30, 80]) {
      for (const particle of createMorphParticles(820)) {
        sampleCell(particle.role, particle.t, particle.variant, time, p);
        if (particle.role === 'membrane') continue;
        const theta = Math.atan2(p.y / 0.79, p.x);
        expect(Math.hypot(p.x, p.y / 0.79)).toBeLessThan(cellRadius(theta, time) - 0.03);
        if (particle.role === 'chromatin' || particle.role === 'nucleolus') {
          expect(((p.x + 0.13) / 0.29) ** 2 + ((p.y + 0.07) / 0.25) ** 2).toBeLessThan(0.8);
        }
      }
    }
  });
  it('pairs helix strands at the same axial position with opposite depth', () => {
    const a = point(),
      b = point();
    for (const time of [0, 10, 45])
      for (const t of [0, 0.2, 0.5, 1]) {
        sampleDna(t, 0, time, a);
        sampleDna(t, 1, time, b);
        expect(a.x).toBe(b.x);
        expect(a.y + b.y).toBeCloseTo(0, 12);
        expect(a.z + b.z).toBeCloseTo(0, 12);
        expect(Math.hypot(a.y, a.z)).toBeCloseTo(0.24, 12);
      }
  });
  it('remains finite and continuous when crossing either side of the cell chapter', () => {
    const a = point(),
      b = point(),
      scratch = point();
    for (const particle of createMorphParticles(300)) {
      for (const progress of [0, 0.1, 0.25, 0.49999, 0.5, 0.50001, 0.75, 1]) {
        sampleMorph(particle, progress, 7, a, scratch);
        expect([a.x, a.y, a.z, a.alpha].every(Number.isFinite)).toBe(true);
        expect(a.alpha).toBeGreaterThanOrEqual(0);
        expect(a.alpha).toBeLessThanOrEqual(1);
      }
      sampleMorph(particle, 0.49999, 7, a, scratch);
      sampleMorph(particle, 0.50001, 7, b, scratch);
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.00001);
    }
  });
  it('holds complete forms and resumes from the current progress without a jump', () => {
    for (const t of [0, 1, 2, 60, 61]) expect(playbackProgress(t)).toBe(0);
    for (const t of [15, 16, 17, 45, 46, 47]) expect(playbackProgress(t)).toBe(0.5);
    for (const t of [30, 31, 32]) expect(playbackProgress(t)).toBe(1);
    for (let p = 0; p <= 1; p += 0.025) expect(playbackProgress(playbackTime(p))).toBeCloseTo(p, 6);
    for (const t of [2, 5, 7, 10, 12, 15, 17, 20, 22, 25, 27, 30, 32, 35, 40, 45, 50, 55, 60]) {
      expect(Math.abs(playbackProgress(t - 0.0001) - playbackProgress(t + 0.0001))).toBeLessThan(
        0.00001
      );
    }
  });
  it('settles disturbances equivalently at 20 and 60 FPS', () => {
    const run = (fps: number) => {
      let x = 0.05,
        v = 0.23;
      for (let i = 0; i < fps; i++) [x, v] = springStep(x, v, 1 / fps);
      return [x, v];
    };
    const a = run(20),
      b = run(60);
    expect(a[0]).toBeCloseTo(b[0], 10);
    expect(a[1]).toBeCloseTo(b[1], 10);
    expect(Math.abs(a[0])).toBeLessThan(0.002);
  });
  it('keeps scroll chapters monotone', () => {
    const chapters = MORPH_STAGES.map((stage, i) => ({
      id: stage.id,
      center: 100 + i * 400,
      holdRadius: 40,
    }));
    const values = [-100, 100, 300, 500, 1000, 1300, 2000, 2500, 3000].map((focus) =>
      storyProgress(focus, chapters)
    );
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(1);
    expect(values.every((value, i) => !i || value >= values[i - 1])).toBe(true);
  });
  it('lands exactly on independently sampled canonical RNA, protein, Cell, network and density', () => {
    const out = point(),
      expected = point(),
      scratch = point();
    for (const p of createMorphParticles(1000)) {
      for (const stage of MORPH_STAGES) {
        sampleMorph(p, stage.progress, 3, out, scratch);
        sampleMorphTarget(p, stage.id, 3, expected);
        expect(out).toEqual(expected);
      }
      for (const [progress, sampler] of [
        [1 / 6, (out: MorphPoint) => sampleRnaParticle(p, 3, out)],
        [1 / 3, (out: MorphPoint) => sampleProteinParticle(p, out)],
        [0.5, (out: MorphPoint) => sampleCellParticle(p, 3, out)],
        [5 / 6, (out: MorphPoint) => sampleNetworkParticle(p, out)],
        [1, (out: MorphPoint) => sampleDistributionParticle(p, out)],
      ] as const) {
        sampleMorph(p, progress, 3, out, scratch);
        sampler(expected);
        expect(out).toEqual(expected);
      }
    }
  });
  it('participates at minimum quality in every stage and keeps all six transitions finite', () => {
    const out = point(),
      scratch = point();
    for (const p of createMorphParticles(1000).filter((p) => visibleParticle(p, 0.3))) {
      for (let i = 0; i <= 120; i++) {
        // Over the splicing loop, for the same reason as above: a particle takes part at some moment.
        let most = 0;
        for (const time of [0, 3, 6, 9]) {
          sampleMorph(p, i / 120, time, out, scratch);
          most = Math.max(most, out.alpha);
          expect([out.x, out.y, out.z, out.alpha].every(Number.isFinite)).toBe(true);
          expect(Math.max(Math.abs(out.x), Math.abs(out.y), Math.abs(out.z))).toBeLessThan(1.3);
        }
        expect(most).toBeGreaterThan(0.1);
      }
      for (const invalid of [NaN, Infinity, -Infinity]) {
        sampleMorph(p, invalid, invalid, out, scratch);
        expect([out.x, out.y, out.z, out.alpha].every(Number.isFinite)).toBe(true);
      }
    }
  });
});
