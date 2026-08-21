import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The educational contract, as a gate.
 *
 * Three lessons can be held to a standard by hand. Twenty-two cannot — quality drifts, and
 * the lessons written last are always the thinnest. The floors below are measured from the
 * three pilot lessons, each of which carries 5–6 objectives, 2 worked examples, 3 exercises,
 * 2 figures, 11–13 inline citations, exactly one notation table and exactly one intuition
 * callout. A lesson that quietly ships without exercises now fails the suite instead of the
 * reader.
 *
 * These are floors, not targets. Passing is the minimum; the pilot sits comfortably above.
 */

const DIR = 'src/content/deepDives';
const REFS = 'src/content/deepDiveReferences/references.yaml';

const FLOOR = {
  objectives: 4,
  workedExamples: 1,
  exercises: 3,
  figures: 1,
  references: 6,
  notationTables: 1,
  intuitionCallouts: 1,
};

interface Lesson {
  id: string;
  front: string;
  body: string;
}

function lessons(): Lesson[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => /\.mdx?$/.test(f))
    .sort()
    .map((f) => {
      const raw = readFileSync(join(DIR, f), 'utf8');
      const parts = raw.split(/^---$/m);
      return { id: f.replace(/\.mdx?$/, ''), front: parts[1] ?? '', body: parts.slice(2).join('---') };
    });
}

/** Count the items of a YAML list field in frontmatter. */
const listLength = (front: string, field: string) => {
  const m = front.match(new RegExp(`^${field}:\\s*\\n((?:\\s{2,}-\\s.*\\n)+)`, 'm'));
  return m ? m[1].trimEnd().split('\n').length : 0;
};

const count = (body: string, re: RegExp) => (body.match(re) ?? []).length;

const referenceKeys = () =>
  new Set(
    existsSync(REFS)
      ? [...readFileSync(REFS, 'utf8').matchAll(/^([A-Za-z0-9_-]+):$/gm)].map((m) => m[1])
      : []
  );

const all = lessons();

describe('deep-dive lesson contract', () => {
  it('has at least one lesson to check, so the suite cannot pass vacuously', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  describe.each(all.map((l) => [l.id, l] as const))('%s', (_id, lesson) => {
    const { front, body } = lesson;

    it(`states at least ${FLOOR.objectives} learning objectives`, () => {
      expect(listLength(front, 'objectives')).toBeGreaterThanOrEqual(FLOOR.objectives);
    });

    it('gives the intuition before any formalism', () => {
      expect(count(body, /variant="intuition"/g)).toBeGreaterThanOrEqual(FLOOR.intuitionCallouts);
    });

    it('defines its symbols in a notation table', () => {
      expect(count(body, /<Notation\b/g)).toBeGreaterThanOrEqual(FLOOR.notationTables);
    });

    it(`carries at least ${FLOOR.workedExamples} worked example`, () => {
      expect(count(body, /<WorkedExample\b/g)).toBeGreaterThanOrEqual(FLOOR.workedExamples);
    });

    it('ties every worked example to the test that recomputes it', () => {
      // `verifiedBy` is the provenance line the component renders. An example without one
      // is a number nothing is checking.
      expect(count(body, /verifiedBy=/g)).toBeGreaterThanOrEqual(count(body, /<WorkedExample\b/g));
    });

    it(`sets at least ${FLOOR.exercises} exercises`, () => {
      expect(count(body, /<Exercise\b/g)).toBeGreaterThanOrEqual(FLOOR.exercises);
    });

    it('gives every exercise a solution', () => {
      expect(count(body, /slot="solution"/g)).toBe(count(body, /<Exercise\b/g));
    });

    it(`includes at least ${FLOOR.figures} figure, each with a caption and alt text`, () => {
      const figures = count(body, /<Figure\b/g);
      expect(figures).toBeGreaterThanOrEqual(FLOOR.figures);
      expect(count(body, /\bcaption="/g)).toBe(figures);
      expect(count(body, /\balt="/g)).toBe(figures);
    });

    it(`cites at least ${FLOOR.references} references`, () => {
      expect(listLength(front, 'referenceIds')).toBeGreaterThanOrEqual(FLOOR.references);
    });

    it('closes with a summary', () => {
      expect(body).toMatch(/^##\s+Summary\s*$/m);
    });

    it('cites only ids it also lists, so no citation links to a missing anchor', () => {
      // `Citation.astro` links to `#ref-<id>`; the layout renders that anchor only for ids
      // in `referenceIds`. A mismatch is a link into nothing.
      const listed = new Set(
        (front.match(/^referenceIds:\s*\n((?:\s{2,}-\s.*\n)+)/m)?.[1] ?? '')
          .split('\n')
          .map((l) => l.replace(/^\s*-\s*/, '').trim())
          .filter(Boolean)
      );
      const cited = [...body.matchAll(/<Citation\s+id="([^"]+)"/g)].map((m) => m[1]);
      expect([...new Set(cited)].filter((c) => !listed.has(c))).toEqual([]);
    });

    it('lists no reference it never cites', () => {
      const listed = (front.match(/^referenceIds:\s*\n((?:\s{2,}-\s.*\n)+)/m)?.[1] ?? '')
        .split('\n')
        .map((l) => l.replace(/^\s*-\s*/, '').trim())
        .filter(Boolean);
      const cited = new Set([...body.matchAll(/<Citation\s+id="([^"]+)"/g)].map((m) => m[1]));
      expect(listed.filter((r) => !cited.has(r))).toEqual([]);
    });

    it('resolves every citation against the shared bibliography', () => {
      const keys = referenceKeys();
      const cited = [...new Set([...body.matchAll(/<Citation\s+id="([^"]+)"/g)].map((m) => m[1]))];
      expect(cited.filter((c) => !keys.has(c))).toEqual([]);
    });

    it('imports every deep-dive component it uses', () => {
      const used = new Set(
        [...body.matchAll(/<(Callout|Notation|WorkedExample|Exercise|Figure|Citation)\b/g)].map((m) => m[1])
      );
      const imported = new Set(
        [...body.matchAll(/^import\s+(\w+)\s+from\s+'[^']*deepdive\/[^']*'/gm)].map((m) => m[1])
      );
      expect([...used].filter((u) => !imported.has(u)).sort()).toEqual([]);
    });
  });
});
