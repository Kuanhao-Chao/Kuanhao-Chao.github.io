import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import process from 'node:process';
import { chromium, webkit } from 'playwright';

/**
 * Browser-level contract for the site-wide living-cell background.
 *
 * Production builds expose a test diagnostic controller only on loopback
 * URLs carrying `?cell-audit=1`; public visitors never receive the global. The
 * full audit exercises every responsive profile in Chromium and WebKit, while
 * `--smoke` keeps CI to Chromium desktop + phone and one reduced-motion pass.
 * `CELL_UI_BASE_URL`, `CELL_UI_AUDIT_BROWSERS`, and `CELL_UI_AUDIT_PROFILES` can
 * narrow a local investigation without changing the checked-in matrix.
 */
const browserTypes = { chromium, webkit };
const smoke = process.argv.includes('--smoke') || process.env.CELL_UI_AUDIT_MODE === 'smoke';
const actionTimeout = 12_000;
const navigationTimeout = 30_000;
const auditQuery = '?cell-audit=1&cell-seed=20260820&cell-freeze=1';
const protectedTargetSelector =
  'a, button, input, textarea, select, summary, label, dialog, h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, pre, code, figure, figcaption, picture, img, video, audio, canvas, iframe, svg, table, thead, tbody, tr, th, td, details, header, footer, [contenteditable="true"], [role="button"], [role="menuitem"], [role="dialog"], [role="log"], [data-cell-interaction="off"], [data-cell-protected], [data-game-root], [data-terminal]';
const touchRetargetSelector =
  'a, button, input, textarea, select, summary, label, [contenteditable="true"], [role="button"], [role="menuitem"], [role="radio"]';

const expectedPhases = {
  mitosis: [
    ['rounding', 0.06],
    ['prometaphase', 0.18],
    ['metaphase', 0.36],
    ['anaphase', 0.53],
    ['telophase', 0.69],
    ['cytokinesis', 0.82],
    ['abscission', 0.96],
  ],
  postmitotic: [['recovery', 0.35]],
  apoptosis: [
    ['condensation', 0.08],
    ['blebbing', 0.27],
    ['fragmentation', 0.5],
    ['apoptotic-bodies', 0.72],
    ['clearance', 0.92],
  ],
};

const profiles = [
  {
    name: 'desktop-light',
    width: 1440,
    height: 1000,
    theme: 'light',
    touch: false,
    deviceScaleFactor: 2,
  },
  {
    name: 'desktop-dark',
    width: 1440,
    height: 1000,
    theme: 'dark',
    touch: false,
    deviceScaleFactor: 2,
  },
  {
    name: 'phone-light',
    width: 390,
    height: 844,
    theme: 'light',
    touch: true,
    deviceScaleFactor: 3,
  },
  {
    name: 'phone-dark',
    width: 390,
    height: 844,
    theme: 'dark',
    touch: true,
    deviceScaleFactor: 3,
  },
  {
    name: 'tablet-light',
    width: 768,
    height: 1024,
    theme: 'light',
    touch: true,
    deviceScaleFactor: 2,
  },
  {
    name: 'compact-phone',
    width: 320,
    height: 568,
    theme: 'light',
    touch: true,
    deviceScaleFactor: 3,
  },
  {
    name: 'phone-landscape',
    width: 844,
    height: 390,
    theme: 'dark',
    touch: true,
    deviceScaleFactor: 3,
  },
];

const failures = [];
const fail = (scope, message) => failures.push(`${scope}: ${message}`);
const progress = (scope) => console.log(`[cell-ui] ${scope}`);

function selectedBrowsers() {
  const fallback = smoke ? 'chromium' : 'chromium,webkit';
  const names = (process.env.CELL_UI_AUDIT_BROWSERS ?? fallback)
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  return names.map((name) => {
    const browserType = browserTypes[name];
    if (!browserType) throw new Error(`Unsupported CELL_UI_AUDIT_BROWSERS entry: ${name}`);
    return [name, browserType];
  });
}

