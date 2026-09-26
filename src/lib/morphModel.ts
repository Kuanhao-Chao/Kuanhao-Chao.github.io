import { seededBackgroundRandom, type Point } from './backgroundModel';

export type MorphForm = 'scatter' | 'dna' | 'cell' | 'signal';
export type MorphTargets = Record<MorphForm, Point[]>;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

/** DNA at the hero, a cell at Research, and a signal at Publications. */
export function storyProgress(focus: number, hero: number, cell: number, signal: number): number {
  if (focus <= cell) return 0.5 * smoothstep((focus - hero) / Math.max(1, cell - hero));
  return 0.5 + 0.5 * smoothstep((focus - cell) / Math.max(1, signal - cell));
}

export function cellRadius(theta: number): number {
  return (
    0.81 +
    0.055 * Math.sin(3 * theta + 0.4) +
    0.035 * Math.sin(5 * theta - 0.8) +
    0.018 * Math.sin(9 * theta + 0.3)
  );
}

/** Normalized, deterministic shapes. Every form has the same stable particle count. */
export function createMorphTargets(count: number): MorphTargets {
  const n = Math.max(16, Math.floor(count));
  const random = seededBackgroundRandom(2619);
  const targets: MorphTargets = { scatter: [], dna: [], cell: [], signal: [] };
  const membrane = Math.floor(n * 0.57);
  const nucleus = Math.floor(n * 0.19);
  const organelles = Math.floor(n * 0.18);

  for (let i = 0; i < n; i++) {
    targets.scatter.push({ x: (random() - 0.5) * 2.4, y: (random() - 0.5) * 2.15 });

    // Two projected DNA strands, dotted base-pair rungs, and a highlighted motif.
    if (i < membrane) {
      const strand = i % 2;
      const t = (Math.floor(i / 2) + 0.5) / Math.ceil(membrane / 2);
      const phase = 4.5 * Math.PI * t;
      targets.dna.push({ x: -0.96 + 1.92 * t, y: Math.sin(phase) * 0.32 * (strand ? -1 : 1) });
    } else if (i < membrane + nucleus) {
      const t = (i - membrane + 0.5) / nucleus;
      const phase = 4.5 * Math.PI * t;
      targets.dna.push({
        x: -0.96 + 1.92 * t,
        y: Math.sin(phase) * 0.32 * (2 * ((i % 5) / 4) - 1),
      });
    } else {
      const t = (i - membrane - nucleus + 0.5) / (n - membrane - nucleus);
      targets.dna.push({ x: -0.33 + 0.5 * t, y: 0.42 + 0.035 * Math.sin(t * 15) });
    }

    if (i < membrane) {
      const theta = (2 * Math.PI * (i + 0.5)) / membrane;
      const radius = cellRadius(theta);
      targets.cell.push({ x: radius * Math.cos(theta), y: radius * 0.83 * Math.sin(theta) });
    } else if (i < membrane + nucleus) {
      const theta = (2 * Math.PI * (i - membrane + 0.5)) / nucleus;
      const radius = 0.29 + 0.023 * Math.sin(4 * theta);
      targets.cell.push({
        x: -0.08 + radius * Math.cos(theta),
        y: 0.04 + radius * 0.89 * Math.sin(theta),
      });
    } else if (i < membrane + nucleus + organelles) {
      const j = i - membrane - nucleus;
      const group = j % 3;
      const angle = (2 * Math.PI * (Math.floor(j / 3) + 0.5)) / Math.ceil(organelles / 3);
      const centers = [
        { x: 0.39, y: -0.16 },
        { x: 0.33, y: 0.27 },
        { x: -0.4, y: -0.29 },
      ];
      targets.cell.push({
        x: centers[group].x + 0.12 * Math.cos(angle),
        y: centers[group].y + 0.055 * Math.sin(angle),
      });
    } else {
      targets.cell.push({ x: (random() - 0.5) * 0.85, y: (random() - 0.5) * 0.62 });
    }

    const traceCount = membrane + nucleus;
    const x =
      i < traceCount
        ? -1 + (2 * (i + 0.5)) / traceCount
        : -1 + (2 * (i - traceCount + 0.5)) / (n - traceCount);
    const peak = (at: number, spread: number, height: number) =>
      height * Math.exp(-(((x - at) / spread) ** 2));
    const signal = 0.1 * Math.sin(12 * x) + peak(-0.43, 0.16, 0.46) + peak(0.32, 0.23, 0.66) - 0.25;
    if (i < membrane + nucleus) targets.signal.push({ x, y: signal });
    else targets.signal.push({ x, y: -0.55 + (i % 3) * 0.045 });
  }
  return targets;
}

export function morphPoint(targets: MorphTargets, index: number, progress: number): Point {
  const t = clamp01(progress) * 2;
  if (t === 0) return targets.dna[index];
  if (t === 1) return targets.cell[index];
  if (t === 2) return targets.signal[index];
  const segment = t < 1 ? 0 : 1;
  const first = segment === 0 ? targets.dna[index] : targets.cell[index];
  const second = segment === 0 ? targets.cell[index] : targets.signal[index];
  const blend = smoothstep(t - segment);
  return { x: first.x + (second.x - first.x) * blend, y: first.y + (second.y - first.y) * blend };
}
