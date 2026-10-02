# Switchable ambient backgrounds

## Visitor experience

Open **Appearance** (the theme icon in the header), then **Background**:

- **Cells** remains the default. It preserves the living-cell simulation and the homepage DNA helix.
- **Flow Field** draws gently moving trails. Its explorer adds direction arrows, temporary vortices, flow strength, pause, single step, and reset.
- **Learning Landscape** draws loss contours and optimizer paths. Its explorer compares gradient descent and heavy-ball momentum from a shared starting point, with adjustable step size and method.
- **Genome to Cell** follows DNA → RNA → folded protein → cell → expression profile → neural model → probability distribution. Homepage scrolling guides the seven-form story, with slow motion within settled forms; ordinary content pages show a quiet cell. Its explorer offers animated form buttons, a keyboard-operable scrubber, structure labels, pointer nudges, playback, single step, and reset.
- **Off** hides decorative backgrounds, including the hero helix.

The Calico-inspired refinement adds a small copper-highlight population, quiet braided atmospheric dots, eased perspective, and a stronger composition in the homepage's open artwork regions. Move a mouse over exposed homepage artwork for a bounded parallax/local particle response; click or tap it for a brief spring-settled swirl. Text, links, images, controls, selections, drag gestures, and scrolling do not trigger it. The explorer also has a keyboard-operable **Stir particles** button and hover response during playback. Reduced motion disables hover/stirring; explicit form changes still work immediately. Existing saved scene choices and the Cells default remain unchanged.

**Ambient**, **Calm**, and **Paused** apply to every scene. Reduced-motion preferences override autoplay and show a still composition, but explicit single stepping remains available. The site-wide canvases never intercept clicks, touch scrolling, or trackpad scrolling. Opening a demo suspends the ambient scene, locks document scrolling, and restores focus and reading position on close. Native dialogs provide modal focus containment and Escape dismissal.

Choices persist across ordinary content pages. Dedicated `/lab/`, `/games/`, `/nn-lab/`, `/shorkie-lab/`, `/algorithms/`, `/terminal/`, `/chromatin/`, and `/sonic-genome/` experiences remain independent. The Cells explore button opens Cell Lab.

## Implementation map

- `src/lib/backgroundModel.ts` contains validated preferences, route exclusions, the analytic flow field, the toy objective, its gradient, topology-aware contour extraction, and optimizer updates. It has no DOM dependencies.
- `src/lib/backgroundRenderer.ts` is the Canvas2D adapter for Flow and Landscape, shared by their ambient and explorer views. Flow uses midpoint advection; Landscape marks minima and saddle.
- `src/lib/morphStory.ts` supplies the shared seven-stage registry, canonical progress, descriptions, chapter holds, 60-second playback and form-button timing. `src/lib/morphTargets.ts` supplies DOM-free RNA/protein/network/density samplers; `src/data/morphProtein.ts` bundles experimental coordinates and provenance. `src/lib/morphModel.ts` retains deterministic anatomical groups, DNA/cell/expression geometry, six adjacent transitions and exact damped-spring updates. `src/lib/morphRenderer.ts` projects and animates them in Canvas2D using caller-owned scratch points. `src/lib/sceneRenderer.ts` is the unchanged lifecycle interface; its optional progress setter accepts immediate/smooth transitions, and configuration accepts structure labels.
- `src/scripts/background.ts` owns storage, scene switching, homepage scroll chapters, content masks, Astro navigation, visibility, reduced motion, dialogs, and keyboard controls. It lazy-loads drawing adapters only when selected.
- `src/components/BackgroundControls.astro` and `BackgroundExplorer.astro` provide the Appearance choices and opt-in demonstrations. `SiteBackground.astro` provides persistent canvases and early preference hydration.
- Cell physics and the dedicated lab are unchanged. The homepage `HeroBackground.astro` helix appears only with Cells.

The codebase-design skill informed the renderer seam: the controller retains one lifecycle interface while each drawing adapter owns its math, rendering, and cleanup.

## Preferences and lifecycle

The local-storage key remains `khc-background-v1`; its default value is `{ "scene": "cells", "motion": "ambient" }`. `morph` is an additional valid scene value, while all previously saved choices remain valid. Invalid storage falls back safely. Legacy `khc-cell-mode` values migrate once: calm → Cells/Calm, off → Off/Ambient, ambient or lab → Cells/Ambient. Storage failure leaves working in-memory controls, including across Astro navigation. Cross-tab changes replace the active scene and close an open demo.

