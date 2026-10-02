import { expect, it } from 'vitest';
import * as targets from './morphTargets';
import { createMorphParticles, type MorphPoint } from './morphModel';
const point = (): MorphPoint => ({ x: 0, y: 0, z: 0, alpha: 1 });

it('exposes a continuous single-transcript RNA target', async () => {
  const targets = await import('./morphTargets');
  const start = { x: 0, y: 0, z: 0, alpha: 1 };
  const end = { ...start };
  targets.sampleRnaBackbone(0, 0, start);
  targets.sampleRnaBackbone(1, 0, end);
  expect(start.x).toBeLessThan(-0.8);
  expect(end.x).toBeGreaterThan(0.8);
});

it('bundles all 76 unchanged chain-A C-alpha records with source secondary structure', async () => {
  const { PROTEIN_RESIDUES, PROTEIN_SECONDARY_STRUCTURE, PROTEIN_SOURCE } =
    await import('../data/morphProtein');
  expect(PROTEIN_SOURCE).toMatchObject({
    entry: '1UBQ',
    chain: 'A',
    license: 'CC0',
    url: 'https://files.rcsb.org/download/1UBQ.pdb',
    extractionDate: '2026-10-01',
    sha256: 'd4a6812d8951cf6594e6a0763f089e35f5a80b62acb3c117b2c5565228a7b161',
  });
  expect(PROTEIN_RESIDUES).toHaveLength(76);
  expect(PROTEIN_RESIDUES[0]).toEqual({ residue: 1, name: 'MET', x: 26.266, y: 25.413, z: 2.842 });
  expect(PROTEIN_RESIDUES[75]).toEqual({
    residue: 76,
    name: 'GLY',
    x: 40.373,
    y: 39.813,
    z: 33.944,
  });
  expect(PROTEIN_SECONDARY_STRUCTURE).toEqual([
    { type: 'helix', start: 23, end: 34, helixClass: 1 },
    { type: 'helix', start: 56, end: 59, helixClass: 5 },
    { type: 'sheet', start: 10, end: 17, sense: 0 },
    { type: 'sheet', start: 1, end: 7, sense: -1 },
    { type: 'sheet', start: 64, end: 72, sense: 1 },
    { type: 'sheet', start: 40, end: 45, sense: -1 },
    { type: 'sheet', start: 48, end: 50, sense: -1 },
  ]);
});

it('draws the experimental fold with a rigid orientation and a single uniform scale', async () => {
  const { PROTEIN_RESIDUES } = await import('../data/morphProtein');
  const a = point(),
    b = point();
  targets.sampleProteinBackbone(0, a);
  targets.sampleProteinBackbone(1 / 75, b);
  const rawDistance = Math.hypot(0.584, 3.608, 1.056);
  const scale = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / rawDistance;
  expect(scale).toBeGreaterThan(0);
  for (let i = 0; i < 76; i++) {
    targets.sampleProteinBackbone(i / 75, a);
    targets.sampleProteinBackbone(((i + 37) % 76) / 75, b);
    const raw = PROTEIN_RESIDUES[i],
      other = PROTEIN_RESIDUES[(i + 37) % 76];
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeCloseTo(
      scale * Math.hypot(raw.x - other.x, raw.y - other.y, raw.z - other.z),
      10
    );
  }
  for (let t = 0; t <= 1; t += 0.001) {
    targets.sampleProteinBackbone(t, a);
    targets.sampleProteinBackbone(t + 0.000001, b);
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.0001);
  }
});

it('fills every new form deterministically with bounded material and finite ribbon frames', () => {
  const out = point(),
    again = point();
  const samplers = [
    (p: ReturnType<typeof createMorphParticles>[number], out: MorphPoint) =>
      targets.sampleRnaParticle(p, 3, out),
    targets.sampleProteinParticle,
    targets.sampleNetworkParticle,
    targets.sampleDistributionParticle,
  ];
  const centers: number[][] = [];
  for (const sampler of samplers) {
    let x = 0,
      y = 0,
      z = 0,
      xx = 0,
      yy = 0;
    for (const p of createMorphParticles(1600)) {
      sampler(p, out);
      sampler(p, again);
      expect(again).toEqual(out);
      expect(out.alpha).toBeGreaterThan(0.1);
      expect(out.alpha).toBeLessThanOrEqual(1);
      expect([out.x, out.y, out.z].every(Number.isFinite)).toBe(true);
      expect(Math.max(Math.abs(out.x), Math.abs(out.y), Math.abs(out.z))).toBeLessThan(1.3);
      x += out.x;
      y += out.y;
      z += out.z;
      xx += out.x * out.x;
      yy += out.y * out.y;
    }
    centers.push([x / 1600, y / 1600, z / 1600, xx / 1600, yy / 1600]);
  }
  for (let i = 0; i < centers.length; i++)
    for (let j = i + 1; j < centers.length; j++)
      expect(Math.hypot(...centers[i].map((value, k) => value - centers[j][k]))).toBeGreaterThan(
        0.03
      );
});

it('uses five node layers and sparse adjacent-only connections that reach every node', () => {
  expect(targets.NETWORK_LAYERS).toEqual([4, 6, 8, 6, 3]);
  expect(targets.NETWORK_NODE_COUNT).toBe(27);
  const layer = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4];
  const connected = new Set<number>();
  const a = point(),
    b = point(),
    edge = point();
  expect(targets.NETWORK_EDGES.length).toBeLessThan(144);
  targets.NETWORK_EDGES.forEach(([from, to], index) => {
    expect(layer[to] - layer[from]).toBe(1);
    connected.add(from);
    connected.add(to);
    targets.sampleNetworkNode(from, a);
    targets.sampleNetworkNode(to, b);
    targets.sampleNetworkEdge(index, 0, edge);
    expect(edge).toEqual(a);
    targets.sampleNetworkEdge(index, 1, edge);
    expect(edge).toEqual(b);
    targets.sampleNetworkEdge(index, 0.5, edge);
    expect(edge.x).toBeCloseTo((a.x + b.x) / 2, 12);
    expect(edge.y).toBeCloseTo((a.y + b.y) / 2, 12);
  });
  expect(connected.size).toBe(27);
});

it('has one positive symmetric normalized standard-normal density, not an expression signal', () => {
  expect(targets.normalDensity(0)).toBeCloseTo(0.3989422804014327, 12);
  expect(targets.normalDensity(1)).toBeCloseTo(0.24197072451914337, 12);
  let area = 0;
  for (let x = -8; x < 8; x += 0.001) area += targets.normalDensity(x + 0.0005) * 0.001;
  expect(area).toBeCloseTo(1, 6);
  for (let x = 0; x <= 3.5; x += 0.01) {
    expect(targets.normalDensity(x)).toBeGreaterThan(0);
    expect(targets.normalDensity(x)).toBe(targets.normalDensity(-x));
    expect(targets.normalDensity(x + 0.01)).toBeLessThan(targets.normalDensity(x));
  }
  const out = point();
  const p = createMorphParticles(100).at(-1)!;
  targets.sampleDistributionParticle({ ...p, t: 0, u: 0 }, out);
  expect(out.x).toBe(-1);
  expect(out.y).toBeCloseTo(0.33, 12);
  expect(out.z).toBe(0);
  targets.sampleDistributionParticle({ ...p, t: 1, u: 0 }, out);
  expect(out.x).toBe(1);
  targets.sampleDistributionParticle({ ...p, t: 0.5, u: 1 }, out);
  expect(out.y).toBeLessThan(-0.3);
});
