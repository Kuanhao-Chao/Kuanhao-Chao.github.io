import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  levelForBpPerPixel, binOf, tilesCovering, tileStartBp, clampView, zoomAbout,
  xOfBp, bpOfX, parseLocus, formatLocus, formatSpan, rulerTicks, MIN_VIEW_BP,
  laneLayout, laneAt, brushRegion, featureDensity, searchLocus, searchSuggest,
  emptyHistory, historyPush, historyBack, historyForward, canGoBack, canGoForward,
  encodeViewState, decodeViewState, chromOrder, romanValue,
  letterMinPx, shouldDrawLetters, pinchZoom, pointDistance, pointMidpoint,
  type Level, type ChromInfo, type LaneSpec, type SearchGene, type View,
  laneExcluder, nativeLadder, levelsForTrack, axisFraction, axisValue, isSignedAxis, pearson, exportRows, laneOrder,} from './genomeBrowser';

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
    // 16 bp is here for Shorkie's own output grid -- its head emits 896 bins of 16 bp -- and
    // without it those tracks would fall back to 64 bp, four times blurrier than the data.
    expect(idx.levels.map((l: Level) => l.binBp)).toEqual([1, 8, 16, 64, 512, 4096]);
    expect(idx.tileBins).toBe(65536);
    expect(idx.icMax).toBe(2);
  });

  it('every level a viewport would choose has tiles for every chromosome AND every track', () => {
    for (const c of idx.chroms) {
      for (const track of idx.tracks) {
        const levels = c.levels[track.id];
        expect(levels, `${c.name} has no levels for ${track.id}`).toBeTruthy();
        // A track's OWN ladder, not the index's. Not every track resolves single bases: Shorkie's
        // coverage tracks are 16 bp and would 404 on every L0 tile. This is the check that a lane
        // never asks for a level it does not have -- and, read the other way, that the tiler wrote
        // every level the client will choose.
        for (const span of [1e3, 1e5, c.length]) {
          const lvl = levelForBpPerPixel(Math.min(span, c.length) / 1400,
            levelsForTrack(track, idx.levels));
          const meta = levels.find((l: { level: number }) => l.level === lvl.level);
          expect(meta, `${c.name}/${track.id} level ${lvl.level}`).toBeTruthy();
          const need = tilesCovering(0, Math.min(span, c.length), lvl.binBp, idx.tileBins);
          expect(meta.tiles).toBeGreaterThanOrEqual(need.length);
        }
      }
    }
  });

  it('never ships a level finer than a track can honestly supply', () => {
    // Shorkie's head emits 896 bins of 16 bp and occlusion ablates 64 bp at a time. A per-base
    // level for either would store 12,157,105 numbers carrying 760,000 values of real information
    // and draw them as though the model resolved single bases.
    for (const tr of idx.tracks) {
      const native = tr.nativeBp ?? 1;
      expect(tr.levels, `${tr.id} has no ladder`).toBeTruthy();
      for (const l of tr.levels) {
        expect(l.binBp, `${tr.id} L${l.level} is finer than its ${native} bp bins`)
          .toBeGreaterThanOrEqual(native);
        expect(l.binBp % native, `${tr.id} L${l.level} is not a multiple of ${native}`).toBe(0);
      }
      // ... and the ladder on disk matches what the client would derive for itself.
      expect(tr.levels.map((l: Level) => l.binBp))
        .toEqual(nativeLadder(native, idx.levels).map((l: Level) => l.binBp));
      for (const c of idx.chroms) {
        expect(Object.keys(c.levels[tr.id] ?? {}).length, `${c.name}/${tr.id}`).toBeGreaterThan(0);
        expect((c.levels[tr.id] as { level: number }[]).map((l) => l.level))
          .toEqual(tr.levels.map((l: Level) => l.level));
      }
    }
  });

  it('a signed track has a symmetric axis, so its zero rule sits mid-lane', () => {
    // gradient x input is signed: bases that raise the prediction and bases that lower it. An
    // asymmetric axis would put zero off-centre and every bar would be read against the wrong
    // baseline.
    const signed = idx.tracks.filter((t: { axis: [number, number] }) => isSignedAxis(t.axis));
    expect(signed.length).toBeGreaterThan(0);
    for (const tr of signed) {
      expect(tr.axis[0]).toBe(-tr.axis[1]);
      expect(tr.space, `${tr.id} draws a heavy-tailed signed quantity`).toBe('symlog');
      // linthresh is the genome-wide median |v|; it must sit well inside the axis or the scale
      // never leaves its linear regime and the lane is linear after all.
      expect(tr.linthresh).toBeGreaterThan(0);
      expect(tr.linthresh).toBeLessThan(tr.axis[1] / 100);
    }
  });

  it('every coverage lane is drawn on a log axis, because its median is 0.2% of its maximum', () => {
    for (const tr of idx.tracks.filter((t: { units: string }) => t.units === 'a.u.')) {
      expect(tr.space, tr.id).toBe('log1p');
      expect(tr.axis[0]).toBe(0);
      expect(tr.nativeBp, `${tr.id} is Shorkie's 896 x 16 bp head`).toBe(16);
    }
  });

  it('declares the score tracks, each on the right axis in its own units', () => {
    // The two model passes share the 0-2 bits axis and are directly comparable. phastCons and GC
    // both run 0-1 and are NOT comparable with each other either: one is a posterior probability
    // and the other a base fraction. Only the units distinguish them, which is why each lane
    // prints its own.
    const byId = Object.fromEntries(idx.tracks.map((t: { id: string }) => [t.id, t]));
    // The SHAPE, not a hardcoded roster. This list has had to be edited every time a pass landed,
    // which makes it a chore rather than a check; what actually matters is that both model
    // families are present and that the four lanes below still mean what the assertions say.
    for (const id of ['gc', 'lm-masked', 'lm-unmasked', 'phastcons', 'sk-rnaseq', 'sk-gradient']) {
      expect(byId[id], `${id} missing from the index`).toBeTruthy();
    }
    expect(idx.tracks.filter((t: { id: string }) => t.id.startsWith('lm-')).length)
      .toBeGreaterThanOrEqual(2);
    expect(idx.tracks.filter((t: { id: string }) => t.id.startsWith('sk-')).length)
      .toBeGreaterThanOrEqual(5);
    expect(byId['lm-masked'].axis).toEqual([0, 2]);
    expect(byId['lm-unmasked'].axis).toEqual([0, 2]);
    expect(byId['phastcons'].axis).toEqual([0, 1]);
    expect(byId['gc'].axis).toEqual([0, 1]);
    expect(byId['lm-masked'].units).toBe(byId['lm-unmasked'].units);
    expect(byId['phastcons'].units).not.toBe(byId['gc'].units);
    expect(byId['phastcons'].units).not.toBe(byId['lm-masked'].units);
    // Which lanes are predictions is written in the index, never inferred from a name. The two
    // models predict different things -- Shorkie_LM predicts the SEQUENCE, Shorkie predicts assay
    // COVERAGE from sequence -- and phastCons, GC and the attribution predict nothing at all.
    // Every prediction lane, and nothing else. An attribution is a derivative OF a prediction, and
    // conservation and composition predict nothing at all.
    const preds = idx.tracks.filter((t: { prediction: boolean }) => t.prediction)
      .map((t: { id: string }) => t.id).sort();
    expect(preds).toContain('lm-masked');
    expect(preds).toContain('sk-rnaseq');
    for (const id of ['phastcons', 'gc', 'lm-unmasked', 'sk-gradient']) {
      expect(preds, `${id} is not a prediction`).not.toContain(id);
    }
    expect(byId['lm-unmasked'].prediction).toBe(false);
    expect(byId['sk-gradient'].prediction).toBe(false);
  });

  it('documents every track in four fields, including what it does NOT mean', () => {
    // The generator refuses to build without these, and this is the check that the refusal is
    // actually wired up rather than a comment. The `caveat` field is the one that matters: every
    // track here invites a specific misreading, and naming it is the documentation.
    for (const tr of idx.tracks) {
      for (const field of ['source', 'measures', 'read', 'caveat']) {
        expect(tr.docs?.[field], `${tr.id}.docs.${field}`).toBeTruthy();
        expect(String(tr.docs[field]).length, `${tr.id}.docs.${field} too short`)
          .toBeGreaterThan(60);
      }
    }
  });

  it('carries the composition control, and it comes out near zero', () => {
    // The first objection to "the model measures constraint" is that it measures base composition.
    // A control is only useful if its result is on the page, so the number lives in the index.
    expect(idx.gcComparison).toBeTruthy();
    expect(Math.abs(idx.gcComparison.pearson)).toBeLessThan(0.05);
    // ... and the intergenic split must NOT be near zero: AT-rich intergenic sequence really is
    // more predictable, and a page that reported only the headline would be hiding that.
    expect(idx.gcComparison.byClass.intergenic.pearson).toBeLessThan(-0.15);
  });

  it('reserves byte 0 for no data, which phastCons actually needs', () => {
    expect(idx.noDataByte).toBe(0);
    // phastCons has no value where the alignment has none; the model passes cover every base.
    const cons = idx.chroms.reduce((s: number, c: any) => s + c.tracks['phastcons'].scored, 0);
    const total = idx.chroms.reduce((s: number, c: any) => s + c.length, 0);
    expect(cons).toBeLessThan(total);
    expect(cons / total).toBeGreaterThan(0.98);
    for (const c of idx.chroms) expect(c.tracks['lm-masked'].scored).toBe(c.length);
  });

  it('carries the model-vs-conservation comparison the page states', () => {
    // A number in prose that has no home in the data is a number that goes stale. This is its home.
    expect(idx.comparison).toBeTruthy();
    expect(idx.comparison.bases).toBeGreaterThan(12_000_000);
    expect(Math.abs(idx.comparison.pearson)).toBeLessThan(1);
    expect(Object.keys(idx.comparison.byClass).sort()).toEqual(['cds', 'intergenic']);
    // The headline is driven by the CDS/intergenic contrast, not by within-class agreement, and
    // the within-CDS number must stay well below the overall one or that story is wrong.
    expect(idx.comparison.byClass.cds.pearson).toBeLessThan(idx.comparison.pearson);
    expect(idx.comparison.byClass.cds.phastConsSaturated).toBeGreaterThan(0.3);
  });

  it('orders into the yeast convention: chrI first, chrM last', () => {
    const names = idx.chroms.map((c: { name: string }) => c.name).sort(chromOrder);
    expect(names[0]).toBe('chrI');
    expect(names[1]).toBe('chrII');
    expect(names[names.length - 1]).toBe('chrM');
    expect(names).toHaveLength(17);
  });

  it('records the pooling phase the track was computed on', () => {
    // The model is ~20x more sensitive to window phase than to flank size; the browser's whole
    // track is one phase, and the manifest is where that is written down.
    expect(idx.window.phase).toBe(128);
    expect(idx.window.flank % 128).toBe(0);
    expect(idx.window.core % 128).toBe(0);
  });
});

