import { describe, expect, it } from 'vitest';
import { ghmmRun } from './ghmmRun';

describe('Complete-gene lesson grammar diagram', () => {
  it('shows separate before/after backgrounds, complete exits and no second gene', () => {
    const run = ghmmRun({ dna: 'ATGGCCTAA', duration: '36', end: '9' });
    const graph = run.graph!;
    expect(graph.nodes.map((node) => node.id)).toContain('Before');
    expect(graph.nodes.map((node) => node.id)).toContain('After');
    for (const from of ['Exon_Single', 'Exon_Term'])
      expect(graph.edges.some((edge) => edge.from === from && edge.to === 'After')).toBe(true);
    expect(graph.edges.filter((edge) => edge.from === 'After').map((edge) => edge.to)).toEqual([
      'After',
    ]);
    expect(run.frames.at(-1)?.active).toContain('After');
    for (const frame of run.frames)
      for (const id of frame.active.filter((id) => !id.includes(':')))
        expect(
          graph.nodes.some((node) => node.id === id),
          `missing diagram state ${id}`
        ).toBe(true);
  });

  it('ends the no-gene example in the before-gene background', () => {
    const run = ghmmRun({ dna: 'CCCCCCCCC', duration: '36', end: '9' });
    expect(run.frames.at(-1)?.active).toContain('Before');
  });
});
