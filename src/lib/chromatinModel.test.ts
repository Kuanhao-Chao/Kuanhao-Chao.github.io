import { describe, expect, it } from 'vitest';
import {
  BLEND_HALF_WIDTH,
  BP_PER_TURN,
  BP_RISE_NM,
  CHR1_BP,
  CHR1_METAPHASE_NM,
  CHROMATID_DIAMETER_NM,
  CHROMATOSOME_BP,
  DISORDERED_CHAIN_MAX_NM,
  DISORDERED_CHAIN_MIN_NM,
  DNA_DIAMETER_NM,
  DNA_PITCH_NM,
  FIBRE_30NM_DIAMETER_NM,
  HELICAL_TURN_BP,
  HISTONE_SUBUNITS,
  NUCLEOSOME_CORE_BP,
  NUCLEOSOME_DIAMETER_NM,
  NUCLEOSOME_HEIGHT_NM,
  OCTAMER_RADIUS_NM,
  HISTONE_SUBUNIT_RADIUS_NM,
  NUCLEOSOME_INSTANCE_BUDGET,
  NUCLEOSOME_REPEAT_BP,
  PROMETA_INNER_LOOP_BP,
  PROMETA_OUTER_LOOP_BP,
  PROPHASE_LOOP_BP,
  REGIMES,
  SOLENOID_NUCLEOSOMES_PER_TURN,
  SUPERHELICAL_TURNS,
  SUPERHELIX_PITCH_NM,
  SUPERHELIX_RADIUS_NM,
  TEN_NM_RISE_PER_NUCLEOSOME_NM,
  bDnaBasePairs,
  bDnaStrand,
  beadsOnAString,
  bpInViewAt,
  cameraFieldNm,
  centromereConstriction,
  CHR1_CENTROMERE_BP,
  compactionAt,
  compactionRatio,
  contourLengthNm,
  coreParticleEnvelope,
  packagedNmAt,
  disorderedChain,
  duplexStrandsAlong,
  extrudedLoop,
  helicalLoopArray,
  helicalRisePerTurnNm,
  loopReachNm,
  histoneLayout,
  impliedNucleosomeCount,
  milestones,
  nucleosomeBudget,
  nucleosomeSuperhelix,
  regimeAt,
  regimeWeights,
  smoothstep,
  smoothstep5,
  cameraTargetNmAt,
  playbackSpeedMultiplier,
  physicalScaleBar,
  snapTarget,
  solenoidFibre,
  superhelixContourNm,
  wrappingPath,
  zigzagFibre,
  type Vec3,
} from './chromatinModel.ts';

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const radius = (p: Vec3) => Math.hypot(p[0], p[2]);

/**
 * These check the geometry against the structural literature and against closed forms, not
 * against the renderer. Nothing here imports Three.js, which is the point of the split: the
 * science is provable without a GPU.
 */

describe('published dimensions', () => {
  it('has the B-form constants, and a pitch that follows from them', () => {
    expect(BP_RISE_NM).toBe(0.34);
    expect(BP_PER_TURN).toBe(10.5);
    expect(DNA_DIAMETER_NM).toBe(2.0);
    expect(DNA_PITCH_NM).toBeCloseTo(3.57, 10);
  });

  it('has the nucleosome as Luger solved it', () => {
    expect(NUCLEOSOME_CORE_BP).toBe(147);
    expect(SUPERHELICAL_TURNS).toBe(1.65);
    expect(CHROMATOSOME_BP).toBe(166);
    // the chromatosome adds ~19 bp over the core: roughly one more decade of duplex, held
    // by H1 at the dyad
    expect(CHROMATOSOME_BP - NUCLEOSOME_CORE_BP).toBe(19);
  });

  it('assembles the octamer as two H2A-H2B dimers around an (H3-H4)2 tetramer', () => {
    expect(HISTONE_SUBUNITS).toHaveLength(8);
    const count = (n: string) => HISTONE_SUBUNITS.filter((h) => h.name === n).length;
    for (const n of ['H2A', 'H2B', 'H3', 'H4']) expect(count(n)).toBe(2);
    expect(HISTONE_SUBUNITS.filter((h) => h.group === 'tetramer')).toHaveLength(4);
    expect(HISTONE_SUBUNITS.filter((h) => h.group.startsWith('dimer'))).toHaveLength(4);
    // each histone pair organises ~30 bp; eight histones therefore account for ~120 of the 147
    expect(4 * 30).toBeLessThan(NUCLEOSOME_CORE_BP);
  });

  it('has the mitotic loop sizes Gibcus measured', () => {
    expect(PROPHASE_LOOP_BP).toBe(60_000);
    expect(PROMETA_INNER_LOOP_BP).toBe(80_000);
    expect(PROMETA_OUTER_LOOP_BP).toBe(400_000);
    // inner loops nest inside outer ones, so there are five of the first per one of the second
    expect(PROMETA_OUTER_LOOP_BP / PROMETA_INNER_LOOP_BP).toBe(5);
    expect(HELICAL_TURN_BP / PROMETA_OUTER_LOOP_BP).toBe(30);
  });
});

describe('contour and compaction', () => {
  it('turns chromosome 1 into 84.6 mm of duplex', () => {
    const nm = contourLengthNm(CHR1_BP);
    expect(nm / 1e6).toBeCloseTo(84.65, 2); // millimetres
  });

  it('gives the headline compaction of about 8,500x', () => {
    const ratio = compactionRatio(CHR1_BP, CHR1_METAPHASE_NM);
    expect(ratio).toBeGreaterThan(8_000);
    expect(ratio).toBeLessThan(9_000);
    expect(Math.round(ratio / 100) * 100).toBe(8_500);
  });

  it('rejects a non-positive packaged length', () => {
    expect(() => compactionRatio(1000, 0)).toThrow(RangeError);
    expect(() => contourLengthNm(-1)).toThrow(RangeError);
  });

  it('states the superhelix discrepancy rather than hiding it', () => {
    const { ideal, actual, ratio } = superhelixContourNm();
    expect(actual).toBeCloseTo(49.98, 2);
    expect(ideal).toBeCloseTo(43.51, 2);
    // real nucleosomal DNA is kinked, so its contour runs ~15% longer than a smooth helix
    // through the published radius and pitch
    expect(ratio).toBeCloseTo(1.1486, 4);
    expect(actual).toBeGreaterThan(ideal);
    // the radius that WOULD reconcile them is 4.81 nm, which is not the published value —
    // the model keeps 4.18 and reports the gap
    const reconciling = Math.sqrt((actual / SUPERHELICAL_TURNS) ** 2 - SUPERHELIX_PITCH_NM ** 2) / (2 * Math.PI);
    expect(reconciling).toBeCloseTo(4.806, 3);
    expect(SUPERHELIX_RADIUS_NM).not.toBeCloseTo(reconciling, 1);
  });
});

