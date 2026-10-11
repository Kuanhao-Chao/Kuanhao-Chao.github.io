import { describe, it, expect } from 'vitest';
import { computePairwiseAlignment, DEFAULT_SCORING } from './pairwiseAlignment';

describe('Pairwise Alignment Engine', () => {
  it('keeps affine traceback in its gap state so the displayed alignment rescoring equals the optimum', () => {
    const res = computePairwiseAlignment('A', 'AAC', 'global', 'affine');
    expect(res.score).toBe(-2); // One match (+2), one length-two gap (-3-1).
    expect(res.aligned1 === 'A--' || res.aligned1 === '-A-').toBe(true);
    let score = 0;
    let previousGap = '';
    for (let k = 0; k < res.length; k++) {
      const gap = res.aligned1[k] === '-' ? 'I' : res.aligned2[k] === '-' ? 'D' : '';
      score += gap ? (gap === previousGap ? -1 : -3) : (res.aligned1[k] === res.aligned2[k] ? 2 : -1);
      previousGap = gap;
    }
    expect(score).toBe(res.score);
  });
  it('computes Needleman-Wunsch global alignment for identical sequences', () => {
    const res = computePairwiseAlignment('ACGT', 'ACGT', 'global', 'linear', DEFAULT_SCORING);
    expect(res.score).toBe(8); // 4 matches * 2
    expect(res.identity).toBe(100);
    expect(res.aligned1).toBe('ACGT');
    expect(res.aligned2).toBe('ACGT');
    expect(res.matches).toBe(4);
    expect(res.gaps).toBe(0);
  });

  it('fits the whole query into a target substring and does not forgive a query suffix', () => {
    const exact = computePairwiseAlignment('TTACGG', 'AC', 'semiglobal');
    expect(exact.aligned1).toBe('AC');
    expect(exact.aligned2).toBe('AC');
    expect([exact.targetStart, exact.targetEnd]).toEqual([2, 4]);
    const overhang = computePairwiseAlignment('A', 'ACCCCC', 'semiglobal');
    expect(overhang.aligned2.replaceAll('-', '')).toBe('ACCCCC');
    expect(overhang.score).toBe(-13);
  });

  it('handles genuine empty inputs without silently substituting examples', () => {
    expect(computePairwiseAlignment('', 'AC', 'global', 'affine').score).toBe(-4);
    expect(computePairwiseAlignment('', '', 'local').score).toBe(0);
    expect(() => computePairwiseAlignment('A1', 'AC')).toThrow(/letters/);
  });

  it('computes Needleman-Wunsch global alignment with mismatch and indel', () => {
    const res = computePairwiseAlignment('ACGTAGCTA', 'ACGTCGCTA', 'global', 'linear', DEFAULT_SCORING);
    expect(res.aligned1.length).toBe(9);
    expect(res.aligned2.length).toBe(9);
    expect(res.matches).toBe(8);
    expect(res.mismatches).toBe(1);
  });

  it('computes Smith-Waterman local alignment finding maximal local motif', () => {
    const target = 'NNNAGCTAGCNNN';
    const query = 'XXAGCTAGCXX';
    const res = computePairwiseAlignment(target, query, 'local', 'linear', DEFAULT_SCORING);
    expect(res.aligned1).toBe('AGCTAGC');
    expect(res.aligned2).toBe('AGCTAGC');
    expect(res.identity).toBe(100);
    expect(res.score).toBe(14); // 7 * 2
  });

  it('computes Affine Gap alignment penalizing gap extension less than opening', () => {
    const resLinear = computePairwiseAlignment('ACCCCCCGT', 'ACGT', 'global', 'linear', {
      match: 2,
      mismatch: -1,
      gapOpen: -4,
      gapExtend: -1,
    });

    const resAffine = computePairwiseAlignment('ACCCCCCGT', 'ACGT', 'global', 'affine', {
      match: 2,
      mismatch: -1,
      gapOpen: -4,
      gapExtend: -1,
    });

    // In affine model, 5-base gap = -4 + 4*(-1) = -8
    // In linear model with gapOpen=-4, 5-base gap = 5*(-4) = -20
    expect(resAffine.score).toBeGreaterThan(resLinear.score);
  });
});