describe('laneLayout', () => {
  const specs: LaneSpec[] = [
    { id: 'ruler', kind: 'ruler', label: 'ruler', height: 22 },
    { id: 'lm-masked', kind: 'score', label: 'masked', height: 120 },
    { id: 'genes', kind: 'genes', label: 'genes', height: 24 },
  ];

  it('stacks lanes without gaps or overlaps', () => {
    const { lanes, total } = laneLayout(specs, 8);
    expect(lanes.map((l) => l.boxTop)).toEqual([0, 30, 158]);
    // 22+8 + 120+8 + 24+8. The trailing gap is part of the total: it is the breathing room under
    // the last lane, and a canvas sized without it clips whatever that lane's baseline sits on.
    expect(total).toBe(190);
    for (let i = 1; i < lanes.length; i += 1) {
      expect(lanes[i].boxTop).toBe(lanes[i - 1].boxTop + lanes[i - 1].boxHeight);
    }
  });

  it('content sits inside its own box', () => {
    for (const l of laneLayout(specs, 8).lanes) {
      expect(l.top).toBeGreaterThanOrEqual(l.boxTop);
      expect(l.top + l.height).toBeLessThanOrEqual(l.boxTop + l.boxHeight);
    }
  });

  it('the total is exactly what a canvas must be sized to', () => {
    // The failure this prevents: a canvas sized from one sum while lanes are drawn from another,
    // so the last lane is clipped by however much the two disagree.
    const { lanes, total } = laneLayout(specs, 8);
    const last = lanes[lanes.length - 1];
    expect(last.boxTop + last.boxHeight).toBe(total);
  });

  it('hit-tests back to the lane that was drawn', () => {
    const { lanes, total } = laneLayout(specs, 8);
    for (const l of lanes) {
      expect(laneAt(lanes, l.boxTop)?.id).toBe(l.id);
      expect(laneAt(lanes, l.boxTop + l.boxHeight - 1)?.id).toBe(l.id);
      expect(laneAt(lanes, l.top + 1)?.id).toBe(l.id);
    }
    expect(laneAt(lanes, -1)).toBeNull();
    expect(laneAt(lanes, total)).toBeNull();
  });

  it('an empty stack is not a crash', () => {
    expect(laneLayout([], 8)).toEqual({ lanes: [], total: 0 });
  });
});