describe('B-form duplex', () => {
  it('holds every point on the duplex surface', () => {
    for (const strand of [0, 1] as const) {
      for (const p of bDnaStrand(40, strand)) {
        expect(radius(p)).toBeCloseTo(DNA_DIAMETER_NM / 2, 10);
      }
    }
  });

  it('rises 0.34 nm per base pair and turns once every 10.5', () => {
    const s = bDnaStrand(21, 0, 1);
    expect(s[s.length - 1][1] - s[0][1]).toBeCloseTo(21 * BP_RISE_NM, 10);
    // after exactly two turns the strand is back where it started in azimuth
    const start = Math.atan2(s[0][2], s[0][0]);
    const end = Math.atan2(s[21][2], s[21][0]);
    expect(Math.abs(Math.sin(end - start))).toBeLessThan(1e-9);
  });

  it('offsets the strands to make one groove wider than the other', () => {
    const a = bDnaStrand(1, 0, 1)[0];
    const b = bDnaStrand(1, 1, 1)[0];
    const gap = Math.abs(Math.atan2(b[2], b[0]) - Math.atan2(a[2], a[0]));
    // not diametrically opposite: that asymmetry IS the major/minor groove
    expect(gap).not.toBeCloseTo(Math.PI, 2);
  });

  it('pairs the strands rung by rung at a constant height', () => {
    const rungs = bDnaBasePairs(12);
    expect(rungs).toHaveLength(12);
    for (const { a, b } of rungs) {
      expect(a[1]).toBeCloseTo(b[1], 12);
      expect(dist(a, b)).toBeLessThanOrEqual(DNA_DIAMETER_NM + 1e-9);
    }
  });

  it('refuses an empty duplex', () => {
    expect(() => bDnaStrand(0, 0)).toThrow(RangeError);
  });
});

describe('the nucleosome superhelix', () => {
  const path = nucleosomeSuperhelix(400);

  it('keeps every point at the superhelical radius', () => {
    for (const p of path) expect(radius(p)).toBeCloseTo(SUPERHELIX_RADIUS_NM, 10);
  });

  it('is LEFT-handed, opposite to the duplex wound along it', () => {
    // azimuth decreases with t for a left-handed helix; the B-form strand above increases
    const a0 = Math.atan2(path[0][2], path[0][0]);
    const a1 = Math.atan2(path[1][2], path[1][0]);
    let d = a1 - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    expect(d).toBeLessThan(0);

    const s = bDnaStrand(4, 0, 8);
    const b0 = Math.atan2(s[0][2], s[0][0]);
    const b1 = Math.atan2(s[1][2], s[1][0]);
    let e = b1 - b0;
    while (e > Math.PI) e -= 2 * Math.PI;
    while (e < -Math.PI) e += 2 * Math.PI;
    expect(e).toBeGreaterThan(0);
  });

  it('makes exactly 1.65 turns and the matching rise', () => {
    let swept = 0;
    for (let i = 1; i < path.length; i += 1) {
      let d = Math.atan2(path[i][2], path[i][0]) - Math.atan2(path[i - 1][2], path[i - 1][0]);
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      swept += d;
    }
    expect(Math.abs(swept) / (2 * Math.PI)).toBeCloseTo(SUPERHELICAL_TURNS, 6);
    const rise = path[path.length - 1][1] - path[0][1];
    expect(rise).toBeCloseTo(SUPERHELICAL_TURNS * SUPERHELIX_PITCH_NM, 10);
  });

  it('sweeps an envelope narrower than the protein particle that contains it', () => {
    const env = coreParticleEnvelope();
    // the DNA superhelix is 10.36 nm across; the quoted 11 nm particle includes histone
    // surface, so the DNA must sit inside it rather than match it
    expect(env.diameterNm).toBeCloseTo(10.36, 6);
    expect(env.diameterNm).toBeLessThan(NUCLEOSOME_DIAMETER_NM);
    expect(NUCLEOSOME_DIAMETER_NM - env.diameterNm).toBeCloseTo(0.64, 6);

    // the envelope height is set by the superhelical rise plus one duplex diameter, and lands
    // at the top of the 5.5-6 nm the particle is quoted at
    const height = path[path.length - 1][1] - path[0][1];
    expect(height).toBeCloseTo(SUPERHELICAL_TURNS * SUPERHELIX_PITCH_NM, 9);
    expect(env.heightNm).toBeCloseTo(height + DNA_DIAMETER_NM, 9);
    expect(env.heightNm).toBeCloseTo(5.9435, 9);
    expect(env.heightNm).toBeGreaterThan(NUCLEOSOME_HEIGHT_NM);
    expect(env.heightNm).toBeLessThan(6.0);

    // and it is a squat disc, not a sphere: that aspect ratio is what the eye reads
    expect(env.diameterNm / env.heightNm).toBeGreaterThan(1.7);
  });
});

