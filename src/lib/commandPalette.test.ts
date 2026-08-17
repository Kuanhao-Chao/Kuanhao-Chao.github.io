import { describe, it, expect } from 'vitest';
import { ALGORITHMS } from '../data/algorithms';

describe('Algorithms data integrity for Command Palette', () => {
  it('has 10 indexed algorithms with required search fields', () => {
    expect(ALGORITHMS.length).toBe(10);
    for (const algo of ALGORITHMS) {
      expect(algo.id).toBeTruthy();
      expect(algo.title).toBeTruthy();
      expect(algo.area).toBeTruthy();
      expect(algo.category).toBeTruthy();
      expect(algo.href).toBeTruthy();
      expect(algo.tag).toBeTruthy();
      expect(algo.summary).toBeTruthy();
    }
  });

  it('contains shortTitle and blurb for concise presentation', () => {
    const featured = ALGORITHMS.filter((a) => a.featured);
    expect(featured.length).toBe(4);
    for (const algo of featured) {
      expect(algo.shortTitle).toBeTruthy();
      expect(algo.blurb).toBeTruthy();
    }
  });
});

describe('Search query token matching logic', () => {
  function scoreMatch(title: string, subtitle: string, keywords: string[], queryTokens: string[]): number {
    if (queryTokens.length === 0) return 1;
    const titleLower = title.toLowerCase();
    const subtitleLower = subtitle.toLowerCase();
    const keywordsLower = keywords.join(' ').toLowerCase();

    let score = 0;
    for (const token of queryTokens) {
      if (titleLower.startsWith(token)) score += 100;
      else if (titleLower.includes(` ${token}`)) score += 60;
      else if (titleLower.includes(token)) score += 40;
      else if (keywordsLower.includes(token)) score += 20;
      else if (subtitleLower.includes(token)) score += 10;
      else return 0;
    }
    return score;
  }

  it('matches prefix query with high score', () => {
    const score = scoreMatch('Minimap2 Chaining', 'Long read alignment', ['minimap2', 'indexing'], ['mini']);
    expect(score).toBeGreaterThan(50);
  });

  it('matches multi-token query across title and keywords', () => {
    const score = scoreMatch('Profile Hidden Markov Models', 'Plan 7 topology', ['phmm', 'viterbi'], ['profile', 'viterbi']);
    expect(score).toBeGreaterThan(0);
  });

  it('returns 0 when a token does not match', () => {
    const score = scoreMatch('De Bruijn Graph', 'Eulerian assembly', ['debruijn'], ['quantum']);
    expect(score).toBe(0);
  });
});
