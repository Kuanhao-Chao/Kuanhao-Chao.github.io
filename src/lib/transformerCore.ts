/**
 * Transformer Layer Interactive Studio: Mathematical Domain Engine
 *
 * Pure TypeScript, zero-DOM mathematical domain engine modeling single-layer
 * Transformer mechanics: scaled dot-product attention with arithmetic traces,
 * Grouped-Query Attention (GQA) mapping, Rotary Position Embeddings (RoPE),
 * sinusoidal positional encodings, RMSNorm / LayerNorm, standard MLP / SwiGLU FFN,
 * parameter counts, FLOPs, KV cache footprint, and modern PyTorch code generation.
 */

export interface TransformerConfig {
  dModel: number; // e.g. 64 for interactive demo, 4096 for LLaMA
  numHeads: number; // e.g. 4
  numKvHeads: number; // e.g. 1 (MQA), 2 (GQA), or 4 (MHA)
  dHead: number; // dModel / numHeads
  dFfn: number; // e.g. 4 * dModel or Math.floor(8/3 * dModel)
  normType: 'rmsnorm' | 'layernorm';
  normPosition: 'pre' | 'post';
  posEncoding: 'rope' | 'sinusoidal' | 'none';
  ffnType: 'standard' | 'swiglu';
  maskType: 'none' | 'causal';
  hasBias: boolean;
}

export interface AttentionStepTrace {
  qTokenIdx: number;
  kTokenIdx: number;
  rawDotProduct: number;
  scaledScore: number;
  multiplications: Array<{ qVal: number; kVal: number; prod: number }>;
  attentionWeight: number;
}

export interface AttentionResult {
  rawScores: number[][]; // Q * K^T
  scaledScores: number[][]; // (Q * K^T) / sqrt(dK)
  weights: number[][]; // softmax(scaledScores + mask)
  context: number[][]; // weights * V
  traces: AttentionStepTrace[];
}

export interface GqaMapping {
  queryHeadToKvHead: number[];
  groupSize: number;
  headsPerKvHead: number[][];
}

export interface NormResult {
  output: number[][];
  scales?: number[]; // RMS or variance per token
}

export interface TransformerParams {
  qkvParams: number;
  outProjParams: number;
  totalAttentionParams: number;
  ffnParams: number;
  normParams: number;
  layerTotal: number;
  modelTotal: number; // multiplied by numLayers
}

export interface TransformerFlops {
  qkvFlops: number;
  attentionMatrixFlops: number;
  contextFlops: number;
  outProjFlops: number;
  ffnFlops: number;
  totalLayerFlops: number;
}

export interface KvCacheMemory {
  bytesPerToken: number;
  totalBytes: number;
  formattedSize: string;
}

/**
 * Computes scaled dot-product attention with optional causal masking,
 * numerical stabilization (row max subtraction), and fine-grained arithmetic traces.
 */
