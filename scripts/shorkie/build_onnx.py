"""
Export the ported Shorkie model to ONNX for the browser, and verify the export against the
PyTorch reference.

The exported graph returns the predicted track *and* the intermediate activations the playground
draws, so every panel on the page is fed by the same forward pass that produced the prediction --
there is no second, decorative model. The intermediates stay in process memory (ORT hands back
typed arrays), so a few megabytes per inference costs a copy, not a download.

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

        # Per-stage activation maps for the flow animation. Every stage is pooled to a common
        # 128-position width inside the graph, so the whole set costs ~1.4 MB of typed array per
        # inference instead of the ~100 MB the raw tensors would. Channels are concatenated in
        # stage order and sliced back out in TypeScript from BLOCK_FILTERS.
        # Pool factors are stated, not derived from x.shape: under ONNX tracing a shape read
        # becomes a tensor and max_pool1d then rejects it as a kernel size.
        def to128(x: torch.Tensor, factor: int) -> torch.Tensor:
            return F.max_pool1d(x, factor, factor) if factor > 1 else x

        enc_factors = [128, 64, 32, 16, 8, 4, 2]   # blocks 1..7 at 16384..256 positions
        dec_factors = [2, 4, 8]                     # decoder stages at 256, 512, 1024
        encoder_maps = torch.cat(
            [to128(acts[f"block{i}"], f) for i, f in zip(range(1, 8), enc_factors)], dim=1
        )
        decoder_maps = torch.cat(
            [to128(acts[f"decoder{i}"], f) for i, f in zip(range(1, 4), dec_factors)], dim=1
        )
        return (tracks, stem_profile, stem_peak, block_peaks, attention,
                encoder_maps, decoder_maps)


def main() -> int:
    ckpt, out_path = sys.argv[1], sys.argv[2]
    fp16 = "--fp16" in sys.argv
    torch.set_grad_enabled(False)

    core, _ = build(ckpt)
    model = ShorkieExport(core).eval()

    rng = np.random.default_rng(0)
    x = np.zeros((1, SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    x[0, np.arange(SEQ_LEN), rng.integers(0, 4, SEQ_LEN)] = 1.0
    x[0, :, 5 + SPECIES_SCEREVISIAE] = 1.0
    xt = torch.from_numpy(x)

    ref = model(xt)
    print("reference output shapes:")
    names = ["tracks", "stem_profile", "stem_peak", "block_peaks", "attention",
             "encoder_maps", "decoder_maps"]
    for n, t in zip(names, ref):
        print(f"  {n:<14} {tuple(t.shape)}")

    torch.onnx.export(
        model, (xt,), out_path,
        input_names=["sequence"], output_names=names,
        opset_version=17, do_constant_folding=True, dynamo=False,
    )
    size = Path(out_path).stat().st_size
    print(f"\nexported {out_path}  ({size / 1e6:.1f} MB)")

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
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
