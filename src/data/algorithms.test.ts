import { describe, it, expect } from 'vitest';
import { ALGORITHMS, ALGORITHM_CATEGORIES } from './algorithms';

describe('Algorithms Catalog & Taxonomy Invariants', () => {
  it('features exactly the four requested flagship algorithms on the homepage', () => {
    const featured = ALGORITHMS.filter((a) => a.featured);
    expect(featured.length).toBe(4);

    const featuredIds = featured.map((a) => a.id);
    expect(featuredIds).toEqual(['minimap2', 'fm-index', 'pairwise', 'phmm']);
  });

  it('contains complete metadata, complexities, and highlights for all algorithms', () => {
    expect(ALGORITHMS.length).toBeGreaterThanOrEqual(10);

    for (const algo of ALGORITHMS) {
      expect(algo.id).toBeTruthy();
      expect(algo.title).toBeTruthy();
      expect(algo.area).toBeTruthy();
      expect(algo.category).toBeTruthy();
      expect(algo.summary).toBeTruthy();
      expect(algo.timeComplexity).toBeTruthy();
      expect(algo.spaceComplexity).toBeTruthy();
      expect(algo.keyMechanism).toBeTruthy();
      expect(algo.highlights).toBeDefined();
      expect(algo.highlights?.length).toBeGreaterThanOrEqual(2);
      expect(algo.href.startsWith('/')).toBe(true);
    }
  });

  it('has valid categories matching taxonomy schema', () => {
    const validCategorySlugs = new Set(ALGORITHM_CATEGORIES.map((c) => c.slug));
    for (const algo of ALGORITHMS) {
      expect(validCategorySlugs.has(algo.category)).toBe(true);
    }
  });
});
