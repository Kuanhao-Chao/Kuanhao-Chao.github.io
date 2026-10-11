import { buildOverlapGraph } from '../stringGraph';
import type { LessonRun, LessonValues, LessonFrame } from '../algorithmLessonTypes';
import { frame, graphPositions } from './common';

export function stringGraphRun(v: LessonValues): LessonRun {
  const result = buildOverlapGraph(v.reads, Number(v.overlap));
  const frames: LessonFrame[] = [
    frame(
      'initialize',
      'Reads remain whole vertices',
      'Exact, forward-oriented overlaps; N is literal. No reverse-complement search or error correction.',
      0
    ),
  ];
  const removed: string[] = [];
  const nodeAt = new Map<string, number>();
  const edgeAt = new Map<string, number>();
  for (const read of result.reads) {
    nodeAt.set(read.id, frames.length);
    frames.push(
      frame('read', `${read.id}: ${read.sequence}`, 'A read is a vertex, not a k-mer edge.', 0, [
        read.id,
      ])
    );
  }
  for (const read of result.reads.filter((r) => r.isContained)) {
    removed.push(read.id);
    const f = frame(
      'containment',
      `Retain ${read.containedIn}, remove ${read.id} from topology`,
      'Contained reads add no new extension. Equal copies retain the first representative; the input record remains inspectable.',
      1,
      [read.id, read.containedIn!]
    );
    f.removed = [...removed];
    frames.push(f);
  }
  for (const e of result.rawEdges) {
    edgeAt.set(e.id, frames.length);
    const f = frame(
      'overlap',
      `${e.from} → ${e.to}: overlap ${e.overlapLen}`,
      `Append only ${e.overhang}. The target read starts at source length minus overlap.`,
      2,
      [e.id, e.from, e.to]
    );
    f.removed = [...removed];
    frames.push(f);
  }
  for (const c of result.reductionChecks) {
    if (c.equivalent && !removed.includes(c.direct)) removed.push(c.direct);
    const f = frame(
      'reduction',
      c.equivalent
        ? 'Equivalent extension: preview shortcut removal'
        : 'Triangle alone is not sufficient',
      `Direct appends ${c.directExtension}, shift ${c.directShift}; indirect appends ${c.indirectExtension}, shift ${c.indirectShift}. ${c.equivalent ? 'Both agree.' : 'Keep the direct edge: at least one differs.'}`,
      3,
      [c.direct]
    );
    f.predecessors = [...c.via];
    f.removed = [...removed];
    frames.push(f);
  }
  const rows = result.unitigs.flatMap((u) => u.tiling.map((t) => ({ u, t })));
  const tilingAt: number[] = [];
  for (const [i, { u, t }] of rows.entries()) {
    tilingAt[i] = frames.length;
    const f = frame(
      'layout',
      `${u.id}: place ${t.readId} at [${t.start},${t.end})`,
      `Spelling ${u.sequence}. The placed substring exactly equals ${t.sequence}; this is not a noisy-read consensus call.`,
      4,
      [t.readId, ...[0, 1, 2, 3].map((c) => `tile:${i}:${c}`)]
    );
    f.removed = [...removed];
    frames.push(f);
  }
  const done = frame(
    'done',
    'Nonbranching unitigs, not a guaranteed genome',
    'All disconnected components, isolated reads and cycles are retained. Circular output has an arbitrary linear start and closing overlap.',
    5
  );
  done.removed = [...removed];
  done.result = `Retained reads ${result.stats.numReads}; exact overlaps ${result.rawEdges.length}; equivalent shortcuts removed ${result.transitiveEdges.length}\n${result.unitigs.map((u) => `${u.id}: ${u.sequence}\n  reads ${u.readPath.join(' → ')}`).join('\n')}\nN50 ${result.stats.n50}: length summary, not evidence of correctness.`;
  frames.push(done);
  const pos = graphPositions(
    result.reads.map((r) => r.id),
    result.rawEdges
  );
  return {
    frames,
    graph: {
      nodes: result.reads.map((r) => ({
        id: r.id,
        label: r.id,
        ...pos.get(r.id)!,
        revealAt: nodeAt.get(r.id)!,
        detail: `${r.sequence}; length ${r.length}. Containment is evaluated in the later containment events; read records remain inspectable.`,
      })),
      edges: result.rawEdges.map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        label: `+${e.overhang}`,
        revealAt: edgeAt.get(e.id)!,
        detail: `Overlap ${e.overlapLen}; append ${e.overhang}. Reduction requires an equivalent placement AND spelling.`,
      })),
    },
    tables: [
      {
        id: 'tiling',
        label: 'Exact read placements (zero-based half-open intervals)',
        rows: rows.map(({ u, t }) => `${u.id}/${t.readId}`),
        columns: ['start', 'end', 'read', 'spelled substring'],
        cells: rows.flatMap(({ u, t }, row) =>
          [t.start, t.end, t.sequence, u.sequence.slice(t.start, t.end)].map((value, c) => ({
            id: `tile:${row}:${c}`,
            row,
            column: c,
            value: String(value),
            detail: `Check ${u.id}[${t.start}:${t.end}] = ${t.sequence}.`,
            revealAt: tilingAt[row],
          }))
        ),
      },
    ],
  };
}