function selectedProfiles() {
  const requested = process.env.CELL_UI_AUDIT_PROFILES?.split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const names = requested?.length
    ? requested
    : smoke
      ? ['desktop-light', 'phone-light']
      : profiles.map(({ name }) => name);

  return names.map((name) => {
    const profile = profiles.find((item) => item.name === name);
    if (!profile) throw new Error(`Unsupported CELL_UI_AUDIT_PROFILES entry: ${name}`);
    return profile;
  });
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4397;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForSite(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`Preview exited with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function check(scope, condition, message) {
  if (!condition) fail(scope, message);
}

async function capture(scope, task) {
  try {
    await task();
  } catch (error) {
    fail(scope, error instanceof Error ? (error.stack ?? error.message) : String(error));
  }
}

function trackBrowserErrors(page, errors) {
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const value = message.text();
    // WebKit's headless media controls request platform-only placard icons.
    // This is browser chrome noise, not an application console failure.
    if (/^Button failed to load, iconName = (?:invalid|pip|airplay)-placard\b/.test(value)) return;
    const source = message.location().url;
    errors.push(`console: ${value}${source ? ` (${source})` : ''}`);
  });
}

async function waitForDebug(page) {
  await page.waitForFunction(
    () =>
      Boolean(
        window.__khcCellsDebug &&
        typeof window.__khcCellsDebug.snapshot === 'function' &&
        typeof window.__khcCellsDebug.setCellState === 'function' &&
        typeof window.__khcCellsDebug.setControllerFrozen === 'function'
      ),
    undefined,
    { timeout: actionTimeout }
  );
}

async function snapshot(page) {
  return page.evaluate(() => window.__khcCellsDebug.snapshot());
}

async function waitForHeroDebug(page) {
  await page.waitForFunction(
    () => Boolean(window.__khcHeroDebug && typeof window.__khcHeroDebug.snapshot === 'function'),
    undefined,
    { timeout: actionTimeout }
  );
}

async function heroSnapshot(page) {
  return page.evaluate(() => window.__khcHeroDebug.snapshot());
}

function normalizePhase(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .replaceAll(' ', '-');
}

function lifecycleCount(value) {
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((sum, item) => {
      if (typeof item === 'number') return sum + item;
      if (Array.isArray(item)) return sum + item.length;
      return sum;
    }, 0);
  }
  return 0;
}

function cellRadius(cell) {
  return Number(cell.radius ?? cell.baseRadius ?? 0);
}

async function canvasState(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-site-bg-canvas]');
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const rect = canvas.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    return {
      width: canvas.width,
      height: canvas.height,
      cssWidth: rect.width,
      cssHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      ratioX: rect.width > 0 ? canvas.width / rect.width : 0,
      ratioY: rect.height > 0 ? canvas.height / rect.height : 0,
      position: style.position,
      pointerEvents: style.pointerEvents,
      ariaHidden: canvas.getAttribute('aria-hidden'),
      connected: canvas.isConnected,
    };
  });
}

async function canvasHasInk(page, selector = '[data-site-bg-canvas]') {
  return page.evaluate((canvasSelector) => {
    const canvas = document.querySelector(canvasSelector);
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width < 1 || canvas.height < 1)
      return false;
    const probe = document.createElement('canvas');
    probe.width = 96;
    probe.height = 64;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
    const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) return true;
    }
    return false;
  }, selector);
}

function assertCanvas(scope, state, profile) {
  check(scope, Boolean(state), 'site background canvas is missing');
  if (!state) return;
  check(scope, state.connected, 'canvas is detached');
  check(scope, state.position === 'fixed', `canvas position is ${state.position}, expected fixed`);
  check(
    scope,
    state.pointerEvents === 'none',
    `canvas pointer-events is ${state.pointerEvents}, expected none`
  );
  check(scope, state.ariaHidden === 'true', 'decorative canvas is not aria-hidden');
  check(
    scope,
    Math.abs(state.cssWidth - state.viewportWidth) <= 1,
    'canvas does not span viewport width'
  );
  check(
    scope,
    Math.abs(state.cssHeight - state.viewportHeight) <= 1,
    'canvas does not span viewport height'
  );
  check(scope, state.width > 0 && state.height > 0, 'canvas backing store has zero size');
  const dprCap = profile.touch ? 1.25 : 1.5;
  check(
    scope,
    state.ratioX > 0 && state.ratioX <= dprCap + 0.02,
    `canvas DPR-x ${state.ratioX.toFixed(2)} exceeds ${dprCap}`
  );
  check(
    scope,
    state.ratioY > 0 && state.ratioY <= dprCap + 0.02,
    `canvas DPR-y ${state.ratioY.toFixed(2)} exceeds ${dprCap}`
  );
}

function assertSnapshot(scope, state, profile) {
  check(scope, state.attached === true, 'engine is not attached');
  check(scope, state.running === true, 'engine is not running');
  check(scope, Number.isFinite(state.updateCount), 'updateCount is not finite');
  check(scope, Number.isFinite(state.renderCount), 'renderCount is not finite');
  check(
    scope,
    Number.isFinite(state.targetCount) && state.targetCount > 0,
    'targetCount is invalid'
  );
  check(
    scope,
    Number.isFinite(state.projectedCount) && state.projectedCount > 0,
    'projectedCount is invalid'
  );
  check(
    scope,
    state.projectedCount <= state.targetCount + 2,
    `projected count ${state.projectedCount} exceeds target ${state.targetCount} + 2`
  );
  check(scope, Array.isArray(state.cells) && state.cells.length > 0, 'debug snapshot has no cells');
  check(scope, ['ambient', 'calm', 'lab', 'off'].includes(state.mode), `invalid cell mode ${state.mode}`);
  check(
    scope,
    ['divide', 'apoptosis'].includes(state.labAction),
    `invalid lab action ${state.labAction}`
  );
  check(scope, state.controllerFrozen === true, 'seeded audit did not freeze homeostasis');
  check(scope, typeof state.detailLevel === 'string', 'detailLevel is not exposed');
  check(scope, Number.isFinite(state.bodyCount) && state.bodyCount >= 0, 'bodyCount is invalid');
  check(scope, state.timings && typeof state.timings === 'object', 'timing telemetry is missing');

  const aspects = [];
  const organelleKinds = new Set();
  const aspectMin = profile.touch ? 0.84 : 0.78;
  const aspectMax = profile.touch ? 1.2 : 1.26;

  for (const cell of state.cells ?? []) {
    const r = cellRadius(cell);
    check(scope, cell.id !== undefined && cell.id !== null, 'cell is missing a stable id');
    check(
      scope,
      Number.isFinite(cell.x) && Number.isFinite(cell.y),
      `cell ${cell.id} has invalid coordinates`
    );
    check(scope, Number.isFinite(r) && r > 0, `cell ${cell.id} has invalid radius`);
    check(
      scope,
      Number.isFinite(cell.targetRadius) && cell.targetRadius > 0,
      `cell ${cell.id} has invalid target radius`
    );
    check(scope, typeof cell.state === 'string', `cell ${cell.id} has no state`);
    check(scope, typeof cell.phase === 'string', `cell ${cell.id} has no biological phase`);
    check(
      scope,
      Number.isFinite(cell.aspect) &&
        cell.aspect >= aspectMin - 0.000_001 &&
        cell.aspect <= aspectMax + 0.000_001,
      `cell ${cell.id} aspect ${cell.aspect} is outside the ${profile.touch ? 'coarse' : 'fine'} ${aspectMin}–${aspectMax} design range`
    );
    check(
      scope,
      Number.isFinite(cell.contourArea) && cell.contourArea > 0,
      `cell ${cell.id} has invalid contour area`
    );
    check(
      scope,
      Number.isFinite(cell.targetArea) && cell.targetArea > 0,
      `cell ${cell.id} has invalid target area`
    );
    if (Number.isFinite(cell.contourArea) && Number.isFinite(cell.targetArea)) {
      const areaRatio = cell.contourArea / cell.targetArea;
      check(
        scope,
        areaRatio >= 0.2 && areaRatio <= 1.6,
        `cell ${cell.id} contour/target area ratio ${areaRatio.toFixed(2)} is implausible`
      );
    }
    check(
      scope,
      Number.isInteger(cell.organelleCount) && cell.organelleCount >= 3,
      `cell ${cell.id} has too few modeled organelles`
    );
    check(
      scope,
      Array.isArray(cell.organelleTypes) && cell.organelleTypes.length > 0,
      `cell ${cell.id} has no organelle type summary`
    );
    check(
      scope,
      Number.isFinite(cell.contactCount) && cell.contactCount >= 0,
      `cell ${cell.id} has invalid contact count`
    );
    check(
      scope,
      Number.isFinite(cell.apoptoticBodyCount) && cell.apoptoticBodyCount >= 0,
      `cell ${cell.id} has invalid apoptotic body count`
    );
    if (Number.isFinite(cell.aspect)) aspects.push(cell.aspect);
    for (const kind of cell.organelleTypes ?? []) organelleKinds.add(kind);
  }

  const aspectSpread = aspects.length ? Math.max(...aspects) - Math.min(...aspects) : 0;
  check(scope, aspectSpread >= 0.035, `cell aspect diversity is only ${aspectSpread.toFixed(3)}`);
  for (const required of ['mitochondria', 'golgi', 'er', 'centrosome']) {
    check(scope, organelleKinds.has(required), `population is missing ${required}`);
  }
}

async function findCellPoint(page, excludedIds = [], touch = false) {
  return page.evaluate(
    ({ excluded, blocked, retargetable, coarse }) => {
      const state = window.__khcCellsDebug.snapshot();
      const interactiveRects = coarse
        ? [...document.querySelectorAll(retargetable)]
            .map((element) => element.getBoundingClientRect())
            .filter((rect) => rect.width > 0 && rect.height > 0)
        : [];
      const hasTouchRetargetRisk = (x, y) =>
        interactiveRects.some(
          (rect) =>
            x >= rect.left - 24 &&
            x <= rect.right + 24 &&
            y >= rect.top - 24 &&
            y <= rect.bottom + 24
        );
      const orderedCells = [...state.cells].sort((a, b) => {
        const aHasSwipeRoom = a.y >= 150 && a.y <= innerHeight - 40 ? 1 : 0;
        const bHasSwipeRoom = b.y >= 150 && b.y <= innerHeight - 40 ? 1 : 0;
        return bHasSwipeRoom - aHasSwipeRoom;
      });
      for (const cell of orderedCells) {
        if (excluded.includes(String(cell.id))) continue;
        if (cell.state !== 'growing' && cell.state !== 'mature') continue;
        const radius = Number(cell.radius ?? cell.baseRadius ?? 0);
        if (!Number.isFinite(radius) || radius < 4) continue;
        const offsets = [
          [0, 0],
          [0.2, 0],
          [-0.2, 0],
          [0, 0.2],
          [0, -0.2],
          [0.38, 0],
          [-0.38, 0],
          [0, 0.38],
          [0, -0.38],
          [0.27, 0.27],
          [-0.27, 0.27],
          [0.27, -0.27],
          [-0.27, -0.27],
          [0.56, 0],
          [-0.56, 0],
          [0, 0.56],
          [0, -0.56],
          [0.4, 0.4],
          [-0.4, 0.4],
          [0.4, -0.4],
          [-0.4, -0.4],
        ];
        for (const [ox, oy] of offsets) {
          const x = cell.x + radius * ox;
          const y = cell.y + radius * oy;
          if (x < 2 || y < 2 || x > innerWidth - 2 || y > innerHeight - 2) continue;
          const target = document.elementFromPoint(x, y);
          const touchCard = coarse && target?.closest('article, .project-links');
          if (target && !target.closest(blocked) && !touchCard && !hasTouchRetargetRisk(x, y))
            return { id: cell.id, x, y, radius };
        }
      }
      return null;
    },
    {
      excluded: excludedIds.map(String),
      blocked: protectedTargetSelector,
      retargetable: touchRetargetSelector,
      coarse: touch,
    }
  );
}

async function findCellPointAcrossScroll(page, profile, excludedIds = []) {
  const initial = await findCellPoint(page, excludedIds, profile.touch);
  if (initial || !profile.touch) return initial;
  const metrics = await page.evaluate(() => ({
    top: scrollY,
    max: Math.max(0, document.documentElement.scrollHeight - innerHeight),
  }));
  for (const fraction of [0, 0.16, 0.33, 0.5, 0.67, 0.84, 1]) {
    await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), metrics.max * fraction);
    await page.waitForTimeout(45);
    const point = await findCellPoint(page, excludedIds, true);
    if (point) return point;
  }
  await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), metrics.top);
  return null;
}

async function findEmptyPoint(page, touch = false) {
  return page.evaluate(
    ({ blocked, retargetable, coarse }) => {
      const cells = window.__khcCellsDebug.snapshot().cells;
      const interactiveRects = coarse
        ? [...document.querySelectorAll(retargetable)]
            .map((element) => element.getBoundingClientRect())
            .filter((rect) => rect.width > 0 && rect.height > 0)
        : [];
      for (let gy = 1; gy <= 7; gy += 1) {
        for (let gx = 1; gx <= 9; gx += 1) {
          const x = (innerWidth * gx) / 10;
          const y = (innerHeight * gy) / 8;
          const target = document.elementFromPoint(x, y);
          if (
            !target ||
            target.closest(blocked) ||
            (coarse && target.closest('article, .project-links'))
          )
            continue;
          if (
            interactiveRects.some(
              (rect) =>
                x >= rect.left - 24 &&
                x <= rect.right + 24 &&
                y >= rect.top - 24 &&
                y <= rect.bottom + 24
            )
          )
            continue;
          const clear = cells.every((cell) => {
            const radius = Number(cell.radius ?? cell.baseRadius ?? 0);
            return Math.hypot(cell.x - x, cell.y - y) > radius * 1.7 + 10;
          });
          if (clear) return { x, y };
        }
      }
      return null;
    },
    {
      blocked: protectedTargetSelector,
      retargetable: touchRetargetSelector,
      coarse: touch,
    }
  );
}

async function setCellState(page, id, state, progressValue) {
  await page.evaluate(
    ({ cellId, nextState, phaseProgress }) => {
      if (phaseProgress === undefined) window.__khcCellsDebug.setCellState(cellId, nextState);
      else window.__khcCellsDebug.setCellState(cellId, nextState, phaseProgress);
    },
    { cellId: id, nextState: state, phaseProgress: progressValue }
  );
}

async function normalizeCells(page) {
  await page.evaluate(() => {
    const state = window.__khcCellsDebug.snapshot();
    for (const cell of state.cells) window.__khcCellsDebug.setCellState(cell.id, 'mature');
  });
  await page.waitForFunction(() => {
    const state = window.__khcCellsDebug.snapshot();
    return lifecycleCountForPage(state.activeLifecycle) === 0 && state.queuedRequests === 0;

    function lifecycleCountForPage(value) {
      if (typeof value === 'number') return value;
      if (Array.isArray(value)) return value.length;
      if (value && typeof value === 'object') {
        return Object.values(value).reduce((sum, item) => {
          if (typeof item === 'number') return sum + item;
          if (Array.isArray(item)) return sum + item.length;
          return sum;
        }, 0);
      }
      return 0;
    }
  });
}

async function findEmptyPointAcrossScroll(page, profile) {
  const initial = await findEmptyPoint(page, profile.touch);
  if (initial || !profile.touch) return initial;
  const metrics = await page.evaluate(() => ({
    top: scrollY,
    max: Math.max(0, document.documentElement.scrollHeight - innerHeight),
  }));
  for (const fraction of [0, 0.16, 0.33, 0.5, 0.67, 0.84, 1]) {
    await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), metrics.max * fraction);
    await page.waitForTimeout(45);
    const point = await findEmptyPoint(page, true);
    if (point) return point;
  }
  await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), metrics.top);
  return null;
}

function deterministicFingerprint(state) {
  return JSON.stringify({
    targetCount: state.targetCount,
    cells: (state.cells ?? [])
      .map((cell) => ({
        targetRadius: Number(cell.targetRadius).toFixed(4),
        aspect: Number(cell.aspect).toFixed(4),
        organelleCount: cell.organelleCount,
        organelleTypes: [...(cell.organelleTypes ?? [])].sort(),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
}

async function auditDeterministicSeed(page, scope) {
  const first = deterministicFingerprint(await snapshot(page));
  await page.reload({ waitUntil: 'networkidle', timeout: navigationTimeout });
  await waitForDebug(page);
  const second = deterministicFingerprint(await snapshot(page));
  check(scope, second === first, 'cell-seed did not reproduce stable cell traits after reload');
}

async function auditLifecycleFrames(page, scope) {
  const point = await findCellPoint(page);
  if (!point) throw new Error('could not find a visible cell for lifecycle phase checks');
  const phases = Object.entries(expectedPhases).flatMap(([state, entries]) =>
    entries.map(([phase, phaseProgress]) => [state, phase, phaseProgress])
  );

  let previousState = '';
  for (const [state, expectedPhase, phaseProgress] of phases) {
    if (previousState && previousState !== state) {
      await setCellState(page, point.id, 'mature');
    }
    const before = await snapshot(page);
    await setCellState(page, point.id, state, phaseProgress);
    await page.waitForTimeout(80);
    const after = await snapshot(page);
    const cell = after.cells.find((item) => String(item.id) === String(point.id));
    check(scope, Boolean(cell), `cell ${point.id} disappeared at ${state} ${phaseProgress}`);
    check(
      scope,
      cell?.state === state,
      `cell ${point.id} did not enter ${state} at ${phaseProgress}`
    );
    check(
      scope,
      normalizePhase(cell?.phase) === expectedPhase,
      `${state} ${phaseProgress} reported phase ${cell?.phase}, expected ${expectedPhase}`
    );
    check(
      scope,
      after.renderCount > before.renderCount,
      `${state} ${phaseProgress} did not render a new frame`
    );
    if (state === 'apoptosis' && expectedPhase === 'apoptotic-bodies') {
      check(
        scope,
        after.bodyCount > 0 && (cell?.apoptoticBodyCount ?? 0) > 0,
        'apoptotic-body phase did not expose any membrane-bound bodies'
      );
    }
    previousState = state;
  }

  await setCellState(page, point.id, 'mature');
}

async function auditMitosisTiming(page, scope) {
  await normalizeCells(page);
  const point = await findCellPoint(page);
  if (!point) throw new Error('could not find a visible cell for mitosis timing');
  const before = await snapshot(page);
  const beforeIds = before.cells.map((cell) => String(cell.id));
  const parent = before.cells.find((cell) => String(cell.id) === String(point.id));
  const started = Date.now();
  await setCellState(page, point.id, 'mitosis', 0);
  await page.waitForFunction(
    (parentId) =>
      !window.__khcCellsDebug.snapshot().cells.some((cell) => String(cell.id) === String(parentId)),
    String(point.id),
    { timeout: 5_500 }
  );
  const dividedAt = Date.now();
  const divided = await snapshot(page);
  const daughters = divided.cells.filter((cell) => !beforeIds.includes(String(cell.id)));
  const mitosisMs = dividedAt - started;
  check(scope, mitosisMs >= 3_550, `mitosis completed too quickly (${mitosisMs}ms)`);
  check(scope, mitosisMs <= 4_650, `mitosis exceeded the 4s budget (${mitosisMs}ms)`);
  check(scope, daughters.length === 2, `mitosis produced ${daughters.length} daughters`);
  check(
    scope,
    daughters.every((cell) => cell.state === 'postmitotic'),
    'daughters skipped the postmitotic recovery state'
  );
  check(
    scope,
    daughters.every((cell) => normalizePhase(cell.phase) === 'recovery'),
    'new daughters did not begin in the recovery phase'
  );
  if (parent && daughters.length === 2) {
    const volumeRatio =
      daughters.reduce((sum, cell) => sum + cellRadius(cell) ** 3, 0) /
      Math.max(1, cellRadius(parent) ** 3);
    check(
      scope,
      Math.abs(volumeRatio - 1) <= 0.05,
      `daughter/parent volume ratio is ${volumeRatio.toFixed(3)}`
    );
    check(
      scope,
      String(daughters[0].siblingId) === String(daughters[1].id) &&
        String(daughters[1].siblingId) === String(daughters[0].id),
      'daughter sibling identities are not reciprocal'
    );
  }

  const daughterIds = daughters.map((cell) => String(cell.id));
  if (daughterIds.length) {
    await page.waitForFunction(
      (ids) => {
        const cells = window.__khcCellsDebug.snapshot().cells;
        return ids.every((id) => {
          const cell = cells.find((item) => String(item.id) === id);
          return cell && cell.state !== 'postmitotic';
        });
      },
      daughterIds,
      { timeout: 2_800 }
    );
    const recoveryMs = Date.now() - dividedAt;
    check(scope, recoveryMs >= 1_150, `daughter recovery was abrupt (${recoveryMs}ms)`);
    check(scope, recoveryMs <= 2_350, `daughter recovery was too slow (${recoveryMs}ms)`);
    for (const id of daughterIds) await setCellState(page, id, 'mature');
  }
  progress(`${scope}/timing mitosis=${mitosisMs}ms recovery=${Date.now() - dividedAt}ms`);
}

async function visibleControl(page, selector) {
  const usesMobileDrawer = await page.evaluate(() => matchMedia('(max-width: 960px)').matches);

  if (usesMobileDrawer) {
    const menuButton = page.locator('.nav-toggle').filter({ visible: true }).first();
    await menuButton.waitFor({ state: 'visible', timeout: actionTimeout });
    if ((await menuButton.getAttribute('aria-expanded')) !== 'true') await menuButton.click();
    const control = page.locator(`#mobile-menu ${selector}`).first();
    await control.waitFor({ state: 'attached', timeout: actionTimeout });
    await control.scrollIntoViewIfNeeded();
    await control.waitFor({ state: 'visible', timeout: actionTimeout });
    return control;
  }

  let control = page
    .locator(`[data-top-theme-popover] ${selector}`)
    .filter({ visible: true })
    .first();
  if ((await control.count()) > 0) return control;

  const popoverButton = page.locator('[data-top-theme-btn]').filter({ visible: true }).first();
  if ((await popoverButton.count()) > 0) {
    if ((await popoverButton.getAttribute('aria-expanded')) !== 'true') await popoverButton.click();
    control = page.locator(selector).filter({ visible: true }).first();
    await control.waitFor({ state: 'visible', timeout: actionTimeout });
    return control;
  }

  throw new Error(`no visible control surface is available for ${selector}`);
}

