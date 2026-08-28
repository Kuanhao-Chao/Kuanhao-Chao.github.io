"""
Bin measured BigWig coverage exactly as Shorkie's own training labels were made, so a prediction
and a measurement on the same axis are the same quantity.

The model is trained on 16 bp bin sums of per-base coverage with the outer 1,024 bp of each
16,384 bp window cropped, and a soft clip applied to the tail. Reproducing all three is the whole
point: bin the same way and the two curves are comparable; bin differently and any correlation
reported is partly an artefact of the binning.

The BigWigs live in `gs://shorkie-paper/data/supervised/bigwigs/`, which is requester-pays, so this
reads whatever files are handed to it rather than fetching anything itself.

Usage:
  python3 scripts/shorkie/make_truth.py <sacCer3.fa> <sgdGene.txt> <bigwig-dir> [--out src/data/shorkieTruth.json]

Every `*.bw` under <bigwig-dir> is assigned to a track group by its filename, and the group's
curve is the mean over its files. Groups with no files are simply absent from the output, and the
page renders "no measured coverage loaded" for them rather than a blank axis.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from shorkie_torch import SEQ_LEN, N_BINS, CROP  # noqa: E402

BIN_BP = 16
CROP_BP = CROP * BIN_BP        # 1,024 bp trimmed from each end before binning
CLIP_SOFT = 100000.0           # from the released targets sheet

# The eight preset windows the playground offers, kept in step with src/data/shorkieLoci.json.
LOCI_JSON = Path(__file__).resolve().parents[2] / "src" / "data" / "shorkieLoci.json"

# Filename -> track group. The 1,000-strain set is named by ENA run accession; the TF-induction
# set carries the regulator and timepoint; ChIP files say so.
GROUP_RULES = [
    ("rnaseq_strain", re.compile(r"^[EDS]RR\d+")),
    ("chip_mnase", re.compile(r"mnase", re.I)),
    ("chip_exo", re.compile(r"exo", re.I)),
    ("rnaseq_tf", re.compile(r"_T\d+_S\d+|bamcov")),
]


def group_for(name: str) -> str | None:
    for gid, pat in GROUP_RULES:
        if pat.search(name):
            return gid
    return None


def soft_clip(x: np.ndarray, clip: float) -> np.ndarray:
    """Baskerville's soft clip: linear below the threshold, square-root above it."""
    over = x > clip
    out = x.astype(np.float64).copy()
    out[over] = clip + np.sqrt(out[over] - clip)
    return out


def bin_window(bw, chrom: str, left: int) -> np.ndarray | None:
    """The 896 bin sums the model is trained against, for one window."""
    start = left + CROP_BP
    end = start + N_BINS * BIN_BP
    chroms = bw.chroms()
    key = chrom if chrom in chroms else chrom.replace("chr", "")
    if key not in chroms or end > chroms[key]:
        return None
    vals = np.nan_to_num(np.array(bw.values(key, start, end), dtype=np.float64))
    return soft_clip(vals.reshape(N_BINS, BIN_BP).sum(axis=1), CLIP_SOFT)


def main() -> int:
    try:
        import pyBigWig
    except ImportError:
        print("pyBigWig is required:  pip install pyBigWig", file=sys.stderr)
        return 2

    fasta, genes_path, bw_dir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    out_path = Path(
        sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "src/data/shorkieTruth.json"
    )

    genes = {}
    for line in Path(genes_path).read_text().splitlines():
        f = line.split("\t")
        if len(f) >= 6:
            genes[f[1]] = (f[2], int(f[4]), int(f[5]))

    loci = json.loads(LOCI_JSON.read_text())["loci"]
    files = sorted(bw_dir.glob("*.bw"))
    if not files:
        print(f"no *.bw under {bw_dir}", file=sys.stderr)
        return 1

    by_group: dict[str, list[Path]] = {}
    for f in files:
        gid = group_for(f.name)
        if gid is None:
            print(f"  skipping {f.name}: no group rule matches")
            continue
        by_group.setdefault(gid, []).append(f)
    for gid, fs in by_group.items():
        print(f"  {gid:<14} {len(fs)} file(s): {', '.join(p.name for p in fs)}")

    out: dict = {
        "note": ("Measured coverage over the same 896 bins the model predicts: 16 bp sums of "
                 f"per-base coverage, soft-clipped at {CLIP_SOFT:.0f}, with {CROP_BP} bp cropped "
                 "from each end of the 16,384 bp window. Mean over the files in each group."),
        "loci": {},
        "tracks": {gid: [p.name for p in fs] for gid, fs in by_group.items()},
    }

    for locus in loci:
        gene = locus["gene"]
        if gene not in genes:
            print(f"  {locus['id']}: {gene} not in the gene table, skipping")
            continue
        chrom, s, e = genes[gene]
        left = max(0, (s + e) // 2 - SEQ_LEN // 2)
        per_group: dict[str, list[float]] = {}
        for gid, fs in by_group.items():
            curves = []
            for f in fs:
                bw = pyBigWig.open(str(f))
                v = bin_window(bw, chrom, left)
                bw.close()
                if v is not None:
                    curves.append(v)
            if curves:
                # Rounded to 3 dp: the JSON ships to every visitor and the third decimal of a
                # coverage sum is well inside the noise of the assay.
                per_group[gid] = [round(float(x), 3) for x in np.mean(curves, axis=0)]
        if per_group:
            out["loci"][locus["id"]] = per_group
            print(f"  {locus['id']:<12} {', '.join(f'{g}={max(v):.0f} peak' for g, v in per_group.items())}")

    out_path.write_text(json.dumps(out))
    print(f"\nwrote {out_path}  ({out_path.stat().st_size / 1e3:.1f} kB)"
          f"  {len(out['loci'])} loci x {len(by_group)} group(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
