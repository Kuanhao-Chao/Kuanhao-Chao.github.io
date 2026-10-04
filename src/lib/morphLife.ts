/** Seconds and a controller-selected amplitude (Ambient 1, Calm 0.45, static 0). */
export interface LifeClock {
  time: number;
  amount: number;
}

export interface LifePacket {
  t: number;
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

/** Seconds one pulse takes to leave the promoter and reach its site. */
export const PULSE_PERIOD = 3.5;
/**
 * A pulse riding attention arc `arc`: t runs 0 (at the promoter) to 1 (at the site) once every
 * PULSE_PERIOD seconds. Each arc has its own phase so the pulses do not move in step, and lane 1 is a
 * second pulse half a period behind the first.
 */
export function attentionPulse(
  arc: number,
  lane: number,
  clock: LifeClock,
  out: LifePacket = { t: 0, alpha: 0 }
): LifePacket {
  const behind = finite(lane) >= 1 ? 0.5 : 0;
  out.t = wrap(wrap(finite(clock.time), PULSE_PERIOD) / PULSE_PERIOD + phase(arc) + behind, 1);
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
