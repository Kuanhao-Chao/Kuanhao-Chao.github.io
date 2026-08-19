import { describe, it, expect } from 'vitest';
import {
  computeLinearRegression,
  computeLinkageDisequilibrium,
  computeGenomicInflation,
  computeQQQuantiles,
  computePRS,
  runGWAS,
  GWAS_PRESETS,
} from './gwas';

describe('GWAS Statistical Engine', () => {
  describe('computeLinearRegression', () => {
    it('accurately recovers known slope, intercept, and standard error in clean data', () => {
      // y = 2.5 + 0.8 * x + noise
      const x = [0, 0, 1, 1, 2, 2, 0, 1, 2, 0, 1, 2];
      const y = [2.5, 2.4, 3.3, 3.2, 4.1, 4.2, 2.6, 3.4, 4.0, 2.5, 3.3, 4.1];
      const res = computeLinearRegression(x, y);

      expect(res.beta).toBeCloseTo(0.80, 2);
      expect(res.pValue).toBeLessThan(0.0001);
      expect(res.rSquared).toBeGreaterThan(0.95);
      expect(res.se).toBeGreaterThan(0);
      expect(res.tStat).toBeGreaterThan(10);
    });

    it('handles zero variance or small samples gracefully without crashing', () => {
      const x = [1, 1, 1];
      const y = [2, 2, 2];
      const res = computeLinearRegression(x, y);
      expect(res.beta).toBe(0);
      expect(res.pValue).toBe(1);
    });

    it('corrects for covariates using Frisch-Waugh-Lovell residualization', () => {
      const x = [0, 0, 1, 1, 2, 2];
      const pc1 = [1, 1, 2, 2, 3, 3]; // Confounder
      const y = [10, 10, 20, 20, 30, 30]; // Driven purely by pc1

      const unadj = computeLinearRegression(x, y);
      const adj = computeLinearRegression(x, y, [pc1]);

      expect(unadj.beta).toBeGreaterThan(5); // Apparent spurious association
      expect(adj.beta).toBeCloseTo(0, 4);    // Vanishes once PC1 is conditioned out
    });
  });

  describe('computeLinkageDisequilibrium (r²)', () => {
    it('returns r² = 1.0 for identical genotype vectors', () => {
      const g = [0, 1, 2, 0, 1, 2, 1, 0, 2];
      const r2 = computeLinkageDisequilibrium(g, g);
      expect(r2).toBeCloseTo(1.0, 4);
    });

    it('returns r² = 0.0 for orthogonal uncorrelated genotypes', () => {
      const g1 = [0, 0, 2, 2, 0, 0, 2, 2];
      const g2 = [0, 2, 0, 2, 0, 2, 0, 2];
      const r2 = computeLinkageDisequilibrium(g1, g2);
      expect(r2).toBeCloseTo(0.0, 4);
    });
  });

  describe('computeGenomicInflation (λ_GC)', () => {
    it('returns λ_GC ≈ 1.0 for null uniform p-values', () => {
      const pVals: number[] = [];
      for (let i = 1; i <= 500; i++) {
        pVals.push(i / 501);
      }
      const lambda = computeGenomicInflation(pVals);
      expect(lambda).toBeGreaterThan(0.95);
      expect(lambda).toBeLessThan(1.05);
    });

    it('detects elevated λ_GC for inflated test statistics', () => {
      const pVals: number[] = [];
      for (let i = 1; i <= 500; i++) {
        // Skewed towards smaller p-values
        pVals.push(Math.pow(i / 501, 2));
      }
      const lambda = computeGenomicInflation(pVals);
      expect(lambda).toBeGreaterThan(1.5);
    });
  });

  describe('computeQQQuantiles', () => {
    it('produces properly sorted quantiles with confidence envelopes', () => {
      const gwas = runGWAS('t2d');
      const qq = computeQQQuantiles(gwas.snps);

      expect(qq.length).toBe(gwas.snps.length);
      expect(qq[0].observed).toBeGreaterThan(qq[qq.length - 1].observed);
      expect(qq[0].expected).toBeGreaterThan(qq[qq.length - 1].expected);
      expect(qq[0].ciUpper).toBeGreaterThanOrEqual(qq[0].ciLower);
    });
  });

  describe('computePRS', () => {
    it('correctly calculates weighted sum of risk alleles', () => {
      const genotypes = [2, 1, 0, 1];
      const weights = [0.5, 0.3, 0.8, -0.2];
      // 2*0.5 + 1*0.3 + 0*0.8 + 1*(-0.2) = 1.0 + 0.3 + 0 - 0.2 = 1.1
      const prs = computePRS(genotypes, weights);
      expect(prs).toBeCloseTo(1.1, 4);
    });
  });

  describe('Biological GWAS Presets', () => {
    it('includes all 5 canonical presets with valid genomic architectures', () => {
      expect(GWAS_PRESETS.length).toBe(5);
      const ids = GWAS_PRESETS.map((p) => p.id);
      expect(ids).toContain('t2d');
      expect(ids).toContain('ldl');
      expect(ids).toContain('ad');
      expect(ids).toContain('height');
      expect(ids).toContain('stratified');
    });

    it('identifies genome-wide significant lead signals for T2D (TCF7L2)', () => {
      const res = runGWAS('t2d', true);
      expect(res.significantCount).toBeGreaterThan(0);
      const tcf7l2 = res.leadSNPs.find((s) => s.gene === 'TCF7L2');
      expect(tcf7l2).toBeDefined();
      expect(tcf7l2?.negLog10P).toBeGreaterThan(7.3);
    });

    it('demonstrates unadjusted inflation vs adjusted normalization in stratified cohort', () => {
      const unadjusted = runGWAS('stratified', false);
      const adjusted = runGWAS('stratified', true);

      expect(unadjusted.lambdaGC).toBeGreaterThan(adjusted.lambdaGC);
      expect(unadjusted.lambdaGC).toBeGreaterThan(1.3);
      expect(adjusted.lambdaGC).toBeLessThan(1.25);
    });
  });
});
