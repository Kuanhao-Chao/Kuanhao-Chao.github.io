# Seven-stage Genome → Cell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship the approved seven-form particle story with scroll chapters and a complete accessible explorer.

**Architecture:** Keep the Canvas2D lifecycle adapter. A shared story registry defines stage identity, progress, playback, chapter holds and descriptions; pure target samplers supply deterministic geometry; the renderer and controller consume these contracts.

**Tech Stack:** Astro, TypeScript, Canvas2D, Vitest, Playwright, Node 22.

**Spec:** docs/superpowers/specs/2026-10-01-seven-stage-genome-to-cell-design.md

## Global Constraints

- Node 22 and Astro; Canvas2D; no new runtime dependency or WebGL rewrite.
- Scene name remains Genome → Cell; storage key remains khc-background-v1; scene identifier remains morph; Cells remains the default.
- Canonical progress values are index / 6 in the approved order; Cell remains 0.5.
- Stable deterministic particle identities across forms; no regeneration while scrolling.
- Phone/desktop particle budgets remain 1000/3200 ambient and 1600/5000 explorer.
- Phone/desktop DPR caps remain 1.5/2; ambient cadence caps remain 20/24 FPS; explorer caps remain 30/60 FPS.
- Honor paused, calm, reduced motion, visibility, text selection, modal suspension, masks and input pass-through.
- No network request is needed to display any animation target.
- Probability finale is an illustrative normalized standard-normal density of a standardized response; it is not measured or calibrated Shorkie uncertainty.

## Task 1: Pure story and target geometry

**Files:** Create src/lib/morphStory.ts, src/lib/morphTargets.ts, src/data/morphProtein.ts and focused tests; modify src/lib/morphModel.ts and src/lib/morphModel.test.ts.

**Interfaces consumed:** Existing MorphPoint, MorphParticle, deterministic identity, sampleCellParticle, sampleDna, signalHeight, particleVisibility and springStep from morphModel.ts. Imports of these types in morphTargets.ts must be type-only, preventing a runtime cycle.

**Interfaces produced:**

```ts
export type MorphStageId = 'dna' | 'rna' | 'protein' | 'cell' | 'signal' | 'network' | 'distribution';
export const MORPH_STAGES: readonly { id: MorphStageId; label: string; progress: number; description: string }[];
export interface MorphChapter { id: MorphStageId; center: number; holdRadius: number }
export function storyProgress(focus: number, chapters: readonly MorphChapter[]): number;
export function stageWeight(progress: number, id: MorphStageId): number;
export function stageDescription(progress: number): string;
export function playbackProgress(seconds: number): number;
export function playbackTime(progress: number): number;
export function transitionDuration(from: number, to: number): number;
export function smootherstep(value: number): number;
// morphTargets.ts
export function sampleRnaBackbone(t: number, time: number, out: MorphPoint): void;
export function sampleRnaParticle(p: MorphParticle, time: number, out: MorphPoint): void;
export function sampleProteinBackbone(t: number, out: MorphPoint): void;
export function sampleProteinParticle(p: MorphParticle, out: MorphPoint): void;
export const NETWORK_LAYERS: readonly number[];
export const NETWORK_EDGES: readonly (readonly [number, number])[];
export const NETWORK_NODE_COUNT: number;
export function sampleNetworkNode(index: number, out: MorphPoint): void;
export function sampleNetworkEdge(index: number, t: number, out: MorphPoint): void;
export function sampleNetworkParticle(p: MorphParticle, out: MorphPoint): void;
export function normalDensity(x: number): number;
export function sampleDistributionParticle(p: MorphParticle, out: MorphPoint): void;
```

Keep existing sampleMorph(p, progress, time, out, scratch) signature. Re-export storyProgress/playbackProgress/playbackTime from morphModel.ts for source compatibility; update the controller in Task 2 for the new storyProgress signature. Expose canonical target sampling if required by meaningful endpoint tests. Preserve existing anatomy helpers; obsolete structural morph code may be removed only once the renderer no longer consumes it.

- [x] Write focused behavioral tests first. Seven hand-derived chapter centers at 100, 500, 900, 1300, 1700, 2100, 2500 must return 0, 1/6, 1/3, 1/2, 2/3, 5/6, 1. Use holdRadius 40 and assert unchanged progress within ±40. Missing/invalid chapter metadata returns 0.5. Playback arrivals occur at 0,5,10,15,20,25,30 seconds, reverse arrivals at 35,40,45,50,55,60; holds last two seconds. Inverse round trips reproduce progress.

