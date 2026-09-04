import { describe, it, expect } from 'vitest';
import {
  LOCUS_LEN, LANE_HEIGHTS, viewportLanes, projectedLogoColumns, hypotheticalLogoColumns,
  scalarLogoColumns, maxLettersPerColumn, windowView, clampWindowView, lettersVisible,
  defaultView, zoomReadout, binsForRange, bpForBin, type ViewportState,
} from './shorkieViewport';
import { laneLayout, laneAt, MIN_VIEW_BP } from './genomeBrowser';
import { ismSaliency, logoColumn, BASES, BIN_BP, CROP_BP, N_BINS } from './shorkieModel';

const base = (over: Partial<ViewportState> = {}): ViewportState => ({
  hasIsm: true, hasAnchor: true, hasIg: true, hasOccl: true, hasRollout: false,
  hasAnnotation: true, outputTrack: null, anchorExact: true, letters: false,
  ismHypothetical: false, annotationHeight: 60, ...over,
});

const ids = (s: ViewportState) => viewportLanes(s).map((l) => l.id);

describe('viewportLanes', () => {
  it('always draws a ruler first, and genes after every data lane', () => {
    const l = ids(base());
    expect(l[0]).toBe('ruler');
    expect(l.indexOf('genes')).toBeGreaterThan(l.indexOf('occl'));
    expect(l.indexOf('genes')).toBeLessThan(l.indexOf('annotation'));
  });

  it('omits a lane whose pack is not loaded rather than drawing it empty', () => {
    expect(ids(base({ hasIsm: false }))).not.toContain('ism');
    expect(ids(base({ hasOccl: false }))).not.toContain('occl');
    expect(ids(base({ hasAnnotation: false }))).not.toContain('annotation');
    // Attention rollout needs a live forward pass, so it is absent by default.
    expect(ids(base())).not.toContain('rollout');
    expect(ids(base({ hasRollout: true }))).toContain('rollout');
  });

  it('adds the picked output track as its own lane, labelled with the track name', () => {
    expect(ids(base())).not.toContain('track');
    const lanes = viewportLanes(base({ outputTrack: 'ARG80_T0_S757' }));
    const t = lanes.find((l) => l.id === 'track');
    expect(t?.label).toBe('ARG80_T0_S757');
    // It sits with the prediction it belongs to, above every attribution lane.
    const order = lanes.map((l) => l.id);
    expect(order.indexOf('track')).toBeGreaterThan(order.indexOf('coverage'));
    expect(order.indexOf('track')).toBeLessThan(order.indexOf('ism'));
  });

  it('draws no logo and no sequence until the view is zoomed far enough', () => {
    const zoomedOut = ids(base({ letters: false }));
    expect(zoomedOut).not.toContain('sequence');
    expect(zoomedOut.filter((i) => i.endsWith('-logo'))).toEqual([]);
    const zoomedIn = ids(base({ letters: true }));
    expect(zoomedIn).toContain('sequence');
    expect(zoomedIn).toEqual(expect.arrayContaining(['ism-logo', 'grad-logo', 'ig-logo']));
  });

  it('keeps the sequence directly above the genes it annotates', () => {
    const l = ids(base({ letters: true }));
    expect(l[l.indexOf('sequence') + 1]).toBe('genes');
  });
});

describe('resolution honesty', () => {
  it('gives gradient x input single bases only at an exact anchor, and says so otherwise', () => {
    const exact = viewportLanes(base({ anchorExact: true })).find((l) => l.id === 'grad')!;
    expect(exact.resolutionBp).toBe(1);
    expect(exact.degraded).toBeUndefined();

    const loose = viewportLanes(base({ anchorExact: false })).find((l) => l.id === 'grad')!;
    expect(loose.resolutionBp).toBe(128);
    expect(loose.degraded).toMatch(/128 bp/);
  });

  it('drops the gradient logos when the region is not an anchor, rather than drawing 128 bp letters',
    () => {
      const l = ids(base({ anchorExact: false, letters: true }));
      expect(l).toContain('ism-logo');       // mutagenesis is unconditional and always per base
      expect(l).not.toContain('grad-logo');
      expect(l).not.toContain('ig-logo');
      expect(l).toContain('sequence');
    });

  it('never lets a method lane claim finer than its own step', () => {
    const lanes = viewportLanes(base({ hasRollout: true }));
    const byId = Object.fromEntries(lanes.map((l) => [l.id, l]));
    expect(byId.ism.resolutionBp).toBe(1);
    expect(byId.occl.resolutionBp).toBe(64);
    expect(byId.rollout.resolutionBp).toBe(128);
    expect(byId.coverage.resolutionBp).toBe(BIN_BP);
  });

  it('names the scalar each attribution lane scored, because they are not the same one', () => {
    const lanes = viewportLanes(base());
    const ism = lanes.find((l) => l.id === 'ism')!;
    const grad = lanes.find((l) => l.id === 'grad')!;
    expect(ism.target).toMatch(/gene body/);
    expect(grad.target).toMatch(/traced region/);
    expect(ism.target).not.toBe(grad.target);
  });

  it('marks exactly the lanes that grow both ways from a zero rule', () => {
    const signed = viewportLanes(base({ hasRollout: true, letters: true }))
      .filter((l) => l.signed).map((l) => l.id).sort();
    expect(signed).toEqual(
      ['grad', 'grad-logo', 'ig', 'ig-logo', 'ism', 'ism-logo', 'occl'],
    );
  });

  it('gives every lane a short name for the gutter', () => {
    for (const l of viewportLanes(base({ letters: true, hasRollout: true, outputTrack: 'x' }))) {
      expect(l.short.length).toBeGreaterThan(0);
      expect(l.short.length).toBeLessThanOrEqual(8);
    }
  });
});

