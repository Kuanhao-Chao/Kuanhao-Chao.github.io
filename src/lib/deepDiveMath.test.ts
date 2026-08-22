import { describe, expect, it } from 'vitest';
import {
  expectedR2, falconerACE, haldaneTheta, kosambiTheta, ldHalfLife, ldMeasures,
  liabilityScale, ncp, ncpForPower, normalCdf, normalPdf, normalQuantile,
  powerFromNcp, sampleSizeForPower, sampleSizeForR2, shrinkageFactor, varianceExplained,
  acmgClassify, acmgPosterior, auprc, auprcBaseline, auroc, chi2Quantile, lnGamma,
  oeUpperBound, poissonCI, regularizedGammaP, spearman, wilsonInterval,
  cdsLength, cdsPosition, codonOf, complementBase, phylopToP, type Exon,
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
