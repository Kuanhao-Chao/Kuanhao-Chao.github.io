/**
 * Co-transcriptional splicing: a pure model of one repeating, illustrative transcript.
 *
 * RNA polymerase II walks along a three-exon gene on a double-helix template, and the RNA peels
 * off the DNA right behind it, lifting from the helix to a row above. A spliceosome gathers on each
 * intron as soon as its 3' end has been made, while the polymerase is still working further
 * downstream (that is what co-transcriptional means), the intron loops out of the strand into a
 * lariat, and the exons on either side are joined. The finished mRNA carries a 5' cap and a poly-A
 * tail and leaves.
 *
 * Before the polymerase reaches it, every piece of the transcript sits on the template where it is
 * encoded, so the gene's exons and introns are lit up on the DNA ahead of the enzyme, and being
 * copied is literally a lift-off from the helix. The same goes for the spliceosome: its parts wait
 * above their intron and rise to its neck to assemble.
 *
 * Everything on screen is a function of the clock, and the geometry is derived rather than drawn by
 * eye. Exons and introns are drawn at their gene coordinates, so the unspliced RNA lies exactly over
 * the DNA it was copied from. The RNA hangs from the polymerase, so its length is measured back from
 * the growing end, shortened by every intron already cut, and the older end slides toward the
 * polymerase as introns come out. An intron is a circular arc of conserved length whose chord
 * shrinks from that length to zero: solving theta / sin(theta) = length / chord gives a flat intron,
 * then an omega-shaped bulge, then a closed circle sitting on the junction, which is a lariat loop,
 * with no hand-tuned curve anywhere. Sizes and timing are invented for legibility, it is one
 * transcript repeating, and nothing here simulates a spliceosome.
 *
 * Static states need no special case. The loop's phase is offset so that clock 0 is the poster (the
 * first intron half way through looping out, the polymerase part way along the second exon), which
 * is what reduced motion, Paused and the static fallback therefore show, while a running clock
 * starts from the poster and carries on without a jump, and Pause freezes where it is.
 */
import { smootherstep } from './morphStory';
import type { MorphParticle, MorphPoint } from './morphModel';

const TAU = Math.PI * 2;
const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
const unit = (value: number): number => Math.max(0, Math.min(1, finite(value)));
const smooth = (value: number): number => {
  const t = unit(value);
  return t * t * (3 - 2 * t);
};
/** Half-open [0, 1): a tiny negative value that rounds up to exactly 1 wraps to 0. */
const wrapUnit = (value: number): number => {
  const remainder = value % 1;
  const positive = remainder < 0 ? remainder + 1 : remainder;
  return positive >= 1 ? 0 : positive;
};

/* ---------------------------------------------------------------- gene model -- */

export interface GeneElement {
  id: 'E1' | 'I1' | 'E2' | 'I2' | 'E3';
  kind: 'exon' | 'intron';
  nt: number;
  /** Gene fractions in [0, 1]. */
  start: number;
  end: number;
  len: number;
}
// Introns far outrun exons in a real gene; the proportions here keep the loops large enough to read
// while the exons stay short, which is how a gene diagram is drawn.
const SEGMENTS = [
  { id: 'E1', kind: 'exon', nt: 70 },
  { id: 'I1', kind: 'intron', nt: 190 },
  { id: 'E2', kind: 'exon', nt: 90 },
  { id: 'I2', kind: 'intron', nt: 170 },
  { id: 'E3', kind: 'exon', nt: 100 },
] as const;
export const GENE_NT: number = SEGMENTS.reduce((total, segment) => total + segment.nt, 0);
export const GENE: readonly GeneElement[] = (() => {
  let at = 0;
  return SEGMENTS.map((segment) => {
    const start = at / GENE_NT;
    at += segment.nt;
    return { ...segment, start, end: at / GENE_NT, len: segment.nt / GENE_NT };
  });
})();
export const EXONS: readonly GeneElement[] = GENE.filter((element) => element.kind === 'exon');
export const INTRONS: readonly GeneElement[] = GENE.filter((element) => element.kind === 'intron');
/** The share of the gene that survives splicing. */
export const EXON_SHARE: number = EXONS.reduce((total, exon) => total + exon.len, 0);

/** The element holding gene fraction g (the last one holds g = 1). */
export function elementAt(g: number): GeneElement {
  const fraction = unit(g);
  for (const element of GENE) if (fraction < element.end) return element;
  return GENE[GENE.length - 1];
}

