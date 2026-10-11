import { describe, it, expect } from 'vitest';
import {
  buildDeBruijnGraph,
  clipTips,
  popBubbles,
  filterLowCoverage,
  previewGraphCleaning,
} from './debruijn';

describe('De Bruijn Graph (Eulerian Path Genome Assembly)', () => {
  it('uses distinct-edge topology for unitigs, not coverage-weighted degree', () => {
    const graph = buildDeBruijnGraph(['ATGAC', 'ATGAC'], 3);
    expect(graph.unitigs.map((u) => u.sequence)).toEqual(['ATGAC']);
    expect(graph.unitigs[0].avgCoverage).toBe(2);
  });
  it('constructs De Bruijn graph and reconstructs sequence via Eulerian path', () => {
    const genome = 'TAATGCCATGGGATGTT';
    const graph = buildDeBruijnGraph(genome, 4);

    expect(graph.stats.numNodes).toBeGreaterThan(0);
    expect(graph.stats.numEdges).toBeGreaterThan(0);
    expect(graph.eulerian.isEulerian).toBe(true);
    expect(graph.eulerian.assembledSeq.length).toBe(genome.length);
  });

  it('prunes dead-end error tips via tip clipping', () => {
    // Reads with an error spur at the end
    const reads = ['ATGCGATCG', 'ATGCGATCG', 'ATGCGATTT'];
    const graph = buildDeBruijnGraph(reads, 4);

    const { clippedEdges } = clipTips(graph);
    expect(clippedEdges.length).toBeGreaterThan(0);
  });
  it('does not recursively erase the ends of an ordinary linear contig', () => {
    const graph = buildDeBruijnGraph('ATGAC', 3);
    expect(clipTips(graph, 3).clippedEdges).toEqual([]);
    expect(graph.unitigs[0].sequence).toBe('ATGAC');
  });

  it('collapses heterozygous SNP bubbles via bubble popping', () => {
    // Reads containing a SNP bubble (T vs A) with different coverages
    const reads = [
      'ATGCTAGC',
      'ATGCTAGC', // coverage 2
      'ATGCAAGC', // coverage 1 (bubble)
    ];
    const graph = buildDeBruijnGraph(reads, 4);
    const { poppedEdges } = popBubbles(graph);

    expect(poppedEdges.length).toBeGreaterThan(0);
  });
  it('preserves equal-support alternatives rather than arbitrarily calling one an error', () => {
    const graph = buildDeBruijnGraph(['ATGCTAGC', 'ATGCAAGC'], 4);
    expect(popBubbles(graph).poppedEdges).toEqual([]);
  });

  it('filters low-coverage noise k-mers', () => {
    const reads = ['ACGTACGT', 'ACGTACGT', 'ACGTACGT', 'ACGTNNNN'];
    const graph = buildDeBruijnGraph(reads, 4);
    const { removedEdges } = filterLowCoverage(graph, 2);

    expect(removedEdges.length).toBeGreaterThan(0);
  });

  it('compacts maximal unbranched unitigs and calculates N50', () => {
    const genome = 'AACCGGTTAACCGGTT';
    const graph = buildDeBruijnGraph(genome, 4);

    expect(graph.unitigs.length).toBeGreaterThan(0);
    expect(graph.stats.maxContigLen).toBeGreaterThan(0);
    expect(graph.stats.n50).toBeGreaterThan(0);
  });
  it('records actual Hierholzer consumption and backtracking and separates observed coverage', () => {
    const ideal = buildDeBruijnGraph('ATGAC', 3);
    expect(ideal.eulerian.trace?.filter((t) => t.phase === 'consume')).toHaveLength(3);
    expect(ideal.eulerian.trace?.filter((t) => t.phase === 'backtrack')).toHaveLength(4);
    const observed = buildDeBruijnGraph(['ATGAC', 'ATGAC'], 3, 'coverage');
    expect(observed.eulerian.assembledSeq).toBe('');
    expect(observed.unitigs.map((u) => u.sequence)).toEqual(['ATGAC']);
  });
  it('previews cleaning without changing the original and preserves disconnected cycle unitigs', () => {
    const graph = buildDeBruijnGraph(['ATGCGATCG', 'ATGCGATCG', 'ATGCGATTT'], 4);
    const preview = previewGraphCleaning(graph, 'tips', 3);
    expect(preview.removedEdges.length).toBeGreaterThan(0);
    expect([...graph.edges.values()].every((e) => !e.isRemoved)).toBe(true);
    const disconnected = buildDeBruijnGraph(['ATGAT', 'CCC'], 3);
    expect(disconnected.eulerian.isEulerian).toBe(false);
    expect(disconnected.unitigs.flatMap((u) => u.edges).sort()).toEqual(
      [...disconnected.edges.keys()].sort()
    );
    expect(() => buildDeBruijnGraph('ATGAC', 0)).toThrow(/k/);
  });
});
