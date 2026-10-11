import { computePairwiseAlignment, type AlignmentMode, type GapModel } from './pairwiseAlignment';
import { runWfaAlignment } from './wfa';
import { runAlgorithmDuel } from './algorithmDuel';
import type { LessonRun, LessonValues, LessonFrame, LessonTable } from './algorithmLessonTypes';

export const numberText = (n: number) => n === -Infinity ? '−∞' : n === Infinity ? '∞' : Number.isInteger(n) ? String(n) : n.toFixed(3);
export const frame = (phase: string, title: string, explanation: string, line: number, active: string[] = [], metrics: LessonFrame['metrics'] = []): LessonFrame => ({ phase, title, explanation, line, active, metrics });

function wfaRun(v: LessonValues): LessonRun {
  const result = runWfaAlignment(v.target, v.query, { mismatch: Number(v.mismatch), gapOpen: Number(v.open), gapExtend: Number(v.extend) });
  const frames = result.trace.map((s, index) => frame(s.phase, `${s.type}, penalty ${s.score}, diagonal ${s.k}`, s.explanation,
    s.phase === 'initialize' ? 0 : s.phase === 'extend' ? 4 : s.phase === 'traceback' ? 5 : s.phase === 'done' ? 6 : s.type === 'M' ? 3 : 2,
    [`wf:${index}`, ...[0, 1, 2, 3, 4].map(c => `wf:${index}:${c}`)],
    [{ label: 'Stored state updates', value: String(s.stateUpdates) }, { label: 'Character comparisons', value: String(s.characterComparisons) }, { label: '(i,j)', value: `(${s.i},${s.j})` }]));
  frames.at(-1)!.result = `${result.aligned1}\n${result.matchLine}\n${result.aligned2}\nMinimum cost ${result.finalScore}; ${result.stateUpdates} stored-state updates, ${result.characterComparisons} letter comparisons.\nThese are counts with different definitions, not a speed benchmark.`;
  const table: LessonTable = { id: 'frontier', label: 'Frontier journal: every revealed value comes from this event', hideFutureRows: true, rows: result.trace.map((_, i) => String(i + 1)), columns: ['penalty s', 'diagonal k', 'M / I / D', 'offset i', 'query j'], cells: result.trace.flatMap((s, index) => [s.score, s.k, s.type, s.i, s.j].map((value, c) => ({ id: `wf:${index}:${c}`, row: index, column: c, value: String(value), detail: s.explanation, revealAt: index }))) };
  return { frames, tables: [table], charts: [{ id: 'wavefront', label: 'Recorded wavefront events in prefix-coordinate space', xLabel: 'Query letters consumed j', yLabel: 'Target letters consumed i', xMax: result.seq2.length || 1, yMax: result.seq1.length || 1, points: result.trace.map((s, index) => ({ id: `wf:${index}`, x: s.j, y: s.i, label: `Event ${index + 1}: ${s.type}, s=${s.score}, k=${s.k}`, detail: s.explanation, revealAt: index, tone: s.type === 'M' ? 'positive' as const : 'neutral' as const })) }] };
}
function duelRun(v: LessonValues): LessonRun {
  const result = runAlgorithmDuel(v.target, v.query);
  const dpTrace = result.nwResult.trace.filter(s => s.phase === 'initialize' || s.phase === 'fill');
  const wfTrace = result.wfaResult.trace.filter(s => s.phase !== 'traceback' && s.phase !== 'done');
  const frames = result.steps.map((s, index) => frame('compare', `Recorded event ${index + 1}`, `DP: ${s.nw.activeFormula}\nWFA: ${s.wfa.activeFormula}`, index === 0 ? 0 : 2,
    [`dp:${s.nw.i}:${s.nw.j}`, `duel-wf:${Math.min(index, wfTrace.length - 1)}`],
    [{ label: 'DP prefix updates', value: String(s.nw.cellsEvaluated) }, { label: 'WFA stored-state updates', value: String(s.wfa.cellsEvaluated) }, { label: 'WFA letter comparisons', value: String(wfTrace[Math.min(index, wfTrace.length - 1)].characterComparisons) }]));
  const final = frame('done', 'Equal optimum costs—not a claimed timing winner', result.winnerExplanation, 5);
  final.metrics = [{ label: 'DP cost', value: String(-result.nwResult.score || 0) }, { label: 'WFA cost', value: String(result.wfaResult.finalScore) }];
  final.result = `Affine DP\n${result.nwResult.aligned1}\n${result.nwResult.aligned2}\nCost ${-result.nwResult.score || 0}\n\nWFA\n${result.wfaResult.aligned1}\n${result.wfaResult.aligned2}\nCost ${result.wfaResult.finalScore}\nEqual cost is required; equal traceback strings are not.\nDP prefix updates: ${dpTrace.length}. WFA stored-state updates: ${result.wfaResult.stateUpdates}; comparisons: ${result.wfaResult.characterComparisons}.`;
  frames.push(final);
  return { frames, tables: [{ id: 'duel-dp', label: 'DP best scores (negative cost)', rows: ['∅', ...result.seq1], columns: ['∅', ...result.seq2], cells: result.nwResult.matrix.flatMap(row => row.map(cell => ({ id: `dp:${cell.i}:${cell.j}`, row: cell.i, column: cell.j, value: numberText(cell.score), detail: cell.formulaText, revealAt: dpTrace.findIndex(s => s.i === cell.i && s.j === cell.j) }))) }], charts: [{ id: 'duel-wfa', label: 'WFA recorded prefix events (not an animation clock)', xLabel: 'Query letters consumed', yLabel: 'Target letters consumed', xMax: result.seq2.length || 1, yMax: result.seq1.length || 1, points: wfTrace.map((s, index) => ({ id: `duel-wf:${index}`, x: s.j, y: s.i, label: `${s.type} at score ${s.score}`, detail: s.explanation, revealAt: index })) }] };
}

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
  if (id === 'wfa') return wfaRun(values);
  if (id === 'duel') return duelRun(values);
  throw new Error(`Unknown algorithm lesson: ${id}`);
}
