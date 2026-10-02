# Homepage and Animation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Finish the approved homepage, terminal, two-scene background, and luminous animation upgrade.

**Architecture:** Reuse the current isolated feature worktree and Claude's changes. Keep pure motion
math separate from the Canvas renderer; the controller owns visibility, preferences, and masks.
Existing typed particle buffers and science targets remain the foundation.

**Tech Stack:** Node 22, Astro, TypeScript, Canvas2D, Vitest, Playwright Chromium/WebKit.

**Spec:** `docs/superpowers/specs/2026-10-02-homepage-and-animation-polish-design.md`

## Global Constraints

- Supported scene ids are `cells | morph | off`; Off remains an accessibility choice.
- Migrate an obsolete or unknown saved scene to Cells while retaining valid saved motion.
- Particle budgets remain ambient 1000/3200 and explorer 1600/5000 (phone/desktop).
- DPR remains 1.5/2; frame caps remain ambient 20/24 and explorer 30/60 FPS.
- All animated effect counts and life amplitude are zero in Paused, reduced motion, and static fallback.
- All artwork, including new passes, uses the existing reading-clearance mask.
- Calm effect amplitude is 0.45 of Ambient.
- No new dependencies, WebGL, homepage labels, physics changes, or changes to scientific target geometry.
- Preserve Claude's existing changes and already committed publication/homepage work.
- No push or deploy until the user explicitly requests publication.

## Review Focus

1. Minimize during a demo character: restore must resume, with no hidden takeover listener or fetch (Task 1 browser gate).
2. Unknown scene with valid Calm/Paused: inline and hydrated resolution must preserve motion (Task 2 browser and unit gates).
3. Theme/reduced-motion changes while running: cached light effects must repaint or disappear without stale streaks (Task 4 browser gate).
4. Resize/terminal expansion mid-story: all chapter targets must remain ordered and helix fit must survive phone widths (Task 4 browser gate).
5. Explorer disposal/reopen or external port ownership: state and servers must clean up without affecting another preview (Task 5 profiler regression).

## Existing baseline

Base `0ee7897b` already includes eLife, four papers, and removal of homepage Algorithms.
Six dirty terminal files are adopted inputs, not to be reset. Independently observed:
4172 passing / 350 skipped unit tests; 433 files checked with 0 errors/warnings;
195-page full build, indexing/links/security green. Chromium phone-light terminal audit is RED:
`homepage did not resume page scrolling at transcript bottom`.
Controlled browser CSS experiment: `.hero-text { display:block }` restores native chaining;
changing hero overflow alone does not. This is a starting hypothesis, not a mandatory CSS solution.

### Task 1: Finish the collapsed hero terminal and native phone scrolling

**Files:** Modify/adopt `src/components/Hero.astro`, `HomeTerminal.astro`,
`src/pages/index.astro`, `src/scripts/terminal.ts`, `src/styles/terminal.css`,
`scripts/audit-terminal-ui.mjs`.

**Interfaces:** Preserve terminal mount/boot APIs and existing selectors.
The DOM sequence is About my name → hero-terminal → hero-actions.
The visible demo owns its timer and document takeover listener.

- [ ] Read the six existing diffs and preserve them. Reproduce the existing wheel-boundary audit failure:
  `TERMINAL_UI_AUDIT_BROWSERS=chromium TERMINAL_UI_AUDIT_PROFILES=phone-light npm run audit:terminal:ci`.
- [ ] Repair the native scrolling/layout seam; use normal block flow on phones if it preserves
  visual hierarchy and width. Keep `minmax(0,1fr)` sizing and `min-width:0` where necessary.
  Restore must measure columns, refresh prompt, then `scrollToEnd(false)`.
  Example visibility contract:
  ```ts
  if (minimised || closed) suspendDemo();
  else { refreshPrompt(); scrollToEnd(false); armDemo(); }
  ```
