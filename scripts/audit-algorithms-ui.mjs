import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { preview } from 'astro';

const arg = (name) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const routes = process.argv.includes('--catalog-only')
  ? []
  : (
      arg('routes') ??
      'pairwise,wfa,duel,fm-index,minimap2,debruijn,string-graph,phmm,ghmm,ism,gwas'
    ).split(',');
const engines = (arg('browsers') ?? 'chromium,firefox,webkit').split(',');
const lifecycleRepeats = Number(arg('lifecycle-repeat') ?? 1);
assert(Number.isInteger(lifecycleRepeats) && lifecycleRepeats >= 1 && lifecycleRepeats <= 20);
const ci = process.argv.includes('--ci');
const profiles = ci
  ? [
      { width: 1280, height: 900, name: 'desktop' },
      { width: 375, height: 812, name: 'phone' },
    ]
  : [
      { width: 1280, height: 900, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 812, name: 'phone' },
      { width: 320, height: 720, name: 'narrow' },
    ];
const evidence = mkdtempSync(join(tmpdir(), 'khc-algorithms-'));
const server = arg('base-url')
  ? null
  : await preview({ server: { host: '127.0.0.1', port: 4348 } });
const baseURL = arg('base-url') ?? 'http://127.0.0.1:4348';
const failures = [];
const checks = [];
const browsers = { chromium, firefox, webkit };
async function overflow(page) {
  assert(
    await page.evaluate(
      () =>
        Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) <=
        document.documentElement.clientWidth + 1
    ),
    'page overflows horizontally'
  );
}
async function snapshot(page) {
  return page.locator('[data-algorithm-lesson]').evaluate((root) => ({
    position: root.querySelector('[data-lesson-position]').textContent,
    title: root.querySelector('[data-lesson-title]').textContent,
    text: root.querySelector('[data-lesson-views]').textContent,
    active: [...root.querySelectorAll('.algo-item.is-active')].map((el) => el.dataset.inspect),
    tones: [...root.querySelectorAll('.algo-item')].map((el) => el.dataset.tone ?? 'neutral'),
  }));
}
async function tableState(page) {
  const tables = await page.locator('.algo-scroll').evaluateAll((regions) =>
    regions.map((region) => ({
      label: region.getAttribute('aria-label'),
      leakedTones: [...region.querySelectorAll('button[data-inspect]')].filter(
        (button) =>
          button.textContent === '·' && ['positive', 'negative'].includes(button.dataset.tone)
      ).length,
      visibleButtons: [...region.querySelectorAll('button[data-inspect]')].filter(
        (button) => !button.closest('tr[hidden]')
      ).length,
      tabStops: [...region.querySelectorAll('button[data-inspect][tabindex="0"]')].filter(
        (button) => !button.closest('tr[hidden]')
      ).length,
      regionTabStop: region.tabIndex === 0,
    }))
  );
  for (const table of tables) {
    assert.equal(table.leakedTones, 0, `${table.label}: future outcomes leaked through color`);
    assert(
      table.visibleButtons ? table.tabStops === 1 : table.regionTabStop,
      `${table.label}: keyboard users cannot enter this table`
    );
  }
}
async function lessonSpecific(page, route) {
  await page.locator('[data-lesson-preset]').first().click();
  await page.locator('[data-lesson-result]').click();
  if (route === 'ism') {
    const field = page.locator('[name=sequence]');
    const original = await field.inputValue();
    const mutation = page.locator('[data-inspect="mutation:0:3"]'); // donor +1 G→A
    await mutation.click();
    assert.equal(await field.inputValue(), original, 'preview changed reference');
    assert(await page.locator('[data-ism-apply]').isEnabled());
    await page.locator('[data-ism-apply]').click();
    assert.equal(await field.inputValue(), original.slice(0, 3) + 'A' + original.slice(4));
    await page.locator('[data-ism-undo]').click();
    assert.equal(await field.inputValue(), original, 'mutation undo lost reference');
    assert(await page.locator('[data-ism-undo]').isDisabled());
    await page.locator('[data-lesson-result]').click();
    await mutation.click();
    await page.locator('[data-ism-apply]').click();
    await page.locator('[data-ism-reference]').click();
    assert.equal(await field.inputValue(), original, 'reference reset failed');
  }
  if (route === 'debruijn') {
    const preset = page.locator('[data-lesson-preset]').filter({ hasText: 'Tip preview' });
    await preset.click();
    const original = await page.locator('[name=reads]').inputValue();
    await page.locator('[data-lesson-result]').click();
    assert(
      (await page.locator('.algo-connection.is-removed').count()) > 0,
      'tip preview removed nothing'
    );
    await page.locator('[data-cleaning-undo]').click();
    assert.equal(await page.locator('[name=reads]').inputValue(), original);
    assert.equal(await page.locator('[name=cleaning]').inputValue(), 'none');
    await page.locator('[data-lesson-result]').click();
    assert.equal(await page.locator('.algo-connection.is-removed').count(), 0);
    await page.locator('[name=reads]').fill('AAAA');
    await page.locator('[name=k]').fill('3');
    await page.locator('[data-lesson-inputs] button[type=submit]').click();
    await page.locator('[data-lesson-result]').click();
    const loop = await page.locator('.algo-connection path').evaluateAll((paths) =>
      paths.map((path) => ({
        top: path.getBBox().y,
        viewTop: path.ownerSVGElement.viewBox.baseVal.y,
      }))
    );
    assert(
      loop.length > 0 && loop.every((path) => path.top >= path.viewTop),
      'self-loop clipped above graph viewBox'
    );
    await page.locator('[name=reads]').fill('ACGTTAGCTAGGCTAACGATCGTACCTGGA');
    await page.locator('[name=k]').fill('8');
    await page.locator('[data-lesson-inputs] button[type=submit]').click();
    await page.locator('[data-lesson-result]').click();
    const nodes = await page.locator('.algo-node').evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      })
    );
    assert.equal(nodes.length, 24, 'supported long graph input lost vertices');
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++)
        assert(
          Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) >= 60,
          'supported custom graph squeezes readable nodes into overlapping circles'
        );
  }
  if (route === 'gwas') {
    const field = page.locator('[name=lead]');
    const marker = page.locator('[data-inspect="manhattan:0"]');
    const original = await field.inputValue();
    await marker.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await field.inputValue(), original, 'keyboard inspection changed lead');
    await marker.press('Enter');
    assert.equal(await field.inputValue(), '1', 'keyboard activation did not select lead');
    assert.equal(await page.locator('[data-lesson-play]').textContent(), 'Play');
    await page.locator('[data-inspect="manhattan:5"]').click();
    assert.equal(await field.inputValue(), '6', 'physical click did not select nearest marker');
    const ld = page.locator('[data-inspect="ld:5"]');
    await ld.focus();
    assert.match(await page.locator('[data-lesson-inspector]').textContent(), /r²=1\.000000/);
    assert(
      (await page.locator('svg [data-lesson-reveal-frame]:visible').count()) > 0,
      'fitted regression line missing'
    );
    const diagonal = await page
      .locator('svg[aria-label^="Independent test prediction"] [data-lesson-diagonal]')
      .evaluate((path) => {
        const parts = path.getAttribute('d').split(' ');
        return {
          x: Number(parts[1]),
          y: Number(parts[2]),
          endX: Number(parts[4]),
          endY: Number(parts[5]),
        };
      });
    assert(
      Math.abs(diagonal.x - 68) < 1e-7 || Math.abs(diagonal.y - 300) < 1e-7,
      'prediction equality line omits the negative-axis range'
    );
    assert(
      Math.abs(diagonal.endX - 720) < 1e-7 || Math.abs(diagonal.endY - 40) < 1e-7,
      'prediction equality line omits the upper-axis range'
    );
  }
  if (route === 'ghmm') {
    assert.equal(await page.locator('[data-inspect=Before]').count(), 1);
    assert.equal(await page.locator('[data-inspect=After]').count(), 1);
    assert.equal(await page.locator('.algo-node.is-active').getAttribute('data-inspect'), 'After');
    const graphHeight = await page
      .locator('svg[aria-label^="Algorithm graph"]')
      .evaluate((graph) => ({
        needed: graph.parentElement.scrollHeight,
        visible: graph.parentElement.clientHeight,
      }));
    assert(
      graphHeight.needed <= graphHeight.visible + 1,
      'default gene grammar unnecessarily hides its complete exit below an inner vertical scroll'
    );
  }
  if (route === 'wfa') {
    const finalPoint = page.locator('.algo-point.is-active').last();
    // WebKit refuses direct programmatic focus on a clipped, off-screen SVG
    // point. Exercise the actual user path: enter the visible chart, then End
    // must move focus and scroll locally to the final recorded event.
    const chartEntry = page.locator('.algo-point[tabindex="0"]').first();
    await chartEntry.scrollIntoViewIfNeeded();
    await chartEntry.press('End');
    assert(
      await finalPoint.evaluate((point) => document.activeElement === point),
      'End did not move keyboard focus to the final WFA event'
    );
    await finalPoint.press('Enter');
    // Await the actual inspection outcome, not an arbitrary delay; selecting
    // the wrong event still fails this exact endpoint assertion.
    await page
      .locator('[data-lesson-inspector]')
      .filter({ hasText: /Endpoint.*minimum penalty/ })
      .waitFor();
    const expected = await page.locator('[data-lesson-inspector]').textContent();
    assert.match(
      expected,
      /Endpoint.*minimum penalty/,
      'keyboard inspection did not reveal final event'
    );
    await finalPoint.click();
    assert.equal(
      await page.locator('[data-lesson-inspector]').textContent(),
      expected,
      'clicking the final WFA event inspected an earlier overlapping event'
    );
  }
  await page.locator('[data-lesson-result]').click();
}
async function catalogAndLifecycle(page) {
  const waitForStart = async (stage) => {
    try {
      await page
        .locator('[data-lesson-position]')
        .filter({ hasText: /^1 \/ / })
        .waitFor();
    } catch (error) {
      throw new Error(`${stage}: ${error.message}`);
    }
  };
  await page.goto(`${baseURL}/algorithms/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    window.__algorithmAuditPageLoads = 0;
    document.addEventListener('astro:page-load', () => window.__algorithmAuditPageLoads++);
  });
  const navigate = async (link, path) => {
    const before = await page.evaluate(() => window.__algorithmAuditPageLoads);
    await link.click();
    await page.waitForFunction(
      ({ before, path }) => window.__algorithmAuditPageLoads > before && location.pathname === path,
      { before, path }
    );
  };
  assert.equal(await page.locator('.algo-card').count(), 13);
  assert.equal(await page.locator('.learning-path-grid a').count(), 11);
  await overflow(page);
  await page.locator('[data-filter=alignment]').click();
  assert.equal(await page.locator('.algo-card:visible').count(), 3);
  await page.locator('[data-search-input]').fill('zz-no-matching-concept');
  assert(await page.locator('[data-algo-empty]').isVisible());
  await page.locator('[data-filter=all]').click();
  await page.locator('[data-search-input]').fill('');
  await page.locator('[data-sort]').selectOption('az');
  const titles = await page
    .locator('.algo-card')
    .evaluateAll((cards) => cards.map((c) => c.dataset.title));
  assert.deepEqual(
    titles,
    [...titles].sort((a, b) => a.localeCompare(b))
  );
  await page.locator('[data-sort]').selectOption('default');
  assert.equal(await page.locator('.algo-card').first().getAttribute('id'), 'minimap2');
  // Real ClientRouter cycle: one click must produce exactly one step after return.
  const pairwise = page.locator('#pairwise .algo-card-title a');
  await navigate(pairwise, '/algorithms/pairwise/');
  await waitForStart('first lesson entry');
  await page.locator('[data-lesson-speed]').selectOption('250');
  await page.locator('[data-lesson-play]').click();
  await navigate(page.locator('.algo-nav a[href="/algorithms/"]'), '/algorithms/');
  await navigate(page.locator('#pairwise .algo-card-title a'), '/algorithms/pairwise/');
  await waitForStart('return lesson entry');
  assert.equal(await page.locator('[data-lesson-play]').textContent(), 'Play');
  await page.locator('[data-lesson-next]').click();
  assert.match(await page.locator('[data-lesson-position]').textContent(), /^2 \/ /);
  await page.waitForTimeout(300);
  assert.match(
    await page.locator('[data-lesson-position]').textContent(),
    /^2 \/ /,
    'old navigation timer survived'
  );
}
try {
  for (const engine of engines) {
    const browser = await browsers[engine].launch();
    try {
      for (const profile of profiles) {
        const context = await browser.newContext({
          viewport: profile,
          reducedMotion: profile.name === 'narrow' || ci ? 'reduce' : 'no-preference',
          hasTouch: ['phone', 'narrow'].includes(profile.name),
        });
        const page = await context.newPage();
        page.setDefaultTimeout(12_000);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        for (const route of routes) {
          const scope = `${engine}/${profile.name}/${route}`;
          try {
            const response = await page.goto(`${baseURL}/algorithms/${route}/`, {
              waitUntil: 'networkidle',
            });
            assert.equal(response.status(), 200);
            await page.evaluate(() => document.fonts.ready);
            await page
              .locator('[data-lesson-position]')
              .filter({ hasText: /^1 \/ / })
              .waitFor();
            assert.equal(await page.locator('[data-lesson-play]').textContent(), 'Play');
            assert.equal(await page.locator('.katex-error').count(), 0, 'KaTeX error');
            assert.equal(await page.locator('#practice .algo-exercise').count(), 3);
            await overflow(page);
            await tableState(page);
            const initial = await snapshot(page);
            if (profile.name === 'desktop' || profile.name === 'phone')
              await page.locator('#explore').screenshot({
                path: join(evidence, `${engine}-${profile.name}-${route}-initial.png`),
              });
            await page.locator('[data-lesson-next]').click();
            assert.notDeepEqual(await snapshot(page), initial, 'next does not change computation');
            await page.locator('[data-lesson-previous]').click();
            assert.deepEqual(
              await snapshot(page),
              initial,
              'previous does not reconstruct exact state'
            );
            await tableState(page);
            const max = Number(await page.locator('[data-lesson-seek]').getAttribute('max'));
            await page.locator('[data-lesson-seek]').evaluate(
              (el, value) => {
                el.value = String(value);
                el.dispatchEvent(new Event('input', { bubbles: true }));
              },
              Math.floor(max / 2)
            );
            await overflow(page);
            if (profile.name === 'desktop')
              await page.locator('#explore').screenshot({
                path: join(evidence, `${engine}-${profile.name}-${route}-middle.png`),
              });
            await page.locator('[data-lesson-result]').click();
            const result = await page.locator('[data-lesson-answer]').textContent();
            assert(
              result.trim() && !/NaN|undefined/.test(result),
              'blank or invalid computed answer'
            );
            await overflow(page);
            await lessonSpecific(page, route);
            await tableState(page);
            const item = page.locator('[data-lesson-views] [data-inspect]:visible').first();
            await item.click();
            assert(
              !(await page.locator('[data-lesson-inspector]').textContent()).startsWith(
                'Tap, click'
              ),
              'tap inspection failed'
            );
            await item.focus();
            await page.keyboard.press('ArrowRight');
            assert(
              await page.evaluate(() => document.activeElement?.hasAttribute('data-inspect')),
              'keyboard focus left diagram'
            );
            if (profile.name === 'desktop' || profile.name === 'phone')
              await page.locator('#explore').screenshot({
                path: join(evidence, `${engine}-${profile.name}-${route}-result.png`),
              });
            await page.locator('[data-lesson-reset]').click();
            // A four-frame custom input can finish before a slow engine delivers
            // the pause click at 250ms. Exercise pause during a longer interval.
            await page.locator('[data-lesson-speed]').selectOption('1200');
            await page.locator('[data-lesson-play]').click();
            await page.waitForFunction(
              () => !document.querySelector('[data-lesson-position]').textContent.startsWith('1 /')
            );
            await page.locator('[data-lesson-play]').click();
            const paused = await snapshot(page);
            assert.equal(
              await page.locator('[data-lesson-play]').textContent(),
              'Play',
              'pause click did not stop playback'
            );
            await page.waitForTimeout(1300);
            assert.deepEqual(await snapshot(page), paused, 'paused transport still advances');
            const input = page
              .locator('[data-lesson-inputs] input, [data-lesson-inputs] textarea')
              .first();
            const original = await input.inputValue();
            await input.fill((await input.getAttribute('type')) === 'number' ? '' : '!');
            assert(
              await page.locator('[data-lesson-play]').isDisabled(),
              'input edit left old result playable'
            );
            assert(
              await page.locator('[data-lesson-answer]').isHidden(),
              'input edit left stale answer visible'
            );
            await page.locator('[data-lesson-inputs] button[type=submit]').click();
            assert(
              await page.locator('[data-lesson-error]').isVisible(),
              'invalid input did not show error'
            );
            await input.fill(original);
            await page.locator('[data-lesson-inputs] button[type=submit]').click();
            assert(
              await page.locator('[data-lesson-error]').isHidden(),
              'valid input did not recover'
            );
            if (engine === 'chromium' && profile.name === 'desktop') {
              const presets = page.locator('[data-lesson-preset]');
              for (let i = 0; i < (await presets.count()); i++) {
                await presets.nth(i).click();
                await page.locator('[data-lesson-result]').click();
                assert(await page.locator('[data-lesson-error]').isHidden(), `preset ${i} failed`);
                assert(
                  (await page.locator('[data-lesson-answer]').textContent()).trim(),
                  `preset ${i} produced no answer`
                );
              }
              await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
              await overflow(page);
              await page
                .locator('#explore')
                .screenshot({ path: join(evidence, `${route}-dark.png`) });
              await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
            }
            assert.equal(errors.length, 0, errors.join('; '));
            checks.push(scope);
            console.log(`[algorithms-ui] PASS ${scope}`);
          } catch (error) {
            failures.push(`${scope}: ${error.message}`);
            console.error(`[algorithms-ui] FAIL ${failures.at(-1)}`);
            await page
              .screenshot({
                path: join(evidence, `${engine}-${profile.name}-${route}-failure.png`),
                fullPage: true,
              })
              .catch(() => {});
          }
        }
        try {
          for (let repetition = 0; repetition < lifecycleRepeats; repetition++)
            await catalogAndLifecycle(page);
          await overflow(page);
          assert.equal(errors.length, 0, errors.join('; '));
          checks.push(`${engine}/${profile.name}/catalog-lifecycle`);
          console.log(`[algorithms-ui] PASS ${engine}/${profile.name}/catalog-lifecycle`);
        } catch (error) {
          failures.push(`${engine}/${profile.name}/catalog-lifecycle: ${error.message}`);
          console.error(`[algorithms-ui] FAIL ${failures.at(-1)}`);
          console.error(
            `[algorithms-ui] navigation state ${JSON.stringify(
              await page.evaluate(() => ({
                path: location.pathname,
                position: document.querySelector('[data-lesson-position]')?.textContent,
                play: document.querySelector('[data-lesson-play]')?.textContent,
              }))
            )}`
          );
          await page
            .screenshot({
              path: join(evidence, `${engine}-${profile.name}-catalog-failure.png`),
              fullPage: true,
            })
            .catch(() => {});
        }
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await server?.stop();
}
writeFileSync(join(evidence, 'results.json'), JSON.stringify({ checks, failures }, null, 2));
console.log(`Evidence: ${evidence}`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
