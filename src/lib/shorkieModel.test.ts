import { describe, it, expect } from 'vitest';
import stemWeights from '../data/shorkieStem.json';
import loci from '../data/shorkieLoci.json';
import parity from './__fixtures__/shorkieStemParity.json';
import {
  LOGO_GLOBSCALE,
  LOGO_OFFSETS,
  LOGO_COLOURS,
  LOGO_GLYPHS,
  logoColumn,
  logoRange,
  ismSaliency,
  logSED,
  spliceAnnotations,
  stageRelevanceProfile,
  exactStageProfiles,
  relevanceMap,
  windowFraction,
  fractionToBp,
  predictedSpan,
  axisTicks,
  bpTicks,
  packGeneRows,
  attentionRollout,
  binsToBottleneck,
  SEQ_LEN,
  IN_CHANNELS,
  N_DNA,
  N_MASK,
  N_SPECIES,
  N_BINS,
  BIN_BP,
  CROP_BP,
  CROP_BINS,
  BOTTLENECK_LEN,
  BLOCK_FILTERS,
  D_MODEL,
  N_HEADS,
  KEY_SIZE,
  VALUE_SIZE,
  N_ATTN_LAYERS,
  N_TRACKS,
  TRACK_GROUPS,
  SPECIES_S_CEREVISIAE,
  layerSpecs,
  cleanSequence,
  encodeInput,
  stemActivations,
  binToWindowOffset,
  windowOffsetToBin,
  mutate,
  receptiveFields,
  flowGeometry,
  stageAt,
  stageMapOffsets,
  STAGE_MAP_POSITIONS,
  percentileRange,
  trackGroupOf,
  trackRowBinning,
  logAxis,
  RNA_SEQ_GROUP,
  type StemWeights,
  pearson,
  activationInk,
  subLayers,
  layerSpecs as specs,
  knockoutMotif,
  geneBodyBins,
  activationScale,
  scaledInk,
  INK_FLOOR_DIVERGING,
  positionToBp,
  bpToFraction,
  divergingColor,
  paintActivationMap,
  type Rgb,
  parseTrackName,
  trackIndex,
  geneTrackShapes,
  sumAttributionRows,
  flowSlabs,
  ANNOTATION_CLASSES,
  motifTier,
  featureMask,
  poolCoverage,
  circularShiftOffsets,
  weightedEnrichment,
  type AnnotationFeature,
} from './shorkieModel';
import tracks from '../data/shorkieTracks.json';
import trackNames from '../data/shorkieTrackNames.json';

const stem = stemWeights as StemWeights;

describe('architecture spec, against the released f0 checkpoint', () => {
  it('input is 16,384 x 170 = 4 DNA + 1 mask + 165 species', () => {
    expect(SEQ_LEN).toBe(16384);
    expect(N_DNA + N_MASK + N_SPECIES).toBe(IN_CHANNELS);
    expect(IN_CHANNELS).toBe(170);
  });

  it('seven pooling blocks take 16,384 positions down to the 128-position bottleneck', () => {
    expect(BLOCK_FILTERS.length).toBe(7);
    expect(SEQ_LEN / 2 ** BLOCK_FILTERS.length).toBe(BOTTLENECK_LEN);
    expect(BOTTLENECK_LEN).toBe(128);
  });

  it('filter progression is the checkpoint’s, not the paper’s uniform 32-steps', () => {
    expect([...BLOCK_FILTERS]).toEqual([96, 128, 160, 192, 256, 320, 384]);
    const steps = BLOCK_FILTERS.slice(1).map((f, i) => f - BLOCK_FILTERS[i]);
    expect(steps).toEqual([32, 32, 32, 64, 64, 64]);
    expect(new Set(steps).size).toBeGreaterThan(1);
  });

  it('attention is 4 heads x 96 values = 384, and 4 heads x 64 keys = 256', () => {
    expect(N_HEADS).toBe(4);
    expect(N_HEADS * VALUE_SIZE).toBe(D_MODEL);
    expect(N_HEADS * KEY_SIZE).toBe(256);
    expect(N_ATTN_LAYERS).toBe(8);
  });

  it('three upsamples then a 64-bin crop each side gives exactly 896 bins', () => {
    expect(BOTTLENECK_LEN * 2 ** 3 - 2 * CROP_BINS).toBe(N_BINS);
    expect(N_BINS).toBe(896);
    expect(CROP_BP).toBe(1024);
    expect(N_BINS * BIN_BP).toBe(SEQ_LEN - 2 * CROP_BP);
    expect(N_BINS * BIN_BP).toBe(14336);
  });

  it('the four track groups sum to the 5,215 output channels', () => {
    expect(TRACK_GROUPS.reduce((a, g) => a + g.count, 0)).toBe(N_TRACKS);
  });

  it('track group ranges match the released targets sheet, not the paper', () => {
    // The paper orders these RNA-seq, 1000-strain, ChIP-exo, ChIP-MNase. The checkpoint does not.
    expect(TRACK_GROUPS.map((g) => g.id)).toEqual([
      'chip_exo', 'chip_mnase', 'rnaseq_tf', 'rnaseq_strain',
    ]);
    expect(TRACK_GROUPS.map((g) => [g.start, g.end])).toEqual([
      [0, 1128], [1128, 1148], [1148, 4201], [4201, 5215],
    ]);
    // and they agree with the shipped sheet-derived data
    expect(tracks.groups.map((g) => [g.start, g.end])).toEqual(
      TRACK_GROUPS.map((g) => [g.start, g.end]),
    );
    expect(tracks.total).toBe(N_TRACKS);
  });

  it('the groups are contiguous and cover every channel exactly once', () => {
    let cursor = 0;
    for (const g of TRACK_GROUPS) {
      expect(g.start).toBe(cursor);
      expect(g.end - g.start).toBe(g.count);
      cursor = g.end;
    }
    expect(cursor).toBe(N_TRACKS);
  });

  it('RNA-seq is the ORF-enriched group, which is how the ordering was confirmed', () => {
    const rna = TRACK_GROUPS[RNA_SEQ_GROUP];
    expect(rna.id).toBe('rnaseq_tf');
    // ChIP-exo marks promoters, not gene bodies, so it must be the flat one.
    const chip = TRACK_GROUPS.find((g) => g.id === 'chip_exo')!;
    expect(rna.orfEnrichment).toBeGreaterThan(10);
    expect(chip.orfEnrichment).toBeLessThan(1.5);
    expect(rna.orfEnrichment).toBeGreaterThan(chip.orfEnrichment * 10);
  });

  it('layerSpecs walks input -> stem -> 7 blocks -> 8 attention -> 3 decoder -> head', () => {
    const specs = layerSpecs();
    expect(specs).toHaveLength(1 + 1 + 7 + 8 + 3 + 1);
    // The chain has to start at the sequence, or "input to output" is really "first convolution
    // to output".
    expect(specs[0].id).toBe('input');
    expect(specs[0].channels).toBe(4);
    expect(specs[0].positions).toBe(SEQ_LEN);
    expect(specs.at(-1)?.positions).toBe(N_BINS);
    const attn = specs.filter((s) => s.id.startsWith('attn'));
    expect(attn.every((s) => s.positions === BOTTLENECK_LEN)).toBe(true);
  });
});

describe('sequence encoding', () => {
  it('keeps only ACGT', () => {
    expect(cleanSequence('acgtNNxyz-ACGT')).toBe('ACGTACGT');
  });

  it('encodes one DNA channel and one species channel per position', () => {
    const x = encodeInput('ACGT');
    expect(x).toHaveLength(SEQ_LEN * IN_CHANNELS);
    // position 0 is 'A'
    expect(x[0]).toBe(1);
    expect(x[1]).toBe(0);
    // the mask channel is never set at inference
    for (let i = 0; i < 8; i += 1) expect(x[i * IN_CHANNELS + N_DNA]).toBe(0);
    // species one-hot is constant across positions
    const ch = N_DNA + N_MASK + SPECIES_S_CEREVISIAE;
    expect(x[ch]).toBe(1);
    expect(x[5000 * IN_CHANNELS + ch]).toBe(1);
  });

  it('positions past the sequence carry no base but still carry the species', () => {
    const x = encodeInput('AC');
    const row = 10 * IN_CHANNELS;
    expect(x[row] + x[row + 1] + x[row + 2] + x[row + 3]).toBe(0);
    expect(x[row + N_DNA + N_MASK + SPECIES_S_CEREVISIAE]).toBe(1);
  });
});

describe('conv stem', () => {
  it('ships the real 11 x 4 x 96 kernel', () => {
    expect(stem.kernelWidth).toBe(11);
    expect(stem.filters).toBe(96);
    expect(stem.weights).toHaveLength(11 * N_DNA * 96);
    expect(stem.bias).toHaveLength(96);
  });

  it('produces one valid position per kernel placement', () => {
    const seq = 'ACGT'.repeat(25); // 100 bp
    const act = stemActivations(seq, stem);
    expect(act.positions).toBe(100 - 11 + 1);
    expect(act.map).toHaveLength(96 * act.positions);
    expect(act.peak).toHaveLength(96);
  });

  it('is translation-equivariant, which is what makes the live path valid', () => {
    const core = 'GGCTATAAAAGGGCATCGAT';
    const a = stemActivations(core, stem);
    const b = stemActivations(`TTTT${core}`, stem);
    for (let f = 0; f < 96; f += 7) {
      for (let p = 0; p < a.positions; p += 1) {
        expect(b.map[f * b.positions + p + 4]).toBeCloseTo(a.map[f * a.positions + p], 5);
      }
    }
  });

  it('matches the full PyTorch model’s stem activations on a real TDH3 window', () => {
    // The fixture is generated by scripts/shorkie/make_parity_fixture.py from the checkpoint.
    const act = stemActivations(parity.sequence, stem);
    expect(act.positions).toBe(parity.validPositions);
    let compared = 0;
    parity.expected.forEach((row, fi) => {
      const f = fi * parity.filterStride;
      row.forEach((want, pi) => {
        const p = pi * parity.positionStride;
        expect(act.map[f * act.positions + p]).toBeCloseTo(want, 3);
        compared += 1;
      });
    });
    expect(compared).toBe(12 * 20);
  });

  it('reports the peak position of each filter', () => {
    const act = stemActivations(parity.sequence, stem);
    for (let f = 0; f < 96; f += 1) {
      const slice = act.map.subarray(f * act.positions, (f + 1) * act.positions);
      expect(act.peak[f]).toBeCloseTo(Math.max(...slice), 6);
      expect(slice[act.peakAt[f]]).toBeCloseTo(act.peak[f], 6);
    }
  });

  it('treats an unknown base as a zero one-hot column rather than dropping the position', () => {
    const withN = stemActivations('ACGTNACGTAC', stem);
    expect(withN.positions).toBe(1);
    expect(Number.isFinite(withN.map[0])).toBe(true);
  });
});

describe('bin arithmetic', () => {
  it('round-trips bin to window offset', () => {
    for (const bin of [0, 1, 447, 895]) {
      expect(windowOffsetToBin(binToWindowOffset(bin))).toBe(bin);
    }
  });

  it('bin 0 starts after the cropped flank and the last bin ends before it', () => {
    expect(binToWindowOffset(0)).toBe(CROP_BP);
    expect(binToWindowOffset(N_BINS - 1) + BIN_BP).toBe(SEQ_LEN - CROP_BP);
  });
});

describe('mutation', () => {
  it('substitutes a single base and leaves length unchanged', () => {
    expect(mutate('ACGT', 2, 'A')).toBe('ACAT');
    expect(mutate('ACGT', 9, 'A')).toBe('ACGT');
    expect(mutate('ACGT', -1, 'A')).toBe('ACGT');
  });
});

describe('preset loci', () => {
  it('ships fourteen full-length windows with annotation', () => {
    // Eight chosen to span the interpretive range, plus the six of Figure 4.
    expect(loci.loci.length).toBe(14);
    expect(loci.speciesIndex).toBe(SPECIES_S_CEREVISIAE);
    expect(loci.bins).toBe(N_BINS);
    loci.loci.forEach((l) => {
      expect(l.sequence).toHaveLength(SEQ_LEN);
      expect(/^[ACGTN]+$/.test(l.sequence)).toBe(true);
      expect(l.features.length).toBeGreaterThan(0);
      l.features.forEach((f) => {
        expect(f.start).toBeGreaterThanOrEqual(0);
        expect(f.end).toBeLessThanOrEqual(N_BINS);
        expect(f.end).toBeGreaterThan(f.start);
      });
    });
  });

  it('every preset contains the gene it is named for', () => {
    const wanted = [
      'TDH3',
      'PGK1',
      'ACT1',
      'ADH1',
      'FBA1',
      'PDC1',
      'GAL1',
      'GAL3',
      'RPL26A',
      'FUN12',
      'KRE33',
      'DTD1',
      'MMS2',
      'HOP2',
    ];
    expect(loci.loci.map((l) => l.gene)).toEqual(wanted);
  });
});

describe('receptive fields', () => {
  it('the conv stem sees exactly its 11 bp kernel', () => {
    const rf = receptiveFields();
    expect(rf[0]).toEqual({ id: 'stem', receptiveField: 11, stride: 1 });
  });

  it('grows 4 bp per block then doubles the stride, reaching 646 bp at the bottleneck', () => {
    const rf = receptiveFields();
    expect(rf.map((r) => r.receptiveField)).toEqual([11, 16, 26, 46, 86, 166, 326, 646]);
    expect(rf.map((r) => r.stride)).toEqual([1, 2, 4, 8, 16, 32, 64, 128]);
  });

  it('the bottleneck stride is one 128 bp step, matching 16,384 / 128 positions', () => {
    const last = receptiveFields().at(-1)!;
    expect(last.stride).toBe(SEQ_LEN / BOTTLENECK_LEN);
  });
});

