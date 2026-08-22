#!/usr/bin/env node
/**
 * Verify the deep-dive bibliography against Crossref.
 *
 * Every entry in `src/content/deepDiveReferences/references.yaml` carries
 * `verified: <date>` — a claim that the DOI was checked and points at the work described.
 * That claim decays, and at ~250 entries nobody re-checks it by hand. This script does.
 *
 * For each DOI it asks Crossref for the registered metadata and fails if:
 *   - the DOI does not resolve at all (a typo, or a withdrawn registration), or
 *   - the recorded year disagrees with the registry, or
 *   - the recorded first author's surname does not appear in the registry's author list.
 *
 * That last pair is what matters. A DOI that resolves is not the same as a DOI that
 * resolves *to the paper you cited*, and the difference is invisible until a reader
 * follows the link. This check has already caught two: Kosambi dated 1944 when the
 * registry says 1943, and 10.1038/ng.3679 cited as Das's imputation server when it is
 * in fact Loh's Eagle2.
 *
 * Network-dependent, so it is deliberately not part of `npm run build`.
 *   npm run audit:refs             verify every DOI
 *   npm run audit:refs -- --offline   structural checks only (no network)
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const REFS = 'src/content/deepDiveReferences/references.yaml';
const LESSONS = 'src/content/deepDives';
const OFFLINE = process.argv.includes('--offline');
const CONCURRENCY = 2;
const MAX_RETRIES = 4;

const errors = [];
const warnings = [];

// ── Parse the YAML we control ──────────────────────────────────
// This must consume normal YAML rather than a line-oriented approximation: Prettier can
// legitimately wrap long author arrays, and the audit must not depend on presentation.
function parseReferences(text) {
  const parsed = parse(text, { uniqueKeys: true });
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('bibliography root must be a mapping');
  }
  return new Map(
    Object.entries(parsed).map(([key, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${key}: bibliography entry must be a mapping`);
      }
      return [key, { key, ...value }];
    })
  );
}

// Case-folded: Crossref deposits some older surnames in caps (KOSAMBI, FALCONER), while
// this bibliography stores them title-cased. Comparing raw strings reports a mismatch on
// three correct entries.
const surname = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-1)[0]
    .replace(/[^\p{L}-]/gu, '')
    .toLocaleLowerCase();

const isCorporateAuthor = (name) =>
  /\b(consortium|institute|institution|organization|association|collaboration|program|project|working group|committee|team|society|department|university|college|laborator(?:y|ies)|agency|administration|government|ministry|office|cent(?:er|re))\b/i.test(
    name
  );

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask Crossref about one DOI, backing off on throttling.
 *
 * A 429 means "you are asking too fast", not "this DOI is wrong" — reporting it as a
 * broken reference would make the audit cry wolf and train us to ignore it. Same for 5xx.
 * Only a 404 is evidence about the DOI itself.
 */
async function crossref(doi) {
  const id = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
  let wait = 1_000;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(id)}`, {
      headers: { 'User-Agent': 'khchao.com-reference-audit/1.0' },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      const { message } = await res.json();
      return {
        ok: true,
        year: message.issued?.['date-parts']?.[0]?.[0],
        authors: (message.author ?? []).map((a) => a.family || a.name || '').filter(Boolean),
        title: (message.title ?? [''])[0],
      };
    }
    const transient = res.status === 429 || res.status >= 500;
    if (!transient || attempt === MAX_RETRIES) {
      return { ok: false, status: res.status, transient };
    }
    await sleep(wait);
    wait *= 2;
  }
  return { ok: false, status: 'exhausted', transient: true };
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    })
  );
  return out;
}

// ── Run ───────────────────────────────────────────────────────────────────────
if (!existsSync(REFS)) {
  console.error(`Reference audit failed: ${REFS} not found.`);
  process.exit(1);
}

/**
 * Parse the file the way Astro will, before doing anything else.
 *
 * Both audits read this file with a small regex parser, which is fine for the fixed shape
 * it is generated in — but a regex parser cannot fail on invalid YAML, and Astro's loader
 * can. A single unescaped apostrophe (`'Nuala A. O'Leary'`) once passed this audit cleanly
 * and then took the whole build down with an empty collection and a Citation throwing on
 * every page. Catch it here, where the error names the line.
 */
