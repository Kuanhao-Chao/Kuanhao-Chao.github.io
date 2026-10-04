import { describe, expect, it } from 'vitest';
import { createMorphParticles, type MorphPoint } from './morphModel';
import {
  ATTN_X0,
  ATTN_X1,
  BY_WEIGHT,
  HOT_COUNT,
  HUB_X,
  NODE_SHARE,
  PULSE_SLOTS,
  SITES,
  TRACK_SHARE,
  Y_SEQ,
  arcAlpha,
  arcHeight,
  arcIndex,
  arcPoint,
  arcSpan,
  arcWidth,
  attentionAnchors,
  attentionDotClass,
  nodeIndex,
  nodeRadius,
  pulseEnvelope,
  sampleAttentionParticle,
} from './morphAttention';
import { sampleLocusParticle } from './morphLocus';

const point = (): MorphPoint => ({ x: 0, y: 0, z: 0, alpha: 1 });
const particles = createMorphParticles(3200);

describe('attention weights', () => {
  it('are nine positive shares that sum to one', () => {
    expect(SITES).toHaveLength(9);
    for (const site of SITES) expect(site.weight).toBeGreaterThan(0);
    expect(SITES.reduce((sum, site) => sum + site.weight, 0)).toBeCloseTo(1, 12);
  });
  it('let a few sites take most of the attention, and mark exactly the strongest as hot', () => {
    const sorted = [...SITES].sort((a, b) => b.weight - a.weight);
    expect(sorted[0].weight).toBeGreaterThan(0.2);
    expect(sorted[0].weight).toBeLessThan(0.35);
    const top = sorted.slice(0, HOT_COUNT).reduce((sum, site) => sum + site.weight, 0);
    expect(top).toBeGreaterThan(0.55);
    expect(SITES.filter((site) => site.hot)).toHaveLength(HOT_COUNT);
    for (const site of SITES) expect(site.hot).toBe(site.weight >= sorted[HOT_COUNT - 1].weight);
  });
  it('order the sites strongest first without losing any', () => {
    expect([...BY_WEIGHT].sort((a, b) => a - b)).toEqual(SITES.map((_, k) => k));
    for (let i = 1; i < BY_WEIGHT.length; i++)
      expect(SITES[BY_WEIGHT[i - 1]].weight).toBeGreaterThanOrEqual(SITES[BY_WEIGHT[i]].weight);
  });
  it('sit in sequence order inside the frame, on both sides of the promoter', () => {
    for (let k = 1; k < SITES.length; k++) expect(SITES[k].x).toBeGreaterThan(SITES[k - 1].x);
    for (const site of SITES) {
      expect(site.x).toBeGreaterThanOrEqual(ATTN_X0);
      expect(site.x).toBeLessThanOrEqual(ATTN_X1);
      expect(site.x).not.toBe(HUB_X);
    }
    expect(SITES.some((site) => site.x < HUB_X)).toBe(true);
    expect(SITES.some((site) => site.x > HUB_X)).toBe(true);
    // The strongest three are not all on one side, so the picture is not lopsided.
    const hot = SITES.filter((site) => site.hot);
    expect(hot.some((site) => site.x < HUB_X)).toBe(true);
    expect(hot.some((site) => site.x > HUB_X)).toBe(true);
  });
});

