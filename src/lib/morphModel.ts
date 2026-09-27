/** Deterministic, representative anatomy for the Genome → Cell illustration. */
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
export interface MorphParticle {
  role: MorphRole;
  t: number;
  variant: number;
  rank: number;
}
export const TAU = Math.PI * 2;
export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}
export function storyProgress(focus: number, hero: number, cell: number, signal: number): number {
  if (focus <= cell) return 0.5 * smoothstep((focus - hero) / Math.max(1, cell - hero));
  return 0.5 + 0.5 * smoothstep((focus - cell) / Math.max(1, signal - cell));
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

export function createMorphParticles(count: number): MorphParticle[] {
  const n = Math.max(100, Math.floor(Number.isFinite(count) ? count : 300));
  const weights = [0.25, 0.24, 0.1, 0.04, 0.15, 0.14, 0.08];
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
      });
    }
  });
  return particles;
}
/** Sample within every anatomical group when reducing quality. */
export const visibleParticle = (particle: MorphParticle, quality: number) =>
  particle.rank < Math.max(0.3, quality);

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
export function sampleMorph(
  particle: MorphParticle,
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
/** Two-second holds and four-second transitions, with a continuous reverse leg. */
export function playbackProgress(seconds: number): number {
  const t = ((seconds % 24) + 24) % 24;
  if (t < 2) return 0;
  if (t < 6) return 0.5 * smoothstep((t - 2) / 4);
  if (t < 8) return 0.5;
  if (t < 12) return 0.5 + 0.5 * smoothstep((t - 8) / 4);
  if (t < 14) return 1;
  if (t < 18) return 1 - 0.5 * smoothstep((t - 14) / 4);
  if (t < 20) return 0.5;
  return 0.5 - 0.5 * smoothstep((t - 20) / 4);
}
export function playbackTime(progress: number): number {
  const p = clamp01(progress);
  if (p === 0) return 0;
  if (p === 0.5) return 6;
  if (p === 1) return 12;
  const local = p < 0.5 ? p * 2 : (p - 0.5) * 2;
  let low = 0,
    high = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (smoothstep(mid) < local) low = mid;
    else high = mid;
  }
  return (p < 0.5 ? 2 : 8) + (4 * (low + high)) / 2;
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
