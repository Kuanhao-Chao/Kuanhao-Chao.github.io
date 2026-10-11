import { describe, expect, it } from 'vitest';
import { LessonPlayback } from './lessonPlayback';

describe('educational playback', () => {
  it('starts paused at the first frame and reverses or seeks without changing the trace', () => {
    const p = new LessonPlayback(4);
    expect([p.index, p.playing]).toEqual([0, false]);
    p.next();
    p.next();
    p.previous();
    expect(p.index).toBe(1);
    p.seek(3);
    p.play();
    expect(p.index).toBe(0);
    expect(p.playing).toBe(true);
    p.next();
    p.next();
    p.next();
    expect([p.index, p.playing]).toEqual([3, false]);
  });
  it('invalidates old answers when inputs change and resets a new run to paused', () => {
    const p = new LessonPlayback(4);
    p.play();
    p.invalidate();
    expect([p.valid, p.playing]).toEqual([false, false]);
    p.next();
    expect(p.index).toBe(0);
    p.load(2);
    expect([p.valid, p.index, p.playing]).toEqual([true, 0, false]);
    p.seek(-10);
    expect(p.index).toBe(0);
    p.seek(50);
    expect(p.index).toBe(1);
  });
});
