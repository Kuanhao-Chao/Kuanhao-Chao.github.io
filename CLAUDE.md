# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Also read `AGENTS.md` (contributor workflow, style, commit/PR norms, list of one-time local scripts) and `README.md`. This file focuses on architecture and avoids repeating them; keep all three in sync when behavior changes.

## What this is

Astro 7 static site for the personal academic website `khchao.com` (Kuan-Hao Chao). No client-side UI framework — content is Markdown/MDX in typed content collections, rendered to static HTML and deployed to GitHub Pages on every push to `main`. Node 22 (`.nvmrc`).

## Commands

- `npm run dev` — dev server at http://localhost:4321.
- `npm run check` — `astro check` (TypeScript + content-schema validation). **Primary correctness gate; there is no unit-test suite.**
- `npm run build` — `astro build` then `pdf:posts`. Needs Playwright Chromium (run `npx playwright install chromium` once on a new machine).
- `npm run pdf:posts` — regenerate per-page PDFs from an existing `dist/` (requires a prior build).
- `npm run audit:indexing` — post-build SEO/indexing invariant checker (see below). Run after `npm run build`.
- `npm run audit:posts` — Playwright-driven visual/behavioral audit of interactive post animations (`scripts/audit-post-ui.mjs`): boots a preview server, drives chromium+webkit across desktop/phone × light/dark, and checks figure zoom, animation playback, `prefers-reduced-motion`, and print output against a per-post `inventory` of expected animation/figure counts. Update `inventory` when a post's interactive component count changes.
- `npm run audit:deep-dives` — Playwright rendering gate for the statistical-genetics curriculum (see below); `audit:deep-dives:ci` is the chromium-only smoke form.
- `npm run audit:narrow` — the 320px profile alone, chromium, both themes, every deep-dive route: document overflow (naming the unclipped elements), KaTeX errors, empty SVGs and un-typeset `$…$`. Exists because the full gate does not fit in a ten-minute budget and the smoke form's matrix is desktop and phone only — **it never opens a 320px viewport**, which is the one width this curriculum actually breaks at. Takes a substring filter: `npm run audit:narrow statgen`.
- `npm run audit:security` — static scan (`scripts/audit-security.mjs`) over `src/`, `public/`, `scripts/`, `.github/`, and config files for `target="_blank"` without `rel=noopener`, plain-`http://` links, hardcoded secrets, unsanitized `set:html`/`innerHTML` sinks (outside an allowlist), iframe issues, privacy leaks, missing `noindex` on invite pages, and `javascript:`/`data:` protocol usage. `npm run audit:security:live` additionally fetches the live site to check response headers.
- `npm run preview` — serve the built site.

There is no "run a single test"; validation is whole-repo (`check`, plus `audit:indexing`/`audit:posts`/`audit:security` after a build).

## Architecture

### Content collections are the source of truth
All page content lives in typed collections under `src/content/` — `publications`, `presentations`, `research`, `teaching`, `news`, `posts`, `reports`. **`src/content.config.ts` defines and validates every frontmatter field; read it before adding or editing any content entry.** Filenames are lowercase slugs (often date-prefixed); the slug becomes the URL. List/detail pages in `src/pages/` call `getCollection(...)` and render via `src/components/`; dynamic detail routes are `src/pages/<section>/[...slug].astro`.

### Identity, navigation, and design are centralized
- `src/data/site.ts` — name, role, bio, nav menu, social links, and the structured `identity` facts used for JSON-LD. Most components read from here.
- `src/data/cv.ts` — CV data (experience, education, honors, …).
- `src/styles/tokens.css` — the design system (colors, fonts, type scale, spacing). Change the design here, not in per-component styles.

### The scholar / SEO / indexing pipeline (the most load-bearing subsystem)
`posts` (blog) and `reports` (technical reports) are "academic document" sections that share machinery making them discoverable by Google Scholar and rich-result crawlers. Five files move together:
- `src/lib/scholar.ts` — builds `citation_*` meta and reference strings.
- `src/components/BaseHead.astro` — emits Person + WebSite JSON-LD on every page, plus Google Scholar `citation_*` tags and `noindex` when passed `scholarMeta` / `noindex`.
- `src/pages/posts/[...slug].astro` and `.../reports/[...slug].astro` — build per-entry `ScholarlyArticle` + breadcrumb JSON-LD and thread `scholarMeta` through `EntryLayout` → `BaseLayout` → `BaseHead`.
- `scripts/gen-post-pdfs.mjs` — prints each built page to a `<slug>.pdf` with Playwright (one PDF per entry, kept ≤5 MB for Scholar by capping image resolution).
- `scripts/audit-indexing.mjs` (`npm run audit:indexing`) — asserts every invariant of the above against `dist/`: sitemap membership, canonical, robots meta, visible h1/abstract/references, citation meta, `ScholarlyArticle` JSON-LD, and PDF presence/size/extractable text. **This is the regression test for the whole subsystem — run it whenever you touch the head, the slug pages, the PDF script, or report privacy.**

### Reports are in private launch — gated off in several coordinated places
A report builds a live URL + page but stays hidden until deliberately published. The gate is enforced redundantly, and `audit:indexing` fails if the pieces disagree:
1. `src/content.config.ts` — `reports` schema defaults `unlisted: true` (→ per-page `noindex`, no citation meta, no PDF link).
2. `astro.config.mjs` — sitemap `filter` excludes the entire `/reports/` subtree.
3. `scripts/gen-post-pdfs.mjs` — `shouldSkipPdf` skips report PDFs entirely.
4. `public/robots.txt` disallows `/reports/`; the `/reports/` index page is `noindex`.

To take a report public, change **all of these in concert** (set `unlisted: false`, narrow the sitemap filter, allow its PDF, relax robots/audit). The audit script encodes the current "whole section private" state, so publishing requires updating it too — don't relax one place in isolation.

### The `/terminal/` shell

An interactive UNIX shell over the site's own content, following the same three-layer split as the games: pure engine in `src/lib/terminal.ts` (+ `terminal.test.ts`), DOM controller in `src/scripts/terminal.ts`, page in `src/pages/terminal.astro`. Things specific to it:

- **One controller, two mountings.** `initTerminal(root, options)` powers both the full-screen page and `src/components/HomeTerminal.astro` on the homepage; `TerminalOptions` differ only in `boot`, `demo` and `exitHref`. The inline mounting types a build-time demo and hands over on the first keydown/pointerdown — via a **capture-phase** listener, so the takeover lands before the keystroke and the demo's half-typed text can't interleave. The index is fetched only on that first interaction. **A component mounting the shell must import `src/styles/terminal.css` itself** — miss it and every behaviour test still passes against a completely unstyled card.

- **`BaseLayout` has a `bare` prop**, used only here: it drops the header, footer, fixed overlays and skip link, and `main` becomes a flex column that fills the viewport (`.main--bare` in `global.css`). A bare page still needs an `<h1>` — `audit-indexing.mjs` asserts one on every sitemap URL — so `/terminal/` carries a `.visually-hidden` heading. `bare` also drops the **theme toggle** (it lives in the header), which is why the shell carries its own: a `theme` command returning a `{ type: 'theme' }` effect, plus a `☾`/`☀` button in the title bar. `window.__khcTheme` itself *is* present on bare pages — the layout's second inline script is unconditional.
- **`bare` is why every `transition:persist` script must re-acquire its element.** `transition:persist` normally keeps a node *identical* across navigations, which tempts a script into `const el = document.querySelector(...)` once at module top level. That guarantee dies on a page that doesn't render the element: there are now four bare pages — `/terminal/`, `/lab/`, `/chromatin/` and `/variant-playground/` — so `Header`, `SiteBackground`, `ReadingProgress` and `PageScan` are destroyed on each of them and rebuilt on the way back — and Astro will not re-execute an already-loaded module script. All four once captured their element once, and a single `/` → `/terminal/` → `/` round trip left the theme toggle and mobile menu unbound, the background canvas at its default 300×150 painting nothing, and the reading bar writing to a detached node. Each now re-acquires inside a `bind()`/`attach()` called on `astro:page-load`, guarded by a `dataset` flag so the persisted case stays a no-op; document-level listeners are installed once and read a mutable reference the rebind updates. **Add a persisted element, or a second bare page, and this is the trap.**
- **The shell follows the site theme.** `src/styles/terminal.css` defines the light palette on `.term` and overrides it under `html[data-theme='dark']`. That plain descendant selector works only because the file is imported as plain CSS; inside a component `<style>` Astro would scope both halves and it would silently never match. Every colour must go through a `--term-*` token — a literal reads fine in the theme it was written for and strands in the other.
- **The DNA helix is a pure function**, `dnaFrame(phase, rows, width)`: two antiphase sine strands, with the cosine sign deciding which is nearer and therefore which base is uppercase. Frame size and base complementarity are unit-tested, so changes to it fail loudly.
- **The boot is a genome assembly + annotation pipeline**, not a stat block: `pipelineStages()`, `progressBar()` and `stageLine()` are pure and tested, and the controller's single rAF drives the helix, the bar fills *and* the closing report off one clock so they cannot drift. It deliberately reports **no publication or talk counts** — a test asserts their absence, and `neofetch` is where the counts live now.
- **The three traffic lights are real controls.** Minimise collapses the body to the title bar (`.term--min`), close dismisses the homepage card to a sibling reopen chip (`.term--closed`) and still navigates home from `/terminal/`, and zoom is `requestFullscreen()` on `/terminal/` and a link to it from the homepage. Each mounting declares only the controls it owns via `data-terminal-min|close|zoom|reopen`; where a dot is genuinely navigation it stays an `<a>` with no data attribute, so the controller never branches on which page it is.

- **`src/pages/terminal.json.js` is a second public front door to the content.** It emits the virtual filesystem *and* the retrieval corpus in one payload, and it re-derives the privacy gates itself rather than inheriting them — `posts` filter on `draft`, `reports` on `unlisted` (different fields; a single filter silently misses one, so reports are excluded wholesale). `auditTerminalIndex` in `scripts/audit-indexing.mjs` asserts the outcome; **add any new collection to both.**
- **Never write `innerHTML` in the terminal files** — the controller builds every line with `createElement` + `textContent`. A shell echoes visitor-typed text, and `audit-security.mjs` fails the build on the bare token anyway.

- **`worker/` is the free chatbot** behind `ask` — Qwen3 30B A3B on Cloudflare Workers AI, which is an *ambient binding with no API key*, which is why it can live here. Not shipped (Pages uploads only `dist/`) but it **is** in `audit-security.mjs`'s scan roots. It is **live** at `https://khchao-ask.khchao.workers.dev`, wired into `askEndpoint` in `src/data/site.ts` and `connect-src` in `BaseHead.astro` (both are needed — the CSP is `PROD`-gated, so a missing `connect-src` entry only breaks after a build). Blank `askEndpoint` and the shell falls back to its offline brain, which is also the automatic fallback on any endpoint failure, so `ask` never dead-ends. `worker/` changes need `npx wrangler deploy` to take effect.

  **`modelDownUntil` in `src/scripts/terminal.ts`** is a module-scoped breaker, and the two failures mean different things: `503` (Neurons exhausted) latches for the session, `429` (throttled) only buys a 60 s cooldown matching the limiter's period. Module scope, not closure scope, so it survives the remount on every view transition — verified across a real client-side navigation, not `open` (which does a hard `location.assign` and legitimately resets it).

  Two things about this Worker are easy to get wrong and were both wrong once. **The rate limiter must use the GA `[[ratelimits]]` block**; the pre-GA `[[unsafe.bindings]]` form deploys as `Unsafe Metadata` and silently does nothing — check the `wrangler deploy` binding line reads `(12 requests/60s) — Rate Limit`. And **the system prompt's scope rule has to lead and name its own refusal sentence**: as the last of four bullets the model ignored it and cheerfully answered "what is the capital of France?".

### The deep-dive curriculum

**The migration is complete.** Every page under `/deep_dives/` is a content-collection
entry rendered by `src/content/deepDives/<slug>.mdx` +
`src/pages/deep_dives/[...slug].astro` + `src/layouts/DeepDiveLesson.astro`. There are no
hand-authored `.astro` lessons left, and `src/lib/deepDives.test.ts` fails if one
reappears alongside an entry of the same slug.

Five tracks, each with a hub carrying `isHub: true`:

| hub | pages | `track` | owns |
| --- | --- | --- | --- |
| `statistical-genetics` | 22 | `theory` | definitions, assumptions, derivations |
| `gwas` | 10 | `workflow` | commands, thresholds, diagnostics, failure modes |
| `genomic-data` | 13 | `resource` | the resource ecosystem and its access rules |
| `ml-dl-interview` | 24 | `workflow` / `elective` | 351 interview questions |
| `single-cell` | 18 | `theory` | the count model up through the analysis pipeline |