describe('wrapping the duplex onto the octamer', () => {
  const contour = (pts: Vec3[]) => {
    let l = 0;
    for (let i = 1; i < pts.length; i += 1) l += dist(pts[i], pts[i - 1]);
    return l;
  };

  it('is a straight rod of the full 147 bp before it wraps', () => {
    const p = wrappingPath(0, 300);
    expect(contour(p)).toBeCloseTo(contourLengthNm(NUCLEOSOME_CORE_BP), 6);
    // collinear: every step points the same way
    const d0: Vec3 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const n0 = Math.hypot(...d0);
    for (let i = 2; i < p.length; i += 1) {
      const d: Vec3 = [p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]];
      const cos = (d[0] * d0[0] + d[1] * d0[1] + d[2] * d0[2]) / (Math.hypot(...d) * n0);
      expect(cos).toBeCloseTo(1, 9);
    }
  });

  it('lands exactly on the finished superhelix when fully wrapped', () => {
    const wrapped = wrappingPath(1, 160);
    const target = nucleosomeSuperhelix(160);
    expect(wrapped).toHaveLength(target.length);
    for (let i = 0; i < wrapped.length; i += 1) expect(dist(wrapped[i], target[i])).toBeCloseTo(0, 9);
  });

  it('shortens over the wrap by exactly the kinking the model reports', () => {
    const { ideal, actual, ratio } = superhelixContourNm();
    expect(contour(wrappingPath(0, 400))).toBeCloseTo(actual, 5);
    expect(contour(wrappingPath(1, 400))).toBeCloseTo(ideal, 1);
    // the loss over a full wrap IS the 14.9% gap, not an independent fudge
    const loss = contour(wrappingPath(0, 400)) / contour(wrappingPath(1, 400));
    expect(loss).toBeCloseTo(ratio, 2);
  });

  it('grows outward from the dyad, in the order the histones actually bind', () => {
    const half = wrappingPath(0.5, 400);
    const onHelix = (p: Vec3) => Math.abs(radius(p) - SUPERHELIX_RADIUS_NM) < 1e-6;
    const wrappedIdx = half.map((p, i) => (onHelix(p) ? i : -1)).filter((i) => i >= 0);

    // half the sequence is down, and it is the CENTRAL half: a contiguous run about the dyad
    expect(wrappedIdx.length / half.length).toBeCloseTo(0.5, 1);
    expect(wrappedIdx[wrappedIdx.length - 1] - wrappedIdx[0]).toBe(wrappedIdx.length - 1);
    const centre = (wrappedIdx[0] + wrappedIdx[wrappedIdx.length - 1]) / 2 / (half.length - 1);
    expect(centre).toBeCloseTo(0.5, 2);

    // two free tails, one either side, not one long one
    expect(wrappedIdx[0]).toBeGreaterThan(0);
    expect(wrappedIdx[wrappedIdx.length - 1]).toBeLessThan(half.length - 1);

    // and the region that goes down first is exactly where the (H3-H4)2 tetramer binds
    const lo = wrappedIdx[0] / (half.length - 1);
    const hi = wrappedIdx[wrappedIdx.length - 1] / (half.length - 1);
    for (const h of histoneLayout(0).filter((x) => x.group === 'tetramer')) {
      expect(h.dnaT).toBeGreaterThanOrEqual(lo);
      expect(h.dnaT).toBeLessThanOrEqual(hi);
    }
    // while the dimers' sites are still free at this point in the wrap
    for (const h of histoneLayout(0).filter((x) => x.group !== 'tetramer')) {
      expect(h.dnaT < lo || h.dnaT > hi).toBe(true);
    }
  });

  it('moves continuously as the wrap advances, with no whip at the free ends', () => {
    // wrapping from one end instead would leave a 50 nm tail whose tip sweeps 5.2 nm per 1%
    // of wrap; from the dyad the tails are half as long and advance at half the angular rate
    let prev = wrappingPath(0, 120);
    let worst = 0;
    for (let w = 0.01; w <= 1.0001; w += 0.01) {
      const now = wrappingPath(w, 120);
      for (let i = 0; i < now.length; i += 1) worst = Math.max(worst, dist(now[i], prev[i]));
      prev = now;
    }
    expect(worst).toBeLessThan(1.4);
    expect(worst).toBeGreaterThan(0.5); // it does move; this is not a no-op
  });
});

