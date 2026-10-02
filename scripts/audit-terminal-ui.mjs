import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import process from 'node:process';
import { chromium, webkit } from 'playwright';

const browserTypes = { chromium, webkit };
const smoke = process.argv.includes('--smoke') || process.env.TERMINAL_UI_AUDIT_MODE === 'smoke';
const profiles = [
  { name: 'desktop-light', width: 1440, height: 1000, theme: 'light', mobile: false },
  { name: 'desktop-dark', width: 1440, height: 1000, theme: 'dark', mobile: false },
  { name: 'tablet-light', width: 768, height: 900, theme: 'light', mobile: false },
  { name: 'phone-light', width: 390, height: 844, theme: 'light', mobile: true },
  { name: 'phone-dark', width: 390, height: 844, theme: 'dark', mobile: true },
  { name: 'compact-phone', width: 320, height: 568, theme: 'light', mobile: true },
  { name: 'phone-landscape', width: 844, height: 390, theme: 'dark', mobile: true },
  { name: 'short-desktop', width: 1440, height: 500, theme: 'dark', mobile: false },
];

const routes = [
  { name: 'terminal', path: '/terminal/' },
  { name: 'home', path: '/' },
];
const commands = smoke ? ['help', 'cat ~/about.txt'] : [
  'help',
  'ls',
  'ls -l ~/publications',
  'tree ~/software',
  'grep splice',
  'cat ~/about.txt',
  'man khc',
  'neofetch',
  'blastn splice',
  'echo https://storage.googleapis.com/storage.khchao.com/a-very-long-resource-name.pdf',
];

const failures = [];
const fail = (scope, message) => failures.push(`${scope}: ${message}`);

function selectedBrowsers() {
  const names = (process.env.TERMINAL_UI_AUDIT_BROWSERS ?? (smoke ? 'chromium' : 'chromium,webkit'))
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return names.map((name) => {
    const browserType = browserTypes[name];
    if (!browserType) throw new Error(`Unsupported TERMINAL_UI_AUDIT_BROWSERS entry: ${name}`);
    return [name, browserType];
  });
}

