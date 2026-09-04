/**
 * The Shorkie per-locus viewport: which lanes exist, what each logo column holds, what the
 * coordinate readout says.
 *
 * Pure. The controller in `src/scripts/shorkieViewport.ts` owns the canvas; this file owns every
 * decision that can be wrong without anything being drawn wrong-looking.
 *
 * The whole page used to draw four separate full-window panels -- a coverage SVG, an attribution
 * canvas, a method strip and an annotation canvas -- each computing its own left inset and its own
 * bp-to-x mapping. Two of them disagreed at every container width but one (measured: +20.2 px at
 * 1440, -31.3 px at 320, sign flipping at ~1,043), and the gate that was meant to catch it compared
 * their INTENT strings rather than their geometry, so it passed for a whole round. They are one
 * canvas now, stacked by `laneLayout`, so the mapping is a single function and the disagreement is
 * not expressible.
 */

import {
  BASES, type Base, SEQ_LEN, BIN_BP, CROP_BP,
} from './shorkieModel';
import { type View, clampView, shouldDrawLetters } from './genomeBrowser';

/** The model's context, and therefore this viewport's whole coordinate space. */
export const LOCUS_LEN = SEQ_LEN;

/**
 * What a lane draws.
 *
 * `logo` is separate from `score` because a logo is not a bar chart of the same numbers: it has a
 * per-column stacking rule, it only exists at base zoom, and it carries letters whose widths come
 * from the glyph paths rather than from the lane's value axis.
 */
export type VpLaneKind =
  | 'ruler' | 'coverage' | 'track' | 'method' | 'logo' | 'sequence' | 'genes' | 'annotation';

export interface VpLaneSpec {
  id: string;
  kind: VpLaneKind;
  /** The name drawn when the gutter has room for it. */
  label: string;
  /**
   * The name drawn when it does not.
   *
   * Never a prefix truncation done at draw time: the genome browser clipped `Chromosome structure`
   * to `me structure`, which reads as a different label rather than a cut-off one.
   */
  short: string;
  height: number;
  /** Whether the lane grows both ways from a zero rule. */
  signed: boolean;
  /** The lane's real step. A method drawn finer than this would claim resolution it lacks. */
  resolutionBp: number;
  /**
   * The scalar this lane scores, when that differs between lanes.
   *
   * Mutagenesis is scored on the window's own gene body and is unconditional. Gradient x input and
   * integrated gradients are scored on whatever region the reader traced. Three lanes stacked under
   * one heading imply comparability, and these three are not comparable in that one respect, so the
   * lane says which question it answered.
   */
  target?: string;
  /**
   * Set when the lane is drawing coarser than its method's best resolution, with the reason.
   *
   * Gradient x input is per base only when the traced region is exactly one of the shipped anchors;
   * otherwise it is reconstructed from 128 bp groups. A lane that has silently fallen back is a
   * lane claiming a precision it does not have.
   */
  degraded?: string;
}

/** Everything the lane list depends on. Explicit so the decision is testable without a DOM. */
export interface ViewportState {
  /** Mutagenesis: the 4 x 16,384 plane, always unconditional once loaded. */
  hasIsm: boolean;
  /** Gradient x input for the traced region. */
  hasAnchor: boolean;
  /** Integrated gradients for the traced region. */
  hasIg: boolean;
  hasOccl: boolean;
  /** Attention rollout needs a live forward pass; the maps ship, the run does not. */
  hasRollout: boolean;
  hasAnnotation: boolean;
  /** Label of the one output track picked out of the 5,215, or null. */
  outputTrack: string | null;
  /** Whether the traced region is exactly a shipped anchor, which is what buys per-base. */
  anchorExact: boolean;
  /** Whether the view is zoomed far enough for letters. From `shouldDrawLetters`. */
  letters: boolean;
  /** Draw mutagenesis as all four bases rather than the paper's reference projection. */
  ismHypothetical: boolean;
  /** Measured height of the annotation lane; it depends on how many rows the features pack into. */
  annotationHeight: number;
}

export const LANE_HEIGHTS = {
  ruler: 26,
  coverage: 84,
  track: 62,
  method: 40,
  logo: 66,
  sequence: 20,
  genes: 46,
} as const;

/**
 * The lanes, in drawing order.
 *
 * Order is meaning here: prediction first, then what drove it at the resolutions the methods
 * actually have, then -- only at base zoom -- the same quantities as letters over the sequence they
 * describe, then what is annotated there. A reader reads down one column of pixels and every lane
 * is the same base.
 */
