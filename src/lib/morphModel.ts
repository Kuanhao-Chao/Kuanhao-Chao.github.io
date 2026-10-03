/** Deterministic, representative anatomy for the Sequence → Function illustration. */
import {
  finiteProgress,
  MORPH_STAGES,
  smootherstep,
  stageWeight,
  type MorphStageId,
} from './morphStory';
import {
  sampleProteinParticle,
  sampleNetworkParticle,
  sampleDistributionParticle,
} from './morphTargets';
import { sampleRnaParticle } from './morphSplice';
export { storyProgress, playbackProgress, playbackTime } from './morphStory';

export interface MorphPoint {
  x: number;
  y: number;
  z: number;
  alpha: number;
}
export const MORPH_ROLES = [
  'chromatin',
  'membrane',
  'nucleus',
  'nucleolus',
  'mitochondria',
  'er',
  'cytoplasm',
] as const;
export type MorphRole = (typeof MORPH_ROLES)[number];
export interface MorphAnchor {
  role: MorphRole;
  t: number;
  variant: number;
  rank: number;
}
export interface MorphParticle extends MorphAnchor {
  /** Independent, deterministic coordinates: never regenerated while scrolling. */
  u: number;
  v: number;
  size: number;
  phase: number;
}
export const TAU = Math.PI * 2;
export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}
export function cellRadius(theta: number, time = 0): number {
  return (
    0.84 +
    0.045 * Math.sin(3 * theta + 0.4) +
    0.03 * Math.sin(5 * theta - 0.8) +
    0.006 * Math.sin(2 * theta + time * 0.32)
  );
}
export const MITOCHONDRIA = [
  { x: 0.43, y: -0.23, angle: -0.5, size: 1 },
  { x: 0.38, y: 0.32, angle: 0.4, size: 0.88 },
  { x: -0.48, y: 0.19, angle: -0.9, size: 0.8 },
] as const;

