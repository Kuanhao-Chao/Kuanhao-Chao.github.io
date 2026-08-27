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
  bDnaBasePairs,
  bDnaStrand,
  beadsOnAString,
  bpInViewAt,
  cameraFieldNm,
  compactionAt,
  compactionRatio,
  contourLengthNm,
  coreParticleEnvelope,
  disorderedChain,
  extrudedLoop,
  helicalLoopArray,
  histoneLayout,
  impliedNucleosomeCount,
  milestones,
  nucleosomeBudget,
  nucleosomeSuperhelix,
  regimeAt,
  regimeWeights,
  smoothstep,
  snapTarget,
  solenoidFibre,
  superhelixContourNm,
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

describe('the exploded octamer', () => {
  it('returns all eight histones assembled and separated alike', () => {
    expect(histoneLayout(0)).toHaveLength(8);
    expect(histoneLayout(1)).toHaveLength(8);
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

  it('spaces beads by the linker they are joined with', () => {
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
    expect(bpInViewAt(1)).toBeCloseTo(60_000_000, 3);
  });

  it('reports a compaction that rises across the hierarchy', () => {
    expect(compactionAt(0)).toBeLessThan(2);
    expect(compactionAt(1)).toBeGreaterThan(1_000);
    // the duplex is not compacted at all: 60 bp is 20.4 nm in a 20 nm field
    expect(compactionAt(0)).toBeCloseTo((60 * BP_RISE_NM) / 20, 6);
  });
});

describe('level of detail', () => {
  it('never exceeds the instance budget anywhere on the scrubber', () => {
    for (let i = 0; i <= 1000; i += 1) {
      expect(nucleosomeBudget(i / 1000)).toBeLessThanOrEqual(NUCLEOSOME_INSTANCE_BUDGET);
      expect(nucleosomeBudget(i / 1000)).toBeGreaterThanOrEqual(0);
    }
  });

  it('caps a count the biology would otherwise blow past', () => {
    // a metaphase chromosome really does hold well over a million nucleosomes
    expect(impliedNucleosomeCount(1)).toBeGreaterThan(300_000);
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
});
