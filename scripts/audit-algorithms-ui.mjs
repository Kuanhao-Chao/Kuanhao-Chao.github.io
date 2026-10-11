import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { preview } from 'astro';

const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const routes = (arg('routes') ?? 'pairwise,wfa,duel,fm-index,minimap2,debruijn,string-graph,phmm,ghmm,ism,gwas').split(',');
const engines = (arg('browsers') ?? 'chromium,firefox,webkit').split(',');
const ci = process.argv.includes('--ci');
const profiles = ci ? [{ width: 1280, height: 900, name: 'desktop' }, { width: 375, height: 812, name: 'phone' }] : [
  { width: 1280, height: 900, name: 'desktop' }, { width: 768, height: 1024, name: 'tablet' },
  { width: 375, height: 812, name: 'phone' }, { width: 320, height: 720, name: 'narrow' },
];
const evidence = mkdtempSync(join(tmpdir(), 'khc-algorithms-'));
const server = arg('base-url') ? null : await preview({ server: { host: '127.0.0.1', port: 4348 } });
const baseURL = arg('base-url') ?? 'http://127.0.0.1:4348';
const failures = [];
const checks = [];
const browsers = { chromium, firefox, webkit };
async function overflow(page) {
  assert(await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) <= document.documentElement.clientWidth + 1), 'page overflows horizontally');
}
async function snapshot(page) {
  return page.locator('[data-algorithm-lesson]').evaluate(root => ({
    position: root.querySelector('[data-lesson-position]').textContent,
    title: root.querySelector('[data-lesson-title]').textContent,
    text: root.querySelector('[data-lesson-views]').textContent,
    active: [...root.querySelectorAll('.algo-item.is-active')].map(el => el.dataset.inspect),
  }));
}
try {
  for (const engine of engines) {
    const browser = await browsers[engine].launch();
    try {
      for (const profile of profiles) {
        const context = await browser.newContext({ viewport: profile, reducedMotion: profile.name === 'narrow' || ci ? 'reduce' : 'no-preference' });
        const page = await context.newPage(); page.setDefaultTimeout(12_000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        for (const route of routes) {
          const scope = `${engine}/${profile.name}/${route}`;
          try {
            const response = await page.goto(`${baseURL}/algorithms/${route}/`, { waitUntil: 'networkidle' });
            assert.equal(response.status(), 200); await page.evaluate(() => document.fonts.ready);
            await page.locator('[data-lesson-position]').filter({ hasText: /^1 \/ / }).waitFor();
            assert.equal(await page.locator('[data-lesson-play]').textContent(), 'Play');
            assert.equal(await page.locator('.katex-error').count(), 0, 'KaTeX error');
            assert.equal(await page.locator('#practice .algo-exercise').count(), 3);
            await overflow(page);
            const initial = await snapshot(page);
            if (profile.name === 'desktop' || profile.name === 'phone') await page.locator('#explore').screenshot({ path: join(evidence, `${engine}-${profile.name}-${route}-initial.png`) });
            await page.locator('[data-lesson-next]').click();
            assert.notDeepEqual(await snapshot(page), initial, 'next does not change computation');
            await page.locator('[data-lesson-previous]').click();
            assert.deepEqual(await snapshot(page), initial, 'previous does not reconstruct exact state');
            const max = Number(await page.locator('[data-lesson-seek]').getAttribute('max'));
            await page.locator('[data-lesson-seek]').evaluate((el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); }, Math.floor(max / 2));
            await overflow(page);
            if (profile.name === 'desktop') await page.locator('#explore').screenshot({ path: join(evidence, `${engine}-${profile.name}-${route}-middle.png`) });
            await page.locator('[data-lesson-result]').click();
            const result = await page.locator('[data-lesson-answer]').textContent();
            assert(result.trim() && !/NaN|undefined/.test(result), 'blank or invalid computed answer');
            await overflow(page);
            const item = page.locator('[data-lesson-views] [data-inspect]:visible').first();
            await item.click();
            assert(!((await page.locator('[data-lesson-inspector]').textContent()).startsWith('Tap, click')), 'tap inspection failed');
            await item.focus(); await page.keyboard.press('ArrowRight');
            assert(await page.evaluate(() => document.activeElement?.hasAttribute('data-inspect')), 'keyboard focus left diagram');
            if (profile.name === 'desktop' || profile.name === 'phone') await page.locator('#explore').screenshot({ path: join(evidence, `${engine}-${profile.name}-${route}-result.png`) });
            await page.locator('[data-lesson-reset]').click();
            await page.locator('[data-lesson-speed]').selectOption('250');
            await page.locator('[data-lesson-play]').click();
            await page.waitForFunction(() => !document.querySelector('[data-lesson-position]').textContent.startsWith('1 /'));
            await page.locator('[data-lesson-play]').click();
            const paused = await snapshot(page); await page.waitForTimeout(300);
            assert.deepEqual(await snapshot(page), paused, 'paused transport still advances');
            const input = page.locator('[data-lesson-inputs] input, [data-lesson-inputs] textarea').first();
            const original = await input.inputValue();
            await input.fill((await input.getAttribute('type')) === 'number' ? '' : '!');
            assert(await page.locator('[data-lesson-play]').isDisabled(), 'input edit left old result playable');
            assert(await page.locator('[data-lesson-answer]').isHidden(), 'input edit left stale answer visible');
            await page.locator('[data-lesson-inputs] button[type=submit]').click();
            assert(await page.locator('[data-lesson-error]').isVisible(), 'invalid input did not show error');
            await input.fill(original); await page.locator('[data-lesson-inputs] button[type=submit]').click();
            assert(await page.locator('[data-lesson-error]').isHidden(), 'valid input did not recover');
            if (engine === 'chromium' && profile.name === 'desktop') {
              const presets = page.locator('[data-lesson-preset]');
              for (let i = 0; i < await presets.count(); i++) {
                await presets.nth(i).click(); await page.locator('[data-lesson-result]').click();
                assert(await page.locator('[data-lesson-error]').isHidden(), `preset ${i} failed`);
                assert((await page.locator('[data-lesson-answer]').textContent()).trim(), `preset ${i} produced no answer`);
              }
              await page.evaluate(() => document.documentElement.dataset.theme = 'dark'); await overflow(page);
              await page.locator('#explore').screenshot({ path: join(evidence, `${route}-dark.png`) });
              await page.evaluate(() => document.documentElement.dataset.theme = 'light');
            }
            assert.equal(errors.length, 0, errors.join('; ')); checks.push(scope); console.log(`[algorithms-ui] PASS ${scope}`);
          } catch (error) {
            failures.push(`${scope}: ${error.message}`); console.error(`[algorithms-ui] FAIL ${failures.at(-1)}`);
            await page.screenshot({ path: join(evidence, `${engine}-${profile.name}-${route}-failure.png`), fullPage: true }).catch(() => {});
          }
        }
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally { await server?.stop(); }
writeFileSync(join(evidence, 'results.json'), JSON.stringify({ checks, failures }, null, 2));
console.log(`Evidence: ${evidence}`);
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
