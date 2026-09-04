/**
 * Mamba & State Space Model (SSM) Interactive Studio: Mathematical Domain Engine
 *
 * Pure TypeScript, zero-DOM mathematical domain engine modeling:
 * - Continuous HiPPO-Legendre matrix and S4D diagonal parameterization
 * - Zero-Order Hold (ZOH) discretization with Taylor series expansion for numerical stability
 * - Selective Scan sequential recurrence with input-dependent filtering
 * - Parallel Associative Scan (Blelloch/Kogge-Stone tree) for O(log T) parallel training
 * - Mamba layer parameter counting, FLOPs analysis, and O(1) inference memory benchmarking
 * - Executable, modern PyTorch code generation for selective SSMs
 */

export interface MambaConfig {
  dModel: number; // Model hidden dimension (e.g. 16 for demo, 768 / 2048 for full models)
  dState: number; // SSM state dimension N (e.g. 4 to 16)
  dConv: number; // 1D short convolution kernel size (default 4)
  expand: number; // Block expansion factor E (default 2)
  dtRank: number; // Rank of Delta projection (default ceil(dModel / 16))
}

export interface SelectiveScanStep {
  step: number;
  token: string;
  xVal: number;
  delta: number;
  bVal: number[];
  cVal: number[];
  aBarDiag: number[];
  bBar: number[];
  hPrev: number[];
  hNext: number[];
  yVal: number;
  retainedRatio: number; // 1 - delta (how much previous state is preserved)
}

export interface SelectiveScanResult {
  outputs: number[];
  states: number[][]; // (T + 1) x N state matrix across time
  steps: SelectiveScanStep[];
}

export interface ParallelScanNode {
  level: number;
  stepIdx: number;
  span: [number, number];
  aProd: number[]; // cumulative A_bar product vector
  bSum: number[]; // associative accumulated state vector
}

export interface MambaParams {
  inProjParams: number;
  convParams: number;
  dtProjParams: number;
  bProjParams: number;
  cProjParams: number;
  outProjParams: number;
  layerTotal: number;
  modelTotal: number;
}

export interface MambaFlops {
  inProjFlops: number;
  convFlops: number;
  ssmFlops: number;
  gateFlops: number;
  outProjFlops: number;
  totalLayerFlops: number;
}

export interface MambaBenchmark {
  mambaStateBytes: number;
  transformerKvBytes: number;
  mambaFormatted: string;
  transformerFormatted: string;
  ratio: string;
}

/**
 * Initializes continuous N x N HiPPO-Legendre matrix:
 * A_{nk} = - sqrt(2n + 1) * sqrt(2k + 1) if n > k
 * A_{nk} = -(n + 1)                      if n == k
 * A_{nk} = 0                             if n < k
 */
export function initializeHiPPOMatrix(N: number): number[][] {
  if (N <= 0) return [];
  const A: number[][] = [];
  for (let n = 0; n < N; n++) {
    const row: number[] = [];
    for (let k = 0; k < N; k++) {
      if (n > k) {
        row.push(-Math.sqrt(2 * n + 1) * Math.sqrt(2 * k + 1));
      } else if (n === k) {
        row.push(-(n + 1));
      } else {
        row.push(0);
      }
    }
    A.push(row);
  }
  return A;
}

/**
 * Initializes continuous diagonal A vector: A_n = -(n + 1) for n in [0, N-1].
 * Negative eigenvalues ensure bounded-input bounded-output (BIBO) stability under ZOH.
 */
export function initializeDiagonalA(N: number): number[] {
  if (N <= 0) return [];
  const diag: number[] = [];
  for (let n = 0; n < N; n++) {
    diag.push(-(n + 1));
  }
  return diag;
}

/**
 * Discretizes continuous SSM parameters (A_diag, B) via Zero-Order Hold (ZOH) with step size delta:
 * A_bar_n = exp(delta * A_n)
 * B_bar_n = ((exp(delta * A_n) - 1) / A_n) * B_n
 *
 * Numerical stability guard:
 * When |delta * A_n| < 1e-4 or |A_n| < 1e-15, applies Taylor series expansion:
 * B_bar_n = delta * B_n * (1 + (delta * A_n)/2 + (delta * A_n)^2 / 6)
 */
