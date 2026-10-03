# Switchable ambient backgrounds

## Visitor experience

Open **Appearance** (the theme icon in the header), then **Background**:

- **Cells** remains the default. It preserves the living-cell simulation and the homepage DNA ribbon.
- **Genome to Cell** follows DNA → RNA → folded protein → cell → expression profile → neural model → probability distribution. Homepage scrolling guides the seven-form story, with slow motion within settled forms; ordinary content pages show a quiet cell. Its explorer offers animated form buttons, a keyboard-operable scrubber, structure labels, pointer nudges, playback, single step, and reset.
- **Off** hides decorative backgrounds, including the hero ribbon. It is an accessibility control, not an animation.

Flow Field and Learning Landscape were retired in October 2026. A visitor whose browser still stores `flow` or `landscape` opens on Cells and keeps their saved Motion choice.

The Calico-inspired refinement adds a small copper-highlight population, quiet braided atmospheric dots, eased perspective, and a stronger composition in the homepage's open artwork regions. Move a mouse over exposed homepage artwork for a bounded parallax/local particle response; click or tap it for a brief spring-settled swirl. Text, links, images, controls, selections, drag gestures, and scrolling do not trigger it. The explorer also has a keyboard-operable **Stir particles** button and hover response during playback. Reduced motion disables hover/stirring; explicit form changes still work immediately. The Cells default is unchanged; the two retired scenes are covered under Preferences and lifecycle.

**Ambient**, **Calm**, and **Paused** apply to both scenes. Reduced-motion preferences override autoplay and show a still composition, but explicit single stepping remains available. The site-wide canvases never intercept clicks, touch scrolling, or trackpad scrolling. Opening a demo suspends the ambient scene, locks document scrolling, and restores focus and reading position on close. Native dialogs provide modal focus containment and Escape dismissal.

Choices persist across ordinary content pages. Dedicated `/lab/`, `/games/`, `/nn-lab/`, `/shorkie-lab/`, `/algorithms/`, `/terminal/`, `/chromatin/`, and `/sonic-genome/` experiences remain independent. The Cells explore button opens Cell Lab.

## Implementation map

- `src/lib/backgroundModel.ts` contains validated preferences (scenes `cells | morph | off`, motion `ambient | calm | paused`), the retired-scene migration, and route exclusions. It has no DOM dependencies.
- `src/lib/morphStory.ts` supplies the shared seven-stage registry, canonical progress, descriptions, chapter holds, 60-second playback and form-button timing. `src/lib/morphTargets.ts` supplies DOM-free RNA/protein/network/density samplers; `src/data/morphProtein.ts` bundles experimental coordinates and provenance. `src/lib/morphModel.ts` retains deterministic anatomical groups, DNA/cell/expression geometry, six adjacent transitions and exact damped-spring updates. `src/lib/morphRenderer.ts` projects and animates them in Canvas2D using caller-owned scratch points. `src/lib/sceneRenderer.ts` is the unchanged lifecycle interface; its optional progress setter accepts immediate/smooth transitions, and configuration accepts structure labels.
- `src/lib/morphLife.ts` holds the six deterministic, bounded life helpers (read head, network packets, density rain, protein turntable, streak strength, bokeh) over a `LifeClock`. `src/lib/morphLighting.ts` holds `fitHorizontal`, the one pure calculation that keeps the whole DNA view inside a 16px inset. Both are DOM-free and unit-tested; the renderer only draws what they return.
- `src/scripts/background.ts` owns storage, scene switching, homepage scroll chapters, content masks, Astro navigation, visibility, reduced motion, dialogs, and keyboard controls. It lazy-loads drawing adapters only when selected.
- `src/components/BackgroundControls.astro` and `BackgroundExplorer.astro` provide the Appearance choices and opt-in demonstrations. `SiteBackground.astro` provides persistent canvases and early preference hydration.
- Cell physics and the dedicated lab are unchanged. The homepage `HeroBackground.astro` ribbon appears only with Cells. It reads the same native colour tokens as the other renderers, so CRT modes recolour it, and it listens for `khc:crt-change`.

The codebase-design skill informed the renderer seam: the controller retains one lifecycle interface while each drawing adapter owns its math, rendering, and cleanup.

