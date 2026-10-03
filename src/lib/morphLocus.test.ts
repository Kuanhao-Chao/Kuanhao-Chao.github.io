import { describe, expect, it } from 'vitest';
import { createMorphParticles, type MorphPoint } from './morphModel';
import {
  COVERAGE_LEVELS,
  COVERAGE_SHARE,
  INTRON_FLOOR,
  JUNCTIONS,
  LOCUS_WIDTH,
  LOCUS_X0,
  LOCUS_X1,
  STRIP_HALF,
  Y_BASE,
  coverageHeight,
  junctionDepth,
  junctionFeet,
  junctionIndex,
  junctionPoint,
  junctionWidth,
  locusAnchors,
  locusDotClass,
  locusFraction,
  locusX,
  sampleLocusParticle,
} from './morphLocus';
import { EXONS, INTRONS } from './morphSplice';

const point = (): MorphPoint => ({ x: 0, y: 0, z: 0, alpha: 1 });
const particles = createMorphParticles(3200);
const inExon = (g: number): boolean => EXONS.some((e) => g >= e.start && g < e.end);

describe('the same gene as the RNA scene', () => {
  it('has three exons to give coverage levels to, and three junctions', () => {
    expect(EXONS).toHaveLength(3);
    expect(COVERAGE_LEVELS).toHaveLength(EXONS.length);
    expect(JUNCTIONS).toHaveLength(3);
  });
  it('starts and ends every arc on the shared model’s exon boundaries', () => {
    for (const junction of JUNCTIONS) {
      const { xa, xb } = junctionFeet(junction);
      const from = EXONS[junction.from];
      const to = EXONS[junction.to];
      expect(xa).toBe(locusX(from.end));
      expect(xb).toBe(locusX(to.start));
      expect((xa - LOCUS_X0) / LOCUS_WIDTH).toBeCloseTo(from.end, 12);
      expect((xb - LOCUS_X0) / LOCUS_WIDTH).toBeCloseTo(to.start, 12);
    }
  });
  it('spans exactly one intron with each ordinary arc, and the middle exon with the skip', () => {
    const ordinary = JUNCTIONS.filter((j) => !j.skips);
    expect(ordinary).toHaveLength(2);
    ordinary.forEach((junction, k) => {
      expect(junction.to).toBe(junction.from + 1);
      expect(EXONS[junction.from].end).toBe(INTRONS[k].start);
      expect(EXONS[junction.to].start).toBe(INTRONS[k].end);
    });
    const skip = JUNCTIONS.filter((j) => j.skips);
    expect(skip).toHaveLength(1);
    expect(skip[0].from).toBe(0);
    expect(skip[0].to).toBe(EXONS.length - 1);
    // It is the longest read, and it is rare: fewer reads than either neighbouring junction.
    for (const junction of ordinary) expect(skip[0].reads).toBeLessThan(junction.reads);
  });
  it('maps the whole gene onto the plot and nothing beyond it', () => {
    expect(locusX(0)).toBe(LOCUS_X0);
    expect(locusX(1)).toBe(LOCUS_X1);
    expect(locusX(-3)).toBe(LOCUS_X0);
    expect(locusX(9)).toBe(LOCUS_X1);
    expect(locusX(Number.NaN)).toBe(LOCUS_X0);
  });
});

