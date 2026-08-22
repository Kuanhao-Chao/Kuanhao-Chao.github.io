import { describe, expect, it } from 'vitest';
import {
  expectedR2, falconerACE, haldaneTheta, kosambiTheta, ldHalfLife, ldMeasures,
  liabilityScale, ncp, ncpForPower, normalCdf, normalPdf, normalQuantile,
  powerFromNcp, sampleSizeForPower, sampleSizeForR2, shrinkageFactor, varianceExplained,
  acmgClassify, acmgPosterior, auprc, auprcBaseline, auroc, chi2Quantile, lnGamma,
  oeUpperBound, poissonCI, regularizedGammaP, spearman, wilsonInterval,
  cdsLength, cdsPosition, codonOf, complementBase, phylopToP, type Exon,
  alleleFrequency, expectedCoalescentTime, expectedTmrca, expectedTotalBranchLength,
  fixationProbability, fixationProbabilitySelected, fstHudson, harmonic, harmonicSquared,
  heterozygosityDecay, hweChiSquare, hweExactP, hweExpected, invert, matMul, matVec,
  pairwiseTheta, solveLinear, tajimaConstants, tajimasD, transpose, wattersonTheta, type Matrix,
  additiveRelationshipMatrix, additiveVariance, averageEffect, blupSolve, breedersResponse,
  breedersResponseFromIntensity, breedingValues, chi2ToLod, correlatedResponse,
  dominanceVariance, expectedFixationTime, genotypicMean, genotypicVariance, grmFromMarkers,
  hendersonMme, inbreedingCoefficients, kinshipMatrix, lodScore, lodToChi2, maxLod,
  multivariateResponse, predictionAccuracy, selectionIntensity, tdtStatistic,
  type LocusEffect, type PedigreeEntry,
  betaWeight, burdenStatistic, CHI2_1DF_MEDIAN, credibleSet, csPurity, eggerRegression,
  fStatistic, ivwMeta, ivwMr, lambdaGc, ldscRegression, pipsFromAbf, skatOQ, skatQ,
  stoufferMeta, variantScores, wakefieldAbf, waldRatio, weightedMedian, weightedMedianMr,
  winnersCurseExpectation, zThreshold, haldaneMorgans, kosambiMorgans, driftVariance,
} from './deepDiveMath.ts';

/**
 * These check the functions against things known independently of the lessons: closed
 * forms, round-trip identities, textbook constants and limiting behaviour.
 *
 * That independence is the point. `deepDiveExamples.test.ts` uses this module to compute
 * each lesson's numbers and asserts they appear in the prose — which proves the two agree,
 * not that either is right. This file is what proves the functions.
 */

describe('normal distribution', () => {
  it('has the textbook values at the centre', () => {
    expect(normalPdf(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 12);
    expect(normalPdf(0)).toBeCloseTo(0.3989423, 7);
    // A&S 7.1.26 is accurate to ~7.5e-8 by construction; asserting more than that
    // would be testing the approximation against a precision it never claimed.
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
  });

  it('is symmetric about zero', () => {
    for (const z of [0.25, 1, 1.96, 3]) {
      expect(normalCdf(-z)).toBeCloseTo(1 - normalCdf(z), 7);
      expect(normalPdf(-z)).toBeCloseTo(normalPdf(z), 12);
    }
  });

  it('round-trips the quantile through the CDF', () => {
    for (const p of [0.01, 0.1, 0.25, 0.5, 0.8, 0.975, 0.99]) {
      expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 6);
    }
  });

  it('reproduces the two constants the curriculum quotes', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
    // the genome-wide significance critical value, alpha = 5e-8 two-sided
    expect(normalQuantile(1 - 5e-8 / 2)).toBeCloseTo(5.4513, 3);
  });

  it('rejects probabilities outside the open unit interval', () => {
    expect(() => normalQuantile(0)).toThrow(RangeError);
    expect(() => normalQuantile(1)).toThrow(RangeError);
  });
});

