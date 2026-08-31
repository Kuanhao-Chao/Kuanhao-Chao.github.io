"""
Aggregate the biology results across all fourteen windows, and align attribution on the TSS.

Every biology panel on the page shows one locus at a time, so the pattern across the fourteen is
invisible: you can see that GAL4 is the strongest knockout at GAL1 only by clicking to GAL1. This
writes the cross-locus view once, from the packs already shipped -- no model, no checkpoint.

  src/data/shorkieBiologySummary.json

Two things in it:

1. **The knockout winner per locus**, read from `<id>-ko.json`, plus the per-locus enrichment of
   attribution on each annotation class, recomputed here with the same circular-shift null the page
   uses so the summary and the panel cannot drift apart.

2. **Attribution aligned on the transcription start site.** For every gene in every window, the
   per-base gradient x input profile is cut out around that gene's TSS and averaged over genes. It
   answers a question no panel currently can: *where, relative to the feature that matters, does the
   model look?* Reported with its spread and the number of genes behind it, because it is an
   aggregate over genes whose expression differs by orders of magnitude.

The TSS is the transcript start in the direction of transcription -- `txStart` on the plus strand
and `txEnd` on the minus -- and the minus-strand profile is reversed so that "upstream" is the same
side of the plot for every gene. Getting that wrong would average promoters against terminators and
produce a flat curve that looks like a real null result.

Usage:  python3 scripts/shorkie/make_biology_summary.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SEQ_LEN, BIN_BP, CROP_BP, N_BINS = 16384, 16, 1024, 896
FLANK = 1000            # bp either side of the TSS
SHIFTS = 256


def load_rows(png: Path, spec: dict) -> np.ndarray:
    q = np.array(Image.open(png))
    lo = np.array(spec["lo"])[:, None]
    hi = np.array(spec["hi"])[:, None]
    v = q.astype(np.float64) / 255.0 * (hi - lo) + lo
    return 10.0 ** v if spec.get("space") == "log" else v


def shift_offsets(n: int, k: int = SHIFTS) -> list[int]:
    """The page's null, exactly: evenly spaced, deterministic, zero excluded."""
    return [o for o in (round(i * n / (k + 1)) % n for i in range(1, k + 1)) if o]


def enrichment(signal: np.ndarray, mask: np.ndarray) -> dict | None:
    w = mask.sum()
    total = np.abs(signal).sum()
    if w <= 0 or total <= 0:
        return None
    bg = total / len(signal)
    obs = float((np.abs(signal) * mask).sum() / w / bg)
    nulls = np.array([float((np.abs(signal) * np.roll(mask, o)).sum() / w / bg)
                      for o in shift_offsets(len(signal))])
    sd = float(nulls.std())
    return {
        "ratio": round(obs, 4),
        "nullMean": round(float(nulls.mean()), 4),
        "nullSd": round(sd, 4),
        "z": round((obs - float(nulls.mean())) / sd, 3) if sd > 0 else 0.0,
        "n": int(w),
    }


