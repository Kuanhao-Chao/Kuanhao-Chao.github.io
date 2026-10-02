/** Seconds and a controller-selected amplitude (Ambient 1, Calm 0.45, static 0). */
export interface LifeClock {
  time: number;
  amount: number;
}

export interface LifePacket {
  t: number;
  alpha: number;
}

export interface LifeRain {
  /** Standard-normal z / 3.5 in [-1, 1]; illustrative, not calibrated uncertainty. */
  x: number;
  /** Falling position in [0, 1), mapped to the density drawing's height. */
  y: number;
  alpha: number;
}

export interface LifeBokeh {
  /** Viewport-normalized [-1, 1]: left/right and top/bottom respectively. */
  x: number;
  y: number;
  /** CSS pixels, unaffected by device-pixel ratio. */
  radius: number;
  alpha: number;
}

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
const amount = (clock: LifeClock): number => Math.max(0, Math.min(1, finite(clock.amount)));
const wrap = (value: number, period: number): number => {
  const remainder = value % period;
  const positive = remainder < 0 ? remainder + period : remainder;
  // Tiny negative values can round to exactly period; preserve a half-open cycle.
  return positive === 0 || positive === period ? 0 : positive;
};
// Bound identities before phase arithmetic, including fractional/negative indices.
const identity = (index: number): number => wrap(Math.trunc(finite(index)), 1024);
const phase = (index: number): number => wrap(identity(index) * 0.6180339887498949, 1);

// Acklam's rational inverse-normal approximation, needed only during initialization.
// This module only requests the lower half of the symmetric distribution.
function lowerNormalQuantile(p: number): number {
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((-0.007784894002430293 * q - 0.3223964580411365) * q - 2.400758277161838) * q -
        2.549732539343734) *
        q +
        4.374664141464968) *
        q +
        2.938163982698783) /
      ((((0.007784695709041462 * q + 0.3224671290700398) * q + 2.445134137142996) * q +
        3.754408661907416) *
        q +
        1)
    );
  }
  const q = p - 0.5,
    r = q * q;
  return (
    ((((((-39.69683028665376 * r + 220.9460984245205) * r - 275.9285104469687) * r +
      138.357751867269) *
      r -
      30.66479806614716) *
      r +
      2.506628277459239) *
      q) /
    (((((-54.47609879822406 * r + 161.5858368580409) * r - 155.6989798598866) * r +
      66.80131188771972) *
      r -
      13.28068155288572) *
      r +
      1)
  );
}

// 1024 midpoint strata of N(0,1) conditioned on |z| <= 3.5. Mirrored pairs
// guarantee symmetry even for small even populations. Bit-reversed half-ranks,
// starting in the middle, spread first-N samples instead of exhausting one tail.
const rainX = new Float64Array(1024);
const normalTail = 0.000232629079035525; // Standard-normal CDF(-3.5).
for (let pair = 0; pair < 512; pair++) {
  let rank = 0;
  for (let bit = 0; bit < 9; bit++) rank = (rank << 1) | ((pair >> bit) & 1);
  rank ^= 256;
  const p = normalTail + ((rank + 0.5) / 1024) * (1 - 2 * normalTail);
  const x = Math.max(-1, lowerNormalQuantile(p) / 3.5);
  rainX[pair * 2] = x;
  rainX[pair * 2 + 1] = -x;
}

export function readHead(clock: LifeClock, out: LifePacket = { t: 0, alpha: 0 }): LifePacket {
  out.t = wrap(finite(clock.time), 12) / 12;
  out.alpha = amount(clock);
  return out;
}

export function networkPackets(
  edge: number,
  clock: LifeClock,
  out: LifePacket = { t: 0, alpha: 0 }
): LifePacket {
  out.t = wrap(wrap(finite(clock.time), 4) / 4 + phase(edge), 1);
  out.alpha = amount(clock);
  return out;
}

export function rainSample(
  i: number,
  clock: LifeClock,
  out: LifeRain = { x: 0, y: 0, alpha: 0 }
): LifeRain {
  out.x = rainX[identity(i)];
  out.y = wrap(wrap(finite(clock.time), 7) / 7 + phase(i), 1);
  out.alpha = amount(clock);
  return out;
}

export function turntableYaw(clock: LifeClock): number {
  const strength = amount(clock);
  return strength === 0 ? 0 : 0.16 * strength * Math.sin(finite(clock.time) * 0.25);
}

export function streakStrength(dx: number, dy: number, clock: LifeClock): number {
  return amount(clock) * Math.min(1, Math.hypot(finite(dx), finite(dy)) / 24);
}

export function bokehDot(
  i: number,
  clock: LifeClock,
  out: LifeBokeh = { x: 0, y: 0, radius: 2, alpha: 0 }
): LifeBokeh {
  const index = identity(i),
    px = phase(index),
    py = phase(index + 71);
  const angle = (wrap(finite(clock.time), 60) / 60) * Math.PI * 2;
  out.x = 0.9 * (px * 2 - 1) + 0.1 * Math.sin(angle + px * Math.PI * 2);
  out.y = 0.9 * (py * 2 - 1) + 0.1 * Math.cos(angle + py * Math.PI * 2);
  out.radius = 2 + 4 * phase(index + 91);
  out.alpha = amount(clock) * (0.025 + 0.025 * Math.sin(angle + px * Math.PI * 2) ** 2);
  return out;
}
