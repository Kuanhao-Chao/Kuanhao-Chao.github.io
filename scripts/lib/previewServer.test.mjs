import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startPreview } from './previewServer.mjs';

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('stopping a ready preview releases its listening port and is idempotent', { timeout: 10000 }, async () => {
  const port = await freePort();
  const preview = await startPreview({ port, route: '/software/' });
  try {
    assert.equal((await fetch(preview.baseURL + '/software/')).status, 200);
  } finally {
    await preview.stop();
  }
  await preview.stop();
  await assert.rejects(fetch(preview.baseURL + '/software/', { signal: AbortSignal.timeout(1000) }));
});

test('a startup timeout closes the preview even when no handle was returned', { timeout: 10000 }, async () => {
  const port = await freePort();
  await assert.rejects(startPreview({ port, route: '/missing-audit-route/', startupTimeoutMs: 1500 }), /Timed out waiting/);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/software/`, { signal: AbortSignal.timeout(1000) }));
});

test('a failed audit releases the preview in its finally block', { timeout: 10000 }, async () => {
  const port = await freePort();
  const preview = await startPreview({ port, route: '/software/' });
  await assert.rejects(async () => {
    try {
      throw new Error('Deliberate gameplay assertion failure');
    } finally {
      await preview.stop();
    }
  }, /Deliberate gameplay assertion failure/);
  await assert.rejects(fetch(preview.baseURL, { signal: AbortSignal.timeout(1000) }));
});

test('interrupting the audit owner also stops its preview before the owner exits', { timeout: 10000, skip: process.platform === 'win32' }, async () => {
  const port = await freePort();
  const moduleURL = new URL('./previewServer.mjs', import.meta.url).href;
  const owner = spawn(process.execPath, ['--input-type=module', '-e', `import { startPreview } from ${JSON.stringify(moduleURL)}; await startPreview({ port: ${port}, route: '/software/' }); console.log('ready');`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise(resolve => owner.once('close', resolve));
  let log = '';
  try {
    await new Promise((resolve, reject) => {
      owner.stdout.on('data', chunk => { log += chunk; if (log.includes('ready')) resolve(); });
      owner.once('error', reject);
      owner.once('exit', () => reject(new Error('Audit owner exited before readiness')));
    });
    owner.kill('SIGTERM');
    await exited;
    const serverIsAlive = await fetch(`http://127.0.0.1:${port}/software/`).then(() => true, () => false);
    assert.equal(serverIsAlive, false, 'audit interruption left the preview server alive');
    assert.equal(owner.exitCode, 143, 'interrupted audits must retain a nonzero exit status');
  } finally {
    // This isolated process group was created by this test; clean its descendants
    // even when the regression correctly detects the old orphaning behavior.
    try { process.kill(-owner.pid, 'SIGTERM'); } catch {}
    owner.stdout.destroy(); owner.stderr.destroy();
  }
});

test('the real game audit exits nonzero and closes its preview on a configuration failure', { timeout: 10000 }, async () => {
  const entrypoint = fileURLToPath(new URL('../audit-game-ui.mjs', import.meta.url));
  const child = spawn(process.execPath, [entrypoint, '--ci'], {
    env: { ...process.env, GAME_UI_AUDIT_GAMES: 'dino-run', GAME_UI_AUDIT_BROWSERS: 'invalid-browser' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  assert.equal(exitCode, 1, 'a failed audit must not turn into a successful process exit');
  assert.match(log, /Unsupported GAME_UI_AUDIT_BROWSERS/);
  const address = log.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
  assert.ok(address, 'the test must fail after an actual preview has started');
  await assert.rejects(fetch(address, { signal: AbortSignal.timeout(1000) }));
});
