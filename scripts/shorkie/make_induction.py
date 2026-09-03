"""
Where the model predicts expression is CONDITION-DEPENDENT, in one lane.

**This exists because the obvious design was measured and failed.** The plan was to ship the 13
induction-timepoint means as 13 genome-wide lanes so a reader could pick a condition. They are
indistinguishable: the lowest pairwise correlation among all 13 is **0.9923**, and T5 against T0 is
**1.0000**. Each timepoint mean averages ~300 different regulators, and averaging 300 induction
experiments washes out every individual induction -- what is left is the shared baseline
transcriptome. Twelve lanes at 820 KB each would have been 10 MB of the same picture, which is the
`rnaseq_tf` mistake this repo has already made once.

The information is real and it is in the INDIVIDUAL tracks: over GAL1's gene body the 3,053
individual tracks span **43.7x** (0.22 to 9.46 against a T0 mean of 2.94). Those cannot ship
genome-wide -- 337 regulators would be 276 MB -- so they stay available inside the 23 analysed
windows, where the full pack is already on disk.

What CAN ship genome-wide is the spread itself:

    induction = (max - min across the 13 timepoint means) / (mean + 1)

and it is biologically ordered. Over their own gene bodies the most condition-dependent loci are
**HOP2 0.776** (meiosis-specific, silent in vegetative growth) and **GAL3 0.542** (glucose-repressed),
and the least are the constitutive glycolytic enzymes -- **PDC1 0.065, ADH1 0.077, FBA1 0.078,
TDH3 0.081**. A tenfold separation, in the right direction, from a quantity nothing was tuned on.

**The normalisation was chosen from the data, not by taste.** The RAW range reads the question
backwards, because it is dominated by however much a gene is expressed at all: TDH3's raw range is
73.2 against HOP2's 1.1. Dividing by the mean fixes the direction but is unbounded and unstable
where the mean is near zero (max 4.45). `range / (mean + 1)` -- the same pseudocount convention
logSED uses -- is bounded (median 0.157, p99 0.934, max 1.97) and keeps the ordering.

Output:
    _scratch/genome-track/<chrom>-sk-induction.npy   float32, 16 bp bins, [0, ~2]

Usage:  python3 scripts/shorkie/make_induction.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

from make_genome_track import OUT                      # noqa: E402

SCRATCH = Path(__file__).resolve().parent / "_scratch"


def main() -> int:
    names = json.loads((ROOT / "src" / "data" / "shorkieTrackNames.json").read_text())["identifiers"]
    tp = re.compile(r"_T(\d+)_")
    seen = {int(m.group(1)) for i, n in enumerate(names) if 1148 <= i < 4201 and (m := tp.search(n))}
    tps = sorted(seen)
    if len(tps) != 13:
        raise SystemExit(f"expected 13 timepoints, found {tps}")
    key = {t: ("baseline" if t == 0 else f"t{t}") for t in tps}

    chroms = sorted(p.name.split("-sk-cov-")[0] for p in OUT.glob("*-sk-cov-baseline.npy"))
    if not chroms:
        raise SystemExit("run make_genome_shorkie.py --pass coverage first")

    stats = []
    for chrom in chroms:
        paths = [OUT / f"{chrom}-sk-cov-{key[t]}.npy" for t in tps]
        missing = [p.name for p in paths if not p.exists()]
        if missing:
            raise SystemExit(f"{chrom}: missing {missing[:3]} -- re-run the coverage pass")
        M = np.vstack([np.load(p) for p in paths])
        # NaN propagates: a bin unscored in one timepoint is unscored here, which is the whole
        # of the head's 1,024 bp crop and nothing else.
        out = ((M.max(axis=0) - M.min(axis=0)) / (M.mean(axis=0) + 1.0)).astype(np.float32)
        np.save(OUT / f"{chrom}-sk-induction.npy", out)
        fin = np.isfinite(out)
        stats.append((chrom, int(fin.sum()), float(out[fin].mean()), float(out[fin].max())))

    tot = sum(s[1] for s in stats)
    wm = sum(s[2] * s[1] for s in stats) / tot
    print(f"  {len(chroms)} chromosomes, {tot:,} scored bins over {len(tps)} timepoints")
    print(f"  weighted mean {wm:.4f}, max {max(s[3] for s in stats):.4f}")

    # The check that this lane means anything: the loci the model calls condition-dependent must be
    # the regulated ones, not simply the quiet ones.
    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())["loci"]
    rows = []
    for L in loci:
        p = OUT / f"{L['chrom']}-sk-induction.npy"
        own = next((f for f in L["features"] if f["name"] == L["id"]), None)
        if not p.exists() or not own:
            continue
        a = (L["start"] + own["txStart"]) // 16
        b = (L["start"] + own["txEnd"]) // 16
        rows.append((L["gene"], float(np.nanmean(np.load(p)[a:b]))))
    rows.sort(key=lambda r: -r[1])
    print("  most condition-dependent: "
          + ", ".join(f"{g} {v:.3f}" for g, v in rows[:4]))
    print("  least:                    "
          + ", ".join(f"{g} {v:.3f}" for g, v in rows[-4:]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
