import { buildDeBruijnGraph, previewGraphCleaning } from '../debruijn';
import type { LessonRun, LessonValues, LessonFrame, LessonGraph } from '../algorithmLessonTypes';
import { numberText, frame, graphPositions } from './common';

export function debruijnRun(v: LessonValues): LessonRun {
  const original = buildDeBruijnGraph(
    v.reads.split(/\n/),
    Number(v.k),
    v.mode as 'multiset' | 'coverage'
  );
  if (original.nodes.size > 24)
    throw new Error(
      'This diagram supports at most 24 distinct vertices. Shorten the teaching input; nothing was truncated.'
    );
  const preview = previewGraphCleaning(
    original,
    v.cleaning as 'none' | 'tips' | 'bubbles' | 'coverage',
    Number(v.parameter)
  );
  const graph = preview.graph;
  const edges = [...original.edges.values()];
  const ids = [...original.nodes.keys()];
  const frames: LessonFrame[] = [
    frame(
      'initialize',
      'Declare what the counts mean',
      v.mode === 'multiset'
        ? 'Ideal multiset: each count specifies required edge copies.'
        : 'Observed reads: support counts observations; genomic multiplicity is unknown.',
      1
    ),
  ];
  const at = new Map<string, number>();
  for (const edge of edges) {
    at.set(edge.id, frames.length);
    frames.push(
      frame(
        'construct',
        `${edge.kmer}: ${edge.from} → ${edge.to}`,
        `${edge.coverage} observation(s). ${edge.multiplicity === null ? 'Copy count is unknown, not inferred from coverage.' : `Ideal required copies: ${edge.multiplicity}.`}`,
        0,
        [edge.id, edge.from, edge.to]
      )
    );
  }
  const nodeAt = (id: string) =>
    Math.min(
      ...edges.filter((edge) => edge.from === id || edge.to === id).map((edge) => at.get(edge.id)!)
    );
  const removed: string[] = [];
  for (const id of preview.removedEdges) {
    removed.push(id);
    const f = frame(
      'preview',
      `Preview removing ${original.edges.get(id)!.kmer}`,
      preview.reason,
      2,
      [id]
    );
    f.removed = [...removed];
    frames.push(f);
  }
  const degree = frame(
    'conditions',
    graph.eulerian.statusText,
    `Distinct edges: ${graph.stats.numEdges}. Unitigs use distinct topology; ideal Euler degrees use edge-copy multiplicity.`,
    3
  );
  degree.removed = [...removed];
  frames.push(degree);
  for (const step of graph.eulerian.trace ?? []) {
    const f = frame(
      step.phase,
      step.phase === 'consume'
        ? `Consume ${graph.edges.get(step.edge!)!.kmer}`
        : step.phase === 'backtrack'
          ? `Pop ${step.node} into reverse path`
          : `Start at ${step.node}`,
      `Stack: [${step.stack.join(' → ')}]. Reverse output: [${step.reversePath.join(', ')}].`,
      step.phase === 'consume' ? 4 : 5,
      [step.node, ...(step.edge ? [step.edge] : [])],
      [{ label: 'Consumed edge copies', value: String(step.consumed) }]
    );
    f.removed = [...removed];
    frames.push(f);
  }
  const done = frame(
    'done',
    'Separate reconstruction, unitigs, and uncertainty',
    graph.eulerian.statusText,
    6
  );
  done.removed = [...removed];
  done.result = `Mode: ${v.mode}\n${graph.eulerian.assembledSeq ? `One ideal Euler spelling: ${graph.eulerian.assembledSeq}` : graph.eulerian.statusText}\nUnitigs:\n${graph.unitigs.map((u) => `${u.sequence} (average observed support ${numberText(u.avgCoverage)})`).join('\n') || 'none'}\nPreviewed removals: ${removed.length}. Original input is unchanged.\nUnitig N50 ${graph.stats.n50}; this is a length statistic, not an assembly-quality certificate.`;
  frames.push(done);
  const positions = graphPositions(ids, edges);
  const diagram: LessonGraph = {
    nodes: ids.map((id) => ({
      id,
      label: id,
      ...positions.get(id)!,
      revealAt: nodeAt(id),
      detail: `${id}: a distinct (k−1)-mer vertex. Its incoming and outgoing edges appear as construction advances. Repeated coverage is not a topological branch.`,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      label: e.kmer,
      detail: `${e.kmer}, observed support ${e.coverage}. Cleaning decisions are explained in the later preview events; input observations do not change.`,
      revealAt: at.get(e.id)!,
    })),
  };
  return {
    frames,
    graph: diagram,
    tables: [
      {
        id: 'inventory',
        label: 'Edge inventory: observations versus declared genome copies',
        rows: edges.map((e) => e.kmer),
        columns: ['from', 'to', 'observations', 'ideal copies'],
        cells: edges.flatMap((e, row) =>
          [e.from, e.to, e.coverage, e.multiplicity ?? 'unknown'].map((value, c) => ({
            id: `inventory:${row}:${c}`,
            row,
            column: c,
            value: String(value),
            detail: `${e.kmer}: ${e.from}→${e.to}; ${e.coverage} observed occurrence(s), ideal copies ${e.multiplicity ?? 'unknown'}. No cleaning decision is shown before its preview event.`,
            revealAt: at.get(e.id)!,
          }))
        ),
      },
    ],
  };
}
