import { describe, expect, it } from 'vitest';
import { createGameClock } from './gameClock';

describe('fixed-step game clock', () => {
  it('simulates the same second at 30 Hz and 120 Hz', () => {
    const run = (frames: number) => {
      const clock = createGameClock();
      let steps = 0;
      for (let i = 0; i < frames; i++) clock.advance(1 / frames, () => steps++);
      return steps;
    };
    expect(run(30)).toBe(60);
    expect(run(120)).toBe(60);
  });
  it('drops an unbounded backlog and clears partial time on pause', () => {
    const clock = createGameClock();
    let steps = 0;
    clock.advance(30, () => steps++);
    expect(steps).toBe(8);
    clock.advance(1 / 120, () => steps++);
    clock.reset();
    clock.advance(1 / 120, () => steps++);
    expect(steps).toBe(8);
  });
});
