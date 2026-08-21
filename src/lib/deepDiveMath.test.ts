import { describe, expect, it } from 'vitest';
import {
  expectedR2, falconerACE, haldaneTheta, kosambiTheta, ldHalfLife, ldMeasures,
  liabilityScale, ncp, ncpForPower, normalCdf, normalPdf, normalQuantile,
  powerFromNcp, sampleSizeForPower, sampleSizeForR2, shrinkageFactor, varianceExplained,
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
