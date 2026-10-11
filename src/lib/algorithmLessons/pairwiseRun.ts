import {
  computePairwiseAlignment,
  alignmentScoreLedger,
  type AlignmentMode,
  type GapModel,
} from '../pairwiseAlignment';
import type { LessonRun, LessonValues, LessonTable } from '../algorithmLessonTypes';
import { numberText, frame } from './common';

export function pairwiseRun(v: LessonValues): LessonRun {
  const result = computePairwiseAlignment(
    v.target,
    v.query,
    v.mode as AlignmentMode,
    v.gap as GapModel,
    {
      match: Number(v.match),
      mismatch: Number(v.mismatch),
      gapOpen: Number(v.open),
      gapExtend: Number(v.extend),
    }
  );
  const frames = result.trace.map((step, index) => {
    const t = frame(
      step.phase,
      `${step.phase}: (${step.i}, ${step.j}), state ${step.state}`,
      step.explanation,
      step.phase === 'initialize'
        ? 0
        : step.phase === 'fill'
          ? 3
          : step.phase === 'traceback'
            ? 5
            : 6,
      [`${step.state}:${step.i}:${step.j}`],
      [
        { label: 'Current score', value: numberText(step.score) },
        { label: 'Trace event', value: String(index + 1) },
      ]
    );
    if (step.phase === 'fill')
      t.predecessors = [
        `M:${step.i - 1}:${step.j - 1}`,
        `M:${step.i - 1}:${step.j}`,
        `M:${step.i}:${step.j - 1}`,
      ];
    if (step.phase === 'done')
      t.result = `${result.aligned1}\n${result.matchLine}\n${result.aligned2}\nScore ${result.score}; ${result.matches} matches, ${result.mismatches} mismatches, ${result.gaps} gap columns.\nTarget [${result.targetStart},${result.targetEnd}); query [${result.queryStart},${result.queryEnd}).`;
    return t;
  });
  const tables: LessonTable[] = (
    v.gap === 'affine' ? (['M', 'I', 'D'] as const) : (['M'] as const)
  ).map((state) => ({
    id: state,
    label: `${state} scores${state === 'M' ? ' (best ending)' : state === 'I' ? ' (consume target)' : ' (consume query)'}`,
    rows: ['∅', ...result.seq1],
    columns: ['∅', ...result.seq2],
    cells: result.matrix.flatMap((row) =>
      row.map((cell) => ({
        id: `${state}:${cell.i}:${cell.j}`,
        row: cell.i,
        column: cell.j,
        value: numberText(result.states[state][cell.i][cell.j]),
        detail:
          state === 'M'
            ? cell.formulaText
            : `${state}[${cell.i},${cell.j}] = ${numberText(result.states[state][cell.i][cell.j])}. ${state === 'I' ? 'Open from M above or extend I above.' : 'Open from M left or extend D left.'}`,
        revealAt: result.trace.findIndex(
          (s) => s.phase !== 'traceback' && s.i === cell.i && s.j === cell.j
        ),
      }))
    ),
  }));
  const done = frames.pop()!;
  const ledger = alignmentScoreLedger(
    result.aligned1,
    result.aligned2,
    result.gapModel,
    result.scoring
  );
  const ledgerAt: number[] = [];
  for (const column of ledger) {
    ledgerAt.push(frames.length);
    frames.push(
      frame(
        'rescore',
        `Column ${column.index + 1}: ${column.event}`,
        `${column.target}/${column.query} contributes ${column.contribution}; cumulative score ${column.total}. This ledger independently rescores the reconstructed columns.`,
        6,
        [0, 1, 2, 3, 4].map((c) => `ledger:${column.index}:${c}`)
      )
    );
  }
  if (Math.abs((ledger.at(-1)?.total ?? 0) - result.score) > 1e-9)
    throw new Error('Traceback failed score verification.');
  frames.push(done);
  tables.push({
    id: 'ledger',
    label: 'Reconstructed alignment score ledger',
    rows: ledger.map((c) => String(c.index + 1)),
    columns: ['target', 'query', 'operation', 'contribution', 'cumulative'],
    cells: ledger.flatMap((column, row) =>
      [column.target, column.query, column.event, column.contribution, column.total].map(
        (value, c) => ({
          id: `ledger:${row}:${c}`,
          row,
          column: c,
          value: String(value),
          detail: `First gap base ${result.scoring.gapOpen}; subsequent same-direction bases ${result.gapModel === 'affine' ? result.scoring.gapExtend : result.scoring.gapOpen}.`,
          revealAt: ledgerAt[row],
        })
      )
    ),
  });
  return { frames, tables };
}
