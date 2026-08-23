import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEEP_DIVES, DEEP_DIVE_ORDER } from '../data/deepDives';
import {
  analyseBody,
  buildToc,
  findPrerequisiteCycle,
  formatReadingTime,
  lessonReadingTime,
  neighbours,
  orderLessons,
  referenceSurname,
  type Heading,
  type LessonLike,
} from './deepDives.ts';

const lesson = (id: string, moduleId: string, order: number, prerequisites: string[] = []): LessonLike => ({
  id,
  data: { moduleId, order, prerequisites: prerequisites.map((p) => ({ id: p })) },
});

describe('analyseBody', () => {
  it('counts prose words and ignores markdown punctuation', () => {
    // Heading text counts: it is read. A, heading, Some, bold, prose, here.
    expect(analyseBody('# A heading\n\nSome **bold** prose here.').prose).toBe(6);
  });

  it('prices display math separately instead of counting its source as words', () => {
    const a = analyseBody('Text $$\\frac{V_A}{V_P} = h^2$$ more text.');
    expect(a.display).toBe(1);
    expect(a.inline).toBe(0);
    // "Text", "more", "text." — the LaTeX contributes no words.
    expect(a.prose).toBe(3);
  });

  it('does not read one display block as two inline spans', () => {
    const a = analyseBody('$$a$$');
    expect(a).toMatchObject({ display: 1, inline: 0 });
  });

  it('counts inline math', () => {
    const a = analyseBody('Both $h^2$ and $V_A$ matter.');
    expect(a).toMatchObject({ display: 0, inline: 2 });
    expect(a.prose).toBe(3); // Both, and, matter.
  });

  it('counts fenced code lines and does not let their $ leak into the math count', () => {
    const a = analyseBody('Intro.\n\n```bash\nplink --bfile x $FOO\ngcta64 --grm y\n```\n\nOutro.');
    expect(a.codeLines).toBe(2);
    expect(a.inline).toBe(0);
    expect(a.display).toBe(0);
    expect(a.prose).toBe(2); // Intro. Outro.
  });

  it('drops JSX tags but keeps the prose inside them', () => {
    const a = analyseBody('<Callout variant="key" title="Assumptions">\nRandom mating holds.\n</Callout>');
    expect(a.prose).toBe(3);
  });

  it('keeps link text and drops the URL', () => {
    expect(analyseBody('See [the GCTA manual](https://example.org/a/b) today.').prose).toBe(5);
  });

  it('handles an empty body without throwing', () => {
    expect(analyseBody('')).toEqual({ prose: 0, display: 0, inline: 0, inlineWords: 0, codeLines: 0 });
  });

  it('prices inline math by length, so a lone symbol is not a phrase', () => {
    expect(analyseBody('$D$').inlineWords).toBe(1);
    expect(analyseBody('$p_{AB}$').inlineWords).toBe(1);
    // a half-line formula is worth several words
    expect(analyseBody('$t_{1/2} = \\ln 0.5 / \\ln(1-\\theta)$').inlineWords).toBeGreaterThan(4);
  });
});

describe('lessonReadingTime', () => {
  it('is one minute at minimum, never zero', () => {
    expect(lessonReadingTime('')).toBe(1);
    expect(lessonReadingTime('Three short words')).toBe(1);
  });

  it('prices prose at 200 words per minute', () => {
    expect(lessonReadingTime(Array(600).fill('word').join(' '))).toBe(3);
  });

  it('does not let a page of single-symbol math invent five minutes', () => {
    // 175 spans of `$D$` — the shape of a real lesson. A flat 3 s each would add 8.75 min.
    const body = Array(175).fill('$D$').join(' ');
    expect(lessonReadingTime(body)).toBe(1);
  });

  it('charges for equations that carry no words', () => {
    // 200 words alone is 1 min; eight display equations add another two.
    const prose = Array(200).fill('word').join(' ');
    const math = Array(8).fill('$$x = y$$').join('\n\n');
    expect(lessonReadingTime(prose)).toBe(1);
    expect(lessonReadingTime(`${prose}\n\n${math}`)).toBe(3);
  });

  it('reproduces the measurement that condemned the hand-written constants', () => {
    // statgen-heritability-greml as it stands: 846 prose words, 9 display and 50
    // inline equations. It claimed 22 minutes.
    const body = [
      Array(846).fill('word').join(' '),
      Array(9).fill('$$x$$').join('\n\n'),
      Array(50).fill('$y$').join(' '),
    ].join('\n\n');
    // 846 prose + 50 word-equivalents at 200 wpm, plus 9 x 15 s of display math.
    expect(lessonReadingTime(body)).toBe(7);
  });

  it('formats as a badge string', () => {
    expect(formatReadingTime(9)).toBe('9 min read');
  });
});