```ts
it('holds RNA on either side of its chapter center', () => {
  const chapters = [
    {id:'dna', center:100, holdRadius:40}, {id:'rna', center:500, holdRadius:40},
    {id:'protein', center:900, holdRadius:40}, {id:'cell', center:1300, holdRadius:40},
    {id:'signal', center:1700, holdRadius:40}, {id:'network', center:2100, holdRadius:40},
    {id:'distribution', center:2500, holdRadius:40},
  ] as const;
  expect(storyProgress(470, chapters)).toBeCloseTo(1/6, 12);
  expect(storyProgress(530, chapters)).toBeCloseTo(1/6, 12);
});
```

- [x] Run npm test -- src/lib/morphStory.test.ts src/lib/morphTargets.test.ts src/lib/morphModel.test.ts and record expected failures before implementing. For new modules, begin by checking the missing exported behavior so failure is due to the absent feature, not a typo.
- [x] Implement the registry, canonical progress and stage descriptions. Clamp nonfinite progress/time safely. Chapter holds clamp to half adjacent spacing to avoid overlap; progress must be monotone. Implement a 60s forward/reverse playback with 2s holds and 3s transitions; inverse chooses the forward phase. transitionDuration is max(0.15, abs(to-from)*6*0.9) seconds for finite clamped values.
- [x] Obtain 1UBQ from https://files.rcsb.org/download/1UBQ.pdb and use apply_patch to add the extracted 76 chain-A C-alpha coordinates, residue identity and HELIX/SHEET ranges to morphProtein.ts. Store source URL, CC0, entry/chain, extraction date and a source digest. Preserve raw source coordinates; normalize with a rigid transform and uniform scale for drawing. No runtime fetch. Test source fixtures independently (first CA 26.266,25.413,2.842; residue intervals from the PDB); check distances are preserved up to uniform scale, continuous backbone interpolation and finite frames.
- [x] Build RNA as a single continuous transcript with local hairpins and distinct silhouette. Build dense protein ribbon material around the genuine backbone. Define network layers [4,6,8,6,3], deterministic sparse adjacent-layer edges, node clouds and edge material. Use normalDensity(x)=exp(-x*x/2)/sqrt(2*pi), with x in [-3.5,3.5] mapped to drawing x in [-1,1], baseline y=0.33 and height scaled for legibility. Keep all particle samples alpha >0.1, bounded below 1.3 in every axis and deterministic. Use caller-owned scratch points; no per-dot allocations.
- [x] Replace two-leg sampleMorph with six adjacent transitions. Interpolate targets using quintic easing and bounded arc 64*b^3*(1-b)^3, staggered slightly per particle but exact at each endpoint. Reuse the existing DNA and Cell samples; extract existing expression material as its own sampler. Update decorative atmosphere so it is subdued around molecular/cellular forms and fades away for expression and distribution. Restore quiet atmosphere for the neural sculpture if useful, without obscuring its connections.
- [x] Verify distinct target geometry, endpoints on either side of all seven stages, reverse scrubbing, normal-density positivity and integrated area near 1, protein fidelity, retained cell anatomy, low-quality participation and original spring invariance. Adapt old three-stage playback/chapter expectations to the seven-stage specification.
- [x] Run focused tests, then full npm test once. Self-review, git diff --check, commit as Add seven-stage particle story and target geometry. Write task report with RED/GREEN evidence.

## Task 2: Renderer, scroll chapters and explorer

**Files:** Modify src/lib/morphRenderer.ts, src/scripts/background.ts, src/components/BackgroundExplorer.astro, src/pages/index.astro. Add a focused visual-accent helper file only if the renderer grows unwieldy; name it src/lib/morphAccents.ts. Modify scripts/audit-background-ui.mjs for changed endpoint semantics and seven-form behavior.

**Consumes:** Task 1 interfaces above, existing SceneRenderer, themes, masks, particles, interaction spring and diagnostic attributes.

**Produces:** All seven forms via the existing normalized progress contract; data-background-stage IDs matching the registry; seven generated form controls; data-bg-stage diagnostic identifying settled/nearest stage.

