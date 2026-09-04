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

### The Shorkie Lab (`/shorkie-lab/`)

Two pages under one hub, both `bare`, both over the same fourteen windows and the same annotation:

| route | model | question |
| --- | --- | --- |
| `/shorkie-lab/` | — | hub: how the three relate |
| `/shorkie-lab/shorkie/` | Shorkie, 14,253,567 params | "how much does this base change the prediction" |
| `/shorkie-lab/shorkie_lm/` | Shorkie_LM, 13,651,812 params | "how constrained is this base" |
| `/shorkie-lab/genome/` | Shorkie_LM, precomputed | "where in the genome is it most certain" |

- **`/shorkie/` is NOT available to this repo and never will be.** It is the `shorkie` project repo's
  gh-pages Sphinx site, and GitHub Pages routes the whole prefix there. `/shorkie-lab/` is a
  different prefix and is unclaimed — **but a repo named `shorkie-lab` would silently shadow all
  three pages.** `LIVE_SAME_ORIGIN_PREFIXES` in `audit-links.mjs` listed five prefixes when eleven
  repos have Pages; it is now derived from `has_pages` and the derivation is in a comment.
- **`/variant-playground/` moved and is redirected** in `astro.config.mjs`. Astro treats `'/x'` and
  `'/x/'` as one route, so declaring both is a build-time collision.
- **Moving an Astro page one directory deeper breaks its imports in three places**, and only the
  frontmatter is obvious: the side-effect CSS import and the `<script>` block's import are outside
  it, and the script one fails at *rolldown* time with `UNRESOLVED_IMPORT`, long after `astro check`
  reports zero errors.

#### Shorkie_LM (`/shorkie-lab/shorkie_lm/`)

- **The same encoder, seven U-Net stages instead of three.** 128 × 2⁷ = 16,384, so the LM returns to
  single-base resolution with a four-way softmax head, where Shorkie stops at 1,024 and crops to 896
  bins of 16 bp. `shorkie_torch.py` now takes a `DecoderSpec` (`SHORKIE` / `SHORKIE_LM`) and reads
  stage count, crop and head activation from it — the layer numbering is positional, so both models
  index the same way and only the count differs. **Shorkie's verification must pass unchanged before
  any LM number is trusted**, and it does: 14,253,567 and 4.98e-04.
- **13,665,828 was the mystery checkpoint.** CLAUDE.md recorded a `model_best.h5` of exactly that
  size that could not regenerate attribution packs. It was Shorkie_LM: 13,651,812 parameters +
  14,016 batch-norm statistics, every tensor consumed, none unused.
- **Three passes that are not the same number, and the page says which it draws.** Unmasked, the
  model sees the base it scores: 97.8% argmax across a window — it is copying, not predicting — and
  over a 200 bp promoter span its cross-entropy is **3.159 bits, worse than a uniform guess**,
  because a few positions get near-zero probability on the truth and dominate the mean. That is
  nonetheless the pass the paper's Figure 2A logo uses.
- **The iterative reconstruction is the prediction.** Partition positions into K disjoint strided
  sets, mask each in turn, read each position back only from the pass that masked it. K = 7 puts
  14.3% under mask, matching the checkpoint's own `mask_rate: 0.15`, and the stride leaves every
  masked base with unmasked neighbours as in training. **43.0% argmax, 1.757 bits, perplexity 3.380,
  seven passes, two seconds.** K = 10 gives 43.93% / 1.7528 — a property of the model, not the
  stride.
- **The page ships no model.** The iterative pass covers all 16,384 positions, so everything is
  precomputed — 2.4 MB for fourteen loci. The cost is that a reader-edited sequence cannot be
  scored, which the page states rather than hiding.
- **Quantise probabilities in LOG space and verify the decode on the ENTROPY.** Entropy is what
  every panel displays and `−p log₂ p` is steepest where p is smallest, which is where a linear
  uint8 grid is coarsest. The generator tries both spaces per locus and keeps the better; log wins
  everywhere, worst error **0.0198 bits** on a 0–2 bit axis.
- **The LM cannot fill a contiguous hole, and that is the finding.** Masked whole, curated binding
  sites come back as homopolymer runs: mean identity 25.3% at TDH3 against a **32.4% composition
  floor**, and **8 of 14 loci score below their own floor** across 306 sites. The apparent successes
  are A/T-rich sites where poly-A happens to be right. Pretraining masks 15% *scattered*, so the
  model has never been asked to fill a 10 bp gap — the same positions under scattered masking come
  back 43% of the time. **Always report identity against the composition floor**, never against
  zero.
- **The exon prediction fails; the repeat half rests on three features and used to say otherwise.**
  `params.json` carries `exon_loss_scale: 0.1` and `repeat_loss_scale: 0.1` against 1.0 otherwise —
  the model was trained to care ten times less about both. Coding sequence is **more** constrained in
  **14 of 14** windows (mean 1.128×, range 1.041–1.266); that half is solid, and
  `verify_pipeline` §3f asserts it. The repeat half was written as "LTRs and transposons sit at
  0.68–0.80×", which overstates it twice: the curated annotation for these fourteen windows contains
  **no transposon features at all**, and exactly **three solo LTRs** (delta elements in the TDH3,
  PGK1 and RPL26A windows). Three features in three windows is not a fourteen-window result, and
  eleven windows can say nothing. All three do fall the same way, so the direction stands — the
  *scope* was the error. A loss weight can discourage memorising a repeat; it cannot make a sequence
  constrained by the genetic code look random. **`make_lm_summary.py` now recomputes both from the
  packs and the cross-locus table prints `—` for a window with no LTR**, so the support is on the
  page rather than in the sentence.
- **The glyph is one em tall and the per-letter offsets are baked into the paths.** A first attempt
  divided by 1000 and re-applied `LOGO_OFFSETS`, which drew 581 letters at a millionth of their
  size: present in the DOM, `dataset.letters` correct, nothing on screen. Copy the transform in
  `drawLogo`, do not re-derive it.
- **The IC axis is fixed at 0–2 bits and must never auto-scale.** Comparability between positions,
  loci and models is the entire point of information content; auto-scaling would make an
  unconstrained window look as structured as a constrained one. Mean IC here is ~0.22 bits, so the
  logo is genuinely mostly flat — that is the model, not the drawing.
- **A per-route prose gate does not protect a subtree.** The JSX swallowed-space check existed and
  still let **12** through, because it ran on the playground route only while the hub and the LM page
  are different documents. It now walks all three. Site-wide there are **101 more on 22 older pages**
  (KaTeX `log<span>` filtered out), which are pre-existing and untouched.

- **All fourteen windows are selectable, and the page shipped for a round with thirteen of them
  unreachable.** `locusIndex` was pinned at 0 while the complete packs for every locus were already
  on disk (`public/lm-data/`, 2.3 MB, 169 KB a locus) and `load(index)` was already parameterised —
  only a control was missing. Meanwhile the prose stated **per-locus** numbers as page-wide facts:
  masked argmax runs **41.3% (GAL1) to 46.3% (FUN12)** and perplexity 3.23 to 3.50, so the
  disclosure's "43.00%" was TDH3's alone. **Check whether a number varies per locus before writing
  it into prose that a locus switch will sit underneath.**

- **The LM's annotation drew every gene as one `fillRect`, so every intron was painted as exon.**
  Exactly the defect the expression page had fixed; the two pages were making contradictory claims
  about the same coordinates on the seven windows that contain an intron. The renderer now lives in
  **`src/scripts/geneTrack.ts`** and both pages import it, so they cannot diverge again. The tally is
  still counted inside the drawing loop and published as `dataset.lmGeneTrack` / `vpGeneTrack` — a
  canvas has no elements to inspect, so an intron painted as an exon is invisible to every other
  check. Verified live: introns drawn are 1/1/1/1/1/1/3 on ACT1, GAL3, RPL26A, KRE33, DTD1, MMS2 and
  HOP2, matching what the gene models contain.

- **`host.dataset.lmLocus` already existed, so a `data-lm-locus` select collided with it.** The root
  `.vp` element publishes the loaded locus under that name and the audit waits on it; adding a select
  with the same attribute made `[data-lm-locus] option` match 28 options and `selectOption` resolve
  to a `<div>`. The select is `data-lm-pick-locus`. **Grep the dataset writes, not just the markup,
  before naming a new hook** — a `dataset.x = …` never appears as `data-x` in the source.

- **A region on this page scopes statistics, because there is no traceback to scope.** The expression
  page's regions drive attribution; constraint here is per-base and unconditional, so a gene
  selection instead reports that gene's mean IC against its window's via `regionConstraint`
  (`src/lib/shorkieLm.ts`, tested). It reads as a real result: the window's own gene runs **2.0–3.0×**
  the window mean for the glycolytic loci (TDH3 2.76, PGK1 2.80, ADH1 2.99) but **below 1** for GAL3
  (0.81×) and MMS2 (0.94×).

- **The lane and tier toggles drive the DRAWING only — never the enrichment table.** Tying the table
  to them hid the three-tier comparison on the expression page, and that comparison is the finding
  rather than a display option. It was wired to both here for one commit; the audit now asserts the
  table's row count is unchanged when a tier is toggled off.

- **The cross-locus table is precomputed, and the two implementations agree because of a fact about
  257.** `weightedEnrichment` runs 256 circular shifts per class, so fourteen loci live would mean
  fetching every plane and running ~25,000 passes in the browser.
  `scripts/shorkie/make_lm_summary.py` reimplements the statistic and the null in Python — and
  JavaScript rounds halves up where Python rounds them to even. At n = 16,384 and k = 256 there are
  **no exact halves** (257 is prime and does not divide 16,384), so the offsets are identical;
  verified live, the two agree to ≤3e-4, which is the display rounding. **Change either constant and
  that has to be rechecked, not assumed.**

- **A canvas caption has no `overflow` to report and no element to inspect.** The IC caption ran off
  the right edge at 320px and rendered as "… iteratively maske", which reads as a typo rather than a
  clipped line. Four tiers chosen by `measureText`, the same fix the expression page already carries.

#### The page was rebuilt around the browser, and three frontier analyses were added

`/shorkie-lab/shorkie/` no longer has a "Predicted coverage" section. It had 30 `data-vp-*` hooks,
five canvases, TWO independent zoom states and four controls 260 lines from the curve they drove;
everything positional in it is something the browser does better and genome-wide. The browser is act
2, carrying `data-gb-exclude="lm-"`, and two panels survived as **companions that follow it**: the
paper-fidelity ISM logo and the four-method strip.

- **`data-gb-exclude` is the only per-host lane filter, and it must reach FIVE places.** `ALL_LANES`,
  `scoreTracks()`, both loops in `buildPanel()`, and the initial-tracks loop. A lane hidden from the
  panel but reachable from a preset or a URL is worse than one hidden from none. A trailing hyphen
  means a prefix (`lm-` catches a language-model lane added later); a bare id matches exactly.
- **The bridge is two events, and the distinction between them is the whole design.** `khc:gb-view`
  switches locus on ARRIVING at a different window and re-centres the letter views on PANNING inside
  one — never both. Arriving must keep the locus's own default framing (the promoter at TSS−200,
  where `adoptPrecomputed` puts it), because the browser's view centre lands mid-gene-body with
  nothing annotated in sight. `khc:gb-roi` turns a marked region into `tracedBins`, which every
  region-conditioned view is keyed on; marking takes the method strip from one row to four.
- **`#locus=` must steer the BROWSER, not just the selector.** Otherwise the browser starts at its
  default, announces that view, and the companions following it overwrite the window the link asked
  for.
- **An element that appears and disappears must not sit above the canvas.** The "open the full
  analysis" link in the header shifted the whole browser vertically when the view crossed a window
  boundary, and the strip-drag gate failed because the canvas moved out from under the mouse
  between measuring its box and pressing on it.
- **`display: block` on a class beats the `hidden` ATTRIBUTE.** `.gb-scatter` still occupied 170 px
  while hidden — a dead band under the statistics table on both pages.
- **Signed lanes draw DNA logos, but only where `lvl.binBp === 1`.** Occlusion is signed too and its
  bins are 64 bp, so without that guard it would draw sixty-four identical glyphs. Negative letters
  are MIRRORED below the rule, matching `drawLogo` — the two renderers sit next to each other.

**Never hand-write a decode for a pack that ships its own.** The ISM packs dequantise as
`sign(v)·1e-4·(10^|v|−1)`; a reimplementation as `sign·expm1(|v|·log1p(m))` is monotone and odd, so
it preserves **every sign and every argmax** and passed the sign check while changing every
correlation computed from it — it reported 23/23 and r = 0.30 where the truth is **22/23 and 0.369**.
`decodePackedPlane` is now exported from `shorkieModel.ts`, both consumers use it, and its test
asserts it is *not* the plausible alternative. The one dissenting locus is GAL3, where the gradient
reads +0.0013 at mutagenesis's strongest base — gradient saturation, not disagreement.

