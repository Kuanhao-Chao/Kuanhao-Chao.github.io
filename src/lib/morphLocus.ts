/**
 * Splice-aware expression: a pure model of an RNA-seq view of the gene the RNA scene splices.
 *
 * Reads pile up on exons and almost none land in introns, so coverage is a block per exon over a
 * near-zero floor. A read that spans a splice junction is drawn as an arc from the end of one exon to
 * the start of the next, hanging below the baseline, with its stroke width growing with the number of
 * reads (a sashimi plot). Most junction reads join neighbouring exons, and a few skip the middle exon
 * altogether, which is what alternative splicing looks like in this view.
 *
 * It is the same gene as the RNA scene, exon for exon and intron for intron, so the arcs start and
 * end on the shared model's exon boundaries rather than on numbers typed here. Heights, read counts
 * and the undulation are invented for legibility: this is an illustration, not data.
 */
import type { MorphParticle, MorphPoint } from './morphModel';
import { EXONS, INTRONS } from './morphSplice';

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
const unit = (value: number): number => Math.max(0, Math.min(1, finite(value)));
const smooth = (value: number): number => {
  const t = unit(value);
  return t * t * (3 - 2 * t);
};

/* ---------------------------------------------------------------- the frame -- */

/** The plot spans x in [LOCUS_X0, LOCUS_X1], gene start to gene end. */
export const LOCUS_X0 = -0.92;
export const LOCUS_X1 = 0.92;
export const LOCUS_WIDTH = LOCUS_X1 - LOCUS_X0;
/** The baseline coverage stands on and junction arcs hang from (y is down). */
export const Y_BASE = 0.06;
/** Half the height of the gene-model strip drawn on the baseline: exons are boxes on it. */
export const STRIP_HALF = 0.011;
/** Drawn coverage height per exon, before undulation. */
export const COVERAGE_LEVELS: readonly number[] = [0.27, 0.42, 0.33];
/** What an intron holds: a few stray reads, not none. */
export const INTRON_FLOOR = 0.012;
/** A coverage shoulder is this wide (gene fraction) and lies inside its exon. */
const SHOULDER = 0.012;

/** Gene fraction to x. */
export const locusX = (fraction: number): number => LOCUS_X0 + unit(fraction) * LOCUS_WIDTH;

/**
 * Coverage at gene fraction g, as a height above the baseline. Each exon is a block with smooth
 * shoulders inside its own boundaries, a mild undulation (real coverage is never flat), and an
 * intron is a faint floor. Always positive, always continuous.
 */
export function coverageHeight(g: number): number {
  const f = unit(g);
  let height = INTRON_FLOOR * (1 + 0.25 * Math.sin(f * 61));
  for (let k = 0; k < EXONS.length; k++) {
    const { start, end } = EXONS[k];
    const window = smooth((f - start) / SHOULDER) * (1 - smooth((f - end + SHOULDER) / SHOULDER));
    if (window <= 0) continue;
    const undulation =
      1 + 0.06 * Math.sin((f * 9 + 0.13 + k * 0.31) * Math.PI * 2) + 0.035 * Math.sin(f * 143 + k);
    height += COVERAGE_LEVELS[k] * window * undulation;
  }
  return height;
}

/* -------------------------------------------------------------- junction reads -- */

export interface Junction {
  id: string;
  /** Indices into EXONS: the arc runs from the end of `from` to the start of `to`. */
  from: number;
  to: number;
  /** Reads spanning the junction (illustrative). */
  reads: number;
  /** True for the read that jumps over the middle exon. */
  skips: boolean;
}
export const JUNCTIONS: readonly Junction[] = [
  { id: 'E1→E2', from: 0, to: 1, reads: 220, skips: false },
  { id: 'E2→E3', from: 1, to: 2, reads: 310, skips: false },
  { id: 'E1→E3', from: 0, to: 2, reads: 45, skips: true },
];
/** Shortest and tallest arc: height grows with the span an arc covers. */
const ARC_MIN = 0.08;
const ARC_MAX = 0.27;

