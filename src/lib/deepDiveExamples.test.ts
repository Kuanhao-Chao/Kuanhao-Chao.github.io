import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  acmgClassify, acmgPosterior, expectedR2, falconerACE, ldHalfLife, ldMeasures,
  liabilityScale, normalPdf, normalQuantile, oeUpperBound, poissonCI,
  sampleSizeForR2, shrinkageFactor, wilsonInterval,
  cdsLength, cdsPosition, codonOf, complementBase, phylopToP, type Exon,
  likelihoodRatioPositive, oddsPathFor, oddsPathPoints, oddsPathStrength,
  cancerCellFraction, tumourMutationalBurden,
  topKRecall, rmse, spearman,
  auroc, auprc, auprcBaseline,
  colocPosteriors,
  fisherExactP, foldEnrichment,
  ivwMeta, winnersCurseExpectation, zThreshold, normalCdf,
  chi2Quantile, regularizedGammaP, solveLinear, matMul, transpose, contingencyTests,
  hweExpected, hweChiSquare, hweExactP, alleleFrequency, heterozygosityDecay, driftVariance,
  wattersonTheta, tajimaConstants, tajimasD,
  kinshipMatrix, additiveRelationshipMatrix, inbreedingCoefficients,
  lodScore, maxLod, lodToChi2, chi2ToLod, tdtStatistic,
  genotypicMean, averageEffect, breedingValues, additiveVariance, dominanceVariance,
  selectionIntensity, breedersResponse, breedersResponseFromIntensity,
  hendersonMme, blupSolve, grmFromMarkers, predictionAccuracy, matVec, invert,
  correlatedResponse, multivariateResponse,
  lambdaGc, CHI2_1DF_MEDIAN, varianceExplained, ldscRegression,
  betaWeight, burdenStatistic, skatQ, skatOQ,
  wakefieldAbf, pipsFromAbf, credibleSet, csPurity,
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

describe('statgen-mathematical-foundations', () => {
  const mdx = lesson('statgen-mathematical-foundations');
  const chi2Tail = (x: number) => 1 - regularizedGammaP(0.5, x / 2);

  // The binomial log-likelihood the lesson derives the machinery on, written out here
  // rather than imported so the test proves the algebra rather than restating it.
  const loglik = (k: number, n: number, p: number) => k * Math.log(p) + (n - k) * Math.log(1 - p);
  const fisherInfo = (n: number, p: number) => n / (p * (1 - p));
  const binomialTrinity = (k: number, n: number, p0: number) => {
    const ph = k / n;
    return {
      ph,
      wald: (ph - p0) ** 2 * fisherInfo(n, ph),
      score: (ph - p0) ** 2 * fisherInfo(n, p0),
      lrt: 2 * (loglik(k, n, ph) - loglik(k, n, p0)),
    };
  };

  describe('worked example — one 2 x 2 table through all three tests', () => {
    const t = contingencyTests(80, 20, 40, 60);

    it('states the table and its margins', () => {
      for (const s of ['| **cases** | 80 | 20 | 100 |',
                       '| **controls** | 40 | 60 | 100 |',
                       '| **total** | 120 | 80 | 200 |']) {
        expect(mdx).toContain(s);
      }
    });

    it('estimates the log odds ratio in closed form', () => {
      expect(t.oddsRatio).toBeCloseTo(6, 12);
      expect(t.logOddsRatio).toBeCloseTo(1.791759, 6);
      expect(mdx).toContain('\\log 6 = 1.791759');
    });

    it("gives Woolf's standard error and the Wald statistic", () => {
      expect(1 / 80 + 1 / 20 + 1 / 40 + 1 / 60).toBeCloseTo(0.1041667, 7);
      expect(t.seLogOddsRatio).toBeCloseTo(0.322749, 6);
      expect(t.logOddsRatio / t.seLogOddsRatio).toBeCloseTo(5.551564, 6);
      expect(t.wald).toBeCloseTo(30.8199, 4);
      expect(mdx).toContain('\\sqrt{0.1041667} = 0.322749');
      expect(mdx).toContain('5.551564^2 = 30.8199');
    });

    it("gives the score statistic, which is exactly Pearson's chi-square", () => {
      expect(t.expected).toEqual([60, 40, 60, 40]);
      // Pearson computed independently of the module
      const pearson = [[80, 60], [20, 40], [40, 60], [60, 40]]
        .reduce((acc, [o, e]) => acc + (o - e) ** 2 / e, 0);
      expect(pearson).toBeCloseTo(100 / 3, 10);
      expect(t.score).toBeCloseTo(pearson, 10);
      expect(mdx).toContain('E = (60, 40, 60, 40)');
      expect(mdx).toContain('6.666667 + 10 + 6.666667 + 10 = 33.3333');
    });

    it('gives the likelihood ratio, which is exactly the deviance G^2', () => {
      const terms = [[80, 60], [20, 40], [40, 60], [60, 40]].map(([o, e]) => o * Math.log(o / e));
      expect(terms[0]).toBeCloseTo(23.014566, 6);
      expect(terms[1]).toBeCloseTo(-13.862944, 6);
      expect(terms[2]).toBeCloseTo(-16.218604, 6);
      expect(terms[3]).toBeCloseTo(24.327906, 6);
      const half = terms.reduce((a, b) => a + b, 0);
      expect(half).toBeCloseTo(17.260924, 6);
      expect(t.lrt).toBeCloseTo(2 * half, 10);
      expect(t.lrt).toBeCloseTo(34.5218, 4);
      for (const s of ['80(0.287682)', '20(-0.693147)', '40(-0.405465)', '60(0.405465)',
                       '23.014566 - 13.862944 - 16.218604 + 24.327906',
                       '2 \\times 17.260924 = 34.5218']) {
        expect(mdx).toContain(s);
      }
    });

    it('reads all three against chi-square on one degree of freedom', () => {
      expect(chi2Tail(t.lrt)).toBeCloseTo(4.215e-9, 12);
      expect(chi2Tail(t.score)).toBeCloseTo(7.764e-9, 12);
      expect(chi2Tail(t.wald)).toBeCloseTo(2.831e-8, 11);
      for (const s of ['4.215\\times10^{-9}', '7.764\\times10^{-9}', '2.831\\times10^{-8}']) {
        expect(mdx).toContain(s);
      }
    });

    it('spans a factor of 6.7 in p-value, as the lesson claims', () => {
      const ratio = chi2Tail(t.wald) / chi2Tail(t.lrt);
      expect(ratio).toBeCloseTo(6.7, 1);
      // a regex, not toContain: the phrase wraps across a line in the prose
      expect(mdx).toMatch(/a factor\s+of 6\.7/);
    });

    it('orders them LRT > score > Wald here, the reverse of the usual claim', () => {
      expect(t.lrt).toBeGreaterThan(t.score);
      expect(t.score).toBeGreaterThan(t.wald);
      expect(mdx).toContain('This table gives $\\Lambda > S > W$');
    });

    it('separates by 12 percent, the figure caption’s number', () => {
      const spread = t.lrt / t.wald - 1;
      expect(Math.round(spread * 100)).toBe(12);
      expect(mdx).toContain('differ here by 12 percent');
    });
  });

  describe('figure 1 — the three tests as distances on one curve', () => {
    const t = contingencyTests(80, 20, 40, 60);

    it('labels the same three statistics the worked example computes', () => {
      for (const [label, value] of [['LRT = 34.5218', t.lrt],
                                    ['score = 33.3333', t.score],
                                    ['Wald = 30.8199', t.wald]] as const) {
        expect(value).toBeCloseTo(Number(label.split('= ')[1]), 4);
        expect(mdx).toContain(label);
      }
    });

    it('marks the MLE at log 6 = 1.7918', () => {
      expect(t.logOddsRatio).toBeCloseTo(1.7918, 4);
      expect(mdx).toContain('MLE: β = log 6 = 1.7918');
    });
  });

  describe('worked example — solving the normal equations by hand', () => {
    const X = [[1, 1], [1, 2], [1, 3], [1, 4]];
    const y = [2.1, 3.9, 6.2, 7.8];
    const Xt = transpose(X);
    const XtX = matMul(Xt, X);
    const Xty = matMul(Xt, y.map((v) => [v])).map((r) => r[0]);

    it('assembles the cross-products the lesson tabulates', () => {
      expect(XtX).toEqual([[4, 10], [10, 30]]);
      expect(Xty[0]).toBeCloseTo(20.0, 12);
      expect(Xty[1]).toBeCloseTo(59.7, 12);
      expect(mdx).toContain('\\begin{pmatrix} 4 & 10 \\\\ 10 & 30 \\end{pmatrix}');
      expect(mdx).toContain('\\begin{pmatrix} 20.0 \\\\ 59.7 \\end{pmatrix}');
    });

    it('has determinant 20', () => {
      expect(XtX[0][0] * XtX[1][1] - XtX[0][1] * XtX[1][0]).toBe(20);
      expect(mdx).toContain('4(30) - 10(10) = 20');
    });

    it('solves to beta = (0.15, 1.94)', () => {
      const beta = solveLinear(XtX, Xty);
      expect(beta[0]).toBeCloseTo(0.15, 10);
      expect(beta[1]).toBeCloseTo(1.94, 10);
      // Cramer's rule, the route the lesson actually walks
      expect((30 * 20.0 - 10 * 59.7) / 20).toBeCloseTo(0.15, 10);
      expect((4 * 59.7 - 10 * 20.0) / 20).toBeCloseTo(1.94, 10);
      expect(mdx).toContain('\\frac{600 - 597}{20} = 0.15');
      expect(mdx).toContain('\\frac{238.8 - 200}{20} = 1.94');
      expect(mdx).toContain('(0.15,\\, 1.94)');
    });
  });

  describe('the genome-wide threshold, and figure 2', () => {
    const fwer = (m: number, a: number) => 1 - (1 - a) ** m;

    it('is Bonferroni over a million effectively independent tests', () => {
      expect(0.05 / 1e6).toBeCloseTo(5e-8, 20);
      expect(mdx).toContain('5\\times 10^{-8}');
    });

    it('has the chi-square and |z| critical values the lesson quotes', () => {
      const crit = chi2Quantile(1 - 5e-8, 1);
      expect(crit).toBeCloseTo(29.7168, 3);
      expect(Math.sqrt(crit)).toBeCloseTo(5.4513, 3);
      expect(mdx).toContain('29.7168');
      expect(mdx).toContain('|z| = 5.4513');
    });

    it('spends 0.0488 of the 0.05 at a million tests — the figure’s marked point', () => {
      expect(fwer(1e6, 5e-8)).toBeCloseTo(0.048771, 6);
      expect(mdx).toContain('the risk is 0.0488');
      expect(mdx).toContain('still at 0.0488 after a million');
    });

    it('reaches near-certainty by a hundred tests at 0.05, as the caption says', () => {
      expect(fwer(100, 0.05)).toBeGreaterThan(0.99);
      expect(mdx).toContain('near-certainty by a hundred tests');
    });
  });

  describe('exercise 1 — the same three tests, closer to the null', () => {
    it('(a) merges the three for a weak 2 x 2 table', () => {
      const w = contingencyTests(240, 760, 200, 800);
      expect(w.expected).toEqual([220, 780, 220, 780]);
      expect(w.oddsRatio).toBeCloseTo(1.2632, 4);
      expect(w.logOddsRatio).toBeCloseTo(0.233615, 6);
      expect(w.seLogOddsRatio).toBeCloseTo(0.108316, 6);
      expect(w.wald).toBeCloseTo(4.6517, 4);
      expect(w.score).toBeCloseTo(4.6620, 4);
      expect(w.lrt).toBeCloseTo(4.6671, 4);
      expect(chi2Tail(w.score)).toBeCloseTo(0.031, 3);
      for (const s of ['E = (220, 780, 220, 780)', '1.2632', '0.233615', '0.108316',
                       'W = 4.6517, \\qquad S = 4.6620, \\qquad \\Lambda = 4.6671',
                       'p \\approx 0.031']) {
        expect(mdx).toContain(s);
      }
    });

    it('(a) spans 0.3% against 12% in the worked example', () => {
      const w = contingencyTests(240, 760, 200, 800);
      const strong = contingencyTests(80, 20, 40, 60);
      expect((w.lrt / w.wald - 1) * 100).toBeCloseTo(0.3, 1);
      expect(Math.round((strong.lrt / strong.wald - 1) * 100)).toBe(12);
      expect(mdx).toContain('span 0.3% of their own size, against 12%');
    });

    it('(b) recomputes the binomial trinity at k = 20', () => {
      const t = binomialTrinity(20, 50, 0.5);
      expect(fisherInfo(50, 0.4)).toBeCloseTo(208.3333, 4);
      expect(t.wald).toBeCloseTo(2.083333, 6);
      expect(t.score).toBeCloseTo(2.0, 12);
      expect(t.lrt).toBeCloseTo(2.013551, 6);
      for (const s of ['208.3333', '208.3333 = 2.0833', '\\frac{0.01}{0.005} = 2.0000',
                       '= 2.0136']) {
        expect(mdx).toContain(s);
      }
    });

    it('(b) reverses the ordering the 2 x 2 table gave — the point of the exercise', () => {
      const table = contingencyTests(240, 760, 200, 800);
      const binom = binomialTrinity(20, 50, 0.5);
      expect(table.lrt).toBeGreaterThan(table.score);
      expect(table.score).toBeGreaterThan(table.wald);
      expect(binom.wald).toBeGreaterThan(binom.lrt);
      expect(binom.lrt).toBeGreaterThan(binom.score);
      expect(mdx).toContain('Part (a) gives $\\Lambda > S > W$; part (b) gives $W > \\Lambda > S$');
    });
  });

  describe('exercise 2 — thresholds for two study designs', () => {
    it('gives the exome-wide threshold and its critical value', () => {
      expect(0.05 / 20000).toBeCloseTo(2.5e-6, 18);
      expect(chi2Quantile(1 - 0.05 / 20000, 1)).toBeCloseTo(22.1665, 3);
      expect(mdx).toContain('2.50\\times10^{-6}');
      expect(mdx).toContain('22.1665');
    });

    it('is fifty times looser than genome-wide, as the solution says', () => {
      expect((0.05 / 20000) / (0.05 / 1e6)).toBeCloseTo(50, 10);
      expect(mdx).toContain('fifty times looser');
    });

    it('holds family-wise error at 0.001 if the genome-wide value is used instead', () => {
      expect(5e-8 * 20000).toBeCloseTo(1e-3, 12);
      expect(mdx).toContain('0.001 rather than');
    });
  });

  describe('exercise 3 — a variance component at the boundary', () => {
    const LAMBDA = 2.7055;

    it('gives 0.1000 naively and 0.0500 under the Self-Liang mixture', () => {
      expect(chi2Tail(LAMBDA)).toBeCloseTo(0.1, 4);
      expect(0.5 * chi2Tail(LAMBDA)).toBeCloseTo(0.05, 4);
      expect(mdx).toContain('p = 0.1000');
      expect(mdx).toContain('0.1000 = 0.0500');
    });

    it('makes 2.7055 the 90th percentile of chi-square, not the 95th', () => {
      expect(chi2Quantile(0.9, 1)).toBeCloseTo(2.7055, 4);
      expect(chi2Quantile(0.95, 1)).toBeCloseTo(3.8415, 4);
      expect(mdx).toContain('2.7055, not 3.8415');
      expect(mdx).toContain('rather than the 95th percentile, 3.8415');
    });

    it('errs conservatively — the naive p-value is the larger one', () => {
      expect(chi2Tail(LAMBDA)).toBeGreaterThan(0.5 * chi2Tail(LAMBDA));
      expect(mdx).toContain('is *larger* than the correct one');
    });
  });
});

