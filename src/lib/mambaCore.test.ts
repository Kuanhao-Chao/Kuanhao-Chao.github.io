import { describe, expect, it } from 'vitest';
import {
  calculateMambaFlops,
  calculateMambaMemoryBenchmark,
  calculateMambaParams,
  computeParallelAssociativeScan,
  computeSelectiveScan,
  discretizeZOH,
  formatBytes,
  generateMambaPyTorchSnippet,
  initializeDiagonalA,
  initializeHiPPOMatrix,
  type MambaConfig,
} from './mambaCore';

describe('Mamba Core: HiPPO and Diagonal A Initialization', () => {
  it('initializes continuous HiPPO-Legendre matrix with correct lower-triangular structure', () => {
    const N = 4;
    const A = initializeHiPPOMatrix(N);

    expect(A.length).toBe(4);
    for (let i = 0; i < N; i++) {
      expect(A[i].length).toBe(4);
    }

    // Diagonal elements: -(n + 1)
    expect(A[0][0]).toBe(-1);
    expect(A[1][1]).toBe(-2);
    expect(A[2][2]).toBe(-3);
    expect(A[3][3]).toBe(-4);

    // Upper triangular: strictly 0
    expect(A[0][1]).toBe(0);
    expect(A[0][2]).toBe(0);
    expect(A[0][3]).toBe(0);
    expect(A[1][2]).toBe(0);
    expect(A[1][3]).toBe(0);
    expect(A[2][3]).toBe(0);

    // Lower triangular: -sqrt(2n + 1) * sqrt(2k + 1)
    // A[1][0] = -sqrt(3) * sqrt(1) = -sqrt(3)
    expect(A[1][0]).toBeCloseTo(-Math.sqrt(3), 5);
    // A[2][0] = -sqrt(5) * sqrt(1) = -sqrt(5)
    expect(A[2][0]).toBeCloseTo(-Math.sqrt(5), 5);
    // A[2][1] = -sqrt(5) * sqrt(3) = -Math.sqrt(15)
    expect(A[2][1]).toBeCloseTo(-Math.sqrt(15), 5);
    // A[3][0] = -sqrt(7) * sqrt(1) = -sqrt(7)
    expect(A[3][0]).toBeCloseTo(-Math.sqrt(7), 5);
  });

  it('initializes diagonal A vector with negative components -(n + 1)', () => {
    const N = 6;
    const diagA = initializeDiagonalA(N);

    expect(diagA.length).toBe(6);
    expect(diagA).toEqual([-1, -2, -3, -4, -5, -6]);
    // All eigenvalues must be negative for system stability
    diagA.forEach((val) => {
      expect(val).toBeLessThan(0);
    });
  });

  it('handles edge cases in HiPPO and diagonal initialization', () => {
    expect(initializeHiPPOMatrix(0)).toEqual([]);
    expect(initializeHiPPOMatrix(-3)).toEqual([]);
    expect(initializeDiagonalA(0)).toEqual([]);
    expect(initializeDiagonalA(-2)).toEqual([]);

    const singleHiPPO = initializeHiPPOMatrix(1);
    expect(singleHiPPO).toEqual([[-1]]);
    expect(initializeDiagonalA(1)).toEqual([-1]);
  });
});

