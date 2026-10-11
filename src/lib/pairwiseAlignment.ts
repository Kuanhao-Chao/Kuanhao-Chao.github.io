/** Exact alignment teaching engine. Scores are maximized; the first gap base costs gapOpen. */
export type AlignmentMode = 'global' | 'local' | 'semiglobal';
export type GapModel = 'linear' | 'affine';
export type AlignmentState = 'M' | 'I' | 'D';
export interface AlignmentScoring { match: number; mismatch: number; gapOpen: number; gapExtend: number }
export type DpDirection = 'diag' | 'up' | 'left' | 'zero';
export interface DpCell {
  i: number; j: number; char1: string; char2: string; score: number;
  diagScore: number; upScore: number; leftScore: number;
  directions: DpDirection[]; isTrace: boolean; formulaText: string;
}
export interface AlignmentTrace {
  phase: 'initialize' | 'fill' | 'traceback' | 'done';
  i: number; j: number; state: AlignmentState; score: number; explanation: string;
}
export interface AlignmentResult {
  seq1: string; seq2: string; mode: AlignmentMode; gapModel: GapModel; scoring: AlignmentScoring;
  matrix: DpCell[][];
  /** M is the best score including gap endings; I consumes target, D consumes query. */
  states: Record<AlignmentState, number[][]>;
  trace: AlignmentTrace[];
  maxCell: { i: number; j: number; score: number };
  tracebackPath: [number, number][]; tracebackStates: AlignmentState[];
  aligned1: string; aligned2: string; matchLine: string; score: number; identity: number;
  matches: number; mismatches: number; gaps: number; length: number;
  targetStart: number; targetEnd: number; queryStart: number; queryEnd: number;
}
export const DEFAULT_SCORING: AlignmentScoring = { match: 2, mismatch: -1, gapOpen: -3, gapExtend: -1 };

