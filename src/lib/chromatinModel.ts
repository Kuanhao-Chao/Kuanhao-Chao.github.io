/**
 * The geometry and arithmetic of chromatin compaction, with no renderer in it.
 *
 * Every dimension here is from the structural literature and is cited at its constant. The
 * module returns plain numbers and `[x, y, z]` tuples; `src/scripts/chromatin.ts` turns those
 * into Three.js buffers. Keeping the split means the science is unit-testable without a GPU,
 * the same reason `deepDiveMath.ts` backs the deep-dive widgets rather than the widgets owning
 * their own arithmetic.
 *
 * One honest note runs through the whole file. Chromatin above the nucleosome is *contested*:
 * the 30 nm fibre is a real structure in vitro and has not been observed in human cells in
 * situ. Where a model is a model, it says so.
 */

export type Vec3 = readonly [number, number, number];

// ── B-form DNA ────────────────────────────────────────────────────────────────

/** Rise per base pair along the duplex axis, nanometres. */
export const BP_RISE_NM = 0.34;
/** Base pairs per complete turn of the B-form double helix. */
export const BP_PER_TURN = 10.5;
/** Duplex diameter, nanometres. */
export const DNA_DIAMETER_NM = 2.0;
/** Helical pitch: one full turn of B-DNA. 10.5 × 0.34 = 3.57 nm. */
export const DNA_PITCH_NM = BP_PER_TURN * BP_RISE_NM;

// ── The nucleosome (Luger et al. 1997; Davey et al. 2002) ─────────────────────

/** Base pairs in the nucleosome core particle. */
export const NUCLEOSOME_CORE_BP = 147;
/** Left-handed superhelical turns the core DNA makes around the octamer. */
export const SUPERHELICAL_TURNS = 1.65;
/** Radius of the DNA superhelix around the octamer, nanometres. */
export const SUPERHELIX_RADIUS_NM = 4.18;
/** Rise of the DNA superhelix over one turn, nanometres. */
export const SUPERHELIX_PITCH_NM = 2.39;
/**
 * Core particle diameter, nanometres — the disc seen edge-on in every textbook.
 *
 * This is the *protein* particle. The DNA superhelix it wraps is narrower: 2 × 4.18 + 2 =
 * 10.36 nm, and the 0.64 nm difference is histone surface. `coreParticleEnvelope` returns the
 * DNA figure, which is the one a renderer needs so the duplex does not clip through the disc.
 */
export const NUCLEOSOME_DIAMETER_NM = 11.0;
/** Core particle height, nanometres. Quoted between 5.5 and 6; the DNA envelope computes 5.94. */
export const NUCLEOSOME_HEIGHT_NM = 5.5;
/** Base pairs protected once linker histone H1 is bound: the chromatosome. */
export const CHROMATOSOME_BP = 166;
/** Typical human nucleosome repeat length (core + linker), base pairs. */
export const NUCLEOSOME_REPEAT_BP = 187;

/** The eight core histones, as the octamer assembles: a (H3–H4)₂ tetramer, two H2A–H2B dimers. */
export const HISTONE_SUBUNITS = [
  { name: 'H3', copy: 1, group: 'tetramer' },
  { name: 'H4', copy: 1, group: 'tetramer' },
  { name: 'H3', copy: 2, group: 'tetramer' },
  { name: 'H4', copy: 2, group: 'tetramer' },
  { name: 'H2A', copy: 1, group: 'dimerA' },
  { name: 'H2B', copy: 1, group: 'dimerA' },
  { name: 'H2A', copy: 2, group: 'dimerB' },
  { name: 'H2B', copy: 2, group: 'dimerB' },
] as const;

// ── Higher order, and what is actually known about it ─────────────────────────

/** Diameter of the classical 30 nm fibre, nanometres. In vitro. */
export const FIBRE_30NM_DIAMETER_NM = 30;
/** Nucleosomes per turn of the one-start solenoid model. */
export const SOLENOID_NUCLEOSOMES_PER_TURN = 6;
/** Rise per turn of the solenoid, nanometres — roughly one nucleosome height per two. */
export const SOLENOID_PITCH_NM = 11;
/** ChromEMT measured chromatin chains between these widths in situ (Ou et al. 2017). */
export const DISORDERED_CHAIN_MIN_NM = 5;
export const DISORDERED_CHAIN_MAX_NM = 24;

