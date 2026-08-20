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
const auditQuery = '?cell-audit=1';

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
        typeof window.__khcCellsDebug.setCellState === 'function'
      ),
    undefined,
    { timeout: actionTimeout }
  );
}

async function snapshot(page) {
  return page.evaluate(() => window.__khcCellsDebug.snapshot());
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
  const dprCap = profile.touch ? 1.5 : 2;
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

function assertSnapshot(scope, state) {
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
  check(scope, lifecycleCount(state.activeLifecycle) <= 1, 'too many concurrent lifecycle events');

  for (const cell of state.cells ?? []) {
    const r = cellRadius(cell);
    check(scope, cell.id !== undefined && cell.id !== null, 'cell is missing a stable id');
    check(
      scope,
      Number.isFinite(cell.x) && Number.isFinite(cell.y),
      `cell ${cell.id} has invalid coordinates`
    );
    check(scope, Number.isFinite(r) && r > 0, `cell ${cell.id} has invalid radius`);
    check(scope, typeof cell.state === 'string', `cell ${cell.id} has no state`);
  }
}

async function findCellPoint(page, excludedIds = []) {
  return page.evaluate((excluded) => {
    const blocked =
      'a, button, input, select, textarea, summary, label, [role="button"], [role="menuitem"], [contenteditable="true"]';
    const state = window.__khcCellsDebug.snapshot();
    for (const cell of state.cells) {
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
      ];
      for (const [ox, oy] of offsets) {
        const x = cell.x + radius * ox;
        const y = cell.y + radius * oy;
        if (x < 2 || y < 2 || x > innerWidth - 2 || y > innerHeight - 2) continue;
        const target = document.elementFromPoint(x, y);
        if (target && !target.closest(blocked)) return { id: cell.id, x, y, radius };
      }
    }
    return null;
  }, excludedIds.map(String));
}

async function findEmptyPoint(page) {
  return page.evaluate(() => {
    const blocked =
      'a, button, input, select, textarea, summary, label, [role="button"], [role="menuitem"], [contenteditable="true"]';
    const cells = window.__khcCellsDebug.snapshot().cells;
    for (let gy = 1; gy <= 7; gy += 1) {
      for (let gx = 1; gx <= 9; gx += 1) {
        const x = (innerWidth * gx) / 10;
        const y = (innerHeight * gy) / 8;
        const target = document.elementFromPoint(x, y);
        if (!target || target.closest(blocked)) continue;
        const clear = cells.every((cell) => {
          const radius = Number(cell.radius ?? cell.baseRadius ?? 0);
          return Math.hypot(cell.x - x, cell.y - y) > radius * 1.7 + 10;
        });
        if (clear) return { x, y };
      }
    }
    return null;
  });
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

async function auditLifecycleFrames(page, scope) {
  const point = await findCellPoint(page);
  if (!point) throw new Error('could not find a visible cell for lifecycle phase checks');
  const phases = [
    ['mitosis', 0.05],
    ['mitosis', 0.28],
    ['mitosis', 0.48],
    ['mitosis', 0.74],
    ['mitosis', 0.95],
    ['apoptosis', 0.05],
    ['apoptosis', 0.35],
    ['apoptosis', 0.65],
    ['apoptosis', 0.8],
  ];

  let previousState = '';
  for (const [state, phase] of phases) {
    if (previousState && previousState !== state) {
      await setCellState(page, point.id, 'mature');
    }
    const before = await snapshot(page);
    await setCellState(page, point.id, state, phase);
    await page.waitForTimeout(80);
    const after = await snapshot(page);
    const cell = after.cells.find((item) => String(item.id) === String(point.id));
    check(scope, Boolean(cell), `cell ${point.id} disappeared at ${state} ${phase}`);
    check(scope, cell?.state === state, `cell ${point.id} did not enter ${state} at ${phase}`);
    check(
      scope,
      after.renderCount > before.renderCount,
      `${state} ${phase} did not render a new frame`
    );
    previousState = state;
  }

  await setCellState(page, point.id, 'mature');
}

async function auditPointerInteractions(page, scope, profile) {
  let point = null;
  let stationaryTapPassed = false;
  for (let attempt = 0; attempt < 2 && !stationaryTapPassed; attempt += 1) {
    await normalizeCells(page);
    point = await findCellPoint(page);
    if (!point) throw new Error('could not find a visible noninteractive cell hit point');
    const beforeTap = await snapshot(page);
    if (profile.touch) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    try {
      await page.waitForFunction(
        ({ cellId, clickRequests }) => {
          const state = window.__khcCellsDebug.snapshot();
          const cell = state.cells.find((item) => String(item.id) === String(cellId));
          return state.counters.clickRequests > clickRequests && cell?.state === 'mitosis';
        },
        { cellId: point.id, clickRequests: beforeTap.counters.clickRequests },
        { timeout: 1_500 }
      );
      stationaryTapPassed = true;
    } catch {
      await page.waitForTimeout(60);
    }
  }
  if (!stationaryTapPassed || !point)
    throw new Error('stationary cell tap did not request and begin mitosis after two attempts');

  await setCellState(page, point.id, 'mature');
  await page.waitForTimeout(40);
  point = (await findCellPoint(page)) ?? point;
  const beforeDrag = await snapshot(page);
  const beforeCell = beforeDrag.cells.find((cell) => String(cell.id) === String(point.id));

  if (profile.touch) {
    await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y) ?? document.body;
      const emit = (type, nextY) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 31,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: nextY,
          })
        );
      emit('pointerdown', y);
      emit('pointermove', y - 40);
      emit('pointermove', y - 100);
      emit('pointerup', y - 130);
      window.scrollBy(0, Math.min(320, document.documentElement.scrollHeight - innerHeight));
    }, point);
    await page.waitForTimeout(80);
    const afterScroll = await snapshot(page);
    const afterCell = afterScroll.cells.find((cell) => String(cell.id) === String(point.id));
    check(
      scope,
      windowOrZero(await page.evaluate(() => scrollY)) > 0,
      'touch scroll probe did not move the page'
    );
    check(scope, afterCell?.state !== 'mitosis', 'touch scroll gesture triggered mitosis');
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

  const empty = await findEmptyPoint(page);
  if (!empty) throw new Error('could not find an empty noninteractive background point');
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

