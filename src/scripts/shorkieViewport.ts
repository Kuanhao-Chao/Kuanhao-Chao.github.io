/**
 * Canvas drawing for the Shorkie per-locus viewport.
 *
 * One canvas, one horizontal mapping, lanes stacked by `laneLayout`. The page used to draw a
 * coverage SVG, an attribution canvas, a method strip and an annotation canvas as four separate
 * elements, each computing its own inset -- so the same base pair landed at four different x
 * positions at every container width but ~1,043 px, and the gate that was supposed to catch it
 * compared the tracks' INTENT strings rather than their geometry. There is one element now and the
 * mapping is `VpCtx.xOfBp`, so the disagreement is not expressible.
 *
 * Every function here takes its geometry and its colours explicitly. Nothing reads the DOM except
 * to measure text, and nothing reads a CSS custom property -- the page resolves those once per
 * repaint and passes a `VpTheme`, because `getComputedStyle` inside a per-pixel loop is what made
 * an earlier raster cost 47 ms a keystroke.
 */

import {
  BASES, type Base, LOGO_COLOURS, LOGO_GLYPHS, LOGO_GLOBSCALE, logoColumn, logoRange,
  BIN_BP, CROP_BP, N_BINS, SEQ_LEN, logAxis,
} from '../lib/shorkieModel';
import { type View, rulerTicks } from '../lib/genomeBrowser';
import { type VpLaneSpec } from '../lib/shorkieViewport';
import { type LanePos } from '../lib/genomeBrowser';

export type VpLane = VpLaneSpec & LanePos;

/** Colours resolved once per repaint. Molecular letter colours are NOT here -- see below. */
export interface VpTheme {
  ink: string;
  muted: string;
  rule: string;
  accent: string;
  track: string;
  orf: string;
  fire: string;
  bg: string;
}

export interface VpCtx {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels. Never floored to a minimum: a backing store wider than its box puts every
   *  horizontal coordinate off by that ratio, uniformly, so nothing looks broken. */
  width: number;
  view: View;
  left: number;
  right: number;
  theme: VpTheme;
  xOfBp: (bp: number) => number;
}

export const VP_PLOT = { left: 46, right: 10 } as const;

export const innerWidth = (width: number): number =>
  Math.max(1, width - VP_PLOT.left - VP_PLOT.right);

/** Clip to the plot area. Gene and feature lanes draw SPANS and would otherwise run into the
 *  gutter, straight over the axis labels — the score lanes draw column by column and never can. */
