import { access, readdir, rm, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
// Built sections that get a parallel print PDF, one `<slug>.pdf` per page. Each
// must match a route that serves `/{section}/{slug}/` (posts blog + reports).
const SECTIONS = ['posts', 'reports'];

const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

const PRINT_CSS = `
  @page {
    size: Letter;
    margin: 0.65in;
  }

  html,
  body {
    background: #fff !important;
  }

  body {
    color: #111 !important;
    display: block !important;
  }

  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .site-header,
  .site-footer,
  .back,
  .entry-links,
  .post-tags,
  .skip-link,
  .reading-progress,
  .site-background,
  .page-scan,
  [data-astro-transition-persist],
  [aria-hidden="true"].scanner {
    display: none !important;
  }

  main,
  .entry {
    display: block !important;
    padding: 0 !important;
  }

  .container,
  .container--narrow {
    max-width: none !important;
    padding: 0 !important;
    width: auto !important;
  }

  .entry-logo {
    max-height: 0.55in !important;
    margin-bottom: 0.15in !important;
  }

  h1 {
    font-size: 28pt !important;
    line-height: 1.12 !important;
    letter-spacing: 0 !important;
  }

  h2 {
    break-after: avoid;
  }

  .entry-authors,
  .entry-meta {
    font-size: 10pt !important;
  }

  .entry-body {
    margin-top: 0.35in !important;
  }

  .post-abstract {
    margin-bottom: 0.35in !important;
    padding-bottom: 0.25in !important;
  }

  .prose,
  .post-references,
  .post-references ol {
    max-width: none !important;
    font-size: 10.5pt !important;
    line-height: 1.48 !important;
  }

  .prose > * + * {
    margin-top: 0.9em !important;
  }

  .prose h2 {
    font-size: 18pt !important;
    margin-top: 1.35em !important;
  }

  .prose h3,
  .post-abstract h2,
  .post-references h2 {
    font-size: 13pt !important;
    font-weight: 600 !important;
    letter-spacing: 0 !important;
  }

  figure,
  img,
  .zoom-figure,
  .post-references li {
    break-inside: avoid;
  }

  img {
    max-height: 4.8in !important;
    object-fit: contain !important;
  }

  a {
    color: #111 !important;
    text-decoration: underline !important;
  }

  [data-reveal] {
    opacity: 1 !important;
    transform: none !important;
  }
`;

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sectionSlugs(sectionDir) {
  const entries = await readdir(sectionDir, { withFileTypes: true });
  const slugs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const indexPath = join(sectionDir, entry.name, 'index.html');
    if (await pathExists(indexPath)) slugs.push(entry.name);
  }
  return slugs.sort();
}

async function collectJobs() {
  // One job per built page across every PDF section. A missing section dir
  // (e.g. no reports yet) is skipped rather than treated as an error.
  const jobs = [];
  for (const section of SECTIONS) {
    const sectionDir = join(DIST, section);
    if (!(await pathExists(sectionDir))) continue;
    for (const slug of await sectionSlugs(sectionDir)) {
      jobs.push({ section, slug });
    }
  }
  return jobs;
}

async function shouldSkipPdf(section) {
  if (section !== 'reports') return false;
  return true;
}

async function fulfillFromDist(route) {
  const request = route.request();
  if (!['GET', 'HEAD'].includes(request.method())) {
    await route.abort();
    return;
  }

  try {
    const url = new URL(request.url());
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    const filePath = resolve(DIST, `.${pathname}`);
    const rel = relative(DIST, filePath);
    if (rel.startsWith('..') || rel === '' || rel.split(sep).includes('..')) {
      await route.fulfill({ status: 403, body: 'Forbidden' });
      return;
    }

    const info = await stat(filePath);
    if (!info.isFile()) {
      await route.fulfill({ status: 404, body: 'Not found' });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: CONTENT_TYPES.get(extname(filePath)) ?? 'application/octet-stream',
      headers: { 'Content-Length': String(info.size) },
      path: filePath,
    });
  } catch {
    await route.fulfill({ status: 404, body: 'Not found' });
  }
}

