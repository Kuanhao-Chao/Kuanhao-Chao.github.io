import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import process from 'node:process';
import { chromium, webkit } from 'playwright';

const browserTypes = { chromium, webkit };
const profiles = [
  { name: 'desktop-light', width: 1440, height: 1000, theme: 'light', touch: false },
  { name: 'desktop-dark', width: 1440, height: 1000, theme: 'dark', touch: false },
  { name: 'phone-light', width: 390, height: 844, theme: 'light', touch: true },
  { name: 'phone-dark', width: 390, height: 844, theme: 'dark', touch: true },
];

const failures = [];
const fail = (scope, message) => failures.push(`${scope}: ${message}`);

function selectedBrowsers() {
  const names = (process.env.GAME_UI_AUDIT_BROWSERS ?? 'chromium,webkit')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return names.map((name) => {
    const browserType = browserTypes[name];
    if (!browserType) throw new Error(`Unsupported GAME_UI_AUDIT_BROWSERS entry: ${name}`);
    return [name, browserType];
  });
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4391;
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

async function expect(scope, condition, message) {
  if (!(await condition)) fail(scope, message);
}

async function auditGame(page, scope, profile) {
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });

  await page.goto('/games/genome-jumper/?seed=2026', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__genomeJumper));

  await expect(
    scope,
    () => page.title().then((title) => title.includes('Genome Jumper')),
    'page title is missing'
  );
  await expect(
    scope,
    () => page.locator('[data-jumper-canvas]').isVisible(),
    'canvas is not visible'
  );
  await expect(
    scope,
    () =>
      page
        .locator('[data-jumper-canvas]')
        .evaluate((canvas) => canvas.width > 0 && canvas.height > 0),
    'canvas backing store has zero size'
  );
  await expect(
    scope,
    () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      ),
    'page has horizontal overflow'
  );
  await expect(
    scope,
    () => page.evaluate(() => window.__genomeJumperInstances === 1),
    'expected exactly one game controller'
  );

  const touchTargets = page.locator(
    '[data-jumper-fire], [data-jumper-share], [data-jumper-pause], [data-jumper-restart], [data-jumper-sound]'
  );
  for (let index = 0; index < (await touchTargets.count()); index++) {
    const box = await touchTargets.nth(index).boundingBox();
    if (!box || box.height < 43.5)
      fail(scope, `control ${index + 1} is smaller than 44 CSS pixels`);
  }

  if (profile.touch) {
    const canvas = page.locator('[data-jumper-canvas]');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas has no bounding box');
    await canvas.dispatchEvent('pointerdown', {
      pointerId: 7,
      pointerType: 'touch',
      clientX: box.x + box.width * 0.2,
      clientY: box.y + box.height * 0.7,
      isPrimary: true,
    });
    await page.evaluate(() => window.__genomeJumper?.tick(12));
    await canvas.dispatchEvent('pointerup', {
      pointerId: 7,
      pointerType: 'touch',
      clientX: box.x + box.width * 0.2,
      clientY: box.y + box.height * 0.7,
      isPrimary: true,
    });
    await expect(
      scope,
      () => page.evaluate(() => (window.__genomeJumper?.state().player.vx ?? 0) < 0),
      'touch steering did not accelerate left'
    );
  } else {
    await page.evaluate(() => window.__genomeJumper?.start());
    await page.keyboard.down('ArrowRight');
    await page.evaluate(() => window.__genomeJumper?.tick(12));
    await page.keyboard.up('ArrowRight');
    await expect(
      scope,
      () => page.evaluate(() => (window.__genomeJumper?.state().player.vx ?? 0) > 0),
      'keyboard steering did not accelerate right'
    );
  }

  await expect(
    scope,
    () => page.evaluate(() => window.__genomeJumper?.state().status === 'playing'),
    'game did not enter playing state'
  );
  // Isolate combat from the steering probe: a touch profile may legitimately
  // steer away from the next platform while the browser evaluates layout.
  await page.evaluate(() => {
    window.__genomeJumper?.restart();
    window.__genomeJumper?.tick(2);
  });
  await page.locator('[data-jumper-fire]').waitFor({ state: 'visible' });
  await page.locator('[data-jumper-fire]').click();
  await expect(
    scope,
    () => page.evaluate(() => (window.__genomeJumper?.state().projectiles.length ?? 0) > 0),
    'Fire control did not create a projectile'
  );

  await page.locator('[data-jumper-pause]').click();
  await expect(
    scope,
    () => page.evaluate(() => window.__genomeJumper?.state().status === 'paused'),
    'Pause control did not pause'
  );
  await page.locator('[data-jumper-pause]').click();
  await expect(
    scope,
    () => page.evaluate(() => window.__genomeJumper?.state().status === 'playing'),
    'Pause control did not resume'
  );

  await page.evaluate(() => {
    const api = window.__genomeJumper;
    if (!api) return;
    api.state().player.y = 1160;
    api.state().player.vy = 1;
    api.tick(1);
    api.endRun();
  });
  await expect(
    scope,
    () => page.evaluate(() => window.__genomeJumper?.state().status === 'over'),
    'forced run end did not reach game-over state'
  );
  await expect(
    scope,
    () => page.evaluate(() => Number(localStorage.getItem('khc-genome-jumper-best')) > 0),
    'best score was not persisted'
  );
  await page.locator('[data-jumper-share]').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-jumper-status]')?.textContent?.includes('shared')
  );
  await expect(
    scope,
    () => page.evaluate(() => Boolean(window.__gameAuditShared)),
    'Web Share fallback was not invoked'
  );

  const oldTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.locator('[data-theme-toggle]').click();
  await expect(
    scope,
    () => page.evaluate((theme) => document.documentElement.dataset.theme !== theme, oldTheme),
    'theme toggle did not update the game page'
  );

  // Exercise ClientRouter teardown/remount, the common source of duplicate loops.
  await page.getByRole('link', { name: 'Software', exact: true }).first().click();
  await page.waitForURL('**/software/');
  await page.getByRole('link', { name: 'Genome Jumper', exact: true }).click();
  await page.waitForURL('**/games/genome-jumper/');
  await page.waitForFunction(() => Boolean(window.__genomeJumper));
  await expect(
    scope,
    () => page.evaluate(() => window.__genomeJumperInstances === 1),
    'view-transition navigation leaked or duplicated a controller'
  );

  for (const error of browserErrors) fail(scope, error);
}

