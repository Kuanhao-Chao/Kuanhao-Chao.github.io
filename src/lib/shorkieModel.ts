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

/**
 * The four output track groups, in the order the checkpoint actually emits them.
 *
 * Read from the released targets sheet (`minimal_example/sheet.txt` in calico/shorkie-paper), NOT
 * from the paper: the Methods list the same four counts in a different order, and building this
 * from the paper mislabels the output curve. The measured ORF/intergenic enrichment separates the
 * groups exactly as biology demands and confirms the sheet -- ChIP-exo 1.20 (TF binding is
 * promoter-enriched, not ORF-enriched), ChIP-MNase 1.86, RNA-seq 17.94, 1,000-strain RNA-seq 4.07.
 */
/** The conv stem's kernel width in bp. 11 x 4 x 96 = 4,224 weights -- the live TypeScript path. */
export const STEM_KERNEL = 11;

export const TRACK_GROUPS = [
  { id: 'chip_exo', label: 'ChIP-exo', start: 0, end: 1128, count: 1128, orfEnrichment: 1.2 },
  { id: 'chip_mnase', label: 'ChIP-MNase', start: 1128, end: 1148, count: 20, orfEnrichment: 1.86 },
  { id: 'rnaseq_tf', label: 'RNA-seq · TF induction', start: 1148, end: 4201, count: 3053, orfEnrichment: 17.94 },
  { id: 'rnaseq_strain', label: 'RNA-seq · 1,000 strains', start: 4201, end: 5215, count: 1014, orfEnrichment: 4.07 },
] as const;

/** Index into TRACK_GROUPS of the group the page plots by default. */
export const RNA_SEQ_GROUP = 2;

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
  {
    topic: 'Output track order',
    paper: 'RNA-seq (3,053), 1,000-strain (1,014), ChIP-exo (1,128), ChIP-MNase (20)',
    checkpoint: 'ChIP-exo 0–1127, ChIP-MNase 1128–1147, RNA-seq 1148–4200, 1,000-strain 4201–5214',
  },
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
      detail: `Conv1D, ${STEM_KERNEL} bp kernel, linear activation`,
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

// ---------------------------------------------------------------------------------------------
// Flow-diagram geometry and receptive fields
// ---------------------------------------------------------------------------------------------

export type StageGroup = 'encoder' | 'bottleneck' | 'decoder';

export interface FlowStage extends LayerSpec {
  group: StageGroup;
  /** Horizontal extent in [0, 1] across the diagram. Width is LOG-scaled in *channels*. */
  x: number;
  width: number;
  /** Vertical extent in [0, 1]. Height is LOG-scaled in *positions*. */
  height: number;
  /** Input bases reachable by one unit at this depth. */
  receptiveField: number;
  /** Input bases between neighbouring units at this depth. */
  stride: number;
  /** Encoder stage this decoder stage merges its skip from, if any. */
  skipFrom?: string;
}

/**
 * Receptive field and stride at each depth, by the standard recurrence
 *   r_out = r_in + (k - 1) * j_in,   j_out = j_in * s
 *
 * The conv stem sees 11 bp. Every residual block adds 4 bp of 5-tap convolution then doubles the
 * stride through its MaxPool, so by the bottleneck one position sees 646 bp and neighbouring
 * positions sit 128 bp apart. Attention then makes every bottleneck position see the whole window,
 * which is the entire reason the transformer is there.
 */
export function receptiveFields(): { id: string; receptiveField: number; stride: number }[] {
  const out: { id: string; receptiveField: number; stride: number }[] = [];
  let r = 1;
  let j = 1;
  r += (STEM_KERNEL - 1) * j; // conv stem
  out.push({ id: 'stem', receptiveField: r, stride: j });
  for (let i = 0; i < BLOCK_FILTERS.length; i += 1) {
    r += (5 - 1) * j; // Conv1D(5); the pointwise Conv1D(1) adds nothing
    r += (2 - 1) * j; // MaxPool(2)
    j *= 2;
    out.push({ id: `block${i + 1}`, receptiveField: r, stride: j });
  }
  return out;
}

