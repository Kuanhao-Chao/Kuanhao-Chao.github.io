import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'astro';

// Run after a build, on its own: concurrent browser suites contaminate timings.
const stages = ['dna', 'rna', 'protein', 'cell', 'signal', 'network', 'attention'];
const poses = Array.from({ length: 13 }, (_, i) => ({
  progress: i / 12,
  name: i % 2 ? `${stages[(i - 1) / 2]}→${stages[(i + 1) / 2]}` : stages[i / 2],
}));
const artifacts = await mkdtemp(join(tmpdir(), 'khc-morph-profile-'));
console.log(`[profile-morph] Artifacts: ${artifacts}`);
const results = [];
let server;
let browser;
try {
  server = await preview({ root: process.cwd(), server: { host: '127.0.0.1', port: 4338 } });
  // Astro/Vite may retry on another port; use the preview we actually own.
  const baseURL = `http://127.0.0.1:${server.port}`;
  browser = await chromium.launch();
  for (const phone of [false, true]) {
    const profile = phone ? 'phone-390px-4x-cpu' : 'desktop';
    for (const mode of ['ambient', 'explorer']) {
      const context = await browser.newContext({
        baseURL,
        viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        deviceScaleFactor: phone ? 3 : 1,
        hasTouch: phone,
        isMobile: phone,
      });
      try {
        await context.addInitScript(() => {
          localStorage.setItem(
            'khc-background-v1',
            JSON.stringify({ scene: 'morph', motion: 'ambient' })
          );
        });
        const page = await context.newPage();
        const runtimeErrors = [];
        page.on('pageerror', (error) => runtimeErrors.push(error.message));
        if (phone) {
          const session = await context.newCDPSession(page);
          await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        }
        await page.goto('/');
        await page.waitForFunction(
          () => document.querySelector('[data-art-bg-canvas]')?.dataset.bgScene === 'morph'
        );
        await page.evaluate(() => document.fonts.ready);
        if (mode === 'explorer') {
          await page.locator('[data-top-theme-btn]').click();
          await page.locator('[data-background-explore]').click();
          await page.locator('[data-background-demo-canvas]').waitFor({ state: 'visible' });
          // Keep the manually selected pose exact while exercising real update/draw
          // frames and spring work, rather than allowing autoplay to leave the pose.
          await page.evaluate(() => {
            document.querySelector('[data-background-stir]').click();
            window.__morphProfileStir = setInterval(
              () => document.querySelector('[data-background-stir]').click(),
              700
            );
          });
        }
        const selector =
          mode === 'ambient' ? '[data-art-bg-canvas]' : '[data-background-demo-canvas]';
        for (const pose of poses) {
          if (mode === 'explorer') {
            await page.locator('[data-background-scrub]').evaluate((input, progress) => {
              input.value = String(progress);
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }, pose.progress);
          } else {
            for (let settle = 0; settle < 2; settle++) {
              await page.evaluate((progress) => {
                const chapters = [...document.querySelectorAll('[data-background-stage]')].map(
                  (element) => {
                    const r = element.getBoundingClientRect();
                    return {
                      center: r.top + scrollY + r.height / 2,
                      radius: Math.min(64, r.height * 0.2),
                    };
                  }
                );
                const i = Math.floor(progress * 6);
                const focus =
                  progress * 6 === i
                    ? chapters[i].center
                    : (chapters[i].center +
                        chapters[i].radius +
                        chapters[i + 1].center -
                        chapters[i + 1].radius) /
                      2;
                scrollTo({ top: Math.max(0, focus - innerHeight / 2), behavior: 'instant' });
              }, pose.progress);
              if (settle === 0) {
                // First exposure reveals sections with a 10px CSS translation.
                // Let that 550ms transition finish, then exercise the normal resize
                // cache refresh before calculating the exact settled scroll pose.
                await page.waitForTimeout(650);
                await page.evaluate(() => dispatchEvent(new Event('resize')));
              }
            }
          }
          try {
            await page.waitForFunction(
              ({ selector, progress }) =>
                Math.abs(
                  Number(document.querySelector(selector).dataset.bgDisplayedProgress) - progress
                ) < 0.002,
              { selector, progress: pose.progress }
            );
          } catch (error) {
            console.error('Pose did not settle', {
              profile,
              mode,
              pose,
              diagnostics: await page.locator(selector).evaluate((c) => ({
                ...c.dataset,
                scrollY,
                height: innerHeight,
                chapters: [...document.querySelectorAll('[data-background-stage]')].map((e) => {
                  const r = e.getBoundingClientRect();
                  return {
                    stage: e.dataset.backgroundStage,
                    center: r.top + scrollY + r.height / 2,
                    radius: Math.min(64, r.height * 0.2),
                  };
                }),
              })),
            });
            throw error;
          }
          await page.waitForTimeout(2000);
          assert.equal(
            Number(await page.locator(selector).getAttribute('data-bg-allocated')),
            mode === 'ambient' ? (phone ? 1000 : 3200) : phone ? 1600 : 5000,
            'profile the approved fixed particle budget'
          );
          const samples = await page.evaluate(async (selector) => {
            const canvas = document.querySelector(selector);
            const seen = new Set([canvas.dataset.bgTicks]);
            const values = [];
            const start = performance.now();
            return await new Promise((resolve) => {
              const timer = setInterval(() => {
                const d = canvas.dataset;
                if (!seen.has(d.bgTicks)) {
                  seen.add(d.bgTicks);
                  values.push({
                    tick: Number(d.bgTicks),
                    ms: Number(d.bgRenderMs),
                    quality: Number(d.bgQuality),
                    fallback: d.bgFallback || 'none',
                    progress: Number(d.bgDisplayedProgress),
                  });
                }
                if (performance.now() - start >= 3000) {
                  clearInterval(timer);
                  resolve(values);
                }
              }, 5);
            });
          }, selector);
          assert.ok(
            samples.length >= 20,
            `${profile}/${mode}/${pose.name}: enough unique rendered ticks`
          );
          assert.ok(
            samples.every(
              (s) =>
                Number.isFinite(s.ms) &&
                s.ms >= 0 &&
                Math.abs(s.progress - pose.progress) < 0.002 &&
                Number.isFinite(s.quality) &&
                s.quality >= 0.35 &&
                s.quality <= 1
            ),
            'finite samples at the requested pose'
          );
          const costs = samples.map((s) => s.ms).sort((a, b) => a - b);
          const row = {
            profile,
            mode,
            pose: pose.name,
            progress: pose.progress,
            samples: samples.length,
            p95: costs[Math.ceil(costs.length * 0.95) - 1],
            quality: Math.min(...samples.map((s) => s.quality)),
            fallback: [...new Set(samples.map((s) => s.fallback))].join(','),
            threshold: phone ? 10 : 6,
          };
          results.push(row);
          console.log(JSON.stringify(row));
          await writeFile(
            join(artifacts, 'results.json'),
            JSON.stringify(
              {
                note: 'Local-host Chromium update/draw timings, not physical-device measurements. Fixed explorer poses include repeated spring stirring.',
                results,
              },
              null,
              2
            )
          );
          assert.ok(
            row.p95 < row.threshold,
            `${profile}/${mode}/${pose.name}: p95 ${row.p95}ms must be <${row.threshold}ms`
          );
          assert.equal(row.fallback, 'none', 'profiling must not silently pass on static fallback');
        }
        assert.deepEqual(runtimeErrors, [], 'no browser runtime errors');
      } finally {
        await context.close();
      }
    }
  }
  console.log(`[profile-morph] Passed 52 pose/mode/profile checks. Results: ${artifacts}`);
} finally {
  try {
    await browser?.close();
  } finally {
    await server?.stop();
  }
}
