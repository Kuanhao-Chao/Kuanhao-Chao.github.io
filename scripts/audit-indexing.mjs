import { access, readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const SITE = 'https://khchao.com';
const SCHOLAR_MAX_PDF_BYTES = 5_000_000;

const errors = [];
const warnings = [];

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    const [, key, rawValue] = field;
    const value = stripQuotes(rawValue);
    if (value === 'true') data[key] = true;
    else if (value === 'false') data[key] = false;
    else data[key] = value;
  }
  return data;
}

async function readCollection(collection) {
  const dir = join(ROOT, 'src', 'content', collection);
  const files = (await readdir(dir)).filter((file) => ['.md', '.mdx'].includes(extname(file)));
  return Promise.all(
    files.map(async (file) => {
      const path = join(dir, file);
      const source = await readFile(path, 'utf8');
      return {
        slug: basename(file, extname(file)),
        path,
        source,
        data: parseFrontmatter(source),
      };
    })
  );
}

async function walkFiles(dir) {
  if (!(await pathExists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function sitemapUrls() {
  if (!(await pathExists(DIST))) {
    errors.push('dist/ does not exist. Run npm run build before npm run audit:indexing.');
    return new Set();
  }

  const files = (await readdir(DIST)).filter((file) => /^sitemap.*\.xml$/.test(file));
  const urls = new Set();
  for (const file of files) {
    const xml = await readFile(join(DIST, file), 'utf8');
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      urls.add(match[1]);
    }
  }
  return urls;
}

function metaContents(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tags = html.match(new RegExp(`<meta\\s+[^>]*name=["']${escaped}["'][^>]*>`, 'gi')) ?? [];
  return tags
    .map((tag) => tag.match(/\scontent=["']([^"']*)["']/i)?.[1])
    .filter(Boolean);
}

function hasCanonical(html, url) {
  return new RegExp(`<link\\s+[^>]*rel=["']canonical["'][^>]*href=["']${url}["']`, 'i').test(html);
}

function htmlPathForUrl(url) {
  const { pathname } = new URL(url);
  if (pathname === '/') return join(DIST, 'index.html');
  if (!pathname.endsWith('/')) return null;
  return join(DIST, pathname.slice(1), 'index.html');
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function textFingerprint(text) {
  return normalizeText(text).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function pdfText(pdfPath) {
  const result = spawnSync('pdftotext', [pdfPath, '-'], {
    encoding: 'utf8',
    timeout: 20_000,
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error?.code === 'ENOENT') return null;
  if (result.error) return { error: result.error.message };
  if (result.status !== 0) return { error: result.stderr || result.stdout || 'pdftotext failed' };
  return { text: result.stdout };
}

async function auditPost(entry, urls) {
  const expectedUrl = `${SITE}/posts/${entry.slug}/`;
  const htmlPath = join(DIST, 'posts', entry.slug, 'index.html');
  const pdfPath = join(DIST, 'posts', entry.slug, `${entry.slug}.pdf`);

  if (!(await pathExists(htmlPath))) {
    errors.push(`Live post is missing built HTML: ${entry.slug}`);
    return;
  }

  const html = await readFile(htmlPath, 'utf8');
  const title = entry.data.title;

  if (!urls.has(expectedUrl)) errors.push(`Live post is missing from sitemap: ${expectedUrl}`);
  if (!hasCanonical(html, expectedUrl)) errors.push(`Post has missing/incorrect canonical URL: ${entry.slug}`);
  if (!metaContents(html, 'robots').includes('index, follow')) {
    errors.push(`Post is not indexable by robots meta tag: ${entry.slug}`);
  }
  if (!html.includes('<h1')) errors.push(`Post is missing a visible h1 title: ${entry.slug}`);
  if (title && !html.includes(title)) errors.push(`Post HTML does not include its title text: ${entry.slug}`);

  const citationTitle = metaContents(html, 'citation_title');
  const citationAuthors = metaContents(html, 'citation_author');
  const citationDate = metaContents(html, 'citation_publication_date');
  const citationPdf = metaContents(html, 'citation_pdf_url');
  const citationRefs = metaContents(html, 'citation_reference');
  const expectedPdfUrl = `${SITE}/posts/${entry.slug}/${entry.slug}.pdf`;

  if (!citationTitle.length) errors.push(`Post is missing citation_title: ${entry.slug}`);
  if (!citationAuthors.length) errors.push(`Post is missing citation_author: ${entry.slug}`);
  if (!citationDate.length) errors.push(`Post is missing citation_publication_date: ${entry.slug}`);
  if (!citationPdf.includes(expectedPdfUrl)) {
    errors.push(`Post has missing/incorrect citation_pdf_url: ${entry.slug}`);
  }
  if (!citationRefs.length) errors.push(`Post is missing citation_reference metadata: ${entry.slug}`);

  if (!html.includes('"@type":"ScholarlyArticle"')) {
    errors.push(`Post is missing ScholarlyArticle JSON-LD: ${entry.slug}`);
  }
  if (!html.includes('post-abstract') || !html.includes('>Abstract<')) {
    errors.push(`Post is missing visible abstract section: ${entry.slug}`);
  }

  const refsSection = html.match(/<section class="post-references"[\s\S]*?<\/section>/)?.[0] ?? '';
  if (!refsSection) {
    errors.push(`Post is missing visible References section: ${entry.slug}`);
  } else if (!/(doi:10\.|https?:\/\/)/i.test(refsSection)) {
    errors.push(`References do not expose DOI/URL text visibly: ${entry.slug}`);
  }

  if (!(await pathExists(pdfPath))) {
    errors.push(`Post PDF is missing: ${entry.slug}`);
    return;
  }

  const pdfInfo = await stat(pdfPath);
  if (pdfInfo.size > SCHOLAR_MAX_PDF_BYTES) {
    errors.push(
      `Post PDF exceeds ${SCHOLAR_MAX_PDF_BYTES} bytes: ${entry.slug} (${pdfInfo.size} bytes)`
    );
  }

  const extracted = pdfText(pdfPath);
  if (!extracted) {
    warnings.push('pdftotext is not available; skipped PDF text checks.');
    return;
  }
  if (extracted.error) {
    errors.push(`Could not extract PDF text for ${entry.slug}: ${extracted.error}`);
    return;
  }

  const text = normalizeText(extracted.text);
  if (title && !textFingerprint(text).includes(textFingerprint(title))) {
    errors.push(`Post PDF text does not include title: ${entry.slug}`);
  }
  if (!text.includes('Kuan-Hao Chao')) errors.push(`Post PDF text does not include author: ${entry.slug}`);
  if (!text.includes('Abstract')) errors.push(`Post PDF text does not include Abstract: ${entry.slug}`);
  if (!text.includes('References')) errors.push(`Post PDF text does not include References: ${entry.slug}`);
}

async function auditDraftPost(entry, urls) {
  const url = `${SITE}/posts/${entry.slug}/`;
  const htmlPath = join(DIST, 'posts', entry.slug, 'index.html');
  if (urls.has(url)) errors.push(`Draft post appears in sitemap: ${url}`);
  if (await pathExists(htmlPath)) errors.push(`Draft post has built HTML: ${entry.slug}`);
}

async function auditRobots() {
  const robotsPath = join(DIST, 'robots.txt');
  if (!(await pathExists(robotsPath))) {
    errors.push('dist/robots.txt is missing.');
    return;
  }
  const robots = await readFile(robotsPath, 'utf8');
  if (!/^Disallow:\s*\/reports\/\s*$/im.test(robots)) {
    errors.push('robots.txt does not disallow /reports/ while reports are non-indexable.');
  }
}

async function auditReportsIndex(reports, urls) {
  const url = `${SITE}/reports/`;
  const htmlPath = join(DIST, 'reports', 'index.html');

  if (urls.has(url)) errors.push('/reports/ appears in sitemap while reports are non-indexable.');
  if (!(await pathExists(htmlPath))) return;

  const html = await readFile(htmlPath, 'utf8');
  if (!metaContents(html, 'robots').includes('noindex, nofollow')) {
    errors.push('/reports/ is missing noindex while reports are non-indexable.');
  }

  for (const report of reports) {
    if (report.data.title && !html.includes(report.data.title)) {
      errors.push(`Report is missing from /reports/ listing: ${report.slug}`);
    }
  }
}

async function auditPublicPageBasics(urls) {
  for (const url of urls) {
    if (!url.startsWith(SITE)) continue;
    if (url.endsWith('.xml')) continue;
    const htmlPath = htmlPathForUrl(url);
    if (!htmlPath) continue;
    if (!(await pathExists(htmlPath))) {
      errors.push(`Sitemap URL is missing built HTML: ${url}`);
      continue;
    }

    const html = await readFile(htmlPath, 'utf8');
    if (!hasCanonical(html, url)) errors.push(`Sitemap page has missing/incorrect canonical URL: ${url}`);
    if (!/<title>[^<]+<\/title>/i.test(html)) errors.push(`Sitemap page is missing title: ${url}`);
    if (!metaContents(html, 'description').length) {
      errors.push(`Sitemap page is missing meta description: ${url}`);
    }
    if (!metaContents(html, 'robots').includes('index, follow')) {
      errors.push(`Sitemap page is not indexable by robots meta tag: ${url}`);
    }
    if (!html.includes('<h1')) errors.push(`Sitemap page is missing visible h1: ${url}`);
  }
}

async function auditUtilityPages(urls) {
  const searchUrl = `${SITE}/search/`;
  const searchHtmlPath = join(DIST, 'search', 'index.html');
  const searchJsonPath = join(DIST, 'search.json');

  if (urls.has(searchUrl)) errors.push('/search/ appears in sitemap despite being a utility page.');

  if (await pathExists(searchHtmlPath)) {
    const html = await readFile(searchHtmlPath, 'utf8');
    if (!metaContents(html, 'robots').includes('noindex, nofollow')) {
      errors.push('/search/ is missing noindex.');
    }
  } else {
    errors.push('/search/ is missing built HTML.');
  }

  if (!(await pathExists(searchJsonPath))) {
    errors.push('/search.json index is missing from dist.');
  }
}

async function auditNoDraftReportPdfs() {
  const reportPdfs = (await walkFiles(join(DIST, 'reports'))).filter(
    (file) => extname(file).toLowerCase() === '.pdf'
  );
  for (const pdf of reportPdfs) {
    errors.push(`Report PDF exists while reports are non-indexable: ${pdf.replace(`${DIST}/`, '')}`);
  }
}

async function auditReport(entry, urls) {
  const url = `${SITE}/reports/${entry.slug}/`;
  const htmlPath = join(DIST, 'reports', entry.slug, 'index.html');
  const pdfPath = join(DIST, 'reports', entry.slug, `${entry.slug}.pdf`);
  if (!(await pathExists(htmlPath))) return;

  const html = await readFile(htmlPath, 'utf8');
  const unlisted = entry.data.unlisted !== false;
  if (unlisted) {
    if (urls.has(url)) errors.push(`Unlisted report appears in sitemap: ${url}`);
    if (!metaContents(html, 'robots').includes('noindex, nofollow')) {
      errors.push(`Unlisted report is missing noindex: ${entry.slug}`);
    }
    for (const name of [
      'citation_title',
      'citation_author',
      'citation_publication_date',
      'citation_pdf_url',
      'citation_reference',
      'citation_technical_report_institution',
    ]) {
      if (metaContents(html, name).length) {
        errors.push(`Unlisted report emits ${name}: ${entry.slug}`);
      }
    }
    if (html.includes('"@type":"ScholarlyArticle"')) {
      errors.push(`Unlisted report emits ScholarlyArticle JSON-LD: ${entry.slug}`);
    }
    if (html.includes(`${entry.slug}.pdf`)) {
      errors.push(`Unlisted report links a generated PDF: ${entry.slug}`);
    }
    if (await pathExists(pdfPath)) {
      errors.push(`Unlisted report PDF exists in dist: ${entry.slug}`);
    }
    return;
  }

  if (!urls.has(url)) errors.push(`Public report is missing from sitemap: ${url}`);
  if (!metaContents(html, 'robots').includes('index, follow')) {
    errors.push(`Public report is not indexable: ${entry.slug}`);
  }

  if (await pathExists(pdfPath)) {
    const pdfInfo = await stat(pdfPath);
    if (pdfInfo.size > SCHOLAR_MAX_PDF_BYTES) {
      errors.push(
        `Public report PDF exceeds ${SCHOLAR_MAX_PDF_BYTES} bytes: ${entry.slug} (${pdfInfo.size} bytes)`
      );
    }
  }
}

async function main() {
  const urls = await sitemapUrls();
  const posts = await readCollection('posts');
  const reports = await readCollection('reports');

  await auditRobots();
  await auditReportsIndex(reports, urls);
  await auditNoDraftReportPdfs();
  await auditPublicPageBasics(urls);
  await auditUtilityPages(urls);

  for (const post of posts) {
    if (post.data.draft === true) await auditDraftPost(post, urls);
    else await auditPost(post, urls);
  }

  for (const report of reports) {
    await auditReport(report, urls);
  }

  if (warnings.length) {
    console.warn('Indexing audit warnings:');
    for (const warning of [...new Set(warnings)]) console.warn(`- ${warning}`);
  }

  if (errors.length) {
    console.error('Indexing audit failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  const livePosts = posts.filter((post) => post.data.draft !== true).length;
  console.log(`Indexing audit passed for ${livePosts} live posts and ${reports.length} reports.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
