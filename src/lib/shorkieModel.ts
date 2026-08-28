/**
 * Shorkie: architecture facts, sequence encoding, and the live conv-stem forward pass.
 *
 * Pure module -- no DOM, no ONNX. It exists so that the numbers the playground draws can be
 * unit-tested against the real model, and so the 60 FPS path has something to run that is not a
 * heuristic standing in for a network.
 *
 * Two inference paths share this file:
 *   - the LIVE path runs `stemActivations` in TypeScript on every keystroke. The conv stem is
 *     11 x 4 x 96 = 4,224 weights, so a few hundred bases cost microseconds, and it is the one
 *     layer where "which neuron fired" has a clean reading: each filter is a motif detector.
 *   - the FULL path runs the exported ONNX graph and is debounced; this module supplies its
 *     coordinate arithmetic and input encoding.
 *
 * Every constant below was read out of the released f0 checkpoint, not out of the paper. Where
 * the two disagree the checkpoint wins, and the disagreements are recorded in SPEC_NOTES because
 * a reader comparing this page to the Methods section will otherwise think the page is wrong.
 */

export const SEQ_LEN = 16_384;
export const IN_CHANNELS = 170;
export const N_DNA = 4;
export const N_MASK = 1;
export const N_SPECIES = 165;

/** Determined empirically -- see `scripts/shorkie/sanity_check.py`. Nothing published names it. */
export const SPECIES_S_CEREVISIAE = 109;

export const BLOCK_FILTERS = [96, 128, 160, 192, 256, 320, 384] as const;
export const D_MODEL = 384;
export const N_HEADS = 4;
export const KEY_SIZE = 64;
export const VALUE_SIZE = 96;
export const N_ATTN_LAYERS = 8;
export const N_POS_FEATURES = 32;

export const BOTTLENECK_LEN = SEQ_LEN / 2 ** BLOCK_FILTERS.length; // 128
export const BIN_BP = 16;
export const CROP_BINS = 64;
export const N_BINS = BOTTLENECK_LEN * 2 ** 3 - 2 * CROP_BINS;     // 896
export const CROP_BP = CROP_BINS * BIN_BP;                          // 1024
export const N_TRACKS = 5_215;

export const BASES = ['A', 'C', 'G', 'T'] as const;
export type Base = (typeof BASES)[number];

/** The four output track groups, in the order they are concatenated into the 5,215 channels. */
export const TRACK_GROUPS = [
  { id: 'rnaseq_tf', label: 'RNA-seq · TF perturbation', count: 3053 },
  { id: 'rnaseq_strain', label: 'RNA-seq · 1,000 strains', count: 1014 },
  { id: 'chip_exo', label: 'ChIP-exo', count: 1128 },
  { id: 'chip_mnase', label: 'ChIP-MNase', count: 20 },
] as const;

/**
 * Where the published Methods and the released checkpoint disagree. Surfaced on the page rather
 * than silently resolved, because a visitor holding the paper deserves to know which they are
 * looking at.
 */
export const SPEC_NOTES = [
  {
    topic: 'Input channels',
    paper: 'not stated in the Methods',
    checkpoint: '16,384 x 170 — 4 DNA + 1 mask + 165 species one-hot',
  },
  { topic: 'Attention heads', paper: '8 heads', checkpoint: '4 heads (r_w_bias is [1, 4, 1, 64])' },
  {
    topic: 'Residual block',
    paper: 'BatchNorm → GELU → Conv1D(5 bp)',
    checkpoint: 'adds a second, pointwise Conv1D(1 bp) and a learned per-channel Scale',
  },
  {
    topic: 'Decoder stage',
    paper: 'BatchNorm → GELU → Dense → UpSampling → skip merge',
    checkpoint: 'ends each stage with a SeparableConv1D(3 bp)',
  },
  {
    topic: 'Filter progression',
    paper: '96 → 384 in 32-filter steps',
    checkpoint: '96, 128, 160, 192, 256, 320, 384',
  },
  { topic: 'Parameter count', paper: '13.7 M', checkpoint: '14,253,567' },
] as const;

/** One row of the layer-by-layer walkthrough. `positions` is the sequence length at that depth. */
export interface LayerSpec {
  id: string;
  label: string;
  detail: string;
  positions: number;
  channels: number;
}

