# Interpreting Shorkie and genomic sequence-to-function models

## Evidence, methods, and an experiment-ready research frontier

Status: research-team blueprint with a literature-search cutoff of 2026-09-04 and repository status re-audited on 2026-09-05. The released-code snapshot is `origin/main` at `4b04b3f0`; its GitHub Pages workflow completed successfully. The two-width motif grid and sparse-autoencoder grounding that were Local-WIP during the initial audit are committed in this snapshot and are classified below as released-but-limited, not as biological validation. This is a systematic scoping review and implementation plan, not a PRISMA-complete review and not a report of experiments that have not been run.

Shorkie's expression predictor is the primary scientific object throughout. Shorkie_LM is used only where it supplies a comparator, sequence prior, or provenance target. For a concise inventory of what the repository currently implements, what it approximates, and what remains prototype-only, see [Shorkie existing interpretability methods](./shorkie_existing_interpretability_methods.md).

## Executive synthesis and prioritized roadmap

The central mistake in sequence-model interpretability is to collapse four different questions into one picture. For Shorkie, these questions are: what the model predicts as a full tensor \(y(x)\) or an explicit scalar such as \(g_{T0}(x;a,b)\); what sequence edit changes that prediction; what recurring internal or sequence patterns the model uses across many examples; and what biological mechanism truly changes expression in yeast. Those questions are related, but they are not interchangeable. A gradient map is not a mutational assay. A motif cluster is not a transcription-factor binding claim. An attention edge is not a regulatory interaction. A successful sequence design is not yet an explanation. The literature is strongest when these distinctions are kept visible and weakest when they are blurred.

The most defensible frontier for Shorkie is therefore a ladder, not a gallery. At the bottom are fast local sensitivity methods such as corrected gradients, Integrated Gradients, and local probes. Above them sit exact model interventions such as single-base mutagenesis, window occlusion, motif insertion/deletion, and activation patching. Above those are cross-example synthesis methods that compress repeated local signals into motifs, grammars, sparse features, or circuit hypotheses. At the top are experimental perturbations that test whether a model-supported claim survives contact with the biological system. The roadmap should move upward in that order. It should not start from attractive internal stories and retrofit validation later.

Three consequences follow immediately.

First, every Shorkie explanation must name its estimand. For a sequence window \(x\), the system needs an explicit tensor or scalar target such as the full output tensor \(y(x)\), a displayed assay-group curve \(c_G(r;x)\), an own-gene T0 target \(g_{T0}(x;a,b)\), or the genome-wide whole-window target \(g^{\mathrm{whole}}_{T0}(x)\). Without that declaration, method comparisons are uninterpretable because different methods can be answering different questions about the same locus.

Second, implementation reality matters. The audited Shorkie site already contains a substantial suite of model-based analyses: exact full-model predictions, exhaustive single-base ISM for selected loci, gradient × input, 32-step Integrated Gradients, 64-bp occlusion, motif knockouts, motif spacing tests, global importance analysis, counterfactual editing, species-channel sweeps, effective-context perturbations, masked language-model information content, and genome-scale tracks. Some prior planning language wrongly framed several of these as future proposals. They are not future proposals; they are existing assets whose reliability, scope, and novelty boundaries now need to be stated correctly.

Third, the current attention-facing surfaces are the most scientifically fragile part of the stack. The released checkpoint has four attention heads per layer in the bottleneck, but the browser-facing attention pack averages heads before export. The main Shorkie page now visibly labels the resulting eight columns as layers and explains the loss of head resolution, although its section introduction, detail copy, canvas accessibility label, `make_heads.py`, and `shorkieHeads.json` field names retain legacy “head” wording. Its claim that layers “read” biologically named sequence classes is also stronger than the descriptive, circular-shift-controlled attention enrichment establishes. If a pack is missing or corrupted, the separate Attention Studio reports that attention data are unavailable and then renders synthetic diagonal matrices as a fallback. That studio’s receptive-field ladder includes a stale 15-bp stem claim even though the current model contract says the stem is 11 bp. Its “signal transmission” comparison curves are heuristic formulas, not measurements. Any frontier document that does not correct these points would overstate what the current artifacts establish.

Given those constraints, the priority order should be:

1. Freeze the target formalism, evidence ledger, and validation ladder. This is the cheapest high-leverage step because it prevents later comparisons from collapsing across incompatible targets.
2. Correct and relabel existing Shorkie methods, especially attention-, head-, and exactness-related claims. This converts current assets from potentially misleading visuals into auditable evidence.
3. Build the faithfulness backbone around exact model interventions: ISM, deletion/insertion tests, calibration against finite differences, and branch-aware activation patching.
4. Only then aggregate upward into motifs, grammars, sparse features, and circuits, with explicit uncertainty over folds, strands, baselines, and targets.
5. Treat cross-species tomography, dynamic circuit comparisons, provenance, and constrained design as higher-order programmes that depend on the earlier validation layers.
6. Reserve biological mechanism claims for the wet-lab ladder: MPRA or endogenous editing, ideally in yeast contexts matched to the model’s target conditions.

In one sentence: the frontier is strongest when Shorkie is presented as a released fungal sequence model with a rich but uneven interpretability surface, where exact model perturbation outranks local attribution, local attribution outranks attention visualisation, and all model-only claims stop short of causal biology until experimental perturbation confirms them.

## Scope, audience, terminology, scalar-target formalism, and ledgers

### Scope and audience

This fragment is written for three overlapping audiences: researchers who want a rigorous map of the interpretability literature relevant to regulatory sequence models; maintainers who need an audited description of what the current Shorkie implementation actually does; and future authors of the canonical frontier document who need stable terminology, evidence rules, and method boundaries. It is not a beginner’s introduction to deep learning or yeast regulation, and it is not a grant-style proposal catalogue. Its job is to establish the conceptual and evidentiary floor under later sections.

### Core terminology

The terms below are used in a deliberately narrow way.

- A target is the precise numerical object a method explains, for example a scalarized predicted expression value.
- An attribution is any local decomposition or sensitivity map tied to a declared target.
- A perturbation is an explicit model intervention at the input or internal-state level whose effect is read out on a declared target.
- A motif is a recurring sequence pattern discovered from local evidence; it is not automatically a bound factor.
- A grammar is a higher-order rule about motif composition, spacing, orientation, context, or interaction.
- A circuit is a sparse, causally tested subgraph of model computation for a declared behavior, not a biochemical network.
- A concept is a human-defined semantic variable evaluated against internal representations.
- A provenance claim concerns which training data contributed to a learned behavior; it is different from nearest-neighbor retrieval.
- Faithfulness means fidelity to a frozen model and declared target. It does not mean biological truth.
- Biological validation means an external perturbation or assay, not another model-derived visualization.

### Explicit target formalism

Shorkie is not a scalar-output model by default. The expression branch predicts a nonnegative coverage tensor over 896 interior bins and 5,215 tracks, while the language-model branch predicts base distributions over 16,384 positions. Any interpretability claim must therefore begin from an explicit scalarization.

For the expression model, let \(y_{b,t}(x)\) denote the predicted coverage at interior bin \(b\) and track \(t\) for sequence window \(x\). Let \(T_{\mathrm{RNA}}=\{1148,\dots,4200\}\), the contiguous 3,053-track TF-induction RNA block in released target-sheet order. Let \(T0=\{t\in T_{\mathrm{RNA}} : \text{track identifier contains } \_T0\_\}\), the 384-track noncontiguous subset used by the attribution-oriented scripts. Let \([a,b)\subseteq\{0,\dots,895\}\) be a focal bin interval such as a gene body or chosen peak interval. Then the recurrent locus score is

\[
g_{T0}(x;a,b)=\log_2\!\left(1+\sum_{r=a}^{b-1}\frac{1}{384}\sum_{t\in T0} y_{r,t}(x)\right).
\]

The displayed assay-group curve is a different estimand:

\[
c_G(r;x)=\frac{1}{|G|}\sum_{t\in G} y_{r,t}(x),
\]

where \(G\) is the displayed assay group; on the locus-page RNA view, \(G\) commonly equals \(T_{\mathrm{RNA}}\), not \(T0\). The genome-browser GI target is another distinct scalar:

\[
g^{\mathrm{whole}}_{T0}(x)=\log_2\!\left(1+\sum_{r=0}^{895}\frac{1}{384}\sum_{t\in T0} y_{r,t}(x)\right).
\]

These targets are not interchangeable. That matters in the audited implementation because the plotted expression curve, the locus attribution packs, and the genome-browser GI tracks do not all use the same scalar target.

For edit-based analyses, the natural object is a contrast:

\[
\Delta g_{T0}(x \rightarrow x';a,b)=g_{T0}(x';a,b)-g_{T0}(x;a,b).
\]

This is the relevant target family for locus ISM, locus gradient × input and IG, motif insertion/deletion around a focal gene, and counterfactual design. For the language-model branch, the main scalar objects are masked-token log-probability, entropy, or information content per position, each of which answers a different question. High masked information content is a predictability/constraint score, not a direct regulatory-importance measure.

This fragment therefore adopts five reporting rules:

1. Every method statement names its target family: scalar prediction, edit contrast, internal activation, distributional comparison, or external assay.
2. Every Shorkie implementation claim names the exact \(R\), \(T\), baseline/corruption, and strand rule when known.
3. Methods that explain different targets are compared only at the level of role and evidence, not as if they were numerically commensurate.
4. A visualization can be labeled “importance” only after the target and intervention semantics are explicit.
5. Biological claims are allowed only after the target has been tied to an external assay.

### Evidence ledger

The literature and implementation are mixed in maturity. A single ledger helps prevent category errors.

| Ledger code | Meaning |
| --- | --- |
| G-D | Demonstrated directly on genomic sequence-to-function or genomic sequence-language models. |
| B-D | Demonstrated on another biological-sequence setting, usually protein, but not yet on genomic S2F in the cited source. |
| X-D | Demonstrated outside genomics, usually language or vision; transfer to Shorkie requires new validation. |
| Impl-Exact | Implemented in the audited Shorkie stack with an exact stated model computation, modulo standard numerical precision. |
| Impl-Approx | Implemented in Shorkie with finite-step integration, quantisation, sampled shuffles, or another stated approximation. |
| Impl-Heuristic | Implemented as a simulation, illustrative fallback, or synthetic comparison rather than a model-derived result. |
| Repo-Release | Generator, generated artifact, and/or consuming site surface are committed in the audited `origin/main` snapshot. This is a software-release label, not a biological-validation label. |
| Local-WIP | Present only in uncommitted working-tree code or generated artifacts beyond the audited release; not a released method claim. |
| Hist | Historical assertion in docs/README that may be true for an earlier run but is not re-established by the current checkout alone. |
| S | A Shorkie-specific proposed transfer or synthesis with no empirical result claimed yet. |

### Validation ladder

The validation ladder should be stated before methods are introduced, because it determines how claims are worded.

| Level | What is established |
| --- | --- |
| V0 | Predictive utility on held-out model tasks. |
| V1 | Numerical correctness of an explanation or perturbation calculation. |
| V2 | Faithfulness to a frozen model under explicit interventions. |
| V3 | Robustness across strands, folds, baselines, and contexts. |
| V4 | Agreement with independent biological measurements such as occupancy, ASE/eQTL, or reporter assays. |
| V5 | Causal biological effect under endogenous or otherwise decisive perturbation. |

The frontier document should constantly distinguish these levels. Corrected gradients can reach V1 or V2. ISM and activation patching can reach V2 and sometimes V3. Motif discovery often starts at V2 and needs additional tests for V3 or V4. Attention visualisations typically remain below V2 unless linked to explicit perturbation controls. Wet-lab edits are the only route to V5.

## Audited Shorkie architecture and current implementation

### What the current audited model is

The audited Shorkie expression model is a checkpoint-derived hybrid convolutional/Transformer/U-Net architecture with a 16,384-bp input and 170 channels: four DNA channels, a fifth special/unused zero channel in the shipped inference paths, and 165 species channels. The browser default species index is 109, cited in the current constants as the released *S. cerevisiae* setting. The expression route uses a convolutional stem of width 11 bp and 96 channels, seven residual convolutional blocks with widths 96, 128, 160, 192, 256, 320, and 384, eight relative-attention Transformer layers at 128 positions with four heads and width 384, three additive decoder stages, a crop of 64 bins (1,024 bp) from each side of the 1,024-bin pre-crop output, and a Softplus head yielding an 896 × 5,215 tensor. The language-model route shares the encoder but decodes to 16,384 × 4 base probabilities. These facts come from the audited implementation and checkpoint port, not from a generic architecture description.

That distinction matters because some older prose in the repository and earlier planning documents mixes paper-level descriptions with checkpoint-level facts. The paper/checkpoint differences are not cosmetic. The paper describes eight heads, while the released checkpoint port uses four heads whose mean is exported for browser attention packs. The checkpoint-oriented constants and verification chain are therefore the correct source for statements about the shipped site, while the paper remains the right source for paper-specific claims and historical context.

### Implementation matrix: exact target, baseline, strand, resolution, and data route

The matrix below condenses the most decision-relevant audited facts.

| Method surface | Exact tensor or scalar | Baseline / control | Strand treatment | Native resolution | Data route | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Full expression tensor | \(y(x)\in\mathbb{R}_{\ge 0}^{896\times 5215}\), the cropped Softplus output over all tracks | None | Forward pass only in the shipped locus predictions | 896 bins × 5,215 tracks, 16 bp per bin | `make_predictions.py`, `public/models/shorkie-fp16.onnx`, `src/data/shorkiePredictions.json` | Impl-Exact |
| Displayed forward-pass assay-group curve | \(c_G(r;x)=|G|^{-1}\sum_{t\in G} y_{r,t}(x)\), where \(G\) is the displayed assay group; on the RNA view this is commonly \(T_{\mathrm{RNA}}=\{1148,\dots,4200\}\) | None | Forward only | 896 bins × 16 bp | `make_predictions.py`, `public/vp-data/<id>-tracks.png`, page-side display reduction | Impl-Exact |
| Genome-browser coverage families | One forward pass produces four assay-block means, the 384-track T0 mean, 12 additional timepoint means, 9 histone-mark means, and 25 selected ChIP-exo target means. The browser’s `sk-rnaseq` is T0, not the 3,053-track induction-block mean; `sk-induction` is a derived spread across 13 timepoint means | None; the induction-spread lane is a deterministic reduction rather than a model rerun | Forward only | 16-bp genome bins | `make_genome_shorkie.py --pass coverage`, `make_genome_tiles.py`, `public/genome-data` | Impl-Exact model predictions and reductions |
| Measured RNA overlay | External RNA coverage resampled into the displayed cropped-bin frame; not a model target | N/A | As stored in the external BigWig-processing path | 16-bp bins over cropped region | `make_truth.py`, `src/data/shorkieTruth.json` | Impl-Exact |
| Locus ISM | For each base position \(i\) and alternate base \(q\neq x_i\), the stored plane is the averaged per-strand logSED contrast on the focal gene body: \(\frac{1}{2}[\Delta g_{T0}(x\!\to\!x_{i\leftarrow q};a,b)+\Delta g_{T0}(rc(x)\!\to\!rc(x)_{i\leftarrow rc(q)};896-b,896-a)]\), with \(T0\) the 384-track noncontiguous subset inside 1148–4200 | Reference allele at each position; reference row is zero by construction | Forward and RC logSED computed separately, remapped, then averaged | 4 × 16,384 plane at 1-bp input resolution | `make_ism.py`, `public/vp-data/<id>-ism.png`, sidecar JSON | Impl-Exact |
| Locus gradient × input | Observed-base projection of the corrected input gradient of \(g_{T0}(x;a,b)\) for each anchor interval \([a,b)\), stored for annotated gene bodies and top predicted peaks | No separate baseline; local derivative at the reference input | Forward and RC gradients computed separately, remapped, then averaged | 16,384 bp for input attribution; internal margins additionally pooled to 128 display positions | `make_attribution.py`, `*-input.png`, `*-anchor.png`, `*-attr.json` | Impl-Exact |
| Internal relevance margins and displays | For each retained activation \(a_s\), exact forward-only marginals of \(|a_s\odot\partial g_{T0}/\partial a_s|\) are stored over channel and position. The stage stack sums and reshapes the released 18 × 128 positional margins; the 2D channel-by-position map reconstructs their interior as a normalized outer product | No counterfactual baseline; the older-pack stack fallback mixes per-channel relevance with real activation position | Forward internal state only | 5,760 concatenated channels and 18 stages × 128 pooled positions | `make_attribution.py`, `*-channels.png`, `*-positions.png`, `variantPlayground.ts` | Impl-Exact for both marginals and the current stage stack; Impl-Approx for the outer-product 2D map and legacy factorized fallback |
| Locus Integrated Gradients | 32-step path attribution to the same anchor target \(g_{T0}(x;a,b)\) | All-DNA-zero baseline with species channels retained | Forward and RC paths integrated separately, remapped, then averaged; completeness checked on the averaged target | 16,384 bp | `make_attribution.py`, `*-ig.png`, `*-attr.json` | Impl-Approx |
| Locus 64-bp occlusion map | For each 64-bp input window \(w\) and output bin \(r\), \(\log_2(\mathrm{cov}^{\mathrm{alt}}_{T0}(r)+1)-\log_2(\mathrm{cov}^{\mathrm{ref}}_{T0}(r)+1)\), where \(\mathrm{cov}_{T0}(r)\) is T0-mean coverage per bin | Zero the four DNA channels in one 64-bp window | Forward and RC bin profiles computed separately, reverse bins remapped, then averaged before logSED-per-bin comparison | 256 input windows × 896 output bins | `make_occlusion.py`, `public/vp-data/<id>-occl.png`, sidecar JSON | Impl-Exact |
| Genome-browser gradient × input | Input-level gradient × input of \(g^{\mathrm{whole}}_{T0}(x)=\log_2(1+\sum_{r=0}^{895}\frac{1}{384}\sum_{t\in T0} y_{r,t}(x))\), the T0 mean summed over the whole cropped interior | No separate baseline beyond the reference sequence | Forward and RC gradients computed separately, remapped, then averaged | 1 bp genome tiles | `make_genome_shorkie.py --pass gradient`, `public/genome-data` tiles | Impl-Exact |
| Genome-browser Integrated Gradients | 32-step midpoint path attribution to the same \(g^{\mathrm{whole}}_{T0}(x)\) | All four DNA channels zero with species channels retained | Forward and RC paths integrated separately, remapped, then averaged | 1-bp genome tiles | `make_genome_shorkie.py --pass ig`, dense `sk-ig` tiles | Impl-Approx |
| Genome-browser 64-bp occlusion | Mutant-minus-reference contrast on the same \(g^{\mathrm{whole}}_{T0}(x)\) after zeroing each 64-bp DNA block | Reference input versus one zero-DNA block | Forward and RC inputs use mirrored blocks; scalar effects are averaged | 64-bp genome tiles | `make_genome_shorkie.py --pass occlusion`, dense `sk-occl` tiles | Impl-Exact finite interventions; zeroing remains an OOD-prone ablation |
| GIA | Paired sufficiency scores per motif/background for both a local implant target \(g_{T0}(x;\mathrm{lo}_{\mathrm{implant}},\mathrm{hi}_{\mathrm{implant}})\) over ±512 bp and the whole-window target \(g^{\mathrm{whole}}_{T0}(x)\) | Same dinucleotide-shuffled background without implant; scramble arm is a composition-matched control | Forward motif, reverse-complement motif, and scramble scored as separate arms | Scalar scores summarized over backgrounds | `make_gia.py`, `src/data/shorkieGia.json` | Impl-Approx |
| Spacing grammar scan | Pairwise interaction on the same local implant target \(g_{T0}(x;\mathrm{lo}_{\mathrm{implant}},\mathrm{hi}_{\mathrm{implant}})\): \(F_{AB}-F_A-F_B+F_{\varnothing}\), with \(F_B\) recomputed at each spacing/orientation | Dinucleotide-shuffled background baseline plus matched single-motif controls at each spacing/orientation | Forward and reverse motif instances enumerated by orientation arm | Spacing/orientation grid | `make_spacing.py`, `src/data/shorkieSpacing.json` | Impl-Approx |
| Position scan | For motif and position \(p\) in a real window, \(g_{T0}(x_{\mathrm{motif}@p};a_{\mathrm{gene}},b_{\mathrm{gene}})-g_{T0}(x_{\mathrm{scramble}@p};a_{\mathrm{gene}},b_{\mathrm{gene}})\) on that window’s own gene | Same-span composition-matched scramble at the same position | Profiles aligned to transcription direction; `-` profiles reversed after TSS alignment | Position grid, default 64-bp step | `make_position.py`, `src/data/shorkiePosition.json` | Impl-Approx |
| Effective-context scan | Mean shuffled-flank score \(g_{T0}(x^{\mathrm{core}=r,\mathrm{flanks\,shuffled}};a_{\mathrm{gene}},b_{\mathrm{gene}})\) as a function of retained core radius \(r\) | Exact dinucleotide-preserving flank shuffles around a centered real core | Sequence direction respected through the focal gene’s own interval | Radius grid per locus | `make_receptive.py`, `src/data/shorkieReceptive.json` | Impl-Approx |
| Motif knockout sweeps | For each curated site, mean and SD over \(k\) shuffles of the site span, scored on the focal-gene T0 interval relative to the unedited sequence | Seeded Fisher–Yates shuffles of the site span, preserving composition and length | Each sequence is evaluated forward and as an RC input; RC output bins are reversed and per-bin T0 coverages are averaged before summing and log transformation | Site level | `make_knockout_sweep.py`, `public/vp-data/<id>-ko.json` | Impl-Approx |
| Counterfactual editing | Greedy, gradient-proposed and forward-verified ascent of \(g_{T0}(x;a_{\mathrm{gene}},b_{\mathrm{gene}})\) on each window’s own gene | Reference sequence; dinucleotide-shuffled control arm for the same ascent logic | Route-specific rescoring on chosen edits | Base level over selected mutable region | `make_counterfactual.py`, `src/data/shorkieCounterfactual.json` | Impl-Approx |
| Species sweep | \(g_{T0}(x;a,b)\) or related output comparisons under species-channel substitution with fixed DNA | Fixed DNA; all 165 species one-hot substitutions | Physical DNA unchanged | Scalar/profile summary | `make_species.py`, `src/data/shorkieSpecies.json` | Impl-Exact |
| LM masked information content | Per-position masked-token distribution, entropy, and information content from the LM branch | Seven-way iterative masking schedule on DNA channels | No RC averaging in the current implementation | 16,384 bp | `make_lm_packs.py`, `public/lm-data`, genome LM tiles | Impl-Exact |
| Attention rollout | Residual-aware token-mixing transform on exported attention matrices | None | Runs on whatever matrices are loaded; not an RC ensemble and not head-resolved in shipped assets | 8 layers × 128 × 128 token maps after head averaging | Attention export in `shorkie_torch.py`, browser packs | Impl-Exact only when the loaded pack is verified as model-derived; otherwise the surface is unavailable |
| Attention studio synthetic fallback | Synthetic diagonal-like token matrices used when attention packs fail to load | Heuristic fallback, not a model score | N/A | 8 layers × 128 × 128 token maps | `shorkieAttentionStudio.ts` fallback branch | Impl-Heuristic |
| TopK SAE reconstruction and correlational grounding | TopK reconstruction of 94,970 `attn_out8` vectors of width 384, expanded to 6,144 features with exactly \(k=32\) active; the release also summarizes the 64 highest-total-activation features with 6-mer signatures and annotation enrichment | A separately trained SAE on independently column-shuffled activations preserves channel marginals while destroying co-activation structure; a second control compares the 384 strongest SAE features with all 384 raw channels under the same annotation statistic and 64 shifts | One forward-coordinate, `f0` activation corpus; no paired RC training | One 384-vector per 128-bp bottleneck cell | `make_sae.py`, `src/data/shorkieSae.json`, Shorkie page | Impl-Approx; Repo-Release. FVU is 0.0194 versus 0.3733 for the shuffled control, and median best enrichment is 5.977× versus 4.715× for the matched raw-channel control; these are correlational results with feature selection and no causal feature clamp |
| Causal tracing / patching | Recovery ratio \((f_{\mathrm{restored}}-f_{\mathrm{corrupt}})/(f_{\mathrm{clean}}-f_{\mathrm{corrupt}})\) for forward-strand \(g_{T0}(x;a,b)\) after restoring one stage-band of clean activations into a promoter-shuffled corrupt run | One promoter dinucleotide shuffle per locus, seeded through Python `hash()`; “none”, “all first-stage”, and “all last-stage” controls | Forward only | 22 retained loci; 19 named stages × 32 bands of 512 bp | `make_patching.py`, `src/data/shorkiePatching.json`, Shorkie page, pack checks in `verify_pipeline.py` | Impl-Approx; Repo-Release. It is `f0`-only, has no repeated corruption/fold/RC uncertainty, and does not perform joint path-specific skip interventions |
| Compact TF-MoDISco-like motif panel | Custom greedy clustering over fixed-width blocks cut from precomputed real-sequence ISM planes; not canonical TF-MoDISco and not a model rerun | The “shuffled” arm reuses the original ISM planes and shuffles only the sequence used for reference-base selection/projection. It is a reference-assignment/composition stress test, not a matched model-conditioned attribution null | RC-aware block matching is attempted during clustering | Released pack reports a fixed 11/15-bp grid and publishes both cells | `make_modisco.py`, `src/data/shorkieModisco.json`, Shorkie page | Impl-Approx; Repo-Release for both widths. At 11 bp the real/control arms yield 3/2 clusters; at 15 bp they tie 3/3, with all reported clusters database-matched. The generator calls the grid pre-registered, but the repository does not provide an external preregistration record; neither width establishes task-conditioned or fold-stable motif discovery |

Three implementation facts should anchor the rest of the document. First, \(T0\) is a 384-track noncontiguous subset inside the contiguous RNA block 1148–4200, so “RNA target” and “T0 target” are not synonyms. Second, the displayed assay-group curve \(c_G(r;x)\), the locus target \(g_{T0}(x;a,b)\), and the genome-browser target \(g^{\mathrm{whole}}_{T0}(x)\) are distinct estimands and should never be described as one unified importance surface. Third, software release status and scientific validation are separate axes: patching, both compact-motif widths, and the expanded SAE summaries and controls are released in the audited snapshot, while all fold, strand, control, causal, and biological limitations remain exactly as stated above.

### Concise audited status matrix

| Axis | Audited current status |
| --- | --- |
| Target contract | Mixed across surfaces; must be made explicit per method. |
| Baseline discipline | Good for finite-difference methods; baseline sensitivity remains underreported for path methods. |
| Strand discipline | Stronger than casual reading suggests, because several methods explicitly average forward and RC after remapping; still not equivalent to native RC-equivariance. |
| Resolution discipline | Good when stated; most errors arise when 128-token attention views are verbally promoted to base- or motif-level claims. |
| Data-route transparency | Strong for released generator scripts and current constants; weaker where historical README language or legacy producer/schema labels disagree with the corrected consumer UI. |
| Release status discipline | Patching, both compact-motif width cells, and the expanded TopK SAE reconstruction/grounding analysis are repository releases. That label must not be confused with fold/RC robustness, matched-null validity, causal feature validation, or biological evidence. |
| Experimental grounding | Optional overlays and external comparisons exist, but no wet-lab validation is shipped in the repo. |

### Defects and corrections that the canonical document must state explicitly

The frontier document should not bury corrections in footnotes. The following are central and must be explicit.

