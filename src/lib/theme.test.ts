import { describe, it, expect } from 'vitest';
import { isDarkTheme, getCurrentTheme } from './theme';

describe('theme utility', () => {
  it('defaults to light when no theme or element provided', () => {
    expect(isDarkTheme()).toBe(false);
    expect(getCurrentTheme()).toBe('light');
  });

  it('correctly detects light themes by string', () => {
    expect(isDarkTheme('light')).toBe(false);
    expect(getCurrentTheme('light')).toBe('light');

    expect(isDarkTheme('parchment')).toBe(false);
    expect(getCurrentTheme('parchment')).toBe('parchment');
  });

  it('correctly detects all dark themes by string', () => {
    for (const dark of ['dark', 'nord', 'monokai', 'cyberdeck']) {
      expect(isDarkTheme(dark)).toBe(true);
      expect(getCurrentTheme(dark)).toBe(dark);
    }
  });

  it('correctly detects themes via mock element', () => {
    const mockEl = {
      attr: 'nord',
      getAttribute(name: string) {
        return name === 'data-theme' ? this.attr : null;
      },
    };

    expect(isDarkTheme(mockEl)).toBe(true);
    expect(getCurrentTheme(mockEl)).toBe('nord');

    mockEl.attr = 'light';
    expect(isDarkTheme(mockEl)).toBe(false);
    expect(getCurrentTheme(mockEl)).toBe('light');
  });
});
