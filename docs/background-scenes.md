# Switchable ambient backgrounds

## Visitor experience

Open **Appearance** (the theme icon in the header), then **Background**:

- **Cells** is the default and preserves the existing cell simulation and homepage DNA helix.
- **Flow Field** draws quiet, curved streamlines. Its explicit exploration dialog allows temporary vortices, a flow-strength slider, pause, single step, and reset.
- **Learning Landscape** draws contours and optimizer paths on an illustrative two-dimensional objective. Its exploration dialog compares gradient descent and heavy-ball momentum, with editable step size and shared starting coordinates, method selection, pause, single step, and reset.
- **Off** hides all site decoration, including the homepage helix.

Motion is independent: **Ambient**, **Calm**, or **Paused**. Reduced-motion preferences always override autoplay, including inside a demo; single stepping remains available. Opening a demo suspends the ambient scene, locks document scrolling, and restores focus and reading position on close. Native dialogs supply modal focus containment and Escape dismissal. Background canvases never intercept scrolling or clicks.

Selection is remembered across ordinary content pages. Dedicated `/lab/`, `/games/`, `/nn-lab/`, `/shorkie-lab/`, `/algorithms/`, `/terminal/`, `/chromatin/`, and `/sonic-genome/` experiences are independent. The Cells explore button opens Cell Lab.

## Implementation map

- `src/lib/backgroundModel.ts`: validated preference values, route exclusions, deterministic flow, objective, analytic gradient, contour extraction, and discrete optimization steps. No DOM dependencies.
- `src/lib/backgroundRenderer.ts`: shared Canvas2D renderer for ambient and demo views. Owns animation timing, bounded trails, static frames, palette, viewport/DPR sizing, and disposal.
- `src/scripts/background.ts`: one site lifecycle controller. Owns storage, scene switching, content masks, Astro navigation, page visibility, reduced motion, dialogs, and keyboard controls. Lazy-loads the two new renderers only when needed.
- `src/components/BackgroundControls.astro`: scene and motion radio groups in the existing Appearance popover.
- `src/components/BackgroundExplorer.astro`: accessible demonstration controls and native dialog.
- `src/components/SiteBackground.astro`: persistent decorative canvases, early preference hydration, and print suppression.
- Existing `livingCellsEngine.ts` now has a background-only suspension control; lab attachment clears it. `HeroBackground.astro` follows the same scene/motion choice.

The codebase-design skill informed the small shared renderer interface: ambient and demo views reuse mathematics, drawing, and cleanup instead of implementing parallel simulations. Cell physics were not rewritten.

## Preferences and lifecycle

The versioned local-storage key is `khc-background-v1`, containing `{ "scene": "cells", "motion": "ambient" }`. Invalid values fall back safely. Legacy `khc-cell-mode` values migrate once: calm → Cells/Calm, off → Off/Ambient, ambient or lab → Cells/Ambient. The new preference is independent of later Cell Lab writes. Storage failure leaves working in-memory controls; in-memory choices also survive Astro navigation. Cross-tab preference changes close an open demo and replace the active scene.

Only one ambient renderer runs. Cells detach when an alternate scene is selected; the helix stops and is hidden. Generation tokens discard outdated lazy-import and switch results. Navigation disconnects observers and disposes renderers/dialogs. Page visibility, pause, reduced motion, and an open demo gate animation; selecting foreground text additionally stops alternate-scene motion. Theme/CRT changes redraw the current frame without resetting simulation state.

## Reading comfort and performance

Flow Field and Learning Landscape use a cached offscreen clearance mask around text, links, controls, media, header, and footer. A soft shadow feathers each fully erased content rectangle. Layout changes refresh document-coordinate bounds; scrolling repositions the mask without remeasuring every text element. Use `data-background-protected` for additional complex foreground widgets.

Phone compositions are intentionally sparse and asymmetric rather than scaled-down desktop screenshots. Flow uses 28 strands on coarse pointers and 90 otherwise, with at most 64 samples per strand and five temporary vortices. New scenes cap DPR at 1.5 on coarse pointers and 2 otherwise, and target at most 20/24 FPS respectively. Integration uses bounded substeps. Sustained expensive frames lower quality/cadence, then fall back to a static frame. `data-bg-ticks` counts animation updates; `data-bg-frames` also includes necessary static layout/palette redraws.

## Mathematical interpretation

Flow is procedural computational art, not a physical fluid simulation. The base velocity is the analytic curl of a smooth four-wave streamfunction, plus constant drift. Its base field is divergence-free; temporary demo vortices are illustrative interactions, not a Navier–Stokes solver.

The landscape is a toy objective, **not** a trained model's measured loss surface:

```text
L(x, y) = ¼(x² − 1)² + ½(y − 0.35x)²
∇L = (x(x² − 1) − 0.35(y − 0.35x), y − 0.35x)
v[t+1] = β v[t] + ∇L(θ[t])
θ[t+1] = θ[t] − η v[t+1]
```

Gradient descent uses β = 0; heavy-ball momentum uses β = 0.85. Both begin at (0.45, 1.65), with η = 0.035, by default. Contours are extracted over [−2, 2]²; mathematical tests compare the gradient with finite differences and verify contour-level residuals. Display interpolation smooths motion between discrete optimizer steps without changing the underlying updates.

The minima are (−1, −0.35) and (1, 0.35); (0, 0) is a saddle. Small gradient/velocity yields a **converged** status, which is not proof of finding a minimum: starting exactly at the saddle stays there. Leaving the displayed domain is reported as **outside plot**, not mathematical divergence. Non-finite updates are separately reported as **diverged**. Paths stop at the last valid point rather than silently clamping values; reset after changing an unstable configuration.

## Verification

```sh
npm test
npm run check
npm run build
npm run audit:indexing
npm run preview -- --host 127.0.0.1 --port 4322
BACKGROUND_UI_BASE_URL=http://127.0.0.1:4322 npm run audit:background
CELL_UI_BASE_URL=http://127.0.0.1:4322 npm run audit:cells:ci
```

The background audit runs Chromium and WebKit desktop/phone profiles, including 320px controls, dark/CRT screenshots, persisted scenes, keyboard switching, modal focus/scroll restoration, independent Cell Lab state, paused simulation ticks, reduced-motion single stepping, and storage denial. Screenshots go to a temporary directory reported by the audit. Use a production preview for the storage-denial case: Astro's development toolbar itself reads storage without a guard.

No deployment or push is part of this change. Review the local preview before publishing.