describe('statgen-population-infinitesimal', () => {
  const mdx = lesson('statgen-population-infinitesimal');
  const chi2Tail = (x: number) => 1 - regularizedGammaP(0.5, x / 2);
  const COMMON = { AA: 298, Aa: 489, aa: 213 };
  const RARE = { AA: 940, Aa: 56, aa: 4 };

  describe('worked example — the same test on a common and a rare variant', () => {
    it('has the allele frequencies the lesson states', () => {
      expect(alleleFrequency(COMMON)).toBeCloseTo(0.4575, 6);
      expect(alleleFrequency(RARE)).toBeCloseTo(0.032, 6);
      expect(mdx).toContain('(2 \\times 213 + 489)/2000 = 0.4575');
      expect(mdx).toContain('(2 \\times 4 + 56)/2000 = 0.0320');
    });

    it('expects the counts the lesson tabulates', () => {
      const a = hweExpected(COMMON);
      expect(a.AA).toBeCloseTo(294.306, 3);
      expect(a.Aa).toBeCloseTo(496.388, 3);
      expect(a.aa).toBeCloseTo(209.306, 3);
      const b = hweExpected(RARE);
      expect(b.AA).toBeCloseTo(937.024, 3);
      expect(b.Aa).toBeCloseTo(61.952, 3);
      expect(b.aa).toBeCloseTo(1.024, 3);
      expect(mdx).toContain('(294.306,\\; 496.388,\\; 209.306)');
      expect(mdx).toContain('(937.024,\\; 61.952,\\; 1.024)');
    });

    it('agrees between the two tests for the common variant', () => {
      const x = hweChiSquare(COMMON);
      expect(x).toBeCloseTo(0.2215, 4);
      expect(chi2Tail(x)).toBeCloseTo(0.6379, 4);
      expect(hweExactP(COMMON)).toBeCloseTo(0.6557, 4);
      expect(mdx).toContain('= 0.2215');
      expect(mdx).toContain('p = 0.6379');
      expect(mdx).toContain('p = 0.6557');
    });

    it('disagrees 6.6-fold for the rare one, with chi-square the smaller', () => {
      const x = hweChiSquare(RARE);
      expect(x).toBeCloseTo(9.2303, 4);
      const chiP = chi2Tail(x);
      const exactP = hweExactP(RARE);
      expect(chiP).toBeCloseTo(2.38e-3, 5);
      expect(exactP).toBeCloseTo(1.568e-2, 5);
      expect(exactP / chiP).toBeCloseTo(6.6, 1);
      expect(chiP).toBeLessThan(exactP);          // the anti-conservative direction
      expect(mdx).toContain('= 9.2303');
      expect(mdx).toContain('p = 2.380\\times10^{-3}');
      expect(mdx).toContain('p = 1.568\\times10^{-2}');
      expect(mdx).toContain('6.6 times larger');
    });

    it('blames the discrepancy on the minor-homozygote cell', () => {
      const e = hweExpected(RARE);
      const third = (RARE.aa - e.aa) ** 2 / e.aa;
      expect(third).toBeCloseTo(8.65, 2);
      expect(third / hweChiSquare(RARE)).toBeGreaterThan(0.93);
      expect(mdx).toContain('(4-1.024)^2/1.024 = 8.65');
    });
  });

  describe('figure 1 — Hardy–Weinberg proportions', () => {
    it('marks the worked example at q = 0.032 with 1.02 expected minor homozygotes', () => {
      expect(0.032 ** 2).toBeCloseTo(0.001024, 9);
      expect(1000 * 0.032 ** 2).toBeCloseTo(1.024, 6);
      expect(mdx).toContain('q² = 0.001024');
      expect(mdx).toContain('1.02 minor homozygotes');
    });

    it('marks the heterozygote maximum at 0.5', () => {
      // 2q(1-q) is maximised at q = 1/2, where it equals 1/2
      for (const q of [0.1, 0.25, 0.4, 0.49]) expect(2 * q * (1 - q)).toBeLessThan(0.5);
      expect(2 * 0.5 * 0.5).toBeCloseTo(0.5, 12);
      expect(mdx).toContain('heterozygosity peaks');
    });
  });

  describe('worked example — how fast does a population forget?', () => {
    const NE = 10000;

    it('retains 95.1% of heterozygosity after 1,000 generations', () => {
      expect(heterozygosityDecay(0.5, NE, 1000) / 0.5).toBeCloseTo(0.951228, 6);
      expect(mdx).toContain('= 0.951228');
      expect(mdx).toContain('**95.1%**');
    });

    it('has a half-life of 13,862.6 generations, matching 2·Nₑ·log 2', () => {
      const halfLife = Math.log(0.5) / Math.log(1 - 1 / (2 * NE));
      expect(halfLife).toBeCloseTo(13862.6, 1);
      expect(2 * NE * Math.LN2).toBeCloseTo(13862.9, 1);
      expect(mdx).toContain('13{,}862.6 \\text{ generations}');
      expect(mdx).toContain('2N_e \\log 2 = 13{,}862.9');
    });

    it('spreads the frequency by 0.11042', () => {
      expect(Math.sqrt(driftVariance(0.5, NE, 1000))).toBeCloseTo(0.11042, 5);
      expect(mdx).toContain('= 0.11042');
    });
  });

  describe('figure 2 — coalescent waiting times', () => {
    const NE = 10000;
    const N = 20;
    const times = Array.from({ length: N - 1 }, (_, i) => {
      const k = N - i;
      return (4 * NE) / (k * (k - 1));
    });
    const total = times.reduce((a, b) => a + b, 0);

    it('waits 20,000 generations for the last join', () => {
      expect((4 * NE) / (2 * 1)).toBe(20000);
      expect(mdx).toContain('20,000 generations');
    });

    it('spends 53% of the tree depth on that one join', () => {
      expect((20000 / total) * 100).toBeCloseTo(52.63, 2);
      expect(Math.round((20000 / total) * 100)).toBe(53);
      expect(mdx).toContain('53 percent of the whole tree depth');
      expect(mdx).toContain('53% of the depth');
    });

    it('totals 4Nₑ(1 − 1/n) = 38,000 generations', () => {
      expect(total).toBeCloseTo(38000, 6);
      expect(4 * NE * (1 - 1 / N)).toBeCloseTo(38000, 6);
      expect(mdx).toContain('38,000 generations');
      expect(mdx).toContain('4Nₑ = 40,000');
    });

    it('gains almost nothing in depth from a thousand-fold larger sample', () => {
      expect(1 - 1 / 20).toBeCloseTo(0.95, 10);
      expect(1 - 1 / 20000).toBeCloseTo(0.99995, 10);
      expect(mdx).toContain('0.95 \\times 4N_e');
      expect(mdx).toContain('0.99995 \\times 4N_e');
    });
  });

  describe("worked example — Tajima's D for a sequenced locus", () => {
    const n = 50;
    const S = 120;
    const PI = 15.5;

    it('has the harmonic number and Watterson estimate the lesson prints', () => {
      const a1 = Array.from({ length: n - 1 }, (_, i) => 1 / (i + 1)).reduce((a, b) => a + b, 0);
      expect(a1).toBeCloseTo(4.479205, 6);
      expect(tajimaConstants(n).a1).toBeCloseTo(a1, 12);
      expect(wattersonTheta(S, n)).toBeCloseTo(26.790466, 6);
      expect(mdx).toContain('= 4.479205');
      expect(mdx).toContain('\\frac{120}{4.479205} = 26.790466');
    });

    it('has the difference and the two variance constants', () => {
      expect(PI - wattersonTheta(S, n)).toBeCloseTo(-11.290466, 6);
      const c = tajimaConstants(n);
      expect(c.e1).toBeCloseTo(0.027613, 6);
      expect(c.e2).toBeCloseTo(0.003705, 6);
      expect(mdx).toContain('15.5 - 26.790466 = -11.290466');
      expect(mdx).toContain('e_1 = 0.027613');
      expect(mdx).toContain('e_2 = 0.003705');
    });

    it('gives D = -1.505723, a clear excess of rare variants', () => {
      expect(tajimasD(S, PI, n)).toBeCloseTo(-1.505723, 6);
      expect(tajimasD(S, PI, n)).toBeLessThan(0);
      expect(mdx).toContain('= -1.505723');
    });

    it('is zero when the two estimators agree', () => {
      expect(tajimasD(S, wattersonTheta(S, n), n)).toBeCloseTo(0, 12);
    });
  });

  describe('exercise 1 — a variant that fails quality control', () => {
    const G = { AA: 1470, Aa: 24, aa: 6 };

    it('expects the counts and gives the chi-square the solution states', () => {
      expect(alleleFrequency(G)).toBeCloseTo(0.012, 6);
      const e = hweExpected(G);
      expect(e.AA).toBeCloseTo(1464.216, 3);
      expect(e.Aa).toBeCloseTo(35.568, 3);
      expect(e.aa).toBeCloseTo(0.216, 3);
      expect(hweChiSquare(G)).toBeCloseTo(158.6678, 4);
      expect(hweExactP(G)).toBeCloseTo(1.668e-8, 11);
      expect(mdx).toContain('(2 \\times 6 + 24)/3000 = 0.0120');
      expect(mdx).toContain('(1464.216,\\; 35.568,\\; 0.216)');
      expect(mdx).toContain('= 158.6678');
      expect(mdx).toContain('p = 1.668\\times10^{-8}');
    });

    it('has the excess and deficit the solution quotes', () => {
      const e = hweExpected(G);
      expect(G.aa / e.aa).toBeCloseTo(27.78, 2);
      expect(Math.round(G.aa / e.aa)).toBe(28);
      expect(((e.Aa - G.Aa) / e.Aa) * 100).toBeCloseTo(32.52, 2);
      expect(Math.round(((e.Aa - G.Aa) / e.Aa) * 100)).toBe(33);
      expect(mdx).toContain('28 times more minor');
      expect(mdx).toContain('33% too few heterozygotes');
    });

    it('is dominated by the third term, worth 154.9 of 158.7', () => {
      const e = hweExpected(G);
      const third = (G.aa - e.aa) ** 2 / e.aa;
      expect(third).toBeCloseTo(154.9, 1);
      expect(mdx).toContain('worth 154.9 on');
    });
  });

  describe('exercise 2 — how long does variation last?', () => {
    const halfLife = (ne: number) => Math.log(0.5) / Math.log(1 - 1 / (2 * ne));
    const lose10 = (ne: number) => Math.log(0.9) / Math.log(1 - 1 / (2 * ne));

    it('tabulates both half-lives against the 2·Nₑ·log 2 approximation', () => {
      expect(halfLife(500)).toBeCloseTo(692.8, 1);
      expect(2 * 500 * Math.LN2).toBeCloseTo(693.1, 1);
      expect(halfLife(10000)).toBeCloseTo(13862.6, 1);
      expect(2 * 10000 * Math.LN2).toBeCloseTo(13862.9, 1);
      for (const v of ['| 500 | 692.8 | 693.1 |', '| 10,000 | 13,862.6 | 13,862.9 |']) {
        expect(mdx).toContain(v);
      }
    });

    it('loses the first 10% in 105.3 and 2,107.2 generations', () => {
      expect(lose10(500)).toBeCloseTo(105.3, 1);
      expect(lose10(10000)).toBeCloseTo(2107.2, 1);
      expect(mdx).toContain('105.3 generations');
      expect(mdx).toContain('2,107.2 generations');
    });

    it('notes that the first 10% costs 15% of the half-life, not 10%', () => {
      expect((lose10(500) / halfLife(500)) * 100).toBeCloseTo(15.2, 1);
      expect(mdx).toContain('15% of the half-life');
    });

    it('inverts 100 generations of 10% loss to Nₑ ≈ 475', () => {
      const ne = 1 / (2 * (1 - Math.exp(Math.log(0.9) / 100)));
      expect(ne).toBeCloseTo(474.8, 1);
      expect(Math.round(ne)).toBe(475);
      expect(mdx).toContain('N_e \\approx 475');
    });
  });

  describe('exercise 3 — reading two loci with the same S', () => {
    const n = 20;
    const S = 45;

    it('shares a harmonic number and Watterson estimate between the loci', () => {
      expect(tajimaConstants(n).a1).toBeCloseTo(3.54774, 5);
      expect(wattersonTheta(S, n)).toBeCloseTo(12.684133, 6);
      expect(mdx).toContain('= 3.547740');
      expect(mdx).toContain('\\frac{45}{3.547740} = 12.684133');
    });

    it('shares the denominator, which the solution gives as 3.1661', () => {
      const c = tajimaConstants(n);
      expect(c.e1).toBeCloseTo(0.024396, 6);
      expect(c.e2).toBeCloseTo(0.004508, 6);
      const denom = (8.2 - wattersonTheta(S, n)) / tajimasD(S, 8.2, n);
      expect(denom).toBeCloseTo(3.1661, 3);
      expect(mdx).toContain('= 3.1661$ for both loci');
    });

    it('separates a neutral locus from one with an excess of rare variants', () => {
      expect(tajimasD(S, 12.4, n)).toBeCloseTo(-0.089741, 6);
      expect(tajimasD(S, 8.2, n)).toBeCloseTo(-1.416281, 6);
      expect(Math.abs(tajimasD(S, 12.4, n))).toBeLessThan(0.1);
      expect(mdx).toContain('= -0.089741');
      expect(mdx).toContain('= -1.416281');
    });
  });
});

