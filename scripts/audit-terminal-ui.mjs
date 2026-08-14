import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import process from 'node:process';
import { chromium, webkit } from 'playwright';

const browserTypes = { chromium, webkit };
const profiles = [
  { name: 'desktop-light', width: 1440, height: 1000, theme: 'light', mobile: false },
  { name: 'desktop-dark', width: 1440, height: 1000, theme: 'dark', mobile: false },
  { name: 'tablet-light', width: 768, height: 900, theme: 'light', mobile: false },
  { name: 'phone-light', width: 390, height: 844, theme: 'light', mobile: true },
  { name: 'phone-dark', width: 390, height: 844, theme: 'dark', mobile: true },
  { name: 'compact-phone', width: 320, height: 568, theme: 'light', mobile: true },
  { name: 'phone-landscape', width: 844, height: 390, theme: 'dark', mobile: true },
];

const routes = [
  { name: 'terminal', path: '/terminal/' },
  { name: 'home', path: '/' },
];
const commands = [
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
  const names = (process.env.TERMINAL_UI_AUDIT_BROWSERS ?? 'chromium,webkit')
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
  if (!names?.length) return profiles;
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
    if (preview?.exitCode !== null) break;
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
    const screenStyle = screen ? getComputedStyle(screen) : null;
    const targets = [...document.querySelectorAll('.term-bar a, .term-bar button, .term-keybar button')]
      .map((el) => {
        const box = el.getBoundingClientRect();
        return { width: box.width, height: box.height, disabled: el.disabled };
      })
      .filter((target) => target.width > 0 && target.height > 0);
    return {
      documentOverflow: root.scrollWidth - root.clientWidth,
      shellOverflow: shell ? shell.scrollWidth - shell.clientWidth : -1,
      screenOverflow: screen ? screen.scrollWidth - screen.clientWidth : -1,
      scrollLeft: screen?.scrollLeft ?? -1,
      overflowX: screenStyle?.overflowX,
      whiteSpace: screenStyle?.whiteSpace,
      inputFontSize: input ? parseFloat(getComputedStyle(input).fontSize) : 0,
      keybarDisplay: keybar ? getComputedStyle(keybar).display : 'missing',
      targetMin: targets.reduce(
        (minimum, target) => Math.min(minimum, target.width, target.height),
        Number.POSITIVE_INFINITY
      ),
    };
  });
  if (result.documentOverflow > 1) fail(scope, `document has ${result.documentOverflow}px horizontal overflow`);
  if (result.shellOverflow > 1) fail(scope, `terminal shell has ${result.shellOverflow}px horizontal overflow`);
  if (result.screenOverflow > 1) fail(scope, `terminal screen has ${result.screenOverflow}px horizontal overflow`);
  if (result.scrollLeft !== 0) fail(scope, `terminal screen retained scrollLeft=${result.scrollLeft}`);
  if (result.overflowX !== 'hidden') fail(scope, `screen overflow-x is ${result.overflowX}, expected hidden`);
  if (result.whiteSpace !== 'pre-wrap') fail(scope, `screen white-space is ${result.whiteSpace}, expected pre-wrap`);
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

  // Keyboard behavior remains available on desktop and browsers with a hardware
  // keyboard, while the accessory row supplies the same actions on phones.
  await page.locator('.term-input').fill('neof');
  await page.keyboard.press('Tab');
  if (!(await page.locator('.term-input').inputValue()).startsWith('neofetch')) {
    fail(scope, 'Tab completion did not complete neofetch');
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