/**
 * Lay the 20 stages out for the flow canvas.
 *
 * Width is log-scaled in positions and the page says so: at true linear scale the 128-position
 * bottleneck would be 0.8% the width of the 16,384-position stem, and the eight attention layers
 * where the model does its long-range work would be invisible.
 */
export function flowGeometry(): FlowStage[] {
  const specs = layerSpecs();
  const rf = new Map(receptiveFields().map((x) => [x.id, x]));

  // The canonical U-Net encoding: HEIGHT is spatial resolution, WIDTH is channel count. That puts
  // the bottleneck at the visible waist and lets a skip arc connect two stages of equal height,
  // which is exactly what a skip connection joins.
  //
  // Both axes are log-scaled, and both are scaled over the *range* actually present rather than
  // from zero. A raw log flattens this architecture into twenty near-identical boxes: positions
  // span 16,384 to 128, so raw log2 runs only 14 to 7, and channels 96 to 5,215 runs 6.6 to 12.3.
  // Mapping each range onto [MIN_EXTENT, 1] keeps the ordering exactly (it is monotone in the
  // true quantity) while making the differences legible.
  const MIN_EXTENT = 0.26;
  const span = (v: number, lo: number, hi: number) =>
    MIN_EXTENT + (1 - MIN_EXTENT) * ((Math.log2(v) - Math.log2(lo)) / (Math.log2(hi) - Math.log2(lo)));

  const posLo = Math.min(...specs.map((s) => s.positions));
  const posHi = Math.max(...specs.map((s) => s.positions));
  const chLo = Math.min(...specs.map((s) => s.channels));
  const chHi = Math.max(...specs.map((s) => s.channels));

  const rawWidths = specs.map((s) => span(s.channels, chLo, chHi));
  const gap = 0.004;
  const usable = 1 - gap * (specs.length - 1);
  const totalRaw = rawWidths.reduce((a, w) => a + w, 0);

  let cursor = 0;
  return specs.map((spec, i) => {
    const width = (rawWidths[i] / totalRaw) * usable;
    const group: StageGroup = spec.id.startsWith('attn')
      ? 'bottleneck'
      : spec.id.startsWith('decoder') || spec.id === 'head'
        ? 'decoder'
        : 'encoder';
    const height = span(spec.positions, posLo, posHi);
    const bottleneck = rf.get('block7');
    const known = rf.get(spec.id);
    const stage: FlowStage = {
      ...spec,
      group,
      x: cursor,
      width,
      height,
      // Past the encoder every position has seen the whole window, via attention.
      receptiveField: known ? known.receptiveField : SEQ_LEN,
      stride: known ? known.stride : (bottleneck?.stride ?? 128),
      skipFrom: spec.id.startsWith('decoder')
        ? `block${7 - (Number(spec.id.slice('decoder'.length)) - 1)}`
        : undefined,
    };
    cursor += width + gap;
    return stage;
  });
}

/** Which stage the wavefront is crossing at scrub position `t` in [0, 1], and how far into it. */
export function stageAt(t: number, stages: FlowStage[]): { index: number; local: number } {
  const clamped = Math.min(Math.max(t, 0), 1);
  for (let i = 0; i < stages.length; i += 1) {
    const s = stages[i];
    if (clamped <= s.x + s.width || i === stages.length - 1) {
      return { index: i, local: Math.min(Math.max((clamped - s.x) / s.width, 0), 1) };
    }
  }
  return { index: stages.length - 1, local: 1 };
}

/** How many positions every mapped stage is pooled to inside the exported graph. */
export const STAGE_MAP_POSITIONS = 128;

/**
 * Where each stage's channels live inside the single concatenated `stage_maps` tensor.
 *
 * The graph emits one [5760, 128] tensor covering the seven residual blocks, the eight transformer
 * layers and the three decoder stages, in flow order. It used to emit `encoder_maps` and
 * `decoder_maps` separately with the transformer layers missing entirely -- which is why the flow
 * canvas fell back to drawing their attention matrices, an object of a different kind from every
 * other stage's activation map.
 */