describe('buildToc', () => {
  const h = (depth: number, slug: string): Heading => ({ depth, slug, text: slug });

  it('nests h3 under the preceding h2', () => {
    const toc = buildToc([h(2, 'a'), h(3, 'a1'), h(3, 'a2'), h(2, 'b')]);
    expect(toc.map((n) => n.slug)).toEqual(['a', 'b']);
    expect(toc[0].children.map((n) => n.slug)).toEqual(['a1', 'a2']);
    expect(toc[1].children).toEqual([]);
  });

  it('drops the h1 title and anything deeper than h3', () => {
    const toc = buildToc([h(1, 'title'), h(2, 'a'), h(4, 'deep')]);
    expect(toc).toHaveLength(1);
    expect(toc[0].slug).toBe('a');
    expect(toc[0].children).toEqual([]);
  });

  it('promotes an h3 that appears before any h2 rather than dropping it', () => {
    const toc = buildToc([h(3, 'orphan'), h(2, 'a')]);
    expect(toc.map((n) => n.slug)).toEqual(['orphan', 'a']);
  });

  it('ignores headings with no slug to anchor to', () => {
    expect(buildToc([{ depth: 2, slug: '', text: '' }])).toEqual([]);
  });
});

describe('orderLessons', () => {
  it('sorts by module, then order, then id', () => {
    const out = orderLessons([
      lesson('z', 'm2', 1),
      lesson('b', 'm1', 2),
      lesson('a', 'm1', 2),
      lesson('c', 'm1', 1),
    ]);
    expect(out.map((e) => e.id)).toEqual(['c', 'a', 'b', 'z']);
  });

  it('does not mutate its input', () => {
    const input = [lesson('b', 'm1', 2), lesson('a', 'm1', 1)];
    orderLessons(input);
    expect(input.map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('findPrerequisiteCycle', () => {
  it('returns null for an acyclic graph', () => {
    expect(findPrerequisiteCycle([lesson('a', 'm', 1), lesson('b', 'm', 2, ['a'])])).toBeNull();
  });

  it('finds a two-lesson cycle', () => {
    const cycle = findPrerequisiteCycle([lesson('a', 'm', 1, ['b']), lesson('b', 'm', 2, ['a'])]);
    expect(cycle).toEqual(['a', 'b', 'a']);
  });

  it('finds a lesson that requires itself', () => {
    expect(findPrerequisiteCycle([lesson('a', 'm', 1, ['a'])])).toEqual(['a', 'a']);
  });

  it('finds a longer cycle', () => {
    const cycle = findPrerequisiteCycle([
      lesson('a', 'm', 1, ['b']),
      lesson('b', 'm', 2, ['c']),
      lesson('c', 'm', 3, ['a']),
    ]);
    expect(cycle).toEqual(['a', 'b', 'c', 'a']);
  });

  it('treats a diamond as acyclic rather than a false positive', () => {
    expect(
      findPrerequisiteCycle([
        lesson('a', 'm', 1),
        lesson('b', 'm', 2, ['a']),
        lesson('c', 'm', 3, ['a']),
        lesson('d', 'm', 4, ['b', 'c']),
      ])
    ).toBeNull();
  });

  it('ignores a dangling prerequisite, which the schema reports instead', () => {
    expect(findPrerequisiteCycle([lesson('a', 'm', 1, ['missing'])])).toBeNull();
  });
});

describe('neighbours', () => {
  const ordered = [lesson('a', 'm', 1), lesson('b', 'm', 2), lesson('c', 'm', 3)];

  it('gives both sides in the middle, and null at each end', () => {
    expect(neighbours(ordered, 'b').prev?.id).toBe('a');
    expect(neighbours(ordered, 'b').next?.id).toBe('c');
    expect(neighbours(ordered, 'a').prev).toBeNull();
    expect(neighbours(ordered, 'c').next).toBeNull();
  });

  it('returns nothing for an id that is not in the list', () => {
    expect(neighbours(ordered, 'zz')).toEqual({ prev: null, next: null });
  });
});

// ── Content integrity ────────────────────────────────────────────────────────
// These guard the two mistakes the migration can actually make.

const CONTENT_DIR = 'src/content/deepDives';
const PAGES_DIR = 'src/pages/deep_dives';

const collectionIds = () =>
  existsSync(CONTENT_DIR)
    ? readdirSync(CONTENT_DIR)
        .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
        .map((f) => f.replace(/\.mdx?$/, ''))
    : [];

describe('deep-dive collection', () => {
  it('never stores a reading time — it is derived from the body', () => {
    const offenders = collectionIds().filter((id) => {
      const file = readdirSync(CONTENT_DIR).find((f) => f.startsWith(`${id}.`))!;
      const front = readFileSync(join(CONTENT_DIR, file), 'utf8').split(/^---$/m)[1] ?? '';
      return /^\s*readingTime\s*:/m.test(front);
    });
    expect(offenders, 'frontmatter must not carry readingTime; lessonReadingTime computes it').toEqual([]);
  });

  /** Pull the few frontmatter fields the ordering invariant needs, without a YAML dep. */
  const frontmatter = (id: string) => {
    const file = readdirSync(CONTENT_DIR).find((f) => f.startsWith(`${id}.`))!;
    const front = readFileSync(join(CONTENT_DIR, file), 'utf8').split(/^---$/m)[1] ?? '';
    const field = (name: string) => front.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1].trim();
    return {
      id,
      data: {
        hub: field('hub') ?? 'statistical-genetics',
        moduleId: field('moduleId') ?? '',
        order: Number(field('order')),
      },
    };
  };

  it('numbers every module id so it sorts correctly as a string', () => {
    // `orderLessons` compares moduleId with `<`, so an unpadded `m10-` would sort before
    // `m2-`. Demonstrated: ['m1-a','m2-b','m10-c'].sort() -> [m1-a, m10-c, m2-b].
    const bad = collectionIds()
      .map(frontmatter)
      .filter((e) => !/^[a-z]\d{2}-/.test(e.data.moduleId))
      .map((e) => `${e.id} (${e.data.moduleId})`);
    expect(bad, 'module ids must be zero-padded, e.g. m05-ld').toEqual([]);
  });

  it('keeps each hub in a strictly increasing reading order', () => {
    // `orderLessons` sorts moduleId first, then order. If a module spans a
    // non-contiguous order range — say module 4 holds 6, 7, 9 while module 5 holds 8 —
    // the pager silently walks 6, 7, 9, 8 and "next" goes backwards.
    const entries = collectionIds().map(frontmatter);
    for (const hub of new Set(entries.map((e) => e.data.hub))) {
      const seq = orderLessons(entries.filter((e) => e.data.hub === hub)).map((e) => e.data.order);
      const sorted = [...seq].sort((a, b) => a - b);
      expect(seq, `hub "${hub}" reading order is not monotonic`).toEqual(sorted);
      expect(new Set(seq).size, `hub "${hub}" has duplicate order values`).toBe(seq.length);
    }
  });

  it('does not collide with a static page of the same slug', () => {
    // `[...slug].astro` emits one route per collection entry. A leftover
    // `foo.astro` next to a migrated `foo.mdx` means two routes claim /deep_dives/foo/,
    // so each lesson's .astro must be deleted in the same commit its .mdx lands.
    const statics = new Set(
      readdirSync(PAGES_DIR)
        .filter((f) => f.endsWith('.astro') && f !== 'index.astro' && !f.startsWith('['))
        .map((f) => f.replace(/\.astro$/, ''))
    );
    const collisions = collectionIds().filter((id) => statics.has(id));
    expect(collisions, 'delete the .astro when the .mdx lands').toEqual([]);
  });
});


describe('index catalog', () => {
  // `DEEP_DIVE_ORDER` is the last fact about a lesson that lives outside the collection,
  // and the index falls back to appending anything it omits — which would hide the
  // omission. These three checks are what make that fallback safe to keep.
  const legacyIds = DEEP_DIVES.map((e) => e.id);

  it('orders every card exactly once', () => {
    expect(DEEP_DIVE_ORDER.length).toBe(new Set(DEEP_DIVE_ORDER).size);
  });

  it('names nothing that does not exist', () => {
    const known = new Set([...legacyIds, ...collectionIds()]);
    expect(DEEP_DIVE_ORDER.filter((id) => !known.has(id))).toEqual([]);
  });

  it('leaves nothing unordered', () => {
    const ordered = new Set(DEEP_DIVE_ORDER);
    const missing = [...legacyIds, ...collectionIds()].filter((id) => !ordered.has(id));
    expect(missing, 'add new deep dives to DEEP_DIVE_ORDER').toEqual([]);
  });

  it('keeps no hand-written copy of a lesson that has a content file', () => {
    // The whole point of deriving the card: two copies of a title and a reading time
    // drift, and this repo has already shipped that. A migration deletes the entry.
    const collection = new Set(collectionIds());
    expect(legacyIds.filter((id) => collection.has(id))).toEqual([]);
  });
});

describe('referenceSurname', () => {
  it('takes the last word for an ordinary name', () => {
    expect(referenceSurname('Peter M. Visscher')).toBe('Visscher');
    expect(referenceSurname('Marc Peter Deisenroth')).toBe('Deisenroth');
    expect(referenceSurname('R. A. Fisher')).toBe('Fisher');
  });

  it('absorbs lowercase particles, which the naive rule dropped', () => {
    expect(referenceSurname('Gustavo de los Campos')).toBe('de los Campos');
    expect(referenceSurname('Laurens van der Maaten')).toBe('van der Maaten');
    expect(referenceSurname('Johan T. den Dunnen')).toBe('den Dunnen');
    expect(referenceSurname('Ludwig von Mises')).toBe('von Mises');
  });

  it('does not absorb a capitalised middle name', () => {
    // the case that stops the particle rule from eating everything
    expect(referenceSurname('Sang Hong Lee')).toBe('Lee');
    expect(referenceSurname('W. James Kent')).toBe('Kent');
  });

  it('survives odd input', () => {
    expect(referenceSurname('Plato')).toBe('Plato');
    expect(referenceSurname('  spaced   out  ')).toBe('out');
    expect(referenceSurname('')).toBe('');
  });
});