function windowOrZero(value) {
  return Number.isFinite(value) ? value : 0;
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
  await page.waitForFunction((theme) => document.documentElement.dataset.theme !== theme, oldTheme);
  await page.waitForTimeout(60);
  const after = await snapshot(page);
  check(
    scope,
    after.renderCount > before.renderCount,
    'theme change did not render the background'
  );
  check(scope, await canvasHasInk(page), 'canvas is blank after theme change');
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
      rafP95: quantile(0.95),
      rafWorst: sorted.at(-1) ?? Infinity,
      longFrameWorst: longFrames.length ? Math.max(...longFrames) : 0,
    };
  }, duration);
}

function assertCadence(scope, result, profile) {
  const minRenderRate = profile.touch ? 12 : 18;
  const maxRenderRate = profile.touch ? 42 : 78;
  check(scope, result.updateRate >= 18, `update rate ${result.updateRate.toFixed(1)}/s is too low`);
  check(
    scope,
    result.updateRate <= 130,
    `update rate ${result.updateRate.toFixed(1)}/s is unbounded`
  );
  check(
    scope,
    result.renderRate >= minRenderRate,
    `render rate ${result.renderRate.toFixed(1)}/s is too low`
  );
  check(
    scope,
    result.renderRate <= maxRenderRate,
    `render rate ${result.renderRate.toFixed(1)}/s exceeds profile budget`
  );
  check(scope, result.rafP95 <= 60, `page rAF p95 is ${result.rafP95.toFixed(1)}ms`);
  check(scope, result.rafWorst <= 180, `page rAF worst frame is ${result.rafWorst.toFixed(1)}ms`);
  check(
    scope,
    result.longFrameWorst <= 180,
    `long animation frame reached ${result.longFrameWorst.toFixed(1)}ms`
  );
  progress(
    `${scope}/cadence updates=${result.updateRate.toFixed(1)}/s renders=${result.renderRate.toFixed(1)}/s p95=${result.rafP95.toFixed(1)}ms`
  );
}

