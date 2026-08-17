/**
 * Profile Hidden Markov Models (pHMMs) Engine
 * Plan 7 Architecture (HMMER3 / Pfam style)
 * - Viterbi Optimal Hidden Path Decoding
 * - Forward-Backward Algorithm & Posterior Probabilities
 * - Log-Sum-Exp numerically stable operations
 * - Multiple Sequence Alignment (MSA) Model Builder
 */

export interface Plan7Transitions {
  MM: number[]; // M_k -> M_{k+1}, k=0..K (0 is Begin state B)
  MI: number[]; // M_k -> I_k,     k=0..K
  MD: number[]; // M_k -> D_{k+1}, k=0..K
  IM: number[]; // I_k -> M_{k+1}, k=0..K
  II: number[]; // I_k -> I_k,     k=0..K
  DM: number[]; // D_k -> M_{k+1}, k=1..K
  DD: number[]; // D_k -> D_{k+1}, k=1..K
}

export interface Plan7Model {
  name: string;
  alphabet: string[];
  K: number; // Profile length (number of match states)
  background: Record<string, number>;
  transitions: Plan7Transitions;
  matchEmissions: Record<string, number>[]; // Index 1..K
  insertEmissions: Record<string, number>[]; // Index 0..K
}

export interface ViterbiStep {
  step: number;
  residueIdx: number; // 1..N (0 for silent delete)
  char: string;
  stateType: 'M' | 'I' | 'D' | 'B' | 'E';
  k: number;
}

export interface ViterbiResult {
  logScore: number;
  viterbiPath: ViterbiStep[];
  matrixM: number[][]; // (N+1) x (K+1)
  matrixI: number[][]; // (N+1) x (K+1)
  matrixD: number[][]; // (N+1) x (K+1)
  traceM: string[][];
  traceI: string[][];
  traceD: string[][];
}

export interface ForwardBackwardResult {
  logLikelihood: number;
  forwardM: number[][];
  forwardI: number[][];
  forwardD: number[][];
  backwardM: number[][];
  backwardI: number[][];
  backwardD: number[][];
  posteriorM: number[][]; // (N+1) x (K+1) probability [0, 1]
}

const NEG_INF = -1e9;

export function logSumExp(a: number, b: number): number {
  if (a <= NEG_INF && b <= NEG_INF) return NEG_INF;
  if (a <= NEG_INF) return b;
  if (b <= NEG_INF) return a;
  const max = Math.max(a, b);
  return max + Math.log(1 + Math.exp(-Math.abs(a - b)));
}

export function logSumExpArray(arr: number[]): number {
  let acc = NEG_INF;
  for (const v of arr) {
    acc = logSumExp(acc, v);
  }
  return acc;
}

/**
 * Standard Protein 20-amino-acid alphabet.
 */
export const PROTEIN_ALPHABET = [
  'A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L',
  'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'Y',
];

/**
 * Standard DNA 4-nucleotide alphabet.
 */
export const DNA_ALPHABET = ['A', 'C', 'G', 'T'];

/**
 * Build a Plan 7 Profile HMM from a Multiple Sequence Alignment (MSA).
 */
