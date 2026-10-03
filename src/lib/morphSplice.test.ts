import { describe, expect, it } from 'vitest';
import { createMorphParticles, type MorphPoint } from './morphModel';
import {
  EXONS,
  EXON_SHARE,
  GENE,
  GENE_WIDTH,
  GENE_X0,
  GENE_X1,
  INTRONS,
  LOOP_OUT_SPAN,
  POLY_A_COUNT,
  SPARKS_PER_INTRON,
  SPLICE_CYCLE,
  SPLICE_POSTER_PHASE,
  Y_RNA,
  Y_TEMPLATE,
  catalysisPhase,
  computeSplice,
  elementAt,
  intronPoint,
  newSpliceState,
  phaseOfSigma,
  rnaDotClass,
  rnaPoint,
  sampleRnaParticle,
  spliceAnchors,
  spliceSpark,
  stalkPoint,
  templatePoint,
  type SpliceState,
} from './morphSplice';

const point = (): MorphPoint => ({ x: 0, y: 0, z: 0, alpha: 1 });
/** The state at a given loop phase, rather than at a clock value. */
const atPhase = (phase: number): SpliceState =>
  computeSplice((phase - SPLICE_POSTER_PHASE) * SPLICE_CYCLE);
const clockAt = (phase: number): number => (phase - SPLICE_POSTER_PHASE) * SPLICE_CYCLE;
const sweep = (count: number): number[] => Array.from({ length: count }, (_, i) => i / count);

describe('the gene model', () => {
  it('is five contiguous elements covering the gene, exons and introns alternating', () => {
    expect(GENE.map((element) => element.kind)).toEqual(['exon', 'intron', 'exon', 'intron', 'exon']);
    expect(GENE[0].start).toBe(0);
    expect(GENE[GENE.length - 1].end).toBeCloseTo(1, 12);
    for (let i = 1; i < GENE.length; i++) expect(GENE[i].start).toBe(GENE[i - 1].end);
    expect(GENE.reduce((total, element) => total + element.len, 0)).toBeCloseTo(1, 12);
    for (const element of GENE) expect(element.end - element.start).toBeCloseTo(element.len, 12);
    expect(EXONS).toHaveLength(3);
    expect(INTRONS).toHaveLength(2);
  });
  it('has introns that outrun its exons, as a real gene does, without hiding the exons', () => {
    expect(EXON_SHARE).toBeCloseTo(EXONS.reduce((total, exon) => total + exon.len, 0), 12);
    expect(EXON_SHARE).toBeGreaterThan(0.3);
    expect(EXON_SHARE).toBeLessThan(0.5);
    for (const intron of INTRONS) for (const exon of EXONS) expect(intron.len).toBeGreaterThan(exon.len);
  });
  it('finds the element holding a fraction, and the last one holds the end', () => {
    expect(elementAt(0).id).toBe('E1');
    expect(elementAt(GENE[1].start + 1e-9).id).toBe('I1');
    expect(elementAt(GENE[1].end).id).toBe('E2');
    expect(elementAt(1).id).toBe('E3');
    expect(elementAt(-5).id).toBe('E1');
    expect(elementAt(7).id).toBe('E3');
    expect(elementAt(Number.NaN).id).toBe('E1');
  });
});

