# Repository Guidelines

## Project Structure & Module Organization
This is an Astro static site for `khchao.com`. Source code lives in `src/`: routes in `src/pages`, shared layouts in `src/layouts`, reusable UI in `src/components`, utilities in `src/lib`, and site/CV data in `src/data`. Markdown and MDX content collections live in `src/content` and are validated by `src/content.config.ts`. Optimized source images live in `src/assets`; files in `public` are served verbatim. Maintenance scripts are in `scripts`. Build output (`dist`) and Astro generated types (`.astro`) are ignored.

## Build, Test, and Development Commands
Use Node 22, matching `.nvmrc` and GitHub Pages CI.

- `npm install` installs dependencies from `package-lock.json`.
- `npm run dev` starts the local Astro dev server at `http://localhost:4321`.
- `npm run check` runs Astro diagnostics, TypeScript checks, and content schema validation.
- `npm run build` creates the production static site in `dist`, including generated blog PDFs.
- `npm run pdf:posts` regenerates `dist/posts/<slug>/<slug>.pdf` after an existing build.
- `npm run preview` serves the built site locally for final review.

## Coding Style & Naming Conventions
Use TypeScript, Astro components, and content collections following existing patterns. Prefer 2-space indentation in `.astro`, `.ts`, `.mjs`, JSON, Markdown frontmatter, and CSS. Component files use PascalCase, such as `PublicationItem.astro`; utility modules use camelCase, such as `relatedPosts.ts`. Collection filenames use lowercase slug patterns, often prefixed by dates, for example `2025-06-openspliceai.md`. Keep public-facing data centralized in `src/data` when it is reused across pages.

## Testing Guidelines
There is no separate unit test suite. Treat `npm run check` as the required validation for types and content schemas, and run `npm run build` before submitting changes that affect routes, assets, Markdown/MDX, or configuration. For visual changes, also review pages locally with `npm run dev` or `npm run preview`.

## Commit & Pull Request Guidelines
Recent commits use short, imperative, sentence-case summaries, for example `Add software logos to /software listing and tool post headers`. Keep commits focused. Pull requests should describe the user-visible change, list validation performed, link related issues when available, and include screenshots for layout or visual updates.

## Security & Configuration Tips
Do not commit `.env` files, local paper materials, generated build output, or generated blog PDFs. Run `npx playwright install chromium` once on new machines before PDF generation. Keep `public/CNAME`, `astro.config.mjs` `site`, and SEO metadata aligned with `https://khchao.com`.
