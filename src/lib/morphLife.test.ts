import { expect, it } from 'vitest';
import {
  bokehDot,
  networkPackets,
  rainSample,
  readHead,
  streakStrength,
  turntableYaw,
} from './morphLife';

it('moves the read-head through a twelve-second cycle and wraps negative time', () => {
  expect(readHead({ time: 0, amount: 1 })).toEqual({ t: 0, alpha: 1 });
  expect(readHead({ time: 3, amount: 1 })).toEqual({ t: 0.25, alpha: 1 });
  expect(readHead({ time: 12, amount: 1 })).toEqual({ t: 0, alpha: 1 });
  expect(readHead({ time: -3, amount: 1 })).toEqual({ t: 0.75, alpha: 1 });
});

it('travels along network edges every four seconds with stable distinct phases', () => {
  expect(networkPackets(0, { time: 0, amount: 1 })).toEqual({ t: 0, alpha: 1 });
  expect(networkPackets(0, { time: 1, amount: 1 })).toEqual({ t: 0.25, alpha: 1 });
  expect(networkPackets(0, { time: -1, amount: 1 })).toEqual({ t: 0.75, alpha: 1 });
  const phases = new Set<number>();
  for (let edge = 0; edge < 28; edge++) {
    const start = networkPackets(edge, { time: 0, amount: 1 });
    phases.add(start.t);
    expect(networkPackets(edge, { time: 4, amount: 1 })).toEqual(start);
    expect(networkPackets(edge, { time: 1, amount: 1 }).t).toBeCloseTo(
      start.t < 0.75 ? start.t + 0.25 : start.t - 0.75,
      12
    );
  }
  expect(phases.size).toBe(28);
});

it('falls through normalized density space every seven seconds without changing sample x', () => {
  const origin = rainSample(0, { time: 0, amount: 1 });
  expect(origin.y).toBe(0);
  expect(origin.alpha).toBeGreaterThan(0);
  expect(rainSample(0, { time: 3.5, amount: 1 }).y).toBe(0.5);
  expect(rainSample(0, { time: -1.75, amount: 1 }).y).toBe(0.75);
  for (const index of [0, 1, 9, 1023]) {
    const start = rainSample(index, { time: 0, amount: 1 });
    expect(rainSample(index, { time: 7, amount: 1 })).toEqual(start);
    expect(rainSample(index, { time: 2, amount: 1 }).x).toBe(start.x);
  }
});

it('concentrates rain samples like a standard normal rather than uniformly across x', () => {
  const xs = Array.from({ length: 1024 }, (_, i) => rainSample(i, { time: 0, amount: 1 }).x);
  const sorted = [...xs].sort((a, b) => a - b);
  // Independently known N(0,1) quartiles ±0.67449, in a ±3.5 drawing domain.
  expect(sorted[256]).toBeCloseTo(-0.19271, 2);
  expect(sorted[767]).toBeCloseTo(0.19271, 2);
  expect(xs.filter((x) => Math.abs(x) < 1 / 3.5).length).toBeGreaterThan(690);
  expect(xs.filter((x) => Math.abs(x) < 1 / 3.5).length).toBeLessThan(710);
  expect(xs.filter((x) => Math.abs(x) < 2 / 3.5).length).toBeGreaterThan(970);
  expect(xs.every((x) => Math.abs(x) <= 1)).toBe(true);
  for (let i = 0; i < 512; i++) expect(sorted[i] + sorted[1023 - i]).toBeCloseTo(0, 12);
});

it('spreads small first-N rain populations across both sides with central samples', () => {
  for (const count of [2, 12, 28, 64]) {
    const xs = Array.from({ length: count }, (_, i) => rainSample(i, { time: 0, amount: 1 }).x);
    expect(xs.some((x) => x > 0)).toBe(true);
    expect(xs.some((x) => x < 0)).toBe(true);
    expect(xs.some((x) => Math.abs(x) < 0.2)).toBe(true);
    expect(xs.reduce((sum, x) => sum + x, 0)).toBeCloseTo(0, 12);
  }
});

