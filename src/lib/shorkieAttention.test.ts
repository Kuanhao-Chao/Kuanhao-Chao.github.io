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
      expect(stem.theoreticalRfBp).toBe(15);
      expect(stem.isGlobal).toBe(false);

      const block7 = SHORKIE_LAYERS.find((l) => l.id === 'block7');
      expect(block7).toBeDefined();
      expect(block7!.theoreticalRfBp).toBe(2555);
      expect(block7!.isGlobal).toBe(false);

      const trans1 = SHORKIE_LAYERS.find((l) => l.id === 'transformer1');
      expect(trans1).toBeDefined();
      expect(trans1!.theoreticalRfBp).toBe(16384);
      expect(trans1!.isGlobal).toBe(true);
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
      // Distance of 1000 bp: inside Block 7 (RF = 2555)
      const res = checkReceptiveFeasibility(5000, 6000, block7);
      expect(res.distanceBp).toBe(1000);
      expect(res.isInReceptiveField).toBe(true);
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
