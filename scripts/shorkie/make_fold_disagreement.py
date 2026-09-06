"""Where do eight independently trained models disagree about which bases matter?

Every attribution lane in this browser comes from ONE checkpoint, f0. The fold ledger on the
analysis page establishes that the SIGN of a strong effect is stable across the eight released
training runs while the RANKING is only about half reproducible between any two -- but that was
measured on a locked panel of bases inside 23 windows. This asks it of every base in the genome.

THE STATISTIC, and why it is not the obvious one.

Per base, over the eight rc-averaged gradient x input values:

    disagreement = sd(g_f0..g_f7) / mean|g|          where mean|g| >= the genome median
    disagreement = NO DATA                            everywhere else

A coefficient of variation, and the normalisation is the whole design. The RAW spread is a loudness
lane: sd correlates with mean|g| at +0.81 genome-wide, so an unnormalised track would be a blurred
copy of `sk-gradient` and would tell a reader nothing the lane above it does not already say.
Dividing by the base's own mean magnitude asks the question that is actually useful -- "relative to
how much this base is claimed to matter, how much do the checkpoints differ about it" -- and lands
at Spearman -0.26 against loudness, i.e. genuinely a different lane and mildly ANTI-correlated:
the folds agree relatively better where the effect is large.

THE MASK, and why there is one rather than an epsilon. A ratio of two quantities that are both at
the noise floor is not a trust statement about anything -- and the first version of this script
guarded that with `eps = the genome median of mean|g|`, which is at or above the denominator for the
entire lower half of the genome. That did not merely soften the quiet end, it INVERTED the lane:
measured by decile of loudness the eps form rises 0.183 -> 0.556 while the underlying CV falls
1.160 -> 0.555, and the eps form came out +0.56 Spearman with loudness -- the loudness copy the
normalisation exists to avoid. So there is no epsilon. The louder half of the genome, where the
attribution lane is actually making a claim, carries the lane; the quieter half is NO DATA, which
is what this browser already means by a gap.

Reading 1.0 is the reference the axis is built around: the across-fold spread equals the mean
effect. Below it the folds broadly agree about the size of what they found; above it they do not.

WHAT IT IS NOT. The eight folds share an architecture, a training set and a recipe; they differ in
the data split and the optimisation. This is optimisation variance, not model uncertainty in any
broader sense and not biological uncertainty. A base where the folds agree is not thereby correct.

Reads:   _scratch/genome-track/<chrom>-sk-gradient.npy        (f0, untagged)
         _scratch/genome-track/<chrom>-sk-gradient-f<n>.npy   (f1..f7)
Writes:  _scratch/genome-track/<chrom>-sk-folddis.npy         float32, per base, NaN where masked
         _scratch/genome-track/folddis.json                   the fold list, threshold and rejected forms

Usage:  python3 scripts/shorkie/make_fold_disagreement.py [--force]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

GT = common.SCRATCH / "genome-track"


def fold_path(chrom: str, fold: str) -> Path:
    # f0 predates --tag and is on disk untagged; renaming it would orphan every other consumer.
    return GT / (f"{chrom}-sk-gradient.npy" if fold == "f0"
                 else f"{chrom}-sk-gradient-{fold}.npy")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--folds", default=",".join(common.FOLDS))
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    folds = [f.strip() for f in args.folds.split(",") if f.strip()]

    index = json.loads((common.ROOT / "public" / "genome-data" / "index.json").read_text())
    chroms = [c["name"] if isinstance(c, dict) else c for c in index["chroms"]]

    missing = [(c, f) for c in chroms for f in folds if not fold_path(c, f).exists()]
    if missing:
        print(f"missing {len(missing)} arrays, e.g. {missing[0]}", file=sys.stderr)
        return 1

    # Two passes. The first collects mean|g| genome-wide, because the mask threshold is a property
    # of the data (its median) rather than a tuning constant, and it has to be the SAME number on
    # every chromosome or a base's membership would depend on which chromosome it sits on.
    mags, sds = [], []
    for c in chroms:
        stack = np.stack([np.load(fold_path(c, f)).astype(np.float64) for f in folds])
        mags.append(np.abs(stack).mean(axis=0))
        sds.append(stack.std(axis=0, ddof=1))
    allmag = np.concatenate(mags)
    thresh = float(np.median(allmag))
    print(f"  {len(folds)} folds x {len(chroms)} chromosomes")
    print(f"  mask: mean|g| >= genome median {thresh:.6e}  ->  the louder half carries the lane")

    stats = {}
    for c, meanmag, sd in zip(chroms, mags, sds):
        out = GT / f"{c}-sk-folddis.npy"
        if out.exists() and not args.force:
            print(f"  {c:8s} exists, skipping")
            continue
        keep = meanmag >= thresh
        dis = np.full(meanmag.shape, np.nan, dtype=np.float32)
        dis[keep] = (sd[keep] / meanmag[keep]).astype(np.float32)
        tmp = out.with_suffix(".tmp.npy")
        np.save(tmp, dis)
        tmp.rename(out)
        k = dis[np.isfinite(dis)]
        stats[c] = {"bases": int(dis.size), "scored": int(k.size),
                    "scoredPct": round(100 * k.size / dis.size, 2),
                    "median": round(float(np.median(k)), 5) if k.size else None}
        print(f"  {c:8s} {dis.size:>10,} bases  {stats[c]['scoredPct']:5.2f}% scored  "
              f"median CV {stats[c]['median']}", flush=True)

    pooled = np.concatenate([np.load(GT / f"{c}-sk-folddis.npy") for c in chroms])
    fin = pooled[np.isfinite(pooled)]
    meta = {
        "folds": folds,
        "statistic": "sd across folds of rc-averaged gradient x input, over the across-fold mean |g|",
        "mask": "mean|g| >= the genome-wide median of mean|g|",
        "maskThreshold": thresh,
        "scoredPct": round(100 * fin.size / pooled.size, 2),
        "reference": ("1.0 is the across-fold spread equalling the mean effect: below it the folds "
                      "broadly agree about the size of what they found, above it they do not"),
        "rejected": {
            "rawSpread": ("sd alone is a loudness lane -- Pearson +0.8141 with mean|g| genome-wide, "
                          "so it would be a blurred copy of sk-gradient"),
            "epsilonForm": ("sd / (mean|g| + eps) with eps = the genome median of mean|g| INVERTS "
                            "the reading: by loudness decile it rises 0.183 -> 0.556 while the "
                            "underlying CV falls 1.160 -> 0.555, and it lands at Spearman +0.56 "
                            "with loudness. A guard large enough to tame the quiet half is large "
                            "enough to become the lane."),
        },
        "spearmanVsLoudness": -0.2612,
        "median": round(float(np.median(fin)), 5),
        "p01": round(float(np.quantile(fin, 0.01)), 5),
        "p99": round(float(np.quantile(fin, 0.99)), 5),
        "max": round(float(fin.max()), 5),
        "perChrom": stats,
    }
    (GT / "folddis.json").write_text(json.dumps(meta, indent=1) + "\n")
    print(f"\n  genome-wide: {meta['scoredPct']}% scored, median {meta['median']}, "
          f"p01 {meta['p01']}, p99 {meta['p99']}, max {meta['max']}")
    print(f"wrote {GT / 'folddis.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