async function clickCellControl(page, selector) {
  const control = await visibleControl(page, selector);
  await control.click();
}

async function tapCellPoint(page, profile, point) {
  const describe = () =>
    page.evaluate(
      ({ x, y, blocked }) => {
        const target = document.elementFromPoint(x, y);
        const link = target instanceof Element ? target.closest('a') : null;
        const label = (element) => {
          if (!(element instanceof Element)) return null;
          const id = element.id ? `#${element.id}` : '';
          const classes = [...element.classList]
            .slice(0, 3)
            .map((value) => `.${value}`)
            .join('');
          return `${element.tagName.toLowerCase()}${id}${classes}`;
        };
        return {
          url: location.href,
          scrollY,
          target: label(target),
          closestLink: link instanceof HTMLAnchorElement ? link.href : null,
          protected: target instanceof Element ? Boolean(target.closest(blocked)) : true,
          debug: Boolean(window.__khcCellsDebug),
        };
      },
      { ...point, blocked: protectedTargetSelector }
    );
  const before = await describe();
  if (profile.touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(profile.touch ? 160 : 30);
  let after;
  try {
    after = await describe();
  } catch {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    after = {
      url: page.url(),
      scrollY: null,
      target: null,
      closestLink: null,
      protected: true,
      debug: await page.evaluate(() => Boolean(window.__khcCellsDebug)).catch(() => false),
    };
  }
  if (after.url !== before.url) {
    throw new Error(
      `cell tap navigated from ${before.url} to ${after.url}; before target=${before.target}, link=${before.closestLink ?? 'none'}, protected=${before.protected}, scrollY=${before.scrollY}; after target=${after.target}, link=${after.closestLink ?? 'none'}, debug=${after.debug}, scrollY=${after.scrollY}`
    );
  }
}

async function mountAuditSurface(page, kind) {
  await page.evaluate((surfaceKind) => {
    document.querySelector('[data-cell-audit-surface]')?.remove();
    const surface = document.createElement('div');
    surface.dataset.cellAuditSurface = surfaceKind;
    surface.setAttribute('aria-hidden', 'true');
    if (surfaceKind === 'protected') surface.dataset.cellProtected = '';
    Object.assign(surface.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483646',
      background: 'transparent',
      pointerEvents: 'auto',
      touchAction: 'manipulation',
    });
    document.body.append(surface);
  }, kind);
}

async function removeAuditSurface(page) {
  await page.evaluate(() => document.querySelector('[data-cell-audit-surface]')?.remove());
}

