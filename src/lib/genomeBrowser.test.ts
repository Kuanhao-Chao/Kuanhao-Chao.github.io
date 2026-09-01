import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  levelForBpPerPixel, binOf, tilesCovering, tileStartBp, clampView, zoomAbout,
  xOfBp, bpOfX, parseLocus, formatLocus, formatSpan, rulerTicks, MIN_VIEW_BP,
  type Level, type ChromInfo,
} from './genomeBrowser';

const LEVELS: Level[] = [
  { level: 0, binBp: 1, rows: 1 },
  { level: 1, binBp: 8, rows: 3 },
  { level: 2, binBp: 64, rows: 3 },
  { level: 3, binBp: 512, rows: 3 },
  { level: 4, binBp: 4096, rows: 3 },
];
const CHROMS: ChromInfo[] = [
  { name: 'chrI', length: 230218 },
  { name: 'chrIV', length: 1531933 },
  { name: 'chrM', length: 85779 },
];

describe('levelForBpPerPixel', () => {
  it('never stretches a bin across more than one pixel', () => {
    // The largest bin no wider than a pixel. Picking the smallest bin AT LEAST a pixel wide is the
    // same rule read backwards and draws 4,096 bp bins at chrIV's 1,094 bp/px -- 3.7 px each.
    expect(levelForBpPerPixel(1, LEVELS).binBp).toBe(1);
    expect(levelForBpPerPixel(1.1, LEVELS).binBp).toBe(1);
    expect(levelForBpPerPixel(8, LEVELS).binBp).toBe(8);
    expect(levelForBpPerPixel(9, LEVELS).binBp).toBe(8);
    expect(levelForBpPerPixel(500, LEVELS).binBp).toBe(64);
    expect(levelForBpPerPixel(512, LEVELS).binBp).toBe(512);
    expect(levelForBpPerPixel(1094, LEVELS).binBp).toBe(512);   // chrIV across 1,400 px
    expect(levelForBpPerPixel(4096, LEVELS).binBp).toBe(4096);
    expect(levelForBpPerPixel(1e9, LEVELS).binBp).toBe(4096);
  });

  it('falls back to base resolution when zoomed in past it', () => {
    // Below one bp a pixel there is nothing finer to ask for.
    expect(levelForBpPerPixel(0.5, LEVELS).binBp).toBe(1);
    expect(levelForBpPerPixel(0.01, LEVELS).binBp).toBe(1);
  });

  it('is independent of the order levels arrive in', () => {
    const shuffled = [LEVELS[3], LEVELS[0], LEVELS[4], LEVELS[1], LEVELS[2]];
    for (const bpp of [0.5, 3, 40, 900, 1e6]) {
      expect(levelForBpPerPixel(bpp, shuffled)).toEqual(levelForBpPerPixel(bpp, LEVELS));
    }
  });

  it('picks a level a real viewport can actually draw', () => {
    // 1,400 px is the panel this ships in, and the browser shows ONE chromosome at a time -- so the
    // widest real view is chrIV, not the 12 Mb genome. A bin must never be wider than a pixel, and
    // should not be more than 8x narrower or we are fetching detail the screen cannot show. The one
    // exemption is base resolution: below 1 bp/px a base is legitimately several pixels wide, and
    // there is nothing finer to fall back to. That is the letter view, not blur.
    for (const span of [1e3, 1e4, 1e5, 1_531_933]) {
      const bpp = span / 1400;
      const l = levelForBpPerPixel(bpp, LEVELS);
      const pixelsPerBin = l.binBp / bpp;
      if (l.binBp > 1) expect(pixelsPerBin, `span ${span}`).toBeLessThanOrEqual(1.0001);
      expect(pixelsPerBin, `span ${span}`).toBeGreaterThan(1 / 8);
    }
  });

  it('reaches the letter view only when a base is at least a pixel wide', () => {
    // The deepest zoom draws A/C/G/T, which needs several pixels a base -- so L0 must not be chosen
    // while bases are sub-pixel, and must be chosen once they are not.
    expect(levelForBpPerPixel(2, LEVELS).binBp).toBe(1);      // 2 bp/px: still summarised
    expect(levelForBpPerPixel(0.9, LEVELS).binBp).toBe(1);
    expect(levelForBpPerPixel(400 / 1400, LEVELS).binBp).toBe(1);   // parseLocus's 400 bp default
  });
});

describe('binOf', () => {
  it('floors, so a bin owns its whole range and no base falls between two bins', () => {
    expect(binOf(0, 64)).toBe(0);
    expect(binOf(63, 64)).toBe(0);
    expect(binOf(64, 64)).toBe(1);
    // Rounding instead of flooring is the trap: it would put bp 32-63 in bin 1, which owns 64-127.
    expect(binOf(32, 64)).toBe(0);
  });
});