describe('statgen-pedigrees-linkage-qtl', () => {
  const mdx = lesson('statgen-pedigrees-linkage-qtl');
  const chi2Tail = (x: number) => 1 - regularizedGammaP(0.5, x / 2);

  // The pedigree drawn in figure 1: two founders, full sibs P1/P2 who marry in, first
  // cousins C1/C2, and their child X.
  const PEDIGREE = [
    { id: 'G1', sire: null, dam: null },
    { id: 'G2', sire: null, dam: null },
    { id: 'P1', sire: 'G1', dam: 'G2' },
    { id: 'P2', sire: 'G1', dam: 'G2' },
    { id: 'S1', sire: null, dam: null },
    { id: 'S2', sire: null, dam: null },
    { id: 'C1', sire: 'P1', dam: 'S1' },
    { id: 'C2', sire: 'P2', dam: 'S2' },
    { id: 'X', sire: 'C1', dam: 'C2' },
  ];

  describe('worked example — kinship through a first-cousin mating', () => {
    const { ids, f } = kinshipMatrix(PEDIGREE);
    const kin = (a: string, b: string) => f[ids.indexOf(a)][ids.indexOf(b)];

    it('makes the full sibs a quarter', () => {
      expect(kin('P1', 'P2')).toBeCloseTo(0.25, 12);
      // a regex, not toContain: the assertion needs the line break after the fraction
      expect(mdx).toMatch(/= .tfrac\{1\}\{4\}\s*\n\$\$/);
    });

    it('makes the first cousins one sixteenth', () => {
      expect(kin('C1', 'C2')).toBeCloseTo(1 / 16, 12);
      expect(kin('C1', 'C2')).toBeCloseTo(0.0625, 12);
      expect(mdx).toContain('= \\tfrac{1}{16} = 0.0625');
    });

    it("makes X's inbreeding coefficient its parents' kinship", () => {
      const F = inbreedingCoefficients(PEDIGREE);
      expect(F.get('X')).toBeCloseTo(0.0625, 12);
      expect(F.get('X')).toBeCloseTo(kin('C1', 'C2'), 12);
      expect(kin('X', 'X')).toBeCloseTo(0.53125, 12);
      expect(0.5 * (1 + 0.0625)).toBeCloseTo(0.53125, 12);
      expect(mdx).toContain('F_X = f(\\text{C1}, \\text{C2}) = 0.0625');
      expect(mdx).toContain('\\tfrac{1}{2}(1 + 0.0625) = 0.53125');
    });

    it('doubles into the relationship matrix, with A_XX above one', () => {
      const { ids: aIds, A } = additiveRelationshipMatrix(PEDIGREE);
      const a = (x: string, y: string) => A[aIds.indexOf(x)][aIds.indexOf(y)];
      expect(a('C1', 'C2')).toBeCloseTo(0.125, 12);
      expect(a('X', 'X')).toBeCloseTo(1.0625, 12);
      expect(a('X', 'X')).toBeGreaterThan(1);
      expect(mdx).toContain('2 f(\\text{C1},\\text{C2}) = 0.125');
      expect(mdx).toContain('1 + F_X = 1.0625');
    });

    it('has every founder unrelated, as step 1 asserts', () => {
      for (const a of ['G1', 'G2', 'S1', 'S2']) {
        expect(kin(a, a)).toBeCloseTo(0.5, 12);
        for (const b of ['G1', 'G2', 'S1', 'S2']) {
          if (a !== b) expect(kin(a, b)).toBeCloseTo(0, 12);
        }
      }
    });
  });

  describe('worked example — a LOD score from twenty-five meioses', () => {
    const R = 3;
    const N = 25;
    const best = maxLod(R, N);

    it('estimates theta as r/n = 0.12', () => {
      expect(best.theta).toBeCloseTo(0.12, 10);
      expect(R / N).toBeCloseTo(0.12, 12);
      expect(mdx).toContain('3/25 = 0.12');
    });

    it('has the three terms and the LOD the lesson prints', () => {
      expect(3 * Math.log10(0.12)).toBeCloseTo(-2.762456, 6);
      expect(22 * Math.log10(0.88)).toBeCloseTo(-1.221381, 6);
      expect(25 * Math.log10(2)).toBeCloseTo(7.52575, 5);
      expect(best.lod).toBeCloseTo(3.5419124, 6);
      expect(lodScore(R, N, 0.12)).toBeCloseTo(best.lod, 12);
      expect(mdx).toContain('-2.762456 - 1.221381 + 7.525750 = 3.5419');
    });

    it('converts to chi-square on 1 df', () => {
      expect(2 * Math.log(10)).toBeCloseTo(4.60517, 5);
      expect(lodToChi2(best.lod)).toBeCloseTo(16.3111, 4);
      expect(chi2Tail(lodToChi2(best.lod))).toBeCloseTo(5.375e-5, 8);
      expect(mdx).toContain('4.60517 \\times 3.5419 = 16.3111');
      expect(mdx).toContain('5.375\\times10^{-5}');
    });

    it('has the one-LOD support interval the lesson quotes', () => {
      const target = best.lod - 1;
      const cross = (lo: number, hi: number) => {
        for (let i = 0; i < 200; i++) {
          const m = (lo + hi) / 2;
          if (lodScore(R, N, m) < target) lo = m;
          else hi = m;
        }
        return (lo + hi) / 2;
      };
      expect(cross(1e-9, 0.12)).toBeCloseTo(0.0266, 4);
      expect(cross(0.5, 0.12)).toBeCloseTo(0.3008, 4);
      expect(mdx).toContain('\\theta = 0.0266$ and $\\theta = 0.3008$');
    });

    it('is zero at free recombination, by construction', () => {
      expect(lodScore(R, N, 0.5)).toBeCloseTo(0, 12);
    });
  });

  describe('figure 2 and the meaning of LOD 3', () => {
    it('is chi-square 13.8155 and p = 2.0e-4, not 0.001', () => {
      expect(lodToChi2(3)).toBeCloseTo(13.8155, 4);
      expect(chi2Tail(lodToChi2(3))).toBeCloseTo(2.017e-4, 7);
      expect(chi2Tail(lodToChi2(3))).toBeLessThan(1e-3);
      expect(mdx).toContain('2\\ln(10)\\times 3 = 13.8155');
      expect(mdx).toContain('2.0\\times10^{-4}');
    });

    it('puts the genome-wide association threshold at LOD 6.4529', () => {
      expect(chi2ToLod(chi2Quantile(1 - 5e-8, 1))).toBeCloseTo(6.4529, 3);
      expect(lodToChi2(3.3)).toBeCloseTo(15.1971, 3);
      expect(mdx).toContain('\\chi^2 = 29.7168$, or a LOD of 6.4529');
      expect(mdx).toContain('**LOD 3.3**');
    });

    it('crosses LOD 3 where the figure caption says', () => {
      const cross = (lo: number, hi: number) => {
        for (let i = 0; i < 200; i++) {
          const m = (lo + hi) / 2;
          if (lodScore(3, 25, m) < 3) lo = m;
          else hi = m;
        }
        return (lo + hi) / 2;
      };
      expect(cross(1e-9, 0.12)).toBeCloseTo(0.0427, 4);
      expect(cross(0.5, 0.12)).toBeCloseTo(0.2461, 4);
      expect(mdx).toContain('θ = 0.04 to 0.25');
    });
  });

  describe('worked example — a transmission disequilibrium test', () => {
    it('gives 441/55 = 8.018182', () => {
      expect(tdtStatistic(38, 17)).toBeCloseTo(8.018182, 6);
      expect((38 - 17) ** 2 / (38 + 17)).toBeCloseTo(8.018182, 6);
      expect(chi2Tail(tdtStatistic(38, 17))).toBeCloseTo(4.631e-3, 6);
      expect(mdx).toContain('\\frac{441}{55} = 8.018182');
      expect(mdx).toContain('4.631\\times10^{-3}');
    });

    it('is zero when transmissions balance', () => {
      expect(tdtStatistic(25, 25)).toBeCloseTo(0, 12);
    });
  });

  describe('exercise 1 — kinship for three relationships', () => {
    const PED2 = [
      { id: 'A', sire: null, dam: null },
      { id: 'B', sire: null, dam: null },
      { id: 'C', sire: null, dam: null },
      { id: 'HS1', sire: 'A', dam: 'B' },
      { id: 'HS2', sire: 'A', dam: 'C' },
      { id: 'D', sire: null, dam: null },
      { id: 'N', sire: 'HS1', dam: 'D' },
    ];
    const { ids, f } = kinshipMatrix(PED2);
    const kin = (a: string, b: string) => f[ids.indexOf(a)][ids.indexOf(b)];

    it('makes half sibs one eighth and uncle-niece one sixteenth', () => {
      expect(kin('HS1', 'HS2')).toBeCloseTo(1 / 8, 12);
      expect(kin('HS2', 'N')).toBeCloseTo(1 / 16, 12);
      expect(mdx).toContain('\\tfrac{1}{8} = 0.125');
      expect(mdx).toContain('\\tfrac{1}{2}\\times\\tfrac{1}{8} = \\tfrac{1}{16} = 0.0625');
    });

    it('gives uncle-niece the same coefficient as first cousins', () => {
      // the point of the exercise: distinct relationships share a coefficient
      const cousins = kinshipMatrix(PEDIGREE);
      const cousinF =
        cousins.f[cousins.ids.indexOf('C1')][cousins.ids.indexOf('C2')];
      expect(kin('HS2', 'N')).toBeCloseTo(cousinF, 12);
      expect(mdx).toContain('identical to the first-cousin kinship');
    });

    it('doubles to 0.25 and 0.125 in A', () => {
      const { ids: aIds, A } = additiveRelationshipMatrix(PED2);
      expect(A[aIds.indexOf('HS1')][aIds.indexOf('HS2')]).toBeCloseTo(0.25, 12);
      expect(A[aIds.indexOf('HS2')][aIds.indexOf('N')]).toBeCloseTo(0.125, 12);
      expect(mdx).toContain('these are 0.25 and 0.125');
    });
  });

  describe('exercise 2 — the smallest study that reaches LOD 3', () => {
    it('gives Z(0) = n log10 2 with no recombinants', () => {
      expect(lodScore(0, 10, 1e-12)).toBeCloseTo(10 * Math.log10(2), 6);
      expect(10 * Math.log10(2)).toBeCloseTo(3.0103, 4);
      expect(mdx).toContain('n\\log_{10} 2');
      expect(mdx).toContain('10\\log_{10}2 = 3.010300');
    });

    it('needs ten meioses, since 3/log10(2) = 9.97', () => {
      expect(3 / Math.log10(2)).toBeCloseTo(9.9658, 4);
      expect(Math.ceil(3 / Math.log10(2))).toBe(10);
      expect(mdx).toContain('3/0.301030 = 9.97');
      expect(mdx).toContain('**ten meioses**');
    });

    it('has a one-sided support interval reaching 0.2057', () => {
      const target = 10 * Math.log10(2) - 1;
      let lo = 0;
      let hi = 0.5;
      for (let i = 0; i < 200; i++) {
        const m = (lo + hi) / 2;
        if (lodScore(0, 10, m) > target) lo = m;
        else hi = m;
      }
      expect(lo).toBeCloseTo(0.2057, 4);
      expect(mdx).toContain('\\theta = 0.2057');
    });

    it('is still compatible with theta = 0.10, under half a LOD down', () => {
      expect(10 * Math.log10(2) - lodScore(0, 10, 0.1)).toBeCloseTo(0.4576, 4);
      expect(mdx).toContain('\\theta = 0.10');
    });
  });

  describe('exercise 3 — when the case-control test and the TDT disagree', () => {
    it('gives a TDT of exactly zero', () => {
      expect(tdtStatistic(25, 25)).toBe(0);
      expect(chi2Tail(0)).toBeCloseTo(1, 12);
      expect(mdx).toContain('(25-25)^2/50 = 0$, $p = 1$');
    });

    it('counts 165 genotypes for 55 trios, as the lesson says twice', () => {
      expect(55 * 3).toBe(165);
      expect(mdx).toContain('165 genotypes');
    });
  });
});

describe('statgen-quantitative-genetics-selection', () => {
  const mdx = lesson('statgen-quantitative-genetics-selection');
  const LOCUS = { p: 0.6, a: 10, d: 4 };
  const Q = 1 - LOCUS.p;
  const FREQ = { AA: LOCUS.p ** 2, Aa: 2 * LOCUS.p * Q, aa: Q ** 2 };
  const GVAL = { AA: LOCUS.a, Aa: LOCUS.d, aa: -LOCUS.a };
  const KEYS = ['AA', 'Aa', 'aa'] as const;

  describe('worked example — decomposing one locus by hand', () => {
    it('has the population mean the lesson states', () => {
      expect(genotypicMean(LOCUS)).toBeCloseTo(3.92, 12);
      expect(10 * (0.6 - 0.4) + 2 * 0.6 * 0.4 * 4).toBeCloseTo(3.92, 12);
      expect(mdx).toContain('2 + 1.92 = 3.92');
    });

    it('has an average effect smaller than a, because A is the commoner allele', () => {
      expect(averageEffect(LOCUS)).toBeCloseTo(9.2, 12);
      expect(averageEffect(LOCUS)).toBeLessThan(LOCUS.a);
      expect(mdx).toContain('10 - 0.8 = 9.20');
    });

    it('is the slope of genotypic value regressed on allele count', () => {
      // computed here from the definition, not from the module
      const x = { AA: 2, Aa: 1, aa: 0 };
      const meanX = 2 * LOCUS.p;
      const meanG = genotypicMean(LOCUS);
      const cov = KEYS.reduce((s2, k) => s2 + FREQ[k] * (x[k] - meanX) * (GVAL[k] - meanG), 0);
      const varX = 2 * LOCUS.p * Q;
      expect(cov / varX).toBeCloseTo(averageEffect(LOCUS), 10);
      expect(cov / varX).toBeCloseTo(9.2, 10);
    });

    it('has the three breeding values, which average to zero', () => {
      const bv = breedingValues(LOCUS);
      expect(bv.AA).toBeCloseTo(7.36, 10);
      expect(bv.Aa).toBeCloseTo(-1.84, 10);
      expect(bv.aa).toBeCloseTo(-11.04, 10);
      expect(KEYS.reduce((s2, k) => s2 + FREQ[k] * bv[k], 0)).toBeCloseTo(0, 12);
      expect(mdx).toContain('2(0.4)(9.2) = 7.36');
      expect(mdx).toContain('(0.4-0.6)(9.2) = -1.84');
      expect(mdx).toContain('-2(0.6)(9.2) = -11.04');
      expect(mdx).toContain('0.36(7.36) + 0.48(-1.84) + 0.16(-11.04) = 0');
    });

    it('has dominance deviations that also average to zero', () => {
      const bv = breedingValues(LOCUS);
      const M = genotypicMean(LOCUS);
      const dev = Object.fromEntries(KEYS.map((k) => [k, GVAL[k] - (M + bv[k])])) as Record<
        (typeof KEYS)[number],
        number
      >;
      expect(dev.AA).toBeCloseTo(-1.28, 10);
      expect(dev.Aa).toBeCloseTo(1.92, 10);
      expect(dev.aa).toBeCloseTo(-2.88, 10);
      expect(KEYS.reduce((s2, k) => s2 + FREQ[k] * dev[k], 0)).toBeCloseTo(0, 12);
      expect(mdx).toContain('10 - 11.28 = -1.28');
      expect(mdx).toContain('4 - 2.08 = +1.92');
      expect(mdx).toContain('-10 - (-7.12) = -2.88');
    });

    it('has both variances, and V_D agrees computed the long way', () => {
      expect(additiveVariance(LOCUS)).toBeCloseTo(40.6272, 10);
      expect(dominanceVariance(LOCUS)).toBeCloseTo(3.6864, 10);
      expect(0.48 * 84.64).toBeCloseTo(40.6272, 10);
      expect(1.92 ** 2).toBeCloseTo(3.6864, 10);
      // the frequency-weighted mean squared dominance deviation
      const bv = breedingValues(LOCUS);
      const M = genotypicMean(LOCUS);
      const long = KEYS.reduce(
        (s2, k) => s2 + FREQ[k] * (GVAL[k] - (M + bv[k])) ** 2,
        0
      );
      expect(long).toBeCloseTo(dominanceVariance(LOCUS), 10);
      expect(mdx).toContain('0.48 \\times 84.64 = 40.6272');
      expect(mdx).toContain('1.92^2 = 3.6864');
      expect(mdx).toContain('0.16(2.88)^2 = 3.6864');
    });
  });

  describe('figure 2 — the variances belong to the population', () => {
    const va = (p2: number) => additiveVariance({ p: p2, a: 10, d: 4 });
    const vd = (p2: number) => dominanceVariance({ p: p2, a: 10, d: 4 });

    it('vanishes at both fixation points', () => {
      expect(va(0)).toBeCloseTo(0, 12);
      expect(va(1)).toBeCloseTo(0, 12);
    });

    it('peaks away from 0.5 because dominance makes it asymmetric', () => {
      let best = 0;
      let bestP = 0;
      for (let k = 0; k <= 1000; k++) {
        const v = va(k / 1000);
        if (v > best) {
          best = v;
          bestP = k / 1000;
        }
      }
      expect(bestP).toBeCloseTo(0.341, 3);
      expect(bestP).not.toBeCloseTo(0.5, 2);
      expect(mdx).toContain('peaks at p = 0.341');
    });

    it('puts dominance variance at its maximum at p = 0.5', () => {
      for (const p2 of [0.2, 0.35, 0.65, 0.8]) expect(vd(p2)).toBeLessThan(vd(0.5));
    });

    it('marks the worked example at p = 0.6', () => {
      expect(va(0.6)).toBeCloseTo(40.6272, 10);
      expect(vd(0.6)).toBeCloseTo(3.6864, 10);
      expect(mdx).toContain('V_A = 40.6272 and V_D = 3.6864');
    });
  });

  describe('worked example — one generation of truncation selection', () => {
    const SD = 10;
    const H2 = 0.4;
    const i = selectionIntensity(0.1);

    it('has the selection intensity for the top decile', () => {
      expect(i).toBeCloseTo(1.754983, 6);
      expect(mdx).toContain('i = 1.754983');
    });

    it('has the selection differential', () => {
      expect(i * SD).toBeCloseTo(17.549833, 6);
      expect(mdx).toContain('1.754983 \\times 10 = 17.549833');
    });

    it('gives the same response from both forms of the equation', () => {
      const viaH2 = breedersResponse(H2, i * SD);
      const viaIntensity = breedersResponseFromIntensity(H2, i, SD);
      expect(viaH2).toBeCloseTo(7.019933, 6);
      expect(viaIntensity).toBeCloseTo(viaH2, 12);
      const h = Math.sqrt(H2);
      expect(i * h * (h * SD)).toBeCloseTo(viaH2, 10);
      expect(h).toBeCloseTo(0.632456, 6);
      expect(h * SD).toBeCloseTo(6.324555, 6);
      expect(mdx).toContain('0.40 \\times 17.549833 = 7.019933');
      expect(mdx).toContain('1.754983 \\times 0.632456 \\times 6.324555 = 7.019933');
    });

    it('has the intensity table the lesson prints', () => {
      for (const [frac, iv, r] of [
        [0.5, 0.797885, 3.1915],
        [0.2, 1.39981, 5.5992],
        [0.1, 1.754983, 7.0199],
        [0.05, 2.062713, 8.2509],
        [0.01, 2.665214, 10.6609],
      ] as const) {
        expect(selectionIntensity(frac)).toBeCloseTo(iv, 5);
        expect(breedersResponseFromIntensity(H2, selectionIntensity(frac), SD)).toBeCloseTo(r, 3);
      }
      for (const row of [
        '| top 50% | 0.797885 | 3.1915 |',
        '| top 20% | 1.399810 | 5.5992 |',
        '| top 10% | 1.754983 | 7.0199 |',
        '| top 5% | 2.062713 | 8.2509 |',
        '| top 1% | 2.665214 | 10.6609 |',
      ]) {
        expect(mdx).toContain(row);
      }
    });
  });

  describe('exercise 1 — a purely additive locus', () => {
    const L = { p: 0.3, a: 5, d: 0 };

    it('makes alpha equal a exactly', () => {
      expect(averageEffect(L)).toBeCloseTo(5, 12);
      expect(averageEffect(L)).toBeCloseTo(L.a, 12);
      expect(genotypicMean(L)).toBeCloseTo(-2, 12);
      expect(mdx).toContain('\\alpha = a + 0 = 5');
    });

    it('has evenly spaced breeding values and no dominance variance', () => {
      const bv = breedingValues(L);
      expect(bv.AA).toBeCloseTo(7, 12);
      expect(bv.Aa).toBeCloseTo(2, 12);
      expect(bv.aa).toBeCloseTo(-3, 12);
      // one alpha apart, which is what "the fit is perfect" means
      expect(bv.AA - bv.Aa).toBeCloseTo(averageEffect(L), 12);
      expect(bv.Aa - bv.aa).toBeCloseTo(averageEffect(L), 12);
      expect(additiveVariance(L)).toBeCloseTo(10.5, 12);
      expect(dominanceVariance(L)).toBeCloseTo(0, 12);
      expect(mdx).toContain('2(0.7)(5) = 7');
      expect(mdx).toContain('-2(0.3)(5) = -3');
      expect(mdx).toContain('2(0.3)(0.7)(25) = 10.5');
    });
  });

  describe('exercise 2 — three generations of selection', () => {
    it('predicts 21.0598 over three generations', () => {
      const r = breedersResponseFromIntensity(0.4, selectionIntensity(0.1), 10);
      expect(3 * r).toBeCloseTo(21.0598, 4);
      expect(mdx).toContain('3 \\times 7.019933 = 21.059800');
    });

    it('makes the top 1% about 52% faster per generation', () => {
      const r10 = breedersResponseFromIntensity(0.4, selectionIntensity(0.1), 10);
      const r1 = breedersResponseFromIntensity(0.4, selectionIntensity(0.01), 10);
      expect(r1).toBeCloseTo(10.6609, 4);
      expect((r1 / r10 - 1) * 100).toBeCloseTo(51.9, 1);
      expect(mdx).toContain('7.0199 to 10.6609');
      expect(mdx).toContain('about 52% faster');
    });
  });

  describe('exercise 3 — a large-effect locus with no additive variance', () => {
    const L = { p: 0.7, a: 4, d: 10 };

    it('has alpha exactly zero at p = 0.7', () => {
      expect(averageEffect(L)).toBeCloseTo(0, 12);
      expect(0.5 * (1 + 4 / 10)).toBeCloseTo(0.7, 12);
      expect(mdx).toContain('\\frac{1}{2}(1 + 0.4) = 0.70');
    });

    it('has no additive variance but substantial dominance variance', () => {
      expect(additiveVariance(L)).toBeCloseTo(0, 12);
      expect(dominanceVariance(L)).toBeCloseTo(17.64, 10);
      expect(4.2 ** 2).toBeCloseTo(17.64, 10);
      expect(mdx).toContain('4.2^2 = 17.64');
    });

    it('still spans twenty trait units, so it is not a small effect', () => {
      expect(L.a - -L.a).toBe(8);
      expect(L.d - -L.a).toBe(14);
      // heterozygote to lower homozygote plus upper homozygote to heterozygote
      expect(Math.max(L.a, L.d) - -L.a).toBe(14);
      expect(mdx).toContain('this is not a small-effect locus');
    });

    it('is invisible to an additive test, whose slope is alpha', () => {
      expect(averageEffect(L)).toBeCloseTo(0, 12);
      // a regex, not toContain: the phrase wraps across a line in the prose
      expect(mdx).toMatch(/slope \*is\* \$.alpha\$, which\s+is exactly zero here/);
    });
  });
});