/* ----------------------------------------------------------------- the scene -- */

/**
 * Drawing coordinates: x to the right, y down, everything within about +-0.5 vertically. The gene
 * stops short of the right edge because the finished mRNA hangs from the polymerase's last position
 * and its poly-A tail grows beyond it.
 */
export const GENE_X0 = -0.86;
export const GENE_X1 = 0.74;
export const GENE_WIDTH = GENE_X1 - GENE_X0;
export const Y_TEMPLATE = 0.32;
export const Y_RNA = 0.04;
export const Y_POL = 0.3;
const TEMPLATE_AMPLITUDE = 0.045;
const TEMPLATE_TURNS = 3.3;
const WAVE = 0.011;
/** How much of the gene behind the polymerase is still lifting off the helix. */
const PEEL = 0.06;
/** The spliceosome's parts wait this far above the helix, over their intron. */
const POOL_RISE = 0.085;
/** The finished mRNA leaves the way it came, upward. */
const EXPORT_DX = -0.05;
const EXPORT_DY = 0.22;
/** A released lariat drifts up and away, and which way depends on the intron. */
const LARIAT_DRIFT = [
  { x: -0.12, y: 0.2 },
  { x: 0.1, y: 0.2 },
] as const;
export const POLY_A_COUNT = 10;
const POLY_A_STEP = 0.022;
export const SPARKS_PER_INTRON = 6;

/* ------------------------------------------------------------------ timeline -- */

/** Seconds of clock for one transcript (a Calm clock runs slower, so a Calm cycle takes longer). */
export const SPLICE_CYCLE = 12;
/** Clock 0 shows this moment: the first intron half way through looping out. */
export const SPLICE_POSTER_PHASE = 0.42;
const TRANSCRIBE_FROM = 0.04;
const TRANSCRIBE_TO = 0.74;
/** Catalysis starts just after the 3' end of the intron has been transcribed. */
const CATALYSIS_LAG = 0.012;
const LOOP_SPAN = 0.15;
const RELEASE_SPAN = 0.1;
const ASSEMBLE_SPAN = 0.07;
const SPARK_FROM = 0.8;

/** The phase at which the polymerase has copied the first g of the gene. */
export const phaseOfSigma = (g: number): number =>
  TRANSCRIBE_FROM + (TRANSCRIBE_TO - TRANSCRIBE_FROM) * unit(g);
const sigmaOfPhase = (phase: number): number =>
  unit((phase - TRANSCRIBE_FROM) / (TRANSCRIBE_TO - TRANSCRIBE_FROM));
/** The phase at which intron k (0 or 1) begins to loop out. */
export const catalysisPhase = (k: number): number => phaseOfSigma(INTRONS[k].end) + CATALYSIS_LAG;
export const LOOP_OUT_SPAN = LOOP_SPAN;

export interface IntronState {
  /** Loop-out and ligation, 0 to 1: the chord between its exon ends closes and the arc becomes a loop. */
  m: number;
  /** The spliceosome gathers on it, 0 to 1, before catalysis begins. */
  assemble: number;
  /** The lariat leaves and the spliceosome comes apart, 0 to 1. */
  release: number;
  /** assemble x (1 - release): how far the spliceosome has risen to the neck of the loop. */
  spliceosome: number;
  /** x of its 5' splice site on the RNA row, and the straight distance to its 3' one. */
  x0: number;
  chord: number;
  /** Its contour length: fixed, which is why it bulges as the chord closes. */
  length: number;
  /** Half angle (0 = straight, pi = a closed circle) and radius of the arc. */
  theta: number;
  radius: number;
}
export interface SpliceState {
  clock: number;
  phase: number;
  /** The fraction of the gene the polymerase has copied, and where it stands. */
  sigma: number;
  polX: number;
  /**
   * How far along the gene the strand has lifted off the helix: the polymerase's own position while
   * it works, then a little past the end once it lets go, so the last stretch of the finished mRNA
   * rises with the rest instead of staying bent down toward an enzyme that has left.
   */
  peelTo: number;
  /** Visibility of the RNA, of the polymerase, and of the template-bound parts before and after their turn. */
  rnaAlpha: number;
  polAlpha: number;
  templateAlpha: number;
  cap: number;
  polyA: number;
  /** The finished mRNA leaving, 0 to 1. */
  exportT: number;
  /** The gene fraction removed so far. */
  excised: number;
  introns: [IntronState, IntronState];
}

