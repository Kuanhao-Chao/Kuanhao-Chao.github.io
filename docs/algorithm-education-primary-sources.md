# Algorithm education: primary sources and teaching contracts

Verified against primary papers, author-maintained documentation, and reference implementations on 2026-10-10. This is the source and mathematical contract for the educational redesign, not a benchmark or a claim that every implementation change has passed verification.

## Scope and editorial rules

The catalog currently contains 13 destinations: 11 standalone algorithm lessons, the Wheelie/WGT post, and Shorkie Lab. This redesign covers the catalog and the 11 standalone lessons below. Wheelie and Shorkie Lab retain their existing destinations and are outside the lesson redesign.

Each lesson should have two layers: intuition and a tiny worked example first; notation, recurrence, boundary conditions, complexity, and limitations second. The examples and implementation requirements in this note are original teaching choices or mathematical derivations, not claims that the cited authors used these exact examples. Citations identify the method being taught; they do not confer validation on synthetic data, hand-picked settings, or a browser implementation.

Suggested learning paths:

| Starting question | Sequence of lessons |
| --- | --- |
| How do we compare two sequences? | Pairwise alignment → WFA → alignment duel |
| How do we find and map a sequence? | FM-index → minimap2-inspired seed chaining |
| How do short fragments represent a genome? | De Bruijn graph → string graph |
| How do we infer hidden biological structure? | Profile HMM → generalized HMM |
| How do we measure sequence sensitivity and association? | ISM → GWAS |

Use these distinctions throughout:

- An optimum score can be unique even when multiple alignments or paths attain it.
- A computed optimum is optimum for the declared objective and constraints, not automatically the biological truth.
- A pedagogical implementation is not a complete implementation of the production program whose ideas it illustrates.
- Operation counts are not wall-clock speedups. Count what the engine actually does and define each unit.
- Synthetic scores are not trained probabilities, experimental measurements, clinical predictions, or published benchmark results.
- Show initialization, computation, termination, and reconstruction as distinct stages. Animate the actual computation trace, not only the final answer.

## 1. Pairwise alignment

### Sources and boundaries