/** x of an arc's two feet: the end of the exon it leaves and the start of the exon it lands on. */
export function junctionFeet(junction: Junction): { xa: number; xb: number; span: number } {
  const xa = locusX(EXONS[junction.from].end);
  const xb = locusX(EXONS[junction.to].start);
  return { xa, xb, span: xb - xa };
}
/** How far below the baseline the arc's lowest point sits. */
export function junctionDepth(junction: Junction): number {
  return ARC_MIN + (ARC_MAX - ARC_MIN) * (junctionFeet(junction).span / LOCUS_WIDTH);
}
/** Stroke width in pixels, growing with the square root of the read count. */
export const junctionWidth = (junction: Junction): number => 1 + 0.12 * Math.sqrt(junction.reads);
/** A half-ellipse below the baseline, t from 0 (the foot on the left) to 1 (the foot on the right). */
export function junctionPoint(junction: Junction, t: number, out: MorphPoint): void {
  const { xa, span } = junctionFeet(junction);
  const angle = unit(t) * Math.PI;
  out.x = xa + (span / 2) * (1 - Math.cos(angle));
  out.y = Y_BASE + STRIP_HALF + junctionDepth(junction) * Math.sin(angle);
  out.z = 0;
  out.alpha = 1;
}

/* ----------------------------------------------------------------- particles -- */

/** The share of particles that sit on the coverage; the rest are junction reads. */
export const COVERAGE_SHARE = 0.72;
/** Introns carry a faint floor of dots, so the outline reads as continuous, not as three islands. */
const WEIGHT_FLOOR = 0.05;
const TABLE = 1024;
// The inverse of the coverage's cumulative mass, so that a uniform particle lands where the coverage
// is, and the exons hold most of the dots. Built once; sampling is a table lookup and a lerp.
const INVERSE: Float64Array = (() => {
  const steps = 4096;
  const cumulative = new Float64Array(steps + 1);
  for (let i = 0; i < steps; i++) {
    const g = (i + 0.5) / steps;
    cumulative[i + 1] = cumulative[i] + coverageHeight(g) + WEIGHT_FLOOR;
  }
  const total = cumulative[steps];
  const table = new Float64Array(TABLE + 1);
  let at = 0;
  for (let i = 0; i <= TABLE; i++) {
    const target = (i / TABLE) * total;
    while (at < steps - 1 && cumulative[at + 1] < target) at++;
    const span = cumulative[at + 1] - cumulative[at] || 1;
    table[i] = (at + unit((target - cumulative[at]) / span)) / steps;
  }
  return table;
})();
/** Gene fraction for a uniform draw s: dots land where the coverage is. */
export function locusFraction(s: number): number {
  const scaled = unit(s) * TABLE;
  const i = Math.min(TABLE - 1, Math.floor(scaled));
  return INVERSE[i] + (INVERSE[i + 1] - INVERSE[i]) * (scaled - i);
}
// The junction a draw belongs to, weighted by the square root of its reads so that the rare skip
// still has enough dots to be seen.
const JUNCTION_WEIGHT_TOTAL = JUNCTIONS.reduce((total, j) => total + Math.sqrt(j.reads), 0);
const JUNCTION_CUMULATIVE: readonly number[] = (() => {
  let at = 0;
  return JUNCTIONS.map((j) => (at += Math.sqrt(j.reads) / JUNCTION_WEIGHT_TOTAL));
})();
/** Index of the junction for a draw s in [0, 1). */
export function junctionIndex(s: number): number {
  const draw = unit(s);
  for (let k = 0; k < JUNCTION_CUMULATIVE.length; k++) if (draw < JUNCTION_CUMULATIVE[k]) return k;
  return JUNCTION_CUMULATIVE.length - 1;
}
/** Model units of a junction band's thickness, so a thick arc has more dots across it. */
const BAND = 0.004;
const BAND_PER_ROOT_READ = 0.0011;

