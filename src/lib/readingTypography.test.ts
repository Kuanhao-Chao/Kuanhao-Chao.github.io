import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { figureZoom, fitFigureZoom, newsPreview, readableFigureWidth } from './readingTypography';

describe('plain-text news previews', () => {
  it('retains the complete first paragraph and omits later resources', () => {
    expect(newsPreview("I'm honored to be part of the team.\n\n[Paper](https://example.com)")).toBe("I'm honored to be part of the team.");
  });
  it('keeps visible link text, emphasis and model-name underscores readable', () => {
    expect(newsPreview('**Shorkie_LM** and [its paper](https://example.com) are released.')).toBe('Shorkie_LM and its paper are released.');
  });
  it('does not send markup to a preview or split a word at the cutoff', () => {
    expect(newsPreview('<strong>A useful</strong> longer explanation follows.', 23)).toBe('A useful longer…');
    expect(newsPreview('')).toBe('');
    expect(newsPreview('DNA 🧬🧬🧬', 7)).not.toContain('\uFFFD');
  });
});

describe('readable figure sizing', () => {
  it('compensates for small labels without shrinking larger native diagrams', () => {
    expect(readableFigureWidth(720, 12)).toBe(780);
    expect(readableFigureWidth(640, 10)).toBe(832);
    expect(readableFigureWidth(640, 16)).toBe(640);
  });
  it('bounds invalid values and deliberately tiny annotation fonts', () => {
    expect(readableFigureWidth(Number.NaN, 0)).toBe(694);
    expect(readableFigureWidth(720, 1)).toBe(2160);
    expect(figureZoom(4)).toBe(3);
    expect(figureZoom(-1)).toBe(0.1);
    expect(figureZoom(Number.NaN)).toBe(1);
  });
  it('fits both axes, including portrait figures rather than only their width', () => {
    expect(fitFigureZoom(800, 400, 320, 600)).toBe(0.4);
    expect(fitFigureZoom(800, 1800, 320, 600)).toBeCloseTo(1 / 3);
  });
});

describe('reading-page content contracts', () => {
  it('uses exactly one numbering source in every paper contents list', () => {
    const files = readdirSync(new URL('../pages/papers/', import.meta.url)).filter(name => name.endsWith('.astro'));
    let lists = 0;
    for (const file of files) {
      const source = readFileSync(new URL(`../pages/papers/${file}`, import.meta.url), 'utf8');
      const toc = source.match(/<ol[^>]*class="paper-toc-list"[^>]*>[\s\S]*?<\/ol>/)?.[0];
      if (!toc) continue;
      lists++;
      expect(toc, file).not.toMatch(/<a\b[^>]*>\d+[.)]\s/);
    }
    expect(lists).toBeGreaterThanOrEqual(18);
  });
  it('keeps rendered news previews separate from full resource-rich updates', () => {
    const source = readFileSync(new URL('../components/NewsEntry.astro', import.meta.url), 'utf8');
    expect(source).toContain("variant === 'card'");
    expect(source).toContain('newsPreview(entry.body');
    expect(source).toContain('news-read-more');
    expect(source).toContain('<slot />');
    expect(source).not.toContain('-webkit-line-clamp');
  });
});
