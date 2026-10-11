import { describe, expect, it } from 'vitest';
import {
  RAP1_SOURCE,
  MOTIF_COLUMNS,
  MOTIF_ATTENTION,
  motifLinks,
  motifLinkPoint,
  motifX,
  MOTIF_RAIL,
  sampleMotifParticle,
  motifPositionAt,
  MOTIF_GLYPHS,
} from './morphFinale';
import { createMorphParticles, sampleMorphTarget, sampleMorph } from './morphModel';
import { sampleAttentionParticle } from './morphAttention';

describe('published Rap1 sequence logo', () => {
  it('pins the twelve-position MA0359.3 matrix without mixing up base order', () => {
    expect(RAP1_SOURCE.id).toBe('MA0359.3');
    expect(MOTIF_COLUMNS.map((column) => column.consensus).join('')).toBe('ATGTATGGGTGT');
    expect(MOTIF_COLUMNS[0].counts).toEqual([200, 10, 105, 21]);
    expect(MOTIF_COLUMNS[11].counts).toEqual([27, 48, 24, 237]);
    expect(MOTIF_COLUMNS.map((c) => c.counts)).toEqual([
      [200, 10, 105, 21],
      [3, 4, 39, 290],
      [4, 5, 317, 10],
      [13, 27, 4, 292],
      [214, 36, 51, 35],
      [9, 54, 0, 273],
      [6, 0, 327, 3],
      [0, 0, 318, 18],
      [48, 5, 281, 2],
      [1, 5, 2, 328],
      [3, 18, 264, 51],
      [27, 48, 24, 237],
    ]);
    expect(MOTIF_COLUMNS[0].information).toBeCloseTo(0.6291854467, 9);
    for (const column of MOTIF_COLUMNS) {
      expect(column.counts.reduce((a, b) => a + b)).toBe(336);
      expect(column.letters.reduce((sum, letter) => sum + letter.bits, 0)).toBeCloseTo(
        column.information,
        12
      );
      expect(
        column.letters.every((letter) => Number.isFinite(letter.bits) && letter.bits >= 0)
      ).toBe(true);
    }
  });
});

describe('directed motif attention', () => {
  it('masks self attention and keeps outgoing rows normalized, without renormalizing incoming links', () => {
    for (let i = 0; i < 12; i++) {
      expect(MOTIF_ATTENTION[i][i]).toBe(0);
      expect(MOTIF_ATTENTION[i].reduce((a, b) => a + b)).toBeCloseTo(1, 12);
      expect(MOTIF_ATTENTION[i].every((w) => w >= 0 && Number.isFinite(w))).toBe(true);
      for (const link of motifLinks(i, false)) {
        expect(link.weight).toBe(MOTIF_ATTENTION[link.from][link.to]);
        expect(link.from === i).toBe(link.direction === 'outgoing');
        expect(link.to === i).toBe(link.direction === 'incoming');
      }
      expect(motifLinks(i, false).filter((l) => l.direction === 'outgoing')).toHaveLength(2);
      expect(motifLinks(i, true)).toHaveLength(2);
    }
    expect(MOTIF_ATTENTION[0][1]).not.toBe(MOTIF_ATTENTION[1][0]);
    expect(MOTIF_ATTENTION[0][7]).toBeCloseTo(0.305781178914, 11);
    expect(MOTIF_ATTENTION[7][0]).toBeCloseTo(0.697357220671, 11);
    expect(motifLinks(0).map((l) => [l.from, l.to])).toEqual([
      [0, 7],
      [0, 8],
      [8, 0],
      [7, 0],
    ]);
    expect(motifLinks(NaN)).toHaveLength(3);
    expect(motifLinks(-1)).toHaveLength(3);
    expect(motifLinks(12)).toHaveLength(3);
  });
  it('anchors arrows at their real source and destination and separates reciprocal curves', () => {
    const out = { x: 0, y: 0, z: 0, alpha: 0 };
    const links = motifLinks(0);
    for (const link of links) {
      motifLinkPoint(link, 0, out);
      expect(out.x).toBe(motifX(link.from));
      expect(out.y).toBe(MOTIF_RAIL);
      motifLinkPoint(link, 1, out);
      expect(out.x).toBeCloseTo(motifX(link.to), 12);
      expect(out.y).toBeCloseTo(MOTIF_RAIL, 12);
    }
    motifLinkPoint(links[0], 0.5, out);
    const outgoingY = out.y;
    motifLinkPoint(links[3], 0.5, out);
    expect(out.y).toBeCloseTo(outgoingY - 0.05, 12);
  });
});

describe('motif geometry', () => {
  it('keeps letters and particles deterministic, inside the logo, and legible at reduced density', () => {
    const a = { x: 0, y: 0, z: 0, alpha: 0 },
      b = { ...a };
    const columns = new Set<number>();
    for (const p of createMorphParticles(1000).filter((p) => p.rank < 0.3)) {
      sampleMotifParticle(p, a);
      sampleMotifParticle(p, b);
      expect(a).toEqual(b);
      expect(Math.abs(a.x)).toBeLessThan(1.2);
      expect(a.y).toBeGreaterThan(-0.3);
      expect(a.y).toBeLessThan(0.47);
      expect(a.alpha).toBeGreaterThan(0.1);
      columns.add(motifPositionAt(a.x, a.y));
    }
    expect(columns.size).toBe(12);
    expect(columns.has(-1)).toBe(false);
    expect(motifPositionAt(-10, 0)).toBe(-1);
    expect(motifPositionAt(0, 10)).toBe(-1);
    expect(motifPositionAt(NaN, 0)).toBe(-1);
    expect(MOTIF_GLYPHS.some((g) => g.base === 'A' && g.contours.length === 2)).toBe(true);
    expect(MOTIF_GLYPHS.every((g) => g.height > 0 && Number.isFinite(g.height))).toBe(true);
  });
  it('keeps the original attention endpoint and all earlier targets unchanged during a finale switch', () => {
    const motif = { x: 0, y: 0, z: 0, alpha: 0 },
      old = { ...motif },
      mixed = { ...motif },
      scratch = { ...motif };
    for (const p of createMorphParticles(100)) {
      sampleMotifParticle(p, motif);
      sampleAttentionParticle(p, old);
      sampleMorphTarget(p, 'attention', 3, mixed, 0);
      expect(mixed).toEqual(motif);
      sampleMorphTarget(p, 'attention', 3, mixed, 1);
      expect(mixed).toEqual(old);
      sampleMorphTarget(p, 'attention', 3, mixed, 0.5);
      expect(mixed.x).toBeCloseTo((motif.x + old.x) / 2, 12);
      expect(mixed.y).toBeCloseTo((motif.y + old.y) / 2, 12);
      for (const progress of [0, 1 / 6, 1 / 3, 0.5, 2 / 3, 5 / 6]) {
        sampleMorph(p, progress, 3, motif, scratch, 0);
        sampleMorph(p, progress, 3, mixed, scratch, 1);
        expect(mixed).toEqual(motif);
      }
    }
  });
});
