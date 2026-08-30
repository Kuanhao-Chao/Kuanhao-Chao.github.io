# Shorkie → browser: the conversion pipeline

Everything under `/variant-playground/` runs the real Shorkie model. These scripts turn the
released Keras checkpoint into the artefacts the page loads. They are **offline tooling** — none of
this runs at build time, and CI never touches it.

## Why not TensorFlow

The released weights are Keras/TF 2.15 HDF5. TF 2.15 does not support Python 3.13, and `tf2onnx` is
therefore unavailable, so the route is **h5py → numpy → PyTorch → `torch.onnx.export`**. That means
the port cannot be diffed against the original implementation, which is why the gate in
`sanity_check.py` exists and why it is not optional.

## Running it

```bash
mkdir -p scripts/shorkie/_scratch && cd scripts/shorkie/_scratch     # gitignored
curl -LO https://storage.googleapis.com/seqnn-share/shorkie_models/shorkie/f0/model_best.h5
curl -LO https://hgdownload.soe.ucsc.edu/goldenPath/sacCer3/bigZips/sacCer3.fa.gz && gunzip -k sacCer3.fa.gz
curl -LO https://hgdownload.soe.ucsc.edu/goldenPath/sacCer3/database/sgdGene.txt.gz && gunzip -k sgdGene.txt.gz
cd ../../..

python3 scripts/shorkie/sanity_check.py      scripts/shorkie/_scratch/{model_best.h5,sacCer3.fa,sgdGene.txt}
python3 scripts/shorkie/build_onnx.py        scripts/shorkie/_scratch/model_best.h5 /tmp/shorkie.onnx --fp16
python3 scripts/shorkie/make_parity_fixture.py scripts/shorkie/_scratch/{model_best.h5,sacCer3.fa,sgdGene.txt}
python3 scripts/shorkie/make_web_assets.py   scripts/shorkie/_scratch/model_best.h5 /tmp/shorkie_fp16.onnx \
                                             scripts/shorkie/_scratch/{sacCer3.fa,sgdGene.txt}
```

### Everything precomputed, per locus

```bash
python3 scripts/shorkie/make_activations.py public/models/shorkie-fp16.onnx
```

Writes `public/vp-data/<id>-{tracks,stages,stem,attn}.png` plus `<id>.json` for every locus: all
5,215 track predictions and every layer's activations, uint8 with per-row scales. 2–4 MB a locus,
56 MB total. **The page needs no model to show any of it** — verified with the model blocked at the
network layer. Decoded against a live forward pass: ≤ 2.8e-3 on every locus and tensor.

Coverage is quantized in **log** space and activations in **linear**; the sidecar's `space` field
says which. Linear quantization of coverage leaves a visible staircase on a log plot — 2.2e-1 of the
axis against 1.96e-3.

### The shipped predictions

`make_predictions.py` runs every preset locus through the model at the full 16,384 bp context and
writes `src/data/shorkiePredictions.json` — 14 loci in 1.6 s, 307 kB. Re-run it whenever the model
or the loci change:

```bash
python3 scripts/shorkie/make_predictions.py public/models/shorkie-fp16.onnx
```

Only the predictions ship. Per-stage activations are ~40 MB per locus and stay live. The point is
that the output panels are populated before the 28.6 MB model is loaded, so a missed or abandoned
click cannot leave the page looking broken. Shipped-vs-live agrees to 3.86e-4.

Sanity, which is the check that matters: TDH3 994.88, PDC1 998.14, ADH1 597.08 — and **GAL1 5.82,
GAL3 15.53**, the two galactose-inducible genes correctly near-silent in a glucose baseline.

### The measured-coverage overlay (optional)

`src/data/shorkieTruth.json` holds real RNA-seq over the eight preset windows, binned the way
Shorkie's own labels were, so the page can put a measurement beside its prediction and report a
Pearson *r*. It ships empty and the page says "no measured coverage loaded" rather than drawing a
blank axis, because the BigWigs live in a **requester-pays** bucket and cannot be fetched here:

```bash
gsutil -u <YOUR_PROJECT> cp 'gs://shorkie-paper/data/supervised/bigwigs/*_T0_*_bamcov.bw' /some/dir
python3 scripts/shorkie/make_truth.py scripts/shorkie/_scratch/{sacCer3.fa,sgdGene.txt} /some/dir
```