describe('ldMeasures', () => {
  it('agrees with the determinant form of D, computed independently', () => {
    const [ab, aB2, bA, b] = [0.474, 0.126, 0.126, 0.274];
    const { D } = ldMeasures(ab, aB2, bA, b);
    expect(D).toBeCloseTo(ab * b - aB2 * bA, 12);
  });

  it('gives D = 0 and r² = 0 at linkage equilibrium', () => {
    // build a table that is exactly the product of its marginals
    const pA = 0.3, pB = 0.6;
    const m = ldMeasures(pA * pB, pA * (1 - pB), (1 - pA) * pB, (1 - pA) * (1 - pB));
    expect(m.D).toBeCloseTo(0, 12);
    expect(m.r2).toBeCloseTo(0, 12);
  });

  it('gives r² = 1 only when the two loci are redundant', () => {
    // only AB and ab present, at equal frequency: knowing one allele fixes the other
    const m = ldMeasures(0.4, 0, 0, 0.6);
    expect(m.r2).toBeCloseTo(1, 12);
    expect(Math.abs(m.Dprime)).toBeCloseTo(1, 12);
  });

  it("keeps |D'| = 1 whenever a haplotype is absent — the lesson's algebraic result", () => {
    for (const [ab, aB2, bA, b] of [[0.1, 0, 0.4, 0.5], [0.25, 0, 0.25, 0.5], [0.05, 0, 0.15, 0.8]]) {
      expect(Math.abs(ldMeasures(ab, aB2, bA, b).Dprime)).toBeCloseTo(1, 10);
    }
  });

  it('never exceeds r² = 1, over many random valid tables', () => {
    // deterministic pseudo-random sweep; no Math.random, so failures reproduce
    let seed = 12345;
    const next = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 500; i++) {
      const raw = [next(), next(), next(), next()];
      const s = raw.reduce((a, b) => a + b, 0);
      const [w, x, y, z] = raw.map((v) => v / s);
      const m = ldMeasures(w, x, y, z);
      expect(m.r2).toBeGreaterThanOrEqual(-1e-12);
      expect(m.r2).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(m.Dprime)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('refuses frequencies that do not sum to one', () => {
    expect(() => ldMeasures(0.5, 0.5, 0.5, 0.5)).toThrow(RangeError);
  });
});

describe('ldHalfLife', () => {
  it('round-trips: decaying for t½ generations leaves exactly one half', () => {
    for (const theta of [0.5, 0.1, 0.01, 0.001, 1e-4]) {
      expect((1 - theta) ** ldHalfLife(theta)).toBeCloseTo(0.5, 12);
    }
  });

  it('is approximated by 0.693/θ, well for small θ and poorly for large', () => {
    const err = (t: number) => Math.abs(0.693 / t - ldHalfLife(t)) / ldHalfLife(t);
    expect(err(0.001)).toBeLessThan(0.0005);
    expect(err(0.1)).toBeGreaterThan(0.05);
    expect(err(0.001)).toBeLessThan(err(0.1));
  });

  it('rejects a recombination fraction outside (0,1)', () => {
    expect(() => ldHalfLife(0)).toThrow(RangeError);
  });
});

describe('mapping functions', () => {
  it('both approach free assortment at long distance', () => {
    expect(haldaneTheta(10)).toBeCloseTo(0.5, 8);
    expect(kosambiTheta(10)).toBeCloseTo(0.5, 8);
  });

  it('expands to θ = d − d² for Haldane, and to θ = d − 4d³/3 for Kosambi', () => {
    // Both give θ ≈ d over a short interval, which is why "1 cM ≈ 1% recombination" is
    // safe inside a haplotype block. They differ at the next order, and that difference
    // is exactly the crossover interference Kosambi builds in.
    for (const d of [0.001, 0.005, 0.01]) {
      expect(haldaneTheta(d)).toBeCloseTo(d - d * d, 5);
      expect(kosambiTheta(d)).toBeCloseTo(d - (4 * d ** 3) / 3, 5);
      expect(Math.abs(haldaneTheta(d) - d)).toBeLessThan(1.01 * d * d);
    }
  });

  it('puts Kosambi above Haldane at intermediate distance, as interference implies', () => {
    for (const d of [0.1, 0.25, 0.5]) expect(kosambiTheta(d)).toBeGreaterThan(haldaneTheta(d));
  });
});

describe('falconerACE', () => {
  it('always exhausts the variance — an algebraic identity, not a coincidence', () => {
    for (const [mz, dz] of [[0.85, 0.5], [0.6, 0.4], [0.9, 0.3], [0.42, 0.31]]) {
      const { h2, c2, e2 } = falconerACE(mz, dz);
      expect(h2 + c2 + e2).toBeCloseTo(1, 12);
    }
  });

  it('finds no heritability when the two twin types correlate equally', () => {
    expect(falconerACE(0.7, 0.7).h2).toBeCloseTo(0, 12);
  });

  it('returns out-of-range components when the additive model does not fit', () => {
    const { h2, c2 } = falconerACE(0.9, 0.3);
    expect(h2).toBeGreaterThan(1);
    expect(c2).toBeLessThan(0);
  });
});

describe('liabilityScale', () => {
  it('reduces to the classical K(1−K)/z² form when the sample is not ascertained', () => {
    for (const K of [0.01, 0.05, 0.2]) {
      const z = normalPdf(normalQuantile(1 - K));
      expect(liabilityScale(0.3, K, K)).toBeCloseTo((0.3 * K * (1 - K)) / (z * z), 10);
    }
  });

  it('is linear in the observed-scale estimate', () => {
    expect(liabilityScale(0.4, 0.01, 0.5)).toBeCloseTo(2 * liabilityScale(0.2, 0.01, 0.5), 10);
  });

  it('corrects downward when cases are oversampled relative to prevalence', () => {
    expect(liabilityScale(0.2, 0.01, 0.5)).toBeLessThan(0.2);
  });
});

describe('polygenic prediction', () => {
  it('halves a marginal estimate exactly when M = Nh²', () => {
    // closed form: M/(Nh²) = 1  =>  1/(1+1) = 1/2
    expect(shrinkageFactor(2_000_000, 1_000_000, 0.5)).toBeCloseTo(0.5, 12);
  });

  it('shrinks to nothing in a small study and to nothing at all in a huge one', () => {
    expect(shrinkageFactor(1_000, 1_000_000, 0.5)).toBeLessThan(0.01);
    expect(shrinkageFactor(1e12, 1_000_000, 0.5)).toBeCloseTo(1 - 2e-6, 9);
    expect(shrinkageFactor(1e15, 1_000_000, 0.5)).toBeCloseTo(1, 8);
  });

  it('makes expected accuracy the heritability times the shrinkage', () => {
    expect(expectedR2(1e5, 1e6, 0.5)).toBeCloseTo(0.5 * shrinkageFactor(1e5, 1e6, 0.5), 12);
  });

  it('approaches the heritability ceiling but never passes it', () => {
    for (const N of [1e4, 1e6, 1e9, 1e12]) expect(expectedR2(N, 1e6, 0.5)).toBeLessThan(0.5);
    expect(expectedR2(1e12, 1e6, 0.5)).toBeCloseTo(0.5, 5);
  });

  it('round-trips the sample size against the accuracy it buys', () => {
    for (const target of [0.05, 0.25, 0.4, 0.45]) {
      const N = sampleSizeForR2(target, 1e6, 0.5);
      expect(expectedR2(N, 1e6, 0.5) / target).toBeCloseTo(1, 9);
    }
  });

  it('needs infinitely many samples to reach the ceiling itself', () => {
    expect(sampleSizeForR2(0.5, 1e6, 0.5)).toBe(Infinity);
  });
});

describe('association power', () => {
  it('reproduces the NCP of 39.60 the curriculum quotes throughout', () => {
    expect(ncpForPower(0.8, 5e-8)).toBeCloseTo(39.6, 1);
  });

  it('round-trips power through the non-centrality parameter', () => {
    for (const p of [0.5, 0.8, 0.9]) {
      expect(powerFromNcp(ncpForPower(p, 5e-8), 5e-8)).toBeCloseTo(p, 4);
    }
  });

  it('round-trips the sample size back to the NCP it was chosen for', () => {
    const q2 = varianceExplained(0.3, 0.05);
    const N = sampleSizeForPower(q2, 0.8, 5e-8);
    expect(ncp(N, q2)).toBeCloseTo(ncpForPower(0.8, 5e-8), 6);
  });

  it('rises with sample size and falls with a stricter threshold', () => {
    const q2 = varianceExplained(0.3, 0.05);
    expect(powerFromNcp(ncp(2e4, q2))).toBeGreaterThan(powerFromNcp(ncp(1e4, q2)));
    expect(powerFromNcp(ncp(1e4, q2), 5e-8)).toBeLessThan(powerFromNcp(ncp(1e4, q2), 0.05));
  });

  it('computes variance explained symmetrically in the minor allele frequency', () => {
    expect(varianceExplained(0.3, 0.1)).toBeCloseTo(varianceExplained(0.7, 0.1), 12);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Genomic data & resources track
// ══════════════════════════════════════════════════════════════════════════════

describe('incomplete gamma and chi-square', () => {
  it('reproduces ln Γ at the integers, where it is a factorial', () => {
    for (const n of [1, 2, 3, 5, 10]) {
      let fact = 1;
      for (let i = 2; i < n; i++) fact *= i;
      expect(Math.exp(lnGamma(n))).toBeCloseTo(fact, 6);
    }
    expect(lnGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
  });

  it('runs P(a, x) from 0 to 1 monotonically', () => {
    expect(regularizedGammaP(3, 0)).toBe(0);
    expect(regularizedGammaP(3, 200)).toBeCloseTo(1, 10);
    let prev = -1;
    for (const x of [0.5, 1, 2, 4, 8, 16]) {
      const v = regularizedGammaP(3, x);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('round-trips the chi-square quantile through its own CDF', () => {
    for (const df of [1, 2, 6, 20]) {
      for (const p of [0.05, 0.5, 0.9, 0.95, 0.99]) {
        expect(regularizedGammaP(df / 2, chi2Quantile(p, df) / 2)).toBeCloseTo(p, 8);
      }
    }
  });

  it('matches the chi-square table values the curriculum already uses', () => {
    // the 1-df median that λ_GC divides by, and the 5% critical value for an HWE test
    expect(chi2Quantile(0.5, 1)).toBeCloseTo(0.454936, 5);
    expect(chi2Quantile(0.95, 1)).toBeCloseTo(3.841459, 5);
    expect(chi2Quantile(0.95, 2)).toBeCloseTo(5.991465, 5);
  });
});

describe('wilsonInterval', () => {
  it('brackets the point estimate and stays inside [0,1]', () => {
    for (const [k, n] of [[3, 1_500_000], [50, 200], [0, 100], [100, 100]]) {
      const { lower, upper } = wilsonInterval(k, n);
      expect(lower).toBeGreaterThanOrEqual(0);
      expect(upper).toBeLessThanOrEqual(1);
      expect(lower).toBeLessThanOrEqual(k / n + 1e-12);
      expect(upper).toBeGreaterThanOrEqual(k / n - 1e-12);
    }
  });

  it('gives a non-degenerate interval at zero observations, unlike the normal one', () => {
    const { lower, upper } = wilsonInterval(0, 100);
    expect(lower).toBe(0);
    expect(upper).toBeGreaterThan(0); // the normal interval would collapse to [0, 0]
  });

  it('narrows as the denominator grows', () => {
    const width = (n: number) => {
      const w = wilsonInterval(Math.round(0.01 * n), n);
      return w.upper - w.lower;
    };
    expect(width(10_000)).toBeLessThan(width(1_000));
    expect(width(1_000)).toBeLessThan(width(100));
  });

  it('refuses an empty denominator', () => {
    expect(() => wilsonInterval(0, 0)).toThrow(RangeError);
  });
});

describe('poissonCI and oeUpperBound', () => {
  it('matches the published exact interval for a count of 10', () => {
    // Garwood 95%: [4.795, 18.390] — a standard table entry
    const { lower, upper } = poissonCI(10, 0.95);
    expect(lower).toBeCloseTo(4.795, 3);
    expect(upper).toBeCloseTo(18.39, 2);
  });

  it('is defined at zero, with a lower bound of exactly zero', () => {
    const { lower, upper } = poissonCI(0, 0.95);
    expect(lower).toBe(0);
    expect(upper).toBeCloseTo(3.689, 3); // −ln(0.025)
  });

  it('brackets the count itself', () => {
    for (const k of [0, 1, 5, 25, 100]) {
      const { lower, upper } = poissonCI(k, 0.9);
      expect(lower).toBeLessThanOrEqual(k);
      expect(upper).toBeGreaterThanOrEqual(k);
    }
  });

  it('makes LOEUF a bound that punishes thin evidence, not just a ratio', () => {
    // Two genes both observe o/e = 0. The one with more expected LoF has the stronger
    // claim to constraint, and only the bound expresses that; the ratio cannot.
    const thin = oeUpperBound(0, 2);
    const solid = oeUpperBound(0, 40);
    expect(thin).toBeGreaterThan(solid);
    expect(solid).toBeLessThan(0.1);
    expect(thin).toBeGreaterThan(1); // two expected LoF is no evidence of constraint at all
  });

  it('always exceeds the point estimate it bounds', () => {
    for (const [o, e] of [[5, 20], [0, 10], [30, 30], [100, 50]]) {
      expect(oeUpperBound(o, e)).toBeGreaterThan(o / e);
    }
  });

  it('refuses a zero expectation', () => {
    expect(() => oeUpperBound(1, 0)).toThrow(RangeError);
  });
});

describe('benchmark metrics', () => {
  const perfect = { labels: [1, 1, 1, 0, 0, 0], scores: [0.9, 0.8, 0.7, 0.3, 0.2, 0.1] };

  it('scores a perfect ranking at 1 on both curves', () => {
    expect(auroc(perfect.labels, perfect.scores)).toBeCloseTo(1, 12);
    expect(auprc(perfect.labels, perfect.scores)).toBeCloseTo(1, 12);
  });

  it('scores an inverted ranking at 0 on the ROC', () => {
    expect(auroc(perfect.labels, perfect.scores.map((s) => -s))).toBeCloseTo(0, 12);
  });

  it('puts a coin-flip ranking at 0.5 AUROC but at the positive rate on AUPRC', () => {
    // ten items, one positive, all tied: the whole point of the two baselines differing
    const labels = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const tied = labels.map(() => 0.5);
    expect(auroc(labels, tied)).toBeCloseTo(0.5, 12);
    expect(auprc(labels, tied)).toBeCloseTo(auprcBaseline(labels), 12);
    expect(auprcBaseline(labels)).toBeCloseTo(0.1, 12);
  });

  it('shows why an imbalanced set needs AUPRC — the same predictions, two verdicts', () => {
    // TraitGym's 1:9 design. A model that ranks every positive above 80% of controls
    // looks strong on AUROC and much weaker on AUPRC.
    const labels: number[] = [];
    const scores: number[] = [];
    for (let i = 0; i < 10; i++) { labels.push(1); scores.push(0.9 - i * 0.001); }
    for (let i = 0; i < 90; i++) { labels.push(0); scores.push(i < 18 ? 0.95 : 0.1 - i * 0.0001); }
    expect(auroc(labels, scores)).toBeGreaterThan(0.79);
    expect(auprc(labels, scores)).toBeLessThan(0.45);
    expect(auprcBaseline(labels)).toBeCloseTo(0.1, 12);
  });

  it('refuses a single-class input, where neither curve is defined', () => {
    expect(() => auroc([1, 1], [0.1, 0.2])).toThrow(RangeError);
    expect(() => auprc([0, 0], [0.1, 0.2])).toThrow(RangeError);
  });

  it('computes Spearman as Pearson on ranks, and is invariant to monotone rescaling', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [2, 4, 5, 4, 6];
    expect(spearman(a, a)).toBeCloseTo(1, 12);
    expect(spearman(a, [...a].reverse())).toBeCloseTo(-1, 12);
    // exp() is strictly increasing, so ranks — and therefore Spearman — cannot change
    expect(spearman(a, b)).toBeCloseTo(spearman(a.map(Math.exp), b), 12);
  });

  it('shares ranks between ties', () => {
    // [10, 20, 20, 30] -> ranks 1, 2.5, 2.5, 4; correlating with itself is still 1
    expect(spearman([10, 20, 20, 30], [1, 5, 5, 9])).toBeCloseTo(1, 12);
  });
});

describe('acmgPosterior', () => {
  it('lands the guideline thresholds exactly where the point system says', () => {
    // Tavtigian et al. 2018: 10 points is Pathogenic (>0.99), 6 is Likely pathogenic (0.90)
    expect(acmgPosterior(10)).toBeCloseTo(0.9941, 4);
    expect(acmgPosterior(6)).toBeCloseTo(0.9, 3);
    expect(acmgPosterior(0)).toBeCloseTo(0.1, 12); // no evidence returns the prior
  });

  it('is monotone in the evidence', () => {
    let prev = -1;
    for (const pts of [-8, -4, -1, 0, 1, 2, 4, 8, 10, 16]) {
      const v = acmgPosterior(pts);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('makes one very strong criterion worth 350:1 odds, by construction', () => {
    const post = acmgPosterior(8);
    const odds = post / (1 - post) / (0.1 / 0.9);
    expect(odds).toBeCloseTo(350, 6);
  });

  it('classifies the five tiers at the stated point boundaries', () => {
    expect(acmgClassify(10)).toBe('pathogenic');
    expect(acmgClassify(6)).toBe('likely-pathogenic');
    expect(acmgClassify(0)).toBe('uncertain');
    expect(acmgClassify(-1)).toBe('likely-benign');
    expect(acmgClassify(-7)).toBe('benign');
  });
});

describe('transcript coordinates', () => {
  // A three-exon gene. Everything below is checked against properties of the mapping
  // rather than against a second copy of the same arithmetic.
  const exons: Exon[] = [
    { start: 1000, end: 1300 },
    { start: 1500, end: 1700 },
    { start: 2000, end: 2200 },
  ];
  const MINUS = { cdsStart: 2150, cdsEnd: 1101 }; // transcript orientation: high -> low
  const PLUS = { cdsStart: 1101, cdsEnd: 2150 };

  it('gives a coding length that is a whole number of codons', () => {
    const n = cdsLength(exons, MINUS.cdsStart, MINUS.cdsEnd, '-');
    expect(n).toBe(552);
    expect(n % 3).toBe(0);
  });

  it('measures the same length whichever way the gene is read', () => {
    expect(cdsLength(exons, PLUS.cdsStart, PLUS.cdsEnd, '+')).toBe(
      cdsLength(exons, MINUS.cdsStart, MINUS.cdsEnd, '-')
    );
  });

  it('maps every coding base to a distinct position, covering 1..n exactly once', () => {
    // The strongest statement available: the mapping is a bijection onto the CDS.
    const seen = new Set<number>();
    for (let g = 1000; g <= 2200; g++) {
      const c = cdsPosition(g, exons, MINUS.cdsStart, MINUS.cdsEnd, '-');
      if (c === null) continue;
      expect(seen.has(c)).toBe(false);
      seen.add(c);
    }
    expect(seen.size).toBe(552);
    expect(Math.min(...seen)).toBe(1);
    expect(Math.max(...seen)).toBe(552);
  });

  it('runs the two strands in opposite directions, position for position', () => {
    // c_minus(g) + c_plus(g) = n + 1 for every coding base, because one counts up from
    // the end the other counts down from.
    const n = 552;
    for (const g of [1101, 1200, 1300, 1500, 1650, 1700, 2000, 2100, 2150]) {
      const cm = cdsPosition(g, exons, MINUS.cdsStart, MINUS.cdsEnd, '-')!;
      const cp = cdsPosition(g, exons, PLUS.cdsStart, PLUS.cdsEnd, '+')!;
      expect(cm + cp).toBe(n + 1);
    }
  });

  it('starts numbering at the first coding base and ends at the last', () => {
    expect(cdsPosition(2150, exons, MINUS.cdsStart, MINUS.cdsEnd, '-')).toBe(1);
    expect(cdsPosition(1101, exons, MINUS.cdsStart, MINUS.cdsEnd, '-')).toBe(552);
  });

  it('returns null outside the coding sequence, including in the introns', () => {
    for (const g of [999, 1100, 1400, 1850, 2151, 2201]) {
      expect(cdsPosition(g, exons, MINUS.cdsStart, MINUS.cdsEnd, '-')).toBeNull();
    }
  });

  it('skips introns rather than counting through them', () => {
    // Adjacent coding bases either side of an intron must be adjacent in c. space.
    const a = cdsPosition(1500, exons, MINUS.cdsStart, MINUS.cdsEnd, '-')!;
    const b = cdsPosition(1300, exons, MINUS.cdsStart, MINUS.cdsEnd, '-')!;
    expect(b - a).toBe(1);
  });

  it('partitions the CDS into codons of exactly three bases', () => {
    const counts = new Map<number, number>();
    for (let c = 1; c <= 552; c++) {
      const { codon, offset } = codonOf(c);
      expect(offset).toBeGreaterThanOrEqual(1);
      expect(offset).toBeLessThanOrEqual(3);
      counts.set(codon, (counts.get(codon) ?? 0) + 1);
    }
    expect(counts.size).toBe(184);
    for (const n of counts.values()) expect(n).toBe(3);
  });

  it('complements bases as an involution, and rejects anything else', () => {
    for (const b of ['A', 'C', 'G', 'T', 'N']) {
      expect(complementBase(complementBase(b))).toBe(b);
    }
    expect(complementBase('A')).toBe('T');
    expect(complementBase('c')).toBe('g');
    expect(() => complementBase('X')).toThrow();
  });
});

describe('phylopToP', () => {
  it('inverts a base-10 logarithm', () => {
    expect(phylopToP(2)).toBeCloseTo(0.01, 12);
    expect(phylopToP(3)).toBeCloseTo(0.001, 12);
    expect(phylopToP(0)).toBeCloseTo(1, 12);
  });

  it('treats acceleration and conservation as equally significant', () => {
    // The sign says which direction; the magnitude says how surprising.
    expect(phylopToP(-2.5)).toBeCloseTo(phylopToP(2.5), 15);
  });

  it('round-trips against the score that produced it', () => {
    for (const s of [0.5, 1, 2.3, 4, 7.5]) {
      expect(-Math.log10(phylopToP(s))).toBeCloseTo(s, 12);
    }
  });
});

describe('small dense linear algebra', () => {
  it('solves a system whose answer is known by hand', () => {
    // 2x +  y −  z =  8
    // −3x − y + 2z = −11
    // −2x + y + 2z = −3      →  (2, 3, −1)
    const x = solveLinear([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3]);
    expect(x[0]).toBeCloseTo(2, 12);
    expect(x[1]).toBeCloseTo(3, 12);
    expect(x[2]).toBeCloseTo(-1, 12);
  });

  it('pivots past a zero on the diagonal instead of returning NaN', () => {
    // Without partial pivoting the first elimination divides by zero here.
    const x = solveLinear([[0, 2], [1, 1]], [4, 3]);
    expect(x[0]).toBeCloseTo(1, 12);
    expect(x[1]).toBeCloseTo(2, 12);
  });

  it('refuses a singular matrix rather than returning nonsense', () => {
    expect(() => solveLinear([[1, 2], [2, 4]], [1, 2])).toThrow(/singular/);
  });

  it('inverts against a known inverse', () => {
    // [[4,7],[2,6]]⁻¹ = [[0.6,−0.7],[−0.2,0.4]]
    const inv = invert([[4, 7], [2, 6]]);
    expect(inv[0][0]).toBeCloseTo(0.6, 12);
    expect(inv[0][1]).toBeCloseTo(-0.7, 12);
    expect(inv[1][0]).toBeCloseTo(-0.2, 12);
    expect(inv[1][1]).toBeCloseTo(0.4, 12);
  });

  it('round-trips A⁻¹A to the identity', () => {
    const A: Matrix = [[4, 1, 2], [1, 5, 3], [2, 3, 6]];
    const I = matMul(invert(A), A);
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) expect(I[i][j]).toBeCloseTo(i === j ? 1 : 0, 10);
    }
  });

  it('agrees with the solver: A⁻¹b and solveLinear(A, b) are the same vector', () => {
    const A: Matrix = [[4, 1, 2], [1, 5, 3], [2, 3, 6]];
    const b = [7, -2, 11];
    const viaInverse = matVec(invert(A), b);
    solveLinear(A, b).forEach((v, i) => expect(v).toBeCloseTo(viaInverse[i], 10));
  });

  it('transposes involutively and multiplies associatively', () => {
    const A: Matrix = [[1, 2, 3], [4, 5, 6]];
    expect(transpose(transpose(A))).toEqual(A);
    const B: Matrix = [[1, 0], [0, 2], [3, 1]];
    const C: Matrix = [[2, 1], [1, 3]];
    const left = matMul(matMul(A, B), C);
    const right = matMul(A, matMul(B, C));
    left.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(right[i][j], 12)));
    // (AB)ᵀ = BᵀAᵀ
    const t1 = transpose(matMul(A, B));
    const t2 = matMul(transpose(B), transpose(A));
    t1.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(t2[i][j], 12)));
  });
});

describe('Hardy–Weinberg', () => {
  it('reproduces p² : 2pq : q² exactly, and conserves the sample size', () => {
    const g = { AA: 360, Aa: 480, aa: 160 }; // q = (320+480)/2000 = 0.4
    expect(alleleFrequency(g)).toBeCloseTo(0.4, 12);
    const e = hweExpected(g);
    expect(e.AA).toBeCloseTo(1000 * 0.36, 10);
    expect(e.Aa).toBeCloseTo(1000 * 0.48, 10);
    expect(e.aa).toBeCloseTo(1000 * 0.16, 10);
    expect(e.AA + e.Aa + e.aa).toBeCloseTo(1000, 10);
    expect(hweChiSquare(g)).toBeCloseTo(0, 10);
  });

  it('gives a chi-square that grows with the departure', () => {
    // Same allele frequency (q = 0.4), heterozygotes progressively depleted.
    const chis = [
      hweChiSquare({ AA: 360, Aa: 480, aa: 160 }),
      hweChiSquare({ AA: 410, Aa: 380, aa: 210 }),
      hweChiSquare({ AA: 460, Aa: 280, aa: 260 }),
    ];
    [1, 2].forEach((i) => expect(chis[i]).toBeGreaterThan(chis[i - 1]));
    chis.forEach((_, i) => expect(alleleFrequency([
      { AA: 360, Aa: 480, aa: 160 }, { AA: 410, Aa: 380, aa: 210 }, { AA: 460, Aa: 280, aa: 260 },
    ][i])).toBeCloseTo(0.4, 12));
  });

  it('matches an exact enumeration of the conditional distribution', () => {
    // Independently computed by summing the exact conditional multinomial
    // P(h | N, n_a) = n_a!(2N−n_a)!N! 2^h / [(2N)! ((n_a−h)/2)! h! ((2N−n_a−h)/2)!]
    // over every heterozygote count no more probable than the one observed.
    // The first row is the worked example of Wigginton, Cutler & Abecasis (2005).
    const cases: [{ AA: number; Aa: number; aa: number }, number][] = [
      [{ AA: 1469, Aa: 138, aa: 5 }, 0.3825186675],
      [{ AA: 0, Aa: 10, aa: 0 }, 0.0069064063],
      [{ AA: 5, Aa: 2, aa: 3 }, 0.0816861157],
      [{ AA: 998, Aa: 1, aa: 1 }, 0.0015007504],
      [{ AA: 20, Aa: 20, aa: 20 }, 0.0103072889],
      [{ AA: 100, Aa: 5, aa: 0 }, 1.0],
      [{ AA: 3, Aa: 0, aa: 3 }, 0.0216450216],
    ];
    for (const [g, p] of cases) expect(hweExactP(g)).toBeCloseTo(p, 9);
  });

  it('is a probability, and is symmetric in the two homozygotes', () => {
    for (const g of [{ AA: 30, Aa: 40, aa: 12 }, { AA: 7, Aa: 1, aa: 0 }, { AA: 1, Aa: 8, aa: 1 }]) {
      const p = hweExactP(g);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(1);
      // Which homozygote is called "reference" is a labelling choice, not a fact.
      expect(hweExactP({ AA: g.aa, Aa: g.Aa, aa: g.AA })).toBeCloseTo(p, 12);
    }
  });

  it('separates from the chi-square approximation exactly where the counts are small', () => {
    // 1-df upper tail, so the comparison is against something outside this module.
    const chiP = (g: { AA: number; Aa: number; aa: number }) =>
      1 - regularizedGammaP(0.5, hweChiSquare(g) / 2);

    // A common variant with plenty of every genotype: the approximation is fine.
    const common = { AA: 1469, Aa: 138, aa: 5 };
    expect(hweExactP(common)).toBeCloseTo(0.3825186675, 9);
    expect(chiP(common)).toBeCloseTo(0.3619985, 5);
    expect(Math.abs(hweExactP(common) - chiP(common))).toBeLessThan(0.03);

    // One heterozygote and one rare homozygote in a thousand people. The expected
    // homozygote count is 0.00225, so the (O−E)²/E term explodes and χ² reports
    // 1.6×10⁻⁹⁸ for a configuration the exact test rates at 1.5×10⁻³ — anti-conservative
    // by ninety-five orders of magnitude. This is why rare-variant QC uses the exact test.
    const rare = { AA: 998, Aa: 1, aa: 1 };
    expect(hweExactP(rare)).toBeCloseTo(0.0015007504, 9);
    expect(chiP(rare)).toBeLessThan(1e-90);
    expect(Math.log10(hweExactP(rare) / chiP(rare))).toBeGreaterThan(90);

    // And it fails on small samples too, not only rare alleles: ten heterozygotes and
    // nothing else is 4.4× more probable than χ² makes it.
    const tiny = { AA: 0, Aa: 10, aa: 0 };
    expect(hweExactP(tiny)).toBeCloseTo(0.0069064063, 9);
    expect(chiP(tiny)).toBeCloseTo(0.001565402, 7);
    expect(hweExactP(tiny) / chiP(tiny)).toBeCloseTo(4.41, 1);
  });
});

describe('drift and the coalescent', () => {
  it('decays heterozygosity at exactly 1/(2Nₑ) per generation', () => {
    expect(heterozygosityDecay(0.5, 100, 0)).toBeCloseTo(0.5, 12);
    expect(heterozygosityDecay(0.5, 100, 1)).toBeCloseTo(0.5 * (1 - 1 / 200), 12);
    // Half-life: t such that (1 − 1/2Nₑ)^t = 0.5, i.e. t = ln0.5 / ln(1 − 1/2Nₑ).
    const ne = 100;
    const half = Math.log(0.5) / Math.log(1 - 1 / (2 * ne));
    expect(heterozygosityDecay(1, ne, half)).toBeCloseTo(0.5, 10);
    // For large Nₑ the half-life is ≈ 2Nₑ ln2 = 1.386 Nₑ generations.
    expect(half / ne).toBeCloseTo(2 * Math.LN2, 2);
  });

  it('fixes a neutral allele with probability equal to its frequency', () => {
    for (const p of [0.01, 0.25, 0.5, 0.9]) expect(fixationProbability(p)).toBe(p);
  });

  it('reduces Kimura to the neutral case as selection vanishes', () => {
    expect(fixationProbabilitySelected(0.3, 0, 1000)).toBeCloseTo(0.3, 12);
    expect(fixationProbabilitySelected(0.3, 1e-12, 1000)).toBeCloseTo(0.3, 8);
    // Independently evaluated (1 − e^{−4Nₑsp}) / (1 − e^{−4Nₑs}).
    expect(fixationProbabilitySelected(0.01, 0.001, 1000)).toBeCloseTo(0.0399421264, 9);
    expect(fixationProbabilitySelected(0.01, 0.01, 1000)).toBeCloseTo(0.3296799540, 9);
    expect(fixationProbabilitySelected(0.01, -0.001, 1000)).toBeCloseTo(0.0007614213, 9);
    // Selection helps a beneficial allele and hurts a deleterious one.
    expect(fixationProbabilitySelected(0.01, 0.001, 1000)).toBeGreaterThan(0.01);
    expect(fixationProbabilitySelected(0.01, -0.001, 1000)).toBeLessThan(0.01);
  });

  it('sums the pairwise waiting times to the expected TMRCA', () => {
    const ne = 5000;
    for (const n of [2, 5, 20, 100]) {
      let total = 0;
      for (let k = n; k >= 2; k -= 1) total += expectedCoalescentTime(k, ne);
      expect(total).toBeCloseTo(expectedTmrca(n, ne), 8);
    }
    // Two lineages coalesce in 2Nₑ generations; a large sample takes 4Nₑ.
    expect(expectedTmrca(2, ne)).toBeCloseTo(2 * ne, 10);
    expect(expectedTmrca(1e6, ne)).toBeCloseTo(4 * ne, 1);
  });

  it('gives a total branch length of 4Nₑ Σ1/i', () => {
    const ne = 1000;
    expect(expectedTotalBranchLength(2, ne)).toBeCloseTo(4 * ne, 9);
    expect(expectedTotalBranchLength(10, ne)).toBeCloseTo(4 * ne * harmonic(9), 9);
    // The total tree is much longer than the depth: adding samples adds tips, not depth.
    expect(expectedTotalBranchLength(100, ne)).toBeGreaterThan(expectedTmrca(100, ne));
  });

  it('computes the harmonic sums', () => {
    expect(harmonic(1)).toBe(1);
    expect(harmonic(4)).toBeCloseTo(1 + 1 / 2 + 1 / 3 + 1 / 4, 12);
    expect(harmonicSquared(3)).toBeCloseTo(1 + 1 / 4 + 1 / 9, 12);
    // Σ1/i² → π²/6.
    expect(harmonicSquared(200000)).toBeCloseTo((Math.PI ** 2) / 6, 4);
  });
});

describe('the site frequency spectrum and neutrality', () => {
  it('estimates the same θ two ways under neutrality', () => {
    const n = 12;
    const a1 = harmonic(n - 1);
    expect(wattersonTheta(a1 * 5, n)).toBeCloseTo(5, 10);
    // θ_π from a spectrum: one site at each derived count 1..n−1 sums to 2 Σ i(n−i)/(n(n−1)).
    const counts = Array.from({ length: n - 1 }, (_, i) => i + 1);
    const expected = counts.reduce((s, i) => s + (2 * i * (n - i)) / (n * (n - 1)), 0);
    expect(pairwiseTheta(counts, n)).toBeCloseTo(expected, 12);
    // A singleton contributes least, a balanced site most.
    expect(pairwiseTheta([1], n)).toBeLessThan(pairwiseTheta([6], n));
  });

  it('is zero exactly when the two estimators agree', () => {
    const n = 12;
    const S = 10;
    expect(tajimasD(S, S / harmonic(n - 1), n)).toBeCloseTo(0, 12);
    expect(tajimasD(0, 0, n)).toBe(0);
  });

  it('signs the departure the way the literature reads it', () => {
    const n = 12;
    const thetaW = 10 / harmonic(n - 1);
    // Excess of rare variants — π below θ_W — is negative (a sweep, or growth).
    expect(tajimasD(10, thetaW * 0.6, n)).toBeLessThan(0);
    // Excess of intermediate-frequency variants is positive (balancing selection, structure).
    expect(tajimasD(10, thetaW * 1.5, n)).toBeGreaterThan(0);
    // Independently evaluated from Tajima (1989) eq. 38 with n = 12, S = 10.
    expect(tajimasD(10, 2.0, n)).toBeCloseTo(-1.629265, 5);
    expect(tajimasD(10, 5.0, n)).toBeCloseTo(2.097913, 5);
  });

  it('uses the variance Tajima derived, not a bootstrap', () => {
    // Independently evaluated for n = 12.
    const k = tajimaConstants(12);
    expect(k.a1).toBeCloseTo(3.0198773449, 9);
    expect(k.a2).toBeCloseTo(1.5580321940, 9);
    expect(k.b1).toBeCloseTo(0.3939393939, 9);
    expect(k.b2).toBeCloseTo(0.2676767677, 9);
    expect(k.c1).toBeCloseTo(0.0628001171, 9);
    expect(k.c2).toBeCloseTo(0.0521908593, 9);
    expect(k.e1).toBeCloseTo(0.0207955854, 9);
    expect(k.e2).toBeCloseTo(0.0048878412, 9);
  });

  it('recovers c₁θ + c₂θ² when S is replaced by its expectation', () => {
    // The estimator's whole content: e₁ and e₂ are c₁ and c₂ divided by the factors
    // that make S/a₁ and S(S−1)/(a₁²+a₂) unbiased for θ and θ². Substituting E[S] = a₁θ
    // and E[S(S−1)] = (a₁²+a₂)θ² must therefore collapse e₁S + e₂S(S−1) back to
    // Tajima's variance exactly. Checked against 120,000 neutral coalescent replicates
    // per (n, θ), where simulated Var(π − θ_W) matched c₁θ + c₂θ² to within 0.2–1.6 %.
    for (const n of [8, 12, 30]) {
      const { a1, a2, c1, c2, e1, e2 } = tajimaConstants(n);
      for (const theta of [3, 5, 10]) {
        const substituted = e1 * (a1 * theta) + e2 * (a1 * a1 + a2) * theta * theta;
        expect(substituted).toBeCloseTo(c1 * theta + c2 * theta * theta, 12);
      }
    }
    const { a1, a2, e1, e2 } = tajimaConstants(12);
    expect(e1 * (a1 * 5) + e2 * (a1 * a1 + a2) * 25).toBeCloseTo(1.6187720692, 9);
    expect(e1 * (a1 * 10) + e2 * (a1 * a1 + a2) * 100).toBeCloseTo(5.8470871054, 9);
  });

  it('divides by the square root of e₁S + e₂S(S−1) at the observed S', () => {
    const { a1, e1, e2 } = tajimaConstants(12);
    const S = 10;
    const numerator = 2.0 - S / a1;
    expect(tajimasD(S, 2.0, 12)).toBeCloseTo(numerator / Math.sqrt(e1 * S + e2 * S * (S - 1)), 12);
  });
});

describe('F_ST', () => {
  it('is zero for identical frequencies, up to the sampling correction', () => {
    // Hudson's numerator subtracts the sampling variance, so equal sample frequencies
    // give a small negative value rather than exactly zero — which is the point: an
    // uncorrected estimator would report structure that is only sampling noise.
    expect(fstHudson(0.3, 0.3, 1000, 1000)).toBeCloseTo(-0.001001001, 9);
    expect(fstHudson(0.3, 0.3, 1e7, 1e7)).toBeCloseTo(0, 6);
  });

  it('is one for a fixed difference', () => {
    expect(fstHudson(1, 0, 100, 100)).toBeCloseTo(1, 12);
    expect(fstHudson(0, 1, 100, 100)).toBeCloseTo(1, 12);
  });

  it('matches independently evaluated values and is symmetric', () => {
    expect(fstHudson(0.5, 0.1, 1000, 1000)).toBeCloseTo(0.3193193193, 9);
    expect(fstHudson(0.2, 0.8, 500, 500)).toBeCloseTo(0.5284687021, 9);
    expect(fstHudson(0.5, 0.1, 1000, 1000)).toBeCloseTo(fstHudson(0.1, 0.5, 1000, 1000), 12);
  });
});

describe('pedigrees and relatedness', () => {
  // 1 and 2 are unrelated founders; 3 = (1×2); 4 = (1×3) — a sire bred to his own
  // daughter; 5 = (4×3). Chosen because it makes 4 and 5 inbred, so the diagonal is not
  // trivially 1 and the recursion's f(x,x) = ½(1+F) branch is actually exercised.
  const ped: PedigreeEntry[] = [
    { id: '1' }, { id: '2' },
    { id: '3', sire: '1', dam: '2' },
    { id: '4', sire: '1', dam: '3' },
    { id: '5', sire: '4', dam: '3' },
  ];

  it('reproduces the relationship matrix computed by the tabular method', () => {
    // Independently evaluated in exact rational arithmetic:
    //   1     0     1/2   3/4   5/8
    //   0     1     1/2   1/4   3/8
    //   1/2   1/2   1     3/4   7/8
    //   3/4   1/4   3/4   5/4   1
    //   5/8   3/8   7/8   1     11/8
    const { ids, A } = additiveRelationshipMatrix(ped);
    expect(ids).toEqual(['1', '2', '3', '4', '5']);
    const expected = [
      [1, 0, 0.5, 0.75, 0.625],
      [0, 1, 0.5, 0.25, 0.375],
      [0.5, 0.5, 1, 0.75, 0.875],
      [0.75, 0.25, 0.75, 1.25, 1],
      [0.625, 0.375, 0.875, 1, 1.375],
    ];
    A.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(expected[i][j], 12)));
  });

  it('is symmetric, and gives founders a diagonal of exactly one', () => {
    const { A } = additiveRelationshipMatrix(ped);
    A.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(A[j][i], 15)));
    expect(A[0][0]).toBe(1);
    expect(A[1][1]).toBe(1);
    expect(A[0][1]).toBe(0);
  });

  it('reads inbreeding straight off the diagonal', () => {
    const F = inbreedingCoefficients(ped);
    expect(F.get('1')).toBeCloseTo(0, 12);
    expect(F.get('3')).toBeCloseTo(0, 12);
    // 4 is the offspring of 1 and 1's own daughter: F = ¼.
    expect(F.get('4')).toBeCloseTo(0.25, 12);
    expect(F.get('5')).toBeCloseTo(0.375, 12);
  });

  it('gives the textbook relationships for the standard family structures', () => {
    const fullSibs = additiveRelationshipMatrix([
      { id: 's' }, { id: 'd' },
      { id: 'c1', sire: 's', dam: 'd' }, { id: 'c2', sire: 's', dam: 'd' },
    ]);
    expect(fullSibs.A[2][3]).toBeCloseTo(0.5, 12);   // full sibs
    expect(fullSibs.A[0][2]).toBeCloseTo(0.5, 12);   // parent–offspring

    const halfSibs = additiveRelationshipMatrix([
      { id: 's' }, { id: 'd1' }, { id: 'd2' },
      { id: 'h1', sire: 's', dam: 'd1' }, { id: 'h2', sire: 's', dam: 'd2' },
    ]);
    expect(halfSibs.A[3][4]).toBeCloseTo(0.25, 12);  // half sibs
  });

  it('halves kinship with each generation of distance', () => {
    const { ids, f } = kinshipMatrix([
      { id: 'g0' }, { id: 'm0' },
      { id: 'g1', sire: 'g0', dam: 'm0' }, { id: 'm1' },
      { id: 'g2', sire: 'g1', dam: 'm1' }, { id: 'm2' },
      { id: 'g3', sire: 'g2', dam: 'm2' },
    ]);
    const at = (a: string, b: string) => f[ids.indexOf(a)][ids.indexOf(b)];
    expect(at('g0', 'g1')).toBeCloseTo(0.25, 12);
    expect(at('g0', 'g2')).toBeCloseTo(0.125, 12);
    expect(at('g0', 'g3')).toBeCloseTo(0.0625, 12);
  });

  it('rejects a pedigree in which someone is their own ancestor', () => {
    expect(() => kinshipMatrix([
      { id: 'a', sire: 'b' }, { id: 'b', sire: 'a' },
    ])).toThrow(/cycle/);
  });
});

describe('linkage and LOD scores', () => {
  it('maximises the likelihood at the observed recombination fraction', () => {
    const { theta, lod } = maxLod(3, 30);
    expect(theta).toBeCloseTo(0.1, 12);
    // No other θ can beat the maximum.
    for (const t of [0.02, 0.05, 0.15, 0.3, 0.49]) expect(lodScore(3, 30, t)).toBeLessThan(lod);
  });

  it('is zero at free recombination and maximal at complete linkage', () => {
    expect(lodScore(15, 30, 0.5)).toBeCloseTo(0, 12);
    // Twenty meioses with no recombinant: 2²⁰ to one, i.e. 20 log₁₀2.
    expect(maxLod(0, 20).lod).toBeCloseTo(20 * Math.log10(2), 10);
    expect(maxLod(0, 20).lod).toBeCloseTo(6.0206, 4);
  });

  it('converts to chi-square as the same likelihood ratio in other units', () => {
    // LOD 3 is χ² = 2 ln10 × 3 = 13.8155 on 1 df — a point-wise p of 2.0×10⁻⁴.
    expect(lodToChi2(3)).toBeCloseTo(13.815511, 6);
    expect(chi2ToLod(13.815511)).toBeCloseTo(3, 6);
    const p = 1 - regularizedGammaP(0.5, lodToChi2(3) / 2);
    expect(p).toBeCloseTo(2.0166451872e-4, 12);
    // Round trip for a range of scores.
    for (const l of [1, 2, 3.3, 5]) expect(chi2ToLod(lodToChi2(l))).toBeCloseTo(l, 12);
  });

  it('scores the TDT on the transmitted counts alone', () => {
    expect(tdtStatistic(30, 10)).toBeCloseTo(400 / 40, 12);
    expect(tdtStatistic(20, 20)).toBe(0);
    expect(tdtStatistic(0, 0)).toBe(0);
    // Symmetric in which allele is called "transmitted".
    expect(tdtStatistic(10, 30)).toBeCloseTo(tdtStatistic(30, 10), 12);
  });
});

describe('quantitative genetics', () => {
  const decompose = (locus: LocusEffect) => {
    const { p, a, d } = locus;
    const q = 1 - p;
    const mean = genotypicMean(locus);
    const bv = breedingValues(locus);
    const freq = { AA: p * p, Aa: 2 * p * q, aa: q * q };
    const value = { AA: a, Aa: d, aa: -a };
    const keys = ['AA', 'Aa', 'aa'] as const;
    // Everything below is computed from the genotype table directly, not from the module.
    const vg = keys.reduce((s, k) => s + freq[k] * (value[k] - mean) ** 2, 0);
    const va = keys.reduce((s, k) => s + freq[k] * bv[k] ** 2, 0);
    const vd = keys.reduce((s, k) => s + freq[k] * (value[k] - mean - bv[k]) ** 2, 0);
    const cov = keys.reduce((s, k) => s + freq[k] * bv[k] * (value[k] - mean - bv[k]), 0);
    const meanBv = keys.reduce((s, k) => s + freq[k] * bv[k], 0);
    return { vg, va, vd, cov, meanBv };
  };

  const loci: LocusEffect[] = [
    { p: 0.6, a: 10, d: 0 },
    { p: 0.6, a: 10, d: 5 },
    { p: 0.2, a: 0, d: 8 },
    { p: 0.5, a: 0, d: 8 },
    { p: 0.9, a: 4, d: -3 },
  ];

  it('centres the breeding values on zero', () => {
    for (const l of loci) expect(decompose(l).meanBv).toBeCloseTo(0, 12);
  });

  it('partitions the genotypic variance exactly, with no covariance left over', () => {
    for (const l of loci) {
      const { vg, va, vd, cov } = decompose(l);
      expect(additiveVariance(l)).toBeCloseTo(va, 10);
      expect(dominanceVariance(l)).toBeCloseTo(vd, 10);
      expect(genotypicVariance(l)).toBeCloseTo(vg, 10);
      // Orthogonal by construction: the breeding value IS the least-squares fit on
      // allele count, so the residual cannot correlate with it.
      expect(cov).toBeCloseTo(0, 10);
    }
  });

  it('makes the breeding value the regression on allele count', () => {
    for (const l of loci) {
      const alpha = averageEffect(l);
      const bv = breedingValues(l);
      expect(bv.AA).toBeCloseTo(alpha * (2 - 2 * l.p), 12);
      expect(bv.Aa).toBeCloseTo(alpha * (1 - 2 * l.p), 12);
      expect(bv.aa).toBeCloseTo(alpha * (0 - 2 * l.p), 12);
    }
  });

  it('shows additive variance is not the same thing as additive gene action', () => {
    // Pure dominance, no additive gene action anywhere (a = 0), yet at unequal
    // frequencies most of the genotypic variance is additive.
    const skewed: LocusEffect = { p: 0.2, a: 0, d: 8 };
    expect(averageEffect(skewed)).toBeCloseTo(4.8, 12);
    expect(additiveVariance(skewed)).toBeCloseTo(7.3728, 10);
    expect(dominanceVariance(skewed)).toBeCloseTo(6.5536, 10);
    expect(additiveVariance(skewed)).toBeGreaterThan(dominanceVariance(skewed));

    // The identical locus at p = ½: α is exactly zero and *all* the variance is dominance.
    const balanced: LocusEffect = { p: 0.5, a: 0, d: 8 };
    expect(averageEffect(balanced)).toBeCloseTo(0, 12);
    expect(additiveVariance(balanced)).toBeCloseTo(0, 12);
    expect(dominanceVariance(balanced)).toBeCloseTo(16, 10);
  });

  it('reduces to a = α with no dominance', () => {
    const additive: LocusEffect = { p: 0.6, a: 10, d: 0 };
    expect(averageEffect(additive)).toBeCloseTo(10, 12);
    expect(genotypicMean(additive)).toBeCloseTo(10 * (0.6 - 0.4), 12);
    expect(additiveVariance(additive)).toBeCloseTo(2 * 0.6 * 0.4 * 100, 10);
    expect(dominanceVariance(additive)).toBe(0);
  });
});

describe('selection', () => {
  it('matches the standard truncation-selection intensities', () => {
    // i = φ(Φ⁻¹(1−p))/p, evaluated independently.
    expect(selectionIntensity(0.5)).toBeCloseTo(0.7979, 4);
    expect(selectionIntensity(0.2)).toBeCloseTo(1.3998, 4);
    expect(selectionIntensity(0.1)).toBeCloseTo(1.7550, 4);
    expect(selectionIntensity(0.05)).toBeCloseTo(2.0627, 4);
    expect(selectionIntensity(0.01)).toBeCloseTo(2.6652, 4);
    // At p = ½ the closed form is √(2/π).
    expect(selectionIntensity(0.5)).toBeCloseTo(Math.sqrt(2 / Math.PI), 6);
  });

  it('has sharply diminishing returns', () => {
    // Cutting the selected fraction by 5× from 25 % to 5 % buys under 80 % more intensity.
    const ratio = selectionIntensity(0.05) / selectionIntensity(0.25);
    expect(ratio).toBeLessThan(1.8);
    expect(ratio).toBeGreaterThan(1.5);
    for (const [a, b] of [[0.5, 0.2], [0.2, 0.05], [0.05, 0.01]]) {
      expect(selectionIntensity(b)).toBeGreaterThan(selectionIntensity(a));
    }
    expect(() => selectionIntensity(0)).toThrow();
  });

  it('agrees between the two forms of the breeder’s equation', () => {
    const h2 = 0.4;
    const sdP = 12;
    const i = selectionIntensity(0.05);
    // S = i·σ_P, so R = h²S and R = i·h²·σ_P must be the same number.
    expect(breedersResponse(h2, i * sdP)).toBeCloseTo(breedersResponseFromIntensity(h2, i, sdP), 12);
    expect(breedersResponseFromIntensity(h2, i, sdP)).toBeCloseTo(2.0627 * 0.4 * 12, 3);
  });

  it('predicts a correlated response through h, not h squared', () => {
    // CR_y = i·h_x·h_y·r_g·σ_Py, evaluated independently at i = 2.0627, h²_x = 0.4,
    // h²_y = 0.25, r_g = 0.35, σ_Py = 12.
    const cr = correlatedResponse(2.0627, Math.sqrt(0.4), Math.sqrt(0.25), 0.35, 12);
    expect(cr).toBeCloseTo(2.7396, 3);
    // A negative genetic correlation drags the unselected trait the wrong way.
    expect(correlatedResponse(2.0627, Math.sqrt(0.4), 0.5, -0.35, 12)).toBeCloseTo(-cr, 10);
    expect(correlatedResponse(2.0627, Math.sqrt(0.4), 0.5, 0, 12)).toBe(0);
  });

  it('lets an unselected trait respond, through G P⁻¹ s', () => {
    const G: Matrix = [[40, 18], [18, 25]];
    const P: Matrix = [[100, 30], [30, 90]];
    const s = [6, 2];
    const dz = multivariateResponse(G, P, s);
    // Independently evaluated: (2.41481, 1.12840).
    expect(dz[0]).toBeCloseTo(2.41481, 5);
    expect(dz[1]).toBeCloseTo(1.12840, 5);
    // The univariate prediction h²s for trait 1 alone is 2.40 — close, but wrong, and
    // it says nothing at all about trait 2.
    expect((G[0][0] / P[0][0]) * s[0]).toBeCloseTo(2.4, 10);
    expect(dz[0]).not.toBeCloseTo(2.4, 3);

    // With no genetic covariance the two collapse to the univariate answer.
    const diagonal = multivariateResponse([[40, 0], [0, 25]], [[100, 0], [0, 90]], s);
    expect(diagonal[0]).toBeCloseTo(0.4 * 6, 10);
    expect(diagonal[1]).toBeCloseTo((25 / 90) * 2, 10);
  });
});

describe('BLUP and genomic selection', () => {
  const ped: PedigreeEntry[] = [
    { id: '1' }, { id: '2' },
    { id: '3', sire: '1', dam: '2' },
    { id: '4', sire: '1', dam: '3' },
    { id: '5', sire: '4', dam: '3' },
  ];
  const y = [4.5, 2.9, 3.9, 3.5, 5.0];
  const X: Matrix = y.map(() => [1]);
  const Z: Matrix = y.map((_, i) => y.map((__, j) => (i === j ? 1 : 0)));
  const lambda = 0.6 / 0.4;

  it('solves Henderson’s equations to the independently computed answer', () => {
    const { A } = additiveRelationshipMatrix(ped);
    const { fixed, random } = hendersonMme(X, Z, invert(A), lambda, y);
    expect(fixed[0]).toBeCloseTo(3.8304407650, 9);
    const expected = [0.3096362886, -0.3096362886, 0.1042333624, 0.1723891208, 0.3711736917];
    random.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9));
  });

  it('gives the same predictions from the form that never inverts K', () => {
    // û = K(K+λI)⁻¹ê is Henderson's system rewritten. They must agree exactly wherever
    // K⁻¹ exists — and the second form is defined when it does not.
    const { A } = additiveRelationshipMatrix(ped);
    const { fixed, random } = hendersonMme(X, Z, invert(A), lambda, y);
    const adjusted = y.map((v) => v - fixed[0]);
    blupSolve(A, lambda, adjusted).forEach((v, i) => expect(v).toBeCloseTo(random[i], 10));
  });

  it('shrinks toward zero as the residual variance grows', () => {
    const { A } = additiveRelationshipMatrix(ped);
    const adjusted = y.map((v) => v - 3.83);
    const light = blupSolve(A, 0.1, adjusted);
    const heavy = blupSolve(A, 20, adjusted);
    light.forEach((v, i) => expect(Math.abs(heavy[i])).toBeLessThan(Math.abs(v)));
    // λ → ∞ means no heritable signal at all.
    blupSolve(A, 1e9, adjusted).forEach((v) => expect(Math.abs(v)).toBeLessThan(1e-6));
  });

  it('builds a genomic relationship matrix that is symmetric and correctly scaled', () => {
    // Two individuals, both homozygous alternate at every marker: identical genotypes,
    // so their relationship equals their own diagonal.
    const freqs = [0.5, 0.5, 0.5, 0.5];
    const G = grmFromMarkers([[2, 2, 2, 2], [2, 2, 2, 2], [0, 0, 0, 0]], freqs);
    expect(G[0][1]).toBeCloseTo(G[0][0], 12);
    // Opposite homozygotes at every marker: maximally unrelated, and negatively so.
    expect(G[0][2]).toBeCloseTo(-G[0][0], 12);
    G.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(G[j][i], 15)));
    expect(() => grmFromMarkers([[2]], [0])).toThrow();
  });

  it('warns in code what centring on the sample does to G', () => {
    // Centre on frequencies computed from these same three individuals and every column
    // of W sums to zero, so G·1 = 0 — the matrix is singular and G⁻¹ does not exist.
    const genos: Matrix = [[2, 1, 0, 2], [1, 1, 2, 0], [0, 1, 1, 1]];
    const sampleFreqs = [0, 1, 2, 3].map((j) => genos.reduce((s, r) => s + r[j], 0) / (2 * genos.length));
    const G = grmFromMarkers(genos, sampleFreqs);
    matVec(G, [1, 1, 1]).forEach((v) => expect(Math.abs(v)).toBeLessThan(1e-12));
    expect(() => invert(G)).toThrow(/singular/);
    // The non-inverse form still works on it.
    expect(blupSolve(G, 1.5, [0.5, -0.2, -0.3]).length).toBe(3);
  });

  it('raises accuracy with N and heritability, and lowers it with segment count', () => {
    expect(predictionAccuracy(10000, 0.5, 5000)).toBeGreaterThan(predictionAccuracy(1000, 0.5, 5000));
    expect(predictionAccuracy(10000, 0.5, 5000)).toBeGreaterThan(predictionAccuracy(10000, 0.2, 5000));
    expect(predictionAccuracy(10000, 0.5, 50000)).toBeLessThan(predictionAccuracy(10000, 0.5, 5000));
    // Nh² = Mₑ is the half-way point: r² = ½.
    expect(predictionAccuracy(10000, 0.5, 5000) ** 2).toBeCloseTo(0.5, 12);
    expect(predictionAccuracy(1e12, 0.5, 5000)).toBeCloseTo(1, 6);
  });
});

