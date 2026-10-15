/** Local/manual browser checks for the WebGL edition. Never part of push CI. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { waitForPageReady, clickControl } from './lib/gameAuditUi.mjs';

const baseURL = process.env.GAME_UI_AUDIT_BASE_URL ?? 'http://127.0.0.1:4321';
const evidence = process.env.PROOF_3D_EVIDENCE ?? '/tmp/khc-proofreader-3d';
const engines = (process.env.PROOF_3D_BROWSERS ?? 'chromium,webkit').split(',');
const measurements = [];
await mkdir(evidence, { recursive: true });
for (const engine of engines) {
  assert.ok({ chromium, webkit }[engine], `Unknown browser: ${engine}`);
  const browser = await { chromium, webkit }[engine].launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        hasTouch: width === 390,
        deviceScaleFactor: width === 390 ? 2 : 1,
        baseURL,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto('/games/proofreader/?mode=practice&stage=3', { waitUntil: 'networkidle' });
        await waitForPageReady(page);
        await page.waitForFunction(() => Boolean(window.__proofreader));
        const surface = page.locator('[data-proof-canvas]');
        await clickControl(page.locator('[data-arcade-primary]'));
        assert.equal(await surface.evaluate((c) => getComputedStyle(c).imageRendering), 'auto');
        const graphics = await page.evaluate(() => window.__proofreader.graphics());
        for (const control of await page
          .locator('[data-proof-fire], [data-proof-jump], [data-proof-sprint]')
          .all()) {
          assert.ok(await control.isVisible(), 'active touch control is hidden');
          const target = await control.boundingBox();
          assert.ok(
            target && target.width >= 43.5 && target.height >= 43.5,
            'active touch control is smaller than 44 CSS pixels'
          );
          const appearance = await control.evaluate((button) => ({
            radius: getComputedStyle(button).borderRadius,
            labelFits: button.scrollWidth <= button.clientWidth,
          }));
          assert.equal(appearance.radius, '50%', 'shared styles overrode round touch controls');
          assert.ok(appearance.labelFits, 'touch control label is clipped');
        }
        assert.ok(
          graphics.width > 320 && graphics.height > 240,
          'renderer is still a fixed pixel buffer'
        );
        assert.ok(graphics.calls > 20 && graphics.triangles > 5000, '3D world was not drawn');
        assert.ok(graphics.calls < 200, 'entry scene exceeded its batched draw-call budget');
        const position = await page.evaluate(() => ({
          ...window.__proofreader.state().player.position,
        }));
        const box = await surface.boundingBox();
        if (width === 390) {
          const left = {
            pointerId: 11,
            pointerType: 'touch',
            clientX: box.x + box.width * 0.2,
            clientY: box.y + box.height * 0.65,
          };
          await surface.dispatchEvent('pointerdown', left);
          await surface.dispatchEvent('pointermove', { ...left, clientY: left.clientY - 54 });
          const fire = page.locator('[data-proof-fire]'),
            fireBox = await fire.boundingBox();
          const right = {
            pointerId: 12,
            pointerType: 'touch',
            clientX: fireBox.x + 20,
            clientY: fireBox.y + 20,
          };
          await fire.dispatchEvent('pointerdown', right);
          await fire.dispatchEvent('pointermove', {
            ...right,
            clientX: right.clientX + 35,
            clientY: right.clientY - 20,
          });
          await page.evaluate(() => window.__proofreader.tick(48));
          const moved = await page.evaluate(() => window.__proofreader.state());
          assert.ok(moved.player.position.z < position.z - 0.5, 'left thumb did not move');
          assert.ok(
            moved.player.yaw > 0.05 && moved.player.pitch > 0.03,
            'Fire-drag did not aim on both axes'
          );
          assert.ok(moved.shots >= 2, 'second thumb did not fire while moving');
          await fire.dispatchEvent('pointercancel', right);
          await surface.dispatchEvent('pointercancel', left);
        } else {
          await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * 0.6 + 45, box.y + box.height * 0.5 - 25);
          await page.keyboard.down('w');
          await page.evaluate(() => window.__proofreader.tick(48));
          await page.keyboard.up('w');
          await page.mouse.up();
          const moved = await page.evaluate(() => window.__proofreader.state());
          assert.ok(moved.player.position.z < position.z - 0.5);
          assert.ok(moved.player.yaw > 0.05 && moved.player.pitch > 0.03);
        }
        const shots = await page.evaluate(() => window.__proofreader.state().shots);
        await page.evaluate(() => window.__proofreader.tick(60));
        assert.equal(
          await page.evaluate(() => window.__proofreader.state().shots),
          shots,
          'pointer release left firing stuck'
        );
        await page.evaluate(() => window.__proofreader.restart());
        await surface.focus();
        await page.evaluate(() => window.__proofreader.tick(10));
        await page.keyboard.down(' ');
        await page.evaluate(() => window.__proofreader.tick(22));
        assert.ok(
          await page.evaluate(() => window.__proofreader.state().player.position.y > 0.2),
          'Space did not jump'
        );
        await page.keyboard.up(' ');
        await page.evaluate(() => window.__proofreader.tick(120));
        await page.locator('[data-proof-weapon="scatter"]').click();
        assert.equal(
          await page.evaluate(() => window.__proofreader.state().player.weapon),
          'scatter'
        );
        await page.locator('[data-proof-weapon="pulse"]').click();
        assert.equal(
          await page.evaluate(() => window.__proofreader.state().player.weapon),
          'pulse'
        );
        await page.locator('[data-proof-map-toggle]').click();
        assert.equal(await page.locator('[data-proof-map-panel]').isVisible(), true);
        await page.locator('[data-proof-map-toggle]').click();
        await page.locator('[data-arcade-game]').screenshot({
          path: `${evidence}/${engine}-${width}-playing.png`,
        });
        await clickControl(page.locator('[data-proof-pause]'));
        assert.equal(await page.evaluate(() => window.__proofreader.state().status), 'paused');
        const frozen = await page.evaluate(() => ({
          time: window.__proofreader.state().time,
          frames: window.__proofreader.graphics().frames,
        }));
        await page.waitForTimeout(200);
        assert.deepEqual(
          await page.evaluate(() => ({
            time: window.__proofreader.state().time,
            frames: window.__proofreader.graphics().frames,
          })),
          frozen,
          'paused game kept scheduling frames'
        );
        await clickControl(page.locator('[data-proof-pause]'));
        await surface.scrollIntoViewIfNeeded();
        const supported = await page.evaluate(() => {
          const c = document.querySelector('[data-proof-canvas]'),
            ext = c.getContext('webgl2')?.getExtension('WEBGL_lose_context');
          if (!ext) return false;
          ext.loseContext();
          setTimeout(() => ext.restoreContext(), 180);
          return true;
        });
        if (supported) {
          await page.waitForFunction(() => window.__proofreader.state().status === 'paused');
          await page.waitForFunction(() => !window.__proofreader.graphics().lost);
          assert.equal(
            await page.evaluate(() => window.__proofreader.state().status),
            'paused',
            'context recovery auto-resumed'
          );
          await clickControl(page.locator('[data-arcade-primary]'));
        } else console.log(`[proofreader-3d] ${engine}: context-loss extension unavailable`);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.locator('[data-proof-canvas]').scrollIntoViewIfNeeded();
        await page.evaluate(() => window.__proofreader.resume());
        const frame0 = await page.evaluate(() => window.__proofreader.graphics().frames),
          t0 = Date.now();
        await page.waitForTimeout(700);
        const stats = await page.evaluate(() => window.__proofreader.graphics());
        assert.ok(
          stats.geometries < 750 && stats.textures < 80,
          'unexpectedly unbounded GPU resources'
        );
        measurements.push({
          engine,
          viewportWidth: width,
          environment: 'headless desktop; phone viewport is emulated',
          approxFps: ((stats.frames - frame0) * 1000) / (Date.now() - t0),
          ...stats,
        });
        await page.evaluate(() => window.__proofreader.pause());
        await page
          .locator('[data-arcade-game]')
          .screenshot({ path: `${evidence}/${engine}-${width}.png` });
        assert.deepEqual(errors, []);
        console.log(
          `PASS ${engine}/${width}: WebGL, dual-axis aim, simultaneous inputs, weapons, jump, pause, context recovery`
        );
      } finally {
        await context.close();
      }
    }
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    try {
      await page.addInitScript(() => {
        const previous = {
          version: 2,
          unlocked: 2,
          cleared: [1],
          records: {
            'campaign:1:standard:standard': {
              score: 1234,
              seconds: 70,
              medals: [true, false, false],
            },
          },
        };
        localStorage.setItem('khc-arcade-proofreader-v2', JSON.stringify(previous));
        localStorage.setItem(
          'khc-arcade-proofreader-settings-v2',
          JSON.stringify({ sound: false, bindings: { fire: ' ' } })
        );
      });
      await page.goto('/games/proofreader/?rules=2&stage=1', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => Boolean(window.__proofreader));
      assert.match(await page.locator('[data-arcade-legacy]').textContent(), /another edition/);
      await clickControl(page.locator('[data-arcade-primary]'));
      await page.evaluate(() => window.__proofreader.tick(60));
      await page.evaluate(() => window.__proofreader.endRun());
      assert.match(await page.locator('[data-arcade-primary]').textContent(), /checkpoint/i);
      await clickControl(page.locator('[data-arcade-primary]'));
      assert.equal(await page.evaluate(() => window.__proofreader.state().retries), 1);
      assert.equal(await page.evaluate(() => window.__proofreader.state().player.health), 100);
      assert.equal(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem('khc-arcade-proofreader-v2')).records[
              'campaign:1:standard:standard'
            ].score
        ),
        1234
      );
      console.log(
        `PASS ${engine}: previous-edition preservation, conflicting-key reset, checkpoint retry`
      );
    } finally {
      await context.close();
    }
    const fallback = await browser.newPage({ baseURL });
    try {
      await fallback.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          if (type === 'webgl2' || type === 'webgl') return null;
          return original.call(this, type, ...args);
        };
      });
      await fallback.goto('/games/proofreader/', { waitUntil: 'networkidle' });
      await fallback.waitForSelector('[data-proof-unavailable="true"]');
      assert.match(
        await fallback.locator('[data-arcade-overlay-title]').textContent(),
        /unavailable/
      );
      assert.equal(
        await fallback
          .getByRole('heading', { name: 'The biological inspiration', includeHidden: true })
          .count(),
        1
      );
      console.log(`PASS ${engine}: accessible WebGL2-unavailable fallback`);
    } finally {
      await fallback.close();
    }
  } finally {
    await browser.close();
  }
}
await writeFile(`${evidence}/measurements.json`, JSON.stringify(measurements, null, 2));
console.log(`Proofreader 3D audit passed. Evidence: ${evidence}`);
