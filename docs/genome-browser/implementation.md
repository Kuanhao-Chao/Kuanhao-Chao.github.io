# Genome browser improvement record

Route: `/shorkie-lab/genome/` · implementation: 2026-09-11–13.

## Plan and scope

1. Understand the website shell, shared browser controller, data formats, and offline verification chain.
2. Reproduce correctness and usability problems on the existing public page.
3. Correct state restoration, coordinate handling, mixed-resolution summaries, exports, and loading behavior.
4. Redesign the complete page around a focused comparison, accessible controls, and touch scrolling.
5. Validate the production build, shared embeds, individual tracks, responsive layouts, and browser engines.
6. Retain screenshots and this implementation record for review. Publishing is a separate action.

The released scientific assets are treated as trusted inputs. This work verifies how the website loads,
interprets, summarizes, and displays those assets; it does not reproduce model training or regenerate
genome tiles. The checkpoint verification chain remains in `scripts/shorkie/README.md`.

## Website and browser architecture

The website is an Astro static site with Markdown/MDX content collections. The lab routes use a bare
`BaseLayout`, a fixed-height shell, and one vertical `.vp-scroll` content area. They share typography,
theme tokens, and lab styles with the rest of the site. There is no client framework.

| Responsibility | Source |
| --- | --- |
| Genome route, metadata, guide, methods, controls | `src/pages/shorkie-lab/genome.astro` |
| Standalone responsive layout | `src/styles/genomeBrowser.css` |
| Shared lab styling | `src/styles/variantPlayground.css` |
| Canvas rendering, interaction, loading, panels | `src/scripts/genomeBrowser.ts` |
| Coordinates, quantization, navigation, saved state | `src/lib/genomeBrowser.ts` |
| Screen-independent analysis and weighted summaries | `src/lib/genomeAnalysis.ts` |
| Bounded, deduplicated requests and explicit retry | `src/lib/genomeResources.ts` |
| Exact grayscale PNG data decoding | `src/lib/genomeTile.ts` |
| Homepage embed of the same controller | `src/components/genomic/HomeGenomeBrowser.astro` |
| Dedicated production browser audit | `scripts/audit-genome-ui.mjs` |

`public/genome-data/index.json` describes 17 sequences, 12,157,105 bases, and 48 score tracks.
Tiles are quantized PNGs, with zero bytes reserved for missing values. Coarser tiles contain three
rows for minimum, maximum, and mean; base tiles contain one row. The available pyramid includes
1, 8, 16, 64, 512, and 4,096 bp bins; some tracks start at a coarser native resolution. Gene models,
annotations, gene search, and motif definitions are JSON resources. Optional experiment-specific
coverage uses the existing `/vp-data/` assets for primary windows.

Internal intervals and CSV coordinates are zero-based, half-open. Search inputs and the main locus
readout are one-based, inclusive. The marked-region hash retains its legacy zero-based convention
and now also includes the chromosome.

## Reproduced findings and implemented changes

| Finding | Result |
| --- | --- |
| Mobile toolbar measured 2,076 px wide at a 390 px viewport; Tracks was outside the screen | Two-row primary toolbar, compact header, Tools menu, and a modal Tracks sheet below 1,024 px |
| Default lane stack extended below a 768 px laptop viewport | Focused constraint, expression, conservation, genes, and sequence selection; full comparison remains a preset |
| Expanded methods squeezed descriptions into columns only a few characters wide on phones | Readable table widths, horizontal scrolling, keyboard access, and a column-width regression check |
| Empty track selection restored defaults on reload | Explicit `t=` survives sharing and reload |
| Hash changes did not restore the entire browser state | One restoration path for boot and navigation, including model, density, autoscale, heights, experiment selection, and marked region |
| Marked region lacked chromosome identity | Chromosome-qualified marks survive cross-chromosome navigation |
| Mixed native resolutions were paired by array position; summaries varied with screen width | Statistics, scatter, and CSV share one genomic grid, with at most 4,000 bins and a floor at the coarsest selected native resolution |
| Chromosome length was used to weight means even when coverage was sparse | Genome means use the recorded count of finite native values |
| Coarse signed magnitude could be confused with per-base magnitude | Explicit `|bin mean|` labels and suppression of invalid genome-magnitude ratios |
| Commas in CSV headings created extra columns | CSV escaping, explicit coordinate and resolution metadata, chromosome-end clipping |
| Exports could capture incomplete requests | Exports wait for data, reject failed data or changed views, and report actionable status |
| Failed annotation requests looked like empty biology | Visible failure state, explicit Retry, no retry loop on redraw |
| Firefox could not decode the wide score-tile images | Decode the grayscale PNG data directly with native deflate decompression, without image-size limits or color conversion |
| Updating the view erased Astro's navigation state | Preserve history state when replacing the view hash; reading-guide links scroll without replacing it |
| Long sequence scans could finish after their scope changed | Chunked cancellable scans, stale-result suppression, and a broad-query match cap |
| Canvas inspection required pointing at small features | Keyboard-accessible feature list, persistent score readout, focus restoration, Escape handling |
| Touch navigation intercepted page movement | Native vertical scrolling and page pinch zoom; intentional horizontal motion pans the genome |
| Shared controller could outlive an Astro route transition | Abort requests, close bitmaps, disconnect observers, remove listeners, and cancel scheduled work on teardown |