/**
 * Runs inside the page (serialized by Playwright) to make every figure print-ready
 * before `page.pdf()`:
 *   1. Promote each ZoomFigure's visible image to the best print-sized source it
 *      carries. We cap this below lightbox resolution so the PDFs stay under
 *      Google Scholar's 5 MB per-file guidance while remaining readable on Letter.
 *   2. Defeat `loading="lazy"` so below-the-fold figures actually fetch (otherwise
 *      `networkidle` reports quiet while they sit unloaded and the PDF captures blanks).
 *   3. Scroll the document top→bottom to trip any IntersectionObserver-based loads.
 *   4. Wait for every image to finish (or error), each capped so one stuck asset
 *      can't hang the build.
 */
async function preparePageForPrint() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const maxPrintImageWidth = 1200;
  const widthOf = (candidate) => parseInt(candidate.trim().split(/\s+/)[1], 10) || 0;

  for (const figure of document.querySelectorAll('figure.zfig')) {
    const shown = figure.querySelector('.zfig-btn img');
    if (!shown) continue;
    const candidates = [];
    for (const img of figure.querySelectorAll('img')) {
      for (const candidate of (img.getAttribute('srcset') || '').split(',')) {
        const url = candidate.trim().split(/\s+/)[0];
        const width = widthOf(candidate);
        if (url && width) candidates.push({ url, width });
      }
    }
    const printSized = candidates
      .filter((candidate) => candidate.width <= maxPrintImageWidth)
      .sort((a, b) => b.width - a.width)[0];
    const smallestLarger = candidates
      .filter((candidate) => candidate.width > maxPrintImageWidth)
      .sort((a, b) => a.width - b.width)[0];
    const best = printSized ?? smallestLarger;
    if (best) {
      shown.removeAttribute('srcset');
      shown.removeAttribute('sizes');
      shown.setAttribute('src', best.url);
    }
  }

  for (const img of document.querySelectorAll('img')) {
    img.loading = 'eager';
    img.decoding = 'sync';
  }

  const step = Math.max(200, Math.floor(window.innerHeight * 0.9));
  for (let y = 0; y <= document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await sleep(60);
  }
  window.scrollTo(0, 0);

  const imagePromises = [];
  for (const img of Array.from(document.images)) {
    const timeout = new Promise((resolve) => setTimeout(resolve, 5000));
    if (img.complete && img.naturalWidth > 0) {
      imagePromises.push(Promise.race([img.decode().catch(() => {}), timeout]));
    } else {
      imagePromises.push(
        Promise.race([
          new Promise((resolve) => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          }),
          timeout,
        ])
      );
    }
  }
  await Promise.all(imagePromises);
}

async function main() {
  if (!(await pathExists(join(DIST, 'posts')))) {
    throw new Error('No built site found. Run `npm run build:site` before `npm run pdf:posts`.');
  }

  const jobs = await collectJobs();
  if (jobs.length === 0) {
    console.log('No pages found; skipping PDF generation.');
    return;
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    throw new Error(
      'Playwright Chromium is not installed or could not launch. Run `npx playwright install chromium`; sandboxed environments may also need browser-launch permissions.',
      { cause: error }
    );
  }

  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 1400 } });
    await context.route('**/*', fulfillFromDist);
    const page = await context.newPage();
    await page.emulateMedia({ media: 'print' });

    for (const { section, slug } of jobs) {
      const url = `https://khchao.com/${section}/${slug}/`;
      const pdfPath = join(DIST, section, slug, `${slug}.pdf`);
      if (await shouldSkipPdf(section)) {
        await rm(pdfPath, { force: true });
        console.log(`skipped ${relative(ROOT, pdfPath)} (reports draft-only)`);
        continue;
      }
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.addStyleTag({ content: PRINT_CSS });
      await page.evaluate(preparePageForPrint);
      await page.pdf({
        path: pdfPath,
        format: 'Letter',
        printBackground: true,
        preferCSSPageSize: true,
      });
      console.log(`wrote ${relative(ROOT, pdfPath)}`);
    }
  } finally {
    await browser?.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
