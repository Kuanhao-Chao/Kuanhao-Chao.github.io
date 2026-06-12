// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { legacyRedirects } from './src/legacy-redirects.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://khchao.com',
  integrations: [mdx(), sitemap()],
  redirects: {
    // Renamed or removed top-level pages from the previous Jekyll site.
    '/about': '/',
    '/about.html': '/',
    '/about_me': '/',
    '/about-us': '/',
    '/resume': '/cv/',
    '/presentations': '/talks/',
    '/researches': '/research/',
    '/portfolio': '/research/',
    '/projects': '/research/',
    '/internship': '/cv/',
    '/year-archive': '/news/',
    // Per-item pages from the previous site (auto-generated; see
    // scripts/gen-legacy-redirects.mjs). Originals live on archive.khchao.com.
    ...legacyRedirects,
  },
});
