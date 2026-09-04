import { describe, it, expect } from 'vitest';
import {
  calculateAttention,
  computeGQAHeadMapping,
  applyRoPE,
  applySinusoidalPositionalEncoding,
  applyRMSNorm,
  applyLayerNorm,
  computeFFN,
  calculateTransformerParams,
  calculateTransformerFlops,
  calculateKVCacheMemory,
  generateTransformerPyTorchSnippet,
  type TransformerConfig,
} from './transformerCore';

describe('transformerCore mathematical domain engine', () => {
  describe('calculateAttention', () => {
    it('computes scaled dot-product attention correctly with softmax rows summing to 1.0', () => {
      const Q = [
        [1, 0],
        [0, 1],
      ];
      const K = [
        [1, 0],
        [0, 1],
      ];
      const V = [
        [10, 20],
        [30, 40],
      ];
      const dK = 2;

      const result = calculateAttention(Q, K, V, dK, 'none');

      expect(result.rawScores).toHaveLength(2);
      expect(result.scaledScores).toHaveLength(2);
      expect(result.weights).toHaveLength(2);
      expect(result.context).toHaveLength(2);

      // Raw scores: Q * K^T
      // Row 0: [1*1 + 0*0, 1*0 + 0*1] = [1, 0]
      // Row 1: [0*1 + 1*0, 0*0 + 1*1] = [0, 1]
      expect(result.rawScores[0][0]).toBeCloseTo(1);
      expect(result.rawScores[0][1]).toBeCloseTo(0);
      expect(result.rawScores[1][0]).toBeCloseTo(0);
      expect(result.rawScores[1][1]).toBeCloseTo(1);

      // Scaled scores: raw / sqrt(2)
      expect(result.scaledScores[0][0]).toBeCloseTo(1 / Math.sqrt(2));
      expect(result.scaledScores[0][1]).toBeCloseTo(0);

      // Softmax row sums must be 1.0
      for (const row of result.weights) {
        const sum = row.reduce((acc, val) => acc + val, 0);
        expect(sum).toBeCloseTo(1.0, 5);
      }

      // Context = weights * V
      // For row 0: weights[0][0] * [10, 20] + weights[0][1] * [30, 40]
      const expectedC0_0 = result.weights[0][0] * 10 + result.weights[0][1] * 30;
      const expectedC0_1 = result.weights[0][0] * 20 + result.weights[0][1] * 40;
      expect(result.context[0][0]).toBeCloseTo(expectedC0_0);
      expect(result.context[0][1]).toBeCloseTo(expectedC0_1);
    });

    it('zeroes upper-triangular weights under causal masking', () => {
      const Q = [
        [1, 1],
        [1, 1],
        [1, 1],
      ];
      const K = [
        [1, 1],
        [1, 1],
        [1, 1],
      ];
      const V = [
        [1, 0],
        [0, 1],
        [1, 1],
      ];
      const dK = 2;

      const result = calculateAttention(Q, K, V, dK, 'causal');

      // For token 0: can only attend to token 0
      expect(result.weights[0][0]).toBeCloseTo(1.0);
      expect(result.weights[0][1]).toBe(0);
      expect(result.weights[0][2]).toBe(0);

      // For token 1: can attend to tokens 0 and 1, but not 2
      expect(result.weights[1][0] + result.weights[1][1]).toBeCloseTo(1.0);
      expect(result.weights[1][2]).toBe(0);

      // For token 2: can attend to 0, 1, 2
      const sum2 = result.weights[2].reduce((a, b) => a + b, 0);
      expect(sum2).toBeCloseTo(1.0);
    });

    it('handles extreme values numerically without producing NaN or Infinity', () => {
      // Large scores that would overflow exp(1000) without max subtraction
      const Q = [[1000, 0]];
      const K = [
        [1000, 0],
        [0, 1000],
      ];
      const V = [
        [1, 2],
        [3, 4],
      ];
      const dK = 2;

      const result = calculateAttention(Q, K, V, dK, 'none');

      expect(Number.isFinite(result.weights[0][0])).toBe(true);
      expect(Number.isFinite(result.weights[0][1])).toBe(true);
      expect(result.weights[0][0]).toBeCloseTo(1.0);
      expect(result.weights[0][1]).toBeCloseTo(0.0);
      expect(result.context[0][0]).toBeCloseTo(1.0);
      expect(result.context[0][1]).toBeCloseTo(2.0);
    });

    it('records arithmetic traces for each cell expansion', () => {
      const Q = [[2, 3]];
      const K = [[4, 5]];
      const V = [[6, 7]];
      const dK = 2;

      const result = calculateAttention(Q, K, V, dK, 'none');

      expect(result.traces).toHaveLength(1);
      const trace = result.traces[0];
      expect(trace.qTokenIdx).toBe(0);
      expect(trace.kTokenIdx).toBe(0);
      expect(trace.rawDotProduct).toBe(2 * 4 + 3 * 5); // 23
      expect(trace.scaledScore).toBeCloseTo(23 / Math.sqrt(2));
      expect(trace.attentionWeight).toBeCloseTo(1.0);
      expect(trace.multiplications).toEqual([
        { qVal: 2, kVal: 4, prod: 8 },
        { qVal: 3, kVal: 5, prod: 15 },
      ]);
    });

    it('defensively handles empty inputs', () => {
      const result = calculateAttention([], [], [], 4, 'none');
      expect(result.rawScores).toEqual([]);
      expect(result.scaledScores).toEqual([]);
      expect(result.weights).toEqual([]);
      expect(result.context).toEqual([]);
      expect(result.traces).toEqual([]);
    });
  });

  describe('computeGQAHeadMapping', () => {
    it('computes Multi-Head Attention (MHA) 1:1 mapping when numHeads === numKvHeads', () => {
      const mapping = computeGQAHeadMapping(4, 4);
      expect(mapping.groupSize).toBe(1);
      expect(mapping.queryHeadToKvHead).toEqual([0, 1, 2, 3]);
      expect(mapping.headsPerKvHead).toEqual([[0], [1], [2], [3]]);
    });

    it('computes Grouped-Query Attention (GQA) mapping for 4 Q-heads and 2 KV-heads', () => {
      const mapping = computeGQAHeadMapping(4, 2);
      expect(mapping.groupSize).toBe(2);
      expect(mapping.queryHeadToKvHead).toEqual([0, 0, 1, 1]);
      expect(mapping.headsPerKvHead).toEqual([
        [0, 1],
        [2, 3],
      ]);
    });

    it('computes Multi-Query Attention (MQA) mapping for 4 Q-heads and 1 KV-head', () => {
      const mapping = computeGQAHeadMapping(4, 1);
      expect(mapping.groupSize).toBe(4);
      expect(mapping.queryHeadToKvHead).toEqual([0, 0, 0, 0]);
      expect(mapping.headsPerKvHead).toEqual([[0, 1, 2, 3]]);
    });

    it('throws an error if numHeads is not divisible by numKvHeads', () => {
      expect(() => computeGQAHeadMapping(5, 2)).toThrow(/divisible/i);
    });

    it('throws an error if numKvHeads > numHeads or values are non-positive', () => {
      expect(() => computeGQAHeadMapping(2, 4)).toThrow();
      expect(() => computeGQAHeadMapping(0, 1)).toThrow();
      expect(() => computeGQAHeadMapping(4, -1)).toThrow();
    });
  });

  describe('applyRoPE', () => {
    it('preserves Euclidean norm of rotated vectors', () => {
      const Q = [
        [1.0, 2.0, 3.0, 4.0],
        [0.5, -1.5, 2.5, -0.5],
      ];
      const K = [
        [2.0, -1.0, 0.0, 3.0],
        [-2.0, 1.0, 1.0, 2.0],
      ];

      const { Q_rot, K_rot } = applyRoPE(Q, K);

      expect(Q_rot).toHaveLength(2);
      expect(K_rot).toHaveLength(2);

      // Check norm preservation for all rows
      for (let i = 0; i < Q.length; i++) {
        const origNormQ = Math.hypot(...Q[i]);
        const rotNormQ = Math.hypot(...Q_rot[i]);
        expect(rotNormQ).toBeCloseTo(origNormQ, 5);

        const origNormK = Math.hypot(...K[i]);
        const rotNormK = Math.hypot(...K_rot[i]);
        expect(rotNormK).toBeCloseTo(origNormK, 5);
      }
    });

    it('leaves position 0 unchanged (rotation angle is 0)', () => {
      const Q = [[3.0, 4.0, 1.0, 2.0]];
      const K = [[5.0, 6.0, 7.0, 8.0]];

      const { Q_rot, K_rot } = applyRoPE(Q, K);

      expect(Q_rot[0][0]).toBeCloseTo(3.0);
      expect(Q_rot[0][1]).toBeCloseTo(4.0);
      expect(K_rot[0][0]).toBeCloseTo(5.0);
      expect(K_rot[0][1]).toBeCloseTo(6.0);
    });

    it('rotates position 1 coordinates according to base frequency', () => {
      const Q = [
        [1.0, 0.0],
        [1.0, 0.0],
      ];
      const K = [
        [1.0, 0.0],
        [1.0, 0.0],
      ];

      const { Q_rot } = applyRoPE(Q, K, 10000);

      // Position 0: cos(0) = 1, sin(0) = 0 -> [1.0, 0.0]
      expect(Q_rot[0][0]).toBeCloseTo(1.0);
      expect(Q_rot[0][1]).toBeCloseTo(0.0);

      // Position 1: theta_0 = 10000^(0) = 1.0
      // angle = 1 * 1.0 = 1.0 radian
      // x0' = 1*cos(1) - 0*sin(1) = cos(1)
      // x1' = 1*sin(1) + 0*cos(1) = sin(1)
      expect(Q_rot[1][0]).toBeCloseTo(Math.cos(1.0));
      expect(Q_rot[1][1]).toBeCloseTo(Math.sin(1.0));
    });

    it('defensively handles empty inputs', () => {
      const { Q_rot, K_rot } = applyRoPE([], []);
      expect(Q_rot).toEqual([]);
      expect(K_rot).toEqual([]);
    });
  });

  describe('applySinusoidalPositionalEncoding', () => {
    it('applies sinusoidal positional encoding X + P correctly', () => {
      const X = [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ];

      const Y = applySinusoidalPositionalEncoding(X, 10000);

      expect(Y).toHaveLength(2);
      expect(Y[0]).toHaveLength(4);

      // Pos 0:
      // k=0: sin(0) = 0
      // k=1: cos(0) = 1
      // k=2: sin(0) = 0
      // k=3: cos(0) = 1
      expect(Y[0][0]).toBeCloseTo(0);
      expect(Y[0][1]).toBeCloseTo(1);
      expect(Y[0][2]).toBeCloseTo(0);
      expect(Y[0][3]).toBeCloseTo(1);

      // Pos 1:
      // denom0 = 10000^(0/4) = 1
      // denom1 = 10000^(2/4) = 100
      expect(Y[1][0]).toBeCloseTo(Math.sin(1 / 1));
      expect(Y[1][1]).toBeCloseTo(Math.cos(1 / 1));
      expect(Y[1][2]).toBeCloseTo(Math.sin(1 / 100));
      expect(Y[1][3]).toBeCloseTo(Math.cos(1 / 100));
    });

    it('handles empty input gracefully', () => {
      expect(applySinusoidalPositionalEncoding([])).toEqual([]);
    });
  });

  describe('applyRMSNorm', () => {
    it('normalizes vector to unit RMS when gamma is all 1s', () => {
      const X = [
        [2, 2, 2, 2],
        [1, 3, 5, 7],
      ];

      const { output, scales } = applyRMSNorm(X);

      expect(output).toHaveLength(2);
      expect(scales).toBeDefined();
      expect(scales![0]).toBeCloseTo(2.0, 3);

      // RMS of [2, 2, 2, 2] is sqrt((4+4+4+4)/4) = 2.
      // Normalized output should be [1, 1, 1, 1]
      expect(output[0][0]).toBeCloseTo(1.0, 3);
      expect(output[0][1]).toBeCloseTo(1.0, 3);
      expect(output[0][2]).toBeCloseTo(1.0, 3);
      expect(output[0][3]).toBeCloseTo(1.0, 3);

      // Checking RMS of normalized output
      const rms1 = Math.sqrt(output[1].reduce((sum, v) => sum + v * v, 0) / output[1].length);
      expect(rms1).toBeCloseTo(1.0, 3);
    });

    it('applies gamma scaling parameter correctly', () => {
      const X = [[2, 2, 2, 2]];
      const gamma = [0.5, 1.0, 2.0, 3.0];

      const { output } = applyRMSNorm(X, gamma);

      expect(output[0][0]).toBeCloseTo(0.5, 3);
      expect(output[0][1]).toBeCloseTo(1.0, 3);
      expect(output[0][2]).toBeCloseTo(2.0, 3);
      expect(output[0][3]).toBeCloseTo(3.0, 3);
    });

    it('handles empty input defensively', () => {
      const result = applyRMSNorm([]);
      expect(result.output).toEqual([]);
      expect(result.scales).toEqual([]);
    });
  });

  describe('applyLayerNorm', () => {
    it('standardizes each token vector to zero mean and unit variance', () => {
      const X = [
        [1, 2, 3, 4, 5],
        [10, 20, 30, 40, 50],
      ];

      const { output } = applyLayerNorm(X);

      for (const row of output) {
        const mean = row.reduce((a, b) => a + b, 0) / row.length;
        const variance = row.reduce((a, b) => a + (b - mean) ** 2, 0) / row.length;
        expect(mean).toBeCloseTo(0.0, 5);
        expect(variance).toBeCloseTo(1.0, 3);
      }
    });

    it('applies affine parameters gamma and beta correctly', () => {
      const X = [[2, 4, 6]];
      const gamma = [2, 2, 2];
      const beta = [1, 1, 1];

      const { output } = applyLayerNorm(X, gamma, beta);

      const mean = output[0].reduce((a, b) => a + b, 0) / output[0].length;
      expect(mean).toBeCloseTo(1.0, 3); // beta is 1
    });

    it('handles empty input defensively', () => {
      const result = applyLayerNorm([]);
      expect(result.output).toEqual([]);
      expect(result.scales).toEqual([]);
    });
  });

  describe('computeFFN', () => {
    it('computes standard FFN with GELU activation and returns intermediateDim', () => {
      const X = [
        [1, -1],
        [0.5, 0.5],
      ];
      const dModel = 2;
      const dFfn = 8;

      const result = computeFFN(X, 'standard', dModel, dFfn);

      expect(result.intermediateDim).toBe(8);
      expect(result.Y).toHaveLength(2);
      expect(result.Y[0]).toHaveLength(2);
      expect(Number.isFinite(result.Y[0][0])).toBe(true);
      expect(Number.isFinite(result.Y[1][1])).toBe(true);
    });

    it('computes SwiGLU FFN with gated activation and returns intermediateDim', () => {
      const X = [
        [1, -1],
        [0.5, 0.5],
      ];
      const dModel = 2;
      const dFfn = 8;

      const result = computeFFN(X, 'swiglu', dModel, dFfn);

      expect(result.intermediateDim).toBe(8);
      expect(result.Y).toHaveLength(2);
      expect(result.Y[0]).toHaveLength(2);
      expect(Number.isFinite(result.Y[0][0])).toBe(true);
      expect(Number.isFinite(result.Y[1][1])).toBe(true);
    });

    it('handles empty inputs defensively', () => {
      const result = computeFFN([], 'standard', 4, 16);
      expect(result.Y).toEqual([]);
      expect(result.intermediateDim).toBe(16);
    });
  });

  describe('calculateTransformerParams', () => {
    const baseConfig: TransformerConfig = {
      dModel: 64,
      numHeads: 4,
      numKvHeads: 4,
      dHead: 16,
      dFfn: 256,
      normType: 'layernorm',
      normPosition: 'post',
      posEncoding: 'sinusoidal',
      ffnType: 'standard',
      maskType: 'none',
      hasBias: false,
    };

    it('calculates parameters correctly for Classical Vaswani architecture (MHA, LayerNorm, Standard FFN, no bias)', () => {
      const params = calculateTransformerParams(baseConfig, 6);

      // W_Q: 64 * (4 * 16) = 4096
      // W_K: 64 * (4 * 16) = 4096
      // W_V: 64 * (4 * 16) = 4096
      // qkvParams = 12,288
      expect(params.qkvParams).toBe(12288);

      // W_O: (4 * 16) * 64 = 4096
      expect(params.outProjParams).toBe(4096);
      expect(params.totalAttentionParams).toBe(16384);

      // FFN standard: W1 (64 * 256) + W2 (256 * 64) = 16384 + 16384 = 32,768
      expect(params.ffnParams).toBe(32768);

      // Norm: LayerNorm has gamma and beta (2 * 64) per norm layer, 2 norm layers per block = 4 * 64 = 256
      expect(params.normParams).toBe(256);

      // Layer total: 16384 + 32768 + 256 = 49,408
      expect(params.layerTotal).toBe(49408);

      // Model total: 49408 * 6 layers = 296,448
      expect(params.modelTotal).toBe(49408 * 6);
    });

    it('calculates parameters correctly for Modern LLaMA architecture (GQA, RMSNorm, SwiGLU, hasBias=false)', () => {
      const llamaConfig: TransformerConfig = {
        ...baseConfig,
        numKvHeads: 2, // GQA
        normType: 'rmsnorm',
        ffnType: 'swiglu',
      };

      const params = calculateTransformerParams(llamaConfig, 1);

      // W_Q: 64 * 64 = 4096
      // W_K: 64 * (2 * 16) = 2048
      // W_V: 64 * (2 * 16) = 2048
      // qkvParams = 4096 + 2048 + 2048 = 8,192
      expect(params.qkvParams).toBe(8192);
      expect(params.outProjParams).toBe(4096);
      expect(params.totalAttentionParams).toBe(12288);

      // SwiGLU: W_gate (64*256) + W_up (64*256) + W_down (256*64) = 49,152
      expect(params.ffnParams).toBe(49152);

      // RMSNorm: gamma only (1 * 64) per norm layer, 2 layers = 128
      expect(params.normParams).toBe(128);

      // Layer total: 12288 + 49152 + 128 = 61,568
      expect(params.layerTotal).toBe(61568);
      expect(params.modelTotal).toBe(61568);
    });

    it('accounts for linear biases when hasBias is true', () => {
      const configWithBias: TransformerConfig = {
        ...baseConfig,
        hasBias: true,
      };

      const params = calculateTransformerParams(configWithBias, 1);

      // Q bias: 64, K bias: 64, V bias: 64 -> +192
      expect(params.qkvParams).toBe(12288 + 192);
      // OutProj bias: +64
      expect(params.outProjParams).toBe(4096 + 64);
      // FFN bias: W1 bias (256) + W2 bias (64) = +320
      expect(params.ffnParams).toBe(32768 + 320);
    });
  });

  describe('calculateTransformerFlops', () => {
    const config: TransformerConfig = {
      dModel: 64,
      numHeads: 4,
      numKvHeads: 4,
      dHead: 16,
      dFfn: 256,
      normType: 'layernorm',
      normPosition: 'post',
      posEncoding: 'sinusoidal',
      ffnType: 'standard',
      maskType: 'none',
      hasBias: false,
    };

    it('computes layer FLOPs for standard architecture', () => {
      const seqLen = 10;
      const flops = calculateTransformerFlops(seqLen, config);

      // QKV: 2 * N * dModel * (dHead * (H_Q + 2 * H_KV))
      // 2 * 10 * 64 * (16 * (4 + 8)) = 20 * 64 * 192 = 245,760
      expect(flops.qkvFlops).toBe(245760);

      // Attn score: 2 * H_Q * N^2 * dHead = 2 * 4 * 100 * 16 = 12,800
      expect(flops.attentionMatrixFlops).toBe(12800);

      // Context: 2 * H_Q * N^2 * dHead = 12,800
      expect(flops.contextFlops).toBe(12800);

      // OutProj: 2 * N * (H_Q * dHead) * dModel = 2 * 10 * 64 * 64 = 81,920
      expect(flops.outProjFlops).toBe(81920);

      // Standard FFN: 2 * N * (2 * dModel * dFfn) = 2 * 10 * (2 * 64 * 256) = 655,360
      expect(flops.ffnFlops).toBe(655360);

      const expectedTotal =
        flops.qkvFlops +
        flops.attentionMatrixFlops +
        flops.contextFlops +
        flops.outProjFlops +
        flops.ffnFlops;
      expect(flops.totalLayerFlops).toBe(expectedTotal);
    });

    it('computes FLOPs with SwiGLU 3-matrix FFN', () => {
      const swigluConfig: TransformerConfig = {
        ...config,
        ffnType: 'swiglu',
      };
      const seqLen = 10;
      const flops = calculateTransformerFlops(seqLen, swigluConfig);

      // SwiGLU FFN: 2 * N * (3 * dModel * dFfn) = 2 * 10 * (3 * 64 * 256) = 983,040
      expect(flops.ffnFlops).toBe(983040);
    });
  });

  describe('calculateKVCacheMemory', () => {
    it('calculates KV cache memory and produces human-readable size', () => {
      // 2 * layers * seqLen * numKvHeads * headDim * precisionBytes
      // Example: 32 layers, seqLen 2048, 8 KV heads, headDim 128, fp16 (2 bytes)
      // totalBytes = 2 * 32 * 2048 * 8 * 128 * 2 = 268,435,456 bytes = 256 MB
      const result = calculateKVCacheMemory(2048, 8, 128, 32, 2);

      expect(result.bytesPerToken).toBe(2 * 32 * 8 * 128 * 2);
      expect(result.totalBytes).toBe(268435456);
      expect(result.formattedSize).toBe('256.00 MB');
    });

    it('formats smaller and larger cache sizes appropriately', () => {
      // Small: 512 bytes
      const small = calculateKVCacheMemory(1, 1, 16, 8, 2);
      // 2 * 8 * 1 * 1 * 16 * 2 = 512 B
      expect(small.formattedSize).toBe('512 B');

      // KB: 2048 B -> 2.00 KB
      const kb = calculateKVCacheMemory(4, 1, 16, 8, 2);
      expect(kb.formattedSize).toBe('2.00 KB');

      // GB:
      const gb = calculateKVCacheMemory(8192, 32, 128, 32, 2);
      // 2 * 32 * 8192 * 32 * 128 * 2 = 4,294,967,296 bytes = 4.00 GB
      expect(gb.formattedSize).toBe('4.00 GB');
    });
  });

  describe('generateTransformerPyTorchSnippet', () => {
    const config: TransformerConfig = {
      dModel: 64,
      numHeads: 4,
      numKvHeads: 2,
      dHead: 16,
      dFfn: 256,
      normType: 'rmsnorm',
      normPosition: 'pre',
      posEncoding: 'rope',
      ffnType: 'swiglu',
      maskType: 'causal',
      hasBias: false,
    };

    it('generates valid modern PyTorch code containing key architecture components', () => {
      const code = generateTransformerPyTorchSnippet(config);

      expect(code).toContain('import torch');
      expect(code).toContain('import torch.nn as nn');
      expect(code).toContain('import torch.nn.functional as F');
      expect(code).toContain('scaled_dot_product_attention');
      expect(code).toContain('RMSNorm');
      expect(code).toContain('repeat_interleave'); // GQA
      expect(code).toContain('apply_rotary_emb'); // RoPE
      expect(code).toContain('F.silu'); // SwiGLU
    });

    it('adapts snippet when configured for Classical Vaswani architecture', () => {
      const classicConfig: TransformerConfig = {
        dModel: 512,
        numHeads: 8,
        numKvHeads: 8,
        dHead: 64,
        dFfn: 2048,
        normType: 'layernorm',
        normPosition: 'post',
        posEncoding: 'sinusoidal',
        ffnType: 'standard',
        maskType: 'none',
        hasBias: true,
      };

      const code = generateTransformerPyTorchSnippet(classicConfig);

      expect(code).toContain('LayerNorm');
      expect(code).toContain('F.gelu');
      expect(code).not.toContain('repeat_interleave'); // MHA doesn't need KV repeating
    });
  });

  describe('mathematical invariants and boundary edge cases', () => {
    it('verifies RoPE relative distance inner product invariance: <R_m q, R_n k> == <R_{m+s} q, R_{n+s} k>', () => {
      // In RoPE, dot product of rotated vectors depends only on the relative token displacement (m - n).
      const q = [1.2, -0.8, 0.5, 2.1];
      const k = [0.7, 1.5, -1.1, 0.4];

      // Pair 1: m=2, n=1 (diff = 1)
      const Q1 = [[0, 0, 0, 0], [0, 0, 0, 0], [...q]]; // index 2 is q
      const K1 = [[0, 0, 0, 0], [...k], [0, 0, 0, 0]]; // index 1 is k
      const rot1 = applyRoPE(Q1, K1);
      const dot1 = rot1.Q_rot[2].reduce((sum, val, idx) => sum + val * rot1.K_rot[1][idx], 0);

      // Pair 2: m=4, n=3 (same relative diff = 1, shifted by s=2)
      const Q2 = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [...q]]; // index 4 is q
      const K2 = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [...k], [0, 0, 0, 0]]; // index 3 is k
      const rot2 = applyRoPE(Q2, K2);
      const dot2 = rot2.Q_rot[4].reduce((sum, val, idx) => sum + val * rot2.K_rot[3][idx], 0);

      expect(dot1).toBeCloseTo(dot2, 4);
    });

    it('handles odd dimensions in RoPE by preserving the trailing unpaired coordinate', () => {
      const Q = [[1.0, 2.0, 3.0]]; // d=3 (pair at [0,1], unpaired at [2])
      const K = [[4.0, 5.0, 6.0]];

      const { Q_rot, K_rot } = applyRoPE(Q, K);

      expect(Q_rot[0]).toHaveLength(3);
      expect(K_rot[0]).toHaveLength(3);
      expect(Q_rot[0][2]).toBe(3.0);
      expect(K_rot[0][2]).toBe(6.0);
    });

    it('computes 1x1 single-token attention correctly', () => {
      const Q = [[5.0]];
      const K = [[5.0]];
      const V = [[42.0]];

      const res = calculateAttention(Q, K, V, 1, 'none');

      expect(res.weights[0][0]).toBeCloseTo(1.0);
      expect(res.context[0][0]).toBeCloseTo(42.0);
    });

    it('computes symmetric raw and scaled scores when Q == K and maskType is none', () => {
      const X = [
        [1.0, 0.0],
        [0.0, 1.0],
        [1.0, 1.0],
      ];
      const res = calculateAttention(X, X, X, 2, 'none');

      // Symmetric property of dot-product Gram matrix: rawScores[i][j] == rawScores[j][i]
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(res.rawScores[i][j]).toBeCloseTo(res.rawScores[j][i], 5);
          expect(res.scaledScores[i][j]).toBeCloseTo(res.scaledScores[j][i], 5);
        }
      }
    });

    it('falls back gracefully to Q[0].length when dK is 0 or negative', () => {
      const Q = [[1, 2]];
      const K = [[1, 2]];
      const V = [[3, 4]];

      const res = calculateAttention(Q, K, V, 0, 'none');
      expect(res.weights[0][0]).toBeCloseTo(1.0);
      expect(res.context[0]).toEqual([3, 4]);
    });

    it('includes vocabulary embedding parameters when vocabSize > 0', () => {
      const config: TransformerConfig = {
        dModel: 128,
        numHeads: 4,
        numKvHeads: 4,
        dHead: 32,
        dFfn: 512,
        normType: 'rmsnorm',
        normPosition: 'pre',
        posEncoding: 'rope',
        ffnType: 'swiglu',
        maskType: 'causal',
        hasBias: false,
      };

      const withVocab = calculateTransformerParams(config, 2, 32000);
      const withoutVocab = calculateTransformerParams(config, 2, 0);

      // Embedding params: vocabSize * dModel = 32000 * 128 = 4,096,000
      expect(withVocab.modelTotal - withoutVocab.modelTotal).toBe(32000 * 128);
    });

    it('returns 0 FLOPs for sequence length 0', () => {
      const config: TransformerConfig = {
        dModel: 64,
        numHeads: 4,
        numKvHeads: 4,
        dHead: 16,
        dFfn: 256,
        normType: 'layernorm',
        normPosition: 'post',
        posEncoding: 'sinusoidal',
        ffnType: 'standard',
        maskType: 'none',
        hasBias: false,
      };

      const flops = calculateTransformerFlops(0, config);
      expect(flops.totalLayerFlops).toBe(0);
    });

    it('produces identical deterministic outputs for multiple computeFFN invocations', () => {
      const X = [
        [0.25, -0.75, 1.5, -0.1],
        [-1.2, 0.4, 0.9, -0.5],
      ];
      const run1 = computeFFN(X, 'swiglu', 4, 16);
      const run2 = computeFFN(X, 'swiglu', 4, 16);

      expect(run1.Y).toEqual(run2.Y);
    });

    it('correctly maps various GQA configurations', () => {
      // 8 Q-heads, 1 KV-head (MQA)
      const mqa = computeGQAHeadMapping(8, 1);
      expect(mqa.groupSize).toBe(8);
      expect(mqa.queryHeadToKvHead).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);

      // 8 Q-heads, 2 KV-heads (GQA)
      const gqa2 = computeGQAHeadMapping(8, 2);
      expect(gqa2.groupSize).toBe(4);
      expect(gqa2.queryHeadToKvHead).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);

      // 8 Q-heads, 4 KV-heads (GQA)
      const gqa4 = computeGQAHeadMapping(8, 4);
      expect(gqa4.groupSize).toBe(2);
      expect(gqa4.queryHeadToKvHead).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);

      // 8 Q-heads, 8 KV-heads (MHA)
      const mha = computeGQAHeadMapping(8, 8);
      expect(mha.groupSize).toBe(1);
      expect(mha.queryHeadToKvHead).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });
  });
});
