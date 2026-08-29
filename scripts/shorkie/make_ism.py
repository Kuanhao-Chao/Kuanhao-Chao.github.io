"""
In-silico saturation mutagenesis: mutate every base to all three alternatives and measure what the
model actually does.

This is the gold standard for this family of models -- Basenji, Enformer, Borzoi and Shorkie are
all read this way -- and unlike gradient x input it is not an approximation of anything. Each cell
is a real forward pass through the shipped graph, so the number is the model's own answer to
"what if this base were different", with no linearity assumption and no baseline to argue about.

It runs against `public/models/shorkie-fp16.onnx`, which is committed, so this needs NO checkpoint
and no network -- the same property that makes `verify_pipeline.py`'s first two sections runnable
from the repository alone.

Scope, and its limits. A 16,384 bp window is 49,152 substitutions and about 70 minutes a locus, so
this covers 512 bp centred on the focal gene's TSS: the core promoter, where the transcription
factor sites are and where the existing motif-knockout panel already operates. It is the honest
local answer for that promoter and nothing more -- the page says so, because an ISM panel invites
being read as a claim about the whole window.

The measured quantity is the RNA-seq group mean over THAT GENE'S OWN BODY, which is exactly what
the motif knockouts report. A 14,336 bp yeast window holds a dozen genes and the tallest is rarely
the one whose promoter you edited; measuring the window peak instead reports an unrelated gene.

Output, per locus, beside the other packs in public/vp-data/:
  <id>-ism.png     [4 x 512] uint8, rows A/C/G/T, the reference base's row exactly zero
  the `ism` entry in <id>.json, carrying the window's bp offset and the per-row scales

Usage:  python3 scripts/shorkie/make_ism.py [--out public/vp-data] [--only YGR192C] [--bp 512]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASES = "ACGT"
BASE_IDX = {b: i for i, b in enumerate(BASES)}
SEQ_LEN, IN_CHANNELS, N_BINS, BIN_BP, CROP_BP = 16384, 170, 896, 16, 1024
RNA_GROUP = 2                      # the RNA-seq TF-induction block's mean, in the `tracks` output


def encode(sequence: str, species: int) -> np.ndarray:
    """The 170-channel input: 4 DNA + 1 mask + 165 species, mask zero at inference."""
    x = np.zeros((1, SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    for i, base in enumerate(sequence[:SEQ_LEN].upper()):
        j = BASE_IDX.get(base)
        if j is not None:
            x[0, i, j] = 1.0
    x[0, :, 5 + species] = 1.0
    return x


def gene_body_bins(features: list[dict], gene_id: str) -> tuple[int, int]:
    """The focal gene's own output bins. Measuring the window peak instead measures another gene."""
    for f in features:
        if f["name"] == gene_id:
            lo = max(0, (f["txStart"] - CROP_BP) // BIN_BP)
            hi = min(N_BINS, (f["txEnd"] - CROP_BP) // BIN_BP + 1)
            if hi > lo:
                return int(lo), int(hi)
    return 0, N_BINS


def tss_of(features: list[dict], gene_id: str) -> int:
    """Transcription start: txStart on the plus strand, txEnd on the minus."""
    for f in features:
        if f["name"] == gene_id:
            return int(f["txStart"] if f["strand"] == "+" else f["txEnd"])
    return SEQ_LEN // 2


def quantize_rows(a: np.ndarray) -> tuple[np.ndarray, list[float], list[float]]:
    """uint8 per row against that row's own range -- the same packing every other plane uses."""
    lo = a.min(axis=1)
    hi = a.max(axis=1)
    rng = np.maximum(hi - lo, 1e-12)
    q = np.clip(np.round((a - lo[:, None]) / rng[:, None] * 255.0), 0, 255).astype(np.uint8)
    return q, [round(float(v), 8) for v in lo], [round(float(v), 8) for v in hi]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "public" / "vp-data"))
    ap.add_argument("--only", default=None, help="one locus id, for a quick check")
    ap.add_argument("--bp", type=int, default=512, help="width of the mutagenesis window")
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
    out_dir = Path(args.out)
    species = loci["speciesIndex"]
    width = args.bp

    for locus in loci["loci"]:
        if args.only and locus["id"] != args.only:
            continue
        seq = locus["sequence"]
        lo_bin, hi_bin = gene_body_bins(locus["features"], locus["id"])
        tss = tss_of(locus["features"], locus["id"])
        start = max(0, min(SEQ_LEN - width, tss - width // 2))

        def score(x: np.ndarray) -> float:
            t = sess.run(["tracks"], {"sequence": x})[0]      # [1, 896, 4]
            return float(t[0, lo_bin:hi_bin, RNA_GROUP].mean())

        x0 = encode(seq, species)
        ref = score(x0)
        t0 = time.time()
        plane = np.zeros((4, width), dtype=np.float64)

        for k in range(width):
            i = start + k
            r = seq[i].upper()
            rj = BASE_IDX.get(r)
            if rj is None:
                continue
            for b in range(4):
                if b == rj:
                    continue                                   # the reference is zero by definition
                x0[0, i, rj] = 0.0
                x0[0, i, b] = 1.0
                plane[b, k] = score(x0) - ref
                x0[0, i, b] = 0.0
            x0[0, i, rj] = 1.0

        q, lows, highs = quantize_rows(plane)
        Image.fromarray(q, mode="L").save(out_dir / f"{locus['id']}-ism.png")
        meta_path = out_dir / f"{locus['id']}.json"
        meta = json.loads(meta_path.read_text())
        meta["ism"] = {
            "rows": 4, "cols": width, "space": "linear", "lo": lows, "hi": highs,
            "start": int(start), "tss": int(tss), "ref": float(ref),
            "geneBins": [lo_bin, hi_bin],
        }
        meta_path.write_text(json.dumps(meta))

        # The interesting number, printed rather than assumed: the strongest single substitution,
        # and where it falls relative to the TSS.
        flat = int(np.argmax(np.abs(plane)))
        b, k = flat // width, flat % width
        print(
            f"{locus['id']:10s} {locus['gene']:8s} ref {ref:9.3f}  window {start}-{start + width}"
            f"  strongest {seq[start + k].upper()}->{BASES[b]} at {start + k} bp"
            f" ({start + k - tss:+d} from TSS)  {plane[b, k] / max(ref, 1e-9) * 100:+.1f}%"
            f"  [{time.time() - t0:.0f}s]"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