export function stageMapOffsets(): {
  id: string;
  start: number;
  channels: number;
  positions: number;
}[] {
  const rows: { id: string; start: number; channels: number; positions: number }[] = [];
  let start = 0;
  const push = (id: string, channels: number) => {
    rows.push({ id, start, channels, positions: STAGE_MAP_POSITIONS });
    start += channels;
  };
  BLOCK_FILTERS.forEach((channels, i) => push(`block${i + 1}`, channels));
  for (let i = 1; i <= N_ATTN_LAYERS; i += 1) push(`attn${i}`, D_MODEL);
  for (let i = 1; i <= 3; i += 1) push(`decoder${i}`, D_MODEL);
  return rows;
}

/**
 * The value range to normalise an activation map against, by percentile rather than min/max.
 *
 * These tensors are heavy-tailed and a handful of outliers set the range, which flattens every
 * other cell onto the same ink. Measured on a real TDH3 forward pass, the interquartile spread of
 * drawn ink under min-max collapses with depth -- block1 0.299, block5 0.092, block7 **0.030** --
 * because block7 spans -19.4..37.4 while its p1..p99 is only -3.4..3.8. Ranging over p1..p99
 * recovers 3-5x the contrast on 10 of the 12 mapped stages.
 *
 * Implemented as a fixed-bin histogram rather than a sort: these arrays run to ~200k values and
 * are re-normalised on every redraw, so this is two linear passes and a walk over 1,024 bins
 * instead of an O(n log n) sort. It never mutates the input. Accurate to one bin width, which is
 * far finer than the ink quantisation it feeds.
 */
export function percentileRange(
  data: ArrayLike<number>,
  loPct = 1,
  hiPct = 99,
  bins = 1024,
): { lo: number; hi: number } {
  const n = data.length;
  if (n === 0) return { lo: 0, hi: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!(max > min)) return { lo: min, hi: min };

  const width = (max - min) / bins;
  const hist = new Int32Array(bins);
  for (let i = 0; i < n; i += 1) {
    const b = Math.min(bins - 1, Math.floor((data[i] - min) / width));
    hist[b] += 1;
  }
  // Walk to the bin holding each rank, then take that bin's lower edge for lo and upper for hi,
  // so the returned range always contains the requested quantiles rather than clipping them.
  const rank = (pct: number) => Math.min(n - 1, Math.max(0, Math.floor((pct / 100) * (n - 1))));
  const loRank = rank(loPct);
  const hiRank = rank(hiPct);
  let seen = 0;
  let lo = min;
  let hi = max;
  let haveLo = false;
  for (let b = 0; b < bins; b += 1) {
    seen += hist[b];
    if (!haveLo && seen > loRank) {
      lo = min + b * width;
      haveLo = true;
    }
    if (seen > hiRank) {
      hi = min + (b + 1) * width;
      break;
    }
  }
  return hi > lo ? { lo, hi } : { lo: min, hi: max };
}

/** Which output-track group a raw track index belongs to. */
export function trackGroupOf(index: number): (typeof TRACK_GROUPS)[number] {
  const group = TRACK_GROUPS.find((g) => index >= g.start && index < g.end);
  if (!group) throw new Error(`track index ${index} is outside 0..${N_TRACKS - 1}`);
  return group;
}

/**
 * How to fold `n` track rows onto `pixels` rows of canvas.
 *
 * 5,215 tracks never fit a screen, so rows are binned and each bin drawn at its maximum. Returns
 * one [start, end) span per drawn row, covering every track exactly once with no empty bin --
 * an empty bin would draw a blank stripe that reads as "this assay predicts nothing".
 */