export function discretizeZOH(
  A_diag: number[],
  B: number[],
  delta: number
): { A_bar: number[]; B_bar: number[] } {
  if (!A_diag || A_diag.length === 0 || !B || B.length === 0) {
    return { A_bar: [], B_bar: [] };
  }

  const N = Math.min(A_diag.length, B.length);
  const A_bar: number[] = new Array(N);
  const B_bar: number[] = new Array(N);

  for (let n = 0; n < N; n++) {
    const a = A_diag[n];
    const b = B[n] ?? 0;
    const x = delta * a;

    // A_bar = exp(delta * A)
    // Spectral radius guard: exp(x) stays in (0, 1] for negative a and non-negative delta
    A_bar[n] = Math.exp(x);

    // B_bar = (exp(x) - 1) / a * b
    if (Math.abs(x) < 1e-4 || Math.abs(a) < 1e-15) {
      // Taylor series expansion of (exp(x) - 1) / a * b:
      // (x + x^2 / 2 + x^3 / 6) / a * b = delta * b * (1 + x / 2 + x^2 / 6)
      B_bar[n] = delta * b * (1 + x / 2 + (x * x) / 6);
    } else {
      B_bar[n] = ((A_bar[n] - 1) / a) * b;
    }
  }

  return { A_bar, B_bar };
}

/**
 * Computes sequential Selective Scan recurrence:
 * h_t = A_bar_t * h_{t-1} + B_bar_t * x_t
 * y_t = C_t * h_t + D * x_t
 *
 * Tracks fine-grained per-step state variables for visualization and x-ray inspector.
 */
export function computeSelectiveScan(
  x: number[],
  delta: number[],
  B: number[][],
  C: number[][],
  A_diag: number[],
  D: number = 0,
  tokens?: string[]
): SelectiveScanResult {
  if (!x || x.length === 0) {
    const N = A_diag?.length || 0;
    return {
      outputs: [],
      states: [new Array(N).fill(0)],
      steps: [],
    };
  }

  const T = x.length;
  const N = A_diag.length;
  const outputs: number[] = new Array(T);
  const states: number[][] = [new Array(N).fill(0)];
  const steps: SelectiveScanStep[] = [];

  let hPrev = states[0];

  for (let t = 0; t < T; t++) {
    const xVal = x[t];
    const dt = delta[t] ?? 0.1;
    const bRow = B[t] || (B[0] ? B[0] : new Array(N).fill(0));
    const cRow = C[t] || (C[0] ? C[0] : new Array(N).fill(0));
    const token = tokens && tokens[t] !== undefined ? tokens[t] : `t${t}`;

    const { A_bar, B_bar } = discretizeZOH(A_diag, bRow, dt);

    const hNext: number[] = new Array(N);
    let yVal = 0;

    for (let n = 0; n < N; n++) {
      hNext[n] = A_bar[n] * hPrev[n] + B_bar[n] * xVal;
      yVal += (cRow[n] ?? 0) * hNext[n];
    }

    yVal += (D ?? 0) * xVal;

    outputs[t] = yVal;
    states.push(hNext);

    steps.push({
      step: t,
      token,
      xVal,
      delta: dt,
      bVal: bRow.slice(),
      cVal: cRow.slice(),
      aBarDiag: A_bar.slice(),
      bBar: B_bar.slice(),
      hPrev: hPrev.slice(),
      hNext: hNext.slice(),
      yVal,
      retainedRatio: Math.max(0, Math.min(1, 1 - dt)),
    });

    hPrev = hNext;
  }

  return {
    outputs,
    states,
    steps,
  };
}

/**
 * Computes parallel associative prefix scan (Blelloch / Kogge-Stone tree):
 * Binary associative operator:
 * (u_j, a_j) o (u_i, a_i) = (a_j * u_i + u_j, a_j * a_i)
 *
 * Produces exact equivalent outputs to sequential scan within floating-point tolerance,
 * and builds tree nodes across levels l = 0, ..., ceil(log2 T) for visual rendering.
 */