describe('coverage', () => {
  it('is positive everywhere and never jumps', () => {
    const steps = 4000;
    let previous = coverageHeight(0);
    let worst = 0;
    for (let i = 0; i <= steps; i++) {
      const height = coverageHeight(i / steps);
      expect(height).toBeGreaterThan(0);
      expect(height).toBeLessThan(0.5);
      worst = Math.max(worst, Math.abs(height - previous));
      previous = height;
    }
    // A shoulder is 0.012 of the gene wide and about 0.4 tall: 0.0144 a step at its steepest.
    expect(worst).toBeLessThan(0.02);
  });
  it('is a block per exon and a faint floor in each intron', () => {
    EXONS.forEach((exon, k) => {
      const centre = (exon.start + exon.end) / 2;
      const height = coverageHeight(centre);
      // The undulation moves a block by a few percent either way.
      expect(height).toBeGreaterThan(COVERAGE_LEVELS[k] * 0.85);
      expect(height).toBeLessThan(COVERAGE_LEVELS[k] * 1.12);
    });
    for (const intron of INTRONS) {
      const centre = (intron.start + intron.end) / 2;
      expect(coverageHeight(centre)).toBeLessThan(INTRON_FLOOR * 1.3);
      expect(coverageHeight(centre)).toBeGreaterThan(INTRON_FLOOR * 0.7);
    }
  });
  it('rises and falls inside its own exon, so a block never spills into an intron', () => {
    for (const exon of EXONS) {
      expect(coverageHeight(exon.start)).toBeLessThan(0.05);
      expect(coverageHeight(exon.end)).toBeLessThan(0.05);
      expect(coverageHeight(exon.start + 0.03)).toBeGreaterThan(0.2);
      expect(coverageHeight(exon.end - 0.03)).toBeGreaterThan(0.2);
    }
  });
  it('puts the tallest block on the middle exon, which two kinds of junction read include', () => {
    expect(COVERAGE_LEVELS[1]).toBeGreaterThan(COVERAGE_LEVELS[0]);
    expect(COVERAGE_LEVELS[1]).toBeGreaterThan(COVERAGE_LEVELS[2]);
    // Every level fits the frame: the tallest block (with its undulation) stays above y = -0.46.
    expect(Y_BASE - Math.max(...COVERAGE_LEVELS) * 1.1).toBeGreaterThan(-0.46);
  });
  it('is finite for any input', () => {
    for (const g of [Number.NaN, -1, 2, Infinity, -Infinity])
      expect(Number.isFinite(coverageHeight(g))).toBe(true);
  });
});

describe('junction reads', () => {
  it('hang below the baseline, foot to foot, in a half-ellipse', () => {
    for (const junction of JUNCTIONS) {
      const { xa, xb, span } = junctionFeet(junction);
      const depth = junctionDepth(junction);
      const out = point();
      junctionPoint(junction, 0, out);
      expect(out.x).toBeCloseTo(xa, 12);
      expect(out.y).toBeCloseTo(Y_BASE + STRIP_HALF, 12);
      junctionPoint(junction, 1, out);
      expect(out.x).toBeCloseTo(xb, 12);
      expect(out.y).toBeCloseTo(Y_BASE + STRIP_HALF, 12);
      junctionPoint(junction, 0.5, out);
      expect(out.x).toBeCloseTo(xa + span / 2, 12);
      expect(out.y).toBeCloseTo(Y_BASE + STRIP_HALF + depth, 12);
      for (let i = 0; i <= 40; i++) {
        junctionPoint(junction, i / 40, out);
        expect(out.y).toBeGreaterThanOrEqual(Y_BASE + STRIP_HALF - 1e-12);
        expect(out.y).toBeLessThanOrEqual(Y_BASE + STRIP_HALF + depth + 1e-12);
        expect(out.x).toBeGreaterThanOrEqual(xa - 1e-12);
        expect(out.x).toBeLessThanOrEqual(xb + 1e-12);
      }
    }
  });
  it('is symmetric about the middle of its span', () => {
    for (const junction of JUNCTIONS) {
      const a = point();
      const b = point();
      for (let i = 0; i <= 20; i++) {
        junctionPoint(junction, i / 20, a);
        junctionPoint(junction, 1 - i / 20, b);
        const { xa, span } = junctionFeet(junction);
        expect(a.x + b.x).toBeCloseTo(2 * xa + span, 12);
        expect(a.y).toBeCloseTo(b.y, 12);
      }
    }
  });
  it('is deeper the further it reaches, so the skip is the tallest arc', () => {
    const depths = JUNCTIONS.map(junctionDepth);
    const skip = JUNCTIONS.findIndex((j) => j.skips);
    depths.forEach((depth, k) => {
      expect(depth).toBeGreaterThan(0.07);
      expect(depth).toBeLessThan(0.28);
      if (k !== skip) expect(depths[skip]).toBeGreaterThan(depth * 1.3);
    });
    // The arcs fit below the baseline within the frame, with room for a caption.
    expect(Y_BASE + STRIP_HALF + Math.max(...depths)).toBeLessThan(0.4);
  });
  it('is drawn thicker with more reads, by the square root of the count', () => {
    for (const junction of JUNCTIONS)
      expect(junctionWidth(junction)).toBeCloseTo(1 + 0.12 * Math.sqrt(junction.reads), 12);
    const by = [...JUNCTIONS].sort((a, b) => a.reads - b.reads).map(junctionWidth);
    expect(by).toEqual([...by].sort((a, b) => a - b));
    // A 7× difference in reads is a 2.6× difference in thickness, not 7×: legible at both ends.
    const widths = JUNCTIONS.map(junctionWidth);
    expect(Math.max(...widths) / Math.min(...widths)).toBeLessThan(2);
  });
});

