import type { MorphParticle, MorphPoint } from './morphModel';
import { PROTEIN_RESIDUES, PROTEIN_SECONDARY_STRUCTURE } from '../data/morphProtein';

const TAU = Math.PI * 2;
const unit = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/** A single parametric transcript: local reversals form connected hairpins. */
export function sampleRnaBackbone(t: number, time: number, out: MorphPoint): void {
  const s = unit(t);
  const phase = s * Math.PI * 6;
  const envelope = Math.sin(s * Math.PI) ** 2;
  out.x = -0.94 + 1.88 * s + 0.15 * envelope * Math.sin(phase);
  out.y = 0.34 * Math.sin(s * Math.PI * 2) + 0.2 * envelope * Math.cos(phase);
  out.z =
    0.09 * Math.sin(phase) +
    0.012 * envelope * Math.sin((Number.isFinite(time) ? time : 0) * 0.2 + phase);
  out.alpha = 1;
}

export function sampleRnaParticle(p: MorphParticle, time: number, out: MorphPoint): void {
  sampleRnaBackbone(p.t, time, out);
  const angle = p.v * TAU;
  const radius = 0.027 * Math.sqrt(p.u);
  out.x += Math.cos(angle) * radius;
  out.y += Math.sin(angle) * radius;
  out.z += Math.sin(p.phase) * radius;
  out.alpha = 0.55 + 0.4 * p.v;
}

// Translation, a right-handed 90-degree rotation about X, and ONE uniform scale.
// Preserve the source coordinates above: no axis-wise rescaling or fold deformation.
const protein = PROTEIN_RESIDUES.map((p) => ({
  x: (p.x - 30.394) * 0.052,
  y: -(p.z - 18.393) * 0.052,
  z: (p.y - 30.3975) * 0.052,
}));

function curve(a: number, b: number, c: number, d: number, t: number): number {
  return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
}

/** Catmull–Rom interpolation passes through each experimental residue in order. */
export function sampleProteinBackbone(t: number, out: MorphPoint): void {
  const position = unit(t) * 75;
  const index = Math.min(74, Math.floor(position)),
    local = position - index;
  const a = protein[Math.max(0, index - 1)],
    b = protein[index];
  const c = protein[index + 1],
    d = protein[Math.min(75, index + 2)];
  out.x = curve(a.x, b.x, c.x, d.x, local);
  out.y = curve(a.y, b.y, c.y, d.y, local);
  out.z = curve(a.z, b.z, c.z, d.z, local);
  out.alpha = 1;
}

// Parallel-transported ribbon frames are built once, not allocated per dot/frame.
const normals = new Float64Array(76 * 3),
  binormals = new Float64Array(76 * 3);
let nx = 0,
  ny = 1,
  nz = 0;
for (let i = 0; i < 76; i++) {
  const before = protein[Math.max(0, i - 1)],
    after = protein[Math.min(75, i + 1)];
  let tx = after.x - before.x,
    ty = after.y - before.y,
    tz = after.z - before.z;
  const length = Math.hypot(tx, ty, tz);
  tx /= length;
  ty /= length;
  tz /= length;
  const dot = nx * tx + ny * ty + nz * tz;
  nx -= tx * dot;
  ny -= ty * dot;
  nz -= tz * dot;
  let normalLength = Math.hypot(nx, ny, nz);
  if (normalLength < 0.000001) {
    nx = -ty;
    ny = tx;
    nz = 0;
    normalLength = Math.hypot(nx, ny) || 1;
  }
  nx /= normalLength;
  ny /= normalLength;
  nz /= normalLength;
  normals[i * 3] = nx;
  normals[i * 3 + 1] = ny;
  normals[i * 3 + 2] = nz;
  binormals[i * 3] = ty * nz - tz * ny;
  binormals[i * 3 + 1] = tz * nx - tx * nz;
  binormals[i * 3 + 2] = tx * ny - ty * nx;
}