describe('expectedFixationTime', () => {
  it('matches the diffusion result', () => {
    // −4Nₑ((1−p)/p)ln(1−p), evaluated independently.
    expect(expectedFixationTime(0.1, 1000)).toBeCloseTo(3792.9786, 3);
    expect(expectedFixationTime(0.5, 1000)).toBeCloseTo(2772.5887, 3);
  });

  it('approaches 4Nₑ for a new mutation', () => {
    const ne = 10000;
    // p = 1/(2Nₑ): −4Nₑ·2Nₑ·ln(1 − 1/2Nₑ) → 4Nₑ as Nₑ grows.
    expect(expectedFixationTime(1 / (2 * ne), ne) / (4 * ne)).toBeCloseTo(1, 3);
  });

  it('is shorter for an allele that is already common', () => {
    expect(expectedFixationTime(0.9, 1000)).toBeLessThan(expectedFixationTime(0.1, 1000));
    expect(() => expectedFixationTime(0, 100)).toThrow();
    expect(() => expectedFixationTime(1, 100)).toThrow();
  });
});

describe('genomic inflation', () => {
  it('divides by the exact median of the null, not a rounded one', () => {
    // (Φ⁻¹(0.75))² = 0.67448975019608174² = 0.45493642311957275, to full precision.
    expect(CHI2_1DF_MEDIAN).toBeCloseTo(0.45493642311957275, 15);
    // Acklam's quantile approximation is good to ~1e-9 relative, so squaring it agrees
    // only to about ten places — asserting more would test the approximation against a
    // precision it never claimed, and the constant is the thing being checked here.
    expect(CHI2_1DF_MEDIAN).toBeCloseTo(normalQuantile(0.75) ** 2, 9);
  });

  it('is one when the statistics are drawn from the null', () => {
    // A set whose median is exactly the null median must give λ = 1.
    expect(lambdaGc([0.1, CHI2_1DF_MEDIAN, 20])).toBeCloseTo(1, 12);
    // Doubling every statistic doubles λ.
    expect(lambdaGc([0.2, 2 * CHI2_1DF_MEDIAN, 40])).toBeCloseTo(2, 12);
  });

  it('takes the median, so a handful of huge hits cannot move it', () => {
    const nulls = Array.from({ length: 999 }, (_, i) => (i / 999) * 5);
    const withHits = [...nulls, 400, 500, 600];
    expect(Math.abs(lambdaGc(withHits) - lambdaGc(nulls))).toBeLessThan(0.02);
    expect(() => lambdaGc([])).toThrow();
  });
});