describe('arcs', () => {
  it('run from the promoter to their site, over the sequence, in a half-ellipse', () => {
    const out = point();
    SITES.forEach((site, k) => {
      arcPoint(k, 0, out);
      expect(out.x).toBeCloseTo(HUB_X, 12);
      expect(out.y).toBeCloseTo(Y_SEQ, 12);
      arcPoint(k, 1, out);
      expect(out.x).toBeCloseTo(site.x, 12);
      expect(out.y).toBeCloseTo(Y_SEQ, 12);
      arcPoint(k, 0.5, out);
      expect(out.x).toBeCloseTo((HUB_X + site.x) / 2, 12);
      expect(out.y).toBeCloseTo(Y_SEQ - arcHeight(k), 12);
      for (let i = 0; i <= 40; i++) {
        arcPoint(k, i / 40, out);
        expect(out.y).toBeLessThanOrEqual(Y_SEQ + 1e-12);
        expect(out.y).toBeGreaterThanOrEqual(Y_SEQ - arcHeight(k) - 1e-12);
      }
    });
  });
  it('are mirror images about the midpoint of their span', () => {
    const a = point();
    const b = point();
    SITES.forEach((site, k) => {
      for (let i = 0; i <= 20; i++) {
        arcPoint(k, i / 20, a);
        arcPoint(k, 1 - i / 20, b);
        expect(a.x + b.x).toBeCloseTo(HUB_X + site.x, 12);
        expect(a.y).toBeCloseTo(b.y, 12);
      }
    });
  });
  it('rise higher the further they reach, capped, and stay inside the frame', () => {
    const bySpan = SITES.map((_, k) => k).sort((a, b) => arcSpan(a) - arcSpan(b));
    for (let i = 1; i < bySpan.length; i++)
      expect(arcHeight(bySpan[i])).toBeGreaterThanOrEqual(arcHeight(bySpan[i - 1]));
    for (let k = 0; k < SITES.length; k++) {
      expect(arcHeight(k)).toBeGreaterThan(0.1);
      expect(arcHeight(k)).toBeLessThanOrEqual(0.72);
      expect(Y_SEQ - arcHeight(k)).toBeGreaterThanOrEqual(-0.46);
    }
  });
  it('are drawn bolder with more attention, in both width and opacity', () => {
    for (let i = 1; i < BY_WEIGHT.length; i++) {
      const strong = BY_WEIGHT[i - 1];
      const weak = BY_WEIGHT[i];
      expect(arcWidth(strong)).toBeGreaterThanOrEqual(arcWidth(weak));
      expect(arcAlpha(strong)).toBeGreaterThanOrEqual(arcAlpha(weak));
    }
    for (let k = 0; k < SITES.length; k++) {
      expect(arcWidth(k)).toBeGreaterThan(0.7);
      expect(arcWidth(k)).toBeLessThan(4);
      expect(arcAlpha(k)).toBeGreaterThan(0.1);
      expect(arcAlpha(k)).toBeLessThanOrEqual(0.75);
    }
  });
});

