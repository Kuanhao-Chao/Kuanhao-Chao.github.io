import { describe, expect, it } from 'vitest';
import { buildBreadcrumbLd } from './breadcrumbs';
import { site } from '../data/site';

describe('buildBreadcrumbLd', () => {
  it('constructs standard root breadcrumb when given empty items', () => {
    const ld = buildBreadcrumbLd([]);
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${site.url}/`,
      },
    ]);
  });

  it('constructs nested breadcrumb list with correct position and absolute URLs', () => {
    const ld = buildBreadcrumbLd([
      { name: 'Publications', path: '/publications/' },
      { name: 'LiftOn', path: '/publications/lifton/' },
    ]);

    expect(ld.itemListElement).toHaveLength(3);
    expect(ld.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://khchao.com/',
    });
    expect(ld.itemListElement[1]).toEqual({
      '@type': 'ListItem',
      position: 2,
      name: 'Publications',
      item: 'https://khchao.com/publications/',
    });
    expect(ld.itemListElement[2]).toEqual({
      '@type': 'ListItem',
      position: 3,
      name: 'LiftOn',
      item: 'https://khchao.com/publications/lifton/',
    });
  });
});
