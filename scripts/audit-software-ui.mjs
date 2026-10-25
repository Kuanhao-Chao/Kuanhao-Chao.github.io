import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright';
import { newAuditContext } from './lib/builtSiteBrowser.mjs';
import { startPreview } from './lib/previewServer.mjs';
import { waitForPageReady } from './lib/gameAuditUi.mjs';

// Independent release contract: do not derive this order from the rendered data.
const expectedNames = [
  'Biobaby',
  'Tank Fire',
  'Genome Jumper',
  '100-Floor Descent',
  'Flappy Penguin',
  'Proofreader',
  'Proofreader Classic',
  'Dino Run',
  'Snake',
  'Tetris',
  'Chinese Chess',
  '2048',
  'Minesweeper',
  'CRISPR Commander',
  'Phage Defense',
  'Jetpack Joyride',
  'BayRoute',
];
const expectedURLs = [
  'https://storage.googleapis.com/storage.khchao.com/biobaby/index.html',
  'https://storage.googleapis.com/storage.khchao.com/tanks_fire/index.html',
  '/games/genome-jumper/',
  '/games/100-floor-descent/',
  'https://storage.googleapis.com/storage.khchao.com/flappy_penguin/index.html',
  '/games/proofreader/',
  '/games/proofreader-classic/',
  '/games/dino-run/',
  '/games/snake/',
  '/games/tetris/',
  '/games/chinese-chess/',
  '/games/2048/',
  '/games/minesweeper/',
  '/games/crispr-commander/',
  '/games/phage-defense/',
  '/games/jetpack-joyride/',
  '/games/bay-route/',
];
const headerSizes = {
  Proofreader: 42,
  'Proofreader Classic': 42,
  Snake: 42,
  'Jetpack Joyride': 42,
  'Chinese Chess': 62,
  BayRoute: 54,
  '100-Floor Descent': 64,
};
const browserTypes = { chromium, webkit };
const quick = process.argv.includes('--quick');
const browsers = (
  process.env.SOFTWARE_UI_BROWSERS || (quick ? 'chromium' : 'chromium,webkit')
).split(',');
const profiles = [1440, 768, 390, 320].flatMap((width) =>
  ['light', 'dark'].map((theme) => ({ width, theme }))
);
profiles.push(
  ...['nord', 'monokai', 'cyberdeck', 'parchment'].map((theme) => ({ width: 1440, theme }))
);
const evidence = await mkdtemp(join(tmpdir(), 'khc-software-ui-'));

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