Needs `pyBigWig`. Files are assigned to a track group by filename; a group with no files is simply
absent from the JSON. **Bin the same way or the correlation is partly an artefact of the binning** —
16 bp sums of per-base coverage, `clip_soft = 100000`, 1,024 bp cropped from each end of the
16,384 bp window.

Needs `h5py numpy torch onnx onnxruntime onnxconverter-common`.

`--fp16` writes `<out>_fp16.onnx` **alongside** the fp32 rather than over it, so a failed conversion
does not cost a re-export, and it verifies the converted graph before returning.

### The fp16 conversion needs four things, and three of them fail silently-ish

The conversion was an undocumented ad-hoc step until now, which meant the shipped model could not be
reproduced from this repository. It is `convert_float_to_float16(keep_io_types=True)` plus:

1. **`del graph.value_info[:]` BEFORE converting.** The exporter records a type for every intermediate
   tensor; the converter rewrites the ones it walks and leaves the rest, and onnxruntime then refuses
   the model — `Type (tensor(float16)) of output arg (/Slice_3_output_0) ... does not match expected
   type (tensor(float))`.
2. **`disable_shape_infer=True`.** Otherwise the converter re-runs shape inference and repopulates
   exactly the stale `value_info` step 1 removed.
3. **`Resize` in the `op_block_list`.** Its `scales` input is `tensor(float)` in the ONNX spec whatever
   the data type is. There are three Resize nodes — the decoder's nearest-neighbour upsamples.
4. **`_restore_resize_inputs()` after converting.** `op_block_list` keeps the Resize *operator* in fp32
   but does not reach the standalone `Constant` nodes feeding it, which the converter rewrites on their
   own account. Three tensors; the function prints the count and warns on zero, because a silent zero
   would mean the walk stopped matching.

Each of the four alone still produces a model onnxruntime will not load.

**Parity must be measured on real sequence.** The export feeds the first preset locus, not random ACGT.
On random sequence the model predicts a peak of ~2.9 against ~995 on a real locus, so fp16's absolute
resolution near zero dominates and the *same graph* scores 6.9e-3 instead of 5.0e-4.

## The verification chain

Each link was run and passed; do not ship a change to `shorkie_torch.py` without re-running all of
them.

| check | what it rules out | result |
| --- | --- | --- |
| every `.h5` tensor consumed exactly once | a dropped or double-used weight | 268/268, 0 unused |
| params + buffers vs file total | a mis-shaped layer | 14,253,567 + 20 `num_batches_tracked` — exact |
| output invariants | broken Softplus / NaN | shape `(1, 896, 5215)`, all ≥ 0 |
| **ORF vs intergenic on real yeast** | **any wiring error** — a transposed kernel or a skip on the wrong tensor destroys positional correspondence | **17.9×** on six classic high-expressers |
| PyTorch outputs with/without `want_intermediates` | the activation taps perturbing the model | bit-identical |
| **ORF vs intergenic, per track group** | the output channels being labelled in the wrong order | ChIP-exo 1.20×, ChIP-MNase 1.86×, **RNA-seq 17.94×**, 1,000-strain 4.07× |
| **species index by peak magnitude** | picking the wrong species one-hot | index 109 is **rank 1 of 165 on 6/6 genes** |
| **the same ranking on non-genomic sequence** | "loudest index" masquerading as an identification | 109 falls to rank **96**, **120** and **165/165** |
| PyTorch ↔ python onnxruntime | a bad export | relative ≤ 3e-6 |
| fp32 ↔ fp16, on real sequence | quantisation damage | relative ≤ **5.0e-4** (6.9e-3 on random ACGT — see above) |
| **python ↔ browser**, same fp16 graph | **the thing actually shipped** | same argmax bin in all four track groups; peak relative difference ≤ **1.4e-3** (RNA-seq 994.8802 vs 994.4959 at bin 435) |
| TS conv stem ↔ PyTorch stem | drift in the second implementation | fixture in `src/lib/__fixtures__/`, asserted by vitest |
| **mutagenesis ↔ shipped graph** | a stale, mis-scaled, wrong-track-subset or single-strand ISM plane | 4 substitutions re-derived as logSED on both strands, worst **2.13e-4**; T0 subset 384/1148–4193; reference cells zero to the pack's resolution |
| **DTD1's strongest substitution ↔ the motif panel** | **the whole chain**: two methods sharing no arithmetic must land on the same base | ISM puts it on bp 8,165, the `GT` donor of the 71 bp intron, at **logSED −0.4541** (0.73×); scrambling the whole 5′ splice site independently gives **−34%** |
| **the paper's transform ↔ published Figure 4D** | that the site reproduces the figure, not merely something logo-shaped | the six `GTATGT` donor bases take saliency ranks **1, 2, 3, 4, 5, 9**; the rest of the top twelve is the branch point |
| **shipped packs ↔ shipped graph** | **a stale or mis-sliced precompute** — the packs are what the page draws, and nothing else compares them to the model | **54 stage-locus pairs, every loudest channel identical**; worst decode 0.6683 at `unet3`, which is that row's range / 255 |

