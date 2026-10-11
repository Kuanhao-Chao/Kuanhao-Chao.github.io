import { describe, expect, it } from 'vitest';
import { FINALE_KEY, resolveFinale, finaleBlend } from './morphFinalePreference';

describe('independent finale preference', () => {
  it('defaults to motif and accepts only the two versioned raw values', () => {
    expect(FINALE_KEY).toBe('khc-morph-finale-v1');
    for (const value of [null, '', 'cells', 'off', '{}', 'MOTIF'])
      expect(resolveFinale(value)).toBe('motif');
    expect(resolveFinale('attention')).toBe('attention');
    expect(resolveFinale('motif')).toBe('motif');
  });
  it('makes the 750ms switch endpoint-flat and restarts from the visible blend', () => {
    expect(finaleBlend(0, 1, 0)).toBe(0);
    expect(finaleBlend(0, 1, 0.375)).toBe(0.5);
    expect(finaleBlend(0, 1, 0.75)).toBe(1);
    expect(finaleBlend(0.5, 0, 0)).toBe(0.5);
    expect(finaleBlend(0.5, 0, 0.375)).toBe(0.25);
    expect(finaleBlend(1, 0, 0.75)).toBe(0);
  });
});
