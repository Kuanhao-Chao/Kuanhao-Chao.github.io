import { describe, expect, it } from 'vitest';
import { terminalWheelHandoff } from './terminalScroll';

const viewport = { scrollTop: 0, scrollHeight: 1000, clientHeight: 200, deltaY: 140 };

describe('inline terminal wheel handoff', () => {
  it('leaves scrollable history native in either direction', () => {
    expect(terminalWheelHandoff(viewport)).toBe(0);
    expect(terminalWheelHandoff({ ...viewport, scrollTop: 400, deltaY: -140 })).toBe(0);
    expect(terminalWheelHandoff({ ...viewport, scrollTop: 790 })).toBe(0);
  });
  it('hands only outward gestures to the page at the top or bottom', () => {
    expect(terminalWheelHandoff({ ...viewport, deltaY: -140 })).toBe(-140);
    expect(terminalWheelHandoff({ ...viewport, scrollTop: 800 })).toBe(140);
    expect(terminalWheelHandoff({ ...viewport, scrollTop: 800, deltaY: -140 })).toBe(0);
  });
  it('tolerates fractional boundary positions and Safari overscroll', () => {
    expect(terminalWheelHandoff({ ...viewport, scrollTop: 799.5 })).toBe(140);
    expect(terminalWheelHandoff({ ...viewport, scrollTop: -3, deltaY: -140 })).toBe(-140);
  });
  it('does not trap wheel gestures when output needs no scrolling', () => {
    expect(terminalWheelHandoff({ ...viewport, scrollHeight: 100 })).toBe(140);
    expect(terminalWheelHandoff({ ...viewport, scrollHeight: 100, deltaY: -140 })).toBe(-140);
  });
  it('normalizes line and page wheel units without changing pixel deltas', () => {
    expect(terminalWheelHandoff({ ...viewport, deltaY: -3, deltaMode: 1, lineHeight: 20 })).toBe(-60);
    expect(terminalWheelHandoff({ ...viewport, deltaY: -1, deltaMode: 2, pageHeight: 844 })).toBe(-844);
    expect(terminalWheelHandoff({ ...viewport, deltaY: -3, deltaMode: 0, lineHeight: 20 })).toBe(-3);
  });
  it('rejects invalid geometry/deltas and supplies safe unit defaults', () => {
    expect(terminalWheelHandoff({ ...viewport, scrollTop: Number.NaN })).toBe(0);
    expect(terminalWheelHandoff({ ...viewport, deltaY: Infinity })).toBe(0);
    expect(terminalWheelHandoff({ ...viewport, clientHeight: 0 })).toBe(0);
    expect(terminalWheelHandoff({ ...viewport, deltaY: -1, deltaMode: 1 })).toBe(-16);
    expect(terminalWheelHandoff({ ...viewport, deltaY: -1, deltaMode: 2 })).toBe(-200);
  });
});