Only one ambient renderer runs. Cells detach when an alternate is selected; the hero helix stops and hides. Generation tokens discard outdated imports and switches. Navigation disconnects observers and disposes renderers/dialogs. Page visibility, pause, reduced motion, and an open demo gate animation. Selecting foreground text also stops alternate-scene motion. Selection events only update the ambient lifecycle: replacing explorer status text can itself generate a selection event, and must not cancel explicit form transitions. Theme and CRT changes redraw the current frame without resetting simulation state.

## Reading comfort and performance

Flow, Landscape, and Genome to Cell share a cached offscreen clearance mask around text, links, controls, media, header, and footer. A soft shadow feathers each erased rectangle. Layout changes refresh document-coordinate bounds; scrolling repositions the mask without remeasuring every text element. Add `data-background-protected` for complex foreground widgets.

Phone compositions keep their existing asymmetric layout and reading clearance. Flow uses 42 strands on coarse pointers and 90 otherwise, at most 64 samples per strand, and five temporary demo vortices. Genome to Cell uses **1,000/3,200 ambient particles on phone/desktop and 1,600/5,000 in its explorer**. Every group participates in each form, including a separate contextual cloud around DNA. Ordinary content pages have lower opacity than homepage artwork; Calm retains its quieter opacity. DPR is capped at 1.5/2 respectively. Ambient scenes target at most 20/24 FPS; the particle explorer targets 30/60 FPS. Adaptive quality reduces samples within every anatomical group, retaining the nucleus, organelles, and membrane, while lowering cadence to 12 FPS and eventually a static fallback. Density reductions fade over 400ms; fully faded particles skip geometry work. Static compositions still respond to chapter changes. The cell fits its artwork window with a 16px vertical inset.

The particle renderer uses six depth bands, three dot sizes, twelve opacity levels, and three inks: theme accent, text ink, and restrained copper (all collapse into the selected CRT color). Reused typed arrays link particles into drawing buckets without per-frame sorting or per-dot draw calls. Thin paths are subdued structural accents rather than the principal material. Surface samples use independently mixed deterministic coordinates to avoid visible diagonal bands, and front membrane particles remain transparent enough to reveal organelles. An additional 96 phone / 240 desktop decorative stream dots are subdued around molecular/cellular forms and fade out for expression and distribution. Color and outer streams do not encode measured biology. This is Canvas2D, not a new WebGL dependency or a physical molecular simulation.

The homepage DNA is placed above rather than mostly behind the portrait on desktop. All six subsequent art windows are 240px on phones and 260–340px on larger screens, with a 16px vertical inset. They appear only for this scene; four additional windows add about 960px to the phone homepage. Higher homepage opacity is confined by the existing clearance mask; ordinary content and Calm retain their quieter opacity. Idle depth is small and eased mouse input is bounded; expression and distribution settle into flat views. Protein view changes remain rigid. `SceneRenderer.setPointer` is optional, leaving the other scene adapters unchanged. Homepage pointer handlers are passive, never capture input, and reject protected bounds; taps require a short stationary gesture with no scrolling.

`data-bg-ticks` counts updates; `data-bg-frames` includes static redraws. The particle canvas exposes requested and displayed progress separately (`data-bg-progress`, `data-bg-displayed-progress`), plus `data-bg-transitioning`, `data-bg-render-ms`, `data-bg-quality`, `data-bg-allocated`, and `data-bg-visible` for browser audits. Visible counts mean particles submitted before the reading-clearance mask, not the number of individually discernible dots on screen. These are diagnostic attributes, not visitor controls.

Additional diagnostics report the decorative stream budget (`data-bg-atmosphere`), eased hover influence (`data-bg-pointer`), and accepted disturbance count (`data-bg-interactions`). The [Calico reference study](calico_animation_inspiration_2026_09.md) records the primary-source observations and what was deliberately not copied.

## Mathematical and biological interpretation

Flow is procedural computational art, **not** a fluid simulation. Its base velocity is the analytic curl of a smooth four-wave streamfunction plus constant drift, so the base field is divergence-free. Midpoint advection follows the evolving field with less numerical error than one Euler sample. Temporary vortices are illustrative, not Navier–Stokes. Explorer arrows show local velocity direction.

Learning Landscape is a toy objective, **not** a trained model’s measured loss surface:

```text
L(x, y) = ¼(x² − 1)² + ½(y − 0.35x)²
∇L = (x(x² − 1) − 0.35(y − 0.35x), y − 0.35x)
v[t+1] = β v[t] + ∇L(θ[t])
θ[t+1] = θ[t] − η v[t+1]
```