function assertParses(path) {
  try {
    parse(readFileSync(path, 'utf8'), { uniqueKeys: true });
  } catch (err) {
    console.error(`Reference audit failed: ${path} is not valid YAML — Astro will not load it.`);
    console.error(String(err.message).split('\n').slice(0, 8).join('\n'));
    process.exit(1);
  }
}

assertParses(REFS);
const entries = parseReferences(readFileSync(REFS, 'utf8'));
const list = [...entries.values()];

// Structural checks (no network).
const seenDoi = new Map();
for (const e of list) {
  if (!e.year) errors.push(`${e.key}: no year`);
  if (!e.title) errors.push(`${e.key}: no title`);
  if (!e.authors?.length) errors.push(`${e.key}: no authors`);
  if (!e.verified) errors.push(`${e.key}: no verified date`);
  if (!e.doi && !e.url) warnings.push(`${e.key}: neither doi nor url`);
  if (e.doi) {
    const prev = seenDoi.get(e.doi);
    if (prev) errors.push(`${e.key}: duplicate DOI, already used by ${prev}`);
    else seenDoi.set(e.doi, e.key);
  }
}

// Orphans: entries nothing cites. Harmless but they rot, and they inflate the file.
if (existsSync(LESSONS)) {
  const cited = new Set();
  for (const f of readdirSync(LESSONS).filter((n) => /\.mdx?$/.test(n))) {
    const body = readFileSync(join(LESSONS, f), 'utf8');
    for (const m of body.matchAll(/<Citation\s+id="([^"]+)"/g)) cited.add(m[1]);
  }
  for (const e of list) {
    if (!cited.has(e.key)) warnings.push(`${e.key}: in the bibliography but cited by no lesson`);
  }
  for (const c of cited) {
    if (!entries.has(c)) errors.push(`<Citation id="${c}"> has no bibliography entry`);
  }
}

let checked = 0;
if (!OFFLINE) {
  const withDoi = list.filter((e) => e.doi);
  const results = await mapLimit(withDoi, CONCURRENCY, async (e) => {
    try {
      return { e, r: await crossref(e.doi) };
    } catch (err) {
      return { e, r: { ok: false, status: String(err?.name ?? err) } };
    }
  });

  for (const { e, r } of results) {
    if (!r.ok) {
      const msg = `${e.key}: Crossref lookup returned ${r.status} — ${e.doi}`;
      // Still throttled after backing off: that says nothing about the DOI, so warn.
      if (r.transient) warnings.push(`${msg} (throttled; not verified this run)`);
      else errors.push(`${msg} — DOI does not resolve`);
      continue;
    }
    checked++;
    // Online-ahead-of-print, and volumes that straddle a new year, routinely put the
    // journal-of-record year one off Crossref's `issued`. That is a publishing artifact,
    // not a citation error, so a gap of one is a warning. A gap of more than one usually
    // means the DOI points at a different work, which is what this check is really for.
    if (r.year && Number(e.year) !== r.year) {
      const gap = Math.abs(Number(e.year) - r.year);
      const msg = `${e.key}: year ${e.year} but Crossref says ${r.year} — "${r.title}"`;
      if (gap <= 1) warnings.push(`${msg} (off by one; likely online-ahead-of-print)`);
      else errors.push(msg);
    }
    const want = surname(e.authors[0]);
    // Consortium and corporate authors are deposited inconsistently; only check people.
    const isPerson =
      want.length > 1 && !/^(the|consortium|anon)$/.test(want) && !isCorporateAuthor(e.authors[0]);
    if (isPerson && r.authors.length && !r.authors.some((a) => surname(a) === want)) {
      errors.push(
        `${e.key}: first author "${e.authors[0]}" not among Crossref authors ` +
          `[${r.authors.slice(0, 4).join(', ')}] — "${r.title}"`
      );
    }
  }
}

for (const w of warnings) console.warn(`  warning: ${w}`);
if (errors.length) {
  console.error(`\nReference audit failed with ${errors.length} error(s):`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(
  `Reference audit passed: ${list.length} entries` +
    (OFFLINE
      ? ' (offline: structure only)'
      : `, ${checked}/${list.filter((e) => e.doi).length} DOIs confirmed against Crossref`) +
    (warnings.length ? `, ${warnings.length} warning(s)` : '')
);
