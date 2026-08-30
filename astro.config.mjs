// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
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
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex],
    }),
  },
  integrations: [
    mdx(),
    sitemap({
      // The `reports`, `papers`, `algorithms`, `deep_dives`, and `photos`
      // sections are non-indexed. Keep them out of the sitemap so their URLs
      // are never advertised to search engines.
      filter: (page) =>
        !page.includes('/reports/') &&
        !page.includes('/papers/') &&
        !page.includes('/logo-options/') &&
        !page.includes('/search/') &&
        !page.includes('/algorithms/') &&
        !page.includes('/deep_dives/') &&
        !page.includes('/photos/'),
      serialize(item) {
        // Nudge crawl priority based on content depth and discovery value:
        if (item.url === 'https://khchao.com/') {
          item.priority = 1.0;
        } else if (
          /\/(research|publications|software|posts|chromatin|shorkie-lab)\/$/.test(item.url)
        ) {
          item.priority = 0.9;
        } else if (
          /\/(talks|cv|teaching|news|projects)\/$/.test(item.url) ||
          /\/publications\/[^\/]+\/$/.test(item.url) ||
          /\/posts\/[^\/]+\/$/.test(item.url) ||
          /\/research\/[^\/]+\/$/.test(item.url)
        ) {
          item.priority = 0.8;
        } else {
          item.priority = 0.7;
        }
        return item;
      },
    }),
  ],
  redirects: {
    // The playground moved under the Shorkie Lab hub when the language-model page joined it.
    // Renaming a route kills its URL and `audit:links` cannot see a path that simply stopped
    // existing, so the old one is redirected here rather than allow-listed anywhere.
    '/variant-playground': '/shorkie-lab/shorkie/',
    // Renamed or removed top-level pages from the previous Jekyll site.
    '/about': '/',
    '/about.html': '/',
    '/about_me': '/',
    '/about-us': '/',
    '/resume': '/cv/',
    '/presentations': '/talks/',
    '/researches': '/research/',
    '/portfolio': '/research/',
    '/internship': '/cv/',
    '/year-archive': '/news/',
    // LiftOn report/post renamed v2.0.0 -> v1.0.9 (this is the incremental
    // release of the published tool; "v2.0.0" is reserved for a separate
    // experimental project). This pointed at /posts/lifton-v1-0-9 until that
    // post went `draft: true` and stopped being built, which turned every
    // previously-shared /posts/lifton-v2 link into a 404. It now lands on the
    // published LiftOn post; repoint it at the version post if that ships.
    '/posts/lifton-v2': '/posts/lifton/',
    '/deep_dive': '/deep_dives/',
    '/deep-dive': '/deep_dives/',
    '/deep-dives': '/deep_dives/',
    '/deep_dive/gwas': '/deep_dives/gwas/',
    '/deep-dive/gwas': '/deep_dives/gwas/',
    '/deep-dives/gwas': '/deep_dives/gwas/',
    // OpenSpliceAI docs moved off ccb.jhu.edu/openspliceai onto GitHub Pages, which serves
    // them from the repo path /OpenSpliceAI/. Pages paths are case-sensitive, so catch the
    // lowercase spelling the old CCB URL used.
    '/openspliceai': '/OpenSpliceAI/',
    // LiftOn docs likewise moved off ccb.jhu.edu/lifton; Pages serves them from the
    // repo path /LiftOn/. Same case-sensitivity catch for the lowercase CCB spelling.
    '/lifton': '/LiftOn/',
    // The v1.0.10 report was superseded by v1.0.11 (a single-fix release whose
    // numbers were re-measured); keep the previously-shared URL working.
    '/reports/lifton-v1-0-10-technical-report': '/reports/lifton-v1-0-11-technical-report',
    // The GWAS track was rebuilt as the workflow counterpart to the statistical-genetics
    // theory track, and some lessons were renamed to say what they now cover. The old
    // URLs have been shared, so they keep working.
    '/deep_dives/gwas-biological-variation-cdcv': '/deep_dives/gwas-study-design/',
    '/deep_dives/gwas-genotyping-imputation': '/deep_dives/gwas-arrays-imputation/',
    '/deep_dives/gwas-population-stratification': '/deep_dives/gwas-population-structure/',
    '/deep_dives/gwas-association-statistics': '/deep_dives/gwas-running-the-scan/',
    '/deep_dives/gwas-multiple-testing-manhattan': '/deep_dives/gwas-reading-the-output/',
    '/deep_dives/gwas-linkage-disequilibrium-ldsc': '/deep_dives/gwas-ld-reference-panels/',
    '/deep_dives/gwas-fine-mapping-functional-genomics': '/deep_dives/gwas-fine-mapping-practice/',
    '/deep_dives/gwas-polygenic-risk-scores-prs': '/deep_dives/gwas-prs-practice/',
    // Per-item pages from the previous site (auto-generated; see
    // scripts/gen-legacy-redirects.mjs). Originals live on archive.khchao.com.
    ...legacyRedirects,
  },
});
