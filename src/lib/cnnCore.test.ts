import { describe, expect, it } from 'vitest';
import {
  calculateConvFlops,
  calculateConvOutputDim,
  calculateConvParams,
  calculateReceptiveField,
  convolve1D,
  convolve2D,
  generatePyTorchSnippet,
  getPresetKernels,
  getPresetMotifs,
  padMatrix,
} from './cnnCore';

describe('CNN Core: calculateConvOutputDim', () => {
  it('calculates standard output dimensions correctly with default stride and dilation', () => {
    // 32x32 input, 3x3 kernel, stride 1, padding 0, dilation 1 -> 30
    expect(calculateConvOutputDim(32, 3, 1, 0, 1)).toBe(30);
    // 28x28 input, 5x5 kernel, stride 1, padding 0, dilation 1 -> 24
    expect(calculateConvOutputDim(28, 5, 1, 0, 1)).toBe(24);
  });

  it('handles padding correctly (same padding)', () => {
    // 32x32 input, 3x3 kernel, stride 1, padding 1, dilation 1 -> 32
    expect(calculateConvOutputDim(32, 3, 1, 1, 1)).toBe(32);
    // 28x28 input, 5x5 kernel, stride 1, padding 2, dilation 1 -> 28
    expect(calculateConvOutputDim(28, 5, 1, 2, 1)).toBe(28);
  });

  it('handles strided convolutions (downsampling)', () => {
    // (32 - 3) / 2 + 1 = 15
    expect(calculateConvOutputDim(32, 3, 2, 0, 1)).toBe(15);
    // (32 + 2 - 3) / 2 + 1 = 16
    expect(calculateConvOutputDim(32, 3, 2, 1, 1)).toBe(16);
  });

  it('handles dilated convolutions (atrous convolution)', () => {
    // kernel 3 with dilation 2 -> effective kernel = 2 * (3 - 1) + 1 = 5
    // (32 - 5) / 1 + 1 = 28
    expect(calculateConvOutputDim(32, 3, 1, 0, 2)).toBe(28);
    // kernel 3 with dilation 3 -> effective kernel = 3 * (3 - 1) + 1 = 7
    // (32 - 7) / 1 + 1 = 26
    expect(calculateConvOutputDim(32, 3, 1, 0, 3)).toBe(26);
  });

  it('returns 0 when output dimension is non-positive or invalid', () => {
    // Kernel larger than input + 2*padding
    expect(calculateConvOutputDim(5, 7, 1, 0, 1)).toBe(0);
    // Non-positive inputs
    expect(calculateConvOutputDim(0, 3, 1, 0, 1)).toBe(0);
    expect(calculateConvOutputDim(-10, 3, 1, 0, 1)).toBe(0);
    expect(calculateConvOutputDim(32, 0, 1, 0, 1)).toBe(0);
    expect(calculateConvOutputDim(32, 3, 0, 0, 1)).toBe(0);
    expect(calculateConvOutputDim(32, 3, 1, -1, 1)).toBe(0);
    expect(calculateConvOutputDim(32, 3, 1, 0, 0)).toBe(0);
  });
});

describe('CNN Core: calculateConvParams', () => {
  it('computes standard Conv2d weights and biases (e.g. VGG layer 1)', () => {
    // inCh=3, outCh=64, kH=3, kW=3, groups=1, hasBias=true
    // weights = 64 * 3 * 3 * 3 = 1728
    // biases = 64
    // total = 1792
    const res = calculateConvParams(3, 64, 3, 3, 1, true);
    expect(res).toEqual({
      weights: 1728,
      biases: 64,
      total: 1792,
    });
  });

  it('omits biases when hasBias is false (recommended before BatchNorm2d)', () => {
    const res = calculateConvParams(3, 64, 3, 3, 1, false);
    expect(res).toEqual({
      weights: 1728,
      biases: 0,
      total: 1728,
    });
  });

  it('correctly calculates depthwise separable convolution parameters', () => {
    // Depthwise: inCh=32, outCh=32, kH=3, kW=3, groups=32, hasBias=false
    // weights = 32 * (32/32) * 3 * 3 = 288
    const dw = calculateConvParams(32, 32, 3, 3, 32, false);
    expect(dw).toEqual({
      weights: 288,
      biases: 0,
      total: 288,
    });

    // Pointwise 1x1: inCh=32, outCh=64, kH=1, kW=1, groups=1, hasBias=true
    // weights = 64 * 32 * 1 * 1 = 2048, biases = 64, total = 2112
    const pw = calculateConvParams(32, 64, 1, 1, 1, true);
    expect(pw).toEqual({
      weights: 2048,
      biases: 64,
      total: 2112,
    });
  });

  it('handles invalid or zero channel counts gracefully', () => {
    expect(calculateConvParams(0, 64, 3, 3)).toEqual({ weights: 0, biases: 0, total: 0 });
    expect(calculateConvParams(3, 0, 3, 3)).toEqual({ weights: 0, biases: 0, total: 0 });
    expect(calculateConvParams(3, 64, 0, 3)).toEqual({ weights: 0, biases: 0, total: 0 });
  });
});