/** Mitotic loop sizes, base pairs (Gibcus et al. 2018). */
export const PROPHASE_LOOP_BP = 60_000;
export const PROMETA_INNER_LOOP_BP = 80_000;
export const PROMETA_OUTER_LOOP_BP = 400_000;
/** Base pairs per helical turn of the prometaphase loop array. */
export const HELICAL_TURN_BP = 12_000_000;
/** Metaphase chromatid diameter, nanometres. */
export const CHROMATID_DIAMETER_NM = 700;

/** Human chromosome 1, GRCh38. */
export const CHR1_BP = 248_956_422;
/** Length of a metaphase chromosome 1, nanometres (~10 µm). */
export const CHR1_METAPHASE_NM = 10_000;

// ── Contour arithmetic ────────────────────────────────────────────────────────

/** Length of `bp` base pairs of B-form DNA, in nanometres. */
export function contourLengthNm(bp: number): number {
  if (bp < 0) throw new RangeError(`contourLengthNm needs bp >= 0, got ${bp}`);
  return bp * BP_RISE_NM;
}

/**
 * Linear compaction: how many times shorter the packaged form is than the naked duplex.
 *
 * For chromosome 1 this is 248,956,422 × 0.34 nm = 84.6 mm of DNA in a 10 µm chromatid, so
 * roughly 8,500× — the number the whole hierarchy exists to produce.
 */
export function compactionRatio(bp: number, packagedLengthNm: number): number {
  if (packagedLengthNm <= 0) throw new RangeError('compactionRatio needs a positive length');
  return contourLengthNm(bp) / packagedLengthNm;
}

/**
 * The contour a nucleosome's DNA would have if it followed an ideal helix of the published
 * radius and pitch, against what 147 bp actually measures.
 *
 * These disagree by about 15%, and the gap is real rather than an error in either number:
 * nucleosomal DNA is sharply kinked where the histone octamer contacts the minor groove, so
 * its path is longer than a smooth helix through the same envelope. The model draws the smooth
 * helix — it is what the eye reads as a nucleosome — and this function exists so the
 * discrepancy is stated rather than hidden by quietly inflating the radius to 4.81 nm.
 */
export function superhelixContourNm(): { ideal: number; actual: number; ratio: number } {
  const perTurn = Math.hypot(2 * Math.PI * SUPERHELIX_RADIUS_NM, SUPERHELIX_PITCH_NM);
  const ideal = SUPERHELICAL_TURNS * perTurn;
  const actual = contourLengthNm(NUCLEOSOME_CORE_BP);
  return { ideal, actual, ratio: actual / ideal };
}

/**
 * The envelope the nucleosomal DNA actually sweeps, as against the quoted particle dimensions.
 *
 * A renderer that draws the histone disc at the quoted 11 nm × 5.5 nm and the DNA at its true
 * radius pushes the duplex through the top and bottom faces, because the DNA's own envelope is
 * 5.94 nm tall. Drawing the disc from these numbers instead keeps the two consistent.
 */
export function coreParticleEnvelope(): { diameterNm: number; heightNm: number } {
  return {
    diameterNm: 2 * SUPERHELIX_RADIUS_NM + DNA_DIAMETER_NM,
    heightNm: SUPERHELICAL_TURNS * SUPERHELIX_PITCH_NM + DNA_DIAMETER_NM,
  };
}

// ── Parametric paths ──────────────────────────────────────────────────────────

/**
 * One strand of the B-form duplex, sampled every `samplesPerBp` steps.
 *
 * `phase` offsets the strand around the axis: the two strands of B-DNA are not diametrically
 * opposite, which is what produces the wide major groove and the narrow minor groove. The
 * offset used here, 0.375 of a turn rather than 0.5, gives the ~22 nm / ~12 nm groove widths.
 */