| Topic | Correction |
| --- | --- |
| Attention heads | The released checkpoint uses four heads per Transformer layer in the bottleneck. Browser-facing attention packs average those heads before export. Therefore current browser views do not support head-specific biological claims. |
| `shorkieHeads.json` panel | The primary panel question and axes correctly label the eight head-averaged matrices as layers and explicitly disclaim per-head interpretation. However, the section introduction, a detail sentence (“no head can exceed”), the canvas accessibility label, the generator docstring, and JSON keys such as `heads`/`byHead` retain legacy head wording. The accompanying statement that layers “read” regulatory DNA or tRNA overstates descriptive enrichment against circularly shifted annotations. The page also says per-head specialization could be answered by “a live run,” but `build_onnx.py` averages heads before export and the current browser runtime consumes that collapsed output. A newly instrumented raw-head checkpoint run or export—not the existing browser live path—is required. These labels and claims should be narrowed; the released data remain layer-level, correlational token-mixing summaries and cannot support per-head specialization or biological-reading claims. |
| Viewport renderer and target copy | **Corrected.** Only the three per-base ISM, gradient × input, and Integrated Gradients lanes become DNA-logo renderings at high zoom; 64-bp occlusion and 128-bp rollout correctly remain bands. The accessibility label now names all five lanes and says which two stay bands and why. The “every panel below” sentence now names the region-conditioned panels explicitly and states that mutagenesis is *not* among them, keeping its own focal-gene target. |
| Knockout strand label | **Corrected.** `make_knockout_sweep.py` and its `*-ko.json` payload evaluate forward and RC inputs, reverse the RC output bins, average per-bin T0 coverage, and then form the focal-gene score; the page’s two cost sentences now say two forward passes per shuffle and rc-averaged, and no longer claim the sweep is incomparable with the rest of the page. |
| Synthetic fallback | **Marked, not removed.** If attention metadata or PNGs fail to load, the studio still installs synthetic diagonal matrices and continues — those views are unavailable-as-data, not weak evidence — but the fallback now sets a `syntheticAttention` flag and a `data-studio-synthetic` attribute and stamps both canvases with a visible “not model data” watermark, so a screenshot can no longer be mistaken for a loaded pack. |
| Stem size | **Corrected, and it was worse than the stem.** The ladder was wrong in three columns: an 11-bp stem recorded as 15, seeding the whole `rf' = 2·rf + 5` recurrence, plus `resolution` and `channels` each shifted one stage (`block1` described as 8,192 positions of 128 channels when the recorded activation is 16,384 of 96). Re-derived from the checkpoint’s own kernels as 11 / 15 / 24 / 42 / 78 / 150 / 294 / 582 bp and cross-checked by single-base perturbation. Its unit test previously restated the wrong numbers and so confirmed the defect; it now recomputes them from the kernel sizes. |
| Signal-transmission curves | **Labelled.** The Transformer/CNN/SSM comparison curves remain heuristic illustrations, not model- or benchmark-derived measurements, and the function that produces them now says so in its docstring. It had also inherited the stale 2,555-bp constant as a threshold; that is now Shorkie’s real 582-bp widest convolutional reach. |
| Channel 4 / fifth channel | The fifth non-DNA channel is not established in the audited inference paths as a biologically interpreted mask channel. Safe wording is “special/unused zero channel in shipped inference,” not “known mask channel.” |
| Mixed targets | The locus prediction curve, attribution packs, and genome-browser gradient tracks do not all explain the same scalar. Any unified importance language must be replaced by explicit target declarations. |
| Causal tracing release status | `make_patching.py`, `src/data/shorkiePatching.json`, the consuming page, and pack-level invariant checks are committed in the audited release. The computation is nevertheless limited to a forward-strand, `f0`-only, 22-locus, single-band analysis using one promoter shuffle per locus with Python `hash()` seeding and no fold/seed uncertainty. It does not jointly isolate U-Net skip paths and cannot support a robust or biological-mechanism claim yet. |
| TF-MoDISco-like release status | `make_modisco.py`, `src/data/shorkieModisco.json`, and both 11/15-bp cells of the compact motif panel are committed. The released script is a custom greedy-correlation approximation over existing ISM planes, not canonical TF-MoDISco. Its “shuffled” arm does not rerun the model or recompute ISM/contribution scores on shuffled inputs; it reuses the original ISM planes and shuffles only the sequence used for reference-base selection/projection, so it is not a matched model-conditioned null. The page’s “essentially impossible under the shuffled null” interpretation overstates what exceeding an empirical 99.9th percentile of this finite, invalid-for-inference stress-test arm establishes. The reproduction comment also says `--width`, while the CLI accepts `--widths`. |
| Sparse-autoencoder release status | The audited release includes an `attn_out8` TopK-32 SAE and reconstruction-versus-column-shuffled-activation control over 94,970 bottleneck vectors, plus feature annotations, 6-mer summaries, circular-shift enrichment, and a matched raw-channel comparison. Only the 64 greatest-total-activation features receive the detailed annotation summaries; a separate matched analysis scores the strongest 384 SAE candidates against all 384 raw channels. Current page/generator prose saying all 6,144 features were annotation-scored is false. Neither the reconstruction analysis nor the grounding analysis is RC-paired, fold-replicated, or causally validated by feature clamping. |
| Paper versus checkpoint | For shipped-artifact claims, the checkpoint/port audit outranks paper-level architecture summaries whenever they differ. |
| Already-implemented methods | GIA, motif spacing, effective-context perturbation, species sweeps, counterfactual editing, and multiple local attribution methods are already implemented and must not be presented as if they were new proposal cards. |
| Unsupported Borzoi SAE claim | No verified primary source in the reviewed set demonstrates an SAE on Borzoi. The canonical document must not claim one. |
| Integrated Hessians record | Correct record: Janizek, Sturmfels, and Lee, “Explaining Explanations: Axiomatic Feature Interactions for Deep Networks,” *JMLR* 2021, https://www.jmlr.org/papers/v22/20-1223.html. |
| GIA record | Correct record: Koo et al. 2021, *PLOS Computational Biology*, DOI https://doi.org/10.1371/journal.pcbi.1008925. |
| BPNet record | Correct record: Avsec et al. 2021, *Nature Genetics*, DOI https://doi.org/10.1038/s41588-021-00782-6. |
| SQUID record | Correct record: Seitz et al. 2024, *Nature Machine Intelligence*, DOI https://doi.org/10.1038/s42256-024-00851-5. |
| CREME record | Correct record: Toneyan and Koo 2024, *Nature Genetics*, DOI https://doi.org/10.1038/s41588-024-01923-3. |
| Gosai record | Correct record: Gosai et al. 2024, *Nature*, DOI https://doi.org/10.1038/s41586-024-08070-z. |

These corrections are not merely bibliographic housekeeping. They determine what novelty can be claimed, what claims are current-state descriptions versus proposals, and which surfaces in the existing Shorkie site are trustworthy enough to anchor later research directions.

### How implementation claims should be written in the canonical document

The canonical frontier should treat implementation status as part of the scientific content, not as a repository footnote. In practice that means each Shorkie-facing method description should answer four questions in one compact sentence or table row: what exact computation is being performed; whether the computation is exact, approximate, heuristic, historical, or local-only; whether the result is part of the released repository snapshot or only the mutable working tree; and what stronger check would be needed before the result can support a more ambitious claim.

For example, “Shorkie computes Integrated Gradients” is too weak to be useful. A better statement is: “The released site ships 32-step Integrated Gradients for the anchor score \(g_{T0}(x;a,b)\), using an all-DNA-zero baseline with species retained and forward/RC averaging after remapping; this is an approximate path integral whose numerical completeness is reported, but whose baseline validity remains a separate scientific question.” That wording is longer, but it prevents three common errors at once: forgetting the target, forgetting the baseline, and overstating what completeness establishes.

The same discipline is even more important for internal methods. “Shorkie has causal tracing” is now true as a software-release statement but still too vague as a scientific statement: the released artifact is one `f0`, forward-only, single-corruption, band-restoration analysis. Likewise, “Shorkie has motif discovery” must name a compact custom clustering panel whose control is not a freshly recomputed model-conditioned null. The audited matrix fixes those exact scopes; later sections should cite them rather than silently upgrading a released panel into validated mechanism.

The broader rule is simple: every implementation claim should carry its own confidence label. Released assets can still be approximate. Local-only assets can still be scientifically interesting. Historical README claims can still be valuable context. But the document should never force the reader to infer which category they are looking at. The safest default is to assume that any method belongs to the weakest category consistent with audited evidence until a stronger category is explicitly justified.

## Systematic scoping-review protocol

This frontier document should present itself as a systematic scoping review rather than a fully PRISMA-complete systematic review. The goal is breadth with explicit evidence filtering, not an exhaustive clinical-review workflow.

### Review question

The governing question is: which interpretability, causal-intervention, uncertainty, and validation methods are sufficiently established to inform a rigorous frontier for Shorkie, a released fungal sequence-to-function and sequence-language model with a hybrid convolutional/Transformer/U-Net architecture and a nontrivial existing interpretability implementation?

### Search universe

The source universe should include only primary research papers, peer-reviewed proceedings, official preprints where no archival version exists, and first-party implementation records when implementation details are essential to factual claims. Reviews may be used for discovery but not counted as evidence. Official implementations may support status or reproducibility claims but should not substitute for missing primary evidence.

### Databases and venues

The scoping protocol should search across:

- PubMed and Google Scholar for biology- and genomics-facing papers.
- Crossref or DOI resolution for bibliographic verification.
- arXiv and bioRxiv for recent preprints clearly marked as such.
- PMLR, NeurIPS, ICML, ICLR, ACL Anthology, JMLR, Nature-family journals, Genome Biology, Nature Genetics, Nature Methods, PLOS Computational Biology, Nucleic Acids Research, and Bioinformatics for archival records.
- Official code repositories or project pages only when implementation status or first-party method details are necessary.

### Query families

Searches should be organized by query family rather than by a single long Boolean string. At minimum:

1. Genomic attribution: “genomics attribution deep learning gradient integrated gradients DeepLIFT TF-MoDISco ISM BPNet ChromBPNet GIA”.
2. Grammar and perturbation: “regulatory sequence motif spacing interaction genomic deep learning CREME SQUID MAVE-NN global importance”.
3. Mechanistic internals: “activation patching causal tracing circuit discovery attribution graph sparse autoencoder genomics DNA model”.
4. Uncertainty and evaluation: “genomic model attribution stability uncertainty calibration ensemble benchmark saliency faithfulness”.
5. Counterfactual and design: “genomic sequence design Ledidi Fast SeqProp enhancer design diffusion regulatory DNA”.
6. Biological validation: “yeast MPRA saturation mutagenesis cis-regulatory variants endogenous editing promoter assay”.
7. Cross-species or species-aware models: “species-aware DNA language model regulatory evolution cross-species expression model”.

Each family should be searched with author anchors for likely seminal methods once initial hits appear. For example, BPNet should trigger Avsec; GIA should trigger Koo; TF-MoDISco should trigger Shrikumar; Integrated Hessians should trigger Janizek/Sturmfels/Lee; SQUID should trigger Seitz; CREME should trigger Toneyan/Koo.

### Cutoff and update policy

The literature cutoff for this fragment is 2026-09-04. Because some records near the cutoff may have preprint and later archival versions, the canonical document should distinguish search cutoff from public-release verification. Immediately before publication, every 2024–2026 citation should be rechecked for title, venue, year, DOI, and publication status.

### Inclusion rules

A record is included if it satisfies at least one of the following:

- It introduces or materially evaluates a method directly relevant to interpreting sequence models or their outputs.
- It provides a primary empirical demonstration in genomics, regulatory DNA, protein sequence, or another transferable biological-sequence domain.
- It is a foundational mechanistic-interpretability or XAI method whose transfer to Shorkie is plausible and scientifically relevant, even if the original domain is language or vision.
- It is a primary validation or benchmark paper that constrains how Shorkie claims should be tested.
- It is an audited first-party implementation source necessary to describe current Shorkie behavior.

### Exclusion rules

A record is excluded if:

- It is a review, tutorial, blog post, or documentation page without primary evidence.
- It duplicates an included paper through a later minor revision without substantive changes.
- It concerns explainability only in a domain whose assumptions do not transfer in any meaningful way to sequence models.
- Its bibliographic identity cannot be verified with enough confidence to avoid inventing metadata.
- It is a methods paper whose only relevance is superficial name overlap rather than a genuine transferable mechanism.

### Deduplication and evidence labeling

Deduplication should occur at the level of the scientific contribution, not the URL. Preprint and archival versions of the same paper should count once, with the stronger or more stable record preferred in the main citation and the status caveat noted where necessary. Every included record should receive both a domain-transfer label (G-D, B-D, X-D) and a publication-status note if relevant. Shorkie implementation sources should receive computation and release labels separately (Impl-Exact, Impl-Approx, Impl-Heuristic, Repo-Release, Local-WIP, Hist).

### Extraction fields

For each included source, extract:

- method family;
- scientific question answered;
- target object or estimand;
- intervention or attribution semantics;
- evidence domain;
- main strengths;
- known failure modes;
- computational scaling constraints;
- validation standard used in the source;
- Shorkie-transfer relevance;
- explicit novelty boundary, if the method overlaps existing Shorkie functionality.

These fields are what make the later taxonomy usable rather than bibliographically dense.

### Screening and synthesis workflow

The review workflow should proceed in four passes.

In the first pass, collect candidate records broadly by method family and by Shorkie-relevant problem framing rather than by citation prestige alone. This is where scoping-review breadth matters most. The goal is to avoid a frontier that knows the canonical gradient papers but misses adjacent literatures such as uncertainty, surrogate landscapes, causal internals, or yeast-specific validation resources.

In the second pass, verify identity and status. This is the stage where stale references are caught: wrong DOI, wrong venue, a preprint later replaced by an archival version, or a method repeatedly cited in secondary summaries with slightly drifting metadata. The known Integrated Hessians, GIA, BPNet, SQUID, CREME, and Gosai fixes illustrate why this pass matters. A frontier document becomes fragile when it inherits bibliographic drift from informal notes.

In the third pass, extract methodological substance. The review should ask, for each paper: what is the estimand; what is the intervention or explanation object; what evidence domain is actually demonstrated; what failure modes are acknowledged or exposed by later benchmarks; and what part of the method transfers cleanly to a Shorkie-like architecture. This is where many superficially similar methods separate. A gradient method and a finite-difference method can both yield a per-base map, but they are not equivalent because one is a local derivative and the other is an actual edit contrast.

In the fourth pass, synthesize by claim level rather than publication chronology. The right organizing principle for the frontier is not “classic saliency, then newer methods, then latest preprints.” It is “what question does this method answer, under what assumptions, and how high can it climb on the validation ladder?” That synthesis strategy is what lets the document compare cross-domain mechanistic methods and genomics-native perturbation methods without flattening them into a single leaderboard.

### Evidence-handling rules for edge cases

Some source classes need explicit treatment.

Preprints should not be excluded automatically, because several of the most relevant adjacent methods and some of the most current genomics work exist first as preprints. But they should not be allowed to launder novelty or reliability claims either. The document should mark them clearly and avoid phrasing that implies peer-reviewed closure.

First-party technical reports are similar. In mechanistic interpretability they can be highly influential and methodologically detailed, but they sit on a different evidentiary footing from peer-reviewed genomics papers. Their best use in this frontier is to define transferable algorithms, controls, and failure modes, not to imply that the transfer has already been demonstrated in regulatory genomics.

Implementation repositories should be used sparingly and only for facts that genuinely live in code: export shapes, route semantics, release status, or prototype presence/absence. Repositories should not be cited as scientific validation when a primary paper is missing. The main exception is when the implementation status itself is the point, as in the current Shorkie audit.

### Limitations

This is not PRISMA-complete. It does not claim exhaustive recall over all adjacent literatures, especially very recent preprints and workshop papers. Publication status and indexing lag near the cutoff date can create ambiguity. Mechanistic-interpretability fields evolve quickly and often mix peer-reviewed work with influential first-party technical reports. Genomics explainability papers can also blur model-faithfulness claims with biological claims. The protocol mitigates these issues through explicit evidence labels, conservative novelty language, and a preference for primary over secondary evidence, but it does not eliminate them.

## Method-complete taxonomy

### 1. Intrinsic architectures