/**
 * One particle of the scene. A uniform `u` below COVERAGE_SHARE puts it on the coverage (the
 * chromatin role is the outline, the rest fill the area under it); above, it is a junction read on
 * one of the arcs. Pure and allocation-free.
 */
export function sampleLocusParticle(p: MorphParticle, out: MorphPoint): void {
  if (p.u < COVERAGE_SHARE) {
    const ridge = p.role === 'chromatin';
    const g = locusFraction(p.t);
    const height = coverageHeight(g);
    const fill = p.u / COVERAGE_SHARE;
    out.x = locusX(g);
    out.y = Y_BASE - height * (ridge ? 0.96 + 0.04 * p.v : fill);
    out.z = 0;
    // The outline over an intron is a floor, not a signal: keep it faint.
    out.alpha = ridge ? (height > 4 * INTRON_FLOOR ? 0.85 : 0.4) : 0.28 + p.v * 0.2;
    return;
  }
  const k = junctionIndex((p.u - COVERAGE_SHARE) / (1 - COVERAGE_SHARE));
  const junction = JUNCTIONS[k];
  const { xa, span } = junctionFeet(junction);
  const depth = junctionDepth(junction);
  const angle = unit(p.t) * Math.PI;
  const radial = (p.v - 0.5) * (BAND + BAND_PER_ROOT_READ * Math.sqrt(junction.reads));
  // The band is the ellipse grown (or shrunk) by `radial` on both axes, so it keeps its thickness
  // around the bend instead of pinching at the feet.
  out.x = xa + span / 2 - (span / 2 + radial) * Math.cos(angle);
  out.y = Y_BASE + STRIP_HALF + (depth + radial) * Math.sin(angle);
  out.z = 0;
  out.alpha = junction.skips ? 0.55 : 0.75;
}

/** The ink class a particle takes while this scene owns the frame: 0 accent, 2 warm. */
export function locusDotClass(p: MorphParticle): 0 | 2 {
  return p.u >= COVERAGE_SHARE ? 2 : 0;
}

/* ------------------------------------------------------------------ captions -- */

export interface LocusAnchor {
  label: string;
  x: number;
  y: number;
  side: 'above' | 'below';
  /** A shorter caption for when the full one is wider than `room` (model units) allows. */
  short?: string;
  room?: number;
}
/** The tallest the coverage gets over an exon: a caption above it must clear the undulation. */
function peakHeight(exon: { start: number; end: number }): number {
  let peak = 0;
  for (let i = 0; i <= 64; i++)
    peak = Math.max(peak, coverageHeight(exon.start + ((exon.end - exon.start) * i) / 64));
  return peak;
}
/** What the explorer's "Show structures" mode names: the coverage, an intron, each junction. */
export function locusAnchors(): LocusAnchor[] {
  const mid = (element: { start: number; end: number }): number =>
    (element.start + element.end) / 2;
  const anchors: LocusAnchor[] = [
    {
      label: 'exon coverage',
      x: locusX(mid(EXONS[1])),
      y: Y_BASE - peakHeight(EXONS[1]) - 0.012,
      side: 'above',
    },
    {
      label: 'intron: few reads',
      x: locusX(mid(INTRONS[0])),
      y: Y_BASE - coverageHeight(mid(INTRONS[0])),
      side: 'above',
      short: 'few reads',
      room: INTRONS[0].len * LOCUS_WIDTH,
    },
  ];
  for (const junction of JUNCTIONS) {
    const { xa, span } = junctionFeet(junction);
    anchors.push({
      label: junction.skips ? `${junction.reads} reads skip an exon` : `${junction.reads} reads`,
      x: xa + span / 2,
      y: Y_BASE + STRIP_HALF + junctionDepth(junction),
      // An ordinary arc is captioned inside its own span, where nothing else is drawn; the skipping
      // arc runs under both of them, so its caption goes below it.
      side: junction.skips ? 'below' : 'above',
    });
  }
  return anchors;
}
