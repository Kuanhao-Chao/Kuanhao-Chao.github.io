import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { preview } from 'astro';

// Local mode uses a running server; --ci owns a preview of the already-built dist/.
const ci = process.argv.includes('--ci');
const port = Number(process.env.BACKGROUND_UI_PORT || 4337);

// The two engines are independent and the audit mostly waits on the real clock, so a full --ci
// run is one process per engine, each with its own preview port and screenshots. One engine
// failing never stops the other finishing, so a single run shows all the evidence, and the
// parent prints the one verdict line a gate should read. Naming an engine (or a port) runs a
// single process, which is what the focused switches below use.
if (ci && !process.env.BACKGROUND_UI_BROWSERS) {
  const engineList = ['chromium', 'webkit'];
  const runs = engineList.map(
    (engine, index) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--ci'], {
          env: {
            ...process.env,
            BACKGROUND_UI_BROWSERS: engine,
            BACKGROUND_UI_PORT: String(port + index * 10),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        for (const stream of [child.stdout, child.stderr])
          createInterface({ input: stream }).on('line', (line) =>
            console.log(`[${engine}] ${line}`)
          );
        child.on('error', () => resolve([engine, 1]));
        child.on('close', (code) => resolve([engine, code ?? 1]));
      })
  );
  const failed = (await Promise.all(runs)).filter(([, code]) => code !== 0).map(([e]) => e);
  console.log(
    failed.length
      ? `[background-ui] FAILED: ${failed.join(', ')}`
      : `[background-ui] Passed: ${engineList.join(' and ')}`
  );
  process.exit(failed.length ? 1 : 0);
}
const baseURL =
  process.env.BACKGROUND_UI_BASE_URL || (ci ? `http://127.0.0.1:${port}` : 'http://127.0.0.1:4321');
const previewServer = ci
  ? await preview({ root: process.cwd(), server: { host: '127.0.0.1', port } })
  : null;