export function bDnaStrand(
  bpCount: number,
  strand: 0 | 1,
  samplesPerBp = 2,
): Vec3[] {
  if (bpCount <= 0) throw new RangeError('bDnaStrand needs at least one base pair');
  const radius = DNA_DIAMETER_NM / 2;
  const phase = strand === 0 ? 0 : 2 * Math.PI * 0.375;
  const steps = Math.max(1, Math.round(bpCount * samplesPerBp));
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const bp = (i / steps) * bpCount;
    const angle = (bp / BP_PER_TURN) * 2 * Math.PI + phase;
    out.push([radius * Math.cos(angle), bp * BP_RISE_NM, radius * Math.sin(angle)]);
  }
  return out;
}

/** Axis endpoints of each base pair rung, for drawing the ladder between the two strands. */
export function bDnaBasePairs(bpCount: number): { a: Vec3; b: Vec3 }[] {
  const radius = DNA_DIAMETER_NM / 2;
  const out: { a: Vec3; b: Vec3 }[] = [];
  for (let bp = 0; bp < bpCount; bp += 1) {
    const angle = (bp / BP_PER_TURN) * 2 * Math.PI;
    const other = angle + 2 * Math.PI * 0.375;
    const y = bp * BP_RISE_NM;
    out.push({
      a: [radius * Math.cos(angle), y, radius * Math.sin(angle)],
      b: [radius * Math.cos(other), y, radius * Math.sin(other)],
    });
  }
  return out;
}

/**
 * The path nucleosomal DNA takes around the octamer: a left-handed superhelix of 1.65 turns.
 *
 * Left-handed means the angle *decreases* with t, which is the opposite sense to the
 * right-handed B-form duplex wound along it — the two chiralities are a real feature of the
 * structure and not a sign convention to be chosen for convenience.
 */
export function nucleosomeSuperhelix(samples = 160): Vec3[] {
  const out: Vec3[] = [];
  const totalAngle = SUPERHELICAL_TURNS * 2 * Math.PI;
  const totalRise = SUPERHELICAL_TURNS * SUPERHELIX_PITCH_NM;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const angle = -t * totalAngle;
    const y = (t - 0.5) * totalRise;
    out.push([
      SUPERHELIX_RADIUS_NM * Math.cos(angle),
      y,
      SUPERHELIX_RADIUS_NM * Math.sin(angle),
    ]);
  }
  return out;
}

/**
 * Where each of the eight core histones sits, and where it moves to when the view explodes.
 *
 * `explode` runs 0 (assembled) to 1 (fully separated). The tetramer travels along the
 * superhelical axis and the two dimers travel outward, which is the direction they actually
 * leave from — H2A–H2B dimers dissociate first at physiological salt, before the (H3–H4)₂
 * tetramer releases.
 */
export function histoneLayout(explode = 0): { name: string; group: string; at: Vec3 }[] {
  const e = Math.min(1, Math.max(0, explode));
  const coreR = 2.6;
  return HISTONE_SUBUNITS.map((h, i) => {
    const inTetramer = h.group === 'tetramer';
    const angle = (i / HISTONE_SUBUNITS.length) * 2 * Math.PI;
    const baseY = inTetramer ? (i % 2 === 0 ? 0.9 : -0.9) : (h.group === 'dimerA' ? 2.2 : -2.2);
    const spread = inTetramer ? e * 3.5 : e * 9.0;
    const lift = inTetramer ? e * 1.4 * Math.sign(baseY || 1) : e * 3.0 * Math.sign(baseY);
    return {
      name: h.name,
      group: h.group,
      at: [
        (coreR + spread) * Math.cos(angle),
        baseY + lift,
        (coreR + spread) * Math.sin(angle),
      ] as Vec3,
    };
  });
}

/** Centres of `count` nucleosomes strung along an extended 10 nm fibre. */
export function beadsOnAString(count: number, repeatBp = NUCLEOSOME_REPEAT_BP): Vec3[] {
  if (count < 1) throw new RangeError('beadsOnAString needs at least one nucleosome');
  // The linker runs between the exit and entry of successive cores, so the centre-to-centre
  // spacing is the wrapped core plus the linker contour, not the repeat length outright.
  const linkerBp = Math.max(0, repeatBp - NUCLEOSOME_CORE_BP);
  const spacing = NUCLEOSOME_DIAMETER_NM * 0.55 + contourLengthNm(linkerBp);
  const out: Vec3[] = [];
  for (let i = 0; i < count; i += 1) {
    // a slight zig keeps the string from reading as a ruler
    const wobble = Math.sin(i * 1.7) * 1.2;
    out.push([wobble, i * spacing, Math.cos(i * 1.3) * 1.2]);
  }
  return out;
}