export function calculateAttention(
  Q: number[][],
  K: number[][],
  V: number[][],
  dK: number,
  maskType: 'none' | 'causal' = 'none'
): AttentionResult {
  if (!Q || Q.length === 0 || !K || K.length === 0 || !V || V.length === 0) {
    return {
      rawScores: [],
      scaledScores: [],
      weights: [],
      context: [],
      traces: [],
    };
  }

  const N = Q.length;
  const M = K.length;
  const dV = V[0]?.length ?? 0;
  const scale = Math.sqrt(dK > 0 ? dK : Q[0]?.length || 1);

  const rawScores: number[][] = [];
  const scaledScores: number[][] = [];
  const multsGrid: Array<Array<Array<{ qVal: number; kVal: number; prod: number }>>> = [];

  for (let i = 0; i < N; i++) {
    const rawRow: number[] = [];
    const scaledRow: number[] = [];
    const multsRow: Array<Array<{ qVal: number; kVal: number; prod: number }>> = [];

    for (let j = 0; j < M; j++) {
      let dot = 0;
      const mults: Array<{ qVal: number; kVal: number; prod: number }> = [];
      const dim = Math.min(Q[i].length, K[j].length);

      for (let k = 0; k < dim; k++) {
        const qVal = Q[i][k];
        const kVal = K[j][k];
        const prod = qVal * kVal;
        dot += prod;
        mults.push({ qVal, kVal, prod });
      }

      rawRow.push(dot);
      scaledRow.push(dot / scale);
      multsRow.push(mults);
    }

    rawScores.push(rawRow);
    scaledScores.push(scaledRow);
    multsGrid.push(multsRow);
  }

  // Softmax with numerical max-subtraction and optional causal masking
  const weights: number[][] = [];
  for (let i = 0; i < N; i++) {
    const rowWeights: number[] = new Array(M).fill(0);

    let maxScore = -Infinity;
    for (let j = 0; j < M; j++) {
      if (maskType === 'causal' && j > i) {
        continue;
      }
      if (scaledScores[i][j] > maxScore) {
        maxScore = scaledScores[i][j];
      }
    }

    let sumExp = 0;
    const exps: number[] = new Array(M).fill(0);
    for (let j = 0; j < M; j++) {
      if (maskType === 'causal' && j > i) {
        exps[j] = 0;
        continue;
      }
      const expVal = Math.exp(scaledScores[i][j] - maxScore);
      exps[j] = expVal;
      sumExp += expVal;
    }

    for (let j = 0; j < M; j++) {
      rowWeights[j] = sumExp > 0 ? exps[j] / sumExp : 0;
    }

    weights.push(rowWeights);
  }

  // Context: C = weights * V (shape [N, dV])
  const context: number[][] = [];
  for (let i = 0; i < N; i++) {
    const contextRow: number[] = new Array(dV).fill(0);
    for (let l = 0; l < dV; l++) {
      let sum = 0;
      for (let j = 0; j < M; j++) {
        sum += weights[i][j] * (V[j][l] ?? 0);
      }
      contextRow[l] = sum;
    }
    context.push(contextRow);
  }

  // Generate arithmetic traces
  const traces: AttentionStepTrace[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      traces.push({
        qTokenIdx: i,
        kTokenIdx: j,
        rawDotProduct: rawScores[i][j],
        scaledScore: scaledScores[i][j],
        multiplications: multsGrid[i][j],
        attentionWeight: weights[i][j],
      });
    }
  }

  return {
    rawScores,
    scaledScores,
    weights,
    context,
    traces,
  };
}

/**
 * Computes Grouped-Query Attention (GQA) mapping from Query heads to KV heads.
 * Validates divisibility and returns group size and bidirectional groupings.
 */
export function computeGQAHeadMapping(numHeads: number, numKvHeads: number): GqaMapping {
  if (
    !Number.isInteger(numHeads) ||
    !Number.isInteger(numKvHeads) ||
    numHeads <= 0 ||
    numKvHeads <= 0
  ) {
    throw new Error(
      `numHeads (${numHeads}) and numKvHeads (${numKvHeads}) must be positive integers.`
    );
  }
  if (numKvHeads > numHeads) {
    throw new Error(`numKvHeads (${numKvHeads}) cannot exceed numHeads (${numHeads}).`);
  }
  if (numHeads % numKvHeads !== 0) {
    throw new Error(`numHeads (${numHeads}) must be divisible by numKvHeads (${numKvHeads}).`);
  }

  const groupSize = numHeads / numKvHeads;
  const queryHeadToKvHead: number[] = [];
  const headsPerKvHead: number[][] = Array.from({ length: numKvHeads }, () => []);

  for (let h = 0; h < numHeads; h++) {
    const kv = Math.floor(h / groupSize);
    queryHeadToKvHead.push(kv);
    headsPerKvHead[kv].push(h);
  }

  return { queryHeadToKvHead, groupSize, headsPerKvHead };
}

/**
 * Applies Rotary Position Embeddings (RoPE) to Query and Key matrices.
 * Rotates 2D coordinate pairs per token position m:
 *   x'_{2i}   = x_{2i} * cos(m * theta_i) - x_{2i+1} * sin(m * theta_i)
 *   x'_{2i+1} = x_{2i} * sin(m * theta_i) + x_{2i+1} * cos(m * theta_i)
 * Preserves vector Euclidean norm.
 */