describe('Mamba Core: Zero-Order Hold (ZOH) Discretization', () => {
  it('computes ZOH discretization with spectral radius strictly inside unit circle (0, 1)', () => {
    const A_diag = [-1, -2, -3, -4];
    const B = [1, 1, 1, 1];
    const delta = 0.5;

    const { A_bar, B_bar } = discretizeZOH(A_diag, B, delta);

    expect(A_bar.length).toBe(4);
    expect(B_bar.length).toBe(4);

    // A_bar_n = exp(delta * A_n)
    expect(A_bar[0]).toBeCloseTo(Math.exp(-0.5), 6);
    expect(A_bar[1]).toBeCloseTo(Math.exp(-1.0), 6);
    expect(A_bar[2]).toBeCloseTo(Math.exp(-1.5), 6);
    expect(A_bar[3]).toBeCloseTo(Math.exp(-2.0), 6);

    // Spectral radius check: all A_bar must be in (0, 1)
    A_bar.forEach((a) => {
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(1);
    });

    // B_bar_n = (exp(delta * A_n) - 1) / A_n * B_n
    expect(B_bar[0]).toBeCloseTo(((Math.exp(-0.5) - 1) / -1) * 1, 6);
    expect(B_bar[1]).toBeCloseTo(((Math.exp(-1.0) - 1) / -2) * 1, 6);
  });

  it('demonstrates that larger delta contracts A_bar more strongly towards 0', () => {
    const A_diag = [-2];
    const B = [1];

    const smallDelta = discretizeZOH(A_diag, B, 0.01);
    const medDelta = discretizeZOH(A_diag, B, 0.5);
    const largeDelta = discretizeZOH(A_diag, B, 5.0);

    expect(smallDelta.A_bar[0]).toBeGreaterThan(medDelta.A_bar[0]);
    expect(medDelta.A_bar[0]).toBeGreaterThan(largeDelta.A_bar[0]);
    expect(largeDelta.A_bar[0]).toBeCloseTo(0, 3);
  });

  it('uses Taylor series expansion for tiny delta to maintain numerical precision without NaN', () => {
    const A_diag = [-2, -4];
    const B = [3, 5];
    const tinyDelta = 1e-7;

    const { A_bar, B_bar } = discretizeZOH(A_diag, B, tinyDelta);

    expect(Number.isNaN(A_bar[0])).toBe(false);
    expect(Number.isNaN(B_bar[0])).toBe(false);
    expect(Number.isFinite(B_bar[0])).toBe(true);
    expect(Number.isFinite(B_bar[1])).toBe(true);

    // For tiny delta, B_bar_n approx delta * B_n
    expect(B_bar[0]).toBeCloseTo(tinyDelta * 3, 10);
    expect(B_bar[1]).toBeCloseTo(tinyDelta * 5, 10);
    expect(A_bar[0]).toBeCloseTo(1 - tinyDelta * 2, 10);
  });

  it('handles zero or empty inputs gracefully', () => {
    const emptyRes = discretizeZOH([], [], 0.1);
    expect(emptyRes.A_bar).toEqual([]);
    expect(emptyRes.B_bar).toEqual([]);

    // Zero delta: exp(0) = 1, B_bar = 0
    const zeroDeltaRes = discretizeZOH([-1, -2], [1, 2], 0);
    expect(zeroDeltaRes.A_bar).toEqual([1, 1]);
    expect(zeroDeltaRes.B_bar).toEqual([0, 0]);
  });
});

describe('Mamba Core: computeSelectiveScan (Sequential Recurrence)', () => {
  it('computes sequential scan step-by-step and matches recurrent dynamical system', () => {
    const x = [1.0, 2.0, -1.0];
    const delta = [0.2, 0.5, 0.1];
    const A_diag = [-1.0, -2.0];
    const B = [
      [1.0, 0.5],
      [0.8, 0.2],
      [1.2, 0.6],
    ];
    const C = [
      [0.5, 0.5],
      [1.0, -0.5],
      [0.2, 0.8],
    ];
    const D = 0.1;
    const tokens = ['tok0', 'tok1', 'tok2'];

    const result = computeSelectiveScan(x, delta, B, C, A_diag, D, tokens);

    // Sequence length is 3 -> 3 outputs, 4 states (including initial h_0), 3 steps
    expect(result.outputs.length).toBe(3);
    expect(result.states.length).toBe(4);
    expect(result.steps.length).toBe(3);

    // Initial state is all zeros
    expect(result.states[0]).toEqual([0, 0]);

    // Manual step 0 verification:
    // delta = 0.2, x = 1.0, B = [1.0, 0.5], A_diag = [-1.0, -2.0]
    const zoh0 = discretizeZOH(A_diag, B[0], delta[0]);
    const expected_h1 = [
      zoh0.A_bar[0] * 0 + zoh0.B_bar[0] * 1.0,
      zoh0.A_bar[1] * 0 + zoh0.B_bar[1] * 1.0,
    ];
    expect(result.states[1][0]).toBeCloseTo(expected_h1[0], 6);
    expect(result.states[1][1]).toBeCloseTo(expected_h1[1], 6);

    const expected_y0 =
      C[0][0] * expected_h1[0] + C[0][1] * expected_h1[1] + D * x[0];
    expect(result.outputs[0]).toBeCloseTo(expected_y0, 6);

    // Step detail verification
    expect(result.steps[0].token).toBe('tok0');
    expect(result.steps[0].step).toBe(0);
    expect(result.steps[0].xVal).toBe(1.0);
    expect(result.steps[0].hPrev).toEqual([0, 0]);
    expect(result.steps[0].hNext[0]).toBeCloseTo(expected_h1[0], 6);
    expect(result.steps[0].yVal).toBeCloseTo(expected_y0, 6);
    expect(result.steps[0].retainedRatio).toBeCloseTo(1 - delta[0], 6);
  });

  it('demonstrates selective memory retention: tiny delta retains state, large delta flushes state', () => {
    // We prime the state with an important signal at t=0, then send a distracter at t=1
    const A_diag = [-1.0, -1.0];
    const B = [
      [1.0, 1.0],
      [1.0, 1.0],
    ];
    const C = [
      [1.0, 0.0],
      [1.0, 0.0],
    ];

    // Case 1: Filter noise (tiny delta at t=1: delta = 0.0001)
    const resFiltered = computeSelectiveScan(
      [10.0, 999.0],
      [1.0, 0.0001],
      B,
      C,
      A_diag,
      0
    );

    // Case 2: Accept noise (large delta at t=1: delta = 2.0)
    const resOverwritten = computeSelectiveScan(
      [10.0, 999.0],
      [1.0, 2.0],
      B,
      C,
      A_diag,
      0
    );

    // In filtered case, h1 should retain the effect of t=0 and barely be altered by 999.0
    // At t=0, h[0] becomes B_bar * 10
    const h0_filtered = resFiltered.states[1][0];
    const h1_filtered = resFiltered.states[2][0];
    // With delta = 0.0001, A_bar approx 0.9999, B_bar approx 0.0001 -> new term is 999 * 0.0001 approx 0.1
    expect(h1_filtered).toBeCloseTo(h0_filtered * 0.9999 + 999 * 0.0001, 1);

    // In overwritten case, delta=2.0 -> A_bar approx exp(-2) = 0.135 -> prior state strongly decayed
    const h1_overwritten = resOverwritten.states[2][0];
    expect(h1_overwritten).toBeGreaterThan(500); // 999 dominates the new state
  });

  it('handles empty input sequence', () => {
    const res = computeSelectiveScan([], [], [], [], [-1, -2]);
    expect(res.outputs).toEqual([]);
    expect(res.states).toEqual([[0, 0]]);
    expect(res.steps).toEqual([]);
  });
});