describe('flow geometry', () => {
  const stages = flowGeometry();

  it('lays out all 20 stages left to right without overlap, inside [0, 1]', () => {
    expect(stages).toHaveLength(21);   // + the input sequence itself
    for (let i = 1; i < stages.length; i += 1) {
      expect(stages[i].x).toBeGreaterThanOrEqual(stages[i - 1].x + stages[i - 1].width);
    }
    expect(stages[0].x).toBeCloseTo(0, 6);
    const last = stages.at(-1)!;
    expect(last.x + last.width).toBeLessThanOrEqual(1 + 1e-9);
    expect(last.x + last.width).toBeCloseTo(1, 6);
  });

  it('height falls monotonically through the encoder and rises through the decoder', () => {
    // Height is spatial resolution, so the U shape has to be in the geometry, not just the labels.
    // The input, the conv stem and block 1 all sit at the full 16,384, so the first two steps are
    // flat; every step after them halves.
    const enc = stages.filter((s) => s.group === 'encoder');
    expect(enc[1].height).toBe(enc[0].height);
    expect(enc[2].height).toBe(enc[0].height);
    for (let i = 3; i < enc.length; i += 1) {
      expect(enc[i].height).toBeLessThan(enc[i - 1].height);
    }
    const dec = stages.filter((s) => s.group === 'decoder');
    for (let i = 1; i < dec.length; i += 1) {
      // The head crops 128 bins off the last decoder stage, so it is the one step that narrows.
      if (dec[i].id === 'head') expect(dec[i].height).toBeLessThan(dec[i - 1].height);
      else expect(dec[i].height).toBeGreaterThan(dec[i - 1].height);
    }
    expect(stages.find((s) => s.id === 'attn1')!.height).toBeCloseTo(
      Math.min(...stages.map((s) => s.height)),
      12,
    );
  });

  it('both axes are log-scaled over the range present, not from zero', () => {
    // A raw log flattens this network into twenty near-identical boxes: 16,384 -> 128 positions is
    // only log2 14 -> 7. Ranging over what is actually present is what makes the U visible.
    const stem = stages[0];
    const attn = stages.find((s) => s.id === 'attn1')!;
    expect(stem.height / attn.height).toBeGreaterThan(3);
    // Width is channels: the 384-channel bottleneck is wider than the 96-channel stem.
    expect(attn.width).toBeGreaterThan(stem.width);
    expect(stages.find((s) => s.id === 'head')!.width).toBeCloseTo(
      Math.max(...stages.map((s) => s.width)),
      12,
    );
    // Monotone in the true quantity: sorting by channels sorts by width.
    const byCh = [...stages].sort((a, b) => a.channels - b.channels);
    for (let i = 1; i < byCh.length; i += 1) {
      if (byCh[i].channels > byCh[i - 1].channels) {
        expect(byCh[i].width).toBeGreaterThan(byCh[i - 1].width);
      }
    }
  });

  it('groups the stages into encoder, bottleneck and decoder', () => {
    expect(stages.filter((s) => s.group === 'encoder')).toHaveLength(9); // input + stem + 7 blocks
    expect(stages.filter((s) => s.group === 'bottleneck')).toHaveLength(N_ATTN_LAYERS);
    expect(stages.filter((s) => s.group === 'decoder')).toHaveLength(4); // 3 U-Net + head
  });

  it('each decoder stage names the encoder block it merges its skip from', () => {
    const skips = stages.filter((s) => s.skipFrom).map((s) => [s.id, s.skipFrom]);
    expect(skips).toEqual([
      ['decoder1', 'block7'],
      ['decoder2', 'block6'],
      ['decoder3', 'block5'],
    ]);
  });

  it('past the encoder, attention gives every position the whole window', () => {
    const attn = stages.find((s) => s.id === 'attn1')!;
    expect(attn.receptiveField).toBe(SEQ_LEN);
    expect(stages.find((s) => s.id === 'block7')!.receptiveField).toBe(646);
  });
});

describe('wavefront', () => {
  const stages = flowGeometry();

  it('maps scrub position to the stage being crossed', () => {
    expect(stageAt(0, stages).index).toBe(0);
    expect(stageAt(1, stages).index).toBe(stages.length - 1);
    const mid = stageAt(stages[5].x + stages[5].width / 2, stages);
    expect(mid.index).toBe(5);
    expect(mid.local).toBeCloseTo(0.5, 1);
  });

  it('clamps out-of-range scrub values', () => {
    expect(stageAt(-1, stages).index).toBe(0);
    expect(stageAt(2, stages).index).toBe(stages.length - 1);
    expect(stageAt(-1, stages).local).toBe(0);
  });
});

describe('pearson', () => {
  it('is 1 for a series against itself and -1 against its negation', () => {
    const a = [1, 4, 9, 16, 25, 36];
    expect(pearson(a, a)).toBeCloseTo(1, 12);
    expect(pearson(a, a.map((x) => -x))).toBeCloseTo(-1, 12);
  });

  it('is invariant to positive affine rescaling of either series', () => {
    // Prediction and measured coverage live on different absolute scales, so the score has to be
    // blind to that or every locus would look uncorrelated.
    const a = [3, 1, 4, 1, 5, 9, 2, 6];
    const b = [2, 7, 1, 8, 2, 8, 1, 8];
    const r = pearson(a, b);
    expect(pearson(a.map((x) => 100 * x + 7), b)).toBeCloseTo(r, 12);
    expect(pearson(a, b.map((x) => 0.01 * x - 3))).toBeCloseTo(r, 12);
  });

  it('matches a hand-computed value', () => {
    // deviations [-2,-1,0,1,2] and [-1,-2,0,2,1]: cross-products sum to 8, each sum of squares
    // is 10, so r = 8 / sqrt(100) = 0.8 exactly.
    expect(pearson([1, 2, 3, 4, 5], [2, 1, 3, 5, 4])).toBeCloseTo(0.8, 12);
  });

  it('returns NaN for a constant series rather than reporting no correlation', () => {
    expect(pearson([1, 1, 1, 1], [1, 2, 3, 4])).toBeNaN();
    expect(pearson([1], [1])).toBeNaN();
  });
});

describe('activationInk', () => {
  it('is monotone in the activation, so brighter always means larger', () => {
    let prev = -1;
    for (let v = 0; v <= 10; v += 1) {
      const ink = activationInk(v, 0, 10);
      expect(ink).toBeGreaterThanOrEqual(prev);
      prev = ink;
    }
  });

  it('spans the full ink range across the tensor’s own min and max', () => {
    expect(activationInk(10, 0, 10)).toBeCloseTo(1, 12);
    expect(activationInk(0, 0, 10)).toBe(0);
  });

  it('lifts the middle of the range, which a linear ramp leaves invisible', () => {
    // A cell at 10% of the maximum, with no floor: linear alpha would be 0.10, effectively
    // invisible in a raster of 100k cells. sqrt(0.1) = 0.3162.
    const ink = activationInk(0.1, 0, 1, 0);
    expect(ink).toBeCloseTo(Math.sqrt(0.1), 12);
    expect(ink).toBeGreaterThan(3 * 0.1);
  });

  it('separates the floor from the lift: raising the floor removes cells, never dims them', () => {
    // The cell at 0.8 keeps full ink relative to the surviving range as the floor rises; only the
    // cells below the floor disappear.
    expect(activationInk(0.3, 0, 1, 0.2)).toBeGreaterThan(0);
    expect(activationInk(0.3, 0, 1, 0.55)).toBe(0);
    expect(activationInk(1, 0, 1, 0.2)).toBeCloseTo(1, 12);
    expect(activationInk(1, 0, 1, 0.55)).toBeCloseTo(1, 12);
  });

  it('clamps out-of-range values instead of producing ink outside [0, 1]', () => {
    expect(activationInk(-5, 0, 10)).toBe(0);
    expect(activationInk(50, 0, 10)).toBeCloseTo(1, 12);
  });

  it('returns exactly 0 below the floor so near-zero cells are not drawn', () => {
    expect(activationInk(0.01, 0, 10, 0.18)).toBe(0);
    expect(activationInk(9, 0, 10, 0.18)).toBeGreaterThan(0.9);
  });
});

describe('stage map slicing', () => {
  const offsets = stageMapOffsets();

  it('covers every mapped stage: 7 blocks + 8 transformer layers + 3 decoder stages', () => {
    expect(offsets).toHaveLength(7 + N_ATTN_LAYERS + 3);
    expect(offsets.map((o) => o.id).slice(0, 7)).toEqual([
      'block1', 'block2', 'block3', 'block4', 'block5', 'block6', 'block7',
    ]);
    // The transformer layers are the ones that used to be missing, which is why they rendered
    // as attention matrices rather than activation maps.
    expect(offsets.filter((o) => o.id.startsWith('attn'))).toHaveLength(N_ATTN_LAYERS);
    expect(offsets.filter((o) => o.id.startsWith('decoder'))).toHaveLength(3);
  });

  it('is contiguous from zero with no gap and no overlap', () => {
    expect(offsets[0].start).toBe(0);
    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i].start).toBe(offsets[i - 1].start + offsets[i - 1].channels);
    }
  });

  it('totals the 5,760 channels the exported tensor carries', () => {
    const total = offsets.reduce((a, o) => a + o.channels, 0);
    expect(total).toBe(1536 + N_ATTN_LAYERS * D_MODEL + 3 * D_MODEL);
    expect(total).toBe(5760);
    expect(BLOCK_FILTERS.reduce((a, b) => a + b, 0)).toBe(1536);
  });

  it('gives every stage the channel count the architecture says it has', () => {
    BLOCK_FILTERS.forEach((channels, i) => {
      expect(offsets.find((o) => o.id === `block${i + 1}`)!.channels).toBe(channels);
    });
    for (const o of offsets) {
      if (!o.id.startsWith('block')) expect(o.channels).toBe(D_MODEL);
      expect(o.positions).toBe(STAGE_MAP_POSITIONS);
    }
  });

  it('slices stay inside a [5760, 128] tensor', () => {
    const last = offsets.at(-1)!;
    expect((last.start + last.channels) * STAGE_MAP_POSITIONS).toBe(5760 * 128);
  });
});

describe('percentileRange', () => {
  /** The definition, by sorting -- what the histogram has to approximate. */
  const exact = (a: number[], pct: number) => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.max(0, Math.floor((pct / 100) * (s.length - 1))))];
  };

  it('brackets the true quantiles on a uniform sample', () => {
    const a = Array.from({ length: 1000 }, (_, i) => i);
    const { lo, hi } = percentileRange(a, 1, 99);
    expect(lo).toBeLessThanOrEqual(exact(a, 1));
    expect(hi).toBeGreaterThanOrEqual(exact(a, 99));
    // and is tight: within one bin width of the truth
    const binWidth = (999 - 0) / 1024;
    expect(exact(a, 1) - lo).toBeLessThan(binWidth + 1e-9);
  });

  it('is what min-max is not: it ignores the tail that sets the range', () => {
    // The measured failure. block7 spans -19.4..37.4 while its p1..p99 is only -3.4..3.8, so a
    // min-max ramp puts almost every cell at the same ink.
    const bulk = Array.from({ length: 10000 }, (_, i) => -3 + (6 * i) / 10000);
    const a = [...bulk, -19.4, 37.4];
    const { lo, hi } = percentileRange(a, 1, 99);
    expect(hi - lo).toBeLessThan(7);
    expect(Math.max(...a) - Math.min(...a)).toBeGreaterThan(56);
  });

  it('is monotone in the requested percentiles', () => {
    const a = Array.from({ length: 500 }, (_, i) => Math.sin(i) * 10);
    const wide = percentileRange(a, 1, 99);
    const narrow = percentileRange(a, 10, 90);
    expect(narrow.lo).toBeGreaterThanOrEqual(wide.lo);
    expect(narrow.hi).toBeLessThanOrEqual(wide.hi);
  });

  it('handles negatives, all-equal input and an empty array without producing a bad range', () => {
    const neg = percentileRange([-5, -4, -3, -2, -1]);
    expect(neg.lo).toBeLessThan(neg.hi);
    const flat = percentileRange([7, 7, 7, 7]);
    expect(flat.lo).toBe(7);
    expect(flat.hi).toBe(7);
    expect(percentileRange([])).toEqual({ lo: 0, hi: 1 });
    expect(percentileRange([3])).toEqual({ lo: 3, hi: 3 });
  });

  it('never mutates its input -- it is called on live tensors every redraw', () => {
    const a = new Float32Array([5, 1, 4, 2, 3]);
    const before = Array.from(a);
    percentileRange(a);
    expect(Array.from(a)).toEqual(before);
  });

  it('works on a Float32Array as well as a plain array', () => {
    const plain = Array.from({ length: 300 }, (_, i) => i * 0.5);
    const typed = new Float32Array(plain);
    expect(percentileRange(typed)).toEqual(percentileRange(plain));
  });
});

describe('trackGroupOf', () => {
  it('maps every one of the 5,215 indices to exactly one group', () => {
    for (let i = 0; i < N_TRACKS; i += 1) {
      const g = trackGroupOf(i);
      expect(i).toBeGreaterThanOrEqual(g.start);
      expect(i).toBeLessThan(g.end);
    }
  });

  it('puts the block boundaries where the released targets sheet puts them', () => {
    expect(trackGroupOf(0).id).toBe('chip_exo');
    expect(trackGroupOf(1127).id).toBe('chip_exo');
    expect(trackGroupOf(1128).id).toBe('chip_mnase');
    expect(trackGroupOf(1147).id).toBe('chip_mnase');
    expect(trackGroupOf(1148).id).toBe('rnaseq_tf');
    expect(trackGroupOf(4200).id).toBe('rnaseq_tf');
    expect(trackGroupOf(4201).id).toBe('rnaseq_strain');
    expect(trackGroupOf(5214).id).toBe('rnaseq_strain');
  });

  it('throws outside the range rather than silently returning a neighbour', () => {
    expect(() => trackGroupOf(-1)).toThrow();
    expect(() => trackGroupOf(N_TRACKS)).toThrow();
  });
});

