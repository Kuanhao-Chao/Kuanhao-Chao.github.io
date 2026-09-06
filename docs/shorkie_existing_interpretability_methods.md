# Shorkie interpretability: current-state inventory

This is a compact companion to [Interpreting Shorkie and genomic sequence-to-function models](./sequence_to_function_interpretability_frontier_and_ideas.md). That frontier document carries the literature survey, proposed experiments, and theory. This inventory records what the audited site and checkpoint-derived scripts actually compute, what is approximate or heuristic, and what should not be promoted to a biological claim.

Repository snapshot: `origin/main` at `4b04b3f0`, re-audited 2026-09-05; the corresponding GitHub Pages workflow completed successfully. The motif-width grid and SAE-grounding work that was uncommitted during the initial audit is released in this snapshot.

## Scope, status vocabulary, and reading rules

Shorkie is a frozen, checkpoint-derived model. “Exact” below means an exact calculation for the stated model, input, target, and intervention (apart from ordinary floating-point and packed-image error); it does not mean a measured biological truth. “Faithful” means faithful to a frozen model and declared scalar. Biological validation requires an external assay or perturbation.

The recurring terms are deliberately narrow. A target is the exact tensor or scalar being explained. An attribution is a local decomposition or sensitivity map. A perturbation changes the input or an internal state and reads out a target contrast. A motif is a recurring sequence pattern, not automatically a bound factor. A grammar is a higher-order spacing/orientation/context rule. A circuit is a causally tested model subgraph, not a biochemical network.

Status labels:

| label | meaning |
| --- | --- |
| `Impl-Exact` | Released/integrated computation at its stated resolution; numerical packing or provider differences may remain. |
| `Impl-Approx` | Released/integrated method with finite-step integration, sampled shuffles/backgrounds, quantisation, or another explicit approximation. |
| `Impl-Heuristic` | Released UI value that is synthetic, illustrative, or a fallback rather than a model-derived measurement. |
| `Released-but-limited` | Committed and page-integrated, but its estimand, null, or labels constrain the claims it can support. |
| `Local-WIP` | Dirty working-tree enhancement not part of the release baseline; do not cite as shipped. |
| `Planned` | A proposal in the frontier document with no current result. |
| `Hist` | Historical README/paper wording not re-established by the current artifact. |

Every method should be read as a row of the same contract: question; exact target/tensor; baseline or control; strand policy; native resolution; exactness status; data route; limitation. Different targets are not one shared “importance” score.

`Local-WIP` remains in the vocabulary so future audits can preserve a release boundary, but no motif or SAE enhancement below is assigned that status in this snapshot.

## Model and target facts

The released supervised Shorkie route accepts a `16,384 × 170` position-major input: four DNA channels, a fifth special/unknown channel that is zero in supplied inference paths, and a 165-way species one-hot. Channel 4 is not established as a mask. DNA masking in the language-model scripts zeroes channels 0–3. The default *S. cerevisiae* species index is 109, and the absolute channel is `5 + 109`.

The checkpoint-derived expression architecture is: an 11-bp, 96-channel convolutional stem; seven pooled residual blocks with widths `[96, 128, 160, 192, 256, 320, 384]`; eight relative-attention Transformer layers at 128 positions, four heads, and width 384 (`key=64`, `value=96`); three additive U-Net decoder stages; and a Softplus head. The pre-crop decoder has 1,024 positions. Cropping 64 bins (1,024 bp) from each side leaves 896 bins covering the central 14,336 bp at 16 bp per bin, with 5,215 output tracks. The shared LM encoder instead has seven decoder stages and a 16,384 × 4 Softmax output.

These are checkpoint/port facts, not a transcription of every paper sentence. The paper/Methods wording differs on attention head count (eight versus four here), parameter count (13.7M versus 14,253,567), filter progression, and omitted pointwise/scale/separable layers. Use the checkpoint and targets sheet for live-site claims; reserve paper values for paper-reproduction context.

The checkpoint’s track order is part of the target contract:

| tracks | indices |
| --- | --- |
| ChIP-exo | 0–1127 (1,128) |
| ChIP-MNase | 1128–1147 (20) |
| TF-induction RNA | 1148–4200 (3,053) |
| 1,000-strain RNA | 4201–5214 (1,014) |

The attribution-oriented `T0` target is a noncontiguous set of 384 `_T0_` records inside the contiguous TF-induction RNA range 1148–4200. It is not the whole 3,053-track RNA group. For bins `[a,b)`, the recurrent locus scalar is

\[
g_{T0}(x;a,b)=\log_2\left(1+\sum_{r=a}^{b-1}{1\over384}\sum_{t\in T0} y_{r,t}(x)\right).
\]

The locus contrast is `g_T0(x';a,b) − g_T0(x;a,b)`. The displayed expression curve commonly averages all 3,053 TF-induction tracks, while locus ISM, gradient, IG, occlusion, and most motif experiments use the 384-track `T0` scalar. The genome-browser gradient uses the distinct whole-window scalar `g_whole_T0`, summing all 896 cropped bins. These are intentional but different estimands.

The release contains 23 analysed loci. Old generator prose that reports fourteen loci is historical runtime context and must not be generalized to current coverage. Most model-backed packs and generators are fold `f0`; the parameter/head checks reject a different checkpoint. The release contains no broad measured-truth panel: optional RNA BigWig overlays exist only where external coverage is available, with missing groups left as no data. There is no wet-lab validation in the repository. The model was not trained with reverse-complement augmentation (`augment_rc: false`); forward/RC averaging is test-time augmentation, not an equivariance guarantee.

## Expression-model methods

### Prediction, curves, and measured overlay

The full expression tensor asks “what does the model predict?” Its target is the exact `Softplus all_tracks` tensor `[896, 5215]`; it has no sequence baseline, is a forward pass in the released locus page, and is native 16-bp output resolution. `scripts/shorkie/make_predictions.py`, the fp16 ONNX graph, `src/data/shorkiePredictions.json`, and `public/vp-data/*-tracks.png` provide the route. This is `Impl-Exact` model prediction, not an RNA measurement. Group curves are presentation reductions: the page’s main RNA curve is usually the 3,053-track TF-induction mean, whereas the single-track and heatmap views preserve per-track output.