export function viewportLanes(s: ViewportState): VpLaneSpec[] {
  const out: VpLaneSpec[] = [];
  const push = (l: VpLaneSpec) => { out.push(l); };

  push({
    id: 'ruler', kind: 'ruler', label: 'position', short: 'pos',
    height: LANE_HEIGHTS.ruler, signed: false, resolutionBp: 1,
  });

  push({
    id: 'coverage', kind: 'coverage', label: 'predicted coverage', short: 'coverage',
    height: LANE_HEIGHTS.coverage, signed: false, resolutionBp: BIN_BP,
    target: 'assay-group mean',
  });

  if (s.outputTrack) {
    push({
      id: 'track', kind: 'track', label: s.outputTrack, short: 'track',
      height: LANE_HEIGHTS.track, signed: false, resolutionBp: BIN_BP,
      target: s.outputTrack,
    });
  }

  if (s.hasIsm) {
    push({
      id: 'ism', kind: 'method', label: 'mutagenesis (ISM)', short: 'ISM',
      height: LANE_HEIGHTS.method, signed: true, resolutionBp: 1,
      target: "this window's own gene body",
    });
  }
  if (s.hasAnchor) {
    push({
      id: 'grad', kind: 'method', label: 'gradient x input', short: 'grad',
      height: LANE_HEIGHTS.method, signed: true,
      resolutionBp: s.anchorExact ? 1 : 128,
      target: 'the traced region',
      degraded: s.anchorExact ? undefined
        : 'reconstructed from 128 bp groups — trace a whole gene for single bases',
    });
  }
  if (s.hasIg) {
    push({
      id: 'ig', kind: 'method', label: 'integrated gradients', short: 'IG',
      height: LANE_HEIGHTS.method, signed: true,
      resolutionBp: s.anchorExact ? 1 : 128,
      target: 'the traced region',
      degraded: s.anchorExact ? undefined : 'per-base IG ships only for whole-gene anchors',
    });
  }
  if (s.hasOccl) {
    push({
      id: 'occl', kind: 'method', label: 'occlusion (64 bp)', short: 'occl',
      height: LANE_HEIGHTS.method, signed: true, resolutionBp: 64,
      target: 'the traced region',
    });
  }
  if (s.hasRollout) {
    push({
      id: 'rollout', kind: 'method', label: 'attention rollout (128 bp)', short: 'rollout',
      height: LANE_HEIGHTS.method, signed: false, resolutionBp: 128,
      target: 'what the transformer can read',
    });
  }

  // Letters only below here. A logo of the whole window is not a drawing that exists: 16,384 bases
  // across ~1,280 px is 0.078 px a base.
  if (s.letters) {
    if (s.hasIsm) {
      push({
        id: 'ism-logo', kind: 'logo',
        label: s.ismHypothetical
          ? 'mutagenesis — all four bases'
          : 'mutagenesis — the base that is there',
        short: 'ISM',
        height: LANE_HEIGHTS.logo, signed: true, resolutionBp: 1,
        target: "this window's own gene body",
      });
    }
    if (s.hasAnchor && s.anchorExact) {
      push({
        id: 'grad-logo', kind: 'logo', label: 'gradient x input', short: 'grad',
        height: LANE_HEIGHTS.logo, signed: true, resolutionBp: 1,
        target: 'the traced region',
      });
    }
    if (s.hasIg && s.anchorExact) {
      push({
        id: 'ig-logo', kind: 'logo', label: 'integrated gradients', short: 'IG',
        height: LANE_HEIGHTS.logo, signed: true, resolutionBp: 1,
        target: 'the traced region',
      });
    }
    push({
      id: 'sequence', kind: 'sequence', label: 'sequence', short: 'seq',
      height: LANE_HEIGHTS.sequence, signed: false, resolutionBp: 1,
    });
  }

  push({
    id: 'genes', kind: 'genes', label: 'genes', short: 'genes',
    height: LANE_HEIGHTS.genes, signed: false, resolutionBp: 1,
  });
  if (s.hasAnnotation) {
    push({
      id: 'annotation', kind: 'annotation', label: 'annotation', short: 'ann',
      height: Math.max(24, Math.round(s.annotationHeight)), signed: false, resolutionBp: 1,
    });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// Logo columns
// ------------------------------------------------------------------------------------------------

/**
 * The mutagenesis logo, the paper's way: one letter per column, the reference base.
 *
 * `ismSaliency` in `shorkieModel.ts` derives the height; this puts it in the reference base's slot
 * and leaves the other three at zero, which is what makes it ONE letter. That is the quantity
 * Figure 4 prints and the quantity the method strip above draws, so the logo and the strip cannot
 * disagree.
 */
export function projectedLogoColumns(
  values: ArrayLike<number>, sequence: string, start: number, n: number,
): Float64Array[] {
  const out: Float64Array[] = [];
  for (let i = 0; i < n; i += 1) {
    const col = new Float64Array(4);
    const bp = start + i;
    const ref = BASES.indexOf((sequence[bp] ?? 'N').toUpperCase() as Base);
    if (ref >= 0) col[ref] = Number(values[bp]) || 0;
    out.push(col);
  }
  return out;
}

/**
 * The mutagenesis logo, all four bases: the mean-centred plane itself.
 *
 * The shipped plane stores `alt - ref` with the reference cell zero. Mean-centring across the four
 * bases is what turns "what this substitution would do" into a contribution per base, and keeping
 * all four rather than projecting is the extra information a zoom exists to reveal -- the reference
 * letter still carries `-(sum of alternatives)/4`, so this reduces to `projectedLogoColumns` if the
 * other three are dropped. Both are the same recipe stopped at different steps, which is why the
 * page offers both rather than picking one and calling the other wrong.
 */
export function hypotheticalLogoColumns(
  plane: ArrayLike<number>, width: number, start: number, n: number,
): Float64Array[] {
  const out: Float64Array[] = [];
  for (let i = 0; i < n; i += 1) {
    const bp = start + i;
    const col = new Float64Array(4);
    if (bp < 0 || bp >= width) { out.push(col); continue; }
    let mean = 0;
    for (let b = 0; b < 4; b += 1) mean += Number(plane[b * width + bp]) || 0;
    mean /= 4;
    for (let b = 0; b < 4; b += 1) col[b] = (Number(plane[b * width + bp]) || 0) - mean;
    out.push(col);
  }
  return out;
}

/**
 * A gradient-based logo: one letter per column, always.
 *
 * Not a simplification. Gradient x input and integrated gradients both multiply by the input, and
 * the input is one-hot, so both are identically zero at the three bases that are not there. Drawing
 * all four would require the raw gradient, which is a different pack the page does not ship. The
 * asymmetry with mutagenesis is real and the lane labels say so.
 */
export const scalarLogoColumns = projectedLogoColumns;

/** How many letters a column of a logo can carry. The one invariant the three lanes differ on. */
export function maxLettersPerColumn(laneId: string, ismHypothetical: boolean): number {
  if (laneId === 'ism-logo') return ismHypothetical ? 4 : 1;
  return 1;
}

// ------------------------------------------------------------------------------------------------
// The view
// ------------------------------------------------------------------------------------------------

/** A window-relative view. `chrom` is carried only so the genomeBrowser helpers accept it. */
export const windowView = (start: number, end: number): View =>
  ({ chrom: 'window', start, end });

export function clampWindowView(start: number, end: number): { start: number; end: number } {
  return clampView(start, end, LOCUS_LEN);
}

/** Whether this view is zoomed far enough that letters are letters and not texture. */
export function lettersVisible(view: View, innerWidth: number): boolean {
  return shouldDrawLetters(view.end - view.start, innerWidth);
}

/**
 * Where a locus opens.
 *
 * On the promoter of the window's own gene, not the window centre and not the highest peak: a
 * 16,384 bp yeast window holds a dozen genes and the tallest is rarely the one the window is named
 * for. 400 bp wide, which is enough to hold a promoter and still be one drag from base resolution.
 */
export function defaultView(ownTxStart: number | null, ownStrand: '+' | '-' , width = 400): View {
  const tss = ownTxStart === null ? LOCUS_LEN / 2 : ownTxStart;
  const centre = ownStrand === '-' ? tss + 150 : tss - 150;
  const v = clampWindowView(centre - width / 2, centre + width / 2);
  return windowView(v.start, v.end);
}

/**
 * The coordinate readout.
 *
 * Both coordinate systems, because both are needed and neither is sufficient: the genome coordinate
 * is what a reader pastes into a browser, and the window offset is what every plane on this page is
 * indexed by.
 */
export function zoomReadout(view: View, locusChrom: string, locusStart: number): string {
  const n = (x: number) => Math.round(x).toLocaleString('en-US');
  const span = view.end - view.start;
  const bpLabel = span >= 1000 ? `${(span / 1000).toFixed(span >= 10_000 ? 0 : 1)} kb` : `${span} bp`;
  return `${locusChrom}:${n(locusStart + view.start + 1)}–${n(locusStart + view.end)}`
    + ` · window ${n(view.start)}–${n(view.end)} · ${bpLabel}`;
}

/**
 * The bins of the 896-bin head that a window-relative bp range touches.
 *
 * The head crops 1,024 bp from each end, so bin 0 starts at bp 1,024 and not at bp 0. Getting this
 * wrong shifts every coverage reading by 64 bins without changing the shape of the curve.
 */
export function binsForRange(startBp: number, endBp: number): { start: number; end: number } {
  const lo = Math.floor((startBp - CROP_BP) / BIN_BP);
  const hi = Math.ceil((endBp - CROP_BP) / BIN_BP);
  const nBins = (LOCUS_LEN - 2 * CROP_BP) / BIN_BP;
  return {
    start: Math.max(0, Math.min(nBins, lo)),
    end: Math.max(0, Math.min(nBins, hi)),
  };
}

/** The window-relative bp a head bin covers. The exact inverse of `binsForRange`'s convention. */
export function bpForBin(bin: number): { start: number; end: number } {
  return { start: CROP_BP + bin * BIN_BP, end: CROP_BP + (bin + 1) * BIN_BP };
}
