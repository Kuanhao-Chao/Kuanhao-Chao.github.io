import { access, readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const SITE = 'https://khchao.com';
const LIVE = process.argv.includes('--live');

const errors = [];
const warnings = [];

const TEXT_EXTENSIONS = new Set([
  '.astro',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mdx',
  '.mjs',
  '.svg',
  '.ts',
  '.txt',
  '.webmanifest',
  '.xml',
  '.yaml',
  '.yml',
]);

const SCAN_ROOTS = [
  'astro.config.mjs',
  'package.json',
  'package-lock.json',
  'public',
  'scripts',
  'src',
  '.github',
];

const SAFE_SET_HTML_FILES = new Set([
  'src/components/BaseHead.astro',
  'src/components/Icon.astro',
  'src/components/LiftOnChaining.astro',
  'src/components/LiftOnCopies.astro',
  'src/components/LiftOnEval.astro',
  'src/components/LiftOnORF.astro',
  'src/components/LiftOnPairing.astro',
  'src/components/LiftOnPipeline.astro',
  'src/components/OpenSpliceAIArchitecture.astro',
  'src/components/OpenSpliceAIData.astro',
  'src/components/OpenSpliceAIVariant.astro',
  'src/components/OpenSpliceAIWorkflow.astro',
  'src/components/ShorkieData.astro',
  'src/components/ShorkieFineTuning.astro',
  'src/components/ShorkiePretraining.astro',
  'src/components/SplamCleanup.astro',
  'src/components/SplamRecognizer.astro',
  'src/components/WGIndexQuery.astro',
  'src/components/WGTWheelerOrder.astro',
  'src/components/WGTWheelie.astro',
  'src/pages/logo-options.astro',
  'src/pages/games/genome-jumper.astro',
  'src/pages/posts/[...slug].astro',
  'src/pages/projects.astro',
  'src/pages/publications/[...slug].astro',
  'src/pages/reports/[...slug].astro',
  'src/pages/research/[...slug].astro',
  'src/pages/software.astro',
]);

const SAFE_INNER_HTML_FILES = new Set([
  'public/wedding/index.html',
  'src/components/WGIndexQuery.astro',
  'src/pages/search.astro',
]);

const PRIVATE_PUBLIC_PATTERNS = [
  /1325\s+Old\s+County\s+Rd/i,
  /Unit\s+2056/i,
  /Artison\s+crossing/i,
];

const SECRET_PATTERNS = [
  /\bpwd=/i,
  /\bpasscode=/i,
  /\bclient_secret\b/i,
  /\bapi[_-]?key\s*[:=]/i,
  /\bsecret\s*[:=]/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
];

const LIVE_PATHS = ['/', '/robots.txt', '/sitemap-index.xml', '/search/', '/reports/', '/housewarming/'];

function relPath(path) {
  return relative(ROOT, path).split(sep).join('/');
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(path) {
  if (!(await pathExists(path))) return [];
  const info = await stat(path);
  if (info.isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.astro') continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(child)));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

async function scanFiles(paths) {
  const files = [];
  for (const scanRoot of paths) {
    files.push(...(await walk(join(ROOT, scanRoot))));
  }
  if (await pathExists(DIST)) {
    files.push(...(await walk(DIST)));
  } else {
    warnings.push('dist/ is missing; built-output security checks were skipped.');
  }

  for (const file of files) {
    if (!TEXT_EXTENSIONS.has(extname(file).toLowerCase())) continue;
    const text = await readFile(file, 'utf8');
    scanText(file, text);
  }
}

function scanText(file, text) {
  const rel = relPath(file);
  scanBlankTargets(rel, text);
  scanPlainHttp(rel, text);
  scanSecrets(rel, text);
  scanHtmlSinks(rel, text);
  scanIframes(rel, text);
  scanPrivacy(rel, text);
  scanInviteNoindex(rel, text);
  scanDangerousProtocols(rel, text);
}

function scanBlankTargets(rel, text) {
  for (const match of text.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)) {
    const tag = match[0];
    const relValue = tag.match(/\srel=["']([^"']*)["']/i)?.[1] ?? '';
    const tokens = new Set(relValue.toLowerCase().split(/\s+/).filter(Boolean));
    if (!tokens.has('noopener') || !tokens.has('noreferrer')) {
      errors.push(`${rel}: target="_blank" link is missing rel="noopener noreferrer": ${tag.slice(0, 140)}`);
    }
  }
}

function scanPlainHttp(rel, text) {
  for (const match of text.matchAll(/\bhttp:\/\/[^\s"'<>)]*/gi)) {
    const url = match[0].replace(/[.,;]+$/, '');
    if (
      url.startsWith('http://www.w3.org/') ||
      url.startsWith('http://www.sitemaps.org/') ||
      url.startsWith('http://www.google.com/schemas/') ||
      url.startsWith('http://localhost') ||
      url.startsWith('http://127.0.0.1') ||
      (rel === 'scripts/audit-security.mjs' && url.startsWith('http://khchao.com/'))
    ) {
      continue;
    }
    errors.push(`${rel}: insecure external HTTP URL: ${url}`);
  }
}

function scanSecrets(rel, text) {
  if (rel === 'scripts/audit-security.mjs') return;
  for (const pattern of SECRET_PATTERNS) {
    const match = text.match(pattern);
    if (match) errors.push(`${rel}: possible secret or credential in source: ${match[0].slice(0, 80)}`);
  }
}

function scanHtmlSinks(rel, text) {
  if (rel === 'scripts/audit-security.mjs') return;
  if (rel.startsWith('dist/')) return;
  if (/\bset:html\b/.test(text) && !SAFE_SET_HTML_FILES.has(rel)) {
    errors.push(`${rel}: unreviewed set:html sink; add a safe renderer or document it in audit-security.mjs.`);
  }
  if (/\binnerHTML\b/.test(text) && !SAFE_INNER_HTML_FILES.has(rel)) {
    errors.push(`${rel}: unreviewed innerHTML sink; prefer textContent or add an explicit sanitizer/review.`);
  }
}

function scanIframes(rel, text) {
  if (rel === 'scripts/audit-security.mjs') return;
  for (const match of text.matchAll(/<iframe\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\stitle=/i.test(tag)) {
      errors.push(`${rel}: iframe is missing a title attribute: ${tag.slice(0, 140)}`);
    }
    if (!/\sreferrerpolicy=["'][^"']+["']/i.test(tag)) {
      warnings.push(`${rel}: iframe is missing an explicit referrerpolicy: ${tag.slice(0, 140)}`);
    }
  }
}

function scanPrivacy(rel, text) {
  if (!rel.startsWith('public/') && !rel.startsWith('dist/')) return;
  for (const pattern of PRIVATE_PUBLIC_PATTERNS) {
    const match = text.match(pattern);
    if (match) errors.push(`${rel}: private address marker is published: ${match[0]}`);
  }
}

function scanInviteNoindex(rel, text) {
  if (!/^(public|dist)\/(housewarming|wedding|thesis-defense)\/index\.html$/.test(rel)) return;
  if (!/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*nofollow[^"']*["']/i.test(text)) {
    errors.push(`${rel}: private/event page must include robots noindex,nofollow.`);
  }
}

function scanDangerousProtocols(rel, text) {
  if (!/\.(astro|html|md|mdx)$/.test(rel)) return;
  for (const match of text.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const value = match[1].trim();
    if (/^(javascript|data):/i.test(value)) {
      errors.push(`${rel}: dangerous URL protocol in ${match[0].slice(0, 120)}`);
    }
  }
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, { redirect: 'manual', ...options });
  const text = await response.text().catch(() => '');
  return { response, text };
}

async function auditLiveSite() {
  let liveErrors = 0;
  for (const path of LIVE_PATHS) {
    const url = `${SITE}${path}`;
    try {
      const { response, text } = await fetchText(url);
      if (response.status >= 400) {
        errors.push(`live ${url}: returned HTTP ${response.status}`);
        liveErrors += 1;
        continue;
      }
      if (path.endsWith('/') && !/<html[\s>]/i.test(text)) {
        errors.push(`live ${url}: did not return HTML.`);
        liveErrors += 1;
      }
      if ((path === '/search/' || path === '/reports/' || path === '/housewarming/') && !/noindex/i.test(text)) {
        errors.push(`live ${url}: expected noindex marker is missing.`);
        liveErrors += 1;
      }
      for (const pattern of PRIVATE_PUBLIC_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          errors.push(`live ${url}: private address marker is published: ${match[0]}`);
          liveErrors += 1;
        }
      }
      if (path === '/robots.txt' && !/Disallow:\s*\/reports\//i.test(text)) {
        errors.push(`live ${url}: robots.txt does not disallow /reports/.`);
        liveErrors += 1;
      }
    } catch (error) {
      errors.push(`live ${url}: request failed: ${error.message}`);
      liveErrors += 1;
    }
  }

  try {
    const response = await fetch('http://khchao.com/', { redirect: 'manual' });
    const location = response.headers.get('location') ?? '';
    if (![301, 302, 307, 308].includes(response.status) || !location.startsWith('https://')) {
      warnings.push(`live http://khchao.com/: expected HTTPS redirect, got ${response.status} ${location}`);
    }
  } catch (error) {
    warnings.push(`live http://khchao.com/: redirect check failed: ${error.message}`);
  }

  try {
    const { response } = await fetchText(SITE, { method: 'GET' });
    // GitHub Pages serves static files and cannot send custom response headers, so these
    // are reported as informational warnings, never errors. `content-security-policy` and
    // `referrer-policy` are instead delivered via <meta> tags in src/components/BaseHead.astro
    // (the CSP keeps 'unsafe-inline' because inline theme scripts + ClientRouter + KaTeX
    // require it, so it is defense-in-depth against external-resource injection, not full XSS
    // mitigation). `x-frame-options` — and equally X-Content-Type-Options (nosniff), HSTS, and
    // Permissions-Policy — are header-only with no <meta> equivalent, so they are structurally
    // impossible on this host; per-iframe sandbox/referrerpolicy is the local defense instead.
    for (const header of ['content-security-policy', 'x-frame-options', 'referrer-policy']) {
      if (!response.headers.get(header)) {
        warnings.push(
          `live ${SITE}/: no ${header} response header — GitHub Pages cannot set headers ` +
            `(CSP + referrer-policy are delivered via <meta>; x-frame-options is header-only and not settable here).`
        );
      }
    }
  } catch {
    // Already covered by the path checks above.
  }

  if (liveErrors === 0) console.log(`Live passive audit checked ${LIVE_PATHS.length} URLs.`);
}

async function main() {
  await scanFiles(SCAN_ROOTS);
  if (LIVE) await auditLiveSite();

  if (warnings.length) {
    console.warn('Security audit warnings:');
    for (const warning of [...new Set(warnings)]) console.warn(`- ${warning}`);
  }

  if (errors.length) {
    console.error('Security audit failed:');
    for (const error of [...new Set(errors)]) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Security audit passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