function newIntron(): IntronState {
  return {
    m: 0,
    assemble: 0,
    release: 0,
    spliceosome: 0,
    x0: 0,
    chord: 0,
    length: 0,
    theta: 0,
    radius: 0,
  };
}
export function newSpliceState(): SpliceState {
  return {
    clock: 0,
    phase: 0,
    sigma: 0,
    polX: GENE_X0,
    peelTo: 0,
    rnaAlpha: 0,
    polAlpha: 0,
    templateAlpha: 0,
    cap: 0,
    polyA: 0,
    exportT: 0,
    excised: 0,
    introns: [newIntron(), newIntron()],
  };
}

/**
 * Where the RNA lies along its row: the RNA hangs from the polymerase, so a point is as far back
 * from it as the contour between them, which is the gene between them minus any intron already cut
 * out of that stretch. Before any cut that is exactly the gene's own coordinate.
 */
function backboneX(g: number, state: SpliceState): number {
  let contour = state.sigma - g;
  for (let k = 0; k < 2; k++) {
    const intron = INTRONS[k];
    const overlap = Math.min(intron.end, state.sigma) - Math.max(intron.start, g);
    if (overlap > 0) contour -= state.introns[k].m * overlap;
  }
  return state.polX - GENE_WIDTH * contour;
}

/** theta / sin(theta) = length / chord, solved by bisection (it increases from 1 to infinity). */
function solveArc(length: number, chord: number, into: IntronState): void {
  const gap = Math.max(chord, length * 1e-4);
  const ratio = length / gap;
  if (ratio <= 1 + 1e-9) {
    into.theta = 0;
    into.radius = 0;
    return;
  }
  let low = 1e-9,
    high = Math.PI;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (mid / Math.sin(mid) < ratio) low = mid;
    else high = mid;
  }
  const theta = (low + high) / 2;
  into.theta = theta;
  // From the arc length 2 R theta, which stays exact as the chord (and sin theta) goes to zero.
  into.radius = length / (2 * theta);
}

/** The whole splicing state for a clock value. Allocation-free when given an output object. */
export function computeSplice(time: number, out: SpliceState = newSpliceState()): SpliceState {
  const clock = finite(time);
  const phase = wrapUnit(clock / SPLICE_CYCLE + SPLICE_POSTER_PHASE);
  const sigma = sigmaOfPhase(phase);
  out.clock = clock;
  out.phase = phase;
  out.sigma = sigma;
  out.polX = GENE_X0 + GENE_WIDTH * sigma;
  out.peelTo = sigma + PEEL * smooth((phase - TRANSCRIBE_TO) / 0.05);
  // The RNA and the polymerase are gone at phase 0 and at phase 1, so the scene's one jump (the loop
  // wrapping, when every piece goes back to waiting on the template) is unseen.
  out.rnaAlpha = smooth((phase - TRANSCRIBE_FROM) / 0.03) * (1 - smooth((phase - 0.94) / 0.05));
  out.polAlpha = smooth(phase / TRANSCRIBE_FROM) * (1 - smooth((phase - TRANSCRIBE_TO) / 0.06));
  // The template-bound parts (a piece waiting its turn, a spliceosome's parts) fade in just after the
  // wrap and out just before it, rather than popping at it.
  out.templateAlpha = smooth(phase / 0.05) * (1 - smooth((phase - 0.96) / 0.04));
  out.cap = smooth((phase - phaseOfSigma(GENE[0].end)) / 0.03);
  // After the polymerase has let go and the last stretch has lifted, so the tail grows from a free end.
  out.polyA = smooth((phase - 0.79) / 0.08);
  out.exportT = smootherstep((phase - 0.92) / 0.07);
  let excised = 0;
  for (let k = 0; k < 2; k++) {
    const intron = INTRONS[k];
    const state = out.introns[k];
    const start = catalysisPhase(k);
    state.m = smootherstep((phase - start) / LOOP_SPAN);
    state.assemble = smooth((phase - (start - ASSEMBLE_SPAN)) / ASSEMBLE_SPAN);
    state.release = smooth((phase - (start + LOOP_SPAN)) / RELEASE_SPAN);
    state.spliceosome = state.assemble * (1 - state.release);
    state.length = GENE_WIDTH * intron.len;
    excised += state.m * intron.len;
  }
  out.excised = excised;
  for (let k = 0; k < 2; k++) {
    const state = out.introns[k];
    state.x0 = backboneX(INTRONS[k].start, out);
    state.chord = state.length * (1 - state.m);
    solveArc(state.length, state.chord, state);
  }
  return out;
}

