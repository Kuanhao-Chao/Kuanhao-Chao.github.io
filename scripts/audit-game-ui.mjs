import { createServer } from 'node:net';
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { chromium, webkit, firefox } from 'playwright';
import { startPreview } from './lib/previewServer.mjs';
import { waitForPageReady, clickControl } from './lib/gameAuditUi.mjs';
import { checkDinoPauseResume, checkPhagePlacement } from './lib/gameAuditActions.mjs';

const browserTypes = { chromium, webkit, firefox };
const ci = process.argv.includes('--ci');
const allProfiles = [
  { name: 'desktop-light', width: 1440, height: 1000, theme: 'light', touch: false },
  { name: 'desktop-dark', width: 1440, height: 1000, theme: 'dark', touch: false },
  { name: 'phone-light', width: 390, height: 844, theme: 'light', touch: true },
  { name: 'phone-dark', width: 390, height: 844, theme: 'dark', touch: true },
];
const profiles = ci ? allProfiles.filter((profile) => ['desktop-light', 'phone-dark'].includes(profile.name)) : allProfiles;
const evidence = '/tmp/khc-game-ui';

const failures = [];
const fail = (scope, message) => { failures.push(`${scope}: ${message}`); console.error(`[game-ui] FAIL ${scope}: ${message}`); };

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
  { slug: 'chinese-chess', title: 'Chinese Chess', linkName: 'Chinese Chess', query: '', global: '__chineseChess', instances: '__chineseChessInstances', canvas: '[data-cc-canvas]', controls: '[data-cc-undo], [data-cc-hint], [data-cc-flip], [data-cc-restart], [data-cc-sound]', drive: driveChineseChess },
  { slug: 'bay-route', title: 'BayRoute', linkName: 'BayRoute', query: '', global: '__bayRoute', instances: '__bayRouteInstances', canvas: '[data-br-canvas]', controls: '[data-br-run], [data-br-play], [data-br-step], [data-br-reset], [data-br-fit], [data-br-sound]', drive: driveBayRoute },
  { slug: 'minesweeper', title: 'Minesweeper', linkName: 'Minesweeper', query: '', global: '__minesweeper', instances: '__minesweeperInstances', surface: '[data-mine-board]', controls: '[data-mine-face], [data-mine-pause], [data-mine-hint], [data-mine-flag-toggle], [data-mine-sound]', drive: driveMinesweeper },
  { slug: '2048', title: '2048', linkName: '2048', query: '?seed=42', global: '__game2048', instances: '__game2048Instances', surface: '[data-2048-grid]', controls: '[data-2048-undo], [data-2048-pause], [data-2048-restart], [data-2048-sound]', drive: drive2048 },
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
  {
    slug: 'dino-run',
    title: 'Dino Run',
    linkName: 'Dino Run',
    query: '?seed=2026',
    global: '__dinoRun',
    instances: '__dinoRunInstances',
    canvas: '[data-dino-canvas]',
    controls: '[data-dino-jump], [data-dino-duck], [data-dino-pause], [data-dino-restart]',
    drive: driveDinoRun,
  },
  {
    slug: 'snake',
    title: 'Snake',
    linkName: 'Snake',
    query: '',
    global: '__snake',
    instances: '__snakeInstances',
    canvas: '[data-snake-canvas]',
    controls: '[data-snake-pause], [data-snake-restart]',
    drive: driveSnake,
  },
  {
    slug: 'tetris',
    title: 'Tetris',
    linkName: 'Tetris',
    query: '',
    global: '__tetris',
    instances: '__tetrisInstances',
    canvas: '[data-tetris-canvas]',
    controls:
      '[data-tetris-pause], [data-tetris-restart], [data-tetris-btn="left"], [data-tetris-btn="cw"], [data-tetris-btn="right"], [data-tetris-btn="soft"], [data-tetris-btn="hard"], [data-tetris-btn="hold"]',
    drive: driveTetris,
  },
];