The measured RNA overlay is a separate target: external coverage resampled to the cropped 16-bp frame. It has no model baseline or RC transform and is exact only as an imported/resampled external track (`make_truth.py`, `src/data/shorkieTruth.json`). Availability varies by assay group, so “no overlay” is not zero expression and the overlay is not broad validation.

### Input perturbation and attribution

| method / question | target; control or baseline; strand; resolution | status and route | limitation |
| --- | --- | --- | --- |
| Whole-window ISM: what happens if one base changes to each alternate? | For each position `i` and alternate nucleotide `q`, the per-strand contrast `g_T0(x_i←q; a,b) − g_T0(x;a,b)` over the focal gene body; reference allele is zero by construction. Forward and RC scores are computed separately, remapped, then averaged. 4×16,384 stored plane at 1 bp. | `Impl-Exact` finite-difference intervention (plus fp16/PNG packing error). `make_ism.py`, `public/vp-data/<id>-ism.png` and sidecars, then `shorkieVariation.json`. | It is exact for the frozen model, not a population or clinical effect; it explains one focal-gene target, and a reference-base logo is a transform of the alternative plane, not an additional assay. |
| Gradient × input: where is the reference sequence locally sensitive? | Derivative of the same `g_T0` anchor scalar at the reference one-hot; no separate baseline. Input gradients are forward/RC computed, remapped, and averaged; bases are mean-centred before reference projection. Native 1-bp anchor profiles, with broad display rows grouping 8 output bins (128 bp). | `Impl-Exact` autograd derivative of the port. `make_attribution.py`, `*-input.png`, `*-anchor.png`, `*-attr.json`. | A local derivative is not a counterfactual and does not sum to the prediction. Internal relevance margins are forward-only even when input attribution is RC-averaged. |
| Integrated Gradients: what accumulates along a sequence-to-reference path? | Same anchor `g_T0`; all four DNA channels zeroed at baseline while species channels remain valid; 32 straight-line steps. Forward and RC paths are remapped and averaged, with completeness gap recorded. 1 bp. | `Impl-Approx` finite-step path integral in `make_attribution.py` and `*-ig.png`. | Zero-DNA is an out-of-distribution/ablation baseline, and completeness tests numerical integration, not baseline validity or biological causality. Mean-centering would destroy completeness and is not applied. |
| 64-bp occlusion: what does removing a contiguous stretch lose across outputs? | Zero DNA channels in each of 256 non-overlapping 64-bp windows; read out per-bin T0 logSED profile over all 896 output bins. Forward and RC profiles are flipped/remapped and averaged. 64-bp input × 16-bp output. | `Impl-Exact` N-run intervention for each run; `make_occlusion.py`, `*-occl.png` and sidecars. | Zeroing is not a composition-preserving motif knockout; it probes information loss and can be OOD. It is not 1-bp localization. |
| Genome ISM lane: where are released mutagenesis effects on the genome? | Reference-base saliency derived from the stored four-row ISM plane, not a new forward pass; no new baseline. Input 1 bp; only the 23 windows have values and other bases are no data. | `Impl-Exact` transform/placement via `make_ism_track.py` and genome tiles. | Sparse windows cover only 23 loci; decode must use the pack inverse. It remains a model effect, not selection or function. |

The input target is often described informally as “expression.” The safe wording is “predicted T0 RNA-seq coverage over the named bin interval,” with the interval and track set stated. The page’s all-track curve and the attribution scalar can correlate closely without being interchangeable.

## Network-internal methods

The live conv-stem view asks which first-layer filters fire on a sequence. It runs the real 11×4×96 convolution directly in TypeScript on DNA-only input (`stemActivations`, `src/data/shorkieStem.json`), forward strand, no baseline, at native base/stem-window resolution. It is `Impl-Exact` for the stem alone: a filter is a learned local pattern detector, but downstream model behavior and full-window context are not represented.

The released intermediate traceback asks which internal activations are associated with a selected `g_T0` anchor. A forward pass retains seven block outputs, eight Transformer residual streams, and three decoder outputs: 18 mapped stages and 5,760 concatenated channels, pooled to 128 display positions where needed. For each activation `a`, the margin is `|a × ∂g/∂a|`; channel and position row sums are exact for that forward target and superpose over output-bin groups. The input-side attribution remains RC-averaged, but internal relevance intentionally remains forward-only because averaging two activation states would create a state the model never evaluated. This is `Impl-Exact` for the margins, via `make_attribution.py` and `*-channels.png`, `*-positions.png`, and `*-stages.png`.

The browser’s 2D stage “relevance map” is not a native per-channel-by-position gradient map. It reconstructs a normalized outer product of the exact channel and position margins, assuming independence. That interior is `Impl-Approx`; it can be useful for a compact display but must not be described as a recovered neuron-by-position causal map. The separate stage stack uses the released exact `[18 × 128]` positional-margin plane when it is available: it sums the selected output-bin groups, reshapes one profile per stage, and introduces no further factorization. Only older packs without that plane fall back to a factorized mixture of per-channel relevance and real activation position. The top-neuron traces draw real activation profiles selected by exact per-channel margins; they are not position-resolved `|gradient × activation|` maps.

Attention exports are eight matrices of shape `[8,128,128]`: one matrix per Transformer layer after averaging its four raw heads. Rollout applies residual half-identity mixing, row normalization, and layer products to whichever matrices load. The transform is `Impl-Exact` on the loaded pack, but the quantity is unsigned token-mixing/architectural visibility at 128 bp per token, not functional attribution. It has no RC ensemble and cannot support individual-head biology.

The attention enrichment surface has been partly corrected. The visible page now asks about layers, labels the eight columns `L0`–`L7`, and explicitly says that four heads were averaged within each layer. However, `make_heads.py`, `shorkieHeads.json` keys such as `heads` and `byHead`, and the canvas accessibility label still use legacy head wording. The raw four-head tensors are not present in the browser pack. The computed values therefore support only descriptive layer-level analysis; no field named `byHead`, `best`, or similar can support head specialization. This remains `Released-but-limited` until the producer/schema/accessibility labels are migrated or raw `[layer, head, query, key]` tensors are exported.

