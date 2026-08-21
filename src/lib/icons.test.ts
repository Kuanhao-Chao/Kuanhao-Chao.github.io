import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `Icon.astro` resolves an unknown name to `stroke[name] ?? ''` — an empty <svg>,
 * rendered at full size, with no error anywhere. The deep-dive series accumulated
 * **112 of them** across ten undefined names, sitting in every lesson's back-link,
 * level badge and contents heading, and nothing caught it: not the type checker, not
 * the build, not the link or indexing audits.
 *
 * This is the check that would have.
 */
const ICON = 'src/components/Icon.astro';

function definedNames(): Set<string> {
  const source = readFileSync(ICON, 'utf8');
  // Keys of the `stroke` and `brand` records, quoted or bare, value on the same or
  // the following line (Prettier wraps long paths).
  return new Set([...source.matchAll(/^ {2}'?([a-zA-Z0-9-]+)'?:\s*\n?\s*'/gm)].map((m) => m[1]));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(astro|ts|tsx|mdx)$/.test(entry)) out.push(full);
  }
  return out;
}

function usedNames(): Map<string, number> {
  const used = new Map<string, number>();
  for (const file of walk('src')) {
    if (file.endsWith(ICON)) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<Icon[^>]*\bname="([a-zA-Z0-9-]+)"/g)) {
      used.set(match[1], (used.get(match[1]) ?? 0) + 1);
    }
  }
  return used;
}

describe('the icon set', () => {
  it('defines every name the site actually uses', () => {
    const defined = definedNames();
    const missing = [...usedNames()]
      .filter(([name]) => !defined.has(name))
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name} (used ${count}×)`);
    expect(missing, `undefined icon names render as an empty <svg>: ${missing.join(', ')}`).toEqual(
      []
    );
  });

  it('finds a healthy number of names on both sides, so the regexes still match', () => {
    // If either regex silently stopped matching, the check above would pass vacuously.
    expect(definedNames().size).toBeGreaterThan(30);
    expect(usedNames().size).toBeGreaterThan(20);
  });
});