export function withPlotClip(c: VpCtx, fn: () => void): void {
  const { ctx } = c;
  ctx.save();
  ctx.beginPath();
  ctx.rect(c.left, 0, Math.max(1, c.width - c.left - c.right), 1e5);
  ctx.clip();
  fn();
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------
// Lane furniture
// ------------------------------------------------------------------------------------------------

/**
 * The lane's name, in the gutter, on a chip.
 *
 * Outside the plot clip by design: the gutter is where a lane says what it is. On a chip because a
 * lane whose data saturates -- coverage through a gene body -- puts a bare label on top of its own
 * ink. Falls back to `short` rather than truncating: `Chromosome structure` clipped to
 * `me structure` reads as a different label, not a cut-off one.
 */
export function drawLaneLabel(c: VpCtx, lane: VpLane): void {
  const { ctx } = c;
  ctx.save();
  ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'top';
  const room = c.left - 4;
  const name = ctx.measureText(lane.label).width <= room ? lane.label : lane.short;
  const w = ctx.measureText(name).width;
  ctx.fillStyle = c.theme.bg;
  ctx.globalAlpha = 0.82;
  ctx.fillRect(1, lane.top - 1, w + 4, 12);
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.theme.muted;
  ctx.fillText(name, 3, lane.top);
  ctx.restore();
}

/**
 * A note on the right of a lane: its resolution, its scoring target, whether it has fallen back.
 *
 * Drops trailing clauses until it fits. A right-aligned note and a left-aligned label on one
 * baseline simply overlap at 320 px, and a canvas has no `overflow` to report it.
 */
export function drawLaneNote(c: VpCtx, lane: VpLane, parts: string[]): void {
  const { ctx } = c;
  if (!parts.length) return;
  ctx.save();
  ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'right';
  ctx.fillStyle = c.theme.muted;
  const room = Math.max(40, c.width - c.right - c.left - 130);
  let use = parts.slice();
  while (use.length > 1 && ctx.measureText(use.join(' · ')).width > room) use.pop();
  const s = use.join(' · ');
  if (ctx.measureText(s).width <= room) ctx.fillText(s, c.width - c.right, lane.top);
  ctx.restore();
}

/** The zero rule a signed lane grows both ways from. */
function zeroRule(c: VpCtx, lane: VpLane): number {
  const mid = lane.top + lane.height / 2;
  const { ctx } = c;
  ctx.save();
  ctx.strokeStyle = c.theme.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(c.left, mid + 0.5);
  ctx.lineTo(c.width - c.right, mid + 0.5);
  ctx.stroke();
  ctx.restore();
  return mid;
}

// ------------------------------------------------------------------------------------------------
// Ruler
// ------------------------------------------------------------------------------------------------

/**
 * Position, in both coordinate systems.
 *
 * The genome coordinate is what a reader pastes into a browser; the window offset is what every
 * plane on this page is indexed by. A ruler carrying only one of them makes half the page's
 * numbers unlocatable.
 */
export function drawRuler(
  c: VpCtx, lane: VpLane, locusChrom: string, locusStart: number,
): void {
  const { ctx } = c;
  const y = lane.top;
  ctx.save();
  ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'top';
  ctx.strokeStyle = c.theme.rule;
  ctx.fillStyle = c.theme.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(c.left, y + lane.height - 0.5);
  ctx.lineTo(c.width - c.right, y + lane.height - 0.5);
  ctx.stroke();

  const ticks = rulerTicks(c.view, Math.max(3, Math.round(innerWidth(c.width) / 96)));
  for (const t of ticks) {
    const x = c.xOfBp(t);
    if (x < c.left - 1 || x > c.width - c.right + 1) continue;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y + lane.height - 5);
    ctx.lineTo(x + 0.5, y + lane.height);
    ctx.stroke();
    // The first tick anchors left and the last right: a label centred on the axis endpoint is
    // clipped mid-number, which reads as a different coordinate rather than a cut-off one.
    ctx.textAlign = t === ticks[0] && x < c.left + 20 ? 'left'
      : t === ticks[ticks.length - 1] && x > c.width - c.right - 20 ? 'right' : 'center';
    // 1-based, matching `zoomReadout` and matching what every genome browser prints. Mixing the
    // two conventions in one panel is how a coordinate comes to be off by one for half its
    // readers -- the ruler said 875,118 while the readout beside it said 875,119.
    ctx.fillText((locusStart + t + 1).toLocaleString('en-US'), x, y + 1);
  }
  ctx.textAlign = 'left';
  ctx.restore();
  // The chromosome name is NOT drawn here. The gutter is 46 px and already carries the lane's own
  // label, so a second string at the same x rendered as `pos/II` -- two labels overprinted, which
  // reads as a corrupted word rather than as a collision. It lives in the readout and the caption.
  void locusChrom;
}

// ------------------------------------------------------------------------------------------------
// Score lanes
// ------------------------------------------------------------------------------------------------

export interface CoverageOpts {
  /** 896 bin values. */
  values: ArrayLike<number>;
  /** The unedited curve, drawn dashed, when an edit has moved the live one. */
  reference?: ArrayLike<number> | null;
  useLog: boolean;
  /** The window-relative range the reader traced, marked on the curve it was selected from. */
  traced?: { start: number; end: number } | null;
  /** The window the paper's figure prints, in bins. */
  figure?: { binStart: number; binEnd: number; label: string } | null;
  colour?: string;
}

/**
 * The 896-bin coverage curve, drawn where its bins actually fall.
 *
 * Bin i covers `CROP_BP + i*BIN_BP`. The head crops 1,024 bp from each end, so the flanks are
 * shaded rather than the curve being stretched to fill them — every output bin's receptive field is
 * the whole 16,384 bp, so the flanks are real input the model reads and never predicts.
 */
