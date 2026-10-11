import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { preview } from 'astro';

const ci = process.argv.includes('--ci');
const server = ci
  ? await preview({ root: process.cwd(), server: { host: '127.0.0.1', port: 4358 } })
  : null;
const baseURL = process.env.MOTIF_AUDIT_URL || `http://127.0.0.1:${server?.port || 4321}`;
const artifacts = await mkdtemp(join(tmpdir(), 'khc-motif-finale-'));
console.log(`[motif-finale] Artifacts: ${artifacts}`);
const results = [];
const selector = '[data-art-bg-canvas]';
const demoSelector = '[data-background-demo-canvas]';
const engines = (process.env.MOTIF_AUDIT_BROWSERS || 'chromium,firefox,webkit').split(',');
async function settle(page, variant = 'motif', demo = false) {
  await page.waitForFunction(
    ({ selector, variant }) => {
      const d = document.querySelector(selector)?.dataset;
      return d?.bgFinale === variant && d.bgFinaleTransitioning === 'false';
    },
    { selector: demo ? demoSelector : selector, variant }
  );
}
async function finaleWindow(page) {
  await page.evaluate(() => document.fonts.ready);
  for (let i = 0; i < 2; i++) {
    await page.locator('[data-background-stage="attention"]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      scrollTo({ top: scrollY + r.top + r.height / 2 - innerHeight / 2, behavior: 'instant' });
    });
    await page.waitForTimeout(650);
    await page.evaluate(() => dispatchEvent(new Event('resize')));
  }
  try {
    await page.waitForFunction(
      () =>
        Number(document.querySelector('[data-art-bg-canvas]').dataset.bgDisplayedProgress) >= 0.998
    );
  } catch (error) {
    console.error(
      'Finale did not settle',
      await page.evaluate(() => ({
        canvas: { ...document.querySelector('[data-art-bg-canvas]').dataset },
        root: { ...document.documentElement.dataset },
        scroll: scrollY,
        selection: getSelection()?.toString(),
        chapter: document
          .querySelector('[data-background-stage="attention"]')
          .getBoundingClientRect()
          .toJSON(),
      }))
    );
    await page.screenshot({ path: join(artifacts, 'failure.png') });
    throw error;
  }
}
async function point(page, position, demo = false) {
  return page.locator(demo ? demoSelector : selector).evaluate((c, position) => {
    const r = c.getBoundingClientRect(),
      d = c.dataset;
    const x0 = Number(d.bgMotifX0),
      x1 = Number(d.bgMotifX1);
    return { x: r.left + x0 + ((position + 0.5) / 12) * (x1 - x0), y: r.top + Number(d.bgMotifY) };
  }, position);
}
async function openExplorer(page) {
  await page.locator('[data-top-theme-btn]').click();
  await page.locator('[data-background-explore]').click();
  await page.locator(demoSelector).waitFor({ state: 'visible' });
  await page.locator('[data-background-scrub]').evaluate((input) => {
    input.value = '1';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
try {
  for (const engine of engines) {
    const browser = await { chromium, firefox, webkit }[engine].launch();
    try {
      for (const width of (process.env.MOTIF_AUDIT_WIDTHS || '320,390,768,1440')
        .split(',')
        .map(Number)) {
        const phone = width < 640;
        const context = await browser.newContext({
          baseURL,
          viewport: { width, height: phone ? 844 : 1000 },
          hasTouch: phone,
          ...(engine === 'firefox' ? {} : { isMobile: phone }),
          deviceScaleFactor: phone ? 3 : 1,
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        try {
          await page.goto('/');
          await settle(page);
          assert.equal(await page.locator('.nav-lab-card').count(), 6);
          assert.equal(await page.locator('.mobile-lab-card').count(), 6);
          assert.equal(await page.locator('.nav-labs-count').textContent(), '6 Explorations');
          for (const href of ['/nn-lab/', '/deep_dives/']) {
            assert.equal(await page.locator(`header a[href="${href}"]`).count(), 0);
            assert.equal(await page.locator(`footer a[href="${href}"]`).count(), 1);
          }
          await finaleWindow(page);
          const state = await page.locator(selector).evaluate((c) => ({ ...c.dataset }));
          assert.equal(state.bgArcs, '3');
          assert.equal(state.bgPulses, '0', 'the default finale has no repeating pulses');
          assert.ok(Number(state.bgMotifX0) >= 16 && Number(state.bgMotifX1) <= width - 16);
          const windowHeight = await page
            .locator('[data-background-stage="attention"]')
            .evaluate((el) => el.clientHeight);
          assert.equal(windowHeight, phone ? 220 : Math.min(312, Math.max(240, width * 0.25)));
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false
          );
          await page.screenshot({ path: join(artifacts, `${engine}-${width}-motif-light.png`) });
          const hit = await point(page, 5);
          if (phone) await page.touchscreen.tap(hit.x, hit.y);
          else await page.mouse.move(hit.x, hit.y);
          await page.waitForFunction(
            () => document.querySelector('[data-art-bg-canvas]').dataset.bgMotifFocus === '5'
          );
          assert.equal(
            await page.locator(selector).getAttribute('data-bg-motif-outgoing'),
            phone ? '1' : '2'
          );
          assert.equal(
            await page.locator(selector).getAttribute('data-bg-motif-incoming'),
            phone ? '1' : '2'
          );
          await page.screenshot({ path: join(artifacts, `${engine}-${width}-motif-selected.png`) });
          if (phone) {
            await page.touchscreen.tap(hit.x, hit.y);
            assert.equal(await page.locator(selector).getAttribute('data-bg-motif-focus'), '-1');
            await page.touchscreen.tap(hit.x, hit.y);
            await page.waitForFunction(
              () => document.querySelector('[data-art-bg-canvas]').dataset.bgMotifFocus === '-1',
              null,
              { timeout: 6500 }
            );
          }
          await page.evaluate(() => scrollBy({ top: 5, behavior: 'instant' }));
          await page.waitForFunction(
            () => document.querySelector('[data-art-bg-canvas]').dataset.bgMotifFocus === '-1'
          );
          // A control/link must never select a position or disturb the canvas.
          const interactions = await page.locator(selector).getAttribute('data-bg-interactions');
          await page
            .locator('.wordmark')
            .dispatchEvent('pointerdown', { button: 0, pointerType: 'touch' });
          await page
            .locator('.wordmark')
            .dispatchEvent('pointerup', { button: 0, pointerType: 'touch' });
          assert.equal(
            await page.locator(selector).getAttribute('data-bg-interactions'),
            interactions
          );
          await page.mouse.move(0, 0);
          const scroll = await page.evaluate(() => scrollY);
          await page.keyboard.type('motif');
          await settle(page, 'attention');
          assert.equal(await page.locator(selector).getAttribute('data-bg-arcs'), '9');
          assert.equal(
            await page.evaluate(() => localStorage.getItem('khc-morph-finale-v1')),
            'attention'
          );
          assert.equal(await page.evaluate(() => scrollY), scroll);
          await page.screenshot({ path: join(artifacts, `${engine}-${width}-attention.png`) });
          await page.reload();
          await settle(page, 'attention');
          // Palette is the discoverable, phone-compatible entrance.
          await page.locator('[data-open-command-palette]').first().click();
          const search = page.locator('#command-palette-input');
          await search.pressSequentially('motif');
          assert.equal(
            await page.evaluate(() => document.documentElement.dataset.morphFinale),
            'attention',
            'typing in an input does not activate the secret'
          );
          await page.getByText('Switch DNA motif / attention finale', { exact: true }).click();
          await settle(page);
          await finaleWindow(page);
          await openExplorer(page);
          await settle(page, 'motif', true);
          await page.locator(demoSelector).focus();
          await page.keyboard.press('Home');
          assert.equal(await page.locator(demoSelector).getAttribute('data-bg-motif-focus'), '0');
          assert.equal(
            await page.locator(demoSelector).getAttribute('data-bg-pulses'),
            '0',
            'a paused explorer selection stays still'
          );
          assert.match(
            await page.locator('[data-motif-announcement]').textContent(),
            /Position 1 of 12.*Outgoing.*incoming/
          );
          await page.keyboard.press('End');
          assert.equal(await page.locator(demoSelector).getAttribute('data-bg-motif-focus'), '11');
          await page.keyboard.press('ArrowRight');
          assert.equal(await page.locator(demoSelector).getAttribute('data-bg-motif-focus'), '0');
          await page.keyboard.press('ArrowLeft');
          assert.equal(await page.locator(demoSelector).getAttribute('data-bg-motif-focus'), '11');
          // Reduced motion allows an explicit still selection but never starts effects.
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await page.waitForFunction(
            () => document.querySelector('[data-background-demo-canvas]').dataset.bgLife === '0'
          );
          await page.keyboard.press('Home');
          assert.equal(await page.locator(demoSelector).getAttribute('data-bg-motif-focus'), '0');
          assert.equal(await page.locator(demoSelector).getAttribute('data-bg-pulses'), '0');
          const ticks = await page.locator(demoSelector).getAttribute('data-bg-ticks');
          await page.waitForTimeout(200);
          assert.equal(await page.locator(demoSelector).getAttribute('data-bg-ticks'), ticks);
          await page.keyboard.type('motif');
          await settle(page, 'attention', true);
          assert.equal(
            await page.locator(demoSelector).getAttribute('data-bg-finale-mix'),
            '1.000'
          );
          await page.keyboard.press('Escape');
          await page.locator('[data-background-dialog]').waitFor({ state: 'hidden' });
          await page.emulateMedia({ reducedMotion: 'no-preference' });
          await page.keyboard.type('motif');
          await settle(page);
          await finaleWindow(page);
          await page.locator('[data-top-theme-btn]').click();
          await page.locator('button[data-background-motion="paused"]').click();
          await page.locator('[data-top-theme-btn]').click();
          await finaleWindow(page);
          const pausedHit = await point(page, 2);
          if (phone) await page.touchscreen.tap(pausedHit.x, pausedHit.y);
          else await page.mouse.move(pausedHit.x, pausedHit.y);
          await page.waitForFunction(
            () => document.querySelector('[data-art-bg-canvas]').dataset.bgMotifFocus === '2'
          );
          assert.equal(await page.locator(selector).getAttribute('data-bg-pulses'), '0');
          assert.equal(await page.locator(selector).getAttribute('data-bg-life'), '0');
          await page.locator('[data-top-theme-btn]').click();
          await page.locator('button[data-background-motion="ambient"]').click();
          await page.locator('[data-top-theme-btn]').click();
          // Interrupted switches must preserve the rendered blend, not snap to an endpoint.
          await page.evaluate(() =>
            window.dispatchEvent(new CustomEvent('khc:toggle-motif-finale'))
          );
          await page.waitForFunction(() => {
            const mix = Number(document.querySelector('[data-art-bg-canvas]').dataset.bgFinaleMix);
            return mix > 0.1;
          });
          const before = Number(await page.locator(selector).getAttribute('data-bg-finale-mix'));
          await page.evaluate(() =>
            window.dispatchEvent(new CustomEvent('khc:toggle-motif-finale'))
          );
          const after = Number(await page.locator(selector).getAttribute('data-bg-finale-mix'));
          assert.ok(Math.abs(after - before) < 0.15);
          await settle(page);
          for (const theme of ['dark', 'crt']) {
            await page.evaluate((theme) => {
              if (theme === 'dark') {
                window.__khcTheme.set('dark');
              } else {
                window.__khcCrt.set('amber');
              }
            }, theme);
            await page.waitForTimeout(350);
            await finaleWindow(page);
            assert.equal(
              await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
              'rgba(0, 0, 0, 0)',
              `${theme}: the root supplies the page colour; the body must not cover background artwork`
            );
            await page.screenshot({
              path: join(artifacts, `${engine}-${width}-motif-${theme}.png`),
            });
          }
          assert.deepEqual(errors, []);
          const result = {
            engine,
            width,
            windowHeight,
            motifArcs: 3,
            linksPerDirection: phone ? 1 : 2,
            errors: 0,
          };
          results.push(result);
          console.log(JSON.stringify(result));
        } finally {
          await context.close();
        }
      }
      // No-storage, invalid preferences, off-scene toggles, and actual cross-tab propagation.
      for (const denied of [false, true]) {
        const context = await browser.newContext({ baseURL });
        await context.addInitScript((denied) => {
          if (denied)
            for (const name of ['getItem', 'setItem'])
              Storage.prototype[name] = () => {
                throw new DOMException('Blocked', 'SecurityError');
              };
          else localStorage.setItem('khc-morph-finale-v1', 'invalid');
        }, denied);
        const page = await context.newPage();
        try {
          await page.goto('/');
          await settle(page);
          await page.keyboard.type('motif');
          await settle(page, 'attention');
          if (denied) {
            await page.locator('header a[href="/research/"]').first().click();
            await settle(page, 'attention');
          } else {
            const second = await context.newPage();
            await second.goto('/');
            await settle(second); // invalid init value restores motif, notifying the other tab
            await second.keyboard.type('motif');
            await settle(page, 'attention');
            await settle(second, 'attention');
            await second.keyboard.type('motif');
            await settle(page);
            await settle(second);
            await second.close();
            await page.locator('[data-top-theme-btn]').click();
            await page.locator('button[data-background-scene="off"]').click();
            await page.waitForFunction(
              () => document.documentElement.dataset.backgroundScene === 'off'
            );
            const savedBackground = await page.evaluate(() =>
              localStorage.getItem('khc-background-v1')
            );
            await page.keyboard.type('motif');
            assert.equal(
              await page.evaluate(() => document.documentElement.dataset.morphFinale),
              'attention'
            );
            assert.equal(
              await page.evaluate(() => localStorage.getItem('khc-background-v1')),
              savedBackground
            );
            assert.equal(
              await page.evaluate(() => document.documentElement.dataset.backgroundScene),
              'off'
            );
            await page.locator('button[data-background-scene="cells"]').click();
            await page.waitForFunction(
              () => document.documentElement.dataset.backgroundScene === 'cells'
            );
            await page.keyboard.type('motif');
            assert.equal(
              await page.evaluate(() => document.documentElement.dataset.backgroundScene),
              'cells'
            );
            assert.equal(
              await page.evaluate(() => document.documentElement.dataset.morphFinale),
              'motif'
            );
            await page.goto('/nn-lab/');
            assert.equal(
              await page.locator('[data-nav-labs-trigger]').count(),
              0,
              'NN Lab owns a standalone navigation'
            );
            await page.locator('.nn-nav-links a[href="/deep_dives/"]').click();
            await page.waitForURL('**/deep_dives/');
            assert.equal(
              await page.locator('[data-nav-labs-trigger]').getAttribute('aria-current'),
              null
            );
            await page.locator('footer a[href="/shorkie-lab/"]').click();
            await page.waitForURL('**/shorkie-lab/');
            await page.waitForFunction(
              () =>
                document.querySelector('[data-nav-labs-trigger]').getAttribute('aria-current') ===
                'page'
            );
          }
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ baseURL, results }, null, 2));
  console.log(
    `[motif-finale] Passed ${results.length} responsive scenarios plus lifecycle/storage checks.`
  );
} finally {
  await server?.stop();
}
