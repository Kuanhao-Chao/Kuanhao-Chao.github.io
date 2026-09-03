"""
Which bases interact NON-LINEARLY with a binding site — the second derivative, not the first.

Every attribution on this site so far is first-order: it asks how much each base contributes on its
own. Transcriptional regulation is not additive. Factors cooperate, compete and care about spacing,
and a first-order method cannot see any of that by construction.

For a motif occupying `[a, b)`, let `v` be the one-hot indicator over that span. Then

    H·v = ∇ₓ ⟨∇ₓ f(x), v⟩

is one vector over all 16,384 bases, and entry `i` is how much the motif's own sensitivity changes
when base `i` changes. It costs **one extra backward pass** — 425 ms measured on MPS — rather than
the 16,384 × 16,384 Hessian, which would be 2.68 × 10⁸ entries.

**The check that the double-backward is wired correctly is SYMMETRY.** H is symmetric, so for two
motifs A and B in the same window `⟨H·v_A, v_B⟩` must equal `⟨H·v_B, v_A⟩`. Measured: relative
difference **2.9e-05** at TDH3 and **1.5e-06** at PGK1, which is float32 on MPS. Nothing else
catches a mis-wired second derivative — a wrong one has the right shape and the right magnitude and
is simply the wrong quantity.

**rc-averaging a Hessian needs the INDICATOR reversed too.** `v` lives in input coordinates, so on
the reverse strand the motif occupies the mirrored span; averaging `H·v` computed forward with
`rc_grad(H_rc·rc(v))` is the second-order form of what every attribution here already does.

Anchors are the **ChIP-supported** tier only — 431 sites over the 23 windows. The conserved-only and
PWM tiers are 7,278 more, which is 3.4 hours for the weakest evidence.

Output:
    public/vp-data/<id>-hess.png    uint8 [n_motifs × 16,384], symlog, per-row scales
    public/vp-data/<id>-hess.json   the motif list, the scales, and the symmetry residual
    src/data/shorkieEpistasis.json  the pooled distance profile and its periodogram

Usage:  python3 scripts/shorkie/make_epistasis.py <ckpt.h5> [--only GENE]
"""

from __future__ import annotations

import argparse
import json
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
MAX_D = 150          # the distance profile's reach, in bp


