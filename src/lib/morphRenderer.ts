import type { BackgroundMotion } from './backgroundModel';
import {
  clamp01,
  createMorphParticles,
  playbackProgress,
  playbackTime,
  particleVisibility,
  morphPointerFalloff,
  rotateMorphPoint,
  sampleMorphAtmosphere,
  sampleMito,
  sampleMorph,
  sampleDna,
  sampleCell,
  smoothstep,
  TAU,
  type MorphPoint,
  type MorphRole,
} from './morphModel';
import { MORPH_STAGES, stageWeight, stageDescription, transitionDuration } from './morphStory';
import {
  sampleProteinBackbone,
  sampleNetworkNode,
  sampleNetworkEdge,
  NETWORK_NODE_COUNT,
  NETWORK_EDGES,
} from './morphTargets';
import {
  GENE,
  SPARKS_PER_INTRON,
  Y_POL,
  capPoint,
  computeSplice,
  copiedTo,
  elementPoint,
  lariatVisibility,
  newSpliceState,
  polyAPoint,
  polyAVisible,
  rnaDotClass,
  spliceAnchors,
  spliceSpark,
  spliceosomeCenter,
  templatePoint,
} from './morphSplice';
import {
  JUNCTIONS,
  STRIP_HALF,
  Y_BASE,
  coverageHeight,
  junctionPoint,
  junctionWidth,
  locusAnchors,
  locusDotClass,
  locusX,
} from './morphLocus';
import {
  ATTN_X0,
  ATTN_X1,
  HUB_X,
  PULSE_SLOTS,
  SITES,
  Y_SEQ,
  arcAlpha,
  arcPoint,
  arcWidth,
  attentionAnchors,
  attentionDotClass,
  nodeRadius,
  pulseEnvelope,
} from './morphAttention';
import { PROTEIN_SECONDARY_STRUCTURE } from '../data/morphProtein';
import {
  BASES,
  MOTIF_GLYPHS,
  MOTIF_RAIL,
  MOTIF_X0,
  MOTIF_X1,
  MOTIF_BASELINE,
  motifParticleBase,
  motifPositionAt,
  motifLinks,
  motifLinkPoint,
  motifX,
  type FinaleVariant,
} from './morphFinale';
import { finaleBlend } from './morphFinalePreference';
import type { SceneRenderer } from './sceneRenderer';
import { fitHorizontal } from './morphLighting';
import {
  readHead,
  networkPackets,
  attentionPulse,
  turntableYaw,
  streakStrength,
  bokehDot,
  type LifeClock,
} from './morphLife';
/** What a scene asks the explorer to caption; the optional fields are the locus scene's. */
interface Caption {
  label: string;
  x: number;
  y: number;
  side: 'above' | 'below';
  short?: string;
  room?: number;
}
const PROJECTED_EXTENTS = [0.74, 0.5, 1.1, 0.86, 0.46, 0.7, 0.46];
const INCOMING_DASH = [3, 3],
  SOLID_DASH: number[] = [];
// The RNA, coverage and attention scenes draw their own overlays, so they are not among these.
const ACCENT_STAGES = ['protein', 'network'] as const;
const STRUCTURE_LABELS = [
  ['DNA · paired strands', 'Representative genetic information'],
  [
    'RNA · co-transcriptional splicing',
    'DNA opens locally · introns loop out · illustrative, not to scale',
  ],
  ['Ubiquitin · 1UBQ chain A', 'Helix, sheets and loops · experimental backbone'],
  ['Cell · membrane and nucleus', 'Chromatin, mitochondria and ER'],
  [
    'Splice-aware expression · illustrative',
    'Coverage on exons · arcs are junction reads, thicker = more reads',
  ],
  ['Generic neural model · five layers', '4 → 6 → 8 → 6 → 3 · not Shorkie'],
  [
    'Attention arcs · illustrative',
    'One promoter weighs nine distal sites · arc width = attention, weights sum to 1',
  ],
];

