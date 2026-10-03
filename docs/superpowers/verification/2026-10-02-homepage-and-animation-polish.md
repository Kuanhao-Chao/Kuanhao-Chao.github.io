# Verification record: homepage and background polish

Observed results for the work on `feature/home-animation-polish`, 2 and 3 October 2026 (PDT). Numbers
are copied from each command's own output; none is inferred from an exit code.

## Why this record exists

Codex's seven-stage commit `4742a9c3` was pushed to `main` and its CI run failed in the background
audit (run 37098355680, chromium-phone, `Playback must schedule the next frame`), so nothing deployed.
Every local gate had passed on the laptop. The cause was a race in the audit harness, not in the
page: see the commit "Make the background audit independent of CPU speed and of other frame
consumers" for the reproduction and the evidence. A later, rarer failure turned out to be a bug in
the page itself, in the explorer's Play button; it is described below.

## Branch contents

Over Codex's `4742a9c3` (oldest first):

| Commit     | What                                                                                 |
| ---------- | ------------------------------------------------------------------------------------ |
| `46f7a9a3` | Shorkie shown as its eLife reviewed preprint                                         |
| `0ee7897b` | Homepage: four publications, no Algorithms & Visualizers section                     |
| `8685a1fb` | The approved design and plan                                                         |
| `dd184cf8` | The terminal collapsed under "About my name", native scrolling, phone layout         |
| `2fadffeb` | Window chrome never counts as takeover (wheel)                                       |
| `17391c7e` | The existing morph configuration contract, clarified                                 |
| `d408f436` | Two scenes (Cells, Genome to Cell) plus Off; saved choices migrated                  |
| `edcd25cb` | Deterministic life-motion helpers and their tests                                    |
| `b7726749` | Fit, light and animate the particle story without touching its science               |
| `5ce0b2c2` | Background audit independent of CPU speed and of other frame consumers               |
| `09f528ad` | Cells audit opens the collapsed homepage terminal                                    |
| `61745820` | Background audit stops asserting a frame rate                                        |
| `4adcd7fc` | A step cap a healthy WebKit run clears                                               |
| `17487022` | Documentation                                                                        |
| `f7d41bdc` | Wait for a media-query change by its effect, not by a fixed sleep                    |
| `9ecb8d48` | Compare frames pixel for pixel only where adaptive quality cannot move               |
| `30c60069` | The step cap raised to 20 minutes                                                    |
| `c68c1a73` | The exact-image rule, the benign observer notice and the real WebKit duration, noted |
| `f7daf052` | Say how two canvas captures differ when the exact-image checks fail                  |
| `8f541d61` | Allow rasteriser jitter, and only jitter, in the exact-image checks                  |
| `701f09ed` | Wait for Escape to close the dialog instead of reading it on the next line           |
| `524808e2` | Name the dialog cancel event among the late-delivered ones in the audit notes        |
| `39e1fe21` | Move the effect lifecycle onto the fake clock and wait for stopping, too             |
| `ff53c617` | Check wall-time playback on the fake clock, and trace the pause choreography         |
| `f08b4957` | Stop rewriting the explorer's button labels: WebKit drops the click                  |

The first nine commits change the product or its content, and so does `f08b4957`: the Play-label fix
(`src/scripts/background.ts` and the new `src/lib/domLabel.ts` with its tests). Everything else from
`5ce0b2c2` on is the audit harness, the workflow's step cap and documentation.

## Local gates

Apple-silicon laptop, Node 22.22.0, Playwright 1.61.1, production build, each gate run on its own.