function selectedProfiles() {
  const names = process.env.TERMINAL_UI_AUDIT_PROFILES
    ?.split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  if (!names?.length) {
    return smoke ? profiles.filter((profile) => ['desktop-light', 'phone-light'].includes(profile.name)) : profiles;
  }
  return names.map((name) => {
    const profile = profiles.find((item) => item.name === name);
    if (!profile) throw new Error(`Unsupported TERMINAL_UI_AUDIT_PROFILES entry: ${name}`);
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
  const port = typeof address === 'object' && address ? address.port : 4321;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForSite(url, preview) {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* preview is still starting */
    }
    if (preview && preview.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Preview did not become available at ${url}`);
}

async function assertLayout(page, scope, profile) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector('.term');
    const screen = document.querySelector('.term-screen');
    const input = document.querySelector('.term-input');
    const keybar = document.querySelector('.term-keybar');
    const latest = document.querySelector('.term-scroll-latest');
    const screenStyle = screen ? getComputedStyle(screen) : null;
    const targets = [...document.querySelectorAll('.term-bar a, .term-bar button, .term-keybar button')]
      .map((el) => {
        const box = el.getBoundingClientRect();
        return { width: box.width, height: box.height, disabled: el.disabled };
      })
      .filter((target) => target.width > 0 && target.height > 0);
    return {
      documentOverflow: root.scrollWidth - root.clientWidth,
      documentVerticalOverflow: root.scrollHeight - root.clientHeight,
      inline: shell?.classList.contains('term--inline') ?? false,
      shellOverflow: shell ? shell.scrollWidth - shell.clientWidth : -1,
      screenOverflow: screen ? screen.scrollWidth - screen.clientWidth : -1,
      screenVerticalOverflow: screen ? screen.scrollHeight - screen.clientHeight : -1,
      scrollLeft: screen?.scrollLeft ?? -1,
      overflowX: screenStyle?.overflowX,
      whiteSpace: screenStyle?.whiteSpace,
      inputFontSize: input ? parseFloat(getComputedStyle(input).fontSize) : 0,
      keybarDisplay: keybar ? getComputedStyle(keybar).display : 'missing',
      latestDisplay: latest ? getComputedStyle(latest).display : 'missing',
      formBottom: document.querySelector('.term-form')?.getBoundingClientRect().bottom ?? 0,
      viewportHeight: window.innerHeight,
      targetMin: targets.reduce(
        (minimum, target) => Math.min(minimum, target.width, target.height),
        Number.POSITIVE_INFINITY
      ),
    };
  });
  if (result.documentOverflow > 1) fail(scope, `document has ${result.documentOverflow}px horizontal overflow`);
  if (!result.inline && result.documentVerticalOverflow > 1) {
    fail(scope, `full terminal has ${result.documentVerticalOverflow}px vertical document overflow`);
  }
  if (result.shellOverflow > 1) fail(scope, `terminal shell has ${result.shellOverflow}px horizontal overflow`);
  if (result.screenOverflow > 1) fail(scope, `terminal screen has ${result.screenOverflow}px horizontal overflow`);
  if (result.scrollLeft !== 0) fail(scope, `terminal screen retained scrollLeft=${result.scrollLeft}`);
  if (result.overflowX !== 'hidden') fail(scope, `screen overflow-x is ${result.overflowX}, expected hidden`);
  if (result.whiteSpace !== 'pre-wrap') fail(scope, `screen white-space is ${result.whiteSpace}, expected pre-wrap`);
  if (!result.inline && result.formBottom > result.viewportHeight + 1) {
    fail(scope, `command row ends at ${result.formBottom}px beyond the viewport`);
  }
  if (profile.mobile && result.inputFontSize < 16) fail(scope, `phone input is ${result.inputFontSize}px, expected at least 16px`);
  if (profile.mobile && result.targetMin < 32) fail(scope, `phone terminal target is ${result.targetMin}px, expected at least 32px`);
  if (profile.mobile && result.keybarDisplay === 'none') fail(scope, 'phone shortcut bar is hidden');
  if (!profile.mobile && result.keybarDisplay !== 'none') fail(scope, 'desktop shortcut bar is visible');
}

async function runCommand(page, scope, command, profile) {
  await page.evaluate(async (line) => {
    await window.__terminal.submit('clear');
    await window.__terminal.submit(line);
  }, command);
  await assertLayout(page, `${scope}/${command}`, profile);
}

async function buildScrollback(page) {
  const repeats = smoke ? 2 : 3;
  await page.evaluate(async (count) => {
    await window.__terminal.submit('clear');
    for (let i = 0; i < count; i++) await window.__terminal.submit('help');
    await window.__terminal.submit('cat ~/about.txt');
  }, repeats);
}

async function readScrollState(page) {
  return page.evaluate(() => {
    const screen = document.querySelector('.term-screen');
    const root = document.documentElement;
    return {
      inline: document.querySelector('.term--inline') !== null,
      screenTop: screen?.scrollTop ?? 0,
      screenMax: screen ? screen.scrollHeight - screen.clientHeight : 0,
      latestHidden: document.querySelector('.term-scroll-latest')?.hasAttribute('hidden') ?? true,
      pageY: window.scrollY,
      pageMax: root.scrollHeight - root.clientHeight,
    };
  });
}

async function assertScrollBehavior(page, scope, profile, route) {
  await buildScrollback(page);
  await assertLayout(page, `${scope}/scrollback`, profile);
  const initial = await readScrollState(page);
  if (initial.screenMax < 40) fail(scope, `scrollback has only ${initial.screenMax}px of internal vertical range`);
  if (!initial.inline && initial.pageMax > 1) fail(scope, `full terminal page has ${initial.pageMax}px vertical overflow`);

  const screen = page.locator('.term-screen');
  await screen.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const atEnd = await readScrollState(page);
  const wheelSupported = !(profile.mobile && scope.startsWith('webkit/'));
  if (wheelSupported) {
    await screen.hover({ position: { x: 20, y: 20 } });
    await page.mouse.wheel(0, -Math.min(450, Math.max(120, atEnd.screenMax / 3)));
    await page.waitForTimeout(80);
  } else {
    // Playwright's mobile WebKit context intentionally has no synthetic wheel
    // device. The native scroll range and keyboard path are still verified here;
    // Chromium covers the real wheel gesture on touch-sized viewports.
    await screen.evaluate((element) => { element.scrollTop = Math.max(0, element.scrollTop - 450); });
    await page.waitForTimeout(40);
  }
  const afterWheel = await readScrollState(page);
  if (afterWheel.screenTop >= atEnd.screenMax - 2) fail(scope, 'wheel did not move terminal scrollback');
  if (!afterWheel.latestHidden) {
    await page.locator('[data-terminal-scroll-end]').click();
    const restored = await readScrollState(page);
    if (restored.screenTop < restored.screenMax - 2 || !restored.latestHidden) {
      fail(scope, 'latest-output control did not restore the prompt');
    }
  } else {
    fail(scope, 'latest-output control stayed hidden after scrolling up');
  }

  await page.locator('.term-input').focus();
  await page.keyboard.press('Shift+PageUp');
  const afterPageUp = await readScrollState(page);
  if (afterPageUp.screenTop >= afterPageUp.screenMax - 2) fail(scope, 'Shift-PageUp did not move terminal history');

  if (route.name !== 'home' || !wheelSupported) return;

  // The inline shell should consume wheel movement while it has scrollback, then
  // return the gesture to the surrounding document at either boundary.
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    const shell = document.querySelector('.term--inline');
    const screen = document.querySelector('.term-screen');
    if (!shell || !screen) return;
    screen.scrollTop = screen.scrollHeight;
    window.scrollTo(0, Math.max(0, shell.getBoundingClientRect().top + window.scrollY - 260));
  });
  await page.waitForTimeout(80);
  await screen.hover({ position: { x: 20, y: 20 } });
  const boundaryStart = await readScrollState(page);
  await page.mouse.wheel(0, 140);
  await page.waitForTimeout(50);
  await page.mouse.wheel(0, 140);
  await page.waitForTimeout(80);
  const boundaryDown = await readScrollState(page);
  if (boundaryDown.pageY <= boundaryStart.pageY) fail(scope, 'homepage did not resume page scrolling at transcript bottom');

  await page.evaluate(() => {
    const screen = document.querySelector('.term-screen');
    if (screen) screen.scrollTop = 0;
    window.scrollTo(0, Math.min(document.documentElement.scrollHeight, window.scrollY + 500));
  });
  await page.waitForTimeout(80);
  const boundaryTopStart = await readScrollState(page);
  await page.mouse.wheel(0, -140);
  await page.waitForTimeout(50);
  await page.mouse.wheel(0, -140);
  await page.waitForTimeout(80);
  const boundaryUp = await readScrollState(page);
  if (boundaryUp.pageY >= boundaryTopStart.pageY) fail(scope, 'homepage did not resume page scrolling at transcript top');
}

/** What the homepage card looks like right now: placement, state, and what the demo has done. */
async function readHomeShell(page) {
  return page.evaluate(() => {
    const rect = (el) => el?.getBoundingClientRect();
    const shell = document.querySelector('.term--inline');
    const name = document.querySelector('.hero-name');
    const slot = document.querySelector('.hero-terminal');
    const screen = document.querySelector('.term-screen');
    const input = document.querySelector('.term-input');
    const bar = document.querySelector('.term-bar');
    const dot = document.querySelector('[data-terminal-min]');
    return {
      count: document.querySelectorAll('[data-terminal]').length,
      collapsed: shell?.classList.contains('term--min') ?? false,
      expanded: dot?.getAttribute('aria-expanded'),
      label: dot?.getAttribute('aria-label'),
      screenDisplay: screen ? getComputedStyle(screen).display : 'missing',
      inHero: Boolean(slot?.closest('.hero')),
      inSection: Boolean(slot?.closest('.home-section')),
      directlyAfterName: Boolean(name) && name.nextElementSibling === slot,
      below: Boolean(rect(slot) && rect(name)) && rect(slot).top >= rect(name).bottom - 1,
      withinColumn: Boolean(rect(shell) && rect(slot)) && rect(shell).right <= rect(slot).right + 1,
      actionsBelow: Boolean(rect(slot) && rect(document.querySelector('.hero-actions'))) &&
        rect(document.querySelector('.hero-actions')).top >= rect(slot).bottom - 1,
      // The hero clips its own overflow, so a card that is too wide never shows up as
      // document overflow: it is simply cut off at the viewport. Measure it directly.
      cardRight: rect(shell)?.right ?? 0,
      cardLeft: rect(shell)?.left ?? 0,
      viewportWidth: window.innerWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      barHeight: rect(bar)?.height ?? 0,
      shellHeight: rect(shell)?.height ?? 0,
      demoing: window.__terminal.demoing(),
      // Typed-but-unsent characters count too: a demo mid-sentence has written no line yet.
      progress: (input?.value.length ?? 0) + (screen?.textContent ?? '').length,
      text: screen?.textContent ?? '',
      prompt: document.querySelector('[data-terminal-prompt]')?.textContent ?? '',
    };
  });
}

/**
 * The homepage card lives collapsed under "About my name", and its demo is owned by its
 * visibility. A collapsed card must not type to nobody, must not fetch the knowledge index,
 * and above all must not swallow the keys of someone scrolling past it — the takeover
 * listener is on the whole document. Leaves the card open and taken over, ready for the
 * ordinary checks that follow.
 */
async function assertHomeLifecycle(page, scope, profile, indexRequests) {
  const s = `${scope}/collapsed`;
  const start = await readHomeShell(page);
  if (start.count !== 1) fail(s, `${start.count} terminals on the homepage, expected exactly one`);
  if (!start.collapsed) fail(s, 'the homepage shell did not start collapsed');
  if (start.expanded !== 'false') fail(s, `restore control aria-expanded is ${start.expanded}`);
  if (start.label !== 'Restore the terminal') fail(s, `restore control is labelled "${start.label}"`);
  if (start.screenDisplay !== 'none') fail(s, `screen is ${start.screenDisplay} while collapsed`);
  if (!start.inHero) fail(s, 'the shell is not inside the hero');
  if (start.inSection) fail(s, 'the shell is still wrapped in a standalone homepage section');
  if (!start.directlyAfterName) fail(s, 'the shell does not directly follow "About my name"');
  if (!start.below) fail(s, 'the shell is not below "About my name"');
  if (!start.withinColumn) fail(s, 'the card is wider than its hero column');
  if (!start.actionsBelow) fail(s, 'the hero actions appear before the name and terminal');
  if (start.overflow > 1) fail(s, `document has ${start.overflow}px horizontal overflow while collapsed`);
  if (start.shellHeight - start.barHeight > 8) {
    fail(s, `collapsed card is ${start.shellHeight}px tall around a ${start.barHeight}px bar`);
  }

  // Quiet while collapsed: wait longer than the demo's 400 ms start-up, then look.
  await page.waitForTimeout(1600);
  const idle = await readHomeShell(page);
  if (idle.demoing) fail(s, 'the demo is running while the card is collapsed');
  if (idle.progress > 0) fail(s, 'the demo typed into a collapsed card');
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(150);
  const keyed = await readHomeShell(page);
  if (keyed.demoing || keyed.progress > 0 || keyed.text.includes('— ready.')) {
    fail(s, 'a key pressed while collapsed was taken as an interaction');
  }
  if (indexRequests.length) {
    fail(s, `terminal.json was requested ${indexRequests.length}x before the card was opened`);
  }

  // Opening it (by the title bar) starts the demo, and the prompt is measured for real:
  // a pane that was hidden when it mounted reads 24 columns, which is the short prompt.
  await page.locator('.term-bar-title').click();
  const opened = await readHomeShell(page);
  if (opened.collapsed || opened.expanded !== 'true') fail(s, 'the title bar did not open the card');
  if (opened.cardRight > opened.viewportWidth + 1 || opened.cardLeft < -1) {
    fail(
      s,
      `the open card spans ${Math.round(opened.cardLeft)}–${Math.round(opened.cardRight)}px on a ` +
        `${opened.viewportWidth}px viewport (cut off by the hero's overflow clip)`
    );
  }
  if (!opened.withinColumn) fail(s, 'the open card is wider than its hero column');
  await page.waitForFunction(() => window.__terminal.demoing(), null, { timeout: 5_000 });
  await page.waitForFunction(
    () => {
      const input = document.querySelector('.term-input');
      return (input?.value.length ?? 0) > 0 || (document.querySelector('.term-screen')?.textContent ?? '').length > 0;
    },
    null,
    { timeout: 6_000 }
  );
  if (profile.width >= 768 && !opened.prompt.startsWith('khc@genome')) {
    fail(s, `prompt is "${opened.prompt}" on a ${profile.width}px viewport, expected the full host`);
  }

  // Scrolling over window chrome is not shell interaction; the gesture stays native.
  const wheelSupported = !(profile.mobile && scope.startsWith('webkit/'));
  if (wheelSupported) {
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.__terminalAuditChromeWheelBar = null;
      document.addEventListener('wheel', (event) => {
        window.__terminalAuditChromeWheelBar = Boolean(event.target.closest('[data-terminal-bar]'));
      }, { capture: true, once: true });
    });
    await page.locator('[data-terminal-bar]').hover({ position: { x: 20, y: 20 } });
    // A small delta keeps the pointer over the bar as native document scrolling moves it.
    await page.mouse.wheel(0, 1);
    await page.waitForTimeout(150);
    const wheelHitBar = await page.evaluate(() => {
      const hit = window.__terminalAuditChromeWheelBar;
      delete window.__terminalAuditChromeWheelBar;
      return hit;
    });
    if (wheelHitBar !== true) fail(s, 'native wheel did not target window chrome');
    const afterChromeWheel = await readHomeShell(page);
    if (!afterChromeWheel.demoing) fail(s, 'wheel over window chrome took over the demo');
    if (indexRequests.length) fail(s, 'wheel over window chrome fetched terminal.json');
    // Avoid cascading resume timeouts after a failed chrome-ownership assertion.
    if (!afterChromeWheel.demoing) return;
  }

  // Minimise by the yellow dot mid-demo: it pauses, stops listening, and keeps its place.
  await page.locator('[data-terminal-min]').click();
  const paused = await readHomeShell(page);
  if (!paused.collapsed || paused.demoing) fail(s, 'minimising did not pause the demo');
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(700);
  const quiet = await readHomeShell(page);
  if (quiet.demoing || quiet.progress !== paused.progress || quiet.text.includes('— ready.')) {
    fail(s, 'the demo kept running, or a key was taken over, while minimised');
  }
  if (indexRequests.length) fail(s, 'terminal.json was requested by a minimised card');

  // Restore: it resumes where it stopped rather than starting again.
  await page.locator('[data-terminal-min]').click();
  await page.waitForFunction(() => window.__terminal.demoing(), null, { timeout: 5_000 });
  const resumed = await readHomeShell(page);
  if (resumed.progress < paused.progress) fail(s, 'the demo restarted instead of resuming');

  // Keyboard activation of window chrome is still window management, not shell input.
  await page.locator('[data-terminal-min]').focus();
  await page.keyboard.press('Enter');
  const keyboardPaused = await readHomeShell(page);
  if (!keyboardPaused.collapsed || keyboardPaused.demoing || keyboardPaused.text.includes('— ready.')) {
    fail(s, 'keyboard minimisation took over the demo instead of pausing it');
  }
  if (indexRequests.length) fail(s, 'keyboard window chrome fetched terminal.json');
  await page.locator('[data-terminal-min]').press('Enter');
  await page.waitForFunction(() => window.__terminal.demoing(), null, { timeout: 5_000 });

  // Close mid-demo, then press a page key while its only visible control is the reopen chip.
  await page.locator('[data-terminal-close]').click();
  const closed = await readHomeShell(page);
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(700);
  const closedIdle = await readHomeShell(page);
  if (closedIdle.demoing || closedIdle.progress !== closed.progress || closedIdle.text.includes('— ready.')) {
    fail(s, 'the closed card kept typing or took over a page key');
  }
  if (indexRequests.length) fail(s, 'closing the demo fetched terminal.json');
  await page.locator('[data-terminal-reopen]').press('Enter');
  await page.waitForFunction(() => window.__terminal.demoing(), null, { timeout: 5_000 });
  if ((await readHomeShell(page)).progress < closed.progress) fail(s, 'reopening restarted the demo');

  // Scrolling the transcript is real interaction, unlike scrolling over its chrome.
  if (wheelSupported) {
    await page.locator('.term-screen').hover({ position: { x: 24, y: 24 } });
    await page.mouse.wheel(0, 40);
  } else {
    await page.locator('.term-screen').click({ position: { x: 24, y: 24 } });
  }
  await page.waitForFunction(() => !window.__terminal.demoing(), null, { timeout: 5_000 });
  for (let i = 0; i < 40 && !indexRequests.length; i += 1) await page.waitForTimeout(100);
  if (!indexRequests.length) fail(s, 'taking over the shell did not fetch the knowledge index');
}