describe('particles', () => {
  it('stay finite, inside the frame and visible', () => {
    const out = point();
    for (const p of particles) {
      sampleAttentionParticle(p, out);
      expect(Number.isFinite(out.x) && Number.isFinite(out.y) && out.z === 0).toBe(true);
      expect(out.x).toBeGreaterThanOrEqual(ATTN_X0 - 0.04);
      expect(out.x).toBeLessThanOrEqual(ATTN_X1 + 0.04);
      expect(out.y).toBeGreaterThan(-0.46);
      expect(out.y).toBeLessThan(0.36);
      expect(out.alpha).toBeGreaterThan(0);
      expect(out.alpha).toBeLessThanOrEqual(1);
    }
  });
  it('split into sequence, nodes and arcs in the shares the model declares', () => {
    const count = (test: (u: number) => boolean) => particles.filter((p) => test(p.u)).length;
    expect(count((u) => u < TRACK_SHARE) / particles.length).toBeCloseTo(TRACK_SHARE, 1);
    expect(count((u) => u >= TRACK_SHARE && u < NODE_SHARE) / particles.length).toBeCloseTo(
      NODE_SHARE - TRACK_SHARE,
      1
    );
    expect(count((u) => u >= NODE_SHARE) / particles.length).toBeCloseTo(1 - NODE_SHARE, 1);
  });
  it('lay the sequence on the baseline and the nodes on their sites', () => {
    const out = point();
    let hub = 0;
    let nodes = 0;
    const perNode = new Array<number>(SITES.length + 1).fill(0);
    for (const p of particles) {
      if (p.u < TRACK_SHARE) {
        sampleAttentionParticle(p, out);
        expect(Math.abs(out.y - Y_SEQ)).toBeLessThanOrEqual(0.0071);
      } else if (p.u < NODE_SHARE) {
        sampleAttentionParticle(p, out);
        const node = nodeIndex(p.t);
        perNode[node]++;
        nodes++;
        if (node === 0) hub++;
        const cx = node === 0 ? HUB_X : SITES[node - 1].x;
        expect(Math.hypot(out.x - cx, out.y - Y_SEQ)).toBeLessThanOrEqual(nodeRadius(node) + 1e-9);
      }
    }
    // The promoter is the biggest node and draws about the share it was given.
    expect(hub / nodes).toBeGreaterThan(0.3);
    expect(hub / nodes).toBeLessThan(0.5);
    expect(nodeRadius(0)).toBeGreaterThan(Math.max(...SITES.map((_, k) => nodeRadius(k + 1))));
    // A site with more attention draws more dots than the weakest.
    const strongest = BY_WEIGHT[0] + 1;
    const weakest = BY_WEIGHT[BY_WEIGHT.length - 1] + 1;
    expect(perNode[strongest]).toBeGreaterThan(perNode[weakest]);
  });
  it('lay arc dots on their own arc, in proportion to weight to the power 0.7', () => {
    const out = point();
    const counts = SITES.map(() => 0);
    let arcs = 0;
    for (const p of particles) {
      if (p.u < NODE_SHARE) continue;
      sampleAttentionParticle(p, out);
      arcs++;
      const k = arcIndex((p.u - NODE_SHARE) / (1 - NODE_SHARE));
      counts[k]++;
      // Against the ellipse of the arc it was drawn for: its band is thin next to the arc itself.
      const half = Math.abs(SITES[k].x - HUB_X) / 2;
      const centre = (HUB_X + SITES[k].x) / 2;
      const off = Math.abs(
        ((out.x - centre) / half) ** 2 + ((Y_SEQ - out.y) / arcHeight(k)) ** 2 - 1
      );
      expect(off).toBeLessThan(0.45);
      expect(out.y).toBeLessThanOrEqual(Y_SEQ + 0.03);
    }
    const shares = SITES.map((site) => site.weight ** 0.7);
    const total = shares.reduce((sum, share) => sum + share, 0);
    SITES.forEach((_, k) => {
      expect(counts[k] / arcs).toBeCloseTo(shares[k] / total, 1);
      expect(counts[k]).toBeGreaterThan(40);
    });
  });
  it('take the sequence’s ink, and the warm ink only for the promoter and the strongest sites', () => {
    const arcDots = particles.filter((p) => p.u >= NODE_SHARE);
    for (const p of particles) {
      const cls = attentionDotClass(p);
      expect([0, 1, 2]).toContain(cls);
      if (p.u < TRACK_SHARE) expect(cls).toBe(1);
      else if (p.u >= NODE_SHARE)
        expect(cls).toBe(SITES[arcIndex((p.u - NODE_SHARE) / (1 - NODE_SHARE))].hot ? 2 : 0);
    }
    const warm = arcDots.filter((p) => attentionDotClass(p) === 2).length / arcDots.length;
    // The three strongest of nine arcs hold well over half of the arc dots, and not all of them.
    expect(warm).toBeGreaterThan(0.45);
    expect(warm).toBeLessThan(0.8);
  });
  it('are deterministic', () => {
    const a = point();
    const b = point();
    for (const p of particles.slice(0, 400)) {
      sampleAttentionParticle(p, a);
      sampleAttentionParticle(p, b);
      expect(a).toEqual(b);
    }
  });
});

describe('the pulses', () => {
  it('give every arc one pulse and the strongest few a second, twelve in all', () => {
    expect(PULSE_SLOTS).toHaveLength(SITES.length + HOT_COUNT);
    const first = PULSE_SLOTS.filter(([, lane]) => lane === 0).map(([k]) => k);
    expect([...first].sort((a, b) => a - b)).toEqual(SITES.map((_, k) => k));
    const second = PULSE_SLOTS.filter(([, lane]) => lane === 1).map(([k]) => k);
    expect([...second].sort((a, b) => a - b)).toEqual(
      SITES.map((site, k) => (site.hot ? k : -1)).filter((k) => k >= 0)
    );
  });
  it('put the strongest arcs first, so a phone that draws six keeps what the picture is about', () => {
    const six = PULSE_SLOTS.slice(0, 2 * HOT_COUNT);
    expect(new Set(six.map(([k]) => k))).toEqual(new Set(BY_WEIGHT.slice(0, HOT_COUNT)));
    expect(six.filter(([, lane]) => lane === 1)).toHaveLength(HOT_COUNT);
  });
  it('fade in leaving the promoter and out arriving, and never leave 0..1', () => {
    expect(pulseEnvelope(0)).toBe(0);
    expect(pulseEnvelope(1)).toBe(0);
    expect(pulseEnvelope(0.5)).toBe(1);
    let previous = 0;
    for (let i = 0; i <= 100; i++) {
      const value = pulseEnvelope(i / 100);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      if (i <= 12) expect(value).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = value;
    }
    for (const bad of [Number.NaN, -3, 7, Infinity])
      expect(Number.isFinite(pulseEnvelope(bad))).toBe(true);
  });
});

