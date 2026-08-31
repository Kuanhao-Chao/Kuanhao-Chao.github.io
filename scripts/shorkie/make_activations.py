"""
Precompute EVERYTHING for every preset locus: all 5,215 track predictions and every layer's
activations, packed as PNG.

Why PNG. The tensors are large -- one locus is 5.6 M values -- and they have to reach a browser.
Quantized to uint8 with a per-row scale, PNG's own filters and deflate beat raw gzip (2.00 MB
against 2.38 MB per locus), and more importantly the browser decodes it natively with
`createImageBitmap`: no JavaScript inflate, no second copy of a decompressor shipped to do it.

What this buys: the page works with NO model at all. Every layer view and every one of the 5,215
tracks is available on selecting a locus, for 2.0 MB, instead of a 28.6 MB download and a 17 s
inference. The live model is then only needed for sequences the reader edits.

Quantization is uint8 per row against that row's own min and max, which is 2.0e-3 relative -- the
same order as the fp16 gap the shipped model already carries, so nothing displayed changes.

NOT public/shorkie: with a custom apex domain on the user site, GitHub serves every project repo's
Pages at khchao.com/<repo>/, and `Kuanhao-Chao/shorkie` already owns /shorkie/. Anything this site
deploys there is shadowed and 404s -- which is exactly what happened.

Usage:  python3 scripts/shorkie/make_activations.py <onnx> [--out public/vp-data]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE_IDX = {"A": 0, "C": 1, "G": 2, "T": 3}
SEQ_LEN, IN_CHANNELS = 16384, 170

# Each entry: the ONNX output, how to reshape it to 2-D (rows, cols), and the file suffix.
# `space` is how a row is quantized. Coverage spans orders of magnitude and is plotted on a log
# axis, so quantizing it linearly wastes almost all 256 levels on the top of the range and leaves a
# visible staircase in the low values: measured, the error a reader sees on a log plot is 2.2e-1
# linear against 1.96e-3 in log space, a 113x difference. Activations are signed, so log is not
# available to them and linear is right.
TENSORS = [
    ("all_tracks", "tracks", lambda a: a[0].T, "log"),                       # [5215, 896]
    ("stage_maps", "stages", lambda a: a[0], "linear"),                      # [5760, 128]
    ("stem_profile", "stem", lambda a: a[0], "linear"),                      # [96, 1024]
    ("attention", "attn", lambda a: a[0].reshape(-1, a.shape[-1]), "linear"),  # [8*128, 128]
]


def encode(sequence: str, species: int) -> np.ndarray:
    x = np.zeros((1, SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    for i, base in enumerate(sequence[:SEQ_LEN].upper()):
        j = BASE_IDX.get(base)
        if j is not None:
            x[0, i, j] = 1.0
    x[0, :, 5 + species] = 1.0
    return x


def quantize(a: np.ndarray, space: str) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """uint8 per row against that row's own range, plus the scales needed to undo it."""
    a = np.asarray(a, dtype=np.float64)
    v = np.log1p(np.maximum(a, 0.0)) if space == "log" else a
    lo = v.min(axis=1)
    hi = v.max(axis=1)
    rng = np.maximum(hi - lo, 1e-9)
    q = np.clip(np.round((v - lo[:, None]) / rng[:, None] * 255.0), 0, 255).astype(np.uint8)
    back = q.astype(np.float64) / 255.0 * rng[:, None] + lo[:, None]
    if space == "log":
        back = np.expm1(back)
    # Report the error the reader actually sees: on a log plot for coverage, absolute otherwise.
    if space == "log":
        span = np.maximum(np.log1p(np.maximum(a, 0.0)).max(), 1e-9)
        err = float((np.abs(np.log1p(np.maximum(back, 0.0)) - np.log1p(np.maximum(a, 0.0))) / span).max())
    else:
        err = float(np.abs(back - a).max() / max(float(np.abs(a).max()), 1e-9))
    return q, lo, hi, err


def main() -> int:
    import onnxruntime as ort
    from PIL import Image

    onnx_path = sys.argv[1]
    out_dir = ROOT / (sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "public/vp-data")
    out_dir.mkdir(parents=True, exist_ok=True)

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    names = [o.name for o in sess.get_outputs()]

    total = 0
    worst = 0.0
    index: dict[str, dict] = {}
    print(f"{'gene':<9}{'tracks':>9}{'stages':>9}{'stem':>8}{'attn':>8}{'total':>9}{'max rel err':>13}")
    for locus in loci["loci"]:
        got = dict(zip(names, sess.run(None, {"sequence": encode(locus["sequence"], loci["speciesIndex"])})))
        meta: dict[str, dict] = {}
        sizes = []
        for out_name, suffix, reshape, space in TENSORS:
            m = reshape(got[out_name])
            q, lo, hi, err = quantize(m, space)
            worst = max(worst, err)
            path = out_dir / f"{locus['id']}-{suffix}.png"
            Image.fromarray(q, mode="L").save(path, format="PNG", optimize=True)
            sizes.append(path.stat().st_size)
            meta[suffix] = {
                "rows": int(m.shape[0]),
                "cols": int(m.shape[1]),
                "space": space,
                # 4 dp is well under the uint8 step for every row; these are the numbers that turn
                # a pixel back into an activation, so they carry the accuracy.
                "lo": [round(float(v), 4) for v in lo],
                "hi": [round(float(v), 4) for v in hi],
            }
        (out_dir / f"{locus['id']}.json").write_text(json.dumps(meta, separators=(",", ":")))
        sidecar = (out_dir / f"{locus['id']}.json").stat().st_size
        locus_total = sum(sizes) + sidecar
        total += locus_total
        index[locus["id"]] = {"gene": locus["gene"], "bytes": locus_total}
        print(f"{locus['gene']:<9}{sizes[0]/1e6:>8.2f}M{sizes[1]/1e6:>8.2f}M{sizes[2]/1e6:>7.2f}M"
              f"{sizes[3]/1e6:>7.2f}M{locus_total/1e6:>8.2f}M{worst:>13.2e}")

    (out_dir / "index.json").write_text(json.dumps(
        {"note": "Per-locus precomputed activations and per-track predictions, uint8 in PNG with "
                 "per-row scales in the sidecar JSON. The page needs no model to show these.",
         "model": Path(onnx_path).name,
         "tensors": [s for _, s, _, _ in TENSORS],
         "loci": index},
        separators=(",", ":")))
    print(f"\n{len(index)} loci, {total/1e6:.0f} MB total, worst quantization error {worst:.2e} relative")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