let preview;
let browser;
try {
  const baseURL =
    process.env.SOFTWARE_UI_BASE_URL ||
    (preview = await startPreview({
      port: await availablePort(),
      route: '/software/',
    })).baseURL;
  for (const name of browsers) {
    assert.ok(browserTypes[name], `Unsupported browser: ${name}`);
    browser = await browserTypes[name].launch({ headless: true });
    for (const profile of quick ? profiles.slice(0, 1) : profiles) {
      const scope = `${name}-${profile.width}-${profile.theme}`;
      const context = await newAuditContext(browser, {
        baseURL,
        viewport: { width: profile.width, height: 900 },
        hasTouch: profile.width < 620,
        reducedMotion:
          profile.width === 1440 && profile.theme === 'light' ? 'no-preference' : 'reduce',
      });
      await context.addInitScript(
        (theme) => localStorage.setItem('khc-theme', theme),
        profile.theme
      );
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => {
        if (!error.message.includes('Transition was aborted')) errors.push(error.message);
      });
      try {
        const response = await page.goto('/software/', { waitUntil: 'networkidle' });
        assert.ok(response?.ok(), `${scope}: Software route loads`);
        await waitForPageReady(page);
        assert.equal(await page.locator('html').getAttribute('data-theme'), profile.theme);
        const list = page.getByRole('list', {
          name: 'Games and learning experiments',
          exact: true,
        });
        assert.equal(await list.count(), 1, `${scope}: All games belong in one accessible list`);
        assert.deepEqual(
          await list.locator('h3 a').allTextContents(),
          expectedNames,
          `${scope}: Requested seventeen-game order`
        );
        assert.equal(await list.locator(':scope > li').count(), 17);
        const links = await list
          .locator('h3 a')
          .evaluateAll((elements) => elements.map((element) => element.getAttribute('href')));
        assert.deepEqual(links, expectedURLs, `${scope}: Existing destinations preserved`);
        if (profile.width === 1440 && profile.theme === 'light') {
          // Browser fetch also works with the optional offline built-site transport.
          const { ok, payload } = await page.evaluate(async () => {
            const response = await fetch('/terminal.json');
            return { ok: response.ok, payload: await response.json() };
          });
          assert.ok(ok, `${scope}: terminal catalog loads`);
          const terminalGames = payload.fs['/home/khc/.config/side-projects.txt'];
          assert.ok(terminalGames, `${scope}: terminal retains the side-project catalog`);
          assert.deepEqual(
            terminalGames.body.split('\n').map((line, i) =>
              line.slice(0, Math.max(18, expectedNames[i].length)).trim()),
            expectedNames,
            `${scope}: terminal and Software share the requested game order`
          );
        }
        const art = await list.locator('li .game-icon').evaluateAll((elements) =>
          elements.map((element) => ({
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
            box: element.getAttribute('viewBox'),
            label: element.getAttribute('aria-label'),
            hidden: element.parentElement.getAttribute('aria-hidden'),
            artwork: element.querySelector('g')
              ? new XMLSerializer().serializeToString(element.querySelector('g'))
              : null,
            animated: element.getAnimations({ subtree: true }).length,
            definitions: element.querySelectorAll('[id], defs, filter').length,
          }))
        );
        assert.equal(art.length, 17, `${scope}: Every game has an illustrated icon`);
        assert.equal(
          new Set(art.map((icon) => icon.artwork)).size,
          17,
          `${scope}: Distinct artwork`
        );
        const size = profile.width < 620 ? 54 : 70;
        for (const icon of art) {
          // WebKit may retain subpixel rounding from the finite entry transition.
          assert.ok(Math.abs(icon.width - size) < 0.25, `${scope}: Consistent icon width`);
          assert.ok(Math.abs(icon.height - size) < 0.25, `${scope}: Consistent icon height`);
          assert.equal(icon.box, '0 0 100 100');
          assert.ok(icon.label && icon.artwork);
          assert.equal(icon.hidden, 'true', `${scope}: Decorative listing artwork`);
          assert.equal(icon.animated, 0, `${scope}: No distracting icon animation`);
          assert.equal(icon.definitions, 0, `${scope}: No document-wide SVG IDs`);
        }
        const actions = await list.locator('.row-links a').evaluateAll((elements) =>
          elements.map((element) => ({
            href: element.getAttribute('href'),
            label: element.textContent.trim(),
            target: element.getAttribute('target'),
            rel: element.getAttribute('rel'),
            height: element.getBoundingClientRect().height,
          }))
        );
        assert.equal(actions.length, 17);
        for (const [index, action] of actions.entries()) {
          assert.equal(action.href, expectedURLs[index]);
          const external = expectedURLs[index].startsWith('https://');
          assert.equal(action.label, expectedNames[index] === 'BayRoute' ? 'Explore' : 'Play');
          assert.ok(action.height >= 44, `${scope}: Touch-friendly action`);
          assert.equal(action.target, external ? '_blank' : null);
          if (external)
            assert.ok(
              action.rel?.split(' ').includes('noopener') &&
                action.rel?.split(' ').includes('noreferrer')
            );
        }
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${scope}: No horizontal overflow`
        );
        await list.screenshot({ path: join(evidence, `${scope}-list.png`) });
        console.log(`PASS ${scope}: order, destinations, icons, touch targets, no overflow`);

        // Inspect the same production SVGs together at two useful review sizes.
        if (profile.width === 1440) {
          await page.evaluate(() => {
            const sheet = document.createElement('section');
            sheet.id = 'icon-review-sheet';
            sheet.style.cssText =
              'display:grid;grid-template-columns:repeat(5,1fr);gap:24px;padding:32px;background:var(--color-bg);color:var(--color-ink);width:1000px';
            for (const row of document.querySelectorAll('.games-list > li')) {
              const cell = document.createElement('div');
              cell.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap';
              for (const size of [100, 54]) {
                const icon = row.querySelector('.game-icon').cloneNode(true);
                icon.setAttribute('width', String(size));
                icon.setAttribute('height', String(size));
                cell.append(icon);
              }
              const label = document.createElement('span');
              label.style.cssText = 'width:100%;font:14px system-ui';
              label.textContent = row.querySelector('h3').textContent;
              cell.append(label);
              sheet.append(cell);
            }
            document.querySelector('main').prepend(sheet);
          });
          await page
            .locator('#icon-review-sheet')
            .screenshot({ path: join(evidence, `${scope}-icons.png`) });
        }

        // Caller sizes, accessibility, and reuse across all fourteen in-house headers.
        if (
          !quick &&
          profile.width !== 320 &&
          (profile.width === 1440 ? profile.theme === 'light' : profile.theme === 'dark')
        ) {
          for (const [index, url] of expectedURLs.entries()) {
            if (!url.startsWith('/games/')) continue;
            const response = await page.goto(url, { waitUntil: 'networkidle' });
            assert.ok(response?.ok(), `${scope}: ${expectedNames[index]} header loads`);
            await waitForPageReady(page);
            const icon = page.locator('main .game-icon');
            assert.equal(await icon.count(), 1);
            assert.equal(await icon.getAttribute('aria-label'), art[index].label);
            assert.equal(await icon.getAttribute('role'), 'img');
            // The three existing campaign headers adopted 42px illustrations
            // in the previous arcade redesign; keep this independent contract current.
            const expectedSize = headerSizes[expectedNames[index]] ?? 58;
            assert.equal(await icon.getAttribute('width'), String(expectedSize));
            await icon.screenshot({ path: join(evidence, `${scope}-header-${index}.png`) });
          }
        }
        assert.deepEqual(errors, [], `${scope}: No browser exceptions`);
      } catch (error) {
        await page
          .screenshot({ path: join(evidence, `${scope}-failure.png`), timeout: 5000 })
          .catch(() => {});
        throw error;
      } finally {
        await context.close();
      }
    }
    await browser.close();
    browser = undefined;
  }
  console.log(`Software UI audit passed. Screenshots: ${evidence}`);
} finally {
  try {
    await browser?.close();
  } finally {
    await preview?.stop();
  }
}