describe('Mamba Core: computeParallelAssociativeScan', () => {
  it('produces outputs mathematically equivalent to sequential scan within numeric tolerance', () => {
    const seqLen = 8;
    const dState = 4;
    const A_diag = initializeDiagonalA(dState);

    // Generate deterministic test inputs
    const x: number[] = [];
    const delta: number[] = [];
    const B: number[][] = [];
    const C: number[][] = [];

    for (let t = 0; t < seqLen; t++) {
      x.push(Math.sin(t + 1));
      delta.push(0.1 + 0.15 * Math.cos(t));
      const bRow: number[] = [];
      const cRow: number[] = [];
      for (let n = 0; n < dState; n++) {
        bRow.push(Math.cos(t * n + 0.5));
        cRow.push(Math.sin(t * (n + 1)));
      }
      B.push(bRow);
      C.push(cRow);
    }

    const seqResult = computeSelectiveScan(x, delta, B, C, A_diag, 0);
    const parResult = computeParallelAssociativeScan(x, delta, B, C, A_diag);

    expect(parResult.outputs.length).toBe(seqLen);

    for (let t = 0; t < seqLen; t++) {
      expect(parResult.outputs[t]).toBeCloseTo(seqResult.outputs[t], 5);
    }
  });

  it('builds a multi-level parallel prefix tree with correct spans and levels', () => {
    const seqLen = 4;
    const dState = 2;
    const A_diag = [-1.0, -2.0];
    const x = [1.0, 2.0, 3.0, 4.0];
    const delta = [0.2, 0.3, 0.4, 0.5];
    const B = [
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
    ];
    const C = [
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
    ];

    const { outputs, tree } = computeParallelAssociativeScan(x, delta, B, C, A_diag);

    expect(outputs.length).toBe(4);
    expect(tree.length).toBeGreaterThan(0);

    // Levels: log2(4) = 2 -> levels 0, 1, 2
    const level0Nodes = tree.filter((node) => node.level === 0);
    expect(level0Nodes.length).toBe(4);
    for (let t = 0; t < 4; t++) {
      expect(level0Nodes[t].stepIdx).toBe(t);
      expect(level0Nodes[t].span).toEqual([t, t]);
      expect(level0Nodes[t].aProd.length).toBe(dState);
      expect(level0Nodes[t].bSum.length).toBe(dState);
    }

    // Top level nodes must span from 0 to t
    const maxLevel = Math.max(...tree.map((n) => n.level));
    expect(maxLevel).toBe(2);
    const topLevelNodes = tree.filter((node) => node.level === maxLevel);
    const finalNode = topLevelNodes.find((n) => n.stepIdx === 3);
    expect(finalNode).toBeDefined();
    expect(finalNode?.span).toEqual([0, 3]);
  });

  it('handles length-1 and length-0 sequences in parallel scan', () => {
    const emptyScan = computeParallelAssociativeScan([], [], [], [], [-1]);
    expect(emptyScan.outputs).toEqual([]);
    expect(emptyScan.tree).toEqual([]);

    const singleScan = computeParallelAssociativeScan(
      [2.5],
      [0.4],
      [[1.0, 2.0]],
      [[0.5, 0.5]],
      [-1.0, -2.0]
    );
    expect(singleScan.outputs.length).toBe(1);
    expect(singleScan.tree.length).toBe(1);
    expect(singleScan.tree[0].span).toEqual([0, 0]);

    const seqSingle = computeSelectiveScan(
      [2.5],
      [0.4],
      [[1.0, 2.0]],
      [[0.5, 0.5]],
      [-1.0, -2.0]
    );
    expect(singleScan.outputs[0]).toBeCloseTo(seqSingle.outputs[0], 6);
  });
});

