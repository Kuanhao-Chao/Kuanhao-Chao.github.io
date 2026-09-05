import { describe, it, expect } from 'vitest';
import {
  SHORKIE_LAYERS,
  checkReceptiveFeasibility,
  bpToBottleneckToken,
  bottleneckTokenToBpSpan,
  getTopAttentionConnections,
  simulateSignalTransmission,
  computeAttentionRollout,
} from './shorkieAttention';

describe('shorkieAttention', () => {
  describe('SHORKIE_LAYERS specifications', () => {
    it('defines the complete layer hierarchy from stem to head', () => {
      expect(SHORKIE_LAYERS.length).toBeGreaterThanOrEqual(18);
      const stem = SHORKIE_LAYERS[0];
      expect(stem.id).toBe('stem');
      expect(stem.theoreticalRfBp).toBe(11);
      expect(stem.isGlobal).toBe(false);

      const block7 = SHORKIE_LAYERS.find((l) => l.id === 'block7');
      expect(block7).toBeDefined();
      expect(block7!.theoreticalRfBp).toBe(582);
      expect(block7!.isGlobal).toBe(false);

      const trans1 = SHORKIE_LAYERS.find((l) => l.id === 'transformer1');
      expect(trans1).toBeDefined();
      expect(trans1!.theoreticalRfBp).toBe(16384);
      expect(trans1!.isGlobal).toBe(true);
    });

    it('re-derives the convolutional ladder from the checkpoint architecture', () => {
      // Not a restatement of the table -- a recomputation from the kernel sizes the fold-f0
      // checkpoint actually holds: an 11 bp stem, then seven blocks of conv k=5 (the pointwise
      // k=1 adds no reach) each followed by max-pool 2/2. The previous ladder was pinned by a
      // test that simply repeated its numbers, which is how a 15 bp stem survived alongside a
      // checkpoint that has an 11 bp one.
      const STEM_K = 11;
      const CONV_K = 5;
      let rf = STEM_K;
      let jump = 1;
      expect(SHORKIE_LAYERS[0].theoreticalRfBp).toBe(rf);

      for (let i = 1; i <= 7; i += 1) {
        const blockRf = rf + (CONV_K - 1) * jump;
        const spec = SHORKIE_LAYERS.find((l) => l.id === `block${i}`)!;
        expect(spec.theoreticalRfBp).toBe(blockRf);
        // A block's activation is recorded BEFORE its pool, so its position count is the
        // resolution going in, not coming out.
        expect(spec.resolution).toBe(16384 / 2 ** (i - 1));
        expect(spec.bpPerUnit).toBe(2 ** (i - 1));
        rf = blockRf + jump;      // the max-pool that follows it
        jump *= 2;
      }
    });

    it('gives every conv-tower stage the channel width the checkpoint holds', () => {
      // BLOCK_FILTERS in shorkie_torch.py, and block_i's output is BLOCK_FILTERS[i-1]. The old
      // table was off by one here too, calling block1 128-wide when it is 96.
      const widths = [96, 128, 160, 192, 256, 320, 384];
      expect(SHORKIE_LAYERS[0].channels).toBe(96);
      widths.forEach((w, i) => {
        expect(SHORKIE_LAYERS.find((l) => l.id === `block${i + 1}`)!.channels).toBe(w);
      });
      // Every decoder stage carries the 384-wide decoder state.
      [1, 2, 3].forEach((i) => {
        expect(SHORKIE_LAYERS.find((l) => l.id === `decoder${i}`)!.channels).toBe(384);
      });
    });
  });

  describe('coordinate transforms', () => {
    it('maps base pairs to 128 bottleneck tokens', () => {
      expect(bpToBottleneckToken(0)).toBe(0);
      expect(bpToBottleneckToken(64)).toBe(0);
      expect(bpToBottleneckToken(128)).toBe(1);
      expect(bpToBottleneckToken(8192)).toBe(64);
      expect(bpToBottleneckToken(16383)).toBe(127);
      expect(bpToBottleneckToken(20000)).toBe(127); // clamped
    });

    it('maps bottleneck tokens to genomic base pair spans', () => {
      expect(bottleneckTokenToBpSpan(0)).toEqual([0, 128]);
      expect(bottleneckTokenToBpSpan(64)).toEqual([8192, 8320]);
      expect(bottleneckTokenToBpSpan(127)).toEqual([16256, 16384]);
    });
  });

  describe('checkReceptiveFeasibility', () => {
    it('detects when distal regions are outside early conv receptive fields', () => {
      const stem = SHORKIE_LAYERS[0];
      // Distance of 500 bp: far outside Stem (RF = 15)
      const res = checkReceptiveFeasibility(1000, 1500, stem);
      expect(res.distanceBp).toBe(500);
      expect(res.isInReceptiveField).toBe(false);
    });

    it('detects when regions fall inside conv receptive fields', () => {
      const block7 = SHORKIE_LAYERS.find((l) => l.id === 'block7')!;
      // Distance of 400 bp: inside Block 7, whose real reach is 582 bp. The number this used
      // to use, 2,555, came from a ladder seeded with the paper's 15 bp stem instead of the
      // checkpoint's 11 bp -- so 1,000 bp read as "reachable by convolution alone" when it is
      // more than 400 bp past the widest purely convolutional stage.
      const res = checkReceptiveFeasibility(5000, 5400, block7);
      expect(res.distanceBp).toBe(400);
      expect(res.isInReceptiveField).toBe(true);

      const beyond = checkReceptiveFeasibility(5000, 6000, block7);
      expect(beyond.isInReceptiveField).toBe(false);
    });

    it('marks any distance within window as reachable in transformer layers', () => {
      const trans1 = SHORKIE_LAYERS.find((l) => l.id === 'transformer1')!;
      // Distance of 12,000 bp: inside Transformer (RF = 16,384)
      const res = checkReceptiveFeasibility(1000, 13000, trans1);
      expect(res.distanceBp).toBe(12000);
      expect(res.isInReceptiveField).toBe(true);
    });
  });

  describe('computeAttentionRollout', () => {
    it('computes row-stochastic rollout across layers', () => {
      const N = 4;
      const layers = 2;
      // Identity attention
      const identityAttn = new Float64Array(layers * N * N);
      for (let l = 0; l < layers; l++) {
        for (let i = 0; i < N; i++) {
          identityAttn[l * N * N + i * N + i] = 1.0;
        }
      }
      const rollout = computeAttentionRollout(identityAttn, N, layers);
      expect(rollout.length).toBe(N * N);
      // Row sums must be 1
      for (let i = 0; i < N; i++) {
        let rowSum = 0;
        for (let j = 0; j < N; j++) rowSum += rollout[i * N + j];
        expect(rowSum).toBeCloseTo(1.0, 5);
      }
    });
  });

  describe('getTopAttentionConnections', () => {
    it('extracts ranked attention connections with enrichment ratio', () => {
      const N = 128;
      const matrix = new Float64Array(N * N);
      const targetToken = 60;
      // Set some synthetic attention weights
      matrix[targetToken * N + 20] = 0.25; // 25% to token 20
      matrix[targetToken * N + 40] = 0.15; // 15% to token 40
      matrix[targetToken * N + targetToken] = 0.40; // 40% self-attention

      const top = getTopAttentionConnections(matrix, targetToken, 3, N);
      expect(top.length).toBe(3);
      expect(top[0].targetToken).toBe(targetToken);
      expect(top[0].sourceToken).toBe(targetToken);
      expect(top[0].weight).toBeCloseTo(0.40, 5);
      expect(top[0].enrichmentRatio).toBeGreaterThan(1.0);

      expect(top[1].sourceToken).toBe(20);
      expect(top[1].weight).toBeCloseTo(0.25, 5);
    });
  });

  describe('simulateSignalTransmission', () => {
    it('models Shorkie hybrid, dilated convnet, and SSM behaviors accurately', () => {
      const shortDist = 200;
      const longDist = 10000;

      const shorkieShort = simulateSignalTransmission(shortDist, 'shorkie_hybrid');
      const shorkieLong = simulateSignalTransmission(longDist, 'shorkie_hybrid');
      expect(shorkieShort.signalTransmission).toBeGreaterThan(0.7);
      expect(shorkieLong.signalTransmission).toBeGreaterThan(0.5); // global attention maintains signal!

      const dilatedLong = simulateSignalTransmission(longDist, 'dilated_convnet');
      expect(dilatedLong.signalTransmission).toBeLessThan(0.1); // dilated convnet drops off without global hops!

      const ssmLong = simulateSignalTransmission(longDist, 'state_space_model');
      expect(ssmLong.signalTransmission).toBeGreaterThan(0.2);
      expect(ssmLong.signalTransmission).toBeLessThan(shorkieLong.signalTransmission);
    });
  });
});
