import { computePairwiseAlignment, type AlignmentMode, type GapModel } from './pairwiseAlignment';
import type { LessonRun, LessonValues, LessonFrame, LessonTable } from './algorithmLessonTypes';

export const numberText = (n: number) => n === -Infinity ? '−∞' : n === Infinity ? '∞' : Number.isInteger(n) ? String(n) : n.toFixed(3);
export const frame = (phase: string, title: string, explanation: string, line: number, active: string[] = [], metrics: LessonFrame['metrics'] = []): LessonFrame => ({ phase, title, explanation, line, active, metrics });

function pairwiseRun(v: LessonValues): LessonRun {
  const result = computePairwiseAlignment(v.target, v.query, v.mode as AlignmentMode, v.gap as GapModel, {
    match: Number(v.match), mismatch: Number(v.mismatch), gapOpen: Number(v.open), gapExtend: Number(v.extend),
  });
  const frames = result.trace.map((step, index) => {
    const t = frame(step.phase, `${step.phase}: (${step.i}, ${step.j}), state ${step.state}`, step.explanation,
      step.phase === 'initialize' ? 0 : step.phase === 'fill' ? 3 : step.phase === 'traceback' ? 5 : 6,
      [`${step.state}:${step.i}:${step.j}`], [{ label: 'Current score', value: numberText(step.score) }, { label: 'Trace event', value: String(index + 1) }]);
    if (step.phase === 'fill') t.predecessors = [`M:${step.i - 1}:${step.j - 1}`, `M:${step.i - 1}:${step.j}`, `M:${step.i}:${step.j - 1}`];
    if (step.phase === 'done') t.result = `${result.aligned1}\n${result.matchLine}\n${result.aligned2}\nScore ${result.score}; ${result.matches} matches, ${result.mismatches} mismatches, ${result.gaps} gap columns.\nTarget [${result.targetStart},${result.targetEnd}); query [${result.queryStart},${result.queryEnd}).`;
    return t;
  });
  const tables: LessonTable[] = (v.gap === 'affine' ? ['M', 'I', 'D'] as const : ['M'] as const).map(state => ({
    id: state, label: `${state} scores${state === 'M' ? ' (best ending)' : state === 'I' ? ' (consume target)' : ' (consume query)'}`,
    rows: ['∅', ...result.seq1], columns: ['∅', ...result.seq2],
    cells: result.matrix.flatMap(row => row.map(cell => ({
      id: `${state}:${cell.i}:${cell.j}`, row: cell.i, column: cell.j,
      value: numberText(result.states[state][cell.i][cell.j]),
      detail: state === 'M' ? cell.formulaText : `${state}[${cell.i},${cell.j}] = ${numberText(result.states[state][cell.i][cell.j])}. ${state === 'I' ? 'Open from M above or extend I above.' : 'Open from M left or extend D left.'}`,
      revealAt: result.trace.findIndex(s => s.phase !== 'traceback' && s.i === cell.i && s.j === cell.j),
    }))),
  }));
  return { frames, tables };
}
export function runAlgorithmLesson(id: string, values: LessonValues): LessonRun {
  if (id === 'pairwise') return pairwiseRun(values);
  throw new Error(`Unknown algorithm lesson: ${id}`);
}