**Two designs died to a measurement, and the measurements are the findings.**
- **13 genome-wide timepoint lanes would have been one lane.** Lowest pairwise correlation among the
  13 means: **0.9923**; T5 against T0 is **1.0000**. Each averages ~300 regulators. What shipped
  instead is the *spread*, `(max−min)/(mean+1)` — one lane, 820 KB against 10 MB — and it finds the
  GAL7–GAL10–GAL1 cluster unsupervised, peaking at **1.4** against a genome mean of 0.19 exactly
  where coverage is zero. The normalisation was chosen from data: the RAW range reads the question
  backwards (TDH3 73.2 against HOP2 1.1) and `range/mean` is unbounded near zero.
- **The same failure repeats one level up.** Early-vs-late attribution on the timepoint MEANS is
  r ≥ 0.9995 with 99% of the top 500 bases shared. Per REGULATOR it is real: **MSN2 at GAL1 reads
  0.215 with 50.2% shared**, and MSN2/MSN4 — paralogues binding the same STRE motif — rank one and
  two independently.

**A sparse genome track costs ~10% of a dense one and needs no renderer change.** Mutagenesis exists
on 3.10% of the genome (the 23 windows) and ships as `sk-ism` for 1.5 MB against 15 MB; byte 0
already means NO DATA and the lane prints "100% no data" outside them. A gap means *not measured*,
never *no effect*.

**Second-order attribution is affordable and its check is SYMMETRY.** `H·v = ∇⟨∇f, v⟩` is one extra
backward pass (425 ms), and H is symmetric, so `⟨H·v_A, v_B⟩` must equal `⟨H·v_B, v_A⟩` — worst
residual **4.2e-04** over 431 sites. Nothing else catches a mis-wired double-backward: it has the
right shape and magnitude and is simply the wrong quantity. **The helical prediction is REFUTED** —
in-phase against anti-phase |H·v| gives **0.948**, and the periodogram's "periods" (49, 73.5, 36.8)
are 147/3, 147/2 and 147/4, harmonics of the analysis window. Reporting them would be reporting the
ruler.

