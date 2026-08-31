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

// Each in-house game shares one audit skeleton (see `auditGame`) and supplies its own
// gameplay probe via `drive`. Filter with GAME_UI_AUDIT_GAMES=<slug,slug>.
const games = [
  {
    slug: 'genome-jumper',
    title: 'Genome Jumper',
    linkName: 'Genome Jumper',
    query: '?seed=2026',
    global: '__genomeJumper',
    instances: '__genomeJumperInstances',
    canvas: '[data-jumper-canvas]',
    controls:
      '[data-jumper-fire], [data-jumper-share], [data-jumper-pause], [data-jumper-restart], [data-jumper-sound]',
    drive: driveGenomeJumper,
  },
  {
    slug: 'proofreader',
    title: 'Proofreader',
    linkName: 'Proofreader',
    query: '?seed=2026',
    global: '__proofreader',
    instances: '__proofreaderInstances',
    canvas: '[data-proof-canvas]',
    controls:
      '[data-proof-fire], [data-proof-share], [data-proof-pause], [data-proof-restart], [data-proof-sound]',
    drive: driveProofreader,
  },
  {
    slug: 'jetpack-joyride',
    title: 'Jetpack Joyride',
    linkName: 'Jetpack Joyride',
    query: '?seed=2026',
    global: '__jetpackJoyride',
    instances: '__jetpackJoyrideInstances',
    canvas: '[data-jetpack-canvas]',
    controls: '[data-jetpack-thrust], [data-jetpack-pause], [data-jetpack-restart]',
    drive: driveJetpackJoyride,
  },
  {
    slug: 'crispr-commander',
    title: 'CRISPR Commander',
    linkName: 'CRISPR Commander',
    query: '',
    global: '__crisprCommander',
    instances: '__crisprCommanderInstances',
    canvas: '[data-crispr-canvas]',
    controls: '[data-crispr-pause], [data-crispr-restart], [data-crispr-sound]',
    drive: driveCrisprCommander,
  },
  {
    slug: 'phage-defense',
    title: 'Phage Defense',
    linkName: 'Phage Defense',
    query: '',
    global: '__phageDefense',
    instances: '__phageDefenseInstances',
    canvas: '[data-phage-canvas]',
    controls: '[data-phage-next-wave], [data-phage-pause], [data-phage-restart], [data-phage-sound]',
    drive: drivePhageDefense,
  },
];