async function assertReducedHomeLifecycle(page, scope) {
  const indexRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/terminal.json') indexRequests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__terminal));
  await page.waitForTimeout(700);
  const collapsed = await readHomeShell(page);
  if (!collapsed.collapsed || collapsed.demoing || collapsed.progress) fail(scope, 'reduced-motion demo painted while collapsed');
  await page.locator('[data-terminal-min]').press('Enter');
  const opened = await readHomeShell(page);
  if (opened.collapsed || opened.demoing || !opened.text.includes('whoami')) {
    fail(scope, 'reduced motion did not show a static transcript on restore');
  }
  await page.waitForTimeout(700);
  if ((await readHomeShell(page)).progress !== opened.progress) fail(scope, 'reduced-motion transcript animated');
  await page.locator('[data-terminal-close]').click();
  await page.locator('[data-terminal-reopen]').press('Enter');
  if ((await readHomeShell(page)).text !== opened.text) fail(scope, 'reduced-motion reopen duplicated its transcript');
  if (indexRequests.length) fail(scope, 'reduced-motion demo fetched terminal.json before real interaction');
  await page.locator('.term-input').fill('help');
  await page.locator('.term-input').press('Enter');
  if (!(await page.locator('.term-screen').textContent()).includes('khcOS shell')) fail(scope, 'reduced-motion shell did not accept commands');
}

