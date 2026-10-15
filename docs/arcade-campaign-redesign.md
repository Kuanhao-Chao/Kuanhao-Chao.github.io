# Proofreader, Snake and Jetpack — implementation record

Approved direction: six crafted stages per game; original retro pixel art; precise,
fair arcade play; cosmetic-only rewards; classic quick-play and unranked practice.
Snake retains a classic campaign with a separate optional Motif Hunt.

The implementation keeps deterministic rules in the existing pure game modules,
with a small shared browser adapter for menus, progress, audio, input ownership,
theme changes and lifecycle. It does not unify the three simulation engines.
Progress and personal records use rules version 2; older scores are historical.

## Delivery checklist

- [x] Shared campaign/progress rules and responsive shell
- [x] Proofreader campaign, combat, pixel renderer and tests
- [x] Snake campaign, queued controls, Motif Hunt and tests
- [x] Jetpack authored encounters, physics, pixel renderer and tests
- [x] Focused browser audit and visual review
- [ ] Complete unit/type/build/indexing/link/security verification
- [ ] Focused commits, release push, deployed smoke checks

## Biology and accessibility references

- [Scheuermann and Echols, 1984](https://pmc.ncbi.nlm.nih.gov/articles/PMC392229/):
  bacterial Pol III ε editing versus α polymerization. The raycaster is a metaphor,
  not a simulation of shooting established variants or of all repair pathways.
- [NHGRI RNA](https://www.genome.gov/genetics-glossary/Ribonucleic-Acid-RNA):
  A/C/G/T pickups are DNA-themed supplies, not a synthesized RNA transcript.
- [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html):
  aim for at least 44×44 CSS-pixel controls, with larger primary touch actions.
- [W3C flash guidance](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html):
  use steady warning shapes and progress indicators, not strobes.
- [Xbox input guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/107):
  remapping, digital alternatives and complete keyboard access.

## Release constraints

Keep the existing routes and all fifteen software rows in their original order.
Do not add game/browser matrices to push CI. Full audits remain local/manual.
Initial disk availability was about 541 MiB; a final production build requires
additional room. Failed or skipped verification must never be reported as passing.

## Implemented behavior

Campaign identity, challenge links and progress normalization live in
`src/lib/arcade.ts`. Each existing game module retains its own deterministic rules.
The shared browser adapter owns focus, settings, sound, records and clock scheduling;
it never infers hits or awards gameplay points from animation state.

- **Proofreader:** six authored cover layouts, guaranteed supplies, relay objectives,
  insertion charge windups, cover-blocked projectiles, a guarded/exposed guardian,
  a three-charge piercing pulse, directional damage feedback and bounded entities.
  Three medals: clear, 70% shot accuracy, no damage. An aligned piercing shot counts
  once for accuracy even if it hits several targets.
- **Snake:** six connected gardens with goals 8/12/16/20/24/28, a two-turn queue,
  pointer-move swipe recognition, a directional pad, optional bonus chips, and
  separate Motif Hunt. Three medals: clear, par time, bonus chip. Collection history
  is explicitly DNA-themed pickup history, not RNA synthesis.
- **Jetpack:** six timed routes, encounter ordering, a constructive physics-based
  escape witness checked before an encounter is published, locked missile warnings,
  swept collision tests, shields, magnets, collection chains and one-time near-miss
  bonuses. Three medals: clear, collection quota, no shield spent. The escape
  witness is not a claim that arbitrary player inputs are safe.

All three have Campaign, Classic/Endless and unranked Practice, Standard/Expert,
versioned seed links, local records separated by difficulty and assistance, and
four cosmetic palettes unlocked without permanent gameplay advantages. Old scalar
best-score keys are retained as historical records and never overwritten.

Artwork is original code-native pixel data: 320×240 for Proofreader, 272×272 for
Snake, 384×256 for Jetpack. Nearest-neighbor scaling keeps it crisp. Cosmetic drawing
does not advance gameplay RNG. Menus and instructions use readable HTML text.

## Regression findings

The real-browser pause regression exposed a native focus timing issue: a microtask
inside `focusout` observed transient BODY focus before `focusin` on Pause. The game
paused early, so clicking Pause resumed it. The adapter now checks `relatedTarget`
and defers only unresolved focus destinations to the next task.

Additional real-browser checks cover mouse fire while moving, keyboard activation
of the Thrust button followed by focus movement, release/cancel/blur handling, and
pausing when the canvas—not merely the containing help section—leaves the viewport.

The browser campaign agents use legal input methods and read the real game state;
they never teleport, grant health or force victory. They verify completion,
stage-to-stage transitions, saved unlocks and cosmetic persistence. Their precise
aiming/pathfinding is **not** a substitute for human difficulty/balance feedback.

## Local and manual commands

```sh
npm test
npm run check
# Use an existing dev server while iterating on a disk-constrained machine:
GAME_UI_AUDIT_BASE_URL=http://127.0.0.1:4321 npm run audit:arcade
GAME_UI_AUDIT_BASE_URL=http://127.0.0.1:4321 ARCADE_UI_DIFFICULTY=expert npm run audit:arcade -- --campaigns-only --quick
ARCADE_TEST_BROWSERS=chromium,webkit ARCADE_TEST_GAMES=proofreader,snake,jetpack-joyride npm run test:arcade-controls
GAME_UI_AUDIT_GAMES=proofreader,snake,jetpack-joyride GAME_UI_AUDIT_BASE_URL=http://127.0.0.1:4321 npm run audit:games
```

`audit:arcade` owns a built-site preview if no base URL is supplied. Its full matrix
covers both engines, all six themes, 1440/390/320-pixel widths and 844×390 landscape.
`--quick`, `--campaigns-only`, `--presentation-only`, `ARCADE_UI_BROWSERS`, and
`ARCADE_UI_GAMES` allow focused runs. Artifacts go to `/tmp/khc-arcade-campaigns`.
The small control regression expects a running server (default port 4321).

After sufficient space is available, the release still requires `npm run build`,
immediately followed by `npm run audit:indexing`, then link/security audits and
live checks. Do not infer a production build pass from a development-server audit.