describe('tilesCovering', () => {
  it('covers a range and nothing beyond it', () => {
    expect(tilesCovering(0, 100, 1, 65536)).toEqual([0]);
    expect(tilesCovering(0, 65536, 1, 65536)).toEqual([0]);
    // The exclusive end must not pull in the next tile -- the classic off-by-one that makes a
    // browser fetch one extra tile at every position.
    expect(tilesCovering(65535, 65536, 1, 65536)).toEqual([0]);
    expect(tilesCovering(65536, 65537, 1, 65536)).toEqual([1]);
    expect(tilesCovering(0, 65537, 1, 65536)).toEqual([0, 1]);
  });

  it('accounts for the bin size, not just the tile size', () => {
    // At 64 bp a bin, one tile spans 65,536 * 64 = 4,194,304 bp -- the whole of chrIV.
    expect(tilesCovering(0, 1531933, 64, 65536)).toEqual([0]);
    expect(tilesCovering(0, 1531933, 1, 65536)).toHaveLength(24);
  });

  it('returns nothing for an empty or inverted range', () => {
    expect(tilesCovering(500, 500, 1, 65536)).toEqual([]);
    expect(tilesCovering(900, 100, 1, 65536)).toEqual([]);
  });

  it('agrees with tileStartBp', () => {
    for (const binBp of [1, 8, 64, 512, 4096]) {
      for (const t of tilesCovering(700_000, 900_000, binBp, 65536)) {
        const s = tileStartBp(t, binBp, 65536);
        expect(s).toBeLessThanOrEqual(900_000);
        expect(s + 65536 * binBp).toBeGreaterThan(700_000);
      }
    }
  });
});

describe('clampView', () => {
  it('shifts rather than narrows when panning past an end', () => {
    // Narrowing here is the bug: the view silently changes zoom when you pan into a telomere.
    expect(clampView(-500, 500, 230218)).toEqual({ start: 0, end: 1000 });
    expect(clampView(230000, 231000, 230218)).toEqual({ start: 229218, end: 230218 });
    for (const v of [clampView(-500, 500, 230218), clampView(230000, 231000, 230218)]) {
      expect(v.end - v.start).toBe(1000);
    }
  });

  it('shows the whole chromosome when the view is wider than it', () => {
    expect(clampView(-1e6, 1e6, 85779)).toEqual({ start: 0, end: 85779 });
  });

  it('never goes below the minimum readable width', () => {
    const v = clampView(1000, 1001, 230218);
    expect(v.end - v.start).toBe(MIN_VIEW_BP);
  });
});

describe('zoomAbout', () => {
  it('keeps the anchor base under the same fraction of the view', () => {
    const before = { start: 1000, end: 2000 };
    const anchor = 1250;                       // a quarter across
    const after = zoomAbout(before.start, before.end, 0.5, anchor, 230218);
    expect(after.end - after.start).toBe(500);
    expect((anchor - after.start) / (after.end - after.start)).toBeCloseTo(0.25, 6);
  });

  it('round-trips: zoom in then out returns to where it started', () => {
    const a = zoomAbout(1000, 2000, 0.5, 1500, 230218);
    const b = zoomAbout(a.start, a.end, 2, 1500, 230218);
    expect(b).toEqual({ start: 1000, end: 2000 });
  });

  it('cannot zoom out past the chromosome or in past the floor', () => {
    expect(zoomAbout(0, 230218, 10, 100000, 230218)).toEqual({ start: 0, end: 230218 });
    const tight = zoomAbout(1000, 1040, 0.01, 1020, 230218);
    expect(tight.end - tight.start).toBe(MIN_VIEW_BP);
  });
});

describe('xOfBp / bpOfX', () => {
  it('are exact inverses', () => {
    const view = { chrom: 'chrI', start: 1000, end: 5000 };
    for (const bp of [1000, 2345, 4999]) {
      expect(bpOfX(xOfBp(bp, view, 1400, 60, 12), view, 1400, 60, 12)).toBeCloseTo(bp, 6);
    }
  });

  it('put the view edges on the plot edges', () => {
    const view = { chrom: 'chrI', start: 0, end: 1000 };
    expect(xOfBp(0, view, 1000, 50, 10)).toBeCloseTo(50, 6);
    expect(xOfBp(1000, view, 1000, 50, 10)).toBeCloseTo(990, 6);
  });
});

