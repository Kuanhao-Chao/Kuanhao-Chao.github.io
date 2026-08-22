import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { chromium, webkit } from 'playwright';

/**
 * Rendering audit for the deep-dive curriculum — every track, not one of them.
 *
 * Modelled on `audit-post-ui.mjs`, with one deliberate difference: the expected number of
 * figures and widgets per lesson is **derived from the MDX source**, not held in a
 * hand-maintained inventory. A hand-written count is a second copy of a fact, and this
 * repo has already shipped the consequences of that twice. Deriving it means the audit
 * fails when a `<Figure>` silently renders nothing, and never fails merely because
 * someone added one.
 *
 * What it asserts, per route, per engine, per viewport, in both themes:
 *   · the page is 200 and carries a visible h1
 *   · the document does not scroll horizontally
 *   · no `.katex-error`, and no literal `$…$` left in the rendered prose
 *   · no empty `<svg>` — the failure mode that left 112 blank icons on the live site
 *   · every citation link resolves to a bibliography entry that exists
 *   · every figure and widget the source declares is actually on the page
 *   · every widget mounts, and its readout *changes* when a control moves
 */

const browserTypes = { chromium, webkit };
const actionTimeout = 10_000;
const navigationTimeout = 30_000;

const CONTENT_DIR = 'src/content/deepDives';
const PAGES_DIR = 'src/pages/deep_dives';

const profiles = [
  { name: 'desktop-light', width: 1440, height: 1000, theme: 'light', mobile: false },
  { name: 'desktop-dark', width: 1440, height: 1000, theme: 'dark', mobile: false },
  { name: 'tablet-light', width: 768, height: 1024, theme: 'light', mobile: true },
  { name: 'phone-light', width: 390, height: 844, theme: 'light', mobile: true },
  { name: 'phone-dark', width: 390, height: 844, theme: 'dark', mobile: true },
  { name: 'narrow-light', width: 320, height: 720, theme: 'light', mobile: true },
];

const failures = [];
const fail = (scope, message) => failures.push(`${scope}: ${message}`);
const progress = (scope) => console.log(`[deep-dive-ui] ${scope}`);
const shotDir = 'scripts/figures/out/deep-dive-ui';