describe('LD score regression', () => {
  it('recovers the intercept and slope from a clean line', () => {
    const ld = [1, 5, 10, 25, 60];
    const n = 100000;
    const m = 1000000;
    const h2 = 0.35;
    const slope = (n * h2) / m;
    const chisqs = ld.map((l) => 1 + slope * l);
    const fit = ldscRegression(ld, chisqs, n, m);
    expect(fit.intercept).toBeCloseTo(1, 10);
    expect(fit.slope).toBeCloseTo(slope, 12);
    expect(fit.h2).toBeCloseTo(0.35, 10);
  });

  it('puts confounding in the intercept and leaves heritability alone', () => {
    // The whole claim: a stratification term Na shifts every χ² by the same amount
    // regardless of LD score, so it lands entirely on the intercept.
    const ld = [1, 5, 10, 25, 60];
    const n = 100000;
    const m = 1000000;
    const slope = (n * 0.35) / m;
    const clean = ldscRegression(ld, ld.map((l) => 1 + slope * l), n, m);
    const confounded = ldscRegression(ld, ld.map((l) => 3 + slope * l), n, m);
    expect(confounded.intercept).toBeCloseTo(3, 9);
    expect(confounded.h2).toBeCloseTo(clean.h2, 9);
    // λ_GC would have blamed all of it on the data; the ratio says how much is confounding.
    expect(confounded.ratio).toBeCloseTo(0.738825, 5);
  });

  it('honours the weights', () => {
    const ld = [1, 5, 10, 25, 60];
    const chisqs = [1.1, 1.2, 1.4, 1.9, 3.5];
    const flat = ldscRegression(ld, chisqs, 1e5, 1e6);
    // Weighting the low-LD points heavily must move the fit toward them.
    const tilted = ldscRegression(ld, chisqs, 1e5, 1e6, [100, 100, 1, 1, 1]);
    expect(tilted.slope).not.toBeCloseTo(flat.slope, 6);
    expect(() => ldscRegression([1, 2], [1], 1, 1)).toThrow();
  });
});

