# Rap1 motif finale

## Approved scope

Sequence → Function ends with one twelve-position DNA sequence logo. The first six forms, seven-stage registry, particle identities, playback timing, reading veil, Cells, and genome browser remain intact. The original attention finale is a remembered alternate. The final internal chapter remains `attention`, while visible names and accessibility descriptions follow the selected finale.

The Labs header keeps Genome Browser, Algorithms, Shorkie Lab, Cell Lab, Terminal, and Fun Lab. NN Lab and Deep Dives remain in the footer, search, palette, and their routes. Counts and active indicators follow displayed destinations, including after Astro navigation. Homepage windows become `clamp(240px, 25vw, 312px)`, and 220px at ≤640px. Hero and explorer dimensions stay unchanged. Chapter holds refresh after layout changes; one uniform scale fits the finale inside a 16px horizontal inset.

## Biological data and logo math

The pinned matrix is **Rap1, JASPAR MA0359.3**, _Saccharomyces cerevisiae_, ChIP-exo, [source and provenance](https://jaspar.elixir.no/matrix/MA0359.3/), CC BY 4.0. The existing explorer legend attributes it. No visitor-time download or inference is required.

```text
          1   2   3   4   5   6   7   8   9  10  11  12
A       200   3   4  13 214   9   6   0  48   1   3  27
C        10   4   5  27  36  54   0   0   5   5  18  48
G       105  39 317   4  51   0 327 318 281   2 264  24
T        21 290  10 292  35 273   3  18   2 328  51 237
```

Each column totals 336; maxima spell `ATGTATGGGTGT`. Normalize counts to `p(b)`. Entropy is `H=−Σp(b)log₂p(b)` (zero terms contribute zero), information is `I=2−H` bits, and letter height is `p(b)I`. Stack smallest to largest with alphabetical tie-breaking. This uses a uniform four-base reference, without pseudocounts or a small-sample correction. Position 1 carries 0.6291854467 bits; position 10 carries 1.8067501308. Height describes frequency/conservation, **not regulatory importance or attention**. See the [original sequence-logo formulation](https://academic.oup.com/nar/article/18/20/6097/1141316).

Original cached vector contours and interior particle samples share geometry, including A's counter. Four restrained nucleotide inks adapt to themes and collapse to one CRT phosphor. Outlines keep letters readable at low particle quality. Selection never changes letter heights.

CRT mode keeps the body's background transparent, matching the ordinary theme's layering: the root still supplies the phosphor page colour, while fixed negative-z-index artwork remains visible beneath content. The browser audit guards this after applying the actual theme controls; raw dataset changes alone miss the opaque-body regression.

## Directed attention, separate from the motif

A PFM encodes marginal base preferences; it cannot supply pairwise dependencies. The published logo is therefore paired with a reproducible **illustrative attention head**, explained in the existing explorer legend/status without a homepage inspector or warning overlay. Attention is not a causal explanation; [DeepLIFT](https://proceedings.mlr.press/v70/shrikumar17a.html) and [BPNet's motif-context analyses](https://pmc.ncbi.nlm.nih.gov/articles/PMC8812996/) address different questions.

1. Encode each consensus nucleotide as four one-hot features plus `sin(2πi/12)` and `cos(2πi/12)`.
2. Use distinct fixed 6→4 query/key projections. Mulberry32 seed: `0x4d4f5446`; coefficients: `[−1.6,1.6)`.
3. Scores are `s(i,j)=q(i)·k(j)/√4−0.08|i−j|`; self scores are negative infinity.
4. Apply stable **row** softmax: subtract row maximum, exponentiate, normalize. Cache all 144 weights and link rankings once. Weights are nonnegative; rows sum to one; diagonal is zero.
5. Select the strongest two links from the selected row (outgoing) and two from its column (incoming). Phones show one of each. **Never renormalize the incoming subset.**

For position 1 the desktop links are 1→8, 1→9, 9→1, 8→1. Asymmetry is intentional: `A(1,8)=0.305781178914`, `A(8,1)=0.697357220671`. Outgoing curves are solid accent strokes pointing away; incoming curves are dashed warm strokes pointing towards selection. Reciprocal paths differ in height. A new selection permits one brief traversal, then remains still. Resting artwork retains only three faint strongest links, with no recurring attention pulses.

## Interaction and persistence

Hover an exposed column on desktop. Phone taps select; tapping again clears; selection expires after four seconds. Scrolling, dragging, canceling, protected content, links, controls, terminal, genome browser, and text selection cannot select/stir it. Handlers remain passive, without capture or touch cancellation. Scroll/navigation/leaving the form clears focus. Paused/reduced-motion selections redraw a still highlight with no effects.

In the existing explorer, focus the canvas and use Left/Right/Home/End. A screen-reader-only live region announces positions and directed links. Escape retains native dialog dismissal. There is no new inspector or visible toggle.

Paused explorer hover/tap/keyboard selections also remain still. Its pre-existing **Stir particles** button explicitly requests a one-shot motion response and cannot override reduced motion. This preserves the older explorer's explicit-stir behavior without restarting autoplay. Explorer playback is an opt-in demonstration, independent of the ambient background's Motion setting, as before.

Type **`motif` outside editable fields**, use the **`motif` terminal command**, or search the command palette for **“Switch DNA motif / attention finale”** (phone compatible). The terminal `eggs` catalog lists it. Existing DNA/helix/rain secrets are unchanged.

The independent key `khc-morph-finale-v1` stores raw `motif` or `attention`, defaulting invalid/missing values to motif. Denied storage retains an in-memory choice across Astro navigation. Cross-tab updates configure existing renderers without closing the explorer. Off/Cells save the choice without changing scene. Motion, scroll, and story progress are independent.

Switches use a **750ms quintic blend from the currently displayed mix**, including when interrupted. Paused/reduced changes are immediate. Particle targets morph and overlays crossfade under the same reading mask. Timers, renderers, and input/lifecycle state are cleaned up at disposal. No dependency upgrade is included.

## Implementation and release gates

`morphFinale.ts` owns data/math, cached glyphs, particle sampling, directed attention, ranking, curves, and hit bounds. `morphFinalePreference.ts` owns preference validation and transition easing. `SceneRenderer.configure` carries finale/focus options; the controller owns storage, DOM, and input routing. These focused pure seams and behavior-first tests follow the TDD and codebase-design skills.

Unit tests pin all 48 counts, independent numeric expectations, zero-frequency handling, normalization/ranking, reciprocal direction, geometry bounds, quality-floor participation, exact alternate endpoints, unchanged earlier forms, preference validation, and interrupted blends. `audit-motif-finale.mjs` checks Chromium/Firefox/WebKit at 320/390/768/1440px, theme screenshots, hover/tap, timeout, protected inputs, keyboard/SR, paused/reduced motion, secrets/palette, interrupted switches, storage/reload/navigation/cross-tabs, and Off/Cells independence. The existing background audit explicitly chooses the preserved original finale for its seven-stage regressions.

The profiler retains 52 default pose cases and adds eight alternate endpoint/last-transition cases; gates remain p95 <6ms desktop and <10ms at 390px/4× CPU throttle. These are emulations, not physical-phone benchmarks. Run performance checks alone.

```sh
npm test
npm run check
python3 scripts/check-jsx-spacing.py src/components/Header.astro src/components/BackgroundExplorer.astro src/components/SiteBackground.astro src/pages/index.astro
npm run build
npm run audit:indexing
npm run audit:links
npm run audit:security
npm run audit:motif:ci
npm run audit:background:ci
node scripts/profile-morph.mjs
```

CI performs the browser gate and retains screenshots for seven days. Measured release results are recorded below after verification, not inferred from the design.

### Local release verification (2026-10-11)

- 4,401 unit/content tests passed; 350 existing tests remain skipped. Astro check: zero errors/warnings, 108 existing hints.
- Full build/PDF generation, immediate indexing audit, built-link audit, security-invariant audit, and JSX whitespace check passed.
- Site-wide responsive audit: 39 routes × four screen sizes, zero layout issues. Terminal and Cells smoke audits passed.
- Preserved seven-stage background audit passed in Chromium and WebKit, including playback, transcription, reading masks, stirring, pause, and reduced motion. Latest screenshots: `khc-background-yCKyp0/` and `khc-background-1zppgr/` in the temporary root below.
- Motif audit: all twelve engine/width cases plus storage/lifecycle checks passed on the final build, including the CRT transparent-body regression. Reviewed desktop dark and phone selected/CRT screenshots. Evidence: `/private/var/folders/33/7v38jdjd2874jcxb6l71m00h0000gn/T/khc-motif-finale-ZkUu8Q/`; responsive evidence: `khc-responsive-audit-JTnkgk/responsive_audit_results.json` in the same temporary root.
- All 60 Chromium performance cases passed at full particle quality without fallback. Worst update/draw p95 was 3.4ms on desktop (6ms gate) and 6.1ms at 390px with 4× CPU throttling (10ms gate). The motif finale measured 1.7/2.9ms ambient/explorer on desktop and 2.9/4.0ms on the throttled phone profile. Results: `khc-morph-profile-WpyqOK/results.json` in the same temporary root; these are browser emulations, not physical-device measurements.
- The profiler's occupied-port regression also passed: it requested 4338, used its own fallback preview on 4339, made zero requests to the unrelated server, and cleaned up the browser/server on early exit.
- Reconfirmed all 48 matrix counts, budding-yeast species, and ChIP-exo assay directly against the JASPAR API. No dependency upgrade was performed; dependency-alert maintenance remains a separate task.