| Gate                                                   | Verdict line                                                                 | Time        |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------- |
| `npm run check`                                        | `Result (438 files)`, 0 errors, 0 warnings                                   | 32 s        |
| `npm test`                                             | 75 files passed; 4,196 tests passed, 350 skipped                             | 25 s        |
| `npm run build` (site and PDFs)                        | 195 pages built; 61 PDFs written                                             | 25 s + PDFs |
| `npm run audit:indexing`                               | Indexing audit passed for 8 live posts and 8 reports                         | 11 s        |
| `npm run audit:terminal:ci`                            | Terminal UI audit passed for 2 routes across chromium and 2 profiles         | 19 s        |
| `npm run audit:cells:ci`                               | Living cells UI audit passed in chromium across 2 responsive profiles        | 46 s        |
| `npm run audit:background:ci`                          | `[background-ui] Passed: chromium and webkit`                                | 2:43        |
| `npm run audit:playground:ci`                          | playground UI audit passed                                                   | 2:52        |
| `npm run audit:genome:ci` (Firefox, WebKit)            | `[genome/firefox] PASS`, `[genome/webkit] PASS`                              | 20 s        |
| `npm run audit:refs:offline`, `audit:datasets:offline` | passed: 489 entries (3 warnings), 56 resources                               | seconds     |
| `npm run audit:ml-interview`                           | 1 hub, 23 lessons, 351 unique questions                                      | seconds     |
| `npm run audit:deep-dives:ci`                          | passed: 87 routes, 123 figures, 27 widgets, chromium and webkit              | 5:38        |
| `npm run audit:links`                                  | Link audit passed with 0 warning(s)                                          | 1 s         |
| `npm run audit:security`                               | Security audit passed                                                        | 2 s         |
| JSX spacing over the 14 edited `.astro`                | one finding, the unchanged `IntersectionObserver` options object (see below) | 1 s         |

Re-run on this laptop at the final tip `f08b4957`, after the Play-label fix: `check`, `test`,
`audit:security`, `audit:terminal:ci`, `audit:cells:ci` and `audit:background:ci` (native, with the
choreography repeated three times, twelve rounds, 2:30). The 250 ms and 500 ms frame-delivery runs
below were last made at `39e1fe21`. Every row above, on CI hardware, for the final tip: run 37133969454.

The background audit's own robustness, measured rather than assumed:

- The first two fake-clock scenarios (playback and minimum quality) pass at 1×, 8×, 16× and 24×
  Chromium CPU throttle, and five runs in a row on both engines. The whole chromium phone profile passes at 8× and 12×; the previous harness
  failed at 8×.
- Two deliberate product mutations fail the audit with named values: the story's hold shortened from
  2 s to 1 s (`displayed 0.008, expected 0`), and `selectionchange` made to stop the explorer
  (`the explorer drew no frame during leg 0 hold`, with the canvas state). The later scenarios were
  mutation-tested the same way; each commit message says how.
- The whole audit passes in both engines with every page's frames delivered at 250 ms and at 500 ms
  (`BACKGROUND_UI_SLOW_FRAMES`).
- A text-widening probe (hero collapsed and expanded, text at 100%, 106% and 112%, seven widths, both
  engines, 84 cases): the hero and the terminal card fit in all of them. The only overflow, 6 px at
  320px with 112% text, is the existing site header's menu button, which this work does not touch.
  (An earlier version of the probe also flagged controls clipped inside the terminal's own scroller;
  those are not overflow, and the probe now ignores clipped elements.)

## Performance (`scripts/profile-morph.mjs`)

52 pose, mode and profile checks, run alone after the final build: `[profile-morph] Passed 52
pose/mode/profile checks.` 4,974 unique rendered ticks. Desktop 1440×1000 at device scale 1; phone
390×844 at device scale 3 (renderer DPR cap 1.5) with 4× CPU throttling.

| Profile             | Mode     | Max p95 (pose)          | Threshold | Samples per pose | Min quality | Fallback |
| ------------------- | -------- | ----------------------- | --------- | ---------------- | ----------- | -------- |
| Desktop             | ambient  | 2.5 ms (protein → cell) | < 6 ms    | 68–72            | 1.00        | none     |
| Desktop             | explorer | 3.1 ms (DNA → RNA)      | < 6 ms    | 164–178          | 1.00        | none     |
| 390px phone, 4× CPU | ambient  | 3.7 ms (protein → cell) | < 10 ms   | 56–58            | 1.00        | none     |
| 390px phone, 4× CPU | explorer | 5.2 ms (protein → cell) | < 10 ms   | 82–85            | 1.00        | none     |

Before the lighting pass the worst p95s were 1.9, 2.8, 3.5 and 4.8 ms, so the new effects cost
0.2–0.6 ms at the worst pose. These are local-host JavaScript update and draw costs, not
physical-phone rendering, battery, GPU timing or Core Web Vitals.