describe('statgen-blup-genomic-selection', () => {
  const mdx = lesson('statgen-blup-genomic-selection');

  // Two sires and one dam, none recorded; calves 4 and 5 out of sire A, calf 6 out of B.
  const PED = [
    { id: 'A', sire: null, dam: null },
    { id: 'B', sire: null, dam: null },
    { id: 'D', sire: null, dam: null },
    { id: '4', sire: 'A', dam: 'D' },
    { id: '5', sire: 'A', dam: 'D' },
    { id: '6', sire: 'B', dam: 'D' },
  ];
  const Y = [4.5, 5.1, 2.9];
  const X = [[1], [1], [1]];
  const Z = [
    [0, 0, 0, 1, 0, 0],
    [0, 0, 0, 0, 1, 0],
    [0, 0, 0, 0, 0, 1],
  ];
  const { ids, A } = additiveRelationshipMatrix(PED);
  const Ainv = invert(A);
  const solve = (lambda: number) => hendersonMme(X, Z, Ainv, lambda, Y);

  describe("worked example — Henderson's equations on six animals", () => {
    const sol = solve(2);
    const ebv = (id: string) => sol.random[ids.indexOf(id)];

    it('has the relationships the lesson describes', () => {
      const rel = (a: string, b: string) => A[ids.indexOf(a)][ids.indexOf(b)];
      expect(rel('4', '5')).toBeCloseTo(0.5, 12);   // full sibs
      expect(rel('4', '6')).toBeCloseTo(0.25, 12);  // maternal half sibs
      expect(rel('5', '6')).toBeCloseTo(0.25, 12);
      expect(rel('A', '4')).toBeCloseTo(0.5, 12);
      expect(rel('A', '6')).toBeCloseTo(0, 12);     // sire A unrelated to B's calf
      expect(mdx).toContain('A_{45} = 0.5');
      expect(mdx).toContain('A_{46} = A_{56} = 0.25');
    });

    it('estimates a mean that is not the average of the records', () => {
      expect(sol.fixed[0]).toBeCloseTo(4.129412, 6);
      expect((4.5 + 5.1 + 2.9) / 3).toBeCloseTo(4.166667, 6);
      expect(sol.fixed[0]).not.toBeCloseTo(4.166667, 4);
      expect(mdx).toContain('\\hat\\mu = 4.129412');
      expect(mdx).toContain('4.166667');
    });

    it('gives the six breeding values the table prints', () => {
      expect(ebv('A')).toBeCloseTo(0.223529, 6);
      expect(ebv('B')).toBeCloseTo(-0.223529, 6);
      expect(ebv('D')).toBeCloseTo(0, 10);
      expect(ebv('4')).toBeCloseTo(0.163529, 6);
      expect(ebv('5')).toBeCloseTo(0.283529, 6);
      expect(ebv('6')).toBeCloseTo(-0.335294, 6);
      for (const row of [
        '| sire A | — | — | $+0.223529$ |',
        '| sire B | — | — | $-0.223529$ |',
        '| dam D | — | — | $0.000000$ |',
        '| calf 4 | 4.5 | $+0.370588$ | $+0.163529$ |',
        '| calf 5 | 5.1 | $+0.970588$ | $+0.283529$ |',
        '| calf 6 | 2.9 | $-1.229412$ | $-0.335294$ |',
      ]) {
        expect(mdx).toContain(row);
      }
    });

    it('shrinks every record toward the mean', () => {
      for (const [id, rec] of [['4', 4.5], ['5', 5.1], ['6', 2.9]] as const) {
        const dev = rec - sol.fixed[0];
        expect(Math.abs(ebv(id))).toBeLessThan(Math.abs(dev));
        expect(Math.sign(ebv(id))).toBe(Math.sign(dev));
      }
    });

    it('returns exactly zero for the effect confounded with the mean', () => {
      // dam D is the dam of all three calves, so she contributes identically to every
      // record and cannot be separated from the intercept
      expect(ebv('D')).toBeCloseTo(0, 10);
      for (const lambda of [0.5, 2, 9, 20]) {
        expect(solve(lambda).random[ids.indexOf('D')]).toBeCloseTo(0, 10);
      }
      expect(mdx).toContain('BLUP correctly declines to guess');
    });

    it('ranks the two recordless sires correctly', () => {
      expect(ebv('A')).toBeGreaterThan(0);
      expect(ebv('B')).toBeLessThan(0);
      // A's two calves are both above the estimated mean, B's one is well below
      expect(4.5).toBeGreaterThan(sol.fixed[0]);
      expect(5.1).toBeGreaterThan(sol.fixed[0]);
      expect(2.9).toBeLessThan(sol.fixed[0]);
    });
  });

  describe('lambda is a heritability', () => {
    it('has the three-row table the lesson prints', () => {
      for (const [lambda, h2, mu, sireA, calf5] of [
        [0.5, 0.6667, 4.0875, 0.475, 0.625],
        [2, 0.3333, 4.129412, 0.223529, 0.283529],
        [9, 0.1, 4.155932, 0.064407, 0.080196],
      ] as const) {
        expect(1 / (1 + lambda)).toBeCloseTo(h2, 4);
        const sol = solve(lambda);
        expect(sol.fixed[0]).toBeCloseTo(mu, 5);
        expect(sol.random[ids.indexOf('A')]).toBeCloseTo(sireA, 6);
        expect(sol.random[ids.indexOf('5')]).toBeCloseTo(calf5, 6);
      }
      for (const row of [
        '| 0.5 | 0.6667 | 4.087500 | $+0.475000$ | $+0.625000$ |',
        '| 2 | 0.3333 | 4.129412 | $+0.223529$ | $+0.283529$ |',
        '| 9 | 0.1000 | 4.155932 | $+0.064407$ | $+0.080196$ |',
      ]) {
        expect(mdx).toContain(row);
      }
    });

    it('drifts the estimated mean toward the raw mean as h² falls', () => {
      const raw = (4.5 + 5.1 + 2.9) / 3;
      const d = (lambda: number) => Math.abs(solve(lambda).fixed[0] - raw);
      expect(d(9)).toBeLessThan(d(2));
      expect(d(2)).toBeLessThan(d(0.5));
      expect(mdx).toContain('drifts toward the raw mean');
    });
  });

  describe('worked example — GBLUP is ridge regression on markers', () => {
    const MARKERS = [
      [0, 1, 2, 1, 0, 2],
      [1, 1, 1, 0, 2, 2],
      [2, 0, 0, 1, 1, 1],
      [0, 2, 1, 2, 0, 0],
      [1, 1, 2, 1, 1, 1],
    ];
    const FREQ = [0.4, 0.5, 0.6, 0.5, 0.4, 0.6];
    const ADJ = [0.6, -0.2, -0.9, 0.8, -0.3];
    const LAMBDA = 2;
    const SCALE = FREQ.reduce((s2, p2) => s2 + 2 * p2 * (1 - p2), 0);
    const EXPECTED = [0.294451, -0.244158, -0.474334, 0.423848, 0.000193];

    it('gives the GBLUP solution the lesson prints', () => {
      const u = blupSolve(grmFromMarkers(MARKERS, FREQ), LAMBDA, ADJ);
      u.forEach((v, i) => expect(v).toBeCloseTo(EXPECTED[i], 6));
      expect(mdx).toContain('(0.294451,\\; -0.244158,\\; -0.474334,\\; 0.423848,\\; 0.000193)');
    });

    it('gives the identical answer from ridge regression on marker effects', () => {
      const W = MARKERS.map((row) => row.map((g, j) => g - 2 * FREQ[j]));
      const Wt = transpose(W);
      const WtW = matMul(Wt, W);
      const lamBeta = LAMBDA * SCALE;
      const ridged = WtW.map((row, i) => row.map((v, j) => (i === j ? v + lamBeta : v)));
      const beta = solveLinear(ridged, matVec(Wt, ADJ));
      const uSnp = matVec(W, beta);
      const uG = blupSolve(grmFromMarkers(MARKERS, FREQ), LAMBDA, ADJ);
      const maxDiff = Math.max(...uG.map((v, i) => Math.abs(v - uSnp[i])));
      expect(maxDiff).toBeLessThan(1e-12);
      uSnp.forEach((v, i) => expect(v).toBeCloseTo(EXPECTED[i], 6));
      expect(mdx).toContain('1.1\\times10^{-16}');
    });

    it("uses VanRaden's scaling, the sum of 2p(1-p)", () => {
      expect(SCALE).toBeCloseTo(2.92, 10);
    });
  });

  describe('the singular genomic relationship matrix', () => {
    const MARKERS = [
      [0, 1, 2, 1, 0, 2],
      [1, 1, 1, 0, 2, 2],
      [2, 0, 0, 1, 1, 1],
      [0, 2, 1, 2, 0, 0],
      [1, 1, 2, 1, 1, 1],
    ];
    const sampleFreq = MARKERS[0].map(
      (_, j) => MARKERS.reduce((s2, r) => s2 + r[j], 0) / (2 * MARKERS.length)
    );

    it('has every row summing to zero when centred on sample frequencies', () => {
      const G = grmFromMarkers(MARKERS, sampleFreq);
      for (const row of G) expect(Math.abs(row.reduce((a, b) => a + b, 0))).toBeLessThan(1e-12);
    });

    it('therefore cannot be inverted', () => {
      expect(() => invert(grmFromMarkers(MARKERS, sampleFreq))).toThrow(/singular/i);
      expect(mdx).toContain('singular by construction');
    });

    it('is still usable through the non-inverse form', () => {
      const u = blupSolve(grmFromMarkers(MARKERS, sampleFreq), 2, [0.6, -0.2, -0.9, 0.8, -0.3]);
      expect(u.every((v) => Number.isFinite(v))).toBe(true);
    });
  });

  describe('accuracy and the generation interval', () => {
    it('has the two marked points on the h² = 0.3 curve', () => {
      expect(predictionAccuracy(20000, 0.3, 10000)).toBeCloseTo(0.612372, 6);
      expect(predictionAccuracy(50000, 0.3, 10000)).toBeCloseTo(0.774597, 6);
      expect(predictionAccuracy(20000, 0.3, 10000) ** 2).toBeCloseTo(0.375, 10);
      expect(predictionAccuracy(50000, 0.3, 10000) ** 2).toBeCloseTo(0.6, 10);
      expect(mdx).toContain('r = 0.6124');
      expect(mdx).toContain('0.7746');
    });

    it('inverts to the training sizes exercise 2 tabulates', () => {
      const need = (r: number, h2: number, me: number) => (r ** 2 * me) / (h2 * (1 - r ** 2));
      expect(Math.round(need(0.5, 0.3, 10000))).toBe(11111);
      expect(Math.round(need(0.7, 0.3, 10000))).toBe(32026);
      expect(Math.round(need(0.9, 0.3, 10000))).toBe(142105);
      for (const [r, n] of [[0.5, 11111], [0.7, 32026], [0.9, 142105]] as const) {
        expect(predictionAccuracy(n, 0.3, 10000)).toBeCloseTo(r, 4);
      }
      for (const row of ['| 0.5 | 11,111 |', '| 0.7 | 32,026 |', '| 0.9 | 142,105 |']) {
        expect(mdx).toContain(row);
      }
    });

    it('nearly doubles annual gain by shortening the generation interval', () => {
      expect(0.65 / 2).toBeCloseTo(0.325, 12);
      expect(0.99 / 6).toBeCloseTo(0.165, 12);
      expect(0.325 / 0.165).toBeCloseTo(1.97, 2);
      expect(mdx).toContain('\\frac{0.325}{0.165} = 1.97');
    });
  });

  describe('exercise 1 — shrinkage at three heritabilities', () => {
    it('retains roughly 62%, 29% and 8% of the record deviation', () => {
      for (const [lambda, pct] of [[0.5, 61.73], [2, 29.21], [9, 8.49]] as const) {
        const sol = solve(lambda);
        const frac = (sol.random[ids.indexOf('5')] / (5.1 - sol.fixed[0])) * 100;
        expect(frac).toBeCloseTo(pct, 1);
      }
      expect(mdx).toContain('62%, 29% and 8%');
    });

    it('reduces to h²(y − μ) for a single own record with no relatives', () => {
      // one animal, one record, unrelated to anything
      const solo = [{ id: '1', sire: null, dam: null }];
      const { A: A1 } = additiveRelationshipMatrix(solo);
      const lambda = 2;
      const h2 = 1 / (1 + lambda);
      const u = blupSolve(A1, lambda, [1.0]);
      expect(u[0]).toBeCloseTo(h2 * 1.0, 12);
      expect(mdx).toContain('\\hat u = h^2(y - \\mu)');
    });
  });
});

