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
  for (const section of ['reports', 'papers', 'algorithms', 'deep_dives', 'photos']) {
    if (!new RegExp(`^Disallow:\\s*\\/${section}\\/\\s*$`, 'im').test(robots)) {
      errors.push(`robots.txt does not disallow /${section}/ while it is non-indexable.`);
    }
  }
}

async function auditAlgorithmsIndex(urls) {
  const algoSlugs = [
    '',
    'debruijn',
    'duel',
    'fm-index',
    'ghmm',
    'gwas',
    'ism',
    'minimap2',
    'pairwise',
    'phmm',
    'string-graph',
    'wfa',
  ];
  for (const slug of algoSlugs) {
    const url = slug ? `${SITE}/algorithms/${slug}/` : `${SITE}/algorithms/`;
    const htmlPath = slug
      ? join(DIST, 'algorithms', slug, 'index.html')
      : join(DIST, 'algorithms', 'index.html');

    if (urls.has(url)) {
      errors.push(`${url} appears in sitemap while /algorithms/ is non-indexable.`);
    }
    if (await pathExists(htmlPath)) {
      const html = await readFile(htmlPath, 'utf8');
      if (!metaContents(html, 'robots').some((v) => v.includes('noindex'))) {
        errors.push(`${url} is missing noindex meta while /algorithms/ is non-indexable.`);
      }
    }
  }
}

async function auditDeepDivesIndex(urls) {
  const ddDir = join(DIST, 'deep_dives');
  if (!(await pathExists(ddDir))) return;
  const htmlFiles = (await walkFiles(ddDir)).filter((f) => basename(f) === 'index.html');

  for (const file of htmlFiles) {
    const rel = file.replace(DIST, '').replace(/\/index\.html$/, '/');
    const url = `${SITE}${rel}`;
    if (urls.has(url)) {
      errors.push(`${url} appears in sitemap while /deep_dives/ is non-indexable.`);
    }
    const html = await readFile(file, 'utf8');
    if (!metaContents(html, 'robots').some((v) => v.includes('noindex'))) {
      errors.push(`${url} is missing noindex meta while /deep_dives/ is non-indexable.`);
    }
  }
}

async function auditPhotosIndex(urls) {
  const photoUrl = `${SITE}/photos/`;
  const htmlPath = join(DIST, 'photos', 'index.html');
  if (urls.has(photoUrl)) {
    errors.push('/photos/ appears in sitemap while photo gallery is non-indexable.');
  }
  if (await pathExists(htmlPath)) {
    const html = await readFile(htmlPath, 'utf8');
    if (!metaContents(html, 'robots').some((v) => v.includes('noindex'))) {
      errors.push('/photos/ is missing noindex meta while photo gallery is non-indexable.');
    }
  }
}

async function auditStaticPhotoAsset() {
  const photoPath = join(DIST, 'photos', 'ismb_2024_present_kuan-hao_chao.jpg');
  if (!(await pathExists(photoPath))) {
    errors.push('dist/photos/ismb_2024_present_kuan-hao_chao.jpg is missing.');
    return;
  }
  const photoStat = await stat(photoPath);
  if (photoStat.size < 100_000) {
    errors.push(`dist/photos/ismb_2024_present_kuan-hao_chao.jpg is unexpectedly small (${photoStat.size} bytes).`);
  }
}

async function auditPublicRichSnippets(urls) {
  const homePath = join(DIST, 'index.html');
  if (await pathExists(homePath)) {
    const html = await readFile(homePath, 'utf8');
    if (!html.includes('"@type":"ProfilePage"') || !html.includes('"@type":"Person"')) {
      errors.push('Homepage is missing ProfilePage/Person JSON-LD graph.');
    }
  }

  const chromatinPath = join(DIST, 'chromatin', 'index.html');
  if (await pathExists(chromatinPath)) {
    const html = await readFile(chromatinPath, 'utf8');
    if (!html.includes('"@type":"WebApplication"')) {
      errors.push('Chromatin page is missing WebApplication JSON-LD schema.');
    }
  }

  const vpPath = join(DIST, 'shorkie-lab', 'shorkie', 'index.html');
  if (await pathExists(vpPath)) {
    const html = await readFile(vpPath, 'utf8');
    if (!html.includes('"@type":"WebApplication"')) {
      errors.push('Variant playground is missing WebApplication JSON-LD schema.');
    }
  }
}