describe('duplex backbones along an arbitrary axis', () => {
  it('reproduces the straight duplex when given a straight axis', () => {
    const bp = 40;
    const axis: Vec3[] = [];
    for (let i = 0; i <= 200; i += 1) axis.push([0, (i / 200) * bp * BP_RISE_NM, 0]);
    const { a, b } = duplexStrandsAlong(axis, bp);
    for (let i = 0; i < a.length; i += 1) {
      // both backbones sit one duplex-radius off the axis
      expect(Math.hypot(a[i][0], a[i][2])).toBeCloseTo(DNA_DIAMETER_NM / 2, 9);
      expect(Math.hypot(b[i][0], b[i][2])).toBeCloseTo(DNA_DIAMETER_NM / 2, 9);
    }
  });

  it('turns once every 10.5 bp whatever the axis does', () => {
    const bp = 42; // exactly four turns
    const sweep = (pts: Vec3[], project: (p: Vec3, i: number) => number) => {
      let total = 0;
      for (let i = 1; i < pts.length; i += 1) {
        let d = project(pts[i], i) - project(pts[i - 1], i - 1);
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        total += d;
      }
      return Math.abs(total) / (2 * Math.PI);
    };
    const straight: Vec3[] = [];
    for (let i = 0; i <= 400; i += 1) straight.push([0, (i / 400) * bp * BP_RISE_NM, 0]);
    const s = duplexStrandsAlong(straight, bp);
    expect(sweep(s.a, (p) => Math.atan2(p[2], p[0]))).toBeCloseTo(bp / BP_PER_TURN, 6);

    // The same bp count on a CURVED axis must make the same number of turns. Measuring that
    // needs the twist about the tangent, not the raw 3D angle between successive radial
    // vectors: the latter also picks up the frame's transport as the axis bends, which is
    // perpendicular to the tangent and not twist at all. Projecting onto the tangent is the
    // standard twist integral and is independent of how the module computes its frame.
    const curved = wrappingPath(1, 800);
    const c = duplexStrandsAlong(curved, bp);
    let twist = 0;
    for (let i = 1; i < c.a.length; i += 1) {
      const r0: Vec3 = [c.a[i - 1][0] - curved[i - 1][0], c.a[i - 1][1] - curved[i - 1][1], c.a[i - 1][2] - curved[i - 1][2]];
      const r1: Vec3 = [c.a[i][0] - curved[i][0], c.a[i][1] - curved[i][1], c.a[i][2] - curved[i][2]];
      const t: Vec3 = [curved[i][0] - curved[i - 1][0], curved[i][1] - curved[i - 1][1], curved[i][2] - curved[i - 1][2]];
      const tl = Math.hypot(...t) || 1;
      const tn: Vec3 = [t[0] / tl, t[1] / tl, t[2] / tl];
      const cx: Vec3 = [
        r0[1] * r1[2] - r0[2] * r1[1],
        r0[2] * r1[0] - r0[0] * r1[2],
        r0[0] * r1[1] - r0[1] * r1[0],
      ];
      const sin = cx[0] * tn[0] + cx[1] * tn[1] + cx[2] * tn[2];
      const cos = r0[0] * r1[0] + r0[1] * r1[1] + r0[2] * r1[2];
      twist += Math.atan2(sin, cos);
    }
    expect(Math.abs(twist) / (2 * Math.PI)).toBeCloseTo(bp / BP_PER_TURN, 2);
  });

  it('keeps both backbones on the duplex surface around a wrapped axis', () => {
    const axis = wrappingPath(1, 300);
    const { a, b } = duplexStrandsAlong(axis, NUCLEOSOME_CORE_BP);
    for (let i = 0; i < axis.length; i += 1) {
      expect(dist(a[i], axis[i])).toBeCloseTo(DNA_DIAMETER_NM / 2, 9);
      expect(dist(b[i], axis[i])).toBeCloseTo(DNA_DIAMETER_NM / 2, 9);
    }
  });

  it('never lets the frame flip, even through the straight-to-curved junction', () => {
    // a Frenet frame is undefined where curvature is zero and would snap here; the
    // parallel-transported one must not
    const axis = wrappingPath(0.5, 400);
    const { a } = duplexStrandsAlong(axis, NUCLEOSOME_CORE_BP);
    let worst = 0;
    for (let i = 1; i < a.length; i += 1) worst = Math.max(worst, dist(a[i], a[i - 1]));
    const typical = dist(a[1], a[0]);
    expect(worst).toBeLessThan(typical * 4);
  });

  it('refuses an axis too short to have a direction', () => {
    expect(() => duplexStrandsAlong([[0, 0, 0]], 10)).toThrow(RangeError);
  });
});

describe('the exploded octamer', () => {
  it('returns all eight histones assembled and separated alike', () => {
    expect(histoneLayout(0)).toHaveLength(8);
    expect(histoneLayout(1)).toHaveLength(8);
  });

  it('seats the octamer TANGENT to the DNA it wraps, not through it', () => {
    // the derivation is the structural fact: protein surface meets duplex surface
    expect(OCTAMER_RADIUS_NM + DNA_DIAMETER_NM / 2).toBeCloseTo(SUPERHELIX_RADIUS_NM, 12);
    expect(OCTAMER_RADIUS_NM).toBeCloseTo(3.18, 12);
    // and that agrees with the ~6.5 nm octamer diameter from the crystal structure
    expect(2 * OCTAMER_RADIUS_NM).toBeGreaterThan(6.0);
    expect(2 * OCTAMER_RADIUS_NM).toBeLessThan(6.6);

    // no assembled subunit may protrude past the DNA's inner surface
    const innerSurface = SUPERHELIX_RADIUS_NM - DNA_DIAMETER_NM / 2;
    for (const h of histoneLayout(0)) {
      expect(radius(h.at) + h.radiusNm).toBeLessThanOrEqual(innerSurface + 1e-9);
    }
  });

  it('fuses into a spool rather than a ring of separate blobs', () => {
    // adjacent subunits must overlap, or the octamer reads as eight beads
    const closed = histoneLayout(0);
    for (let i = 1; i < closed.length; i += 1) {
      const gap = dist(closed[i].at, closed[i - 1].at);
      expect(gap).toBeLessThan(closed[i].radiusNm + closed[i - 1].radiusNm);
    }
    expect(HISTONE_SUBUNIT_RADIUS_NM).toBe(1.6);
  });

  it('orders the subunits along the DNA with the tetramer at the dyad', () => {
    const l = histoneLayout(0);
    for (let i = 1; i < l.length; i += 1) expect(l[i].dnaT).toBeGreaterThan(l[i - 1].dnaT);

    // (H3-H4)2 binds the central ~60 bp, so its contacts cluster around the dyad at 0.5
    const tet = l.filter((h) => h.group === 'tetramer');
    expect(tet).toHaveLength(4);
    for (const h of tet) expect(Math.abs(h.dnaT - 0.5)).toBeLessThan(0.2);
    const spanBp = (Math.max(...tet.map((h) => h.dnaT)) - Math.min(...tet.map((h) => h.dnaT))) * NUCLEOSOME_CORE_BP;
    expect(spanBp).toBeGreaterThan(40);
    expect(spanBp).toBeLessThan(60);

    // a H2A-H2B dimer sits on each side, near entry and exit
    const a = l.filter((h) => h.group === 'dimerA');
    const b = l.filter((h) => h.group === 'dimerB');
    expect(a.every((h) => h.dnaT < 0.3)).toBe(true);
    expect(b.every((h) => h.dnaT > 0.7)).toBe(true);
    // and the tetramer therefore sits between them in height, not beside them
    const midY = tet.reduce((m, h) => m + h.at[1], 0) / 4;
    expect(Math.abs(midY)).toBeLessThan(0.1);
    expect(a[0].at[1]).toBeLessThan(midY);
    expect(b[0].at[1]).toBeGreaterThan(midY);
  });

  it('moves each H2A-H2B dimer as ONE unit, not as two loose spheres', () => {
    // a dimer dissociates whole; showing its two subunits fly apart independently would be a
    // claim about the chemistry, and the wrong one
    const closed = histoneLayout(0);
    const open = histoneLayout(1);
    for (const g of ['dimerA', 'dimerB']) {
      const idx = closed.map((h, i) => (h.group === g ? i : -1)).filter((i) => i >= 0);
      expect(idx).toHaveLength(2);
      const before = dist(closed[idx[0]].at, closed[idx[1]].at);
      const after = dist(open[idx[0]].at, open[idx[1]].at);
      // internal geometry preserved: the pair travels, it does not stretch
      expect(after).toBeCloseTo(before, 9);
      // and it really did travel
      expect(dist(closed[idx[0]].at, open[idx[0]].at)).toBeGreaterThan(8);
    }
    // the tetramer expands in place instead, staying nearer the centre
    const tet = closed.map((h, i) => (h.group === 'tetramer' ? i : -1)).filter((i) => i >= 0);
    for (const i of tet) expect(dist(closed[i].at, open[i].at)).toBeLessThan(6);
  });

  it('moves every subunit outward as the view explodes, and the dimers furthest', () => {
    const closed = histoneLayout(0);
    const open = histoneLayout(1);
    for (let i = 0; i < closed.length; i += 1) {
      expect(radius(open[i].at)).toBeGreaterThan(radius(closed[i].at));
    }
    const spread = (l: ReturnType<typeof histoneLayout>, group: string) => {
      const g = l.filter((h) => h.group.startsWith(group));
      return g.reduce((m, h) => Math.max(m, radius(h.at)), 0);
    };
    // H2A-H2B dimers leave first at physiological salt, so they travel further
    expect(spread(open, 'dimer')).toBeGreaterThan(spread(open, 'tetramer'));
  });

  it('clamps the explode factor rather than extrapolating', () => {
    const a = histoneLayout(1);
    const b = histoneLayout(4);
    for (let i = 0; i < a.length; i += 1) expect(dist(a[i].at, b[i].at)).toBeCloseTo(0, 12);
    const c = histoneLayout(0);
    const d = histoneLayout(-2);
    for (let i = 0; i < c.length; i += 1) expect(dist(c[i].at, d[i].at)).toBeCloseTo(0, 12);
  });
});

