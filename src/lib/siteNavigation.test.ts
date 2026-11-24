import { describe, expect, it } from 'vitest';
import { footerLabs, footerPages, labNavItems, nav, navLabs } from '../data/site';

describe('Labs navigation', () => {
  it('keeps four flagship header explorations and preserves the full navigation registry', () => {
    expect(labNavItems.map((item) => item.id)).toEqual([
      'genome-browser',
      'shorkie-lab',
      'algorithms',
      'terminal',
    ]);
    expect(navLabs.map((item) => item.label)).toContain('NN Lab');
    expect(navLabs.map((item) => item.label)).toContain('Deep Dives');
    expect(navLabs.map((item) => item.label)).toContain('Fun Lab');
    expect(navLabs.map((item) => item.label)).toContain('Cell Lab');
    expect(labNavItems.map((item) => item.href)).not.toContain('/fun-lab/');
    expect(labNavItems.map((item) => item.href)).not.toContain('/deep_dives/');
    expect(labNavItems.map((item) => item.href)).not.toContain('/lab');
  });
  it('keeps the simplified shared footer links while preserving hidden registry items', () => {
    expect(footerPages.map((item) => item.label)).toEqual([
      'Research',
      'Publications',
      'Software',
      'Talks',
      'Teaching',
      'Posts',
      'News',
    ]);
    expect(footerLabs.map((item) => item.label)).toEqual(['Shorkie Lab', 'Terminal', 'Search']);
    const hidden = [
      'Algorithms',
      'Cell Lab',
      'Deep Dives',
      'Papers',
      'NN Lab',
      'Fun Lab',
      'Photos',
      'Projects',
      'CV',
    ];
    expect(
      nav
        .filter((item) => item.footerHidden)
        .map((item) => item.label)
        .sort()
    ).toEqual([...hidden].sort());
    for (const label of hidden) expect(nav.some((item) => item.label === label)).toBe(true);
  });
});
