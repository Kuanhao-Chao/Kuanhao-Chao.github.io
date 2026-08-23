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

### The deep-dive curriculum is mid-migration

`/deep_dives/` is being moved from 21 hand-authored `.astro` pages onto a content
collection. **Both renderers are live at once**, deliberately:

- `src/pages/deep_dives/<slug>.astro` — the unmigrated lessons, each repeating its own
  back-link, badge row, byline and hand-numbered table of contents.
- `src/content/deepDives/<slug>.mdx` + `src/pages/deep_dives/[...slug].astro` +
  `src/layouts/DeepDiveLesson.astro` — the migrated ones. `getStaticPaths` emits only
  slugs present in the collection, so the two coexist without colliding.

**A lesson's `.astro` must be deleted in the same commit its `.mdx` lands**, or two
routes claim one URL. `src/lib/deepDives.test.ts` fails on that overlap, and on
frontmatter that sets `readingTime` — which is derived by `lessonReadingTime` from the
body, not stored. (Storing it is what let every lesson claim ~2.5x its real length.)

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

- **The statistical-genetics track is finished — 17 pages, all in the collection.** It is the
  worked precedent for the migration: a hub with `isHub: true` plus sixteen lessons across
  five modules, every worked example tied to `deepDiveExamples.test.ts`, every figure
  generated from `scripts/figures/`. The **GWAS track (10 lessons + hub) and three standalone
  pages are still hand-authored `.astro`**, which is why both renderers stay live.

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