async function auditCellControls(page, scope, _profile) {
  const contract = await page.evaluate(() => ({
    modes: [...document.querySelectorAll('[data-cell-mode]')].map((element) =>
      element.getAttribute('data-cell-mode')
    ),
    hasLabLink: Boolean(document.querySelector('a[href="/lab"], .cell-lab-link-btn')),
    hasStatus: Boolean(document.querySelector('[data-cell-status]')),
    hasStatusText: Boolean(document.querySelector('[data-cell-status-text]')),
  }));
  check(
    scope,
    ['ambient', 'off'].every((mode) => contract.modes.includes(mode) || (mode === 'ambient' && contract.modes.includes('calm'))),
    `mode controls are incomplete: ${contract.modes.join(', ')}`
  );
  check(scope, contract.hasLabLink, 'Lab playground link is missing');
  check(scope, contract.hasStatus && contract.hasStatusText, 'cell status chip is incomplete');

  // Test Off mode
  await clickCellControl(page, '[data-cell-mode="off"]');
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.cellMode === 'off' &&
      window.__khcCellsDebug.snapshot().mode === 'off'
  );
  const off = await snapshot(page);
  check(scope, off.running === false, 'Off mode did not pause the animation');
  check(
    scope,
    await page.evaluate(() => localStorage.getItem('khc-cell-mode') === 'off'),
    'Off mode was not persisted'
  );

  // Test Ambient mode restoration
  await clickCellControl(page, '[data-cell-mode="ambient"], [data-cell-mode="calm"]');
  await page.waitForFunction(
    () =>
      (document.documentElement.dataset.cellMode === 'ambient' || document.documentElement.dataset.cellMode === 'calm') &&
      (window.__khcCellsDebug.snapshot().mode === 'ambient' || window.__khcCellsDebug.snapshot().mode === 'calm')
  );
  const ambient = await snapshot(page);
  check(scope, ambient.running === true, 'Ambient mode did not resume the animation');
  check(
    scope,
    await page.evaluate(() => {
      const val = localStorage.getItem('khc-cell-mode');
      return val === 'ambient' || val === 'calm';
    }),
    'Ambient mode was not persisted'
  );
  await page.keyboard.press('Escape');

  // Verify dedicated /lab playground route
  await page.goto(`/lab${auditQuery}`, { waitUntil: 'networkidle', timeout: navigationTimeout });
  await waitForDebug(page);
  const labState = await snapshot(page);
  check(scope, labState.mode === 'lab', 'Lab route did not initialize in lab mode');
  check(scope, labState.running === true, 'Lab route engine is not running');
  const hud = await page.evaluate(() => ({
    hasCanvas: Boolean(document.querySelector('#lab-canvas')),
    hasHud: Boolean(document.querySelector('#lab-hud')),
    hasTelemetry: Boolean(document.querySelector('.lab-telemetry-strip')),
    hasSliders: document.querySelectorAll('.slider-item').length >= 5,
    hasPresets: document.querySelectorAll('.preset-btn').length >= 4,
    hasActions: document.querySelectorAll('.action-btn').length >= 4,
  }));
  check(scope, hud.hasCanvas && hud.hasHud && hud.hasTelemetry, 'Lab page structure is incomplete');
  check(scope, hud.hasSliders && hud.hasPresets && hud.hasActions, 'Lab HUD controls are missing');

  // Return back to projects page with audit query
  await page.goto(`/projects/${auditQuery}`, { waitUntil: 'networkidle', timeout: navigationTimeout });
  await waitForDebug(page);
}

async function auditConcurrentExplicitClicks(page, scope, profile) {
  await normalizeCells(page);
  await mountAuditSurface(page, 'exposed-background');
  let first;
  let second;
  let before;
  try {
    // The transparent audit surface represents unobstructed page whitespace.
    // It isolates concurrent-lifecycle behavior from small viewports whose
    // prose happens to cover every cell center for a particular seeded frame.
    first = await findCellPoint(page);
    if (!first) throw new Error('could not find a first cell for concurrent clicks');
    before = await snapshot(page);
    await tapCellPoint(page, profile, first);
    second = await findCellPoint(page, [first.id]);
    if (!second) {
      await setCellState(page, first.id, 'mature');
      throw new Error('population does not expose a second cell for concurrent clicks');
    }
    await tapCellPoint(page, profile, second);
  } finally {
    await removeAuditSurface(page);
  }
  await page.waitForFunction(
    ({ firstId, secondId, clickRequests }) => {
      const state = window.__khcCellsDebug.snapshot();
      const active = [firstId, secondId].every((id) => {
        const cell = state.cells.find((item) => String(item.id) === String(id));
        return cell?.state === 'mitosis' || cell?.state === 'postmitotic';
      });
      return active && state.counters.clickRequests >= clickRequests + 2;
    },
    {
      firstId: String(first.id),
      secondId: String(second.id),
      clickRequests: before.counters.clickRequests,
    },
    { timeout: 1_800 }
  );
  const active = await snapshot(page);
  check(
    scope,
    lifecycleCount(active.activeLifecycle) >= 2,
    'explicit clicks were serialized instead of beginning concurrently'
  );
  await setCellState(page, first.id, 'mature');
  await setCellState(page, second.id, 'mature');
}

async function wheelOrKeyboardScroll(page, delta) {
  try {
    await page.mouse.wheel(0, delta);
    return 'wheel';
  } catch {
    // Playwright deliberately disables mouse.wheel in mobile WebKit. A real
    // PageUp/PageDown input still exercises native scrolling there.
    await page.keyboard.press(delta < 0 ? 'PageUp' : 'PageDown');
    return 'keyboard';
  }
}

async function performTrustedScroll(page, profile, { point, distance = 260 } = {}) {
  const metrics = await page.evaluate(() => ({
    top: scrollY,
    max: Math.max(0, document.documentElement.scrollHeight - innerHeight),
    width: innerWidth,
    height: innerHeight,
  }));
  if (metrics.max <= 1) return { before: metrics.top, after: metrics.top, method: 'none' };

  let method = 'wheel';
  if (profile.touch) {
    let session = null;
    try {
      // Chromium's protocol is the only cross-process Playwright path that
      // produces a trusted multi-step touch gesture. WebKit falls through to
      // another trusted browser input rather than pretending that an
      // untrusted dispatchEvent() caused native scrolling.
      session = await page.context().newCDPSession(page);
      const x = Math.max(24, Math.min(metrics.width - 24, point?.x ?? metrics.width * 0.5));
      const preferredY = point?.y ?? metrics.height * 0.74;
      const startY = Math.max(96, Math.min(metrics.height - 36, preferredY));
      const travel = Math.min(distance, Math.max(72, startY - 32));
      const endY = startY - travel;
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y: startY }],
      });
      for (let step = 1; step <= 7; step += 1) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: startY + ((endY - startY) * step) / 7 }],
        });
        await page.waitForTimeout(16);
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      method = 'touch';
    } catch {
      method = 'wheel';
    } finally {
      await session?.detach().catch(() => {});
    }
  }

  await page.waitForTimeout(80);
  let after = await page.evaluate(() => scrollY);
  if (method === 'wheel' || Math.abs(after - metrics.top) < 1) {
    const direction = metrics.top >= metrics.max - 1 ? -1 : 1;
    const fallback = await wheelOrKeyboardScroll(
      page,
      direction * Math.min(distance, Math.max(80, metrics.max - metrics.top))
    );
    method = method === 'touch' ? `touch+${fallback}-fallback` : fallback;
  }
  await page
    .waitForFunction((before) => Math.abs(scrollY - before) >= 1, metrics.top, { timeout: 1_500 })
    .catch(() => {});
  after = await page.evaluate(() => scrollY);
  return { before: metrics.top, after, method };
}

async function auditPointerInteractions(page, scope, profile) {
  await normalizeCells(page);
  await mountAuditSurface(page, 'exposed-background');
  let point;
  try {
    point = await findCellPoint(page);
    if (!point) throw new Error('could not find a visible cell hit point');
    const beforeTap = await snapshot(page);
    await tapCellPoint(page, profile, point);
    await page.waitForFunction(
      ({ cellId, clickRequests }) => {
        const state = window.__khcCellsDebug.snapshot();
        const cell = state.cells.find((item) => String(item.id) === String(cellId));
        return state.counters.clickRequests > clickRequests && cell?.state === 'mitosis';
      },
      { cellId: point.id, clickRequests: beforeTap.counters.clickRequests },
      { timeout: 1_500 }
    );
  } finally {
    await removeAuditSurface(page);
  }

  await setCellState(page, point.id, 'mature');
  await page.waitForTimeout(40);
  point = (await findCellPointAcrossScroll(page, profile)) ?? point;
  const beforeDrag = await snapshot(page);
  const beforeCell = beforeDrag.cells.find((cell) => String(cell.id) === String(point.id));

  if (profile.touch) {
    const scroll = await performTrustedScroll(page, profile, { point, distance: 180 });
    await page.waitForTimeout(80);
    const afterScroll = await snapshot(page);
    const afterCell = afterScroll.cells.find((cell) => String(cell.id) === String(point.id));
    check(
      scope,
      Math.abs(scroll.after - scroll.before) >= 1,
      `${scroll.method} mobile scroll gesture did not move the page`
    );
    check(scope, afterCell?.state !== 'mitosis', 'touch scroll gesture triggered mitosis');
    check(
      scope,
      afterScroll.counters.clickRequests === beforeDrag.counters.clickRequests,
      'touch scroll gesture registered as a cell click'
    );
    check(
      scope,
      afterScroll.cells.length === beforeDrag.cells.length,
      'touch scroll gesture changed the cell count'
    );
  } else {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 56, point.y + 34, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    const afterDrag = await snapshot(page);
    const afterCell = afterDrag.cells.find((cell) => String(cell.id) === String(point.id));
    check(scope, afterCell?.state !== 'mitosis', 'desktop drag triggered mitosis');
    if (beforeCell && afterCell) {
      check(
        scope,
        Math.hypot(afterCell.x - beforeCell.x, afterCell.y - beforeCell.y) > 3,
        'desktop drag did not move the cell'
      );
    }
    if (afterCell && 'isGrabbed' in afterCell)
      check(scope, afterCell.isGrabbed === false, 'cell stayed grabbed after pointerup');
  }

  const empty = await findEmptyPointAcrossScroll(page, profile);
  if (!empty) {
    if (!profile.touch) throw new Error('could not find an empty noninteractive background point');
    progress(`${scope}/empty-space skipped: no touch-safe exposed background point`);
    return;
  }
  const beforeEmpty = await snapshot(page);
  if (profile.touch) await page.touchscreen.tap(empty.x, empty.y);
  else await page.mouse.click(empty.x, empty.y);
  await page.waitForTimeout(70);
  const afterEmpty = await snapshot(page);
  check(
    scope,
    afterEmpty.cells.length === beforeEmpty.cells.length,
    'empty-space click created or removed a cell'
  );
  check(
    scope,
    afterEmpty.projectedCount === beforeEmpty.projectedCount,
    'empty-space click changed projected population'
  );
}