async function captureFailure(scope, task) {
  try {
    await task();
  } catch (error) {
    fail(scope, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Record the events that only Astro's ClientRouter dispatches. A normal document
 * navigation replaces `window` and loses this probe, so requiring these counters
 * after a Playwright `click()` proves both that the click was browser-trusted and
 * that ClientRouter handled it. This deliberately avoids timing/navigation-entry
 * heuristics, which vary between browser engines and CI hosts.
 */
async function installAstroNavigationProbe(page) {
  await page.evaluate(() => {
    const probe = {
      trustedInternalClicks: 0,
      beforePreparation: 0,
      beforeSwap: 0,
      afterSwap: 0,
      pageLoad: 0,
    };
    window.__deepDiveAuditNavigation = probe;

    document.addEventListener(
      'click',
      (event) => {
        const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (!(target instanceof HTMLAnchorElement)) return;
        const destination = new URL(target.href, location.href);
        if (destination.origin === location.origin && event.isTrusted) {
          probe.trustedInternalClicks += 1;
        }
      },
      { capture: true }
    );
    document.addEventListener('astro:before-preparation', () => {
      probe.beforePreparation += 1;
    });
    document.addEventListener('astro:before-swap', () => {
      probe.beforeSwap += 1;
    });
    document.addEventListener('astro:after-swap', () => {
      probe.afterSwap += 1;
    });
    document.addEventListener('astro:page-load', () => {
      probe.pageLoad += 1;
    });
  });
}

async function navigationProbe(page) {
  return page.evaluate(() => window.__deepDiveAuditNavigation ?? null);
}

/** Click a real link and require one complete ClientRouter lifecycle. */
async function clickThroughAstro(page, link, expectedHref, scope) {
  const before = await navigationProbe(page);
  if (!before) throw new Error('Astro navigation probe is missing before the click');
  if (!(await link.isVisible())) throw new Error(`internal link is not visible: ${expectedHref}`);

  const actualHref = await link.getAttribute('href');
  const expected = new URL(expectedHref, page.url());
  const actual = new URL(actualHref ?? '', page.url());
  if (actual.pathname !== expected.pathname || actual.hash !== expected.hash) {
    throw new Error(`link points to ${actual.pathname}${actual.hash}, expected ${expectedHref}`);
  }

  await link.click();
  await page.waitForURL((url) => url.pathname === expected.pathname && url.hash === expected.hash, {
    timeout: navigationTimeout,
  });
  await page.waitForFunction(
    (previous) => {
      const current = window.__deepDiveAuditNavigation;
      return (
        current &&
        current.trustedInternalClicks > previous.trustedInternalClicks &&
        current.beforePreparation > previous.beforePreparation &&
        current.beforeSwap > previous.beforeSwap &&
        current.afterSwap > previous.afterSwap &&
        current.pageLoad > previous.pageLoad
      );
    },
    before,
    { timeout: actionTimeout }
  );

  const after = await navigationProbe(page);
  if (!after) {
    fail(scope, 'navigation replaced the document instead of using ClientRouter');
    return null;
  }
  for (const event of [
    'trustedInternalClicks',
    'beforePreparation',
    'beforeSwap',
    'afterSwap',
    'pageLoad',
  ]) {
    if (after[event] <= before[event]) fail(scope, `${event} was not observed for ${expectedHref}`);
  }
  return after;
}

/** Every route in the curriculum, migrated or not, with what its source promises. */
function routes() {
  const out = [];

  if (existsSync(CONTENT_DIR)) {
    for (const file of readdirSync(CONTENT_DIR).filter((f) => /\.mdx?$/.test(f))) {
      const raw = readFileSync(join(CONTENT_DIR, file), 'utf8');
      const front = raw.split(/^---$/m)[1] ?? '';
      const body = raw.split(/^---$/m).slice(2).join('---');
      // Any hub. This once read `statistical-genetics`, which quietly left the whole
      // Genomic Data track outside the only gate that checks overflow, KaTeX errors,
      // empty <svg> and dead citation anchors.
      if (!/^hub:\s*\S+\s*$/m.test(front)) continue;
      if (/^draft:\s*true\s*$/m.test(front)) continue;
      out.push({
        slug: file.replace(/\.mdx?$/, ''),
        migrated: true,
        figures: (body.match(/<Figure\b/g) ?? []).length,
        widgets: [...body.matchAll(/<Widget[\s\S]*?kind="([^"]+)"/g)].map((m) => m[1]),
        questions: (body.match(/<InterviewQuestion\b/g) ?? []).length,
        questionIndex: /<QuestionIndex\b/.test(body),
      });
    }
  }

  const migrated = new Set(out.map((r) => r.slug));
  for (const file of readdirSync(PAGES_DIR)) {
    if (!file.endsWith('.astro') || file.startsWith('[')) continue;
    const slug = file.replace(/\.astro$/, '');
    if (!/^statgen-/.test(slug) && slug !== 'statistical-genetics') continue;
    if (migrated.has(slug)) continue;
    out.push({
      slug,
      migrated: false,
      figures: 0,
      widgets: [],
      questions: 0,
      questionIndex: false,
    });
  }

  return out.sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

async function auditPage(page, scope, route, profile, screenshot) {
  const response = await page.goto(`/deep_dives/${route.slug}/`, {
    waitUntil: 'networkidle',
    timeout: navigationTimeout,
  });
  if (!response?.ok()) fail(scope, `HTTP ${response?.status() ?? 'no response'}`);

  const state = await page.evaluate(() => {
    const article = document.querySelector('.deep-dive-article') ?? document.querySelector('main');
    const text = article instanceof HTMLElement ? article.innerText : '';
    const svgs = Array.from(document.querySelectorAll('main svg'));
    const cites = Array.from(document.querySelectorAll('a[href^="#ref-"]'));
    const isVisible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const accessibleName = (control) => {
      const labelledBy = control.getAttribute('aria-labelledby');
      if (labelledBy) {
        const value = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' ');
        if (value) return value;
      }
      const ariaLabel = control.getAttribute('aria-label')?.trim();
      if (ariaLabel) return ariaLabel;
      const labels = 'labels' in control ? Array.from(control.labels ?? []) : [];
      const labelText = labels
        .map(
          (label) =>
            label.querySelector(':scope > span:not(.visually-hidden)')?.textContent?.trim() ??
            label.querySelector(':scope > span')?.textContent?.trim() ??
            label.textContent?.trim().replace(/\s+/g, ' ') ??
            ''
        )
        .filter(Boolean)
        .join(' ');
      if (labelText) return labelText;
      return control.textContent?.trim().replace(/\s+/g, ' ') ?? '';
    };
    const describeControl = (control) => {
      const dataName = Array.from(control.attributes).find((attribute) =>
        attribute.name.startsWith('data-ml-')
      )?.name;
      const name = accessibleName(control);
      return `${control.tagName.toLowerCase()}${dataName ? `[${dataName}]` : ''}${name ? ` “${name}”` : ''}`;
    };
    const questionControls = Array.from(
      document.querySelectorAll('[data-interview-question], [data-ml-question-row]')
    ).flatMap((question) =>
      [
        ['bookmark', question.querySelector('[data-ml-bookmark]')],
        ['confidence', question.querySelector('[data-ml-confidence]')],
      ]
        .filter(([, control]) => control)
        .map(([kind, control]) => ({ kind, name: accessibleName(control) }))
    );
    const topStudyControls = Array.from(
      document.querySelectorAll(
        '[data-ml-studybar] button, [data-ml-studybar] input, [data-ml-studybar] select, ' +
          '.ml-study-actions button, .ml-question-filters input, .ml-question-filters select'
      )
    ).filter(isVisible);
    const mobileStudyControls = Array.from(
      document.querySelectorAll(
        '[data-ml-studybar] button, [data-ml-studybar] input:not([type="checkbox"]), ' +
          '[data-ml-studybar] select, [data-ml-question-index] button, ' +
          '[data-ml-question-index] input:not([type="checkbox"]), ' +
          '[data-ml-question-index] select, [data-interview-question] button, ' +
          '[data-interview-question] select, [data-ml-answer] > summary'
      )
    ).filter(isVisible);
    const checkboxTargets = Array.from(
      document.querySelectorAll(
        '[data-ml-studybar] label:has(input[type="checkbox"]), ' +
          '[data-ml-question-index] label:has(input[type="checkbox"])'
      )
    ).filter(isVisible);
    return {
      h1: (document.querySelector('main h1')?.textContent ?? '').trim(),
      viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      katexErrors: document.querySelectorAll('.katex-error').length,
      katexNodes: document.querySelectorAll('.katex').length,
      emptySvgs: svgs.filter((s) => s.children.length === 0).length,
      // A LaTeX span that never rendered still shows its delimiters.
      rawMath: (text.match(/\$[^$\n]{1,80}\$/g) ?? []).slice(0, 3),
      danglingCites: cites
        .map((a) => a.getAttribute('href').slice(1))
        .filter((id) => !document.getElementById(id)),
      figures: document.querySelectorAll('.dd-figure').length,
      questions: document.querySelectorAll('[data-interview-question]').length,
      openAnswers: document.querySelectorAll(
        '[data-interview-question] details[data-ml-answer][open]'
      ).length,
      studyBars: document.querySelectorAll('[data-ml-studybar]').length,
      questionIndex: document.querySelectorAll('[data-ml-question-index]').length,
      indexedQuestions: document.querySelectorAll('[data-ml-question-row]').length,
      questionControls,
      topStudyControlNames: topStudyControls.map(accessibleName),
      shortMobileTargets: mobileStudyControls
        .filter((control) => control.getBoundingClientRect().height < 43.5)
        .slice(0, 8)
        .map(
          (control) =>
            `${describeControl(control)} (${control.getBoundingClientRect().height.toFixed(1)}px)`
        ),
      shortMobileCheckboxTargets: checkboxTargets
        .filter((label) => label.getBoundingClientRect().height < 43.5)
        .slice(0, 8)
        .map(
          (label) =>
            `checkbox “${label.textContent?.trim().replace(/\s+/g, ' ') ?? ''}” ` +
            `(${label.getBoundingClientRect().height.toFixed(1)}px)`
        ),
      smallMobileFormText: mobileStudyControls
        .filter((control) => control.matches('input:not([type="checkbox"]), select'))
        .filter((control) => Number.parseFloat(getComputedStyle(control).fontSize) < 15.5)
        .slice(0, 8)
        .map(
          (control) =>
            `${describeControl(control)} (${Number.parseFloat(getComputedStyle(control).fontSize).toFixed(1)}px)`
        ),
      widgets: Array.from(document.querySelectorAll('[data-dd-widget]')).map((w) => ({
        kind: w.getAttribute('data-dd-widget'),
        ready: w.getAttribute('data-dd-ready') === 'true',
        sliders: w.querySelectorAll('input[type="range"]').length,
        drawn: w.querySelectorAll('[data-dd-canvas] svg *').length,
        readout: (w.querySelector('[data-dd-readout]')?.textContent ?? '').trim(),
      })),
    };
  });

  if (!state.h1) fail(scope, 'no visible h1');
  if (/maximum-scale|user-scalable\s*=\s*no/i.test(state.viewport)) {
    fail(scope, `viewport disables pinch zoom: ${state.viewport}`);
  }
  if (state.scrollWidth > state.clientWidth + 1) {
    fail(
      scope,
      `document overflows by ${state.scrollWidth - state.clientWidth}px at ${profile.width}px`
    );
  }
  if (state.katexErrors) fail(scope, `${state.katexErrors} .katex-error node(s)`);
  if (state.emptySvgs) fail(scope, `${state.emptySvgs} empty <svg>`);
  if (state.rawMath.length) fail(scope, `literal math in the prose: ${state.rawMath.join(' | ')}`);
  if (state.danglingCites.length) {
    fail(scope, `citation links with no anchor: ${[...new Set(state.danglingCites)].join(', ')}`);
  }
  if (route.migrated && state.katexNodes === 0) fail(scope, 'no rendered math at all');
  if (state.figures !== route.figures) {
    fail(scope, `source declares ${route.figures} figure(s), page shows ${state.figures}`);
  }
  if (state.questions !== route.questions) {
    fail(scope, `source declares ${route.questions} question(s), page shows ${state.questions}`);
  }
  if (route.questions && state.openAnswers !== route.questions) {
    fail(
      scope,
      `${state.openAnswers}/${route.questions} interview answers are open without JavaScript interaction`
    );
  }
  if (route.questions && state.studyBars !== 1)
    fail(scope, `expected one study bar, found ${state.studyBars}`);
  if (route.questionIndex && state.questionIndex !== 1)
    fail(scope, 'question index did not render');
  if (route.questionIndex && state.indexedQuestions < 1) fail(scope, 'question index is empty');
  if (route.questions || route.questionIndex) {
    if (state.topStudyControlNames.some((name) => !name)) {
      fail(scope, 'a study-bar/filter control has no accessible name');
    }
    const namedTopControls = state.topStudyControlNames.filter(Boolean);
    if (new Set(namedTopControls).size !== namedTopControls.length) {
      fail(scope, 'study-bar/filter controls do not have unique accessible names');
    }
    for (const kind of ['bookmark', 'confidence']) {
      const names = state.questionControls
        .filter((control) => control.kind === kind)
        .map((control) => control.name);
      if (names.some((name) => !name)) fail(scope, `${kind} control has no accessible name`);
      if (new Set(names).size !== names.length) {
        fail(scope, `${kind} controls do not have question-specific accessible names`);
      }
    }
  }
  if (profile.width <= 640 && (route.questions || route.questionIndex)) {
    if (state.shortMobileTargets.length) {
      fail(scope, `mobile targets below 44px: ${state.shortMobileTargets.join(', ')}`);
    }
    if (state.shortMobileCheckboxTargets.length) {
      fail(
        scope,
        `mobile checkbox targets below 44px: ${state.shortMobileCheckboxTargets.join(', ')}`
      );
    }
    if (state.smallMobileFormText.length) {
      fail(scope, `mobile form text below 16px: ${state.smallMobileFormText.join(', ')}`);
    }
  }
  if (state.widgets.length !== route.widgets.length) {
    fail(
      scope,
      `source declares ${route.widgets.length} widget(s), page shows ${state.widgets.length}`
    );
  }

  for (const [i, w] of state.widgets.entries()) {
    const tag = `${scope}/widget-${i + 1}(${w.kind})`;
    if (!w.ready) fail(tag, 'never mounted');
    if (!w.sliders) fail(tag, 'no controls');
    if (w.drawn < 5) fail(tag, `drew only ${w.drawn} SVG node(s)`);
    if (!w.readout) fail(tag, 'empty readout');
  }

  // Drive the first control of each widget and require the readout to respond.
  const widgets = page.locator('[data-dd-widget]');
  for (let i = 0; i < (await widgets.count()); i += 1) {
    const root = widgets.nth(i);
    const slider = root.locator('input[type="range"]').first();
    if (!(await slider.count())) continue;
    const out = root.locator('[data-dd-readout]');
    const before = (await out.textContent()) ?? '';
    await slider.evaluate((el) => {
      const min = Number(el.min);
      const max = Number(el.max);
      const now = Number(el.value);
      el.value = String(Math.abs(now - min) > Math.abs(now - max) ? min : max);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const after = (await out.textContent()) ?? '';
    if (before === after)
      fail(`${scope}/widget-${i + 1}`, 'readout did not change when a control moved');
  }

  if (screenshot) {
    mkdirSync(shotDir, { recursive: true });
    await page.screenshot({
      path: join(shotDir, `${route.slug}--${profile.name}.png`),
      fullPage: true,
    });
  }
}

async function auditPrint(browser, baseURL, list) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  for (const route of list.filter((r) => r.widgets.length)) {
    const scope = `chromium/print/${route.slug}`;
    progress(scope);
    const page = await context.newPage();
    page.setDefaultTimeout(actionTimeout);
    try {
      await captureFailure(scope, async () => {
        await page.goto(`/deep_dives/${route.slug}/`, {
          waitUntil: 'networkidle',
          timeout: navigationTimeout,
        });
        await page.emulateMedia({ media: 'print' });
        const state = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-dd-widget]')).map((w) => ({
            controls: getComputedStyle(w.querySelector('[data-dd-controls]')).display,
            drawn: w.querySelectorAll('[data-dd-canvas] svg *').length,
          }))
        );
        state.forEach((w, i) => {
          if (w.controls !== 'none') fail(`${scope}/widget-${i + 1}`, 'controls still print');
          if (w.drawn < 5) fail(`${scope}/widget-${i + 1}`, 'nothing to print');
        });
      });
    } finally {
      await page.close();
    }
  }
  await context.close();
}