**The single-cell track is complete** — hub plus 17 lessons in five modules (`s00-hub`,
`s01-counts`, `s02-matrix`, `s03-geometry`, `s04-meaning`, `s05-beyond`), with eight `sc-`
widgets: `sc-dropout`, `sc-normalize`, `sc-knn-graph`, `sc-resolution`, `sc-embedding`,
`sc-marker-contrast`, `sc-pseudobulk`, `sc-composition`.

Its spine is the design effect `1 + (m-1)ρ`: cells from one donor are not replicates of that
donor, so a per-cell test's false-positive rate *rises* with the number of cells (70.0% at 500
cells per donor, ρ = 0.05) and effective sample size saturates at `n/ρ`. That is the same shape
as the GWAS control ceiling, and the hub is built on it. **The track then reaches the same
quantity twice more by unrelated routes** — from composition, where a Dirichlet-multinomial has
`ρ = 1/(1+α₀)` so `α₀ = 19` reproduces `ρ = 0.05` and DE 25.95 exactly (lesson 13), and from
geometry, where spatial neighbour correlation inflates a mean's variance by `(1+ρ)/(1-ρ)`
(lesson 17). Lesson 17 closes on that symmetry deliberately; changing any of the three numbers
breaks the other two.

A second thread runs through Module 3: a rare population fails to survive dimensionality
reduction (its eigenvalue is small because variance averages over all cells, lesson 7), graph
construction (`k` is an absolute count so one value cannot serve populations of different
sizes, lesson 8), and clustering (modularity's null term is quadratic in community size, so
merging small communities is profitable — lesson 9 shows a ring of 40 complete K₅ cliques where
the *correct* partition scores 389/440 and the pairwise-merged one scores 199/220). Three
unrelated mechanisms, none with a software fix.

**The hub shipped first here, not last.** `isHub` derives the module map from siblings, so a
hub works with one sibling and fills in as lessons land — and shipping it first keeps
`audit:links` green on every intermediate push, because each lesson's back-link targets it.

**The statistical-genetics track is being deepened**, having been built to the contract floor
and never revisited: every one of its original 16 lessons carried exactly 2 figures and exactly
3 exercises, and 10 of the 16 had no interactive panel. Five lessons are being inserted for
concepts absent from the whole curriculum, and `order` already has gaps at 2, 5, 6, 10 and 18
reserved for them. What matters when inserting is **not contiguity** — `deepDives.test.ts`
requires each hub's reading order to be monotonic and duplicate-free, and `orderLessons` sorts
`moduleId` before `order`, so the thing that breaks the pager is one module's range
*interleaving* with the next, which gaps inside a module do not cause.

**`figlib.splice(mdx_path, index, svg_text)` writes a generated figure into its lesson.** The
first hundred figures in this curriculum were pasted by hand, which is exactly how a caption
comes to describe a drawing that has since been regenerated. It inserts on the first run (when
the `<Figure>` block is still empty) and replaces thereafter, and returns False rather than
raising when the MDX does not exist yet, so a generator can run before its lesson is written.

**`verifiedBy` must be a repo-root-relative path**, `src/lib/deepDiveExamples.test.ts`, not the
bare filename — the contract calls `existsSync` on it. 83 lessons use the full form.

**The `theory`/`workflow` split is load-bearing, not decorative.** The GWAS track used to
re-derive Wakefield's ABF, the LDSC proof, PRS shrinkage, EIGENSTRAT and the 5 × 10⁻⁸
threshold — all of which the statgen track owns. It now defers every derivation by
cross-link and owns the practice instead. **A workflow lesson that re-derives is a bug**;
so is a theory lesson that prescribes a threshold.

**Renaming a slug kills its URL.** Eight GWAS lessons were renamed to say what they now
cover, and each needed an entry in `astro.config.mjs`'s `redirects` block (not
`src/legacy-redirects.mjs`, which is generated for the Jekyll-era pages) in the same
commit. `audit:links` will not catch a URL that simply stopped existing.

Frontmatter must not set `readingTime` — it is derived by `lessonReadingTime` from the
body. (Storing it is what let every lesson claim ~2.5x its real length.)

Things specific to this subsystem:

- **`lessonReadingTime` is not `words / 200`.** These lessons are ~40 % mathematics, and
  the naive count fails both ways at once: it prices a rendered formula at zero while
  counting `\frac{V_A}{V_P}` as three words. Prose, display math, inline math and code
  lines are counted and priced separately in `src/lib/deepDives.ts`.
- **Deleting or renaming a collection entry needs the content cache cleared** —
  `rm node_modules/.astro/data-store.json`. Not `.astro/`, which is the generated types.
  Astro keeps rendering the removed entry until that file goes, and the failure is an
  opaque `UnknownContentCollectionError` naming a file that no longer exists.
- **The `dd-*` styles live in `src/styles/deepDive.css`, not in component `<style>`
  blocks.** Astro scopes a component's styles to its own elements and slotted children
  carry the *parent's* scope, so `.dd-callout__body p` written inside `Callout.astro`
  would silently never match the paragraphs an MDX file slots into it.
- **`.deep-dive-article h2` is more specific than a single class** (0,1,1 vs 0,1,0) and
  carries a section rule plus 2.5rem of space. Any `<h2>` the layout emits inside the
  article — the objectives heading, References — has to out-specify it or it grows a
  stray divider.
- **`.deep-dive-toc-list` is a two-column grid** built for the flat hand-written lists.
  The generated TOC uses `.dd-toc__list` instead, because a nested list inside a
  two-column grid puts the child in the next column rather than under its parent.
- **`src/lib/deepDiveMath.ts` is the only place the curriculum's mathematics is written.**
  Three consumers share it — the worked-example tests, the interactive widgets, and the
  figure captions via those tests — so a slider cannot contradict the prose beside it.
  `deepDiveMath.test.ts` proves the module against closed forms and round-trip identities;
  `deepDiveExamples.test.ts` then ties its output to the published text. Both layers are
  needed: a test that only compared module to prose would prove they agree, not that either
  is right.
- **Figure generation stays in Python** (`scripts/figures/figlib.py`) because no TypeScript
  script runner is installed. The two languages are kept honest by one rule: **every numeric
  value a figure draws as a label must also be asserted in that lesson's test file.** The
  Python generator writes the label into the MDX; the TypeScript test recomputes it and
  asserts the MDX contains it.
- **Four conventions the series must not disagree with itself about**, each of which it
  did before, and all four now enforced by a `curriculum consistency` block in
  `deepDiveContract.test.ts`:
  - **Wakefield's ABF is written `BF₀₁`** (null over alternative) with explicit `π₀`
    normalisation in the PIP. The `BF₁₀` form is its exact reciprocal; using both without
    saying so is how two lessons ended up appearing to contradict each other.
  - **Power is parameterised by `q²`, the variance explained.** `N ≥ 39.60/q²` and
    `N ≥ 19.80/(p(1−p)β²)` are the *same* result — verified identical — but one notation
    per curriculum.
  - **Ancestry PCs: state the number and the reason.** The series has quoted 10, "10–20"
    and 20 in three places.
  - **λ_GC divides by `0.454936…`**, the exact median of χ²₁, never a rounding of it.
    One page used 0.455 beside seven that did not.

  Those checks scan the **prose**, with inline `<svg>` stripped first. Both regexes were
  false-positive machines before that: `0.45` matched a haplotype frequency, and `39.6`
  matched the SVG path command `L339.6`.
- **The genomic-data track keeps its resources in a registry**, not in prose.
  `src/content/deepDiveDatasets/datasets.yaml` defines each resource once — version, scale,
  URL and **`access`** (open / registered / controlled / licensed, the fact that decides
  whether a reader can use it at all) — and pages render it through `<Dataset>` and
  `<DatasetTable>`. Version numbers written into twelve pages disagree with themselves
  within a release cycle; this repo has already shipped that failure twice.
  `npm run audit:datasets` checks ids resolve, URLs are live, nothing is orphaned, and the
  `verified` dates are fresh. A 403 or 429 is a warning — institutional sites block bots
  exactly as Crossref throttles.
- **`moduleId` groups a track's pages; `order` positions them across the whole track — and the
  two must agree.** `orderLessons` sorts on `moduleId` first, so if one module holds orders
  4, 5, 8 while the next holds 6, 7, the prev/next pager walks 5 → 8 → 6 and "next" goes
  backwards. `deepDives.test.ts` catches it, and the genomic-data track shipped that bug once:
  orders had been assigned in writing order rather than by layer. Its six layers are now
  contiguous — 1 reference, 2 population, 3 constraint, 4–8 function/assays/trait maps,
  9–10 clinical curation, 11–12 benchmarks — and `moduleLabel` names the layer so the hub's
  derived module map reads as the six-layer taxonomy the hub teaches.
- **Every new lesson must be listed in `DEEP_DIVE_ORDER`** (`src/data/deepDives.ts`), which is
  the one catalog fact the collection cannot supply. A missing entry fails the suite rather
  than silently dropping the card.
- **A lone backslash in a quoted assertion is not what it looks like.** In a JS single-quoted
  string `'\;'` is `;`, and in a JSX prop the same collapse happens — so `symbol: 'p_1,\; p_2'`
  renders as `p_1,; p_2` and `toContain('[5.49,\; 19.68]')` searches for text no lesson
  contains. Worse, a mangled search string can *pass* where the mangled text happens to occur,
  testing nothing. Two guards exist because this cost four separate fixes: the contract's
  `escapes LaTeX backslashes inside JSX notation strings` for MDX, and a self-check in
  `deepDiveExamples.test.ts` requiring every backslash run inside a `toContain('…')` to be
  even, except where it escapes the closing quote.
- **Two `<Citation>` markers with nothing between them cannot wrap.** `/><Citation` puts two
  inline links adjacent with no break opportunity, so the pair renders as one unbreakable run
  of roughly 280px and overflows the document at 320px. It only *fails* when the pair happens
  to land near the end of a line, which is why it survives review: the identical construct sits
  harmlessly in most lessons and blew up in exactly one. Write a newline between them — it
  becomes a space, and a space is a break opportunity. `audit:deep-dives` catches it as
  "document overflows by Npx at 320px", and the culprit is found by loading the page at 320
  and listing elements whose `right` exceeds the viewport *and* which no ancestor clips.
  **20 occurrences existed repo-wide when this was found**; the six in the single-cell track
  were fixed and the rest were left, so the next 320px overflow is probably this again.

- **A number is written twice in a lesson and only one form is the one you assert.** The same
  value appears as `86.5\%` inside `$…$` and as `86.5%` in prose, and `toContain` sees only
  the literal. Roughly twenty assertion failures across the single-cell build were this and
  nothing else — the value was right, the form was wrong. Grep the lesson for the number
  before writing the assertion rather than guessing which side of a `$` it landed on. Two
  further wrinkles: a bare `34.6` or `25.5` also matches **SVG path data**, so anchor such
  assertions to their LaTeX context (`'= 34.6$'`); and a value the figure draws is a *third*
  form again, unescaped, inside the inline `<svg>`.

- **`figlib.text` with `fill='var(--color-bg, …)'` is invisible on a short bar.** Labelling
  inside a bar reads fine while the bar is long and vanishes the moment the bar is near zero —
  which is exactly the row a bar chart of retention rates is drawn to show. Put the annotation
  in the row label, never inside the geometry, and never in the page background colour. Same
  family as the `fill="None"` trap, and equally invisible to every automated check.

- **`isHub: true` makes a collection entry its track's landing page**: the back-link goes to
  `/deep_dives/` instead of to itself, and the page ends with a module map derived from its
  siblings rather than a prev/next pager. That is the "hub as a real syllabus" mechanism,
  available to the statistical-genetics and GWAS hubs when they migrate.
- **The `/deep_dives/` index derives its cards from the collection** via
  `deepDiveEntriesFromCollection`. `src/data/deepDives.ts` now holds only entries with no
  content file, so a migration *deletes* a catalog entry rather than editing a second copy
  of the same facts. That duplication had already put wrong reading times and a wrong level
  on the live index. Two follow-ons: a lesson declares its own
  `keyEquations` in frontmatter, because the catalog entry was the only place the index
  card's formula chips lived and migrating a lesson silently dropped them; and display
  order — the one catalog fact the collection genuinely cannot supply — is an explicit
  `DEEP_DIVE_ORDER` list of ids, which `deepDives.test.ts` keeps complete.
- **`npm run audit:refs`** re-checks every DOI against Crossref — that it resolves, and
  that its year and first author match what the bibliography claims. A 429 is throttling,
  not a bad DOI, and is reported as a warning. Not part of `build`; it needs the network.

