import { describe, it, expect } from 'vitest';
import {
  LM_SPEC, entropyBits, informationContent, constraintColumn, crossEntropyBits,
  dequantizeRow, renormalise, homopolymerFraction, beatsCompositionFloor, pca2,
} from './shorkieLm';

const UNIFORM = [0.25, 0.25, 0.25, 0.25];
const CERTAIN = [1, 0, 0, 0];

describe('LM_SPEC', () => {
  it('records the decoder difference that defines the model', () => {
    // Shorkie has 3 U-Net stages and stops at 16 bp; the LM has 7 and resolves single bases.
    expect(LM_SPEC.unetStages).toBe(7);
    expect(LM_SPEC.bottleneck * 2 ** LM_SPEC.unetStages).toBe(LM_SPEC.seqLength);
    expect(LM_SPEC.headUnits).toBe(4);
    expect(LM_SPEC.headActivation).toBe('softmax');
  });

  it('accounts for the checkpoint exactly, not approximately', () => {
    // The docs say "~13.7 M". The released file holds 13,665,828 values: parameters plus the
    // batch-norm running statistics, which are not parameters.
    expect(LM_SPEC.checkpointValues - LM_SPEC.parameters).toBe(14_016);
  });

  it('keeps the input decomposition that the docs get wrong', () => {
    expect(4 + 1 + LM_SPEC.species).toBe(LM_SPEC.inputChannels);
  });
});

describe('entropyBits / informationContent', () => {
  it('is 2 bits for a uniform distribution and 0 for a certain one', () => {
    expect(entropyBits(UNIFORM)).toBeCloseTo(2, 12);
    expect(entropyBits(CERTAIN)).toBeCloseTo(0, 12);
  });

  it('inverts into information content on the fixed 0–2 bit axis', () => {
    expect(informationContent(UNIFORM)).toBeCloseTo(0, 12);
    expect(informationContent(CERTAIN)).toBeCloseTo(2, 12);
  });

  it('treats a zero probability as contributing nothing, not NaN', () => {
    expect(Number.isFinite(entropyBits([0.5, 0.5, 0, 0]))).toBe(true);
    expect(entropyBits([0.5, 0.5, 0, 0])).toBeCloseTo(1, 12);
  });
});