- [ ] Verify collapsed typing does not take over/fetch; yellow/bar restores start/resume;
  minimize/close remove listeners and stop timers; chrome does not count as interaction;
  reduced motion and full /terminal/ route still work. Extend actual browser assertions only
  where the adopted audit lacks a behavior, not source-text checks.
- [ ] Run full terminal CI audit, edited-Astro spacing check, Astro check, and unit suite once.
  Review phone/desktop collapsed and expanded screenshots; record concrete results.
- [ ] Explicitly stage only these six paths and commit `Finish the collapsed homepage terminal and native scrolling`.
  Report adopted vs newly changed behavior, RED/GREEN evidence, files, concerns, and screenshot paths.

### Task 2: Retire alternate scenes without losing saved accessibility preferences

**Files:** Delete `src/lib/backgroundRenderer.ts`. Modify `src/lib/backgroundModel.ts`,
`backgroundModel.test.ts`, `sceneRenderer.ts`, `src/components/SiteBackground.astro`,
`BackgroundControls.astro`, `BackgroundExplorer.astro`, `src/scripts/background.ts`,
and `scripts/audit-background-ui.mjs`.
Verify unchanged `src/lib/morphRenderer.ts` already handles only `options.labels`;
modify it only if narrowing SceneRenderer exposes a concrete incompatibility.

**Interfaces:** Preserve Point, BACKGROUND_KEY, BackgroundMotion, BackgroundPreference,
backgroundRouteAllowed, SceneRenderer lifecycle. Narrow `configure(options:{labels?:boolean}):void`.
`resolveBackground(raw:string|null,legacy:string|null):BackgroundPreference` remains stable.

- [ ] Read consumers before removing flow/landscape-exclusive functions. Add failing preference tests:
  ```ts
  expect(resolveBackground('{"scene":"flow","motion":"calm"}', null))
    .toEqual({ scene: 'cells', motion: 'calm' });
  expect(resolveBackground('{"scene":"landscape","motion":"paused"}', null))
    .toEqual({ scene: 'cells', motion: 'paused' });
  expect(resolveBackground('{"scene":"future","motion":"paused"}', 'off'))
    .toEqual({ scene: 'cells', motion: 'paused' });
  ```
  Observe RED; keep malformed/legacy/denied-storage and valid current-scene coverage.
- [ ] Implement supported scenes and migration preserving valid motion; mirror the exact policy
  inline before hydration. Retain the inline script for early paint, rather than delaying resolution.
  Delete only unused flow/landscape math and renderer, not similarly named algorithm-page features.
- [ ] Remove the two buttons and explorer controls/legend/styles. Controller attaches only morph
  renderer, while Cells keep their existing engine. Remove exclusive handlers and configure fields.
- [ ] Retarget UI tests from old scenes to Cells ↔ Morph/Off, preserving keyboard, modal/history,
  compact layout, suspended/reduced behavior, and all seven forms. Add browser migration assertions
  before hydration and after hydration for saved Calm and Paused obsolete preferences.
- [ ] Run focused tests RED→GREEN, Astro check, JSX checks, background CI audit and full unit suite once.
  Explicitly stage listed paths and commit `Keep two background scenes and migrate saved preferences`.

### Task 3: Add deterministic, allocation-conscious stage-life mathematics

**Files:** Create `src/lib/morphLife.ts` and `src/lib/morphLife.test.ts`.

**Interfaces:** Export `LifeClock { time:number; amount:number }` (time seconds; amount 0..1).
Clamp/sanitize non-finite inputs. Export these exact signatures; optional output objects allow reuse:
  ```ts
  readHead(clock:LifeClock,out?:LifePacket):LifePacket;
  networkPackets(edge:number,clock:LifeClock,out?:LifePacket):LifePacket;
  rainSample(i:number,clock:LifeClock,out?:LifeRain):LifeRain;
  turntableYaw(clock:LifeClock):number;
  streakStrength(dx:number,dy:number,clock:LifeClock):number;
  bokehDot(i:number,clock:LifeClock,out?:LifeBokeh):LifeBokeh;
  // LifePacket { t:number; alpha:number }
  // LifeRain { x:number; y:number; alpha:number } normalized density x in [-1,1], y in [0,1]
  // LifeBokeh { x:number; y:number; radius:number; alpha:number }
  ```
