import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const evidence = process.env.SNV_REVIEW_EVIDENCE ?? resolve(dirname(fileURLToPath(import.meta.url)), "publication");
const dist = process.env.SNV_REVIEW_DIST ?? resolve(evidence, '../website-release/dist');
const releaseId = process.env.SNV_RELEASE_ID ?? '20260910';
const screenshots = resolve(evidence, 'screenshots');
await mkdir(screenshots, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.json': 'application/json', '.pdf': 'application/pdf' };
const server = createServer(async (req, res) => {
  try {
    let path = resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!path.startsWith(dist + '/')) throw new Error('invalid path');
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    res.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream');
    createReadStream(path).pipe(res);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = process.env.SNV_REVIEW_ORIGIN ?? `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const findings = [];
try {
  for (const slug of ['full-snv-scoring-technical-report', 'full-snv-scoring-supplement', 'openspliceai-technical-report']) {
    for (const profile of [
      { name: 'desktop-light', width: 1440, height: 1000, colorScheme: 'light' },
      { name: 'phone-light', width: 390, height: 844, colorScheme: 'light' },
      { name: 'phone-dark', width: 390, height: 844, colorScheme: 'dark' },
    ]) {
      const page = await browser.newPage({ viewport: { width: profile.width, height: profile.height },
        colorScheme: profile.colorScheme });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const response = await page.goto(`${origin}/reports/${slug}/`, { waitUntil: 'networkidle' });
      if (response.status() !== 200) throw new Error(`HTTP ${response.status()}: ${slug}`);
      await page.evaluate(() => document.documentElement.dataset.theme =
        matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const body = await page.locator('body').innerText();
      // The figures-only supplement carries the paired-annotation count in its figures rather than
      // its text; the other two state it in their abstracts.
      const statesProductionCount = slug !== 'full-snv-scoring-supplement';
      if ((statesProductionCount && !body.includes('3,334,708,099')) || /PILOT PREVIEW|INTERPRET|\{\{/.test(body)) {
        throw new Error(`Missing production results or unresolved text: ${slug}`);
      }
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      if (canonical !== `https://khchao.com/reports/${slug}/`) throw new Error(`Canonical: ${canonical}`);
      if (await page.locator('meta[name^="citation_"]').count()) throw new Error('Unexpected Scholar metadata');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (overflow > 1) throw new Error(`${slug}/${profile.name}: page overflow ${overflow}px`);
      await page.screenshot({ path: resolve(screenshots, `${slug}-${profile.name}-top.png`) });
      const figures = page.locator('figure.zfig');
      const expected = { 'full-snv-scoring-technical-report': 6, 'full-snv-scoring-supplement': 11 }[slug];
      if (expected && await figures.count() !== expected) throw new Error(`Expected ${expected} figures`);
      for (const figure of await figures.all()) {
        await figure.scrollIntoViewIfNeeded();
        await figure.locator('button[data-zoom] > img').evaluate(async image => {
          await image.decode();
          if (!image.naturalWidth) throw new Error('Broken figure');
        });
        if (!(await figure.locator('figcaption').innerText()).trim()) throw new Error('Empty caption');
      }
      if (await figures.count()) {
        const chosen = figures.nth(Math.min(1, await figures.count() - 1));
        await chosen.scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(screenshots, `${slug}-${profile.name}-figure.png`) });
        await chosen.locator('[data-zoom]').click();
        await chosen.locator('dialog[open]').waitFor();
        await chosen.locator('dialog[open] img').evaluate(async image => {
          await image.decode();
          const box = image.getBoundingClientRect();
          if (!image.naturalWidth || box.width < 100 || box.height < 20) {
            throw new Error('Enlarged figure did not render');
          }
        });
        await page.screenshot({ path: resolve(screenshots, `${slug}-${profile.name}-zoom.png`) });
        await page.keyboard.press('Escape');
        if (await chosen.locator('dialog[open]').count()) throw new Error('Figure close failed');
      }
      if (errors.length) throw new Error(errors.join('\n'));
      let printTables;
      if (profile.name === 'desktop-light') {
        await page.emulateMedia({ media: 'print' });
        await page.setViewportSize({ width: 691, height: 900 });
        printTables = await page.locator('.prose table').evaluateAll(tables => tables.map(
          (table, index) => ({ index, width: table.clientWidth, content: table.scrollWidth })));
        if (printTables.some(table => table.content > table.width + 1)) {
          throw new Error(`Print table clipping: ${slug}`);
        }
      }
      findings.push({ slug, profile: profile.name, status: 'passed', figures: await figures.count(),
        overflow, printTables });
      await page.close();
    }
  }
  for (const [suffix, count] of [['', 6], ['-supplement', 11]]) {
    const standalone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await standalone.goto(`${origin}/downloads/full-snv-concordance-${releaseId}${suffix}.html`);
    if (!(await standalone.locator('meta[name="viewport"]').count())) throw new Error('Missing standalone viewport');
    const overflow = await standalone.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (overflow > 1) throw new Error(`Standalone overflow: ${overflow}px`);
    if (await standalone.locator('figure').count() !== count) throw new Error('Standalone figure count');
    for (const image of await standalone.locator('figure img').all()) await image.evaluate(image => image.decode());
    await standalone.screenshot({ path: resolve(screenshots, `standalone${suffix}-phone.png`) });
    findings.push({ standalone: suffix || 'main', status: 'passed', overflow });
    await standalone.close();
  }
  await writeFile(resolve(evidence, 'report-browser-review.json'), JSON.stringify(findings, null, 2));
  console.log(JSON.stringify(findings, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
