/**
 * Attention arcs: an illustrative picture of how a sequence-to-function model weighs distant DNA.
 *
 * One promoter, the query, stands on a stretch of sequence, and nine distal sites, the keys, each
 * receive a share of its attention. The shares are a softmax over invented scores, so they are
 * positive and sum to exactly one; a few sites take most of it. Each share is an arc from the
 * promoter to its site, over the sequence, with a stroke that grows with the weight, and the three
 * strongest are drawn in the warm ink. Warm pulses leave the promoter along the arcs.
 *
 * Positions and weights are invented for legibility. This is not Shorkie's attention, and nothing
 * here is measured: it shows what an attention pattern is, not what any model computes.
 */
import type { MorphParticle, MorphPoint } from './morphModel';

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
const unit = (value: number): number => Math.max(0, Math.min(1, finite(value)));
const smooth = (value: number): number => {
  const t = unit(value);
  return t * t * (3 - 2 * t);
};

/* ---------------------------------------------------------------- the frame -- */

export const ATTN_X0 = -0.92;
export const ATTN_X1 = 0.92;
/** The sequence the arcs stand on (y is down). */
export const Y_SEQ = 0.3;
/** The promoter: every arc leaves from here. */
export const HUB_X = -0.3;
/** The three strongest sites are drawn warm. */
export const HOT_COUNT = 3;

/** Nine distal sites and the score the model gives each, in sequence order. */
const SITE_SCORES: readonly { x: number; score: number }[] = [
  { x: -0.86, score: 1.1 },
  { x: -0.7, score: 1.9 },
  { x: -0.52, score: 0.4 },
  { x: -0.06, score: 0.9 },
  { x: 0.12, score: 0.2 },
  { x: 0.34, score: 2.2 },
  { x: 0.52, score: 0.6 },
  { x: 0.7, score: 1.0 },
  { x: 0.88, score: 1.6 },
];
export interface AttentionSite {
  x: number;
  /** Softmax share of the promoter's attention: positive, and the nine sum to one. */
  weight: number;
  /** One of the HOT_COUNT strongest. */
  hot: boolean;
}
export const SITES: readonly AttentionSite[] = (() => {
  const exp = SITE_SCORES.map((site) => Math.exp(site.score));
  const total = exp.reduce((sum, value) => sum + value, 0);
  const weights = exp.map((value) => value / total);
  const cutoff = [...weights].sort((a, b) => b - a)[HOT_COUNT - 1];
  return SITE_SCORES.map((site, k) => ({
    x: site.x,
    weight: weights[k],
    hot: weights[k] >= cutoff,
  }));
})();
/** Site indices, strongest first. */
export const BY_WEIGHT: readonly number[] = SITES.map((_, k) => k).sort(
  (a, b) => SITES[b].weight - SITES[a].weight || a - b
);

/* ----------------------------------------------------------------------- arcs -- */

/** The tallest an arc reaches above the sequence. */
const ARC_CAP = 0.72;
export const arcSpan = (k: number): number => Math.abs(SITES[k].x - HUB_X);
/** Height grows with the distance an arc covers, a little less than linearly, and is capped. */
export const arcHeight = (k: number): number => Math.min(ARC_CAP, 0.62 * arcSpan(k) ** 0.9);
/** Stroke width in pixels and opacity both grow with the weight. */
export const arcWidth = (k: number): number => 0.7 + 9 * SITES[k].weight;
export const arcAlpha = (k: number): number => Math.min(0.75, 0.18 + 1.6 * SITES[k].weight);
/** A half-ellipse above the sequence, t = 0 at the promoter and t = 1 at the site. */
export function arcPoint(k: number, t: number, out: MorphPoint): void {
  const site = SITES[k];
  const angle = unit(t) * Math.PI;
  out.x = HUB_X + ((site.x - HUB_X) * (1 - Math.cos(angle))) / 2;
  out.y = Y_SEQ - arcHeight(k) * Math.sin(angle);
  out.z = 0;
  out.alpha = 1;
}

/* ----------------------------------------------------------------- particles -- */

/** u below TRACK_SHARE is the sequence, below NODE_SHARE the nodes, above it the arcs. */
export const TRACK_SHARE = 0.12;
export const NODE_SHARE = 0.2;
/** The promoter draws this share of the node dots; the sites share the rest by sqrt(weight). */
const HUB_NODE_SHARE = 0.4;
const NODE_CUMULATIVE: readonly number[] = (() => {
  const roots = SITES.map((site) => Math.sqrt(site.weight));
  const total = roots.reduce((sum, value) => sum + value, 0);
  let at = HUB_NODE_SHARE;
  return [HUB_NODE_SHARE, ...roots.map((root) => (at += ((1 - HUB_NODE_SHARE) * root) / total))];
})();
/** The node a draw belongs to: 0 is the promoter, 1..9 are the sites in sequence order. */
export function nodeIndex(s: number): number {
  const draw = unit(s);
  for (let i = 0; i < NODE_CUMULATIVE.length; i++) if (draw < NODE_CUMULATIVE[i]) return i;
  return NODE_CUMULATIVE.length - 1;
}
/** Drawn radius of a node, in model units: the promoter is the largest. */
export const nodeRadius = (node: number): number =>
  node === 0 ? 0.03 : 0.009 + 0.032 * SITES[node - 1].weight;