it('turns the protein rigidly within ±0.16 radians with a quarter-radian-per-second phase', () => {
  expect(turntableYaw({ time: 0, amount: 1 })).toBe(0);
  expect(turntableYaw({ time: 2 * Math.PI, amount: 1 })).toBeCloseTo(0.16, 12);
  expect(turntableYaw({ time: Math.PI / 0.25, amount: 1 })).toBeCloseTo(0, 12);
  expect(turntableYaw({ time: -2 * Math.PI, amount: 1 })).toBeCloseTo(-0.16, 12);
  expect(turntableYaw({ time: 6 * Math.PI, amount: 1 })).toBeCloseTo(-0.16, 12);
});

it('scales streak strength with displacement and saturates at twenty-four pixels', () => {
  expect(streakStrength(0, 0, { time: 0, amount: 1 })).toBe(0);
  expect(streakStrength(6, 8, { time: 0, amount: 1 })).toBeCloseTo(0.4166666666666667, 12);
  expect(streakStrength(24, 0, { time: 0, amount: 1 })).toBe(1);
  expect(streakStrength(-48, 0, { time: 0, amount: 1 })).toBe(1);
  expect(streakStrength(24, 0, { time: 0, amount: 0 })).toBe(0);
});

it('keeps deterministic moving bokeh within normalized viewport bounds and restrained CSS-pixel sizes', () => {
  const first = bokehDot(0, { time: 0, amount: 1 });
  expect(first.alpha).toBeGreaterThan(0);
  expect(bokehDot(0, { time: 15, amount: 1 })).not.toEqual(first);
  expect(bokehDot(0, { time: 0, amount: 1 })).toEqual(first);
  for (const time of [-120, -1, 0, 15, 60, 900]) {
    for (let i = 0; i < 1024; i++) {
      const dot = bokehDot(i, { time, amount: 1 });
      expect(dot.x).toBeGreaterThanOrEqual(-1);
      expect(dot.x).toBeLessThanOrEqual(1);
      expect(dot.y).toBeGreaterThanOrEqual(-1);
      expect(dot.y).toBeLessThanOrEqual(1);
      expect(dot.radius).toBeGreaterThanOrEqual(2);
      expect(dot.radius).toBeLessThanOrEqual(6);
      expect(dot.alpha).toBeGreaterThanOrEqual(0);
      expect(dot.alpha).toBeLessThanOrEqual(0.05);
    }
  }
});

it('suppresses every life effect at zero or invalid amount, including negative-phase yaw', () => {
  for (const amount of [0, -1, NaN, Infinity, -Infinity, undefined as unknown as number]) {
    for (const time of [-2 * Math.PI, 0, 3, 40]) {
      const clock = { time, amount };
      expect(readHead(clock).alpha).toBe(0);
      expect(networkPackets(9, clock).alpha).toBe(0);
      expect(rainSample(9, clock).alpha).toBe(0);
      expect(bokehDot(9, clock).alpha).toBe(0);
      expect(turntableYaw(clock)).toBe(0);
      expect(streakStrength(48, 24, clock)).toBe(0);
    }
  }
});

it('scales Calm amplitude linearly without changing packet, rain or bokeh geometry', () => {
  const ambient = { time: 2 * Math.PI, amount: 1 };
  const calm = { ...ambient, amount: 0.45 };
  expect(readHead(calm)).toEqual({ ...readHead(ambient), alpha: 0.45 });
  expect(networkPackets(9, calm)).toEqual({ ...networkPackets(9, ambient), alpha: 0.45 });
  expect(rainSample(9, calm)).toEqual({ ...rainSample(9, ambient), alpha: 0.45 });
  const dot = bokehDot(9, ambient);
  expect(bokehDot(9, calm)).toEqual({ ...dot, alpha: dot.alpha * 0.45 });
  expect(turntableYaw(calm)).toBeCloseTo(0.072, 15);
  expect(streakStrength(24, 0, calm)).toBe(0.45);
  expect(streakStrength(6, 8, calm)).toBeCloseTo(0.1875, 15);
});