/**
 * Follow the same links a reader uses for a lesson → hub → lesson round trip.
 * Both clicks must be trusted ClientRouter transitions, and the widget must be
 * interactive again after Astro swaps the lesson back into the document.
 */
async function auditNavigation(browser, baseURL, engineName, list) {
  const route = list.find((r) => r.widgets.length);
  if (!route) return;
  const scope = `${engineName}/navigation`;
  progress(scope);
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(actionTimeout);
  try {
    await captureFailure(scope, async () => {
      await page.goto(`/deep_dives/${route.slug}/`, {
        waitUntil: 'networkidle',
        timeout: navigationTimeout,
      });
      const initial = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-dd-widget]')).map((widget) => ({
          kind: widget.getAttribute('data-dd-widget'),
          controls: widget.querySelectorAll('[data-dd-controls]').length,
          sliders: widget.querySelectorAll('input[type="range"]').length,
        }))
      );
      await installAstroNavigationProbe(page);

      const backLink = page.locator('.dd-backlink a').first();
      const hubHref = await backLink.getAttribute('href');
      if (!hubHref) throw new Error('lesson backlink has no href');
      await clickThroughAstro(page, backLink, hubHref, `${scope}/lesson-to-hub`);
      if (!(await page.locator('.dd-modulemap').count())) {
        fail(scope, 'lesson backlink did not arrive at its curriculum hub');
      }

      const lessonHref = `/deep_dives/${route.slug}/`;
      const lessonLink = page.locator(`.dd-modulemap a[href="${lessonHref}"]`).first();
      await clickThroughAstro(page, lessonLink, lessonHref, `${scope}/hub-to-lesson`);
      const ready = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-dd-widget]')).map((w) => ({
          kind: w.getAttribute('data-dd-widget'),
          ready: w.getAttribute('data-dd-ready') === 'true',
          controls: w.querySelectorAll('[data-dd-controls]').length,
          sliders: w.querySelectorAll('input[type="range"]').length,
          drawn: w.querySelectorAll('[data-dd-canvas] svg *').length,
        }))
      );
      if (!ready.length) fail(scope, 'no widget after navigating back');
      ready.forEach((w, i) => {
        if (!w.ready || !w.sliders || w.drawn < 5) {
          fail(`${scope}/widget-${i + 1}`, 'did not rebind after a client-side navigation');
        }
      });
      ready.forEach((widget, i) => {
        const before = initial[i];
        if (
          !before ||
          widget.kind !== before.kind ||
          widget.controls !== before.controls ||
          widget.sliders !== before.sliders
        ) {
          fail(`${scope}/widget-${i + 1}`, 'control structure changed across the round trip');
        }
      });

      const root = page.locator('[data-dd-widget]').first();
      const slider = root.locator('input[type="range"]').first();
      const readout = root.locator('[data-dd-readout]');
      const beforeReadout = (await readout.textContent()) ?? '';
      await slider.evaluate((control) => {
        const min = Number(control.min);
        const max = Number(control.max);
        const current = Number(control.value);
        control.value = String(Math.abs(current - min) > Math.abs(current - max) ? min : max);
        control.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const afterReadout = (await readout.textContent()) ?? '';
      if (beforeReadout === afterReadout) fail(scope, 'widget did not respond after rebinding');
    });
  } finally {
    await page.close();
    await context.close();
  }
}

