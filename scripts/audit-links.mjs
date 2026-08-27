import { access, readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const SITE = 'https://khchao.com';
const LIVE = process.argv.includes('--live');
const errors = [];
const warnings = [];

const REQUIRED_PATHS = [
  '/',
  '/talks/',
  '/projects/',
  '/cv/',
  '/research/gene-expression/',
  '/research/splice-sites/',
  '/publications/shorkie/',
];

const REQUIRED_STRINGS = [
  'ProbGen2026_0325.pdf',
  'Kuan-Hao_Chao_dissertation_08_2025.pdf',
  'JHU_joint_lab_meeting_2024.pdf',
  'github.com/calico/shorkie-paper',
  'khchao.com/shorkie/',
  'Related resources',
];

// These paths are separate project sites or intentional legacy redirects on the
// same custom domain. They must be checked live, but are not emitted by this
// Astro build and therefore cannot be resolved inside dist/.
const LIVE_SAME_ORIGIN_PREFIXES = ['/shorkie', '/splam', '/LiftOn', '/OpenSpliceAI', '/gffbase'];
// '/posts/lifton-v1-0-9' used to sit here, which is exactly how a redirect to a
// `draft: true` post stayed green while 404ing on the live site. Do not re-add a
// path here to silence a redirect; point the redirect at a page that is built.
const LEGACY_SAME_ORIGIN_PATHS = ['/404/'];

function relPath(path) {
  return relative(ROOT, path).split(sep).join('/');
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(path) {
  if (!(await exists(path))) return [];
  const info = await stat(path);
  if (info.isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(child)));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function htmlPathForUrl(url) {
  const parsed = new URL(url, SITE);
  let pathname = decodeURIComponent(parsed.pathname);
  if (!pathname.startsWith('/')) return null;
  if (pathname === '/') return join(DIST, 'index.html');
  if (pathname.endsWith('/')) pathname += 'index.html';
  return join(DIST, pathname.slice(1));
}

function isInternal(url) {
  try {
    const parsed = new URL(url, SITE);
    return parsed.origin === SITE && !isLiveSameOrigin(parsed) && !isLegacySameOrigin(parsed);
  } catch {
    return false;
  }
}

function isLiveSameOrigin(parsed) {
  return (
    parsed.origin === SITE &&
    LIVE_SAME_ORIGIN_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix))
  );
}

function isLegacySameOrigin(parsed) {
  return parsed.origin === SITE && LEGACY_SAME_ORIGIN_PATHS.includes(parsed.pathname);
}

function extractTargets(html) {
  const targets = [];
  for (const match of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    targets.push(decodeHtml(match[1].trim()));
  }
  return targets;
}

async function validateInternalTarget(raw, sourcePath) {
  if (
    !raw ||
    raw.startsWith('#') ||
    raw.includes('${') ||
    /^(?:mailto|tel|javascript|data):/i.test(raw)
  )
    return;
  let parsed;
  try {
    parsed = new URL(raw, SITE);
  } catch {
    errors.push(`${relPath(sourcePath)}: invalid URL ${raw}`);
    return;
  }
  if (!isInternal(parsed.href)) return;
  const target = htmlPathForUrl(parsed.href);
  if (!target || !(await exists(target))) {
    errors.push(`${relPath(sourcePath)}: missing internal target ${raw}`);
    return;
  }
  if (parsed.hash) {
    const targetHtml = await readFile(target, 'utf8');
    const fragment = decodeURIComponent(parsed.hash.slice(1));
    const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (
      !new RegExp(`(?:id|name)=["']${escaped}["']`, 'i').test(targetHtml) &&
      !new RegExp(`id=${escaped}(?:\\s|>)`, 'i').test(targetHtml)
    ) {
      errors.push(`${relPath(sourcePath)}: missing fragment ${raw}`);
    }
  }
}

async function collectExternalTargets(htmlFiles) {
  const urls = new Set();
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    for (const raw of extractTargets(html)) {
      try {
        const parsed = new URL(raw, SITE);
        if (
          /^https?:$/i.test(parsed.protocol) &&
          (parsed.origin !== SITE || isLiveSameOrigin(parsed))
        )
          urls.add(parsed.href);
      } catch {
        // Internal validation reports malformed URLs; live checking skips them.
      }
    }
  }
  return urls;
}

async function requestWithFallback(url) {
  const request = async (init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      return await fetch(url, { ...init, redirect: 'follow', signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };
  let response = await request({ method: 'HEAD' });
  if (response.status === 405 || response.status === 501 || response.status === 0) {
    response = await request({ method: 'GET', headers: { range: 'bytes=0-1023' } });
  }
  return response;
}

async function auditLive(urls) {
  const knownBlocked = new Set([401, 403, 406, 409, 429, 999]);
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      if (!url) return;
      try {
        const response = await requestWithFallback(url);
        if (response.status >= 400) {
          const message = `${response.status} ${url}`;
          if (knownBlocked.has(response.status))
            warnings.push(`Live link may require access or bypass WAF: ${message}`);
          else errors.push(`Live link failed: ${message}`);
          continue;
        }
        if (/\.pdf(?:$|[?#])/i.test(new URL(url).pathname)) {
          const contentType = response.headers.get('content-type') ?? '';
          if (!/application\/pdf/i.test(contentType)) {
            errors.push(`Expected PDF MIME type but received ${contentType || 'none'}: ${url}`);
          }
        }
      } catch (error) {
        errors.push(
          `Live link request failed: ${url} (${error instanceof Error ? error.message : String(error)})`
        );
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

async function main() {
  if (!(await exists(DIST))) {
    errors.push('dist/ is missing; run npm run build before npm run audit:links.');
  } else {
    const htmlFiles = (await walk(DIST)).filter((file) => extname(file).toLowerCase() === '.html');
    const htmlText = (await Promise.all(htmlFiles.map((file) => readFile(file, 'utf8')))).join(
      '\n'
    );
    for (const required of REQUIRED_STRINGS) {
      if (!htmlText.includes(required))
        errors.push(`Built site is missing required resource string: ${required}`);
    }
    for (const path of REQUIRED_PATHS) {
      const target = htmlPathForUrl(`${SITE}${path}`);
      if (!target || !(await exists(target)))
        errors.push(`Required built route is missing: ${path}`);
    }
    for (const file of htmlFiles) {
      for (const raw of extractTargets(await readFile(file, 'utf8'))) {
        await validateInternalTarget(raw, file);
      }
    }
    if (LIVE) await auditLive(await collectExternalTargets(htmlFiles));
  }

  for (const warning of warnings) console.warn(`WARN ${warning}`);
  for (const error of errors) console.error(`ERROR ${error}`);
  if (errors.length) {
    console.error(
      `Link audit failed with ${errors.length} error(s) and ${warnings.length} warning(s).`
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Link audit passed${LIVE ? ' (including live external checks)' : ''} with ${warnings.length} warning(s).`
    );
  }
}

await main();
