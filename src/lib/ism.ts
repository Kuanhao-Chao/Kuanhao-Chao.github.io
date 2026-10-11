/** Synthetic splice-site scorer and exhaustive single-base mutagenesis.
 * No learned checkpoint, human-locus validation or clinical interpretation.
 */
export type SpliceSiteType = 'donor' | 'acceptor' | 'auto';
export interface MutationScore {
  base: string;
  score: number;
  delta: number;
  effectClass: 'disruption' | 'neutral' | 'gain';
}
export interface IsmPositionRecord {
  index: number;
  positionLabel: string;
  refBase: string;
  refScore: number;
  importance: number;
  mutations: Record<string, MutationScore>;
}
export interface IsmPreset {
  id: string;
  name: string;
  gene: string;
  type: 'donor' | 'acceptor';
  junctionCoord: number;
  sequence: string;
  description: string;
  clinicalNote: string;
}
export interface IsmResult {
  sequence: string;
  siteType: 'donor' | 'acceptor';
  junctionIndex: number;
  refDonorScore: number;
  refAcceptorScore: number;
  primaryRefScore: number;
  positions: IsmPositionRecord[];
  evaluations: number;
  maxImportance: number;
  mostSensitivePosition: { index: number; label: string; importance: number; refBase: string };
  mostDisruptiveMutation: {
    index: number;
    label: string;
    refBase: string;
    mutBase: string;
    delta: number;
  };
}
export const ISM_PRESETS: IsmPreset[] = [
  {
    id: 'synthetic-donor',
    name: 'Synthetic canonical donor',
    gene: 'Synthetic',
    type: 'donor',
    junctionCoord: 3,
    sequence: 'CAGGTAAGTAAGT',
    description: 'Handwritten motif example CAG|GTAAGT, with neutral trailing context.',
    clinicalNote: 'Not a clinical variant or a validated human locus.',
  },
  {
    id: 'synthetic-acceptor',
    name: 'Synthetic canonical acceptor',
    gene: 'Synthetic',
    type: 'acceptor',
    junctionCoord: 14,
    sequence: 'TTTTTTTTTTTTAGG',
    description: 'Handwritten pyrimidine-rich context ending AG|G.',
    clinicalNote: 'No biological or clinical calibration.',
  },
  {
    id: 'synthetic-weak',
    name: 'Synthetic weak donor',
    gene: 'Synthetic',
    type: 'donor',
    junctionCoord: 3,
    sequence: 'CAGATAAGT',
    description: 'A noncanonical first intronic base permits a positive score change on A→G.',
    clinicalNote: 'Score gain is not evidence of a pathogenic gain-of-function variant.',
  },
];
// Every weight below is a declared teaching choice, NOT a fitted frequency.
export const DONOR_PWM: Record<string, number>[] = [
  { A: 0.35, C: 0.35, G: 0.15, T: 0.15 }, // -3 (Exon)
  { A: 0.6, C: 0.15, G: 0.15, T: 0.1 }, // -2 (Exon)
  { A: 0.1, C: 0.05, G: 0.8, T: 0.05 }, // -1 (Exon G)
  { A: 0.01, C: 0.01, G: 0.97, T: 0.01 }, // +1 (Intron Invariant G)
  { A: 0.01, C: 0.01, G: 0.01, T: 0.97 }, // +2 (Intron Invariant T/U)
  { A: 0.55, C: 0.05, G: 0.35, T: 0.05 }, // +3 (Intron A/G)
  { A: 0.7, C: 0.08, G: 0.12, T: 0.1 }, // +4 (Intron A)
  { A: 0.15, C: 0.1, G: 0.7, T: 0.05 }, // +5 (Intron G)
  { A: 0.15, C: 0.15, G: 0.2, T: 0.5 }, // +6 (Intron T)
];

export const ACCEPTOR_PWM: Record<string, number>[] = [
  { A: 0.1, C: 0.45, G: 0.05, T: 0.4 }, // -14 (Poly-Y)
  { A: 0.1, C: 0.45, G: 0.05, T: 0.4 }, // -13 (Poly-Y)
  { A: 0.1, C: 0.45, G: 0.05, T: 0.4 }, // -12 (Poly-Y)
  { A: 0.1, C: 0.45, G: 0.05, T: 0.4 }, // -11 (Poly-Y)
  { A: 0.1, C: 0.45, G: 0.05, T: 0.4 }, // -10 (Poly-Y)
  { A: 0.1, C: 0.45, G: 0.05, T: 0.4 }, // -9 (Poly-Y)
  { A: 0.1, C: 0.45, G: 0.05, T: 0.4 }, // -8 (Poly-Y)
  { A: 0.1, C: 0.45, G: 0.05, T: 0.4 }, // -7 (Poly-Y)
  { A: 0.1, C: 0.45, G: 0.05, T: 0.4 }, // -6 (Poly-Y)
  { A: 0.1, C: 0.45, G: 0.05, T: 0.4 }, // -5 (Poly-Y)
  { A: 0.2, C: 0.4, G: 0.1, T: 0.3 }, // -4 (Poly-Y / N)
  { A: 0.05, C: 0.65, G: 0.02, T: 0.28 }, // -3 (Intron C > T)
  { A: 0.98, C: 0.01, G: 0.01, T: 0.0 }, // -2 (Intron Invariant A)
  { A: 0.01, C: 0.01, G: 0.98, T: 0.0 }, // -1 (Intron Invariant G)
  { A: 0.25, C: 0.15, G: 0.55, T: 0.05 }, // +1 (Exon G)
];

