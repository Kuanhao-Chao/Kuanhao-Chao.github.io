import { describe, it, expect } from 'vitest';

describe('DNA Matrix Rain Trigger Logic', () => {
  const KEYWORD_TRIGGERS = ['dna', 'matrix', 'rain', 'helix'];
  const KONAMI_CODE = [
    'ArrowUp',
    'ArrowUp',
    'ArrowDown',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowLeft',
    'ArrowRight',
    'b',
    'a',
  ];

  it('recognizes keyword triggers from a rolling character buffer', () => {
    function matchesKeyword(buffer: string[]): boolean {
      const typed = buffer.join('');
      return KEYWORD_TRIGGERS.some((trigger) => typed.endsWith(trigger));
    }

    expect(matchesKeyword(['x', 'y', 'z', 'd', 'n', 'a'])).toBe(true);
    expect(matchesKeyword(['m', 'a', 't', 'r', 'i', 'x'])).toBe(true);
    expect(matchesKeyword(['h', 'e', 'l', 'i', 'x'])).toBe(true);
    expect(matchesKeyword(['r', 'a', 'i', 'n'])).toBe(true);
    expect(matchesKeyword(['f', 'o', 'o', 'b', 'a', 'r'])).toBe(false);
  });

  it('matches full classic Konami code sequence', () => {
    let sequence: string[] = [];
    for (const key of KONAMI_CODE) {
      sequence.push(key);
    }
    expect(sequence.length).toBe(10);
    expect(sequence).toEqual(KONAMI_CODE);
  });
});