- [x] Add browser assertions before UI changes: seven form buttons with canonical values, all seven scroll windows, correct endpoint progress, visible pixels in each artwork window, reverse scrolling, wrapping phone controls, and immediate form selection under reduced motion. Run the current production preview to observe the missing forms assertion fail.
- [x] Replace hardcoded three-stage gates with stageWeight and metadata. DNA accents use sampleDna; cell accents use sampleCell and the existing organelle paths; RNA uses sampleRnaBackbone; protein uses sampleProteinBackbone; network uses shared node/edge coordinates; density uses normalDensity. Outline alpha fades between forms so no unrelated anatomy appears. Structural labels are visible near settled endpoints, and never collide or clip at 320px. Keep labels in the explorer only. Existing generated particle buckets, adaptive quality, palette and mask remain intact.
- [x] Fit every form inside the existing composition bounds with 16px vertical clearance. Protein coordinates retain a rigid view; expression and distribution flatten using stage weights. Use the registry to select the correct current artwork-window height during resize. Keep homepage DNA origin asymmetric and settled non-hero art centered.
- [x] Use transitionDuration for form-button tween duration. Resume/scrub/interrupt/reset must not jump in displayed progress. Fix step timing across the seven stage intervals if required; preserve normalized .05 single-step behavior. Keep wall-time kick settling, paused/reduced-motion behavior and lifecycle cleanup unchanged.
- [x] Generate form buttons from MORPH_STAGES with full canonical numeric values (no rounded .167/.333 literals). Use concise labels DNA, RNA, Protein, Cell, Expression, Neural model, Distribution, while descriptions use full names. Give scrubber aria-valuetext using stageDescription. Show real protein provenance and generic-network/toy-distribution descriptions. Update title/description/legend/aria canvas text to describe all seven forms. Autoplay announcements remain aria-live off; manual actions use polite announcements.
- [x] Collect ordered MorphChapter bounds: center=rect.top+scrollY+rect.height/2, holdRadius=min(64, rect.height*.2). Require all registry chapters before calling storyProgress; otherwise set 0.5. Keep cache refresh with layout changes, navigation and scene switching; ordinary pages set 0.5. Do not measure elements per animation frame.
- [x] Move current artwork-window IDs: Research→rna and Publications→protein. Add cell before Featured software cards, signal before Posts, network before Algorithms, distribution before HomeGenomeBrowser. Keep Hero's dna, section order, heading copy and morph-only display rules.
- [x] Run focused tests, npm run check, npm run build:site, and npm run audit:background:ci. Inspect screenshots of seven endpoints, six midpoints and theme variants, fixing visual issues within this task. Run JSX spacing checker on edited Astro components. Run full npm test once before commit. Commit as Connect seven particle forms to homepage and explorer; report checks and screenshots.

## Task 3: Comprehensive audit, performance and documentation

**Files:** Extend scripts/audit-background-ui.mjs, add scripts/profile-morph.mjs, update docs/background-scenes.md and the spec/plan completion record as needed. Browser artifacts stay temporary and uncommitted.

**Consumes:** Seven-stage implementation and diagnostics from Tasks 1–2. **Produces:** Repeatable seven-target browser/performance verification and documented scientific interpretation.

- [x] Expand browser tests to all adjacent midpoints and both sides of stage boundaries, forward/reverse scroll, interrupted distant form changes, autoplay holds/resume, reset, low-quality recognizable structures, labels, paused/reduced motion, slow-frame spring settling and 320px overflow. Use exact canonical values from registry or hand-derived index/6 and tolerant rendered diagnostic comparisons. Preserve the Flow/Landscape/Cells checks. Record a targeted failure before correcting any discovered behavior.
- [x] Add a profiling script using existing Playwright/preview conventions. Own a preview server, try/finally browser and server cleanup, profile all seven endpoints and six midpoints with 2s warmup and >=3s collection for desktop and 390px phone at 4x CPU throttle. Collect each unique data-bg-ticks sample's data-bg-render-ms, sort, report p95 and quality/fallback. Assert p95<6ms desktop/<10ms throttled phone, without treating host measurements as physical-phone evidence. Use limited atmosphere/connection accents before increasing any budgets; budgets stay fixed.
- [x] Document new story, window positions, canonical progress, autoplay, labels, scientific caveats and locally bundled protein provenance. Replace outdated three-form descriptions, current expression=1 expectations and old playback period. Record actual new measured costs and validation evidence.
- [x] Run npm test and npm run check, then npm run build and ALWAYS npm run audit:indexing after it. Run npm run audit:links, npm run audit:background:ci, npm run audit:security, JSX spacing and profiling. Review endpoint/transition screenshots in desktop/phone light/dark/CRT and confirm all diagnostics/pass-through behavior. Run unrelated route smoke checks already in CI if interface changes introduce a concrete concern.
- [x] Self-review and git diff --check; commit as Verify seven-stage background across browsers and devices. Write complete report with validation evidence and any concerns.

## Integration and release (controller)

- [ ] Read task reports, fresh review verdicts and changed code; resolve all Important/Critical findings and preserve the audit evidence.
- [ ] Request a whole-branch review against the original base, then verify full tests and merge the isolated branch into main using a fast-forward after checking remote state.
- [ ] Push main as authorized, monitor GitHub Pages workflow to success, and verify published seven stages in Chromium/WebKit desktop/phone, including reduced motion and scroll restoration.
- [ ] Return a concise deployed-site handoff with commit, validation and any actual limitations. Clean up only the owned isolated checkout after successful integration; preserve any uncommitted artifacts instead of force-removing them.