Negative time wraps periodically; indices normalize deterministically.
Read-head period 12 s; edge packet period 4 s with deterministic per-edge phase;
sample fall period 7 s; protein yaw bounded ±0.16 radians; bokeh alpha ≤0.05,
radius 2..6 CSS px. Life amount scales alpha/yaw/streak strength linearly; zero suppresses
every effect. The controller passes 0.45 for Calm and 0 for non-animation.
Rain x uses deterministic stratified standard-normal quantiles truncated to ±3.5
(normalized drawing domain), not uniform x and not a claim about calibrated uncertainty.

- [ ] Write independent, behavior-based tests and observe missing-module RED:
  ```ts
  expect(readHead({time:0,amount:1})).toEqual({t:0,alpha:1});
  expect(readHead({time:12,amount:1})).toEqual({t:0,alpha:1});
  expect(turntableYaw({time:Math.PI/0.25,amount:1})).toBeCloseTo(0);
  expect(streakStrength(24,0,{time:0,amount:1})).toBe(1);
  expect(streakStrength(24,0,{time:0,amount:0})).toBe(0);
  ```
  Cover finiteness, periodicity, output reuse, zero amount, Calm ratio, bounds,
  deterministic identities, and normal quantile symmetry/central concentration.
- [ ] Implement bounded pure functions. Use stable deterministic phases and cache rain quantiles
  at module initialization rather than doing inverse-CDF work per frame. Use optional output
  parameters; no browser/global-time dependency. Yaw is `0.16 * amount * sin(time * 0.25)`;
  streak strength is `amount * min(1,hypot(dx,dy)/24)`.
- [ ] Run focused RED→GREEN and full unit suite once; review no-amount and bad-input behavior.
  Stage the two files and commit `Add deterministic life motion for the genome story`.

### Task 4: Render luminous, fitted, stage-specific artwork within existing budgets

**Files:** Modify `src/lib/morphRenderer.ts`, rendering-only sections of
`src/lib/livingCellsEngine.ts`, `scripts/audit-background-ui.mjs`.
Test `src/lib/livingCellsEngine.test.ts` and any extracted pure fitting calculation.
Create `src/lib/morphLighting.ts` only if needed for cached palette sprites/buffers; keep
it strictly rendering support rather than a second controller. Add behavioral tests for any pure
fit/light calculation extracted. HeroBackground receives palette parity corrections only if measured.

**Interfaces:** Consume Task 3 LifeClock and functions verbatim. Retain SceneRenderer lifecycle,
setProgress/getProgress, data-bg diagnostics and mask contract. Add `data-bg-life`,
`data-bg-streaks`, `data-bg-glow`, `data-bg-rain`, `data-bg-packets`, `data-bg-bokeh`.
Life is 1 Ambient / 0.45 Calm only when canAnimate(), otherwise 0.

- [ ] Measure current Cells and morph rendering and capture before images. Write/reproduce failing
  actual browser assertions for hero DNA fit and nonzero life/effect diagnostics; add focused
  math tests before an extracted fit helper. Reuse existing seven-form/control audit helpers.
- [ ] Fit DNA origin from its measured conservative projected half-width and a 16 px inset;
  if necessary reduce the common scale (not individual axes) so the full helix fits.
  Add copper/accent strands, gradient rungs, read-head bead, and modestly increased line alpha.
  Example origin contract:
  ```ts
  originX = Math.min(Math.max(requestedOriginX, 16 + halfWidth), width - 16 - halfWidth);
  ```
- [ ] Cache theme-native radial sprites outside frame rendering and rebuild them in refreshPalette.
  Draw ≤100/250 hot particles; ≤12/28 bokeh dots with alpha ≤0.05 and 1.6× parallax.
  Use light source-over vs dark/CRT lighter, restore canvas state, then apply the shared mask.
