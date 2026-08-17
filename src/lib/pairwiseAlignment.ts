/**
 * Interactive Pairwise Alignment Engine:
 * - Needleman-Wunsch (Global Alignment)
 * - Smith-Waterman (Local Alignment)
 * - Semi-Global (End-Free Fitting)
 * - Linear & Affine Gap Penalties (Gotoh 3-Matrix DP Formulation)
 */

export type AlignmentMode = 'global' | 'local' | 'semiglobal';
export type GapModel = 'linear' | 'affine';

export interface AlignmentScoring {
  match: number;
  mismatch: number;
  gapOpen: number; // e.g. -3 (cost to open a gap)
  gapExtend: number; // e.g. -1 (cost to extend a gap)
}

export type DpDirection = 'diag' | 'up' | 'left' | 'zero';

export interface DpCell {
  i: number;
  j: number;
  char1: string;
  char2: string;
  score: number;
  diagScore: number;
  upScore: number;
  leftScore: number;
  directions: DpDirection[];
  isTrace: boolean;
  formulaText: string;
}

export interface AlignmentResult {
  seq1: string;
  seq2: string;
  mode: AlignmentMode;
  gapModel: GapModel;
  scoring: AlignmentScoring;
  matrix: DpCell[][];
  maxCell: { i: number; j: number; score: number };
  tracebackPath: [number, number][];
  aligned1: string;
  aligned2: string;
  matchLine: string;
  score: number;
  identity: number;
  matches: number;
  mismatches: number;
  gaps: number;
  length: number;
}

export const DEFAULT_SCORING: AlignmentScoring = {
  match: 2,
  mismatch: -1,
  gapOpen: -3,
  gapExtend: -1,
};

/**
 * Compute full 2D dynamic programming pairwise alignment matrix and traceback.
 */
