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

async function auditPage(page, scope, profile, route) {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  // The shell's controller is the readiness signal. Waiting for network-idle here
  // makes the audit needlessly sensitive to a third-party font or an analytics
  // request that keeps a connection open on hosted runners.
  await page.goto(route.path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__terminal));
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
      preview.kill('SIGTERM');
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