`verify_pipeline.py` runs the whole table:

```bash
python3 scripts/shorkie/verify_pipeline.py                        # sections 1-3: repo only, no checkpoint
python3 scripts/shorkie/verify_pipeline.py _scratch/model_best.h5 # + sections 4-9
python3 scripts/shorkie/verify_pipeline.py _scratch/{model_best.h5,sacCer3.fa,sgdGene.txt}   # + the biology gate
```

The first form is the one to reach for. The packs and the fp16 graph are both committed, so the
correspondence between what the page draws and what the model computes is re-checkable on any
machine with no checkpoint and no network. It compares the **signed maximum and the argmax channel**
per stage — the two quantities the layer panel prints — so a mis-sliced pack surfaces as the wrong
channel rather than as a numeric drift small enough to dismiss.

**A checkpoint of the wrong size is not a regression.** A `model_best.h5` that is not fold f0 has a
different parameter count and, in the case that turned up during this work, a **384-wide head**; it
used to reach section 4 and die on `operands could not be broadcast (1,896,384) (1,896,5215)`. The
parameter check now halts the run naming the file and the expected count, because a number measured
against the wrong checkpoint is worse than no number: it looks like data.

## python and the browser do not run the same fp16 graph

The parity row above is a bound, not a zero, and the reason is printed by onnxruntime itself:

```
[W:onnxruntime:, constant_folding.cc:484] Could not find a CPU kernel and hence can't
constant fold MatMul node '/core/attn.0/MatMul_4'
```

The desktop **CPU** provider has no fp16 MatMul kernel, so it casts the attention matmuls up to
fp32; **onnxruntime-web**'s WASM provider does not. The two therefore evaluate slightly different
graphs, and the gap between them (3.9e-4 on the RNA-seq peak) is comparable to than the gap fp16
quantisation itself introduces. Every argmax bin still agrees.

Do not compare the two by their **displayed** values. `toFixed(2)` turned 12.6953 and 12.6875 into
"12.70" and "12.69", and an earlier run of this check compared two rounded labels that happened to
match and recorded the result as exact. The page writes the peak into `data-peak` at full precision
for this reason.

## Two things the checkpoint taught us that the paper does not say

**The input is 170 channels**: 4 DNA + 1 mask + **165 species one-hot**. A 4-channel input silently
produces garbage. `batch_input_shape` in the embedded `model_config` is the authority.

**Species index 109 is *S. cerevisiae***, and how that was established matters, because the first
attempt at it was wrong.

The species one-hot behaves almost purely as a **gain**: across all 165 settings the predicted
curve keeps its shape — pairwise correlation ≥ 0.993, mean 0.9996 — while its peak moves by a
factor of about 3. So a sweep on ORF/intergenic *contrast*, which is a ratio of two noisy means,
cannot separate the indices: on the RNA-seq channels the top five score 17.94, 17.77, 17.17, 17.12
and 17.11, and on a hold-out of 24 random genes index 109 scores 4.20 against 4.60 for the
no-species control. **That sweep identifies nothing.** (The earlier 12.1×-against-9.0× figure was
worse than that: it was measured on the ChIP-exo channels, before the track ordering was corrected.)

