import { describe, expect, it } from 'vitest';
import { DEEP_DIVE_WIDGET_KINDS } from './deepDiveWidgetKinds';
import katex from 'katex';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

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
const REGISTRY = 'src/content/deepDiveDatasets/datasets.yaml';

function hasOddBackslashRun(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] !== '\\') continue;
    let end = i;
    while (value[end] === '\\') end += 1;
    if ((end - i) % 2 === 1) return true;
    i = end - 1;
  }
  return false;
}

const LATEX_COMMAND_NAMES = [
  'alpha',
  'approx',
  'argmax',
  'argmin',
  'bar',
  'begin',
  'beta',
  'boldsymbol',
  'cdot',
  'cos',
  'delta',
  'det',
  'dfrac',
  'ell',
  'end',
  'epsilon',
  'exp',
  'frac',
  'gamma',
  'geq',
  'hat',
  'infty',
  'lambda',
  'left',
  'leq',
  'lim',
  'ln',
  'log',
  'mathbb',
  'mathcal',
  'mathbf',
  'mathsf',
  'max',
  'mid',
  'min',
  'mu',
  'nabla',
  'neq',
  'omega',
  'operatorname',
  'overbrace',
  'overline',
  'overset',
  'partial',
  'perp',
  'phi',
  'pi',
  'prod',
  'propto',
  'psi',
  'qquad',
  'quad',
  'rho',
  'right',
  'sigma',
  'sim',
  'sin',
  'softmax',
  'sqrt',
  'sum',
  'tan',
  'tau',
  'text',
  'tfrac',
  'theta',
  'tilde',
  'times',
  'top',
  'underbrace',
  'varepsilon',
].join('|');

