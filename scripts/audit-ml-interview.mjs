import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'src/content/deepDives');
const BANKS = join(ROOT, 'src/content/deepDiveQuestionBanks');
const DIST = join(ROOT, 'dist');
const curriculum = JSON.parse(readFileSync(join(ROOT, 'src/data/mlInterviewCurriculum.json')));

const expected = new Map(curriculum.lessons.map(({ id, questionCount }) => [id, questionCount]));

const hub = curriculum.hub;
const failures = [];
const fail = (scope, message) => failures.push(`${scope}: ${message}`);
const read = (path) => readFileSync(path, 'utf8');
const count = (text, expression) => [...text.matchAll(expression)].length;

function frontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error('missing frontmatter');
  return parse(match[1]);
}

function jsonLd(html, scope) {
  return [
    ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
  ].flatMap((match, index) => {
    try {
      return [JSON.parse(match[1])];
    } catch (error) {
      fail(scope, `JSON-LD block ${index + 1} is invalid: ${error.message}`);
      return [];
    }
  });
}

if (!existsSync(DIST)) {
  throw new Error('dist/ is missing; run npm run build first');
}

const banks = new Map();
const allIds = new Set();
for (const file of readdirSync(BANKS).filter((name) => name.endsWith('.yaml'))) {
  const bank = parse(read(join(BANKS, file)));
  if (!expected.has(bank.lesson)) continue;
  if (banks.has(bank.lesson)) fail(file, `duplicate bank for ${bank.lesson}`);
  banks.set(bank.lesson, bank.questions);
  for (const question of bank.questions) {
    if (allIds.has(question.id)) fail(file, `duplicate question id ${question.id}`);
    allIds.add(question.id);
    if (question.stability === 'fast-moving' && !question.verified) {
      fail(file, `${question.id} is fast-moving but has no verified date`);
    }
  }
}

for (const [slug, expectedCount] of expected) {
  const scope = `/deep_dives/${slug}/`;
  const sourcePath = join(CONTENT, `${slug}.mdx`);
  const outputPath = join(DIST, 'deep_dives', slug, 'index.html');
  if (!existsSync(sourcePath)) {
    fail(scope, 'source is missing');
    continue;
  }
  const source = read(sourcePath);
  const data = frontmatter(source);
  if (data.draft === true) fail(scope, 'lesson is still a draft');
  if (data.hub !== hub) fail(scope, `hub is ${data.hub ?? 'missing'}, expected ${hub}`);
  if (!existsSync(outputPath)) {
    fail(scope, 'built route is missing');
    continue;
  }

  const questions = banks.get(slug) ?? [];
  if (questions.length !== expectedCount) {
    fail(scope, `bank has ${questions.length} questions, expected ${expectedCount}`);
  }
  const used = [...source.matchAll(/<InterviewQuestion\s+id="([^"]+)"/g)].map((match) => match[1]);
  if (used.length !== expectedCount || new Set(used).size !== expectedCount) {
    fail(
      scope,
      `source uses ${used.length} question components (${new Set(used).size} unique), expected ${expectedCount}`
    );
  }

  const html = read(outputPath);
  const canonical = `https://khchao.com/deep_dives/${slug}/`;
  if (!html.includes(`<link rel="canonical" href="${canonical}"`))
    fail(scope, 'self-canonical is missing');
  if (/name="robots" content="[^"]*noindex/i.test(html)) fail(scope, 'published lesson is noindex');
  if (count(html, /<h1(?:\s|>)/g) !== 1) fail(scope, 'must render exactly one h1');
  if (count(html, /data-interview-question(?:\s|>)/g) !== expectedCount) {
    fail(
      scope,
      `renders ${count(html, /data-interview-question(?:\s|>)/g)} question cards, expected ${expectedCount}`
    );
  }
  if (count(html, /data-ml-answer(?:\s|>)[^>]*\bopen(?:\s|=|>)/g) !== expectedCount) {
    fail(scope, 'answers are not all server-rendered open by default');
  }
  if (!html.includes('data-ml-studybar')) fail(scope, 'lesson study controls are missing');
  if (html.includes('katex-error')) fail(scope, 'contains a KaTeX error');

  for (const question of questions) {
    if (!html.includes(`id="${question.id}"`))
      fail(scope, `missing rendered anchor ${question.id}`);
  }

  const types = jsonLd(html, scope).flatMap((node) =>
    Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
  );
  for (const required of ['TechArticle', 'LearningResource', 'FAQPage', 'BreadcrumbList']) {
    if (!types.includes(required)) fail(scope, `JSON-LD is missing ${required}`);
  }
}

