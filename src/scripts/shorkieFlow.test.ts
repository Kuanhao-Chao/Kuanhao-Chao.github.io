/**
 * The index arithmetic behind the flow canvas.
 *
 * These need no DOM. `stageMap`, `attentionMap` and `nearestStage` are top-level exports that
 * take plain typed arrays and the stage table, so they can be driven directly -- the same seam
 * `chromatin.test.ts` uses to test `tubesGeometry` without a GL context. Nothing here calls
 * `createFlow`, which is the only part that touches a canvas.
 *
 * A wrong slice here does not throw. It draws another stage's neurons under this stage's label,
 * which is exactly the class of bug that shipped when the transformer layers were missing from
 * the exported tensor and silently fell through to their attention matrices.
 */

import { describe, expect, it } from 'vitest';
import { FLOW_STAGES, stageMap, attentionMap, nearestStage, type FlowActivations } from './shorkieFlow';
import { N_ATTN_LAYERS, STAGE_MAP_POSITIONS, stageMapOffsets } from '../lib/shorkieModel';

/** Activations whose every value encodes where it came from, so a mis-slice is detectable. */
function markedActivations(): FlowActivations {
  const stageMaps = new Float32Array(5760 * STAGE_MAP_POSITIONS);
  // Each channel is filled with its own global channel index. A slice that starts in the wrong
  // place therefore reports the wrong channel numbers rather than merely looking different.
  for (let c = 0; c < 5760; c += 1) {
    stageMaps.fill(c, c * STAGE_MAP_POSITIONS, (c + 1) * STAGE_MAP_POSITIONS);
  }
  const attention = new Float32Array(N_ATTN_LAYERS * 128 * 128);
  for (let l = 0; l < N_ATTN_LAYERS; l += 1) {
    attention.fill(l, l * 128 * 128, (l + 1) * 128 * 128);
  }
  return {
    stemProfile: new Float32Array(96 * 1024).fill(-1),
    stageMaps,
    attention,
    tracks: new Float32Array(896 * 4).fill(-2),
  };
}

const byId = (id: string) => FLOW_STAGES.find((s) => s.id === id)!;

describe('stageMap', () => {
  const acts = markedActivations();

  it('returns null with no activations, so an unrun model draws outlines not garbage', () => {
    for (const s of FLOW_STAGES) expect(stageMap(s, null)).toBeNull();
  });

  it('resolves every one of the twenty stages', () => {
    expect(FLOW_STAGES).toHaveLength(20);
    for (const s of FLOW_STAGES) {
      const m = stageMap(s, acts);
      expect(m, `stage ${s.id} has no map`).not.toBeNull();
      expect(m!.data.length).toBe(m!.channels * m!.positions);
    }
  });

  it('gives each stage the slice stageMapOffsets says it owns', () => {
    for (const off of stageMapOffsets()) {
      const m = stageMap(byId(off.id), acts)!;
      expect(m.channels).toBe(off.channels);
      expect(m.positions).toBe(STAGE_MAP_POSITIONS);
      // The marker: first and last channel of the slice must be the global channel indices.
      expect(m.data[0]).toBe(off.start);
      expect(m.data[(off.channels - 1) * off.positions]).toBe(off.start + off.channels - 1);
    }
  });

  it('draws the transformer layers from their own feature maps, not from attention', () => {
    // The defect this whole export change exists to fix: eight of twenty stages had no feature
    // map, fell through to a 128x128 attention matrix, and rendered near-blank.
    for (let i = 1; i <= N_ATTN_LAYERS; i += 1) {
      const m = stageMap(byId(`attn${i}`), acts)!;
      expect(m.channels).toBe(384);
      expect(m.positions).toBe(128);
      expect(m.channels * m.positions).not.toBe(128 * 128); // would be the attention matrix
    }
  });

  it('gives consecutive transformer layers disjoint slices', () => {
    const a = stageMap(byId('attn1'), acts)!;
    const b = stageMap(byId('attn2'), acts)!;
    expect(a.data[0]).not.toBe(b.data[0]);
    expect(b.data[0] - a.data[0]).toBe(384);
  });

  it('keeps the stem and head on their own tensors at their own resolutions', () => {
    const stem = stageMap(byId('stem'), acts)!;
    expect([stem.channels, stem.positions]).toEqual([96, 1024]);
    expect(stem.data[0]).toBe(-1);
    const head = stageMap(byId('head'), acts)!;
    expect([head.channels, head.positions]).toEqual([4, 896]);
    expect(head.data[0]).toBe(-2);
  });

  it('never slices past the end of the tensor it reads', () => {
    for (const s of FLOW_STAGES) {
      const m = stageMap(s, acts)!;
      expect(m.data.length).toBeGreaterThan(0);
      expect(Number.isFinite(m.data[m.data.length - 1])).toBe(true);
    }
  });
});

describe('attentionMap', () => {
  const acts = markedActivations();

  it('returns a 128x128 map for each transformer layer, and the right one', () => {
    for (let i = 1; i <= N_ATTN_LAYERS; i += 1) {
      const m = attentionMap(byId(`attn${i}`), acts)!;
      expect(m.length).toBe(128 * 128);
      expect(m[0]).toBe(i - 1); // the marker is the layer index
    }
  });

  it('is null for every stage that is not a transformer layer', () => {
    for (const s of FLOW_STAGES) {
      if (!s.id.startsWith('attn')) expect(attentionMap(s, acts)).toBeNull();
    }
  });

  it('is null without activations', () => {
    expect(attentionMap(byId('attn1'), null)).toBeNull();
  });
});

describe('nearestStage', () => {
  it('picks the containing stage when the point is inside one', () => {
    FLOW_STAGES.forEach((s, i) => {
      expect(nearestStage(s.x + s.width / 2, FLOW_STAGES)).toBe(i);
    });
  });

  it('never leaves a click unresolved -- the gaps belong to a stage too', () => {
    // Twenty blocks with gaps between them; requiring a hit inside a block silently deselects
    // over a third of the canvas.
    for (let f = 0; f <= 1.0001; f += 0.001) {
      const i = nearestStage(f, FLOW_STAGES);
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(FLOW_STAGES.length);
    }
  });

  it('clamps outside [0, 1] to the end stages', () => {
    expect(nearestStage(-5, FLOW_STAGES)).toBe(0);
    expect(nearestStage(5, FLOW_STAGES)).toBe(FLOW_STAGES.length - 1);
  });

  it('is monotone in x: moving right never selects an earlier stage', () => {
    let prev = -1;
    for (let f = 0; f <= 1.0001; f += 0.002) {
      const i = nearestStage(f, FLOW_STAGES);
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
  });

  it('resolves a point in a gap to one of the two stages bounding it', () => {
    const a = FLOW_STAGES[3];
    const b = FLOW_STAGES[4];
    const mid = (a.x + a.width + b.x) / 2;
    expect([3, 4]).toContain(nearestStage(mid, FLOW_STAGES));
  });
});
