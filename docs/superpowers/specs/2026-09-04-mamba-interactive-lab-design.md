# Technical Design Specification: Mamba & State Space Model Interactive Studio (`/nn-lab/mamba/`)

## 1. Executive Summary & Goals
This project implements the **Mamba & State Space Model (SSM) Interactive Studio** at `/nn-lab/mamba/`. Integrated into the **NN Lab** suite alongside the CNN Studio (`/nn-lab/`) and the Transformer Studio (`/nn-lab/transformer/`), this laboratory completes the deep learning architecture trifecta:
- **CNNs**: Local receptive fields, translation equivariance, $O(K \cdot N)$ compute.
- **Transformers**: Content-based dynamic attention, global receptive fields, $O(N^2)$ quadratic compute and $O(N)$ linear KV cache memory during inference.
- **State Space Models (Mamba)**: Continuous-to-discrete dynamical systems with input-dependent selection ($\Delta_t, B_t, C_t$), $O(N)$ linear training via hardware-aware parallel associative scan, and $O(1)$ constant memory & time autoregressive generation.

### Key Capabilities:
1. **Continuous-Time SSM & HiPPO Initialization**:
   Continuous linear differential equations $h'(t) = A h(t) + B x(t)$, $y(t) = C h(t) + D x(t)$ with HiPPO-Legendre matrix structure for optimal polynomial continuous memory.
2. **Zero-Order Hold (ZOH) Discretization**:
   Transformation equations $\bar{A} = \exp(\Delta A)$ and $\bar{B} = (\Delta A)^{-1}(\bar{A} - I)(\Delta B)$ with spectral stability checks ($|\lambda_i(\bar{A})| \le 1$).
3. **Mamba Selection Mechanism**:
   Input-dependent parameter generation: $B_t = \text{Linear}_B(x_t)$, $C_t = \text{Linear}_C(x_t)$, $\Delta_t = \text{Softplus}(\text{Linear}_\Delta(x_t))$, showing how $\Delta_t \to 0$ filters noise and preserves memory, while $\Delta_t \gg 0$ triggers state updates.
4. **Dual Execution Modes**:
   - *Recurrent Mode (Inference / Generation)*: Step-by-step $O(1)$ constant memory state updates $h_t = \bar{A}_t h_{t-1} + \bar{B}_t x_t$.
   - *Parallel Associative Scan Mode (Training)*: Tree visualizer demonstrating how $T$ sequence tokens are computed in $\lceil \log_2 T \rceil$ parallel steps using the associative operator $(h_t, \bar{A}_t) \circ (h_s, \bar{A}_s) = (\bar{A}_t h_s + h_t, \bar{A}_t \bar{A}_s)$.
5. **Mamba vs Transformer Scaling & Memory Benchmark**:
   Interactive slider for Sequence Length $N$ ($1\text{k} \to 128\text{k}$ tokens) contrasting Transformer's $O(N)$ KV Cache memory explosion against Mamba's $O(1)$ constant state memory.
6. **Live Modern PyTorch Code Generator**:
   Clean, executable PyTorch implementation of the selective scan loop and Mamba block with single-click clipboard copying.
7. **Four Educational Deep-Dive Accordions**:
   - *The HiPPO Matrix & Optimal Polynomial Memory*
   - *Zero-Order Hold (ZOH) Discretization & Spectral Stability*
   - *Hardware-Aware Parallel Associative Scan vs Attention*
   - *Mamba-2 & State Space Duality (SSD)*

---

## 2. Directory Structure & Module Boundaries

```
src/
├── lib/
│   ├── mambaCore.ts           # Pure TypeScript mathematical domain engine (zero DOM dependencies)
│   └── mambaCore.test.ts      # 100% Vitest unit test suite covering SSM math, ZOH, and parallel scan
├── scripts/
│   ├── mambaStudio.ts         # Client DOM controller & animation playback engine
│   └── mambaStudio.test.ts    # Vitest tests for controller state & DOM updates
└── pages/
    └── nn-lab/
        ├── index.astro        # CNN Studio (updated top navigation bar)
        ├── transformer.astro  # Transformer Studio (updated top navigation bar)
        └── mamba.astro        # Mamba & State Space Model Studio flagship page
scripts/
└── test-mamba-lab.mjs         # Playwright verification across 4 viewports (1280, 768, 375, 320)
```

---

## 3. Detailed Component Specifications

### 3.1 Mathematical Domain Engine (`src/lib/mambaCore.ts`)
Zero DOM or browser dependencies. Pure, deterministic functions:

```typescript
export interface MambaConfig {
  dModel: number;       // e.g. 16 for interactive demo, 768 / 2048 for full models
  dState: number;       // SSM state dimension N (e.g. 4 to 16)
  dConv: number;        // 1D short conv kernel size (default 4)
  expand: number;       // Block expansion factor E (default 2)
  dtRank: number;       // Rank of Delta projection (default ceil(dModel / 16))
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
  retainedRatio: number;
}

export interface SelectiveScanResult {
  outputs: number[];
  states: number[][]; // (T + 1) x N state matrix
  steps: SelectiveScanStep[];
}

export interface ParallelScanNode {
  level: number;
  stepIdx: number;
  span: [number, number];
  aProd: number;
  bSum: number;
}
```