describe('the particles', () => {
  it('stay finite, inside the frame and visible', () => {
    const out = point();
    for (const p of particles) {
      sampleLocusParticle(p, out);
      expect(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z)).toBe(true);
      expect(out.x).toBeGreaterThanOrEqual(LOCUS_X0 - 0.03);
      expect(out.x).toBeLessThanOrEqual(LOCUS_X1 + 0.03);
      expect(out.y).toBeGreaterThan(-0.46);
      expect(out.y).toBeLessThan(0.4);
      expect(out.alpha).toBeGreaterThan(0);
      expect(out.alpha).toBeLessThanOrEqual(1);
    }
  });
  it('split into coverage and junction reads in the share the model declares', () => {
    const coverage = particles.filter((p) => p.u < COVERAGE_SHARE).length;
    expect(coverage / particles.length).toBeCloseTo(COVERAGE_SHARE, 1);
    const warm = particles.filter((p) => locusDotClass(p) === 2).length;
    expect(warm).toBe(particles.length - coverage);
    expect(particles.every((p) => locusDotClass(p) === (p.u >= COVERAGE_SHARE ? 2 : 0))).toBe(true);
  });
  it('sit under the coverage curve, with the outline on it', () => {
    const out = point();
    let ridge = 0;
    for (const p of particles) {
      if (p.u >= COVERAGE_SHARE) continue;
      sampleLocusParticle(p, out);
      const g = (out.x - LOCUS_X0) / LOCUS_WIDTH;
      const height = coverageHeight(g);
      expect(out.y).toBeLessThanOrEqual(Y_BASE + 1e-9);
      expect(out.y).toBeGreaterThanOrEqual(Y_BASE - height - 1e-9);
      if (p.role === 'chromatin') {
        ridge++;
        // The outline sits within 4% of the curve's top.
        expect(Y_BASE - out.y).toBeGreaterThanOrEqual(height * 0.96 - 1e-9);
      }
    }
    expect(ridge).toBeGreaterThan(100);
  });
  it('put most of the coverage dots on exons, and leave introns a faint line, not a void', () => {
    const out = point();
    let onExons = 0;
    let total = 0;
    for (const p of particles) {
      if (p.u >= COVERAGE_SHARE) continue;
      sampleLocusParticle(p, out);
      total++;
      if (inExon((out.x - LOCUS_X0) / LOCUS_WIDTH)) onExons++;
    }
    const share = onExons / total;
    // Exons are 42% of the width and hold well over twice their share of the dots.
    expect(share).toBeGreaterThan(0.75);
    expect(share).toBeLessThan(0.95);
  });
  it('lay junction reads on their own arcs, in proportion to the square root of the reads', () => {
    const out = point();
    const counts = JUNCTIONS.map(() => 0);
    let reads = 0;
    for (const p of particles) {
      if (p.u < COVERAGE_SHARE) continue;
      sampleLocusParticle(p, out);
      reads++;
      // Which arc a read belongs to is decided by its draw, so check it against that arc's ellipse.
      // (Nearest-ellipse would be ambiguous: the arcs leaving one foot are nearly coincident there.)
      const k = junctionIndex((p.u - COVERAGE_SHARE) / (1 - COVERAGE_SHARE));
      const { xa, span } = junctionFeet(JUNCTIONS[k]);
      const a = span / 2;
      const b = junctionDepth(JUNCTIONS[k]);
      const off = Math.abs(
        ((out.x - xa - a) / a) ** 2 + ((out.y - Y_BASE - STRIP_HALF) / b) ** 2 - 1
      );
      expect(off).toBeLessThan(0.3);
      counts[k]++;
      expect(out.y).toBeGreaterThanOrEqual(Y_BASE + STRIP_HALF - 0.02);
    }
    const total = JUNCTIONS.reduce((sum, j) => sum + Math.sqrt(j.reads), 0);
    JUNCTIONS.forEach((junction, k) => {
      expect(counts[k] / reads).toBeCloseTo(Math.sqrt(junction.reads) / total, 1);
      expect(counts[k]).toBeGreaterThan(20);
    });
  });
  it('are deterministic', () => {
    const a = point();
    const b = point();
    for (const p of particles.slice(0, 400)) {
      sampleLocusParticle(p, a);
      sampleLocusParticle(p, b);
      expect(a).toEqual(b);
    }
  });
});

