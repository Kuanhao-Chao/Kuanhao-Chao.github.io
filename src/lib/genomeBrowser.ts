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

/**
 * The narrowest view worth showing.
 *
 * 20, not 40, and the reason is the phone. A 40 bp floor over a 252 px plot -- which is what a
 * 390 px phone has after the gutter -- is 6.3 pixels a base, and the letter view needs more than
 * that, so the deepest zoom on a phone rendered as bars and the sequence was simply unreachable.
 * The floor has to leave room for the narrowest screen to get there.
 */
export const MIN_VIEW_BP = 20;

/**
 * Pixels a base at which drawing letters starts to make sense, given how wide the plot is.
 *
 * A constant is wrong here, and 7 was the constant. On a laptop it is invisible -- 1,300 px of
 * plot reaches 7 px a base at 185 bases, long before the zoom floor. On a 390 px phone the plot is
 * 252 px, so 7 px a base needs a 36 bp view, and with the floor at 40 the letter view could not be
 * reached at all: measured, six taps of [+] reached the floor with `data-gb-mode` still "bars".
 *
 * So the threshold scales down for narrow plots, but never below the point where a glyph stops
 * being a glyph. 4.5 px is about where DejaVu Bold at this stack is still identifiable as a
 * letter; below it the logo is texture and the bars carry more information.
 */
export function letterMinPx(innerWidth: number): number {
  if (innerWidth >= 700) return 7;
  // Linear between a 250 px plot at 4.5 and a 700 px plot at 7.
  const t = Math.max(0, Math.min(1, (innerWidth - 250) / (700 - 250)));
  return 4.5 + t * 2.5;
}

/** Whether the letter view should be drawn for a given view width and plot width. */
export function shouldDrawLetters(spanBp: number, innerWidth: number): boolean {
  if (innerWidth <= 0 || spanBp <= 0) return false;
  return innerWidth / spanBp >= letterMinPx(innerWidth);
}

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

/**
 * A track's own level ladder: the shared levels it can honestly supply.
 *
 * Not every track resolves single bases. Shorkie's head emits 896 bins of **16 bp** and occlusion
 * ablates **64 bp** at a time, so a per-base level for either would be an upsampled step function —
 * 12,157,105 stored values carrying 760,000 (or 190,000) values of real information, drawn as
 * though the model resolved single bases. A track therefore declares `nativeBp` and keeps only the
 * levels at or coarser than it that its bins divide evenly.
 *
 * Level NUMBERS stay global, so `L3` is 64 bp for every track and a tile path can never mean two
 * things. A track simply has holes at the top of the ladder.
 */
export function nativeLadder(nativeBp: number, levels: Level[]): Level[] {
  const n = Math.max(1, Math.round(nativeBp));
  const keep = levels.filter((l) => l.binBp >= n && l.binBp % n === 0);
  return keep.length ? keep : [levels[levels.length - 1]];
}

/** The levels a track can be drawn at, falling back to the index's ladder for a per-base track. */
export function levelsForTrack(
  spec: { nativeBp?: number; levels?: Level[] }, fallback: Level[],
): Level[] {
  if (spec.levels?.length) return spec.levels;
  return spec.nativeBp && spec.nativeBp > 1 ? nativeLadder(spec.nativeBp, fallback) : fallback;
}

/**
 * How a track's values map onto the height of its lane.
 *
 * Three spaces, and which one a track uses is a property of its DATA, not a display preference:
 *
 * - `linear` — for a bounded quantity that fills its range. Information content (0–2 bits), a
 *   phastCons posterior (0–1), GC fraction.
 * - `log1p` — for predicted coverage, which spans four orders of magnitude between a silent locus
 *   and a maximal one. Genome-wide the median 16 bp bin reads 2.07 against a maximum of 1,097.6, so
 *   linearly the median sits at 0.2% of the lane and the whole track is a flat line with spikes.
 * - `symlog` — for a SIGNED attribution, which is heavy-tailed in both directions. Measured on
 *   chrIV's gradient × input: median |v| 0.00082 against a maximum of 1.34, so on a symmetric
 *   linear axis the median base draws at 2.5% of half-height. `linthresh` is the value at which the
 *   scale turns over from linear to logarithmic, and is set to the genome-wide median |v|.
 *
 * Returns a fraction of the lane: 0 at the axis floor, 1 at the top. For a signed track 0.5 is the
 * zero rule, and that is what makes a bar grow downwards.
 */
export type ScaleSpace = 'linear' | 'log1p' | 'symlog';

