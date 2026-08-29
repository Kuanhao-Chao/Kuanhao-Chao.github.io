"""
Export the ported Shorkie model to ONNX for the browser, and verify the export against the
PyTorch reference.

The exported graph returns the predicted track *and* the intermediate activations the playground
draws, so every panel on the page is fed by the same forward pass that produced the prediction --
there is no second, decorative model. The intermediates stay in process memory (ORT hands back
typed arrays), so a few megabytes per inference costs a copy, not a download.

With --fp16 the graph is converted in place after the parity check, with keep_io_types=True so
inputs and outputs stay float32 and the browser keeps receiving Float32Array with no decode cost.
The conversion used to be an undocumented ad-hoc step, which meant the shipped model could not be
reproduced from this repository.

Usage:  python3 scripts/shorkie/build_onnx.py <checkpoint.h5> <out.onnx> [--fp16]
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

sys.path.insert(0, str(Path(__file__).parent))
from shorkie_torch import build, SEQ_LEN, IN_CHANNELS, N_BINS  # noqa: E402

# Determined empirically by scripts/shorkie/sanity_check.py: index 109 gives the highest peak
# predicted RNA-seq on 6/6 probe genes, and falls to rank 96, 120 and 165 of 165 on block-shuffled,
# random and poly-A sequence -- so it responds to real S. cerevisiae sequence rather than simply
# being the loudest channel. Nothing published names it.
SPECIES_SCEREVISIAE = 109

# Track blocks, read from the released targets sheet -- NOT from the paper, which lists the same
# four counts in a different order. Getting this wrong silently mislabels the output curve.
TRACK_BLOCKS = {"chip_exo": (0, 1128), "chip_mnase": (1128, 1148),
                "rnaseq_tf": (1148, 4201), "rnaseq_strain": (4201, 5215)}


def _tree_cat(parts: list[torch.Tensor], dim: int) -> torch.Tensor:
    """Concatenate as a binary tree so no single Concat node takes many inputs.

    WebGPU allows 8 storage buffers per compute stage, and a Concat needs one per input plus one
    for its output. An 18-input concat asks for 19, the pipeline is rejected as invalid, and
    everything downstream of it silently emits ZEROS -- while onnxruntime still reports the run as
    successful. That is what made the page print "Done -- 1689 ms on WebGPU" beside four predicted
    peaks of 0.0000. Pairwise concatenation keeps every node at 2 inputs.
    """
    while len(parts) > 1:
        parts = [
            torch.cat(parts[i:i + 2], dim=dim) if len(parts[i:i + 2]) == 2 else parts[i]
            for i in range(0, len(parts), 2)
        ]
    return parts[0]


def _restore_resize_inputs(model) -> int:
    """Force Resize's roi/scales/sizes inputs back to fp32 after a float16 conversion.

    `op_block_list` keeps the Resize *operator* in fp32 but does not reach the standalone Constant
    nodes feeding it -- the converter rewrites those on their own account, and onnxruntime then
    rejects the graph. Resize's roi and scales are tensor(float) in the ONNX spec whatever the
    data type is, so they must be put back. Returns how many tensors were restored, which is
    printed: a silent zero here would mean the walk stopped matching and the next export breaks.
    """
    import numpy as np_
    from onnx import numpy_helper, TensorProto

    wanted = set()
    for node in model.graph.node:
        if node.op_type == "Resize":
            wanted.update(i for i in node.input[1:] if i)          # roi, scales, sizes
    if not wanted:
        return 0

    fixed = 0
    for node in model.graph.node:
        if node.op_type != "Constant" or node.output[0] not in wanted:
            continue
        for attr in node.attribute:
            if attr.name == "value" and attr.t.data_type == TensorProto.FLOAT16:
                arr = numpy_helper.to_array(attr.t).astype(np_.float32)
                attr.t.CopyFrom(numpy_helper.from_array(arr, attr.t.name))
                fixed += 1
    for init in model.graph.initializer:
        if init.name in wanted and init.data_type == TensorProto.FLOAT16:
            arr = numpy_helper.to_array(init).astype(np_.float32)
            init.CopyFrom(numpy_helper.from_array(arr, init.name))
            fixed += 1
    return fixed


class ShorkieExport(nn.Module):
    """Wraps the ported model so the graph emits display-ready tensors.

    Reductions are done inside the graph rather than in JavaScript: means over each track block
    are taken *after* the softplus, because mean(softplus(Wx)) is not softplus(mean(W)x) and
    folding them into the head would quietly change what the number means.
    """

    def __init__(self, core):
        super().__init__()
        self.core = core

    def forward(self, x: torch.Tensor):
        out, acts = self.core(x, want_intermediates=True)          # [1, 896, 5215]

        blocks = [out[:, :, lo:hi].mean(dim=-1) for lo, hi in TRACK_BLOCKS.values()]
        tracks = torch.stack(blocks, dim=-1)                       # [1, 896, 4]

        # Conv stem: 16,384 positions is more than any display needs, so max-pool to 1,024 and
        # also keep the per-filter maximum, which is what "did this neuron fire at all" means.
        stem = acts["stem"]
        stem_profile = F.max_pool1d(stem, 16, 16)                  # [1, 96, 1024]
        stem_peak = stem.max(dim=-1).values                        # [1, 96]

        block_peaks = torch.cat(
            [acts[f"block{i}"].max(dim=-1).values for i in range(1, 8)], dim=-1
        )                                                          # [1, 1536]
        attention = acts["attention"].mean(dim=2)                  # [1, 8, 128, 128] mean over heads

        # Per-stage activation maps for the flow animation, as ONE tensor rather than three.
        # Every stage is pooled to a common 128-position width inside the graph, so the whole set
        # costs ~2.9 MB of typed array per inference instead of the ~100 MB the raw tensors would.
        # Channels concatenate in flow order and are sliced back out in TypeScript from
        # stageMapOffsets(); one tensor means one offset table and one normalisation path, instead
        # of the [1536,128]/[1152,128] layout assumption that used to be duplicated in three files.
        #
        # The 8 transformer stages are included. They were missing entirely, which left the flow
        # canvas drawing their attention matrices -- a different kind of object from every other
        # stage, and diagonal-dominant, so 40% of the diagram rendered near-blank.
        #
        # Pool factors are stated, not derived from x.shape: under ONNX tracing a shape read
        # becomes a tensor and max_pool1d then rejects it as a kernel size.
        def to128(x: torch.Tensor, factor: int) -> torch.Tensor:
            return F.max_pool1d(x, factor, factor) if factor > 1 else x

        enc_factors = [128, 64, 32, 16, 8, 4, 2]   # blocks 1..7 at 16384..256 positions
        dec_factors = [2, 4, 8]                     # decoder stages at 256, 512, 1024
        parts = (
            [to128(acts[f"block{i}"], f) for i, f in zip(range(1, 8), enc_factors)]
            + [acts[f"attn_out{i}"] for i in range(1, 9)]          # already 128 positions
            + [to128(acts[f"decoder{i}"], f) for i, f in zip(range(1, 4), dec_factors)]
        )
        stage_maps = _tree_cat(parts, dim=1)                       # [1, 5760, 128]

        # Every track, unreduced. The 4 group means above are the overview; this is what lets the
        # page show a single named experiment instead of a mean over 3,053 of them, which
        # corresponds to no real measurement. fp32 IO keeps this a Float32Array in the browser.
        all_tracks = out                                           # [1, 896, 5215]

        return (tracks, stem_profile, stem_peak, block_peaks, attention, stage_maps, all_tracks)


def main() -> int:
    ckpt, out_path = sys.argv[1], sys.argv[2]
    fp16 = "--fp16" in sys.argv
    torch.set_grad_enabled(False)

    core, _ = build(ckpt)
    model = ShorkieExport(core).eval()

    # Test on REAL yeast sequence, not random ACGT. fp16 parity is a relative error against the
    # peak, and on random sequence the model predicts almost nothing -- a peak of 2.9 against
    # 995 on a real locus -- so fp16's absolute resolution near zero dominates and the same graph
    # scores 6.9e-3 instead of 5.0e-4. The model is deployed on real sequence; measure it there.
    x = np.zeros((1, SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    loci_path = Path(__file__).resolve().parents[2] / "src" / "data" / "shorkieLoci.json"
    if loci_path.exists():
        import json

        loci = json.loads(loci_path.read_text())
        seq = loci["loci"][0]["sequence"]
        print(f"test input: {loci['loci'][0]['gene']} ({loci['loci'][0]['id']}), real sequence")
        base = {"A": 0, "C": 1, "G": 2, "T": 3}
        for i, b in enumerate(seq[:SEQ_LEN].upper()):
            j = base.get(b)
            if j is not None:
                x[0, i, j] = 1.0
    else:
        print("test input: random ACGT (shorkieLoci.json not found -- fp16 margins will be loose)")
        rng = np.random.default_rng(0)
        x[0, np.arange(SEQ_LEN), rng.integers(0, 4, SEQ_LEN)] = 1.0
    x[0, :, 5 + SPECIES_SCEREVISIAE] = 1.0
    xt = torch.from_numpy(x)

    ref = model(xt)
    print("reference output shapes:")
    names = ["tracks", "stem_profile", "stem_peak", "block_peaks", "attention",
             "stage_maps", "all_tracks"]
    for n, t in zip(names, ref):
        print(f"  {n:<14} {tuple(t.shape)}")

    torch.onnx.export(
        model, (xt,), out_path,
        input_names=["sequence"], output_names=names,
        opset_version=17, do_constant_folding=True, dynamo=False,
    )
    size = Path(out_path).stat().st_size
    print(f"\nexported {out_path}  ({size / 1e6:.1f} MB)")

    # WebGPU allows 8 storage buffers per compute stage: a node's inputs plus its output. Exceeding
    # it does not raise -- the pipeline is invalid and the graph quietly produces zeros.
    import onnx as _onnx

    graph = _onnx.load(out_path, load_external_data=False).graph
    wide = [(n.op_type, n.name, len(n.input)) for n in graph.node if len(n.input) + 1 > 8]
    if wide:
        print("\nFAIL: nodes exceeding WebGPU's 8 storage buffers per stage:")
        for op, name, k in wide:
            print(f"  {op} {name}: {k} inputs -> {k + 1} buffers")
        return 1
    widest = max((len(n.input) for n in graph.node), default=0)
    print(f"max node fan-in {widest} -> {widest + 1} storage buffers (WebGPU limit 8)  OK")

    # Parity: the export must reproduce the reference, or the graph is not the model.
    import onnxruntime as ort
    sess = ort.InferenceSession(out_path, providers=["CPUExecutionProvider"])
    got = sess.run(None, {"sequence": x})
    print("\nPyTorch vs onnxruntime parity:")
    ok = True
    for n, a, b in zip(names, ref, got):
        d = float(np.abs(a.numpy() - b).max())
        rel = d / max(float(np.abs(a.numpy()).max()), 1e-9)
        flag = "OK" if rel < 1e-4 else "FAIL"
        ok &= rel < 1e-4
        print(f"  {n:<14} max|diff| = {d:.3e}   relative = {rel:.2e}   {flag}")
    print("\nPARITY:", "PASS" if ok else "FAIL")
    if not ok:
        return 1

    if fp16:
        # keep_io_types: the weights go to fp16, the IO stays fp32. onnxruntime-web then hands
        # back Float32Array directly -- a fp16 output would arrive as Uint16Array and need
        # decoding in JavaScript for every value.
        from onnxconverter_common import float16
        import onnx

        fp16_path = out_path.replace(".onnx", "_fp16.onnx")
        model32 = onnx.load(out_path)
        # Stale value_info must go first. The exporter records a type for every intermediate
        # tensor; the converter rewrites the ones it walks and leaves the rest, and the loader
        # then refuses the model with e.g. "Type (tensor(float16)) of output arg
        # (/Slice_3_output_0) ... does not match expected type (tensor(float))". Clearing it and
        # disabling shape inference lets onnxruntime infer the types itself at load.
        del model32.graph.value_info[:]
        # Resize is blocked: its `scales` input is tensor(float) in the ONNX spec regardless of
        # the data type, so converting that constant produces a graph onnxruntime refuses to load
        # ("Type 'tensor(float16)' of input parameter ... of operator (Resize) is invalid").
        # There are three Resize nodes -- the decoder's nearest-neighbour upsamples -- and leaving
        # them in fp32 costs nothing measurable.
        model16 = float16.convert_float_to_float16(
            model32,
            keep_io_types=True,
                op_block_list=[*float16.DEFAULT_OP_BLOCK_LIST, "Resize"],
            disable_shape_infer=True,
        )
        # And clear it again on the way out. The converter leaves a handful of entries behind
        # (8 of them) whose declared types disagree with the casts it inserted at the IO boundary,
        # which onnxruntime rejects as e.g. "Type (tensor(float16)) of output arg
        # (/Concat_cast_to_tracks) ... does not match expected type (tensor(float))". They are all
        # intermediates; onnxruntime infers them itself at load.
        del model16.graph.value_info[:]
        restored = _restore_resize_inputs(model16)
        print(f"  restored {restored} Resize input tensor(s) to fp32")
        if restored == 0:
            print("  WARNING: no Resize inputs matched -- the graph shape may have changed")
        onnx.save(model16, fp16_path)
        size16 = Path(fp16_path).stat().st_size
        print(f"\nwrote {fp16_path}  ({size / 1e6:.1f} MB -> {size16 / 1e6:.1f} MB)")

        sess16 = ort.InferenceSession(fp16_path, providers=["CPUExecutionProvider"])
        got16 = sess16.run(None, {"sequence": x})
        print("fp32 vs fp16 parity:")
        ok16 = True
        for n, a, b in zip(names, ref, got16):
            scale = max(float(np.abs(a.numpy()).max()), 1e-9)
            rel = float(np.abs(a.numpy() - b).max()) / scale
            ok16 &= rel < 2e-3
            print(f"  {n:<14} relative = {rel:.2e}   {'OK' if rel < 2e-3 else 'FAIL'}")
        print("\nFP16 PARITY:", "PASS" if ok16 else "FAIL")
        return 0 if ok16 else 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