describe('the inverse tables', () => {
  it('maps uniform draws to gene fractions monotonically, end to end', () => {
    expect(locusFraction(0)).toBeCloseTo(0, 3);
    expect(locusFraction(1)).toBeCloseTo(1, 3);
    let previous = -1;
    for (let i = 0; i <= 2000; i++) {
      const g = locusFraction(i / 2000);
      expect(g).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      previous = g;
    }
  });
  it('inverts the coverage mass: the share of draws below g is the mass below g', () => {
    // Integrate the same weight the table was built from and compare at a few gene fractions.
    const steps = 20000;
    const mass: number[] = [0];
    for (let i = 0; i < steps; i++) mass.push(mass[i] + coverageHeight((i + 0.5) / steps) + 0.05);
    const total = mass[steps];
    for (const g of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const expected = mass[Math.round(g * steps)] / total;
      expect(locusFraction(expected)).toBeCloseTo(g, 2);
    }
  });
  it('chooses a junction by the square root of its reads and covers every index', () => {
    expect(junctionIndex(0)).toBe(0);
    expect(junctionIndex(0.999999)).toBe(JUNCTIONS.length - 1);
    expect(junctionIndex(Number.NaN)).toBe(0);
    let previous = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const k = junctionIndex(i / 1000);
      expect(k).toBeGreaterThanOrEqual(previous);
      previous = k;
      seen.add(k);
    }
    expect(seen.size).toBe(JUNCTIONS.length);
  });
});

describe('the captions', () => {
  it('hangs the coverage caption clear of the highest peak, undulation included', () => {
    const anchor = locusAnchors().find((x) => x.label === 'exon coverage')!;
    let peak = 0;
    for (let i = 0; i <= 2000; i++) {
      const g = EXONS[1].start + ((EXONS[1].end - EXONS[1].start) * i) / 2000;
      peak = Math.max(peak, coverageHeight(g));
    }
    expect(anchor.y).toBeLessThan(Y_BASE - peak);
  });
  it('gives the intron a shorter caption for the room it leaves', () => {
    const intron = locusAnchors().find((x) => x.label.startsWith('intron'))!;
    expect(intron.short).toBeTruthy();
    expect(intron.short!.length).toBeLessThan(intron.label.length);
    expect(intron.room).toBeCloseTo(INTRONS[0].len * LOCUS_WIDTH, 12);
  });
  it('name the coverage, an intron and every junction with its read count', () => {
    const labels = locusAnchors().map((anchor) => anchor.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain('exon coverage');
    expect(labels).toContain('intron: few reads');
    for (const junction of JUNCTIONS)
      expect(labels.some((label) => label.startsWith(`${junction.reads} reads`))).toBe(true);
    expect(labels.filter((label) => /skip/.test(label))).toHaveLength(1);
  });
  it('puts coverage captions above the baseline and junction captions at the foot of their arcs', () => {
    for (const anchor of locusAnchors()) {
      expect(Number.isFinite(anchor.x) && Number.isFinite(anchor.y)).toBe(true);
      expect(anchor.x).toBeGreaterThanOrEqual(LOCUS_X0);
      expect(anchor.x).toBeLessThanOrEqual(LOCUS_X1);
      const junction = JUNCTIONS.find((j) => anchor.label.startsWith(`${j.reads} reads`));
      if (!junction) {
        expect(anchor.side).toBe('above');
        expect(anchor.y).toBeLessThan(Y_BASE);
        continue;
      }
      // The lowest point of its own arc, midway between its feet.
      const { xa, span } = junctionFeet(junction);
      expect(anchor.x).toBeCloseTo(xa + span / 2, 12);
      expect(anchor.y).toBeCloseTo(Y_BASE + STRIP_HALF + junctionDepth(junction), 12);
      // An ordinary arc is captioned inside its span, clear of the skipping arc that runs beneath
      // both of them; the skipping arc is captioned below itself.
      expect(anchor.side).toBe(junction.skips ? 'below' : 'above');
    }
  });
});