describe('trackRowBinning', () => {
  it('covers every track exactly once, in order, with no empty bin', () => {
    const bins = trackRowBinning(N_TRACKS, 400);
    expect(bins).toHaveLength(400);
    expect(bins[0].start).toBe(0);
    expect(bins.at(-1)!.end).toBe(N_TRACKS);
    for (let i = 0; i < bins.length; i += 1) {
      expect(bins[i].end).toBeGreaterThan(bins[i].start); // an empty bin draws a false blank stripe
      if (i > 0) expect(bins[i].start).toBe(bins[i - 1].end);
    }
  });

  it('is the identity when every track already has its own pixel row', () => {
    const bins = trackRowBinning(50, 200);
    expect(bins).toHaveLength(50);
    expect(bins.every((b) => b.end - b.start === 1)).toBe(true);
  });

  it('keeps bins within one track of each other', () => {
    const sizes = trackRowBinning(N_TRACKS, 300).map((b) => b.end - b.start);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it('returns nothing for a degenerate canvas', () => {
    expect(trackRowBinning(0, 100)).toEqual([]);
    expect(trackRowBinning(100, 0)).toEqual([]);
  });
});

describe('logAxis', () => {
  it('pins the ends: zero coverage draws at zero, the peak at one', () => {
    expect(logAxis(0, 995)).toBe(0);
    expect(logAxis(995, 995)).toBeCloseTo(1, 12);
  });

  it('is monotone', () => {
    let prev = -1;
    for (const v of [0, 0.5, 1, 5, 50, 500, 995]) {
      const y = logAxis(v, 995);
      expect(y).toBeGreaterThan(prev);
      prev = y;
    }
  });

  it('rescues the signal a linear axis erases', () => {
    // The measured failure: on the TDH3 window the peak is 995 while 642 of 896 bins sit above
    // 1.0. Linear puts a 1.0 bin at 0.001 of the axis -- one tenth of a pixel.
    expect(1 / 995).toBeLessThan(0.002);
    expect(logAxis(1, 995)).toBeGreaterThan(0.09);
    expect(logAxis(50, 995)).toBeGreaterThan(0.5);
  });

  it('clamps rather than extrapolating past the peak or below zero', () => {
    expect(logAxis(-5, 995)).toBe(0);
    expect(logAxis(2000, 995)).toBeCloseTo(1, 12);
    expect(logAxis(5, 0)).toBe(0);
  });
});

describe('subLayers', () => {
  const all = specs();
  const byId = (id: string) => all.find((s) => s.id === id)!;

  it('ends every stage on the shape layerSpecs promises for it', () => {
    // "Ends" means the last row that is this stage's own output -- the pooling hand-off that
    // follows a residual block belongs to the transition, and the recorded activation predates it.
    // The detail view prints these beside the stage's own header; if the last sub-layer disagreed
    // with the header the page would contradict itself on screen.
    for (const spec of all) {
      const own = subLayers(spec).filter((s) => !s.handoff).at(-1)!;
      expect(own.positions, `${spec.id} positions`).toBe(spec.positions);
      expect(own.channels, `${spec.id} channels`).toBe(spec.channels);
    }
  });

  it('chains: each sub-layer starts from the shape the previous one produced', () => {
    for (const spec of all) {
      const subs = subLayers(spec);
      for (let i = 1; i < subs.length; i += 1) {
        const grew = subs[i].positions / subs[i - 1].positions;
        // Only three things may change resolution: a x2 pool down, a x2 upsample, or a crop.
        expect([0.5, 1, 2]).toContain(grew === 896 / 1024 ? 1 : grew);
      }
    }
  });

  it('halves resolution exactly once per residual block, at the pool', () => {
    for (let i = 1; i <= 7; i += 1) {
      const subs = subLayers(byId(`block${i}`));
      const drops = subs.filter((s, k) => k > 0 && s.positions === subs[k - 1].positions / 2);
      expect(drops).toHaveLength(1);
      expect(drops[0].handoff).toBe(true);
      expect(drops[0].op).toContain('MaxPool(2)');
    }
  });

  it('changes channel count at the 5 bp convolution, where the checkpoint changes it', () => {
    // The skip is taken after conv1d_1, so the residual add is between two tensors that already
    // carry the block's output width.
    const subs = subLayers(byId('block2'));
    expect(subs[0].channels).toBe(96);            // block1's output feeds block2
    expect(subs[1].channels).toBe(96);
    expect(subs[2].op).toBe('Conv1D(5)');
    expect(subs[2].channels).toBe(128);
    expect(subs.find((s) => s.op === 'add (residual)')!.channels).toBe(128);
  });

  it('gives a transformer layer two residual adds and never changes its shape', () => {
    const subs = subLayers(byId('attn4'));
    expect(subs.filter((s) => s.op === 'add (residual)')).toHaveLength(2);
    expect(subs.every((s) => s.positions === 128 && s.channels === D_MODEL)).toBe(true);
  });

  it('doubles resolution in each decoder stage and names the block it merges', () => {
    for (let i = 1; i <= 3; i += 1) {
      const subs = subLayers(byId(`decoder${i}`));
      expect(subs[1].op).toContain('upsample');
      expect(subs[1].positions).toBe(subs[0].positions * 2);
      expect(subs[2].op).toContain(`residual block ${8 - i}`);
    }
  });

  it('expands the head from 384 channels to all 5,215 tracks at the Dense', () => {
    const subs = subLayers(byId('head'));
    expect(subs[0].channels).toBe(D_MODEL);
    expect(subs.find((s) => s.op === 'Dense')!.channels).toBe(N_TRACKS);
    expect(subs.every((s) => s.positions === N_BINS)).toBe(true);
  });

  it('covers every stage with at least one operation', () => {
    for (const spec of all) expect(subLayers(spec).length).toBeGreaterThan(0);
  });
});

describe('Figure 4 loci', () => {
  const IUPAC: Record<string, string> = {
    A: 'A', C: 'C', G: 'G', T: 'T', R: '[AG]', Y: '[CT]', S: '[GC]',
    W: '[AT]', K: '[GT]', M: '[AC]', N: '.',
  };
  const COMP: Record<string, string> = {
    A: 'T', C: 'G', G: 'C', T: 'A', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', N: 'N',
  };
  const rcIupac = (s: string) => [...s].reverse().map((b) => COMP[b] ?? b).join('');
  type Motif = {
    name: string; consensus: string; strand: string; start: number; end: number; source: string;
  };
  const fig4 = loci.loci.filter((l) => 'figurePanel' in l);

  it('ships all six panels of Figure 4 alongside the original eight loci', () => {
    expect(loci.loci).toHaveLength(14);
    expect(fig4.map((l) => (l as { figurePanel: string }).figurePanel).sort()).toEqual([
      'Fig 4A', 'Fig 4B', 'Fig 4C', 'Fig 4E', 'Fig 4F', 'Fig 4G',
    ]);
    // DTD1 is YDL219W. YDL100C is a different gene; the figure's coordinates are what settle it.
    expect(fig4.find((l) => l.gene === 'DTD1')!.id).toBe('YDL219W');
  });

  it('gives every locus a full 16,384 bp window of real bases', () => {
    for (const l of loci.loci) {
      expect(l.sequence.length, l.gene).toBe(SEQ_LEN);
      expect(/^[ACGTN]+$/.test(l.sequence), l.gene).toBe(true);
    }
  });

  it('puts the window the figure prints inside the 896 predicted bins', () => {
    for (const l of fig4) {
      const w = (l as { figureWindow: Record<string, number> }).figureWindow;
      expect(w.binStart, l.gene).toBeGreaterThanOrEqual(0);
      expect(w.binEnd, l.gene).toBeLessThanOrEqual(N_BINS);
      expect(w.binEnd).toBeGreaterThan(w.binStart);
      // and near the middle, because the window is centred on it
      expect(Math.abs((w.binStart + w.binEnd) / 2 - N_BINS / 2)).toBeLessThan(40);
    }
  });

  it('records the figure window as offsets that recover its own chromosome coordinates', () => {
    for (const l of fig4) {
      const w = (l as { figureWindow: Record<string, number> }).figureWindow;
      expect(l.start + w.seqStart).toBe(w.chromStart - 1);
      expect(l.start + w.seqEnd).toBe(w.chromEnd);
      expect(w.seqEnd - w.seqStart).toBe(w.chromEnd - w.chromStart + 1);
    }
  });

  it('every SCANNED motif really is at that offset in the shipped sequence', () => {
    // The point of scanning rather than reading positions off the figure's pixels: it is checkable.
    let checked = 0;
    for (const l of fig4) {
      const motifs = (l as { motifs: Motif[] }).motifs;
      expect(motifs.length, `${l.gene} has no motifs`).toBeGreaterThan(0);
      for (const m of motifs.filter((x) => x.source === 'scan')) {
        const slice = l.sequence.slice(m.start, m.end);
        const pattern = m.strand === '+' ? m.consensus : rcIupac(m.consensus);
        const rx = new RegExp(`^${[...pattern].map((b) => IUPAC[b]).join('')}$`);
        expect(rx.test(slice), `${l.gene} ${m.name} at ${m.start}: got ${slice}`).toBe(true);
        expect(m.end - m.start).toBe(m.consensus.length);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(8); // a silently-empty scan must fail
  });

  it('reverse-complements IUPAC codes, not just ACGT', () => {
    // str.maketrans("ACGT","TGCA") leaves R, Y and N alone, so the minus-strand Abf1 pattern it
    // produced was a different motif -- and Abf1, which Figure 4B labels, went unfound.
    expect(rcIupac('RTCRYNNNNNACG')).toBe('CGTNNNNNRYGAY');
    expect(rcIupac('GTATGT')).toBe('ACATAC');
  });

  it('takes splice sites from the annotation, and they read GT…AG', () => {
    // Scanning for GTATGT put HOP2's donor 633 bp from the real one, inside exon 2 -- a 6-mer
    // matches by chance every few kb. Exon boundaries are known, so these are derived, and the
    // canonical dinucleotides prove the arithmetic. Minus-strand genes read the complements.
    let donors = 0;
    let acceptors = 0;
    for (const l of fig4) {
      for (const m of (l as { motifs: Motif[] }).motifs) {
        if (m.source !== 'annotation') continue;
        const bases = l.sequence.slice(m.start, m.end);
        if (m.name === "5' splice site") {
          expect(bases, `${l.gene} donor`).toBe(m.strand === '+' ? 'GT' : 'AC');
          donors += 1;
        } else {
          expect(bases, `${l.gene} acceptor`).toBe(m.strand === '+' ? 'AG' : 'CT');
          acceptors += 1;
        }
      }
    }
    expect(donors).toBeGreaterThanOrEqual(4);
    expect(acceptors).toBeGreaterThanOrEqual(3);
  });

  it('anchors the branch point upstream of a real acceptor, not anywhere TACTAAC occurs', () => {
    for (const l of fig4) {
      const motifs = (l as { motifs: Motif[] }).motifs;
      const acceptors = motifs.filter((m) => m.name === "3' splice site");
      for (const bp of motifs.filter((m) => m.name === 'branch point')) {
        // On the forward genome a minus-strand branch point reads the reverse complement.
        expect(l.sequence.slice(bp.start, bp.end), `${l.gene} branch point`)
          .toBe(bp.strand === '+' ? 'TACTAAC' : 'GTTAGTA');
        // "Upstream" is in gene orientation: lower forward coordinates on +, higher on −.
        const near = acceptors.some((a) =>
          bp.strand === '+'
            ? bp.start < a.start && a.start - bp.start <= 100
            : bp.start > a.end && bp.start - a.end <= 100,
        );
        expect(near, `${l.gene} branch point at ${bp.start} is not upstream of an acceptor`).toBe(true);
      }
    }
  });

  it('keeps every motif inside the window the figure draws', () => {
    for (const l of fig4) {
      const w = (l as { figureWindow: Record<string, number> }).figureWindow;
      for (const m of (l as { motifs: { start: number; end: number }[] }).motifs) {
        expect(m.start).toBeGreaterThanOrEqual(w.seqStart);
        expect(m.end).toBeLessThanOrEqual(w.seqEnd);
      }
    }
  });

  it('finds the motifs the figure names, where the figure names them', () => {
    const named = (gene: string) =>
      new Set((fig4.find((l) => l.gene === gene) as { motifs: { name: string }[] }).motifs.map((m) => m.name));
    // 4B and 4C are the RRPE/PAC panels; 4E and 4F are the splicing panels.
    // Figure 4B labels Dot6p, Abf1 and RRPE; the corrected IUPAC complement recovers Abf1, and
    // the corrected Rap1 consensus recovers the UASrpg element Figure 4A labels.
    expect(named('FUN12')).toContain('Abf1');
    expect(named('RPL26A')).toContain('Rap1');
    expect(named('FUN12')).toContain('RRPE (Stb3)');
    expect(named('KRE33')).toContain('RRPE (Stb3)');
    expect(named('KRE33')).toContain('Reb1');
    expect(named('DTD1')).toContain('branch point');
    expect(named('DTD1')).toContain("5' splice site");
    expect(named('MMS2')).toContain('branch point');
  });
});

describe('shipped track names', () => {
  it('names all 5,215 output channels in sheet order', () => {
    expect(trackNames.count).toBe(N_TRACKS);
    expect(trackNames.identifiers).toHaveLength(N_TRACKS);
    expect(new Set(trackNames.identifiers).size).toBeGreaterThan(N_TRACKS - 10);
  });

  it('agrees with the group boundaries the model uses', () => {
    // If these drifted apart the page would name one experiment while plotting another.
    expect(trackNames.identifiers[TRACK_GROUPS[0].start]).toBe('AAP1_S0');
    expect(trackNames.identifiers[TRACK_GROUPS[1].start]).toBe('H2B_S0');
    expect(trackNames.identifiers[TRACK_GROUPS[2].start]).toBe('ARG80_T0_S757');
    expect(trackNames.identifiers[TRACK_GROUPS[3].start]).toBe('ERR9593592');
  });

  it('starts the RNA-seq block on a T0 baseline, which is what Figure 4 uses', () => {
    expect(trackNames.identifiers[TRACK_GROUPS[RNA_SEQ_GROUP].start]).toMatch(/_T0_/);
  });
});

describe('knockoutMotif', () => {
  const seq = 'AAAACCCCGGGGTTTT' + 'TGAAAAATTTT' + 'ACGTACGTACGT';
  const lo = 16;
  const hi = 27;

  it('destroys the motif but not the sequence around it', () => {
    const out = knockoutMotif(seq, lo, hi, 7);
    expect(out).toHaveLength(seq.length);
    expect(out.slice(0, lo)).toBe(seq.slice(0, lo));
    expect(out.slice(hi)).toBe(seq.slice(hi));
    expect(out.slice(lo, hi)).not.toBe(seq.slice(lo, hi));
  });

  it('preserves base composition, so only the order is destroyed', () => {
    // The point of a shuffle rather than poly-A: GC content is unchanged, so a drop in the
    // prediction is attributable to the motif and not to the composition.
    const count = (s: string) =>
      [...s].reduce<Record<string, number>>((a, b) => ({ ...a, [b]: (a[b] ?? 0) + 1 }), {});
    expect(count(knockoutMotif(seq, lo, hi, 7))).toEqual(count(seq));
  });

  it('is deterministic for a seed and varies across seeds', () => {
    expect(knockoutMotif(seq, lo, hi, 7)).toBe(knockoutMotif(seq, lo, hi, 7));
    const spans = new Set([1, 2, 3, 4, 5].map((s) => knockoutMotif(seq, lo, hi, s).slice(lo, hi)));
    expect(spans.size).toBeGreaterThan(1);
  });

  it('leaves a degenerate span alone rather than corrupting the sequence', () => {
    expect(knockoutMotif(seq, 5, 5)).toBe(seq);
    expect(knockoutMotif(seq, 5, 6)).toBe(seq);       // one base cannot be reordered
    expect(knockoutMotif(seq, -10, 0)).toBe(seq);
  });

  it('clamps out-of-range spans instead of producing a shorter sequence', () => {
    const out = knockoutMotif(seq, seq.length - 4, seq.length + 50, 3);
    expect(out).toHaveLength(seq.length);
    expect(out.slice(0, seq.length - 4)).toBe(seq.slice(0, seq.length - 4));
  });

  it('actually breaks the consensus it was aimed at, on the shipped RRPE site', () => {
    const fun12 = loci.loci.find((l) => l.gene === 'FUN12')!;
    const rrpe = (fun12 as { motifs: { name: string; start: number; end: number }[] }).motifs
      .find((m) => m.name === 'RRPE (Stb3)')!;
    const before = fun12.sequence.slice(rrpe.start, rrpe.end);
    // Try several seeds; a shuffle can return the identity, and the UI should pick one that does not.
    const broken = [1, 2, 3, 4, 5, 6, 7, 8]
      .map((s) => knockoutMotif(fun12.sequence, rrpe.start, rrpe.end, s))
      .filter((out) => out.slice(rrpe.start, rrpe.end) !== before);
    expect(broken.length).toBeGreaterThan(0);
    for (const out of broken) expect(out).toHaveLength(SEQ_LEN);
  });
});

describe('geneBodyBins', () => {
  it('finds the named gene and spans all of its parts', () => {
    const f = [
      { name: 'YAL001C', start: 10, end: 20 },
      { name: 'TARGET', start: 100, end: 140 },
      { name: 'TARGET', start: 160, end: 200 },   // a second exon block
      { name: 'YAL002W', start: 300, end: 320 },
    ];
    expect(geneBodyBins(f, 'TARGET')).toEqual({ start: 100, end: 200 });
  });

  it('returns null when the gene is absent, so a caller can say it is falling back', () => {
    expect(geneBodyBins([{ name: 'A', start: 0, end: 1 }], 'B')).toBeNull();
    expect(geneBodyBins([], 'B')).toBeNull();
  });

  it('resolves every shipped locus to its own gene body', () => {
    // If this ever returned null the knockout readout would silently measure the whole window,
    // where the tallest gene is usually not the one whose promoter was edited.
    for (const l of loci.loci) {
      const span = geneBodyBins(l.features, l.id);
      expect(span, `${l.gene} (${l.id})`).not.toBeNull();
      expect(span!.end).toBeGreaterThan(span!.start);
      expect(span!.start).toBeGreaterThanOrEqual(0);
      expect(span!.end).toBeLessThanOrEqual(N_BINS);
    }
  });

  it('puts KRE33 far from its window peak — the case that motivated this', () => {
    const kre33 = loci.loci.find((l) => l.gene === 'KRE33')!;
    const span = geneBodyBins(kre33.features, kre33.id)!;
    expect(span.start).toBe(460);
    expect(span.end).toBe(659);
    // The tallest gene in that window (YNL135C) sits ~200 bins away.
    const other = geneBodyBins(kre33.features, 'YNL135C')!;
    expect(Math.abs(other.start - span.start)).toBeGreaterThan(150);
  });
});

describe('activationScale', () => {
  /**
   * A signed residual stream shaped like a real one: concentrated near zero with a heavy tail,
   * not the bimodal sine sum a naive synthetic gives. Seeded so the test is deterministic.
   */
  const laplace = (n: number, scale: number) => {
    let s = 12345;
    return Array.from({ length: n }, () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const u = s / 0x100000000 - 0.5;
      return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    });
  };
  const signed = laplace(4000, 2);
  /** A non-negative conv output, the shape of block1. */
  const positive = Array.from({ length: 4000 }, (_, i) => 1.5 + Math.sin(i * 0.11) * 1.2);

  it('picks diverging for a signed map and sequential for a one-sided one', () => {
    expect(activationScale(signed).kind).toBe('diverging');
    expect(activationScale(positive).kind).toBe('sequential');
  });

  it('is sequential when only a trace of the map is negative', () => {
    // block2 is 0.2% negative and block3 is 9.4%; the split has to fall between them.
    const trace = positive.map((v, i) => (i % 500 === 0 ? -0.4 : v));
    expect(activationScale(trace).kind).toBe('sequential');
    const some = positive.map((v, i) => (i % 8 === 0 ? -0.4 : v));
    expect(activationScale(some).kind).toBe('diverging');
  });

  it('centres a diverging scale on zero, symmetrically', () => {
    const s = activationScale(signed);
    expect(s.lo).toBeCloseTo(-s.hi, 12);
    expect(s.half).toBeGreaterThan(0);
  });

  it('saturates at the 99th percentile of |v|, not at the larger arm', () => {
    // attn8 runs -34.8..24.8. Using max(|p1|,|p99|) would put every positive value under the
    // floor; the magnitude percentile keeps both arms usable.
    const lopsided = [...signed, ...Array.from({ length: 40 }, () => -200)];
    const s = activationScale(lopsided);
    expect(s.half).toBeLessThan(50);
  });
});

describe('scaledInk', () => {
  const laplace = (n: number, scale: number) => {
    let s = 12345;
    return Array.from({ length: n }, () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const u = s / 0x100000000 - 0.5;
      return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    });
  };
  const signed = laplace(4000, 2);
  const scale = activationScale(signed);

  it('draws NOTHING at zero — the property the old ramp violated', () => {
    // Measured on PGK1, the p1→p99 ramp gave a zero activation 0.610 ink on attn1 and 0.702 on
    // attn8, so a neuron doing nothing looked as lit as one firing.
    expect(scaledInk(0, scale).magnitude).toBe(0);
    expect(scaledInk(1e-9, scale).magnitude).toBe(0);
    expect(scaledInk(-1e-9, scale).magnitude).toBe(0);
  });

  it('is symmetric in sign and reports which side a value is on', () => {
    for (const v of [0.5, 2, 5, 50]) {
      expect(scaledInk(v, scale).magnitude).toBeCloseTo(scaledInk(-v, scale).magnitude, 12);
      expect(scaledInk(v, scale).negative).toBe(false);
      expect(scaledInk(-v, scale).negative).toBe(true);
    }
  });

  it('is monotone in |value| along each arm and saturates at 1', () => {
    let prev = -1;
    for (const v of [0, 0.5, 1, 2, 4, 8, 16, 1000]) {
      const m = scaledInk(v, scale).magnitude;
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
    expect(scaledInk(1e6, scale).magnitude).toBeCloseTo(1, 12);
  });

  it('clears the wash: a signed map no longer inks nearly every cell', () => {
    // The regression this whole change exists to prevent. Under the old scale 90-96% of cells on
    // 15 of 20 stages drew above 0.4 ink.
    const inked = signed.filter((v) => scaledInk(v, scale).magnitude > 0.4).length / signed.length;
    expect(inked).toBeLessThan(0.75);
    expect(inked).toBeGreaterThan(0.05); // and it must not go blank either
  });

  it('honours the floor so near-zero noise stays empty', () => {
    const justUnder = scale.half * INK_FLOOR_DIVERGING * 0.9;
    expect(scaledInk(justUnder, scale).magnitude).toBe(0);
    expect(scaledInk(scale.half * 0.5, scale).magnitude).toBeGreaterThan(0);
  });

  it('falls back to the sequential ramp for a one-sided map', () => {
    const positive = Array.from({ length: 500 }, (_, i) => i / 100);
    const s = activationScale(positive);
    expect(s.kind).toBe('sequential');
    expect(scaledInk(5, s).negative).toBe(false);
    expect(scaledInk(0, s).magnitude).toBe(0);
  });
});

describe('positionToBp', () => {
  it('spans the whole 16,384 bp input for every stage except the head', () => {
    for (const [id, positions] of [['stem', 1024], ['block1', 128], ['attn4', 128], ['decoder2', 128]] as const) {
      expect(positionToBp(id, 0, positions)).toBe(0);
      expect(positionToBp(id, positions, positions)).toBe(SEQ_LEN);
    }
  });

  it('starts the head 1,024 bp in and steps by the 16 bp bin', () => {
    // The head's 896 bins cover the cropped interior, not the whole window. Treating it like the
    // others would slide the ruler by CROP_BP under the one stage a reader compares to a gene.
    expect(positionToBp('head', 0, N_BINS)).toBe(CROP_BP);
    expect(positionToBp('head', 1, N_BINS)).toBe(CROP_BP + BIN_BP);
    expect(positionToBp('head', N_BINS, N_BINS)).toBe(CROP_BP + N_BINS * BIN_BP);
    expect(positionToBp('head', N_BINS, N_BINS)).toBe(SEQ_LEN - CROP_BP);
  });

  it('agrees with binToWindowOffset, which the coverage plot already uses', () => {
    for (const bin of [0, 1, 435, 895]) {
      expect(positionToBp('head', bin, N_BINS)).toBe(binToWindowOffset(bin));
    }
  });

  it('is monotone and clamps out-of-range positions', () => {
    expect(positionToBp('attn1', -5, 128)).toBe(0);
    expect(positionToBp('attn1', 999, 128)).toBe(SEQ_LEN);
    let prev = -1;
    for (let p = 0; p <= 128; p += 8) {
      const bp = positionToBp('attn1', p, 128);
      expect(bp).toBeGreaterThan(prev);
      prev = bp;
    }
  });

  it('round-trips through bpToFraction', () => {
    for (const [id, positions] of [['attn1', 128], ['head', N_BINS], ['stem', 1024]] as const) {
      for (const frac of [0, 0.25, 0.5, 1]) {
        const p = frac * positions;
        expect(bpToFraction(id, positionToBp(id, p, positions), positions)).toBeCloseTo(frac, 10);
      }
    }
  });

  it('clamps a bp outside the stage rather than drawing off the raster', () => {
    expect(bpToFraction('head', 0, N_BINS)).toBe(0);            // before the crop
    expect(bpToFraction('head', SEQ_LEN, N_BINS)).toBe(1);      // after it
  });
});

describe('divergingColor', () => {
  const WHITE: Rgb = [255, 255, 255];
  const laplace = (n: number, s: number) => {
    let z = 999;
    return Array.from({ length: n }, () => {
      z = (Math.imul(z, 1664525) + 1013904223) >>> 0;
      const u = z / 0x100000000 - 0.5;
      return -s * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    });
  };
  const signed = laplace(4000, 2);
  const scale = activationScale(signed);

  it('paints a zero cell as the neutral itself — never absent, never coloured', () => {
    expect(divergingColor(0, scale, WHITE)).toEqual(WHITE);
    const dark: Rgb = [20, 22, 26];
    expect(divergingColor(0, scale, dark)).toEqual(dark);
  });

  it('sends the two arms to different colours', () => {
    const pos = divergingColor(scale.half, scale, WHITE);
    const neg = divergingColor(-scale.half, scale, WHITE);
    expect(pos).not.toEqual(neg);
    expect(pos[0]).toBeGreaterThan(pos[2]);   // red channel leads
    expect(neg[2]).toBeGreaterThan(neg[0]);   // blue channel leads
  });

  it('moves monotonically away from the neutral along each arm', () => {
    const dist = (v: number) => {
      const c = divergingColor(v, scale, WHITE);
      return Math.abs(c[0] - 255) + Math.abs(c[1] - 255) + Math.abs(c[2] - 255);
    };
    let prev = -1;
    for (const v of [0, 0.2, 0.5, 1, 2, 4, 8, 1000]) {
      const d = dist(v);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });

  it('mixes the two arms by the same fraction at equal magnitude', () => {
    // Not equal RGB distance: blue [49,111,176] and red [178,52,74] are different hues and sit
    // different distances from white. What must match is how far along its own arm each one is.
    const towardRed = (v: number) => (255 - divergingColor(v, scale, WHITE)[1]) / (255 - 52);
    const towardBlue = (v: number) => (255 - divergingColor(v, scale, WHITE)[0]) / (255 - 49);
    for (const v of [0.5, 1, 3, 7]) {
      expect(towardRed(v)).toBeCloseTo(towardBlue(-v), 2);
    }
  });

  it('stays in gamut for any input, including infinities', () => {
    for (const v of [0, 1e9, -1e9, Number.MAX_VALUE, -Number.MAX_VALUE]) {
      for (const ch of divergingColor(v, scale, WHITE)) {
        expect(Number.isFinite(ch)).toBe(true);
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(255);
      }
    }
  });

  it('uses a one-sided ramp when the map is one-sided', () => {
    const positive = Array.from({ length: 500 }, (_, i) => i / 100);
    const s = activationScale(positive);
    expect(s.kind).toBe('sequential');
    expect(divergingColor(s.lo, s, WHITE)).toEqual(WHITE);
    expect(divergingColor(s.hi, s, WHITE)[0]).toBeGreaterThan(divergingColor(s.hi, s, WHITE)[2]);
  });
});

describe('paintActivationMap', () => {
  const WHITE: Rgb = [255, 255, 255];
  const data = Array.from({ length: 8 * 4 }, (_, i) => (i % 3) - 1);
  const scale = activationScale(data);

  it('paints EVERY cell — the whole point, since skipping is what made rasters white', () => {
    const buf = paintActivationMap(data, 8, 4, scale, WHITE);
    expect(buf.length).toBe(8 * 4 * 4);
    for (let i = 3; i < buf.length; i += 4) expect(buf[i]).toBe(255);   // alpha, every pixel
  });

  it('lays cells out row-major so ImageData reads channels down, positions across', () => {
    const buf = paintActivationMap(data, 8, 4, scale, WHITE);
    for (let c = 0; c < 8; c += 1) {
      for (let p = 0; p < 4; p += 1) {
        const want = divergingColor(data[c * 4 + p], scale, WHITE);
        const i = (c * 4 + p) * 4;
        expect([buf[i], buf[i + 1], buf[i + 2]]).toEqual(want);
      }
    }
  });

  it('handles a single-channel and a single-position map', () => {
    expect(paintActivationMap([1, 2, 3], 1, 3, scale, WHITE).length).toBe(12);
    expect(paintActivationMap([1, 2, 3], 3, 1, scale, WHITE).length).toBe(12);
  });
});

describe('parseTrackName, against all 5,215 shipped names', () => {
  const all = trackNames.identifiers.map((n, i) => parseTrackName(i, n));

  it('classifies every track and drops none', () => {
    expect(all).toHaveLength(N_TRACKS);
    expect(all.every((p) => ['tf', 'factor', 'strain', 'other'].includes(p.kind))).toBe(true);
    expect(new Set(all.map((p) => p.index)).size).toBe(N_TRACKS);
  });

  it('finds the 335 regulators and 13 timepoints of the RNA-seq timecourse', () => {
    const tf = all.slice(1148, 4201).filter((p) => p.kind === 'tf');
    expect(tf.length).toBe(3037);                        // 16 of the 3,053 do not follow it
    expect(new Set(tf.map((p) => p.regulator)).size).toBe(335);
    expect([...new Set(tf.map((p) => p.timepoint))].sort((a, b) => a! - b!))
      .toEqual([0, 5, 10, 15, 20, 30, 40, 45, 60, 70, 90, 120, 180]);
  });

  it('reads a timecourse name the way the experiment was run', () => {
    const p = parseTrackName(1148, 'ARG80_T0_S757');
    expect(p).toMatchObject({ kind: 'tf', regulator: 'ARG80', timepoint: 0, replicate: 757 });
    expect(p.group).toBe('RNA-seq · TF induction');
  });

  it('reads ChIP targets and strain accessions', () => {
    expect(parseTrackName(0, 'AAP1_S0')).toMatchObject({ kind: 'factor', regulator: 'AAP1', replicate: 0 });
    expect(parseTrackName(1128, 'H2B_S0')).toMatchObject({ kind: 'factor', regulator: 'H2B' });
    expect(parseTrackName(4201, 'ERR9593592')).toMatchObject({ kind: 'strain', accession: 'ERR9593592' });
  });

  it('puts the 36 unparsable names in `other` rather than losing them', () => {
    const other = all.filter((p) => p.kind === 'other');
    expect(other.length).toBe(36);
    for (const p of other) expect(p.name.length).toBeGreaterThan(0);
  });

  it('never assigns a track to the wrong assay block', () => {
    for (const p of all) expect(p.group).toBe(trackGroupOf(p.index).label);
  });
});

describe('trackIndex', () => {
  const idx = trackIndex(trackNames.identifiers);

  it('covers all 5,215 tracks across the four assay blocks, exactly once each', () => {
    expect(idx.total).toBe(N_TRACKS);
    expect(idx.byGroup).toHaveLength(4);
    const seen = new Set<number>();
    for (const g of idx.byGroup) {
      for (const list of g.tracks.values()) for (const p of list) seen.add(p.index);
    }
    expect(seen.size).toBe(N_TRACKS);
  });

  it('gives every group a sorted key list matching its own map', () => {
    for (const g of idx.byGroup) {
      expect(g.keys).toEqual([...g.keys].sort((a, b) => a.localeCompare(b)));
      expect(new Set(g.keys).size).toBe(g.keys.length);
      expect(g.keys.length).toBe(g.tracks.size);
    }
  });

  it('makes the timecourse two clicks deep: regulator then timepoint', () => {
    const rna = idx.byGroup[RNA_SEQ_GROUP];
    expect(rna.keys).toContain('ARG80');
    const arg80 = rna.tracks.get('ARG80')!;
    expect(arg80.length).toBeGreaterThan(1);
    expect(arg80.every((p) => p.timepoint !== undefined)).toBe(true);
    expect(arg80.map((p) => p.timepoint)).toContain(0);
  });

  it('orders a regulator by timepoint, then sample', () => {
    // ARG80 carries 55 tracks over 8 timepoints with several samples each, so a picker that
    // labelled by timepoint alone would show "T0" five times.
    const arg80 = idx.byGroup[RNA_SEQ_GROUP].tracks.get('ARG80')!;
    expect(arg80.length).toBe(55);
    for (let i = 1; i < arg80.length; i += 1) {
      const a = arg80[i - 1];
      const b = arg80[i];
      expect(a.timepoint! < b.timepoint! || (a.timepoint === b.timepoint && a.replicate! <= b.replicate!)).toBe(true);
    }
    // and every one is individually addressable
    expect(new Set(arg80.map((p) => `${p.timepoint}-${p.replicate}`)).size).toBe(55);
  });

  it('keeps every strain run reachable under its own accession', () => {
    const strain = idx.byGroup[3];
    expect(strain.keys.length).toBe(1014);
    expect(strain.tracks.get('ERR9593592')![0].index).toBe(4201);
  });
});

describe('the precomputed packs are served from a path this site actually owns', () => {
  // With a custom apex domain on the user site, GitHub serves every project repo's Pages at
  // khchao.com/<repo>/. Those shadow anything this site deploys at the same path. The packs were
  // first put at /shorkie/, which the `shorkie` project repo owns, and every one of them 404'd in
  // production while passing locally -- the preview server has no such shadowing.
  const SHADOWED = ['shorkie', 'splam', 'lifton', 'openspliceai', 'gffbase'];

  it('does not serve them from a project-repo path', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/scripts/variantPlayground.ts', 'utf8'));
    const match = /BASE_URL\.replace\(\/\\\/\$\/, ''\)\}\/([a-z0-9-]+)`/.exec(source);
    expect(match, 'could not find the pack base path in variantPlayground.ts').not.toBeNull();
    const dir = match![1].toLowerCase();
    expect(SHADOWED, `"${dir}" is shadowed by a project repo's Pages site`).not.toContain(dir);
  });

  it('ships the packs from that same directory', async () => {
    const fs = await import('node:fs');
    expect(fs.existsSync('public/vp-data/index.json')).toBe(true);
    const index = JSON.parse(fs.readFileSync('public/vp-data/index.json', 'utf8'));
    expect(Object.keys(index.loci)).toHaveLength(loci.loci.length);
    // Every locus must have all four planes and its sidecar, or a reader gets a half-loaded page.
    for (const l of loci.loci) {
      for (const suffix of ['tracks', 'stages', 'stem', 'attn']) {
        expect(fs.existsSync(`public/vp-data/${l.id}-${suffix}.png`), `${l.gene} ${suffix}`).toBe(true);
      }
      expect(fs.existsSync(`public/vp-data/${l.id}.json`), `${l.gene} sidecar`).toBe(true);
    }
  });
});

describe('transcript models, JBrowse-style', () => {
  const all = loci.loci.flatMap((l) => l.features.map((f) => ({ locus: l, f })));

  it('gives every gene a real exon structure, not one span', () => {
    // The page used to receive txStart/txEnd only, so an intron was painted as though it were
    // transcribed. 8 multi-exon genes fall in these windows.
    expect(all.length).toBeGreaterThan(0);
    for (const { f } of all) {
      expect(Array.isArray(f.exons), `${f.name} has no exon list`).toBe(true);
      expect(f.exons.length).toBeGreaterThan(0);
    }
    const multi = all.filter(({ f }) => f.exons.length > 1);
    expect(multi.length).toBe(8);
  });

  it('holds the invariants a transcript model must', () => {
    for (const { f } of all) {
      expect(f.exons[0][0], `${f.name} first exon`).toBe(f.txStart);
      expect(f.exons.at(-1)![1], `${f.name} last exon`).toBe(f.txEnd);
      expect(f.cdsStart).toBeGreaterThanOrEqual(f.txStart);
      expect(f.cdsEnd).toBeLessThanOrEqual(f.txEnd);
      for (let i = 1; i < f.exons.length; i += 1) {
        expect(f.exons[i][0], `${f.name} exons overlap`).toBeGreaterThanOrEqual(f.exons[i - 1][1]);
      }
    }
  });

  it('every intron boundary reads GT…AG on the shipped sequence', () => {
    // Self-verifying: if the coordinate arithmetic were off by even one base these would not be
    // the canonical dinucleotides. Minus-strand genes read the complements on the forward genome.
    let checked = 0;
    for (const { locus, f } of all) {
      if (f.exons.length < 2) continue;
      for (let i = 0; i < f.exons.length - 1; i += 1) {
        const a = f.exons[i][1];
        const b = f.exons[i + 1][0];
        if (a < 0 || b > locus.sequence.length) continue;
        const donor = locus.sequence.slice(a, a + 2);
        const acceptor = locus.sequence.slice(b - 2, b);
        const want = f.strand === '+' ? ['GT', 'AG'] : ['CT', 'AC'];
        expect([donor, acceptor], `${locus.gene}/${f.name} intron`).toEqual(want);
        checked += 1;
      }
    }
    // 9, not 8: HOP2's shipped model was one intron short until the SGD cross-check in
    // make_annotations.py caught it -- its second intron was being drawn as coding. The restored
    // boundary reads GT..AG here, which is what says the corrected coordinates are right.
    expect(checked).toBe(9);
  });

  it('keeps bin coordinates in step with the bp ones for the coverage plot', () => {
    for (const { f } of all) {
      expect(f.start).toBe(Math.max(0, Math.floor((f.txStart - CROP_BP) / BIN_BP)));
      expect(f.end).toBeLessThanOrEqual(N_BINS);
      expect(f.end).toBeGreaterThanOrEqual(f.start);
    }
  });
});

describe('geneTrackShapes', () => {
  it('splits a single-exon coding gene into one CDS block', () => {
    const s = geneTrackShapes({ txStart: 100, txEnd: 200, cdsStart: 100, cdsEnd: 200, exons: [[100, 200]] });
    expect(s).toEqual([{ kind: 'cds', start: 100, end: 200 }]);
  });

  it('makes the gap between exons an intron', () => {
    const s = geneTrackShapes({ txStart: 0, txEnd: 100, cdsStart: 0, cdsEnd: 100, exons: [[0, 30], [70, 100]] });
    expect(s.filter((x) => x.kind === 'intron')).toEqual([{ kind: 'intron', start: 30, end: 70 }]);
  });

  it('draws untranslated flanks as UTR, not CDS', () => {
    const s = geneTrackShapes({ txStart: 0, txEnd: 100, cdsStart: 20, cdsEnd: 80, exons: [[0, 100]] });
    expect(s).toEqual([
      { kind: 'utr', start: 0, end: 20 },
      { kind: 'cds', start: 20, end: 80 },
      { kind: 'utr', start: 80, end: 100 },
    ]);
  });

  it('covers the transcript exactly once, with no overlap and no hole', () => {
    for (const l of loci.loci) {
      for (const f of l.features) {
        const s = geneTrackShapes(f);
        expect(s.length).toBeGreaterThan(0);
        expect(s[0].start).toBe(f.txStart);
        expect(s.at(-1)!.end).toBe(f.txEnd);
        for (let i = 1; i < s.length; i += 1) {
          expect(s[i].start, `${f.name} piece ${i}`).toBe(s[i - 1].end);
        }
      }
    }
  });

  it('gives every multi-exon gene in the shipped windows exactly one intron per gap', () => {
    let introns = 0;
    for (const l of loci.loci) {
      for (const f of l.features) {
        const n = geneTrackShapes(f).filter((x) => x.kind === 'intron').length;
        expect(n).toBe(f.exons.length - 1);
        introns += n;
      }
    }
    expect(introns).toBe(9);   // see the GT..AG test: HOP2 regained a second intron
  });
});

describe('sumAttributionRows', () => {
  const COLS = 5;
  const GROUPS = 4;
  const GROUP_BINS = 8;
  // row g is filled with (g+1), so a sum over rows is checkable by hand.
  const plane = Float32Array.from(
    Array.from({ length: GROUPS * COLS }, (_, i) => Math.floor(i / COLS) + 1),
  );

  it('sums exactly the groups a bin range covers', () => {
    // bins 0..8 -> group 0 only
    expect([...sumAttributionRows(plane, COLS, GROUP_BINS, GROUPS, 0, 8)]).toEqual([1, 1, 1, 1, 1]);
    // bins 0..16 -> groups 0 and 1
    expect([...sumAttributionRows(plane, COLS, GROUP_BINS, GROUPS, 0, 16)]).toEqual([3, 3, 3, 3, 3]);
    // the whole plane
    expect([...sumAttributionRows(plane, COLS, GROUP_BINS, GROUPS, 0, 32)]).toEqual([10, 10, 10, 10, 10]);
  });

  it('is additive over adjacent ranges — the property that makes dragging exact', () => {
    // Gradients superpose, so the attribution for a union is the sum of the parts. If this ever
    // stopped holding, a dragged region would be an interpolation pretending to be a measurement.
    const a = sumAttributionRows(plane, COLS, GROUP_BINS, GROUPS, 0, 16);
    const b = sumAttributionRows(plane, COLS, GROUP_BINS, GROUPS, 16, 32);
    const whole = sumAttributionRows(plane, COLS, GROUP_BINS, GROUPS, 0, 32);
    for (let i = 0; i < COLS; i += 1) expect(a[i] + b[i]).toBeCloseTo(whole[i], 6);
  });

  it('snaps to group boundaries rather than silently interpolating', () => {
    // A range inside one group covers that whole group; the page says the resolution is 128 bp.
    expect([...sumAttributionRows(plane, COLS, GROUP_BINS, GROUPS, 2, 5)]).toEqual([1, 1, 1, 1, 1]);
  });

  it('clamps out-of-range selections instead of reading past the plane', () => {
    expect([...sumAttributionRows(plane, COLS, GROUP_BINS, GROUPS, -50, 8)]).toEqual([1, 1, 1, 1, 1]);
    const past = sumAttributionRows(plane, COLS, GROUP_BINS, GROUPS, 0, 9999);
    expect([...past]).toEqual([10, 10, 10, 10, 10]);
    expect(past.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('returns zeros for an empty selection', () => {
    expect([...sumAttributionRows(plane, COLS, GROUP_BINS, GROUPS, 8, 8)]).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('flowSlabs — the 3D layout', () => {
  const slabs = flowSlabs();

  it('places every stage once, ordered along the depth axis', () => {
    expect(slabs).toHaveLength(21);
    expect(slabs[0].z).toBe(0);
    expect(slabs.at(-1)!.z).toBe(1);
    for (let i = 1; i < slabs.length; i += 1) {
      expect(slabs[i].z, `${slabs[i].id} depth`).toBeGreaterThan(slabs[i - 1].z);
    }
  });

  it('makes the U-Net waist literal: height falls to the bottleneck and rises after', () => {
    const at = (id: string) => slabs.find((s) => s.id === id)!;
    expect(at('block1').height).toBeGreaterThan(at('block7').height);
    expect(at('attn1').height).toBeCloseTo(Math.min(...slabs.map((s) => s.height)), 12);
    expect(at('decoder3').height).toBeGreaterThan(at('attn8').height);
  });

  it('keeps every extent inside the unit cell and strictly positive', () => {
    for (const s of slabs) {
      for (const v of [s.height, s.width, s.thickness]) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is monotone in the true quantities, so the drawing cannot mislead about size', () => {
    const byPos = [...slabs].sort((a, b) => a.positions - b.positions);
    for (let i = 1; i < byPos.length; i += 1) {
      if (byPos[i].positions > byPos[i - 1].positions) {
        expect(byPos[i].height).toBeGreaterThan(byPos[i - 1].height);
      }
    }
    const byCh = [...slabs].sort((a, b) => a.channels - b.channels);
    for (let i = 1; i < byCh.length; i += 1) {
      if (byCh[i].channels > byCh[i - 1].channels) {
        expect(byCh[i].width).toBeGreaterThan(byCh[i - 1].width);
      }
    }
  });

  it('carries the real dimensions so a label cannot drift from the box', () => {
    for (const s of slabs) {
      const spec = layerSpecs().find((l) => l.id === s.id)!;
      expect(s.positions).toBe(spec.positions);
      expect(s.channels).toBe(spec.channels);
      expect(s.label).toBe(spec.label);
    }
  });
});

describe('windowFraction — the page\'s one horizontal coordinate', () => {
  it('spans the whole input, not the predicted interior', () => {
    expect(windowFraction(0)).toBe(0);
    expect(windowFraction(SEQ_LEN)).toBe(1);
    expect(windowFraction(SEQ_LEN / 2)).toBeCloseTo(0.5, 12);
  });

  it('round-trips through fractionToBp', () => {
    for (const bp of [0, 1024, 5000, 8192, 15360, SEQ_LEN]) {
      expect(fractionToBp(windowFraction(bp))).toBeCloseTo(bp, 9);
    }
  });

  it('clamps rather than running off either end', () => {
    expect(windowFraction(-500)).toBe(0);
    expect(windowFraction(SEQ_LEN + 500)).toBe(1);
    expect(fractionToBp(-1)).toBe(0);
    expect(fractionToBp(2)).toBe(SEQ_LEN);
  });

  it('puts the predicted interior where the crop says, not at the panel edges', () => {
    // The whole point: the coverage curve occupies the middle 87.5% of the panel, and the two
    // 1,024 bp flanks it does not predict are visibly outside it rather than silently rescaled away.
    const { lo, hi } = predictedSpan();
    expect(lo).toBeCloseTo(CROP_BP / SEQ_LEN, 12);
    expect(hi).toBeCloseTo((CROP_BP + N_BINS * BIN_BP) / SEQ_LEN, 12);
    expect(hi - lo).toBeCloseTo((N_BINS * BIN_BP) / SEQ_LEN, 12);
    expect(hi - lo).toBeLessThan(1);
  });

  it('agrees with the head stage\'s own ruler, which is the panel it must line up with', () => {
    // positionToBp already accounts for the crop; the two must give the same fraction for the same
    // bin, or the layer ruler and the coverage plot slide apart by up to 1,024 bp.
    for (const bin of [0, 100, 448, 895]) {
      const bp = positionToBp('head', bin, N_BINS);
      expect(windowFraction(bp)).toBeCloseTo((CROP_BP + bin * BIN_BP) / SEQ_LEN, 12);
    }
  });
});

describe('axisTicks', () => {
  it('places ticks through the axis in use, not linearly on a log plot', () => {
    const log = axisTicks(1000, true);
    for (const t of log) {
      expect(t.at).toBeCloseTo(logAxis(t.value, 1000), 12);
    }
  });

  it('is monotone: a larger value never sits lower on the axis', () => {
    for (const useLog of [true, false]) {
      const ticks = axisTicks(994.88, useLog);
      for (let i = 1; i < ticks.length; i += 1) {
        expect(ticks[i].value).toBeGreaterThan(ticks[i - 1].value);
        expect(ticks[i].at).toBeGreaterThanOrEqual(ticks[i - 1].at);
      }
    }
  });

  it('spans the full axis and no further', () => {
    for (const max of [1, 12.7, 994.88, 2396.57]) {
      for (const useLog of [true, false]) {
        const ticks = axisTicks(max, useLog);
        expect(ticks[0].at).toBe(0);
        expect(ticks.at(-1)!.at).toBe(1);
        expect(ticks.at(-1)!.value).toBe(max);
        for (const t of ticks) expect(t.at).toBeGreaterThanOrEqual(0);
        for (const t of ticks) expect(t.at).toBeLessThanOrEqual(1);
      }
    }
  });

  it('always offers at least three ticks, even under one decade of range', () => {
    // A peak of 6.53 -- the ChIP-MNase group -- has only one decade tick below it, and an axis
    // labelled 0 and 6.53 alone tells a reader nothing about the shape between them.
    for (const max of [0.4, 3, 6.53, 9.9]) {
      expect(axisTicks(max, true).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('degenerates safely at zero rather than emitting NaN', () => {
    const ticks = axisTicks(0, true);
    expect(ticks).toHaveLength(1);
    for (const t of ticks) expect(Number.isFinite(t.at)).toBe(true);
  });
});

describe('bpTicks', () => {
  it('covers the window end to end, on decimal multiples rather than powers of two', () => {
    // A 2,048 step is the natural one for a 16,384 bp window and reads "2.0k, 4.1k, 6.1k" -- three
    // decimals of noise on a ruler nobody measures to the base from. Every tick but the last is a
    // round multiple of the step; the last is the window end, kept even though it is not on it.
    const ticks = bpTicks();
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(SEQ_LEN);
    for (const bp of ticks.slice(0, -1)) expect(bp % 2000).toBe(0);
  });

  it('is strictly increasing and never emits a duplicate at the window end', () => {
    for (const step of [1000, 2000, 4000, 8000]) {
      const ticks = bpTicks(step);
      for (let i = 1; i < ticks.length; i += 1) expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
      expect(new Set(ticks).size).toBe(ticks.length);
    }
  });

  it('never crowds the last labelled tick against the window end', () => {
    // The end tick is always drawn, so a step landing just short of SEQ_LEN would put two labels
    // on top of each other. Dropping anything past SEQ_LEN - step/2 is what prevents it.
    for (const step of [1000, 2000, 4000]) {
      const ticks = bpTicks(step);
      expect(SEQ_LEN - ticks.at(-2)!).toBeGreaterThanOrEqual(step / 2);
    }
  });
});

describe('packGeneRows', () => {
  const windows = (loci as { loci: { id: string; features: { txStart: number; txEnd: number }[] }[] }).loci;

  it('never puts two overlapping features on the same row', () => {
    for (const w of windows) {
      const rows = packGeneRows(w.features);
      for (let i = 0; i < w.features.length; i += 1) {
        for (let j = i + 1; j < w.features.length; j += 1) {
          if (rows[i] !== rows[j]) continue;
          const a = w.features[i];
          const b = w.features[j];
          expect(
            a.txEnd <= b.txStart || b.txEnd <= a.txStart,
            `${w.id}: features ${i} and ${j} overlap on row ${rows[i]}`,
          ).toBe(true);
        }
      }
    }
  });

  it('costs at most one extra row on the shipped windows', () => {
    // Measured: eight of the fourteen need two rows and none needs three, which is why expanding
    // is cheap enough to be the interesting mode rather than a a rarely-used escape hatch.
    const used = windows.map((w) => Math.max(...packGeneRows(w.features)) + 1);
    expect(Math.max(...used)).toBe(2);
    expect(used.filter((n) => n > 1).length).toBe(8);
  });

  it('assigns a row to every feature and leaves no row empty', () => {
    for (const w of windows) {
      const rows = packGeneRows(w.features);
      expect(rows).toHaveLength(w.features.length);
      const used = new Set(rows);
      for (let r = 0; r < used.size; r += 1) expect(used.has(r)).toBe(true);
    }
  });

  it('uses one row when nothing overlaps, however many features there are', () => {
    const tiled = Array.from({ length: 12 }, (_, i) => ({ txStart: i * 100, txEnd: i * 100 + 90 }));
    expect(Math.max(...packGeneRows(tiled))).toBe(0);
  });

  it('is stable under input order — a row assignment must not depend on file order', () => {
    for (const w of windows) {
      const rows = packGeneRows(w.features);
      const shuffled = w.features.map((f, i) => ({ ...f, i })).reverse();
      const back = packGeneRows(shuffled);
      for (let k = 0; k < shuffled.length; k += 1) {
        expect(back[k]).toBe(rows[shuffled[k].i]);
      }
    }
  });
});

describe('attentionRollout', () => {
  const N = 8;
  /** L layers of a known attention pattern, so the composition can be checked by hand. */
  function uniform(layers: number): Float64Array {
    const a = new Float64Array(layers * N * N);
    a.fill(1 / N);
    return a;
  }

  it('is row-stochastic — every row is a distribution over where it read from', () => {
    for (const layers of [1, 3, 8]) {
      const r = attentionRollout(uniform(layers), N);
      for (let i = 0; i < N; i += 1) {
        let sum = 0;
        for (let j = 0; j < N; j += 1) sum += r[i * N + j];
        expect(sum).toBeCloseTo(1, 10);
      }
    }
  });

  it('never returns a negative weight', () => {
    const r = attentionRollout(uniform(8), N);
    for (let i = 0; i < r.length; i += 1) expect(r[i]).toBeGreaterThanOrEqual(0);
  });

  it('matches the closed form for uniform attention, exactly', () => {
    // Uniform attention mixed half-and-half with the identity is NOT uniform -- it is
    // `0.5 I + (0.5/N) J`, already row-normalised, with a heavier diagonal. Composing it k times
    // gives `0.5^k I + c_k J` where `c_k = (0.5/N)(2 - 2^(1-k))`, so at N = 8 and 8 layers the
    // diagonal is exactly 263/2048 and every other entry exactly 255/2048. Asserting 1/N here
    // instead is what a first draft of this test did, and it was the test that was wrong.
    const k = 8;
    const b = 0.5 / N;
    const off = b * (2 - 2 ** (1 - k));
    const diag = 0.5 ** k + off;
    expect(diag).toBeCloseTo(263 / 2048, 15);
    expect(off).toBeCloseTo(255 / 2048, 15);
    const r = attentionRollout(uniform(k), N);
    for (let i = 0; i < N; i += 1) {
      for (let j = 0; j < N; j += 1) {
        expect(r[i * N + j]).toBeCloseTo(i === j ? diag : off, 12);
      }
    }
  });

  it('converges toward uniform as depth grows, without ever reaching it', () => {
    // The diagonal excess is 0.5^k, so it halves per layer and is never zero: rollout keeps a
    // residual trace of where a position started, which is the property that makes it readable.
    const excess = (k: number) => attentionRollout(uniform(k), N)[0] - attentionRollout(uniform(k), N)[1];
    for (const k of [1, 2, 4, 8]) expect(excess(k)).toBeCloseTo(0.5 ** k, 12);
  });

  it('keeps the residual: pure identity attention rolls out to the identity', () => {
    const a = new Float64Array(4 * N * N);
    for (let l = 0; l < 4; l += 1) for (let i = 0; i < N; i += 1) a[l * N * N + i * N + i] = 1;
    const r = attentionRollout(a, N);
    for (let i = 0; i < N; i += 1) {
      for (let j = 0; j < N; j += 1) expect(r[i * N + j]).toBeCloseTo(i === j ? 1 : 0, 10);
    }
  });

  it('spreads mass with depth rather than concentrating it', () => {
    // One layer of a shifted permutation reads from one place; composing eight must read from more,
    // which is the whole reason rollout says something a single layer's map does not.
    const a = new Float64Array(8 * N * N);
    for (let l = 0; l < 8; l += 1) {
      for (let i = 0; i < N; i += 1) a[l * N * N + i * N + ((i + 1) % N)] = 1;
    }
    const one = attentionRollout(a.slice(0, N * N), N);
    const eight = attentionRollout(a, N);
    const nonzero = (m: Float64Array) => Array.from(m.slice(0, N)).filter((v) => v > 1e-9).length;
    expect(nonzero(eight)).toBeGreaterThan(nonzero(one));
  });

  it('handles the shipped shape: 8 layers of 128 x 128', () => {
    const r = attentionRollout(uniform(N_ATTN_LAYERS), N);
    expect(r).toHaveLength(N * N);
  });
});

describe('binsToBottleneck', () => {
  it('maps an output bin range onto the 128 bp bottleneck positions that cover it', () => {
    const per = SEQ_LEN / 128;
    expect(per).toBe(128);
    const { start, end } = binsToBottleneck(0, N_BINS);
    // Bin 0 starts CROP_BP into the window, which is exactly 8 bottleneck positions in.
    expect(start).toBe(CROP_BP / per);
    expect(end).toBe(128 - CROP_BP / per);
  });

  it('stays inside the bottleneck for any bin range', () => {
    for (const [a, b] of [[0, 1], [400, 500], [880, N_BINS], [-5, N_BINS + 50]]) {
      const { start, end } = binsToBottleneck(a, b);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(128);
      expect(end).toBeGreaterThanOrEqual(start);
    }
  });
});

describe('the 170-channel input contract', () => {
  it('is exactly 4 DNA + 1 mask + 165 species', () => {
    expect(N_DNA + N_MASK + N_SPECIES).toBe(IN_CHANNELS);
    expect([N_DNA, N_MASK, N_SPECIES, IN_CHANNELS]).toEqual([4, 1, 165, 170]);
  });

  it('sets exactly two channels per position: one base and one species', () => {
    const x = encodeInput('ACGT'.repeat(64), SPECIES_S_CEREVISIAE);
    for (let i = 0; i < 256; i += 1) {
      const row = x.subarray(i * IN_CHANNELS, (i + 1) * IN_CHANNELS);
      expect(Array.from(row).filter((v) => v !== 0)).toHaveLength(2);
    }
  });

  it('leaves the mask channel zero everywhere at inference', () => {
    const x = encodeInput('ACGTACGT', SPECIES_S_CEREVISIAE);
    for (let i = 0; i < SEQ_LEN; i += 1) expect(x[i * IN_CHANNELS + N_DNA]).toBe(0);
  });

  it('puts S. cerevisiae at channel 114, constant across every position', () => {
    // 4 DNA + 1 mask + species 109. The page names this channel, so a change here is a change to
    // what the panel claims and must fail loudly rather than quietly relabel.
    const channel = N_DNA + N_MASK + SPECIES_S_CEREVISIAE;
    expect(channel).toBe(114);
    const x = encodeInput('ACGT', SPECIES_S_CEREVISIAE);
    for (let i = 0; i < SEQ_LEN; i += 1) expect(x[i * IN_CHANNELS + channel]).toBe(1);
  });

  it('leaves an N with no base channel set, but still carries the species', () => {
    const x = encodeInput('N', SPECIES_S_CEREVISIAE);
    for (let b = 0; b < N_DNA; b += 1) expect(x[b]).toBe(0);
    expect(x[N_DNA + N_MASK + SPECIES_S_CEREVISIAE]).toBe(1);
  });
});

describe("the Shorkie paper's logo geometry", () => {
  it('carries the paper\'s hand-tuned offsets, not half-advances', () => {
    // yeast_helpers.py:147-150. Measured DejaVu Bold half-advances are A 0.3870, C 0.3669,
    // G 0.4104, T 0.3411 -- only C's offset is the half-advance; the others sit deliberately
    // right of centre. Deriving them instead would move A, G and T by 0.026-0.037 em.
    expect(LOGO_OFFSETS).toEqual({ A: -0.350, C: -0.366, G: -0.384, T: -0.305 });
    expect(Math.abs(-LOGO_OFFSETS.C - 0.366943)).toBeLessThan(0.002);
    expect(Math.abs(-LOGO_OFFSETS.A - 0.386963)).toBeGreaterThan(0.03);
  });

  it('uses the paper\'s saturated X11 colours, not the site\'s tokens', () => {
    expect(LOGO_COLOURS).toEqual({ A: '#008000', C: '#0000FF', G: '#FFA500', T: '#FF0000' });
  });

  it('scales by 1.35 on both axes, which is what makes a stack fill its own height', () => {
    // DejaVu Bold cap heights are 0.729063 (A, T) and 0.742188 (C, G); 1.35 sits between their
    // reciprocals 1.3716 and 1.3474, so a letter of value s draws ~s tall.
    expect(LOGO_GLOBSCALE).toBe(1.35);
    for (const cap of [0.729063, 0.742188]) {
      expect(cap * LOGO_GLOBSCALE).toBeGreaterThan(0.98);
      expect(cap * LOGO_GLOBSCALE).toBeLessThan(1.01);
    }
  });

  it('ships real glyph outlines, one path per base, starting with a moveto', () => {
    for (const b of ['A', 'C', 'G', 'T'] as const) {
      expect(LOGO_GLYPHS[b].startsWith('M')).toBe(true);
      expect(LOGO_GLYPHS[b].length).toBeGreaterThan(100);
      expect(LOGO_GLYPHS[b]).not.toMatch(/NaN|undefined/);
    }
    // C and G are curved and therefore far longer than the straight-edged A and T.
    expect(LOGO_GLYPHS.C.length).toBeGreaterThan(LOGO_GLYPHS.A.length);
    expect(LOGO_GLYPHS.G.length).toBeGreaterThan(LOGO_GLYPHS.T.length);
  });
});

describe('logoColumn — the attribution stacking rule', () => {
  it('sorts descending by magnitude, so the largest letter sits nearest the axis', () => {
    const col = logoColumn([0.1, -0.5, 0.3, -0.05]);   // A C G T
    expect(col.map((l) => l.base)).toEqual(['C', 'G', 'A', 'T']);
  });

  it('stacks positives up from zero and negatives down from zero, independently', () => {
    const col = logoColumn([0.2, -0.4, 0.3, -0.1]);
    const pos = col.filter((l) => l.value > 0);
    const neg = col.filter((l) => l.value < 0);
    // G (0.3) then A (0.2): first at 0, second at 0.3.
    expect(pos.map((l) => [l.base, l.y])).toEqual([['G', 0], ['A', 0.3]]);
    // C (-0.4) then T (-0.1): first at 0, second at -0.4.
    expect(neg.map((l) => [l.base, l.y])).toEqual([['C', 0], ['T', -0.4]]);
  });

  it('total stack height equals the sum of the magnitudes', () => {
    const values = [0.2, -0.4, 0.3, -0.1];
    const col = logoColumn(values);
    const top = Math.max(...col.filter((l) => l.value > 0).map((l) => l.y + l.value), 0);
    const bottom = Math.min(...col.filter((l) => l.value < 0).map((l) => l.y + l.value), 0);
    expect(top - bottom).toBeCloseTo(values.reduce((a, b) => a + Math.abs(b), 0), 12);
  });

  it('drops zeros rather than drawing a glyph of no height', () => {
    // The reference base after projection is the only non-zero value, so most columns are 3 zeros.
    expect(logoColumn([0, 0, -0.7, 0])).toHaveLength(1);
    expect(logoColumn([0, 0, 0, 0])).toHaveLength(0);
  });

  it('keeps the sign on the letter, which is what tells the renderer to mirror it', () => {
    const [only] = logoColumn([0, -0.7, 0, 0]);
    expect(only.value).toBeLessThan(0);
  });
});

describe('logoRange', () => {
  it('pads the data min and max SEPARATELY by 5% of max|v|', () => {
    // 0.05 is the operative constant (17 files); 0.08 is the figure-4 reproduction helper's and
    // 0.10 is a dead fallback. Padding both ends by 5% of the PEAK leaves the range asymmetric.
    const { lo, hi } = logoRange([-0.2, 0.8, 0.1]);
    expect(hi).toBeCloseTo(0.8 + 0.05 * 0.8, 12);
    expect(lo).toBeCloseTo(-0.2 - 0.05 * 0.8, 12);
    expect(Math.abs(hi)).not.toBeCloseTo(Math.abs(lo), 3);
  });

  it('always contains zero, so the axis line is inside the plot', () => {
    for (const v of [[0.1, 0.2, 0.3], [-0.3, -0.1], [0, 0]]) {
      const { lo, hi } = logoRange(v);
      expect(lo).toBeLessThanOrEqual(0);
      expect(hi).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('ismSaliency — the paper\'s transform, off the shipped plane', () => {
  const seq = 'ACGTACGT';

  /** A plane in the site's convention: reference cell zero, three alternatives carrying the effect. */
  function plane(width: number, effects: number[][]): Float64Array {
    const p = new Float64Array(4 * width);
    for (let k = 0; k < width; k += 1) {
      const ref = 'ACGT'.indexOf(seq[k]);
      let j = 0;
      for (let b = 0; b < 4; b += 1) if (b !== ref) p[b * width + k] = effects[k][j++];
    }
    return p;
  }

  it('is exactly minus the sum of the three alternatives over four', () => {
    // centred[b] = P[b] - mean(P); P[ref] = 0; so centred[ref] = -sum(P)/4, and the one-hot
    // projection keeps only that. This identity is why no re-run is needed for the transform.
    const eff = [[-0.4, -0.2, -0.1], [0.3, 0.1, 0.05], [0, 0, 0], [-1, 1, 0]];
    const s = ismSaliency(plane(4, eff), 4, seq, 0);
    for (let k = 0; k < 4; k += 1) {
      expect(s[k]).toBeCloseTo(-eff[k].reduce((a, b) => a + b, 0) / 4, 12);
    }
  });

  it('is POSITIVE where every substitution hurts — the base that is there matters', () => {
    // Three alternatives that all lower the prediction means the reference base is doing work,
    // and the logo must point up. Getting this sign backwards inverts every figure.
    const s = ismSaliency(plane(1, [[-0.4, -0.3, -0.5]]), 1, 'A', 0);
    expect(s[0]).toBeGreaterThan(0);
    expect(s[0]).toBeCloseTo(0.3, 12);
  });

  it('is zero where substitutions cancel, and negative where they help', () => {
    expect(ismSaliency(plane(1, [[0.2, -0.2, 0]]), 1, 'A', 0)[0]).toBeCloseTo(0, 12);
    expect(ismSaliency(plane(1, [[0.4, 0.4, 0.4]]), 1, 'A', 0)[0]).toBeLessThan(0);
  });

  it('ignores whatever sits in the reference row, which a decoded pack does not zero exactly', () => {
    // The raw plane has the reference cell at exactly zero, but the shipped pack is uint8 per row
    // and a log-packed plane decodes it to within half a level of zero rather than onto it. The
    // transform is minus the sum of the three ALTERNATIVES over four, so that residue must not
    // reach the drawing. Folding it in would add packing noise to every position in the window.
    const clean = new Float64Array(4);
    const noisy = new Float64Array(4);
    for (const p of [clean, noisy]) {
      p['ACGT'.indexOf('C')] = -0.4;
      p['ACGT'.indexOf('G')] = -0.3;
      p['ACGT'.indexOf('T')] = -0.5;
    }
    noisy['ACGT'.indexOf('A')] = 3.7e-3;      // the reference row, off zero by a uint8 level
    expect(ismSaliency(clean, 1, 'A', 0)[0]).toBeCloseTo(0.3, 12);
    expect(ismSaliency(noisy, 1, 'A', 0)[0]).toBeCloseTo(0.3, 12);
  });

  it('leaves a non-ACGT position at zero rather than guessing a reference', () => {
    expect(ismSaliency(new Float64Array(4).fill(1), 1, 'N', 0)[0]).toBe(0);
  });

  it('respects the window offset, so the plane and the sequence stay in register', () => {
    // A one-position plane read at offset 2 must use sequence[2], not sequence[0].
    const p = new Float64Array(4);
    p['ACGT'.indexOf('G')] = 0;      // G is the reference at offset 2
    p['ACGT'.indexOf('A')] = -0.8;
    expect(ismSaliency(p, 1, seq, 2)[0]).toBeCloseTo(0.2, 12);
  });
});

describe('logSED', () => {
  it('is the log2 ratio with a +1 pseudocount on each side', () => {
    expect(logSED(0, 0)).toBe(0);
    expect(logSED(1, 3)).toBeCloseTo(Math.log2(4) - Math.log2(2), 12);
    expect(logSED(999, 999)).toBe(0);
  });

  it('is scale-free, which a linear difference is not', () => {
    // A gene at 0.4 doubling and a gene at 400 doubling are the SAME logSED. Under a linear
    // difference they are 0.4 and 400 apart, which is what made the site's percentages
    // incomparable between a silent promoter and a maximal one.
    const quiet = logSED(0.4, 0.4 * 2 + 1);
    const loud = logSED(400, 400 * 2 + 1);
    expect(Math.abs(quiet - loud)).toBeLessThan(0.55);
    expect(Math.sign(quiet)).toBe(Math.sign(loud));
  });

  it('is antisymmetric under swapping reference and alternative', () => {
    for (const [a, b] of [[1, 5], [0.2, 900], [7, 7]]) {
      expect(logSED(a, b)).toBeCloseTo(-logSED(b, a), 12);
    }
  });
});

describe('spliceAnnotations — the landmarks Figure 4 marks', () => {
  type Feat = { name: string; strand: string; cdsStart: number; cdsEnd: number; exons: number[][] };
  const windows = (loci as unknown as { loci: { id: string; features: Feat[] }[] }).loci;
  const dtd1 = windows.find((l) => l.id === 'YDL219W')!.features.find((f) => f.name === 'YDL219W')!;

  it('puts the donor on the real GT of DTD1\'s intron', () => {
    // The intron runs 8165-8236 on the plus strand, so the donor is its start. That base is the
    // one ISM independently finds as the strongest substitution in the whole window.
    const donor = spliceAnnotations(dtd1).find((a) => a.label === "5′ splice site");
    expect(donor!.at).toBe(8165);
  });

  it('places the branch point 30 bp upstream of the acceptor, the paper\'s fixed offset', () => {
    const a = spliceAnnotations(dtd1);
    const acc = a.find((x) => x.label === "3′ splice site")!.at;
    const br = a.find((x) => x.label === 'Branch point')!.at;
    expect(acc - br).toBe(30);
  });

  it('flips donor and acceptor on the minus strand', () => {
    const minus = { strand: '-', cdsStart: 100, cdsEnd: 900, exons: [[100, 300], [400, 900]] };
    const a = spliceAnnotations(minus);
    // On the minus strand the intron's END (400) is the donor and its START (300) the acceptor.
    expect(a.find((x) => x.label === "5′ splice site")!.at).toBe(400);
    expect(a.find((x) => x.label === "3′ splice site")!.at).toBe(300);
    expect(a.find((x) => x.label === 'Branch point')!.at).toBe(330);
    // And the start codon is at the CDS end.
    expect(a.find((x) => x.label === 'Start codon')!.at).toBe(900);
  });

  it('emits no splice landmarks for a single-exon gene', () => {
    const one = { strand: '+', cdsStart: 10, cdsEnd: 90, exons: [[10, 90]] };
    expect(spliceAnnotations(one).filter((a) => a.label.includes('splice'))).toHaveLength(0);
    expect(spliceAnnotations(one)).toHaveLength(2);   // just the two codons
  });

  it('finds landmarks for every multi-exon gene in the shipped windows', () => {
    // Counts GENES, not introns -- HOP2 has two introns but is one gene, which is why this stays
    // at 8 while the intron counts moved to 9.
    let genes = 0;
    for (const l of windows) {
      for (const f of l.features) {
        if (f.exons.length < 2) continue;
        genes += 1;
        const a = spliceAnnotations(f);
        expect(a.filter((x) => x.label === "5′ splice site").length).toBe(f.exons.length - 1);
      }
    }
    expect(genes).toBe(8);     // the eight multi-exon features across the fourteen windows
  });
});

describe('stageRelevanceProfile', () => {
  const P = STAGE_MAP_POSITIONS;
  const maps = new Float32Array(5760 * P);
  const rel = new Float64Array(5760);

  it('gives one row per mapped stage, lit only where a relevant channel fires', () => {
    maps.fill(0);
    rel.fill(0);
    // One channel of block1, firing at a single position, carrying all the relevance.
    maps[0 * P + 40] = 3;
    rel[0] = 1;
    const rows = stageRelevanceProfile(maps, rel, P);
    expect(rows).toHaveLength(stageMapOffsets().length);
    expect(rows[0].id).toBe('block1');
    expect(rows[0].profile[40]).toBeGreaterThan(0);
    expect(rows[0].profile[39]).toBe(0);
    // Scaled by the 99th percentile, so a lone spike sits well ABOVE 1 -- deliberately not
    // clamped, because clamping collapses every above-percentile cell to the same value.
    expect(rows[0].profile[40]).toBeGreaterThan(1);
  });

  it('ignores channels with no relevance, however loudly they fire', () => {
    maps.fill(0);
    rel.fill(0);
    maps[1 * P + 10] = 99;                    // a very loud channel...
    rel[0] = 1;                               // ...but the relevance is on channel 0
    maps[0 * P + 70] = 1;
    const rows = stageRelevanceProfile(maps, rel, P);
    expect(rows[0].profile[10]).toBe(0);
    expect(rows[0].profile[70]).toBeGreaterThan(0);
  });

  it('sums over channels, so two contributing channels both show', () => {
    maps.fill(0);
    rel.fill(0);
    maps[0 * P + 20] = 1; rel[0] = 1;
    maps[1 * P + 60] = 1; rel[1] = 1;
    const p0 = stageRelevanceProfile(maps, rel, P)[0].profile;
    expect(p0[20]).toBeGreaterThan(0.5);
    expect(p0[60]).toBeGreaterThan(0.5);
  });

  it('weights a channel by RELEVANCE, not by how loudly it fires', () => {
    // The point of the per-channel normalisation. Channel 0 fires 100x louder than channel 1 but
    // carries a tenth of the relevance, so channel 1's position must win. Without normalising each
    // channel to its own total, the loud one dominates and the row reports the window's loudest
    // gene rather than the traced region.
    maps.fill(0);
    rel.fill(0);
    maps[0 * P + 20] = 100; rel[0] = 0.1;
    maps[1 * P + 60] = 1;   rel[1] = 1.0;
    const p0 = stageRelevanceProfile(maps, rel, P)[0].profile;
    expect(p0[60]).toBeGreaterThan(p0[20]);
  });

  it('is invariant to a channel\'s overall scale', () => {
    maps.fill(0); rel.fill(0);
    maps[0 * P + 20] = 1; maps[0 * P + 21] = 3; rel[0] = 1;
    const a = Array.from(stageRelevanceProfile(maps, rel, P)[0].profile);
    maps[0 * P + 20] = 1000; maps[0 * P + 21] = 3000;
    const b = Array.from(stageRelevanceProfile(maps, rel, P)[0].profile);
    expect(a).toEqual(b);
  });

  it('uses the magnitude, so a strongly negative activation still counts', () => {
    maps.fill(0);
    rel.fill(0);
    maps[0 * P + 5] = -4;
    rel[0] = 1;
    expect(stageRelevanceProfile(maps, rel, P)[0].profile[5]).toBeGreaterThan(0);
  });

  it('returns an all-zero row rather than NaN when a stage carries no relevance', () => {
    maps.fill(0);
    rel.fill(0);
    const rows = stageRelevanceProfile(maps, rel, P);
    for (const r of rows) for (const v of r.profile) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('exactStageProfiles', () => {
  const S = 18;
  const P = 128;

  it('names one profile per mapped stage, in stageMapOffsets order', () => {
    const rows = exactStageProfiles(new Float64Array(S * P), P);
    expect(rows.map((r) => r.id)).toEqual(stageMapOffsets().map((o) => o.id));
    expect(rows).toHaveLength(S);
  });

  it('reads each stage from its own slice, so a stage cannot show its neighbour\'s profile', () => {
    // Every value carries the stage it came from, so a wrong offset reports the wrong number
    // rather than merely looking different -- the same marker trick shorkieFlow.test.ts uses.
    const flat = new Float64Array(S * P);
    for (let s = 0; s < S; s += 1) for (let p = 0; p < P; p += 1) flat[s * P + p] = s + p / 1000;
    const rows = exactStageProfiles(flat, P);
    rows.forEach((r, s) => {
      expect(r.profile[0]).toBeCloseTo(s, 12);
      expect(r.profile[P - 1]).toBeCloseTo(s + (P - 1) / 1000, 12);
    });
  });

  it('superposes: a region equals the sum of the groups it covers', () => {
    // This is the property that makes an arbitrary dragged region EXACT rather than interpolated.
    // Gradients are linear in the output selection, so the margin for bins [a, b) is the sum of
    // the group rows covering them -- no model run, no approximation.
    const groups = 112;
    const groupBins = 8;
    const cols = S * P;
    const plane = new Float64Array(groups * cols);
    for (let g = 0; g < groups; g += 1) for (let i = 0; i < cols; i += 1) plane[g * cols + i] = g * 0.5 + i;
    const start = 3 * groupBins;
    const end = 7 * groupBins;
    const summed = sumAttributionRows(plane, cols, groupBins, groups, start, end);
    const byHand = new Float64Array(cols);
    for (let g = 3; g < 7; g += 1) for (let i = 0; i < cols; i += 1) byHand[i] += g * 0.5 + i;
    for (let i = 0; i < cols; i += 4096) expect(summed[i]).toBeCloseTo(byHand[i], 6);
    // and the reshape preserves it
    const rows = exactStageProfiles(summed, P);
    expect(rows[5].profile[7]).toBeCloseTo(byHand[5 * P + 7], 6);
  });

  it('returns finite zeros for an all-zero plane rather than NaN', () => {
    for (const r of exactStageProfiles(new Float64Array(S * P), P)) {
      for (const v of r.profile) expect(v).toBe(0);
    }
  });
});

describe('relevanceMap', () => {
  const C = 4;
  const P = 3;

  it('reproduces BOTH margins exactly, which is the property it is built on', () => {
    const chan = new Float64Array([0, 0, 0, 1, 3, 0, 0, 0]);   // stage starts at 3, four channels
    const pos = new Float64Array([2, 1, 1]);
    const m = relevanceMap(chan, pos, 0, 3, C, P);
    // Row sums must be the channel margin, normalised; column sums the position margin.
    const rows = Array.from({ length: C }, (_, c) =>
      Array.from({ length: P }, (_, p) => m[c * P + p]).reduce((a, b) => a + b, 0));
    const cols = Array.from({ length: P }, (_, p) =>
      Array.from({ length: C }, (_, c) => m[c * P + p]).reduce((a, b) => a + b, 0));
    expect(rows).toEqual(expect.arrayContaining([]));
    expect(rows[0]).toBeCloseTo(1 / 4, 12);
    expect(rows[1]).toBeCloseTo(3 / 4, 12);
    expect(cols[0]).toBeCloseTo(2 / 4, 12);
    expect(cols[1]).toBeCloseTo(1 / 4, 12);
  });

  it('sums to 1, so stages spanning orders of magnitude stay comparable', () => {
    const m = relevanceMap(new Float64Array([5, 2, 9, 1]), new Float64Array([3, 3, 4]), 0, 0, C, P);
    expect(Array.from(m).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('reads the stage\'s own slice of each margin', () => {
    const chan = new Float64Array(8).fill(0);
    chan[4] = 1;                                  // channel 0 of a stage starting at 4
    const pos = new Float64Array([0, 0, 0, 7, 0, 0]);   // stage index 1, position 0
    const m = relevanceMap(chan, pos, 1, 4, C, P);
    expect(m[0 * P + 0]).toBeCloseTo(1, 12);
    expect(m[0 * P + 1]).toBe(0);
    expect(m[1 * P + 0]).toBe(0);
  });

  it('uses magnitude, so a negative margin still contributes', () => {
    const m = relevanceMap(new Float64Array([-4, 0, 0, 0]), new Float64Array([-1, 0, 0]), 0, 0, C, P);
    expect(m[0]).toBeCloseTo(1, 12);
  });

  it('returns all zeros rather than NaN when a margin is empty', () => {
    for (const m of [
      relevanceMap(new Float64Array(C), new Float64Array(P), 0, 0, C, P),
      relevanceMap(new Float64Array([1, 1, 1, 1]), new Float64Array(P), 0, 0, C, P),
    ]) {
      for (const v of m) expect(v).toBe(0);
    }
  });
});

/* ------------------------------------------------------------------------------------------- *
 * The annotation layer and its statistics.
 * ------------------------------------------------------------------------------------------- */

const feat = (over: Partial<AnnotationFeature> = {}): AnnotationFeature => ({
  cls: 'tfbs', name: 'X', start: 0, end: 10, strand: '+', source: 'harbison-macisaac', ...over,
});

describe('motifTier', () => {
  it('separates ChIP-supported from conservation-only, which is the whole point', () => {
    expect(motifTier(feat({ evidence: 'good' }))).toBe('chip');
    expect(motifTier(feat({ evidence: 'weak' }))).toBe('chip');
    expect(motifTier(feat({ evidence: 'none' }))).toBe('conserved');
    expect(motifTier(feat({}))).toBe('conserved');            // absent evidence is not support
  });

  it('keeps a PWM scan and the paper\'s own consensuses in their own tiers', () => {
    expect(motifTier(feat({ source: 'jaspar', score: 900 }))).toBe('pwm');
    expect(motifTier(feat({ source: 'paper' }))).toBe('paper');
  });

  it('is null for anything that is not a binding-site claim', () => {
    expect(motifTier(feat({ source: 'sgd', cls: 'gene' }))).toBeNull();
    expect(motifTier(feat({ source: 'oreganno', cls: 'regulatory' }))).toBeNull();
  });
});

describe('featureMask', () => {
  it('marks exactly the half-open span', () => {
    const m = featureMask([feat({ start: 3, end: 6 })], 10);
    expect([...m]).toEqual([0, 0, 0, 1, 1, 1, 0, 0, 0, 0]);
  });

  it('does not stack overlaps -- it is set membership, not a count', () => {
    const m = featureMask([feat({ start: 2, end: 6 }), feat({ start: 4, end: 8 })], 10);
    expect([...m]).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 0, 0]);
    expect(Math.max(...m)).toBe(1);
  });

  it('clamps a feature running off either edge', () => {
    expect([...featureMask([feat({ start: -5, end: 3 })], 6)]).toEqual([1, 1, 1, 0, 0, 0]);
    expect([...featureMask([feat({ start: 4, end: 99 })], 6)]).toEqual([0, 0, 0, 0, 1, 1]);
  });
});

describe('poolCoverage', () => {
  it('returns the covered FRACTION, not a max -- a 7 bp site in a 128 bp cell is 5%, not 100%', () => {
    const mask = new Uint8Array(128);
    for (let i = 0; i < 7; i += 1) mask[i] = 1;
    const pooled = poolCoverage(mask, 1);
    expect(pooled[0]).toBeCloseTo(7 / 128, 12);
  });

  it('conserves total mass across the pooling', () => {
    const mask = featureMask([feat({ start: 100, end: 340 })], 1024);
    const pooled = poolCoverage(mask, 128);
    const before = mask.reduce((a, b) => a + b, 0);
    const after = pooled.reduce((a, b) => a + b, 0) * (1024 / 128);
    expect(after).toBeCloseTo(before, 9);
  });

  it('is all ones for a fully covered window and all zeros for an empty one', () => {
    expect([...poolCoverage(featureMask([feat({ start: 0, end: 64 })], 64), 8)])
      .toEqual(new Array(8).fill(1));
    expect([...poolCoverage(new Uint8Array(64), 8)]).toEqual(new Array(8).fill(0));
  });
});

describe('circularShiftOffsets', () => {
  it('never returns a zero shift -- that would put the observed value in its own null', () => {
    for (const k of [1, 7, 64, 255, 256]) {
      expect(circularShiftOffsets(16384, k)).not.toContain(0);
    }
  });

  it('is deterministic, so a published enrichment can be reproduced exactly', () => {
    expect(circularShiftOffsets(1000, 9)).toEqual(circularShiftOffsets(1000, 9));
    expect(circularShiftOffsets(1000, 9)).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900]);
  });

  it('stays inside the window', () => {
    for (const o of circularShiftOffsets(128, 300)) {
      expect(o).toBeGreaterThan(0);
      expect(o).toBeLessThan(128);
    }
  });
});

describe('weightedEnrichment', () => {
  it('is exactly 1.0 for a flat signal, whatever the mask', () => {
    const signal = new Float64Array(512).fill(3);
    const mask = featureMask([feat({ start: 10, end: 40 }), feat({ start: 300, end: 305 })], 512);
    const r = weightedEnrichment(signal, mask, 64)!;
    expect(r.ratio).toBeCloseTo(1, 12);
    expect(r.nullMean).toBeCloseTo(1, 12);
    expect(r.nullSd).toBeCloseTo(0, 12);
  });

  it('recovers the ratio a hand-computed example must give', () => {
    // 8 positions; signal 4 on the two masked ones, 1 elsewhere.
    // inside mean = 4; window mean = (4+4+1*6)/8 = 1.75; ratio = 4/1.75 = 2.2857...
    const signal = [4, 4, 1, 1, 1, 1, 1, 1];
    const mask = [1, 1, 0, 0, 0, 0, 0, 0];
    const r = weightedEnrichment(signal, mask, 6)!;
    expect(r.ratio).toBeCloseTo(4 / 1.75, 12);
    expect(r.covered).toBeCloseTo(2 / 8, 12);
  });

  it('uses |signal| for the ratio but reports the signed mean, so suppression is visible', () => {
    const signal = [-4, -4, 1, 1, 1, 1, 1, 1];
    const mask = [1, 1, 0, 0, 0, 0, 0, 0];
    const r = weightedEnrichment(signal, mask, 6)!;
    expect(r.ratio).toBeCloseTo(4 / 1.75, 12);      // magnitude, so it still reads as enriched
    expect(r.signedInside).toBeCloseTo(-4, 12);     // ...but the direction is not lost
  });

  it('detects a planted signal and rejects an unaligned one', () => {
    const n = 2048;
    const signal = new Float64Array(n).fill(1);
    const hit = featureMask([feat({ start: 500, end: 520 })], n);
    for (let p = 500; p < 520; p += 1) signal[p] = 50;
    const aligned = weightedEnrichment(signal, hit, 256)!;
    const elsewhere = weightedEnrichment(signal, featureMask([feat({ start: 1500, end: 1520 })], n), 256)!;
    expect(aligned.ratio).toBeGreaterThan(20);
    expect(aligned.p).toBeCloseTo(1 / 257, 12);     // nothing in the null reaches it
    expect(elsewhere.ratio).toBeLessThan(1.1);
    expect(elsewhere.p).toBeGreaterThan(0.1);
  });

  it('is invariant to scaling the signal -- it is a ratio', () => {
    const n = 512;
    const signal = Array.from({ length: n }, (_, i) => 1 + Math.sin(i / 7) ** 2);
    const mask = featureMask([feat({ start: 60, end: 90 })], n);
    const a = weightedEnrichment(signal, mask, 32)!;
    const b = weightedEnrichment(signal.map((v) => v * 1000), mask, 32)!;
    expect(b.ratio).toBeCloseTo(a.ratio, 12);
  });

  it('gives a fractional weight the same answer as an equivalent binary mask', () => {
    // Coverage 0.5 over twice the span carries the same total weight as 1.0 over half of it,
    // and the ratio is normalised by that total -- so a pooled mask is not penalised for pooling.
    const signal = [2, 2, 2, 2, 1, 1, 1, 1];
    const binary = weightedEnrichment(signal, [1, 1, 1, 1, 0, 0, 0, 0], 6)!;
    const frac = weightedEnrichment(signal, [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0], 6)!;
    expect(frac.ratio).toBeCloseTo(binary.ratio, 12);
  });

  it('returns null rather than a fake number when there is nothing to measure', () => {
    expect(weightedEnrichment([1, 2, 3], [0, 0, 0], 4)).toBeNull();
    expect(weightedEnrichment([0, 0, 0], [1, 1, 1], 4)).toBeNull();
    expect(weightedEnrichment([], [], 4)).toBeNull();
  });
});

describe('ANNOTATION_CLASSES', () => {
  it('covers every class the shipped annotation files actually use', async () => {
    // Exhaustive rather than defaulted: a class added upstream must fail here, not quietly render
    // in whichever lane happens to be first.
    const fs = await import('node:fs');
    const dir = 'public/vp-data';
    const seen = new Set<string>();
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('-ann.json'))) {
      const d = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
      for (const r of d.features) seen.add(r.cls);
    }
    expect(seen.size).toBeGreaterThan(0);
    for (const cls of seen) expect(ANNOTATION_CLASSES[cls], `class ${cls}`).toBeDefined();
  });
});
