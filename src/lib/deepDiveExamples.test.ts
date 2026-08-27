import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  moransI,
  spatialDesignEffectLimit,
  spatialDesignEffect,
  velocityDirectionFlipped,
  spliceVelocity,
  sameOrdering,
  steadyStateCellShares,
  traversalTimeShares,
  pseudotimeShares,
  varianceInflationFactor,
  centeringAttenuation,
  batchTypeCorrelation,
  dirichletMultinomialIcc,
  compositionCorrelation,
  clrShiftUnderSingleChange,
  centeredLogRatio,
  apparentLogFoldChanges,
  closureUpdate,
  closeComposition,
  twoSampleT,
  studentTQuantile,
  markerEvidenceMultiple,
  markerEvidenceBreakEven,
  markerContrastCeiling,
  markerContrast,
  markerEnrichment,
  expectedMarkerCounts,
  ambientExpectedCounts,
  soupShare,
  trustworthiness,
  adjustedRandIndex,
  graphModularity,
  relativeContrast,
  neighborPurity,
  knnGraph,
  seededNormals,
  covarianceMatrix,
  symmetricEigenvalues,
  marchenkoPasturEdge,
  transformSd,
  transformMean,
  poissonZeroProbability,
  nbZeroProbability,
  nbVariance,
  nbTheta,
  clusteredFalsePositiveRate,
  effectiveIndependentCells,
  designEffect,
  multipletRate,
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
  waldRatio, fStatistic, ivwMr, eggerRegression, weightedMedianMr,
  effectiveSampleSize, controlCeiling, genotypeDosage, imputationR2,
  callRate, piHat, inbreedingF, armitageTrend, benjaminiHochberg, bonferroni,
  liabilityRisk,

  fstHudsonParts,
  fstRatioOfAverages,
  fstAverageOfRatios,
  bbpThreshold,
  structureSpike,
  spikedEigenvalue,
  spikedEigenvectorOverlap,
  structureChiSquare,
  neutralAlleleAge,
  ehhHalfLength,
  sweepAgeAnomaly,
  sidakThreshold,
  chi2Cdf,
  predictedExpressionCorrelation,
  twasFalsePositiveProbability,
  twasCriticalCorrelation,
  twasNullZ,
  assortativeEquilibrium,
  sibBreedingValueCorrelation,
  falconerUnderAssortment,
  nurtureInflation,
  harmonic,
  bhRealisedFdr,
  storeyPi0,
  benjaminiYekutieli,
  type FstSite,
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

  describe('the genome-wide threshold, and figure 3', () => {
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
      // the span runs from the lower homozygote at -a to the heterozygote at d
      expect(Math.max(L.a, L.d) - -L.a).toBe(14);
      expect(mdx).toContain('span 14 units');
      expect(mdx).toMatch(/this\s+is not a small-effect locus/);
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

  it('counts the rank changes Figure 2 actually draws', () => {
    // The caption said "two of the genotypes cross". Two line-crossings occur, but three of
    // the four genotypes change rank (1->3, 2->1, 3->2, 4->4) — and rank change, not
    // crossing count, is the quantity the surrounding paragraph is about.
    const A = [1.2, 0.4, -0.5, -1.1];
    const B = [0.3, 2.4, 1.4, -0.9];
    const rank = (x: number[]) => x.map((v) => x.filter((w) => w > v).length + 1);
    const moved = rank(A).filter((r, k) => r !== rank(B)[k]).length;
    expect(moved).toBe(3);
    expect(rank(A)).toEqual([1, 2, 3, 4]);
    expect(rank(B)).toEqual([3, 1, 2, 4]);
    expect(spearman(A, B)).toBeLessThan(1);
    expect(mdx).toContain('Three of the four change rank');
    expect(mdx).toContain('three of');           // the figure's own margin note
    expect(mdx).not.toContain('Two of the genotypes cross');
  });
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
      // The caption now states the whole picture — three of four move — rather than the
      // single pair; the figure's own label still marks this genotype.
      expect(mdx).toContain('falls to third in B');
      expect(mdx).toContain('only third in B');
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
  const GENE_B = [4, -3, 5, -2, -3];

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
      // the prose claims the magnitudes are identical, so assert exactly that
      expect(GENE_A.map(Math.abs)).toEqual(GENE_B.map(Math.abs));
      expect(GENE_A.map(Math.abs)).toEqual([4, 3, 5, 2, 3]);
    });

    it('has weighted sums that differ by more than twentyfold', () => {
      const wsum = (S: number[]) => S.reduce((acc, sj, j) => acc + W[j] * sj, 0);
      expect(wsum(GENE_A)).toBeCloseTo(380.1, 4);
      expect(wsum(GENE_B)).toBeCloseTo(36.8181, 4);
      expect(mdx).toContain('= 380.1000');
      expect(mdx).toContain('= 36.8181');
    });

    it('collapses the burden statistic by a factor of 106.6', () => {
      const a = burdenStatistic(GENE_A, W);
      const b = burdenStatistic(GENE_B, W);
      expect(Math.round(a)).toBe(144476);
      expect(Math.round(b)).toBe(1356);
      expect(a / b).toBeCloseTo(106.6, 1);
      expect(mdx).toContain('380.1000^2 = 144{,}476');
      expect(mdx).toContain('36.8181^2 = 1{,}356');
      expect(mdx).toContain('factor of **106.6**');
      // The abstract renders as the page's lead paragraph and is also the citation
      // abstract, and no assertion here reached it — so it claimed a factor of 490 and
      // an eight-percent SKAT shift for months, contradicting the body two screens
      // below. Regexes because both sentences wrap a line.
      expect(mdx, 'abstract states the ratio the body derives').toMatch(
        /factor of 106\.6\s+while SKAT does not move\s+at all/
      );
      expect(mdx, 'exercise 3(a) states the same ratio').toMatch(
        /burden statistic 106\.6\s+times smaller/
      );
      expect(mdx, 'the wrong ratio must not survive anywhere in the lesson').not.toContain('490');
    });

    it('leaves SKAT essentially unchanged', () => {
      const a = skatQ(GENE_A, W);
      const b = skatQ(GENE_B, W);
      expect(Math.round(a)).toBe(32097);
      // identical, not merely close: squaring discards sign completely
      expect(Math.round(b)).toBe(32097);
      expect(a).toBeCloseTo(b, 10);
      expect(mdx).toContain('32{,}097');
      expect(mdx).toContain('Q^B_{\\mathrm{SKAT}} = 32{,}097');
    });

    it('has neither test dominating', () => {
      expect(burdenStatistic(GENE_A, W) / skatQ(GENE_A, W)).toBeCloseTo(4.501, 3);
      expect(skatQ(GENE_B, W) / burdenStatistic(GENE_B, W)).toBeCloseTo(23.7, 1);
      expect(mdx).toContain('$4.50\\times$');
      expect(mdx).toContain('$23.7\\times$');
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
        [0, 32097, 32097],
        [0.25, 60192, 24412],
        [0.5, 88286, 16726],
        [0.75, 116381, 9041],
        [1, 144476, 1356],
      ] as [number, number, number][]) {
        expect(Math.round(skatOQ(GENE_A, W, rho))).toBe(a);
        expect(Math.round(skatOQ(GENE_B, W, rho))).toBe(b);
      }
      for (const row of [
        '| 0 (pure SKAT) | 32,097 | 32,097 |',
        '| 0.5 | 88,286 | 16,726 |',
        '| 1 (pure burden) | 144,476 | 1,356 |',
      ]) {
        expect(mdx).toContain(row);
      }
    });

    it('is maximised at opposite endpoints for the two genes', () => {
      const best = (S: number[]) =>
        [0, 0.25, 0.5, 0.75, 1].reduce((b, r) => (skatOQ(S, W, r) > skatOQ(S, W, b) ? r : b), 0);
      expect(best(GENE_A)).toBe(1);
      expect(best(GENE_B)).toBe(0);
      expect(mdx).toMatch(/opposite\s+corners/);
    });

    it('is linear in rho, so the maximum is always at an endpoint', () => {
      for (const S of [GENE_A, GENE_B]) {
        const mid = skatOQ(S, W, 0.5);
        expect(mid).toBeCloseTo((skatOQ(S, W, 0) + skatOQ(S, W, 1)) / 2, 8);
      }
      expect(mdx).toContain('is linear in $\\rho$, which is why it cannot be the thing optimised');
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

  it('draws forest-plot boxes whose AREA tracks the inverse-variance weight', () => {
    // The caption states the decoding rule a reader uses on a forest plot, so the drawing
    // has to obey it. The generator originally set the SIDE affine in the weight
    // (4 + 12 w/w_max), which makes area go as the square — study 3 drew at 13% of the
    // largest box where its weight is 14%. Side now goes as the square root.
    const svg = lesson('statgen-meta-analysis-replication').match(/<svg[\s\S]*?<\/svg>/)![0];
    expect(svg).toContain('study 1');
    const sides = [...svg.matchAll(/<rect[^>]*width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(sides).toHaveLength(4);
    const weights = [0.02, 0.015, 0.04, 0.018].map((se) => 1 / se ** 2);
    const wMax = Math.max(...weights);
    const sMax = Math.max(...sides);
    // Boxes are emitted in study order, so area/areaMax must equal weight/weightMax.
    // Two decimal places, not three: figlib writes coordinates to one decimal, so a side
    // of 13.3333 is drawn as 13.3 and its area lands 0.0035 off. That is the renderer's
    // resolution, not a modelling error — the affine version was off by 0.11.
    weights.forEach((w, k) => {
      expect((sides[k] / sMax) ** 2, `study ${k + 1} box area`).toBeCloseTo(w / wMax, 2);
    });
    // and every box stays large enough to see
    expect(Math.min(...sides)).toBeGreaterThanOrEqual(5);
    expect(lesson('statgen-meta-analysis-replication')).toContain(
      'Box area is proportional to the inverse-variance weight'
    );
  });

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
      // chi-square on k-1 = 3 df, not 1 — the prose and this assertion were both wrong
      expect(1 - regularizedGammaP(fit.df / 2, fit.q / 2)).toBeCloseTo(0.1698, 4);
      expect(1 - regularizedGammaP(fit.df / 2, fit.q / 2)).toBeGreaterThan(0.05);
      expect(mdx).toContain('Q = 5.0276$ on 3 df');
      expect(mdx).toContain('0.1699');
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

    it('resolves the credible set to one variant as N grows, as Step 4 now says', () => {
      // Step 4 used to claim "No increase in sample size will separate them" at a purity of
      // |r| = 0.70. False: marginal z scales as sqrt(N) while LD does not, so the evidence
      // gap between causal and tag widens with N. Only |r| = 1 is beyond sample size.
      const setSize = (n: number) => {
        const v = 1 / (2 * P * (1 - P) * n);
        const z = SIGNAL.map((x) => x * Math.sqrt(n / N));
        return credibleSet(
          pipsFromAbf(
            z.map((x) => wakefieldAbf(x, v, W)),
            flat(8),
            PI0
          ),
          0.95
        ).indices.length;
      };
      expect(setSize(N)).toBe(3);
      expect(setSize(96000)).toBe(1);
      expect(setSize(95000)).toBeGreaterThan(1);
      expect(mdx).toContain('N \\approx 95{,}500');
      expect(mdx).not.toContain('No increase in sample size will separate them');
    });

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

describe('statgen-mendelian-randomization', () => {
  const mdx = lesson('statgen-mendelian-randomization');

  it('names the design before asserting which way weak instruments bias', () => {
    // The direction is not a general fact. One-sample MR shares individuals between the two
    // estimates, so correlated errors pull toward the observational association; two-sample
    // MR has independent errors and attenuates toward the null. The lesson stated the
    // one-sample direction as universal and named neither design anywhere.
    expect(mdx).toContain('**one-sample** MR');
    expect(mdx).toContain('**two-sample** MR');
    expect(mdx).toMatch(/bias runs toward the confounded observational/);
    expect(mdx).toMatch(/bias runs toward the \*\*null\*\*/);
    expect(mdx).not.toMatch(/biases\* the\s+ratio, toward the confounded/);
  });
  const TRUE = 0.3;
  const GX = [0.1, 0.12, 0.08, 0.15, 0.09, 0.11, 0.13, 0.07];
  const SEX = GX.map(() => 0.01);
  const PLEIO = [0, 0, 0, 0, 0, 0.02, 0.02, 0.02];
  const GY = GX.map((g, i) => Number((TRUE * g + PLEIO[i]).toFixed(6)));
  const SEY = GX.map(() => 0.006);

  describe('worked example — eight instruments, three pleiotropic', () => {
    it('gives every valid instrument a Wald ratio of exactly the truth', () => {
      for (let i = 0; i < 5; i++) expect(waldRatio(GX[i], GY[i])).toBeCloseTo(TRUE, 10);
      expect(waldRatio(0.15, 0.045)).toBeCloseTo(0.3, 12);
      expect(mdx).toContain('\\frac{0.045}{0.15} = 0.3000');
    });

    it('inflates the pleiotropic ones most where the instrument is weakest', () => {
      const bad = [5, 6, 7].map((i) => ({ g: GX[i], r: waldRatio(GX[i], GY[i]) }));
      expect(bad.map((b) => +b.r.toFixed(4))).toEqual([0.4818, 0.4538, 0.5857]);
      // the weakest instrument of the three gets the largest inflation
      const weakest = bad.reduce((a, b) => (b.g < a.g ? b : a));
      expect(weakest.r).toBe(Math.max(...bad.map((b) => b.r)));
      expect(mdx).toContain('0.4818');
      expect(mdx).toContain('0.5857');
    });

    it('has every instrument strong, so weak-instrument bias is not the cause', () => {
      const fs = GX.map((g, i) => fStatistic(g, SEX[i]));
      expect(Math.min(...fs)).toBeCloseTo(49, 6);
      expect(Math.max(...fs)).toBeCloseTo(225, 6);
      expect(Math.min(...fs)).toBeGreaterThan(10);
      expect(mdx).toContain('49 to 225');
    });

    it('biases IVW 21.7% high, with an interval excluding the truth', () => {
      const fit = ivwMr(GX, GY, SEY);
      expect(fit.beta).toBeCloseTo(0.365058, 6);
      expect(fit.se).toBeCloseTo(0.019436, 6);
      expect((fit.beta / TRUE - 1) * 100).toBeCloseTo(21.7, 1);
      const lo = fit.beta - 1.96 * fit.se;
      expect(lo).toBeGreaterThan(TRUE);
      expect(lo).toBeCloseTo(0.327, 3);
      expect(fit.beta + 1.96 * fit.se).toBeCloseTo(0.4032, 3);
      expect(mdx).toContain('0.365058');
      expect(mdx).toContain('**21.7% too high**');
    });
  });

  describe('worked example — three estimators', () => {
    const ivw = ivwMr(GX, GY, SEY);
    const egg = eggerRegression(GX, GY, SEY);

    it('has the three-row table', () => {
      expect(ivw.beta).toBeCloseTo(0.365058, 6);
      expect(egg.slope).toBeCloseTo(0.264912, 6);
      expect(egg.seSlope).toBeCloseTo(0.157663, 6);
      expect(weightedMedianMr(GX, GY, SEY)).toBeCloseTo(0.3, 10);
      for (const row of [
        '| IVW | 0.365058 | 0.019436 | 0.3270 to 0.4032 |',
        '| MR-Egger slope | 0.264912 | 0.157663 | −0.0441 to 0.5739 |',
        '| weighted median | 0.300000 | — | — |',
      ]) {
        expect(mdx).toContain(row);
      }
    });

    it('makes Egger 8.1 times less precise than IVW', () => {
      expect(egg.seSlope / ivw.se).toBeCloseTo(8.11, 2);
      expect(egg.slope - 1.96 * egg.seSlope).toBeLessThan(0);
      expect(egg.slope + 1.96 * egg.seSlope).toBeCloseTo(0.5739, 3);
      expect(mdx).toContain('**8.1 times wider**');
    });

    it('has the weighted median land exactly on the truth', () => {
      expect(weightedMedianMr(GX, GY, SEY)).toBe(0.3);
      expect(mdx).toContain('$0.300000$, because five of eight');
    });

    it('has an Egger intercept that is real but not significant', () => {
      expect(egg.intercept).toBeCloseTo(0.011228, 6);
      expect(egg.seIntercept).toBeCloseTo(0.017208, 6);
      const t = egg.intercept / egg.seIntercept;
      expect(t).toBeCloseTo(0.6525, 4);
      const p = 2 * (1 - normalCdf(Math.abs(t)));
      expect(p).toBeCloseTo(0.5141, 4);
      expect(p).toBeGreaterThan(0.05);
      // the pleiotropy it fails to detect is real and biases IVW by 21.7%
      expect(PLEIO.filter((x) => x > 0).length).toBe(3);
      expect(mdx).toContain('= 0.6525');
      expect(mdx).toContain('p = 0.5141');
      expect(mdx).toContain('is not evidence that there is no pleiotropy');
    });
  });

  describe('exercise 1 — one instrument, two checks', () => {
    it('gives F = 225 for a strong instrument and 4 for a weak one', () => {
      expect(fStatistic(0.15, 0.01)).toBeCloseTo(225, 8);
      expect(fStatistic(0.02, 0.01)).toBeCloseTo(4, 10);
      expect(1 / fStatistic(0.02, 0.01)).toBeCloseTo(0.25, 10);
      expect(mdx).toContain('(0.15/0.010)^2 = 225');
      expect(mdx).toContain('(0.02/0.010)^2 = 4');
      expect(mdx).toContain('1/4 = 25\\%');
    });
  });

  describe('exercise 2 — removing the bad instruments', () => {
    it('returns IVW to exactly the truth on the five valid instruments', () => {
      const fit = ivwMr(GX.slice(0, 5), GY.slice(0, 5), SEY.slice(0, 5));
      expect(fit.beta).toBeCloseTo(0.3, 10);
      expect(fit.se).toBeCloseTo(0.024214, 6);
      expect(mdx).toContain('0.300000$ with $\\mathrm{SE} = 0.024214');
    });

    it('is less precise than the biased eight-instrument fit', () => {
      // dropping instruments costs precision, which is why nobody drops at random
      const five = ivwMr(GX.slice(0, 5), GY.slice(0, 5), SEY.slice(0, 5));
      const eight = ivwMr(GX, GY, SEY);
      expect(five.se).toBeGreaterThan(eight.se);
    });
  });
});

describe('statgen-deep-learning-synthesis', () => {
  const mdx = lesson('statgen-deep-learning-synthesis');
  // threshold, TPR, FPR, and the LR+ exactly as the table prints it. The fourth element
  // is not decoration: 0.95/0.4 is exactly 2.375, but in floating point it is
  // 2.3749999999999996, so `.toFixed(2)` produced "2.37" where the arithmetic says 2.38.
  // Carrying the printed string lets the test check the *display*, not just the value.
  const SWEEP: [string, number, number, string][] = [
    ['0.50', 0.95, 0.4, '2.375'],
    ['0.75', 0.88, 0.2, '4.40'],
    ['0.90', 0.78, 0.12, '6.50'],
    ['0.98', 0.62, 0.06, '10.33'],
    ['0.995', 0.41, 0.015, '27.33'],
    ['0.999', 0.22, 0.004, '55.00'],
  ];

  describe('worked example — what a score of 0.98 is worth', () => {
    it('has a likelihood ratio of 10.333333', () => {
      expect(likelihoodRatioPositive(0.62, 0.06)).toBeCloseTo(10.333333, 6);
      expect(mdx).toContain('\\frac{0.62}{0.06} = 10.333333');
    });

    it('converts to 3.189350 points', () => {
      const pts = oddsPathPoints(likelihoodRatioPositive(0.62, 0.06));
      expect(pts).toBeCloseTo(3.18935, 5);
      // the conversion written out, independently of the helper
      expect((8 * Math.log(10.333333)) / Math.log(350)).toBeCloseTo(pts, 6);
      expect(mdx).toContain('8 \\times 0.398669 = 3.189350');
    });

    it('attains moderate, not strong — the tier reached, not the nearest', () => {
      const lr = likelihoodRatioPositive(0.62, 0.06);
      expect(oddsPathStrength(lr)).toBe('moderate');
      expect(oddsPathPoints(lr)).toBeGreaterThan(2);
      expect(oddsPathPoints(lr)).toBeLessThan(4);
      expect(mdx).toContain('the tier it *attains*');
    });

    it('moves a 10% prior to 53.4%, not to anything classifying', () => {
      const post = acmgPosterior(oddsPathPoints(likelihoodRatioPositive(0.62, 0.06)));
      expect(post).toBeCloseTo(0.534483, 6);
      expect(post).toBeLessThan(0.9);
      expect(mdx).toContain('0.534483');
    });

    it('would need a 0.18% false-positive rate for very strong', () => {
      expect(oddsPathFor('very-strong')).toBeCloseTo(350, 6);
      expect(0.62 / 350).toBeCloseTo(1.7714e-3, 7);
      expect(0.06 / (0.62 / 350)).toBeCloseTo(33.9, 1);
      expect(mdx).toContain('1.7714\\times10^{-3}');
      expect(mdx).toContain('thirty-four times tighter');
    });

    it('has the tier boundaries at the eighth roots of 350', () => {
      expect(oddsPathFor('supporting')).toBeCloseTo(2.0797, 4);
      expect(oddsPathFor('moderate')).toBeCloseTo(4.3253, 4);
      expect(oddsPathFor('strong')).toBeCloseTo(18.7083, 4);
      for (const v of ['2.08', '4.33', '18.71']) expect(mdx).toContain(v);
    });

    it('reproduces the guideline classification boundaries', () => {
      expect(acmgPosterior(10)).toBeCloseTo(0.994, 3);
      expect(acmgPosterior(6)).toBeCloseTo(0.9, 3);
      expect(mdx).toContain('10 points gives a posterior of 0.994');
    });
  });

  it('prices the two exercise instruments at 1.893 and 4.645 points', () => {
    // 0.30/0.01 = 30 exactly, and 8 ln(30)/ln(350) = 4.6449 — printed as 4.640 for a while,
    // which nothing caught because no assertion covered an exercise solution's arithmetic.
    expect(oddsPathPoints(likelihoodRatioPositive(0.8, 0.2))).toBeCloseTo(1.8932, 4);
    expect(oddsPathPoints(likelihoodRatioPositive(0.3, 0.01))).toBeCloseTo(4.6449, 4);
    // Regex, not toContain: the solution wraps its line between "1.893$" and "points".
    expect(mdx).toMatch(/1\.893\$\s+points/);
    expect(mdx).toMatch(/4\.645\$\s+points/);
  });

  describe('worked example — accuracy-optimal is not evidence-optimal', () => {
    it('has the six-row table the lesson prints', () => {
      for (const [thr, tpr, fpr, shownLr] of SWEEP) {
        const lr = likelihoodRatioPositive(tpr, fpr);
        const pts = oddsPathPoints(lr);
        expect(mdx).toContain(`| ${thr} | ${tpr.toFixed(2)} |`);
        expect(mdx).toContain(pts.toFixed(3));
        expect(mdx).toContain(acmgPosterior(pts).toFixed(4));
        // The printed LR+ must be the exact ratio rounded at its own precision. Two
        // floating-point traps sit here and a tolerance comparison falls into both:
        // 0.95/0.4 evaluates to 2.3749999999999996 rather than 2.375, and 2.375 - 2.37
        // evaluates to 0.004999999999999893 rather than 0.005 — so a mis-rounded "2.37"
        // slips under any epsilon. Doing the whole thing in integers avoids both: the
        // ratio becomes 950/400, and rounding happens on 237.5, where Math.round goes up.
        const decimals = shownLr.split('.')[1]?.length ?? 0;
        const scaled = (Math.round(tpr * 1000) * 10 ** decimals) / Math.round(fpr * 1000);
        expect(shownLr, `LR+ printed as ${shownLr}`).toBe(
          (Math.round(scaled) / 10 ** decimals).toFixed(decimals)
        );
        expect(mdx).toContain(shownLr);
        // Youden's J, the column that made the lesson's point and had no assertion. The
        // winning row bolds its cell, so accept either form.
        const jCell = (tpr - fpr).toFixed(3);
        expect(
          mdx.includes(`| ${jCell} |`) || mdx.includes(`| **${jCell}** |`),
          `J cell ${jCell}`
        ).toBe(true);
      }
    });

    it("maximises Youden's J at 0.75 and the likelihood ratio at 0.999", () => {
      const j = (r: (typeof SWEEP)[number]) => r[1] - r[2];
      const lr = (r: (typeof SWEEP)[number]) => likelihoodRatioPositive(r[1], r[2]);
      const bestJ = SWEEP.reduce((a, b) => (j(b) > j(a) ? b : a));
      const bestLr = SWEEP.reduce((a, b) => (lr(b) > lr(a) ? b : a));
      expect(bestJ[0]).toBe('0.75');
      expect(bestLr[0]).toBe('0.999');
      expect(j(bestJ)).toBeCloseTo(0.68, 10);
      expect(lr(bestLr)).toBeCloseTo(55, 10);
      // the evidence-optimal threshold has the WORST J in the table
      expect(j(bestLr)).toBeCloseTo(Math.min(...SWEEP.map(j)), 10);
      expect(mdx).toContain('**0.680**');
      expect(mdx).toContain('**55.00**');
    });

    it('moves the posterior from 0.3284 to 0.8594 on threshold alone', () => {
      const post = (tpr: number, fpr: number) =>
        acmgPosterior(oddsPathPoints(likelihoodRatioPositive(tpr, fpr)));
      expect(post(0.88, 0.2)).toBeCloseTo(0.3284, 4);
      expect(post(0.22, 0.004)).toBeCloseTo(0.8594, 4);
      expect(mdx).toContain('$0.3284$');
      expect(mdx).toContain('$0.8594$');
    });

    it('has the two criteria moving in opposite directions across the sweep', () => {
      const j = SWEEP.map((r) => r[1] - r[2]);
      const pts = SWEEP.map((r) => oddsPathPoints(likelihoodRatioPositive(r[1], r[2])));
      // points rise monotonically; J does not
      for (let i = 1; i < pts.length; i++) expect(pts[i]).toBeGreaterThan(pts[i - 1]);
      expect(j[j.length - 1]).toBeLessThan(j[0]);
    });
  });

  describe('exercise 1 — two predictors', () => {
    it('makes A the better classifier and B the better evidence', () => {
      const a = likelihoodRatioPositive(0.8, 0.2);
      const b = likelihoodRatioPositive(0.3, 0.01);
      expect(a).toBeCloseTo(4, 10);
      expect(b).toBeCloseTo(30, 10);
      expect(oddsPathPoints(a)).toBeCloseTo(1.893, 3);
      expect(oddsPathPoints(b)).toBeCloseTo(4.64, 2);
      expect(oddsPathStrength(a)).toBe('supporting');
      expect(oddsPathStrength(b)).toBe('strong');
      // A wins on Youden, B on evidence
      expect(0.8 - 0.2).toBeGreaterThan(0.3 - 0.01);
      expect(acmgPosterior(oddsPathPoints(a))).toBeCloseTo(0.3077, 4);
      expect(acmgPosterior(oddsPathPoints(b))).toBeCloseTo(0.7692, 4);
      expect(mdx).toContain('0.80/0.20 = 4.000000');
      expect(mdx).toContain('0.30/0.01 = 30.000000');
    });
  });

  describe('exercise 2 — how good would a predictor have to be', () => {
    it('needs OddsPath 18.708287 for strong, and 2.7% FPR at TPR 0.50', () => {
      expect(oddsPathFor('strong')).toBeCloseTo(18.708287, 6);
      expect(0.5 / oddsPathFor('strong')).toBeCloseTo(0.026726, 6);
      expect(mdx).toContain('350^{4/8} = 18.708287');
      expect(mdx).toContain('0.026726');
    });

    it('shows three supporting criteria fall short of strong', () => {
      expect(1 + 1 + 1).toBeLessThan(4);
      expect(oddsPathStrength(oddsPathFor('supporting') ** 3)).toBe('moderate');
      expect(mdx).toContain('still moderate');
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

  it('states an M_e the r² and R²_PRS beside it actually follow from', () => {
    // The sentence exists to keep M (variant count) and M_e (independent segments)
    // apart, and had M_e = 10^6 — M's value — beside numbers that require 10,000.
    // At 10^6 the accuracy would be r² = 0.005964, not 0.375.
    const r2 = (20000 * 0.3) / (20000 * 0.3 + 10000);
    expect(r2).toBeCloseTo(0.375, 10);
    expect(predictionAccuracy(20000, 0.3, 10000) ** 2).toBeCloseTo(r2, 10);
    expect(0.3 * r2).toBeCloseTo(0.1125, 10);
    expect((20000 * 0.3) / (20000 * 0.3 + 1e6)).toBeCloseTo(0.005964, 6);
    expect(mdx).toMatch(/M_e = 10\{,\}000\$ the two read/);
    expect(mdx).toContain('r^2 = 0.375');
    expect(mdx).toContain('R^2_{\\mathrm{PRS}} = 0.1125');
    // and it must agree with the BLUP lesson, which states the same example
    expect(lesson('statgen-blup-genomic-selection')).toContain('M_e = 10{,}000');
  });

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

describe('statistical-genetics (hub)', () => {
  const mdx = lesson('statistical-genetics');
  const P = 0.3;
  const BETA = 0.05;
  const H2 = 0.3;
  const M = 1e6;

  // The one variant the hub traces through all five modules. Each module contributes one
  // number, and the last two are the point of the page: the sample size that makes the
  // variant a discovery, and the accuracy a whole score reaches at that same sample size.
  const q2 = varianceExplained(P, BETA);
  const K = (Math.sqrt(chi2Quantile(1 - 5e-8, 1)) + normalQuantile(0.8)) ** 2;
  const N = Math.ceil(K / q2);

  describe('worked example — one common variant, five modules', () => {
    it('module 1 states the genome-wide threshold on both scales', () => {
      expect(chi2Quantile(1 - 5e-8, 1)).toBeCloseTo(29.7168, 4);
      expect(Math.sqrt(chi2Quantile(1 - 5e-8, 1))).toBeCloseTo(5.4513, 4);
      expect(mdx).toContain('29.7168');
      expect(mdx).toContain('5.4513');
    });

    it('module 2 counts 90 homozygous carriers per thousand, in Module 2\'s notation', () => {
      expect(1000 * P * P).toBe(90);
      expect(mdx).toContain('1000 \\times 0.30^2 = 90');
      // statgen-population-infinitesimal writes the MINOR allele q and the major p, so the
      // hub may not call p the minor allele — it is the effect allele, as in Module 4.
      expect(mdx).toContain("Effect-allele frequency at the tested variant");
      expect(mdx).not.toContain('Minor allele frequency at the tested variant');
      expect(lesson('statgen-population-infinitesimal')).toContain('minor allele frequency is $q');
    });

    it('module 3 gives q² = 1.05e-3, which is 0.105% of the trait and 0.35% of h²', () => {
      expect(q2).toBeCloseTo(1.05e-3, 12);
      expect(mdx).toContain('1.05 \\times 10^{-3}');
      expect(100 * q2).toBeCloseTo(0.105, 6);
      expect(mdx).toContain('0.105%');
      expect((100 * q2) / H2).toBeCloseTo(0.35, 6);
      expect(mdx).toContain('0.35%');
    });

    it('module 4 needs 37,716 people, from the q²-parameterised constant 39.60', () => {
      expect(K).toBeCloseTo(39.600989, 6);
      expect(N).toBe(37716);
      // The displayed division must produce the displayed result: 39.60/1.05e-3 is
      // 37,714.29, and only the unrounded 39.600989 gives 37,716.
      expect(Math.ceil(39.6 / q2), 'the rounded constant gives a different N').toBe(37715);
      expect(mdx).toContain('\\frac{39.600989}{1.05 \\times 10^{-3}} = 37{,}716');
      expect(mdx).toContain('(z_{\\alpha/2} + z_\\beta)^2 = 39.600989');
    });

    it('module 5 reaches R² = 3.3565e-3 at that same N — 0.34% of the trait', () => {
      const r2 = expectedR2(N, M, H2);
      expect(r2).toBeCloseTo(3.356462e-3, 9);
      expect(mdx).toContain('3.3565 \\times 10^{-3}');
      expect(mdx).toContain('0.34% of the trait');
      // The comparison that makes the gap concrete: the whole score is worth 3.2 single
      // variants, and 1.1% of the heritability that exists.
      expect(r2 / q2).toBeCloseTo(3.197, 3);
      expect(mdx).toContain('3.2 times what the single variant does');
      expect(100 * (r2 / H2)).toBeCloseTo(1.1188, 4);
      expect(mdx).toContain('1.1% of the heritability');
    });

    it('prices the rest of the ceiling at 88x and 795x the discovery sample', () => {
      const half = Math.ceil(sampleSizeForR2(0.15, M, H2));
      const ninety = Math.ceil(sampleSizeForR2(0.27, M, H2));
      expect(half).toBe(3333334);
      expect(ninety).toBe(30000001);
      expect(mdx).toContain('3{,}333{,}334');
      expect(mdx).toContain('30{,}000{,}001');
      expect(half / N).toBeCloseTo(88.4, 1);
      expect(ninety / N).toBeCloseTo(795.4, 1);
      expect(mdx).toContain('88 times the discovery sample');
      expect(mdx).toContain('795 times');
    });

    it('gives the instrument the same F as the discovery chi-square', () => {
      // For a single instrument F = (gamma/SE)^2, which is the variant's association
      // chi-square in the exposure GWAS — and that is N q^2, the non-centrality the power
      // calculation solved for. The hub said F = 25 from an invented SE of 0.010, which
      // would have put the variant *below* the 29.7168 discovery threshold it had just
      // cleared two paragraphs earlier.
      expect(N * q2).toBeCloseTo(39.6018, 4);
      // N was rounded up to a whole person, so N q^2 sits just above the constant it
      // was solved from — never below, or the study would be underpowered.
      expect(N * q2).toBeGreaterThanOrEqual(K);
      expect(N * q2 - K).toBeLessThan(q2);
      expect(mdx).toContain('Nq^2 = 39.60');
      // Anything genome-wide significant is past the conventional F > 10 by construction.
      expect(chi2Quantile(1 - 5e-8, 1)).toBeGreaterThan(10);
      expect(mdx).not.toContain('F = (\\beta/\\text{SE})^2 = 25');
    });
  });

  describe('figure 1 — every label it draws', () => {
    it('marks the three sample sizes and the accuracies at them', () => {
      expect(expectedR2(37716, M, H2) * 100).toBeCloseTo(0.3356, 4);
      expect(expectedR2(3333334, M, H2) * 100).toBeCloseTo(15, 4);
      expect(expectedR2(30000001, M, H2) * 100).toBeCloseTo(27, 4);
      for (const label of ['0.34%', '15%', '27%', '37,716', '3.3M', '30M', 'ceiling: h² = 30%']) {
        expect(mdx, `figure label ${label}`).toContain(label);
      }
    });

    it('draws the ceiling at h², which the curve never reaches', () => {
      expect(expectedR2(1e12, M, H2)).toBeLessThan(H2);
      expect(mdx).toContain('approaches $h^2$ and never arrives');
    });
  });

  describe('exercises', () => {
    it('1 — raising h² leaves q² and the discovery N untouched, and moves R²', () => {
      // q² depends on p and β only, so (a) is "no" twice over; (b) is the whole point.
      expect(varianceExplained(P, BETA)).toBe(q2);
      expect(expectedR2(N, M, 0.6)).toBeCloseTo(0.013277, 6);
      expect(mdx).toContain('= 0.013277');
      expect(mdx).toContain('1.33% of the trait');
      // Doubling h² multiplies R² by very nearly four, because h² is both the ceiling
      // and the numerator inside the shrinkage term.
      expect(expectedR2(N, M, 0.6) / expectedR2(N, M, H2)).toBeCloseTo(3.9557, 4);
    });

    it('3 — a million more samples beats better phenotyping here, and not everywhere', () => {
      expect(expectedR2(5e5, M, 0.3)).toBeCloseTo(0.03913, 5);
      expect(expectedR2(1.5e6, M, 0.3)).toBeCloseTo(0.093103, 6);
      expect(expectedR2(5e5, M, 0.36)).toBeCloseTo(0.054915, 6);
      // (c) The answer flips once the study is already large: the extra samples buy a
      // shrinking increment while the higher ceiling is worth the same at every N.
      const better = (n: number) => expectedR2(n + 1e6, M, 0.3) > expectedR2(n, M, 0.36);
      expect(better(5e5)).toBe(true);
      expect(better(2e6)).toBe(false);
      let lo = 1e6;
      let hi = 1e7;
      for (let i = 0; i < 80; i += 1) {
        const mid = (lo + hi) / 2;
        if (better(mid)) lo = mid;
        else hi = mid;
      }
      expect(Math.round(lo)).toBe(1595256);
      expect(mdx).toContain('1{,}595{,}256');
      expect(mdx).toContain('= 0.039130');
      expect(mdx).toContain('R^2 = 0.093103');
      expect(mdx).toContain('= 0.054915');
      // The two gains the solution quotes, in percentage points.
      expect(100 * (expectedR2(1.5e6, M, 0.3) - expectedR2(5e5, M, 0.3))).toBeCloseTo(5.3973, 4);
      expect(mdx).toContain('5.40 percentage');
      expect(100 * (expectedR2(5e5, M, 0.36) - expectedR2(5e5, M, 0.3))).toBeCloseTo(1.5785, 4);
      expect(mdx).toContain('1.58 percentage');
    });
  });
});

describe('gwas-study-design', () => {
  const mdx = lesson('gwas-study-design');
  const CASES = 10000;
  const CONTROLS = 40000;
  const K = (Math.sqrt(chi2Quantile(1 - 5e-8, 1)) + normalQuantile(0.8)) ** 2;

  describe('worked example — where the next ten thousand samples go', () => {
    it('step 1: 50,000 people are worth 32,000, and balanced would be worth all of them', () => {
      expect(effectiveSampleSize(CASES, CONTROLS)).toBeCloseTo(32000, 9);
      expect(effectiveSampleSize(25000, 25000)).toBeCloseTo(50000, 9);
      expect(mdx).toContain('= 32{,}000');
      expect(mdx).toContain('N_{\\mathrm{eff}} = 50{,}000$, the headcount exactly');
      // the 4:1 split costs exactly 18,000 effective samples
      // toBeCloseTo, not toBe: the two harmonic means are exact in decimal but not in
      // binary, and the difference lands on 17999.999999999993.
      expect(
        effectiveSampleSize(25000, 25000) - effectiveSampleSize(CASES, CONTROLS)
      ).toBeCloseTo(18000, 6);
      expect(mdx).toContain('costs 18,000 effective');
    });

    it('step 2: controls saturate at four times the cases, and 4:1 banks 80% of it', () => {
      expect(controlCeiling(CASES)).toBe(40000);
      expect(effectiveSampleSize(CASES, CONTROLS) / controlCeiling(CASES)).toBeCloseTo(0.8, 12);
      expect(mdx).toContain('4 N_{\\mathrm{cases}} = 40{,}000');
      expect(mdx).toContain('32{,}000/40{,}000 = 80\\%');
    });

    it('step 3: the same ten thousand people are worth exactly sixteen times more as cases', () => {
      const base = effectiveSampleSize(CASES, CONTROLS);
      const addControls = effectiveSampleSize(CASES, CONTROLS + 10000);
      const addCases = effectiveSampleSize(CASES + 10000, CONTROLS);
      expect(addControls).toBeCloseTo(33333.33, 2);
      expect(addCases).toBeCloseTo(53333.33, 2);
      expect(addControls - base).toBeCloseTo(1333.33, 2);
      expect(addCases - base).toBeCloseTo(21333.33, 2);
      // exactly 16, not approximately — the lesson says so and it must hold
      expect((addCases - base) / (addControls - base)).toBeCloseTo(16, 9);
      expect(mdx).toContain('= 33{,}333.33');
      expect(mdx).toContain('= 53{,}333.33');
      expect(mdx).toContain('sixteen times more as cases');
    });

    it('defers the power constant to a lesson that actually derives it', () => {
      // The track's most load-bearing formula pointed at Mathematical Foundations, which
      // contains no power derivation at all. `audit:links` cannot catch this: the URL
      // resolved fine, it just did not contain the thing it was cited for.
      expect(lesson('statgen-association-linear-mixed-models')).toContain('39.600989');
      expect(lesson('statgen-mathematical-foundations')).not.toContain('39.60');
      expect(mdx).toContain('/deep_dives/statgen-association-linear-mixed-models/');
      // .not on the OLD claim, not just .toContain on the new: a fix applied to one
      // passage and not the summary is how four of six defects reached an audit pass.
      expect(mdx).not.toContain('a later lesson in this module');
      expect(mdx).not.toContain('taken up later in this');
      expect(mdx).not.toContain(
        'derived in\n[Mathematical Foundations](/deep_dives/statgen-mathematical-foundations/)'
      );
    });

    it('step 4: converts each effective size into a detection limit and an effect', () => {
      const detect = (n: number) => K / n;
      const beta = (q2: number) => Math.sqrt(q2 / (2 * 0.3 * 0.7));
      const base = detect(effectiveSampleSize(CASES, CONTROLS));
      const cases = detect(effectiveSampleSize(CASES + 10000, CONTROLS));
      const controls = detect(effectiveSampleSize(CASES, CONTROLS + 10000));
      expect(base).toBeCloseTo(1.2375e-3, 7);
      expect(cases).toBeCloseTo(7.4252e-4, 8);
      expect(mdx).toContain('1.2375 \\times 10^{-3}');
      expect(mdx).toContain('7.4252 \\times 10^{-4}');
      expect(beta(base)).toBeCloseTo(0.054282, 6);
      expect(beta(cases)).toBeCloseTo(0.042046, 6);
      expect(beta(controls)).toBeCloseTo(0.053185, 6);
      for (const b of ['0.054282', '0.042046', '0.053185']) expect(mdx).toContain(b);
      // 2% against 23% — the comparison the step draws
      expect(Math.round(100 * (1 - beta(controls) / beta(base)))).toBe(2);
      expect(Math.round(100 * (1 - beta(cases) / beta(base)))).toBe(23);
    });

    it('step 5: puts both on the liability scale, which needs the prevalence', () => {
      expect(liabilityScale(1.2375e-3, 0.01, 0.2)).toBeCloseTo(1.0672e-3, 7);
      expect(liabilityScale(7.4252e-4, 0.01, 1 / 3)).toBeCloseTo(4.6103e-4, 8);
      expect(mdx).toContain('1.0672 \\times 10^{-3}');
      expect(mdx).toContain('4.6103 \\times 10^{-4}');
    });
  });

  describe('figure 1 — every label it draws', () => {
    it('marks the two ratios, the ceiling and the case alternative', () => {
      expect(effectiveSampleSize(CASES, 40000)).toBeCloseTo(32000, 6);
      expect(effectiveSampleSize(CASES, 80000)).toBeCloseTo(35555.56, 2);
      for (const label of ['32,000 at 4:1', '35,556 at 8:1', 'ceiling: 4 x cases = 40,000',
                           '53,333 effective']) {
        expect(mdx, `figure label ${label}`).toContain(label);
      }
    });
  });

  describe('exercises', () => {
    it('1 — a 2,000/100,000 study is at 98% of its ceiling, so cases win 24.6 to 1', () => {
      const base = effectiveSampleSize(2000, 100000);
      expect(base).toBeCloseTo(7843.14, 2);
      expect(controlCeiling(2000)).toBe(8000);
      expect(100 * (base / 8000)).toBeCloseTo(98.04, 2);
      expect(8000 - base).toBeCloseTo(156.86, 2);
      const moreControls = effectiveSampleSize(2000, 200000);
      const moreCases = effectiveSampleSize(2500, 100000);
      expect(moreControls).toBeCloseTo(7920.79, 2);
      expect(moreCases).toBeCloseTo(9756.1, 2);
      expect((moreCases - base) / (moreControls - base)).toBeCloseTo(24.63, 2);
      for (const v of ['7{,}843.14', '98.04\\%', '156.86', '7{,}920.79', '9{,}756.10', '24.6 times more'])
        expect(mdx, v).toContain(v);
    });

    it('2 — a 15,000-case study cannot reach the target however many controls it buys', () => {
      const need = K / 5e-4;
      expect(need).toBeCloseTo(79201.98, 2);
      expect(controlCeiling(15000)).toBe(60000);
      expect(controlCeiling(15000)).toBeLessThan(need);        // (b) unreachable
      expect(need / 4).toBeCloseTo(19800.49, 2);               // (c) minimum cases
      expect(Math.ceil(need / 4)).toBe(19801);
      // a 4:1 design has N_eff = 3.2 * cases
      expect(effectiveSampleSize(1000, 4000)).toBeCloseTo(3.2 * 1000, 9);
      expect(Math.ceil(need / 3.2)).toBe(24751);
      expect(effectiveSampleSize(24751, 99004)).toBeGreaterThan(need);
      for (const v of ['79{,}201.98', '19{,}800.49', '24,751 cases and 99,004 controls'])
        expect(mdx, v).toContain(v);
      // and the rounded constant must not be presented as producing that result
      expect(39.6 / 5e-4).toBe(79200);
      expect(mdx).toContain('39.600989/(5 \\times 10^{-4}) = 79{,}201.98');
    });

    it('3 — the liability scale makes two apparently contradictory studies agree', () => {
      const a = liabilityScale(0.0012, 0.02, 0.5);
      const b = liabilityScale(0.0004, 0.02, 0.1);
      expect(a).toBeCloseTo(7.8657e-4, 8);
      expect(b).toBeCloseTo(7.2831e-4, 8);
      // observed scale: a threefold gap. Liability scale: 8%.
      expect(0.0012 / 0.0004).toBeCloseTo(3, 12);
      expect(a / b).toBeCloseTo(1.08, 4);
      expect(mdx).toContain('7.8657 \\times 10^{-4}');
      expect(mdx).toContain('7.2831 \\times 10^{-4}');
      expect(mdx).toContain('7.8657/7.2831 = 1.08');
      expect(mdx).toContain('agree to within 8%');
    });
  });
});

describe('gwas-arrays-imputation', () => {

  it('does not reinstate the multiple-testing claim anywhere in the lesson', () => {
    // Removed from Exercise 2(c) and left standing in the Summary fifty-five lines below.
    expect(mdx).not.toContain('adds multiple-testing');
    expect(mdx).not.toContain('adds tests faster');
    expect(mdx).toContain('does *not* do is raise the multiple-testing burden');
    // and 3.33 is the factor in q2, not in the per-allele effect
    expect(mdx).not.toContain('3.33 in the smallest detectable effect');
    expect(Math.sqrt(1 / 0.3)).toBeCloseTo(1.8257, 4);
    expect(mdx).toContain('1.83');
  });
  const mdx = lesson('gwas-arrays-imputation');
  const K = (Math.sqrt(chi2Quantile(1 - 5e-8, 1)) + normalQuantile(0.8)) ** 2;
  const POST: [number, number, number][] = [
    [0.98, 0.02, 0.0],
    [0.95, 0.05, 0.0],
    [0.1, 0.85, 0.05],
    [0.05, 0.9, 0.05],
    [0.6, 0.35, 0.05],
    [0.02, 0.18, 0.8],
    [0.99, 0.01, 0.0],
    [0.3, 0.6, 0.1],
  ];
  const dosages = POST.map(([a, b, c]) => genotypeDosage(a, b, c));

  describe('worked example — eight individuals at one imputed site', () => {
    it('step 1: turns each posterior into the dosage the table prints', () => {
      const shown = ['0.02', '0.05', '0.95', '1.00', '0.45', '1.78', '0.01', '0.80'];
      dosages.forEach((d, i) => {
        expect(d.toFixed(2)).toBe(shown[i]);
        expect(mdx).toContain(`| ${shown[i]} |`);
      });
    });

    it('steps 2 and 3: the two variances the metric compares', () => {
      const mean = dosages.reduce((a, b) => a + b, 0) / dosages.length;
      const theta = mean / 2;
      expect(theta).toBeCloseTo(0.31625, 8);
      expect(2 * theta * (1 - theta)).toBeCloseTo(0.432472, 6);
      const observed = dosages.reduce((a, x) => a + (x - mean) ** 2, 0) / dosages.length;
      expect(observed).toBeCloseTo(0.339494, 6);
      // uncertainty pulls dosages toward the mean, so the observed variance is the smaller
      expect(observed).toBeLessThan(2 * theta * (1 - theta));
      for (const v of ['0.632500', '0.316250', '0.432472', '0.339494']) expect(mdx).toContain(v);
    });

    it('step 4: gives r-hat-squared = 0.785008', () => {
      expect(imputationR2(dosages)).toBeCloseTo(0.785008, 6);
      expect(mdx).toContain('\\frac{0.339494}{0.432472} = 0.785008');
    });

    it('step 5: treats quality as an effective-sample-size multiplier', () => {
      // The lesson writes this with an approximation sign, deliberately: multiplying the
      // displayed 0.785008 gives 25,120.256 while the exact product is 25,120.246, and
      // printing either as an exact equality is the rounded-factor trap.
      expect(32000 * imputationR2(dosages)).toBeCloseTo(25120.25, 2);
      expect(Math.round(32000 * imputationR2(dosages))).toBe(25120);
      expect(mdx).toContain('\\approx 25{,}120$ effective samples');
      const worth = [0.95, 0.55, 0.32].map((r) => 32000 * r);
      [30400, 17600, 10240].forEach((v, i) => expect(worth[i]).toBeCloseTo(v, 6));
      for (const w of ['30,400', '17,600', '10,240']) expect(mdx).toContain(w);
      const limits = worth.map((n) => K / n);
      expect(limits[0]).toBeCloseTo(1.3027e-3, 7);
      expect(limits[1]).toBeCloseTo(2.2501e-3, 7);
      expect(limits[2]).toBeCloseTo(3.8673e-3, 7);
      for (const v of ['1.3027 \\times 10^{-3}', '2.2501 \\times 10^{-3}', '3.8673 \\times 10^{-3}'])
        expect(mdx).toContain(v);
    });

    it('warns that the metric exceeds 1 on hard calls in a tiny sample', () => {
      expect(imputationR2(dosages.map((d) => Math.round(d)))).toBeCloseTo(1.127273, 6);
      expect(mdx).toContain('1.127273');
    });
  });

  describe('figure 1 — every label it draws', () => {
    it('marks three qualities, the filter and the perfect-calling floor', () => {
      const q = (info: number) => K / (32000 * info);
      expect(q(0.95).toFixed(4)).toBe('0.0013');
      expect(q(0.55).toFixed(4)).toBe('0.0023');
      expect(q(0.32).toFixed(4)).toBe('0.0039');
      expect(q(1.0).toFixed(4)).toBe('0.0012');
      expect(q(0.3) / q(1.0)).toBeCloseTo(3.3333, 4);
      for (const label of ['0.0013', '0.0023', '0.0039', 'floor at perfect calling: 0.0012',
                           'the usual filter, INFO > 0.3', '3.33x'])
        expect(mdx, `figure label ${label}`).toContain(label);
    });
  });

  describe('exercises', () => {
    it('1 — two different posteriors give the same dosage', () => {
      expect(genotypeDosage(0.2, 0.5, 0.3)).toBeCloseTo(1.1, 12);
      expect(genotypeDosage(0.45, 0.0, 0.55)).toBeCloseTo(1.1, 12);
      expect(mdx).toContain('(0.45, 0.00, 0.55)$ both give $D = 1.10$');
    });

    it('2 — prices the 0.3 threshold and the proposed relaxation to 0.2', () => {
      expect(K / (50000 * 0.45)).toBeCloseTo(1.76e-3, 7);
      expect(K / (50000 * 1e-3)).toBeCloseTo(0.79202, 6);
      expect(K / (50000 * 0.2)).toBeCloseTo(3.9601e-3, 7);
      expect(K / (50000 * 0.3)).toBeCloseTo(2.6401e-3, 7);
      expect(K / 50000).toBeCloseTo(7.9202e-4, 8);
      // the relaxation admits variants needing five times the study's floor
      expect(K / (50000 * 0.2) / (K / 50000)).toBeCloseTo(5, 9);
      for (const v of ['1.7600 \\times 10^{-3}', '0.792020', '3.9601 \\times 10^{-3}',
                       '2.6401 \\times 10^{-3}', '7.9202 \\times 10^{-4}', 'five times'])
        expect(mdx, v).toContain(v);
    });

    it('3 — a badly-matched panel costs cohort B 1.64x the recruitment', () => {
      const a = 20000 * 0.9;
      const b = 20000 * 0.55;
      expect(a).toBe(18000);
      expect(b).toBeCloseTo(11000, 9);
      expect(K / a).toBeCloseTo(2.2001e-3, 7);
      expect(K / b).toBeCloseTo(3.6001e-3, 7);
      expect(Math.round(100 * (K / b / (K / a) - 1))).toBe(64);
      expect(Math.round(a / 0.55)).toBe(32727);
      expect(0.9 / 0.55).toBeCloseTo(1.64, 2);
      for (const v of ['2.2001 \\times 10^{-3}', '3.6001 \\times 10^{-3}', '64% higher', '32{,}727', '1.64'])
        expect(mdx, v).toContain(v);
    });
  });
});

describe('gwas-quality-control', () => {

  it('states the premise the pruning cost depends on', () => {
    // The hub called this "required"; lesson 4 says a mixed model avoids it entirely.
    expect(mdx).toContain('for an analysis');
    expect(mdx).toContain('/deep_dives/gwas-population-structure/');
    expect(lesson('gwas')).toContain('by the analysis chosen');
    expect(lesson('gwas')).not.toContain('pruning was required. The');
  });
  const mdx = lesson('gwas-quality-control');

  describe('worked example — four pairs, and what breaking them costs', () => {
    it('step 1: the PI_HAT of each pair in the table', () => {
      const rows: [number, number, number, string][] = [
        [0.0, 0.0, 1.0, '1.0000'],
        [0.25, 0.5, 0.25, '0.5000'],
        [0.5, 0.5, 0.0, '0.2500'],
        [0.75, 0.25, 0.0, '0.1250'],
      ];
      for (const [z0, z1, z2, shown] of rows) {
        expect(z0 + z1 + z2).toBeCloseTo(1, 12);
        expect(piHat(z0, z1, z2).toFixed(4)).toBe(shown);
        expect(mdx).toContain(`| ${shown} |`);
      }
    });

    it('step 2: 0.185 sits in the gap, near its midpoint of 0.1875', () => {
      expect(piHat(0.75, 0.25, 0)).toBeLessThan(0.185);
      expect(piHat(0.5, 0.5, 0)).toBeGreaterThan(0.185);
      expect((0.25 + 0.125) / 2).toBeCloseTo(0.1875, 12);
      expect(mdx).toContain('0.1875');
    });

    it('does not call that gap the widest, because it is the narrowest', () => {
      // The classes are a geometric sequence, so the gaps grow going up: 0.125, 0.125,
      // 0.25, 0.5. The cut is chosen for WHERE it sits, not for the gap's size.
      const classes = [0, 0.125, 0.25, 0.5, 1];
      const gaps = classes.slice(1).map((v, i) => v - classes[i]);
      expect(gaps).toEqual([0.125, 0.125, 0.25, 0.5]);
      const cutGap = classes[2] - classes[1];
      expect(cutGap).toBe(Math.min(...gaps));
      expect(cutGap).not.toBe(Math.max(...gaps));
      expect(mdx).not.toContain('widest');
    });

    it('step 3: the same 400 people cost sixteen times more from the case arm', () => {
      const base = effectiveSampleSize(10000, 40000);
      const dropCases = effectiveSampleSize(9600, 40000);
      const dropControls = effectiveSampleSize(10000, 39600);
      expect(dropCases).toBeCloseTo(30967.74, 2);
      expect(dropControls).toBeCloseTo(31935.48, 2);
      expect(base - dropCases).toBeCloseTo(1032.26, 2);
      expect(base - dropControls).toBeCloseTo(64.52, 2);
      expect((base - dropCases) / (base - dropControls)).toBeCloseTo(16, 6);
      for (const v of ['30{,}967.74', '31{,}935.48', '1{,}032.26', '64.52'])
        expect(mdx, v).toContain(v);
    });
  });

  describe('figures', () => {
    it('figure 1 draws the relationship classes at their expected values', () => {
      expect(piHat(0, 0, 1)).toBe(1);
      expect(piHat(0, 1, 0)).toBe(0.5);
      expect(piHat(0.5, 0.5, 0)).toBe(0.25);
      expect(piHat(0.75, 0.25, 0)).toBe(0.125);
      expect(piHat(1, 0, 0)).toBe(0);
      for (const l of ['cut at 0.185', 'unrelated', 'first cousin', '2nd degree', '1st degree',
                       'duplicate / MZ'])
        expect(mdx, `figure 1 label ${l}`).toContain(l);
    });

    it('figure 2 plots the losses from zero, so bar length carries the 16x', () => {
      const base = effectiveSampleSize(10000, 40000);
      const lossControls = base - effectiveSampleSize(10000, 39600);
      const lossCases = base - effectiveSampleSize(9600, 40000);
      expect(lossControls).toBeCloseTo(64.5161, 4);
      expect(lossCases).toBeCloseTo(1032.2581, 4);
      for (const l of ['64.52', '1032.26', 'Effective samples lost'])
        expect(mdx, `figure 2 label ${l}`).toContain(l);

      // The defect this replaced: bars drawn from a 30,800 baseline gave a 6.8:1 picture of
      // a 1.03:1 difference. Decode the rects and require length to track the losses.
      const svg = mdx.match(/<svg[\s\S]*?<\/svg>/g)![1];
      const widths = [...svg.matchAll(/<rect[^>]*width="([\d.]+)"/g)].map((m) => Number(m[1]));
      expect(widths).toHaveLength(2);
      const [wControls, wCases] = widths;
      // one decimal of SVG rounding on a 14 px bar is ~0.4%, hence 1 place
      expect(wCases / wControls).toBeCloseTo(lossCases / lossControls, 1);
      expect(lossCases / lossControls).toBeCloseTo(16, 6);
      // and the axis starts at zero: the shorter bar must be ~1/16 of the longer, not ~1/7
      expect(wControls / wCases).toBeLessThan(0.1);
    });
  });

  describe('exercises', () => {
    it('1 — PI_HAT cannot separate parent-offspring from full sibs; z0 can', () => {
      expect(piHat(0, 1, 0)).toBeCloseTo(0.5, 12);
      expect(piHat(0.6, 0.35, 0.05)).toBeCloseTo(0.225, 12);
      expect(piHat(0.25, 0.5, 0.25)).toBeCloseTo(0.5, 12);
      // identical summaries, different z0 — which is the point of the exercise
      expect(piHat(0, 1, 0)).toBe(piHat(0.25, 0.5, 0.25));
      expect(mdx).toContain('0.2250');
      // Regex: the sentence wraps between "both" and "give".
      expect(mdx).toMatch(/both\s+give exactly 0\.5/);
    });

    it('2 — the choice is worth nothing in a balanced study', () => {
      const base = effectiveSampleSize(25000, 25000);
      const pruned = effectiveSampleSize(24600, 25000);
      expect(base).toBeCloseTo(50000, 6);
      expect(pruned).toBeCloseTo(49596.77, 2);
      expect(base - pruned).toBeCloseTo(403.23, 2);
      // symmetric, so both choices are the same number
      expect(effectiveSampleSize(24600, 25000)).toBeCloseTo(
        effectiveSampleSize(25000, 24600),
        9
      );
      expect(mdx).toContain('49{,}596.77');
      expect(mdx).toContain('403.23');
    });

    it('2 — and the ratio is exactly (controls/cases) squared', () => {
      // The generalisation the solution states, checked at three imbalances.
      for (const [cases, controls, expected] of [
        [10000, 40000, 16],
        [25000, 25000, 1],
        [10000, 100000, 100],
      ] as [number, number, number][]) {
        const base = effectiveSampleSize(cases, controls);
        const dc = base - effectiveSampleSize(cases - 400, controls);
        const dk = base - effectiveSampleSize(cases, controls - 400);
        expect(dc / dk).toBeCloseTo(expected, 4);
        expect((controls / cases) ** 2).toBeCloseTo(expected, 9);
      }
      expect(mdx).toContain('(N_{\\mathrm{controls}}/N_{\\mathrm{cases}})^2');
    });
  });
});

describe('gwas-population-structure', () => {

  it('gets the over-correction ratio right in the exercise as well', () => {
    expect((1 - 1 / 1.25) / (1 - 1 / 1.03)).toBeCloseTo(6.87, 2);
    expect(mdx).not.toContain('eight times bigger');
    expect(mdx).toContain('nearly seven times bigger');
    // and LOCO is not claimed as universal
    expect(mdx).not.toContain('Every serious implementation');
  });
  const mdx = lesson('gwas-population-structure');
  const THRESH = chi2Quantile(1 - 5e-8, 1);
  const pOf = (c: number) => 1 - regularizedGammaP(0.5, c / 2);
  const LAM = 1.18;
  const INT = 1.02;

  describe('worked example — a study with λ = 1.18 and an intercept of 1.02', () => {
    it('step 1: only 5.71% of the inflation is confounding', () => {
      expect((100 * (INT - 1)) / (1.35 - 1)).toBeCloseTo(5.71, 2);
      expect(mdx).toContain('5.71\\%');
    });

    it('step 2: genomic control removes nearly eight times what is earned', () => {
      expect(100 * (1 - 1 / LAM)).toBeCloseTo(15.25, 2);
      expect(100 * (1 - 1 / INT)).toBeCloseTo(1.96, 2);
      expect((1 - 1 / LAM) / (1 - 1 / INT)).toBeCloseTo(7.78, 2);
      expect(mdx).toContain('15.25\\%');
      expect(mdx).toContain('1.96\\%');
      expect(mdx).toMatch(/nearly eight\s+times too large/);
    });

    it('step 3: a real locus at 33 is destroyed by one correction and kept by the other', () => {
      expect(pOf(33)).toBeCloseTo(9.216e-9, 12);
      expect(33 / LAM).toBeCloseTo(27.9661, 4);
      expect(pOf(33 / LAM)).toBeCloseTo(1.235e-7, 10);
      expect(33 / INT).toBeCloseTo(32.3529, 4);
      // the whole point: one lands below the threshold, the other above
      expect(33 / LAM).toBeLessThan(THRESH);
      expect(33 / INT).toBeGreaterThan(THRESH);
      for (const v of ['9.216 \\times 10^{-9}', '27.9661', '1.235 \\times 10^{-7}', '32.3529'])
        expect(mdx, v).toContain(v);
    });

    it('step 4: the band is 4.7547 wide and spans the discovery range', () => {
      expect(THRESH * INT).toBeCloseTo(30.3111, 4);
      expect(THRESH * LAM).toBeCloseTo(35.0658, 4);
      expect(THRESH * LAM - THRESH * INT).toBeCloseTo(4.7547, 4);
      expect(pOf(THRESH * INT)).toBeCloseTo(3.68e-8, 10);
      expect(pOf(THRESH * LAM)).toBeCloseTo(3.187e-9, 11);
      for (const v of ['30.3111', '35.0658', '4.7547', '3.680 \\times 10^{-8}',
                       '3.187 \\times 10^{-9}'])
        expect(mdx, v).toContain(v);
    });
  });

  describe('conventions', () => {
    it('divides λ_GC by the exact median of the null, never a rounding', () => {
      expect(CHI2_1DF_MEDIAN).toBe(0.4549364231195727);
      expect(mdx).toContain('0.4549364231195727');
      // and the helper agrees with the lesson's definition
      expect(lambdaGc([CHI2_1DF_MEDIAN])).toBeCloseTo(1, 12);
    });

    it('quotes one number of ancestry principal components, with a reason', () => {
      expect(mdx).toContain('Use 10 PCs');
      // exactly one distinct count in this lesson, so the corpus-wide rule holds
      const counts = new Set(
        [...mdx.matchAll(/(\d+)\s+(?:ancestry\s+)?(?:principal components|PCs)\b/g)].map(
          (m) => m[1]
        )
      );
      expect([...counts]).toEqual(['10']);
    });
  });

  describe('figure 1 — every label it draws', () => {
    it('marks the threshold, the band and both corrections', () => {
      for (const label of ['threshold 29.72', 'lost to genomic control,', 'kept by the intercept',
                           'a real locus at 33', 'GC: 27.97', 'intercept: 32.35',
                           '30.31 to 35.07'])
        expect(mdx, `figure label ${label}`).toContain(label);
    });
  });

  describe('exercises', () => {
    it('1 — two studies with identical λ and opposite diagnoses', () => {
      expect((100 * (1.29 - 1)) / (1.33 - 1)).toBeCloseTo(87.88, 2);
      expect((100 * (1.01 - 1)) / (1.6 - 1)).toBeCloseTo(1.67, 2);
      expect(100 * (1 - 1 / 1.31)).toBeCloseTo(23.66, 2);
      for (const v of ['87.88\\%', '1.67\\%', '23.66\\%']) expect(mdx, v).toContain(v);
    });

    it('2 — genomic control would cost about 26 of the 40 loci', () => {
      const lo = THRESH * 1.03;
      const hi = THRESH * 1.25;
      expect(lo).toBeCloseTo(30.6083, 4);
      expect(hi).toBeCloseTo(37.146, 4);
      expect(hi - lo).toBeCloseTo(6.5377, 4);
      expect((40 * (hi - lo)) / 10).toBeCloseTo(26.15, 2);
      expect(100 * (1 - 1 / 1.25)).toBeCloseTo(20, 9);
      for (const v of ['30.6083', '37.1460', '6.5377', '26.15', '20\\%'])
        expect(mdx, v).toContain(v);
    });
  });
});

describe('gwas-running-the-scan', () => {
  const mdx = lesson('gwas-running-the-scan');
  const RECESSIVE_CASES: [number, number, number] = [1000, 1000, 900];
  const RECESSIVE_CONTROLS: [number, number, number] = [1200, 1200, 400];
  const ADDITIVE_CASES: [number, number, number] = [1200, 1600, 700];
  const ADDITIVE_CONTROLS: [number, number, number] = [1500, 1550, 450];
  const ADD: [number, number, number] = [0, 1, 2];
  const DOM: [number, number, number] = [0, 1, 1];
  const REC: [number, number, number] = [0, 0, 1];

  describe('worked example — a recessive-truth locus tested three ways', () => {
    it('gives the three statistics the table prints', () => {
      const a = armitageTrend(RECESSIVE_CASES, RECESSIVE_CONTROLS, ADD);
      const d = armitageTrend(RECESSIVE_CASES, RECESSIVE_CONTROLS, DOM);
      const r = armitageTrend(RECESSIVE_CASES, RECESSIVE_CONTROLS, REC);
      expect(a).toBeCloseTo(152.6291, 4);
      expect(d).toBeCloseTo(42.1547, 4);
      expect(r).toBeCloseTo(226.9868, 4);
      expect(r).toBeGreaterThan(a); // the matching encoding wins
      for (const v of ['152.6291', '42.1547', '226.9868']) expect(mdx, v).toContain(v);
    });

    it('shows the additive test keeping 67.2% of the best statistic', () => {
      const a = armitageTrend(RECESSIVE_CASES, RECESSIVE_CONTROLS, ADD);
      const r = armitageTrend(RECESSIVE_CASES, RECESSIVE_CONTROLS, REC);
      expect((100 * a) / r).toBeCloseTo(67.2, 1);
      expect(mdx).toContain('67.2\\%');
      // and still far past the threshold — the loss is a third of a statistic, not a locus
      expect(a / chi2Quantile(1 - 5e-8, 1)).toBeGreaterThan(5);
      expect(mdx).toMatch(/more than five times\s+the threshold/);
    });

    it('prices three encodings genome-wide', () => {
      expect(5e-8 / 3).toBeCloseTo(1.6667e-8, 12);
      expect(chi2Quantile(1 - 5e-8 / 3, 1)).toBeCloseTo(31.8486, 4);
      expect(chi2Quantile(1 - 5e-8, 1)).toBeCloseTo(29.7168, 4);
      expect(chi2Quantile(1 - 5e-8, 2)).toBeCloseTo(33.6225, 4);
      for (const v of ['1.6667 \\times 10^{-8}', '31.8486', '33.6225']) expect(mdx, v).toContain(v);
    });
  });

  describe('figure 1 — every label it draws', () => {
    it('draws both panels at their computed statistics', () => {
      expect(armitageTrend(ADDITIVE_CASES, ADDITIVE_CONTROLS, ADD)).toBeCloseTo(86.2613, 4);
      expect(armitageTrend(ADDITIVE_CASES, ADDITIVE_CONTROLS, DOM)).toBeCloseTo(54.2636, 4);
      expect(armitageTrend(ADDITIVE_CASES, ADDITIVE_CONTROLS, REC)).toBeCloseTo(65.0316, 4);
      for (const l of ['86.3', '54.3', '65.0', '152.6', '42.2', '227.0', 'threshold 29.72',
                       'truth is additive', 'truth is recessive'])
        expect(mdx, `figure label ${l}`).toContain(l);
    });
  });

  describe('exercises', () => {
    it('does not claim the additive test is never the worst', () => {
      // True across monotone models (dominant → additive → recessive), false under a
      // heterozygote-effect truth, where the 0/1/2 score is uncorrelated with the risk
      // pattern and the additive test returns exactly zero.
      const od: [number, number, number] = [1000, 1400, 1000];
      const odCtrl: [number, number, number] = [1200, 1000, 1200];
      expect(armitageTrend(od, odCtrl, ADD)).toBeCloseTo(0, 10);
      expect(armitageTrend(od, odCtrl, DOM)).toBeCloseTo(26.8775, 4);
      expect(armitageTrend(od, odCtrl, REC)).toBeCloseTo(26.8775, 4);
      // The assertive form, not the string: the lesson now quotes the phrase in order to
      // disown it ('"never the worst" is not true of it').
      expect(mdx).not.toContain('encoding is never the worst');
      expect(mdx).toContain('Across the monotone models');
      expect(mdx).toContain('heterozygote-effect');
    });

    it('1 — the additive test wins on an additive-truth locus', () => {
      const a = armitageTrend(ADDITIVE_CASES, ADDITIVE_CONTROLS, ADD);
      expect(a).toBeCloseTo(86.2613, 4);
      expect(a).toBeGreaterThan(armitageTrend(ADDITIVE_CASES, ADDITIVE_CONTROLS, DOM));
      expect(a).toBeGreaterThan(armitageTrend(ADDITIVE_CASES, ADDITIVE_CONTROLS, REC));
      for (const v of ['86.2613', '54.2636', '65.0316']) expect(mdx, v).toContain(v);
    });

    it('2 — four encodings raise the bar past a locus at 30.5', () => {
      expect(5e-8 / 4).toBeCloseTo(1.25e-8, 12);
      expect(chi2Quantile(1 - 5e-8 / 4, 1)).toBeCloseTo(32.4075, 4);
      expect(chi2Quantile(1 - 1.25e-8, 2)).toBeCloseTo(36.3951, 4);
      // the locus clears one test and fails four
      expect(30.5).toBeGreaterThan(chi2Quantile(1 - 5e-8, 1));
      expect(30.5).toBeLessThan(chi2Quantile(1 - 5e-8 / 4, 1));
      for (const v of ['1.25 \\times 10^{-8}', '32.4075', '36.3951']) expect(mdx, v).toContain(v);
    });
  });
});

describe('gwas-reading-the-output', () => {

  it('names the BH bound and the largest rejected p-value separately', () => {
    expect(((6 / 1e6) * 0.05)).toBeCloseTo(3.0e-7, 12);
    expect(benjaminiHochberg([1.2e-12, 8.0e-10, 3.1e-9, 4.4e-8, 9.7e-8, 2.2e-7, 8.0e-7, 3.5e-6],
      0.05, 1e6).threshold).toBeCloseTo(2.2e-7, 12);
    expect(mdx).toContain('Benjamini-Hochberg bound, (k/m)q');
    expect(mdx).not.toContain("with an effective threshold of $2.2");
    expect(mdx).not.toContain("previous lesson's subject");
  });
  const mdx = lesson('gwas-reading-the-output');
  const M = 1e6;
  const Q = 0.05;
  const TOP = [1.2e-12, 8.0e-10, 3.1e-9, 4.4e-8, 9.7e-8, 2.2e-7, 8.0e-7, 3.5e-6];

  describe('worked example — the same scan under both procedures', () => {
    it('reproduces the Benjamini-Hochberg 1995 example, so the helper is right', () => {
      // External check: the paper's own 15-hypothesis worked example rejects 4 at q = 0.05.
      const classic = [
        0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298, 0.0344, 0.0459, 0.324,
        0.4262, 0.5719, 0.6528, 0.759, 1.0,
      ];
      expect(benjaminiHochberg(classic, 0.05).rejected).toBe(4);
      expect(benjaminiHochberg(classic, 0.05).threshold).toBeCloseTo(0.0095, 12);
    });

    it('step 1 and 2: Bonferroni takes 4, BH takes 6', () => {
      expect(bonferroni(0.05, M)).toBeCloseTo(5e-8, 15);
      expect(TOP.filter((p) => p <= bonferroni(0.05, M))).toHaveLength(4);
      const bh = benjaminiHochberg(TOP, Q, M);
      expect(bh.rejected).toBe(6);
      expect(bh.threshold).toBeCloseTo(2.2e-7, 12);
      expect(bh.expectedFalse).toBeCloseTo(0.3, 12);
      // every bound in the printed table
      TOP.forEach((p, i) => {
        const bound = ((i + 1) / M) * Q;
        expect(mdx).toContain(`| ${p.toExponential(1)} |`.replace('e-', 'e-'));
        expect(p <= bound).toBe(i < 6);
      });
      expect(mdx).toContain('0.05 \\times 6 = 0.30');
    });

    it('step 3: BH loosens in proportion to the discoveries', () => {
      for (const [k, thr, mult, exp] of [
        [6, 3.0e-7, 6, 0.3],
        [500, 2.5e-5, 500, 25],
        [5000, 2.5e-4, 5000, 250],
      ] as [number, number, number, number][]) {
        expect((k / M) * Q).toBeCloseTo(thr, 12);
        expect((k / M) * Q / 5e-8).toBeCloseTo(mult, 6);
        expect(Q * k).toBeCloseTo(exp, 10);
      }
      for (const v of ['3.0e-7', '2.5e-5', '2.5e-4', '500× looser', '5,000× looser', '250.0'])
        expect(mdx, v).toContain(v);
    });
  });

  describe("winner's curse", () => {
    it('inflates a threshold locus by 14.64% and a sub-threshold one by 22.11%', () => {
      const z = zThreshold(5e-8);
      expect(z).toBeCloseTo(5.4513, 4);
      const atThreshold = winnersCurseExpectation(z, z);
      const below = winnersCurseExpectation(5.0, z);
      expect(atThreshold).toBeCloseTo(6.2492, 4);
      expect(below).toBeCloseTo(6.1057, 4);
      expect(100 * (atThreshold / z - 1)).toBeCloseTo(14.64, 2);
      expect(100 * (below / 5.0 - 1)).toBeCloseTo(22.11, 2);
      for (const v of ['6.2492', '6.1057', '14.64%', '22.11%']) expect(mdx, v).toContain(v);
    });

    it('collapses as the true effect grows, so it is a new-locus problem', () => {
      const z = zThreshold(5e-8);
      expect(100 * (winnersCurseExpectation(7, z) / 7 - 1)).toBeCloseTo(1.83, 2);
      expect(100 * (winnersCurseExpectation(9, z) / 9 - 1)).toBeCloseTo(0.01, 2);
      expect(mdx).toContain('1.83%');
      expect(mdx).toContain('0.01%');
    });
  });

  it('does not teach that a lifted QQ bulk means confounding', () => {
    // A polygenic trait lifts every statistic: at N=1e5, h2=0.3, M=1e6 a variant with an
    // LD score of 50 already expects chi2 = 2.5, so a clean scan leaves the diagonal early.
    expect(1 + ((1e5 * 0.3) / 1e6) * 50).toBeCloseTo(2.5, 10);
    expect(mdx).toContain('lifts **every** statistic');
    expect(mdx).not.toContain('Departure only in the extreme tail, with the bulk on the');
    expect(mdx).toContain('/deep_dives/gwas-population-structure/');
  });

  describe('exercises', () => {
    it('1 — with two hits the two procedures nearly agree', () => {
      const bh = benjaminiHochberg([3.0e-9, 6.0e-8], Q, M);
      expect(bh.rejected).toBe(2);
      expect(bh.threshold).toBeCloseTo(6.0e-8, 12);
      expect(bh.expectedFalse).toBeCloseTo(0.1, 12);
      expect([3.0e-9, 6.0e-8].filter((p) => p <= 5e-8)).toHaveLength(1);
      expect(mdx).toContain('0.05 \\times 2 = 0.1');
    });

    it('2 — 1,200 loci at q = 0.05 expects 60 false and 120 postdoc-years', () => {
      expect((1200 / M) * Q).toBeCloseTo(6.0e-5, 12);
      expect(((1200 / M) * Q) / 5e-8).toBeCloseTo(1200, 6);
      expect(Q * 1200).toBeCloseTo(60, 10);
      expect(2 * Q * 1200).toBeCloseTo(120, 10);
      for (const v of ['6.0 \\times 10^{-5}', '1,200 times looser', '0.05 \\times 1200 = 60'])
        expect(mdx, v).toContain(v);
      // wraps a line between the number and the noun
      expect(mdx).toMatch(/120\s+postdoc-years/);
    });
  });
});

describe('gwas-ld-reference-panels', () => {

  it('gives the 4:1 headcounts that correspond to those effective sizes', () => {
    // At 4:1, N_eff = 3.2 x cases and the headcount is 5 x cases.
    for (const [neff, head] of [[61877, 96683], [505115, 789242]] as [number, number][]) {
      const cases = neff / 3.2;
      expect(effectiveSampleSize(cases, 4 * cases)).toBeCloseTo(neff, 6);
      expect(Math.round(5 * cases)).toBe(head);
    }
    expect(mdx).toContain('96,683');
    expect(mdx).toContain('789,242');
  });

  it('counts in effective samples, the unit the rest of the track uses', () => {
    expect(mdx).toContain('N_{\\mathrm{eff}}');
    expect(mdx).not.toContain('**Step 5 — in people.**');
    expect(mdx).not.toContain('= 145{,}474$ people');
    expect(mdx).not.toContain('61,877 people');
  });
  const mdx = lesson('gwas-ld-reference-panels');
  const K = (Math.sqrt(chi2Quantile(1 - 5e-8, 1)) + normalQuantile(0.8)) ** 2;
  const A = ldMeasures(0.45, 0.05, 0.05, 0.45);
  const B = ldMeasures(0.32, 0.18, 0.18, 0.32);

  describe('worked example — the same pair in two populations', () => {
    it('step 1: the allele frequencies are identical, so no filter can tell them apart', () => {
      expect(A.pA).toBeCloseTo(0.5, 12);
      expect(A.pB).toBeCloseTo(0.5, 12);
      expect(B.pA).toBeCloseTo(0.5, 12);
      expect(B.pB).toBeCloseTo(0.5, 12);
      expect(mdx).toContain('p_{AB} + p_{Ab} = 0.50');
    });

    it('steps 2 and 3: D, D-prime and r² for both populations', () => {
      expect(A.D).toBeCloseTo(0.2, 12);
      expect(B.D).toBeCloseTo(0.07, 12);
      expect(A.Dprime).toBeCloseTo(0.8, 12);
      expect(B.Dprime).toBeCloseTo(0.28, 12);
      expect(A.r2).toBeCloseTo(0.64, 12);
      expect(B.r2).toBeCloseTo(0.0784, 12);
      for (const v of ['0.2000', '0.0700', '0.8000', '0.2800', '0.640000', '0.078400'])
        expect(mdx, v).toContain(v);
    });

    it("step 3: r² = D'² exactly, because both loci sit at the same frequency", () => {
      expect(A.Dprime ** 2).toBeCloseTo(A.r2, 12);
      expect(B.Dprime ** 2).toBeCloseTo(B.r2, 12);
      // equal frequencies away from 0.5, with D > 0: still holds
      const equalButNotHalf = ldMeasures(0.3, 0.1, 0.1, 0.5);
      expect(equalButNotHalf.pA).toBeCloseTo(equalButNotHalf.pB, 12);
      expect(equalButNotHalf.D).toBeGreaterThan(0);
      expect(equalButNotHalf.Dprime ** 2).toBeCloseTo(equalButNotHalf.r2, 12);
      // unequal frequencies break it
      const unequal = ldMeasures(0.5, 0.2, 0.1, 0.2);
      expect(unequal.pA).not.toBeCloseTo(unequal.pB, 6);
      expect(unequal.Dprime ** 2).not.toBeCloseTo(unequal.r2, 6);
    });

    it("and the identity needs D > 0 as well as equal frequencies", () => {
      // The exercise originally stated "needs p_A = p_B, not p_A = 0.5" as a general rule.
      // It is false for D < 0: D_max becomes min(p_A p_B, p_a p_b), which equals p(1-p)
      // only at p = 0.5.
      const negEqual = ldMeasures(0.06, 0.34, 0.34, 0.26);
      expect(negEqual.pA).toBeCloseTo(0.4, 12);
      expect(negEqual.pB).toBeCloseTo(0.4, 12);
      expect(negEqual.D).toBeLessThan(0);
      expect(negEqual.r2).toBeCloseTo(0.173611, 6);
      expect(negEqual.Dprime ** 2).toBeCloseTo(0.390625, 6);
      expect(negEqual.Dprime ** 2).not.toBeCloseTo(negEqual.r2, 4);
      // but at p = 0.5 it survives either sign
      const negHalf = ldMeasures(0.15, 0.35, 0.35, 0.15);
      expect(negHalf.D).toBeLessThan(0);
      expect(negHalf.Dprime ** 2).toBeCloseTo(negHalf.r2, 12);
      for (const v of ['0.390625', '0.173611']) expect(mdx, v).toContain(v);
    });

    it('steps 4 and 5: the sample size ratio is exactly the r² ratio', () => {
      const nA = Math.ceil(K / (A.r2 * 1e-3));
      const nB = Math.ceil(K / (B.r2 * 1e-3));
      expect(A.r2 * 1e-3).toBeCloseTo(6.4e-4, 12);
      expect(B.r2 * 1e-3).toBeCloseTo(7.84e-5, 12);
      expect(nA).toBe(61877);
      expect(nB).toBe(505115);
      expect(A.r2 / B.r2).toBeCloseTo(8.1633, 4);
      for (const v of ['61{,}877', '505{,}115', '8.1633']) expect(mdx, v).toContain(v);
    });
  });

  it('does not claim the LDSC intercept survives a mismatched panel', () => {
    // Multiplicative rescaling leaves the intercept exactly alone; variant-level noise —
    // which a real panel mismatch has — inflates it, so a clean intercept proves nothing.
    const L: number[] = [];
    const C: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      const l = 20 + (i % 100) * 1.6;
      L.push(l);
      C.push(1.02 + (1e5 * 0.3 / 1e6) * l);
    }
    expect(ldscRegression(L, C, 1e5, 1e6).intercept).toBeCloseTo(1.02, 6);
    expect(ldscRegression(L.map((l) => l * 1.2), C, 1e5, 1e6).intercept).toBeCloseTo(1.02, 6);
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648 - 0.5;
    };
    const noisy = ldscRegression(L.map((l) => l + 25 * rnd() * 3.46), C, 1e5, 1e6);
    expect(noisy.intercept).toBeGreaterThan(1.5);
    expect(noisy.slope).toBeLessThan(1e5 * 0.3 / 1e6);
    expect(mdx).not.toContain('remains interpretable even when the slope is not');
    expect(mdx).toContain('errors-in-variables');
  });

  describe('figure 1 — every label it draws', () => {
    it('draws both grids with their haplotype frequencies and summaries', () => {
      for (const l of ['0.45', '0.05', '0.32', '0.18', 'D = 0.2000', "D' = 0.8000",
                       'r² = 0.640000', 'D = 0.0700', "D' = 0.2800", 'r² = 0.078400',
                       'needed: 61,877', 'needed: 505,115'])
        expect(mdx, `figure label ${l}`).toContain(l);
    });
  });

  describe('exercises', () => {
    it('1 — unequal-from-half but equal-to-each-other frequencies keep the identity', () => {
      const e = ldMeasures(0.3, 0.1, 0.1, 0.5);
      expect(e.pA).toBeCloseTo(0.4, 12);
      expect(e.pB).toBeCloseTo(0.4, 12);
      expect(e.D).toBeCloseTo(0.14, 12);
      expect(e.Dprime).toBeCloseTo(0.583333, 6);
      expect(e.r2).toBeCloseTo(0.340278, 6);
      expect(e.Dprime ** 2).toBeCloseTo(e.r2, 10);
      const qTag = e.r2 * 8e-4;
      expect(qTag).toBeCloseTo(2.72222e-4, 9);
      expect(Math.ceil(K / qTag)).toBe(145474);
      for (const v of ['0.1400', '0.583333', '0.340278', '2.72222 \\times 10^{-4}', '145{,}474'])
        expect(mdx, v).toContain(v);
    });
  });
});

describe('gwas-fine-mapping-practice', () => {

  it('does not claim the two runs are equally well covered', () => {
    expect(mdx).not.toContain('equally pure, equally well covered');
    expect(mdx).not.toContain('more confident, and excludes the truth');
    expect(mdx).toContain('/deep_dives/gwas-arrays-imputation/');
    expect(mdx).not.toContain('assembled three lessons earlier');
  });
  const mdx = lesson('gwas-fine-mapping-practice');
  const P = 0.3;
  const N = 50000;
  const V = 1 / (2 * P * (1 - P) * N);
  const W = 0.04;
  const PI0 = 0.05;
  const Z = [2.1, 4.6, 6.2, 6.5, 6.2, 4.6, 2.4, 1.8];
  const DECAY = [1, 0.95, 0.7, 0.35, 0.15, 0.05, 0.02, 0.01];
  const flat = (n: number) => Array.from({ length: n }, () => 1 / n);
  const CAUSAL = 3;

  describe('worked example — the same locus run twice', () => {
    const full = pipsFromAbf(
      Z.map((z) => wakefieldAbf(z, V, W)),
      flat(8),
      PI0
    );
    const ldFull = Array.from({ length: 8 }, (_, i) =>
      Array.from({ length: 8 }, (_, j) => DECAY[Math.abs(i - j)])
    );
    const keep = [0, 1, 2, 4, 5, 6, 7];
    const dropped = pipsFromAbf(
      keep.map((i) => wakefieldAbf(Z[i], V, W)),
      flat(7),
      PI0
    );
    const ldDropped = keep.map((i) => keep.map((j) => DECAY[Math.abs(i - j)]));

    it('step 1: with the causal variant present it takes 0.770194', () => {
      expect(full[CAUSAL]).toBeCloseTo(0.770194, 6);
      expect(full[2]).toBeCloseTo(0.114882, 6);
      expect(full[4]).toBeCloseTo(0.114882, 6);
      const cs = credibleSet(full, 0.95);
      expect(cs.indices.slice().sort()).toEqual([2, 3, 4]);
      expect(cs.coverage).toBeCloseTo(0.999959, 6);
      expect(csPurity(cs.indices, ldFull)).toBeCloseTo(0.7, 10);
      for (const v of ['0.770194', '0.114882', '0.999959', '0.7000'])
        expect(mdx, v).toContain(v);
    });

    it('step 2: without it the two flanking tags split the posterior evenly', () => {
      expect(dropped[2]).toBeCloseTo(0.499911, 6);
      expect(dropped[3]).toBeCloseTo(0.499911, 6);
      const cs = credibleSet(dropped, 0.95);
      expect(cs.indices.slice().sort()).toEqual([2, 3]);
      // positions 2 and 3 of the reduced list are original variants 2 and 4
      expect(cs.indices.map((i) => keep[i]).sort()).toEqual([2, 4]);
      expect(cs.coverage).toBeCloseTo(0.999821, 6);
      expect(csPurity(cs.indices, ldDropped)).toBeCloseTo(0.7, 10);
      expect(mdx).toContain('0.499911');
      expect(mdx).toContain('0.999821');
    });

    it('the hub summarises this correctly: tighter, not better-covered', () => {
      const hub = lesson('gwas');
      // Coverage is slightly LOWER without the causal variant (0.999821 vs 0.999959);
      // what makes the wrong answer look good is the smaller set at equal purity.
      expect(hub).toContain('a *tighter* answer');
      expect(hub).not.toContain('reports better coverage');
    });

    it('step 3: the wrong answer looks better by every reported diagnostic', () => {
      const good = credibleSet(full, 0.95);
      const bad = credibleSet(dropped, 0.95);
      // smaller set
      expect(bad.indices.length).toBeLessThan(good.indices.length);
      expect(bad.indices).toHaveLength(2);
      expect(good.indices).toHaveLength(3);
      // identical purity
      expect(csPurity(bad.indices, ldDropped)).toBeCloseTo(
        csPurity(good.indices, ldFull),
        10
      );
      // both coverages above the target
      expect(bad.coverage).toBeGreaterThan(0.95);
      expect(good.coverage).toBeGreaterThan(0.95);
      // and the causal variant is not in the second set
      expect(bad.indices.map((i) => keep[i])).not.toContain(CAUSAL);
      expect(good.indices).toContain(CAUSAL);
    });
  });

  describe('conventions', () => {
    it('normalises the PIP against an explicit null and writes ABF as BF01', () => {
      expect(mdx).toContain('\\pi_0');
      expect(mdx).toContain('\\mathrm{BF}_{01');
      // π₀ is stated as a number in the given block, not left implicit
      expect(mdx).toContain('π₀ = 0.05');
    });
  });

  describe('figure 1 — every label it draws', () => {
    it('draws both panels with their diagnostics', () => {
      for (const l of ['0.770', '0.115', '0.500', 'causal', 'absent',
                       'coverage 0.999959', 'coverage 0.999821', 'purity 0.7000',
                       '3 variants', '2 variants'])
        expect(mdx, `figure label ${l}`).toContain(l);
    });
  });
});

describe('gwas-prs-practice', () => {
  const mdx = lesson('gwas-prs-practice');

  /** E[risk(z) | lo < z < hi] under the liability-threshold model, by Simpson's rule.
   *  The lesson's headline numbers are group means, not points on the curve, and the two
   *  differ by a quarter at the top centile because risk is convex in the score. */
  const groupMean = (lo: number, hi: number, r2: number, K: number) => {
    const n = 20000;
    const h = (hi - lo) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i <= n; i += 1) {
      const z = lo + i * h;
      const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      const phi = normalPdf(z);
      num += w * liabilityRisk(z, r2, K) * phi;
      den += w * phi;
    }
    return num / den;
  };

  describe('worked example — what a percentile means', () => {
    it('step 1: the liability threshold for a 2% disease', () => {
      expect(normalQuantile(0.98)).toBeCloseTo(2.053749, 6);
      expect(mdx).toContain('2.053749');
    });

    it('step 2: r is the square root of the variance explained', () => {
      expect(Math.sqrt(0.1)).toBeCloseTo(0.316228, 6);
      expect(mdx).toContain('0.316228');
    });

    it('step 3: risks at the 99th, 90th and 1st centiles', () => {
      expect(liabilityRisk(normalQuantile(0.99), 0.1, 0.02)).toBeCloseTo(0.082357, 6);
      expect(liabilityRisk(normalQuantile(0.9), 0.1, 0.02)).toBeCloseTo(0.041136, 6);
      expect(liabilityRisk(normalQuantile(0.01), 0.1, 0.02)).toBeCloseTo(0.00164, 6);
      for (const v of ['0.082357', '0.041136', '0.001640']) expect(mdx, v).toContain(v);
    });

    it('step 3: the point ratio between the two extreme centiles is 50.2', () => {
      const top = liabilityRisk(normalQuantile(0.99), 0.1, 0.02);
      const bottom = liabilityRisk(normalQuantile(0.01), 0.1, 0.02);
      expect(top / bottom).toBeCloseTo(50.2, 1);
      expect(mdx).toContain('0.082357/0.001640 = 50.2');
    });

    it('step 4: the GROUP mean is a quarter above the boundary, and the ratio is 86.1', () => {
      // The defect this replaced answered a group question with a boundary value.
      const c99 = normalQuantile(0.99);
      const c01 = normalQuantile(0.01);
      const topGroup = groupMean(c99, 9, 0.1, 0.02);
      const bottomGroup = groupMean(-9, c01, 0.1, 0.02);
      expect(topGroup).toBeCloseTo(0.102136, 5);
      expect(bottomGroup).toBeCloseTo(0.001187, 5);
      expect(topGroup / bottomGroup).toBeCloseTo(86.1, 1);
      // convex, so the group mean exceeds the boundary — by 24% here
      expect(topGroup).toBeGreaterThan(liabilityRisk(c99, 0.1, 0.02));
      expect(topGroup / liabilityRisk(c99, 0.1, 0.02)).toBeCloseTo(1.2402, 3);
      // and the bottom group sits BELOW its boundary, because the curve is decreasing there
      expect(bottomGroup).toBeLessThan(liabilityRisk(c01, 0.1, 0.02));
      for (const v of ['0.102136', '0.001187', '\\approx 86.1']) expect(mdx, v).toContain(v);
      // marked approximate: 0.102136/0.001187 is 86.0455, not 86.1 on the nose
      expect(0.102136 / 0.001187).toBeCloseTo(86.05, 2);
    });

    it('step 4: the case-share identity recovers the group mean without integrating', () => {
      // 5.11% of all cases sit in the top centile, so 0.0511 * K / 0.01 = the group mean.
      const topGroup = groupMean(normalQuantile(0.99), 9, 0.1, 0.02);
      const shareOfCases = (topGroup * 0.01) / 0.02;
      expect(100 * shareOfCases).toBeCloseTo(5.11, 2);
      expect((shareOfCases * 0.02) / 0.01).toBeCloseTo(topGroup, 12);
      // The identity needs the UNROUNDED share: 0.0511 x 2 = 0.1022, not 0.102136.
      expect(100 * shareOfCases).toBeCloseTo(5.1068, 3);
      expect(0.051068 * 0.02 / 0.01).toBeCloseTo(0.102136, 6);
      expect(0.0511 * 0.02 / 0.01).not.toBeCloseTo(0.102136, 5);
      expect(mdx).toContain('5.1068\\%');
      expect(mdx).toContain('0.051068 \\times 0.02 / 0.01 = 0.102136');
    });

    it('step 5: the two sentences now carry the group numbers', () => {
      const topGroup = groupMean(normalQuantile(0.99), 9, 0.1, 0.02);
      expect(1 - topGroup).toBeCloseTo(0.897864, 5);
      expect(mdx).toContain('0.897864');
      expect(mdx).toContain('89.79%');
      // and the old boundary-derived figures are gone from the group claims
      expect(mdx).not.toContain('0.917643');
      expect(mdx).not.toContain('91.76%');
    });

    it('averages to the prevalence, so the curve is consistent with K', () => {
      // A sanity property of the model the figure draws: risk at the median is below K,
      // and the whole curve integrates back to K (proved in deepDiveMath.test.ts).
      expect(liabilityRisk(0, 0.1, 0.02)).toBeLessThan(0.02);
      expect(liabilityRisk(normalQuantile(0.99), 0.1, 0.02)).toBeGreaterThan(0.02);
    });
  });

  describe('figure 1 — every label it draws', () => {
    it('marks the three centiles and the population line', () => {
      expect((100 * liabilityRisk(normalQuantile(0.99), 0.1, 0.02)).toFixed(2)).toBe('8.24');
      expect((100 * liabilityRisk(normalQuantile(0.9), 0.1, 0.02)).toFixed(2)).toBe('4.11');
      expect((100 * liabilityRisk(normalQuantile(0.01), 0.1, 0.02)).toFixed(2)).toBe('0.16');
      // the curve is a point function, so its markers stay point values
      expect((100 * liabilityRisk(0, 0.1, 0.02)).toFixed(2)).toBe('1.52');
      for (const l of ['8.24%', '4.11%', '0.16%', 'population risk, 2%',
                       'carry 86.1 times the risk'])
        expect(mdx, `figure label ${l}`).toContain(l);
      // the caption used to list the 2% prevalence line as a fourth curve reading
      expect(mdx).toContain('1.52% at the median');
      expect(mdx).not.toContain('2% at the population average');
    });
  });

  describe('exercises', () => {
    it('1 — a commoner disease gives a much smaller fold-change for the same score', () => {
      expect(normalQuantile(0.9)).toBeCloseTo(1.281552, 6);
      const top = liabilityRisk(normalQuantile(0.99), 0.1, 0.1);
      const bottom = liabilityRisk(normalQuantile(0.01), 0.1, 0.1);
      expect(top).toBeCloseTo(0.282502, 6);
      expect(bottom).toBeCloseTo(0.016738, 6);
      expect(top / bottom).toBeCloseTo(16.9, 1);
      // the point: same score, prevalence 5x higher, fold-change 3x smaller
      const ratio2pc =
        liabilityRisk(normalQuantile(0.99), 0.1, 0.02) /
        liabilityRisk(normalQuantile(0.01), 0.1, 0.02);
      expect(ratio2pc).toBeGreaterThan(top / bottom);
      for (const v of ['1.281552', '0.282502', '0.016738', '16.9']) expect(mdx, v).toContain(v);
    });

    it('3 — the screened top 5% averages 51 per 1,000, not the 33 at its boundary', () => {
      expect(normalQuantile(0.99)).toBeCloseTo(2.326348, 6);
      expect(Math.sqrt(0.15)).toBeCloseTo(0.387298, 6);
      expect(normalQuantile(0.95)).toBeCloseTo(1.644854, 6);
      const boundary = liabilityRisk(normalQuantile(0.95), 0.15, 0.01);
      expect(boundary).toBeCloseTo(0.033453, 6);
      const group = groupMean(normalQuantile(0.95), 9, 0.15, 0.01);
      expect(group).toBeCloseTo(0.050973, 5);
      expect(Math.round(1000 * group)).toBe(51);
      expect(Math.round(1000 * (1 - group))).toBe(949);
      // the boundary understates the screening yield by a third
      expect(boundary / group).toBeCloseTo(0.6563, 3);
      // independent check quoted in the solution: the top 5% holds 25.5% of all cases
      expect(100 * ((group * 0.05) / 0.01)).toBeCloseTo(25.5, 1);
      for (const v of ['0.387298', '1.644854', '0.033453', '0.050973', '51 in every 1,000', '25.5%'])
        expect(mdx, v).toContain(v);
    });
  });
});

describe('gwas (hub)', () => {
  const mdx = lesson('gwas');
  const K = (Math.sqrt(chi2Quantile(1 - 5e-8, 1)) + normalQuantile(0.8)) ** 2;

  describe('worked example — fifty thousand people, and what one variant is worth', () => {
    it('step 1: the 4:1 imbalance costs 18,000 before any data exists', () => {
      expect(effectiveSampleSize(10000, 40000)).toBeCloseTo(32000, 9);
      expect(effectiveSampleSize(25000, 25000) - effectiveSampleSize(10000, 40000)).toBeCloseTo(
        18000,
        6
      );
      expect(mdx).toContain('= 32{,}000');
      expect(mdx).toContain('cost 18,000');
    });

    it('step 2: pruning the control arm costs 64.52, the case arm 1,032.26', () => {
      expect(effectiveSampleSize(10000, 39600)).toBeCloseTo(31935.48, 2);
      expect(32000 - effectiveSampleSize(10000, 39600)).toBeCloseTo(64.52, 2);
      expect(32000 - effectiveSampleSize(9600, 40000)).toBeCloseTo(1032.26, 2);
      expect(mdx).toContain('31{,}935.48');
      expect(mdx).toContain('1,032.26');
    });

    it('step 3: imputation quality multiplies, leaving 17,564.52', () => {
      expect(effectiveSampleSize(10000, 39600) * 0.55).toBeCloseTo(17564.52, 2);
      expect(mdx).toContain('17{,}564.52');
    });

    it('step 4: the detection limit is nearly three times what the grant promised', () => {
      const atVariant = effectiveSampleSize(10000, 39600) * 0.55;
      expect(K / atVariant).toBeCloseTo(2.2546e-3, 7);
      expect(K / 50000).toBeCloseTo(7.9202e-4, 8);
      expect(K / atVariant / (K / 50000)).toBeCloseTo(2.8466, 4);
      expect(mdx).toContain('2.2546 \\times 10^{-3}');
      expect(mdx).toContain('7.92 \\times 10^{-4}');
    });

    it('step 5: 35.13% of the headcount survives, with no error anywhere', () => {
      const atVariant = effectiveSampleSize(10000, 39600) * 0.55;
      expect((100 * atVariant) / 50000).toBeCloseTo(35.13, 2);
      expect(mdx).toContain('35.13\\%');
    });
  });

  describe('figure 1 — every label it draws', () => {
    it('draws the four stages of the erosion', () => {
      expect(Math.round(effectiveSampleSize(10000, 39600))).toBe(31935);
      expect(Math.round(effectiveSampleSize(10000, 39600) * 0.55)).toBe(17565);
      for (const l of ['50,000', '32,000', '31,935', '17,565', 'people recruited',
                       'after the 4:1 imbalance', 'after relatedness pruning',
                       'at a variant imputed 0.55', '35.1%'])
        expect(mdx, `figure label ${l}`).toContain(l);
    });
  });

  describe('exercises', () => {
    it('1 — a 9:1 split wastes almost all its controls', () => {
      expect(effectiveSampleSize(5000, 45000)).toBeCloseTo(18000, 6);
      expect(controlCeiling(5000)).toBe(20000);
      expect(effectiveSampleSize(5000, 45000) / controlCeiling(5000)).toBeCloseTo(0.9, 9);
      expect(effectiveSampleSize(25000, 25000)).toBeCloseTo(50000, 6);
      for (const v of ['18{,}000', '90\\%']) expect(mdx, v).toContain(v);
    });

    it('3 — better imputation nearly matches spending everything on cases', () => {
      const base = effectiveSampleSize(8000, 32000);
      expect(base).toBeCloseTo(25600, 6);
      expect(base * 0.6).toBeCloseTo(15360, 6);
      const addControls = effectiveSampleSize(8000, 40000) * 0.6;
      const addCases = effectiveSampleSize(16000, 32000) * 0.6;
      expect(addControls).toBeCloseTo(16000, 2);
      expect(addCases).toBeCloseTo(25600, 2);
      expect(addCases - addControls).toBeCloseTo(9600, 2);
      // and deeper sequencing, which applies genome-wide rather than to the study
      expect(base * 0.95).toBeCloseTo(24320, 6);
      expect(base * 0.95 - base * 0.6).toBeCloseTo(8960, 6);
      for (const v of ['25{,}600', '15{,}360', '26{,}666.67', '42{,}666.67', '9{,}600.00',
                       '24{,}320', '8,960'])
        expect(mdx, v).toContain(v);
    });
  });
});


describe('sc-from-cells-to-counts — worked example, figures and exercises', () => {
  const mdx = lesson('sc-from-cells-to-counts');

    it('the remaining printed constants are what they claim to be', () => {
      expect(4 ** 10).toBe(1048576);
      expect((100 * rateFor(5000)).toFixed(4)).toBe('4.1111');
      for (const v of ['1{,}048{,}576', '4.1111']) expect(mdx, v).toContain(v);
    });

  // The whole lesson hangs off one device constant, inverted from the field's rule of
  // thumb: 0.8% doublets per 1,000 cells recovered is 500/D per thousand, so D = 62,500.
  const D = 62500;
  const lambdaFor = (recovered: number) => -Math.log(1 - recovered / D);
  const rateFor = (recovered: number) => multipletRate(lambdaFor(recovered));
  // two decimals, rounded in integer space so the digits asserted are the digits printed
  const pct2 = (x: number) => (Math.round(x * 1e4) / 100).toFixed(2);

  describe('the small-lambda approximation the lesson leans on', () => {
    it('r(lambda) ~ lambda/2, to 0.167% at lambda = 0.01', () => {
      expect(multipletRate(0.01)).toBeCloseTo(0.0049917, 7);
      const relErr = (100 * (multipletRate(0.01) - 0.005)) / multipletRate(0.01);
      expect(relErr).toBeCloseTo(-0.167, 3);
      expect(mdx).toContain('0.4992%');
      expect(mdx).toContain('0.5000%');
      expect(mdx).toContain('0.167%');
    });

    it('D = 62,500 is what the 0.8%-per-1,000 rule implies, and reproduces it', () => {
      expect(500 / 0.008).toBe(D);
      expect(pct2(rateFor(1000))).toBe('0.80');
      expect(mdx).toContain('62{,}500');
    });
  });

  describe('worked example — a doublet budget for a 10,000-cell run', () => {
    it('step 1: recovering 10,000 of 62,500 partitions needs lambda = 0.17435', () => {
      expect(1 - 10000 / D).toBeCloseTo(0.84, 12);
      expect(lambdaFor(10000)).toBeCloseTo(0.17435, 5);
      expect(mdx).toContain('0.17435');
      expect(mdx).toContain('\\ln(0.84)');
    });

    it('step 2: the rate is 8.46%, not the 8.00% the linear rule promises', () => {
      expect(rateFor(10000)).toBeCloseTo(0.084645, 6);
      expect(pct2(rateFor(10000))).toBe('8.46');
      expect(Math.round(rateFor(10000) * 10000)).toBe(846);
      expect(100 * 0.008 * 10).toBeCloseTo(8, 12);
      expect(mdx).toContain('0.084645');
      expect(mdx).toContain('846');
    });

    it('step 3: hashing four samples catches three quarters of them', () => {
      const doublets = rateFor(10000) * 10000;
      expect(Math.round(doublets * 0.75)).toBe(635);
      expect(Math.round(doublets * 0.25)).toBe(212);
      expect(mdx).toContain('635');
      expect(mdx).toContain('212');
    });

    it('step 4: 8.46% becomes 2.26% among the survivors, and 1.14% at eight samples', () => {
      const doublets = rateFor(10000) * 10000;
      const kept = 10000 - doublets * 0.75;
      expect(Math.round(kept)).toBe(9365);
      expect(pct2((doublets * 0.25) / kept)).toBe('2.26');
      const kept8 = 10000 - doublets * (7 / 8);
      expect(pct2((doublets / 8) / kept8)).toBe('1.14');
      expect(mdx).toContain('9{,}365');
      expect(mdx).toContain('2.26\\%');
      expect(mdx).toContain('1.14%');
    });
  });

  describe('figure 1 — every label it draws', () => {
    it('draws the three readings and the linear rule they are measured against', () => {
      expect(pct2(rateFor(1000))).toBe('0.80');
      expect(pct2(rateFor(10000))).toBe('8.46');
      expect(pct2(rateFor(20000))).toBe('18.05');
      for (const l of ['0.80%', '8.46%', '18.05%', '1,000 cells', '10,000 cells',
                       '20,000 cells', 'the 0.8%-per-1,000 rule', 'Cells recovered'])
        expect(mdx, `figure 1 label ${l}`).toContain(l);
    });

    it('the caption states the gap against the rule in both directions', () => {
      // the rule is the tangent at the origin: 0.8% per thousand, exactly linear
      expect((0.008 * 20000) / 1000).toBeCloseTo(0.16, 12);
      expect(mdx).toContain('16.00%');
      expect(mdx).toContain('8.00%');
    });
  });

  describe('UMI collision', () => {
    const distinct = (m: number, k: number) => 4 ** k * (1 - Math.exp(-m / 4 ** k));
    const loss = (m: number, k: number) => (m - distinct(m, k)) / m;

    it('at 1,000 molecules the three barcode lengths lose 0.76%, 0.048% and 0.0030%', () => {
      expect(100 * loss(1000, 8)).toBeCloseTo(0.7591, 4);
      expect(100 * loss(1000, 10)).toBeCloseTo(0.0477, 4);
      expect(100 * loss(1000, 12)).toBeCloseTo(0.0030, 4);
      for (const l of ['0.76%', '0.048%', '0.0030%']) expect(mdx, l).toContain(l);
    });

    it('two extra bases divide the loss by sixteen, which is the whole argument', () => {
      // exactly sixteen in the m/(2U) limit the claim is made in ...
      expect((1000 / (2 * 4 ** 8)) / (1000 / (2 * 4 ** 10))).toBe(16);
      expect((1000 / (2 * 4 ** 10)) / (1000 / (2 * 4 ** 12))).toBe(16);
      // ... and within half a unit of it at the m = 1,000 the lesson quotes, since the
      // exact curve has already begun to saturate at 8 bases
      expect(loss(1000, 8) / loss(1000, 10)).toBeCloseTo(15.92, 2);
      expect(loss(1000, 10) / loss(1000, 12)).toBeCloseTo(16.0, 1);
      expect(mdx).toContain('sixteen for every two bases');
    });
  });

  describe('exercises', () => {
    it('1 — 5,000 cells gives 4.11%, already over the quoted rule per thousand', () => {
      expect(lambdaFor(5000)).toBeCloseTo(0.083382, 6);
      expect(1 - 5000 / D).toBeCloseTo(0.92, 12);
      expect(rateFor(5000)).toBeCloseTo(0.041111, 6);
      expect(pct2(rateFor(5000))).toBe('4.11');
      expect(rateFor(5000) * 5000).toBeCloseTo(205.6, 1);
      expect((100 * rateFor(5000)) / 5).toBeCloseTo(0.8222, 4);
      for (const v of ['0.083382', '\\ln(0.92)', '0.041111', '205.6', '206',
                       '0.8222\\%']) expect(mdx, v).toContain(v);
    });

    it('2 — superloading loses to eight lanes at 8 samples and beats them at 16', () => {
      expect(lambdaFor(20000)).toBeCloseTo(0.385662, 6);
      expect(1 - 20000 / D).toBeCloseTo(0.68, 12);
      expect(rateFor(20000)).toBeCloseTo(0.180467, 6);
      const doublets = rateFor(20000) * 20000;
      expect(Math.round(doublets)).toBe(3609);
      expect(Math.round(doublets * (7 / 8))).toBe(3158);
      const kept = 20000 - doublets * (7 / 8);
      expect(Math.round(doublets / 8)).toBe(451);
      expect(Math.round(kept)).toBe(16842);
      expect(pct2((doublets / 8) / kept)).toBe('2.68');
      // eight separate lanes of 2,500, nothing hashed and nothing removed
      expect(lambdaFor(2500)).toBeCloseTo(0.040822, 6);
      expect(rateFor(2500)).toBeCloseTo(0.020272, 6);
      expect(pct2(rateFor(2500))).toBe('2.03');
      // sixteen hashed samples reverses the verdict
      const kept16 = 20000 - doublets * (15 / 16);
      expect(Math.round(doublets / 16)).toBe(226);
      expect(Math.round(kept16)).toBe(16616);
      expect(pct2((doublets / 16) / kept16)).toBe('1.36');
      for (const v of ['0.385662', '\\ln(0.68)', '0.180467', '3,609', '3,158',
                       '16{,}842', '2.68\\%', '0.040822', '\\ln(0.96)', '0.020272',
                       '16,616', '1.36%']) expect(mdx, v).toContain(v);
    });

    it('3 — 5,000 molecules needs eleven bases to stay under 0.1%', () => {
      const distinct = (m: number, k: number) => 4 ** k * (1 - Math.exp(-m / 4 ** k));
      const loss = (m: number, k: number) => (m - distinct(m, k)) / m;
      expect(distinct(5000, 8)).toBeCloseTo(4814.0, 1);
      expect(100 * loss(5000, 8)).toBeCloseTo(3.72, 2);
      expect(distinct(5000, 10)).toBeCloseTo(4988.1, 1);
      expect(100 * loss(5000, 10)).toBeCloseTo(0.238, 3);
      // the threshold: 10 bases misses, 11 clears it
      expect(loss(5000, 10)).toBeGreaterThan(0.001);
      expect(loss(5000, 11)).toBeLessThan(0.001);
      expect(100 * loss(5000, 11)).toBeCloseTo(0.0596, 4);
      expect(4 ** 10 / 1e6).toBeCloseTo(1.05, 2);
      expect(4 ** 11 / 1e6).toBeCloseTo(4.19, 2);
      for (const v of ['65{,}536', '4{,}814.0', '3.72%', '4{,}988.1', '0.24%',
                       '1.05 \\times 10^6', '4.19 \\times 10^6', '0.0596%', '11 bases'])
        expect(mdx, v).toContain(v);
    });
  });
});


describe('single-cell hub — the design effect the whole track is arranged around', () => {
  const mdx = lesson('single-cell');
  const RHO = 0.05;
  const pct1 = (x: number) => (Math.round(x * 1e3) / 10).toFixed(1);
  const pct2 = (x: number) => (Math.round(x * 1e4) / 100).toFixed(2);

  describe('worked example — what forty thousand cells are actually worth', () => {
    it('step 1: eight donors at 5,000 cells carry a design effect of 250.95', () => {
      expect(designEffect(5000, RHO)).toBeCloseTo(250.95, 10);
      expect(1 + 4999 * RHO).toBeCloseTo(250.95, 10);
      expect(mdx).toContain('250.95');
    });

    it('step 2: statistics inflate 15.842-fold, giving a 90.2% false-positive rate', () => {
      expect(Math.sqrt(designEffect(5000, RHO))).toBeCloseTo(15.8414, 4);
      expect(1.959963984540054 / Math.sqrt(designEffect(5000, RHO))).toBeCloseTo(0.12372, 5);
      // the page must NOT print the rounded 15.842, nor 2*Phi(-0.1237), which is 0.9016
      expect(mdx).not.toContain('15.842');
      expect(mdx).not.toContain('2\\Phi(-0.1237)');
      expect(clusteredFalsePositiveRate(5000, RHO)).toBeCloseTo(0.9015, 4);
      expect(pct1(clusteredFalsePositiveRate(5000, RHO))).toBe('90.2');
      for (const v of ['15.841', '0.12372', '0.9015', '90.2%']) expect(mdx, v).toContain(v);
    });

    it('step 3: 40,000 cells are worth 159.39 independent ones, 0.398% of them', () => {
      expect(effectiveIndependentCells(8, 5000, RHO)).toBeCloseTo(159.39, 2);
      expect((100 * effectiveIndependentCells(8, 5000, RHO)) / 40000).toBeCloseTo(0.398, 3);
      expect(mdx).toContain('159.39');
      expect(mdx).toContain('0.398%');
    });

    it('step 4: the ceiling is 160 and is already 99.6% reached', () => {
      const ceiling = 8 / RHO;
      expect(ceiling).toBe(160);
      expect(pct1(effectiveIndependentCells(8, 5000, RHO) / ceiling)).toBe('99.6');
      expect(mdx).toContain('n/\\rho = 160');
      expect(mdx).toContain('99.6%');
    });

    it('step 4: doubling cells gains 0.30, doubling donors gains 159.39', () => {
      const base = effectiveIndependentCells(8, 5000, RHO);
      const moreCells = effectiveIndependentCells(8, 10000, RHO);
      const moreDonors = effectiveIndependentCells(16, 5000, RHO);
      expect(moreCells).toBeCloseTo(159.7, 2);
      expect(moreCells - base).toBeCloseTo(0.3, 2);
      expect(moreDonors).toBeCloseTo(318.79, 2);
      expect(moreDonors - base).toBeCloseTo(159.39, 2);
      // the claim the prose makes about the ratio of the two gains
      expect((moreDonors - base) / (moreCells - base)).toBeGreaterThan(500);
      for (const v of ['159.70', '318.79', '0.30', 'over five hundred times'])
        expect(mdx, v).toContain(v);
    });
  });

  describe('figure 1 — every label it draws', () => {
    it('draws the three false-positive rates and the calibrated line', () => {
      expect(pct1(clusteredFalsePositiveRate(50, RHO))).toBe('29.1');
      expect(pct1(clusteredFalsePositiveRate(500, RHO))).toBe('70.0');
      expect(pct1(clusteredFalsePositiveRate(5000, RHO))).toBe('90.2');
      for (const l of ['29.1%', '70.0%', '90.2%', '50 cells', '500 cells', '5,000 cells',
                       'pseudobulk: calibrated at 5%', 'Cells per sample'])
        expect(mdx, `figure label ${l}`).toContain(l);
    });

    it('the caption decodes the curve the same way the figure draws it', () => {
      // the caption attributes the rise to DE growing linearly in m — check it does
      expect(designEffect(5000, RHO) / designEffect(500, RHO)).toBeCloseTo(9.6705, 4);
      expect(mdx).toContain('29.1% at 50 cells per sample, 70.0% at 500, and 90.2% at 5,000');
    });
  });

  describe('exercises', () => {
    it('1 — 200 cells at rho = 0.1 rejects 66.8% of nulls, and Bonferroni cannot help', () => {
      expect(designEffect(200, 0.1)).toBeCloseTo(20.9, 10);
      expect(Math.sqrt(designEffect(200, 0.1))).toBeCloseTo(4.5717, 4);
      expect(1.959963984540054 / Math.sqrt(designEffect(200, 0.1))).toBeCloseTo(0.4287, 4);
      expect(clusteredFalsePositiveRate(200, 0.1)).toBeCloseTo(0.6681, 4);
      expect(0.05 / 20000).toBeCloseTo(2.5e-6, 12);
      for (const v of ['20.9', '4.5717', '0.4287', '0.6681', '66.8%',
                       '2.5 \\times 10^{-6}']) expect(mdx, v).toContain(v);
    });

    it('2 — the design effect passes 10 at 901, 181 and 91 cells', () => {
      for (const [rho, m] of [[0.01, 901], [0.05, 181], [0.1, 91]] as const) {
        expect(1 + 9 / rho).toBeCloseTo(m, 10);
        expect(designEffect(m, rho)).toBeCloseTo(10, 10);
        expect(designEffect(m - 1, rho)).toBeLessThan(10);
      }
      expect(designEffect(500, RHO)).toBeCloseTo(25.95, 10);
      expect(pct1(clusteredFalsePositiveRate(500, RHO))).toBe('70.0');
      for (const v of ['901', '181', '91', '25.95']) expect(mdx, v).toContain(v);
    });

    it('3 — four donors cap at 80 effective cells and 1,000 each reaches 98.1% of it', () => {
      expect(4 / RHO).toBe(80);
      expect(designEffect(1000, RHO)).toBeCloseTo(50.95, 10);
      expect(effectiveIndependentCells(4, 1000, RHO)).toBeCloseTo(78.51, 2);
      expect(pct1(effectiveIndependentCells(4, 1000, RHO) / 80)).toBe('98.1');
      // and the limit really is unreachable: a million cells each adds under two
      expect(effectiveIndependentCells(4, 1e6, RHO) - effectiveIndependentCells(4, 1000, RHO))
        .toBeLessThan(2);
      // 400 effective cells needs 20 donors however deep the sequencing
      expect(400 * RHO).toBe(20);
      for (const v of ['50.95', '78.51', '98.1%', '20n']) expect(mdx, v).toContain(v);
      expect(mdx).toMatch(/\*\*Twenty\s+donors\*\*/);
    });
  });
});


describe('sc-count-noise-model — the count model, and what it says about zeros', () => {
  const mdx = lesson('sc-count-noise-model');

    it('the remaining printed constants are what they claim to be', () => {
      const theta = nbTheta(2, 8);
      expect((theta + 2).toFixed(4)).toBe('2.6667');
      const p0 = nbZeroProbability(2, theta);
      expect(p0.toFixed(4)).toBe('0.3969');
      expect((1 - p0).toFixed(4)).toBe('0.6031');
      for (const v of ['2.6667', '0.3969', '0.6031']) expect(mdx, v).toContain(v);
    });
  const pct2 = (x: number) => (Math.round(x * 1e4) / 100).toFixed(2);

  describe('the Poisson baseline', () => {
    it('a mean of 0.1 is zero in 90.48% of cells, from sampling alone', () => {
      expect(poissonZeroProbability(0.1)).toBeCloseTo(0.904837, 6);
      expect(pct2(poissonZeroProbability(0.1))).toBe('90.48');
      expect(mdx).toContain('0.904837');
      expect(mdx).toContain('90.48%');
    });

    it('the same number is what a mean of one molecule at 10% capture gives', () => {
      expect(1 * 0.1).toBeCloseTo(0.1, 12);
      expect(poissonZeroProbability(1000 * 0.1)).toBeLessThan(1e-40); // "never zero"
    });
  });

  describe('worked example — does this gene need a dropout parameter?', () => {
    const MU = 0.5;
    const VAR = 0.625;
    const CELLS = 5000;

    it('step 1: it is overdispersed, so Poisson is already out', () => {
      expect(VAR - MU).toBeCloseTo(0.125, 12);
      expect(mdx).toContain('0.625 - 0.5 = 0.125');
    });

    it('step 2: the moment estimator gives theta = 2 without touching the zeros', () => {
      expect(nbTheta(MU, VAR)).toBeCloseTo(2, 12);
      expect((MU * MU) / (VAR - MU)).toBeCloseTo(2, 12);
      expect(mdx).toContain('\\frac{0.25}{0.125} = 2');
    });

    it('step 3: theta = 2 predicts 64.00% zeros, which is 3,200 of 5,000 cells', () => {
      expect(nbZeroProbability(MU, 2)).toBeCloseTo(0.64, 12);
      expect(0.8 ** 2).toBeCloseTo(0.64, 12);
      expect(pct2(nbZeroProbability(MU, 2))).toBe('64.00');
      expect(nbZeroProbability(MU, 2) * CELLS).toBeCloseTo(3200, 9);
      expect(mdx).toContain('64.00%');
      expect(mdx).toContain('3{,}200');
      // and the variance the fitted theta implies is the variance we started from
      expect(nbVariance(MU, 2)).toBeCloseTo(VAR, 12);
    });

    it('step 4: against Poisson the same gene would be reported as 5.5% dropout', () => {
      expect(poissonZeroProbability(MU)).toBeCloseTo(0.606531, 6);
      expect(Math.round(poissonZeroProbability(MU) * CELLS)).toBe(3033);
      expect(3200 - Math.round(poissonZeroProbability(MU) * CELLS)).toBe(167);
      expect(pct2(nbZeroProbability(MU, 2) - poissonZeroProbability(MU))).toBe('3.35');
      // the reported rate is the excess as a share of cells, 167/3000-ish -> 5.5% of zeros
      expect((100 * 167) / 3033).toBeCloseTo(5.5, 1);
      for (const v of ['0.606531', '3,033', '167', '5.5%']) expect(mdx, v).toContain(v);
    });
  });

  describe('figure 1 — every label it draws', () => {
    it('the three curves agree at a mean of 0.1 and the caption says by how much', () => {
      expect(pct2(poissonZeroProbability(0.1))).toBe('90.48');
      expect(pct2(nbZeroProbability(0.1, 2))).toBe('90.70');
      expect(pct2(nbZeroProbability(0.1, 0.5))).toBe('91.29');
      expect(mdx).toContain('90.48%, 90.70% and 91.29%');
      for (const l of ['90.5% at a mean of 0.1', 'where most genes sit', 'Poisson',
                       'NB, theta 2', 'NB, theta 0.5', 'Mean UMIs per cell'])
        expect(mdx, `figure 1 label ${l}`).toContain(l);
    });
  });

  describe('figure 2 — the caption states an encoding rule, so decode it the same way', () => {
    it('the NB really does sit 5% above Poisson at a mean of 0.1', () => {
      expect(nbVariance(0.1, 2)).toBeCloseTo(0.105, 12);
      expect(nbVariance(0.1, 2) / 0.1).toBeCloseTo(1.05, 12);
      expect(mdx).toContain('mean 0.1: the NB sits 5% above Poisson');
      // "dominant by a mean of 10": the quadratic term is 5x the linear one at theta 2
      expect((10 * 10) / 2 / 10).toBe(5);
    });

    it('overdispersion can only add zeros, never remove them', () => {
      for (const mu of [0.05, 0.1, 0.5, 1, 3, 10])
        for (const theta of [0.5, 2, 10, 100])
          expect(nbZeroProbability(mu, theta)).toBeGreaterThan(poissonZeroProbability(mu));
      expect(mdx).toContain('mixing rates always adds zeros');
    });
  });

  describe('exercises', () => {
    it('1 — two very different count models differ by 43 cells in 10,000', () => {
      expect(poissonZeroProbability(0.1)).toBeCloseTo(0.904837, 6);
      expect(nbZeroProbability(0.1, 1)).toBeCloseTo(0.909091, 6);
      expect(Math.round(poissonZeroProbability(0.1) * 10000)).toBe(9048);
      expect(Math.round(nbZeroProbability(0.1, 1) * 10000)).toBe(9091);
      expect(9091 - 9048).toBe(43);
      expect(pct2(nbZeroProbability(0.1, 1) - poissonZeroProbability(0.1))).toBe('0.43');
      for (const v of ['0.909091', '9,048', '9,091', '43 cells out of 10,000',
                       '0.43 percentage points']) expect(mdx, v).toContain(v);
    });

    it('2 — a 25.5% dropout claim is entirely the Poisson-vs-NB gap', () => {
      expect(nbTheta(2, 8)).toBeCloseTo(0.666667, 6);
      expect(nbZeroProbability(2, nbTheta(2, 8))).toBeCloseTo(0.39685, 5);
      expect(Math.round(nbZeroProbability(2, nbTheta(2, 8)) * 5000)).toBe(1984);
      expect(poissonZeroProbability(2)).toBeCloseTo(0.135335, 6);
      expect(Math.round(poissonZeroProbability(2) * 5000)).toBe(677);
      expect(1950 - 677).toBe(1273);
      expect(pct2(1273 / 5000)).toBe('25.46'); // the prose rounds this to 25.5%
      // the observed shortfall against the NB is under one standard deviation
      const sd = Math.sqrt(5000 * 0.39685 * (1 - 0.39685));
      expect(sd).toBeCloseTo(34.6, 1);
      expect(Math.abs(1950 - 1984) / sd).toBeLessThan(1);
      for (const v of ['0.6667', '0.396850', '1,984', '0.135335', '677', '1{,}273',
                       '25.5%']) expect(mdx, v).toContain(v);
      // anchored to its LaTeX context: a bare '34.6' also matches SVG path data
      expect(mdx).toContain('= 34.6$');
    });

    it('3 — 43 cells is 1.47 SD, so the models are not separable at low mean', () => {
      const p0 = poissonZeroProbability(0.1);
      const sd = Math.sqrt(10000 * p0 * (1 - p0));
      expect(10000 * p0 * (1 - p0)).toBeCloseTo(861.07, 2);
      expect(sd).toBeCloseTo(29.34, 2);
      expect(43 / sd).toBeCloseTo(1.47, 2);
      // and the well-expressed genes really are twelvefold apart
      expect(pct2(poissonZeroProbability(5))).toBe('0.67');
      expect(pct2(nbZeroProbability(5, 2))).toBe('8.16');
      expect(nbZeroProbability(5, 2) / poissonZeroProbability(5)).toBeCloseTo(12.1, 1);
      for (const v of ['861.06', '29.34', '1.47', '0.67%', '8.16%', 'twelvefold'])
        expect(mdx, v).toContain(v);
    });
  });
});


describe('sc-ambient-and-doublets — two artefacts that look like cell types', () => {
  const mdx = lesson('sc-ambient-and-doublets');
  const pct1 = (x: number) => (Math.round(x * 1e3) / 10).toFixed(1);
  const pct2 = (x: number) => (Math.round(x * 1e4) / 100).toFixed(2);
  const detected = (depth: number, alpha: number, soup: number) =>
    1 - Math.exp(-depth * alpha * soup);

  describe('worked example — a marker that means nothing', () => {
    it('step 1: the marker is 0.40% of the soup', () => {
      expect(0.2 * 0.02).toBeCloseTo(0.004, 12);
      expect(pct2(0.004)).toBe('0.40');
      expect(mdx).toContain('0.20 \\times 0.02 = 0.004');
      expect(mdx).toContain('0.40%');
    });

    it('step 2: a 5,000-UMI cell picks up 2.0 counts of it', () => {
      expect(5000 * 0.1 * 0.004).toBeCloseTo(2, 12);
      expect(5000 * 0.1).toBe(500);
      expect(mdx).toContain('5{,}000 \\times 0.10 \\times 0.004 = 2.0');
    });

    it('step 3: which is visible in 86.5% of the wrong cells', () => {
      expect(detected(5000, 0.1, 0.004)).toBeCloseTo(0.864665, 6);
      expect(pct1(detected(5000, 0.1, 0.004))).toBe('86.5');
      expect(mdx).toContain('0.864665');
      expect(mdx).toContain('86.5%');
    });

    it('step 4: the same cell at 20,000 and 1,000 UMIs gives 99.97% and 33.0%', () => {
      expect(20000 * 0.1 * 0.004).toBeCloseTo(8, 12);
      expect(1000 * 0.1 * 0.004).toBeCloseTo(0.4, 12);
      expect(detected(20000, 0.1, 0.004)).toBeCloseTo(0.999665, 6);
      expect(pct2(detected(20000, 0.1, 0.004))).toBe('99.97');
      expect(detected(1000, 0.1, 0.004)).toBeCloseTo(0.329680, 6);
      expect(pct1(detected(1000, 0.1, 0.004))).toBe('33.0');
      for (const v of ['99.97%', '33.0%']) expect(mdx, v).toContain(v);
    });
  });

  describe('figure 1 — every label it draws', () => {
    it('draws the three depths and the 86.5% reading', () => {
      expect(pct1(detected(5000, 0.1, 0.004))).toBe('86.5');
      for (const l of ['86.5% at 10% ambient', '20,000 UMIs', '5,000 UMIs', '1,000 UMIs'])
        expect(mdx, `figure 1 label ${l}`).toContain(l);
      // the caption's three readings, decoded the way the figure draws them
      expect(mdx).toContain('86.5% of the time');
      expect(mdx).toContain('only 33.0% of the time');
    });
  });

  describe('figure 2 — the Gamma sum is exact, so the caption can be checked exactly', () => {
    const K = 4;
    const S = 1250;
    const cdf = (x: number, shape: number) => regularizedGammaP(shape, x / S);

    it('a doublet is Gamma(2k, s): mean 10,000 and sd sqrt(2k)s', () => {
      expect(K * S).toBe(5000);
      expect(2 * K * S).toBe(10000);
      expect(Math.sqrt(K) * S).toBe(2500);
      expect(Math.sqrt(2 * K) * S).toBeCloseTo(3535.53, 2);
      expect(mdx).toContain('\\Gamma(2k, s)');
    });

    it('9,692 is the singlet 95th percentile and catches 48.8% of doublets', () => {
      expect(cdf(9692, K)).toBeCloseTo(0.95, 4);
      expect(pct1(1 - cdf(9692, 2 * K))).toBe('48.8');
      for (const v of ['9,692', '48.8%']) expect(mdx, v).toContain(v);
    });

    it('catching 90% of doublets costs 31.7% of singlets', () => {
      // solve for the threshold that leaves 90% of doublets above it
      let lo = 1;
      let hi = 200000;
      for (let i = 0; i < 200; i += 1) {
        const m = (lo + hi) / 2;
        if (1 - cdf(m, 2 * K) > 0.9) lo = m;
        else hi = m;
      }
      const t = (lo + hi) / 2;
      expect(t).toBeCloseTo(5820, 0);
      expect(pct1(1 - cdf(t, K))).toBe('31.7');
      expect(mdx).toContain('31.7%');
    });
  });

  describe('exercises', () => {
    it('1 — albumin is 3% of the soup and reaches every Kupffer cell', () => {
      expect(0.6 * 0.05).toBeCloseTo(0.03, 12);
      expect(8000 * 0.05 * 0.03).toBeCloseTo(12, 12);
      expect(detected(8000, 0.05, 0.03)).toBeCloseTo(0.99999386, 8);
      for (const v of ['0.60 \\times 0.05 = 0.03', '= 12', '0.99999386'])
        expect(mdx, v).toContain(v);
    });

    it('2 — a 95th-percentile filter takes 10% to 5.65% and costs 450 real cells', () => {
      const doublets = 0.1 * 10000;
      const singlets = 10000 - doublets;
      expect(doublets).toBe(1000);
      expect(0.488 * doublets).toBeCloseTo(488, 6);
      expect(0.05 * singlets).toBeCloseTo(450, 6);
      const keptS = singlets - 450;
      const keptD = doublets - 488;
      expect(keptS).toBe(8550);
      expect(keptD).toBe(512);
      expect(pct2(keptD / (keptS + keptD))).toBe('5.65');
      for (const v of ['488', '450', '8{,}550', '512', '9{,}062', '5.65\\%'])
        expect(mdx, v).toContain(v);
    });

    it('3 — 54% of doublets are homotypic, so simulation leaves 4.49% and hashing 1.08%', () => {
      expect(0.7 ** 2 + 0.2 ** 2 + 0.1 ** 2).toBeCloseTo(0.54, 12);
      const doublets = 0.08 * 10000;
      expect(doublets).toBeCloseTo(800, 9);
      // simulation removes only the heterotypic 46%
      expect(0.46 * doublets).toBeCloseTo(368, 6);
      expect(pct2((doublets - 368) / (10000 - 368))).toBe('4.49');
      // hashing removes (S-1)/S regardless of type
      expect((7 / 8) * doublets).toBeCloseTo(700, 6);
      expect(pct2((doublets / 8) / (10000 - 700))).toBe('1.08');
      for (const v of ['0.49 + 0.04 + 0.01 = 0.54', '368', '432', '9{,}632', '4.49\\%',
                       '9{,}300', '1.08%']) expect(mdx, v).toContain(v);
    });
  });
});


describe('sc-cell-calling-qc — every filter priced in cells and in cell types', () => {
  const mdx = lesson('sc-cell-calling-qc');

    it('the remaining printed constants are what they claim to be', () => {
      expect(normalCdf(2).toFixed(4)).toBe('0.9772');
      expect(10000 - 8139).toBe(1861);
      for (const v of ['0.9772', '1,861']) expect(mdx, v).toContain(v);
    });
  const pct1 = (x: number) => (Math.round(x * 1e3) / 10).toFixed(1);
  const pct2 = (x: number) => (Math.round(x * 1e4) / 100).toFixed(2);
  /** Fraction of a Gamma(k, s) population surviving a threshold at t UMIs. */
  const keep = (t: number, k: number, s: number) => 1 - regularizedGammaP(k, t / s);

  describe('what a depth cutoff does to two size classes', () => {
    it('500 UMIs keeps 99.92% of the large population and 26.50% of the small', () => {
      expect(keep(500, 4, 1250)).toBeCloseTo(0.99922375, 8);
      expect(keep(500, 4, 100)).toBeCloseTo(0.26502592, 8);
      expect(pct1(keep(500, 4, 1250))).toBe('99.9');
      expect(pct1(keep(500, 4, 100))).toBe('26.5');
      expect(pct2(keep(500, 4, 1250))).toBe('99.92');
      expect(pct2(keep(500, 4, 100))).toBe('26.50');
      for (const v of ['26.5%', '99.9%', '99.92%', '26.50%']) expect(mdx, v).toContain(v);
    });

    it('the figure-1 mixture is the one the caption describes', () => {
      expect(0.04 * 100000).toBe(4000);
      expect(0.06 * 100000).toBeCloseTo(6000, 9);
      expect(0.9 * 100000).toBe(90000);
      expect(4 * 1250).toBe(5000);
      expect(4 * 100).toBe(400);
      expect(2 * 30).toBe(60);
      for (const l of ['a 500-UMI cutoff', 'large cells', 'small cells', 'empty droplets',
                       'Barcode rank'])
        expect(mdx, `figure 1 label ${l}`).toContain(l);
      expect(mdx).toContain('4,000 large cells averaging 5,000 UMIs, 6,000 small cells');
    });
  });

  describe('worked example — pricing a standard pipeline', () => {
    const SEQ = [0.96, 0.97, 0.92, 0.95];

    it('step 1: the four filters leave 81.4% of cells', () => {
      let n = 10000;
      const stages: number[] = [];
      for (const k of SEQ) {
        n *= k;
        stages.push(Math.round(n));
      }
      expect(stages).toEqual([9600, 9312, 8567, 8139]);
      expect(pct1(n / 10000)).toBe('81.4');
      expect(mdx).toContain('10{,}000 \\to 9{,}600 \\to 9{,}312 \\to 8{,}567 \\to 8{,}139');
      expect(mdx).toContain('81.4%');
    });

    it('step 2: 1,500 small cells lose 1,102, and 400 lost implies at most 544', () => {
      const lostShare = 1 - keep(500, 4, 100);
      expect(lostShare).toBeCloseTo(0.734974, 6);
      expect(Math.round(1500 * lostShare)).toBe(1102);
      expect(Math.round(400 / lostShare)).toBe(544);
      // the page must not print the rounded 0.735 chain it originally used
      expect(mdx).not.toContain('(1 - 0.265)');
      expect(mdx).not.toContain('400/0.735 =');
      for (const v of ['0.734974', '1{,}102', '544']) expect(mdx, v).toContain(v);
    });

    it('step 3: the mitochondrial filter removes 745 cells', () => {
      expect(Math.round(9312 * 0.08)).toBe(745);
      expect(mdx).toContain('745');
    });
  });

  describe('figure 2 — a global mitochondrial cutoff, decoded the way the caption states', () => {
    const survive = (median: number) => normalCdf((0.1 - median) / 0.05);

    it('keeps 0.0%, 0.8%, 78.8% and 88.5% of the four types', () => {
      expect(pct1(survive(0.3))).toBe('0.0');
      expect(pct1(survive(0.22))).toBe('0.8');
      expect(pct1(survive(0.06))).toBe('78.8');
      expect(pct1(survive(0.04))).toBe('88.5');
      for (const l of ['0.0% kept', '0.8% kept', '78.8% kept', '88.5% kept',
                       '30% mito', '22% mito', '6% mito', '4% mito'])
        expect(mdx, `figure 2 label ${l}`).toContain(l);
    });

    it('the effect is monotone in the type median, which is the caption’s claim', () => {
      const medians = [0.04, 0.06, 0.22, 0.3];
      for (let i = 1; i < medians.length; i += 1)
        expect(survive(medians[i])).toBeLessThan(survive(medians[i - 1]));
    });
  });

  describe('exercises', () => {
    it('1 — moving 200 to 1,000 costs the small population 98.8% of what it had', () => {
      expect(pct1(keep(200, 4, 1250))).toBe('100.0');
      expect(pct1(keep(200, 4, 100))).toBe('85.7');
      expect(pct1(keep(1000, 4, 1250))).toBe('99.1');
      expect(pct1(keep(1000, 4, 100))).toBe('1.0');
      // the relative loss the solution quotes
      expect(pct1(1 - keep(1000, 4, 100) / keep(200, 4, 100))).toBe('98.8');
      for (const v of ['100.0%', '85.7%', '99.1%', '1.0%', '98.8%'])
        expect(mdx, v).toContain(v);
    });

    it('2 — a 6% overall loss implies the small cells are 8.1% of called barcodes', () => {
      const lostS = 1 - keep(500, 4, 100);
      const lostL = 1 - keep(500, 4, 1250);
      expect(lostL).toBeCloseTo(0.000776, 6);
      const f = (0.06 - lostL) / (lostS - lostL);
      expect(lostS - lostL).toBeCloseTo(0.734198, 6);
      expect(0.06 - lostL).toBeCloseTo(0.059224, 6);
      expect(f).toBeCloseTo(0.080665, 6);
      for (const v of ['0.000776', '0.734974', '0.734198f = 0.059224', '0.080665'])
        expect(mdx, v).toContain(v);
    });

    it('3 — a per-cluster rule retains 97.7% of every type by construction', () => {
      expect(normalCdf((0.1 - 0.3) / 0.05)).toBeCloseTo(3.1686e-5, 8);
      expect(pct2(normalCdf((0.1 - 0.3) / 0.05))).toBe('0.00');
      expect(pct1(normalCdf((0.1 - 0.04) / 0.05))).toBe('88.5');
      // two SD above each cluster's own mean
      expect(0.3 + 2 * 0.05).toBeCloseTo(0.4, 12);
      expect(0.04 + 2 * 0.05).toBeCloseTo(0.14, 12);
      expect(pct1(normalCdf(2))).toBe('97.7');
      for (const v of ['\\Phi(-4)', '0.0032\\%', '\\Phi(1.2)', '0.8849', '97.7%'])
        expect(mdx, v).toContain(v);
    });
  });
});


describe('sc-normalization — what a transform fixes and what it cannot', () => {
  const mdx = lesson('sc-normalization');
  const pct1 = (x: number) => (Math.round(x * 1e3) / 10).toFixed(1);
  const pct2 = (x: number) => (Math.round(x * 1e4) / 100).toFixed(2);

  describe('the log transform is biased low', () => {
    it('returns 71.25% of log1p(mean) at a mean of 0.1 and 99.89% at 100', () => {
      expect(transformMean('log1p', 0.1)).toBeCloseTo(0.067904, 6);
      expect(Math.log1p(0.1)).toBeCloseTo(0.095310, 6);
      expect(pct2(transformMean('log1p', 0.1) / Math.log1p(0.1))).toBe('71.25');
      expect(pct2(transformMean('log1p', 100) / Math.log1p(100))).toBe('99.89');
      for (const v of ['0.067904', '0.095310', '71.25%', '99.89%'])
        expect(mdx, v).toContain(v);
    });

    it('the bias is Jensen, so it holds at every mean', () => {
      for (const mu of [0.05, 0.1, 0.5, 1, 5, 50, 200])
        expect(transformMean('log1p', mu)).toBeLessThan(Math.log1p(mu));
      expect(mdx).toContain("Jensen's inequality");
    });
  });

  describe('figure 1 — the stabilisation claim, decoded as the caption states it', () => {
    it('log1p runs 0.5123 to 0.0997, a factor of 5.14, and is the least flat', () => {
      expect(transformSd('log1p', 2)).toBeCloseTo(0.5123, 4);
      expect(transformSd('log1p', 100)).toBeCloseTo(0.0997, 4);
      const sds = [0.1, 0.5, 1, 2, 5, 20, 100].map((mu) => transformSd('log1p', mu));
      expect(Math.max(...sds) / Math.min(...sds)).toBeCloseTo(5.14, 2);
      for (const v of ['0.5123', '0.0997', '5.14']) expect(mdx, v).toContain(v);
    });

    it('Pearson is flat at 1 and Anscombe reaches it above a mean of about five', () => {
      expect(transformSd('pearson', 0.1)).toBe(1);
      expect(transformSd('pearson', 100)).toBe(1);
      expect(transformSd('anscombe', 5)).toBeCloseTo(1.0011, 4);
      expect(transformSd('anscombe', 100)).toBeCloseTo(1.0, 5);
      for (const l of ['Pearson residual', 'Anscombe', 'log1p', 'sqrt',
                       'SD of the transformed count'])
        expect(mdx, `figure 1 label ${l}`).toContain(l);
    });
  });

  describe('worked example — a difference that is entirely depth', () => {
    const detect = (mu: number) => 1 - Math.exp(-mu);

    it('step 1: the same true level gives means of 0.1 and 1.0', () => {
      expect(2000 * 5e-5).toBeCloseTo(0.1, 12);
      expect(20000 * 5e-5).toBeCloseTo(1.0, 12);
      expect(mdx).toContain('2{,}000 \\times 5 \\times 10^{-5} = 0.1');
    });

    it('step 2: detected in 9.5% against 63.2%, a ratio of 6.64', () => {
      expect(detect(0.1)).toBeCloseTo(0.095163, 6);
      expect(detect(1.0)).toBeCloseTo(0.632121, 6);
      expect(pct1(detect(0.1))).toBe('9.5');
      expect(pct1(detect(1.0))).toBe('63.2');
      expect(detect(1.0) / detect(0.1)).toBeCloseTo(6.6425, 4);
      for (const v of ['0.095163', '0.632121', '9.5%', '63.2%', '6.64'])
        expect(mdx, v).toContain(v);
    });

    it('step 3: normalisation rescales but leaves the zero at zero', () => {
      expect((0 / 2000) * 1e4).toBe(0);
      expect((1 / 20000) * 1e4).toBeCloseTo(0.5, 12);
      expect(Math.log1p(0)).toBe(0);
      expect(Math.log1p(0.5)).toBeCloseTo(0.4055, 4);
      for (const v of ['0.4055', '0.0000']) expect(mdx, v).toContain(v);
    });
  });

  describe('figure 2 — detection against depth', () => {
    it('draws the two markers the caption quotes', () => {
      expect(pct1(1 - Math.exp(-2000 * 5e-5))).toBe('9.5');
      expect(pct1(1 - Math.exp(-20000 * 5e-5))).toBe('63.2');
      for (const l of ['9.5%', '63.2%', '5 in 100,000', '2 in 10,000', '1 in 1,000',
                       'Sequencing depth of the cell'])
        expect(mdx, `figure 2 label ${l}`).toContain(l);
    });
  });

  describe('exercises', () => {
    it('1 — at a mean of 1 the transform returns 82.72% of log 2', () => {
      expect(transformMean('log1p', 1)).toBeCloseTo(0.573403, 6);
      expect(Math.log(2)).toBeCloseTo(0.693147, 6);
      expect(transformMean('log1p', 1) / Math.log(2)).toBeCloseTo(0.8272, 4);
      for (const v of ['0.573403', '0.693147', '0.8272']) expect(mdx, v).toContain(v);
    });

    it('2 — log1p spreads 5.14x where Anscombe spreads 1.04x', () => {
      expect(transformSd('log1p', 2) / transformSd('log1p', 100)).toBeCloseTo(5.14, 2);
      expect(transformSd('anscombe', 2)).toBeCloseTo(0.9614, 4);
      expect(transformSd('anscombe', 100)).toBeCloseTo(1.0, 4);
      expect(transformSd('anscombe', 100) / transformSd('anscombe', 2)).toBeCloseTo(1.04, 2);
      for (const v of ['0.9614', '1.04']) expect(mdx, v).toContain(v);
    });

    it('3 — 18.1% against 86.5% detection from depth alone', () => {
      expect(1000 * 2e-4).toBeCloseTo(0.2, 12);
      expect(10000 * 2e-4).toBeCloseTo(2.0, 12);
      expect(1 - Math.exp(-0.2)).toBeCloseTo(0.181269, 6);
      expect(1 - Math.exp(-2.0)).toBeCloseTo(0.864665, 6);
      expect(pct1(1 - Math.exp(-0.2))).toBe('18.1');
      expect(pct1(1 - Math.exp(-2.0))).toBe('86.5');
      for (const v of ['0.181269', '0.864665', '18.1%', '86.5%'])
        expect(mdx, v).toContain(v);
    });
  });
});


describe('sc-feature-selection — every simple criterion ranks by expression', () => {
  const mdx = lesson('sc-feature-selection');
  const log1pVar = (mu: number) => transformSd('log1p', mu) ** 2;
  const fano = (mu: number, theta: number) => nbVariance(mu, theta) / mu;

  describe('worked example — ranking two genes that are the same gene', () => {
    it('step 1: raw variance is the mean, so gene B ranks 50x above gene A', () => {
      expect(100 / 2).toBe(50);
      expect(mdx).toContain('50.0');
      expect(mdx).toContain('\\sigma^2_A = 2');
    });

    it('step 2: log1p variance reverses it, ranking A 26.38x above B', () => {
      expect(log1pVar(2)).toBeCloseTo(0.262448, 6);
      expect(log1pVar(100)).toBeCloseTo(0.009950, 6);
      expect(log1pVar(100) / log1pVar(2)).toBeCloseTo(0.0379, 4);
      expect(log1pVar(2) / log1pVar(100)).toBeCloseTo(26.38, 2);
      for (const v of ['0.262448', '0.009950', '0.0379', '26.38']) expect(mdx, v).toContain(v);
    });

    it('step 3: Fano is exactly 1 for a Poisson, whatever the mean', () => {
      for (const mu of [0.1, 2, 100, 1000]) expect(mu / mu).toBe(1);
    });

    it('step 4: at a shared theta = 1 the Fano factors are 3.0 and 101.0', () => {
      expect(nbVariance(2, 1)).toBe(6);
      expect(nbVariance(100, 1)).toBe(10100);
      expect(fano(2, 1)).toBeCloseTo(3, 12);
      expect(fano(100, 1)).toBeCloseTo(101, 12);
      expect(fano(100, 1) / fano(2, 1)).toBeCloseTo(33.667, 3);
      for (const v of ['3.0', '101.0', '33.7']) expect(mdx, v).toContain(v);
    });

    it('step 5: (var - mean)/mean^2 is exactly 1/theta for both', () => {
      for (const mu of [2, 100]) {
        const v = nbVariance(mu, 1);
        expect((v - mu) / (mu * mu)).toBeCloseTo(1, 12);
      }
      // and it stays scale-free at other dispersions too
      for (const theta of [0.5, 2, 8])
        for (const mu of [0.5, 5, 500])
          expect((nbVariance(mu, theta) - mu) / (mu * mu)).toBeCloseTo(1 / theta, 10);
      expect(mdx).toContain('\\frac{6 - 2}{4} = 1');
    });
  });

  describe('figure 1 — the criteria plotted against a reference gene at mean 2', () => {
    it('draws 50x and 0.038x at a mean of 100, relative to that reference', () => {
      expect(100 / 2).toBe(50);
      expect((log1pVar(100) / log1pVar(2)).toFixed(3)).toBe('0.038');
      for (const l of ['50x', '0.038x', 'reference gene, mean 2', 'mean 100',
                       'raw variance', 'log1p variance', 'trend residual'])
        expect(mdx, `figure 1 label ${l}`).toContain(l);
    });

    it('the log1p curve really does peak near a mean of 1.72, as the caption says', () => {
      let best = 0;
      let arg = 0;
      for (let mu = 0.05; mu < 20; mu += 0.01) {
        const v = transformSd('log1p', mu);
        if (v > best) {
          best = v;
          arg = mu;
        }
      }
      expect(arg).toBeCloseTo(1.72, 2);
      expect(mdx).toContain('1.72');
    });
  });

  describe('exercises', () => {
    it('1 — Fano is flat on the null and separates 7.43x on the signal', () => {
      expect(fano(5, 2)).toBeCloseTo(3.5, 12);
      expect(fano(50, 2)).toBeCloseTo(26, 12);
      expect(fano(50, 2) / fano(5, 2)).toBeCloseTo(7.4286, 4);
      for (const v of ['3.5', '26.0', '7.43']) expect(mdx, v).toContain(v);
    });

    it('2 — Fano says 12.75x where the dispersion ratio is 1.67x', () => {
      expect(20 / 5).toBe(4);
      expect(2550 / 50).toBe(51);
      expect(51 / 4).toBe(12.75);
      expect((20 - 5) / 25).toBeCloseTo(0.6, 12);
      expect((2550 - 50) / 2500).toBeCloseTo(1, 12);
      expect(nbTheta(5, 20)).toBeCloseTo(1.6667, 4);
      expect(nbTheta(50, 2550)).toBeCloseTo(1, 12);
      expect(nbTheta(5, 20) / nbTheta(50, 2550)).toBeCloseTo(1.6667, 4);
      for (const v of ['4.0', '51.0', '12.75', '1.6667', '1.67']) expect(mdx, v).toContain(v);
    });

    it('3 — the rare-population argument is about total variance, not local', () => {
      // a gene differing between a 1% population and the rest contributes little
      // total variance: the mixture is 99% one component
      const mixVar = (p: number, d: number) => p * (1 - p) * d * d;
      expect(mixVar(0.01, 1)).toBeCloseTo(0.0099, 6);
      expect(mixVar(0.5, 1)).toBeCloseTo(0.25, 6);
      expect(mixVar(0.5, 1) / mixVar(0.01, 1)).toBeCloseTo(25.25, 2);
      expect(mdx).toContain('99% one component');
    });
  });
});


describe('sc-pca — the noise floor, and what a scree plot cannot say', () => {
  const mdx = lesson('sc-pca');
  const pct4 = (x: number) => (Math.round(x * 1e6) / 1e4).toFixed(4);

  /** The same deterministic generator the math test uses. */
  const normals = (n: number, p: number, seed: number) => {
    let state = seed >>> 0;
    const u = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const g = () => {
      const a = Math.max(u(), 1e-12);
      return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u());
    };
    return Array.from({ length: n }, () => Array.from({ length: p }, g));
  };


  describe('worked example — where the floor sits for a real dataset', () => {
    it('step 1: 5,000 cells and 2,000 genes give gamma = 0.4', () => {
      const e = marchenkoPasturEdge(5000, 2000);
      expect(e.gamma).toBeCloseTo(0.4, 12);
      expect(Math.sqrt(e.gamma)).toBeCloseTo(0.632456, 6);
      expect(mdx).toContain('0.632456');
    });

    it('step 2: the edges are 2.664911 and 0.135089', () => {
      const e = marchenkoPasturEdge(5000, 2000);
      expect(e.upper).toBeCloseTo(2.664911, 6);
      expect(e.lower).toBeCloseTo(0.135089, 6);
      for (const v of ['2.664911', '0.135089', '2.6649']) expect(mdx, v).toContain(v);
    });

    it('step 3: the edge is 0.1332% of total variance', () => {
      const e = marchenkoPasturEdge(5000, 2000);
      expect(pct4(e.upper / 2000)).toBe('0.1332');
      expect(mdx).toContain('0.1332\\%');
    });

    it('step 4: the floor moves 5.19x between 500 and 20,000 cells', () => {
      const small = marchenkoPasturEdge(500, 2000);
      const large = marchenkoPasturEdge(20000, 2000);
      expect(small.upper).toBeCloseTo(9, 12);
      expect(large.upper).toBeCloseTo(1.732456, 6);
      expect(pct4(small.upper / 2000)).toBe('0.4500');
      expect(pct4(large.upper / 2000)).toBe('0.0866');
      expect(small.upper / large.upper).toBeCloseTo(5.1949, 4);
      // the printed ratio is 5.19, not 5.20 -- 5.1949 rounds down
      expect((Math.round((small.upper / large.upper) * 100) / 100).toFixed(2)).toBe('5.19');
      expect(mdx).not.toContain('5.20');
      // the abstract once carried a coarser rounding of the same quantity
      expect(mdx).not.toMatch(/factor of 5\.2(?![\d])/);
      for (const v of ['9.0000', '1.7325', '0.450%', '0.0866%', '5.19'])
        expect(mdx, v).toContain(v);
    });
  });

  describe('figure 1 — the eigenvalues it draws are the ones the module produces', () => {
    it('pure noise peaks at 1.9272 against an edge of 1.9246', () => {
      const ev = symmetricEigenvalues(covarianceMatrix(normals(400, 60, 102)));
      const { upper } = marchenkoPasturEdge(400, 60);
      expect(upper).toBeCloseTo(1.924597, 6);
      expect(marchenkoPasturEdge(400, 60).lower).toBeCloseTo(0.375403, 6);
      expect(mdx).toContain('0.3754');
      expect(ev[0]).toBeCloseTo(1.9272, 4);
      expect(ev[0] / upper).toBeCloseTo(1.00134, 5);
      // and it carries 3.22% of the variance, which is the range people keep down to
      expect(((100 * ev[0]) / ev.reduce((a, b) => a + b, 0)).toFixed(2)).toBe('3.22');
      for (const v of ['1.9272', '1.9246', '1.92', '3.22%']) expect(mdx, v).toContain(v);
    });

    it('one planted structure gives 22.43, which is 11.7x the edge', () => {
      const X = normals(400, 60, 7);
      for (let i = 0; i < 400; i += 1) {
        const g = i < 200 ? 1 : -1;
        for (let j = 0; j < 15; j += 1) X[i][j] += g * 1.2;
      }
      const ev = symmetricEigenvalues(covarianceMatrix(X));
      const { upper } = marchenkoPasturEdge(400, 60);
      expect(ev[0]).toBeCloseTo(22.43, 2);
      expect((ev[0] / upper).toFixed(1)).toBe('11.7');
      expect(ev.slice(1).filter((e) => e > upper)).toHaveLength(0);
      for (const v of ['22.43', '11.7']) expect(mdx, v).toContain(v);
    });
  });

  describe('exercises', () => {
    it('1 — 1,000 cells and 3,000 genes give edges 7.464102 and 0.535898', () => {
      const e = marchenkoPasturEdge(1000, 3000);
      expect(e.gamma).toBe(3);
      expect(Math.sqrt(3)).toBeCloseTo(1.732051, 6);
      expect(e.upper).toBeCloseTo(7.464102, 6);
      expect(e.lower).toBeCloseTo(0.535898, 6);
      expect(pct4(e.upper / 3000)).toBe('0.2488');
      for (const v of ['1.732051', '7.464102', '0.535898', '0.2488\\%', '7.4641'])
        expect(mdx, v).toContain(v);
    });

    it('2 — their floor is 0.3331%, yours is 0.0792%, and gamma differs 37.5x', () => {
      const theirs = marchenkoPasturEdge(800, 2000);
      const mine = marchenkoPasturEdge(30000, 2000);
      expect(theirs.gamma).toBe(2.5);
      expect(Math.sqrt(2.5)).toBeCloseTo(1.581139, 6);
      expect(theirs.upper).toBeCloseTo(6.662278, 6);
      expect(pct4(theirs.upper / 2000)).toBe('0.3331');
      expect(Math.sqrt(mine.gamma)).toBeCloseTo(0.258199, 6);
      expect(mine.upper).toBeCloseTo(1.583064, 6);
      expect(pct4(mine.upper / 2000)).toBe('0.0792');
      expect(theirs.gamma / mine.gamma).toBeCloseTo(37.5, 10);
      // the page must not carry the mis-multiplied value it originally printed
      expect(mdx).not.toContain('1.583288');
      for (const v of ['1.581139', '6.662278', '0.3331%', '0.258199', '1.583064',
                       '0.0792%', '37.5']) expect(mdx, v).toContain(v);
    });

    it('3 — the overshoot band is why 1.03x the edge is not signal', () => {
      // the simulated overshoot is a tenth of a percent, well under 1.03
      const ev = symmetricEigenvalues(covarianceMatrix(normals(400, 60, 102)));
      const { upper } = marchenkoPasturEdge(400, 60);
      expect(ev[0] / upper).toBeLessThan(1.03);
      expect(mdx).toContain('1.03');
      expect(mdx).toContain('0.13%');
    });
  });
});


describe('sc-neighbor-graphs — what the graph is joining, and what breaks it', () => {
  const mdx = lesson('sc-neighbor-graphs');
  const pct1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);

  // The lesson's construction, stated exactly: 90 cells, three types of 30, separated by
  // three SDs in dimensions 0 and 1 and by nothing at all in any other.
  const CENTRES = [[3, 0], [-3, 0], [0, 3]];
  const SEEDS = [77, 178, 279, 380, 481, 582, 683, 784];
  const build = (d: number, seed: number) => {
    const M = seededNormals(90, d, seed);
    const labels: number[] = [];
    for (let i = 0; i < 90; i += 1) {
      const c = Math.floor(i / 30);
      labels.push(c);
      M[i][0] += CENTRES[c][0];
      if (d > 1) M[i][1] += CENTRES[c][1];
    }
    return { M, labels };
  };
  const purity = (d: number, k: number) => {
    let total = 0;
    for (const seed of SEEDS) {
      const { M, labels } = build(d, seed);
      total += neighborPurity(knnGraph(M, k), labels);
    }
    return (100 * total) / SEEDS.length;
  };
  const CHANCE = (100 * 29) / 89;
  const P2 = purity(2, 10);
  const P30 = purity(30, 10);
  const P2000 = purity(2000, 10);

  describe('the chance floor', () => {
    it('is 29/89 for three equal types among ninety cells', () => {
      expect(29 / 89).toBeCloseTo(0.325843, 6);
      expect(CHANCE).toBeCloseTo(32.5843, 4);
      for (const v of ['29}{89} = 0.325843', '32.58\\%']) expect(mdx, v).toContain(v);
    });

    it('moves with the number of types, as exercise 1 states', () => {
      expect((100 * 44) / 89).toBeCloseTo(49.4382, 4);
      expect((100 * 14) / 89).toBeCloseTo(15.7303, 4);
      expect((100 * 9) / 89).toBeCloseTo(10.1124, 4);
      for (const v of ['49.44\\%', '15.73\\%', '10.11\\%']) expect(mdx, v).toContain(v);
    });
  });

  describe('worked example — what reducing to thirty components buys', () => {
    it('step 2 and 3: purity falls 96.4% to 41.5% with the signal untouched', () => {
      expect(pct1(P2)).toBe('96.4');
      expect(pct1(P2000)).toBe('41.5');
      expect(P2).toBeGreaterThan(P2000);
      for (const v of ['96.4%', '41.5%']) expect(mdx, v).toContain(v);
    });

    it('step 3: that is 86.1% of the graph’s excess over chance', () => {
      const hi = P2 - CHANCE;
      const lo = P2000 - CHANCE;
      expect(hi).toBeCloseTo(63.82, 2);
      expect(lo).toBeCloseTo(8.89, 2);
      expect(1 - lo / hi).toBeCloseTo(0.861, 3);
      for (const v of ['63.82', '8.89', '86.1%']) expect(mdx, v).toContain(v);
    });

    it('step 4: thirty components recover 69.6% of what was destroyed', () => {
      expect(pct1(P30)).toBe('79.7');
      const mid = P30 - CHANCE;
      expect(mid).toBeCloseTo(47.12, 2);
      expect((mid - (P2000 - CHANCE)) / (P2 - CHANCE - (P2000 - CHANCE))).toBeCloseTo(0.696, 3);
      for (const v of ['79.7%', '47.12', '69.6%']) expect(mdx, v).toContain(v);
    });
  });

  describe('figure 1 — relative contrast', () => {
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const contrast = (d: number) =>
      mean(Array.from({ length: 20 }, (_, q) => {
        const M = seededNormals(1001, d, 4242 + q);
        return relativeContrast(M[0], M.slice(1));
      }));

    it('is 1.1417 at thirty dimensions and 0.0942 at two thousand', () => {
      expect(contrast(30)).toBeCloseTo(1.1417, 4);
      expect(contrast(2000)).toBeCloseTo(0.0942, 4);
      expect(contrast(30) / contrast(2000)).toBeCloseTo(12.12, 2);
      for (const v of ['1.14', '0.09', '9% further']) expect(mdx, v).toContain(v);
    });

    it('the caption’s d^(-1/2) claim holds where the caption says it does', () => {
      expect(contrast(500) / contrast(2000)).toBeCloseTo(2.12, 2);
      expect(Math.sqrt(2000 / 500)).toBeCloseTo(2.0, 10);
      // and the caption is explicit that it does NOT hold at thirty
      expect(contrast(30) / contrast(2000)).toBeGreaterThan(1.3 * Math.sqrt(2000 / 30));
      expect(mdx).toContain('2.12-fold against a predicted 2.00');
      expect(mdx).toContain('not yet that clean at thirty');
    });
  });

  describe('figure 2 — every value it draws', () => {
    it('draws the three readings and the chance line', () => {
      for (const l of ['chance, 32.6%', '2 dims', '30 dims', '2,000 dims',
                       '96.4%', '79.7%', '41.5%', 'Dimensions the graph is built in'])
        expect(mdx, `figure label ${l}`).toContain(l);
    });
  });

  describe('exercises', () => {
    it('1 — a graph at 41.5% holds about 13% of the available headroom', () => {
      expect(100 - CHANCE).toBeCloseTo(67.42, 2);
      expect(41.5 - CHANCE).toBeCloseTo(8.92, 2);
      expect((41.5 - CHANCE) / (100 - CHANCE)).toBeCloseTo(0.132, 3);
      for (const v of ['67.42', '8.92', '13%']) expect(mdx, v).toContain(v);
      // 55% purity really is worse than chance at two types, which is the point of (c)
      expect(55).toBeGreaterThan((100 * 44) / 89);
      expect(55 - (100 * 44) / 89).toBeLessThan(6);
    });

    it('2 — purity falls monotonically in k, by 20.3 points from k=3 to k=30', () => {
      const byK = [3, 5, 10, 20, 30].map((k) => purity(30, k));
      expect(byK.map(pct1)).toEqual(['85.9', '84.0', '79.7', '72.9', '65.6']);
      for (let i = 1; i < byK.length; i += 1) expect(byK[i]).toBeLessThan(byK[i - 1]);
      expect(byK[0] - byK[byK.length - 1]).toBeCloseTo(20.3, 1);
      for (const v of ['85.9%', '84.0%', '72.9%', '65.6%', '20.3']) expect(mdx, v).toContain(v);
      // k = 10 reaches 40% of the way through a 25-cell population
      expect(10 / 25).toBeCloseTo(0.4, 10);
    });

    it('3 — the full-gene graph holds 8.89 of 63.82 available points', () => {
      expect(P2000 - CHANCE).toBeCloseTo(8.89, 2);
      expect(P2 - CHANCE).toBeCloseTo(63.82, 2);
      expect(P30 - CHANCE).toBeCloseTo(47.12, 2);
      // line-wrapped in the source, so match across the break
      expect(mdx).toMatch(/1,998\s+uninformative dimensions/);
    });
  });
});


describe('sc-clustering — the best-scoring partition is the wrong one', () => {
  const mdx = lesson('sc-clustering');
  const K = 5;

  /** A ring of n complete K-cliques, consecutive cliques joined by one edge. */
  const ring = (n: number) => {
    const adjacency: number[][] = Array.from({ length: n * K }, () => []);
    const join = (a: number, b: number) => {
      adjacency[a].push(b);
      adjacency[b].push(a);
    };
    for (let c = 0; c < n; c += 1) {
      const base = c * K;
      for (let i = 0; i < K; i += 1)
        for (let j = i + 1; j < K; j += 1) join(base + i, base + j);
      join(base, ((c + 1) % n) * K);
    }
    return adjacency;
  };
  const grouped = (n: number, g: number) =>
    Array.from({ length: n * K }, (_, i) => Math.floor(Math.floor(i / K) / g));

  describe('worked example — a ring of forty complete five-node cliques', () => {
    const A = ring(40);

    it('step 1: the correct partition scores 389/440', () => {
      expect(graphModularity(A, grouped(40, 1))).toBeCloseTo(389 / 440, 12);
      expect(389 / 440).toBeCloseTo(0.884091, 6);
      // and the counts the derivation quotes
      expect(40 * (K * (K - 1)) / 2 + 40).toBe(440);
      for (const v of ['389}{440} = 0.884091', 'l_c = 10', 'd_c = 22'])
        expect(mdx, v).toContain(v);
    });

    it('step 2: fusing neighbouring cliques scores 199/220, which is higher', () => {
      expect(graphModularity(A, grouped(40, 2))).toBeCloseTo(199 / 220, 12);
      expect(199 / 220).toBeCloseTo(0.904545, 6);
      expect(graphModularity(A, grouped(40, 2))).toBeGreaterThan(graphModularity(A, grouped(40, 1)));
      for (const v of ['199}{220} = 0.904545', 'l_c = 21', 'd_c = 44'])
        expect(mdx, v).toContain(v);
    });

    it('step 3: the margin is exactly 9/440', () => {
      expect(graphModularity(A, grouped(40, 2)) - graphModularity(A, grouped(40, 1)))
        .toBeCloseTo(9 / 440, 12);
      expect(9 / 440).toBeCloseTo(0.020455, 6);
      expect(mdx).toContain('9/440 = 0.020455');
    });

    it('step 4: ARI against the truth is 0.604374', () => {
      expect(adjustedRandIndex(grouped(40, 1), grouped(40, 2))).toBeCloseTo(0.604374, 6);
      expect(mdx).toContain('0.604374');
    });

    it('step 5: the crossover is exactly 20/11', () => {
      const GS = 20 / 11;
      expect(GS).toBeCloseTo(1.818182, 6);
      // below it the merged partition wins; above it the truth does
      expect(graphModularity(A, grouped(40, 2), GS - 0.01))
        .toBeGreaterThan(graphModularity(A, grouped(40, 1), GS - 0.01));
      expect(graphModularity(A, grouped(40, 1), GS + 0.01))
        .toBeGreaterThan(graphModularity(A, grouped(40, 2), GS + 0.01));
      // and they tie there
      expect(graphModularity(A, grouped(40, 1), GS))
        .toBeCloseTo(graphModularity(A, grouped(40, 2), GS), 10);
      expect(mdx).toContain('20}{11} = 1.818182');
    });
  });

  describe('the closed form the lesson publishes', () => {
    it('Q(g) = 1 - 1/(11g) - gamma*g/40 reproduces the module exactly', () => {
      const A = ring(40);
      for (const g of [1, 2, 4, 5, 8, 10])
        for (const gamma of [0.4, 1, 1.8, 3])
          expect(graphModularity(A, grouped(40, g), gamma))
            .toBeCloseTo(1 - 1 / (11 * g) - (gamma * g) / 40, 12);
      expect(mdx).toContain('\\frac{1}{11g} - \\frac{\\gamma g}{40}');
    });

    it('the exact tie sits at n = 2l + 2, where sqrt(2m) = n', () => {
      // K5: l = 10, so the tie is at 22 rings
      const l = (K * (K - 1)) / 2;
      expect(l).toBe(10);
      const nTie = 2 * l + 2;
      expect(nTie).toBe(22);
      const tie = ring(nTie);
      expect(graphModularity(tie, grouped(nTie, 1)))
        .toBeCloseTo(graphModularity(tie, grouped(nTie, 2)), 12);
      // strictly wins two rings later, and not before
      const before = ring(20);
      expect(graphModularity(before, grouped(20, 1)))
        .toBeGreaterThan(graphModularity(before, grouped(20, 2)));
      const after = ring(24);
      expect(graphModularity(after, grouped(24, 2)))
        .toBeGreaterThan(graphModularity(after, grouped(24, 1)));
      // the sqrt(2m) = n relation at the tie
      const m = nTie * (l + 1);
      expect(m).toBe(242);
      expect(Math.sqrt(2 * m)).toBeCloseTo(nTie, 12);
      for (const v of ['n = 2l + 2', '\\sqrt{2m} = n']) expect(mdx, v).toContain(v);
    });
  });

  describe('figure 2 — the plateau, and its exact edges', () => {
    it('twenty communities wins across (5/11, 20/11), a four-fold range', () => {
      const A = ring(40);
      const argmax = (gamma: number) =>
        [1, 2, 4, 5, 8, 10, 20, 40]
          .map((g) => ({ g, q: graphModularity(A, grouped(40, g), gamma) }))
          .reduce((a, b) => (b.q > a.q ? b : a)).g;
      expect(5 / 11).toBeCloseTo(0.454545, 6);
      expect(20 / 11).toBeCloseTo(1.818182, 6);
      expect((20 / 11) / (5 / 11)).toBeCloseTo(4, 12);
      for (const gamma of [0.46, 0.8, 1.0, 1.2, 1.5, 1.8]) expect(argmax(gamma)).toBe(2);
      expect(argmax(0.44)).toBe(4);
      expect(argmax(1.9)).toBe(1);
      for (const l of ['20 communities, ARI 0.60', '40 communities, ARI 1.00',
                       '10 communities, ARI 0.33', 'the default', 'Communities returned'])
        expect(mdx, `figure 2 label ${l}`).toContain(l);
    });
  });

  describe('exercises', () => {
    it('1 — six-node cliques tie at 32 rings, ten-node at 92', () => {
      for (const [k, nTie] of [[4, 14], [5, 22], [6, 32], [10, 92]] as const) {
        const l = (k * (k - 1)) / 2;
        expect(2 * l + 2).toBe(nTie);
        expect(Math.sqrt(2 * nTie * (l + 1))).toBeCloseTo(nTie, 10);
      }
      expect((6 * 5) / 2).toBe(15);
      expect(32 * 16).toBe(512);
      expect(Math.sqrt(1024)).toBe(32);
      // the million-edge dataset the solution quotes
      expect(Math.sqrt(2 * 1e6)).toBeCloseTo(1414.2, 1);
      for (const v of ['n = 2l + 2 = 32', '512', '\\sqrt{1024} = 32', '1{,}414'])
        expect(mdx, v).toContain(v);
    });

    it('2 — all five swept resolutions lie inside the wrong plateau', () => {
      for (const gamma of [0.5, 0.8, 1.0, 1.2, 1.5]) {
        expect(gamma).toBeGreaterThan(5 / 11);
        expect(gamma).toBeLessThan(20 / 11);
      }
      expect(mdx).toContain('0.454545,\\ 1.818182');
    });

    it('3 — Leiden’s connectivity guarantee cannot help, because the merger is connected', () => {
      // two K5s joined by one edge is a connected subgraph, so nothing is violated
      const A = ring(40);
      const merged = grouped(40, 2);
      const community0 = [...Array(10).keys()].filter((i) => merged[i] === 0);
      expect(community0).toHaveLength(10);
      expect(graphModularity(A, merged)).toBeGreaterThan(graphModularity(A, grouped(40, 1)));
      expect(mdx).toContain('more likely than Louvain');
    });
  });
});


describe('sc-embeddings — what the faithfulness score cannot see', () => {
  const mdx = lesson('sc-embeddings');
  const HIGH = [[0], [0.1], [0.2], [10], [10.1], [10.2]];
  /** Between-cluster centroid gap over mean within-cluster spread — the thing readers judge. */
  const apparent = (P: number[][]) => {
    const centroid = (g: number[][]) => g.reduce((s, p) => s + p[0], 0) / g.length;
    const spread = (g: number[][]) => {
      const c = centroid(g);
      return g.reduce((s, p) => s + Math.abs(p[0] - c), 0) / g.length;
    };
    const A = P.slice(0, 3);
    const B = P.slice(3);
    return Math.abs(centroid(B) - centroid(A)) / ((spread(A) + spread(B)) / 2);
  };

  describe('worked example — four embeddings, one score', () => {
    it('step 1: the true separation is exactly 150', () => {
      expect((0.1 + 0 + 0.1) / 3).toBeCloseTo(0.066667, 6);
      expect(apparent(HIGH)).toBeCloseTo(150, 10);
      expect(trustworthiness(HIGH, HIGH, 2)).toBeCloseTo(1, 12);
      for (const v of ['0.066667', '{0.066667} = 150']) expect(mdx, v).toContain(v);
    });

    it('step 2: stretching fifty-fold gives 7,500 at a perfect score', () => {
      const P = [[0], [0.1], [0.2], [500], [500.1], [500.2]];
      expect(apparent(P)).toBeCloseTo(7500, 6);
      expect(trustworthiness(HIGH, P, 2)).toBe(1);
      expect(mdx).toContain('7,500');
    });

    it('step 3: crushing tenfold gives 15, also at a perfect score', () => {
      const P = [[0], [0.1], [0.2], [1], [1.1], [1.2]];
      expect(apparent(P)).toBeCloseTo(15, 10);
      expect(trustworthiness(HIGH, P, 2)).toBe(1);
    });

    it('step 4: the span across three perfect scores is exactly 500-fold', () => {
      expect(7500 / 15).toBe(500);
      for (const v of ['500}{15}', '500-fold', 'five-hundred-fold'])
        expect(mdx, v).toContain(v);
    });

    it('step 5: only a fifty-fold crush moves it, and only to 0.933333', () => {
      const P = [[0], [0.1], [0.2], [0.2001], [0.3001], [0.4001]];
      expect(trustworthiness(HIGH, P, 2)).toBeCloseTo(0.933333, 6);
      expect(apparent(P)).toBeCloseTo(3.0015, 4);
      expect(mdx).toContain('0.933333');
    });
  });

  describe('the metric is sharp about what it does measure', () => {
    it('one point moved between clusters drops it to 0.466667', () => {
      const swapped = [[0], [0.1], [10.05], [10], [10.1], [0.2]];
      expect(trustworthiness(HIGH, swapped, 2)).toBeCloseTo(0.466667, 6);
      expect(mdx).toContain('0.466667');
    });

    it('stretching is invisible at any factor whatsoever, as exercise 2 claims', () => {
      for (const gap of [50, 500, 5000, 1e6]) {
        const P = [[0], [0.1], [0.2], [gap], [gap + 0.1], [gap + 0.2]];
        expect(trustworthiness(HIGH, P, 2)).toBe(1);
      }
    });

    it('crushing becomes visible only once the gap reaches the within-cluster spread', () => {
      // the largest distance inside a triplet is 0.2, so intrusion starts around there
      expect(trustworthiness(HIGH, [[0], [0.1], [0.2], [0.5], [0.6], [0.7]], 2)).toBe(1);
      expect(trustworthiness(HIGH, [[0], [0.1], [0.2], [0.2001], [0.3001], [0.4001]], 2))
        .toBeLessThan(1);
      expect(10 / 50).toBeCloseTo(0.2, 12);
      expect(mdx).toContain('roughly 0.2');
    });
  });

  describe('figure 1 — every value it draws', () => {
    it('draws the four rows with their scores and apparent separations', () => {
      for (const l of ['true structure', 'gap stretched 50x', 'gap crushed 10x',
                       'gap crushed 50x', 'trustworthiness 1.000000',
                       'trustworthiness 0.933333', 'trustworthiness = 1.000000 throughout'])
        expect(mdx, `figure label ${l}`).toContain(l);
    });
  });

  describe('exercises', () => {
    it('1 — a high trustworthiness cannot support a distance claim', () => {
      // the lesson's own embeddings are the counterexample: perfect score, 500-fold span
      const stretched = [[0], [0.1], [0.2], [500], [500.1], [500.2]];
      const crushed = [[0], [0.1], [0.2], [1], [1.1], [1.2]];
      expect(trustworthiness(HIGH, stretched, 2)).toBe(trustworthiness(HIGH, crushed, 2));
      expect(apparent(stretched) / apparent(crushed)).toBeCloseTo(500, 6);
      expect(mdx).toContain('0.98');
    });

    it('3 — the invariance is to any monotone map of the distances', () => {
      // squaring every coordinate gap preserves order and so preserves the score
      const monotone = HIGH.map(([x]) => [x ** 2]);
      expect(trustworthiness(HIGH, monotone, 2)).toBe(1);
      expect(mdx).toContain('monotone transformation');
    });
  });
});


describe('sc-annotation — the ceiling on what a marker can do', () => {
  const mdx = lesson('sc-annotation');
  const PHI = 0.6;
  const ALPHA = 0.05;
  const DEPTH = 8000;

  describe('worked example — albumin against the soup', () => {
    it('step 1: 392.0 counts in a hepatocyte against 12.0 in a Kupffer cell', () => {
      const s = soupShare([{ share: PHI, geneShare: 0.05 }]);
      expect(s).toBeCloseTo(0.03, 12);
      expect(expectedMarkerCounts(DEPTH, ALPHA, 0.05, s)).toBeCloseTo(392, 10);
      expect(ambientExpectedCounts(DEPTH, ALPHA, s)).toBeCloseTo(12, 10);
      for (const v of ['392.0', '12.0', '0.60 \\times 0.05 = 0.03'])
        expect(mdx, v).toContain(v);
    });

    it('step 2: the contrast is 32.666667, and is 5.029747 in log2', () => {
      const s = soupShare([{ share: PHI, geneShare: 0.05 }]);
      const r = expectedMarkerCounts(DEPTH, ALPHA, 0.05, s) / ambientExpectedCounts(DEPTH, ALPHA, s);
      expect(r).toBeCloseTo(32.666667, 6);
      expect(markerContrastCeiling(ALPHA, PHI)).toBeCloseTo(32.666667, 6);
      expect(Math.log2(r)).toBeCloseTo(5.029747, 6);
      for (const v of ['32.666667', '5.029747']) expect(mdx, v).toContain(v);
    });

    it('step 3: three markers a hundred-fold apart give the identical contrast', () => {
      const rows: number[] = [];
      for (const x of [0.05, 0.005, 0.0005]) {
        const s = soupShare([{ share: PHI, geneShare: x }]);
        rows.push(expectedMarkerCounts(DEPTH, ALPHA, x, s) / ambientExpectedCounts(DEPTH, ALPHA, s));
      }
      for (const r of rows) expect(r).toBeCloseTo(rows[0], 12);
      for (const r of rows) expect(r).toBeCloseTo(32.666667, 6);
      // and the counts the lesson quotes for each
      const counts = [0.05, 0.005, 0.0005].map((x) => {
        const s = soupShare([{ share: PHI, geneShare: x }]);
        return [expectedMarkerCounts(DEPTH, ALPHA, x, s), ambientExpectedCounts(DEPTH, ALPHA, s)];
      });
      expect(counts[1][0]).toBeCloseTo(39.2, 9);
      expect(counts[1][1]).toBeCloseTo(1.2, 9);
      expect(counts[2][0]).toBeCloseTo(3.92, 9);
      expect(counts[2][1]).toBeCloseTo(0.12, 9);
      for (const v of ['39.2', '1.2', '3.92', '0.12']) expect(mdx, v).toContain(v);
    });

    it('step 4: evidence balances at 108.996353 counts, 9.083029x ambient', () => {
      const R = markerContrastCeiling(ALPHA, PHI);
      expect(R - 1).toBeCloseTo(31.666667, 6);
      expect(Math.log(R)).toBeCloseTo(3.486355, 6);
      expect(mdx).toContain('31.666667');
      expect(markerEvidenceBreakEven(12, R)).toBeCloseTo(108.996353, 6);
      expect(markerEvidenceMultiple(R)).toBeCloseTo(9.083029, 6);
      for (const v of ['3.486355', '108.996353', '9.083029']) expect(mdx, v).toContain(v);
    });

    it('step 5: 99.999386% of Kupffer cells are positive at 8,000 UMIs, 52.76% at 500', () => {
      const s = soupShare([{ share: PHI, geneShare: 0.05 }]);
      expect(1 - Math.exp(-ambientExpectedCounts(8000, ALPHA, s))).toBeCloseTo(0.99999386, 8);
      expect(ambientExpectedCounts(500, ALPHA, s)).toBeCloseTo(0.75, 12);
      expect(100 * (1 - Math.exp(-0.75))).toBeCloseTo(52.7633, 4);
      for (const v of ['0.99999386', '52.76%', '0.75']) expect(mdx, v).toContain(v);
    });
  });

  describe('figures — every value drawn', () => {
    it('figure 1 draws the four ceilings on the 60% curve', () => {
      expect(markerContrastCeiling(0.01, 0.6)).toBeCloseTo(166, 10);
      expect(markerContrastCeiling(0.1, 0.6)).toBeCloseTo(16, 10);
      expect(markerContrastCeiling(0.2, 0.6)).toBeCloseTo(7.666667, 6);
      expect(markerContrastCeiling(0.01, 0.6) / markerContrastCeiling(0.2, 0.6))
        .toBeCloseTo(21.6522, 4);
      for (const l of ['1% ambient', '5% ambient', '10% ambient', '20% ambient',
                       '166', '32.67', '7.67', 'of the soup'])
        expect(mdx, `figure 1 label ${l}`).toContain(l);
      expect(mdx).toContain('21.65');
    });

    it('figure 2 draws three equal connectors, which is the caption’s encoding rule', () => {
      // the caption says connector length is the log contrast: decode it the same way
      const logs = [0.05, 0.005, 0.0005].map((x) => {
        const s = soupShare([{ share: PHI, geneShare: x }]);
        return Math.log10(expectedMarkerCounts(DEPTH, ALPHA, x, s))
          - Math.log10(ambientExpectedCounts(DEPTH, ALPHA, s));
      });
      for (const v of logs) expect(v).toBeCloseTo(logs[0], 12);
      for (const l of ['32.67x', 'filled = hepatocyte, open = Kupffer cell'])
        expect(mdx, `figure 2 label ${l}`).toContain(l);
    });
  });

  describe('exercises', () => {
    it('1 — a six-fold stronger marker gives the identical contrast', () => {
      const contrasts = [0.05, 0.3].map((x) => {
        const s = soupShare([{ share: PHI, geneShare: x }]);
        return markerContrast(ALPHA, markerEnrichment(x, s));
      });
      expect(contrasts[0]).toBeCloseTo(contrasts[1], 12);
      expect(contrasts[0]).toBeCloseTo(32.666667, 6);
      expect(1 / PHI).toBeCloseTo(1.6667, 4);
      expect(mdx).toContain('1.6667');
      expect(mdx).toMatch(/166\s+instead of 32\.67/);
    });

    it('2 — depth changes detection completely and the contrast not at all', () => {
      const s = soupShare([{ share: PHI, geneShare: 0.05 }]);
      const detect = (n: number) => 1 - Math.exp(-ambientExpectedCounts(n, ALPHA, s));
      expect(100 * detect(500)).toBeCloseTo(52.7633, 4);
      expect(100 * detect(8000)).toBeCloseTo(99.999386, 6);
      // the contrast is identical in both runs
      const at500 = expectedMarkerCounts(500, ALPHA, 0.05, s) / ambientExpectedCounts(500, ALPHA, s);
      const at8000 = expectedMarkerCounts(8000, ALPHA, 0.05, s) / ambientExpectedCounts(8000, ALPHA, s);
      expect(at500).toBeCloseTo(at8000, 12);
      expect(at500).toBeCloseTo(32.666667, 6);
      expect(32.666667 * 12).toBeCloseTo(392, 3);
      expect(mdx).toContain('99.999386%');
    });

    it('3 — a 1%-abundant type has 58.19x more headroom', () => {
      expect(markerContrastCeiling(ALPHA, 0.01)).toBeCloseTo(1901, 10);
      expect(markerContrastCeiling(ALPHA, 0.01) / markerContrastCeiling(ALPHA, PHI))
        .toBeCloseTo(58.19, 2);
      expect(mdx).toContain('1901');
      expect(mdx).toMatch(/58\.19 times less\s+headroom/);
    });
  });
});


describe('sc-differential-expression — the test that gets worse with more data', () => {
  const mdx = lesson('sc-differential-expression');
  const RHO = 0.05;
  const Z = 1.959963984540054;

  describe('worked example — what the two analyses charge', () => {
    it('step 1: four donors of 200 cells give a design effect of 10.95', () => {
      expect(designEffect(200, RHO)).toBeCloseTo(10.95, 10);
      expect(1 + 199 * RHO).toBeCloseTo(10.95, 10);
      expect(mdx).toContain('(200 - 1)(0.05) = 10.95');
    });

    it('step 2: the standard error is 3.309078x too small and the FPR is 55.4%', () => {
      expect(Math.sqrt(designEffect(200, RHO))).toBeCloseTo(3.309078, 6);
      expect(100 * (Math.sqrt(designEffect(200, RHO)) - 1)).toBeCloseTo(230.9, 1);
      expect(clusteredFalsePositiveRate(200, RHO)).toBeCloseTo(0.5537, 4);
      // 0.55365 sits on a two-decimal rounding boundary, so the page must not print 55.37%
      expect(mdx).not.toContain('55.37');
      for (const v of ['3.309078', '230.9%', '0.5537', '55.4%'])
        expect(mdx, v).toContain(v);
    });

    it('step 3: six degrees of freedom instead of 1,598 widen the interval 24.84%', () => {
      expect(2 * 4 * 200 - 2).toBe(1598);
      expect(2 * 4 - 2).toBe(6);
      expect(studentTQuantile(0.975, 6)).toBeCloseTo(2.446912, 6);
      expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 6);
      expect(studentTQuantile(0.975, 6) / normalQuantile(0.975) - 1).toBeCloseTo(0.2484, 4);
      for (const v of ['1{,}598', '2.446912', '1.959964', '24.84%'])
        expect(mdx, v).toContain(v);
    });
  });

  describe('the simulation behind figure 1', () => {
    const N = 4;
    const SB = Math.sqrt(RHO);
    const SW = Math.sqrt(1 - RHO);

    /** One null dataset: no group differs, only donors carry a shared offset. */
    const trial = (m: number, seed: number) => {
      const g = seededNormals(1, 2 * N * (m + 1), seed)[0];
      let k = 0;
      const half = N * m;
      let s0 = 0;
      let s1 = 0;
      let ss0 = 0;
      let ss1 = 0;
      const donors: number[][] = [[], []];
      for (let grp = 0; grp < 2; grp += 1)
        for (let d = 0; d < N; d += 1) {
          const effect = SB * g[k];
          k += 1;
          let sum = 0;
          for (let cell = 0; cell < m; cell += 1) {
            const v = effect + SW * g[k];
            k += 1;
            sum += v;
            if (grp) {
              s1 += v;
              ss1 += v * v;
            } else {
              s0 += v;
              ss0 += v * v;
            }
          }
          donors[grp].push(sum / m);
        }
      const m0 = s0 / half;
      const m1 = s1 / half;
      const pooled = (ss0 - half * m0 * m0 + (ss1 - half * m1 * m1)) / (2 * half - 2);
      return {
        perCell: (m0 - m1) / Math.sqrt(pooled * (2 / half)),
        pseudobulk: twoSampleT(donors[0], donors[1]),
        cellDiff: m0 - m1,
        donorDiff:
          donors[0].reduce((a, b) => a + b, 0) / N - donors[1].reduce((a, b) => a + b, 0) / N,
      };
    };

    it('the pseudobulk point estimate is the per-cell one, to machine precision', () => {
      let worst = 0;
      for (let s = 0; s < 60; s += 1) {
        const t = trial(120, 4000 + s * 11);
        worst = Math.max(worst, Math.abs(t.cellDiff - t.donorDiff));
      }
      expect(worst).toBeLessThan(1e-14);
      expect(mdx).toContain('9.4 \\times 10^{-16}');
    });

    it('reproduces the rejection rates the caption reports', () => {
      const tCrit = studentTQuantile(0.975, 2 * N - 2);
      const run = (m: number) => {
        let a = 0;
        let b = 0;
        for (let s = 0; s < 1000; s += 1) {
          const t = trial(m, 90000 + s * 17 + m * 3);
          if (Math.abs(t.perCell) > Z) a += 1;
          if (Math.abs(t.pseudobulk) > tCrit) b += 1;
        }
        return { perCell: (100 * a) / 1000, pseudobulk: (100 * b) / 1000 };
      };
      const at50 = run(50);
      const at200 = run(200);
      expect(at50.perCell).toBeCloseTo(29.5, 5);
      expect(at200.perCell).toBeCloseTo(56.6, 5);
      // and the theory the caption compares them against
      expect(100 * clusteredFalsePositiveRate(50, RHO)).toBeCloseTo(29.1, 1);
      expect(100 * clusteredFalsePositiveRate(200, RHO)).toBeCloseTo(55.4, 1);
      // pseudobulk stays near nominal at both
      expect(at50.pseudobulk).toBeLessThan(9);
      expect(at200.pseudobulk).toBeLessThan(9);
      for (const v of ['29.5%', '56.6%', '4.75%', '2.8 points']) expect(mdx, v).toContain(v);
    }, 40000);

    it('agrees with the hub rather than contradicting it', () => {
      // the hub publishes 29.1 / 70.0 / 90.2 at 50 / 500 / 5,000 cells
      expect((Math.round(clusteredFalsePositiveRate(50, RHO) * 1e3) / 10).toFixed(1)).toBe('29.1');
      expect((Math.round(clusteredFalsePositiveRate(500, RHO) * 1e3) / 10).toFixed(1)).toBe('70.0');
      expect((Math.round(clusteredFalsePositiveRate(5000, RHO) * 1e3) / 10).toFixed(1)).toBe('90.2');
      expect(lesson('single-cell')).toContain('29.1% at 50 cells per sample, 70.0% at 500, and 90.2% at 5,000');
    });
  });

  describe('exercises', () => {
    it('1 — same cells, two designs, 9.22x the evidence', () => {
      expect(designEffect(2000, RHO)).toBeCloseTo(100.95, 10);
      expect(designEffect(200, RHO)).toBeCloseTo(10.95, 10);
      expect(clusteredFalsePositiveRate(2000, RHO)).toBeCloseTo(0.8453, 4);
      expect(100 * clusteredFalsePositiveRate(2000, RHO)).toBeCloseTo(84.5, 1);
      expect(mdx).toContain('0.8453');
      expect(effectiveIndependentCells(2, 2000, RHO)).toBeCloseTo(39.62, 2);
      expect(effectiveIndependentCells(20, 200, RHO)).toBeCloseTo(365.30, 2);
      expect(effectiveIndependentCells(20, 200, RHO) / effectiveIndependentCells(2, 2000, RHO))
        .toBeCloseTo(9.22, 2);
      // the units error the page originally carried
      expect(mdx).not.toContain('79.25');
      for (const v of ['100.95', '84.5%', '39.62', '365.30', '9.22'])
        expect(mdx, v).toContain(v);
    });

    it('2 — three patients of 1,500 cells reject 82.2% of nulls', () => {
      expect(designEffect(1500, RHO)).toBeCloseTo(75.95, 10);
      expect(mdx).toContain('4,200'); // the scenario's reported gene count
      expect(Math.sqrt(75.95)).toBeCloseTo(8.715, 3);
      expect(clusteredFalsePositiveRate(1500, RHO)).toBeCloseTo(0.8221, 4);
      expect(mdx).not.toContain('82.3%');
      expect(mdx).not.toContain('0.8222');
      for (const v of ['75.95', '8.715', '0.8221', '82.2%']) expect(mdx, v).toContain(v);
    });

    it('3 — donors buy 53.6 times what cells buy, at the same budget', () => {
      const now = effectiveIndependentCells(4, 500, RHO);
      const donors = effectiveIndependentCells(8, 500, RHO);
      const cells = effectiveIndependentCells(4, 1000, RHO);
      expect(now).toBeCloseTo(77.07, 2);
      expect(donors).toBeCloseTo(154.14, 2);
      expect(cells).toBeCloseTo(78.51, 2);
      expect(donors - now).toBeCloseTo(77.07, 2);
      expect(cells - now).toBeCloseTo(1.44, 2);
      expect((donors - now) / (cells - now)).toBeCloseTo(53.6, 1);
      expect(4 / RHO).toBe(80);
      expect((100 * now) / 80).toBeCloseTo(96.3, 1);
      expect(mdx).not.toContain('53.5');
      for (const v of ['77.07', '154.14', '78.51', '1.44', '53.6'])
        expect(mdx, v).toContain(v);
      expect(mdx).toMatch(/96\.3%\s+of it/);
    });
  });
});


describe('sc-composition — closure, and the five declines that did not happen', () => {
  const mdx = lesson('sc-composition');
  const ABUND_A = [40, 20, 10, 8, 20, 2];
  const ABUND_B = [20, 10, 5, 4, 10, 1];
  const BEFORE = closeComposition(ABUND_A);

  describe('worked example — doubling monocytes at a 20% share', () => {
    it('the baseline composition is the one the figures draw', () => {
      expect(BEFORE).toEqual([0.4, 0.2, 0.1, 0.08, 0.2, 0.02]);
      expect(BEFORE.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
      for (const v of ['40%', '20%', '10%', '8%', '2%']) expect(mdx, v).toContain(v);
    });

    it('step 1: the closure factor is 1.2', () => {
      const { closureFactor } = closureUpdate(BEFORE, 1, 2);
      expect(closureFactor).toBeCloseTo(1.2, 12);
      expect(mdx).toContain('(2 - 1)(0.20) = 1.2');
    });

    it('step 2: all five untouched populations fall by exactly the same amount', () => {
      const { proportions } = closureUpdate(BEFORE, 1, 2);
      const lfc = apparentLogFoldChanges(BEFORE, proportions);
      const others = lfc.filter((_, i) => i !== 1);
      for (const v of others) expect(v).toBeCloseTo(-0.263034, 6);
      // identical, not merely similar — that is the claim
      expect(new Set(others.map((v) => v.toFixed(12))).size).toBe(1);
      expect(Math.log2(1 / 1.2)).toBeCloseTo(-0.263034, 6);
      expect(1 / 1.2).toBeCloseTo(0.8333, 4);
      for (const v of ['16.67%', '-0.263034']) expect(mdx, v).toContain(v);
    });

    it('step 3 and 4: monocytes rise 0.736966 and the difference is exactly 1', () => {
      const { proportions } = closureUpdate(BEFORE, 1, 2);
      const lfc = apparentLogFoldChanges(BEFORE, proportions);
      expect(proportions[1]).toBeCloseTo(0.333333, 6);
      expect(lfc[1]).toBeCloseTo(0.736966, 6);
      expect(lfc[1] - lfc[0]).toBeCloseTo(1, 12);
      // and it recovers log2 c for any c, which is the identifiability claim
      for (const c of [0.25, 0.5, 3, 10]) {
        const q = closureUpdate(BEFORE, 1, c).proportions;
        const d = apparentLogFoldChanges(BEFORE, q);
        expect(d[1] - d[0]).toBeCloseTo(Math.log2(c), 12);
      }
      for (const v of ['0.333333', '0.736966', '1.000000']) expect(mdx, v).toContain(v);
    });
  });

  describe('figure 2 — the exact ambiguity', () => {
    it('halving every abundance closes to the identical proportions', () => {
      const halved = closeComposition(ABUND_B);
      BEFORE.forEach((p, i) => expect(halved[i]).toBeCloseTo(p, 15));
      expect(ABUND_A.map((x) => x / 2)).toEqual(ABUND_B);
      for (const l of ['T cells', 'Monocytes', 'Dendritic',
                       'filled = experiment A, faint = experiment B'])
        expect(mdx, `figure 2 label ${l}`).toContain(l);
    });
  });

  describe('the centred log-ratio', () => {
    it('shifts by the closed form and the shifts sum to zero', () => {
      const shift = clrShiftUnderSingleChange(6, 2);
      expect(shift.changed).toBeCloseTo(0.833333, 6);
      expect(shift.others).toBeCloseTo(-0.166667, 6);
      expect(shift.changed + 5 * shift.others).toBeCloseTo(0, 12);
      // and the closed form matches the numerical CLR of the actual vectors
      const after = closureUpdate(BEFORE, 1, 2).proportions;
      const numeric = centeredLogRatio(after).map((x, i) => x - centeredLogRatio(BEFORE)[i]);
      expect(numeric[1]).toBeCloseTo(shift.changed, 10);
      for (const i of [0, 2, 3, 4, 5]) expect(numeric[i]).toBeCloseTo(shift.others, 10);
      // smaller than the raw shift, but not zero — the lesson's point
      expect(Math.abs(shift.others)).toBeLessThan(Math.abs(-0.263034));
      expect(shift.others).not.toBe(0);
      for (const v of ['0.833333', '-0.166667']) expect(mdx, v).toContain(v);
    });
  });

  describe('closure correlation and the bridge to lesson 12', () => {
    it('two parts are negatively correlated before any biology acts', () => {
      expect(compositionCorrelation(0.2, 0.4)).toBeCloseTo(-0.408248, 6);
      expect(compositionCorrelation(0.2, 0.4)).toBeLessThan(0);
      expect(mdx).toContain('-0.408248');
      // 1/1.2 = 83.33% of the former share, and the monocyte rise of 0.74 in exercise 1
      expect((100 / 1.2).toFixed(2)).toBe('83.33');
      expect(mdx).toContain('83.33');
      expect(Math.log2(2 / 1.2)).toBeCloseTo(0.736966, 6);
      expect(mdx).toContain('+0.74');
    });

    it('a Dirichlet-multinomial reproduces lesson 12’s design effect exactly', () => {
      expect(dirichletMultinomialIcc(19)).toBeCloseTo(0.05, 12);
      expect(designEffect(500, dirichletMultinomialIcc(19))).toBeCloseTo(25.95, 10);
      // the same 25.95 lesson 9's exercises and lesson 12 both use
      expect(designEffect(500, 0.05)).toBeCloseTo(25.95, 10);
      for (const v of ['19', '25.95']) expect(mdx, v).toContain(v);
    });
  });

  describe('exercises', () => {
    it('1 — the reported numbers invert to a 20% baseline and a true doubling', () => {
      expect(2 ** 0.263).toBeCloseTo(1.19997, 5);
      expect(2 ** 1.0).toBe(2);
      expect((1.2 - 1) / (2 - 1)).toBeCloseTo(0.2, 12);
      expect(mdx).toContain('1.19997');
    });

    it('2 — the artefact scales with the moving population’s share', () => {
      const rows = [0.02, 0.2, 0.5].map((pk) => {
        const D = 1 + (2 - 1) * pk;
        return { D, lfc: Math.log2(1 / D) };
      });
      expect(rows[0].D).toBeCloseTo(1.02, 12);
      expect(rows[1].D).toBeCloseTo(1.2, 12);
      expect(rows[2].D).toBeCloseTo(1.5, 12);
      expect(rows[0].lfc).toBeCloseTo(-0.028569, 6);
      expect(rows[1].lfc).toBeCloseTo(-0.263034, 6);
      expect(rows[2].lfc).toBeCloseTo(-0.584963, 6);
      for (const v of ['1.02', '1.50', '-0.028569', '-0.584963'])
        expect(mdx, v).toContain(v);
    });

    it('3 — no zero-sum transform can leave five parts fixed', () => {
      for (const K of [3, 6, 20]) {
        const shift = clrShiftUnderSingleChange(K, 2);
        expect(shift.changed + (K - 1) * shift.others).toBeCloseTo(0, 12);
        expect(shift.others).toBeLessThan(0);
      }
      expect(centeredLogRatio(BEFORE).reduce((s, x) => s + x, 0)).toBeCloseTo(0, 12);
      expect(mdx).toMatch(/sums to zero\s+by construction/);
    });
  });
});


describe('sc-batch-integration — what confounding costs, twice over', () => {
  const mdx = lesson('sc-batch-integration');

  describe('worked example — an 80/20 design', () => {
    it('step 1: the correlation is the composition difference', () => {
      expect(Math.abs(batchTypeCorrelation(0.8, 0.2))).toBeCloseTo(0.6, 12);
      expect(Math.abs(0.8 - 0.2)).toBeCloseTo(0.6, 12);
      expect(mdx).toContain('|0.8 - 0.2| = 0.6');
    });

    it('step 2: centring leaves 64% of the difference', () => {
      expect(centeringAttenuation(0.6)).toBeCloseTo(0.64, 12);
      expect(1 - 0.36).toBeCloseTo(0.64, 12);
      for (const v of ['1 - 0.36 = 0.64', '64%']) expect(mdx, v).toContain(v);
    });

    it('step 3: regression instead inflates variance 1.5625-fold', () => {
      expect(varianceInflationFactor(0.6)).toBeCloseTo(1.5625, 10);
      expect(1 / 0.64).toBeCloseTo(1.5625, 10);
      expect(mdx).toContain('1.5625');
    });

    it('step 4: the two are exact reciprocals', () => {
      expect(0.64 * 1.5625).toBeCloseTo(1, 12);
      for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.98])
        expect(centeringAttenuation(r) * varianceInflationFactor(r)).toBeCloseTo(1, 12);
      expect(mdx).toContain('0.64 \\times 1.5625 = 1');
    });

    it('step 5: splitting samples across batches sets r to zero', () => {
      expect(batchTypeCorrelation(0.5, 0.5)).toBeCloseTo(0, 12);
      expect(centeringAttenuation(batchTypeCorrelation(0.5, 0.5))).toBe(1);
    });
  });

  describe('figure 1 — every value in its table', () => {
    it('draws the five compositions with their kept fraction and variance multiplier', () => {
      const rows: [number, string, string][] = [
        [0.0, '100%', '1.00'], [0.6, '64%', '1.56'], [0.8, '36%', '2.78'],
        [0.9, '19%', '5.26'], [0.98, '4%', '25.25'],
      ];
      for (const [r, kept, vif] of rows) {
        expect(`${Math.round(100 * centeringAttenuation(r))}%`).toBe(kept);
        expect(varianceInflationFactor(r).toFixed(2)).toBe(vif);
      }
      for (const l of ['50 / 50', '80 / 20', '90 / 10', '95 / 5', '99 / 1',
                       '100%', '64%', '36%', '19%', '4%', '25.25'])
        expect(mdx, `figure label ${l}`).toContain(l);
    });

    it('the caption decodes the curve the way the figure draws it', () => {
      expect(centeringAttenuation(0.98)).toBeCloseTo(0.0396, 12);
      expect(varianceInflationFactor(0.98)).toBeCloseTo(25.2525, 4);
      expect(mdx).toContain('3.96%');
      expect(mdx).toContain('25.25');
    });
  });

  describe('perfect confounding', () => {
    it('leaves nothing and costs infinity, which is one statement', () => {
      expect(Math.abs(batchTypeCorrelation(1, 0))).toBeCloseTo(1, 12);
      expect(centeringAttenuation(batchTypeCorrelation(1, 0))).toBe(0);
      expect(varianceInflationFactor(batchTypeCorrelation(1, 0))).toBe(Number.POSITIVE_INFINITY);
      expect(mdx).toContain('no method separates them');
    });
  });

  describe('exercises', () => {
    it('1 — a 70/30 split keeps 84% and inflates variance 1.1905-fold', () => {
      expect(Math.abs(batchTypeCorrelation(0.7, 0.3))).toBeCloseTo(0.4, 12);
      expect(centeringAttenuation(0.4)).toBeCloseTo(0.84, 12);
      expect(varianceInflationFactor(0.4)).toBeCloseTo(1.1905, 4);
      expect(0.84 * 1.1905).toBeCloseTo(1, 3);
      for (const v of ['1 - 0.16 = 0.84', '84%', '1.1905']) expect(mdx, v).toContain(v);
    });

    it('2 — the two designs are all-or-nothing', () => {
      expect(Math.abs(batchTypeCorrelation(1, 0))).toBeCloseTo(1, 12);
      expect(centeringAttenuation(batchTypeCorrelation(1, 0))).toBe(0);
      expect(batchTypeCorrelation(0.5, 0.5)).toBeCloseTo(0, 12);
      expect(centeringAttenuation(0)).toBe(1);
      expect(mdx).toContain('100%');
    });

    it('3 — a 95/5 imbalance leaves 19% and widens intervals 2.294-fold', () => {
      expect(centeringAttenuation(0.9)).toBeCloseTo(0.19, 12);
      expect(varianceInflationFactor(0.9)).toBeCloseTo(5.2632, 4);
      expect(1 / 0.19).toBeCloseTo(5.26, 2);
      expect(Math.sqrt(varianceInflationFactor(0.9))).toBeCloseTo(2.294, 3);
      for (const v of ['19%', '5.2632', '5.26', '2.294']) expect(mdx, v).toContain(v);
    });
  });
});


describe('sc-trajectories — the axis is arc length, the cells are the clock', () => {
  const mdx = lesson('sc-trajectories');
  const SEGMENTS = [
    { length: 0.3, speed: 1.0 },
    { length: 0.2, speed: 0.1 },
    { length: 0.5, speed: 1.0 },
  ];
  const pct2 = (x: number) => (Math.round(x * 1e4) / 100).toFixed(2);

  describe('worked example — reading the durations off the cell counts', () => {
    it('step 1: the axis reports 30 / 20 / 50', () => {
      expect(pseudotimeShares(SEGMENTS)).toEqual([0.3, 0.2, 0.5]);
      expect(mdx).toContain('**30%, 20%, 50%**');
    });

    it('step 2: the times are 0.3, 2.0 and 0.5 hours, totalling 2.8', () => {
      const times = SEGMENTS.map((s) => s.length / s.speed);
      expect(times).toEqual([0.3, 2, 0.5]);
      expect(times.reduce((a, b) => a + b, 0)).toBeCloseTo(2.8, 12);
      const shares = traversalTimeShares(SEGMENTS);
      expect(shares[0]).toBeCloseTo(3 / 28, 12);
      expect(shares[1]).toBeCloseTo(5 / 7, 12);
      expect(shares[2]).toBeCloseTo(5 / 28, 12);
      expect(pct2(shares[0])).toBe('10.71');
      expect(pct2(shares[1])).toBe('71.43');
      expect(pct2(shares[2])).toBe('17.86');
      for (const v of ['{3}{28} = 10.71\\%', '{5}{7} = 71.43\\%', '{5}{28} = 17.86\\%'])
        expect(mdx, v).toContain(v);
    });

    it('step 3: the cell shares are those same numbers, identically', () => {
      const time = traversalTimeShares(SEGMENTS);
      steadyStateCellShares(SEGMENTS).forEach((c, i) => expect(c).toBe(time[i]));
      expect(mdx).toContain('10.71%, 71.43%, 17.86%');
    });

    it('step 4: the axis understates the bottleneck 3.57-fold and overstates the opening 2.8', () => {
      const axis = pseudotimeShares(SEGMENTS);
      const time = traversalTimeShares(SEGMENTS);
      expect(time[1] / axis[1]).toBeCloseTo(3.5714, 4);
      expect(axis[0] / time[0]).toBeCloseTo(2.8, 10);
      // the same discrepancy stated the other way round, as the lesson does
      expect(time[0] / axis[0]).toBeCloseTo(0.357, 3);
      expect(mdx).toContain('0.357');
      // and the ordering of stage durations is inverted, not merely mis-scaled
      expect(axis[0]).toBeGreaterThan(axis[1]);
      expect(time[0]).toBeLessThan(time[1]);
      expect(time[1] / time[0]).toBeCloseTo(6.6667, 4);
      for (const v of ['3.57-fold', '2.8-fold', 'nearly seven times shorter'])
        expect(mdx, v).toContain(v);
    });
  });

  describe('figure 1 — both rulers', () => {
    it('draws the arc-length shares and the duration shares', () => {
      for (const l of ['30%', '20%', '50%', '10.7%', '71.4%', '17.9%',
                       'pseudotime axis', 'real elapsed time', '= share of cells'])
        expect(mdx, `figure label ${l}`).toContain(l);
    });
  });

  describe('the ordering is all that is identified', () => {
    it('any strictly increasing map leaves the ordering alone', () => {
      const pt = [0.1, 0.3, 0.5, 0.7, 0.9];
      for (const f of [(x: number) => x * x, (x: number) => Math.log(x),
                       (x: number) => Math.exp(3 * x), (x: number) => 5 * x + 2])
        expect(sameOrdering(pt, pt.map(f))).toBe(true);
      expect(sameOrdering(pt, pt.map((x) => (x - 0.5) ** 2))).toBe(false);
      expect(mdx).toContain('strictly increasing');
    });
  });

  describe('exercises', () => {
    it('1 — a four-fold slower half holds four times the cells', () => {
      const halves = [{ length: 0.5, speed: 1 }, { length: 0.5, speed: 0.25 }];
      expect(pseudotimeShares(halves)).toEqual([0.5, 0.5]);
      const shares = traversalTimeShares(halves);
      expect(shares[0]).toBeCloseTo(0.2, 12);
      expect(shares[1]).toBeCloseTo(0.8, 12);
      expect(4000 * shares[0]).toBeCloseTo(800, 9);
      expect(4000 * shares[1]).toBeCloseTo(3200, 9);
      expect(shares[1] / shares[0]).toBeCloseTo(4, 12);
      for (const v of ['800', '3,200', '**20%**', '**80%**']) expect(mdx, v).toContain(v);
    });

    it('2 — counts of 1,200/400/2,000/400 invert to durations and speeds', () => {
      const counts = [1200, 400, 2000, 400];
      const total = counts.reduce((a, b) => a + b, 0);
      expect(total).toBe(4000);
      const durations = counts.map((c) => c / total);
      expect(durations).toEqual([0.3, 0.1, 0.5, 0.1]);
      // equal arc lengths, so speed is inversely proportional to duration
      const speeds = durations.map((d) => 1 / d);
      const normalised = speeds.map((v) => v / Math.max(...speeds));
      expect(normalised[0]).toBeCloseTo(1 / 3, 12);
      expect(normalised[1]).toBeCloseTo(1, 12);
      expect(normalised[2]).toBeCloseTo(0.2, 12);
      // the lesson quotes them relative to the slowest instead
      expect(speeds[1] / speeds[0]).toBeCloseTo(3, 12);
      expect(speeds[1] / speeds[2]).toBeCloseTo(5, 12);
      for (const v of ['30%, 10%, 50%, 10%', '1 : 3 : 0.6 : 3']) expect(mdx, v).toContain(v);
      // the third stretch is the longest, not the briefest
      expect(Math.max(...durations)).toBe(durations[2]);
    });

    it('3 — the steady-state assumption is what the argument rests on', () => {
      expect(mdx).toContain('steady state');
      expect(mdx).toContain('synchronised');
      // a pulse means lambda = 0 afterwards, so the flux relation has nothing to balance
      expect(mdx).toContain('\\lambda = 0');
    });
  });
});


describe('sc-rna-velocity — the arrow is one ratio against one fitted number', () => {
  const mdx = lesson('sc-rna-velocity');

  describe('the sign reduces to a ratio comparison', () => {
    it('v > 0 exactly when u/s exceeds gamma, at any scale of the counts', () => {
      for (const scale of [0.1, 1, 50]) {
        expect(spliceVelocity(10 * scale, 4 * scale, 2)).toBeGreaterThan(0);
        expect(spliceVelocity(10 * scale, 6 * scale, 2)).toBeLessThan(0);
      }
      expect(spliceVelocity(4, 2, 2)).toBe(0);
      expect(mdx).toContain('v = u - \\gamma s');
    });
  });

  describe('worked example — what a two-fold error does', () => {
    it('step 2: the band is 1.386294 standard deviations wide and holds 41.72%', () => {
      expect(Math.log(2)).toBeCloseTo(0.693147, 6);
      expect(Math.log(2) / 0.5).toBeCloseTo(1.386294, 6);
      expect(normalCdf(1.386294)).toBeCloseTo(0.917171, 6);
      expect(velocityDirectionFlipped(0.5, 2)).toBeCloseTo(0.417171, 5);
      expect((100 * velocityDirectionFlipped(0.5, 2)).toFixed(2)).toBe('41.72');
      for (const v of ['0.693147', '1.386294', '0.917171', '0.417171', '41.72%'])
        expect(mdx, v).toContain(v);
    });

    it('step 3: all the reversed cells move the same way', () => {
      // the band is one-sided: everything between gamma and k*gamma was above and is now below
      expect(velocityDirectionFlipped(0.5, 2)).toBeLessThanOrEqual(0.5);
      expect(mdx).toContain('coherently wrong');
    });

    it('step 4: tighter genes lose more, which is the counterintuitive part', () => {
      expect((100 * velocityDirectionFlipped(0.25, 2)).toFixed(2)).toBe('49.72');
      expect((100 * velocityDirectionFlipped(1.0, 2)).toFixed(2)).toBe('25.59');
      expect(velocityDirectionFlipped(0.25, 2)).toBeGreaterThan(velocityDirectionFlipped(1.0, 2));
      // monotone in the spread, at a fixed error
      let previous = 1;
      for (const sd of [0.25, 0.5, 0.75, 1.0]) {
        const f = velocityDirectionFlipped(sd, 2);
        expect(f).toBeLessThan(previous);
        previous = f;
      }
      for (const v of ['49.72%', '25.59%']) expect(mdx, v).toContain(v);
    });
  });

  describe('figure 1 — every value it draws', () => {
    it('the four spreads and the marked reading', () => {
      expect(velocityDirectionFlipped(0.25, 3)).toBeGreaterThan(0.4999);
      for (const l of ['log sd 0.25', 'log sd 0.50', 'log sd 0.75', 'log sd 1.00',
                       '41.7% of arrows reverse', 'half the cells'])
        expect(mdx, `figure label ${l}`).toContain(l);
    });

    it('the 50% ceiling in the caption is real', () => {
      for (const k of [4, 100, 1e9]) expect(velocityDirectionFlipped(0.5, k)).toBeLessThanOrEqual(0.5);
      expect(mdx).toContain('maximum possible');
    });
  });

  describe('exercises', () => {
    it('1 — 17.23% at a 25% error and 29.13% at 50%', () => {
      expect(Math.log(1.25)).toBeCloseTo(0.223144, 6);
      expect(Math.log(1.25) / 0.5).toBeCloseTo(0.446287, 6);
      expect(velocityDirectionFlipped(0.5, 1.25)).toBeCloseTo(0.1723, 4);
      expect((100 * velocityDirectionFlipped(0.5, 1.25)).toFixed(2)).toBe('17.23');
      expect(mdx).toContain('0.1723');
      expect(Math.log(1.5) / 0.5).toBeCloseTo(0.810930, 6);
      expect(velocityDirectionFlipped(0.5, 1.5)).toBeCloseTo(0.2913, 4);
      expect((100 * velocityDirectionFlipped(0.5, 1.5)).toFixed(2)).toBe('29.13');
      expect(mdx).toContain('0.2913');
      // saturating: doubling the error from 1.5x to 3x adds less than the first 1.5x
      const a = velocityDirectionFlipped(0.5, 1.5);
      const b = velocityDirectionFlipped(0.5, 3);
      expect(b - a).toBeLessThan(a);
      for (const v of ['0.223144', '0.446287', '17.23%', '0.810930', '29.13%'])
        expect(mdx, v).toContain(v);
    });

    it('2 — the tight gene looks better and loses nearly twice as many arrows', () => {
      const tight = velocityDirectionFlipped(0.25, 2);
      const loose = velocityDirectionFlipped(1.0, 2);
      expect(tight / loose).toBeCloseTo(1.943, 3);
      expect(mdx).toContain('least trustworthy');
    });

    it('3 — agreement across methods does not address a shared assumption', () => {
      expect(mdx).toContain('shared modelling assumption');
      expect(mdx).toContain('Metabolic labelling');
    });
  });
});


describe('sc-multiomic-spatial — the design effect, reached a third way', () => {
  const mdx = lesson('sc-multiomic-spatial');

  describe('worked example — what a spatial field is worth', () => {
    it('step 1: 2,000 spots at rho = 0.5 give a design effect of 2.998', () => {
      expect(spatialDesignEffect(2000, 0.5)).toBeCloseTo(2.998, 3);
      expect(spatialDesignEffectLimit(0.5)).toBe(3);
      for (const v of ['2.998', '(1+0.5)/(1-0.5) = 3']) expect(mdx, v).toContain(v);
    });

    it('step 2: the field is worth 667 independent spots', () => {
      expect(2000 / spatialDesignEffect(2000, 0.5)).toBeCloseTo(667.1, 1);
      expect(Math.sqrt(3)).toBeCloseTo(1.732, 3);
      for (const v of ['667.1', '667', '1.732']) expect(mdx, v).toContain(v);
    });

    it('step 3: enlarging the field helps proportionally', () => {
      expect(spatialDesignEffect(20000, 0.5)).toBeCloseTo(2.9998, 4);
      expect(20000 / spatialDesignEffect(20000, 0.5)).toBeCloseTo(6667, 0);
      for (const v of ['2.9998', '6,667']) expect(mdx, v).toContain(v);
    });

    it('step 4: raising the correlation does not', () => {
      expect(spatialDesignEffect(20000, 0.9)).toBeCloseTo(18.99, 2);
      expect(20000 / spatialDesignEffect(20000, 0.9)).toBeCloseTo(1053.13, 2);
      // ten times the data, a sixth of the effective size at rho = 0.5
      expect((20000 / spatialDesignEffect(20000, 0.9)) / (2000 / spatialDesignEffect(2000, 0.5)))
        .toBeCloseTo(1.579, 3);
      for (const v of ['18.99', '1,053']) expect(mdx, v).toContain(v);
    });

    it("step 5: Moran's I has a negative null, and the two extremes are +1 and -1", () => {
      const n = 50;
      const gradient = Array.from({ length: n }, (_, i) => i);
      const checker = Array.from({ length: n }, (_, i) => (-1) ** i);
      expect(moransI(gradient)).toBeCloseTo(0.9592, 4);
      expect(moransI(checker)).toBeCloseTo(-1, 10);
      expect(-1 / (n - 1)).toBeCloseTo(-0.0204, 4);
      for (const v of ['0.9592', '-0.0204']) expect(mdx, v).toContain(v);
    });
  });

  describe('figure 1 — the four marked limits', () => {
    it('draws 1.50, 3.00, 9.00 and 19.00', () => {
      expect(spatialDesignEffectLimit(0.2)).toBeCloseTo(1.5, 12);
      expect(spatialDesignEffectLimit(0.8)).toBeCloseTo(9, 12);
      expect(spatialDesignEffectLimit(0.9)).toBeCloseTo(19, 12);
      for (const l of ['1.50', '3.00', '9.00', '19.00', 'very large', '200 spots',
                       '50 spots', '10 spots', 'limit = (1+r)/(1-r)'])
        expect(mdx, `figure label ${l}`).toContain(l);
    });

    it('the caption’s claim that small fields fall below the limit is true', () => {
      for (const rho of [0.5, 0.8, 0.9])
        for (const n of [10, 50, 200])
          expect(spatialDesignEffect(n, rho)).toBeLessThan(spatialDesignEffectLimit(rho));
      expect(mdx).toContain('fall below it');
    });
  });

  describe('the closing symmetry', () => {
    it('all three routes reach the same quantity', () => {
      // donors, lesson 12
      expect(designEffect(500, 0.05)).toBeCloseTo(25.95, 10);
      // composition, lesson 13 — a Dirichlet-multinomial with alpha0 = 19
      expect(designEffect(500, dirichletMultinomialIcc(19))).toBeCloseTo(25.95, 10);
      // space, this lesson
      expect(spatialDesignEffectLimit(0.5)).toBe(3);
      expect(mdx).toContain('Three unrelated routes');
      // and the hub still says what this lesson says it says
      expect(lesson('single-cell')).toContain('1 + (m - 1)\\rho');
    });
  });

  describe('exercises', () => {
    it('1 — 200 spots at rho 0.8 are worth about 23', () => {
      expect(spatialDesignEffect(200, 0.8)).toBeCloseTo(8.8, 4);
      expect(200 / 8.8).toBeCloseTo(22.7, 1);
      expect(Math.sqrt(8.8)).toBeCloseTo(2.966, 3);
      for (const v of ['8.80', '22.7', '2.966']) expect(mdx, v).toContain(v);
    });

    it('2 — a small negative I is the null, not anti-correlation', () => {
      expect(-1 / 49).toBeCloseTo(-0.0204, 4);
      expect(Math.abs(-0.02 - -1 / 49)).toBeLessThan(0.001);
      // negative autocorrelation deflates rather than inflates
      expect(spatialDesignEffect(200, -0.5)).toBeLessThan(1);
      expect(mdx).toContain('conservative rather than anti-conservative');
    });

    it('3 — the two assays that remove a limitation rather than adding one', () => {
      expect(mdx).toContain('Lineage barcoding');
      expect(mdx).toContain('Metabolic labelling');
      // the velocity figure it refers back to
      expect((100 * velocityDirectionFlipped(0.5, 2)).toFixed(2)).toBe('41.72');
      expect(mdx).toContain('41.72%');
    });
  });
});

describe('statgen-population-structure-fst', () => {
  const mdx = lesson('statgen-population-structure-fst');

  describe('worked example — two variants, two answers, one of them wrong', () => {
    const A: FstSite = { p1: 0.6, p2: 0.3, n1: 200, n2: 200 };
    const B: FstSite = { p1: 0.05, p2: 0.1, n1: 200, n2: 200 };

    it('has the per-variant numerators, denominators and ratios the lesson prints', () => {
      const a = fstHudsonParts(A);
      const b = fstHudsonParts(B);
      expect(a.numerator.toFixed(6)).toBe('0.087739');
      expect(a.denominator.toFixed(2)).toBe('0.54');
      expect((a.numerator / a.denominator).toFixed(6)).toBe('0.162479');
      expect(b.numerator.toFixed(6)).toBe('0.001809');
      expect(b.denominator.toFixed(3)).toBe('0.140');
      expect((b.numerator / b.denominator).toFixed(6)).toBe('0.012922');
      expect(mdx).toContain('= 0.087739$');
      expect(mdx).toContain('= 0.54$');
      expect(mdx).toContain('= 0.162479$');
      expect(mdx).toContain('= 0.001809$');
      expect(mdx).toContain('= 0.140$');
      expect(mdx).toContain('= 0.012922$');
    });

    it('shows the sampling correction moving the answer off the naive ratio', () => {
      expect((0.09 / 0.54).toFixed(6)).toBe('0.166667');
      expect((0.6 * 0.4 / 199 + 0.3 * 0.7 / 199).toFixed(6)).toBe('0.002261');
      expect((0.05 * 0.95 / 199 + 0.1 * 0.9 / 199).toFixed(6)).toBe('0.000691');
      expect(mdx).toContain('0.166667');
      expect(mdx).toContain('0.002261');
      expect(mdx).toContain('0.000691');
    });

    it('separates the ratio of averages from the average of ratios', () => {
      expect(fstRatioOfAverages([A, B]).toFixed(6)).toBe('0.131688');
      expect(fstAverageOfRatios([A, B]).toFixed(6)).toBe('0.087700');
      const gap = (fstRatioOfAverages([A, B]) - fstAverageOfRatios([A, B])) / fstRatioOfAverages([A, B]);
      expect((100 * gap).toFixed(1)).toBe('33.4');
      expect(mdx).toContain('= 0.131688$');
      expect(mdx).toContain('= 0.087700$');
      expect(mdx).toContain('low by 33.4%');
    });

    it('reproduces the six-variant set exactly, which replaced an unreproducible claim', () => {
      const six: FstSite[] = ([[0.6, 0.3], [0.5, 0.46], [0.2, 0.35], [0.05, 0.1], [0.8, 0.78], [0.12, 0.3]] as const)
        .map(([p1, p2]) => ({ p1, p2, n1: 1000, n2: 1000 }));
      expect(fstRatioOfAverages(six).toFixed(6)).toBe('0.064880');
      expect(fstAverageOfRatios(six).toFixed(6)).toBe('0.055207');
      const gap = (fstRatioOfAverages(six) - fstAverageOfRatios(six)) / fstRatioOfAverages(six);
      expect((100 * gap).toFixed(1)).toBe('14.9');
      expect(mdx).toContain('0.064880');
      expect(mdx).toContain('0.055207');
      expect(mdx).toContain('low by 14.9%');
      // the sentence this replaced claimed a 20,000,000-variant simulation that was
      // actually run on 200,000, and that no test could reproduce
      expect(mdx).not.toContain('twenty million');
      expect(mdx).not.toContain('17.8');
    });
  });

  it('states the heterozygosity ratio exactly rather than glossing it', () => {
    // F_ST = (H_T - H_S)/H_T  =>  H_T/H_S = 1/(1 - F_ST)
    expect((1 / (1 - 0.11)).toFixed(6)).toBe('1.123596');
    expect((100 * (1 / (1 - 0.11) - 1)).toFixed(1)).toBe('12.4');
    expect(mdx).toContain('1.123596');
    expect(mdx).toContain('12.4% more often');
    expect(mdx).not.toContain('about a ninth');
  });

  describe('worked example — 5,000 people at 500,000 markers', () => {
    const N = 5000;
    const M = 500_000;
    const t = bbpThreshold(N, M);

    it('has the aspect ratio, bulk edge and threshold the lesson prints', () => {
      expect(t.gamma).toBeCloseTo(0.01, 12);
      expect(t.sqrtGamma).toBeCloseTo(0.1, 12);
      expect(t.bulkEdge.toFixed(2)).toBe('1.21');
      expect(t.criticalFst).toBeCloseTo(2e-5, 15);
      expect(mdx).toContain('= 1.21$');
      expect(mdx).toContain('2\\times10^{-5}');
      expect(mdx).toContain('2.5\\times10^{9}');
    });

    it('makes the two statements of the threshold the same statement', () => {
      expect(structureSpike(N, t.criticalFst)).toBeCloseTo(0.1, 12);
      expect(structureSpike(N, t.criticalFst)).toBeCloseTo(t.sqrtGamma, 12);
    });

    it('finds nothing below the threshold and almost everything at 0.001', () => {
      expect(structureSpike(N, 1e-5)).toBeCloseTo(0.05, 12);
      expect(spikedEigenvalue(structureSpike(N, 1e-5), t.gamma).toFixed(2)).toBe('1.21');
      expect(spikedEigenvectorOverlap(structureSpike(N, 1e-5), t.gamma)).toBe(0);

      expect(structureSpike(N, 0.001)).toBeCloseTo(5, 12);
      expect(spikedEigenvalue(5, t.gamma).toFixed(3)).toBe('6.012');
      expect(spikedEigenvectorOverlap(5, t.gamma).toFixed(6)).toBe('0.997605');
      expect(mdx).toContain('= 6.012$');
      expect(mdx).toContain('0.997605');
    });

    it('needs 2,000,000 markers to reach a threshold of 1e-5 at the same N', () => {
      expect(1 / (N * 1e-5 ** 2)).toBeCloseTo(2_000_000, 6);
      expect(bbpThreshold(N, 2_000_000).criticalFst).toBeCloseTo(1e-5, 15);
      expect(mdx).toContain('2{,}000{,}000');
    });
  });

  describe('the figures', () => {
    it('draws the overlap value the transition callout quotes', () => {
      const g = 0.1;
      expect(spikedEigenvectorOverlap(Math.sqrt(g) * 1.2, g).toFixed(4)).toBe('0.2418');
      expect(mdx).toContain('0.2418');
    });

    it('rings the closed form at exactly one half', () => {
      expect(spikedEigenvectorOverlap(0.5, 0.1)).toBeCloseTo(0.5, 12);
      // 0.5 / sqrt(0.1) = 1.5811..., which the caption rounds to 1.58
      expect((0.5 / Math.sqrt(0.1)).toFixed(2)).toBe('1.58');
      expect(mdx).toContain('1.58 times the threshold');
      expect(mdx).toContain('exactly 0.50');
    });

    it('draws the three stratification points figure 2 marks', () => {
      expect(structureChiSquare(10_000, 0.001, 0.2).toFixed(2)).toBe('1.10');
      expect(structureChiSquare(100_000, 0.001, 0.2).toFixed(2)).toBe('2.00');
      expect(structureChiSquare(1_000_000, 0.001, 0.2).toFixed(2)).toBe('11.00');
      expect(mdx).toContain('100,000 reaches 2.00');
      expect(mdx).toContain('1,000,000 reaches 11.00');
      // the abstract leads with "eleven-fold"; it must be grounded in the prose, not only
      // inside the figure SVG, which every prose-scanning check strips before reading
      expect(mdx).toContain('an eleven-fold inflation');
      expect(mdx).toContain('The same populations at 100,000 give 2.00');
    });
  });

  describe('exercises', () => {
    it('exercise 1 — a single variant carries almost no information', () => {
      const big = fstHudsonParts({ p1: 0.4, p2: 0.44, n1: 500, n2: 500 });
      expect((big.numerator / big.denominator).toFixed(6)).toBe('0.001281');
      const small = fstHudsonParts({ p1: 0.4, p2: 0.44, n1: 50, n2: 50 });
      expect((small.numerator / small.denominator).toFixed(6)).toBe('-0.017063');
      expect(big.denominator.toFixed(3)).toBe('0.488');
      expect(mdx).toContain('0.001281');
      expect(mdx).toContain('-0.017063');
      expect(mdx).toContain('= 0.488$');
    });

    it('exercise 2 — the overlap is not a function of the ratio alone', () => {
      const t = bbpThreshold(800, 45_000);
      expect(t.criticalFst.toFixed(6)).toBe('0.000167');
      expect((1 / Math.sqrt(800 * 45_000)).toFixed(4)).toBe('0.0002');
      expect(t.sqrtGamma.toFixed(5)).toBe('0.13333');
      const spike = structureSpike(800, 0.0002);
      expect(spike).toBeCloseTo(0.16, 12);
      expect((spike / t.sqrtGamma).toFixed(2)).toBe('1.20');
      // the answer, which is NOT the 0.2418 that figure 1 shows at the same ratio
      expect(spikedEigenvectorOverlap(spike, t.gamma).toFixed(3)).toBe('0.275');
      expect((1 - t.gamma / spike ** 2).toFixed(6)).toBe('0.305556');
      expect((1 + t.gamma / spike).toFixed(6)).toBe('1.111111');
      expect(mdx).toContain('0.13333');
      expect(mdx).toContain('= 0.275$');
      expect(mdx).toContain('0.305556/1.111111');
      // the first draft read this off figure 1 and got the wrong aspect ratio's answer
      expect(mdx).not.toContain('an overlap around 0.24');

      // and the two routes to a comfortable threshold
      expect(4e8 / 800).toBeCloseTo(500_000, 6);
      expect(Math.round(4e8 / 45_000)).toBe(8889);
      expect(mdx).toContain('8{,}889');
    });

    it('exercise 3 — inflation, and the mean it is not', () => {
      expect(structureChiSquare(250_000, 0.0008, 0.15)).toBeCloseTo(2.125, 12);
      expect(mdx).toContain('= 2.125$');
      // the lesson must keep saying this is the mean, not lambda_GC
      expect(mdx).toContain('median');
    });

    it('exercise 5 — the gap as a fraction of the pooled value', () => {
      expect((100 * (0.0421 - 0.0361) / 0.0421).toFixed(1)).toBe('14.3');
      expect(mdx).toContain('14.3%');
    });
  });

  it('states the linear-in-N result the association lesson defers to', () => {
    const excess = (n: number) => structureChiSquare(n, 0.001, 0.2) - 1;
    expect(excess(200_000) / excess(100_000)).toBeCloseTo(2, 12);
    expect(mdx).toContain('linear in $N$');
  });
});

describe('statgen-detecting-selection', () => {
  const mdx = lesson('statgen-detecting-selection');
  const N = 10_000;
  const KB = 1e5; // 1 cM/Mb

  describe('worked example — how old is a variant at half frequency', () => {
    it('gives 4N ln 2 exactly, and the years the lesson quotes', () => {
      expect(neutralAlleleAge(N, 0.5)).toBeCloseTo(4 * N * Math.LN2, 9);
      expect(neutralAlleleAge(N, 0.5).toFixed(2)).toBe('27725.89');
      expect(Math.round((neutralAlleleAge(N, 0.5) * 25) / 1000) * 1000).toBe(693_000);
      expect(mdx).toContain('27{,}725.89');
      expect(mdx).toContain('693,000 years');
    });

    it('gives the other two frequencies the lesson tabulates', () => {
      expect(neutralAlleleAge(N, 0.1).toFixed(2)).toBe('10233.71');
      expect(neutralAlleleAge(N, 0.9).toFixed(2)).toBe('37929.79');
      expect(mdx).toContain('10,233.71');
      expect(mdx).toContain('37,929.79');
    });

    it('puts the sweep anomaly at 55.45', () => {
      expect(sweepAgeAnomaly(N, 0.5, 500).toFixed(2)).toBe('55.45');
      expect(mdx).toContain('55.45');
    });
  });

  describe('worked example — the same anomaly read as a length', () => {
    it('collapses the neutral bound to exactly 1/(8N)', () => {
      expect(ehhHalfLength(neutralAlleleAge(N, 0.5))).toBeCloseTo(1 / (8 * N), 15);
      expect((ehhHalfLength(neutralAlleleAge(N, 0.5)) * KB).toFixed(2)).toBe('1.25');
      expect(mdx).toContain('1.25\\times10^{-5}');
      expect(mdx).toContain('1.25 kb');
    });

    it('gives the swept half-length and its ratio', () => {
      expect(ehhHalfLength(500)).toBeCloseTo(6.931472e-4, 10);
      expect((ehhHalfLength(500) * KB).toFixed(2)).toBe('69.31');
      const ratio = ehhHalfLength(500) / ehhHalfLength(neutralAlleleAge(N, 0.5));
      expect(ratio.toFixed(2)).toBe('55.45');
      expect(ratio).toBeCloseTo(sweepAgeAnomaly(N, 0.5, 500), 9);
      expect(mdx).toContain('6.931472\\times10^{-4}');
      expect(mdx).toContain('69.31');
    });
  });

  describe('the figures', () => {
    it('draws the age curve in units of 4N, matching the closed form', () => {
      // the generator plots -(p/(1-p)) ln p; the simulated points are 3-4% under it
      const overFourN = (p: number) => -(p / (1 - p)) * Math.log(p);
      expect(overFourN(0.5)).toBeCloseTo(Math.LN2, 12);
      expect(neutralAlleleAge(N, 0.5) / (4 * N)).toBeCloseTo(overFourN(0.5), 12);
      // the sweep ring: 500 generations at N = 10,000 is 0.0125 on that axis
      expect(500 / (4 * N)).toBeCloseTo(0.0125, 12);
      expect(mdx).toContain('0.0125');
      expect(mdx).toContain('3–4% below the curve');
      // the caption names the simulation's parameters, so the prose has to as well
      expect(mdx).toContain('60,000 generations');
      expect(mdx).toContain('2N = 1,000 chromosomes');
    });

    it('marks both EHH crossings where the curves actually cross one half', () => {
      expect(Math.exp(-2 * 69.31e-5 * 500)).toBeCloseTo(0.5, 3);
      expect(Math.exp(-2 * 1.25e-5 * neutralAlleleAge(N, 0.5))).toBeCloseTo(0.5, 6);
    });
  });

  describe('exercises', () => {
    it('exercise 1 — age at 0.20, and the shape of the curve', () => {
      expect(neutralAlleleAge(N, 0.2).toFixed(2)).toBe('16094.38');
      expect(Math.round((neutralAlleleAge(N, 0.2) * 25) / 1000)).toBe(402);
      expect((neutralAlleleAge(N, 0.5) / neutralAlleleAge(N, 0.2)).toFixed(2)).toBe('1.72');
      expect(mdx).toContain('16{,}094.38');
      expect(mdx).toContain('402,000 years');
      expect(mdx).toContain('factor of only 1.72');
    });

    it('exercise 2 — the two anomalies agree', () => {
      expect(neutralAlleleAge(N, 0.75).toFixed(2)).toBe('34521.85');
      expect(sweepAgeAnomaly(N, 0.75, 1200).toFixed(2)).toBe('28.77');
      expect((ehhHalfLength(1200) * KB).toFixed(2)).toBe('28.88');
      expect((ehhHalfLength(neutralAlleleAge(N, 0.75)) * KB).toFixed(3)).toBe('1.004');
      expect((ehhHalfLength(1200) / ehhHalfLength(neutralAlleleAge(N, 0.75))).toFixed(2)).toBe('28.77');
      expect(mdx).toContain('34{,}521.85');
      expect(mdx).toContain('28.77');
      expect(mdx).toContain('28.88 kb');
      expect(mdx).toContain('1.004 kb');
    });

    it('exercise 3 — 50 kb is a genealogy depth, and N moves the floor four-fold', () => {
      expect((Math.LN2 / (2 * 50e-5)).toFixed(2)).toBe('693.15');
      expect((1 / (8 * 5000) * KB).toFixed(1)).toBe('2.5');
      expect((1 / (8 * 20_000) * KB).toFixed(3)).toBe('0.625');
      expect((1 / (8 * 5000)) / (1 / (8 * 20_000))).toBeCloseTo(4, 12);
      expect(mdx).toContain('693.15');
      expect(mdx).toContain('2.5 kb at $N = 5{,}000$');
      expect(mdx).toContain('0.625 kb at $N = 20{,}000$');
    });

    it('exercise 4 — a polygenic response is inside the drift step', () => {
      const driftStep = Math.sqrt(0.25 / 20_000);
      expect(driftStep.toFixed(4)).toBe('0.0035');
      expect(driftStep.toFixed(6)).toBe('0.003536');
      expect(0.004).toBeGreaterThan(driftStep);
      expect(mdx).toContain('0.0035');
      // the callout printed this fraction as a PERCENTAGE, 100x too small
      expect(mdx).toContain('0.003536');
      expect(mdx).not.toContain('0.0035% per generation');
      expect((100 * driftStep).toFixed(3)).toBe('0.354');
    });

    it('exercise 1 — states the frequency and age ratios correctly', () => {
      // 0.20 -> 0.50 is a factor of 2.5 in frequency, 1.72 in age
      expect(0.5 / 0.2).toBeCloseTo(2.5, 12);
      expect((neutralAlleleAge(N, 0.5) / neutralAlleleAge(N, 0.2)).toFixed(2)).toBe('1.72');
      // 0.20 -> 0.10 halves the FREQUENCY but cuts the age only to 0.636 of it
      expect((neutralAlleleAge(N, 0.1) / neutralAlleleAge(N, 0.2)).toFixed(3)).toBe('0.636');
      expect(mdx).toContain('factor of 2.5');
      expect(mdx).toContain('factor of 0.636');
      expect(mdx).not.toContain('doubling the frequency from 0.20 to 0.50');
      expect(mdx).not.toMatch(/halves it\s+to 10,233\.71/);
    });

    it('gives the haplotype window a value consistent with the prose', () => {
      // the table said 0.05N (500 generations) while the paragraph below said ~1,000
      expect(mdx).toContain('0.1N');
      expect(mdx).not.toContain('0.05N');
    });
  });

  it('reports the simulation constants as measured, not as a closed form', () => {
    // these are the one set of numbers in this lesson that no closed form produces; the
    // prose has to say so, because that admission is what motivates the iHS contrast
    for (const v of ['0.786', '0.681', '0.598']) expect(mdx).toContain(v);
    expect(mdx).toContain('not a constant');
    expect(mdx).toContain('within-locus contrast');
  });
});

describe('statgen-multiple-testing', () => {
  const mdx = lesson('statgen-multiple-testing');
  const P = [0.0001, 0.0008, 0.0021, 0.0115, 0.0120, 0.0130, 0.0140, 0.0290, 0.0360, 0.0450,
             0.0610, 0.0930, 0.1400, 0.2100, 0.3500, 0.4600, 0.6100, 0.7100, 0.7800, 0.9200];

  describe('worked example — twenty tests, three procedures', () => {
    it('rejects seven, three and two', () => {
      expect(benjaminiHochberg(P, 0.05).rejected).toBe(7);
      expect(benjaminiHochberg(P, 0.05).threshold).toBeCloseTo(0.014, 12);
      expect(P.filter((p) => p <= 0.05 / 20).length).toBe(3);
      expect(benjaminiYekutieli(P, 0.05).rejected).toBe(2);
      expect(P.filter((p) => p <= 0.05).length).toBe(10);
      expect(mdx).toContain('**7 rejections**');
      expect(mdx).toContain('**3 rejections**');
      expect(mdx).toContain('**2 rejections**');
      expect(mdx).toContain('**10**');
    });

    it('has rank 4 failing its own line and rejected regardless', () => {
      expect(P[3]).toBeCloseTo(0.0115, 12);
      expect((4 / 20) * 0.05).toBeCloseTo(0.01, 12);
      expect(P[3]).toBeGreaterThan((4 / 20) * 0.05);
      expect(P[3]).toBeLessThanOrEqual(benjaminiHochberg(P, 0.05).threshold);
      // matched with a regex rather than an embedded newline: the exact wrap position is
      // an artefact of the prose, not something an assertion should depend on
      expect(mdx).toMatch(/0\.0115 against\s+0\.0100/);
      expect(mdx).toMatch(/0\.0140 against\s+0\.0175/);
    });

    it('gives the BY line the lesson quotes', () => {
      const H = harmonic(20);
      expect(H.toFixed(4)).toBe('3.5977');
      expect((0.05 / H / 20).toFixed(6)).toBe('0.000695');
      expect((3 * (0.05 / H)) / 20).toBeCloseTo(0.002085, 6);
      expect(mdx).toContain('3.5977');
      expect(mdx).toContain('0.000695');
      expect(mdx).toContain('0.002085');
    });
  });

  describe('what BH controls', () => {
    it('is pi0 q at every null fraction the lesson lists', () => {
      const pairs: [number, string][] = [[0.95, '0.0475'], [0.9, '0.0450'], [0.75, '0.0375'],
        [0.5, '0.0250'], [0.25, '0.0125']];
      for (const [pi0, want] of pairs) {
        expect(bhRealisedFdr(pi0, 0.05).toFixed(4)).toBe(want);
        expect(mdx).toContain(want);
      }
    });

    it('quotes the simulated values beside the predicted ones', () => {
      for (const v of ['0.0474', '0.0449', '0.0376', '0.0251']) expect(mdx).toContain(v);
    });
  });

  describe('Storey', () => {
    it('estimates 0.40 on the worked p-values', () => {
      expect(storeyPi0(P, 0.5)).toBeCloseTo(0.4, 12);
      expect(P.filter((p) => p > 0.5).length).toBe(4);
      expect(mdx).toContain('4/10 = 0.40');
    });

    it('has the corrected gain table, produced with pi0 ESTIMATED not assumed', () => {
      const rows: [number, number, number, number, number, number][] = [
        // mu, power, pi0_hat, level, BH, Storey
        [2.0, 0.223, 0.5886, 0.0849, 2282, 3440],
        [2.5, 0.506, 0.5331, 0.0938, 5185, 6665],
        [3.0, 0.744, 0.5099, 0.0981, 7629, 8788],
        [3.5, 0.889, 0.5025, 0.0995, 9122, 9863],
        [4.0, 0.960, 0.5007, 0.0999, 9848, 10313],
      ];
      for (const [, power, pi0hat, level, bh, st] of rows) {
        // the level is q / pi0_hat, which is NOT 0.10 except in the limit
        expect(0.05 / pi0hat).toBeCloseTo(level, 4);
        expect(mdx).toContain(power.toFixed(3));
        expect(mdx).toContain(pi0hat.toFixed(4));
        expect(mdx).toContain(level.toFixed(4));
        expect(mdx).toContain(bh.toLocaleString('en-US'));
        expect(mdx).toContain(st.toLocaleString('en-US'));
        expect(mdx).toContain((st / bh).toFixed(3));
      }
      // only the last row's level is within a thousandth of the doubled 0.10
      expect(0.05 / rows[0][2]).toBeLessThan(0.09);
      expect(0.05 / rows[4][2]).toBeGreaterThan(0.0995);
    });

    it('derives the leak that biases pi0_hat, and matches the simulation', () => {
      // p > lambda  <=>  |z| < Phi^-1(1 - lambda/2); at lambda = 0.5 that is 0.6745
      const zl = normalQuantile(0.75);
      expect(zl).toBeCloseTo(0.6744898, 6);
      const leak = (mu: number) => normalCdf(zl - mu) - normalCdf(-zl - mu);
      expect(leak(2)).toBeCloseTo(0.0888, 4);
      // pi0_hat = pi0 + (1 - pi0) * leak / (1 - lambda); at pi0 = lambda = 0.5 that is 0.5 + leak
      expect(0.5 + leak(2)).toBeCloseTo(0.5888, 4);
      expect(0.5 + leak(2)).toBeCloseTo(0.5886, 3); // the simulated value
      expect(mdx).toContain('0.0888');
      expect(mdx).toContain('0.5888');
      // and the leak vanishes as the alternatives strengthen, which is why the top of the
      // table is where the estimator is honest
      expect(leak(4)).toBeLessThan(leak(2) / 100);
    });

    it('quotes the counterfactual a known pi0 would have delivered', () => {
      expect(mdx).toContain('1.694');
      expect(mdx).toContain('1.70 times as permissive, not twice');
      expect(mdx).toContain('4.7%');
    });

    it('no longer claims the threshold doubles everywhere', () => {
      // the original draft said this in five places; it is false because pi0_hat != pi0
      expect(mdx).not.toContain('twice as permissive, at every rank');
      expect(mdx).not.toContain('at every point on the curve');
      expect(mdx).not.toContain('the threshold doubles at every point');
      expect(mdx).not.toContain('the threshold doubles everywhere');
      expect(mdx).not.toContain('Twice the threshold');
    });
  });

  describe('dependence', () => {
    it('prices arbitrary dependence at the harmonic number', () => {
      expect(harmonic(20).toFixed(4)).toBe('3.5977');
      expect(harmonic(20_000).toFixed(4)).toBe('10.4807');
      expect(harmonic(1_000_000).toFixed(4)).toBe('14.3927');
      expect((0.05 / harmonic(1_000_000)).toExponential(3)).toBe('3.474e-3');
      expect(mdx).toContain('10.4807');
      expect(mdx).toContain('14.3927');
      expect(mdx).toContain('3.474\\times10^{-3}');
    });

    it('crosses Bonferroni at exactly rank H_m', () => {
      for (const m of [20, 1000, 1_000_000]) {
        const H = harmonic(m);
        expect((H * (0.05 / H)) / m).toBeCloseTo(bonferroni(0.05, m), 15);
      }
      expect(mdx).toContain('rank $i = H_m = 14.3927$');
    });

    it('keeps Sidak above Bonferroni by a factor that converges to -ln(1-a)/a', () => {
      // the ratio does not tend to 1 -- it tends to 1.025866 at alpha = 0.05, and is
      // essentially independent of m once m is large
      const limit = -Math.log(1 - 0.05) / 0.05;
      expect(limit.toFixed(6)).toBe('1.025866');
      for (const m of [1000, 1_000_000, 100_000_000]) {
        expect(sidakThreshold(0.05, m)).toBeGreaterThan(bonferroni(0.05, m));
        expect(sidakThreshold(0.05, m) / bonferroni(0.05, m)).toBeCloseTo(limit, 3);
      }
      expect(sidakThreshold(0.05, 1_000_000).toExponential(3)).toBe('5.129e-8');
      expect(mdx).toContain('1.025866');
      expect(mdx).toContain('5.129\\times10^{-8}');
    });
  });

  describe('a rate for a set, not a member', () => {
    it('quotes the set rate and the marginal rate and their ratio', () => {
      expect((0.1062 / 0.0251).toFixed(2)).toBe('4.23');
      expect(mdx).toContain('0.0251');
      expect(mdx).toContain('10.62%');
      expect(mdx).toContain('4.23 times');
      // the prose said 4.22 in four places while this very test computed 4.23
      expect(mdx).not.toContain('4.22');
      // exercise 4 propagates the same factor
      expect((0.05 * 4.23).toFixed(3)).toBe('0.212');
      expect(mdx).toContain('0.212');
    });
  });

  describe('exercises', () => {
    it('exercise 1 — BH rejects two, Bonferroni one', () => {
      const Q = [0.0004, 0.009, 0.018, 0.022, 0.03, 0.04, 0.06, 0.12, 0.4, 0.7];
      expect(benjaminiHochberg(Q, 0.05).rejected).toBe(2);
      expect(Q.filter((p) => p <= 0.05 / 10).length).toBe(1);
      expect(mdx).toContain('**2 rejections**');
      expect(mdx).toContain('**1 rejection**');
    });

    it('exercise 3 — the BY line at rank 400 clears 1e-7', () => {
      const level = 0.05 / harmonic(1_000_000);
      expect(((400 * level) / 1e6).toExponential(2)).toBe('1.39e-6');
      expect(1.39e-6).toBeGreaterThan(1e-7);
      expect(mdx).toContain('1.39\\times10^{-6}');
    });
  });
});

describe('statgen-within-family', () => {
  const mdx = lesson('statgen-within-family');
  const EQ = assortativeEquilibrium(0.5, 0.4);

  describe('worked example — h0 = 0.5, mu = 0.4', () => {
    it('is exactly sqrt(5/3) and not the naive 1.25', () => {
      expect(EQ.ratio).toBeCloseTo(Math.sqrt(5 / 3), 12);
      expect(EQ.ratio.toFixed(6)).toBe('1.290994');
      expect(EQ.additiveVariance.toFixed(6)).toBe('0.645497');
      expect((1 / (1 - 0.4 * 0.5)).toFixed(2)).toBe('1.25');
      expect(mdx).toContain('1.290994');
      expect(mdx).toContain('0.645497');
      expect(mdx).toContain('1.25');
    });

    it('raises the heritability and the mate breeding-value correlation with it', () => {
      expect(EQ.h2.toFixed(6)).toBe('0.563508');
      expect(EQ.rhoA.toFixed(6)).toBe('0.225403');
      // and the implicit relation closes on itself
      expect(1 / (1 - EQ.rhoA)).toBeCloseTo(EQ.ratio, 12);
      expect(mdx).toContain('0.563508');
      expect(mdx).toContain('0.225403');
    });

    it('quotes the simulation beside the closed form', () => {
      for (const v of ['0.64907', '0.39907', '0.61405']) expect(mdx).toContain(v);
    });
  });

  describe('the twin bias', () => {
    it('raises the sibling correlation off one half', () => {
      expect(sibBreedingValueCorrelation(EQ.rhoA).toFixed(6)).toBe('0.612702');
      expect(sibBreedingValueCorrelation(0)).toBeCloseTo(0.5, 12);
      expect(mdx).toContain('0.612702');
    });

    it('understates h2 and invents shared environment', () => {
      const f = falconerUnderAssortment(EQ.h2, EQ.rhoA);
      expect(f.h2Estimate.toFixed(6)).toBe('0.436492');
      expect(f.c2Estimate.toFixed(6)).toBe('0.127017');
      expect(f.h2Estimate).toBeLessThan(EQ.h2);
      // the two estimates sum to the true h2 whatever rho is -- exercise 2 turns on this
      expect(f.h2Estimate + f.c2Estimate).toBeCloseTo(EQ.h2, 12);
      expect(mdx).toContain('0.436492');
      expect(mdx).toContain('0.127017');
      expect(mdx).toContain('0.4393');
      expect(mdx).toContain('0.1268');
    });
  });

  describe('genetic nurture', () => {
    it('inflates the population effect by 1 + (eta/delta)(1+rho)/2', () => {
      expect(nurtureInflation(0.5, EQ.rhoA).toFixed(5)).toBe('1.30635');
      expect(nurtureInflation(1, EQ.rhoA).toFixed(4)).toBe('1.6127');
      expect(nurtureInflation(0.25, EQ.rhoA).toFixed(5)).toBe('1.15318');
      expect(nurtureInflation(0, EQ.rhoA)).toBeCloseTo(1, 12);
      expect(mdx).toContain('1.30635');
      expect(mdx).toContain('1.6127');
      expect(mdx).toContain('1.15318');
      // the same quantity was printed 1.15320 two sentences later
      expect(mdx).not.toContain('1.15320');
    });

    it('collapses to 1 + eta/2delta under random mating', () => {
      expect(nurtureInflation(0.5, 0)).toBeCloseTo(1.25, 12);
      expect(mdx).toContain('1 + \\eta/2\\delta');
    });

    it('quotes the simulated ratios beside the predictions', () => {
      for (const v of ['1.1562', '1.3070', '1.6168', '0.9970', '0.9988', '0.9971']) {
        expect(mdx).toContain(v);
      }
    });
  });

  describe('exercises', () => {
    it('exercise 1 — a more heritable, more assorted trait', () => {
      const e = assortativeEquilibrium(0.8, 0.4);
      expect(e.additiveVariance.toFixed(6)).toBe('1.218795');
      expect(e.h2.toFixed(6)).toBe('0.859035');
      expect(e.ratio.toFixed(6)).toBe('1.523494');
      expect(Math.sqrt(0.36 + 0.384).toFixed(6)).toBe('0.862554');
      expect(mdx).toContain('1.218795');
      expect(mdx).toContain('0.859035');
      expect(mdx).toContain('1.523494');
      expect(mdx).toContain('0.862554');
    });

    it('exercise 2 — the two estimates sum to the truth', () => {
      expect(0.4 + 0.18).toBeCloseTo(0.58, 12);
      expect((0.18 / 0.58).toFixed(6)).toBe('0.310345');
      expect(0.5 * 0.58).toBeCloseTo(0.29, 12);
      expect(mdx).toContain('0.310345');
    });

    it('exercise 3 — the nurture ratio that would explain a 60% attenuation', () => {
      const target = 1 / 0.6;
      expect(target.toFixed(6)).toBe('1.666667');
      expect(((target - 1) / (1.29 / 2)).toFixed(6)).toBe('1.033592');
      expect(mdx).toContain('1.666667');
      expect(mdx).toContain('1.033592');
    });

    it('exercise 4 — the power cost of differencing', () => {
      // 1 - rho_A is exactly sqrt(0.6) here, so the surviving fraction is exactly sqrt(0.15)
      expect(1 - EQ.rhoA).toBeCloseTo(Math.sqrt(0.6), 12);
      expect((1 - EQ.rhoA) / 2).toBeCloseTo(Math.sqrt(0.15), 12);
      expect(((1 - EQ.rhoA) / 2).toFixed(6)).toBe('0.387298');
      expect(Math.round(500_000 / ((1 - EQ.rhoA) / 2) / 1000) * 1000).toBe(1_291_000);
      expect(mdx).toContain('0.387298');
      expect(mdx).toContain('\\sqrt{0.15}');
      expect(mdx).toContain('1{,}291{,}000');
    });
  });
});

describe('statgen-molecular-qtl-twas', () => {
  const mdx = lesson('statgen-molecular-qtl-twas');
  const G = 20_000;

  describe('worked example — a causal statistic of 8', () => {
    it('has the threshold and the critical correlation', () => {
      expect(twasCriticalCorrelation(1, G).toFixed(4)).toBe('4.7081');
      expect(twasCriticalCorrelation(8, G).toFixed(4)).toBe('0.5885');
      expect(mdx).toContain('4.7081');
      expect(mdx).toContain('0.5885');
    });

    it('LOWERS the critical correlation as the causal signal rises', () => {
      const rs = [6, 8, 10, 15].map((z) => twasCriticalCorrelation(z, G));
      expect(rs.map((r) => r.toFixed(4))).toEqual(['0.7847', '0.5885', '0.4708', '0.3139']);
      for (let i = 1; i < rs.length; i += 1) expect(rs[i]).toBeLessThan(rs[i - 1]);
      for (const v of ['0.7847', '0.4708', '0.3139']) expect(mdx).toContain(v);
      expect(mdx).toContain('falls as the signal strengthens');
    });

    it('has the probability table the lesson tabulates', () => {
      const rows: [number, string, string][] = [
        [0.5, '4.00', '0.2394'], [0.6, '4.80', '0.5366'], [0.7, '5.60', '0.8138'],
        [0.8, '6.40', '0.9547'], [0.9, '7.20', '0.9936']];
      for (const [r, ez, p] of rows) {
        expect(twasNullZ(r, 8).toFixed(2)).toBe(ez);
        expect(twasFalsePositiveProbability(r, 8, G).toFixed(4)).toBe(p);
        expect(mdx).toContain(ez);
        expect(mdx).toContain(p);
      }
      expect(mdx).toContain('95.47%');
    });

    it('crosses one half exactly at the critical correlation', () => {
      for (const z of [6, 8, 10]) {
        expect(twasFalsePositiveProbability(twasCriticalCorrelation(z, G), z, G))
          .toBeCloseTo(0.5, 6);
      }
    });
  });

  describe('the identity the lesson turns on', () => {
    it('makes the two genes correlate as their predicted expression does', () => {
      // exponential-decay LD over six variants; two genes on shifted weight vectors
      const ld = Array.from({ length: 12 }, (_, i) =>
        Array.from({ length: 12 }, (_, j) => 0.92 ** Math.abs(i - j)));
      const wA = [0, 0, 1, 0.6, 0.35, 0, 0, 0, 0, 0, 0, 0];
      const shifted = (k: number) => wA.map((_, i) => wA[(i - k + 12) % 12]);
      const rs = [0, 2, 4, 6].map((k) => predictedExpressionCorrelation(wA, shifted(k), ld));
      expect(rs[0]).toBeCloseTo(1, 12);
      for (let i = 1; i < rs.length; i += 1) expect(rs[i]).toBeLessThan(rs[i - 1]);
      // the lesson quotes the simulated block
      for (const v of ['0.906', '0.767', '0.649', '0.465', '0.202']) expect(mdx).toContain(v);
    });
  });

  describe('exercises', () => {
    it('exercise 1 — critical correlation at two signal strengths', () => {
      expect(twasCriticalCorrelation(5.5, G).toFixed(4)).toBe('0.8560');
      expect(twasCriticalCorrelation(12, G).toFixed(4)).toBe('0.3923');
      expect(mdx).toContain('0.8560');
      expect(mdx).toContain('0.3923');
    });

    it('exercise 2 — four genes, and the ranking question done with the correlation', () => {
      expect(twasCriticalCorrelation(9, G).toFixed(4)).toBe('0.5231');
      for (const [r, ez] of [[1.0, '9.00'], [0.88, '7.92'], [0.71, '6.39'], [0.34, '3.06']] as const) {
        expect(twasNullZ(r, 9).toFixed(2)).toBe(ez);
        expect(mdx).toContain(ez);
      }
      expect(twasFalsePositiveProbability(0.34, 9, G).toFixed(4)).toBe('0.0497');
      expect(mdx).toContain('0.0497');
      // the ranking probability MUST account for the correlation between the two statistics:
      // Var(z_A - z_B) = 2 - 2r, not 2. Treating them as independent gives 0.2225, sixteen
      // times too pessimistic.
      const r = 0.88;
      const sd = Math.sqrt(2 - 2 * r);
      expect(sd.toFixed(4)).toBe('0.4899');
      expect(normalCdf(-(9 - r * 9) / sd).toFixed(4)).toBe('0.0137');
      expect(normalCdf(-(9 - r * 9) / Math.SQRT2).toFixed(4)).toBe('0.2225');
      expect(mdx).toContain('0.4899');
      expect(mdx).toContain('0.0137');
      expect(mdx).toContain('0.2225');
      expect(mdx).not.toContain('roughly a fifth of the time');
    });
  });

  it('defers practice and colocalisation rather than re-deriving them', () => {
    expect(mdx).toContain('giambartolomei2014coloc');
    expect(mdx).toContain('previous lesson');
  });
});

describe('statgen-mathematical-foundations — Hauck-Donner figure and widget', () => {
  const mdx = lesson('statgen-mathematical-foundations');
  const N = 100;
  const PC = 0.5;
  const table = (orr: number) => {
    const p = (orr * PC) / (1 + PC * (orr - 1));
    return contingencyTests(N * p, N * (1 - p), N * PC, N * (1 - PC));
  };

  it('has all three statistics agreeing near the null', () => {
    const t = table(2);
    expect(t.wald.toFixed(3)).toBe('5.652');
    expect(t.score.toFixed(3)).toBe('5.714');
    expect(t.lrt.toFixed(3)).toBe('5.745');
    for (const v of ['5.652', '5.714', '5.745']) expect(mdx).toContain(v);
    // and the spread is 1.8% of the mean, which exercise 5 asks for
    const vals = [t.wald, t.score, t.lrt];
    const spread = (Math.max(...vals) - Math.min(...vals)) / (vals.reduce((a, b) => a + b) / 3);
    expect((100 * spread).toFixed(1)).toBe('1.6');
    expect(mdx).toContain('1.6\\%');
    // rounding the three to two decimals first gives 1.8% -- a spread is a difference of
    // nearby numbers and loses precision fast, so the exercise quotes three decimals
    expect(mdx).toContain('gives 1.8%');
  });

  it('keeps the order Wald < score < likelihood ratio across the family', () => {
    for (const orr of [1.2, 2, 4, 8, 16, 32, 64, 128]) {
      const t = table(orr);
      expect(t.wald).toBeLessThan(t.score);
      expect(t.score).toBeLessThan(t.lrt);
    }
  });

  it('makes the Wald statistic peak and then FALL, which is the whole figure', () => {
    expect(table(15.9647).wald.toFixed(4)).toBe('34.8431');
    // it is a genuine maximum: lower on both sides
    expect(table(8).wald).toBeLessThan(table(15.9647).wald);
    expect(table(32).wald).toBeLessThan(table(15.9647).wald);
    expect(table(128).wald).toBeLessThan(table(32).wald);
    // while the likelihood ratio is still climbing at every one of those points
    for (const [a, b] of [[8, 16], [16, 32], [32, 64], [64, 128]] as const) {
      expect(table(b).lrt).toBeGreaterThan(table(a).lrt);
    }
    expect(mdx).toContain('15.9647');
    expect(mdx).toContain('34.8431');
  });

  it('has the two values at OR = 128 and their p-values fourteen orders apart', () => {
    const t = table(128);
    expect(t.wald.toFixed(2)).toBe('17.57');
    expect(t.lrt.toFixed(2)).toBe('78.91');
    const pW = 1 - chi2Cdf(t.wald, 1);
    const pL = 1 - chi2Cdf(t.lrt, 1);
    expect(pW).toBeGreaterThan(1e-5);
    expect(pW).toBeLessThan(1e-4);
    expect(pL).toBeLessThan(1e-17);
    expect(Math.log10(pW) - Math.log10(pL)).toBeGreaterThan(13);
    expect(mdx).toContain('17.57');
    expect(mdx).toContain('78.91');
  });

  it('exercise 4 — the emptying cell that drives the turnover', () => {
    const p = (128 * PC) / (PC * (128 - 1) + 1);
    expect(p.toFixed(4)).toBe('0.9922');
    expect((N * (1 - p)).toFixed(2)).toBe('0.78');
    expect(mdx).toContain('0.9922');
    expect(mdx).toContain('0.78');
  });

  it('exercise 5 — the p-value ratio at the worked example', () => {
    const w = 1 - chi2Cdf(30.8199, 1);
    const l = 1 - chi2Cdf(34.5218, 1);
    expect((w / l).toFixed(1)).toBe('6.7');
    expect(mdx).toContain('factor of 6.7 in the p-value');
    expect(mdx).not.toContain('factor of 4.6');
  });
});