The page now has a short reading guide, separate research methods, searchable tracks, visible loading
and export messages, six existing themes, and a collapsed diagnostic readout. Styling is scoped to
the standalone page so the homepage and model pages retain their layouts.

## Scientific interpretation limits

Visible summaries are approximate means of stored bins. Missing values remain gaps. Coarse tiles
do not contain valid-base counts, so a coarse summary cannot recover an exact weighted per-base
mean across partially missing bins. Boundary bins are weighted by their overlap with the view for
the displayed mean; CSV and scatter retain the whole intersecting genomic bins and say so.

The plotted curve may use a different rendering resolution from the analysis grid. Its hover value
continues to describe the rendered bin. Statistical results and CSV no longer change when the screen
is resized. Quantization and native model resolution still limit numerical precision.

## Final status and validation

Implementation and local validation are complete as of 2026-09-13. Pushing this release to `main`
triggers the GitHub Pages build and deployment workflow.

| Check | Result |
| --- | --- |
| Astro check | Zero errors and warnings; 105 informational hints across the site |
| Genome unit tests | 200 passed, including independent tile-byte verification |
| Full site tests | 4,133 passed, 350 skipped, one unrelated timeout; that exact test passed in isolation in 13.32 seconds with its original timeout |
| Final production build | Passed, including 195 static pages and required post PDFs |
| Final indexing audit | Passed for 8 live posts and 8 reports |
| Chromium full track audit | Every score and annotation track passed at chromosome, gene, and base scales; bounded cache and mobile touch scrolling passed |
| Final Chromium and Firefox production audits | Both passed all seven viewports, six themes, state restoration, statistics, exports, search/retry, expanded methods, keyboard interaction, route transitions, and the homepage embed |
| Shared lab smoke | Passed, including 23 annotation loci, seven logo lanes, gene stepping, and a 269 KB SVG with 1,009 vector paths; no model inference requested |
| Source spacing and diff checks | No swallowed JSX spaces or whitespace errors |

The responsive matrix is 1366×768, 1440×900, 1024×768, 768×1024, 390×844, 320×800, and
844×390. The focused canvas ends around 638 px on a 768 px laptop viewport. The final audits
reported zero uncaught page errors in both engines. Initial readiness measured 1.50 seconds in
Chromium and 4.09 seconds in Firefox on the local static server; these are local observations,
not public-network or physical-device performance guarantees.

The complete track sweep and shared-controller regression checks passed before the final change
to methods-table widths. The final production run rechecked all responsive layouts and interactions,
including the corrected tables. No scientific code changed between those runs.

Commands:

```sh
npm run check
npm test -- --maxWorkers=2 --testTimeout=180000
npm test -- src/lib/livingCellsEngine.test.ts --testNamePattern='maintains target' --maxWorkers=1
python3 scripts/check-jsx-spacing.py src/pages/shorkie-lab/genome.astro
npm run build
npm run audit:indexing
npm run audit:genome:full -- --browsers chromium,firefox
npm run audit:genome -- --browsers chromium,firefox
npm run audit:playground:ci
```

All 4,134 non-skipped site tests passed across the full run and isolated retry. The longer CLI timeout
was used on the shared host; the living-cell test has its own explicit 30-second limit and needed
an isolated run. Neither test implementations nor repository timeout settings were changed.
Raw logs, measurements, and additional screenshots are retained locally in `validation/` and ignored
by Git; selected review screenshots are retained below.

CI installs Chromium, Firefox, and WebKit, runs the genome smoke gate across all three, and retains
failure artifacts. Local WebKit cannot launch on this Rocky Linux 8 host because its binary needs
newer glibc and desktop/media libraries. Its Ubuntu CI check is configured but has not been executed
for this release at the time of local validation. Emulated viewports and Chromium touch input do not replace physical
iPhone, iPad, Android, or laptop testing.

The raw tile decoder supports the tiler's 8-bit non-interlaced grayscale format and all five PNG
scanline filters. It validates dimensions and decompressed size. Three shipped tiles, including a
65,536-column three-row tile, match independent Python/Pillow SHA-256 digests. It uses the native
[DecompressionStream API](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream),
which MDN documents as available across browser engines since May 2023.

## Screenshots

Before and after screenshots use the existing theme and default region.

| View | Before | After |
| --- | --- | --- |
| Laptop, 1366×768 | [Before](screenshots/before-laptop.png) | [After](screenshots/after-laptop.png) |
| Phone, 390×844 | [Before](screenshots/before-phone.png) | [After](screenshots/after-phone.png) |
| Narrow phone, 320×800 | — | [After](screenshots/after-narrow-phone.png) |

Additional mobile review: [reading guide](screenshots/reading-guide-phone.png), [methods](screenshots/methods-phone.png), and [catalog descriptions](screenshots/catalog-phone.png).