export function computeParallelAssociativeScan(
  x: number[],
  delta: number[],
  B: number[][],
  C: number[][],
  A_diag: number[],
  D: number = 0
): { outputs: number[]; tree: ParallelScanNode[] } {
  if (!x || x.length === 0) {
    return { outputs: [], tree: [] };
  }

  const T = x.length;
  const N = A_diag.length;
  const tree: ParallelScanNode[] = [];

  // Discretize each step independently
  const aNodes: number[][] = new Array(T);
  const uNodes: number[][] = new Array(T);

  for (let t = 0; t < T; t++) {
    const dt = delta[t] ?? 0.1;
    const bRow = B[t] || (B[0] ? B[0] : new Array(N).fill(0));
    const { A_bar, B_bar } = discretizeZOH(A_diag, bRow, dt);

    aNodes[t] = A_bar;
    uNodes[t] = new Array(N);
    for (let n = 0; n < N; n++) {
      uNodes[t][n] = B_bar[n] * x[t];
    }
  }

  // Handle T = 1 edge case
  if (T === 1) {
    const node: ParallelScanNode = {
      level: 0,
      stepIdx: 0,
      span: [0, 0],
      aProd: aNodes[0].slice(),
      bSum: uNodes[0].slice(),
    };
    tree.push(node);

    let y0 = 0;
    const c0 = C[0] || new Array(N).fill(0);
    for (let n = 0; n < N; n++) {
      y0 += (c0[n] ?? 0) * uNodes[0][n];
    }
    y0 += (D ?? 0) * x[0];

    return { outputs: [y0], tree };
  }

  // Level 0: Individual leaf nodes
  let currNodes: ParallelScanNode[] = new Array(T);
  for (let t = 0; t < T; t++) {
    const node: ParallelScanNode = {
      level: 0,
      stepIdx: t,
      span: [t, t],
      aProd: aNodes[t].slice(),
      bSum: uNodes[t].slice(),
    };
    currNodes[t] = node;
    tree.push(node);
  }

  const numLevels = Math.ceil(Math.log2(T));

  for (let l = 1; l <= numLevels; l++) {
    const stride = 1 << (l - 1);
    const nextNodes: ParallelScanNode[] = new Array(T);

    for (let t = 0; t < T; t++) {
      if (t >= stride) {
        const prev = currNodes[t - stride];
        const curr = currNodes[t];

        const aComb: number[] = new Array(N);
        const bComb: number[] = new Array(N);

        for (let n = 0; n < N; n++) {
          aComb[n] = curr.aProd[n] * prev.aProd[n];
          bComb[n] = curr.aProd[n] * prev.bSum[n] + curr.bSum[n];
        }

        const node: ParallelScanNode = {
          level: l,
          stepIdx: t,
          span: [prev.span[0], curr.span[1]],
          aProd: aComb,
          bSum: bComb,
        };
        nextNodes[t] = node;
        tree.push(node);
      } else {
        // Step t already represents the full accumulated prefix [0, t]
        const curr = currNodes[t];
        const node: ParallelScanNode = {
          level: l,
          stepIdx: t,
          span: curr.span,
          aProd: curr.aProd.slice(),
          bSum: curr.bSum.slice(),
        };
        nextNodes[t] = node;
        tree.push(node);
      }
    }

    currNodes = nextNodes;
  }

  // Final outputs calculated from level L accumulated states
  const outputs: number[] = new Array(T);
  for (let t = 0; t < T; t++) {
    const cRow = C[t] || (C[0] ? C[0] : new Array(N).fill(0));
    const hState = currNodes[t].bSum;
    let y = 0;
    for (let n = 0; n < N; n++) {
      y += (cRow[n] ?? 0) * hState[n];
    }
    y += (D ?? 0) * x[t];
    outputs[t] = y;
  }

  return { outputs, tree };
}

/**
 * Calculates parameter counts for a Mamba block and entire model:
 * - inProjParams: dModel -> 2D (SSM branch + Gate branch)
 * - convParams: depthwise 1D conv on D channels with kernel size dConv
 * - dtProjParams: dModel -> dtRank, then dtRank -> D
 * - bProjParams: dModel -> dState
 * - cProjParams: dModel -> dState
 * - outProjParams: D -> dModel
 */
