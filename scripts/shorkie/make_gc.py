"""
GC content per base, and how much of Shorkie_LM's constraint is just base composition.

**Why this track exists.** The first objection to any claim that a DNA language model measures
*constraint* is that it might only be measuring **composition**: AT-rich sequence is easier to
predict than GC-balanced sequence for reasons that have nothing to do with function. Without a GC
lane the page cannot answer that, and the answer belongs on the page rather than in a reader's
suspicion. So this computes GC, and computes the correlation against the model's information
content the same way `make_conservation.py` does for phastCons -- so the two read alike and can be
compared with each other.

**The window is 50 bp, and the choice matters.** Per-base GC is not a quantity: a base is G/C or it
is not, so an unwindowed track is a binary rasterisation of the sequence. The window has to be wide
enough to be a composition and narrow enough to be local:

    5 bp     UCSC's gc5Base. Too short to be a composition -- it takes 6 values.
    50 bp    LOCAL composition, about a third of a nucleosome. What this uses.
    128 bp   the model's own pooling grid. Tempting, and wrong for a CONTROL: matching the
             thing you are controlling for builds the model's own resolution into the control.

The window is centred, so a base's GC describes the sequence around it rather than after it, and
the edges use whatever part of the window exists rather than being dropped -- a NaN at every
chromosome end would look like the no-data gaps phastCons has for a real reason.

Output (gitignored, the tiler turns it into what ships):
    scripts/shorkie/_scratch/genome-track/<chrom>-gc.npy   float32 GC fraction per base
    scripts/shorkie/_scratch/genome-track/gc.json          coverage + correlations against IC

Usage:  python3 scripts/shorkie/make_gc.py [--window 50] [--force]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

from make_genome_track import OUT, array_path, read_fasta          # noqa: E402
from make_conservation import spearman                             # noqa: E402  one rank routine
from add_loci import load_genes                                    # noqa: E402

SCRATCH = Path(__file__).resolve().parent / "_scratch"
GFF_ALIAS = {"chrM": "chrmt"}


def gc_fraction(seq: str, window: int) -> np.ndarray:
    """Centred rolling GC fraction, one value a base.

    A cumulative sum rather than a convolution: 12 M bases through `np.convolve` allocates a second
    12 M-element float array per chromosome for no gain, and the prefix-sum form makes the edge
    handling explicit -- each position divides by the number of bases the window actually covers,
    so a base 10 bp from a telomere is a mean over 35 bases rather than over 50 with 15 zeros.
    """
    arr = np.frombuffer(seq.upper().encode(), dtype=np.uint8)
    is_gc = ((arr == ord("G")) | (arr == ord("C"))).astype(np.int32)
    # Only A/C/G/T count toward the denominator; an N is absent from the composition, not an AT.
    is_acgt = ((arr == ord("A")) | (arr == ord("C"))
               | (arr == ord("G")) | (arr == ord("T"))).astype(np.int32)
    n = len(arr)
    half = window // 2
    cs_gc = np.concatenate([[0], np.cumsum(is_gc)])
    cs_n = np.concatenate([[0], np.cumsum(is_acgt)])
    lo = np.clip(np.arange(n) - half, 0, n)
    hi = np.clip(np.arange(n) - half + window, 0, n)
    denom = cs_n[hi] - cs_n[lo]
    out = np.full(n, np.nan, dtype=np.float32)
    ok = denom > 0
    out[ok] = ((cs_gc[hi] - cs_gc[lo])[ok] / denom[ok]).astype(np.float32)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--window", type=int, default=50)
    ap.add_argument("--only", default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    genome = read_fasta(SCRATCH / "sacCer3.fa")
    genes_by_chrom = load_genes(SCRATCH / "saccharomyces_cerevisiae.gff.gz")
    OUT.mkdir(parents=True, exist_ok=True)

    rec: dict = {"window": args.window, "units": "fraction of A/C/G/T that are G or C",
                 "source": "computed from the sacCer3 reference; no external data",
                 "chroms": {}}

    for chrom in sorted(genome, key=lambda c: -len(genome[c])):
        if args.only and chrom != args.only:
            continue
        out_p = OUT / f"{chrom}-gc.npy"
        if out_p.exists() and not args.force and chrom in rec["chroms"]:
            continue
        gc = gc_fraction(genome[chrom], args.window)
        np.save(out_p, gc)
        rec["chroms"][chrom] = {
            "length": len(gc),
            "scored": int(np.isfinite(gc).sum()),
            "mean": round(float(np.nanmean(gc)), 5),
        }
        print(f"  {chrom:8s} {len(gc):>9,} bp  mean GC {np.nanmean(gc)*100:5.2f}%", flush=True)

    # ---- the comparison this track exists to make ---------------------------------------------
    # Same shape as make_conservation.py's block, over the bases where BOTH are defined, so the two
    # controls can be read against each other rather than against two different denominators.
    pairs: list[tuple[np.ndarray, np.ndarray]] = []
    per_class: dict[str, list[tuple[np.ndarray, np.ndarray]]] = {}
    for chrom in genome:
        mp = array_path(OUT, chrom, "masked")
        gp = OUT / f"{chrom}-gc.npy"
        if not (mp.exists() and gp.exists()):
            continue
        ic = np.load(mp)
        gc = np.load(gp)
        ok = np.isfinite(ic) & np.isfinite(gc)
        if ok.sum() < 1000:
            continue
        pairs.append((ic[ok], gc[ok]))
        cls = np.zeros(len(ic), dtype=np.uint8)
        for g in genes_by_chrom.get(chrom, []) or genes_by_chrom.get(GFF_ALIAS.get(chrom, ""), []):
            for a, b in (g.get("cds") or []):
                cls[max(0, a):min(len(cls), b)] = 1
        for name, code in (("intergenic", 0), ("cds", 1)):
            m = ok & (cls == code)
            if m.sum() >= 1000:
                per_class.setdefault(name, []).append((ic[m], gc[m]))

    if pairs:
        ic_all = np.concatenate([a for a, _ in pairs])
        gc_all = np.concatenate([b for _, b in pairs])
        comp: dict = {
            "bases": int(len(ic_all)),
            "pearson": round(float(np.corrcoef(ic_all, gc_all)[0, 1]), 5),
            "spearman": round(spearman(ic_all, gc_all), 5),
            "meanIc": round(float(ic_all.mean()), 5),
            "meanGc": round(float(gc_all.mean()), 5),
            "byClass": {},
            "note": "Shorkie_LM masked information content vs GC fraction in a "
                    f"{args.window} bp centred window. A CONTROL, not a finding: if the model were "
                    "only reading base composition this is where it would show, so a small value "
                    "is the reassuring one.",
        }
        for name, ps in sorted(per_class.items()):
            a = np.concatenate([x for x, _ in ps])
            b = np.concatenate([y for _, y in ps])
            comp["byClass"][name] = {
                "bases": int(len(a)),
                "pearson": round(float(np.corrcoef(a, b)[0, 1]), 5),
                "spearman": round(spearman(a, b), 5),
                "meanIc": round(float(a.mean()), 5),
                "meanGc": round(float(b.mean()), 5),
            }
        rec["comparison"] = comp
        print(f"\n  model IC vs GC over {comp['bases']:,} bases: "
              f"pearson {comp['pearson']:.4f}  spearman {comp['spearman']:.4f}")
        for name, v in comp["byClass"].items():
            print(f"    {name:11s} {v['bases']:>10,} bases  pearson {v['pearson']:6.4f}  "
                  f"spearman {v['spearman']:6.4f}  IC {v['meanIc']:.3f}  GC {v['meanGc']:.3f}")

    (OUT / "gc.json").write_text(json.dumps(rec, indent=1))
    tot = sum(v["length"] for v in rec["chroms"].values())
    wm = sum(v["mean"] * v["length"] for v in rec["chroms"].values()) / max(tot, 1)
    print(f"\n  {len(rec['chroms'])} chromosomes, {tot:,} bp, genome GC {wm*100:.2f}% "
          f"(the published sacCer3 figure is 38.1%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