export function applyRoPE(
  Q: number[][],
  K: number[][],
  base: number = 10000
): { Q_rot: number[][]; K_rot: number[][] } {
  const rotateRow = (row: number[], pos: number, d: number): number[] => {
    const rot = [...row];
    const half = Math.floor(d / 2);
    for (let i = 0; i < half; i++) {
      const theta = Math.pow(base, (-2 * i) / d);
      const angle = pos * theta;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const x0 = row[2 * i] ?? 0;
      const x1 = row[2 * i + 1] ?? 0;
      rot[2 * i] = x0 * cosA - x1 * sinA;
      rot[2 * i + 1] = x0 * sinA + x1 * cosA;
    }
    return rot;
  };

  const Q_rot = Q.map((row, pos) => rotateRow(row, pos, row.length));
  const K_rot = K.map((row, pos) => rotateRow(row, pos, row.length));

  return { Q_rot, K_rot };
}

/**
 * Applies classic sinusoidal positional encoding (Vaswani et al. 2017) to input matrix X:
 *   P_{pos, 2i}   = sin(pos / base^(2i/d))
 *   P_{pos, 2i+1} = cos(pos / base^(2i/d))
 * Returns X + P.
 */
export function applySinusoidalPositionalEncoding(X: number[][], base: number = 10000): number[][] {
  if (!X || X.length === 0) return [];

  return X.map((row, pos) => {
    const d = row.length;
    if (d === 0) return [];
    return row.map((val, k) => {
      const i = Math.floor(k / 2);
      const denom = Math.pow(base, (2 * i) / d);
      const pe = k % 2 === 0 ? Math.sin(pos / denom) : Math.cos(pos / denom);
      return val + pe;
    });
  });
}

/**
 * Applies Root Mean Square Normalization (RMSNorm):
 *   RMS(x) = sqrt( (1/d) * sum(x_k^2) + eps )
 *   y_k = (x_k / RMS(x)) * gamma_k
 */
export function applyRMSNorm(X: number[][], gamma?: number[], eps: number = 1e-5): NormResult {
  if (!X || X.length === 0) {
    return { output: [], scales: [] };
  }

  const scales: number[] = [];
  const output = X.map((row) => {
    const d = row.length;
    if (d === 0) return [];
    const sumSq = row.reduce((acc, v) => acc + v * v, 0);
    const rms = Math.sqrt(sumSq / d + eps);
    scales.push(rms);
    return row.map((val, k) => {
      const g = gamma && gamma[k] !== undefined ? gamma[k] : 1;
      return (val / rms) * g;
    });
  });

  return { output, scales };
}

/**
 * Applies Layer Normalization (LayerNorm):
 *   mu = (1/d) * sum(x_k)
 *   sigma^2 = (1/d) * sum((x_k - mu)^2)
 *   y_k = ((x_k - mu) / sqrt(sigma^2 + eps)) * gamma_k + beta_k
 */
export function applyLayerNorm(
  X: number[][],
  gamma?: number[],
  beta?: number[],
  eps: number = 1e-5
): NormResult {
  if (!X || X.length === 0) {
    return { output: [], scales: [] };
  }

  const scales: number[] = [];
  const output = X.map((row) => {
    const d = row.length;
    if (d === 0) return [];
    const mean = row.reduce((acc, v) => acc + v, 0) / d;
    const variance = row.reduce((acc, v) => acc + (v - mean) ** 2, 0) / d;
    scales.push(variance);
    const std = Math.sqrt(variance + eps);
    return row.map((val, k) => {
      const g = gamma && gamma[k] !== undefined ? gamma[k] : 1;
      const b = beta && beta[k] !== undefined ? beta[k] : 0;
      return ((val - mean) / std) * g + b;
    });
  });

  return { output, scales };
}

/**
 * GELU approximation: 0.5 * x * (1 + tanh(sqrt(2/pi) * (x + 0.044715 * x^3)))
 */