// One state per distinct clock value: the renderer samples thousands of particles per frame and a
// transition samples every particle twice, all at the same time, so they share this.
const memo = newSpliceState();
let memoClock = Number.NaN;
function spliceAt(time: number): SpliceState {
  const clock = finite(time);
  if (clock !== memoClock) {
    computeSplice(clock, memo);
    memoClock = clock;
  }
  return memo;
}

/* ------------------------------------------------------------------ geometry -- */

const lariatFade = (state: IntronState): number => 1 - smooth((state.release - 0.35) / 0.65);
/** How visible intron k still is: a released lariat lingers, then fades as it drifts off. */
export const lariatVisibility = (state: SpliceState, k: number): number =>
  lariatFade(state.introns[k]);

/** A point on intron k, tau from its 5' splice site (0) to its 3' one (1). */
export function intronPoint(state: SpliceState, k: number, tau: number, out: MorphPoint): void {
  const intron = state.introns[k];
  const t = unit(tau);
  if (intron.theta < 1e-5) {
    out.x = intron.x0 + intron.chord * t;
    out.y = Y_RNA;
  } else {
    // An arc of the circle through both splice sites, bulging up and past the chord once theta
    // exceeds a right angle (the omega shape), closing to a full circle as the chord closes.
    const angle = -intron.theta + 2 * intron.theta * t;
    out.x = intron.x0 + intron.chord / 2 + intron.radius * Math.sin(angle);
    out.y = Y_RNA + intron.radius * (Math.cos(intron.theta) - Math.cos(angle));
  }
  out.x += intron.release * LARIAT_DRIFT[k].x;
  out.y -= intron.release * LARIAT_DRIFT[k].y;
  out.z = 0;
}

/** A point on the RNA row, g being the gene fraction it was copied from. */
export function rnaPoint(g: number, state: SpliceState, out: MorphPoint): void {
  const element = elementAt(g);
  if (element.kind === 'intron')
    intronPoint(state, element.id === 'I1' ? 0 : 1, (g - element.start) / element.len, out);
  else {
    out.x = backboneX(g, state);
    out.y = Y_RNA;
    out.z = 0;
  }
  out.x += state.exportT * EXPORT_DX;
  out.y += Math.sin(out.x * 11 + state.clock * 0.9) * WAVE - state.exportT * EXPORT_DY;
  out.alpha = 1;
}

/**
 * Where a piece of the transcript is drawn, g being the gene fraction it was copied from and strand
 * the helix strand it waits on: on the template until the polymerase reaches it, lifting off behind
 * it, then on the RNA row. Returns how far it has lifted (0 on the helix, 1 on the row). The
 * particles and the strokes drawn through them both go through here, so they cannot disagree.
 */
const waiting: MorphPoint = { x: 0, y: 0, z: 0, alpha: 1 };
export function strandPoint(
  g: number,
  strand: number,
  state: SpliceState,
  out: MorphPoint
): number {
  templatePoint(g, strand, state, waiting);
  rnaPoint(g, state, out);
  const lifted = smootherstep((state.peelTo - g) / PEEL);
  out.x = waiting.x + (out.x - waiting.x) * lifted;
  out.y = waiting.y + (out.y - waiting.y) * lifted - 0.05 * Math.sin(Math.PI * lifted);
  out.z = waiting.z * (1 - lifted);
  return lifted;
}

/** How much of an element has been copied so far: the gene fraction its drawn stroke reaches. */
export const copiedTo = (element: GeneElement, state: SpliceState): number =>
  Math.min(element.end, state.sigma);

/**
 * The i-th of `steps` points along a drawn element, from where it starts to as far as it has been
 * copied (see copiedTo). It stops just short of the element's own end, because an element is half
 * open: a gene fraction at its end is the NEXT element's first point, and for an intron that has
 * left as a lariat that is a long way off, which drew a straight line to it from every junction.
 */
export function elementPoint(
  element: GeneElement,
  i: number,
  steps: number,
  state: SpliceState,
  out: MorphPoint
): void {
  const from = element.start;
  const g = Math.min(from + ((copiedTo(element, state) - from) * i) / steps, element.end - 1e-9);
  strandPoint(g, 0, state, out);
}