export function drawCoverageLane(c: VpCtx, lane: VpLane, o: CoverageOpts): number {
  const { ctx } = c;
  const n = Math.min(N_BINS, o.values.length);
  let max = 1e-6;
  for (let i = 0; i < n; i += 1) max = Math.max(max, Number(o.values[i]) || 0);

  const top = lane.top + 2;
  const bottom = lane.top + lane.height;
  const bx = (i: number) => c.xOfBp(CROP_BP + i * BIN_BP);
  const yOf = (v: number) =>
    bottom - (o.useLog ? logAxis(v, max) : v / max) * (bottom - top);

  withPlotClip(c, () => {
    // The cropped flanks.
    ctx.save();
    ctx.fillStyle = c.theme.rule;
    ctx.globalAlpha = 0.35;
    const l0 = c.xOfBp(0); const l1 = c.xOfBp(CROP_BP);
    const r0 = c.xOfBp(SEQ_LEN - CROP_BP); const r1 = c.xOfBp(SEQ_LEN);
    if (l1 > c.left) ctx.fillRect(l0, top, l1 - l0, bottom - top);
    if (r0 < c.width - c.right) ctx.fillRect(r0, top, r1 - r0, bottom - top);
    ctx.restore();

    if (o.figure) {
      ctx.save();
      ctx.fillStyle = c.theme.orf;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(bx(o.figure.binStart), top,
        Math.max(bx(o.figure.binEnd) - bx(o.figure.binStart), 2), bottom - top);
      ctx.restore();
    }
    if (o.traced) {
      ctx.save();
      ctx.fillStyle = c.theme.accent;
      ctx.globalAlpha = 0.13;
      const x0 = c.xOfBp(o.traced.start);
      ctx.fillRect(x0, top, Math.max(c.xOfBp(o.traced.end) - x0, 1.5), bottom - top);
      ctx.restore();
    }

    if (o.reference) {
      ctx.save();
      ctx.strokeStyle = c.theme.muted;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) {
        const v = Number(o.reference[i]) || 0;
        if (i === 0) ctx.moveTo(bx(i), yOf(v)); else ctx.lineTo(bx(i), yOf(v));
      }
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = o.colour ?? c.theme.track;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const v = Number(o.values[i]) || 0;
      if (i === 0) ctx.moveTo(bx(i), yOf(v)); else ctx.lineTo(bx(i), yOf(v));
    }
    ctx.stroke();
    ctx.restore();
  });
  return max;
}

/**
 * A signed attribution lane, grown both ways from a zero rule.
 *
 * Filling from the lane floor instead draws -0.8 and +0.2 as bars of the same sign, which inverts
 * the one thing these lanes report. `at` returns null where the method has no value; a gap means
 * NOT MEASURED and is left blank rather than drawn as zero.
 */
export function drawMethodLane(
  c: VpCtx, lane: VpLane, at: (bp: number) => number | null, peak: number,
): void {
  const { ctx } = c;
  const mid = lane.signed ? zeroRule(c, lane) : lane.top + lane.height;
  const half = lane.signed ? lane.height / 2 - 1 : lane.height - 2;
  const scale = peak > 0 ? half / peak : 0;
  const x0 = Math.floor(c.left);
  const x1 = Math.ceil(c.width - c.right);
  const step = c.view.end - c.view.start;

  withPlotClip(c, () => {
    ctx.save();
    ctx.fillStyle = c.theme.fire;
    // One column of pixels at a time. At base zoom several pixels share a base, which is correct:
    // the lane is drawing the value AT that base, not interpolating between bases.
    for (let x = x0; x < x1; x += 1) {
      const bp = c.view.start + ((x + 0.5 - c.left) / innerWidth(c.width)) * step;
      const v = at(bp);
      if (v === null || !Number.isFinite(v)) continue;
      const h = v * scale;
      if (Math.abs(h) < 0.35) { ctx.fillRect(x, mid - 0.5, 1, 1); continue; }
      ctx.fillRect(x, h >= 0 ? mid - h : mid, 1, Math.abs(h));
    }
    ctx.restore();
  });
}

/** The one output track picked out of the 5,215, on its own axis so switching does not rescale. */
export function drawTrackLane(
  c: VpCtx, lane: VpLane, values: ArrayLike<number>, useLog: boolean, max: number,
): void {
  drawCoverageLane(c, lane, { values, useLog, colour: c.theme.accent } as CoverageOpts);
  void max;
}

