import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { builtAuditOrigin, builtFileForUrl, newAuditContext } from './builtSiteBrowser.mjs';

test('built-site paths resolve only inside the build root and same origin', () => {
  const root = resolve('/private/tmp/khc-built-browser-test');
  assert.equal(builtFileForUrl('https://khchao.com/games/proofreader-classic/?rules=2', root),
    resolve(root, 'games/proofreader-classic/index.html'));
  assert.equal(builtFileForUrl('https://khchao.com/_astro/app.js?version=1', root),
    resolve(root, '_astro/app.js'));
  assert.equal(builtFileForUrl('https://khchao.com/', root), resolve(root, 'index.html'));
  // Keep the scheme-rejection case without an insecure external link literal in source.
  const insecureOrigin = new URL(builtAuditOrigin);
  insecureOrigin.protocol = 'http:';
  assert.equal(insecureOrigin.protocol, 'http:');
  for (const url of [
    'https://example.com/games/proofreader/', insecureOrigin.href, 'file:///etc/passwd',
    'https://khchao.com/%2f..%2f..%2fAGENTS.md', 'https://khchao.com/%00',
    'https://khchao.com/%5c..%5cAGENTS.md', 'https://khchao.com/%zz', 'not a URL',
  ]) assert.equal(builtFileForUrl(url, root), null, url);
});

test('normal preview contexts are unchanged; offline mode installs local request fulfillment', async () => {
  const before = process.env.GAME_UI_AUDIT_OFFLINE;
  let handler;
  const context = { route: async (pattern, callback) => { assert.equal(pattern, '**/*'); handler = callback; } };
  const browser = { newContext: async (options) => { assert.deepEqual(options, { baseURL: 'https://khchao.com' }); return context; } };
  try {
    delete process.env.GAME_UI_AUDIT_OFFLINE;
    assert.equal(await newAuditContext(browser, { baseURL: 'https://khchao.com' }), context);
    assert.equal(handler, undefined);
    process.env.GAME_UI_AUDIT_OFFLINE = '1';
    assert.equal(await newAuditContext(browser, { baseURL: 'https://khchao.com' }), context);
    assert.equal(typeof handler, 'function');
    let aborted = false;
    await handler({ request: () => ({ url: () => 'https://example.com/remote.js' }),
      abort: async (reason) => { aborted = reason === 'blockedbyclient'; } });
    assert.equal(aborted, true);
    let response;
    await handler({ request: () => ({ url: () => 'https://khchao.com/missing-built-browser-test-route/' }),
      fulfill: async (value) => { response = value; } });
    assert.equal(response.status, 404);
  } finally {
    if (before === undefined) delete process.env.GAME_UI_AUDIT_OFFLINE;
    else process.env.GAME_UI_AUDIT_OFFLINE = before;
  }
});