/** Broad sheet ribbons, helix ribbons and narrower loop tubes around the genuine fold. */
export function sampleProteinParticle(p: MorphParticle, out: MorphPoint): void {
  sampleProteinBackbone(p.t, out);
  const position = unit(p.t) * 75,
    index = Math.min(74, Math.floor(position));
  const local = position - index,
    offset = index * 3;
  const residue = position + 1;
  let width = 0.028,
    thickness = 0.022;
  for (const structure of PROTEIN_SECONDARY_STRUCTURE) {
    if (residue < structure.start || residue > structure.end) continue;
    if (structure.type === 'sheet') {
      // A small terminal flare suggests a strand arrow without changing the backbone.
      width = 0.075 + 0.025 * Math.max(0, residue - structure.end + 1);
      thickness = 0.012;
    } else {
      width = 0.06;
      thickness = 0.016;
    }
    break;
  }
  const across = (p.u * 2 - 1) * width;
  const depth = (p.v * 2 - 1) * thickness;
  out.x +=
    (normals[offset] * (1 - local) + normals[offset + 3] * local) * across +
    (binormals[offset] * (1 - local) + binormals[offset + 3] * local) * depth;
  out.y +=
    (normals[offset + 1] * (1 - local) + normals[offset + 4] * local) * across +
    (binormals[offset + 1] * (1 - local) + binormals[offset + 4] * local) * depth;
  out.z +=
    (normals[offset + 2] * (1 - local) + normals[offset + 5] * local) * across +
    (binormals[offset + 2] * (1 - local) + binormals[offset + 5] * local) * depth;
  out.alpha = 0.6 + p.v * 0.35;
}

export const NETWORK_LAYERS: readonly number[] = [4, 6, 8, 6, 3];
export const NETWORK_NODE_COUNT = 27;
const nodes: { x: number; y: number; z: number }[] = [];
const edges: (readonly [number, number])[] = [];
let first = 0;
for (let layer = 0; layer < NETWORK_LAYERS.length; layer++) {
  const count = NETWORK_LAYERS[layer];
  for (let j = 0; j < count; j++) {
    nodes.push({
      x: -0.9 + layer * 0.45,
      y: (j - (count - 1) / 2) * 0.15,
      z: 0.065 * Math.sin(layer * 1.7 + j * 0.8),
    });
    if (layer < 4) {
      const next = NETWORK_LAYERS[layer + 1];
      const target = Math.floor((j * next) / count);
      edges.push(
        [first + j, first + count + target],
        [first + j, first + count + ((target + 1) % next)]
      );
    }
  }
  first += count;
}
export const NETWORK_EDGES: readonly (readonly [number, number])[] = edges;

export function sampleNetworkNode(index: number, out: MorphPoint): void {
  const n = nodes[((Math.floor(Number.isFinite(index) ? index : 0) % 27) + 27) % 27];
  out.x = n.x;
  out.y = n.y;
  out.z = n.z;
  out.alpha = 1;
}

export function sampleNetworkEdge(index: number, t: number, out: MorphPoint): void {
  const edge =
    edges[
      ((Math.floor(Number.isFinite(index) ? index : 0) % edges.length) + edges.length) %
        edges.length
    ];
  const a = nodes[edge[0]],
    b = nodes[edge[1]],
    blend = unit(t);
  out.x = a.x * (1 - blend) + b.x * blend;
  out.y = a.y * (1 - blend) + b.y * blend;
  out.z = a.z * (1 - blend) + b.z * blend;
  out.alpha = 1;
}

export function sampleNetworkParticle(p: MorphParticle, out: MorphPoint): void {
  const cloud = p.u < 0.48;
  if (cloud) sampleNetworkNode(Math.min(26, Math.floor(p.t * 27)), out);
  else sampleNetworkEdge(Math.min(edges.length - 1, Math.floor(p.t * edges.length)), p.v, out);
  const radius = cloud ? 0.045 * Math.cbrt(p.u / 0.48) : 0.006;
  out.x += Math.cos(p.phase) * radius;
  out.y += Math.sin(p.phase) * radius;
  out.z += (p.v * 2 - 1) * radius;
  out.alpha = cloud ? 0.72 + p.v * 0.25 : 0.25 + p.u * 0.23;
}

export function normalDensity(x: number): number {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}

/** Standardized response [-3.5,3.5] -> drawing X [-1,1]; density, not measured uncertainty. */
export function sampleDistributionParticle(p: MorphParticle, out: MorphPoint): void {
  const ridge = p.role === 'chromatin';
  out.x = -1 + unit(p.t) * 2;
  out.y = 0.33 - normalDensity(out.x * 3.5) * 1.85 * (ridge ? 0.97 + p.u * 0.03 : p.u);
  out.z = 0;
  out.alpha = ridge ? 0.9 : 0.27 + p.v * 0.22;
}