/** Layered Canvas2D illustration; anatomy and particle geometry share one sampler. */
export function createMorphRenderer(
  canvas: HTMLCanvasElement,
  demo = false,
  home = false,
  intro = false
): SceneRenderer {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  const context: CanvasRenderingContext2D = ctx;
  // A reopened explorer owns a fresh renderer, even if its last instance fell back.
  delete canvas.dataset.bgFallback;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const particles = createMorphParticles(demo ? (coarse ? 1600 : 5000) : coarse ? 1000 : 3200);
  // Screen coordinates/depth/opacity and normalized interaction displacements.
  const positions = new Float32Array(particles.length * 4);
  const offsets = new Float32Array(particles.length * 4);
  const previous = new Float32Array(particles.length * 3);
  const streakBands = new Uint8Array(particles.length);
  const life: LifeClock = { time: 0, amount: 0 };
  const packet = { t: 0, alpha: 0 };
  const bokeh = { x: 0, y: 0, radius: 0, alpha: 0 };
  const lights = [document.createElement('canvas'), document.createElement('canvas')];
  const splice = newSpliceState();
  // The ink of each particle while the RNA scene is up: fixed per particle, so decided once.
  const rnaClasses = Uint8Array.from(particles, (p) => rnaDotClass(p));
  const locusClasses = Uint8Array.from(particles, (p) => locusDotClass(p));
  const attentionClasses = Uint8Array.from(particles, (p) => attentionDotClass(p));
  const motifClasses = Uint8Array.from(particles, (p) => BASES.indexOf(motifParticleBase(p)) + 3);
  // Cache normalized vector paths once. They keep counters and low-frequency
  // letters readable even when adaptive quality removes most of the dots.
  const motifPaths = MOTIF_GLYPHS.map((glyph) => {
    const path = new Path2D();
    for (const contour of glyph.contours) {
      contour.forEach(([x, y], i) => {
        const xx = glyph.x + x * glyph.width,
          yy = glyph.y + y * glyph.height;
        if (i) path.lineTo(xx, yy);
        else path.moveTo(xx, yy);
      });
      path.closePath();
    }
    return path;
  });
  const motifInks = ['#38795d', '#487b9c', '#a27a3c', '#a45e70'];
  const motifCaption: readonly Caption[] = [
    { label: '1', x: motifX(0), y: 0.5, side: 'below' },
    { label: '12', x: motifX(11), y: 0.5, side: 'below' },
  ];
  let finale: FinaleVariant = 'motif',
    finaleMix = 0;
  let finaleTween: { from: number; to: number; age: number } | null = null;
  let motifFocus = -1,
    selectionAge = 2,
    focusTimer = 0;
  let historyReady = false,
    darkLight = false,
    paletteVersion = 0;
  let glowCount = 0,
    streakCount = 0,
    pulseCount = 0,
    packetCount = 0,
    bokehCount = 0,
    spliceCount = 0,
    sparkCount = 0,
    junctionCount = 0,
    arcCount = 0,
    transcriptionGap = 0;
  // Linked buckets: six depth bands × seven inks × three sizes × twelve opacities.
  // Build once per frame without sorting, allocating arrays, or drawing each dot separately.
  const bucketHeads = new Int32Array(6 * 7 * 3 * 12);
  const nextParticle = new Int32Array(particles.length);
  const point: MorphPoint = { x: 0, y: 0, z: 0, alpha: 1 };
  const scratch: MorphPoint = { ...point },
    other: MorphPoint = { ...point };
  let width = 1,
    height = 1,
    dpr = 1,
    originX = 0,
    originY = 0,
    scale = 1;
  const chapterHeights = new Float64Array(7);
  let chapterHeight = 240,
    accent = '#2e6e5e',
    highlight = accent,
    ink = '#141414',
    surface = '#fafaf8';
  let motion: BackgroundMotion = 'ambient';
  let mask: HTMLCanvasElement | null = null;
  let progress = 0,
    displayed = 0,
    clock = 0,
    playbackAge = 0,
    introAge = intro ? 0 : 2;
  let running = false,
    disposed = false,
    raf = 0,
    last = 0,
    labels = false;
  let quality = 1,
    previousQuality = 1,
    qualityAge = 0.4,
    costly = 0,
    slow = 0,
    fps = demo ? (coarse ? 30 : 60) : coarse ? 20 : 24;
  let kickUntil = 0,
    kickTime = 0;
  let pointerX = 0,
    pointerY = 0,
    targetX = 0,
    targetY = 0;
  let hoverX = 0,
    hoverY = 0,
    hover = 0,
    pointerPresent = false;
  let yaw = 0,
    pitch = 0,
    perspective = 1;
  let interactionCount = 0;
  let tween: { from: number; age: number; duration: number } | null = null;
  const canAnimate = () =>
    !disposed &&
    !document.hidden &&
    !reduced() &&
    motion !== 'paused' &&
    canvas.dataset.bgFallback !== 'static';

  function layout() {
    const dimensional = 1 - stageWeight(displayed, 'signal') - stageWeight(displayed, 'attention');
    perspective = 1 - stageWeight(displayed, 'protein');
    const restraint = motion === 'calm' ? 0.45 : 1;
    yaw = dimensional * restraint * (Math.sin(clock * 0.075) * 0.09 + pointerX * 0.16);
    yaw += stageWeight(displayed, 'protein') * turntableYaw(life);
    pitch = dimensional * restraint * (Math.sin(clock * 0.061) * 0.035 + pointerY * 0.09);
    // Conservative projected half-heights include idle rotation and depth, with a
    // bounded allowance between targets. Every axis uses the same fitting scale.
    let extent = 0;
    chapterHeight = 0;
    for (let i = 0; i < MORPH_STAGES.length; i++) {
      const weight = stageWeight(displayed, MORPH_STAGES[i].id);
      extent +=
        (i === 6 ? 0.75 + (PROJECTED_EXTENTS[i] - 0.75) * finaleMix : PROJECTED_EXTENTS[i]) *
        weight;
      chapterHeight += chapterHeights[i] * weight;
    }
    extent += 0.14 * Math.sin(displayed * 6 * Math.PI) ** 2;
    // The splicing, coverage and attention scenes are wide and short (about 1.7 to 1.8 units across
    // against 0.8 high), so they may use a little more of the width than the rest: on a phone the
    // width is what limits them, and they were filling under 60% of it.
    const wide =
      stageWeight(displayed, 'rna') +
      stageWeight(displayed, 'signal') +
      stageWeight(displayed, 'attention');
    if (demo) {
      originX = width * 0.5;
      originY = height * 0.51;
      scale = Math.min(
        width * ((labels ? 0.36 : 0.43) + 0.07 * wide),
        (height - (labels ? 80 : 32)) / (2 * extent)
      );
    } else if (home) {
      const shift = 1 - stageWeight(displayed, 'dna');
      originX = width * ((coarse ? 0.74 : 0.79) * (1 - shift) + 0.5 * shift);
      originY = height * ((coarse ? 0.25 : 0.24) * (1 - shift) + 0.5 * shift);
      const start = Math.min(width * (coarse ? 0.36 : 0.24), height * (coarse ? 0.22 : 0.25));
      const end = Math.min(width * (0.4 + 0.07 * wide), (chapterHeight - 32) / (2 * extent));
      scale = start + (end - start) * shift;
    } else {
      originX = width * (coarse ? 0.74 : 0.8);
      originY = height * (coarse ? 0.27 : 0.46);
      scale = Math.min(width * (coarse ? 0.38 : 0.23), height * 0.27);
    }
    if (stageWeight(displayed, 'dna') > 0) {
      // |x| <= .98, radial extent .24, yaw <= .25: conservative projected
      // half-width 1.18 includes perspective, particle spread and a thin stroke.
      // Fit the complete rigid view, never individual scientific coordinates.
      const fit = fitHorizontal(width, originX, scale, 1.18);
      originX = fit.origin;
      scale = fit.scale;
    }
    const motifWeight = stageWeight(displayed, 'attention') * (1 - finaleMix);
    if (motifWeight > 0) {
      const fit = fitHorizontal(width, originX, scale, 1.23);
      scale += (fit.scale - scale) * motifWeight;
      originX += (fit.origin - originX) * motifWeight;
    }
  }
  function project(p: MorphPoint) {
    rotateMorphPoint(p, yaw, pitch);
    // The experimental protein is a rigid orthographic view, not axis-wise deformation.
    const depth = 1 + p.z * 0.22 * perspective;
    p.x = originX + p.x * scale * depth;
    p.y = originY + p.y * scale * depth;
  }
  function sample(role: MorphRole, t: number, variant = 0) {
    sampleCell(role, t, variant, clock, point);
    project(point);
  }
  function path(role: MorphRole, variant = 0, closed = false, inset = 1) {
    context.beginPath();
    const steps = coarse ? 64 : 96;
    for (let i = 0; i <= steps; i++) {
      sample(role, i / steps, variant);
      const x = originX + (point.x - originX) * inset;
      const y = originY + (point.y - originY) * inset;
      if (!i) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    if (closed) context.closePath();
  }
  function opacity() {
    return demo ? 0.94 : motion === 'calm' ? 0.23 : home ? (coarse ? 0.6 : 0.65) : 0.32;
  }
  function shape(role: MorphRole, variant: number, fill: number, line: number, inset = 1) {
    sample(role, 0, variant);
    const alpha = point.alpha * opacity() * stageWeight(displayed, 'cell');
    if (alpha < 0.005) return;
    path(role, variant, true, inset);
    if (fill) {
      context.globalAlpha = alpha * fill * 0.45;
      context.fillStyle = accent;
      context.fill();
    }
    context.globalAlpha = alpha * line * 0.22;
    context.strokeStyle = accent;
    context.lineWidth = demo ? 1.25 : 1;
    context.stroke();
  }
  function drawDna(back: boolean) {
    const weight = stageWeight(displayed, 'dna') * smoothstep(introAge / 1.5);
    if (weight < 0.005) return;
    // Draw rungs in two depth passes around the nearer backbone segments.
    for (let rung = 0; rung <= 26; rung++) {
      const t = rung / 26;
      sampleDna(t, 1, clock, point);
      project(point);
      other.x = point.x;
      other.y = point.y;
      other.z = point.z;
      sampleDna(t, 0, clock, point);
      project(point);
      if (point.z < 0 !== back) continue;
      context.globalAlpha = opacity() * weight * (t > 0.39 && t < 0.54 ? 0.2 : 0.12);
      const gradient = context.createLinearGradient(point.x, point.y, other.x, other.y);
      gradient.addColorStop(0, accent);
      gradient.addColorStop(1, highlight);
      context.strokeStyle = gradient;
      context.lineWidth = demo ? 1.6 : 1;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(other.x, other.y);
      context.stroke();
    }
    for (let strand = 0; strand < 2; strand++) {
      let previousX = 0,
        previousY = 0;
      for (let i = 0; i <= 96; i++) {
        sampleDna(i / 96, strand, clock, point);
        project(point);
        if (i && point.z < 0 === back) {
          context.globalAlpha = opacity() * weight * (back ? 0.12 : 0.25);
          context.strokeStyle = strand ? highlight : accent;
          context.lineWidth = demo ? (back ? 1.6 : 2.6) : back ? 1 : 1.5;
          context.beginPath();
          context.moveTo(previousX, previousY);
          context.lineTo(point.x, point.y);
          context.stroke();
        }
        previousX = point.x;
        previousY = point.y;
      }
    }
    if (!back && life.amount) {
      readHead(life, packet);
      sampleDna(packet.t, 0, clock, point);
      project(point);
      context.globalAlpha = packet.alpha * weight * 0.7;
      context.fillStyle = highlight;
      context.beginPath();
      context.arc(point.x, point.y, demo ? 3 : 2.3, 0, TAU);
      context.fill();
    }
  }
  function drawCell() {
    const leave = stageWeight(displayed, 'cell');
    if (leave < 0.005) return;
    // Soft volume inside a closed outline, followed by organelles and front rim.
    sample('membrane', 0);
    const alpha = point.alpha * opacity() * leave;
    path('membrane', 0, true);
    const glow = context.createRadialGradient(
      originX - scale * 0.25,
      originY - scale * 0.28,
      0,
      originX,
      originY,
      scale * 0.9
    );
    glow.addColorStop(0, accent);
    glow.addColorStop(0.7, surface);
    glow.addColorStop(1, accent);
    context.fillStyle = glow;
    context.globalAlpha = alpha * 0.07;
    context.fill();
    // Keep anatomy intact; fade structures while their particles form the ribbon.
    context.save();
    shape('membrane', 0, 0, 0.9);
    shape('membrane', 0, 0, 0.22, 0.984);
    shape('nucleus', 0, 0.09, 0.65);
    shape('nucleus', 0, 0, 0.2, 0.97);
    shape('nucleolus', 0, 0.25, 0.35);
    const cellWeight = leave;
    for (let strand = 0; strand < 2; strand++) {
      path('chromatin', strand);
      context.globalAlpha = opacity() * cellWeight * 0.07;
      context.lineWidth = demo ? 1.1 : 0.8;
      context.strokeStyle = accent;
      context.stroke();
    }
    sample('er', 0);
    const erAlpha = point.alpha * opacity() * leave;
    path('er');
    context.strokeStyle = accent;
    context.lineWidth = demo ? 2.4 : 1.4;
    context.globalAlpha = erAlpha * 0.12;
    context.stroke();
    for (const t of [0, 1]) {
      sample('nucleus', (-1.4 + t * 3.1) / TAU);
      context.beginPath();
      context.moveTo(point.x, point.y);
      sample('er', t);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    for (let variant = 0; variant < 3; variant++) {
      shape('mitochondria', variant, 0.12, 0.85);
      context.beginPath();
      // Cristae share their organelle's translation and rotation.
      for (let i = 0; i <= 64; i++) {
        sampleMito(i / 64, variant, clock, true, point);
        project(point);
        if (!i) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      sample('mitochondria', 0, variant);
      context.globalAlpha = point.alpha * opacity() * leave * 0.14;
      context.lineWidth = demo ? 1.1 : 0.8;
      context.stroke();
    }
    context.restore();
  }
  /**
   * The coverage scene, drawn through the particles: the baseline carrying the gene model (exons as
   * boxes), the coverage outline, and the junction arcs hanging below it with a stroke width that
   * grows with the read count. Every curve comes from morphLocus, the same functions that place the
   * dots, so an arc cannot start anywhere but on an exon boundary.
   */
  function drawLocus() {
    const weight = stageWeight(displayed, 'signal');
    if (weight < 0.005) return;
    const base = opacity() * weight;
    context.save();
    context.beginPath();
    for (let i = 0; i <= 240; i++) {
      const g = i / 240;
      point.x = locusX(g);
      point.y = Y_BASE - coverageHeight(g);
      point.z = 0;
      project(point);
      if (!i) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.strokeStyle = accent;
    context.lineWidth = demo ? 2.1 : 1.3;
    context.globalAlpha = base * 0.3;
    context.stroke();
    for (const g of [1, 0]) {
      point.x = locusX(g);
      point.y = Y_BASE;
      point.z = 0;
      project(point);
      context.lineTo(point.x, point.y);
    }
    context.closePath();
    context.fillStyle = accent;
    context.globalAlpha = base * 0.08;
    context.fill();
    // The gene model on the baseline: a thin line for the introns, a box for each exon.
    point.x = locusX(0);
    point.y = Y_BASE;
    point.z = 0;
    project(point);
    const lineX0 = point.x,
      lineY = point.y;
    point.x = locusX(1);
    point.y = Y_BASE;
    project(point);
    context.beginPath();
    context.moveTo(lineX0, lineY);
    context.lineTo(point.x, point.y);
    context.strokeStyle = ink;
    context.lineWidth = 0.9;
    context.globalAlpha = base * 0.3;
    context.stroke();
    context.lineCap = 'butt';
    context.strokeStyle = accent;
    context.lineWidth = Math.max(3, 2 * STRIP_HALF * scale);
    context.globalAlpha = base * 0.6;
    for (const element of GENE) {
      if (element.kind !== 'exon') continue;
      context.beginPath();
      for (const g of [element.start, element.end]) {
        point.x = locusX(g);
        point.y = Y_BASE;
        point.z = 0;
        project(point);
        if (g === element.start) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.stroke();
    }
    context.lineCap = 'round';
    // Junction reads: one arc each, thicker for more reads, the skipping read the faintest.
    context.strokeStyle = highlight;
    for (const junction of JUNCTIONS) {
      context.beginPath();
      for (let i = 0; i <= 48; i++) {
        junctionPoint(junction, i / 48, point);
        project(point);
        if (!i) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.lineWidth = junctionWidth(junction) * (demo ? 1.25 : 1);
      context.globalAlpha = base * (junction.skips ? 0.4 : 0.55);
      context.stroke();
      junctionCount++;
    }
    // A read head scans along the locus, riding the coverage.
    const t = (clock / 12) % 1;
    point.x = locusX(t);
    point.y = Y_BASE - coverageHeight(t);
    point.z = 0;
    project(point);
    const headX = point.x,
      headY = point.y;
    point.x = locusX(t);
    point.y = Y_BASE;
    project(point);
    context.beginPath();
    context.moveTo(headX, headY);
    context.lineTo(point.x, point.y);
    context.strokeStyle = highlight;
    context.lineWidth = 0.8;
    context.globalAlpha = base * 0.3;
    context.stroke();
    context.beginPath();
    context.arc(headX, headY, demo ? 3.6 : 2.6, 0, TAU);
    context.fillStyle = highlight;
    context.globalAlpha = base * 0.9;
    context.fill();
    context.restore();
  }
  /**
   * The attention scene, drawn through the particles: the sequence with faint ticks, the promoter and
   * the nine sites as rings, and an arc from the promoter to each site, bolder for more attention and
   * warm for the strongest. Every curve comes from morphAttention, the same functions that place the
   * dots, so an arc cannot leave anywhere but the promoter.
   */
  function drawAttention() {
    const weight = stageWeight(displayed, 'attention') * finaleMix;
    if (weight < 0.005) return;
    const base = opacity() * weight;
    context.save();
    point.x = ATTN_X0;
    point.y = Y_SEQ;
    point.z = 0;
    project(point);
    const lineX = point.x,
      lineY = point.y;
    point.x = ATTN_X1;
    point.y = Y_SEQ;
    project(point);
    context.beginPath();
    context.moveTo(lineX, lineY);
    context.lineTo(point.x, point.y);
    context.strokeStyle = ink;
    context.lineWidth = 0.9;
    context.globalAlpha = base * 0.3;
    context.stroke();
    // A tick every 0.04 of the sequence, a longer one every fifth.
    context.beginPath();
    for (let i = 0; i <= 46; i++) {
      const reach = i % 5 === 0 ? 0.014 : 0.007;
      const x = ATTN_X0 + ((ATTN_X1 - ATTN_X0) * i) / 46;
      for (const y of [Y_SEQ - reach, Y_SEQ + reach]) {
        point.x = x;
        point.y = y;
        point.z = 0;
        project(point);
        if (y < Y_SEQ) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
    }
    context.globalAlpha = base * 0.2;
    context.stroke();
    for (let k = 0; k < SITES.length; k++) {
      context.beginPath();
      for (let i = 0; i <= 56; i++) {
        arcPoint(k, i / 56, point);
        project(point);
        if (!i) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.strokeStyle = SITES[k].hot ? highlight : accent;
      context.lineWidth = arcWidth(k) * (demo ? 1.25 : 1);
      context.globalAlpha = base * arcAlpha(k);
      context.stroke();
      arcCount++;
    }
    for (let node = 0; node <= SITES.length; node++) {
      const hot = node === 0 || SITES[node - 1].hot;
      point.x = node === 0 ? HUB_X : SITES[node - 1].x;
      point.y = Y_SEQ;
      point.z = 0;
      project(point);
      context.beginPath();
      context.arc(point.x, point.y, nodeRadius(node) * scale, 0, TAU);
      context.fillStyle = hot ? highlight : accent;
      context.globalAlpha = base * (node === 0 ? 0.28 : 0.2);
      context.fill();
      context.strokeStyle = hot ? highlight : accent;
      context.lineWidth = demo ? 1.4 : 1;
      context.globalAlpha = base * (node === 0 ? 0.7 : 0.5);
      context.stroke();
    }
    context.restore();
  }
  function drawMotif() {
    const weight = stageWeight(displayed, 'attention') * (1 - finaleMix);
    if (weight < 0.005) return;
    const base = opacity() * weight;
    context.save();
    // This scene is flat. Use one rigid transform, never independent x/y fitting.
    context.translate(originX, originY);
    context.scale(scale, scale);
    for (let i = 0; i < MOTIF_GLYPHS.length; i++) {
      const glyph = MOTIF_GLYPHS[i];
      context.fillStyle = motifInks[BASES.indexOf(glyph.base)];
      context.globalAlpha = base * (motifFocus === glyph.column ? 0.36 : 0.14);
      context.fill(motifPaths[i], glyph.base === 'A' ? 'evenodd' : 'nonzero');
      context.globalAlpha = base * (motifFocus === glyph.column ? 0.8 : 0.5);
      context.lineWidth = 0.65 / scale;
      context.strokeStyle = context.fillStyle;
      context.stroke(motifPaths[i]);
    }
    context.beginPath();
    context.moveTo(MOTIF_X0, MOTIF_BASELINE + 0.025);
    context.lineTo(MOTIF_X1, MOTIF_BASELINE + 0.025);
    context.globalAlpha = base * 0.18;
    context.strokeStyle = ink;
    context.lineWidth = 0.7 / scale;
    context.stroke();
    context.restore();
    const links = motifLinks(motifFocus, coarse);
    context.save();
    for (const link of links) {
      const selected = link.direction !== 'idle';
      const incoming = link.direction === 'incoming';
      context.strokeStyle = incoming ? highlight : accent;
      context.fillStyle = context.strokeStyle;
      context.lineWidth = selected ? 1.1 + link.weight * 2 : 0.65 + link.weight;
      context.globalAlpha = base * (selected ? 0.75 : 0.2);
      context.setLineDash(incoming ? INCOMING_DASH : SOLID_DASH);
      context.beginPath();
      for (let i = 0; i <= 40; i++) {
        motifLinkPoint(link, i / 40, point);
        // A flat diagram: match the cached paths exactly during adjacent transforms.
        const x = originX + point.x * scale,
          y = originY + point.y * scale;
        if (i) context.lineTo(x, y);
        else context.moveTo(x, y);
      }
      context.stroke();
      arcCount++;
      context.setLineDash(SOLID_DASH);
      if (selected) {
        motifLinkPoint(link, 0.94, point);
        motifLinkPoint(link, 0.91, other);
        const x = originX + point.x * scale,
          y = originY + point.y * scale;
        const angle = Math.atan2(point.y - other.y, point.x - other.x);
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - 4 * Math.cos(angle - 0.5), y - 4 * Math.sin(angle - 0.5));
        context.lineTo(x - 4 * Math.cos(angle + 0.5), y - 4 * Math.sin(angle + 0.5));
        context.closePath();
        context.fill();
        // A single traversal after a new selection, never a repeating attention pulse.
        if (life.amount && selectionAge < 1.1) {
          const t = selectionAge / 1.1;
          motifLinkPoint(link, t, point);
          context.globalAlpha = base * life.amount * Math.sin(Math.PI * t) * 0.85;
          context.beginPath();
          context.arc(originX + point.x * scale, originY + point.y * scale, 2.1, 0, TAU);
          context.fill();
          pulseCount++;
        }
      }
    }
    context.globalAlpha = base * 0.55;
    context.fillStyle = accent;
    context.beginPath();
    for (let i = 0; i < 12; i++) {
      const x = originX + motifX(i) * scale,
        y = originY + MOTIF_RAIL * scale;
      context.moveTo(x + 1.4, y);
      context.arc(x, y, motifFocus === i ? 2.2 : 1.4, 0, TAU);
    }
    context.fill();
    context.restore();
  }
  /**
   * The RNA scene, drawn through the particles: the template's two strands, the polymerase, the
   * transcript (exons thick and in the accent ink, introns thin and warm), the cap, the poly-A tail
   * and a ring where each spliceosome has gathered. Every curve comes from morphSplice, the same
   * functions that place the dots, so a stroke cannot wander off the material it outlines.
   */
  function drawSplicing() {
    const weight = stageWeight(displayed, 'rna');
    if (weight < 0.005) return;
    const base = opacity() * weight;
    context.save();
    // Read the projected separation from the same strand samples the DNA strokes draw. This is
    // structural geometry, not a life effect: a paused/reduced-motion poster still has a bubble.
    templatePoint(splice.sigma, 0, splice, scratch);
    templatePoint(splice.sigma, 1, splice, other);
    project(scratch);
    project(other);
    transcriptionGap = Math.hypot(scratch.x - other.x, scratch.y - other.y);
    context.strokeStyle = ink;
    context.lineWidth = demo ? 1.3 : 0.9;
    context.globalAlpha = base * 0.16;
    for (let strand = 0; strand < 2; strand++) {
      context.beginPath();
      for (let i = 0; i <= 110; i++) {
        templatePoint(i / 110, strand, splice, point);
        project(point);
        if (!i) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.stroke();
    }
    if (splice.polAlpha > 0.01) {
      point.x = splice.polX;
      point.y = Y_POL;
      point.z = 0;
      project(point);
      context.beginPath();
      context.ellipse(point.x, point.y, 0.075 * scale, 0.06 * scale, 0, 0, TAU);
      context.fillStyle = ink;
      context.globalAlpha = base * splice.polAlpha * 0.04;
      context.fill();
      context.lineWidth = demo ? 1.6 : 1.1;
      context.globalAlpha = base * splice.polAlpha * 0.32;
      context.stroke();
    }
    for (const element of GENE) {
      if (copiedTo(element, splice) <= element.start) continue;
      const exon = element.kind === 'exon';
      const visibility =
        splice.rnaAlpha * (exon ? 1 : lariatVisibility(splice, element.id === 'I1' ? 0 : 1));
      if (visibility < 0.01) continue;
      // Dense enough that the steep lift-off at the polymerase is a curve and not a corner.
      const steps = exon ? 28 : 56;
      context.beginPath();
      for (let i = 0; i <= steps; i++) {
        elementPoint(element, i, steps, splice, point);
        project(point);
        if (!i) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.strokeStyle = exon ? accent : highlight;
      context.lineWidth = exon ? (demo ? 3.2 : 2) : demo ? 1.5 : 1;
      context.globalAlpha = base * visibility * (exon ? 0.34 : 0.32);
      context.stroke();
    }
    if (splice.cap > 0.01 && splice.rnaAlpha > 0.01) {
      capPoint(splice, point);
      project(point);
      context.beginPath();
      context.arc(point.x, point.y, demo ? 4.2 : 3, 0, TAU);
      context.fillStyle = highlight;
      context.globalAlpha = base * splice.cap * splice.rnaAlpha * 0.8;
      context.fill();
      context.strokeStyle = ink;
      context.lineWidth = 0.8;
      context.globalAlpha = base * splice.cap * splice.rnaAlpha * 0.35;
      context.stroke();
    }
    const tail = polyAVisible(splice);
    if (tail > 0 && splice.rnaAlpha > 0.01) {
      const radius = demo ? 2 : 1.4;
      context.beginPath();
      for (let j = 0; j < tail; j++) {
        polyAPoint(j, splice, point);
        project(point);
        context.moveTo(point.x + radius, point.y);
        context.arc(point.x, point.y, radius, 0, TAU);
      }
      context.fillStyle = highlight;
      context.globalAlpha = base * splice.rnaAlpha * 0.75;
      context.fill();
    }
    for (let k = 0; k < 2; k++) {
      const gathered = splice.introns[k].spliceosome;
      if (gathered < 0.05) continue;
      spliceosomeCenter(splice, k, point);
      project(point);
      context.beginPath();
      context.arc(point.x, point.y, 0.036 * scale, 0, TAU);
      context.fillStyle = highlight;
      context.globalAlpha = base * gathered * 0.1;
      context.fill();
      context.strokeStyle = ink;
      context.lineWidth = demo ? 1.6 : 1.1;
      context.globalAlpha = base * gathered * 0.5;
      context.stroke();
    }
    context.restore();
  }
  /**
   * Captions for the RNA, coverage and attention scenes in the explorer's "Show structures" mode: only what is
   * on screen, placed against the same functions that place the dots, and dropped when one would
   * land on another rather than printed over it.
   */
  function drawStageCaptions() {
    if (!demo || !labels) return;
    const rna = stageWeight(displayed, 'rna');
    const locus = stageWeight(displayed, 'signal');
    const attention = stageWeight(displayed, 'attention');
    const weight = Math.max(rna, locus, attention);
    if (weight < 0.9) return;
    const anchors: readonly Caption[] =
      weight === rna
        ? spliceAnchors(splice)
        : weight === locus
          ? locusAnchors()
          : finale === 'motif'
            ? motifCaption
            : attentionAnchors();
    context.save();
    context.font = '10.5px system-ui';
    context.textAlign = 'center';
    context.fillStyle = ink;
    context.strokeStyle = ink;
    context.lineWidth = 0.8;
    const fade = 0.85 * smoothstep((weight - 0.9) / 0.1);
    const taken: number[][] = [];
    for (const anchor of anchors) {
      point.x = anchor.x;
      point.y = anchor.y;
      point.z = 0;
      project(point);
      // A caption wider than the room its structure leaves uses its shorter form, when it has one.
      let text = anchor.label;
      if (anchor.short && anchor.room !== undefined)
        if (context.measureText(text).width > anchor.room * scale) text = anchor.short;
      const half = context.measureText(text).width / 2 + 3;
      const x = Math.max(half + 8, Math.min(width - half - 8, point.x));
      const y = anchor.side === 'above' ? point.y - 7 : point.y + 13;
      const box = [x - half, y - 11, x + half, y + 3];
      if (taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1]))
        continue;
      taken.push(box);
      context.globalAlpha = fade * 0.4;
      context.beginPath();
      context.moveTo(point.x, point.y + (anchor.side === 'above' ? -2 : 2));
      context.lineTo(point.x, anchor.side === 'above' ? y + 3 : y - 10);
      context.stroke();
      context.globalAlpha = fade;
      context.fillText(text, x, y);
    }
    context.restore();
  }
  function drawLabels() {
    if (!demo || !labels) return;
    context.font = '11px system-ui';
    const index = Math.round(displayed * 6);
    const weight = stageWeight(displayed, MORPH_STAGES[index].id);
    if (weight < 0.9) return;
    context.globalAlpha = 0.9 * smoothstep((weight - 0.9) / 0.1);
    context.fillStyle = ink;
    context.textAlign = 'center';
    // Dedicated top/bottom gutters remain clear even in the 320px phone dialog.
    context.fillText(
      index === 6 && finale === 'motif'
        ? 'Rap1 · budding yeast · JASPAR MA0359.3'
        : STRUCTURE_LABELS[index][0],
      width / 2,
      22,
      width - 24
    );
    context.fillText(
      index === 6 && finale === 'motif'
        ? 'Letter height = frequency × information · solid: outgoing · dashed: incoming'
        : STRUCTURE_LABELS[index][1],
      width / 2,
      height - 14,
      width - 24
    );
  }
  function drawTargetAccents() {
    for (const id of ACCENT_STAGES) {
      const weight = stageWeight(displayed, id);
      if (weight < 0.005) continue;
      context.strokeStyle = accent;
      context.fillStyle = accent;
      context.globalAlpha = opacity() * weight * 0.28;
      context.lineWidth = demo ? 1.6 : 1;
      if (id === 'network') {
        context.beginPath();
        for (let edge = 0; edge < NETWORK_EDGES.length; edge++) {
          sampleNetworkEdge(edge, 0, point);
          project(point);
          context.moveTo(point.x, point.y);
          sampleNetworkEdge(edge, 1, point);
          project(point);
          context.lineTo(point.x, point.y);
        }
        context.stroke();
        context.beginPath();
        for (let node = 0; node < NETWORK_NODE_COUNT; node++) {
          sampleNetworkNode(node, point);
          project(point);
          const radius = (demo ? 3 : 2) + Math.sin(clock * 1.2 - node * 0.3) * 0.4;
          context.moveTo(point.x + radius, point.y);
          context.arc(point.x, point.y, radius, 0, TAU);
        }
        context.fill();
        continue;
      }
      context.beginPath();
      for (let i = 0; i <= 192; i++) {
        sampleProteinBackbone(i / 192, point);
        project(point);
        if (!i) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.stroke();
      if (id === 'protein') {
        for (const structure of PROTEIN_SECONDARY_STRUCTURE) {
          context.beginPath();
          for (let i = 0; i <= 40; i++) {
            sampleProteinBackbone(
              (structure.start - 1 + ((structure.end - structure.start) * i) / 40) / 75,
              point
            );
            project(point);
            if (!i) context.moveTo(point.x, point.y);
            else context.lineTo(point.x, point.y);
          }
          context.strokeStyle = structure.type === 'helix' ? highlight : accent;
          context.lineWidth = demo ? 4 : 2;
          context.stroke();
        }
      }
    }
  }
  function draw() {
    if (disposed) return;
    // Play/ambient running owns this clock. A stopped explorer can still tween
    // or Stir, but keeps its decorative phase so it settles to the same image.
    // Motion Paused, hidden, reduced and static fallback suppress every new pass.
    life.time = clock;
    life.amount = canAnimate() ? (motion === 'calm' ? 0.45 : 1) : 0;
    glowCount = streakCount = pulseCount = packetCount = bokehCount = 0;
    spliceCount = sparkCount = junctionCount = arcCount = 0;
    transcriptionGap = 0;
    computeSplice(clock, splice);
    if (stageWeight(displayed, 'attention') < 0.9 && motifFocus >= 0) clearMotifFocus();
    layout();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    drawBokeh();
    const introBlend = smoothstep(introAge / 1.5);
    // A few quiet braided streams add depth without filling reading areas with noise.
    const atmosphere = coarse ? 96 : 240;
    for (let i = 0; i < atmosphere; i++) {
      sampleMorphAtmosphere(i, atmosphere, displayed, clock, point);
      if (point.alpha < 0.005) continue;
      project(point);
      context.globalAlpha = opacity() * point.alpha;
      context.fillStyle = i % 5 === 0 ? highlight : accent;
      context.beginPath();
      context.arc(point.x, point.y, (i % 7 === 0 ? 1.6 : 0.7) * (demo ? 1.15 : 0.8), 0, TAU);
      context.fill();
    }
    bucketHeads.fill(-1);
    let visible = 0;
    // Past halfway into the RNA scene every dot takes the ink of what it is (exon, intron, template),
    // and likewise in the coverage scene (coverage, junction read) and the attention scene.
    const ownClasses =
      stageWeight(displayed, 'rna') >= 0.5
        ? rnaClasses
        : stageWeight(displayed, 'signal') >= 0.5
          ? locusClasses
          : stageWeight(displayed, 'attention') >= 0.5
            ? finaleMix < 0.5
              ? motifClasses
              : attentionClasses
            : null;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const visibility = particleVisibility(p, previousQuality, quality, qualityAge / 0.4);
      positions[i * 4 + 3] = 0;
      if (visibility <= 0) continue;
      sampleMorph(p, displayed, clock, point, scratch, finaleMix);
      if (introBlend < 1 && displayed < 0.02) {
        point.x += Math.sin(i * 2.39) * (1 - introBlend) * 0.55;
        point.y += Math.cos(i * 1.73) * (1 - introBlend) * 0.5;
      }
      point.x += offsets[i * 4];
      point.y += offsets[i * 4 + 1];
      project(point);
      if (hover > 0.01 && stageWeight(displayed, 'attention') * (1 - finaleMix) < 0.5) {
        const dx = point.x - hoverX,
          dy = point.y - hoverY;
        const distance = Math.hypot(dx, dy);
        const force = morphPointerFalloff(distance, demo ? 115 : 85) * hover * (demo ? 10 : 3.5);
        if (distance > 1) {
          point.x += ((dx - dy * 0.35) / distance) * force;
          point.y += ((dy + dx * 0.35) / distance) * force;
        }
      }
      positions[i * 4] = point.x;
      positions[i * 4 + 1] = point.y;
      positions[i * 4 + 2] = point.z;
      positions[i * 4 + 3] = point.alpha * visibility;
      const depth = Math.max(0, Math.min(5, Math.floor(((point.z + 0.55) / 1.1) * 6)));
      const alpha = point.alpha * visibility * (0.65 + depth * 0.07);
      if (alpha < 0.015) continue;
      visible++;
      const shade = Math.max(0, Math.min(11, Math.round(alpha * 12) - 1));
      const size = Math.max(0, Math.min(2, Math.floor((p.size - 0.6) / 0.3)));
      const warm = (p.role === 'chromatin' && p.u > 0.82) || (p.role === 'cytoplasm' && p.u > 0.7);
      const color = ownClasses ? ownClasses[i] : p.role === 'nucleolus' ? 1 : warm ? 2 : 0;
      const bucket = ((depth * 7 + color) * 3 + size) * 12 + shade;
      nextParticle[i] = bucketHeads[bucket];
      bucketHeads[bucket] = i;
    }
    drawDna(true);
    drawCell();
    drawLocus();
    drawAttention();
    drawMotif();
    drawSplicing();
    drawTargetAccents();
    drawStreaks();
    const dotScale = demo ? Math.max(0.85, Math.min(1.35, scale / 220)) : 0.9;
    for (let bucket = 0; bucket < bucketHeads.length; bucket++) {
      if (bucket === bucketHeads.length / 2) drawDna(false);
      if (bucketHeads[bucket] < 0) continue;
      const shade = bucket % 12;
      const size = Math.floor(bucket / 12) % 3;
      const color = Math.floor(bucket / 36) % 7;
      const depth = Math.floor(bucket / 252);
      const radius = (0.65 + size * 0.3) * dotScale * (0.85 + depth * 0.06);
      context.globalAlpha = opacity() * ((shade + 1) / 12);
      context.fillStyle =
        color >= 3 ? motifInks[color - 3] : color === 1 ? ink : color === 2 ? highlight : accent;
      context.beginPath();
      for (let i = bucketHeads[bucket]; i >= 0; i = nextParticle[i]) {
        const x = positions[i * 4],
          y = positions[i * 4 + 1];
        context.moveTo(x + radius, y);
        context.arc(x, y, radius, 0, TAU);
      }
      context.fill();
    }
    drawLights();
    drawStageLife();
    drawLabels();
    drawStageCaptions();
    context.globalAlpha = 1;
    if (mask) {
      context.globalCompositeOperation = 'destination-out';
      context.drawImage(mask, 0, 0, width, height);
      context.globalCompositeOperation = 'source-over';
    }
    canvas.dataset.bgProgress = progress.toFixed(3);
    canvas.dataset.bgStage = MORPH_STAGES[Math.round(displayed * 6)].id;
    canvas.dataset.bgDisplayedProgress = displayed.toFixed(3);
    canvas.dataset.bgTransitioning = String(!!tween);
    canvas.dataset.bgQuality = quality.toFixed(2);
    canvas.dataset.bgVisible = String(visible);
    canvas.dataset.bgAllocated = String(particles.length);
    canvas.dataset.bgAtmosphere = String(atmosphere);
    canvas.dataset.bgPointer = hover.toFixed(3);
    canvas.dataset.bgInteractions = String(interactionCount);
    canvas.dataset.bgFrames = String(Number(canvas.dataset.bgFrames || 0) + 1);
    canvas.dataset.bgLife = String(life.amount);
    canvas.dataset.bgGlow = String(glowCount);
    canvas.dataset.bgStreaks = String(streakCount);
    canvas.dataset.bgPulses = String(pulseCount);
    canvas.dataset.bgPackets = String(packetCount);
    canvas.dataset.bgBokeh = String(bokehCount);
    canvas.dataset.bgSplice = String(spliceCount);
    canvas.dataset.bgSparks = String(sparkCount);
    canvas.dataset.bgSplicePhase = splice.phase.toFixed(3);
    const rnaVisible = stageWeight(displayed, 'rna') >= 0.005;
    canvas.dataset.bgTranscriptionOpen = (rnaVisible ? splice.bubbleOpen : 0).toFixed(3);
    canvas.dataset.bgTranscriptionGap = transcriptionGap.toFixed(2);
    canvas.dataset.bgTranscriptionX = (rnaVisible ? splice.polX : 0).toFixed(3);
    canvas.dataset.bgJunctions = String(junctionCount);
    canvas.dataset.bgArcs = String(arcCount);
    canvas.dataset.bgPalette = String(paletteVersion);
    canvas.dataset.bgLightBlend = darkLight ? 'lighter' : 'source-over';
    canvas.dataset.bgWarmInk = highlight;
    canvas.dataset.bgFinale = finale;
    canvas.dataset.bgFinaleMix = finaleMix.toFixed(3);
    canvas.dataset.bgFinaleTransitioning = String(!!finaleTween);
    canvas.dataset.bgMotifFocus = String(motifFocus);
    canvas.dataset.bgMotifOutgoing = String(motifFocus >= 0 ? (coarse ? 1 : 2) : 0);
    canvas.dataset.bgMotifIncoming = canvas.dataset.bgMotifOutgoing;
    canvas.dataset.bgMotifX0 = (originX + MOTIF_X0 * scale).toFixed(2);
    canvas.dataset.bgMotifX1 = (originX + MOTIF_X1 * scale).toFixed(2);
    canvas.dataset.bgMotifY = (originY + 0.15 * scale).toFixed(2);
    for (let i = 0; i < particles.length; i++) {
      previous[i * 3] = positions[i * 4];
      previous[i * 3 + 1] = positions[i * 4 + 1];
      previous[i * 3 + 2] = positions[i * 4 + 3];
    }
    historyReady = !!life.amount;
  }
  function drawBokeh() {
    if (!life.amount || !paletteVersion) return;
    context.save();
    context.globalCompositeOperation = darkLight ? 'lighter' : 'source-over';
    for (let i = 0; i < (coarse ? 12 : 28); i++) {
      bokehDot(i, life, bokeh);
      const x = ((bokeh.x + 1) / 2) * width + pointerX * 10 * 1.6;
      const y = ((bokeh.y + 1) / 2) * height + pointerY * 10 * 1.6;
      context.globalAlpha = bokeh.alpha;
      context.drawImage(
        lights[i % 2],
        x - bokeh.radius,
        y - bokeh.radius,
        bokeh.radius * 2,
        bokeh.radius * 2
      );
      bokehCount++;
    }
    context.restore();
  }
  function drawLights() {
    if (!life.amount || !paletteVersion) return;
    context.save();
    context.globalCompositeOperation = darkLight ? 'lighter' : 'source-over';
    const cap = coarse ? 100 : 250;
    const stride = Math.ceil(particles.length / cap);
    for (let i = 0; i < particles.length && glowCount < cap; i += stride) {
      const alpha = positions[i * 4 + 3];
      if (alpha <= 0.015) continue;
      const radius = demo ? 6 : 4;
      context.globalAlpha = life.amount * alpha * (darkLight ? 0.3 : 0.15);
      context.drawImage(
        lights[i % 2],
        positions[i * 4] - radius,
        positions[i * 4 + 1] - radius,
        radius * 2,
        radius * 2
      );
      glowCount++;
    }
    context.restore();
  }
  function drawStreaks() {
    const transitioning = !!tween || Math.abs(displayed * 6 - Math.round(displayed * 6)) > 0.002;
    if (!life.amount || quality < 0.6 || !historyReady || !transitioning) return;
    streakBands.fill(0);
    const cap = Math.floor(particles.length / 3);
    for (let i = 0; i < particles.length && streakCount < cap; i += 3) {
      if (positions[i * 4 + 3] <= 0.015 || previous[i * 3 + 2] <= 0.015) continue;
      const strength = streakStrength(
        positions[i * 4] - previous[i * 3],
        positions[i * 4 + 1] - previous[i * 3 + 1],
        life
      );
      if (strength < life.amount * 0.02) continue;
      streakBands[i] = strength > life.amount * 0.3 ? 2 : 1;
      streakCount++;
    }
    context.save();
    context.strokeStyle = accent;
    context.lineWidth = 0.8;
    for (let band = 1; band <= 2; band++) {
      context.globalAlpha = life.amount * (band === 1 ? 0.06 : 0.14);
      context.beginPath();
      for (let i = 0; i < particles.length; i += 3)
        if (streakBands[i] === band) {
          context.moveTo(previous[i * 3], previous[i * 3 + 1]);
          context.lineTo(positions[i * 4], positions[i * 4 + 1]);
        }
      context.stroke();
    }
    context.restore();
  }
  function drawStageLife() {
    if (!life.amount) return;
    context.save();
    context.fillStyle = highlight;
    const network = stageWeight(displayed, 'network');
    if (network > 0.005) {
      context.globalAlpha = life.amount * network * 0.65;
      context.beginPath();
      for (let edge = 0; edge < Math.min(NETWORK_EDGES.length, coarse ? 24 : 48); edge++) {
        networkPackets(edge, life, packet);
        sampleNetworkEdge(edge, packet.t, point);
        project(point);
        context.moveTo(point.x + 2, point.y);
        context.arc(point.x, point.y, 2, 0, TAU);
        packetCount++;
      }
      context.fill();
    }
    const rna = stageWeight(displayed, 'rna');
    if (rna > 0.005) {
      for (let k = 0; k < 2; k++) {
        const gathered = splice.introns[k].spliceosome;
        if (gathered > 0.05) {
          // A glow where the spliceosome has gathered on its intron.
          spliceosomeCenter(splice, k, point);
          project(point);
          const radius = (demo ? 17 : 12) * (0.75 + 0.25 * gathered);
          context.save();
          context.globalCompositeOperation = darkLight ? 'lighter' : 'source-over';
          context.globalAlpha = life.amount * rna * gathered * (darkLight ? 0.55 : 0.35);
          context.drawImage(lights[1], point.x - radius, point.y - radius, radius * 2, radius * 2);
          context.restore();
          spliceCount++;
        }
        // And a burst of sparks as the exons ligate.
        for (let i = 0; i < SPARKS_PER_INTRON; i++) {
          spliceSpark(splice, k, i, point);
          const sparkAlpha = point.alpha;
          if (sparkAlpha < 0.03) continue;
          project(point);
          context.globalAlpha = life.amount * rna * sparkAlpha * 0.9;
          context.beginPath();
          context.arc(point.x, point.y, demo ? 2.2 : 1.6, 0, TAU);
          context.fill();
          sparkCount++;
        }
      }
    }
    const attention = stageWeight(displayed, 'attention') * finaleMix;
    if (attention > 0.005) {
      // Warm pulses leave the promoter along the arcs: one a period on every arc, and a second on the
      // strongest, so a phone, which draws the first six slots, keeps the strongest arcs.
      context.fillStyle = highlight;
      const slots = coarse ? 6 : PULSE_SLOTS.length;
      for (let s = 0; s < slots; s++) {
        const [arc, lane] = PULSE_SLOTS[s];
        attentionPulse(arc, lane, life, packet);
        const alpha = life.amount * attention * pulseEnvelope(packet.t) * 0.85;
        if (alpha < 0.02) continue;
        arcPoint(arc, packet.t, point);
        project(point);
        context.globalAlpha = alpha;
        context.beginPath();
        context.arc(point.x, point.y, demo ? 3 : 2.2, 0, TAU);
        context.fill();
        pulseCount++;
      }
    }
    context.restore();
  }
  function update(dt: number, now: number, wallDt: number) {
    qualityAge = Math.min(0.4, qualityAge + dt);
    const follow = 1 - Math.exp(-dt * 6);
    pointerX += (targetX - pointerX) * follow;
    pointerY += (targetY - pointerY) * follow;
    hover += ((pointerPresent ? 1 : 0) - hover) * follow;
    selectionAge = Math.min(2, selectionAge + wallDt);
    if (finaleTween) {
      finaleTween.age += wallDt;
      finaleMix = finaleBlend(finaleTween.from, finaleTween.to, finaleTween.age);
      if (finaleTween.age >= 0.75) finaleTween = null;
    }
    if (running) {
      const speed = motion === 'calm' ? 0.45 : 1;
      clock += dt * speed;
      introAge = Math.min(1.5, introAge + dt);
      if (demo) {
        // Story deadlines use elapsed active wall time. Only decorative motion is
        // capped/slowed; calm mode still completes the approved 60-second story.
        playbackAge += wallDt;
        progress = displayed = playbackProgress(playbackAge);
      } else {
        displayed += (progress - displayed) * (1 - Math.exp(-dt * 9));
        if (Math.abs(progress - displayed) < 0.0001) displayed = progress;
      }
    }
    if (tween) {
      tween.age += wallDt;
      displayed = tween.from + (progress - tween.from) * smoothstep(tween.age / tween.duration);
      if (tween.age >= tween.duration) {
        displayed = progress;
        tween = null;
      }
    }
    if (kickUntil > 0) {
      // The decorative simulation caps dt, but a finite interaction must not stretch
      // on a loaded/low-FPS browser. This exact spring safely consumes real elapsed time.
      const elapsed = Math.max(0, (now - kickTime) / 1000);
      kickTime = now;
      const decay = Math.exp(-7 * elapsed);
      const maxOffset = demo ? 0.12 : 0.06;
      for (let i = 0; i < particles.length; i++) {
        if (!positions[i * 4 + 3]) continue;
        const index = i * 4;
        // Same exact spring as the model, applied in-place without per-dot tuples.
        for (let axis = 0; axis < 2; axis++) {
          const position = offsets[index + axis],
            velocity = offsets[index + axis + 2];
          const b = velocity + 7 * position;
          // Repeated taps cannot pump the sculpture outside its bounded local response.
          offsets[index + axis] = Math.max(
            -maxOffset,
            Math.min(maxOffset, (position + b * elapsed) * decay)
          );
          offsets[index + axis + 2] = (velocity - 7 * b * elapsed) * decay;
        }
      }
      if (now >= kickUntil) {
        kickUntil = 0;
        offsets.fill(0);
      }
    }
  }
  function frame(now: number) {
    raf = 0;
    if (!canAnimate() || (!running && !tween && !kickUntil && !finaleTween && selectionAge >= 1.1))
      return;
    const elapsed = last ? now - last : 1000 / fps;
    if (elapsed >= 1000 / fps - 0.5) {
      last = now;
      const began = performance.now();
      update(Math.min(0.08, elapsed / 1000), now, elapsed / 1000);
      draw();
      const cost = performance.now() - began;
      canvas.dataset.bgRenderMs = cost.toFixed(2);
      canvas.dataset.bgTicks = String(Number(canvas.dataset.bgTicks || 0) + 1);
      costly = cost > 10 ? costly + 1 : Math.max(0, costly - 1);
      if (costly > 20) {
        previousQuality = quality;
        quality = Math.max(0.35, quality * 0.75);
        qualityAge = 0;
        fps = Math.max(12, fps - 6);
        costly = 0;
      }
      slow = cost > 24 && fps === 12 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 30) {
        setRunning(false);
        canvas.dataset.bgFallback = 'static';
        displayed = progress;
        introAge = 1.5;
        draw();
        return;
      }
    }
    schedule();
  }
  function schedule() {
    if (
      !raf &&
      canAnimate() &&
      (running || tween || kickUntil || finaleTween || selectionAge < 1.1)
    )
      raf = requestAnimationFrame(frame);
  }
  function setRunning(value: boolean) {
    const next = value && canAnimate();
    if (next === running && next) return;
    running = next;
    historyReady = false;
    cancelAnimationFrame(raf);
    raf = 0;
    last = performance.now();
    if (!running) {
      selectionAge = 2;
      pointerPresent = false;
      pointerX = pointerY = targetX = targetY = hover = 0;
      if (demo && tween) {
        progress = displayed;
        playbackAge = playbackTime(displayed);
      }
      tween = null;
      kickUntil = 0;
      offsets.fill(0);
      if (reduced()) {
        introAge = 1.5;
        displayed = progress;
      }
      if (!canAnimate()) draw();
      if (!canAnimate() && finaleTween) {
        finaleMix = finaleTween.to;
        finaleTween = null;
        draw();
      }
    } else if (demo) {
      if (tween) playbackAge = playbackTime(displayed);
      tween = null;
      progress = displayed;
    }
    schedule();
  }
  function setProgress(value: number, options?: { transition?: 'immediate' | 'smooth' }) {
    if (options?.transition === 'immediate' || Math.abs(value - progress) > 0.18)
      historyReady = false;
    progress = clamp01(Number.isFinite(value) ? value : 0);
    if (progress > 0.02) introAge = 1.5;
    playbackAge = playbackTime(progress);
    if (options?.transition === 'smooth' && canAnimate() && !running) {
      tween = { from: displayed, age: 0, duration: transitionDuration(displayed, progress) };
      last = performance.now();
      schedule();
    } else if (options?.transition === 'immediate' || demo || !running || !canAnimate()) {
      tween = null;
      displayed = progress;
    }
    draw();
  }
  function resize() {
    historyReady = false;
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    dpr = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2);
    MORPH_STAGES.forEach((stage, i) => {
      const chapter = home
        ? document.querySelector<HTMLElement>(`[data-background-stage="${stage.id}"]`)
        : null;
      chapterHeights[i] = chapter?.clientHeight || (coarse ? 240 : 280);
    });
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    draw();
  }
  function refreshPalette() {
    const style = getComputedStyle(document.documentElement);
    accent = style.getPropertyValue('--color-accent').trim() || '#2e6e5e';
    ink = style.getPropertyValue('--color-ink').trim() || '#141414';
    surface = style.getPropertyValue('--color-surface').trim() || '#fafaf8';
    const theme = document.documentElement.dataset.theme;
    highlight = style.getPropertyValue('--color-badge-warm-text').trim() || accent;
    const crt = document.documentElement.dataset.crtMode;
    if (crt && crt !== 'off') {
      accent = ink = crt === 'amber' ? '#ffb000' : crt === 'green' ? '#33ff33' : '#38fdf8';
      highlight = accent;
    }
    const dark = !!theme && !['light', 'parchment'].includes(theme);
    const colors = dark
      ? ['#8abb9e', '#8bb8d0', '#d6b56e', '#d59cad']
      : ['#38795d', '#487b9c', '#a27a3c', '#a45e70'];
    for (let i = 0; i < 4; i++) motifInks[i] = crt && crt !== 'off' ? accent : colors[i];
    darkLight = (!!crt && crt !== 'off') || (!!theme && !['light', 'parchment'].includes(theme));
    for (let i = 0; i < lights.length; i++) {
      const sprite = lights[i];
      sprite.width = sprite.height = 32;
      const light = sprite.getContext('2d')!;
      const gradient = light.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, i ? highlight : accent);
      gradient.addColorStop(1, 'transparent');
      light.fillStyle = gradient;
      light.fillRect(0, 0, 32, 32);
    }
    paletteVersion++;
    historyReady = false;
    draw();
  }
  function clearMotifFocus() {
    clearTimeout(focusTimer);
    focusTimer = 0;
    motifFocus = -1;
    selectionAge = 2;
  }
  function selectMotifFocus(position: number, touch = false, explicitMotion = false) {
    if (disposed || stageWeight(displayed, 'attention') < 0.9 || finaleMix > 0.05) return;
    const next = Number.isInteger(position) && position >= 0 && position < 12 ? position : -1;
    if (next === motifFocus) return;
    clearTimeout(focusTimer);
    motifFocus = next;
    selectionAge = next >= 0 && canAnimate() && (running || explicitMotion) ? 0 : 2;
    offsets.fill(0);
    pointerPresent = false;
    hover = targetX = targetY = pointerX = pointerY = 0;
    if (touch && next >= 0)
      focusTimer = window.setTimeout(() => {
        clearMotifFocus();
        draw();
      }, 4000);
    const links = motifLinks(next, coarse);
    const description =
      next < 0
        ? 'Motif selection cleared.'
        : `Position ${next + 1} of 12. Outgoing to ${links
            .filter((l) => l.direction === 'outgoing')
            .map((l) => l.to + 1)
            .join(', ')}; incoming from ${links
            .filter((l) => l.direction === 'incoming')
            .map((l) => l.from + 1)
            .join(', ')}.`;
    canvas.dispatchEvent(
      new CustomEvent('khc:motif-focus', { detail: { position: next, description } })
    );
    last = performance.now();
    draw();
    schedule();
  }
  resize();
  refreshPalette();
  return {
    resize,
    refreshPalette,
    setRunning,
    setProgress,
    getProgress: () => (demo ? displayed : progress),
    setPointer(value) {
      if (stageWeight(displayed, 'attention') >= 0.9 && finaleMix <= 0.05 && !coarse) {
        selectMotifFocus(
          value ? motifPositionAt((value.x - originX) / scale, (value.y - originY) / scale) : -1
        );
        return;
      }
      if (!running || !canAnimate() || coarse) return;
      pointerPresent = !!value;
      targetX = value ? Math.max(-1, Math.min(1, (value.x - originX) / Math.max(1, scale))) : 0;
      targetY = value ? Math.max(-1, Math.min(1, (value.y - originY) / Math.max(1, scale))) : 0;
      if (value) {
        hoverX = value.x;
        hoverY = value.y;
      }
    },
    reset() {
      clearMotifFocus();
      historyReady = false;
      tween = null;
      pointerPresent = false;
      pointerX = pointerY = targetX = targetY = hover = 0;
      offsets.fill(0);
      kickUntil = 0;
      clock = playbackAge = progress = displayed = 0;
      introAge = 1.5;
      draw();
    },
    setMotion(value) {
      historyReady = false;
      motion = value;
      if (value === 'paused') {
        setRunning(false);
        introAge = 1.5;
      }
      draw();
    },
    setMask(value) {
      mask = value;
      draw();
    },
    step() {
      setProgress(Math.min(1, displayed + 0.05), { transition: 'immediate' });
    },
    configure(options) {
      if (options.finaleVariant !== undefined) {
        finale = options.finaleVariant;
        const to = finale === 'attention' ? 1 : 0;
        clearMotifFocus();
        historyReady = false;
        if (
          options.finaleTransition === 'smooth' &&
          canAnimate() &&
          (!demo || running) &&
          finaleMix !== to
        ) {
          finaleTween = { from: finaleMix, to, age: 0 };
          last = performance.now();
          schedule();
        } else {
          finaleMix = to;
          finaleTween = null;
        }
        draw();
      }
      if (options.motifFocus !== undefined) selectMotifFocus(options.motifFocus);
      if (options.labels !== undefined) {
        labels = options.labels;
        draw();
      }
    },
    interact(x, y, options) {
      if (stageWeight(displayed, 'attention') >= 0.9 && finaleMix <= 0.05) {
        const hit = motifPositionAt((x - originX) / scale, (y - originY) / scale);
        selectMotifFocus(hit === motifFocus ? -1 : hit, true, options?.animate);
        return;
      }
      if ((!demo && !running) || !canAnimate()) return;
      interactionCount++;
      const radius = Math.min(width, height) * 0.22;
      for (let i = 0; i < particles.length; i++) {
        if (!positions[i * 4 + 3]) continue;
        const dx = positions[i * 4] - x,
          dy = positions[i * 4 + 1] - y,
          distance = Math.hypot(dx, dy);
        if (distance > radius || distance < 1) continue;
        const push = (1 - distance / radius) * (demo ? 1.6 : 0.6) * (motion === 'calm' ? 0.45 : 1);
        offsets[i * 4 + 2] += ((dx - dy * 0.6) / distance) * push;
        offsets[i * 4 + 3] += ((dy + dx * 0.6) / distance) * push;
        offsets[i * 4 + 2] = Math.max(-1.8, Math.min(1.8, offsets[i * 4 + 2]));
        offsets[i * 4 + 3] = Math.max(-1.8, Math.min(1.8, offsets[i * 4 + 3]));
      }
      const now = performance.now();
      if (!kickUntil) kickTime = now;
      kickUntil = now + 1500;
      schedule();
    },
    status() {
      return `${stageDescription(displayed, finale)} ${tween ? `Moving toward: ${stageDescription(progress, finale)} ` : ''}${labels ? 'Structure labels enabled. ' : ''}Relative scales are illustrative.`;
    },
    dispose() {
      clearMotifFocus();
      setRunning(false);
      disposed = true;
      mask = null;
    },
  };
}
