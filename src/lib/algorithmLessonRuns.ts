import { computePairwiseAlignment, type AlignmentMode, type GapModel } from './pairwiseAlignment';
import { runWfaAlignment } from './wfa';
import { runAlgorithmDuel } from './algorithmDuel';
import { buildBwt, bwtBackwardSearch, lfMapping, locateSampled, sampleSuffixArray } from './fmIndex';
import { runCollinearChaining } from './minimap2';
import { buildDeBruijnGraph, previewGraphCleaning } from './debruijn';
import { buildOverlapGraph } from './stringGraph';
import { createPlan7ModelFromMSA, runViterbi, runForwardBackward, DNA_ALPHABET, PROTEIN_ALPHABET } from './phmm';
import { runGhmmGeneFinder, evaluateDurationScore } from './ghmm';
import { computeIsm, explainSyntheticSpliceScore, DONOR_PWM, ACCEPTOR_PWM } from './ism';
import { simulateTeachingGWAS } from './gwasTeaching';
import type { LessonRun, LessonValues, LessonFrame, LessonTable, LessonGraph } from './algorithmLessonTypes';

export const numberText = (n: number) => n === -Infinity ? '−∞' : n === Infinity ? '∞' : Number.isInteger(n) ? String(n) : n.toFixed(3);
export const frame = (phase: string, title: string, explanation: string, line: number, active: string[] = [], metrics: LessonFrame['metrics'] = []): LessonFrame => ({ phase, title, explanation, line, active, metrics });