describe('brushRegion', () => {
  it('normalises a right-to-left drag', () => {
    expect(brushRegion(2000, 1000, 10)).toEqual({ start: 1000, end: 2000 });
    expect(brushRegion(1000, 2000, 10)).toEqual({ start: 1000, end: 2000 });
  });

  it('treats a short drag as a click, not a zero-width selection', () => {
    // Zooming to a 3 bp region because a pointer wobbled is worse than doing nothing.
    expect(brushRegion(1000, 1003, 20)).toBeNull();
    expect(brushRegion(1000, 1021, 20)).toEqual({ start: 1000, end: 1021 });
  });

  it('never returns an empty range even at a zero threshold', () => {
    expect(brushRegion(1000, 1000, 0)).toBeNull();
  });
});

describe('featureDensity', () => {
  it('measures coverage, not count', () => {
    // One 800 bp region and one 6 bp motif must not read the same. A count would say they do.
    const wide = featureDensity([0], [800], 0, 1000, 10);
    const narrow = featureDensity([0], [6], 0, 1000, 10);
    expect(wide[0]).toBeCloseTo(1, 6);
    expect(narrow[0]).toBeCloseTo(6 / 100, 6);
  });

  it('clamps overlapping features at fully covered', () => {
    const d = featureDensity([0, 0, 0], [1000, 1000, 1000], 0, 1000, 4);
    for (const v of d) expect(v).toBeCloseTo(1, 6);
  });

  it('ignores features outside the view', () => {
    const d = featureDensity([5000, 6000], [100, 100], 0, 1000, 8);
    expect(Array.from(d).every((v) => v === 0)).toBe(true);
  });

  it('puts a feature in the column it actually falls in', () => {
    const d = featureDensity([500], [100], 0, 1000, 10);
    expect(d[5]).toBeCloseTo(1, 6);
    expect(d[4]).toBe(0);
    expect(d[6]).toBe(0);
  });

  it('splits a feature straddling a column boundary', () => {
    const d = featureDensity([450], [100], 0, 1000, 10);
    expect(d[4]).toBeCloseTo(0.5, 6);
    expect(d[5]).toBeCloseTo(0.5, 6);
  });
});

