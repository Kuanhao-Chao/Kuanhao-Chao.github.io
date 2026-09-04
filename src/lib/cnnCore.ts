/**
 * CNN Mathematical Engine & Domain Models
 *
 * Provides exact spatial dimension arithmetic, multi-channel parameter counting,
 * FLOPs/MACs computations, recursive receptive field derivations, and 2D/1D convolution
 * operations with step-by-step arithmetic tracing for interactive neural network studios.
 */

export interface Conv2DConfig {
  inChannels: number;
  outChannels: number;
  kernelSize: number | [number, number];
  stride?: number | [number, number];
  padding?: number | [number, number] | 'valid' | 'same';
  dilation?: number | [number, number];
  groups?: number;
  bias?: boolean;
}

export interface ConvParamsResult {
  weights: number;
  biases: number;
  total: number;
}

export interface ConvFlopsResult {
  outH: number;
  outW: number;
  macs: number;
  flops: number;
}

export interface ReceptiveFieldLayer {
  kernel: number;
  stride: number;
  dilation?: number;
}

export interface ReceptiveFieldStep {
  layerIndex: number;
  kernel: number;
  stride: number;
  dilation: number;
  jump: number;
  receptiveField: number;
}

export interface Convolve2DMultiplication {
  inVal: number;
  kVal: number;
  prod: number;
}

export interface Convolve2DStep {
  outR: number;
  outC: number;
  inWindow: Array<{ r: number; c: number }>;
  multiplications: Convolve2DMultiplication[];
  sum: number;
  finalVal: number;
}

export interface Convolve2DResult {
  output: number[][];
  steps: Convolve2DStep[];
}

export interface Convolve1DResult {
  scores: number[];
  matches: number[];
}

export interface PresetKernel {
  name: string;
  description: string;
  kernel: number[][];
  bias?: number;
}

export interface PresetMotif {
  name: string;
  description: string;
  consensus: string;
  pwm: Record<string, number[]>;
}

/**
 * Calculates spatial output dimension for a 1D/2D convolution dimension.
 * Formula: Math.floor((inDim + 2 * padding - dilation * (kernel - 1) - 1) / stride) + 1
 * If computed dim <= 0, returns 0.
 */
export function calculateConvOutputDim(
  inDim: number,
  kernel: number,
  stride: number = 1,
  padding: number = 0,
  dilation: number = 1
): number {
  if (inDim <= 0 || kernel <= 0 || stride <= 0 || padding < 0 || dilation <= 0) {
    return 0;
  }
  const effectiveKernel = dilation * (kernel - 1) + 1;
  const num = inDim + 2 * padding - effectiveKernel;
  if (num < 0) {
    return 0;
  }
  const dim = Math.floor(num / stride) + 1;
  return dim > 0 ? dim : 0;
}

/**
 * Computes learnable parameters for a Conv2D layer.
 * weights = outCh * (inCh / groups) * kH * kW
 * biases = hasBias ? outCh : 0
 * total = weights + biases
 */
export function calculateConvParams(
  inCh: number,
  outCh: number,
  kH: number,
  kW: number,
  groups: number = 1,
  hasBias: boolean = true
): ConvParamsResult {
  if (inCh <= 0 || outCh <= 0 || kH <= 0 || kW <= 0 || groups <= 0) {
    return { weights: 0, biases: 0, total: 0 };
  }
  const weights = Math.round(outCh * (inCh / groups) * kH * kW);
  const biases = hasBias ? outCh : 0;
  const total = weights + biases;
  return { weights, biases, total };
}

/**
 * Calculates Multiply-Accumulate operations (MACs) and Floating Point Operations (FLOPs).
 * macs = outH * outW * outCh * (inCh / groups * kH * kW)
 * flops = 2 * macs (one multiply + one add per MAC)
 */
export function calculateConvFlops(
  inH: number,
  inW: number,
  inCh: number,
  outCh: number,
  kH: number,
  kW: number,
  strideH: number = 1,
  strideW: number = 1,
  paddingH: number = 0,
  paddingW: number = 0,
  dilationH: number = 1,
  dilationW: number = 1,
  groups: number = 1
): ConvFlopsResult {
  const outH = calculateConvOutputDim(inH, kH, strideH, paddingH, dilationH);
  const outW = calculateConvOutputDim(inW, kW, strideW, paddingW, dilationW);

  if (outH <= 0 || outW <= 0 || inCh <= 0 || outCh <= 0 || groups <= 0) {
    return { outH: 0, outW: 0, macs: 0, flops: 0 };
  }

  const macsPerOutputPixel = (inCh / groups) * kH * kW;
  const macs = Math.round(outH * outW * outCh * macsPerOutputPixel);
  const flops = 2 * macs;

  return { outH, outW, macs, flops };
}

/**
 * Recursively derives effective receptive field (RF) and feature jump across stacked layers.
 * RF_0 = 1, J_0 = 1
 * RF_l = RF_{l-1} + (D_l * (K_l - 1)) * J_{l-1}
 * J_l = J_{l-1} * S_l
 */
