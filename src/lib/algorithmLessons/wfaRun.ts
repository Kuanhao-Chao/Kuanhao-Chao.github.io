import { runWfaAlignment } from '../wfa';
import type { LessonRun, LessonValues, LessonTable } from '../algorithmLessonTypes';
import { frame } from './common';

export function wfaRun(v: LessonValues): LessonRun {
  const result = runWfaAlignment(v.target, v.query, {
    mismatch: Number(v.mismatch),
    gapOpen: Number(v.open),
    gapExtend: Number(v.extend),
  });
  const frames = result.trace.map((s, index) =>
    frame(
      s.phase,
      `${s.type}, penalty ${s.score}, diagonal ${s.k}`,
      s.explanation,
      s.phase === 'initialize'
        ? 0
        : s.phase === 'extend'
          ? 4
          : s.phase === 'traceback'
            ? 5
            : s.phase === 'done'
              ? 6
              : s.type === 'M'
                ? 3
                : 2,
      [`wf:${index}`, ...[0, 1, 2, 3, 4].map((c) => `wf:${index}:${c}`)],
      [
        { label: 'Stored state updates', value: String(s.stateUpdates) },
        { label: 'Character comparisons', value: String(s.characterComparisons) },
        { label: '(i,j)', value: `(${s.i},${s.j})` },
      ]
    )
  );
  frames.at(-1)!.result =
    `${result.aligned1}\n${result.matchLine}\n${result.aligned2}\nMinimum cost ${result.finalScore}; ${result.stateUpdates} stored-state updates, ${result.characterComparisons} letter comparisons.\nThese are counts with different definitions, not a speed benchmark.`;
  const table: LessonTable = {
    id: 'frontier',
    label: 'Frontier journal: every revealed value comes from this event',
    hideFutureRows: true,
    rows: result.trace.map((_, i) => String(i + 1)),
    columns: ['penalty s', 'diagonal k', 'M / I / D', 'offset i', 'query j'],
    cells: result.trace.flatMap((s, index) =>
      [s.score, s.k, s.type, s.i, s.j].map((value, c) => ({
        id: `wf:${index}:${c}`,
        row: index,
        column: c,
        value: String(value),
        detail: s.explanation,
        revealAt: index,
      }))
    ),
  };
  return {
    frames,
    tables: [table],
    charts: [
      {
        id: 'wavefront',
        label: 'Recorded wavefront events in prefix-coordinate space',
        xLabel: 'Query letters consumed j',
        yLabel: 'Target letters consumed i',
        xMax: result.seq2.length || 1,
        yMax: result.seq1.length || 1,
        points: result.trace.map((s, index) => ({
          id: `wf:${index}`,
          x: s.j,
          y: s.i,
          label: `Event ${index + 1}: ${s.type}, s=${s.score}, k=${s.k}`,
          detail: s.explanation,
          revealAt: index,
          tone: s.type === 'M' ? ('positive' as const) : ('neutral' as const),
        })),
      },
    ],
  };
}