export function computePairwiseAlignment(
  rawSeq1: string, rawSeq2: string, mode: AlignmentMode = 'global',
  gapModel: GapModel = 'linear', scoring: AlignmentScoring = DEFAULT_SCORING,
): AlignmentResult {
  const seq1 = rawSeq1.trim().toUpperCase();
  const seq2 = rawSeq2.trim().toUpperCase();
  if (!/^[A-Z]*$/.test(seq1 + seq2)) throw new Error('Sequences must contain letters only.');
  if (Math.max(seq1.length, seq2.length) > 200) throw new Error('Teaching alignment is limited to 200 letters per sequence.');
  if (!Object.values(scoring).every(Number.isFinite) || scoring.gapOpen > 0 || scoring.gapExtend > 0) throw new Error('Use finite scores and non-positive gap scores.');
  const m = seq1.length;
  const n = seq2.length;
  const make = () => Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(-Infinity));
  const M = make(); const I = make(); const D = make();
  const matrix: DpCell[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => ({
    i, j, char1: seq1[i - 1] ?? '-', char2: seq2[j - 1] ?? '-', score: -Infinity,
    diagScore: -Infinity, upScore: -Infinity, leftScore: -Infinity, directions: [], isTrace: false, formulaText: '',
  })));
  const trace: AlignmentTrace[] = [];
  const gap = (length: number) => gapModel === 'linear' ? length * scoring.gapOpen : scoring.gapOpen + (length - 1) * scoring.gapExtend;
  const record = (phase: AlignmentTrace['phase'], i: number, j: number, state: AlignmentState = 'M', explanation = matrix[i][j].formulaText) => {
    trace.push({ phase, i, j, state, score: ({ M, I, D })[state][i][j], explanation });
  };
  M[0][0] = matrix[0][0].score = 0;
  matrix[0][0].formulaText = 'Empty prefixes: score 0. No letters have been aligned.';
  record('initialize', 0, 0);
  for (let i = 1; i <= m; i++) {
    const free = mode !== 'global';
    M[i][0] = matrix[i][0].score = free ? 0 : gap(i);
    if (!free) I[i][0] = M[i][0];
    matrix[i][0].upScore = I[i][0];
    matrix[i][0].directions = free ? ['zero'] : ['up'];
    matrix[i][0].formulaText = free ? 'A target prefix can be skipped for free.' : `Empty query: a gap of length ${i} scores ${gap(i)}.`;
    record('initialize', i, 0);
  }
  for (let j = 1; j <= n; j++) {
    const free = mode === 'local';
    M[0][j] = matrix[0][j].score = free ? 0 : gap(j);
    if (!free) D[0][j] = M[0][j];
    matrix[0][j].leftScore = D[0][j];
    matrix[0][j].directions = free ? ['zero'] : ['left'];
    matrix[0][j].formulaText = free ? 'Local alignment can skip a query prefix.' : `Empty target: all ${j} query letters must be paid for (${gap(j)}).`;
    record('initialize', 0, j);
  }
  let maxCell = { i: 0, j: 0, score: 0 };
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cell = matrix[i][j];
      const substitution = seq1[i - 1] === seq2[j - 1] ? scoring.match : scoring.mismatch;
      const extension = gapModel === 'affine' ? scoring.gapExtend : scoring.gapOpen;
      I[i][j] = Math.max(M[i - 1][j] + scoring.gapOpen, I[i - 1][j] + extension);
      D[i][j] = Math.max(M[i][j - 1] + scoring.gapOpen, D[i][j - 1] + extension);
      cell.diagScore = M[i - 1][j - 1] + substitution;
      cell.upScore = I[i][j]; cell.leftScore = D[i][j];
      M[i][j] = cell.score = Math.max(cell.diagScore, cell.upScore, cell.leftScore, mode === 'local' ? 0 : -Infinity);
      if (mode === 'local' && cell.score === 0) cell.directions.push('zero');
      else {
        if (cell.diagScore === cell.score) cell.directions.push('diag');
        if (cell.upScore === cell.score) cell.directions.push('up');
        if (cell.leftScore === cell.score) cell.directions.push('left');
      }
      cell.formulaText = `M[${i},${j}] = max(diagonal ${M[i - 1][j - 1]} + ${substitution} = ${cell.diagScore}, I ${cell.upScore}, D ${cell.leftScore}${mode === 'local' ? ', restart 0' : ''}) = ${cell.score}. ${cell.directions.length > 1 ? 'Tied predecessors: more than one optimum is possible.' : ''}`;
      record('fill', i, j);
      if (cell.score > maxCell.score) maxCell = { i, j, score: cell.score };
    }
  }
  let i = mode === 'local' ? maxCell.i : m;
  let j = mode === 'local' ? maxCell.j : n;
  if (mode === 'semiglobal') {
    // Fitting: consume the ENTIRE query; target suffix is free.
    i = 0;
    for (let r = 1; r <= m; r++) if (M[r][n] > M[i][n]) i = r;
  }
  const targetEnd = i; const queryEnd = j; const score = M[i][j];
  let state: AlignmentState = 'M';
  const tracebackPath: [number, number][] = []; const tracebackStates: AlignmentState[] = [];
  const a: string[] = []; const b: string[] = [];
  while (i > 0 || j > 0) {
    if ((mode === 'semiglobal' && j === 0) || (mode === 'local' && state === 'M' && M[i][j] === 0)) break;
    const dirs = matrix[i][j].directions;
    if (state === 'M') {
      if (i > 0 && j > 0 && dirs.includes('diag')) {
        record('traceback', i, j, state, `Consume ${seq1[i - 1]} / ${seq2[j - 1]} diagonally.`);
        tracebackPath.push([i, j]); tracebackStates.push(state);
        a.push(seq1[--i]); b.push(seq2[--j]);
        continue;
      }
      state = dirs.includes('up') ? 'I' : 'D';
    }
    record('traceback', i, j, state, `Consume one ${state === 'I' ? 'target' : 'query'} letter in gap state ${state}; opening and extending have different costs.`);
    tracebackPath.push([i, j]); tracebackStates.push(state);
    const extension = gapModel === 'affine' ? scoring.gapExtend : scoring.gapOpen;
    if (state === 'I') {
      const extend = i > 0 && I[i][j] === I[i - 1][j] + extension;
      a.push(seq1[--i]); b.push('-'); state = extend ? 'I' : 'M';
    } else {
      const extend = j > 0 && D[i][j] === D[i][j - 1] + extension;
      a.push('-'); b.push(seq2[--j]); state = extend ? 'D' : 'M';
    }
  }
  tracebackPath.push([i, j]); tracebackStates.push('M');
  for (const [r, c] of tracebackPath) matrix[r][c].isTrace = true;
  a.reverse(); b.reverse();
  const aligned1 = a.join(''); const aligned2 = b.join('');
  let matches = 0; let mismatches = 0; let gaps = 0;
  const matchLine = a.map((letter, k) => {
    if (letter === '-' || b[k] === '-') { gaps++; return ' '; }
    if (letter === b[k]) { matches++; return '|'; }
    mismatches++; return '.';
  }).join('');
  trace.push({ phase: 'done', i: targetEnd, j: queryEnd, state: 'M', score, explanation: `One optimal alignment scores ${score}. Ties can yield different equally good alignments.` });
  return {
    seq1, seq2, mode, gapModel, scoring, matrix, states: { M, I, D }, trace, maxCell,
    tracebackPath, tracebackStates, aligned1, aligned2, matchLine, score,
    identity: a.length ? Math.round(matches / a.length * 1000) / 10 : 0,
    matches, mismatches, gaps, length: a.length, targetStart: i, targetEnd, queryStart: j, queryEnd,
  };
}
