/**
 * Mathematical and structural utilities for Shorkie Receptive Field & Attention Studio.
 *
 * Provides exact layer specifications, receptive field calculations, coordinate transforms,
 * multi-head attention matrix decoders, rollout accumulation, and cross-architecture
 * simulation models (Transformers vs. Dilated ConvNets vs. State Space Models).
 */

export const SEQ_LEN = 16_384;
export const BOTTLENECK_LEN = 128;
export const BP_PER_BOTTLENECK_TOKEN = SEQ_LEN / BOTTLENECK_LEN; // 128 bp
export const N_ATTN_LAYERS = 8;
export const N_ATTN_HEADS = 4;
export const N_BINS = 896;
export const BIN_BP = 16;
export const CROP_BP = 1024;

export interface ShorkieLayerSpec {
  id: string;
  name: string;
  stage: 'stem' | 'conv_tower' | 'bottleneck_transformer' | 'unet_decoder' | 'output_head';
  layerIndex: number;
  resolution: number; // position count across 16384 bp
  bpPerUnit: number;  // SEQ_LEN / resolution
  channels: number;
  theoreticalRfBp: number;
  description: string;
  isGlobal: boolean;
}

export const SHORKIE_LAYERS: ShorkieLayerSpec[] = [
  {
    id: 'stem',
    name: 'Convolutional Stem',
    stage: 'stem',
    layerIndex: 0,
    resolution: 16_384,
    bpPerUnit: 1,
    channels: 96,
    theoreticalRfBp: 15,
    description: 'Conv1D (k=15, stride 1). Extracts elementary nucleotide patterns and core motif hexamers.',
    isGlobal: false,
  },
  {
    id: 'block1',
    name: 'Residual Block 1',
    stage: 'conv_tower',
    layerIndex: 1,
    resolution: 8_192,
    bpPerUnit: 2,
    channels: 128,
    theoreticalRfBp: 35,
    description: 'ResBlock with stride-2 pooling. Receptive field spans ~35 bp (short transcription factor binding cores).',
    isGlobal: false,
  },
  {
    id: 'block2',
    name: 'Residual Block 2',
    stage: 'conv_tower',
    layerIndex: 2,
    resolution: 4_096,
    bpPerUnit: 4,
    channels: 160,
    theoreticalRfBp: 75,
    description: 'ResBlock with stride-2 pooling. Receptive field spans ~75 bp (paired motif half-sites).',
    isGlobal: false,
  },
  {
    id: 'block3',
    name: 'Residual Block 3',
    stage: 'conv_tower',
    layerIndex: 3,
    resolution: 2_048,
    bpPerUnit: 8,
    channels: 192,
    theoreticalRfBp: 155,
    description: 'ResBlock with stride-2 pooling. Receptive field reaches ~155 bp (~mononucleosome scale).',
    isGlobal: false,
  },
  {
    id: 'block4',
    name: 'Residual Block 4',
    stage: 'conv_tower',
    layerIndex: 4,
    resolution: 1_024,
    bpPerUnit: 16,
    channels: 256,
    theoreticalRfBp: 315,
    description: 'ResBlock with stride-2 pooling. Receptive field reaches ~315 bp (di-nucleosome / promoter core).',
    isGlobal: false,
  },
  {
    id: 'block5',
    name: 'Residual Block 5',
    stage: 'conv_tower',
    layerIndex: 5,
    resolution: 512,
    bpPerUnit: 32,
    channels: 320,
    theoreticalRfBp: 635,
    description: 'ResBlock with stride-2 pooling. Receptive field reaches ~635 bp (proximal upstream activating sequence).',
    isGlobal: false,
  },
  {
    id: 'block6',
    name: 'Residual Block 6',
    stage: 'conv_tower',
    layerIndex: 6,
    resolution: 256,
    bpPerUnit: 64,
    channels: 384,
    theoreticalRfBp: 1_275,
    description: 'ResBlock with stride-2 pooling. Receptive field reaches ~1,275 bp (extended regulatory domain).',
    isGlobal: false,
  },
  {
    id: 'block7',
    name: 'Residual Block 7',
    stage: 'conv_tower',
    layerIndex: 7,
    resolution: 128,
    bpPerUnit: 128,
    channels: 384,
    theoreticalRfBp: 2_555,
    description: 'Final encoder ResBlock. Maximum purely convolutional reach is ~2,555 bp before bottleneck attention.',
    isGlobal: false,
  },
  // 8 Bottleneck Transformer Layers
  ...Array.from({ length: 8 }, (_, idx) => ({
    id: `transformer${idx + 1}`,
    name: `Transformer Layer ${idx + 1}`,
    stage: 'bottleneck_transformer' as const,
    layerIndex: 8 + idx,
    resolution: 128,
    bpPerUnit: 128,
    channels: 384,
    theoreticalRfBp: 16_384,
    description: `Multihead relative-position attention (4 heads, d=384). Receptive field leaps to 16,384 bp (100% global context).`,
    isGlobal: true,
  })),
  // U-Net Decoders
  {
    id: 'decoder1',
    name: 'U-Net Decoder 1',
    stage: 'unet_decoder',
    layerIndex: 16,
    resolution: 256,
    bpPerUnit: 64,
    channels: 192,
    theoreticalRfBp: 16_384,
    description: 'Nearest-neighbor 2x upsampling with skip connection from Residual Block 7.',
    isGlobal: true,
  },
  {
    id: 'decoder2',
    name: 'U-Net Decoder 2',
    stage: 'unet_decoder',
    layerIndex: 17,
    resolution: 512,
    bpPerUnit: 32,
    channels: 160,
    theoreticalRfBp: 16_384,
    description: 'Nearest-neighbor 2x upsampling with skip connection from Residual Block 6.',
    isGlobal: true,
  },
  {
    id: 'decoder3',
    name: 'U-Net Decoder 3',
    stage: 'unet_decoder',
    layerIndex: 18,
    resolution: 1_024,
    bpPerUnit: 16,
    channels: 128,
    theoreticalRfBp: 16_384,
    description: 'Nearest-neighbor 2x upsampling with skip connection from Residual Block 5, cropped by 64 bins on each edge.',
    isGlobal: true,
  },
  {
    id: 'head',
    name: 'Output Head',
    stage: 'output_head',
    layerIndex: 19,
    resolution: 896,
    bpPerUnit: 16,
    channels: 5_215,
    theoreticalRfBp: 16_384,
    description: 'Pointwise dense projection with softplus activation emitting 5,215 tracks over 896 bins (14,336 bp).',
    isGlobal: true,
  },
];