// ------------------------------------------------------------------------------------------------
// Logo lanes
// ------------------------------------------------------------------------------------------------

/**
 * A DNA logo lane, through the canonical transform.
 *
 * `translate(centre, baseline); scale(colW * LOGO_GLOBSCALE, -sy)` over `LOGO_GLYPHS`, exactly as
 * the SVG logos and the genome browser's letter view do. `LOGO_OFFSETS` is ALREADY baked into the
 * paths — re-applying it draws letters at a millionth of their size, present in the DOM and
 * invisible on screen. Colours come from `LOGO_COLOURS` and are fixed across all six themes, the
 * way a molecular colour is fixed in a PyMOL figure.
 *
 * Returns what it actually drew, which is what the audit reads. A canvas has no elements to
 * inspect, so the SVG logo's checks -- one letter per column for a projected logo, the paper's four
 * colours and nothing else, glyphs scaled rather than re-typeset -- have to come back as data or
 * they are not checked at all. `letters / columns` is the page's central interpretability claim
 * made countable: mutagenesis ships all four bases and can stack four, while the two gradient
 * methods multiply by a one-hot input and can only ever draw one.
 */
export interface LogoDrawn {
  letters: number;
  columns: number;
  /** The distinct fills used. Must be a subset of the paper's four, and nothing else. */
  colours: string[];
  /** Smallest and largest glyph height in px. Equal heights mean the encoding is gone. */
  minPx: number;
  maxPx: number;
}

export function drawLogoLane(
  c: VpCtx, lane: VpLane, columns: Float64Array[], startBp: number,
): LogoDrawn {
  const { ctx } = c;
  const flat: number[] = [];
  for (const col of columns) for (const v of col) flat.push(v);
  const { lo, hi } = logoRange(flat);
  const span = Math.max(1e-12, hi - lo);
  const top = lane.top + 2;
  const height = lane.height - 4;
  const yOf = (v: number) => top + ((hi - v) / span) * height;
  const colW = innerWidth(c.width) / Math.max(1, c.view.end - c.view.start);
  let letters = 0;
  let drawnCols = 0;
  const colours = new Set<string>();
  let minPx = Infinity;
  let maxPx = 0;

  withPlotClip(c, () => {
    for (let i = 0; i < columns.length; i += 1) {
      const cx = c.xOfBp(startBp + i + 0.5);
      if (cx < c.left - colW || cx > c.width - c.right + colW) continue;
      drawnCols += 1;
      for (const letter of logoColumn(columns[i])) {
        const sy = (letter.value / span) * height * LOGO_GLOBSCALE;
        if (Math.abs(sy) < 0.4) continue;
        ctx.save();
        ctx.fillStyle = LOGO_COLOURS[letter.base];
        ctx.translate(cx, yOf(letter.y));
        // Scale the glyph PATH, never `font-size`: font-size scales width with height, so the
        // letter stops being a logo. The y scale is NEGATIVE because the glyph outlines are y-up
        // with the baseline at 0, and a negative-value letter is drawn mirrored below the rule --
        // the paper's convention, and the same transform both SVG logos on this site use.
        ctx.scale(colW * LOGO_GLOBSCALE, -sy);
        ctx.fill(new Path2D(LOGO_GLYPHS[letter.base]));
        ctx.restore();
        letters += 1;
        colours.add(LOGO_COLOURS[letter.base]);
        minPx = Math.min(minPx, Math.abs(sy));
        maxPx = Math.max(maxPx, Math.abs(sy));
      }
    }
    // The zero rule last, so it reads over the letters that straddle it.
    ctx.save();
    ctx.strokeStyle = c.theme.ink;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.left, yOf(0) + 0.5);
    ctx.lineTo(c.width - c.right, yOf(0) + 0.5);
    ctx.stroke();
    ctx.restore();
  });
  return {
    letters, columns: drawnCols, colours: [...colours].sort(),
    minPx: Number.isFinite(minPx) ? +minPx.toFixed(2) : 0, maxPx: +maxPx.toFixed(2),
  };
}