function gelu(x: number): number {
  const sqrt2OverPi = 0.7978845608028654;
  return 0.5 * x * (1 + Math.tanh(sqrt2OverPi * (x + 0.044715 * x * x * x)));
}

/**
 * Swish (SiLU) activation: x * sigmoid(x) = x / (1 + exp(-x))
 */
function swish(x: number): number {
  return x / (1 + Math.exp(-x));
}

/**
 * Computes Feed-Forward Network forward pass:
 * - Standard: GELU(X * W_1 + b_1) * W_2 + b_2
 * - SwiGLU: (Swish(X * W_gate) (X * W_up)) * W_down
 * Uses deterministic normalized weights for stable interactive simulation.
 */
export function computeFFN(
  X: number[][],
  type: 'standard' | 'swiglu',
  dModel: number,
  dFfn: number
): { Y: number[][]; intermediateDim: number } {
  if (!X || X.length === 0) {
    return { Y: [], intermediateDim: dFfn };
  }

  const N = X.length;
  const dIn = dModel > 0 ? dModel : X[0]?.length || 1;
  const dHidden = dFfn > 0 ? dFfn : dIn * 4;

  // Helper to generate deterministic synthetic weights
  const makeWeight = (rows: number, cols: number, seedOffset: number): number[][] => {
    const W: number[][] = [];
    const scale = 1 / Math.sqrt(rows);
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        const val = Math.sin(r * 1.7 + c * 2.9 + seedOffset) * scale;
        row.push(val);
      }
      W.push(row);
    }
    return W;
  };

  // Matrix multiplication helper: A (N x K) * B (K x P) -> (N x P)
  const matmul = (A: number[][], B: number[][]): number[][] => {
    const rows = A.length;
    const cols = B[0]?.length || 0;
    const inner = B.length;
    const res: number[][] = [];
    for (let r = 0; r < rows; r++) {
      const outRow: number[] = new Array(cols).fill(0);
      for (let c = 0; c < cols; c++) {
        let sum = 0;
        for (let k = 0; k < inner; k++) {
          sum += A[r][k] * B[k][c];
        }
        outRow[c] = sum;
      }
      res.push(outRow);
    }
    return res;
  };

  if (type === 'swiglu') {
    const WGate = makeWeight(dIn, dHidden, 1.0);
    const WUp = makeWeight(dIn, dHidden, 2.0);
    const WDown = makeWeight(dHidden, dIn, 3.0);

    const gate = matmul(X, WGate);
    const up = matmul(X, WUp);

    // Element-wise Swish(gate) * up
    const hidden: number[][] = [];
    for (let r = 0; r < N; r++) {
      const hRow: number[] = new Array(dHidden).fill(0);
      for (let c = 0; c < dHidden; c++) {
        hRow[c] = swish(gate[r][c]) * up[r][c];
      }
      hidden.push(hRow);
    }

    const Y = matmul(hidden, WDown);
    return { Y, intermediateDim: dHidden };
  } else {
    // Standard GELU MLP
    const W1 = makeWeight(dIn, dHidden, 1.0);
    const W2 = makeWeight(dHidden, dIn, 2.0);

    const hRaw = matmul(X, W1);
    const hidden: number[][] = [];
    for (let r = 0; r < N; r++) {
      const hRow: number[] = new Array(dHidden).fill(0);
      for (let c = 0; c < dHidden; c++) {
        hRow[c] = gelu(hRaw[r][c]);
      }
      hidden.push(hRow);
    }

    const Y = matmul(hidden, W2);
    return { Y, intermediateDim: dHidden };
  }
}

/**
 * Calculates parameter counts for single Transformer block and entire model:
 * - Attention projections (Q, K, V, O) accounting for MHA, GQA, MQA and optional bias.
 * - FFN (Standard 2-matrix vs SwiGLU 3-matrix).
 * - Normalization (LayerNorm 2 vectors vs RMSNorm 1 vector per norm layer, 2 layers per block).
 */
