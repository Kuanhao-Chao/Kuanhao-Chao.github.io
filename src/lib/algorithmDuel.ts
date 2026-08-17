/**
 * Algorithm Duel & Benchmark Engine
 * Needleman-Wunsch DP (O(MN)) vs Wavefront Alignment WFA (O(s·d))
 * Pure computational engine for side-by-side simulation, live telemetry, and pseudocode stepping.
 */

import { computePairwiseAlignment, type AlignmentResult } from './pairwiseAlignment';
import { runWfaAlignment, type WfaResult } from './wfa';

export interface DuelStep {
  stepIndex: number;
  // Needleman-Wunsch state
  nw: {
    i: number;
    j: number;
    score: number;
    cellsEvaluated: number;
    totalCells: number;
    pseudocodeLine: number;
    activeFormula: string;
    isDone: boolean;
  };
  // WFA state
  wfa: {
    score: number;
    diagonal: number;
    offset: number;
    lcpExtended: number;
    cellsEvaluated: number;
    pseudocodeLine: number;
    activeFormula: string;
    isDone: boolean;
  };
}

export interface DuelPreset {
  id: string;
  name: string;
  badge: string;
  seq1: string;
  seq2: string;
  description: string;
}

export const DUEL_PRESETS: DuelPreset[] = [
  {
    id: 'identical',
    name: 'Identical Sequences (0% Divergence)',
    badge: 'WFA 1-Step Win',
    seq1: 'ACGTAGCTAGTCGATCGAT',
    seq2: 'ACGTAGCTAGTCGATCGAT',
    description: 'WFA finishes in exactly 1 score wavefront (s=0) via greedy LCP extension in O(N) time, while standard DP must evaluate all N² cells.',
  },
  {
    id: 'single-snp',
    name: 'Single Nucleotide Polymorphism (SNP)',
    badge: 'High Similarity',
    seq1: 'ACGTAGCTAGTCGATCGAT',
    seq2: 'ACGTCGCTAGTCGATCGAT',
    description: 'Sequence difference d=1. WFA only explores 3 diagonals around k=0, achieving ~15x work reduction over full 2D dynamic programming.',
  },
  {
    id: 'insertion-gap',
    name: 'Tandem Repeat Insertion (+4 bp)',
    badge: 'Gotoh Affine Gap',
    seq1: 'ACGTAGCTAAGTCGATCGATC',
    seq2: 'ACGTAGCTACCCCAGTCGATCGATC',
    description: 'A 4bp insertion introduces a diagonal shift k=4. WFA opens and extends the gap along diagonal k without touching irrelevant matrix quadrants.',
  },
  {
    id: 'divergent',
    name: 'Divergent Sequences (~15% Mismatches)',
    badge: 'Moderate Divergence',
    seq1: 'ACGTACGTGACGTGATCG',
    seq2: 'ACATACCTGAGTTATTCG',
    description: 'Demonstrates wavefront frontier expansion as multiple mismatches branch into neighboring diagonals.',
  },
];

export interface DuelResult {
  seq1: string;
  seq2: string;
  nwResult: AlignmentResult;
  wfaResult: WfaResult;
  totalNwCells: number;
  totalWfaCells: number;
  speedupRatio: number;
  divergenceDistance: number;
  winner: 'wfa' | 'nw' | 'tie';
  winnerExplanation: string;
  steps: DuelStep[];
}

