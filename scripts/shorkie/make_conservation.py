"""
Fetch phastCons 7-yeast conservation for sacCer3 and align it to the genome track.

**Why this track and not another.** Shorkie_LM's constraint is *alignment-free*: it comes from a
model pretrained on 165 Saccharomycetales genomes, and it is a statement about what the model finds
predictable. phastCons is *alignment-based*: a phylo-HMM posterior over a 7-yeast multiple
alignment, and a statement about what evolution has held still. They are independent measurements of
related things, which is what makes putting them in adjacent lanes a real check rather than a second
opinion from the same source. This script also computes the correlation between them once, so the
page can state a number instead of inviting the reader to eyeball two curves.

**A missing score is not a zero, and this is the whole reason the arrays carry NaN.** UCSC has no
phastCons value where the alignment has no data -- 1.8% of the genome, concentrated at telomeres and
in the repetitive arms. Quantised naively to uint8 that becomes 0, which draws as "completely
unconserved" exactly where the truth is "we do not know". The array keeps NaN, the tiler is required
to carry a no-data sentinel, and the renderer leaves a gap.

The source is plain text: `phastCons7way/sacCer3.<chrom>.wigFixed.gz` is a gzipped fixedStep wiggle,
one value a line. No bigWig reader is needed, which matters because this machine has no pyBigWig.

Output (gitignored, the tiler turns it into what ships):
    scripts/shorkie/_scratch/genome-track/<chrom>-phastcons.npy   float32, NaN where unscored
    scripts/shorkie/_scratch/genome-track/conservation.json       coverage + correlations

Usage:  python3 scripts/shorkie/make_conservation.py [--only chrI] [--force]
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

from make_genome_track import OUT, array_path, read_fasta          # noqa: E402  one window rule
from add_loci import load_genes                                    # noqa: E402  the same GFF reader

SCRATCH = Path(__file__).resolve().parent / "_scratch"
BASE = "https://hgdownload.soe.ucsc.edu/goldenPath/sacCer3/phastCons7way"
# The UCSC FASTA calls the mitochondrial chromosome chrM; the SGD GFF calls it chrmt. Same alias as
# make_genome_tiles.py -- without it chrM silently gets no gene classes.
GFF_ALIAS = {"chrM": "chrmt"}


def fetch(url: str, tries: int = 3) -> bytes:
    last: Exception | None = None
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=180) as r:
                return r.read()
        except Exception as ex:                                   # noqa: BLE001  retried below
            last = ex
    raise SystemExit(f"could not fetch {url}: {last}")


def parse_wig_fixed(raw: bytes, n: int) -> np.ndarray:
    """A fixedStep wiggle into a per-base array of length `n`, NaN where unscored.

    Wiggle `start` is 1-BASED; every array in this repo is 0-based half-open. Getting that wrong
    shifts the entire conservation track by one base against the model's, which is invisible on a
    12 Mb drawing and fatal to any per-base comparison -- so the offset is applied once, here, and
    the caller never sees a wiggle coordinate.
    """
    out = np.full(n, np.nan, dtype=np.float32)
    pos = 0
    step = 1
    with gzip.open(io.BytesIO(raw), "rt") as fh:
        for line in fh:
            if line.startswith("fixedStep"):
                fields = dict(kv.split("=", 1) for kv in line.split()[1:] if "=" in kv)
                pos = int(fields.get("start", 1)) - 1              # 1-based -> 0-based
                step = int(fields.get("step", 1))
                continue
            if not line.strip():
                continue
            if 0 <= pos < n:
                out[pos] = float(line)
            pos += step
    return out


def spearman(a: np.ndarray, b: np.ndarray) -> float:
    """Rank correlation without scipy: rank both, then Pearson on the ranks.

    Ties get average ranks, which is what makes this Spearman rather than an approximation of it --
    and phastCons is full of ties (long runs at exactly 0 and exactly 1).
    """
    def rank(v: np.ndarray) -> np.ndarray:
        # Vectorised tie-averaging. The obvious version -- walk the sorted array averaging each run
        # of equal values in a Python loop -- is O(n) interpreted work over 12 million elements and
        # takes minutes; phastCons is mostly ties (long runs at exactly 0 and exactly 1), so the
        # loop body runs almost every step.
        order = np.argsort(v, kind="stable")
        s = v[order]
        starts = np.flatnonzero(np.r_[True, s[1:] != s[:-1]])      # first index of each run
        dense = np.cumsum(np.r_[True, s[1:] != s[:-1]]) - 1        # run index per sorted position
        bounds = np.r_[starts, len(s)]                             # run boundaries, exclusive end
        # A run spanning sorted positions [lo, hi) gets the average 1-based rank of that span.
        avg = 0.5 * (bounds[dense] + bounds[dense + 1] + 1)
        r = np.empty(len(v), dtype=np.float64)
        r[order] = avg
        return r
    return float(np.corrcoef(rank(a), rank(b))[0, 1])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    genome = read_fasta(SCRATCH / "sacCer3.fa")
    genes_by_chrom = load_genes(SCRATCH / "saccharomyces_cerevisiae.gff.gz")
    OUT.mkdir(parents=True, exist_ok=True)

    rec: dict = {"source": f"{BASE}/sacCer3.<chrom>.wigFixed.gz",
                 "track": "phastCons 7-way (S. cerevisiae, paradoxus, mikatae, kudriavzevii, "
                          "bayanus, castellii, kluyveri)",
                 "units": "posterior probability that a base is in a conserved element, 0-1",
                 "chroms": {}}
    rec_p = OUT / "conservation.json"
    if rec_p.exists() and not args.force:
        rec = {**rec, **json.loads(rec_p.read_text())}

    for chrom in sorted(genome, key=lambda c: -len(genome[c])):
        if args.only and chrom != args.only:
            continue
        out_p = OUT / f"{chrom}-phastcons.npy"
        if out_p.exists() and not args.force and chrom in rec["chroms"]:
            print(f"  {chrom:8s} already written, skipping")
            continue
        n = len(genome[chrom])
        cons = parse_wig_fixed(fetch(f"{BASE}/sacCer3.{chrom}.wigFixed.gz"), n)
        scored = int(np.isfinite(cons).sum())
        np.save(out_p, cons)
        rec["chroms"][chrom] = {
            "length": n, "scored": scored, "coverage": round(scored / n, 5),
            "mean": round(float(np.nanmean(cons)), 5) if scored else None,
        }
        print(f"  {chrom:8s} {n:>9,} bp  {scored:>9,} scored ({scored/n*100:5.2f}%)  "
              f"mean {np.nanmean(cons) if scored else float('nan'):.4f}", flush=True)

    # ---- the comparison the page exists to make -----------------------------------------------
    # Both arrays are masked to the bases where BOTH have a value. A correlation between two arrays
    # that disagree about which positions are missing is a number that looks fine and means nothing.
    pairs: list[tuple[np.ndarray, np.ndarray]] = []
    per_class: dict[str, list[tuple[np.ndarray, np.ndarray]]] = {}
    for chrom in genome:
        mp = array_path(OUT, chrom, "masked")
        cp = OUT / f"{chrom}-phastcons.npy"
        if not (mp.exists() and cp.exists()):
            continue
        ic = np.load(mp)
        cons = np.load(cp)
        ok = np.isfinite(ic) & np.isfinite(cons)
        if ok.sum() < 1000:
            continue
        pairs.append((ic[ok], cons[ok]))

        # Split by what the base IS, because a genome-wide correlation is dominated by intergenic
        # sequence and would hide a disagreement inside coding sequence.
        cls = np.zeros(len(ic), dtype=np.uint8)                    # 0 = intergenic
        for g in genes_by_chrom.get(chrom, []) or genes_by_chrom.get(GFF_ALIAS.get(chrom, ""), []):
            for a, b in (g.get("cds") or []):
                cls[max(0, a):min(len(cls), b)] = 1                 # 1 = CDS
        for name, code in (("intergenic", 0), ("cds", 1)):
            m = ok & (cls == code)
            if m.sum() >= 1000:
                per_class.setdefault(name, []).append((ic[m], cons[m]))

    if pairs:
        ic_all = np.concatenate([a for a, _ in pairs])
        cons_all = np.concatenate([b for _, b in pairs])
        rec["comparison"] = {
            "bases": int(len(ic_all)),
            "pearson": round(float(np.corrcoef(ic_all, cons_all)[0, 1]), 5),
            "spearman": round(spearman(ic_all, cons_all), 5),
            "meanIc": round(float(ic_all.mean()), 5),
            "meanPhastCons": round(float(cons_all.mean()), 5),
            "byClass": {},
            "note": "Shorkie_LM masked information content vs phastCons 7-way, over every base "
                    "where both are defined. The model is alignment-free and phastCons is "
                    "alignment-based, so this is an independent check rather than a second "
                    "opinion from the same source. Read byClass before reading the headline "
                    "number: the two agree about which REGIONS are constrained (both rank CDS "
                    "above intergenic) and that regional agreement is most of the overall "
                    "correlation, while within a class they agree far less -- partly a real "
                    "disagreement and partly because phastCons saturates at 1 inside coding "
                    "sequence, leaving almost no range to correlate against.",
        }
        for name, ps in sorted(per_class.items()):
            a = np.concatenate([x for x, _ in ps])
            b = np.concatenate([y for _, y in ps])
            rec["comparison"]["byClass"][name] = {
                "bases": int(len(a)),
                "pearson": round(float(np.corrcoef(a, b)[0, 1]), 5),
                "spearman": round(spearman(a, b), 5),
                "meanIc": round(float(a.mean()), 5),
                "meanPhastCons": round(float(b.mean()), 5),
                # Saturation, because it is most of the reason the within-CDS correlation is near
                # zero and reporting the correlation without it would be a wrong interpretation of
                # a right number: inside coding sequence phastCons is a near-constant 1, so there
                # is very little variation left for the model's per-base signal to track. A
                # correlation is bounded by the range of both variables.
                "phastConsSaturated": round(float((b >= 0.99).mean()), 5),
                "phastConsMedian": round(float(np.median(b)), 5),
                "icMedian": round(float(np.median(a)), 5),
            }
        c = rec["comparison"]
        print(f"\n  model IC vs phastCons over {c['bases']:,} bases: "
              f"pearson {c['pearson']:.4f}  spearman {c['spearman']:.4f}")
        for name, v in c["byClass"].items():
            print(f"    {name:11s} {v['bases']:>10,} bases  pearson {v['pearson']:6.4f}  "
                  f"spearman {v['spearman']:6.4f}  IC {v['meanIc']:.3f}  cons {v['meanPhastCons']:.3f}"
                  f"  cons>=0.99 {v['phastConsSaturated']*100:5.1f}%")

    rec_p.write_text(json.dumps(rec, indent=1))
    tot = sum(v["length"] for v in rec["chroms"].values())
    sc = sum(v["scored"] for v in rec["chroms"].values())
    print(f"\n  {len(rec['chroms'])} chromosomes, {sc:,}/{tot:,} bases scored "
          f"({sc/max(tot,1)*100:.2f}%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