- **Interactive figures follow the same three-layer split as the games**, with
  `src/lib/deepDiveMath.ts` as the top layer: `src/components/deepdive/Widget.astro` is
  markup, `src/scripts/deepDiveWidgets.ts` is DOM and SVG, and **every number a widget
  shows or draws comes from the tested module** — which is what stops a slider
  contradicting the prose beside it. Six kinds exist (`ld-decay`, `drift`, `power`,
  `selection`, `finemap`, `prs`); the contract test rejects any other. Things specific to
  it:
  - **`format` receives the value *after* `scale`, not the raw slider position.**
    `buildControls` calls `spec.format(spec.scale ? spec.scale(raw) : raw)`, so a log control
    written as `scale: v => 10**v, format: v => (10**v).toFixed(2)` squares the exponent and
    displays 10^(10^raw). Seven controls across six `sc-*` widgets shipped with this, and it is
    almost invisible: at a default of 2 the label reads `100.00` — a plausible number in the
    wrong place — and only `sc-pseudobulk`, whose default scaled to 200, blew up to 10^200 and
    overflowed the document by 1,678px. **`audit:deep-dives` cannot catch it**: it checks that
    moving a control *changes* a readout, never that the control's own label is right. The
    pre-existing widgets use `format: v => sci(v, 2)` and are correct; copy that, not the log
    form.

  - **The frame must not use `--color-figure-mat`.** That token is a deliberately *light*
    card for raster figures with baked-in dark line art. A widget draws in `currentColor`,
    so on the mat it is light-on-light in dark mode and the entire plot disappears.
    `.dd-widget__frame` is transparent, which puts the drawing on the same pairing as body
    text in either theme.
  - **Mounting binds on `astro:page-load` and is idempotent** via a `dataset.ddReady`
    flag. `ClientRouter` is active, so the module is evaluated once and a widget that
    bound only at module scope is dead after one navigation — while one that re-binds
    without the guard grows a second set of controls.
  - `.dd-widget*` styles live in `src/styles/deepDive.css`, not the component: the
    controller injects the controls and the SVG at runtime, so nothing it creates would
    carry a component scope hash.
- **`npm run audit:deep-dives`** (`scripts/audit-deep-dive-ui.mjs`) is the rendering gate
  for the curriculum: every statistical-genetics route across chromium and webkit at
  320/390/768/1440 in both themes, asserting no document overflow, no `.katex-error`, no
  empty `<svg>`, no literal `$…$` in the prose, every citation link resolving to an anchor
  that exists, and every widget mounting, drawing, printing without its controls,
  rebinding after a client-side navigation and **changing its readout when a control
  moves**. Its expected figure and widget counts are **derived from the MDX source**, not
  held in an inventory — unlike `audit:posts`, whose `inventory` must be edited by hand.
  `npm run audit:deep-dives:ci` is the chromium-only smoke form.

- **`effectiveSampleSize` is the GWAS track's spine, and the 16× is not a coincidence.**
  A case-control study's power runs on `4/(1/cases + 1/controls)`, a harmonic mean, so the
  derivative with respect to the smaller arm is far steeper. The same factor decides where
  the next samples go (lesson 1) and which member of a related pair to prune (lesson 3), and
  it generalises exactly to `(N_controls/N_cases)²` — verified at 4:1, 1:1 and 10:1. Most QC
  pipelines break related pairs by call rate, which optimises the wrong quantity.

- **Three standalone catalog entries are `coming-soon` placeholders** — `dna-foundation-models`,
  `splice-neural-mechanisms`, `wheeler-pangenome-graphs`. They have no page and no content
  file, only a card in `DEEP_DIVES`.

- **An adversarial multi-agent audit found nine real defects that 2,076 passing tests
  missed**, and it is worth re-running after a track is finished rather than trusting the
  suite. Two of the nine the tests actively *agreed with*, because prose and assertion were
  written together and were wrong the same way — Cochran's Q read on 1 df instead of 3, with
  a hardcoded `regularizedGammaP(0.5, …)` confirming it. A third was introduced by a fix-up
  commit while adding a cross-link. **A test asserting a value is not evidence the value is
  right**; recompute from the definition. A third of the findings did not survive
  verification, so verify each one by hand before acting on it.

- **The four places a wrong number hides from the test suite** — an abstract, an exercise
  solution, a figure caption, and a table cell. All four defects the close-out audit found
  were in one of them, because `deepDiveExamples.test.ts` asserts the *worked example* body
  and stops there. The abstract is the worst of the four: it renders as the page's lead
  paragraph *and* as the citation abstract, and one claimed a ratio of 490 where the body
  two screens below derived 106.6.

- **A caption drifts from the figure it wraps**, because the caption is edited by hand and
  the drawing is regenerated by a script. `deepDiveContract.test.ts` now rejects a
  comma-formatted number in a caption or alt text that the SVG does not draw and the lesson
  never states elsewhere. Two legitimate cases are allowlisted: alt text describing an axis
  *domain*, whose endpoints carry no tick label.

- **Three deterministic close-out checks the test suite does not perform**, each of which
  found something the 2,989 tests did not. (a) **Every `lesson N` cross-reference resolves, and
  its target actually contains the claimed result** — the second half is what `audit:links`
  cannot see. (b) **Every number in an `abstract:` also appears in the body**, since the body is
  asserted and the abstract is not; this caught `sc-pca` still saying "a factor of 5.2" after
  the body had been corrected to 5.19, an incomplete fix of exactly the kind described below.
  (c) **Re-derive the track's headline theorems with an independent implementation**, not by
  re-running the module. Both false positives that came out of these were line-wrapping in the
  search string and a float bug in the harness (`i < 0.3 * 40000` admits one extra element),
  so verify every hit by hand before acting — and prefer `Fraction` over floats when the claim
  is that two quantities are *exactly* equal.

- **A `referenceIds` entry that is never cited fails the contract**, and it is the easy half of
  the both-ways rule to forget: `statgen-within-family` listed four references it did not cite.
  Decide per reference whether to cite it in the body or drop it from the list — do not leave it
  listed on the grounds that it is relevant.

- **A hand-computed constant carried into prose from a rounded intermediate will be wrong in the
  last digit.** Three values in `statgen-within-family` were computed from a rounded ρ_A and
  disagreed with the module in the sixth decimal (0.387299 against 0.387298, 1.15320 against
  1.15318). Chasing them found the closed forms: at h₀² = ½ and μ = 0.4, `1 − ρ_A` is exactly
  `√0.6`, so the within-family fraction is exactly `√0.15`. **Recompute from the module, then
  look for the exact form** — the discrepancy is often pointing at one.

- **Check the bibliography key, not just the topic, before adding a reference.** `benjamini1995fdr`
  already existed for the GWAS track and got appended a second time; `references.yaml` has no
  uniqueness constraint and the duplicate only surfaced on a manual key count. Grep for the exact
  key first.

- **A `\n` inside a `toContain` is an odd backslash run** and the examples suite's self-check
  rejects it, correctly: an assertion that depends on where the prose happens to wrap is an
  assertion about the line-filling, not the content. Use `toMatch(/… \s+ …/)`.

- **A derivation that will not close can be the lesson's best material.** `statgen-detecting-selection`
  set out to compare a swept haplotype against the neutral expectation and could not: the
  pairwise coalescence time inside an allele class depends on the trajectory that produced the
  frequency, and simulation puts it at 0.786, 0.681 and 0.598 of `2Np` at p = 0.2, 0.5 and 0.8
  — a frequency-dependent fraction with no closed form. That failure **is** why iHS contrasts
  the derived against the ancestral haplotype at one locus instead of using an absolute
  threshold, so the lesson publishes the floor (`1/(8N)` Morgans at p = ½, exact, the ln 2
  cancelling) and says plainly that the expectation itself has no clean form. Publish the bound
  you can prove and name the gap; do not quietly publish a constant you measured once.

- **Sampling an allele at its first passage to frequency p is not sampling an allele at
  frequency p.** First-passage selects the youngest trajectories and biased the measured
  coalescence time low by more than a factor of two (0.40 × 2Np against 0.68 × 2Np). Draw from
  a stationary population instead. The control that catches it is to measure allele *age* the
  same way and check it against Kimura–Ohta.

- **Two correlated test statistics do not compare like independent ones**, and the difference
  is large in the direction that matters. Asked how often a neighbouring gene outranks the
  causal one in a TWAS, the independent calculation gives 0.2225 and the correct one — which
  uses `Var(z_A − z_B) = 2 − 2r` rather than 2 — gives **0.0137**, sixteen times smaller. The
  same correlation that drags an innocent gene over the threshold is what stops it outranking
  the causal gene, so the failure mode is *too many genes reported*, not *the wrong gene first*.

- **An LDSC intercept above 1 is an upper bound on confounding, not a measurement of it.**
  The regression runs against LD scores *estimated* from a reference panel, so measurement error
  attenuates the slope by the reliability λ and the intercept absorbs `b(1-λ)E[ℓ]` — with no
  confounding present at all. At the curriculum's own worked numbers (b = 0.025, mean LD score
  80) a reliability of **0.975 produces an intercept of exactly 1.05**, the whole of the excess
  the lesson had read as stratification. Four passages asserted the intercept *was* the
  confounding and all four had to move together, plus the test that asserted the old wording.
  The same measurement error is amplified by the mean LD score into the intercept and only by λ
  into h², which is why LDSC heritabilities are quoted freely and intercepts are diagnostics.

- **A greedy `re.S` replace across a 9,000-line file will silently delete hundreds of lines.**
  A pattern meant to fix one assertion matched from an earlier identical fragment to a later
  one and removed ~850 lines and several whole describe blocks; the suite still passed, because
  what was deleted was tests. Recovered with `git checkout`. **Use a literal `str.replace` with
  an anchor unique enough to assert on, and never a `.*?` spanning more than a few lines.**

- **`audit:deep-dives` drives the FIRST control to whichever endpoint is further from its
  current value**, so a widget whose first slider is symmetric about its default fails the
  "readout did not change" check. `burden-skat` opens at zero sign-flips and the gate pushed it
  to five, where the burden statistic *recovers to the same value* — the panel's whole point.
  The fix was to publish the **signed** weighted sum alongside its square, which distinguishes
  the endpoints and makes the recovery legible. A widget that fails this check may be telling
  you the readout is incomplete rather than the control is broken.

- **A widget's default state must reproduce the lesson's worked example**, or the slider
  disagrees with the prose beside it — the one thing the three-layer split exists to prevent.
  The MR panel first assigned pleiotropy to the *weakest* instruments, which was a defensible
  choice and gave 0.3504 where the worked example says 0.365058. Ordering the lesson's own
  three first makes the default reproduce all three estimators to six decimals. **Check the
  default against the published table before anything else.**

- **`ls | grep` is not a check unless you read the output.** A new figure generator was written
  with `cat >` over `statgen-mendelian-randomization.py`, which already existed and produced
  both of that lesson's figures — the `ls` immediately before it had printed the filename.
  Recovered with `git checkout`. Append to an existing generator; never `cat >` one.

- **`figlib.splice` indexes `<Figure>` blocks in DOCUMENT order, not by figure number**, and
  inserting a new figure ahead of an existing one silently renumbers everything after it. A new
  block placed before the multiplicity figure in `statgen-mathematical-foundations` landed at
  index 1, so `splice(MDX, 2, …)` overwrote the multiplicity figure's SVG with the new drawing
  and left the new block empty. **Count the blocks after inserting, before choosing the index** —
  and when a figure is inserted mid-document, renumber every later caption and every prose
  reference to them in the same commit.

- **Adding lessons to a track leaves them orphaned unless you wire them in, and no gate says
  so.** After five new statgen lessons every gate was green while the only inbound
  `relatedLessons` links came from other new lessons — a reader working the original track
  would never learn the new material existed. The hub was worse: the commit that opened the
  slots promised each module's description would be updated as its lesson landed, and
  `git show` confirmed the hub was touched by none of them. **A lesson is not integrated when
  it renders; it is integrated when something already in the track points at it.**

- **An adversarial re-derivation of a finished track found three MAJOR defects that 3,149
  passing tests and every rendering gate had passed over**, and all three were of one kind: a
  *claim about* correct numbers rather than a wrong number. (a) A gain table produced with
  Storey's *estimated* π̂₀ was described five times as "twice as permissive at every point" —
  π̂₀ is 0.5886 at low power, so the level was 0.0849, not 0.10. (b) `1/(1−F_ST)` was called a
  pooled-sample ratio; under Hudson's estimator it is the *between-population* ratio, and the
  two conventions differ by 1.83× on the lesson's own example. (c) A drift step of 0.003536
  was printed as "0.0035%", off by 100×, while the same lesson's exercise gave it correctly.
  **The test suite cannot see any of these**, because each number it asserts is right; what is
  wrong is the sentence around it. Re-derive the *interpretation*, not just the value.

- **Numbers computed by a script that estimates a nuisance parameter are not numbers computed
  with that parameter known.** The Storey table's own generator called `pi0hat(p)` and the
  prose then described a fixed `q/π₀`. If a simulation estimates something, the prose has to
  say so — and the counterfactual is usually the more interesting number (1.694 against 1.507).

- **A failing assertion is more often the assertion's fault than the code's.** Three times in
  one lesson the test expectation was the wrong thing and the module was right: Weir & Cockerham
  legitimately returns a *small negative* F_ST at zero divergence (an estimator unbiased at zero
  must be able to), the BBP eigenvector overlap 20% past the transition is 0.2418 rather than the
  ">0.25" guessed for it, and an exercise answer read off a figure gave 0.2418 where the correct
  value was 0.275. **Recompute from the definition before changing code to satisfy a test.**

