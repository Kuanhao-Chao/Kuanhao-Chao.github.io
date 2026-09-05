"""
How much of its 16,384 bp window does the model actually use?

The window is 16,384 bp and the receptive field is *claimed* to cover all of it -- dilated
convolutions plus full self-attention at the bottleneck. Nothing on this site measures how much of
it the prediction actually depends on, and "the architecture can see it" and "the prediction moves
when you change it" are different statements.

Keep a centred core of real sequence at radius r and replace everything outside it, then watch the
prediction converge on the full-context one as r grows. The radius where it stops moving is the
EFFECTIVE context.

**Shuffled, not zeroed.** Zeroing the DNA channels is what occlusion does and is indistinguishable
from a run of N -- a sequence the model has never seen, so the answer would be about
out-of-distribution input rather than about context. A DINUCLEOTIDE shuffle is the right null here:
yeast promoters carry strong dinucleotide bias (poly(dA:dT) tracts above all), and a mononucleotide
shuffle destroys that too, which would again measure something other than the loss of position-
specific information. The shuffle is Altschul-Erikson: an Euler path through the dinucleotide graph,
which preserves every dinucleotide count EXACTLY -- asserted here rather than assumed.

**Report the case that matters.** This repo already recorded the trap for the language model's
flank: measured on a quiet stretch the effect finished inside 1 kb, and on a gene promoter it was
still 0.0224 bits at 2 kb. So the convergence radius is reported per locus, and the headline is the
promoter case rather than the median.

Output:
    src/data/shorkieReceptive.json   per locus, the curve and its convergence radius

Usage:  python3 scripts/shorkie/make_receptive.py <ckpt.h5> [--shuffles 5]
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

from make_attribution import encode                      # noqa: E402

SCRATCH = Path(__file__).resolve().parent / "_scratch"
SEQ_LEN = 16384
RADII = [64, 128, 256, 512, 1024, 2048, 4096, 8192]


# `dinuc_shuffle` lives in `common.py` now. It was copied into three generators, which is three
# chances for one of them to drift and for a composition-matched control to stop being matched --
# and the drift would be invisible, because a shuffle that preserves the wrong thing still returns
# a plausible sequence. The lifted version was verified byte-identical to the one that used to sit
# here across 200 seeds before this import replaced it.
from common import dinuc_shuffle  # noqa: E402,F401

def dinuc_counts(s: str) -> dict[str, int]:
    c: dict[str, int] = {}
    for a, b in zip(s, s[1:]):
        c[a + b] = c.get(a + b, 0) + 1
    return c


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("--shuffles", type=int, default=5)
    ap.add_argument("--device", default=None)
    args = ap.parse_args()

    import torch
    from shorkie_torch import build

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    names = json.loads((ROOT / "src" / "data" / "shorkieTrackNames.json").read_text())["identifiers"]
    T0 = [i for i, n in enumerate(names) if "_T0_" in n and 1148 <= i < 4201]

    dev = args.device or ("mps" if torch.backends.mps.is_available() else "cpu")
    model, _ = build(args.checkpoint)
    n_par = sum(p.numel() for p in model.parameters())
    n_bn = sum(b.numel() for n, b in model.named_buffers() if "running" in n)
    if n_par + n_bn != 14_253_567:
        raise SystemExit(f"{args.checkpoint} is not fold-f0 ({n_par + n_bn:,} values)")
    model.eval().to(dev)
    T0t = torch.tensor(T0, device=dev)

    # The shuffle must be correct before anything is measured with it.
    probe = loci["loci"][0]["sequence"][:4000]
    sh = dinuc_shuffle(probe, random.Random(0))
    if dinuc_counts(sh) != dinuc_counts(probe):
        raise SystemExit("dinucleotide shuffle did not preserve the dinucleotide counts")
    if sh == probe:
        raise SystemExit("dinucleotide shuffle returned its input")
    print(f"  dinucleotide shuffle verified on {len(probe)} bp: "
          f"{len(dinuc_counts(probe))} dinucleotides preserved exactly")

    def predict(seq: str, a: int, b: int) -> float:
        x = torch.from_numpy(encode(seq, loci["speciesIndex"])).to(dev)
        with torch.no_grad():
            y = model(x)[0][0][:, T0t].mean(dim=-1)
        return float(torch.log2(y[a:b].sum() + 1.0))

    out, t0 = {}, time.time()
    print(f"\n  {'gene':<9}{'full':>8}" + "".join(f"{r:>8}" for r in RADII) + "   converges")
    for L in loci["loci"]:
        own = next((f for f in L["features"] if f["name"] == L["id"]), None)
        if not own:
            continue
        a, b = own["start"], own["end"]
        seq = L["sequence"][:SEQ_LEN]
        full = predict(seq, a, b)
        rng = random.Random(hash(L["id"]) & 0xFFFF)
        curve, spread = [], []
        for r in RADII:
            lo, hi = max(0, SEQ_LEN // 2 - r), min(SEQ_LEN, SEQ_LEN // 2 + r)
            vals = []
            for _ in range(args.shuffles):
                left = dinuc_shuffle(seq[:lo], rng) if lo else ""
                right = dinuc_shuffle(seq[hi:], rng) if hi < SEQ_LEN else ""
                vals.append(predict(left + seq[lo:hi] + right, a, b))
            curve.append(float(np.mean(vals)))
            spread.append(float(np.std(vals)))
        # The first radius within 5% of the full-context prediction, in the log2 units the model
        # is scored in -- and every larger radius must stay inside it, or this is noise not
        # convergence.
        tol = 0.05 * abs(full) if full else 0.05
        conv = next((RADII[i] for i in range(len(RADII))
                     if all(abs(curve[j] - full) <= tol for j in range(i, len(RADII)))), None)
        out[L["id"]] = {"gene": L["gene"], "full": round(full, 5),
                        "radii": RADII, "curve": [round(v, 5) for v in curve],
                        "spread": [round(v, 5) for v in spread],
                        "convergenceBp": conv, "geneBins": [a, b]}
        print(f"  {L['gene']:<9}{full:>8.2f}" + "".join(f"{v:>8.2f}" for v in curve)
              + f"   {'≥' + str(conv) if conv else 'not by 8192'}")

    conv = [v["convergenceBp"] for v in out.values() if v["convergenceBp"]]
    (ROOT / "src" / "data" / "shorkieReceptive.json").write_text(json.dumps({
        "note": "Predicted log2 T0 expression of each window's own gene with only a centred core of "
                "real sequence kept and the flanks dinucleotide-shuffled, against the full-context "
                "prediction. The radius where the curve stops moving is the effective context.",
        "shuffles": args.shuffles, "radii": RADII, "toleranceFraction": 0.05,
        "shuffle": "Altschul-Erikson dinucleotide shuffle; every dinucleotide count preserved exactly",
        "medianConvergenceBp": int(np.median(conv)) if conv else None,
        "maxConvergenceBp": int(max(conv)) if conv else None,
        "notConverged": [v["gene"] for v in out.values() if not v["convergenceBp"]],
        "loci": out,
    }, separators=(",", ":")))
    print(f"\n  {len(out)} loci in {(time.time()-t0)/60:.1f} min")
    if conv:
        print(f"  convergence radius: median {int(np.median(conv)):,} bp, max {max(conv):,} bp "
              f"of the 8,192 available")
    print(f"  never converged: {[v['gene'] for v in out.values() if not v['convergenceBp']] or 'none'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