describe('the loop and its poster', () => {
  it('shows the poster at clock 0: the first intron half way out while the polymerase is on the second exon', () => {
    const state = computeSplice(0);
    expect(state.phase).toBeCloseTo(SPLICE_POSTER_PHASE, 12);
    expect(state.introns[0].m).toBeGreaterThan(0.3);
    expect(state.introns[0].m).toBeLessThan(0.7);
    expect(state.introns[0].spliceosome).toBeGreaterThan(0.99);
    expect(state.introns[1].m).toBe(0);
    expect(state.sigma).toBeGreaterThan(INTRONS[0].end);
    expect(state.sigma).toBeLessThan(1);
    expect(elementAt(state.sigma).id).toBe('E2');
    expect(state.cap).toBeGreaterThan(0.99);
    expect(state.rnaAlpha).toBeGreaterThan(0.99);
    expect(state.polAlpha).toBeGreaterThan(0.99);
    expect(state.polyA).toBe(0);
    expect(state.exportT).toBe(0);
  });
  it('is periodic, wraps negative time, and tolerates garbage clocks', () => {
    const base = computeSplice(0);
    expect(computeSplice(SPLICE_CYCLE).phase).toBeCloseTo(base.phase, 9);
    expect(computeSplice(-SPLICE_CYCLE).phase).toBeCloseTo(base.phase, 9);
    expect(computeSplice(37 * SPLICE_CYCLE + 1.5).phase).toBeCloseTo(computeSplice(1.5).phase, 7);
    for (const time of [Number.NaN, Infinity, -Infinity]) {
      const state = computeSplice(time);
      for (const value of [state.phase, state.sigma, state.polX, state.tipX, state.excised])
        expect(Number.isFinite(value)).toBe(true);
      expect(state.phase).toBeGreaterThanOrEqual(0);
      expect(state.phase).toBeLessThan(1);
    }
  });
  it('keeps every phase in [0, 1) even when rounding would land exactly on 1', () => {
    for (const time of [-1e-17, -1e-12, SPLICE_CYCLE * (1 - SPLICE_POSTER_PHASE) - 1e-13]) {
      const { phase } = computeSplice(time);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });
  it('moves every scalar continuously over the whole loop, so nothing pops', () => {
    const steps = 4000;
    const fields = [
      'sigma',
      'polX',
      'tipX',
      'excised',
      'rnaAlpha',
      'polAlpha',
      'cap',
      'polyA',
      'exportT',
    ] as const;
    let previous = atPhase(0);
    const worst: Record<string, number> = {};
    for (let i = 1; i < steps; i++) {
      const state = atPhase(i / steps);
      for (const field of fields)
        worst[field] = Math.max(worst[field] ?? 0, Math.abs(state[field] - previous[field]));
      for (let k = 0; k < 2; k++)
        for (const field of ['m', 'assemble', 'release', 'spliceosome', 'chord'] as const)
          worst[`${field}${k}`] = Math.max(
            worst[`${field}${k}`] ?? 0,
            Math.abs(state.introns[k][field] - previous.introns[k][field])
          );
      previous = state;
    }
    // The quickest ramp in the model is 0.03 of a loop (the cap, and the RNA fading in), and a
    // smoothstep over it has slope 1.5 / 0.03 = 50 per unit phase, so one 1/4000 step moves it by
    // 0.0125 at most. A pop is a jump of order 1, which is a hundred times that.
    for (const [field, step] of Object.entries(worst))
      expect(step, field).toBeLessThan(field.startsWith('chord') ? 0.01 : 0.015);
  });
  it('makes the loop wrap invisible: the RNA and the polymerase are gone at phase 0 and 1', () => {
    for (const phase of [0, 1 - 1e-9]) {
      const state = atPhase(phase);
      expect(state.rnaAlpha, `rna at ${phase}`).toBeLessThan(0.001);
      expect(state.polAlpha, `pol at ${phase}`).toBeLessThan(0.001);
    }
    const particles = createMorphParticles(1200);
    for (const phase of [0, 1 - 1e-9]) {
      const out = point();
      for (const p of particles) {
        sampleRnaParticle(p, clockAt(phase), out);
        // Only the template (a static helix that is there before and after) may be drawn.
        if (p.u >= 0.62 && p.u < 0.8) continue;
        expect(out.alpha, `u=${p.u.toFixed(2)} at phase ${phase}`).toBeLessThan(0.015);
      }
    }
  });
});

describe('the story the loop tells', () => {
  const phases = sweep(2000);
  it('splices co-transcriptionally: an intron loops out while the polymerase is still transcribing', () => {
    let found = 0;
    for (const phase of phases) {
      const state = atPhase(phase);
      if (state.sigma > 0 && state.sigma < 1 && state.introns.some((i) => i.m > 0.05 && i.m < 0.95)) found++;
    }
    expect(found).toBeGreaterThan(200);
    // Named: halfway through intron 1's loop-out the polymerase has passed its end and is not finished.
    const mid = atPhase(catalysisPhase(0) + LOOP_OUT_SPAN / 2);
    expect(mid.sigma).toBeGreaterThan(INTRONS[0].end);
    expect(mid.sigma).toBeLessThan(1);
    expect(mid.introns[0].m).toBeCloseTo(0.5, 6);
  });
  it('never cuts an intron before its 3′ end exists, and never gathers on RNA that is not there', () => {
    for (const phase of phases) {
      const state = atPhase(phase);
      for (let k = 0; k < 2; k++) {
        const intron = state.introns[k];
        if (intron.m > 0) expect(state.sigma, `m>0 at ${phase}`).toBeGreaterThanOrEqual(INTRONS[k].end);
        if (intron.assemble > 0) expect(state.sigma, `assemble at ${phase}`).toBeGreaterThan(INTRONS[k].start);
        // The lariat leaves only once the exons are joined.
        if (intron.release > 0) expect(intron.m, `release at ${phase}`).toBe(1);
      }
    }
  });
  it('does the introns one after the other, in transcript order', () => {
    expect(catalysisPhase(0) + LOOP_OUT_SPAN).toBeLessThan(catalysisPhase(1));
    expect(phaseOfSigma(INTRONS[0].end)).toBeLessThan(phaseOfSigma(INTRONS[1].end));
    expect(catalysisPhase(0)).toBeGreaterThan(phaseOfSigma(INTRONS[0].end));
    expect(catalysisPhase(1)).toBeGreaterThan(phaseOfSigma(INTRONS[1].end));
  });
  it('ends with both introns gone, the exons joined, a cap and a tail, centred on the gene', () => {
    const hold = atPhase(0.88);
    expect(hold.introns[0].m).toBe(1);
    expect(hold.introns[1].m).toBe(1);
    expect(hold.excised).toBeCloseTo(1 - EXON_SHARE, 12);
    expect(hold.cap).toBeGreaterThan(0.99);
    expect(hold.polyA).toBeGreaterThan(0.99);
    const five = point(),
      three = point();
    rnaPoint(0, hold, five);
    rnaPoint(1, hold, three);
    // As long as the exons, and the middle of the gene is the middle of the mRNA.
    expect(three.x - five.x).toBeCloseTo(GENE_WIDTH * EXON_SHARE, 9);
    expect((three.x + five.x) / 2).toBeCloseTo((GENE_X0 + GENE_X1) / 2, 9);
  });
  it('joins the exons: nothing separates one from the next once the intron is out', () => {
    const hold = atPhase(0.88);
    const end = point(),
      next = point();
    for (let k = 0; k < 2; k++) {
      rnaPoint(EXONS[k].end - 1e-12, hold, end);
      rnaPoint(EXONS[k + 1].start, hold, next);
      expect(Math.abs(next.x - end.x), `exon ${k + 1} to ${k + 2}`).toBeLessThan(1e-9);
    }
    // And before splicing the same two exons are a whole intron apart.
    const before = atPhase(phaseOfSigma(1) - 0.01 - 0.4);
    expect(before.introns[0].m).toBe(0);
    rnaPoint(EXONS[0].end - 1e-12, before, end);
    rnaPoint(EXONS[1].start, before, next);
    expect(next.x - end.x).toBeCloseTo(GENE_WIDTH * INTRONS[0].len, 6);
  });
  it('lays the unspliced RNA over the DNA it was copied from', () => {
    // Before any intron is cut the strand is co-linear with the template, up to the lag a cut gives.
    const early = atPhase(phaseOfSigma(0.3));
    expect(early.excised).toBe(0);
    const out = point();
    for (const g of [0, 0.05, 0.1, 0.2, 0.3]) {
      rnaPoint(g, early, out);
      expect(out.x).toBeCloseTo(GENE_X0 + GENE_WIDTH * g, 9);
    }
    expect(early.polX).toBeCloseTo(GENE_X0 + GENE_WIDTH * 0.3, 9);
    expect(early.tipX).toBeCloseTo(early.polX, 9);
  });
  it('keeps the growing end within reach of the polymerase: the lag is half of what has been cut', () => {
    for (const phase of phases) {
      const state = atPhase(phase);
      expect(state.polX - state.tipX).toBeCloseTo(state.shift, 9);
      expect(state.shift).toBeCloseTo((GENE_WIDTH * state.excised) / 2, 12);
      // At most half of everything the introns hold, which is when both are out.
      expect(state.shift).toBeLessThanOrEqual((GENE_WIDTH * (1 - EXON_SHARE)) / 2 + 1e-12);
    }
  });
});

describe('an intron is a circular arc of conserved length that closes into a lariat', () => {
  const arcLength = (state: SpliceState, k: number): number => {
    const a = point(),
      b = point();
    let total = 0;
    intronPoint(state, k, 0, a);
    for (let i = 1; i <= 800; i++) {
      intronPoint(state, k, i / 800, b);
      total += Math.hypot(b.x - a.x, b.y - a.y);
      a.x = b.x;
      a.y = b.y;
    }
    return total;
  };
  it('keeps its length however far the chord has closed', () => {
    for (let k = 0; k < 2; k++) {
      for (let step = 0; step <= 20; step++) {
        const state = atPhase(catalysisPhase(k) + (LOOP_OUT_SPAN * step) / 20);
        const intron = state.introns[k];
        expect(arcLength(state, k), `intron ${k + 1} at m=${intron.m.toFixed(2)}`).toBeCloseTo(
          intron.length,
          2
        );
      }
    }
  });
  it('starts as a straight line along the row and ends as a closed circle', () => {
    for (let k = 0; k < 2; k++) {
      const flat = atPhase(catalysisPhase(k) - 0.1);
      expect(flat.introns[k].m).toBe(0);
      const out = point();
      for (let i = 0; i <= 10; i++) {
        intronPoint(flat, k, i / 10, out);
        expect(out.y).toBeCloseTo(Y_RNA, 9);
      }
      const closed = atPhase(catalysisPhase(k) + LOOP_OUT_SPAN);
      const intron = closed.introns[k];
      expect(intron.m).toBe(1);
      const first = point(),
        last = point();
      intronPoint(closed, k, 0, first);
      intronPoint(closed, k, 1, last);
      // A loop: its two ends meet at the junction, and it sits on the row with its radius from the length.
      expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeLessThan(0.002);
      expect(intron.radius).toBeCloseTo(intron.length / (2 * Math.PI), 3);
      expect(intron.theta).toBeGreaterThan(Math.PI - 0.02);
      let top = Infinity;
      for (let i = 0; i <= 200; i++) {
        intronPoint(closed, k, i / 200, out);
        top = Math.min(top, out.y);
        expect(out.y).toBeGreaterThan(Y_RNA - 2 * intron.radius - 1e-6);
      }
      expect(Y_RNA - top).toBeCloseTo(2 * intron.radius, 2);
    }
  });
  it('bulges up and past its own chord on the way (the omega shape) and never dips below the row', () => {
    const out = point();
    for (let k = 0; k < 2; k++) {
      let widest = 0;
      for (let step = 0; step <= 40; step++) {
        const state = atPhase(catalysisPhase(k) + (LOOP_OUT_SPAN * step) / 40);
        const intron = state.introns[k];
        let minX = Infinity,
          maxX = -Infinity;
        for (let i = 0; i <= 100; i++) {
          intronPoint(state, k, i / 100, out);
          expect(out.y).toBeLessThanOrEqual(Y_RNA + 1e-9);
          minX = Math.min(minX, out.x);
          maxX = Math.max(maxX, out.x);
        }
        if (intron.theta > Math.PI / 2) widest = Math.max(widest, maxX - minX - intron.chord);
      }
      expect(widest, `intron ${k + 1} overhangs its chord`).toBeGreaterThan(0.01);
    }
  });
  it('ties the arc to the exons it joins: its ends are the splice sites', () => {
    const out = point();
    for (let k = 0; k < 2; k++) {
      for (const phase of [catalysisPhase(k) - 0.05, catalysisPhase(k) + 0.04, catalysisPhase(k) + 0.1]) {
        const state = atPhase(phase);
        const intron = state.introns[k];
        const five = point(),
          three = point();
        intronPoint(state, k, 0, five);
        intronPoint(state, k, 1, three);
        expect(five.x).toBeCloseTo(intron.x0, 6);
        expect(three.x).toBeCloseTo(intron.x0 + intron.chord, 6);
        rnaPoint(GENE[1 + 2 * k].start - 1e-12, state, out);
        expect(out.x).toBeCloseTo(intron.x0, 5);
      }
    }
  });
  it('sends the lariat up and away only after it has closed, and draws it on a different side each time', () => {
    const closed = atPhase(catalysisPhase(0) + LOOP_OUT_SPAN);
    const gone = atPhase(catalysisPhase(0) + LOOP_OUT_SPAN + 0.1);
    expect(closed.introns[0].release).toBe(0);
    expect(gone.introns[0].release).toBe(1);
    const a = point(),
      b = point();
    intronPoint(closed, 0, 0.5, a);
    intronPoint(gone, 0, 0.5, b);
    expect(b.y).toBeLessThan(a.y - 0.1);
    const left = point(),
      right = point();
    intronPoint(atPhase(catalysisPhase(0) + LOOP_OUT_SPAN + 0.1), 0, 0.5, left);
    intronPoint(atPhase(catalysisPhase(1) + LOOP_OUT_SPAN + 0.1), 1, 0.5, right);
    expect(Math.sign(left.x - a.x)).not.toBe(Math.sign(right.x - gone.introns[1].x0));
  });
});

describe('the particles', () => {
  const particles = createMorphParticles(3200);
  const out = point();
  it('are finite and inside the frame at every moment of the loop', () => {
    // Tallied and asserted once: an expect() per sample is a million calls and the slowest test here.
    let finite = true;
    const seen = { x: 0, zAbs: 0, yMin: Infinity, yMax: -Infinity, alphaMin: Infinity, alphaMax: -Infinity };
    for (const phase of sweep(48)) {
      for (const p of particles) {
        sampleRnaParticle(p, clockAt(phase), out);
        if (!(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z) && Number.isFinite(out.alpha)))
          finite = false;
        seen.x = Math.max(seen.x, Math.abs(out.x));
        seen.zAbs = Math.max(seen.zAbs, Math.abs(out.z));
        seen.yMin = Math.min(seen.yMin, out.y);
        seen.yMax = Math.max(seen.yMax, out.y);
        seen.alphaMin = Math.min(seen.alphaMin, out.alpha);
        seen.alphaMax = Math.max(seen.alphaMax, out.alpha);
      }
    }
    expect(finite).toBe(true);
    expect(seen.x).toBeLessThanOrEqual(1.1);
    expect(seen.yMin).toBeGreaterThan(-0.55);
    expect(seen.yMax).toBeLessThan(0.55);
    expect(seen.zAbs).toBeLessThanOrEqual(0.2);
    expect(seen.alphaMin).toBeGreaterThanOrEqual(0);
    expect(seen.alphaMax).toBeLessThanOrEqual(1);
  });
  it('are shared out among the strand, the template, the polymerase and the spliceosomes', () => {
    const share = (test: (u: number) => boolean) =>
      particles.filter((p) => test(p.u)).length / particles.length;
    expect(share((u) => u < 0.62)).toBeGreaterThan(0.58);
    expect(share((u) => u < 0.62)).toBeLessThan(0.66);
    expect(share((u) => u >= 0.62 && u < 0.8)).toBeGreaterThan(0.15);
    expect(share((u) => u >= 0.8 && u < 0.9)).toBeGreaterThan(0.07);
    expect(share((u) => u >= 0.9)).toBeGreaterThan(0.07);
  });
  it('colour exons accent and introns warm, the template and polymerase ink, the spliceosome warm', () => {
    const classes = { 0: 0, 1: 0, 2: 0 };
    for (const p of particles) {
      const colour = rnaDotClass(p);
      classes[colour]++;
      if (p.u < 0.62) expect(colour).toBe(elementAt(p.t).kind === 'exon' ? 0 : 2);
      else if (p.u < 0.9) expect(colour).toBe(1);
      else expect(colour).toBe(2);
    }
    expect(classes[0]).toBeGreaterThan(300);
    expect(classes[1]).toBeGreaterThan(800);
    expect(classes[2]).toBeGreaterThan(500);
  });
  it('are a function of the clock alone: the same time gives the same point after other times', () => {
    const p = particles[1234];
    const first = point();
    sampleRnaParticle(p, 3.7, first);
    const scratch = point();
    for (const time of [0, 9.1, -4, 3.7001, 55]) sampleRnaParticle(p, time, scratch);
    const again = point();
    sampleRnaParticle(p, 3.7, again);
    expect(again).toEqual(first);
  });
  it('draw the template as a double helix along the gene, wherever the polymerase is', () => {
    const state = atPhase(0.5);
    const strands: number[][] = [[], []];
    for (const p of particles) {
      if (!(p.u >= 0.62 && p.u < 0.8)) continue;
      sampleRnaParticle(p, clockAt(0.5), out);
      expect(out.x).toBeGreaterThanOrEqual(GENE_X0 - 1e-9);
      expect(out.x).toBeLessThanOrEqual(GENE_X1 + 1e-9);
      expect(Math.abs(out.y - Y_TEMPLATE)).toBeLessThanOrEqual(0.0451);
      strands[p.v < 0.5 ? 0 : 1].push(out.y);
    }
    expect(strands[0].length).toBeGreaterThan(100);
    expect(strands[1].length).toBeGreaterThan(100);
    // Two strands half a turn apart: opposite sides of the axis at the same position.
    const a = point(),
      b = point();
    for (const g of [0.1, 0.4, 0.8]) {
      templatePoint(g, 0, state, a);
      templatePoint(g, 1, state, b);
      expect((a.y - Y_TEMPLATE) + (b.y - Y_TEMPLATE)).toBeCloseTo(0, 9);
      expect(a.x).toBe(b.x);
    }
  });
  it('make a continuous mature mRNA of exons only, with the lariats gone', () => {
    const phase = 0.91;
    const state = atPhase(phase);
    const xs: number[] = [];
    let lariatsVisible = 0;
    for (const p of particles) {
      if (p.u >= 0.62) continue;
      sampleRnaParticle(p, clockAt(phase), out);
      if (out.alpha < 0.015) continue;
      if (elementAt(p.t).kind === 'exon') xs.push(out.x);
      else lariatsVisible++;
    }
    expect(lariatsVisible).toBe(0);
    expect(xs.length).toBeGreaterThan(400);
    xs.sort((m, n) => m - n);
    let worst = 0;
    for (let i = 1; i < xs.length; i++) worst = Math.max(worst, xs[i] - xs[i - 1]);
    expect(worst, 'a hole in the finished mRNA').toBeLessThan(0.02);
    const five = point(),
      three = point();
    rnaPoint(0, state, five);
    rnaPoint(1, state, three);
    expect(xs[0]).toBeGreaterThan(five.x - 0.03);
    expect(xs[xs.length - 1]).toBeLessThan(three.x + 0.03);
  });
  it('let the newest RNA draw itself as the polymerase passes, and nothing ahead of it', () => {
    const state = atPhase(0.3);
    let ahead = 0;
    let behind = 0;
    for (const p of particles) {
      if (p.u >= 0.62) continue;
      sampleRnaParticle(p, clockAt(0.3), out);
      if (p.t > state.sigma + 1e-9) {
        if (out.alpha > 0.015) ahead++;
      } else if (p.t < state.sigma - 0.04 && out.alpha > 0.015) behind++;
    }
    expect(ahead).toBe(0);
    expect(behind).toBeGreaterThan(100);
  });
  it('gather a spliceosome at each neck only while its intron is being cut', () => {
    const mid = atPhase(catalysisPhase(0) + LOOP_OUT_SPAN / 2);
    expect(mid.introns[0].spliceosome).toBeGreaterThan(0.99);
    expect(mid.introns[1].spliceosome).toBe(0);
    let first = 0,
      second = 0;
    for (const p of particles) {
      if (p.u < 0.9) continue;
      sampleRnaParticle(p, clockAt(catalysisPhase(0) + LOOP_OUT_SPAN / 2), out);
      if (out.alpha > 0.015) (p.v < 0.5 ? first++ : second++);
    }
    expect(first).toBeGreaterThan(40);
    expect(second).toBe(0);
  });
});