Intrinsic interpretability methods try to make the model itself easier to inspect. In genomics this includes early motif-learning CNNs such as DeepBind, Basset, DeepSEA, and DanQ; profile/count-decomposed architectures such as BPNet; assay-bias factorized models such as ChromBPNet; and more deliberately legible unit-based models such as ExplaiNN (Alipanahi et al. 2015, https://doi.org/10.1038/nbt.3300; Kelley et al. 2016, https://doi.org/10.1101/gr.200535.115; Zhou and Troyanskaya 2015, https://doi.org/10.1038/nmeth.3547; Avsec et al. 2021, https://doi.org/10.1038/s41588-021-00782-6; Pampari et al. 2025 preprint, https://doi.org/10.1101/2024.12.25.630221; ChromBPNet implementation, https://github.com/kundajelab/ChromBPNet; Novakovsky et al. 2023, https://doi.org/10.1186/s13059-023-02985-y).

Their strength is that they reduce the gap between what is predictive and what is inspectable. Their weakness is that legibility can narrow the hypothesis class or merely move the explanation burden upstream. For Shorkie, intrinsic alternatives are best treated as mechanistic baselines and controls, not automatic replacements for the released oracle. A simpler model that agrees with Shorkie on some loci can be explanatory leverage; a simpler model that performs differently is a different object.

### 2. Gradients and path methods

This family includes raw saliency, corrected gradients on the one-hot simplex, gradient × input, SmoothGrad, Integrated Gradients, DeepLIFT, Expected Gradients, SHAP-style approximations, and Integrated Hessians for pairwise interactions (Simonyan et al. 2013, https://doi.org/10.48550/arXiv.1312.6034; Sundararajan et al. 2017, https://proceedings.mlr.press/v70/sundararajan17a.html; Shrikumar et al. 2017, https://proceedings.mlr.press/v70/shrikumar17a.html; Erion et al. 2021, https://doi.org/10.1038/s42256-021-00343-w; Majdandžić et al. 2023, https://doi.org/10.1186/s13059-023-02956-3; Janizek et al. 2021, https://www.jmlr.org/papers/v22/20-1223.html).

The key Shorkie lesson is that gradients must respect sequence geometry and target semantics. Correcting the shared off-simplex gradient component is a mathematical hygiene step, not a biological validation. Path methods gain completeness-style properties but remain baseline-dependent and can traverse off-manifold sequence states. Integrated Hessians is valuable as a principled interaction attribution, but in this frontier it should be described as a pairwise, numerically expensive, local second-order method rather than a direct substitute for exact combinatorial mutagenesis.

### 3. Perturbation, occlusion, and ISM

Perturbation methods evaluate actual model contrasts under explicit input changes: exhaustive single-base ISM, masked or shuffled window occlusion, motif insertion or deletion, and structured perturbation families such as CREME and tangermeme (Zeiler and Fergus 2014, https://doi.org/10.1007/978-3-319-10590-1_53; Nair et al. 2022, https://doi.org/10.1093/bioinformatics/btac135; Nair et al. 2022, https://doi.org/10.1093/bioinformatics/btac385; Toneyan and Koo 2024, https://doi.org/10.1038/s41588-024-01923-3; Schreiber 2025 preprint, https://doi.org/10.1101/2025.08.08.669296).

These methods are computationally expensive but scientifically central because they test finite differences on valid categorical edits. They reach a higher rung of the validation ladder than gradients alone. Their main failure mode is distribution shift under unrealistic masks, deletions, or shuffled contexts. Shorkie already implements several members of this family, so the frontier should frame new work here as extension, validation, or systematization rather than invention.

### 4. Motif discovery and local surrogates

TF-MoDISco aggregates repeated local attribution evidence into recurring patterns. MAVE-NN is the surrogate genotype–phenotype framework, and SQUID is a local surrogate workflow that generates an in-silico library around a locus and fits interpretable surrogate models of the MAVE-NN type to that local landscape (Shrikumar et al. 2018, https://doi.org/10.48550/arXiv.1811.00416; Tareen et al. 2022, https://doi.org/10.1186/s13059-022-02661-7; Seitz et al. 2024, https://doi.org/10.1038/s42256-024-00851-5).

This family is attractive because it compresses many local calculations into reusable motifs or coefficient tables. But compression is not faithfulness by default. TF-MoDISco inherits whatever biases the input attribution maps contain. SQUID inherits the locality and sampling choices of its in-silico library and the expressivity limits of the fitted surrogate. The correct Shorkie use is to make these methods conditional on explicit targets such as \(g_{T0}(x;a,b)\), folds, and track sets, then verify discovered motifs or coefficients with exact perturbations. The released `make_modisco.py` panel should be described as a compact custom approximation, not evidence that canonical, task-conditioned TF-MoDISco is deployed; see the audited release and control status above.

### 5. Grammar and interaction analysis

Grammar methods ask how features combine: orientation, spacing, copy number, context, higher-order epistasis, and interaction nonadditivity. GIA is the cleanest general framework because it defines an expected contrast over a background distribution (Koo et al. 2021, https://doi.org/10.1371/journal.pcbi.1008925). BPNet’s motif-syntax analyses, CREME’s necessity/sufficiency perturbations, Deep Feature Interaction Maps, and exact finite-difference interaction panels all sit here (Avsec et al. 2021, https://doi.org/10.1038/s41588-021-00782-6; Greenside et al. 2018, https://doi.org/10.1093/bioinformatics/bty575; Toneyan and Koo 2024, https://doi.org/10.1038/s41588-024-01923-3).

For Shorkie this family is unusually mature because motif spacing, GIA, second-order HVP-style interaction analysis, and motif knockout/sweep tooling already exist. The frontier should therefore emphasise exactness, background choice, uncertainty, and higher-order calibration instead of implying that interaction analysis begins from zero.

### 6. Counterfactual editing and design

Counterfactual methods search sequence space for edits or synthetic designs that move a chosen target: Ledidi, Fast SeqProp, deep exploration networks, enhancer design systems, and diffusion-based regulatory design are the key references (Schreiber et al. 2020, https://doi.org/10.1101/2020.05.21.109686; Linder and Seelig 2021, https://doi.org/10.1186/s12859-021-04437-5; Linder et al. 2020, https://doi.org/10.1016/j.cels.2020.05.007; Gosai et al. 2024, https://doi.org/10.1038/s41586-024-08070-z).

The interpretive danger is obvious: a successful design can exploit oracle blind spots, off-manifold regions, or hidden shortcuts. Therefore sequence design belongs late in the roadmap. Its outputs are best regarded as model proposals constrained by ensembles, RC consistency, likelihood or plausibility guards, edit budgets, and eventually wet-lab screening.

### 7. Concepts and prototypes

TCAV, ACE, concept bottleneck models, post-hoc concept bottlenecks, self-explaining architectures, completeness-aware concept methods, and prototype networks let researchers ask whether internal states align with named concepts or example prototypes (Kim et al. 2018, https://proceedings.mlr.press/v80/kim18d.html; Ghorbani et al. 2019, https://doi.org/10.48550/arXiv.1902.03129; Koh et al. 2020, https://proceedings.mlr.press/v119/koh20a.html; Yuksekgonul et al. 2023, https://doi.org/10.48550/arXiv.2205.15480; Alvarez-Melis and Jaakkola 2018, https://doi.org/10.48550/arXiv.1806.07538; Yeh et al. 2020, https://doi.org/10.48550/arXiv.1910.07969; Chen et al. 2019, https://doi.org/10.48550/arXiv.1806.10574).

These methods are mostly X-D rather than G-D in the reviewed set, but they remain relevant because yeast regulation offers many plausible concept vocabularies: TF motifs, promoter classes, TATA architecture, nucleosome-disfavoring tracts, gene-direction features, and condition-specific track groups. Their main scientific limit is that decodability is not use. For Shorkie they should annotate and test representations or sparse features, not stand alone as mechanistic evidence.

### 8. Causal internals, circuits, and sparse autoencoders

This family includes activation patching, causal tracing, causal abstraction, attribution patching, edge-attribution and circuit-discovery methods, transcoders, and sparse autoencoders. The strongest direct genomic precedents are currently limited, while many of the best-developed methods come from language-model mechanistic interpretability (Geiger et al. 2022, https://proceedings.mlr.press/v162/geiger22a.html; Meng et al. 2022, https://doi.org/10.48550/arXiv.2202.05262; Conmy et al. 2023, https://openreview.net/forum?id=89ia77nZ8u; Syed et al. 2023, https://doi.org/10.48550/arXiv.2310.10348; Gao et al. 2024, https://doi.org/10.48550/arXiv.2406.04093; Brixi et al. 2025, https://doi.org/10.1101/2025.02.18.638918).

For Shorkie, these transfers are scientifically promising but status-sensitive. The model’s additive decoder skips mean that bottleneck-only stories are inadequate. Any internal intervention must be branch-aware and strand-aware. Sparse autoencoders and dictionary methods are plausible because genomic and protein demonstrations now exist, and Shorkie now ships an `attn_out8` TopK reconstruction baseline plus 64 feature summaries and a matched correlational comparison against raw channels. But the reviewed set does not support claims about Borzoi SAE work, and the Shorkie analysis is neither RC-paired nor causally validated. The exact scope of released band patching and SAE grounding is fixed in the audited matrix above and should not be silently upgraded.

### 9. Data attribution and provenance

Influence functions, TracIn, datamodels, TRAK, and related training-data attribution methods ask which training records matter for a behavior (Koh and Liang 2017, https://proceedings.mlr.press/v70/koh17a.html; Pruthi et al. 2020, https://doi.org/10.48550/arXiv.2002.08484; Ilyas et al. 2022, https://proceedings.mlr.press/v162/ilyas22a.html; Park et al. 2023, https://proceedings.mlr.press/v202/park23c.html).

This family is high-risk for overclaiming. Gradient similarity is not provenance. Nearest-neighbor sequence retrieval is not influence. Exact leave-one-group-out retraining is the gold standard but usually expensive. For Shorkie, provenance should be discussed only conditionally on training-artifact availability. Without manifests, checkpoints, and reproducible training state, provenance remains a future direction rather than current evidence.

### 10. Uncertainty and calibration

Prediction uncertainty, explanation uncertainty, and domain shift must be separated. Deep ensembles, MC dropout, conformal intervals, calibration diagnostics, attribution-consistency work, and genomic benchmark studies belong here (Lakshminarayanan et al. 2017, https://papers.neurips.cc/paper/7219-simple-and-scalable-predictive-uncertainty-estimation-using-deep-ensembles; Romano et al. 2019, https://doi.org/10.48550/arXiv.1905.03222; Ovadia et al. 2019, https://papers.neurips.cc/paper/9547-can-you-trust-your-models-uncertainty-evaluating-predictive-uncertainty-under-dataset-shift; Majdandžić et al. 2022, https://proceedings.mlr.press/v200/majdandzic22a.html; Reynolds and Pan 2025, https://doi.org/10.1371/journal.pcbi.1013784).

This family is foundational because every other method needs an uncertainty ledger over folds, strands, baselines, and contexts. In Shorkie, RC disagreement should be reported as a model behavior fact, not silently collapsed into an error bar. Conformal intervals are useful only when the exchangeability regime is justified for the calibration and deployment settings; naive nominal coverage on one split does not imply coverage will survive cross-species or cross-clade shift.

### 11. Cross-model and cross-representation comparison

Representation-similarity methods such as SVCCA, PWCCA, CKA, and related alignment tools ask whether folds, tasks, branches, or species-conditioned states are similar (Raghu et al. 2017, https://doi.org/10.48550/arXiv.1706.05806; Kornblith et al. 2019, https://proceedings.mlr.press/v97/kornblith19a.html). These methods are descriptive, not causal. Their value in the Shorkie frontier is to compare branches, folds, species conditions, or sparse-feature dictionaries and then tie those similarities back to actual interventions. Similarity without perturbation is not mechanism.

### 12. Biological validation

Biological validation methods include saturation mutagenesis, MPRA, endogenous editing, occupancy assays, ASE/eQTL comparisons, and mechanistic perturbations. Yeast is especially rich here because random-promoter assays, natural promoter-variant MPRAs, and cis-regulatory variant maps provide unusually relevant external anchors (de Boer et al. 2020, https://doi.org/10.1038/s41587-019-0315-8; Renganaath et al. 2020, https://doi.org/10.7554/eLife.62669; Kita et al. 2017, https://doi.org/10.1073/pnas.1717421114).

This category is not “downstream validation” in a disposable sense. It is the only route from model explanation to biological mechanism. The frontier should therefore be explicit: model-faithful claims are valuable, but they remain claims about Shorkie until an assay changes the evidentiary level.

## Cross-method decision matrix

The matrix below is intended as a working map for later sections.

| Question | Best first-line methods | Typical evidence status | Main strength | Main failure mode | Minimum stronger check |
| --- | --- | --- | --- | --- | --- |
| Which bases locally affect \(g_{T0}(x;a,b)\)? | Corrected gradients, gradient × input, IG | G-D; Shorkie Impl-Exact/Approx | Fast, high-resolution local screen | Baseline dependence, saturation, target ambiguity | Exact ISM or matched deletion/insertion |
| What finite sequence edits change the model output? | Single-base ISM, motif edits, occlusion | G-D; Shorkie Impl-Exact/Approx | Explicit model intervention | OOD masking or context destruction | Replication across contexts, folds, and strands |
| Which recurring patterns matter across loci for \(g_{T0}(x;a,b)\)? | TF-MoDISco, motif enrichment, natural-example aggregation | G-D; Shorkie has a released custom compact approximation, not canonical task-conditioned TF-MoDISco | Compresses repeated local signals into motifs | Inherits attribution artifacts; current shuffled arm is not a recomputed model-conditioned null; motif naming overreach | Exact insertion/deletion or GIA over matched backgrounds |
| Does the model encode spacing, orientation, or higher-order grammar? | GIA, spacing sweeps, exact interaction panels, CREME | G-D; Shorkie partially implemented | Tests explicit hypotheses | Background dependence; combinatorial cost | Held-out contexts and biological perturbation |
| What minimal sequence changes achieve a target? | Ledidi, Fast SeqProp, constrained search | G-D | Produces actionable model proposals | Oracle exploitation, off-manifold edits | Ensemble, RC, plausibility, and assay gates |
| Do internal states carry a named concept? | Probes, TCAV, concept methods | Mostly X-D/B-D, some transferable | Interpretable semantic testing | Decodability mistaken for use | Erasure or exact activation intervention |
| Which internal routes mediate a contrast? | Activation patching, causal tracing, edge/path patching | Mostly X-D; Shorkie ships limited single-band patching, while joint path-specific tracing remains S-level | Direct model-level mediation test | Off-manifold patches; skip-route confounding; single corruption and strand | Necessity/sufficiency and branch-aware exact controls |
| Can dense states be decomposed into reusable sparse features? | SAEs, dictionary learning | B-D/X-D plus emerging genomic G-D; Shorkie ships reconstruction, feature summaries, and matched correlational grounding | Potentially reusable feature basis | Feature splitting, selection effects, reconstruction or enrichment without causality, false monosemanticity | Original-model causal tests and cross-fold/RC stability |
| Which training records supported a behavior? | TRAK, TracIn, influence, datamodels | X-D with limited genomic transfer | Opens provenance questions | Approximation fragility, missing artifacts | Group retraining or removal tests |
| Are explanations stable and calibrated? | Ensembles, attribution-consistency metrics, conformal or calibration tools | G-D/X-D | Makes uncertainty explicit | Confusing stability with correctness; unjustified exchangeability under shift | Exact intervention benchmark and subgroup reporting |
| Are folds, branches, or species-conditioned states similar? | CKA, PWCCA, SVCCA | X-D with transferable use | Compact comparison across models or branches | Similarity without causal meaning | Alignment-transfer intervention |
| Is a claim biologically real? | MPRA, endogenous editing, occupancy + expression assays | G-D biological evidence | Raises claim to mechanism level | Context mismatch, linkage, indirect effects | Rescue, replicate context, orthogonal assay |

Two ordering principles are embedded in this matrix. First, methods that are cheap and local are often the right first pass, but they should be treated as screens. Second, every upward move in semantic richness should be accompanied by a move upward in validation strength. A motif discovered by TF-MoDISco should not outrank the exact mutational evidence that generated it; a circuit story should not outrank the perturbation controls that keep it honest; and a designed sequence should not outrank the assay that finally tests it.

A complementary way to read the matrix is as a refusal map. If the user-visible evidence for a claim never leaves the left side of the table, then the wording on the right side must stay correspondingly narrow. For instance, if a result is supported only by gradients and an attractive motif match, the document should refuse language about causality, physical cooperation, or factor binding. If a result is supported by exact model edits but no external assay, the document may claim a model-encoded dependence but should still refuse biological-mechanism wording. And if a result depends on a local-only tool or a released-but-unvalidated panel, the document should refuse stronger evidentiary language even if the plots look compelling. This refusal discipline is one of the main differences between a research blueprint and a speculative essay.

## Experiment-ready research portfolio

This fragment isolates the experiment-portfolio cards for the Shorkie interpretability frontier. Unless a card states otherwise, the default expression-model scalar is
`g(x; R, T) = log2(1 + sum_{b in R} |T|^{-1} sum_{t in T} y_{b,t}(x))`,
where `x` is one 16,384-bp input window with a fixed species one-hot, `R` is a declared interval of the cropped 896-bin output space, and `T` is a declared set of expression tracks, usually the 384 `_T0_` induction-RNA tracks used by current ISM and attribution tooling rather than a post hoc-picked subset. “Implemented” below means present in the audited released repository or generated shipped assets. “Local-WIP” means code or generated artifacts exist only in the uncommitted working tree and are not yet a released site capability. “Adapted precedent” means the scientific move already exists outside Shorkie. “Proposed” means the Shorkie-specific experiment design, dependency structure, and validation plan are new in this portfolio. The expression model is always the main object; Shorkie_LM appears only as a comparator, plausibility prior, or provenance anchor.

### Proposal 1 — Fold uncertainty

Decision/use case: this card decides when a local explanation is stable enough to support a biological story, when it should be displayed only with an abstention badge, and when the instability is so large that the interpretation should stop at “model sensitivity not yet robust.” It is the portfolio’s first gate because every downstream motif, circuit, and design claim depends on knowing whether the signal survives changes in training fold, physical strand, reference family, target grouping, and locus composition.

Implemented, adapted precedent, and proposed components: implemented today are single-checkpoint expression predictions, exact ISM, RC-aware attribution for some methods, and exact track- and locus-specific scalars in the released stack. **This card is now executed.** The claim that only `f0` was available was about availability, not method, and it was wrong: all eight folds are public at `https://storage.googleapis.com/seqnn-share/shorkie_models/shorkie/f<n>/model_best.h5`, each 57,571,980 bytes, each loading with exactly 14,253,567 parameters and every tensor consumed, and each genuinely distinct (different weight bytes; `g` spans 14.98–15.73 on one locus). `make_folds.py` and `shorkieFolds.json` recompute 17,664 exact single-base effects over 23 loci under all eight checkpoints and both strands. The panel is selected from `f0`, which is therefore excluded from every cross-fold statistic and reported separately. Result: **85.1%** of the strongest bases are fold-stable against **53.7%** of distance-matched controls, with median sign agreement 1.000 (gate 0.80) and median top-1% overlap 0.485 (gate 0.40). Fold and strand are reported as separate axes and are of comparable size (0.00851 against 0.00802, a ratio of 0.943), so neither may stand in for the other. The pack now also ships **per-fold** values rather than medians alone — each checkpoint's own scalar at every locus, its median |effect|, its majority agreement, and the 8×8 pairwise overlap — which converts "recomputed under all eight folds" from an assertion into something a reader can inspect. That matrix separates two claims the aggregate had merged: sign agreement is 85.1% on the strongest bases, while any two checkpoints share only **41–55%** of their top 1% of bases. The direction of a strong effect is stable across training runs; the identity of the top-ranked bases is about half reproducible between any two. Any released surface that presents a *ranking* rather than a *sign* inherits the weaker of the two figures, which is the practical consequence of this card and was invisible while only the median shipped. What remains unexecuted is the extension of this ledger to motif, internal-feature and circuit levels. Adapted precedent comes from deep ensembles and uncertainty under shift in [Lakshminarayanan et al. 2017](https://papers.neurips.cc/paper/2017/hash/9ef2ed4b7fd2c810847ffa5fa85bce38-Abstract.html), [Ovadia et al. 2019](https://proceedings.neurips.cc/paper_files/paper/2019/hash/8558cb408c1d76621371888657d2eb1d-Abstract.html), explanation-uncertainty work such as [Marx et al. 2023](https://proceedings.mlr.press/v206/marx23a.html), and direct genomic attribution-stability studies such as [Majdandžić et al. 2022](https://proceedings.mlr.press/v200/majdandzic22a.html), [Reynolds and Pan 2025](https://doi.org/10.1371/journal.pcbi.1013784), and [Maslova and Libbrecht 2026](https://doi.org/10.64898/2026.07.08.737315). The genuinely proposed part is one Shorkie ledger that decomposes variance at four representational levels at once: base attribution, motif effect, internal feature effect, and circuit effect.

Rationale and intuition: Shorkie is not reverse-complement equivariant, and its current browser surfaces often average forward and RC runs only after each run has already formed a distinct internal state. That means strand disagreement is not harmless Monte Carlo noise. Likewise, a single released fold cannot stand in for training uncertainty. The right question is not “what is the confidence of this heatmap?” but “which declared sources of variation make this exact statement flip sign, move location, or disappear?” A base that is weakly positive in every fold and every strand is a different object from a base that looks large only because one fold paired with one baseline produced a sharp logo.

Testable hypothesis: for a locked panel of loci, a substantial subset of top Shorkie signals will remain stable under fold, RC, and reference perturbations when scored against the exact scalar `g`, and the signals that survive this decomposition will enrich for faithful motif edits more than raw single-run saliency peaks do.

Exact Shorkie scalar/tensor target: the default scalar is `g(x; R_gene, T0)` with `R_gene` equal to the focal gene body bins on the cropped 896-bin output. Secondary targets are explicit contrasts such as `g(x; R_gene, T_stress) - g(x; R_gene, T_baseline)`. For uncertainty on internals, the measured tensor targets are stage-specific recovered effects or feature activations already mapped back to the same scalar rather than free-floating tensor norms.

Intervention/perturbation: rerun the same explanation or intervention family across every executable fold checkpoint, both physical orientations, every declared reference family used by Proposal 2, and a fixed locus panel spanning promoter classes, GC content, and conservation-, orthology-, or promoter-architecture strata. Do not substitute strand variance for fold variance if extra checkpoints are unavailable; record fold uncertainty as unestimated.

Baselines and matched controls: compare against random loci matched on gene length, promoter GC, expression range, and motif density; against neutral edits matched on nucleotide change and position; and against simple predictors such as GC/TSS-distance baselines and, where useful, an intrinsically simpler mechanism baseline such as ExplaiNN-style additive units. Controls should also include repeated runs with numerically identical settings to separate deterministic quantization noise from scientific uncertainty.

Strand/RC treatment: every run is performed separately on forward `x` and `rc(x)`, with coordinates, allele labels, and any spatial peak calls mapped back to the reference strand only after strand-specific effects are computed. The ledger stores both the raw disagreement and the aggregated summary. Species identity remains fixed because this proposal estimates robustness, not phylogenetic transfer.

Experimental steps/pseudocode:

1. Lock a locus panel, track groups, and scalar definitions.
2. For each explanation family `E`, fold `f`, strand `s`, and reference `r`, compute `E(x; f, s, r, g)`.
3. For each locus, reduce outputs to shared observables: top-k bases, motif windows, signed exact edit predictions, and any internal feature or circuit scores.
4. Estimate variance components across fold, strand, reference, target, and locus using hierarchical models or bootstrap summaries.
5. Route only the stable subset into downstream motif discovery, tracing, or design.

Quantitative metrics: per-base signed rank correlation, continuous Jaccard, top-k overlap, motif-hit selection frequency, sign agreement of exact edit effects, calibration of predicted magnitude to exact ISM, and risk-coverage curves in which the system abstains on unstable calls. Where multiple folds exist, report intraclass correlation or fold-wise variance fractions.

Uncertainty/seed/fold robustness: use at least five independently trained seeds or folds if they become available; otherwise say explicitly that training uncertainty is unestimated. Bootstrap loci rather than bases. A robust signal should hit preregistered thresholds such as median per-fold sign agreement above 0.8, top-1% overlap above 0.4, and a 95% ensemble interval excluding zero for the declared edit effect.

Compute/data/storage estimate or formula: `N_loci * F * 2 strands * R_refs * C_methods` explanation evaluations plus exact validation passes. Storage is dominated by saved per-run score maps, approximately `sum_m N_loci * F * 2 * R_refs * size(map_m)`; motif- or circuit-level summaries are much smaller and should be derived rather than primary.

Wet-lab bridge where applicable: only loci or motifs that survive the stability ledger should enter MPRA or endogenous editing triage. The practical value is to spend assays on effects whose direction is not an artifact of one fold or one baseline.

Failure modes: unavailable checkpoints; falsely low variance because all folds are near-identical or all explanations are flattened; confounding between target choice and baseline choice; and overinterpreting low disagreement when the method is consistently wrong.

Explicit stop/go gates: go to biological interpretation only if the candidate signal passes locked fold/strand/reference thresholds and retains exact-edit support. Stop if the direction flips across folds, if RC disagreement dominates the effect size, or if only one fold exists and the claim depends on training uncertainty.

Dependencies: none. This is a gateway card for the entire portfolio.

Evidence/novelty boundary: uncertainty decomposition, ensembles, and attribution stability are not new. The novelty is a Shorkie-specific, scalar-anchored decomposition that treats fold, strand, reference, target, and locus as separate axes and propagates that decomposition to motifs, internals, and circuits instead of stopping at saliency maps.

Expected outputs: a variance ledger per locus and per method, abstention-aware explanation exports, a shortlist of stable loci for later cards, and a negative result if only `f0` is executable, namely that training-fold uncertainty remains unestimated rather than silently ignored.

### Proposal 2 — Reference-aware attribution

Decision/use case: this card chooses which reference families are safe enough to use when publishing or trusting path-based attributions on Shorkie. Its use case is practical: when a browser panel or paper figure shows IG, DeepLIFT-like, or expected-gradient scores, the reader should know whether those scores are robust to biologically plausible references or whether the chosen baseline is doing most of the storytelling.

Implemented, adapted precedent, and proposed components: implemented today are exact ISM without a baseline, gradient × input, and integrated gradients with an all-DNA-zero baseline while preserving the species one-hot. The released audit also shows dinucleotide shuffles and locus-preserving replacements used in other perturbation tools. Adapted precedent comes from [Sundararajan et al. 2017](https://arxiv.org/abs/1703.01365), [Shrikumar et al. 2017](https://arxiv.org/abs/1704.02685), [Kindermans et al. 2019](https://doi.org/10.1016/j.patcog.2018.10.011), [Erion et al. 2021](https://doi.org/10.1038/s42256-021-00343-w), and genomic reference practices in [Koo et al. 2021](https://doi.org/10.1371/journal.pcbi.1008925) and [Avsec et al. 2021](https://doi.org/10.1038/s41588-021-00782-6). **Executed for reference family and orientation, not yet for fold.** `make_references.py` and `shorkieReferences.json` recompute the same 32-step path integral under five legal families — all-zero DNA, mononucleotide shuffle, dinucleotide shuffle, a locus-matched real window, and expected gradients over an ensemble of the last two — on 23 loci and both strands, with the exact scalar and completeness accounting fixed. None assumes channel 4 carries mask semantics. Shorkie_LM's own masked negative log-likelihood is the out-of-distribution diagnostic, which makes it a measurement rather than an assertion: real yeast sequence costs 1.7648 bits a base, a real window used as a reference costs essentially the same, shuffles cost ~1.96–1.98, and the all-zero reference has no bases to score at all — zeroing the four DNA channels is exactly how this model family masks a position. **The shipped all-zero default is not the best**: it reaches 0.899 of the achievable deletion damage against 0.955 for the dinucleotide shuffle, and its forward and reverse maps agree at only r = 0.358 against 0.738 — the transparency failure this card names, since it needs averaging before it looks stable. It does hold the best rank correlation with exact ISM (0.469), which is a dissociation rather than a defence: correlating with the ground truth and ordering the bases whose mutation actually hurts are different achievements. Integrated Gradients therefore ships labelled reference-sensitive with the menu exposed. **The fold axis of this card is now executed, and it changed the answer.** Under all eight checkpoints the shipped all-zero default wins in **0 of 8** folds — every shuffle-based family beats it under every one — so "the default is not the best" is a property of the reference rather than of one training run. But *which* family is best is not robust: the winner moves across folds (dinuc, mono, expected, mono, expected, mono, mono, expected) and the three shuffle medians lie within 0.035 of one another. On `f0` alone dinucleotide shuffle won; over eight folds the median favours mononucleotide (0.980 against 0.949). The single-fold experiment reported the unstable half of its own result, which is the clearest available demonstration that this card's fold axis is not optional. The recommendation the evidence supports is to move OFF the all-zero baseline while naming no replacement.

Rationale and intuition: in Shorkie, the fifth non-DNA channel is not established as a legal masking token, so a naïve “unknown-base” baseline cannot simply assume that channel 4 carries valid semantics. Likewise, an all-zero DNA baseline is computationally convenient but biologically out of distribution. A model can assign beautiful attributions to the path from an unrealistic reference to a realistic promoter. The correct question is not which baseline feels intuitive, but which reference family gives path-based scores that best track exact finite differences while avoiding obvious OOD pathologies.

Testable hypothesis: among reference families that preserve the species channel and legal input format, dinucleotide- or locus-matched biological references will produce IG-like maps whose completeness remains acceptable and whose calibrated agreement to exact ISM exceeds that of the current all-zero-DNA baseline on held-out loci.

Exact Shorkie scalar/tensor target: the primary target remains `g(x; R_gene, T0)` and prespecified contrasts. The tensor target is the attribution matrix over the four DNA channels at each input base. Every reference is compared only on the same scalar and the same loci; no reference gets to choose an easier target.

Intervention/perturbation: compare at least five reference families: all-zero DNA with preserved species one-hot; mono-nucleotide-matched shuffled promoter; exact dinucleotide-preserving shuffled promoter; locus-matched biological promoter backgrounds from non-overlapping genes; and a small expected-gradients ensemble over several matched biological references. For each family, compute IG or expected gradients with the same step count and same final scalar. Use exact ISM as the model-behavior comparator, not as “truth.”

Baselines and matched controls: random references matched on GC, promoter class, and expression range; fixed synthetic controls with known motif insertions; and unreferenced methods such as exact ISM and gradient × input to see whether reference sensitivity adds information or only noise. Include an OOD diagnostic, for example Shorkie_LM negative log-likelihood or a simple OOD score, to reject references that make the interpolation path obviously implausible.

Strand/RC treatment: compute reference paths separately on forward and RC inputs, map both sets of contributions back to the reference strand, then compare both the strand-specific maps and the averaged result. A reference family that is only stable after averaging but flips signs before mapping fails the transparency requirement.

Experimental steps/pseudocode:

1. Lock scalar `g`, loci, and track groups.
2. Generate legal reference sets that preserve species one-hot and avoid assuming channel-4 masking semantics.
3. Compute IG or expected gradients for every `(fold, strand, reference)` combination.
4. Measure completeness residual, ISM agreement, OOD diagnostics, and motif perturbation calibration.
5. Keep the full sensitivity panel; do not collapse to one preferred reference if results are tied or unstable.

Quantitative metrics: completeness gap, per-base and per-motif correlation with exact ISM, top-k edit precision, insertion/deletion AUCs on reference-ranked bases, infidelity/sensitivity metrics from [Yeh et al. 2019](https://papers.nips.cc/paper/2019/hash/a7471fdc77b3435276507cc8f2dc2569-Abstract.html), and risk-coverage curves that abstain when reference sensitivity is high.

Uncertainty/seed/fold robustness: fold and strand summaries are mandatory. A reference family qualifies only if its median completeness error stays below a locked threshold, its ISM agreement survives fold variation, and its best performance is not carried by one locus family. If only `f0` exists, report that explicitly.

Compute/data/storage estimate or formula: approximately `N_loci * F * 2 * R_refs * M_steps` forward/backward evaluations for path methods, plus exact ISM validation on a sampled set. Storage can be minimized by retaining summaries and only selected full maps rather than every integration step.

Wet-lab bridge where applicable: the wet-lab bridge is indirect. A reference family becomes useful only insofar as it nominates motif edits that later validate in MPRA or endogenous assays. This card should therefore pass a small validation handoff to Proposal 4 rather than claim biology itself.

Failure modes: one reference family could look good simply because it smooths away signal; path interpolation through unrealistic states can make completeness meaningless; locus-matched references may leak hidden signal if matched genes share the same architecture; and agreement with ISM can still fail to imply biological causality.

Explicit stop/go gates: choose a reference family for default display only if completeness, exact-edit calibration, OOD diagnostics, and fold/strand stability all pass. Otherwise keep multiple reference views exposed and label the explanation reference-sensitive.

Dependencies: Proposal 1 for the uncertainty ledger; Proposal 4 for shared faithfulness metrics.

Evidence/novelty boundary: path-based attribution and reference criticism are established. The novelty here is a Shorkie-specific benchmark that respects the 170-channel input contract, the non-equivariant RC behavior, and the exact expression-model scalar.

Expected outputs: a declared reference menu, calibration plots against exact ISM, a recommended default reference family or a recommendation not to default to one, and provenance metadata stating why the chosen family was accepted.

### Proposal 3 — Task-conditioned TF-MoDISco

Decision/use case: this card decides whether Shorkie can discover reusable sequence patterns for one declared regulatory task without first averaging across incompatible conditions. The use case is motif discovery for a specific contrast, such as baseline versus stress induction or one regulator’s track group versus another’s, with fold-wise replication and exact motif perturbation rather than one pooled seqlet soup.

Implemented, adapted precedent, and proposed components: implemented today are exact single-base ISM planes, hypothetical contribution transforms derived from those planes, motif perturbation tooling, and a released `scripts/shorkie/make_modisco.py` plus `src/data/shorkieModisco.json` panel. The released panel is a custom greedy-correlation approximation rather than canonical TF-MoDISco or tfmodisco-lite. It now publishes both cells of a generator-declared fixed 11/15-bp width grid: the real/control arms produce 3/2 clusters at 11 bp and tie 3/3 at 15 bp, with every reported cluster in both arms matching the local JASPAR set. The repository does not contain an external preregistration record, so “pre-registered” is an implementation assertion rather than independently verified preregistration. More importantly, that control reuses the original ISM planes while shuffling only the sequence/reference projection instead of recomputing model-conditioned attributions on shuffled inputs; it is therefore a reference-assignment/composition stress test, not a decisive matched attribution null. **A matched null is now released beside it.** `make_null_planes.py` recomputes contribution planes on dinucleotide-shuffled *input* — gradient-based, in the mutagenesis convention so the same seqlet extraction applies unchanged, with an exhaustive-ISM bridge over a promoter slice — and `make_modisco.py` reports the result as `matchedNull`. **Each shuffle draw is clustered separately**, which is load-bearing rather than cosmetic: clustering is superlinear in seqlet count, so pooling five draws hands the null a five-fold pool advantage that dividing the pooled cluster count by the number of draws does not undo, and the first version of this comparison reported 11.0 null clusters per draw against 1 real for exactly that reason. Size-matched, the real arm gives **0** clusters from 1,037 seqlets against **3.0 ± 1.0** per draw from ~1114. The two arms' own pairwise-similarity distributions are indistinguishable (median 0.1051 against 0.1047), so the whole difference lies in the tail above threshold and rests on 5 draws. That supports the narrow claim the panel needed — the real arm does not *exceed* a model-conditioned null — and not the broader one that shuffled input is richer. It also applies to the gradient-based contribution type on which both arms can be recomputed; the ISM-based grid still has no valid null, so **no cell of this experiment has a model-conditioned null supporting a real-arm excess.** Adapted precedent comes from [TF-MoDISco](https://arxiv.org/abs/1811.00416), [BPNet](https://doi.org/10.1038/s41588-021-00782-6), and Borzoi’s task-specific attribution aggregation in [Linder et al. 2025](https://doi.org/10.1038/s41588-024-02053-6). The proposed element is task-conditioned, fold-replicated, RC-correct motif discovery for declared Shorkie expression contrasts using a canonical or lite implementation and a valid matched-null design.

Rationale and intuition: Shorkie’s current exact ISM and attribution machinery already knows a great deal about local sequence sensitivity, but pooled motifs across all tasks mix signs, conditions, and expression regimes. A motif that activates one induction program and represses another can disappear when everything is averaged. The released compact panel proves the repository can pull and cluster seqlets from model-derived mutagenesis planes without GPU inference, and its real-versus-control similarity is an informative warning against overreading AT-rich patterns. Yet its approximation and control choices make it a scaffold and negative-control result rather than validated task-conditioned motif evidence. The scientific lift in this card is therefore not “run the existing script,” but “replace the shortcut with a valid task-conditioned motif-discovery pipeline.”

Testable hypothesis: if seqlets are extracted from exact or calibrated contribution maps for a prespecified expression contrast, then fold-consistent motif clusters will replicate more strongly and yield better exact motif-edit calibration than motifs discovered from globally pooled maps.

Exact Shorkie scalar/tensor target: use contribution tensors aligned to one scalar or one scalar contrast only. The default target is `g(x; R_gene, T_a) - g(x; R_gene, T_b)` or `g(x; R_gene, T_group)` for a single group. Seqlets are extracted from the corresponding mean-centered 4-by-L hypothetical contribution blocks, not just from absolute saliency.

Intervention/perturbation: for each task contrast, compute exact ISM or validated fast approximations, extract seqlets separately for positive and negative contributions, cluster them with RC-aware orientation handling in canonical TF-MoDISco or tfmodisco-lite, and then test the resulting motifs with exact motif knockout, insertion, spacing, or local GIA experiments in the same scalar target. The released compact panel’s shuffled arm should not be reused as the decisive null; the research version should recompute contribution maps on matched shuffled or matched-biological references so the null perturbs the model input, not only the seqlet-projection step.

Baselines and matched controls: pooled-across-task motif discovery, the current custom greedy-clustering approximation, seqlets from contribution maps recomputed on dinucleotide-shuffled or locus-matched nulls, random windows matched on contribution mass, motif matches against yeast-specific databases such as [YeTFaSCo](https://doi.org/10.1093/nar/gkr993) and CIS-BP analogues, and exact perturbation of matched decoy motifs with the same width and information content. Stability filtering and false-discovery control should be explicit rather than implicit.

Strand/RC treatment: a seqlet and its reverse complement are the same observation. Clustering therefore happens after RC normalization, with every seqlet recording which orientation it matched. Fold comparisons are made on RC-canonical motif representations, and exact perturbation tests use mirrored edits on forward and RC runs before mapping back.

Experimental steps/pseudocode:

1. Choose a track set or contrast and a locked locus panel.
2. Compute exact or calibrated contribution blocks for that target.
3. Extract seqlets separately by sign and task, canonicalize orientation, and cluster within fold.
4. Match cluster PWMs to yeast motif references, but treat the match as annotation, not validation.
5. Validate each motif family with exact motif edits, insertion controls, and matched decoys.
6. Intersect motifs across folds and retain only reproducible families.

Quantitative metrics: number of replicated clusters per task, seqlet yield per locus, motif information content, database-match enrichment, exact perturbation effect size, held-out-locus replication, and fold-wise cluster-overlap metrics using PWM similarity and effect-sign consistency.

Uncertainty/seed/fold robustness: require motif families to recur across folds, not just across loci. Report cluster stability under threshold changes, seqlet subsampling, and alternative reference families from Proposal 2. A motif family that matches a database entry but fails exact perturbation or fold replication is not promoted.

Compute/data/storage estimate or formula: `N_loci * F * 2 strands * 3L` exact ISM evaluations if done from scratch, or less if reusing stored planes, plus modest clustering cost. Storage is mostly raw ISM planes and seqlet tables; cluster PWMs and examples are lightweight.

Wet-lab bridge where applicable: task-conditioned motifs produce direct candidates for promoter-tile MPRA, exact site swaps, or regulator-specific induction assays. The bridge is strongest for motifs that show both fold replication and exact perturbation effects in one declared condition group.

Failure modes: overfragmented clusters; motifs that are really promoter-position signatures; seqlets driven by reference artifacts; control arms that only shuffle sequence projection without changing the underlying attribution tensor; and one-fold success that does not generalize. Another failure mode is treating the existence of `shorkieModisco.json` as evidence that canonical TF-MoDISco or a validated factor motif has been established. The artifact establishes only the exact custom computation it stores.

Explicit stop/go gates: go only if clusters replicate across folds, exceed scientifically matched recomputed nulls, satisfy explicit stability and false-discovery thresholds, and their exact motif perturbations reproduce the inferred sign and condition specificity. Stop if motif identity depends on one fold, one threshold, one annotation database, or one approximate clustering implementation.

Dependencies: Proposal 1 for fold stability, Proposal 2 for reference discipline, and Proposal 4 for exact validation metrics.

Evidence/novelty boundary: TF-MoDISco, seqlet clustering, and task-specific motif aggregation already exist in the literature. The novelty is not motif discovery itself but a Shorkie-specific design that keeps one declared expression task at a time, uses fold replication, explicit RC handling, matched-null recomputation, stability/FDR checks, and exact perturbation within the same scalar target. The current repo status is “released compact approximation with output and a control that does not establish model-conditioned motif significance”; canonical task-conditioned TF-MoDISco remains proposed.

Expected outputs: per-task motif inventories with RC-canonical PWMs, fold-replication tables, exact perturbation summaries, and, if the research pipeline fails, a negative result explaining whether failure came from seqlet scarcity, unstable references, or missing fold support.

### Proposal 4 — Faithfulness benchmark

Decision/use case: this card decides which existing Shorkie explanation surfaces can support discovery and which should remain exploratory graphics. Its use case is governance of the whole stack: exact ISM, gradients, IG, occlusion, internal maps, motif knockouts, spacing, HVPs, and any tracing or circuit method all need one common benchmark so the project can stop arguing from aesthetics.

Implemented, adapted precedent, and proposed components: implemented methods already include exact single-base ISM, RC-aware gradient × input and IG, 64-bp occlusion, motif knockout, targeted HVP, motif-spacing scans, species sweeps, effective-context shuffles, greedy counterfactual edits, and a released 22-locus causal-patching pack. Adapted precedent comes from saliency sanity checks in [Adebayo et al. 2018](https://arxiv.org/abs/1810.03292), formal explanation metrics in [Yeh et al. 2019](https://papers.nips.cc/paper/2019/hash/a7471fdc77b3435276507cc8f2dc2569-Abstract.html), ROAR in [Hooker et al. 2019](https://papers.nips.cc/paper/2019/hash/fe4b8556000d0f0cae99daa5c5c5a410-Abstract.html), metric critiques in [Tomsett et al. 2020](https://doi.org/10.1609/aaai.v34i04.6064), and genomic benchmarking in [Penzar et al. 2024](https://doi.org/10.1038/s41587-024-02414-w) and [Reynolds and Pan 2025](https://doi.org/10.1371/journal.pcbi.1013784). **Executed at the input level; the internal level remains proposed.** `make_faithfulness.py` and `shorkieFaithfulness.json` score every released input-side attribution against the exhaustive mutagenesis planes on the same scalar, with rank agreement computed at each method's own native resolution and a deletion curve driven by real forward passes and normalised against what ranking by the exact answer achieves. Gradient × input (0.858), Integrated Gradients (0.897) and 64-bp occlusion (0.286) clear the strongest baseline (0.166); **attention rollout does not**, at 0.040, below a random ordering, while still correlating with the ground truth at ρ = 0.529. That dissociation is the card working: rollout indicates where signal concentrates, not which bases carry it. Two metric errors were found by running rather than reasoning and are recorded because either would have produced a confident wrong ranking — per-method curve normalisation measures shape rather than damage, and an oracle ranked by `max |effect|` does not bound a deletion that applies the *worst* substitution (Integrated Gradients scored 1.0053 against that ceiling). **Cascading parameter randomization is now executed** (Adebayo et al. 2018), head-first, by permuting each parameter tensor's own values so that every parameter keeps its exact marginal distribution and only the arrangement is destroyed — a collapse therefore cannot be attributed to a change of scale. Gradient × input decorrelates monotonically from its intact self, 0.96 → 0.25 over 6 loci. **The branch decomposition this card asks for is what makes the result readable**: destroying the entire transformer moves the map only 0.60 → 0.34, because the three decoder skips are fed by `block5`–`block7` and carry signal around the bottleneck — a pooled score would have read that architectural fact as the check failing. The map also does not decorrelate to zero with the whole network randomized (0.25), which is the floor the one-hot input geometry contributes before any learning and the level any collapse should be read against. **The fold axis is executed and the verdicts are unanimous**: integrated gradients, gradient × input and 64-bp occlusion clear the baselines in 8 of 8 folds and attention rollout in 0 of 8, below every baseline in every fold, with no method split. The per-method *spread* is itself informative — integrated gradients varies over 0.109 across checkpoints against 0.172 for gradient × input — so how far a score depends on the training run is a property of the method rather than noise. One scope note this card must carry: every fold is scored against fold `f0`'s exhaustive mutagenesis, since per-fold planes are roughly 52 GPU-hours, so it tests whether `f0`-derived conclusions transfer rather than scoring each checkpoint against its own truth — and the oracle is consequently a strict ceiling only for `f0`. Internal-method scoring against exact interventions remains proposed. The released patching surface is still one method under test.

Rationale and intuition: Shorkie’s current repertoire mixes exact finite differences, path-based approximations, descriptive summaries, and heuristic displays. Some panels are honest local sensitivities; others are compressed internal views; still others are designed contrasts. Without one benchmark, users can mentally promote any crisp picture to mechanism. This card creates a ladder: what changes the frozen scalar, what survives randomization, what predicts exact edits, and what has any right to propose biology.

Testable hypothesis: methods that explicitly target the same scalar `g` and are validated against exact single-base, motif, block, and internal interventions will separate into a reliable subset that consistently beats random and simple sequence baselines, while some current displays will fail or downgrade to exploratory status.

Exact Shorkie scalar/tensor target: all evaluations anchor on a locked scalar such as `g(x; R_gene, T0)` or one declared contrast. Internal methods are scored only by how well their predicted importance or circuit membership forecasts exact changes in that scalar under corresponding interventions.

Intervention/perturbation: the benchmark includes exact single-base substitutions, exact motif scrambles, in-distribution block replacements, 64-bp and optionally 16-bp occlusion, branch-specific activation patches, and synthetic promoter constructs with known planted motifs and spacing rules. Randomization tests should cover both parameters and labels, and for internal methods the randomization must hit the branch being interpreted rather than an unrelated layer.

Baselines and matched controls: random base rankings, GC/TSS-distance heuristics, first-layer motif scans, simple additive mechanism baselines, neutral edits matched on position and composition, shuffled-sequence controls, and decoy motif insertions. For internal methods, include random bands, random stages, and source-swap controls where clean activations from one locus are written into another corrupted locus.

Strand/RC treatment: every benchmarked method is run on forward and RC inputs separately with mirrored targets and then mapped back. The benchmark records whether a method’s success comes from transparent strand-wise agreement or only from post hoc averaging.

Experimental steps/pseudocode:

1. Lock synthetic and real locus panels plus one scalar family.
2. Compute all candidate explanation outputs.
3. Generate exact intervention datasets at base, motif, block, and internal-branch levels.
4. Score each method on calibration, ranking, deletion/insertion, and randomization.
5. Promote only methods that clear all required gates for their intended claim level.

Quantitative metrics: exact-edit correlation, top-k precision and recall on synthetic planted grammar, deletion/insertion AUC, comprehensiveness/sufficiency, infidelity/sensitivity, randomization collapse scores, and abstention-aware risk-coverage curves. For internal methods add retained/complement intervention gaps and branch-specific necessity/sufficiency.

Uncertainty/seed/fold robustness: benchmark scores are summarized across folds, strands, loci, and synthetic random seeds. A method should not be promoted based on one best-case target. The portfolio should also record where one method is reliable only for one class of tasks, such as single-base prioritization but not higher-order grammar.

Compute/data/storage estimate or formula: synthetic truth is cheap once generated; exact real-sequence ISM dominates cost. Overall effort is approximately `sum_methods cost(method) + N_interventions * F * 2`, where internal exact checks add one or more full forward passes per proposed patch. Store benchmark summaries centrally; raw maps need only sampled archival retention.

Wet-lab bridge where applicable: the benchmark itself is computational, but its outputs determine which explanation families feed promoter libraries and endogenous assays. It is the shield against wasting experiments on a compelling but unfaithful visualization.

Failure modes: distribution shift from destructive deletions; synthetic tasks that are too easy; randomization that misses the actual signal path because skip routes survive; and overfitting the benchmark to methods already in the repository.

Explicit stop/go gates: a method supports discovery only if it beats simple and random baselines on synthetic and real exact-edit tasks, passes randomization, and remains competitive across folds and strands. Otherwise it may be shown as exploratory but not used to justify a mechanistic claim.

Dependencies: Proposal 1 and Proposal 2 should land first because they define the uncertainty and reference axes. This proposal then becomes the gate for Proposals 3 through 12.

Evidence/novelty boundary: explanation benchmarking, sanity checks, and genomic spike-in tests are established. The novelty is one Shorkie benchmark that spans base, motif, block, and U-Net branch interventions on the same scalar and explicitly evaluates internal methods in a skip-connected genomic model.

Expected outputs: a benchmark leaderboard with caveats, promotion/demotion labels for existing surfaces, a minimum faithful method set for later cards, and a formal rationale for leaving some attractive panels in exploratory-only status.

### Proposal 5 — Skip-aware causal tracing

Decision/use case: this card asks where, and through which branch, promoter information becomes sufficient for one expression prediction. The use case is not to identify the most “important” bases, which current ISM already does, but to localize whether information is primarily carried by the convolutional path, the Transformer bottleneck, or the decoder skips that bypass it.

Implemented, adapted precedent, and proposed components: `scripts/shorkie/make_patching.py`, `src/data/shorkiePatching.json`, the consuming page, and pack-level verification are released in the audited repository snapshot. The implementation is `f0`-only, scores in forward coordinates only, uses one promoter dinucleotide shuffle per locus, restores clean activations at one stage and one spatial band, records 19 named stages (`stem`, `block1`–`block7`, `attn_out1`–`attn_out8`, `decoder1`–`decoder3`), and writes a 32-band by 19-stage recovery grid per locus. The pack covers 22 of the nominal 23 loci, includes explicit controls plus a `skipBypass` summary, and demonstrates that recovery can legitimately fall below 0 or above 1 because it is a normalized intervention effect rather than a probability. Adapted precedent comes from causal mediation and interchange interventions in [Imai et al. 2010](https://doi.org/10.1037/a0020761), [Geiger et al. 2022](https://proceedings.mlr.press/v162/geiger22a.html), [Geiger et al. 2025](https://www.jmlr.org/papers/v26/23-0058.html), causal tracing in [Meng et al. 2022](https://arxiv.org/abs/2202.05262), and patching best practices in [Zhang and Nanda 2024](https://openreview.net/forum?id=Hf17y6u9BC) and [Heimersheim and Nanda 2024](https://arxiv.org/abs/2404.15255). The genuinely proposed part is to harden the released first pass into a deterministic, multi-corruption, RC/fold-aware, path-specific skip-aware tracing program for a genomic convolution/Transformer/U-Net model.

Rationale and intuition: whole-layer restoration in a U-Net is degenerate because the downstream network can simply inherit the clean run. The released implementation correctly avoids that screen-level degeneracy by restoring one spatial band rather than one full stage, and it exposes an architecture-specific fact that matters for interpretation: restoring the full bottleneck does not recover the clean score perfectly because decoder skips carry residual information around the Transformer. That gap is valuable, not an implementation defect, because it measures bypass under this corruption. But the current implementation is still only a first pass: one corruption draw per locus, Python `hash()` seeding that is not reproducible across processes unless the hash seed is fixed, one-band patching rather than path-specific joint branch interventions, and no fold or RC replication. The scientific proposal is therefore to harden the released screen into a deterministic causal experiment rather than to rename release status as finished tracing.

Testable hypothesis: for a locked panel of promoter corruptions, some Shorkie predictions will show decisive recovery concentrated in specific stage-band combinations, and the full-bottleneck shortfall relative to full first/last-stage recovery will quantify meaningful skip-mediated bypass that predicts when bottleneck-only narratives are misleading.

Exact Shorkie scalar/tensor target: the scalar is the exact expression-model target already used by the prototype, namely `g(x; R_gene, T0)` over the focal gene’s bins and the 384 `_T0_` induction tracks. The tensor targets are the recorded stage activations at the 19 named stages, patched over one of 32 common 512-bp bands after stage-specific coordinate conversion.

Intervention/perturbation: corrupt the promoter with an Altschul-Erikson dinucleotide shuffle over the 1-kb upstream interval on the gene’s own strand, compute clean and corrupted scores, then restore clean activations into the corrupted run at one stage and one band. The research version should upgrade this to deterministic multi-corruption families per locus, exact motif-edit corruptions, source-swap controls, and path-specific interventions that jointly patch or ablate main-stream and skip-parent contributions rather than only one restored band at a time.

Baselines and matched controls: the prototype already includes three critical controls: full first-stage restoration must recover 1, full last-stage restoration must recover 1, and restoring no positions must recover 0. Those stay mandatory. Additional controls should include random bands, random stages matched on tensor size, clean-source mismatch from another locus, deterministic repeated corruptions, both-parent versus single-parent restoration at decoder inputs, and matched path ablations that test whether a restored route is actually necessary when the complementary branch remains corrupted or is explicitly shut off.

Strand/RC treatment: the prototype currently works in forward coordinates only. The research version must repeat the entire corruption-and-restore procedure on `rc(x)`, mirror every stage’s spatial axis, reverse both axes of attention maps, map recovery peaks back to the reference strand, and only then compare or average. Skip bypass and path-specific mediation should be reported separately per strand before aggregation.

Experimental steps/pseudocode:

1. Lock the scalar target and a corruption family.
2. Cache clean activations for all 19 stages.
3. Generate a corrupted input by promoter dinucleotide shuffle or exact motif edit.
4. For each stage, band, and path condition, run patched or ablated corrupted passes and compute normalized recovery.
5. Audit first-stage, last-stage, and no-position controls and record whether any recovery leaves the `[0, 1]` interval.
6. Summarize peak stage, peak band, bottleneck mean recovery, skip-bypass fraction, and branch-specific necessity/sufficiency.
7. Replicate across folds, strands, deterministic corruption draws, and corruption families.

Quantitative metrics: normalized recovery surfaces, peak-stage distributions, correlation between traced bands and exact ISM peaks, bottleneck-versus-skip mediation fractions, held-out-locus replication, necessity/sufficiency deltas from retained/complement patches, and reproducibility across repeated corruption draws. For contrast tasks, use effect-size preservation of the declared scalar contrast rather than raw recovery magnitude alone.

Uncertainty/seed/fold robustness: because the current released artifact is `f0`-only and built from single corruption draws in forward coordinates, every substantive conclusion should be marked provisional until rerun across folds and both strands. A traceable effect should replicate over multiple deterministic corruptions at the same locus and over multiple loci of the same promoter class.

Compute/data/storage estimate or formula: cost is `N_loci * N_corruptions * 19 stages * 32 bands * F * 2 strands` forward passes, plus clean-cache runs. Storage is modest: one 19-by-32 grid and control bundle per locus per corruption family. Clean activation caching is transient and can be streamed.

Wet-lab bridge where applicable: tracing can prioritize which promoter segment to tile in MPRA or which motif edit to move from computational sufficiency to physical assay. It does not by itself identify the molecule, only the stage-band path through the model.

Failure modes: patching can look strong because the corruption is too blunt; full-stage bypass can be misread as evidence of biology rather than architecture; band discretization can smear a local effect; and source-swap controls may expose that some apparent recovery is just generic activation statistics. The released script’s Python `hash()` seeding can also make corruption draws non-reproducible across processes, recovery may legitimately exceed `[0, 1]` and be misread as invalid probability mass, and single-band restoration can miss branch interactions that only appear under joint skip/main interventions. Another failure mode is presenting the current 22-locus released artifact as fold-stable, path-specific, or biologically causal merely because it appears on the site.

Explicit stop/go gates: go only if control recoveries pass exactly, if stage-band peaks replicate across folds and strands, if deterministic repeated corruptions agree, and if skip-bypass or path-specific estimates remain stable under alternative corruption families. Stop if results depend on one corruption family, one non-reproducible random seed, if source-swap controls recover similarly, or if traced effects fail exact necessity/sufficiency checks under joint branch interventions.

Dependencies: Proposal 4 is the validation gate. Proposal 1 is needed for fold robustness. Proposal 6 and Proposal 7 build directly on the trusted tracing machinery.

Evidence/novelty boundary: activation patching and causal tracing are established elsewhere. Shorkie now implements and releases a limited spatial band-restoration surface plus a bottleneck-bypass diagnostic. The proposed novelty is factorial tracing of main-stream versus skip-mediated information in a genomic U-Net with deterministic corruptions, RC/fold replication, and exact path interventions. The current status is “implemented and released, not robustly or biologically validated.”

Expected outputs: per-locus recovery heatmaps, a skip-bypass ledger, deterministic multi-corruption tracing reports, branch-specific patch/ablation summaries, and either a validated tracing surface for the site or a documented negative result showing that branch-localized explanations are not yet stable enough to ship.

### Proposal 6 — RC-paired TopK SAE

Decision/use case: this card aims to replace polysemantic stage channels with a reusable latent dictionary whose features can be tested causally in the original Shorkie model. Its use case is to ask questions like “is there a reusable promoter-architecture feature that fires across loci and folds?” without pretending that raw channels or attention heads are already monosemantic.

Implemented, adapted precedent, and proposed components: the released repository exposes stage tensors and ships a TopK SAE trained on 94,970 `attn_out8` vectors of width 384 at 128-bp positions. The released run expands to 6,144 features with exactly \(k=32\) active and compares reconstruction against a separately trained SAE on independently column-shuffled activations (FVU 0.0194 versus 0.3733). It also reports the 64 features with greatest total activation, gives them 6-mer signatures from their top 48 activating cells, and scores their alignment to mean-pooled genome annotations with 256 circular shifts. A separate candidate-count-matched control scores the 384 strongest SAE features and all 384 raw channels with the same annotation statistic and 64 shifts; the median best ratios are 5.977× and 4.715×, respectively. These are released correlational results, not evidence that a feature is monosemantic or causally used. The pipeline neither pairs RC states nor replicates folds or performs causal feature clamps. Adapted precedent comes from sparse coding in [Olshausen and Field 1996](https://doi.org/10.1038/381607a0), modern SAEs in [Cunningham et al. 2023](https://arxiv.org/abs/2309.08600), [Gao et al. 2024](https://arxiv.org/abs/2406.04093), [Rajamanoharan et al. 2024a](https://arxiv.org/abs/2404.16014), [Rajamanoharan et al. 2024b](https://arxiv.org/abs/2407.14435), and genomic demonstrations in [Brixi et al. 2026](https://doi.org/10.1038/s41586-026-10176-5) and [Guan et al. 2025](https://arxiv.org/abs/2507.07486). There is no verified Borzoi SAE precedent, so none should be claimed. The proposed element is paired forward/RC dictionary learning on Shorkie residual and skip activations, evaluated in the unreplaced original model.

Rationale and intuition: a non-RC-equivariant genomic model can store the same biological pattern in orientation-specific coordinates, so a naïve SAE may split one concept into two arbitrary latents or collapse two different orientation-conditioned concepts into one. Pairing forward activations with mapped RC activations forces the dictionary to confront the geometry that the model actually uses. This is especially important in Shorkie because later cards want to compare features across stages, conditions, and species without treating orientation artifacts as mechanism.

Testable hypothesis: TopK or JumpReLU SAEs trained on matched forward and RC activation corpora from selected Shorkie stages will discover latent features that reconstruct the original activations well, align to yeast-relevant sequence or promoter concepts better than raw neurons or random dictionaries, and produce reproducible causal effects on `g` when clamped or ablated through the original model.

Exact Shorkie scalar/tensor target: train the SAE on one declared activation family at a time, for example `attn_out8` residual vectors of shape 128-by-384 or skip tensors from `block5`–`block7` and `decoder1`–`decoder3` after flattening position-local vectors. Downstream evaluation always maps latent intervention back to a declared expression scalar `g(x; R, T)`.

Intervention/perturbation: collect forward and RC activation corpora from a non-overlapping genomic split, learn paired dictionaries with shared or softly aligned decoder features, then test feature clamping, feature ablation, and reconstruction replacement in the original Shorkie network. A feature earns interest only if replacing the original activation with the SAE reconstruction preserves the scalar and ablating that feature changes the scalar in a specific, replicable way.

Baselines and matched controls: raw-neuron ranking, PCA or NMF, random orthogonal dictionaries, unpaired SAEs, and matched random features with the same activation frequency and decoder norm. Use motif databases, gene annotations, and simple position features as semantic aids, but causal validation must come from original-model interventions, not from labels.

Strand/RC treatment: every activation corpus includes forward states and mapped RC states. Pairing can be hard-sharing, contrastive alignment, or post hoc matching, but whichever choice is made must be validated on held-out loci by demonstrating that the mapped RC feature predicts the same scalar effect as its forward partner. Species is fixed within this proposal.

Experimental steps/pseudocode:

1. Choose one stage family and one data split.
2. Cache forward and mapped RC activations for independent positions.
3. Train several SAE variants over a sparsity grid.
4. Match or co-train forward and RC feature dictionaries.
5. Annotate candidate features with motif, sequence, and promoter metadata.
6. Validate reconstruction, then original-model ablation/clamping on `g`.

Quantitative metrics: reconstruction error, explained variance, downstream scalar preservation under SAE reconstruction, feature sparsity, dead-feature fraction, feature splitting/duplication indices, motif-alignment precision and recall, RC matching accuracy, and causal effect sizes relative to matched random features.

Uncertainty/seed/fold robustness: train multiple SAE seeds per fold and stage. A feature class is robust only if it recurs across seeds and folds, not merely if one latent looks interpretable. Use bootstrap confidence intervals over loci for feature-effect estimates and report feature-selection frequency. If training folds are unavailable, say so and confine claims to within-checkpoint structure.

Compute/data/storage estimate or formula: activation storage scales as `sum_stages N_positions * d_stage * bytes`; this is likely the dominant cost, so streaming and chunked training are preferred. Training cost is `epochs * dataset_size * model_width`, multiplied by several SAE hyperparameter settings.

Wet-lab bridge where applicable: features that align to explicit motif or promoter architecture hypotheses and produce exact causal effects can nominate compact MPRA designs, for example edits that isolate one latent-associated motif class. Wet-lab work remains a later escalation, not a direct output.

Failure modes: monosemantic-looking but causally weak latents; RC pairing that simply duplicates features; reconstruction that preserves activations but not the target scalar; and semantic labels that are too generic to discriminate mechanism. Another failure mode is treating successful reconstruction as evidence that the feature is “real biology.”

Explicit stop/go gates: go only if reconstruction preserves downstream behavior, RC-paired features are stable, annotation quality beats neurons and random dictionaries, and original-model interventions show specific scalar effects beyond reconstruction error. Stop if feature behavior is seed-fragile, if paired RC structure does not emerge, or if latent interventions do not generalize across loci.

Dependencies: Proposal 4 for faithfulness criteria and Proposal 5 for exact internal interventions. Proposal 7, Proposal 9, and Proposal 10 depend on having usable feature bases.

Evidence/novelty boundary: sparse autoencoders, probe controls, genomic SAE feasibility, and Shorkie’s released TopK reconstruction plus correlational grounding are established starting points. The novelty is an RC-paired dictionary strategy for a Shorkie expression model with skip-connected stages, fold recurrence, and exact original-model causal checks. The released annotation enrichment remains correlational evidence. No Borzoi SAE precedent should be claimed.

Expected outputs: stage-specific SAE checkpoints, RC feature-pair maps, feature annotations with uncertainty labels, and a retained subset of causally useful latents or a clear negative result if the dictionary fails to beat simpler baselines.

### Proposal 7 — Cross-resolution sparse circuit graph

Decision/use case: this card asks whether Shorkie’s behavior for one scalar can be compressed into a sparse graph that preserves both physical coordinates and multi-resolution branch structure. The use case is mechanistic compression: not “which stage lit up?” but “which sender feature at one resolution influenced which receiver feature or branch at the next resolution strongly enough to preserve the scalar when the rest is removed?”

Implemented, adapted precedent, and proposed components: implemented today are the stage hierarchy, exact expression scalars, a released single-stage single-band tracing surface over raw activations with a full-bottleneck skip-bypass diagnostic, and a TopK SAE at `attn_out8` with reconstruction and correlational annotation-grounding controls. No joint path-specific skip intervention, causally validated sparse feature set, or sparse circuit graph exists in the released repo. Adapted precedent comes from automated circuit discovery and edge-ranking methods such as [Conmy et al. 2023](https://openreview.net/forum?id=89ia77nZ8u), [Kramár et al. 2024](https://arxiv.org/abs/2403.00745), [Syed et al. 2023](https://arxiv.org/abs/2310.10348), sparse feature circuits in [Marks et al. 2024](https://arxiv.org/abs/2403.19647), transcoders in [Dunefsky et al. 2024](https://doi.org/10.52202/079017-0768), and attribution graphs in [Ameisen et al. 2025](https://transformer-circuits.pub/2025/attribution-graphs/methods.html). The proposed component is a Shorkie circuit DAG whose nodes respect the 128/256/512/1,024/native-resolution cascade and whose edges are validated in the unreplaced original model.

Rationale and intuition: raw neuron or channel graphs in a skip-connected architecture are too dense and too brittle. Shorkie already supplies a natural hierarchy: encoder blocks, Transformer residual states, decoder stages, and spatial bins that correspond to real genomic coordinates. If Proposal 6 supplies sparse features and Proposal 5 supplies trustworthy interventions, then a graph becomes meaningful: not a biochemical network, but a compressed model mechanism for one declared scalar.

Testable hypothesis: a sparse graph built from RC-paired features or carefully chosen raw-state nodes can preserve Shorkie’s response to a held-out intervention set better than matched random graphs, and the best graphs will expose whether specific predictions are bottleneck-dominated, skip-dominated, or jointly mediated.

Exact Shorkie scalar/tensor target: the output target is always one declared `g(x; R, T)` or one declared contrast. Candidate node tensors are stage-local SAE features or raw patchable bands at `block5`–`block7`, `attn_out1`–`attn_out8`, and `decoder1`–`decoder3`, each with explicit coordinate mappings to the 16,384-bp input.

Intervention/perturbation: screen adjacent-layer or adjacent-stage edges with attribution patching or EAP-style linearized estimates, then exact-patch top edges and a stratified sample below threshold in the original Shorkie model. Build candidate graphs by thresholding or greedy retention, and evaluate retained-versus-complement interventions on held-out corruptions and exact motif edits.

Baselines and matched controls: random sparse graphs matched on node count and edge count; graphs built from raw neurons rather than SAE features; no-skip or no-bottleneck ablations; and threshold sweeps that test whether success is robust or one fragile operating point. Include source-swap controls and branch-randomization checks.

Strand/RC treatment: graphs are built separately for forward and RC runs, then mapped to RC-canonical node identities. Do not assume the same feature-to-feature edge exists in both orientations; measure it. A node or edge is portable only if the mapped RC counterpart shows comparable intervention behavior.

Experimental steps/pseudocode:

1. Choose a scalar, an intervention family, and a node basis.
2. Compute edge scores between candidate sender and receiver nodes.
3. Build sparse candidate graphs across threshold or budget settings.
4. Exact-validate retained graphs and their complements in the original model.
5. Compare forward and RC graphs and aggregate only after mapping.
6. Summarize sparsity-faithfulness frontiers and branch-use decompositions.

Quantitative metrics: graph faithfulness on held-out interventions, retained/complement effect gaps, sparsity versus performance frontiers, edge replication across folds, RC graph similarity, and node/edge semantic coherence where available. For coordinate-aware graphs, measure how tightly inferred routes align to exact ISM peaks or traced promoter bands.

Uncertainty/seed/fold robustness: graph structure is notoriously unstable, so report threshold sensitivity, fold-wise edge frequencies, and whether alternative graph budgets yield the same high-level mediation story. A graph should not be treated as unique if many very different graphs preserve behavior equally well.

Compute/data/storage estimate or formula: screening is roughly `N_edges_screened * cost(score)` where attribution patching is relatively cheap, but exact validation scales with selected edges and graph budgets. Storage is dominated by node activations and edge tables rather than by final graphs.

Wet-lab bridge where applicable: circuit graphs can nominate compact edit sets that jointly test a mechanistic hypothesis, for example a promoter motif plus a distal context window predicted to converge on the same decoder branch. The wet-lab bridge remains indirect until exact sequence edits and endogenous assays confirm the proposed route.

Failure modes: graph overfitting to one intervention family; spuriously interpretable labels on purely statistical nodes; missing redundant or inhibitory paths; and successful replacement-model graphs that fail in the original Shorkie model. Another failure mode is confusing a sparse model circuit with a biological TF network.

Explicit stop/go gates: accept a graph only if it lies on a favorable sparsity-faithfulness frontier, passes retained/complement tests, generalizes to held-out loci or edits, and shows branch-use stability across folds and RC. Stop if graph quality collapses under exact validation or if graph multiplicity makes the mechanistic story too underdetermined.

Dependencies: Proposal 5 for exact internal interventions and Proposal 6 for useful feature bases. Proposal 1 and Proposal 4 provide the robustness and faithfulness scaffolding.

Evidence/novelty boundary: circuit search, EAP, and sparse feature graphs are adapted precedent. The novelty is a cross-resolution genomic DAG for Shorkie’s expression model that keeps physical coordinates and U-Net branch structure explicit and validates edges in the unreplaced model.

Expected outputs: sparse circuit candidates per task, branch-decomposition summaries, RC graph correspondence reports, and either a validated compact circuit family or a documented failure showing that behavior is too distributed for faithful compression at the chosen granularity.

### Proposal 8 — Pretraining memory/provenance

Decision/use case: this card asks whether one Shorkie behavior, motif family, or sparse feature can be traced to groups of pretraining or fine-tuning data rather than merely to nearby training examples in representation space. The use case is provenance and memory, not localization: it distinguishes “this feature resembles sequences from clade X” from “removing training group X changes the feature or prediction.”

Implemented, adapted precedent, and proposed components: implemented today are the released checkpoints and the distinction between expression-model outputs and Shorkie_LM outputs. What is not implemented, and may not be available, are exact pretraining manifests, optimizer trajectories, checkpoint ladders, and reproducible retraining hooks. Adapted precedent comes from influence functions in [Koh and Liang 2017](https://proceedings.mlr.press/v70/koh17a.html), TracIn in [Pruthi et al. 2020](https://arxiv.org/abs/2002.08484), datamodels in [Ilyas et al. 2022](https://proceedings.mlr.press/v162/ilyas22a.html), TRAK in [Park et al. 2023](https://proceedings.mlr.press/v202/park23c.html), and their limitations in [Basu et al. 2021](https://arxiv.org/abs/2006.14651), [Grosse et al. 2023](https://arxiv.org/abs/2308.03296), and [Dai and Gifford 2026](https://doi.org/10.1038/s41467-026-75667-5). The genuinely proposed component is group-level provenance from fungal pretraining blocks or orthology clusters to Shorkie_LM motifs, expression outputs, and causally validated sparse features, with an explicit pretraining-versus-fine-tuning separation.

Rationale and intuition: sequence models often show nearest-neighbor effects or representation similarity that look like “memory,” but retrieval similarity is not causal provenance. In Shorkie this distinction matters because phylogenetic signal is rich and easy to mistake for learning provenance. If a promoter feature is genuinely supported by certain orthology groups or species blocks in pretraining, then removing or reweighting those groups should change the feature or downstream scalar more than matched random removals do. If the needed artifacts do not exist, the honest answer is that provenance is currently untestable.

Testable hypothesis: conditional on exact training manifests, checkpoints, and reproducible retraining, group-level attribution methods will identify pretraining or fine-tuning data groups whose removal or upweighting changes masked-LM motif behavior, sparse-feature activation, or expression scalar `g` more than matched random groups and more than simple nearest-neighbor baselines.

Exact Shorkie scalar/tensor target: define three levels: masked-base Shorkie_LM loss or information content for one motif or locus; one frozen internal feature activation from Proposal 6 or Proposal 7; and the expression-model scalar `g(x; R, T)` after fine-tuning. Provenance is always attached to one of these targets explicitly.

Intervention/perturbation: first screen candidate data groups with TRAK-, TracIn-, or influence-style approximations over genome blocks or orthology clusters. Then perform actual retraining or checkpoint-branch experiments that remove, upweight, or downweight top groups, matched random groups, and nearest-neighbor groups. Compare effects separately for pretraining and fine-tuning.

Baselines and matched controls: nearest-neighbor retrieval in embedding space, random groups matched on species composition and sequence length, gradient-similarity baselines, and null targets unrelated to the claimed motif or feature. If retraining is impossible, limit work to similarity analyses and label them “not data attribution.”

Strand/RC treatment: provenance is attached to physical sequences, so forward/RC are not independent training examples. However, when the target is an orientation-sensitive internal feature or scalar effect, provenance scoring should still report whether the behavior being attributed is stable across both orientations in evaluation.

Experimental steps/pseudocode:

1. Run an availability gate on manifests, checkpoints, and retraining reproducibility.
2. If the gate fails, stop and report provenance as untestable.
3. If it passes, define group units for pretraining and fine-tuning separately.
4. Screen group influence on LM targets, internal features, and expression scalars.
5. Retrain after removing or reweighting top and matched-random groups.
6. Compare target changes and feature lineage across conditions.

Quantitative metrics: influence-score rank correlation with actual retraining effects, effect-size gap between top-attributed and matched-random groups, stability across folds, and concordance between provenance for LM targets, internal features, and expression targets. Report compute-normalized precision because retraining is expensive.

Uncertainty/seed/fold robustness: retraining itself introduces noise, so repeated retrains or checkpoint branches are needed for any strong statement. Group-level rather than individual-example claims should be the default because individual attribution is especially fragile at scale.

Compute/data/storage estimate or formula: screening is roughly `O(N_groups * p)` projected-gradient storage for TRAK-like methods, but decisive validation cost is measured in full or partial training reruns. This card is therefore far costlier than the others and should not start unless the artifact gate passes.

Wet-lab bridge where applicable: none directly. The value is interpretive: it may explain why certain species- or motif-linked features exist, but it does not itself create a better biological intervention target.

Failure modes: unavailable artifacts; conflating retrieval with provenance; training nondeterminism larger than the measured effect; and provenance groups that are so coarse they become biologically uninformative. Another failure mode is claiming one sequence “taught” a feature without retraining evidence.

Explicit stop/go gates: immediate stop if exact manifests, checkpoints, and reproducible retraining are unavailable. Go only if top-group removal or upweight retraining beats matched random and similarity baselines on the locked target family.

Dependencies: Proposal 6 and Proposal 7 if the target is a sparse feature or circuit. Otherwise independent. It should not block the rest of the portfolio.

Evidence/novelty boundary: influence-style data attribution is adapted precedent. The novelty is only the Shorkie-specific, group-level provenance design across pretraining, fine-tuning, LM behavior, and expression-model features. Without retraining artifacts, this proposal should end in a principled stop condition.

Expected outputs: either a stopped card documenting artifact unavailability, or a provenance report relating data groups to LM motifs, expression outputs, and validated sparse features with clear separation between similarity evidence and causal retraining evidence.

### Proposal 9 — Phylogenetic circuit tomography

Decision/use case: this card asks how species conditioning changes internal mechanisms, not just output curves, when the same physical promoter is scored under the 165-species input channel. Its use case is to distinguish conserved from clade-specific routes in the expression model while resisting the temptation to call species swapping “evolution” or “ancestral reconstruction.”

Implemented, adapted precedent, and proposed components: implemented today is the released species one-hot sweep that keeps DNA fixed and swaps species identity at the output level. Adapted precedent comes from species-aware DNA modeling in [Karollus et al. 2024](https://doi.org/10.1186/s13059-024-03221-x) and from the general internal-tooling stack built by Proposals 5 through 7. The proposed element is tomography over internal paths and RC-paired sparse features, aligned to a predeclared phylogeny and checked against real-sequence controls from each clade. The novelty is not species swapping itself, which already exists.

Rationale and intuition: an output sweep can tell us that species conditioning matters for one locus, but it cannot tell us whether the shift happens by changing motif salience in early convolutional stages, by rerouting through bottleneck features, or by altering skip-mediated decoder assembly. Because the species channel is explicit in Shorkie, this is one of the few places where regulatory-evolution questions can be tied to internal computations. But fixed `S. cerevisiae` DNA plus another species label is potentially out of distribution, so the internal story must be anchored by controls.

Testable hypothesis: for selected orthologous promoter families, species-channel interventions will produce reproducible changes in specific traced paths or sparse features, and those changes will correlate with phylogenetic distance or clade membership more strongly than shuffled-species controls do, while remaining interpretable against real-sequence comparisons from those species.

Exact Shorkie scalar/tensor target: the primary scalar is either `g(x; R_ortholog, T_group | s)` for one fixed physical DNA sequence under species label `s`, or a contrast to the `S. cerevisiae` species label. Internal targets are traced recovery maps or sparse-feature activations measured under those species interventions and mapped to the same promoter coordinates.

Intervention/perturbation: run species swaps across all 165 labels for fixed DNA and for matched real ortholog promoters. For selected loci, repeat Proposal 5 tracing and Proposal 6/7 feature analyses under each species label or representative clade subset. Compare within-sequence species swaps, within-species real-sequence controls, and ortholog-aligned sequence-plus-species changes.

Baselines and matched controls: shuffled species labels, distance-matched random clades, non-ortholog promoter controls, simple output-only species sweeps, and OOD diagnostics such as LM likelihood or predictive confidence. Controls should explicitly test whether the internal shift is larger than what would be expected from label perturbation alone.

Strand/RC treatment: species identity is invariant under RC, but coordinate-bearing internals are not. Therefore every species condition is run on both orientations with mapped-back feature and tracing outputs before any phylogenetic summary is computed.

Experimental steps/pseudocode:

1. Choose orthologous promoter families and a reference phylogeny.
2. Score fixed-DNA species sweeps at the output level.
3. For selected loci, compute tracing and sparse-feature summaries under representative species labels.
4. Compare internal shifts to phylogenetic distance, clade labels, and real-sequence controls.
5. Retain only route changes that replicate across orthologs or promoter families.

Quantitative metrics: output-effect curves over species, path- or feature-turnover statistics, correlation with phylogenetic distance, clade-separation scores, OOD rates, and exact motif-edit transfer consistency across species conditions. Also measure whether the same internal route changes appear in matched ortholog promoters.

Uncertainty/seed/fold robustness: species tomography is especially vulnerable to OOD artifacts, so report fold variation, strand variation, and confidence diagnostics for every label. A clade-level story should not rely on one species or one ortholog family.

Compute/data/storage estimate or formula: cost is `N_loci * N_species_or_clades * (output + internal analyses) * F * 2`. Full 165-way tracing is expensive, so screen first with output sweeps, then trace only informative clades or loci. Storage stays manageable if only summaries for the internal stage analyses are retained.

Wet-lab bridge where applicable: where fungal systems and promoter assays are practical, one can test a small set of cross-species promoter constructs or reciprocal motif swaps. The wet-lab bridge is optional and later-stage because many species may not be equally tractable.

Failure modes: OOD species-label swaps on fixed DNA; phylogenetic correlation driven by simple output scale rather than mechanism; sparse features that reflect species-conditional nuisance effects; and overinterpreting one species axis as actual evolutionary history.

Explicit stop/go gates: go only if species-swap effects exceed shuffled-label and distance-matched nulls, replicate on real ortholog controls, and survive OOD diagnostics. Stop if fixed-DNA species swaps are too out of distribution to support internal claims.

Dependencies: Proposal 5 through Proposal 7 provide the internal machinery. Proposal 1 and Proposal 4 provide robustness and faithfulness checks.

Evidence/novelty boundary: output-level species sweeps are already implemented and species-aware DNA modeling exists. The novelty is internal tomography of path and feature changes under species conditioning, not the existence of species-conditioned predictions.

Expected outputs: a phylogenetic route atlas showing conserved and clade-specific internal shifts, an OOD-aware control report, and either a small validated set of species-sensitive circuits or a negative result limiting interpretation to output-level sweeps.

### Proposal 10 — Dynamic regulatory circuit atlas

Decision/use case: this card asks how Shorkie reuses or changes internal routes across discrete time and condition track groups. Its use case is to move beyond “early versus late gradients” into task-conditioned internal comparisons, while staying honest that Shorkie predicts discrete track groups rather than continuous mechanistic time.

Implemented, adapted precedent, and proposed components: implemented today are the time/condition track groups themselves and current analyses that compare early and late gradients or group means. Adapted precedent comes from task-conditioned attribution and motif analysis in genomic models, including [Linder et al. 2025](https://doi.org/10.1038/s41588-024-02053-6), and from the tracing and sparse-feature methods adapted in Proposals 5 through 7. The proposed component is a circuit atlas over declared track sets and contrasts, not a claim of continuous-time dynamics or experimentally observed regulatory trajectories.

Rationale and intuition: two track groups can differ in output amplitude while sharing the same internal route, or they can have similar amplitudes but different routes. A model that predicts many induction and strain-response tracks is unusually well suited for internal task comparisons, provided the scalar and contrast definitions are locked in advance. The danger is overreading minute labels as literal dynamical mechanisms when the model only sees sequence plus species, not a causal time axis in the cell.

Testable hypothesis: for some promoter classes and regulators, discrete condition or time-group contrasts will map to reproducible differences in traced routes or sparse-feature usage, and these route differences will predict exact motif edits or held-out regulator responses better than output curves alone do.

Exact Shorkie scalar/tensor target: use declared contrasts such as `g(x; R_gene, T_early) - g(x; R_gene, T_late)` or `g(x; R_gene, T_regA) - g(x; R_gene, T_regB)`. Internal targets are tracing surfaces or sparse-feature activations conditioned on those same task groups, always reduced back to the declared scalar family.

Intervention/perturbation: choose representative loci for each condition or regulator class, compute exact motif edits and tracing/feature summaries for each task group, and compare route changes across tasks. Incorporate conditional motif discovery from Proposal 3 where useful, but keep the task definitions fixed rather than letting motifs define the groups.

Baselines and matched controls: output-only comparisons, pooled-across-task explanations, random regroupings of tracks, and loci matched on baseline expression but not on condition-specific response. Include neutral motifs and matched decoys to test whether apparent condition-specific routes survive exact edits.

Strand/RC treatment: all task-group analyses are run forward and RC separately, with mapped-back route or feature summaries before cross-condition comparison. A condition effect that appears only in one orientation is a robustness failure, not a dynamic discovery.

Experimental steps/pseudocode:

1. Define discrete task groups and contrasts.
2. Screen loci with output contrasts and exact edit sensitivity.
3. For selected loci, run tracing and sparse-feature analyses per task group.
4. Cluster loci by route-change pattern and validate clusters on held-out genes or regulators.
5. Connect route differences to exact motif edits and, where relevant, conditional motifs from Proposal 3.

Quantitative metrics: contrast-effect preservation under exact edits, route-difference effect sizes, task-conditioned feature-selection frequencies, held-out regulator generalization, and cluster stability across folds and strands. Compare whether route labels predict task identity beyond simple output amplitude.

Uncertainty/seed/fold robustness: condition-specific route claims need fold replication and held-out regulator validation. If track groups are noisy or unbalanced, use bootstrap intervals and avoid overfitting one regulator family. A dynamic atlas should carry uncertainty at both the output-contrast and route-comparison levels.

Compute/data/storage estimate or formula: roughly `N_loci * N_task_groups_or_contrasts * (exact edits + tracing/feature analyses) * F * 2`. This can be reduced by screening with output contrasts first and tracing only the most informative loci.

Wet-lab bridge where applicable: the natural wet-lab escalation is time-course or condition-specific reporter and endogenous-expression assays for a small set of promoters and motif edits whose route differences are strongest. The assay must match the modeled condition closely; otherwise failure is uninterpretable.

Failure modes: confusing discrete task groups with continuous dynamics; route differences that simply reflect amplitude scaling; poor track grouping; and causal interpretations that outrun the model’s purely sequence-based conditioning.

Explicit stop/go gates: go only if route differences replicate across folds, survive exact motif-edit validation, and generalize to held-out genes or regulators. Stop if output amplitude alone explains the effect or if route labels are unstable across orientations or folds.

Dependencies: Proposal 3 can help with task-specific motif hypotheses, while Proposal 5 through Proposal 7 provide the internal machinery. Proposal 1 and Proposal 4 remain mandatory gates.

Evidence/novelty boundary: early/late attribution and task-specific genomic interpretation are adapted precedent, and Shorkie already exposes relevant track groups. The novelty is a condition-indexed internal atlas of routes and sparse features, not the existence of temporal track labels themselves.

Expected outputs: a discrete task-by-route atlas, validated condition-specific motif or feature hypotheses, and an explicit statement of which differences are route-specific versus mere output-scaling effects.

### Proposal 11 — Exact higher-order grammar benchmark

Decision/use case: this card decides whether interaction attributions, spacing claims, and circuit hypotheses actually predict finite combinatorial sequence effects. Its use case is to upgrade Shorkie’s already implemented HVP, spacing, and motif-knockout machinery from interesting analyses into a decisive benchmark for grammar claims.

Implemented, adapted precedent, and proposed components: implemented today are targeted HVP-based second-order analyses, motif spacing/orientation sweeps, motif knockout, and exact single-base mutagenesis. Adapted precedent comes from Integrated Hessians in [Janizek, Sturmfels, and Lee, JMLR 22(104), 2021](https://www.jmlr.org/papers/v22/20-1223.html), genomic interaction work such as [Greenside et al. 2018](https://doi.org/10.1093/bioinformatics/bty575), GIA in [Koo et al. 2021](https://doi.org/10.1371/journal.pcbi.1008925), and experimental saturation-mutagenesis precedents such as [Patwardhan et al. 2009](https://doi.org/10.1038/nbt.1589). **Executed at pair order on single bases; higher orders and branch mediation remain proposed.** `make_grammar.py` and `shorkieGrammar.json` enumerate every double substitution over a locked per-locus panel — half the strongest bases by mutagenesis, half matched on distance to TSS — rc-averaged, and take the inclusion–exclusion residual as the measured interaction. Singles are recomputed in the same run so both terms of the subtraction share a convention, and their agreement with the shipped mutagenesis planes is a free correctness check on the whole path. The released Hessian panel is calibrated against those residuals, alongside an additive null that predicts exactly zero and a separation-only predictor. This is deliberately a calibration and not a spacing scan: the separations are wherever the strong bases happen to be, so no periodicity claim can be read off them, and the constructive spacing sweep remains where that question belongs. **The released Hessian panel does not calibrate.** Over 39,330 exact double substitutions across 23 loci its median correlation with the measured inclusion–exclusion residual is **-0.0843** (range -0.3223 to 0.6826, positive at only 8 of 23 loci), while separation alone reaches **0.3227** and is positive at every locus, and the summed magnitude of the two single effects does better still. The pipeline is not the failure: the singles recomputed inside this benchmark reproduce the shipped mutagenesis planes to **0.0**, so both terms of the subtraction share a convention exactly. Interactions are real but small — a median residual of 0.051× a median single-base effect — and a second derivative evaluated at the reference one-hot does not point at them, which is what the card was designed to be able to find. The consequence for released copy is that the second-order panel must be read as the local curvature map it computes and not as a prediction about combined edits. One methodological note worth carrying: a single-locus probe of this same benchmark on 90 pairs gave r = +0.79, and the full grid gives -0.0843; a correlation measured on one locus is not the correlation. **The failure is unanimous across checkpoints.** Under all eight folds the Hessian's correlation with the measured residual is positive in **0 of 8** (-0.112, -0.169, -0.172, -0.028, -0.058, -0.081, -0.021, -0.000) and separation alone beats it in **8 of 8**, so this is a property of the second-order estimator rather than of the checkpoint the page runs. The fold arm uses a reduced panel (10 positions a locus against the headline's 20, 9,315 pairs a fold) because the fold question is whether the sign survives; the panel size is recorded in the pack so the provenance travels with the numbers. Higher-order edits, motif-level rather than base-level pairs, and branch-specific mediation are not executed.

Rationale and intuition: pairwise HVPs can flag where nonlinearity might live, but a second derivative is not the same thing as a discrete double edit. Likewise, spacing sweeps on synthetic insertions are informative but do not prove that the learned interaction survives at endogenous motif instances or in higher-order combinations. If Shorkie is going to make grammar claims, it should prove that its interaction predictors calibrate to exact finite differences on a locked combinatorial benchmark.

Testable hypothesis: exact factorial edits over selected motif sets will reveal reproducible non-additive interaction residuals, and the best interaction predictors from HVPs, EAP-style graphs, or spacing heuristics will calibrate to those residuals significantly better than matched nulls and simple additive baselines do.

Exact Shorkie scalar/tensor target: choose one declared scalar `g(x; R, T)` per benchmark family. The discrete target is the exact finite-difference table over all selected edit subsets for one promoter context. Internal targets are optional mediation summaries showing how much of the interaction is routed through main versus skip branches.

Intervention/perturbation: select motifs or bases from existing exact ISM and motif analyses, then enumerate all single and pair edits and a manageable set of triple or quadruple edits within locked windows. Use exact substitutions, composition-preserving motif scrambles, and endogenous-context motif swaps. For each combination, run both forward and RC evaluations and compare to HVP or graph-predicted interactions.

Baselines and matched controls: position-matched neutral edits, composition-matched motif decoys, additive approximations from single edits, random interaction predictors, and synthetic backgrounds where the true grammar is known. Spacing-only heuristics should be treated as baselines, not defaults.

Strand/RC treatment: every edit subset is mirrored and complemented on the RC run, with all results mapped back to the same physical coordinate system before interaction residuals are computed. Interaction sign that depends on orientation after mapping is a failure, not a subtle success.

Experimental steps/pseudocode:

1. Choose promoter contexts and motif sets from exact single-edit analyses.
2. Enumerate exact edit subsets up to the allowed order.
3. Compute finite-difference effects for every subset on both strands and folds.
4. Derive Möbius or inclusion-exclusion interaction residuals.
5. Compare residuals to HVP, spacing, and circuit predictions.
6. For selected cases, partition mediation by main and skip branches using Proposal 5 or Proposal 7 tools.

Quantitative metrics: interaction residual magnitude, sign consistency across contexts, calibration of HVP or graph scores to exact residuals, context-transfer accuracy, top-k discovery precision for true non-additive pairs, and branch-mediated fractions for interactions that replicate.

Uncertainty/seed/fold robustness: because combinatorial costs rise quickly, benchmark panels must be small but replicated across contexts. Report fold-wise and strand-wise agreement and avoid claiming a general grammar from one promoter or one motif family.

Compute/data/storage estimate or formula: exact pair cost is `9 * choose(P, 2)` substitutions for `P` selected bases, multiplied by contexts, folds, and strands; higher orders grow combinatorially. This is why the benchmark should focus on selected motifs and contexts rather than genome-wide brute force.

Wet-lab bridge where applicable: the natural escalation is promoter-tile MPRA or individual reporter assays carrying the same single, double, and selected triple edits. Because the benchmark already uses endogenous-context motifs, it translates well into assay design.

Failure modes: combinatorial explosion; context-specific interactions that do not generalize; HVPs that look predictive only because they track one strong single-edit effect; and mediated interactions that differ across branches in ways the benchmark panel is too small to resolve.

Explicit stop/go gates: go only if exact interaction residuals reproduce across contexts, exceed composition- and position-matched nulls, and predicted interactions calibrate to finite differences before any scaling-up claim. Stop if HVP or circuit predictors fail calibration or if interactions vanish outside one synthetic context.

Dependencies: Proposal 4 for faithfulness criteria and Proposal 5 through Proposal 7 for internal mediation analyses. Proposal 3 can nominate motifs, but this card validates them.

Evidence/novelty boundary: interaction methods, HVPs, GIA, and spacing tests are adapted precedent. The novelty is the exact factorial benchmark tying discrete sequence edits to internal branch mediation in Shorkie’s expression model. Existing HVP and spacing analyses must be described as implemented foundations, not as new inventions.

Expected outputs: benchmark panels of exact interaction effects, calibration reports for interaction predictors, a shortlist of credible grammar cases for wet-lab follow-up, and clear negative findings where approximate interaction scores do not survive exact combinatorial testing.

### Proposal 12 — Ensemble-aware constrained design

Decision/use case: this card decides when Shorkie can be used to propose small promoter edits that are robust enough to justify synthesis or wet-lab escalation. Its use case is constrained design under uncertainty, not open-ended sequence generation: the aim is to modify a declared regulatory interval while preserving broad plausibility and avoiding off-target behavior across the full expression output.

Implemented, adapted precedent, and proposed components: implemented today is a greedy counterfactual-design pipeline that proposes base substitutions using gradients and exact forward verification, plus a Shorkie_LM model that can score sequence plausibility. Adapted precedent comes from genomic edit design in [Ledidi](https://doi.org/10.1101/2020.05.21.109686), [Fast SeqProp](https://doi.org/10.1186/s12859-021-04437-5), differentiable sequence design and engineering in [Bogard et al. 2019](https://doi.org/10.1016/j.cell.2019.04.046), [Gosai et al. 2024](https://doi.org/10.1038/s41586-024-08070-z), and [Vaishnav et al. 2022](https://doi.org/10.1038/s41586-022-04506-6), plus counterfactual-recourse principles in [Karimi et al. 2021](https://arxiv.org/abs/2002.06278). The genuinely proposed component is a Shorkie-specific robust objective that requires fold consensus, RC robustness, full-output locality, LM plausibility, and post-design circuit audit before synthesis. Weight editing is explicitly out of scope.

Rationale and intuition: current greedy design can find exact model-improving edits, but a design that works only in one fold or one orientation is not ready for biology. Likewise, a sequence that boosts one target track by breaking many unrelated outputs or by exploiting a narrow architectural shortcut is a poor candidate even if the target scalar improves. The right design objective is therefore not a single predicted gain but a robust lower-confidence-bound gain subject to sequence, output, and mechanistic constraints.

Testable hypothesis: sequence edits optimized for fold consensus and RC robustness, regularized by Shorkie_LM plausibility and audited against off-target outputs and inferred circuits, will transfer better to held-out folds and exact reversion tests than equal-budget greedy, random, or unconstrained optimization baselines.

Exact Shorkie scalar/tensor target: the primary target is a robust objective based on the expression-model scalar, for example the lower confidence bound of `g(x_edit; R, T_target) - g(x_ref; R, T_target)` across folds and strands. Secondary penalties act on all 5,215 output tracks, edit count, protected coding or splice sequence, and LM negative log-likelihood. Shorkie_LM is only a plausibility prior, not the optimized endpoint.

Intervention/perturbation: optimize discrete edits within one declared interval using greedy search, beam search, Ledidi-style relaxed optimization, or Fast SeqProp-style methods, but rescore every candidate exactly on each fold and each orientation with mirrored bins. After selecting a candidate, revert each edit alone and in combinations, run local ISM, and patch or ablate the proposed circuit to test whether the design used the intended route.

Baselines and matched controls: equal-budget greedy search, random edit sets, motif-rational manual designs, unconstrained differentiable optimization, and designs optimized without LM or off-target penalties. Include neutral edits matched on position and nucleotide change, as well as rational designs based only on known motifs.

Strand/RC treatment: maintain tied physical edits across forward and RC encodings during optimization, and penalize strand disagreement directly rather than optimizing only an averaged hidden state. Final acceptance requires effect persistence under exact forward and RC evaluation after mapping back.

Experimental steps/pseudocode:

1. Lock target interval, target scalar, off-target penalties, and protected constraints.
2. Run several design algorithms with equal oracle budgets.
3. Exact-rescore every candidate across folds and orientations.
4. Select Pareto-optimal candidates on target gain, uncertainty, edit count, and locality.
5. Perform edit reversion, combination tests, local ISM, and circuit audit.
6. Escalate only the candidates that survive all robustness and mechanism checks.

Quantitative metrics: robust target gain, fold/strand variance, off-target burden over all 5,215 tracks, edit count, LM plausibility penalty, success under reversion tests, transfer to held-out folds, and eventual assay success rate if wet-lab work occurs. Also compare search efficiency in oracle calls.

Uncertainty/seed/fold robustness: by design this card depends on Proposal 1. Report the full cross-fold and cross-strand distribution of candidate effects. A design should be rejected if one edit carries the whole gain in only one fold or if the confidence interval crosses zero after exact rescoring.

Compute/data/storage estimate or formula: total cost is roughly `F * 2 * restarts * samples * steps` oracle evaluations, plus exact full-output rescoring and post hoc reversion checks. Storage is minimal because only candidate logs and final full-output audits need to be retained.

Wet-lab bridge where applicable: this is the main wet-lab handoff card. Candidates that pass computational gates can enter promoter-tile MPRA first, then individual reporter assays, then endogenous edits if the target system is tractable. The bridge should insist on exact assay-condition matching and reciprocal reversion controls.

Failure modes: adversarial designs that exploit model blind spots; off-target changes hidden by a scalarized objective; LM penalties that reward generic sequence rather than functional plausibility; and designs whose inferred mechanism disappears under circuit audit. Another failure mode is confusing successful model editing with successful biological design.

Explicit stop/go gates: go to synthesis or wet-lab escalation only if the design beats equal-budget baselines, remains effective across folds and both orientations, shows acceptable full-output locality, survives edit-reversion and combination tests, and passes circuit-mechanism audit. Stop if robustness or locality fails at any of those checkpoints.

Dependencies: Proposal 1 and Proposal 4 are mandatory. Proposal 5 through Proposal 7 improve mechanistic audit, and Proposal 11 improves higher-order edit checking. This card should come last because it compounds model, explanation, and design uncertainty.

Evidence/novelty boundary: genomic counterfactual optimization and differentiable design are adapted precedent, as are uncertainty-aware counterfactual ideas. The novelty is Shorkie-specific robust design over folds and RC orientations with full-output locality and circuit audit. Existing greedy counterfactual design is an implemented starting point, not the final proposal.

Expected outputs: a ranked candidate-edit set with robust exact rescoring, mechanism-audit reports, off-target summaries over all outputs, and a strict recommendation either to escalate a small number of designs to assay or to stop because computational robustness is inadequate.

Dependency grouping: Group A, the reliability foundation, is Proposal 1, Proposal 2, and Proposal 4, with Proposal 3 optionally joining once references are under control. Group B, the internal-mechanism layer, is Proposal 5 and Proposal 6, which can proceed in parallel after Group A. Group C is Proposal 7, which depends on trustworthy tracing or features. Group D is Proposal 8, which is conditional and should terminate immediately if manifests, checkpoints, or reproducible retraining are unavailable. Group E is Proposal 9 and Proposal 10, which extend already implemented species and task axes only after Group B or C yields validated internals. Group F is Proposal 11, the exact grammar validator, which should test hypotheses coming from motifs, tracing, or circuits. Group G is Proposal 12, the final design card, because it should consume the strongest outputs of the earlier gates rather than substitute for them.

## Validation, execution, and evidence registry

This section turns the preceding taxonomy and proposal portfolio into an execution and evidence contract. Throughout, “Shorkie” means one frozen checkpoint, one frozen scalar target, one frozen coordinate convention, and one frozen data split at a time. The released patching, two-width compact-motif, and expanded SAE artifacts are treated as methods under evaluation rather than as validated evidence; committing and deploying those computations does not satisfy their fold, strand, causal, or biological validation gates.

## 1. Explicit six-level validation ladder

The core mistake in sequence-model interpretation is to collapse several different questions into one picture. A map can be numerically correct but biologically untested. A perturbation can change the frozen model but fail in a reporter. A reporter can validate cis activity while still missing endogenous chromatin or trans effects. For that reason the ladder below is not cosmetic. It is the contract that separates descriptive model analysis from causal biological claims.

Before any level begins, the team must freeze the estimand. That means recording the exact checkpoint hash, input sequence and orientation, species channel, target bins, target track set, aggregation rule, transform, and whether any reverse-complement averaging is part of the function itself or only part of the report. For Shorkie, a typical scalar target is a declared function of the form

\[
g(x;R,T)=\log_2\!\left(1+\sum_{b\in R}\frac{1}{|T|}\sum_{t\in T}y_{b,t}(x)\right),
\]

where `R` is a fixed output-bin interval and `T` is a fixed track subset. Every explanation, perturbation, calibration result, and experimental escalation must cite that same `R,T` pair. If the target changes, the claim resets.

| Level | Question answered | Minimum evidence | Primary metrics | Required controls | Stop / go rule | Strongest permitted claim |
|---|---|---|---|---|---|---|
| 0. Prediction | Does the scalar prediction itself generalize? | held-out prediction superiority over simple baselines | Pearson/Spearman, deviance or MSE, calibration slope/intercept, interval coverage | GC/TSS-distance, k-mer/PWM, track-mean baselines | Stop if the target does not beat simple baselines or calibration collapses | “The frozen model predicts this scalar better than baseline under this split.” |
| 1. Numerical correctness | Was the explanation or perturbation computed as intended? | deterministic parity checks against direct forwards and completeness identities | allele finite-difference parity, IG completeness residual, coordinate parity, reproducibility hash | sign/indexing checks, forward/RC remapping checks, rerun identity | Stop on sign bugs, coordinate drift, or unresolved completeness failures | “This quantity was computed correctly for the stated model function.” |
| 2. Model faithfulness | Do highlighted bases or motifs actually change the frozen model output? | exact or matched intervention tests | deletion/insertion gain, exact ISM agreement, infidelity, sufficiency/comprehensiveness, synthetic-ground-truth recovery | randomization, shuffled matched windows, neutral edits, output-head positive controls | Stop if top-ranked features do not outperform matched controls | “These bases or motifs affect the frozen model’s prediction.” |
| 3. Robustness and uncertainty | Is the result stable across nuisance choices and training variation? | variation ledger across strand, seed, fold, baseline, and method | rank correlation, ICC, top-k Jaccard, sign agreement, interval width/coverage | RC remap, multi-seed or multi-fold retrains, baseline families, null loci | Stop if sign or ranking is unstable or interval coverage fails | “This model effect is stable across the tested modeling choices.” |
| 4. External regulatory association | Does the model effect align with independent assays? | held-out occupancy, variant, eQTL/ASE, MPRA, or orthogonal functional data | sign accuracy, effect correlation, AUPRC at assay FDR, enrichment over matched nulls | leakage audit, GC/distance/context matching, batch controls | Stop if the top calls do not beat matched independent negatives | “This model effect is associated with independent regulatory evidence in matched contexts.” |
| 5. Endogenous and rescue causality | Does the predicted base or motif causally alter an endogenous readout by the proposed mechanism? | isogenic edit plus rescue or orthogonal mechanistic confirmation | clone-consistent effect size, replicate q-value, rescue reversal, occupancy-plus-expression concordance | non-targeting, safe-harbor, weak-ISM, motif-scramble, clone, and assay controls | Only go when the endogenous and rescue results agree with preregistered direction | “This base or motif causally changes the tested endogenous readout in this strain and condition.” |

The ladder is deliberately asymmetric. One can move down only by failure or by making a weaker claim. One cannot jump upward because a plot looks convincing. The default posture is conservative: attention visualization, SAE feature labels, probe scores, motif logos, or circuit diagrams live below endogenous causality until they survive the relevant interventions and independent assays [PR23, PR33, PR36-PR41, PR88-PR100, PP12-PP14].

### Level 0: prediction validity is the gate on everything else

Interpretability work has no standing if the prediction target is itself weak or badly calibrated. Level 0 therefore asks whether the frozen scalar generalizes on biologically independent splits and whether uncertainty estimates are honest enough to decide what not to trust. The minimal split should be chromosome-disjoint; for cross-species or multi-strain settings it should also be orthology-, strain-, or condition-disjoint where available. Random base or window splits are inadequate because they leak motif content, promoter family structure, and local sequence context [PR57-PR60, BR02].

Prediction quality should be reported at the same scalar that downstream interpretation uses. If the public curve summarizes thousands of tracks but the explanation targets only a `_T0_` subset, those are two different estimands and must be validated separately. Metrics should include correlation and an error metric matched to the head, plus calibration slope and intercept, and empirical coverage of the chosen interval method. The interval method can be deep ensembles, calibrated regression, conformalized quantile regression, jackknife+, or a distilled uncertainty model, but the report must name the exchangeability assumptions it is relying on [PR48-PR54, PR62].

Positive controls at Level 0 are straightforward: a model trained on true labels should outperform a track mean, GC/TSS-distance regression, and a k-mer or PWM baseline. Negative controls are equally important: label permutation, track permutation when meaningful, and historical baselines carried forward unchanged. A model that cannot beat these should not proceed to saliency, because the most likely explanation is that the target itself is not learned well enough to interpret.

The go gate is deliberately boring: the model must clearly beat the declared baselines on the declared split and must not show catastrophic undercoverage in the subgroups that matter for escalation. For a 90% interval, empirical coverage below 85% overall or severe subgroup collapse should force abstention or recalibration before any interpretive claims are escalated.

### Level 1: numerical correctness

Level 1 does not test biological truth. It tests whether the number on the page is really the number the method claims to compute. This is where explanation projects often fail silently: wrong strand remapping, wrong output bins, wrong alternate-base indexing, averaged heads mislabeled as individual heads, or internal displays that summarize different tensors than the prose implies. The [Shorkie current-state inventory](./shorkie_existing_interpretability_methods.md) documents exactly these hazards in the current ecosystem, especially around attention and head semantics.

For single-base ISM, every stored alternate effect should match a direct forward pass on the edited sequence. For IG, completeness residuals should be reported, and the baseline family must be explicit rather than hidden inside a code path. For gradient-based methods on one-hot DNA, the per-position nucleotide-channel mean correction must be applied before observed-base or hypothetical scores are interpreted; otherwise one can visualize a component that is orthogonal to the simplex of valid DNA edits [PR20]. For attention or rollout, the implementation must say whether it is head-specific, layer-averaged, path-averaged, or synthetic fallback. If a panel falls back to a heuristic matrix, that panel is unavailable for scientific use, not “close enough.”

The key Level 1 controls are deterministic. They include rerun identity on fixed seeds, coordinate round-trips through reverse complements, sign parity tests on direct allele swaps, output-index audits, and manifest hashes for all derived packs. If a method is approximate, the approximation error belongs in the artifact, not just in developer memory. For example, 32-step IG is acceptable only if completeness residuals and step count are shipped with the result; a quantized PNG is acceptable only if the raw values, quantization scale, and checksum are retained separately.

The stop rule is strict. Any unresolved sign inversion, coordinate drift, incorrect “head” label, or explanation that fails its own identity check blocks escalation. It is cheaper to stop here than to run a wet-lab validation on a UI bug.

### Level 2: model faithfulness

Level 2 asks the first genuinely causal question, but only about the frozen model: if the method highlights a base, motif, or internal state, does perturbing that object move the target in the predicted direction? This is where exact interventions dominate descriptive maps. Single-base ISM, matched deletions, motif insertions, and exact activation patches carry more evidential weight than the visual sharpness of a gradient or logo [PR24-PR35, PR88-PR95].

Deletion and insertion tests should be matched to realistic nulls. Scrambling or masking the top `k` percent of bases is acceptable only if every edit is paired with many GC-, length-, position-, and context-matched random windows. Otherwise a method can look faithful simply because any promoter edit is disruptive. Likewise, insertion should compare ordered restoration against matched reverse order and random order from the same background family. The summary metric should not be the raw curve alone but the area between the top-ranked and matched-random curves with locus-bootstrap intervals.

Infidelity and sensitivity help quantify local explanation quality, but they are not substitutes for exact edits. A stable but uninformative map can score well on some sensitivity criteria, and a faithful map can still perform poorly if the perturbation distribution is unrealistic [PR24-PR28]. For Shorkie, exact ISM remains the best local reference for DNA-level faithfulness. Faster approximations may be useful, but they must be benchmarked against brute-force ISM on sampled loci before they are trusted in bulk [PR29-PR31].

Synthetic ground truth should be used as a calibration device, not as a biological victory lap. A useful benchmark plants motifs with known additive, saturating, suppressive, and cooperative rules; includes confounders such as poly(dA:dT), GC, or decoy motifs; and measures base- and motif-level recovery, interaction sign recovery, and calibration from predicted importance to actual finite-difference effect [PR60-PR61]. This is especially important for higher-order grammar claims, because a method that cannot recover exact planted interactions has little business inferring endogenous cooperation.

Level 2 positive controls include output-head patching, known synthetic motifs, and direct edits in settings where the model clearly uses a motif. Negative controls include matched random windows, label-randomized retrains, dinucleotide shuffles, weak-ISM edits, and scrambled motifs. The go gate is that top-ranked features beat matched negatives by a preregistered margin and do so under the same scalar target that the claim names.

### Level 3: robustness, reverse complements, folds, seeds, and uncertainty

A single explanation from a single checkpoint is a measurement of one trained function, not a measurement of stable mechanism. Level 3 therefore decomposes uncertainty rather than hiding it. The minimum axes are physical strand, training seed or fold, baseline family, and explanation method. If training fold variance cannot be estimated because only one released fold is runnable, that gap must be stated explicitly rather than filled with strand variance or bootstrap confidence theater [PR48-PR56, PR61-PR62].

Reverse-complement testing is its own axis, not an optional averaging trick. Shorkie is not intrinsically reverse-complement equivariant. That means forward and reverse-complement evaluations are distinct model behaviors that must be mapped back to the same physical coordinates before any mean is reported. Median prediction discrepancy, basewise rank correlation, and sign agreement of exact edit effects should all be logged pre- and post-mapping. Systematic sign reversal is a stop condition, not a curiosity.

Seed and fold robustness should be summarized at multiple resolutions: basewise rank correlation, top-k Jaccard, motif discovery frequency, activation-patch recovery stability, and feature or circuit selection frequency. A robust feature should not merely appear once; it should recur often enough that a reasonable abstention threshold can be set. One defensible standard is that a feature or peak is considered stable only if it appears in at least 80% of tested models or folds and its signed ensemble interval excludes zero.

Prediction uncertainty and explanation uncertainty must remain separate. Prediction intervals quantify uncertainty in the scalar output; explanation intervals quantify uncertainty in the attribution or perturbation effect. The same sequence may have a narrow prediction interval and a wide attribution interval if many internal explanations are compatible with the output. This is especially important when comparing fast methods to ISM or when fitting local surrogates such as SQUID or MAVE-NN [PR34-PR35, PR48-PR54].

The go gate at Level 3 is not perfection. It is disciplined stability: no headline claim should flip sign across reasonable baselines or across the available folds, and no subgroup with severe calibration failure should be used for candidate prioritization. When instability persists, the output should move to abstention or “hypothesis only” status.

### Level 4: independent regulatory association

Level 4 asks whether the model effect aligns with evidence not used to train or tune the explanation. This includes held-out occupancy, allele-specific expression, eQTLs, natural-variant MPRAs, saturation mutagenesis, and orthogonal functional assays. None of these alone proves endogenous mechanism. Together, they tell us whether the model is at least pointing at the same biological neighborhood as the assay [PR63-PR85, PR87].

The most important design rule here is leakage control. Training overlap, post hoc assay selection, or matching failures can create spurious “validation.” Every variant, motif, or locus selected for external association testing should be logged against the model’s training data and against the explanation-tuning set. Variant comparisons need MAF-, GC-, context-, and distance-matched negatives. Occupancy enrichments need promoter- and accessibility-matched backgrounds. MPRA analyses need batch-aware statistics and replicate structure.

Yeast offers unusually strong external association resources for this ladder. The de Boer random-promoter datasets, designed-promoter assays, natural promoter-variant MPRA, eQTL panels, ChIP-chip, ChIP-exo, and curated yeast regulatory databases are directly relevant, but each speaks to a narrower claim than “causal regulation” [PR73-PR85, PR87]. A motif match plus ChIP peak plus MPRA effect is still not the same as an endogenous edited strain with rescue. It is, however, enough to prioritize what deserves a harder test.

The go gate for wet-lab escalation is that robust model calls outperform matched negatives on an independent assay and do so with preregistered directionality. If top candidates cannot beat matched independent negatives, the correct action is to reframe the method or the target, not to keep escalating more expensive experiments.

### Level 5: endogenous editing, rescue, and wet-lab escalation

Level 5 is the only rung that supports language like “causal base,” “causal motif,” or “required endogenous element,” and even then only in the tested strain, condition, and readout. The minimal endogenous design is an isogenic edit in the native locus with at least two independently derived clones per genotype, matched culture conditions, preregistered direction, and a rescue or orthogonal mechanistic confirmation. Rescue matters because it distinguishes direct sequence mechanism from clone artifacts, background compensation, or local chromatin disruption [PR68-PR71, PR78-PR83].

The endogenous ladder should usually run reporter or MPRA triage before exact genomic editing. Reporters are cheaper, higher throughput, and useful for sorting model-faithful from likely nontransportable hits. But they are not a substitute for native context. A model-supported reporter hit that disappears after endogenous editing does not “contradict” the model; it narrows the claim to construct context. Conversely, an endogenous effect without a reporter effect can indicate chromatin or promoter architecture dependence.

Positive controls at Level 5 include previously known causal variants or motifs when available, strong model-supported edits from Level 4, and rescue constructs. Negative controls include no-edit clones, safe-harbor edits, non-targeting guides, weak-ISM edits, scrambled motifs, and genotype-blinded assay handling. Growth or stress artifacts should be measured explicitly because a large expression effect tied to general fitness is not evidence for the proposed cis mechanism.

Wet-lab escalation should therefore be gated, not aspirational. A candidate moves from computation to reporter only if it passes Levels 0-4 under preregistered criteria. A candidate moves from reporter to endogenous editing only if reporter direction and magnitude are replicated and the target remains stable across model folds, strands, and matched nulls. A candidate moves from endogenous editing to a public causal claim only if the endogenous effect reproduces, rescue behaves as expected, and the orthogonal mechanistic assay agrees with the proposed direction.

### Cross-cutting stop conditions

Several failures should halt escalation no matter where they are found:

- unresolved scalar-target ambiguity;
- reverse-complement sign reversal after correct coordinate remapping;
- attention, probe, or SAE labels used as if they were direct biological mechanisms;
- faithfulness failure against exact edits;
- unstable sign across released folds or baseline families;
- calibration collapse in the subgroup that generated the candidate set;
- training-data leakage into the external validation set;
- endogenous results without rescue being oversold as mechanistic specificity.

The ladder exists to preserve the difference between “the model uses this” and “the cell uses this.” Losing that distinction is the fastest way to make the frontier look further along than it is.

## 2. Dependency-ordered execution roadmap

The roadmap should be executed in dependency order because later phases consume the uncertainty budget created by earlier ones. If the target is unstable, no amount of patching helps. If the explanation is numerically wrong, no MPRA can rescue the interpretation. If the external association set leaks training examples, endogenous follow-up becomes expensive confirmation bias. The sequence below therefore optimizes for irreversible learning, not just for feature count.

| Phase | Objective | Main outputs | Hard gate to continue |
|---|---|---|---|
| 0. Freeze and preregister | lock estimands, data splits, thresholds, and candidate-selection rules | preregistration packet, manifests, baseline roster | no unresolved target ambiguity |
| 1. Prediction and calibration | establish that the scalar is worth interpreting | baseline comparison report, calibration and abstention policy | beats simple baselines and passes subgroup coverage floor |
| 2. Numerical fidelity | verify explanation and perturbation computations | parity report, checksum manifest, RC mapping tests | no sign/index/head/completeness defects |
| 3. Faithfulness benchmark | compare attribution and perturbation methods against exact edits | exact-edit benchmark, synthetic-truth benchmark, method shortlist | top methods beat matched nulls and randomization checks |
| 4. Robustness ledger | quantify fold, seed, baseline, strand, and method variability | variance ledger, stable-feature registry, abstention thresholds | headline effects survive predeclared stability cutoffs |
| 5. External association | test against held-out functional and regulatory evidence | independent-assay scorecard, prioritized candidate set | top calls beat matched independent controls |
| 6. Wet-lab triage | test scalable reporter or MPRA transportability | reporter/MPRA results, endogenous shortlist | replicated direction and effect size in assay |
| 7. Endogenous and rescue | establish native-locus causality in context | clone-level edit report, rescue report, mechanism dossier | endogenous effect plus rescue/orthogonal confirmation |
| 8. Release governance | decide what can be shipped, claimed, and deferred | release memo, claim matrix, unresolved-risk register | independent review approves evidence language |

### Phase 0: freeze and preregister

The first deliverable is a compact preregistration packet. It should list the checkpoint IDs, training folds available for execution, target definition, promoter/locus universe, exact negative-control families, exact positive controls, and decision thresholds for advancement. It should also record what counts as a failure severe enough to force abstention or method revision. This packet matters because interpretability work is especially vulnerable to threshold drift. If the top 20 loci become the top 20 after looking at the data, the ladder has already been compromised.

This phase is also where scope boundaries are written down. The committed `make_patching.py`/`shorkiePatching.json`, two-width compact `make_modisco.py`/`shorkieModisco.json`, and expanded SAE reconstruction/grounding artifacts are released computations, not released biological truth. They remain below robust evidence until checkpoint parity, strand and fold replication, source review, and the method-specific controls in their proposal cards are complete. The motif grid’s unchanged reused-ISM null and the SAE’s correlational feature summaries and raw-channel comparison are explicit limitations of released results, not reasons to call those results absent. This rule prevents deployment from silently becoming evidence.

### Phase 1: prediction and calibration

This phase produces the prediction benchmark that all later work inherits. It should generate one report per frozen scalar, not one omnibus score for the entire site. For each report, the team should record baseline performance, subgroup calibration, and an abstention rule. Abstention is part of the frontier, not an embarrassment. A model that knows when not to nominate a causal candidate is more useful than a model that explains everything with equal confidence.

The main deliverables are: a split manifest, baseline tables, calibration plots, subgroup-coverage tables, and a one-page “interpretability allowed / interpretability blocked” decision summary. If calibration is poor but prediction is strong, the roadmap can continue with restricted use, but wet-lab escalation remains blocked until the uncertainty story is fixed.

### Phase 2: numerical fidelity

Phase 2 turns every explanation into an auditable artifact. Each artifact should include the method name, code version, target definition, baseline family, step count if approximate, RC policy, raw-value checksum, and all coordinate transforms used. Exact allele effects should be spot-checked by direct forwards. Approximate methods should record approximation residuals. Any head or layer display should name its actual tensor source. If a panel is a head mean, it must never be labeled as a per-head result.

The deliverables are a parity notebook, artifact schema, and a small regression suite that fails loudly when coordinates or output indices drift. This is also the right phase to retire unsupported wording around attention, skip-path summaries, or internal “stages” that are only approximate margins rather than native activations.

### Phase 3: faithfulness benchmark

Phase 3 selects which explanation families deserve continued engineering. Exact ISM, matched deletions, motif insertions, synthetic grammar tests, and if needed exact activation patches become the reference set. Gradients, IG, motif aggregation, local surrogates, attention, probes, or sparse features are compared against those references. The benchmark must include both successes and hard negatives. A method that looks good only on easy promoter motifs but fails on disagreement cases is not ready for large-scale discovery.

This is where released patching, compact motif clustering, and the TopK SAE enter as methods under test. Patching must first prove deterministic, strand/fold, and source-swap robustness before it nominates routes or circuits. The compact motif panel must replace its projection-only control with model-recomputed matched nulls, produce stable held-out clusters, and pass exact motif perturbations. The SAE must preserve downstream targets, beat matched simpler bases, recur across folds/RC states, and survive original-model feature interventions. No released panel is allowed to invert the ladder by creating stronger “evidence” prior to its own validation.

Deliverables are: a method scorecard, exact-edit calibration tables, synthetic-ground-truth plots, and a shortlist of methods allowed into subsequent phases. The go decision here is not “best-looking map wins”; it is “methods that repeatedly beat matched nulls, survive randomization, and calibrate to exact edits proceed.”

### Phase 4: robustness ledger

Once a method family passes faithfulness, the team should quantify how much of each conclusion depends on fold, strand, baseline, or method choice. The variance ledger should be explicit enough that a downstream reader can see whether uncertainty comes mostly from training variation, from baseline choice, from RC asymmetry, or from method disagreement. This is also where feature-selection stability and circuit-selection stability are computed. If a motif or route survives only under one baseline or one fold, it should remain a hypothesis rather than a release candidate.

Key deliverables are a stable-feature registry, a volatility registry, and abstention thresholds. For example, one can define “stable enough for external association” versus “stable enough for endogenous editing.” The latter should be stricter. External association can tolerate some ranking movement; an endogenous experiment should not be launched on a sign-unstable candidate.

### Phase 5: external association

Phase 5 moves beyond the frozen model and asks whether robust candidates line up with independent evidence. This phase should be stratified, not pooled. Variants, motifs, occupancy calls, and reporter tiles answer different validation questions and should be scored with matched controls tailored to each modality. The candidate set must be frozen before assay matching or external data pulls are analyzed.

Deliverables are modality-specific validation tables and a ranked escalation dossier. Importantly, this dossier should retain uncertainty and should record why each candidate passed. A candidate supported only by occupancy is weaker than one supported by occupancy plus held-out variant effect plus reporter assay. The dossier should also record which candidates were rejected despite looking visually compelling. Those rejections are part of governance evidence.

### Phase 6: wet-lab triage

Reporter or MPRA triage is the first expensive phase and should therefore be narrow. A practical design is to include: strong agreement cases, informative disagreement cases, high-uncertainty cases that would decide whether a method is transportable, and matched neutral controls. This phase is not just about positive rate. It is about measuring where model-faithful interventions survive transport from frozen model to assay construct.

Deliverables are replicate-aware assay models, a pass/fail table versus preregistered thresholds, and a shortlist for endogenous editing. Any assay effect that is directionally unstable across replicates should be blocked from endogenous escalation, even if the pooled mean is attractive.

### Phase 7: endogenous editing and rescue

This phase should be small by design. It consumes the candidates that passed reporter or MPRA triage and tests them in their native loci. Rescue is strongly preferred because it converts “something happened” into “the proposed sequence mechanism is consistent with what happened.” Occupancy plus expression concordance is the strongest mechanistic supplement. If rescue is not yet feasible, the claim language must remain narrower.

Deliverables are clone manifests, genotype confirmations, assay summaries, rescue tables, and a public-claim recommendation. A negative endogenous result is not wasted effort if the earlier phases were well instrumented: it tells us whether failure arose from assay transport, model misspecification, candidate-selection instability, or a specific explanation family.

### Phase 8: release governance

The final phase decides what language and what assets are allowed to ship. This is where engineering convenience and scientific evidence are separated. A visually polished panel can still be blocked. A rough internal notebook can still be good enough to justify method retirement. Governance should require an independent reviewer who was not the main implementer to check: target definitions, ladder placement, artifact parity, uncertainty statements, and claim wording.

The release memo should include a claim matrix with three columns: “allowed,” “requires weaker wording,” and “blocked.” It should explicitly list unsupported claims that must not appear. Examples include: head-specific interpretation from head-averaged assets; causal biological claims from attention alone; Borzoi SAE as if it were an established precedent; and robust causal, motif, or monosemantic-feature claims from the current released patching, compact motif, or SAE panels before they pass their full control batteries.

### Cost and storage formulas

The roadmap should be costed before execution so that candidate volumes and artifact retention stay aligned with reality.

- Exhaustive single-base ISM:

\[
C_{\mathrm{ISM}}\approx N_{\mathrm{loci}}\times 3L\times N_{\mathrm{fold}}\times N_{\mathrm{strand}}
\]

forward evaluations for sequence length `L`.

- Integrated gradients over a baseline family:

\[
C_{\mathrm{IG}}\approx N_{\mathrm{loci}}\times N_{\mathrm{fold}}\times N_{\mathrm{strand}}\times N_{\mathrm{baseline}}\times N_{\mathrm{steps}}
\]

forward-backward evaluations.

- Window occlusion with window size `w`:

\[
C_{\mathrm{occl}}\approx N_{\mathrm{loci}}\times \lceil L/w\rceil \times N_{\mathrm{fold}}\times N_{\mathrm{strand}}
\]

forward evaluations.

- Exact pairwise grammar over `P` selected positions:

\[
C_{\mathrm{pair}}\approx N_{\mathrm{loci}}\times 9\binom{P}{2}\times N_{\mathrm{fold}}\times N_{\mathrm{strand}}
\]

forward evaluations before higher-order expansions.

- Attribution storage for exhaustive alternate effects:

\[
S_{\mathrm{alt}}\approx N_{\mathrm{loci}}\times L\times 3\times N_{\mathrm{fold}}\times N_{\mathrm{strand}}\times \text{bytes/value}.
\]

- Stage-feature storage:

\[
S_{\mathrm{stage}}\approx \sum_s N_{\mathrm{loci}}\times N_{\mathrm{pos},s}\times d_s\times N_{\mathrm{fold}}\times N_{\mathrm{strand}}\times \text{bytes/value}.
\]

These formulas argue for streaming, compression of derived summaries rather than indiscriminate tensor dumps, and deliberate candidate triage. They also explain why exact higher-order grammar and endogenous editing belong late in the roadmap.

### Governance and reproducibility requirements

Every phase should emit machine-readable provenance: code revision, model hash, data manifest, split manifest, random seeds, method hyperparameters, baseline family, and artifact checksums. Derived candidate tables should never overwrite earlier versions; they should be append-only with status labels. Candidate selection should be scriptable from manifests alone. Human ranking can happen, but only after the machine-produced ranked list has been frozen and archived.

Reproducibility also requires language hygiene. “Approximate,” “heuristic,” “prototype,” “verified,” and “unresolved” should be status terms with operational definitions. In this fragment, “verified” means title, year, venue or repository owner, and persistent URL were checked as of the 2026-09-04 cutoff. “Unresolved” means at least one of those facts or the precedent status remained insufficiently anchored for counting. A record can be interesting and still unresolved.

### Claim-language policy

Claim language should be tied to the ladder, not to enthusiasm:

| Highest achieved level | Allowed verbs | Forbidden shortcuts |
|---|---|---|
| 0 | predicts, scores, correlates, calibrates | regulates, binds, causes |
| 1 | computes, maps, reproduces numerically | proves, validates biologically |
| 2 | changes the frozen model prediction, is necessary/sufficient for the model under this intervention | changes expression, is the true mechanism |
| 3 | is stable across tested folds/strands/baselines, remains uncertain where noted | is universal, is robust in biology |
| 4 | associates with independent assays, is supported by held-out occupancy or reporter evidence | is causal in vivo, directly binds without orthogonal evidence |
| 5 | causally changes the endogenous readout in this tested context, is rescued by the paired intervention | is general across all strains, environments, or species |

This policy should explicitly forbid two overclaims that were common in the stale literature chain. First, there is no verified Borzoi SAE precedent in the counted evidence base. A public GitHub repository describing Borzoi SAEs was surfaced during search, but it is not counted here as a verified scientific precedent because no peer-reviewed paper or authoritative first-party Borzoi interpretability record establishing that precedent was verified by the cutoff. Second, genomic SAE evidence that is counted does exist, but it is narrower: the 2026 Nature version of Evo 2 reports genomic mechanistic analyses with SAEs, and Guan, He, and Zhang report an AI4X 2025 study on HyenaDNA-small-32k. Those records support feasibility, not maturity or direct transfer to Shorkie [PR102, PP11].

## 3. Search log

### Scope and cutoff

The source search for this fragment was bounded to material relevant to: explanation faithfulness, uncertainty, reverse-complement handling, causal internal interventions, counterfactual design, surrogate modeling, attention and interaction claims, benchmarking, and wet-lab validation for regulatory sequence models. The cutoff date was 2026-09-04. No completeness claim stronger than “broad, source-anchored search” is made. This is not a PRISMA review and should not be presented as one.

### Databases and discovery surfaces

The search combined publisher and proceedings pages, biomedical indexes, and first-party method repositories. Core surfaces were Nature, Nature Genetics, Nature Methods, Nature Machine Intelligence, Genome Biology, Genome Research, PLOS Computational Biology, Nucleic Acids Research, Cell, Science, eLife, PNAS, Bioinformatics, JMLR, PMLR, NeurIPS proceedings, ACL Anthology, OpenReview, arXiv, bioRxiv, and GitHub repositories owned by the method authors or primary labs. For current-year or near-current records, direct publisher pages or canonical preprint pages were preferred over secondary summaries. This fragment also inherited the upstream document set’s source leads and then rechecked conflict-prone citations directly against primary pages where feasible.

### Query families

The search used families rather than one-off queries so that synonymous literatures would surface:

- saliency / attribution / integrated gradients / DeepLIFT / SHAP / infidelity / ROAR / sanity checks / genomic;
- in silico mutagenesis / occlusion / fastISM / Yuzu / CREME / higher-order / grammar / motif interaction;
- TF-MoDISco / motif discovery from importance / JASPAR / CIS-BP / YeTFaSCo / Tomtom / MEME;
- SQUID / MAVE-NN / surrogate models / local genotype-phenotype / regulatory sequence;
- activation patching / causal tracing / circuit discovery / edge attribution / transcoders / causal abstraction;
- sparse autoencoders / genomics / Evo 2 / gene language model / mechanistic interpretability;
- probes / MDL / TCAV / concept bottleneck / influence functions / TRAK / CKA / uncertainty / calibration / OOD;
- MPRA / STARR-seq / saturation mutagenesis / CRISPRi / endogenous editing / rescue / yeast promoter / eQTL / ASE.

Known-title and DOI anchor searches were used to resolve explicit conflicts requested in scope: Integrated Hessians as JMLR 22(104) in 2021 rather than a misattributed venue; GIA DOI `10.1371/journal.pcbi.1008925`; BPNet DOI `10.1038/s41588-021-00782-6`; SQUID DOI `10.1038/s42256-024-00851-5`; CREME DOI `10.1038/s41588-024-01923-3`; and Gosai DOI `10.1038/s41586-024-08070-z`. Recent records such as Borzoi 2025, AlphaGenome 2026, DEGU 2026, SATORI 2.0 2026, the 2026 Evo 2 version of record, and the small gene SAE study from AI4X 2025 were marked verified only when a primary publisher, proceedings, OpenReview, arXiv, or bioRxiv page was found by the cutoff.

### Inclusion rules

Counted records had to be one of:

1. a primary peer-reviewed research article, proceedings paper, or JMLR/PMLR record;
2. a primary preprint or technical report introducing a method or direct empirical result relevant to the ladder;
3. an authoritative first-party implementation or resource record directly relevant to executing or auditing the method family.

To count, each record needed a stable primary URL and enough metadata to identify title, authors or organization, year, and role in the taxonomy. Official repositories were counted only when they were directly method-defining or execution-critical. Reviews, perspectives, and secondary summaries could inform discovery but were not counted toward the source floor.

### Exclusion rules

Excluded from the counted floor were: generic XAI surveys, blog summaries without first-party authorship, derivative tutorials, informal issue threads, duplicated preprint-plus-paper pairs counted twice, and speculative web pages lacking a clear owner or stable archival status. Search results that surfaced an interesting claim but no verified primary source by cutoff were logged as unresolved and not counted. That is why no Borzoi SAE “precedent” is counted here despite a surfaced GitHub repository advertising such work.

### Deduplication and verification

Deduplication followed “one scientific record, one counted entry.” If a preprint and its archival journal or proceedings version represented the same work, only the most authoritative stable record was counted in the research sections, with the sibling version mentioned only if needed for search traceability. Repository records were counted separately only when they were first-party implementation artifacts rather than duplicate mirrors of an already counted paper.

Verification used the strongest available primary page in this order: publisher or proceedings page, JMLR/PMLR page, arXiv or bioRxiv abstract page, then first-party repository page. For 2025-2026 records, the fragment explicitly marks “verified 2026-09-04” or “unresolved 2026-09-04.” That tag speaks only to bibliographic and precedent status, not to whether the science is universally settled.

### Limitations

The search is broad but still incomplete in several ways. First, negative results in interpretability are underpublished and can be harder to discover. Second, some workshop and first-party mechanistic-interpretability records are influential but not peer reviewed, so their epistemic status is weaker than their practical influence. Third, software-first literatures change quickly; repository existence is not the same as validated precedent. Fourth, the 2025-2026 frontier is especially volatile. Any record near public release time should be rechecked immediately before publication. Finally, this fragment was intentionally bounded to validation and execution; it does not try to exhaust every architecture or every biological application of these methods.

## 4. Glossary

- **Abstention policy:** a rule that withholds interpretation or escalation when prediction or explanation uncertainty exceeds a preregistered threshold.
- **Baseline family:** the set of reference sequences or reference activations used by a path or reference-based explainer.
- **Calibration:** agreement between nominal uncertainty and realized error or coverage.
- **Candidate dossier:** the ranked and provenance-linked file that explains why a locus or edit is being escalated.
- **Completeness residual:** the difference between a path method’s summed attributions and the actual prediction difference it is supposed to explain.
- **Counted source:** a source included toward the source-floor requirement because it is a primary research record or authoritative first-party method/resource record.
- **Endogenous edit:** a sequence alteration made at the native genomic locus rather than on a reporter construct.
- **Estimand:** the exact quantity the method is trying to estimate, including checkpoint, target bins, tracks, transform, and coordinate convention.
- **Faithfulness:** agreement between an explanation and what happens when the corresponding object is actually perturbed in the frozen model.
- **Fold:** one training split or released model instance whose weights differ because the training data split differed.
- **Matched null:** a negative control selected to match nuisance properties such as GC, length, distance to TSS, batch, or position.
- **Positive control:** a case expected to show an effect if the method and assay are functioning correctly.
- **Preregistered stop/go gate:** a criterion written before result inspection that determines whether a phase can continue.
- **Prototype evidence:** an unreleased script or artifact that can inform planning but is not yet treated as validated truth.
- **RC mapping:** conversion between forward-sequence coordinates and reverse-complement coordinates back to the same physical DNA positions.
- **Rescue:** a paired intervention intended to reverse or compensate for a primary perturbation, strengthening mechanistic interpretation.
- **Scalar target:** the single quantity extracted from a potentially high-dimensional output for evaluation and explanation.
- **Seed:** a training rerun with identical data split but different initialization or training stochasticity.
- **Stable effect:** a result that retains sign and useful rank under the preregistered robustness axes.
- **Surrogate model:** a simpler local model fit to approximate a more complex oracle in a bounded neighborhood.
- **Wet-lab escalation:** the point at which computational candidates are promoted to reporter, MPRA, endogenous editing, or rescue experiments.

## 5. Bibliography and canonical source registry

Registry rules: `[Counted]` entries contribute to the source floor. `[Background only]` entries do not. For 2025-2026 records, the status tag states `verified 2026-09-04` or `unresolved 2026-09-04`. No unresolved entry is counted.

### Peer-reviewed primary research papers

- [Counted] PR01. Alipanahi et al. (2015). *Predicting the Sequence Specificities of DNA- and RNA-Binding Proteins by Deep Learning*. Nature Biotechnology. https://doi.org/10.1038/nbt.3300. Type: peer-reviewed primary paper. Relevance: DeepBind is an early sequence-model foundation for learned motif representations.
- [Counted] PR02. Zhou & Troyanskaya (2015). *Predicting Effects of Noncoding Variants with Deep Learning-Based Sequence Model*. Nature Methods. https://doi.org/10.1038/nmeth.3547. Type: peer-reviewed primary paper. Relevance: DeepSEA establishes sequence-to-function variant scoring from DNA alone.
- [Counted] PR03. Kelley, Snoek & Rinn (2016). *Basset: Learning the Regulatory Code of the Accessible Genome with Deep Convolutional Neural Networks*. Genome Research. https://doi.org/10.1101/gr.200535.115. Type: peer-reviewed primary paper. Relevance: Basset is a canonical genomic CNN with mutation-based interpretation.
- [Counted] PR04. Quang & Xie (2016). *DanQ: a Hybrid Convolutional and Recurrent Deep Neural Network for Quantifying the Function of DNA Sequences*. Nucleic Acids Research. https://doi.org/10.1093/nar/gkw226. Type: peer-reviewed primary paper. Relevance: DanQ extends sequence models to longer dependencies.
- [Counted] PR05. Kelley et al. (2018). *Sequential Regulatory Activity Prediction Across Chromosomes with Convolutional Neural Networks*. Genome Research. https://doi.org/10.1101/gr.227819.117. Type: peer-reviewed primary paper. Relevance: Basenji is a long-context genomic prediction anchor.
- [Counted] PR06. Kelley (2020). *Cross-Species Regulatory Sequence Activity Prediction*. PLOS Computational Biology. https://doi.org/10.1371/journal.pcbi.1008050. Type: peer-reviewed primary paper. Relevance: cross-species training and transfer are directly relevant to Shorkie’s fungal setting.
- [Counted] PR07. Agarwal & Shendure (2020). *Predicting mRNA Abundance Directly from Genomic Sequence Using Deep Convolutional Neural Networks*. Cell Reports. https://doi.org/10.1016/j.celrep.2020.107663. Type: peer-reviewed primary paper. Relevance: Xpresso is a direct expression-prediction baseline.
- [Counted] PR08. Zhou et al. (2018). *Deep Learning Sequence-Based Ab Initio Prediction of Variant Effects on Expression and Disease Risk*. Nature Genetics. https://doi.org/10.1038/s41588-018-0160-6. Type: peer-reviewed primary paper. Relevance: ExPecto links sequence effects to expression and disease.
- [Counted] PR09. Avsec et al. (2021). *Effective Gene Expression Prediction from Sequence by Integrating Long-Range Interactions*. Nature Methods. https://doi.org/10.1038/s41592-021-01252-x. Type: peer-reviewed primary paper. Relevance: Enformer is a major long-context sequence model benchmark.
- [Counted] PR10. Chen et al. (2022). *A Sequence-Based Global Map of Regulatory Activity for Deciphering Human Genetics*. Nature Genetics. https://doi.org/10.1038/s41588-022-01102-2. Type: peer-reviewed primary paper. Relevance: Sei provides a large-scale regulatory-state prediction comparator.
- [Counted] PR11. Linder et al. (2025). *Predicting RNA-Seq Coverage from DNA Sequence as a Unifying Model of Gene Regulation*. Nature Genetics. https://doi.org/10.1038/s41588-024-02053-6. Type: peer-reviewed primary paper. Relevance: Borzoi is the closest large human RNA-coverage analogue to Shorkie. 2025-2026 status: verified 2026-09-04.
- [Counted] PR12. Avsec et al. (2021). *Base-Resolution Models of Transcription Factor Binding Reveal Soft Motif Syntax*. Nature Genetics. https://doi.org/10.1038/s41588-021-00782-6. Type: peer-reviewed primary paper. Relevance: BPNet is the canonical base-resolution motif-syntax and perturbation benchmark.
- [Counted] PR13. de Almeida et al. (2022). *DeepSTARR Predicts Enhancer Activity from DNA Sequence and Enables the de novo Design of Synthetic Enhancers*. Nature Genetics. https://doi.org/10.1038/s41588-022-01048-5. Type: peer-reviewed primary paper. Relevance: direct link from model interpretation to tested enhancer design.
- [Counted] PR14. Avsec et al. (2026). *Advancing Regulatory Variant Effect Prediction with AlphaGenome*. Nature. https://doi.org/10.1038/s41586-025-10014-0. Type: peer-reviewed primary paper. Relevance: current megabase-scale multimodal benchmark for regulatory variant prediction. 2025-2026 status: verified 2026-09-04.
- [Counted] PR15. Novakovsky et al. (2023). *ExplaiNN: Interpretable and Transparent Neural Networks for Genomics*. Genome Biology. https://doi.org/10.1186/s13059-023-02985-y. Type: peer-reviewed primary paper. Relevance: intrinsic interpretability baseline with linearly combined units.
- [Counted] PR16. Sundararajan, Taly & Yan (2017). *Axiomatic Attribution for Deep Networks*. ICML/PMLR. https://proceedings.mlr.press/v70/sundararajan17a.html. Type: peer-reviewed primary paper. Relevance: Integrated Gradients is a central path-attribution method.
- [Counted] PR17. Shrikumar, Greenside & Kundaje (2017). *Learning Important Features Through Propagating Activation Differences*. ICML/PMLR. https://proceedings.mlr.press/v70/shrikumar17a.html. Type: peer-reviewed primary paper. Relevance: DeepLIFT is a major reference-based explainer in genomics.
- [Counted] PR18. Erion et al. (2021). *Improving Performance of Deep Learning Models with Axiomatic Attribution Priors and Expected Gradients*. Nature Machine Intelligence. https://doi.org/10.1038/s42256-021-00343-w. Type: peer-reviewed primary paper. Relevance: Expected Gradients plus attribution-prior training.
- [Counted] PR19. Lundberg & Lee (2017). *A Unified Approach to Interpreting Model Predictions*. NeurIPS. https://papers.neurips.cc/paper/7062-a-unified-approach-to-interpreting-model-predictions. Type: peer-reviewed primary paper. Relevance: SHAP is a major additive-attribution framework with genomic relevance caveats.
- [Counted] PR20. Majdandžić et al. (2023). *Correcting Gradient-Based Interpretations of Deep Neural Networks for Genomics*. Genome Biology. https://doi.org/10.1186/s13059-023-02956-3. Type: peer-reviewed primary paper. Relevance: establishes the simplex-correction required for one-hot DNA gradients.
- [Counted] PR21. Ancona et al. (2018). *Towards Better Understanding of Gradient-Based Attribution Methods for Deep Neural Networks*. ICLR/OpenReview. https://openreview.net/forum?id=Sy21R9JAW. Type: peer-reviewed primary paper. Relevance: unifies several gradient and reference methods.
- [Counted] PR22. Bach et al. (2015). *On Pixel-Wise Explanations for Non-Linear Classifier Decisions by Layer-Wise Relevance Propagation*. PLOS ONE. https://doi.org/10.1371/journal.pone.0130140. Type: peer-reviewed primary paper. Relevance: LRP is a classic relevance-propagation baseline.
- [Counted] PR23. Adebayo et al. (2018). *Sanity Checks for Saliency Maps*. NeurIPS. https://papers.neurips.cc/paper/8160-sanity-checks-for-saliency-maps. Type: peer-reviewed primary paper. Relevance: parameter and label randomization are mandatory explanation controls.
- [Counted] PR24. Yeh et al. (2019). *On the (In)fidelity and Sensitivity of Explanations*. NeurIPS. https://papers.nips.cc/paper/2019/hash/a7471fdc77b3435276507cc8f2dc2569-Abstract.html. Type: peer-reviewed primary paper. Relevance: formal faithfulness metrics for explanation perturbation tests.
- [Counted] PR25. Hooker et al. (2019). *A Benchmark for Interpretability Methods in Deep Neural Networks*. NeurIPS. https://papers.neurips.cc/paper/2019/hash/fe4b8556000d0f0cae99daa5c5c5a410-Abstract.html. Type: peer-reviewed primary paper. Relevance: ROAR-style benchmark logic for distribution-aware faithfulness.
- [Counted] PR26. Tomsett et al. (2020). *Sanity Checks for Saliency Metrics*. AAAI. https://doi.org/10.1609/aaai.v34i04.6064. Type: peer-reviewed primary paper. Relevance: shows that saliency metrics themselves need validation.
- [Counted] PR27. Ghorbani, Abid & Zou (2019). *Interpretation of Neural Networks Is Fragile*. AAAI. https://doi.org/10.1609/aaai.v33i01.33013681. Type: peer-reviewed primary paper. Relevance: adversarial instability caution for explanation maps.
- [Counted] PR28. Zeiler & Fergus (2014). *Visualizing and Understanding Convolutional Networks*. ECCV. https://doi.org/10.1007/978-3-319-10590-1_53. Type: peer-reviewed primary paper. Relevance: canonical occlusion-sensitivity reference.
- [Counted] PR29. Nair et al. (2022). *fastISM: Performant In Silico Saturation Mutagenesis for Convolutional Neural Networks*. Bioinformatics. https://doi.org/10.1093/bioinformatics/btac135. Type: peer-reviewed primary paper. Relevance: exact ISM acceleration benchmark.
- [Counted] PR30. Nair et al. (2022). *Accelerating In Silico Saturation Mutagenesis Using Compressed Sensing*. Bioinformatics. https://doi.org/10.1093/bioinformatics/btac385. Type: peer-reviewed primary paper. Relevance: Yuzu is another exact-or-checked acceleration strategy.
- [Counted] PR31. Toneyan & Koo (2024). *Interpreting Cis-Regulatory Interactions from Large-Scale Deep Neural Networks*. Nature Genetics. https://doi.org/10.1038/s41588-024-01923-3. Type: peer-reviewed primary paper. Relevance: CREME extends necessity/sufficiency and higher-order perturbations. 2025-2026 status: verified 2026-09-04.
- [Counted] PR32. Greenside et al. (2018). *Discovering Epistatic Feature Interactions from Neural Network Models of Regulatory DNA Sequences*. Bioinformatics. https://doi.org/10.1093/bioinformatics/bty575. Type: peer-reviewed primary paper. Relevance: Deep Feature Interaction Maps for interaction discovery.
- [Counted] PR33. Koo et al. (2021). *Global Importance Analysis: An Interpretability Method to Quantify Importance of Genomic Features in Deep Neural Networks*. PLOS Computational Biology. https://doi.org/10.1371/journal.pcbi.1008925. Type: peer-reviewed primary paper. Relevance: designed motif interventions over background families.
- [Counted] PR34. Seitz et al. (2024). *Interpreting Cis-Regulatory Mechanisms from Genomic Deep Neural Networks Using Surrogate Models*. Nature Machine Intelligence. https://doi.org/10.1038/s42256-024-00851-5. Type: peer-reviewed primary paper. Relevance: SQUID provides local interpretable surrogates with validation logic.
- [Counted] PR35. Tareen et al. (2022). *MAVE-NN: Learning Genotype-Phenotype Maps from Multiplex Assays of Variant Effect*. Genome Biology. https://doi.org/10.1186/s13059-022-02661-7. Type: peer-reviewed primary paper. Relevance: quantitative surrogate framework for local genotype-phenotype modeling.
- [Counted] PR36. Jabeen et al. (2021). *A Self-Attention Model for Inferring Cooperativity Between Regulatory Features*. Nucleic Acids Research. https://doi.org/10.1093/nar/gkab349. Type: peer-reviewed primary paper. Relevance: SATORI is a direct genomic attention-interaction method.
- [Counted] PR37. Jabeen & Ben-Hur (2026). *A Comprehensive Evaluation of Self-Attention for Detecting Regulatory Feature Interactions*. NAR Genomics and Bioinformatics. https://doi.org/10.1093/nargab/lqaf209. Type: peer-reviewed primary paper. Relevance: SATORI 2.0 adds entropy and attention-attribution evaluation. 2025-2026 status: verified 2026-09-04.
- [Counted] PR38. Abnar & Zuidema (2020). *Quantifying Attention Flow in Transformers*. ACL. https://doi.org/10.18653/v1/2020.acl-main.385. Type: peer-reviewed primary paper. Relevance: formalizes attention rollout and flow.
- [Counted] PR39. Jain & Wallace (2019). *Attention is not Explanation*. NAACL. https://doi.org/10.18653/v1/N19-1357. Type: peer-reviewed primary paper. Relevance: core caution against overclaiming attention weights.
- [Counted] PR40. Wiegreffe & Pinter (2019). *Attention is not not Explanation*. EMNLP-IJCNLP. https://doi.org/10.18653/v1/D19-1002. Type: peer-reviewed primary paper. Relevance: sharper criteria for when attention may still be informative.
- [Counted] PR41. Janizek, Sturmfels & Lee (2021). *Explaining Explanations: Axiomatic Feature Interactions for Deep Networks*. JMLR 22(104). https://www.jmlr.org/papers/v22/20-1223.html. Type: peer-reviewed primary paper. Relevance: Integrated Hessians for pairwise interaction attribution.
- [Counted] PR42. Bailey et al. (2015). *The MEME Suite*. Nucleic Acids Research. https://doi.org/10.1093/nar/gkv416. Type: peer-reviewed primary paper. Relevance: foundational motif discovery and analysis infrastructure.
- [Counted] PR43. Gupta et al. (2007). *Quantifying Similarity Between Motifs*. Genome Biology. https://doi.org/10.1186/gb-2007-8-2-r24. Type: peer-reviewed primary paper. Relevance: Tomtom is standard for motif matching.
- [Counted] PR44. Weirauch et al. (2014). *Determination and Inference of Eukaryotic Transcription Factor Sequence Specificity*. Cell. https://doi.org/10.1016/j.cell.2014.08.009. Type: peer-reviewed primary paper. Relevance: CIS-BP is a large specificity reference set.
- [Counted] PR45. Rauluseviciute et al. (2024). *JASPAR 2024: 20th Anniversary of the Open-Access Database of Transcription Factor Binding Profiles*. Nucleic Acids Research. https://doi.org/10.1093/nar/gkad1059. Type: peer-reviewed primary paper. Relevance: current curated TF motif database.
- [Counted] PR46. de Boer & Hughes (2012). *YeTFaSCo: a Database of Evaluated Yeast Transcription Factor Sequence Specificities*. Nucleic Acids Research. https://doi.org/10.1093/nar/gkr993. Type: peer-reviewed primary paper. Relevance: yeast-specific motif reference essential for Shorkie.
- [Counted] PR47. Tareen & Kinney (2020). *Logomaker: Beautiful Sequence Logos in Python*. Bioinformatics. https://doi.org/10.1093/bioinformatics/btz921. Type: peer-reviewed primary paper. Relevance: transparent sequence and attribution logo rendering.
- [Counted] PR48. Lakshminarayanan, Pritzel & Blundell (2017). *Simple and Scalable Predictive Uncertainty Estimation Using Deep Ensembles*. NeurIPS. https://papers.neurips.cc/paper/7219-simple-and-scalable-predictive-uncertainty-estimation-using-deep-ensembles. Type: peer-reviewed primary paper. Relevance: ensemble uncertainty baseline.
- [Counted] PR49. Kuleshov, Fenner & Ermon (2018). *Accurate Uncertainties for Deep Learning Using Calibrated Regression*. ICML. https://arxiv.org/abs/1807.00263. Type: peer-reviewed primary paper. Relevance: calibrated regression intervals for continuous outputs.
- [Counted] PR50. Romano, Patterson & Candès (2019). *Conformalized Quantile Regression*. NeurIPS. https://arxiv.org/abs/1905.03222. Type: peer-reviewed primary paper. Relevance: interval construction under weak assumptions.
- [Counted] PR51. Barber et al. (2021). *Predictive Inference with the Jackknife+*. Annals of Statistics. https://doi.org/10.1214/20-AOS1965. Type: peer-reviewed primary paper. Relevance: robust predictive intervals for model families.
- [Counted] PR52. Guo et al. (2017). *On Calibration of Modern Neural Networks*. ICML/PMLR. https://proceedings.mlr.press/v70/guo17a.html. Type: peer-reviewed primary paper. Relevance: temperature scaling and calibration caution.
- [Counted] PR53. Ovadia et al. (2019). *Can You Trust Your Model’s Uncertainty? Evaluating Predictive Uncertainty Under Dataset Shift*. NeurIPS. https://papers.neurips.cc/paper/9547-can-you-trust-your-models-uncertainty-evaluating-predictive-uncertainty-under-dataset-shift. Type: peer-reviewed primary paper. Relevance: uncertainty under shift is central to escalation policy.
- [Counted] PR54. Kendall & Gal (2017). *What Uncertainties Do We Need in Bayesian Deep Learning for Computer Vision?* NeurIPS. https://papers.neurips.cc/paper/7141-what-uncertainties-do-we-need-in-bayesian-deep-learning-for-computer-vision. Type: peer-reviewed primary paper. Relevance: separates epistemic and aleatoric uncertainty concepts.
- [Counted] PR55. Lee et al. (2023). *EvoAug: Improving Generalization and Interpretability of Genomic Deep Neural Networks with Evolution-Inspired Data Augmentations*. Genome Biology. https://doi.org/10.1186/s13059-023-02941-w. Type: peer-reviewed primary paper. Relevance: augmentation can improve robustness and attribution quality.
- [Counted] PR56. Majdandžić et al. (2022). *Selecting Deep Neural Networks That Yield Consistent Attribution-Based Interpretations for Genomics*. MLCB/PMLR. https://proceedings.mlr.press/v200/majdandzic22a.html. Type: peer-reviewed primary paper. Relevance: direct genomic study of attribution consistency across models.
- [Counted] PR57. Karollus et al. (2023). *Current Sequence-Based Models Capture Gene Expression Determinants in Promoters but Mostly Ignore Distal Enhancers*. Genome Biology. https://doi.org/10.1186/s13059-023-02899-9. Type: peer-reviewed primary paper. Relevance: warns against long-context overclaiming.
- [Counted] PR58. Sasse et al. (2023). *Benchmarking of Deep Neural Networks for Predicting Personal Gene Expression from DNA Sequence Highlights Shortcomings*. Nature Genetics. https://doi.org/10.1038/s41588-023-01524-6. Type: peer-reviewed primary paper. Relevance: personal-expression benchmark exposing generalization failures.
- [Counted] PR59. Huang et al. (2023). *Personal Transcriptome Variation is Poorly Explained by Current Genomic Deep Learning Models*. Nature Genetics. https://doi.org/10.1038/s41588-023-01574-w. Type: peer-reviewed primary paper. Relevance: direct caution on variant-direction and expression generalization.
- [Counted] PR60. Penzar et al. (2024). *A Community Effort to Optimize Sequence-Based Deep Learning Models of Gene Regulation*. Nature Biotechnology. https://doi.org/10.1038/s41587-024-02414-w. Type: peer-reviewed primary paper. Relevance: DREAM challenge with synthetic and natural evaluation regimes.
- [Counted] PR61. Reynolds & Pan (2025). *Benchmarking Interpretability of Deep Learning for Predictive Genomics: Recall, Precision, and Variability of Feature Attribution*. PLOS Computational Biology. https://doi.org/10.1371/journal.pcbi.1013784. Type: peer-reviewed primary paper. Relevance: direct genomic benchmark for attribution recall, precision, and stability. 2025-2026 status: verified 2026-09-04.
- [Counted] PR62. Zhou et al. (2026). *Uncertainty-Aware Genomic Deep Learning with Knowledge Distillation*. npj Artificial Intelligence. https://doi.org/10.1038/s44387-025-00053-3. Type: peer-reviewed primary paper. Relevance: DEGU combines distillation with uncertainty and explanation-consistency claims. 2025-2026 status: verified 2026-09-04.
- [Counted] PR63. Patwardhan et al. (2009). *High-Resolution Analysis of DNA Regulatory Elements by Synthetic Saturation Mutagenesis*. Nature Biotechnology. https://doi.org/10.1038/nbt.1589. Type: peer-reviewed primary paper. Relevance: classic experimental single-nucleotide and interaction map.
- [Counted] PR64. Melnikov et al. (2012). *Systematic Dissection and Optimization of Inducible Enhancers in Human Cells Using a Massively Parallel Reporter Assay*. Nature Biotechnology. https://doi.org/10.1038/nbt.2137. Type: peer-reviewed primary paper. Relevance: MPRA design and interpretation precedent.
- [Counted] PR65. Tewhey et al. (2016). *Direct Identification of Hundreds of Expression-Modulating Variants Using a Multiplexed Reporter Assay*. Cell. https://doi.org/10.1016/j.cell.2016.04.027. Type: peer-reviewed primary paper. Relevance: direct variant-effect assay at scale.
- [Counted] PR66. Kircher et al. (2019). *Saturation Mutagenesis of Twenty Disease-Associated Regulatory Elements at Single Base-Pair Resolution*. Nature Communications. https://doi.org/10.1038/s41467-019-11526-w. Type: peer-reviewed primary paper. Relevance: high-resolution functional maps of regulatory elements.
- [Counted] PR67. Movva et al. (2019). *Deciphering Regulatory DNA Sequences and Noncoding Genetic Variants Using Neural Network Models of Massively Parallel Reporter Assays*. PLOS ONE. https://doi.org/10.1371/journal.pone.0218073. Type: peer-reviewed primary paper. Relevance: MPRA-DragoNN links neural predictions with interpretability and reporter data.
- [Counted] PR68. Fulco et al. (2016). *Systematic Mapping of Functional Enhancer-Promoter Connections with CRISPR Interference*. Science. https://doi.org/10.1126/science.aag2445. Type: peer-reviewed primary paper. Relevance: endogenous perturbation benchmark for regulatory element function.
- [Counted] PR69. Gasperini et al. (2019). *A Genome-Wide Framework for Mapping Gene Regulation via Cellular Genetic Screens*. Cell. https://doi.org/10.1016/j.cell.2018.11.029. Type: peer-reviewed primary paper. Relevance: pooled CRISPR mapping of regulatory effects.
- [Counted] PR70. Fulco et al. (2019). *Activity-by-Contact Model of Enhancer-Promoter Regulation from Thousands of CRISPR Perturbations*. Nature Genetics. https://doi.org/10.1038/s41588-019-0538-0. Type: peer-reviewed primary paper. Relevance: combines perturbation and contact for regulatory inference.
- [Counted] PR71. Findlay et al. (2018). *Accurate Classification of BRCA1 Variants with Saturation Genome Editing*. Nature. https://doi.org/10.1038/s41586-018-0461-z. Type: peer-reviewed primary paper. Relevance: endogenous high-throughput editing as a stronger validation rung.
- [Counted] PR72. Arnold et al. (2013). *Genome-Wide Quantitative Enhancer Activity Maps Identified by STARR-seq*. Science. https://doi.org/10.1126/science.1232542. Type: peer-reviewed primary paper. Relevance: foundational reporter assay for enhancer activity.
- [Counted] PR73. de Boer et al. (2020). *Deciphering Eukaryotic Gene-Regulatory Logic with 100 Million Random Promoters*. Nature Biotechnology. https://doi.org/10.1038/s41587-019-0315-8. Type: peer-reviewed primary paper. Relevance: unmatched yeast promoter-scale ground truth for regulatory grammar.
- [Counted] PR74. Vaishnav et al. (2022). *The Evolution, Evolvability and Engineering of Gene Regulatory DNA*. Nature. https://doi.org/10.1038/s41586-022-04506-6. Type: peer-reviewed primary paper. Relevance: large-scale yeast promoter landscapes connecting prediction and engineering.
- [Counted] PR75. Sharon et al. (2012). *Inferring Gene Regulatory Logic from High-Throughput Measurements of Thousands of Systematically Designed Promoters*. Nature Biotechnology. https://doi.org/10.1038/nbt.2205. Type: peer-reviewed primary paper. Relevance: designed promoter assay precedent in yeast.
- [Counted] PR76. Raveh-Sadka et al. (2012). *Manipulating Nucleosome Disfavoring Sequences Allows Fine-Tune Regulation of Gene Expression in Yeast*. Nature Genetics. https://doi.org/10.1038/ng.2305. Type: peer-reviewed primary paper. Relevance: sequence-context and nucleosome effects in yeast promoters.
- [Counted] PR77. Chen & Struhl (1988). *Saturation Mutagenesis of a Yeast his3 “TATA Element”: Genetic Evidence for a Specific TATA-Binding Protein*. PNAS. https://doi.org/10.1073/pnas.85.8.2691. Type: peer-reviewed primary paper. Relevance: early precise motif-function dissection benchmark.
- [Counted] PR78. Renganaath et al. (2020). *Systematic Identification of Cis-Regulatory Variants That Cause Gene Expression Differences in a Yeast Cross*. eLife. https://doi.org/10.7554/eLife.62669. Type: peer-reviewed primary paper. Relevance: natural promoter-variant MPRA benchmark in yeast.
- [Counted] PR79. Kita et al. (2017). *High-Resolution Mapping of Cis-Regulatory Variation in Budding Yeast*. PNAS. https://doi.org/10.1073/pnas.1717421114. Type: peer-reviewed primary paper. Relevance: yeast cis-regulatory variation and external association resource.
- [Counted] PR80. Albert et al. (2018). *Genetics of Trans-Regulatory Variation in Gene Expression*. eLife. https://doi.org/10.7554/eLife.35471. Type: peer-reviewed primary paper. Relevance: contextualizes trans effects that can confound cis claims.
- [Counted] PR81. Yvert et al. (2019). *DNA Variants Affecting the Expression of Numerous Genes in Trans Have Diverse Mechanisms of Action and Evolutionary Histories*. PLOS Genetics. https://doi.org/10.1371/journal.pgen.1008375. Type: peer-reviewed primary paper. Relevance: reminds that association need not be local cis mechanism.
- [Counted] PR82. Harbison et al. (2004). *Transcriptional Regulatory Code of a Eukaryotic Genome*. Nature. https://doi.org/10.1038/nature02911. Type: peer-reviewed primary paper. Relevance: yeast occupancy resource and motif hypothesis source.
- [Counted] PR83. Rhee & Pugh (2011). *Comprehensive Genome-Wide Protein-DNA Interactions Detected at Single-Nucleotide Resolution*. Cell. https://doi.org/10.1016/j.cell.2011.08.038. Type: peer-reviewed primary paper. Relevance: high-resolution occupancy benchmark.
- [Counted] PR84. Cherry et al. (2012). *Saccharomyces Genome Database: The Genomics Resource of Budding Yeast*. Nucleic Acids Research. https://doi.org/10.1093/nar/gkr1029. Type: peer-reviewed primary paper. Relevance: authoritative yeast annotation reference.
- [Counted] PR85. Teixeira et al. (2018). *The YEASTRACT Database: an Upgraded Information System for the Analysis of Gene and Genomic Transcription Regulation in Saccharomyces cerevisiae*. Nucleic Acids Research. https://doi.org/10.1093/nar/gkx842. Type: peer-reviewed primary paper. Relevance: curated yeast TF-target resource.
- [Counted] PR87. Jolma et al. (2013). *DNA-Binding Specificities of Human Transcription Factors*. Cell. https://doi.org/10.1016/j.cell.2013.01.001. Type: peer-reviewed primary paper. Relevance: PBM specificity reference and motif assay precedent.
- [Counted] PR88. Imai, Keele & Tingley (2010). *A General Approach to Causal Mediation Analysis*. Psychological Methods. https://doi.org/10.1037/a0020761. Type: peer-reviewed primary paper. Relevance: precise causal language baseline for mediation-style claims.
- [Counted] PR89. Geiger et al. (2022). *Inducing Causal Structure for Interpretable Neural Networks*. ICML/PMLR. https://proceedings.mlr.press/v162/geiger22a.html. Type: peer-reviewed primary paper. Relevance: interchange interventions and causal abstraction foundations.
- [Counted] PR90. Geiger et al. (2024). *Finding Alignments Between Interpretable Causal Variables and Distributed Neural Representations*. CLeaR/PMLR. https://proceedings.mlr.press/v236/geiger24a.html. Type: peer-reviewed primary paper. Relevance: alignment between causal variables and distributed representations.
- [Counted] PR91. Geiger et al. (2025). *Causal Abstraction: A Theoretical Foundation for Mechanistic Interpretability*. JMLR. https://www.jmlr.org/papers/v26/23-0058.html. Type: peer-reviewed primary paper. Relevance: formal basis for high-level mechanistic claims. 2025-2026 status: verified 2026-09-04.
- [Counted] PR92. Conmy et al. (2023). *Towards Automated Circuit Discovery for Mechanistic Interpretability*. NeurIPS/OpenReview. https://openreview.net/forum?id=89ia77nZ8u. Type: peer-reviewed primary paper. Relevance: ACDC is a key circuit-pruning method.
- [Counted] PR93. Syed et al. (2023). *Attribution Patching Outperforms Automated Circuit Discovery*. BlackboxNLP. https://arxiv.org/abs/2310.10348. Type: peer-reviewed primary paper. Relevance: compares circuit-localization methods and motivates exact verification.
- [Counted] PR94. Hase et al. (2023). *Does Localization Inform Editing? Surprising Differences in Causality-Based Localization vs. Knowledge Editing in Language Models*. NeurIPS. https://papers.nips.cc/paper_files/paper/2023/hash/3927bbdcf0e8d1fa8aa23c26f358a281-Abstract-Conference.html. Type: peer-reviewed primary paper. Relevance: localization does not automatically imply editable storage.
- [Counted] PR95. Dunefsky, Chlenski & Nanda (2024). *Transcoders Find Interpretable LLM Feature Circuits*. NeurIPS. https://doi.org/10.52202/079017-0768. Type: peer-reviewed primary paper. Relevance: sparse replacement-model circuits relevant to transferred graph methods. 2025-2026 status: verified 2026-09-04.
- [Counted] PR96. Hewitt & Liang (2019). *Designing and Interpreting Probes with Control Tasks*. EMNLP-IJCNLP. https://aclanthology.org/D19-1275/. Type: peer-reviewed primary paper. Relevance: probe selectivity and control tasks.
- [Counted] PR97. Voita & Titov (2020). *Information-Theoretic Probing with Minimum Description Length*. EMNLP. https://aclanthology.org/2020.emnlp-main.14/. Type: peer-reviewed primary paper. Relevance: MDL probing for accessible information rather than raw accuracy.
- [Counted] PR98. Koh & Liang (2017). *Understanding Black-Box Predictions via Influence Functions*. ICML/PMLR. https://proceedings.mlr.press/v70/koh17a.html. Type: peer-reviewed primary paper. Relevance: foundational training-data attribution method.
- [Counted] PR99. Park et al. (2023). *TRAK: Attributing Model Behavior at Scale*. ICML/PMLR. https://proceedings.mlr.press/v202/park23c.html. Type: peer-reviewed primary paper. Relevance: scalable attribution of model behavior to training data.
- [Counted] PR100. Kornblith et al. (2019). *Similarity of Neural Network Representations Revisited*. ICML/PMLR. https://proceedings.mlr.press/v97/kornblith19a.html. Type: peer-reviewed primary paper. Relevance: CKA is the dominant representation-similarity baseline.
- [Counted] PR101. Gosai et al. (2024). *Machine-Guided Design of Cell-Type-Targeting Cis-Regulatory Elements*. Nature 634. https://doi.org/10.1038/s41586-024-08070-z. Type: peer-reviewed primary paper. Relevance: computational regulatory-element design followed by experimental validation.
- [Counted] PR102. Brixi et al. (2026). *Genome Modelling and Design Across All Domains of Life with Evo 2*. Nature 652, 1349–1361. https://doi.org/10.1038/s41586-026-10176-5. Type: peer-reviewed primary paper. Relevance: genomic foundation model with SAE-based mechanistic analyses; this is feasibility evidence for genomic SAEs, not a Borzoi or sequence-to-function SAE precedent. 2025-2026 status: verified 2026-09-04; version of record published 2026-03-04.
- [Counted] PR103. Kim et al. (2018). *Interpretability Beyond Feature Attribution: Quantitative Testing with Concept Activation Vectors (TCAV)*. ICML/PMLR. https://proceedings.mlr.press/v80/kim18d.html. Type: peer-reviewed primary paper. Relevance: tests named concepts against internal representations.
- [Counted] PR104. Koh et al. (2020). *Concept Bottleneck Models*. ICML/PMLR. https://proceedings.mlr.press/v119/koh20a.html. Type: peer-reviewed primary paper. Relevance: explicit concept-mediated prediction and intervention baseline.
- [Counted] PR105. Raghu et al. (2017). *SVCCA: Singular Vector Canonical Correlation Analysis for Deep Learning Dynamics and Interpretability*. NeurIPS. https://arxiv.org/abs/1706.05806. Type: peer-reviewed primary paper. Relevance: cross-fold, cross-layer, and cross-model representation comparison.
- [Counted] PR106. Pruthi et al. (2020). *Estimating Training Data Influence by Tracing Gradient Descent*. NeurIPS. https://arxiv.org/abs/2002.08484. Type: peer-reviewed primary paper. Relevance: TracIn provides a checkpoint-gradient route to training-data attribution.
- [Counted] PR107. Ilyas et al. (2022). *Datamodels: Predicting Predictions from Training Data*. ICML/PMLR. https://proceedings.mlr.press/v162/ilyas22a.html. Type: peer-reviewed primary paper. Relevance: group-level training-data dependence via learned datamodels.
- [Counted] PR108. Basu, Pope & Feizi (2021). *Influence Functions in Deep Learning Are Fragile*. ICLR. https://arxiv.org/abs/2006.14651. Type: peer-reviewed primary paper. Relevance: documents approximation fragility that any provenance experiment must test.
- [Counted] PR109. Adams et al. (2025). *From Mechanistic Interpretability to Mechanistic Biology: Training, Evaluating, and Interpreting Sparse Autoencoders on Protein Language Models*. ICML/PMLR 267. https://proceedings.mlr.press/v267/adams25a.html. Type: peer-reviewed primary paper. Relevance: biological SAE evaluation beyond genomic DNA, useful as a validation comparator. 2025-2026 status: verified 2026-09-04.

### Primary preprints and technical reports

- [Counted] PP01. Tareen & Kinney (2020). *Biophysical Models of Cis-Regulation as Interpretable Neural Networks*. arXiv. https://doi.org/10.48550/arXiv.2001.03560. Type: preprint. Relevance: explicit interpretable parameterization of cis-regulation.
- [Counted] PP02. Simonyan, Vedaldi & Zisserman (2013). *Deep Inside Convolutional Networks: Visualising Image Classification Models and Saliency Maps*. arXiv. https://doi.org/10.48550/arXiv.1312.6034. Type: preprint/workshop record. Relevance: classic saliency-map origin.
- [Counted] PP03. Smilkov et al. (2017). *SmoothGrad: Removing Noise by Adding Noise*. arXiv. https://doi.org/10.48550/arXiv.1706.03825. Type: preprint. Relevance: smoothing baseline for gradients.
- [Counted] PP04. Shrikumar et al. (2018). *Technical Note on Transcription Factor Motif Discovery from Importance Scores (TF-MoDISco)*. arXiv. https://doi.org/10.48550/arXiv.1811.00416. Type: preprint. Relevance: canonical motif-aggregation pipeline from attribution maps.
- [Counted] PP05. Schreiber (2025). *tangermeme: a Toolkit for Understanding Cis-Regulatory Logic Using Deep Learning Models*. bioRxiv. https://doi.org/10.1101/2025.08.08.669296. Type: preprint. Relevance: execution-focused toolkit spanning perturbation, attribution, and design. 2025-2026 status: verified 2026-09-04.
- [Counted] PP06. Seitz et al. (2025). *Uncovering the Mechanistic Landscape of Regulatory DNA with Deep Learning*. bioRxiv. https://doi.org/10.1101/2025.10.07.681052. Type: preprint. Relevance: SEAM clusters virtual-mutant interpretation landscapes. 2025-2026 status: verified 2026-09-04.
- [Counted] PP07. Ghotra, Lee & Koo (2021). *Uncovering Motif Interactions from Convolutional-Attention Networks for Genomics*. OpenReview. https://openreview.net/forum?id=ITOQhccyRsk. Type: workshop paper. Relevance: GLIFAC offers another route from attention to motif interaction hypotheses.
- [Counted] PP08. Schreiber, Lu & Noble (2020). *Ledidi: Designing Genome Edits that Induce Functional Activity*. bioRxiv. https://doi.org/10.1101/2020.05.21.109686. Type: preprint. Relevance: sparse differentiable genomic counterfactual design.
- [Counted] PP09. Sarkar et al. (2024). *Designing DNA With Tunable Regulatory Activity Using Discrete Diffusion*. bioRxiv. https://doi.org/10.1101/2024.05.23.595630. Type: preprint. Relevance: diffusion-based regulatory sequence design.
- [Counted] PP11. Guan, He & Zhang (2025). *Sparse Autoencoders Reveal Interpretable Structure in Small Gene Language Models*. AI4X 2025 / OpenReview; archival preprint arXiv:2507.07486. https://arxiv.org/abs/2507.07486. Type: conference/preprint record. Relevance: SAE evidence on HyenaDNA-small-32k; useful but narrower than a supervised sequence-to-function model. 2025-2026 status: verified 2026-09-04.
- [Counted] PP12. Heimersheim & Nanda (2024). *How to Use and Interpret Activation Patching*. arXiv. https://arxiv.org/abs/2404.15255. Type: preprint. Relevance: practical constraints and interpretation cautions for activation patching.
- [Counted] PP13. Kramár et al. (2024). *AtP*: An Efficient and Scalable Method for Localizing LLM Behaviour to Components*. arXiv. https://arxiv.org/abs/2403.00745. Type: preprint. Relevance: scalable linearized patching screen.
- [Counted] PP14. Hanna, Pezzelle & Belinkov (2024). *Have Faith in Faithfulness: Going Beyond Circuit Overlap When Finding Model Mechanisms*. arXiv. https://arxiv.org/abs/2403.17806. Type: preprint. Relevance: warns against weak circuit-evaluation criteria.
- [Counted] PP15. Cunningham et al. (2023). *Sparse Autoencoders Find Highly Interpretable Features in Language Models*. arXiv. https://arxiv.org/abs/2309.08600. Type: preprint / ICLR 2024 workshop record. Relevance: core SAE feature-discovery method and evaluation precedent.
- [Counted] PP16. Gao et al. (2024). *Scaling and Evaluating Sparse Autoencoders*. arXiv. https://arxiv.org/abs/2406.04093. Type: preprint. Relevance: TopK SAE scaling, reconstruction, sparsity, and feature-evaluation practices.
- [Counted] PP17. Rajamanoharan et al. (2024). *Jumping Ahead: Improving Reconstruction Fidelity with JumpReLU Sparse Autoencoders*. arXiv. https://arxiv.org/abs/2407.14435. Type: preprint. Relevance: alternative sparse activation rule and reconstruction benchmark.
- [Counted] PP18. Marks et al. (2024). *Sparse Feature Circuits: Discovering and Editing Interpretable Causal Graphs in Language Models*. arXiv. https://arxiv.org/abs/2403.19647. Type: preprint. Relevance: joins sparse features to causally tested circuit graphs.
- [Counted] PP19. Grosse et al. (2023). *Studying Large Language Model Generalization with Influence Functions*. arXiv. https://arxiv.org/abs/2308.03296. Type: preprint. Relevance: scaled influence approximation and validation at modern-model scale.
- [Counted] PP20. Ameisen et al. (2025). *Circuit Tracing: Revealing Computational Graphs in Language Models*. Transformer Circuits. https://transformer-circuits.pub/2025/attribution-graphs/methods.html. Type: first-party technical research report. Relevance: cross-layer attribution graphs built from sparse replacement features. 2025-2026 status: verified 2026-09-04.

### Authoritative first-party implementations and resource records

- [Counted] OF01. Kundaje Lab (official implementation). *ChromBPNet*. https://github.com/kundajelab/ChromBPNet. Type: official repository. Relevance: first-party bias-factorized profile/count modeling and interpretation pipeline.
- [Counted] OF02. Schreiber et al. (official implementation). *TF-MoDISco-lite*. https://github.com/jmschrei/tfmodisco-lite. Type: official repository. Relevance: actively used motif-discovery implementation derived from TF-MoDISco.
- [Counted] OF03. Schreiber (official implementation). *tangermeme*. https://github.com/jmschrei/tangermeme. Type: official repository. Relevance: first-party toolkit for perturbation, interpretation, and design.
- [Counted] OF04. TransformerLensOrg. *TransformerLens*. https://github.com/TransformerLensOrg/TransformerLens. Type: official repository. Relevance: first-party activation-caching and intervention framework for transferred tracing workflows.
- [Counted] OF05. Stanford NLP. *pyvene*. https://github.com/stanfordnlp/pyvene. Type: official repository. Relevance: declarative neural-intervention toolkit useful for patching experiments.
- [Counted] OF06. Decoder Research. *SAELens*. https://github.com/decoderesearch/SAELens. Type: official repository. Relevance: practical SAE training and analysis stack for transferred sparse-feature work.
- [Counted] OF07. Madry Lab. *TRAK*. https://github.com/MadryLab/trak. Type: official repository. Relevance: first-party implementation for scalable training-data attribution.
- [Counted] OF08. TRAIS Lab. *dattri*. https://github.com/TRAIS-Lab/dattri. Type: official repository. Relevance: first-party toolkit for data attribution experiments.
- [Counted] OF09. PyTorch. *Captum*. https://github.com/pytorch/captum. Type: official repository. Relevance: first-party implementation hub for many attribution baselines.
- [Counted] OF10. Calico Labs. *Borzoi - Predicting RNA-seq from DNA Sequence*. https://github.com/calico/borzoi. Type: official repository. Relevance: first-party Borzoi code and artifact conventions for RNA-coverage sequence models.

### Background reviews and perspectives (not counted)

- [Background only] BR01. Novakovsky et al. (2023). *Obtaining Genetics Insights from Deep Learning via Explainable Artificial Intelligence*. Nature Reviews Genetics. https://doi.org/10.1038/s41576-022-00532-2. Type: review. Relevance: broad discovery aid for genomic XAI methods.
- [Background only] BR02. de Boer & Taipale (2024). *Hold Out the Genome: a Roadmap to Solving the Cis-Regulatory Code*. Nature. https://doi.org/10.1038/s41586-023-06661-w. Type: perspective. Relevance: argues for synthetic-data and assay regimes that sharpen validation logic.