- **The BBP overlap is not a function of `λ/√γ` alone**, though the *threshold* is. Writing
  `u = λ/√γ` it is `(1 - 1/u²)/(1 + √γ/u)`: the first factor is universal, the second is not.
  So a phase-transition figure drawn at one aspect ratio cannot be read off for another — which
  is how an exercise answer came out 0.2418 instead of 0.275. Name the γ in the caption.

- **`nohup cmd &` inside a backgrounded Bash call reports exit 0 immediately** and the real work
  dies with the shell. The task notification then says "completed (exit code 0)" for a gate that
  ran 32 of ~500 lines. This is the truncated-pass trap wearing a new hat: pass the command
  directly to `run_in_background` rather than backgrounding inside it, and **always confirm the
  verdict line** — `grep -c 'audit passed'` — rather than trusting an exit code.

- **Crossref dates a volume that straddles years by its `issued` field**, so Wright's 1951
  *Annals of Eugenics* F-statistics paper comes back as 1949. `verify-references.mjs` treats a
  gap of one as a warning and **a gap of two as a hard error**, so that entry cannot be recorded
  by its conventional year. Check the year before writing the citation, not after.

- **A guard that only asserts the new wording cannot catch an incomplete fix.** Removing a
  claim from one passage and leaving it standing in the summary is the commonest way a
  correction goes wrong — it produced four of the six defects one audit pass found, including
  a lesson that asserted a thing in an exercise and its negation fifty-five lines below. The
  test file had 111 `.toContain` assertions against 11 `.not.toContain`, and only the latter
  scan the whole lesson. **Every prose fix needs `.not.toContain(<the old claim>)`**, not just
  `.toContain(<the replacement>)`. Then grep the lesson for the claim before committing.

- **A bar chart truncated at a non-zero baseline lies in the one channel a bar is read by.**
  The relatedness figure drew surviving effective size from a 30,800 baseline, so its bars ran
  216.8 px against 32.0 px — a 6.8:1 picture of a 1.03:1 difference. It was also the only
  non-zero baseline among the repo's bar figures. Plot the *difference* from zero when the
  difference is the point: the same figure replotted as loss-per-arm reads 16:1, which is the
  number the caption was already claiming.

- **"Derived in [X]" is a claim about X, and nothing checks it.** The GWAS track's most
  load-bearing formula, `N ≥ 39.60/q²`, deferred to `statgen-mathematical-foundations`, which
  contains no power derivation at all — the constant lives in
  `statgen-association-linear-mixed-models`. `audit:links` cannot catch this: the URL resolved
  fine, it just did not contain the thing it was cited for. Assert the target contains the
  token whenever a lesson defers a specific result.

- **A point on a curve is not the mean of the group beyond it.** For a convex risk curve the
  gap is large and always in the same direction: a polygenic score's 99th centile reads
  8.2357%, while the *top 1% as a group* averages 10.21% — 24% higher — and the ratio between
  extreme centiles goes from 50.2 to 86.1. Prose saying "people in the top 1%" needs the group
  mean; the curve and its markers are point values and should say so. There is a check that
  needs no integration: the top centile holds 5.11% of all cases, and 0.0511·K/0.01 recovers
  the mean exactly.

- **A caption that states an encoding rule is a claim about the drawing.** The forest plot
  promised box *area* proportional to the inverse-variance weight while the generator set the
  *side* affine in it — so area went as the square, and the smallest study drew at 13% of the
  largest box where its weight was 14%. If a caption tells the reader how to decode a figure,
  a test has to decode it the same way.

- **A bare `<` in SVG text content is invalid XML** and renders anyway: browsers parse inline
  SVG with the lenient HTML parser, so `r_g < 1.` survived every rendering audit and only
  `rsvg-convert` refused it. Write `&lt;`. Guarded alongside the brace check.

- **Never display a rounded constant beside a result computed from the unrounded one.**
  `39.60/1.05e-3` is 37,714.29; the lesson printed 37,716, which comes from 39.600989. Same
  class as `0.95/0.4`, which is exactly 2.375 but evaluates to 2.3749999999999996 in floating
  point, so `.toFixed(2)` printed 2.37 where the arithmetic says 2.38 — and no epsilon
  comparison catches that, because `2.375 - 2.37` is `0.004999999999999893`. Round in integer
  space and compare the printed string.

- **`figlib.sub` is subscripts only, and silently no-ops on a superscript.** It rewrites
  `V_A`, so it needs the underscore: `sub('4')` returns `'4'` unchanged, and `'10' + sub('4')`
  drew a log axis reading "104 105 106" — three integers where three powers were meant. The
  curriculum writes superscripts as Unicode (`10⁴`, `h²`, `χ²`); there is no `sup` helper.

- **`figlib.text` coerces a falsy `fill` back to `currentColor`.** A conditional expression
  yielding `None` emits `fill="None"`, which browsers read as `fill="none"` — invisible text
  that renders clean, validates clean, and no audit can see.

- **Dense figure annotation goes in a right-hand margin column**, never inside the plot area,
  where it collides with the data at some viewport or theme.

- **Braces in an inline `<svg>` break the MDX build.** A generator writing a set as
  `{v3, v4, v5}` splices a JSX expression into the page and the build fails with
  `ReferenceError: v3 is not defined`, pointing at a compiled chunk rather than the figure.
  `deepDiveContract.test.ts` guards it, checking *text content* only — braces inside a tag are
  JSX attribute bindings and are deliberate.

- **A wide table crushes rather than scrolls.** `article table` in `global.css` sets
  `overflow-x: auto`, but that only fires once content exceeds the container, and a table of
  prose cells will break "Mathematical Foundations" into four fragments to avoid overflowing.
  `.dd-scroll-x` in `deepDive.css` sets a `min-width` just under the article column — wide
  enough to force a scrollbar at narrow viewports, narrow enough that desktop sees the whole
  table. Overshoot it and every reader scrolls.

- **An unmounted widget is untested code.** Each of the four mounted late in this track had a
  defect that no test caught, because nothing rendered it. `audit:deep-dives` drives every
  widget's controls; a widget that exists but is never placed in a lesson is outside it.

- **`colocPosteriors` takes BF₁₀ while `wakefieldAbf` returns BF₀₁** — opposite directions,
  and feeding one straight into the other does not throw. It returns PP0 ≈ 1 at a locus with
  a genome-wide signal in both traits.

- **`referenceSurname` absorbs name particles** (`van der Maaten` → "van der Maaten", not
  "Maaten"), and a compound surname without a particle carries an explicit `surname` in
  `references.yaml` — "George Davey Smith" is "Davey Smith". Both `Citation.astro` and
  `DeepDiveLesson.astro` read `surname ?? referenceSurname(authors[0])`.

- **`Citation` throws on an unknown key** rather than rendering an empty marker. That is
  deliberate: twelve icon names rendered as empty `<svg>` for months precisely because
  `Icon.astro` failed quietly, and `src/lib/icons.test.ts` now guards that class of bug.

### The chromatin playground (`/chromatin/`)

A full-screen WebGL model of chromosome packaging, from the B-form duplex to a metaphase
chromosome. Same three-layer split as the games and the deep-dive widgets:

| file | role | Three.js? |
| --- | --- | --- |
| `src/lib/chromatinModel.ts` | **pure** — dimensions, parametric paths, scrubber mapping, LOD, compaction | no |
| `src/lib/chromatinModel.test.ts` | 73 tests against closed forms and the structural literature | no |
| `src/scripts/chromatin.ts` | scene, instancing, camera, annotations | yes |
| `src/scripts/chromatin.test.ts` | the index arithmetic in `tubesGeometry` | no (three, but no GL) |
| `src/pages/chromatin.astro` | `bare` page: canvas, scrubber, toggles, legend | no |

**`three` is the repo's first runtime dependency.** It has no dependencies of its own, and Astro
code-splits per page, so only `/chromatin/` pays: 548 KB raw / 139 KB gzipped, in one chunk that
one HTML file references. No other route's payload changed. No CDN — the CSP in `BaseHead.astro`
is `script-src 'self' 'unsafe-inline' data:`.

**The whole hierarchy is drawn at true nanometre scale, all of it at the origin, and the camera
pulls back logarithmically.** Nothing is swapped for a stand-in: a nucleosome really is 11 nm
inside a 260 nm string inside a 620 nm fibre inside a 2.4 µm loop domain, so zooming out reveals
each in turn because it is genuinely nested. That is what makes the transitions seamless with no
scene-swapping machinery — there is no scene to swap. Cross-fades come from `regimeWeights`,
which sums to 1 everywhere and is asserted never to step across a 4,000-sample sweep.

Things specific to it, most of which were bugs first:

- **Camera keys are the band *centres*, not the band starts.** `cameraFieldNm` interpolates
  between keyframes; keying off `from` means the field is already halfway to the next regime by
  the middle of every band, and no regime is ever seen at its own declared size except in the
  instant its band begins. That framed an 11 nm nucleosome in a 94 nm field **at the nucleosome
  milestone**. The centres are also what `milestones()` snaps to, so clicking a milestone now
  frames the thing it names.
- **Compaction divides by `packagedNm`, never by the field of view.** Dividing by the field
  makes the headline number an artefact of camera distance: the metaphase scene draws the whole
  of chromosome 1 and read "1,700×" against a 12 µm frame where the chromatid it was drawing is
  10 µm and 8,465×. Each regime declares the end-to-end length of the structure holding its
  `bpInView`, and a test pins all six against the literature (1×, ~6×, ~6–7×, ~40×, a few
  hundred, ~8,500×).
- **`nucleosomeBudget` is bounded from *both* directions.** The instance cap is the obvious one.
  The one that is easy to forget is `impliedNucleosomeCount`: drawing more nucleosomes than the
  sequence in view contains is not a performance question, it is a false statement about the
  scene, and the readout said "4,000 of 1,310" before the bound existed.
- **The telemetry reports what each node actually draws**, via `nucleosomeCount()`, not what the
  model budgets. The two can disagree and only one of them is on screen. Those counts are then
  **weighted by regime weight** before summing: across a cross-fade two representations are
  alive at partial opacity, and summing raw counts double-counts them — the beads/fibre seam
  reported "91 of 63", more nucleosomes than the sequence in view contains.
- **An `InstancedMesh` must recentre on the count it is *drawing*, not the count it allocated.**
  Framing 430 nucleosomes while showing 160 pushed the whole fibre to the bottom of the viewport.
- **`setColorAt` MULTIPLIES into the material colour.** Any mesh using per-instance colour needs
  a white material, or the ramp collapses to one muddy hue — a blue→violet sequence ramp over a
  pink material rendered as flat purple everywhere.
- **A permanently semi-transparent material must record `userData.baseOpacity`.** The frame loop
  multiplies regime weight into `opacity`, so an unrecorded 0.22 is overwritten to 1 and the
  ChromEMT envelope — meant to be a haze over the nucleosomes it contains — renders as a wall.
- **Annotation anchors are in the node's LOCAL space**; the controller adds `group.position` when
  projecting. Four of the six builders originally subtracted the group offset *as well*, which
  put every label off-screen. They also need standing off the structure by ~0.3–0.45 × the
  regime's own `fieldNm`, or they all project into the middle of the screen and bury the thing
  they describe.
- **`tubesGeometry`'s per-path vertex offset is `vo / 3`, not `vo / 3 / radial`.** `vo` counts
  floats. Dividing by the radial count a second time makes every path after the first index back
  into the first path's vertices — the metaphase array rendered only its bottom quarter, silently,
  because a wrong index does not throw, it draws the wrong triangles. `chromatin.test.ts` now
  asserts every triangle lies wholly inside its own path's vertex range.
- **Reading a control *after* calling something that reports state clobbers the read.** The
  scrubber's `input` handler called `setPlaying(false)` first, which calls `report()`, which
  writes the controller's current scrub back into that same input — so the handler then read the
  old value. Chrome hid it because a pointerdown focuses a range input and the focus guard skips
  the write; **Safari does not always focus one**, so it would have surfaced there. Read the DOM
  value into a local before doing anything else.
- **`audit:security` matches the bare markup-assignment token even inside a comment.** Two
  comments *explaining that the token must never be used* failed the build.

The science the model refuses to smooth over, each with a test:

- **147 bp is 49.98 nm of duplex; an ideal helix at the published radius (4.18 nm) and pitch
  (2.39 nm) holds only 43.51 nm over 1.65 turns.** The 14.9% gap is real — nucleosomal DNA is
  kinked at the histone contacts — and the radius that *would* reconcile them is 4.806 nm, which
  is not the published value. `superhelixContourNm()` returns both.