describe('CNN Core: calculateConvFlops', () => {
  it('computes MACs and FLOPs for standard Conv2d layer', () => {
    // 32x32 input, inCh=3, outCh=64, k=3x3, stride=1, padding=1 (out is 32x32)
    // macs = 32 * 32 * 64 * (3 * 3 * 3) = 1024 * 64 * 27 = 1,769,472
    // flops = 2 * macs = 3,538,944
    const res = calculateConvFlops(32, 32, 3, 64, 3, 3, 1, 1, 1, 1, 1, 1, 1);
    expect(res).toEqual({
      outH: 32,
      outW: 32,
      macs: 1769472,
      flops: 3538944,
    });
  });

  it('computes MACs and FLOPs for grouped/depthwise conv', () => {
    // 16x16 input, inCh=32, outCh=32, k=3x3, stride=1, padding=1, groups=32
    // out is 16x16
    // macs = 16 * 16 * 32 * ((32/32) * 3 * 3) = 256 * 32 * 9 = 73,728
    // flops = 147,456
    const res = calculateConvFlops(16, 16, 32, 32, 3, 3, 1, 1, 1, 1, 1, 1, 32);
    expect(res).toEqual({
      outH: 16,
      outW: 16,
      macs: 73728,
      flops: 147456,
    });
  });

  it('returns zeros if layer dimensions are invalid or output is zero', () => {
    const res = calculateConvFlops(5, 5, 3, 64, 7, 7);
    expect(res).toEqual({
      outH: 0,
      outW: 0,
      macs: 0,
      flops: 0,
    });
  });
});

describe('CNN Core: calculateReceptiveField', () => {
  it('demonstrates VGG receptive field expansion with stacked 3x3 convolutions', () => {
    const layers = [
      { kernel: 3, stride: 1 },
      { kernel: 3, stride: 1 },
      { kernel: 3, stride: 1 },
    ];
    const rf = calculateReceptiveField(layers);

    expect(rf).toHaveLength(3);
    // Layer 1: RF = 1 + (3 - 1)*1 = 3, Jump = 1
    expect(rf[0]).toEqual({
      layerIndex: 1,
      kernel: 3,
      stride: 1,
      dilation: 1,
      jump: 1,
      receptiveField: 3,
    });
    // Layer 2: RF = 3 + (3 - 1)*1 = 5, Jump = 1
    expect(rf[1]).toEqual({
      layerIndex: 2,
      kernel: 3,
      stride: 1,
      dilation: 1,
      jump: 1,
      receptiveField: 5,
    });
    // Layer 3: RF = 5 + (3 - 1)*1 = 7, Jump = 1
    expect(rf[2]).toEqual({
      layerIndex: 3,
      kernel: 3,
      stride: 1,
      dilation: 1,
      jump: 1,
      receptiveField: 7,
    });
  });

  it('accounts for strided downsampling (jump accumulation)', () => {
    const layers = [
      { kernel: 3, stride: 2 },
      { kernel: 3, stride: 1 },
    ];
    const rf = calculateReceptiveField(layers);

    // Layer 1: RF = 3, Jump = 2
    expect(rf[0].receptiveField).toBe(3);
    expect(rf[0].jump).toBe(2);

    // Layer 2: RF = 3 + (3 - 1) * 2 = 7, Jump = 2 * 1 = 2
    expect(rf[1].receptiveField).toBe(7);
    expect(rf[1].jump).toBe(2);
  });

  it('accounts for dilated convolutions (atrous receptive field growth)', () => {
    const layers = [
      { kernel: 3, stride: 1, dilation: 1 },
      { kernel: 3, stride: 1, dilation: 2 },
      { kernel: 3, stride: 1, dilation: 4 },
    ];
    const rf = calculateReceptiveField(layers);

    // Layer 1: RF = 3, Jump = 1
    expect(rf[0].receptiveField).toBe(3);
    // Layer 2: effective kernel = 2*(2)+1 = 5 -> RF = 3 + (5-1)*1 = 7
    expect(rf[1].receptiveField).toBe(7);
    // Layer 3: effective kernel = 4*(2)+1 = 9 -> RF = 7 + (9-1)*1 = 15
    expect(rf[2].receptiveField).toBe(15);
  });

  it('returns empty array when no layers provided', () => {
    expect(calculateReceptiveField([])).toEqual([]);
  });
});