export function trackRowBinning(n: number, pixels: number): { start: number; end: number }[] {
  if (n <= 0 || pixels <= 0) return [];
  const rows = Math.min(n, Math.floor(pixels));
  const out: { start: number; end: number }[] = [];
  for (let r = 0; r < rows; r += 1) {
    out.push({
      start: Math.floor((r * n) / rows),
      end: Math.floor(((r + 1) * n) / rows),
    });
  }
  return out;
}

/**
 * Map a coverage value onto [0,1] for plotting, on a log scale.
 *
 * RNA-seq coverage spans orders of magnitude and a linear axis scaled to the peak erases
 * everything else: on the TDH3 window the peak is 995 while 642 of the 896 bins are above 1.0 and
 * at least three separate transcribed regions exist. On a linear axis those are all invisible.
 * log1p keeps zero at zero -- coverage really can be zero, and a bare log cannot say so.
 */
export function logAxis(value: number, max: number): number {
  if (!(max > 0)) return 0;
  const v = Math.min(Math.max(value, 0), max);
  return Math.log1p(v) / Math.log1p(max);
}

/**
 * Pearson correlation between a predicted track and a measured one.
 *
 * This is the number that carries the ground-truth comparison on the playground, so it lives here
 * with the rest of the tested arithmetic rather than in the DOM layer. Returns NaN when either
 * series is constant -- a flat track has no correlation with anything, and reporting 0 for it
 * would read as "uncorrelated" when the truth is "undefined".
 */
export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i += 1) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : NaN;
}

/**
 * Map a raw activation onto the ink a cell is drawn with.
 *
 * `floor` is a statement about the *activation*: nothing below that fraction of the tensor's range
 * is drawn at all, which is what keeps a hundred thousand near-baseline cells from fogging the
 * raster. The square root is a statement about the *ink*: above the floor a linear ramp puts almost
 * everything at a few percent alpha, because a handful of large activations set `hi`. Keeping the
 * two separate means raising the floor removes cells and never dims the ones that remain.
 *
 * Monotone throughout, so a brighter cell is always a larger activation.
 */
export function activationInk(value: number, lo: number, hi: number, floor = 0.18): number {
  const span = Math.max(hi - lo, 1e-9);
  const v = Math.min(Math.max((value - lo) / span, 0), 1);
  return v < floor ? 0 : Math.sqrt((v - floor) / (1 - floor));
}

/** One operation inside a stage, with the tensor it produces. */
export interface SubLayer {
  op: string;
  positions: number;
  channels: number;
  /**
   * True for the pooling step that hands this stage's output to the next one. The stage's own
   * recorded activation is taken BEFORE it -- `acts["block1"]` is [96, 16384], not [96, 8192] --
   * so the shape a stage advertises is the shape of the last non-handoff row, and the handoff row
   * is where the resolution visibly halves.
   */
  handoff?: boolean;
}

/**
 * The operations inside one stage, each with the shape of the tensor it hands on.
 *
 * `layerSpecs()` gives a stage's *output* shape and an arrow-separated prose string; this expands
 * that into the real sequence, so the detail view can show where the resolution halves and where
 * the channel count changes rather than asserting it in a caption. The channel change inside a
 * residual block happens at the 5 bp convolution -- the skip is taken *after* it (the checkpoint
 * wires `add <- [conv1d_1, scale]`), so the residual add is between two tensors that already
 * carry the block's output width.
 */
