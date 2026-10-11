import { computePairwiseAlignment, type AlignmentMode, type GapModel } from './pairwiseAlignment';
import { runWfaAlignment } from './wfa';
import { runAlgorithmDuel } from './algorithmDuel';
import { buildBwt, bwtBackwardSearch, lfMapping, locateSampled, sampleSuffixArray } from './fmIndex';
import { runCollinearChaining } from './minimap2';
import type { LessonRun, LessonValues, LessonFrame, LessonTable } from './algorithmLessonTypes';

export const numberText = (n: number) => n === -Infinity ? '−∞' : n === Infinity ? '∞' : Number.isInteger(n) ? String(n) : n.toFixed(3);
export const frame = (phase: string, title: string, explanation: string, line: number, active: string[] = [], metrics: LessonFrame['metrics'] = []): LessonFrame => ({ phase, title, explanation, line, active, metrics });

function minimapRun(v: LessonValues): LessonRun {
  const result = runCollinearChaining(v.target, v.query, Number(v.w), Number(v.k), Number(v.distance));
  if (result.anchors.length > 64) throw new Error('More than 64 anchors would make the teaching trace unwieldy. Shorten the sequence or increase k/w; nothing was truncated.');
  const frames: LessonFrame[] = [frame('initialize', 'Sparse seeds before alignment', 'Compute k-mers, sample windows, find anchors, then score ordered chains. All coordinates are starts.', 0)];
  const tables: LessonTable[] = [];
  for (const [side, kmers, windows] of [['target', result.targetKmers, result.targetWindows], ['query', result.queryKmers, result.queryWindows]] as const) {
    const reveal: number[] = [];
    for (const kmer of kmers) { reveal.push(frames.length); frames.push(frame('k-mer', `${side} k-mer at ${kmer.pos}`, `${kmer.seq}: deterministic display hash ${kmer.hash}.`, 0, [0, 1].map(c => `${side}:${kmer.pos}:${c}`))); }
    for (const window of windows) frames.push(frame('window', `${side} window ${window.windowIndex}`, `Candidates: ${window.candidates.map(kmer => `${kmer.seq}@${kmer.pos}=${kmer.hash}`).join(', ')}. Lowest hash selects start ${window.winnerPos}; ties prefer the leftmost. Repeated selections are deduplicated.`, 1, [`${side}:${window.winnerPos}:1`], [{ label: 'Window starts', value: `${window.start}…${window.end - 1}` }]));
    tables.push({ id: side, label: `${side} k-mers and hashes`, rows: kmers.map(kmer => String(kmer.pos)), columns: ['k-mer', 'hash'], cells: kmers.flatMap((kmer, row) => [kmer.seq, kmer.hash].map((value, c) => ({ id: `${side}:${row}:${c}`, row, column: c, value: String(value), detail: `${side} ${kmer.seq} at start ${kmer.pos}, hash ${kmer.hash}. ${windows.filter(w => w.winnerPos === kmer.pos).length} windows select it.`, revealAt: reveal[row] }))) });
  }
  const anchorAt: number[] = []; const scoreAt: number[] = [];
  for (const anchor of result.anchors) { anchorAt[anchor.id] = frames.length; frames.push(frame('match', `Anchor ${anchor.id}: ${anchor.kmer}`, `Exact seed at target ${anchor.x}, query ${anchor.y}. Repeat hits are retained, not called unique mappings.`, 2, [`anchor:${anchor.id}`])); }
  const candidateCells: LessonTable['cells'] = [];
  for (const s of result.steps) {
    frames.push(frame('chain', `Start anchor ${s.anchorId} at reward ${result.k}`, 'Starting a new chain and extending a predecessor are alternative candidates.', 3, [`anchor:${s.anchorId}`]));
    for (const c of s.candidates) {
      const detail = c.rejection ?? `Δx=${c.deltaX}, Δy=${c.deltaY}; α=${c.matchBonus}, β=${numberText(c.gapPenalty)}. Candidate=${numberText(c.candidateScore)}. Compare against starting at k=${result.k}.`;
      const at = frames.length;
      const f = frame(c.rejection ? 'reject' : 'predecessor', `Test ${c.predId} → ${s.anchorId}`, detail, c.rejection ? 4 : 5, [`anchor:${s.anchorId}`, `candidate:${s.anchorId}:${c.predId}`]);
      f.predecessors = [`anchor:${c.predId}`]; frames.push(f);
      candidateCells.push({ id: `candidate:${s.anchorId}:${c.predId}`, row: s.anchorId, column: c.predId, value: c.rejection ? '×' : numberText(c.candidateScore), detail, revealAt: at, tone: c.rejection ? 'negative' : 'neutral' });
    }
    scoreAt[s.anchorId] = frames.length;
    frames.push(frame('select', `f(${s.anchorId}) = ${numberText(s.score)}`, s.formulaText, 5, [`anchor:${s.anchorId}`, `score:${s.anchorId}`]));
  }
  for (const id of [...(result.bestChain?.anchorIds ?? [])].reverse()) frames.push(frame('traceback', `Follow anchor ${id}`, 'Read the selected predecessor pointers backwards, then reverse the chain order.', 6, [`anchor:${id}`]));
  const done = frame('done', result.bestChain ? 'Best seed chain recovered' : 'No exact shared minimizers', 'This is a seed chain, not a base-level alignment or a mapping-quality score.', 6, result.bestChain?.anchorIds.map(id => `anchor:${id}`) ?? []);
  done.result = result.bestChain ? `Chain anchors: ${result.bestChain.anchorIds.join(' → ')}\nScore ${numberText(result.bestChain.score)}\n${result.bestChain.anchors.map(a => `${a.kmer}: target ${a.x}, query ${a.y}`).join('\n')}\nUnaligned bases between seeds still require alignment extension.` : 'No shared forward-strand minimizer anchors. Try changing k/w, or compare another example. No alignment was inferred.'; frames.push(done);
  if (result.anchors.length) {
    tables.push({ id: 'scores', label: 'Selected chain score at each anchor', rows: result.anchors.map(a => String(a.id)), columns: ['f(i)'], cells: result.steps.map(s => ({ id: `score:${s.anchorId}`, row: s.anchorId, column: 0, value: numberText(s.score), detail: s.formulaText, revealAt: scoreAt[s.anchorId] })) });
    tables.push({ id: 'candidates', label: 'Predecessor candidates (× = rejected)', rows: result.anchors.map(a => `i=${a.id}`), columns: result.anchors.map(a => `j=${a.id}`), cells: candidateCells });
  }
  return { frames, tables, charts: [{ id: 'anchors', label: 'Seed dot plot: increasing coordinates form a chain', xLabel: 'Target seed start', yLabel: 'Query seed start', xMax: Math.max(1, result.target.length), yMax: Math.max(1, result.query.length), points: result.anchors.map(a => ({ id: `anchor:${a.id}`, x: a.x, y: a.y, label: `Anchor ${a.id} (${a.x},${a.y})`, detail: `Seed ${a.kmer} at (${a.x},${a.y}). ${result.steps[a.id].formulaText}`, revealAt: anchorAt[a.id] })) }] };
}

