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
  encoderMapOffsets,
  RNA_SEQ_GROUP,
  type StemWeights,
  pearson,
  activationInk,
} from './shorkieModel';
import tracks from '../data/shorkieTracks.json';

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
  it('ships eight full-length windows with annotation', () => {
    expect(loci.loci.length).toBe(8);
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
    const wanted = ['TDH3', 'PGK1', 'ACT1', 'ADH1', 'FBA1', 'PDC1', 'GAL1', 'GAL3'];
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

describe('encoder map slicing', () => {
  it('offsets tile the 1,536 concatenated channels in block order', () => {
    const offs = encoderMapOffsets();
    expect(offs).toHaveLength(7);
    expect(offs.map((o) => o.channels)).toEqual([...BLOCK_FILTERS]);
    let cursor = 0;
    for (const o of offs) {
      expect(o.start).toBe(cursor);
      cursor += o.channels;
    }
    expect(cursor).toBe(1536);
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
