"""Proposal 1 — the fold-uncertainty ledger.

Both audit documents record training-fold uncertainty as *unestimated*, and every headline number
on `/shorkie-lab/shorkie/` comes from a single checkpoint. It is not unestimable: all eight folds
are public at

    https://storage.googleapis.com/seqnn-share/shorkie_models/shorkie/f<n>/model_best.h5

and they are genuinely different models -- distinct weight bytes, and on TDH3 they predict
g = 14.98 to 15.73, a factor of 1.68 in coverage between the extremes.

WHAT THIS MEASURES

For a locked panel of bases per locus, the exact single-base effect

    d(i, q) = g(x_{i<-q}; R_gene, T0) - g(x; R_gene, T0)

is recomputed under every fold and on both strands, and the variation is decomposed. Fold and
strand are kept as SEPARATE axes throughout. The card is explicit that strand variance must not
be substituted for fold variance, and this is the one place that substitution is now avoidable:
the model was trained with `augment_rc: false`, so a forward/reverse difference is a fact about
the model, not Monte-Carlo noise, and pooling the two would hide both.

THE SELECTION BIAS, WHICH IS THE ONE ERROR THAT WOULD FABRICATE THE RESULT

The panel is chosen from f0's own ISM plane, because that is the plane the site ships and whose
top bases the site's claims rest on. That makes f0's agreement with the panel a tautology. So f0
selects and is reported in its own column; the cross-fold statistics are computed over f1..f7
ONLY. A ledger that averaged f0 in would report the selection back to itself.

Each real base is paired with a control matched on |distance to TSS|, so "how many survive" has
something to be compared against.

PREREGISTERED GATES (fixed here before the run, per the card)

    sign agreement  > 0.80    median over f1..f7
    top-1% overlap  > 0.40    median over fold pairs, on whole-window gradient x input
    95% interval excluding zero

Usage:
    python3 scripts/shorkie/make_folds.py [--folds f0,f1,...] [--panel 128] [--device mps]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
from common import ROOT, SCRATCH, SEQ_LEN, N_BINS, BASE_IDX  # noqa: E402

OUT = ROOT / "src" / "data" / "shorkieFolds.json"
CACHE = SCRATCH / "folds" / "sweep"

# Preregistered, and read by verify_pipeline so the page cannot quietly move them.
GATE_SIGN = 0.80
GATE_OVERLAP = 0.40
TOP_FRACTION = 0.01          # "top 1%" for the overlap statistic, on 16,384 bases


def panel_for(plane: np.ndarray, seq: str, tss: int, k: int, rng: np.random.Generator):
    """Top-k positions by |effect|, plus k controls matched on |distance to TSS|.

    `plane` is f0's [4, 16384] ISM plane; the reference row is zero by construction, so the
    per-position statistic is the largest absolute alternative effect.
    """
    valid = np.array([i for i in range(SEQ_LEN) if seq[i] in BASE_IDX])
    strength = np.abs(plane).max(axis=0)
    order = valid[np.argsort(-strength[valid])]
    top = order[:k]

    taken = set(int(i) for i in top)
    dist = np.abs(np.arange(SEQ_LEN) - tss)
    pool = np.array([i for i in valid if int(i) not in taken])
    controls = []
    for i in top:
        want = dist[i]
        # nearest unused position with a matching distance-to-TSS, sign of the offset free
        cand = pool[np.argsort(np.abs(dist[pool] - want))]
        for c in cand:
            if int(c) not in taken:
                taken.add(int(c))
                controls.append(int(c))
                break
    return np.array(sorted(top)), np.array(sorted(controls))


def sweep_locus(runner, locus, species, positions, batch: int):
    """Exact single-base effects at `positions`, forward and reverse, for one fold.

    Returns arrays [P, 4] of per-strand logSED with the reference base left at 0.
    """
    torch = runner.torch
    device = runner.device
    seq = locus["sequence"].upper()
    lo, hi = common.gene_body_bins(locus["features"], locus["id"])
    rc_lo, rc_hi = N_BINS - hi, N_BINS - lo

    ref_np = common.encode(seq, species)
    fwd = torch.from_numpy(np.repeat(ref_np[None], batch, axis=0)).to(device)
    rev = torch.from_numpy(np.repeat(common.rc_encoded(ref_np)[None], batch, axis=0)).to(device)

    def cov(b, a, z, n):
        with torch.no_grad():
            y, _ = runner.model(b)
        return y[:n, a:z, :].mean(dim=-1).sum(dim=-1).float().cpu().numpy()

    ref_f = float(cov(fwd, lo, hi, 1)[0])
    ref_r = float(cov(rev, rc_lo, rc_hi, 1)[0])

    jobs = [(int(i), b) for i in positions for b in range(4) if b != BASE_IDX[seq[i]]]
    ref_of = np.array([BASE_IDX.get(c, 0) for c in seq])
    idx = {int(p): n for n, p in enumerate(positions)}
    out_f = np.zeros((len(positions), 4), dtype=np.float64)
    out_r = np.zeros((len(positions), 4), dtype=np.float64)

    for s in range(0, len(jobs), batch):
        chunk = jobs[s:s + batch]
        n = len(chunk)
        ci = torch.arange(n, device=device)
        pos = torch.as_tensor([i for i, _ in chunk], device=device)
        alt = torch.as_tensor([b for _, b in chunk], device=device)
        refb = torch.as_tensor(ref_of[[i for i, _ in chunk]], device=device)
        mpos, malt, mrefb = SEQ_LEN - 1 - pos, 3 - alt, 3 - refb

        # A mutant differs from the reference in four floats: mutate the resident batch in place
        # rather than rebuilding 356 MB of [32, 16384, 170] per step.
        fwd[ci, pos, refb] = 0.0
        fwd[ci, pos, alt] = 1.0
        rev[ci, mpos, mrefb] = 0.0
        rev[ci, mpos, malt] = 1.0

        af = cov(fwd, lo, hi, n)
        ar = cov(rev, rc_lo, rc_hi, n)

        fwd[ci, pos, alt] = 0.0
        fwd[ci, pos, refb] = 1.0
        rev[ci, mpos, malt] = 0.0
        rev[ci, mpos, mrefb] = 1.0

        for k, (i, b) in enumerate(chunk):
            out_f[idx[i], b] = np.log2(af[k] + 1) - np.log2(ref_f + 1)
            out_r[idx[i], b] = np.log2(ar[k] + 1) - np.log2(ref_r + 1)

    return out_f, out_r, ref_f, ref_r


def whole_window_grad(runner, locus, species):
    """rc-averaged gradient x input over the whole window, projected on the reference base."""
    seq = locus["sequence"].upper()
    lo, hi = common.gene_body_bins(locus["features"], locus["id"])
    rc_lo, rc_hi = N_BINS - hi, N_BINS - lo
    x = common.encode(seq, species)
    gf, _ = runner.grad_x(x, lo, hi)
    gr, _ = runner.grad_x(common.rc_encoded(x), rc_lo, rc_hi)
    g = 0.5 * (gf + common.rc_grad_np(gr))
    g = g - g.mean(axis=1, keepdims=True)          # the Borzoi convention the site already uses
    onehot = x[:, :4]
    return (g * onehot).sum(axis=1)


def spearman(a: np.ndarray, b: np.ndarray) -> float:
    ra = np.argsort(np.argsort(a)).astype(np.float64)
    rb = np.argsort(np.argsort(b)).astype(np.float64)
    ra -= ra.mean(); rb -= rb.mean()
    d = float(np.sqrt((ra ** 2).sum() * (rb ** 2).sum()))
    return float((ra * rb).sum() / d) if d else 0.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--folds", default=",".join(common.FOLDS))
    ap.add_argument("--panel", type=int, default=128, help="top-k real bases per locus")
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--device", default=None)
    ap.add_argument("--only", default=None)
    ap.add_argument("--summarise", action="store_true", help="re-summarise the cache, no model")
    args = ap.parse_args()

    folds = [f.strip() for f in args.folds.split(",") if f.strip()]
    loci_pack = common.loci_pack()
    species = loci_pack["speciesIndex"]
    loci = [L for L in loci_pack["loci"] if not args.only or L["id"] == args.only]
    CACHE.mkdir(parents=True, exist_ok=True)

    # ---- panel selection, from f0 only -------------------------------------------------------
    rng = np.random.default_rng(20260905)
    panels = {}
    for L in loci:
        raw = SCRATCH / "ism-raw" / f"{L['id']}-ism.npy"
        if not raw.exists():
            print(f"  {L['id']}: no f0 ISM plane at {raw}, skipping", file=sys.stderr)
            continue
        plane = np.load(raw)
        top, ctl = panel_for(plane, L["sequence"].upper(),
                             common.tss_of(L["features"], L["id"]), args.panel, rng)
        panels[L["id"]] = {"top": top, "control": ctl}
    print(f"panel: {len(panels)} loci x ({args.panel} top + {args.panel} matched controls)")

    # ---- sweep ------------------------------------------------------------------------------
    if not args.summarise:
        import torch  # noqa: F401
        device = args.device or ("mps" if __import__("torch").backends.mps.is_available() else "cpu")
        print(f"device: {device}  batch: {args.batch}  folds: {','.join(folds)}")
        t_start = time.time()
        n_pass = 0
        for fold in folds:
            runner = None
            for L in loci:
                if L["id"] not in panels:
                    continue
                cache_p = CACHE / f"{fold}-{L['id']}.npz"
                if cache_p.exists():
                    continue
                if runner is None:
                    runner = common.Runner(common.fold_checkpoint(fold), device)
                pos = np.concatenate([panels[L["id"]]["top"], panels[L["id"]]["control"]])
                pos = np.array(sorted(set(int(p) for p in pos)))
                t0 = time.time()
                ef, er, rf, rr = sweep_locus(runner, L, species, pos, args.batch)
                grad = whole_window_grad(runner, L, species)
                np.savez_compressed(str(cache_p).replace(".npz", "") + ".tmp.npz",
                                    positions=pos, fwd=ef, rev=er,
                                    ref_f=rf, ref_r=rr, grad=grad)
                Path(str(cache_p).replace(".npz", "") + ".tmp.npz").rename(cache_p)
                did = len(pos) * 3 * 2
                n_pass += did
                dt = time.time() - t0
                print(f"  {fold} {L['id']:10s} {did:6,} passes  {dt:6.1f}s "
                      f"({dt / max(1, did) * 1000:.2f} ms/pass)", flush=True)
            del runner
        if n_pass:
            el = time.time() - t_start
            print(f"swept {n_pass:,} passes in {el / 60:.1f} min "
                  f"({el / n_pass * 1000:.2f} ms/pass measured under these conditions)")

    # ---- summarise --------------------------------------------------------------------------
    have = [f for f in folds if all((CACHE / f"{f}-{L['id']}.npz").exists()
                                    for L in loci if L["id"] in panels)]
    evidence = [f for f in have if f != "f0"]        # f0 selected the panel; it is not evidence
    if len(evidence) < 2:
        print("need at least two non-f0 folds to summarise", file=sys.stderr)
        return 1
    print(f"summarising over {len(evidence)} evidence folds ({','.join(evidence)}); "
          f"f0 reported separately")

    per_locus, rows = [], []
    overlap_pairs, strand_gaps, fold_sds = [], [], []
    for L in loci:
        lid = L["id"]
        if lid not in panels:
            continue
        seq = L["sequence"].upper()
        data = {f: np.load(CACHE / f"{f}-{lid}.npz") for f in have}
        pos = data[have[0]]["positions"]
        is_top = np.isin(pos, panels[lid]["top"])

        # rc-averaged effect per (position, alt), per fold
        eff = {f: 0.5 * (data[f]["fwd"] + data[f]["rev"]) for f in have}
        gap = {f: np.abs(data[f]["fwd"] - data[f]["rev"]) for f in have}

        mask = np.zeros_like(eff[have[0]], dtype=bool)
        for n, i in enumerate(pos):
            for b in range(4):
                if b != BASE_IDX[seq[int(i)]]:
                    mask[n, b] = True

        stack = np.stack([eff[f][mask] for f in evidence])           # [F, S]
        sign = np.sign(stack)
        agree = np.maximum((sign > 0).sum(axis=0), (sign < 0).sum(axis=0)) / len(evidence)
        mean = stack.mean(axis=0)
        sd = stack.std(axis=0, ddof=1)
        sem = sd / np.sqrt(len(evidence))
        ci_excludes_zero = np.abs(mean) > 1.96 * sem
        stable = (agree >= GATE_SIGN) & ci_excludes_zero

        # which substitutions belong to a top base vs a matched control
        which_top = np.repeat(is_top[:, None], 4, axis=1)[mask]

        # top-1% overlap on the whole-window gradient, between every evidence fold pair
        k = max(1, int(TOP_FRACTION * SEQ_LEN))
        tops = {f: set(np.argsort(-np.abs(data[f]["grad"]))[:k].tolist()) for f in evidence}
        pair_ov = [len(tops[a] & tops[b]) / k
                   for n, a in enumerate(evidence) for b in evidence[n + 1:]]
        pair_rho = [spearman(eff[a][mask], eff[b][mask])
                    for n, a in enumerate(evidence) for b in evidence[n + 1:]]
        overlap_pairs += pair_ov

        strand_gaps.append(float(np.median(np.stack([gap[f][mask] for f in evidence]))))
        fold_sds.append(float(np.median(sd)))

        per_locus.append({
            "id": lid,
            "gF0": round(float(np.log2(1 + data["f0"]["ref_f"])) if "f0" in data else 0.0, 4),
            "signAgreement": round(float(np.median(agree)), 4),
            "topOverlap": round(float(np.median(pair_ov)), 4),
            "foldRho": round(float(np.median(pair_rho)), 4),
            "stableTop": round(float(stable[which_top].mean()), 4),
            "stableControl": round(float(stable[~which_top].mean()), 4),
            "medianFoldSd": round(float(np.median(sd)), 5),
            "medianStrandGap": round(float(np.median(np.stack([gap[f][mask] for f in evidence]))), 5),
            "medianAbsEffect": round(float(np.median(np.abs(mean))), 5),
        })
        rows.append((stable, which_top, agree, sd, mean,
                     np.median(np.stack([gap[f][mask] for f in evidence]), axis=0)))

    allstable = np.concatenate([r[0] for r in rows])
    alltop = np.concatenate([r[1] for r in rows])
    allagree = np.concatenate([r[2] for r in rows])
    allsd = np.concatenate([r[3] for r in rows])
    allmean = np.concatenate([r[4] for r in rows])
    allgap = np.concatenate([r[5] for r in rows])

    # Variance the two axes carry, side by side and never pooled.
    fold_component = float(np.median(allsd))
    strand_component = float(np.median(allgap) / 2.0)   # |f - r| / 2 is the deviation of each arm

    summary = {
        "note": ("Every exact single-base effect in a locked panel, recomputed under all eight "
                 "released training folds and on both strands. The panel is selected from f0, so "
                 "f0 is reported separately and every cross-fold statistic is computed over "
                 "f1-f7 only."),
        "folds": have,
        "evidenceFolds": evidence,
        "loci": len(per_locus),
        "panelPerLocus": int(args.panel),
        "substitutions": int(allstable.size),
        "gates": {"signAgreement": GATE_SIGN, "topOverlap": GATE_OVERLAP,
                  "interval": "95% over evidence folds excluding zero"},
        "medianSignAgreement": round(float(np.median(allagree)), 4),
        "medianTopOverlap": round(float(np.median(overlap_pairs)), 4),
        "stableFractionTop": round(float(allstable[alltop].mean()), 4),
        "stableFractionControl": round(float(allstable[~alltop].mean()), 4),
        "medianFoldSd": round(fold_component, 5),
        "medianStrandDeviation": round(strand_component, 5),
        "strandOverFold": round(strand_component / fold_component, 3) if fold_component else None,
        "medianAbsEffect": round(float(np.median(np.abs(allmean))), 5),
        "passesSignGate": bool(np.median(allagree) > GATE_SIGN),
        "passesOverlapGate": bool(np.median(overlap_pairs) > GATE_OVERLAP),
        "perLocus": sorted(per_locus, key=lambda r: -r["stableTop"]),
    }
    OUT.write_text(json.dumps(summary, separators=(",", ":")) + "\n")

    print(f"\n  median sign agreement   {summary['medianSignAgreement']:.3f}  "
          f"(gate {GATE_SIGN})  {'PASS' if summary['passesSignGate'] else 'FAIL'}")
    print(f"  median top-1% overlap   {summary['medianTopOverlap']:.3f}  "
          f"(gate {GATE_OVERLAP})  {'PASS' if summary['passesOverlapGate'] else 'FAIL'}")
    print(f"  fold-stable, top bases  {summary['stableFractionTop'] * 100:.1f}%")
    print(f"  fold-stable, controls   {summary['stableFractionControl'] * 100:.1f}%")
    print(f"  median fold sd          {summary['medianFoldSd']:.5f}")
    print(f"  median strand deviation {summary['medianStrandDeviation']:.5f}  "
          f"({summary['strandOverFold']}x the fold sd)")
    print(f"\nwrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
