/**
 * Affine DP versus Wavefront Alignment: recorded computations, not a benchmark.
 * DP takes O(MN); original WFA takes O(n·s) with an O(n) exact-match scan.
 * State updates, distinct coordinates and letter comparisons are separate units.
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
    badge: 'Zero-cost wavefront',
    seq1: 'ACGTAGCTAGTCGATCGAT',
    seq2: 'ACGTAGCTAGTCGATCGAT',
    description:
      'WFA reaches the end at penalty s=0 using N letter comparisons. Affine DP initializes boundaries and evaluates each interior prefix pair. Neither animation duration nor coordinate count measures runtime.',
  },
  {
    id: 'single-snp',
    name: 'Single Nucleotide Polymorphism (SNP)',
    badge: 'High Similarity',
    seq1: 'ACGTAGCTAGTCGATCGAT',
    seq2: 'ACGTCGCTAGTCGATCGAT',
    description:
      'One substitution raises the optimum penalty to 2. Inspect the recorded states and comparisons rather than assuming a fixed speedup from sequence similarity.',
  },
  {
    id: 'insertion-gap',
    name: 'Tandem Repeat Insertion (+4 bp)',
    badge: 'Gotoh Affine Gap',
    seq1: 'ACGTAGCTAAGTCGATCGATC',
    seq2: 'ACGTAGCTACCCCAGTCGATCGATC',
    description:
      'A four-base insertion changes the final diagonal to k=4. Intermediate gap states advance one diagonal at a time; the declared affine cost is 3 + 4 × 1 = 7.',
  },
  {
    id: 'divergent',
    name: 'Several substitutions',
    badge: 'Moderate Divergence',
    seq1: 'ACGTACGTGACGTGATCG',
    seq2: 'ACATACCTGAGTTATTCG',
    description:
      'Demonstrates wavefront frontier expansion as multiple mismatches branch into neighboring diagonals.',
  },
];

export interface DuelResult {
  seq1: string;
  seq2: string;
  nwResult: AlignmentResult;
  wfaResult: WfaResult;
  totalNwCells: number;
  totalWfaCells: number;
  dpToWfaCoordinateRatio: number;
  divergenceDistance: number;
  fewerVisitedCoordinates: 'wfa' | 'nw' | 'tie';
  coordinateCountExplanation: string;
  steps: DuelStep[];
}

export function runAlgorithmDuel(rawSeq1: string, rawSeq2: string): DuelResult {
  const seq1 = rawSeq1.trim().toUpperCase();
  const seq2 = rawSeq2.trim().toUpperCase();
  if (!/^[A-Z]*$/.test(seq1 + seq2)) throw new Error('Sequences must contain letters only.');
  const nwResult = computePairwiseAlignment(seq1, seq2, 'global', 'affine', {
    match: 0,
    mismatch: -2,
    gapOpen: -4,
    gapExtend: -1,
  });
  const wfaResult = runWfaAlignment(seq1, seq2, { mismatch: 2, gapOpen: 3, gapExtend: 1 });
  if (-nwResult.score !== wfaResult.finalScore) throw new Error('Alignment objectives disagree.');
  const dpTrace = nwResult.trace.filter((s) => s.phase === 'initialize' || s.phase === 'fill');
  const wfTrace = wfaResult.trace.filter((s) => s.phase !== 'traceback' && s.phase !== 'done');
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
        i: dp.i,
        j: dp.j,
        score: dp.score,
        cellsEvaluated: Math.min(index + 1, dpTrace.length),
        totalCells: totalNwCells,
        pseudocodeLine: dp.phase === 'initialize' ? 0 : 3,
        activeFormula: dp.explanation,
        isDone: index >= dpTrace.length - 1,
      },
      wfa: {
        score: wf.score,
        diagonal: wf.k,
        offset: wf.i,
        lcpExtended: wf.phase === 'extend' ? 1 : 0,
        cellsEvaluated: wf.stateUpdates,
        pseudocodeLine: wf.phase === 'initialize' ? 0 : wf.phase === 'extend' ? 4 : 2,
        activeFormula: wf.explanation,
        isDone: index >= wfTrace.length - 1,
      },
    });
  }
  const fewerVisitedCoordinates =
    totalWfaCells < totalNwCells ? 'wfa' : totalWfaCells > totalNwCells ? 'nw' : 'tie';
  return {
    seq1,
    seq2,
    nwResult,
    wfaResult,
    totalNwCells,
    totalWfaCells,
    dpToWfaCoordinateRatio: Number((totalNwCells / Math.max(1, totalWfaCells)).toFixed(1)),
    divergenceDistance: wfaResult.mismatches + wfaResult.gaps,
    fewerVisitedCoordinates,
    coordinateCountExplanation:
      'Wavefront Alignment and affine DP solve the same objective. Stored cells, state updates, and character comparisons are different units; their counts are not a wall-clock speedup.',
    steps,
  };
}