/**
 * The one-start solenoid: six nucleosomes per turn on a 30 nm helix.
 *
 * This is a *model*. It is what purified chromatin forms in vitro at physiological salt, and
 * ChromEMT found no such fibre in human nuclei in situ. `disorderedChain` is the alternative.
 */
export function solenoidFibre(count: number): Vec3[] {
  const radius = (FIBRE_30NM_DIAMETER_NM - NUCLEOSOME_DIAMETER_NM) / 2;
  const out: Vec3[] = [];
  for (let i = 0; i < count; i += 1) {
    const turn = i / SOLENOID_NUCLEOSOMES_PER_TURN;
    const angle = turn * 2 * Math.PI;
    out.push([radius * Math.cos(angle), turn * SOLENOID_PITCH_NM, radius * Math.sin(angle)]);
  }
  return out;
}

/**
 * The two-start zigzag: nucleosomes alternate between two stacks that twist around each other,
 * so successive cores sit on opposite sides and the linker crosses the fibre axis.
 */
export function zigzagFibre(count: number): Vec3[] {
  const radius = (FIBRE_30NM_DIAMETER_NM - NUCLEOSOME_DIAMETER_NM) / 2;
  const out: Vec3[] = [];
  for (let i = 0; i < count; i += 1) {
    const pair = Math.floor(i / 2);
    const side = i % 2 === 0 ? 0 : Math.PI;
    const angle = (pair / 5.5) * 2 * Math.PI + side;
    out.push([
      radius * Math.cos(angle),
      pair * (SOLENOID_PITCH_NM * 0.62),
      radius * Math.sin(angle),
    ]);
  }
  return out;
}

/** Deterministic small PRNG, so the disordered chain is the same on every render. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Chromatin as ChromEMT actually found it: a disordered chain of variable width, with no
 * repeating higher-order fibre.
 *
 * The walk is a persistent random walk — each step turns by a bounded random angle from the
 * last — which produces the locally smooth, globally irregular path the tomograms show. The
 * returned `widthNm` varies between the measured 5 and 24 nm.
 */
export function disorderedChain(
  count: number,
  seed = 1,
): { at: Vec3; widthNm: number }[] {
  const rnd = mulberry32(seed);
  const step = NUCLEOSOME_DIAMETER_NM * 0.62;
  let pos: [number, number, number] = [0, 0, 0];
  let dir: [number, number, number] = [0, 1, 0];
  const out: { at: Vec3; widthNm: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const jitter = 0.55;
    const nx = dir[0] + (rnd() - 0.5) * jitter;
    const ny = dir[1] + (rnd() - 0.5) * jitter * 0.5 + 0.16;
    const nz = dir[2] + (rnd() - 0.5) * jitter;
    const len = Math.hypot(nx, ny, nz) || 1;
    dir = [nx / len, ny / len, nz / len];
    pos = [pos[0] + dir[0] * step, pos[1] + dir[1] * step, pos[2] + dir[2] * step];
    const widthNm =
      DISORDERED_CHAIN_MIN_NM + rnd() * (DISORDERED_CHAIN_MAX_NM - DISORDERED_CHAIN_MIN_NM);
    out.push({ at: [pos[0], pos[1], pos[2]], widthNm });
  }
  return out;
}

/**
 * A loop anchored at both ends, as cohesin extrusion leaves it: the chromatin between two
 * convergent CTCF sites, thrown out from the axis and returning to it.
 */
export function extrudedLoop(
  baseY: number,
  loopBp: number,
  azimuth: number,
  samples = 24,
  scaleNmPerBp = 2.4e-5,
): Vec3[] {
  const reach = Math.cbrt(loopBp) * scaleNmPerBp * 1000;
  const out: Vec3[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const arc = Math.sin(t * Math.PI);
    const r = reach * arc;
    out.push([
      r * Math.cos(azimuth),
      baseY + (t - 0.5) * reach * 0.35,
      r * Math.sin(azimuth),
    ]);
  }
  return out;
}

