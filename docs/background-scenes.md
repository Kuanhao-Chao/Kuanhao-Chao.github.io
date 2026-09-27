# Switchable ambient backgrounds

## Visitor experience

Open **Appearance** (the theme icon in the header), then **Background**:

- **Cells** remains the default. It preserves the living-cell simulation and the homepage DNA helix.
- **Flow Field** draws gently moving trails. Its explorer adds direction arrows, temporary vortices, flow strength, pause, single step, and reset.
- **Learning Landscape** draws loss contours and optimizer paths. Its explorer compares gradient descent and heavy-ball momentum from a shared starting point, with adjustable step size and method.
- **Genome to Cell** follows a dimensional DNA helix into nuclear chromatin, reveals a translucent eukaryotic cell, and forms an illustrative genomic expression profile. Homepage scrolling guides the story, with slow motion within settled forms; ordinary content pages show a quiet cell. Its explorer offers animated form buttons, a keyboard-operable scrubber, structure labels, pointer nudges, playback, single step, and reset.
- **Off** hides decorative backgrounds, including the hero helix.

**Ambient**, **Calm**, and **Paused** apply to every scene. Reduced-motion preferences override autoplay and show a still composition, but explicit single stepping remains available. The site-wide canvases never intercept clicks, touch scrolling, or trackpad scrolling. Opening a demo suspends the ambient scene, locks document scrolling, and restores focus and reading position on close. Native dialogs provide modal focus containment and Escape dismissal.

Choices persist across ordinary content pages. Dedicated `/lab/`, `/games/`, `/nn-lab/`, `/shorkie-lab/`, `/algorithms/`, `/terminal/`, `/chromatin/`, and `/sonic-genome/` experiences remain independent. The Cells explore button opens Cell Lab.

## Implementation map

- `src/lib/backgroundModel.ts` contains validated preferences, route exclusions, the analytic flow field, the toy objective, its gradient, topology-aware contour extraction, and optimizer updates. It has no DOM dependencies.
- `src/lib/backgroundRenderer.ts` is the Canvas2D adapter for Flow and Landscape, shared by their ambient and explorer views. Flow uses midpoint advection; Landscape marks minima and saddle.
- `src/lib/morphModel.ts` defines deterministic 3D samplers for anatomical groups, staged emergence, scroll/playback progress, and exact damped-spring updates; `src/lib/morphRenderer.ts` projects and animates them in Canvas2D. `src/lib/sceneRenderer.ts` is the shared lifecycle interface; its optional progress setter accepts immediate/smooth transitions, and configuration accepts structure labels.
- `src/scripts/background.ts` owns storage, scene switching, homepage scroll chapters, content masks, Astro navigation, visibility, reduced motion, dialogs, and keyboard controls. It lazy-loads drawing adapters only when selected.
- `src/components/BackgroundControls.astro` and `BackgroundExplorer.astro` provide the Appearance choices and opt-in demonstrations. `SiteBackground.astro` provides persistent canvases and early preference hydration.
- Cell physics and the dedicated lab are unchanged. The homepage `HeroBackground.astro` helix appears only with Cells.

The codebase-design skill informed the renderer seam: the controller retains one lifecycle interface while each drawing adapter owns its math, rendering, and cleanup.

## Preferences and lifecycle

The local-storage key remains `khc-background-v1`; its default value is `{ "scene": "cells", "motion": "ambient" }`. `morph` is an additional valid scene value, while all previously saved choices remain valid. Invalid storage falls back safely. Legacy `khc-cell-mode` values migrate once: calm → Cells/Calm, off → Off/Ambient, ambient or lab → Cells/Ambient. Storage failure leaves working in-memory controls, including across Astro navigation. Cross-tab changes replace the active scene and close an open demo.

Only one ambient renderer runs. Cells detach when an alternate is selected; the hero helix stops and hides. Generation tokens discard outdated imports and switches. Navigation disconnects observers and disposes renderers/dialogs. Page visibility, pause, reduced motion, and an open demo gate animation. Selecting foreground text also stops alternate-scene motion. Selection events only update the ambient lifecycle: replacing explorer status text can itself generate a selection event, and must not cancel explicit form transitions. Theme and CRT changes redraw the current frame without resetting simulation state.

## Reading comfort and performance

Flow, Landscape, and Genome to Cell share a cached offscreen clearance mask around text, links, controls, media, header, and footer. A soft shadow feathers each erased rectangle. Layout changes refresh document-coordinate bounds; scrolling repositions the mask without remeasuring every text element. Add `data-background-protected` for complex foreground widgets.

