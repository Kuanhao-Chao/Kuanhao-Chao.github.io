import { levelsForTrack, type Level, type View } from './genomeBrowser';

/** Chromosome means are over finite native values; missing values carry no weight. */
export function scoredMean(rows: { scored: number; mean: number | null }[]): number | null {
  let sum = 0, count = 0;
  for (const row of rows) {
    if (row.mean == null || !Number.isFinite(row.mean) || row.scored <= 0) continue;
    sum += row.mean * row.scored;
    count += row.scored;
  }
  return count ? sum / count : null;
}

export interface AnalysisGrid {
  start: number;
  end: number;
  binBp: number;
  count: number;
  levels: Level[];
}

/** One common genomic grid for statistics, scatter and CSV, independent of screen width. */
export function analysisGrid(
  view: View, tracks: { nativeBp?: number; levels?: Level[] }[], levels: Level[],
  maxBins = 4000,
): AnalysisGrid {
  const ladders = tracks.map((t) => levelsForTrack(t, levels).slice().sort((a, b) => a.binBp - b.binBp));
  const floor = Math.max(1, ...ladders.map((l) => l[0].binBp));
  const candidates = [...new Set(levels.map((l) => l.binBp).concat(floor))].sort((a, b) => a - b);
  const binBp = candidates.find((bp) => bp >= floor
    && Math.ceil(view.end / bp) - Math.floor(view.start / bp) <= maxBins)
    ?? candidates[candidates.length - 1];
  const start = Math.floor(view.start / binBp) * binBp;
  return {
    start, end: view.end, binBp, count: Math.ceil((view.end - start) / binBp),
    levels: ladders.map((ladder) => ladder.filter((l) => l.binBp <= binBp).at(-1) ?? ladder[0]),
  };
}

/** Approximate base-weighted mean of stored bin means; unknown bins have no weight. */
export function meanOverView(
  values: (number | null)[], grid: AnalysisGrid, view: View, absolute = false,
): number | null {
  let sum = 0;
  let weight = 0;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) return;
    const start = grid.start + i * grid.binBp;
    const overlap = Math.max(0, Math.min(start + grid.binBp, view.end) - Math.max(start, view.start));
    sum += (absolute ? Math.abs(v) : v) * overlap;
    weight += overlap;
  });
  return weight ? sum / weight : null;
}
