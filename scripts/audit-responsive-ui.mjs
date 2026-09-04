import { chromium } from 'playwright';
import { preview } from 'astro';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// Representative set of key pages across all sections
const TEST_ROUTES = [
  '/',
  '/cv',
  '/research',
  '/publications',
  '/software',
  '/news',
  '/posts',
  '/posts/openspliceai',
  '/posts/lifton',
  '/reports',
  '/deep_dives',
  '/algorithms',
  '/algorithms/minimap2',
  '/algorithms/wfa',
  '/algorithms/debruijn',
  '/algorithms/phmm',
  '/papers/alphagenome',
  '/papers/alphamissense',
  '/papers/borzoi',
  '/games/bay-route',
  '/games/chinese-chess',
  '/games/crispr-commander',
  '/games/dino-run',
  '/games/genome-jumper',
  '/games/jetpack-joyride',
  '/games/phage-defense',
  '/games/proofreader',
  '/games/snake',
  '/games/tetris',
  '/chromatin',
  '/shorkie-lab',
  '/shorkie-lab/attention',
  '/search',
  '/404'
];

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 667 },
  { name: 'mobile-small', width: 320, height: 568 }
];

async function main() {
  const previewServer = await preview({
    root: ROOT,
    server: { port: 4339 }
  });

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const issues = [];

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    console.log(`\n--- Auditing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);

    for (const route of TEST_ROUTES) {
      const url = `http://localhost:4339${route}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        // Wait a tiny bit for fonts and layout
        await page.waitForTimeout(200);

        // Check horizontal overflow
        const overflow = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
          const clientWidth = docEl.clientWidth;
          const hasOverflow = scrollWidth > clientWidth + 1; // 1px tolerance

          // Find specific overflowing elements if any
          const overflowingElements = [];
          if (hasOverflow) {
            const all = document.querySelectorAll('*');
            for (const el of all) {
              const r = el.getBoundingClientRect();
              if (r.right > clientWidth + 2) {
                overflowingElements.push({
                  tag: el.tagName.toLowerCase(),
                  className: el.className,
                  id: el.id,
                  right: Math.round(r.right),
                  width: Math.round(r.width),
                  textSnippet: el.textContent?.slice(0, 30)?.trim()
                });
                if (overflowingElements.length >= 5) break;
              }
            }
          }

          // Check if any headings or text wrap awkwardly or have overflowing code/pre/table
          const badElements = [];
          const codeBlocks = document.querySelectorAll('pre, code, table, .katex-display');
          for (const block of codeBlocks) {
            const r = block.getBoundingClientRect();
            if (r.right > clientWidth + 1) {
              let parent = block.parentElement;
              let isContained = false;
              while (parent && parent !== document.body) {
                const style = window.getComputedStyle(parent);
                if (style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflowX === 'hidden') {
                  isContained = true;
                  break;
                }
                parent = parent.parentElement;
              }
              if (isContained) continue;

              badElements.push({
                type: 'unwrapped-block',
                tag: block.tagName.toLowerCase(),
                className: block.className,
                right: Math.round(r.right),
                maxWidth: clientWidth
              });
            }
          }

          return {
            hasOverflow,
            scrollWidth,
            clientWidth,
            diff: scrollWidth - clientWidth,
            overflowingElements,
            badElements
          };
        });

        if (overflow.hasOverflow) {
          console.warn(`[OVERFLOW] ${vp.name} on ${route}: +${overflow.diff}px`);
          issues.push({
            viewport: vp.name,
            route,
            type: 'horizontal-overflow',
            diff: overflow.diff,
            elements: overflow.overflowingElements
          });
        }

        if (overflow.badElements.length > 0) {
          console.warn(`[BLOCK OVERFLOW] ${vp.name} on ${route}:`, overflow.badElements);
          issues.push({
            viewport: vp.name,
            route,
            type: 'block-overflow',
            elements: overflow.badElements
          });
        }

      } catch (err) {
        console.error(`Error checking ${route} on ${vp.name}:`, err.message);
        issues.push({
          viewport: vp.name,
          route,
          type: 'navigation-error',
          error: err.message
        });
      }
    }
  }

  await browser.close();
  await previewServer.stop();

  console.log('\n================ AUDIT SUMMARY ================');
  console.log(`Total issues found: ${issues.length}`);
  console.log(JSON.stringify(issues, null, 2));

  // Write issues to an artifact scratch file
  fs.writeFileSync(
    '/Users/chaokuan-hao/.gemini/antigravity-cli/brain/7f11aa1c-5b3b-44de-bfd9-1ce4fbc93a1c/scratch/responsive_audit_results.json',
    JSON.stringify(issues, null, 2)
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