export function createPlan7ModelFromMSA(
  msaInput: string[] | string,
  modelName: string = 'Profile_Model',
  alphabet: string[] = PROTEIN_ALPHABET,
): Plan7Model {
  const sequences = (Array.isArray(msaInput) ? msaInput : msaInput.split(/[\n,;]+/))
    .map((s) => s.trim().toUpperCase().replace(/[^A-Z-]/g, ''))
    .filter(Boolean);

  if (sequences.length === 0) {
    throw new Error('MSA input is empty');
  }

  const numSeq = sequences.length;
  const msaLen = sequences[0].length;

  // Determine Match Columns (> 50% non-gap residues)
  const isMatchCol: boolean[] = [];
  for (let c = 0; c < msaLen; c++) {
    let nonGaps = 0;
    for (let s = 0; s < numSeq; s++) {
      const ch = sequences[s][c] || '-';
      if (ch !== '-' && ch !== '.') nonGaps++;
    }
    isMatchCol.push(nonGaps / numSeq >= 0.5);
  }

  // Count Match states K
  let K = isMatchCol.filter(Boolean).length;
  if (K === 0) {
    K = msaLen;
    for (let c = 0; c < msaLen; c++) isMatchCol[c] = true;
  }

  // Uniform background
  const bgVal = 1 / alphabet.length;
  const background: Record<string, number> = {};
  alphabet.forEach((a) => (background[a] = bgVal));

  // Initialize Transitions & Emissions
  const transitions: Plan7Transitions = {
    MM: new Array(K + 1).fill(0.85),
    MI: new Array(K + 1).fill(0.08),
    MD: new Array(K + 1).fill(0.07),
    IM: new Array(K + 1).fill(0.6),
    II: new Array(K + 1).fill(0.4),
    DM: new Array(K + 1).fill(0.7),
    DD: new Array(K + 1).fill(0.3),
  };

  const matchEmissions: Record<string, number>[] = [{}];
  const insertEmissions: Record<string, number>[] = [];

  for (let k = 0; k <= K; k++) {
    const insObj: Record<string, number> = {};
    alphabet.forEach((a) => (insObj[a] = bgVal));
    insertEmissions.push(insObj);
  }

  // Calculate Match Column Emissions with Laplace Pseudocounts (+0.1)
  const pseudo = 0.1;
  let matchIdx = 0;
  for (let c = 0; c < msaLen; c++) {
    if (!isMatchCol[c]) continue;
    matchIdx++;

    const counts: Record<string, number> = {};
    alphabet.forEach((a) => (counts[a] = pseudo));

    for (let s = 0; s < numSeq; s++) {
      const ch = sequences[s][c];
      if (ch && ch !== '-' && counts[ch] !== undefined) {
        counts[ch]++;
      }
    }

    const total = Object.values(counts).reduce((acc, v) => acc + v, 0);
    const em: Record<string, number> = {};
    alphabet.forEach((a) => {
      em[a] = counts[a] / total;
    });
    matchEmissions[matchIdx] = em;
  }

  return {
    name: modelName,
    alphabet,
    K,
    background,
    transitions,
    matchEmissions,
    insertEmissions,
  };
}

/**
 * Run Viterbi algorithm to find the most probable hidden state path.
 */