## Preferences and lifecycle

The local-storage key remains `khc-background-v1`; its default value is `{ "scene": "cells", "motion": "ambient" }`. Valid scenes are `cells`, `morph` and `off`. A stored `flow` or `landscape` (the two retired scenes) opens as Cells **and keeps a valid saved motion**: an unknown scene must not also reset Motion. The same rule is mirrored in the pre-hydration script of `SiteBackground.astro`, so the page never flashes the wrong scene; change `resolveBackground` and that script together. Invalid storage falls back safely. Legacy `khc-cell-mode` values migrate once: calm → Cells/Calm, off → Off/Ambient, ambient or lab → Cells/Ambient. Storage failure leaves working in-memory controls, including across Astro navigation. Cross-tab changes replace the active scene and close an open demo.

Only one ambient renderer runs. Cells detach when Genome to Cell is selected; the hero ribbon stops and hides. Generation tokens discard outdated imports and switches. Navigation disconnects observers and disposes renderers/dialogs. Page visibility, pause, reduced motion, and an open demo gate animation. Selecting foreground text also stops Genome to Cell motion. Selection events only update the ambient lifecycle: replacing explorer status text can itself generate a selection event, and must not cancel explicit form transitions. Theme and CRT changes redraw the current frame without resetting simulation state.

## Reading comfort and performance

Genome to Cell draws through a cached offscreen clearance mask around text, links, controls, media, header, and footer. A soft shadow feathers each erased rectangle. Layout changes refresh document-coordinate bounds; scrolling repositions the mask without remeasuring every text element. Add `data-background-protected` for complex foreground widgets.

Phone compositions keep their existing asymmetric layout and reading clearance. Genome to Cell uses **1,000/3,200 ambient particles on phone/desktop and 1,600/5,000 in its explorer**. Every group participates in each form, including a separate contextual cloud around DNA. Ordinary content pages have lower opacity than homepage artwork; Calm retains its quieter opacity. DPR is capped at 1.5/2 respectively. Ambient scenes target at most 20/24 FPS; the particle explorer targets 30/60 FPS. Adaptive quality reduces samples within every anatomical group, retaining the nucleus, organelles, and membrane, while lowering cadence to 12 FPS and eventually a static fallback. Density reductions fade over 400ms; fully faded particles skip geometry work. Static compositions still respond to chapter changes. The cell fits its artwork window with a 16px vertical inset.

The particle renderer uses six depth bands, three dot sizes, twelve opacity levels, and three inks: theme accent, text ink, and restrained copper (all collapse into the selected CRT color). Reused typed arrays link particles into drawing buckets without per-frame sorting or per-dot draw calls. Thin paths are subdued structural accents rather than the principal material. Surface samples use independently mixed deterministic coordinates to avoid visible diagonal bands, and front membrane particles remain transparent enough to reveal organelles. An additional 96 phone / 240 desktop decorative stream dots are subdued around molecular/cellular forms and fade out for expression and distribution. Color and outer streams do not encode measured biology. This is Canvas2D, not a new WebGL dependency or a physical molecular simulation.

The homepage DNA is placed above rather than mostly behind the portrait on desktop. All six subsequent art windows are 240px on phones and 260–340px on larger screens, with a 16px vertical inset. They appear only for this scene; four additional windows add about 960px to the phone homepage. Higher homepage opacity is confined by the existing clearance mask; ordinary content and Calm retain their quieter opacity. Idle depth is small and eased mouse input is bounded; expression and distribution settle into flat views. Protein view changes remain rigid. `SceneRenderer.setPointer` is optional, leaving the other scene adapters unchanged. Homepage pointer handlers are passive, never capture input, and reject protected bounds; taps require a short stationary gesture with no scrolling.

`data-bg-ticks` counts updates; `data-bg-frames` includes static redraws. The particle canvas exposes requested and displayed progress separately (`data-bg-progress`, `data-bg-displayed-progress`), plus `data-bg-transitioning`, `data-bg-render-ms`, `data-bg-quality`, `data-bg-allocated`, and `data-bg-visible` for browser audits. Visible counts mean particles submitted before the reading-clearance mask, not the number of individually discernible dots on screen. These are diagnostic attributes, not visitor controls.

