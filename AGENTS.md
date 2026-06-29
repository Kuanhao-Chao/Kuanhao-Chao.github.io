# Repository Guidelines

Astro static site for `khchao.com` (Node 22 — see `.nvmrc`). No client-side framework; content is Markdown/MDX collections validated by `src/content.config.ts`.

## Commands
- `npm install` — install deps.
- `npm run dev` — dev server at `http://localhost:4321`.
- `npm run check` — `astro check`: TypeScript + content-schema validation. This is the primary correctness gate; there is **no unit test suite**.
- `npm run build` — runs `build:site` (`astro build`) then `pdf:posts`. Run this before submitting changes to routes, assets, MD, or config.
- `npm run pdf:posts` — regenerates `dist/<section>/<slug>/<slug>.pdf` from an **existing** build (needs `dist/posts` to exist).
- `npm run audit:indexing` — post-build SEO/indexing invariant checker. Runs against the built `dist/` directory. **Always run this after `npm run build` to verify indexing and PDF standards.**
- `npm run preview` — serve the built site.

## Build & deploy quirks
- **PDF generation needs Playwright Chromium.** `npm run build` prints each `/posts/<slug>/` and `/reports/<slug>/` page to PDF via `scripts/gen-post-pdfs.mjs`. On a new machine run `npx playwright install chromium` once (CI does this with `--with-deps`).
- Push to `main` triggers `.github/workflows/deploy.yml` → build → GitHub Pages. Keep `public/CNAME` (`khchao.com`), `astro.config.mjs` `site` (`https://khchao.com`), and SEO metadata aligned.

## Content collections
Collections live in `src/content/` (`publications`, `presentations`, `research`, `teaching`, `news`, `posts`, `reports`). `src/content.config.ts` is the **source of truth** for frontmatter fields — read it before adding/editing content. Identity, nav, and CV data are centralized in `src/data/site.ts` and `src/data/cv.ts`; the design system is `src/styles/tokens.css`. `public/` is served verbatim; `src/assets/` images are optimized at build via `astro:assets`.

## The Scholar, SEO, and Indexing Pipeline
The blog `posts` and technical `reports` use a highly coordinated pipeline for Google Scholar discoverability and rich metadata indexing. These five files must move together:
- `src/lib/scholar.ts` — builds citation metadata and citation reference strings.
- `src/components/BaseHead.astro` — emits Person/WebSite JSON-LD and Google Scholar citation tags.
- `src/pages/{posts,reports}/[...slug].astro` — builds `ScholarlyArticle` JSON-LD and feeds data to `BaseHead`.
- `scripts/gen-post-pdfs.mjs` — prints built HTML pages to `<slug>.pdf` under 5MB for Scholar.
- `scripts/audit-indexing.mjs` — asserts all canonical, sitemap, robots, citation metadata, and PDF invariants.

## Non-obvious gotchas
- **`reports` are private-launch.** The `reports` schema defaults to `unlisted: true`. To transition a report (or the entire reports section) to public, **coordinated changes are required across 5 places**:
  1. Set `unlisted: false` in the entry's frontmatter.
  2. Narrow the sitemap `filter` in `astro.config.mjs` to include the public report(s).
  3. Allow PDF generation in `shouldSkipPdf` inside `scripts/gen-post-pdfs.mjs`.
  4. Allow crawling in `public/robots.txt` (remove `Disallow: /reports/` or specify exception).
  5. Update the indexing checks/expectations in `scripts/audit-indexing.mjs`.
- **`src/legacy-redirects.mjs` is auto-generated** by `scripts/gen-legacy-redirects.mjs` ("do not edit by hand"). Edit the generator, not the data file.
- **`scripts/gen-legacy-redirects.mjs`, `scripts/gen-og-and-icons.mjs`, and `scripts/migrate-content.mjs` are one-time, local-only** — CI never runs them; their outputs (redirects, `og.jpg`, favicons, manifest) are committed.
- **The LiftOn `v2` → `v1-0-9` redirects in `astro.config.mjs` are intentional** ("v2.0.0" is reserved for a separate experimental project). Do not "fix" them back.
- **Math (KaTeX) is configured** in `astro.config.mjs` (`remark-math` + `rehype-katex`) for the LaTeX-heavy `reports` section; `mdx()` extends the same markdown config to `.mdx`.

## Style
2-space indentation in `.astro`, `.ts`, `.mjs`, JSON, Markdown frontmatter, CSS. Component files are PascalCase (`PublicationItem.astro`); utility modules are camelCase (`relatedPosts.ts`). Collection filenames use lowercase slug patterns, often date-prefixed (`2025-06-openspliceai.md`).

## Commits & PRs
Short, imperative, sentence-case summaries (e.g. `Add software logos to /software listing and tool post headers`). Keep commits focused. For layout/visual changes, review locally with `npm run dev` or `npm run preview` and include screenshots in the PR.

## Do not commit
`.env`, `paper/` (local paper materials), `dist/`, `.astro/`, generated blog/report PDFs.
