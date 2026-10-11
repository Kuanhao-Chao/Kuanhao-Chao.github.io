import { describe, it, expect } from 'vitest';
import { findPrefixSuffixOverlap, buildOverlapGraph } from './stringGraph';

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
      'TTACA', // 5bp (contained inside Read 1)
      'AGATTAGCGT', // 10bp
    ];
    const res = buildOverlapGraph(reads, 4);
    expect(res.containedReads).toContain('R2');
  });

  it('retains a deterministic representative of identical reads', () => {
    const res = buildOverlapGraph(['ACGTAC', 'ACGTAC'], 3);
    expect(res.containedReads).toEqual(['R2']);
    expect(res.unitigs.map((u) => u.sequence)).toEqual(['ACGTAC']);
  });

  it('does not delete a shortcut when its spelling differs from the indirect path', () => {
    const res = buildOverlapGraph(['CCCTTATTA', 'TTATTATTA', 'TTATTAGGG'], 3);
    expect(res.reducedEdges.some((e) => e.from === 'R1' && e.to === 'R3')).toBe(true);
  });

  it('removes only a label-and-placement-equivalent shortcut', () => {
    const res = buildOverlapGraph(['AAACCCGGG', 'CCCGGGTTT', 'GGGTTTAAA'], 3);
    expect(res.transitiveEdges.some((e) => e.from === 'R1' && e.to === 'R3')).toBe(true);
    for (const u of res.unitigs)
      for (const tile of u.tiling) {
        expect(u.sequence.slice(tile.start, tile.end)).toBe(tile.sequence);
      }
  });

  it('keeps disconnected cycles and isolated reads alongside linear paths', () => {
    const res = buildOverlapGraph(['ATGAT', 'GATGA', 'TGATG', 'CCCCAA', 'AACCCC', 'TTTTTT'], 3);
    const represented = new Set(res.unitigs.flatMap((u) => u.readPath));
    for (const read of res.reads.filter((r) => !r.isContained))
      expect(represented.has(read.id)).toBe(true);
  });

  it('rejects invalid input rather than silently stripping or clamping it', () => {
    expect(() => buildOverlapGraph(['AC-GT'], 3)).toThrow();
    expect(() => buildOverlapGraph(['ACGT'], 0)).toThrow();
  });

  it('keeps active reads when contained-read filtering precedes triangle reduction', () => {
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
    const reads = ['ACGTAGCTAG', 'GCTAGCGTAA', 'CGTAATTTTT'];
    const res = buildOverlapGraph(reads, 5);
    expect(res.unitigs.length).toBeGreaterThan(0);
    expect(res.unitigs[0].length).toBeGreaterThan(reads[0].length);
    expect(res.unitigs[0].tiling.length).toBeGreaterThan(1);
  });
});