describe('Mamba Core: calculateMambaParams', () => {
  const baseConfig: MambaConfig = {
    dModel: 64,
    dState: 16,
    dConv: 4,
    expand: 2,
    dtRank: 4,
  };

  it('computes exact parameter counts for each sub-projection in a Mamba layer', () => {
    // dModel = 64, expand = 2 -> D = 128
    // inProjParams: dModel * 2D = 64 * 256 = 16,384
    // convParams: D * dConv = 128 * 4 = 512
    // dtProjParams: dModel * dtRank + dtRank * D = 64 * 4 + 4 * 128 = 256 + 512 = 768
    // bProjParams: dModel * dState = 64 * 16 = 1,024
    // cProjParams: dModel * dState = 64 * 16 = 1,024
    // outProjParams: D * dModel = 128 * 64 = 8,192
    // layerTotal: 16384 + 512 + 768 + 1024 + 1024 + 8192 = 27,904

    const params = calculateMambaParams(baseConfig, 1, 0);

    expect(params.inProjParams).toBe(16384);
    expect(params.convParams).toBe(512);
    expect(params.dtProjParams).toBe(768);
    expect(params.bProjParams).toBe(1024);
    expect(params.cProjParams).toBe(1024);
    expect(params.outProjParams).toBe(8192);
    expect(params.layerTotal).toBe(27904);
    expect(params.modelTotal).toBe(27904);
  });

  it('scales model total across multiple layers and includes vocabulary embeddings', () => {
    const numLayers = 12;
    const vocabSize = 1000;
    const params = calculateMambaParams(baseConfig, numLayers, vocabSize);

    expect(params.layerTotal).toBe(27904);
    // modelTotal = 27904 * 12 + 1000 * 64 = 334848 + 64000 = 398848
    expect(params.modelTotal).toBe(27904 * 12 + 1000 * 64);
  });

  it('defaults dtRank to ceil(dModel / 16) if not specified or 0', () => {
    const cfg: MambaConfig = {
      dModel: 64,
      dState: 16,
      dConv: 4,
      expand: 2,
      dtRank: 0,
    };
    const params = calculateMambaParams(cfg, 1);
    // default dtRank = ceil(64 / 16) = 4
    expect(params.dtProjParams).toBe(64 * 4 + 4 * 128);
  });
});

