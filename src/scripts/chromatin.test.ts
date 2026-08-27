import { describe, expect, it } from 'vitest';
import { tubesGeometry } from './chromatin.ts';
import type { Vec3 } from '../lib/chromatinModel.ts';

/**
 * `tubesGeometry` concatenates many tube paths into one buffer so the metaphase array costs two
 * draw calls instead of 480. Concatenation means hand-computed index offsets, which is exactly
 * the kind of arithmetic that fails silently: a wrong offset does not throw, it draws the wrong
 * triangles. It shipped once with the per-path offset divided by the radial count a second
 * time, and the whole chromosome rendered as its bottom quarter.
 *
 * These need no WebGL — a BufferGeometry is plain typed arrays until something uploads it.
 */

function ring(y: number, r: number, n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i += 1) out.push([r * Math.cos(i), y + i, r * Math.sin(i)]);
  return out;
}

describe('tubesGeometry', () => {
  const radial = 6;
  const paths = [ring(0, 10, 15), ring(100, 12, 15), ring(200, 8, 15)];
  const g = tubesGeometry(paths, 3, radial);

  it('allocates exactly one ring of vertices per path sample', () => {
    const total = paths.reduce((n, p) => n + p.length, 0) * radial;
    expect(g.getAttribute('position').count).toBe(total);
    expect(g.getAttribute('normal').count).toBe(total);
  });

  it('keeps every index inside the buffer', () => {
    const idx = g.getIndex()!;
    const verts = g.getAttribute('position').count;
    for (let i = 0; i < idx.count; i += 1) {
      expect(idx.getX(i)).toBeGreaterThanOrEqual(0);
      expect(idx.getX(i)).toBeLessThan(verts);
    }
  });

  it('never lets one path index into another path vertices', () => {
    // the offset bug: each triangle must lie wholly within the vertex range of its own path
    const idx = g.getIndex()!;
    const bounds: [number, number][] = [];
    let start = 0;
    for (const p of paths) {
      bounds.push([start, start + p.length * radial]);
      start += p.length * radial;
    }
    const triCount = idx.count / 3;
    for (let t = 0; t < triCount; t += 1) {
      const a = idx.getX(t * 3);
      const b = idx.getX(t * 3 + 1);
      const c = idx.getX(t * 3 + 2);
      const owner = bounds.findIndex(([lo, hi]) => a >= lo && a < hi);
      expect(owner).toBeGreaterThanOrEqual(0);
      const [lo, hi] = bounds[owner];
      expect(b).toBeGreaterThanOrEqual(lo);
      expect(b).toBeLessThan(hi);
      expect(c).toBeGreaterThanOrEqual(lo);
      expect(c).toBeLessThan(hi);
    }
  });

  it('reaches the LAST path, which is what the bug hid', () => {
    const idx = g.getIndex()!;
    const verts = g.getAttribute('position').count;
    const lastPathStart = verts - paths[paths.length - 1].length * radial;
    let touched = 0;
    for (let i = 0; i < idx.count; i += 1) if (idx.getX(i) >= lastPathStart) touched += 1;
    expect(touched).toBeGreaterThan(0);
    // and every path gets the same share of triangles, since they are the same length
    expect(idx.count / 3).toBe(paths.length * (paths[0].length - 1) * radial * 2);
  });

  it('places every vertex one tube-radius from its centreline', () => {
    const pos = g.getAttribute('position');
    let v = 0;
    for (const path of paths) {
      for (const centre of path) {
        for (let j = 0; j < radial; j += 1, v += 1) {
          const d = Math.hypot(
            pos.getX(v) - centre[0],
            pos.getY(v) - centre[1],
            pos.getZ(v) - centre[2],
          );
          // Float32 absolute error scales with coordinate magnitude, so a fixed decimal
          // tolerance is the wrong shape of assertion -- bound it relative to the position.
          expect(Math.abs(d - 3)).toBeLessThan(1e-6 * (1 + Math.abs(centre[1])));
        }
      }
    }
  });

  it('widens the index type when a mesh outgrows 16 bits', () => {
    const many = Array.from({ length: 900 }, (_, i) => ring(i * 5, 4, 15));
    const big = tubesGeometry(many, 2, radial);
    expect(big.getAttribute('position').count).toBeGreaterThan(65535);
    const idx = big.getIndex()!;
    expect(idx.array).toBeInstanceOf(Uint32Array);
    const verts = big.getAttribute('position').count;
    for (let i = 0; i < idx.count; i += 97) expect(idx.getX(i)).toBeLessThan(verts);
  });
});