Global sequence alignment originates with [Needleman and Wunsch (1970)](https://www.gersteinlab.org/courses/452/05-fall/readings/needleman-wunsch-orig-dyn-prog-paper.pdf); local alignment with [Smith and Waterman (1981)](https://cs.brown.edu/courses/csci1820/spring-2022/resources/Smith_Waterman_1981.pdf); efficient affine-gap alignment with [Gotoh (1982), bibliographic record](https://pubmed.ncbi.nlm.nih.gov/7166760/). The modern conventions below are also documented by the first-party [Biopython pairwise alignment guide](https://biopython.org/docs/latest/Tutorial/chapter_pairwise.html). The Gotoh record verifies authorship and publication metadata; it is not a substitute for inspecting a recurrence.

### Mathematical contract

For this lesson, target `T` of length `m` consumes the row coordinate `i` and query `Q` of length `n` the column coordinate `j`. `H(i,j)` is the best score for the indicated prefixes. With linear gap score `g < 0` and substitution score `s`, the recurrence is

\[
H(i,j)=\max\{H(i-1,j-1)+s(T_{i-1},Q_{j-1}),\ H(i-1,j)+g,\ H(i,j-1)+g\}.
\]

Declare the alignment mode before filling the matrix:

| Mode | Boundary | Endpoint and stopping rule |
| --- | --- | --- |
| Global | `H(i,0)=i g`, `H(0,j)=j g` | End at `(m,n)`; traceback to `(0,0)` |
| Local | Zero borders; include `0` as a candidate | End at a matrix maximum; stop at zero |
| Query fitting | `H(i,0)=0`, `H(0,j)=j g` | End at the best `(i,n)` over all `i`; stop when `j=0` |

The site's semiglobal option should explicitly mean **fit the complete query within the target, with free target flanks**. Do not mix this with symmetric free-end overlap alignment. Mark the unaligned target flanks separately from the scored core.

Preserve the pairwise lesson's first-base affine convention:

\[
G(\ell)=g_{\rm first}+(\ell-1)g_{\rm extend},\qquad \ell\ge1.
\]

An aggregate-score formulation uses horizontal-gap state `I`, vertical-gap state `D`, and diagonal candidate `M`:

\[
\begin{aligned}
I(i,j)&=\max\{H(i,j-1)+g_{\rm first},I(i,j-1)+g_{\rm extend}\},\\
D(i,j)&=\max\{H(i-1,j)+g_{\rm first},D(i-1,j)+g_{\rm extend}\},\\
M(i,j)&=H(i-1,j-1)+s(T_{i-1},Q_{j-1}),\\
H(i,j)&=\max\{M(i,j),I(i,j),D(i,j)\}.
\end{aligned}
\]

Here `H` is aggregate; `M` is the diagonal candidate. Do not interchange these meanings with a strict match-state-only recurrence. With this aggregate formulation, validate a conventional gap setting in which reopening a gap is not cheaper than extending it. Keep state-specific predecessors for traceback; aggregate arrows alone can reconstruct a gap placement whose score differs from the reported optimum. These equations are a teaching derivation under the declared conventions, not a quotation from the historical papers.

### Worked example, animation, and tests

Start with `ACG` versus `AG`: predict whether a mismatch or a gap is preferred, then inspect each predecessor calculation. Use `A` versus `AAC` as an affine traceback regression: a reported score of `-2` under match `+2`, mismatch `-1`, first gap `-3`, extension `-1` must not be reconstructed as `-A- / AAC`, which rescales to `-4`.

Reveal boundary cells before interior cells; display tied predecessors without implying that all ties are explored. At reconstruction, show a ledger of match, mismatch, gap-opening, and extension contributions. Full-table teaching DP is `O(nm)` time and memory; score-only linear-memory variants are a separate topic. Test complete sequence consumption, independent rescoring, ties, local zero termination, and fitting endpoints.

## 2. Wavefront alignment

### Sources and boundaries

[Marco-Sola et al. (2021), sections 2.1–2.3](https://academic.oup.com/bioinformatics/article/37/4/456/5904262) define exact global gap-affine WFA with zero match cost and gap cost `o + ℓ e`. The original bound is `O(Ns)` time and `O(s²)` stored-wavefront memory for fixed penalties, where `N=max(n,m)` and `s` is the optimum cost. Even cost-zero identical sequences require character comparisons. [WFA2, the authors' implementation](https://github.com/smarco/WFA2-lib) distinguishes exact computation, optional heuristics, and memory modes. The browser lesson is the basic exact method, not every WFA2 feature.

### Mathematical contract

Keep `i` as the target row coordinate, `j` as the query column coordinate, and diagonal `k=j-i`; target length is `m` and query length is `n`. If the stored offset is **`i`**, the published horizontal-offset recurrence must be converted rather than copied:

\[
\begin{aligned}
I_{s,k}&=\max\{M_{s-o-e,k-1},I_{s-e,k-1}\},\\
D_{s,k}&=\max\{M_{s-o-e,k+1},D_{s-e,k+1}\}+1,\\
U_{s,k}&=\max\{M_{s-x,k}+1,I_{s,k},D_{s,k}\},\\
M_{s,k}&=U_{s,k}+\operatorname{LCP}(T[U_{s,k}:],Q[U_{s,k}+k:]).
\end{aligned}
\]

This is an explicit coordinate conversion: an insertion consumes a query base and increments `j`, not `i`; a deletion consumes a target base and increments `i`. The paper stores the horizontal offset and therefore places the `+1` on insertion instead. Never mix the two coordinate conventions.

Initialize `M(0,0)=0`, then extend exact matches. Unreachable states are absent or negative infinity, not zero. Validate coordinates before extending or considering a predecessor. Stop only when a frontier reaches `(m,n)`, on diagonal `n-m`.

Use positive integer mismatch/extension costs and a declared nonnegative opening cost for the score-stepped teaching engine. A score cap is a resource limit, not a successful zero-cost result. A valid upper bound can be derived from an explicit legal alignment: align the first `min(n,m)` bases and put any unmatched suffix in one gap. Traceback must distinguish a zero-consumption state switch from an emitted gap or substitution, and must undo each LCP extension separately.

### Worked example, animation, and tests

`A` versus `AA` with `x=2, o=3, e=1` has cost `4`, one match, and one inserted base. `ACGT` versus `ACGGT` also has cost `4`; alternate placements within the repeated `G` can tie. Show mismatch/open/extend candidates, the selected furthest offset, and then zero-penalty LCP extension as separate events. Count character comparisons and state updates independently. Test against a separately implemented affine DP oracle, including unequal lengths, leading/trailing gaps, all mismatches, and cost-zero identity.

## 3. Alignment duel

### Sources and mathematical contract

The duel compares two ways of solving **the same global affine-cost problem**, not an unrestricted positive-match-score Needleman–Wunsch problem against a different WFA objective. The [original WFA paper, Eq. 1](https://academic.oup.com/bioinformatics/article/37/4/456/5904262) gives the DP cost formulation; [Biopython's affine-gap convention](https://biopython.org/docs/latest/Tutorial/chapter_pairwise.html#affine-gap-scores) explains the common alternative first-base parameterization.

Use match cost `0`, mismatch cost `2`, and `gap(ℓ)=3+ℓ`. A score-maximizing DP engine with `first+(ℓ−1)extend` must therefore receive match `0`, mismatch `-2`, first gap `-4`, and extension `-1`. Negating an opening value of `3` alone is not an equivalent objective. Label the competitors **affine dynamic programming** and **WFA**.

### Worked example, interaction, and tests

Run `ACGT / ACGGT` through both engines and independently rescore both outputs to cost `4`. Different gap placements can be equally valid; compare optimum costs, not exact traceback strings. Next introduce more mismatches and ask why WFA explores more score layers.

Display DP state/cell calculations, wavefront state calculations, and character comparisons with defined units. Playback speed and DOM rendering time are not algorithm benchmarks. Remove manufactured “times faster” ratios. A pause or seek should expose each engine's genuine partial state without announcing a winner from precomputed but unrevealed results. Test objective conversion, agreement with independent rescoring, ties, and each displayed counter's trace provenance.

## 4. FM-index

### Source and boundaries

[Ferragina and Manzini's original paper](https://people.unipmn.it/manzini/papers/focs00draft.pdf) introduces backward search over the BWT and locating through sampled positions and LF navigation. Count complexity assumes a rank data structure; locating requires additional work. A display containing every rotation, the full suffix array, and dense occurrence tables explains an FM-index but is not itself a compressed index.

### Mathematical contract

Use zero-based rows and the existing **inclusive** interval `[sp,ep]`. Define `C(c)` as the number of text characters smaller than `c`, and `Occ(c,r)` as the number of `c` characters in `BWT[0:r]`, with the endpoint excluded:

\[
sp'=C(c)+Occ(c,sp),\qquad ep'=C(c)+Occ(c,ep+1)-1.
\]

The interval is empty when `sp'>ep'`. Count is `max(0,ep−sp+1)` after processing the entire pattern. LF navigation is

\[
LF(r)=C(BWT[r])+Occ(BWT[r],r).
\]

Require exactly one terminal sentinel smaller than the normal alphabet. For ordinary biological/text substring queries, reject the sentinel in the pattern; otherwise explain cyclic wraparound explicitly. Empty input is not an instruction to silently substitute `BANANA`.

### Worked example, animation, and tests

For `BANANA$`, `SA=[6,5,3,1,0,4,2]` and `BWT=ANNB$AA`. Backward search for `ANA` gives `[0,6] → [1,3] → [5,6] → [2,3]`, hence two matches at positions `1` and `3`.

Teach construction, LF, backward search, count, and locate as separate stages. In a simple sampled-SA lesson, sample by **suffix position** modulo spacing `d`, not arbitrary row number; LF decrements that position modulo text length, so at most `d−1` hops reach a sample. Recover a position as `(sample+hops) mod N`. Constant-time rank gives `O(|P|)` counting; this sampled locate takes up to `O(occ·d)` extra rank steps. Dense construction, rendering, and sorting output positions are additional costs. Test against naive substring search, LF recovery, sentinel validation, and several sampling spacings.

## 5. Minimap2-inspired seed chaining

### Sources and boundaries

[Li's minimap2 paper, chaining Eq. 1](https://arxiv.org/html/1708.01492v2) separates minimizer indexing, seed matching, chaining, and base-level extension. Its exhaustive chaining recurrence is quadratic in anchor count; predecessor-search heuristics improve average work but can miss the optimum. The [author-maintained chaining implementation](https://github.com/lh3/minimap2/blob/master/lchain.c) provides the production counterpart. A small forward-strand exact-seed demonstration with an alternate gap cost is not the complete mapper.

### Mathematical contract

An anchor `(x_i,y_i,w_i)` describes matching intervals ending at reference `x_i` and query `y_i`. For a compatible earlier anchor `j`, define `Δx=x_i−x_j`, `Δy=y_i−y_j` and

\[
\alpha(j,i)=\min\{\Delta x,\Delta y,w_i\},\qquad
f(i)=\max\{w_i,\max_j[f(j)+\alpha(j,i)-\beta(j,i)]\}.
\]

Require positive coordinate advances and apply the declared distance restrictions. The `w_i` starting reward and the predecessor candidate are alternatives: do **not** add a second `w_i` to every predecessor candidate. The newly covered span `α` prevents overlap from being rewarded twice. If using a simpler linear gap cost rather than the paper's concave cost, display that exact teaching formula and label it as an alternate objective.

### Worked example, animation, and tests

With width-three anchors advancing by two bases on both axes, the second anchor contributes at most two new bases. With zero gap penalty, a chain starting at `3` reaches `5`, not `8`. Add an out-of-order anchor to show a rejected predecessor, then repeated sequence to show mapping ambiguity.

Reveal k-mers, minimizer windows and ties, deduplicated minimizers, seed hits, candidate predecessors, and traceback in order. Distinguish a chained seed span from a base-level alignment: skipped bases have not yet been aligned. Define toy hash/tie handling and missing reverse-complement, frequency-filtering, mapping-quality, and extension features. Test overlapping anchors, repeated hits, incompatible predecessors, no hits, and the precise displayed gap formula.

## 6. De Bruijn graph assembly

### Source and boundaries

[Pevzner, Tang, and Waterman (2001)](https://pmc.ncbi.nlm.nih.gov/articles/PMC55524/) describe k-mer graphs, Eulerian traversal, error handling, and restoring read-path constraints. Their examples explicitly demonstrate multiple Eulerian reconstructions of a repeat-containing graph. An Eulerian walk is not automatically a unique or biologically correct genome assembly.

### Mathematical and data contract

In the edge-centric representation, a k-mer contributes an edge from its `(k−1)`-base prefix to its `(k−1)`-base suffix. Keep two separate meanings:

- **Ideal k-mer multiset:** multiplicity denotes copies that the Eulerian traversal must consume.
- **Observed reads:** coverage counts repeated observations; it is evidence, not automatically genomic copy number.

For an ideal directed Eulerian path, balance must hold at every vertex except one possible start with `out−in=1` and one end with `in−out=1`; the nonzero-degree support must also be connected appropriately. Confirm that the resulting traversal actually consumes every required edge copy. Degree checks alone do not certify disconnected graphs.

### Worked example, animation, and tests

`ATGAC`, `k=3`, contributes `ATG,TGA,GAC`, yielding `AT→TG→GA→AC`. Spell the initial vertex, then append the last character of each consumed edge. Animate Hierholzer's stack, edge consumption, dead end, backtracking, and final reversed walk; those are different from merely highlighting a precomputed answer. For a cycle, explain the arbitrary starting rotation.

Unitigs follow nonbranching **topology**: repeated support of one edge is not several alternative successors. Preview tip clipping and bubble removal with explicit length/support criteria, preserve equal-support alternatives, and allow undo. Tell learners that a low-support branch can represent real variation or incomplete coverage. Construction and Hierholzer traversal are linear in their supplied data/edge copies under suitable data structures; noise removal and resolving read constraints are separate problems. Test edge multiplicity, disconnected components, cycles, isolated components, topology-based unitigs, and reversible cleaning.

## 7. String graph assembly

### Source and boundaries

[Myers (2005), sections 2–3](https://www.cbcb.umd.edu/confcour/CMSC828H-materials/Myers-string-graphs.pdf) requires transitive reduction to preserve the sequence spelled by equivalent overlaps. Its expected-linear reduction claim relies on a specialized algorithm and assumptions; it does not apply automatically to arbitrary triangle deletion. The production formalism is bidirected and handles read orientation. A single-orientation, exact-overlap browser lesson must disclose those limits.

### Mathematical contract

An overlap edge `A→B` is labelled with the nonoverlapping suffix added from `B`. Removing `A→C` is valid only when an alternate path preserves the extension label and the placement of `C` relative to `A`. Mere reachability via `B` is insufficient. Exact duplicate reads should retain a deterministic representative; do not mark every identical read contained and erase all representatives.

### Worked example, animation, and tests

Use the following original regression example at minimum overlap three:

```text
A = CCCTTATTA
B = TTATTATTA
C = TTATTAGGG
```

Each relevant longest overlap is six bases. Direct `A→C` appends `GGG`; `A→B→C` appends `TTA` and then `GGG`. These paths spell different sequences and place `C` differently; therefore the direct edge must remain. Contrast this with a true redundant edge and show its matching label/placement evidence before removing it.

Display read placement and containment before overlap edges, reduction evidence before deletion, then maximal nonbranching paths. Preserve isolated reads and cyclic components. Call exact string concatenation **spelling/layout**, not a noisy-read consensus algorithm. A naive all-pairs overlap scan depends on read count, length, and string-comparison implementation; disclose that actual implementation rather than borrowing Myers's expected bound. Test duplicate representatives, labelled-path equivalence, the counterexample above, isolated reads, and cycles.

## 8. Profile HMM

### Sources and boundaries

The [HMMER manual, Plan7 architecture](https://eddylab.org/software/hmmer/2.3.1/Userguide.pdf) distinguishes match/insert/delete core states from the full architecture's special states and modes. The first-party [generic Forward/Backward implementation](https://github.com/EddyRivasLab/hmmer/blob/master/src/generic_fwdback.c) supplies recurrence/dependency guidance. The site's deliberately smaller model should be called a **global profile-HMM core**, not a complete HMMER Plan7 search engine.

### Mathematical contract

Let `i` be consumed sequence length and `k` profile position; in these equations the sequence is written `x_1,…,x_L`. Match `M_k` consumes one residue and advances `k`; insert `I_k` consumes a residue without advancing `k`; silent delete `D_k` advances `k` without consuming a residue. In probability space, away from explicitly declared boundaries:

\[
\begin{aligned}
F^M_{i,k}&=b^M_k(x_i)\left(a^{MM}_{k-1}F^M_{i-1,k-1}+a^{IM}_{k-1}F^I_{i-1,k-1}+a^{DM}_{k-1}F^D_{i-1,k-1}\right),\\
F^I_{i,k}&=b^I_k(x_i)\left(a^{MI}_kF^M_{i-1,k}+a^{II}_kF^I_{i-1,k}\right),\\
F^D_{i,k}&=a^{MD}_{k-1}F^M_{i,k-1}+a^{DD}_{k-1}F^D_{i,k-1}.
\end{aligned}
\]

Specify Begin/End transitions, including any permitted initial/trailing deletion or insertion paths. In log space, sums become log-sum-exp; Viterbi replaces them with maxima. Fill states in dependency order, including current-row silent deletions. Backward must follow every permitted successor, using the next residue only for emitting successors and the same `i` for silent ones.

Posterior occupancy is `exp(logF+logB−logZ)` with consistent emission accounting. At each consumed residue, **match plus insert** emission posteriors sum to one; silent deletion occupancies are not part of that per-residue partition. This is a mathematical consequence of the declared global core, not a claim that HMMER's log-odds search scores are raw sequence probabilities.

### Worked example, animation, and tests

A three-position `ACG` profile with query `AG` must permit `M1→D2→M3` when those transitions are enabled. Animate profile construction, emission pseudocounts, the declared transition table, cell dependencies, end aggregation, and reconstruction separately. Explain what the MSA estimates versus what the demonstration fixes by hand.

Verify `logForward ≥ logViterbi`, Forward/Backward agreement, normalized outgoing probabilities including End, and normalized emission posteriors. Exhaustive legal-path enumeration on tiny models is an independent oracle. Zero-probability transitions remain impossible; do not replace every zero with a small positive probability. Constant-degree profile recurrences use `O(LK)` time; retaining all teaching tables uses `O(LK)` memory.

## 9. Generalized HMM gene prediction

### Sources and boundaries

[Burge and Karlin's GENSCAN paper](https://pubmed.ncbi.nlm.nih.gov/9149143/) establishes models combining signals, composition, and region lengths; [Stanke and Waack's AUGUSTUS paper](https://academic.oup.com/nar/article/32/suppl_2/W309/1040489) describes explicit duration modeling and a much richer forward/reverse-strand model. The lesson is a restricted **forward-strand, complete-gene teaching grammar**, with an explicit no-gene alternative, not GENSCAN/AUGUSTUS accuracy or a complete eukaryotic annotation system.

### Mathematical contract

A segment-ending recurrence is

\[
V_s(t,\phi)=\max_{r,d,\phi'\,\mathrm{compatible}}\left\{V_r(t-d,\phi')+\log a_{rs}+\log p_s(d)+E_s(x_{t-d:t};\phi')\right\}.
\]

Here `d` is segment duration, `r→s` an allowed predecessor, and `φ` carries coding phase. Incompatible phases must not be collapsed into one maximum: a coding segment advances phase by its coding length modulo three; an intron preserves it. Use zero-based half-open internal intervals and label display coordinates explicitly. Normalize duration distributions over the permitted teaching support and outgoing transitions over permitted states. If `E_s` includes hand-crafted bonuses rather than a proper log-emission probability, call the result a **model score**, not a calibrated likelihood or confidence probability.

Canonical `GT` donor and `AG` acceptor bases belong to the **intron**, not the translated exon. Maintain coding phase across introns, check codons in the spliced coding sequence, and require valid completed endpoints. A favorable unfinished initial exon must not become a completed-gene result.

### Worked example, animation, and tests

An original split-codon example is exon `ATGA`, intron `GTCCCAG`, exon `AATAA`. Splicing gives `ATGAAATAA`: start `ATG`, internal `AAA`, stop `TAA`. The middle codon crosses the exon junction, illustrating why each exon cannot restart frame zero. Treat the short intron and duration range as a teaching scale, not typical human lengths.

Animate candidate durations, valid/invalid boundary signals, predecessor scores, phase, selected segment, and traceback. Include a no-gene sequence, a mutated splice boundary, and competing donor choices. Test intron coordinates, full CDS translation, terminal validity, phase-split codons, and the no-gene path. With cached segment emissions, sparse allowed transitions yield `O(LD|E|)` work; a dense predecessor graph yields `O(LD|S|²)`. Rescanning each segment introduces additional duration-dependent work.

## 10. In silico mutagenesis

### Sources and boundaries

The first-party [OpenSpliceAI variant-analysis documentation](https://ccb.jhu.edu/openspliceai/content/behind_scenes.html) describes reference/alternate inference and splice gain/loss deltas. The [SpliceAI README](https://github.com/Illumina/SpliceAI/blob/master/README.md?plain=1) scopes its own model and reported delta events. Neither source validates a synthetic PWM teaching scorer or transfers clinical thresholds to it. Use no claim of neural inference, GENCODE calibration, clinical prediction, or reproduction of a published figure unless actually demonstrated with the relevant data and model.

### Mathematical contract

For a declared output `f`, position `i`, and alternate base `b`:

\[
\Delta_{i,b}=f(x^{i\to b})-f(x).
\]

Show the reference score first, then the three alternate substitutions per position. There are `3L+1` model evaluations including one reusable reference evaluation; complexity is `O(L C_f)`, where `C_f` is one forward evaluation's cost, before batching/vectorization qualifications. The unchanged reference-base cell is zero and needs no additional inference.

Expose the synthetic scorer's coefficients, transformation, and any canonical-site gate. A recommended two-sided importance summary is mean absolute sensitivity, `I_i=(1/3)Σ_{b≠x_i}|Δ_{i,b}|`. If using mean positive loss instead, give that formula and label it accordingly; it is not signed mean delta. Use the same color thresholds in code, prose, and legend.

### Worked example, interaction, and tests

Use synthetic donor and acceptor contexts with an explicit junction coordinate. For a donor boundary `j` at the first intronic base, the canonical motif is `x[j:j+2]=GT`; for an acceptor boundary `j` at the first exonic base, it is `x[j−2:j]=AG`. Mutate a canonical base and a distant weakly weighted base, then compare signed score changes.

Inspection/hover must only preview the mutation. Applying it requires an explicit action, with Undo and Reset reference. Clearly show which sequence is the current reference after an edit. Test determinism, all alternate bases, zero reference deltas, coordinate handling, formula/legend consistency, and reversible edits. Sensitivity of a model output does not establish a causal molecular mechanism or pathogenicity.

## 11. GWAS

### Sources and boundaries

[PLINK 2's first-party association documentation](https://www.cog-genomics.org/plink/2.0/assoc) distinguishes quantitative linear regression, binary logistic/Firth regression, fixed covariates, and limitations concerning close relatedness. [Price et al. (2006)](https://www.nature.com/articles/ng1847) motivate genotype-derived principal components for stratification adjustment. This lesson should execute an explicitly labelled, seeded **quantitative-trait simulation**; discuss logistic regression and mixed models without claiming that the browser actually runs them.

### Mathematical contract

For variant `j`, fit the same generated individuals' phenotype and dosage using

\[
y_i=\alpha+\beta_jg_{ij}+\sum_c\gamma_c z_{ic}+\epsilon_i.
\]

The intercept, genotype, and covariates belong in one joint design. In a full-rank OLS teaching model with normal errors, residual variance uses `n−rank(X)` degrees of freedom, and a coefficient's t statistic uses its estimated standard error and the corresponding t distribution. One pass of sequentially subtracting projections onto correlated covariates is not a joint adjustment. Return an explicit unidentifiable result for a singular design rather than manufacturing a valid p-value. The displayed fitted line must use the selected variant and the fitted intercept.

Generate reproducible dosage blocks with LD, genotype-derived PCs, phenotype, and independent validation data. Recompute regressions when adjustment changes; do not add noise to already generated p-values to simulate correction. Every panel must derive from this same declared cohort and report its actual `n`.

### Worked example, animation, and tests

First simulate an effect-bearing variant and correlated neighbors. Then introduce two synthetic ancestry groups with differing allele frequencies and an environmental phenotype shift. Toggle joint PC adjustment and inspect an individual regression before comparing Manhattan/QQ plots; do not promise that every seed returns inflation exactly one or that PCs preserve every signal.

Label local LD as genotype-dosage correlation squared and recompute it when the lead variant changes. Association peaks and LD colors are not posterior causal probabilities: [the first-party SuSiE fine-mapping example](https://stephenslab.github.io/susieR/articles/finemapping.html) separately defines PIPs and credible sets, which the lesson does not compute.

Compute a demonstrated PRS from stated discovery weights and show evaluation on independent simulated individuals. Do not replace that evaluation with arbitrary shifted bell curves or describe the score as universal lifetime disease risk. Mark synthetic coordinates, identifiers, units, effect sizes, and ancestry labels explicitly.

Test determinism, selected-variant regressions, correlated-covariate adjustment against a joint-fit oracle, residual degrees of freedom, LD symmetry/lead changes, QQ derivation from fitted p-values, and held-out PRS provenance. State regression and PCA dimensions before making complexity claims; reuse of a fixed covariate projection is an optimization, not a justification for a universal `O(variants×samples)` claim.

## Cross-lesson interaction and verification guidance

These are implementation recommendations, not findings attributed to the algorithm papers:

- Start paused, before the answer. Offer previous/next, play/pause, reset, speed, seek, and an explicit show-result action.
- A trace event records its phase, actual operands, chosen transition, explanation, and relevant pseudocode location. Rendered numbers and counters come from that trace.
- Backward stepping and seeking reconstruct the exact state; they do not rerun randomness or progressively mutate the model.
- Changed inputs pause playback and invalidate stale outputs. Validate and bound custom inputs; state any teaching limits before computation.
- Support tap/click and keyboard inspection with a pinned text inspector. Hover may supplement, but must not be the only way to read evidence.
- Scope shortcut handling to the interactive component. Do not steal ordinary space/arrow navigation from document reading or native controls.
- Preserve diagram positions during playback and keep motion brief and explanatory. Reduced-motion mode uses instant state changes.
- Stack controls and inspectors on phones. Confine horizontal scrolling to labelled diagram/table regions; never create page-wide overflow.
- Keep static explanations meaningful without JavaScript. On Astro pages, render mathematics through the existing `Katex.astro` component; literal dollar delimiters in an Astro template are not a math-rendering pipeline.
- Browser verification covers all 11 routes, not only representative lessons: beginning/middle/end, invalid inputs, input edits, pause/seek, keyboard/tap inspection, reduced motion, navigation/remount cleanup, and desktop/tablet/375-pixel/320-pixel widths.
- Correctness tests use independent small oracles before presentation assertions. Browser audits confirm that real results reach the screen, including regional GWAS plots and mobile ISM controls.

## Citation and release discipline

Keep references beside the claims they support on the final lesson pages. Historical attribution, modern production behavior, the browser's exact objective, and original teaching examples should be distinguishable. A source's benchmark speedup must never become the browser lesson's performance claim. If the toy model omits reverse strands, full HMM special states, experimental calibration, or production heuristics, put that limitation near the first relevant interaction, not only in a footnote.

This note does not change public indexing policy, model hosting, Shorkie Lab, unrelated Deep Dive consumers, or the background animation. Before release, run the repository's prescribed type/content checks, test suite, build, and post-build indexing audit, followed by the algorithm browser audit and deployment verification. Passing checks belongs in a separate verification record; do not infer it from source research alone.