if (banks.size !== expected.size)
  fail('question banks', `found ${banks.size}, expected ${expected.size}`);
if (allIds.size !== curriculum.totalQuestions)
  fail(
    'question banks',
    `found ${allIds.size} unique question ids, expected ${curriculum.totalQuestions}`
  );

const hubPath = join(DIST, 'deep_dives', hub, 'index.html');
if (!existsSync(hubPath)) fail('/deep_dives/ml-dl-interview/', 'built hub is missing');
else {
  const html = read(hubPath);
  if (!html.includes('data-ml-question-index')) fail('hub', 'question index is missing');
  if (count(html, /data-ml-question-row(?:\s|>)/g) !== curriculum.totalQuestions) {
    fail(
      'hub',
      `renders ${count(html, /data-ml-question-row(?:\s|>)/g)} indexed questions, expected ${curriculum.totalQuestions}`
    );
  }
  const types = jsonLd(html, 'hub').flatMap((node) =>
    Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
  );
  for (const required of ['Course', 'BreadcrumbList']) {
    if (!types.includes(required)) fail('hub', `JSON-LD is missing ${required}`);
  }
}

const search = JSON.parse(read(join(DIST, 'search.json')));
const searchLessons = search.items.filter(
  (item) =>
    item.type === 'Deep Dive' &&
    (item.href === `/deep_dives/${hub}/` || expected.has(item.href.split('/')[2]))
);
const searchQuestions = search.items.filter(
  (item) => item.type === 'Interview Question' && /^\/deep_dives\/ml-interview-/.test(item.href)
);
if (searchLessons.length !== expected.size + 1) {
  fail(
    'search.json',
    `contains ${searchLessons.length} ML course entries, expected ${expected.size + 1}`
  );
}
if (searchQuestions.length !== curriculum.totalQuestions) {
  fail(
    'search.json',
    `contains ${searchQuestions.length} ML interview questions, expected ${curriculum.totalQuestions}`
  );
}
for (const item of searchLessons) {
  if (/<(?:svg|path|text)\b|\bviewBox=/i.test(item.search ?? '')) {
    fail('search.json', `${item.href} leaks drawing markup into its search text`);
  }
}

const terminal = JSON.parse(read(join(DIST, 'terminal.json')));
const terminalLessons = terminal.deepDives.filter((entry) => entry.hub === hub);
const terminalQuestions = terminal.chunks.filter(
  (chunk) => chunk.kind === 'interview-question' && /^\/deep_dives\/ml-interview-/.test(chunk.href)
);
if (terminalLessons.length !== expected.size + 1) {
  fail(
    'terminal.json',
    `contains ${terminalLessons.length} ML course entries, expected ${expected.size + 1}`
  );
}
if (terminalQuestions.length !== curriculum.totalQuestions) {
  fail(
    'terminal.json',
    `contains ${terminalQuestions.length} interview chunks, expected ${curriculum.totalQuestions}`
  );
}
for (const entry of terminalLessons) {
  const path = `/home/khc/deep-dives/${entry.slug}.txt`;
  const body = terminal.fs[path]?.body ?? '';
  if (/<(?:svg|path|text)\b|\bviewBox=/i.test(body)) {
    fail('terminal.json', `${path} leaks drawing markup into terminal prose`);
  }
}

const sitemap = readdirSync(DIST)
  .filter((name) => /^sitemap.*\.xml$/.test(name))
  .map((name) => read(join(DIST, name)))
  .join('\n');
for (const slug of [hub, ...expected.keys()]) {
  const url = `https://khchao.com/deep_dives/${slug}/`;
  if (!sitemap.includes(`<loc>${url}</loc>`)) fail('sitemap', `missing ${url}`);
}

if (failures.length) {
  console.error(`ML interview audit failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `ML interview audit passed: 1 hub, ${expected.size} lessons, ${allIds.size} unique questions, ` +
      'search/terminal discovery, JSON-LD, canonical and sitemap contracts.'
  );
}
