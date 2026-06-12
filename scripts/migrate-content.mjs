/**
 * One-time migration: convert the old Jekyll `_presentations` and `_news`
 * collections into clean Astro content files.
 *
 *   node scripts/migrate-content.mjs
 *
 * Source repo is read-only; output goes to src/content/{presentations,news}.
 */
import fs from 'node:fs';
import path from 'node:path';

const OLD = '/Users/chaokuan-hao/Documents/Kuanhao-Chao.github.io';
const OUT = path.resolve(import.meta.dirname, '..', 'src', 'content');

/** Parse the YAML-ish front matter block + body from a Jekyll markdown file. */
function parse(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    let [, key, val] = kv;
    val = val.trim().replace(/^["'](.*)["']$/, '$1');
    fm[key] = val;
  }
  return { fm, body: (m[2] || '').trim() };
}

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

function toISO(input) {
  if (!input) return null;
  let s = String(input).trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  // already ISO-ish (YYYY-MM-DD or YYYY-MM)
  const iso = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3] ?? '01'}`;
  const d = new Date(s);
  if (!isNaN(d)) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }
  const y = s.match(/(\d{4})/);
  return y ? `${y[1]}-01-01` : null;
}

/** Convert simple inline HTML to Markdown, preserving links/emphasis. */
function htmlToMd(html) {
  return html
    .replace(/<a [^>]*href=['"]?([^'" >]+)['"]?[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<\/?(b|strong)>/gi, '**')
    .replace(/<\/?(i|em)>/gi, '*')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/\s+/g, ' ')
    .trim();
}

const stripTags = (html) => htmlToMd(html).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
const firstLink = (html) => (html.match(/href=['"]?([^'" >]+)/i) || [])[1] || null;
const yamlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;

const used = new Set();
function uniqueName(base) {
  let name = base;
  let i = 2;
  while (used.has(name)) name = `${base}-${i++}`;
  used.add(name);
  return name;
}

// ── Presentations ────────────────────────────────────────────────
function migratePresentations() {
  const dir = path.join(OLD, '_presentations');
  const dst = path.join(OUT, 'presentations');
  fs.mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const { fm, body } = parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const start = toISO(fm.start_date || fm.date);
    if (!start) continue;
    const end = toISO(fm.end_date);

    const typeRaw = (fm.type || '').toLowerCase();
    let type = 'talk';
    if (/poster/.test(typeRaw)) type = 'poster';
    else if (/exhibition|booth/.test(typeRaw)) type = 'exhibition';
    else if (/invited/.test(typeRaw) || /invited/i.test(fm.title || '')) type = 'invited';

    const pdf = (body.match(/https?:\/\/[^\s"')]+\.pdf/i) || [])[0];
    const slidesLink = (body.match(/https?:\/\/[^\s"')]*(?:docs\.google\.com\/presentation|drive\.google\.com)[^\s"')]*/i) ||
      [])[0];
    const video = (body.match(/https?:\/\/(?:www\.)?(?:youtu\.be|youtube\.com)\/[^\s"')]+/i) || [])[0];
    const talkTitle = (body.match(/Talk title[^:]*:\s*<i>(.*?)<\/i>/i) || [])[1];

    const lines = ['---', `title: ${yamlStr(stripTags(fm.title || 'Presentation'))}`];
    if (talkTitle) lines.push(`talkTitle: ${yamlStr(stripTags(talkTitle))}`);
    lines.push(`type: ${type}`, `venue: ${yamlStr(stripTags(fm.venue || ''))}`);
    if (fm.location) lines.push(`location: ${yamlStr(fm.location)}`);
    lines.push(`startDate: ${start}`);
    if (end) lines.push(`endDate: ${end}`);
    if (pdf) lines.push(`slides: ${yamlStr(pdf)}`);
    else if (slidesLink) lines.push(`slides: ${yamlStr(slidesLink)}`);
    if (video) lines.push(`video: ${yamlStr(video)}`);
    lines.push('---', '');

    const name = uniqueName(`${start.slice(0, 7)}-${slugify(stripTags(fm.title || 'talk'))}`);
    fs.writeFileSync(path.join(dst, `${name}.md`), lines.join('\n'));
    n++;
  }
  console.log(`presentations: ${n}`);
}

// ── News ─────────────────────────────────────────────────────────
function categorize(t) {
  const s = t.toLowerCase();
  if (/award|prize|best poster|fellowship|honou?r|highlight/.test(s)) return 'award';
  if (/publish|paper|accepted|preprint|biorxiv|proceeding|journal|published/.test(s))
    return 'publication';
  if (/release|released|\bv\d|version|available|launch/.test(s)) return 'release';
  if (/talk|present|poster|conference|ismb|recomb|seminar|invited/.test(s)) return 'talk';
  if (/join|joined/.test(s)) return 'join';
  return 'misc';
}

function migrateNews() {
  used.clear();
  const dir = path.join(OLD, '_news');
  const dst = path.join(OUT, 'news');
  fs.mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const { fm } = parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const date = toISO(fm.date) || toISO(file);
    if (!date) continue;
    const rich = htmlToMd(fm.title || '');
    const plain = stripTags(fm.title || '');
    const link = firstLink(fm.title || '');
    const category = categorize(plain);

    const lines = ['---', `title: ${yamlStr(plain.slice(0, 200))}`, `date: ${date}`, `category: ${category}`];
    if (fm.location) lines.push(`location: ${yamlStr(fm.location)}`);
    if (link && /^https?:/.test(link)) lines.push(`link: ${yamlStr(link)}`);
    lines.push('---', '', rich, '');

    const name = uniqueName(`${date}-${slugify(plain) || 'news'}`);
    fs.writeFileSync(path.join(dst, `${name}.md`), lines.join('\n'));
    n++;
  }
  console.log(`news: ${n}`);
}

migratePresentations();
migrateNews();
console.log('done');