## Biological and motif methods

Curated annotations come from SGD/UCSC-derived packs with explicit evidence tiers (ChIP-supported, conserved-only, and thresholded PWM scan). The annotations are not model output. Annotation enrichment computes mean absolute attribution over a class divided by the whole-window mean, with 256 deterministic circular shifts preserving feature geometry as a positional null. TSS metaprofiles align the same gradient×input signal to plus-strand `txStart` or minus-strand `txEnd`, reversing minus-strand profiles. Both are `Impl-Exact` descriptive summaries of an already local/approximate attribution (`make_biology_summary.py`, `shorkieBiologySummary.json`), not independent replication.

| method / question | target; control; strand; resolution | status and route | limitation |
| --- | --- | --- | --- |
| Motif knockout sweep: is a curated site necessary in its native context? | Focal-gene T0 score; seeded Fisher–Yates shuffles of each site preserve length/composition, with mean and SD over repeated draws. Each sequence is evaluated forward and as an RC input; RC output bins are reversed, per-bin T0 coverages are averaged across strands, and the focal interval is then summed and log-transformed. Site-level resolution. | `Impl-Approx`, `make_knockout_sweep.py`, `*-ko.json`; the interactive primitive uses the same LCG. | A shuffle can alter more than motif syntax, and necessity does not prove binding or endogenous causality. Low-complexity sites may have few distinct permutations and zero SD. |
| HVP/epistasis: where does a motif’s local sensitivity change? | `H·v = ∇x〈∇x g_T0,v〉` for a ChIP-supported motif indicator, paired with Hessian symmetry as a numerical control; RC indicator must be mirrored/remapped. Base-level vector per site, 431 sites. | `Impl-Exact` second derivative at the reference (floating-point error); `make_epistasis.py`, `*-hess.*`, `shorkieEpistasis.json`. | It is a local second derivative, not all pairwise finite mutations or an in-vivo interaction. Periodograms can be window harmonics; a reported helical ratio is a model diagnostic, not molecular evidence. |
| Segregating-variant attenuation: are observed yeast alleles milder than alternatives? | Stored ISM effect for the observed allele versus the two unobserved alternates at the same base; reference allele must match sacCer3 and the zero reference row is excluded. Base-level paired statistic. | `Impl-Exact` arithmetic on released ISM planes; `make_variation.py`, `shorkieVariation.json`. | Descriptive selection alignment depends on variant ascertainment and annotations; it cannot identify the selection mechanism. |
| Per-regulator kinetics: do predicted sequence drivers change during induction? | RC-averaged gradient×input over one regulator’s qualifying early and late track subsets and the focal gene. The release stores early-versus-late correlation and top-500-base overlap for every qualifying regulator, plus paired 1-bp early/late profiles for the most shifted regulators. It does not compute a T0-versus-late correlation. | `Impl-Approx` because track subsets, the minimum-replicate rule, selected profiles, and packing are finite choices; `make_kinetics.py`, `shorkieKinetics.json`, `*-kin.*`. | The 13 all-regulator timepoint-mean attributions are a near-redundant negative control (`r ≥ 0.9995`); a per-regulator shift is still model attribution dynamics, not measured TF occupancy. |

The executable knockout generator and its payload are authoritative for the sweep row: they explicitly say `rc-averaged` and perform two model runs per sequence. The current page’s cost copy instead says “one forward pass” and “single strand.” That is a released UI-copy defect, not a different sweep artifact; comparisons should use the generator/payload contract until the page sentence is corrected.

The LM annotation summary also compares information content against CDS, intron, LTR, TFBS, and regulatory classes using the same circular-shift principle. The loss-weight audit (`exon_loss_scale=0.1`, `repeat_loss_scale=0.1`, intergenic/non-repeat 1.0) is a training-configuration interpretation, not a perturbation of the checkpoint. It should be reported as a model behavior and control result, not as proof that loss weights caused biological constraint.

## Constructive and frontier tools

These methods change or synthesize sequence rather than only reading native sites.

| method / question | target; control; strand; resolution | status and route | limitation |
| --- | --- | --- | --- |
| Global Importance Analysis: is a motif sufficient in a neutralized background? | Local implant target over ±512 bp and whole-window `g_whole_T0`; forward, reverse-complement, and composition-preserving scramble arms on the same dinucleotide-shuffled backgrounds. Scalar summaries. | `Impl-Approx`, `make_gia.py`, `shorkieGia.json`; sampled backgrounds and motif panel. | A central implant is constructive and may be OOD relative to native placement. A response does not establish endogenous necessity, factor identity, or a grammar. |
| Motif position scan: where does an implanted motif move the target? | Own-gene `g_T0` contrast between one consensus instance and its same-span shuffled control at each position in the forward-sequence model input; default 64-bp position grid. Strand annotation changes only TSS-direction alignment: minus-strand distances/profiles are reversed, not rescored as a separate RC model arm. | `Impl-Approx`, `make_position.py`, `shorkiePosition.json`. | Overwriting native sequence destroys context; one sampled consensus/scramble pair and a position effect do not establish a natural-site or strand-robust effect. |
| Spacing/orientation scan: do two motifs interact at a chosen spacing? | Pair interaction `F_AB−F_A−F_B+F_∅`, with B-alone recomputed at each spacing/orientation on shared dinucleotide-shuffled backgrounds; sampled spacing grid and explicit 10.5-bp comparison. | `Impl-Approx`, `make_spacing.py`, `shorkieSpacing.json`. | It is a finite constructive experiment, not proof of an endogenous grammar; motif/background selection and periodicity-window artifacts matter. |
| Effective-context scan: how much sequence does a prediction use? | Preserve a centered native core and dinucleotide-shuffle flanks exactly by dinucleotide count; read out own-gene `g_T0` over radii 64–8,192 bp, with repeated shuffles. | `Impl-Approx`, `make_receptive.py`, `shorkieReceptive.json`; the Attention Studio convergence curve reads this pack. | This estimates an empirical context dependence, not the formal architectural receptive field; shuffle seed, core, threshold, and locus determine the curve. |
| Greedy counterfactual editing: what would the model build? | Gradient proposes base substitutions to ascend own-gene `g_T0`; real forwards verify accepted edits. Reference sequence and a dinucleotide-shuffled ascent arm are controls; selected-base resolution, with both motif orientations scanned. | `Impl-Approx`, `make_counterfactual.py`, `shorkieCounterfactual.json`. | Search is greedy and budgeted; accepted edits are exact forward checks but the design is not a generative or biological assay. |
| Species one-hot sweep: how does conditioning change a fixed promoter? | Hold DNA fixed and substitute each of 165 species labels; own-gene scalar/profile output. Cross-locus rank agreement and eight *Yarrowia* rows selected by name provide controls; no RC average. | `Impl-Exact` model counterfactual, `make_species.py`, `shorkieSpecies.json`. | It measures the checkpoint’s conditional response. Fixed *S. cerevisiae* DNA plus another species identity can be out of distribution and is not species-transfer biology. The generator docstring and payload’s human-readable `reading` string still say “five,” but the stored index array contains eight and the current page derives the displayed count from that array. |

