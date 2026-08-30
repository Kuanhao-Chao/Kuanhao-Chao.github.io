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

Scope, and its limits. A 16,384 bp window is 49,152 substitutions per strand, so this covers the
paper's own windows: for the six genes Figure 4 prints, the EXACT published window (fig4_common.py
PUB_WIN, 196-776 bp); for the rest, the paper's default 450 bp upstream of the TSS plus 50 bp into
the gene (fig4_common.py:285 `lm_saliency(..., up=450, dn=50)`). That asymmetry is deliberate -- it
is a promoter analysis. It is the honest local answer for that promoter and nothing more.

THE MEASURED QUANTITY IS THE PAPER'S, not an approximation of it. Three things about it are easy
to get subtly wrong and all three change the numbers:

  1. **logSED**, `log2(sum_alt + 1) - log2(sum_ref + 1)` over the gene's own body bins
     (src/shorkie/models/ensemble.py:97-104). A LOG RATIO, so a silent promoter and a maximal one
     are directly comparable -- which a linear difference is not, and that incomparability is what
     forced the page to warn readers off its own percentages.
  2. The bins are **SUMMED** inside each log, not averaged. Under a linear difference sum-vs-mean is
     a constant factor and harmless; inside a log it is not.
  3. The track set is the **384 T0 RNA-seq tracks** (`_T0_` in the identifier, indices 1148-4193),
     not the whole 3,053-track RNA-seq block. Figure 5's entire subject is that ISM saliency CHANGES
     across induction timepoints, so averaging all of them smears the very axis the paper proves is
     not constant.

The window is the gene's own body, which is what the motif knockouts also report: a 14,336 bp yeast
window holds a dozen genes and the tallest is rarely the one whose promoter you edited.

Both strands are run and averaged, because every published ISM run passes `--rc`
(motif_shorkie_targets.sh:44-50, run_fig4_random_ism.sh). It doubles the cost and it is what the
published numbers are.

Output, per locus, beside the other packs in public/vp-data/:
  <id>-ism.png     [4 x W] uint8, rows A/C/G/T, the reference base's row exactly zero
  the `ism` entry in <id>.json, carrying the window's bp offset and the per-row scales

Usage:  python3 scripts/shorkie/make_ism.py [--out public/vp-data] [--only YGR192C] [--bp N]
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
UP, DN = 450, 50                   # the paper's default TSS window (fig4_common.py:285)

# The six windows Figure 4 prints, as offsets into each locus's own 16,384 bp window. These are
# fig4_common.PUB_WIN converted to window-relative coordinates; the site's shorkieLoci.json already
# carries them as `figureWindow`, verified base-for-base against the paper.
PUB_WIN = {
    "YLR344W": "figure",   # RPL26A, panel A
    "YAL035W": "figure",   # FUN12,  panel B
    "YNL132W": "figure",   # KRE33,  panel C
    "YDL219W": "figure",   # DTD1,   panel E
    "YGL087C": "figure",   # MMS2,   panel F
    "YGL033W": "figure",   # HOP2,   panel G
}


