import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  acmgClassify, acmgPosterior, expectedR2, falconerACE, ldHalfLife, ldMeasures,
  liabilityScale, normalPdf, normalQuantile, oeUpperBound, poissonCI,
  sampleSizeForR2, shrinkageFactor, wilsonInterval,
  cdsLength, cdsPosition, codonOf, complementBase, phylopToP, type Exon,
  likelihoodRatioPositive, oddsPathFor, oddsPathPoints, oddsPathStrength,
  cancerCellFraction, tumourMutationalBurden,
} from './deepDiveMath.ts';

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

/**
 * The lesson numbers are computed with `deepDiveMath.ts` — the same module the interactive
 * widgets call — so a widget cannot drift from the prose it sits beside. That module is
 * proved correct independently, against closed forms and round-trip identities, in
 * `deepDiveMath.test.ts`; this file's job is to tie its output to the published text.
 */
const ld = ldMeasures;

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

    it('gives an exact half-life of 692.8 generations at θ = 0.001', () => {
      expect(ldHalfLife(0.001)).toBeCloseTo(692.8, 1);
      expect(mdx).toContain('692.8');
    });

    it('quantifies the approximation error the lesson claims', () => {
      // 0.693/θ against the exact value, at both ends of the useful range.
      expect(0.693 / 0.001).toBeCloseTo(693.0, 1);
      expect(mdx).toContain('693.0');
      const errSmall = (0.693 / 0.001 - ldHalfLife(0.001)) / ldHalfLife(0.001);
      expect(errSmall * 100).toBeCloseTo(0.03, 2); // the lesson claims 0.03%
      expect(mdx).toContain('0.03\\%');
      expect(ldHalfLife(0.1)).toBeCloseTo(6.58, 2);
      const errLarge = (0.693 / 0.1 - ldHalfLife(0.1)) / ldHalfLife(0.1);
      expect(errLarge * 100).toBeCloseTo(5.3, 1);
      expect(mdx).toContain('5.3\\%');
      expect(mdx).toContain('6.58');
    });

    it('converts to roughly 20,000 years at 29 years per generation', () => {
      expect(ldHalfLife(0.001) * 29).toBeCloseTo(20091, 0);
      expect(Math.round((ldHalfLife(0.001) * 29) / 1000) * 1000).toBe(20000);
      expect(mdx).toContain('20{,}000');
    });
  });

  describe('figure 1 — the marked half-lives', () => {
    it('matches the values drawn on the curve', () => {
      const t = ldHalfLife;
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

  const falconer = falconerACE;

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
    const pdf = normalPdf;
    const invCdf = normalQuantile;

    const K = 0.01, P = 0.5, h2o = 0.2;
    const T = invCdf(1 - K);
    const zK = pdf(T);
    // the shared implementation, which the widgets also call
    const factor = liabilityScale(1, K, P);

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

describe('statgen-polygenic-risk-scores', () => {
  const mdx = lesson('statgen-polygenic-risk-scores');

  const H2 = 0.5;
  const M = 1_000_000;
  const shrink = (N: number) => shrinkageFactor(N, M, H2);
  const r2 = (N: number) => expectedR2(N, M, H2);
  const nFor = (target: number) => sampleSizeForR2(target, M, H2);

  describe('worked example — how hard is a marginal estimate shrunk', () => {
    it('forms the governing ratio M/(Nh²) = 20 at N = 100,000', () => {
      expect(M / (100_000 * H2)).toBe(20);
      expect(mdx).toContain('\\frac{1{,}000{,}000}{50{,}000} = 20');
    });

    it('gives a shrinkage factor of 1/21 = 0.047619', () => {
      expect(shrink(100_000)).toBeCloseTo(0.047619, 6);
      expect(shrink(100_000)).toBeCloseTo(1 / 21, 12);
      expect(mdx).toContain('\\frac{1}{21} = 0.047619');
    });

    it('turns a reported 0.10 into a weight of 0.0048', () => {
      expect(0.1 * shrink(100_000)).toBeCloseTo(0.0048, 4);
      expect(mdx).toContain('0.0048');
      expect(mdx).toContain('4.8%');
    });

    it('matches every row of the table of N against shrinkage', () => {
      const rows: [number, number, number][] = [
        [10_000, 200, 0.004975],
        [100_000, 20, 0.047619],
        [1_000_000, 2, 0.333333],
      ];
      for (const [N, ratio, factor] of rows) {
        expect(M / (N * H2)).toBeCloseTo(ratio, 9);
        expect(shrink(N)).toBeCloseTo(factor, 6);
        expect(mdx).toContain(String(factor));
      }
    });
  });

  describe('worked example — what sample size a target accuracy demands', () => {
    it('needs 2,000,000 for half the ceiling', () => {
      expect(nFor(0.25)).toBe(2_000_000);
      expect(r2(2_000_000)).toBeCloseTo(0.25, 12);
      expect(mdx).toContain('0.50 \\times (2 - 1)} = 2{,}000{,}000');
    });

    it('needs 8,000,000 for four fifths of it', () => {
      expect(nFor(0.4)).toBeCloseTo(8_000_000, 6);
      expect(r2(8_000_000)).toBeCloseTo(0.4, 12);
      expect(H2 / 0.4).toBeCloseTo(1.25, 12);
      expect(mdx).toContain('\\frac{1{,}000{,}000}{0.125} = 8{,}000{,}000');
    });

    it('makes the last stretch cost exactly four times the first', () => {
      expect(nFor(0.4) / nFor(0.25)).toBeCloseTo(4, 9);
      expect(mdx).toContain('} = 4\\times');
    });
  });

  describe('exercise 1 — compute a score by hand', () => {
    it('sums the weighted dosages to 0.14', () => {
      const w = [0.05, -0.02, 0.1, 0.03];
      const g = [2, 1, 0, 2];
      const prs = w.reduce((acc, wj, j) => acc + wj * g[j], 0);
      expect(prs).toBeCloseTo(0.14, 12);
      expect(mdx).toContain('= 0.10 - 0.02 + 0 + 0.06 = 0.14');
    });
  });

  describe('exercise 2 — shrinkage across three studies', () => {
    it('grows the weight 67-fold, not 100-fold, across a 100x sample increase', () => {
      const ratio = shrink(1_000_000) / shrink(10_000);
      expect(ratio).toBeCloseTo(67, 9);
      // it is exactly 201/3 — the +1 in the denominator is what breaks proportionality
      expect(ratio).toBeCloseTo(201 / 3, 12);
      expect(ratio).toBeLessThan(100);
      expect(mdx).toContain('0.333333 / 0.004975 \\approx 67');
    });
  });

  describe('exercise 3 — the cost of the last increment', () => {
    it('needs 18,000,000 for ninety percent of the ceiling', () => {
      expect(nFor(0.45)).toBeCloseTo(18_000_000, 6);
      expect(mdx).toContain('0.50 \\times 0.1\\overline{1}} = 18{,}000{,}000');
    });

    it('diverges as 1/epsilon in the shortfall, as the solution claims', () => {
      // N(eps) = (M/h2)(1-eps)/eps  — check against the direct formula
      const nEps = (eps: number) => (M / H2) * ((1 - eps) / eps);
      for (const eps of [0.5, 0.2, 0.1, 0.01]) {
        // relative, not absolute: these are ~10^8, where toBeCloseTo's absolute
        // tolerance would be asserting more precision than a double carries
        expect(nEps(eps) / nFor((1 - eps) * H2)).toBeCloseTo(1, 9);
      }
      // and a tenfold smaller shortfall costs roughly tenfold more
      expect(nEps(0.01) / nEps(0.1)).toBeGreaterThan(9);
      expect(mdx).toContain('\\frac{M}{h^2\\,\\varepsilon}');
    });
  });

  describe('figure 2 — the accuracy curve', () => {
    it('draws the ceiling and the two marked sample sizes', () => {
      // the SNP subscript is a real <tspan>, so assert the parts either side of it
      expect(mdx).toContain('ceiling: R² = h²<tspan');
      expect(mdx).toContain('>SNP</tspan>');
      expect(mdx).toContain(' = 0.50</text>');
      expect(mdx).toContain('2M → half the ceiling');
      expect(mdx).toContain('8M → 80% of it');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Genomic data & resources track
// ══════════════════════════════════════════════════════════════════════════════

describe('genomic-data (hub)', () => {
  const mdx = lesson('genomic-data');

  // Retrieved live from gnomAD v4.1.1 on 2026-08-21 for 17-43106487-A-C (rs28897672),
  // BRCA1 c.181T>G p.Cys61Gly. Recorded here so the page and the test share one source.
  const EXOME = { ac: 25, an: 1_452_604 };
  const GENOME = { ac: 5, an: 152_214 };
  const BRCA1_LOF = { observed: 140, expected: 173.65795480634046 };

  describe('the variant trace', () => {
    it('sums the exome and genome call sets to the joint frequency', () => {
      const ac = EXOME.ac + GENOME.ac;
      const an = EXOME.an + GENOME.an;
      expect(ac).toBe(30);
      expect(an).toBe(1_604_818);
      expect(ac / an).toBeCloseTo(1.8694e-5, 9);
      expect(mdx).toContain('1.8694 \\times 10^{-5}');
      expect(mdx).toContain('{30}{1{,}604{,}818}');
    });

    it('brackets it with the Wilson interval the page quotes', () => {
      const w = wilsonInterval(30, 1_604_818);
      expect(w.lower).toBeCloseTo(1.31e-5, 7);
      expect(w.upper).toBeCloseTo(2.669e-5, 7);
      expect(mdx).toContain('[1.310, 2.669] \\times 10^{-5}');
    });

    it("reproduces gnomAD's published LOEUF from the raw counts", () => {
      // The strongest check on this page: our own Garwood bound, computed from gnomAD's
      // observed and expected LoF counts, must land on the LOEUF gnomAD publishes (0.928).
      const oe = BRCA1_LOF.observed / BRCA1_LOF.expected;
      expect(oe).toBeCloseTo(0.806, 3);
      expect(poissonCI(BRCA1_LOF.observed, 0.9).upper).toBeCloseTo(161.08, 2);
      expect(oeUpperBound(BRCA1_LOF.observed, BRCA1_LOF.expected)).toBeCloseTo(0.9276, 4);
      expect(mdx).toContain('o/e = 0.806');
      expect(mdx).toContain('\\frac{161.08}{173.66} = 0.928');
    });

    it('turns ten ACMG points into a pathogenic posterior', () => {
      expect(350 ** (10 / 8)).toBeCloseTo(1513.86, 2);
      expect(acmgPosterior(10)).toBeCloseTo(0.9941, 4);
      expect(acmgClassify(10)).toBe('pathogenic');
      expect(mdx).toContain('350^{10/8} = 1514');
      expect(mdx).toContain('= 0.9941');
    });

    it('adds its evidence table to exactly ten points', () => {
      expect(4 + 4 + 1 + 1).toBe(10); // PS3 + PS4 + PM2_Supporting + PP3
      expect(mdx).toContain('**10**');
    });
  });

  describe('exercise 1 — absent, or just unobserved', () => {
    it('bounds a zero observation in 5,000 chromosomes at 7.677e-4', () => {
      const w = wilsonInterval(0, 5000);
      expect(w.lower).toBe(0);
      expect(w.upper).toBeCloseTo(7.677e-4, 7);
      expect(mdx).toContain('7.677 \\times 10^{-4}');
    });

    it('makes that bound 41 times the measured frequency', () => {
      const ratio = wilsonInterval(0, 5000).upper / (30 / 1_604_818);
      expect(Math.round(ratio)).toBe(41);
      expect(mdx).toContain('41 times higher');
    });
  });

  describe('exercise 3 — one criterion downgraded', () => {
    it('drops the variant a class when PS3 becomes moderate', () => {
      expect(350 ** (8 / 8)).toBeCloseTo(350, 12);
      expect(acmgPosterior(8)).toBeCloseTo(0.9749, 4);
      expect(acmgClassify(8)).toBe('likely-pathogenic');
      expect(acmgClassify(10)).toBe('pathogenic');
      expect(mdx).toContain('350^{8/8} = 350');
      expect(mdx).toContain('= 0.9749');
    });
  });
});

describe('data-population-frequency', () => {
  const mdx = lesson('data-population-frequency');
  const Z2 = normalQuantile(0.975) ** 2;

  describe('worked example — the same count, two denominators', () => {
    it('puts identical numerators 250-fold apart', () => {
      expect(3 / 1_500_000).toBeCloseTo(2.0e-6, 12);
      expect(3 / 6_000).toBeCloseTo(5.0e-4, 12);
      expect((3 / 6_000) / (3 / 1_500_000)).toBeCloseTo(250, 9);
      expect(mdx).toContain('= 2.000 \\times 10^{-6}');
      expect(mdx).toContain('= 5.000 \\times 10^{-4}');
    });

    it('quotes both Wilson intervals correctly', () => {
      const big = wilsonInterval(3, 1_500_000);
      const small = wilsonInterval(3, 6_000);
      expect(big.lower).toBeCloseTo(6.802e-7, 9);
      expect(big.upper).toBeCloseTo(5.881e-6, 8);
      expect(small.lower).toBeCloseTo(1.701e-4, 6);
      expect(small.upper).toBeCloseTo(1.469e-3, 5);
      expect(mdx).toContain('[6.80 \\times 10^{-7},\\; 5.88 \\times 10^{-6}]');
      expect(mdx).toContain('[1.70 \\times 10^{-4},\\; 1.47 \\times 10^{-3}]');
    });

    it('gives both the same relative width, because three observations is three observations', () => {
      const rel = (k: number, n: number) => {
        const w = wilsonInterval(k, n);
        return (w.upper - w.lower) / (k / n);
      };
      expect(rel(3, 1_500_000)).toBeCloseTo(rel(3, 6_000), 2);
      expect(rel(3, 1_500_000)).toBeCloseTo(2.6, 1);
    });
  });

  describe('the zero-observation closed form', () => {
    it('equals z²/(n + z²) exactly, at every denominator', () => {
      for (const n of [1_000, 5_000, 100_000, 480_179, 1_604_818, 10_000_000]) {
        expect(wilsonInterval(0, n).upper).toBeCloseTo(Z2 / (n + Z2), 15);
      }
      expect(Z2).toBeCloseTo(3.8415, 4);
      expect(mdx).toContain('\\frac{z^2}{n + z^2}');
      expect(mdx).toContain('z^2 = 3.8415');
    });

    it('is the rule of three: absence in n excludes about 4/n and nothing below', () => {
      // 3.84/n is within a few percent of the exact bound once n is large
      for (const n of [10_000, 1_000_000]) {
        expect(wilsonInterval(0, n).upper / (Z2 / n)).toBeCloseTo(1, 3);
      }
    });
  });

  describe('worked example — a filtering threshold from first principles', () => {
    const maxAF = (p: number, mgc: number, mac: number, f: number, inheritance: number) =>
      (p * mgc * mac) / (inheritance * f);

    it('gives 8.000e-6 for the dominant example', () => {
      expect(maxAF(1 / 500, 0.2, 0.02, 0.5, 2)).toBeCloseTo(8.0e-6, 12);
      expect(mdx).toContain('= 8.000 \\times 10^{-6}');
    });

    it('needs about 480,000 chromosomes to exclude it from a zero observation', () => {
      const n = Z2 * (1 / 8.0e-6 - 1);
      expect(n).toBeCloseTo(480_179, 0);
      expect(Math.round(n / 10_000) * 10_000).toBe(480_000);
      // and the bound at that n really does meet the threshold
      expect(wilsonInterval(0, Math.ceil(n)).upper).toBeLessThanOrEqual(8.0e-6);
      expect(mdx).toContain('480{,}000');
    });

    it('clears the threshold with gnomAD but not with a small cohort', () => {
      expect(wilsonInterval(0, 1_604_818).upper).toBeLessThan(8.0e-6);
      expect(wilsonInterval(0, 6_000).upper).toBeGreaterThan(8.0e-6);
    });
  });

  describe('exercise 1 — read a count', () => {
    it('puts the whole interval above the threshold', () => {
      const w = wilsonInterval(12, 800_000);
      expect(12 / 800_000).toBeCloseTo(1.5e-5, 12);
      expect(w.lower).toBeCloseTo(8.581e-6, 8);
      expect(w.upper).toBeCloseTo(2.622e-5, 7);
      expect(w.lower).toBeGreaterThan(8.0e-6); // the point of the exercise
      expect(mdx).toContain('= 1.500 \\times 10^{-5}');
      expect(mdx).toContain('[8.58 \\times 10^{-6},\\; 2.62 \\times 10^{-5}]');
    });
  });

  describe('exercise 3 — a recessive disease', () => {
    it('gives a maximum credible frequency of 1.500e-6', () => {
      expect((2.5e-5 * 0.6 * 0.1) / 1).toBeCloseTo(1.5e-6, 15);
      expect(mdx).toContain('= 1.500 \\times 10^{-6}');
    });

    it('needs 2.56 million chromosomes, more than gnomAD holds', () => {
      const n = Z2 * (1 / 1.5e-6 - 1);
      expect(n / 1e6).toBeCloseTo(2.56, 2);
      expect(n).toBeGreaterThan(1_604_818); // beyond gnomAD v4.1.1
      expect(mdx).toContain('2.56 \\times 10^{6}');
    });
  });

  describe('figure 1 — labels match the mathematics', () => {
    it('draws the threshold and the crossing point the prose derives', () => {
      expect(mdx).toContain('8e-6');
      expect(mdx).toContain('AN = 480,000');
      expect(mdx).toContain('gnomAD v4.1.1');
      expect(mdx).toContain('a 3,000-person cohort');
    });
  });
});

describe('data-reference-annotation', () => {
  const mdx = lesson('data-reference-annotation');

  // The gene model the page and its figure both use.
  const EXONS: Exon[] = [
    { start: 1000, end: 1300 },
    { start: 1500, end: 1700 },
    { start: 2000, end: 2200 },
  ];
  const VARIANT = 1650;

  describe('worked example — one position, three answers', () => {
    it('has a coding length of 552, which is 184 whole codons', () => {
      const n = cdsLength(EXONS, 2150, 1101, '-');
      expect(n).toBe(552);
      expect(n / 3).toBe(184);
      expect(mdx).toContain('151 + 201 + 200 = 552');
      expect(mdx).toContain('184$ codons');
    });

    it('puts the variant at c.202, codon 68, under the MANE transcript', () => {
      const c = cdsPosition(VARIANT, EXONS, 2150, 1101, '-')!;
      expect(c).toBe(202);
      expect(codonOf(c).codon).toBe(68);
      expect(mdx).toContain('c. = 151 + 51 = 202');
      expect(mdx).toContain('\\lceil 202/3 \\rceil = 68');
    });

    it('puts it at c.351, codon 117, if the strand is ignored', () => {
      const c = cdsPosition(VARIANT, EXONS, 1101, 2150, '+')!;
      expect(c).toBe(351);
      expect(codonOf(c).codon).toBe(117);
      expect(mdx).toContain('200 + 151 = c.351');
      expect(mdx).toContain('codon 117');
    });

    it('puts it at c.51, codon 17, under the shorter isoform', () => {
      const c = cdsPosition(VARIANT, EXONS, 1700, 1101, '-')!;
      expect(c).toBe(51);
      expect(codonOf(c).codon).toBe(17);
      expect(mdx).toContain('c.51, codon 17');
    });

    it('reports the exon boundaries in c. space that the derivation states', () => {
      expect(cdsPosition(2150, EXONS, 2150, 1101, '-')).toBe(1);
      expect(cdsPosition(2000, EXONS, 2150, 1101, '-')).toBe(151);
      expect(cdsPosition(1700, EXONS, 2150, 1101, '-')).toBe(152);
      expect(cdsPosition(1500, EXONS, 2150, 1101, '-')).toBe(352);
      expect(mdx).toContain('c.1\\text{–}c.151');
      expect(mdx).toContain('c.152\\text{–}c.352');
    });
  });

  describe('figure 1 — the three readings', () => {
    it('draws exactly the c. positions and codons the module computes', () => {
      const rows: [number, number, '+' | '-', number, number][] = [
        [2150, 1101, '-', 202, 68],
        [1101, 2150, '+', 351, 117],
        [1700, 1101, '-', 51, 17],
      ];
      for (const [hi, lo, strand, c, codon] of rows) {
        expect(cdsPosition(VARIANT, EXONS, hi, lo, strand)).toBe(c);
        expect(codonOf(c).codon).toBe(codon);
        // the label the Python generator drew, asserted from the TypeScript side
        expect(mdx).toContain(`c.${c} \u00b7 codon ${codon}`);
      }
    });
  });

  describe('worked example — why conservation alone cannot prioritise', () => {
    const GENOME = 3.1e9;
    const CONSTRAINED = 0.035;

    it('turns phyloP 2.0 into p = 0.01', () => {
      expect(phylopToP(2)).toBeCloseTo(0.01, 12);
      expect(mdx).toContain('10^{-2.0} = 0.01');
    });

    it('expects 3.1e7 bases to pass by chance', () => {
      expect(GENOME * phylopToP(2)).toBeCloseTo(3.1e7, 0);
      expect(mdx).toContain('3.1 \\times 10^7');
    });

    it('puts the constrained set at 1.085e8 bases', () => {
      expect(GENOME * CONSTRAINED).toBeCloseTo(1.085e8, 0);
      expect(mdx).toContain('1.085 \\times 10^8');
    });

    it('bounds precision at 0.778 even under the most generous assumption', () => {
      const tp = GENOME * CONSTRAINED;
      const fp = GENOME * phylopToP(2);
      expect(tp / (tp + fp)).toBeCloseTo(0.778, 3);
      expect(mdx).toContain('= 0.778');
      // and the complement the prose quotes
      expect(Math.round((1 - tp / (tp + fp)) * 100)).toBe(22);
      expect(mdx).toContain('Twenty-two per cent');
    });
  });

  describe('exercise 1 — number another base', () => {
    it('gives c.453, the third base of codon 151', () => {
      const c = cdsPosition(1200, EXONS, 2150, 1101, '-')!;
      expect(c).toBe(453);
      const { codon, offset } = codonOf(c);
      expect(codon).toBe(151);
      expect(offset).toBe(3);
      expect(453).toBe(3 * 151); // exactly, which is what makes it a wobble base
      expect(mdx).toContain('c. = 352 + 101 = 453');
      expect(mdx).toContain('\\lceil 453/3 \\rceil = 151');
    });
  });

  describe('exercise 2 — the alleles flip too', () => {
    it('complements the VCF alleles into the coding description', () => {
      expect(complementBase('A')).toBe('T');
      expect(complementBase('G')).toBe('C');
      expect(mdx).toContain('c.202T>C');
      expect(mdx).toContain('c.202A>G');
    });
  });

  describe('exercise 3 — what threshold would you need', () => {
    it('needs p = 3.226e-4, i.e. phyloP 3.49', () => {
      const p = 1e6 / 3.1e9;
      expect(p).toBeCloseTo(3.226e-4, 7);
      expect(-Math.log10(p)).toBeCloseTo(3.49, 2);
      // and the round trip through the module agrees
      expect(3.1e9 * phylopToP(-Math.log10(p))).toBeCloseTo(1e6, 6);
      expect(mdx).toContain('3.226 \\times 10^{-4}');
      expect(mdx).toContain('= 3.49');
    });
  });

  describe('GENCODE 50 figures quoted in the prose', () => {
    it('states a transcript-per-gene ratio consistent with the counts', () => {
      expect(278_455 / 19_442).toBeCloseTo(14.3, 1);
      expect(mdx).toContain('19,442 protein-coding genes carrying 278,455 protein-coding');
      expect(mdx).toContain('14.3 transcripts per gene');
    });
  });
});

describe('data-constraint-intolerance', () => {
  const mdx = lesson('data-constraint-intolerance');

  describe('worked example — two genes, the same depletion', () => {
    it('gives both genes the same observed/expected ratio', () => {
      expect(3 / 25.3).toBeCloseTo(0.1186, 4);
      expect(12 / 100).toBeCloseTo(0.12, 12);
      expect(mdx).toContain('\\frac{3}{25.3} = 0.1186');
      expect(mdx).toContain('\\frac{12}{100.0} = 0.1200');
    });

    it('bounds the counts with the Poisson intervals the derivation quotes', () => {
      const a = poissonCI(3, 0.9);
      const b = poissonCI(12, 0.9);
      expect(a.lower).toBeCloseTo(0.818, 3);
      expect(a.upper).toBeCloseTo(7.754, 3);
      expect(b.lower).toBeCloseTo(6.924, 3);
      expect(b.upper).toBeCloseTo(19.443, 3);
      expect(mdx).toContain('[0.818,\\; 7.754]');
      expect(mdx).toContain('[6.924,\\; 19.443]');
    });

    it('separates the two genes on LOEUF despite the identical ratio', () => {
      const A = oeUpperBound(3, 25.3);
      const B = oeUpperBound(12, 100);
      expect(A).toBeCloseTo(0.3065, 4);
      expect(B).toBeCloseTo(0.1944, 4);
      expect(B).toBeLessThan(A); // more evidence, tighter bound
      expect(mdx).toContain('\\frac{7.754}{25.3} = 0.3065');
      expect(mdx).toContain('\\frac{19.443}{100.0} = 0.1944');
    });
  });

  describe('the power floor', () => {
    // With nothing observed the bound collapses to a constant, so the floor depends only
    // on gene size. This is the fact the page and its figure are both built on.
    const FLOOR = poissonCI(0, 0.9).upper;

    it('collapses to 2.996 when nothing is observed', () => {
      expect(FLOOR).toBeCloseTo(2.996, 3);
      expect(FLOOR).toBeCloseTo(-Math.log(0.05), 6); // the closed form
      expect(mdx).toContain('= 2.996');
    });

    it('needs 8.56 expected variants before the constrained bin is reachable', () => {
      expect(FLOOR / 0.35).toBeCloseTo(8.56, 2);
      expect(mdx).toContain('\\frac{2.996}{0.35} = 8.56');
      expect(mdx).toContain('8.56 expected');
    });

    it('puts a small gene with zero observed at LOEUF 1.4265, above the threshold', () => {
      const small = oeUpperBound(0, 2.1);
      expect(small).toBeCloseTo(1.4265, 4);
      expect(small).toBeGreaterThan(0.35);
      // and it sits exactly on the floor, which is what the figure draws
      expect(small).toBeCloseTo(FLOOR / 2.1, 12);
    });
  });

  describe('figure 1 — the floor curve', () => {
    it('draws the crossing and the marked genes at the computed values', () => {
      expect(poissonCI(0, 0.9).upper / 0.35).toBeCloseTo(8.5592, 4);
      expect(mdx).toContain('8.56 expected — below this, no gene can reach the bin');
      expect(mdx).toContain('obs 0 of 2.1 expected');
      expect(mdx).toContain('obs 3 of 25.3');
      expect(mdx).toContain('obs 12 of 100');
      expect(mdx).toContain('LOEUF = 0.35, the constrained bin');
    });
  });

  describe('worked example — pext', () => {
    const TPM = { t1: 12.0, t2: 6.5, t3: 1.2, t4: 0.3 };
    const total = TPM.t1 + TPM.t2 + TPM.t3 + TPM.t4;

    it('sums the transcript expression to 20 TPM', () => {
      expect(total).toBeCloseTo(20.0, 12);
      expect(mdx).toContain('12.0 + 6.5 + 1.2 + 0.3 = 20.0');
    });

    it('gives pext 0.075 for an exon in the minority isoforms', () => {
      const pext = (TPM.t3 + TPM.t4) / total;
      expect(TPM.t3 + TPM.t4).toBeCloseTo(1.5, 12);
      expect(pext).toBeCloseTo(0.075, 12);
      expect(1 - pext).toBeCloseTo(0.925, 12);
      expect(mdx).toContain('\\frac{1.5}{20.0} = 0.075');
      expect(mdx).toContain('**92.5%**');
    });
  });

  describe('exercise 1 — a gene that tolerates loss', () => {
    it('gives O/E 0.90 and LOEUF 1.1539, a well-powered null', () => {
      expect(45 / 50).toBeCloseTo(0.9, 12);
      const ci = poissonCI(45, 0.9);
      expect(ci.lower).toBeCloseTo(34.563, 3);
      expect(ci.upper).toBeCloseTo(57.695, 3);
      expect(oeUpperBound(45, 50)).toBeCloseTo(1.1539, 4);
      expect(oeUpperBound(45, 50)).toBeGreaterThan(1); // no depletion is compatible
      expect(mdx).toContain('[34.563,\\; 57.695]');
      expect(mdx).toContain('\\frac{57.695}{50} = 1.1539');
    });
  });

  describe('exercise 2 — the same gene, a different exon', () => {
    it('gives pext 0.925 and a 12.33-fold contrast', () => {
      const hi = (12.0 + 6.5) / 20.0;
      const lo = (1.2 + 0.3) / 20.0;
      expect(hi).toBeCloseTo(0.925, 12);
      expect(hi / lo).toBeCloseTo(12.33, 2);
      expect(mdx).toContain('\\frac{18.5}{20.0} = 0.925');
      expect(mdx).toContain('\\frac{0.925}{0.075} = 12.33');
    });
  });

  describe('exercise 3 — how much gene do you need', () => {
    it('reaches 8.56 from the closed-form bound', () => {
      expect(-Math.log(0.05)).toBeCloseTo(2.996, 3);
      expect(-Math.log(0.05) / 0.35).toBeCloseTo(8.56, 2);
      expect(mdx).toContain('-\\ln(0.05) = 2.996');
    });

    it('agrees with the cohort-growth factor the solution quotes', () => {
      expect(807_162 / 141_456).toBeCloseTo(5.7, 1); // "roughly a factor of six"
      expect(mdx).toContain('141,456 to 807,162');
    });
  });
});

describe('data-variant-effect-scores', () => {
  const mdx = lesson('data-variant-effect-scores');

  describe('worked example — an impressive AUC worth the weakest tier', () => {
    const LR = likelihoodRatioPositive(0.88, 0.28);

    it('gives LR+ = 3.1429', () => {
      expect(LR).toBeCloseTo(3.142857, 6);
      expect(mdx).toContain('\\frac{0.88}{0.28} = 3.1429');
    });

    it('converts to 1.5639 points, which is supporting and not moderate', () => {
      expect(oddsPathPoints(LR)).toBeCloseTo(1.5639, 4);
      expect(oddsPathStrength(LR)).toBe('supporting');
      expect(oddsPathPoints(LR)).toBeGreaterThanOrEqual(1);
      expect(oddsPathPoints(LR)).toBeLessThan(2);
      expect(mdx).toContain('= 1.5639');
      expect(mdx).toContain('At 1.5639 the');
    });

    it('quotes the logs the derivation shows its working with', () => {
      expect(Math.log(3.142857)).toBeCloseTo(1.1451, 4);
      expect(Math.log(350)).toBeCloseTo(5.8579, 4);
      expect(mdx).toContain('\\frac{\\ln 3.1429}{\\ln 350}');
    });

    it('sits on a curve of area 0.909', () => {
      // TPR = FPR^a through (0.28, 0.88); AUC of that family is 1/(1+a).
      const a = Math.log(0.88) / Math.log(0.28);
      expect(1 / (1 + a)).toBeCloseTo(0.908743, 6);
      expect(mdx).toContain('AUC = 0.909');
    });
  });

  describe('worked example — what it would take to reach strong', () => {
    const STRONG = oddsPathFor('strong');

    it('needs specificity of 95.296% at 88% sensitivity', () => {
      expect(STRONG).toBeCloseTo(18.708, 3);
      expect(0.88 / STRONG).toBeCloseTo(0.04704, 5);
      expect(1 - 0.88 / STRONG).toBeCloseTo(0.95296, 5);
      expect(mdx).toContain('\\frac{0.88}{18.708} = 0.04704');
      expect(mdx).toContain('1 - 0.04704 = 0.95296');
      expect(mdx).toContain('95.3%');
    });

    it('makes strong unreachable at FPR 0.28 for any sensitivity', () => {
      const needed = STRONG * 0.28;
      expect(needed).toBeCloseTo(5.238, 3);
      expect(needed).toBeGreaterThan(1); // a rate cannot exceed one
      expect(mdx).toContain('18.708 \\times 0.28 = 5.238');
    });
  });

  describe('figure 1 — the iso-LR rays', () => {
    it('draws each tier at the power of 350 the framework uses', () => {
      for (const [label, lr] of [['supporting', 2.08], ['moderate', 4.325], ['strong', 18.71], ['very strong', 350]] as const) {
        expect(mdx).toContain(`${label} \u2014 LR ${lr}`);
      }
      expect(oddsPathFor('supporting')).toBeCloseTo(2.0797, 4);
      expect(oddsPathFor('moderate')).toBeCloseTo(4.3253, 4);
      expect(oddsPathFor('strong')).toBeCloseTo(18.7083, 4);
    });

    it('marks the operating point with the values the prose derives', () => {
      expect(mdx).toContain('threshold here: TPR 0.88, FPR 0.28');
      expect(mdx).toContain('LR+ = 3.14 — supporting');
      expect(mdx).toContain('the predictor, AUC 0.909');
    });
  });

  describe('exercise 1 — a sensitive threshold worth nothing', () => {
    it('reaches no tier at all', () => {
      const LR = likelihoodRatioPositive(0.95, 0.6);
      expect(LR).toBeCloseTo(1.5833, 4);
      expect(oddsPathPoints(LR)).toBeCloseTo(0.6276, 4);
      expect(oddsPathStrength(LR)).toBe('none');
      expect(mdx).toContain('\\frac{0.95}{0.60} = 1.5833');
      expect(mdx).toContain('= 0.6276');
    });
  });

  describe('exercise 2 — one predictor, two verdicts', () => {
    const a = 1 / 0.95 - 1;

    it('derives the curve exponent from the AUC', () => {
      expect(a).toBeCloseTo(0.052632, 6);
      expect(1 / (1 + a)).toBeCloseTo(0.95, 12); // round trip
      expect(mdx).toContain('1/0.95 - 1 = 0.052632');
    });

    it('is strong at FPR 0.01', () => {
      const tpr = 0.01 ** a;
      const LR = tpr / 0.01;
      expect(tpr).toBeCloseTo(0.7848, 4);
      expect(LR).toBeCloseTo(78.476, 3);
      expect(oddsPathPoints(LR)).toBeCloseTo(5.958, 3);
      expect(oddsPathStrength(LR)).toBe('strong');
      expect(mdx).toContain('0.01^{0.052632} = 0.7848');
      expect(mdx).toContain('\\frac{0.7848}{0.01} = 78.48');
    });

    it('is nothing at all at FPR 0.50, on the very same curve', () => {
      const tpr = 0.5 ** a;
      const LR = tpr / 0.5;
      expect(tpr).toBeCloseTo(0.9642, 4);
      expect(LR).toBeCloseTo(1.9284, 4);
      expect(oddsPathPoints(LR)).toBeCloseTo(0.897, 3);
      expect(oddsPathStrength(LR)).toBe('none');
      expect(mdx).toContain('0.50^{0.052632} = 0.9642');
      expect(mdx).toContain('\\frac{0.9642}{0.50} = 1.9284');
    });
  });

  describe('exercise 3 — counting the same evidence twice', () => {
    it('inflates the posterior from 0.1877 to 0.3246', () => {
      expect(acmgPosterior(2)).toBeCloseTo(0.3246, 4);
      expect(acmgPosterior(1)).toBeCloseTo(0.1877, 4);
      expect(mdx).toContain('350^{1/4} = 4.3253');
      expect(mdx).toContain('350^{1/8} = 2.0797');
      expect(mdx).toContain('= 0.3246');
      expect(mdx).toContain('= 0.1877');
    });

    it('is a 72.9% overstatement', () => {
      const inflation = (acmgPosterior(2) - acmgPosterior(1)) / acmgPosterior(1);
      expect(inflation * 100).toBeCloseTo(72.9, 1);
      expect(mdx).toContain('72.9\\%');
      expect(mdx).toContain('72.9% overstatement');
    });

    it('always inflates, never deflates — more evidence cannot lower the posterior', () => {
      for (let p = 0; p <= 8; p++) expect(acmgPosterior(p + 1)).toBeGreaterThan(acmgPosterior(p));
    });
  });
});

describe('data-mave-assays', () => {
  const mdx = lesson('data-mave-assays');
  const Z2 = 1.959963984540054 ** 2;

  describe('worked example — calibrating an assay against its controls', () => {
    const LR = likelihoodRatioPositive(36 / 40, 6 / 60);

    it('gives OddsPath 9.00 from the two control rates', () => {
      expect(36 / 40).toBeCloseTo(0.9, 12);
      expect(6 / 60).toBeCloseTo(0.1, 12);
      expect(LR).toBeCloseTo(9, 12);
      expect(mdx).toContain('\\frac{36}{40} = 0.90');
      expect(mdx).toContain('\\frac{6}{60} = 0.10');
      expect(mdx).toContain('\\frac{0.90}{0.10} = 9.00');
    });

    it('is 3.0007 points, which attains moderate and not strong', () => {
      expect(oddsPathPoints(LR)).toBeCloseTo(3.0007, 4);
      expect(oddsPathStrength(LR)).toBe('moderate');
      expect(oddsPathPoints(LR)).toBeGreaterThanOrEqual(2);
      expect(oddsPathPoints(LR)).toBeLessThan(4);
      expect(mdx).toContain('\\ln 350} = 3.0007');
    });
  });

  describe('a perfect record on a small control set', () => {
    it('bounds a zero observation by the Wilson upper bound, not by zero', () => {
      const upper = wilsonInterval(0, 10, 0.95).upper;
      expect(upper).toBeCloseTo(0.2775, 4);
      // The closed form the prose quotes, derived independently. Tolerance is 1e-8 rather
      // than exact because `normalQuantile` is a rational approximation: it returns
      // 1.959963986 where the true z(0.975) is 1.959963985, a 1.6e-9 discrepancy that
      // propagates here. That is the module's precision, not an error in either formula.
      expect(upper).toBeCloseTo(Z2 / (10 + Z2), 8);
      expect(mdx).toContain('\\frac{3.8415}{10 + 3.8415} = 0.2775');
    });

    it('turns an apparently infinite ratio into supporting', () => {
      const LR = 0.9 / wilsonInterval(0, 10, 0.95).upper;
      expect(LR).toBeCloseTo(3.2429, 4);
      expect(oddsPathPoints(LR)).toBeCloseTo(1.6066, 4);
      expect(oddsPathStrength(LR)).toBe('supporting');
      expect(mdx).toContain('\\frac{0.90}{0.2775} = 3.2429');
      expect(mdx).toContain('1.6066 points');
    });
  });

  describe('figure 1 — what each tier costs in controls', () => {
    // The curve is TPR (n + z^2) / z^2; the marked crossings are the smallest integer n
    // at which it reaches each tier. Recomputed here from the tier definitions.
    const bound = (n: number) => (0.9 * (n + Z2)) / Z2;
    const smallestN = (lr: number) => Math.ceil(Z2 / (0.9 / lr) - Z2);

    it('marks each tier at the control count the bound actually reaches it', () => {
      const expected: [Parameters<typeof oddsPathFor>[0], number][] = [
        ['supporting', 6], ['moderate', 15], ['strong', 77], ['very-strong', 1491],
      ];
      for (const [tier, n] of expected) {
        expect(smallestN(oddsPathFor(tier))).toBe(n);
        expect(bound(n)).toBeGreaterThanOrEqual(oddsPathFor(tier));
        expect(bound(n - 1)).toBeLessThan(oddsPathFor(tier)); // and n is the *smallest*
      }
      for (const label of ['supporting — LR 2.08', 'moderate — LR 4.325',
                           'strong — LR 18.71', 'very strong — LR 350']) {
        expect(mdx).toContain(label);
      }
    });

    it('agrees with the Wilson interval it is derived from', () => {
      // Relative, not absolute: the bound reaches ~350 at n = 1491, where the module's
      // 1.6e-9 quantile error becomes ~6e-7 in absolute terms. Comparing ratios keeps the
      // assertion about agreement rather than about magnitude.
      for (const n of [6, 15, 77, 1491]) {
        expect(bound(n) / (0.9 / wilsonInterval(0, n, 0.95).upper)).toBeCloseTo(1, 8);
      }
    });
  });

  describe('exercise 1 — close to strong, and not strong', () => {
    it('gives OddsPath 15 and stays moderate', () => {
      const LR = likelihoodRatioPositive(45 / 50, 3 / 50);
      expect(LR).toBeCloseTo(15, 12);
      expect(oddsPathPoints(LR)).toBeCloseTo(3.6983, 4);
      expect(oddsPathStrength(LR)).toBe('moderate');
      expect(mdx).toContain('\\frac{3}{50} = 0.06');
      expect(mdx).toContain('= 3.6983');
    });
  });

  describe('exercise 2 — how many controls buy strong', () => {
    it('needs 77, and 76 is not enough', () => {
      const need = 0.9 / oddsPathFor('strong');
      expect(need).toBeCloseTo(0.048107, 6);
      expect(Z2 / need - Z2).toBeCloseTo(76.01, 2);
      const at = (n: number) => 0.9 / wilsonInterval(0, n, 0.95).upper;
      expect(at(76)).toBeCloseTo(18.7057, 4);
      expect(at(77)).toBeCloseTo(18.94, 2);
      expect(oddsPathStrength(at(76))).toBe('moderate');
      expect(oddsPathStrength(at(77))).toBe('strong');
      expect(mdx).toContain('\\frac{0.90}{18.7083} = 0.0481070');
      expect(mdx).toContain('n_B \\ge 76.01');
      expect(mdx).toContain('18.7057');
      expect(mdx).toContain('18.9400');
    });
  });

  describe('exercise 3 — why nobody claims very strong', () => {
    it('needs 1,491 benign controls', () => {
      const need = 0.9 / 350;
      expect(need).toBeCloseTo(0.0025714, 7);
      expect(Z2 / need - Z2).toBeCloseTo(1490.1, 1);
      expect(Math.ceil(Z2 / need - Z2)).toBe(1491);
      expect(oddsPathStrength(0.9 / wilsonInterval(0, 1491, 0.95).upper)).toBe('very-strong');
      expect(mdx).toContain('\\frac{0.90}{350} = 0.0025714');
      expect(mdx).toContain('= 1490.1');
      expect(mdx).toContain('**1,491 benign controls**');
    });

    it('costs several times the controls of the tier below, at every step', () => {
      const n = (t: Parameters<typeof oddsPathFor>[0]) => Math.ceil(Z2 / (0.9 / oddsPathFor(t)) - Z2);
      expect(n('moderate') / n('supporting')).toBeGreaterThan(2);
      expect(n('strong') / n('moderate')).toBeGreaterThan(4);
      expect(n('very-strong') / n('strong')).toBeGreaterThan(19);
    });
  });
});

describe('data-germline-clinical', () => {
  const mdx = lesson('data-germline-clinical');

  describe('worked example — a BRCA1 missense variant, criterion by criterion', () => {
    it('totals the four criteria to 8 points', () => {
      expect(4 + 2 + 1 + 1).toBe(8);
      expect(mdx).toContain('4 + 2 + 1 + 1 = 8');
    });

    it('makes 8 points exactly one very strong criterion, by construction', () => {
      expect(350 ** (8 / 8)).toBeCloseTo(350, 12);
      expect(oddsPathPoints(350)).toBeCloseTo(8, 12);
      expect(mdx).toContain('350^{8/8} = 350');
    });

    it('gives a posterior of 0.9749 and the Likely pathogenic tier', () => {
      expect(acmgPosterior(8)).toBeCloseTo(0.9749, 4);
      expect(acmgClassify(8)).toBe('likely-pathogenic');
      // the arithmetic the derivation shows
      expect(350 * 0.1).toBeCloseTo(35, 12);
      expect((350 - 1) * 0.1 + 1).toBeCloseTo(35.9, 12);
      expect(mdx).toContain('\\frac{35}{35.9} = 0.9749');
    });

    it('falls short of Pathogenic, which needs 10 points', () => {
      expect(acmgClassify(9)).toBe('likely-pathogenic');
      expect(acmgClassify(10)).toBe('pathogenic');
      expect(acmgPosterior(10)).toBeGreaterThan(0.99);
      expect(acmgPosterior(6)).toBeCloseTo(0.9, 3); // the other stated threshold
    });
  });

  describe('the prior the thresholds encode', () => {
    it('turns the same 8 points into three different answers', () => {
      expect(acmgPosterior(8, 0.1)).toBeCloseTo(0.9749, 4);
      expect(acmgPosterior(8, 0.03)).toBeCloseTo(0.9154, 4);
      expect(acmgPosterior(8, 0.01)).toBeCloseTo(0.7795, 4);
      expect(mdx).toContain('\\Rightarrow 0.9749');
      expect(mdx).toContain('\\Rightarrow 0.9154');
      expect(mdx).toContain('\\Rightarrow 0.7795');
    });

    it('drops below the 0.90 Likely pathogenic threshold at a prior of 0.01', () => {
      expect(acmgPosterior(8, 0.1)).toBeGreaterThan(0.9);
      expect(acmgPosterior(8, 0.03)).toBeGreaterThan(0.9);
      expect(acmgPosterior(8, 0.01)).toBeLessThan(0.9);
    });
  });

  describe('figure 1 — ClinVar review status', () => {
    // Counts read from the NCBI statistics page on 2026-08-16.
    const ALL = 4_553_176, CLASSIFIED = 4_302_878, EXPERT = 22_402, GUIDELINE = 663;

    it('draws the four counts the caption states', () => {
      for (const n of [ALL, CLASSIFIED, EXPERT, GUIDELINE]) {
        expect(mdx).toContain(n.toLocaleString('en-US'));
      }
    });

    it('gives the two ratios the brackets label', () => {
      expect(CLASSIFIED / EXPERT).toBeCloseTo(192.1, 1);
      expect(CLASSIFIED / GUIDELINE).toBeCloseTo(6490, 0);
      expect(mdx).toContain('1 classified variant in 192');
      expect(mdx).toContain('1 in 6,490');
    });

    it('keeps the counts in the order the bars assume', () => {
      expect(ALL).toBeGreaterThan(CLASSIFIED);
      expect(CLASSIFIED).toBeGreaterThan(EXPERT);
      expect(EXPERT).toBeGreaterThan(GUIDELINE);
    });
  });

  describe('exercise 1 — one strong criterion is not enough', () => {
    it('is a VUS at 0.6752', () => {
      expect(350 ** (4 / 8)).toBeCloseTo(18.7083, 4);
      expect(acmgPosterior(4)).toBeCloseTo(0.6752, 4);
      expect(acmgClassify(4)).toBe('uncertain');
      expect(mdx).toContain('350^{4/8} = 18.7083');
      expect(mdx).toContain('= 0.6752');
    });
  });

  describe('exercise 2 — evidence pointing both ways', () => {
    it('nets to −3 points and Likely benign', () => {
      expect(-4 + 1).toBe(-3);
      expect(350 ** (-3 / 8)).toBeCloseTo(0.1112, 4);
      expect(acmgPosterior(-3)).toBeCloseTo(0.0122, 4);
      expect(acmgClassify(-3)).toBe('likely-benign');
      expect(mdx).toContain('350^{-3/8} = 0.1112');
      expect(mdx).toContain('= 0.0122');
    });
  });

  describe('exercise 3 — the cost of counting a conclusion', () => {
    it('flips Likely pathogenic to Pathogenic on one circular point', () => {
      expect(acmgPosterior(9)).toBeCloseTo(0.9878, 4);
      expect(acmgPosterior(10)).toBeCloseTo(0.9941, 4);
      expect(acmgClassify(9)).toBe('likely-pathogenic');
      expect(acmgClassify(10)).toBe('pathogenic');
      expect(mdx).toContain('\\text{posterior } 0.9878');
      expect(mdx).toContain('\\text{posterior } 0.9941');
    });

    it('is asymmetric with genuine conflict: agreement inflates, conflict deflates', () => {
      // adding a supporting pathogenic criterion always raises the posterior...
      expect(acmgPosterior(10)).toBeGreaterThan(acmgPosterior(9));
      // ...while real benign evidence lowers it
      expect(acmgPosterior(9 - 4)).toBeLessThan(acmgPosterior(9));
    });
  });
});

describe('data-somatic-oncology', () => {
  const mdx = lesson('data-somatic-oncology');

  describe('worked example — the same allele fraction, three readings', () => {
    it('makes VAF 0.31 clonal at 68% purity', () => {
      expect(cancerCellFraction(0.31, 0.68)).toBeCloseTo(0.9118, 4);
      expect(mdx).toContain('\\frac{2 \\times 0.31}{0.68} = 0.9118');
    });

    it('makes VAF 0.11 subclonal in the very same sample', () => {
      expect(cancerCellFraction(0.11, 0.68)).toBeCloseTo(0.3235, 4);
      expect(cancerCellFraction(0.11, 0.68)).toBeLessThan(0.5);
      expect(mdx).toContain('\\frac{2 \\times 0.11}{0.68} = 0.3235');
    });

    it('overflows past one when the purity is wrong', () => {
      const bad = cancerCellFraction(0.31, 0.35);
      expect(bad).toBeCloseTo(1.7714, 4);
      expect(bad).toBeGreaterThan(1);
      expect(mdx).toContain('\\frac{2 \\times 0.31}{0.35} = 1.7714');
    });

    it('separates the two variants by kind, not by a factor of three', () => {
      // the VAFs differ by <3x; the readings differ across the clonal boundary
      expect(0.31 / 0.11).toBeLessThan(3);
      expect(cancerCellFraction(0.31, 0.68)).toBeGreaterThan(0.9);
      expect(cancerCellFraction(0.11, 0.68)).toBeLessThan(0.4);
    });
  });

  describe('figure 1 — one VAF, four purities', () => {
    it('draws the rays and marks the three computed points', () => {
      for (const p of [0.35, 0.5, 0.68, 0.85]) {
        expect(mdx).toContain(`purity ${p.toFixed(2)}`);
      }
      expect(mdx).toContain('CCF = 1 — every tumour cell');
      expect(mdx).toContain('VAF 0.31');
      // the caption's numbers are the module's
      expect(mdx).toContain('CCF 0.9118');
      expect(mdx).toContain('1.7714');
      expect(mdx).toContain('0.3235');
    });

    it('keeps every drawn ray inside the plotted CCF range, and the impossible point on it', () => {
      // The generator's frame. CCF_MAX was 1.6 and clipped the 1.7714 point off the top,
      // leaving a marker with no ray beneath it; 1.9 puts it on-chart where it argues.
      const CCF_MAX = 1.9;
      for (const rho of [0.35, 0.5, 0.68, 0.85]) {
        const xEnd = Math.min(0.6, (CCF_MAX * rho) / 2);
        expect(cancerCellFraction(xEnd, rho)).toBeLessThanOrEqual(CCF_MAX + 1e-9);
      }
      // the lowest-purity ray must actually reach VAF 0.31, or its marker floats
      expect(Math.min(0.6, (CCF_MAX * 0.35) / 2)).toBeGreaterThan(0.31);
      expect(cancerCellFraction(0.31, 0.35)).toBeLessThan(CCF_MAX);
    });
  });

  describe('copy number moves the answer', () => {
    it('turns clonal into subclonal under loss of heterozygosity', () => {
      const loh = cancerCellFraction(0.31, 0.68, 1, 1);
      expect(loh).toBeCloseTo(0.6018, 4);
      expect(loh).toBeLessThan(cancerCellFraction(0.31, 0.68));
      // the intermediate the prose shows
      expect(0.68 * 1 + (1 - 0.68) * 2).toBeCloseTo(1.32, 12);
      expect(mdx).toContain('\\frac{1.32}{0.68} = 0.6018');
    });
  });

  describe('worked example — a burden the panel cannot measure', () => {
    it('gives 8.9385 mut/Mb on the exome', () => {
      expect(tumourMutationalBurden(320, 35.8)).toBeCloseTo(8.9385, 4);
      expect(mdx).toContain('\\frac{320}{35.8} = 8.9385');
    });

    it('gives a panel interval that straddles the clinical threshold', () => {
      const ci = poissonCI(11, 0.95);
      expect(ci.lower).toBeCloseTo(5.49, 2);
      expect(ci.upper).toBeCloseTo(19.68, 2);
      const lo = tumourMutationalBurden(ci.lower, 1.1);
      const hi = tumourMutationalBurden(ci.upper, 1.1);
      expect(lo).toBeCloseTo(4.99, 2);
      expect(hi).toBeCloseTo(17.89, 2);
      expect(lo).toBeLessThan(10);
      expect(hi).toBeGreaterThan(10);
      expect(mdx).toContain('[5.49,\\; 19.68]');
      expect(mdx).toContain('[4.99,\\; 17.89]');
    });

    it('has the panel point estimate land on the far side of the threshold', () => {
      expect(tumourMutationalBurden(11, 1.1)).toBeCloseTo(10, 12);
    });
  });

  describe('exercise 1 — low purity is not subclonality', () => {
    it('is clonal at 0.9048 despite a VAF of 0.19', () => {
      expect(cancerCellFraction(0.19, 0.42)).toBeCloseTo(0.9048, 4);
      expect(mdx).toContain('\\frac{2 \\times 0.19}{0.42} = 0.9048');
    });

    it('matches the worked example on CCF while differing on VAF', () => {
      // the same clonal variant reads as 0.19 here and ~0.31 at 68% purity
      expect(cancerCellFraction(0.19, 0.42)).toBeCloseTo(cancerCellFraction(0.31, 0.68), 1);
    });
  });

  describe('exercise 3 — how much panel would TMB need', () => {
    it('needs a 9.60 Mb footprint for a 20% half-width', () => {
      const lambda = (1.96 / 0.2) ** 2;
      expect(lambda).toBeCloseTo(96.04, 2);
      expect(lambda / 10).toBeCloseTo(9.6, 2);
      expect(mdx).toContain('\\right)^2 = 96.04');
      expect(mdx).toContain('9.60');
    });

    it('leaves a 1.1 Mb panel at a 59% half-width', () => {
      expect((1.96 / Math.sqrt(11)) * 100).toBeCloseTo(59, 0);
      expect(mdx).toContain('1.96/\\sqrt{11} = 59\\%');
    });
  });
});