describe('searchLocus', () => {
  const index = {
    genes: [
      ['YGR192C', 'chrIV', 100000, 101000, -1, ['TDH3']],
      ['YOL086C', 'chrIV', 200000, 201000, -1, ['ADH1']],
      ['YFL039C', 'chrI', 5000, 6000, -1, ['ACT1', 'ABY1']],
    ] as SearchGene[],
  };

  it('finds a gene by its common name and by its systematic id', () => {
    expect(searchLocus('TDH3', index, CHROMS, 500))
      .toEqual({ chrom: 'chrIV', start: 99500, end: 101500 });
    expect(searchLocus('YGR192C', index, CHROMS, 500))
      .toEqual({ chrom: 'chrIV', start: 99500, end: 101500 });
  });

  it('is case-insensitive and finds secondary aliases', () => {
    expect(searchLocus('act1', index, CHROMS, 0)?.chrom).toBe('chrI');
    expect(searchLocus('ABY1', index, CHROMS, 0)?.chrom).toBe('chrI');
  });

  it('matches exactly, so a prefix does not jump to a different gene', () => {
    // RPL4 and RPL4A are different genes. A prefix match here is a wrong answer, not a convenience.
    expect(searchLocus('TDH', index, CHROMS)).toBeNull();
    expect(searchLocus('YGR192', index, CHROMS)).toBeNull();
  });

  it('still takes a locus string, and a bare chromosome', () => {
    expect(searchLocus('chrIV:65,235-65,431', index, CHROMS))
      .toEqual({ chrom: 'chrIV', start: 65234, end: 65431 });
    expect(searchLocus('chrM', index, CHROMS)).toEqual({ chrom: 'chrM', start: 0, end: 85779 });
  });

  it('returns null rather than guessing', () => {
    expect(searchLocus('NOTAGENE', index, CHROMS)).toBeNull();
    expect(searchLocus('', index, CHROMS)).toBeNull();
    expect(searchLocus('TDH3', null, CHROMS)).toBeNull();
  });

  it('suggests by prefix, which is a different job from resolving', () => {
    expect(searchSuggest('TDH', index).map((g) => g[0])).toEqual(['YGR192C']);
    expect(searchSuggest('A', index).map((g) => g[0])).toEqual(['YOL086C', 'YFL039C']);
    expect(searchSuggest('', index)).toEqual([]);
  });
});

describe('history', () => {
  const v = (start: number): View => ({ chrom: 'chrI', start, end: start + 1000 });

  it('goes back and forward over what was visited', () => {
    let h = emptyHistory();
    for (const s of [0, 1000, 2000]) h = historyPush(h, v(s));
    expect(canGoForward(h)).toBe(false);
    const b1 = historyBack(h)!;
    expect(b1.view.start).toBe(1000);
    const b2 = historyBack(b1.history)!;
    expect(b2.view.start).toBe(0);
    expect(historyBack(b2.history)).toBeNull();
    expect(historyForward(b2.history)!.view.start).toBe(1000);
  });

  it('drops the forward branch when you navigate after going back', () => {
    let h = emptyHistory();
    for (const s of [0, 1000, 2000]) h = historyPush(h, v(s));
    const back = historyBack(h)!.history;
    const next = historyPush(back, v(9000));
    expect(canGoForward(next)).toBe(false);
    expect(next.entries.map((e) => e.start)).toEqual([0, 1000, 9000]);
  });

  it('does not record a view identical to the current one', () => {
    // Holding a pan key must not fill the history with entries that all look the same.
    let h = historyPush(emptyHistory(), v(0));
    h = historyPush(h, v(0));
    h = historyPush(h, v(0));
    expect(h.entries).toHaveLength(1);
  });

  it('is bounded, and the cursor survives the trim', () => {
    let h = emptyHistory();
    for (let i = 0; i < 100; i += 1) h = historyPush(h, v(i * 1000), 10);
    expect(h.entries).toHaveLength(10);
    expect(h.at).toBe(9);
    expect(h.entries[h.at].start).toBe(99000);
    expect(historyBack(h)!.view.start).toBe(98000);
  });
});