export function axisFraction(
  v: number, axis: [number, number], space: ScaleSpace = 'linear', linthresh = 1,
): number {
  const [lo, hi] = axis;
  if (space === 'symlog') {
    const m = Math.max(Math.abs(lo), Math.abs(hi), 1e-12);
    const t = Math.max(linthresh, 1e-12);
    const f = Math.sign(v) * (Math.log1p(Math.abs(v) / t) / Math.log1p(m / t));
    return Math.max(0, Math.min(1, 0.5 + 0.5 * f));
  }
  if (space === 'log1p') {
    const d = Math.log1p(Math.max(hi - lo, 1e-12));
    return Math.max(0, Math.min(1, Math.log1p(Math.max(0, v - lo)) / d));
  }
  return Math.max(0, Math.min(1, (v - lo) / Math.max(hi - lo, 1e-12)));
}

/** The inverse of `axisFraction`, so a tick can be placed by fraction and labelled by value. */
export function axisValue(
  f: number, axis: [number, number], space: ScaleSpace = 'linear', linthresh = 1,
): number {
  const [lo, hi] = axis;
  if (space === 'symlog') {
    const m = Math.max(Math.abs(lo), Math.abs(hi), 1e-12);
    const t = Math.max(linthresh, 1e-12);
    const s = (f - 0.5) * 2;
    return Math.sign(s) * t * Math.expm1(Math.abs(s) * Math.log1p(m / t));
  }
  if (space === 'log1p') return lo + Math.expm1(f * Math.log1p(Math.max(hi - lo, 1e-12)));
  return lo + f * (hi - lo);
}

/**
 * Which lanes a particular mounting is allowed to show.
 *
 * `data-gb-tracks` says what is ON at startup; it says nothing about what is AVAILABLE, so a page
 * that embeds this browser to talk about ONE model would still surface the other model's lanes the
 * moment it grew a track panel. The exclusion is a list of ids or id PREFIXES — `lm-` drops every
 * language-model lane without naming each one, and without breaking when a new one is added.
 *
 * Returns a predicate rather than a filtered list because four separate places enumerate lanes
 * (the URL state, the preset filter, `applyTracks`, and the panel builder) and a lane that is
 * hidden from one of them but not the others is worse than one that is hidden from none.
 */