Functions:
1. `initializeHiPPOMatrix(N: number): number[][]`
2. `discretizeZOH(A_diag: number[], B: number[], delta: number): { A_bar: number[]; B_bar: number[] }`
   - For diagonal $A \in \mathbb{R}^N$ with $A_n < 0$:
     $\bar{A}_n = \exp(\Delta A_n)$
     $\bar{B}_n = \frac{\exp(\Delta A_n) - 1}{A_n} B_n$ (with numerical Taylor expansion when $\Delta A_n \to 0$: $\Delta B_n (1 + \frac{\Delta A_n}{2})$).
3. `computeSelectiveScan(x: number[], delta: number[], B: number[][], C: number[][], A_diag: number[], D?: number): SelectiveScanResult`
4. `computeParallelAssociativeScan(x: number[], delta: number[], B: number[][], C: number[][], A_diag: number[]): { outputs: number[]; tree: ParallelScanNode[] }`
5. `calculateMambaParams(config: MambaConfig, numLayers?: number, vocabSize?: number): { inProjParams: number; convParams: number; dtProjParams: number; bProjParams: number; cProjParams: number; outProjParams: number; layerTotal: number; modelTotal: number }`
6. `calculateMambaFlops(seqLen: number, config: MambaConfig): { convFlops: number; ssmFlops: number; projFlops: number; totalLayerFlops: number }`
7. `calculateMambaMemoryBenchmark(seqLen: number, dModel: number, dState: number, numLayers: number, precisionBytes?: number): { mambaStateBytes: number; transformerKvBytes: number; ratio: string }`
8. `generateMambaPyTorchSnippet(config: MambaConfig): string`

### 3.2 Client Interactive Studio Controller (`src/scripts/mambaStudio.ts`)
1. **Lifecycle**:
   - `initMambaStudio()` auto-initializing on `DOMContentLoaded` and `astro:page-load` with teardown via `destroy()`.
   - Guarded by `window.__mambaStudioInitialized`.
2. **Interactive Recurrent Mode Visualizer**:
   - Step-by-step playback engine (Play, Pause, Step Next, Step Prev, Reset, Speed).
   - Animated **$\Delta_t$ Gate Meter**: Visual gauge showing dynamic token filtering vs state update.
   - **Latent State Vector $h_t$ Heatmap**: Visualizing latent dimensions across timesteps.
3. **Parallel Associative Scan Tree**:
   - Multi-level prefix scan tree demonstrating $O(\log N)$ parallel depth on GPU Tensor Cores.
4. **"X-Ray" State Space Inspector**:
   - Clicking any token displays the exact scalar/vector products, ZOH discretization formulas, state update, and output projection.
5. **Interactive ZOH Explorer**:
   - Slider for $\Delta$ demonstrating eigenvalue contraction inside the unit circle.
6. **Domain Presets**:
   - *NLP 1*: Selective filtering (`"The model read a long, noisy, irrelevant text until it found the secret key: 42."`).
   - *NLP 2*: Induction & Associative Recall.
   - *Genomics 1*: Distal enhancer to promoter communication (20 kb context).
   - *Genomics 2*: Splice donor (`GT`) to acceptor (`AG`) recognition.
   - *Custom*: Freeform sequence input.
7. **Mamba vs Transformer Scaling Benchmark**:
   - Slider for sequence length $N$ ($1\text{k} \to 128\text{k}$), demonstrating $O(1)$ constant generation memory vs Transformer's exploding KV cache.
8. **Live Modern PyTorch Code Generator**:
   - Real-time snippet generation with clipboard copy button.

### 3.3 Flagship Astro Page (`src/pages/nn-lab/mamba.astro`)
- `BaseLayout` (`bare={true}`).
- KaTeX equations for all SSM formulations.
- Schema.org `WebApplication` and `BreadcrumbList` JSON-LD schemas.
- Unified 3-way top navigation header (`CNN Studio`, `Transformer Studio`, `Mamba Studio`).
- 4 educational deep-dive accordions (HiPPO, ZOH stability, Parallel scan vs attention, Mamba-2 State Space Duality).
- Security allowlists registered in `scripts/audit-security.mjs`.

---

## 4. Verification & Audit Strategy
- **Unit Tests (`src/lib/mambaCore.test.ts`)**: 100% coverage of ZOH formulas, HiPPO initialization, selective scan, parallel associative scan, parameter counts, and PyTorch generator.
- **DOM Tests (`src/scripts/mambaStudio.test.ts`)**: Tests for playback stepping, mode switching, preset loading, and slider reactions.
- **Playwright Audit (`scripts/test-mamba-lab.mjs`)**: 4 viewports (1280px, 768px, 375px, 320px) with **zero horizontal overflow** and interactive workflow verification.
- **CI Gates**: `npm run check`, `npm test`, `npm run audit:security`, `npm run build`, `npm run audit:indexing`, `npm run audit:responsive`.