describe('fibre models', () => {
  it('puts six nucleosomes on each solenoid turn, inside 30 nm', () => {
    const s = solenoidFibre(SOLENOID_NUCLEOSOMES_PER_TURN * 3);
    for (const p of s) {
      expect(radius(p) * 2 + NUCLEOSOME_DIAMETER_NM).toBeCloseTo(FIBRE_30NM_DIAMETER_NM, 6);
    }
    // one full turn returns to the starting azimuth
    const a0 = Math.atan2(s[0][2], s[0][0]);
    const a6 = Math.atan2(s[SOLENOID_NUCLEOSOMES_PER_TURN][2], s[SOLENOID_NUCLEOSOMES_PER_TURN][0]);
    expect(Math.abs(Math.sin(a6 - a0))).toBeLessThan(1e-9);
  });

  it('alternates the zigzag between two sides of the axis', () => {
    const z = zigzagFibre(8);
    for (let i = 0; i + 1 < z.length; i += 2) {
      const a = Math.atan2(z[i][2], z[i][0]);
      const b = Math.atan2(z[i + 1][2], z[i + 1][0]);
      let d = Math.abs(a - b);
      while (d > Math.PI) d = 2 * Math.PI - d;
      expect(d).toBeCloseTo(Math.PI, 6); // opposite sides
    }
  });

  it('makes the disordered chain deterministic and within the measured widths', () => {
    const a = disorderedChain(200, 7);
    const b = disorderedChain(200, 7);
    for (let i = 0; i < a.length; i += 1) expect(dist(a[i].at, b[i].at)).toBe(0);
    expect(dist(a[0].at, disorderedChain(200, 8)[0].at)).toBeGreaterThan(0);
    for (const p of a) {
      expect(p.widthNm).toBeGreaterThanOrEqual(DISORDERED_CHAIN_MIN_NM);
      expect(p.widthNm).toBeLessThanOrEqual(DISORDERED_CHAIN_MAX_NM);
    }
  });

  it('keeps the disordered walk locally smooth, unlike a free random walk', () => {
    const c = disorderedChain(300, 3).map((p) => p.at);
    let reversals = 0;
    for (let i = 2; i < c.length; i += 1) {
      const d1: Vec3 = [c[i - 1][0] - c[i - 2][0], c[i - 1][1] - c[i - 2][1], c[i - 1][2] - c[i - 2][2]];
      const d2: Vec3 = [c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1], c[i][2] - c[i - 1][2]];
      if (d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2] < 0) reversals += 1;
    }
    expect(reversals).toBe(0); // persistent: it never doubles back within one step
  });

  it('spaces beads so the 10 nm fibre comes out at the 6-7x it is quoted at', () => {
    const std = beadsOnAString(4);
    const rise = std[1][1] - std[0][1];
    expect(rise).toBeCloseTo(TEN_NM_RISE_PER_NUCLEOSOME_NM, 9);
    // one repeat is 63.6 nm of duplex laid down in 10 nm of fibre
    expect(contourLengthNm(NUCLEOSOME_REPEAT_BP) / rise).toBeCloseTo(6.36, 2);
    // spacing by the linker's full contour instead gives 19.7 nm and only 3.2x -- a low-salt
    // spreading artefact, not the fibre
    const stretched = NUCLEOSOME_DIAMETER_NM * 0.55 + contourLengthNm(NUCLEOSOME_REPEAT_BP - NUCLEOSOME_CORE_BP);
    expect(stretched).toBeCloseTo(19.65, 2);
    expect(contourLengthNm(NUCLEOSOME_REPEAT_BP) / stretched).toBeCloseTo(3.24, 2);

    const tight = beadsOnAString(4, NUCLEOSOME_CORE_BP + 20);
    const loose = beadsOnAString(4, NUCLEOSOME_CORE_BP + 90);
    expect(loose[1][1] - loose[0][1]).toBeGreaterThan(tight[1][1] - tight[0][1]);
    expect(() => beadsOnAString(0)).toThrow(RangeError);
  });
});