export function calculateMambaParams(
  config: MambaConfig,
  numLayers: number = 1,
  vocabSize: number = 0
): MambaParams {
  const { dModel, dState } = config;
  if (dModel <= 0 || dState <= 0) {
    return {
      inProjParams: 0,
      convParams: 0,
      dtProjParams: 0,
      bProjParams: 0,
      cProjParams: 0,
      outProjParams: 0,
      layerTotal: 0,
      modelTotal: 0,
    };
  }

  const expand = config.expand || 2;
  const dConv = config.dConv || 4;
  const dtRank = config.dtRank || Math.max(1, Math.ceil(dModel / 16));
  const D = expand * dModel;

  const inProjParams = dModel * (2 * D);
  const convParams = D * dConv;
  const dtProjParams = dModel * dtRank + dtRank * D;
  const bProjParams = dModel * dState;
  const cProjParams = dModel * dState;
  const outProjParams = D * dModel;

  const layerTotal =
    inProjParams +
    convParams +
    dtProjParams +
    bProjParams +
    cProjParams +
    outProjParams;

  const layers = Math.max(1, numLayers ?? 1);
  const embedParams = vocabSize && vocabSize > 0 ? vocabSize * dModel : 0;
  const modelTotal = layerTotal * layers + embedParams;

  return {
    inProjParams,
    convParams,
    dtProjParams,
    bProjParams,
    cProjParams,
    outProjParams,
    layerTotal,
    modelTotal,
  };
}

/**
 * Calculates FLOPs per sequence for a single Mamba layer:
 * - Linear projections: input projection and output projection
 * - 1D Convolution: depthwise short conv over sequence
 * - Selective scan: discretization, state recurrence, output projection
 * - Gating: elementwise multiplication
 */
export function calculateMambaFlops(
  seqLen: number,
  config: MambaConfig
): MambaFlops {
  if (seqLen <= 0 || config.dModel <= 0 || config.dState <= 0) {
    return {
      inProjFlops: 0,
      convFlops: 0,
      ssmFlops: 0,
      gateFlops: 0,
      outProjFlops: 0,
      totalLayerFlops: 0,
    };
  }

  const { dModel, dState } = config;
  const expand = config.expand || 2;
  const dConv = config.dConv || 4;
  const D = expand * dModel;

  const inProjFlops = 2 * seqLen * (2 * D * dModel);
  const convFlops = 2 * seqLen * D * dConv;
  const ssmFlops = 2 * seqLen * (D * dState * 3);
  const gateFlops = seqLen * D;
  const outProjFlops = 2 * seqLen * D * dModel;

  const totalLayerFlops =
    inProjFlops + convFlops + ssmFlops + gateFlops + outProjFlops;

  return {
    inProjFlops,
    convFlops,
    ssmFlops,
    gateFlops,
    outProjFlops,
    totalLayerFlops,
  };
}

/**
 * Formats a byte quantity into a human-readable size string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Benchmarks inference generation memory footprint:
 * Mamba constant state memory O(1) vs Transformer quadratic/linear KV cache O(N).
 */
export function calculateMambaMemoryBenchmark(
  seqLen: number,
  dModel: number,
  dState: number,
  numLayers: number,
  precisionBytes: number = 2
): MambaBenchmark {
  const mambaStateBytes = numLayers * dModel * dState * precisionBytes;
  const transformerKvBytes =
    2 * numLayers * seqLen * dModel * precisionBytes;

  const mambaFormatted = formatBytes(mambaStateBytes);
  const transformerFormatted = formatBytes(transformerKvBytes);

  const ratioVal =
    mambaStateBytes > 0 ? transformerKvBytes / mambaStateBytes : 1;
  const ratio = `${ratioVal.toFixed(1)}x`;

  return {
    mambaStateBytes,
    transformerKvBytes,
    mambaFormatted,
    transformerFormatted,
    ratio,
  };
}

/**
 * Generates production-ready, clean, modern PyTorch code implementing
 * the selective scan loop and complete MambaBlock module.
 */
