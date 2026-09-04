"""
What does each of the eight attention heads look at?

The transformer at Shorkie's bottleneck has 8 heads over 128 positions, and every locus pack
already ships their full [8 x 128 x 128] maps -- so this asks a mechanistic question with no
forward passes at all. For each head, how much of its attention lands on each class of curated
annotation, against a null that destroys only the alignment.

Three things decide whether the answer means anything:

  * **The mask is pooled by MEAN, never by max.** One bottleneck position is 128 bp and a typical
    binding site is 7 bp, so a max marks the whole cell annotated and every class comes out
    identical once pooled -- numbers that mean nothing while looking exactly like numbers that do.
  * **The null is a CIRCULAR SHIFT of the mask**, not a resample. Rotation preserves the feature
    count, every length and every gap, and destroys only the alignment. Resampling positions
    compares against an annotation that does not resemble the real one and calls almost everything
    significant.
  * **Attention is read as a distribution over KEYS.** Each row of a head is already normalised, so
    summing a row's mass over the annotated keys asks "when this head reads anything, what fraction
    of what it reads is annotated" -- a quantity that cannot be inflated by a head simply being
    louder.

The binding-site tiers stay separate for the same reason they do everywhere else here:
ChIP-supported, conserved-only and PWM-scan are three different strengths of claim.

Output: src/data/shorkieHeads.json

Usage:  python3 scripts/shorkie/make_heads.py [--shifts 256]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

SEQ_LEN = 16384
N_HEADS = 8
N_POS = 128
POS_BP = SEQ_LEN // N_POS          # 128 bp a bottleneck position


def tier(f: dict) -> str:
    """The same three tiers the rest of the site draws: ChIP-supported, conserved-only, PWM scan."""
    if f.get("source") == "jaspar":
        return "tfbs_pwm"
    return "tfbs_chip" if f.get("evidence") == "good" else "tfbs_conserved"


def load_attention(locus_id: str) -> np.ndarray | None:
    """[8 x 128 x 128], rows already normalised by the model's own softmax."""
    side = ROOT / "public" / "vp-data" / f"{locus_id}.json"
    png = ROOT / "public" / "vp-data" / f"{locus_id}-attn.png"
    if not side.exists() or not png.exists():
        return None
    spec = json.loads(side.read_text()).get("attn")
    if not spec:
        return None
    q = np.array(Image.open(png).convert("L"), dtype=np.float64)
    lo = np.array(spec["lo"], dtype=np.float64)[:, None]
    hi = np.array(spec["hi"], dtype=np.float64)[:, None]
    v = q / 255.0 * np.maximum(hi - lo, 1e-9) + lo
    return v.reshape(N_HEADS, N_POS, N_POS)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shifts", type=int, default=256)
    args = ap.parse_args()

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())["loci"]
    vp = ROOT / "public" / "vp-data"

    # observed[head][cls] and null[head][cls] accumulated over every window
    obs: dict[str, np.ndarray] = {}
    nul: dict[str, np.ndarray] = {}
    cover: dict[str, list[float]] = {}
    used = 0

    for L in loci:
        att = load_attention(L["id"])
        ann_p = vp / f"{L['id']}-ann.json"
        if att is None or not ann_p.exists():
            continue
        feats = json.loads(ann_p.read_text())["features"]

        masks: dict[str, np.ndarray] = {}
        for f in feats:
            cls = tier(f) if f["cls"] == "tfbs" else f["cls"]
            m = masks.setdefault(cls, np.zeros(SEQ_LEN, dtype=np.float64))
            a, b = max(0, int(f["start"])), min(SEQ_LEN, int(f["end"]))
            if b > a:
                m[a:b] = 1.0
        if not masks:
            continue
        used += 1

        # Each head's rows are a distribution over keys, so mass on a class is a row-sum against
        # the pooled mask, averaged over queries.
        for cls, m in masks.items():
            pooled = m.reshape(N_POS, POS_BP).mean(axis=1)          # MEAN, never max
            cover.setdefault(cls, []).append(float(pooled.mean()))
            o = att @ pooled                                        # [heads x queries]
            obs.setdefault(cls, np.zeros(N_HEADS))
            obs[cls] += o.mean(axis=1)
            # The null: the same profile, rotated. Deterministic offsets, evenly spaced, zero
            # excluded, so a published ratio is reproducible.
            acc = np.zeros(N_HEADS)
            for k in range(1, args.shifts + 1):
                s = (k * N_POS) // (args.shifts + 1)
                if s == 0:
                    s = k % N_POS or 1
                acc += (att @ np.roll(pooled, s)).mean(axis=1)
            nul.setdefault(cls, np.zeros(N_HEADS))
            nul[cls] += acc / args.shifts

    if not used:
        raise SystemExit("no locus had both an attention pack and an annotation file")

    rows = []
    for cls in sorted(obs, key=lambda c: -float(np.max(obs[c] / np.maximum(nul[c], 1e-12)))):
        enr = obs[cls] / np.maximum(nul[cls], 1e-12)
        cov = float(np.mean(cover[cls]))
        rows.append({
            "cls": cls,
            "meanCoverage": round(cov, 5),
            # A class covering most of the window CANNOT be strongly enriched: if every unit
            # of attention landed on it, the ratio would still only be 1/coverage. `gene`
            # covers 91.5%, so its ceiling is 1.09x and reading its 1.03 as "flat" would be
            # wrong -- it is most of the way to the maximum the geometry allows. Same trap
            # as phastCons saturating inside CDS.
            "ceiling": round(1.0 / cov, 2) if cov > 0 else None,
            "byHead": [round(float(v), 4) for v in enr],
            "best": int(np.argmax(enr)), "bestEnrichment": round(float(np.max(enr)), 4),
            "spread": round(float(np.max(enr) / max(np.min(enr), 1e-12)), 3),
        })

    print(f"  {used} windows, {N_HEADS} heads, {args.shifts} circular shifts\n")
    print(f"  {'class':<18}{'cover':>7}  " + "".join(f"h{h}".rjust(7) for h in range(N_HEADS))
          + "   best")
    for r in rows:
        print(f"  {r['cls']:<18}{r['meanCoverage']:>7.3f}  "
              + "".join(f"{v:>7.2f}" for v in r["byHead"])
              + f"   h{r['best']} at {r['bestEnrichment']:.2f}x"
              + (f" of {r['ceiling']:.2f}x possible" if r["ceiling"] and r["ceiling"] < 3 else ""))

    spread = max(r["spread"] for r in rows)
    (ROOT / "src" / "data" / "shorkieHeads.json").write_text(json.dumps({
        "note": "Attention mass each head places on each annotation class, against a circular-shift "
                "null. 1.0 means the head reads that class no more than its share of the sequence. "
                "The mask is pooled to the bottleneck's 128 positions by MEAN: a 7 bp site is 5% of "
                "a 128 bp cell, and a max would mark the whole cell annotated.",
        "heads": N_HEADS, "positions": N_POS, "positionBp": POS_BP,
        "shifts": args.shifts, "windows": used,
        "maxSpreadAcrossHeads": round(spread, 3),
        "classes": rows,
    }, separators=(",", ":")))
    print(f"\n  widest spread across heads within a class: {spread:.2f}x")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
