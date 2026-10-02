import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright';
import { preview } from 'astro';

// Local mode uses a running server; --ci owns a preview of the already-built dist/.
const ci = process.argv.includes('--ci');
const baseURL =
  process.env.BACKGROUND_UI_BASE_URL || (ci ? 'http://127.0.0.1:4337' : 'http://127.0.0.1:4321');
const previewServer = ci
  ? await preview({ root: process.cwd(), server: { host: '127.0.0.1', port: 4337 } })
  : null;
const artifacts = await mkdtemp(join(tmpdir(), 'khc-background-'));
const engines = process.env.BACKGROUND_UI_BROWSERS?.split(',') || ['chromium', 'webkit'];
const errors = [];
// Independent approved order and exact canonical values, not read from production metadata.
const forms = [
  ['dna', 0],
  ['rna', 1 / 6],
  ['protein', 1 / 3],
  ['cell', 0.5],
  ['signal', 2 / 3],
  ['network', 5 / 6],
  ['distribution', 1],
];
async function openAppearance(page) {
  const button = page.locator('[data-top-theme-btn]');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}
async function choose(page, kind, value) {
  await openAppearance(page);
  await page.locator(`button[data-background-${kind}="${value}"]`).click();
  await page.waitForFunction(() => document.documentElement.dataset.backgroundSwitching !== 'true');
}
async function frames(page, demo = false) {
  return page
    .locator(demo ? '[data-background-demo-canvas]' : '[data-art-bg-canvas]')
    .evaluate((c) => Number(c.dataset.bgTicks || 0));
}
async function still(page, demo = false) {
  await page.waitForTimeout(150);
  const before = await frames(page, demo);
  await page.waitForTimeout(400);
  assert.equal(await frames(page, demo), before, 'paused renderer must not continue drawing');
}
async function migrationChecks(browser, name) {
  for (const [saved, legacy, expected] of [
    [{ scene: 'flow', motion: 'calm' }, null, { scene: 'cells', motion: 'calm' }],
    [{ scene: 'landscape', motion: 'paused' }, null, { scene: 'cells', motion: 'paused' }],
    [{ scene: 'future', motion: 'calm' }, 'off', { scene: 'cells', motion: 'calm' }],
    [{ scene: 'future', motion: 'paused' }, 'off', { scene: 'cells', motion: 'paused' }],
    [{ scene: 'morph', motion: 'paused' }, null, { scene: 'morph', motion: 'paused' }],
    [{ scene: 'off', motion: 'calm' }, null, { scene: 'off', motion: 'calm' }],
    ['{broken', 'calm', { scene: 'cells', motion: 'calm' }],
    [null, 'off', { scene: 'off', motion: 'ambient' }],
  ]) {
    const context = await browser.newContext({ baseURL });
    try {
      const raw = typeof saved === 'string' || saved === null ? saved : JSON.stringify(saved);
      await context.addInitScript(
        ({ raw, legacy }) => {
          if (raw !== null) localStorage.setItem('khc-background-v1', raw);
          if (legacy !== null) localStorage.setItem('khc-cell-mode', legacy);
        },
        { raw, legacy }
      );
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${name}-migration: ${e.message}`));
      let releaseModules;
      const moduleGate = new Promise((resolve) => {
        releaseModules = resolve;
      });
      // Pause external modules, not inline scripts: observe the actual early-paint policy.
      await page.route('**/*', async (route) => {
        if (route.request().resourceType() === 'script') await moduleGate;
        await route.continue();
      });
      try {
        await page.goto('/?cell-audit=1', { waitUntil: 'commit' });
        await page.waitForFunction(() => document.documentElement.dataset.backgroundScene);
        assert.deepEqual(
          await page.evaluate(() => ({
            scene: document.documentElement.dataset.backgroundScene,
            motion: document.documentElement.dataset.backgroundMotion,
          })),
          expected,
          `pre-hydration resolution: ${raw}`
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.dataset.backgroundExploring),
          undefined,
          'the controller must not have hydrated during the early-paint assertion'
        );
        assert.equal(
          await page.evaluate(() => localStorage.getItem('khc-background-v1')),
          raw,
          'early paint must not silently rewrite storage'
        );
      } finally {
        releaseModules();
      }
      await page.waitForFunction(
        () => document.documentElement.dataset.backgroundExploring === 'false'
      );
      assert.deepEqual(
        await page.evaluate(() => ({
          scene: document.documentElement.dataset.backgroundScene,
          motion: document.documentElement.dataset.backgroundMotion,
        })),
        expected,
        `hydrated resolution: ${raw}`
      );
      assert.deepEqual(
        await page.evaluate(() => JSON.parse(localStorage.getItem('khc-background-v1'))),
        expected,
        'hydration persists the migrated choice without losing motion'
      );
      assert.equal(
        await page
          .locator(`button[data-background-scene="${expected.scene}"]`)
          .getAttribute('aria-checked'),
        'true'
      );
      assert.equal(
        await page
          .locator(`button[data-background-motion="${expected.motion}"]`)
          .getAttribute('aria-checked'),
        'true'
      );
      if (expected.scene === 'cells') {
        await page.waitForFunction(() => window.__khcCellsDebug?.snapshot().attached);
        const snapshot = await page.evaluate(() => window.__khcCellsDebug.snapshot());
        assert.equal(snapshot.running, expected.motion !== 'paused');
        assert.equal(snapshot.mode, expected.motion === 'calm' ? 'calm' : 'ambient');
      }
    } finally {
      await context.close();
    }
  }
  console.log(`[background-ui] ${name} pre-hydration + hydrated migration: 8 cases passed`);
}
async function scrub(page, progress) {
  await page.locator('[data-background-scrub]').evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, progress);
}
async function displayed(page) {
  return Number(
    await page.locator('[data-background-demo-canvas]').getAttribute('data-bg-displayed-progress')
  );
}
async function completePlayback(page) {
  // Exercise the actual renderer/controller with an owned deterministic RAF clock,
  // not 60 real seconds per profile (the background CI job has an eight-minute cap).
  await page.locator('[data-background-reset]').click();
  await page.evaluate(() => {
    window.__morphAuditClock = {
      raf: requestAnimationFrame,
      cancel: cancelAnimationFrame,
      time: performance.now(),
      next: null,
    };
    window.requestAnimationFrame = (callback) => {
      window.__morphAuditClock.next = callback;
      return -1;
    };
    window.cancelAnimationFrame = () => {
      window.__morphAuditClock.next = null;
    };
  });
  const advance = async (seconds) =>
    page.evaluate((seconds) => {
      const clock = window.__morphAuditClock;
      clock.time += seconds * 1000;
      const callback = clock.next;
      clock.next = null;
      if (!callback) throw new Error('Playback must schedule the next frame');
      callback(clock.time);
    }, seconds);
  try {
    await page.locator('[data-background-play]').evaluate((button) => button.click());
    await page.evaluate(() => {
      window.__morphAuditClock.time = performance.now();
    });
    for (let leg = 0; leg < 12; leg++) {
      const from = leg < 6 ? leg / 6 : (12 - leg) / 6;
      const to = leg < 6 ? (leg + 1) / 6 : (11 - leg) / 6;
      await advance(0.25);
      assert.ok(Math.abs((await displayed(page)) - from) < 0.001, `playback arrival ${leg * 5}s`);
      await advance(1.5);
      assert.ok(
        Math.abs((await displayed(page)) - from) < 0.001,
        `two-second hold after ${leg * 5}s`
      );
      await advance(1.75);
      assert.ok(
        Math.abs((await displayed(page)) - (from + to) / 2) < 0.002,
        `adjacent playback midpoint on leg ${leg}`
      );
      if (leg === 8) {
        await page.locator('[data-background-play]').evaluate((button) => button.click());
        const paused = await displayed(page);
        await page.locator('[data-background-play]').evaluate((button) => button.click());
        // Resume resets the renderer wall-time origin, retaining its reverse phase.
        await page.evaluate(() => {
          window.__morphAuditClock.time = performance.now();
        });
        assert.ok(
          Math.abs((await displayed(page)) - paused) < 0.001,
          'reverse playback resumes without a jump'
        );
      }
      await advance(1.5);
    }
    await advance(0.25);
    assert.ok(Math.abs(await displayed(page)) < 0.001, '60-second loop returns to DNA');
    await page.locator('[data-background-play]').evaluate((button) => button.click());
  } finally {
    await page.evaluate(() => {
      const clock = window.__morphAuditClock;
      window.requestAnimationFrame = clock.raf;
      window.cancelAnimationFrame = clock.cancel;
      delete window.__morphAuditClock;
    });
  }
}
async function minimumQuality(page, label) {
  await page.evaluate(() => {
    window.__morphQualityAudit = {
      raf: requestAnimationFrame,
      cancel: cancelAnimationFrame,
      now: performance.now.bind(performance),
      next: null,
      cost: 0,
    };
    window.requestAnimationFrame = (callback) => {
      window.__morphQualityAudit.next = callback;
      return -1;
    };
    window.cancelAnimationFrame = () => {
      window.__morphQualityAudit.next = null;
    };
  });
  try {
    await page.locator('[data-background-play]').evaluate((button) => button.click());
    await page.evaluate(() => {
      const audit = window.__morphQualityAudit;
      let time = audit.now();
      // Inject measured 11ms cost, not a real busy loop. Drive the existing adaptive
      // quality branch without triggering the separate >24ms static-fallback branch.
      performance.now = () => audit.now() + (audit.cost += 11);
      for (let i = 0; i < 110; i++) {
        const callback = audit.next;
        audit.next = null;
        if (!callback) throw new Error('Adaptive-quality audit must keep drawing');
        callback((time += 100));
      }
      performance.now = audit.now;
    });
    await page.locator('[data-background-play]').evaluate((button) => button.click());
    await page.evaluate(() => {
      window.requestAnimationFrame = window.__morphQualityAudit.raf;
      window.cancelAnimationFrame = window.__morphQualityAudit.cancel;
    });
    for (const [id, progress] of forms) {
      await scrub(page, progress);
      const state = await page.locator('[data-background-demo-canvas]').evaluate((canvas) => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let pixels = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 10) pixels++;
        return { ...canvas.dataset, pixels };
      });
      assert.equal(state.bgQuality, '0.35', 'exercise the actual minimum adaptive quality');
      assert.notEqual(state.bgFallback, 'static');
      assert.ok(
        Number(state.bgVisible) >= Number(state.bgAllocated) * 0.3,
        `${id} retains drawing material at minimum quality`
      );
      assert.ok(state.pixels > 100, `${id} retains a visible silhouette at minimum quality`);
      await page
        .locator('[data-background-demo-canvas]')
        .screenshot({ path: join(artifacts, `${label}-morph-min-quality-${id}.png`) });
    }
  } finally {
    await page.evaluate(() => {
      const audit = window.__morphQualityAudit;
      performance.now = audit.now;
      window.requestAnimationFrame = audit.raf;
      window.cancelAnimationFrame = audit.cancel;
      delete window.__morphQualityAudit;
    });
  }
}
try {
  for (const name of engines) {
    const browser = await { chromium, webkit }[name].launch();
    try {
      await migrationChecks(browser, name);
      for (const phone of process.env.BACKGROUND_UI_PHONE_ONLY === '1' ? [true] : [false, true]) {
        const label = `${name}-${phone ? 'phone' : 'desktop'}`;
        console.log(`[background-ui] ${label}`);
        const context = await browser.newContext({
          baseURL,
          viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
          hasTouch: phone,
          isMobile: phone,
          deviceScaleFactor: phone ? 3 : 1,
        });
        const page = await context.newPage();
        page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
        await page.goto('/?cell-audit=1');
        assert.deepEqual(
          await page
            .locator('[data-background-form]')
            .evaluateAll((buttons) =>
              buttons.map((button) => Number(button.dataset.backgroundForm))
            ),
          forms.map(([, progress]) => progress),
          'explorer must offer all seven canonical forms'
        );
        assert.deepEqual(
          await page
            .locator('button[data-background-scene]')
            .evaluateAll((buttons) => buttons.map((button) => button.dataset.backgroundScene)),
          ['cells', 'morph', 'off'],
          'only the two supported scenes and accessibility Off are offered'
        );
        await page.waitForFunction(() => window.__khcCellsDebug?.snapshot().running);
        await choose(page, 'scene', 'morph');
        assert.equal(await page.locator('[data-site-bg-canvas]').isVisible(), false);
        assert.equal(await page.locator('[data-hero-canvas]').isVisible(), false);
        assert.equal(await page.evaluate(() => window.__khcCellsDebug.snapshot().attached), false);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1200);
        assert.ok((await frames(page)) > 5);
        await page.screenshot({ path: join(artifacts, `${label}-morph-switch.png`) });
        await choose(page, 'motion', 'paused');
        await still(page);
        await choose(page, 'motion', 'calm');
        const start = await frames(page);
        await page.waitForTimeout(300);
        assert.ok((await frames(page)) > start);
        const scrollBefore = await page.evaluate(() => scrollY);
        await page.locator('[data-background-explore]').click();
        await page.locator('[data-background-dialog]').waitFor({ state: 'visible' });
        await still(page);
        await page.locator('[data-background-play]').click();
        await still(page, true);
        const interactions = Number(
          await page.locator('[data-background-demo-canvas]').getAttribute('data-bg-interactions')
        );
        await page.locator('[data-background-stir]').click();
        await page.waitForFunction(
          (expected) =>
            Number(
              document.querySelector('[data-background-demo-canvas]').dataset.bgInteractions
            ) === expected,
          interactions + 1
        );
        assert.equal(
          Number(
            await page.locator('[data-background-demo-canvas]').getAttribute('data-bg-interactions')
          ),
          interactions + 1,
          'the retained explorer interaction must stir particles'
        );
        await page.waitForTimeout(1800);
        await still(page, true);
        await page.screenshot({ path: join(artifacts, `${label}-morph-switch-demo.png`) });
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-background-dialog]').isVisible(), false);
        assert.equal(
          await page.locator('[data-top-theme-btn]').evaluate((e) => e === document.activeElement),
          true
        );
        assert.equal(
          await page.evaluate(() => scrollY),
          scrollBefore,
          'opening a demo must preserve reading position'
        );

        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          'page must not overflow horizontally'
        );
        await choose(page, 'scene', 'cells');
        await page.waitForFunction(() => window.__khcCellsDebug.snapshot().running);
        assert.equal(await page.locator('[data-art-bg-canvas]').isVisible(), false);
        await choose(page, 'motion', 'ambient');

        await choose(page, 'scene', 'morph');
        await page.keyboard.press('Escape');
        await page.waitForFunction(
          () => document.querySelector('[data-art-bg-canvas]')?.dataset.bgScene === 'morph'
        );
        await page.evaluate(() => scrollTo(0, 0));
        await page.waitForTimeout(700);
        assert.ok((await frames(page)) > 5, 'particle scene must animate');
        const ambientDensity = await page
          .locator('[data-art-bg-canvas]')
          .evaluate((c) => ({ ...c.dataset }));
        assert.equal(Number(ambientDensity.bgAllocated), phone ? 1000 : 3200);
        assert.ok(
          Number(ambientDensity.bgVisible) >= Number(ambientDensity.bgAllocated) * 0.3,
          'DNA must retain a dense cloud even at minimum adaptive quality'
        );
        await page.screenshot({ path: join(artifacts, `${label}-morph-dna.png`) });
        assert.deepEqual(
          await page
            .locator('[data-background-stage]')
            .evaluateAll((elements) => elements.map((e) => e.dataset.backgroundStage)),
          forms.map(([id]) => id)
        );
        for (const [stage, progress] of forms.slice(1)) {
          await page.evaluate((name) => {
            const element = document.querySelector(`[data-background-stage="${name}"]`);
            const rect = element.getBoundingClientRect();
            scrollTo({
              top: rect.top + scrollY + rect.height / 2 - innerHeight / 2,
              behavior: 'instant',
            });
          }, stage);
          await page.waitForFunction(
            (expected) =>
              Math.abs(
                Number(
                  document.querySelector('[data-art-bg-canvas]')?.dataset.bgDisplayedProgress
                ) - expected
              ) < 0.002,
            progress
          );
          await page.waitForTimeout(900);
          const visiblePixels = await page.evaluate((name) => {
            const canvas = document.querySelector('[data-art-bg-canvas]');
            const window = document
              .querySelector(`[data-background-stage="${name}"]`)
              .getBoundingClientRect();
            const ratio = canvas.width / canvas.clientWidth;
            const data = canvas
              .getContext('2d')
              .getImageData(
                Math.max(0, Math.round(window.left * ratio)),
                Math.max(0, Math.round(window.top * ratio)),
                Math.min(canvas.width, Math.round(window.width * ratio)),
                Math.min(canvas.height, Math.round(window.height * ratio))
              ).data;
            let count = 0;
            for (let i = 3; i < data.length; i += 4) if (data[i] > 10) count++;
            return count;
          }, stage);
          assert.ok(visiblePixels > 50, `${stage} form must be visible in its reading-safe window`);
          await page.screenshot({ path: join(artifacts, `${label}-morph-${stage}.png`) });
          if (stage === 'cell') {
            const point = await page.locator('[data-background-stage="cell"]').evaluate((e) => {
              const r = e.getBoundingClientRect();
              return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            });
            const before = Number(
              await page.locator('[data-art-bg-canvas]').getAttribute('data-bg-interactions')
            );
            if (phone) await page.touchscreen.tap(point.x, point.y);
            else {
              await page.mouse.move(point.x, point.y);
              await page.waitForFunction(
                () => Number(document.querySelector('[data-art-bg-canvas]').dataset.bgPointer) > 0.2
              );
              await page.mouse.click(point.x, point.y);
            }
            await page.waitForFunction(
              (expected) =>
                Number(document.querySelector('[data-art-bg-canvas]').dataset.bgInteractions) ===
                expected,
              before + 1
            );
            await page.locator('[data-top-theme-btn]').click();
            await page.keyboard.press('Escape');
            assert.equal(
              Number(
                await page.locator('[data-art-bg-canvas]').getAttribute('data-bg-interactions')
              ),
              before + 1,
              'controls must not disturb the artwork'
            );
          }
        }
        await openAppearance(page);
        await page.locator('[data-background-explore]').click();
        await page.locator('[data-background-dialog]').waitFor({ state: 'visible' });
        await page.locator('[data-background-scrub]').evaluate((input) => {
          input.value = '0';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.evaluate(() => {
          window.__backgroundTimingRaf = [
            window.requestAnimationFrame,
            window.cancelAnimationFrame,
          ];
          window.requestAnimationFrame = (callback) =>
            window.setTimeout(() => callback(performance.now()), 180);
          window.cancelAnimationFrame = (id) => window.clearTimeout(id);
        });
        await page.locator(`[data-background-form="${1 / 6}"]`).click();
        await page.waitForTimeout(1250);
        assert.equal(
          await page.locator('[data-background-demo-canvas]').getAttribute('data-bg-transitioning'),
          'false',
          'an adjacent .9s transition completes on wall time even under slow callbacks'
        );
        assert.equal(
          await page.locator('[data-background-demo-canvas]').getAttribute('data-bg-stage'),
          'rna'
        );
        await page.locator('[data-background-reset]').click();
        await page.locator('[data-background-play]').click();
        await page.waitForTimeout(3400);
        const slowPlayback = Number(
          await page
            .locator('[data-background-demo-canvas]')
            .getAttribute('data-bg-displayed-progress')
        );
        assert.ok(
          slowPlayback > 0.04 && slowPlayback < 0.13,
          'autoplay follows the 2s hold and 3s transition on wall time under slow callbacks'
        );
        await page.locator('[data-background-play]').click();
        await page.evaluate(() => {
          [window.requestAnimationFrame, window.cancelAnimationFrame] =
            window.__backgroundTimingRaf;
          delete window.__backgroundTimingRaf;
        });
        await page.locator('[data-background-scrub]').evaluate((input) => {
          input.value = String(1 / 6);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.locator('[data-background-step]').click();
        assert.ok(
          Math.abs(
            Number(
              await page
                .locator('[data-background-demo-canvas]')
                .getAttribute('data-bg-displayed-progress')
            ) -
              (1 / 6 + 0.05)
          ) < 0.001,
          'single step advances normalized progress by .05, not an old three-stage interval'
        );
        await page.locator('[data-background-form="1"]').click();
        await page.waitForTimeout(150);
        const beforeInterrupt = Number(
          await page
            .locator('[data-background-demo-canvas]')
            .getAttribute('data-bg-displayed-progress')
        );
        await page.locator('[data-background-form="0"]').click();
        const afterInterrupt = Number(
          await page
            .locator('[data-background-demo-canvas]')
            .getAttribute('data-bg-displayed-progress')
        );
        assert.ok(
          Math.abs(afterInterrupt - beforeInterrupt) < 0.015,
          'interrupt starts from displayed pose'
        );
        await page.locator('[data-background-play]').click();
        const resumed = Number(
          await page
            .locator('[data-background-demo-canvas]')
            .getAttribute('data-bg-displayed-progress')
        );
        assert.ok(
          Math.abs(resumed - afterInterrupt) < 0.015,
          'resume preserves displayed progress'
        );
        await page.locator('[data-background-play]').click();
        await page.locator('[data-background-scrub]').evaluate((input) => {
          input.value = '0.5';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        assert.match(
          await page.locator('[data-background-demo-status]').textContent(),
          /cellular context/i
        );
        await page.locator('[data-background-form="0"]').click();
        await page.waitForFunction(
          () =>
            document.querySelector('[data-background-demo-canvas]').dataset.bgDisplayedProgress ===
            '0.000'
        );
        await page.locator('[data-background-form="0.5"]').click();
        assert.equal(
          await page.locator('[data-background-demo-canvas]').getAttribute('data-bg-transitioning'),
          'true'
        );
        await page.waitForFunction(() => {
          const c = document.querySelector('[data-background-demo-canvas]');
          return c.dataset.bgDisplayedProgress === '0.500' && c.dataset.bgTransitioning === 'false';
        });
        await page.locator('[data-background-labels]').check();
        assert.match(
          await page.locator('[data-background-demo-status]').textContent(),
          /Structure labels enabled/
        );
        await page.screenshot({ path: join(artifacts, `${label}-morph-cell-labels.png`) });
        const restingImage = await page
          .locator('[data-background-demo-canvas]')
          .evaluate((c) => c.toDataURL());
        const restingState = await page
          .locator('[data-background-demo-canvas]')
          .evaluate((c) => ({ width: c.width, height: c.height, ...c.dataset }));
        const stirred = Number(
          await page.locator('[data-background-demo-canvas]').getAttribute('data-bg-interactions')
        );
        if (phone)
          await page.evaluate(() => {
            // A loaded/mobile browser can deliver frames slower than the simulation's dt cap.
            // Finite pointer effects must still settle on wall time, without extending the test.
            window.__backgroundAuditRaf = [
              window.requestAnimationFrame,
              window.cancelAnimationFrame,
            ];
            window.requestAnimationFrame = (callback) =>
              window.setTimeout(() => callback(performance.now()), 180);
            window.cancelAnimationFrame = (id) => window.clearTimeout(id);
          });
        await page.locator('[data-background-stir]').focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(
          (expected) =>
            Number(
              document.querySelector('[data-background-demo-canvas]').dataset.bgInteractions
            ) === expected,
          stirred + 1
        );
        await page.waitForTimeout(100);
        assert.ok(
          (await page.locator('[data-background-demo-canvas]').evaluate((c) => c.toDataURL())) !==
            restingImage,
          'stirring must visibly move particles, not just update its counter'
        );
        await page.waitForTimeout(1800);
        await still(page, true);
        const settledState = await page
          .locator('[data-background-demo-canvas]')
          .evaluate((c) => ({ width: c.width, height: c.height, ...c.dataset }));
        assert.ok(
          (await page.locator('[data-background-demo-canvas]').evaluate((c) => c.toDataURL())) ===
            restingImage,
          `a paused form must return exactly to its resting composition: ${JSON.stringify({ restingState, settledState })}`
        );
        if (phone)
          await page.evaluate(() => {
            [window.requestAnimationFrame, window.cancelAnimationFrame] =
              window.__backgroundAuditRaf;
            delete window.__backgroundAuditRaf;
          });
        await page.locator('[data-background-form="1"]').click();
        await page.waitForFunction(
          () =>
            document.querySelector('[data-background-demo-canvas]').dataset.bgTransitioning ===
            'false'
        );
        await page.waitForFunction(() =>
          document
            .querySelector('[data-background-demo-status]')
            .textContent.includes('standard-normal probability density')
        );
        await still(page, true);
        await page.screenshot({ path: join(artifacts, `${label}-morph-demo.png`) });
        for (const progress of [
          ...forms.map(([, p]) => p),
          ...[1 / 12, 3 / 12, 5 / 12, 7 / 12, 9 / 12, 11 / 12],
        ]) {
          await page.locator('[data-background-scrub]').evaluate((input, value) => {
            input.value = String(value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }, progress);
          const density = await page
            .locator('[data-background-demo-canvas]')
            .evaluate((c) => ({ ...c.dataset }));
          assert.equal(Number(density.bgAllocated), phone ? 1600 : 5000);
          assert.ok(
            Number(density.bgVisible) >= Number(density.bgAllocated) * 0.3,
            `particle participation must survive at progress ${progress}`
          );
          assert.ok(Math.abs(Number(density.bgDisplayedProgress) - progress) < 0.001);
          await page
            .locator('[data-background-demo-canvas]')
            .screenshot({ path: join(artifacts, `${label}-morph-pose-${progress}.png`) });
          if (forms.some(([, p]) => p === progress)) {
            for (const variant of ['dark', 'amber']) {
              await page.evaluate((v) => {
                window.__khcTheme.set(v === 'dark' ? 'dark' : 'light');
                window.__khcCrt.set(v === 'amber' ? 'amber' : 'off');
              }, variant);
              await page.locator('[data-background-demo-canvas]').screenshot({
                path: join(artifacts, `${label}-morph-pose-${progress}-${variant}.png`),
              });
            }
            await page.evaluate(() => {
              window.__khcTheme.set('light');
              window.__khcCrt.set('off');
            });
          }
        }
        // Both sides of every canonical stage boundary, in both directions.
        // Diagnostics are three-decimal; the actual range values remain exact.
        const boundaries = forms
          .flatMap(([, p]) => [p - 0.001, p + 0.001])
          .filter((p) => p >= 0 && p <= 1);
        for (const progress of [...boundaries, ...boundaries.toReversed()]) {
          await scrub(page, progress);
          assert.ok(
            Math.abs((await displayed(page)) - progress) < 0.0006,
            `boundary-side scrub ${progress}`
          );
          assert.equal(
            await page
              .locator('[data-background-demo-canvas]')
              .getAttribute('data-bg-transitioning'),
            'false'
          );
        }
        await completePlayback(page);
        await minimumQuality(page, label);
        await page.locator('[data-background-reset]').click();
        const resetImage = await page
          .locator('[data-background-demo-canvas]')
          .evaluate((c) => c.toDataURL());
        await scrub(page, 1);
        await page.locator('[data-background-stir]').click();
        await page.locator('[data-background-reset]').click();
        assert.equal(
          await displayed(page),
          0,
          'reset returns from a disturbed finale to canonical DNA'
        );
        assert.equal(
          await page.locator('[data-background-demo-canvas]').getAttribute('data-bg-transitioning'),
          'false'
        );
        assert.equal(
          await page.locator('[data-background-demo-canvas]').evaluate((c) => c.toDataURL()),
          resetImage,
          'reset restores exact unstirred geometry and decorative clock'
        );
        await page.locator('[data-background-form="0"]').click();
        await page.waitForTimeout(150);
        await page.locator('[data-background-play]').click();
        await page.waitForTimeout(200);
        await page.locator('[data-background-play]').click();
        await still(page, true);
        await page.locator('[data-background-reset]').click();
        assert.equal(
          await page
            .locator('[data-background-demo-canvas]')
            .getAttribute('data-bg-displayed-progress'),
          '0.000'
        );
        await page.locator('[data-background-close]').click();
        // Reverse scroll, then restore the selected scene through a hard reload.
        for (const [id, progress] of [...forms].reverse()) {
          await page.evaluate((stage) => {
            const rect = document
              .querySelector(`[data-background-stage="${stage}"]`)
              .getBoundingClientRect();
            scrollTo({
              top: rect.top + scrollY + rect.height / 2 - innerHeight / 2,
              behavior: 'instant',
            });
          }, id);
          await page.waitForFunction(
            (expected) =>
              Math.abs(
                Number(document.querySelector('[data-art-bg-canvas]').dataset.bgDisplayedProgress) -
                  expected
              ) < 0.002,
            progress
          );
        }
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await page.waitForFunction(
          () =>
            Number(document.querySelector('[data-art-bg-canvas]').dataset.bgDisplayedProgress) <
            0.01
        );
        await page.reload();
        await page.waitForFunction(
          () => document.querySelector('[data-art-bg-canvas]')?.dataset.bgScene === 'morph'
        );
        await page.waitForTimeout(1800);
        await page.evaluate(() => window.__khcTheme.set('dark'));
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(artifacts, `${label}-morph-dark.png`) });
        await page.evaluate(() => {
          window.__khcTheme.set('light');
          window.__khcCrt.set('amber');
        });
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(artifacts, `${label}-morph-crt.png`) });
        await page.evaluate(() => window.__khcCrt.set('off'));

        await choose(page, 'scene', 'off');
        assert.equal(await page.locator('[data-site-bg-canvas]').isVisible(), false);
        assert.equal(await page.locator('[data-art-bg-canvas]').isVisible(), false);
        assert.equal(await page.locator('[data-hero-canvas]').isVisible(), false);
        await page.reload();
        await page.waitForFunction(
          () => document.documentElement.dataset.backgroundScene === 'off'
        );
        assert.equal(await page.locator('[data-hero-canvas]').isVisible(), false);
        await choose(page, 'scene', 'cells');
        await page.waitForFunction(() => window.__khcCellsDebug.snapshot().running);
        await choose(page, 'motion', 'paused');
        assert.equal(await page.evaluate(() => window.__khcCellsDebug.snapshot().running), false);
        assert.equal(await page.evaluate(() => window.__khcHeroDebug.snapshot().running), false);
        await choose(page, 'scene', 'morph');
        await page.keyboard.press('Escape');
        // Exercise Astro client navigation rather than only hard reloads.
        await page.locator('a[href="/research/"]').filter({ visible: true }).first().click();
        await page.waitForURL('**/research/');
        await page.waitForFunction(
          () => document.querySelector('[data-art-bg-canvas]')?.hidden === false
        );
        await still(page);
        assert.equal(
          await page.evaluate(() => JSON.parse(localStorage.getItem('khc-background-v1')).motion),
          'paused'
        );
        await page.goBack();
        await page.waitForURL('**/?cell-audit=1');
        await page.waitForFunction(
          () => document.querySelector('[data-art-bg-canvas]')?.hidden === false
        );
        await still(page);
        await openAppearance(page);
        await page.locator('[data-background-explore]').click();
        await page.locator('[data-background-dialog]').waitFor({ state: 'visible' });
        await page.goForward();
        await page.waitForURL('**/research/');
        await page.waitForFunction(
          () => document.documentElement.dataset.backgroundExploring === 'false'
        );
        assert.equal(
          await page.locator('[data-background-dialog]').isVisible(),
          false,
          'history navigation disposes the open explorer'
        );
        await still(page);
        await page.goto('/lab/?cell-audit=1');
        await page.waitForFunction(() => window.__khcCellsDebug?.snapshot().running);
        assert.equal(await page.evaluate(() => window.__khcCellsDebug.snapshot().mode), 'lab');
        await page.goto('/?cell-audit=1');
        await page.waitForFunction(
          () => document.querySelector('[data-art-bg-canvas]')?.hidden === false
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.dataset.backgroundScene),
          'morph'
        );
        await still(page);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await choose(page, 'motion', 'ambient');
        await still(page);
        await page.locator('[data-background-explore]').click();
        await page.waitForTimeout(300);
        assert.equal(await page.locator('[data-background-play]').isDisabled(), true);
        await still(page, true);
        await page.locator('[data-background-step]').click();
        assert.equal(await displayed(page), 0.05, 'single step remains usable in reduced motion');
        await page.keyboard.press('Escape');
        await choose(page, 'scene', 'morph');
        await page.keyboard.press('Escape');
        await still(page);
        await openAppearance(page);
        await page.locator('[data-background-explore]').click();
        assert.equal(await page.locator('[data-background-play]').isDisabled(), true);
        assert.equal(await page.locator('[data-background-stir]').isDisabled(), true);
        await still(page, true);
        await page.locator('[data-background-form="0.5"]').click();
        assert.match(
          await page.locator('[data-background-demo-status]').textContent(),
          /cellular context/i
        );
        assert.equal(
          await page
            .locator('[data-background-demo-canvas]')
            .getAttribute('data-bg-displayed-progress'),
          '0.500'
        );
        assert.equal(
          await page.locator('[data-background-demo-canvas]').getAttribute('data-bg-transitioning'),
          'false'
        );
        for (const [id, progress] of forms) {
          await page.locator(`[data-background-form="${progress}"]`).click();
          assert.equal(
            await page.locator('[data-background-demo-canvas]').getAttribute('data-bg-stage'),
            id
          );
          assert.ok(
            Math.abs(
              Number(
                await page
                  .locator('[data-background-demo-canvas]')
                  .getAttribute('data-bg-displayed-progress')
              ) - progress
            ) < 0.001
          );
          assert.equal(
            await page
              .locator('[data-background-demo-canvas]')
              .getAttribute('data-bg-transitioning'),
            'false'
          );
        }
        await page.locator('[data-background-close]').click();
        if (phone) {
          await page.setViewportSize({ width: 320, height: 568 });
          await openAppearance(page);
          await page.locator('[data-background-explore]').click();
          await page.locator('[data-background-labels]').check();
          for (const [id, progress] of forms) {
            await page.locator(`[data-background-form="${progress}"]`).click();
            await page
              .locator('[data-background-demo-canvas]')
              .screenshot({ path: join(artifacts, `${name}-320-morph-${id}-labels.png`) });
          }
          await page.locator('[data-background-form="0"]').scrollIntoViewIfNeeded();
          await page.screenshot({ path: join(artifacts, `${name}-320-morph-controls.png`) });
          const rows = await page
            .locator('[data-background-form]')
            .evaluateAll(
              (buttons) => new Set(buttons.map((b) => b.getBoundingClientRect().top)).size
            );
          assert.ok(rows > 1, 'seven controls wrap on a 320px phone');
          assert.ok(
            await page
              .locator('[data-background-dialog]')
              .evaluate((e) => e.scrollWidth <= e.clientWidth)
          );
          await page.locator('[data-background-close]').click();
          await openAppearance(page);
          await page.locator('button[data-background-scene="cells"]').focus();
          await page.keyboard.press('ArrowRight');
          assert.equal(
            await page
              .locator('button[data-background-scene="morph"]')
              .getAttribute('aria-checked'),
            'true'
          );
          await page.locator('[data-background-explore]').click();
          assert.ok(
            await page
              .locator('[data-background-dialog]')
              .evaluate((e) => e.scrollWidth <= e.clientWidth),
            'compact dialog must not overflow horizontally'
          );
          await page.locator('[data-background-close]').click();
        }
        await context.close();
      }
      // Storage failure must leave working in-memory controls, not crash startup.
      const context = await browser.newContext({ baseURL });
      await context.addInitScript(() => {
        Storage.prototype.getItem = () => {
          throw new DOMException('Blocked', 'SecurityError');
        };
        Storage.prototype.setItem = () => {
          throw new DOMException('Blocked', 'SecurityError');
        };
      });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${name}-storage: ${e.message}`));
      await page.goto('/');
      await choose(page, 'scene', 'morph');
      assert.equal(await page.locator('[data-art-bg-canvas]').isVisible(), true);
      await choose(page, 'motion', 'paused');
      await page.keyboard.press('Escape');
      await page.locator('a[href="/research/"]').filter({ visible: true }).first().click();
      await page.waitForURL('**/research/');
      await page.waitForFunction(
        () => document.querySelector('[data-art-bg-canvas]')?.hidden === false
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.backgroundScene),
        'morph'
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.backgroundMotion),
        'paused'
      );
      await still(page);
      await context.close();
    } finally {
      await browser.close();
    }
  }
  assert.deepEqual(errors, [], 'browser runtime errors');
  console.log(`[background-ui] Passed. Screenshots: ${artifacts}`);
} finally {
  await previewServer?.stop();
}
