/**
 * Generalized Hidden Markov Models (GHMMs / Semi-Markov HMMs) Engine
 * Ab Initio Gene Finding (GENSCAN / AUGUSTUS style)
 * - Explicit State Duration Distributions f_q(d)
 * - Exon-Intron State Machine (Initial, Internal, Terminal, Single Exons & Introns)
 * - Splicing Signals (ATG, GT donor, AG acceptor, TAA/TAG/TGA stop codons)
 * - 3-Periodic Coding Potential Scoring & Reading Frame Tracking
 * - Protein Translation
 */

export type GhmmStateType =
  | 'Intergenic'
  | 'Exon_Init'
  | 'Intron'
  | 'Exon_Int'
  | 'Exon_Term'
  | 'Exon_Single';

export interface GeneFeature {
  id: string;
  type: 'exon' | 'intron' | 'intergenic';
  subType: GhmmStateType;
  start: number; // 1-based inclusive start
  end: number;   // 1-based inclusive end
  length: number;
  sequence: string;
  score: number;
  readingFrame?: number; // 0, 1, 2
}

export interface GhmmResult {
  sequence: string;
  features: GeneFeature[];
  cdsSequence: string;
  proteinTranslation: string;
  totalScore: number;
  exonCount: number;
  intronCount: number;
  stats: {
    gcPercent: number;
    totalLen: number;
    codingLen: number;
  };
}

/** Standard Codon Translation Table */
export const CODON_TABLE: Record<string, string> = {
  ATA: 'I', ATC: 'I', ATT: 'I', ATG: 'M',
  ACA: 'T', ACC: 'T', ACG: 'T', ACT: 'T',
  AAC: 'N', AAT: 'N', AAA: 'K', AAG: 'K',
  AGC: 'S', AGT: 'S', AGA: 'R', AGG: 'R',
  CTA: 'L', CTC: 'L', CTG: 'L', CTT: 'L',
  CCA: 'P', CCC: 'P', CCG: 'P', CCT: 'P',
  CAC: 'H', CAT: 'H', CAA: 'Q', CAG: 'Q',
  CGA: 'R', CGC: 'R', CGG: 'R', CGT: 'R',
  GTA: 'V', GTC: 'V', GTG: 'V', GTT: 'V',
  GCA: 'A', GCC: 'A', GCG: 'A', GCT: 'A',
  GAC: 'D', GAT: 'D', GAA: 'E', GAG: 'E',
  GGA: 'G', GGC: 'G', GGG: 'G', GGT: 'G',
  TCA: 'S', TCC: 'S', TCG: 'S', TCT: 'S',
  TTC: 'F', TTT: 'F', TTA: 'L', TTG: 'L',
  TAC: 'Y', TAT: 'Y', TAA: '*', TAG: '*',
  TGC: 'C', TGT: 'C', TGA: '*', TGG: 'W',
};

export const STOP_CODONS = new Set(['TAA', 'TAG', 'TGA']);

/**
 * Translate CDS nucleotide sequence to amino acids.
 */
export function translateDnaToProtein(cds: string): string {
  const clean = cds.toUpperCase().replace(/[^A-Z]/g, '');
  let protein = '';
  for (let i = 0; i + 2 < clean.length; i += 3) {
    const codon = clean.substring(i, i + 3);
    const aa = CODON_TABLE[codon] || '?';
    if (aa === '*') break;
    protein += aa;
  }
  return protein;
}

/**
 * Evaluate explicit state duration log-probability f_q(d).
 */