function selectedGames() {
  const filter = (process.env.GAME_UI_AUDIT_GAMES ?? '')
    .split(',')
    .map((slug) => slug.trim().toLowerCase())
    .filter(Boolean);
  if (filter.length === 0) return ci ? games.filter((game) => !['snake', 'tetris', 'jetpack-joyride'].includes(game.slug)) : games;
  const unknown = filter.filter((slug) => !games.some((game) => game.slug === slug));
  if (unknown.length) throw new Error(`Unknown GAME_UI_AUDIT_GAMES: ${unknown.join(',')}`);
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

async function expect(scope, condition, message) {
  if (!(typeof condition === 'function' ? await condition() : await condition)) fail(scope, message);
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
  await waitForPageReady(page);
  const surface = page.locator(game.surface || game.canvas);
  await surface.scrollIntoViewIfNeeded();

  await expect(
    scope,
    () => page.title().then((title) => title.includes(game.title)),
    'page title is missing'
  );
  await expect(scope, () => surface.isVisible(), 'playfield is not visible');
  if (game.canvas) {
  await expect(
    scope,
    () => page.locator(game.canvas).evaluate((canvas) => canvas.width > 0 && canvas.height > 0),
    'canvas backing store has zero size'
  );
  }
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
  await surface.screenshot({ path: `${evidence}/${game.slug}-${scope.split('/')[0]}-${profile.name}-playing.png` });
  const focus = page.locator('[data-game-focus]');
  if (await focus.count()) {
    // Capture at activation, after Playwright/native focus has finished scrolling
    // the toolbar into view. A pre-click sample can be midway through smooth scroll.
    await focus.evaluate(button => button.addEventListener('click', () => { window.__gameAuditPriorScroll = scrollY; }, { capture: true, once: true }));
    await clickControl(focus);
    const scroll = await page.evaluate(() => window.__gameAuditPriorScroll);
    await expect(scope, () => page.locator('[data-game-root]').evaluate((el) => el.classList.contains('game-focus-view')), 'Focus view did not open');
    await page.screenshot({ path: `${evidence}/${game.slug}-${scope.split('/')[0]}-${profile.name}-focus.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    await expect(scope, () => page.locator('[data-game-root]').evaluate((el) => !el.classList.contains('game-focus-view')), 'Escape did not close Focus view');
    await expect(scope, () => page.evaluate(() => document.body.style.overflow !== 'hidden'), 'Focus view left page scrolling locked');
    await expect(scope, () => page.evaluate((before) => Math.abs(scrollY - before) < 4, scroll), 'Focus view did not restore page position');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: profile.width, height: profile.height - 80 });
  await expect(scope, () => surface.isVisible(), 'playfield disappeared on resize/reduced motion');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: profile.width, height: profile.height });

  const oldTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  const themeBtn = page.locator('[data-top-theme-btn], [data-theme-toggle]').first();
  if (await themeBtn.count()) {
    await clickControl(themeBtn);
    const opt = page.locator('[data-theme-choice]').first();
    if (await opt.isVisible()) await clickControl(opt);
  }

  // Exercise ClientRouter teardown/remount, the common source of duplicate loops.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('link', { name: 'Software', exact: true }).first().click();
  await page.waitForURL('**/software/');
  await page.waitForFunction((name) => !window[name], game.global);
  await page.getByRole('link', { name: game.linkName, exact: true }).first().click();
  await page.waitForURL(`**/games/${game.slug}/`);
  await page.waitForFunction((name) => Boolean(window[name]), game.global);
  await waitForPageReady(page);
  await expect(
    scope,
    () => page.evaluate((name) => window[name] === 1, game.instances),
    'view-transition navigation leaked or duplicated a controller'
  );
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
  await expect(scope, () => page.evaluate((name) => window[name] === 1, game.instances), 'blur disturbed controller ownership');

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
    await page.locator('[data-game-root]').focus();
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
    () => page.evaluate(() => Number(localStorage.getItem('khc-genome-jumper-best-v2')) > 0),
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
    await page.locator('[data-game-root]').focus();
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
        windup: 0,
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
  await page.locator('[data-crispr-start]').click();
  await expect(scope, () => page.locator('[data-crispr-pause]').isEnabled(), 'Start did not begin CRISPR practice');

  // Switch enzyme to AsCas12a
  const cas12Btn = page.locator('[data-enzyme="AsCas12a"]');
  await expect(scope, () => cas12Btn.count().then(count => count === 1), 'Cas12a selector is missing');
  if (await cas12Btn.count()) {
    await cas12Btn.click();
    await expect(
      scope,
      () => page.evaluate(() => window.__crisprCommander?.state().activeCas === 'AsCas12a'),
      'AsCas12a enzyme switch failed'
    );
  }

  // Switch enzyme back to SpCas9
  const cas9Btn = page.locator('[data-enzyme="SpCas9"]');
  await expect(scope, () => cas9Btn.count().then(count => count === 1), 'Cas9 selector is missing');
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
  await checkPhagePlacement(page, profile.touch);

  // Trigger CRISPRi Stasis emergency ability
  const crispriBtn = page.locator('[data-emergency-ability="crispri"]');
  if (await crispriBtn.count()) {
    await clickControl(crispriBtn);
    await page.waitForFunction(() => window.__phageDefense.state().activeEmergencies.some(e => e.type === 'crispri'));
  }

  // Pause / resume
  const pauseBtn = page.locator('[data-phage-pause]');
  await clickControl(pauseBtn);
  await page.waitForFunction(() => window.__phageDefense.state().isPaused === true);
  await clickControl(pauseBtn);
  await page.waitForFunction(() => window.__phageDefense.state().isPaused === false);
}

async function driveDinoRun(page, scope, profile) {
  const canvas = page.locator('[data-dino-canvas]');
  await expect(scope, () => canvas.isVisible(), 'Dino canvas is not visible');

  // Jump
  await clickControl(page.locator('[data-dino-jump]'));
  await page.waitForFunction(() => window.__dinoRun.state().status === 'playing');

  // Tick physics
  await page.evaluate(() => window.__dinoRun?.tick(10));
  await expect(
    scope,
    () => page.evaluate(() => (window.__dinoRun?.score() ?? 0) > 0),
    'Distance score did not increase'
  );

  // Pause / resume
  await checkDinoPauseResume(page);
}

async function driveChineseChess(page, scope) {
  await page.locator('[data-cc-mode]').selectOption('pvp');
  const cell = page.locator('.cc-grid-cell[data-x="0"][data-y="3"]');
  await cell.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
  await expect(scope, () => page.evaluate(() => window.__chineseChess.state().history.length === 1), 'keyboard soldier move failed');
  await page.locator('[data-cc-undo]').click();
  await expect(scope, () => page.evaluate(() => window.__chineseChess.state().history.length === 0), 'Undo did not restore chess position');
  await page.locator('[data-cc-teaching]').selectOption('horse');
  await expect(scope, () => page.locator('[data-cc-teaching-note]').textContent().then(text => text.includes('horse leg')), 'horse-leg explanation missing');
  await page.locator('[data-cc-hint]').click();
  await page.locator('[data-cc-restart]').click();
  await page.waitForTimeout(1750);
  await expect(scope, () => page.evaluate(() => window.__chineseChess.state().history.length === 0), 'cancelled hint changed restarted board');
  await page.locator('[data-cc-mode]').selectOption('pve');
  await page.locator('[data-cc-side]').selectOption('black');
  await page.waitForFunction(() => window.__chineseChess.state().history.length === 1);
  await page.locator('[data-cc-undo]').click();
  await page.waitForFunction(() => window.__chineseChess.state().turn === 'black');
  await expect(scope, () => page.evaluate(() => window.__chineseChess.state().history.length === 1), 'undoing AI opening left Black waiting on an inert board');
}

async function driveBayRoute(page, scope) {
  await page.locator('[data-br-race]').check();
  await page.locator('[data-br-run]').click();
  await page.locator('[data-br-scrubber]').focus(); await page.keyboard.press('End');
  await expect(scope, () => page.evaluate(() => {
    const results = window.__bayRoute.state().results;
    return results.find(result => result.algorithm === 'bfs').totalTimeMinutes === 9 && results.find(result => result.algorithm === 'bidirectional_a_star').totalTimeMinutes === 3;
  }), 'weighted worked example has incorrect route costs');
  await page.locator('[data-br-reset]').click(); await page.locator('[data-br-step]').click();
  await expect(scope, () => page.locator('[data-br-step-count]').textContent().then(text => text.startsWith('1 /')), 'single-step trace control failed');
  await page.getByText('Local landmark search & optional basemaps', { exact: true }).click();
  await page.locator('[data-br-provider]').selectOption('local');
  await page.locator('[data-br-apply-map]').click();
}

async function driveMinesweeper(page, scope) {
  await page.locator('[data-mine-diff="expert"]').click();
  await expect(scope, () => page.locator('.board-scroll-container').evaluate(el => {
    el.scrollLeft = 0;
    return el.querySelector('.mine-cell').getBoundingClientRect().left >= el.getBoundingClientRect().left - 1;
  }), 'Expert board left edge is unreachable');
  await page.locator('[data-mine-diff="beginner"]').click();
  const cell = page.locator('.mine-cell[data-row="1"][data-col="1"]');
  await cell.focus(); await page.keyboard.press('Enter');
  await expect(scope, () => cell.evaluate(el => document.activeElement === el), 'revealing lost keyboard focus');
  await expect(scope, () => page.evaluate(() => window.__minesweeper.state().grid[1][1].state === 'revealed' && !window.__minesweeper.state().grid[1][1].isMine), 'first revealed cell is not safe');
  await page.locator('[data-mine-pause]').click();
  await expect(scope, () => page.locator('[data-mine-pause]').textContent().then(text => text.includes('Resume')), 'Pause did not expose Resume');
  await page.locator('[data-mine-pause]').click();
  await page.locator('[data-mine-hint]').click();
  await expect(scope, () => page.locator('[data-mine-hint-text]').textContent().then(text => text.length > 15), 'visible-clue hint was not explained');
}

async function drive2048(page, scope) {
  const grid = page.locator('[data-2048-grid]');
  await grid.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowUp');
  await expect(scope, () => page.locator('[data-2048-undo]').isDisabled(), 'ineffective moves consumed Undo');
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(220);
  const first = await page.evaluate(() => window.__game2048.state());
  await expect(scope, first.score === 4 && first.history.snapshots.length === 1, '2048 merge/score/history incorrect');
  await page.locator('[data-2048-undo]').click();
  await expect(scope, () => page.locator('[data-2048-undo]').isDisabled(), 'Undo left a phantom history entry');
  await grid.focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(220);
  await expect(scope, () => page.evaluate(expected => JSON.stringify(window.__game2048.state().grid) === expected, JSON.stringify(first.grid)), 'Undo did not restore random spawns');
  for (const key of ['ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight']) await page.keyboard.press(key);
  await page.locator('[data-2048-undo]').click(); await page.waitForTimeout(220);
  await expect(scope, () => page.evaluate(() => document.querySelectorAll('.g2048-tile').length === window.__game2048.state().grid.flat().filter(Boolean).length), 'interrupted moves left orphan tiles');
  await page.locator('[data-2048-pause]').click(); await page.locator('[data-2048-overlay-btn]').click();
  const saved = await page.evaluate(() => window.__game2048.state());
  await page.reload(); await page.waitForFunction(() => Boolean(window.__game2048));
  await expect(scope, () => page.evaluate(() => window.__game2048.state()).then(restored => isDeepStrictEqual(restored, saved)), 'reload did not restore complete active game');
}

async function driveSnake(page, scope, profile) {
  const canvas = page.locator('[data-snake-canvas]');
  await expect(scope, () => canvas.isVisible(), 'Snake canvas is not visible');

  // Start
  await page.evaluate(() => window.__snake?.start());
  await expect(
    scope,
    () => page.evaluate(() => window.__snake?.state().status === 'playing'),
    'Snake did not enter playing state'
  );

  // Turn
  await page.evaluate(() => window.__snake?.turn('up'));
  await page.evaluate(() => window.__snake?.tick());
  await expect(
    scope,
    () => page.evaluate(() => window.__snake?.state().dir === 'up'),
    'Snake turn failed'
  );

  // Pause / resume
  const pauseBtn = page.locator('[data-snake-pause]');
  await pauseBtn.click();
  await expect(
    scope,
    () => page.evaluate(() => window.__snake?.isRunning() === false),
    'Pause control did not pause Snake'
  );
  await pauseBtn.click();
  await expect(
    scope,
    () => page.evaluate(() => window.__snake?.isRunning() === true),
    'Pause control did not resume Snake'
  );
}

async function driveTetris(page, scope, profile) {
  const canvas = page.locator('[data-tetris-canvas]');
  await expect(scope, () => canvas.isVisible(), 'Tetris canvas is not visible');

  // Start
  await page.evaluate(() => window.__tetris?.start());
  await expect(
    scope,
    () => page.evaluate(() => window.__tetris?.state().status === 'playing'),
    'Tetris did not enter playing state'
  );

  // Move and rotate
  await page.locator('[data-tetris-btn="left"]').click();
  await page.locator('[data-tetris-btn="cw"]').click();

  // Hard drop
  await page.locator('[data-tetris-btn="hard"]').click();
  await expect(
    scope,
    () => page.evaluate(() => (window.__tetris?.score() ?? 0) > 0),
    'Hard drop did not award score'
  );

  // Pause / resume
  const pauseBtn = page.locator('[data-tetris-pause]');
  await pauseBtn.click();
  await expect(
    scope,
    () => page.evaluate(() => window.__tetris?.isRunning() === false),
    'Pause did not pause Tetris'
  );
  await pauseBtn.click();
  await expect(
    scope,
    () => page.evaluate(() => window.__tetris?.isRunning() === true),
    'Resume did not resume Tetris'
  );
}

async function captureFailure(page, game, prefix) {
  // Capture before screenshots scroll the document. Keep diagnostics public and
  // bounded: controls, hit targets, focus, and the exposed gameplay state only.
  const state = await page.evaluate(({ global, instances }) => {
    const describe = element => element ? { tag: element.tagName, label: element.getAttribute('aria-label'), text: element.textContent?.trim().slice(0, 120), data: { ...element.dataset } } : null;
    const api = window[global];
    const game = api?.state?.();
    return {
      url: location.href, visibility: document.visibilityState, hasFocus: document.hasFocus(),
      viewport: { width: innerWidth, height: innerHeight, scrollY }, activeElement: describe(document.activeElement),
      instances: window[instances], status: game?.status, isPaused: game?.isPaused, currentWave: game?.currentWave,
      towerCount: game?.towers?.length, distance: game?.distance, score: game?.score, isRunning: api?.isRunning?.(),
      controls: [...document.querySelectorAll('[data-game-root] button, [data-game-root] select')].slice(0, 100).map(element => {
        const rect = element.getBoundingClientRect();
        return { ...describe(element), disabled: element.disabled, hidden: element.hidden,
          box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          hitTarget: describe(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) };
      }),
    };
  }, { global: game.global, instances: game.instances }).catch(error => ({ captureError: error.message }));
  await writeFile(`${prefix}-state.json`, JSON.stringify(state, null, 2)).catch(() => {});
  await page.screenshot({ path: `${prefix}-failure.png`, fullPage: true }).catch(() => {});
}

async function auditRestrictedBrowser(browser, browserName, baseURL, selected) {
  const actions = {
    'crispr-commander': '[data-crispr-start]', 'phage-defense': '[data-phage-next-wave]',
    'genome-jumper': '[data-jumper-canvas]', proofreader: '[data-proof-canvas]', 'dino-run': '[data-dino-jump]',
    'chinese-chess': '[data-cc-hint]', 'bay-route': '[data-br-run]', minesweeper: '[data-mine-face]', '2048': '[data-2048-restart]',
  };
  for (const game of selected.filter(game => actions[game.slug])) {
    const scope = `${browserName}/reduced-motion-storage-denied/${game.slug}`;
    console.log(`[game-ui] ${scope}`);
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true });
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage denied for audit', 'SecurityError'); } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    // DOM/action traces plus explicit failure PNGs are sufficient evidence;
    // continuous screencasts of animated backgrounds are needlessly expensive.
    await context.tracing.start({ screenshots: false, snapshots: true });
    const failureCount = failures.length;
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`/games/${game.slug}/${game.query}`);
      await page.waitForFunction(name => Boolean(window[name]), game.global);
      await waitForPageReady(page);
      await clickControl(page.locator(actions[game.slug]));
      await expect(scope, () => page.locator(game.surface || game.canvas).isVisible(), 'playfield failed without local storage');
      await clickControl(page.locator('[data-game-focus]')); await page.keyboard.press('Escape');
      await expect(scope, () => page.evaluate(() => !document.querySelector('.game-focus-view')), 'reduced-motion Focus exit failed');
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.screenshot({ path: `${evidence}/${game.slug}-${browserName}-restricted.png`, fullPage: true });
      for (const error of errors) fail(scope, error);
    } catch (error) {
      fail(scope, error.message);
    }
    finally {
      const failed = failures.length > failureCount;
      const prefix = `${evidence}/${game.slug}-${browserName}-restricted`;
      if (failed) await captureFailure(page, game, prefix);
      await context.tracing.stop(failed ? { path: `${prefix}-trace.zip` } : {}).catch(() => {});
      await context.close();
    }
  }
}

async function main() {
  const gamesToAudit = selectedGames();
  await mkdir(evidence, { recursive: true });
  const port = await availablePort();
  let preview;

  try {
    preview = await startPreview({ port, route: `/games/${gamesToAudit[0].slug}/` });
    const { baseURL } = preview;
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
              isMobile: browserName !== 'firefox' && profile.touch,
            });
            await context.addInitScript(
              ({ theme }) => {
                localStorage.setItem('khc-theme', theme);
                if (location.pathname.includes('/games/2048/') && !localStorage.getItem('khc_game_2048_active_4')) {
                  localStorage.setItem('khc_game_2048_size', '4');
                  localStorage.setItem('khc_game_2048_active_4', JSON.stringify({ version: 2, grid: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0, boardSize: 4, isWon: false, isOver: false, keepPlaying: false, rngState: 42, history: { snapshots: [], maxDepth: 20 } }));
                }
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
            await context.tracing.start({ screenshots: false, snapshots: true });
            const failureCount = failures.length;
            try {
              await auditGame(page, scope, profile, game);
            } catch (error) {
              fail(scope, error instanceof Error ? (error.stack ?? error.message) : String(error));
            } finally {
              const failed = failures.length > failureCount;
              const prefix = `${evidence}/${game.slug}-${browserName}-${profile.name}`;
              if (failed) await captureFailure(page, game, prefix);
              await context.tracing.stop(failed ? { path: `${prefix}-trace.zip` } : {}).catch(() => {});
              await page.close();
              await context.close();
            }
          }
        }
        await auditRestrictedBrowser(browser, browserName, baseURL, gamesToAudit);
      } finally {
        await browser.close();
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
  } finally {
    try { await preview?.stop(); } catch (error) { failures.push(error.message); }
  }

  if (failures.length) {
    console.error(`Game UI audit failed with ${failures.length} issue(s):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    if (preview?.logs.trim()) console.error(`\nPreview output:\n${preview.logs.trim()}`);
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
