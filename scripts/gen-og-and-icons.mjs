// One-time, local-only generator for social-share + icon assets.
// Run on macOS (so librsvg resolves system fonts for the SVG text):
//   node scripts/gen-og-and-icons.mjs
//
// Writes into public/:
//   og.jpg              1200x630 branded share card (replaces the old square photo)
//   headshot.jpg        800x800 portrait for JSON-LD Person.image (stable URL)
//   favicon-16.png / favicon-32.png / apple-touch-icon.png / icon-512.png
//   site.webmanifest
//
// Uses sharp (already present via astro:assets). Outputs are committed; CI does
// not run this script.

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PUBLIC = join(ROOT, 'public');
const PORTRAIT = join(ROOT, 'src/assets/profile/portrait.jpg');

const C = {
  bg: '#fafaf8',
  ink: '#141414',
  accent: '#2e6e5e',
  muted: '#5d5d5d',
  white: '#fafaf8',
};
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// 1. Stable headshot for structured data (Person.image).
await sharp(PORTRAIT)
  .resize(800, 800, { fit: 'cover', position: 'attention' })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(join(PUBLIC, 'headshot.jpg'));

// 2. Open Graph / Twitter share card (1200x630).
const W = 1200;
const H = 630;
const D = 380; // portrait diameter
const px = W - D - 96; // portrait left
const py = (H - D) / 2; // portrait top
const cxc = px + D / 2;
const cyc = py + D / 2;

const circleMask = Buffer.from(
  `<svg width="${D}" height="${D}"><circle cx="${D / 2}" cy="${D / 2}" r="${D / 2}" fill="#fff"/></svg>`
);
const portraitCircle = await sharp(PORTRAIT)
  .resize(D, D, { fit: 'cover', position: 'attention' })
  .composite([{ input: circleMask, blend: 'dest-in' }])
  .png()
  .toBuffer();

const overlay = Buffer.from(`
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="14" height="${H}" fill="${C.accent}"/>
  <circle cx="${cxc}" cy="${cyc}" r="${D / 2 + 13}" fill="none" stroke="${C.accent}" stroke-width="3" opacity="0.55"/>
  <g font-family="${FONT}">
    <text x="92" y="214" font-size="23" font-weight="600" letter-spacing="4" fill="${C.accent}">COMPUTATIONAL BIOLOGIST</text>
    <text x="90" y="308" font-size="76" font-weight="700" fill="${C.ink}">Kuan-Hao Chao</text>
    <text x="92" y="362" font-size="29" font-weight="600" fill="${C.ink}">Senior Deep Learning Scientist, Illumina AI Lab</text>
    <text x="92" y="424" font-size="23" font-weight="400" fill="${C.muted}">AI for genomics — sequence-to-function models,</text>
    <text x="92" y="458" font-size="23" font-weight="400" fill="${C.muted}">genome annotation &amp; DNA language models.</text>
    <text x="92" y="536" font-size="28" font-weight="700" fill="${C.accent}">khchao.com</text>
  </g>
</svg>`);

await sharp({ create: { width: W, height: H, channels: 4, background: C.bg } })
  .composite([
    { input: portraitCircle, left: px, top: py },
    { input: overlay, left: 0, top: 0 },
  ])
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(join(PUBLIC, 'og.jpg'));

// 3. Monogram icons (teal rounded square + white "K").
const iconSvg = (s) => {
  const r = Math.round(s * 0.19);
  const fs = Math.round(s * 0.62);
  return Buffer.from(
    `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${s}" height="${s}" rx="${r}" fill="${C.accent}"/>` +
      `<text x="50%" y="51%" dominant-baseline="central" text-anchor="middle" ` +
      `font-family="${FONT}" font-size="${fs}" font-weight="700" fill="${C.white}">K</text></svg>`
  );
};
for (const s of [16, 32]) {
  await sharp(iconSvg(s)).png().toFile(join(PUBLIC, `favicon-${s}.png`));
}
await sharp(iconSvg(180)).flatten({ background: C.accent }).png().toFile(join(PUBLIC, 'apple-touch-icon.png'));

// Maskable 512 (full-bleed teal so Android's safe-zone mask never clips the K).
const mask512 = Buffer.from(
  `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="512" height="512" fill="${C.accent}"/>` +
    `<text x="50%" y="52%" dominant-baseline="central" text-anchor="middle" ` +
    `font-family="${FONT}" font-size="300" font-weight="700" fill="${C.white}">K</text></svg>`
);
await sharp(mask512).png().toFile(join(PUBLIC, 'icon-512.png'));

// 4. Web app manifest.
const manifest = {
  name: 'Kuan-Hao Chao',
  short_name: 'KH Chao',
  description:
    'Kuan-Hao Chao — computational biologist and Senior Deep Learning Scientist at the Illumina AI Lab.',
  start_url: '/',
  display: 'minimal-ui',
  background_color: C.bg,
  theme_color: C.bg,
  icons: [
    { src: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
};
writeFileSync(join(PUBLIC, 'site.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

console.log('Generated: og.jpg, headshot.jpg, favicon-16/32.png, apple-touch-icon.png, icon-512.png, site.webmanifest');