**The species channel is Shorkie's alone, and the sweep works.** 165 forward passes a locus, 1.6 min
for the set. With the DNA held byte for byte the model ranks *S. cerevisiae* **first of 165 at 19 of
23 loci** (p ≈ 6.4e-39) and above the median at 21 of 23. The control that decides whether it means
anything is the **between-locus rank correlation** — median **0.33**, so the orderings genuinely
differ and this is not a per-species bias; and the five *Yarrowia lipolytica* strains are free
replicates whose spread is 9.5% of the range. The tidy story ("the exceptions are the repressed
genes") is NOT supported: rank against log baseline coverage is only ρ = −0.34, POP4 at 2.9 ranks
first and GLK1 at 20.6 ranks 162nd. The published species list independently confirms
`speciesIndex: 109`.

**Retiring an audit scope is sometimes right.** `chromium/coordinates` asserted four stacked views
mapped one bp to one x; the browser draws every lane into one canvas through one `xOfBp`, so they
cannot disagree by construction. But check first whether an assertion was *fragile* rather than the
code broken — the logo's motif boxes are asserted at the locus default now, because after stepping
to an arbitrary region it can land on bp 2,237–2,387 of TDH3's window, where nothing is annotated.

#### The genome browser (`/shorkie-lab/genome/`)

Shorkie_LM constraint over all **12,157,105 bases** of sacCer3, against phastCons conservation and
the curated annotation, as an IGV/JBrowse-style browser. Same three-layer split as everything else
here: `src/lib/genomeBrowser.ts` is the pure arithmetic (level choice, tile cover, coordinate maps,
locus parsing, lane layout, brushing, feature density, search, history, the URL hash) with
`genomeBrowser.test.ts` beside it, `src/scripts/genomeBrowser.ts` is DOM and canvas,
`src/pages/shorkie-lab/genome.astro` is a `bare` page. Generated by
`make_genome_track.py` → `make_conservation.py` → `make_genome_features.py` →
`verify_genome_track.py` → `make_genome_tiles.py`; the per-base arrays stay in gitignored `_scratch`
and only the tiles ship. **84 MB** in `public/genome-data/`: 1,977 tiles over nine score pyramids,
plus 5.5 MB of features and a 345 KB search index.

**It carries TWO models, and reading one as the other is the mistake the page most invites.**
Shorkie_LM predicts the *sequence* (tall = constrained, in bits); Shorkie predicts *what an assay
would measure* on that sequence (tall = expressed, in arbitrary coverage). A gene body is high on
both lanes for unrelated reasons. Both sweep the same 1,493 windows on the same 8,192 bp cores via
`plan_windows`, so every lane is aligned base for base. `make_genome_shorkie.py` is the expression
model's generator; see **The expression model, genome-wide** below.

**Three score tracks, and only one of them is a prediction.**

| track | units | axis | genome mean |
| --- | --- | --- | --- |
| `lm-masked` — K=7 iterative masked | bits | 0–2 | **0.1993** |
| `lm-unmasked` — the paper's Figure 2A quantity | bits | 0–2 | **0.6865** |
| `phastcons` — 7-yeast conservation | posterior | 0–1 | 0.60 |

The unmasked pass can see the base it is scoring, so it is largely reading its own input: it runs
**3.44×** the masked pass for that reason alone, and its lane says *not a prediction* on its face
rather than leaving the caveat to a paragraph. It is not a rescaled copy either — the two correlate
at r = 0.59–0.62 per chromosome, and 0.62 on the 23 shipped packs. Adding it cost **one extra
forward pass a window** against the masked pass's seven, so the whole genome gained it in about a
minute of GPU: `make_genome_track.py --passes unmasked` skips any pass whose array already exists.

- **phastCons is the check the page exists to make, and the honest answer is more interesting than a
  correlation.** The model is *alignment-free* (165 Saccharomycetales genomes, learned) and
  phastCons is *alignment-based* (a phylo-HMM over 7 yeasts), so they are independent. Genome-wide
  over 12,078,291 bases where both are defined: **Pearson 0.121, Spearman 0.148**. But split by
  class, within CDS it is **0.045** over 8.58 M bases and within intergenic 0.149. Both measures
  rank CDS above intergenic (IC 0.219 vs 0.150; phastCons 0.713 vs 0.327) and **that regional
  agreement is most of the headline number** — they agree about which regions are constrained and
  much less about which bases.
- **Do not report that within-CDS 0.045 as disagreement without the saturation.** **40.1%** of
  coding bases sit at phastCons ≥ 0.99 (median 0.974) against 13.1% intergenic: inside a gene
  phastCons is a near-constant 1, so there is almost no range for the model's per-base signal to
  correlate against, and a correlation is bounded by the range of both variables. `make_conservation.py`
  records `phastConsSaturated` per class for exactly this reason — the number was right and the
  first sentence written about it would have been wrong.
- **Byte 0 means NO DATA, in every score track.** phastCons has no value for 0.65% of the genome
  (chrM is only 77.3% covered); quantised naively that becomes 0, which draws as *completely
  unconserved* where the truth is *not aligned*. Values occupy 1–255, the renderer leaves a gap
  rather than a zero-height bar, and the lane prints what fraction of the view is missing. The rule
  is the same for the two model tracks, which need it nowhere: one decode path rather than two.
- **`spearman` ranks with vectorised tie-averaging.** The obvious version walks the sorted array
  averaging each run in a Python loop, which is interpreted work over 12 M elements and takes
  minutes — and phastCons is mostly ties, so the loop body runs nearly every step. Verified against
  the naive implementation on heavy-tied data to 0.00e+00.

**The annotation is all flat files, and the three TFBS tiers are three different claims.**
`make_annotations.py` fetches the UCSC REST API per 16 kb window, which is right for 23 windows and
wrong for 12 Mb. `make_genome_features.py` reads the local SGD GFF plus four `hgdownload`
`.txt.gz` tables instead — **270,653 features** in 20 classes. `transRegCode` carries
`chipEvidence` and `consSpecies` per call, which splits 206,558 binding calls into
**ChIP-supported 15,979 / conserved-only 68,354 / motif-only 122,225**. Those stay in separate
lanes because the expression page measures attribution enriching 3.26× on the first against 1.25×
and 1.49× on the others; one merged "TFBS" lane buries the strong result under eight times as much
weak evidence. **JASPAR is deliberately excluded**: unfiltered it is 16.7 M hits genome-wide (1.4 a
base), it has no flat file, and it is the weakest tier.

- **A feature lane draws a DENSITY profile above ~60 kb**, and says which it is showing. 122,225
  motif-tier calls at chromosome zoom is a solid bar, not a drawing. `featureDensity` measures
  *coverage*, not count — one 800 bp ORegAnno region and one 6 bp motif must not read the same.
- **`load_genes` keeps `common` separately from `aliases`.** SGD's `gene=` is the primary name and
  `Alias=` the synonyms; merging them and picking alphabetically labelled TDH3 as **"GAPDH"** —
  a real protein name, on every drawing, for the wrong reason.
- **Searching a gene frames its whole SGD gene record, not its CDS.** YGR192C's gene record runs
  882,296–885,044 because one mRNA isoform extends past the 882,812–883,810 CDS. That is what IGV
  does too, and a test that expected the CDS span was the thing that was wrong.

- **Four score tracks now, and GC content is the one that answers the obvious objection.** The
  first thing anyone asks of "the model measures constraint" is whether it measures *composition*.
  Computed locally from sacCer3 (a centred 50 bp window; 5 bp takes six values and is not a
  composition, and the model's own 128 bp pooling grid would build the thing being controlled for
  into the control), the answer is **r = −0.020 genome-wide** — about 0.04% of the variance. But
  **small overall is not zero everywhere**: intergenic is **−0.221**, and chrM is both the most
  AT-rich sequence in the genome (17.1% GC) and the most predictable (IC 0.457 against a nuclear
  0.198). Report both halves or the control is doing the opposite of its job.
  Genome GC comes out **38.15%** against the published 38.1%, which is the check that the
  computation is right.

- **Natural variation splits three ways, and the split IS the test.** UCSC `evaSnp8` (bigBed, so
  REST-only — 17 calls, cached in `_scratch/ucsc-cache/`) gives 84,392 variants: **15,879 missense,
  31,577 synonymous, 36,936 non-coding**. Roughly twice as many synonymous as missense is itself the
  signature of purifying selection. `variant_class` reads UCSC's comma-joined consequence list as a
  PRECEDENCE, not a preference: a variant that is missense against *any* transcript is missense, and
  taking the first entry of `"downstream_gene_variant,missense_variant,upstream_gene_variant"` would
  file the most informative class in the least informative lane.

- **Clicking a binding-site box shows the factor's JASPAR motif, and the absences are findings.**
  `make_motif_logos.py` matches the 102 factors in `transRegCode` to JASPAR CORE 2026 (tax 4932):
  **93 match, three only through an SGD alias** — RCS1 is AFT1, and a name-only join reports it as a
  factor with no known motif. Of the nine that do not match, **seven are explained by SGD's own GO
  terms**: SWI6, HAP4, MET4, NDD1 and STB1 carry GO:0003713 (coactivator), DIG1 and UME1 carry
  GO:0003714 (corepressor). They bind the complex, not DNA, and are in a binding-site table because
  ChIP cross-links whatever is in the complex — so the popup states the reason instead of failing.
  - **Do NOT infer the inverse.** "No GO:0003700, therefore not a DNA-binding factor" is wrong and
    **ABF1 is the counterexample**: SGD's GFF gives it no GO:0003700 and JASPAR gives it MA0265.3, a
    ChIP-exo matrix. The `Ontology_term` field in that GFF is a partial slice, so its silence means
    nothing. Only positive coactivator/corepressor evidence is used.
  - **A PFM is COUNTS.** Drawing it unnormalised produces a logo that looks entirely plausible and
    is wrong by whatever the column depth happens to be. Bits use a **uniform** background, the
    sequence-logo convention — the real 38.1% GC background would give relative entropy, a
    differently-shaped quantity, and would silently make these logos incomparable with every other
    logo on this site.
  - **The drawn box and the matrix are routinely different lengths** — a 9 bp Harbison call against
    a 12 bp JASPAR matrix — so the reference sequence under the logo is taken CENTRED on the box at
    the matrix's width. Slicing the box's own span gives a sequence that cannot line up column for
    column, which is the one thing the comparison is for.

- **Overlapping features stack, and the packing is in SCREEN space.** `packGeneRows` is reused
  rather than reimplemented, so a feature lane and the gene lane cannot disagree about what
  "overlapping" means. But the input spans are widened to a minimum of 3 pixels' worth of base
  pairs first: two 6 bp sites 200 bp apart do not overlap as *coordinates* and are the same pixel at
  100 kb, and stacking them is the only way both are visible. Capped at `FEATURE_MAX_ROWS`, and the
  lane draws "6+ deep" when it wraps rather than silently hiding the rest.

- **The overview strip is the selection surface; the main panel is not.** Drag the strip to select a
  region and zoom to it, click it to centre — which is where every genome browser puts region
  selection and which avoids the pan/select conflict on the panel entirely. Two traps: the view must
  land ON the band drawn, not merely "narrower than before" (the strip spans a whole chromosome, so
  selecting on it from a 2.6 kb view legitimately gives a WIDER view, and an
  asserts-narrowing check would be asserting that selection is always zoom-in); and the click/drag
  threshold is expressed at the STRIP's scale, where 4 px is several kb.

- **`chromOrder` sorts chrI…chrXVI then chrM, and neither obvious sort works.** By name, `chrIX`
  sorts before `chrV`. By length — which this shipped with — the list reads chrIV, chrXV, chrVII.
  And **chrM cannot be ordered by its numeral**: M is 1000, so a roman-aware sort puts the
  mitochondrion last for the wrong reason and would put a hypothetical chrD (500) there too.
  Anything without a I–XVI numeral sorts last.

- **Every track and lane documents itself in four fields**, and `make_genome_tiles.py` refuses to
  write an index missing any of them. `source` / `measures` / `read` / **`caveat`** — the fourth is
  the one that matters, because every track here invites a specific misreading: phastCons saturates
  inside CDS, the unmasked pass is not a prediction, GC is a confound rather than a finding, and a
  variant's absence is also a function of how much sequencing has been done. They surface twice, as
  an expander beside each toggle and as a reference section on the page, both rendered by iterating
  the registry so a track cannot be added without them.

##### The expression model, genome-wide (`make_genome_shorkie.py`)

Shorkie itself now runs over all 12,157,105 bases, so the 23 hand-picked windows on
`/shorkie-lab/shorkie/` read as zoom-ins rather than as the whole story. That page embeds the
browser through `data-gb-minimal` / `data-gb-no-hash` / `data-gb-tracks`.

- **A track must not ship resolution the model does not have, and this changed the whole pyramid.**
  Shorkie's head emits **896 bins of 16 bp** and occlusion ablates **64 bp**; a per-base level for
  either would store 12.16 M numbers carrying 760 k (or 190 k) values of real information and draw
  them as though the model resolved single bases. Each track declares `nativeBp`; `ladder()` in the
  tiler and `nativeLadder` in `genomeBrowser.ts` derive its level list, and the tiler **refuses** a
  `nativeBp` that divides no level. **Level NUMBERS stay global** — `L3` is 64 bp for every track —
  so a coarse track has holes at the fine end and a tile path can never mean two things. The
  failure mode without this is not a blurred lane but an **empty** one: every L0 request 404s.
- **`LEVELS` gained a 16 bp entry for exactly this.** Without it the coverage lanes fall back to
  64 bp, four times blurrier than the data, at the zoom where a reader is looking at a promoter. It
  costs the four per-base tracks ~6% each and is why the payload is 84 MB rather than ~80.
- **The lane readout NAMES any track pinned at its own floor.** A lane silently at 16 bp while the
  readout says "per base" is the browser claiming a resolution the model lacks.
- **Coverage is a SINGLE forward pass; every attribution is rc-averaged.** Not a shortcut:
  `make_predictions.py` ships each locus's coverage from one forward pass, so an rc-averaged
  genome-wide track would print a *different number for the same locus in two panels of one page* —
  and the model is not rc-equivariant, so the difference is large.
- **The acceptance test is correlation, and its residual is phase plus loudness — not a bug.**
  Through its own code path the generator reproduces the shipped packs to **1.24e-03** (the known
  torch↔fp16-ONNX gap). Against the genome-wide track the median is **r = 0.993**, and the one
  locus that happens to share the genome grid's 128 bp phase reads **0.99988**. r correlates with
  locus *loudness* at **+0.748** and with phase distance at only −0.167; the three worst loci are
  the three quietest (GAL1, GAL3, DTD1), where a near-flat profile correlates poorly by
  construction. Check both before calling a low r a windowing error.
- **Verify an attribution's SIGN against the mutagenesis planes, never by inspection.** A sign
  error is invisible and inverts every reading. Gradient × input against the paper's saliency
  agrees about DIRECTION at **22 of 23** loci and much less about magnitude: **median r = 0.369,
  range 0.049–0.654**. The exception is GAL3, where the gradient reads **+0.0013** at mutagenesis's
  strongest base — essentially zero — which is gradient saturation, not disagreement.

- **Never hand-write a decode for a pack that ships its own.** Both numbers above were first
  published wrong because I reimplemented the ISM dequantiser as `sign·expm1(|s|·log1p(m))` instead
  of importing `dequantize_rows` — the pack's real form is `sign(v)·1e-4·(10^|v|−1)` with per-row
  `lo`/`hi`. The wrong form is monotone and odd, so it preserves **signs and argmaxes** and sailed
  through the sign check, while silently changing every correlation: it reported 23/23 and 0.30
  where the truth is 22/23 and 0.369. `verify_genome_track.py` now imports the real decode, and a
  check that shares an assumption with the thing it checks is not a check.

- **A median measured on a subset is not the median.** An eight-locus sample gave 0.405; the eight
  happened to be the loudest.
- **Scale space is a property of the DATA.** `log1p` for coverage — genome-wide the median 16 bp
  bin is **2.07** against a maximum of **1,097.6**, so linearly the median draws at 0.2% of the
  lane. `symlog` for the signed attribution — median |v| **0.00082** against **1.34**, so a typical
  base would draw at 2.5% of half-height. `linthresh` is the genome-wide median |v|. Quantising
  happens in the *read* space, so `to_fraction` (Python) and `axisFraction` (TS) must agree exactly
  or a byte decodes to a different height than it was stored at.
- **A signed lane grows both ways from a zero rule.** Filling from the lane floor draws −0.8 and
  +0.2 as bars of the same sign — an inverted reading of the one thing the track reports. The gate
  counts ink above and below the band's middle, because nothing else can see it.
- **`rnaseq_tf` is deliberately not shipped**: genome-wide it correlates with the T0 `baseline` at
  **r = 1.0000**. The other three assay groups are distinct — ChIP-exo 0.38, 1,000-strain 0.49, and
  **ChIP-MNase 0.08**, which also makes it the closest thing to a nucleosome track sacCer3 has.
- **The first 1,024 bases of every chromosome cannot be scored** — the head crops that much from
  each window end and no window starts before 0. 17,408 bases (0.14%), left as NO DATA rather than
  filled from a window that never scored them.
- **`nohup`-style exit codes lie and the cost of a pass is a property of the harness.** Measured on
  MPS: forward 30 ms (45 s genome-wide), gradient × input rc-averaged 258 ms (6.5 min), IG at 32
  steps 8.2 s (3.4 h), occlusion at 64 bp 15.4 s (6.4 h), **ISM 2,950 s — 1,231 h, 51 days**, which
  is why mutagenesis stays per-locus. Confirm the verdict line, never the exit code.
- **`data-*` collisions bit three times in one round.** `host.dataset.gbX = …` never appears as
  `data-gb-x` in the source, so a new markup hook can silently shadow it and `querySelector`
  resolves to whichever comes first in document order. `cv.dataset.gbRoi` shadowed
  `<span data-gb-roi>` and only *worked* because the span was declared four lines earlier — the
  embed, which has no such span, would have written its ROI readout into the canvas. Sweep it:
  kebab-case every `\.dataset\.(gb\w+)\s*=(?!=)` and intersect with every `data-gb-*` in `src/**/*.astro`.

- **Integrated gradients is NOT a restatement of gradient × input, and the plan said it was.**
  Measured on chrI before committing the 2.5 h: **r = 0.60** per base, **0.44** at 64 bp bins, and
  the two share only **27%** of their strongest 2,000 bases. Their axes differ eightfold (1.34
  against 0.172). That gap is the method's point — a gradient is the slope *at* the sequence, so
  where a promoter is saturated it reads near zero while the path integral still records the base.
  **Measure a "this is redundant" claim on one chromosome before acting on it**; it cost four
  minutes and reversed the decision.

- **IG has a REFERENCE POINT and the gradient does not, and the reference is not neutral.** From an
  all-zero-DNA input the model predicts **12.4258**, against a median of 12.0871 over 24 real
  windows — the baseline sits above **62%** of the genome. So the path IG integrates runs downhill
  almost everywhere and the lane comes out **56.2% negative** where gradient × input is 50.2% and
  stays balanced in every expression quintile. That is a fact about the baseline, not the sequence;
  the two lanes' overall balance must not be read against each other.

- **Completeness is the only check that can catch a bug in the path integral**, and it is cheap:
  the attributions must sum to `f(x) − f(baseline)`. On real windows at 32 steps that holds to
  **0.5–2.3%** relative — and the rc-averaged gap must be used, since the average of two complete
  decompositions is a decomposition of the average only if the target is averaged the same way.

- **A median measured on a subset is not the median.** Gradient × input against the paper's
  mutagenesis saliency was published at **r = 0.41** from eight loci picked by hand; over all 23 it
  is **0.30, range 0.066–0.49** — the eight happened to be the loudest. What survives is the
  stronger and more useful claim: **23 of 23** strongest substitutions point the same way. The two
  methods agree about *direction* and disagree about *magnitude*.

- **A quantity derived from a convenient proxy will be wrong in the last digits.** The page
  computed unscored bases as `total − scored_bins × 16` and printed **17,297** where the truth is
  **17,408**: a chromosome's last 16 bp bin is partial, so the proxy overcounts scored bases by up
  to 15 a chromosome — 111 in total, exactly the gap. Count the unscored bins, which are all full.

- **`meanAbs` exists because a signed track's mean is not a baseline.** Gradient × input is 50.2%
  negative genome-wide, so its mean is near zero everywhere and a "vs genome" ratio against it is
  noise over noise — a large number that reads as a finding. The tiler records `meanAbs` for any
  track whose axis straddles zero, and both sides of the comparison use it.

- **The browser's own additions this round, and the one rule they share.** Live Pearson *r* between
  two enabled lanes over the visible window; "this view, in numbers" (each lane's mean here against
  its genome-wide mean); a scatter, because the same *r* comes from a line, a fan and a cloud with
  two outliers; CSV export at the level being drawn, with the bin size in the header; per-lane
  autoscale, **off by default and announced on the lane**; five preset views, one of which declares
  `requires` so it stays hidden rather than degrading; and a two-way link with
  `/shorkie-lab/shorkie/` (`#locus=<id>`). The rule: **a lane keeps a fixed axis so two places on
  the genome compare, and the scatter fits the view because r is invariant to rescaling** — and
  both say on their face which they are doing.

- **The scatter is scaled by PERCENTILE.** On min–max, a handful of fully determined bases reaching
  2.0 bits over TDH3 squashed every other point into the left 15% of the plot. p1–p99 fills 96–97%
  of the canvas; points outside pile against the border by design, and the caption says so.

- **A `data-*` collision cost three rounds here.** `host.dataset.gbX = …` never appears as
  `data-gb-x` in the source, so a markup hook of the same name silently shadows it. `cv.dataset.gbRoi`
  shadowed `<span data-gb-roi>` and only worked because the span came four lines earlier; the embed,
  which has no such span, would have written its readout into the canvas. Sweep before naming a
  hook: kebab-case every `\.dataset\.(gb\w+)\s*=(?!=)` and intersect with every `data-gb-*` in
  `src/**/*.astro`.

- **An element that appears and disappears must not sit ABOVE the canvas.** The "open the full
  analysis" link was placed in the header, so crossing a window boundary shifted the whole browser
  vertically — and the strip-drag gate failed because the canvas moved out from under the mouse
  between measuring its box and pressing on it. That gate is why it was caught.

- **A phone can clip without the document overflowing.** A four-column statistics table is 314 px
  in a 217 px box, and clipping "vs genome" reads as a column that is not there. The phone scope
  now walks every horizontally-scrollable region and fails anything wider than its container that
  cannot scroll.

- **Nucleosome occupancy was researched and is not feasible**, so it is not missing by oversight:
  the canonical chemical map (Brogaard 2012, GSE36063) is published only as raw reads — the smallest
  supplementary file is 238 MB and the archive is 5.8 GB — with no processed track on UCSC or SGD.
  UCSC's sacCer3 has 49 leaf tracks and no nucleosome, RNA-seq or TSS signal among them.

- **Every lane comes from `laneLayout`, and that refactor is what made everything else possible.**
  The first version hardcoded ruler → track → sequence → genes with literal offsets computed in
  three separate places; adding a fourth lane meant editing all three. The canvas height, the
  drawing offsets and the pointer hit-testing now read one pure function, so they cannot disagree
  about where a lane is. The lane total INCLUDES the trailing gap — a canvas sized without it clips
  whatever the last lane's baseline sits on.
- **Drag pans; drag on the RULER selects.** IGV's convention, and it avoids a mode toggle
  entirely; shift-drag brushes anywhere for anyone who does not know that. The "this was a click,
  not a selection" threshold is expressed in PIXELS converted at the current scale, never as a
  constant: 3 px is 2 kb at chromosome zoom and 0.4 bp at base zoom.
- **A data lane must be clipped to the plot area.** The score lanes draw column by column and never
  escape it, but genes and features draw spans — a gene extending past the left edge is drawn from
  a negative x, straight over the axis labels in the gutter. The lane's own name lives in the
  gutter by design, so it is drawn OUTSIDE the clip.
- **Two gutter traps, both of which shipped for a round.** A feature lane's name is drawn in a
  34–62 px gutter, so `Chromosome structure` clipped to `me structure` — which reads as a different
  label, not a truncated one. Every lane carries an explicit `short`. And a feature's own name must
  be MEASURED against the *visible* part of its box: `OREG0038416` in a 36 px box rendered as
  `OREG003841(` spilling over the edge, and a box starting left of the viewport has a huge
  `x1 - x0` while its label draws outside the clip and vanishes.
- **A lane label needs a background chip.** phastCons saturates at 1.0 through a whole gene, so a
  label drawn at the top of the plot lands on the data rather than above it.
- **`prediction: false` is not the same claim for every track.** Appending "not a prediction" to
  phastCons reads as a failed prediction; it is not a prediction of anything. Each track carries its
  own short `laneTag` — `""`, `not a prediction`, `alignment-based`.
- **A hover readout must read the level the view is ALREADY drawing.** The tooltip reports the
  score under the cursor, and reading the per-base level unconditionally is exact and pulls a
  65,536-base tile for every hover position: measured, one cursor sweep across chrIV at 512 bp bins
  fetched **23 L0 tiles (~1.5 MB)** of data the view cannot show, evicting the coarse tiles it was
  drawing from. Follow the drawn level, and label the value with the bin size so a bin mean is
  never mistaken for a per-base number. `audit:playground` asserts zero stray L0 fetches during a
  sweep, verified by reintroducing the bug.
- **`MAX_TILES` is derived, not constant.** 16 + 16 per enabled score track. A bound tuned for one
  pyramid thrashes with three: measured, the gate drives it to 64/64 with 117 evictions.
- **A hash with no `t=` deliberately leaves the track set alone**, so an old `#chrIV:1000-2000`
  link still works. That also means `page.goto` to the same path with a different hash does NOT
  reload — it fires `hashchange` — which is how the gate's own "enable a second track and compare"
  check silently compared three lanes against three.
- **`chromSel.innerHTML = ''` fails `audit:security`** even for an empty string; the bare
  markup-assignment token is banned repo-wide. `replaceChildren()` says what is meant.
- **The flank is 4,096 bp, and the first answer of 2,048 was wrong because it was measured on the
  wrong region.** Score the same 8,192 bases centred in a window and against its edge, and compare
  per-base IC: on a quiet stretch of chrIV the effect is finished inside 1 kb and settles at 0.007
  bits, so 2,048 looks like a 2× margin. On a chrI gene promoter — where the model is resolving
  motifs and where anyone will look — it is still **0.0224 bits at 2 kb** and only settles around
  4 kb. **Measure the error on the case that matters, not the first one to hand.**

- **The pooling-grid PHASE matters ~20× more than the flank, and that decides the whole design.**
  The encoder pools to 128 bp, so a window's start mod 128 decides which bases share a pooled cell.
  Measured on FUN12 across nine window starts: same phase, mean |ΔIC| **0.0020**; different phase,
  **0.0395**. Every window in the genome track therefore starts on a multiple of 128, so every base
  is on one grid and any two positions are comparable. The 23 per-locus packs start at `locus.start`
  and sit on whatever phase that gives — which is why the two agree in **shape** (r 0.95–0.99) and
  not to the last decimal, and why `verify_genome_track.py` asserts correlation rather than an
  absolute bound. Neither is more correct; they are two phases of the same model.

- **`plan_windows` partitions the CORES first and derives each window from its core**, never the
  other way round. Deriving cores from evenly spaced windows looks equivalent and is not: the last
  window has to be pinned inside the chromosome, so its core overlaps its neighbour's — measured,
  that double-scored 4,271–8,163 bases per chromosome, each silently overwritten by whichever
  window ran last. And the obvious clamp (`min(start, n - SEQ_LEN)`) is what knocks the last window
  of every chromosome **off the 128 grid**; the window is allowed to run past the end instead and
  `encode` zero-pads, which is what a chromosome end looks like to the model anyway.

- **A pyramid that smooths is a pyramid that lies.** Levels are 1 / 8 / 64 / 512 / 4096 bp a bin;
  every level above the base stores **min, max and mean** as three rows, and the three are carried
  separately all the way to the pixel — a column's min is the smallest of its bins' minima, not the
  minimum of their means.

- **But the maximum is drawn as a MARK, not as a filled extension.** Filling from mean up to max is
  the BigWig convention and it inverts the reading here: a 512 bp bin almost always contains one
  near-determined base, so max is ~2.0 nearly everywhere and the fill blankets 90% of the plot — a
  picture of a uniformly constrained genome whose mean is 0.197 bits. As a mark it reports the same
  saturation without painting over the profile that carries the signal.

- **`levelForBpPerPixel` picks the LARGEST bin no wider than a pixel.** Picking the smallest bin *at
  least* a pixel wide is the same rule read backwards and is what the first implementation did: at
  chrIV's 1,094 bp/pixel it chose 4,096 bp bins, drawn 3.7 px each — blur the data does not have,
  and nothing on screen says so. The test caught it.

- **A tile PNG is up to 65,536 px wide, which is wider than a canvas may legally be** — Safari caps
  at 16,384 and Firefox at 32,767. `decodeGray` draws in 4,096-column slices through one small
  reusable canvas, so the decode never depends on a limit the browser is free to choose.

- **The cache is bounded (48 tiles, ~9 MB) and de-duplicated, and the audit has to work to prove
  it.** A 40-step pan at 8 bp bins crosses ONE tile boundary and proves nothing; the gate browses
  three chromosomes at base resolution instead — 58 distinct tiles against the cap — and asserts
  eviction actually ran. The renderer never awaits a tile: it draws what it has, and an arriving
  tile schedules another frame.

- **NO minimum canvas width.** `Math.max(320, clientWidth)` on a 288 px element makes the backing
  store wider than its box, `width: 100%` scales it back, and every horizontal coordinate is off by
  that ratio — ruler, track and gene models each by the same amount, so nothing looks broken. This
  is the trap the expression page already documents, reintroduced and caught by asserting the
  backing store matches the box at 320/390/760/**1043**/1440.

- **The letter view uses `LOGO_GLYPHS` through the canonical transform, not `fillText`.** Two
  failures in one: font-size scales width with height, so it stops being a logo; and clamping the
  size to keep letters legible flattens the encoding away entirely. A monospace `T` stretched 13:1
  (8 px wide, 110 px tall) also renders as a lollipop because its stem is a hairline — DejaVu Bold's
  is not, which is why the paper uses it. `new Path2D(LOGO_GLYPHS[b])` with
  `translate(centre, baseline); scale(colW * LOGO_GLOBSCALE, -sy)` is the same transform both SVG
  logos on the site use.

- **The overview strip is on a DIFFERENT ruler from the plot, and says so on its face.** The main
  track's 0–2 axis must never rescale — comparability is the whole point of information content —
  but a 4,096 bp bin mean spans 0.102 to 0.408 across the genome (p1–p99), which on a 0–2 axis is a
  featureless 10% band. The strip is fixed at 0–0.5 bits, so chromosomes still compare with each
  other, and the caption prints the range.

- **`drawGeneRows` gained `labelMinPx` and a collision check, because a browser has no "own" gene.**
  The two fixed-window pages label exactly one; a browser has no subject and 837 names on chrIV is
  spaghetti. Width is the self-limiting rule, and a label that would overrun the next feature on the
  same row is suppressed — computed from `nextStart`, one backwards pass. A label clamped back
  inside the plot gets a background chip (`colours.bg`, optional, so the other two pages are
  unchanged) or it lands unreadable on its own gene bar. At 100 kb none of the 74 genes has room,
  so the names move to the **hover readout** instead of being lost.

- **`chrM` in the UCSC FASTA is `chrmt` in the SGD GFF.** Without `GFF_ALIAS` the mitochondrial
  chromosome silently gets zero genes, and an empty gene track reads as a rendering bug rather than
  a naming mismatch.

- **The four-way distribution stays on the 23 primary regions.** Genome-wide it would be 48.6 M
  values; the browser ships one number a base and says so. The language-model page's per-region link
  is **derived** from `locus.start` plus the feature's window-relative span, so the link and the
  panel beside it cannot disagree about where a region is.

- **A `bare` page's controller LEAKS its document-level listeners, and the mount guard cannot see
  it.** The host is destroyed on every navigation away and rebuilt on the way back, so `mount` runs
  `initGenomeBrowser` again — and `dataset.gbBound` only stops a double-bind on the *same* element.
  The previous controller's `khc:theme-change`, `resize` and `hashchange` listeners keep firing into
  a closure holding a detached canvas: measured, **10 canvases repainted on one theme-change after
  four round trips** where one controller repaints two. `selfRemoving` checks `host.isConnected` at
  fire time, which is self-cleaning and needs no lifecycle hook — there is nothing to unregister
  from `astro:page-load`. This is the counterpart to the `transition:persist` note above: same
  cause (a bare page destroys the element), opposite symptom (there the script keeps a dead
  reference, here the listener outlives the element).

- **`page.goto` and `window.location.href` are FULL PAGE LOADS, so a navigation test built on
  either tests nothing.** Both tear down the whole JS context, so nothing can leak across them and
  the check passes against code that could not survive a real ClientRouter navigation.
  `auditNavigation` had been documented as "a client-side navigation round trip" and built on
  `page.goto` for an unknown length of time; the first version of the genome leak check made the
  same mistake and returned a confident PASS against a **deliberately reintroduced** leak. Click the
  link, and count `load` events so the check fails loudly if a route ever gains `data-astro-reload`
  rather than quietly going back to testing nothing. The lab routes carry no `data-astro-reload`,
  so a click there really is client-side.

- **"Fourteen windows" was written into prose in four places and the set had grown to 23** — two of
  them within a screen of a table headed *Constraint across all twenty-three windows* and a row
  reading *23 of 23*. All four now derive the count from `shorkieLoci.json`. Six more remain on
  `shorkie.astro`, where each is a claim about what a particular measurement run covered rather than
  about the shipped set, and needs its provenance checked before it is touched.

### The Live Variant Playground (`/shorkie-lab/shorkie/`, formerly `/variant-playground/`)

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

#### The page's spine: one selection, one axis, five acts

- **One control per piece of state.** `data-vp-anchor` and `data-vp-region` both wrote `tracedBins`
  from different paths; the sticky `.vp-nav` now owns locus and region and every panel carries a
  read-only `[data-vp-trace-context]` line instead. The gate asserts there is exactly **one**
  region selector on the page and that the context lines agree with the bar.
- **`position: sticky` resolves against `.vp-scroll`, not the document.** This is a `bare` page, so
  html/body are pinned and the inner pane is what scrolls — a bar placed outside it does not stick.
- **The focus band is drawn by one helper on every full-window track** — coverage SVG, attribution,
  the four method tracks and the annotation — and each publishes it as `data-vp-focus` so the gate
  can assert they agree. Every one of them is also a drag handle (`bindFocusDrag`, idempotent via a
  dataset flag). The zoomed logos show 150 bp of 16,384, **0.9% of the axis above them**, and
  nothing marked which 0.9% before this.
- **Every banded track must repaint when the band moves.** `setLogoWindow` calls all four; missing
  one leaves a band pointing at a stretch the panel below is no longer showing.
- **The annotation belongs above the zoom it contextualises.** The stack reads prediction →
  attribution → methods → evidence → zoom. Its gene lane uses `drawGeneRowsCanvas`, the same
  renderer and the same `geneTrackShapes` as the coverage plot, so the two cannot disagree about
  where an intron is; the plain rectangles it used before painted over every one of them.
- **A bare relevance number in arbitrary units is unreadable.** Stage relevance spanned 13.9 to
  0.0486 with no units; it is now a share of the region's total, with the raw mean on the `title`.
- **A profile normalised to its own peak cannot show concentration.** Attention rollout now draws
  the uniform line at **1/128 = 0.0078** and says how many times it the peak reaches.
- **An edit that asserts twice writes nothing if the second assertion fails.** A Python patch with
  two `assert ... in t` and one `write_text` at the end silently rolled back the first replacement
  when the second missed — the coverage SVG went unbanded and only a `data-vp-focus` probe caught
  it. Write each replacement to disk, or assert everything before replacing anything.

- **The "shared axis" was not shared, and the gate could not see it.** Every SVG track drew into
  `viewBox="0 0 1000 H"`, so `PLOT.left = 46` meant *4.6% of the rendered width*, while every canvas
  used the same constant as *46 CSS pixels*. They coincide only at a container of exactly 1,000 px:
  measured, **+20.2 px at 1440, +4.6 at 1100, −11.0 at 760, −31.3 at 320**, with the **sign flipping
  at ~1,043**. The focus band on the coverage curve sat at a different x from the identical band on
  the methods below it, at every width but one. **The gate compared each track's `data-vp-focus`
  string** — intent, never geometry — so it passed for a whole round.
- **Every SVG track now takes its viewBox width from `clientWidth`**, so one user unit is one CSS
  pixel everywhere. Verified: bp 8,192 lands within **0.01 px** across all four full-window tracks at
  320/390/760/1043/1440, and `audit:playground` asserts it at those five widths — **1,043 is in the
  list deliberately**, because that is where the bug is invisible.
- **Do not clamp `svgWidth` to a minimum.** A 320 floor on a 288 px element makes the viewBox scale
  down again and reintroduces the offset it exists to remove — measured, 3.4 px.
- **A pixel viewBox makes SVG label text absolute, and that is a real visual change.** Under a
  1000-unit viewBox `font-size: 10px` was interpreted in user units, so labels silently grew with
  the viewport (14.4 px at a 1440 container). At a true 10 px the annotated logo's caption clipped
  at 320 and its eight ~9-character kb labels smeared into each other. Tick **count** now comes from
  the available width (`inner / 74`) and the caption picks the widest of three tiers by
  `measureText`.
- **There was no resize handler at all.** Canvases were sized once from `clientWidth` and then
  stretched by `width: 100%`, so every raster on the page had always been drawn at the wrong
  resolution after a window resize. One debounced listener now redraws the tracks — guarded on
  *width* only, since a height change does not move the horizontal axis.
- **The zoom lives in the same panel as the tracks**, under a lens connector whose edges leave the
  focus band and splay to the zoom's full width. `renderSeqLogo` and `data-vp-seq-logo` are gone —
  it drew strictly less than the annotated logo of the same window — and the page is four acts.

#### The biology act, and a claim that had to be corrected

- **"The strongest knockout is the textbook regulator" was too strong, and was an artefact of the
  sort order.** Ranked by |effect| the winner is a known regulator in most windows — RAP1 at TDH3
  and PDC1, TYE7 at PGK1, FHL1 at RPL26A, GAL80 at GAL1, GAL4 at GAL3 — and at GAL1 the **six**
  largest sites are all GAL4 or GAL80. But at HOP2 and ACT1 it is STE12, and at KRE33 and DTD1 it is
  not a characterised regulator at all. The earlier "GAL4 at GAL1" came from a **most-negative**
  sort; by magnitude that site is GAL80 at **+0.1059**. Sign is not reliable either: the GAL80
  repressor site correctly comes out positive, but so do several activator sites.
- **The cross-locus medians are a much stronger statement than any single locus.** Across fourteen
  windows: **intron 3.78×**, regulatory 1.76×, **TFBS ChIP-supported 1.73× > conserved-only 1.43× >
  PWM 1.14×** (monotone), CDS **0.84×**, and tRNA 0.32× / LTR 0.37× / ARS 0.48× all strongly
  depleted. The single-locus 3.26× quoted earlier is one window, not the result.
- **Attribution peaks upstream of the TSS**: **1.40×** a gene's own mean base in the 240 bp before
  the start against **0.94×** in the 240 bp inside it, over 113 genes. Align on the *direction of
  transcription* — `txStart` on +, `txEnd` on −, minus-strand profiles reversed — or the average
  puts promoters against terminators and flattens into something that looks like a real null.
- **`verify_pipeline` §3g re-derives the summary from the packs** rather than trusting it, and it
  immediately earned that: the page computed the TSS ratio with `250 / 40 = 6.25` bins, slicing 6
  elements and dividing by 6.25, and printed **1.54×** where whole-bin arithmetic gives **1.40×**.
  A summary is a *view* of numbers that exist per locus; check it against them.
- **A caption that promises a mark the drawing does not contain is the same defect as a wrong
  number.** The class figure's caption said "the dots are the individual windows" before any dots
  were drawn.

#### Full-window mutagenesis (all 16,384 bp, both strands, all fourteen)

- **The packs are now the whole window**, `[4 x 16,384]` per locus, rc-averaged logSED on the
  window's own gene body, and mutagenesis is the page's PRIMARY logo with gradient x input demoted.
  Before this, the ISM pack covered ~500 bp and the logo opened **1,100-1,600 bp away from it** on
  TDH3 and ACT1 — it drew **zero letters** on those loci. All fourteen now draw 147-150.

- **The old 500 bp window was well chosen and still missed a great deal.** It is 3.1% of the
  sequence and holds a median **17.6%** of total |logSED| — 5.7x enriched, so the promoter really is
  where the signal is. But **4 of 14 loci have their strongest substitution outside it**: TDH3
  (-955 from the TSS), ACT1 (-1,212), RPL26A (+442) and HOP2, whose +1.3815 is the largest effect in
  the whole set and sat outside its own *published* window.

- **The sign of the strongest substitution is predicted by expression state in 14/14 loci, and it is
  not a scale artefact.** The three genes repressed in the T0 (glucose, vegetative) baseline —
  HOP2, GAL3, GAL1 — are the only three with a POSITIVE strongest substitution (+1.38, +1.12, +0.78)
  and 20-33 of their top 40 positive; the other eleven are all negative with 0-11 of 40 positive.
  The obvious objection is baseline: logSED is a log ratio, and those three have the lowest reference
  coverage (77, 213, 502 against up to 48,547), where a given absolute change moves logSED **161x**
  more than at TDH3. **The data answers it**: DTD1 (baseline 299) and MMS2 (556) sit in the same
  range as GAL3 (213) and GAL1 (502) and are firmly NEGATIVE. Two pairs at matched baselines with
  opposite signs — the sign tracks regulation, not scale.

- **The relative and absolute orderings are inverted, and both are true.** As a fraction of its own
  baseline the biggest lever is HOP2's **+160%**; in absolute predicted coverage HOP2's best
  substitution is worth **+125** while PDC1's costs **-8,841**, seventy times more. logSED is
  deliberately a ratio — that is what makes a silent promoter and a maximal one comparable — so
  quote it as one, and never say "a stronger effect" without saying stronger *relative to what*.

- **DTD1's splice donor now dominates the entire window.** Across all 16,384 positions the most
  damaging substitution is exactly `exons[0][1]` (bp 8165), the intron opens `GTATGT`, and the
  donor's six bases take ranks **1, 2, 3, 4, 5, 9 of 16,384**. `verify_pipeline` asserted this over
  197 bp before; it is the same assertion over 83x the sequence.

- **A packing criterion chosen on ABSOLUTE error picks linear and destroys the quiet 62% of a full
  window.** Absolute saliency error is set by the handful of loud splice sites, which linear uint8
  serves perfectly — while giving the MEDIAN cell **0.54 quantisation levels**. The criterion is now
  the error relative to a **local** max over the logo's own 150 bp window, which is the scale a
  reader actually sees, and all fourteen loci choose **log** at 2.2-3.3% local error. Validated by
  reproducing the mistake on a synthetic heavy-tailed plane: the old criterion picks linear at 41%
  local error, the new one picks log at 2.6%.

- **Keep the raw float plane.** The first run kept only its uint8 pack, the packing space turned out
  to be wrong, and there was no way back except a re-run. `_scratch/ism-raw/<id>-ism.npy` (gitignored)
  plus `make_ism.py --repack` now re-quantises all fourteen in seconds with no model and no GPU —
  which is also how the shipped metadata comes from the current code rather than from whatever
  revision happened to generate each locus.

- **Resumability has to match the interruption granularity.** Per-LOCUS resume was right until three
  interruptions each discarded a partly finished locus at ~17 min a piece. A checkpoint every 200
  batches (~2.2 min) written atomically makes a restart cost minutes. **`np.savez` APPENDS `.npz`
  when the name lacks it**, so a `.npz.tmp` temp file is written as `.npz.tmp.npz` and the rename
  fails on a path that never existed — name the temp file `*.tmp.npz`.

- **`nohup`-style exit codes lie, again.** A run that died on that `np.savez` bug was reported by the
  task notification as "completed (exit code 0)" — the shell wrapper succeeded, the work did not.
  The log said `exit: 1`. **Confirm the verdict line, never the exit code.**

- **A cost is a property of the harness until proven otherwise, but so is the unit.** The recorded
  refusal was "104 ms a pass, 1.4 h a locus, 39.6 h for all fourteen" — and the last two are
  different bases (1.4 h is ONE strand; 14 x 1.4 = 19.6, not 39.6). The replacement figure inherited
  the confusion: 10.47 ms was quoted "a substitution" when it is **a forward pass**, and a
  substitution costs two because every published run is rc-averaged. Measured end to end:
  **11.9 ms a pass, 23.8 ms a substitution, 19.5 min a locus, 4.6 h for fourteen** (4.1 h on the six
  loci that ran with nothing else on the machine).

- **The ISM row answers a different question from the four beside it.** Mutagenesis is scored on the
  window's own gene body; gradient x input, IG, rollout and occlusion are conditioned on the traced
  region. On the shared strip they therefore peak over different parts of the axis, so the row's
  label now names its scoring target. Method-strip notes also drop trailing clauses until they fit —
  a right-aligned note and a left-aligned label on one baseline simply overlap at 320px, and a canvas
  has no `overflow` to report it.

#### Motif framing, and what the paper actually does

- **Every derived splice/codon box was drawn as `[at − 3, at + 3)`** — one fixed 6 bp window
  regardless of the motif. On DTD1 that framed **AAGGTA** where the donor motif is **GTATGT** three
  bases to the right; it put a 6 bp box on a 2 bp acceptor and a 6 bp box on a 3 bp start codon.
  `spliceAnnotations` now returns a **span** per landmark — donor 6, acceptor 2, codons 3, branch
  point 7 — mirrored on the minus strand, because the motif runs the other way from its anchor
  there. A test decodes the shipped sequence inside every drawn span across all windows and both
  strands; that is the check that would have caught the shift, and a coordinate check would not.

- **`norm()` collapsed "5′ splice site" and "3′ splice site" to the same key**
  (`replace(/[^a-z]/g,'')` ate the digit), so a locus with a scanned 5′ site silently *lost* its 3′
  box — RPL26A lost one and HOP2, with two introns, lost the second intron's pair. Keep the digit,
  and de-duplicate on label **and position**, since two introns legitimately produce two donors.

- **The curated TFBS boxes were never shifted, and that took measuring to establish.** Across the
  shipped windows only **22.8% of 670** curated calls contain their factor's canonical consensus —
  but where the consensus *is* present it sits at offset **0** (ABF1 16/16, REB1 8/10, UME6 4/6).
  MacIsaac/Harbison calls are PWM-plus-conservation calls, not consensus matches, so a box labelled
  `REB1✓` is exactly where the database says and usually over letters that do not spell Reb1. That
  is a labelling problem, not a coordinate one. **Boxes are now drawn on the MATCH** (solid, with
  the paper's reference-DB readout beneath) or on the **call** (hollow, labelled a region) — 17
  solid and 66 hollow across the fourteen, with **0 solid boxes failing to contain their consensus**.

- **`src/data/shorkieMotifs.json` is the paper's own dictionary** (Figure 4H plus S19/S20): Rap1,
  Fhl1, Sfp1.1, TATA, Reb1, Abf1, Tbf1.1, Cbf1, Ume6.2, Dot6p, PAC, RRPE and the landmarks. It
  exists because a consensus read off a figure is a claim that must be checkable — and the first
  thing it caught was that **the site carried Fhl1 as `GTAAACA`, which is not the paper's Fhl1
  motif**: the real one (`ATGTACGGAT`) sits at 8080 in the RPL26A window, 27 bp from the box the
  site was drawing, and Figure S19B puts its FHL1 box at the former.

- **`motifMatch` needs a strand mode, and the default is the dangerous one.** A TF site is
  strand-agnostic — Rap1 reads on the reverse strand at exactly the base where Sfp1.1 reads forward,
  in the promoter S19B boxes — but a codon or splice site is read in the gene's own frame.
  `TTTATA` contains a reverse TATA box and `CCCTAACCC` a reverse `TAG`: both real, both the wrong
  answer for a codon. Three of the first draft's test failures were this, and in every case the
  assertion was wrong and the code right.

- **A clipped box must still report the motif's true span.** The drawn rectangle is clipped to the
  visible window, and reporting the clipped coordinates described a 13 bp Abf1 site as 9 bp purely
  because the pan cut it off. `data-vp-motif-span` carries the unclipped span; the reference-DB
  readout is suppressed when clipped rather than showing a partial motif.

- **Figure 4's ISM is a SINGLE fold, `f0c0`** (`fig4_common.py:221` reads
  `.../f0c0/part{N}/scores.h5`), which is what this site runs. The **8-fold ensemble**
  (`load_ensemble(num_folds=8)`, `ensemble_predict`) belongs to **Figure 7's eQTL analysis**, not to
  the logos this page reproduces — running it here would deviate from the figure, not match it.

- **The paper's Figure 4 logSED and this site's are different formulas that agree.** Figure 4 uses
  `logSED[idx,:,:,T0].mean(axis=-1)` — the mean of *per-track* logSED — while the site computes
  logSED of the *track-averaged* coverage (`ensemble.py:97`). Mean of logs ≠ log of mean, so it was
  measured rather than assumed: on 240 real substitutions in TDH3's promoter they agree to
  **r = 0.999987**, max |diff| **0.00033**, same argmax, scale ratio 1.005 — far below the packs'
  own quantisation. No re-run. The T0 tracks are highly correlated, which is why Jensen's gap is
  negligible here; it would not be for a heterogeneous track set.

- **The paper's own ISM arrays cannot be diffed against on this machine** — `results.ism_scores`
  resolves to `/home/kchao10/...`, absent — so fidelity rests on the recipe and the published
  figure, not on a numeric comparison. Say that rather than implying a stronger check was made.

- **`add_loci.py` derives a locus rather than trusting typed coordinates.** Only the gene name and
  the figure's `chrN:start-end` are input; sequence, gene models and bin ranges come from sacCer3
  and the SGD GFF. Three rules were **derived from the fourteen shipped windows and reproduce all
  fourteen exactly**: the published window sits centred (`seqStart = (16384 − L) // 2`, with L the
  inclusive length — this holds for DTD1's 197 and HOP2's 777, not just 501); `txStart`/`txEnd` are
  the **CDS extent**, not the SGD gene record, which includes UTRs; and a gene is kept when its CDS
  overlaps the model's **cropped interior** `[1024, 15360)`, which is why a gene with a negative
  txStart is kept while one whose coding span sits wholly in the flank is not.

- **SGD parents a CDS to every isoform, comma-separated** — `Parent=YDL082W_id002,YDL082W_id001`.
  Stripping a suffix off the whole string leaves `YDL082W_id002,YDL082W`, which matches no gene, so
  **no CDS attached to anything and every gene became a single exon with no introns**. The window
  and sequence checks all passed while this was true; only comparing gene models caught it. Split on
  the comma first, and make the control compare models rather than coordinates.

#### The yeast annotation layer

- **`make_annotations.py` refuses to write unless the window IS sacCer3 at its stated coordinates.**
  Every offset in `public/vp-data/<id>-ann.json` is a subtraction from the locus `start`, so if the
  sequence the model ran on is not the sequence at those coordinates, every feature is wrong by an
  unknown amount and looks perfectly plausible. All 14 windows are byte-identical, verified.
- **Two sources, two conventions.** SGD's GFF3 is **1-based inclusive**; UCSC's API is **0-based
  half-open**. Confusing them shifts every feature by one, which is invisible on a 16 kb drawing and
  fatal to a motif coordinate. The script cross-checks its own conversion against the gene models
  already in `shorkieLoci.json` and **refuses to write on a single mismatch**.
- **That cross-check found a real defect on its first run: HOP2's shipped gene model was one intron
  short.** SGD gives `YGL033W` three CDS exons and two introns; the shipped model had two exons and
  one, ending 50 bp early, so its second intron (window 8491–8553) was drawn as coding. It was the
  only one of 112 CDS spans that disagreed — a systematic off-by-one would have moved all 112 by 1,
  which is how the shape of the failure identified it as stale annotation rather than bad
  arithmetic. Fixing it moved HOP2's anchor bins 423–470 → 423–473, so its attribution and
  mutagenesis packs were regenerated.
- **A cross-check that examines nothing must fail, not pass.** That same check first reported
  `0/0` and was green: SGD names a CDS `YGR189C_CDS` and parents it to `YGR189C_id001`, so the name
  join matched nothing. `systematic_id` strips those suffixes and the script now stops on zero
  comparisons.
- **Curated TFBS locations are reachable, but not from their original hosts.** MacIsaac 2006's MIT
  page is a 404 and ScerTF does not respond; **UCSC mirrors the same work for sacCer3**. Per 16 kb
  window: `transRegCode` **467** conserved calls of which **53 carry ChIP evidence**, `oreganno`
  **52** curated regions, `jaspar2026` **23,071** PWM hits — 1.4 per base.
- **That 23,071 is the argument for the threshold and belongs on the face of the page.** At UCSC
  score ≥ 500 it is 67 a window; ≥ 600 is 7. The three evidence tiers are drawn differently — solid
  for ChIP-supported, hollow for conserved-only, hairline for a PWM match — because they are three
  different claims and merging them into one "motif" layer would drown the strong one in the weak.
- **The enrichment table measures every tier whatever the canvas is drawing.** Tying it to the
  drawing toggles hid the three-tier comparison, which is the finding: gradient × input enriches
  **3.26×** on ChIP-supported sites against **1.25×** conserved-only and **1.49×** PWM. The evidence
  tier predicts where the model looks.
- **The null is a circular shift, not a resample.** Rotation preserves the feature count, every
  length and every gap, and destroys only alignment. Resampling positions compares against an
  annotation that does not resemble the real one and calls almost everything significant. Offsets
  are deterministic (evenly spaced, zero excluded) so a published ratio is reproducible.
- **Pool an annotation mask by MEAN, never by max.** A 7 bp site covers 5 % of a 128 bp cell; a max
  marks the whole cell annotated and makes every class identical once pooled — numbers that mean
  nothing while looking exactly like numbers that do.
- **The knockout sweep tends to find a gene's known regulator, but "the strongest knockout is the
  textbook regulator" is TOO STRONG and was an artefact of sorting.** Ranked by |effect| across the
  fourteen: **RAP1** at TDH3 and PDC1, **TYE7** at PGK1 (all glycolytic activators), **FHL1** at
  RPL26A, **GAL80** at GAL1 and **GAL4** at GAL3. At GAL1 the six largest sites are *all* GAL4 or
  GAL80 — activator and repressor of that regulon — which is the cleanest case. But at HOP2 and ACT1
  the winner is STE12, and at KRE33 and DTD1 it is not a characterised regulator at all. An earlier
  round claimed "GAL4 at GAL1" from a **most-negative** sort; by magnitude it is GAL80 at +0.1059.
  **Sign is not reliable**: the GAL80 repressor site correctly comes out positive, but so do several
  activator sites.
- **Report a knockout as a mean over k shuffles with its spread.** One shuffle is one draw, and the
  page had been presenting a single draw as a measurement. The bar is drawn from effect ÷ sd, but
  the table **sorts by magnitude** — ranking by the ratio put a −0.0003 site above a −0.0138 one and
  then called it "strongest", which is two definitions of the word in one panel.
- **A low-complexity site cannot be knocked out by shuffling.** `CCACCC` is five Cs and an A and has
  almost no distinct permutations, so repeated shuffles coincide and the sd is legitimately zero.
  The sweep records how many **distinct** permutations it actually produced, and verify_pipeline
  fails a zero spread only when there was more than one — "unshuffleable" and "the model ignores it"
  are different findings that produce the same number.
- **`verify_pipeline.py` §3d checks the annotation against the SEQUENCE, not against its source.**
  Every complete CDS must start with ATG on its own strand (**113/113**) and every CDS-internal
  intron must read GT..AG (**9/9**). Those are properties of the sequence, so they cannot be
  satisfied by a coordinate system that merely agrees with itself.
- **The annotation ships per locus, not bundled.** 14 files × 84 KB raw is 1.14 MB, and
  `src/data/*.json` goes into the page chunk while `public/vp-data/` is fetched only for the locus
  being viewed. Gzipped it is **7 KB a locus**.
- **One shared window drives every letter view.** A logo of the whole window is not a drawing that
  exists — 16,384 bases across ~1,280 px is **0.078 px per base** — so the full-window strip stays a
  signal and letters live in a zoom. `setLogoWindow` is the single setter; the brush, the pan
  slider, a motif click and a traced region all go through it, so two panels can never show letters
  for different stretches under one heading.
- **Only gradient × input and integrated gradients are per-base.** Attention rollout resolves 128 bp
  and occlusion 64 bp, so they are drawn as bands at their real step rather than stretched into
  letters they cannot support. `MethodTrack.resolutionBp` carries this as a **number** — sniffing
  the `note` string for "single base" marked IG coarse, because its note is its completeness check.

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

- **"Full-window mutagenesis is not affordable" was wrong by an order of magnitude, and the way it
  was wrong is the lesson.** The recorded refusal — 104 ms a pass, **1.4 h a locus, 39.6 h for all
  fourteen** (and those two are not the same basis: 1.4 h is ONE strand, 39.6 h is fourteen loci ×
  BOTH; 14 × 1.4 = 19.6. Both numbers right, the pair wrong) — was measured through *onnxruntime on the CPU*, on a graph whose batch axis is pinned
  at `[1, 16384, 170]`. It therefore baked in both the slowest engine available and the
  impossibility of batching, and then read as a property of the model. Neither limit belongs to the
  model: the PyTorch port in the same directory has no fixed batch axis, and the machine has a GPU.
  Re-measured on an M1 Pro: **104 → 127.5 (torch CPU) → 23.1 (MPS b1) → 13.1 (MPS b32) → 10.47
  ms per FORWARD PASS** with the head sliced to the 384 T0 columns — not per substitution, which
  costs two passes because every published run is rc-averaged. The real fourteen-locus run measured
  **11.9 ms a pass / 23.8 ms a substitution / 19.5 min a locus / 4.6 h total**; the six loci that ran
  with nothing else on the machine averaged 10.7 ms and 17.5 min, i.e. 4.1 h, so the benchmark was
  right and the rest was contention from concurrent builds and Playwright audits. **Quote the rate
  measured under the conditions you will run in.**** Mutagenesis is now the page's primary logo and a full-window method track.
  **Before quoting a cost as a reason not to do something, check whether it is a cost of the model
  or of the harness it was measured through.**
- **MPS is not a precision compromise here.** Against the CPU on the same input: max relative
  **6.6e-07**, same argmax bin — three orders of magnitude tighter than the fp16 ONNX graph
  (4.98e-04) the earlier packs were built from. Switching engines *improved* the numbers.
- **Slicing the head to the tracks actually scored is free accuracy and 20 % speed.** The head is
  `Linear(384 → 5,215)` but only the 384 `_T0_` columns are ever read; softplus is elementwise, so
  the sliced output is identical. It also removes the `(tracks, bins)` indexing trap that once
  shipped in `make_ism.py` — after slicing, every column is a T0 track and no fancy indexing is
  needed at all.
- **A mutant differs from the reference in four floats.** Allocate the batch on the device once and
  mutate in place; rebuilding a `[32, 16384, 170]` batch is 356 MB of copying per batch, about as
  expensive as the forward pass it feeds. The reverse strand is kept as its own persistent tensor
  and edited at the mirrored position with the complemented base, which is exact and avoids
  reverse-complementing 32 windows a batch.
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

#### Constructive interpretability: sequence that was BUILT rather than found

Everything else on this page perturbs a real yeast window. Three generators start from
dinucleotide-shuffled background and add one thing at a time, which is how a **sufficiency** claim
is made rather than a necessity one — `make_receptive.py`, `make_gia.py`, `make_spacing.py`, all
forward passes, all minutes. `shorkieConstructive.ts` draws them; the receptive panel closes act 2
and the other two open act 4.

- **The effective receptive field is a property of the GENE, not of the model.** The architecture
  reaches all 16,384 bp, but "can see" and "depends on" are different claims and only the second is
  measurable. Keep a centred core, shuffle the flanks, grow the core: the median window is settled
  by **±2,048 bp** of ±8,192, the six constitutive glycolytic genes (TDH3, PGK1, ACT1, ADH1, FBA1,
  PDC1) by **±1 kb**, and **GAL1 needs the entire window**. That is the practical scope of every
  attribution on the page. Two controls are built in: at the largest radius the window is entirely
  real so that point must reproduce the full-context prediction (it does, at all 23), and
  convergence requires every *larger* radius to stay inside the ±5% band too.
- **Shuffle, never zero — and dinucleotide, never mononucleotide.** Zeroing is what occlusion does
  and is indistinguishable from a run of N, so it measures out-of-distribution input rather than
  context. Yeast promoters carry heavy dinucleotide bias (poly(dA:dT) above all), so a
  mononucleotide shuffle destroys that as well. `dinuc_shuffle` is Altschul-Erikson, and the script
  refuses to run unless all sixteen dinucleotide counts survive exactly on a 4,000 bp probe.
- **NECESSARY and SUFFICIENT are different claims, and the two-by-two is the finding.** The knockout
  sweep measures necessity in context; GIA (Koo & Ploenzke 2021) implants a consensus into 200
  shuffled backgrounds. **Rap1 (23 swept sites) and Reb1 (14) are necessary and NOT sufficient** —
  z = 0.2 against their own scrambles — which is what yeast's two general regulatory factors should
  look like: they work through the promoter around them. Ume6 is the mirror, strongly sufficient and
  barely necessary in 23 mostly-constitutive windows. The model also recovers the biology unaided:
  the three strongest activators are **Cbf1, Phd1 and Tye7, all E-box motifs containing CACGTG**,
  and the strongest repressors are Ume6's URS1 and the Dot6/PAC pair.
- **A palindromic consensus is a free correctness check on the whole implantation path.** CACGTG is
  its own reverse complement, so the forward and reverse arms implant an identical string and MUST
  score identically; `make_gia.py` raises if they do not. It is the only palindrome in the
  dictionary and carries no degenerate codes, so it cannot fire spuriously.
- **Poly(dA:dT) has no scramble.** Every permutation of `AAAAAAAAAA` is itself, so the composition
  control is unavailable and a zero spread is not a measurement. Count the DISTINCT scrambles
  achieved and report "degenerate scramble" — same family as the unshuffleable knockout site.
- **Arms that share a background are PAIRED**, so the margin's error bar is the sd of the
  per-background differences, not `sd(forward)/√n`, which discards the pairing and is much the
  larger number. (The first run used the unpaired form *and* 120 backgrounds and called Sfp1 a
  composition effect where the final run makes it sufficient at z = 2.5 — two changes at once, so
  that flip is not evidence about the pairing alone.)
- **There is no helical grammar, and the constructive test agrees with the Hessian.** Two motifs
  walked apart 4–200 bp in four orientations: median in-phase / anti-phase ratio **1.094**, spread
  0.74–1.37 in *both* directions. **All eighteen top periods across six pairs are harmonics of the
  scan window** (n/2 … n/9), and 10.5 bp appears nowhere. What is real is short-range and unphased —
  two Cbf1 E-boxes 6 bp apart interact at 0.209 log₂, Reb1→TATA peaks at 31 bp.
- **But n/6 is 10.17 bp, within 0.33 bp of one helical turn.** A 61-point periodogram therefore
  *cannot* separate helical phasing from its own sixth harmonic, which is why the explicit
  in-phase/anti-phase contrast is the primary reading and the spectrum is secondary. Record which
  harmonics fall near the period being tested rather than assuming they do not.
- **Measure the moving motif's solo effect at EVERY separation.** A motif's effect varies with
  position for reasons unrelated to the other motif; subtracting one number folds that positional
  dependence into the "interaction" and manufactures the structure being looked for.
- **Both scripts separate their analysis from their sweep** — `--join-only` and `--reanalyse` — so
  the two-by-two and the phasing read can be improved without repeating 11,600 and 25,448 forward
  passes.

#### Three ways a drawing was wrong while every gate was green

All four defects in these panels were found by SCREENSHOTTING them, after `astro check`, 3,816
tests and the full rendering gate had passed.

- **A signed axis's ends are its SIGN, not its magnitude.** The two-by-two plots the signed margin
  over the scramble, so a strongly repressing motif sits at the bottom — where the label read "not
  sufficient". Ume6 was filed under the exact opposite of what the paragraph beside it said. Ends now
  read activates / no effect / represses, with sufficiency carried by the marker fill.
- **An axis linear in INDEX is not linear in its units** unless the samples are evenly spaced. The
  spacing scan steps 1 bp to 64 and 5 bp beyond, so the fine half took 69% of the width, the tick
  reading "50" sat at mid-width, and the 10.5 bp guides came out unevenly spaced — defeating the one
  reading the panel exists for.
- **A generated ranking will mix in a category the sentence does not explain.** The repressor list
  named three motifs and the prose explained two, because a splice signal had sorted into a
  transcription-factor ranking. Held out separately they are a finding of their own: a branch point
  implanted alone is the most repressing element in the set (−0.133) while a 5′ splice site raises
  coverage (+0.035).
- **Do not put a label in a canvas's top rows on this page.** The sticky control bar covers roughly
  the first 120 px of whatever is scrolled under it.

#### Removing a dead function is not a brace count

Archiving last round left ~36 unused identifiers in `variantPlayground.ts` (247 lines, and 117
repo-wide `ts(6133)` hints down to 85); clearing them took three attempts and both failures are
worth keeping.

- **Brace-matching from the first `{` after the signature cuts the RETURN TYPE, not the body.**
  `motifFor` ends `: { id: string; … } | undefined {` and `seqWindow` ends
  `: { seq: string; origin: number } {`. The rule that works: walk the signature parens to their
  close, then keep matching `{…}` groups while the next non-whitespace continues a type (`|`, `&`)
  or opens another brace — the body is the group after which nothing does.
- **A whole-file balance assertion does NOT catch it.** A mis-chosen span with equal braces is still
  balanced. What caught it was `astro check`.
- **Read the SYNTAX errors first; the null cascade is noise.** One `ts(1005)` and its `ts(1109)`
  produced 26 spurious `ts(18047)` "possibly null" errors — and the null ones printed first, so the
  two that said what was actually wrong were at the bottom of a 32-error list.
- **A naive paren counter reads −2 on the untouched file**, because it does not model regex
  literals. Assert braces and brackets stay exactly zero and the paren count does not MOVE.
- **A variable that is only ever ASSIGNED reads as unused.** Deleting `showTruth`'s declaration
  broke an assignment in a handler whose markup (`data-vp-truth`) does not exist on the page at all —
  so the whole handler was dead too. Check what references a "unused" binding before removing it.
- **Absorb the doc comment, and back `start` up to the start of its line**, or the comment's own
  indentation survives and the next declaration gains two spaces.


#### The page is a research plan now, and the coverage panel is one zoomable canvas

Eight numbered acts plus a reference appendix, each a real `<section class="vp-act">` with an
`<h2>`; panel titles are `<h3>`. The two five-questions-in-one-panel blocks were split so each
question is its own `.vp-panel`, and every analysis panel opens with `ShorkiePanelHead` —
**Question · Method · Cost · What would refute it**. `audit:playground` asserts all four are present
and non-trivial on every panel outside the reference act.

- **`data-shorkie-constructive` / `-frontier` go on each split panel, and that needed no script
  change.** Both controllers mount with `querySelectorAll` and read canvases through
  `host.querySelector`, which already tolerated a host owning one canvas of five — the
  receptive-field panel has always been exactly that. Six constructive hosts and five frontier
  hosts now.

- **ONE canvas draws coverage, every attribution method, three DNA logos, the sequence, the genes
  and the annotation.** `viewportLanes` (`src/lib/shorkieViewport.ts`, pure and tested) decides
  which lanes exist; `laneLayout` stacks them; `src/scripts/shorkieViewport.ts` draws them. That
  replaced four stacked elements — a coverage SVG, an attribution canvas, a method strip and an
  annotation canvas — each computing its own inset, and the disagreement they used to have is no
  longer expressible rather than merely policed.

- **`laneLayout` and `laneAt` in `genomeBrowser.ts` are GENERIC now** (`<T extends {height:number}>`,
  with the position fields split out as `LanePos`), so the viewport reuses the stacker without
  borrowing the browser's `LaneKind`. Its gap is **leading**, so `total` lands exactly on the last
  lane's content bottom — a test asserted a trailing gap and was itself the thing that was wrong.

- **The three logos do not draw the same number of letters, and that is the page's central claim.**
  Mutagenesis ships all four bases (4 × 16,384), so it stacks up to four a column. Gradient × input
  and integrated gradients both multiply by a ONE-HOT input, so they are identically zero at the
  three bases that are not there and draw exactly one — by construction, not by simplification.
  `drawLogoLane` returns `{letters, columns, colours, minPx, maxPx}` and the page publishes it as
  `data-vp-logo-detail`, because a canvas has no glyph elements and the SVG version's checks
  (one letter a column, the paper's four colours and nothing else, heights that vary) would
  otherwise stop being checked at all.

- **Their scoring targets differ too.** Mutagenesis is logSED on the window's own gene body and is
  unconditional; grad × input and IG are conditioned on the traced region and are per base **only**
  at one of the 9–12 shipped anchors. Otherwise grad × input falls back to 128 bp and IG has nothing
  to draw. Every lane carries its target and its fallback reason on its right.

- **Three gestures on one canvas, and they must not collapse.** Plain drag PANS; drag on the RULER
  selects a range and zooms to it; **shift-drag TRACES** the region every panel below is conditioned
  on. Losing the third to panning left the region `<select>` as the only way to condition twenty
  panels — the gate caught it as an empty `data-vp-trace-label`.

- **`setLogoWindow` carried a comment saying every band-carrying track repaints, and repainted
  none of them.** Four tracks drew the focus band; only `renderMethodLogos` and
  `renderNeuronClasses` were called. It survived because `[data-vp-track]` had a *second* pointer
  binding for `traceBins` that did call `refreshRegionViews`, so the one track anyone dragged
  happened to be right. Moot now — the band is the view.

- **The annotation lane must filter its features to the VIEW before packing rows.** Packing all 610
  of a locus's features while drawing the twenty on screen reserves the full-locus height at every
  zoom: at 20 bp that is an empty band hundreds of pixels tall under a lane label, which reads as a
  rendering failure rather than as "nothing is annotated here". The probe measurement and the real
  draw must pass the same range or the height is a lie.

- **A `dataset` tally is not prose.** `tfbs_chip 53` is a JSON key leaking into a readout, and the
  three TFBS tiers are three different claims about evidence. The readout names them; the gate reads
  `data-vp-annotation` as **JSON**, and parsing it as a `k:v,` list is how a real count of 53 came
  to read as zero.

- **Deleting a dead block swallowed three unrelated handlers.** Removing the `if (trackSvg)` drag
  block walked backwards past a doc comment to absorb it and took `occlNorm.change`,
  `spinBtn.click` and the `[data-vp-generows]` change handler with it. The gate saw only one of the
  three ("resume rotation did not restart the idle animation"). **The fix is to diff every
  `addEventListener` LINE against the previous revision, not to fix the one that failed** — and not
  by identifier either, because the third is written as a chained
  `host.querySelector(...)?.addEventListener` and an identifier-level regex misses it.

#### Three more interpretability methods, and two of their controls are the result

- **`make_patching.py` — causal tracing.** Corrupt the promoter by dinucleotide shuffle, restore the
  clean activations at one stage and one 512 bp band, measure recovery of `f_clean − f_corrupt`.
  19 stages × 32 bands × 22 windows, 346 s. Averaged over the windows, recovery **climbs through
  the encoder and decays through the transformer**: 0.434 at the stem → **0.546** at block7, a tie
  with attn_out1 at **0.543**, then monotonically down to **0.349** by attn_out8. Per window the
  peak sits in the encoder in **18 of 22** and is nearly total (median **96.5%**), while restoring
  one band at the bottleneck recovers a median of **3.9%**. The encoder localises and the
  transformer distributes; either claim alone is half the result.
  - **The mean grid's argmax and the per-locus argmax are different statistics**, and the figure
    draws the first while the prose was quoting the second. They agree here (block7), but the margin
    over attn_out1 is **0.003** — a tie, and drawn as one. A SCREENSHOT is what caught the mismatch
    between the drawing and the sentence beside it: the numbers were right and the sentence implied
    a separation the picture does not show.
  - **Patching a whole stage is degenerate**: everything downstream becomes the clean run's, so
    recovery is 1 at every depth. Restoring a BAND is what makes the question answerable.
  - **`shorkie_torch.forward` gained `patch_fn`**, called at every named activation, default `None`
    and a strict no-op. Patch at the point the activation is RECORDED, so a patched residual block
    feeds both its skip and the pooling below it.
  - `verify_pipeline.py` **§3h** re-checks all three FROM THEIR PACKS rather than by re-running the
    generators: the three patching controls per locus, `skipBypass` summing to 1 with the
    bottleneck's full recovery, each MoDISco consensus being its own PWM's argmax with its bits
    re-derived, and the dictionary being exactly k-sparse with the control reconstructing worse.
    19 checks.
  - **The obvious fourth control is not one, and it failed at 0.9663.** Restoring every position of
    a BOTTLENECK stage does not recover 1.0, because the U-Net skips carry `block1..7` straight to
    the decoder around the transformer — a clean residual stream still meets corrupted skips. That
    shortfall is a measurement (`skipBypass`, median **2.8%**) and is published rather than worked
    around. The three controls that DO hold are first-stage-all, last-stage-all and no-positions.
  - **The position axis differs by stage.** Conv stages are `[B, C, L]` and the transformer stages
    `[B, T, C]` — the residual stream is stored untransposed on purpose. Guessing one axis for both
    writes the patch into the channel axis: it broadcasts, completes, and every number is wrong.

- **`make_modisco.py` — TF-MoDISco in the small, and the control nearly matches.** 1,047 seqlets
  from the mutagenesis planes cluster into **3** patterns, all matching JASPAR; the identical
  pipeline on dinucleotide-shuffled sequence yields **2**, and both of those match too. Three
  against two is not a result. What separates them is sharpness (7.00 bits against 3.91) — but every
  pattern in both arms is AT-rich, and a dinucleotide shuffle preserves AT-richness by construction.
  **The honest statement is that at this threshold what clusters is composition, not syntax.**
  - **The threshold is set by the CONTROL, before either arm is clustered**: the 99.9th percentile of
    the shuffled arm's own pairwise-similarity distribution. Any clustering returns clusters and a
    lower correlation returns more, so picking one by eye and reporting the count is choosing the
    answer.
  - **A cluster's PWM must be counted from the bases its seqlets contain**, not taken as a softmax
    of mean-centred contributions. The first version produced **0.00-bit** patterns whose consensus
    was the argmax of noise — and they still matched JASPAR at r = 0.93, because Pearson normalises
    amplitude away. A high match r on a flat matrix is not a match.
  - A seqlet is a 4 × w mean-centred block, never a per-position score: clustering the score alone
    discards which base did the work, so `AAATTT` and `TTTAAA` would group together.

- **`make_sae.py` — a TopK sparse dictionary on the bottleneck.** 384 → 6,144 features, k = 32,
  unit-norm decoder columns, trained on bottleneck vectors swept from the genome. The control is
  the finding: the same architecture on **column-shuffled** activations — every channel's marginal
  distribution kept exactly, only the co-activation structure destroyed — reconstructs far worse.
  Measured over the whole genome (94,970 bottleneck vectors): **FVU 0.0194 against 0.3720**, a gap
  of 0.353, with all 6,144 features alive and mean L0 exactly 32. That gap is precisely what the
  model's own basis was spreading out.
  - **Keep the training set on the CPU and move batches.** It is only ~292 MB, but a shared GPU is
    shared: this died twice at 19 GB of "other allocations" — a Playwright gate and a site build on
    the same machine. A generator that only completes when nothing else is running will not be
    re-run.
  - **Batch the final statistics pass.** Run whole it materialises `n × n_features` — 190,000 ×
    6,144 is 4.7 GB of float32, twice over for the TopK scatter, and it OOMs at the last step of a
    twenty-minute run.
  - **Reconstruction is the necessary condition, not the sufficient one.** A dictionary that
    reconstructs well is not one whose features are individually interpretable; that needs each
    feature tied to biology through the same circular-shift null the enrichment table uses, with the
    raw 384 channels put through the identical test. Saying so beats a gallery of hand-picked
    features.

#### The two pages were split, and what that fixed

`/shorkie-lab/shorkie/` embedded the genome browser as act 1 while `/shorkie-lab/genome/` embedded
the same browser again. **The browser now lives only on `/genome/`**, and the analysis page got its
per-locus track views back (`renderTrack`, `renderAttribution`, `renderMethods`,
`renderAnnotation`, recovered from `71ce1db1^`). Deep links both ways replace the embed.

- **The locus/region bridge was ONE-WAY, and that was the bug.** `genomeBrowser.ts` dispatches
  `khc:gb-view`; `variantPlayground.ts`, `shorkieFrontier.ts` and `shorkieConstructive.ts` listen.
  Nothing listened the other way, so the sticky bar's locus select moved every interpretability
  panel and left the browser — and the species, epistasis, kinetics and receptive-field panels that
  follow it — on the previous gene.
- **A region cannot survive a locus change**, and `clearResults` never nulled `tracedBins` nor
  called `renderTraceContext`. The bar kept naming the previous gene's region while every panel
  re-rendered against the new locus at the old bin range. One `clearTrace()` now serves the button,
  the placeholder option and the locus change.
- **A `<select>` whose value matches no option displays its FIRST one.** With nothing traced the
  region bar read as though a region were selected. There is a `— none —` option now.
- **The measured-coverage overlay did not come back.** `src/data/shorkieTruth.json` is a 225-byte
  empty stub (requester-pays bucket), so the checkbox could only ever report "no measured coverage
  loaded".
- **The annotation lane/tier toggles drive the DRAWING only.** `drawnAnnotations()` filters;
  `visibleAnnotations()` stays unfiltered so the enrichment table keeps measuring every tier.

#### The browser: one ordering, four groups, a model selector, and per-track resolution

- **Three orderings disagreed.** The panel grouped by `groupLabels`, the canvas (`laneSpecs`) drew
  in raw `index.tracks` order with genes last, and `ALL_LANES` matched neither *while its comment
  said it did*. `laneOrder` in the pure module is now the single ordering and the panel, the canvas,
  the enumerator, the statistics table and the CSV all read it. Six tests pin it.
- **`ALL_LANES` is deleted, not fixed.** `data-gb-exclude` was applied in the `availableLanes()`
  wrapper while the unfiltered enumerator sat beside it returning everything. There is now no
  unfiltered enumerator to call by mistake. (CLAUDE.md's list of five exclude sites omits a sixth,
  `familyMembers()`.)
- **`attribution` is its own group.** `expression` held 43 tracks mixing what an assay would measure
  with which *bases* moved that prediction. `groupOrder` is declared in the tiler beside the labels.
- **`make_genome_tiles.py --index-only`** rewrites `index.json` against the tiles on disk. Group,
  label and docs are metadata carried nowhere in a tile, so a full run rmtree's 5,146 PNGs to
  rebuild them identically. It carries the axes over from the shipped index — sound only because
  the arrays have not moved — and refuses for any track not already in the index with an axis.
- **The "large empty box" was the PANEL, not the canvas.** `laneLayout` derives the total and `fit`
  writes `style.height`, so the canvas is 35 px with every lane off; `.gb-panel`'s `max-height:
  30rem` in a flex row held ~480 px open. It is sized from what is drawn now, floored at 260 px, and
  the inline height is **removed** below 900 px where the layout stacks — otherwise it overrides the
  media query and survives a resize back down.
- **Per-track genome-wide selection is arithmetic, not a design choice.** A 16 bp coverage lane is
  ~887 KB of tiles genome-wide, so all 5,215 would be **~4.7 GB** plus a **~33 MB `index.json`**
  that blocks before the first tile. `dist` is 440 MB against a 1 GB Pages limit.
- **But `<id>-tracks.png` is 5,215 × 896 at 16 bp, 2.15 MB, for each of the 23 windows.** The
  `sk-locus` lane surfaces it — sparse, the way `sk-ism` already is. Net new payload: nothing. Its
  picker is built from `trackIndex`, the same index the analysis page uses.
- **Its axis is the loudest of all 5,215 tracks AT THAT WINDOW**, not the selected track's own
  range, so switching track does not silently rescale. Deliberately not shared with `sk-rnaseq`,
  whose axis tops out at 1,097.6 (the genome-wide max of a 384-track MEAN) while a single track
  reaches 2,408 — **2,693 of the 119,945 track-locus rows would clip against it, invisibly**.
- **A tile-less lane needs its branch INSIDE `sample` and `sampleBins`**, not at the call sites.
  There were four (draw, correlation, statistics, CSV) and putting it at each let the **minimap** and
  the **hover readout**, which reach `tile()` directly, 404 on `sk-locus`.
- **The model selector filters AVAILABILITY, never the `enabled` map**, so switching away and back
  restores exactly the lanes that were on. phastCons, GC and the annotation lanes belong to neither
  network and stay in every mode.

#### `space: "log"` means two different transforms in ONE sidecar

`<id>.json` carries every plane of a locus in one object, and two of them declare `space: "log"`:

| plane | quantised by | inverse |
| --- | --- | --- |
| `tracks` | `np.log1p` (`make_activations.py:63`) | `expm1` |
| `ism` | `sign·log10(1+\|a\|/1e-4)` (`make_ism.py:185`) | `sign·1e-4·(10^\|v\|−1)` |

`decodePackedPlane` implemented only the second, so **this repo's own rule — never hand-write a
decode — pointed at the wrong function for coverage**, and `variantPlayground.ts` was quietly
hand-writing the right one inline. At a byte of 255 over a row spanning [0,2] the two give 6.389 and
0.0099. `decodePackedRows(px, spec, space)` now takes the space **explicitly from the caller**, which
knows which plane it fetched; `decodePackedPlane` stays as the named ISM entry point.

#### Four more interpretability methods

| script | asks | cost |
| --- | --- | --- |
| `make_variation.py` | do segregating variants avoid the bases the model says matter? | seconds, **no model** |
| `make_heads.py` | what does each attention head attend to? | seconds, **no model** |
| `make_position.py` | *where* does a motif work, relative to the TSS? | 47,104 passes, 21 min |
| `make_counterfactual.py` | what would the model *build*? | 5.5 min |

- **The variation test is PAIRED AT THE BASE**, which is what makes it a test rather than a
  correlation: the observed allele is compared with the two alternates at the *same* position that
  nature did not choose, so position, context, gene and expression are held fixed and no null model
  is needed. Observed alleles are the milder ones 55.8 / 55.4 / 54.6% of the time (missense /
  synonymous / non-coding), sign-test z = 2.5 / 3.3 / 2.7. **A sign test because the ratios are
  skewed** — for missense the ratio of means is 0.99 while the median per-site ratio is 0.90.
  The reference base matched sacCer3 at **2,319 of 2,319**, which is what makes the coordinates
  trustworthy.
- **Heads 0 and 3 read regulatory DNA** (conserved TFBS 1.75× and 1.88×, ORegAnno 1.82× and 1.72×)
  and are *depleted* on CDS (0.73, 0.69); **head 4 is the mirror**; **head 6 alone reads tRNA**
  (1.50×). Widest spread within a class 4.35×. Three things make it meaningful: the mask is pooled
  by **mean, never max** (a 7 bp site is 5% of a 128 bp cell); the null is a **circular shift**; and
  every class records its **ceiling, 1/coverage** — genes cover 91.5% of a window so nothing can
  exceed 1.09× on them, and reading their 1.03 as "flat" would be wrong.
- **The positional sweep implants a SCRAMBLE at every position too.** Overwriting 8 bp of a real
  promoter destroys what was there, and in a promoter that is exactly where the real sites are — so
  the artefact would look like the signal. The difference cancels it. Cbf1 reaches +0.094 in the
  500 bp upstream against −0.002 inside; Rap1 and TATA, the two GIA called not sufficient, are flat.
  **Every curve goes flat beyond ±2 kb**, independently reproducing the receptive-field result.
- **The counterfactual's control refutes its own headline.** The ascent invents 18 recognisable
  motifs across 11 windows — and the identical ascent on dinucleotide-shuffled DNA builds **54 in 23
  of 23**. Raw the control wins 3.0×; normalised by expression gained they are within 25%. What
  survives is that the achievable gain is set by **headroom**: gain against starting expression is
  **r = −0.873**, the five quietest genes gaining 2.80 log₂ and the five loudest 0.39.
- **Both model-based scripts separate analysis from sweep** (`--summarise`, and `--join-only` /
  `--reanalyse` on the earlier pair) so a confounding argument can be re-checked without re-running.


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