## CI dry run

**Dry run 1** (run 37103759488, `09f528ad`, `workflow_dispatch` on the branch; the `github-pages`
environment only permits `main` and `master`, so `deploy` is refused and `build` is the verdict):
check, tests, build, terminal and Cells audits passed. The background audit passed every Chromium
check, including the 60-second playback that had failed on `main`, then failed in WebKit at
`assert.ok((await frames(page)) > 5)`. Nine later gates were skipped.

**The probe** (run 37104648024, throwaway branch, since deleted; AMD EPYC 7763, 4 vCPU, 16 GB):
headless WebKit on Linux delivers `requestAnimationFrame` at 1–8 Hz (a blank page 1–4, the homepage
4–8; Chromium 57–60) while the renderer costs only 4–11 ms a frame. The pre-lighting renderer is
just as slow (6 and 5 ticks in 1.2 s, against 5 and 5), and the two engines running at once changes
nothing (alone 5 and 6, together 5 and 5). So the old check had no margin on that runner, and neither
the lighting nor the parallel engines caused the failure.

## CI history

Runs of the real `deploy.yml` are `workflow_dispatch` on a branch unless the row says otherwise, so
`deploy` is refused (the `github-pages` environment only permits `main` and `master`) and `build` is
the verdict. Runs on `ci/*` branches use a trimmed throwaway workflow with no deploy job. Runner:
`ubuntu-latest`, AMD EPYC 7763, 4 vCPU.

| Run                      | Tip                                                             | Result                                        | What it showed                                                                                                                                                                                                                                                                                                                                               | Fixed by               |
| ------------------------ | --------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| 37098355680              | `4742a9c3`, push to `main`                                      | build failed                                  | `chromium-phone`: `Playback must schedule the next frame`. A single-slot `requestAnimationFrame` mock lost the explorer's frame to the page's own `cancelAnimationFrame(0)`.                                                                                                                                                                                 | `5ce0b2c2`             |
| 37103759488              | `09f528ad`                                                      | build failed                                  | Chromium passed everything, including the 60 s playback. WebKit: `frames > 5` in 1.2 s.                                                                                                                                                                                                                                                                      | `61745820`             |
| 37104648024              | `ci/probe-webkit`                                               | probe passed                                  | Headless WebKit delivers animation frames at 1-8 Hz, Chromium at 57-60 Hz; the renderer costs 4-11 ms. The old check had no margin.                                                                                                                                                                                                                          | (measurement)          |
| 37105654708              | `17487022`                                                      | build failed                                  | WebKit: `life amplitude follows accessibility/motion`, 1 where 0 was expected, read 100 ms after `emulateMedia`.                                                                                                                                                                                                                                             | `f7d41bdc`             |
| 37106637361              | `f7d41bdc`                                                      | build failed                                  | WebKit: `a paused form must return exactly to its resting composition`. Adaptive quality had stepped to 0.56 and its fade advances per frame (`bgVisible` 3756 against 2816).                                                                                                                                                                                | `9ecb8d48`             |
| 37106638853              | `ci/gates-parallel`                                             | `background` failed, other gate groups passed | WebKit ran to the end (9.5 min) and failed only on the benign `ResizeObserver loop` notice; fixed with a 20-minute cap and a tolerated notice.                                                                                                                                                                                                               | `9ecb8d48`, `30c60069` |
| 37116609554              | `c68c1a73`                                                      | build failed                                  | The exact-image check failed in WebKit with a message that could not say why.                                                                                                                                                                                                                                                                                | `f7daf052`             |
| 37116662150              | `ci/background-x5`                                              | 5 of 5 failed                                 | The same check, now with its own diagnosis: two draws of one paused form differ by a few pixels.                                                                                                                                                                                                                                                             | `8f541d61`             |
| 37117300113              | `ci/clock-only`                                                 | 2 of 2 failed                                 | Confirmed under the fake clock, so it is the rasteriser, not adaptive quality.                                                                                                                                                                                                                                                                               | `8f541d61`             |
| 37117585115              | `ci/clock-only`                                                 | 3 of 3 passed                                 | The jitter probe. Chromium bit-identical; WebKit's first draw of a form differs by 0-4 px (levels up to 30), warm redraws identical.                                                                                                                                                                                                                         | `8f541d61`             |
| 37118095668              | `8f541d61`                                                      | **build passed**, deploy refused              | Every gate green on CI, the background audit in 391 s.                                                                                                                                                                                                                                                                                                       |                        |
| 37118873251, 37118884878 | `ci/background-x10` (`524808e2`)                                | 5 of 10 passed                                | Three WebKit `paused renderer must not continue drawing` (read at the time as a few late ticks; the explorer was in fact playing, because of the lost click described below), one WebKit 30 s timeout waiting for a streak on a page whose adaptive quality was already below the 0.6 streaks need, one Chromium Calm amplitude read 150 ms after switching. | `39e1fe21`             |
| 37120295076              | `ci/background-x10` (`39e1fe21`)                                | 8 of 10 passed                                | Both failures were `paused renderer must not continue drawing: still ticking after 6000ms`, now a quiet window rather than two or three stray ticks: the explorer really was playing.                                                                                                                                                                        | `f08b4957`             |
| 37120306144              | `39e1fe21`, real workflow                                       | build failed                                  | WebKit desktop: `autoplay follows the 2s hold and 3s transition on wall time under slow callbacks`, a 180 ms timer on the profile's own page and real sleeps of 1.25 s and 3.4 s.                                                                                                                                                                            | `ff53c617`             |
| 37121815429              | `ci/background-x10` (`ff53c617`, choreography repeated 8 times) | 3 of 10 passed                                | Seven failures, identical (below).                                                                                                                                                                                                                                                                                                                           | `f08b4957`             |
| 37121816934              | `ff53c617`, real workflow                                       | **build passed**, deploy refused              | Every gate green, one pass through the choreography.                                                                                                                                                                                                                                                                                                         |                        |
| 37133967925              | `ci/background-x10` (`f08b4957`, choreography repeated 8 times) | **10 of 10 passed**                           | Every attempt ran the choreography 8 times per profile and engine (16 WebKit and 16 Chromium rounds, `slow press` and `slow callbacks` four times each) and printed the verdict line; the background audit step took 424 to 667 s.                                                                                                                           |                        |
| 37133969454              | `f08b4957`, real workflow                                       | **build passed**, deploy refused              | All 24 steps of `build` green on the final tip; the background audit took 610 s.                                                                                                                                                                                                                                                                             |                        |