export function runViterbi(model: Plan7Model, querySeq: string): ViterbiResult {
  const seq = querySeq.toUpperCase().replace(/[^A-Z]/g, '');
  const N = seq.length;
  const K = model.K;

  // Initialize DP Matrices with -Infinity
  const VM: number[][] = Array.from({ length: N + 1 }, () => new Array(K + 1).fill(NEG_INF));
  const VI: number[][] = Array.from({ length: N + 1 }, () => new Array(K + 1).fill(NEG_INF));
  const VD: number[][] = Array.from({ length: N + 1 }, () => new Array(K + 1).fill(NEG_INF));

  const traceM: string[][] = Array.from({ length: N + 1 }, () => new Array(K + 1).fill(''));
  const traceI: string[][] = Array.from({ length: N + 1 }, () => new Array(K + 1).fill(''));
  const traceD: string[][] = Array.from({ length: N + 1 }, () => new Array(K + 1).fill(''));

  // Base state: VM(0, 0) = 0 (Begin state)
  VM[0][0] = 0;

  // Delete state initial row for i = 0 (silent deletes from Begin)
  for (let k = 1; k <= K; k++) {
    const fromM = VM[0][k - 1] + Math.log(model.transitions.MD[k - 1] || 1e-6);
    const fromD = VD[0][k - 1] + Math.log(model.transitions.DD[k - 1] || 1e-6);

    if (fromM >= fromD && fromM > NEG_INF / 2) {
      VD[0][k] = fromM;
      traceD[0][k] = 'M';
    } else if (fromD > NEG_INF / 2) {
      VD[0][k] = fromD;
      traceD[0][k] = 'D';
    }
  }

  // DP Matrix Fill
  for (let i = 1; i <= N; i++) {
    const ch = seq[i - 1];

    // 1. Delete states VD(i, k) (silent, computed first for current row)
    for (let k = 1; k <= K; k++) {
      const fromM = VM[i][k - 1] + Math.log(model.transitions.MD[k - 1] || 1e-6);
      const fromD = VD[i][k - 1] + Math.log(model.transitions.DD[k - 1] || 1e-6);

      if (fromM >= fromD && fromM > NEG_INF / 2) {
        VD[i][k] = fromM;
        traceD[i][k] = 'M';
      } else if (fromD > NEG_INF / 2) {
        VD[i][k] = fromD;
        traceD[i][k] = 'D';
      }
    }

    // 2. Match states VM(i, k)
    for (let k = 1; k <= K; k++) {
      const eM = model.matchEmissions[k]?.[ch] || model.background[ch] || 1e-6;
      const logEmission = Math.log(eM);

      const fromM = VM[i - 1][k - 1] + Math.log(model.transitions.MM[k - 1] || 1e-6);
      const fromI = VI[i - 1][k - 1] + Math.log(model.transitions.IM[k - 1] || 1e-6);
      const fromD = VD[i - 1][k - 1] + Math.log(model.transitions.DM[k - 1] || 1e-6);

      const maxPrev = Math.max(fromM, fromI, fromD);
      VM[i][k] = logEmission + maxPrev;

      if (maxPrev === fromM) traceM[i][k] = 'M';
      else if (maxPrev === fromI) traceM[i][k] = 'I';
      else traceM[i][k] = 'D';
    }

    // 3. Insert states VI(i, k)
    for (let k = 0; k <= K; k++) {
      const eI = model.insertEmissions[k]?.[ch] || model.background[ch] || 1e-6;
      const logEmission = Math.log(eI);

      const fromM = VM[i - 1][k] + Math.log(model.transitions.MI[k] || 1e-6);
      const fromI = VI[i - 1][k] + Math.log(model.transitions.II[k] || 1e-6);

      const maxPrev = Math.max(fromM, fromI);
      VI[i][k] = logEmission + maxPrev;

      if (maxPrev === fromM) traceI[i][k] = 'M';
      else traceI[i][k] = 'I';
    }

    // Re-check Delete states if newly enabled by Match states in same row
    for (let k = 1; k <= K; k++) {
      const fromM = VM[i][k - 1] + Math.log(model.transitions.MD[k - 1] || 1e-6);
      const fromD = VD[i][k - 1] + Math.log(model.transitions.DD[k - 1] || 1e-6);
      const bestD = Math.max(fromM, fromD);
      if (bestD > VD[i][k]) {
        VD[i][k] = bestD;
        traceD[i][k] = bestD === fromM ? 'M' : 'D';
      }
    }
  }

  // Optimal Termination Score at position (N, K)
  const finalM = VM[N][K];
  const finalD = VD[N][K];
  const finalI = VI[N][K];
  const logScore = Math.max(finalM, finalD, finalI);

  // Traceback
  let currState: 'M' | 'I' | 'D' = finalM >= finalD && finalM >= finalI ? 'M' : finalD >= finalI ? 'D' : 'I';
  let currI = N;
  let currK = K;

  const pathRev: ViterbiStep[] = [];
  let stepCount = 0;

  while (currI > 0 || currK > 0) {
    stepCount++;
    const ch = currI > 0 ? seq[currI - 1] : '-';

    pathRev.push({
      step: stepCount,
      residueIdx: currState === 'D' ? 0 : currI,
      char: currState === 'D' ? '-' : ch,
      stateType: currState,
      k: currK,
    });

    if (currState === 'M') {
      const prev = traceM[currI][currK] as 'M' | 'I' | 'D';
      currI--;
      currK--;
      currState = prev || 'M';
    } else if (currState === 'I') {
      const prev = traceI[currI][currK] as 'M' | 'I';
      currI--;
      currState = prev || 'M';
    } else if (currState === 'D') {
      const prev = traceD[currI][currK] as 'M' | 'D';
      currK--;
      currState = prev || 'M';
    }

    if (currI === 0 && currK === 0) break;
  }

  const viterbiPath = pathRev.reverse();
  viterbiPath.forEach((p, idx) => (p.step = idx + 1));

  return {
    logScore,
    viterbiPath,
    matrixM: VM,
    matrixI: VI,
    matrixD: VD,
    traceM,
    traceI,
    traceD,
  };
}

/**
 * Forward-Backward Algorithm to calculate posterior state occupancy probabilities.
 */