describe('CNN Core: padMatrix', () => {
  it('pads a 2D matrix with surrounding zeros', () => {
    const input = [
      [1, 2],
      [3, 4],
    ];
    const padded = padMatrix(input, 1);
    expect(padded).toEqual([
      [0, 0, 0, 0],
      [0, 1, 2, 0],
      [0, 3, 4, 0],
      [0, 0, 0, 0],
    ]);
  });

  it('returns identical copy if padding is 0', () => {
    const input = [
      [1, 2],
      [3, 4],
    ];
    expect(padMatrix(input, 0)).toEqual(input);
  });
});

describe('CNN Core: convolve2D', () => {
  it('executes a 2D convolution and records arithmetic steps', () => {
    const input = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    const kernel = [
      [1, 0],
      [0, 1],
    ];
    const { output, steps } = convolve2D(input, kernel, 1, 0, 1, 0);

    // outDim = (3 - 2)/1 + 1 = 2
    expect(output).toEqual([
      [6, 8],
      [12, 14],
    ]);
    expect(steps).toHaveLength(4);

    // Verify step 0 at (0, 0)
    const step0 = steps[0];
    expect(step0.outR).toBe(0);
    expect(step0.outC).toBe(0);
    expect(step0.sum).toBe(6);
    expect(step0.finalVal).toBe(6);
    expect(step0.multiplications).toEqual([
      { inVal: 1, kVal: 1, prod: 1 },
      { inVal: 2, kVal: 0, prod: 0 },
      { inVal: 4, kVal: 0, prod: 0 },
      { inVal: 5, kVal: 1, prod: 5 },
    ]);
  });

  it('applies bias correctly', () => {
    const input = [
      [1, 2],
      [3, 4],
    ];
    const kernel = [[2]];
    const { output, steps } = convolve2D(input, kernel, 1, 0, 1, 5);

    expect(output).toEqual([
      [7, 9],
      [11, 13],
    ]);
    expect(steps[0].finalVal).toBe(7);
  });

  it('supports padding, stride, and dilation in 2D convolution', () => {
    const input = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    // 2x2 kernel with dilation 2 covers a 3x3 effective patch
    const kernel = [
      [1, 1],
      [1, 1],
    ];
    const { output } = convolve2D(input, kernel, 1, 0, 2, 0);
    // (0,0) with dilation 2 samples:
    // (0,0)=1, (0,2)=3, (2,0)=7, (2,2)=9 -> sum = 20
    expect(output).toEqual([[20]]);
  });

  it('handles empty input gracefully', () => {
    expect(convolve2D([], [[1]])).toEqual({ output: [], steps: [] });
    expect(convolve2D([[1]], [])).toEqual({ output: [], steps: [] });
  });
});