describe('loops and the mitotic array', () => {
  it('returns a loop to its anchor', () => {
    const loop = extrudedLoop(0, 200_000, 0.3, 40);
    expect(radius(loop[0])).toBeCloseTo(0, 9);
    expect(radius(loop[loop.length - 1])).toBeCloseTo(0, 9);
    const peak = Math.max(...loop.map(radius));
    expect(peak).toBeGreaterThan(0);
  });

  it('throws a bigger loop further out', () => {
    const small = Math.max(...extrudedLoop(0, 80_000, 0, 30).map(radius));
    const big = Math.max(...extrudedLoop(0, 400_000, 0, 30).map(radius));
    expect(big).toBeGreaterThan(small);
  });

  it('lets the outer loops SET the chromatid width, rather than fitting to it', () => {
    // this is the Gibcus result, and it is a derivation rather than a tuned constant
    expect(2 * loopReachNm(PROMETA_OUTER_LOOP_BP)).toBeCloseTo(CHROMATID_DIAMETER_NM, 9);
    // the condensin I inner loops then nest inside on their own
    expect(loopReachNm(PROMETA_INNER_LOOP_BP)).toBeCloseTo(156.52, 2);
    expect(loopReachNm(PROMETA_INNER_LOOP_BP)).toBeLessThan(loopReachNm(PROMETA_OUTER_LOOP_BP));
    expect(loopReachNm(PROMETA_OUTER_LOOP_BP) / loopReachNm(PROMETA_INNER_LOOP_BP)).toBeCloseTo(Math.sqrt(5), 9);
    expect(() => loopReachNm(0)).toThrow(RangeError);
  });

  it('rises 482 nm per turn, which is the only value that rebuilds chromosome 1', () => {
    expect(helicalRisePerTurnNm()).toBeCloseTo(482.01, 2);
    // walk the whole chromosome up the staircase and it must come out 10 um long
    const turns = CHR1_BP / HELICAL_TURN_BP;
    expect(turns * helicalRisePerTurnNm()).toBeCloseTo(CHR1_METAPHASE_NM, 6);
    expect(turns).toBeCloseTo(20.75, 2);
  });

  it('spaces the loops up the staircase at the derived pitch', () => {
    const arr = helicalLoopArray(40, PROMETA_OUTER_LOOP_BP);
    const perLoop = helicalRisePerTurnNm() / (HELICAL_TURN_BP / PROMETA_OUTER_LOOP_BP);
    expect(perLoop).toBeCloseTo(16.07, 2);
    expect(arr[1].anchor[1] - arr[0].anchor[1]).toBeCloseTo(perLoop, 9);
    // one turn's worth of loops rises exactly one turn
    expect(arr[30].anchor[1] - arr[0].anchor[1]).toBeCloseTo(helicalRisePerTurnNm(), 9);
  });

  it('winds the loop array into a staircase of the right pitch', () => {
    const arr = helicalLoopArray(60, PROMETA_OUTER_LOOP_BP);
    const loopsPerTurn = HELICAL_TURN_BP / PROMETA_OUTER_LOOP_BP;
    expect(loopsPerTurn).toBe(30);
    // after one turn's worth of loops the azimuth has come full circle
    expect(arr[loopsPerTurn].azimuth - arr[0].azimuth).toBeCloseTo(2 * Math.PI, 9);
    expect(arr[1].anchor[1]).toBeGreaterThan(arr[0].anchor[1]);
  });

  it('packs the condensin I inner loops five times more densely', () => {
    const outer = helicalLoopArray(10, PROMETA_OUTER_LOOP_BP);
    const inner = helicalLoopArray(10, PROMETA_INNER_LOOP_BP);
    const outerStep = outer[1].azimuth - outer[0].azimuth;
    const innerStep = inner[1].azimuth - inner[0].azimuth;
    expect(outerStep / innerStep).toBeCloseTo(5, 9);
  });
});

describe('the metaphase constriction', () => {
  it('pinches at the centromere and relaxes along both arms', () => {
    const centre = CHR1_CENTROMERE_BP / CHR1_BP;
    expect(centromereConstriction(centre)).toBeCloseTo(0.28, 9);
    expect(centromereConstriction(0)).toBeCloseTo(1, 6);
    expect(centromereConstriction(1)).toBeCloseTo(1, 6);
    expect(centromereConstriction(0.25)).toBeGreaterThan(0.99);
  });

  it('puts chromosome 1s centromere in the middle, because it is metacentric', () => {
    const centre = CHR1_CENTROMERE_BP / CHR1_BP;
    expect(centre).toBeCloseTo(0.4957, 3);
    // the two arms differ by under 2% of the chromosome, which is what metacentric means
    expect(Math.abs(centre - (1 - centre))).toBeLessThan(0.02);
  });

  it('narrows smoothly, with no step to catch the eye', () => {
    let prev = centromereConstriction(0);
    for (let u = 0.001; u <= 1; u += 0.001) {
      const now = centromereConstriction(u);
      expect(Math.abs(now - prev)).toBeLessThan(0.05);
      prev = now;
    }
  });

  it('is a local feature, not a global taper', () => {
    // the pinch is ~3.5% of sequence wide, so at 10% away the arm is back to full width
    expect(centromereConstriction(0.4)).toBeGreaterThan(0.98);
    expect(centromereConstriction(0.6)).toBeGreaterThan(0.98);
    expect(centromereConstriction(0.3)).toBeGreaterThan(0.9999);
    expect(centromereConstriction(0.7)).toBeGreaterThan(0.9999);
    // and it really does pinch: half width is reached within ~4% of the centre
    expect(centromereConstriction(0.46)).toBeLessThan(0.6);
  });
});

