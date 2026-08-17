import { describe, it, expect } from 'vitest';
import {
  buildBwt,
  bwtBackwardSearch,
  lfMapping,
  recoverOriginalText,
  sanitizeReferenceText,
} from './fmIndex';

describe('FM-Index & BWT core algorithm', () => {
  describe('sanitizeReferenceText', () => {
    it('appends sentinel $ and uppercases input', () => {
      expect(sanitizeReferenceText('banana')).toBe('BANANA$');
      expect(sanitizeReferenceText('GATTACA$')).toBe('GATTACA$');
      expect(sanitizeReferenceText('acgt-123')).toBe('ACGT123$');
      expect(sanitizeReferenceText('')).toBe('BANANA$');
    });
  });

  describe('buildBwt for BANANA$', () => {
    const idx = buildBwt('BANANA$');

    it('constructs correct Suffix Array and BWT column', () => {
      expect(idx.text).toBe('BANANA$');
      expect(idx.length).toBe(7);
      // Suffixes sorted:
      // 0: $ (SA=6) -> L = A
      // 1: A$ (SA=5) -> L = N
      // 2: ANA$ (SA=3) -> L = N
      // 3: ANANA$ (SA=1) -> L = B
      // 4: BANANA$ (SA=0) -> L = $
      // 5: NA$ (SA=4) -> L = A
      // 6: NANA$ (SA=2) -> L = A
      expect(idx.sa).toEqual([6, 5, 3, 1, 0, 4, 2]);
      expect(idx.bwt).toBe('ANNB$AA');
      expect(idx.firstCol).toBe('$AAABNN');
    });

    it('computes correct C table', () => {
      // Alphabet: $, A, B, N
      // Counts: $=1, A=3, B=1, N=2
      // C[$] = 0
      // C[A] = 1
      // C[B] = 1 + 3 = 4
      // C[N] = 4 + 1 = 5
      expect(idx.cTable).toEqual({
        $: 0,
        A: 1,
        B: 4,
        N: 5,
      });
    });

    it('computes correct Occ matrix', () => {
      // BWT: A N N B $ A A
      // Occ(A) at 0..7: [0, 1, 1, 1, 1, 1, 2, 3]
      // Occ(N) at 0..7: [0, 0, 1, 2, 2, 2, 2, 2]
      expect(idx.occMatrix['A']).toEqual([0, 1, 1, 1, 1, 1, 2, 3]);
      expect(idx.occMatrix['N']).toEqual([0, 0, 1, 2, 2, 2, 2, 2]);
    });

    it('LF-mapping correctly links rows from L to F', () => {
      // Row 0 in L is 'A' (1st A in L). In F, first 'A' is at row 1.
      expect(lfMapping(idx, 0)).toBe(1);
      // Row 4 in L is '$' (1st $ in L). In F, '$' is at row 0.
      expect(lfMapping(idx, 4)).toBe(0);
    });

    it('recovers original text via LF-mapping walk', () => {
      expect(recoverOriginalText(idx)).toBe('BANANA$');
    });
  });

  describe('bwtBackwardSearch', () => {
    const idx = buildBwt('BANANA$');

    it('finds single match for BAN', () => {
      const trace = bwtBackwardSearch(idx, 'BAN');
      expect(trace.isFound).toBe(true);
      expect(trace.matchCount).toBe(1);
      expect(trace.finalPositions).toEqual([0]);
      expect(trace.steps.length).toBe(3);
    });

    it('finds multiple occurrences for ANA', () => {
      const trace = bwtBackwardSearch(idx, 'ANA');
      expect(trace.isFound).toBe(true);
      expect(trace.matchCount).toBe(2);
      expect(trace.finalPositions).toEqual([1, 3]);
      expect(trace.steps.length).toBe(3);
    });

    it('correctly handles non-matching pattern XYZ', () => {
      const trace = bwtBackwardSearch(idx, 'XYZ');
      expect(trace.isFound).toBe(false);
      expect(trace.matchCount).toBe(0);
      expect(trace.finalPositions).toEqual([]);
    });

    it('correctly handles pattern with characters in alphabet but not in text as a substring (e.g. NAB)', () => {
      const trace = bwtBackwardSearch(idx, 'NAB');
      expect(trace.isFound).toBe(false);
      expect(trace.matchCount).toBe(0);
    });
  });

  describe('buildBwt for genomic sequence GATTACA$', () => {
    const gattaca = buildBwt('GATTACA$');

    it('recovers GATTACA$', () => {
      expect(recoverOriginalText(gattaca)).toBe('GATTACA$');
    });

    it('finds exact search intervals for ATT and TA', () => {
      const traceATT = bwtBackwardSearch(gattaca, 'ATT');
      expect(traceATT.isFound).toBe(true);
      expect(traceATT.finalPositions).toEqual([1]);

      const traceTA = bwtBackwardSearch(gattaca, 'TA');
      expect(traceTA.isFound).toBe(true);
      expect(traceTA.finalPositions).toEqual([3]);
    });
  });
});
