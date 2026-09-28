# Calico animation study — September 2026

Inspected on 2026-09-27 to inform an original extension of Genome → Cell. This is a design study, not a reproduction of Calico's implementation. No Calico shaders, shape data, textures, fonts, or other assets are included in our site.

## What the current reference actually does

**Visual evidence.** Desktop captures of the live homepage show a dense orange/gold particle sculpture against a dark green field, surrounded by much fainter particles. The sculpture and headline change during the introduction. Bright detail is concentrated into an irregular, recognizable mass rather than distributed uniformly over the screen. Content below the hero returns to a quiet light background. These observations concern the captured desktop experience, not every viewport or animation state. [Live homepage](https://www.calicolabs.com/)

**First-party code evidence.** The currently linked bundle configures 60,000 main particles with individual size, alpha, speed, and curve-progress attributes. Its custom shader samples shape curves, varies transition timing spatially, and applies turbulence to a subset of particles. Point size responds to camera depth. Shape transitions also change speed, position randomness, and color mix; transformation is not just coordinate interpolation. Camera pan and rotation ease toward mouse position. The renderer adds restrained bloom and low-opacity atmospheric layers. These are configured mechanisms, not measured visible-particle counts or performance results. [Homepage animation bundle](https://www.calicolabs.com/wp-content/themes/calico/assets/build/main.js?ver=1780703928)

**Responsive evidence.** The bundle caps device-pixel ratio at 1.5 and updates dimensions on resize. The stylesheet gives the hero viewport-relative height and changes headline size below 768px. This establishes responsive handling, not proof of satisfactory performance on physical phones. [Bundle](https://www.calicolabs.com/wp-content/themes/calico/assets/build/main.js?ver=1780703928), [stylesheet](https://www.calicolabs.com/wp-content/themes/calico/assets/build/main.css?ver=1779466017)

**Accessibility boundary.** Reduced-motion checks exist elsewhere in the bundle, and the stylesheet disables some UI transitions. The inspected hero initialization does not establish that its particle animation honors that preference. Do not infer either full compliance or a confirmed failure from this static inspection. Cookie-consent overlays also obscured parts of phone captures; that is not evidence of an animation failure. [Bundle](https://www.calicolabs.com/wp-content/themes/calico/assets/build/main.js?ver=1780703928), [stylesheet](https://www.calicolabs.com/wp-content/themes/calico/assets/build/main.css?ver=1779466017)

## Transferable principles and our interpretation

The following are design inferences and implementation recommendations, not claims about Calico:

1. **Contrast creates density.** A restrained field of dim dots makes selected bright clusters look richer. Retain our teal identity, add a small copper highlight population, and vary depth/opacity instead of making every particle equally prominent.
2. **Separate structure from atmosphere.** Keep the anatomical point cloud legible; give a smaller decorative population wider curved trajectories. Decorative streams must not be mistaken for measured molecular transport or gene-expression data.
3. **Choreograph changes in energy.** Let transitions briefly spread particles and strengthen highlights, then settle into quieter forms. Use bounded envelopes that vanish at endpoints so reverse scrubbing stays continuous.
4. **Create depth without a moving camera spectacle.** Apply slight eased perspective/parallax, with stronger displacement for near particles. Transform labels with their anatomical anchors and keep the cell within its existing composition bounds.
5. **Offer an invitation, not an obstacle.** A short pointer/tap disturbance in open artwork areas can reveal responsiveness. It must not intercept links, selected text, touch scrolling, or foreground controls. Provide an explicit keyboard-operable explorer action as well.
6. **Reserve intensity for deliberate viewing.** Use the richest effect in the explorer and homepage art gaps. Ordinary reading pages retain subdued motion and the existing text-clearance mask.

## Implementation and verification guardrails

- Build original analytic geometry and motion in the existing Canvas2D model/renderer seam. Calico's GPU particle count is not a Canvas2D target; preserve our adaptive budgets and measure actual update/draw cost.
- Keep interaction displacement bounded, spring-settled, and independent of chapter progress. Paused and reduced-motion modes remain still; explicit form changes remain available without automatic movement.
- Preserve the DNA → nuclear chromatin relationship. Atmospheric dots may reveal cellular context, but the artwork must not imply that DNA literally becomes a membrane or mitochondria.
- Compare desktop/phone screenshots and transition recordings, including dark/CRT themes, text protection, reverse scrolling, click-through behavior, and repeated interaction. Check the minimum-quality scene still contains every anatomical group.
- Audit motion preferences directly in our implementation. Do not adopt uncertain accessibility behavior from the reference.

The live-browser study was captured locally under a temporary `khc-calico-study-*` directory. Those screenshots and recordings are review artifacts, not website assets. Source URLs are time-specific observations and may change independently of this repository.
