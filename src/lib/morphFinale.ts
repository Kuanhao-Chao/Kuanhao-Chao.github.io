/** Published sequence-logo geometry and a small, directed illustrative attention head.
 * No network requests, trained-model claims, or per-particle allocations.
 */
import type { MorphParticle, MorphPoint } from './morphModel';

export type FinaleVariant = 'motif' | 'attention';
export type Base = 'A' | 'C' | 'G' | 'T';
export const BASES = ['A', 'C', 'G', 'T'] as const;
export const RAP1_SOURCE = {
  id: 'MA0359.3',
  name: 'Rap1',
  organism: 'Saccharomyces cerevisiae',
  assay: 'ChIP-exo',
  url: 'https://jaspar.elixir.no/matrix/MA0359.3/',
  license: 'CC BY 4.0',
} as const;
// JASPAR MA0359.3, pinned 2026-10-11; rows A, C, G, T, columns 1–12.
const COUNTS = [
  [200, 3, 4, 13, 214, 9, 6, 0, 48, 1, 3, 27],
  [10, 4, 5, 27, 36, 54, 0, 0, 5, 5, 18, 48],
  [105, 39, 317, 4, 51, 0, 327, 318, 281, 2, 264, 24],
  [21, 290, 10, 292, 35, 273, 3, 18, 2, 328, 51, 237],
] as const;
export const MOTIF_COLUMNS = Array.from({ length: 12 }, (_, index) => {
  const counts: number[] = COUNTS.map((row) => row[index]);
  const total = counts.reduce((sum, n) => sum + n, 0);
  const probabilities = counts.map((n) => n / total);
  const information = 2 + probabilities.reduce((sum, p) => sum + (p ? p * Math.log2(p) : 0), 0);
  const letters = BASES.map((base, b) => ({ base, bits: probabilities[b] * information })).sort(
    (a, b) => a.bits - b.bits || a.base.localeCompare(b.base)
  );
  const consensus = BASES[counts.indexOf(Math.max(...counts))];
  return { index, counts, probabilities, information, consensus, letters };
});

export const MOTIF_X0 = -1.16,
  MOTIF_X1 = 1.16;
export const MOTIF_BASELINE = 0.46,
  MOTIF_RAIL = -0.33;
const PITCH = (MOTIF_X1 - MOTIF_X0) / 12;
export const motifX = (position: number) => MOTIF_X0 + (position + 0.5) * PITCH;
type Vertex = readonly [number, number];
type Contour = readonly Vertex[];