async function auditPapersIndex(urls) {
  const paperPaths = [
    { slug: '', path: join(DIST, 'papers', 'index.html'), url: `${SITE}/papers/` },
    { slug: 'alphagenome', path: join(DIST, 'papers', 'alphagenome', 'index.html'), url: `${SITE}/papers/alphagenome/` },
    { slug: 'alphamissense', path: join(DIST, 'papers', 'alphamissense', 'index.html'), url: `${SITE}/papers/alphamissense/` },
    { slug: 'borzoi', path: join(DIST, 'papers', 'borzoi', 'index.html'), url: `${SITE}/papers/borzoi/` },
    { slug: 'borzoi-finemapped', path: join(DIST, 'papers', 'borzoi-finemapped', 'index.html'), url: `${SITE}/papers/borzoi-finemapped/` },
    { slug: 'borzoi-peft', path: join(DIST, 'papers', 'borzoi-peft', 'index.html'), url: `${SITE}/papers/borzoi-peft/` },
    { slug: 'borzoi-prime', path: join(DIST, 'papers', 'borzoi-prime', 'index.html'), url: `${SITE}/papers/borzoi-prime/` },
    { slug: 'decima', path: join(DIST, 'papers', 'decima', 'index.html'), url: `${SITE}/papers/decima/` },
    { slug: 'deepvariant', path: join(DIST, 'papers', 'deepvariant', 'index.html'), url: `${SITE}/papers/deepvariant/` },
    { slug: 'encode', path: join(DIST, 'papers', 'encode', 'index.html'), url: `${SITE}/papers/encode/` },
    { slug: 'gears', path: join(DIST, 'papers', 'gears', 'index.html'), url: `${SITE}/papers/gears/` },
    { slug: 'gpnstar', path: join(DIST, 'papers', 'gpnstar', 'index.html'), url: `${SITE}/papers/gpnstar/` },
    { slug: 'gtex', path: join(DIST, 'papers', 'gtex', 'index.html'), url: `${SITE}/papers/gtex/` },
    { slug: 'nucleotide-transformer', path: join(DIST, 'papers', 'nucleotide-transformer', 'index.html'), url: `${SITE}/papers/nucleotide-transformer/` },
    { slug: 'nucleotide-transformer-v3', path: join(DIST, 'papers', 'nucleotide-transformer-v3', 'index.html'), url: `${SITE}/papers/nucleotide-transformer-v3/` },
    { slug: 'scooby', path: join(DIST, 'papers', 'scooby', 'index.html'), url: `${SITE}/papers/scooby/` },
    { slug: 'traitgym', path: join(DIST, 'papers', 'traitgym', 'index.html'), url: `${SITE}/papers/traitgym/` },
    { slug: 'zoonomia', path: join(DIST, 'papers', 'zoonomia', 'index.html'), url: `${SITE}/papers/zoonomia/` },
    { slug: 'zoonomia-constraint', path: join(DIST, 'papers', 'zoonomia-constraint', 'index.html'), url: `${SITE}/papers/zoonomia-constraint/` },
  ];

  for (const item of paperPaths) {
    if (urls.has(item.url)) {
      errors.push(`${item.url} appears in sitemap while /papers/ is non-indexable.`);
    }
    if (await pathExists(item.path)) {
      const html = await readFile(item.path, 'utf8');
      if (!metaContents(html, 'robots').includes('noindex, nofollow')) {
        errors.push(`${item.url} is missing noindex meta while /papers/ is non-indexable.`);
      }
    }
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

  for (const report of reports.filter((entry) => entry.data.listed !== false)) {
    if (report.data.title && !html.includes(report.data.title)) {
      errors.push(`Report is missing from /reports/ listing: ${report.slug}`);
    }
  }
  for (const report of reports.filter((entry) => entry.data.listed === false)) {
    if (html.includes(`/reports/${report.slug}/`) || (report.data.title && html.includes(report.data.title))) {
      errors.push(`Hidden report appears in /reports/ listing: ${report.slug}`);
    }
  }
}

/**
 * The /terminal/ shell serves its whole knowledge base as one public JSON file, so
 * it is a second front door to the content — and it re-derives the draft/unlisted
 * gates itself rather than inheriting them. The two collections use *different*
 * fields (`posts.draft` vs `reports.unlisted`), so a single filter silently misses
 * one; this asserts the outcome instead of trusting the filter.
 */
async function auditTerminalIndex(posts, reports) {
  const indexPath = join(DIST, 'terminal.json');
  if (!(await pathExists(indexPath))) {
    errors.push('dist/terminal.json is missing; the /terminal/ shell has no knowledge index.');
    return;
  }
  const raw = await readFile(indexPath, 'utf8');

  for (const post of posts.filter((p) => p.data.draft === true)) {
    if (raw.includes(`/posts/${post.slug}`) || raw.includes(`posts/${post.slug}.txt`)) {
      errors.push(`Draft post leaked into terminal.json: ${post.slug}`);
    }
  }
  for (const report of reports.filter((r) => r.data.unlisted !== false)) {
    if (raw.includes(report.slug)) {
      errors.push(`Unlisted report leaked into terminal.json: ${report.slug}`);
    }
  }
  if (raw.includes('/reports/')) {
    errors.push('terminal.json references the non-indexable /reports/ subtree.');
  }
}

async function auditResearchResources() {
  const slug = 'splice-sites';
  const htmlPath = join(DIST, 'research', slug, 'index.html');
  if (!(await pathExists(htmlPath))) {
    errors.push(`RNA-splicing research page is missing built HTML: ${slug}`);
    return;
  }
  const html = await readFile(htmlPath, 'utf8');
  const paperLinks = [
    { label: 'Splam paper', href: 'https://doi.org/10.1186/s13059-024-03379-4' },
    { label: 'OpenSpliceAI paper', href: 'https://doi.org/10.7554/eLife.107454.3' },
  ];
  const resourceBar =
    [...html.matchAll(/<div class="entry-links"[^>]*>[\s\S]*?<\/div>/g)]
      .map((match) => match[0])
      .find((bar) => paperLinks.every(({ label, href }) => bar.includes(label) && bar.includes(href))) ?? '';
  for (const { label, href } of paperLinks) {
    if (!resourceBar.includes(label) || !resourceBar.includes(href)) {
      errors.push(`RNA-splicing resource bar is missing ${label}.`);
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
  await auditPapersIndex(urls);
  await auditAlgorithmsIndex(urls);
  await auditDeepDivesIndex(urls);
  await auditPhotosIndex(urls);
  await auditStaticPhotoAsset();
  await auditPublicRichSnippets(urls);
  await auditNoDraftReportPdfs();
  await auditTerminalIndex(posts, reports);
  await auditResearchResources();
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