describe('logo columns — the one invariant the three lanes differ on', () => {
  const seq = 'ACGTACGT';
  // A 4 x 8 plane: `alt - ref`, reference cell zero, as the packs store it.
  const plane = new Float64Array(4 * seq.length);
  for (let i = 0; i < seq.length; i += 1) {
    const ref = BASES.indexOf(seq[i] as never);
    for (let b = 0; b < 4; b += 1) plane[b * seq.length + i] = b === ref ? 0 : (b + 1) * (i + 1) * 0.01;
  }

  it('a gradient logo has exactly one non-zero letter per column, by construction', () => {
    const vals = new Float64Array([0.4, -0.2, 0.9, 0, -0.5, 0.1, 0.3, -0.7]);
    const cols = scalarLogoColumns(vals, seq, 0, seq.length);
    for (let i = 0; i < cols.length; i += 1) {
      const nz = [...cols[i]].filter((v) => v !== 0).length;
      expect(nz).toBeLessThanOrEqual(1);
      // and the letter it carries is the base that is actually there
      if (vals[i] !== 0) expect(cols[i][BASES.indexOf(seq[i] as never)]).toBe(vals[i]);
    }
  });

  it('the projected mutagenesis logo is also one letter, and equals the paper saliency', () => {
    const sal = ismSaliency(plane, seq.length, seq, 0);
    const cols = projectedLogoColumns(sal, seq, 0, seq.length);
    for (let i = 0; i < seq.length; i += 1) {
      expect([...cols[i]].filter((v) => v !== 0).length).toBeLessThanOrEqual(1);
      expect(cols[i][BASES.indexOf(seq[i] as never)]).toBeCloseTo(sal[i], 12);
    }
  });

  it('the hypothetical mutagenesis logo carries all four, and reduces to the projected one', () => {
    const cols = hypotheticalLogoColumns(plane, seq.length, 0, seq.length);
    const sal = ismSaliency(plane, seq.length, seq, 0);
    for (let i = 0; i < seq.length; i += 1) {
      // mean-centred, so the column sums to zero
      expect([...cols[i]].reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
      // and the reference letter is exactly what the projection keeps
      expect(cols[i][BASES.indexOf(seq[i] as never)]).toBeCloseTo(sal[i], 12);
      expect([...cols[i]].filter((v) => v !== 0).length).toBe(4);
    }
  });

  it('reports how many letters each lane can carry', () => {
    expect(maxLettersPerColumn('ism-logo', true)).toBe(4);
    expect(maxLettersPerColumn('ism-logo', false)).toBe(1);
    expect(maxLettersPerColumn('grad-logo', true)).toBe(1);
    expect(maxLettersPerColumn('ig-logo', false)).toBe(1);
  });

  it('feeds logoColumn, which never emits more letters than the column has non-zeros', () => {
    const cols = hypotheticalLogoColumns(plane, seq.length, 0, seq.length);
    for (const c of cols) expect(logoColumn(c).length).toBeLessThanOrEqual(4);
    const one = scalarLogoColumns(new Float64Array([1, 2, 3, 4, 5, 6, 7, 8]), seq, 0, seq.length);
    for (const c of one) expect(logoColumn(c).length).toBe(1);
  });

  it('returns an empty column outside the plane rather than reading past it', () => {
    const cols = hypotheticalLogoColumns(plane, seq.length, seq.length - 2, 4);
    expect(cols).toHaveLength(4);
    expect([...cols[2]]).toEqual([0, 0, 0, 0]);
    expect([...cols[3]]).toEqual([0, 0, 0, 0]);
  });
});

describe('the view', () => {
  it('clamps to the window and never below the zoom floor', () => {
    expect(clampWindowView(-500, 100)).toEqual({ start: 0, end: 600 });
    expect(clampWindowView(LOCUS_LEN - 50, LOCUS_LEN + 500))
      .toEqual({ start: LOCUS_LEN - 550, end: LOCUS_LEN });
    expect(clampWindowView(100, 101).end - clampWindowView(100, 101).start).toBe(MIN_VIEW_BP);
  });

  it('opens on the promoter of the window own gene, on either strand', () => {
    const plus = defaultView(8000, '+');
    expect(plus.start).toBeLessThan(8000);
    expect(plus.end - plus.start).toBe(400);
    const minus = defaultView(8000, '-');
    expect(minus.start).toBeGreaterThan(plus.start);
    // A locus with no gene falls back to the window centre rather than to bp 0.
    const none = defaultView(null, '+');
    expect(none.start).toBeGreaterThan(LOCUS_LEN / 4);
  });

  it('turns letters on only once a base is wide enough to be a letter', () => {
    expect(lettersVisible(windowView(0, LOCUS_LEN), 1200)).toBe(false);
    expect(lettersVisible(windowView(8000, 8150), 1200)).toBe(true);
    // and the phone must be able to reach it at the zoom floor
    expect(lettersVisible(windowView(8000, 8000 + MIN_VIEW_BP), 252)).toBe(true);
  });

  it('prints both coordinate systems, because neither alone is enough', () => {
    const r = zoomReadout(windowView(8192, 8342), 'chrVII', 875118);
    expect(r).toContain('chrVII:883,311–883,460');
    expect(r).toContain('window 8,192–8,342');
    expect(r).toContain('150 bp');
    expect(zoomReadout(windowView(0, 16384), 'chrI', 0)).toContain('16 kb');
  });
});

describe('bins and base pairs', () => {
  it('starts bin 0 at the crop, not at bp 0', () => {
    expect(bpForBin(0)).toEqual({ start: CROP_BP, end: CROP_BP + BIN_BP });
    expect(binsForRange(CROP_BP, CROP_BP + BIN_BP)).toEqual({ start: 0, end: 1 });
  });

  it('round-trips every bin', () => {
    for (const b of [0, 1, 435, N_BINS - 1]) {
      const { start, end } = bpForBin(b);
      expect(binsForRange(start, end)).toEqual({ start: b, end: b + 1 });
    }
  });

  it('clamps the uncropped flanks to the ends rather than returning negative bins', () => {
    expect(binsForRange(0, 10)).toEqual({ start: 0, end: 0 });
    expect(binsForRange(LOCUS_LEN - 10, LOCUS_LEN)).toEqual({ start: N_BINS, end: N_BINS });
  });
});

describe('stacking, through the shared layout', () => {
  it('stacks the viewport lanes with no overlap and a height that includes the trailing gap', () => {
    const specs = viewportLanes(base({ letters: true, outputTrack: 'x', hasRollout: true }));
    const { lanes, total } = laneLayout(specs, 8);
    expect(lanes).toHaveLength(specs.length);
    for (let i = 1; i < lanes.length; i += 1) {
      expect(lanes[i].boxTop).toBe(lanes[i - 1].boxTop + lanes[i - 1].boxHeight);
    }
    const last = lanes[lanes.length - 1];
    // The gap is LEADING -- `top` is `boxTop + gap` -- so the total lands exactly on the last
    // lane's content bottom and a canvas sized at `total` clips nothing. Sizing it from
    // `last.top + last.height` happens to be the same number here, and sizing it from `boxTop`
    // alone would cut the whole last lane.
    expect(total).toBe(last.boxTop + last.boxHeight);
    expect(total).toBe(last.top + last.height);
    expect(lanes[0].top).toBe(8);
  });

  it('hit-tests back to the lane that was stacked, keeping the viewport fields', () => {
    const { lanes } = laneLayout(viewportLanes(base({ letters: true })), 8);
    const seq = lanes.find((l) => l.id === 'sequence')!;
    const hit = laneAt(lanes, seq.top + 2);
    expect(hit?.id).toBe('sequence');
    expect(hit?.kind).toBe('sequence');
    expect(hit?.short).toBe('seq');
  });

  it('grows when a logo appears, which is what makes the panel height dynamic', () => {
    const out = laneLayout(viewportLanes(base({ letters: false })), 8).total;
    const inn = laneLayout(viewportLanes(base({ letters: true })), 8).total;
    expect(inn - out).toBe(3 * (LANE_HEIGHTS.logo + 8) + LANE_HEIGHTS.sequence + 8);
  });
});
