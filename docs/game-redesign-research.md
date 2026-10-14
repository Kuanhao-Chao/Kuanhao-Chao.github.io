# Game redesign: primary sources and teaching boundaries

Sources checked on 2026-10-13 for CRISPR Commander, Phage Defense, Genome Jumper, Proofreader, Dino Run, Chinese Chess, BayRoute, Minesweeper, and 2048. This note records scientific and rules-based rationale, original teaching choices, and regression requirements. It is not a claim that the browser games simulate molecular biology, implement complete tournament rules, or have passed every listed check.

## Editorial contract

Keep the four biology games explicitly **science-inspired arcade games**. Molecule identity, nucleic-acid alphabet, and the named biological mechanism should be accurate; falling strands, projectiles, lanes, health, currency, meters, cooldowns, and invulnerability are game abstractions. Sources support the underlying idea, not the game's damage values or power-up timings. Explain one meaningful biological distinction through play, then offer a short optional explanation without interrupting an active run.

The classic games should preserve recognizable rules while improving feedback. BayRoute is an educational graph-search visualizer: its graph assumptions and objective matter more than making it resemble a competitive game. An optimum is relative to the supplied graph and weights, not automatically a real-world navigation result.

## 1. CRISPR Commander

### Canonical targeting, orientation, and assumed guides