describe('statgen-multivariate-genetics-gxe', () => {
  const mdx = lesson('statgen-multivariate-genetics-gxe');
  const G = [[40, 20], [20, 30]];
  const P = [[100, 30], [30, 80]];

  describe('worked example — selecting on yield, losing fertility', () => {
    const i = selectionIntensity(0.1);
    const hY = Math.sqrt(0.3);
    const hF = Math.sqrt(0.05);

    it('has the two square roots the lesson prints', () => {
      expect(i).toBeCloseTo(1.754983, 6);
      expect(hY).toBeCloseTo(0.547723, 6);
      expect(hF).toBeCloseTo(0.223607, 6);
      expect(mdx).toContain('\\sqrt{0.30} = 0.547723');
      expect(mdx).toContain('\\sqrt{0.05} = 0.223607');
    });

    it('loses 0.752292 units of fertility per generation', () => {
      const cr = correlatedResponse(i, hY, hF, -0.35, 10);
      expect(cr).toBeCloseTo(-0.752292, 6);
      expect(cr).toBeLessThan(0);
      expect(mdx).toContain('(-0.35) \\times 10 = -0.752292');
    });

    it('is comparable to what direct selection on fertility would gain', () => {
      const direct = breedersResponseFromIntensity(0.05, i, 10);
      expect(direct).toBeCloseTo(0.877492, 6);
      const cr = Math.abs(correlatedResponse(i, hY, hF, -0.35, 10));
      expect(cr / direct).toBeGreaterThan(0.8);
      expect(cr / direct).toBeLessThan(1);
      expect(mdx).toContain('1.754983 \\times 0.05 \\times 10 = 0.877492');
    });

    it('differs by roughly 32 units over twenty generations', () => {
      const cr = correlatedResponse(i, hY, hF, -0.35, 10);
      const direct = breedersResponseFromIntensity(0.05, i, 10);
      expect(20 * (direct - cr)).toBeCloseTo(32.6, 1);
      expect(mdx).toContain('roughly 32');
    });

    it('uses h and not h-squared — one from each trait', () => {
      // the same call with h² substituted would give a different number
      const withH = correlatedResponse(i, hY, hF, -0.35, 10);
      const withH2 = correlatedResponse(i, 0.3, 0.05, -0.35, 10);
      expect(withH).not.toBeCloseTo(withH2, 3);
      // and the single-trait case is the same formula with x = y and r_g = 1
      expect(correlatedResponse(i, hF, hF, 1, 10)).toBeCloseTo(
        breedersResponseFromIntensity(0.05, i, 10), 12
      );
    });
  });

  describe('worked example — direct selection pushes a trait down; it goes up', () => {
    const s2 = [10, 0];
    const beta = solveLinear(P, s2);
    const dz = multivariateResponse(G, P, s2);

    it('has determinant 7100 and the gradient the lesson prints', () => {
      expect(P[0][0] * P[1][1] - P[0][1] * P[1][0]).toBe(7100);
      expect(beta[0]).toBeCloseTo(0.112676, 6);
      expect(beta[1]).toBeCloseTo(-0.042254, 6);
      expect(mdx).toContain('100(80) - 30(30) = 7100');
      expect(mdx).toContain('0.112676');
      expect(mdx).toContain('-0.042254');
    });

    it('has a negative direct selection on trait 2 despite s_2 = 0', () => {
      expect(s2[1]).toBe(0);
      expect(beta[1]).toBeLessThan(0);
    });

    it('gives a response of (3.661972, 0.985915)', () => {
      expect(dz[0]).toBeCloseTo(3.661972, 6);
      expect(dz[1]).toBeCloseTo(0.985915, 6);
      // computed independently as G times beta
      expect(G[1][0] * beta[0] + G[1][1] * beta[1]).toBeCloseTo(dz[1], 10);
      expect(mdx).toContain('3.661972');
      expect(mdx).toContain('0.985915');
    });

    it('reverses the sign: selection down, response up', () => {
      expect(beta[1]).toBeLessThan(0);
      expect(dz[1]).toBeGreaterThan(0);
      expect(mdx).toContain('Selection pushed one way and the trait went the other');
    });

    it('is not parallel to the gradient', () => {
      const cross = beta[0] * dz[1] - beta[1] * dz[0];
      expect(Math.abs(cross)).toBeGreaterThan(0.01);
    });
  });

  describe('figure 1 — g_max and the share of genetic variance', () => {
    // exact 2x2 eigen-decomposition, written out rather than imported
    const tr = G[0][0] + G[1][1];
    const det = G[0][0] * G[1][1] - G[0][1] * G[1][0];
    const disc = Math.sqrt(tr * tr - 4 * det);
    const l1 = (tr + disc) / 2;
    const l2 = (tr - disc) / 2;
    const slope = (l1 - G[0][0]) / G[0][1];

    it('has the two eigenvalues', () => {
      expect(l1).toBeCloseTo(55.615528, 6);
      expect(l2).toBeCloseTo(14.384472, 6);
      expect(l1 + l2).toBeCloseTo(tr, 10);
      expect(l1 * l2).toBeCloseTo(det, 8);
    });

    it('puts g_max at 38.0 degrees carrying 79.5% of the variance', () => {
      expect((Math.atan(slope) * 180) / Math.PI).toBeCloseTo(37.9819, 3);
      expect(l1 / (l1 + l2)).toBeCloseTo(0.794508, 6);
      expect(mdx).toContain('79.5%');
      expect(mdx).toContain('38.0°');
    });

    it('has the response leaning toward g_max, not toward beta', () => {
      const dz = multivariateResponse(G, P, [10, 0]);
      const beta = solveLinear(P, [10, 0]);
      const angle = (v: number[]) => Math.atan2(v[1], v[0]);
      const gmaxAngle = Math.atan(slope);
      expect(Math.abs(angle(dz) - gmaxAngle)).toBeLessThan(Math.abs(angle(beta) - gmaxAngle));
    });
  });

  describe('figure 2 — reaction norms and the cross-environment correlation', () => {
    const NORMS: [number, number][] = [[1.2, 0.3], [0.4, 2.4], [-0.5, 1.4], [-1.1, -0.9]];
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    const A = NORMS.map((n) => n[0]);
    const B = NORMS.map((n) => n[1]);
    const mA = mean(A);
    const mB = mean(B);
    const cov = NORMS.reduce((acc, [a, b]) => acc + (a - mA) * (b - mB), 0) / NORMS.length;
    const sd = (v: number[], m: number) => Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
    const rg = cov / (sd(A, mA) * sd(B, mB));

    it('gives r_g = 0.3739 from the four plotted pairs', () => {
      expect(rg).toBeCloseTo(0.373877, 6);
      expect(mdx).toContain('r_g = 0.3739');
    });

    it('has a genuine rank reversal between the two highlighted genotypes', () => {
      expect(A[0]).toBeGreaterThan(A[1]);   // genotype 0 beats 1 in environment A
      expect(B[0]).toBeLessThan(B[1]);      // and loses to it in environment B
      // and genotype 0 is best in A but only third in B
      expect(A.filter((v) => v > A[0]).length).toBe(0);
      expect(B.filter((v) => v > B[0]).length).toBe(2);
      expect(mdx).toContain('only third in environment B');
    });

    it('falls below the 0.8 rule of thumb', () => {
      expect(rg).toBeLessThan(0.8);
      expect(mdx).toContain('r_g \\approx 0.8');
    });
  });

  describe('exercise 1 — when is indirect selection better?', () => {
    const i = selectionIntensity(0.2);
    const hX = Math.sqrt(0.4);
    const hY = Math.sqrt(0.2);

    it('computes the correlated and direct responses', () => {
      expect(i).toBeCloseTo(1.39981, 5);
      expect(correlatedResponse(i, hX, hY, 0.6, 5)).toBeCloseTo(1.187778, 6);
      expect(breedersResponseFromIntensity(0.2, i, 5)).toBeCloseTo(1.39981, 5);
      expect(mdx).toContain('0.6 \\times 5 = 1.187778');
      expect(mdx).toContain('1.399810 \\times 0.2 \\times 5 = 1.399810');
    });

    it('has a ratio equal to r_g·h_x/h_y exactly', () => {
      const ratio = correlatedResponse(i, hX, hY, 0.6, 5) / breedersResponseFromIntensity(0.2, i, 5);
      expect(ratio).toBeCloseTo(0.848528, 6);
      expect(ratio).toBeCloseTo(0.6 * (hX / hY), 12);
      expect(mdx).toContain('0.848528');
    });

    it('has a break-even correlation of h_y/h_x', () => {
      expect(hY / hX).toBeCloseTo(0.707107, 6);
      // at exactly break-even the two responses coincide
      const rgStar = hY / hX;
      expect(correlatedResponse(i, hX, hY, rgStar, 5)).toBeCloseTo(
        breedersResponseFromIntensity(0.2, i, 5), 10
      );
      expect(mdx).toContain('h_y/h_x = 0.707107');
    });
  });

  describe('exercise 2 — selecting on both traits', () => {
    it('has the three-row table the solution prints', () => {
      for (const [s2, b0, b1, d0, d1] of [
        [[10, 0], 0.112676, -0.042254, 3.661972, 0.985915],
        [[10, 5], 0.091549, 0.028169, 4.225352, 2.676056],
        [[10, -5], 0.133803, -0.112676, 3.098592, -0.704225],
      ] as [number[], number, number, number, number][]) {
        const beta = solveLinear(P, s2);
        const dz = multivariateResponse(G, P, s2);
        expect(beta[0]).toBeCloseTo(b0, 6);
        expect(beta[1]).toBeCloseTo(b1, 6);
        expect(dz[0]).toBeCloseTo(d0, 6);
        expect(dz[1]).toBeCloseTo(d1, 6);
      }
      for (const row of [
        '| $(10, 0)$ | $(0.112676,\\ -0.042254)$ | $(3.661972,\\ 0.985915)$ |',
        '| $(10, 5)$ | $(0.091549,\\ 0.028169)$ | $(4.225352,\\ 2.676056)$ |',
        '| $(10, -5)$ | $(0.133803,\\ -0.112676)$ | $(3.098592,\\ -0.704225)$ |',
      ]) {
        expect(mdx).toContain(row);
      }
    });

    it('needs s_2 = -5 before trait 2 actually declines', () => {
      expect(multivariateResponse(G, P, [10, 0])[1]).toBeGreaterThan(0);
      expect(multivariateResponse(G, P, [10, -5])[1]).toBeLessThan(0);
      // a regex, not toContain: the phrase wraps across a line in the prose
      expect(mdx).toMatch(/is not\s+inevitable/);
    });

    it('costs trait 1 progress to fight the correlation', () => {
      const base = multivariateResponse(G, P, [10, 0])[0];
      const fighting = multivariateResponse(G, P, [10, -5])[0];
      const helping = multivariateResponse(G, P, [10, 5])[0];
      expect(fighting).toBeLessThan(base);
      expect(helping).toBeGreaterThan(base);
      expect(mdx).toContain('falls* in the third row, to 3.098592');
    });
  });

  describe('exercise 3 — one programme or two?', () => {
    const i = selectionIntensity(0.2);
    const hA = Math.sqrt(0.35);
    const hB = Math.sqrt(0.25);
    const RG = 0.373877;

    it('delivers 44% of the direct response', () => {
      expect(hA).toBeCloseTo(0.591608, 6);
      expect(hB).toBeCloseTo(0.5, 12);
      const cr = correlatedResponse(i, hA, hB, RG, 6);
      const direct = breedersResponseFromIntensity(0.25, i, 6);
      expect(cr).toBeCloseTo(0.928866, 6);
      expect(direct).toBeCloseTo(2.099714, 6);
      expect(cr / direct).toBeCloseTo(0.442377, 6);
      expect(cr / direct).toBeCloseTo(RG * (hA / hB), 10);
      expect(mdx).toContain('= 0.928866');
      expect(mdx).toContain('1.399810 \\times 0.25 \\times 6 = 2.099714');
      expect(mdx).toContain('0.442377');
    });

    it('sits far below the 0.8 threshold', () => {
      expect(RG).toBeLessThan(0.8);
      expect(mdx).toContain('**44%**');
    });
  });
});

describe('statgen-association-linear-mixed-models', () => {
  const mdx = lesson('statgen-association-linear-mixed-models');
  const zAlpha = Math.sqrt(chi2Quantile(1 - 5e-8, 1));
  const zBeta = normalQuantile(0.8);
  const K = (zAlpha + zBeta) ** 2;

  describe('worked example — sample size for a variant explaining 0.1%', () => {
    it('has the two quantiles and the constant 39.60', () => {
      expect(zAlpha).toBeCloseTo(5.45131, 5);
      expect(zBeta).toBeCloseTo(0.841621, 6);
      expect(zAlpha + zBeta).toBeCloseTo(6.2929317, 6);
      expect(K).toBeCloseTo(39.600989, 6);
      expect(mdx).toContain('6.292931^2 = 39.600989');
    });

    it('has the variance explained', () => {
      expect(varianceExplained(0.3, 0.05)).toBeCloseTo(1.05e-3, 12);
      expect(2 * 0.3 * 0.7 * 0.05 ** 2).toBeCloseTo(1.05e-3, 12);
      expect(mdx).toContain('0.42 \\times 0.0025 = 1.05\\times10^{-3}');
    });

    it('gives 37,716 by the q² route', () => {
      expect(Math.ceil(K / 1.05e-3)).toBe(37716);
      expect(mdx).toContain('{1.05\\times10^{-3}} = 37{,}716');
    });

    it('gives the identical 37,716 by the p(1−p)β² route', () => {
      const half = K / 2;
      expect(half).toBeCloseTo(19.800495, 6);
      expect(Math.ceil(half / (0.3 * 0.7 * 0.0025))).toBe(37716);
      // the two formulas are one formula
      expect(Math.ceil(K / varianceExplained(0.3, 0.05))).toBe(
        Math.ceil(half / (0.3 * 0.7 * 0.0025))
      );
      expect(mdx).toContain('(0.30)(0.70)(0.0025)} = 37{,}716');
    });

    it('needs 396,010 for a variant ten times smaller', () => {
      expect(Math.ceil(K / 1e-4)).toBe(396010);
      expect(mdx).toContain('396,010 people');
    });

    it('states the q² convention, since 39.60 and 19.80 both appear', () => {
      expect(mdx).toMatch(/q\^2|q²/);
    });
  });

  describe('worked example — computing λ_GC', () => {
    const STATS = [0.02, 0.11, 0.28, 0.44, 0.545924, 0.95, 1.51, 2.84, 6.1];

    it('uses the exact median of chi-square on 1 df', () => {
      expect(CHI2_1DF_MEDIAN).toBeCloseTo(0.4549364231195727, 15);
      // it is the square of the 0.75 normal quantile
      expect(normalQuantile(0.75) ** 2).toBeCloseTo(CHI2_1DF_MEDIAN, 9);
      expect(mdx).toContain('0.4549364');
    });

    it('takes the fifth of nine as the median and gives 1.20', () => {
      expect(STATS[4]).toBe(0.545924);
      expect(lambdaGc(STATS)).toBeCloseTo(1.2, 5);
      expect(mdx).toContain('\\frac{0.545924}{0.4549364} = 1.200000');
    });

    it('returns to exactly 1 after genomic control', () => {
      const corrected = STATS.map((v) => v / lambdaGc(STATS));
      expect(lambdaGc(corrected)).toBeCloseTo(1, 10);
    });

    it('cannot separate a constant lift from a scaling', () => {
      // both constructions give the same lambda, which is the figure's whole point
      const additive = STATS.map((v) => v + (1.2 * CHI2_1DF_MEDIAN - CHI2_1DF_MEDIAN));
      const multiplicative = STATS.map((v) => v * 1.2);
      const base = lambdaGc(STATS);
      expect(lambdaGc(multiplicative)).toBeCloseTo(base * 1.2, 6);
      // tuned so the additive version matches at the median
      expect(lambdaGc(additive) - base).toBeCloseTo(0.2, 4);
      expect(mdx).toContain('equally consistent with confounding');
    });
  });

  describe('figure 1 — one λ_GC, two causes', () => {
    it('has both constructions land on 1.20 exactly', () => {
      const add = 1.2 * CHI2_1DF_MEDIAN - CHI2_1DF_MEDIAN;
      expect(add).toBeCloseTo(0.090987, 6);
      expect((CHI2_1DF_MEDIAN + add) / CHI2_1DF_MEDIAN).toBeCloseTo(1.2, 12);
      expect((CHI2_1DF_MEDIAN * 1.2) / CHI2_1DF_MEDIAN).toBeCloseTo(1.2, 12);
      expect(mdx).toContain('λ_GC = 1.20 for both');
    });
  });

  describe('exercise 1 — two variants, one sample size', () => {
    it('computes both variances explained', () => {
      expect(varianceExplained(0.4, 0.04)).toBeCloseTo(7.68e-4, 12);
      expect(varianceExplained(0.02, 0.204)).toBeCloseTo(1.631347e-3, 9);
      expect(mdx).toContain('0.48 \\times 0.0016 = 7.680000\\times10^{-4}');
      expect(mdx).toContain('0.0392 \\times 0.041616 = 1.631347\\times10^{-3}');
    });

    it('needs fewer people for the rare large-effect variant', () => {
      const nA = Math.ceil(K / varianceExplained(0.4, 0.04));
      const nB = Math.ceil(K / varianceExplained(0.02, 0.204));
      expect(nA).toBe(51564);
      expect(nB).toBe(24276);
      expect(nB).toBeLessThan(nA / 2);
      expect(mdx).toContain('51{,}564');
      expect(mdx).toContain('24{,}276');
      expect(mdx).toContain('**less than half**');
    });
  });

  describe('exercise 2 — what λ_GC will not tell you', () => {
    it('drops a real hit below threshold when corrected', () => {
      const crit = chi2Quantile(1 - 5e-8, 1);
      expect(crit).toBeCloseTo(29.7168, 3);
      expect(33 / 1.31).toBeCloseTo(25.2, 1);
      expect(33).toBeGreaterThan(crit);
      expect(33 / 1.31).toBeLessThan(crit);
      expect(mdx).toContain('falls to $25.2$');
      expect(mdx).toContain('29.7168');
    });
  });

  describe('exercise 3 — a mixed model that lost its signal', () => {
    it('straddles the genome-wide threshold', () => {
      const crit = chi2Quantile(1 - 5e-8, 1);
      expect(40).toBeGreaterThan(crit);
      expect(26).toBeLessThan(crit);
      expect(mdx).toContain('At 40 the variant');
      expect(mdx).toContain('at 26 it does not');
    });
  });
});

