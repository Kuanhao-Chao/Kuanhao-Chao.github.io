#!/usr/bin/env node
/**
 * Verify the genomic resource registry.
 *
 * `src/content/deepDiveDatasets/datasets.yaml` is the single definition of every resource
 * the data track describes — version, scale, access level, URL — and every page renders
 * from it rather than re-typing the facts. That only helps if the registry itself is
 * true, and version numbers and URLs are exactly what rots silently.
 *
 * Checks:
 *   - every `<Dataset id>` and `<DatasetTable ids>` a page names exists in the registry
 *   - every registry entry is used by some page (an unused entry rots unseen)
 *   - every `url` resolves
 *   - every `verified` date is inside the staleness window
 *
 * A 403 or 429 is a warning, not an error. Institutional and publisher sites block bots
 * the same way Crossref throttles, and that lesson is already recorded in CLAUDE.md for
 * `audit:refs`; treating it as a failure would train us to ignore this audit.
 *
 *   npm run audit:datasets              full check
 *   npm run audit:datasets -- --offline structure only, no network
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REGISTRY = 'src/content/deepDiveDatasets/datasets.yaml';
const LESSONS = 'src/content/deepDives';
const OFFLINE = process.argv.includes('--offline');
const CONCURRENCY = 3;
const STALE_DAYS = 180;

const errors = [];
const warnings = [];

/** Parse the registry: a top-level key per resource, two-space-indented scalar fields. */
function parseRegistry(text) {
  const entries = new Map();
  let current = null;
  let folding = null;
  text.split('\n').forEach((line, i) => {
    if (/^\s*#/.test(line) || (!line.trim() && !folding)) return;
    const top = line.match(/^([A-Za-z0-9_-]+):\s*$/);
    if (top) {
      folding = null;
      current = { key: top[1], line: i + 1 };
      entries.set(top[1], current);
      return;
    }
    const field = line.match(/^\s{2}([a-zA-Z]+):\s*(.*)$/);
    if (field && current) {
      const [, name, raw] = field;
      if (raw === '>-' || raw === '>' || raw === '|') {
        folding = name;
        current[name] = '';
      } else {
        folding = null;
        current[name] = raw.replace(/^["']|["']$/g, '');
      }
      return;
    }
    if (folding && current && /^\s{4,}\S/.test(line)) current[folding] += ` ${line.trim()}`;
  });
  return entries;
}

async function head(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        headers: { 'User-Agent': 'khchao.com-dataset-audit/1.0' },
        signal: AbortSignal.timeout(25_000),
      });
      // Some hosts reject HEAD but serve GET; only fall through on 405/501.
      if (res.status === 405 || res.status === 501) continue;
      return { status: res.status };
    } catch (err) {
      if (method === 'GET') return { status: String(err?.name ?? err), network: true };
    }
  }
  return { status: 'unreachable', network: true };
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
if (!existsSync(REGISTRY)) {
  console.error(`Dataset audit failed: ${REGISTRY} not found.`);
  process.exit(1);
}

const entries = parseRegistry(readFileSync(REGISTRY, 'utf8'));
const list = [...entries.values()];
const REQUIRED = ['name', 'fullName', 'layer', 'url', 'scale', 'access', 'verified'];
const ACCESS = new Set(['open', 'registered', 'controlled', 'licensed']);

for (const e of list) {
  for (const f of REQUIRED) if (!e[f]) errors.push(`${e.key}: missing "${f}"`);
  if (e.access && !ACCESS.has(e.access)) {
    errors.push(`${e.key}: access "${e.access}" is not one of ${[...ACCESS].join(', ')}`);
  }
  if (e.verified) {
    const age = (Date.now() - Date.parse(e.verified)) / 86_400_000;
    if (Number.isNaN(age)) errors.push(`${e.key}: verified "${e.verified}" is not a date`);
    else if (age > STALE_DAYS) {
      warnings.push(`${e.key}: last verified ${Math.round(age)} days ago (window ${STALE_DAYS})`);
    }
  }
}

// Cross-reference against what the pages actually name.
if (existsSync(LESSONS)) {
  const used = new Set();
  for (const f of readdirSync(LESSONS).filter((n) => /\.mdx?$/.test(n))) {
    const body = readFileSync(join(LESSONS, f), 'utf8');
    for (const m of body.matchAll(/<Dataset\s+id="([^"]+)"/g)) used.add(m[1]);
    for (const m of body.matchAll(/<DatasetTable[^>]*\bids=\{\[([^\]]*)\]\}/g)) {
      for (const id of m[1].matchAll(/['"]([^'"]+)['"]/g)) used.add(id[1]);
    }
    // A layer table pulls in every entry of that layer.
    for (const m of body.matchAll(/<DatasetTable[^>]*\blayer="([^"]+)"/g)) {
      for (const e of list) if (e.layer === m[1]) used.add(e.key);
    }
  }
  for (const id of used) {
    if (!entries.has(id)) errors.push(`a page names dataset "${id}", which is not in the registry`);
  }
  for (const e of list) {
    if (!used.has(e.key)) warnings.push(`${e.key}: in the registry but named by no page`);
  }
}

let ok = 0;
if (!OFFLINE) {
  const results = await mapLimit(list.filter((e) => e.url), CONCURRENCY, async (e) => ({
    e,
    r: await head(e.url),
  }));
  for (const { e, r } of results) {
    if (typeof r.status === 'number' && r.status < 400) {
      ok++;
    } else if (r.status === 403 || r.status === 429) {
      warnings.push(`${e.key}: ${r.url ?? e.url} returned ${r.status} (bot-blocked; not checked)`);
    } else {
      errors.push(`${e.key}: ${e.url} returned ${r.status}`);
    }
  }
}

for (const w of warnings) console.warn(`  warning: ${w}`);
if (errors.length) {
  console.error(`\nDataset audit failed with ${errors.length} error(s):`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(
  `Dataset audit passed: ${list.length} resources` +
    (OFFLINE ? ' (offline: structure only)' : `, ${ok}/${list.filter((e) => e.url).length} URLs live`) +
    (warnings.length ? `, ${warnings.length} warning(s)` : '')
);