describe('CNN Core: convolve1D & Motif Scanning', () => {
  it('scans a DNA sequence with a PWM filter to detect motifs', () => {
    // TATA box PWM (length 6: T-A-T-A-A-A)
    const tataPwm: Record<string, number[]> = {
      A: [0, 1, 0, 1, 1, 1],
      C: [0, 0, 0, 0, 0, 0],
      G: [0, 0, 0, 0, 0, 0],
      T: [1, 0, 1, 0, 0, 0],
    };
    const seq = 'GGCTATAAACCA';
    // Position 0: GGCTAT -> 0+0+0+0+1+0 = 1
    // Position 1: GCTATA -> 0+0+1+1+0+1 = 3
    // Position 2: CTATAA -> 0+1+0+1+1+1 = 4
    // Position 3: TATAAA -> 1+1+1+1+1+1 = 6 (perfect match!)
    // Sequence length = 12, motif length = 6 -> 7 windows (indices 0..6)
    const { scores, matches } = convolve1D(seq, tataPwm, 1);

    expect(scores).toHaveLength(7);
    expect(scores[3]).toBe(6);
    expect(matches).toContain(3);
  });

  it('filters matches with custom threshold', () => {
    const tataPwm: Record<string, number[]> = {
      A: [0, 1, 0, 1, 1, 1],
      C: [0, 0, 0, 0, 0, 0],
      G: [0, 0, 0, 0, 0, 0],
      T: [1, 0, 1, 0, 0, 0],
    };
    const seq = 'GGCTATAAACCA';
    const { matches } = convolve1D(seq, tataPwm, 1, 6.0); // only exact match
    expect(matches).toEqual([3]);
  });

  it('handles unknown characters (e.g. N) without throwing', () => {
    const pwm: Record<string, number[]> = {
      A: [1, 1],
      C: [0, 0],
      G: [0, 0],
      T: [0, 0],
    };
    const { scores } = convolve1D('ANN', pwm);
    expect(scores).toEqual([1, 0]);
  });
});

describe('CNN Core: getPresetKernels & getPresetMotifs', () => {
  it('returns all required standard preset kernels with 3x3 dimensions', () => {
    const presets = getPresetKernels();
    const expectedKeys = [
      'sobelHorizontal',
      'sobelVertical',
      'laplacian',
      'sharpen',
      'gaussianBlur',
      'identity',
    ];

    for (const key of expectedKeys) {
      expect(presets).toHaveProperty(key);
      const preset = presets[key];
      expect(preset.name).toBeTypeOf('string');
      expect(preset.description).toBeTypeOf('string');
      expect(preset.kernel).toHaveLength(3);
      expect(preset.kernel[0]).toHaveLength(3);
    }
  });

  it('returns preset biological motifs', () => {
    const motifs = getPresetMotifs();
    expect(motifs).toHaveProperty('tataBox');
    expect(motifs).toHaveProperty('eBox');
    expect(motifs.tataBox.consensus).toBe('TATAAA');
    expect(motifs.eBox.consensus).toBe('CACGTG');
  });
});

describe('CNN Core: generatePyTorchSnippet', () => {
  it('generates valid modern PyTorch Conv2d snippet with full arguments', () => {
    const snippet = generatePyTorchSnippet({
      inChannels: 3,
      outChannels: 64,
      kernelSize: 3,
      stride: 1,
      padding: 1,
      dilation: 1,
      groups: 1,
      bias: false,
    });

    expect(snippet).toContain('import torch');
    expect(snippet).toContain('import torch.nn as nn');
    expect(snippet).toContain('conv = nn.Conv2d(');
    expect(snippet).toContain('in_channels=3');
    expect(snippet).toContain('out_channels=64');
    expect(snippet).toContain('kernel_size=(3, 3)');
    expect(snippet).toContain('stride=(1, 1)');
    expect(snippet).toContain('padding=(1, 1)');
    expect(snippet).toContain('dilation=(1, 1)');
    expect(snippet).toContain('groups=1');
    expect(snippet).toContain('bias=False  # Recommended before BatchNorm2d!');
  });

  it('handles tuple shapes, string padding, and bias=True', () => {
    const snippet = generatePyTorchSnippet({
      inChannels: 32,
      outChannels: 32,
      kernelSize: [5, 3],
      stride: [2, 1],
      padding: 'same',
      dilation: [2, 2],
      groups: 32,
      bias: true,
    });

    expect(snippet).toContain('in_channels=32');
    expect(snippet).toContain('out_channels=32');
    expect(snippet).toContain('kernel_size=(5, 3)');
    expect(snippet).toContain('stride=(2, 1)');
    expect(snippet).toContain("padding='same'");
    expect(snippet).toContain('dilation=(2, 2)');
    expect(snippet).toContain('groups=32');
    expect(snippet).toContain('bias=True');
  });
});
