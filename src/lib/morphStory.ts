/** One scientific vocabulary and canonical ordering for all story consumers. */
export type MorphStageId =
  'dna' | 'rna' | 'protein' | 'cell' | 'signal' | 'network' | 'distribution';
export const MORPH_STAGES: readonly {
  id: MorphStageId;
  label: string;
  progress: number;
  description: string;
}[] = [
  {
    id: 'dna',
    label: 'DNA',
    progress: 0,
    description: 'Representative paired DNA strands; not ubiquitin’s sequence.',
  },
  {
    id: 'rna',
    label: 'RNA',
    progress: 1 / 6,
    description:
      'A representative single transcript with local hairpins; transcription copies genetic information.',
  },
  {
    id: 'protein',
    label: 'Folded protein',
    progress: 1 / 3,
    description:
      'Ubiquitin, PDB 1UBQ chain A: the experimental C-alpha backbone, not a simulation of translation or folding.',
  },
  {
    id: 'cell',
    label: 'Cell',
    progress: 0.5,
    description:
      'Representative cellular context with nucleus, chromatin and organelles; dots are drawing material, not tracked atoms.',
  },
  {
    id: 'signal',
    label: 'Expression profile',
    progress: 2 / 3,
    description: 'An illustrative non-normalized expression signal along genomic position.',
  },
  {
    id: 'network',
    label: 'Neural model',
    progress: 5 / 6,
    description: 'An illustrative five-layer neural model, not Shorkie’s actual architecture.',
  },
  {
    id: 'distribution',
    label: 'Probability distribution',
    progress: 1,
    description:
      'An illustrative normalized standard-normal probability density of a standardized response, not measured or calibrated Shorkie uncertainty.',
  },
];

export interface MorphChapter {
  id: MorphStageId;
  center: number;
  holdRadius: number;
}
// Build this lookup once: atmosphere sampling must not create a findIndex closure per dot.
const stageIndices = Object.fromEntries(MORPH_STAGES.map((stage, i) => [stage.id, i])) as Record<
  MorphStageId,
  number
>;
/** Invalid progress is the quiet Cell fallback, never NaN geometry. */
export const finiteProgress = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;

export function smootherstep(value: number): number {
  const t = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function holdRadius(chapters: readonly MorphChapter[], index: number): number {
  return Math.min(
    chapters[index].holdRadius,
    index ? (chapters[index].center - chapters[index - 1].center) / 2 : Infinity,
    index < 6 ? (chapters[index + 1].center - chapters[index].center) / 2 : Infinity
  );
}

/** Document-coordinate focus, settled hold zones, and reversible adjacent transitions. */
export function storyProgress(focus: number, chapters: readonly MorphChapter[]): number {
  if (!Number.isFinite(focus) || !Array.isArray(chapters) || chapters.length !== 7) return 0.5;
  for (let i = 0; i < 7; i++) {
    const c = chapters[i];
    if (
      !c ||
      c.id !== MORPH_STAGES[i].id ||
      !Number.isFinite(c.center) ||
      !Number.isFinite(c.holdRadius) ||
      c.holdRadius < 0 ||
      (i > 0 && c.center <= chapters[i - 1].center)
    )
      return 0.5;
  }
  for (let i = 0; i < 7; i++) {
    const end = chapters[i].center + holdRadius(chapters, i);
    if (focus <= end) return i / 6;
    if (i < 6) {
      const start = chapters[i + 1].center - holdRadius(chapters, i + 1);
      if (focus < start) return (i + smootherstep((focus - end) / (start - end))) / 6;
    }
  }
  return 1;
}

/** Only the two adjacent forms contribute; weights sum to one. */
export function stageWeight(progress: number, id: MorphStageId): number {
  const p = finiteProgress(progress) * 6;
  const index = stageIndices[id];
  const from = Math.min(5, Math.floor(p));
  const blend = smootherstep(p - from);
  return index === from ? 1 - blend : index === from + 1 ? blend : 0;
}

export function stageDescription(progress: number): string {
  return MORPH_STAGES[Math.round(finiteProgress(progress) * 6)].description;
}

/** Each arrival holds 2s, then takes 3s to reach its neighbor; reverse without a jump. */
export function playbackProgress(seconds: number): number {
  const t = Number.isFinite(seconds) ? ((seconds % 60) + 60) % 60 : 0;
  const leg = Math.floor(t / 5);
  const blend = smootherstep(((t % 5) - 2) / 3);
  return leg < 6 ? (leg + blend) / 6 : (12 - leg - blend) / 6;
}

/** Select the forward phase so autoplay resumes at precisely the displayed pose. */
export function playbackTime(progress: number): number {
  const p = finiteProgress(progress) * 6;
  const leg = Math.floor(p);
  const local = p - leg;
  if (local === 0) return leg * 5;
  let low = 0,
    high = 1;
  for (let i = 0; i < 48; i++) {
    const mid = (low + high) / 2;
    if (smootherstep(mid) < local) low = mid;
    else high = mid;
  }
  return leg * 5 + 2 + (3 * (low + high)) / 2;
}

export function transitionDuration(from: number, to: number): number {
  return Math.max(0.15, Math.abs(finiteProgress(to) - finiteProgress(from)) * 6 * 0.9);
}