// Original bold vector glyphs, shared by the outline and particle fill. A's second
// contour is a counter (hole); Canvas even-odd filling and sampling agree.
function roundLetter(g: boolean): Contour[] {
  const points: Vertex[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = Math.PI / 4 + (Math.PI * 1.5 * i) / 32;
    points.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]);
  }
  for (let i = 32; i >= 0; i--) {
    const a = Math.PI / 4 + (Math.PI * 1.5 * i) / 32;
    points.push([0.5 + 0.26 * Math.cos(a), 0.5 + 0.27 * Math.sin(a)]);
  }
  const contours: Contour[] = [points];
  if (g)
    contours.push([
      [0.51, 0.46],
      [1, 0.46],
      [1, 0.8],
      [0.76, 0.8],
      [0.76, 0.65],
      [0.51, 0.65],
    ]);
  return contours;
}
const GLYPHS: Record<Base, Contour[]> = {
  A: [
    [
      [0, 1],
      [0.36, 0],
      [0.64, 0],
      [1, 1],
      [0.73, 1],
      [0.65, 0.76],
      [0.35, 0.76],
      [0.27, 1],
    ],
    [
      [0.5, 0.3],
      [0.4, 0.59],
      [0.6, 0.59],
    ],
  ],
  C: roundLetter(false),
  G: roundLetter(true),
  T: [
    [
      [0, 0],
      [1, 0],
      [1, 0.24],
      [0.63, 0.24],
      [0.63, 1],
      [0.37, 1],
      [0.37, 0.24],
      [0, 0.24],
    ],
  ],
};
function inside(x: number, y: number, contour: Contour): boolean {
  let hit = false;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const [xi, yi] = contour[i],
      [xj, yj] = contour[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const GLYPH_SAMPLES = Object.fromEntries(
  BASES.map((base) => {
    const points: Vertex[] = [];
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 48; x++) {
        const xx = (x + 0.5) / 48,
          yy = (y + 0.5) / 64;
        const hit =
          base === 'A'
            ? inside(xx, yy, GLYPHS.A[0]) && !inside(xx, yy, GLYPHS.A[1])
            : GLYPHS[base].some((contour) => inside(xx, yy, contour));
        if (hit) points.push([xx, yy]);
      }
    return [base, points];
  })
) as Record<Base, Vertex[]>;

export const MOTIF_GLYPHS = MOTIF_COLUMNS.flatMap((column) => {
  let bottom = MOTIF_BASELINE;
  return column.letters
    .filter((letter) => letter.bits > 0)
    .map((letter) => {
      const height = letter.bits * 0.36;
      bottom -= height;
      return {
        column: column.index,
        base: letter.base,
        x: motifX(column.index) - PITCH * 0.41,
        y: bottom,
        width: PITCH * 0.82,
        height,
        contours: GLYPHS[letter.base],
      };
    });
});
// Particle lookup/CDFs are cached; no filtering or searching large geometry in a frame.
const COLUMN_GLYPHS = MOTIF_COLUMNS.map((column) =>
  MOTIF_GLYPHS.filter((g) => g.column === column.index)
);
function particleGlyph(p: MorphParticle) {
  const column = Math.min(11, Math.floor(p.u * 12));
  const threshold = ((p.u * 12) % 1) * MOTIF_COLUMNS[column].information * 0.36;
  let height = 0;
  for (const glyph of COLUMN_GLYPHS[column]) {
    height += glyph.height;
    if (threshold < height) return glyph;
  }
  return COLUMN_GLYPHS[column][COLUMN_GLYPHS[column].length - 1];
}
export const motifParticleBase = (p: MorphParticle): Base => particleGlyph(p).base;
export function sampleMotifParticle(p: MorphParticle, out: MorphPoint): void {
  const glyph = particleGlyph(p);
  const samples = GLYPH_SAMPLES[glyph.base];
  const seed = (p.v + p.phase * 0.15915494309189535) % 1;
  const sample = samples[Math.min(samples.length - 1, Math.floor(seed * samples.length))];
  out.x = glyph.x + sample[0] * glyph.width;
  out.y = glyph.y + sample[1] * glyph.height;
  out.z = 0;
  out.alpha = 0.3 + p.v * 0.4;
}
/** Normalized logo hit bounds; no DOM reads, pointer capture, or touch cancellation. */
export function motifPositionAt(x: number, y: number): number {
  if (!Number.isFinite(x + y) || x < MOTIF_X0 || x > MOTIF_X1 || y < -0.79 || y > 0.51) return -1;
  return Math.min(11, Math.floor((x - MOTIF_X0) / PITCH));
}

// One reproducible 6→4 head: base one-hot + sin/cos position, distinct seeded Q/K.
let seed = 0x4d4f5446;
function randomProjection() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1) * 1.6;
}
const WQ = Array.from({ length: 4 }, () => Array.from({ length: 6 }, randomProjection));
const WK = Array.from({ length: 4 }, () => Array.from({ length: 6 }, randomProjection));
const FEATURES = MOTIF_COLUMNS.map((column, i) => [
  ...BASES.map((base) => Number(base === column.consensus)),
  Math.sin((i * Math.PI * 2) / 12),
  Math.cos((i * Math.PI * 2) / 12),
]);
const Q = FEATURES.map((x) => WQ.map((row) => row.reduce((sum, w, k) => sum + w * x[k], 0)));
const K = FEATURES.map((x) => WK.map((row) => row.reduce((sum, w, k) => sum + w * x[k], 0)));
export const MOTIF_ATTENTION = Q.map((q, i) => {
  const scores = K.map((k, j) =>
    i === j
      ? -Infinity
      : q.reduce((sum, value, d) => sum + value * k[d], 0) / 2 - 0.08 * Math.abs(i - j)
  );
  const max = Math.max(...scores);
  const weights = scores.map((score) => Math.exp(score - max));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((weight) => weight / sum);
});
export interface MotifLink {
  from: number;
  to: number;
  weight: number;
  direction: 'incoming' | 'outgoing' | 'idle';
}
const OUTGOING = MOTIF_ATTENTION.map((row, from) =>
  row
    .map((weight, to) => ({
      from,
      to,
      weight,
      direction: 'outgoing' as const,
    }))
    .filter((l) => l.from !== l.to)
    .sort((a, b) => b.weight - a.weight || a.to - b.to)
);
const INCOMING = MOTIF_COLUMNS.map((_, to) =>
  MOTIF_ATTENTION.map((row, from) => ({
    from,
    to,
    weight: row[to],
    direction: 'incoming' as const,
  }))
    .filter((l) => l.from !== l.to)
    .sort((a, b) => b.weight - a.weight || a.from - b.from)
);
const DESKTOP_LINKS = OUTGOING.map((row, i) => [...row.slice(0, 2), ...INCOMING[i].slice(0, 2)]);
const PHONE_LINKS = OUTGOING.map((row, i) => [row[0], INCOMING[i][0]]);
export const IDLE_MOTIF_LINKS: readonly MotifLink[] = OUTGOING.flat()
  .sort((a, b) => b.weight - a.weight || a.from - b.from || a.to - b.to)
  .slice(0, 3)
  .map((l) => ({ ...l, direction: 'idle' }));
export function motifLinks(position: number, coarse = false): readonly MotifLink[] {
  return Number.isInteger(position) && position >= 0 && position < 12
    ? (coarse ? PHONE_LINKS : DESKTOP_LINKS)[position]
    : IDLE_MOTIF_LINKS;
}
/** Opposite directions use different heights, including reciprocal links. */
export function motifLinkPoint(link: MotifLink, t: number, out: MorphPoint): void {
  const start = motifX(link.from),
    end = motifX(link.to);
  const height =
    0.11 + 0.15 * Math.sqrt(Math.abs(end - start)) + (link.direction === 'incoming' ? 0.05 : 0);
  out.x = start + (end - start) * t;
  out.y = MOTIF_RAIL - height * Math.sin(Math.PI * t);
  out.z = 0;
  out.alpha = 1;
}
