import { describe, expect, it } from 'vitest';
import { labNavItems, navLabs } from '../data/site';

describe('Labs navigation', () => {
  it('keeps six header explorations and preserves the full footer directory', () => {
    expect(labNavItems.map((item) => item.id)).toEqual([
      'genome-browser',
      'algorithms',
      'shorkie-lab',
      'cell-lab',
      'terminal',
      'fun-lab',
    ]);
    expect(navLabs.map((item) => item.label)).toContain('NN Lab');
    expect(navLabs.map((item) => item.label)).toContain('Deep Dives');
  });
});
