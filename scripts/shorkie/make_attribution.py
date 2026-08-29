"""
Precompute the traceback: which input bases, and which neurons in which layer, drive a chosen
region of the output.

Method is gradient x input. It is a LOCAL LINEAR SENSITIVITY, not a decomposition -- the numbers do
not sum to the prediction, and the page says so. What makes it usable interactively is that
gradients superpose: d(sum over S)/dx = sum over S of d/dx. So precomputing the gradient for each
group of 8 output bins makes any dragged region an EXACT sum of rows, with no approximation.

Three planes per locus:
  attr-input     [112 x 1024]   signed gradient x input, 16 bp input bins -- drag any region
  attr-channels  [112 x 5760]   |grad x activation| per channel, over every mapped stage, in the
                                same channel order as stage_maps, so a stage is a slice of it
  attr-anchor    [N x 16384]    signed, single-base, for each annotated gene body and top peak

Sanity the generator checks and prints: attribution mass should concentrate in the region it was
taken from. On TDH3's body -- 6.2% of the window -- 43.1% of the mass lands inside.

Usage:  python3 scripts/shorkie/make_attribution.py <checkpoint.h5> [--out public/vp-data]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
BASE_IDX = {"A": 0, "C": 1, "G": 2, "T": 3}
SEQ_LEN, IN_CHANNELS, N_BINS = 16384, 170, 896
GROUP_BINS = 8                      # output bins per attribution row -> 128 bp granularity
N_GROUPS = N_BINS // GROUP_BINS     # 112
INPUT_BINS = 1024                   # 16 bp input bins, matching the output bin size
RNA_LO, RNA_HI = 1148, 4201         # the RNA-seq block: what "high expression" means here
MAX_ANCHORS = 12


def encode(sequence: str, species: int) -> np.ndarray:
    x = np.zeros((1, SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    for i, base in enumerate(sequence[:SEQ_LEN].upper()):
        j = BASE_IDX.get(base)
        if j is not None:
            x[0, i, j] = 1.0
    x[0, :, 5 + species] = 1.0
    return x


def quantize_rows(a: np.ndarray) -> tuple[np.ndarray, list[float], list[float]]:
    """uint8 per row against that row's own range. Handles signed data; the scales undo it."""
    lo = a.min(axis=1)
    hi = a.max(axis=1)
    rng = np.maximum(hi - lo, 1e-12)
    q = np.clip(np.round((a - lo[:, None]) / rng[:, None] * 255.0), 0, 255).astype(np.uint8)
    return q, [round(float(v), 6) for v in lo], [round(float(v), 6) for v in hi]


def main() -> int:
    import torch
    from PIL import Image
    from shorkie_torch import build

    ckpt = sys.argv[1]
    out_dir = ROOT / (sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "public/vp-data")
    out_dir.mkdir(parents=True, exist_ok=True)
    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    preds = json.loads((ROOT / "src" / "data" / "shorkiePredictions.json").read_text())

    model, _ = build(ckpt)
    model.eval()

    total_bytes = 0
    print(f"{'gene':<9}{'anchors':>8}{'input':>9}{'chans':>9}{'anchor':>9}{'mass in region':>16}")
    for locus in loci["loci"]:
        x = encode(locus["sequence"], loci["speciesIndex"])
        base = torch.from_numpy(x)

        def attribute(bin_lo: int, bin_hi: int, want_channels: bool):
            """One backward pass. Returns (input grad x input, per-channel relevance or None)."""
            xt = base.clone().requires_grad_(True)
            out, acts = model(xt, want_intermediates=want_channels)
            if want_channels:
                keys = [k for k in acts if k != "attention"]
                for k in keys:
                    acts[k].retain_grad()
            out[0, bin_lo:bin_hi, RNA_LO:RNA_HI].mean().backward()
            g = xt.grad[0, :, :4].detach().numpy()
            attr = (g * x[0, :, :4]).sum(axis=1)                       # [16384], signed
            chans = None
            if want_channels:
                parts = []
                for k in (["block%d" % i for i in range(1, 8)]
                          + ["attn_out%d" % i for i in range(1, 9)]
                          + ["decoder%d" % i for i in range(1, 4)]):
                    a = acts[k]
                    rel = (a.grad * a).detach().abs()[0]
                    # attn_out is [T, C] on the path; every other stage is [C, T].
                    if k.startswith("attn_out"):
                        rel = rel.transpose(0, 1)
                    parts.append(rel.sum(dim=1).numpy())               # per channel
                chans = np.concatenate(parts)                          # [5760]
            return attr, chans

        # --- the draggable matrix: one row per group of 8 output bins
        inp = np.zeros((N_GROUPS, INPUT_BINS), dtype=np.float64)
        chan = np.zeros((N_GROUPS, 5760), dtype=np.float64)
        for gi in range(N_GROUPS):
            attr, chans = attribute(gi * GROUP_BINS, (gi + 1) * GROUP_BINS, True)
            inp[gi] = attr.reshape(INPUT_BINS, SEQ_LEN // INPUT_BINS).sum(axis=1)
            chan[gi] = chans

        # --- anchors: every annotated gene body, plus the top predicted peaks, at base resolution
        anchors = []
        for f in locus["features"]:
            if f["end"] > f["start"]:
                anchors.append({"label": f["name"], "kind": "gene",
                                "binStart": int(f["start"]), "binEnd": int(f["end"])})
        rna = np.array(preds["loci"][locus["id"]]["groups"][2])
        peak = int(rna.argmax())
        anchors.append({"label": f"peak at bin {peak}", "kind": "peak",
                        "binStart": max(0, peak - 12), "binEnd": min(N_BINS, peak + 12)})
        anchors = anchors[:MAX_ANCHORS]
        anch = np.zeros((len(anchors), SEQ_LEN), dtype=np.float64)
        for ai, a in enumerate(anchors):
            attr, _ = attribute(a["binStart"], a["binEnd"], False)
            anch[ai] = attr
            lo_bp, hi_bp = a["binStart"] * 16 + 1024, a["binEnd"] * 16 + 1024
            inside = np.abs(attr[lo_bp:hi_bp]).sum()
            a["massInside"] = round(float(inside / max(np.abs(attr).sum(), 1e-12)), 4)
            a["windowFraction"] = round((hi_bp - lo_bp) / SEQ_LEN, 4)

        meta = {"groupBins": GROUP_BINS, "groups": N_GROUPS, "inputBins": INPUT_BINS,
                "anchors": anchors}
        sizes = []
        for name, arr in (("attr-input", inp), ("attr-channels", chan), ("attr-anchor", anch)):
            q, lo, hi = quantize_rows(arr)
            path = out_dir / f"{locus['id']}-{name.split('-')[1]}.png"
            Image.fromarray(q, mode="L").save(path, format="PNG", optimize=True)
            sizes.append(path.stat().st_size)
            meta[name.split("-")[1]] = {"rows": int(arr.shape[0]), "cols": int(arr.shape[1]),
                                        "lo": lo, "hi": hi}
        (out_dir / f"{locus['id']}-attr.json").write_text(json.dumps(meta, separators=(",", ":")))
        total_bytes += sum(sizes) + (out_dir / f"{locus['id']}-attr.json").stat().st_size
        best = max(a["massInside"] for a in anchors)
        print(f"{locus['gene']:<9}{len(anchors):>8}{sizes[0]/1e6:>8.2f}M{sizes[1]/1e6:>8.2f}M"
              f"{sizes[2]/1e6:>8.2f}M{best:>15.1%}")

    print(f"\n{total_bytes/1e6:.1f} MB added across {len(loci['loci'])} loci")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