describe('constraintColumn', () => {
  it('gives every letter a height of p × IC and sums to the IC', () => {
    const col = constraintColumn([0.7, 0.1, 0.1, 0.1]);
    const ic = informationContent([0.7, 0.1, 0.1, 0.1]);
    expect(col.reduce((s, c) => s + c.height, 0)).toBeCloseTo(ic, 12);
    expect(col).toHaveLength(4);
  });

  it('stacks ascending, the PWM convention — not descending like an attribution logo', () => {
    const col = constraintColumn([0.7, 0.1, 0.15, 0.05]);
    for (let i = 1; i < col.length; i += 1) {
      expect(col[i].height).toBeGreaterThanOrEqual(col[i - 1].height);
    }
    expect(col[col.length - 1].base).toBe('A');   // the tallest is the most probable
  });

  it('collapses to zero height everywhere when the model is uncertain', () => {
    for (const c of constraintColumn(UNIFORM)) expect(c.height).toBeCloseTo(0, 12);
  });

  it('never returns a negative height', () => {
    // IC is clamped at 0: quantisation can push a decoded distribution just past uniform.
    for (const c of constraintColumn([0.26, 0.25, 0.25, 0.24])) {
      expect(c.height).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('crossEntropyBits', () => {
  it('is 0 when the model is certain and right, 2 when uniform', () => {
    expect(crossEntropyBits(CERTAIN, 'A')).toBeCloseTo(0, 12);
    expect(crossEntropyBits(UNIFORM, 'C')).toBeCloseTo(2, 12);
  });

  it('is large but finite when the model is certain and wrong', () => {
    const v = crossEntropyBits(CERTAIN, 'T')!;
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThan(30);
  });

  it('returns null for a base that is not ACGT rather than a fake number', () => {
    expect(crossEntropyBits(UNIFORM, 'N')).toBeNull();
  });
});

describe('dequantizeRow', () => {
  it('round-trips a linear row to within one quantisation step', () => {
    const lo = 0;
    const hi = 1;
    const raw = [0, 64, 128, 192, 255];
    const back = dequantizeRow(raw, lo, hi, 'linear');
    expect(back[0]).toBeCloseTo(0, 12);
    expect(back[4]).toBeCloseTo(1, 12);
    expect(back[2]).toBeCloseTo(128 / 255, 12);
  });

  it('reads log space as a decimal exponent', () => {
    const back = dequantizeRow([0, 255], -6, 0, 'log');
    expect(back[0]).toBeCloseTo(1e-6, 15);
    expect(back[1]).toBeCloseTo(1, 12);
  });
});

describe('renormalise', () => {
  it('restores a distribution that quantisation left off 1', () => {
    const p = renormalise([0.3, 0.3, 0.3, 0.3]);
    expect([...p].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    for (const v of p) expect(v).toBeCloseTo(0.25, 12);
  });

  it('clamps a negative to zero rather than letting it cancel a real probability', () => {
    const p = renormalise([-0.1, 0.5, 0.5, 0]);
    expect(p[0]).toBe(0);
    expect([...p].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('falls back to uniform rather than dividing by zero', () => {
    for (const v of renormalise([0, 0, 0, 0])) expect(v).toBeCloseTo(0.25, 12);
  });
});

describe('the contiguous-mask failure, as a measurement', () => {
  it('detects a homopolymer reconstruction', () => {
    // This is what the LM actually emits when a whole site is masked: a run of one base.
    expect(homopolymerFraction('AAAAAAAAAA')).toBeCloseTo(1, 12);
    // The real RAP1 site the LM failed to recall: 5 G in 10, so exactly 0.5 -- a diverse sequence
    // still has a floor set by four letters, which is why this is read against a reconstruction
    // rather than as an absolute threshold.
    expect(homopolymerFraction('TGCGTGGGTC')).toBeCloseTo(0.5, 12);
    expect(homopolymerFraction('ACGTACGTACGT')).toBeCloseTo(0.25, 12);
    expect(homopolymerFraction('')).toBe(0);
  });

  it('scores a recall against the composition floor, not against zero', () => {
    // TDH3 measured: mean identity 0.2533 against a 0.3239 floor, so the average "reconstruction"
    // is WORSE than guessing the window's most common base at every position.
    const floor = 0.3239;
    expect(beatsCompositionFloor(
      { name: 'x', start: 0, end: 10, reference: '', recalled: '', identity: 0.2533, meanRefProb: 0 },
      floor,
    )).toBe(false);
    expect(beatsCompositionFloor(
      { name: 'y', start: 0, end: 10, reference: '', recalled: '', identity: 0.75, meanRefProb: 0 },
      floor,
    )).toBe(true);
  });
});

describe('pca2', () => {
  it('puts the dominant direction on x', () => {
    // Points strung out along one axis with a little spread on another.
    const n = 40;
    const d = 3;
    const data: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const t = i - n / 2;
      data.push(10 * t, 0.2 * ((i % 5) - 2), 0);
    }
    const p = pca2(data, n, d);
    const spreadX = Math.max(...p.map((q) => q.x)) - Math.min(...p.map((q) => q.x));
    const spreadY = Math.max(...p.map((q) => q.y)) - Math.min(...p.map((q) => q.y));
    expect(spreadX).toBeGreaterThan(spreadY * 5);
  });

  it('is deterministic — the same input gives the same picture on every reload', () => {
    const data = Array.from({ length: 60 }, (_, i) => Math.sin(i) * (i % 7));
    const a = pca2(data, 20, 3);
    const b = pca2(data, 20, 3);
    expect(a).toEqual(b);
  });

  it('centres the projection on the origin', () => {
    const data = Array.from({ length: 90 }, (_, i) => 100 + Math.cos(i) * 3);
    const p = pca2(data, 30, 3);
    const mx = p.reduce((s, q) => s + q.x, 0) / p.length;
    expect(Math.abs(mx)).toBeLessThan(1e-8);
  });
});
