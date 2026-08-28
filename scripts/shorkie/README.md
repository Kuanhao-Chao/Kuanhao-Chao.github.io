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
| **python ↔ browser**, same fp16 graph | **the thing actually shipped** | same argmax bin in all four track groups; peak relative difference ≤ **1.5e-3** (RNA-seq 995.0000 vs 994.0000 at bin 435) |
| TS conv stem ↔ PyTorch stem | drift in the second implementation | fixture in `src/lib/__fixtures__/`, asserted by vitest |

## python and the browser do not run the same fp16 graph

The parity row above is a bound, not a zero, and the reason is printed by onnxruntime itself:

```
[W:onnxruntime:, constant_folding.cc:484] Could not find a CPU kernel and hence can't
constant fold MatMul node '/core/attn.0/MatMul_4'
```

The desktop **CPU** provider has no fp16 MatMul kernel, so it casts the attention matmuls up to
fp32; **onnxruntime-web**'s WASM provider does not. The two therefore evaluate slightly different
graphs, and the gap between them (1.0e-3 on the RNA-seq peak) is *larger* than the gap fp16
quantisation itself introduces (2.2e-4, 995.22 → 995.00). Every argmax bin still agrees.

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
| `all_tracks` | `[1, 896, 5215]` | **every track, unreduced** — the per-track heatmap and single-track plot. Costs **+1 ms** (82 ms vs 81 ms); output payload 2.3 MB → 22.6 MB, which is an allocation, not compute |
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