def main() -> int:
    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    vp = ROOT / "public" / "vp-data"

    per_locus = []
    class_rows: dict[str, list[float]] = {}
    tss_stack: list[np.ndarray] = []
    tss_genes = 0

    for locus in loci["loci"]:
        lid = locus["id"]
        attr_p = vp / f"{lid}-attr.json"
        if not attr_p.exists():
            continue
        meta = json.loads(attr_p.read_text())
        anchors = meta["anchors"]
        # The window's own gene is the anchor the page scores everything against.
        own = next((i for i, a in enumerate(anchors) if a["label"] == lid), 0)
        spec = meta["anchor"]
        plane = load_rows(vp / f"{lid}-anchor.png", spec)
        signal = plane[own]                                   # [16384] gradient x input

        row: dict = {"id": lid, "gene": locus["gene"]}

        ko_p = vp / f"{lid}-ko.json"
        if ko_p.exists():
            ko = json.loads(ko_p.read_text())
            sites = sorted(ko["sites"], key=lambda s: -abs(s["effect"]))
            if sites:
                w = sites[0]
                row["knockout"] = {
                    "name": w["name"], "effect": w["effect"], "sd": w["sd"],
                    "sites": len(sites),
                    "beyondSpread": sum(1 for s in sites if s["sd"] > 0
                                        and abs(s["effect"]) / s["sd"] >= 2),
                }

        ann_p = vp / f"{lid}-ann.json"
        if ann_p.exists():
            ann = json.loads(ann_p.read_text())
            groups: dict[str, list] = {}
            for f in ann["features"]:
                if f["cls"] == "tfbs":
                    ev = f.get("evidence", "none")
                    key = ("tfbs:pwm" if f.get("source") == "jaspar"
                           else "tfbs:chip" if ev != "none" else "tfbs:conserved")
                else:
                    key = f["cls"]
                groups.setdefault(key, []).append(f)
            row["classes"] = {}
            for key, feats in groups.items():
                mask = np.zeros(SEQ_LEN)
                for f in feats:
                    mask[max(0, f["start"]):min(SEQ_LEN, f["end"])] = 1
                e = enrichment(signal, mask)
                if e:
                    row["classes"][key] = e
                    class_rows.setdefault(key, []).append(e["ratio"])

            # --- attribution aligned on the TSS -----------------------------------------------
            # Direction of transcription, not coordinate order: txStart on +, txEnd on -, and the
            # minus-strand profile reversed so "upstream" is the same side for every gene.
            # Averaging without that flip puts promoters against terminators and flattens the curve.
            for f in locus["features"]:
                tss = f["txStart"] if f["strand"] == "+" else f["txEnd"]
                a, b = tss - FLANK, tss + FLANK
                if a < 0 or b > SEQ_LEN:
                    continue
                prof = np.abs(signal[a:b])
                if f["strand"] == "-":
                    prof = prof[::-1]
                s = prof.sum()
                if s <= 0:
                    continue
                tss_stack.append(prof / s * len(prof))        # each gene weighted equally
                tss_genes += 1

        per_locus.append(row)

    tss = None
    if tss_stack:
        arr = np.vstack(tss_stack)
        # Bin to 40 bp so the curve is readable; the raw 2,000 points are noise at this sample size.
        binned = arr.reshape(arr.shape[0], -1, 40).mean(axis=2)
        tss = {
            "flank": FLANK,
            "bin": 40,
            "genes": tss_genes,
            "mean": [round(float(v), 5) for v in binned.mean(axis=0)],
            # The spread over genes, not a confidence interval: these genes differ enormously.
            "sd": [round(float(v), 5) for v in binned.std(axis=0)],
        }

    summary = {
        "loci": per_locus,
        "classMedians": {k: round(float(np.median(v)), 4) for k, v in sorted(class_rows.items())},
        "classCounts": {k: len(v) for k, v in sorted(class_rows.items())},
        "tss": tss,
        "note": "gradient x input on each window's own gene; nulls from 256 deterministic "
                "circular shifts, the same procedure the page uses",
    }
    out = ROOT / "src" / "data" / "shorkieBiologySummary.json"
    out.write_text(json.dumps(summary, separators=(",", ":")))

    print(f"{len(per_locus)} loci, {tss_genes} genes in the TSS profile, "
          f"{out.stat().st_size / 1024:.0f} KB")
    for k, v in summary["classMedians"].items():
        print(f"  {k:22s} median {v:6.3f}x over {summary['classCounts'][k]:2d} loci")
    wins = [(r["gene"], r["knockout"]["name"], r["knockout"]["effect"])
            for r in per_locus if "knockout" in r]
    print("  strongest knockout per locus:")
    for g, n, e in wins:
        print(f"    {g:8s} {n:10s} {e:+.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