/**
 * The prometaphase loop array: consecutive loops emanating from a central condensin scaffold
 * that is itself wound into a helix — Gibcus's "spiral staircase".
 *
 * Successive loops rotate around the axis, so the array traces a helical staircase whose turn
 * consumes `HELICAL_TURN_BP` of sequence. `bpPerLoop` selects the nesting level: ~400 kb for
 * the condensin II outer loops, ~80 kb for the condensin I inner ones.
 */
export function helicalLoopArray(
  loopCount: number,
  bpPerLoop = PROMETA_OUTER_LOOP_BP,
): { anchor: Vec3; azimuth: number; loopBp: number }[] {
  const loopsPerTurn = Math.max(2, HELICAL_TURN_BP / bpPerLoop);
  const riseNm = CHROMATID_DIAMETER_NM * 0.42;
  const out: { anchor: Vec3; azimuth: number; loopBp: number }[] = [];
  for (let i = 0; i < loopCount; i += 1) {
    const turn = i / loopsPerTurn;
    const azimuth = turn * 2 * Math.PI;
    out.push({
      anchor: [0, turn * riseNm, 0],
      azimuth,
      loopBp: bpPerLoop,
    });
  }
  return out;
}

// ── The scrubber: which regime, and how the transitions blend ─────────────────

export type RegimeId =
  | 'duplex'
  | 'nucleosome'
  | 'beads'
  | 'fibre'
  | 'loops'
  | 'mitotic';

export interface Regime {
  id: RegimeId;
  /** Scrubber fraction where this regime starts and ends. */
  from: number;
  to: number;
  label: string;
  /** Field of view the camera should frame, nanometres. */
  fieldNm: number;
  /** Base pairs the scene represents at this scale. */
  bpInView: number;
}

/** The ladder, in scrubber order. Bands are contiguous; blending happens across their seams. */
export const REGIMES: readonly Regime[] = [
  { id: 'duplex', from: 0.0, to: 0.12, label: 'B-form double helix', fieldNm: 20, bpInView: 60 },
  { id: 'nucleosome', from: 0.12, to: 0.3, label: 'Nucleosome core particle', fieldNm: 34, bpInView: 147 },
  { id: 'beads', from: 0.3, to: 0.45, label: '10 nm fibre — beads on a string', fieldNm: 260, bpInView: 3_000 },
  { id: 'fibre', from: 0.45, to: 0.6, label: '30 nm regime', fieldNm: 620, bpInView: 30_000 },
  { id: 'loops', from: 0.6, to: 0.8, label: 'Loop domains and TADs', fieldNm: 2_400, bpInView: 2_000_000 },
  { id: 'mitotic', from: 0.8, to: 1.0, label: 'Mitotic loop array', fieldNm: 12_000, bpInView: 60_000_000 },
] as const;

/** Half-width of the cross-fade band around each seam, in scrubber units. */
export const BLEND_HALF_WIDTH = 0.035;

/** The regime a scrubber position falls in, and how far through it. */
export function regimeAt(scrub: number): { regime: Regime; localT: number; index: number } {
  const s = Math.min(1, Math.max(0, scrub));
  for (let i = 0; i < REGIMES.length; i += 1) {
    const r = REGIMES[i];
    if (s < r.to || i === REGIMES.length - 1) {
      return { regime: r, localT: (s - r.from) / (r.to - r.from), index: i };
    }
  }
  return { regime: REGIMES[0], localT: 0, index: 0 };
}

/**
 * How strongly each regime should be drawn at this scrubber position.
 *
 * Weights sum to 1 and at least one is always non-zero. Inside a band a single regime holds
 * the full weight; within `BLEND_HALF_WIDTH` of a seam the two neighbours share it on a
 * smoothstep, which is what stops representations appearing and vanishing abruptly.
 */
