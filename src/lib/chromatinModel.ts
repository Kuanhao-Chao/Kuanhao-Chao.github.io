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
/**
 * Rise per nucleosome along the 10 nm fibre, nanometres.
 *
 * This single number *is* the fibre's compaction: one repeat is 187 × 0.34 = 63.6 nm of duplex,
 * and laying it down in 10 nm of fibre is the 6–7× the level is quoted at. Spacing the beads by
 * the linker's full contour instead — as though every linker were pulled straight — gives 19.7
 * nm and only 3.2×, which is a low-salt spreading artefact rather than the fibre.
 */
export const TEN_NM_RISE_PER_NUCLEOSOME_NM = 10;

/**
 * The eight core histones, in the order they meet the DNA along the 147 bp wrap.
 *
 * `dnaT` is the position along the superhelix, 0 to 1, where that subunit contacts the duplex.
 * The order is not decorative: an (H3–H4)₂ tetramer binds the central ~60 bp and a H2A–H2B
 * dimer binds ~30 bp on either side of it, which is why the tetramer's four `dnaT` values are
 * clustered around the dyad at 0.5 and the dimers sit out near the entry and exit. Each histone
 * pair organises roughly 30 bp, and 147/30 ≈ 5 pairs' worth of contacts is what holds it on.
 */
export const HISTONE_SUBUNITS = [
  { name: 'H2A', copy: 1, group: 'dimerA', dnaT: 0.10 },
  { name: 'H2B', copy: 1, group: 'dimerA', dnaT: 0.22 },
  { name: 'H4', copy: 1, group: 'tetramer', dnaT: 0.35 },
  { name: 'H3', copy: 1, group: 'tetramer', dnaT: 0.46 },
  { name: 'H3', copy: 2, group: 'tetramer', dnaT: 0.54 },
  { name: 'H4', copy: 2, group: 'tetramer', dnaT: 0.65 },
  { name: 'H2B', copy: 2, group: 'dimerB', dnaT: 0.78 },
  { name: 'H2A', copy: 2, group: 'dimerB', dnaT: 0.90 },
] as const;

/**
 * Radius of the histone octamer's protein surface, nanometres.
 *
 * Derived rather than quoted, and the derivation is the structural fact: the octamer surface
 * and the inner surface of the DNA superhelix are **in contact**. So the octamer radius is the
 * superhelical radius less the duplex's own radius — 4.18 − 1.0 = 3.18 nm, which agrees with
 * the ~6.5 nm octamer diameter measured from the crystal structure. Quoting 3.25 instead and
 * drawing both would push protein through DNA.
 */
export const OCTAMER_RADIUS_NM = SUPERHELIX_RADIUS_NM - DNA_DIAMETER_NM / 2;

/** Radius of a single histone subunit as drawn, nanometres. Eight of these fuse into the spool. */
export const HISTONE_SUBUNIT_RADIUS_NM = 1.6;

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
/** Centre of the chromosome 1 centromere, GRCh38 (the alpha-satellite array spans ~121.7–125.1 Mb). */
export const CHR1_CENTROMERE_BP = 123_400_000;

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
 * Assembled, each subunit is placed just inside the DNA superhelix at the point along the wrap
 * where it actually contacts the duplex, so the eight fuse into a spool rather than a ring —
 * and the spool's outer surface is tangent to the DNA rather than passing through it.
 *
 * `explode` runs 0 (assembled) to 1 (fully separated), and **the two H2A–H2B dimers travel as
 * units**, not as four independent spheres. That is what they are: raise the salt on a
 * nucleosome and each dimer dissociates whole, before the (H3–H4)₂ tetramer lets go at all. So
 * each dimer translates along its own mean radial direction, keeping its internal geometry, and
 * the tetramer merely expands in place to show the four subunits inside it.
 */
