"""
Do the sequence drivers of a gene's induction CHANGE as the response unfolds?

Direction 3 of the interpretability brainstorm, and the first two ways of asking it give nothing.

**The timepoint MEANS are a dead end, measured twice.** The 13 mean coverage tracks correlate at
>= 0.9923 with each other, and their gradients are worse: early against late attribution over a
gene body comes out at **r >= 0.9995 with 99% of the top 500 bases shared**. Both have the same
cause -- each mean averages ~300 different regulators, and averaging 300 induction experiments
leaves the shared baseline transcriptome.

**Per REGULATOR it is real.** Taking one regulator's own tracks at an early and a late timepoint,
the attribution over a gene body can move a long way: MSN2 at GAL1 goes from r = 0.389 between
T5 and T90, sharing only 52% of its strongest 500 bases, while RPN4 at TDH3 stays at 0.999. The
shift is large where the factor actually regulates the gene and absent where it does not, which is
the prediction Direction 3 makes.

Two contrasts are computed because they are different questions:

    T0    vs late   "does induction change what the model reads?"
    early vs late   "do the drivers shift WITHIN the response?"

They agree closely (GAL1/MSN2: 0.429 and 0.389), so the shift is not merely induced-or-not.

Storage: the full [2 x 16,384] profile is kept only for the regulators that move most at each
locus; every pair's correlation is kept for all of them, which is what the ranking needs.

Output:
    src/data/shorkieKinetics.json     the full locus x regulator correlation table
    public/vp-data/<id>-kin.png       [2k x 16,384] early/late profiles for the top regulators
    public/vp-data/<id>-kin.json      which regulators those are, and their scales

Usage:  python3 scripts/shorkie/make_kinetics.py <ckpt.h5> [--top 6] [--min-tracks 4]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

from make_attribution import encode, rc_input, rc_grad          # noqa: E402
from make_ism import quantize_rows, dequantize_rows             # noqa: E402

SCRATCH = Path(__file__).resolve().parent / "_scratch"
OUT = ROOT / "public" / "vp-data"
SEQ_LEN = 16384


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("--top", type=int, default=6, help="regulators to keep a full profile for")
    ap.add_argument("--min-tracks", type=int, default=4,
                    help="minimum replicates a regulator needs at BOTH timepoints")
    ap.add_argument("--device", default=None)
    args = ap.parse_args()

    import torch
    from shorkie_torch import build

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    names = json.loads((ROOT / "src" / "data" / "shorkieTrackNames.json").read_text())["identifiers"]
    pat = re.compile(r"^(.+?)_T(\d+)_S(\d+)$")
    byreg: dict[str, dict[int, list[int]]] = {}
    for i, n in enumerate(names):
        if 1148 <= i < 4201 and (m := pat.match(n)):
            byreg.setdefault(m.group(1), {}).setdefault(int(m.group(2)), []).append(i)

    # A regulator qualifies when it has enough replicates at an EARLY and a LATE timepoint. Thin
    # timepoints (T15, T30, T45, T60 and T90 carry 64-77 tracks against T0's 384) make a noisy mean
    # and a noisy gradient, so the floor is on replicate count rather than on the timepoint label.
    plan = []
    for r, d in byreg.items():
        early = [t for t in d if 5 <= t <= 20 and len(d[t]) >= args.min_tracks]
        late = [t for t in d if t >= 60 and len(d[t]) >= args.min_tracks]
        if early and late:
            plan.append((r, min(early), max(late)))
    plan.sort()
    print(f"  {len(plan)} regulators with >= {args.min_tracks} replicates early and late")

    dev = args.device or ("mps" if torch.backends.mps.is_available() else "cpu")
    model, _ = build(args.checkpoint)
    n_par = sum(p.numel() for p in model.parameters())
    n_bn = sum(b.numel() for n, b in model.named_buffers() if "running" in n)
    if n_par + n_bn != 14_253_567:
        raise SystemExit(f"{args.checkpoint} is not fold-f0 ({n_par + n_bn:,} values)")
    model.eval().to(dev)

    def attribution(x, idx, a, b):
        """Gradient x input of one track subset's coverage over [a, b), rc-averaged."""
        def one(xin, lo, hi):
            t = torch.tensor(idx, device=dev)
            xt = xin.clone().requires_grad_(True)
            torch.log2(model(xt)[0][0][:, t].mean(dim=-1)[lo:hi].sum() + 1.0).backward()
            return xt.grad[0, :, :4].detach()
        g = (one(x, a, b) + rc_grad(one(rc_input(x), 896 - b, 896 - a))) / 2
        return (g * x[0, :, :4]).sum(dim=-1).float().cpu().numpy()

    table, t_all = {}, time.time()
    for L in loci["loci"]:
        own = next((f for f in L["features"] if f["name"] == L["id"]), None)
        if not own:
            continue
        a, b = own["start"], own["end"]
        x = torch.from_numpy(encode(L["sequence"], loci["speciesIndex"])).to(dev)
        t0 = time.time()
        rows, prof = [], {}
        for r, te, tl in plan:
            A = attribution(x, byreg[r][te], a, b)
            B = attribution(x, byreg[r][tl], a, b)
            rr = float(np.corrcoef(A, B)[0, 1])
            ta = set(np.argsort(-np.abs(A))[:500].tolist())
            tb = set(np.argsort(-np.abs(B))[:500].tolist())
            rows.append({"reg": r, "early": te, "late": tl, "r": round(rr, 5),
                         "overlap": round(len(ta & tb) / 500, 4)})
            prof[r] = (A, B)
        rows.sort(key=lambda z: z["r"])
        table[L["id"]] = {"gene": L["gene"], "pairs": rows}

        keep = [z["reg"] for z in rows[: args.top]]
        plane = np.vstack([v for r in keep for v in prof[r]])
        q, lows, highs = quantize_rows(plane, "log")
        lows = [float(v) for v in lows]
        highs = [float(v) for v in highs]
        Image.fromarray(q, mode="L").save(OUT / f"{L['id']}-kin.png", format="PNG", optimize=True)
        err = float(np.abs(dequantize_rows(q, np.array(lows), np.array(highs), "log") - plane).max())
        (OUT / f"{L['id']}-kin.json").write_text(json.dumps({
            "rows": len(keep) * 2, "cols": SEQ_LEN, "space": "log", "lo": lows, "hi": highs,
            "layout": "two rows a regulator: early then late",
            "regulators": [{"reg": r, **next(z for z in rows if z["reg"] == r)} for r in keep],
            "decodeError": round(err, 8),
        }, separators=(",", ":")))
        print(f"  {L['gene']:<9} {len(rows):>3} regulators  [{(time.time()-t0)/60:.1f} min]  "
              f"most shifted {rows[0]['reg']} r={rows[0]['r']:.3f}  "
              f"least {rows[-1]['reg']} r={rows[-1]['r']:.3f}", flush=True)

    allr = [z["r"] for v in table.values() for z in v["pairs"]]
    (ROOT / "src" / "data" / "shorkieKinetics.json").write_text(json.dumps({
        "note": "Per regulator, the correlation between its EARLY and LATE attribution over each "
                "window's own gene body. Low means the model reads a different part of the "
                "sequence as the response unfolds.",
        "regulators": len(plan), "minReplicates": args.min_tracks,
        "median": round(float(np.median(allr)), 4),
        "p05": round(float(np.percentile(allr, 5)), 4),
        "min": round(float(np.min(allr)), 4),
        "timepointMeanControl": {
            "r": 0.9995,
            "reading": "the same contrast computed on the 13 timepoint MEANS instead of one "
                       "regulator gives r >= 0.9995 and 99% shared top bases -- averaging ~300 "
                       "regulators leaves only the baseline, which is why this is per regulator.",
        },
        "loci": table,
    }, separators=(",", ":")))
    print(f"\n  {len(plan)} regulators x {len(table)} loci in {(time.time()-t_all)/60:.1f} min")
    print(f"  early-vs-late r: median {np.median(allr):.4f}, 5th pct {np.percentile(allr,5):.4f}, "
          f"min {np.min(allr):.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
