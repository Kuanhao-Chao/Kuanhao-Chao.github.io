/**
 * The 320px profile, on its own, fast.
 *
 * `audit:deep-dives` covers six viewport/theme profiles across two engines and takes long
 * enough that it cannot run inside a ten-minute budget; `audit:deep-dives:ci` fits, but its
 * smoke matrix is desktop and phone only — it never opens a 320px viewport. That is the one
 * width where this curriculum actually breaks, because two adjacent inline citations form an
 * unbreakable ~280px run and a wide table stops scrolling and starts crushing.
 *
 * So this is the narrow profile alone, chromium only, both themes, every deep-dive route:
 * document overflow with the offending elements named, KaTeX errors, empty SVGs, and literal
 * `$…$` that failed to typeset. Pass a substring to restrict it, e.g. `npm run audit:narrow statgen`.
 *
 * It does not replace `audit:deep-dives` — nothing here drives a widget control.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';

const PORT = 4399;
const filter = process.argv[2] ?? '';
const server = spawn('npx', ['astro', 'preview', '--host', '127.0.0.1', '--port', String(PORT)], {
  stdio: 'ignore',
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await wait(6000);

const slugs = readdirSync('src/content/deepDives')
  .filter((f) => /\.mdx?$/.test(f))
  .map((f) => f.replace(/\.mdx?$/, ''))
  .filter((slug) => slug.includes(filter))
  .sort();

const browser = await chromium.launch();
const failures = [];

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 720 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await context.newPage();
  for (const slug of slugs) {
    const response = await page.goto(`http://127.0.0.1:${PORT}/deep_dives/${slug}/`, {
      waitUntil: 'networkidle',
      timeout: 45_000,
    });
    if (!response || response.status() !== 200) {
      failures.push(`${theme}/${slug}: HTTP ${response ? response.status() : 'no response'}`);
      continue;
    }
    const state = await page.evaluate(() => {
      const de = document.documentElement;
      // An element wider than the viewport is only a fault if nothing above it clips or
      // scrolls — `.dd-scroll-x` tables are supposed to overhang their container.
      const overhanging = [...document.querySelectorAll('body *')]
        .filter((node) => {
          const box = node.getBoundingClientRect();
          if (box.width === 0 || box.right <= window.innerWidth + 0.5) return false;
          for (let p = node.parentElement; p; p = p.parentElement) {
            const overflowX = getComputedStyle(p).overflowX;
            if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden') return false;
          }
          return true;
        })
        .slice(0, 4)
        .map((node) => {
          const cls = (node.className || '').toString().split(' ')[0];
          return `${node.tagName.toLowerCase()}${cls ? `.${cls}` : ''}@${Math.round(node.getBoundingClientRect().right)}px`;
        });
      const prose = document.querySelector('.deep-dive-article')?.textContent ?? '';
      return {
        overflow: de.scrollWidth - de.clientWidth,
        overhanging,
        katexErrors: document.querySelectorAll('.katex-error').length,
        emptySvgs: [...document.querySelectorAll('svg')].filter((s) => s.children.length === 0).length,
        literalMath: (prose.match(/\$[A-Za-z\\][^$]{0,60}\$/g) ?? []).length,
      };
    });
    if (state.overflow > 0) {
      failures.push(
        `${theme}/${slug}: document overflows by ${state.overflow}px — ${state.overhanging.join(', ') || 'no unclipped element found'}`
      );
    }
    if (state.katexErrors) failures.push(`${theme}/${slug}: ${state.katexErrors} .katex-error`);
    if (state.emptySvgs) failures.push(`${theme}/${slug}: ${state.emptySvgs} empty <svg>`);
    if (state.literalMath) failures.push(`${theme}/${slug}: ${state.literalMath} literal $…$ in prose`);
  }
  await context.close();
}

await browser.close();
server.kill();

if (failures.length) {
  console.error(`Narrow-viewport audit FAILED:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `Narrow-viewport audit passed: ${slugs.length} routes × 2 themes at 320px — no document overflow, no KaTeX errors, no empty SVG, no un-typeset math.`
);
