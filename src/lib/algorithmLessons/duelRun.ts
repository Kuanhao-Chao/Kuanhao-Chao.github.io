import { runAlgorithmDuel } from '../algorithmDuel';
import type { LessonRun, LessonValues } from '../algorithmLessonTypes';
import { numberText, frame } from './common';

export function duelRun(v: LessonValues): LessonRun {
  const result = runAlgorithmDuel(v.target, v.query);
  const dpTrace = result.nwResult.trace.filter(
    (s) => s.phase === 'initialize' || s.phase === 'fill'
  );
  const wfTrace = result.wfaResult.trace.filter(
    (s) => s.phase !== 'traceback' && s.phase !== 'done'
  );
  const frames = result.steps.map((s, index) =>
    frame(
      'compare',
      `Recorded event ${index + 1}`,
      `DP: ${s.nw.activeFormula}\nWFA: ${s.wfa.activeFormula}`,
      index === 0 ? 0 : 2,
      [`dp:${s.nw.i}:${s.nw.j}`, `duel-wf:${Math.min(index, wfTrace.length - 1)}`],
      [
        { label: 'DP prefix updates', value: String(s.nw.cellsEvaluated) },
        { label: 'WFA stored-state updates', value: String(s.wfa.cellsEvaluated) },
        {
          label: 'WFA letter comparisons',
          value: String(wfTrace[Math.min(index, wfTrace.length - 1)].characterComparisons),
        },
      ]
    )
  );
  const final = frame(
    'done',
    'Equal optimum costs—not a claimed timing winner',
    result.winnerExplanation,
    5
  );
  final.metrics = [
    { label: 'DP cost', value: String(-result.nwResult.score || 0) },
    { label: 'WFA cost', value: String(result.wfaResult.finalScore) },
  ];
  final.result = `Affine DP\n${result.nwResult.aligned1}\n${result.nwResult.aligned2}\nCost ${-result.nwResult.score || 0}\n\nWFA\n${result.wfaResult.aligned1}\n${result.wfaResult.aligned2}\nCost ${result.wfaResult.finalScore}\nEqual cost is required; equal traceback strings are not.\nDP prefix updates: ${dpTrace.length}. WFA stored-state updates: ${result.wfaResult.stateUpdates}; comparisons: ${result.wfaResult.characterComparisons}.`;
  frames.push(final);
  return {
    frames,
    tables: [
      {
        id: 'duel-dp',
        label: 'DP best scores (negative cost)',
        rows: ['∅', ...result.seq1],
        columns: ['∅', ...result.seq2],
        cells: result.nwResult.matrix.flatMap((row) =>
          row.map((cell) => ({
            id: `dp:${cell.i}:${cell.j}`,
            row: cell.i,
            column: cell.j,
            value: numberText(cell.score),
            detail: cell.formulaText,
            revealAt: dpTrace.findIndex((s) => s.i === cell.i && s.j === cell.j),
          }))
        ),
      },
    ],
    charts: [
      {
        id: 'duel-wfa',
        label: 'WFA recorded prefix events (not an animation clock)',
        xLabel: 'Query letters consumed',
        yLabel: 'Target letters consumed',
        xMax: result.seq2.length || 1,
        yMax: result.seq1.length || 1,
        points: wfTrace.map((s, index) => ({
          id: `duel-wf:${index}`,
          x: s.j,
          y: s.i,
          label: `${s.type} at score ${s.score}`,
          detail: s.explanation,
          revealAt: index,
        })),
      },
    ],
  };
}
