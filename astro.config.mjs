// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { legacyRedirects } from './src/legacy-redirects.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://khchao.com',
  // Math support for the `reports` section (LaTeX-heavy technical reports). The
  // mdx() integration extends this markdown config by default, so `.mdx` files
  // get the plugins too. Existing posts use no `$…$`, so this is inert for them.
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
  integrations: [
    mdx(),
    sitemap({
      // The `reports` section is in private launch: every report is `unlisted`
      // (noindex). Keep the whole /reports/ subtree out of the sitemap so its
      // URLs are never advertised. When a report goes public, narrow this to
      // exclude only the still-unlisted slugs.
      filter: (page) => !page.includes('/reports/'),
      serialize(item) {
        // Nudge crawl priority: homepage highest, primary sections next.
        if (item.url === 'https://khchao.com/') {
          item.priority = 1.0;
        } else if (/\/(research|publications|talks|cv|teaching|news|photos)\/$/.test(item.url)) {
          item.priority = 0.8;
        } else {
          item.priority = 0.7;
        }
        return item;
      },
    }),
  ],
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