async function auditPage(page, scope, profile, route) {
  const pageErrors = [];
  const indexRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/terminal.json') indexRequests.push(request.url());
  });
  // The shell's controller is the readiness signal. Waiting for network-idle here
  // makes the audit needlessly sensitive to a third-party font or an analytics
  // request that keeps a connection open on hosted runners.
  await page.goto(route.path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__terminal));
  if (route.name === 'home') await assertHomeLifecycle(page, scope, profile, indexRequests);
  await page.evaluate(() => {
    window.__terminal.skipBoot?.();
    window.__terminal.takeOver?.();
  });
  await page.waitForFunction(() => !window.__terminal.booting());
  await assertLayout(page, scope, profile);

  for (const command of commands) await runCommand(page, scope, command, profile);
  await assertScrollBehavior(page, scope, profile, route);

  // Keyboard behavior remains available on desktop and browsers with a hardware
  // keyboard, while the accessory row supplies the same actions on phones.
  await page.locator('.term-input').fill('neof');
  await page.keyboard.press('Tab');
  if (!(await page.locator('.term-input').inputValue()).startsWith('neofetch')) {
    fail(scope, 'Tab completion did not complete neofetch');
  }
  await page.locator('.term-input').fill('pwd');
  await page.locator('.term-input').press('Enter');
  if (!(await page.locator('.term-screen').textContent()).includes('pwd')) {
    fail(scope, 'form Enter did not execute a command');
  }
  await page.locator('.term-input').fill('neof');
  await page.locator('.term-input').press('Shift+Tab');
  if (await page.locator('.term-input').evaluate((element) => document.activeElement === element)) {
    fail(scope, 'Shift-Tab was intercepted by command completion');
  }
  await page.evaluate(() => window.__terminal.submit('pwd'));
  await page.locator('.term-input').press('ArrowUp');
  if ((await page.locator('.term-input').inputValue()) !== 'pwd') fail(scope, 'history up did not recall pwd');
  await page.locator('.term-input').press('Control+L');
  if ((await page.locator('.term-screen').textContent())?.trim()) fail(scope, 'Control-L did not clear the screen');

  if (profile.mobile) {
    await page.locator('[data-terminal-action="ask"]').click();
    if (!(await page.locator('.term-input').inputValue()).startsWith('ask ')) {
      fail(scope, 'Ask shortcut did not insert the command prefix');
    }
    await page.locator('[data-terminal-action="command"][data-terminal-command="help"]').click();
    if (!(await page.locator('.term-screen').textContent()).includes('khcOS shell')) {
      fail(scope, 'Help shortcut did not execute help');
    }
  }

  if (await page.locator('[data-terminal-theme]').count()) {
    const themeBefore = await page.locator('html').getAttribute('data-theme');
    await page.locator('[data-terminal-theme]').click();
    const themeAfter = await page.locator('html').getAttribute('data-theme');
    if (themeBefore === themeAfter) fail(scope, 'theme control did not change the theme');
  }

  await page.locator('[data-terminal-min]').click();
  if ((await page.locator('[data-terminal-min]').getAttribute('aria-expanded')) !== 'false') {
    fail(scope, 'minimize did not update aria-expanded');
  }
  await page.locator('.term-bar-title').click();
  if ((await page.locator('[data-terminal-min]').getAttribute('aria-expanded')) !== 'true') {
    fail(scope, 'title bar did not restore minimized terminal');
  }

  if (route.name === 'home') {
    await page.locator('[data-terminal-close]').click();
    if (!(await page.locator('.term').evaluate((el) => el.classList.contains('term--closed')))) {
      fail(scope, 'homepage close control did not close the shell');
    }
    await page.locator('[data-terminal-reopen]').click();
    if (await page.locator('.term').evaluate((el) => el.classList.contains('term--closed'))) {
      fail(scope, 'homepage reopen control did not restore the shell');
    }
  }

  if (pageErrors.length) fail(scope, `browser errors: ${pageErrors.join(' | ')}`);
}