// Arcs are shared out by weight to the power 0.7, which keeps the faint ones drawn without letting
// them match the strong ones dot for dot.
const ARC_CUMULATIVE: readonly number[] = (() => {
  const shares = SITES.map((site) => site.weight ** 0.7);
  const total = shares.reduce((sum, value) => sum + value, 0);
  let at = 0;
  return shares.map((share) => (at += share / total));
})();
/** The arc a draw belongs to, in sequence order. */
export function arcIndex(s: number): number {
  const draw = unit(s);
  for (let k = 0; k < ARC_CUMULATIVE.length; k++) if (draw < ARC_CUMULATIVE[k]) return k;
  return ARC_CUMULATIVE.length - 1;
}
const arcOf = (p: MorphParticle): number => arcIndex((p.u - NODE_SHARE) / (1 - NODE_SHARE));
const nodeOf = (p: MorphParticle): number => nodeIndex(p.t);

/**
 * One particle of the scene: a tick of the sequence, a dot on a node, or a dot on an arc, with a
 * thickness across the arc that grows with its weight. Pure and allocation-free.
 */
export function sampleAttentionParticle(p: MorphParticle, out: MorphPoint): void {
  out.z = 0;
  if (p.u < TRACK_SHARE) {
    out.x = ATTN_X0 + (ATTN_X1 - ATTN_X0) * unit(p.t);
    out.y = Y_SEQ + (p.v - 0.5) * 0.014;
    out.alpha = 0.3 + 0.2 * p.v;
    return;
  }
  if (p.u < NODE_SHARE) {
    const node = nodeOf(p);
    const radius = nodeRadius(node) * Math.sqrt(p.v);
    out.x = (node === 0 ? HUB_X : SITES[node - 1].x) + Math.cos(p.phase) * radius;
    out.y = Y_SEQ + Math.sin(p.phase) * radius;
    out.alpha = 0.7 + 0.25 * p.v;
    return;
  }
  const k = arcOf(p);
  const site = SITES[k];
  const angle = unit(p.t) * Math.PI;
  const half = (site.x - HUB_X) / 2;
  // The band is the ellipse grown or shrunk by `radial` on both axes, so it keeps its thickness
  // around the bend instead of pinching at the feet.
  const radial = (p.v - 0.5) * (0.004 + 0.045 * site.weight);
  const reach = Math.abs(half) + radial;
  out.x = HUB_X + half - Math.sign(half) * reach * Math.cos(angle);
  out.y = Y_SEQ - (arcHeight(k) + radial) * Math.sin(angle);
  out.alpha = Math.min(0.9, 0.4 + 0.9 * site.weight) * (site.hot ? 1 : 0.8);
}

/** The ink class a particle takes while this scene owns the frame: 0 accent, 1 ink, 2 warm. */
export function attentionDotClass(p: MorphParticle): 0 | 1 | 2 {
  if (p.u < TRACK_SHARE) return 1;
  if (p.u < NODE_SHARE) {
    const node = nodeOf(p);
    return node === 0 || SITES[node - 1].hot ? 2 : 0;
  }
  return SITES[arcOf(p)].hot ? 2 : 0;
}

/* --------------------------------------------------------------------- pulses -- */

/**
 * Which arc and lane each warm pulse rides, strongest first. Every arc carries one pulse and the
 * strongest HOT_COUNT carry a second, half a period behind: twelve in all. A phone draws the first
 * six, which are exactly the strongest arcs, so it keeps what the picture is about.
 */
export const PULSE_SLOTS: readonly (readonly [number, number])[] = [
  ...BY_WEIGHT.slice(0, HOT_COUNT).flatMap((k) => [[k, 0] as const, [k, 1] as const]),
  ...BY_WEIGHT.slice(HOT_COUNT).map((k) => [k, 0] as const),
];
/** A pulse fades in leaving the promoter and out arriving at its site. */
export const pulseEnvelope = (t: number): number => smooth(t / 0.12) * smooth((1 - t) / 0.18);

/* ------------------------------------------------------------------ captions -- */

export interface AttentionAnchor {
  label: string;
  x: number;
  y: number;
  side: 'above' | 'below';
  /** A shorter caption for when the full one is wider than `room` (model units) allows. */
  short?: string;
  room?: number;
}
/**
 * What the explorer's "Show structures" mode names: the promoter and the three strongest sites with
 * their share. All of them go under the sequence, where nothing else is drawn: over the arcs they
 * would be crossed by the other arcs rising from the promoter.
 */
export function attentionAnchors(): AttentionAnchor[] {
  const anchors: AttentionAnchor[] = [
    { label: 'promoter', x: HUB_X, y: Y_SEQ + nodeRadius(0), side: 'below' },
  ];
  BY_WEIGHT.slice(0, HOT_COUNT).forEach((k, rank) => {
    const percent = `${Math.round(SITES[k].weight * 100)}%`;
    anchors.push({
      label: rank === 0 ? `${percent} · strongest` : percent,
      x: SITES[k].x,
      y: Y_SEQ + nodeRadius(k + 1),
      side: 'below',
      // Beside the promoter's caption the long form needs more room than a phone has.
      ...(rank === 0 ? { short: percent, room: 0.55 } : {}),
    });
  });
  return anchors;
}
