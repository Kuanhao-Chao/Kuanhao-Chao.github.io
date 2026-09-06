"""Fold the eight per-fold benchmark runs into a `byFold` block in each shipped pack.

The fold ledger crossed the fold axis; the three benchmarks that GRADE the page did not, so
"attention rollout is demoted", "the all-zero baseline loses" and "the Hessian does not calibrate"
were single-checkpoint verdicts sitting beside a panel about training-fold uncertainty.

The headline stays f0 -- it is the fold the paper's own Figure 4 uses, which the page already
explains -- and this adds the column that says whether the VERDICT survives retraining. A verdict
that holds in eight of eight is a different object from one that holds in five.

Reads:   _scratch/foldcross/{faith,refs,gram}-f<n>.json
Writes:  a `byFold` block into shorkieFaithfulness.json, shorkieReferences.json, shorkieGrammar.json

Usage:  python3 scripts/shorkie/summarise_folds.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
from common import ROOT, SCRATCH  # noqa: E402

CROSS = SCRATCH / "foldcross"
PACKS = {
    "faith": ("shorkieFaithfulness.json", "Faithfulness"),
    "refs": ("shorkieReferences.json", "References"),
    "gram": ("shorkieGrammar.json", "Grammar"),
}


def load(prefix: str) -> dict[str, dict]:
    out = {}
    for f in common.FOLDS:
        p = CROSS / f"{prefix}-{f}.json"
        if p.exists():
            out[f] = json.loads(p.read_text())
    return out


def faith_block(runs: dict[str, dict]) -> dict:
    """Per method: its AUC in every fold, and how many folds promote it."""
    methods = [r["method"] for r in next(iter(runs.values()))["scorecard"]]
    rows = []
    for m in methods:
        per = {}
        for f, d in runs.items():
            hit = next((r for r in d["scorecard"] if r["method"] == m), None)
            if hit:
                per[f] = hit
        if not per:
            continue
        role = next(iter(per.values())).get("role", "method")
        aucs = [per[f]["deletionAuc"] for f in sorted(per)]
        promoted = sum(1 for f in per if per[f].get("beatsBaselines"))
        rows.append({
            "method": m, "role": role,
            "auc": [round(a, 4) for a in aucs],
            "medianAuc": round(float(np.median(aucs)), 4),
            "minAuc": round(float(np.min(aucs)), 4),
            "maxAuc": round(float(np.max(aucs)), 4),
            "promotedInFolds": promoted,
        })
    tested = [r for r in rows if r["role"] == "method"]
    return {
        "folds": sorted(runs),
        "methods": rows,
        # The claim that survives, stated as a count rather than as a single-fold verdict.
        "unanimous": all(r["promotedInFolds"] in (0, len(runs)) for r in tested),
        "alwaysPromoted": [r["method"] for r in tested if r["promotedInFolds"] == len(runs)],
        "neverPromoted": [r["method"] for r in tested if r["promotedInFolds"] == 0],
        "split": [r["method"] for r in tested if 0 < r["promotedInFolds"] < len(runs)],
    }


def refs_block(runs: dict[str, dict]) -> dict:
    fams = [r["family"] for r in next(iter(runs.values()))["families"]]
    per_fam = {}
    for fam in fams:
        aucs = [next(r["medianDeletionAuc"] for r in runs[f]["families"] if r["family"] == fam)
                for f in sorted(runs)]
        per_fam[fam] = [round(a, 4) for a in aucs]
    winners = [runs[f]["best"] for f in sorted(runs)]
    return {
        "folds": sorted(runs),
        "aucByFamily": per_fam,
        "winnerPerFold": winners,
        "zeroWinsInFolds": sum(1 for w in winners if w == "zero"),
        "winnerUnanimous": len(set(winners)) == 1,
        "modalWinner": max(set(winners), key=winners.count),
    }


def gram_block(runs: dict[str, dict]) -> dict:
    r = [runs[f]["hessianCalibration"]["medianR"] for f in sorted(runs)]
    sep = [runs[f]["separationCalibration"]["medianR"] for f in sorted(runs)]
    # The fold arm runs a smaller position panel than the headline, so the panel size travels with
    # the numbers rather than depending on someone remembering to write it into the prose.
    sizes = {runs[f]["positionsPerLocus"] for f in runs}
    pairs = {runs[f]["pairsTotal"] for f in runs}
    return {
        "folds": sorted(runs),
        "positionsPerLocus": min(sizes),
        "pairsPerFold": min(pairs),
        "reducedPanel": len(sizes) == 1,
        "hessianR": r,
        "separationR": sep,
        "hessianPositiveInFolds": sum(1 for v in r if v is not None and v > 0),
        # The comparison the panel turns on: does a trivial predictor beat the shipped one?
        "separationBeatsHessianInFolds": sum(1 for a, b in zip(sep, r)
                                             if a is not None and b is not None and a > b),
    }


def main() -> int:
    builders = {"faith": faith_block, "refs": refs_block, "gram": gram_block}
    for prefix, (fname, label) in PACKS.items():
        runs = load(prefix)
        dest = ROOT / "src" / "data" / fname
        if not runs:
            print(f"  {label:14s} no per-fold runs in {CROSS}, skipped")
            continue
        if not dest.exists():
            print(f"  {label:14s} {dest} missing", file=sys.stderr)
            continue
        pack = json.loads(dest.read_text())
        pack["byFold"] = builders[prefix](runs)
        dest.write_text(json.dumps(pack, separators=(",", ":")) + "\n")
        print(f"  {label:14s} byFold over {len(runs)} folds -> {fname}")

    fa = json.loads((ROOT / "src" / "data" / "shorkieFaithfulness.json").read_text()).get("byFold")
    rf = json.loads((ROOT / "src" / "data" / "shorkieReferences.json").read_text()).get("byFold")
    gm = json.loads((ROOT / "src" / "data" / "shorkieGrammar.json").read_text()).get("byFold")
    print()
    if fa:
        print(f"  methods promoted in every fold : {', '.join(fa['alwaysPromoted']) or 'none'}")
        print(f"  methods promoted in none       : {', '.join(fa['neverPromoted']) or 'none'}")
        print(f"  split across folds             : {', '.join(fa['split']) or 'none'}")
    if rf:
        print(f"  reference winner per fold      : {', '.join(rf['winnerPerFold'])}")
        print(f"  all-zero wins in               : {rf['zeroWinsInFolds']} of {len(rf['folds'])}")
    if gm:
        print(f"  Hessian r per fold             : "
              + ', '.join('—' if v is None else f'{v:+.3f}' for v in gm['hessianR']))
        print(f"  positive in                    : {gm['hessianPositiveInFolds']} of {len(gm['folds'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
