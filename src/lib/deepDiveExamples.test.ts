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

describe('statgen-heritability-greml', () => {
  const mdx = lesson('statgen-heritability-greml');

  /** Falconer's ACE decomposition from the two twin correlations. */
  const falconer = (rMZ: number, rDZ: number) => ({
    h2: 2 * (rMZ - rDZ),
    c2: 2 * rDZ - rMZ,
    e2: 1 - rMZ,
  });

  describe("worked example — Falconer's estimator", () => {
    const x = falconer(0.85, 0.5);

    it('gives h² = 0.70, c² = 0.15, e² = 0.15', () => {
      expect(x.h2).toBeCloseTo(0.7, 12);
      expect(x.c2).toBeCloseTo(0.15, 12);
      expect(x.e2).toBeCloseTo(0.15, 12);
      expect(mdx).toContain('2(0.85 - 0.50) = 0.70');
      expect(mdx).toContain('2(0.50) - 0.85 = 0.15');
      expect(mdx).toContain('1 - 0.85 = 0.15');
    });

    it('has components that exhaust the variance', () => {
      expect(x.h2 + x.c2 + x.e2).toBeCloseTo(1, 12);
      expect(mdx).toContain('0.70 + 0.15 + 0.15 = 1.00');
    });
  });

  describe('worked example — observed scale to liability scale', () => {
    // Standard normal quantile and density, implemented here rather than imported so the
    // test cannot agree with the lesson merely by sharing a bug with it.
    const pdf = (z: number) => Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI);
    /** Acklam's inverse normal CDF; accurate to ~1e-9, far beyond the 6 dp quoted. */
    function invCdf(p: number): number {
      const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
      const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
      const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
      const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
      const pl = 0.02425;
      let q: number, r: number;
      if (p < pl) {
        q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
      }
      if (p <= 1 - pl) {
        q = p - 0.5; r = q * q;
        return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
      }
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }

    const K = 0.01, P = 0.5, h2o = 0.2;
    const T = invCdf(1 - K);
    const zK = pdf(T);
    const factor = (K * K * (1 - K) * (1 - K)) / (zK * zK * P * (1 - P));

    it('locates the liability threshold at 2.326348', () => {
      expect(T).toBeCloseTo(2.326348, 5);
      expect(mdx).toContain('\\Phi^{-1}(0.99) = 2.326348');
    });

    it('gives a density height of 0.026652 there', () => {
      expect(zK).toBeCloseTo(0.026652, 6);
      expect(mdx).toContain('= 0.026652');
    });

    it('gives a conversion factor of 0.5519 and h²_l = 0.1104', () => {
      expect(K * K * (1 - K) * (1 - K)).toBeCloseTo(0.00009801, 10);
      // the lesson quotes this to 9 dp; asserting more precision than it prints
      // tests the rounding, not the mathematics
      expect(zK * zK * P * (1 - P)).toBeCloseTo(0.000177584, 9);
      expect(factor).toBeCloseTo(0.5519, 4);
      expect(h2o * factor).toBeCloseTo(0.1104, 4);
      expect(mdx).toContain('= 0.00009801');
      expect(mdx).toContain('= 0.000177584');
      expect(mdx).toContain('= 0.5519');
      expect(mdx).toContain('0.20 \\times 0.5519 = 0.1104');
    });

    it('overstates by more than 80% if left unconverted, as the lesson claims', () => {
      expect(h2o / (h2o * factor) - 1).toBeGreaterThan(0.8);
      expect(mdx).toContain('by more than 80%');
    });
  });

  describe('exercise 1 — Falconer by hand', () => {
    it('matches the published solution', () => {
      const x = falconer(0.6, 0.4);
      expect([x.h2, x.c2, x.e2]).toEqual([0.4, 0.2, 0.4].map((v) => expect.closeTo(v, 12)));
      expect(x.h2 + x.c2 + x.e2).toBeCloseTo(1, 12);
      expect(mdx).toContain('2(0.60 - 0.40) = 0.40');
    });
  });

  describe('exercise 2 — when the model breaks', () => {
    it('produces an out-of-range h² and a negative c², as claimed', () => {
      const x = falconer(0.9, 0.3);
      expect(x.h2).toBeCloseTo(1.2, 12);
      expect(x.c2).toBeCloseTo(-0.3, 12);
      expect(x.h2).toBeGreaterThan(1);
      expect(x.c2).toBeLessThan(0);
      expect(mdx).toContain('2(0.90 - 0.30) = 1.20');
      expect(mdx).toContain('2(0.30) - 0.90 = -0.30');
    });
  });

  describe('exercise 3 — GREML sample size', () => {
    const nFor = (halfWidth: number) => 316 / (halfWidth / 1.96);

    it('needs about 12,400 for a half-width of 0.05', () => {
      expect(0.05 / 1.96).toBeCloseTo(0.02551, 5);
      expect(Math.round(nFor(0.05) / 100) * 100).toBe(12400);
      expect(mdx).toContain('\\frac{0.05}{1.96} = 0.02551');
      expect(mdx).toContain('12{,}400');
    });

    it('needs about 31,000 for a half-width of 0.02', () => {
      expect(Math.round(nFor(0.02) / 1000) * 1000).toBe(31000);
      expect(mdx).toContain('31{,}000');
    });
  });

  describe('figure 2 — the heritability gap', () => {
    it('draws the four published estimates for height', () => {
      for (const pct of ['10%', '45%', '68%', '80%']) expect(mdx).toContain('>' + pct + '<');
      // and the caption's arithmetic: 80 − 10 = 70 points missing in 2010
      expect(80 - 10).toBe(70);
      expect(mdx).toContain('the &quot;missing&quot; 70 points');
    });
  });
});
