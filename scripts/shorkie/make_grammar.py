"""Proposal 11 — the exact higher-order grammar benchmark.

The site already ships a second-order interaction panel built on Hessian-vector products, and a
periodogram of it whose reported periods (49, 73.5, 36.8 bp) are 147/3, 147/2 and 147/4 -- exact
harmonics of the analysis window, which is to say the panel may be reporting the ruler. Neither
the Hessian nor the periodogram has ever been checked against a discrete double edit.

A second derivative is not a double substitution. `H` is the curvature at the reference one-hot;
a real double edit is a finite jump to another vertex of the simplex, and nothing guarantees the
first predicts the second. This measures the second directly and asks whether the first calls it.

WHAT IS COMPUTED

For P selected positions per locus, every double substitution -- 9 per pair, since each position
has three alternatives -- is evaluated exactly and rc-averaged:

    residual(i,a,j,b) = d(i:a, j:b) - d(i:a) - d(j:b)

the inclusion-exclusion (Mobius) interaction. Singles are recomputed here rather than read off
the shipped plane, so both terms of the subtraction come from the same run and the residual
cannot inherit a packing or convention difference.

Half the positions are the strongest |ISM| bases and half are matched on distance to TSS, so
"how much interaction is there" has something to be compared against.

THREE PREDICTORS ARE CALIBRATED AGAINST IT

  * The Hessian: for a substitution pair the second-order term is
    H[i,a,j,b] - H[i,a,j,ref] - H[i,ref,j,b] + H[i,ref,j,ref], one double-backward per (j,b).
  * Additive: predicts exactly zero. This is the null the panel has to beat.
  * Separation alone: |i - j|, testing whether proximity is all the Hessian is tracking.

The separations here come from where the strong bases actually are, so they are not uniform.
That makes this a calibration of the interaction predictors, NOT a spacing scan -- the
constructive spacing sweep in `make_spacing.py` is where a periodicity claim belongs, and this
file deliberately does not make one.

Output: src/data/shorkieGrammar.json
Usage:  python3 scripts/shorkie/make_grammar.py [--positions 20] [--device mps]
"""

from __future__ import annotations

import argparse
import itertools
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
from common import ROOT, SCRATCH, SEQ_LEN, N_BINS, BASE_IDX  # noqa: E402

OUT = ROOT / "src" / "data" / "shorkieGrammar.json"