describe('meta-analysis', () => {
  const betas = [0.2, 0.14, 0.31, 0.05];
  const ses = [0.05, 0.04, 0.09, 0.06];

  it('pools by inverse variance, to an independently computed answer', () => {
    const r = ivwMeta(betas, ses);
    expect(r.beta).toBeCloseTo(0.154014, 6);
    expect(r.se).toBeCloseTo(0.026479, 6);
    expect(r.z).toBeCloseTo(5.8164, 4);
    expect(r.q).toBeCloseTo(6.9778, 4);
    expect(r.df).toBe(3);
    expect(r.i2).toBeCloseTo(57.01, 2);
    expect(r.tau2).toBeCloseTo(0.004078, 6);
  });

  it('is more precise than any study it pools', () => {
    const r = ivwMeta(betas, ses);
    ses.forEach((s) => expect(r.se).toBeLessThan(s));
    // With k identical studies the SE falls as 1/√k exactly.
    const same = ivwMeta([0.2, 0.2, 0.2, 0.2], [0.05, 0.05, 0.05, 0.05]);
    expect(same.beta).toBeCloseTo(0.2, 12);
    expect(same.se).toBeCloseTo(0.05 / 2, 12);
    expect(same.q).toBeCloseTo(0, 12);
    expect(same.i2).toBe(0);
    expect(same.tau2).toBe(0);
  });

  it('weights by precision, not by count', () => {
    // One precise study and three vague ones: the pooled estimate sits near the precise one.
    const r = ivwMeta([0.5, 0.0, 0.0, 0.0], [0.01, 0.5, 0.5, 0.5]);
    expect(r.beta).toBeGreaterThan(0.49);
  });

  it('reports no heterogeneity when Q is at or below its degrees of freedom', () => {
    const r = ivwMeta([0.20, 0.21, 0.19], [0.05, 0.05, 0.05]);
    expect(r.q).toBeLessThan(r.df);
    expect(r.i2).toBe(0);
    expect(r.tau2).toBe(0);
    expect(() => ivwMeta([1], [])).toThrow();
  });

  it('gives Stouffer a z but no effect size', () => {
    // Equal sample sizes reduce to the plain √k rule.
    expect(stoufferMeta([2, 2, 2, 2], [1000, 1000, 1000, 1000]).z).toBeCloseTo(4, 12);
    // A larger study pulls the combined z toward its own.
    const z = stoufferMeta([4, 0], [90000, 10000]).z;
    expect(z).toBeGreaterThan(3);
    expect(z).toBeLessThan(4);
  });
});

