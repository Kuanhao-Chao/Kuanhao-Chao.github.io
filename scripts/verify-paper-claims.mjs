#!/usr/bin/env node
/**
 * Cross-check every number rendered on a /papers/<slug>/ page against the full text of the paper
 * that page summarises.
 *
 * This exists because the /papers/ summaries were originally written from Europe PMC abstract
 * pages, bioRxiv HTML chrome and Cloudflare block pages rather than from the papers, and the
 * result was numbers that no source supports -- a fabricated Nature Methods page range, a corpus
 * size borrowed from a different model generation, a DOI belonging to another article entirely.
 * A number on one of these pages should be traceable to a line of the paper, and this is what
 * makes that checkable instead of aspirational.
 *
 * Local-only by design: the papers live in ~/Documents/papers_summaries, outside the repo, so
 * `npm run build` and CI must never depend on this. Run it by hand before and after editing a page.
 *
 *   node scripts/verify-paper-claims.mjs [papersDir]     # default ~/Documents/papers_summaries
 *   node scripts/verify-paper-claims.mjs --slug gtex     # one page
 *
 * Reads dist/papers/<slug>/index.html, so `npm run build` first -- it checks what a reader
 * actually sees, not what the .astro source happens to contain.
 */
import { readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');

/** Page slug -> the directory holding that paper's PDF and extracted_text.txt. */
const SOURCES = {
  alphamissense: 'alphamissense',
  deepvariant: 'deepvariant',
  gears: 'gears',
  'nucleotide-transformer': 'nucleotide_transformer',
  'nucleotide-transformer-v3': 'nucleotide_transformer_v3',
  traitgym: 'traitgym',
  zoonomia: 'zoonomia',
  'zoonomia-constraint': 'zoonomia_constraint',
  gtex: 'gtex',
};

/**
 * Numbers a page may legitimately carry that the paper's body will not contain: bibliographic
 * fields, which are verified against Crossref instead, and values the page derives itself.
 * Anything listed here must say why -- an unexplained entry is the failure this script exists
 * to catch, wearing a disguise.
 */
const ALLOW = {
  // slug: [[numberAsWritten, reason], ...]
  'nucleotide-transformer-v3': [
    ['3202', "NT1's pretraining corpus, cited to contrast it with NTv3's; verified in nucleotide_transformer/extracted_text.txt"],
    ['850', "NT1's multispecies genome count, cited for the same contrast; verified in nucleotide_transformer/extracted_text.txt"],
  ],
};

const args = process.argv.slice(2);
const only = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : null;
const papersDir = args.find((a) => !a.startsWith('--') && a !== only) ?? join(homedir(), 'Documents/papers_summaries');

const exists = async (p) => access(p).then(() => true).catch(() => false);

/** Visible text of a built page: drop scripts, styles, tags and the link targets. */
function pageText(html) {
  const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
  return article
    // The header block carries volume/issue/pages/year/DOI. Those are bibliographic facts, checked
    // against Crossref by `headerOf` below, and they are not expected to appear in the paper's own
    // body text -- scanning them here only produces noise that hides the real claims.
    .replace(/<div class="paper-authors-box"[\s\S]*?<\/div>\s*<\/header>/i, ' ')
    .replace(/<div class="paper-meta-bar"[\s\S]*?<\/div>/i, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/\shref="[^"]*"/gi, ' ')     // DOIs and URLs are checked separately, not as prose
    .replace(/\ssrc="[^"]*"/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\bPMC\s?\d+/g, ' ')   // accessions in a page's source note are provenance, not claims
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');
}

const stripSep = (s) => s.replace(/,/g, '');

/** Every numeric token in a body of text, comma-separators removed. */
function numbersIn(text) {
  const out = new Set();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) out.add(stripSep(m[0]));
  return out;
}

/**
 * A page number is supported if the paper contains it outright, or contains a more precise value
 * that rounds to it (a page saying 94.7 against a paper saying 94.68 is a rounding, not a fault).
 */
function supported(value, paperNums, paperDigits) {
  if (paperDigits.includes(value)) return true;
  if (paperNums.has(value)) return true;
  const dot = value.indexOf('.');
  if (dot === -1) return false;
  const dp = value.length - dot - 1;
  const target = Number(value);
  if (!Number.isFinite(target)) return false;
  for (const n of paperNums) {
    const num = Number(n);
    if (!Number.isFinite(num)) continue;
    if (num.toFixed(dp) === target.toFixed(dp)) return true;
  }
  return false;
}

/** Section numbers, list indices and small counts are noise, not claims. */
function isClaim(raw) {
  const v = stripSep(raw);
  if (v.includes('.')) return true;
  const n = Number(v);
  return Number.isFinite(n) && n >= 10;
}

const slugs = only ? [only] : Object.keys(SOURCES);
let checked = 0;
let unmatchedTotal = 0;
const missingPages = [];
const missingSources = [];

for (const slug of slugs) {
  const htmlPath = join(DIST, 'papers', slug, 'index.html');
  const textPath = join(papersDir, SOURCES[slug] ?? slug, 'extracted_text.txt');

  if (!(await exists(htmlPath))) { missingPages.push(slug); continue; }
  if (!(await exists(textPath))) { missingSources.push(`${slug} -> ${textPath}`); continue; }

  const html = await readFile(htmlPath, 'utf8');
  const header = (html.match(/<div class="paper-authors-box"[\s\S]*?<\/div>\s*<\/header>/i)?.[0] ?? '')
    .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  const text = pageText(html);
  const paper = await readFile(textPath, 'utf8');
  const paperDigits = stripSep(paper);
  const paperNums = numbersIn(paper);
  const allow = new Set((ALLOW[slug] ?? []).map(([n]) => stripSep(String(n))));

  const seen = new Map();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?\s*%?/g)) {
    const raw = m[0].trim();
    const bare = stripSep(raw.replace(/\s*%$/, ''));
    if (!isClaim(bare)) continue;
    if (allow.has(bare)) continue;
    if (supported(bare, paperNums, paperDigits)) continue;
    const ctx = text.slice(Math.max(0, m.index - 60), m.index + raw.length + 60).trim();
    if (!seen.has(bare)) seen.set(bare, ctx);
  }

  checked += 1;
  unmatchedTotal += seen.size;
  const paperWords = paper.split(/\s+/).length;
  if (seen.size === 0) {
    console.log(`  OK   ${slug.padEnd(26)} every number traced (source: ${paperWords} words)`);
    if (process.env.SHOW_HEADER) console.log(`         header: ${header.slice(0, 150)}`);
  } else {
    console.log(`  FAIL ${slug.padEnd(26)} ${seen.size} number(s) the paper does not support (source: ${paperWords} words)`);
    for (const [n, ctx] of seen) console.log(`         ${n.padEnd(12)} … ${ctx.slice(0, 110)}`);
  }
}

if (missingPages.length) console.log(`\n  not built (run npm run build): ${missingPages.join(', ')}`);
if (missingSources.length) console.log(`\n  no extracted text:\n    ${missingSources.join('\n    ')}`);

console.log(`\n${unmatchedTotal === 0 && checked > 0 ? 'Paper-claim audit passed' : 'Paper-claim audit found issues'} — ${checked} page(s) checked, ${unmatchedTotal} unmatched number(s).`);
process.exit(unmatchedTotal === 0 ? 0 : 1);