def select_positions(plane, seq, tss, k):
    """k strongest |ISM| bases plus k matched on |distance to TSS|."""
    valid = np.array([i for i in range(SEQ_LEN) if seq[i] in BASE_IDX])
    strength = np.abs(plane).max(axis=0)
    top = valid[np.argsort(-strength[valid])][:k]
    taken = set(int(i) for i in top)
    dist = np.abs(np.arange(SEQ_LEN) - tss)
    pool = np.array([i for i in valid if int(i) not in taken])
    ctl = []
    for i in top:
        for c in pool[np.argsort(np.abs(dist[pool] - dist[i]))]:
            if int(c) not in taken:
                taken.add(int(c)); ctl.append(int(c)); break
    return np.array(sorted(int(i) for i in top)), np.array(sorted(ctl))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--positions", type=int, default=10, help="strong bases per locus; as many controls")
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--device", default=None)
    ap.add_argument("--only", default=None)
    ap.add_argument("--fold", default="f0")
    ap.add_argument("--no-hessian", action="store_true")
    ap.add_argument("--out", default=None,
                    help="write here instead of the shipped pack, for a per-fold sweep")
    args = ap.parse_args()

    import torch
    device = args.device or ("mps" if torch.backends.mps.is_available() else "cpu")
    pack = common.loci_pack(); species = pack["speciesIndex"]
    loci = [L for L in pack["loci"] if not args.only or L["id"] == args.only]
    runner = common.Runner(common.fold_checkpoint(args.fold), device)
    print(f"device: {device}  fold: {args.fold}  {args.positions} strong + {args.positions} control per locus")

    rows, scatter, t_all = [], [], time.time()
    for L in loci:
        lid = L["id"]
        raw = SCRATCH / "ism-raw" / f"{lid}-ism.npy"
        if not raw.exists():
            continue
        plane = np.load(raw)
        seq = L["sequence"].upper()
        lo, hi = common.gene_body_bins(L["features"], lid)
        rc_lo, rc_hi = N_BINS - hi, N_BINS - lo
        top, ctl = select_positions(plane, seq, common.tss_of(L["features"], lid), args.positions)
        pos = np.array(sorted(set(top.tolist() + ctl.tolist())))
        is_top = np.isin(pos, top)
        refb = {int(i): BASE_IDX[seq[int(i)]] for i in pos}
        t0 = time.time()

        x = common.encode(seq, species)
        fwd = torch.from_numpy(np.repeat(x[None], args.batch, axis=0)).to(device)
        rev = torch.from_numpy(np.repeat(common.rc_encoded(x)[None], args.batch, axis=0)).to(device)

        def cov(b, a, z, n):
            with torch.no_grad():
                y, _ = runner.model(b)
            return y[:n, a:z, :].mean(dim=-1).sum(dim=-1).float().cpu().numpy()

        ref_f = float(cov(fwd, lo, hi, 1)[0])
        ref_r = float(cov(rev, rc_lo, rc_hi, 1)[0])

        def run(edits_list):
            """Each entry is [(position, alt_base), ...]. Returns rc-averaged logSED per entry.

            Edits are applied as VECTORISED scatters, one per edit slot, not as a Python loop of
            single-element writes. At batch 32 with two edits each the loop form issues 128 separate
            device writes per step and measured 39 ms a pass against the 12 ms this model actually
            costs -- the edit bookkeeping, not the forward pass, was three quarters of the run.
            """
            out = np.zeros(len(edits_list))
            width = max(len(e) for e in edits_list)
            for s in range(0, len(edits_list), args.batch):
                chunk = edits_list[s:s + args.batch]
                nb = len(chunk)
                slots = []
                for m in range(width):
                    rows = [j for j, e in enumerate(chunk) if len(e) > m]
                    if not rows:
                        continue
                    pos = torch.as_tensor([chunk[j][m][0] for j in rows], device=device)
                    alt = torch.as_tensor([chunk[j][m][1] for j in rows], device=device)
                    rb = torch.as_tensor([refb[chunk[j][m][0]] for j in rows], device=device)
                    ci = torch.as_tensor(rows, device=device)
                    slots.append((ci, pos, alt, rb, SEQ_LEN - 1 - pos, 3 - alt, 3 - rb))
                for (ci, pos, alt, rb, mp, ma, mr) in slots:
                    fwd[ci, pos, rb] = 0.0; fwd[ci, pos, alt] = 1.0
                    rev[ci, mp, mr] = 0.0; rev[ci, mp, ma] = 1.0
                af = cov(fwd, lo, hi, nb)
                ar = cov(rev, rc_lo, rc_hi, nb)
                for (ci, pos, alt, rb, mp, ma, mr) in slots:
                    fwd[ci, pos, alt] = 0.0; fwd[ci, pos, rb] = 1.0
                    rev[ci, mp, ma] = 0.0; rev[ci, mp, mr] = 1.0
                out[s:s + nb] = 0.5 * ((np.log2(af[:nb] + 1) - np.log2(ref_f + 1))
                                       + (np.log2(ar[:nb] + 1) - np.log2(ref_r + 1)))
            return out

        # ---- singles, recomputed so both terms of the residual share one run ------------------
        single_jobs = [(int(i), b) for i in pos for b in range(4) if b != refb[int(i)]]
        singles_v = run([[e] for e in single_jobs])
        single = {e: v for e, v in zip(single_jobs, singles_v)}

        # a free check that the recomputation reproduces the shipped plane
        shipped = np.array([plane[b, i] for (i, b) in single_jobs])
        drift = float(np.max(np.abs(shipped - singles_v)))

        # ---- every double ---------------------------------------------------------------------
        pair_jobs, pair_key = [], []
        for i, j in itertools.combinations([int(p) for p in pos], 2):
            for a in range(4):
                if a == refb[i]:
                    continue
                for b in range(4):
                    if b == refb[j]:
                        continue
                    pair_jobs.append([(i, a), (j, b)])
                    pair_key.append((i, a, j, b))
        doubles = run(pair_jobs)
        resid = np.array([doubles[k] - single[(i, a)] - single[(j, b)]
                          for k, (i, a, j, b) in enumerate(pair_key)])

        # ---- the Hessian's prediction for the same pairs ---------------------------------------
        hess_pred = None
        if not args.no_hessian:
            xt = torch.from_numpy(x[None]).to(device)
            cols = {}
            for j in [int(p) for p in top]:          # strong positions only; the cost is per column
                for b in range(4):
                    with torch.enable_grad():
                        xr_ = xt.clone().requires_grad_(True)
                        y = runner.score_torch(xr_, lo, hi)
                        g, = torch.autograd.grad(y.sum(), xr_, create_graph=True)
                        v = torch.zeros_like(xr_); v[0, j, b] = 1.0
                        h, = torch.autograd.grad((g * v).sum(), xr_)
                    cols[(j, b)] = h[0, :, :4].detach().float().cpu().numpy()
            hp = []
            for (i, a, j, b) in pair_key:
                if (j, b) in cols and (j, refb[j]) in cols:
                    hp.append(float(cols[(j, b)][i, a] - cols[(j, b)][i, refb[i]]
                                    - cols[(j, refb[j])][i, a] + cols[(j, refb[j])][i, refb[i]]))
                else:
                    hp.append(np.nan)
            hess_pred = np.array(hp)

        sep = np.array([abs(i - j) for (i, a, j, b) in pair_key], dtype=float)
        both_top = np.array([bool(is_top[np.searchsorted(pos, i)] and is_top[np.searchsorted(pos, j)])
                             for (i, a, j, b) in pair_key])
        add_mag = np.array([abs(single[(i, a)]) + abs(single[(j, b)]) for (i, a, j, b) in pair_key])

        def corr(u, v):
            m = np.isfinite(u) & np.isfinite(v)
            if m.sum() < 3 or np.std(u[m]) == 0 or np.std(v[m]) == 0:
                return None
            return round(float(np.corrcoef(u[m], v[m])[0, 1]), 4)

        rows.append({
            "id": lid,
            "pairs": len(pair_key),
            "singleDriftVsShippedPlane": round(drift, 6),
            "medianAbsResidual": round(float(np.median(np.abs(resid))), 6),
            "medianAbsSingle": round(float(np.median(np.abs(singles_v))), 6),
            "residualOverSingle": round(float(np.median(np.abs(resid)) /
                                              max(1e-12, np.median(np.abs(singles_v)))), 4),
            "medianAbsResidualStrong": round(float(np.median(np.abs(resid[both_top]))), 6)
            if both_top.any() else None,
            "medianAbsResidualOther": round(float(np.median(np.abs(resid[~both_top]))), 6)
            if (~both_top).any() else None,
            "hessianR": corr(hess_pred, resid) if hess_pred is not None else None,
            "separationR": corr(-sep, np.abs(resid)),
            "additiveMagnitudeR": corr(add_mag, np.abs(resid)),
        })
        # A sample of the actual pairs, so the page can draw the calibration rather than
        # asserting a correlation coefficient at the reader. r comes from a line, a fan and a
        # cloud with two outliers alike.
        take = np.argsort(-np.abs(resid))[:24]
        for k in take:
            i, a, j, b = pair_key[int(k)]
            scatter.append({
                "locus": lid,
                "resid": round(float(resid[int(k)]), 6),
                "hess": (round(float(hess_pred[int(k)]), 6)
                         if hess_pred is not None and np.isfinite(hess_pred[int(k)]) else None),
                "sep": int(abs(i - j)),
                "bothStrong": bool(both_top[int(k)]),
            })
        print(f"  {lid:10s} {len(pair_key):5,} pairs  {time.time() - t0:5.1f}s  "
              f"|resid|/|single|={rows[-1]['residualOverSingle']:.3f}  "
              f"hessian r={rows[-1]['hessianR']}  drift={drift:.2e}", flush=True)

    hess = [r["hessianR"] for r in rows if r["hessianR"] is not None]
    sepr = [r["separationR"] for r in rows if r["separationR"] is not None]
    out = {
        "note": ("Every double substitution over a locked set of positions per locus, evaluated "
                 "exactly and rc-averaged, with the inclusion-exclusion residual as the measured "
                 "interaction. The Hessian panel the site ships is calibrated against it. Additive "
                 "predicts zero and is the null."),
        "fold": args.fold,
        "loci": len(rows),
        "positionsPerLocus": int(args.positions) * 2,
        "pairsTotal": int(sum(r["pairs"] for r in rows)),
        "medianResidualOverSingle": round(float(np.median([r["residualOverSingle"] for r in rows])), 4),
        "hessianCalibration": {
            "medianR": round(float(np.median(hess)), 4) if hess else None,
            "minR": round(float(np.min(hess)), 4) if hess else None,
            "maxR": round(float(np.max(hess)), 4) if hess else None,
            "loci": len(hess),
        },
        "separationCalibration": {
            "medianR": round(float(np.median(sepr)), 4) if sepr else None,
        },
        "scatter": scatter,
        "maxSingleDriftVsShippedPlane": round(max((r["singleDriftVsShippedPlane"] for r in rows),
                                                  default=0.0), 6),
        "perLocus": rows,
    }
    dest = Path(args.out) if args.out else OUT
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"\n  median |residual| / |single effect|   {out['medianResidualOverSingle']}")
    print(f"  Hessian calibration, median r         {out['hessianCalibration']['medianR']}")
    print(f"  separation-only, median r             {out['separationCalibration']['medianR']}")
    print(f"  singles vs shipped plane, worst drift {out['maxSingleDriftVsShippedPlane']:.2e}")
    print(f"  elapsed {(time.time() - t_all) / 60:.1f} min\nwrote {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
