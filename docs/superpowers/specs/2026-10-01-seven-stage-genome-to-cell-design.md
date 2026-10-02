# Seven-stage Genome → Cell design

Approved in conversation on 2026-10-01. This document records the approved specification.

## Outcome

Expand the existing Genome → Cell particle background into seven distinct forms:

DNA → RNA → folded protein → cell → expression profile → neural model → probability distribution.

Use seven scroll chapters on the homepage, with full forward/reverse autoplay in the explorer. Preserve reading comfort, mobile usability, the existing renderer lifecycle, visitor preferences, and other background scenes.

## Global constraints

- Node 22 and Astro; Canvas2D; no new runtime dependency or WebGL rewrite.
- Scene name remains Genome → Cell; storage key remains khc-background-v1; scene identifier remains morph; Cells remains the default.
- Canonical progress values are index / 6 in the above order; Cell remains 0.5.
- Stable deterministic particle identities across forms; no regeneration while scrolling.
- Phone/desktop particle budgets remain 1000/3200 ambient and 1600/5000 explorer.
- Phone/desktop DPR caps remain 1.5/2; ambient cadence caps remain 20/24 FPS; explorer caps remain 30/60 FPS.
- Retain adaptive quality, its 400ms crossfade, minimum group-preserving quality, and static fallback.
- Honor paused, calm, reduced motion, page visibility, text selection, and modal suspension.
- Background canvases never capture foreground input, wheel events, or touch scrolling.
- Existing masks protect text, controls, images, terminals, header, footer, and complex widgets.
- No network request is needed to display any animation target.
- Probability finale is an illustrative normalized standard-normal density of a standardized response; it is not measured or calibrated Shorkie uncertainty.

## Chapters and silhouettes

| ID | Position | Visual |
| --- | --- | --- |
| dna | Existing hero | Paired strands, dotted backbone, restrained paired-base accents |
| rna | Research artwork window | Single transcript with bends and local hairpins |
| protein | Publications artwork window | Ubiquitin 1UBQ chain A, with helix, sheets and loops |
| cell | Featured software artwork window | Irregular transparent cell and existing faithful organelle anatomy |
| signal | Posts artwork window | Multi-peak expression signal along genomic position |
| network | Algorithms artwork window | Five layers [4, 6, 8, 6, 3], sparse adjacent connections and subtle pulses |
| distribution | Genome browser artwork window | Single bell-shaped probability density, distinct from expression |

Preserve section order and headings. Artwork windows appear only for morph, remain 240px on phones and 260–340px on desktop, and retain a 16px vertical inset. Four more windows than today add about 960px to the phone homepage when this scene is selected. Ordinary content pages retain a quiet Cell composition.

Center each settled form in its window. Hold it around that center, and interpolate between chapter hold zones. Cache document-coordinate chapter bounds with the reading masks. Reverse scrolling, resize, navigation, and restored scroll positions must preserve deterministic geometry. Missing chapter metadata during attachment uses the quiet Cell fallback.

## Geometry and scientific interpretation

The scene illustrates molecular information → cellular context → measurement → learning → uncertainty. Dots are drawing material, not tracked atoms. The DNA/RNA forms are representative and do not claim to encode ubiquitin's sequence. Translation directs protein synthesis; the artistic transition does not simulate the ribosome or folding dynamics.

Protein geometry derives from the 76 C-alpha coordinates and secondary-structure records of 1UBQ chain A. Bundle unmodified source coordinates plus compact provenance (entry, chain, URL, license, extraction date). Normalize by a rigid orientation and uniform scale only. Render ribbons/tubes around the experimental backbone; retain residue order and helix/sheet intervals. Idle movement changes the view, not the experimentally determined fold.

Sources: https://www.rcsb.org/structure/1UBQ, https://files.rcsb.org/download/1UBQ.pdb, https://www.rcsb.org/pages/usage-policy, https://www.genome.gov/genetics-glossary/Transcription, https://www.genome.gov/genetics-glossary/Translation.

The network is illustrative, not Shorkie's actual architecture. Expression is a non-normalized genomic signal. Distribution axes are standardized response and probability density. Labels and status explain these distinctions in the explorer; homepage art remains decorative.

## Motion

Interpolate adjacent targets with quintic easing and bounded curved trajectories. Curved displacement and its first derivatives vanish at endpoints; small particle-specific delays still complete exactly at each target. All transitions are deterministic and reversible. Retain bounded hover/stir displacement and wall-time settling within 1500ms even with slow callbacks.

DNA opens into RNA; RNA gathers into a fold; protein recedes while cellular context appears; cell organizes into a signal; the signal gathers into network clusters; network material settles into a density. Molecular/cell forms retain restrained depth. Expression and distribution settle into flat planes; the network retains modest depth.

Explorer autoplay holds each target for 2s and spends 3s on each adjacent transition, with a continuous reverse leg (60s total). Form buttons traverse the ordered story at 0.9s per crossed stage, restarting from the displayed pose if interrupted. Scrubbing is immediate; reduced motion makes explicit form changes immediate. Reset, single-step, pause/resume and existing keyboard stirring remain usable.

## Interfaces and verification

One registry supplies stage IDs, canonical progress, labels and explanatory descriptions to model, controller, renderer and explorer. Preserve SceneRenderer's existing normalized progress methods and motion/configuration lifecycle. Samplers remain DOM-free and reuse caller-owned output/scratch points. No per-particle per-frame geometry allocations.

Tests cover target endpoints, finite/bounded geometry, protein source fidelity, normal-density area, all transitions and both sides of boundaries, reverse scrubbing, chapter holds/fallback, autoplay inverse/resumption, adaptive quality participation and exact spring settling. Browser audits cover every endpoint/intermediate, all seven scroll windows, reverse navigation, labels, controls, visibility, themes/CRT, paused/reduced motion, persistence, denied storage and phone widths 390/320px.

Measure update/draw p95 below 6ms desktop and 10ms on a 4x CPU-throttled phone viewport for every target and transition. Run full tests, Astro check, full build, indexing, links and background browser audit before release. Commit, push main, monitor Pages build/deploy, then verify live in Chromium/WebKit desktop and phone profiles.