async function main() {
  const configuredBase = process.env.TERMINAL_UI_BASE_URL?.replace(/\/$/, '');
  let baseURL = configuredBase;
  let preview = null;
  let previewLog = '';

  if (!baseURL) {
    const port = await availablePort();
    baseURL = `http://127.0.0.1:${port}`;
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    preview = spawn(npm, ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      // npm launches Astro as a child process. On POSIX runners, put the whole
      // preview tree in its own process group so cleanup cannot leave Astro (and
      // its stdout pipe) orphaned after the audit has passed.
      detached: process.platform !== 'win32',
    });
    preview.stdout.on('data', (chunk) => { previewLog += chunk; });
    preview.stderr.on('data', (chunk) => { previewLog += chunk; });
  }

  try {
    await waitForSite(`${baseURL}/terminal/`, preview);
    for (const [browserName, browserType] of selectedBrowsers()) {
      console.log(`[terminal-ui] ${browserName}/start ${baseURL}`);
      const browser = await browserType.launch({ headless: true });
      try {
        for (const profile of selectedProfiles()) {
          const context = await browser.newContext({
            baseURL,
            viewport: { width: profile.width, height: profile.height },
            colorScheme: profile.theme,
            hasTouch: profile.mobile,
            isMobile: profile.mobile,
          });
          await context.addInitScript((theme) => localStorage.setItem('khc-theme', theme), profile.theme);
          for (const route of routes) {
            const scope = `${browserName}/${profile.name}/${route.name}`;
            console.log(`[terminal-ui] ${scope}`);
            const page = await context.newPage();
            page.setDefaultTimeout(15_000);
            try {
              await auditPage(page, scope, profile, route);
              if (route.name === 'home') {
                await assertReducedHomeLifecycle(page, `${scope}/reduced-motion`);
              }
            } catch (error) {
              fail(scope, error instanceof Error ? error.stack ?? error.message : String(error));
            } finally {
              await page.close();
            }
          }
          await context.close();
        }
      } finally {
        await browser.close();
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
  } finally {
    if (preview) {
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
  }

  if (failures.length) {
    console.error(`Terminal UI audit failed with ${failures.length} issue(s):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    if (previewLog.trim()) console.error(`\nPreview output:\n${previewLog.trim()}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Terminal UI audit passed for ${routes.length} routes across ${selectedBrowsers()
      .map(([name]) => name)
      .join(' and ')} and ${selectedProfiles().length} responsive profiles.`
  );
}

await main();