export function calculateTransformerParams(
  config: TransformerConfig,
  numLayers: number = 1,
  vocabSize: number = 0
): TransformerParams {
  const { dModel, numHeads, numKvHeads, dHead, dFfn, normType, ffnType, hasBias } = config;

  // Attention projections:
  // W_Q: dModel * (numHeads * dHead)
  // W_K: dModel * (numKvHeads * dHead)
  // W_V: dModel * (numKvHeads * dHead)
  const qParams = dModel * (numHeads * dHead) + (hasBias ? numHeads * dHead : 0);
  const kParams = dModel * (numKvHeads * dHead) + (hasBias ? numKvHeads * dHead : 0);
  const vParams = dModel * (numKvHeads * dHead) + (hasBias ? numKvHeads * dHead : 0);
  const qkvParams = qParams + kParams + vParams;

  // W_O: (numHeads * dHead) * dModel
  const outProjParams = numHeads * dHead * dModel + (hasBias ? dModel : 0);
  const totalAttentionParams = qkvParams + outProjParams;

  // FFN:
  let ffnParams = 0;
  if (ffnType === 'swiglu') {
    // 3 linear layers: W_gate, W_up, W_down
    const gateParams = dModel * dFfn + (hasBias ? dFfn : 0);
    const upParams = dModel * dFfn + (hasBias ? dFfn : 0);
    const downParams = dFfn * dModel + (hasBias ? dModel : 0);
    ffnParams = gateParams + upParams + downParams;
  } else {
    // 2 linear layers: W_1, W_2
    const w1Params = dModel * dFfn + (hasBias ? dFfn : 0);
    const w2Params = dFfn * dModel + (hasBias ? dModel : 0);
    ffnParams = w1Params + w2Params;
  }

  // Normalization (2 norm layers per block):
  // LayerNorm has scale (gamma) and bias (beta) -> 2 * dModel per norm layer
  // RMSNorm has scale (gamma) only -> 1 * dModel per norm layer
  const paramsPerNorm = normType === 'layernorm' ? 2 * dModel : dModel;
  const normParams = 2 * paramsPerNorm;

  const layerTotal = totalAttentionParams + ffnParams + normParams;
  const layers = Math.max(1, numLayers ?? 1);
  const embedParams = vocabSize > 0 ? vocabSize * dModel : 0;
  const modelTotal = layerTotal * layers + embedParams;

  return {
    qkvParams,
    outProjParams,
    totalAttentionParams,
    ffnParams,
    normParams,
    layerTotal,
    modelTotal,
  };
}

/**
 * Calculates FLOPs per sequence for single Transformer layer:
 * - Linear projections: QKV projections and output projection.
 * - Attention computation: QK^T score matrix and AV context aggregation.
 * - Feed-forward network (Standard 2x MACs vs SwiGLU 3x MACs).
 */
export function calculateTransformerFlops(
  seqLen: number,
  config: TransformerConfig
): TransformerFlops {
  const N = Math.max(0, seqLen);
  const { dModel, numHeads, numKvHeads, dHead, dFfn, ffnType } = config;

  // Q, K, V linear projections: 2 * N * d_model * (d_head * (H_Q + 2 * H_KV))
  const qkvFlops = 2 * N * dModel * (dHead * (numHeads + 2 * numKvHeads));

  // Attention score Q K^T: 2 * H_Q * N^2 * d_head
  const attentionMatrixFlops = 2 * numHeads * N * N * dHead;

  // Context A V: 2 * H_Q * N^2 * d_head
  const contextFlops = 2 * numHeads * N * N * dHead;

  // Output projection W_O: 2 * N * (H_Q * d_head) * d_model
  const outProjFlops = 2 * N * (numHeads * dHead) * dModel;

  // FFN FLOPs:
  // Standard: 2 * N * (2 * d_model * d_ffn)
  // SwiGLU: 2 * N * (3 * d_model * d_ffn)
  const ffnFlops = ffnType === 'swiglu' ? 2 * N * (3 * dModel * dFfn) : 2 * N * (2 * dModel * dFfn);

  const totalLayerFlops = qkvFlops + attentionMatrixFlops + contextFlops + outProjFlops + ffnFlops;

  return {
    qkvFlops,
    attentionMatrixFlops,
    contextFlops,
    outProjFlops,
    ffnFlops,
    totalLayerFlops,
  };
}