describe('the scrubber', () => {
  it('covers 0 to 1 with contiguous bands', () => {
    expect(REGIMES[0].from).toBe(0);
    expect(REGIMES[REGIMES.length - 1].to).toBe(1);
    for (let i = 1; i < REGIMES.length; i += 1) {
      expect(REGIMES[i].from).toBeCloseTo(REGIMES[i - 1].to, 12);
    }
  });

  it('clamps outside the unit interval', () => {
    expect(regimeAt(-1).regime.id).toBe('duplex');
    expect(regimeAt(2).regime.id).toBe('mitotic');
  });

  it('always has weights that sum to one', () => {
    for (let i = 0; i <= 400; i += 1) {
      const total = [...regimeWeights(i / 400).values()].reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 9);
    }
  });

  it('NEVER jumps a weight — this is the no-popping guarantee', () => {
    // Sample densely and require every regime's weight to move continuously. A representation
    // that appeared or vanished abruptly would show up here as a step.
    const step = 1 / 4000;
    let prev = regimeWeights(0);
    let worst = 0;
    for (let s = step; s <= 1; s += step) {
      const now = regimeWeights(s);
      for (const r of REGIMES) {
        worst = Math.max(worst, Math.abs((now.get(r.id) ?? 0) - (prev.get(r.id) ?? 0)));
      }
      prev = now;
    }
    // over a 1/4000 step the fastest a weight can move is bounded by the blend width
    expect(worst).toBeLessThan(0.01);
  });

  it('blends exactly two regimes at a seam, and one in the middle of a band', () => {
    const seam = REGIMES[0].to;
    const atSeam = [...regimeWeights(seam).entries()].filter(([, w]) => w > 1e-9);
    expect(atSeam).toHaveLength(2);
    expect(atSeam[0][1]).toBeCloseTo(0.5, 6);
    expect(atSeam[1][1]).toBeCloseTo(0.5, 6);

    const mid = (REGIMES[2].from + REGIMES[2].to) / 2;
    const atMid = [...regimeWeights(mid).entries()].filter(([, w]) => w > 1e-9);
    expect(atMid).toHaveLength(1);
    expect(atMid[0][0]).toBe('beads');
  });

  it('has a blend band narrower than the shortest regime', () => {
    const shortest = Math.min(...REGIMES.map((r) => r.to - r.from));
    expect(2 * BLEND_HALF_WIDTH).toBeLessThan(shortest);
  });

  it('smoothsteps between 0 and 1 with zero slope at both ends', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 12);
    expect(smoothstep(-5)).toBe(0);
    expect(smoothstep(9)).toBe(1);
    const e = 1e-4;
    expect(smoothstep(e) / e).toBeLessThan(0.01); // flat at the start
  });
});

describe('camera and scale readouts', () => {
  it('widens the field monotonically across the whole scrub', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 1000; i += 1) {
      const f = cameraFieldNm(i / 1000);
      expect(f).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = f;
    }
  });

  it('frames each regime at its OWN declared scale, at its own milestone', () => {
    // the failure this replaces: keying off band starts put an 11 nm nucleosome in a 94 nm
    // field at the nucleosome milestone, because the camera was already halfway to the beads
    for (const r of REGIMES) {
      const centre = (r.from + r.to) / 2;
      expect(cameraFieldNm(centre)).toBeCloseTo(r.fieldNm, 6);
      expect(bpInViewAt(centre)).toBeCloseTo(r.bpInView, 3);
    }
    // and the milestones the scrubber snaps to ARE those positions
    for (const m of milestones()) {
      const r = REGIMES.find((x) => x.id === m.id)!;
      expect(cameraFieldNm(m.at)).toBeCloseTo(r.fieldNm, 6);
    }
  });

  it('spans 20 nm to 12 micrometres', () => {
    expect(cameraFieldNm(0)).toBeCloseTo(20, 6);
    expect(cameraFieldNm(1)).toBeCloseTo(12_000, 6);
    expect(cameraFieldNm(1) / cameraFieldNm(0)).toBeCloseTo(600, 6);
  });

  it('moves logarithmically, so each decade gets comparable travel', () => {
    // a linear ramp would spend most of the scrubber in the last regime; the log ramp does
    // not. Compare the scrub needed to cross the first decade against the last.
    const scrubFor = (target: number) => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2;
        if (cameraFieldNm(mid) < target) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };
    const firstDecade = scrubFor(200) - scrubFor(20);
    const lastDecade = scrubFor(12_000) - scrubFor(1_200);
    expect(firstDecade).toBeGreaterThan(0.1);
    expect(lastDecade).toBeGreaterThan(0.1);
    expect(Math.max(firstDecade, lastDecade) / Math.min(firstDecade, lastDecade)).toBeLessThan(3);
  });

  it('grows the sequence in view monotonically too', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 500; i += 1) {
      const bp = bpInViewAt(i / 500);
      expect(bp).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = bp;
    }
    expect(bpInViewAt(0)).toBeCloseTo(60, 6);
    expect(bpInViewAt(1)).toBeCloseTo(CHR1_BP, 0);
  });

  it('reports each level at the compaction it is quoted at in the literature', () => {
    // compaction is contour over the PACKAGED length of the structure, not over the field of
    // view -- dividing by the field made the number an artefact of camera distance, and read
    // 1,700x at metaphase where the chromatid being drawn is 8,500x
    const at = (id: string) => {
      const r = REGIMES.find((x) => x.id === id)!;
      return compactionAt((r.from + r.to) / 2);
    };
    expect(at('duplex')).toBeCloseTo(1.0, 2); // naked DNA is not compacted
    expect(at('nucleosome')).toBeCloseTo(5.78, 2); // quoted ~6x
    expect(at('beads')).toBeCloseTo(6.375, 6); // quoted 6-7x; 1020/160 exactly
    expect(at('fibre')).toBeCloseTo(34.68, 2); // quoted ~40x
    expect(at('loops')).toBeCloseTo(357.9, 1); // a few hundred
    expect(at('mitotic')).toBeCloseTo(8464.5, 1); // the headline ~8,500x

    // and it is monotone: no level in the hierarchy loses compaction
    let prev = 0;
    for (const r of REGIMES) {
      const c = compactionAt((r.from + r.to) / 2);
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
  });

  it('reconstructs chromosome 1 exactly at the far end of the scrubber', () => {
    // the metaphase scene draws the whole of chr1, so the readout must say so
    expect(bpInViewAt(1)).toBeCloseTo(CHR1_BP, 0);
    expect(packagedNmAt(1)).toBeCloseTo(CHR1_METAPHASE_NM, 6);
    expect(compactionAt(1)).toBeCloseTo(compactionRatio(CHR1_BP, CHR1_METAPHASE_NM), 6);
    expect(contourLengthNm(bpInViewAt(1)) / 1e6).toBeCloseTo(84.65, 2); // millimetres
  });
});