export function evaluateDurationScore(state: GhmmStateType, d: number): number {
  if (state === 'Intergenic') {
    // Broad background: peak around 15 bp for demo, min 3
    if (d < 3) return -100;
    const mu = 15;
    return -0.5 * Math.pow((d - mu) / 10, 2);
  }

  if (state === 'Exon_Init' || state === 'Exon_Int' || state === 'Exon_Term' || state === 'Exon_Single') {
    // Exons: biological length peak around 12-24 bp in small demo, min 6, rarely < 6
    if (d < 6) return -200;
    const mu = 15;
    const sigma = 6;
    return -0.5 * Math.pow((d - mu) / sigma, 2) - Math.log(sigma);
  }

  if (state === 'Intron') {
    // Introns: sharp minimum length threshold (d >= 8), log-normal peak around 12-18 bp
    if (d < 8) return -300;
    const mu = 14;
    const sigma = 8;
    return -0.5 * Math.pow((d - mu) / sigma, 2) - Math.log(sigma);
  }

  return 0;
}

/**
 * Evaluate biological emission and signal score for a candidate substring.
 */
export function scoreSegmentEmission(
  seq: string,
  startIdx: number, // 0-based
  len: number,
  state: GhmmStateType,
): { score: number; isValid: boolean } {
  const sub = seq.substring(startIdx, startIdx + len);
  if (sub.length !== len) return { score: -1000, isValid: false };

  let signalScore = 0;

  if (state === 'Intergenic') {
    // Neutral background
    return { score: len * 0.1, isValid: true };
  }

  if (state === 'Exon_Init') {
    // Must start with Start Codon ATG
    if (!sub.startsWith('ATG')) return { score: -500, isValid: false };
    // Must end with Splice Donor GT
    if (!sub.endsWith('GT')) return { score: -500, isValid: false };
    // Check for premature stop codons in reading frame 0
    for (let c = 0; c + 2 < len - 2; c += 3) {
      const codon = sub.substring(c, c + 3);
      if (STOP_CODONS.has(codon)) return { score: -800, isValid: false };
    }
    signalScore += 25.0; // Strong start + donor signal bonus
    return { score: signalScore + len * 0.8, isValid: true };
  }

  if (state === 'Intron') {
    // Intron body flanked by donor GT and acceptor AG
    // In canonical model, Intron starts after donor GT and ends with acceptor AG
    if (!sub.endsWith('AG')) return { score: -500, isValid: false };
    signalScore += 18.0; // Acceptor AG bonus
    return { score: signalScore + len * 0.2, isValid: true };
  }

  if (state === 'Exon_Int') {
    // Internal exon: flanked by acceptor AG (prior) and donor GT (end)
    if (!sub.endsWith('GT')) return { score: -500, isValid: false };
    // Check for premature stop codons
    for (let c = 0; c + 2 < len - 2; c += 3) {
      const codon = sub.substring(c, c + 3);
      if (STOP_CODONS.has(codon)) return { score: -800, isValid: false };
    }
    signalScore += 20.0;
    return { score: signalScore + len * 0.8, isValid: true };
  }

  if (state === 'Exon_Term') {
    // Terminal exon ends with stop codon (TAA, TAG, TGA)
    const endCodon = sub.substring(len - 3);
    if (!STOP_CODONS.has(endCodon)) return { score: -500, isValid: false };
    // Check for premature internal stops
    for (let c = 0; c + 2 < len - 3; c += 3) {
      const codon = sub.substring(c, c + 3);
      if (STOP_CODONS.has(codon)) return { score: -800, isValid: false };
    }
    signalScore += 22.0;
    return { score: signalScore + len * 0.8, isValid: true };
  }

  if (state === 'Exon_Single') {
    // Single exon gene: Starts with ATG, ends with Stop Codon
    if (!sub.startsWith('ATG')) return { score: -500, isValid: false };
    const endCodon = sub.substring(len - 3);
    if (!STOP_CODONS.has(endCodon)) return { score: -500, isValid: false };
    for (let c = 0; c + 2 < len - 3; c += 3) {
      const codon = sub.substring(c, c + 3);
      if (STOP_CODONS.has(codon)) return { score: -800, isValid: false };
    }
    signalScore += 30.0;
    return { score: signalScore + len * 0.9, isValid: true };
  }

  return { score: -1000, isValid: false };
}