For new methods, use the linked frontier document rather than expanding this inventory into a literature survey. Planned priorities include a common faithfulness benchmark against exact edits, deterministic RC/fold-aware tracing, path-specific skip interventions, RC-paired sparse features and cross-resolution circuits, and provenance experiments only if training manifests and retraining hooks exist. None is a current shipped result merely because a proposal names it.

## Shorkie_LM methods

Shorkie_LM shares the encoder but has seven decoder stages to return to 16,384 positions and a four-way Softmax. Its main scalar is a masked-token distribution, entropy, or information content; these answer “what base belongs here?” and not “what will this express?”

| method / question | target; control/baseline; strand; resolution | status and route | limitation |
| --- | --- | --- | --- |
| Iterative masked prediction (`K=7`): can context predict each base? | Each position is masked once in a strided partition (`i mod 7`), by zeroing DNA channels 0–3; use only that pass’s prediction. No RC averaging. Base-level 16,384 positions. | `Impl-Exact` seven-pass LM computation, with PNG quantisation/renormalisation; `make_lm_packs.py`, `public/lm-data/*-masked.*`, genome `lm-masked` tiles. | Information content `2−H(p)` is predictability/constraint, not function or alignment conservation. |
| Unmasked pass: what does full context predict when the answer is visible? | Same four-way distribution with no masked positions; no baseline or RC. Base-level. | `Impl-Exact` but intentionally leakage-prone; retained for paper-figure comparison and contrast with the real masked task (`*-unmasked.*`). | It can largely copy the input. Its low cross-entropy must not be called masked prediction. |
| Contiguous motif infilling: can the LM reconstruct a whole site? | Mask an entire curated ChIP-supported, nontruncated site and compare argmax identity/mean reference probability with a full-window composition floor: the most frequent valid base across that locus’s 16,384-bp reference window. No RC average; site/base resolution. | `Impl-Exact` conditional run, one pass per site, stored in each LM sidecar. | The constant-base floor is not site-local, and a contiguous hole differs from the scattered training mask; reconstruction says sequence compatibility, not TF identity, binding, or regulatory function. |
| Information-content annotation enrichment and loss-weight audit | Mean `2−H` over annotation classes; 256 circular shifts are the null. Coding/repeat/noncoding comparisons use the checkpoint’s training weights as the interpretive question. Base-level. | `Impl-Exact` summaries of LM output, `make_lm_summary.py`, `shorkieLmSummary.json`, page-side tables. | High IC can be caused by repeats, homopolymers, or composition. The observed exon/repeat behavior does not isolate why the training loss produced it. |
| First attention-layer embedding | Unmasked `attn_out1`, `[128,384]` residual representation packed as `[384,128]`; no explicit baseline or RC. 128-bp token resolution. | `Impl-Exact` internal feature extraction, `*-embed.png`; exploratory representation, not an attribution. | Quantised features are not automatically concepts, and the unmasked pass carries input leakage. |

## Genome browser

The browser stitches model and external tracks across the genome, but each lane has its own target:

| lane / question | target; control; strand; resolution | status and route | limitation |
| --- | --- | --- | --- |
| Shorkie coverage families: what does the model predict at each genomic bin? | One forward pass produces four assay-block means, the 384-track T0 baseline, 12 additional timepoint means (13 including T0), 9 histone-mark means, and 25 selected ChIP-exo target means; no baseline subtraction or RC average; 16-bp bins. | `Impl-Exact` prediction/reduction via `make_genome_shorkie.py --pass coverage` and `make_genome_tiles.py`. The browser’s `sk-rnaseq` is the T0 mean—not the full 3,053-track induction mean—and it publishes pooled ChIP-exo, ChIP-MNase, and strain lanes, 9 histone and 25 target picker lanes, plus `sk-induction`, a derived spread across the 13 timepoint means. | Every lane is model output, not measured coverage. Pooling can hide disagreeing tracks; the 13 individual timepoint means are generator inputs to the spread summary, not 13 separately selectable browser lanes. |
| Genome gradient × input: which bases affect whole-window T0 signal? | Input gradient×input of `g_whole_T0` over all 896 cropped bins; reference sequence is the local point, forward and RC gradients remapped/averaged; 1 bp. | `Impl-Exact`, `make_genome_shorkie.py --pass gradient`, dense `sk-gradient` tiles. | It is a whole-window target, not the selected-gene locus target, and remains a local derivative rather than an intervention. |
| Genome Integrated Gradients: which bases accumulate contribution from a declared reference? | Same `g_whole_T0`; all four DNA channels are zero at the reference while species channels remain valid; 32 midpoint steps. Forward and RC paths are remapped/averaged; 1 bp. | `Impl-Approx` finite-step path integral, `make_genome_shorkie.py --pass ig`, dense `sk-ig` tiles. | Completeness tests the numerical path integral, not the biological validity of the all-zero-DNA reference; this whole-window target differs from selected-gene locus IG. |
| Genome occlusion: what changes when each input block is removed? | Same `g_whole_T0`; zero one 64-bp DNA block, rerun forward and RC inputs at mirrored spans, and average the mutant-minus-reference scalar. Native 64-bp blocks. | `Impl-Exact` finite intervention for each scored block, `make_genome_shorkie.py --pass occlusion`, dense `sk-occl` tiles. | Zero-DNA ablation can be out of distribution, and a 64-bp effect cannot localize a causal base. |
| LM masked/unmasked constraint | Per-base masked-token entropy/IC or visible-input distribution, stitched from uncontaminated window cores; K=7 masked schedule versus no-mask control; no RC; 1 bp. | `Impl-Exact`, `make_genome_track.py`, LM tiles. | Window edges/no-data and quantisation remain; IC is constraint/predictability, not function. |
| phastCons comparator | External seven-way alignment posterior; missing alignment values are no-data, not zero; native base tiles. | `Impl-Exact` external comparator, conservation tiles. | It is not a Shorkie output or an experimental assay; only aligned yeast species contribute. |
| GC control | Centered 50-bp local GC fraction; no model baseline, no RC; 1-bp track after windowing. | `Impl-Exact` sequence statistic, GC tiles/correlation scratch data. | Width is an analytical choice and this is not a matched causal intervention. |
| Annotation/features and motif logos | External SGD/UCSC/JASPAR calls with evidence tiers, coordinates, and aliases; no model target/control; feature/site resolution. | `Impl-Exact` provenance layer, `make_genome_features.py` and `make_motif_logos.py`. | Presence or absence is source-dependent and does not mean the model uses or binds the feature. |
| Sparse ISM lane | Reference-base saliency from released ISM planes placed at true coordinates; no new forward run, forward/RC behavior inherited from ISM; 1 bp only in 23 windows. | `Impl-Exact` packing/placement, `make_ism_track.py`. | It is sparse by design and model-derived, not genome-wide causal biology. |