- **The octamer radius is derived, not quoted**: the protein surface and the DNA's inner surface
  are in contact, so it is 4.18 − 1.0 = 3.18 nm, which agrees with the ~6.5 nm octamer diameter.
  Quoting 3.25 and drawing both pushes protein through DNA.
- **The wrap grows outward from the dyad**, because the (H3–H4)₂ tetramer binds the central
  ~60 bp before the dimers take the flanks — which the `dnaT` values in `HISTONE_SUBUNITS`
  independently encode, and a test ties the two together. It is also 4× the smoother animation:
  wrapping from one end leaves a 50 nm tail whose tip sweeps 5.2 nm per 1% of wrap.
- **H2A–H2B dimers explode as units**, not as four loose spheres. A dimer dissociates whole.
- **The mitotic geometry is forced by published numbers, not fitted.** Outer loops set the
  chromatid width (400 kb → half of 700 nm), and a 12 Mb helical turn must rise
  10,000 × 12/249 = 482 nm or the chromosome fails to reconstruct its own 10 µm length. Both are
  asserted. Early guesses were out by orders of magnitude (a 1.77 nm loop reach, a 294 nm rise).
- **Molecular colours are fixed across themes** — H3 is the same colour in light and dark, as it
  would be in a PyMOL figure. What adapts is the *lighting*, set from the measured luminance of
  `--color-bg`, because the site ships six themes and hardcoding two rigs leaves four wrong.

Verification beyond the test suite: `scripts/` has no gate for this page, so it was driven
directly in headless chromium — every regime screenshotted, `drawElements` patched to count
draw calls and triangles (1–5 calls, ≤81k triangles per frame), and 320/390/768/1440 × light/dark
checked for document overflow along with reduced motion and a client-side navigation round trip
(no leaked canvas, renderer restarts). Headless chromium rasterises in software, so its frame
rate is a floor and not a GPU figure.

### The Live Variant Playground (`/variant-playground/`)

Runs the **real Shorkie model** in the browser — the fungal sequence-to-function network from Chao
et al. 2025, fold f0, 14,253,567 parameters. Not a re-creation and not a heuristic: the released
Keras checkpoint, ported and exported, producing the same numbers the paper's model produces.

**Not at `/shorkie/`** — that path already serves the project documentation site on this domain
(`LIVE_SAME_ORIGIN_PREFIXES` in `audit-links.mjs`).

| file | role |
| --- | --- |
| `scripts/shorkie/` | offline conversion pipeline + its README; never runs in CI |
| `src/lib/shorkieModel.ts` | **pure** — architecture spec, encoding, the live conv-stem forward pass |
| `src/lib/shorkieModel.test.ts` | spec conformance + parity against the real model's stem |
| `src/scripts/variantPlayground.ts` | DOM, ONNX session, panels |
| `src/pages/variant-playground.astro` | `bare` page |
| `public/models/shorkie-fp16.onnx` | 28.6 MB, lazy-loaded on explicit click |
| `scripts/audit-playground-ui.mjs` | the rendering gate; `:ci` in CI, `:full` locally |
| `public/ort/` | the ONNX Runtime WASM binary, self-hosted so `connect-src` stays `'self'` |

- **Two inference paths, and the page says which is which.** The conv stem (11 × 4 × 96 = 4,224
  weights) runs in TypeScript on every keystroke — ~1 ms compute, ~6 ms with the draw, inside the
  frame budget. The full model runs through ONNX Runtime Web on an explicit click. **"60 FPS
  predictions" is not achievable and must not be claimed**: GitHub Pages cannot send COOP/COEP, so
  there is no SharedArrayBuffer, so no multi-threaded WASM. WebGPU where available, single-threaded
  WASM otherwise, and the readout names the backend that actually initialised rather than guessing
  from `navigator.gpu`.
- **The page is `bare`, so it needs its own scroll container.** `.main--bare` pins html/body to
  `position:fixed; inset:0; overflow:hidden` and caps `main` at one viewport, which is right for
  `/terminal/` (an inner pane owns the scrollback) and silently fatal here: the playground never built
  that pane, so everything below the fold was clipped and unreachable. `.vp-scroll` is now the pane —
  `flex:1 1 auto; min-height:0; overflow-y:auto` — with the title bar outside it.
- **A transformer layer's activation map is not its attention matrix**, and drawing the second in place
  of the first is what made 8 of the 20 stages look dead. `shorkie_torch.py` never wrote the residual
  stream into `acts`; it now emits `attn_out1..8` (`[1,384,128]`), the export concatenates every mapped
  stage into one `stage_maps [1,5760,128]`, and `stageMapOffsets()` is the single offset table. Attention
  survives as a second tab inside the layer detail, where it belongs.
- **Invalidating a result must invalidate every view of it, together.** `setMode` nulled `current`
  and re-rendered only the track panels, so switching locus left the flow canvas and the
  layer-detail canvas holding the previous gene's activations — measured, both were byte-identical
  before and after the switch (133,405 px and 216,341 px of ink) — under the new gene's name, while
  the panels below correctly went blank. That reads as "I ran it and got no output". `clearResults()`
  is now the single path, and a forward pass stamps `data-vp-result-locus` so the audit can assert
  no view survives a locus change.
- **A WebGPU pipeline that fails validation does not throw — it returns ZEROS, and onnxruntime
  reports the run as successful.** The page printed "Done — 1689 ms on WebGPU" beside four
  predicted peaks of 0.0000. The cause was a `Concat` with **18 inputs** (the unified `stage_maps`)
  needing 19 storage buffers against WebGPU's per-stage limit of **8**; the invalid pipeline
  poisoned everything downstream. A second node, the 8-way `torch.stack` over the attention maps,
  was also over. Both are now built as **binary trees**, max fan-in is 7, and `build_onnx.py`
  **fails the export** if any node exceeds the limit. Headless chromium has no WebGPU adapter,
  which is why five reproduction attempts all passed — reproduce with `--enable-unsafe-webgpu`.
  Fixed, WebGPU agrees with WASM to r ≥ 0.99989 over all 896 bins at **304 ms against 17,154 ms**.
- **Never report a run as successful without looking at its output.** `runFull` now checks the
  prediction is finite and not identically zero, and retries on WASM — releasing the WebGPU session
  first, or the retry runs on the backend that just failed. `ensureSession` used to catch only
  `create`, so a run-time failure had no fallback at all.
- **The precomputed packs live at `/vp-data/`, NOT `/shorkie/`.** With a custom apex domain on the
  user site, GitHub Pages serves every *project* repo at `khchao.com/<repo>/`, and those shadow
  anything this site deploys at the same path. The packs went to `public/shorkie/` first — the one
  path CLAUDE.md already warned about for this very page — and all 71 files 404'd in production
  while every local check passed, because a preview server has no such shadowing. The shadowed
  prefixes are `shorkie`, `splam`, `LiftOn`, `OpenSpliceAI`, `gffbase` (see `LIVE_SAME_ORIGIN_PREFIXES`
  in `audit-links.mjs`); `shorkieModel.test.ts` now fails if the pack path is any of them.
- **Everything is precomputed per locus, as PNG.** `make_activations.py` writes all 5,215 track
  predictions plus every layer's activations for each locus into `public/vp-data/` as uint8 PNGs
  with per-row scales in a sidecar JSON — 2–4 MB a locus, 56 MB total. PNG beats gzip on this data *and* the browser decodes
  it natively with `createImageBitmap`, so no JavaScript inflate ships. The page then needs **no
  model at all**: verified with `**/models/**` blocked, all 14 loci show every layer and all 5,215
  tracks, 0 model requests. Decoded-vs-live is ≤ 2.8e-3 across every locus and tensor.
- **Coverage is quantized in LOG space, activations in linear.** 256 levels spread linearly across a
  range spanning orders of magnitude wastes almost all of them on the top and leaves a visible
  staircase in the low values of a log plot: measured, the error a reader sees is **2.2e-1 of the
  axis linear against 1.96e-3 in log space**, 113×. Signed activations cannot use log and stay
  linear. The sidecar carries `space` per tensor so the decoder knows which.
- **The track picker is cascading, because 5,215 in one list is unusable.** The names carry the
  experiment: `ARG80_T0_S757` is regulator, timepoint, sample. Verified across all 5,215 — 3,037 of
  3,053 RNA-seq names parse as `TF_Tn_Sn` giving **335 regulators × 13 timepoints**, 1,128 ChIP names
  as `target_Sn`, all 1,014 strain tracks as ENA runs, and **36 match nothing and go to an `other`
  bucket rather than being dropped**. A regulator can hold several samples per timepoint — ARG80 has
  55 tracks over 8 — so options are labelled `T0 · S757`, or two read identically.
- **The predictions are precomputed and shipped; the model is loaded for something else.** Every
  preset locus was run offline at the full 16,384 bp context — 14 loci in 1.6 s — and
  `src/data/shorkiePredictions.json` (307 kB, 96 kB gz) carries the four assay-group curves plus the
  mean of the **384** T₀ baseline RNA-seq tracks. The output panels are therefore populated on load
  for every locus, and `Load model` buys live activations, sequence editing and motif knockouts, not
  a number that already exists. This is what stopped a missed or abandoned 17-second click leaving
  every output panel legitimately empty. Shipped-vs-live agrees to **3.86e-4**, the same fp16 gap as
  python↔browser. Per-stage activations stay live: they are ~40 MB per locus.
- **Paint every cell; do not skip the quiet ones.** Skipping below a floor turned the rasters into
  sparse marks on white — measured, U-Net stage 3 drew **7.6 %** of its cells and the transformer
  layers 41–49 %, so how much white a figure showed was a tuning constant rather than a property of
  the data. `paintActivationMap` now colours every cell on a blue → neutral → red ramp and blits it
  with `createImageData` + `drawImage`; every raster is 100 % painted with 600–1,700 distinct
  colours. Per-cell `fillRect` is not an option at 384 × 128 — that is 49,000 calls per redraw.
- **The neutral must be read off a real element.** `getPropertyValue('--vp-panel')` returns the
  literal `var(--color-surface, #fff)`, not a colour, and an unpainted ancestor computes to
  `rgba(0, 0, 0, 0)` — which parses as black and turned the whole raster near-black on a white page.
  Walk up until an ancestor's background alpha exceeds 0.5.
- **Deselecting a stage must fall back to the wavefront, not to the stem.** `renderStageDetail(null)`
  defaulted to the conv stem, so clicking the same stage twice silently showed a different stage's
  data under the title "Conv stem".
- **A neuron doing nothing must leave its cell empty.** The p1→p99 ramp put a ZERO activation at
  0.61 ink on `attn1` and 0.70 on `attn8`, so **90–96 % of cells on 15 of the 20 stages** drew above
  0.4: the raster encoded *sign*, not activity, and read as a flat wash. The residual stream is
  genuinely signed (50–66 % negative from block7 on), so `activationScale` picks a **diverging**
  scale centred at zero for those, saturating at the 99th percentile of |v| — not `max(|p1|,|p99|)`,
  which on attn8's −34.8…24.8 range would push everything positive below the floor. Non-negative
  early convolutions stay sequential. Transformer layers went from ~92 % washed to 43–50 % inked.
- **The output head needs a per-channel log scale.** Its four assay groups differ ~40× in range, so
  one shared scale drew ChIP-exo, ChIP-MNase and 1,000-strain at **0.0 %** of their 896 bins and
  RNA-seq at 9.5 % — the empty head block. Each track now scales to its own peak on the log axis the
  rest of the page reads coverage on.
- **Normalise an activation map by percentile, not by min–max.** These tensors are heavy-tailed and a
  handful of outliers set the range, so the *contrast* collapses with depth even though almost every
  cell stays above the ink floor: measured IQR of drawn ink runs 0.299 at block1 → **0.030** at block7,
  because block7 spans −19.4…37.4 while its p1–p99 is −3.4…3.8. `percentileRange` (a 1,024-bin
  histogram, two linear passes, no sort) recovers 3–5× the contrast on 10 of the 12 mapped stages.
- **A knockout must be measured over the gene the window is named for, not the window's peak.** A
  14,336 bp yeast window holds a dozen genes and the tallest is rarely the one whose promoter you
  edited — on the KRE33 window the global peak is 114.3 at bin 249 (YNL135C) while KRE33's own body
  peaks at 7.8. Measuring globally reported a 0.4 % effect for a real motif knockout, which is a
  measurement of an unrelated gene. `geneBodyBins()` is the fix.