def helical_test(prof: np.ndarray) -> tuple[list[tuple[float, float]], dict]:
    """Does |H·v| repeat with B-DNA's 10.5 bp pitch?

    Two answers, because the first one is misleading on its own. The PERIODOGRAM of the detrended
    log profile is dominated by harmonics of the analysis window: over 4-150 bp its top "periods"
    come out at 49.0, 73.5 and 36.8, which are 147/3, 147/2 and 147/4 -- artefacts of the length,
    not of the data. Reporting them as periods would be reporting the ruler.

    The decisive test needs no spectrum: divide out the decay, then compare |H·v| at distances
    IN phase with 10.5 bp against those in ANTI-phase. A real helical signal puts that ratio
    clearly above 1. Measured over all 431 sites it is **0.948** -- if anything slightly lower in
    phase -- so the model has not learned the pitch of the double helix in its second-order
    interactions. That is a negative result on a falsifiable prediction, and it is worth publishing
    as one.
    """
    d = np.arange(len(prof))
    keep = (d >= 4) & (d <= MAX_D)
    x, y = d[keep], np.log(np.maximum(prof[keep], 1e-30))
    resid = y - np.poly1d(np.polyfit(x, y, 3))(x)
    power = np.abs(np.fft.rfft(resid - resid.mean())) ** 2
    freq = np.fft.rfftfreq(len(resid))
    order = np.argsort(power)[::-1]
    periods = [(float(1 / freq[i]), float(power[i] / power[1:].sum()))
               for i in order[:5] if freq[i] > 0]

    flat = prof[keep] / np.exp(np.poly1d(np.polyfit(x, y, 3))(x))
    ph = x % 10.5
    on = (ph < 2.1) | (ph > 8.4)
    off = (ph > 3.15) & (ph < 7.35)
    a, b = float(flat[on].mean()), float(flat[off].mean())
    band = [i for i in range(1, len(freq)) if 9.5 < 1 / freq[i] < 11.8]
    rest = [i for i in range(1, len(freq)) if 3 < 1 / freq[i] < MAX_D and i not in band]
    return periods, {
        "pitchBp": 10.5,
        "inPhase": round(a, 6), "antiPhase": round(b, 6),
        "ratio": round(a / max(b, 1e-30), 6),
        "bandPowerOverMedian": round(float(max(power[i] for i in band)
                                           / np.median([power[i] for i in rest])), 4),
        "verdict": "present" if a / max(b, 1e-30) > 1.05 else "absent",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("--only", default=None)
    ap.add_argument("--device", default=None)
    args = ap.parse_args()

    import torch
    from shorkie_torch import build

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    names = json.loads((ROOT / "src" / "data" / "shorkieTrackNames.json").read_text())["identifiers"]
    T0 = [i for i, n in enumerate(names) if "_T0_" in n and 1148 <= i < 4201]
    if len(T0) != 384:
        raise SystemExit(f"expected 384 T0 tracks, found {len(T0)}")

    dev = args.device or ("mps" if torch.backends.mps.is_available() else "cpu")
    model, _ = build(args.checkpoint)
    n_par = sum(p.numel() for p in model.parameters())
    n_bn = sum(b.numel() for n, b in model.named_buffers() if "running" in n)
    if n_par + n_bn != 14_253_567:
        raise SystemExit(f"{args.checkpoint} is not fold-f0 ({n_par + n_bn:,} values)")
    model.eval().to(dev)
    T0t = torch.tensor(T0, device=dev)

    def hv(x: "torch.Tensor", a: int, b: int) -> "torch.Tensor":
        """H·v for the one-hot indicator over [a, b), in the coordinates of `x`."""
        xt = x.clone().requires_grad_(True)
        y = torch.log2(model(xt)[0][0][:, T0t].mean(dim=-1).sum() + 1.0)
        g, = torch.autograd.grad(y, xt, create_graph=True)
        v = torch.zeros_like(xt)
        v[0, a:b, :4] = 1.0
        h, = torch.autograd.grad((g * v).sum(), xt)
        return h[0, :, :4].detach()

    pooled = np.zeros(MAX_D + 1)
    pooled_n = np.zeros(MAX_D + 1)
    totals = {"sites": 0, "loci": 0, "worst_sym": 0.0, "worst_where": ""}
    t_all = time.time()

    for L in loci["loci"]:
        if args.only and L["gene"] != args.only:
            continue
        ann_p = OUT / f"{L['id']}-ann.json"
        if not ann_p.exists():
            continue
        feats = json.loads(ann_p.read_text())["features"]
        sites = [f for f in feats
                 if f["cls"] == "tfbs" and f.get("evidence") in ("good", "weak")
                 and 0 <= f["start"] < f["end"] <= SEQ_LEN]
        if not sites:
            print(f"  {L['gene']:<9} no ChIP-supported sites; skipping")
            continue

        x = torch.from_numpy(encode(L["sequence"], loci["speciesIndex"])).to(dev)
        xr = rc_input(x)
        t0 = time.time()
        rows = []
        for s in sites:
            a, b = s["start"], s["end"]
            fwd = hv(x, a, b)
            # The mirrored span: position p maps to SEQ_LEN-1-p, so [a,b) becomes [L-b, L-a).
            rev = rc_grad(hv(xr, SEQ_LEN - b, SEQ_LEN - a))
            rows.append(((fwd + rev) / 2).sum(dim=-1).float().cpu().numpy())
        plane = np.vstack(rows)

        # SYMMETRY. H is symmetric, so <H.v_A, v_B> must equal <H.v_B, v_A>. This is the only check
        # that a mis-wired double-backward fails -- a wrong one has the right shape and magnitude.
        worst = 0.0
        for i in range(min(len(sites), 6)):
            for j in range(i + 1, min(len(sites), 6)):
                ab = plane[i, sites[j]["start"]:sites[j]["end"]].sum()
                ba = plane[j, sites[i]["start"]:sites[i]["end"]].sum()
                den = max(abs(float(ab)), abs(float(ba)), 1e-30)
                worst = max(worst, abs(float(ab) - float(ba)) / den)
        if worst > totals["worst_sym"]:
            totals["worst_sym"], totals["worst_where"] = worst, L["gene"]

        # The pooled |H.v| vs distance profile, which is where a helical period would show. Per
        # motif it is noise; the question is only answerable across hundreds.
        for i, s in enumerate(sites):
            c = (s["start"] + s["end"]) // 2
            d = np.abs(np.arange(SEQ_LEN) - c)
            m = d <= MAX_D
            np.add.at(pooled, d[m], np.abs(plane[i][m]))
            np.add.at(pooled_n, d[m], 1)

        q, lows, highs = quantize_rows(plane, "log")
        # `quantize_rows` returns numpy scalars, which json.dumps refuses.
        lows = [float(v) for v in lows]
        highs = [float(v) for v in highs]
        Image.fromarray(q, mode="L").save(OUT / f"{L['id']}-hess.png", format="PNG", optimize=True)
        err = float(np.abs(dequantize_rows(q, np.array(lows), np.array(highs), "log") - plane).max())
        (OUT / f"{L['id']}-hess.json").write_text(json.dumps({
            "rows": len(sites), "cols": SEQ_LEN, "space": "log", "lo": lows, "hi": highs,
            "target": "log2(T0 coverage + 1) over the cropped interior",
            "strands": "rc-averaged (indicator mirrored)",
            "symmetryResidual": round(worst, 10),
            "decodeError": round(err, 8),
            "sites": [{"name": s["name"], "start": s["start"], "end": s["end"],
                       "evidence": s.get("evidence"), "strand": s.get("strand", "."),
                       "peak": round(float(np.abs(plane[i]).max()), 8),
                       "self": round(float(plane[i][s["start"]:s["end"]].sum()), 8)}
                      for i, s in enumerate(sites)],
        }, separators=(",", ":")))
        totals["sites"] += len(sites)
        totals["loci"] += 1
        print(f"  {L['gene']:<9} {len(sites):>3} sites  [{(time.time()-t0)/60:.1f} min]  "
              f"symmetry {worst:.1e}  decode {err:.1e}", flush=True)

    prof = np.divide(pooled, np.maximum(pooled_n, 1))
    periods, phase = helical_test(prof)

    (ROOT / "src" / "data" / "shorkieEpistasis.json").write_text(json.dumps({
        "note": "Pooled |H.v| against distance from the anchoring motif, over every ChIP-supported "
                "site in the 23 analysed windows, and the periodogram of its detrended log.",
        "sites": totals["sites"], "loci": totals["loci"], "maxDistanceBp": MAX_D,
        "worstSymmetryResidual": round(totals["worst_sym"], 10),
        "worstSymmetryAt": totals["worst_where"],
        "distance": [round(float(v), 10) for v in prof[: MAX_D + 1]],
        "topPeriods": [{"bp": round(p, 2), "share": round(s, 4)} for p, s in periods],
        "helical": phase,
    }, separators=(",", ":")))

    print(f"\n  {totals['sites']} sites over {totals['loci']} loci in "
          f"{(time.time()-t_all)/60:.1f} min")
    print(f"  worst symmetry residual {totals['worst_sym']:.2e} at {totals['worst_where']}")
    print(f"  |H.v| falls {prof[4]:.2e} -> {prof[50]:.2e} -> {prof[MAX_D]:.2e} over 4/50/{MAX_D} bp")
    print("  strongest periods in the detrended profile: "
          + ", ".join(f"{p:.1f} bp ({s*100:.0f}%)" for p, s in periods[:3])
          + "  <- these are window harmonics, not signal")
    print(f"  HELICAL PHASING: in-phase {phase['inPhase']:.4f} vs anti-phase "
          f"{phase['antiPhase']:.4f}, ratio {phase['ratio']:.4f} -- "
          + ("PRESENT" if phase["ratio"] > 1.05 else "ABSENT"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