/**
 * Maps a genomic base pair coordinate (0 to 16383) to a bottleneck token index (0 to 127).
 */
export function bpToBottleneckToken(bp: number, seqLen = SEQ_LEN, nTokens = BOTTLENECK_LEN): number {
  const clamped = Math.max(0, Math.min(seqLen - 1, bp));
  return Math.floor((clamped / seqLen) * nTokens);
}

/**
 * Maps a bottleneck token index (0 to 127) back to the base pair span it represents.
 */
export function bottleneckTokenToBpSpan(
  token: number,
  seqLen = SEQ_LEN,
  nTokens = BOTTLENECK_LEN
): [number, number] {
  const bpPerToken = seqLen / nTokens;
  const clamped = Math.max(0, Math.min(nTokens - 1, token));
  const start = Math.floor(clamped * bpPerToken);
  const end = Math.min(seqLen, Math.floor((clamped + 1) * bpPerToken));
  return [start, end];
}

export interface ReceptiveFeasibility {
  distanceBp: number;
  isInReceptiveField: boolean;
  coverageFraction: number;
  statusMessage: string;
}

/**
 * Evaluates whether two positions on the genome can physically interact at a given model layer.
 */
export function checkReceptiveFeasibility(
  posA: number,
  posB: number,
  layer: ShorkieLayerSpec,
  seqLen = SEQ_LEN
): ReceptiveFeasibility {
  const distanceBp = Math.abs(posA - posB);
  if (layer.isGlobal) {
    return {
      distanceBp,
      isInReceptiveField: true,
      coverageFraction: 1.0,
      statusMessage: `Fully connected: Global self-attention enables direct communication across all ${seqLen.toLocaleString()} bp in one hop.`,
    };
  }

  const rf = layer.theoreticalRfBp;
  const isInRf = distanceBp <= rf;
  const frac = Math.min(1.0, rf / Math.max(1, distanceBp));

  let statusMessage = '';
  if (isInRf) {
    statusMessage = `Direct convolutional contact: distance (${distanceBp} bp) is within the layer's ${rf.toLocaleString()} bp receptive field.`;
  } else {
    statusMessage = `Disconnected: distance (${distanceBp.toLocaleString()} bp) exceeds the layer's ${rf.toLocaleString()} bp convolutional reach by ${(distanceBp - rf).toLocaleString()} bp.`;
  }

  return {
    distanceBp,
    isInReceptiveField: isInRf,
    coverageFraction: frac,
    statusMessage,
  };
}

/**
 * Attention rollout: computes the multi-layer composed attention graph (Abnar & Zuidema 2020).
 * Accumulates (0.5 * A_l + 0.5 * I) across all transformer layers.
 */
export function computeAttentionRollout(
  attention: ArrayLike<number>,
  size = BOTTLENECK_LEN,
  layers = N_ATTN_LAYERS
): Float64Array {
  const n = size;
  let acc = new Float64Array(n * n);
  for (let i = 0; i < n; i++) acc[i * n + i] = 1.0;

  const mixed = new Float64Array(n * n);
  const next = new Float64Array(n * n);

  for (let l = 0; l < layers; l++) {
    const base = l * n * n;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        const v = 0.5 * Number(attention[base + i * n + j]) + (i === j ? 0.5 : 0);
        mixed[i * n + j] = v;
        sum += v;
      }
      if (sum > 0) {
        for (let j = 0; j < n; j++) mixed[i * n + j] /= sum;
      }
    }

    next.fill(0);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        const a = mixed[i * n + k];
        if (a === 0) continue;
        for (let j = 0; j < n; j++) {
          next[i * n + j] += a * acc[k * n + j];
        }
      }
    }
    acc = next.slice();
  }
  return acc;
}

