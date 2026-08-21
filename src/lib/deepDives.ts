/**
 * Pure helpers for the deep-dive curriculum. Everything here is a function of its
 * arguments so it can be unit-tested in node without a DOM or a built site.
 *
 * The catalog in `src/data/deepDives.ts` is presentation data for the hub; this
 * module is the logic that the collection, layout and route share.
 */

/** A heading as Astro's `render()` hands it back. */
export interface Heading {
  depth: number;
  slug: string;
  text: string;
}

export interface TocNode extends Heading {
  children: TocNode[];
}

/** Minimum fields `orderLessons` and `findPrerequisiteCycle` need. */
export interface LessonLike {
  id: string;
  data: {
    moduleId: string;
    order: number;
    prerequisites?: { id: string }[];
  };
}

/**
 * Time to read a lesson, in minutes.
 *
 * Not `words / 200`. These lessons are ~40 % mathematics by volume, and the naive
 * count fails in both directions at once: it prices a rendered formula as zero
 * (KaTeX source is punctuation, not words) while counting `\frac{V_A}{V_P}` as
 * three. The hand-written constants this replaces claimed 16–22 min for pages
 * carrying 600–900 words of prose — about 2.5x reality.
 *
 * So each kind of content is priced separately, and math is removed from the prose
 * count rather than being allowed to pollute it.
 */
export function lessonReadingTime(body: string): number {
  const { prose, display, inline, codeLines } = analyseBody(body);
  const seconds = (prose / 200) * 60 + display * DISPLAY_EQUATION_SECONDS + inline * INLINE_EQUATION_SECONDS + codeLines * CODE_LINE_SECONDS;
  return Math.max(1, Math.round(seconds / 60));
}

/** Seconds to parse one `$$…$$` block — long enough to read, not to re-derive. */
const DISPLAY_EQUATION_SECONDS = 15;
/** An inline `$…$` reads at roughly the pace of a short phrase. */
const INLINE_EQUATION_SECONDS = 3;
/** Code is skimmed rather than read. */
const CODE_LINE_SECONDS = 2;

export interface BodyAnalysis {
  /** Words of actual prose, with math, code and markup removed. */
  prose: number;
  display: number;
  inline: number;
  codeLines: number;
}

/**
 * Decompose a markdown/MDX body into the four things that cost reading time.
 *
 * Order matters: fenced code can contain `$`, and display math can contain what
 * looks like inline math, so each construct is removed as it is counted.
 */
export function analyseBody(body: string): BodyAnalysis {
  let rest = body ?? '';

  // 1. Fenced code first — it can contain every other construct.
  let codeLines = 0;
  rest = rest.replace(/^[ \t]*(`{3,}|~{3,})[\s\S]*?^[ \t]*\1[ \t]*$/gm, (block) => {
    // Don't charge for the two fence lines themselves.
    codeLines += Math.max(0, block.split('\n').length - 2);
    return ' ';
  });
  rest = rest.replace(/`[^`\n]*`/g, ' ');

  // 2. Display math before inline, or `$$a$$` reads as two inline spans.
  let display = 0;
  rest = rest.replace(/\$\$[\s\S]*?\$\$/g, () => {
    display += 1;
    return ' ';
  });

  let inline = 0;
  rest = rest.replace(/\$[^$\n]+\$/g, () => {
    inline += 1;
    return ' ';
  });

  // 3. JSX/HTML tags go, but their children stay — the prose inside a <Callout>
  //    is prose. Attributes disappear with the tag, which is what we want.
  rest = rest.replace(/<[^>]+>/g, ' ');

  // 4. Markdown syntax that is punctuation rather than words.
  rest = rest.replace(/!\[[^\]]*\]\([^)]*\)/g, ' '); // images
  rest = rest.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // links keep their text
  rest = rest.replace(/^\s{0,3}[#>]+\s*/gm, ' '); // heading / quote markers
  rest = rest.replace(/^\s*[-*+|:]+\s*$/gm, ' '); // list bullets, table rules
  rest = rest.replace(/[*_~`|]/g, ' ');

  const prose = rest
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;

  return { prose, display, inline, codeLines };
}

/** "9 min read" — the string the badge shows. */
export function formatReadingTime(minutes: number): string {
  return `${minutes} min read`;
}

/**
 * Nest a flat heading list into a table of contents.
 *
 * Every lesson currently hand-writes its own `<ol>` of anchors, numbered by hand,
 * which is a second copy of the section structure that can silently disagree with
 * the headings actually on the page. Generating it from `render()`'s headings makes
 * that impossible.
 *
 * Headings shallower than `min` (the `<h1>` title) are dropped; anything deeper
 * than `max` is ignored rather than flattened, so a stray `<h4>` cannot restructure
 * the list. A deeper heading appearing before any parent is promoted rather than
 * discarded — dropping content silently is worse than a slightly flat list.
 */
export function buildToc(headings: Heading[], min = 2, max = 3): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const h of headings) {
    if (h.depth < min || h.depth > max) continue;
    if (!h.slug) continue;
    const node: TocNode = { ...h, children: [] };

    while (stack.length && stack[stack.length - 1].depth >= h.depth) stack.pop();

    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }

  return roots;
}

/**
 * Sort lessons into curriculum order: module first, then position within it.
 *
 * Ties break on `id` so the order is total — an unstable sort would otherwise let
 * two lessons swap places between builds and churn the prev/next links.
 */
export function orderLessons<T extends LessonLike>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.data.moduleId !== b.data.moduleId) return a.data.moduleId < b.data.moduleId ? -1 : 1;
    if (a.data.order !== b.data.order) return a.data.order - b.data.order;
    return a.id < b.id ? -1 : 1;
  });
}

/**
 * The first prerequisite cycle, as the path that closes it, or null if the graph
 * is acyclic. `reference()` guarantees each prerequisite *exists*; nothing in the
 * schema stops A requiring B requiring A, which would render as a pair of lessons
 * each claiming the other must be read first.
 */
export function findPrerequisiteCycle(entries: LessonLike[]): string[] | null {
  const prereqs = new Map(entries.map((e) => [e.id, (e.data.prerequisites ?? []).map((p) => p.id)]));
  const state = new Map<string, 'open' | 'done'>();
  const path: string[] = [];

  function visit(id: string): string[] | null {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'open') return [...path.slice(path.indexOf(id)), id];

    state.set(id, 'open');
    path.push(id);
    for (const next of prereqs.get(id) ?? []) {
      // An unknown id is a dangling reference, not a cycle; the schema reports it.
      if (!prereqs.has(next)) continue;
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    state.set(id, 'done');
    return null;
  }

  for (const e of entries) {
    const cycle = visit(e.id);
    if (cycle) return cycle;
  }
  return null;
}

/** Previous and next lesson in curriculum order, for the footer pager. */
export function neighbours<T extends LessonLike>(
  ordered: T[],
  id: string
): { prev: T | null; next: T | null } {
  const i = ordered.findIndex((e) => e.id === id);
  if (i === -1) return { prev: null, next: null };
  return { prev: ordered[i - 1] ?? null, next: ordered[i + 1] ?? null };
}
