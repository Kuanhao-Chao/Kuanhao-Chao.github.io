"""
Aggregate Shorkie_LM's constraint results across all fourteen windows.

The LM page shows one locus at a time, so the pattern across the fourteen is invisible: the prose
already claims "coding sequence is more constrained in 14 of 14 windows" and "LTRs sit at
0.68-0.80x", and until now a reader had to take both on trust. This writes the cross-locus view
once, from the packs already shipped -- no model, no checkpoint, no GPU.

  src/data/shorkieLmSummary.json

Two things in it:

1. **Per-locus metrics**, read straight from `<id>-lm.json`. These are NOT constant across the
   fourteen and the page used to state one window's values as though they were: masked argmax runs
   41.3% (GAL1) to 46.3% (FUN12) and perplexity 3.23 to 3.50.

2. **Per-locus constraint enrichment by annotation class**, recomputed here with the SAME
   statistic and the SAME null the page uses -- `weightedEnrichment` over 256 deterministic
   circular shifts -- so the summary panel and the per-locus panel cannot drift apart.

The two implementations agreeing is not an accident and is worth stating: JavaScript's `Math.round`
rounds halves up and Python's `round` rounds halves to even, so the shift offsets could differ. At
n = 16,384 and k = 256 there are no exact halves (257 is prime and does not divide 16,384), so the
two produce identical offsets. Change either constant and that has to be rechecked.

Usage:  python3 scripts/shorkie/make_lm_summary.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SEQ_LEN = 16384
SHIFTS = 256

# The classes worth a column. `cds` and `ltr` are the two the page makes a claim about; the binding
# tiers are the three-way evidence comparison the annotation draws differently.
COLUMNS = ["cds", "intron", "ltr", "tfbs:chip", "tfbs:conserved", "tfbs:pwm", "regulatory"]


def motif_tier(f: dict) -> str | None:
    """`motifTier` from src/lib/shorkieModel.ts, exactly."""
    src = f.get("source")
    if src == "paper":
        return "paper"
    if src == "jaspar":
        return "pwm"
    if src == "harbison-macisaac":
        ev = f.get("evidence")
        return "chip" if ev and ev != "none" else "conserved"
    return None


def shift_offsets(n: int, k: int = SHIFTS) -> list[int]:
    """`circularShiftOffsets`: evenly spaced, deterministic, zero excluded."""
    return [o for o in (round(i * n / (k + 1)) % n for i in range(1, k + 1)) if o]


def weighted_enrichment(signal: np.ndarray, weight: np.ndarray) -> dict | None:
    """`weightedEnrichment` from src/lib/shorkieModel.ts, on |signal| against a circular-shift null."""
    n = len(signal)
    w_sum = float(weight.sum())
    abs_total = float(np.abs(signal).sum())
    if w_sum <= 0 or abs_total <= 0:
        return None
    background = abs_total / n
    a = np.abs(signal)
    obs = float((a * weight).sum() / w_sum / background)
    nulls = np.array([float((a * np.roll(weight, o)).sum() / w_sum / background)
                      for o in shift_offsets(n)])
    sd = float(nulls.std())
    return {
        "ratio": round(obs, 4),
        "nullMean": round(float(nulls.mean()), 4),
        "z": round((obs - float(nulls.mean())) / sd, 3) if sd > 0 else 0.0,
        "n": int(w_sum),
    }


def decode_masked(png: Path, spec: dict) -> np.ndarray:
    """The masked-pass plane as [SEQ_LEN, 4] probabilities, renormalised after quantisation."""
    q = np.asarray(Image.open(png)).astype(np.float64)          # [4, SEQ_LEN]
    lo = np.asarray(spec["lo"])[:, None]
    hi = np.asarray(spec["hi"])[:, None]
    v = q / 255.0 * (hi - lo) + lo
    if spec.get("space") == "log":
        v = 10.0 ** v
    p = v.T                                                      # [SEQ_LEN, 4]
    return p / np.maximum(p.sum(axis=1, keepdims=True), 1e-12)


def main() -> int:
    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())["loci"]
    lm = ROOT / "public" / "lm-data"
    vp = ROOT / "public" / "vp-data"

    rows = []
    for locus in loci:
        lid = locus["id"]
        meta_p = lm / f"{lid}-lm.json"
        ann_p = vp / f"{lid}-ann.json"
        if not meta_p.exists():
            print(f"  {lid:10s} no LM pack, skipping")
            continue
        meta = json.loads(meta_p.read_text())
        p = decode_masked(lm / f"{lid}-masked.png", meta["masked"])
        # Information content, 2 - H(p), the page's constraint signal. Clamped at zero exactly as
        # renderEnrichment does: a negative IC is a quantisation artefact, not less-than-no-constraint.
        ent = -(p * np.log2(np.maximum(p, 1e-12))).sum(axis=1)
        ic = np.maximum(2.0 - ent, 0.0)

        classes: dict[str, dict] = {}
        if ann_p.exists():
            feats = json.loads(ann_p.read_text())["features"]
            groups: dict[str, list] = {}
            for f in feats:
                key = f"tfbs:{motif_tier(f)}" if f["cls"] == "tfbs" else f["cls"]
                groups.setdefault(key, []).append(f)
            for key in COLUMNS:
                fs = groups.get(key)
                if not fs:
                    continue
                mask = np.zeros(SEQ_LEN)
                for f in fs:
                    mask[max(0, f["start"]):min(SEQ_LEN, f["end"])] = 1
                e = weighted_enrichment(ic, mask)
                if e:
                    e["features"] = len(fs)
                    classes[key] = e

        rows.append({
            "id": lid,
            "gene": locus["gene"],
            "metrics": {k: round(float(v), 4) for k, v in meta["metrics"].items()},
            "meanIc": round(float(ic.mean()), 4),
            "classes": classes,
        })
        print(f"  {lid:10s} {locus['gene']:8s} argmax {meta['metrics']['maskedArgmax']*100:5.2f}%  "
              f"ppl {meta['metrics']['maskedPerplexity']:.4f}  meanIC {ic.mean():.4f}  "
              + "  ".join(f"{k.split(':')[-1]} {classes[k]['ratio']:.2f}"
                          for k in ("cds", "ltr") if k in classes))

    out = {
        "loci": rows,
        "columns": COLUMNS,
        "shifts": SHIFTS,
        "note": "information content (2 - H) per base from the iterative masked pass; enrichment "
                "is weightedEnrichment against 256 deterministic circular shifts, the same "
                "statistic and null the per-locus panel computes in the browser",
    }
    dest = ROOT / "src" / "data" / "shorkieLmSummary.json"
    dest.write_text(json.dumps(out, separators=(",", ":")))
    print(f"\n{len(rows)} loci -> {dest.relative_to(ROOT)} ({dest.stat().st_size / 1024:.0f} KB)")

    cds = [r["classes"]["cds"]["ratio"] for r in rows if "cds" in r["classes"]]
    ltr = [r["classes"]["ltr"]["ratio"] for r in rows if "ltr" in r["classes"]]
    if cds:
        print(f"  CDS above 1.0 in {sum(1 for v in cds if v > 1)}/{len(cds)} loci, "
              f"mean {np.mean(cds):.3f}, range {min(cds):.3f}-{max(cds):.3f}")
    if ltr:
        print(f"  LTR mean {np.mean(ltr):.3f}, range {min(ltr):.3f}-{max(ltr):.3f} "
              f"over {len(ltr)} loci that have one")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