export function subLayers(spec: LayerSpec): SubLayer[] {
  const { positions: p, channels: c } = spec;

  if (spec.id === 'stem') {
    return [{ op: `Conv1D, ${STEM_KERNEL} bp kernel, linear`, positions: p, channels: c }];
  }

  if (spec.id.startsWith('block')) {
    const i = Number(spec.id.slice('block'.length)) - 1;
    const inC = i === 0 ? 96 : BLOCK_FILTERS[i - 1];
    return [
      { op: 'BatchNorm', positions: p, channels: inC },
      { op: 'GELU', positions: p, channels: inC },
      { op: 'Conv1D(5)', positions: p, channels: c },
      { op: 'BatchNorm', positions: p, channels: c },
      { op: 'GELU', positions: p, channels: c },
      { op: 'Conv1D(1)', positions: p, channels: c },
      { op: 'Scale', positions: p, channels: c },
      { op: 'add (residual)', positions: p, channels: c },
      { op: `MaxPool(2) → block ${i + 2}`, positions: p / 2, channels: c, handoff: true },
    ];
  }

  if (spec.id.startsWith('attn')) {
    return [
      { op: 'LayerNorm', positions: p, channels: c },
      {
        op: `${N_HEADS}-head relative attention (key ${KEY_SIZE}, value ${VALUE_SIZE})`,
        positions: p,
        channels: c,
      },
      { op: 'add (residual)', positions: p, channels: c },
      { op: 'LayerNorm', positions: p, channels: c },
      { op: 'feed-forward', positions: p, channels: c },
      { op: 'add (residual)', positions: p, channels: c },
    ];
  }

  if (spec.id.startsWith('decoder')) {
    const i = Number(spec.id.slice('decoder'.length)) - 1;
    return [
      { op: 'BatchNorm → GELU → Conv1D(1)', positions: p / 2, channels: c },
      { op: 'upsample x2 (nearest)', positions: p, channels: c },
      { op: `add skip from residual block ${7 - i}`, positions: p, channels: c },
      { op: 'SeparableConv1D(3)', positions: p, channels: c },
    ];
  }

  return [
    { op: `crop ${CROP_BINS} bins each end`, positions: p, channels: D_MODEL },
    { op: 'GELU', positions: p, channels: D_MODEL },
    { op: 'Dense', positions: p, channels: c },
    { op: 'Softplus', positions: p, channels: c },
  ];
}

/**
 * Scramble one span of a sequence, leaving everything else byte-identical.
 *
 * This is the interactive stand-in for Figure 4's saturation mutagenesis. Full ISM over a 500 bp
 * promoter is 1,500 forward passes; knocking out one motif and re-running is one, and it answers
 * the question the figure is actually asking -- does this motif carry the prediction?
 *
 * A shuffle rather than a poly-A or random replacement, so GC content and base composition are
 * unchanged and the only thing destroyed is the ORDER that makes the motif a motif. Seeded, so a
 * given knockout is reproducible and two readers see the same number.
 */
export function knockoutMotif(sequence: string, start: number, end: number, seed = 1): string {
  const lo = Math.max(0, Math.min(start, sequence.length));
  const hi = Math.max(lo, Math.min(end, sequence.length));
  if (hi - lo < 2) return sequence;

  const span = [...sequence.slice(lo, hi)];
  // A small deterministic LCG; Math.random() is not available to this module's tests and would
  // make the result unreproducible anyway.
  let state = (seed >>> 0) || 1;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let i = span.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [span[i], span[j]] = [span[j], span[i]];
  }
  return sequence.slice(0, lo) + span.join('') + sequence.slice(hi);
}

/**
 * The bins a motif knockout should be judged over: the body of the gene the window is named for.
 *
 * Judging by the peak of the whole 896-bin window is wrong, and quietly so. A 14,336 bp yeast
 * window holds a dozen genes, and the tallest is usually not the one whose promoter you edited --
 * on the KRE33 window the global peak is 114.3 at bin 249 (YNL135C) while KRE33's own body peaks
 * at 7.8 around bin 460. Knocking out KRE33's RRPE site then moves the global peak by 0.4%, which
 * reads as "this motif does nothing" when the truth is "you measured the wrong gene".
 *
 * Returns null when the named gene is not among the annotated features, so the caller can say it
 * is falling back rather than silently measuring something else.
 */
export function geneBodyBins(
  features: { name: string; start: number; end: number }[],
  id: string,
): { start: number; end: number } | null {
  const own = features.filter((f) => f.name === id);
  if (!own.length) return null;
  return {
    start: Math.min(...own.map((f) => f.start)),
    end: Math.max(...own.map((f) => f.end)),
  };
}
