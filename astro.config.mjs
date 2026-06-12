// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://khchao.com',
  integrations: [mdx(), sitemap()],
  redirects: {
    '/about': '/',
    '/about.html': '/',
    '/about_me': '/',
    '/resume': '/cv',
    '/presentations': '/talks',
    '/researches': '/research',
  },
});