/** One strand of the double helix the polymerase is walking along. */
export function templatePoint(
  g: number,
  strand: number,
  state: SpliceState,
  out: MorphPoint
): void {
  const fraction = unit(g);
  const turn = fraction * TAU * TEMPLATE_TURNS + strand * Math.PI + state.clock * 0.35;
  out.x = GENE_X0 + GENE_WIDTH * fraction;
  out.y = Y_TEMPLATE + Math.cos(turn) * TEMPLATE_AMPLITUDE;
  out.z = Math.sin(turn) * TEMPLATE_AMPLITUDE;
  out.alpha = 1;
}

/** Where intron k's spliceosome waits, above the helix over the intron it will be needed on. */
export function spliceosomePool(k: number, out: MorphPoint): void {
  const intron = INTRONS[k];
  out.x = GENE_X0 + GENE_WIDTH * (intron.start + intron.len / 2);
  out.y = Y_TEMPLATE - POOL_RISE;
  out.z = 0;
  out.alpha = 1;
}

/** The neck of intron k's loop, where the spliceosome sits once it has gathered. */
export function spliceosomeCenter(state: SpliceState, k: number, out: MorphPoint): void {
  const intron = state.introns[k];
  out.x = intron.x0 + intron.chord / 2 + state.exportT * EXPORT_DX;
  out.y = Y_RNA - 0.014 - state.exportT * EXPORT_DY;
  out.z = 0.02;
  out.alpha = 1;
}

export function capPoint(state: SpliceState, out: MorphPoint): void {
  rnaPoint(0, state, out);
  out.y -= 0.016;
}

/** The poly-A tail: dots trailing from the 3' end of the finished transcript. */
export function polyAPoint(index: number, state: SpliceState, out: MorphPoint): void {
  rnaPoint(1, state, out);
  const j = Math.max(0, Math.min(POLY_A_COUNT - 1, Math.floor(finite(index))));
  out.x += POLY_A_STEP * (j + 1);
  // A slight wave and a slow droop, so the tail reads as a tail and not a ruler.
  out.y += 0.012 * Math.sin(j * 0.9) + 0.00016 * j * j;
}
/** How many tail dots are drawn. */
export const polyAVisible = (state: SpliceState): number => Math.round(POLY_A_COUNT * state.polyA);

/** A spark thrown off when the exons ligate, for intron k, i of SPARKS_PER_INTRON. */
export function spliceSpark(state: SpliceState, k: number, i: number, out: MorphPoint): void {
  const intron = state.introns[k];
  const burst = unit((intron.m - SPARK_FROM) / (1 - SPARK_FROM));
  spliceosomeCenter(state, k, out);
  const angle = (finite(i) / SPARKS_PER_INTRON) * TAU + k * 0.5;
  const reach = 0.012 + 0.075 * burst;
  out.x += Math.cos(angle) * reach;
  out.y += Math.sin(angle) * reach;
  // A burst that peaks half way through and is gone before the lariat leaves.
  out.alpha = burst <= 0 || burst >= 1 ? 0 : Math.sin(burst * Math.PI) * (1 - intron.release);
}

/* ----------------------------------------------------------------- particles -- */

// The particles are shared out by their independent coordinate u, which no other stage correlates
// with t, so each group still spans the whole gene.
const STRAND_END = 0.62;
const TEMPLATE_END = 0.8;
const POL_END = 0.9;

/** Which ink a particle is drawn in: 0 accent (exons), 1 ink (template, polymerase), 2 warm (introns, spliceosome). */
export function rnaDotClass(p: MorphParticle): 0 | 1 | 2 {
  if (p.u < STRAND_END) return elementAt(p.t).kind === 'exon' ? 0 : 2;
  if (p.u < POL_END) return 1;
  return 2;
}

/** Position within a group, 0 to 1, for a radius that is uniform over a disc. */
const within = (p: MorphParticle, from: number, to: number): number =>
  unit((p.u - from) / (to - from));

const pool: MorphPoint = { x: 0, y: 0, z: 0, alpha: 1 };