async function auditResize(page, scope, profile) {
  const before = await snapshot(page);
  const alternate = profile.touch
    ? profile.width > profile.height
      ? { width: 390, height: 844 }
      : { width: 844, height: 390 }
    : { width: 1024, height: 720 };

  await page.setViewportSize(alternate);
  await page.waitForTimeout(180);
  const resizedCanvas = await canvasState(page);
  assertCanvas(`${scope}/resize`, resizedCanvas, profile);
  const after = await snapshot(page);
  check(scope, after.attached && after.running, 'engine stopped during resize');
  check(scope, after.renderCount > before.renderCount, 'resize did not render a new frame');
  const visible = after.cells.every((cell) => {
    const radius = cellRadius(cell);
    return (
      cell.x >= -radius * 1.75 &&
      cell.x <= alternate.width + radius * 1.75 &&
      cell.y >= -radius * 1.75 &&
      cell.y <= alternate.height + radius * 1.75
    );
  });
  check(scope, visible, 'one or more cells remained outside the resized viewport margin');
  check(
    scope,
    after.cells.length >= before.cells.length - 1,
    'resize abruptly removed multiple cells'
  );

  await page.setViewportSize({ width: profile.width, height: profile.height });
  await page.waitForTimeout(120);
}

async function toggleTheme(page) {
  const toggled = await page.evaluate(() => {
    if (!window.__khcTheme || typeof window.__khcTheme.toggle !== 'function') return false;
    window.__khcTheme.toggle();
    return true;
  });
  if (!toggled) throw new Error('site theme controller is unavailable');
}

async function auditTheme(page, scope) {
  const oldTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  const before = await snapshot(page);
  await toggleTheme(page);
  await page.waitForFunction(
    ({ theme, renderCount }) =>
      document.documentElement.dataset.theme !== theme &&
      window.__khcCellsDebug.snapshot().renderCount > renderCount,
    { theme: oldTheme, renderCount: before.renderCount }
  );
  const after = await snapshot(page);
  check(
    scope,
    after.renderCount > before.renderCount,
    'theme change did not render the background'
  );
  check(scope, await canvasHasInk(page), 'canvas is blank after theme change');
}

async function auditProtectedControl(page, scope, profile) {
  const control = page.locator('[data-top-theme-btn]').first();
  await control.waitFor({ state: 'attached', timeout: actionTimeout });
  const before = await snapshot(page);
  await control.click({ force: true });
  await page.waitForTimeout(80);
  const after = await snapshot(page);
  check(
    scope,
    after.counters.clickRequests === before.counters.clickRequests,
    'clicking a foreground control triggered a background-cell action'
  );
  check(
    scope,
    after.cells.length === before.cells.length,
    'clicking a foreground control changed the cell population'
  );

  const protectedCell = after.cells.find(
    (cell) =>
      (cell.state === 'growing' || cell.state === 'mature') &&
      cell.x >= 2 &&
      cell.x <= profile.width - 2 &&
      cell.y >= 2 &&
      cell.y <= profile.height - 2
  );
  if (!protectedCell) throw new Error('could not place the deterministic protected overlay');
  const protectedBefore = await snapshot(page);
  await mountAuditSurface(page, 'protected');
  try {
    const targetIsProtected = await page.evaluate(
      ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('[data-cell-protected]')),
      protectedCell
    );
    check(scope, targetIsProtected, 'protected audit overlay did not cover the target cell');
    await tapCellPoint(page, profile, protectedCell);
  } finally {
    await removeAuditSurface(page);
  }
  const protectedAfter = await snapshot(page);
  const protectedResult = protectedAfter.cells.find(
    (cell) => String(cell.id) === String(protectedCell.id)
  );
  check(
    scope,
    protectedAfter.counters.clickRequests === protectedBefore.counters.clickRequests,
    'clicking a protected overlay registered a cell action'
  );
  check(
    scope,
    protectedAfter.cells.length === protectedBefore.cells.length,
    'clicking a protected overlay changed the cell population'
  );
  check(
    scope,
    protectedResult?.state === protectedCell.state,
    'clicking a protected overlay changed the covered cell lifecycle'
  );
  await page.keyboard.press('Escape');
}

