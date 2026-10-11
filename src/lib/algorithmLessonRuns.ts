import { computePairwiseAlignment, type AlignmentMode, type GapModel } from './pairwiseAlignment';
import { runWfaAlignment } from './wfa';
import { runAlgorithmDuel } from './algorithmDuel';
import { buildBwt, bwtBackwardSearch, lfMapping, locateSampled, sampleSuffixArray } from './fmIndex';
import { runCollinearChaining } from './minimap2';
import { buildDeBruijnGraph, previewGraphCleaning } from './debruijn';
import { buildOverlapGraph } from './stringGraph';
import { createPlan7ModelFromMSA, runViterbi, runForwardBackward, DNA_ALPHABET, PROTEIN_ALPHABET } from './phmm';
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
export function runAlgorithmLesson(id: string, values: LessonValues): LessonRun {
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