describe("the winner's curse", () => {
  it('matches the truncated-normal expectation', () => {
    const c = 5.4513; // two-sided 5×10⁻⁸
    expect(winnersCurseExpectation(3.0, c)).toBeCloseTo(5.7784, 3);
    expect(winnersCurseExpectation(4.0, c)).toBeCloseTo(5.8974, 3);
    expect(winnersCurseExpectation(5.5, c)).toBeCloseTo(6.2671, 3);
    expect(winnersCurseExpectation(7.0, c)).toBeCloseTo(7.1280, 3);
  });

  it('is worst for effects that only just clear the threshold', () => {
    const c = zThreshold(5e-8);
    const bias = (z: number) => winnersCurseExpectation(z, c) - z;
    expect(bias(3)).toBeGreaterThan(bias(5));
    expect(bias(5)).toBeGreaterThan(bias(7));
    expect(bias(9)).toBeLessThan(0.01);
    // Always upward: conditioning on discovery selects upward fluctuations.
    for (const z of [2, 4, 6, 8]) expect(bias(z)).toBeGreaterThan(0);
  });

  it('inverts the p-value into the z it corresponds to', () => {
    expect(zThreshold(5e-8)).toBeCloseTo(5.4513104378, 6);
    expect(zThreshold(0.05)).toBeCloseTo(1.959964, 5);
  });
});