async function sampleRafBaseline(page, duration = 1_000) {
  return page.evaluate(async (sampleMs) => {
    // Warm the new document before sampling so browser-startup work does not
    // masquerade as the context's native animation clock.
    for (let frame = 0; frame < 4; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const intervals = [];
    const started = performance.now();
    let previous = started;
    await new Promise((resolve) => {
      const frame = (time) => {
        intervals.push(time - previous);
        previous = time;
        if (time - started >= sampleMs) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const sorted = intervals.slice().sort((a, b) => a - b);
    const quantile = (q) =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? Infinity;
    const seconds = Math.max(0.001, (previous - started) / 1000);
    return {
      rate: intervals.length / seconds,
      p50: quantile(0.5),
      p95: quantile(0.95),
      worst: sorted.at(-1) ?? Infinity,
      samples: intervals.length,
      intervals,
    };
  }, duration);
}

function expectedGatedRate(baseline, intervalMs) {
  // Replay the engine's timestamp-reset scheduler over the measured native
  // callback sequence. This captures quantized boundaries exactly: a 67ms
  // scroll gate may need either two or three 33/34ms WebKit callbacks, while a
  // 50ms homepage gate needs six or seven alternating 8.3/8.4ms Chromium
  // callbacks. A p50-derived divisor cannot model those mixed sequences.
  const intervals = baseline.intervals.filter(
    (interval) => Number.isFinite(interval) && interval > 0
  );
  if (!intervals.length) return 0;
  let elapsedSinceRender = 0;
  let elapsedTotal = 0;
  let renders = 0;
  for (let cycle = 0; cycle < 12; cycle += 1) {
    for (const interval of intervals) {
      elapsedSinceRender += interval;
      elapsedTotal += interval;
      if (elapsedSinceRender < intervalMs) continue;
      renders += 1;
      elapsedSinceRender = 0;
    }
  }
  return renders / Math.max(0.001, elapsedTotal / 1000);
}

async function sampleCadence(page, duration) {
  return page.evaluate(async (sampleMs) => {
    const before = window.__khcCellsDebug.snapshot();
    const intervals = [];
    const longFrames = [];
    let observer = null;
    if (
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')
    ) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longFrames.push(entry.duration);
      });
      observer.observe({ type: 'long-animation-frame', buffered: false });
    }

    const started = performance.now();
    let previous = started;
    await new Promise((resolve) => {
      const frame = (time) => {
        intervals.push(time - previous);
        previous = time;
        if (time - started >= sampleMs) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    observer?.disconnect();
    const ended = performance.now();
    const after = window.__khcCellsDebug.snapshot();
    const sorted = intervals.slice().sort((a, b) => a - b);
    const quantile = (q) =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? Infinity;
    const seconds = Math.max(0.001, (ended - started) / 1000);
    return {
      seconds,
      updateRate: (after.updateCount - before.updateCount) / seconds,
      renderRate: (after.renderCount - before.renderCount) / seconds,
      rafRate: intervals.length / seconds,
      rafP95: quantile(0.95),
      rafWorst: sorted.at(-1) ?? Infinity,
      longFrameWorst: longFrames.length ? Math.max(...longFrames) : 0,
    };
  }, duration);
}

function assertCadence(scope, result, profile, baseline, kind = 'ordinary') {
  const home = kind === 'home';
  const renderInterval = home ? 50 : profile.touch ? 32 : 15;
  const expectedRenderRate = expectedGatedRate(baseline, renderInterval);
  const minRenderRate = expectedRenderRate * (home ? 0.8 : 0.75);
  const maxRenderRate = expectedRenderRate * 1.2;
  check(scope, result.updateRate >= 45, `update rate ${result.updateRate.toFixed(1)}/s is too low`);
  check(
    scope,
    result.updateRate <= 75,
    `update rate ${result.updateRate.toFixed(1)}/s is unbounded`
  );
  check(
    scope,
    result.renderRate >= minRenderRate,
    `render rate ${result.renderRate.toFixed(1)}/s is below the ${expectedRenderRate.toFixed(1)}/s clock-adjusted target`
  );
  check(
    scope,
    result.renderRate <= maxRenderRate,
    `render rate ${result.renderRate.toFixed(1)}/s exceeds the ${expectedRenderRate.toFixed(1)}/s clock-adjusted target`
  );
  check(
    scope,
    result.rafRate >= baseline.rate * 0.88,
    `page rAF utilized only ${((result.rafRate / baseline.rate) * 100).toFixed(1)}% of its ${baseline.rate.toFixed(1)}Hz native clock`
  );
  check(
    scope,
    result.rafRate <= baseline.rate * 1.12,
    `page rAF rate ${result.rafRate.toFixed(1)}/s is inconsistent with its ${baseline.rate.toFixed(1)}Hz native clock`
  );
  const rafP95Budget = baseline.p95 + 2;
  check(
    scope,
    result.rafP95 <= rafP95Budget,
    `page rAF p95 is ${result.rafP95.toFixed(1)}ms (native ${baseline.p95.toFixed(1)}ms + 2ms)`
  );
  check(scope, result.rafWorst <= 180, `page rAF worst frame is ${result.rafWorst.toFixed(1)}ms`);
  check(
    scope,
    result.longFrameWorst <= 180,
    `long animation frame reached ${result.longFrameWorst.toFixed(1)}ms`
  );
  progress(
    `${scope}/cadence clock=${baseline.rate.toFixed(1)}Hz raf=${result.rafRate.toFixed(1)}/s updates=${result.updateRate.toFixed(1)}/s renders=${result.renderRate.toFixed(1)}/s target=${expectedRenderRate.toFixed(1)}/s p95=${result.rafP95.toFixed(1)}ms`
  );
}

function assertEngineTimings(scope, state) {
  const timings = state.timings ?? {};
  for (const key of [
    'updateP50',
    'updateP95',
    'updateMax',
    'renderP50',
    'renderP95',
    'renderMax',
  ]) {
    check(
      scope,
      Number.isFinite(timings[key]) && timings[key] >= 0,
      `engine timing ${key} is invalid`
    );
  }
  if (Number.isFinite(timings.updateP95))
    check(scope, timings.updateP95 <= 4, `update p95 reached ${timings.updateP95.toFixed(2)}ms`);
  if (Number.isFinite(timings.renderP95))
    check(scope, timings.renderP95 <= 6, `render p95 reached ${timings.renderP95.toFixed(2)}ms`);
  if (Number.isFinite(timings.updateMax))
    check(scope, timings.updateMax <= 80, `update max reached ${timings.updateMax.toFixed(2)}ms`);
  if (Number.isFinite(timings.renderMax))
    check(scope, timings.renderMax <= 100, `render max reached ${timings.renderMax.toFixed(2)}ms`);
}

function assertHeroTimings(scope, state) {
  const timings = state.timings ?? {};
  for (const key of ['renderP50', 'renderP95', 'renderMax']) {
    check(
      scope,
      Number.isFinite(timings[key]) && timings[key] >= 0,
      `hero timing ${key} is invalid`
    );
  }
  if (Number.isFinite(timings.renderP95))
    check(
      scope,
      timings.renderP95 <= 8,
      `hero render p95 reached ${timings.renderP95.toFixed(2)}ms`
    );
}

async function auditActiveScrollCadence(page, scope, profile, baseline) {
  const layout = await page.evaluate(() => ({
    max: Math.max(0, document.documentElement.scrollHeight - innerHeight),
  }));
  if (layout.max < 120) throw new Error('route is too short for an active-scroll cadence probe');

  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  // Let the previous scroll throttle expire so the counters below measure a
  // fresh, continuously active interval rather than a mixed steady-state one.
  await page.waitForTimeout(720);
  const before = await snapshot(page);
  const started = Date.now();
  const details = [];
  let direction = 1;
  for (let sample = 0; sample < 10; sample += 1) {
    const position = await page.evaluate(() => ({
      top: scrollY,
      max: Math.max(0, document.documentElement.scrollHeight - innerHeight),
    }));
    if (position.top >= position.max - 8) direction = -1;
    else if (position.top <= 8) direction = 1;
    await wheelOrKeyboardScroll(page, direction * 84);
    await page.waitForTimeout(72);
    details.push((await snapshot(page)).detailLevel);
  }
  const after = await snapshot(page);
  const seconds = Math.max(0.001, (Date.now() - started) / 1000);
  const updateRate = (after.updateCount - before.updateCount) / seconds;
  const renderRate = (after.renderCount - before.renderCount) / seconds;
  const expectedRenderRate = expectedGatedRate(baseline, profile.touch ? 67 : 42);
  const minRenderRate = expectedRenderRate * 0.7;
  const maxRenderRate = expectedRenderRate * 1.3;
  const allowedDetails = profile.touch ? ['minimal'] : ['reduced', 'minimal'];

  check(
    scope,
    updateRate >= 45 && updateRate <= 75,
    `active-scroll update rate ${updateRate.toFixed(1)}/s is outside 45–75/s`
  );
  check(
    scope,
    renderRate >= minRenderRate && renderRate <= maxRenderRate,
    `active-scroll render rate ${renderRate.toFixed(1)}/s misses its ${expectedRenderRate.toFixed(1)}/s clock-adjusted target`
  );
  check(
    scope,
    details.length > 0 && details.every((detail) => allowedDetails.includes(detail)),
    `active scrolling exposed unexpected detail levels: ${[...new Set(details)].join(', ')}`
  );
  check(
    scope,
    after.counters.clickRequests === before.counters.clickRequests,
    'active scrolling registered a cell click'
  );
  check(scope, after.cells.length === before.cells.length, 'active scrolling changed cell count');
  progress(
    `${scope}/active-scroll updates=${updateRate.toFixed(1)}/s renders=${renderRate.toFixed(1)}/s target=${expectedRenderRate.toFixed(1)}/s detail=${[...new Set(details)].join(',')}`
  );
}

async function sampleHeroCadence(page, duration) {
  const before = await heroSnapshot(page);
  const started = Date.now();
  await page.waitForTimeout(duration);
  const after = await heroSnapshot(page);
  const seconds = Math.max(0.001, (Date.now() - started) / 1000);
  return {
    before,
    after,
    updateRate: (after.updateCount - before.updateCount) / seconds,
    renderRate: (after.renderCount - before.renderCount) / seconds,
  };
}

async function navigateWithAudit(page, path, expectedSelector) {
  const urlReady = page.waitForURL((url) => url.pathname === path.split('?')[0], {
    timeout: navigationTimeout,
  });
  await page.evaluate((targetPath) => {
    document.querySelector('[data-cell-audit-navigation]')?.remove();
    const link = document.createElement('a');
    link.dataset.cellAuditNavigation = '';
    link.href = targetPath;
    link.textContent = 'Audit navigation';
    Object.assign(link.style, {
      position: 'fixed',
      inset: '0 auto auto 0',
      width: '8px',
      height: '8px',
      overflow: 'hidden',
      opacity: '0.01',
      zIndex: '2147483647',
    });
    document.body.append(link);
  }, path);
  // A browser-generated click is required to exercise ClientRouter. Calling
  // element.click() can bypass Astro's trusted navigation path and silently
  // turn the lifecycle check into a full reload.
  await page.locator('[data-cell-audit-navigation]').click({ force: true });
  await urlReady;
  await page.locator(expectedSelector).waitFor({ state: 'attached', timeout: navigationTimeout });
  await page.waitForTimeout(80);
}

async function navigateExistingWithAudit(page, href, path, expectedSelector) {
  const link = page.locator(`a[href="${href}"]`).filter({ visible: true }).first();
  await link.waitFor({ state: 'visible', timeout: actionTimeout });
  await link.evaluate((element, targetPath) => {
    element.href = targetPath;
    element.dataset.cellAuditExistingNavigation = '';
  }, path);
  const activeLink = page.locator('[data-cell-audit-existing-navigation]');
  await Promise.all([
    page.waitForURL((url) => url.pathname === path.split('?')[0], {
      timeout: navigationTimeout,
    }),
    activeLink.click(),
  ]);
  await page.locator(expectedSelector).waitFor({ state: 'attached', timeout: navigationTimeout });
  await page.waitForTimeout(80);
}

async function auditContentRoutes(page, scope, profile, baseline) {
  await navigateWithAudit(page, `/posts/shorkie/${auditQuery}`, 'main');
  await waitForDebug(page);
  const proseStart = await snapshot(page);
  const proseLayout = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: innerHeight,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  check(
    scope,
    proseLayout.scrollHeight >= proseLayout.viewportHeight * 2,
    'long-form route is not long enough to exercise scrolling'
  );
  check(scope, proseLayout.overflow <= 1, `long-form route has ${proseLayout.overflow}px overflow`);
  const proseScroll = await performTrustedScroll(page, profile, { distance: 520 });
  await page.waitForTimeout(100);
  const proseEnd = await snapshot(page);
  check(
    scope,
    Math.abs(proseScroll.after - proseScroll.before) >= 1,
    `${proseScroll.method} long-form gesture did not scroll`
  );
  check(
    scope,
    proseEnd.counters.clickRequests === proseStart.counters.clickRequests,
    'long-form scroll triggered a cell action'
  );
  check(scope, proseEnd.cells.length === proseStart.cells.length, 'long-form scroll changed cells');
  await auditActiveScrollCadence(page, `${scope}/long-form`, profile, baseline);

  await navigateWithAudit(page, `/games/snake/${auditQuery}`, '[data-snake-canvas]');
  await waitForDebug(page);
  const gameStart = await snapshot(page);
  const gameCanvas = page.locator('[data-snake-canvas]');
  const box = await gameCanvas.boundingBox();
  if (!box) throw new Error('snake canvas has no interactive bounds');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (profile.touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await page.locator('[data-snake-restart]').click({ force: true });
  await page.waitForTimeout(100);
  const gameEnd = await snapshot(page);
  check(
    scope,
    gameEnd.counters.clickRequests === gameStart.counters.clickRequests,
    'interacting with the game triggered a background-cell action'
  );
  check(
    scope,
    gameEnd.cells.length === gameStart.cells.length,
    'interacting with the game changed the cell population'
  );
  check(scope, await canvasHasInk(page), 'living-cell canvas went blank on the game route');

  await navigateWithAudit(page, `/projects/${auditQuery}`, 'main');
  await waitForDebug(page);
}

async function auditSpaLifecycle(page, scope) {
  const navigationToken = `cells-${Date.now()}-${Math.random()}`;
  await page.evaluate((token) => {
    window.__khcCellsAuditNavigationToken = token;
    window.__khcCellsAuditEngine = window.__khcCellsDebug;
  }, navigationToken);
  await navigateExistingWithAudit(page, '/terminal/', `/terminal/${auditQuery}`, '[data-terminal]');
  const terminalRealm = await page.evaluate(
    (token) => ({
      preserved: window.__khcCellsAuditNavigationToken === token,
      hasSavedEngine: Boolean(window.__khcCellsAuditEngine),
      hasDebugAlias: Boolean(window.__khcCellsDebug),
    }),
    navigationToken
  );
  if (terminalRealm.preserved)
    check(
      scope,
      terminalRealm.hasSavedEngine,
      'SPA terminal navigation lost the preserved engine surface'
    );
  else
    check(
      scope,
      !terminalRealm.hasDebugAlias,
      'full terminal navigation unexpectedly installed the living-cell debug alias'
    );
  const terminalStart = await page.evaluate(
    () => window.__khcCellsAuditEngine?.snapshot() ?? window.__khcCellsDebug?.snapshot() ?? null
  );
  if (terminalRealm.preserved) {
    check(scope, Boolean(terminalStart), 'detached terminal engine snapshot is unavailable');
    check(
      scope,
      terminalStart?.attached === false,
      'engine remained attached on bare terminal route'
    );
    check(scope, terminalStart?.running === false, 'engine kept running on bare terminal route');
  }
  check(
    scope,
    (await canvasState(page)) === null,
    'background canvas remained on bare terminal route'
  );
  check(
    scope,
    await page.evaluate(() => window.__khcHeroDebug === undefined),
    'homepage hero debug/loop leaked onto the terminal route'
  );
  await page.waitForTimeout(320);
  const terminalEnd = await page.evaluate(
    () => window.__khcCellsAuditEngine?.snapshot() ?? window.__khcCellsDebug?.snapshot() ?? null
  );
  if (terminalStart && terminalEnd) {
    check(
      scope,
      terminalEnd.updateCount === terminalStart.updateCount,
      'detached engine continued updating'
    );
    check(
      scope,
      terminalEnd.renderCount === terminalStart.renderCount,
      'detached engine continued rendering'
    );
  }

  const returnToken = `cells-return-${Date.now()}-${Math.random()}`;
  await page.evaluate((token) => {
    window.__khcCellsAuditReturnToken = token;
  }, returnToken);
  await navigateExistingWithAudit(page, '/', `/${auditQuery}`, '[data-hero-canvas]');
  await waitForDebug(page);
  await waitForHeroDebug(page);
  const returnPreserved = await page.evaluate(
    (token) => window.__khcCellsAuditReturnToken === token,
    returnToken
  );
  progress(
    `${scope}/navigation terminal=${terminalRealm.preserved ? 'spa' : 'reload'} home=${returnPreserved ? 'spa' : 'reload'}`
  );
  await page.waitForFunction(() => {
    const state = window.__khcCellsDebug.snapshot();
    return state.attached === true && state.running === true;
  });
  const returned = await snapshot(page);
  check(
    scope,
    returned.counters.eventBindings === 1,
    `homepage engine has ${returned.counters.eventBindings} event-binding passes`
  );
  await page.waitForTimeout(220);
  const advanced = await snapshot(page);
  check(
    scope,
    advanced.updateCount > returned.updateCount,
    'engine did not resume after returning from terminal'
  );
  check(
    scope,
    advanced.renderCount > returned.renderCount,
    'engine did not render after returning from terminal'
  );
}

async function auditHomeComposite(page, scope, profile, baseline) {
  // Let both canvases finish their first mount frames and fill their timing
  // windows before measuring the shared homepage frame budget.
  await page.waitForTimeout(900);
  await waitForHeroDebug(page);
  const state = await snapshot(page);
  const hero = await heroSnapshot(page);
  const expectedDprCap = profile.touch ? 1 : 1.5;
  const expectedCellCap = profile.touch ? 4 : 7;
  check(
    scope,
    state.dpr <= expectedDprCap + 0.02,
    `homepage cell DPR ${state.dpr.toFixed(2)} exceeds ${expectedDprCap}`
  );
  check(
    scope,
    state.targetCount <= expectedCellCap,
    `homepage target ${state.targetCount} exceeds ${expectedCellCap}`
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check(scope, overflow <= 1, `homepage has ${overflow}px horizontal overflow`);
  check(scope, await canvasHasInk(page), 'homepage living-cells canvas is blank');
  check(
    scope,
    await canvasHasInk(page, '[data-hero-canvas]'),
    'homepage hero animation canvas is blank'
  );

  check(scope, hero.maxFps === 24, `hero reports an unexpected ${hero.maxFps}fps cap`);
  check(scope, hero.width > 0 && hero.height > 0, 'hero canvas has invalid dimensions');
  check(scope, hero.dpr <= 1.5 + 0.02, 'hero DPR exceeds its 1.5 cap');
  if (profile.touch) {
    const heroCadence = await sampleHeroCadence(page, 420);
    check(scope, hero.coarse === true, 'touch homepage did not select the coarse hero profile');
    check(scope, heroCadence.after.running === false, 'touch hero rAF loop is running');
    check(scope, heroCadence.updateRate === 0, 'touch hero continued updating');
    check(scope, heroCadence.renderRate === 0, 'touch hero continued rendering');
    const heroIsStatic = await page.evaluate(async () => {
      const canvas = document.querySelector('[data-hero-canvas]');
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      const before = canvas.toDataURL();
      await new Promise((resolve) => setTimeout(resolve, 180));
      return before === canvas.toDataURL();
    });
    check(scope, heroIsStatic, 'touch homepage ran a second full-canvas animation');
  } else {
    const heroCadence = await sampleHeroCadence(page, 1_800);
    const expectedHeroRate = Math.min(heroCadence.after.maxFps, baseline.rate);
    check(scope, heroCadence.after.running === true, 'visible desktop hero is not running');
    check(
      scope,
      heroCadence.updateRate >= expectedHeroRate * 0.82 &&
        heroCadence.updateRate <= expectedHeroRate * 1.07,
      `hero update rate ${heroCadence.updateRate.toFixed(1)}/s misses its ${expectedHeroRate.toFixed(1)}/s clock-adjusted target`
    );
    check(
      scope,
      heroCadence.renderRate >= expectedHeroRate * 0.82 &&
        heroCadence.renderRate <= expectedHeroRate * 1.07,
      `hero render rate ${heroCadence.renderRate.toFixed(1)}/s misses its ${expectedHeroRate.toFixed(1)}/s clock-adjusted target`
    );
    assertHeroTimings(`${scope}/hero`, heroCadence.after);

    const offscreenY = await page.evaluate(() => {
      const canvas = document.querySelector('[data-hero-canvas]');
      const host = canvas?.parentElement;
      if (!host) return 0;
      const bottom = host.getBoundingClientRect().bottom + scrollY;
      return Math.min(
        Math.max(0, document.documentElement.scrollHeight - innerHeight),
        Math.ceil(bottom + 24)
      );
    });
    if (offscreenY > 0) {
      await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), offscreenY);
      await page.waitForFunction(() => window.__khcHeroDebug.snapshot().visible === false);
      const scrolledCells = await snapshot(page);
      check(
        scope,
        scrolledCells.detailLevel === 'minimal',
        `homepage scroll kept ${scrolledCells.detailLevel} cell anatomy instead of minimal`
      );
      const paused = await sampleHeroCadence(page, 260);
      check(scope, paused.after.running === false, 'off-screen hero kept its rAF loop running');
      check(scope, paused.updateRate === 0, 'off-screen hero continued updating');
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForFunction(() => {
        const state = window.__khcHeroDebug.snapshot();
        return state.visible === true && state.running === true;
      });
    }
  }

  // The off-screen probe above scrolls the page and temporarily enables the
  // cells' active-scroll throttle. Sample only after that throttle has cleared
  // so this remains a steady-state composite measurement.
  await page.waitForTimeout(800);
  const cadence = await sampleCadence(page, 1_800);
  assertCadence(`${scope}/home`, cadence, profile, baseline, 'home');
  assertEngineTimings(`${scope}/home`, await snapshot(page));

  // Exercise the real, below-the-fold transcript only after measuring the
  // initial homepage composite; clicking it intentionally stops the terminal
  // demo and should never leak through to an ambient cell.
  const terminalStart = await snapshot(page);
  const terminalScreen = page.locator('[data-terminal-screen]').filter({ visible: true }).first();
  await terminalScreen.scrollIntoViewIfNeeded();
  const terminalBox = await terminalScreen.boundingBox();
  check(scope, Boolean(terminalBox), 'homepage terminal screen has no interactive bounds');
  if (terminalBox) {
    const terminalX = terminalBox.x + terminalBox.width / 2;
    const terminalY = terminalBox.y + Math.min(terminalBox.height / 2, 72);
    if (profile.touch) await page.touchscreen.tap(terminalX, terminalY);
    else await page.mouse.click(terminalX, terminalY);
    await page.waitForTimeout(100);
    const terminalEnd = await snapshot(page);
    check(
      scope,
      terminalEnd.counters.clickRequests === terminalStart.counters.clickRequests,
      'interacting with the homepage terminal triggered a background-cell action'
    );
    check(
      scope,
      terminalEnd.cells.length === terminalStart.cells.length,
      'interacting with the homepage terminal changed the cell population'
    );
  }
}

async function auditPage(page, scope, profile) {
  const browserErrors = [];
  trackBrowserErrors(page, browserErrors);

  const rafBaseline = await sampleRafBaseline(page);
  check(
    `${scope}/clock`,
    Number.isFinite(rafBaseline.rate) && rafBaseline.rate >= 20 && rafBaseline.rate <= 165,
    `native rAF rate ${rafBaseline.rate.toFixed(1)}Hz is invalid`
  );
  check(
    `${scope}/clock`,
    Number.isFinite(rafBaseline.p50) &&
      Number.isFinite(rafBaseline.p95) &&
      rafBaseline.p50 > 0 &&
      rafBaseline.p95 <= 55,
    `native rAF timing p50=${rafBaseline.p50.toFixed(1)}ms p95=${rafBaseline.p95.toFixed(1)}ms is invalid`
  );
  check(
    `${scope}/clock`,
    rafBaseline.samples >= 20,
    `native rAF baseline has only ${rafBaseline.samples} samples`
  );
  progress(
    `${scope}/clock native=${rafBaseline.rate.toFixed(1)}Hz p50=${rafBaseline.p50.toFixed(1)}ms p95=${rafBaseline.p95.toFixed(1)}ms`
  );

  await page.goto(`/projects/${auditQuery}`, {
    waitUntil: 'networkidle',
    timeout: navigationTimeout,
  });
  await waitForDebug(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check(scope, overflow <= 1, `page has ${overflow}px horizontal overflow`);
  assertCanvas(scope, await canvasState(page), profile);
  const initial = await snapshot(page);
  assertSnapshot(scope, initial, profile);
  check(scope, lifecycleCount(initial.activeLifecycle) === 0, 'frozen seed started mid-lifecycle');
  check(scope, await canvasHasInk(page), 'background canvas is blank');

  await capture(`${scope}/determinism`, () => auditDeterministicSeed(page, scope));
  assertSnapshot(`${scope}/reload`, await snapshot(page), profile);
  await capture(`${scope}/resize`, () => auditResize(page, scope, profile));
  await capture(`${scope}/lifecycle`, () => auditLifecycleFrames(page, scope));
  await capture(`${scope}/controls`, () => auditCellControls(page, scope, profile));
  await capture(`${scope}/pointer`, () => auditPointerInteractions(page, scope, profile));
  await capture(`${scope}/protected`, () => auditProtectedControl(page, scope, profile));
  await capture(`${scope}/concurrent-clicks`, () =>
    auditConcurrentExplicitClicks(page, scope, profile)
  );
  if (profile.name === 'desktop-light') {
    await capture(`${scope}/timing`, () => auditMitosisTiming(page, scope));
  }
  await capture(`${scope}/theme`, () => auditTheme(page, scope));

  // Pointer-scroll and safe-hit discovery intentionally activate the engine's
  // short scroll throttle. Measure the ordinary profile only after it clears.
  await page.waitForTimeout(720);
  const cadence = await sampleCadence(page, smoke ? 900 : 1_200);
  assertCadence(scope, cadence, profile, rafBaseline);
  assertEngineTimings(scope, await snapshot(page));
  if (profile.name === 'desktop-light' || profile.name === 'phone-light') {
    await capture(`${scope}/content-routes`, () =>
      auditContentRoutes(page, scope, profile, rafBaseline)
    );
  }
  await capture(`${scope}/spa`, () => auditSpaLifecycle(page, scope));
  await capture(`${scope}/home`, () => auditHomeComposite(page, scope, profile, rafBaseline));

  if (browserErrors.length) fail(scope, `browser errors: ${browserErrors.join(' | ')}`);
}

async function auditReducedMotion(browser, baseURL, browserName, profile) {
  const scope = `${browserName}/reduced-motion/${profile.name}`;
  progress(scope);
  const context = await browser.newContext({
    baseURL,
    viewport: { width: profile.width, height: profile.height },
    colorScheme: profile.theme,
    hasTouch: profile.touch,
    isMobile: profile.touch,
    deviceScaleFactor: profile.deviceScaleFactor,
    reducedMotion: 'reduce',
  });
  await context.addInitScript((theme) => {
    localStorage.setItem('khc-theme', theme);
    localStorage.setItem('khc-cell-mode', 'calm');
    sessionStorage.setItem('khc-cell-action', 'divide');
  }, profile.theme);
  const page = await context.newPage();
  page.setDefaultTimeout(actionTimeout);
  const browserErrors = [];
  trackBrowserErrors(page, browserErrors);

  try {
    await page.goto(`/projects/${auditQuery}`, {
      waitUntil: 'networkidle',
      timeout: navigationTimeout,
    });
    await waitForDebug(page);
    const initial = await snapshot(page);
    check(scope, initial.attached === true, 'reduced-motion engine is not attached');
    check(scope, initial.running === false, 'reduced-motion engine is running');
    check(scope, await canvasHasInk(page), 'reduced-motion static frame is blank');
    await page.waitForTimeout(320);
    const stable = await snapshot(page);
    check(
      scope,
      stable.updateCount === initial.updateCount,
      'reduced-motion engine continued updating'
    );
    check(
      scope,
      stable.renderCount === initial.renderCount,
      'reduced-motion engine continued rendering'
    );

    const oldTheme = await page.evaluate(() => document.documentElement.dataset.theme);
    await toggleTheme(page);
    await page.waitForFunction(
      (theme) => document.documentElement.dataset.theme !== theme,
      oldTheme
    );
    await page.waitForTimeout(80);
    const themed = await snapshot(page);
    check(scope, themed.running === false, 'theme change restarted reduced-motion animation');
    check(
      scope,
      themed.renderCount > stable.renderCount,
      'theme change did not redraw reduced-motion frame'
    );
    check(scope, await canvasHasInk(page), 'reduced-motion canvas is blank after theme change');

    await page.setViewportSize({ width: profile.height, height: Math.max(320, profile.width) });
    await page.waitForTimeout(150);
    const resized = await snapshot(page);
    check(scope, resized.running === false, 'resize restarted reduced-motion animation');
    check(
      scope,
      resized.renderCount > themed.renderCount,
      'resize did not redraw reduced-motion frame'
    );
    check(scope, await canvasHasInk(page), 'reduced-motion canvas is blank after resize');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => window.__khcCellsDebug.snapshot().running === true);
    const resumed = await snapshot(page);
    await page.waitForTimeout(180);
    const advanced = await snapshot(page);
    check(
      scope,
      advanced.updateCount > resumed.updateCount,
      'animation did not advance after reduced motion was disabled'
    );

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.__khcCellsDebug.snapshot().running === false);
    if (browserErrors.length) fail(scope, `browser errors: ${browserErrors.join(' | ')}`);
  } finally {
    await page.close();
    await context.close();
  }
}

async function stopPreview(preview) {
  if (!preview) return;
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

async function main() {
  const configuredBase = process.env.CELL_UI_BASE_URL?.replace(/\/$/, '');
  let baseURL = configuredBase;
  let preview = null;
  let previewLog = '';

  if (!baseURL) {
    const port = await availablePort();
    baseURL = `http://127.0.0.1:${port}`;
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    preview = spawn(npm, ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    preview.stdout.on('data', (chunk) => {
      previewLog += chunk;
    });
    preview.stderr.on('data', (chunk) => {
      previewLog += chunk;
    });
  }

  try {
    await waitForSite(`${baseURL}/projects/`, preview);
    for (const [browserName, browserType] of selectedBrowsers()) {
      progress(`${browserName}/start ${baseURL}`);
      const browser = await browserType.launch({ headless: true });
      try {
        for (const profile of selectedProfiles()) {
          const scope = `${browserName}/${profile.name}`;
          progress(scope);
          const context = await browser.newContext({
            baseURL,
            viewport: { width: profile.width, height: profile.height },
            colorScheme: profile.theme,
            hasTouch: profile.touch,
            isMobile: profile.touch,
            deviceScaleFactor: profile.deviceScaleFactor,
          });
          await context.addInitScript((theme) => {
            localStorage.setItem('khc-theme', theme);
            localStorage.setItem('khc-cell-mode', 'calm');
            sessionStorage.setItem('khc-cell-action', 'divide');
          }, profile.theme);
          const page = await context.newPage();
          page.setDefaultTimeout(actionTimeout);
          try {
            await auditPage(page, scope, profile);
          } catch (error) {
            fail(scope, error instanceof Error ? (error.stack ?? error.message) : String(error));
            await page
              .screenshot({
                path: `/tmp/living-cells-${browserName}-${profile.name}.png`,
                fullPage: true,
              })
              .catch(() => {});
          } finally {
            await page.close();
            await context.close();
          }
        }

        const reducedProfiles = smoke
          ? [profiles.find(({ name }) => name === 'phone-light')]
          : profiles.filter(({ name }) => name === 'desktop-light' || name === 'phone-light');
        for (const profile of reducedProfiles.filter(Boolean)) {
          await capture(`${browserName}/reduced-motion/${profile.name}`, () =>
            auditReducedMotion(browser, baseURL, browserName, profile)
          );
        }
      } finally {
        await browser.close();
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
  } finally {
    await stopPreview(preview);
  }

  if (failures.length) {
    console.error(`Living cells UI audit failed with ${failures.length} issue(s):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    if (previewLog.trim()) console.error(`\nPreview output:\n${previewLog.trim()}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Living cells UI audit passed in ${selectedBrowsers()
      .map(([name]) => name)
      .join(
        ' and '
      )} across ${selectedProfiles().length} responsive profile(s)${smoke ? ' (CI smoke)' : ''}.`
  );
}

await main();