describe('statgen-ldsc-sldsc', () => {
  const mdx = lesson('statgen-ldsc-sldsc');
  const N = 100000;
  const M = 1000000;
  const H2 = 0.25;
  const INTERCEPT = 1.05;
  const LD = [10, 30, 50, 80, 120, 200];
  const CHI = LD.map((l) => INTERCEPT + ((N * H2) / M) * l);

  describe('worked example — recovering heritability from six points', () => {
    const fit = ldscRegression(LD, CHI, N, M);

    it('has the chi-square values the lesson tabulates', () => {
      expect(CHI.map((v) => +v.toFixed(2))).toEqual([1.3, 1.8, 2.3, 3.05, 4.05, 6.05]);
      expect(mdx).toContain('1.30, 1.80, 2.30, 3.05, 4.05, 6.05');
    });

    it('recovers the intercept and slope exactly', () => {
      expect(fit.intercept).toBeCloseTo(1.05, 10);
      expect(fit.slope).toBeCloseTo(0.025, 12);
      expect((N * H2) / M).toBeCloseTo(0.025, 12);
      expect(mdx).toContain('\\text{intercept} = 1.050000');
      expect(mdx).toContain('\\text{slope} = 0.025000');
    });

    it('turns the slope back into the heritability it was built from', () => {
      expect(fit.h2).toBeCloseTo(H2, 10);
      expect(0.025 * (M / N)).toBeCloseTo(0.25, 12);
      expect(mdx).toContain('{100{,}000} = 0.2500');
    });

    it('attributes only 2.4% of the inflation to confounding', () => {
      const meanChi = CHI.reduce((a, b) => a + b, 0) / CHI.length;
      expect(meanChi).toBeCloseTo(3.091667, 6);
      expect(fit.ratio).toBeCloseTo(0.023904, 6);
      expect(fit.ratio).toBeCloseTo((INTERCEPT - 1) / (meanChi - 1), 10);
      expect(mdx).toContain('\\frac{0.05}{2.091667} = 0.023904');
      expect(mdx).toContain('**Only 2.4% of the inflation is confounding.**');
    });

    it('would be condemned by λ_GC, which reads 5.8799 on the same data', () => {
      expect(lambdaGc(CHI)).toBeCloseTo(5.8799, 4);
      const median = (CHI[2] + CHI[3]) / 2;
      expect(median).toBeCloseTo(2.675, 10);
      expect(median / CHI2_1DF_MEDIAN).toBeCloseTo(5.8799, 4);
      // the two diagnostics disagree by a factor of five on identical data
      expect(lambdaGc(CHI) / fit.intercept).toBeGreaterThan(5);
      expect(mdx).toContain('2.675/0.4549364');
      expect(mdx).toContain('5.8799');
    });
  });

  describe('figure 1 — the regression line', () => {
    it('has a rise of 2.00 over a run of 80', () => {
      expect(CHI[5] - CHI[4]).toBeCloseTo(2.0, 10);
      expect(LD[5] - LD[4]).toBe(80);
      expect(2.0 / 80).toBeCloseTo(0.025, 12);
      expect(mdx).toContain('2.00 over a run of 80');
    });

    it('has an intercept that is the value at LD score zero', () => {
      const fit = ldscRegression(LD, CHI, N, M);
      expect(fit.intercept + fit.slope * 0).toBeCloseTo(1.05, 10);
    });
  });

  describe('worked example — enrichment across a functional partition', () => {
    const CATS: [string, number, number][] = [
      ['conserved', 0.025, 0.2],
      ['coding', 0.011, 0.08],
      ['promoter', 0.018, 0.08],
      ['enhancer', 0.076, 0.24],
      ['intronic', 0.39, 0.25],
      ['intergenic', 0.48, 0.15],
    ];

    it('is a genuine partition — both columns sum to one', () => {
      expect(CATS.reduce((a, c) => a + c[1], 0)).toBeCloseTo(1, 10);
      expect(CATS.reduce((a, c) => a + c[2], 0)).toBeCloseTo(1, 10);
      expect(mdx).toContain('sum to one in both columns');
    });

    it('gives the three enrichments the lesson prints', () => {
      expect(0.2 / 0.025).toBeCloseTo(8.0, 10);
      expect(0.08 / 0.011).toBeCloseTo(7.2727, 4);
      expect(0.15 / 0.48).toBeCloseTo(0.3125, 10);
      expect(mdx).toContain('\\frac{0.20}{0.025} = 8.0000');
      expect(mdx).toContain('\\frac{0.08}{0.011} = 7.2727');
      expect(mdx).toContain('\\frac{0.15}{0.480} = 0.3125');
    });

    it('has intergenic sequence depleted despite being half the genome', () => {
      const intergenic = CATS.find((c) => c[0] === 'intergenic')!;
      expect(intergenic[2] / intergenic[1]).toBeLessThan(1);
      expect(intergenic[1]).toBeGreaterThan(0.4);
      expect(mdx).toContain('**depleted**');
    });
  });

  describe('exercise 1 — heritability from a slope', () => {
    it('gives h² = 0.0528', () => {
      expect(0.012 * (1100000 / 250000)).toBeCloseTo(0.0528, 10);
      expect(mdx).toContain('0.012 \\times 1{,}100{,}000/250{,}000 = 0.052800');
    });
  });

  describe('exercise 2 — same inflation, opposite conclusions', () => {
    it('separates two studies with an identical mean chi-square', () => {
      expect(0.02 / 0.3).toBeCloseTo(0.066667, 6);
      expect(0.25 / 0.3).toBeCloseTo(0.833333, 6);
      expect(mdx).toContain('\\frac{0.02}{0.30} = 0.066667');
      expect(mdx).toContain('\\frac{0.25}{0.30} = 0.833333');
    });

    it('has the two ratios on opposite sides of any sensible threshold', () => {
      expect(0.02 / 0.3).toBeLessThan(0.1);
      expect(0.25 / 0.3).toBeGreaterThan(0.8);
    });
  });

  describe('exercise 3 — an enrichment that means less than it looks', () => {
    it('is tenfold', () => {
      expect(0.1 / 0.01).toBeCloseTo(10.0, 10);
      expect(mdx).toContain('0.10/0.010 = 10.0000');
    });

    it('could be inherited from a containing annotation at eightfold', () => {
      expect(0.2 / 0.025).toBeCloseTo(8.0, 10);
      expect(mdx).toContain('around eightfold');
    });
  });
});

describe('statgen-rare-variant-association', () => {
  const mdx = lesson('statgen-rare-variant-association');
  const K = 39.600989007;
  const MAF = [0.001, 0.002, 0.005, 0.008, 0.01];
  const W = MAF.map((m) => betaWeight(m));
  const GENE_A = [4, 3, 5, 2, 3];
  const GENE_B = [4, -3, 5, -2, -4];

  describe('worked example — what frequency costs', () => {
    it('has the four rows of the power table', () => {
      for (const [maf, q2, n] of [
        [0.05, 2.375e-2, 1668],
        [0.01, 4.95e-3, 8001],
        [0.001, 4.995e-4, 79282],
        [0.0001, 4.9995e-5, 792099],
      ] as [number, number, number][]) {
        expect(varianceExplained(maf, 0.5)).toBeCloseTo(q2, 9);
        expect(Math.ceil(K / varianceExplained(maf, 0.5))).toBe(n);
      }
      for (const row of [
        '| 5% | $2.3750\\times10^{-2}$ | 1,668 |',
        '| 1% | $4.9500\\times10^{-3}$ | 8,001 |',
        '| 0.1% | $4.9950\\times10^{-4}$ | 79,282 |',
        '| 0.01% | $4.9995\\times10^{-5}$ | 792,099 |',
      ]) {
        expect(mdx).toContain(row);
      }
    });

    it('rises 475-fold between 5% and 0.01%', () => {
      const lo = Math.ceil(K / varianceExplained(0.05, 0.5));
      const hi = Math.ceil(K / varianceExplained(0.0001, 0.5));
      expect(hi / lo).toBeCloseTo(475, 0);
      expect(mdx).toContain('475-fold');
    });

    it('states the q² convention, since 39.60 appears', () => {
      expect(mdx).toMatch(/q\^2|q²/);
    });
  });

  describe('worked example — two genes, identical except for three minus signs', () => {
    it('has the five Beta(1,25) weights', () => {
      const expected = [24.4068, 23.8272, 22.1663, 20.6167, 19.642];
      W.forEach((w, i) => expect(w).toBeCloseTo(expected[i], 4));
      expect(mdx).toContain('(24.4068,\\; 23.8272,\\; 22.1663,\\; 20.6167,\\; 19.6420)');
    });

    it('has the same magnitudes in both genes — only signs differ', () => {
      expect(GENE_A.map(Math.abs)).toEqual([4, 3, 5, 2, 3]);
      expect(GENE_B.map(Math.abs)).toEqual([4, 3, 5, 2, 4]);
      // four of the five magnitudes are identical; the fifth differs by one
      expect(GENE_A.slice(0, 4).map(Math.abs)).toEqual(GENE_B.slice(0, 4).map(Math.abs));
    });

    it('has weighted sums that differ by more than twentyfold', () => {
      const wsum = (S: number[]) => S.reduce((acc, sj, j) => acc + W[j] * sj, 0);
      expect(wsum(GENE_A)).toBeCloseTo(380.1, 4);
      expect(wsum(GENE_B)).toBeCloseTo(17.1762, 4);
      expect(mdx).toContain('= 380.1000');
      expect(mdx).toContain('= 17.1762');
    });

    it('collapses the burden statistic by a factor of 490', () => {
      const a = burdenStatistic(GENE_A, W);
      const b = burdenStatistic(GENE_B, W);
      expect(Math.round(a)).toBe(144476);
      expect(Math.round(b)).toBe(295);
      expect(a / b).toBeCloseTo(489.7, 1);
      expect(mdx).toContain('380.1000^2 = 144{,}476');
      expect(mdx).toContain('17.1762^2 = 295');
      expect(mdx).toContain('factor of **490**');
    });

    it('leaves SKAT essentially unchanged', () => {
      const a = skatQ(GENE_A, W);
      const b = skatQ(GENE_B, W);
      expect(Math.round(a)).toBe(32097);
      expect(Math.round(b)).toBe(34797);
      expect(a / b).toBeCloseTo(0.922, 3);
      // gene B is slightly larger, not smaller
      expect(b).toBeGreaterThan(a);
      expect(mdx).toContain('32{,}097');
      expect(mdx).toContain('34{,}797');
    });

    it('has neither test dominating', () => {
      expect(burdenStatistic(GENE_A, W) / skatQ(GENE_A, W)).toBeCloseTo(4.501, 3);
      expect(skatQ(GENE_B, W) / burdenStatistic(GENE_B, W)).toBeCloseTo(117.9, 1);
      expect(mdx).toContain('$4.50\\times$');
      expect(mdx).toContain('$117.9\\times$');
    });
  });

  describe('the Beta weight, whose constant is not a ratio', () => {
    it('is 25(1-maf)^24', () => {
      for (const m of MAF) expect(betaWeight(m)).toBeCloseTo(25 * (1 - m) ** 24, 9);
      expect(mdx).toContain('25\\,(1 - \\mathrm{MAF}_j)^{24}');
    });

    it('gives a near-singleton only 1.27x a 1% variant', () => {
      expect(betaWeight(1e-9) / betaWeight(0.01)).toBeCloseTo(1.2728, 4);
      expect((betaWeight(1e-9) / betaWeight(0.01)) ** 2).toBeCloseTo(1.62, 2);
      expect(mdx).toContain('$1.27\\times$');
      expect(mdx).toContain('$1.62\\times$');
    });

    it('does its work against common variants', () => {
      expect(betaWeight(1e-9) / betaWeight(0.05)).toBeCloseTo(3.4248, 4);
      expect((betaWeight(1e-9) / betaWeight(0.05)) ** 2).toBeCloseTo(11.7292, 3);
      expect(mdx).toContain('$3.42\\times$');
      expect(mdx).toContain('$11.73\\times$');
    });
  });

  describe('exercise 1 — where SKAT-O lands', () => {
    it('has the five-row table for both genes', () => {
      for (const [rho, a, b] of [
        [0, 32097, 34797],
        [0.25, 60192, 26172],
        [0.5, 88286, 17546],
        [0.75, 116381, 8921],
        [1, 144476, 295],
      ] as [number, number, number][]) {
        expect(Math.round(skatOQ(GENE_A, W, rho))).toBe(a);
        expect(Math.round(skatOQ(GENE_B, W, rho))).toBe(b);
      }
      for (const row of [
        '| 0 (pure SKAT) | 32,097 | 34,797 |',
        '| 0.5 | 88,286 | 17,546 |',
        '| 1 (pure burden) | 144,476 | 295 |',
      ]) {
        expect(mdx).toContain(row);
      }
    });

    it('is maximised at opposite endpoints for the two genes', () => {
      const best = (S: number[]) =>
        [0, 0.25, 0.5, 0.75, 1].reduce((b, r) => (skatOQ(S, W, r) > skatOQ(S, W, b) ? r : b), 0);
      expect(best(GENE_A)).toBe(1);
      expect(best(GENE_B)).toBe(0);
      expect(mdx).toContain('opposite corners');
    });

    it('is linear in rho, so the maximum is always at an endpoint', () => {
      for (const S of [GENE_A, GENE_B]) {
        const mid = skatOQ(S, W, 0.5);
        expect(mid).toBeCloseTo((skatOQ(S, W, 0) + skatOQ(S, W, 1)) / 2, 8);
      }
      expect(mdx).toContain('linear in $\\rho$');
    });
  });

  describe('exercise 2 — how many genes, and at what threshold', () => {
    it('reuses the exome threshold from the association lesson', () => {
      expect(0.05 / 20000).toBeCloseTo(2.5e-6, 18);
      expect(chi2Quantile(1 - 0.05 / 20000, 1)).toBeCloseTo(22.1665, 3);
      expect(mdx).toContain('2.50\\times10^{-6}');
      expect(mdx).toContain('22.1665');
    });

    it('notes the genome-wide threshold would hold error at 0.001', () => {
      expect(5e-8 * 20000).toBeCloseTo(1e-3, 12);
      expect(mdx).toContain('$0.001$ rather than');
    });

    it('counts 80,000 tests for four masks per gene', () => {
      expect(20000 * 4).toBe(80000);
      expect(mdx).toContain('80,000 tests');
    });
  });
});

describe('statgen-meta-analysis-replication', () => {
  const mdx = lesson('statgen-meta-analysis-replication');
  const B = [0.1, 0.06, 0.14, 0.08];
  const SE = [0.02, 0.015, 0.04, 0.018];
  const N = [20000, 30000, 25000, 22000];
  const THRESH = 5.45131;

  describe('worked example — four studies, two weightings', () => {
    const fit = ivwMeta(B, SE);

    it('has the four inverse-variance weights', () => {
      const w = SE.map((se) => 1 / se ** 2);
      const expected = [2500.0, 4444.4, 625.0, 3086.4];
      w.forEach((x, i) => expect(x).toBeCloseTo(expected[i], 1));
      expect(mdx).toContain('(2500.0,\\; 4444.4,\\; 625.0,\\; 3086.4)');
    });

    it('pools to 0.079870 with SE 0.009687', () => {
      expect(fit.beta).toBeCloseTo(0.07987, 6);
      expect(fit.se).toBeCloseTo(0.009687, 6);
      expect(fit.z).toBeCloseTo(8.2447, 4);
      // computed independently
      const w = SE.map((se) => 1 / se ** 2);
      const tot = w.reduce((a, b) => a + b, 0);
      expect(B.reduce((a, b, i) => a + w[i] * b, 0) / tot).toBeCloseTo(fit.beta, 12);
      expect(1 / Math.sqrt(tot)).toBeCloseTo(fit.se, 12);
      expect(mdx).toContain('\\hat\\beta_{\\mathrm{IVW}} = 0.079870');
      expect(mdx).toContain('0.009687');
    });

    it('has the weight-share table, where study 3 diverges fourfold', () => {
      const w = SE.map((se) => 1 / se ** 2);
      const wn = N.map(Math.sqrt);
      const share = (a: number[], i: number) => (100 * a[i]) / a.reduce((x, y) => x + y, 0);
      for (const [i, ivw, sqrtn] of [[0, 23.5, 22.8], [1, 41.7, 27.9], [2, 5.9, 25.5], [3, 29.0, 23.9]] as [number, number, number][]) {
        expect(share(w, i)).toBeCloseTo(ivw, 1);
        expect(share(wn, i)).toBeCloseTo(sqrtn, 1);
      }
      expect(share(wn, 2) / share(w, 2)).toBeGreaterThan(4);
      for (const row of [
        '| study 2 | 41.7% | 27.9% |',
        '| study 3 | **5.9%** | **25.5%** |',
      ]) {
        expect(mdx).toContain(row);
      }
    });

    it('has study 3 carrying the largest effect and the worst standard error', () => {
      expect(Math.max(...B)).toBe(B[2]);
      expect(Math.max(...SE)).toBe(SE[2]);
      expect(SE[2] / Math.min(...SE)).toBeCloseTo(2.667, 2);
      expect(mdx).toContain('double anyone else');
    });
  });

  describe('heterogeneity', () => {
    const fit = ivwMeta(B, SE);

    it("gives Cochran's Q on k-1 df", () => {
      expect(fit.q).toBeCloseTo(5.0276, 4);
      expect(fit.df).toBe(3);
      expect(1 - regularizedGammaP(0.5, fit.q / 2)).toBeCloseTo(0.0249, 4);
      expect(mdx).toContain('Q = 5.0276$ on 3 df');
      expect(mdx).toContain('0.0249');
    });

    it('gives I² as the share of variability that is not sampling error', () => {
      expect(fit.i2).toBeCloseTo(40.33, 1);
      expect(((fit.q - fit.df) / fit.q) * 100).toBeCloseTo(fit.i2, 8);
      expect(mdx).toContain('40.3\\%');
    });

    it('reports tau² in the units of the effect', () => {
      expect(fit.tau2).toBeCloseTo(0.000278, 6);
      expect(Math.sqrt(fit.tau2)).toBeCloseTo(0.0167, 4);
      expect(Math.sqrt(fit.tau2) / fit.beta).toBeCloseTo(0.209, 2);
      expect(mdx).toContain('\\tau^2 = 0.000278');
      expect(mdx).toContain('0.0167');
    });
  });

  describe("worked example — the winner's curse", () => {
    it('inflates a true z of 5.0 by 22.1%', () => {
      const e = winnersCurseExpectation(5.0, THRESH);
      expect(e).toBeCloseTo(6.105655, 5);
      expect((e / 5.0 - 1) * 100).toBeCloseTo(22.11, 2);
      expect(mdx).toContain('= 6.105655');
      expect(mdx).toContain('**22.1%**');
    });

    it('inflates a true z of 6.0 by 8.1% and 9.0 by nothing', () => {
      expect(winnersCurseExpectation(6.0, THRESH)).toBeCloseTo(6.484465, 5);
      expect(winnersCurseExpectation(9.0, THRESH)).toBeCloseTo(9.000735, 5);
      expect((winnersCurseExpectation(6.0, THRESH) / 6 - 1) * 100).toBeCloseTo(8.07, 2);
      expect((winnersCurseExpectation(9.0, THRESH) / 9 - 1) * 100).toBeLessThan(0.05);
      expect(mdx).toContain('6.484465');
      expect(mdx).toContain('9.000735');
    });

    it('always overestimates, and monotonically less so as the effect grows', () => {
      let prev = Infinity;
      for (const z of [5.0, 5.5, 6.0, 6.5, 7.0, 8.0, 9.0]) {
        const inflation = winnersCurseExpectation(z, THRESH) / z - 1;
        expect(inflation).toBeGreaterThan(0);
        expect(inflation).toBeLessThan(prev);
        prev = inflation;
      }
    });
  });

  describe('exercise 1 — pooling by hand', () => {
    const fit = ivwMeta([0.2, 0.12, 0.16], [0.05, 0.04, 0.1]);

    it('has weights summing to 1,125 and a pooled estimate of 0.152', () => {
      expect([0.05, 0.04, 0.1].reduce((a, se) => a + 1 / se ** 2, 0)).toBeCloseTo(1125, 8);
      expect(fit.beta).toBeCloseTo(0.152, 10);
      expect(fit.se).toBeCloseTo(0.029814, 6);
      expect(fit.z).toBeCloseTo(5.098235, 5);
      expect(mdx).toContain('\\frac{171}{1125} = 0.152000');
      expect(mdx).toContain('1/\\sqrt{1125} = 0.029814');
    });

    it('has Q below its df, so I² truncates to zero', () => {
      expect(fit.q).toBeCloseTo(1.568, 6);
      expect(fit.q).toBeLessThan(fit.df);
      expect(fit.i2).toBe(0);
      expect(fit.tau2).toBe(0);
      expect(mdx).toContain('= 1.568000');
      expect(mdx).toContain('truncated at $0\\%$');
    });
  });

  describe('exercise 2 — the same disagreement, four times the data', () => {
    it('leaves the pooled estimate and the spread unchanged', () => {
      const coarse = ivwMeta([0.1, 0.14], [0.03, 0.03]);
      const fine = ivwMeta([0.1, 0.14], [0.015, 0.015]);
      expect(coarse.beta).toBeCloseTo(0.12, 12);
      expect(fine.beta).toBeCloseTo(0.12, 12);
      expect(0.14 - 0.1).toBeCloseTo(0.04, 12);
    });

    it('quadruples Q and sends I² from 0% to 71.9%', () => {
      const coarse = ivwMeta([0.1, 0.14], [0.03, 0.03]);
      const fine = ivwMeta([0.1, 0.14], [0.015, 0.015]);
      expect(coarse.q).toBeCloseTo(0.888889, 6);
      expect(fine.q).toBeCloseTo(3.555556, 6);
      expect(fine.q / coarse.q).toBeCloseTo(4, 8);
      expect(coarse.i2).toBe(0);
      expect(fine.i2).toBeCloseTo(71.875, 3);
      expect(mdx).toContain('= 0.888889');
      expect(mdx).toContain('= 3.555556');
      expect(mdx).toContain('71.9\\%');
    });
  });
});