**Peak magnitude separates cleanly**, and index 109 is rank 1 of 165 on all six probe genes. The
control is what turns that into evidence: on block-shuffled yeast it falls to rank 96, on uniform
random ACGT to 120, and on poly-A to 165 of 165 — *below* the median in every case. So 109 is not
simply the loudest channel; it is the one that responds to real *S. cerevisiae* regulatory sequence
and goes quiet on everything else. Nothing published names it. If a future checkpoint reorders the
species, re-derive it — `sanity_check.py` runs the ranking and the control and fails if either
half stops holding.

## What the exported graph returns

Seven outputs, all fp32 (`keep_io_types`), from one forward pass — so no panel on the page is fed by a
second, decorative model:

| output | shape | what it is for |
| --- | --- | --- |
| `tracks` | `[1, 896, 4]` | the four assay-block means, for the coverage overview |
| `all_tracks` | `[1, 896, 5215]` | **every track, unreduced** — the per-track heatmap and single-track plot. Costs **+1 ms** in a paired measurement on one machine (82 ms vs 81 ms, same session); output payload 2.3 MB → 22.6 MB, which is an allocation, not compute |
| `stage_maps` | `[1, 5760, 128]` | every mapped stage in flow order: blocks 1–7 (1,536 ch), **transformer layers 1–8 (3,072 ch)**, decoder 1–3 (1,152 ch) |
| `stem_profile` | `[1, 96, 1024]` | the conv stem at higher positional resolution |
| `stem_peak`, `block_peaks` | `[1, 96]`, `[1, 1536]` | per-filter maxima |
| `attention` | `[1, 8, 128, 128]` | the attention matrices, mean over the 4 heads |

**The transformer layers were missing from this list until now.** `shorkie_torch.py` never wrote the
residual stream into `acts`, so the flow canvas fell back to drawing each layer's *attention matrix* —
an object of a different kind from every other stage's activation map, and diagonal-dominant, so only
**3.08 %** of its cells exceed 10 % of max. Eight of the twenty stages rendered near-blank. They now
carry their own `[384, 128]` feature map and paint ~40 % of their pixels.

## Seven paper/checkpoint discrepancies

Recorded in `SPEC_NOTES` in `src/lib/shorkieModel.ts` and rendered on the page, so a reader holding
the paper knows which they are looking at.

1. Input channels — not stated in the Methods; the checkpoint is 16,384 × 170.
2. Attention heads — paper says 8; `r_w_bias` is `(1, 4, 1, 64)`, so **4**.
3. Residual block — paper omits the second pointwise `Conv1D(1)` and the learned `Scale`.
4. Decoder — paper omits the `SeparableConv1D(3)` closing each stage.
5. Filters — paper says "32-filter steps"; actual is 96, 128, 160, 192, 256, 320, 384.
6. Parameters — paper says 13.7 M; the file holds 14,253,567.
7. Output track order — the Methods list the four assay blocks in one order and
   `minimal_example/sheet.txt` in another. The sheet is the authority: ChIP-exo 0–1127,
   ChIP-MNase 1128–1147, RNA-seq (TF induction) 1148–4200, 1,000-strain RNA-seq 4201–5214.
   Reading the paper's order labels the flat ChIP-exo block "RNA-seq", which still shows ORF
   enrichment (1.20×) and so survives a casual sanity check.


## In-silico mutagenesis — the paper's score, not an approximation of it

`make_ism.py` mutates every base in the window to all three alternatives and re-runs the model. It
uses the committed fp16 graph, so like the first sections of `verify_pipeline.py` it needs **no
checkpoint and no network**.

```bash
python3 scripts/shorkie/make_ism.py                      # ~66 min, all 14 loci, both strands
python3 scripts/shorkie/make_ism.py --only YDL219W --bp 24    # ~12 s smoke test
```

Four things about the measured quantity are the paper's and each one changes the numbers:

| | the paper | why it matters |
| --- | --- | --- |
| score | `logSED = log2(Σ_alt+1) − log2(Σ_ref+1)` (`ensemble.py:97-104`) | a log **ratio**, so a silent promoter and a maximal one are comparable — a linear difference is not, and that is why an earlier version of this panel had to warn readers off its own percentages |
| bins | **summed** inside each log | under a linear difference sum-vs-mean is a constant factor; inside a log it is not |
| tracks | the **384 `_T0_`** RNA-seq tracks, indices 1148–4193 (`fig4_common.py:91-95`) | Figure 5's subject is that saliency *changes* across induction timepoints; averaging all 3,053 smears the axis the paper proves is not constant |
| strands | both, averaged — every published run passes `--rc` | average the two **logSED values**, not the two coverages: the model is strongly strand-asymmetric (measured, reverse coverage runs 0.39–0.87 of forward) and that cancels inside each log ratio but not across them |