describe('Mamba Core: calculateMambaFlops', () => {
  const cfg: MambaConfig = {
    dModel: 64,
    dState: 16,
    dConv: 4,
    expand: 2,
    dtRank: 4,
  };

  it('calculates FLOPs per layer with strictly linear sequence scaling O(N)', () => {
    const flops1k = calculateMambaFlops(1000, cfg);
    const flops2k = calculateMambaFlops(2000, cfg);

    // FLOPs must double exactly when sequence length doubles
    expect(flops2k.totalLayerFlops).toBe(flops1k.totalLayerFlops * 2);
    expect(flops2k.inProjFlops).toBe(flops1k.inProjFlops * 2);
    expect(flops2k.convFlops).toBe(flops1k.convFlops * 2);
    expect(flops2k.ssmFlops).toBe(flops1k.ssmFlops * 2);
    expect(flops2k.gateFlops).toBe(flops1k.gateFlops * 2);
    expect(flops2k.outProjFlops).toBe(flops1k.outProjFlops * 2);

    // Exact values for N = 1000:
    // D = 128
    // inProjFlops: 2 * 1000 * (2 * 128 * 64) = 32,768,000
    expect(flops1k.inProjFlops).toBe(2 * 1000 * (2 * 128 * 64));
    // convFlops: 2 * 1000 * 128 * 4 = 1,024,000
    expect(flops1k.convFlops).toBe(2 * 1000 * 128 * 4);
    // ssmFlops: 2 * 1000 * (128 * 16 * 3) = 12,288,000
    expect(flops1k.ssmFlops).toBe(2 * 1000 * (128 * 16 * 3));
    // gateFlops: 1000 * 128 = 128,000
    expect(flops1k.gateFlops).toBe(1000 * 128);
    // outProjFlops: 2 * 1000 * 128 * 64 = 16,384,000
    expect(flops1k.outProjFlops).toBe(2 * 1000 * 128 * 64);
    // sum: 32768000 + 1024000 + 12288000 + 128000 + 16384000 = 62,592,000
    expect(flops1k.totalLayerFlops).toBe(62592000);
  });

  it('returns 0 for non-positive sequence length', () => {
    const res = calculateMambaFlops(0, cfg);
    expect(res.totalLayerFlops).toBe(0);
    expect(res.inProjFlops).toBe(0);
  });
});

describe('Mamba Core: calculateMambaMemoryBenchmark', () => {
  it('demonstrates constant O(1) Mamba generation memory vs linear O(N) Transformer KV cache', () => {
    const dModel = 768;
    const dState = 16;
    const numLayers = 24;
    const precisionBytes = 2; // FP16

    const bm1k = calculateMambaMemoryBenchmark(1000, dModel, dState, numLayers, precisionBytes);
    const bm16k = calculateMambaMemoryBenchmark(16000, dModel, dState, numLayers, precisionBytes);
    const bm128k = calculateMambaMemoryBenchmark(128000, dModel, dState, numLayers, precisionBytes);

    // Mamba state memory MUST remain strictly invariant with sequence length:
    // numLayers * dModel * dState * precisionBytes = 24 * 768 * 16 * 2 = 589,824 bytes (576 KB)
    expect(bm1k.mambaStateBytes).toBe(589824);
    expect(bm16k.mambaStateBytes).toBe(589824);
    expect(bm128k.mambaStateBytes).toBe(589824);

    // Transformer KV cache scales linearly:
    // 2 * numLayers * seqLen * dModel * precisionBytes
    expect(bm1k.transformerKvBytes).toBe(2 * 24 * 1000 * 768 * 2); // 73,728,000 (~70.31 MB)
    expect(bm16k.transformerKvBytes).toBe(bm1k.transformerKvBytes * 16);
    expect(bm128k.transformerKvBytes).toBe(bm1k.transformerKvBytes * 128); // ~9.00 GB

    // Ratio string checks
    expect(bm128k.ratio).toMatch(/x$/);
    expect(parseFloat(bm128k.ratio)).toBeGreaterThan(10000); // Over 10,000x smaller memory footprint
  });

  it('formats byte strings accurately', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
  });
});

describe('Mamba Core: generateMambaPyTorchSnippet', () => {
  it('generates a clean, executable PyTorch snippet containing selective scan and MambaBlock', () => {
    const config: MambaConfig = {
      dModel: 64,
      dState: 16,
      dConv: 4,
      expand: 2,
      dtRank: 4,
    };

    const code = generateMambaPyTorchSnippet(config);

    expect(code).toContain('import torch');
    expect(code).toContain('import torch.nn as nn');
    expect(code).toContain('import torch.nn.functional as F');
    expect(code).toContain('def selective_scan');
    expect(code).toContain('d_model: int = 64');
    expect(code).toContain('d_state: int = 16');
    expect(code).toContain('d_conv: int = 4');
    expect(code).toContain('expand: int = 2');
    expect(code).toContain('dt_rank: int = 4');
    expect(code).toContain('self.d_model = d_model');
    expect(code).toContain('self.d_state = d_state');
    expect(code).toContain('self.d_conv = d_conv');
    expect(code).toContain('self.expand = expand');
    expect(code).toContain('self.dt_rank = dt_rank');
    expect(code).toContain('nn.Conv1d');
    expect(code).toContain('nn.SiLU()');
  });
});