describe('the thread, the sparks and the captions', () => {
  it('runs the stalk from the growing end of the RNA into the polymerase', () => {
    for (const phase of [0.2, 0.42, 0.6, 0.72]) {
      const state = atPhase(phase);
      const start = point(),
        end = point();
      stalkPoint(0, state, start);
      stalkPoint(1, state, end);
      expect(start.x).toBeCloseTo(state.tipX, 9);
      expect(start.y).toBeCloseTo(Y_RNA, 9);
      expect(end.x).toBeCloseTo(state.polX + 0.015, 9);
      expect(end.y).toBeGreaterThan(start.y);
      const middle = point();
      stalkPoint(0.5, state, middle);
      expect(middle.x).toBeGreaterThanOrEqual(Math.min(start.x, end.x) - 1e-9);
      expect(middle.x).toBeLessThanOrEqual(Math.max(start.x, end.x) + 1e-9);
    }
  });
  it('throws sparks only as the exons ligate, near the spliceosome, and never more than the budget', () => {
    const out = point();
    for (let k = 0; k < 2; k++) {
      let burst = 0;
      for (const phase of sweep(1000)) {
        const state = atPhase(phase);
        for (let i = 0; i < SPARKS_PER_INTRON; i++) {
          spliceSpark(state, k, i, out);
          expect(out.alpha).toBeGreaterThanOrEqual(0);
          expect(out.alpha).toBeLessThanOrEqual(1);
          if (out.alpha > 0.05) {
            burst++;
            expect(state.introns[k].m).toBeGreaterThan(0.79);
            const centre = point();
            // The neck, give or take the burst's radius.
            expect(out.y).toBeLessThan(Y_RNA + 0.1);
            expect(Math.abs(out.x - (state.introns[k].x0 + state.introns[k].chord / 2))).toBeLessThan(0.1);
            void centre;
          }
        }
      }
      expect(burst, `intron ${k + 1} has a burst`).toBeGreaterThan(SPARKS_PER_INTRON);
    }
    expect(SPARKS_PER_INTRON * 2).toBeLessThanOrEqual(12);
  });
  it('captions what is on screen and only what is on screen', () => {
    const labels = (phase: number) => spliceAnchors(atPhase(phase)).map((anchor) => anchor.label);
    const poster = labels(SPLICE_POSTER_PHASE);
    for (const label of ['RNA Pol II', 'exon', '5′ cap', 'spliceosome', 'intron (lariat)'])
      expect(poster).toContain(label);
    expect(poster).not.toContain('poly-A tail');
    const hold = labels(0.88);
    expect(hold).toContain('poly-A tail');
    expect(hold).toContain('5′ cap');
    expect(hold).not.toContain('RNA Pol II');
    expect(hold).not.toContain('spliceosome');
    expect(labels(0)).toEqual([]);
    for (const anchor of spliceAnchors(atPhase(0.5))) {
      expect(Number.isFinite(anchor.x) && Number.isFinite(anchor.y)).toBe(true);
      expect(['above', 'below']).toContain(anchor.side);
    }
  });
  it('allocates nothing new for a state when given one to fill', () => {
    const into = newSpliceState();
    const back = computeSplice(2.5, into);
    expect(back).toBe(into);
    expect(into.introns).toHaveLength(2);
    expect(POLY_A_COUNT).toBe(12);
  });
});