export function histoneLayout(
  explode = 0,
): { name: string; group: string; dnaT: number; at: Vec3; radiusNm: number }[] {
  const e = Math.min(1, Math.max(0, explode));
  const seat = OCTAMER_RADIUS_NM - HISTONE_SUBUNIT_RADIUS_NM;
  const totalAngle = SUPERHELICAL_TURNS * 2 * Math.PI;
  const totalRise = SUPERHELICAL_TURNS * SUPERHELIX_PITCH_NM;

  // mean position of each dimer, so its two subunits move together rather than apart
  const meanT: Record<string, number> = {};
  for (const g of ['dimerA', 'dimerB']) {
    const members = HISTONE_SUBUNITS.filter((h) => h.group === g);
    meanT[g] = members.reduce((a, h) => a + h.dnaT, 0) / members.length;
  }

  return HISTONE_SUBUNITS.map((h) => {
    const angle = -h.dnaT * totalAngle;
    const y = (h.dnaT - 0.5) * totalRise;
    const seatPos: Vec3 = [seat * Math.cos(angle), y, seat * Math.sin(angle)];
    if (e === 0) {
      return { name: h.name, group: h.group, dnaT: h.dnaT, at: seatPos, radiusNm: HISTONE_SUBUNIT_RADIUS_NM };
    }

    if (h.group === 'tetramer') {
      // expands in place: it is the last thing to come apart, so it stays at the centre
      const out = seat + e * 4.0;
      return {
        name: h.name,
        group: h.group,
        dnaT: h.dnaT,
        at: [out * Math.cos(angle), y + e * 0.7 * Math.sign(y || 1), out * Math.sin(angle)] as Vec3,
        radiusNm: HISTONE_SUBUNIT_RADIUS_NM,
      };
    }

    const mt = meanT[h.group];
    const ma = -mt * totalAngle;
    const my = (mt - 0.5) * totalRise;
    const travel = e * 11;
    const lift = e * 5.0 * Math.sign(my || 1);
    return {
      name: h.name,
      group: h.group,
      dnaT: h.dnaT,
      at: [
        seatPos[0] + Math.cos(ma) * travel,
        seatPos[1] + lift,
        seatPos[2] + Math.sin(ma) * travel,
      ] as Vec3,
      radiusNm: HISTONE_SUBUNIT_RADIUS_NM,
    };
  });
}

/**
 * The duplex axis part-way through wrapping onto the octamer.
 *
 * `wrapped` runs 0 (a straight 147 bp rod) to 1 (the finished core particle). The wrap grows
 * **outward from the dyad**, not inward from one end, because that is the order a nucleosome
 * actually assembles in: the (H3–H4)₂ tetramer binds the central ~60 bp first and the two
 * H2A–H2B dimers bind the flanks afterwards. The `dnaT` values in `HISTONE_SUBUNITS` say the
 * same thing, and a test ties the two together.
 *
 * It is also the smoother animation by a factor of four. Wrapping from one end leaves a single
 * 50 nm tail whose tip sweeps 5.2 nm for every 1% of wrap, which reads as a whip; wrapping from
 * the dyad leaves two 25 nm tails advancing at half the angular rate, so the tip sweeps 1.3 nm
 * and the figure stays centred and balanced.
 *
 * The drawn contour shortens over the wrap, from 49.98 nm to the ideal helix's 43.51 nm. That
 * 13% is the kinking `superhelixContourNm` reports, and letting the drawing lose it is more
 * honest than inflating the radius so the path stays long.
 */
export function wrappingPath(wrapped: number, samples = 220): Vec3[] {
  const w = Math.min(1, Math.max(0, wrapped));
  const totalAngle = SUPERHELICAL_TURNS * 2 * Math.PI;
  const totalRise = SUPERHELICAL_TURNS * SUPERHELIX_PITCH_NM;
  const straightNm = contourLengthNm(NUCLEOSOME_CORE_BP);

  const at = (u: number): Vec3 => {
    const angle = -u * totalAngle;
    return [
      SUPERHELIX_RADIUS_NM * Math.cos(angle),
      (u - 0.5) * totalRise,
      SUPERHELIX_RADIUS_NM * Math.sin(angle),
    ];
  };
  const tangentAt = (u: number): Vec3 => {
    const angle = -u * totalAngle;
    const d: [number, number, number] = [
      SUPERHELIX_RADIUS_NM * Math.sin(angle) * totalAngle,
      totalRise,
      -SUPERHELIX_RADIUS_NM * Math.cos(angle) * totalAngle,
    ];
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    return [d[0] / len, d[1] / len, d[2] / len];
  };

  const lo = 0.5 - w / 2;
  const hi = 0.5 + w / 2;
  const loAt = at(lo);
  const loDir = tangentAt(lo);
  const hiAt = at(hi);
  const hiDir = tangentAt(hi);

  const out: Vec3[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const u = i / samples;
    if (u < lo) {
      const d = (lo - u) * straightNm;
      out.push([loAt[0] - loDir[0] * d, loAt[1] - loDir[1] * d, loAt[2] - loDir[2] * d]);
    } else if (u > hi) {
      const d = (u - hi) * straightNm;
      out.push([hiAt[0] + hiDir[0] * d, hiAt[1] + hiDir[1] * d, hiAt[2] + hiDir[2] * d]);
    } else {
      out.push(at(u));
    }
  }
  return out;
}