export function sampleRnaParticle(p: MorphParticle, time: number, out: MorphPoint): void {
  const state = spliceAt(time);
  if (p.u < STRAND_END) {
    const element = elementAt(p.t);
    const exon = element.kind === 'exon';
    // Not yet copied, the piece sits on the template where it is encoded, dim, so the gene's exons
    // and introns show on the DNA ahead of the polymerase. As the polymerase passes it lifts off.
    const peeled = strandPoint(p.t, p.v < 0.5 ? 0 : 1, state, out);
    // Beads on the helix until copied, then a strand: thick for an exon, thin for an intron.
    const spread = (exon ? 0.021 : 0.011) * peeled + 0.006 * (1 - peeled);
    const radius = spread * Math.sqrt(within(p, 0, STRAND_END));
    const angle = p.v * TAU;
    out.x += Math.cos(angle) * radius;
    out.y += Math.sin(angle) * radius;
    out.z += Math.sin(p.phase) * radius * 0.8;
    const onRna = (exon ? 0.6 + 0.35 * p.v : 0.4 + 0.3 * p.v) * state.rnaAlpha;
    const fade = exon ? 1 : lariatFade(state.introns[element.id === 'I1' ? 0 : 1]);
    out.alpha = (0.2 + 0.14 * p.v) * state.templateAlpha * (1 - peeled) + onRna * fade * peeled;
  } else if (p.u < TEMPLATE_END) {
    templatePoint(p.t, p.v < 0.5 ? 0 : 1, state, out);
    out.alpha = 0.3 + 0.25 * (p.phase / TAU);
  } else if (p.u < POL_END) {
    // The polymerase: a small cloud riding the template just behind the peel.
    const radius = Math.sqrt(within(p, TEMPLATE_END, POL_END));
    out.x = state.polX + 0.07 * radius * Math.cos(p.phase);
    out.y = Y_POL + 0.056 * radius * Math.sin(p.phase);
    out.z = 0.05 * Math.sin(p.v * TAU * 1.6);
    out.alpha = state.polAlpha * (0.3 + 0.3 * (1 - radius));
  } else {
    // A spliceosome part: waits above its intron on the template, rises to the neck of the loop
    // to assemble, and goes back when the lariat leaves.
    const k = p.v < 0.5 ? 0 : 1;
    const gathered = smootherstep(state.introns[k].spliceosome);
    spliceosomePool(k, pool);
    spliceosomeCenter(state, k, out);
    const radius = Math.sqrt(within(p, POL_END, 1));
    const spread = 0.07 - 0.03 * gathered;
    out.x = pool.x + (out.x - pool.x) * gathered + spread * radius * Math.cos(p.phase);
    out.y = pool.y + (out.y - pool.y) * gathered + 0.8 * spread * radius * Math.sin(p.phase);
    out.z = 0;
    out.alpha = (0.1 + 0.62 * gathered * (0.6 + 0.4 * (1 - radius))) * state.templateAlpha;
  }
}

/* ------------------------------------------------------------------- captions -- */

export interface SpliceAnchor {
  label: string;
  x: number;
  y: number;
  /** Which way the caption extends from the anchor. */
  side: 'above' | 'below';
}

/**
 * Where the explorer's "Show structures" captions point, for whatever is on screen at this moment.
 * An anchor whose subject is absent (no lariat yet, no tail yet) is simply not returned.
 */
export function spliceAnchors(state: SpliceState): SpliceAnchor[] {
  const found: SpliceAnchor[] = [];
  const point: MorphPoint = { x: 0, y: 0, z: 0, alpha: 1 };
  const add = (label: string, side: 'above' | 'below', x: number, y: number) => {
    found.push({ label, side, x, y });
  };
  if (state.polAlpha > 0.5) add('RNA Pol II', 'below', state.polX, Y_POL + 0.07);
  if (state.rnaAlpha > 0.5) {
    const exon = EXONS.find((element) => state.sigma > element.end) ?? EXONS[0];
    rnaPoint((exon.start + exon.end) / 2, state, point);
    add('exon', 'below', point.x, point.y + 0.03);
    capPoint(state, point);
    if (state.cap > 0.5) add('5′ cap', 'above', point.x, point.y - 0.02);
  }
  for (let k = 0; k < 2; k++) {
    const intron = state.introns[k];
    if (intron.spliceosome > 0.5) {
      spliceosomeCenter(state, k, point);
      add('spliceosome', 'below', point.x, point.y + 0.04);
    }
    if (intron.m > 0.35 && lariatFade(intron) > 0.5) {
      intronPoint(state, k, 0.5, point);
      add('intron (lariat)', 'above', point.x, point.y - 0.02);
    }
  }
  if (state.polyA > 0.6 && state.rnaAlpha > 0.5) {
    polyAPoint(POLY_A_COUNT - 1, state, point);
    add('poly-A tail', 'above', point.x, point.y - 0.03);
  }
  return found;
}
