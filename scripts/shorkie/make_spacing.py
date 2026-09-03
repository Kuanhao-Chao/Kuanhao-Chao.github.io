"""
Does the model care HOW two motifs are arranged, or only that both are present?

`make_epistasis.py` asked this with a Hessian-vector product -- a second derivative at the real
sequence -- and answered no: sites on the same helical face were no more interacting than sites on
opposite faces (ratio 0.948), and the periodogram's apparent periods turned out to be harmonics of
the analysis window. That is evidence about the neighbourhood of one sequence.

This is the CONSTRUCTIVE test, which is stronger: build the arrangement and measure it. Motif A is
implanted at the window centre and motif B is walked away from it one base at a time, in all four
orientation combinations, over dinucleotide-shuffled backgrounds. If the model has learned a
grammar -- helical phasing, a preferred spacing, an orientation requirement -- it appears as
structure in that curve.

The quantity is the INTERACTION, not the pair's effect:

    interaction(d) = E[both] - E[A alone] - E[B alone at d]

Both singles are measured too, and B's solo effect is measured AT EACH SEPARATION rather than once,
because a motif's effect varies with position for reasons that have nothing to do with the other
motif. Subtracting a single number would fold that positional dependence into the "interaction" and
manufacture exactly the structure this script is looking for.

Every configuration runs on the SAME backgrounds, so the curve is paired across separations and
background variation does not appear as spacing structure.

Two readings of helical phasing, because a periodogram alone has already misled this repo once:
  * the explicit contrast -- separations near integer multiples of 10.5 bp (same DNA face) against
    those near half-integer multiples (opposite face)
  * a periodogram, with every peak checked against the harmonics of the scan window itself; the
    epistasis run's "periods" of 49, 73.5 and 36.8 bp were 147/3, 147/2 and 147/4

If a 10.5 bp periodicity appears here after the Hessian said no, that DISAGREEMENT is the finding
and is reported as one -- a local second derivative and a constructed arrangement are different
questions and may honestly differ.

Output: src/data/shorkieSpacing.json

Usage:  python3 scripts/shorkie/make_spacing.py <ckpt.h5> [--backgrounds 8]
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
from make_receptive import dinuc_shuffle                 # noqa: E402
from make_gia import rc                                  # noqa: E402

SEQ_LEN, BIN_BP, CROP_BP = 16384, 16, 1024
ANCHOR = SEQ_LEN // 2
LOCAL_BP = 512
HELIX = 10.5

# Fine over the range where a helical period would show, coarse out to 200 bp.
SEPS = list(range(4, 65)) + list(range(70, 205, 5))

# Pairs chosen for what they test, not for convenience: two homotypic pairs (the classic
# multiple-site architecture), an activator with the core promoter element, and the E-box against
# itself, which GIA showed is the strongest single activator the model has learned.
PAIRS = [
    ("rap1", "tata", "Rap1 -> TATA: the glycolytic promoter architecture"),
    ("rap1", "rap1", "Rap1 x Rap1: homotypic, the classic multiple-site case"),
    ("abf1", "tata", "Abf1 -> TATA"),
    ("cbf1", "cbf1", "Cbf1 x Cbf1: homotypic E-box"),
    ("reb1", "tata", "Reb1 -> TATA: nucleosome positioning meets the core promoter"),
    ("tye7", "cbf1", "Tye7 x Cbf1: two readers of the same E-box"),
]


def analyse(rec: dict, helix: float) -> dict:
    """Read phasing off a stored interaction curve. Separated from the sweep so the analysis can be
    redone without 25,000 forward passes -- the curves are the measurement, this is a view of them.
    """
    seps = rec["separations"]
    fine = [i for i, d in enumerate(seps) if d <= 64]
    ff = np.array(rec["interaction"]["FF"], dtype=float)
    phase = np.array([(seps[i] % helix) / helix for i in fine])
    inph = [fine[k] for k, ph in enumerate(phase) if ph < 0.15 or ph > 0.85]
    anti = [fine[k] for k, ph in enumerate(phase) if 0.35 < ph < 0.65]
    den = float(np.mean(np.abs(ff[anti]))) if len(anti) else 0.0
    ratio = float(np.mean(np.abs(ff[inph]))) / den if len(inph) and den else None

    y = ff[fine] - ff[fine].mean()
    n = len(y)
    freqs = np.fft.rfftfreq(n, d=1.0)[1:]
    power = np.abs(np.fft.rfft(y))[1:] ** 2
    top = np.argsort(power)[::-1][:3]
    periods = [round(float(1.0 / freqs[j]), 2) for j in top]
    # Harmonics of the SCAN WINDOW, which are what a periodogram of structureless data peaks at.
    # k runs far enough to cover the helical period: this analysis window is 61 points, so n/6 is
    # 10.17 bp -- 0.33 bp from one helical turn. A 61-point periodogram therefore CANNOT separate
    # helical phasing from its own sixth harmonic, which is precisely why the explicit in-phase /
    # anti-phase contrast above is the primary reading and this spectrum is the secondary one.
    harmonics = [round(n / k, 2) for k in range(2, 13)]
    conf = [h for h in harmonics if abs(h - helix) < 0.75]
    return {
        "helicalRatio": round(ratio, 4) if ratio else None,
        "inPhaseN": len(inph), "antiPhaseN": len(anti),
        "topPeriods": periods, "windowHarmonics": harmonics,
        "topPeriodsAllHarmonic": all(
            any(abs(h - pd) < 0.75 for h in harmonics + [float(n)]) for pd in periods),
        "harmonicsNearHelix": conf,
        "scanPoints": n,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint", nargs="?")
    ap.add_argument("--backgrounds", type=int, default=8)
    ap.add_argument("--device", default=None)
    ap.add_argument("--reanalyse", action="store_true",
                    help="re-read phasing from the stored curves; no model, no forward passes")
    args = ap.parse_args()

    if args.reanalyse:
        path = ROOT / "src" / "data" / "shorkieSpacing.json"
        d = json.loads(path.read_text())
        for k, rec in d["pairs"].items():
            rec.update(analyse(rec, d["helicalPeriodBp"]))
        rs = [r["helicalRatio"] for r in d["pairs"].values() if r["helicalRatio"]]
        d["medianHelicalRatio"] = round(float(np.median(rs)), 4) if rs else None
        d["helicalRatioRange"] = [round(min(rs), 4), round(max(rs), 4)] if rs else None
        d["allTopPeriodsHarmonic"] = all(r["topPeriodsAllHarmonic"] for r in d["pairs"].values())
        d["strongestPair"] = max(d["pairs"].values(), key=lambda r: r["maxInteraction"])["label"]
        path.write_text(json.dumps(d, separators=(",", ":")))
        print(f"  {'pair':<46}{'helical':>9}{'peak':>9}{'at':>6}  periods all window harmonics?")
        for r in d["pairs"].values():
            print(f"  {r['label'][:45]:<46}{r['helicalRatio'] or 0:>9.3f}"
                  f"{r['maxInteraction']:>9.4f}{r['maxAtBp']:>5} bp  "
                  f"{'yes' if r['topPeriodsAllHarmonic'] else 'NO -- ' + str(r['topPeriods'])}")
        print(f"\n  median in-phase / anti-phase {d['medianHelicalRatio']} "
              f"(range {d['helicalRatioRange']}); 1.0 = no phasing")
        print(f"  every top period is a scan-window harmonic: {d['allTopPeriodsHarmonic']}")
        return 0
    if not args.checkpoint:
        raise SystemExit("a checkpoint is required unless --reanalyse")

    import torch
    from shorkie_torch import build

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    mot = json.loads((ROOT / "src" / "data" / "shorkieMotifs.json").read_text())
    iupac = mot["iupac"]
    by_id = {m["id"]: m for m in mot["motifs"]}
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

    lo_bin = max(0, (ANCHOR - LOCAL_BP - CROP_BP) // BIN_BP)
    hi_bin = min(896, (ANCHOR + LOCAL_BP - CROP_BP) // BIN_BP)

    def score(seq: str) -> float:
        x = torch.from_numpy(encode(seq, loci["speciesIndex"])).to(dev)
        with torch.no_grad():
            y = model(x)[0][0][:, T0t].mean(dim=-1)
        return float(torch.log2(y[lo_bin:hi_bin].sum() + 1.0))

    rng = random.Random(20260903)
    src = [L["sequence"][:SEQ_LEN] for L in loci["loci"]]
    bgs = [dinuc_shuffle(src[i % len(src)], rng) for i in range(args.backgrounds)]

    def fix(cons: str) -> str:
        # One instantiation per motif for the whole sweep: a fresh draw at every separation would
        # put degeneracy noise into the spacing curve, which is the signal being looked for.
        return "".join(rng.choice(iupac.get(c, "ACGT")) for c in cons)

    def implant(bg: str, items: list[tuple[int, str]]) -> str:
        s = list(bg)
        for pos, ins in items:
            s[pos:pos + len(ins)] = list(ins)
        return "".join(s)

    t0 = time.time()
    base = [score(b) for b in bgs]
    passes = len(bgs)
    out = {}

    print(f"  {len(SEPS)} separations x 4 orientations x {len(PAIRS)} pairs "
          f"x {args.backgrounds} backgrounds")
    for aid, bid, label in PAIRS:
        A, B = fix(by_id[aid]["consensus"]), fix(by_id[bid]["consensus"])
        la = len(A)
        arms = {o: [] for o in ("FF", "FR", "RF", "RR")}
        inter = {o: [] for o in arms}
        # A alone, once -- its position never moves.
        solo_a = {}
        for oa in "FR":
            sa = A if oa == "F" else rc(A)
            solo_a[oa] = float(np.mean([score(implant(bg, [(ANCHOR, sa)])) - base[i]
                                        for i, bg in enumerate(bgs)]))
            passes += len(bgs)
        for d in SEPS:
            pb = ANCHOR + la + d
            solo_b = {}
            for ob in "FR":
                sb = B if ob == "F" else rc(B)
                solo_b[ob] = float(np.mean([score(implant(bg, [(pb, sb)])) - base[i]
                                            for i, bg in enumerate(bgs)]))
                passes += len(bgs)
            for oa in "FR":
                for ob in "FR":
                    sa = A if oa == "F" else rc(A)
                    sb = B if ob == "F" else rc(B)
                    both = float(np.mean([score(implant(bg, [(ANCHOR, sa), (pb, sb)])) - base[i]
                                          for i, bg in enumerate(bgs)]))
                    passes += len(bgs)
                    arms[oa + ob].append(round(both, 5))
                    inter[oa + ob].append(round(both - solo_a[oa] - solo_b[ob], 5))

        # Helical phasing, read directly rather than through a transform. "In phase" means the two
        # motifs sit on the same face of the double helix; "anti-phase" means opposite faces.
        fine = [i for i, d in enumerate(SEPS) if d <= 64]
        ff = np.array(inter["FF"], dtype=float)
        phase = np.array([(SEPS[i] % HELIX) / HELIX for i in fine])
        inph = [fine[k] for k, p in enumerate(phase) if p < 0.15 or p > 0.85]
        anti = [fine[k] for k, p in enumerate(phase) if 0.35 < p < 0.65]
        ratio = (float(np.mean(np.abs(ff[inph]))) / float(np.mean(np.abs(ff[anti])))
                 if len(inph) and len(anti) and np.mean(np.abs(ff[anti])) else None)

        # Periodogram over the contiguous fine range only, with the scan window's own harmonics
        # named so a peak at one is not read as biology.
        y = ff[fine] - ff[fine].mean()
        n = len(y)
        freqs = np.fft.rfftfreq(n, d=1.0)[1:]
        power = np.abs(np.fft.rfft(y))[1:] ** 2
        top = np.argsort(power)[::-1][:3]
        periods = [round(float(1.0 / freqs[j]), 2) for j in top]
        harmonics = [round(n / k, 2) for k in range(2, 7)]

        out[f"{aid}-{bid}"] = {
            "label": label, "a": by_id[aid]["name"], "b": by_id[bid]["name"],
            "aConsensus": A, "bConsensus": B, "separations": SEPS,
            "pair": arms, "interaction": inter,
            "soloA": {k: round(v, 5) for k, v in solo_a.items()},
            "helicalRatio": round(ratio, 4) if ratio else None,
            "topPeriods": periods, "windowHarmonics": harmonics,
            "orientationMeans": {o: round(float(np.mean(np.abs(inter[o]))), 5) for o in arms},
            "maxInteraction": round(float(np.max(np.abs(ff))), 5),
            "maxAtBp": int(SEPS[int(np.argmax(np.abs(ff)))]),
        }
        om = out[f"{aid}-{bid}"]["orientationMeans"]
        print(f"  {label[:44]:<45} |int| {np.mean(np.abs(ff)):.4f}  peak {np.max(np.abs(ff)):.4f}"
              f" @ {SEPS[int(np.argmax(np.abs(ff)))]:>3} bp  helical {ratio:.3f}"
              if ratio else f"  {label[:44]:<45}")
        print(f"     orientations FF {om['FF']:.4f} FR {om['FR']:.4f} "
              f"RF {om['RF']:.4f} RR {om['RR']:.4f}   periods {periods} "
              f"(window harmonics {harmonics[:3]})")

    ratios = [v["helicalRatio"] for v in out.values() if v["helicalRatio"]]
    (ROOT / "src" / "data" / "shorkieSpacing.json").write_text(json.dumps({
        "note": "Motif A implanted at the window centre, motif B walked away from it one base at a "
                "time in all four orientations, over dinucleotide-shuffled backgrounds. The "
                "reported quantity is the interaction -- the pair's effect minus each motif's own "
                "effect at its own position -- so a curve that is flat means the model adds the "
                "two motifs independently.",
        "backgrounds": args.backgrounds, "anchorBp": ANCHOR, "localBp": LOCAL_BP,
        "helicalPeriodBp": HELIX,
        "medianHelicalRatio": round(float(np.median(ratios)), 4) if ratios else None,
        "pairs": out,
    }, separators=(",", ":")))
    print(f"\n  {passes:,} forward passes in {(time.time()-t0)/60:.1f} min")
    if ratios:
        print(f"  helical in-phase / anti-phase interaction: median {np.median(ratios):.3f} "
              f"(1.0 = no phasing)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
