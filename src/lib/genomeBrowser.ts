/**
 * The arithmetic behind the genome browser: which tiles to fetch, at which level, and where they
 * land on screen.
 *
 * Kept separate from the DOM because these are the calculations a browser gets quietly wrong — an
 * off-by-one in a tile range shows as a missing stripe at one zoom, a wrong level choice as a track
 * that is either blurred or fetching a hundred times more data than it can draw. All of it is
 * testable without a canvas, and it is tested against the shipped `index.json` so a level choice
 * cannot drift away from the data that actually exists.
 */

/** One resolution of the pyramid. `binBp` bases per bin; level 0 is per-base. */
export interface Level {
  level: number;
  binBp: number;
  /** 1 at base level; 3 (min, max, mean) at every summary level. */
  rows: number;
}

export interface ChromInfo {
  name: string;
  length: number;
}

/** A half-open view of a chromosome, in base-pair coordinates. */
export interface View {
  chrom: string;
  start: number;
  end: number;
}

/** The narrowest view worth showing: below this, letters are wider than the panel. */
export const MIN_VIEW_BP = 40;

/**
 * The level to draw a view at.
 *
 * Picks the LARGEST bin that is still no wider than one pixel. Two ways to get this wrong, and the
 * first draft here made the second:
 *
 *   - too fine, and the browser fetches 65,536 bases to draw 800 pixels and stalls on every pan;
 *   - too coarse, and each bin is stretched across several pixels, which reads as blur the data
 *     does not have. Choosing the smallest bin *at least* a pixel wide looks like the same rule and
 *     is this second error: at chrIV's 1,094 bp/pixel it picks 4,096 bp bins, drawn 3.7 px each.
 *
 * Falls back to the finest level when even that is coarser than a pixel — that is the zoomed-in
 * case, where one base already spans many pixels and there is nothing finer to ask for.
 */
export function levelForBpPerPixel(bpPerPixel: number, levels: Level[]): Level {
  const sorted = [...levels].sort((a, b) => a.binBp - b.binBp);
  let best = sorted[0];
  for (const l of sorted) {
    if (l.binBp <= bpPerPixel) best = l;
  }
  return best;
}

/** Bin index covering a base-pair position at a given level. */
export function binOf(bp: number, binBp: number): number {
  return Math.floor(bp / binBp);
}

/**
 * The tile indices covering `[start, end)` at a level.
 *
 * Half-open throughout. `end` is exclusive, so a view ending exactly on a tile boundary must not
 * pull the next tile — the commonest way a browser ends up fetching one tile more than it draws at
 * every single position.
 */
export function tilesCovering(
  start: number, end: number, binBp: number, tileBins: number,
): number[] {
  if (end <= start) return [];
  const first = Math.floor(binOf(start, binBp) / tileBins);
  const last = Math.floor(binOf(end - 1, binBp) / tileBins);
  const out: number[] = [];
  for (let t = first; t <= last; t += 1) out.push(t);
  return out;
}

/** Where a tile's first bin sits, in base pairs. */
export function tileStartBp(tile: number, binBp: number, tileBins: number): number {
  return tile * tileBins * binBp;
}

/**
 * Keep a view inside its chromosome without changing its width.
 *
 * Clamping the two ends independently is the obvious implementation and it is wrong: it silently
 * narrows the view when you pan into an end, so the zoom level appears to change on its own. Shift
 * the whole window instead, and only narrow when the chromosome is genuinely shorter than the view.
 */
export function clampView(start: number, end: number, chromLength: number): { start: number; end: number } {
  let width = Math.max(MIN_VIEW_BP, Math.round(end - start));
  if (width >= chromLength) return { start: 0, end: chromLength };
  let s = Math.round(start);
  if (s < 0) s = 0;
  if (s + width > chromLength) s = chromLength - width;
  return { start: s, end: s + width };
}

/**
 * Zoom about a fixed base, so the base under the cursor stays under the cursor.
 *
 * `factor` above 1 widens the view (zoom out).
 */
