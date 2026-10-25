/** Optional, local-only browser transport for dist/, matching the PDF generator's approach.
 * No server or external requests; normal preview/live audit behavior is unchanged.
 */
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const builtAuditOrigin = 'https://khchao.com';
const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm',
  '.pdf': 'application/pdf', '.xml': 'application/xml', '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4',
};

/** Only same-origin, decoded paths contained in the build directory may be read. */
export function builtFileForUrl(raw, root = dist) {
  try {
    const url = new URL(raw);
    if (url.origin !== builtAuditOrigin) return null;
    const name = decodeURIComponent(url.pathname);
    if (name.includes('\0') || name.includes('\\')) return null;
    const path = resolve(root, `.${name}`, name.endsWith('/') ? 'index.html' : '');
    return path.startsWith(resolve(root) + sep) ? path : null;
  } catch { return null; }
}

export async function newAuditContext(browser, options) {
  const context = await browser.newContext(options);
  if (process.env.GAME_UI_AUDIT_OFFLINE !== '1') return context;
  await context.route('**/*', async (route) => {
    const path = builtFileForUrl(route.request().url());
    if (!path) return route.abort('blockedbyclient');
    try {
      if (!(await stat(path)).isFile()) throw new Error('Not a file');
      await route.fulfill({ path, contentType: contentTypes[extname(path)] ?? 'application/octet-stream' });
    } catch {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Built file not found' });
    }
  });
  return context;
}
