import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SOFT_SELECTOR,
  SOLID_SELECTOR,
  VEIL_DEFAULT,
  VEIL_MAX,
  readVeil,
  softEraseAlpha,
} from './readingVeil';

const tokens = readFileSync('src/styles/tokens.css', 'utf8');
const split = (selector: string) => selector.split(',').map((part) => part.trim());

describe('reading veil strength', () => {
  it('is the token on the homepage and nothing anywhere else', () => {
    expect(readVeil('0.3', true)).toBe(0.3);
    expect(readVeil(' 0.35 ', true)).toBe(0.35);
    expect(readVeil('0.3', false)).toBe(0);
    expect(readVeil('0.9', false)).toBe(0);
  });
  it('clamps to a veil, and falls back to the default rather than to off', () => {
    expect(readVeil('0.9', true)).toBe(VEIL_MAX);
    expect(readVeil('-1', true)).toBe(0);
    expect(readVeil('0', true)).toBe(0);
    // A stylesheet that failed to load must not silently switch the veil off.
    expect(readVeil('', true)).toBe(VEIL_DEFAULT);
    expect(readVeil('banana', true)).toBe(VEIL_DEFAULT);
    expect(readVeil(null, true)).toBe(VEIL_DEFAULT);
    expect(readVeil(undefined, true)).toBe(VEIL_DEFAULT);
    expect(readVeil('NaN', true)).toBe(VEIL_DEFAULT);
  });
  it('erases the complement from the soft boxes', () => {
    expect(softEraseAlpha(0.3)).toBeCloseTo(0.7, 12);
    expect(softEraseAlpha(0)).toBe(1);
    expect(softEraseAlpha(5)).toBeCloseTo(1 - VEIL_MAX, 12);
    expect(softEraseAlpha(-5)).toBe(1);
  });
});

describe('the token and the cards share one number', () => {
  const through = Number(/--art-through:\s*([0-9.]+);/.exec(tokens)?.[1]);
  it('ships the strength the plan chose, inside the tuning range', () => {
    expect(through).toBe(VEIL_DEFAULT);
    expect(through).toBeGreaterThanOrEqual(0.25);
    expect(through).toBeLessThanOrEqual(0.4);
  });
  it('derives the card fill from it, so the two layers cannot drift apart', () => {
    expect(tokens).toMatch(/--veil-fill:\s*calc\(\(1 - var\(--art-through\)\) \* 100%\);/);
    // The fill is the complement: art visible through a card = through, as through text.
    expect((1 - through) * 100).toBeCloseTo(70, 9);
  });
  it('defines both in the theme-independent block, not once per theme', () => {
    expect(tokens.match(/--art-through:/g)).toHaveLength(1);
    expect(tokens.match(/--veil-fill:/g)).toHaveLength(1);
    const firstBlock = tokens.slice(0, tokens.indexOf(":root[data-theme='dark']"));
    expect(firstBlock).toContain('--art-through:');
  });
});

describe('what is soft and what stays solid', () => {
  // The pre-veil collector's selector, split. Every kind it cleared must still be classified.
  const everything = [
    'main h1',
    'main h2',
    'main h3',
    'main h4',
    'main h5',
    'main h6',
    'main a',
    'main label',
    'main p',
    'main li',
    'main dt',
    'main dd',
    'main blockquote',
    'main pre',
    'main table',
    'main button',
    'main input',
    'main select',
    'main summary',
    'main img',
    'main canvas',
    'main iframe',
    'main video',
    'main audio',
    'main [data-terminal]',
    'main [data-cell-protected]',
    'main [data-background-protected]',
    'header.site-header',
    'footer',
  ];
  it('classifies every previously cleared kind exactly once', () => {
    const soft = split(SOFT_SELECTOR);
    const solid = split(SOLID_SELECTOR);
    expect(soft.filter((part) => solid.includes(part))).toEqual([]);
    expect([...soft, ...solid].sort()).toEqual([...everything].sort());
  });
  it('lets text through but never an object, a control, media, the terminal or the chrome', () => {
    const soft = split(SOFT_SELECTOR);
    for (const kept of [
      'main img',
      'main canvas',
      'main button',
      'main input',
      'main pre',
      'main [data-terminal]',
      'header.site-header',
      'footer',
    ])
      expect(soft).not.toContain(kept);
    for (const text of ['main h1', 'main p', 'main li', 'main a'])
      expect(soft).toContain(text);
  });
});

describe('the veiled cards', () => {
  const research = readFileSync('src/components/ResearchCard.astro', 'utf8');
  const news = readFileSync('src/components/NewsEntry.astro', 'utf8');
  const home = readFileSync('src/pages/index.astro', 'utf8');
  it('mark the three card roots so the reading mask leaves their text to the card', () => {
    expect(research).toContain('<article class="rcard rcard--home" data-veiled>');
    expect(news).toContain("data-veiled={variant === 'card' ? '' : undefined}");
    // The software cards are links inside list items; the li is the grid cell and the mask's `li`
    // rect covers the whole card, so the marker goes on the li, not only on the link.
    expect(home).toContain('<li data-veiled>');
    // One marker in markup (the CSS comment above it mentions the word, which is not a marker).
    expect(home.match(/<[a-z]+[^>]*\sdata-veiled[\s>]/g)).toHaveLength(1);
  });
  it('fill translucently only in the Sequence → Function scene, never in Cells or Off', () => {
    for (const [name, source] of [
      ['ResearchCard', research],
      ['NewsEntry', news],
      ['index', home],
    ] as const) {
      const rules = [...source.matchAll(/([^{}]+)\{([^{}]*var\(--veil-fill\)[^{}]*)\}/g)];
      expect(rules.length, `${name} uses the veil fill`).toBeGreaterThan(0);
      for (const [, selector] of rules)
        expect(selector, `${name}: ${selector.trim()}`).toContain(
          "html[data-background-scene='morph']"
        );
    }
  });
  it('moves the grid hairlines onto the cards so a translucent card shows no grey slab', () => {
    const scoped = home.slice(home.indexOf('Sequence → Function: the research and software grids'));
    // The container stops painting the line colour; each card outlines itself instead.
    expect(scoped).toMatch(/\.home-research,[^{]*\.home-tools\s*\{[^}]*background:\s*transparent/);
    expect(scoped).toMatch(/\.home-research[^{]*\.rcard--home[^{]*,[^{]*\.home-tool\s*\{[^}]*outline:\s*1px solid var\(--color-rule\)/);
    // The gap stays 1px, so nothing shifts when the scene changes.
    expect(home).toMatch(/\.home-research\s*\{[^}]*gap:\s*1px/);
    expect(home).toMatch(/\.home-tools\s*\{[^}]*gap:\s*1px/);
    // The clip removes the outer left/right lines, so an outset focus ring needs the inset one.
    expect(scoped).toContain('clip-path: inset(0)');
    expect(scoped).toMatch(/\.home-tool:focus-visible\s*\{[^}]*outline-offset:\s*-2px/);
  });
});
