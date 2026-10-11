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
  const seq1 = rawSeq1.trim().toUpperCase();
  const seq2 = rawSeq2.trim().toUpperCase();
  if (!/^[A-Z]*$/.test(seq1 + seq2)) throw new Error('Sequences must contain letters only.');
  const nwResult = computePairwiseAlignment(seq1, seq2, 'global', 'affine', {
    match: 0, mismatch: -2, gapOpen: -4, gapExtend: -1,
  });
  const wfaResult = runWfaAlignment(seq1, seq2, { mismatch: 2, gapOpen: 3, gapExtend: 1 });
  if (-nwResult.score !== wfaResult.finalScore) throw new Error('Alignment objectives disagree.');
  const dpTrace = nwResult.trace.filter(s => s.phase === 'initialize' || s.phase === 'fill');
  const wfTrace = wfaResult.trace.filter(s => s.phase !== 'traceback' && s.phase !== 'done');
  const totalNwCells = dpTrace.length;
  // Kept for legacy callers: these are distinct visited coordinates, NOT timing units.
  const totalWfaCells = wfaResult.cellsEvaluated;
  const steps: DuelStep[] = [];
  for (let index = 0; index < Math.max(dpTrace.length, wfTrace.length); index++) {
    const dp = dpTrace[Math.min(index, dpTrace.length - 1)];
    const wf = wfTrace[Math.min(index, wfTrace.length - 1)];
    steps.push({
      stepIndex: index + 1,
      nw: {
        i: dp.i, j: dp.j, score: dp.score,
        cellsEvaluated: Math.min(index + 1, dpTrace.length), totalCells: totalNwCells,
        pseudocodeLine: dp.phase === 'initialize' ? 0 : 3, activeFormula: dp.explanation,
        isDone: index >= dpTrace.length - 1,
      },
      wfa: {
        score: wf.score, diagonal: wf.k, offset: wf.i,
        lcpExtended: wf.phase === 'extend' ? 1 : 0,
        cellsEvaluated: wf.stateUpdates,
        pseudocodeLine: wf.phase === 'initialize' ? 0 : wf.phase === 'extend' ? 4 : 2,
        activeFormula: wf.explanation, isDone: index >= wfTrace.length - 1,
      },
    });
  }
  const winner = totalWfaCells < totalNwCells ? 'wfa' : totalWfaCells > totalNwCells ? 'nw' : 'tie';
  return {
    seq1, seq2, nwResult, wfaResult, totalNwCells, totalWfaCells,
    speedupRatio: Number((totalNwCells / Math.max(1, totalWfaCells)).toFixed(1)),
    divergenceDistance: wfaResult.mismatches + wfaResult.gaps, winner,
    winnerExplanation: 'Wavefront Alignment and affine DP solve the same objective. Stored cells, state updates, and character comparisons are different units; their counts are not a wall-clock speedup.',
    steps,
  };
}