/**
 * Valid GHMM State Transitions:
 * Intergenic -> Exon_Init, Exon_Single, Intergenic
 * Exon_Init -> Intron
 * Intron -> Exon_Int, Exon_Term
 * Exon_Int -> Intron
 * Exon_Term -> Intergenic
 * Exon_Single -> Intergenic
 */
export const STATE_TRANSITIONS: Record<GhmmStateType, { next: GhmmStateType; logProb: number }[]> = {
  Intergenic: [
    { next: 'Intergenic', logProb: -0.1 },
    { next: 'Exon_Init', logProb: -0.6 },
    { next: 'Exon_Single', logProb: -1.2 },
  ],
  Exon_Init: [
    { next: 'Intron', logProb: 0.0 },
  ],
  Intron: [
    { next: 'Exon_Int', logProb: -0.5 },
    { next: 'Exon_Term', logProb: -0.7 },
  ],
  Exon_Int: [
    { next: 'Intron', logProb: 0.0 },
  ],
  Exon_Term: [
    { next: 'Intergenic', logProb: 0.0 },
  ],
  Exon_Single: [
    { next: 'Intergenic', logProb: 0.0 },
  ],
};

const ALL_STATES: GhmmStateType[] = [
  'Intergenic',
  'Exon_Init',
  'Intron',
  'Exon_Int',
  'Exon_Term',
  'Exon_Single',
];

/**
 * Execute Semi-Markov Viterbi Dynamic Programming for Gene Finding.
 */
