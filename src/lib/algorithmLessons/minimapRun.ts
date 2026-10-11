import { runCollinearChaining } from '../minimap2';
import type { LessonRun, LessonValues, LessonFrame, LessonTable } from '../algorithmLessonTypes';
import { numberText, frame } from './common';

export function minimapRun(v: LessonValues): LessonRun {
  const result = runCollinearChaining(
    v.target,
    v.query,
    Number(v.w),
    Number(v.k),
    Number(v.distance)
  );
  if (result.anchors.length > 64)
    throw new Error(
      'More than 64 anchors would make the teaching trace unwieldy. Shorten the sequence or increase k/w; nothing was truncated.'
    );
  const frames: LessonFrame[] = [
    frame(
      'initialize',
      'Sparse seeds before alignment',
      'Compute k-mers, sample windows, find anchors, then score ordered chains. All coordinates are starts.',
      0
    ),
  ];
  const tables: LessonTable[] = [];
  for (const [side, kmers, windows] of [
    ['target', result.targetKmers, result.targetWindows],
    ['query', result.queryKmers, result.queryWindows],
  ] as const) {
    const reveal: number[] = [];
    for (const kmer of kmers) {
      reveal.push(frames.length);
      frames.push(
        frame(
          'k-mer',
          `${side} k-mer at ${kmer.pos}`,
          `${kmer.seq}: deterministic display hash ${kmer.hash}.`,
          0,
          [0, 1].map((c) => `${side}:${kmer.pos}:${c}`)
        )
      );
    }
    for (const window of windows)
      frames.push(
        frame(
          'window',
          `${side} window ${window.windowIndex}`,
          `Candidates: ${window.candidates.map((kmer) => `${kmer.seq}@${kmer.pos}=${kmer.hash}`).join(', ')}. Lowest hash selects start ${window.winnerPos}; ties prefer the leftmost. Repeated selections are deduplicated.`,
          1,
          [`${side}:${window.winnerPos}:1`],
          [{ label: 'Window starts', value: `${window.start}…${window.end - 1}` }]
        )
      );
    tables.push({
      id: side,
      label: `${side} k-mers and hashes`,
      rows: kmers.map((kmer) => String(kmer.pos)),
      columns: ['k-mer', 'hash'],
      cells: kmers.flatMap((kmer, row) =>
        [kmer.seq, kmer.hash].map((value, c) => ({
          id: `${side}:${row}:${c}`,
          row,
          column: c,
          value: String(value),
          detail: `${side} ${kmer.seq} at start ${kmer.pos}, hash ${kmer.hash}. Window selection is evaluated in later trace events.`,
          revealAt: reveal[row],
        }))
      ),
    });
  }
  const anchorAt: number[] = [];
  const scoreAt: number[] = [];
  for (const anchor of result.anchors) {
    anchorAt[anchor.id] = frames.length;
    frames.push(
      frame(
        'match',
        `Anchor ${anchor.id}: ${anchor.kmer}`,
        `Exact seed at target ${anchor.x}, query ${anchor.y}. Repeat hits are retained, not called unique mappings.`,
        2,
        [`anchor:${anchor.id}`]
      )
    );
  }
  const candidateCells: LessonTable['cells'] = [];
  for (const s of result.steps) {
    frames.push(
      frame(
        'chain',
        `Start anchor ${s.anchorId} at reward ${result.k}`,
        'Starting a new chain and extending a predecessor are alternative candidates.',
        3,
        [`anchor:${s.anchorId}`]
      )
    );
    for (const c of s.candidates) {
      const detail =
        c.rejection ??
        `Δx=${c.deltaX}, Δy=${c.deltaY}; α=${c.matchBonus}, β=${numberText(c.gapPenalty)}. Candidate=${numberText(c.candidateScore)}. Compare against starting at k=${result.k}.`;
      const at = frames.length;
      const f = frame(
        c.rejection ? 'reject' : 'predecessor',
        `Test ${c.predId} → ${s.anchorId}`,
        detail,
        c.rejection ? 4 : 5,
        [`anchor:${s.anchorId}`, `candidate:${s.anchorId}:${c.predId}`]
      );
      f.predecessors = [`anchor:${c.predId}`];
      frames.push(f);
      candidateCells.push({
        id: `candidate:${s.anchorId}:${c.predId}`,
        row: s.anchorId,
        column: c.predId,
        value: c.rejection ? '×' : numberText(c.candidateScore),
        detail,
        revealAt: at,
        tone: c.rejection ? 'negative' : 'neutral',
      });
    }
    scoreAt[s.anchorId] = frames.length;
    frames.push(
      frame('select', `f(${s.anchorId}) = ${numberText(s.score)}`, s.formulaText, 5, [
        `anchor:${s.anchorId}`,
        `score:${s.anchorId}`,
      ])
    );
  }
  for (const id of [...(result.bestChain?.anchorIds ?? [])].reverse())
    frames.push(
      frame(
        'traceback',
        `Follow anchor ${id}`,
        'Read the selected predecessor pointers backwards, then reverse the chain order.',
        6,
        [`anchor:${id}`]
      )
    );
  const done = frame(
    'done',
    result.bestChain ? 'Best seed chain recovered' : 'No exact shared minimizers',
    'This is a seed chain, not a base-level alignment or a mapping-quality score.',
    6,
    result.bestChain?.anchorIds.map((id) => `anchor:${id}`) ?? []
  );
  done.result = result.bestChain
    ? `Chain anchors: ${result.bestChain.anchorIds.join(' → ')}\nScore ${numberText(result.bestChain.score)}\n${result.bestChain.anchors.map((a) => `${a.kmer}: target ${a.x}, query ${a.y}`).join('\n')}\nUnaligned bases between seeds still require alignment extension.`
    : 'No shared forward-strand minimizer anchors. Try changing k/w, or compare another example. No alignment was inferred.';
  frames.push(done);
  if (result.anchors.length) {
    tables.push({
      id: 'scores',
      label: 'Selected chain score at each anchor',
      rows: result.anchors.map((a) => String(a.id)),
      columns: ['f(i)'],
      cells: result.steps.map((s) => ({
        id: `score:${s.anchorId}`,
        row: s.anchorId,
        column: 0,
        value: numberText(s.score),
        detail: s.formulaText,
        revealAt: scoreAt[s.anchorId],
      })),
    });
    tables.push({
      id: 'candidates',
      label: 'Predecessor candidates (× = rejected)',
      rows: result.anchors.map((a) => `i=${a.id}`),
      columns: result.anchors.map((a) => `j=${a.id}`),
      cells: candidateCells,
    });
  }
  return {
    frames,
    tables,
    charts: [
      {
        id: 'anchors',
        label: 'Seed dot plot: increasing coordinates form a chain',
        xLabel: 'Target seed start',
        yLabel: 'Query seed start',
        xMax: Math.max(1, result.target.length),
        yMax: Math.max(1, result.query.length),
        points: result.anchors.map((a) => ({
          id: `anchor:${a.id}`,
          x: a.x,
          y: a.y,
          label: `Anchor ${a.id} (${a.x},${a.y})`,
          detail: `Exact seed ${a.kmer} at (${a.x},${a.y}); the chain-score table reveals predecessor calculations when evaluated.`,
          revealAt: anchorAt[a.id],
        })),
      },
    ],
  };
}