Gradient descent uses β = 0; heavy-ball momentum uses β = 0.85. Both default to (0.45, 1.65) with η = 0.035. The minima are (−1, −0.35) and (1, 0.35); (0, 0) is a saddle. Small gradient and velocity yield **converged**, not proof of a minimum: starting exactly at the saddle stays there. Leaving [−2, 2]² is **outside plot**, not necessarily mathematical divergence; non-finite updates are **diverged**. Four-edge contour cells near the saddle are connected using the centre value. Display interpolation smooths movement without changing the discrete optimizer steps.

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
| Neural model             | 5/6      | Algorithms artwork window        |
| Probability distribution | 1        | Genome browser artwork window    |

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
npm run audit:background:ci
npm run audit:security
python3 scripts/check-jsx-spacing.py src/components/BackgroundExplorer.astro src/pages/index.astro
node scripts/profile-morph.mjs
```

The background audit runs Chromium and WebKit desktop/phone profiles, including 320px controls, light/dark/CRT endpoint screenshots, all seven scroll windows and reverse scrolling, six adjacent midpoints, both sides of every canonical boundary, finite form transitions, labels, interruption/resumption, exact reset, persisted scenes, keyboard switching, modal focus/scroll restoration, independent Cell Lab state, paused ticks, all seven reduced-motion immediate selections, and denied storage. A controlled renderer clock verifies every arrival/hold/midpoint through the complete forward/reverse loop, including reverse pause/resume; existing real slow-callback checks verify wall-time behavior. Injected measured costs exercise the actual .35 minimum-quality branch and capture all seven silhouettes without raising budgets. Model tests independently cover geometry, protein-source fidelity, normalized density area, transitions, quality participation and spring settling. Screenshots go to a reported temporary directory. Use a production preview: the Astro development toolbar itself reads storage without a guard. `npm run audit:background:ci` owns and cleans up its preview of `dist/` on success or failure.

Interaction checks exercise homepage mouse hover and phone taps, verify foreground controls do not disturb particles, and activate **Stir particles** with Enter. The paused explorer must visibly respond, return to its resting canvas, and stop drawing. Phone profiles deliberately deliver animation callbacks 180ms apart to cover loaded browsers. The spring uses real elapsed time and a 1.5-second deadline, separate from the decorative simulation's capped time step; the first rendered frame at or after that deadline clears the disturbance. This prevents low frame rates from extending a brief interaction indefinitely. Reduced motion disables the stir control. For a focused Safari phone pass, use `BACKGROUND_UI_BROWSERS=webkit BACKGROUND_UI_PHONE_ONLY=1 npm run audit:background:ci`.

`scripts/profile-morph.mjs` owns a Chromium browser and production preview, running ambient and explorer sequentially for all seven endpoints and six midpoints on desktop and a 390px phone viewport with 4× CDP CPU throttling. Each pose gets 2 seconds of warmup and at least 3 seconds of collection; only unique `data-bg-ticks` contribute `data-bg-render-ms` samples to nearest-rank p95. Explorer poses stay exact via manual scrubbing and repeated spring stirring rather than drifting through autoplay. Each row reports sample count, minimum adaptive quality and fallback, asserting p95 <6ms desktop / <10ms throttled phone and no static fallback. Results are saved in a temporary JSON artifact. These are local-host JavaScript update/draw costs, not physical-phone rendering, battery use, GPU timing or Core Web Vitals measurements.

Ambient setup waits for fonts, scrolls to expose the relevant sections, waits 650ms for the existing 550ms section-reveal translation to finish, then exercises the normal resize/cache-refresh path and recomputes the settled scroll position. This avoids profiling a first-visit reveal offset as the requested midpoint. Exact canonical inputs remain unchanged; three-decimal diagnostics are compared within .002.

The October 2, 2026 production-preview run passed **all 52 pose/mode/profile checks**, collecting **4,923 unique rendered ticks**. Desktop used 1440×1000 at device scale 1; phone used 390×844 at device scale 3 (renderer DPR cap 1.5) with 4× CPU throttling. Maximum per-pose p95 values and sample ranges were:

| Profile             | Ambient p95 maximum | Explorer p95 maximum | Unique samples per pose (ambient / explorer) |
| ------------------- | ------------------- | -------------------- | -------------------------------------------- |
| Desktop             | 1.9ms               | 2.8ms                | 68–71 / 162–175                              |
| 390px phone, 4× CPU | 3.5ms               | 4.8ms                | 56–58 / 82–84                                |

Every pose retained **quality 1.00**, the approved particle budgets and **no static fallback**. The maximum phone explorer cost occurred between protein and cell; no performance optimization or budget adjustment was necessary. Full per-pose p95/sample values are recorded in the Task 3 validation report and the temporary profiler JSON. The complete Chromium/WebKit desktop/phone browser audit, tests, Astro check, full PDF build, indexing, links, security and JSX spacing checks passed. On this host, the unchanged indexing gate used the already installed MiKTeX `pdftotext` via a process-local PATH prefix because the Homebrew extractor had a broken dylib dependency; no indexing checks were skipped.