describe('Bayesian fine-mapping', () => {
  const V = 0.0025; // SE = 0.05
  const W = 0.04;

  it('is the exact reciprocal of the BF₁₀ form', () => {
    for (const z of [0.5, 3, 6.2]) {
      expect(wakefieldAbf(z, V, W) * (1 / wakefieldAbf(z, V, W))).toBeCloseTo(1, 12);
    }
    // Independently evaluated √((V+W)/V)·exp(−z²/2 · W/(V+W)).
    expect(wakefieldAbf(6.2, V, W)).toBeCloseTo(5.7423908688e-8, 16);
    expect(wakefieldAbf(3.0, V, W)).toBeCloseTo(5.9684230117e-2, 10);
    expect(wakefieldAbf(1.2, V, W)).toBeCloseTo(2.0937560648, 8);
  });

  it('supports the null when there is nothing to see', () => {
    // BF₀₁ > 1 means the data favour no effect. z = 0 is the strongest such case.
    expect(wakefieldAbf(0, V, W)).toBeCloseTo(Math.sqrt((V + W) / V), 12);
    expect(wakefieldAbf(0, V, W)).toBeGreaterThan(1);
    // Monotone: stronger evidence, smaller BF₀₁.
    const bfs = [0, 1, 2, 4, 6].map((z) => wakefieldAbf(z, V, W));
    for (let i = 1; i < bfs.length; i += 1) expect(bfs[i]).toBeLessThan(bfs[i - 1]);
  });

  it('lets the PIPs fall short of one at a locus with no signal', () => {
    // This is what the π₀ term buys, and dropping it is the standard error: without a
    // null in the denominator the PIPs are forced to sum to 1, which asserts a causal
    // variant is certainly present.
    const quiet = [1.6, 1.1, 0.7, 0.3].map((z) => wakefieldAbf(z, V, W));
    const priors = [0.25, 0.25, 0.25, 0.25];
    const withNull = pipsFromAbf(quiet, priors, 1);
    const withoutNull = pipsFromAbf(quiet, priors, 0);
    expect(withoutNull.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(withNull.reduce((a, b) => a + b, 0)).toBeCloseTo(0.309884, 6);
    expect(withoutNull[0]).toBeCloseTo(0.450439, 6);
    expect(withNull[0]).toBeCloseTo(0.139584, 6);
    expect(() => pipsFromAbf([1], [0.5, 0.5], 1)).toThrow();
  });

  it('concentrates the posterior on a real signal regardless of the null', () => {
    const loud = [6.2, 5.1, 3.0, 1.2].map((z) => wakefieldAbf(z, V, W));
    const priors = [0.25, 0.25, 0.25, 0.25];
    const pips = pipsFromAbf(loud, priors, 1);
    expect(pips[0]).toBeCloseTo(0.997125, 5);
    // With this much evidence the null prior is irrelevant, which is also the point.
    expect(pipsFromAbf(loud, priors, 0)[0]).toBeCloseTo(0.997126, 5);
  });

  it('builds the smallest set reaching the requested coverage', () => {
    const cs = credibleSet([0.02, 0.60, 0.30, 0.08], 0.95);
    expect(cs.indices).toEqual([1, 2, 3]);
    expect(cs.coverage).toBeCloseTo(0.98, 12);
    // A single dominant variant needs no company.
    expect(credibleSet([0.97, 0.01, 0.01, 0.01], 0.95).indices).toEqual([0]);
    // And a locus with no signal cannot reach 95 % at all — it returns what it has.
    const flat = credibleSet([0.1, 0.08, 0.05], 0.95);
    expect(flat.coverage).toBeCloseTo(0.23, 12);
    expect(flat.indices).toHaveLength(3);
  });

  it('reports purity as the weakest correlation in the set', () => {
    const ld: Matrix = [
      [1.0, 0.98, 0.42],
      [0.98, 1.0, 0.45],
      [0.42, 0.45, 1.0],
    ];
    expect(csPurity([0, 1], ld)).toBeCloseTo(0.98, 12);
    expect(csPurity([0, 1, 2], ld)).toBeCloseTo(0.42, 12);
    expect(csPurity([0], ld)).toBe(1);
  });
});

describe('rare-variant aggregation', () => {
  it('weights rarer variants more, on the Beta(1,25) closed form', () => {
    for (const maf of [0.0001, 0.001, 0.01, 0.05]) {
      expect(betaWeight(maf)).toBeCloseTo(25 * (1 - maf) ** 24, 8);
    }
    expect(betaWeight(0.0001)).toBeCloseTo(24.94006895, 7);
    expect(betaWeight(0.01)).toBeCloseTo(19.64195352, 7);
    // A singleton carries roughly 3.4× the weight of a 5 % variant.
    expect(betaWeight(0.0001) / betaWeight(0.05)).toBeCloseTo(3.416, 2);
  });

  it('shows burden cancelling where SKAT does not', () => {
    // Four rare variants, two raising the trait and two lowering it by the same amount.
    const genotypes: Matrix = [
      [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1],
      [0, 0, 0, 0], [0, 0, 0, 0],
    ];
    const residuals = [2, 2, -2, -2, 0, 0];
    const scores = variantScores(genotypes, residuals);
    expect(scores).toEqual([2, 2, -2, -2]);
    const w = [1, 1, 1, 1];
    // (2 + 2 − 2 − 2)² = 0 — the gene looks completely unassociated.
    expect(burdenStatistic(scores, w)).toBeCloseTo(0, 12);
    // 4 + 4 + 4 + 4 = 16 — squaring first means direction cannot cancel.
    expect(skatQ(scores, w)).toBeCloseTo(16, 12);
  });

  it('reverses the ranking when every variant pushes the same way', () => {
    const scores = [2, 2, 2, 2];
    const w = [1, 1, 1, 1];
    expect(burdenStatistic(scores, w)).toBeCloseTo(64, 12);
    expect(skatQ(scores, w)).toBeCloseTo(16, 12);
    expect(burdenStatistic(scores, w)).toBeGreaterThan(skatQ(scores, w));
  });

  it('interpolates SKAT-O between the two', () => {
    const scores = [2, 2, -2, -2];
    const w = [1, 1, 1, 1];
    expect(skatOQ(scores, w, 0)).toBeCloseTo(skatQ(scores, w), 12);
    expect(skatOQ(scores, w, 1)).toBeCloseTo(burdenStatistic(scores, w), 12);
    expect(skatOQ(scores, w, 0.5)).toBeCloseTo(8, 12);
    expect(() => variantScores([[1, 0]], [1, 2])).toThrow();
  });
});

describe('Mendelian randomization', () => {
  const gamma = [0.1, 0.08, 0.12, 0.06, 0.09];
  const seOutcome = [0.01, 0.009, 0.011, 0.008, 0.01];
  const TRUE_BETA = 0.4;

  it('takes the ratio of the two effects', () => {
    expect(waldRatio(0.1, 0.04)).toBeCloseTo(0.4, 12);
    expect(() => waldRatio(0, 0.04)).toThrow();
  });

  it('scores instrument strength as γ̂²/Var(γ̂)', () => {
    expect(fStatistic(0.1, 0.008)).toBeCloseTo(156.25, 10);
    expect(fStatistic(0.06, 0.006)).toBeCloseTo(100, 10);
    // The rule of thumb: F = 10 means |γ̂/SE| = √10 ≈ 3.16, a t of barely three.
    expect(fStatistic(3.1623, 1)).toBeCloseTo(10, 3);
  });

  it('recovers the causal effect when every instrument is valid', () => {
    const clean = gamma.map((g) => TRUE_BETA * g);
    const r = ivwMr(gamma, clean, seOutcome);
    expect(r.beta).toBeCloseTo(TRUE_BETA, 12);
    expect(r.q).toBeCloseTo(0, 10);
    expect(eggerRegression(gamma, clean, seOutcome).intercept).toBeCloseTo(0, 10);
    expect(eggerRegression(gamma, clean, seOutcome).slope).toBeCloseTo(TRUE_BETA, 10);
    expect(weightedMedianMr(gamma, clean, seOutcome)).toBeCloseTo(TRUE_BETA, 12);
  });

  it('shows that the robust estimators fail in different places — one bad instrument', () => {
    // Four valid instruments and one carrying +0.030 of its own effect on the outcome.
    const outcome = gamma.map((g, i) => TRUE_BETA * g + (i === 4 ? 0.03 : 0));
    const ivw = ivwMr(gamma, outcome, seOutcome);
    expect(ivw.beta).toBeCloseTo(0.4620303769, 8);   // biased away from 0.40
    expect(ivw.q).toBeCloseTo(7.325180, 5);          // and it shows, as heterogeneity

    // Egger looks for an *average* shift and finds none, so it does not help here.
    const egger = eggerRegression(gamma, outcome, seOutcome);
    expect(Math.abs(egger.intercept)).toBeLessThan(0.001);
    expect(egger.slope).toBeCloseTo(0.4574725256, 8);

    // The weighted median does: the bad instrument is a minority of the weight.
    expect(weightedMedianMr(gamma, outcome, seOutcome)).toBeCloseTo(0.4, 10);
  });

  it('and the other way round — pleiotropy on every instrument', () => {
    // Now every instrument carries the same +0.020, so the majority is no longer valid.
    const outcome = gamma.map((g) => TRUE_BETA * g + 0.02);
    expect(ivwMr(gamma, outcome, seOutcome).beta).toBeCloseTo(0.6213285136, 8);
    // The median is no help — it is a median of biased ratios.
    expect(weightedMedianMr(gamma, outcome, seOutcome)).toBeCloseTo(0.6119403415, 8);
    // Egger recovers both the pleiotropy and the truth exactly.
    const egger = eggerRegression(gamma, outcome, seOutcome);
    expect(egger.intercept).toBeCloseTo(0.02, 10);
    expect(egger.slope).toBeCloseTo(TRUE_BETA, 10);
  });

  it('interpolates the weighted median across the crossing point', () => {
    // With equal weights it must reduce to the ordinary median — which is exactly what
    // the half-weight offset in Bowden's definition is there to guarantee.
    expect(weightedMedian([1, 2, 3, 4], [1, 1, 1, 1])).toBeCloseTo(2.5, 12);
    expect(weightedMedian([1, 2, 3], [1, 1, 1])).toBeCloseTo(2, 12);
    expect(weightedMedian([4, 1, 3, 2], [1, 1, 1, 1])).toBeCloseTo(2.5, 12);
    // A dominant weight drags it onto that value.
    expect(weightedMedian([1, 2, 3], [1, 100, 1])).toBeCloseTo(2, 6);
    expect(weightedMedian([5], [1])).toBe(5);
    // Unaffected by an arbitrarily extreme minority, which is the whole point.
    expect(weightedMedian([1, 2, 3, 1e6], [1, 1, 1, 1])).toBeCloseTo(2.5, 12);
  });
});

describe('map functions, inverted', () => {
  it('round-trips Haldane and Kosambi', () => {
    for (const d of [0.001, 0.01, 0.1, 0.5, 1, 2]) {
      expect(haldaneMorgans(haldaneTheta(d))).toBeCloseTo(d, 10);
      expect(kosambiMorgans(kosambiTheta(d))).toBeCloseTo(d, 10);
    }
    for (const theta of [0.001, 0.05, 0.2, 0.45, 0.49]) {
      expect(haldaneTheta(haldaneMorgans(theta))).toBeCloseTo(theta, 12);
      expect(kosambiTheta(kosambiMorgans(theta))).toBeCloseTo(theta, 12);
    }
  });

  it('agrees with θ ≈ d over short distances and diverges over long ones', () => {
    // First-order: both map functions are the identity for small d, so a 1 cM interval
    // is a recombination fraction of 0.01 either way.
    expect(haldaneMorgans(0.01)).toBeCloseTo(0.0101, 4);
    expect(kosambiMorgans(0.01)).toBeCloseTo(0.0100, 4);
    // Kosambi builds in interference, so it always reports a *shorter* map than Haldane
    // for the same observed recombination fraction.
    for (const theta of [0.1, 0.2, 0.3, 0.4]) {
      expect(kosambiMorgans(theta)).toBeLessThan(haldaneMorgans(theta));
    }
  });

  it('sends free recombination to infinite distance', () => {
    expect(haldaneMorgans(0.5)).toBe(Infinity);
    expect(kosambiMorgans(0.5)).toBe(Infinity);
    expect(haldaneMorgans(0)).toBe(0);
    expect(kosambiMorgans(0)).toBe(0);
  });
});

describe('driftVariance', () => {
  it('starts at zero and saturates at p₀q₀', () => {
    expect(driftVariance(0.3, 100, 0)).toBeCloseTo(0, 12);
    expect(driftVariance(0.3, 100, 1e7)).toBeCloseTo(0.3 * 0.7, 10);
  });

  it('is exactly the heterozygosity drift destroys', () => {
    // Var(p_t) = p₀q₀ − H_t/2: the between-population variance created equals the
    // within-population heterozygosity lost. Wahlund's principle.
    for (const [p0, ne, t] of [[0.3, 100, 50], [0.5, 25, 10], [0.1, 1000, 400]]) {
      const h = heterozygosityDecay(2 * p0 * (1 - p0), ne, t);
      expect(driftVariance(p0, ne, t)).toBeCloseTo(p0 * (1 - p0) - h / 2, 12);
    }
  });

  it('accumulates faster in a smaller population', () => {
    expect(driftVariance(0.5, 10, 20)).toBeGreaterThan(driftVariance(0.5, 1000, 20));
    for (const t of [1, 5, 20]) {
      expect(driftVariance(0.5, 100, t + 1)).toBeGreaterThan(driftVariance(0.5, 100, t));
    }
  });
});