/**
 * Calculates Key-Value cache memory consumption for autoregressive generation:
 *   totalBytes = 2 * numLayers * seqLen * numKvHeads * headDim * precisionBytes
 */
export function calculateKVCacheMemory(
  seqLen: number,
  numKvHeads: number,
  headDim: number,
  numLayers: number,
  precisionBytes: number
): KvCacheMemory {
  const bytesPerToken = 2 * numLayers * numKvHeads * headDim * precisionBytes;
  const totalBytes = bytesPerToken * seqLen;

  let formattedSize: string;
  if (totalBytes < 1024) {
    formattedSize = `${totalBytes} B`;
  } else if (totalBytes < 1024 * 1024) {
    formattedSize = `${(totalBytes / 1024).toFixed(2)} KB`;
  } else if (totalBytes < 1024 * 1024 * 1024) {
    formattedSize = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
  } else {
    formattedSize = `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  return {
    bytesPerToken,
    totalBytes,
    formattedSize,
  };
}

/**
 * Generates modern, clean PyTorch code snippet reflecting current configuration.
 * Includes scaled_dot_product_attention, RMSNorm / LayerNorm, RoPE, SwiGLU, and GQA KV repeating.
 */
export function generateTransformerPyTorchSnippet(config: TransformerConfig): string {
  const {
    dModel,
    numHeads,
    numKvHeads,
    dFfn,
    normType,
    normPosition,
    posEncoding,
    ffnType,
    maskType,
    hasBias,
  } = config;

  const isGQA = numKvHeads < numHeads;
  const isRoPE = posEncoding === 'rope';
  const isSwiGLU = ffnType === 'swiglu';
  const isRMSNorm = normType === 'rmsnorm';
  const isPreLN = normPosition === 'pre';
  const isCausal = maskType === 'causal';
  const biasStr = hasBias ? 'True' : 'False';

  const ropeHelper = isRoPE
    ? `
def apply_rotary_emb(x: torch.Tensor, base: float = 10000.0) -> torch.Tensor:
    """Applies Rotary Position Embedding (RoPE) to tensor (B, H, S, D)."""
    B, H, S, D = x.shape
    d_half = D // 2
    pos = torch.arange(S, device=x.device, dtype=x.dtype).unsqueeze(1)
    dim_idx = torch.arange(d_half, device=x.device, dtype=x.dtype)
    theta = base ** (-2.0 * dim_idx / D)
    freqs = pos * theta  # (S, d_half)
    cos = torch.cos(freqs).repeat_interleave(2, dim=-1)
    sin = torch.sin(freqs).repeat_interleave(2, dim=-1)
    x_rot = torch.stack([-x[..., 1::2], x[..., ::2]], dim=-1).flatten(-2)
    return x * cos + x_rot * sin
`
    : '';

  const normClass = isRMSNorm ? `nn.RMSNorm(d_model)` : `nn.LayerNorm(d_model)`;

  const ffnInit = isSwiGLU
    ? `        # SwiGLU Feed-Forward Network (3 linear projections)
        self.w_gate = nn.Linear(d_model, d_ffn, bias=${biasStr})
        self.w_up = nn.Linear(d_model, d_ffn, bias=${biasStr})
        self.w_down = nn.Linear(d_ffn, d_model, bias=${biasStr})`
    : `        # Standard Feed-Forward Network (2 linear projections)
        self.w1 = nn.Linear(d_model, d_ffn, bias=${biasStr})
        self.w2 = nn.Linear(d_ffn, d_model, bias=${biasStr})`;

  const ffnForward = isSwiGLU
    ? `        # SwiGLU forward: F.silu(gate) * up -> down
        ffn_out = self.w_down(F.silu(self.w_gate(h)) * self.w_up(h))`
    : `        # Standard FFN forward: GELU(w1(x)) -> w2
        ffn_out = self.w2(F.gelu(self.w1(h)))`;

  const kvRepeat = isGQA
    ? `
        # Repeat KV heads for Grouped-Query Attention (GQA)
        k = torch.repeat_interleave(k, repeats=self.num_heads // self.num_kv_heads, dim=1)
        v = torch.repeat_interleave(v, repeats=self.num_heads // self.num_kv_heads, dim=1)`
    : '';

  const ropeCall = isRoPE
    ? `
        # Apply Rotary Position Embeddings (RoPE)
        q = apply_rotary_emb(q)
        k = apply_rotary_emb(k)`
    : '';

  let forwardBody = '';
  if (isPreLN) {
    forwardBody = `    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Pre-LN Architecture (Modern LLM / LLaMA style)
        norm1 = self.attn_norm(x)

        # QKV linear projections & head reshaping: (B, S, D) -> (B, H, S, d_head)
        B, S, _ = x.shape
        q = self.q_proj(norm1).view(B, S, self.num_heads, self.head_dim).transpose(1, 2)
        k = self.k_proj(norm1).view(B, S, self.num_kv_heads, self.head_dim).transpose(1, 2)
        v = self.v_proj(norm1).view(B, S, self.num_kv_heads, self.head_dim).transpose(1, 2)${ropeCall}${kvRepeat}

        # Scaled Dot-Product Attention (FlashAttention compatible)
        attn_out = F.scaled_dot_product_attention(
            q, k, v, is_causal=${isCausal ? 'True' : 'False'}
        )
        attn_out = attn_out.transpose(1, 2).contiguous().view(B, S, self.num_heads * self.head_dim)
        x = x + self.out_proj(attn_out)

        # FFN Block with Pre-LN
        h = self.ffn_norm(x)
${ffnForward}
        return x + ffn_out`;
  } else {
    forwardBody = `    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Post-LN Architecture (Classical Vaswani 2017 style)
        B, S, _ = x.shape
        q = self.q_proj(x).view(B, S, self.num_heads, self.head_dim).transpose(1, 2)
        k = self.k_proj(x).view(B, S, self.num_kv_heads, self.head_dim).transpose(1, 2)
        v = self.v_proj(x).view(B, S, self.num_kv_heads, self.head_dim).transpose(1, 2)${ropeCall}${kvRepeat}

        # Scaled Dot-Product Attention
        attn_out = F.scaled_dot_product_attention(
            q, k, v, is_causal=${isCausal ? 'True' : 'False'}
        )
        attn_out = attn_out.transpose(1, 2).contiguous().view(B, S, self.num_heads * self.head_dim)
        x = self.attn_norm(x + self.out_proj(attn_out))

        # FFN Block with Post-LN
        h = x
${ffnForward}
        return self.ffn_norm(x + ffn_out)`;
  }

  return `import torch
import torch.nn as nn
import torch.nn.functional as F
${ropeHelper}
class TransformerBlock(nn.Module):
    """
    Parametrized Transformer Layer.
    d_model=${dModel}, num_heads=${numHeads}, num_kv_heads=${numKvHeads}, d_ffn=${dFfn}
    Norm: ${normType.toUpperCase()} (${normPosition}-norm) | PosEncoding: ${posEncoding} | FFN: ${ffnType}
    """
    def __init__(
        self,
        d_model: int = ${dModel},
        num_heads: int = ${numHeads},
        num_kv_heads: int = ${numKvHeads},
        d_ffn: int = ${dFfn},
    ):
        super().__init__()
        self.d_model = d_model
        self.num_heads = num_heads
        self.num_kv_heads = num_kv_heads
        self.head_dim = d_model // num_heads

        # Normalization Layers
        self.attn_norm = ${normClass}
        self.ffn_norm = ${normClass}

        # Multi-Head / Grouped-Query Attention Projections
        self.q_proj = nn.Linear(d_model, num_heads * self.head_dim, bias=${biasStr})
        self.k_proj = nn.Linear(d_model, num_kv_heads * self.head_dim, bias=${biasStr})
        self.v_proj = nn.Linear(d_model, num_kv_heads * self.head_dim, bias=${biasStr})
        self.out_proj = nn.Linear(num_heads * self.head_dim, d_model, bias=${biasStr})

${ffnInit}

${forwardBody}
`;
}