function fmRun(v: LessonValues): LessonRun {
  const index = buildBwt(v.reference);
  const search = bwtBackwardSearch(index, v.pattern, { locate: false });
  const samples = sampleSuffixArray(index, Number(v.spacing));
  const frames: LessonFrame[] = [frame('initialize', 'One sentinel, one reference', `Reference ${index.text}. Rows will be sorted lexicographically; coordinates are zero-based.`, 0)];
  const rowAt: number[] = [];
  for (const row of index.rows) {
    rowAt[row.index] = frames.length;
    frames.push(frame('construct', `Sorted suffix row ${row.index}`, `Suffix ${row.suffix}, start SA=${row.sa}; its preceding letter is ${row.l}. First-column letter ${row.f}.`, 1, [0, 1, 2, 3].map(c => `bwt:${row.index}:${c}`)));
  }
  const rankAt = frames.length;
  frames.push(frame('rank', 'Count character blocks and prefix ranks', `C: ${Object.entries(index.cTable).map(([c, n]) => `${c}→${n}`).join(', ')}. Occ(c,r) excludes row r.`, 2));
  for (let row = 0; row < Math.min(index.length, 4); row++) {
    const next = lfMapping(index, row);
    frames.push(frame('LF', `LF(${row}) = ${next}`, `The ${index.bwt[row]} at BWT row ${row} maps to its same occurrence in the first column at row ${next}.`, 5, [`bwt:${row}:2`, `bwt:${next}:1`]));
  }
  for (const s of search.steps) frames.push(frame('search', `Prepend ${s.char}: search suffix ${s.querySuffix}`, `${s.formulaSpText}. ${s.formulaEpText}. ${s.isMatch ? `Inclusive interval [${s.sp},${s.ep}].` : 'The interval is empty: no match.'}`, 3, index.rows.filter(r => r.index >= s.sp && r.index <= s.ep).map(r => `bwt:${r.index}:1`), [{ label: 'sp', value: String(s.sp) }, { label: 'ep', value: String(s.ep) }]));
  const last = search.steps.at(-1);
  const sp = last?.sp ?? 0; const ep = last?.ep ?? index.length - 1;
  frames.push(frame('count', `${search.matchCount} exact matches`, `Count is ${search.matchCount}: inclusive interval width, before locating any coordinates.`, 4));
  const positions: number[] = [];
  if (search.isFound) for (let row = sp; row <= ep; row++) {
    const located = locateSampled(index, row, Number(v.spacing), samples);
    for (const [hop, r] of located.rows.entries()) frames.push(frame('locate', `Locate row ${row}: LF hop ${hop}`, samples.has(r) ? `Reached sampled suffix position ${samples.get(r)} at row ${r}; (${samples.get(r)} + ${hop}) mod ${index.length} = ${located.position}.` : `Row ${r} is not sampled. LF moves to row ${lfMapping(index, r)}.`, samples.has(r) ? 6 : 5, [`bwt:${r}:0`, `bwt:${r}:2`]));
    positions.push(located.position);
  }
  const done = frame('done', 'Count and coordinates agree', 'Suffix-array rows are not text positions. Check the located positions against the reference.', 6);
  done.result = `Reference ${index.text}\nBWT ${index.bwt}\nQuery ${search.pattern || '(empty pattern: all boundaries)'}\nCount ${search.matchCount}\nZero-based positions: ${positions.sort((a, b) => a - b).join(', ') || 'none'}\nSampling spacing ${v.spacing}; samples are chosen by suffix position.`; frames.push(done);
  return { frames, tables: [
    { id: 'bwt', label: 'Sorted suffix rows and BWT', rows: index.rows.map(r => String(r.index)), columns: ['SA (teaching check)', 'First F', 'Last / BWT L', 'Suffix'], cells: index.rows.flatMap(row => [row.sa, row.f, row.l, row.suffix].map((value, c) => ({ id: `bwt:${row.index}:${c}`, row: row.index, column: c, value: String(value), detail: `Row ${row.index}; suffix starts at ${row.sa}. LF=${lfMapping(index, row.index)}. ${samples.has(row.index) ? `Sampled SA=${samples.get(row.index)}.` : 'Not sampled.'}`, revealAt: rowAt[row.index] }))) },
    { id: 'occ', label: 'Occ(c,r): count in BWT[0:r], excluding r', rows: index.alphabet, columns: Array.from({ length: index.length + 1 }, (_, i) => String(i)), cells: index.alphabet.flatMap((c, row) => index.occMatrix[c].map((value, column) => ({ id: `occ:${row}:${column}`, row, column, value: String(value), detail: `Occ(${c},${column})=${value}; C(${c})=${index.cTable[c]}. Prefix excludes index ${column}.`, revealAt: rankAt }))) },
  ] };
}

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
  if (id === 'fm-index') return fmRun(values);
  if (id === 'minimap2') return minimapRun(values);
  throw new Error(`Unknown algorithm lesson: ${id}`);
}