export function regimeWeights(scrub: number): Map<RegimeId, number> {
  const s = Math.min(1, Math.max(0, scrub));
  const weights = new Map<RegimeId, number>();
  for (const r of REGIMES) weights.set(r.id, 0);

  const { index } = regimeAt(s);
  const here = REGIMES[index];
  const seam = here.to;
  const next = REGIMES[index + 1];
  const prevSeam = here.from;
  const prev = REGIMES[index - 1];

  if (next && s > seam - BLEND_HALF_WIDTH) {
    const t = smoothstep((s - (seam - BLEND_HALF_WIDTH)) / (2 * BLEND_HALF_WIDTH));
    weights.set(here.id, 1 - t);
    weights.set(next.id, t);
  } else if (prev && s < prevSeam + BLEND_HALF_WIDTH) {
    const t = smoothstep((s - (prevSeam - BLEND_HALF_WIDTH)) / (2 * BLEND_HALF_WIDTH));
    weights.set(prev.id, 1 - t);
    weights.set(here.id, t);
  } else {
    weights.set(here.id, 1);
  }
  return weights;
}

/** Hermite smoothstep, clamped. */
export function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * Camera framing distance, nanometres, interpolated **logarithmically**.
 *
 * The ladder spans 20 nm to 12 µm — a factor of 600 — and linear interpolation across that
 * would spend almost the whole scrubber inside the last regime. Interpolating the logarithm
 * makes each decade of scale take a comparable amount of travel, which is what makes the
 * hierarchy feel like a hierarchy rather than a jump.
 */
export function cameraFieldNm(scrub: number): number {
  const s = Math.min(1, Math.max(0, scrub));
  const { regime, localT, index } = regimeAt(s);
  const next = REGIMES[index + 1] ?? regime;
  const t = smoothstep(localT);
  return Math.exp(Math.log(regime.fieldNm) * (1 - t) + Math.log(next.fieldNm) * t);
}

/** Base pairs represented at this scrubber position, interpolated on the same log scale. */
export function bpInViewAt(scrub: number): number {
  const s = Math.min(1, Math.max(0, scrub));
  const { regime, localT, index } = regimeAt(s);
  const next = REGIMES[index + 1] ?? regime;
  const t = smoothstep(localT);
  return Math.exp(Math.log(regime.bpInView) * (1 - t) + Math.log(next.bpInView) * t);
}

/** Linear compaction achieved at this scrubber position. */
export function compactionAt(scrub: number): number {
  return compactionRatio(bpInViewAt(scrub), cameraFieldNm(scrub));
}

// ── Level of detail ───────────────────────────────────────────────────────────

/** Ceiling on nucleosome instances drawn in one frame, whatever the scale asks for. */
export const NUCLEOSOME_INSTANCE_BUDGET = 4_000;

/**
 * How many nucleosomes to draw at this scrubber position.
 *
 * A metaphase chromosome holds roughly 1.35 million nucleosomes, so the count the biology
 * implies has to be capped long before the last regime. Past the fibre band the count falls to
 * zero and chromatin is drawn as a tube instead — the cross-fade is what makes that swap
 * invisible.
 */
export function nucleosomeBudget(scrub: number): number {
  const w = regimeWeights(scrub);
  const beads = w.get('beads') ?? 0;
  const fibre = w.get('fibre') ?? 0;
  const nucleosome = w.get('nucleosome') ?? 0;
  const loops = w.get('loops') ?? 0;
  const share = nucleosome * 0.004 + beads * 0.06 + fibre * 1 + loops * 0.25;
  return Math.min(NUCLEOSOME_INSTANCE_BUDGET, Math.round(share * NUCLEOSOME_INSTANCE_BUDGET));
}

/** True nucleosome count implied by the sequence in view, before any cap. */
export function impliedNucleosomeCount(scrub: number): number {
  return Math.round(bpInViewAt(scrub) / NUCLEOSOME_REPEAT_BP);
}

/** Milestones the scrubber snaps to: the centre of each regime. */
export function milestones(): { id: RegimeId; at: number; label: string }[] {
  return REGIMES.map((r) => ({ id: r.id, at: (r.from + r.to) / 2, label: r.label }));
}

/** Nearest milestone within `tolerance`, or null. Used for snapping. */
export function snapTarget(scrub: number, tolerance = 0.02): number | null {
  let best: number | null = null;
  let bestGap = Infinity;
  for (const m of milestones()) {
    const gap = Math.abs(m.at - scrub);
    if (gap < bestGap) {
      bestGap = gap;
      best = m.at;
    }
  }
  return bestGap <= tolerance ? best : null;
}