The step durations of the passing run 37118095668, against each step's cap: check 24 s, tests 20 s, build
and PDFs 55 s, terminal smoke 19 s (cap 5 min), Cells smoke 46 s (5 min), **background audit 391 s (20
min)**, playground 165 s (12 min), genome in Firefox and WebKit 16 s (10 min), deep-dive UI 354 s (12 min).

### The last flake was a product bug: WebKit drops a click when the button's text node is replaced

After the audit fixes, the pause choreography (form 0, Play, Play, then "is the explorer still?")
still failed on the WebKit runner. Run 37121815429 repeated it eight times per attempt with a per-step
trace and a page-side event log, and seven of ten attempts failed, every one the same:

- The page received exactly **one `click` on the Play button for two Playwright clicks**
  (`[click DNA], [click play]`). Either the first Play click (two attempts) or the second (five)
  never reached the page. The label then flipped once, parity was off by one, and the explorer was
  left playing: displayed progress 0.167 (RNA) after the 2 s hold.
- The step containing the lost click took 0.3 to 1.3 s on the runner (150 to 200 ms of that is the
  sleep), against 0.2 to 0.3 s on a Mac.
- It does not reproduce on a Mac: 60 rounds at native speed, 22 under 250 and 500 ms frame delivery
  (an emulation that does not slow Playwright's own clicks) and 40 under 2x CPU oversubscription.
- It does reproduce with raw mouse events in a few lines: `mouse.down()`, replace the button's text
  node, `mouse.up()`.

| Between mousedown and mouseup                      | WebKit       | Chromium |
| -------------------------------------------------- | ------------ | -------- |
| nothing                                            | click        | click    |
| `textContent = same text` (replaces the text node) | **no click** | click    |
| `textContent = different text`                     | **no click** | click    |
| `firstChild.data = text` (keeps the node)          | click        | click    |
| the element replaced by a clone                    | no click     | no click |

The explorer's `updateDemoStatus` wrote `play.textContent` on every call, including a 500 ms refresh
while the dialog is open. A press of about 100 ms therefore straddles a refresh roughly one time in
five, and a loaded main thread, where a single frame outlasts the gap between the two events, makes
it much more likely. That is the runner. (Measured on Playwright's WebKit build; Safari itself was
not tried.)

The earlier explanation, a pause delivered a few ticks late, was wrong: three hardenings of the
tick-count check stand but never touched the cause. Fixed in `f08b4957`: `setLabel`
(`src/lib/domLabel.ts`) updates the text node in place and writes nothing when the text is unchanged.
Five unit tests; a `slowPress` scenario on the fake clock asserting the cause (the node survives a
refresh, both engines) and the symptom (a raw press held across a refresh still plays and pauses).
With `play.textContent =` back, both engines fail the first assertion; with it removed, Chromium
passes and WebKit fails `a press that outlasts a status refresh still starts playback`.

Not changed, and worth knowing: eight algorithm visualizers (`pairwise`, `wfa`, `minimap2`, `ghmm`,
`phmm`, `debruijn`, `stringGraph`, `fmIndex`) re-render their Play/Pause label on every timer tick
and should lose Pause clicks the same way.

### The final dry run, and what ships

The real `deploy.yml` on `f08b4957` (run 37133969454): `build` passed, 24 of 24 steps. `deploy` was
refused for the branch, as designed: the annotation reads _Branch "feature/home-animation-polish" is
not allowed to deploy to github-pages due to environment protection rules_, and the environment's
policies are `main` and `master`.

| Step                                                  | Seconds | Cap        |
| ----------------------------------------------------- | ------- | ---------- |
| Check site                                            | 40      |            |
| Run unit and content tests                            | 37      |            |
| Build site (with PDFs)                                | 81      |            |
| Audit terminal scroll smoke                           | 21      | 5 min      |
| Audit living cell background smoke                    | 49      | 5 min      |
| **Audit switchable backgrounds**                      | **610** | **20 min** |
| Audit variant playground smoke                        | 199     | 12 min     |
| Audit genome browser in Firefox and WebKit            | 20      | 10 min     |
| Audit indexing, references and datasets, ML interview | 2       |            |
| Audit deep-dive UI smoke (Chromium and WebKit)        | 447     | 12 min     |
| Audit built links, security                           | 5       |            |
| Upload Pages artifact                                 | 24      |            |

The merge to `main` is a fast-forward of Codex's `4742a9c3` by this branch (25 commits plus this
record). The run triggered by that push is the one that deploys; its result is on that commit's
Actions page, and the live-site checks are in the hand-off.