export function laneExcluder(spec: string | undefined | null): (id: string) => boolean {
  const parts = (spec ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return () => false;
  return (id: string) => parts.some((p) => (p.endsWith('-') ? id.startsWith(p) : id === p));
}

/** True where a track's axis straddles zero, so its bars must grow both ways from a zero rule. */
export function isSignedAxis(axis: [number, number]): boolean {
  return axis[0] < 0 && axis[1] > 0;
}

/**
 * Pearson r over the pairs where BOTH series have data.
 *
 * The browser's score lanes each carry their own no-data mask — phastCons is undefined over 0.65%
 * of the genome and Shorkie's head cannot score the first 1,024 bases of a chromosome — so pairing
 * by index without checking would correlate a real value against a placeholder zero. Returns null
 * rather than 0 when there are too few pairs or either series is constant, because a correlation
 * that could not be computed and a correlation that came out zero are different answers.
 */
export function pearson(a: (number | null)[], b: (number | null)[], minPairs = 8): number | null {
  const n = Math.min(a.length, b.length);
  let k = 0; let sa = 0; let sb = 0;
  for (let i = 0; i < n; i += 1) {
    if (a[i] == null || b[i] == null) continue;
    sa += a[i] as number; sb += b[i] as number; k += 1;
  }
  if (k < minPairs) return null;
  const ma = sa / k; const mb = sb / k;
  let saa = 0; let sbb = 0; let sab = 0;
  for (let i = 0; i < n; i += 1) {
    if (a[i] == null || b[i] == null) continue;
    const da = (a[i] as number) - ma; const db = (b[i] as number) - mb;
    saa += da * da; sbb += db * db; sab += da * db;
  }
  if (saa <= 0 || sbb <= 0) return null;
  return sab / Math.sqrt(saa * sbb);
}

/**
 * The visible region as CSV rows, at the level being drawn.
 *
 * The header names the level in base pairs, because a bin mean and a per-base value are different
 * numbers and a file with neither units nor a bin size is a trap the moment it leaves the browser.
 * Columns are the enabled tracks in lane order; an unscored bin is empty, never 0.
 */
export function exportRows(
  chrom: string, start: number, binBp: number,
  tracks: { id: string; units: string }[],
  columns: (number | null)[][],
): string[] {
  const n = columns.length ? Math.max(...columns.map((c) => c.length)) : 0;
  const head = ['chrom', 'start', 'end',
    ...tracks.map((t) => `${t.id} (${t.units}${binBp > 1 ? `, mean of ${binBp} bp` : ''})`)];
  const out = [head.join(',')];
  for (let i = 0; i < n; i += 1) {
    const s = start + i * binBp;
    out.push([chrom, s, s + binBp,
      ...columns.map((c) => (c[i] == null ? '' : String(Math.round((c[i] as number) * 1e6) / 1e6))),
    ].join(','));
  }
  return out;
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

// ------------------------------------------------------------------------------------------------
// Lanes
// ------------------------------------------------------------------------------------------------

/** What a lane draws. The controller switches on this; the layout does not care. */
export type LaneKind = 'ruler' | 'score' | 'sequence' | 'genes' | 'features' | 'motif';

export interface LaneSpec {
  id: string;
  kind: LaneKind;
  label: string;
  /** Content height in CSS pixels, before padding. */
  height: number;
}

/**
 * Where a stacked lane sits. Split out of `Lane` so `laneLayout` can stack ANY spec carrying a
 * height -- the Shorkie viewport has its own lane kinds (logos, a DNA sequence row) and must not
 * have to borrow this file's `LaneKind` to reuse the one function that decides where a lane is.
 */
export interface LanePos {
  /** Top of the lane's CONTENT, padding already applied. */
  top: number;
  /** Top of the lane's box, including its share of the gap. Used for hit-testing. */
  boxTop: number;
  boxHeight: number;
}

export interface Lane extends LaneSpec, LanePos {}

/**
 * THE lane ordering. Panel, canvas and the enumerator all read this one function.
 *
 * Three orderings used to disagree: the panel grouped score tracks by `groupLabels`, the canvas
 * drew them in raw `index.tracks` order with genes last, and the enumerator matched neither while
 * its comment claimed it was "in panel order". A reader ticking a box in the panel then had to
 * find the lane somewhere else in the stack.
 *
 * Score tracks sort by their group's position in `groupOrder` and, within a group, keep the
 * generator's own order -- which is meaningful, since that is where a family's members sit
 * together. A group the order does not name sorts last rather than being dropped. Then the
 * annotation lanes, in the order they are drawn: sequence, features, genes.
 */
export function laneOrder(
  tracks: { id: string; group?: string }[],
  groupOrder: string[],
  featureIds: string[],
): string[] {
  const rank = new Map(groupOrder.map((g, i) => [g, i]));
  const scored = tracks.map((t, i) => ({
    id: t.id,
    g: rank.get(t.group ?? '') ?? groupOrder.length,
    i,
  }));
  scored.sort((a, b) => a.g - b.g || a.i - b.i);
  return [...scored.map((s) => s.id), 'sequence', ...featureIds, 'genes'];
}

/**
 * Stack lanes and return where each one's content sits.
 *
 * Pure, and that is the point: the canvas height, the drawing offsets and the hit-testing all read
 * this one function, so they cannot disagree about where a lane is. The previous single-track
 * version computed offsets inline at three separate places and adding a fourth lane meant editing
 * all of them.
 */
export function laneLayout<T extends { height: number }>(
  specs: T[], gap = 8,
): { lanes: (T & LanePos)[]; total: number } {
  const lanes: (T & LanePos)[] = [];
  let y = 0;
  for (const s of specs) {
    const h = Math.max(1, Math.round(s.height));
    lanes.push({ ...s, height: h, top: y + gap, boxTop: y, boxHeight: h + gap });
    y += h + gap;
  }
  return { lanes, total: y };
}

/** The lane whose box contains `y`, or null above/below the stack. */
export function laneAt<T extends LanePos>(lanes: T[], y: number): T | null {
  for (const l of lanes) {
    if (y >= l.boxTop && y < l.boxTop + l.boxHeight) return l;
  }
  return null;
}

// ------------------------------------------------------------------------------------------------
// Brushing
// ------------------------------------------------------------------------------------------------

/**
 * A drag into a selected region, or null when the drag was really a click.
 *
 * The threshold is in BASE PAIRS rather than pixels because the caller has already converted, and
 * because what counts as "a click by intent" depends on the zoom: two pixels at whole-chromosome
 * zoom is 2 kb. `bindFocusDrag` on the playground establishes the same rule at a fixed 20 bp; here
 * the caller passes the pixel threshold converted at the current scale.
 *
 * Returns a normalised half-open range, so dragging right-to-left works without the caller
 * remembering to sort.
 */
export function brushRegion(
  anchorBp: number, currentBp: number, minBp: number,
): { start: number; end: number } | null {
  const a = Math.min(anchorBp, currentBp);
  const b = Math.max(anchorBp, currentBp);
  if (b - a < Math.max(1, minBp)) return null;
  return { start: Math.round(a), end: Math.round(b) };
}

// ------------------------------------------------------------------------------------------------
// Feature density
// ------------------------------------------------------------------------------------------------

/**
 * Per-column coverage of a feature set across the view, as a FRACTION of each column covered.
 *
 * Drawn instead of the features themselves once they are too dense to distinguish: 190,579
 * conserved-only TFBS calls genome-wide is not a drawing at chromosome zoom, it is a solid bar. A
 * count would be misleading in the other direction -- one 800 bp regulatory region and one 6 bp
 * motif would score the same -- so this measures how much of each column is covered, clamped at 1.
 *
 * `starts`/`lengths` are parallel arrays because that is how the packs store them, and converting
 * to objects to summarise 200k features would allocate more than it computes.
 */
export function featureDensity(
  starts: ArrayLike<number>, lengths: ArrayLike<number>,
  viewStart: number, viewEnd: number, columns: number,
): Float64Array {
  const out = new Float64Array(Math.max(1, columns));
  const span = Math.max(1e-9, viewEnd - viewStart);
  const bpPerCol = span / out.length;
  for (let i = 0; i < starts.length; i += 1) {
    const s = starts[i];
    const e = s + lengths[i];
    if (e <= viewStart || s >= viewEnd) continue;
    const lo = Math.max(s, viewStart);
    const hi = Math.min(e, viewEnd);
    const c0 = Math.floor((lo - viewStart) / bpPerCol);
    const c1 = Math.min(out.length - 1, Math.floor((hi - viewStart - 1e-9) / bpPerCol));
    for (let c = c0; c <= c1; c += 1) {
      const colLo = viewStart + c * bpPerCol;
      const colHi = colLo + bpPerCol;
      out[c] += (Math.min(hi, colHi) - Math.max(lo, colLo)) / bpPerCol;
    }
  }
  for (let c = 0; c < out.length; c += 1) out[c] = Math.min(1, out[c]);
  return out;
}

// ------------------------------------------------------------------------------------------------
// Search
// ------------------------------------------------------------------------------------------------

/** One row of `search.json`: id, chrom, start, end, strand, aliases. */
export type SearchGene = [string, string, number, number, number, string[]];

export interface SearchIndex { genes: SearchGene[] }

/**
 * Resolve a query to a view: a gene name, a systematic id, or a locus string.
 *
 * Names first, coordinates second. A yeast systematic id like `YGR192C` is not a valid locus, and a
 * common name like `TDH3` is not either, so there is no ambiguity to resolve -- but the order still
 * matters for the one case that is both: nothing in sacCer3 is named like `chrIV`, and `parseLocus`
 * would happily read a bare chromosome name as the whole chromosome, which is the right answer.
 *
 * Matching is case-insensitive and exact. A prefix match would make `RPL4` silently jump to
 * `RPL4A`, which is a different gene.
 */
export function searchLocus(
  query: string, index: SearchIndex | null, chroms: ChromInfo[], padBp = 500,
): View | null {
  const q = String(query).trim();
  if (!q) return null;
  const direct = parseLocus(q, chroms);
  if (direct) return direct;
  if (!index) return null;
  const want = q.toUpperCase();
  for (const g of index.genes) {
    const [id, chrom, start, end] = g;
    const aliases = g[5] || [];
    if (id.toUpperCase() === want || aliases.some((a) => a.toUpperCase() === want)) {
      const info = chroms.find((c) => c.name === chrom);
      if (!info) return null;
      return { chrom, ...clampView(start - padBp, end + padBp, info.length) };
    }
  }
  return null;
}

/** Up to `limit` genes whose id or an alias starts with `q`, for a suggestion list. */
export function searchSuggest(q: string, index: SearchIndex | null, limit = 8): SearchGene[] {
  const want = String(q).trim().toUpperCase();
  if (!want || !index) return [];
  const out: SearchGene[] = [];
  for (const g of index.genes) {
    const names = [g[0], ...(g[5] || [])];
    if (names.some((n) => n.toUpperCase().startsWith(want))) out.push(g);
    if (out.length >= limit) break;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// Navigation history
// ------------------------------------------------------------------------------------------------

export interface History { entries: View[]; at: number }

export const emptyHistory = (): History => ({ entries: [], at: -1 });

/**
 * Push a view, dropping anything ahead of the cursor.
 *
 * Browser-style: navigating after going back discards the forward branch. A view identical to the
 * current one is not pushed, so holding a pan key does not fill the history with 200 entries that
 * all look the same and make "back" useless.
 */
export function historyPush(h: History, v: View, cap = 60): History {
  const cur = h.entries[h.at];
  if (cur && cur.chrom === v.chrom && cur.start === v.start && cur.end === v.end) return h;
  const entries = h.entries.slice(0, h.at + 1);
  entries.push(v);
  const over = Math.max(0, entries.length - cap);
  return { entries: entries.slice(over), at: entries.length - over - 1 };
}

export const canGoBack = (h: History): boolean => h.at > 0;
export const canGoForward = (h: History): boolean => h.at >= 0 && h.at < h.entries.length - 1;

export function historyBack(h: History): { history: History; view: View } | null {
  if (!canGoBack(h)) return null;
  const at = h.at - 1;
  return { history: { ...h, at }, view: h.entries[at] };
}

export function historyForward(h: History): { history: History; view: View } | null {
  if (!canGoForward(h)) return null;
  const at = h.at + 1;
  return { history: { ...h, at }, view: h.entries[at] };
}

// ------------------------------------------------------------------------------------------------
// The URL hash
// ------------------------------------------------------------------------------------------------

export interface ViewState {
  view: View;
  /** Enabled track ids, in draw order. */
  tracks: string[];
  /** A region of interest that survives navigation, or null. */
  roi: { start: number; end: number } | null;
  /** Index of the output track the per-locus lane is showing, when that lane is enabled. */
  locusTrack?: number;
  /** Which network's lanes are on offer: 'both', 'shorkie' or 'lm'. */
  model?: string;
}

/**
 * `chrIV:1000-2000;t=lm-masked,phastcons;roi=1200-1400`
 *
 * The track set lives in the hash because a link to "this locus" that silently drops which tracks
 * were on is a link to a different picture. Locus stays FIRST and comma-free so an old
 * `#chrIV:1000-2000` link still parses.
 */
export function encodeViewState(s: ViewState): string {
  const parts = [formatLocus(s.view).replace(/,/g, '')];
  if (s.tracks.length) parts.push(`t=${s.tracks.join(',')}`);
  if (s.roi) parts.push(`roi=${Math.round(s.roi.start)}-${Math.round(s.roi.end)}`);
  // Which of the 5,215 the per-locus lane is showing. Omitted unless that lane is on, so an
  // ordinary link stays short and an older link still decodes.
  if (s.locusTrack != null) parts.push(`k=${s.locusTrack}`);
  if (s.model && s.model !== 'both') parts.push(`m=${s.model}`);
  return parts.join(';');
}

export type DecodedViewState = Omit<Partial<ViewState>, 'view'> & { view: View | null };

export function decodeViewState(hash: string, chroms: ChromInfo[]): DecodedViewState {
  const raw = String(hash).replace(/^#/, '');
  const [locus, ...rest] = raw.split(';');
  const view = parseLocus(locus, chroms);
  const out: DecodedViewState = { view };
  for (const part of rest) {
    const [k, v] = part.split('=');
    if (k === 't' && v) out.tracks = v.split(',').filter(Boolean);
    if (k === 'k' && v && Number.isFinite(Number(v))) out.locusTrack = Number(v);
    if (k === 'm' && (v === 'shorkie' || v === 'lm' || v === 'both')) out.model = v;
    if (k === 'roi' && v) {
      const [a, b] = v.split('-').map(Number);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        out.roi = { start: Math.min(a, b), end: Math.max(a, b) };
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// Chromosome order
// ------------------------------------------------------------------------------------------------

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

/**
 * A roman numeral to its value, or null if the string is not one.
 *
 * `chrM` is the trap: M is a perfectly good roman numeral for 1000, so a naive parser sorts the
 * mitochondrial chromosome after chrXVI by accident and looks correct. It is rejected explicitly
 * below rather than relied on to land last.
 */
export function romanValue(s: string): number | null {
  if (!s || !/^[IVXLCDM]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i += 1) {
    const v = ROMAN[s[i]];
    const next = i + 1 < s.length ? ROMAN[s[i + 1]] : 0;
    total += v < next ? -v : v;
  }
  return total;
}

/**
 * Order chromosomes the way a yeast biologist names them: chrI, chrII, … chrXVI, then chrM.
 *
 * Neither obvious sort works. By NAME, `chrIX` sorts before `chrV` because it is lexical. By
 * LENGTH — which is what this shipped with — the list reads chrIV, chrXV, chrVII, chrXII, and a
 * reader looking for chrII has to hunt. And `chrM` cannot be ordered by its numeral: M is 1000, so
 * a roman-aware sort puts the mitochondrion last for the wrong reason and would put a hypothetical
 * `chrD` (500) after chrXVI too. Anything without a I–XVI numeral sorts last, alphabetically among
 * itself, and the mitochondrial chromosome lands last because it is not numbered — which is true.
 */
export function chromOrder(a: string, b: string): number {
  const key = (name: string): [number, string] => {
    const m = /^chr([IVXLCDM]+)$/i.exec(name.trim());
    const v = m ? romanValue(m[1].toUpperCase()) : null;
    // 1..16 is the nuclear set; anything else (chrM, a scaffold, a plasmid) goes after it.
    return v !== null && v >= 1 && v <= 16 ? [v, name] : [Number.MAX_SAFE_INTEGER, name];
  };
  const [av, an] = key(a);
  const [bv, bn] = key(b);
  return av - bv || an.localeCompare(bn);
}


// ------------------------------------------------------------------------------------------------
// Pinch
// ------------------------------------------------------------------------------------------------

/**
 * The zoom a two-finger pinch implies, and the base it should be anchored on.
 *
 * Expressed as a factor for `zoomAbout`, which already keeps a chosen base under a chosen point --
 * so a pinch is that same operation driven by fingers rather than a wheel. `factor` is the
 * RECIPROCAL of the finger-distance ratio: spreading the fingers apart (a growing distance) means
 * zooming IN, which means a smaller span.
 *
 * Returns null when the gesture cannot be interpreted -- a zero starting distance, or a factor so
 * close to 1 that it is jitter rather than intent. Acting on jitter makes a pinch feel like it
 * drifts when a finger is merely resting.
 */
export function pinchZoom(
  startDistancePx: number, currentDistancePx: number, deadZone = 0.02,
): number | null {
  if (!(startDistancePx > 0) || !(currentDistancePx > 0)) return null;
  const factor = startDistancePx / currentDistancePx;
  if (!Number.isFinite(factor) || factor <= 0) return null;
  if (Math.abs(factor - 1) < deadZone) return null;
  return factor;
}

/** Euclidean distance between two points, for the pinch. */
export const pointDistance = (
  ax: number, ay: number, bx: number, by: number,
): number => Math.hypot(ax - bx, ay - by);

/** Midpoint of two points: the anchor a pinch zooms about. */
export const pointMidpoint = (
  ax: number, ay: number, bx: number, by: number,
): { x: number; y: number } => ({ x: (ax + bx) / 2, y: (ay + by) / 2 });


// ------------------------------------------------------------------------------------------------
// Ideogram
// ------------------------------------------------------------------------------------------------

export interface IdeogramBar {
  name: string;
  /** Left edge, in px from the strip's left inset. */
  x: number;
  /** Drawn width, in px. STRICTLY proportional to length -- see the note on `ideogramLayout`. */
  w: number;
  length: number;
  /** Centre, in px. The hit test resolves to the nearest of these. */
  cx: number;
}

/**
 * All 17 chromosomes laid out side by side, STRICTLY to scale.
 *
 * The point of a genome-level strip is that chrM really is 5.6% of chrIV, so a minimum bar width --
 * the obvious fix for "chrM is too small to click" -- would be the same lie as a bar chart drawn
 * from a non-zero baseline: it distorts the one channel a bar is read by, and the reader has no way
 * to know which bars were widened. So nothing is widened. Clickability is solved separately, by
 * `ideogramHit` resolving to the nearest centre rather than requiring a hit inside the bar, which
 * is the rule the flow canvas on /shorkie-lab/shorkie/ already uses for the same reason.
 *
 * `gap` is fixed rather than proportional: it is inter-chromosome whitespace, not sequence, and
 * scaling it with the bars would make the gaps read as intergenic distance.
 */
export function ideogramLayout(
  chroms: { name: string; length: number }[], width: number, gap = 3,
): IdeogramBar[] {
  const ordered = [...chroms].sort((a, b) => chromOrder(a.name, b.name));
  if (!ordered.length || !(width > 0)) return [];
  const total = ordered.reduce((s, c) => s + Math.max(0, c.length), 0);
  if (!(total > 0)) return [];
  // Gaps come out of the width before anything is scaled, so the bars still sum to exactly the
  // sequence available to them and the strip cannot overflow its canvas.
  const g = ordered.length > 1 ? Math.max(0, Math.min(gap, (width * 0.5) / (ordered.length - 1))) : 0;
  const usable = Math.max(1, width - g * (ordered.length - 1));
  let x = 0;
  const out: IdeogramBar[] = [];
  for (const c of ordered) {
    const w = (Math.max(0, c.length) / total) * usable;
    out.push({ name: c.name, x, w, length: c.length, cx: x + w / 2 });
    x += w + g;
  }
  return out;
}

/**
 * Which chromosome a click at `px` means: the NEAREST bar centre, never a containment test.
 *
 * chrM is 8 px wide on a 1,200 px strip and 2 px on a phone, so requiring the pointer to land
 * inside the bar makes the smallest chromosomes unreachable -- and, worse, makes a click in a gap
 * do nothing, which reads as a broken control rather than as a missed target.
 */
export function ideogramHit(bars: IdeogramBar[], px: number): string | null {
  if (!bars.length) return null;
  let best = bars[0];
  let bestD = Math.abs(px - best.cx);
  for (const b of bars) {
    const d = Math.abs(px - b.cx);
    if (d < bestD) { best = b; bestD = d; }
  }
  return best.name;
}


// ------------------------------------------------------------------------------------------------
// Sequence search
// ------------------------------------------------------------------------------------------------

/**
 * IUPAC codes as 4-bit masks over A,C,G,T (bit 0 = A, 1 = C, 2 = G, 3 = T).
 *
 * A mask rather than a character class because matching then costs one AND per position, and
 * because the reverse complement of a degenerate code falls out of reversing the bits rather than
 * needing a second lookup table that could disagree with this one.
 */
const IUPAC: Record<string, number> = {
  A: 0b0001, C: 0b0010, G: 0b0100, T: 0b1000, U: 0b1000,
  R: 0b0101, Y: 0b1010, S: 0b0110, W: 0b1001, K: 0b1100, M: 0b0011,
  B: 0b1110, D: 0b1101, H: 0b1011, V: 0b0111, N: 0b1111,
};

/** Base letters in mask-bit order, so `BASE_BIT[c]` is the bit `c` sets. */
const BASE_BIT: Record<string, number> = { A: 0b0001, C: 0b0010, G: 0b0100, T: 0b1000 };

/** A pattern to per-position masks, or null if it contains anything that is not IUPAC. */
export function parseMotif(pattern: string): number[] | null {
  const p = pattern.trim().toUpperCase().replace(/[\s\-.]/g, '');
  if (!p) return null;
  const out: number[] = [];
  for (const c of p) {
    const m = IUPAC[c];
    if (m === undefined) return null;
    out.push(m);
  }
  return out;
}

/**
 * The reverse complement of a MASK pattern: reverse the order, and swap A<->T and C<->G within
 * each mask.
 *
 * Done on the masks rather than on the letters because a degenerate code's complement is another
 * degenerate code (R->Y, K->M, B->V) and a second lookup table for that is a second place to be
 * wrong. Swapping bits 0<->3 and 1<->2 is the same operation and cannot disagree with `IUPAC`.
 */
export function rcMasks(masks: number[]): number[] {
  const out: number[] = [];
  for (let i = masks.length - 1; i >= 0; i -= 1) {
    const m = masks[i];
    out.push(((m & 0b0001) << 3) | ((m & 0b1000) >> 3) | ((m & 0b0010) << 1) | ((m & 0b0100) >> 1));
  }
  return out;
}

export interface MotifHit {
  /** 0-based, inclusive. */
  start: number;
  /** 0-based, exclusive. */
  end: number;
  strand: '+' | '-';
}

/**
 * Every position where `masks` matches `seq`, optionally on both strands.
 *
 * `seq` is plain ACGT/N text. A base that is not ACGT matches NOTHING, not even N in the pattern:
 * an unknown base is an absence of information, and reporting a hit over it would be claiming a
 * match to sequence nobody has. Overlapping hits are all reported -- a tandem repeat genuinely
 * contains overlapping copies, and reporting only the first would undercount it.
 *
 * A palindromic motif matches identically on both strands at the same position. Those are reported
 * ONCE, as '+', because two entries for one piece of DNA would double every count of a
 * restriction site -- and most restriction sites are palindromes.
 */
export function findMotif(seq: string, masks: number[], bothStrands = true): MotifHit[] {
  const n = masks.length;
  const out: MotifHit[] = [];
  if (!n || seq.length < n) return out;
  const rc = bothStrands ? rcMasks(masks) : null;
  const same = rc ? rc.every((m, i) => m === masks[i]) : false;
  for (let i = 0; i + n <= seq.length; i += 1) {
    let fwd = true;
    let rev = rc != null && !same;
    for (let j = 0; j < n && (fwd || rev); j += 1) {
      const bit = BASE_BIT[seq[i + j]] ?? 0;
      if (fwd && !(masks[j] & bit)) fwd = false;
      if (rev && !(rc![j] & bit)) rev = false;
    }
    if (fwd) out.push({ start: i, end: i + n, strand: '+' });
    else if (rev) out.push({ start: i, end: i + n, strand: '-' });
  }
  return out;
}

/** How many distinct sequences a pattern matches -- the number a reader needs to judge a hit count. */
export function motifDegeneracy(masks: number[]): number {
  let n = 1;
  for (const m of masks) {
    n *= (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
    if (n > 1e12) return Infinity;
  }
  return n;
}

/**
 * Roughly how many hits a pattern is EXPECTED to have by chance in `bases` of sequence.
 *
 * Printed beside the real count, because a hit count alone cannot be judged: 6 bp of exact sequence
 * occurs ~2,970 times in this genome by chance on two strands, and a reader who does not know that
 * reads 3,000 hits as a finding. Uses a uniform base composition, which for a 38.1% GC genome is
 * close enough to set the order of magnitude and is stated rather than hidden.
 */
export function expectedHits(masks: number[], bases: number, bothStrands = true): number {
  let p = 1;
  for (const m of masks) {
    p *= ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1)) / 4;
  }
  const span = Math.max(0, bases - masks.length + 1);
  // A SELF-COMPLEMENTARY pattern must not be doubled. Every plus-strand match of a palindrome is
  // also a minus-strand match AT THE SAME POSITION, and `findMotif` reports it once -- so doubling
  // would put the expectation at twice the count for exactly the patterns people search most,
  // since most restriction sites are palindromes. GAATTC in this genome: 2,968 expected, not 5,936.
  const rc = rcMasks(masks);
  const palindrome = rc.every((m, i) => m === masks[i]);
  return p * span * (bothStrands && !palindrome ? 2 : 1);
}


// ------------------------------------------------------------------------------------------------
// Default track sets, per model mode
// ------------------------------------------------------------------------------------------------

export type ModelMode = 'both' | 'shorkie' | 'lm';

/**
 * What each model mode opens with.
 *
 * A mode is a question, and its default answer is the set of lanes that answers it. "Shorkie" asks
 * what an assay would measure and which bases drove it, so it opens with the prediction and all
 * three attribution methods; "Shorkie_LM" asks how constrained a base is, so it opens with both
 * passes; "Both" is the comparison and opens with all six.
 *
 * phastCons, the gene models and the sequence belong to NEITHER model — they are the independent
 * check and the coordinates everything else is read against — so they are in every mode. That is
 * also why they survive a mode switch: `laneHidden` only hides a lane whose `group` the mode
 * excludes, and these have no model group at all.
 */
export const MODEL_DEFAULT_TRACKS: Record<ModelMode, string[]> = {
  both: ['sk-rnaseq', 'lm-masked', 'lm-unmasked', 'sk-gradient', 'sk-ig', 'sk-ism',
    'phastcons', 'genes', 'sequence'],
  shorkie: ['sk-rnaseq', 'sk-gradient', 'sk-ig', 'sk-ism', 'phastcons', 'genes', 'sequence'],
  lm: ['lm-masked', 'lm-unmasked', 'phastcons', 'genes', 'sequence'],
};

/**
 * The narrow defaults. FEWER LANES, NOT DIFFERENT ONES — each is a strict subset of its wide
 * counterpart, which `genomeBrowser.test.ts` asserts.
 *
 * Nine lanes is roughly 920 px of canvas. On a 664 px phone viewport that puts the track below the
 * fold before a single base is visible, so the phone opens on one lane per question: the
 * prediction, the exact attribution, and the constraint pass.
 */
export const MODEL_DEFAULT_TRACKS_NARROW: Record<ModelMode, string[]> = {
  both: ['lm-masked', 'sk-rnaseq', 'sk-ism', 'genes', 'sequence'],
  shorkie: ['sk-rnaseq', 'sk-ism', 'genes', 'sequence'],
  lm: ['lm-masked', 'genes', 'sequence'],
};

/** The lanes a mode opens with, at this width. */
export function defaultTracksFor(mode: ModelMode, narrow: boolean): string[] {
  return (narrow ? MODEL_DEFAULT_TRACKS_NARROW : MODEL_DEFAULT_TRACKS)[mode] ?? [];
}


// ------------------------------------------------------------------------------------------------
// Step to the next / previous gene
// ------------------------------------------------------------------------------------------------

/**
 * The gene to jump to from a view, in a direction.
 *
 * Anchored on the view's CENTRE, not its edges: at 100 kb a dozen genes are on screen and "next"
 * anchored on the right edge skips every one of them, while anchored on the centre it walks them
 * one at a time whatever the zoom. Genes are ordered by start and the comparison is strict, so a
 * gene already centred is never the answer to either direction and repeated presses always move.
 *
 * Overlapping genes are ordered by start then end, which is the order the gene lane packs them in,
 * so stepping visits them in the order they are drawn.
 *
 * Returns null only when there are no genes at all. At the ends it WRAPS, like the sequence-search
 * stepper: a reader walking a chromosome should not have to notice which end they are at.
 */
export function stepGene<T extends { txStart: number; txEnd: number }>(
  genes: readonly T[], centreBp: number, dir: 1 | -1,
): T | null {
  if (!genes.length) return null;
  const sorted = [...genes].sort((a, b) => a.txStart - b.txStart || a.txEnd - b.txEnd);
  const mid = (g: T) => (g.txStart + g.txEnd) / 2;
  if (dir === 1) {
    return sorted.find((g) => mid(g) > centreBp + 0.5) ?? sorted[0];
  }
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (mid(sorted[i]) < centreBp - 0.5) return sorted[i];
  }
  return sorted[sorted.length - 1];
}

/**
 * The view that frames a gene, with a margin so its edges are visible rather than flush.
 *
 * 20% of the gene's own length on each side: a fixed padding in base pairs would swamp a 300 bp
 * gene and be invisible around a 10 kb one. Floored at `MIN_VIEW_BP` so a very short feature does
 * not produce a view narrower than the browser can hold.
 */
export function frameGene(
  gene: { txStart: number; txEnd: number }, chromLength: number,
): { start: number; end: number } {
  const len = Math.max(1, gene.txEnd - gene.txStart);
  const pad = Math.max(50, len * 0.2);
  const want = Math.max(MIN_VIEW_BP, len + pad * 2);
  const centre = (gene.txStart + gene.txEnd) / 2;
  return clampView(centre - want / 2, centre + want / 2, chromLength);
}