export function calculateReceptiveField(layers: ReceptiveFieldLayer[]): ReceptiveFieldStep[] {
  if (!layers || layers.length === 0) {
    return [];
  }

  let currentJump = 1;
  let currentRF = 1;
  const steps: ReceptiveFieldStep[] = [];

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const dilation = layer.dilation ?? 1;
    const effectiveKernel = dilation * (layer.kernel - 1) + 1;
    const receptiveField = currentRF + (effectiveKernel - 1) * currentJump;
    const jump = currentJump * layer.stride;

    steps.push({
      layerIndex: i + 1,
      kernel: layer.kernel,
      stride: layer.stride,
      dilation,
      jump,
      receptiveField,
    });

    currentRF = receptiveField;
    currentJump = jump;
  }

  return steps;
}

/**
 * Utility to pad a 2D matrix with surrounding zeros.
 */
export function padMatrix(input: number[][], padding: number): number[][] {
  if (padding <= 0) {
    return input.map((row) => [...row]);
  }
  const H = input.length;
  const W = input[0]?.length ?? 0;
  if (H === 0 || W === 0) {
    return [];
  }

  const paddedH = H + 2 * padding;
  const paddedW = W + 2 * padding;
  const out: number[][] = Array.from({ length: paddedH }, () => new Array(paddedW).fill(0));

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      out[r + padding][c + padding] = input[r][c];
    }
  }

  return out;
}

/**
 * Executes a 2D convolution with complete step-by-step arithmetic inspection trace.
 */
export function convolve2D(
  input: number[][],
  kernel: number[][],
  stride: number = 1,
  padding: number = 0,
  dilation: number = 1,
  bias: number = 0
): Convolve2DResult {
  const H = input.length;
  const W = input[0]?.length ?? 0;
  const kH = kernel.length;
  const kW = kernel[0]?.length ?? 0;

  if (H === 0 || W === 0 || kH === 0 || kW === 0 || stride <= 0 || dilation <= 0) {
    return { output: [], steps: [] };
  }

  const outH = calculateConvOutputDim(H, kH, stride, padding, dilation);
  const outW = calculateConvOutputDim(W, kW, stride, padding, dilation);

  if (outH <= 0 || outW <= 0) {
    return { output: [], steps: [] };
  }

  const output: number[][] = Array.from({ length: outH }, () => new Array(outW).fill(0));
  const steps: Convolve2DStep[] = [];

  for (let outR = 0; outR < outH; outR++) {
    for (let outC = 0; outC < outW; outC++) {
      const inWindow: Array<{ r: number; c: number }> = [];
      const multiplications: Convolve2DMultiplication[] = [];
      let sum = 0;

      for (let kr = 0; kr < kH; kr++) {
        for (let kc = 0; kc < kW; kc++) {
          const pr = outR * stride + kr * dilation;
          const pc = outC * stride + kc * dilation;
          const inVal =
            pr >= padding && pr < padding + H && pc >= padding && pc < padding + W
              ? input[pr - padding][pc - padding]
              : 0;
          const kVal = kernel[kr][kc];
          const prod = inVal * kVal;

          inWindow.push({ r: pr, c: pc });
          multiplications.push({ inVal, kVal, prod });
          sum += prod;
        }
      }

      const finalVal = sum + bias;
      output[outR][outC] = finalVal;
      steps.push({
        outR,
        outC,
        inWindow,
        multiplications,
        sum,
        finalVal,
      });
    }
  }

  return { output, steps };
}

/**
 * 1D sequence scanning with Position Weight Matrix (PWM).
 * Scores each window along the sequence and identifies high-affinity matches.
 */
export function convolve1D(
  sequence: string,
  pwm: Record<string, number[]>,
  stride: number = 1,
  threshold?: number
): Convolve1DResult {
  if (!sequence || !pwm || stride <= 0) {
    return { scores: [], matches: [] };
  }

  const keys = Object.keys(pwm);
  if (keys.length === 0) {
    return { scores: [], matches: [] };
  }

  const k = pwm[keys[0]]?.length ?? 0;
  if (k === 0 || sequence.length < k) {
    return { scores: [], matches: [] };
  }

  // Calculate theoretical score bounds
  let maxPossible = 0;
  let minPossible = 0;
  for (let j = 0; j < k; j++) {
    let colMax = -Infinity;
    let colMin = Infinity;
    for (const c of keys) {
      const v = pwm[c][j] ?? 0;
      if (v > colMax) colMax = v;
      if (v < colMin) colMin = v;
    }
    if (colMax !== -Infinity) maxPossible += colMax;
    if (colMin !== Infinity) minPossible += colMin;
  }

  const range = maxPossible - minPossible;
  const cutoff =
    threshold !== undefined ? threshold : range > 0 ? minPossible + 0.8 * range : maxPossible;

  const scores: number[] = [];
  const matches: number[] = [];
  const nSteps = Math.floor((sequence.length - k) / stride) + 1;

  for (let i = 0; i < nSteps; i++) {
    const startPos = i * stride;
    let score = 0;

    for (let j = 0; j < k; j++) {
      const char = sequence[startPos + j]?.toUpperCase() ?? '';
      const weight = pwm[char] && pwm[char][j] !== undefined ? pwm[char][j] : 0;
      score += weight;
    }

    scores.push(score);
    if (score >= cutoff - 1e-6) {
      matches.push(startPos);
    }
  }

  return { scores, matches };
}

