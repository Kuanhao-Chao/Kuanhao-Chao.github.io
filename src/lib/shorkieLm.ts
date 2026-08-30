/**
 * Shorkie_LM — the pure layer.
 *
 * The language model is the same encoder as Shorkie with a different decoder: seven U-Net stages
 * instead of three, so it upsamples all the way back to 16,384 positions, and a four-unit softmax
 * head instead of a 5,215-unit softplus one. It answers "what belongs at this base", where Shorkie
 * answers "what does this sequence express".
 *
 * Nothing here touches the DOM. The numbers a panel prints come from this module and its tests, so
 * a control cannot contradict the prose beside it.
 */

import { BASES, type Base } from './shorkieModel';

/** The architecture, as read from the released checkpoint's own `params.json`. */
export const LM_SPEC = {
  seqLength: 16_384,
  /** 4 DNA + 1 never-written + 165 species. The docs say "166 species"; that is the known mislabel. */
  inputChannels: 170,
  bottleneck: 128,
  transformerLayers: 8,
  residualBlocks: 7,
  /** Seven, against Shorkie's three: 128 x 2^7 = 16,384, so the LM resolves single bases. */
  unetStages: 7,
  headUnits: 4,
  headActivation: 'softmax' as const,
  /** Exact, from the released checkpoint: 13,651,812 parameters + 14,016 batch-norm statistics. */
  parameters: 13_651_812,
  checkpointValues: 13_665_828,
  /** The pretraining mask rate the iterative reconstruction matches. */
  maskRate: 0.15,
  species: 165,
} as const;

/**
 * Which pass a probability came from. These are three different quantities and the page must never
 * present one as another.
 *
 * `unmasked` lets the model see the base it is scoring, so it is largely copying its own input
 * (97.8% argmax across a window) and is not a prediction. `masked` is the iterative reconstruction
 * at the model's own training mask rate, which is (43.0% argmax, 1.757 bits). `single` masks one
 * base alone.
 */
export type LmPass = 'unmasked' | 'masked' | 'single';

/** Shannon entropy of one four-way distribution, in bits. 0 = certain, 2 = uniform. */
export function entropyBits(p: ArrayLike<number>): number {
  let h = 0;
  for (let i = 0; i < 4; i += 1) {
    const v = Number(p[i]) || 0;
    if (v > 0) h -= v * Math.log2(v);
  }
  return h;
}

/**
 * Information content: `2 - H(p)`, in bits.
 *
 * This is the paper's own quantity, verbatim (`conservation = 2 - entropy` in the Figure 2A
 * builder), and it is what makes the LM's logo a *constraint* logo. High IC means the model finds
 * the base strongly determined by its context -- the model's analogue of conservation, computed
 * with no alignment.
 */
export function informationContent(p: ArrayLike<number>): number {
  return 2 - entropyBits(p);
}

/**
 * One logo column for the LM: letter heights are `p x IC`, all four bases, stacked ascending.
 *
 * This is the PWM/IC convention, and it is NOT the convention the Shorkie page's attribution logo
 * uses. There, one letter survives per position because the input is one-hot and an attribution is
 * identically zero at the three bases that are not present; heights are signed and sorted by
 * magnitude. Here every base has a probability, nothing is signed, and the axis is a fixed 0-2
 * bits. Same drawing, opposite question.
 */
export function constraintColumn(p: ArrayLike<number>): { base: Base; height: number }[] {
  const ic = Math.max(informationContent(p), 0);
  return BASES
    .map((base, i) => ({ base, height: (Number(p[i]) || 0) * ic }))
    .sort((a, b) => a.height - b.height);
}

/** Cross-entropy of the reference base under the model, in bits: `-log2 p(ref)`. */
export function crossEntropyBits(p: ArrayLike<number>, ref: Base | string): number | null {
  const i = BASES.indexOf(String(ref).toUpperCase() as Base);
  if (i < 0) return null;
  const v = Number(p[i]) || 0;
  return -Math.log2(Math.max(v, 1e-12));
}

/**
 * Undo the pack's per-row quantisation.
 *
 * Probabilities are stored in log space, not linear: the quantity every panel displays is the
 * entropy, and `-p log2 p` is steepest exactly where p is small, which is where a linear uint8
 * grid is coarsest. Measured across all fourteen loci, log packing holds the entropy error to
 * <= 0.0198 bits on a 0-2 bit axis; the generator picks the space per locus and records it.
 */
