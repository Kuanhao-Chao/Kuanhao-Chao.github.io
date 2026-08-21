import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Every worked example and exercise solution in the deep-dive curriculum, recomputed
 * from first principles and then checked against the literal text of the lesson.
 *
 * The second half is the part that matters. Recomputing the arithmetic in isolation
 * proves only that this file is self-consistent; asserting that the resulting number
 * appears verbatim in the .mdx is what stops the prose and the mathematics drifting
 * apart. Edit a figure in a lesson without redoing the algebra and this fails.
 */

const lesson = (id: string) => readFileSync(`src/content/deepDives/${id}.mdx`, 'utf8');

/** Every LD measure from the four haplotype frequencies. */
function ld(pAB: number, pAb: number, paB: number, pab: number) {
  const total = pAB + pAb + paB + pab;
  expect(total, 'haplotype frequencies must sum to 1').toBeCloseTo(1, 12);
  const pA = pAB + pAb;
  const pB = pAB + paB;
  const pa = 1 - pA;
  const pb = 1 - pB;
  const D = pAB - pA * pB;
  const Dmax = D > 0 ? Math.min(pA * pb, pa * pB) : Math.min(pA * pB, pa * pb);
  return { pA, pB, pa, pb, D, Dprime: D / Dmax, r2: (D * D) / (pA * pa * pB * pb) };
}

describe('statgen-linkage-disequilibrium', () => {
  const mdx = lesson('statgen-linkage-disequilibrium');

  describe('worked example — complete LD with almost no tagging', () => {
    // 1,000 phased chromosomes: AB 100, Ab 0, aB 400, ab 500.
    const x = ld(100 / 1000, 0 / 1000, 400 / 1000, 500 / 1000);

    it('has the allele frequencies the lesson states', () => {
      expect(x.pA).toBeCloseTo(0.1, 12);
      expect(x.pB).toBeCloseTo(0.5, 12);
    });

    it('gives D = 0.05 by both the definition and the determinant', () => {
      expect(x.D).toBeCloseTo(0.05, 12);
      // determinant form, computed independently
      expect(0.1 * 0.5 - 0.0 * 0.4).toBeCloseTo(0.05, 12);
      expect(mdx).toContain('= 0.05');
    });

    it("gives D' = 1 exactly, because the Ab haplotype is absent", () => {
      expect(x.Dprime).toBeCloseTo(1, 12);
      expect(mdx).toContain("D' = \\frac{0.05}{0.05} = 1.000");
    });

    it('gives r² = 0.1111, and a ninefold sample-size penalty', () => {
      expect(x.r2).toBeCloseTo(0.1111, 4);
      expect(1 / x.r2).toBeCloseTo(9, 12);
      expect(mdx).toContain('= \\frac{0.0025}{0.0225} = 0.1111');
      expect(mdx).toContain('= 9N');
    });

    it('is the D-prime-versus-r-squared contrast the section promises', () => {
      expect(x.Dprime).toBeGreaterThan(0.99);
      expect(x.r2).toBeLessThan(0.15);
    });
  });

  describe('worked example — dating a haplotype from its LD', () => {
    const halfLife = (theta: number) => Math.log(0.5) / Math.log(1 - theta);

    it('gives an exact half-life of 692.8 generations at θ = 0.001', () => {
      expect(halfLife(0.001)).toBeCloseTo(692.8, 1);
      expect(mdx).toContain('692.8');
    });

    it('quantifies the approximation error the lesson claims', () => {
      // 0.693/θ against the exact value, at both ends of the useful range.
      expect(0.693 / 0.001).toBeCloseTo(693.0, 1);
      expect(mdx).toContain('693.0');
      const errSmall = (0.693 / 0.001 - halfLife(0.001)) / halfLife(0.001);
      expect(errSmall * 100).toBeCloseTo(0.03, 2); // the lesson claims 0.03%
      expect(mdx).toContain('0.03\\%');
      expect(halfLife(0.1)).toBeCloseTo(6.58, 2);
      const errLarge = (0.693 / 0.1 - halfLife(0.1)) / halfLife(0.1);
      expect(errLarge * 100).toBeCloseTo(5.3, 1);
      expect(mdx).toContain('5.3\\%');
      expect(mdx).toContain('6.58');
    });

    it('converts to roughly 20,000 years at 29 years per generation', () => {
      expect(halfLife(0.001) * 29).toBeCloseTo(20091, 0);
      expect(Math.round((halfLife(0.001) * 29) / 1000) * 1000).toBe(20000);
      expect(mdx).toContain('20{,}000');
    });
  });

  describe('figure 1 — the marked half-lives', () => {
    it('matches the values drawn on the curve', () => {
      const t = (th: number) => Math.log(0.5) / Math.log(1 - th);
      expect(t(0.1)).toBeCloseTo(6.6, 1);
      expect(t(0.01)).toBeCloseTo(69.0, 1);
      expect(t(0.001)).toBeCloseTo(692.8, 1);
      // the caption states them, and the SVG labels them (rounded)
      expect(mdx).toContain('6.6, 69.0 and 692.8 generations');
      for (const label of ['>7<', '>69<', '>693<']) expect(mdx).toContain(label);
    });
  });

  describe('exercise 1 — compute all three measures', () => {
    const x = ld(90 / 200, 10 / 200, 30 / 200, 70 / 200);

    it('matches the published solution', () => {
      expect(x.pA).toBeCloseTo(0.5, 12);
      expect(x.pB).toBeCloseTo(0.6, 12);
      expect(x.D).toBeCloseTo(0.15, 12);
      expect(x.Dprime).toBeCloseTo(0.75, 12);
      expect(x.r2).toBeCloseTo(0.375, 12);
      expect(mdx).toContain('D = 0.45 - (0.50)(0.60) = 0.15');
      expect(mdx).toContain('D\' = 0.15/0.20 = 0.75');
      expect(mdx).toContain('\\frac{0.0225}{0.06} = 0.375');
    });
  });

  describe('exercise 3 — the ceiling on tagging a rare variant', () => {
    it('gives r² = 0.0526 and a 190,000-sample requirement', () => {
      const pA = 0.05;
      const pB = 0.5;
      const D = Math.min(pA * (1 - pB), (1 - pA) * pB); // D' = 1, D > 0
      const r2 = (D * D) / (pA * (1 - pA) * pB * (1 - pB));
      expect(D).toBeCloseTo(0.025, 12);
      expect(r2).toBeCloseTo(0.0526, 4);
      expect(Math.round(10000 / r2 / 1000) * 1000).toBe(190000);
      expect(mdx).toContain('= \\frac{0.000625}{0.011875} = 0.0526');
      expect(mdx).toContain('190{,}000');
    });

    it('agrees with the closed form the solution generalises to', () => {
      const closed = (pA: number, pB: number) => (pA * (1 - pB)) / ((1 - pA) * pB);
      expect(closed(0.05, 0.5)).toBeCloseTo(0.0526, 4);
      // and it must reduce to 1 when the frequencies match
      expect(closed(0.3, 0.3)).toBeCloseTo(1, 12);
      expect(mdx).toContain('r^2 = \\frac{p_A(1 - p_B)}{(1 - p_A)\\,p_B}');
    });
  });
});