const artifacts = await mkdtemp(join(tmpdir(), 'khc-background-'));
const engines = process.env.BACKGROUND_UI_BROWSERS?.split(',') || ['chromium', 'webkit'];
// Emulates a slower runner (Chromium only): BACKGROUND_UI_CPU_THROTTLE=8 gives CI-class frame
// costs on a fast machine, so a harness that only passes on a quick CPU fails here too.
const cpuThrottle = Number(process.env.BACKGROUND_UI_CPU_THROTTLE || 1);
assert.ok(
  Number.isFinite(cpuThrottle) && cpuThrottle >= 1,
  'BACKGROUND_UI_CPU_THROTTLE must be a number >= 1'
);
async function throttleCpu(context, page, engine) {
  if (cpuThrottle === 1 || engine !== 'chromium') return;
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
}
// Emulates a compositor that hands out frames slowly. Measured on the CI runner (a CI probe,
// run 37104648024): headless WebKit on Linux delivers requestAnimationFrame at 1-8 Hz, where a
// laptop gives 30-120, and the renderer's own cost there is only 4-11 ms, so it is the
// compositor, not the page. BACKGROUND_UI_SLOW_FRAMES=250 replaces requestAnimationFrame with a
// 250 ms timer in every page this audit opens (the fake-clock scenarios excepted), and delivers
// matchMedia, ResizeObserver and IntersectionObserver callbacks as late. An assertion that quietly assumes a frame rate, such as
// "more than 5 ticks in 1.2 s", or that a media change has landed after a fixed sleep, fails here.
const slowFrames = Number(process.env.BACKGROUND_UI_SLOW_FRAMES || 0);
assert.ok(
  Number.isFinite(slowFrames) && slowFrames >= 0,
  'BACKGROUND_UI_SLOW_FRAMES must be a number of milliseconds >= 0'
);
async function launch(name) {
  const browser = await { chromium, webkit }[name].launch();
  browser.newContextPlain = browser.newContext.bind(browser);
  if (slowFrames > 0)
    browser.newContext = async (options) => {
      const context = await browser.newContextPlain(options);
      await context.addInitScript((delay) => {
        window.requestAnimationFrame = (callback) =>
          window.setTimeout(() => callback(performance.now()), delay);
        window.cancelAnimationFrame = (id) => window.clearTimeout(id);
        // Media-query change events are delivered on the rendering cycle, so a slow
        // compositor delivers them late too: a fixed sleep after emulateMedia loses that race.
        // So are ResizeObserver and IntersectionObserver callbacks.
        for (const name of ['ResizeObserver', 'IntersectionObserver']) {
          const Native = window[name];
          window[name] = class extends Native {
            constructor(callback, ...rest) {
              super(
                (entries, observer) => {
                  window.setTimeout(() => callback(entries, observer), delay);
                },
                ...rest
              );
            }
          };
        }
        const add = MediaQueryList.prototype.addEventListener;
        MediaQueryList.prototype.addEventListener = function (type, listener, options) {
          if (type !== 'change' || typeof listener !== 'function')
            return add.call(this, type, listener, options);
          return add.call(
            this,
            type,
            (event) => window.setTimeout(() => listener.call(this, event), delay),
            options
          );
        };
      }, slowFrames);
      return context;
    };
  return browser;
}
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
// "It is animating" is a condition, not a rate. A fixed wait followed by a tick count asserts a
// minimum frame rate, which says something about the runner (Linux WebKit's software rasteriser
// ticks far more slowly than a laptop) and nothing about the page. Wait for the condition, and
// name the state if it never holds.
async function drawn(page, { atLeast, more, demo = false, within = 20_000 }) {
  const selector = demo ? '[data-background-demo-canvas]' : '[data-art-bg-canvas]';
  const target = atLeast ?? (await frames(page, demo)) + more;
  try {
    await page.waitForFunction(
      ([canvas, ticks]) => Number(document.querySelector(canvas)?.dataset.bgTicks || 0) >= ticks,
      [selector, target],
      { timeout: within, polling: 100 }
    );
  } catch {
    const state = await page.locator(selector).evaluate((canvas) => ({
      ...canvas.dataset,
      hidden: document.hidden,
      selectedChars: getSelection()?.toString().length ?? 0,
    }));
    throw new Error(
      `${selector} reached fewer than ${target} ticks in ${within}ms: ${JSON.stringify(state)}`
    );
  }
}
async function luminousChecks(browser, name) {
  const failures = [];
  for (const width of [320, 360, 390, 414, 768, 1440]) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width, height: 900 },
      hasTouch: width < 768,
      isMobile: width < 768,
    });
    try {
      await context.addInitScript(() => {
        localStorage.setItem(
          'khc-background-v1',
          JSON.stringify({ scene: 'morph', motion: 'ambient' })
        );
        const proto = CanvasRenderingContext2D.prototype;
        const begin = proto.beginPath,
          move = proto.moveTo,
          line = proto.lineTo,
          stroke = proto.stroke,
          clear = proto.clearRect,
          image = proto.drawImage;
        proto.beginPath = function (...args) {
          this.__xs = [];
          return begin.apply(this, args);
        };
        for (const [key, original] of [
          ['moveTo', move],
          ['lineTo', line],
        ])
          proto[key] = function (x, y) {
            this.__xs?.push(x);
            return original.call(this, x, y);
          };
        proto.clearRect = function (...args) {
          this.__bounds = [Infinity, -Infinity];
          this.__lightAlpha = 0;
          return clear.apply(this, args);
        };
        proto.drawImage = function (...args) {
          if (this.canvas.matches('[data-art-bg-canvas]') && args[0]?.width === 32)
            this.__lightAlpha += this.globalAlpha;
          return image.apply(this, args);
        };
        proto.stroke = function (...args) {
          if (this.canvas.matches('[data-hero-canvas]')) this.__heroColor = this.strokeStyle;
          if (this.canvas.matches('[data-art-bg-canvas]') && this.__bounds)
            for (const x of this.__xs || []) {
              this.__bounds[0] = Math.min(this.__bounds[0], x);
              this.__bounds[1] = Math.max(this.__bounds[1], x);
            }
          return stroke.apply(this, args);
        };
      });
      const page = await context.newPage();
      await page.goto('/?cell-audit=1');
      await page.waitForTimeout(1800);
      await page.screenshot({ path: join(artifacts, `${name}-fit-${width}.png`) });
      const measured = await page.locator('[data-art-bg-canvas]').evaluate((c) => ({
        bounds: c.getContext('2d').__bounds,
        lightAlpha: c.getContext('2d').__lightAlpha,
        ...c.dataset,
      }));
      console.log(`[background-ui] fit ${name} ${width}: ${JSON.stringify(measured)}`);
      if (!(measured.bounds[0] >= 16 && measured.bounds[1] <= width - 16))
        failures.push(`${width}px DNA stroke outside 16px inset: ${measured.bounds}`);
      if (!(
        Number(measured.bgLife) === 1 &&
        Number(measured.bgGlow) > 0 &&
        Number(measured.bgBokeh) > 0
      ))
        failures.push(`${width}px missing active life/glow/bokeh`);
      await assertReadingClearance(page);
      if (width === 390 || width === 1440) {
        await choose(page, 'motion', 'calm');
        await page.waitForTimeout(150);
        const calm = await page
          .locator('[data-art-bg-canvas]')
          .evaluate((c) => ({ lightAlpha: c.getContext('2d').__lightAlpha, ...c.dataset }));
        if (!(
          Number(calm.bgLife) === 0.45 &&
          Math.abs(calm.lightAlpha / measured.lightAlpha - 0.45) < 0.01
        ))
          failures.push(`${width}px Calm amplitude not 0.45`);
        await choose(page, 'motion', 'ambient');
        await choose(page, 'scene', 'cells');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(artifacts, `${name}-cells-${width}.png`) });
        console.log(
          `[background-ui] cells ${name} ${width}: ${JSON.stringify(await page.evaluate(() => window.__khcCellsDebug.snapshot().timings))}`
        );
        await page.evaluate(() => window.__khcCrt.set('amber'));
        await page.waitForTimeout(150);
        console.log(
          `[background-ui] hero palette ${name} ${width}: ${JSON.stringify(
            await page.evaluate(() => {
              const style = getComputedStyle(document.documentElement);
              return {
                ink: style.getPropertyValue('--color-ink').trim(),
                heroInk: style.getPropertyValue('--rgb-ink').trim(),
                accent: style.getPropertyValue('--color-accent').trim(),
                heroAccent: style.getPropertyValue('--rgb-accent').trim(),
              };
            })
          )}`
        );
        const heroColor = await page
          .locator('[data-hero-canvas]')
          .evaluate((c) => c.getContext('2d').__heroColor);
        console.log(`[background-ui] hero painted amber: ${heroColor}`);
        const rgb = (heroColor || '').match(/[\d.]+/g)?.map(Number) || [];
        if (!(rgb[0] === 255 && rgb[1] >= 176 && rgb[1] <= 204 && rgb[2] >= 0 && rgb[2] <= 51))
          failures.push(`${width}px Hero paints stale CRT ink: ${heroColor}`);
        await page.evaluate(() => window.__khcCrt.set('off'));
        await choose(page, 'scene', 'morph');
        await page.keyboard.press('Escape');
        if (width === 390) {
          await page.setViewportSize({ width: 320, height: 700 });
          for (let expanded = 0; expanded < 2; expanded++) {
            await page.locator('[data-terminal-min]').evaluate((button) => button.click());
            await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
            await page.waitForTimeout(650);
            const state = await page
              .locator('[data-art-bg-canvas]')
              .evaluate((c) => ({ bounds: c.getContext('2d').__bounds, ...c.dataset }));
            assert.ok(
              state.bounds[0] >= 16 && state.bounds[1] <= 304,
              'fit survives resized and expanded/collapsed terminal'
            );
            const centers = await page.locator('[data-background-stage]').evaluateAll((elements) =>
              elements.map((e) => {
                const r = e.getBoundingClientRect();
                return r.top + r.height / 2;
              })
            );
            assert.ok(
              centers.every((center, i) => !i || center > centers[i - 1]),
              'terminal resizing keeps chapters ordered'
            );
            await assertReadingClearance(page);
          }
        }
      }
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(failures, [], 'fitted luminous DNA');
  console.log(`[background-ui] ${name} luminous fit: 6 widths passed`);
}
async function assertReadingClearance(page) {
  const measured = await page.evaluate(() => {
    const canvas = document.querySelector('[data-art-bg-canvas]');
    const ctx = canvas.getContext('2d');
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const ratio = canvas.width / canvas.clientWidth;
    let max = 0,
      count = 0;
    for (const element of document.querySelectorAll(
      'main h1, main h2, main p, main [data-terminal]'
    )) {
      const r = element.getBoundingClientRect();
      for (
        let y = Math.max(0, Math.ceil(r.top + 2));
        y < Math.min(innerHeight, r.bottom - 2);
        y += 5
      )
        for (
          let x = Math.max(0, Math.ceil(r.left + 2));
          x < Math.min(innerWidth, r.right - 2);
          x += 5
        ) {
          max = Math.max(
            max,
            pixels[(Math.floor(y * ratio) * canvas.width + Math.floor(x * ratio)) * 4 + 3]
          );
          count++;
        }
    }
    return { max, count };
  });
  assert.ok(measured.count > 100, 'sample actual visible reading areas');
  // The CSS-resolution mask is scaled to the DPR backing store: permit one
  // 8-bit alpha rounding unit, not a visible light pass over reading material.
  assert.ok(measured.max <= 1, `reading-clearance mask alpha ${measured.max}/255`);
}
async function assertEffects(
  page,
  { demo = false, amount = 1, stage = 'dna', phone = false } = {}
) {
  const state = await page
    .locator(demo ? '[data-background-demo-canvas]' : '[data-art-bg-canvas]')
    .evaluate((c) => ({ ...c.dataset }));
  assert.equal(Number(state.bgLife), amount, 'life amplitude follows accessibility/motion');
  for (const [key, cap] of [
    ['bgGlow', phone ? 100 : 250],
    ['bgBokeh', phone ? 12 : 28],
    ['bgStreaks', Math.floor(Number(state.bgAllocated) / 3)],
    ['bgPackets', phone ? 24 : 48],
    ['bgRain', phone ? 32 : 64],
  ]) {
    assert.ok(
      Number(state[key]) >= 0 && Number(state[key]) <= cap,
      `${key} has a bounded drawn count`
    );
    if (!amount) assert.equal(Number(state[key]), 0, `${key} is disabled`);
  }
  if (amount) {
    assert.ok(Number(state.bgGlow) > 0 && Number(state.bgBokeh) > 0, 'active frame has lights');
    if (stage === 'network') assert.ok(Number(state.bgPackets) > 0, 'network has edge packets');
    if (stage === 'distribution') assert.ok(Number(state.bgRain) > 0, 'density has quantile rain');
  }
  return state;
}
async function effectLifecycleChecks(page, phone) {
  const canvas = page.locator('[data-background-demo-canvas]');
  await scrub(page, 0);
  const first = await page.locator(`[data-background-form="${1 / 6}"]`).evaluate((button) => {
    button.click();
    return Number(document.querySelector('[data-background-demo-canvas]').dataset.bgStreaks);
  });
  assert.equal(first, 0, 'starting a form tween never teleports a streak');
  await page.waitForFunction(
    () => Number(document.querySelector('[data-background-demo-canvas]').dataset.bgStreaks) > 0
  );
  const transition = await assertEffects(page, { demo: true, phone });
  console.log(
    `[background-ui] transition ${phone ? 'phone' : 'desktop'} streaks=${transition.bgStreaks} renderMs=${transition.bgRenderMs} quality=${transition.bgQuality}`
  );
  await scrub(page, 1);
  assert.equal(
    await canvas.getAttribute('data-bg-streaks'),
    '0',
    'discontinuous scrub clears history'
  );
  await assertEffects(page, { demo: true, phone, stage: 'distribution' });
  await scrub(page, 5 / 6);
  await assertEffects(page, { demo: true, phone, stage: 'network' });
  const lightImage = await canvas.evaluate((c) => c.toDataURL());
  const initial = Number(await canvas.getAttribute('data-bg-palette'));
  await page.evaluate(() => window.__khcTheme.set('dark'));
  await page.waitForFunction(
    (previous) =>
      Number(document.querySelector('[data-background-demo-canvas]').dataset.bgPalette) > previous,
    initial
  );
  assert.equal(await canvas.getAttribute('data-bg-light-blend'), 'lighter');
  assert.notEqual(
    await canvas.evaluate((c) => c.toDataURL()),
    lightImage,
    'palette repaint changes actual pixels'
  );
  const dark = Number(await canvas.getAttribute('data-bg-palette'));
  await page.locator('[data-background-play]').click();
  await page.waitForTimeout(250);
  assert.equal(
    Number(await canvas.getAttribute('data-bg-palette')),
    dark,
    'animation frames reuse cached sprites'
  );
  await page.evaluate(() => window.__khcCrt.set('amber'));
  await page.waitForFunction(
    (previous) =>
      Number(document.querySelector('[data-background-demo-canvas]').dataset.bgPalette) > previous,
    dark
  );
  assert.equal(await canvas.getAttribute('data-bg-warm-ink'), '#ffb000');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The change reaches the page as a media-query event, which WebKit delivers on its rendering
  // cycle (1-8 Hz on the CI runner), so wait for the effect itself rather than a fixed 100 ms.
  await page.waitForFunction(
    () => document.querySelector('[data-background-demo-canvas]').dataset.bgLife === '0',
    undefined,
    { timeout: 20_000, polling: 100 }
  );
  await assertEffects(page, { demo: true, phone, amount: 0 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // matchMedia lags the emulation by a rendering cycle too, and the draw forced below reads it.
  await page.waitForFunction(
    () => !matchMedia('(prefers-reduced-motion: reduce)').matches,
    undefined,
    {
      timeout: 20_000,
      polling: 100,
    }
  );
  await page.evaluate(() => {
    window.__khcCrt.set('off');
    window.__khcTheme.set('light');
  });
  await assertEffects(page, { demo: true, phone });
  const hidden = await page.evaluate(() => {
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      return { ...document.querySelector('[data-background-demo-canvas]').dataset };
    } finally {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });
  assert.equal(Number(hidden.bgLife), 0, 'hidden-document suspension repaints zero life');
  assert.equal(Number(hidden.bgGlow), 0, 'hidden-document suspension removes light effects');
  await page.locator('[data-background-reset]').click();
  assert.equal(
    await canvas.getAttribute('data-bg-streaks'),
    '0',
    'reset clears transition history'
  );
  await scrub(page, 0);
  await page.evaluate(() => {
    const saved = {
      raf: requestAnimationFrame,
      cancel: cancelAnimationFrame,
      now: performance.now.bind(performance),
    };
    let callback = null,
      time = saved.now(),
      cost = 0;
    window.requestAnimationFrame = (next) => {
      callback = next;
      return -1;
    };
    window.cancelAnimationFrame = () => {
      callback = null;
    };
    try {
      document.querySelector('[data-background-play]').click();
      performance.now = () => saved.now() + (cost += 40);
      for (let i = 0; i < 300 && callback; i++) {
        const frame = callback;
        callback = null;
        frame((time += 100));
      }
    } finally {
      window.requestAnimationFrame = saved.raf;
      window.cancelAnimationFrame = saved.cancel;
      performance.now = saved.now;
    }
  });
  assert.equal(
    await canvas.getAttribute('data-bg-fallback'),
    'static',
    'exercise measured-cost static fallback'
  );
  await assertEffects(page, { demo: true, phone, amount: 0 });
  await page.locator('[data-background-close]').click();
  await openAppearance(page);
  await page.locator('[data-background-explore]').click();
  await page.locator('[data-background-dialog]').waitFor({ state: 'visible' });
  await scrub(page, 0);
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
// Virtual-time scenarios (the 60-second story, the minimum-quality floor) run on their OWN page,
// whose timers, requestAnimationFrame and performance.now are Playwright's fake clock, installed
// BEFORE navigation so the explorer, the ambient renderer and the reading mask share one time
// base. They used to borrow the profile's page behind a single-slot requestAnimationFrame mock
// whose cancelAnimationFrame cleared the slot for ANY id. The controller legitimately calls
// cancelAnimationFrame(0) for the suspended ambient renderer on every selectionchange while the
// dialog is open, so a late selectionchange from the preceding tap erased the explorer's pending
// frame ("Playback must schedule the next frame") whenever it landed between two advances: only
// on a slower runner. The mock also mixed the real performance.now with its virtual clock, which
// moved the story by however long the harness took, and let real frame cost steer adaptive
// quality, so the outcome depended on CPU speed three separate ways.
async function openClockedExplorer(browser, engine, phone) {
  const context = await browser.newContextPlain({
    baseURL,
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    hasTouch: phone,
    isMobile: phone,
    deviceScaleFactor: phone ? 3 : 1,
  });
  try {
    await context.addInitScript(() => {
      localStorage.setItem(
        'khc-background-v1',
        JSON.stringify({ scene: 'morph', motion: 'ambient' })
      );
    });
    const page = await context.newPage();
    page.on('pageerror', (e) =>
      errors.push(`clocked ${engine}-${phone ? 'phone' : 'desktop'}: ${e.message}`)
    );
    await throttleCpu(context, page, engine);
    // Installed before navigation so nothing in the page ever holds a real timer. Time still
    // flows naturally until pauseAt, which lets the page hydrate and open the explorer normally.
    await page.clock.install();
    await page.goto('/');
    await page.waitForFunction(
      () => document.querySelector('[data-art-bg-canvas]')?.dataset.bgScene === 'morph'
    );
    await openAppearance(page);
    await page.locator('[data-background-explore]').click();
    await page.locator('[data-background-dialog]').waitFor({ state: 'visible' });
    // The explorer renderer is created after a dynamic import, i.e. AFTER the dialog is visible,
    // and only then does the controller decide it is playing. Wait for it (it draws once on
    // creation) before touching Play or Reset: a click that lands first toggles a state that has
    // not been decided yet, and the import then flips it back.
    await page.waitForFunction(
      () => document.querySelector('[data-background-demo-canvas]')?.dataset.bgFrames
    );
    // Freeze. From here only the test moves the page, and a frame costs 0ms of fake time.
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 2000);
    return { context, page };
  } catch (error) {
    await context.close();
    throw error;
  }
}
// A synthetic click: Playwright's actionability waits would otherwise be racing a frozen clock.
const pressDemo = (page, control) =>
  page.locator(`[data-background-${control}]`).evaluate((button) => button.click());
const demoState = (page) =>
  page
    .locator('[data-background-demo-canvas]')
    .evaluate((canvas) => ({ ...canvas.dataset, hidden: document.hidden }));
// One browser frame after `ms` of fake time. The explorer must draw it: a lost frame loop would
// leave the story standing still and every later pose silently wrong, so name the state if so.
async function frameAfter(page, ms, what) {
  const before = await frames(page, true);
  await page.clock.fastForward(ms);
  if ((await frames(page, true)) <= before)
    throw new Error(
      `the explorer drew no frame during ${what}: ${JSON.stringify(await demoState(page))}`
    );
}
// The explorer opens playing. Make "paused at canonical DNA with the clock frozen" explicit
// instead of depending on that default.
async function pausedAtDna(page) {
  const label = () => page.locator('[data-background-play]').textContent();
  if (/pause/i.test((await label()) || '')) await pressDemo(page, 'play');
  assert.match((await label()) || '', /play/i, 'the explorer is paused before the scenario starts');
  await pressDemo(page, 'reset');
  assert.equal(await displayed(page), 0, 'reset returns the explorer to canonical DNA');
}
async function completePlayback(browser, engine, phone) {
  const label = `${engine}-${phone ? 'phone' : 'desktop'}`;
  const { context, page } = await openClockedExplorer(browser, engine, phone);
  try {
    const near = (actual, expected, tolerance, what) =>
      assert.ok(
        Math.abs(actual - expected) < tolerance,
        `${what}: displayed ${actual}, expected ${expected} ± ${tolerance} (${label})`
      );
    await pausedAtDna(page);
    await pressDemo(page, 'play');
    for (let leg = 0; leg < 12; leg++) {
      const from = leg < 6 ? leg / 6 : (12 - leg) / 6;
      const to = leg < 6 ? (leg + 1) / 6 : (11 - leg) / 6;
      await frameAfter(page, 250, `leg ${leg} arrival`);
      near(await displayed(page), from, 0.001, `playback arrival ${leg * 5}s`);
      if (leg % 5 === 0) {
        // The explorer rewrites its status text as the story moves, a text change fires
        // selectionchange, and the page answers by re-evaluating the AMBIENT renderer. That
        // must never stop the explorer's own frame loop.
        await page.evaluate(() => document.dispatchEvent(new Event('selectionchange')));
      }
      await frameAfter(page, 1500, `leg ${leg} hold`);
      near(await displayed(page), from, 0.001, `two-second hold after ${leg * 5}s`);
      await frameAfter(page, 1750, `leg ${leg} transition`);
      near(
        await displayed(page),
        (from + to) / 2,
        0.002,
        `adjacent playback midpoint on leg ${leg}`
      );
      if (leg === 8) {
        await pressDemo(page, 'play');
        const paused = await displayed(page);
        // Time passing while paused must not move the story.
        await page.clock.fastForward(500);
        near(await displayed(page), paused, 0.001, 'a paused story stands still');
        await pressDemo(page, 'play');
        near(await displayed(page), paused, 0.001, 'reverse playback resumes without a jump');
      }
      await frameAfter(page, 1500, `leg ${leg} approach`);
    }
    await frameAfter(page, 250, 'loop end');
    near(await displayed(page), 0, 0.001, '60-second loop returns to DNA');
    await pressDemo(page, 'play');
    console.log(`[background-ui] ${label} playback: 12 legs, ${await frames(page, true)} frames`);
  } finally {
    await context.close();
  }
}
async function minimumQuality(browser, engine, phone, label) {
  const { context, page } = await openClockedExplorer(browser, engine, phone);
  try {
    await pausedAtDna(page);
    await page.evaluate(() => {
      // Inject a measured 11ms of cost per frame on top of the fake clock, not a real busy loop:
      // it drives the existing adaptive-quality branch without the separate >24ms static fallback.
      const fake = performance.now.bind(performance);
      let cost = 0;
      performance.now = () => fake() + (cost += 11);
    });
    await pressDemo(page, 'play');
    const start = await frames(page, true);
    for (let i = 0; i < 110; i++) await page.clock.fastForward(100);
    assert.ok(
      (await frames(page, true)) - start >= 110,
      `the explorer drew every adaptive-quality frame: ${JSON.stringify(await demoState(page))}`
    );
    await pressDemo(page, 'play');
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
    await context.close();
  }
}
try {
  for (const name of engines) {
    const browser = await launch(name);
    try {
      if (process.env.BACKGROUND_UI_EFFECT_ONLY === '1') {
        const context = await browser.newContext({
          baseURL,
          viewport: { width: 1440, height: 1000 },
        });
        try {
          const page = await context.newPage();
          await page.goto('/?cell-audit=1');
          await choose(page, 'scene', 'morph');
          await page.locator('[data-background-explore]').click();
          await page.locator('[data-background-dialog]').waitFor({ state: 'visible' });
          await effectLifecycleChecks(page, false);
        } finally {
          await context.close();
        }
        continue;
      }
      if (process.env.BACKGROUND_UI_CLOCK_ONLY === '1') {
        // Just the two virtual-time scenarios: the fast loop for harness work.
        for (const phone of process.env.BACKGROUND_UI_PHONE_ONLY === '1' ? [true] : [false, true]) {
          const label = `${name}-${phone ? 'phone' : 'desktop'}`;
          await completePlayback(browser, name, phone);
          await minimumQuality(browser, name, phone, label);
          console.log(`[background-ui] ${label} virtual-time scenarios passed`);
        }
        continue;
      }
      await luminousChecks(browser, name);
      if (process.env.BACKGROUND_UI_LIGHT_ONLY === '1') continue;
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
        await throttleCpu(context, page, name);
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
        await drawn(page, { atLeast: 6 });
        await page.screenshot({ path: join(artifacts, `${label}-morph-switch.png`) });
        await choose(page, 'motion', 'paused');
        await still(page);
        await assertEffects(page, { amount: 0, phone });
        await choose(page, 'motion', 'calm');
        await drawn(page, { more: 1 });
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
        await drawn(page, { atLeast: 6 });
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
          await assertEffects(page, { stage, phone });
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
        await effectLifecycleChecks(page, phone);
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
        // Wait for the tween to be genuinely mid-flight (a condition, not a fixed 150ms that a
        // slow runner may not have rendered a single frame of).
        await page.waitForFunction(() => {
          const shown = Number(
            document.querySelector('[data-background-demo-canvas]').dataset.bgDisplayedProgress
          );
          return shown > 1 / 6 + 0.05 + 0.01 && shown < 0.99;
        });
        // Read, act and read again inside ONE synchronous page task. An awaited Playwright
        // click takes tens of milliseconds on a loaded runner, and a running tween moves
        // 0.015 of progress in about 50ms, so reading across that gap measured the runner.
        const interrupt = await page.locator('[data-background-form="0"]').evaluate((button) => {
          const canvas = document.querySelector('[data-background-demo-canvas]');
          const read = () => Number(canvas.dataset.bgDisplayedProgress);
          const before = read();
          button.click();
          return { before, after: read() };
        });
        assert.ok(
          Math.abs(interrupt.after - interrupt.before) < 0.015,
          `interrupt starts from displayed pose: ${JSON.stringify(interrupt)}`
        );
        const resume = await page.locator('[data-background-play]').evaluate((button) => {
          const canvas = document.querySelector('[data-background-demo-canvas]');
          const read = () => Number(canvas.dataset.bgDisplayedProgress);
          const before = read();
          button.click();
          return { before, after: read() };
        });
        assert.ok(
          Math.abs(resume.after - resume.before) < 0.015,
          `resume preserves displayed progress: ${JSON.stringify(resume)}`
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
        await completePlayback(browser, name, phone);
        await minimumQuality(browser, name, phone, label);
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
        // The explorer reads matchMedia when it opens; let the emulation take effect first.
        await page.waitForFunction(
          () => matchMedia('(prefers-reduced-motion: reduce)').matches,
          undefined,
          {
            timeout: 20_000,
            polling: 100,
          }
        );
        await choose(page, 'motion', 'ambient');
        await still(page);
        await page.locator('[data-background-explore]').click();
        await page.waitForTimeout(300);
        assert.equal(await page.locator('[data-background-play]').isDisabled(), true);
        await still(page, true);
        await assertEffects(page, { demo: true, amount: 0, phone });
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