function selectedGames() {
  const filter = (process.env.GAME_UI_AUDIT_GAMES ?? '')
    .split(',')
    .map((slug) => slug.trim().toLowerCase())
    .filter(Boolean);
  if (filter.length === 0) return games;
  const chosen = games.filter((game) => filter.includes(game.slug));
  if (chosen.length === 0)
    throw new Error(`No known games match GAME_UI_AUDIT_GAMES=${filter.join(',')}`);
  return chosen;
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

async function auditGame(page, scope, profile, game) {
  const browserErrors = [];
  page.on('pageerror', (error) => {
    if (error.message.includes('Transition was aborted')) return;
    browserErrors.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });

  await page.goto(`/games/${game.slug}/${game.query}`, { waitUntil: 'networkidle' });
  await page.waitForFunction((name) => Boolean(window[name]), game.global);

  await expect(
    scope,
    () => page.title().then((title) => title.includes(game.title)),
    'page title is missing'
  );
  await expect(scope, () => page.locator(game.canvas).isVisible(), 'canvas is not visible');
  await expect(
    scope,
    () => page.locator(game.canvas).evaluate((canvas) => canvas.width > 0 && canvas.height > 0),
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
    () => page.evaluate((name) => window[name] === 1, game.instances),
    'expected exactly one game controller'
  );

  const touchTargets = page.locator(game.controls);
  for (let index = 0; index < (await touchTargets.count()); index++) {
    const box = await touchTargets.nth(index).boundingBox();
    if (!box || box.height < 43.5) fail(scope, `control ${index + 1} is smaller than 44 CSS pixels`);
  }

  await game.drive(page, scope, profile, game);

  const oldTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  const themeBtn = page.locator('[data-top-theme-btn], [data-theme-toggle]').first();
  if (await themeBtn.count()) {
    await themeBtn.click();
    const opt = page.locator('[data-theme-choice]').first();
    if (await opt.isVisible()) await opt.click();
  }

  // Exercise ClientRouter teardown/remount, the common source of duplicate loops.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('link', { name: 'Software', exact: true }).first().click();
  await page.waitForURL('**/software/');
  await page.getByRole('link', { name: game.linkName, exact: true }).first().click();
  await page.waitForURL(`**/games/${game.slug}/`);
  await page.waitForFunction((name) => Boolean(window[name]), game.global);
  await expect(
    scope,
    () => page.evaluate((name) => window[name] === 1, game.instances),
    'view-transition navigation leaked or duplicated a controller'
  );

  for (const error of browserErrors) fail(scope, error);
}

async function driveGenomeJumper(page, scope, profile) {
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
}

async function driveProofreader(page, scope, profile) {
  const canvas = page.locator('[data-proof-canvas]');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounding box');

  if (profile.touch) {
    // Drag the left half of the view upward — the virtual thumbstick moves forward.
    await canvas.dispatchEvent('pointerdown', {
      pointerId: 5,
      pointerType: 'touch',
      clientX: box.x + box.width * 0.25,
      clientY: box.y + box.height * 0.62,
      isPrimary: true,
    });
    await canvas.dispatchEvent('pointermove', {
      pointerId: 5,
      pointerType: 'touch',
      clientX: box.x + box.width * 0.25,
      clientY: box.y + box.height * 0.32,
      isPrimary: true,
    });
    await page.evaluate(() => window.__proofreader?.tick(24));
    await canvas.dispatchEvent('pointerup', {
      pointerId: 5,
      pointerType: 'touch',
      clientX: box.x + box.width * 0.25,
      clientY: box.y + box.height * 0.32,
      isPrimary: true,
    });
    await expect(
      scope,
      () => page.evaluate(() => (window.__proofreader?.state().player.x ?? 0) > 1.6),
      'touch drag did not move the player forward'
    );
  } else {
    await page.evaluate(() => window.__proofreader?.start());
    await page.keyboard.down('w');
    await page.evaluate(() => window.__proofreader?.tick(24));
    await page.keyboard.up('w');
    await expect(
      scope,
      () => page.evaluate(() => (window.__proofreader?.state().player.x ?? 0) > 1.6),
      'keyboard move did not advance the player'
    );
  }

  await expect(
    scope,
    () => page.evaluate(() => window.__proofreader?.state().status === 'playing'),
    'game did not enter playing state'
  );

  // Mouse-look / keyboard turn rotates the camera.
  await page.evaluate(() => window.__proofreader?.turn(Math.PI / 2));
  await expect(
    scope,
    () => page.evaluate(() => Math.abs(window.__proofreader?.state().player.angle ?? 0) > 0.3),
    'turning did not rotate the view'
  );

  // Combat: place a mutation dead ahead in line of sight, then fire the pulse.
  await page.evaluate(() => {
    const api = window.__proofreader;
    if (!api) return;
    const state = api.state();
    state.player.angle = 0;
    state.enemies = [
      {
        id: 999,
        kind: 'substitution',
        x: state.player.x + 0.6,
        y: state.player.y,
        hp: 1,
        speed: 0,
        heading: 0,
        retargetIn: 99,
        attackIn: 99,
        hurtFor: 0,
        alive: true,
      },
    ];
  });
  await page.locator('[data-proof-fire]').click();
  await page.evaluate(() => window.__proofreader?.tick(1));
  await expect(
    scope,
    () =>
      page.evaluate(() => {
        const state = window.__proofreader?.state();
        return (state?.kills ?? 0) >= 1 && (state?.score ?? 0) > 0;
      }),
    'Fire control did not eliminate a mutation'
  );

  await page.locator('[data-proof-pause]').click();
  await expect(
    scope,
    () => page.evaluate(() => window.__proofreader?.state().status === 'paused'),
    'Pause control did not pause'
  );
  await page.locator('[data-proof-pause]').click();
  await expect(
    scope,
    () => page.evaluate(() => window.__proofreader?.state().status === 'playing'),
    'Pause control did not resume'
  );

  await page.evaluate(() => window.__proofreader?.endRun());
  await expect(
    scope,
    () => page.evaluate(() => window.__proofreader?.state().status === 'over'),
    'forced run end did not reach game-over state'
  );
  await expect(
    scope,
    () => page.evaluate(() => Number(localStorage.getItem('khc-proofreader-best')) > 0),
    'best score was not persisted'
  );
  await page.locator('[data-proof-share]').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-proof-status]')?.textContent?.includes('shared')
  );
  await expect(
    scope,
    () => page.evaluate(() => Boolean(window.__gameAuditShared)),
    'Web Share fallback was not invoked'
  );
}

