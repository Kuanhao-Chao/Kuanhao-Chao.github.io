# khchao.com

Personal academic website for **Kuan-Hao Chao** — computational biologist and
Senior Deep Learning Scientist at the Illumina AI Lab.

Built with [Astro](https://astro.build) (content collections, zero client-side
frameworks), self-hosted variable fonts, and a small CSS design-token system.
The visual design is a minimalist, Calico-Labs-inspired aesthetic: warm off-white
background, near-black ink, a single muted-teal accent, large light-weight
headlines, and generous whitespace.

## Develop

Requires Node ≥ 18.20.8 (Node 22 LTS recommended — see `.nvmrc`).

```sh
npm install
npm run dev        # dev server at http://localhost:4321
npm run build      # production build to ./dist, including post PDFs
npm run pdf:posts  # regenerate post PDFs after an existing build
npm run preview    # preview the production build
npm run check      # astro check (types + content schemas)
```

`npm run build` expects a Playwright Chromium browser for PDF generation. On a new
machine, run `npx playwright install chromium` once after installing dependencies.

## Where things live

```
src/
  data/site.ts        # name, role, bio, nav menu, social links  ← edit identity here
  data/cv.ts          # experience, education, honors, mentorship, reviewing, side projects
  content/            # the content collections (Markdown + frontmatter)
    publications/      ·  presentations/  ·  research/  ·  teaching/  ·  news/
  content.config.ts   # collection schemas (the source of truth for frontmatter fields)
  styles/tokens.css   # colors, fonts, type scale, spacing  ← edit the design system here
  components/          # Header, Footer, Hero, cards, PublicationsList (+ filter island), …
  layouts/             # BaseLayout, PageLayout, EntryLayout
  pages/               # routes (index, publications, research, talks, teaching, cv, photos, news)
  assets/              # images optimized at build via astro:assets (figures, photos, profile)
public/                # CNAME, favicon, og.jpg, .nojekyll (served verbatim)
scripts/migrate-content.mjs  # one-time importer used to migrate the old Jekyll site
```

## Adding content

Each collection is a folder of Markdown files; the frontmatter fields are defined
and validated in `src/content.config.ts`. Examples:

- **Publication** — add `src/content/publications/<year>-<slug>.md` with `title`,
  `authors` (plain text; the owner's name "Kuan-Hao Chao" is auto-highlighted, keep
  `*`/`†` markers), `venue`, `date`, `type` (`journal` / `conference` / `preprint`),
  optional `doi`, `code`, `docs`, `slides`, `poster`, `video`, `news`, `bibtex`, and
  `featured: true` to surface it on the homepage.
- **Talk** — add to `src/content/presentations/` with `title`, `type`, `venue`,
  `startDate`, and optional `slides` / `video` / `link`.
- **News** — add to `src/content/news/` with `title`, `date`, `category`; put the rich
  text (with links) in the Markdown body. The newest 6 appear on the homepage and the
  feed at `/rss.xml`.
- **Research area** — add to `src/content/research/`; the Markdown body becomes the
  detail page at `/research/<slug>/`.

PDFs and slides are linked from external storage (`storage.khchao.com`) rather than
committed to the repo.

Blog post PDFs are the exception: they are generated into `dist/posts/<slug>/<slug>.pdf`
from the built HTML during `npm run build` and are not committed.

## Deploy (GitHub Pages → khchao.com)

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site and
publishes it to GitHub Pages. The custom domain is set via `public/CNAME`
(`khchao.com`) and `site` in `astro.config.mjs`.

First-time setup on the new repository:

1. Create the GitHub repo and push this project to `main`.
2. **Settings → Pages → Source → GitHub Actions**.
3. **Settings → Pages → Custom domain → `khchao.com`**, then enable *Enforce HTTPS*.
4. Because a custom domain can only be attached to one Pages site at a time, first
   verify this site on its `*.github.io` URL, then **remove the `khchao.com` custom
   domain from the old `Kuanhao-Chao.github.io` repo** before binding it here. DNS does
   not need to change. HTTPS may take a few minutes to re-provision after the switch.