Thus gradient × input, 32-step IG, and 64-bp occlusion are dense genome-scale tracks, whereas ISM remains a sparse placement of the 23 fully mutagenized windows. “Genome-wide ISM” would be inaccurate in either direction: the released lane exists across the coordinate system, but most positions are explicit no-data rather than computed effects.

## Attention Studio

The Studio is a mixed evidence surface and must be read conditionally.

1. When a real `<id>.json` attention pack and `<id>-attn.png` load, it decodes eight head-averaged `[128,128]` layer matrices. The matrix and residual rollout are exact transforms of that pack, at 128 bp/token, unsigned, and descriptive of token mixing. They do not establish enhancer-to-TSS dependency, causal direction, or individual-head specialization.
2. On missing or corrupt metadata/PNG, the underlying model data are unavailable; the controller reports that state, installs synthetic diagonal-like matrices `exp(−distance/(4+2l))+0.005`, and continues to render arcs, rollout, and percentages. This fallback is `Impl-Heuristic`, not loaded model data. A visual alone could not previously distinguish it, because the only marker was a status line that scrolls away; the controller now sets a `syntheticAttention` flag and a `data-studio-synthetic` attribute, and stamps both canvases with a visible “not model data” watermark whenever the fallback is in use.
3. The receptive-field ladder in `src/lib/shorkieAttention.ts` has been re-derived from the checkpoint and no longer drifts. It was wrong in three columns at once: an 11-bp stem was recorded as 15 bp (the paper’s figure) and the whole `rf' = 2·rf + 5` recurrence was seeded from it; and `resolution` and `channels` were each shifted by one stage, describing `block1` as 8,192 positions of 128 channels when the recorded activation is 16,384 of 96. The corrected ladder is 11 / 15 / 24 / 42 / 78 / 150 / 294 / 582 bp, cross-checked by perturbing one input base and measuring which units respond — the empirical span agrees to within one grid unit and is a lower bound, because a max-pool propagates only when its maximum moves. Its unit test now recomputes the ladder from the kernel sizes rather than restating it; the previous test asserted the wrong values and so confirmed the defect.
4. The Transformer/CNN/SSM “signal transmission” curves are hand-coded formulas with arbitrary decay/floor constants, not comparison-model runs or fitted measurements. They are heuristic illustrations only, and the function that produces them now says so in its own docstring; the one derived constant in it is Shorkie’s real 582-bp widest convolutional reach.
5. “Enhancer” and “TSS” are draggable user labels for arbitrary token coordinates. The convergence curve can be model-derived only as the shuffled-flank effective-context pack, not as attention convergence.
6. The main page’s primary panel question and axes now say layers, but its section introduction, “no head can exceed” detail, canvas accessibility label, producer/schema names, and final cancellation caveat still say heads. Its claim that layers “read” regulatory DNA or tRNA is stronger than the descriptive circular-shift enrichment warrants. The page suggests that a “live run” could answer the head-specialization question, but `build_onnx.py` collapses heads before ONNX export and the current browser runtime consumes that collapsed output; recovering per-head tensors requires a newly instrumented raw-checkpoint run or export, not the existing live browser route. Safe language is that head-averaged layer attention is enriched or depleted over the named annotations under this null; it neither identifies a specialized head nor proves that the model uses an annotation biologically.

Two adjacent viewport descriptions also drift from the implementation. At high zoom only the 1-bp ISM, gradient × input, and Integrated Gradients lanes change from bars to DNA-logo renderers; 64-bp occlusion and 128-bp rollout remain bands, despite an accessibility label saying “every attribution method” becomes a logo. Selecting a band changes the internal tracing target, but it does not retarget the existing focal-gene ISM plane, so the sentence that “every panel below” is conditioned on the selection is false. These are released interface-copy/accessibility defects, not different data products.

## Patching, motif discovery, and sparse features: release boundary

The current `main` release (`4b04b3f0`) commits and integrates `make_patching.py`/`src/data/shorkiePatching.json`, the two-width custom MoDISco-like script/`src/data/shorkieModisco.json`, and the expanded TopK SAE script/`src/data/shorkieSae.json`. They are therefore not accurately described as absent prototypes or local-only enhancements. They remain limited model analyses, not biological validation.

### Causal patching

The patching target is forward-strand focal-gene `g_T0` over the 384 T0 tracks. It corrupts a strand-aware 1-kb promoter with one Altschul–Erikson dinucleotide shuffle, caches clean activations, and restores a clean tensor slice into the corrupted run. Recovery is `(f_restored−f_corrupt)/(f_clean−f_corrupt)`. The grid is 19 named stages (stem, seven blocks, eight `attn_out` streams, three decoders) by 32 common bands of 512 bp. Controls restore all positions at the first and last stages (1), and no positions (0); bottleneck full restoration can fall below 1 because U-Net skips bypass the Transformer. The committed pack covers 22 loci because one corruption had too little denominator signal.

