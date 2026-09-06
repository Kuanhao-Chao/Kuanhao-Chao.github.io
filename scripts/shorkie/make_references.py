"""Proposal 2 — which reference family is Integrated Gradients actually telling you about?

The site ships one IG baseline: all four DNA channels zeroed with the species one-hot preserved.
It is convenient and it is out of distribution. A model will happily assign a beautiful-looking
attribution to the path from an impossible sequence to a real promoter, and nothing on the page
currently says whether the baseline or the sequence is doing the storytelling.

FIVE LEGAL FAMILIES. Every one keeps the species one-hot valid and none assumes channel 4 carries
mask semantics -- that channel is written by no code the paper ships and is not established as a
mask, so a reference that leaned on it would be asserting something unproven inside an array.

    zero        all four DNA channels at 0            <- what ships today
    mono        mononucleotide shuffle                 composition kept, dinucleotide destroyed
    dinuc       Altschul-Erikson dinucleotide shuffle  the composition control used elsewhere here
    biological  another locus's real window            in-distribution by construction
    expected    expected gradients over dinuc + biological ensemble

FOUR THINGS ARE MEASURED, AND ONE OF THEM IS THE POINT

  * Completeness, ABSOLUTELY as well as relatively. Where the target gap is near zero a 0.04 miss
    reads as several hundred percent, which says more about the denominator than the integral.
  * Agreement with exact ISM. Not truth -- ISM is another model computation -- but it is the
    finite-difference contrast the path integral is trying to approximate.
  * Deletion AUC through real forward passes, shared with the faithfulness benchmark so the two
    cannot drift apart.
  * An OOD diagnostic that is a measurement rather than an assertion: Shorkie_LM's own masked
    negative log-likelihood of each reference. A baseline the sequence model finds impossible is
    a baseline the expression model was never trained near.

Strand-wise maps are compared BEFORE averaging. A family that only looks stable after the forward
and reverse arms are averaged has failed, not passed.

Output: src/data/shorkieReferences.json
Usage:  python3 scripts/shorkie/make_references.py [--steps 32] [--device mps]
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
from common import ROOT, SCRATCH, SEQ_LEN, N_BINS, BASE_IDX  # noqa: E402
from make_faithfulness import ism_truth, spearman, deletion_curve  # noqa: E402

OUT = ROOT / "src" / "data" / "shorkieReferences.json"
FAMILIES = ["zero", "mono", "dinuc", "biological", "expected"]
LM_K = 7                    # the checkpoint's own scattered-mask schedule, mask_rate 0.15


def reference_sequences(family, seq, species, rng, other_seq, n_ensemble=4):
    """Encoded references for one family. `expected` returns several; the rest return one."""
    if family == "zero":
        x = np.zeros((SEQ_LEN, common.IN_CHANNELS), dtype=np.float32)
        x[:, 5 + species] = 1.0
        return [x], ["<all four DNA channels zero>"]
    if family == "mono":
        s = common.mono_shuffle(seq, rng)
        return [common.encode(s, species)], [s]
    if family == "dinuc":
        s = common.dinuc_shuffle(seq, rng)
        return [common.encode(s, species)], [s]
    if family == "biological":
        return [common.encode(other_seq, species)], [other_seq]
    if family == "expected":
        out, ss = [], []
        for _ in range(n_ensemble // 2):
            s = common.dinuc_shuffle(seq, rng); out.append(common.encode(s, species)); ss.append(s)
        for _ in range(n_ensemble - len(out)):
            out.append(common.encode(other_seq, species)); ss.append(other_seq)
        return out, ss
    raise ValueError(family)


def ig_one(runner, x, base, lo, hi, rc_lo, rc_hi, steps):
    """Midpoint-rule IG, rc-averaged. NOT mean-centred: that would destroy completeness."""
    def arm(xx, bb, a, z):
        tot = np.zeros((SEQ_LEN, 4), dtype=np.float64)
        for s in range(steps):
            alpha = (s + 0.5) / steps
            g, _ = runner.grad_x((bb + alpha * (xx - bb)).astype(np.float32), a, z)
            tot += g
        return tot / steps * (xx[:, :4] - bb[:, :4])

    af = arm(x, base, lo, hi)
    ar = arm(common.rc_encoded(x), common.rc_encoded(base), rc_lo, rc_hi)
    attr = 0.5 * (af + common.rc_grad_np(ar))
    # The average of two complete decompositions decomposes the AVERAGE, so the target must be
    # rc-averaged too; leaving it forward-only inflates the reported error several-fold.
    gap = 0.5 * ((runner.score(x[None], lo, hi)[0] - runner.score(base[None], lo, hi)[0])
                 + (runner.score(common.rc_encoded(x)[None], rc_lo, rc_hi)[0]
                    - runner.score(common.rc_encoded(base)[None], rc_lo, rc_hi)[0]))
    return attr.sum(axis=1), af.sum(axis=1), common.rc_grad_np(ar).sum(axis=1), float(gap)


class LmScorer:
    """Shorkie_LM masked NLL: how surprising is a reference to the sequence model?

    K = 7 disjoint strided sets, each masked in turn by zeroing DNA channels 0-3 -- the
    checkpoint's own convention -- and every position read back only from the pass that masked
    it. The unmasked pass would let the model copy its input and would rate the zero baseline
    unfairly, since zeroed DNA is exactly what "masked" means to this model.
    """

    def __init__(self, path, device):
        import torch
        from shorkie_torch import build, SHORKIE_LM
        self.torch = torch
        self.model, _ = build(str(path), SHORKIE_LM)
        self.model.eval().to(device)
        self.device = device

    def nll(self, x: np.ndarray) -> float:
        torch = self.torch
        truth = x[:, :4].argmax(axis=1)
        has = x[:, :4].sum(axis=1) > 0
        logp = np.zeros(SEQ_LEN)
        with torch.no_grad():
            for r in range(LM_K):
                idx = np.arange(r, SEQ_LEN, LM_K)
                xm = x.copy(); xm[idx, :4] = 0.0
                out, _ = self.model(torch.from_numpy(xm[None]).to(self.device))
                p = out[0].float().cpu().numpy()
                logp[idx] = np.log2(np.maximum(p[idx, truth[idx]], 1e-12))
        # No bases at all: the all-zero reference is not unlikely sequence, it is NOT SEQUENCE,
        # and zeroing the four DNA channels is literally how this model family masks a position.
        return float(-logp[has].mean()) if has.any() else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=32)
    ap.add_argument("--device", default=None)
    ap.add_argument("--only", default=None)
    ap.add_argument("--fold", default="f0")
    ap.add_argument("--no-lm", action="store_true")
    ap.add_argument("--out", default=None,
                    help="write here instead of the shipped pack, for a per-fold sweep")
    args = ap.parse_args()

    import torch
    device = args.device or ("mps" if torch.backends.mps.is_available() else "cpu")
    pack = common.loci_pack(); species = pack["speciesIndex"]
    all_loci = pack["loci"]
    loci = [L for L in all_loci if not args.only or L["id"] == args.only]
    if len(all_loci) < 2:
        raise SystemExit("the biological reference needs at least two windows to choose between")
    runner = common.Runner(common.fold_checkpoint(args.fold), device)

    lm = None
    lm_path = SCRATCH / "lm" / "model_best.h5"
    if not args.no_lm and lm_path.exists():
        lm = LmScorer(lm_path, device)
        print(f"OOD diagnostic: Shorkie_LM masked NLL (K={LM_K}), {lm_path.name}")
    else:
        print("OOD diagnostic: SKIPPED (no Shorkie_LM checkpoint)")
    print(f"device: {device}  fold: {args.fold}  steps: {args.steps}  loci: {len(loci)}")

    rows, t_all = [], time.time()
    for n, L in enumerate(loci):
        lid = L["id"]
        truth, worst, damage = ism_truth(lid)
        if truth is None:
            continue
        seq = L["sequence"].upper()
        x = common.encode(seq, species)
        lo, hi = common.gene_body_bins(L["features"], lid)
        rc_lo, rc_hi = N_BINS - hi, N_BINS - lo
        # Drawn from EVERY window, never from the filtered subset: with `--only` the filtered list
        # holds one entry and the "biological" reference would be the sequence itself, whose
        # attribution is identically zero and whose scores then look flawless.
        home = next(i for i, q in enumerate(all_loci) if q["id"] == lid)
        other = all_loci[(home + 7) % len(all_loci)]["sequence"].upper()
        assert other != seq, "the biological reference must not be the window itself"
        rng = random.Random(20260905 + n)
        t0 = time.time()

        # One denominator for every family: what ranking by the exact answer achieves at this
        # locus. Per-family normalisation measures the shape of a curve rather than how much
        # damage its ranking does, and the two disagree.
        # Ranked by DAMAGE, not by max |effect| -- the quantity the deletion actually applies.
        _, oracle_drop = deletion_curve(runner, L, species, np.argsort(-damage), worst,
                                        lo, hi, rc_lo, rc_hi)
        denom = oracle_drop[-1] if abs(oracle_drop[-1]) > 1e-9 else 1.0
        oracle_auc = float(np.trapezoid(np.array(oracle_drop) / denom, dx=1.0)
                           / (len(oracle_drop) - 1))

        row = {"id": lid, "oracleAuc": round(oracle_auc, 5)}
        for fam in FAMILIES:
            bases, strs = reference_sequences(fam, seq, species, rng, other)
            attrs, fwds, revs, gaps = [], [], [], []
            for b in bases:
                a, af, ar, gp = ig_one(runner, x, b, lo, hi, rc_lo, rc_hi, args.steps)
                attrs.append(a); fwds.append(af); revs.append(ar); gaps.append(gp)
            attr = np.mean(attrs, axis=0)
            gap = float(np.mean(gaps))
            err = float(attr.sum() - gap)
            order = np.argsort(-np.abs(attr))
            ks, drop = deletion_curve(runner, L, species, order, worst, lo, hi, rc_lo, rc_hi)
            dn = np.array(drop) / denom
            row[fam] = {
                "rho": round(spearman(np.abs(attr), truth), 4),
                "completenessAbs": round(err, 5),
                "target": round(gap, 5),
                "completenessRelPct": round(abs(err / gap) * 100, 3) if abs(gap) > 1e-9 else None,
                # Rescaled so the exact-mutagenesis ranking reads 1.000.
                "deletionAuc": round(float(np.trapezoid(dn, dx=1.0) / (len(dn) - 1))
                                     / (oracle_auc if abs(oracle_auc) > 1e-9 else 1.0), 4),
                # strand agreement BEFORE averaging: a family that needs the average to look
                # stable has failed the transparency requirement, not passed it
                "strandRho": round(spearman(np.abs(np.mean(fwds, axis=0)),
                                            np.abs(np.mean(revs, axis=0))), 4),
                "lmNllBits": (lambda v: round(v, 4) if v is not None else None)(lm.nll(bases[0]))
                if lm else None,
            }
        row["lmNllReference"] = round(lm.nll(x), 4) if lm else None
        if hasattr(torch, "mps") and torch.backends.mps.is_available():
            torch.mps.empty_cache()
        rows.append(row)
        print(f"  {lid:10s} {time.time() - t0:5.1f}s  " +
              "  ".join(f"{f}:rho={row[f]['rho']:+.3f}" for f in FAMILIES), flush=True)

    summary = []
    for fam in FAMILIES:
        v = [r[fam] for r in rows]
        summary.append({
            "family": fam,
            "shipped": fam == "zero",
            "medianRho": round(float(np.median([q["rho"] for q in v])), 4),
            "medianDeletionAuc": round(float(np.median([q["deletionAuc"] for q in v])), 4),
            "medianCompletenessAbs": round(float(np.median([abs(q["completenessAbs"]) for q in v])), 5),
            "medianCompletenessRelPct": round(float(np.median(
                [q["completenessRelPct"] for q in v if q["completenessRelPct"] is not None])), 3),
            "medianStrandRho": round(float(np.median([q["strandRho"] for q in v])), 4),
            "medianLmNllBits": (round(float(np.median([q["lmNllBits"] for q in v])), 4)
                                if all(q["lmNllBits"] is not None for q in v) else None),
        })
    summary.sort(key=lambda r: -r["medianDeletionAuc"])
    best = summary[0]["family"]
    out = {
        "note": ("Integrated Gradients recomputed under five legal reference families on the same "
                 "scalar and the same loci, scored against exact mutagenesis and by real deletion "
                 "passes, with Shorkie_LM masked NLL as an out-of-distribution diagnostic."),
        "fold": args.fold, "steps": args.steps, "loci": len(rows),
        "referenceNllBits": (round(float(np.median([r["lmNllReference"] for r in rows])), 4)
                             if rows and rows[0]["lmNllReference"] is not None else None),
        "best": best,
        "shippedIsBest": best == "zero",
        "families": summary,
        "perLocus": rows,
    }
    dest = Path(args.out) if args.out else OUT
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"\n  {'family':12s} {'rho':>7s} {'delAUC':>8s} {'compl abs':>10s} {'compl %':>9s} "
          f"{'strand r':>9s} {'LM NLL':>8s}")
    for r in summary:
        print(f"  {r['family']:12s} {r['medianRho']:+7.3f} {r['medianDeletionAuc']:8.4f} "
              f"{r['medianCompletenessAbs']:10.5f} {r['medianCompletenessRelPct']:9.2f} "
              f"{r['medianStrandRho']:9.3f} "
              + (f"{r['medianLmNllBits']:8.3f}" if r['medianLmNllBits'] is not None
                 else "  no seq"))
    print(f"\n  real sequence LM NLL: {out['referenceNllBits']} bits")
    print(f"  best by deletion AUC: {best}"
          f"{'  (the shipped default)' if out['shippedIsBest'] else '  -- NOT the shipped default'}")
    print(f"  elapsed {(time.time() - t_all) / 60:.1f} min\nwrote {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