describe('view state in the hash', () => {
  it('round-trips locus, tracks and ROI', () => {
    const s = {
      view: { chrom: 'chrIV', start: 999, end: 2000 },
      tracks: ['lm-masked', 'phastcons'],
      roi: { start: 1200, end: 1400 },
    };
    const back = decodeViewState(encodeViewState(s), CHROMS);
    expect(back.view).toEqual(s.view);
    expect(back.tracks).toEqual(s.tracks);
    expect(back.roi).toEqual(s.roi);
  });

  it('still reads a plain locus link written before tracks existed', () => {
    const back = decodeViewState('#chrIV:1000-2000', CHROMS);
    expect(back.view).toEqual({ chrom: 'chrIV', start: 999, end: 2000 });
    expect(back.tracks).toBeUndefined();
  });

  it('omits what is not set, so a simple view keeps a simple link', () => {
    const s = { view: { chrom: 'chrI', start: 0, end: 1000 }, tracks: [], roi: null };
    expect(encodeViewState(s)).toBe('chrI:1-1000');
  });

  it('survives junk rather than throwing', () => {
    expect(decodeViewState('#nonsense', CHROMS).view).toBeNull();
    expect(decodeViewState('#chrI:1-1000;t=;roi=zz', CHROMS).roi).toBeUndefined();
  });
});


describe('chromOrder', () => {
  const YEAST = [
    'chrIV', 'chrXV', 'chrVII', 'chrXII', 'chrXVI', 'chrXIII', 'chrII', 'chrXIV', 'chrX', 'chrXI',
    'chrV', 'chrVIII', 'chrIX', 'chrIII', 'chrVI', 'chrI', 'chrM',
  ];

  it('reads chrI, chrII, … chrXVI, then chrM', () => {
    expect([...YEAST].sort(chromOrder)).toEqual([
      'chrI', 'chrII', 'chrIII', 'chrIV', 'chrV', 'chrVI', 'chrVII', 'chrVIII',
      'chrIX', 'chrX', 'chrXI', 'chrXII', 'chrXIII', 'chrXIV', 'chrXV', 'chrXVI', 'chrM',
    ]);
  });

  it('is not a lexical sort', () => {
    // The whole reason this function exists: "chrIX" < "chrV" as strings, and chrIX is the ninth.
    expect(chromOrder('chrIX', 'chrV')).toBeGreaterThan(0);
    expect(['chrIX', 'chrV'].sort()).toEqual(['chrIX', 'chrV']);
  });

  it('does not put chrM last by accident', () => {
    // M is 1000 in roman numerals, so a numeral-aware sort would put chrM after chrXVI for a
    // reason that has nothing to do with it being the mitochondrion -- and would sort a
    // hypothetical chrD (500) there too. Only I..XVI count as numbered.
    expect(romanValue('M')).toBe(1000);
    expect([...YEAST, 'chrD'].sort(chromOrder).slice(-2)).toEqual(['chrD', 'chrM']);
  });

  it('is a total order: stable, antisymmetric, and agrees with itself', () => {
    for (const a of YEAST) {
      expect(chromOrder(a, a)).toBe(0);
      for (const b of YEAST) {
        expect(Math.sign(chromOrder(a, b)) || 0).toBe(-Math.sign(chromOrder(b, a)) || 0);
      }
    }
  });

  it('reads the roman numerals the browser actually ships', () => {
    expect(romanValue('IV')).toBe(4);
    expect(romanValue('IX')).toBe(9);
    expect(romanValue('XIV')).toBe(14);
    expect(romanValue('XVI')).toBe(16);
    expect(romanValue('')).toBeNull();
    expect(romanValue('chrIV')).toBeNull();
  });

});