export interface AttentionConnection {
  sourceToken: number;
  targetToken: number;
  sourceBpSpan: [number, number];
  targetBpSpan: [number, number];
  weight: number;
  enrichmentRatio: number; // weight / (1 / size)
}

/**
 * Extracts top-K attention connections radiating to/from a target token.
 */
export function getTopAttentionConnections(
  attentionMatrix: Float64Array | Float32Array | number[],
  targetToken: number,
  topK = 8,
  nTokens = BOTTLENECK_LEN
): AttentionConnection[] {
  const connections: AttentionConnection[] = [];
  const baseline = 1.0 / nTokens; // uniform attention = ~0.0078125
  const rowBase = targetToken * nTokens;

  for (let col = 0; col < nTokens; col++) {
    const weight = Number(attentionMatrix[rowBase + col]);
    connections.push({
      targetToken,
      sourceToken: col,
      targetBpSpan: bottleneckTokenToBpSpan(targetToken, SEQ_LEN, nTokens),
      sourceBpSpan: bottleneckTokenToBpSpan(col, SEQ_LEN, nTokens),
      weight,
      enrichmentRatio: baseline > 0 ? weight / baseline : 1.0,
    });
  }

  connections.sort((a, b) => b.weight - a.weight);
  return connections.slice(0, topK);
}

export type ArchitectureParadigm = 'shorkie_hybrid' | 'dilated_convnet' | 'state_space_model';

export interface ArchitectureComparisonPoint {
  distanceBp: number;
  signalTransmission: number;
  memoryComplexity: string;
  effectiveHopCount: number;
  mechanisticDescription: string;
}

/**
 * Simulates signal transmission fidelity across distance for the three major genomic modeling paradigms.
 */
export function simulateSignalTransmission(
  distanceBp: number,
  paradigm: ArchitectureParadigm
): ArchitectureComparisonPoint {
  const d = Math.max(1, distanceBp);

  switch (paradigm) {
    case 'shorkie_hybrid': {
      // Local convolutions down to 128 bp tokens, then all-to-all global attention.
      // Signal maintains high fidelity across the entire 16 kb window via 1-hop cross-attention!
      const attnRetention = 0.65 + 0.35 * Math.exp(-d / 12000);
      const signal = Math.min(1.0, Math.max(0.55, attnRetention * (d < 2555 ? 0.95 : 0.82)));
      return {
        distanceBp: d,
        signalTransmission: Number(signal.toFixed(4)),
        memoryComplexity: 'O(L + T^2) [linear conv + 128^2 attention]',
        effectiveHopCount: 1,
        mechanisticDescription:
          'Local motifs compressed by 7 ResNet blocks into 128 bp tokens, then connected via 1-hop global attention. Zero distance cutoff.',
      };
    }
    case 'dilated_convnet': {
      // Pure dilated CNN (e.g. Basenji/BPNet): Dilation rates double (1, 2, 4, 8, ...).
      // Exponential receptive field, but signal decays sharply beyond the effective cone and suffers from grid holes.
      const effectiveCone = 4096;
      let signal = 0.0;
      if (d <= effectiveCone) {
        signal = Math.pow(1.0 - d / (effectiveCone * 1.3), 1.6);
      } else {
        signal = 0.08 * Math.exp(-(d - effectiveCone) / 2000);
      }
      return {
        distanceBp: d,
        signalTransmission: Number(Math.max(0.01, signal).toFixed(4)),
        memoryComplexity: 'O(L) [linear in sequence length]',
        effectiveHopCount: Math.ceil(Math.log2(Math.max(2, d / 15))),
        mechanisticDescription:
          'Fixed dilation pyramid. Signal must step through multiple dilated filter layers; distal enhancers (>4kb) face severe attenuation.',
      };
    }
    case 'state_space_model': {
      // State space model (e.g. Caduceus / HyenaDNA / Mamba):
      // Continuous recurrence h_t = A h_{t-1} + B x_t.
      // Sub-quadratic O(L) scaling, but memory decays as a power-law / exponential without attention re-indexing.
      const ssmDecay = Math.exp(-d / 7000) * 0.75 + 0.15 * Math.pow(100 / Math.max(100, d), 0.35);
      return {
        distanceBp: d,
        signalTransmission: Number(Math.max(0.12, Math.min(0.95, ssmDecay)).toFixed(4)),
        memoryComplexity: 'O(L) [linear scan or sub-quadratic FFT]',
        effectiveHopCount: 1,
        mechanisticDescription:
          'Continuous state space recurrence. Scales to million-base contexts with linear memory, but selective state capacity gradually fades over long distances.',
      };
    }
  }
}