function graphPositions(ids: string[], edges: { from: string; to: string }[]): Map<string, { x: number; y: number }> {
  const roots = ids.filter(id => !edges.some(edge => edge.to === id));
  const positions = new Map<string, { x: number; y: number }>();
  if (!roots.length) {
    ids.forEach((id, index) => { const angle = index / Math.max(1, ids.length) * Math.PI * 2 - Math.PI / 2; positions.set(id, { x: 380 + 280 * Math.cos(angle), y: 180 + 125 * Math.sin(angle) }); });
    return positions;
  }
  const levels = new Map<string, number>(); const queue = roots.map(id => ({ id, level: 0 }));
  for (let i = 0; i < queue.length; i++) { const item = queue[i]; if (levels.has(item.id)) continue; levels.set(item.id, item.level); for (const edge of edges.filter(e => e.from === item.id)) if (!levels.has(edge.to)) queue.push({ id: edge.to, level: item.level + 1 }); }
  for (const id of ids) if (!levels.has(id)) levels.set(id, 0);
  const max = Math.max(1, ...levels.values());
  for (let level = 0; level <= max; level++) { const column = ids.filter(id => levels.get(id) === level); column.forEach((id, index) => positions.set(id, { x: 65 + level / max * 630, y: 40 + (index + 1) / (column.length + 1) * 280 })); }
  return positions;
}
function debruijnRun(v: LessonValues): LessonRun {
  const original = buildDeBruijnGraph(v.reads.split(/\n/), Number(v.k), v.mode as 'multiset' | 'coverage');
  if (original.nodes.size > 24) throw new Error('This diagram supports at most 24 distinct vertices. Shorten the teaching input; nothing was truncated.');
  const preview = previewGraphCleaning(original, v.cleaning as 'none' | 'tips' | 'bubbles' | 'coverage', Number(v.parameter));
  const graph = preview.graph; const edges = [...original.edges.values()]; const ids = [...original.nodes.keys()];
  const frames: LessonFrame[] = [frame('initialize', 'Declare what the counts mean', v.mode === 'multiset' ? 'Ideal multiset: each count specifies required edge copies.' : 'Observed reads: support counts observations; genomic multiplicity is unknown.', 1)];
  const at = new Map<string, number>();
  for (const edge of edges) { at.set(edge.id, frames.length); frames.push(frame('construct', `${edge.kmer}: ${edge.from} → ${edge.to}`, `${edge.coverage} observation(s). ${edge.multiplicity === null ? 'Copy count is unknown, not inferred from coverage.' : `Ideal required copies: ${edge.multiplicity}.`}`, 0, [edge.id, edge.from, edge.to])); }
  const nodeAt = (id: string) => Math.min(...edges.filter(edge => edge.from === id || edge.to === id).map(edge => at.get(edge.id)!));
  const removed: string[] = [];
  for (const id of preview.removedEdges) { removed.push(id); const f = frame('preview', `Preview removing ${original.edges.get(id)!.kmer}`, preview.reason, 2, [id]); f.removed = [...removed]; frames.push(f); }
  const degree = frame('conditions', graph.eulerian.statusText, `Distinct edges: ${graph.stats.numEdges}. Unitigs use distinct topology; ideal Euler degrees use edge-copy multiplicity.`, 3); degree.removed = [...removed]; frames.push(degree);
  for (const step of graph.eulerian.trace ?? []) {
    const f = frame(step.phase, step.phase === 'consume' ? `Consume ${graph.edges.get(step.edge!)!.kmer}` : step.phase === 'backtrack' ? `Pop ${step.node} into reverse path` : `Start at ${step.node}`,
      `Stack: [${step.stack.join(' → ')}]. Reverse output: [${step.reversePath.join(', ')}].`, step.phase === 'consume' ? 4 : 5, [step.node, ...(step.edge ? [step.edge] : [])], [{ label: 'Consumed edge copies', value: String(step.consumed) }]); f.removed = [...removed]; frames.push(f);
  }
  const done = frame('done', 'Separate reconstruction, unitigs, and uncertainty', graph.eulerian.statusText, 6);
  done.removed = [...removed]; done.result = `Mode: ${v.mode}\n${graph.eulerian.assembledSeq ? `One ideal Euler spelling: ${graph.eulerian.assembledSeq}` : graph.eulerian.statusText}\nUnitigs:\n${graph.unitigs.map(u => `${u.sequence} (average observed support ${numberText(u.avgCoverage)})`).join('\n') || 'none'}\nPreviewed removals: ${removed.length}. Original input is unchanged.\nUnitig N50 ${graph.stats.n50}; this is a length statistic, not an assembly-quality certificate.`; frames.push(done);
  const positions = graphPositions(ids, edges);
  const diagram: LessonGraph = { nodes: ids.map(id => ({ id, label: id, ...positions.get(id)!, revealAt: nodeAt(id), detail: `${id}: ${edges.filter(e => e.to === id).length} distinct incoming, ${edges.filter(e => e.from === id).length} distinct outgoing edges before preview. Repeated coverage is not a topological branch.` })), edges: edges.map(e => ({ id: e.id, from: e.from, to: e.to, label: e.kmer, detail: `${e.kmer}, observed support ${e.coverage}; ${preview.removedEdges.includes(e.id) ? preview.reason : 'retained'}`, revealAt: at.get(e.id)! })) };
  return { frames, graph: diagram, tables: [{ id: 'inventory', label: 'Edge inventory: observations versus declared genome copies', rows: edges.map(e => e.kmer), columns: ['from', 'to', 'observations', 'ideal copies'], cells: edges.flatMap((e, row) => [e.from, e.to, e.coverage, e.multiplicity ?? 'unknown'].map((value, c) => ({ id: `inventory:${row}:${c}`, row, column: c, value: String(value), detail: `${e.kmer}: ${e.from}→${e.to}. ${preview.removedEdges.includes(e.id) ? preview.reason : 'Retained.'}`, revealAt: at.get(e.id)! }))) }] };
}

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
function stringGraphRun(v: LessonValues): LessonRun {
  const result = buildOverlapGraph(v.reads, Number(v.overlap));
  const frames: LessonFrame[] = [frame('initialize', 'Reads remain whole vertices', 'Exact, forward-oriented overlaps; N is literal. No reverse-complement search or error correction.', 0)];
  const removed: string[] = []; const nodeAt = new Map<string, number>(); const edgeAt = new Map<string, number>();
  for (const read of result.reads) { nodeAt.set(read.id, frames.length); frames.push(frame('read', `${read.id}: ${read.sequence}`, 'A read is a vertex, not a k-mer edge.', 0, [read.id])); }
  for (const read of result.reads.filter(r => r.isContained)) { removed.push(read.id); const f = frame('containment', `Retain ${read.containedIn}, remove ${read.id} from topology`, 'Contained reads add no new extension. Equal copies retain the first representative; the input record remains inspectable.', 1, [read.id, read.containedIn!]); f.removed = [...removed]; frames.push(f); }
  for (const e of result.rawEdges) { edgeAt.set(e.id, frames.length); const f = frame('overlap', `${e.from} → ${e.to}: overlap ${e.overlapLen}`, `Append only ${e.overhang}. The target read starts at source length minus overlap.`, 2, [e.id, e.from, e.to]); f.removed = [...removed]; frames.push(f); }
  for (const c of result.reductionChecks) {
    if (c.equivalent && !removed.includes(c.direct)) removed.push(c.direct);
    const f = frame('reduction', c.equivalent ? 'Equivalent extension: preview shortcut removal' : 'Triangle alone is not sufficient',
      `Direct appends ${c.directExtension}, shift ${c.directShift}; indirect appends ${c.indirectExtension}, shift ${c.indirectShift}. ${c.equivalent ? 'Both agree.' : 'Keep the direct edge: at least one differs.'}`, 3, [c.direct]); f.predecessors = [...c.via]; f.removed = [...removed]; frames.push(f);
  }
  const rows = result.unitigs.flatMap(u => u.tiling.map(t => ({ u, t })));
  const tilingAt: number[] = [];
  for (const [i, {u, t}] of rows.entries()) { tilingAt[i] = frames.length; const f = frame('layout', `${u.id}: place ${t.readId} at [${t.start},${t.end})`, `Spelling ${u.sequence}. The placed substring exactly equals ${t.sequence}; this is not a noisy-read consensus call.`, 4, [t.readId, ...[0,1,2,3].map(c=>`tile:${i}:${c}`)]); f.removed = [...removed]; frames.push(f); }
  const done = frame('done', 'Nonbranching unitigs, not a guaranteed genome', 'All disconnected components, isolated reads and cycles are retained. Circular output has an arbitrary linear start and closing overlap.', 5);
  done.removed = [...removed]; done.result = `Retained reads ${result.stats.numReads}; exact overlaps ${result.rawEdges.length}; equivalent shortcuts removed ${result.transitiveEdges.length}\n${result.unitigs.map(u=>`${u.id}: ${u.sequence}\n  reads ${u.readPath.join(' → ')}`).join('\n')}\nN50 ${result.stats.n50}: length summary, not evidence of correctness.`; frames.push(done);
  const pos = graphPositions(result.reads.map(r=>r.id), result.rawEdges);
  return { frames, graph: { nodes: result.reads.map(r=>({ id:r.id,label:r.id,...pos.get(r.id)!,revealAt:nodeAt.get(r.id)!,detail:`${r.sequence}; length ${r.length}. ${r.isContained ? `Contained in ${r.containedIn}.` : 'Retained.'}` })), edges:result.rawEdges.map(e=>({id:e.id,from:e.from,to:e.to,label:`+${e.overhang}`,revealAt:edgeAt.get(e.id)!,detail:`Overlap ${e.overlapLen}; append ${e.overhang}. Reduction requires an equivalent placement AND spelling.`})) },
    tables:[{id:'tiling',label:'Exact read placements (zero-based half-open intervals)',rows:rows.map(({u,t})=>`${u.id}/${t.readId}`),columns:['start','end','read','spelled substring'],cells:rows.flatMap(({u,t},row)=>[t.start,t.end,t.sequence,u.sequence.slice(t.start,t.end)].map((value,c)=>({id:`tile:${row}:${c}`,row,column:c,value:String(value),detail:`Check ${u.id}[${t.start}:${t.end}] = ${t.sequence}.`,revealAt:tilingAt[row]})))}] };
}
function phmmRun(v: LessonValues): LessonRun {
  const model=createPlan7ModelFromMSA(v.msa,'Teaching profile',v.alphabet==='dna'?DNA_ALPHABET:PROTEIN_ALPHABET);
  const query=v.query.trim().toUpperCase();
  if(model.K>8 || v.msa.trim().split(/\n/).length>6 || query.length>16) throw new Error('Diagram limit: 8 match columns, 6 MSA rows and 16 query residues. Nothing was truncated.');
  const best=runViterbi(model,query),fb=runForwardBackward(model,query);
  const sum=v.mode==='forward';
  const events=sum?fb.events:best.events;
  const frames:LessonFrame[]=[frame('initialize','A global profile core, not full Plan7','Begin consumes nothing. Each M or I emits one query residue; D consumes a profile position silently.',0)];
  const emissionAt:number[]=[];
  for(let k=1;k<=model.K;k++){emissionAt[k]=frames.length;frames.push(frame('model',`Estimate emission at M${k}`,`MSA column ${model.matchColumns[k-1]+1}; pseudocount 0.1 per alphabet letter. ${model.alphabet.map(a=>`${a}:${numberText(model.matchEmissions[k][a])}`).join(', ')}.`,0,[`node:M:${k}`]));}
  const transitionAt=frames.length;
  frames.push(frame('model','Declare normalized transitions and End','Interior M: .85 to next M, .08 to I, .07 to D. Interior I: .6 to next M, .4 to I. D: .7 to next M, .3 to next D. At final column M→End=.92, I→End=.6, D→End=1.',1));
  const reveal=new Map<string,number>();
  for(const event of events){
    const id=`dp:${event.state}:${event.i}:${event.k}`;reveal.set(id,frames.length);
    const operation=sum?'log-sum-exp':'maximum';
    const f=frame('fill',`${event.state}(${event.i},${event.k}) = ${numberText(event.value)}`,event.candidates.length?`${operation} of emission-inclusive candidates: ${event.candidates.map(c=>`${c.state}: ${numberText(c.value)}`).join('; ')}. ${event.state==='D'?'Silent deletion uses the current row to its left.':'Emission consumes one query residue.'}`:'Begin log probability is 0; impossible states are −∞.',event.state==='D'?3:2,[id,`node:${event.state}:${event.k}`]);frames.push(f);
  }
  const posteriorAt=frames.length;
  frames.push(frame('posterior','Backward agrees with Forward at Begin',`log P(query)=${numberText(fb.logLikelihood)}; backward Begin=${numberText(fb.backwardM[0][0])}. M+I occupancy sums to one per emitted residue; silent D occupancy is not added to that sum.`,4));
  for(const step of [...best.viterbiPath].reverse()) frames.push(frame('traceback',`Best path: ${step.stateType}${step.k}`,step.stateType==='D'?'Silent deletion advances profile position, not query.':`Emits query residue ${step.residueIdx}: ${step.char}.`,5,[`node:${step.stateType}:${step.k}`]));
  const done=frame('done','Best path versus total probability','Viterbi explains one most probable path. Forward sums all valid paths; a large posterior is conditional on this declared model, not proof of biological homology.',5);
  done.result=`Query ${query||'(empty)'}\nViterbi log P(path,query) ${numberText(best.logScore)}\nForward log P(query) ${numberText(fb.logLikelihood)}\nBest-path share P(best path | query) ${numberText(Math.exp(best.logScore-fb.logLikelihood))}\nBest path: ${best.viterbiPath.map(s=>`${s.stateType}${s.k}${s.stateType==='D'?'':`:${s.char}`}`).join(' → ')}\nTransitions are fixed priors, not fitted from the MSA.`;frames.push(done);
  const matrices=sum?{M:fb.forwardM,I:fb.forwardI,D:fb.forwardD}:{M:best.matrixM,I:best.matrixI,D:best.matrixD};
  const tables:LessonTable[]=(['M','I','D'] as const).map(state=>({id:`dp-${state}`,label:`${sum?'Forward':'Viterbi'} ${state}: natural-log probabilities`,rows:['0 / ∅',...[...query].map((c,i)=>`${i+1} / ${c}`)],columns:Array.from({length:model.K+1},(_,k)=>String(k)),cells:matrices[state].flatMap((row,i)=>row.map((value,k)=>({id:`dp:${state}:${i}:${k}`,row:i,column:k,value:numberText(value),detail:`${state}(${i},${k}); ${state==='D'?'silent: same query row':'emits: previous query row'}. Value is a natural logarithm.`,revealAt:reveal.get(`dp:${state}:${i}:${k}`)??0})))}));
  tables.push({id:'emissions',label:'Normalized match emissions',rows:Array.from({length:model.K},(_,k)=>`M${k+1}`),columns:model.alphabet,cells:model.matchEmissions.slice(1).flatMap((em,row)=>model.alphabet.map((a,c)=>({id:`em:${row}:${c}`,row,column:c,value:numberText(em[a]),detail:`P(${a}|M${row+1})=${em[a]}; estimated with 0.1 pseudocounts.`,revealAt:emissionAt[row+1]})))});
  for(const [state,matrix] of [['M',fb.posteriorM],['I',fb.posteriorI]] as const) tables.push({id:`posterior-${state}`,label:`Conditional ${state} occupancy; M+I totals 1 across each residue`,rows:[...query].map((c,i)=>`${i+1}/${c}`),columns:Array.from({length:model.K+1},(_,k)=>String(k)),cells:matrix.slice(1).flatMap((row,i)=>row.map((value,k)=>({id:`post:${state}:${i}:${k}`,row:i,column:k,value:numberText(value),detail:`P(emitting state ${state}${k} for residue ${i+1} | query)=${value}.`,revealAt:posteriorAt})))});
  const nodes:LessonGraph['nodes']=[{id:'node:M:0',label:'B',x:35,y:100,revealAt:0,detail:'Begin; M(0,0)=0 only.'}];
  for(let k=0;k<=model.K;k++) for(const state of ['M','I','D'] as const) if(state==='I'||k>0) nodes.push({id:`node:${state}:${k}`,label:`${state}${k}`,x:65+k*600/Math.max(1,model.K),y:state==='M'?100:state==='I'?220:310,revealAt:state==='M'?emissionAt[k]:transitionAt,detail:state==='D'?'Silent deletion; no residue emitted.':state==='I'?'Uniform insertion emission; self-loop consumes one residue each time.':'Match emission estimated from the MSA.'});
  const edges:LessonGraph['edges']=[];
  const add=(from:string,to:string,p:number)=>{if(p)edges.push({id:`transition:${from}:${to}`,from:`node:${from}`,to:`node:${to}`,label:String(p),detail:`Declared transition probability ${p}; not learned from the MSA.`,revealAt:transitionAt});};
  for(let k=0;k<=model.K;k++){add(`M:${k}`,`I:${k}`,model.transitions.MI[k]);add(`I:${k}`,`I:${k}`,model.transitions.II[k]);if(k<model.K){add(`M:${k}`,`M:${k+1}`,model.transitions.MM[k]);add(`M:${k}`,`D:${k+1}`,model.transitions.MD[k]);add(`I:${k}`,`M:${k+1}`,model.transitions.IM[k]);if(k>0){add(`D:${k}`,`M:${k+1}`,model.transitions.DM[k]);add(`D:${k}`,`D:${k+1}`,model.transitions.DD[k]);}}}
  nodes.push({id:'node:E',label:'E',x:730,y:100,revealAt:transitionAt,detail:'End is silent. Only the final profile column can terminate; its transition probability contributes to both Forward and Viterbi.'});
  for (const state of ['M','I','D'] as const) edges.push({id:`end:${state}`,from:`node:${state}:${model.K}`,to:'node:E',label:String(model.endProbabilities[state]),revealAt:transitionAt,detail:'Terminal probability is included in the score.'});
  return{frames,tables,graph:{nodes,edges}};
}
function ghmmRun(v:LessonValues):LessonRun {
  const r=runGhmmGeneFinder(v.dna,Number(v.duration));
  const end=Number(v.end);
  if(end>r.sequence.length)throw new Error('Candidate endpoint exceeds the DNA length. Endpoints are prefix lengths, from 1 through L.');
  const candidates=r.candidates.filter(c=>c.end===end);
  const frames:LessonFrame[]=[frame('initialize','Declare a restricted complete-gene grammar','One forward-strand gene or no gene; introns include GT…AG. Handcrafted weighted scores are not calibrated likelihoods.',0)];
  const modelAt=frames.length;
  frames.push(frame('duration','Normalize bounded durations',`Maximum segment length ${r.durationLimit}. Duration weights normalize on each state’s declared support; changing the bound renormalizes them.`,1));
  const candidateAt:number[]=[];
  for(const [i,c] of candidates.entries()){
    candidateAt[i]=frames.length;
    const f=frame(c.valid?'candidate':'reject',`${c.state} [${c.start},${c.end}) from ${c.previous}`,`${c.reason} Pending codon: ${c.pendingBefore||'∅'} → ${c.pendingAfter||'∅'}. ${c.valid?`Total ${numberText(c.total)} = predecessor + transition ${numberText(c.transitionScore)} + duration ${numberText(c.durationScore)} + sensor ${numberText(c.sensorScore)}. ${c.selected?'Improved its destination when evaluated.':'Did not improve its destination.'}`:'This candidate cannot contribute to an optimum.'}`,c.valid?3:2,[...Array.from({length:6},(_,col)=>`candidate:${i}:${col}`),c.state]);frames.push(f);
  }
  frames.push(frame('terminate','Only complete genes may terminate','Unfinished exon/intron states are excluded. Compare a complete start-to-stop path with the no-gene alternative after explaining the full region.',4));
  const featureAt:number[]=[];
  for(const [i,f] of r.features.entries()){featureAt[i]=frames.length;frames.push(frame('traceback',`${f.subType}: ${f.start}…${f.end}`,`1-based inclusive coordinates; local score ${numberText(f.score)}. ${f.type==='intron'?'Both GT donor and AG acceptor remain intronic.':f.type==='exon'?`Carry-in partial-codon length ${f.readingFrame}; append ${f.sequence} to spliced CDS.`:'Intergenic flank is not translated.'}`,5,[f.subType,...Array.from({length:4},(_,c)=>`feature:${i}:${c}`)]));}
  const done=frame('done',r.cdsSequence?'Complete coding path recovered':'No complete gene beats the background','Transcript codons, not genomic position modulo 3, determine translation. Every selected CDS starts ATG, ends in-frame at a stop, and contains no earlier in-frame stop.',5);
  done.result=`DNA ${r.sequence}\nSpliced CDS ${r.cdsSequence||'none'}\nProtein ${r.proteinTranslation||'none'} (terminal stop not included)\nWeighted score ${numberText(r.totalScore)}\n${r.exonCount} exons, ${r.intronCount} introns\nShown candidates end at prefix ${end}; ${r.candidates.length} segment/predecessor candidates were tested in the full computation.`;frames.push(done);
  const grammar=[['Intergenic',65,90],['Exon_Init',255,60],['Exon_Single',255,280],['Intron',430,130],['Exon_Int',580,55],['Exon_Term',650,240]] as const;
  return{frames,graph:{nodes:grammar.map(([id,x,y])=>({id,label:id.replace('Exon_',''),x,y,revealAt:0,detail:id==='Intron'?'Canonical GT…AG belongs inside the intron; preserve pending coding bases across it.':id==='Intergenic'?'Before-gene and after-gene backgrounds are distinct internal states, so a second gene cannot start.':'Coding state carries 0, 1 or 2 pending bases; the actual letters are retained, not just the phase.'})),edges:[['Intergenic','Exon_Init','.01'],['Intergenic','Exon_Single','.01'],['Exon_Init','Intron','1'],['Intron','Exon_Int','.5'],['Exon_Int','Intron','1'],['Intron','Exon_Term','.5']].map(([from,to,label],i)=>({id:`grammar:${i}`,from,to,label,revealAt:0,detail:'Grammar transition. Complete terminal/single exons lead to after-gene background; unfinished states cannot end.'}))},
    tables:[{id:'candidates',label:`All reachable predecessor/duration tests ending at prefix ${end}`,hideFutureRows:true,rows:candidates.map((_,i)=>String(i+1)),columns:['state','start','pending before→after','log duration','sensor reward','candidate score'],cells:candidates.flatMap((c,row)=>[c.state,c.start,`${c.pendingBefore||'∅'}→${c.pendingAfter||'∅'}`,numberText(c.durationScore),numberText(c.sensorScore),c.valid?numberText(c.total):'reject'].map((value,col)=>({id:`candidate:${row}:${col}`,row,column:col,value:String(value),detail:c.reason,revealAt:candidateAt[row],tone:c.valid?'neutral' as const:'negative' as const})))},
      {id:'features',label:'Selected features: 1-based inclusive coordinates, local score contributions',rows:r.features.map(f=>f.id),columns:['type','start','end','sequence'],cells:r.features.flatMap((f,row)=>[f.subType,f.start,f.end,f.sequence].map((value,col)=>({id:`feature:${row}:${col}`,row,column:col,value:String(value),detail:`Local score ${numberText(f.score)}, length ${f.length}; ${f.type==='exon'?`pending base count ${f.readingFrame}`:'not translated'}.`,revealAt:featureAt[row]})))},
      {id:'duration',label:'Normalized duration probabilities (shortened teaching distributions, not real exon lengths)',rows:['Exon_Init','Exon_Int','Exon_Term','Exon_Single','Intron'],columns:Array.from({length:r.durationLimit},(_,i)=>String(i+1)),cells:(['Exon_Init','Exon_Int','Exon_Term','Exon_Single','Intron'] as const).flatMap((state,row)=>Array.from({length:r.durationLimit},(_,i)=>({id:`duration:${row}:${i}`,row,column:i,value:numberText(Math.exp(evaluateDurationScore(state,i+1,r.durationLimit))),detail:`P(duration=${i+1} | ${state}) on the declared bounded support.`,revealAt:modelAt})))}]};
}
function ismRun(v:LessonValues):LessonRun {
  const r=computeIsm(v.sequence,v.type as 'donor'|'acceptor',Number(v.junction));
  const terms=explainSyntheticSpliceScore(r.sequence,r.junctionIndex,r.siteType);
  const frames:LessonFrame[]=[frame('initialize','Declare the exact synthetic scorer','Handwritten position weights → log-odds sum → logistic transform → core gate → clip to [0.01,0.99]. This is not neural inference or a clinical probability.',0)];
  const weightAt:number[]=[];
  for(const [i,c] of terms.contributions.entries()){weightAt[i]=frames.length;frames.push(frame('score',`Position ${c.index}: weight ${c.weight}`,`Base ${c.base}; log₂(max(weight,0.001)/0.25)=${numberText(c.logOdds)}.`,1,[...['A','C','G','T'].map((_,row)=>`weight:${row}:${i}`)]));}
  frames.push(frame('reference',`Reference f(x)=${numberText(r.primaryRefScore)}`,`Log-odds sum ${numberText(terms.logOdds)}; core multiplier ${terms.gate}. Position labels skip zero at the junction boundary.`,2,[],[{label:'Scorer evaluations',value:'1'}]));
  const cells:LessonTable['cells']=[];const importanceAt:number[]=[];
  let evaluated=1;
  for(const p of r.positions){
    for(const [row,base] of ['A','C','G','T'].entries()){
      const mutation=p.mutations[base],reference=base===p.refBase;const at=frames.length;
      if(!reference)evaluated++;
      frames.push(frame(reference?'reference base':'mutation',`${p.positionLabel} ${p.refBase}→${base}`,reference?'Reference base is copied, not recomputed. Δ=0.':`f(mutant)=${numberText(mutation.score)}; Δ=f(mutant)−f(reference)=${numberText(mutation.delta)}. Negative = synthetic score loss; positive = gain. Preview does not change the sequence.`,3,[`mutation:${row}:${p.index}`],[{label:'Scorer evaluations',value:String(evaluated)}]));
      cells.push({id:`mutation:${row}:${p.index}`,row,column:p.index,value:reference?'ref 0':(mutation.delta>0?'+':'')+numberText(mutation.delta),detail:`${p.positionLabel} (zero-based index ${p.index}) ${p.refBase}→${base}; mutant score ${mutation.score.toFixed(6)}, reference ${r.primaryRefScore.toFixed(6)}, signed Δ ${mutation.delta.toFixed(6)}. ${reference?'This is already the reference base.':'Select Apply to make it the new reference.'}`,revealAt:at,tone:mutation.delta< -1e-12?'negative':mutation.delta>1e-12?'positive':'neutral',...(reference?{}:{mutation:{position:p.index,base}})});
    }
    importanceAt[p.index]=frames.length;
    frames.push(frame('importance',`Mean absolute change at ${p.positionLabel}`,`(|Δ₁|+|Δ₂|+|Δ₃|)/3 = ${numberText(p.importance)}. Both gain and loss contribute; this is model sensitivity, not biological causality.`,4,[`importance:${p.index}`]));
  }
  const done=frame('done','Inspect, preview, then explicitly apply','Apply starts a new reference and recomputes all deltas. Undo restores the previous sequence; Reset reference restores the submitted example.',5);
  done.result=`Synthetic ${r.siteType} scorer\nReference ${r.sequence.slice(0,r.junctionIndex)}|${r.sequence.slice(r.junctionIndex)}\nf(reference) ${r.primaryRefScore.toFixed(6)}\nScorer evaluations ${r.evaluations} = 1 reference + 3 × ${r.sequence.length} alternatives\nHighest mean absolute Δ at ${r.mostSensitivePosition.label}: ${r.mostSensitivePosition.importance.toFixed(6)}\nNo checkpoint, calibrated probability, clinical classification or causal inference.`;frames.push(done);
  const pwm=r.siteType==='donor'?DONOR_PWM:ACCEPTOR_PWM;
  return{frames,tables:[{id:'mutations',label:'Signed score changes: loss (red), gain (green); reference cells are zero',rows:['A','C','G','T'],columns:r.positions.map(p=>`${p.positionLabel}/${p.refBase}`),cells},{id:'weights',label:'Every handwritten model weight; columns are zero-based genomic indices',rows:['A','C','G','T'],columns:terms.contributions.map(c=>String(c.index)),cells:pwm.flatMap((weights,c)=>['A','C','G','T'].map((base,row)=>({id:`weight:${row}:${c}`,row,column:c,value:String(weights[base]),detail:'Fixed teaching weight, not estimated from human data. Zero weights are floored at .001 in log-odds.',revealAt:weightAt[c]})))}],
    charts:[{id:'importance',label:'Mean absolute alternative score change (not a pathogenicity score)',xLabel:'Zero-based sequence index',yLabel:'Mean absolute Δ',xMax:r.sequence.length-1,yMax:Math.max(.01,r.maxImportance),points:r.positions.map(p=>({id:`importance:${p.index}`,x:p.index,y:p.importance,label:`Position ${p.positionLabel}`,detail:`Mean absolute Δ ${p.importance.toFixed(6)}. Positions outside this handwritten scoring window have exactly zero effect by construction.`,revealAt:importanceAt[p.index]}))}]};
}
function gwasRun(v:LessonValues):LessonRun {
  const r=simulateTeachingGWAS({seed:Number(v.seed),n:Number(v.n),scenario:v.scenario as 'null'|'causal'|'stratified',adjustment:Number(v.adjust) as 0|1|2,lead:Number(v.lead)});
  const lead=r.variants[Number(v.lead)-1];
  const frames:LessonFrame[]=[frame('initialize','Seeded genotypes and actual sample counts',`Training N=${r.cohort.length}; independent test N=${r.validation.length}; 32 synthetic markers in eight LD blocks. IDs and coordinates are fictional.`,0)];
  const cohortAt=frames.length;
  frames.push(frame('cohort','Generate dosage and quantitative phenotype',r.options.scenario==='causal'?'Ground truth: phenotype = 0.9×sim06 dosage + Gaussian noise.':r.options.scenario==='stratified'?'Ground truth: phenotype = 3×(latent group−0.5) + Gaussian noise; no direct genetic effect.':'Ground truth: independent Gaussian phenotype; no direct genetic effect.',0));
  const pcAt=frames.length;
  frames.push(frame('PCA','Compute PCs from standardized genotype columns',`Explained genotype variance: PC1 ${(r.pcVariance[0]*100).toFixed(1)}%, PC2 ${(r.pcVariance[1]*100).toFixed(1)}%. Fit ${v.adjust} PCs as covariates jointly with the intercept; do not force any inflation factor to one.`,1));
  const variantAt:number[]=[];
  for(const variant of r.variants){variantAt[variant.index]=frames.length;frames.push(frame('regression',`${variant.id}: β=${numberText(variant.fit.beta)}`,`N=${variant.fit.n}; rank=${variant.fit.rank}; df=${variant.fit.df}; SE=${numberText(variant.fit.se)}; t=${numberText(variant.fit.tStat)}; two-sided Student-t p=${variant.fit.pValue.toExponential(3)}. ${variant.fit.identifiable?'Covariates were projected jointly using reorthogonalized QR.':'Variant is not identifiable after adjustment; p=1, not a discovered signal.'}`,2,[`manhattan:${variant.index}`,...[0,1,2,3,4].map(c=>`variant:${variant.index}:${c}`)]));}
  const qqAt=frames.length;
  frames.push(frame('diagnostics','Inspect distribution, not just tallest peaks',`Approximate λ diagnostic: median(t²)/0.454936 = ${numberText(r.lambda)}. With 32 dependent tests and finite df, it is noisy and not proof of adequate confounding control. QQ ranks all actual fitted p-values.`,3));
  const ldAt:number[]=[];
  for(const variant of r.variants){ldAt[variant.index]=frames.length;frames.push(frame('LD',`${variant.id} versus lead ${lead.id}`,`Measured dosage r²=${numberText(variant.ld)} in the same training cohort. Selecting a different lead recomputes LD but preserves seeded genotypes and association fits.`,4,[`ld:${variant.index}`,`regional:${variant.index}`]));}
  const predictionAt=frames.length;
  frames.push(frame('prediction','Train-only block-pruned score; independent test',`Choose one smallest-p marker per known simulated block using training only. Fit weights before seeing test outcomes. Predictive R²: training ${numberText(r.prs.train.predictiveR2)}, independent test ${numberText(r.prs.test.predictiveR2)}. Negative test R² is possible.`,5));
  const done=frame('done','Association ≠ causality ≠ prediction','A synthetic peak can be causal, a correlated proxy, confounded or chance. The demo does not perform fine-mapping, a mixed model, or clinical risk assessment.',6);
  done.result=`Seed ${v.seed}; ${r.cohort.length} training and ${r.validation.length} independent test individuals\n32 OLS tests; adjustment ${v.adjust} genotype PCs\nLead ${lead.id}: β=${numberText(lead.fit.beta)}, SE=${numberText(lead.fit.se)}, p=${lead.fit.pValue.toExponential(4)}\nBonferroni teaching threshold 0.05/32=${(.05/32).toExponential(3)}; ${r.variants.filter(x=>x.fit.pValue<.05/32).length} pass. Not the conventional 5×10⁻⁸ human-GWAS threshold.\nBlock-pruned score weights: ${r.prs.weights.map(w=>`${r.variants[w.index].id}:${numberText(w.weight)}`).join(', ')}\nPredictive R² train ${numberText(r.prs.train.predictiveR2)}, test ${numberText(r.prs.test.predictiveR2)}\nTest MSE ${numberText(r.prs.test.mse)}; squared prediction/outcome correlation ${numberText(r.prs.test.correlationR2)} (a different metric).`;frames.push(done);
  const action=(index:number)=>({input:'lead',value:String(index+1)});
  const tables:LessonTable[]=[
    {id:'cohort',label:'Actual training cohort: latent labels are simulated, PCs are genotype-derived',rows:r.cohort.map(i=>i.id),columns:['synthetic group','phenotype','PC1','PC2',...r.variants.map(s=>s.id)],cells:r.cohort.flatMap((individual,row)=>[individual.group,numberText(individual.phenotype),numberText(r.pcs[0][row]),numberText(r.pcs[1][row]),...individual.genotypes].map((value,col)=>({id:`cohort:${row}:${col}`,row,column:col,value:String(value),detail:`Individual ${individual.id}; all association calculations use these observed simulated values.`,revealAt:col===2||col===3?pcAt:cohortAt})))},
    {id:'variants',label:'Actual per-marker fits; activate a revealed cell to select the LD lead',rows:r.variants.map(s=>s.id),columns:['β','SE','t','two-sided p','MAF'],cells:r.variants.flatMap((s,row)=>[numberText(s.fit.beta),numberText(s.fit.se),numberText(s.fit.tStat),s.fit.pValue.toExponential(3),numberText(s.maf)].map((value,col)=>({id:`variant:${row}:${col}`,row,column:col,value:String(value),detail:`${s.id}; chromosome ${s.chromosome}, fictional position ${s.position}. N=${s.fit.n}, df=${s.fit.df}; activate to choose as LD lead.`,revealAt:variantAt[row],action:action(row)})))}
  ];
  const range=(values:number[])=>({min:Math.min(0,...values),max:Math.max(.01,...values)});
  const pcX=range(r.pcs[0]),pcY=range(r.pcs[1]),fitX=range(lead.fit.residualX),fitY=range(lead.fit.residualY);
  const pMax=Math.max(-Math.log10(.05/32)+1,...r.variants.map(s=>s.negLog10P))+1;
  const predictions=r.prs.test.predictions,predX=range(predictions),predY=range(r.validation.map(i=>i.phenotype));
  return{frames,tables,charts:[
    {id:'pca',label:'Genotype PCA: green group 1, red group 0 (synthetic labels)',xLabel:'PC1 genotype score',yLabel:'PC2 genotype score',xMin:pcX.min,xMax:pcX.max,yMin:pcY.min,yMax:pcY.max,points:r.cohort.map((i,index)=>({id:`pc:${index}`,x:r.pcs[0][index],y:r.pcs[1][index],label:i.id,detail:`${i.id}; latent group ${i.group}. PC coordinates came from genotype PCA, not hardcoded group positions.`,revealAt:pcAt,tone:i.group?'positive' as const:'negative' as const}))},
    {id:'manhattan',label:'Synthetic Manhattan plot; dashed line = 0.05/32; activate a marker to change the lead',xLabel:'Synthetic marker order (4 chromosomes × 8 markers)',yLabel:'−log₁₀(two-sided Student-t p)',xMax:33,yMax:pMax,threshold:-Math.log10(.05/32),points:r.variants.map(s=>({id:`manhattan:${s.index}`,x:s.index+1,y:s.negLog10P,label:s.id,detail:`${s.id}, chr ${s.chromosome}; p=${s.fit.pValue.toExponential(4)}. Activate to select LD lead.`,revealAt:variantAt[s.index],action:action(s.index),tone:s.index===lead.index?'positive' as const:'neutral' as const}))},
    {id:'qq',label:'Q–Q plot: observed fitted p-values versus uniform rank expectations',xLabel:'Expected −log₁₀ p',yLabel:'Observed −log₁₀ p',xMax:Math.max(1,...r.qq.map(q=>q.expected)),yMax:pMax,diagonal:true,points:r.qq.map((q,i)=>({id:`qq:${i}`,x:q.expected,y:q.observed,label:q.id,detail:`Uniform rank expectation (rank−0.5)/32; observed value uses the actual OLS fit. LD makes tests dependent.`,revealAt:qqAt}))},
    {id:'regional',label:`Regional association on synthetic chromosome ${lead.chromosome}; green r²≥0.8 with ${lead.id}`,xLabel:'Fictional position',yLabel:'−log₁₀ p',xMax:80,yMax:pMax,points:r.variants.filter(s=>s.chromosome===lead.chromosome).map(s=>({id:`regional:${s.index}`,x:s.position,y:s.negLog10P,label:s.id,detail:`Association p=${s.fit.pValue.toExponential(4)}; dosage r² with ${lead.id}=${s.ld.toFixed(4)}. LD is not a posterior probability of causality.`,revealAt:ldAt[s.index],tone:s.ld>=.8?'positive' as const:'neutral' as const,action:action(s.index)}))},
    {id:'ld',label:`Measured LD to selected lead ${lead.id}, across all synthetic markers`,xLabel:'Synthetic marker index',yLabel:'Dosage r²',xMax:33,yMax:1,points:r.variants.map(s=>({id:`ld:${s.index}`,x:s.index+1,y:s.ld,label:s.id,detail:`Sample dosage r²=${s.ld.toFixed(6)}, calculated against ${lead.id}.`,revealAt:ldAt[s.index]}))},
    {id:'regression',label:`Lead ${lead.id}: residualized phenotype and genotype; line uses the actual fitted slope`,xLabel:'Dosage residual after intercept/covariates',yLabel:'Phenotype residual after intercept/covariates',xMin:fitX.min,xMax:fitX.max,yMin:Math.min(fitY.min,lead.fit.beta*fitX.min,lead.fit.beta*fitX.max),yMax:Math.max(fitY.max,lead.fit.beta*fitX.min,lead.fit.beta*fitX.max),lines:[{x1:fitX.min,y1:lead.fit.beta*fitX.min,x2:fitX.max,y2:lead.fit.beta*fitX.max,label:'FWL residual-space regression: intercept zero; slope from actual fit.',revealAt:variantAt[lead.index]}],points:r.cohort.map((i,index)=>({id:`fit:${index}`,x:lead.fit.residualX[index],y:lead.fit.residualY[index],label:i.id,detail:`Joint covariate projection; fitted original-model intercept ${numberText(lead.fit.intercept)}. Residual-space intercept is zero.`,revealAt:variantAt[lead.index]}))},
    {id:'prediction',label:'Independent test prediction: no test outcomes used for weight selection',xLabel:'Predicted quantitative phenotype',yLabel:'Observed quantitative phenotype',xMin:predX.min,xMax:predX.max,yMin:predY.min,yMax:predY.max,points:r.validation.map((i,index)=>({id:`test:${index}`,x:predictions[index],y:i.phenotype,label:i.id,detail:`Independent ${i.id}; predicted ${numberText(predictions[index])}, observed ${numberText(i.phenotype)}.`,revealAt:predictionAt}))},
  ]};
}
export function runAlgorithmLesson(id: string, values: LessonValues): LessonRun {
  if (id === 'gwas') return gwasRun(values);
  if (id === 'ism') return ismRun(values);
  if (id === 'ghmm') return ghmmRun(values);
  if (id === 'phmm') return phmmRun(values);
  if (id === 'string-graph') return stringGraphRun(values);
  if (id === 'pairwise') return pairwiseRun(values);
  if (id === 'wfa') return wfaRun(values);
  if (id === 'duel') return duelRun(values);
  if (id === 'fm-index') return fmRun(values);
  if (id === 'minimap2') return minimapRun(values);
  if (id === 'debruijn') return debruijnRun(values);
  throw new Error(`Unknown algorithm lesson: ${id}`);
}