export function runForwardBackward(model: Plan7Model, querySeq: string): ForwardBackwardResult {
  const seq = querySeq.toUpperCase().replace(/[^A-Z]/g, '');
  const N = seq.length;
  const K = model.K;

  // Forward Matrices
  const FM: number[][] = Array.from({ length: N + 1 }, () => new Array(K + 1).fill(NEG_INF));
  const FI: number[][] = Array.from({ length: N + 1 }, () => new Array(K + 1).fill(NEG_INF));
  const FD: number[][] = Array.from({ length: N + 1 }, () => new Array(K + 1).fill(NEG_INF));

  FM[0][0] = 0; // Begin state

  for (let k = 1; k <= K; k++) {
    FD[0][k] = logSumExp(
      FM[0][k - 1] + Math.log(model.transitions.MD[k - 1] || 1e-6),
      FD[0][k - 1] + Math.log(model.transitions.DD[k - 1] || 1e-6),
    );
  }

  for (let i = 1; i <= N; i++) {
    const ch = seq[i - 1];

    for (let k = 1; k <= K; k++) {
      FD[i][k] = logSumExp(
        FM[i][k - 1] + Math.log(model.transitions.MD[k - 1] || 1e-6),
        FD[i][k - 1] + Math.log(model.transitions.DD[k - 1] || 1e-6),
      );
    }

    for (let k = 1; k <= K; k++) {
      const eM = model.matchEmissions[k]?.[ch] || model.background[ch] || 1e-6;
      const logE = Math.log(eM);

      const sumPrev = logSumExpArray([
        FM[i - 1][k - 1] + Math.log(model.transitions.MM[k - 1] || 1e-6),
        FI[i - 1][k - 1] + Math.log(model.transitions.IM[k - 1] || 1e-6),
        FD[i - 1][k - 1] + Math.log(model.transitions.DM[k - 1] || 1e-6),
      ]);
      FM[i][k] = logE + sumPrev;
    }

    for (let k = 0; k <= K; k++) {
      const eI = model.insertEmissions[k]?.[ch] || model.background[ch] || 1e-6;
      const logE = Math.log(eI);

      const sumPrev = logSumExp(
        FM[i - 1][k] + Math.log(model.transitions.MI[k] || 1e-6),
        FI[i - 1][k] + Math.log(model.transitions.II[k] || 1e-6),
      );
      FI[i][k] = logE + sumPrev;
    }
  }

  const logLikelihood = logSumExpArray([FM[N][K], FD[N][K], FI[N][K]]);

  // Backward Matrices
  const BM: number[][] = Array.from({ length: N + 1 }, () => new Array(K + 1).fill(NEG_INF));
  const BI: number[][] = Array.from({ length: N + 1 }, () => new Array(K + 1).fill(NEG_INF));
  const BD: number[][] = Array.from({ length: N + 1 }, () => new Array(K + 1).fill(NEG_INF));

  BM[N][K] = 0;
  BD[N][K] = 0;
  BI[N][K] = 0;

  for (let i = N; i >= 0; i--) {
    const nextCh = i < N ? seq[i] : '';

    for (let k = K; k >= 0; k--) {
      if (i < N && k < K) {
        const nextEM = Math.log(model.matchEmissions[k + 1]?.[nextCh] || model.background[nextCh] || 1e-6);
        BM[i][k] = logSumExp(
          BM[i][k],
          Math.log(model.transitions.MM[k] || 1e-6) + nextEM + BM[i + 1][k + 1],
        );
      }
      if (i < N) {
        const nextEI = Math.log(model.insertEmissions[k]?.[nextCh] || model.background[nextCh] || 1e-6);
        BM[i][k] = logSumExp(
          BM[i][k],
          Math.log(model.transitions.MI[k] || 1e-6) + nextEI + BI[i + 1][k],
        );
      }
    }
  }

  // Posterior Probabilities: P(pi_i = M_k | x) = exp(FM[i][k] + BM[i][k] - logLikelihood)
  const posteriorM: number[][] = Array.from({ length: N + 1 }, () => new Array(K + 1).fill(0));
  for (let i = 1; i <= N; i++) {
    for (let k = 1; k <= K; k++) {
      const logPost = FM[i][k] + BM[i][k] - logLikelihood;
      posteriorM[i][k] = Math.max(0, Math.min(1, Math.exp(logPost)));
    }
  }

  return {
    logLikelihood,
    forwardM: FM,
    forwardI: FI,
    forwardD: FD,
    backwardM: BM,
    backwardI: BI,
    backwardD: BD,
    posteriorM,
  };
}
