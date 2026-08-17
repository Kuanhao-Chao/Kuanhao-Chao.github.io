import { describe, it, expect } from 'vitest';
import {
  buildDeBruijnGraph,
  clipTips,
  popBubbles,
  filterLowCoverage,
} from './debruijn';

describe('De Bruijn Graph (Eulerian Path Genome Assembly)', () => {
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
    const reads = ['ATGCGATCG', 'ATGCGATTT'];
    const graph = buildDeBruijnGraph(reads, 4);

    const { clippedEdges } = clipTips(graph);
    expect(clippedEdges.length).toBeGreaterThan(0);
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
});
