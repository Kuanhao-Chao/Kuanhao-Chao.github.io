import { describe, it, expect } from 'vitest';
import { computeLcp, runWfaAlignment, DEFAULT_WFA_PENALTIES } from './wfa';

describe('Wavefront Alignment Algorithm (WFA)', () => {
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
});
