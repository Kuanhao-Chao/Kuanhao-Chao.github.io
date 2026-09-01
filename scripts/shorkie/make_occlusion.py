"""
Windowed occlusion: ablate a stretch of input and measure what every output bin loses.

This is the cheapest exact method on the page and the only one that is genuinely two-dimensional.
One forward pass with window *w* ablated yields the effect on ALL 896 output bins at once, so 256
passes at 64 bp resolution give the complete input-region x output-region matrix -- what drives
what, measured rather than inferred. 21.8 s a locus, about five minutes for all fourteen.

It answers a question none of the other methods can. Gradient x input is a local linear sensitivity
at a single base. ISM is a single substitution at a single base. Occlusion removes a whole 64 bp
stretch and asks what the model loses -- which is the question you actually have about a promoter
element, and it captures the *contextual* effect of a whole motif rather than one base of it.

Read the matrix as a map: the diagonal is local effect, and everything off it is long-range
regulation. A vertical stripe is an input window that matters to many output bins (an enhancer-like
element); a horizontal stripe is an output bin that draws on many places.

Ablation is by zeroing the four DNA channels, which is exactly how the paper's language model masks
a position (`ensemble.py:54-55`) and is indistinguishable from a run of N. It is NOT a shuffle: a
shuffle preserves base composition and so measures "does the ARRANGEMENT matter", while zeroing
measures "does this stretch carry information at all". The motif-knockout panel already does the
shuffle; this deliberately does the other one.

Both strands, averaged, like the mutagenesis pack and like Borzoi. That doubles the cost to 54 s a
locus and is worth knowing for what it is: this model was NOT trained with reverse-complement
augmentation (`augment_rc: false` in every params.json), so it is not rc-equivariant and the two
strands genuinely disagree. Averaging them is the field's test-time augmentation, adopted because
the paper adopts it for its own ISM runs -- not a free symmetry.

Output, per locus, beside the other packs in public/vp-data/:
  <id>-occl.png    [windows x 896] uint8, per-row scales in the sidecar's `occl` entry

Usage:  python3 scripts/shorkie/make_occlusion.py [--out public/vp-data] [--win 64] [--only ID]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE_IDX = {b: i for i, b in enumerate("ACGT")}
SEQ_LEN, IN_CHANNELS, N_BINS = 16384, 170, 896


def encode(sequence: str, species: int) -> np.ndarray:
    x = np.zeros((1, SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    for i, base in enumerate(sequence[:SEQ_LEN].upper()):
        j = BASE_IDX.get(base)
        if j is not None:
            x[0, i, j] = 1.0
    x[0, :, 5 + species] = 1.0
    return x


def rc_input(x: np.ndarray) -> np.ndarray:
    """Reverse-complement the window: reverse position, swap A<->T and C<->G."""
    o = x[:, ::-1, :].copy()
    o[:, :, :4] = o[:, :, [3, 2, 1, 0]]
    return np.ascontiguousarray(o)


def quantize_rows(a: np.ndarray) -> tuple[np.ndarray, list[float], list[float]]:
    """uint8 per row against that row's own range -- the packing every other plane uses."""
    lo = a.min(axis=1)
    hi = a.max(axis=1)
    rng = np.maximum(hi - lo, 1e-12)
    q = np.clip(np.round((a - lo[:, None]) / rng[:, None] * 255.0), 0, 255).astype(np.uint8)
    return q, [round(float(v), 8) for v in lo], [round(float(v), 8) for v in hi]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "public" / "vp-data"))
    ap.add_argument("--win", type=int, default=64, help="ablation window, bp")
    ap.add_argument("--only", default=None)
    args = ap.parse_args()

    import onnxruntime as ort
    from PIL import Image

    ort.set_default_logger_severity(3)
    onnx_path = ROOT / "public" / "models" / "shorkie-fp16.onnx"
    if not onnx_path.exists():
        print(f"missing {onnx_path}", file=sys.stderr)
        return 1
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    names = json.loads((ROOT / "src" / "data" / "shorkieTrackNames.json").read_text())["identifiers"]
    # The paper's T0 subset, so occlusion is on the same quantity as the mutagenesis pack.
    T0 = np.array([i for i, n in enumerate(names) if "_T0_" in n and 1148 <= i < 4201])
    if T0.size != 384:
        print(f"expected 384 T0 tracks, found {T0.size}", file=sys.stderr)
        return 1
    print(f"T0 track subset: {T0.size} tracks, indices {T0.min()}-{T0.max()}")

    win = args.win
    n_win = SEQ_LEN // win
    out_dir = Path(args.out)

    for locus in loci["loci"]:
        if args.only and locus["id"] != args.only:
            continue
        x = encode(locus["sequence"], loci["speciesIndex"])

        def coverage(inp: np.ndarray) -> np.ndarray:
            """T0-averaged coverage per output bin, averaged over both strands.

            Two forward passes. The reverse strand's bins run backwards, so its profile is flipped
            before averaging -- bin b of the forward pass is bin N_BINS-1-b of the reverse one.

            Both strands because that is what Borzoi does and what every published Shorkie ISM run
            passes (`--rc`). It is a test-time augmentation and not a symmetry: this model was not
            trained with rc augmentation (`augment_rc: false`), so the two strands genuinely differ.

            Two-step indexing: `y[0, :, T0]` would be (tracks, bins), because an integer index
            beside an array index moves the broadcast axis to the front.
            """
            f = sess.run(["all_tracks"], {"sequence": inp})[0][0][:, T0].mean(axis=-1)
            r = sess.run(["all_tracks"], {"sequence": rc_input(inp)})[0][0][:, T0].mean(axis=-1)
            return 0.5 * (f + r[::-1])                            # [896]

        t0 = time.time()
        ref = coverage(x)
        matrix = np.zeros((n_win, N_BINS), dtype=np.float64)
        for w in range(n_win):
            a, b = w * win, (w + 1) * win
            keep = x[0, a:b, :4].copy()
            x[0, a:b, :4] = 0.0                                   # ablate: an N-run, not a shuffle
            alt = coverage(x)
            x[0, a:b, :4] = keep
            # logSED per bin, so every cell is a scale-free log2 fold change and bins of wildly
            # different expression are directly comparable within one row.
            matrix[w] = np.log2(alt + 1) - np.log2(ref + 1)

        q, lows, highs = quantize_rows(matrix)
        Image.fromarray(q, mode="L").save(out_dir / f"{locus['id']}-occl.png")
        meta_path = out_dir / f"{locus['id']}.json"
        meta = json.loads(meta_path.read_text())
        meta["occl"] = {
            "rows": n_win, "cols": N_BINS, "space": "linear", "lo": lows, "hi": highs,
            "win": win, "score": "logSED per bin", "ablation": "DNA channels zeroed",
            "strands": "rc-averaged",
        }
        meta_path.write_text(json.dumps(meta, separators=(",", ":")))

        # The interesting numbers, printed rather than assumed: the single most damaging window,
        # and how much of its damage lands OUTSIDE its own footprint -- which is the whole point of
        # a two-dimensional map. A purely local model would put all of it on the diagonal.
        tot = np.abs(matrix).sum(axis=1)
        w = int(np.argmax(tot))
        own_lo = max(0, (w * win - 1024) // 16)
        own_hi = min(N_BINS, ((w + 1) * win - 1024) // 16 + 1)
        inside = np.abs(matrix[w, own_lo:own_hi]).sum()
        frac = inside / max(np.abs(matrix[w]).sum(), 1e-12)
        print(
            f"{locus['id']:10s} {locus['gene']:8s} {n_win} windows x {win} bp"
            f"  most damaging {w * win}-{(w + 1) * win} bp"
            f"  peak |logSED| {np.abs(matrix[w]).max():.3f}"
            f"  {frac * 100:.1f}% of its effect is local"
            f"  [{time.time() - t0:.0f}s]"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
