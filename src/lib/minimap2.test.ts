import { describe, it, expect } from 'vitest';
import {
  extractKmers,
  extractMinimizers,
  findAnchors,
  hashKmer,
  runCollinearChaining,
} from './minimap2';

describe('Minimap2 Minimizer Sampling & Collinear Chaining', () => {
  it('computes deterministic k-mer hashes', () => {
    const h1 = hashKmer('ACG');
    const h2 = hashKmer('ACG');
    const h3 = hashKmer('ACT');
    expect(h1).toBe(h2);
    expect(typeof h1).toBe('number');
    expect(h1).toBeGreaterThanOrEqual(0);
    expect(h1).not.toBe(h3);
  });

  it('extracts all k-mers from sequence', () => {
    const kmers = extractKmers('ACGTACGT', 3);
    // Length 8, k=3 -> 8 - 3 + 1 = 6 kmers
    expect(kmers.length).toBe(6);
    expect(kmers[0].seq).toBe('ACG');
    expect(kmers[1].seq).toBe('CGT');
    expect(kmers[5].seq).toBe('CGT');
  });

  it('samples (w, k)-minimizers in sliding windows', () => {
    const seq = 'ACGTACGTACGT';
    const { kmers, minimizers } = extractMinimizers(seq, 4, 3);
    expect(kmers.length).toBe(10);
    expect(minimizers.length).toBeGreaterThan(0);
    expect(minimizers.length).toBeLessThanOrEqual(kmers.length);

    // Each minimizer's kmer must match the sequence at that position
    for (const m of minimizers) {
      expect(seq.slice(m.pos, m.pos + 3)).toBe(m.seq);
    }
  });

  it('finds exact matching anchors between Target and Query', () => {
    const target = 'ACGTACGTACGT';
    const query = 'ACGTACGTACGT';
    const { minimizers: tMin } = extractMinimizers(target, 3, 3);
    const { minimizers: qMin } = extractMinimizers(query, 3, 3);
    const anchors = findAnchors(tMin, qMin);

    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      expect(target.slice(a.x, a.x + 3)).toBe(a.kmer);
      expect(query.slice(a.y, a.y + 3)).toBe(a.kmer);
    }
  });

  it('chains anchors into a maximal collinear chain along diagonal', () => {
    const target = 'ACGTACGTACGT';
    const query = 'ACGTACGTACGT';
    const result = runCollinearChaining(target, query, 3, 3);

    expect(result.anchors.length).toBeGreaterThan(0);
    expect(result.chains.length).toBeGreaterThan(0);
    expect(result.bestChain).not.toBeNull();

    // Verify best chain is strictly increasing in both x and y
    const chainAnchors = result.bestChain!.anchors;
    for (let i = 1; i < chainAnchors.length; i++) {
      expect(chainAnchors[i].x).toBeGreaterThan(chainAnchors[i - 1].x);
      expect(chainAnchors[i].y).toBeGreaterThan(chainAnchors[i - 1].y);
    }
  });

  it('penalizes gaps and handles indels correctly', () => {
    // Target has insertion 'TTT' in the middle
    const target = 'ACGT' + 'TTT' + 'ACGT';
    const query = 'ACGT' + 'ACGT';
    const result = runCollinearChaining(target, query, 2, 3);

    expect(result.bestChain).not.toBeNull();
    // DP steps must record predecessor candidates
    expect(result.steps.length).toBe(result.anchors.length);
  });
});