/**
 * The sequence itself, one letter a base.
 *
 * `fillText` rather than the glyph paths, deliberately: a sequence row is uniform height, so
 * scaling a path would only reproduce what a font already does, and a monospace face keeps the
 * column pitch exactly. The logos above are the opposite case — there height IS the value, and
 * `font-size` would scale width with height and stop it being a logo.
 */
export function drawSequenceLane(
  c: VpCtx, lane: VpLane, sequence: string,
): number {
  const { ctx } = c;
  const colW = innerWidth(c.width) / Math.max(1, c.view.end - c.view.start);
  const size = Math.max(7, Math.min(lane.height - 2, colW * 1.25));
  let drawn = 0;
  withPlotClip(c, () => {
    ctx.save();
    ctx.font = `600 ${size.toFixed(1)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const from = Math.max(0, Math.floor(c.view.start));
    const to = Math.min(sequence.length, Math.ceil(c.view.end));
    const y = lane.top + lane.height / 2;
    for (let bp = from; bp < to; bp += 1) {
      const ch = sequence[bp]?.toUpperCase() ?? 'N';
      ctx.fillStyle = LOGO_COLOURS[ch as Base] ?? c.theme.muted;
      ctx.fillText(ch, c.xOfBp(bp + 0.5), y);
      drawn += 1;
    }
    ctx.restore();
  });
  return drawn;
}

// ------------------------------------------------------------------------------------------------
// The overview strip
// ------------------------------------------------------------------------------------------------

/**
 * The whole 16,384 bp window with the current view as a band.
 *
 * The selection surface, which is where every genome browser puts it: dragging the strip selects a
 * region and zooms to it, clicking centres. That keeps the main canvas free for panning and avoids
 * a mode toggle entirely. It replaces the old focus band, which was drawn on four separate tracks
 * and — because `setLogoWindow` repainted none of them — went stale on three of the four.
 */
export function drawOverview(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  view: View, theme: VpTheme, spark: ArrayLike<number> | null,
): void {
  const left = VP_PLOT.left;
  const inner = innerWidth(width);
  const x = (bp: number) => left + (bp / SEQ_LEN) * inner;
  ctx.clearRect(0, 0, width, height);

  if (spark && spark.length) {
    let max = 1e-6;
    for (let i = 0; i < spark.length; i += 1) max = Math.max(max, Number(spark[i]) || 0);
    ctx.save();
    ctx.strokeStyle = theme.track;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < spark.length; i += 1) {
      const px = x(CROP_BP + i * BIN_BP);
      const py = height - 3 - (logAxis(Number(spark[i]) || 0, max)) * (height - 8);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = theme.rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, 0.5, inner - 1, height - 1);
  const bx0 = x(view.start);
  const bw = Math.max(2, x(view.end) - bx0);
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.18;
  ctx.fillRect(bx0, 1, bw, height - 2);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(bx0 + 0.5, 1); ctx.lineTo(bx0 + 0.5, height - 1);
  ctx.moveTo(bx0 + bw - 0.5, 1); ctx.lineTo(bx0 + bw - 0.5, height - 1);
  ctx.stroke();

  ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.muted;
  ctx.fillText('window', 3, height / 2);
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------
// Caption
// ------------------------------------------------------------------------------------------------

/**
 * A caption that fits, or a shorter one that does.
 *
 * Three tiers picked by `measureText`. A canvas caption has no `overflow` to report, so one that
 * runs off the right edge renders as a truncated word and reads as a typo — "… iteratively maske"
 * shipped on the sibling page for exactly this reason.
 */
export function drawCaption(
  ctx: CanvasRenderingContext2D, width: number, y: number, theme: VpTheme, tiers: string[],
): string {
  ctx.save();
  ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'top';
  ctx.fillStyle = theme.muted;
  const room = width - VP_PLOT.left - VP_PLOT.right;
  const pick = tiers.find((t) => ctx.measureText(t).width <= room) ?? tiers[tiers.length - 1] ?? '';
  ctx.fillText(pick, VP_PLOT.left, y);
  ctx.restore();
  return pick;
}

/** The one place the base order is asserted, so a caller cannot silently transpose a logo column. */
export const LOGO_BASE_ORDER: readonly Base[] = BASES;
