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

// ------------------------------------------------------------------------------------------------
// Lanes
// ------------------------------------------------------------------------------------------------

/** What a lane draws. The controller switches on this; the layout does not care. */
export type LaneKind = 'ruler' | 'score' | 'sequence' | 'genes' | 'features';

export interface LaneSpec {
  id: string;
  kind: LaneKind;
  label: string;
  /** Content height in CSS pixels, before padding. */
  height: number;
}

export interface Lane extends LaneSpec {
  /** Top of the lane's CONTENT, padding already applied. */
  top: number;
  /** Top of the lane's box, including its share of the gap. Used for hit-testing. */
  boxTop: number;
  boxHeight: number;
}

/**
 * Stack lanes and return where each one's content sits.
 *
 * Pure, and that is the point: the canvas height, the drawing offsets and the hit-testing all read
 * this one function, so they cannot disagree about where a lane is. The previous single-track
 * version computed offsets inline at three separate places and adding a fourth lane meant editing
 * all of them.
 */
export function laneLayout(specs: LaneSpec[], gap = 8): { lanes: Lane[]; total: number } {
  const lanes: Lane[] = [];
  let y = 0;
  for (const s of specs) {
    const h = Math.max(1, Math.round(s.height));
    lanes.push({ ...s, height: h, top: y + gap, boxTop: y, boxHeight: h + gap });
    y += h + gap;
  }
  return { lanes, total: y };
}

/** The lane whose box contains `y`, or null above/below the stack. */
export function laneAt(lanes: Lane[], y: number): Lane | null {
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
    if (k === 'roi' && v) {
      const [a, b] = v.split('-').map(Number);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        out.roi = { start: Math.min(a, b), end: Math.max(a, b) };
      }
    }
  }
  return out;
}