it('clamps excessive life amounts to full strength rather than overbrightening', () => {
  const full = { time: 3, amount: 1 },
    excessive = { time: 3, amount: 20 };
  expect(readHead(excessive)).toEqual(readHead(full));
  expect(networkPackets(5, excessive)).toEqual(networkPackets(5, full));
  expect(rainSample(5, excessive)).toEqual(rainSample(5, full));
  expect(bokehDot(5, excessive)).toEqual(bokehDot(5, full));
  expect(turntableYaw(excessive)).toBe(turntableYaw(full));
  expect(streakStrength(48, 0, excessive)).toBe(1);
});

it('reuses and fully overwrites optional output objects without mutating the clock', () => {
  const clock = Object.freeze({ time: 3, amount: 0.45 });
  const packet = { t: NaN, alpha: Infinity };
  expect(readHead(clock, packet)).toBe(packet);
  expect(packet).toEqual({ t: 0.25, alpha: 0.45 });
  expect(networkPackets(0, clock, packet)).toBe(packet);
  expect(packet).toEqual({ t: 0.75, alpha: 0.45 });
  const rain = { x: NaN, y: NaN, alpha: NaN };
  expect(rainSample(0, clock, rain)).toBe(rain);
  expect(rain).toEqual(rainSample(0, clock));
  const bokeh = { x: NaN, y: NaN, radius: NaN, alpha: NaN };
  expect(bokehDot(0, clock, bokeh)).toBe(bokeh);
  expect(bokeh).toEqual(bokehDot(0, clock));
  expect(clock).toEqual({ time: 3, amount: 0.45 });
});

it('normalizes fractional and negative identities with deterministic 1024-index wrapping', () => {
  const clock = { time: 3, amount: 1 };
  for (const [index, normalized] of [
    [-1, 1023],
    [-1024, 0],
    [1029, 5],
    [5.9, 5],
    [-1.9, 1023],
  ]) {
    expect(networkPackets(index, clock)).toEqual(networkPackets(normalized, clock));
    expect(rainSample(index, clock)).toEqual(rainSample(normalized, clock));
    expect(bokehDot(index, clock)).toEqual(bokehDot(normalized, clock));
  }
});

it('sanitizes non-finite time, identities and displacement to zero', () => {
  for (const bad of [NaN, Infinity, -Infinity, undefined as unknown as number]) {
    const clock = { time: bad, amount: 1 };
    expect(readHead(clock)).toEqual({ t: 0, alpha: 1 });
    expect(networkPackets(bad, clock)).toEqual({ t: 0, alpha: 1 });
    expect(rainSample(bad, clock)).toEqual(rainSample(0, { time: 0, amount: 1 }));
    expect(bokehDot(bad, clock)).toEqual(bokehDot(0, { time: 0, amount: 1 }));
    expect(turntableYaw(clock)).toBe(0);
    expect(streakStrength(bad, bad, clock)).toBe(0);
    expect(streakStrength(bad, 12, clock)).toBe(0.5);
  }
});

it('keeps finite extreme inputs bounded and periodic positions strictly below one', () => {
  for (const value of [Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE]) {
    const clock = { time: value, amount: 1 };
    const head = readHead(clock),
      packet = networkPackets(value, clock);
    const rain = rainSample(value, clock),
      dot = bokehDot(value, clock);
    for (const position of [head.t, packet.t, rain.y]) {
      expect(position).toBeGreaterThanOrEqual(0);
      expect(position).toBeLessThan(1);
    }
    expect(
      [
        ...Object.values(head),
        ...Object.values(packet),
        ...Object.values(rain),
        ...Object.values(dot),
        turntableYaw(clock),
        streakStrength(value, value, clock),
      ].every(Number.isFinite)
    ).toBe(true);
    expect(Math.abs(turntableYaw(clock))).toBeLessThanOrEqual(0.16);
    expect(streakStrength(value, value, clock)).toBeLessThanOrEqual(1);
  }
});