This is `Released-but-limited`: fold `f0` only, forward only, one corruption draw per locus, Python `hash(locus_id)` seed (unstable unless `PYTHONHASHSEED` is fixed), no fold/seed/corruption uncertainty, and one-band/one-path restoration. It is not a true joint path-specific intervention on main and skip branches. Recovery is a signed normalized effect and can be below 0 or above 1. The next check is deterministic repeated corruptions, exact motif edits, both strands, folds, source swaps, and joint branch necessity/sufficiency before causal language is strengthened.

### Compact motif discovery

The committed MoDISco-like output is a custom greedy-correlation analysis over existing ISM planes: it extracts high-|saliency| blocks at both 11- and 15-bp widths, retains four-base mean-centred contribution matrices, matches both orientations, averages into a PWM, and compares to a local JASPAR set. It is not canonical TF-MoDISco or TF-MoDISco-lite. The released generator declares the two widths in advance and publishes both cells, but the repository supplies no external preregistration record. At 11 bp the real and shuffled arms yield 3 and 2 retained clusters; at 15 bp they tie 3 and 3, and every reported cluster in both arms matches the database threshold. More importantly, the shuffled arm does not rerun the expression model or recompute ISM/contribution maps on shuffled inputs; it reuses the original planes and shuffles only the sequence used for reference-base selection/projection. Thus real and null arms do not estimate the same model-conditioned quantity. The page’s statement that exceeding the finite shuffled arm’s empirical 99.9th percentile is “essentially impossible” under the null is not justified, especially because that arm is not a matched model-conditioned null. The generator’s reproduction comment also documents `--width`, although its parser accepts `--widths`. Treat both committed width cells as `Released-but-limited`; do not claim a validated discovered motif.

### TopK SAE

The committed SAE trains an overcomplete TopK dictionary on the `attn_out8` bottleneck residual stream (384 dimensions, 128-bp positions; 94,970 vectors, 6,144 features, `k=32`) and compares reconstruction with a column-shuffled activation control (FVU 0.0194 versus 0.3733). It now also reports the 64 features with greatest total activation, 6-mer signatures from each feature’s top 48 cells, and alignment to mean-pooled genome annotations using 256 circular shifts. A second, candidate-count-matched control scores the strongest 384 SAE features and all 384 raw channels with the same statistic and 64 shifts; their median best enrichment ratios are 5.977× and 4.715×. Current page text and generator commentary incorrectly say all 6,144 features receive the annotation scan: the detailed loop scores only the selected 64, while the distinct matched comparison scores 384 SAE candidates. These are integrated exploratory and correlational results. Feature selection, composition-sensitive annotations, and best-over-class summaries remain important caveats, and neither reconstruction nor enrichment establishes monosemanticity or causal use. The released controls do not replace fold/RC replication or feature intervention in the original model.

## Reliability foundation: folds, faithfulness, references, grammar, matched nulls

Five cards from the frontier portfolio are now released, and they are the only ones whose subject is the rest of this inventory rather than the model. They are Group A of that document's own dependency graph — Proposal 1, Proposal 2 and Proposal 4 — plus Proposal 11 and the matched null Proposal 3 requires. Generators: `make_folds.py`, `make_faithfulness.py`, `make_references.py`, `make_grammar.py`, `make_null_planes.py`, sharing `common.py`. `verify_pipeline.py` §3i–3k re-derive every headline from `perLocus` and, when the sweep caches are present, recompute one locus's fold statistics from the raw per-fold arrays.

### Training-fold uncertainty is no longer unestimated

Earlier revisions of this document recorded fold uncertainty as unestimable because only `f0` was established. That was wrong about availability, not about method: all eight folds are public at `https://storage.googleapis.com/seqnn-share/shorkie_models/shorkie/f<n>/model_best.h5`, each 57,571,980 bytes, and each loads through the port with exactly 14,253,567 parameters and every tensor consumed. They are genuinely different models — distinct weight bytes, and on one locus they span `g` = 14.98 to 15.73, a factor of 1.68 in coverage.

`shorkieFolds.json` recomputes every exact single-base effect in a locked per-locus panel — the 128 strongest by mutagenesis plus 128 matched on distance to TSS — under all eight checkpoints and on both strands: 17,664 substitutions over 23 loci. The panel is selected from `f0`, so `f0` is excluded from every cross-fold statistic and reported separately; measuring the selecting checkpoint's agreement with its own selection would report the selection back to itself. Status `Impl-Exact` for the effects, `Impl-Approx` for the interval, which uses a normal approximation over seven folds.

| quantity | value |
| --- | --- |
| strongest bases fold-stable (sign agreement ≥ 0.80 and 95% interval excluding zero) | **85.1%** |
| distance-matched control bases fold-stable | **53.7%** |
| median sign agreement over `f1`–`f7` (preregistered gate 0.80) | 1.000 |
| median top-1% overlap between evidence-fold pairs (gate 0.40) | 0.485 |
| median cross-fold sd | 0.00851 |
| median strand deviation | 0.00802 |
| strand ÷ fold | **0.943** |

Fold and strand are separate axes throughout and must not be pooled. The model was trained with `augment_rc: false`, so a forward/reverse difference is a property of the checkpoint rather than sampling noise, and the two terms are of comparable size here — pooling them into one error bar would conceal both. The safe claim is that a large majority of the strongest per-base effects are stable across the released training runs, at roughly 1.6× the rate of composition- and position-matched controls; it is not a claim about biological reproducibility.

### Direction is stable across folds; ranking is much less so

The fold pack originally shipped medians only, so "recomputed under all eight folds" was a statement a reader had to take on trust. It now carries every fold's own scalar at every locus, its median |effect|, its agreement with the majority, and the **8×8 pairwise overlap** between checkpoints — all recovered from the same caches with no model run.