Additional diagnostics report the decorative stream budget (`data-bg-atmosphere`), eased hover influence (`data-bg-pointer`), and accepted disturbance count (`data-bg-interactions`). The [Calico reference study](calico_animation_inspiration_2026_09.md) records the primary-source observations and what was deliberately not copied.

## Life motion

A second pass, **life motion**, makes the genome story read as a living specimen rather than a still. It is rendering only: no sampler, target, population or physics changed, and the bundled protein coordinates are untouched. Cells received the matching treatment (Ambient rendering alpha 0.6 → 0.75, Calm 0.38 → 0.45, a membrane rim, and a dark-theme-only halo; Cell Lab paint is unchanged).

| Effect                    | Where               | Cap (phone / desktop)                                                |
| ------------------------- | ------------------- | -------------------------------------------------------------------- |
| Whole-view DNA fit        | hero                | one rigid scale; every strand stays inside a 16px inset at any width |
| Paired strands, read head | DNA                 | theme accent and warm ink; one bead, 12-second cycle                 |
| Light                     | hottest particles   | 100 / 250 cached radial-gradient sprites                             |
| Bokeh                     | foreground depth    | 12 / 28 faint dots, alpha ≤ .05, 1.6× pointer parallax               |
| Velocity streaks          | between stages only | ≤ ⅓ of particles, two batched strokes, off below quality .6          |
| Network packets           | neural model        | 24 / 48, travelling real edges                                       |
| Density rain              | probability density | 32 / 64, drawn from the real normal quantile                         |
| Protein turntable         | folded protein      | rigid view yaw ≤ .16 rad                                             |

Every pass is driven by a `LifeClock` and is **exactly zero** whenever the renderer cannot animate (Motion Paused, reduced motion, a hidden document, or the static fallback), and 0.45× in Calm. All of them draw before the shared reading-clearance mask, so none reaches text. Sprites are rebuilt only when the palette changes (theme or CRT), never per frame; light uses `lighter` blending on dark and CRT themes and ordinary compositing on light ones. Scratch objects and the previous-position and streak-band buffers are allocated once per renderer. `data-bg-life`, `-glow`, `-streaks`, `-rain`, `-packets`, `-bokeh`, `-palette`, `-light-blend` and `-warm-ink` report what a frame actually submitted, because a canvas has no elements to inspect.

None of it encodes biology. The read-head bead is not replication or transcription kinetics, packets are not Shorkie activations, streaks and bokeh show motion and depth only, and the turntable turns the view, never the fold.

## Mathematical and biological interpretation

Genome to Cell is **explanatory particle artwork**, illustrating molecular information → cellular context → measurement → learning → uncertainty, with illustrative relative scales. Dots have stable drawing identities, not tracked atomic identities. DNA opens into a representative single RNA transcript with bends and local hairpins; neither molecular form claims to encode ubiquitin's sequence. Translation directs protein synthesis, but this artistic gathering into a fold does not simulate a ribosome or folding dynamics. Protein then recedes as cellular context appears; cell material becomes a multi-peak expression signal, gathers into a neural sculpture, and settles into a probability density.