describe('the captions', () => {
  it('name the promoter and the three strongest sites with their share', () => {
    const anchors = attentionAnchors();
    expect(anchors).toHaveLength(1 + HOT_COUNT);
    expect(anchors[0]).toMatchObject({ label: 'promoter', side: 'below', x: HUB_X });
    const labels = anchors.slice(1).map((anchor) => anchor.label);
    BY_WEIGHT.slice(0, HOT_COUNT).forEach((k, rank) => {
      const percent = `${Math.round(SITES[k].weight * 100)}%`;
      expect(labels[rank]).toBe(rank === 0 ? `${percent} · strongest` : percent);
      // Each sits under its own site.
      expect(anchors[rank + 1].x).toBe(SITES[k].x);
    });
  });
  it('all hang under the sequence, clear of the arcs, inside the frame', () => {
    for (const anchor of attentionAnchors()) {
      expect(anchor.side).toBe('below');
      expect(anchor.y).toBeGreaterThan(Y_SEQ);
      expect(anchor.x).toBeGreaterThanOrEqual(ATTN_X0);
      expect(anchor.x).toBeLessThanOrEqual(ATTN_X1);
    }
  });
  it('give the strongest caption a shorter form for the room a phone leaves beside the promoter', () => {
    const anchors = attentionAnchors();
    const strongest = anchors[1];
    expect(strongest.short).toBe(strongest.label.split(' · ')[0]);
    expect(strongest.room).toBeGreaterThan(0);
    // The room is less than the distance from the promoter to that site, so the two captions fit.
    expect(strongest.room!).toBeLessThan(Math.abs(strongest.x - HUB_X));
    for (const anchor of anchors.filter((a) => a !== strongest))
      expect(anchor.short).toBeUndefined();
  });
});

// Stages 5 and 7 were too alike: both were a baseline under a single hill, and their occupancy
// overlapped by 0.610 on this grid. The pair that replaced them is held apart by what they ARE.
describe('stage 7 against stage 5', () => {
  const COLUMNS = 48;
  const ROWS = 24;
  type Sampler = (p: (typeof particles)[number], out: MorphPoint) => void;
  const occupancy = (dots: typeof particles, sample: Sampler) => {
    const cells = new Uint16Array(COLUMNS * ROWS);
    const out = point();
    for (const p of dots) {
      sample(p, out);
      const column = Math.floor(((out.x + 1) / 2) * COLUMNS);
      const row = Math.floor((out.y + 0.5) * ROWS);
      if (column >= 0 && column < COLUMNS && row >= 0 && row < ROWS)
        cells[row * COLUMNS + column]++;
    }
    // A cell counts as occupied with two or more dots in it, so a stray dot is not a shape.
    return cells.map((count) => (count >= 2 ? 1 : 0));
  };
  const overlap = (dots: typeof particles): number => {
    const coverage = occupancy(dots, sampleLocusParticle);
    const attention = occupancy(dots, sampleAttentionParticle);
    let both = 0;
    let either = 0;
    for (let i = 0; i < coverage.length; i++) {
      both += coverage[i] & attention[i];
      either += coverage[i] | attention[i];
    }
    return both / either;
  };
  it('overlap less than a third as much as the old pair did (0.610), at desktop and phone counts', () => {
    // Measured 0.205 with 3,200 dots and 0.137 with 1,000: the gate sits well clear of both.
    expect(overlap(particles)).toBeLessThan(0.3);
    expect(overlap(createMorphParticles(1000))).toBeLessThan(0.3);
  });
  it('put their arcs on opposite sides of the baseline they stand on', () => {
    const out = point();
    let above = 0;
    let arcs = 0;
    for (const p of particles) {
      if (p.u < NODE_SHARE) continue;
      sampleAttentionParticle(p, out);
      arcs++;
      if (out.y <= Y_SEQ) above++;
    }
    expect(above / arcs).toBeGreaterThan(0.99);
    let below = 0;
    let reads = 0;
    for (const p of particles) {
      sampleLocusParticle(p, out);
      if (p.u < 0.72) continue;
      reads++;
      if (out.y >= 0.06) below++;
    }
    expect(below / reads).toBeGreaterThan(0.95);
  });
});