## Visual inspection

Representative captures from the background audit's reported screenshot directory were opened and
looked at; the audit asserts the rest.

- Hero ribbon at 320px: both strand ends inside the viewport, portrait and type clear.
- Phone, Recent news window: the neural network with warm packets on real edges and soft light; the
  news cards stay clear of the artwork.
- Dark theme, folded protein: the bundled ubiquitin backbone readable, light restrained.
- Amber CRT, probability density: the bell outline and sample material coherent in the CRT colour.

Not inspected by eye: every width in every theme and both engines (asserted by the audit instead),
real devices, and any GPU timing. Chromium and WebKit here are headless desktop builds.

## Baseline warnings, kept separate from this work's results

- `astro check`: 105 hints (the existing set), 0 errors, 0 warnings.
- `astro build`: the existing Vite chunk-size warning.
- `npm run audit:refs:offline`: 3 warnings (structure-only mode).
- `HeroBackground.astro` trips `check-jsx-spacing.py` on the options object of its
  `IntersectionObserver` inside a `<script>`. It is unchanged from the previous revision and is not
  rendered JSX or prose.
- Ten open Dependabot pull requests and the npm advisories Codex's `npm audit` reported are not part
  of this work.
- The published site is about 780 MB against GitHub Pages' 1 GB limit (downloads 300 MB, genome-data
  162 MB, vp-data 115 MB, `_astro` 94 MB).
