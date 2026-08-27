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
- **`bare` is why every `transition:persist` script must re-acquire its element.** `transition:persist` normally keeps a node *identical* across navigations, which tempts a script into `const el = document.querySelector(...)` once at module top level. That guarantee dies on a page that doesn't render the element: `/terminal/` is the only bare page, so `Header`, `SiteBackground`, `ReadingProgress` and `PageScan` are destroyed there and rebuilt on the way back — and Astro will not re-execute an already-loaded module script. All four once captured their element once, and a single `/` → `/terminal/` → `/` round trip left the theme toggle and mobile menu unbound, the background canvas at its default 300×150 painting nothing, and the reading bar writing to a detached node. Each now re-acquires inside a `bind()`/`attach()` called on `astro:page-load`, guarded by a `dataset` flag so the persisted case stays a no-op; document-level listeners are installed once and read a mutable reference the rebind updates. **Add a persisted element, or a second bare page, and this is the trap.**
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
  model budgets. The two can disagree and only one of them is on screen.
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

### Other non-obvious things
- **Math (KaTeX)** is wired in `astro.config.mjs` (`remark-math` + `rehype-katex`) for the LaTeX-heavy reports; the report slug page imports `katex/dist/katex.min.css` so both the page and its printed PDF typeset math. Posts currently use no math.
- **Cross-links between sections** use `relatedPosts` references in frontmatter, resolved by `src/lib/relatedPosts.ts` into "Blog" chips on publication/research entries.
- **`src/legacy-redirects.mjs` is generated** by `scripts/gen-legacy-redirects.mjs` — edit the generator, not the data file. The LiftOn `v2 → v1-0-9` redirects in `astro.config.mjs` are intentional; don't "fix" them.
- `public/` is served verbatim; `src/assets/` images are optimized at build via `astro:assets`. Keep `public/CNAME`, `astro.config.mjs` `site`, and SEO metadata all pointing at `khchao.com`.
- `scripts/audit-security.mjs` maintains a `SAFE_SET_HTML_FILES` allowlist of components that legitimately use `set:html` (mostly the animated figure components, e.g. `src/components/LiftOn*.astro`, `OpenSpliceAI*.astro`, `Shorkie*.astro`, `Splam*.astro`, `WGT*.astro`). Add a new component to this list if it needs `set:html` for inline SVG/animation markup; otherwise the audit fails it as an unsanitized sink.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `Kuanhao-Chao/Kuanhao-Chao.github.io`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root (neither exists yet; created lazily). See `docs/agents/domain.md`.