describe('reaching the letter view', () => {
  // MEASURED canvas widths, not viewport widths: on a 390 px phone the container's padding leaves
  // the canvas at 300 px, so the plot is 300 minus the gutters -- which is why the arithmetic that
  // made letters unreachable was invisible from the breakpoint alone.
  const PHONE = 300 - 22 - 14;      // 264, with the narrow gutter
  const PHONE_OLD = 300 - 34 - 14;  // 252, the gutter this shipped with
  const TABLET = 768 - 62 - 14;     // 692
  const LAPTOP = 1440 - 62 - 14;    // 1364

  it('lowers the threshold for a narrow plot, and never below legibility', () => {
    expect(letterMinPx(LAPTOP)).toBe(7);
    expect(letterMinPx(TABLET)).toBeLessThan(7);
    expect(letterMinPx(PHONE)).toBeLessThan(letterMinPx(TABLET));
    // A glyph below ~4.5 px is texture, not a letter, so the ramp stops there.
    expect(letterMinPx(100)).toBeGreaterThanOrEqual(4.5);
    expect(letterMinPx(0)).toBeGreaterThanOrEqual(4.5);
  });

  it('is monotone in plot width, so a resize cannot flip the view back and forth', () => {
    let prev = 0;
    for (let w = 100; w <= 1600; w += 50) {
      const v = letterMinPx(w);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it('THE ACCEPTANCE TEST: the zoom floor reaches letters at every real width', () => {
    // This is the bug in one assertion. With a 40 bp floor, a 7 px threshold and a 252 px phone
    // plot, 40 bases over 252 px is 6.3 px a base -- so the deepest zoom a phone could reach still
    // drew bars, and the sequence was unreachable. Measured on the live site before the fix.
    for (const inner of [PHONE, PHONE_OLD, TABLET, LAPTOP]) {
      expect(shouldDrawLetters(MIN_VIEW_BP, inner), `plot ${inner}px at the floor`).toBe(true);
    }
  });

  it('still does not draw letters when they would be sub-pixel', () => {
    expect(shouldDrawLetters(10_000, PHONE)).toBe(false);
    expect(shouldDrawLetters(1_531_933, LAPTOP)).toBe(false);
    expect(shouldDrawLetters(0, PHONE)).toBe(false);
    expect(shouldDrawLetters(100, 0)).toBe(false);
  });

  it('the old floor and the old constant are exactly what made the phone unreachable', () => {
    // The bug, as arithmetic. 252 px of plot over the old 40 bp floor is 6.3 px a base, under the
    // old flat 7 px threshold -- so the deepest zoom a phone could reach still drew bars.
    expect(PHONE_OLD / 40).toBeCloseTo(6.3, 1);
    expect(PHONE_OLD / 40).toBeLessThan(7);
    // Either change alone fixes it; both are made, because the floor also governs how far a pinch
    // can go and the threshold also governs a tablet.
    expect(PHONE_OLD / MIN_VIEW_BP).toBeGreaterThan(letterMinPx(PHONE_OLD));
    expect(shouldDrawLetters(MIN_VIEW_BP, PHONE_OLD)).toBe(true);
  });
});

describe('pinchZoom', () => {
  it('spreading the fingers zooms IN', () => {
    // Fingers further apart => smaller span => factor below 1.
    const f = pinchZoom(100, 200)!;
    expect(f).toBeCloseTo(0.5, 6);
    expect(f).toBeLessThan(1);
  });

  it('pinching them together zooms OUT', () => {
    const f = pinchZoom(200, 100)!;
    expect(f).toBeCloseTo(2, 6);
    expect(f).toBeGreaterThan(1);
  });

  it('ignores jitter, so a resting finger does not drift the view', () => {
    expect(pinchZoom(100, 100)).toBeNull();
    expect(pinchZoom(100, 101)).toBeNull();
    expect(pinchZoom(100, 101, 0.001)).not.toBeNull();
  });

  it('refuses a degenerate gesture rather than returning Infinity', () => {
    expect(pinchZoom(0, 100)).toBeNull();
    expect(pinchZoom(100, 0)).toBeNull();
    expect(pinchZoom(-5, 100)).toBeNull();
  });

  it('composes with zoomAbout to keep the anchor base fixed', () => {
    // The whole reason it returns a factor: a pinch IS zoomAbout driven by fingers.
    const anchor = 1500;
    const before = { start: 1000, end: 2000 };
    const f = pinchZoom(100, 250)!;
    const after = zoomAbout(before.start, before.end, f, anchor, 230218);
    expect(after.end - after.start).toBeLessThan(before.end - before.start);
    const fracBefore = (anchor - before.start) / (before.end - before.start);
    const fracAfter = (anchor - after.start) / (after.end - after.start);
    expect(fracAfter).toBeCloseTo(fracBefore, 3);
  });

  it('distance and midpoint are the plain geometry', () => {
    expect(pointDistance(0, 0, 3, 4)).toBe(5);
    expect(pointMidpoint(0, 0, 10, 20)).toEqual({ x: 5, y: 10 });
  });
});

const LADDER = [1, 8, 16, 64, 512, 4096].map((binBp, level) => ({
  level, binBp, rows: level === 0 ? 1 : 3,
}));

describe('native resolution', () => {
  it('a per-base track keeps the whole ladder', () => {
    expect(nativeLadder(1, LADDER).map((l) => l.binBp)).toEqual([1, 8, 16, 64, 512, 4096]);
  });

  it("drops every level finer than the track's own bins, and keeps the level NUMBERS global", () => {
    // Shorkie's head emits 16 bp bins. An 8 bp level would be an upsampled step function drawn as
    // though the model resolved single bases; `L3` must still mean 64 bp for every track.
    const cov = nativeLadder(16, LADDER);
    expect(cov.map((l) => l.binBp)).toEqual([16, 64, 512, 4096]);
    expect(cov[0].level).toBe(2);
    expect(nativeLadder(64, LADDER).map((l) => l.binBp)).toEqual([64, 512, 4096]);
    expect(nativeLadder(64, LADDER)[0].level).toBe(3);
  });

  it('drops a level its bins do not divide evenly, rather than aggregating a fraction of one', () => {
    // A 24 bp track can supply 512 bp and 4,096 bp bins but not 64 bp ones: 64/24 is 2.67 native
    // bins, and a summary built from a fractional bin is a different quantity from a mean.
    expect(nativeLadder(24, LADDER).map((l) => l.binBp)).toEqual([4096]);
    // A native resolution dividing NOTHING leaves only the coarsest level as a floor. That is a
    // defensive fallback, not a supported case -- `make_genome_tiles.py` refuses to write such a
    // track at all, because the client cannot tell a bad ladder from a sparse one.
    expect(nativeLadder(3, LADDER).map((l) => l.binBp)).toEqual([4096]);
  });

  it('a coarse track never resolves finer than it can, at any zoom', () => {
    const cov = levelsForTrack({ nativeBp: 16 }, LADDER);
    // 0.02 bp/pixel is the deepest zoom the browser allows; a per-base track answers 1 bp there.
    expect(levelForBpPerPixel(0.02, LADDER).binBp).toBe(1);
    expect(levelForBpPerPixel(0.02, cov).binBp).toBe(16);
    expect(levelForBpPerPixel(30, cov).binBp).toBe(16);
    expect(levelForBpPerPixel(100, cov).binBp).toBe(64);
  });

  it('falls back to the index ladder for a track that declares nothing', () => {
    expect(levelsForTrack({}, LADDER)).toBe(LADDER);
  });
});

describe('axis spaces', () => {
  it('linear is the plain fraction, clamped', () => {
    expect(axisFraction(1, [0, 2])).toBeCloseTo(0.5, 12);
    expect(axisFraction(-5, [0, 2])).toBe(0);
    expect(axisFraction(99, [0, 2])).toBe(1);
  });

  it('log1p lifts a heavy-tailed coverage median off the floor', () => {
    // The genome-wide numbers: median 16 bp bin 2.07, maximum 1097.6. Linearly the median draws at
    // 0.2% of the lane -- a flat line with spikes, which is not a reading of the data.
    const axis: [number, number] = [0, 1097.6];
    expect(axisFraction(2.07, axis, 'linear')).toBeLessThan(0.003);
    expect(axisFraction(2.07, axis, 'log1p')).toBeGreaterThan(0.14);
    expect(axisFraction(0, axis, 'log1p')).toBe(0);
    expect(axisFraction(1097.6, axis, 'log1p')).toBeCloseTo(1, 9);
  });

  it('symlog is symmetric about the zero rule and lifts a signed median', () => {
    // chrIV gradient x input: median |v| 0.00082, max 1.34.
    const axis: [number, number] = [-1.34, 1.34];
    expect(axisFraction(0, axis, 'symlog', 0.00082)).toBeCloseTo(0.5, 12);
    const up = axisFraction(0.00082, axis, 'symlog', 0.00082);
    const dn = axisFraction(-0.00082, axis, 'symlog', 0.00082);
    expect(up - 0.5).toBeCloseTo(0.5 - dn, 12);
    expect(up).toBeGreaterThan(0.53);           // linearly this is 0.5003
    expect(axisFraction(1.34, axis, 'symlog', 0.00082)).toBeCloseTo(1, 9);
  });

  it('axisValue inverts axisFraction in every space', () => {
    const cases: [number, [number, number], 'linear' | 'log1p' | 'symlog', number][] = [
      [1.3, [0, 2], 'linear', 1],
      [42.5, [0, 1097.6], 'log1p', 1],
      [0.0104, [-1.34, 1.34], 'symlog', 0.00082],
      [-0.31, [-1.34, 1.34], 'symlog', 0.00082],
    ];
    for (const [v, axis, space, t] of cases) {
      expect(axisValue(axisFraction(v, axis, space, t), axis, space, t)).toBeCloseTo(v, 6);
    }
  });

  it('knows which axes straddle zero', () => {
    expect(isSignedAxis([-1.34, 1.34])).toBe(true);
    expect(isSignedAxis([0, 2])).toBe(false);
  });
});

describe('pearson', () => {
  it('is 1 on a positive linear relation and -1 on a negative one', () => {
    expect(pearson([1, 2, 3, 4, 5, 6, 7, 8], [2, 4, 6, 8, 10, 12, 14, 16])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4, 5, 6, 7, 8], [8, 7, 6, 5, 4, 3, 2, 1])).toBeCloseTo(-1, 12);
  });

  it('pairs only where BOTH have data, rather than treating a gap as zero', () => {
    // Every score lane carries its own no-data mask: phastCons is undefined over 0.65% of the
    // genome and Shorkie cannot score the first 1,024 bases of a chromosome.
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const b = [2, 4, 6, 8, 10, 12, 14, 16, 18];
    const holed = [...b]; holed[0] = null as unknown as number;
    expect(pearson(a, holed)).toBeCloseTo(1, 12);
  });

  it('returns null rather than a number it cannot compute', () => {
    expect(pearson([1, 2, 3], [1, 2, 3])).toBeNull();              // too few pairs
    expect(pearson([1, 1, 1, 1, 1, 1, 1, 1], [1, 2, 3, 4, 5, 6, 7, 8])).toBeNull();  // constant
  });
});

describe('exportRows', () => {
  it('names the bin size in the header, so a bin mean is never read as a per-base value', () => {
    const rows = exportRows('chrIV', 1000, 64, [{ id: 'lm-masked', units: 'bits' }], [[0.5, null, 1.25]]);
    expect(rows[0]).toBe('chrom,start,end,lm-masked (bits, mean of 64 bp)');
    expect(rows[1]).toBe('chrIV,1000,1064,0.5');
    expect(rows[2]).toBe('chrIV,1064,1128,');                      // unscored is EMPTY, not 0
    expect(rows[3]).toBe('chrIV,1128,1192,1.25');
  });

  it('omits the bin note at base resolution', () => {
    expect(exportRows('chrI', 0, 1, [{ id: 'gc', units: 'fraction' }], [[0.4]])[0])
      .toBe('chrom,start,end,gc (fraction)');
  });
});

describe('laneExcluder', () => {
  it('excludes nothing when unset', () => {
    for (const spec of [undefined, null, '', '  ', ',,']) {
      expect(laneExcluder(spec)('lm-masked')).toBe(false);
    }
  });

  it('treats a trailing hyphen as a PREFIX, so a new lane of that family is excluded too', () => {
    // The point of the prefix form: `/shorkie-lab/shorkie/` is about the expression model, and a
    // language-model lane added later must not appear there without anyone editing that page.
    const hidden = laneExcluder('lm-');
    expect(hidden('lm-masked')).toBe(true);
    expect(hidden('lm-unmasked')).toBe(true);
    expect(hidden('lm-anything-added-later')).toBe(true);
    expect(hidden('sk-rnaseq')).toBe(false);
    expect(hidden('phastcons')).toBe(false);
  });

  it('matches an id without a trailing hyphen EXACTLY, never as a prefix', () => {
    // `gc` must not also hide a future `gc-content-something`, and `sk` must not hide every
    // expression lane -- an id is an id unless it is deliberately written as a family.
    const hidden = laneExcluder('gc,tfbs_pwm');
    expect(hidden('gc')).toBe(true);
    expect(hidden('tfbs_pwm')).toBe(true);
    expect(hidden('gc-content')).toBe(false);
    expect(hidden('tfbs_chip')).toBe(false);
  });

  it('accepts a mixed list and ignores whitespace', () => {
    const hidden = laneExcluder(' lm- , gc ');
    expect(['lm-masked', 'gc'].every(hidden)).toBe(true);
    expect(['sk-gradient', 'genes'].some(hidden)).toBe(false);
  });
});

describe('laneOrder', () => {
  const tracks = [
    { id: 'lm-masked', group: 'constraint' },
    { id: 'phastcons', group: 'comparative' },
    { id: 'sk-rnaseq', group: 'expression' },
    { id: 'sk-gradient', group: 'attribution' },
    { id: 'sk-h-h3', group: 'expression' },
    { id: 'gc', group: 'comparative' },
    { id: 'lm-unmasked', group: 'constraint' },
  ];
  const ORDER = ['constraint', 'expression', 'attribution', 'comparative'];
  const FEATURES = ['tfbs_chip', 'repeats'];

  it('sorts score tracks by group, whatever order the index lists them in', () => {
    // The shipped index interleaves the comparative lanes between the two networks -- the one
    // arrangement that hides the contrast the panel exists to draw.
    expect(laneOrder(tracks, ORDER, FEATURES).slice(0, 7)).toEqual([
      'lm-masked', 'lm-unmasked',
      'sk-rnaseq', 'sk-h-h3',
      'sk-gradient',
      'phastcons', 'gc',
    ]);
  });

  it('keeps the generator order inside a group, because families sit together there', () => {
    const many = [
      { id: 'a', group: 'expression' }, { id: 'b', group: 'expression' },
      { id: 'c', group: 'expression' },
    ];
    expect(laneOrder(many, ORDER, []).slice(0, 3)).toEqual(['a', 'b', 'c']);
  });

  it('puts the annotation lanes last, in the order they are drawn', () => {
    expect(laneOrder(tracks, ORDER, FEATURES).slice(-4))
      .toEqual(['sequence', 'tfbs_chip', 'repeats', 'genes']);
  });

  it('sorts an unknown group last rather than dropping it', () => {
    const out = laneOrder([...tracks, { id: 'mystery', group: 'nope' }], ORDER, []);
    expect(out).toContain('mystery');
    expect(out.indexOf('mystery')).toBeGreaterThan(out.indexOf('gc'));
  });

  it('tolerates a track with no group', () => {
    expect(laneOrder([{ id: 'x' }], ORDER, [])).toEqual(['x', 'sequence', 'genes']);
  });

  it('is a permutation: every track appears exactly once', () => {
    const out = laneOrder(tracks, ORDER, FEATURES);
    expect(new Set(out).size).toBe(out.length);
    for (const t of tracks) expect(out).toContain(t.id);
  });
});