describe('statgen-bayesian-fine-mapping', () => {
  const mdx = lesson('statgen-bayesian-fine-mapping');
  const N = 50000;
  const P = 0.3;
  const V = 1 / (2 * P * (1 - P) * N);
  const W = 0.04;
  const PI0 = 0.05;
  const SIGNAL = [2.1, 4.6, 6.2, 6.5, 6.2, 4.6, 2.4, 1.8];
  const NULLZ = [0.8, 1.2, 0.4, 1.7, 0.9, 1.1, 0.3, 1.4];
  const flat = (n: number) => Array.from({ length: n }, () => 1 / n);
  // LD falling away from the causal variant at index 3
  const DECAY = [1, 0.95, 0.7, 0.35, 0.15, 0.05, 0.02, 0.01];
  const LD = Array.from({ length: 8 }, (_, i) =>
    Array.from({ length: 8 }, (_, j) => DECAY[Math.abs(i - j)])
  );

  describe('worked example — fine-mapping eight variants', () => {
    const abfs = SIGNAL.map((z) => wakefieldAbf(z, V, W));
    const pips = pipsFromAbf(abfs, flat(8), PI0);

    it('has the variance the lesson quotes', () => {
      expect(V).toBeCloseTo(4.7619e-5, 9);
      expect(mdx).toContain('4.7619 × 10⁻⁵');
    });

    it('gives a tiny BF01 at the peak, meaning strong evidence against the null', () => {
      expect(abfs[3]).toBeCloseTo(1.99e-8, 10);
      expect(abfs[3]).toBeLessThan(1);
      // and BF10 is its reciprocal, which is what the coloc section needs
      expect(1 / abfs[3]).toBeGreaterThan(1e7);
      expect(mdx).toContain('1.990\\times10^{-8}');
    });

    it('gives the eight posterior inclusion probabilities', () => {
      const expected = [0, 0.000021, 0.114882, 0.770194, 0.114882, 0.000021, 0, 0];
      pips.forEach((p, i) => expect(p).toBeCloseTo(expected[i], 6));
      expect(mdx).toContain('0.770194');
      expect(mdx).toContain('0.114882');
    });

    it('needs three variants to reach 95%, not two', () => {
      expect(pips[3] + pips[2]).toBeCloseTo(0.8850766, 6);
      expect(pips[3] + pips[2]).toBeLessThan(0.95);
      const cs = credibleSet(pips, 0.95);
      expect(cs.indices.length).toBe(3);
      expect(cs.indices.slice().sort()).toEqual([2, 3, 4]);
      expect(cs.coverage).toBeCloseTo(0.99996, 5);
      expect(mdx).toContain('0.885076');
      expect(mdx).toContain('0.99996');
    });

    it('has a purity of 0.7000 — the limit LD imposes', () => {
      const cs = credibleSet(pips, 0.95);
      expect(csPurity(cs.indices, LD)).toBeCloseTo(0.7, 10);
      expect(mdx).toContain('0.7000');
    });

    it('has PIPs summing to one here, because the evidence swamps pi_0', () => {
      expect(pips.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    });
  });

  describe('the null prior, at a locus with no signal', () => {
    const abfs = NULLZ.map((z) => wakefieldAbf(z, V, W));

    it('has every BF01 above one — evidence for the null throughout', () => {
      expect(abfs.every((b) => b > 1)).toBe(true);
      expect(Math.max(...NULLZ)).toBe(1.7);
    });

    it('leaves the PIPs summing to 0.5764 when pi_0 is kept', () => {
      const pips = pipsFromAbf(abfs, flat(8), PI0);
      expect(pips.reduce((a, b) => a + b, 0)).toBeCloseTo(0.576378, 6);
      const cs = credibleSet(pips, 0.95);
      expect(cs.coverage).toBeLessThan(0.95);
      expect(mdx).toContain('0.576378');
    });

    it('forces them to one when pi_0 is dropped, manufacturing a set from noise', () => {
      const pips = pipsFromAbf(abfs, flat(8), 0);
      expect(pips.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
      const cs = credibleSet(pips, 0.95);
      expect(cs.indices.length).toBe(8);
      expect(cs.coverage).toBeCloseTo(1, 8);
      expect(csPurity(cs.indices, LD)).toBeCloseTo(0.01, 10);
      expect(mdx).toContain('purity of 0.0100');
    });

    it('is the difference between reporting nothing and reporting a confident set', () => {
      const kept = credibleSet(pipsFromAbf(abfs, flat(8), PI0), 0.95);
      const dropped = credibleSet(pipsFromAbf(abfs, flat(8), 0), 0.95);
      expect(kept.coverage).toBeLessThan(0.95);
      expect(dropped.coverage).toBeGreaterThanOrEqual(0.95);
    });
  });

  describe('worked example — colocalisation', () => {
    const bf10 = (zs: number[]) => zs.map((z) => 1 / wakefieldAbf(z, V, W));
    const SHIFTED = [6.4, 6.1, 4.4, 2.3, 1.9, 2.0, 1.5, 1.2];
    const FLATZ = [1.1, 0.7, 1.4, 0.9, 1.2, 0.5, 1.0, 1.3];

    it('finds a shared causal variant', () => {
      const p = colocPosteriors(bf10(SIGNAL), bf10(SIGNAL.map((z) => z * 0.85)));
      expect(p.pp4).toBeCloseTo(0.9991, 4);
      expect(mdx).toContain('**0.9991**');
    });

    it('finds distinct causals when the second peak moves', () => {
      const p = colocPosteriors(bf10(SIGNAL), bf10(SHIFTED));
      expect(p.pp3).toBeCloseTo(0.9947, 4);
      expect(p.pp4).toBeLessThan(0.01);
      expect(mdx).toContain('**0.9947**');
    });

    it('finds a signal in one trait only, and in neither', () => {
      expect(colocPosteriors(bf10(SIGNAL), bf10(FLATZ)).pp1).toBeCloseTo(0.994, 3);
      expect(
        colocPosteriors(bf10(FLATZ), bf10([0.9, 1.2, 0.6, 1.0, 0.8, 1.1, 0.7, 1.3])).pp0
      ).toBeCloseTo(0.9999, 4);
      expect(mdx).toContain('**0.9940**');
      expect(mdx).toContain('**0.9999**');
    });

    it('has the p12 sensitivity the lesson tabulates', () => {
      const run = (p12: number) =>
        colocPosteriors(bf10(SIGNAL), bf10(SIGNAL.map((z) => z * 0.85)), 1e-4, 1e-4, p12);
      expect(run(1e-6).pp4).toBeCloseTo(0.991, 3);
      expect(run(1e-5).pp4).toBeCloseTo(0.9991, 4);
      expect(run(1e-4).pp4).toBeCloseTo(0.9999, 4);
      expect(mdx).toContain('0.9910');
    });

    it('would report PP0 if fed BF01 instead — the direction the reciprocal fixes', () => {
      const wrong = colocPosteriors(
        SIGNAL.map((z) => wakefieldAbf(z, V, W)),
        SIGNAL.map((z) => wakefieldAbf(z * 0.85, V, W))
      );
      expect(wrong.pp0).toBeGreaterThan(0.99);
      expect(mdx).toContain('reciprocal');
    });
  });

  describe('exercise 1 — reading a Bayes factor in the right direction', () => {
    it('inverts 2.5e-6 to 400,000', () => {
      expect(1 / 2.5e-6).toBeCloseTo(400000, 6);
      expect(mdx).toContain('400{,}000');
    });
  });
});

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

describe('data-protein-benchmarks', () => {
  const mdx = lesson('data-protein-benchmarks');
  const ASSAY = [-3.2, -2.1, -1.5, -0.4, 0.1, 0.6, 1.2, 2.0];
  const PRED = ASSAY.map((v) => 1 / (1 + Math.exp(-v)));

  describe('worked example — the same predictor, scored two ways', () => {
    it('lists the logistic values the derivation quotes', () => {
      const shown = ['0.0392', '0.1091', '0.1824', '0.4013', '0.5250', '0.6457', '0.7685', '0.8808'];
      PRED.forEach((v, i) => expect(v).toBeCloseTo(Number(shown[i]), 4));
      for (const v of shown) expect(mdx).toContain(v);
    });

    it('is a perfect rank correlation, because the transform is monotone', () => {
      expect(spearman(ASSAY, PRED)).toBeCloseTo(1, 12);
      // and stays perfect under any other increasing map
      expect(spearman(ASSAY, ASSAY.map((v) => Math.exp(v)))).toBeCloseTo(1, 12);
      expect(mdx).toContain('\\rho_s = 1.0000');
    });

    it('reports an RMSE of 1.5995 that measures only the change of units', () => {
      expect(rmse(ASSAY, PRED)).toBeCloseTo(1.5995, 4);
      expect(rmse(ASSAY, ASSAY)).toBe(0);
      expect(mdx).toContain('\\text{RMSE} = 1.5995');
    });
  });

  describe('figure 1 — one predictor, two verdicts', () => {
    it('draws the error on the left and the perfect rank agreement on the right', () => {
      expect(mdx).toContain('RMSE = 1.5995');
      expect(mdx).toContain('Spearman = 1.0000');
      // the right panel's points must genuinely lie on the diagonal
      const rank = (xs: number[]) => xs.map((v) => [...xs].sort((a, b) => a - b).indexOf(v) + 1);
      expect(rank(ASSAY)).toEqual(rank(PRED));
    });
  });

  describe('worked example — a correlation that recovers nothing actionable', () => {
    const truth = Array.from({ length: 20 }, (_, i) => 20 - i);
    const pred = (() => {
      const p = truth.slice();
      for (let i = 0; i < 5; i++) [p[i], p[i + 5]] = [p[i + 5], p[i]];
      return p;
    })();

    it('gives a respectable Spearman of 0.8120', () => {
      expect(spearman(truth, pred)).toBeCloseTo(0.812, 4);
      // the closed form the derivation shows, from sum d^2 = 250
      expect(1 - (6 * 250) / (20 * (400 - 1))).toBeCloseTo(0.812, 4);
      expect(mdx).toContain('\\frac{1500}{7980} = 0.8120');
    });

    it('recovers none of the true top five', () => {
      expect(topKRecall(truth, pred, 5)).toBe(0);
      expect(mdx).toContain('R@5 = \\frac{0}{5} = 0.0000');
    });

    it('recovers all of the true top ten', () => {
      expect(topKRecall(truth, pred, 10)).toBe(1);
      expect(mdx).toContain('R@10 = \\frac{10}{10} = 1.0000');
    });

    it('has the three numbers describe one consistent state of knowledge', () => {
      // knows the set of ten, not the order inside it
      expect(topKRecall(truth, pred, 10)).toBe(1);
      expect(topKRecall(truth, pred, 5)).toBe(0);
      expect(spearman(truth, pred)).toBeGreaterThan(0.8);
    });
  });

  describe('exercise 1 — a predictor with the sign flipped', () => {
    it('is odd under negation, which RMSE is not', () => {
      const flipped = PRED.map((v) => -v);
      expect(spearman(ASSAY, flipped)).toBeCloseTo(-1, 12);
      expect(Math.abs(spearman(ASSAY, flipped))).toBeCloseTo(spearman(ASSAY, PRED), 12);
      // RMSE has no such symmetry
      expect(rmse(ASSAY, flipped)).not.toBeCloseTo(rmse(ASSAY, PRED), 3);
      expect(mdx).toContain('−0.72');
    });
  });

  describe('exercise 2 — where the correlation comes from', () => {
    it('scores lower when the neutral bulk is scrambled instead', () => {
      const truth = Array.from({ length: 20 }, (_, i) => 20 - i);
      const structured = (() => {
        const p = truth.slice();
        for (let i = 0; i < 5; i++) [p[i], p[i + 5]] = [p[i + 5], p[i]];
        return p;
      })();
      // reverse the bottom ten: a large, structured scramble of the neutral block
      const bulkScrambled = truth.slice(0, 10).concat(truth.slice(10).reverse());
      expect(spearman(truth, bulkScrambled)).toBeLessThan(spearman(truth, structured));
      // and it is the more useful predictor: the severe tail is ordered exactly
      expect(topKRecall(truth, bulkScrambled, 5)).toBe(1);
      expect(topKRecall(truth, structured, 5)).toBe(0);
    });
  });
});

describe('data-variant-benchmarks', () => {
  const mdx = lesson('data-variant-benchmarks');

  /**
   * The benchmark set the page and its figure both use: 10 causal variants, `nNeg` controls,
   * and a fixed 8/90 fraction of controls scoring above every positive. Built here rather
   * than imported so the test does not simply reread the generator.
   */
  const build = (nNeg: number) => {
    const top = Math.round((nNeg * 8) / 90);
    const labels: number[] = [];
    const scores: number[] = [];
    for (let i = 0; i < 10; i++) { labels.push(1); scores.push(0.6 + (0.3 * i) / 9); }
    for (let j = 0; j < nNeg - top; j++) { labels.push(0); scores.push((0.55 * j) / (nNeg - top - 1)); }
    for (let k = 0; k < top; k++) { labels.push(0); scores.push(0.92 + (0.07 * k) / Math.max(1, top - 1)); }
    return { labels, scores };
  };
  const precisionAt = (labels: number[], scores: number[], k: number) => {
    const order = [...scores.keys()].sort((a, b) => scores[b] - scores[a]);
    return order.slice(0, k).filter((i) => labels[i] === 1).length / k;
  };

  describe('worked example — one ranking, two verdicts', () => {
    const { labels, scores } = build(90);

    it('scores AUROC 0.9111, which reads as a strong model', () => {
      expect(auroc(labels, scores)).toBeCloseTo(0.9111, 4);
      expect(mdx).toContain('\\text{AUROC} = 0.9111');
    });

    it('scores AUPRC 0.3782 against a baseline of exactly the positive rate', () => {
      expect(auprc(labels, scores)).toBeCloseTo(0.3782, 4);
      expect(auprcBaseline(labels)).toBeCloseTo(0.1, 12);
      expect(auprcBaseline(labels)).toBeCloseTo(10 / 100, 12);
      expect(mdx).toContain('\\text{AUPRC} = 0.3782');
      expect(mdx).toContain('\\frac{10}{100} = 0.1000');
    });

    it('puts the first true positive ninth', () => {
      expect(precisionAt(labels, scores, 8)).toBe(0);
      expect(precisionAt(labels, scores, 9)).toBeCloseTo(1 / 9, 12);
      expect(precisionAt(labels, scores, 10)).toBeCloseTo(0.2, 12);
      expect(mdx).toContain('P@8 = \\frac{0}{8} = 0.0000');
      expect(mdx).toContain('P@9 = \\frac{1}{9} = 0.1111');
      expect(mdx).toContain('P@10 = \\frac{2}{10} = 0.2000');
    });

    it('has a false positive rate small enough for ROC to shrug at', () => {
      expect(8 / 90).toBeLessThan(0.09); // "under nine per cent"
    });
  });

  describe('figure 1 — the same predictions drawn twice', () => {
    it('labels both areas with the values the module computes', () => {
      const { labels, scores } = build(90);
      expect(mdx).toContain('AUROC = 0.9111');
      expect(mdx).toContain('AUPRC = 0.3782');
      expect(mdx).toContain('baseline 0.1');
      expect(auroc(labels, scores)).toBeCloseTo(0.9111, 4);
      expect(auprc(labels, scores)).toBeCloseTo(0.3782, 4);
    });

    it('starts the precision-recall curve at 1/9, as the annotation says', () => {
      const { labels, scores } = build(90);
      expect(precisionAt(labels, scores, 9)).toBeCloseTo(0.1111, 4);
      expect(mdx).toContain('first hit is the 9th prediction');
    });
  });

  describe('exercise 1 — a score against its floor', () => {
    it('gives the two ratios the solution quotes', () => {
      expect(0.9111 / 0.5).toBeCloseTo(1.8222, 4);
      expect(0.3782 / 0.1).toBeCloseTo(3.782, 3);
      expect(mdx).toContain('\\frac{0.9111}{0.5} = 1.8222');
      expect(mdx).toContain('\\frac{0.3782}{0.1} = 3.7820');
    });
  });

  describe('exercise 2 — what a follow-up budget buys', () => {
    it('yields two hits from ten and all ten from eighteen', () => {
      const { labels, scores } = build(90);
      expect(precisionAt(labels, scores, 10)).toBeCloseTo(0.2, 12);
      expect(precisionAt(labels, scores, 18)).toBeCloseTo(10 / 18, 12);
      expect(precisionAt(labels, scores, 18) * 18).toBe(10); // every positive found
      expect(mdx).toContain('P@18 = \\frac{10}{18} = 0.5556');
    });
  });

  describe('exercise 3 — why AUPRC does not transfer', () => {
    it('leaves AUROC unchanged as the control set grows', () => {
      const rocs = [90, 270, 990].map((n) => {
        const { labels, scores } = build(n);
        return auroc(labels, scores);
      });
      for (const r of rocs) expect(r).toBeCloseTo(0.9111, 4);
    });

    it('collapses AUPRC with the baseline it is measured against', () => {
      const rows: [number, number, number][] = [
        [90, 0.1, 0.3782],
        [270, 0.0357, 0.1786],
        [990, 0.01, 0.0579],
      ];
      for (const [n, base, area] of rows) {
        const { labels, scores } = build(n);
        expect(auprcBaseline(labels)).toBeCloseTo(base, 4);
        expect(auprc(labels, scores)).toBeCloseTo(area, 4);
        expect(mdx).toContain(area.toFixed(4));
      }
    });

    it('falls by more than sixfold across the range, as the solution claims', () => {
      const a = auprc(build(90).labels, build(90).scores);
      const b = auprc(build(990).labels, build(990).scores);
      expect(a / b).toBeGreaterThan(6);
    });
  });

  describe('TraitGym scale quoted in the prose', () => {
    it('states the counts and the one-to-nine design consistently', () => {
      expect(338 * 10).toBe(3380);
      expect(1140 * 10).toBe(11400);
      expect(mdx).toContain('113 traits');
      expect(mdx).toContain('83 traits');
      expect(mdx).toContain('1,140 causal');
      expect(mdx).toContain('11,400');
    });
  });
});

describe('data-expression-qtl', () => {
  const mdx = lesson('data-expression-qtl');
  const GWAS = [2, 15, 1e6, 30, 6];
  const SHARED = [3, 10, 8e5, 25, 9];
  const DISTINCT = [3, 8e5, 10, 25, 9];
  const WEAK = [1, 1, 25, 1, 1];
  const FLAT = [1, 1, 1, 1, 1];
  const r4 = (x: number) => Number(x.toFixed(4));

  describe('worked example — the same peak, and two peaks that look the same', () => {
    it('gives PP4 = 1.0000 when both traits peak at the same variant', () => {
      expect(r4(colocPosteriors(GWAS, SHARED).pp4)).toBe(1);
      expect(mdx).toContain('\\text{PP4} = 1.0000');
    });

    it('gives PP3 = 0.9523 when only the eQTL peak moves by one variant', () => {
      const p = colocPosteriors(GWAS, DISTINCT);
      expect(p.pp3).toBeCloseTo(0.9523, 4);
      expect(p.pp4).toBeCloseTo(0.0262, 4);
      expect(mdx).toContain('\\text{PP3} = 0.9523');
      expect(mdx).toContain('\\text{PP4} = 0.0262');
    });

    it('has both cases carry a strong signal in both traits, which is the trap', () => {
      // an "is there an eQTL here?" check cannot tell them apart
      for (const e of [SHARED, DISTINCT]) {
        expect(Math.max(...e)).toBeGreaterThan(1e5);
        expect(Math.max(...GWAS)).toBeGreaterThan(1e5);
      }
    });
  });

  describe('a high PP4 built from almost no QTL evidence', () => {
    it('reaches 0.7122 on a single Bayes factor of 25', () => {
      const p = colocPosteriors(GWAS, WEAK);
      expect(p.pp1).toBeCloseTo(0.2849, 4);
      expect(p.pp4).toBeCloseTo(0.7122, 4);
      expect(mdx).toContain('\\text{PP1} = 0.2849');
      expect(mdx).toContain('\\text{PP4} = 0.7122');
    });
  });

  describe('figure 1 — three loci, five hypotheses', () => {
    it('draws exactly the posteriors the module computes', () => {
      const rows: [number[], number[]][] = [[GWAS, SHARED], [GWAS, DISTINCT], [GWAS, WEAK]];
      for (const [a, b] of rows) {
        const p = colocPosteriors(a, b);
        for (const v of [p.pp0, p.pp1, p.pp2, p.pp3, p.pp4]) {
          if (v >= 0.01) expect(mdx).toContain(v.toFixed(4));
        }
      }
      expect(mdx).toContain('Shared causal variant');
      expect(mdx).toContain('Distinct causal variants');
      expect(mdx).toContain('Weak eQTL, strong GWAS');
    });
  });

  describe('exercise 1 — reading the whole posterior', () => {
    it('is trait-one-only against a flat eQTL', () => {
      const p = colocPosteriors(GWAS, FLAT);
      expect(p.pp0).toBeCloseTo(0.009, 3);
      expect(p.pp1).toBeCloseTo(0.9006, 4);
      expect(p.pp4).toBeCloseTo(0.0901, 4);
      expect(mdx).toContain('PP1 0.9006');
      expect(mdx).toContain('PP4 0.0901');
    });

    it('has the quoted values sum to 1 up to their own rounding', () => {
      const quoted = [0.009, 0.9006, 0.0, 0.0001, 0.0901];
      expect(quoted.reduce((a, b) => a + b, 0)).toBeCloseTo(0.9998, 4);
      expect(mdx).toContain('= 0.9998');
    });
  });

  describe('exercise 2 — what one Bayes factor buys', () => {
    it('moves PP4 from 0.0901 to 0.7122, about eightfold', () => {
      const before = colocPosteriors(GWAS, FLAT).pp4;
      const after = colocPosteriors(GWAS, WEAK).pp4;
      expect(before).toBeCloseTo(0.0901, 4);
      expect(after).toBeCloseTo(0.7122, 4);
      expect(after / before).toBeGreaterThan(7.5);
      expect(after / before).toBeLessThan(8.5);
      expect(mdx).toContain('0.0901 \\;\\longrightarrow\\; 0.7122');
    });
  });

  describe('exercise 3 — the prior nobody examines', () => {
    it('gives three incompatible conclusions from one dataset', () => {
      const rows: [number, number, number][] = [
        [1e-6, 0.7934, 0.1983],
        [1e-5, 0.2849, 0.7122],
        [1e-4, 0.0384, 0.9612],
      ];
      for (const [p12, pp1, pp4] of rows) {
        const p = colocPosteriors(GWAS, WEAK, 1e-4, 1e-4, p12);
        expect(p.pp1).toBeCloseTo(pp1, 4);
        expect(p.pp4).toBeCloseTo(pp4, 4);
        expect(mdx).toContain(pp4.toFixed(4));
      }
    });

    it('leaves a decisive locus almost untouched by the same prior sweep', () => {
      // the solution's closing claim: prior sensitivity is a symptom of weak data
      for (const p12 of [1e-6, 1e-5, 1e-4]) {
        expect(colocPosteriors(GWAS, SHARED, 1e-4, 1e-4, p12).pp4).toBeGreaterThan(0.99);
      }
    });
  });
});

/**
 * Guard for a foot-gun this file has hit three times.
 *
 * These assertions quote LaTeX, and in a JS single-quoted string a lone backslash is an
 * escape: '\;' is ';', not '\;'. An assertion written that way searches for text the lesson
 * does not contain — and where the mangled string happens to occur anyway, it passes while
 * proving nothing.
 *
 * A backslash run may be odd only when it escapes the closing-quote character, which is the
 * one legitimate single-backslash escape these strings use.
 */
describe('these assertions themselves', () => {
  it('escape every backslash, so no toContain is silently searching for the wrong text', () => {
    const src = readFileSync('src/lib/deepDiveExamples.test.ts', 'utf8');
    const offenders: string[] = [];
    for (const m of src.matchAll(/toContain\('((?:[^'\\]|\\.)*)'\)/g)) {
      const body = m[1];
      for (const run of body.matchAll(/\\+/g)) {
        const after = body[run.index! + run[0].length];
        if (run[0].length % 2 === 1 && after !== "'") offenders.push(body.slice(0, 70));
      }
    }
    expect(offenders, 'odd backslash run: the string is not what it looks like').toEqual([]);
  });
});

describe('data-regulatory-maps', () => {
  const mdx = lesson('data-regulatory-maps');
  const BG_IN = 800, BG_OUT = 9200;

  describe('worked example — fine-mapped variants in cCREs', () => {
    it('states the two rates', () => {
      expect(120 / 500).toBeCloseTo(0.24, 12);
      expect(BG_IN / (BG_IN + BG_OUT)).toBeCloseTo(0.08, 12);
      expect(mdx).toContain('\\frac{120}{500} = 0.2400');
      expect(mdx).toContain('= 0.0800');
    });

    it('expects 40 variants and observes three times that', () => {
      expect(500 * 0.08).toBeCloseTo(40, 12);
      expect(foldEnrichment(120, 500, 0.08)).toBeCloseTo(3, 12);
      expect(mdx).toContain('500 \\times 0.0800 = 40.0');
      expect(mdx).toContain('\\frac{0.2400}{0.0800} = 3.0000');
    });

    it('gives a Fisher p of 6.473e-26', () => {
      const p = fisherExactP(120, 380, BG_IN, BG_OUT);
      expect(p).toBeGreaterThan(0);
      expect(p / 6.473e-26).toBeCloseTo(1, 2); // relative: the value is ~1e-26
      expect(mdx).toContain('6.473\\times10^{-26}');
    });
  });

  describe('figure 1 — enrichment against significance', () => {
    it('draws four studies whose p-values the module reproduces', () => {
      const rows: [number, number, string][] = [
        [3, 500, '6.5e-26'],
        [3, 50, '4.9e-4'],
        [3, 12, '6.5e-2'],
        [1.4, 500, '8.8e-3'],
      ];
      for (const [fold, total, shown] of rows) {
        const a = Math.round(total * 0.08 * fold);
        const p = fisherExactP(a, total - a, BG_IN, BG_OUT);
        // the label the generator drew, to one significant figure of the mantissa
        const [m, e] = shown.split('e');
        expect(Math.log10(p)).toBeCloseTo(Math.log10(Number(m) * 10 ** Number(e)), 1);
        expect(mdx).toContain(shown.replace('e', 'e'));
      }
      expect(mdx).toContain('p = 0.05');
    });
  });

  describe('exercise 1 — the same enrichment, a different verdict', () => {
    it('is slightly more enriched and not significant', () => {
      const fold = foldEnrichment(3, 12, 0.08);
      const p = fisherExactP(3, 9, BG_IN, BG_OUT);
      expect(fold).toBeCloseTo(3.125, 4);
      expect(fold).toBeGreaterThan(3); // more enriched than the worked example
      expect(p).toBeCloseTo(0.06549, 5);
      expect(p).toBeGreaterThan(0.05); // and not significant
      expect(mdx).toContain('\\frac{0.25}{0.08} = 3.1250');
      expect(mdx).toContain('6.549\\times10^{-2}');
    });
  });

  describe('exercise 2 — significant and uninteresting', () => {
    it('is 1.4-fold at p 8.75e-3, more significant than a 3.1-fold on twelve', () => {
      const fold = foldEnrichment(56, 500, 0.08);
      const p = fisherExactP(56, 444, BG_IN, BG_OUT);
      expect(fold).toBeCloseTo(1.4, 12);
      expect(p).toBeCloseTo(0.00875, 5);
      expect(p).toBeLessThan(fisherExactP(3, 9, BG_IN, BG_OUT));
      expect(mdx).toContain('\\frac{0.1120}{0.08} = 1.4000');
      expect(mdx).toContain('8.750\\times10^{-3}');
    });

    it('amounts to sixteen variants above expectation', () => {
      expect(56 - 500 * 0.08).toBeCloseTo(16, 12);
      expect(mdx).toContain('56 - 500 \\times 0.08 = 16');
    });
  });

  describe('exercise 3 — the background you did not choose carefully', () => {
    it('collapses the enrichment as the control rate rises', () => {
      const rows: [number, number, number, number][] = [
        [0.08, 3.0, 800, 9200],
        [0.12, 2.0, 1200, 8800],
        [0.18, 4 / 3, 1800, 8200],
      ];
      let prevP = 0;
      for (const [bg, fold, c, d] of rows) {
        expect(foldEnrichment(120, 500, bg)).toBeCloseTo(fold, 4);
        const p = fisherExactP(120, 380, c, d);
        expect(p).toBeGreaterThan(prevP); // weaker background -> weaker significance
        prevP = p;
      }
      expect(mdx).toContain('4.427\\times10^{-13}');
      expect(mdx).toContain('6.224\\times10^{-4}');
    });

    it('leaves the observed rate untouched throughout', () => {
      expect(120 / 500).toBeCloseTo(0.24, 12);
    });
  });
});

describe('data-gwas-summary-stats', () => {
  const mdx = lesson('data-gwas-summary-stats');
  const SE = [0.008, 0.009];
  const twoSided = (z: number) => 2 * (1 - normalCdf(Math.abs(z)));

  describe('worked example — a palindromic SNP flipped between two studies', () => {
    it('has frequencies that sum to one, which is the tell', () => {
      expect(0.18 + 0.82).toBeCloseTo(1, 12);
      expect(mdx).toContain('EAF 0.18');
      expect(mdx).toContain('EAF 0.82');
    });

    it('nearly cancels when the files are taken at face value', () => {
      const m = ivwMeta([0.043, -0.041], SE);
      expect(m.beta).toBeCloseTo(0.005924, 6);
      expect(m.se).toBeCloseTo(0.005979, 6);
      const z = m.beta / m.se;
      expect(z).toBeCloseTo(0.9908, 4);
      expect(twoSided(z)).toBeCloseTo(0.3218, 4);
      expect(mdx).toContain('0.005924');
      expect(mdx).toContain('p = 0.3218');
    });

    it('is genome-wide significant once aligned', () => {
      const m = ivwMeta([0.043, 0.041], SE);
      expect(m.beta).toBeCloseTo(0.042117, 6);
      const z = m.beta / m.se;
      expect(z).toBeCloseTo(7.0439, 4);
      expect(twoSided(z)).toBeLessThan(5e-8);
      expect(mdx).toContain('0.042117');
      expect(mdx).toContain('1.882\\times10^{-12}');
    });

    it('shares a standard error between the two, so only the sign moved', () => {
      expect(ivwMeta([0.043, 0.041], SE).se).toBeCloseTo(ivwMeta([0.043, -0.041], SE).se, 12);
    });
  });

  describe('worked example — the winner’s curse', () => {
    const T = zThreshold(5e-8);

    it('puts the genome-wide threshold at z = 5.4513', () => {
      expect(T).toBeCloseTo(5.4513, 4);
      expect(mdx).toContain('5.4513');
    });

    it('inflates a threshold-adjacent effect by 1.1466x', () => {
      const obs = winnersCurseExpectation(5.45, T);
      expect(obs).toBeCloseTo(6.2487, 4);
      expect(obs / 5.45).toBeCloseTo(1.1466, 4);
      expect(mdx).toContain('6.2487');
      expect(mdx).toContain('1.1466');
    });

    it('all but vanishes for a strong effect', () => {
      for (const [tz, obs, infl] of [[6.5, 6.7699, 1.0415], [8.0, 8.0156, 1.0019]] as const) {
        expect(winnersCurseExpectation(tz, T)).toBeCloseTo(obs, 4);
        expect(winnersCurseExpectation(tz, T) / tz).toBeCloseTo(infl, 4);
        expect(mdx).toContain(String(obs));
      }
    });

    it('is monotone decreasing in the true effect, which is the figure’s shape', () => {
      let prev = Infinity;
      for (const tz of [5.45, 5.8, 6.5, 7.2, 8.0, 9.0]) {
        const r = winnersCurseExpectation(tz, T) / tz;
        expect(r).toBeLessThan(prev);
        expect(r).toBeGreaterThan(1);
        prev = r;
      }
    });
  });

  describe('figure 1 — inflation against true effect', () => {
    it('marks the four ratios the module computes', () => {
      const T = zThreshold(5e-8);
      for (const tz of [5.45, 5.8, 6.5, 8.0]) {
        const r = winnersCurseExpectation(tz, T) / tz;
        expect(mdx).toContain(`${r.toFixed(4)}x`);
      }
      expect(mdx).toContain('discovery threshold, z = 5.4513');
    });
  });

  describe('exercise 3 — a replication that came back smaller', () => {
    it('has 6.2 as roughly what a true 5.45 publishes at', () => {
      const T = zThreshold(5e-8);
      expect(winnersCurseExpectation(5.45, T)).toBeCloseTo(6.25, 1);
      // so an unconditioned replication should land near the true value, not the published one
      expect(Math.abs(5.4 - 5.45)).toBeLessThan(Math.abs(5.4 - 6.2));
    });
  });
});