describe('parseLocus', () => {
  it('reads what a browser prints, commas and all', () => {
    expect(parseLocus('chrIV:65,235-65,431', CHROMS))
      .toEqual({ chrom: 'chrIV', start: 65234, end: 65431 });
    expect(parseLocus('chrIV:65235-65431', CHROMS))
      .toEqual({ chrom: 'chrIV', start: 65234, end: 65431 });
  });

  it('converts from the 1-based inclusive display convention', () => {
    // Displayed 1-1000 is internal [0, 1000).
    expect(parseLocus('chrI:1-1000', CHROMS)).toEqual({ chrom: 'chrI', start: 0, end: 1000 });
  });

  it('centres a readable window on a single coordinate', () => {
    const v = parseLocus('chrI:100000', CHROMS)!;
    expect(v.end - v.start).toBe(400);
    expect((v.start + v.end) / 2).toBeCloseTo(99999, 0);
  });

  it('takes a bare chromosome as the whole chromosome', () => {
    expect(parseLocus('chrM', CHROMS)).toEqual({ chrom: 'chrM', start: 0, end: 85779 });
    expect(parseLocus('  chrM  ', CHROMS)).toEqual({ chrom: 'chrM', start: 0, end: 85779 });
  });

  it('accepts a reversed range rather than refusing it', () => {
    expect(parseLocus('chrI:2000-1000', CHROMS)).toEqual({ chrom: 'chrI', start: 999, end: 2000 });
  });

  it('is case-insensitive on the chromosome name', () => {
    expect(parseLocus('CHRiv:1-100', CHROMS)?.chrom).toBe('chrIV');
  });

  it('returns null rather than guessing', () => {
    // A locus box that jumps somewhere near what was typed is worse than one that refuses.
    expect(parseLocus('', CHROMS)).toBeNull();
    expect(parseLocus('chrZZ:1-100', CHROMS)).toBeNull();
    expect(parseLocus('chrI:abc', CHROMS)).toBeNull();
    expect(parseLocus('not a locus at all', CHROMS)).toBeNull();
  });

  it('clamps a range that runs off the chromosome', () => {
    const v = parseLocus('chrM:80000-99999', CHROMS)!;
    expect(v.end).toBeLessThanOrEqual(85779);
  });

  it('round-trips through formatLocus', () => {
    for (const s of ['chrIV:65,235-65,431', 'chrI:1-1,000', 'chrM:100-200']) {
      const v = parseLocus(s, CHROMS)!;
      expect(parseLocus(formatLocus(v), CHROMS)).toEqual(v);
    }
  });
});

describe('formatSpan', () => {
  it('reads as a genome browser reads', () => {
    expect(formatSpan(430)).toBe('430 bp');
    expect(formatSpan(1500)).toBe('1.5 kb');
    expect(formatSpan(12_000)).toBe('12 kb');
    expect(formatSpan(1_531_933)).toBe('1.53 Mb');
    expect(formatSpan(12_157_105)).toBe('12 Mb');
  });
});

describe('rulerTicks', () => {
  it('lands on round numbers at every zoom', () => {
    for (const span of [200, 2000, 20_000, 200_000, 2_000_000]) {
      const ticks = rulerTicks({ chrom: 'chrIV', start: 12_345, end: 12_345 + span });
      expect(ticks.length).toBeGreaterThan(2);
      const step = ticks[1] - ticks[0];
      const mant = step / 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 5, 10]).toContain(Math.round(mant));
      for (const t of ticks) expect(t % step).toBe(0);
    }
  });

  it('stays inside the view', () => {
    const view = { chrom: 'chrI', start: 1000, end: 3000 };
    for (const t of rulerTicks(view)) {
      expect(t).toBeGreaterThanOrEqual(view.start);
      expect(t).toBeLessThan(view.end);
    }
  });
});

describe('against the shipped index.json', () => {
  const p = 'public/genome-data/index.json';
  const idx = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;

  it('ships a pyramid over the whole R64 genome', () => {
    expect(idx).not.toBeNull();
    expect(idx.chroms).toHaveLength(17);
    expect(idx.chroms.reduce((s: number, c: { length: number }) => s + c.length, 0)).toBe(12_157_105);
  });

  it('the level ladder this module assumes is the one on disk', () => {
    // If the tiler's levels change and this module keeps choosing from the old ladder, the browser
    // asks for tiles that do not exist. Pin them to each other.
    expect(idx.levels.map((l: Level) => l.binBp)).toEqual([1, 8, 64, 512, 4096]);
    expect(idx.tileBins).toBe(65536);
    expect(idx.icMax).toBe(2);
  });

  it('every level a viewport would choose has tiles for every chromosome', () => {
    for (const c of idx.chroms) {
      for (const span of [1e3, 1e5, c.length]) {
        const lvl = levelForBpPerPixel(Math.min(span, c.length) / 1400, idx.levels);
        const meta = c.levels.find((l: { level: number }) => l.level === lvl.level);
        expect(meta, `${c.name} level ${lvl.level}`).toBeTruthy();
        const need = tilesCovering(0, Math.min(span, c.length), lvl.binBp, idx.tileBins);
        expect(meta.tiles).toBeGreaterThanOrEqual(need.length);
      }
    }
  });

  it('records the pooling phase the track was computed on', () => {
    // The model is ~20x more sensitive to window phase than to flank size; the browser's whole
    // track is one phase, and the manifest is where that is written down.
    expect(idx.window.phase).toBe(128);
    expect(idx.window.flank % 128).toBe(0);
    expect(idx.window.core % 128).toBe(0);
  });
});
