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
// The flag initBackground writes once this release's default has been applied (see
// BACKGROUND_DEFAULT_KEY in src/lib/backgroundModel.ts); spelled out here, not imported, so the
// audit stays independent of the production constant it checks.
const DEFAULT_FLAG = 'sequence-function-1';
// A returning visitor who chose Cells after this release: the flag makes the choice stick instead of
// being moved to the new default. Conditional, so a page that reloads mid-test keeps what it chose.
const seedChosenCells = (flag) => {
  if (localStorage.getItem('khc-background-v1') !== null) return;
  localStorage.setItem('khc-background-v1', JSON.stringify({ scene: 'cells', motion: 'ambient' }));
  localStorage.setItem('khc-background-default', flag);
};
// Independent approved order and exact canonical values, not read from production metadata.
const forms = [
  ['dna', 0],
  ['rna', 1 / 6],
  ['protein', 1 / 3],
  ['cell', 0.5],
  ['signal', 2 / 3],
  ['network', 5 / 6],
  ['attention', 1],
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
// "Not drawing" is a quiet window, not an offset from now. A pause reaches the renderer through an
// event the engine delivers on its own cycle (headless WebKit on the CI runner: two or three ticks
// late), so wait for the ticks to stop and then require the whole window to stay quiet. A renderer
// that never stops still fails, after `within`.
async function still(page, demo = false, { quiet = 400, within = 6_000 } = {}) {
  let last = await frames(page, demo);
  let since = Date.now();
  const deadline = since + within;
  while (Date.now() - since < quiet) {
    await page.waitForTimeout(50);
    const now = await frames(page, demo);
    if (now !== last) {
      last = now;
      since = Date.now();
    }
    if (Date.now() > deadline) {
      // Name the state. A renderer that never goes quiet is either not paused (the button says
      // so) or paused and drawing anyway, and those are different defects.
      const state = await page
        .locator(demo ? '[data-background-demo-canvas]' : '[data-art-bg-canvas]')
        .evaluate((c) => ({
          ...c.dataset,
          playLabel: document.querySelector('[data-background-play]')?.textContent,
          hidden: document.hidden,
          ambientTicks: document.querySelector('[data-art-bg-canvas]')?.dataset.bgTicks,
        }));
      assert.fail(
        `paused renderer must not continue drawing: still ticking after ${within}ms: ${JSON.stringify(state)}`
      );
    }
  }
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
        // The next frame carries the new amplitude; wait for it instead of sleeping 150 ms. On a
        // timeout the stale read below fails the check with its usual message.
        await page
          .waitForFunction(
            () => document.querySelector('[data-art-bg-canvas]').dataset.bgLife === '0.45',
            undefined,
            { timeout: 20_000, polling: 100 }
          )
          .catch(() => {});
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
// Reading clearance, split by what sits in front of the art. Objects (the terminal) stay fully
// cleared. Text on the homepage lets through at most the veil: the same number the CSS token holds
// and the mask publishes as data-bg-veil. Everywhere else the veil is 0 and text is cleared as before.
function clearanceCap(veil) {
  // One 8-bit unit for the mask's scaling to the backing store, one for the feathered edge's rounding.
  return veil > 0 ? Math.ceil(veil * 255) + 2 : 1;
}
async function sampleArtAlpha(page, selector, { within } = {}) {
  return page.evaluate(
    ([selector, within]) => {
      const canvas = document.querySelector('[data-art-bg-canvas]');
      const ctx = canvas.getContext('2d');
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const ratio = canvas.width / canvas.clientWidth;
      const box = within
        ? {
            left: innerWidth / 2 - within[0],
            right: innerWidth / 2 + within[0],
            top: innerHeight / 2 - within[1],
            bottom: innerHeight / 2 + within[1],
          }
        : { left: 0, right: innerWidth, top: 0, bottom: innerHeight };
      let max = 0,
        count = 0,
        lit = 0;
      for (const element of document.querySelectorAll(selector)) {
        const r = element.getBoundingClientRect();
        const step = within ? 2 : 5;
        for (
          let y = Math.max(box.top, Math.ceil(r.top + 2));
          y < Math.min(box.bottom, r.bottom - 2);
          y += step
        )
          for (
            let x = Math.max(box.left, Math.ceil(r.left + 2));
            x < Math.min(box.right, r.right - 2);
            x += step
          ) {
            const alpha =
              pixels[(Math.floor(y * ratio) * canvas.width + Math.floor(x * ratio)) * 4 + 3];
            max = Math.max(max, alpha);
            if (alpha > 3) lit++;
            count++;
          }
      }
      return { max, count, lit, veil: Number(canvas.dataset.bgVeil) };
    },
    [selector, within ?? null]
  );
}
async function assertReadingClearance(page) {
  const text = await sampleArtAlpha(page, 'main h1, main h2, main p');
  const objects = await sampleArtAlpha(page, 'main [data-terminal]');
  assert.ok(text.count > 100, 'sample actual visible reading areas');
  // The terminal can be below the fold in a short or narrow profile; veilChecks samples a real
  // object (the software logos) with the art behind it, so an empty sample here proves nothing wrong.
  // The CSS-resolution mask is scaled to the DPR backing store: permit one
  // 8-bit alpha rounding unit, not a visible light pass over an object.
  assert.ok(objects.max <= 1, `terminal clearance mask alpha ${objects.max}/255`);
  assert.ok(
    text.max <= clearanceCap(text.veil),
    `reading-clearance mask alpha ${text.max}/255 exceeds the veil cap ${clearanceCap(text.veil)} (veil ${text.veil})`
  );
}
// The reading veil, on its own fresh pages. The homepage lets a fixed fraction of the art through
// text and translucent cards; a veiled card is translucent in CSS and so is NOT also erased by the
// mask (that would attenuate twice); objects stay cleared; other pages are unchanged; Cells and Off
// keep opaque cards. Each probe puts one element at the viewport centre, where the art always is
// on the homepage after the hero, and samples only the central box the art can reach.
async function veilChecks(browser, name) {
  for (const phone of [false, true]) {
    const label = `${name}-${phone ? 'phone' : 'desktop'}`;
    const margins = {};
    const context = await browser.newContext({
      baseURL,
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      hasTouch: phone,
      isMobile: phone,
      deviceScaleFactor: phone ? 2 : 1,
    });
    try {
      await context.addInitScript(() => {
        localStorage.setItem(
          'khc-background-v1',
          JSON.stringify({ scene: 'morph', motion: 'ambient' })
        );
      });
      const page = await context.newPage();
      await throttleCpu(context, page, name);
      page.on('pageerror', (e) => errors.push(`${label}-veil: ${e.message}`));
      await page.goto('/?cell-audit=1');
      await page.waitForFunction(
        () => document.querySelector('[data-art-bg-canvas]')?.dataset.bgSoft !== undefined,
        undefined,
        { timeout: 30_000 }
      );
      await drawn(page, { atLeast: 3 });
      const state = await page.evaluate(() => {
        const canvas = document.querySelector('[data-art-bg-canvas]');
        const root = getComputedStyle(document.documentElement);
        const fill = (selector) => {
          const colour = getComputedStyle(document.querySelector(selector)).backgroundColor;
          const match = /rgba?\(([^)]*)\)|color\(srgb ([^)]*)\)/.exec(colour);
          const parts = (match?.[1] ?? match?.[2] ?? '').split(/[ ,/]+/).filter(Boolean);
          return parts.length > 3 ? Number(parts[3]) : 1;
        };
        return {
          token: root.getPropertyValue('--art-through').trim(),
          veil: canvas.dataset.bgVeil,
          soft: Number(canvas.dataset.bgSoft),
          solid: Number(canvas.dataset.bgSolid),
          research: fill('.rcard--home'),
          tool: fill('.home-tool'),
          news: fill('.news--card'),
        };
      });
      const through = Number(state.token);
      assert.equal(Number(state.veil), through, `${label}: the mask reads the token (${JSON.stringify(state)})`);
      assert.ok(state.soft > 20 && state.solid > 5, `${label}: the mask has both kinds: ${JSON.stringify(state)}`);
      for (const card of ['research', 'tool', 'news'])
        assert.ok(
          Math.abs(state[card] - (1 - through)) < 0.02,
          `${label}: a veiled ${card} card fills at ${state[card]}, expected ${1 - through}`
        );
      const cap = clearanceCap(through);
      const central = phone ? [150, 120] : [200, 120];
      let target = null;
      const centre = async (selector) => {
        target = selector;
        await page.evaluate((s) => {
          const el = document.querySelector(s);
          const r = el.getBoundingClientRect();
          window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - innerHeight / 2, behavior: 'instant' });
        }, selector);
      };
      // A [data-reveal] section eases up by 10px as it appears and the mask re-measures when that
      // transition ends, so wait for the section to be in place, then for frames drawn after it.
      const settle = async () => {
        await page.waitForFunction(
          (s) => {
            const section = document.querySelector(s)?.closest('[data-reveal]');
            if (!section) return true;
            const style = getComputedStyle(section);
            return style.opacity === '1' && (style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)');
          },
          target,
          { timeout: 10_000, polling: 100 }
        );
        await drawn(page, { more: 4 });
      };
      // Text: some art, never more than the veil.
      await centre('.home-pubs');
      await settle();
      const text = await sampleArtAlpha(page, '.home-pubs li', { within: central });
      margins.text = text.max;
      assert.ok(text.count > 200, `${label}: ${text.count} text pixels sampled at the art`);
      assert.ok(text.lit > 0 && text.max > 3, `${label}: the art shows through text (max ${text.max}, lit ${text.lit})`);
      assert.ok(text.max <= cap, `${label}: text lets through ${text.max}/255, cap ${cap}`);
      // A veiled card: the mask leaves the art whole behind its text (the card's own fill does the
      // veiling), so the canvas is brighter there than text may be. Erasing it twice would not be.
      await centre('.home-research');
      await settle();
      const card = await sampleArtAlpha(page, '.rcard--home', { within: central });
      margins.card = card.max;
      assert.ok(card.count > 200, `${label}: ${card.count} card pixels sampled at the art`);
      assert.ok(
        card.max > cap,
        `${label}: the mask is also erasing behind a veiled card (canvas ${card.max}/255, text cap ${cap}): attenuated twice`
      );
      // Objects stay cleared whatever is behind them: the software logos, with the art centred on them.
      await centre('.home-tools');
      await settle();
      const logos = await sampleArtAlpha(page, '.home-tools img', { within: central });
      assert.ok(logos.count > 20, `${label}: ${logos.count} logo pixels sampled at the art`);
      assert.ok(logos.max <= 1, `${label}: an image is fully cleared (${logos.max}/255)`);
      // Other pages are unchanged: no veil, text fully cleared.
      await page.goto('/research/?cell-audit=1');
      await page.waitForFunction(
        () => document.querySelector('[data-art-bg-canvas]')?.dataset.bgSoft !== undefined,
        undefined,
        { timeout: 30_000 }
      );
      await drawn(page, { atLeast: 3 });
      const other = await page.evaluate(() => {
        const canvas = document.querySelector('[data-art-bg-canvas]');
        return { veil: canvas.dataset.bgVeil, soft: canvas.dataset.bgSoft };
      });
      assert.deepEqual(other, { veil: '0.00', soft: '0' }, `${label}: /research/ keeps the solid mask`);
      const prose = await sampleArtAlpha(page, 'main h1, main h2, main p');
      assert.ok(prose.max <= 1, `${label}: /research/ text stays fully cleared (${prose.max}/255)`);
    } finally {
      await context.close();
    }
    // Cells keeps opaque cards: the translucency is the Sequence → Function scene's alone.
    const cells = await browser.newContext({
      baseURL,
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      hasTouch: phone,
      isMobile: phone,
    });
    try {
      await cells.addInitScript(seedChosenCells, DEFAULT_FLAG);
      const page = await cells.newPage();
      page.on('pageerror', (e) => errors.push(`${label}-veil-cells: ${e.message}`));
      await page.goto('/?cell-audit=1');
      await page.waitForFunction(() => document.documentElement.dataset.backgroundScene === 'cells');
      const opaque = await page.evaluate(() =>
        ['.rcard--home', '.home-tool', '.news--card'].map(
          (s) => getComputedStyle(document.querySelector(s)).backgroundColor
        )
      );
      for (const colour of opaque)
        assert.ok(!/rgba\([^)]*,\s*0?\.\d+\)|\/\s*0?\.\d+\)/.test(colour), `${label}: Cells cards stay opaque (${colour})`);
    } finally {
      await cells.close();
    }
    console.log(
      `[background-ui] ${label} reading veil: text ${margins.text}/255 (cap ${clearanceCap(0.3)}), veiled card ${margins.card}/255 unmasked, objects cleared, other pages solid, Cells opaque`
    );
  }
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
    // Twelve pulses, one a period on each of nine arcs and a second on the strongest three; a phone
    // draws the first six slots, which are exactly the strongest arcs (morphAttention.test.ts).
    ['bgPulses', phone ? 6 : 12],
    // Two introns, each with one glow and SPARKS_PER_INTRON (6) ligation sparks: a structural
    // ceiling, which morphSplice.test.ts ties to the model so the two cannot drift apart.
    ['bgSplice', 2],
    ['bgSparks', 12],
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
    if (stage === 'attention')
      assert.ok(Number(state.bgPulses) > 0, 'attention has pulses leaving the promoter');
  }
  return state;
}
// The effect lifecycle, on a fresh page under the fake clock (see openClockedExplorer). It used to
// run on the profile's own page, where a slow runner had already stepped the explorer's adaptive
// quality below 0.6 (streaks are off there by design) and where "a streak appears" was a poll for
// a state that lasts the handful of frames a 0.9 s tween gets at 1-8 Hz. Frames are explicit here
// and quality cannot move, so every count is exact on any runner.
async function effectLifecycle(browser, engine, phone) {
  const { context, page } = await openClockedExplorer(browser, engine, phone);
  try {
    const canvas = page.locator('[data-background-demo-canvas]');
    const eventually = (check, argument) =>
      page.waitForFunction(check, argument, { timeout: 20_000, polling: 100 });
    await pausedAtDna(page);
    const first = await page.locator(`[data-background-form="${1 / 6}"]`).evaluate((button) => {
      button.click();
      return Number(document.querySelector('[data-background-demo-canvas]').dataset.bgStreaks);
    });
    assert.equal(first, 0, 'starting a form tween never teleports a streak');
    // One explicit frame per step. The tween lasts under a second and the renderer clamps a step
    // to 80 ms, so a dozen frames cover all of it; the first is its slowest, which is why a single
    // jump proves nothing about whether streaks ever appear.
    let transition;
    let stepped = 0;
    for (; stepped < 12; stepped++) {
      await page.clock.fastForward(100);
      transition = await assertEffects(page, { demo: true, phone });
      if (Number(transition.bgStreaks) > 0) break;
    }
    assert.ok(
      Number(transition.bgStreaks) > 0,
      `a form transition draws streaks within ${stepped} frames: ${JSON.stringify(transition)}`
    );
    console.log(
      `[background-ui] transition ${phone ? 'phone' : 'desktop'} streaks=${transition.bgStreaks} renderMs=${transition.bgRenderMs} quality=${transition.bgQuality}`
    );
    await scrub(page, 1);
    assert.equal(
      await canvas.getAttribute('data-bg-streaks'),
      '0',
      'discontinuous scrub clears history'
    );
    await assertEffects(page, { demo: true, phone, stage: 'attention' });
    await scrub(page, 5 / 6);
    await assertEffects(page, { demo: true, phone, stage: 'network' });
    const lightImage = await canvas.evaluate((c) => c.toDataURL());
    const initial = Number(await canvas.getAttribute('data-bg-palette'));
    await page.evaluate(() => window.__khcTheme.set('dark'));
    await eventually(
      (previous) =>
        Number(document.querySelector('[data-background-demo-canvas]').dataset.bgPalette) >
        previous,
      initial
    );
    assert.equal(await canvas.getAttribute('data-bg-light-blend'), 'lighter');
    assert.notEqual(
      await canvas.evaluate((c) => c.toDataURL()),
      lightImage,
      'palette repaint changes actual pixels'
    );
    const dark = Number(await canvas.getAttribute('data-bg-palette'));
    await pressDemo(page, 'play');
    await page.clock.fastForward(250);
    assert.equal(
      Number(await canvas.getAttribute('data-bg-palette')),
      dark,
      'animation frames reuse cached sprites'
    );
    await page.evaluate(() => window.__khcCrt.set('amber'));
    await eventually(
      (previous) =>
        Number(document.querySelector('[data-background-demo-canvas]').dataset.bgPalette) >
        previous,
      dark
    );
    assert.equal(await canvas.getAttribute('data-bg-warm-ink'), '#ffb000');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // The change reaches the page as a media-query event, which an engine delivers on its own
    // rendering cycle, so wait for the effect itself rather than for a fixed sleep.
    await eventually(
      () => document.querySelector('[data-background-demo-canvas]').dataset.bgLife === '0'
    );
    await assertEffects(page, { demo: true, phone, amount: 0 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // matchMedia lags the emulation by a rendering cycle too, and the draw forced below reads it.
    await eventually(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
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
    await pressDemo(page, 'reset');
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
    console.log(
      `[background-ui] ${engine}-${phone ? 'phone' : 'desktop'} effect lifecycle: exact under the fake clock`
    );
  } finally {
    await context.close();
  }
}
// The RNA scene is a loop with one pinned still. Clock 0 (reduced motion, a paused explorer, the
// static fallback) is the poster: the first intron half looped, its spliceosome at the neck. A
// running page starts there without a jump, and Pause freezes the loop where it stands. The scene
// is a canvas with no elements to inspect, so every claim is read from what the renderer published
// (`data-bg-splice-phase`, `-splice`, `-sparks`), under the fake clock so each count is exact.
async function spliceLifecycle(browser, engine, phone) {
  const { context, page } = await openClockedExplorer(browser, engine, phone);
  try {
    const canvas = page.locator('[data-background-demo-canvas]');
    const read = () => canvas.evaluate((c) => ({ ...c.dataset }));
    const phaseNow = async () => Number((await read()).bgSplicePhase);
    await pausedAtDna(page);
    await scrub(page, 1 / 6);
    const poster = await read();
    assert.equal(poster.bgStage, 'rna', 'the scrub lands on the RNA scene');
    assert.equal(poster.bgSplicePhase, '0.420', 'clock 0 is the poster phase');
    assert.ok(Number(poster.bgSplice) >= 1, 'the poster has a spliceosome gathered mid-splice');
    assert.equal(Number(poster.bgSparks), 0, 'the poster is before the first ligation');
    await assertEffects(page, { demo: true, phone, stage: 'rna' });
    await pressDemo(page, 'play');
    await page.clock.fastForward(100);
    const first = await phaseNow();
    assert.ok(
      first >= 0.42 && first - 0.42 < 0.01,
      `a running page leaves the poster smoothly, not with a jump: ${first}`
    );
    for (let i = 0; i < 8; i++) await page.clock.fastForward(100);
    const running = await phaseNow();
    assert.ok(running > first && running < 0.6, `the loop advances while playing: ${running}`);
    await pressDemo(page, 'play');
    assert.match(
      (await page.locator('[data-background-play]').textContent()) || '',
      /play/i,
      'the explorer is paused'
    );
    const frozen = await phaseNow();
    // A paused explorer draws no frames of its own, so frames alone would pass against a loop that
    // kept drifting. A scrub forces a real draw while paused, and it must show the same phase.
    await scrub(page, 1 / 6);
    assert.equal(await phaseNow(), frozen, 'a draw while paused shows the phase it stopped at');
    for (let i = 0; i < 4; i++) await page.clock.fastForward(100);
    assert.equal(await phaseNow(), frozen, 'Pause freezes the loop where it stands');
    await pressDemo(page, 'reset');
    assert.equal((await read()).bgSplicePhase, '0.420', 'Reset returns the loop to the poster');
    // Reduced motion keeps the poster and draws none of its effects. The change reaches the page
    // as a media-query event on the engine's own cycle, so wait for the effect, not for a sleep.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(
      () => document.querySelector('[data-background-demo-canvas]').dataset.bgLife === '0',
      undefined,
      { timeout: 20_000, polling: 100 }
    );
    await scrub(page, 1 / 6);
    const reduced = await read();
    assert.equal(reduced.bgStage, 'rna', 'the RNA scene is still reachable in reduced motion');
    assert.equal(reduced.bgSplicePhase, '0.420', 'reduced motion shows the poster');
    assert.equal(Number(reduced.bgSplice), 0, 'reduced motion draws no spliceosome glow');
    assert.equal(Number(reduced.bgSparks), 0, 'reduced motion draws no ligation sparks');
    assert.ok(Number(reduced.bgVisible) > 0, 'the poster still draws the RNA scene');
    console.log(
      `[background-ui] ${engine}-${phone ? 'phone' : 'desktop'} splice lifecycle: poster 0.420, ${first.toFixed(3)} after one frame, ${running.toFixed(3)} after nine, frozen on pause`
    );
  } finally {
    await context.close();
  }
}
// The coverage scene (stage 5) is a canvas too: what it drew is what the renderer published. Three
// junction arcs when it owns the frame, none anywhere else, and none of the RNA scene's effects.
async function locusScene(browser, engine, phone) {
  const { context, page } = await openClockedExplorer(browser, engine, phone);
  try {
    const canvas = page.locator('[data-background-demo-canvas]');
    const read = () => canvas.evaluate((c) => ({ ...c.dataset }));
    await pausedAtDna(page);
    assert.equal(Number((await read()).bgJunctions), 0, 'DNA draws no junction arcs');
    await scrub(page, 2 / 3);
    const locus = await read();
    assert.equal(locus.bgStage, 'signal', 'the scrub lands on the coverage scene');
    assert.equal(Number(locus.bgJunctions), 3, 'two ordinary junctions and the skipping read');
    assert.equal(Number(locus.bgSplice), 0, 'the RNA scene’s glow is not drawn here');
    assert.equal(Number(locus.bgSparks), 0, 'the RNA scene’s sparks are not drawn here');
    await assertEffects(page, { demo: true, phone, stage: 'signal' });
    await scrub(page, 1 / 6);
    assert.equal(Number((await read()).bgJunctions), 0, 'the RNA scene draws no junction arcs');
    console.log(
      `[background-ui] ${engine}-${phone ? 'phone' : 'desktop'} coverage scene: 3 junction arcs on stage 5, none elsewhere`
    );
  } finally {
    await context.close();
  }
}
// The attention scene (stage 7) publishes what it drew too: nine arcs when it owns the frame, none
// anywhere else, and warm pulses leaving the promoter within the caps.
async function attentionScene(browser, engine, phone) {
  const { context, page } = await openClockedExplorer(browser, engine, phone);
  try {
    const canvas = page.locator('[data-background-demo-canvas]');
    const read = () => canvas.evaluate((c) => ({ ...c.dataset }));
    await pausedAtDna(page);
    assert.equal(Number((await read()).bgArcs), 0, 'DNA draws no attention arcs');
    await scrub(page, 1);
    const attention = await read();
    assert.equal(attention.bgStage, 'attention', 'the scrub lands on the attention scene');
    assert.equal(Number(attention.bgArcs), 9, 'one arc from the promoter to each of nine sites');
    assert.equal(Number(attention.bgJunctions), 0, 'the coverage scene’s arcs are not drawn here');
    assert.ok(Number(attention.bgPulses) > 0, 'pulses leave the promoter');
    await assertEffects(page, { demo: true, phone, stage: 'attention' });
    await scrub(page, 5 / 6);
    const network = await read();
    assert.equal(Number(network.bgArcs), 0, 'the network draws no attention arcs');
    assert.equal(Number(network.bgPulses), 0, 'the network draws no attention pulses');
    console.log(
      `[background-ui] ${engine}-${phone ? 'phone' : 'desktop'} attention scene: 9 arcs and ${attention.bgPulses} pulses on stage 7, none elsewhere`
    );
  } finally {
    await context.close();
  }
}
// The explorer's story and its tweens follow WALL time, not the renderer's 80 ms step cap: a
// browser that delivers a frame only every 180 ms (a loaded phone) must still finish a .9 s
// transition in about a second and reach the same pose after the same hold. This used to be
// measured on the profile's own page, with requestAnimationFrame replaced by a 180 ms timer and
// real sleeps of 1.25 s and 3.4 s, which asked a loaded CI runner to keep those timers within a
// few hundred milliseconds of the page (it did not: run 37120306144). Under the fake clock a frame
// is exactly 180 ms, so the pose after 3.42 s of play is a number, not a race.
async function slowCallbacks(browser, engine, phone) {
  const { context, page } = await openClockedExplorer(browser, engine, phone);
  try {
    const canvas = page.locator('[data-background-demo-canvas]');
    const advance = async (count) => {
      for (let i = 0; i < count; i++) await page.clock.fastForward(180);
    };
    await pausedAtDna(page);
    await page.locator(`[data-background-form="${1 / 6}"]`).evaluate((button) => button.click());
    // 1.26 s. A step capped at 80 ms would need twelve frames for a .9 s transition.
    await advance(7);
    assert.equal(
      await canvas.getAttribute('data-bg-transitioning'),
      'false',
      'an adjacent .9s transition completes on wall time even under slow callbacks'
    );
    assert.equal(await canvas.getAttribute('data-bg-stage'), 'rna');
    await pressDemo(page, 'reset');
    await pressDemo(page, 'play');
    // 3.42 s of play: the 2 s hold, then 1.42 s into the 3 s transition to RNA.
    await advance(19);
    const shown = await displayed(page);
    assert.ok(
      shown > 0.04 && shown < 0.13,
      `autoplay follows the 2s hold and 3s transition on wall time under slow callbacks (displayed ${shown})`
    );
    console.log(
      `[background-ui] ${engine}-${phone ? 'phone' : 'desktop'} slow callbacks: transition done within 7 frames of 180 ms, autoplay at ${shown.toFixed(3)} after 3.42 s`
    );
  } finally {
    await context.close();
  }
}
// A press that outlasts a status refresh must still click. The explorer rewrites its labels every
// 500 ms, and replacing the Play button's text node between a mousedown and its mouseup makes
// WebKit drop the click (the pointer events arrive, the click does not; Chromium delivers it). On
// the Linux CI runner a single frame outlasts the gap between the two events, so the pause
// choreography lost one Play click in five (run 37121815429, seven failures with the page's own
// event log showing one click for two). Raw mouse events and the fake clock make it exact: the
// refresh fires inside the press. It also asserts the cause directly, in both engines.
async function slowPress(browser, engine, phone) {
  const { context, page } = await openClockedExplorer(browser, engine, phone);
  try {
    await pausedAtDna(page);
    const play = page.locator('[data-background-play]');
    await play.evaluate((button) => {
      button.firstChild.__kept = true;
    });
    await page.clock.fastForward(1200);
    assert.equal(
      await play.evaluate((button) => button.firstChild?.__kept === true),
      true,
      'a label refresh must not replace the Play button text node'
    );
    const press = async () => {
      await play.evaluate((button) => button.scrollIntoView({ block: 'nearest' }));
      const box = await play.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.clock.fastForward(600);
      await page.mouse.up();
    };
    await press();
    assert.equal(
      await play.textContent(),
      'Pause',
      'a press that outlasts a status refresh still starts playback'
    );
    await press();
    assert.equal(
      await play.textContent(),
      'Play',
      'a press that outlasts a status refresh still pauses'
    );
    const before = await frames(page, true);
    await page.clock.fastForward(1000);
    assert.equal(await frames(page, true), before, 'the explorer stays still after the pause');
    console.log(
      `[background-ui] ${engine}-${phone ? 'phone' : 'desktop'} slow press: the Play label keeps its text node and a 600 ms press clicks`
    );
  } finally {
    await context.close();
  }
}
async function migrationChecks(browser, name) {
  // [saved choice, legacy cell mode, the default-applied flag, what must come out]
  const cases = [
    // Retired scenes become the default and keep a valid saved motion.
    [{ scene: 'flow', motion: 'calm' }, null, DEFAULT_FLAG, { scene: 'morph', motion: 'calm' }],
    [{ scene: 'landscape', motion: 'paused' }, null, DEFAULT_FLAG, { scene: 'morph', motion: 'paused' }],
    [{ scene: 'future', motion: 'calm' }, 'off', DEFAULT_FLAG, { scene: 'morph', motion: 'calm' }],
    [{ scene: 'future', motion: 'paused' }, 'off', DEFAULT_FLAG, { scene: 'morph', motion: 'paused' }],
    // Explicit choices that are never moved, with or without the flag.
    [{ scene: 'morph', motion: 'paused' }, null, null, { scene: 'morph', motion: 'paused' }],
    [{ scene: 'off', motion: 'calm' }, null, null, { scene: 'off', motion: 'calm' }],
    [{ scene: 'off', motion: 'paused' }, null, DEFAULT_FLAG, { scene: 'off', motion: 'paused' }],
    // Storage that does not parse, or no storage at all.
    ['{broken', 'calm', DEFAULT_FLAG, { scene: 'morph', motion: 'calm' }],
    [null, 'off', null, { scene: 'off', motion: 'ambient' }],
    [null, null, null, { scene: 'morph', motion: 'ambient' }],
    // The old build saved Cells for everyone: moved once, and a Cells chosen afterwards stays.
    [{ scene: 'cells', motion: 'ambient' }, null, null, { scene: 'morph', motion: 'ambient' }],
    [{ scene: 'cells', motion: 'calm' }, null, null, { scene: 'morph', motion: 'calm' }],
    [{ scene: 'cells', motion: 'paused' }, null, DEFAULT_FLAG, { scene: 'cells', motion: 'paused' }],
    [{ scene: 'cells', motion: 'calm' }, null, DEFAULT_FLAG, { scene: 'cells', motion: 'calm' }],
  ];
  for (const [saved, legacy, flag, expected] of cases) {
    const context = await browser.newContext({ baseURL });
    try {
      const raw = typeof saved === 'string' || saved === null ? saved : JSON.stringify(saved);
      await context.addInitScript(
        ({ raw, legacy, flag }) => {
          if (raw !== null) localStorage.setItem('khc-background-v1', raw);
          if (legacy !== null) localStorage.setItem('khc-cell-mode', legacy);
          if (flag !== null) localStorage.setItem('khc-background-default', flag);
        },
        { raw, legacy, flag }
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
          `pre-hydration resolution: ${raw} / ${legacy} / ${flag}`
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
        assert.equal(
          await page.evaluate(() => localStorage.getItem('khc-background-default')),
          flag,
          'early paint must not set the default-applied flag either'
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
        `hydrated resolution: ${raw} / ${legacy} / ${flag}`
      );
      assert.deepEqual(
        await page.evaluate(() => JSON.parse(localStorage.getItem('khc-background-v1'))),
        expected,
        'hydration persists the migrated choice without losing motion'
      );
      assert.equal(
        await page.evaluate(() => localStorage.getItem('khc-background-default')),
        DEFAULT_FLAG,
        'hydration records that this release default has been applied'
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
        assert.equal(await page.locator('[data-art-bg-canvas]').isVisible(), false);
      }
      if (expected.scene === 'morph') {
        // The default really draws: the artwork canvas is up and the Cells engine is not attached.
        await page.waitForFunction(
          () => document.querySelector('[data-art-bg-canvas]')?.dataset.bgScene === 'morph'
        );
        assert.equal(await page.locator('[data-art-bg-canvas]').isVisible(), true);
        assert.equal(await page.locator('[data-site-bg-canvas]').isVisible(), false);
        // The Cells engine installs its debug hook when it attaches, so on a page that never showed
        // Cells there is no hook at all: absent and detached both mean "not running".
        assert.notEqual(
          await page.evaluate(() => window.__khcCellsDebug?.snapshot().attached),
          true,
          'the default scene must not attach the Cells engine'
        );
      }
    } finally {
      await context.close();
    }
  }
  console.log(
    `[background-ui] ${name} pre-hydration + hydrated migration: ${cases.length} cases passed`
  );
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
// Say HOW two canvas captures differ. A bare "images are not equal" costs a CI round trip every
// time it fails on a runner you cannot touch: how many pixels, where, by how much.
async function describeImageDifference(page, first, second) {
  return page.evaluate(
    async ([a, b]) => {
      const pixels = async (source) => {
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = source;
        });
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height);
      };
      const [x, y] = await Promise.all([pixels(a), pixels(b)]);
      if (x.width !== y.width || x.height !== y.height)
        return { sizes: [x.width, x.height, y.width, y.height] };
      let differing = 0,
        maxDelta = 0,
        minX = Infinity,
        minY = Infinity,
        maxX = -1,
        maxY = -1;
      for (let row = 0; row < x.height; row++)
        for (let col = 0; col < x.width; col++) {
          const i = (row * x.width + col) * 4;
          const delta = Math.max(
            Math.abs(x.data[i] - y.data[i]),
            Math.abs(x.data[i + 1] - y.data[i + 1]),
            Math.abs(x.data[i + 2] - y.data[i + 2]),
            Math.abs(x.data[i + 3] - y.data[i + 3])
          );
          if (!delta) continue;
          differing++;
          maxDelta = Math.max(maxDelta, delta);
          minX = Math.min(minX, col);
          minY = Math.min(minY, row);
          maxX = Math.max(maxX, col);
          maxY = Math.max(maxY, row);
        }
      return {
        size: [x.width, x.height],
        differing,
        maxDelta,
        box: differing ? [minX, minY, maxX, maxY] : null,
      };
    },
    [first, second]
  );
}
// Two renders of one state are not always bit-identical. Chromium always is. Headless WebKit on
// the CI runner differs from the FIRST draw of a form by up to 5 pixels (levels off by up to 102)
// in 360,000, while warm redraws are byte-identical to each other (a CI probe, run 37117585115,
// and the audit failures of run 37117300113). SAME_IMAGE_TOLERANCE is the fraction of pixels that
// may differ: 0.05%, over twenty times that jitter. A residual displacement moves thousands: a
// mutation that stops clearing the spring offsets after a stir changes 2,018 of 229,000.
const SAME_IMAGE_TOLERANCE = 0.0005;
async function assertSameImage(page, actual, expected, what, detail = {}) {
  if (actual === expected) return 0;
  const difference = await describeImageDifference(page, actual, expected);
  const allowed = difference.size
    ? Math.floor(difference.size[0] * difference.size[1] * SAME_IMAGE_TOLERANCE)
    : 0;
  if (!difference.size || difference.differing > allowed)
    throw new Error(
      `${what}: ${JSON.stringify(difference)}, at most ${allowed} may differ; ${JSON.stringify(detail)}`
    );
  return difference.differing;
}
// Exact pixel equality across frames, asserted where it is deterministic. Under the fake clock a
// frame costs 0 ms, so adaptive quality cannot move between two captures on any runner. The
// real-time versions of these two checks (in the profile) compare only when the adaptive state
// held still: a slow runner steps quality down, and the 400 ms fade between two levels advances
// per FRAME, so two captures can legitimately differ in how many particles are drawn (headless
// WebKit on the CI runner reached quality 0.56 and failed the old unconditional comparison).
async function stirAndReset(browser, engine, phone) {
  const label = `${engine}-${phone ? 'phone' : 'desktop'}`;
  const { context, page } = await openClockedExplorer(browser, engine, phone);
  try {
    const canvas = page.locator('[data-background-demo-canvas]');
    const image = () => canvas.evaluate((c) => c.toDataURL());
    const state = () =>
      canvas.evaluate((c) =>
        Object.fromEntries(
          [
            'bgQuality',
            'bgVisible',
            'bgGlow',
            'bgBokeh',
            'bgStreaks',
            'bgLife',
            'bgPointer',
            'bgInteractions',
            'bgDisplayedProgress',
            'bgTransitioning',
            'bgTicks',
          ].map((key) => [key, c.dataset[key]])
        )
      );
    let jitter = 0;
    const sameImage = async (actual, expected, what, was, now) => {
      jitter = Math.max(
        jitter,
        await assertSameImage(page, actual, expected, `${what} (${label})`, { was, now })
      );
    };
    const labels = (on) =>
      page.locator('[data-background-labels]').evaluate((input, checked) => {
        input.checked = checked;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, on);
    await pausedAtDna(page);
    const canonical = await image();
    // A paused form disturbed by Stir returns exactly to rest, even when frames arrive late.
    await scrub(page, 0.5);
    await labels(true);
    const resting = await image();
    const restingState = await state();
    const interactions = Number(await canvas.getAttribute('data-bg-interactions'));
    await pressDemo(page, 'stir');
    await page.clock.fastForward(100);
    // The counter is written by the frame that draws the displacement, not by the click.
    assert.equal(
      Number(await canvas.getAttribute('data-bg-interactions')),
      interactions + 1,
      'stir is counted'
    );
    assert.notEqual(
      await image(),
      resting,
      'stirring must visibly move particles, not just update its counter'
    );
    // Frames 180 ms apart, like a loaded phone: the disturbance still ends on wall time.
    for (let i = 0; i < 12; i++) await page.clock.fastForward(180);
    await sameImage(
      await image(),
      resting,
      'a paused form must return exactly to its resting composition',
      restingState,
      await state()
    );
    const ticks = await frames(page, true);
    await page.clock.fastForward(1000);
    assert.equal(await frames(page, true), ticks, 'paused renderer must not continue drawing');
    // Reset from a disturbed finale restores canonical DNA exactly.
    await labels(false);
    const canonicalState = await state();
    await scrub(page, 1);
    await pressDemo(page, 'stir');
    await page.clock.fastForward(100);
    await pressDemo(page, 'reset');
    assert.equal(
      await displayed(page),
      0,
      'reset returns from a disturbed finale to canonical DNA'
    );
    assert.equal(await canvas.getAttribute('data-bg-transitioning'), 'false');
    await sameImage(
      await image(),
      canonical,
      'reset restores exact unstirred geometry and decorative clock',
      canonicalState,
      await state()
    );
    console.log(
      `[background-ui] ${label} stir and reset: exact under the fake clock (${jitter} px of rasteriser jitter at most)`
    );
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
        await effectLifecycle(browser, name, false);
        await spliceLifecycle(browser, name, false);
        await locusScene(browser, name, false);
        await attentionScene(browser, name, false);
        continue;
      }
      if (process.env.BACKGROUND_UI_SCENES_ONLY === '1') {
        // The RNA and coverage scenes alone: the fast loop while those are being worked on.
        for (const phone of [false, true]) {
          await spliceLifecycle(browser, name, phone);
          await locusScene(browser, name, phone);
          await attentionScene(browser, name, phone);
        }
        continue;
      }
      if (process.env.BACKGROUND_UI_VEIL_ONLY === '1') {
        await veilChecks(browser, name);
        continue;
      }
      if (process.env.BACKGROUND_UI_MIGRATION_ONLY === '1') {
        await migrationChecks(browser, name);
        continue;
      }
      if (process.env.BACKGROUND_UI_CLOCK_ONLY === '1') {
        // Just the virtual-time scenarios: the fast loop for harness work.
        for (const phone of process.env.BACKGROUND_UI_PHONE_ONLY === '1' ? [true] : [false, true]) {
          const label = `${name}-${phone ? 'phone' : 'desktop'}`;
          await completePlayback(browser, name, phone);
          await minimumQuality(browser, name, phone, label);
          await stirAndReset(browser, name, phone);
          await effectLifecycle(browser, name, phone);
          await spliceLifecycle(browser, name, phone);
          await locusScene(browser, name, phone);
          await attentionScene(browser, name, phone);
          await slowCallbacks(browser, name, phone);
          await slowPress(browser, name, phone);
          console.log(`[background-ui] ${label} virtual-time scenarios passed`);
        }
        continue;
      }
      await luminousChecks(browser, name);
      await veilChecks(browser, name);
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
        // This profile starts from a returning visitor who chose Cells, so it still exercises the
        // switch away from the Cells engine; the default itself is asserted by migrationChecks.
        await context.addInitScript(seedChosenCells, DEFAULT_FLAG);
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
          ['morph', 'cells', 'off'],
          'the default scene first, then Cells, then accessibility Off'
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
        // Escape closes the dialog through its cancel event, which an engine delivers on its own
        // rendering cycle (headless WebKit on the CI runner: still open on the very next line).
        // Wait for the effect, then for focus to come back, instead of reading both at once.
        await page.locator('[data-background-dialog]').waitFor({ state: 'hidden' });
        await page.waitForFunction(
          () => document.querySelector('[data-top-theme-btn]') === document.activeElement,
          undefined,
          { timeout: 20_000, polling: 100 }
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
        await page.locator('[data-background-scrub]').evaluate((input) => {
          input.value = '0';
          input.dispatchEvent(new Event('input', { bubbles: true }));
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
        // A condition, not a 100 ms sleep: the displaced frame arrives on the rendering cycle.
        await page
          .waitForFunction(
            (resting) =>
              document.querySelector('[data-background-demo-canvas]').toDataURL() !== resting,
            restingImage,
            { timeout: 15_000, polling: 100 }
          )
          .catch(() => {
            throw new Error('stirring must visibly move particles, not just update its counter');
          });
        await page.waitForTimeout(1800);
        await still(page, true);
        const settledState = await page
          .locator('[data-background-demo-canvas]')
          .evaluate((c) => ({ width: c.width, height: c.height, ...c.dataset }));
        const settledImage = await page
          .locator('[data-background-demo-canvas]')
          .evaluate((c) => c.toDataURL());
        // Exact only while the adaptive state held still; stirAndReset asserts it unconditionally.
        if (
          restingState.bgQuality === settledState.bgQuality &&
          restingState.bgVisible === settledState.bgVisible
        )
          await assertSameImage(
            page,
            settledImage,
            restingImage,
            'a paused form must return exactly to its resting composition',
            { restingState, settledState }
          );
        else
          console.log(
            `[background-ui] ${label} stir-return pixel comparison skipped: adaptive quality moved (quality ${restingState.bgQuality} -> ${settledState.bgQuality}, visible ${restingState.bgVisible} -> ${settledState.bgVisible}); asserted exactly under the fake clock`
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
            .textContent.includes('attention pattern')
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
          const pose = await page
            .locator('[data-background-demo-canvas]')
            .evaluate((c) => ({ ...c.dataset }));
          assert.equal(Number(pose.bgAllocated), phone ? 1600 : 5000);
          assert.ok(
            Number(pose.bgVisible) >= Number(pose.bgAllocated) * 0.3,
            `particle participation must survive at progress ${progress}`
          );
          assert.ok(Math.abs(Number(pose.bgDisplayedProgress) - progress) < 0.001);
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
        await stirAndReset(browser, name, phone);
        await effectLifecycle(browser, name, phone);
        await spliceLifecycle(browser, name, phone);
        await locusScene(browser, name, phone);
        await attentionScene(browser, name, phone);
        await slowCallbacks(browser, name, phone);
        await slowPress(browser, name, phone);
        await page.locator('[data-background-reset]').click();
        const snapshot = () =>
          page.locator('[data-background-demo-canvas]').evaluate((c) => ({
            image: c.toDataURL(),
            quality: c.dataset.bgQuality,
            visible: c.dataset.bgVisible,
          }));
        const resetSnapshot = await snapshot();
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
        const afterReset = await snapshot();
        if (
          afterReset.quality === resetSnapshot.quality &&
          afterReset.visible === resetSnapshot.visible
        )
          await assertSameImage(
            page,
            afterReset.image,
            resetSnapshot.image,
            'reset restores exact unstirred geometry and decorative clock'
          );
        else
          console.log(
            `[background-ui] ${label} reset pixel comparison skipped: adaptive quality moved (quality ${resetSnapshot.quality} -> ${afterReset.quality}, visible ${resetSnapshot.visible} -> ${afterReset.visible}); asserted exactly under the fake clock`
          );
        // Form, resume, pause. Each step is recorded because on the CI runner this is the one place
        // a "paused" explorer was still drawing seconds later (five failures, none reproducible on
        // a laptop), and the final state alone does not say whether a click went missing.
        await page.evaluate(() => {
          // A timeline of what the page was actually told, from the page's own side.
          window.__events = [];
          const note = (type, detail = '') =>
            window.__events.push([Math.round(performance.now()), type, detail]);
          document.addEventListener(
            'click',
            (event) => {
              const button = event.target.closest?.('button');
              note(
                'click',
                button
                  ? button.hasAttribute('data-background-play')
                    ? 'play'
                    : (button.textContent || '').trim().slice(0, 14)
                  : event.target.tagName
              );
            },
            true
          );
          document.addEventListener('visibilitychange', () =>
            note('visibility', document.visibilityState)
          );
          matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () =>
            note('reduced-motion', String(matchMedia('(prefers-reduced-motion: reduce)').matches))
          );
          // An exception in a click handler would leave the explorer in its old state with a
          // stale label, which looks exactly like a pause that did not take.
          window.addEventListener('error', (event) => note('error', String(event.message)));
          window.addEventListener('unhandledrejection', (event) =>
            note('rejection', String(event.reason))
          );
        });
        const consoleLines = [];
        page.on('console', (message) => {
          if (['error', 'warning'].includes(message.type()))
            consoleLines.push(`${message.type()}: ${message.text()}`.slice(0, 200));
        });
        // BACKGROUND_UI_PAUSE_REPEAT=<n> repeats the choreography n times per page. It exists to
        // gather the failure above faster on a CI matrix (every round prints its trace); a normal
        // run does it once.
        const rounds = Number(process.env.BACKGROUND_UI_PAUSE_REPEAT || 1);
        for (let round = 1; round <= rounds; round++) {
          if (round > 1) await page.locator('[data-background-reset]').click();
          await page.evaluate(() => {
            window.__events.length = 0;
          });
          const trace = [];
          const mark = async (step) =>
            trace.push([
              step,
              ...(await page.evaluate(() => {
                const c = document.querySelector('[data-background-demo-canvas]');
                const play = document.querySelector('[data-background-play]');
                return [
                  Math.round(performance.now()),
                  play.textContent,
                  play.disabled,
                  window.__events.filter((event) => event[2] === 'play').length,
                  Number(c.dataset.bgTicks),
                  c.dataset.bgTransitioning,
                  c.dataset.bgDisplayedProgress,
                  document.hidden,
                ];
              })),
            ]);
          await mark('before');
          await page.locator('[data-background-form="0"]').click();
          await mark('form 0');
          await page.waitForTimeout(150);
          await page.locator('[data-background-play]').click();
          await mark('play');
          await page.waitForTimeout(200);
          await page.locator('[data-background-play]').click();
          await mark('pause');
          console.log(
            `[background-ui] ${label} pause choreography ${round}/${rounds} [step, ms, label, disabled, play clicks, ticks, transitioning, displayed, hidden]: ${JSON.stringify(trace)}`
          );
          try {
            await still(page, true);
          } catch (error) {
            const events = await page.evaluate(() => window.__events);
            throw new Error(
              `${error.message} after ${JSON.stringify(trace)}; page events [ms, type, detail]: ${JSON.stringify(events)}; console: ${JSON.stringify(consoleLines.slice(-8))}; page errors so far: ${JSON.stringify(errors.slice(-5))}`
            );
          }
        }
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
          assert.equal(
            Number(await page.locator('[data-background-demo-canvas]').getAttribute('data-bg-junctions')),
            id === 'signal' ? 3 : 0,
            `junction arcs at rest on ${id}`
          );
          assert.equal(
            Number(await page.locator('[data-background-demo-canvas]').getAttribute('data-bg-arcs')),
            id === 'attention' ? 9 : 0,
            `attention arcs at rest on ${id}`
          );
          assert.equal(
            Number(
              await page.locator('[data-background-demo-canvas]').getAttribute('data-bg-pulses')
            ),
            0,
            `no pulses in reduced motion on ${id}`
          );
          if (id === 'rna') {
            const still = await page
              .locator('[data-background-demo-canvas]')
              .evaluate((c) => ({ ...c.dataset }));
            assert.equal(still.bgSplicePhase, '0.420', 'reduced motion shows the poster');
            assert.equal(Number(still.bgSplice), 0, 'reduced motion draws no spliceosome glow');
            assert.equal(Number(still.bgSparks), 0, 'reduced motion draws no ligation sparks');
            assert.ok(Number(still.bgVisible) > 0, 'the poster still draws the RNA scene');
          }
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
          await page.locator('button[data-background-scene="morph"]').focus();
          await page.keyboard.press('ArrowRight');
          assert.equal(
            await page
              .locator('button[data-background-scene="cells"]')
              .getAttribute('aria-checked'),
            'true',
            'ArrowRight moves from the default scene to Cells'
          );
          await page.keyboard.press('ArrowLeft');
          assert.equal(
            await page
              .locator('button[data-background-scene="morph"]')
              .getAttribute('aria-checked'),
            'true',
            'and ArrowLeft returns to it'
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
      await page.goto('/?cell-audit=1');
      // No storage at all still opens on the default, in memory, and the controls still switch.
      await page.waitForFunction(
        () => document.querySelector('[data-art-bg-canvas]')?.dataset.bgScene === 'morph'
      );
      assert.equal(await page.locator('[data-art-bg-canvas]').isVisible(), true);
      await choose(page, 'scene', 'cells');
      await page.waitForFunction(() => window.__khcCellsDebug.snapshot().running);
      assert.equal(await page.locator('[data-art-bg-canvas]').isVisible(), false);
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
  // "ResizeObserver loop completed with undelivered notifications" is a notice the spec has an
  // engine report as an error event when observers settle over more than one frame: not an
  // exception, and it changes nothing. Headless WebKit on the CI runner (1-8 Hz) raises it in the
  // explorer and the hero; a laptop never does. Anything else still fails the audit.
  const observerLoop =
    /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;
  const notices = errors.filter((message) => observerLoop.test(message));
  if (notices.length)
    console.log(
      `[background-ui] ignored ${notices.length} benign ResizeObserver loop notice(s): ${[...new Set(notices)].join('; ')}`
    );
  assert.deepEqual(
    errors.filter((message) => !observerLoop.test(message)),
    [],
    'browser runtime errors'
  );
  console.log(`[background-ui] Passed. Screenshots: ${artifacts}`);
} finally {
  await previewServer?.stop();
}