Windows are the paper's too: the **exact published window** for the six genes Figure 4 prints, and
**450 bp upstream of the TSS plus 50 bp into the gene** for the rest (`fig4_common.py:285`). Upstream
is to the left on the plus strand and to the right on the minus.

**The site's plane and the paper's are exact complements.** The site stores `alt − ref` with the
reference cell zero; the paper mean-centres across the four bases and projects on the reference
one-hot. With `P[ref] = 0` that gives `centred[ref] = −Σ P / 4` — the paper's per-position saliency
is **minus the sum of the three alternatives over four**, so the published logo is derivable from the
shipped plane with no re-run. `ismSaliency` in `src/lib/shorkieModel.ts` is that one line, and
`verify_pipeline.py` checks it recovers DTD1's `GTATGT` donor consensus as the window's six largest
saliencies — published Figure 4D, reproduced from this repository alone.

**Two results worth knowing before reading the panel.**

The sign of the largest effect still tracks whether the gene is already on — the highly expressed
promoters only lose, the silent ones only gain — but under a log ratio the magnitudes are finally
comparable. GAL3 gains **logSED +1.13**, GAL1 **+0.78** and HOP2 **+0.91** — all silent in
glucose — while the loudest promoters barely move: TDH3 **−0.07**, ACT1 **−0.06**, PDC1 **−0.29**.
That ordering is itself a result and it is legible only in log space: a maximal promoter is robust
to any single base, a silent one is a hair-trigger. Under the linear difference this panel used to
report, HOP2 read as +448 % and PDC1 as −3.9 %, and the two could not be compared at all.

And the cross-check is the strongest evidence on the page that the pipeline is right: **ISM and the
motif panel agree on one base by completely different routes.** ISM's strongest single substitution
for DTD1 lands on bp 8,165 — the exact `GT` donor of its 71 bp intron — while scrambling the whole
5′ splice site costs 34 %. Nothing is shared between the two calculations but the model. The paper's
own transform then recovers the full `GTATGT` donor consensus as the window's six largest
saliencies, which is published Figure 4D.


## Occlusion, and the two-dimensional picture

`make_occlusion.py` ablates a sliding 64 bp window and records what **every** output bin loses. One
forward pass answers the whole row, so the complete `[256 windows x 896 bins]` matrix costs 256
passes — about 22 s a locus, five minutes for all fourteen, and roughly 230 KB shipped.

```bash
python3 scripts/shorkie/make_occlusion.py --win 64
```

Ablation zeroes the four DNA channels, which is how the paper's language model masks a position and
is indistinguishable from a run of N. That is a *different question* from the motif knockouts, which
shuffle: a shuffle preserves base composition and asks whether the arrangement matters, zeroing asks
whether the stretch carries information at all.

**Read both halves of the map.** Per cell the diagonal dominates — ablating a window damages the
output above it. But the diagonal is one window in 256, so summed across a row the local footprint is
only **0.2–5.6 %** of the most damaging window's total effect. The model is most intense locally and
does most of its work at range; either statement alone is half the truth.

## Integrated gradients, and why they are not mean-centred

`make_attribution.py` now emits five planes. Two of them are new:

| plane | shape | what it is |
| --- | --- | --- |
| `positions` | `[112 x 18*128]` | the per-stage **positional** margin — the axis the generator used to discard |
| `ig` | `[anchors x 16384]` | integrated gradients, 32 steps from an all-zero-DNA baseline |

Both margins are **exact** and both **superpose**, because gradients are linear in which outputs you
select. So an arbitrary contiguous region's per-channel *and* per-position relevance is a row-sum of
the precomputed groups — no model run, computed in the browser.

The positional margin is not a nicety. The site previously estimated it as the channel margin times
the stage's *activation*, and the two turn out to be essentially uncorrelated: `corr` runs −0.08 to
0.23 across the stages, and the argmax positions disagree completely. For a region at bp
1,536–3,088 the exact margin peaks at bottleneck positions 12–24 — where the region actually is —
while the estimate peaks anywhere from 15 to 105.