async function driveJetpackJoyride(page, scope, profile) {
  const canvas = page.locator('[data-jetpack-canvas]');

  if (profile.touch) {
    // Hold anywhere on the board to fire the jetpack.
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas has no bounding box');
    const y0 = await page.evaluate(() => window.__jetpackJoyride?.state().flyer.y ?? 0);
    await canvas.dispatchEvent('pointerdown', {
      pointerId: 9,
      pointerType: 'touch',
      clientX: box.x + box.width * 0.4,
      clientY: box.y + box.height * 0.5,
      isPrimary: true,
    });
    await page.evaluate(() => window.__jetpackJoyride?.tick(12));
    await canvas.dispatchEvent('pointerup', {
      pointerId: 9,
      pointerType: 'touch',
      clientX: box.x + box.width * 0.4,
      clientY: box.y + box.height * 0.5,
      isPrimary: true,
    });
    await expect(
      scope,
      () => page.evaluate((y) => (window.__jetpackJoyride?.state().flyer.y ?? 1e9) < y, y0),
      'touch hold did not lift the flyer'
    );
  } else {
    const y0 = await page.evaluate(() => {
      window.__jetpackJoyride?.start();
      return window.__jetpackJoyride?.state().flyer.y ?? 0;
    });
    await page.evaluate(() => {
      window.__jetpackJoyride?.setThrust(true);
      window.__jetpackJoyride?.tick(12);
      window.__jetpackJoyride?.setThrust(false);
    });
    await expect(
      scope,
      () => page.evaluate((y) => (window.__jetpackJoyride?.state().flyer.y ?? 1e9) < y, y0),
      'thrust did not lift the flyer'
    );
  }

  await expect(
    scope,
    () => page.evaluate(() => window.__jetpackJoyride?.state().status === 'playing'),
    'game did not enter playing state'
  );

  // A base coin on the flyer is collected.
  await page.evaluate(() => {
    window.__jetpackJoyride?.spawnCoin('A');
    window.__jetpackJoyride?.tick(1);
  });
  await expect(
    scope,
    () => page.evaluate(() => (window.__jetpackJoyride?.coins() ?? 0) >= 1),
    'coin pickup did not register'
  );

  // A shield absorbs one otherwise-fatal hazard.
  await page.evaluate(() => {
    window.__jetpackJoyride?.spawnShield();
    window.__jetpackJoyride?.tick(1);
    window.__jetpackJoyride?.spawnHazard('zapper');
    window.__jetpackJoyride?.tick(1);
  });
  await expect(
    scope,
    () =>
      page.evaluate(
        () =>
          window.__jetpackJoyride?.state().status === 'playing' &&
          window.__jetpackJoyride?.state().flyer.shielded === false
      ),
    'shield did not absorb the hazard'
  );

  // Pause / resume via the control button.
  await page.locator('[data-jetpack-pause]').click();
  await expect(
    scope,
    () => page.evaluate(() => window.__jetpackJoyride?.isRunning() === false),
    'Pause control did not stop the loop'
  );
  await page.locator('[data-jetpack-pause]').click();
  await expect(
    scope,
    () => page.evaluate(() => window.__jetpackJoyride?.state().status === 'playing'),
    'Pause control did not resume'
  );

  // Forced fatal hazard → game over + best persisted.
  await page.evaluate(() => window.__jetpackJoyride?.endRun());
  await expect(
    scope,
    () => page.evaluate(() => window.__jetpackJoyride?.state().status === 'over'),
    'forced run end did not reach game-over state'
  );
  await expect(
    scope,
    () => page.evaluate(() => Number(localStorage.getItem('khc-jetpack-joyride-best')) > 0),
    'best score was not persisted'
  );
}