export function dequantizeRow(
  row: ArrayLike<number>,
  lo: number,
  hi: number,
  space: 'linear' | 'log',
): Float64Array {
  const out = new Float64Array(row.length);
  for (let i = 0; i < row.length; i += 1) {
    const v = (Number(row[i]) || 0) / 255 * (hi - lo) + lo;
    out[i] = space === 'log' ? 10 ** v : v;
  }
  return out;
}

/** Renormalise a decoded four-way distribution so it sums to 1 again after quantisation. */
export function renormalise(p: ArrayLike<number>): Float64Array {
  const out = new Float64Array(4);
  let s = 0;
  for (let i = 0; i < 4; i += 1) {
    const v = Math.max(Number(p[i]) || 0, 0);
    out[i] = v;
    s += v;
  }
  if (s <= 0) return Float64Array.from([0.25, 0.25, 0.25, 0.25]);
  for (let i = 0; i < 4; i += 1) out[i] /= s;
  return out;
}

export interface MotifRecall {
  name: string;
  start: number;
  end: number;
  reference: string;
  recalled: string;
  identity: number;
  meanRefProb: number;
}

/**
 * Is a reconstruction actually a reconstruction, or the base-composition prior wearing its shape?
 *
 * Masking a whole site contiguously is not the task this model was trained on -- pretraining masks
 * 15% of positions *scattered*, so every masked base keeps unmasked neighbours. Measured, the LM
 * fills a contiguous hole with homopolymer runs: mean identity 25.3% against a 32.4% floor from
 * simply guessing the window's most common base, and the apparent successes are the A/T-rich sites
 * where poly-A happens to be right. A page that reported identity alone would present that as
 * partial success.
 */
export function beatsCompositionFloor(recall: MotifRecall, floor: number): boolean {
  return recall.identity > floor;
}

/** How much of a reconstruction is a single repeated base -- the homopolymer tell. */
export function homopolymerFraction(seq: string): number {
  if (!seq.length) return 0;
  const counts = new Map<string, number>();
  for (const c of seq.toUpperCase()) counts.set(c, (counts.get(c) ?? 0) + 1);
  return Math.max(...counts.values()) / seq.length;
}

/**
 * Project [n x d] onto its first two principal components, mean-centred.
 *
 * Deterministic, unlike the t-SNE the paper uses for Figure 2E: a reader reloading the page must
 * get the same picture, and a projection whose axes move between visits cannot be described in
 * prose. PCA also keeps distances interpretable -- t-SNE's do not survive being read as distances.
 * The panel says which it is.
 */
export function pca2(data: ArrayLike<number>, n: number, d: number): { x: number; y: number }[] {
  const mean = new Float64Array(d);
  for (let i = 0; i < n; i += 1) for (let j = 0; j < d; j += 1) mean[j] += Number(data[i * d + j]) || 0;
  for (let j = 0; j < d; j += 1) mean[j] /= Math.max(n, 1);

  const centred = new Float64Array(n * d);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < d; j += 1) centred[i * d + j] = (Number(data[i * d + j]) || 0) - mean[j];
  }

  // Power iteration on the d x d covariance, done implicitly: cheaper and stable enough for
  // 128 x 384, and it avoids materialising a 384 x 384 matrix.
  const axis = (exclude: Float64Array | null): Float64Array => {
    let v = new Float64Array(d);
    // A fixed, non-random seed: a projection that changes between reloads cannot be written about.
    for (let j = 0; j < d; j += 1) v[j] = Math.sin(j + 1);
    for (let iter = 0; iter < 64; iter += 1) {
      const next = new Float64Array(d);
      for (let i = 0; i < n; i += 1) {
        let dot = 0;
        for (let j = 0; j < d; j += 1) dot += centred[i * d + j] * v[j];
        for (let j = 0; j < d; j += 1) next[j] += dot * centred[i * d + j];
      }
      if (exclude) {
        let dot = 0;
        for (let j = 0; j < d; j += 1) dot += next[j] * exclude[j];
        for (let j = 0; j < d; j += 1) next[j] -= dot * exclude[j];
      }
      let norm = 0;
      for (let j = 0; j < d; j += 1) norm += next[j] * next[j];
      norm = Math.sqrt(norm);
      if (norm < 1e-12) return v;
      for (let j = 0; j < d; j += 1) next[j] /= norm;
      v = next;
    }
    return v;
  };

  const a1 = axis(null);
  const a2 = axis(a1);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    let x = 0;
    let y = 0;
    for (let j = 0; j < d; j += 1) {
      x += centred[i * d + j] * a1[j];
      y += centred[i * d + j] * a2[j];
    }
    out.push({ x, y });
  }
  return out;
}