async function navigateWithAudit(page, path, expectedSelector) {
  const urlReady = page.waitForURL((url) => url.pathname === path.split('?')[0], {
    timeout: navigationTimeout,
  });
  await page.evaluate((targetPath) => {
    const basePath = targetPath.split('?')[0];
    let link = document.querySelector(`a[href="${basePath}"]`);
    if (!(link instanceof HTMLAnchorElement)) {
      link = document.createElement('a');
      link.hidden = true;
      document.body.append(link);
    }
    link.href = targetPath;
    link.click();
  }, path);
  await urlReady;
  await page.locator(expectedSelector).waitFor({ state: 'attached', timeout: navigationTimeout });
  await page.waitForTimeout(80);
}

async function auditSpaLifecycle(page, scope) {
  const navigationToken = `cells-${Date.now()}-${Math.random()}`;
  await page.evaluate((token) => {
    window.__khcCellsAuditNavigationToken = token;
  }, navigationToken);
  await navigateWithAudit(page, `/terminal/${auditQuery}`, '[data-terminal]');
  await waitForDebug(page);
  check(
    scope,
    await page.evaluate(
      (token) => window.__khcCellsAuditNavigationToken === token,
      navigationToken
    ),
    'terminal navigation performed a full reload instead of an SPA swap'
  );
  const terminalStart = await snapshot(page);
  check(scope, terminalStart.attached === false, 'engine remained attached on bare terminal route');
  check(scope, terminalStart.running === false, 'engine kept running on bare terminal route');
  check(
    scope,
    (await canvasState(page)) === null,
    'background canvas remained on bare terminal route'
  );
  await page.waitForTimeout(320);
  const terminalEnd = await snapshot(page);
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

  await navigateWithAudit(page, `/${auditQuery}`, '[data-hero-canvas]');
  await waitForDebug(page);
  check(
    scope,
    await page.evaluate(
      (token) => window.__khcCellsAuditNavigationToken === token,
      navigationToken
    ),
    'homepage return performed a full reload instead of an SPA swap'
  );
  await page.waitForFunction(() => {
    const state = window.__khcCellsDebug.snapshot();
    return state.attached === true && state.running === true;
  });
  const returned = await snapshot(page);
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

async function auditHomeComposite(page, scope, profile) {
  // Let HeroBackground finish its first mount frames before measuring steady cadence.
  await page.waitForTimeout(300);
  const state = await snapshot(page);
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
  if (profile.touch) {
    const heroIsStatic = await page.evaluate(async () => {
      const canvas = document.querySelector('[data-hero-canvas]');
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      const before = canvas.toDataURL();
      await new Promise((resolve) => setTimeout(resolve, 180));
      return before === canvas.toDataURL();
    });
    check(scope, heroIsStatic, 'touch homepage ran a second full-canvas animation');
  }
  const cadence = await sampleCadence(page, 900);
  assertCadence(`${scope}/home`, cadence, profile);
  check(
    scope,
    cadence.renderRate <= (profile.touch ? 26 : 50),
    `homepage cell render rate ${cadence.renderRate.toFixed(1)}/s exceeds its calm profile`
  );
}

async function auditPage(page, scope, profile) {
  const browserErrors = [];
  trackBrowserErrors(page, browserErrors);

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
  assertSnapshot(scope, await snapshot(page));
  check(scope, await canvasHasInk(page), 'background canvas is blank');

  await capture(`${scope}/resize`, () => auditResize(page, scope, profile));
  await capture(`${scope}/lifecycle`, () => auditLifecycleFrames(page, scope));
  await capture(`${scope}/pointer`, () => auditPointerInteractions(page, scope, profile));
  await capture(`${scope}/theme`, () => auditTheme(page, scope));

  const cadence = await sampleCadence(page, smoke ? 550 : 1_200);
  assertCadence(scope, cadence, profile);
  await capture(`${scope}/spa`, () => auditSpaLifecycle(page, scope));
  await capture(`${scope}/home`, () => auditHomeComposite(page, scope, profile));

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
  await context.addInitScript((theme) => localStorage.setItem('khc-theme', theme), profile.theme);
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
          await context.addInitScript(
            (theme) => localStorage.setItem('khc-theme', theme),
            profile.theme
          );
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
