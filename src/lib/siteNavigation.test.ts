import { describe, expect, it } from 'vitest';
import { footerLabs, footerPages, labNavItems, nav, navLabs } from '../data/site';

describe('Labs navigation', () => {
  it('keeps six header explorations and preserves the full navigation registry', () => {
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
  it('hides only the requested links in the shared footer', () => {
    expect(footerPages.map((item) => item.label)).toEqual([
      'Research', 'Publications', 'Software', 'Talks', 'Teaching', 'Posts', 'News',
    ]);
    expect(footerLabs.map((item) => item.label)).toEqual([
      'Algorithms', 'Cell Lab', 'Shorkie Lab', 'Terminal', 'Search',
    ]);
    const hidden = ['Deep Dives', 'Papers', 'NN Lab', 'Fun Lab', 'Photos', 'Projects', 'CV'];
    expect(nav.filter((item) => item.footerHidden).map((item) => item.label).sort())
      .toEqual([...hidden].sort());
    for (const label of hidden) expect(nav.some((item) => item.label === label)).toBe(true);
  });
});