export function runGhmmGeneFinder(dnaInput: string): GhmmResult {
  const seq = dnaInput.toUpperCase().replace(/[^A-Z]/g, '');
  const N = seq.length;

  if (N < 6) {
    return {
      sequence: seq,
      features: [],
      cdsSequence: '',
      proteinTranslation: '',
      totalScore: 0,
      exonCount: 0,
      intronCount: 0,
      stats: { gcPercent: 0, totalLen: N, codingLen: 0 },
    };
  }

  // DP State Table: V[i][q] = best score ending at position i in state q
  const V: Record<GhmmStateType, number[]> = {
    Intergenic: new Array(N + 1).fill(-Infinity),
    Exon_Init: new Array(N + 1).fill(-Infinity),
    Intron: new Array(N + 1).fill(-Infinity),
    Exon_Int: new Array(N + 1).fill(-Infinity),
    Exon_Term: new Array(N + 1).fill(-Infinity),
    Exon_Single: new Array(N + 1).fill(-Infinity),
  };

  // Traceback Pointers: Best duration d and best previous state q'
  const traceD: Record<GhmmStateType, number[]> = {
    Intergenic: new Array(N + 1).fill(0),
    Exon_Init: new Array(N + 1).fill(0),
    Intron: new Array(N + 1).fill(0),
    Exon_Int: new Array(N + 1).fill(0),
    Exon_Term: new Array(N + 1).fill(0),
    Exon_Single: new Array(N + 1).fill(0),
  };

  const tracePrev: Record<GhmmStateType, GhmmStateType[]> = {
    Intergenic: new Array(N + 1).fill('Intergenic'),
    Exon_Init: new Array(N + 1).fill('Intergenic'),
    Intron: new Array(N + 1).fill('Exon_Init'),
    Exon_Int: new Array(N + 1).fill('Intron'),
    Exon_Term: new Array(N + 1).fill('Intron'),
    Exon_Single: new Array(N + 1).fill('Intergenic'),
  };

  // Base state at position 0
  V['Intergenic'][0] = 0;

  // Duration search ranges per state
  const minDuration: Record<GhmmStateType, number> = {
    Intergenic: 3,
    Exon_Init: 6,
    Intron: 8,
    Exon_Int: 6,
    Exon_Term: 6,
    Exon_Single: 9,
  };

  const maxDuration: Record<GhmmStateType, number> = {
    Intergenic: 40,
    Exon_Init: 36,
    Intron: 40,
    Exon_Int: 36,
    Exon_Term: 36,
    Exon_Single: 60,
  };

  // Semi-Markov DP Fill: loop over end position i
  for (let i = 3; i <= N; i++) {
    for (const q of ALL_STATES) {
      const minD = minDuration[q];
      const maxD = Math.min(i, maxDuration[q]);

      for (let d = minD; d <= maxD; d++) {
        const startIdx = i - d; // 0-based start

        const { score: emitScore, isValid } = scoreSegmentEmission(seq, startIdx, d, q);
        if (!isValid) continue;

        const durScore = evaluateDurationScore(q, d);

        // Find best predecessor state q'
        for (const qPrev of ALL_STATES) {
          const prevScore = V[qPrev][startIdx];
          if (prevScore === -Infinity) continue;

          // Check if transition qPrev -> q is valid
          const transObj = STATE_TRANSITIONS[qPrev].find((t) => t.next === q);
          if (!transObj) continue;

          const candidate = prevScore + transObj.logProb + durScore + emitScore;

          if (candidate > V[q][i]) {
            V[q][i] = candidate;
            traceD[q][i] = d;
            tracePrev[q][i] = qPrev;
          }
        }
      }
    }
  }

  // Find best terminating state at position N
  let bestFinalState: GhmmStateType = 'Intergenic';
  let bestFinalScore = V['Intergenic'][N];

  for (const q of ALL_STATES) {
    if (V[q][N] > bestFinalScore) {
      bestFinalScore = V[q][N];
      bestFinalState = q;
    }
  }

  // Traceback features
  const featuresRev: GeneFeature[] = [];
  let currPos = N;
  let currState = bestFinalState;
  let featCounter = 0;

  while (currPos > 0) {
    const d = traceD[currState][currPos];
    const prevQ = tracePrev[currState][currPos];

    if (d <= 0) {
      // Fallback unsegmented remainder
      break;
    }

    const start1Based = currPos - d + 1;
    const end1Based = currPos;
    const subSeq = seq.substring(start1Based - 1, end1Based);

    featCounter++;
    const isExon = currState.startsWith('Exon');
    const isIntron = currState === 'Intron';

    featuresRev.push({
      id: `feat_${featCounter}`,
      type: isExon ? 'exon' : isIntron ? 'intron' : 'intergenic',
      subType: currState,
      start: start1Based,
      end: end1Based,
      length: d,
      sequence: subSeq,
      score: V[currState][currPos],
    });

    currPos -= d;
    currState = prevQ;
  }

  const features = featuresRev.reverse();
  features.forEach((f, idx) => (f.id = `feat_${idx + 1}`));

  // Extract CDS sequence from exons
  let cdsSequence = '';
  let codingLen = 0;
  let exonCount = 0;
  let intronCount = 0;

  features.forEach((f) => {
    if (f.type === 'exon') {
      exonCount++;
      // If Initial/Internal exon ends with donor GT, remove the 2bp splice signal from translated CDS
      let exonCds = f.sequence;
      if (f.subType === 'Exon_Init' || f.subType === 'Exon_Int') {
        if (exonCds.endsWith('GT')) {
          exonCds = exonCds.substring(0, exonCds.length - 2);
        }
      }
      cdsSequence += exonCds;
      codingLen += exonCds.length;
    } else if (f.type === 'intron') {
      intronCount++;
    }
  });

  const proteinTranslation = translateDnaToProtein(cdsSequence);

  // GC Content
  let gcCount = 0;
  for (let i = 0; i < N; i++) {
    if (seq[i] === 'G' || seq[i] === 'C') gcCount++;
  }
  const gcPercent = (gcCount / N) * 100;

  return {
    sequence: seq,
    features,
    cdsSequence,
    proteinTranslation,
    totalScore: bestFinalScore > -1e5 ? bestFinalScore : 0,
    exonCount,
    intronCount,
    stats: {
      gcPercent,
      totalLen: N,
      codingLen,
    },
  };
}