That matrix separates two claims the aggregate had merged. Sign agreement across folds is **85.1%** on the strongest bases, but any two checkpoints share only **41–55%** of their top 1% of bases (mean off-diagonal 0.488). The *direction* of a strong effect is a stable property; *which* bases rank highest is substantially a property of the individual training run. A single-fold ranking is therefore a weaker object than a single-fold sign, and released surfaces that present a ranking — the logos, the top-k tables, the seqlet extraction that feeds the motif panel — inherit that weakness rather than the 85% figure.

Safe claim: a large majority of the strongest per-base effects keep their sign and a 95% interval clear of zero across the eight released training runs, at roughly 1.6× the rate of composition- and position-matched controls; the identity of the top-ranked bases is about half reproducible between any two runs. Neither is a statement about biological reproducibility.

### The randomization sanity check, and why one number would have misled

`make_faithfulness.py` previously declared cascading parameter randomization in its docstring and carried both `--skip-randomization` and `RANDOMIZE_LOCI`, while implementing none of it. It is implemented now, by **permuting each parameter tensor's own values** rather than resampling them: a permutation preserves every parameter's exact marginal distribution and destroys only the arrangement, so a collapse cannot be attributed to a change of scale.

Randomizing head-first over 6 loci, gradient × input decorrelates from its intact self monotonically, **0.96 → 0.25**. Two features of that profile matter more than the endpoints:

- Destroying the **entire transformer** moves it only **0.60 → 0.34**, not to zero, because the three decoder skips are fed by `block5`–`block7` and carry real signal around the bottleneck. Reported as one pooled number this would read as the sanity check failing; it is an architectural fact, and every row therefore carries the branch it destroyed.
- It does not settle at zero even with the whole network randomized (**0.25**). That residual is what the one-hot input geometry contributes before any learning, and it is the floor any collapse should be read against.

Status `Impl-Approx` — one permutation seed, 6 loci, gradient × input only. The check establishes that the map reads the network; it says nothing about whether the network is right.

### Every attribution surface now has an exact-edit score

`shorkieFaithfulness.json` scores each released attribution against the exhaustive mutagenesis planes on two axes. Rank agreement is computed at **each method's own native resolution**, with the ground truth pooled to match, so a 64-bp or 128-bp method is not penalised for its resolution. The deletion curve is an intervention rather than a correlation: rank the bases, substitute the top-k to the alternative the exact plane says is worst, re-run forward and reverse, and record the real fall in `g`. Every curve is divided by what ranking by that same damage achieves, so the column reads as the fraction of achievable damage a ranking found.

| method | native resolution | rank ρ vs exact ISM | deletion AUC | status |
| --- | --- | --- | --- | --- |
| exact mutagenesis (the scale) | 1 bp | 0.415 | 1.000 | ceiling, not a method |
| Integrated Gradients | 1 bp | 0.469 | **0.897** | clears the baselines |
| gradient × input | 1 bp | 0.696 | **0.858** | clears the baselines |
| 64-bp occlusion | 64 bp | 0.623 | **0.286** | clears the baselines |
| conv-stem response (baseline) | 1 bp | 0.004 | 0.166 | baseline |
| random ranking (baseline) | 1 bp | 0.002 | 0.153 | baseline |
| distance to TSS (baseline) | 1 bp | 0.555 | 0.117 | baseline |
| GC content (baseline) | 1 bp | -0.037 | 0.059 | baseline |
| attention rollout | 128 bp | 0.529 | **0.040** | **does not clear the baselines** |

Attention rollout ranks below every baseline including a random ordering, while still correlating with the ground truth at ρ = 0.529. That dissociation is the useful result: rollout indicates where signal is concentrated and not which bases carry it, which is what an unsigned token-mixing quantity should do. Distance to TSS shows the same pattern more weakly (ρ = 0.555 at AUC 0.117). Rollout should not be described as an attribution, and the released rollout surfaces should carry that limitation.

Two metric errors were found by running the benchmark rather than by reasoning about it, and both are recorded because either would have produced a confident wrong ranking. Normalising each curve by its own endpoint measures curve shape rather than damage, and made a distance-to-TSS baseline outrank a method correlating at ρ = 0.73. And an oracle ranked by `max |effect|` does not bound a deletion task that applies the *worst* substitution: Integrated Gradients scored 1.0053 against that "ceiling". Both are fixed, and `verify_pipeline` now fails if any method exceeds the ceiling.

### The fold axis, crossed with all three benchmarks

Each of the three benchmarks that GRADE this page was a single-checkpoint result presented beside a panel about training-fold uncertainty. All three were re-run under every released fold. **What each fold is scored against matters and is recorded**: `ism_truth` reads fold `f0`'s exhaustive mutagenesis regardless of the checkpoint under test, because that is the only exhaustive mutagenesis that exists — per-fold planes are roughly 52 GPU-hours. The fold arm therefore tests whether the page's `f0`-derived conclusions *transfer* to another checkpoint, which is the right question for an `f0`-derived page but is not "each checkpoint against its own ground truth". One consequence is visible in the numbers: the oracle bounds only `f0`, and expected gradients edges past it at 1.008 under two other folds. Every `byFold` block records `truthFold`.

| benchmark | verdict across the eight checkpoints |
| --- | --- |
| Faithfulness | Unanimous. Integrated gradients, gradient × input and 64-bp occlusion clear the baselines in **8 of 8**; attention rollout in **0 of 8**, below every baseline in every fold. No method is split. The *spread* differs by method — integrated gradients varies over 0.109 across folds against 0.172 for gradient × input — so how much a score depends on the training run is itself a property of the method. |
| References | Split into a robust and a non-robust half, and the single-fold result had reported the non-robust one. **Robust:** the shipped all-zero default wins in **0 of 8**; every shuffle-based family beats it under every checkpoint. **Not robust:** which family is best — the winner moves across folds (dinuc, mono, expected, mono, expected, mono, mono, expected) and the three shuffle medians sit within 0.035 of each other. On `f0` alone dinucleotide won; over eight folds the median favours mononucleotide (0.980 against 0.949). The safe claim is to move OFF the all-zero baseline, naming no replacement. |
| Grammar | Unanimous negative. The Hessian's correlation with the measured interaction residual is **positive in 0 of 8** folds (-0.112, -0.169, -0.172, -0.028, -0.058, -0.081, -0.021, -0.000), and separation alone beats it in **8 of 8**. The fold arm uses a reduced panel — 10 positions a locus against the headline's 20, so 9,315 pairs a fold — because the fold question is whether the calibration's *sign* survives retraining. The panel size is recorded in `byFold.positionsPerLocus` rather than in prose. |

