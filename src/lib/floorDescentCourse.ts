/** Original, seeded pattern kit. Coordinates and timing belong to our game, not NS-Shaft. */
export type PlatformKind = 'normal' | 'crumble' | 'spikes' | 'spring' | 'left' | 'right';
export interface Platform {
  id: number;
  row: number;
  x: number;
  y: number;
  width: number;
  kind: PlatformKind;
  touched: number | null;
  broken: boolean;
}
const PATTERNS = [
  [-1, 1, -1, 1, 0, -1, 1, -1, 1, -1],
  [1, -1, 1, -1, 1, 0, -1, 1, -1, 1],
  [-1, 1, 0, -1, 1, -1, 1, -1, 1, -1],
  [1, -1, 1, 0, -1, 1, -1, 1, -1, 1],
  [-1, 1, -1, 1, -1, 1, 0, -1, 1, -1],
  [1, -1, 1, -1, 1, -1, 1, 0, -1, 1],
  [-1, 1, -1, 1, -1, 1, -1, 1, -1, 1],
  [1, -1, 1, -1, 1, -1, 1, -1, 1, -1],
] as const;
const FALLBACK = [-1, 1, -1, 1, -1, 1, -1, 1, -1, 1] as const;
// Every connector uses the same three-lane envelope. Even the worst mirrored
// seam leaves <65 units to cross after the player's collision radius, within
// one 70-unit drop. Validate before using a kit; never rejection-sample forever.
function safePattern(candidate: readonly number[] | undefined): readonly number[] {
  return candidate?.length === 10 && candidate.every((n) => Number.isInteger(n) && Math.abs(n) <= 1)
    ? candidate
    : FALLBACK;
}
export function noise(seed: number, index: number, salt = 0) {
  let n = (seed ^ Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(salt + 1, 0x27d4eb2d)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function courseRow(seed: number, row: number, trial = false): Platform[] {
  if (trial && row > 500) return [];
  const chunk = Math.floor(Math.max(0, row - 1) / 10),
    floor = Math.max(0, Math.floor(row / 5));
  const pattern = safePattern(PATTERNS[Math.floor(noise(seed, chunk, 7) * PATTERNS.length)]);
  const mirrored = noise(seed, chunk, 8) > 0.5 ? 1 : -1;
  const lane = row <= 0 ? 0 : pattern[(row - 1) % 10] * mirrored;
  const finish = trial && row >= 495;
  const width = row === 0 || finish ? 160 : 114 - Math.min(22, floor * 0.22);
  const center = row === 0 || finish ? 210 : 210 + lane * 78 + (noise(seed, row, 2) - 0.5) * 16;
  const r = noise(seed, row, 3);
  let kind: PlatformKind = 'normal';
  if (floor >= 5 && r > 0.72) kind = noise(seed, row, 4) > 0.5 ? 'left' : 'right';
  if (floor >= 9 && r > 0.48 && r <= 0.65) kind = 'crumble';
  if (row <= 0 || finish) kind = 'normal';
  const primary: Platform = {
    id: row * 2,
    row,
    x: center - width / 2,
    y: 330 + row * 70,
    width,
    kind,
    touched: null,
    broken: false,
  };
  const floors = [primary];
  // Optional hazards never replace the baseline route. A minimum 24-unit gap
  // prevents overlapping collision surfaces and ambiguous trap silhouettes.
  if (floor >= 13 && !finish && noise(seed, row, 5) > 0.52) {
    const side = center > 210 ? 28 : 292;
    if (side + 100 + 24 <= primary.x || side >= primary.x + width + 24)
      floors.push({
        id: row * 2 + 1,
        row,
        x: side,
        y: primary.y,
        width: 100,
        kind: floor >= 17 && noise(seed, row, 6) > 0.35 ? 'spikes' : 'spring',
        touched: null,
        broken: false,
      });
  }
  return floors;
}