export function computePairwiseAlignment(
  rawSeq1: string,
  rawSeq2: string,
  mode: AlignmentMode = 'global',
  gapModel: GapModel = 'linear',
  scoring: AlignmentScoring = DEFAULT_SCORING,
): AlignmentResult {
  const seq1 = (rawSeq1 || 'ACGTAGCTA').trim().toUpperCase().replace(/[^A-Z]/g, '');
  const seq2 = (rawSeq2 || 'ACGTCGCTA').trim().toUpperCase().replace(/[^A-Z]/g, '');

  const m = seq1.length;
  const n = seq2.length;

  const matchScore = scoring.match;
  const mismatchScore = scoring.mismatch;
  const gapOpen = scoring.gapOpen;
  const gapExtend = scoring.gapExtend;

  // Initialize matrix of DpCell
  const matrix: DpCell[][] = [];
  for (let i = 0; i <= m; i++) {
    const row: DpCell[] = [];
    for (let j = 0; j <= n; j++) {
      row.push({
        i,
        j,
        char1: i > 0 ? seq1[i - 1] : '-',
        char2: j > 0 ? seq2[j - 1] : '-',
        score: 0,
        diagScore: -Infinity,
        upScore: -Infinity,
        leftScore: -Infinity,
        directions: [],
        isTrace: false,
        formulaText: '',
      });
    }
    matrix.push(row);
  }

  // Linear vs Affine Matrices for Gotoh calculation
  const M: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(-Infinity));
  const Ix: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(-Infinity));
  const Iy: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(-Infinity));

  // Initialize (0, 0)
  M[0][0] = 0;
  matrix[0][0].score = 0;
  matrix[0][0].formulaText = 'Origin cell (0, 0) initialized to 0.';

  // Boundary conditions
  for (let i = 1; i <= m; i++) {
    if (mode === 'local' || mode === 'semiglobal') {
      matrix[i][0].score = 0;
      matrix[i][0].formulaText = `${mode} alignment: free start gap on target.`;
    } else {
      // Global
      if (gapModel === 'linear') {
        const cost = i * gapOpen;
        matrix[i][0].score = cost;
        matrix[i][0].upScore = cost;
        matrix[i][0].directions = ['up'];
        matrix[i][0].formulaText = `Linear gap penalty: ${i} × (${gapOpen}) = ${cost}`;
      } else {
        const cost = gapOpen + (i - 1) * gapExtend;
        matrix[i][0].score = cost;
        matrix[i][0].upScore = cost;
        matrix[i][0].directions = ['up'];
        matrix[i][0].formulaText = `Affine gap: ${gapOpen} + ${i - 1} × (${gapExtend}) = ${cost}`;
      }
    }
    Ix[i][0] = matrix[i][0].score;
  }

  for (let j = 1; j <= n; j++) {
    if (mode === 'local') {
      matrix[0][j].score = 0;
      matrix[0][j].formulaText = 'Local alignment: free start gap on query.';
    } else {
      if (gapModel === 'linear') {
        const cost = j * gapOpen;
        matrix[0][j].score = cost;
        matrix[0][j].leftScore = cost;
        matrix[0][j].directions = ['left'];
        matrix[0][j].formulaText = `Linear gap penalty: ${j} × (${gapOpen}) = ${cost}`;
      } else {
        const cost = gapOpen + (j - 1) * gapExtend;
        matrix[0][j].score = cost;
        matrix[0][j].leftScore = cost;
        matrix[0][j].directions = ['left'];
        matrix[0][j].formulaText = `Affine gap: ${gapOpen} + ${j - 1} × (${gapExtend}) = ${cost}`;
      }
    }
    Iy[0][j] = matrix[0][j].score;
  }

  let maxCell = { i: 0, j: 0, score: -Infinity };

  // Fill Matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c1 = seq1[i - 1];
      const c2 = seq2[j - 1];
      const isMatch = c1 === c2;
      const substScore = isMatch ? matchScore : mismatchScore;

      const prevDiagScore = matrix[i - 1][j - 1].score;
      const diagVal = prevDiagScore + substScore;

      let upVal: number;
      let leftVal: number;

      if (gapModel === 'linear') {
        upVal = matrix[i - 1][j].score + gapOpen;
        leftVal = matrix[i][j - 1].score + gapOpen;
      } else {
        // Gotoh Affine formulation
        Ix[i][j] = Math.max(matrix[i - 1][j].score + gapOpen, Ix[i - 1][j] + gapExtend);
        Iy[i][j] = Math.max(matrix[i][j - 1].score + gapOpen, Iy[i][j - 1] + gapExtend);
        upVal = Ix[i][j];
        leftVal = Iy[i][j];
      }

      matrix[i][j].diagScore = diagVal;
      matrix[i][j].upScore = upVal;
      matrix[i][j].leftScore = leftVal;

      let bestScore: number;
      const directions: DpDirection[] = [];

      if (mode === 'local') {
        bestScore = Math.max(0, diagVal, upVal, leftVal);
        if (bestScore === 0) {
          directions.push('zero');
        } else {
          if (diagVal === bestScore) directions.push('diag');
          if (upVal === bestScore) directions.push('up');
          if (leftVal === bestScore) directions.push('left');
        }
      } else {
        bestScore = Math.max(diagVal, upVal, leftVal);
        if (diagVal === bestScore) directions.push('diag');
        if (upVal === bestScore) directions.push('up');
        if (leftVal === bestScore) directions.push('left');
      }

      matrix[i][j].score = bestScore;
      matrix[i][j].directions = directions;

      const subOp = isMatch ? `+${matchScore} (match)` : `${mismatchScore} (mismatch)`;
      matrix[i][j].formulaText = `H[${i},${j}] = max(Diag: ${prevDiagScore}${subOp} = ${diagVal}, Up: ${upVal}, Left: ${leftVal}${mode === 'local' ? ', Zero: 0' : ''}) = ${bestScore}`;

      if (bestScore > maxCell.score) {
        maxCell = { i, j, score: bestScore };
      }
    }
  }

  // Determine Traceback Start Position
  let traceI = m;
  let traceJ = n;

  if (mode === 'local') {
    traceI = maxCell.i;
    traceJ = maxCell.j;
  } else if (mode === 'semiglobal') {
    // Max on bottom row or rightmost column
    let bestSemi = -Infinity;
    for (let j = 0; j <= n; j++) {
      if (matrix[m][j].score > bestSemi) {
        bestSemi = matrix[m][j].score;
        traceI = m;
        traceJ = j;
      }
    }
    for (let i = 0; i <= m; i++) {
      if (matrix[i][n].score > bestSemi) {
        bestSemi = matrix[i][n].score;
        traceI = i;
        traceJ = n;
      }
    }
  }

  // Traceback
  const tracebackPath: [number, number][] = [];
  let currI = traceI;
  let currJ = traceJ;
  let aligned1Rev = '';
  let aligned2Rev = '';
  let matchLineRev = '';

  while (currI > 0 || currJ > 0) {
    tracebackPath.push([currI, currJ]);
    matrix[currI][currJ].isTrace = true;

    if (mode === 'local' && matrix[currI][currJ].score === 0) {
      break;
    }

    const cell = matrix[currI][currJ];
    const dirs = cell.directions;

    if (currI > 0 && currJ > 0 && dirs.includes('diag')) {
      const c1 = seq1[currI - 1];
      const c2 = seq2[currJ - 1];
      aligned1Rev += c1;
      aligned2Rev += c2;
      matchLineRev += c1 === c2 ? '|' : '.';
      currI--;
      currJ--;
    } else if (currI > 0 && (dirs.includes('up') || currJ === 0)) {
      aligned1Rev += seq1[currI - 1];
      aligned2Rev += '-';
      matchLineRev += ' ';
      currI--;
    } else if (currJ > 0 && (dirs.includes('left') || currI === 0)) {
      aligned1Rev += '-';
      aligned2Rev += seq2[currJ - 1];
      matchLineRev += ' ';
      currJ--;
    } else {
      break;
    }
  }

  tracebackPath.push([currI, currJ]);
  matrix[currI][currJ].isTrace = true;

  const aligned1 = aligned1Rev.split('').reverse().join('');
  const aligned2 = aligned2Rev.split('').reverse().join('');
  const matchLine = matchLineRev.split('').reverse().join('');

  let matches = 0;
  let mismatches = 0;
  let gaps = 0;

  for (let k = 0; k < aligned1.length; k++) {
    const a = aligned1[k];
    const b = aligned2[k];
    if (a === '-' || b === '-') gaps++;
    else if (a === b) matches++;
    else mismatches++;
  }

  const length = aligned1.length;
  const identity = length > 0 ? Math.round((matches / length) * 1000) / 10 : 0;
  const finalScore = mode === 'local' ? maxCell.score : matrix[traceI][traceJ].score;

  return {
    seq1,
    seq2,
    mode,
    gapModel,
    scoring,
    matrix,
    maxCell,
    tracebackPath,
    aligned1,
    aligned2,
    matchLine,
    score: finalScore,
    identity,
    matches,
    mismatches,
    gaps,
    length,
  };
}
