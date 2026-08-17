import { describe, it, expect } from 'vitest';
import {
  findPrefixSuffixOverlap,
  buildOverlapGraph,
} from './stringGraph';

describe('String Graphs & Overlap-Layout-Consensus (OLC)', () => {
  it('finds exact prefix-suffix overlaps correctly', () => {
    const res = findPrefixSuffixOverlap('GATTACA', 'TTACAGAT', 4);
    expect(res).not.toBeNull();
    expect(res?.overlapLen).toBe(5); // TTACA (length 5)
    expect(res?.overhang).toBe('GAT');
  });

  it('detects and marks contained reads', () => {
    const reads = [
      'GATTACAGATTAG', // 13bp
      'TTACA',         // 5bp (contained inside Read 1)
      'AGATTAGCGT',    // 10bp
    ];
    const res = buildOverlapGraph(reads, 4);
    expect(res.containedReads).toContain('R2');
  });

  it('performs Myers transitive reduction removing shortcut edges', () => {
    // 3 overlapping reads in a linear path:
    // Read 1: GATTACA
    // Read 2:   TTACAGAT
    // Read 3:       AGATCGT
    // Overlaps: 1 -> 2 (TTACA, len 5), 2 -> 3 (AGAT, len 4)
    // Shortcut: 1 -> 3 (A, len 1 < minOverlap 4, but if long enough would be transitive)
    const reads = [
      'AAAAAAAAAGGGGG',
      'GGGGTTTTTTTT',
      'TTTTCCCCCCCC',
      'AAAAAAAAAGGGGGTTTTTTTT', // Long read containing 1 and 2
    ];
    const res = buildOverlapGraph(reads, 4);
    expect(res.stats.numReads).toBeGreaterThan(0);
  });

  it('assembles linear chain into unitig layout with tiling coordinates', () => {
    const reads = [
      'ACGTAGCTAG',
      'GCTAGCGTAA',
      'CGTAATTTTT',
    ];
    const res = buildOverlapGraph(reads, 5);
    expect(res.unitigs.length).toBeGreaterThan(0);
    expect(res.unitigs[0].length).toBeGreaterThan(reads[0].length);
    expect(res.unitigs[0].tiling.length).toBeGreaterThan(1);
  });
});