- [ ] Add reusable previous XY/visibility buffers and ≤floor(particleCount/3) streaks in two batched
  paths only during transitions, when animation is enabled and quality≥0.6. Reset history on
  resize, reset, mode change, resume/discontinuous progress so no first-frame teleport streaks.
- [ ] Draw network packets on network edges, quantile sample rain at density, and add bounded rigid
  protein yaw without deforming the bundled coordinates. RNA/cell/expression science targets stay.
  All new effects have amplitude/count zero on Paused/reduced/static fallback and respect masks.
- [ ] Improve existing Cells renderer only: alpha ≤0.75 Ambient / ≤0.45 Calm, thin membrane rim,
  gentle dark-theme glow. Do not change engine/physics/population. Check HeroBackground palette parity.
- [ ] Extend browser audit with width-fit, positive effect counts for applicable active stages,
  zero counts on Paused/reduced, Calm amplitude, theme/CRT cache repaint, resize/collapsed terminal,
  and saved legacy-scene preservation. Retain DOM accessibility and reading clearance checks.
- [ ] Run focused tests and audits while iterating, then full unit suite and Astro check once;
  run cell CI audit and background CI audit with verdict lines. Explicitly stage only touched
  scope files and commit `Add luminous motion and depth to the genome background`.
  Record effect caps, screenshots, measurements, any tradeoffs and exact validation.

### Task 5: Document, inspect, and verify the complete unreleased website

**Files:** Modify `docs/background-scenes.md`, `CLAUDE.md`, `README.md`, and
`docs/superpowers/specs/2026-10-02-homepage-and-animation-polish-design.md`.
Create a concise observed-results record at `docs/superpowers/verification/2026-10-02-homepage-and-animation-polish.md`.
Modify profiler/audit code only to fix a concrete failing check; report it before broadening scope.

**Interfaces:** Read actual final two-scene UI, Task 4 diagnostics and existing
`scripts/profile-morph.mjs` output. No product changes in this task.

- [ ] Read writing-for-agents skill before CLAUDE.md changes. Rewrite background docs for Cells,
  Genome → Cell, Off; all seven stages, stage-life effects, caps, science caveats, mask/accessibility.
  README: four homepage publications and four recent news, no homepage Algorithms teaser.
  CLAUDE.md: short pointers/traps for terminal visibility, mirrored storage migration, seven chapters,
  cached effect lifecycle/caps. Avoid duplicating source configuration unnecessarily.
- [ ] Run unit suite, Astro check, all edited-Astro spacing check, full `npm run build`, immediately
  `env PATH="/Users/chaokuan-hao/bin:$PATH" npm run audit:indexing`, then links/security audits.
  Existing MiKTeX pdftotext override is host-only, not an indexing-standard relaxation.
- [ ] Run terminal/cells/background CI browser gates. Run profiler port ownership regression;
  then run 52-case profiler alone (no concurrent browser/build work), require p95<6 ms desktop/
  <10 ms 390px phone4×CPU, quality1/no fallback. Record actual counts/timings, not inferred passes.
- [ ] Visually inspect Chromium/WebKit×1440/768/390/320×light/dark/amber CRT, hero collapsed and
  expanded, all seven windows and explorer. Capture two 0.5s transition filmstrips and inspect
  selected representative captures; record exact matrix/limitations. Check paused, Calm, reduced,
  storage denied and legacy Flow. Use owned preview; close it at end; no extra dist copies.
- [ ] Record observed evidence and baseline warnings separately (105 Astro hints, Vite chunk
  warning, pre-existing dependency advisories); mark spec implementation verified but unreleased.
  Explicitly stage these docs and commit `Document and verify the polished homepage backgrounds`.

## Final review and integration

Controller performs a most-capable-model whole-branch review from `3d65d34d` to final HEAD,
including inherited seven-stage and Claude commits. Follow the SDD single final fix wave and
scoped re-review. Re-check origin/main and older branch tips; local fast-forward main only if
unchanged and all gates green. Do not push/deploy without explicit publication authorization.