export function runAlgorithmDuel(rawSeq1: string, rawSeq2: string): DuelResult {
  const seq1 = (rawSeq1 || 'ACGTAGCTA').trim().toUpperCase().replace(/[^ACGTU]/g, '');
  const seq2 = (rawSeq2 || 'ACGTCGCTA').trim().toUpperCase().replace(/[^ACGTU]/g, '');

  const s1 = seq1 || 'A';
  const s2 = seq2 || 'A';

  const m = s1.length;
  const n = s2.length;
  const totalNwCells = (m + 1) * (n + 1);

  const nwResult = computePairwiseAlignment(s1, s2, 'global', 'linear', {
    match: 2,
    mismatch: -1,
    gapOpen: -2,
    gapExtend: -2,
  });

  const wfaResult = runWfaAlignment(s1, s2, {
    mismatch: 2,
    gapOpen: 3,
    gapExtend: 1,
  });

  const totalWfaCells = Math.max(1, wfaResult.cellsEvaluated);
  const speedupRatio = Number((totalNwCells / totalWfaCells).toFixed(1));
  const divergenceDistance = wfaResult.mismatches + wfaResult.gaps;

  // Build step-by-step synchronized execution simulation
  const steps: DuelStep[] = [];
  const maxSteps = Math.max(totalNwCells, wfaResult.steps.length * 4, 1);

  let nwCellCount = 0;
  let currentNwI = 0;
  let currentNwJ = 0;

  let currentWfaStepIdx = 0;
  let currentWfaDiagIdx = 0;

  for (let s = 0; s < maxSteps; s++) {
    // Progress NW cell by cell
    if (nwCellCount < totalNwCells) {
      nwCellCount++;
      currentNwJ++;
      if (currentNwJ > n) {
        currentNwJ = 0;
        currentNwI++;
      }
    }
    const nwDone = nwCellCount >= totalNwCells;
    const nwLine = nwDone ? 6 : (currentNwI === 0 || currentNwJ === 0) ? 1 : 5;
    const nwFormula = nwDone
      ? 'Traceback optimal alignment path from dp[m][n] to dp[0][0]'
      : (currentNwI === 0 || currentNwJ === 0)
        ? `dp[${currentNwI}][${currentNwJ}] = Base gap initialization`
        : `dp[${currentNwI}][${currentNwJ}] = max(diag, up, left)`;

    // Progress WFA frontier by frontier
    let wfaScore = 0;
    let wfaDiag = 0;
    let wfaOffset = 0;
    let wfaLcp = 0;
    let wfaDone = false;

    if (wfaResult.steps.length > 0) {
      const stepRec = wfaResult.steps[Math.min(currentWfaStepIdx, wfaResult.steps.length - 1)];
      wfaScore = stepRec.score;
      if (stepRec.frontiers.length > 0) {
        const f = stepRec.frontiers[Math.min(currentWfaDiagIdx, stepRec.frontiers.length - 1)];
        wfaDiag = f.k;
        wfaOffset = f.offset;
        wfaLcp = f.lcpExtended;
      }

      currentWfaDiagIdx++;
      if (currentWfaDiagIdx >= stepRec.frontiers.length) {
        currentWfaDiagIdx = 0;
        currentWfaStepIdx++;
      }
      wfaDone = currentWfaStepIdx >= wfaResult.steps.length;
    } else {
      wfaDone = true;
    }

    const wfaLine = wfaDone ? 6 : wfaScore === 0 ? 1 : wfaLcp > 0 ? 5 : 4;
    const wfaFormula = wfaDone
      ? `Alignment reached target (m=${m}, n=${n}). Traceback along diagonal wavefronts.`
      : wfaScore === 0
        ? `W[0][0] = 0 + LCP("${s1}", "${s2}") = ${wfaOffset}`
        : `W[s=${wfaScore}][k=${wfaDiag}] = offset ${wfaOffset} (+${wfaLcp} LCP match)`;

    steps.push({
      stepIndex: s + 1,
      nw: {
        i: Math.min(currentNwI, m),
        j: Math.min(currentNwJ, n),
        score: nwResult.matrix[Math.min(currentNwI, m)]?.[Math.min(currentNwJ, n)]?.score ?? 0,
        cellsEvaluated: nwCellCount,
        totalCells: totalNwCells,
        pseudocodeLine: nwLine,
        activeFormula: nwFormula,
        isDone: nwDone,
      },
      wfa: {
        score: wfaScore,
        diagonal: wfaDiag,
        offset: wfaOffset,
        lcpExtended: wfaLcp,
        cellsEvaluated: Math.min(totalWfaCells, (currentWfaStepIdx + 1) * 3),
        pseudocodeLine: wfaLine,
        activeFormula: wfaFormula,
        isDone: wfaDone,
      },
    });

    if (nwDone && wfaDone) break;
  }

  const winner: 'wfa' | 'nw' | 'tie' = totalWfaCells < totalNwCells ? 'wfa' : totalWfaCells > totalNwCells ? 'nw' : 'tie';
  const winnerExplanation =
    winner === 'wfa'
      ? `Wavefront Alignment (WFA) wins with a ${speedupRatio}x work reduction! Because sequences have low divergence (d=${divergenceDistance}), WFA only computed ${totalWfaCells} diagonal cells instead of all ${totalNwCells} full 2D matrix cells.`
      : `Both algorithms computed comparable operations for this sequence configuration.`;

  return {
    seq1: s1,
    seq2: s2,
    nwResult,
    wfaResult,
    totalNwCells,
    totalWfaCells,
    speedupRatio,
    divergenceDistance,
    winner,
    winnerExplanation,
    steps,
  };
}