def encode(sequence: str, species: int) -> np.ndarray:
    """The 170-channel input: 4 DNA + 1 mask + 165 species, mask zero at inference."""
    x = np.zeros((1, SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    for i, base in enumerate(sequence[:SEQ_LEN].upper()):
        j = BASE_IDX.get(base)
        if j is not None:
            x[0, i, j] = 1.0
    x[0, :, 5 + species] = 1.0
    return x


def t0_coverage(y: np.ndarray, lo: int, hi: int, tracks: np.ndarray) -> float:
    """Sum over gene-body bins of the track-averaged coverage -- the inside of one logSED log.

    The indexing here is the whole point. `y[0, lo:hi, tracks]` mixes an INTEGER index with an
    ARRAY index, and numpy then treats the integer as advanced too and moves the broadcast axis to
    the FRONT: the result is (tracks, bins), not (bins, tracks). Writing
    `y[0, lo:hi, tracks].mean(axis=-1).sum()` therefore averages over BINS and sums over TRACKS --
    the paper's quantity with its two axes swapped, off by a constant factor of n_bins/n_tracks.

    It shipped that way once. The consequence was small, because logSED is a log RATIO and the
    coverage sums are far greater than the +1 pseudocount, so a constant factor cancels: the worst
    error across all fourteen loci was 5e-3 in logSED, at or below the packs' own uint8 floor. But
    it was wrong, and `verify_pipeline.py` re-derived it with the SAME wrong indexing and so agreed
    with the pack and passed -- an assertion is not evidence when both sides share the mistake.
    """
    return float(y[0][lo:hi][:, tracks].mean(axis=-1).sum())


def rc(x: np.ndarray) -> np.ndarray:
    """Reverse-complement the window: reverse positions, and swap A<->T and C<->G.

    The species channels are position-indexed but base-agnostic, so they reverse without being
    complemented -- the same split the paper's own RC augmentation makes.
    """
    out = x[:, ::-1, :].copy()
    out[:, :, :4] = out[:, :, [3, 2, 1, 0]]
    return np.ascontiguousarray(out)


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
    ap.add_argument("--bp", type=int, default=None,
                    help="override the window width; by default the paper's own windows are used")
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

    # The 384 T0 RNA-seq tracks -- `_T0_` in the identifier, exactly the paper's t0_tracks()
    # (fig4_common.py:91-95). Verified: 384 tracks, raw indices 1148-4193.
    names = json.loads((ROOT / "src" / "data" / "shorkieTrackNames.json").read_text())["identifiers"]
    T0 = np.array([i for i, n in enumerate(names) if "_T0_" in n and 1148 <= i < 4201])
    if T0.size != 384:
        print(f"expected 384 T0 tracks, found {T0.size}", file=sys.stderr)
        return 1
    print(f"T0 track subset: {T0.size} tracks, indices {T0.min()}-{T0.max()}")

    for locus in loci["loci"]:
        if args.only and locus["id"] != args.only:
            continue
        seq = locus["sequence"]
        lo_bin, hi_bin = gene_body_bins(locus["features"], locus["id"])
        tss = tss_of(locus["features"], locus["id"])
        strand = next((f["strand"] for f in locus["features"] if f["name"] == locus["id"]), "+")
        fw = locus.get("figureWindow")
        if locus["id"] in PUB_WIN and fw:
            # A Figure 4 gene: use the exact published window, so the panel is comparable with the
            # printed figure base for base.
            start, width = int(fw["seqStart"]), int(fw["seqEnd"]) - int(fw["seqStart"])
            kind = "published"
        else:
            # The paper's default: 450 bp upstream of the TSS and 50 bp into the gene. Upstream is
            # to the LEFT on the plus strand and to the RIGHT on the minus.
            start = tss - UP if strand == "+" else tss - DN
            width = UP + DN
            start = max(0, min(SEQ_LEN - width, start))
            kind = "450up/50dn"
        if args.bp:                                   # smoke-test override
            width = min(args.bp, width)
            kind += f" (truncated to {width})"

        # Reverse-complement of the whole window. Under reversal output bin b maps to N_BINS-1-b,
        # so the gene body occupies [N_BINS-hi, N_BINS-lo) on the reversed strand.
        rc_lo, rc_hi = N_BINS - hi_bin, N_BINS - lo_bin

        def coverage(x: np.ndarray, a: int, b: int) -> float:
            y = sess.run(["all_tracks"], {"sequence": x})[0]   # [1, 896, 5215]
            return t0_coverage(y, a, b, T0)

        def both_strands(x: np.ndarray) -> tuple[float, float]:
            return coverage(x, lo_bin, hi_bin), coverage(rc(x), rc_lo, rc_hi)

        x0 = encode(seq, species)
        ref_f, ref_r = both_strands(x0)
        ref = float(np.mean([ref_f, ref_r]))
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
                alt_f, alt_r = both_strands(x0)
                # logSED per strand, then averaged -- not a logSED of averaged coverage, which is
                # a different (and non-antisymmetric) quantity.
                plane[b, k] = 0.5 * ((np.log2(alt_f + 1) - np.log2(ref_f + 1))
                                     + (np.log2(alt_r + 1) - np.log2(ref_r + 1)))
                x0[0, i, b] = 0.0
            x0[0, i, rj] = 1.0

        q, lows, highs = quantize_rows(plane)
        Image.fromarray(q, mode="L").save(out_dir / f"{locus['id']}-ism.png")
        meta_path = out_dir / f"{locus['id']}.json"
        meta = json.loads(meta_path.read_text())
        meta["ism"] = {
            "rows": 4, "cols": width, "space": "linear", "lo": lows, "hi": highs,
            "start": int(start), "tss": int(tss), "ref": float(ref),
            "geneBins": [lo_bin, hi_bin], "score": "logSED", "tracks": int(T0.size),
            "window": kind, "strands": "rc-averaged",
        }
        meta_path.write_text(json.dumps(meta))

        # The interesting number, printed rather than assumed: the strongest single substitution,
        # and where it falls relative to the TSS.
        flat = int(np.argmax(np.abs(plane)))
        b, k = flat // width, flat % width
        print(
            f"{locus['id']:10s} {locus['gene']:8s} {kind:10s} {start}-{start + width} ({width} bp)"
            f"  strongest {seq[start + k].upper()}->{BASES[b]} at {start + k} bp"
            f" ({start + k - tss:+d} from TSS)  logSED {plane[b, k]:+.4f}"
            f"  [{time.time() - t0:.0f}s]"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