/** The interview bank is a learning tool, not static decoration. Exercise one hub and
 * one lesson in every engine so filtering, local progress, practice mode, anchors and
 * print/no-JS fallbacks cannot silently regress while the per-route pass checks layout. */
async function auditInterviewStudy(browser, baseURL, engineName, list) {
  const hub = list.find((route) => route.questionIndex);
  if (!hub) return;
  const scope = `${engineName}/interview-study`;
  progress(scope);
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(actionTimeout);
  try {
    await captureFailure(scope, async () => {
      await page.goto(`/deep_dives/${hub.slug}/`, {
        waitUntil: 'networkidle',
        timeout: navigationTimeout,
      });
      const initial = await page.locator('[data-ml-question-row]').count();
      if (initial < 100) fail(scope, `hub exposes only ${initial} interview questions`);

      const search = page.locator('[data-ml-question-search]');
      await search.fill('a-query-that-matches-no-interview-question');
      if ((await page.locator('[data-ml-question-row]:visible').count()) !== 0) {
        fail(scope, 'question search did not hide non-matches');
      }
      if (!(await page.locator('[data-ml-question-empty]:visible').count())) {
        fail(scope, 'empty-search status is not visible');
      }
      await search.fill('');

      const priority = page.locator('[data-ml-filter-priority]');
      await priority.selectOption('specialist');
      const specialistCount = await page.locator('[data-ml-question-row]:visible').count();
      if (specialistCount < 1 || specialistCount >= initial) {
        fail(scope, `specialist filter returned ${specialistCount}/${initial}`);
      }
      await priority.selectOption('all');

      const firstRow = page.locator('[data-ml-question-row]').first();
      const firstId = await firstRow.getAttribute('data-question-id');
      const lessonHref = await firstRow.locator('a').getAttribute('href');
      if (!firstId || !lessonHref) throw new Error('first question row has no stable id/link');
      const lessonSlug = new URL(lessonHref, baseURL).pathname.split('/').filter(Boolean).at(-1);
      const lesson = list.find((route) => route.slug === lessonSlug);
      if (!lesson?.questions)
        throw new Error(`question row points to unknown lesson: ${lessonHref}`);

      await firstRow.locator('[data-ml-bookmark]').click();
      const stored = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('khc.mlInterview.v1') ?? 'null')
      );
      if (!stored?.bookmarks?.includes(firstId)) fail(scope, 'bookmark did not persist locally');
      if (stored?.reviewedAt?.[firstId]) {
        fail(scope, 'bookmarking alone incorrectly marked the answer as reviewed');
      }

      await installAstroNavigationProbe(page);
      await clickThroughAstro(page, firstRow.locator('a'), lessonHref, `${scope}/hub-to-lesson`);
      const cards = page.locator('[data-interview-question]');
      if ((await cards.count()) !== lesson.questions)
        fail(scope, 'lesson question count changed on navigation');

      await page.locator('[data-ml-practice-toggle]').click();
      const practiceOpen = await page.locator('details[data-ml-answer][open]').count();
      const linkedAnswerOpen = await page
        .locator(`#${firstId} details[data-ml-answer][open]`)
        .count();
      if (practiceOpen !== 1 || linkedAnswerOpen !== 1) {
        fail(
          scope,
          `practice mode left ${practiceOpen} answers open; expected only linked #${firstId}`
        );
      }
      await page.locator('[data-ml-expand]').click();
      if ((await page.locator('details[data-ml-answer][open]').count()) !== lesson.questions) {
        fail(scope, 'expand all did not reveal every answer');
      }
      await page.locator('[data-ml-collapse]').click();
      if ((await page.locator('details[data-ml-answer][open]').count()) !== 0) {
        fail(scope, 'collapse all left an answer open');
      }

      const target = page.locator(`#${firstId}`);
      if (!(await target.count())) fail(scope, `clicked question #${firstId} is missing`);
      if ((await target.locator('[data-ml-bookmark]').getAttribute('aria-pressed')) !== 'true') {
        fail(scope, 'bookmark was not restored after the hub-to-lesson transition');
      }
      await target.locator('[data-ml-confidence]').selectOption('learning');

      const backLink = page.locator('.dd-backlink a').first();
      const hubHref = await backLink.getAttribute('href');
      if (!hubHref) throw new Error('interview lesson backlink has no href');
      await clickThroughAstro(page, backLink, hubHref, `${scope}/lesson-to-hub`);
      const restoredRow = page.locator(`[data-ml-question-row][data-question-id="${firstId}"]`);
      if (
        (await restoredRow.locator('[data-ml-bookmark]').getAttribute('aria-pressed')) !== 'true'
      ) {
        fail(scope, 'bookmark was not restored after returning to the hub');
      }
      if ((await restoredRow.locator('[data-ml-confidence]').inputValue()) !== 'learning') {
        fail(scope, 'confidence was not restored after returning to the hub');
      }

      await clickThroughAstro(
        page,
        restoredRow.locator('a'),
        lessonHref,
        `${scope}/hub-to-lesson-restored`
      );
      const restored = page.locator(`#${firstId}`);
      if ((await restored.locator('[data-ml-bookmark]').getAttribute('aria-pressed')) !== 'true') {
        fail(scope, 'bookmark was not restored after the second lesson transition');
      }
      if ((await restored.locator('[data-ml-confidence]').inputValue()) !== 'learning') {
        fail(scope, 'confidence was not restored after the second lesson transition');
      }

      // A hard reload at the question URL verifies the direct-link fallback separately
      // from the ClientRouter assertions above.
      await page.reload({ waitUntil: 'networkidle' });
      const directTarget = page.locator(`#${firstId}`);
      if (
        !(await directTarget.count()) ||
        !(await directTarget.locator('details[data-ml-answer]').evaluate((details) => details.open))
      ) {
        fail(scope, 'direct question anchor did not reveal its answer');
      }

      await directTarget
        .locator('details[data-ml-answer]')
        .evaluate((details) => details.removeAttribute('open'));
      await page.emulateMedia({ media: 'print' });
      const printDisplay = await directTarget
        .locator('.interview-question__detail')
        .evaluate((node) => getComputedStyle(node).display);
      if (printDisplay === 'none') fail(scope, 'collapsed answer remains hidden in print');
    });
  } finally {
    await page.close();
    await context.close();
  }

  const noJs = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: false,
  });
  const noJsPage = await noJs.newPage();
  try {
    await captureFailure(`${scope}/no-js`, async () => {
      const enhancementState = () =>
        noJsPage.evaluate(() => {
          const visible = (node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              rect.width > 0 &&
              rect.height > 0
            );
          };
          const selectors = [
            '[data-ml-studybar]',
            '.ml-study-actions',
            '.ml-question-filters',
            '[data-ml-progress-controls]',
            '.ml-question-index__progress',
          ];
          const roots = Array.from(document.querySelectorAll(selectors.join(', ')));
          const activeEnhancements = roots
            .flatMap((root) =>
              Array.from(root.querySelectorAll('button, input, select')).map((control) => ({
                root,
                control,
              }))
            )
            .filter(({ control }) => {
              const disabled = control.matches(':disabled') || Boolean(control.closest('[inert]'));
              return visible(control) && !disabled;
            })
            .slice(0, 8)
            .map(({ root, control }) => {
              const marker = Array.from(control.attributes).find((attribute) =>
                attribute.name.startsWith('data-ml-')
              )?.name;
              return (
                `${root.matches('[data-ml-studybar]') ? 'studybar' : root.className} > ` +
                `${control.tagName.toLowerCase()}${marker ? `[${marker}]` : ''}`
              );
            });
          return {
            enhancementRoots: roots.length,
            activeEnhancements,
            cards: document.querySelectorAll('[data-interview-question]').length,
            openAnswers: document.querySelectorAll('details[data-ml-answer][open]').length,
            visibleAnswerBodies: Array.from(
              document.querySelectorAll('details[data-ml-answer] .interview-question__detail')
            ).filter(visible).length,
            rows: document.querySelectorAll('[data-ml-question-row]').length,
            readableRows: Array.from(document.querySelectorAll('[data-ml-question-row]')).filter(
              (row) => {
                const link = row.querySelector('a[href]');
                return visible(row) && Boolean(link && visible(link));
              }
            ).length,
          };
        });

      await noJsPage.goto(`/deep_dives/${hub.slug}/`, {
        waitUntil: 'load',
        timeout: navigationTimeout,
      });
      const hubState = await enhancementState();
      if (!hubState.rows || hubState.readableRows !== hubState.rows) {
        fail(
          `${scope}/no-js`,
          `${hubState.readableRows}/${hubState.rows} question-bank rows remain readable`
        );
      }
      if (!hubState.enhancementRoots) fail(`${scope}/no-js`, 'hub has no enhancement controls');
      if (hubState.activeEnhancements.length) {
        fail(
          `${scope}/no-js`,
          `hub leaves enhancement-only controls active: ${hubState.activeEnhancements.join(', ')}`
        );
      }

      const lessonHref = await noJsPage
        .locator('[data-ml-question-row] a[href^="/deep_dives/"]')
        .first()
        .getAttribute('href');
      if (!lessonHref) throw new Error('no-JS hub has no lesson link');
      await noJsPage.goto(lessonHref, { waitUntil: 'load', timeout: navigationTimeout });
      const lessonState = await enhancementState();
      if (!lessonState.cards || lessonState.openAnswers !== lessonState.cards) {
        fail(`${scope}/no-js`, `${lessonState.openAnswers}/${lessonState.cards} answers are open`);
      }
      if (lessonState.visibleAnswerBodies !== lessonState.cards) {
        fail(
          `${scope}/no-js`,
          `${lessonState.visibleAnswerBodies}/${lessonState.cards} answer bodies remain visible`
        );
      }
      if (!lessonState.enhancementRoots)
        fail(`${scope}/no-js`, 'lesson has no enhancement controls');
      if (lessonState.activeEnhancements.length) {
        fail(
          `${scope}/no-js`,
          `lesson leaves enhancement-only controls active: ${lessonState.activeEnhancements.join(', ')}`
        );
      }
    });
  } finally {
    await noJsPage.close();
    await noJs.close();
  }
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4388;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForSite(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Preview exited with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function selected(list, envName, key) {
  const names = process.env[envName]
    ?.split(',')
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  if (!names?.length) return list;
  return list.filter((item) => names.includes(String(key(item)).toLowerCase()));
}

async function main() {
  const list = routes();
  const smoke = process.argv.includes('--smoke');
  const screenshots = process.argv.includes('--screenshots');
  if (!list.length) throw new Error('no statistical-genetics routes found');

  const port = await availablePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const preview = spawn(
    npm,
    ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port)],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      // npm launches Astro through a shell child. Keep that entire preview tree
      // in one process group so teardown cannot leave Astro holding these pipes.
      detached: process.platform !== 'win32',
    }
  );
  let previewLog = '';
  preview.stdout.on('data', (chunk) => {
    previewLog += chunk;
  });
  preview.stderr.on('data', (chunk) => {
    previewLog += chunk;
  });

  const engines = smoke
    ? Object.entries(browserTypes)
    : selected(Object.entries(browserTypes), 'DEEP_DIVE_AUDIT_BROWSERS', ([n]) => n);
  const configuredViews = selected(profiles, 'DEEP_DIVE_AUDIT_PROFILES', (p) => p.name);
  // Four representative CI combinations: both rendering engines see a desktop and
  // a phone, while light/dark are split across them to keep the smoke gate practical.
  const smokeMatrix = {
    chromium: ['desktop-light', 'phone-dark'],
    webkit: ['desktop-dark', 'phone-light'],
  };
  const viewsFor = (engineName) =>
    smoke
      ? profiles.filter((profile) => smokeMatrix[engineName].includes(profile.name))
      : configuredViews;

  try {
    await waitForSite(`${baseURL}/deep_dives/`, preview);
    for (const [engineName, browserType] of engines) {
      progress(`${engineName}/start`);
      const browser = await browserType.launch({ headless: true });
      try {
        for (const profile of viewsFor(engineName)) {
          const context = await browser.newContext({
            baseURL,
            viewport: { width: profile.width, height: profile.height },
            colorScheme: profile.theme,
            hasTouch: profile.mobile,
          });
          await context.addInitScript(
            (theme) => localStorage.setItem('khc-theme', theme),
            profile.theme
          );
          for (const route of list) {
            const scope = `${engineName}/${profile.name}/${route.slug}`;
            progress(scope);
            const page = await context.newPage();
            page.setDefaultTimeout(actionTimeout);
            try {
              await captureFailure(scope, () =>
                auditPage(page, scope, route, profile, screenshots && engineName === 'chromium')
              );
            } finally {
              await page.close();
            }
          }
          await context.close();
        }
        if (engineName === 'chromium') {
          await auditPrint(browser, baseURL, list);
        }
        await auditNavigation(browser, baseURL, engineName, list);
        await auditInterviewStudy(browser, baseURL, engineName, list);
      } finally {
        await browser.close();
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
  } finally {
    if (process.platform !== 'win32' && preview.pid) {
      try {
        process.kill(-preview.pid, 'SIGTERM');
      } catch {
        preview.kill('SIGTERM');
      }
    } else {
      preview.kill('SIGTERM');
    }
    await new Promise((resolve) => {
      if (preview.exitCode !== null) resolve();
      else {
        preview.once('exit', resolve);
        setTimeout(resolve, 2_000);
      }
    });
  }

  if (failures.length) {
    console.error(`Deep-dive UI audit failed with ${failures.length} issue(s):`);
    failures.forEach((f) => console.error(`- ${f}`));
    if (previewLog.trim()) console.error(`\nPreview output:\n${previewLog.trim()}`);
    process.exitCode = 1;
    return;
  }

  const widgetCount = list.reduce((s, r) => s + r.widgets.length, 0);
  const figureCount = list.reduce((s, r) => s + r.figures, 0);
  console.log(
    `Deep-dive UI audit passed: ${list.length} routes (${list.filter((r) => r.migrated).length} migrated), ` +
      `${figureCount} figures, ${widgetCount} widgets, across ` +
      `${engines
        .map(
          ([engineName]) =>
            `${engineName} at ${viewsFor(engineName)
              .map((p) => p.name)
              .join(', ')}`
        )
        .join('; ')}.`
  );
  if (screenshots) console.log(`Screenshots written to ${shotDir}/`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