Phone compositions are deliberately sparse and asymmetric. Flow uses 42 strands on coarse pointers and 90 otherwise, at most 64 samples per strand, and five temporary demo vortices. Genome to Cell uses 300/820 ambient particles on phone/desktop and 340/760 in its explorer. DPR is capped at 1.5/2 respectively. Ambient scenes target at most 20/24 FPS; the particle explorer targets 30/60 FPS. Adaptive quality reduces samples within every anatomical group, retaining the nucleus, organelles, and membrane, before lowering cadence to 12 FPS and eventually a static fallback. Static compositions still respond to chapter changes. The cell fits the existing chapter height with a 16px vertical inset.

`data-bg-ticks` counts updates; `data-bg-frames` includes static redraws. The particle canvas exposes requested and displayed progress separately (`data-bg-progress`, `data-bg-displayed-progress`), plus `data-bg-transitioning`, `data-bg-render-ms`, `data-bg-quality`, and `data-bg-visible` for browser audits. These are diagnostic attributes, not visitor controls.

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

Genome to Cell is **explanatory particle artwork**, with representative anatomy and illustrative relative scales. A deterministic set gives each dot a stable identity and anatomical role. The paired helix rotates once per 45 animation seconds and recedes into nuclear chromatin while its cellular context emerges. The cell includes a nucleolus, an envelope around the nucleus, three varied mitochondria with internal folds, and ER ribbons connected to the nuclear envelope. Membrane motion stays below 1% of cell radius; organelles drift within the cytoplasm. The final profile has upward, nonnegative peaks over genomic position and a faint moving highlight; the profile itself stays fixed and is not measured model output.

References for the anatomical relationships: [NHGRI DNA fact sheet](https://www.genome.gov/about-genomics/fact-sheets/Deoxyribonucleic-Acid-Fact-Sheet), [NCBI nuclear envelope and ER](https://www.ncbi.nlm.nih.gov/books/NBK9927/), and [NCBI mitochondria and cristae](https://www.ncbi.nlm.nih.gov/books/NBK9896/).

At the top of the homepage, a 1.5-second introduction gathers dots into DNA. The viewport centre passing the hero, Research, and Publications chapter centres then determines the form continuously, with exponential settling during scroll. Restored positions initialize directly. Explorer playback holds complete forms for two seconds and takes four seconds per transition, reversing through the cell back to DNA over a 24-second cycle. Explicit form selection takes 900ms and stops after settling; scrubbing and single steps are immediate. Pause/resume retains playback direction. Pointer nudges use an exact critically damped spring and settle in 1.5 seconds without deforming structural surfaces. Reduced motion disables automatic movement and makes explicit form changes immediate; labels remain available.

## Future concepts

Candidates, not scenes in this release: an exon-inclusion splicing ribbon, a chromatin-loop-to-contact-map transformation, and a branching cell-lineage constellation. Each needs its own scientific caveat and the same reading, reduced-motion, and phone-performance checks.

## Verification

```sh
npm test
npm run check
npm run build
npm run audit:indexing
npm run audit:links
npm run preview -- --host 127.0.0.1 --port 4322
BACKGROUND_UI_BASE_URL=http://127.0.0.1:4322 npm run audit:background
CELL_UI_BASE_URL=http://127.0.0.1:4322 npm run audit:cells:ci
```

The background audit runs Chromium and WebKit desktop/phone profiles, including 320px controls, dark/CRT screenshots, scroll-guided morph stages and reverse scrolling, finite form transitions, labels, interrupting a transition with playback, reset, persisted scenes, keyboard switching, modal focus/scroll restoration, independent Cell Lab state, paused ticks, reduced-motion single stepping and immediate form selection, and storage denial. Model tests cover containment, paired helix geometry, chapter continuity, low-quality anatomy, playback holds/resumption, and frame-rate-independent spring settling. Screenshots go to a temporary directory reported by the audit. Use a production preview: the Astro development toolbar itself reads storage without a guard. `npm run audit:background:ci` starts its own preview of `dist/` after a build.

The September 2026 redesign's local Chromium profiling measured p95 update-and-draw costs of 0.5ms for both desktop modes, and 1.4ms ambient / 1.6ms explorer with a 390px phone viewport and 4× CPU throttling. All samples retained full particle quality with no static fallback. These measurements cover JavaScript update/draw work on the local host; physical-device rendering and battery use require device testing.