export function generateMambaPyTorchSnippet(config: MambaConfig): string {
  const { dModel, dState, dConv, expand } = config;
  const dtRank = config.dtRank || Math.max(1, Math.ceil(dModel / 16));
  const dInner = (expand || 2) * dModel;

  return `import torch
import torch.nn as nn
import torch.nn.functional as F

def selective_scan(
    u: torch.Tensor,       # [B, L, D]
    delta: torch.Tensor,   # [B, L, D]
    A: torch.Tensor,       # [D, N]
    B: torch.Tensor,       # [B, L, N]
    C: torch.Tensor,       # [B, L, N]
    D: torch.Tensor = None # [D]
) -> torch.Tensor:
    """
    Selective Scan sequential recurrence (Hardware-aware associative scan in CUDA).
    h_t = exp(delta_t * A) * h_{t-1} + (exp(delta_t * A) - 1)/A * B_t * u_t
    y_t = C_t * h_t + D * u_t
    """
    b, l, d = u.shape
    n = A.shape[1]

    # ZOH Discretization
    deltaA = torch.exp(torch.einsum('bld,dn->bldn', delta, A))
    deltaB_u = torch.einsum('bld,bln,bld->bldn', delta, B, u)

    # Recurrent scan loop (O(1) memory during inference)
    x = torch.zeros((b, d, n), device=u.device, dtype=u.dtype)
    ys = []
    for i in range(l):
        x = deltaA[:, i] * x + deltaB_u[:, i]
        y = torch.einsum('bdn,bn->bd', x, C[:, i])
        ys.append(y)

    y = torch.stack(ys, dim=1)
    if D is not None:
        y = y + u * D
    return y

class MambaBlock(nn.Module):
    """
    Parametrized Mamba SSM Layer.
    d_model=${dModel}, d_state=${dState}, d_conv=${dConv}, expand=${expand}, dt_rank=${dtRank}
    """
    def __init__(
        self,
        d_model: int = ${dModel},
        d_state: int = ${dState},
        d_conv: int = ${dConv},
        expand: int = ${expand},
        dt_rank: int = ${dtRank},
    ):
        super().__init__()
        self.d_model = d_model
        self.d_state = d_state
        self.d_conv = d_conv
        self.expand = expand
        self.d_inner = self.expand * self.d_model
        self.dt_rank = dt_rank

        # In-projection for SSM branch and Gate branch
        self.in_proj = nn.Linear(self.d_model, 2 * self.d_inner, bias=False)

        # 1D Depthwise Convolution
        self.conv1d = nn.Conv1d(
            in_channels=self.d_inner,
            out_channels=self.d_inner,
            bias=True,
            kernel_size=self.d_conv,
            groups=self.d_inner,
            padding=self.d_conv - 1,
        )
        self.activation = nn.SiLU()

        # Input-dependent projections for Delta, B, and C
        self.x_proj = nn.Linear(
            self.d_inner, self.dt_rank + 2 * self.d_state, bias=False
        )
        self.dt_proj = nn.Linear(self.dt_rank, self.d_inner, bias=True)

        # S4D Diagonal A parameterization: A_n = -(n + 1)
        A = torch.arange(1, self.d_state + 1, dtype=torch.float32).repeat(self.d_inner, 1)
        self.A_log = nn.Parameter(torch.log(A)) # Learns log(-A)
        self.D = nn.Parameter(torch.ones(self.d_inner))

        # Out-projection
        self.out_proj = nn.Linear(self.d_inner, self.d_model, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass of MambaBlock:
        x: [B, L, D_model] -> y: [B, L, D_model]
        """
        b, l, _ = x.shape

        # 1. Input projection: split into SSM branch and Gating branch
        xz = self.in_proj(x) # [B, L, 2 * D_inner]
        x_branch, z_branch = xz.chunk(2, dim=-1)

        # 2. 1D Convolution with causal truncation and SiLU
        x_conv = self.conv1d(x_branch.transpose(1, 2))[:, :, :l].transpose(1, 2)
        x_ssm = self.activation(x_conv)

        # 3. Input-dependent parameter projection (Delta, B, C)
        ssm_params = self.x_proj(x_ssm)
        dt, B, C = torch.split(
            ssm_params, [self.dt_rank, self.d_state, self.d_state], dim=-1
        )
        delta = F.softplus(self.dt_proj(dt)) # [B, L, D_inner]

        # 4. Continuous-to-discrete Selective Scan
        A = -torch.exp(self.A_log.float()) # [D_inner, d_state]
        y_ssm = selective_scan(x_ssm, delta, A, B, C, self.D)

        # 5. Gating multiplication & Out-projection
        gate = self.activation(z_branch)
        y = self.out_proj(y_ssm * gate)

        return y
`;
}
