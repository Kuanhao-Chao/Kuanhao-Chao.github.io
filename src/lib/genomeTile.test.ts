import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { decodeGenomeTile } from './genomeTile';

function png(cols: number, rows: number, raw: number[]): ArrayBuffer {
  const chunk = (type: string, data: Uint8Array) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length); out.write(type, 4); out.set(data, 8);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(cols); header.writeUInt32BE(rows, 4); header[8] = 8;
  const out = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from(raw))), chunk('IEND', Buffer.alloc(0))]);
  return Uint8Array.from(out).buffer;
}

describe('genome PNG data decoding', () => {
  it.each([0,1,2,3,4])('reconstructs grayscale PNG filter %i including missing and maximum bytes', async (filter) => {
    const rows = [[0,255,128,1],[12,3,250,4],[30,50,2,255]];
    const raw: number[] = [];
    rows.forEach((row, y) => {
      raw.push(filter);
      row.forEach((value, x) => {
        const a = row[x-1] ?? 0, b = rows[y-1]?.[x] ?? 0, c = rows[y-1]?.[x-1] ?? 0;
        // Independent reference Paeth: choose the nearest predictor with left/up/corner tie order.
        const paeth = [a,b,c].map((v, i) => ({ v, i, distance: Math.abs(a+b-c-v) }))
          .sort((u, v) => u.distance-v.distance || u.i-v.i)[0].v;
        const predictors = [0,a,b,Math.floor((a+b)/2),paeth];
        raw.push((value-predictors[filter]+256)%256);
      });
    });
    expect(Array.from((await decodeGenomeTile(png(4,3,raw))).data)).toEqual(rows.flat());
  });

  it('rejects truncated and unsupported inputs instead of drawing an empty lane', async () => {
    await expect(decodeGenomeTile(new ArrayBuffer(10))).rejects.toThrow('Invalid genome PNG');
    await expect(decodeGenomeTile(png(1,2,[0,1,0,2]))).rejects.toThrow('Unsupported');
    await expect(decodeGenomeTile(png(2,1,[0,1]))).rejects.toThrow('scanlines');
  });

  it.each([
    ['lm-masked/L0/13', '65547528c90c295308c594b2f4379526917a3dfd4f14488691fddf14bbe541b5'],
    ['lm-masked/L2/0', 'f5214f2e536d3e8a4850c842e8251adecb5cde9b289e0c19c2c659340ee8305a'],
    ['sk-rnaseq/L2/0', '125288b7cfadc0afd8a3dca1b07225e828fcbc953c2ad10341e184d4ff658ee8'],
  ])('decodes shipped tile %s against an independent Pillow digest', async (path, digest) => {
    const data = Uint8Array.from(readFileSync(`public/genome-data/chrVII/${path}.png`));
    const tile = await decodeGenomeTile(data.buffer);
    expect(tile.cols).toBe(65536);
    expect(createHash('sha256').update(tile.data).digest('hex')).toBe(digest);
  });
});