// Integer mixing avoids the diagonal bands produced by correlated low-discrepancy axes.
function coordinate(seed: number): number {
  let n = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function createMorphParticles(count: number): MorphParticle[] {
  const n = Math.max(100, Math.floor(Number.isFinite(count) ? count : 300));
  const weights = [0.24, 0.22, 0.08, 0.03, 0.14, 0.11, 0.18];
  const particles: MorphParticle[] = [];
  MORPH_ROLES.forEach((role, group) => {
    const size =
      group === MORPH_ROLES.length - 1 ? n - particles.length : Math.floor(n * weights[group]);
    for (let j = 0; j < size; j++) {
      const variants = role === 'mitochondria' ? 3 : role === 'chromatin' ? 2 : 1;
      particles.push({
        role,
        t: (Math.floor(j / variants) + 0.5) / Math.ceil(size / variants),
        variant: j % variants,
        rank: (j * 0.61803398875) % 1,
        u: coordinate(j + 1 + group * 1327),
        v: coordinate(j + 19391 + group * 3251),
        size: 0.65 + coordinate(j + 7307 + group * 829) * 0.8,
        phase: coordinate(j + 3313 + group * 2017) * TAU,
      });
    }
  });
  return particles;
}
/** Sample within every anatomical group when reducing quality. */
export const visibleParticle = (particle: MorphParticle, quality: number) =>
  particle.rank < Math.max(0.3, quality);

/** A 400ms quality crossfade, independent of geometry or animation progress. */
export function particleVisibility(
  particle: MorphParticle,
  from: number,
  to: number,
  blend: number
) {
  const a = visibleParticle(particle, from) ? 1 : 0;
  const b = visibleParticle(particle, to) ? 1 : 0;
  return a + (b - a) * smoothstep(blend);
}

/** Original decorative stream geometry, separate from the representative anatomy. */
export function sampleMorphAtmosphere(
  index: number,
  count: number,
  progress: number,
  time: number,
  out: MorphPoint
): void {
  progress = finiteProgress(progress);
  time = Number.isFinite(time) ? time : 0;
  const t = (index + 0.5) / Math.max(1, count);
  const strand = index % 3;
  const phase = t * TAU * 2.4 + (strand * TAU) / 3 + time * 0.055;
  const cell = smoothstep(progress * 2);
  const angle = t * TAU * 2 + (strand * TAU) / 3 + time * 0.035;
  const radius = 0.98 + 0.1 * Math.sin(t * TAU * 5 + time * 0.09);
  const dx = -1.1 + 2.2 * t,
    dy = 0.37 * Math.cos(phase),
    dz = 0.32 * Math.sin(phase);
  out.x = dx + (radius * Math.cos(angle) - dx) * cell;
  out.y = dy + (radius * 0.67 * Math.sin(angle) - dy) * cell;
  out.z = dz + (0.25 * Math.sin(angle * 1.5 + strand) - dz) * cell;
  const molecular =
    stageWeight(progress, 'dna') +
    stageWeight(progress, 'rna') +
    stageWeight(progress, 'protein') +
    stageWeight(progress, 'cell');
  out.alpha =
    (0.04 + 0.04 * Math.sin(phase * 0.7) ** 2) *
    (molecular + 0.65 * stageWeight(progress, 'network'));
}

/** Bounded local response. No effect outside the pointer's small influence area. */
export function morphPointerFalloff(distance: number, radius: number): number {
  return smoothstep(1 - distance / Math.max(1, radius));
}

/** Rotation without translating the subject or changing its scale. */
export function rotateMorphPoint(out: MorphPoint, yaw: number, pitch: number): void {
  const x = out.x * Math.cos(yaw) + out.z * Math.sin(yaw);
  const z = out.z * Math.cos(yaw) - out.x * Math.sin(yaw);
  const y = out.y * Math.cos(pitch) - z * Math.sin(pitch);
  out.z = z * Math.cos(pitch) + out.y * Math.sin(pitch);
  out.x = x;
  out.y = y;
}

export function sampleDna(t: number, strand: number, time: number, out: MorphPoint): void {
  const phase = t * TAU * 2.4 + strand * Math.PI + (time * TAU) / 45;
  out.x = -0.98 + t * 1.96;
  out.y = Math.cos(phase) * 0.24;
  out.z = Math.sin(phase) * 0.24;
  out.alpha = 1;
}
export function sampleMito(
  t: number,
  variant: number,
  time: number,
  crista: boolean,
  out: MorphPoint
): void {
  const m = MITOCHONDRIA[variant % 3];
  const angle = m.angle + 0.025 * Math.sin(time * 0.22 + variant);
  const x = crista ? (t * 2 - 1) * 0.12 : Math.cos(t * TAU) * 0.15;
  const y = crista
    ? 0.043 * Math.sin(t * TAU * 5)
    : Math.sin(t * TAU) * (0.065 + 0.009 * Math.cos(t * TAU));
  out.x =
    m.x +
    m.size * (x * Math.cos(angle) - y * Math.sin(angle)) +
    0.006 * Math.sin(time * 0.25 + variant);
  out.y =
    m.y +
    m.size * (x * Math.sin(angle) + y * Math.cos(angle)) +
    0.005 * Math.cos(time * 0.21 + variant);
  out.z = 0.08 + 0.025 * Math.sin(t * TAU);
  out.alpha = 1;
}
export function sampleCell(
  role: MorphRole,
  t: number,
  variant: number,
  time: number,
  out: MorphPoint
): void {
  const angle = t * TAU;
  out.alpha = 1;
  switch (role) {
    case 'membrane': {
      const radius = cellRadius(angle, time);
      out.x = radius * Math.cos(angle);
      out.y = radius * 0.79 * Math.sin(angle);
      out.z = 0.025 * Math.sin(angle);
      break;
    }
    case 'nucleus':
      out.x = -0.13 + 0.29 * Math.cos(angle);
      out.y = -0.07 + 0.25 * Math.sin(angle);
      out.z = 0.06 * Math.sin(angle);
      break;
    case 'nucleolus':
      out.x = -0.18 + 0.065 * Math.cos(angle);
      out.y = -0.09 + 0.055 * Math.sin(angle);
      out.z = 0.12;
      break;
    case 'chromatin': {
      const a = t * TAU * 3 + variant * 1.6;
      const radius =
        0.13 + 0.045 * Math.sin(t * TAU * 5.3 + variant) + 0.02 * Math.sin(t * TAU * 2.1);
      out.x = -0.13 + radius * Math.cos(a);
      out.y = -0.07 + radius * 0.82 * Math.sin(a);
      out.z = 0.045 * Math.sin(a * 1.7 + time * 0.12);
      break;
    }
    case 'mitochondria':
      sampleMito(t, variant, time, false, out);
      break;
    case 'er': {
      // Folded membrane ribbons beside the nucleus, attached at their inner ends.
      const a = -1.4 + t * 3.1;
      const radius = 0.31 + 0.11 * (0.5 + 0.5 * Math.sin(t * TAU * 5));
      out.x = -0.13 + radius * Math.cos(a);
      out.y = -0.07 + radius * 0.85 * Math.sin(a);
      out.z = -0.035;
      break;
    }
    case 'cytoplasm': {
      const a = t * TAU * 19 + time * 0.008;
      const radius = 0.48 + 0.21 * (0.5 + 0.5 * Math.sin(t * 43));
      out.x = radius * Math.cos(a);
      out.y = radius * 0.76 * Math.sin(a);
      out.z = 0.15 * Math.sin(a * 2);
      break;
    }
  }
}
export function signalHeight(t: number): number {
  const peak = (center: number, width: number, height: number) =>
    height * Math.exp(-(((t - center) / width) ** 2));
  return 0.025 + peak(0.24, 0.075, 0.43) + peak(0.57, 0.11, 0.62) + peak(0.8, 0.045, 0.22);
}
/** Structure-specific emergence: DNA stays in chromatin as its context appears. */
export function cellReveal(role: MorphRole, progress: number): number {
  const start =
    role === 'chromatin'
      ? 0
      : role === 'nucleus' || role === 'nucleolus'
        ? 0.12
        : role === 'membrane'
          ? 0.25
          : 0.2;
  return smoothstep((progress - start) / (0.48 - start));
}
/** Allocation-free sampler; the caller owns output and scratch points. */
export function sampleStructureMorph(
  particle: MorphAnchor,
  progress: number,
  time: number,
  out: MorphPoint,
  scratch: MorphPoint
): void {
  const p = clamp01(progress);
  sampleCell(particle.role, particle.t, particle.variant, time, out);
  if (p <= 0.5) {
    const blend = smoothstep(p * 2);
    if (particle.role !== 'chromatin') {
      const zoom = 0.65 + 0.35 * blend;
      out.x *= zoom;
      out.y *= zoom;
      out.z *= zoom;
      out.alpha = cellReveal(particle.role, p);
      return;
    }
    sampleDna(particle.t, particle.variant, time, scratch);
    const curve = Math.sin(Math.PI * blend) * 0.1;
    out.x = scratch.x + (out.x - scratch.x) * blend;
    out.y = scratch.y + (out.y - scratch.y) * blend + curve * Math.sin(particle.t * TAU);
    out.z = scratch.z + (out.z - scratch.z) * blend;
    out.alpha = particle.role === 'chromatin' ? 1 : cellReveal(particle.role, p);
  } else {
    const blend = smoothstep((p - 0.5) * 2);
    const x = -1 + 2 * particle.t;
    const trace = particle.role === 'chromatin' || particle.role === 'membrane';
    const y = 0.33 - (trace ? signalHeight(particle.t) : 0);
    out.x += (x - out.x) * blend;
    out.y +=
      (y - out.y) * blend - Math.sin(Math.PI * blend) * 0.13 * Math.sin(particle.t * Math.PI);
    out.z *= 1 - blend;
    out.alpha = 1 - blend * (trace ? 0 : particle.role === 'cytoplasm' ? 0.65 : 0.88);
  }
}

/** Particle material around anatomical anchors; outlines use the anchor sampler separately. */
export function sampleCellParticle(p: MorphParticle, time: number, out: MorphPoint): void {
  sampleCell(p.role, p.t, p.variant, time, out);
  const a = p.v * TAU;
  switch (p.role) {
    case 'membrane':
    case 'nucleus': {
      const latitude = p.u * 2 - 1;
      const ring = Math.sqrt(1 - latitude * latitude);
      const nuclear = p.role === 'nucleus';
      const cx = nuclear ? -0.13 : 0,
        cy = nuclear ? -0.07 : 0;
      out.x = cx + (out.x - cx) * ring;
      out.y = cy + (out.y - cy) * ring;
      out.z = latitude * (nuclear ? 0.2 : 0.48);
      // The silhouette carries the surface; the front stays transparent to anatomy.
      out.alpha = 0.16 + 0.64 * ring ** 6;
      break;
    }
    case 'nucleolus': {
      const r = Math.sqrt(p.u);
      out.x = -0.18 + (out.x + 0.18) * r;
      out.y = -0.09 + (out.y + 0.09) * r;
      out.z = 0.12 + (p.v - 0.5) * 0.055;
      out.alpha = 0.8;
      break;
    }
    case 'chromatin': {
      const r = 0.027 * Math.sqrt(p.u);
      out.x += Math.cos(a) * r;
      out.y += Math.sin(a) * r;
      out.z += (p.u - 0.5) * 0.15;
      out.alpha = 0.6 + p.v * 0.35;
      break;
    }
    case 'mitochondria': {
      const m = MITOCHONDRIA[p.variant];
      if (p.u < 0.4) {
        sampleMito(p.t, p.variant, time, true, out);
        out.x += Math.cos(a) * 0.005;
        out.y += Math.sin(a) * 0.005;
        out.alpha = 0.95;
      } else {
        const latitude = ((p.u - 0.4) / 0.6) * 2 - 1;
        const ring = Math.sqrt(1 - latitude * latitude);
        const cx = m.x + 0.006 * Math.sin(time * 0.25 + p.variant);
        const cy = m.y + 0.005 * Math.cos(time * 0.21 + p.variant);
        out.x = cx + (out.x - cx) * ring;
        out.y = cy + (out.y - cy) * ring;
        out.z = 0.08 + latitude * 0.05;
        out.alpha = 0.28 + 0.5 * ring ** 4;
      }
      break;
    }
    case 'er':
      out.x += Math.cos(a) * 0.013;
      out.y += Math.sin(a) * 0.013;
      out.z += (p.u - 0.5) * 0.17;
      out.alpha = 0.55 + p.v * 0.25;
      break;
    case 'cytoplasm': {
      const angle = p.phase + time * 0.012;
      const r = 0.71 * Math.sqrt(p.u);
      out.x = Math.cos(angle) * r;
      out.y = Math.sin(angle) * r * 0.76;
      // Displace samples away from the nucleus rather than filling its interior.
      const nx = (out.x + 0.13) / 0.34,
        ny = (out.y + 0.07) / 0.3;
      const distance = Math.hypot(nx, ny);
      if (distance < 1) {
        const angle = Math.atan2(ny, nx);
        out.x = -0.13 + Math.cos(angle) * 0.34 * (1 + p.v * 0.2);
        out.y = -0.07 + Math.sin(angle) * 0.3 * (1 + p.v * 0.2);
      }
      out.z = (p.v - 0.5) * 0.6;
      out.alpha = 0.19 + p.v * 0.24;
      break;
    }
  }
}

/** Dense helix material and a separate cloud that will reveal its cellular context. */
function sampleDnaParticle(p: MorphParticle, time: number, out: MorphPoint): void {
  sampleDna(p.t, p.role === 'chromatin' ? p.variant : p.v < 0.5 ? 0 : 1, time, out);
  const a = p.v * TAU + time * 0.025;
  if (p.role === 'chromatin') {
    if (p.u < 0.24) {
      // Discrete paired rungs, built from dots rather than continuous bars.
      sampleDna(Math.round(p.t * 26) / 26, 0, time, out);
      out.y *= p.v * 2 - 1;
      out.z *= p.v * 2 - 1;
      out.x += (p.u / 0.24 - 0.5) * 0.008;
    } else {
      const r = 0.035 * Math.sqrt((p.u - 0.24) / 0.76);
      out.x += Math.cos(a) * r;
      out.y += Math.sin(a) * r;
      out.z += Math.cos(a * 2) * r;
    }
    out.alpha = 0.8 + p.v * 0.2;
  } else {
    // Context is visibly separate from DNA, not DNA turning into organelles.
    const r = 0.08 + 0.22 * Math.sqrt(p.u);
    out.x *= 1.06;
    out.y += Math.cos(a) * r;
    out.z += Math.sin(a) * r;
    out.alpha = 0.13 + (1 - p.u) * 0.2;
  }
}

/** Existing expression material: a non-normalized multi-peak genomic signal. */
export function sampleSignalParticle(p: MorphParticle, out: MorphPoint): void {
  const ridge = p.role === 'chromatin';
  out.x = -1 + 2 * p.t;
  out.y = 0.33 - signalHeight(p.t) * (ridge ? 0.96 + p.u * 0.04 : p.u);
  out.z = 0;
  out.alpha = ridge ? 0.85 : 0.28 + p.v * 0.2;
}

/** Canonical sampling seam shared by endpoint checks and the adjacent-target morph. */
export function sampleMorphTarget(
  p: MorphParticle,
  id: MorphStageId,
  time: number,
  out: MorphPoint
): void {
  const clock = Number.isFinite(time) ? time : 0;
  switch (id) {
    case 'dna':
      sampleDnaParticle(p, clock, out);
      break;
    case 'rna':
      sampleRnaParticle(p, clock, out);
      break;
    case 'protein':
      sampleProteinParticle(p, out);
      break;
    case 'cell':
      sampleCellParticle(p, clock, out);
      break;
    case 'signal':
      sampleSignalParticle(p, out);
      break;
    case 'network':
      sampleNetworkParticle(p, out);
      break;
    case 'distribution':
      sampleDistributionParticle(p, out);
      break;
  }
}

/** Six reversible, subtly staggered paths; quintic easing and endpoint-flat bounded arcs. */
export function sampleMorph(
  p: MorphParticle,
  progress: number,
  time: number,
  out: MorphPoint,
  scratch: MorphPoint
): void {
  const stage = finiteProgress(progress) * 6;
  const from = Math.min(5, Math.floor(stage));
  const local = stage - from;
  // Copy canonical targets exactly, avoiding round-off from interpolation at arrivals.
  if (local === 0 || local === 1) {
    sampleMorphTarget(p, MORPH_STAGES[from + local].id, time, out);
    return;
  }
  sampleMorphTarget(p, MORPH_STAGES[from].id, time, scratch);
  sampleMorphTarget(p, MORPH_STAGES[from + 1].id, time, out);
  const role = MORPH_ROLES.indexOf(p.role);
  const delay = role * 0.006 + p.u * 0.025;
  const blend = smootherstep((local - delay) / (1 - delay));
  const arc = 64 * blend ** 3 * (1 - blend) ** 3;
  const angle = p.t * TAU * 2 + role * 0.7 + from * 0.4;
  out.x = scratch.x + (out.x - scratch.x) * blend + arc * Math.sin(angle) * 0.1;
  out.y = scratch.y + (out.y - scratch.y) * blend + arc * Math.cos(angle) * 0.13;
  out.z = scratch.z + (out.z - scratch.z) * blend + arc * Math.sin(angle + 1) * 0.12;
  out.alpha = scratch.alpha + (out.alpha - scratch.alpha) * blend;
}
/** Exact critically damped spring step, independent of frame subdivision. */
export function springStep(
  position: number,
  velocity: number,
  dt: number,
  omega = 7
): [number, number] {
  const b = velocity + omega * position;
  const decay = Math.exp(-omega * dt);
  return [(position + b * dt) * decay, (velocity - omega * b * dt) * decay];
}
