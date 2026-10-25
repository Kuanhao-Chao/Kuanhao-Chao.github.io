import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
import { builtAuditOrigin } from './builtSiteBrowser.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const entrypoint = fileURLToPath(new URL('../../node_modules/astro/bin/astro.mjs', import.meta.url));
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/** Owns the actual Astro process, including its pipes, on every exit path. */
export async function startPreview({ port, route = '/', startupTimeoutMs = 30000 }) {
  if (process.env.GAME_UI_AUDIT_OFFLINE === '1') {
    await access(new URL('../../dist/index.html', import.meta.url));
    return { baseURL: builtAuditOrigin, stop: async () => {}, logs: 'Offline built-site audit' };
  }
  const baseURL = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [entrypoint, 'preview', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  let closed = false;
  let spawnError;
  let stopping;
  const append = chunk => { log = (log + chunk).slice(-16000); };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('error', error => { spawnError = error; });
  const interrupt = code => {
    void stop().then(() => process.exit(code), error => {
      console.error(error);
      process.exit(1);
    });
  };
  const onInterrupt = () => interrupt(130);
  const onTerminate = () => interrupt(143);
  const removeHandlers = () => {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
  };
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  const close = new Promise(resolve => child.once('close', () => {
    closed = true;
    removeHandlers();
    resolve();
  }));
  async function waitForClose(milliseconds) {
    let timer;
    await Promise.race([close, new Promise(resolve => { timer = setTimeout(resolve, milliseconds); })]);
    clearTimeout(timer);
  }
  function stop() {
    stopping ??= (async () => {
      if (!closed) {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        await waitForClose(2000);
      }
      if (!closed) {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await waitForClose(2000);
      }
      child.stdout.destroy(); child.stderr.destroy();
      removeHandlers();
      if (!closed) throw new Error('Owned Astro preview did not close within four seconds.');
    })();
    return stopping;
  }
  try {
    const deadline = Date.now() + startupTimeoutMs;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (closed || child.exitCode !== null || child.signalCode !== null) throw new Error(`Astro preview exited before readiness.\n${log}`);
      try {
        const response = await fetch(baseURL + route, { signal: AbortSignal.timeout(1000) });
        await response.body?.cancel();
        if (response.ok) return { baseURL, stop, get logs() { return log; } };
      } catch {}
      await delay(100);
    }
    throw new Error(`Timed out waiting for Astro preview at ${route}.\n${log}`);
  } catch (error) {
    await stop();
    throw error;
  }
}