/**
 * Standard computer vision preset kernels for the interactive visualizer.
 */
export function getPresetKernels(): Record<string, PresetKernel> {
  return {
    sobelHorizontal: {
      name: 'Sobel Horizontal',
      description: 'Detects horizontal edges and vertical intensity gradients',
      kernel: [
        [-1, -2, -1],
        [0, 0, 0],
        [1, 2, 1],
      ],
      bias: 0,
    },
    sobelVertical: {
      name: 'Sobel Vertical',
      description: 'Detects vertical edges and horizontal intensity gradients',
      kernel: [
        [-1, 0, 1],
        [-2, 0, 2],
        [-1, 0, 1],
      ],
      bias: 0,
    },
    laplacian: {
      name: 'Laplacian Edge Detector',
      description: 'Second-order isotropic derivative detecting edges in all directions',
      kernel: [
        [0, 1, 0],
        [1, -4, 1],
        [0, 1, 0],
      ],
      bias: 0,
    },
    sharpen: {
      name: 'Sharpen',
      description: 'Enhances high-frequency spatial details and edge contrast',
      kernel: [
        [0, -1, 0],
        [-1, 5, -1],
        [0, -1, 0],
      ],
      bias: 0,
    },
    gaussianBlur: {
      name: 'Gaussian / Box Blur',
      description: 'Low-pass spatial filter for smoothing and noise reduction',
      kernel: [
        [1 / 9, 1 / 9, 1 / 9],
        [1 / 9, 1 / 9, 1 / 9],
        [1 / 9, 1 / 9, 1 / 9],
      ],
      bias: 0,
    },
    identity: {
      name: 'Identity',
      description: 'Passes input through unchanged without spatial filtering',
      kernel: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ],
      bias: 0,
    },
  };
}

/**
 * Preset biological motifs for the 1D sequence convolution scanner.
 */
export function getPresetMotifs(): Record<string, PresetMotif> {
  return {
    tataBox: {
      name: 'TATA Box',
      description: 'Core promoter element located ~25-30 bp upstream of transcription start site',
      consensus: 'TATAAA',
      pwm: {
        A: [0, 1, 0, 1, 1, 1],
        C: [0, 0, 0, 0, 0, 0],
        G: [0, 0, 0, 0, 0, 0],
        T: [1, 0, 1, 0, 0, 0],
      },
    },
    eBox: {
      name: 'E-Box (CANNTG)',
      description: 'Enhancer box recognized by basic helix-loop-helix (bHLH) transcription factors',
      consensus: 'CACGTG',
      pwm: {
        A: [0, 1, 0, 0, 0, 0],
        C: [1, 0, 1, 0, 0, 0],
        G: [0, 0, 0, 1, 0, 1],
        T: [0, 0, 0, 0, 1, 0],
      },
    },
  };
}

/**
 * Formats a single number or pair into a Python tuple string: (H, W).
 */
function formatPair(val: number | [number, number]): string {
  if (Array.isArray(val)) {
    return `(${val[0]}, ${val[1]})`;
  }
  return `(${val}, ${val})`;
}

/**
 * Formats padding parameter for PyTorch Conv2d.
 */
function formatPadding(pad?: number | [number, number] | 'valid' | 'same'): string {
  if (pad === 'valid' || pad === 'same') {
    return `'${pad}'`;
  }
  if (pad === undefined) {
    return `(0, 0)`;
  }
  return formatPair(pad);
}

/**
 * Generates an idiomatic, modern PyTorch nn.Conv2d code snippet with live hyperparameter values.
 */
export function generatePyTorchSnippet(config: Conv2DConfig): string {
  const stride = config.stride ?? 1;
  const padding = config.padding ?? 0;
  const dilation = config.dilation ?? 1;
  const groups = config.groups ?? 1;
  const biasStr = config.bias === false ? 'False  # Recommended before BatchNorm2d!' : 'True';

  return `import torch
import torch.nn as nn

conv = nn.Conv2d(
    in_channels=${config.inChannels},
    out_channels=${config.outChannels},
    kernel_size=${formatPair(config.kernelSize)},
    stride=${formatPair(stride)},
    padding=${formatPadding(padding)},
    dilation=${formatPair(dilation)},
    groups=${groups},
    bias=${biasStr}
)`;
}
