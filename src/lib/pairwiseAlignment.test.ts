import { describe, it, expect } from 'vitest';
import { computePairwiseAlignment, DEFAULT_SCORING } from './pairwiseAlignment';

describe('Pairwise Alignment Engine', () => {
  it('computes Needleman-Wunsch global alignment for identical sequences', () => {
    const res = computePairwiseAlignment('ACGT', 'ACGT', 'global', 'linear', DEFAULT_SCORING);
    expect(res.score).toBe(8); // 4 matches * 2
    expect(res.identity).toBe(100);
    expect(res.aligned1).toBe('ACGT');
    expect(res.aligned2).toBe('ACGT');
    expect(res.matches).toBe(4);
    expect(res.gaps).toBe(0);
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