function validate(raw: string, junction: number, type: 'donor' | 'acceptor'): string {
  const seq = raw.trim().toUpperCase();
  if (!/^[ACGT]+$/.test(seq))
    throw new Error(
      'Enter nonempty DNA using ACGT only. No fallback sequence or silent stripping.'
    );
  if (seq.length > 120) throw new Error('Teaching ISM limit: 120 bases.');
  const left = type === 'donor' ? 3 : 14,
    right = type === 'donor' ? 6 : 1;
  if (!Number.isInteger(junction) || junction < left || junction + right > seq.length)
    throw new Error(
      `This ${type} scorer needs ${left} bases before and ${right} bases after the junction boundary.`
    );
  return seq;
}
export function explainSyntheticSpliceScore(
  raw: string,
  junction: number,
  type: 'donor' | 'acceptor'
) {
  const seq = validate(raw, junction, type),
    pwm = type === 'donor' ? DONOR_PWM : ACCEPTOR_PWM;
  const windowStart = junction - (type === 'donor' ? 3 : 14);
  const contributions = pwm.map((weights, i) => ({
    index: windowStart + i,
    base: seq[windowStart + i],
    weight: weights[seq[windowStart + i]],
    logOdds: Math.log2(Math.max(weights[seq[windowStart + i]], 0.001) / 0.25),
  }));
  const logOdds = contributions.reduce((sum, c) => sum + c.logOdds, 0);
  const core =
    type === 'donor' ? seq.slice(junction, junction + 2) : seq.slice(junction - 2, junction);
  const gate =
    type === 'donor' ? (core === 'GT' || core === 'GC' ? 1 : 0.03) : core === 'AG' ? 1 : 0.03;
  const score = Math.min(0.99, Math.max(0.01, gate / (1 + Math.exp(-0.85 * (logOdds - 2)))));
  return { windowStart, contributions, logOdds, gate, score };
}
export function predictSpliceScores(
  raw: string,
  junction: number,
  type: 'donor' | 'acceptor'
): { donorScore: number; acceptorScore: number } {
  const { score } = explainSyntheticSpliceScore(raw, junction, type);
  return {
    donorScore: type === 'donor' ? score : 0,
    acceptorScore: type === 'acceptor' ? score : 0,
  };
}
export function computeIsm(
  raw: string,
  preferredType: SpliceSiteType = 'auto',
  customJunctionIndex?: number
): IsmResult {
  const seq = raw.trim().toUpperCase();
  let siteType: 'donor' | 'acceptor' = preferredType === 'acceptor' ? 'acceptor' : 'donor';
  let junctionIndex = customJunctionIndex;
  if (preferredType === 'auto' && junctionIndex === undefined) {
    const donor = [...seq].findIndex(
      (_, i) => i >= 3 && i + 6 <= seq.length && seq.slice(i, i + 2) === 'GT'
    );
    const acceptor = [...seq].findIndex(
      (_, i) => i >= 12 && i + 3 <= seq.length && seq.slice(i, i + 2) === 'AG'
    );
    if (donor >= 0) junctionIndex = donor;
    else if (acceptor >= 0) {
      siteType = 'acceptor';
      junctionIndex = acceptor + 2;
    }
  }
  if (junctionIndex === undefined)
    throw new Error('Specify a junction boundary with a complete scoring window.');
  validate(seq, junctionIndex, siteType);
  const primaryRefScore = explainSyntheticSpliceScore(seq, junctionIndex, siteType).score;
  const positions: IsmPositionRecord[] = [];
  let lowest = { index: 0, label: '', refBase: seq[0], mutBase: seq[0], delta: Infinity };
  for (let i = 0; i < seq.length; i++) {
    const label = i < junctionIndex ? String(i - junctionIndex) : `+${i - junctionIndex + 1}`;
    const mutations: Record<string, MutationScore> = {};
    let absoluteDelta = 0;
    for (const base of ['A', 'C', 'G', 'T']) {
      const score =
        base === seq[i]
          ? primaryRefScore
          : explainSyntheticSpliceScore(
              seq.slice(0, i) + base + seq.slice(i + 1),
              junctionIndex,
              siteType
            ).score;
      const delta = score - primaryRefScore;
      mutations[base] = {
        base,
        score,
        delta,
        effectClass: delta < -1e-12 ? 'disruption' : delta > 1e-12 ? 'gain' : 'neutral',
      };
      if (base !== seq[i]) {
        absoluteDelta += Math.abs(delta);
        if (delta < lowest.delta)
          lowest = { index: i, label, refBase: seq[i], mutBase: base, delta };
      }
    }
    positions.push({
      index: i,
      positionLabel: label,
      refBase: seq[i],
      refScore: primaryRefScore,
      importance: absoluteDelta / 3,
      mutations,
    });
  }
  const sensitive = positions.reduce(
    (best, p) => (p.importance > best.importance ? p : best),
    positions[0]
  );
  return {
    sequence: seq,
    siteType,
    junctionIndex,
    refDonorScore: siteType === 'donor' ? primaryRefScore : 0,
    refAcceptorScore: siteType === 'acceptor' ? primaryRefScore : 0,
    primaryRefScore,
    positions,
    evaluations: 1 + 3 * seq.length,
    maxImportance: sensitive.importance,
    mostSensitivePosition: {
      index: sensitive.index,
      label: sensitive.positionLabel,
      importance: sensitive.importance,
      refBase: sensitive.refBase,
    },
    mostDisruptiveMutation: lowest,
  };
}