Gradient × input is now **mean-centred** across the four bases before projecting (the Borzoi
convention, and what makes it comparable with the paper's ISM saliency) and differentiates
`log2(T0 coverage + 1)` over the region — the same scalar logSED measures.

**Integrated gradients is deliberately NOT mean-centred.** Completeness — that the attributions sum
to `f(x) − f(baseline)` — is IG's entire reason for being, and that identity is a telescoping
integral of the raw gradient. Measured: mean-centred, the completeness error ran **8–650 %**;
un-centred it is **0.4–13 %** at 32 steps. The generator records the sum, the true gap and the error
both absolutely and relatively, because a near-zero gap turns a 0.04 absolute miss into "652 %".

## An indexing trap that shipped once

`y[0, a:b, T0]` on a `[1, bins, tracks]` array returns **(tracks, bins)**, not (bins, tracks): an
integer index beside an array index makes numpy treat the integer as advanced too and move the
broadcast axis to the front. So `y[0, a:b, T0].mean(axis=-1).sum()` averages over bins and sums over
tracks — the paper's quantity with its axes swapped.

It shipped in the mutagenesis generator, and `verify_pipeline.py` re-derived it **with the same wrong
indexing**, so the check agreed with the pack and passed. The damage was small — logSED is a log
ratio and the coverage sums far exceed the +1 pseudocount, so a constant factor cancels; the worst
error across all fourteen loci was 5e-3, at or below the packs' uint8 floor — but the check was
worthless while both sides shared the mistake. Index in two steps: `y[0][a:b][:, T0]`.


## The strand convention, and what rc-averaging is here

Every **input-space** method — mutagenesis, gradient × input, integrated gradients, occlusion —
averages both strands, matching Borzoi and the `--rc` every published Shorkie ISM run passes. The
per-stage **relevance margins** deliberately do not: they describe the internal state of one forward
pass, and a forward/reverse average is not a state the model is ever in.

**This model is not reverse-complement equivariant, so that averaging is a real choice rather than a
free symmetry.** `augment_rc: false` in all four `params.json`. Measured on TDH3, the target reads
**15.60 forward against 14.23 reversed**, and the two gradients correlate at **0.31**.

The mapping is `g.flip(0)[:, [3,2,1,0]]`: `rc` is a permutation, so it is its own inverse and
`d f(rc x)/dx = rc(df/dy)`. Getting it wrong is silent — the numbers stay the same size and land on
the wrong bases — so `verify_pipeline.py` checks it against a finite difference on the real model.
**Test at eps ≤ 1e-2.** A first attempt used eps = 1.0 on a one-hot input, which is not a small
perturbation, and the check failed against correct code.

**rc-averaging an attribution means rc-averaging its completeness target too.** Averaging the IG
attributions while leaving the gap forward-only pushed the completeness error from 0.002–0.15 to
**0.22–0.57**. The average of two complete decompositions is a complete decomposition of the
average, so the gap must be `½[f(x)−f(b)] + ½[f(rc x)−f(rc b)]`.

Measured with that, over **all 138 region-locus pairs** at 32 steps: absolute gap **0.0019 to
0.1325** (median 0.0488), worst at `YDR009W/YDR010C` where the target itself moves −3.10; relative
**0.14 % to 9.41 %** over the 81 regions whose target moves by more than 1. A single-locus smoke
test during development reported 0.016–0.087 — the full run is three times wider at the top, which
is what a range measured on one locus is worth. Every region's own numbers are in the pack's
`anchors`, and the panel prints the check beside the track.

## Why mutagenesis is not a full-window track

A forward pass is **104 ms** and the ONNX batch axis is fixed at `[1, 16384, 170]`, so batching
cannot help. 16,384 bp × 3 substitutions = 49,152 passes = **1.4 h a locus** on one strand,
**39.6 h** for all fourteen on both. It stays on the promoter window, where its span is the point;
the full window is covered by occlusion (256 passes, exact, measured) and by integrated gradients at
single-base resolution.

## The drawn curve and the attributed quantity

The coverage curve is the 3,053-track RNA-seq group mean. Every attribution scores the 384 `_T0_`
subset the paper uses. Measured, they correlate at **r = 1.0000** and differ by **1 %** at the peak
— worth stating on the page, not worth "fixing".