export function zoomAbout(
  start: number, end: number, factor: number, anchorBp: number, chromLength: number,
): { start: number; end: number } {
  const width = end - start;
  const next = Math.max(MIN_VIEW_BP, Math.min(chromLength, width * factor));
  const frac = width > 0 ? (anchorBp - start) / width : 0.5;
  return clampView(anchorBp - frac * next, anchorBp - frac * next + next, chromLength);
}

/** bp -> x, over a plot of `width` pixels inset by `left`. */
export function xOfBp(bp: number, view: View, width: number, left: number, right: number): number {
  const inner = Math.max(1, width - left - right);
  return left + ((bp - view.start) / Math.max(1, view.end - view.start)) * inner;
}

/** x -> bp, the exact inverse of `xOfBp`. */
export function bpOfX(x: number, view: View, width: number, left: number, right: number): number {
  const inner = Math.max(1, width - left - right);
  return view.start + ((x - left) / inner) * (view.end - view.start);
}

/**
 * Parse `chrIV:65,235-65,431`, `chrIV:65235`, or a bare `chrIV`.
 *
 * Commas are accepted because every genome browser prints them and users paste what they see.
 * Returns null rather than a partial guess: a locus box that silently jumps somewhere near what was
 * typed is worse than one that refuses.
 */
export function parseLocus(
  text: string, chroms: ChromInfo[],
): View | null {
  const raw = String(text).trim();
  if (!raw) return null;
  const m = raw.match(/^([A-Za-z0-9._-]+)\s*(?::\s*([\d,]+)(?:\s*[-–]\s*([\d,]+))?)?$/);
  if (!m) return null;
  const want = m[1].toLowerCase();
  const chrom = chroms.find((c) => c.name.toLowerCase() === want);
  if (!chrom) return null;
  if (m[2] === undefined) return { chrom: chrom.name, start: 0, end: chrom.length };
  const a = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(a)) return null;
  if (m[3] === undefined) {
    // A single coordinate means "centre a readable window here", not "a one-base view".
    const half = 200;
    const v = clampView(a - 1 - half, a - 1 + half, chrom.length);
    return { chrom: chrom.name, ...v };
  }
  const b = Number(m[3].replace(/,/g, ''));
  if (!Number.isFinite(b)) return null;
  // Displayed coordinates are 1-based inclusive, the convention every browser prints; internally
  // everything is 0-based half-open. Accepts a reversed range rather than refusing it.
  const lo = Math.min(a, b) - 1;
  const hi = Math.max(a, b);
  const v = clampView(lo, hi, chrom.length);
  return { chrom: chrom.name, ...v };
}

/** `chrIV:65,235-65,431`, 1-based inclusive, the form `parseLocus` accepts back. */
export function formatLocus(view: View): string {
  const n = (x: number) => Math.round(x).toLocaleString('en-US');
  return `${view.chrom}:${n(view.start + 1)}-${n(view.end)}`;
}

/** A short label for a span: "1.5 Mb", "12 kb", "430 bp". */
export function formatSpan(bp: number): string {
  if (bp >= 1e6) return `${(bp / 1e6).toFixed(bp >= 1e7 ? 0 : 2)} Mb`;
  if (bp >= 1e3) return `${(bp / 1e3).toFixed(bp >= 1e4 ? 0 : 1)} kb`;
  return `${Math.round(bp)} bp`;
}

/**
 * Evenly spaced ruler ticks on a 1-2-5 ladder, so labels stay round numbers at every zoom.
 *
 * `target` is roughly how many ticks are wanted; the real count depends on where the ladder lands.
 */
export function rulerTicks(view: View, target = 8): number[] {
  const span = Math.max(1, view.end - view.start);
  const rough = span / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? mag * 10;
  const out: number[] = [];
  for (let t = Math.ceil(view.start / step) * step; t < view.end; t += step) out.push(t);
  return out;
}