/**
 * The two sugar-phosphate backbones winding around an arbitrary duplex axis.
 *
 * One routine draws every duplex in the playground — the straight rod, the half-wrapped
 * intermediate, the finished nucleosome, a linker — because in each case the backbones are the
 * same right-handed pair around whatever path the axis takes.
 *
 * The frame is **parallel-transported** rather than Frenet. A Frenet frame is undefined where
 * the axis is straight (zero curvature) and flips through an inflection, which would put a
 * visible twist discontinuity exactly at the wrap front. Transporting the normal by the minimal
 * rotation between successive tangents has neither failure.
 *
 * The twist is indexed by **base pair, not by arc length**: a duplex has 10.5 bp per turn
 * whatever path its axis takes, so the number of turns is fixed by the sequence. Indexing by
 * drawn length would silently lose ~13% of the turns as the axis shortens over the wrap.
 */
export function duplexStrandsAlong(
  axis: Vec3[],
  bpTotal: number,
): { a: Vec3[]; b: Vec3[] } {
  if (axis.length < 2) throw new RangeError('duplexStrandsAlong needs at least two axis points');
  const r = DNA_DIAMETER_NM / 2;
  const minorOffset = 2 * Math.PI * 0.375;

  const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const norm = (v: Vec3): Vec3 => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const cross = (u: Vec3, v: Vec3): Vec3 => [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const dot = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

  const tangents: Vec3[] = axis.map((_, i) =>
    norm(i === 0 ? sub(axis[1], axis[0]) : sub(axis[i], axis[i - 1])),
  );

  // seed a normal perpendicular to the first tangent, choosing the axis it aligns with least
  const t0 = tangents[0];
  const seed: Vec3 = Math.abs(t0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let n = norm(cross(seed, t0));

  const a: Vec3[] = [];
  const b: Vec3[] = [];
  for (let i = 0; i < axis.length; i += 1) {
    if (i > 0) {
      // rotate the carried normal by the minimal rotation taking t[i-1] onto t[i]
      const prev = tangents[i - 1];
      const cur = tangents[i];
      const ax = cross(prev, cur);
      const sin = Math.hypot(ax[0], ax[1], ax[2]);
      if (sin > 1e-9) {
        const k = norm(ax);
        const ang = Math.atan2(sin, dot(prev, cur));
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const kd = dot(k, n);
        const kxn = cross(k, n);
        n = norm([
          n[0] * c + kxn[0] * sn + k[0] * kd * (1 - c),
          n[1] * c + kxn[1] * sn + k[1] * kd * (1 - c),
          n[2] * c + kxn[2] * sn + k[2] * kd * (1 - c),
        ]);
      }
    }
    const t = tangents[i];
    const bn = norm(cross(t, n));
    const u = axis.length === 1 ? 0 : i / (axis.length - 1);
    const phase = ((u * bpTotal) / BP_PER_TURN) * 2 * Math.PI;
    const p = axis[i];
    const place = (ang: number): Vec3 => [
      p[0] + r * (Math.cos(ang) * n[0] + Math.sin(ang) * bn[0]),
      p[1] + r * (Math.cos(ang) * n[1] + Math.sin(ang) * bn[1]),
      p[2] + r * (Math.cos(ang) * n[2] + Math.sin(ang) * bn[2]),
    ];
    a.push(place(phase));
    b.push(place(phase + minorOffset));
  }
  return { a, b };
}

/** Centres of `count` nucleosomes strung along an extended 10 nm fibre. */
export function beadsOnAString(count: number, repeatBp = NUCLEOSOME_REPEAT_BP): Vec3[] {
  if (count < 1) throw new RangeError('beadsOnAString needs at least one nucleosome');
  // Centre-to-centre spacing scales with the repeat: a longer linker gives a more extended
  // fibre. At the human average the spacing is exactly TEN_NM_RISE_PER_NUCLEOSOME_NM, which is
  // what makes this level come out at the 6-7x it is quoted at.
  const spacing = TEN_NM_RISE_PER_NUCLEOSOME_NM * (repeatBp / NUCLEOSOME_REPEAT_BP);
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
 * How far a loop of `bp` reaches from the axis it is anchored to, nanometres.
 *
 * **Derived, not fitted.** Gibcus's result is that the ~400 kb outer loops are what set the
 * width of a metaphase chromatid, so a 400 kb loop reaches exactly half the 700 nm chromatid
 * diameter and everything else follows from the polymer scaling. The nesting then comes out on
 * its own: an 80 kb inner loop reaches 156 nm, comfortably inside the 350 nm outer one.
 *
 * The exponent is ½ — an ideal chain's radius of gyration against contour. A self-avoiding
 * walk would give 0.588 and a fully space-filling globule ⅓; mitotic chromatin is condensed
 * enough that ½ is the defensible middle, and the two reference points are fixed by
 * measurement rather than by the exponent.
 */
export function loopReachNm(bp: number): number {
  if (bp <= 0) throw new RangeError('loopReachNm needs a positive loop size');
  return (CHROMATID_DIAMETER_NM / 2) * Math.sqrt(bp / PROMETA_OUTER_LOOP_BP);
}

/**
 * Rise of one helical turn of the prometaphase loop array, nanometres.
 *
 * Also derived: chromosome 1 is 249 Mb in a 10 µm chromatid and a turn consumes 12 Mb, so a
 * turn must rise 10,000 × 12/249 = 482 nm. Anything else would fail to reconstruct the
 * chromosome's own length, and a test checks that it does.
 */
export function helicalRisePerTurnNm(): number {
  return (CHR1_METAPHASE_NM * HELICAL_TURN_BP) / CHR1_BP;
}

/**
 * A loop anchored at both ends, as cohesin extrusion leaves it: the chromatin between two
 * convergent CTCF sites, thrown out from the axis and returning to it.
 *
 * The path is a teardrop rather than a semicircle — narrow where the two anchors are held
 * together by the extrusion complex, broad at the far end — because that is what the anchor
 * geometry implies and what makes a loop legible next to its neighbours.
 */
export function extrudedLoop(
  baseY: number,
  loopBp: number,
  azimuth: number,
  samples = 32,
): Vec3[] {
  const reach = loopReachNm(loopBp);
  const out: Vec3[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const r = reach * Math.sin(t * Math.PI) ** 0.75;
    const spread = Math.sin(t * 2 * Math.PI) * reach * 0.18;
    out.push([
      r * Math.cos(azimuth) - spread * Math.sin(azimuth),
      baseY + (t - 0.5) * reach * 0.22,
      r * Math.sin(azimuth) + spread * Math.cos(azimuth),
    ]);
  }
  return out;
}

/**
 * The prometaphase loop array: consecutive loops emanating from a central condensin scaffold
 * that is itself wound into a helix — Gibcus's "spiral staircase".
 *
 * Successive loops rotate around the axis, so the array traces a helical staircase whose turn
 * consumes `HELICAL_TURN_BP` of sequence and rises `helicalRisePerTurnNm()`. `bpPerLoop`
 * selects the nesting level: ~400 kb for the condensin II outer loops, ~80 kb for the
 * condensin I inner ones.
 */
export function helicalLoopArray(
  loopCount: number,
  bpPerLoop = PROMETA_OUTER_LOOP_BP,
): { anchor: Vec3; azimuth: number; loopBp: number }[] {
  const loopsPerTurn = Math.max(2, HELICAL_TURN_BP / bpPerLoop);
  const risePerLoop = helicalRisePerTurnNm() / loopsPerTurn;
  const out: { anchor: Vec3; azimuth: number; loopBp: number }[] = [];
  for (let i = 0; i < loopCount; i += 1) {
    out.push({
      anchor: [0, i * risePerLoop, 0],
      azimuth: (i / loopsPerTurn) * 2 * Math.PI,
      loopBp: bpPerLoop,
    });
  }
  return out;
}

/**
 * How much a loop is pulled in toward the axis at sequence fraction `u` along the chromatid.
 *
 * Returns 1 along the arms and drops toward `minimum` at the centromere, which is what makes
 * the primary constriction. The narrowing is not decorative: the centromeric alpha-satellite is
 * bound by the kinetochore and is the one region that stays condensed differently from the
 * arms, and it is why a metaphase chromosome is X-shaped rather than a plain rod.
 *
 * Chromosome 1 is metacentric — its centromere sits at 123.4/249.0 = 0.496 of the way along —
 * so its two arms come out very nearly equal.
 */
export function centromereConstriction(u: number, minimum = 0.28): number {
  const centre = CHR1_CENTROMERE_BP / CHR1_BP;
  const width = 0.035;
  const d = (u - centre) / width;
  return minimum + (1 - minimum) * (1 - Math.exp(-0.5 * d * d));
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
  /**
   * Two or three words for the scrubber's milestone tick, where the full label will not fit.
   * Carried explicitly rather than derived by truncating `label`: splitting on a dash turns
   * "B-form double helix" into "B".
   */
  short: string;
  /** Field of view the camera should frame, nanometres. */
  fieldNm: number;
  /** Base pairs the scene represents at this scale. */
  bpInView: number;
  /**
   * End-to-end length of the structure that holds `bpInView`, nanometres.
   *
   * Compaction is contour over *this*, not over the field of view. Dividing by the field makes
   * the number an artefact of how far the camera happens to be: at metaphase it read 1,700×
   * against a 12 µm frame where the chromatid it was drawing is 10 µm and 8,500×.
   */
  packagedNm: number;
}

/** The ladder, in scrubber order. Bands are contiguous; blending happens across their seams. */
export const REGIMES: readonly Regime[] = [
  // bpInView and packagedNm are the geometry each scene actually draws, so the compaction
  // readout is a measurement of the picture rather than a caption bolted onto it. Each one
  // lands on the value its level is quoted at: 1x, ~6x, ~6-7x, ~40x, a few hundred, ~8,500x.
  { id: 'duplex', from: 0.0, to: 0.12, label: 'B-form double helix', short: 'B-form DNA', fieldNm: 20, bpInView: 60, packagedNm: 20.4 },
  { id: 'nucleosome', from: 0.12, to: 0.3, label: 'Nucleosome core particle', short: 'Nucleosome', fieldNm: 34, bpInView: 187, packagedNm: 11 },
  { id: 'beads', from: 0.3, to: 0.45, label: '10 nm fibre — beads on a string', short: '10 nm fibre', fieldNm: 260, bpInView: 3_000, packagedNm: 160 },
  { id: 'fibre', from: 0.45, to: 0.6, label: '30 nm regime', short: '30 nm regime', fieldNm: 620, bpInView: 46_000, packagedNm: 451 },
  { id: 'loops', from: 0.6, to: 0.8, label: 'Loop domains and TADs', short: 'Loop domains', fieldNm: 2_400, bpInView: 2_000_000, packagedNm: 1_900 },
  { id: 'mitotic', from: 0.8, to: 1.0, label: 'Mitotic loop array', short: 'Metaphase', fieldNm: 12_000, bpInView: CHR1_BP, packagedNm: CHR1_METAPHASE_NM },
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
 * The scrubber positions at which the camera is exactly at a regime's declared scale.
 *
 * The keys are the **band centres**, which are also the milestones the scrubber snaps to — so
 * clicking "Nucleosome" frames the nucleosome at the 34 nm it declares, rather than at whatever
 * the interpolation happens to be passing through.
 *
 * Keying off band *starts* instead is the obvious thing and it is wrong: the field would then
 * be already halfway to the next regime's scale by the middle of every band, and no regime
 * would ever be seen at its own size except in the instant its band begins. That put an 11 nm
 * nucleosome in a 94 nm field at its own milestone.
 */
function cameraKeys(): { at: number; field: number; bp: number; packaged: number }[] {
  const key = (r: Regime, at: number) => ({
    at,
    field: r.fieldNm,
    bp: r.bpInView,
    packaged: r.packagedNm,
  });
  const first = REGIMES[0];
  const last = REGIMES[REGIMES.length - 1];
  return [
    key(first, 0),
    ...REGIMES.map((r) => key(r, (r.from + r.to) / 2)),
    key(last, 1),
  ];
}

/**
 * Interpolate a keyed quantity **logarithmically** across the scrubber.
 *
 * The ladder spans 20 nm to 12 µm — a factor of 600 — and linear interpolation across that
 * would spend almost the whole scrubber inside the last regime. Interpolating the logarithm
 * makes each decade of scale take a comparable amount of travel, which is what makes the
 * hierarchy feel like a hierarchy rather than a jump. The smoothstep between keys is what
 * removes the velocity discontinuity at each one.
 */
function logKeyed(
  scrub: number,
  pick: (k: { field: number; bp: number; packaged: number }) => number,
): number {
  const s = Math.min(1, Math.max(0, scrub));
  const keys = cameraKeys();
  for (let i = 1; i < keys.length; i += 1) {
    if (s <= keys[i].at || i === keys.length - 1) {
      const a = keys[i - 1];
      const b = keys[i];
      const span = b.at - a.at;
      const t = span <= 0 ? 1 : smoothstep((s - a.at) / span);
      return Math.exp(Math.log(pick(a)) * (1 - t) + Math.log(pick(b)) * t);
    }
  }
  return pick(keys[0]);
}

/** Camera framing distance, nanometres. */
export function cameraFieldNm(scrub: number): number {
  return logKeyed(scrub, (k) => k.field);
}

/** Base pairs represented at this scrubber position, on the same schedule as the camera. */
export function bpInViewAt(scrub: number): number {
  return logKeyed(scrub, (k) => k.bp);
}

/** End-to-end length of the structure in view, nanometres. */
export function packagedNmAt(scrub: number): number {
  return logKeyed(scrub, (k) => k.packaged);
}

/** Linear compaction achieved at this scrubber position. */
export function compactionAt(scrub: number): number {
  return compactionRatio(bpInViewAt(scrub), packagedNmAt(scrub));
}

// ── Level of detail ───────────────────────────────────────────────────────────

/** Ceiling on nucleosome instances drawn in one frame, whatever the scale asks for. */
export const NUCLEOSOME_INSTANCE_BUDGET = 4_000;

/**
 * How many nucleosomes to draw at this scrubber position.
 *
 * Bounded from **both** directions, and the second bound is the one that is easy to forget. A
 * metaphase chromosome holds roughly 1.35 million nucleosomes, so the count the biology implies
 * has to be capped from above by the instance budget. But it must also never exceed
 * `impliedNucleosomeCount` — drawing more nucleosomes than the sequence in view actually
 * contains is not a performance question, it is a false statement about the scene, and without
 * this the readout claimed 4,000 drawn where the field held 1,310.
 *
 * Past the fibre band the count falls to zero and chromatin is drawn as a tube instead; the
 * cross-fade is what makes that swap invisible.
 */
export function nucleosomeBudget(scrub: number): number {
  const w = regimeWeights(scrub);
  const beads = w.get('beads') ?? 0;
  const fibre = w.get('fibre') ?? 0;
  const nucleosome = w.get('nucleosome') ?? 0;
  const loops = w.get('loops') ?? 0;
  const share = nucleosome * 0.004 + beads * 0.06 + fibre * 1 + loops * 0.25;
  return Math.min(
    NUCLEOSOME_INSTANCE_BUDGET,
    impliedNucleosomeCount(scrub),
    Math.round(share * NUCLEOSOME_INSTANCE_BUDGET),
  );
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
