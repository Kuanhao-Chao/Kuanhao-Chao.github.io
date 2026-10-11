import { describe, expect, it } from 'vitest';
import { graphPositions, graphConnection } from './common';

describe('Lesson graph layout', () => {
  it('leaves room above cyclic nodes for visible self-loops', () => {
    const positions = graphPositions(['AA'], [{ from: 'AA', to: 'AA' }]);
    expect(positions.get('AA')?.y).toBeGreaterThanOrEqual(85);
  });

  it('preserves top clearance in crowded cyclic and rooted layouts', () => {
    const ids = Array.from({ length: 16 }, (_, i) => `node:${i}`);
    const cyclic = graphPositions(
      ids,
      ids.map((id) => ({ from: id, to: id }))
    );
    const rooted = graphPositions(
      ids,
      ids.slice(1).map((id) => ({ from: ids[0], to: id }))
    );
    for (const map of [cyclic, rooted]) {
      expect(map.size).toBe(ids.length);
      for (const p of map.values()) expect(p.y).toBeGreaterThanOrEqual(85);
    }
  });

  it('separates reciprocal transitions and their probability labels', () => {
    const a = { id: 'Intron', x: 420, y: 225 };
    const b = { id: 'Exon_Int', x: 580, y: 100 };
    const forward = graphConnection(a, b, true);
    const reverse = graphConnection(b, a, true);
    expect(forward.path).not.toBe(reverse.path);
    expect(
      Math.hypot(forward.labelX - reverse.labelX, forward.labelY - reverse.labelY)
    ).toBeGreaterThan(40);
  });

  it('attaches a vertical transition to the circle boundary rather than its left side', () => {
    const from = { id: 'M', x: 100, y: 100 };
    const to = { id: 'I', x: 100, y: 220 };
    expect(graphConnection(from, to, false).path).toMatch(/^M 100 127 Q .* 100 190$/);
  });

  it('keeps a supported 24-vertex path legible instead of squeezing it into 760px', () => {
    const ids = Array.from({ length: 24 }, (_, i) => `vertex:${i}`);
    const edges = ids.slice(1).map((id, i) => ({ from: ids[i], to: id }));
    const positions = graphPositions(ids, edges);
    for (const edge of edges) {
      const from = positions.get(edge.from)!,
        to = positions.get(edge.to)!;
      expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeGreaterThanOrEqual(90);
    }
  });

  it('keeps distinct nodes separated across paths, stars, cycles and loops through 24 vertices', () => {
    for (let n = 1; n <= 24; n++) {
      const ids = Array.from({ length: n }, (_, i) => `v:${i}`);
      const patterns = [
        ids.slice(1).map((id, i) => ({ from: ids[i], to: id })),
        ids.slice(1).map((id) => ({ from: ids[0], to: id })),
        ids.map((id, i) => ({ from: id, to: ids[(i + 1) % n] })),
        ids.map((id) => ({ from: id, to: id })),
      ];
      for (const edges of patterns) {
        const points = [...graphPositions(ids, edges).values()];
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++)
            expect(
              Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)
            ).toBeGreaterThanOrEqual(60);
      }
    }
  });
});