function maskedMarkdownMath(body: string): { expression: string; line: number }[] {
  const mask = (value: string) => value.replace(/[^\n]/g, ' ');
  const source = body
    .replace(/```[\s\S]*?```/g, mask)
    .replace(/`[^`\n]*`/g, mask)
    .replace(/<svg[\s\S]*?<\/svg>/g, mask);
  return [...source.matchAll(/\$\$([\s\S]*?)\$\$|(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g)].map(
    (match) => ({
      expression: match[1] ?? match[2],
      line: source.slice(0, match.index).split('\n').length,
    })
  );
}

function keyEquations(front: string): string[] {
  const value = parse(front).keyEquations;
  return Array.isArray(value) && value.every((equation) => typeof equation === 'string')
    ? value
    : [];
}

function unstyledMathWords(expression: string): string[] {
  const withoutStyledNames = expression.replace(
    /\\(?:boldsymbol|mathbb|mathbf|mathcal|mathrm|mathsf|operatorname|text)\*?\{[^{}]*\}/g,
    ' '
  );
  const withoutCommands = withoutStyledNames.replace(/\\[A-Za-z]+/g, ' ');
  const words = [...withoutCommands.matchAll(/\b[A-Za-z]*[a-z]{3,}[A-Za-z]*\b/g)].map(
    (match) => match[0]
  );
  const matrixProducts = new Set(['BA', 'LT', 'QK', 'XW']);
  const acronyms = [...withoutCommands.matchAll(/\b[A-Z]{2,}\b/g)]
    .map((match) => match[0])
    .filter((name) => !matrixProducts.has(name));
  return [...words, ...acronyms];
}

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
  draft: boolean;
}

function lessons(): Lesson[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => /\.mdx?$/.test(f))
    .sort()
    .map((f) => {
      const raw = readFileSync(join(DIR, f), 'utf8');
      const parts = raw.split(/^---$/m);
      const front = parts[1] ?? '';
      return {
        id: f.replace(/\.mdx?$/, ''),
        front,
        body: parts.slice(2).join('---'),
        draft: /^draft:\s*true\s*$/m.test(front),
      };
    });
}

/** Count the items of a YAML list field in frontmatter. */
const listLength = (front: string, field: string) => {
  const m = front.match(new RegExp(`^${field}:\\s*\\n((?:\\s{2,}-\\s.*\\n)+)`, 'm'));
  return m ? m[1].trimEnd().split('\n').length : 0;
};

const count = (body: string, re: RegExp) => (body.match(re) ?? []).length;

const datasetKeys = () =>
  new Set(
    existsSync(REGISTRY)
      ? [...readFileSync(REGISTRY, 'utf8').matchAll(/^([A-Za-z0-9_-]+):$/gm)].map((m) => m[1])
      : []
  );

const referenceKeys = () =>
  new Set(
    existsSync(REFS)
      ? [...readFileSync(REFS, 'utf8').matchAll(/^([A-Za-z0-9_-]+):$/gm)].map((m) => m[1])
      : []
  );

const all = lessons();
const published = all.filter((lesson) => !lesson.draft);

describe('deep-dive lesson contract', () => {
  it('has at least one lesson to check, so the suite cannot pass vacuously', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  describe.each(published.map((l) => [l.id, l] as const))('%s', (_id, lesson) => {
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

    it('points every worked example at an existing test file', () => {
      // `verifiedBy` is the provenance line the component renders. Checking the count alone
      // allowed a typo or a plausible-looking but unrelated file to appear as verification.
      const examples = [...body.matchAll(/<WorkedExample\b[\s\S]*?<\/WorkedExample>/g)];
      const broken = examples.flatMap((example) => {
        const title = example[0].match(/\btitle="([^"]+)"/)?.[1] ?? 'untitled example';
        const verifiedBy = example[0].match(/\bverifiedBy="([^"]+)"/)?.[1];
        return !verifiedBy || !existsSync(verifiedBy)
          ? [`${title}: ${verifiedBy ?? 'missing verifiedBy'}`]
          : [];
      });
      expect(broken).toEqual([]);
    });

    it.runIf(/^hub:\s*ml-dl-interview\s*$/m.test(front))(
      'registers every ML interview worked example by title in its provenance test',
      () => {
        const examples = [...body.matchAll(/<WorkedExample\b[\s\S]*?<\/WorkedExample>/g)];
        const unlinked = examples.flatMap((example) => {
          const title = example[0].match(/\btitle="([^"]+)"/)?.[1] ?? 'untitled example';
          const verifiedBy = example[0].match(/\bverifiedBy="([^"]+)"/)?.[1];
          if (!verifiedBy || !existsSync(verifiedBy)) return [`${title}: missing test file`];
          return readFileSync(verifiedBy, 'utf8').includes(title)
            ? []
            : [`${title}: absent from ${verifiedBy}`];
        });
        expect(unlinked).toEqual([]);
      }
    );

    it(`sets at least ${FLOOR.exercises} exercises`, () => {
      expect(count(body, /<Exercise\b/g)).toBeGreaterThanOrEqual(FLOOR.exercises);
    });

    it('gives every exercise a solution', () => {
      expect(count(body, /slot="solution"/g)).toBe(count(body, /<Exercise\b/g));
    });

    it(`includes at least ${FLOOR.figures} figure, each with a caption and alt text`, () => {
      // Match each <Figure …> opening tag and check inside it. Counting bare `caption="`
      // across the body is wrong: <DatasetTable caption="…"> has one too.
      const tags = [...body.matchAll(/<Figure\b[\s\S]*?>/g)].map((m) => m[0]);
      expect(tags.length).toBeGreaterThanOrEqual(FLOOR.figures);
      expect(tags.filter((t) => /\bcaption="/.test(t))).toHaveLength(tags.length);
      expect(tags.filter((t) => /\balt="/.test(t))).toHaveLength(tags.length);
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

    // ── Resource-track pages carry one extra obligation ──────────────────────
    // "Full contract, adapted" means adding a floor, not relaxing one. Everything above
    // applies unchanged; a data page must additionally render its layer's resource table
    // and name only resources the registry actually defines.
    const isResourcePage = /^track:\s*resource\s*$/m.test(front);

    it.runIf(isResourcePage)('renders at least one resource table', () => {
      expect(count(body, /<DatasetTable\b/g)).toBeGreaterThanOrEqual(1);
    });

    it.runIf(isResourcePage)('names only resources the registry defines', () => {
      const keys = datasetKeys();
      const named = new Set<string>();
      for (const m of body.matchAll(/<Dataset\s+id="([^"]+)"/g)) named.add(m[1]);
      for (const m of body.matchAll(/<DatasetTable[^>]*\bids=\{\[([^\]]*)\]\}/g)) {
        for (const id of m[1].matchAll(/['"]([^'"]+)['"]/g)) named.add(id[1]);
      }
      expect([...named].filter((n) => !keys.has(n))).toEqual([]);
    });

    it.runIf(isResourcePage)('imports the registry components it uses', () => {
      const used = new Set([...body.matchAll(/<(Dataset|DatasetTable)\b/g)].map((m) => m[1]));
      const imported = new Set(
        [...body.matchAll(/^import\s+(\w+)\s+from\s+'[^']*deepdive\/[^']*'/gm)].map((m) => m[1])
      );
      expect([...used].filter((u) => !imported.has(u)).sort()).toEqual([]);
    });

    // ── Statistical-genetics track ───────────────────────────────────────────
    const isStatgen = /^hub:\s*statistical-genetics\s*$/m.test(front);
    const order = Number(front.match(/^order:\s*(\d+)\s*$/m)?.[1] ?? NaN);

    it.runIf(isStatgen)('declares a prerequisite once one exists to declare', () => {
      // A curriculum whose lessons announce no order of study is a list, not a course.
      // The rule only applies once an earlier lesson is actually in the collection —
      // `reference('deepDives')` cannot point at a file that has not been written yet.
      const earlier = published.some(
        (l) =>
          /^hub:\s*statistical-genetics\s*$/m.test(l.front) &&
          Number(l.front.match(/^order:\s*(\d+)\s*$/m)?.[1] ?? NaN) < order &&
          !/^isHub:\s*true\s*$/m.test(l.front)
      );
      if (!earlier || /^isHub:\s*true\s*$/m.test(front)) return;
      expect(listLength(front, 'prerequisites')).toBeGreaterThanOrEqual(1);
    });

    it('imports Widget if it mounts one', () => {
      if (!/<Widget\b/.test(body)) return;
      expect(body).toMatch(/^import\s+Widget\s+from\s+'[^']*deepdive\/Widget\.astro'/m);
    });

    it('gives every widget a caption and a text alternative', () => {
      const tags = [...body.matchAll(/<Widget\b[\s\S]*?\/>/g)].map((m) => m[0]);
      expect(tags.filter((t) => /\bcaption="/.test(t))).toHaveLength(tags.length);
      expect(tags.filter((t) => /\balt="/.test(t))).toHaveLength(tags.length);
      expect(tags.filter((t) => /\bkind="/.test(t))).toHaveLength(tags.length);
    });

    it('imports every deep-dive component it uses', () => {
      const used = new Set(
        [...body.matchAll(/<(Callout|Notation|WorkedExample|Exercise|Figure|Citation)\b/g)].map(
          (m) => m[1]
        )
      );
      const imported = new Set(
        [...body.matchAll(/^import\s+(\w+)\s+from\s+'[^']*deepdive\/[^']*'/gm)].map((m) => m[1])
      );
      expect([...used].filter((u) => !imported.has(u)).sort()).toEqual([]);
    });
  });
});

/**
 * The conventions the curriculum must not disagree with itself about.
 *
 * Each of these is a failure the series has already shipped, or come within one commit
 * of shipping: two lessons quoting different constants for the same quantity, two
 * writing Wakefield's Bayes factor in opposite directions without saying they are
 * reciprocals, three quoting different numbers of ancestry PCs. They read as
 * contradictions to anyone reading more than one page, and nothing else catches them —
 * each page is internally consistent.
 */
describe('curriculum consistency', () => {
  // Inline SVG is full of numbers that are pixel coordinates and mean nothing here — a
  // path command `L339.6,` reads as the constant 39.6 to any pattern loose enough to be
  // useful. Strip the figures first, and scan the prose.
  const prose = (body: string) => body.replace(/<svg[\s\S]*?<\/svg>/g, ' ');
  const corpus = published.map((l) => ({ id: l.id, text: prose(l.body) }));
  const mentioning = (re: RegExp) => corpus.filter((c) => re.test(c.text));

  it('uses one constant for the median of the null chi-square', () => {
    // 0.4549364231195727 exactly. A rounded 0.455 in one lesson beside 0.454936 in seven
    // others reads as two different corrections. Scanning near λ_GC rather than for every
    // "0.45…" in the corpus, because a haplotype frequency of 0.45 is not this constant.
    const offenders: string[] = [];
    for (const { id, text } of corpus) {
      for (const m of text.matchAll(/\\lambda_\{?(?:\\text\{GC\}|GC)\}?|λ_?\{?GC\}?/g)) {
        const window = text.slice(m.index, m.index + 240);
        for (const n of window.matchAll(/0\.45\d*/g)) {
          if (!n[0].startsWith('0.454936')) offenders.push(`${id}: ${n[0]}`);
        }
      }
    }
    expect(offenders, 'λ_GC divides by 0.454936…, never a rounding of it').toEqual([]);
  });

  it('writes Wakefield in the BF₀₁ direction, and flags the reciprocal if it uses it', () => {
    // The subscript can arrive three ways and the guard has to see all of them: the Unicode
    // BF₀₁, a bare BF_{01}, and — the one that slipped through first — \mathrm{BF}_{01},
    // where the closing brace sits between "BF" and the underscore.
    const direction = (d: string) =>
      new RegExp(`BF\\}?_\\{?${d}[,\\}]|BF${d === '01' ? '₀₁' : '₁₀'}`);
    for (const { id, text } of mentioning(/Wakefield|\\text\{ABF\}|\bABF\b/)) {
      expect(text, `${id}: ABF must be written BF₀₁`).toMatch(direction('01'));
      if (direction('10').test(text)) {
        expect(text, `${id}: the BF₁₀ form appears without saying it is the reciprocal`).toMatch(
          /reciprocal/i
        );
      }
    }
  });

  it('normalises the PIP against an explicit null', () => {
    for (const { id, text } of mentioning(/\\text\{PIP\}|\bPIP\b/)) {
      expect(
        text,
        `${id}: a PIP without π₀ asserts the locus certainly contains a causal variant`
      ).toMatch(/\\pi_0|π₀/);
    }
  });

  it('parameterises power by q², the variance explained', () => {
    // N ≥ 39.60/q² and N ≥ 19.80/(p(1−p)β²) are the same result; one notation per
    // curriculum, or two lessons look like they disagree. The boundary matters: 39.60
    // must not match a coordinate or the tail of some longer number.
    for (const { id, text } of mentioning(/(?<![\d.])(?:39\.60|19\.80)(?![\d])/)) {
      expect(text, `${id}: sample-size formulas are written in q²`).toMatch(/q\^2|q²/);
    }
  });

  it('quotes one number of ancestry principal components', () => {
    const counts = new Set(
      corpus.flatMap((c) =>
        [
          ...c.text.matchAll(
            /(\d+)(?:\s*[–-]\s*\d+)?\s+(?:ancestry\s+)?(?:principal components|PCs)\b/g
          ),
        ].map((m) => m[1])
      )
    );
    expect([...counts], 'the series has quoted 10, "10–20" and 20 in three places').toHaveLength(
      Math.min(counts.size, 1)
    );
  });

  it('has no braces inside an inline figure, which MDX reads as an expression', () => {
    // A figure generator that writes a set as "{v3, v4, v5}" splices a JSX expression into
    // the page, and the build fails with `ReferenceError: v3 is not defined` — pointing at
    // a compiled chunk rather than at the figure. Cheap to check, expensive to diagnose.
    // Only *text content* — the gap between > and < — is checked. Braces inside a tag are
    // JSX attribute bindings, which are deliberate and work (the ML hub's figure uses them).
    const offenders: string[] = [];
    for (const lesson of published) {
      for (const svg of lesson.body.match(/<svg[\s\S]*?<\/svg>/g) ?? []) {
        for (const node of svg.matchAll(/>([^<>]*)</g)) {
          for (const brace of node[1].match(/\{[^}]*\}/g) ?? []) {
            // A bare identifier is a real binding — the ML hub's figure maps over data and
            // emits <text>{label}</text>. Anything with a comma, a space or punctuation is
            // literal text that MDX will try, and fail, to evaluate.
            const inner = brace.slice(1, -1);
            if (!/^[A-Za-z_$][\w$.]*$/.test(inner)) {
              offenders.push(`${lesson.id}: ${brace.slice(0, 44)}`);
            }
          }
        }
      }
    }
    expect(offenders, 'a brace in SVG text content becomes a JSX expression').toEqual([]);
  });

  it('states no figure number the figure does not draw and the lesson never mentions', () => {
    // A caption is edited far more often than the generator that produced the drawing beside
    // it, so a caption drifts. The rare-variant lesson shipped one claiming a burden of 295
    // and "SKAT holds at 34,797" beside a figure drawing 1,356 and 32,097 — inverting the
    // point, since SKAT not moving is the whole reason that figure exists. Nothing else
    // caught it: the prose, the table, the SVG and the tests all agreed, and only the two
    // strings a reader actually reads were wrong.
    //
    // Comma-formatted integers only. They are almost always measured results, whereas a bare
    // decimal in a caption is usually a parameter ("h² = 0.30") that the drawing states some
    // other way ("ceiling: 30%"). A number is accepted if the SVG draws it OR the lesson
    // states it anywhere else — a caption may legitimately restate a value from the prose.
    const ALLOWED = new Set([
      // Alt text describing an axis *domain*, whose endpoints carry no tick label. Good
      // practice for a screen reader, and invisible to the check above.
      'data-population-frequency::1,000',
      'statgen-blup-genomic-selection::200,000',
    ]);
    const offenders: string[] = [];
    for (const lesson of published) {
      const prose = lesson.body.replace(/<svg[\s\S]*?<\/svg>/g, ' ');
      for (const fig of lesson.body.matchAll(/<Figure\b([\s\S]*?)<\/Figure>/g)) {
        const svg = fig[1].match(/<svg[\s\S]*?<\/svg>/)?.[0];
        if (!svg) continue;
        const drawn = [...svg.matchAll(/>([^<>]*)</g)].map((m) => m[1]).join(' ');
        for (const attr of ['caption', 'alt']) {
          const text = fig[1].match(new RegExp(`${attr}="([^"]*)"`))?.[1];
          if (!text) continue;
          const rest = prose.replace(text, ' ');
          for (const n of new Set(text.match(/\d{1,3}(?:,\d{3})+/g) ?? [])) {
            const bare = n.replace(/,/g, '');
            const latex = n.replace(/,/g, '{,}');
            if (drawn.includes(n) || drawn.includes(bare)) continue;
            if (rest.includes(n) || rest.includes(latex)) continue;
            if (ALLOWED.has(`${lesson.id}::${n}`)) continue;
            offenders.push(`${lesson.id} [${attr}]: ${n}`);
          }
        }
      }
    }
    expect(offenders, 'a caption may not state a figure number nothing else in the lesson does').toEqual(
      []
    );
  });

  it('mounts no widget kind the controller cannot render', () => {
    const known = new Set<string>(DEEP_DIVE_WIDGET_KINDS);
    const used = corpus.flatMap((c) =>
      [...c.text.matchAll(/<Widget[\s\S]*?kind="([^"]+)"/g)].map((m) => ({ id: c.id, kind: m[1] }))
    );
    expect(used.filter((u) => !known.has(u.kind)).map((u) => `${u.id}: ${u.kind}`)).toEqual([]);
  });

  it('escapes LaTeX backslashes inside JSX notation strings', () => {
    const broken = corpus.flatMap(({ id, text }) =>
      [...text.matchAll(/symbol:\s*'([^']*)'/g)]
        .filter((match) => hasOddBackslashRun(match[1]))
        .map((match) => `${id}: ${match[1]}`)
    );
    expect(broken).toEqual([]);
  });

  it('uses backslashes for LaTeX command names in ML Markdown math', () => {
    const bareCommand = new RegExp(`(?<!\\\\)\\b(${LATEX_COMMAND_NAMES})\\b`, 'g');
    const namedArguments =
      /\\(?:begin|boldsymbol|end|mathbb|mathbf|mathcal|mathrm|mathsf|operatorname|text)\{[^{}]*\}/g;
    const broken = published
      .filter(({ front }) => /^hub:\s*ml-dl-interview\s*$/m.test(front))
      .flatMap(({ id, body }) =>
        maskedMarkdownMath(body).flatMap(({ expression, line }) => {
          const searchable = expression.replace(namedArguments, ' ');
          return [...searchable.matchAll(bareCommand)].map(
            (match) => `${id}:${line}: ${match[1]} in $${expression.replace(/\s+/g, ' ').trim()}$`
          );
        })
      );
    expect(broken).toEqual([]);
  });

  it('stores ML key equations as semantic LaTeX rather than pseudo-math', () => {
    const broken = published
      .filter(({ front }) => /^hub:\s*ml-dl-interview\s*$/m.test(front))
      .flatMap(({ id, front }) =>
        keyEquations(front).flatMap((expression, index) => {
          const issues: string[] = [];
          if (/[^\x00-\x7f]/.test(expression)) issues.push('contains Unicode math shorthand');
          if (/_\(/.test(expression)) issues.push('uses parenthesized pseudo-subscript syntax');
          if (/\|/.test(expression)) issues.push('uses ASCII vertical bars');
          const words = [...new Set(unstyledMathWords(expression))];
          if (words.length > 0) issues.push(`has unstyled multi-letter names: ${words.join(', ')}`);
          try {
            katex.renderToString(expression, { strict: 'error', throwOnError: true });
          } catch (error) {
            issues.push(`does not parse as strict KaTeX: ${(error as Error).message}`);
          }
          return issues.map((issue) => `${id} keyEquations[${index}]: ${issue} in ${expression}`);
        })
      );
    expect(broken).toEqual([]);
  });

  it('contains no non-whitespace control characters', () => {
    const broken = corpus
      .filter(({ text }) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))
      .map(({ id }) => id);
    expect(broken).toEqual([]);
  });
});
