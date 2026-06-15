import { access, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const POSTS = join(DIST, 'posts');

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

async function postSlugs() {
  const entries = await readdir(POSTS, { withFileTypes: true });
  const slugs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const indexPath = join(POSTS, entry.name, 'index.html');
    if (await pathExists(indexPath)) slugs.push(entry.name);
  }
  return slugs.sort();
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
 *   1. Promote each ZoomFigure's visible image to the highest-resolution source the
 *      figure carries — the lightbox copy goes up to 2400w, vs. the 920w button copy
 *      print would otherwise embed (~128 ppi → ~330 ppi on a Letter content box).
 *   2. Defeat `loading="lazy"` so below-the-fold figures actually fetch (otherwise
 *      `networkidle` reports quiet while they sit unloaded and the PDF captures blanks).
 *   3. Scroll the document top→bottom to trip any IntersectionObserver-based loads.
 *   4. Wait for every image to finish (or error), each capped so one stuck asset
 *      can't hang the build.
 */
async function preparePageForPrint() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const widthOf = (candidate) => parseInt(candidate.trim().split(/\s+/)[1], 10) || 0;

  for (const figure of document.querySelectorAll('figure.zfig')) {
    const shown = figure.querySelector('.zfig-btn img');
    if (!shown) continue;
    let best = null;
    let bestWidth = -1;
    for (const img of figure.querySelectorAll('img')) {
      for (const candidate of (img.getAttribute('srcset') || '').split(',')) {
        const url = candidate.trim().split(/\s+/)[0];
        const width = widthOf(candidate);
        if (url && width > bestWidth) {
          bestWidth = width;
          best = url;
        }
      }
    }
    if (best) {
      shown.removeAttribute('srcset');
      shown.removeAttribute('sizes');
      shown.setAttribute('src', best);
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

  await Promise.all(
    Array.from(document.images).map((img) => {
      if (img.complete && img.naturalWidth > 0) return img.decode().catch(() => {});
      return new Promise((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        setTimeout(done, 15000);
      });
    })
  );
}

async function main() {
  if (!(await pathExists(POSTS))) {
    throw new Error('No built posts found. Run `npm run build:site` before `npm run pdf:posts`.');
  }

  const slugs = await postSlugs();
  if (slugs.length === 0) {
    console.log('No post pages found; skipping PDF generation.');
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

    for (const slug of slugs) {
      const url = `https://khchao.com/posts/${slug}/`;
      const pdfPath = join(POSTS, slug, `${slug}.pdf`);
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