The practical consequence for released copy: the demotion of attention rollout, the rejection of the all-zero IG baseline, and the failure of the second-order panel to calibrate are all properties of the method rather than of the checkpoint the page happens to run, and may be stated as such. The *identity* of the best reference family may not.

### The released Hessian panel does not calibrate to discrete double edits

`shorkieGrammar.json` enumerates every double substitution over a locked per-locus panel — half the strongest bases by mutagenesis, half matched on distance to TSS — rc-averaged, and takes the inclusion–exclusion residual `Δ_AB − Δ_A − Δ_B` as the measured interaction. Singles are recomputed in the same run so both terms share a convention, and they reproduce the shipped mutagenesis planes to **0.0**, which is a correctness check on the whole path rather than a formality.

Over **39,330** exact double substitutions across 23 loci, the released HVP panel's median correlation with that residual is **-0.0843** — range -0.3223 to 0.6826, positive at only 8 of 23 loci. Separation alone reaches **0.3227** and is positive at every locus; the summed magnitude of the two single effects does better still. Interactions are real but small, at a median residual of 0.051× a median single-base effect.

Status `Impl-Exact` for the measurement. The safe claim is that Shorkie's second derivative at the reference one-hot is not predictive of what two discrete substitutions do together in these windows. The HVP panel should be described as a local curvature map, which is what it computes; the periodogram over it remains a model diagnostic and the harmonic caveat already recorded still applies. This is a calibration and deliberately not a spacing scan — the separations are wherever the strong bases fall — so no periodicity claim can be read from it.

### The remaining two cards

The reference benchmark (`shorkieReferences.json`) and the model-conditioned motif null (`make_null_planes.py` → `matchedNull` in `shorkieModisco.json`) are released alongside these. Their results are summarised in the frontier document; the boundary that matters for this inventory is that the compact motif panel's original control shuffled only the saliency **projection** while reusing the real window's planes, so the model never ran on the null sequence. The matched arm recomputes contribution planes on shuffled **input**, and both arms then estimate the same model-conditioned quantity. The projection-only arm is retained and labelled, not deleted: it remains a real stress test of the reference-assignment step.

## Shared limitations and next checks

The common failure modes are target drift (3,053-track curves versus 384-track T0 attribution versus whole-window GI), conflating model faithfulness with biology, treating RC averaging as equivariance, and silently promoting 128-bp token or pooled stage views to base-level mechanism. Packed PNGs introduce quantisation; fp16 browser/CPU providers can differ slightly; old README counts and paper dimensions are not authoritative for the current checkpoint.

Before a stronger claim, the minimum checks are: lock the target and track subset; verify release assets against the f0 checkpoint; report forward and RC separately before averaging; repeat over folds, seeds, loci, and corruption draws; compare against composition, position, random, and simple motif baselines; use exact edit contrasts for faithfulness; and keep no-data and missing measured overlays explicit. For internal methods, add source-swap, retained/complement, and branch-specific interventions. For motifs, recompute null model outputs, assess cluster stability, and hold out loci. For LM, separate masked prediction from unmasked leakage and IC from function. No method reaches biological causality without an external perturbation.

## Implemented / prototype / planned matrix

| family | current status | safe claim |
| --- | --- | --- |
| Expression prediction, group/single-track curves, ISM, gradient×input, IG, occlusion | Implemented/released (`Impl-Exact` or `Impl-Approx`) | Exact or approximate behavior of the stated frozen model target. |
| Annotation enrichment, knockout, HVP epistasis, variants, kinetics, GIA, position, spacing, effective context, counterfactual, species sweep | Implemented/released, mostly `Impl-Approx` | Controlled model contrasts or descriptive alignment, not TF binding or biological causality. |
| Live stem, stage margins, attention rollout, LM masked/unmasked/infilling/IC, genome lanes | Implemented/released; attention is head-collapsed and legacy producer/schema labels remain | Exact stated computations at native resolution; attention and IC are descriptive, not causal/function. |
| Internal 2D relevance map | Implemented but approximate | Outer-product visualization of exact margins, not a true per-neuron spatial map. |
| Causal patching | Released/integrated but `Released-but-limited` | Provisional f0 forward one-band tracing; not fold/RC/path-specific causal mediation. |
| MoDISco-like motif pack | Both 11/15-bp cells released/integrated; the projection-only control is retained and labelled, and a model-conditioned matched null is released beside it | Custom exploratory clustering with a null that now perturbs the model's input; still no validated motif-discovery claim. |
| TopK SAE | Reconstruction, 64 feature summaries, and matched raw-channel grounding released/integrated | Reconstruction and correlational grounding evidence, not monosemantic or causal features. |
| Fold-uncertainty ledger over all eight checkpoints | Released (`Impl-Exact` effects, `Impl-Approx` interval) | A stated fraction of the strongest per-base effects is stable across the released training runs, against matched controls. Not biological reproducibility. |
| Exact-edit faithfulness benchmark and method scorecard | Released (`Impl-Exact`) | Which released attribution surfaces beat composition, position and random baselines on real deletion interventions — and which do not. |
| Reference-family benchmark for path attribution | Released (`Impl-Approx`, finite-step) | Whether the shipped Integrated Gradients baseline is carrying the result, with an out-of-distribution diagnostic that is measured rather than asserted. |
| Exact pairwise grammar benchmark | Released (`Impl-Exact`) | Whether the released second-order Hessian panel calibrates to discrete double substitutions. Not a spacing or periodicity claim. |
| Model-conditioned motif null | Released (`Impl-Approx`, gradient-based with an exhaustive bridge) | Real and null arms estimate the same quantity under two conditions. Still not a validated motif. |
| RC-paired SAE features, causal feature interventions, skip-aware path-specific tracing, circuit graphs, provenance, wet-lab tests | Planned | Frontier research directions; no current result should be presented as shipped evidence. |
