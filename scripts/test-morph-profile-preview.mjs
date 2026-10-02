import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

// A real occupied port and real Astro preview exercise automatic port fallback.
// Only Chromium is replaced: stop before timed profiling or browser launch.
let foreignRequests = 0;
const foreign = createServer((_request, response) => {
  foreignRequests++;
  response.end('foreign-preview-collision-fixture');
});
const originalLaunch = chromium.launch;
const verified = new Error('Owned preview verified; no performance measurements requested');
let selectedURL;
let browserClosed = false;
try {
  await new Promise((resolve, reject) => {
    foreign.once('error', reject);
    foreign.listen(4338, '127.0.0.1', resolve);
  });
  chromium.launch = async () => ({
    async newContext({ baseURL }) {
      selectedURL = new URL(baseURL);
      assert.notEqual(
        selectedURL.port,
        '4338',
        'browser context must use the owned preview fallback port, not the occupied requested port'
      );
      const response = await fetch(selectedURL);
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.ok(
        html.includes('data-background-stage="distribution"'),
        'selected URL serves the built seven-stage site'
      );
      assert.ok(!html.includes('foreign-preview-collision-fixture'));
      assert.equal(foreignRequests, 0, 'profiler must never request the unrelated server');
      throw verified;
    },
    async close() {
      browserClosed = true;
    },
  });
  await assert.rejects(import('./profile-morph.mjs'), (error) => error === verified);
  assert.equal(browserClosed, true, 'profiler closes its browser on early exit');
  // The production outer finally must also stop its owned fallback preview.
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(Number(selectedURL.port), '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve()))
  );
  console.log(
    `[morph-profile-preview] Passed: requested 4338 occupied; selected owned ${selectedURL.href}; foreign requests 0; browser/server cleanup verified.`
  );
} finally {
  chromium.launch = originalLaunch;
  if (foreign.listening)
    await new Promise((resolve, reject) =>
      foreign.close((error) => (error ? reject(error) : resolve()))
    );
}
