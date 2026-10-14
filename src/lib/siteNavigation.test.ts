import { describe, expect, it } from 'vitest';
import { labNavItems, navLabs } from '../data/site';

describe('Labs navigation', () => {
  it('keeps six header explorations and preserves the full footer directory', () => {
    expect(labNavItems.map((item) => item.id)).toEqual([
      'genome-browser',
      'algorithms',
      'deep-dives',
      'shorkie-lab',
      'cell-lab',
      'terminal',
    ]);
    expect(navLabs.map((item) => item.label)).toContain('NN Lab');
    expect(navLabs.map((item) => item.label)).toContain('Deep Dives');
    expect(navLabs.map((item) => item.label)).toContain('Fun Lab');
    expect(labNavItems.map((item) => item.href)).not.toContain('/fun-lab/');
    expect(labNavItems.find((item) => item.id === 'deep-dives')?.href).toBe('/deep_dives/');
  });
});