- **Single-motif knockout effects span two orders of magnitude, and that is the finding.** Measured
  across the six Figure 4 windows: splicing motifs dominate (DTD1's 5′ splice site **−34 %**, its
  branch point −21 %, MMS2's branch point −19 %), TF sites run 7–11 % (KRE33 Reb1 −10.5 %, FUN12 RRPE
  −7.4 %, RPL26A Sfp1 −9.1 %), and some sites move nothing (KRE33's *other* RRPE site, −0.1 %). A
  near-zero result is an answer about that site, not a broken button — the page says so.
- **The six Figure 4 loci are windowed on the figure's own coordinates**, not the transcript midpoint
  the other eight use, so what the paper drew lands mid-window (bins 423–473). **DTD1 is `YDL219W`**,
  not YDL100C — the figure's coordinates are what settle it, and YDL219W carries the 71 bp intron
  panel E marks. Motif spans are **found by scanning the shipped sequence** for panel H's consensuses
  on both strands, never placed by eye, so a test can assert the consensus really is at that offset.
  The scan is a subset of what the figure labels and finds sites it does not — the page says that too.
- **`npm run audit:playground`** (`scripts/audit-playground-ui.mjs`) is the rendering gate: both engines
  × 1440/768/390/320 × light/dark, asserting one `<h1>`, no overflow, no console errors, **that the
  content area actually scrolls**, that every stage selects with a non-empty detail, that the three
  removed panels stay removed, that a theme change repaints the canvases, plus reduced motion and a
  client-side navigation round trip; `:full` adds that a locus change clears every view and that a
  raster is neither blank nor a wash (5 % < inked < 85 %). Panel count is derived from the `.astro`
  source. `:ci` is the
  chromium smoke form and **never clicks Run** (28.6 MB model, ~15 s WASM inference); `:full` adds one
  real inference and a motif knockout.
- **The raster is a `<canvas>`, not SVG.** 96 filters × 390 positions is ~37k nodes; as SVG a
  keystroke cost **47 ms**, as canvas **6 ms**. Any dense per-cell visualisation on this page has
  to go to canvas.
- **The model input is 170 channels** — 4 DNA + 1 mask + **165 species one-hot** — which the paper
  never states. A 4-channel input produces silent garbage.
- **The output track order is the sheet's, not the paper's**, and reading the paper's costs you the
  RNA-seq curve. The Methods list the four assay blocks in one order and
  `minimal_example/sheet.txt` in another; the sheet is authoritative — ChIP-exo 0–1127, ChIP-MNase
  1128–1147, RNA-seq (TF induction) 1148–4200, 1,000-strain RNA-seq 4201–5214. The page shipped on
  the paper's order for a while and the curve labelled "predicted RNA-seq" was mostly ChIP-exo. It
  passed the sanity gate anyway, because the ChIP-exo block is *also* ORF-enriched — 1.20× against
  RNA-seq's 17.94×, enough to look right and not enough to be right. `src/data/shorkieTracks.json`
  now ships the ranges, `shorkieModel.test.ts` asserts them, and `sanity_check.py` prints the
  enrichment per group so a future reordering is visible rather than inferred.
- **Species index 109 is *S. cerevisiae*, established by magnitude and not by contrast.** The
  species one-hot is almost purely a **gain**: across all 165 settings the predicted curve keeps its
  shape (pairwise r ≥ 0.993) while its peak moves ~3×. So an ORF/intergenic *contrast* sweep cannot
  separate the indices — the top five score 17.94, 17.77, 17.17, 17.12, 17.11, and on a random-gene
  hold-out 109 scores *below* the no-species control. **Peak magnitude does**: 109 is rank 1 of 165
  on 6/6 probe genes. The control is what makes that evidence rather than a coincidence — on
  block-shuffled yeast it drops to rank 96, on random ACGT to 120, on poly-A to 165 of 165. An
  argmax with a 1% margin is an argmax, not an identification; find the measurement that separates,
  then find the sequence on which the winner must lose.
- **The flow canvas uses the canonical U-Net encoding: height is positions, width is channels**,
  both log-scaled over the range actually present rather than from zero. Scaling from zero, or
  taking a raw log, flattens this architecture into twenty near-identical boxes — positions span
  16,384 to 128, which is only log₂ 14 to 7, and channels 96 to 5,215 is 6.6 to 12.3. Mapping each
  range onto `[0.26, 1]` keeps the ordering exactly (it stays monotone in the true quantity) and
  makes the U visible. It also makes a skip arc horizontal, which is correct: a skip joins two
  stages of *equal resolution*.
- **A canvas that reads CSS custom properties must redraw on `khc:theme-change`.** The site ships
  six themes and `css()` falls back to the light palette, so a canvas painted before a theme switch
  keeps the old colours — near-black title text on a dark card. `dino.ts`, `genomeJumper.ts` and
  `proofreader.ts` already listen; the playground did not, and neither its flow canvas nor its
  neuron raster followed the toggle. SVG panels restyle themselves and hide the problem.
- **Nearest-stage selection, not a hit test.** Twenty blocks separated by gaps, the narrowest under
  3% of the width: requiring a click *inside* a block makes a third of the canvas silently
  deselect. `hitTest` returns the nearest centre and never null.
- **Scrubbing moves through the depth of one already-computed forward pass** and never re-runs the
  model; inference stays on an explicit click. The per-stage maps come from the same ONNX call as
  the prediction (`stage_maps`, pooled to 128 positions inside the graph), so no
  panel on the page is fed by a second, decorative model.
- **`onnxruntime-web` is the repo's second runtime dependency** (after `three`) and the first with
  transitive deps. Astro code-splits it, so only this route pays; verify no other chunk grows.
- **The CSP gained `'wasm-unsafe-eval'`, `blob:` in `script-src`, and `worker-src 'self' blob:`**,
  documented inline in `BaseHead.astro`. That is the WASM-only permission, not `'unsafe-eval'`.
  Model and runtime are same-origin, so `connect-src` stays `'self'`.
- **Seven places the paper and the checkpoint disagree** are listed in `SPEC_NOTES` and rendered on
  the page. Resolve toward the checkpoint; it is the model that runs.
- **The verification chain is in `scripts/shorkie/README.md` and is not optional.** The port cannot
  be diffed against TensorFlow (TF 2.15 does not support Python 3.13), so correctness rests on:
  every tensor consumed exactly once, exact parameter accounting, **ORF/intergenic enrichment on
  real yeast sequence**, and python↔browser parity. Re-run all of it after any change to
  `shorkie_torch.py`.
- **python and the browser do not run the same fp16 graph, and parity is a bound rather than a
  zero.** onnxruntime's desktop CPU provider prints `Could not find a CPU kernel ... MatMul node
  '/core/attn.N/MatMul_4'` and casts the attention matmuls up to fp32; the WASM provider in the
  browser does not. On the shipped graph they agree on every argmax bin and to ≤ **1.4e-3**
  relative on the peaks (RNA-seq 994.8802 vs 994.4959 at bin 435). An earlier run recorded this as
  exact because it compared the two **displayed** values, and `toFixed(2)` had folded 12.6953 and
  12.6875 into "12.70" and "12.69"; a later `toFixed(4)` write then silently clobbered the
  full-precision one. The track SVG now carries `data-peak` at full precision, written once.

- **`verify_pipeline.py` runs with no checkpoint, and that is the mode that matters.** The packs and
  the fp16 graph are both committed, so sections 1–2 re-derive the correspondence between what the
  page draws and what the model computes from the repository alone — 54 stage-locus pairs, comparing
  the **signed max and the argmax channel** per stage rather than a norm, because those are the two
  quantities the layer panel prints. A mis-sliced or stale pack then shows up as the wrong channel
  instead of as a small numeric drift. Worst decode error is 0.6683 at `unet3`, which is that row's
  range over 255 — the uint8 floor, not slack.
- **A checkpoint of the wrong size is not a regression, and the script says so.** `model_best.h5` in
  `~/Downloads` is a *different* model — 12,393,632 values and a **384-wide head** — and it used to
  reach section 3 and die on `operands could not be broadcast (1,896,384) (1,896,5215)`. The
  parameter check now stops the run with the file path and the expected count. Anything measured
  against the wrong checkpoint is worse than no measurement: it looks like data.
- **"loudest channels" is a SIGNED max, not `max|·|`.** Ranking `attn8` by magnitude gives #339
  (73.06); ranking by signed max gives #89 (62.59), which is what the page prints and what the graph
  produces. Checking the panel against a hand-decoded pack will look like a mismatch if you reach
  for `abs` — the two orderings disagree on most stages from block7 on, where the residual stream is
  50–66 % negative.
- **`unet3` peaking at 300.00 is real.** It is the pre-head tensor feeding a Dense whose softplus
  output reaches 2,396, and the round number is one channel's own maximum, not a clip — the next are
  291.25 and 284.25, and a clamp would stack them. `unet1` and `unet2` sit at 5.7 and 4.4, so the 68×
  jump at the last decoder stage looks like a packing bug and is not one.
- **"Loudest channels" is meaningless at both ends of the network**, and both ends now say something
  else. At the input every channel's maximum is exactly 1.00 by construction, so the ranking is
  noise — it reports base composition instead, which doubles as a check on the encoding (38.1 % GC
  is the *S. cerevisiae* genome average). At the head the four rows are **assay groups**, and
  numbering them #0–#3 beside a title reading "5,215 channels" invites reading them as channel
  indices, so they are named.
- **The precompute only runs in locus mode.** A headless probe that loads the page and reads the
  panels sees the free-typing path — "Live conv-stem view is running" — and every activation-derived
  assertion silently measures nothing. Click `[data-vp-mode="locus"]` and wait on
  `dataset.vpResultSource === 'precomputed'` first; `enterLocus` in the audit does exactly that.
- **The gene track's tally is counted inside the loop that fills the rectangles**, and published as
  `dataset.vpGeneTrack` on the canvas. An intron drawn as an exon is invisible to every other check
  on the page — it is a canvas, so there is no element to inspect — and counting the *decomposition*
  instead would pass while the drawing was wrong. 7 of the 14 loci draw at least one intron as a gap.

- **A newline between prose and an inline tag is DELETED by JSX, not collapsed to a space.** So
  `for⏎<em>every` renders as "forevery". It is invisible in the source — every line looks correctly
  spaced — survives `astro check`, the test suite and every rendering gate, and **21 of them shipped
  on this page in one round** of writing the explanation disclosures. Find them on the *built* HTML
  (a word character butted against an inline opening tag whose text starts with one), never in the
  source; fix with an explicit `{' '}` at the end of the preceding line. `audit:playground` now walks
  the rendered DOM for it, and the check was verified by reintroducing one.

- **Dense annotation inside a plot area collides with the data — on this page too.** The neuron
  traces drew each channel's `relevance · fires · % in region` label across its own trace *and*
  across the traced-region box, the one thing the label described. Each row is now two lanes, label
  above trace, with the region painted behind at 0.1 alpha instead of stroked over the top. Same rule
  the deep-dive figures already carry; a canvas is not an exception to it.

- **A zero rule is only meaningful when the series crosses zero.** `attn4` channel #161 fires
  −31.08 … −9.13, so `(0 − lo)/span` exceeds 1 and its "zero" line was drawn *above its own lane*,
  landing in the neighbouring row's label and implying a crossing that never happens. Guard on
  `lo < 0 && hi > 0`; several channels of the residual stream fire entirely negative.

- **An axis tick centred on the axis endpoint is clipped mid-number**, which reads as a different
  coordinate rather than as a cut-off one — the zoomed logo's 2235 and 2385 rendered as "35" and
  "23". Anchor the first tick `start` and the last `end`. A canvas caption has the same failure and
  no `overflow` to report it: give it long/short/minimal tiers chosen by `measureText`, and keep any
  definition it might drop (what 1.0× enrichment means) in the prose as well.

- **`verify_pipeline.py` runs under a global `torch.set_grad_enabled(False)`** — everything else in
  it is inference — so a check that needs a backward pass must open `with torch.enable_grad():`
  around exactly that block. Without it the section dies inside `.backward()` with a traceback that
  names autograd rather than the script.

- **`windowFraction` is the page's one horizontal coordinate, and its domain is the WHOLE window.**
  The panels are stacked, so a reader reads down a column expecting one bp — and they did not share
  one: the coverage curve mapped x across bins 0–896 (bp 1,024–15,360) while the attribution
  directly beneath it, at the same CSS width, mapped x across the full 0–16,384. The same screen x
  was 1,024 bp apart at the left edge and the two disagreed by 14,336/16,384 across the middle; they
  drew their gene tracks through different closures. The domain is the whole window rather than the
  predicted interior because **the flanks are real** — every output bin's receptive field is all
  16,384 bp — so the 896-bin curve is drawn where it falls with its cropped flanks shaded, and the
  head's raster is inset the same way rather than stretched to fill.
- **`axisTicks` places ticks through the axis in use, not linearly.** This page defaults to
  `log1p(v)/log1p(max)`, where evenly spaced values are not evenly spaced positions, so ticks
  generated linearly and then drawn on it bunch against the top. It returns the fraction up the axis
  alongside the value so a caller never re-derives it.
- **Two bands sharing 30 px is how a gene block came to be painted through a coordinate label.**
  The layer ruler gave tick labels and two gene rows the same `RULER_H`, they overlapped by 4 px,
  and `883.1 kb` rendered as `383.1`. The `fillText` calls were correct the whole time — patching
  `CanvasRenderingContext2D.prototype.fillText` and logging what was actually drawn is what settled
  it, after two wrong guesses about the arithmetic.
- **An audit that finds an element by document order breaks when you add one before it.** The
  coverage caption was located as the first `text` matching `/predicted/`; adding a *y-axis label*
  reading "predicted coverage (a.u.)" silently made ten profiles start asserting against the axis.
  It carries a `.vp-caption` class now.
- **`packGeneRows` — eight of the fourteen shipped windows contain an overlap.** Every feature used
  to draw on one line distinguished only by opacity, so in those eight one gene was painted over
  another and could not be read. Greedy first-fit is the standard assignment and no window needs
  more than two rows, so expanding costs one row and hides nothing.
- **Gradient × input is exactly zero at the three bases that are not there**, because the input is
  one-hot. A saliency logo built on it therefore has one letter per position *by construction* —
  that is the correct rendering, not a simplification, and the page says so. All four letters
  ("hypothetical contributions") would need the raw gradient, a different pack.
- **A panned view must follow the selection.** The sequence logo kept its window when the region
  changed, so it showed the letters of wherever the reader last looked *under the new region's
  heading* — the same class of stale-view bug as a locus change that kept its canvases.
- **Attention rollout: uniform attention mixed with the identity is NOT uniform.** It is
  `0.5 I + (0.5/N) J`, already row-normalised, with a heavier diagonal; composing it k times gives
  `0.5^k I + c_k J` with `c_k = (0.5/N)(2 − 2^(1−k))`, so at N = 8 over 8 layers the diagonal is
  exactly **263/2048** and every other entry exactly **255/2048**. The first draft of that test
  asserted 1/N and the test was what was wrong. Rollout is an *architectural* quantity — what the
  transformer can read, not what changed the prediction — and it needs no new data at all: the
  `[8 × 128 × 128]` maps already ship in every pack.
- **`make_ism.py` runs off the shipped ONNX, so mutagenesis needs no checkpoint.** A forward pass
  returning only `tracks` is ~85 ms, which puts 512 bp (1,536 substitutions) at ~2.2 min a locus and
  ~31 min for all fourteen; a whole window would be 49,152 substitutions and about seventy minutes
  each. It measures the RNA-seq group mean over **that window's own gene**, the same quantity the
  motif knockouts report. The reference base's own row is zero by definition, which is why one row
  of every column is blank.
- **`filterLogo` sat in the pure layer, tested, and unrendered.** The conv-stem panel showed which
  neurons fired and never what any of them was looking for — the classic DeepBind/Basset reading of
  a first-layer convolution as a motif detector was one function call away the whole time. The
  `.vp-base-A/C/G/T` colour classes were unused in the same way.
- **The stage profile answers "layer by layer"; the layer panel answers it for one stage.** Both
  read the same `channels [112 × 5760]` plane, but relevance is a **mean** over each stage's
  channels — summing ranks a 1,536-channel stage above a 384-channel one on width alone. Stages
  whose activations live on their own tensors report "own tensor" rather than 0, which would read as
  "contributes nothing".

#### Matching the paper (`~/Documents/shorkie-paper`)

The reproduction repo is the authority on what the figures actually do, and several of the site's
earlier assumptions did not survive reading it.

- **The paper's saliency is ISM, not gradients.** Its published attribution recipe is identical in
  three independent files (`1_plot_dna_logo_general.py:249-256`, `fig4_common.py:227-230`,
  `fig05_lib.py:63-65`): average `logSED` over the T0 tracks → **mean-centre across the four
  bases** → **project on the reference one-hot**. The repository's single gradient routine
  (`yeast_helpers.py:188`) is **dead code — called by nothing**, its Borzoi `subtract_avg` hook
  defaults off, and it still declares a 4-channel input the 170-channel model cannot accept. Do not
  describe Shorkie attribution as gradient-based. (`external/baskerville-yeast` is an uninitialised
  submodule, so Borzoi's own source is not readable from that checkout.)
- **`logSED` SUMS bins inside each log**, `log2(Σ_alt+1) − log2(Σ_ref+1)` over gene-body bins
  (`ensemble.py:97-104`). Under a linear difference sum-vs-mean is a constant factor and harmless;
  inside a log it is not. It is a log *ratio*, which is what makes a silent promoter and a maximal
  one comparable — the site previously reported a linear difference as a percentage and had to
  spend a paragraph warning readers off its own numbers.
- **The track set is the 384 `_T0_` tracks**, indices 1148–4193, not the whole 3,053-track RNA-seq
  block. Figure 5's subject is that saliency *changes* across induction timepoints, so averaging
  all of them smears the axis the paper proves is not constant. `shorkieTrackNames.json` makes the
  subset derivable, and it reproduces 384/1148/4193 exactly.
- **The site's ISM plane and the paper's are exact complements, and the conversion needs no re-run.**
  The site stores `alt − ref` with the reference cell zero; the paper mean-centres and projects,
  which keeps only the reference base. With `P[ref] = 0`, `centred[ref] = −Σ P / 4` — so the paper's
  per-position saliency is **minus the sum of the three alternatives over four**, derivable from the
  shipped plane. `ismSaliency` is that one line.
- **The paper computes the position × base grid the site rasters, and simply never plots it.**
  Figure 4 contains no heatmap — all fourteen saliency views are letter logos — but
  `run_ism_eqtl.py:126-144` builds exactly the site's array, reference pinned to zero, and it is on
  disk in `figure_07/reproduced/ism/oma1.npz`. So the raster visualises a real published quantity
  in a form the paper did not choose. That is the honest statement; "no counterpart" is too strong.
- **The canonical logo renderer is `yeast_helpers.py:140-185`, and the figure-4 helper is the
  outlier.** 23 of 24 files apply `globscale = 1.35` on **both** axes; `fig4_common.py` drops it and
  its logos render ~27 % short with visible gaps. The published density — letters overflowing their
  column and touching — is the 1.35. Per-letter offsets are A −0.350, C −0.366, G −0.384, T −0.305,
  hand-tuned and **not** half-advances (deriving them moves A, G and T by 0.026–0.037 em). Colours
  are uniform repo-wide with zero exceptions: **#008000 / #0000FF / #FFA500 / #FF0000** — saturated
  X11, fixed across all six themes for the same reason the chromatin molecular colours are.
- **Two stacking rules, and they must not be mixed.** Attribution logos sort *descending by
  |magnitude|* (largest nearest the axis), positives up and negatives **mirrored** below, with a
  black zero rule. PWM/IC logos sort *ascending by probability* over a fixed 0–2 bits axis.
- **The y-padding is 0.05 of max|v|, applied to the data min and max separately.** Three constants
  exist and are not interchangeable: 0.05 is the operative one (17 files, passed explicitly by
  `visualize_input_ism`), 0.10 is a dead fallback, and `fig4_common`'s 0.08 is the reproduction
  helper's. The range is asymmetric about zero.
- **In SVG, scale the glyph PATH, never `font-size`** — font-size scales width with height and it
  stops being a logo. The real DejaVu Sans Bold outlines are embedded in `LOGO_GLYPHS` with the
  offsets baked in; letters are deliberately not width-normalised (A is 23 % wider than C).
- **The windows are TSS-anchored 450 up / 50 down** (`fig4_common.py:285`), and the six Figure 4
  published windows already sit in `shorkieLoci.json` as `figureWindow`, matching `PUB_WIN` base for
  base. Upstream is to the LEFT on the plus strand and to the RIGHT on the minus.
- **Every published ISM run passes `--rc`**, so both strands are run and averaged. Average the two
  **logSED values**, not the two coverages: the model is strongly strand-asymmetric (measured, the
  reverse strand's coverage sum runs 0.39–0.87 of the forward's), and the asymmetry cancels inside
  each log ratio but not across them.
- **170 = 4 DNA + 1 + 165 species, and the paper's own helper library says otherwise.** The corpus
  table (`README.md:118-124`) gives `num_features` 6 / 85 / 170 / 1366 for species lists of
  1 / 80 / 165 / 1361 — always *n + 5*, and six loaders inject `num_species + 5`. A one-genome corpus
  needing **six** features is impossible under "4 DNA + N species". `ensemble.py:17-20`
  (`N_SPECIES = 166`) folds the fifth channel into the species block and is the mislabel; it is now
  a `SPEC_NOTES` row. **The fifth channel is never written by any code the paper ships** and is zero
  in every inference path; the LM masks by zeroing the four DNA channels, so calling it "the mask"
  is unsupported.
- **`r64_idx = 109` IS published** (`1_predict_seqs_LM.py:243`, `1_visualize_attention.py:764`), and
  row 109 of the species list is *S. cerevisiae*. The site used to say "nothing published names it"
  and identify it empirically; that identification is now *confirmation* of a published constant.
  109 indexes the species list, 114 = 4 + 1 + 109 is the absolute channel — both are right.
- **The conv-stem panel was removed because its premise is unsound.** `params.json` gives the stem
  as `activation: "linear", norm_type: null`, so its 96 filters are a basis any invertible
  recombination leaves unchanged — "filter #37's consensus" is an artefact of where the optimiser
  landed. The paper never analyses first-layer filters; it derives motifs by TF-MoDISco on ISM
  contributions matched with TomTom. A latent defect went with it: the real stem is **11 × 170 × 96**
  and, because channel 114 is constantly 1, equals the 4-channel convolution *plus a constant
  per-filter offset* the 11 × 4 × 96 TypeScript port did not carry.
- **The attribution packs cannot be regenerated on this machine.** `make_attribution.py` needs the
  fold-f0 checkpoint (14,253,567 values); the only `model_best.h5` present has 13,665,828. So
  gradient × input still lacks the mean-centring that would make it comparable with the ISM
  saliency, and the page says which method is which rather than pretending they agree.
- **The stage stack is a factorised quantity and says so.** Per-channel relevance × per-position
  activation, with each channel normalised to its own total first — otherwise the row reports
  wherever the stage is loudest, which on a 16 kb yeast window is whichever gene is most expressed
  regardless of what was traced. It is painted against each row's **own mean** on a diverging scale:
  the early residual blocks are spatially near-uniform once pooled to 128 positions, and a
  sequential ramp renders that truth as a saturated bar reading "maximally relevant everywhere".

#### Region-conditioned interpretation

- **`y[0, a:b, T0]` is (tracks, bins), not (bins, tracks).** An integer index beside an array index
  makes numpy treat the integer as advanced too and move the broadcast axis to the FRONT. So
  `y[0, a:b, T0].mean(axis=-1).sum()` averages over BINS and sums over TRACKS — the paper's quantity
  with its axes swapped, off by a factor of `n_bins/n_tracks`. It shipped that way in the mutagenesis
  generator. **`verify_pipeline.py` re-derived it with the same wrong indexing and therefore agreed
  with the pack and passed** — an assertion is not evidence when both sides share the mistake. Index
  in two steps: `y[0][a:b][:, T0]`.
  The numerical damage was small and is worth knowing why: logSED is a log RATIO and the coverage
  sums are far above the +1 pseudocount, so a constant factor cancels. Measured, the worst error
  across all fourteen loci was **5e-3 in logSED**, at or below the packs' own uint8 floor.
- **Mean-centring destroys integrated gradients' completeness.** IG's whole value is that its
  attributions SUM to `f(x) − f(baseline)`; that identity is a telescoping integral of the RAW
  gradient, and subtracting the per-position mean across bases breaks it. Measured: mean-centred, the
  completeness error was **8–650 %**; un-centred, **0.4–13 %** at 32 steps, and most of that 13 % is
  one anchor whose gap is only −0.08. So gradient × input IS mean-centred (the Borzoi convention, and
  what makes it comparable with the paper's ISM) and IG deliberately is NOT — the page says the two
  differ and why. Report the completeness error **absolutely as well as relatively**: a near-zero gap
  turns a 0.04 miss into "652 %".
- **Occlusion is the cheapest exact method here, because one pass answers every output at once.**
  Ablating input window *w* and reading all 896 bins costs a single forward pass, so the complete
  `[256 × 896]` input-region × output-region matrix is 256 passes — **22 s a locus**. Nothing else on
  the page is two-dimensional.
- **The occlusion map's diagonal is intense but narrow, and both halves of that are the finding.**
  Per cell the diagonal dominates; but it is one window in 256, so summed over a row the local
  footprint is only **0.2–5.6 %** of the most damaging window's total effect. Saying only "the model is
  local" or only "the model is long-range" is half the truth, and the panel says both.
- **Ablation-by-zeroing and motif-shuffling ask different questions.** Zeroing the four DNA channels
  is how the paper's LM masks a position and is indistinguishable from a run of N: it asks whether
  the stretch carries information at all. A shuffle preserves base composition and asks whether the
  *arrangement* matters. The knockout panel does the second; occlusion deliberately does the first.
- **Both attribution margins are exact and both superpose; only the interior is estimated.** The
  per-channel margin `[112 × 5760]` and the per-position margin `[112 × 18×128]` are each a row-sum
  of the precomputed groups, because gradients are linear in which outputs you select — so an
  arbitrary contiguous region is exact with no model run. `relevanceMap` reconstructs the interior as
  their outer product, which is the unique distribution matching both margins under independence.
  That replaced an estimate that weighted the channel margin by the stage's **activation**, which
  reports wherever the stage is loudest — on a 16 kb yeast window, whichever gene is most expressed,
  whatever region was asked about. **Measured, the two are essentially uncorrelated**: across the
  stages, `corr(exact, estimate)` runs −0.08 to 0.23, and their argmax positions disagree entirely.
  The exact profile peaks at bottleneck positions 12–24 for a region occupying bp 1,536–3,088 —
  i.e. exactly where the region is — while the estimate peaks anywhere from 15 to 105. The old
  panel was not answering the question it asked.
- **The positional margins are not a rectangle until you pool them.** The stages do not share a
  position count: block1 has 16,384 and block7 has 256, so the raw margins total 35,328. Pool to the
  packs' common 128 **by sum, not mean** — relevance is additive, and a mean makes a coarse stage
  look quieter merely for being coarse.
- **`PX_PER_CHANNEL` — one row is one channel, at every stage.** The layer raster used to stretch
  every stage to ~300 px, which destroyed exactly the comparison it exists for. The two stages whose
  rows are NAMED rather than numbered (the input's four bases, the head's four assay groups) are a
  deliberate exception at 4 px they would be unreadable, and the panel says so rather than hiding it.
- **The fold-f0 checkpoint is fetchable**, 54.9 MB from the URL `scripts/shorkie/README.md`
  documents, into the gitignored `scripts/shorkie/_scratch/`. With it, `verify_pipeline.py` sections
  4–9 run for the first time and all pass: accounting exact at 14,253,567, PyTorch ↔ shipped fp16
  graph 4.98e-04, shipped predictions ↔ live 8.59e-04, every pack ↔ live ≤ 2.8e-03.
- **A blanket string replace across a render function duplicates call sites silently.** Adding two
  renderers by `t.replace(call, call + new)` across four call sites produced eleven mangled calls at
  three indentation levels and dropped the flow-canvas repaint from one of them — so relevance mode
  went stale for a new region while every panel below it updated. The audit caught it. The fix was
  one `refreshRegionViews()` helper; the lesson is that N call sites wanting the same list is a
  function, not a replace.

#### Conventions, costs, and what every panel collapses

- **Full-window single-base mutagenesis is not affordable, and the number is worth keeping.** A
  forward pass is **104 ms** and the ONNX batch axis is fixed at `[1, 16384, 170]`, so batching
  cannot rescue it: 16,384 × 3 substitutions is **1.4 h a locus** one strand and **39.6 h** for all
  fourteen both strands. Mutagenesis therefore stays on its promoter window and is not a track on
  the full-window coverage strip, where it spanned 3 % of the axis.
- **Every input-space method is rc-averaged; the relevance margins deliberately are not.** Borzoi
  averages both strands and every published Shorkie ISM run passes `--rc`, so gradient × input,
  integrated gradients, occlusion and mutagenesis all do. The per-stage relevance margins do not:
  they describe one forward pass's *internal state*, and a forward/reverse average is not a state
  the model is ever in.
- **This model is NOT reverse-complement equivariant, so that averaging is a real choice.**
  `augment_rc: false` in all four `params.json`. Measured on TDH3, the target reads **15.60 forward
  against 14.23 reversed** and the two gradients correlate at **0.31**. It is a test-time
  augmentation the paper adopts, not a symmetry being exploited — say that rather than implying
  variance reduction over a symmetry.
- **The rc gradient mapping is `g.flip(0)[:, [3,2,1,0]]`, and getting it wrong is silent.** `rc` is a
  permutation, so it is its own inverse and `d f(rc x)/dx = rc(df/dy)`. Verified against finite
  differences on the real model before it shipped: forward gradient −0.002388 against a finite
  difference of −0.002384, mapped reverse +0.003716 against +0.003815 at eps = 1e-3. **Test at
  eps ≤ 1e-2** — a first attempt used eps = 1.0 on a one-hot input, which is not a small
  perturbation, and the check failed against correct code.
- **rc-averaging an attribution requires rc-averaging its completeness target too.** Averaging the
  IG attributions while leaving the gap forward-only pushed the completeness error from 0.002–0.15
  to **0.22–0.57**. The average of two complete decompositions is a complete decomposition of the
  average — `rc_grad` is a permutation so it preserves the sum, and `rc(x) − rc(b) = rc(x − b)` —
  so the gap must be `½[f(x)−f(b)] + ½[f(rc x)−f(rc b)]`. With that, over **all 138 region-locus
  pairs** at 32 steps: **0.0019–0.1325** absolute (median 0.0488), **0.14–9.41 %** relative on the 81
  regions whose target moves by more than 1. A single-locus smoke test read 0.016–0.087 during
  development and was quoted here until the full run showed a top end three times wider — **a range
  measured on one locus is not the range.**
- **The drawn coverage and the attributed quantity are different track sets.** The curve is the
  3,053-track RNA-seq group mean; every attribution scores the 384 `_T0_` subset. Measured, they
  correlate at **r = 1.0000** and differ by **1 %** at the peak — state it, do not "fix" it.
- **The same axis is collapsed by different rules in different panels, and the page now says so.**
  Position is **max**-pooled for display ("did any neuron fire here", `build_onnx.py:139`) and
  **sum**-pooled for relevance ("how much relevance is here" — a mean would make a coarse stage look
  quiet for being coarse). The full table is rendered on the page in *Every dimension this page
  collapses*; that panel exists because the difference is invisible otherwise.
- **The layer relevance map is the only reconstructed number on the page.** Both its margins are
  exact and superpose; its interior is their outer product, which is the unique reconstruction under
  independence. The **neuron traces** sit directly beneath it as the un-collapsed answer to the same
  question — top-k channels by exact relevance, each drawn as its real activation.
- **A high-relevance channel does not fire only where it is relevant.** Measured on block 4, the top
  eight channels for a region covering 9.5 % of the window are enriched only **0.85–1.32×** inside
  it. Relevance comes from *what a channel computes* there, not from firing only there — which is
  also why the outer-product interior is a defensible approximation at that depth.
- **The methods agree, and the number is worth keeping.** On TDH3's gene body at the 64 bp grid:
  gradient × input vs integrated gradients **r = 0.874**, gradient × input vs occlusion **0.901**,
  IG vs occlusion **0.856**. Against mutagenesis per base over its own 500 bp, gradient × input
  falls to **0.658** — expected, because a gradient is a local linear sensitivity and a substitution
  is a finite jump; where a promoter is saturated the two genuinely differ.
- **Disclosures are collapsed by default and are gated.** A `<details class="vp-how">` on each panel
  carries the formula, the shapes, the collapse and the cost. The audit asserts each one opens and
  has real content, because a disclosure that exists and says nothing is worse than none.

**The volume view** (`src/scripts/shorkieFlow3d.ts`) is the third view, behind a `flat`/`volume`
toggle, built on first use so the `three` chunk is only fetched for a reader who asks:

- **Auto-rotation is the default and the first drag ends it.** `spin` used to advance every frame
  regardless of input, so the drag and the idle animation fought for the same axis and the model
  never settled where it was put. The latch folds the accumulated spin into `yaw` before engaging,
  or the model jumps back to where the animation started the moment it is grabbed.
- **Orthographic, deliberately.** The whole claim is that a slab's size *is* the tensor's shape, so
  a perspective camera would make a far slab small for a reason that has nothing to do with its
  channel count — the same lie a bar chart tells from a non-zero baseline. Depth reads from the
  diagonal layout and the shading instead. The first build used a 38° perspective and the near end
  projected several times larger than the far one.
- **The camera fits in camera space, over the slabs' own corners, every frame.** The row idles
  through a full rotation, so its projected extent swings between the full depth and almost nothing;
  any constant distance chosen for one yaw runs the far end off the edge at another. Fitting the
  scene *bounding box* instead leaves the row floating in margin, because a box's corners sit
  outside the object. Grow the slack half-extent to the canvas aspect — never scale anisotropically,
  which would distort the shapes the view exists to report.
- **Per-face materials: the big face carries the data, the four thin edges carry the group colour.**
  `BoxGeometry`'s six groups are +X, −X, +Y, −Y, +Z, −Z and the box is thin in X, so groups 0 and 1
  are the large positions × channels faces. Painting the activation texture over the whole box loses
  encoder / bottleneck / decoder entirely, and an emissive tint strong enough to restore it competes
  with the signal; the rim does not.
- **The traced path is log-scaled across stages, and a stage with no relevance data is left
  undimmed.** Relevance spans orders of magnitude, so a linear normalisation lights one slab and
  puts the other seventeen on the floor — reporting a single stage rather than a path. The log map
  is strictly monotone in the true quantity, so the ordering is exact. Per-stage relevance is a
  **mean** over the stage's channels, never a sum: summing ranks a 1,536-channel stage above a
  384-channel one on width alone, which is a fact about the architecture and not about the
  selection. The input, stem and head live on their own tensors and have no per-layer relevance in
  the pack — showing them at the floor would read as "contributes nothing".
- **A WebGL canvas readback is 0 pixels without `preserveDrawingBuffer`.** The renderer does not set
  it, so `getImageData` on this canvas always returns zeros and an audit built on it passes against
  a blank page. Screenshot the element instead — that is what the `volume` gate does.

### Other non-obvious things
- **Math (KaTeX)** is wired in `astro.config.mjs` (`remark-math` + `rehype-katex`) for the LaTeX-heavy reports; the report slug page imports `katex/dist/katex.min.css` so both the page and its printed PDF typeset math. Posts currently use no math.
- **Cross-links between sections** use `relatedPosts` references in frontmatter, resolved by `src/lib/relatedPosts.ts` into "Blog" chips on publication/research entries.
- **`src/legacy-redirects.mjs` is generated** by `scripts/gen-legacy-redirects.mjs` — edit the generator, not the data file.
- **A redirect to a `draft: true` post is a live 404, and `audit:links` can be told to ignore it.** `/posts/lifton-v2` pointed at `/posts/lifton-v1-0-9` until that post went draft and stopped being built; the audit stayed green because the path sat in `LEGACY_SAME_ORIGIN_PATHS`, an allowlist for paths checked live rather than in `dist/`. It now points at `/posts/lifton/`. **Never add a path to that allowlist to silence a redirect** — point the redirect at a page that is built.
- **A versioned DOI can carry a different title from its own earlier versions.** eLife `10.7554/eLife.107454.1` and `.2` are "OpenSpliceAI: An efficient, modular … on non-human species"; `.3` and the versionless DOI are "OpenSpliceAI provides an efficient modular … across nonhuman species". The site cited the `.3` DOI under the v1 title in two places. Cite the title Crossref returns *for the DOI you are citing*.
- `public/` is served verbatim; `src/assets/` images are optimized at build via `astro:assets`. Keep `public/CNAME`, `astro.config.mjs` `site`, and SEO metadata all pointing at `khchao.com`.
- `scripts/audit-security.mjs` maintains a `SAFE_SET_HTML_FILES` allowlist of components that legitimately use `set:html` (mostly the animated figure components, e.g. `src/components/LiftOn*.astro`, `OpenSpliceAI*.astro`, `Shorkie*.astro`, `Splam*.astro`, `WGT*.astro`). Add a new component to this list if it needs `set:html` for inline SVG/animation markup; otherwise the audit fails it as an unsanitized sink.
- **A new post panel touches two hand-maintained gates, not one.** `SAFE_SET_HTML_FILES` above, *and* the `inventory` counts in `scripts/audit-post-ui.mjs` — unlike `audit:deep-dives`, which derives its counts from the MDX. `audit:posts` is also **not in CI** (`.github/workflows/deploy.yml` runs the terminal, cells, indexing, refs, ml-interview, deep-dives, links and security audits), so it has to be run locally. Its phone profile is 390px and `audit:narrow` only walks `/deep_dives/`, so **nothing opens a post at 320px** — check that by hand.
- **The text token is `--color-ink`, not `--color-text`.** The latter does not exist, and an SVG `fill: var(--color-text)` is invalid-at-computed-value-time rather than an error: it renders as an inherited colour that happens to look plausible in one theme. `.lvz-svg text` already sets `fill: var(--color-ink)`, so a broken override is easy to miss.
- **Post panels live in `src/components/<Name>.astro` on the `lvz` + `mountStepper` pattern** (`src/scripts/wgiStepper.ts`), with per-family colour tokens in `src/styles/<family>.css` defined for both themes. `SplamRecognizer.astro` is the smallest complete example. `Han1GapClosing`, `HG002CopySearch` and `SangerTrimming` share `genome.css` / `sanger.css`. Where a panel draws a quantity the prose states, compute it in the component (`SangerTrimming` computes both trim spans from its trace) so the drawing cannot drift from the text.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `Kuanhao-Chao/Kuanhao-Chao.github.io`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root (neither exists yet; created lazily). See `docs/agents/domain.md`.