async function driveCrisprCommander(page, scope, profile) {
  const canvas = page.locator('[data-crispr-canvas]');
  await expect(scope, () => canvas.isVisible(), 'CRISPR canvas is not visible');

  // Switch enzyme to AsCas12a
  const cas12Btn = page.locator('[data-crispr-enzyme="AsCas12a"]');
  if (await cas12Btn.count()) {
    await cas12Btn.click();
    await expect(
      scope,
      () => page.evaluate(() => window.__crisprCommander?.state().activeCas === 'AsCas12a'),
      'AsCas12a enzyme switch failed'
    );
  }

  // Switch enzyme back to SpCas9
  const cas9Btn = page.locator('[data-crispr-enzyme="SpCas9"]');
  if (await cas9Btn.count()) {
    await cas9Btn.click();
    await expect(
      scope,
      () => page.evaluate(() => window.__crisprCommander?.state().activeCas === 'SpCas9'),
      'SpCas9 enzyme switch failed'
    );
  }

  // Slice action across canvas
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.4, { steps: 5 });
    await page.mouse.up();
  }

  // Pause / resume
  const pauseBtn = page.locator('[data-crispr-pause]');
  await pauseBtn.click();
  await expect(
    scope,
    () => page.evaluate(() => window.__crisprCommander?.state().isPaused === true),
    'Pause control did not pause CRISPR Commander'
  );
  await pauseBtn.click();
  await expect(
    scope,
    () => page.evaluate(() => window.__crisprCommander?.state().isPaused === false),
    'Pause control did not resume CRISPR Commander'
  );
}

async function drivePhageDefense(page, scope, profile) {
  const canvas = page.locator('[data-phage-canvas]');
  await expect(scope, () => canvas.isVisible(), 'Phage Defense canvas is not visible');

  // Start Next Wave
  const nextWaveBtn = page.locator('[data-phage-next-wave]');
  await nextWaveBtn.click();
  await expect(
    scope,
    () => page.evaluate(() => window.__phageDefense?.state().currentWave === 1),
    'Wave 1 did not start on button click'
  );

  // Deploy EcoRI Cleaver tower
  const ecoRiCard = page.locator('[data-tower-type="restriction_enzyme"]');
  await ecoRiCard.click();
  const box = await canvas.boundingBox();
  if (box) {
    // Click safe cytoplasm area (virtual 240, 350)
    const clickX = box.x + box.width * 0.3;
    const clickY = box.y + box.height * 0.7;
    await page.mouse.click(clickX, clickY);
    await expect(
      scope,
      () => page.evaluate(() => (window.__phageDefense?.state().towers.length ?? 0) >= 1),
      'Tower was not placed on canvas click'
    );

    // Inspect placed tower
    await page.mouse.click(clickX, clickY);
    const panel = page.locator('[data-selected-tower-panel]');
    await expect(scope, () => panel.isVisible(), 'Tower inspection panel did not open');
  }

  // Trigger CRISPRi Stasis emergency ability
  const crispriBtn = page.locator('[data-emergency-ability="crispri"]');
  if (await crispriBtn.count()) {
    await crispriBtn.click();
    await expect(
      scope,
      () =>
        page.evaluate(
          () => window.__phageDefense?.state().activeEmergencies.some((e) => e.type === 'crispri')
        ),
      'CRISPRi emergency ability was not activated'
    );
  }

  // Pause / resume
  const pauseBtn = page.locator('[data-phage-pause]');
  await pauseBtn.click();
  await expect(
    scope,
    () => page.evaluate(() => window.__phageDefense?.state().isPaused === true),
    'Pause control did not pause Phage Defense'
  );
  await pauseBtn.click();
  await expect(
    scope,
    () => page.evaluate(() => window.__phageDefense?.state().isPaused === false),
    'Pause control did not resume Phage Defense'
  );
}

async function main() {
  const port = await availablePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const preview = spawn(npm, ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let previewLog = '';
  preview.stdout.on('data', (chunk) => {
    previewLog += chunk;
  });
  preview.stderr.on('data', (chunk) => {
    previewLog += chunk;
  });

  const gamesToAudit = selectedGames();

  try {
    await waitForSite(`${baseURL}/games/${gamesToAudit[0].slug}/`, preview);
    for (const [browserName, browserType] of selectedBrowsers()) {
      const browser = await browserType.launch({ headless: true });
      try {
        for (const profile of profiles) {
          for (const game of gamesToAudit) {
            const scope = `${browserName}/${profile.name}/${game.slug}`;
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
              await auditGame(page, scope, profile, game);
            } catch (error) {
              fail(scope, error instanceof Error ? (error.stack ?? error.message) : String(error));
              await page
                .screenshot({
                  path: `/tmp/${game.slug}-${browserName}-${profile.name}.png`,
                  fullPage: true,
                })
                .catch(() => {});
            } finally {
              await page.close();
              await context.close();
            }
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
      .join(' and ')} across ${profiles.length} profiles × ${gamesToAudit.length} game(s).`
  );
}

await main();
