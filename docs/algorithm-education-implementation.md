# Algorithm education redesign

## Agreed scope and review specification

This records the implementation scope approved in the website conversation.
The baseline is `04f508d7b0fee68e8e323d634727d5785ec76ba0`, before this redesign.

- Redesign all 11 standalone `/algorithms/` lessons and the catalog.
- Keep existing route URLs. Preserve noindex/sitemap policies.
- Skip the linked Wheelie post and the separate Shorkie Lab.
- Layer undergraduate intuition and small worked examples with graduate-level
  equations, boundary conditions, assumptions, limitations and primary sources.
- Add three worked exercises per lesson, with answers hidden until requested.
- Show actual algorithm states, candidates, predecessors and traceback events.
  Do not present decorative playback timing as measured algorithm runtime.
- Provide paused-first, reset, previous/next, seek, speed, play/pause and final
  result controls. Input changes must invalidate stale computations.
- Validate custom inputs without silent truncation or replacement.
- Support keyboard inspection, touch, narrow screens, light/dark themes and
  reduced motion. Navigation must clean up timers and avoid duplicate handlers.
- ISM is an explicitly synthetic teaching scorer: no pretrained checkpoint,
  backend or clinical inference is added.
- Verify locally, commit focused changes, push to main, and confirm deployment.

## Lesson-specific acceptance criteria

| Lesson       | Required computation and explanation                                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pairwise     | Global/local/fitting boundaries, linear/affine gap conventions, state-aware traceback, independently reconstructed score ledger.                                                       |
| WFA          | Valid M/I/D offsets, real match-extension comparisons, successful complete traceback, nonnegative affine costs, no silent score cap or fallback path.                                  |
| DP vs WFA    | Equivalent affine objective and endpoints; separate honest counters, not a wall-clock race or manufactured speedup.                                                                    |
| FM-index     | Sentinel validation, BWT/rank construction, inclusive backward-search intervals, counting before sampled LF locating.                                                                  |
| Minimizers   | Each window winner, disclosed toy hash/ties, repeat anchors, overlap-aware chaining reward and actual predecessor candidates.                                                          |
| De Bruijn    | Ideal copies versus observed coverage, real Hierholzer stack, all unitig components, conservative reversible cleaning and retained equal-support alternatives.                         |
| String graph | Deterministic duplicates, contained reads, label-and-placement-equivalent reduction witnesses, exact placements, cycles/isolates; no claim of noisy consensus or full Myers reduction. |
| Profile HMM  | Normalized global core and End, correct silent-state dependency order, Forward ≥ Viterbi, Forward/Backward agreement and M+I residue occupancy normalization.                          |
| Gene grammar | Explicit bounded durations, complete-gene termination, intronic GT/AG, actual partial-codon letters across junctions, no premature spliced stops; declare handcrafted scores.          |
| ISM          | Disclosed scorer and synthetic examples, signed deltas, 3L alternatives, mean absolute sensitivity, preview separate from Apply/Undo/reset.                                            |
| GWAS         | Seeded actual cohort N, genotype-derived PCA, joint covariate regression and Student-t tails, actual Manhattan/QQ/LD plots, lead recomputation, independent train/test prediction.     |

## Implementation organization

- `src/data/algorithmLessons.ts`: server-side lesson content, examples, presets,
  equations, exercises and references. Only form configuration is serialized
  to the browser; long educational prose is not shipped as client data.
- `AlgorithmLesson.astro`, `algorithmLesson.ts`, `lessonPlayback.ts` and
  `algorithmLessons.css`: shared accessible lesson shell and transport.
- Pure `src/lib/` engines: numerical and sequence invariants, tested without DOM.
- Lesson adapters: convert actual engine results to revealable tables, diagrams
  and charts. Rendering does not manufacture missing states or stale answers.
- `gwasStats.ts`: joint QR projection and Student-t calculations. The legacy
  `gwas.ts` API re-exports corrected regression for existing Deep Dive callers;
  their legacy preset pipeline remains outside this lesson redesign.
- `gwasTeaching.ts`: independent seeded teaching cohort, genotype PCA, measured
  associations/LD and train-only block-pruned prediction. It does not import the
  legacy biological presets or their preassigned summary statistics.

## Verification and evidence

Before each commit: `npm test`. Release gates: `npm run check`, `npm run build`,
`npm run audit:indexing`, built link/security audits and the algorithm UI audit.
The browser audit exercises real controls, custom-input failure/recovery,
presets, exact rewind, keyboard/touch inspection, no document overflow and
route lifecycle. It saves screenshots and a JSON result into a temporary
`khc-algorithms-*` evidence directory; generated artifacts are not committed.

Regression tests cover bugs reproduced on the original engines, including
affine traceback, WFA insertion/deletion direction, duplicate reads, unequal
string-graph shortcut spellings, unitig cycles, HMM deletion/posterior errors,
splice-junction frame errors and correlated-covariate projection.

The primary-source survey and method-specific limitations are recorded in
`docs/algorithm-education-primary-sources.md` and cited on each lesson.

Deployment is not complete until GitHub Actions succeeds and live routes are
checked. This document describes the acceptance criteria; it does not itself
claim that a pending gate or deployment has succeeded.