The protein is ubiquitin [PDB 1UBQ](https://www.rcsb.org/structure/1UBQ), chain A: 76 unmodified C-alpha coordinates and the HELIX/SHEET intervals from the [source PDB](https://files.rcsb.org/download/1UBQ.pdb), extracted 2026-10-01 and bundled locally. Source SHA-256: `d4a6812d8951cf6594e6a0763f089e35f5a80b62acb3c117b2c5565228a7b161`. Coordinates are covered by the [RCSB CC0 usage policy](https://www.rcsb.org/pages/usage-policy). Drawing normalization uses only a rigid orientation and one uniform scale; residue order and experimental fold remain intact. Ribbons/tubes accent the backbone; idle movement changes the view, not the fold. No target needs a runtime network fetch.

The cell retains a translucent irregular particle shell, volumetric nuclear envelope, dense chromatin and nucleolus, three varied mitochondria with internal folds, and folded ER ribbons connected to the nuclear envelope. Cytoplasmic dots stay outside the nucleus. Membrane motion stays below 1% of cell radius; organelles drift within the cytoplasm. Adjacent forms use quintic easing and bounded particle-staggered curves whose displacement and first derivatives vanish at endpoints. Reverse scrubbing reconstructs the same geometry at a given animation time.

Expression is a non-normalized multi-peak signal over genomic position, not measured model output. The five-layer [4, 6, 8, 6, 3] neural model and its sparse adjacent connections are generic, **not Shorkie's architecture**. The single bell-shaped finale illustrates the normalized standard-normal density `exp(-x²/2)/sqrt(2π)` of a standardized response (drawing domain −3.5 to 3.5). It is **not measured or calibrated Shorkie uncertainty**. Explorer labels/status explain these distinctions; homepage artwork stays decorative.

References for the anatomical relationships: [NHGRI DNA fact sheet](https://www.genome.gov/about-genomics/fact-sheets/Deoxyribonucleic-Acid-Fact-Sheet), [NCBI nuclear envelope and ER](https://www.ncbi.nlm.nih.gov/books/NBK9927/), and [NCBI mitochondria and cristae](https://www.ncbi.nlm.nih.gov/books/NBK9896/).

At the top of the homepage, a 1.5-second introduction gathers dots into DNA. Canonical progress is stage index / 6:

| Stage                    | Progress | Homepage position                |
| ------------------------ | -------- | -------------------------------- |
| DNA                      | 0        | Hero                             |
| RNA                      | 1/6      | Research artwork window          |
| Folded protein           | 1/3      | Publications artwork window      |
| Cell                     | 1/2      | Featured software artwork window |
| Expression profile       | 2/3      | Posts artwork window             |
| Neural model             | 5/6      | Recent news artwork window       |
| Probability distribution | 1        | Genome browser artwork window    |

The neural-model window moved to Recent news when the homepage Algorithms section was removed. The story only needs the windows to stay in document order between Posts (expression) and the genome browser (distribution): `storyProgress` rejects chapters that are out of order, and then the whole story falls back to the quiet Cell.

The viewport centre determines progress across cached document-coordinate chapter centres, holding each form within `min(64px, windowHeight × .2)` around its centre and interpolating between hold zones. Existing headings and order remain intact. Forward/reverse scroll, resize, navigation and restored positions preserve deterministic geometry; missing chapter metadata and ordinary pages use quiet Cell at .5. Bounds are refreshed with reading masks, not measured per particle/frame.

Explorer autoplay holds every arrival for 2 seconds, then spends 3 seconds on each adjacent transition, traversing forward and continuously reversing over a **60-second loop**. Explicit buttons traverse the ordered story at **.9 seconds per crossed stage**, restarting from the displayed pose if interrupted (minimum .15 seconds). Scrubbing and normalized .05 single steps are immediate; Reset restores DNA, decorative clock and undisturbed geometry. Pause/resume retains playback phase and direction without catching up through suspended time. Calm slows idle decoration, not story timing. Structure labels live only in explorer gutters, including at 320px. Pointer nudges use an exact critically damped spring and settle in 1.5 seconds. Reduced motion disables automatic movement and makes explicit form changes immediate; labels remain available.

## Future concepts

Candidates, not scenes in this release: an exon-inclusion splicing ribbon, a chromatin-loop-to-contact-map transformation, and a branching cell-lineage constellation. Each needs its own scientific caveat and the same reading, reduced-motion, and phone-performance checks.

## Verification

```sh
npm test
npm run check
npm run build
npm run audit:indexing
npm run audit:links
npm run audit:terminal:ci
npm run audit:cells:ci
npm run audit:background:ci
npm run audit:security
python3 scripts/check-jsx-spacing.py src/components/BackgroundExplorer.astro src/pages/index.astro
node scripts/profile-morph.mjs
```

The background audit (`scripts/audit-background-ui.mjs`) runs Chromium and WebKit, desktop and phone. In `--ci` mode it is **one process per engine**, each with its own preview port and screenshots, and the parent prints the line a gate should read: `[background-ui] Passed: chromium and webkit`. It covers the two scenes plus Off and nothing else; the helix fit at 320/360/390/414/768/1440px, including the terminal expanded and collapsed; life-effect counts, positive while animating and exactly zero when Paused, under reduced motion, hidden, or in the static fallback; reading-mask clearance; theme and CRT repaint; migration of a stored `flow`, `landscape` or legacy key, both before and after hydration; 320px controls; light/dark/CRT endpoint screenshots; all seven scroll windows and reverse scrolling; six adjacent midpoints and both sides of every canonical boundary; finite transitions, labels, interruption and resumption, exact reset; persisted scenes; keyboard switching; modal focus and scroll restoration; independent Cell Lab state; paused ticks; all seven reduced-motion selections; and denied storage. Interruption and resumption are measured by reading, clicking and reading again inside **one synchronous page task**: reading across an awaited click measured the runner, not the page. Model tests independently cover geometry, protein-source fidelity, normalized density area, transitions, quality participation and spring settling. Screenshots go to a reported temporary directory. Use a production preview: the Astro development toolbar itself reads storage without a guard. `npm run audit:background:ci` owns and cleans up its previews of `dist/` on success or failure.

**Virtual time.** The 60-second story (every arrival, hold and midpoint through the whole forward and reverse loop, including reverse pause/resume, and a paused story standing still) the minimum-quality floor (an injected, measured 11 ms per frame drives the real .35 branch without the separate static fallback, then all seven silhouettes are captured), and the two exact-image properties (a paused form disturbed by Stir returns pixel for pixel to rest with frames 180 ms apart, and Reset from a disturbed finale restores canonical DNA exactly) each run in a **fresh page under Playwright's fake clock** (`page.clock`), installed before navigation and paused once the explorer is open. Timers, `requestAnimationFrame` and `performance.now` all come from that one clock, a frame costs 0 ms of it, and `cancelAnimationFrame` is per id, so the result cannot depend on CPU speed or on another renderer's frames. Three traps, all met the hard way (CI runs 37098355680 and 37106637361):

- **Never mock `requestAnimationFrame` with a single slot.** While the explorer dialog is open, every `selectionchange` re-evaluates the suspended _ambient_ renderer, which calls `cancelAnimationFrame(0)`; a mock that clears its slot for any id then erases the explorer's pending frame whenever that event lands between two steps. On the phone profile a late `selectionchange` from the preceding tap arrives right then, so only a slower runner lost the race. The scenarios dispatch `selectionchange` mid-playback on purpose: it must never stop the explorer.
- **The explorer renderer exists only after a dynamic import, after the dialog is visible**, and autoplay starts then. The helper waits for it (it draws once on creation) and asserts "paused" before pressing Play or Reset; a click that lands first toggles a state that has not been decided yet.
- **Exact pixel equality across frames is only meaningful once adaptive quality has settled.** A slow runner steps quality down (headless WebKit on the CI runner reached 0.56), and the 400 ms fade between two levels advances per _frame_, so at 5 fps two captures of the same paused form can differ in how many particles are drawn, legitimately. Under the fake clock a frame costs 0 ms, quality cannot move, and the comparison is unconditional. The real-time versions in the profile compare only when `data-bg-quality` and `data-bg-visible` did not move between the captures, and print a line saying so when they skip.

`BACKGROUND_UI_CPU_THROTTLE=<n>` (Chromium) emulates a slower runner; the whole chromium phone profile passes at 12×. `BACKGROUND_UI_SLOW_FRAMES=<ms>` replaces `requestAnimationFrame` with a timer in every page the audit opens (the fake-clock scenarios excepted). It exists because of a measurement: headless WebKit on the Linux CI runner delivers frames at **1–8 Hz** (a blank page 1–4, the homepage 4–8) while the renderer itself costs only 4–11 ms there, so the compositor is the limit, not the page, and the previous renderer is just as slow (6 and 5 ticks in 1.2 s against 5 and 5 for the new one). The audit passes with `BACKGROUND_UI_SLOW_FRAMES=250` and with `=500` (2 Hz). **Never assert a frame rate**: a fixed wait followed by `ticks > 5` is a statement about the runner, and it had zero margin there. Wait for the condition with `drawn()` and let it name the state if it never holds; a media-query change, a `ResizeObserver` or an `IntersectionObserver` callback is delivered on the same slow cycle, so wait for its effect too, never for a fixed sleep. The audit also tolerates exactly one engine notice, `ResizeObserver loop completed with undelivered notifications`, which WebKit raises as an error event when observers settle over more than one frame on a slow compositor; it is counted and logged, and every other page error still fails the run. `BACKGROUND_UI_CLOCK_ONLY=1` runs just the two virtual-time scenarios (about 20 seconds). `BACKGROUND_UI_BROWSERS`, `BACKGROUND_UI_PHONE_ONLY`, `BACKGROUND_UI_LIGHT_ONLY` and `BACKGROUND_UI_EFFECT_ONLY` focus a run. The full `--ci` run takes about 2:45 locally (5:00 if the engines ran one after another). On the CI runner WebKit is the long pole: its sections take 2.5–3.5× a laptop's and the whole engine took 9.5 minutes in a standalone run (Chromium about 3), so the step's cap is 20 minutes. It is there to stop a hang, not to grade a healthy run.

Interaction checks exercise homepage mouse hover and phone taps, verify foreground controls do not disturb particles, and activate **Stir particles** with Enter. The paused explorer must visibly respond, return to its resting canvas, and stop drawing. Phone profiles deliberately deliver animation callbacks 180ms apart to cover loaded browsers. The spring uses real elapsed time and a 1.5-second deadline, separate from the decorative simulation's capped time step; the first rendered frame at or after that deadline clears the disturbance. This prevents low frame rates from extending a brief interaction indefinitely. Reduced motion disables the stir control. For a focused Safari phone pass, use `BACKGROUND_UI_BROWSERS=webkit BACKGROUND_UI_PHONE_ONLY=1 npm run audit:background:ci`.

`scripts/profile-morph.mjs` owns a Chromium browser and production preview, running ambient and explorer sequentially for all seven endpoints and six midpoints on desktop and a 390px phone viewport with 4× CDP CPU throttling. Each pose gets 2 seconds of warmup and at least 3 seconds of collection; only unique `data-bg-ticks` contribute `data-bg-render-ms` samples to nearest-rank p95. Explorer poses stay exact via manual scrubbing and repeated spring stirring rather than drifting through autoplay. Each row reports sample count, minimum adaptive quality and fallback, asserting p95 <6ms desktop / <10ms throttled phone and no static fallback. Results are saved in a temporary JSON artifact. These are local-host JavaScript update/draw costs, not physical-phone rendering, battery use, GPU timing or Core Web Vitals measurements.

Ambient setup waits for fonts, scrolls to expose the relevant sections, waits 650ms for the existing 550ms section-reveal translation to finish, then exercises the normal resize/cache-refresh path and recomputes the settled scroll position. This avoids profiling a first-visit reveal offset as the requested midpoint. Exact canonical inputs remain unchanged; three-decimal diagnostics are compared within .002.

The October 2, 2026 production-preview run passed **all 52 pose/mode/profile checks**, collecting **4,923 unique rendered ticks**. Desktop used 1440×1000 at device scale 1; phone used 390×844 at device scale 3 (renderer DPR cap 1.5) with 4× CPU throttling. Maximum per-pose p95 values and sample ranges were:

| Profile             | Ambient p95 maximum | Explorer p95 maximum | Unique samples per pose (ambient / explorer) |
| ------------------- | ------------------- | -------------------- | -------------------------------------------- |
| Desktop             | 1.9ms               | 2.8ms                | 68–71 / 162–175                              |
| 390px phone, 4× CPU | 3.5ms               | 4.8ms                | 56–58 / 82–84                                |

Every pose retained **quality 1.00**, the approved particle budgets and **no static fallback**. The maximum phone explorer cost occurred between protein and cell; no performance optimization or budget adjustment was necessary. Full per-pose p95/sample values are recorded in the Task 3 validation report and the temporary profiler JSON. The complete Chromium/WebKit desktop/phone browser audit, tests, Astro check, full PDF build, indexing, links, security and JSX spacing checks passed. On this host, the unchanged indexing gate used the already installed MiKTeX `pdftotext` via a process-local PATH prefix because the Homebrew extractor had a broken dylib dependency; no indexing checks were skipped.