describe('level of detail', () => {
  it('never exceeds the instance budget anywhere on the scrubber', () => {
    for (let i = 0; i <= 1000; i += 1) {
      expect(nucleosomeBudget(i / 1000)).toBeLessThanOrEqual(NUCLEOSOME_INSTANCE_BUDGET);
      expect(nucleosomeBudget(i / 1000)).toBeGreaterThanOrEqual(0);
    }
  });

  it('NEVER draws more nucleosomes than the sequence in view contains', () => {
    // the readout reported "4,000 of 1,310" before this bound existed, which is not a
    // performance bug but a false claim about what is on screen
    for (let i = 0; i <= 2000; i += 1) {
      const s = i / 2000;
      expect(nucleosomeBudget(s)).toBeLessThanOrEqual(impliedNucleosomeCount(s));
    }
    // and specifically at the positions that were wrong
    for (const s of [0.21, 0.38, 0.53]) {
      expect(nucleosomeBudget(s)).toBeLessThanOrEqual(impliedNucleosomeCount(s));
    }
  });

  it('caps a count the biology would otherwise blow past', () => {
    // a metaphase chromosome really does hold well over a million nucleosomes
    expect(impliedNucleosomeCount(1)).toBeGreaterThan(1_300_000);
    expect(nucleosomeBudget(1)).toBeLessThan(impliedNucleosomeCount(1) / 100);
    expect(Math.round(CHR1_BP / NUCLEOSOME_REPEAT_BP)).toBeGreaterThan(1_300_000);
  });

  it('draws no nucleosomes at all once the scene is a chromatid', () => {
    expect(nucleosomeBudget(0.98)).toBe(0);
    expect(nucleosomeBudget(0.55)).toBeGreaterThan(0);
  });

  it('changes the budget continuously, so instances fade rather than pop', () => {
    const step = 1 / 2000;
    let prev = nucleosomeBudget(0);
    for (let s = step; s <= 1; s += step) {
      const now = nucleosomeBudget(s);
      expect(Math.abs(now - prev)).toBeLessThan(NUCLEOSOME_INSTANCE_BUDGET * 0.02);
      prev = now;
    }
  });
});

describe('milestones', () => {
  it('puts one at the centre of every regime', () => {
    const m = milestones();
    expect(m).toHaveLength(REGIMES.length);
    m.forEach((x, i) => expect(x.at).toBeCloseTo((REGIMES[i].from + REGIMES[i].to) / 2, 12));
  });

  it('snaps only inside the tolerance', () => {
    const first = milestones()[0].at;
    expect(snapTarget(first + 0.005)).toBeCloseTo(first, 12);
    expect(snapTarget(first + 0.05)).toBeNull();
  });

  it('reports each regime a distinct label', () => {
    const labels = new Set(REGIMES.map((r) => r.label));
    expect(labels.size).toBe(REGIMES.length);
    expect(CHROMATID_DIAMETER_NM).toBe(700);
  });

  it('carries a short tick label that is not a truncation of the long one', () => {
    const shorts = new Set(REGIMES.map((r) => r.short));
    expect(shorts.size).toBe(REGIMES.length);
    for (const r of REGIMES) {
      expect(r.short.length).toBeGreaterThan(4);
      expect(r.short.length).toBeLessThanOrEqual(14);
    }
    // the failure this guards: deriving the tick label by splitting the long one on a dash
    // renders 'B-form double helix' as the single letter 'B'
    expect(REGIMES[0].label.split(/[—-]/)[0].trim()).toBe('B');
    expect(REGIMES[0].short).toBe('B-form DNA');
  });
});

describe('continuous transition mathematics & scale bar', () => {
  it('smoothstep5 has C2 zero derivatives at boundaries and smooth monotonic rise', () => {
    expect(smoothstep5(0)).toBe(0);
    expect(smoothstep5(1)).toBe(1);
    expect(smoothstep5(0.5)).toBeCloseTo(0.5, 10);
    expect(smoothstep5(-0.2)).toBe(0);
    expect(smoothstep5(1.2)).toBe(1);

    // Verify monotonicity across [0, 1]
    let prev = 0;
    for (let t = 0.01; t <= 1; t += 0.01) {
      const v = smoothstep5(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('cameraTargetNmAt returns valid coordinate tuples centered at origin', () => {
    for (let s = 0; s <= 1; s += 0.1) {
      const target = cameraTargetNmAt(s);
      expect(target).toHaveLength(3);
      expect(target[0]).toBe(0);
      expect(target[1]).toBe(0);
      expect(target[2]).toBe(0);
    }
  });

  it('playbackSpeedMultiplier eases near milestones and speeds across spans', () => {
    const ms = milestones();
    for (const m of ms) {
      const speedAtMilestone = playbackSpeedMultiplier(m.at);
      expect(speedAtMilestone).toBeLessThan(0.75);
    }
    // Midpoint between milestones has higher pace
    const midSpeed = playbackSpeedMultiplier(0.2);
    expect(midSpeed).toBeGreaterThan(0.68);
  });

  it('physicalScaleBar returns appropriate metric units and clean round numbers', () => {
    const s20 = physicalScaleBar(20);
    expect(s20.barWidthNm).toBeGreaterThan(0);
    expect(s20.ratioOfField).toBeGreaterThanOrEqual(0.1);
    expect(s20.ratioOfField).toBeLessThanOrEqual(0.4);
    expect(s20.label).toContain('nm');

    const s12000 = physicalScaleBar(12000);
    expect(s12000.barWidthNm).toBeGreaterThanOrEqual(1000);
    expect(s12000.label).toContain('µm');
  });
});