export function layerSpecs(): LayerSpec[] {
  const out: LayerSpec[] = [
    {
      id: 'stem',
      label: 'Conv stem',
      detail: 'Conv1D, 11 bp kernel, linear activation',
      positions: SEQ_LEN,
      channels: 96,
    },
  ];
  let positions = SEQ_LEN;
  BLOCK_FILTERS.forEach((filters, i) => {
    out.push({
      id: `block${i + 1}`,
      label: `Residual block ${i + 1}`,
      detail: 'BatchNorm → GELU → Conv1D(5) → BatchNorm → GELU → Conv1D(1) → Scale → add → MaxPool(2)',
      positions,
      channels: filters,
    });
    positions /= 2;
  });
  for (let i = 0; i < N_ATTN_LAYERS; i += 1) {
    out.push({
      id: `attn${i + 1}`,
      label: `Transformer layer ${i + 1}`,
      detail: `LayerNorm → ${N_HEADS}-head relative attention (key ${KEY_SIZE}, value ${VALUE_SIZE}) → FFN`,
      positions: BOTTLENECK_LEN,
      channels: D_MODEL,
    });
  }
  [256, 512, 1024].forEach((positionsAt, i) => {
    out.push({
      id: `decoder${i + 1}`,
      label: `U-Net stage ${i + 1}`,
      detail: `upsample x2, merge skip from residual block ${7 - i}, SeparableConv1D(3)`,
      positions: positionsAt,
      channels: D_MODEL,
    });
  });
  out.push({
    id: 'head',
    label: 'Output head',
    detail: `crop ${CROP_BINS} bins each end → GELU → Dense → Softplus`,
    positions: N_BINS,
    channels: N_TRACKS,
  });
  return out;
}

export function isBase(ch: string): ch is Base {
  return ch === 'A' || ch === 'C' || ch === 'G' || ch === 'T';
}

/** Uppercase, strip anything that is not ACGT. Returns the cleaned sequence. */
export function cleanSequence(raw: string): string {
  return raw.toUpperCase().replace(/[^ACGT]/g, '');
}

/**
 * The full 16,384 x 170 input the ONNX graph expects, laid out position-major to match the
 * Keras contract. The mask channel stays zero at inference; the species one-hot is constant
 * across positions.
 */
export function encodeInput(sequence: string, species = SPECIES_S_CEREVISIAE): Float32Array {
  const x = new Float32Array(SEQ_LEN * IN_CHANNELS);
  const speciesChannel = N_DNA + N_MASK + species;
  for (let i = 0; i < SEQ_LEN; i += 1) {
    const base = i < sequence.length ? sequence[i] : 'N';
    const row = i * IN_CHANNELS;
    const j = BASES.indexOf(base as Base);
    if (j >= 0) x[row + j] = 1;
    x[row + speciesChannel] = 1;
  }
  return x;
}

export interface StemWeights {
  kernelWidth: number;
  filters: number;
  weights: number[]; // flattened [position][base][filter]
  bias: number[];
}

export interface StemActivation {
  /** [filter][position], length = sequence.length - kernelWidth + 1 */
  map: Float32Array;
  positions: number;
  filters: number;
  /** Peak activation per filter, and where it occurred. */
  peak: Float32Array;
  peakAt: Int32Array;
}

/**
 * The real conv stem, run over a typed sequence.
 *
 * Valid on its own: a convolution is translation-equivariant and carries no positional state, so
 * running it on 300 bases gives exactly the activations those bases would produce inside a full
 * window. That is not true of anything downstream of the first pooling layer, which is why the
 * live path stops here and the rest of the network is driven by the ONNX graph.
 */
export function stemActivations(sequence: string, w: StemWeights): StemActivation {
  const { kernelWidth: k, filters: f } = w;
  const positions = Math.max(0, sequence.length - k + 1);
  const map = new Float32Array(f * positions);
  const peak = new Float32Array(f).fill(-Infinity);
  const peakAt = new Int32Array(f);

  const code = new Int8Array(sequence.length);
  for (let i = 0; i < sequence.length; i += 1) code[i] = BASES.indexOf(sequence[i] as Base);

  for (let p = 0; p < positions; p += 1) {
    for (let fi = 0; fi < f; fi += 1) {
      let sum = w.bias[fi];
      for (let ki = 0; ki < k; ki += 1) {
        const b = code[p + ki];
        if (b < 0) continue; // N contributes nothing, matching a zero one-hot column
        sum += w.weights[(ki * N_DNA + b) * f + fi];
      }
      map[fi * positions + p] = sum;
      if (sum > peak[fi]) {
        peak[fi] = sum;
        peakAt[fi] = p;
      }
    }
  }
  return { map, positions, filters: f, peak, peakAt };
}

/**
 * A filter rendered as a position weight matrix for a sequence logo: per position, the weight of
 * each base relative to that position's mean, which is what makes the preferred base legible.
 */
export function filterLogo(index: number, w: StemWeights): number[][] {
  const rows: number[][] = [];
  for (let ki = 0; ki < w.kernelWidth; ki += 1) {
    const raw = BASES.map((_, b) => w.weights[(ki * N_DNA + b) * w.filters + index]);
    const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
    rows.push(raw.map((v) => v - mean));
  }
  return rows;
}

/** Bin index -> genomic offset within the window, accounting for the cropped flanks. */
export function binToWindowOffset(bin: number): number {
  return CROP_BP + bin * BIN_BP;
}

export function windowOffsetToBin(offset: number): number {
  return Math.floor((offset - CROP_BP) / BIN_BP);
}

/** Substitute one base, returning a new sequence. Out-of-range indices are a no-op. */
export function mutate(sequence: string, index: number, base: Base): string {
  if (index < 0 || index >= sequence.length) return sequence;
  return sequence.slice(0, index) + base + sequence.slice(index + 1);
}
