/** Decode the tiler's 8-bit, non-interlaced grayscale PNGs as data, without image-size limits
 * or browser color management. Uses the native zlib decompressor; no imaging dependency.
 */
export async function decodeGenomeTile(buffer: ArrayBuffer): Promise<{ cols: number; rows: number; data: Uint8Array }> {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  if (bytes.length < 33 || [137,80,78,71,13,10,26,10].some((b, i) => bytes[i] !== b)) throw new Error('Invalid genome PNG');
  let cols = 0, rows = 0, ended = false;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = view.getUint32(offset), end = offset + 12 + size;
    if (end > bytes.length) throw new Error('Truncated genome PNG');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const p = offset + 8;
    if (type === 'IHDR') {
      if (offset !== 8 || size !== 13) throw new Error('Invalid PNG header');
      cols = view.getUint32(p); rows = view.getUint32(p + 4);
      if (!cols || cols > 65536 || ![1,3].includes(rows)
        || bytes[p + 8] !== 8 || bytes[p + 9] !== 0 || bytes[p + 10] || bytes[p + 11] || bytes[p + 12]) {
        throw new Error('Unsupported genome PNG format');
      }
    } else if (type === 'IDAT') chunks.push(bytes.slice(p, p + size));
    else if (type === 'IEND') { ended = true; break; }
    offset = end;
  }
  if (!cols || !chunks.length || !ended) throw new Error('Incomplete genome PNG');
  const raw = new Uint8Array(await new Response(new Blob(chunks).stream()
    .pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  if (raw.length !== (cols + 1) * rows) throw new Error('Invalid genome PNG scanlines');
  const data = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    const filter = raw[y * (cols + 1)];
    if (filter > 4) throw new Error('Invalid genome PNG filter');
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const left = x ? data[i - 1] : 0, up = y ? data[i - cols] : 0;
      const corner = x && y ? data[i - cols - 1] : 0;
      const p = left + up - corner;
      const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner);
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up
        : filter === 3 ? Math.floor((left + up) / 2) : a <= b && a <= c ? left : b <= c ? up : corner;
      data[i] = raw[y * (cols + 1) + x + 1] + predictor;
    }
  }
  return { cols, rows, data };
}
