import { describe, it, expect } from 'vitest';
import stemWeights from '../data/shorkieStem.json';
import loci from '../data/shorkieLoci.json';
import parity from './__fixtures__/shorkieStemParity.json';
import {
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
  filterLogo,
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

  it('layerSpecs walks stem -> 7 blocks -> 8 attention -> 3 decoder -> head', () => {
    const specs = layerSpecs();
    expect(specs).toHaveLength(1 + 7 + 8 + 3 + 1);
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

describe('filter logos', () => {
  it('gives one mean-centred row of four bases per kernel position', () => {
    const logo = filterLogo(0, stem);
    expect(logo).toHaveLength(11);
    logo.forEach((row) => {
      expect(row).toHaveLength(4);
      expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 6);
    });
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
    expect(stages).toHaveLength(20);
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
    // The conv stem and block 1 both operate at the full 16,384, so the first step is flat; every
    // step after it halves.
    const enc = stages.filter((s) => s.group === 'encoder');
    expect(enc[1].height).toBe(enc[0].height);
    for (let i = 2; i < enc.length; i += 1) {
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
    expect(stages.filter((s) => s.group === 'encoder')).toHaveLength(8); // stem + 7 blocks
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
