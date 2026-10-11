import { describe, it, expect } from 'vitest';
import { computeLcp, runWfaAlignment, DEFAULT_WFA_PENALTIES } from './wfa';
import { computePairwiseAlignment } from './pairwiseAlignment';

describe('Wavefront Alignment Algorithm (WFA)', () => {
  it('aligns a terminal insertion without returning a false zero-cost success', () => {
    const result = runWfaAlignment('A', 'AA');
    expect(result.finalScore).toBe(4); // gap cost o + length*e = 3 + 1
    expect(result.aligned1.replaceAll('-', '')).toBe('A');
    expect(result.aligned2.replaceAll('-', '')).toBe('AA');
    expect(result.gaps).toBe(1);
  });
  it('computes longest common prefix (LCP) correctly', () => {
    expect(computeLcp('ACGTAGC', 'ACGTCGC', 0, 0)).toBe(4); // ACGT matches ACGT
    expect(computeLcp('ACGTAGC', 'ACGTCGC', 5, 0)).toBe(2); // GC matches GC
    expect(computeLcp('AAAA', 'TTTT', 0, 0)).toBe(0);
  });

  it('aligns identical sequences in step 0 with free LCP extension', () => {
    const res = runWfaAlignment('ACGTACGT', 'ACGTACGT', DEFAULT_WFA_PENALTIES);
    expect(res.finalScore).toBe(0);
    expect(res.identity).toBe(100);
    expect(res.matches).toBe(8);
    expect(res.mismatches).toBe(0);
    expect(res.gaps).toBe(0);
    expect(res.aligned1).toBe('ACGTACGT');
    expect(res.aligned2).toBe('ACGTACGT');
    expect(res.prunedPercentage).toBeGreaterThan(70); // Massively fewer cells evaluated
  });

  it('aligns sequences with single SNP / mismatch', () => {
    const res = runWfaAlignment('ACGTAGCTA', 'ACGTCGCTA', DEFAULT_WFA_PENALTIES);
    expect(res.finalScore).toBe(DEFAULT_WFA_PENALTIES.mismatch);
    expect(res.mismatches).toBe(1);
    expect(res.matches).toBe(8);
    expect(res.gaps).toBe(0);
  });

  it('aligns sequences with deletion / insertion', () => {
    const res = runWfaAlignment('GATTACA', 'GACTTA', DEFAULT_WFA_PENALTIES);
    expect(res.aligned1.length).toBe(res.aligned2.length);
    expect(res.matches).toBeGreaterThan(0);
  });

  it('matches an independent affine DP and faithfully rescores traceback across short sequences', () => {
    const words = ['', 'A', 'C', 'AA', 'AC', 'CA', 'CC', 'ACA', 'AAC', 'CAC', 'ACCC'];
    for (const a of words) for (const b of words) {
      const w = runWfaAlignment(a, b);
      const dp = computePairwiseAlignment(a, b, 'global', 'affine', { match: 0, mismatch: -2, gapOpen: -4, gapExtend: -1 });
      expect(w.finalScore, `${a}/${b}`).toBe(-dp.score || 0);
      expect(w.aligned1.replaceAll('-', '')).toBe(a);
      expect(w.aligned2.replaceAll('-', '')).toBe(b);
      let cost = 0; let previous = '';
      for (let k = 0; k < w.length; k++) {
        const gap = w.aligned1[k] === '-' ? 'I' : w.aligned2[k] === '-' ? 'D' : '';
        cost += gap ? (gap === previous ? 1 : 4) : w.aligned1[k] === w.aligned2[k] ? 0 : 2;
        previous = gap;
      }
      expect(cost, `${a}/${b} traceback`).toBe(w.finalScore);
    }
  });

  it('uses a proven bound rather than a fixed 200-score cap and rejects invalid penalties', () => {
    expect(runWfaAlignment('A'.repeat(101), 'C'.repeat(101)).finalScore).toBe(202);
    expect(() => runWfaAlignment('A', 'C', { mismatch: 0, gapOpen: 3, gapExtend: 1 })).toThrow(/positive/);
    expect(runWfaAlignment('ACGT', 'ACGT').characterComparisons).toBe(4);
  });
});