async function main() {
  const port = await availablePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const preview = spawn(
    npm,
    ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port)],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let previewLog = '';
  preview.stdout.on('data', (chunk) => {
    previewLog += chunk;
  });
  preview.stderr.on('data', (chunk) => {
    previewLog += chunk;
  });

  try {
    await waitForSite(`${baseURL}/games/genome-jumper/`, preview);
    for (const [browserName, browserType] of selectedBrowsers()) {
      const browser = await browserType.launch({ headless: true });
      try {
        for (const profile of profiles) {
          const scope = `${browserName}/${profile.name}`;
          console.log(`[game-ui] ${scope}`);
          const context = await browser.newContext({
            baseURL,
            viewport: { width: profile.width, height: profile.height },
            colorScheme: profile.theme,
            hasTouch: profile.touch,
            isMobile: profile.touch,
          });
          await context.addInitScript(
            ({ theme }) => {
              localStorage.setItem('khc-theme', theme);
              Object.defineProperty(navigator, 'share', {
                configurable: true,
                value: async () => {
                  window.__gameAuditShared = true;
                },
              });
            },
            { theme: profile.theme }
          );
          const page = await context.newPage();
          page.setDefaultTimeout(12_000);
          try {
            await auditGame(page, scope, profile);
          } catch (error) {
            fail(scope, error instanceof Error ? (error.stack ?? error.message) : String(error));
            await page
              .screenshot({
                path: `/tmp/genome-jumper-${browserName}-${profile.name}.png`,
                fullPage: true,
              })
              .catch(() => {});
          } finally {
            await page.close();
            await context.close();
          }
        }
      } finally {
        await browser.close();
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
  } finally {
    preview.kill('SIGTERM');
    await new Promise((resolve) => {
      if (preview.exitCode !== null) resolve();
      else {
        preview.once('exit', resolve);
        setTimeout(resolve, 2_000);
      }
    });
  }

  if (failures.length) {
    console.error(`Game UI audit failed with ${failures.length} issue(s):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    if (previewLog.trim()) console.error(`\nPreview output:\n${previewLog.trim()}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Game UI audit passed in ${selectedBrowsers()
      .map(([name]) => name)
      .join(' and ')} across ${profiles.length} desktop/mobile theme profiles.`
  );
}

await main();