SpCas9 recognizes a DNA target through guide-RNA complementarity and an adjacent PAM; detecting `NGG` alone is not sequence-specific targeting. Cas12a, originally named Cpf1, uses a T-rich PAM on the other side of the protospacer. These are DNA-targeting systems, not ordinary retroviral-RNA cutters. [Jinek et al. (2012)](https://doi.org/10.1126/science.1225829), [Zetsche et al. (2015)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4638220/).

For the displayed non-target DNA strand written 5′→3′, use these teaching arrangements:

- SpCas9: `5′-[protospacer]-NGG-3′`.
- AsCas12a: `5′-TTTV-[protospacer]-3′`.
- `N` means A/C/G/T; `V` means A/C/G. Label these **canonical game PAMs**, not the complete biochemical specificity of every enzyme variant. Wild-type AsCpf1 has strongest activity at TTTV but can have lower activity at noncanonical sequences. [Kleinstiver et al. (2017)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5548640/).

The player selects a nuclease, not a complete guide design. State that matching guides are assumed to be preloaded. Short sequence ribbons are cartoons, not experimentally valid spacer designs. Spawn mixed PAM classes independently of the selected enzyme, and make compatibility control ordinary cleavage. Keep the PAM separate from the protospacer and avoid suggesting that the PAM itself is the cut site.

### Cut geometry and inhibitor specificity

The original Cas9 experiments show a near-PAM, approximately blunt double-strand break; the Cpf1 study shows staggered cleavage distal to the PAM. Illustrate the distinction with aligned versus offset strand ends, but do not claim one universal Cas12a cut offset or overhang length across enzymes and conditions. [Jinek et al. (2012)](https://doi.org/10.1126/science.1225829), [Zetsche et al. (2015)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4638220/).

AcrIIA4 is a DNA-mimicking inhibitor of SpCas9 target engagement, not universal armor against every nuclease or projectile. Restrict the named inhibition mechanic to the relevant Cas9 interaction; an alternate-enzyme escape strategy is a teaching choice, not a claim that all anti-CRISPR proteins have identical specificity. [Shin et al. (2017)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5507636/).

Cytidine base editing is guide-targeted conversion within an activity window, not conversion of every C in every visible strand. Prime editing uses a nickase/reverse-transcriptase system and an edit-encoding guide to install specified changes; it is not universal instantaneous healing. Either illustrate these actual distinctions or name the powers as arcade support effects with a clear caveat. [Komor et al. (2016)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4873371/), [Anzalone et al. (2019)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6907074/).

Regression requirements: wrong nuclease produces no ordinary cleavage reward; switching does not mutate existing targets; canonical TTTA/TTTC/TTTG differ from TTTT under the game rule; sequence edits cannot leave stale PAM annotations; inhibitor handling does not silently become all-purpose shielding. Explicitly distinguish any fictional clearing override from nuclease targeting.

## 2. Phage Defense

### Bacterial setting and infection imagery

T4 attaches at the bacterial envelope and translocates its genome into the host. Do not present the intact extracellular virion as literally following an intracellular road to the chromosome. A membrane attachment vignette followed by an injected-genome token on an **infection-progress lane** retains tower-defense readability. The lane is an abstraction, not a cytosolic transport map. [Hu et al. (2015)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4568249/).

Keep the host bacterial: nucleoid, ribosomes, and envelope imagery belong to this setting; a mitochondrial power plant does not. NHGRI distinguishes bacterial/prokaryotic cells from eukaryotic cells with mitochondria and membrane-bound nuclei. Do not transplant lysosomal autophagy into bacterial phage defense: the cited foundational autophagy experiments concern degradation in yeast vacuoles, not this bacterial mechanism. [NHGRI: Yeast genome and cell-type distinction](https://www.genome.gov/25520379/online-education-kit-1996-yeast-genome-sequenced), [Tsukada and Ohsumi (1993)](https://febs.onlinelibrary.wiley.com/doi/10.1016/0014-5793%2893%2980398-E).

Use an explicitly fictional name such as a nuclease surge for a screen-clearing ability. Do not replace it with an asserted abortive-infection mechanism without choosing a specific defense system and modeling its host consequences. ATP remains an abstract deployment budget, not a measured molecular cost or experimental turnover rate.

### Defense roles

EcoRI recognizes `GAATTC` and cleaves between G and A. DNA ligase seals backbone nicks; its enzyme specification does not establish a neighboring-enzyme fire-rate aura. Let recognition-site and nick-sealing imagery explain the tower roles, while treating range, damage, and support bonuses as game balance. [NEB EcoRI specification](https://www.neb.com/en-us/products/r0101-ecori), [NEB E. coli DNA Ligase specification](https://www.neb.com/en-sg/products/m0205-e-coli-dna-ligase).

CRISPRi uses catalytically inactive dCas9 to interfere with transcription. Say **transcription suppression**, not catalytic dCas9 or literal physical stasis of virions. RNase-mediated RNA degradation can motivate a suppression role, but physical slowing is an arcade translation of that idea, not molecular migration kinetics. [Qi et al. (2013)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3664290/).

Regression requirements: visible placement and range previews; consistent cost/refund arithmetic; named inhibition applies only to its declared target class; any introduced substrate vulnerabilities are explained before a wave. Use the actual tower/wave definitions as the source for displayed statistics, not separately maintained biological-looking numbers.

## 3. Genome Jumper

Retain RNA polymerase II and chromatin as a eukaryotic transcription theme, but use RNA pickups A/C/G/U. RNA uses uracil instead of DNA's thymine. Changing only the rendered T to U would leave the model, scripted starting pickups, tests, and shared results inconsistent. [NHGRI RNA definition](https://www.genome.gov/genetics-glossary/Ribonucleic-Acid-RNA).

The ribbon records the order of random pickups. Call it **collected ribonucleotides**, not a synthesized transcript, unless the engine actually uses a DNA template and complementary incorporation. An optional template lesson would read template DNA 3′→5′ and append complementary RNA at its 3′ end; this is a separate teaching mechanic, not an inference from arbitrary collectibles.

P-TEFb supports productive transcriptional elongation; it does not confer flight or invulnerability. Topoisomerase-themed assistance can evoke transcription-associated supercoiling, but a spring remains a metaphor. Do not define heterochromatin as a platform that physically moves sideways. [Sanso et al. (2020)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7455706/), [Wu et al. (1988), bacterial transcription-supercoiling experiments](https://pubmed.ncbi.nlm.nih.gov/2835168/).

Regression requirements: no T in generated RNA collectibles or their ribbon; alphabet consistency across renderer/help/share data; seeded world reproducibility; reachable platform sequences; clear distinction between collected bases and any future template-based product.

## 4. Proofreader

Choose one organismal setting. The existing Pol III ε identity is bacterial, so a stylized nucleoid is coherent; a eukaryotic chromatin maze instead needs a suitable eukaryotic polymerase identity. E. coli Pol III ε performs 3′→5′ exonucleolytic editing, while its α subunit performs polymerization. [Scheuermann and Echols (1984)](https://pubmed.ncbi.nlm.nih.gov/6393125/).

Proofreading removes errors at the nascent strand's 3′ end; the gun, roaming enemies, and wall maze are not a physical model of that reaction. Describe substitution/insertion/deletion enemies as **replication-error manifestations**, not evidence that every established genetic variant must be destroyed. Many mutations have no consequential health effect. [Proofreading specificity experiments](https://pubmed.ncbi.nlm.nih.gov/8841137/), [NHGRI mutation definition](https://www.genome.gov/genetics-glossary/Mutation).

The current sequence is pickup history, not material excised by firing. Label it **collected dNTPs**. An optional post-wave vignette could distinguish mismatch recognition, excision, and resynthesis without claiming that shooting implements all repair pathways.

Regression requirements: pickup history cannot masquerade as a repair product; line of sight and visible hit feedback agree; touch aim assistance is disclosed; a future reference-based repair mechanic separately validates template, nascent strand, and correction direction.

## 5. Chinese Chess / Xiangqi

Preserve intersection-based play, palace/river restrictions, horse-leg and elephant-eye blocking, cannon screens, general-facing safety, and the rule that stalemate is a loss for the side without a legal move. Teach a rejected move by identifying the actual blocker or safety violation, not merely flashing an invalid destination. [WXF introduction](https://www.wxf-xiangqi.org/images/xiangqi-intro/xiangqi-introduction-for-wxf.pdf).

WXF repetition adjudication distinguishes checks, chases, and other repeated actions; do not import an unconditional Western-chess threefold draw. If the browser uses a simplified repetition teaching rule, identify it as such and avoid claiming complete WXF tournament enforcement. The official rules also include referee and procedural requirements outside a casual browser game. [World Xiangqi Rules (2018), Articles 3 and 19-20](https://www.wxf-xiangqi.org/images/wxf-rules/2018_World_XiangQi_Rules_English2018.pdf).

Same-kind pieces on one file need front/rear disambiguation in move notation. Orient this relative to the moving side, not fixed screen height. [WXF-hosted introduction, notation section](https://www.wxf-xiangqi.org/images/free_download_books/xiangqi_introduction_chessplayers_20150323.pdf).

Regression requirements: stalemate remains a loss; repetition identity includes side to move; perpetual-check fixtures do not become automatic draws; notation disambiguates both sides; undo restores position history and any teaching counters. AI difficulty names are game presets, not independently certified playing ratings.

## 6. BayRoute

### Provenance and declared objective

The inspected route builder uses curated city graphs and modeled travel-time weights. Identify the graph's city coverage and endpoint connections separately from Google/OSM basemap tiles. An address search or a detailed basemap does not make the graph global, complete, or traffic-aware.

Actual Google Directions responses provide routes, legs, steps, and approximate overview polylines, not a full extracted road graph. Thus **curated graph-search demonstration** and **live Directions result** are different data products. Label estimated travel time, unsupported endpoints, provider attribution, and any fallback explicitly. [Google Directions documentation](https://developers.google.com/maps/documentation/javascript/legacy/directions).

Use **minimum modeled travel time** when weights are minutes. BFS minimizes hops, not weighted time; greedy search is not guaranteed optimal. Separate search work, computation time, and animation playback duration. Do not manufacture speedup claims from animation timing or round path totals before comparing algorithms.

### Balanced-potential shortest-path contract

Goldberg and Harrelson describe feasible potentials, reduced costs, reversed-graph search, and compatible forward/reverse potentials whose sum is constant. Their average construction is `p(v) = (h_target(v) - h_source(v)) / 2`, with reverse potential `-p(v)`. The two component bounds must be feasible in their respective directions: toward the goal and from the source. [Goldberg and Harrelson (2005), sections 2-5](https://www.microsoft.com/en-us/research/wp-content/uploads/2005/01/soda05.pdf).

The following stopping contract is a teaching derivation using that framework. For each original directed arc `u → v`, require `w′(u,v) = w(u,v) - p(u) + p(v) ≥ 0`. Backward search traverses its reversal. Maintain the best complete path `μ`; with original-cost `g` labels and `μ`, after discarding stale queue entries, terminate when `min(g_forward+p) + min(g_backward-p) ≥ μ`. If queue labels are reduced-cost distances instead, compare their minima sum with `μ′ = μ - p(start) + p(goal)`. Do not return an arbitrary first meeting instead of the best incumbent.

A geographic heuristic must satisfy the graph's actual costs, including speed limits and rounding. Zero potential is the safe fallback. Balanced search does not promise a geometric halfway meeting or an expansion-count speedup; guaranteed midpoint expansion is a distinct property studied by the MM algorithm. [Holte et al. (2016)](https://ojs.aaai.org/index.php/AAAI/article/view/10436).

Initial-audit regression fixtures, not a post-redesign verification claim:

- Undirected edges `S-A=5`, `A-T=5`, `S-B=1`, `B-C=1`, `C-T=9`, with zero geographic heuristic: the old bidirectional engine returned cost 11 while Dijkstra and A* returned 10. Preserve the cheaper route as a regression test.
- The old Bay graph had 18 of 432 directed edges with `h(u,v)` greater than their own direct weight. A 65-mph heuristic conflicted with 70-mph edges, and downward rounding also broke bounds. Increasing the assumed speed alone did not address all causes.

Regression requirements: directed one-way examples, zero-cost edges, disconnected queries, exact Dijkstra differential comparisons, feasible reduced costs, stale-priority handling, and reconstruction that follows only original-direction arcs. An algorithm citation does not certify the site implementation.

## 7. Minesweeper

Distinguish a safe opening from a wholly no-guess board. Tatham's first-party manual treats guaranteed deductive solvability as a separate generator option. Chording uses matching flag count; incorrect flag placement can still reveal a mine. [Tatham's Mines manual](https://www.chiark.greenend.org.uk/~sgtatham/puzzles/doc/mines.html).

The redesigned generator reserves a complete 3×3 opening neighborhood (clipped at the board edge). Custom settings therefore cap mines at `rows × columns − 9`; they do not silently weaken that opening guarantee. This is still not a guarantee that the remaining board is solvable without guessing. The hint helper uses only revealed clues and local/subset constraints, treats flags as unproven, and can report that it found no certain move.

Regression requirements: flagged cells do not reveal accidentally; wrong flags can make a chord lose; dense configurations preserve first-cell safety; reveal/flag touch mode is visible; long-press does not accidentally trigger a reveal; keyboard focus survives board updates. A chord preview should show affected neighbors before commitment.

## 8. 2048

Preserve the original merge contract: equal neighboring tiles merge once per move, the resulting value is added to the score, and a new tile spawns only after an effective move. The original uses two starting tiles and 90%/10% probabilities for new 2/4 tiles, with an option to continue after 2048. [Original game manager](https://raw.githubusercontent.com/gabrielecirulli/2048/master/js/game_manager.js).

Movement, merge ancestry, and new-spawn feedback are separate in the original renderer. Animate those events clearly; do not let ornament obscure tile value or origin. Undo and non-4×4 boards are useful site variants, not features justified as part of the original rules. [Original renderer](https://raw.githubusercontent.com/gabrielecirulli/2048/master/js/html_actuator.js).

Regression requirements: `[2,2,2,2]` moves left to `[4,4,0,0]` with gain 8; `[4,4,8,0]` becomes `[8,8,0,0]`, not a chain-merged 16; ineffective input does not spawn; undo/new-game transitions cannot leave stale win UI; reduced motion preserves understandable state changes.

## 9. Dino Run

Chromium's runner is a useful first-party reference for width/speed-aware obstacle gaps, shaped collision boxes, and additional spacing in assistance modes. These are design precedents, not prescribed physics constants for this site's runner. [Chromium obstacle implementation](https://raw.githubusercontent.com/chromium/chromium/main/components/neterror/resources/dino_game/obstacle.ts).

Keep jump-versus-duck silhouettes recognizable, obstacle combinations survivable, and the collision model aligned with the visible sprite. Genome-themed obstacles are visual flavor; their names should not imply that a dinosaur literally repairs sequence variants by jumping.

Regression requirements: minimum-gap pairs across the speed range, jump recovery, duck release, large-frame handling, pause/resume, and visible hitboxes. New art should not silently expand collision regions or hide required cues.

## Shared accessibility and touch contract

Provide discoverable keyboard equivalents for selection, placement, reveal/flag, and ordinary firing actions. The path-dependent-input exception concerns the underlying function, not simply using a drag gesture. Preserve a keyboard exit from the game, pointer lock, and fullscreen, with visible instructions where necessary. [W3C keyboard guidance](https://www.w3.org/WAI/WCAG22/Understanding/keyboard), [W3C no-keyboard-trap guidance](https://www.w3.org/WAI/WCAG21/Understanding/no-keyboard-trap).

Audit actual target sizes and spacing at small viewports. WCAG 2.2 AA specifies 24×24 CSS pixels subject to defined exceptions; 44-pixel touch controls are a stronger design target, not the unconditional AA rule. Avoid solving a dense board by making every cell an inaccessible tiny target. [W3C target-size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), [enhanced target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced).

Honor reduced-motion preferences for nonessential shake, parallax, trails, and celebratory effects while preserving essential gameplay cues. WCAG's interaction-animation criterion is AAA and allows essential motion; implementing a reduced-effects setting is not proof of complete conformance. [W3C animation-from-interactions guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions).

Design choices to verify independently: explicit pause/restart confirmation; safe focus restoration; background-tab suspension; sound controls; keyboard/touch parity; status updates that avoid per-frame announcement spam; narrow-screen layouts with reachable controls. Canvas labels and an HTML score display alone do not establish equivalent access to every action-game mechanic.

## Source-access and completeness notes

- Several PMC full-text opens returned a browser challenge. Claims were checked against the original papers' available indexed text and publisher/author-hosted copies; no challenge bypass was attempted.
- The WXF rulebook is largely image-based. Relevant official indexed clauses were inspected, but this note is not a complete review of all 116 PDF pages, every chase exception, or tournament adjudication.
- The Microsoft-hosted Goldberg/Harrelson paper was text-readable, including the potential and reverse-search sections. The stopping formula above is an explicit teaching derivation, not a verbatim algorithm listing from the paper.
- The Nobel autophagy press-release page returned 403 and was not used. The original yeast study and NHGRI cell-type explanation provide the narrower claims made here.
- Scientific illustrations and test fixtures proposed here are original teaching choices. Sources do not validate synthetic sequences, game balance, generated maps, AI ratings, browser performance, or complete accessibility.

## Implementation notes and verification scope

Nine game-specific commits follow the shared Focus-view/fixed-step-clock foundation. Biology illustrations remain schematic and distinguish real mechanisms from arcade effects. Best-score storage is preserved; CRISPR and Genome Jumper keep legacy scores separately where scoring rules changed. Audio is opt-in and controller teardown closes audio contexts and owned timers/listeners.

- CRISPR: paired DNA ribbons, canonical PAM/enzyme compatibility, three guided practice rounds, mixed targets, and inhibitor-specific rules. Matching guides are assumed; the display is not an experimental guide-design tool.
- Phage Defense: bacterial-envelope injection vignette, intracellular genome tokens, placement previews and confirmation, landed-damage accounting, deterministic IDs, and rounded-investment refunds.
- Genome Jumper: A/C/G/U pickups, four visual chapters, a transcription-bubble vignette, safe early platforms, seeded retries, render interpolation, and per-pickup streak events. The trail is decorative rather than a template-derived transcript.
- Proofreader: bacterial nucleoid setting, attack windups, cover-aware BFS movement, line-of-sight melee, accessible fallback aiming, and a recognition/excision/resynthesis lesson. The collected sequence is dNTP pickup history.
- Dino Run: connected feathered silhouette, landing/duck poses, shaped collision regions, conservative speed-dependent spacing, buffered jumps, unranked Practice, and seeded challenge links.
- Xiangqi: cancellable Worker searches, revision guards, keyboard intersection grid, four annotated rule-study positions, notation disambiguation, and draw by agreement. Complete tournament chase/repetition adjudication remains out of scope.
- BayRoute: offline weighted/directed worked examples, trace scrubbing and bounds inspector, six algorithms, five-algorithm comparison, and curated city graphs. The bidirectional first-meeting counterexample and 100 seeded directed-graph comparisons now have engine regressions. External basemaps are opt-in visual context, not extra graph coverage.
- Minesweeper: persistent accessible cells, keyboard/reveal/flag/chord controls, reachable phone Expert edges, pan-cancelled long presses, visible-only hints, and separate assisted records.
- 2048: stable tile identities, travel/merge ancestry, bounded rapid-input queue, complete RNG/Keep-Going undo, and validated per-size active saves. Ineffective moves create neither a spawn nor a history entry.

Optional map adapters use the providers' own projection/overlay APIs, and clean up listeners and stale loads. Google Maps requires a user/configured restricted key and provider access; it is not required for the default lab. [Google OverlayView reference](https://developers.google.com/maps/documentation/javascript/reference/overlay-view), [Leaflet projection reference](https://leafletjs.com/reference.html#map-latlngtocontainerpoint).

Release checks are maintained in `scripts/audit-game-ui.mjs`: strict game filters, real callback evaluation, all twelve internal-game registry entries, Chromium/WebKit light/dark desktop/phone profiles, optional Firefox, UI actions, Focus exit, resize/reduced-motion handling, denied-storage probes, and Astro navigation ownership checks. `--ci` selects the nine redesigned games and two profiles; the full default retains Snake, Tetris and Jetpack Joyride regression coverage. Browser checks supplement—not replace—engine tests, manual visual inspection, type checking, the complete build, and indexing/link/security audits. See the final release result for which runs actually passed.

### Local release verification · 2026-10-13

- `npm run check`: zero errors and warnings (informational hints remain).
- `npm test`: 91 passing files, 4,442 passing tests, 350 pre-existing skipped tests.
- `npm run build`: complete static build of 195 routes plus eligible post/report PDFs; generated files remain uncommitted.
- `npm run audit:indexing`, `npm run audit:links`, `npm run audit:security`: passed; link audit reported zero warnings.
- `npm run audit:games`: passed in Chromium and WebKit over four light/dark desktop/phone profiles × twelve games (96 matrix cases), plus nine reduced-motion/storage-denied probes in each browser.
- `GAME_UI_AUDIT_BROWSERS=firefox npm run audit:games:ci`: passed over two profiles × nine games, plus nine reduced-motion/storage-denied probes.
- JSX spacing check: zero swallowed spaces in the nine edited game routes, GameTools, and Software page.
- Manual desktop/phone visual checks and targeted regressions covered biological artwork, Worker hint responsiveness/cancellation, directed-route costs, Expert-board reachability, pan cancellation, persistent keyboard focus, merge ancestry, interrupted 2048 moves, and exact RNG replay after undo.

Remaining boundaries: Google basemaps require provider access/a restricted key and were not credential-tested locally. The offline lab is fully usable without them. Scientific scenes are cartoons, not structural simulations; Xiangqi does not implement complete tournament chase adjudication; Minesweeper does not promise a no-guess board or complete solver. These boundaries are disclosed in the interfaces. The final deployment result is reported separately; local verification alone does not certify production.

### CI release recovery · 2026-10-14

The first release push (`f25bdeba`) passed type checks, engine/content tests, build and indexing, but did not deploy: run [38513009768](https://github.com/Kuanhao-Chao/Kuanhao-Chao.github.io/actions/runs/38513009768) failed Phage Defense touch confirmation and Dino Run pause assertions. The game audit printed its failures but remained alive until the 12-minute job limit.

Recovery preserves gameplay, scoring and blur/hidden-tab suspension:

- The audit owns the actual Node/Astro preview, not an npm wrapper. Stop is idempotent, waits for `close` (process and pipes), and escalates from TERM to KILL within four seconds. Startup failure and SIGINT/SIGTERM clean up; unsuccessful audits remain nonzero. Killing a shell does not guarantee descendant cleanup, and `exit` alone does not guarantee closed stdio. [Node 22 child-process documentation](https://nodejs.org/download/release/v22.22.0/docs/api/child_process.html).
- Real control clicks wait for fonts/route transitions and center targets away from the sticky header. Canvas coordinates are remeasured after layout changes. There are no force-clicks or relaxed hit-test gates. Visibility alone does not imply a completed fade or an unobscured target. [Playwright actionability](https://playwright.dev/docs/actionability).
- Dino explicitly resumes a legitimately auto-paused run before asserting Pause, verifies that distance stays frozen over elapsed time without manual physics ticks, then verifies Resume advances distance. The old audit was reproduced failing after blur because it clicked **Resume** while expecting Pause.
- Phage checks that touch preview has not deployed a defense, confirms through the real button, inspects via fresh canvas coordinates, and checks the accessible picker after resize.
- Failed scenarios save bounded public state, control labels/rectangles, focus/visibility, center hit targets, full-page PNGs and DOM/action traces. Continuous animated-background screencasts are omitted; explicit failure screenshots remain. Evidence uploads even after failure.

`npm run test:game-audit-runtime` runs seven real-process/browser regressions against an existing build. During recovery, those regressions, unit/content tests (4,442 passed, 350 pre-existing skipped), type checks, the complete build/PDFs, indexing, links and security passed locally. Subsequent larger browser runs and the final build rerun hit `ENOSPC` on the nearly full workstation disk; those failed runs are not reported as passes. Ignored build output was removed to make room for the repair commit; it is regenerated by `npm run build`.

The Pages game gate retains its 12-minute guard and all downstream gates. A separate manual-only [Full game browser audit](https://github.com/Kuanhao-Chao/Kuanhao-Chao.github.io/actions/workflows/game-audit.yml) builds and checks indexing, runs lifecycle regressions, tests all twelve games over four profiles in Chromium/WebKit, and runs the nine-game Firefox smoke. It has read-only repository permissions and neither deploys nor bypasses Pages checks. Remote matrix and deployment results must be verified independently before declaring the release live.

### WebKit interaction follow-up · 2026-10-14

The initial recovery commit (`58862b57`) fixed preview ownership: both Linux runners exited promptly, with the process-cleanup regressions passing. However, Pages run [38582724928](https://github.com/Kuanhao-Chao/Kuanhao-Chao.github.io/actions/runs/38582724928) still failed Dino Pause, and full-browser run [38582872262](https://github.com/Kuanhao-Chao/Kuanhao-Chao.github.io/actions/runs/38582872262) exposed additional WebKit Pause/Resume and Genome Jumper keyboard-start failures. Neither failed run deployed.

After local disk cleanup, short real-control regressions isolated two independent press failures:

- A held native press recorded `mousedown` on Pause but `mouseup` on the canvas after the page scrolled about 400 CSS pixels. Smooth programmatic scrolling is now disabled only when the document contains a game root; ordinary reading pages retain smooth anchor navigation. Native actionability and hit-test checks remain enabled.
- Even with scrolling stabilized, WebKit delivered down/up but no click when the HUD replaced the pressed label's text node on each frame. The existing `setLabel` utility preserves that node and avoids unchanged writes. It now handles continuously refreshed Pause/Sound/ability/upgrade labels; physics, scoring, collision, and suspension rules are unchanged.
- Genome Jumper's old probe started the simulation before acquiring focus. A real blur listener invoked at that boundary suspended the game, so subsequent steering could not advance it. The corrected probe acquires focus first and starts through ArrowRight; a previously paused run resumes through its actual control. Steering is observed while the key is held, with keyup guaranteed in `finally`.
- Control preparation now waits for the actual control's ancestor fade, not just the body's opacity. A regression deliberately fades the content container and records the real Jump activation; it fails if activation occurs before the fade finishes. Dino's paused-state wait also requires a live run, so game-over cannot masquerade as successful Pause.

The regression suite now contains **16 tests**: eleven real WebKit interaction cases (including seven held Pause/Resume presses) and five real preview/process lifecycle cases. The press and keyboard-boundary tests were run failing before their fixes, then passing against the built site. Temporary event/scroll instrumentation and test-only scrolling overrides were removed. `GAME_UI_TEST_BASE_URL` optionally reuses an existing local dev server without taking ownership; CI still owns and tears down its built preview.

Current local gates passed: 4,442 unit/content tests (350 pre-existing skips), zero type/content errors or warnings, the complete 195-route build plus eligible PDFs, indexing, links (zero warnings), repository security invariants, and all sixteen runtime regressions. The full Chromium/WebKit matrix passed all 96 cases plus 18 reduced-motion/storage-denied probes; Firefox passed 18 matrix cases plus nine restricted probes. Captured mobile Phage/Dino and desktop BayRoute layouts were also visually reviewed. Remote matrix and deployment outcomes must still be verified independently; dependency-advisory remediation is not claimed by the repository security-invariant audit.
