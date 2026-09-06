"""Proposal 4 — the faithfulness benchmark.

The site ships five attribution surfaces and has never scored any of them against exact edits.
This does, and the ground truth costs nothing: exhaustive single-base mutagenesis for all 23 loci
already sits in `_scratch/ism-raw/<id>-ism.npy`. What was missing was not the truth but the
interventions that measure against it.

THREE FAMILIES OF SCORE, AND ONLY ONE IS A CORRELATION

  1. Rank agreement with exact ISM -- computed at EACH METHOD'S OWN NATIVE RESOLUTION, with the
     ISM ground truth pooled to match. Scoring 64-bp occlusion per base measures its resolution,
     not its faithfulness, and would rank every coarse method last for a reason that has nothing
     to do with whether it is right.

  2. Deletion curves driven by REAL FORWARD PASSES. Rank the bases by the method, substitute the
     top-k each to its own worst alternative (known exactly from the plane, so this costs no
     search), and measure the actual fall in g. This is the only part of the benchmark that is an
     intervention rather than a correlation, and it is the part a pretty map can fail.

     EVERY CURVE IS DIVIDED BY THE SAME DENOMINATOR -- the drop the exact-ISM oracle ranking
     achieves at the largest k, per locus. Normalising each method by its OWN endpoint instead
     measures the SHAPE of its curve and not how much damage its ranking does, and the two
     disagree: under per-method normalisation a distance-to-TSS baseline outranked a method
     correlating with the ground truth at rho = 0.73, because its top bases are one contiguous
     block whose curve happens to rise early relative to where it ends up. With a shared
     denominator, and then rescaled so the oracle reads exactly 1.000, the column says what
     fraction of the achievable damage a ranking actually found.

  3. Cascading parameter randomization (Adebayo et al. 2018). Randomize the weights from the head
     backwards, stage by stage, and watch the attribution decorrelate from its intact self. A map
     that survives randomization is not reading the model.

     THE U-NET MAKES THIS TEST READ DIFFERENTLY, and it is reported per branch. Randomizing the
     bottleneck leaves the three decoder skips intact, so an attribution that survives may be
     reading the skips rather than failing the sanity check. Collapsing that into one number
     would turn an architectural fact into an accusation.

Attention rollout is included knowing it is unsigned token mixing at 128 bp and has no reason to
beat the GC baseline. If it does not, the scorecard says so; that is the benchmark working.

Output: src/data/shorkieFaithfulness.json
Usage:  python3 scripts/shorkie/make_faithfulness.py [--device mps]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
from common import ROOT, SCRATCH, SEQ_LEN, N_BINS, BASE_IDX  # noqa: E402

OUT = ROOT / "src" / "data" / "shorkieFaithfulness.json"
VP = ROOT / "public" / "vp-data"

OCCL_BP = 64
ROLLOUT_BP = 128
IG_STEPS = 32
DELETION_K = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]
RANDOMIZE_LOCI = 6          # cascading randomization is a per-stage sweep; six loci is plenty


# ------------------------------------------------------------------------------- ground truth

def ism_truth(locus_id: str):
    """[4, 16384] exact plane -> (max |effect|, worst alternative, damage that alternative does).

    THREE quantities, and conflating the first and third is a real error. `max |effect|` is "how
    much can this base move the prediction", which is the right ground truth for a RANK
    comparison. `damage` is how far g falls when the base is substituted to its worst
    alternative, which is the quantity the deletion curve actually applies -- and a base can rank
    high on the first while doing little of the second, if its largest effect is an increase.

    Ranking the oracle by `max |effect|` therefore does not bound the deletion task, and it
    showed: integrated gradients scored 1.0053 against a "ceiling" of 1.0000. A ceiling a method
    can exceed is not a ceiling, it is a mislabelled competitor.
    """
    raw = SCRATCH / "ism-raw" / f"{locus_id}-ism.npy"
    if not raw.exists():
        return None, None, None
    plane = np.load(raw)
    worst = np.argmin(plane, axis=0)              # most-damaging substitution at each base
    damage = -plane.min(axis=0)                   # how far g falls when that one is applied
    return np.abs(plane).max(axis=0), worst, damage


def pool_to(v: np.ndarray, bp: int) -> np.ndarray:
    """Block mean over `bp` bases, so a coarse method is compared on its own grid."""
    n = len(v) // bp
    return v[:n * bp].reshape(n, bp).mean(axis=1)


# ------------------------------------------------------------------------------------ methods

def grad_x_input(runner, x, lo, hi, rc_lo, rc_hi):
    gf, _ = runner.grad_x(x, lo, hi)
    gr, _ = runner.grad_x(common.rc_encoded(x), rc_lo, rc_hi)
    g = 0.5 * (gf + common.rc_grad_np(gr))
    g = g - g.mean(axis=1, keepdims=True)
    return (g * x[:, :4]).sum(axis=1)


def integrated_gradients(runner, x, lo, hi, rc_lo, rc_hi, steps=IG_STEPS, baseline=None):
    """32-step midpoint path integral. NOT mean-centred: that would destroy completeness.

    Returns (attribution [16384], completeness gap, sum of attributions).
    """
    torch = runner.torch
    base = np.zeros_like(x) if baseline is None else baseline
    base = base.copy()
    base[:, 4:] = x[:, 4:]                      # species one-hot stays valid on the path

    def one(xx, bb, a, z):
        total = np.zeros((SEQ_LEN, 4), dtype=np.float64)
        for s in range(steps):
            alpha = (s + 0.5) / steps
            pt = bb + alpha * (xx - bb)
            g, _ = runner.grad_x(pt.astype(np.float32), a, z)
            total += g
        return total / steps * (xx[:, :4] - bb[:, :4])

    af = one(x, base, lo, hi)
    ar = one(common.rc_encoded(x), common.rc_encoded(base), rc_lo, rc_hi)
    attr = 0.5 * (af + common.rc_grad_np(ar))

    gx_f = runner.score(x[None], lo, hi)[0]
    gb_f = runner.score(base[None], lo, hi)[0]
    gx_r = runner.score(common.rc_encoded(x)[None], rc_lo, rc_hi)[0]
    gb_r = runner.score(common.rc_encoded(base)[None], rc_lo, rc_hi)[0]
    # The average of two complete decompositions is a decomposition of the AVERAGE, so the target
    # gap must be rc-averaged too; leaving it forward-only inflates the error several-fold.
    gap_target = 0.5 * ((gx_f - gb_f) + (gx_r - gb_r))
    return attr.sum(axis=1), float(attr.sum() - gap_target), float(gap_target)


def occlusion(runner, x, lo, hi, rc_lo, rc_hi, batch=32):
    """Zero each 64-bp block of DNA and read the fall in g. rc-averaged over mirrored spans."""
    torch, device = runner.torch, runner.device
    n = SEQ_LEN // OCCL_BP
    xf = torch.from_numpy(np.repeat(x[None], batch, axis=0)).to(device)
    xr = torch.from_numpy(np.repeat(common.rc_encoded(x)[None], batch, axis=0)).to(device)

    def cov(b, a, z, k):
        with torch.no_grad():
            y, _ = runner.model(b)
        return y[:k, a:z, :].mean(dim=-1).sum(dim=-1).float().cpu().numpy()

    ref_f = float(cov(xf, lo, hi, 1)[0])
    ref_r = float(cov(xr, rc_lo, rc_hi, 1)[0])
    out = np.zeros(n)
    for s in range(0, n, batch):
        blocks = list(range(s, min(n, s + batch)))
        k = len(blocks)
        keep_f, keep_r = [], []
        for j, b in enumerate(blocks):
            a0, a1 = b * OCCL_BP, (b + 1) * OCCL_BP
            m0, m1 = SEQ_LEN - a1, SEQ_LEN - a0
            keep_f.append(xf[j, a0:a1, :4].clone()); xf[j, a0:a1, :4] = 0.0
            keep_r.append(xr[j, m0:m1, :4].clone()); xr[j, m0:m1, :4] = 0.0
        af = cov(xf, lo, hi, k)
        ar = cov(xr, rc_lo, rc_hi, k)
        for j, b in enumerate(blocks):
            a0, a1 = b * OCCL_BP, (b + 1) * OCCL_BP
            m0, m1 = SEQ_LEN - a1, SEQ_LEN - a0
            xf[j, a0:a1, :4] = keep_f[j]
            xr[j, m0:m1, :4] = keep_r[j]
            out[b] = 0.5 * ((np.log2(af[j] + 1) - np.log2(ref_f + 1))
                            + (np.log2(ar[j] + 1) - np.log2(ref_r + 1)))
    return out


def rollout(locus_id: str):
    """Residual attention rollout over the shipped [8,128,128] pack: 0.5 I + 0.5 A, composed.

    An architectural quantity -- what the transformer CAN read -- not an attribution. Included so
    the benchmark can say where it actually lands rather than leaving it unscored.
    """
    side = VP / f"{locus_id}.json"
    png = VP / f"{locus_id}-attn.png"
    if not side.exists() or not png.exists():
        return None
    spec = json.loads(side.read_text()).get("attn")
    if not spec:
        return None
    q = np.array(Image.open(png).convert("L"), dtype=np.float64)
    lo = np.array(spec["lo"], dtype=np.float64)[:, None]
    hi = np.array(spec["hi"], dtype=np.float64)[:, None]
    a = (q / 255.0 * np.maximum(hi - lo, 1e-9) + lo).reshape(8, 128, 128)
    r = np.eye(128)
    for l in range(8):
        m = 0.5 * np.eye(128) + 0.5 * (a[l] / np.maximum(a[l].sum(axis=1, keepdims=True), 1e-12))
        r = m @ r
    return r.sum(axis=0)          # mass arriving at each key position


def stem_response(runner, x):
    """Max over the 96 first-layer filters at each position: a motif-scan baseline."""
    torch = runner.torch
    with torch.no_grad():
        t = torch.from_numpy(x[None]).to(runner.device)
        _, acts = runner.model(t, want_intermediates=True)
    h = acts["stem"][0].abs().max(dim=0).values.float().cpu().numpy()    # [16384]
    return h


# ------------------------------------------------------------------------------------- scoring

def spearman(a, b):
    ra = np.argsort(np.argsort(a)).astype(np.float64)
    rb = np.argsort(np.argsort(b)).astype(np.float64)
    ra -= ra.mean(); rb -= rb.mean()
    d = float(np.sqrt((ra ** 2).sum() * (rb ** 2).sum()))
    return float((ra * rb).sum() / d) if d else 0.0


def deletion_curve(runner, locus, species, order, worst, lo, hi, rc_lo, rc_hi, batch=32):
    """Substitute the top-k ranked bases to their worst alternative; measure the real fall in g."""
    torch, device = runner.torch, runner.device
    seq = locus["sequence"].upper()
    x = common.encode(seq, species)
    ks = [k for k in DELETION_K if k <= len(order)]
    xf = torch.from_numpy(np.repeat(x[None], len(ks), axis=0)).to(device)
    xr = torch.from_numpy(np.repeat(common.rc_encoded(x)[None], len(ks), axis=0)).to(device)
    for j, k in enumerate(ks):
        for i in order[:k]:
            i = int(i)
            if seq[i] not in BASE_IDX:
                continue
            b = int(worst[i])
            xf[j, i, :4] = 0.0; xf[j, i, b] = 1.0
            m = SEQ_LEN - 1 - i
            xr[j, m, :4] = 0.0; xr[j, m, 3 - b] = 1.0

    def cov(b, a, z, n):
        with torch.no_grad():
            y, _ = runner.model(b)
        return y[:n, a:z, :].mean(dim=-1).sum(dim=-1).float().cpu().numpy()

    ref = 0.5 * (np.log2(cov(torch.from_numpy(x[None]).to(device), lo, hi, 1)[0] + 1)
                 + np.log2(cov(torch.from_numpy(common.rc_encoded(x)[None]).to(device),
                               rc_lo, rc_hi, 1)[0] + 1))
    gf = np.log2(cov(xf, lo, hi, len(ks)) + 1)
    gr = np.log2(cov(xr, rc_lo, rc_hi, len(ks)) + 1)
    return ks, list(ref - 0.5 * (gf + gr))


# --------------------------------------------------------------- cascading randomization

def stage_modules(model, stage: str):
    """The parameter-holding modules of one named stage, head-first ordering elsewhere."""
    if stage == "head":
        return [model.head]
    if stage.startswith("decoder"):
        i = int(stage[-1]) - 1
        return [model.dec_bn_main[i], model.dec_bn_skip[i], model.dec_main[i],
                model.dec_skip[i], model.dec_sep[i]]
    if stage.startswith("attn_out"):
        i = int(stage[-1]) - 1
        return [model.ln_attn[i], model.attn[i], model.ln_ff[i], model.ff1[i], model.ff2[i]]
    if stage.startswith("block"):
        i = int(stage[-1]) - 1
        return [model.bn_a[i], model.conv_a[i], model.bn_b[i], model.conv_b[i]]
    if stage == "stem":
        return [model.stem]
    raise ValueError(stage)


def randomize_(torch, modules, gen) -> None:
    """PERMUTE each tensor's own values rather than resampling them.

    A permutation preserves every parameter's exact marginal distribution -- mean, variance, every
    moment -- and destroys only the arrangement, so a collapse cannot be dismissed as a change of
    scale. Resampling from a guessed init distribution confounds "the weights no longer mean
    anything" with "the weights are now the wrong size".
    """
    for m in modules:
        for p in m.parameters(recurse=True):
            if p.numel() > 1:
                flat = p.data.reshape(-1)
                # The permutation is drawn on the CPU and moved: a seeded generator is bound to a
                # device, and asking an MPS tensor to index with a CPU generator throws. Drawing on
                # the CPU also keeps the sweep reproducible whichever device the run uses.
                perm = torch.randperm(flat.numel(), generator=gen).to(flat.device)
                p.data.copy_(flat[perm].reshape(p.shape))


# Head-first: the check is whether an attribution decays as the network beneath it is destroyed.
# The U-Net makes the ORDER matter, because randomizing the transformer leaves the three decoder
# skips -- fed by block5, block6 and block7 -- carrying real signal around it.
RANDOMIZE_ORDER = (["head"] + [f"decoder{i}" for i in (3, 2, 1)]
                   + [f"attn_out{i}" for i in range(8, 0, -1)]
                   + [f"block{i}" for i in range(7, 0, -1)] + ["stem"])
SKIP_SOURCES = {"block5", "block6", "block7"}


def branch_of(stage: str) -> str:
    if stage == "head" or stage.startswith("decoder"):
        return "decoder"
    if stage.startswith("attn_out"):
        return "bottleneck (skips bypass it)"
    if stage in SKIP_SOURCES:
        return "encoder, feeds a skip"
    return "encoder, below every skip"


def randomization_sweep(runner, pack, species, loci, n_loci: int):
    """Adebayo et al. 2018, cascading: destroy the model from the head down and watch the map go.

    An attribution that survives randomization is not reading the model. But in a skip-connected
    architecture one pooled number would be misleading: randomizing the bottleneck leaves block5-7
    feeding the decoder directly, so a map that survives THAT may be reading the skips rather than
    failing the check. Every row therefore carries the branch it destroyed.
    """
    torch = runner.torch
    gen = torch.Generator(device="cpu").manual_seed(20260905)
    subset = loci[:n_loci]
    intact = {}
    for L in subset:
        x = common.encode(L["sequence"].upper(), species)
        lo, hi = common.gene_body_bins(L["features"], L["id"])
        intact[L["id"]] = (x, lo, hi, N_BINS - hi, N_BINS - lo,
                           grad_x_input(runner, x, lo, hi, N_BINS - hi, N_BINS - lo))
    rows = []
    for stage in RANDOMIZE_ORDER:
        randomize_(torch, stage_modules(runner.model, stage), gen)
        rhos = []
        for lid, (x, lo, hi, rlo, rhi, ref) in intact.items():
            now = grad_x_input(runner, x, lo, hi, rlo, rhi)
            rhos.append(abs(spearman(np.abs(now), np.abs(ref))))
        rows.append({"stage": stage, "branch": branch_of(stage),
                     "medianAbsRho": round(float(np.median(rhos)), 4)})
        print(f"    randomized through {stage:11s} ({branch_of(stage):28s}) "
              f"|rho| vs intact = {rows[-1]['medianAbsRho']:.4f}", flush=True)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default=None)
    ap.add_argument("--only", default=None)
    ap.add_argument("--fold", default="f0")
    ap.add_argument("--skip-randomization", action="store_true")
    ap.add_argument("--out", default=None,
                    help="write here instead of the shipped pack, for a per-fold sweep")
    args = ap.parse_args()

    import torch
    device = args.device or ("mps" if torch.backends.mps.is_available() else "cpu")
    pack = common.loci_pack()
    species = pack["speciesIndex"]
    loci = [L for L in pack["loci"] if not args.only or L["id"] == args.only]
    runner = common.Runner(common.fold_checkpoint(args.fold), device)
    print(f"device: {device}  fold: {args.fold}  loci: {len(loci)}")

    randomization = None
    rows, curves, t_start = [], {}, time.time()
    for L in loci:
        lid = L["id"]
        truth, worst, damage = ism_truth(lid)
        if truth is None:
            print(f"  {lid}: no ISM plane, skipping", file=sys.stderr)
            continue
        seq = L["sequence"].upper()
        x = common.encode(seq, species)
        lo, hi = common.gene_body_bins(L["features"], lid)
        rc_lo, rc_hi = N_BINS - hi, N_BINS - lo
        tss = common.tss_of(L["features"], lid)
        t0 = time.time()

        gi = grad_x_input(runner, x, lo, hi, rc_lo, rc_hi)
        ig, gap_abs, gap_target = integrated_gradients(runner, x, lo, hi, rc_lo, rc_hi)
        oc = occlusion(runner, x, lo, hi, rc_lo, rc_hi)
        ro = rollout(lid)
        st = stem_response(runner, x)

        gc = pool_to(np.isin(np.frombuffer(seq.encode(), dtype="S1"), [b"G", b"C"]).astype(float), 1)
        gc = np.convolve(gc, np.ones(50) / 50, mode="same")
        rng = np.random.default_rng(20260905)

        methods = {
            # The ceiling: rank by the damage each base's worst substitution actually does,
            # which is exactly what the deletion curve then applies. Not a method under test --
            # it is the denominator. Its rank correlation against max |effect| is NOT 1 by
            # construction, and that gap is worth seeing: the two orderings differ wherever a
            # base's largest effect is an increase.
            "oracle": (damage, 1),
            "grad": (np.abs(gi), 1),
            "ig": (np.abs(ig), 1),
            "occl": (np.abs(oc), OCCL_BP),
            "rollout": (np.abs(ro) if ro is not None else None, ROLLOUT_BP),
            "stem": (st, 1),
            "gc": (gc, 1),
            "tssdist": (-np.abs(np.arange(SEQ_LEN) - tss).astype(float), 1),
            "random": (rng.random(SEQ_LEN), 1),
        }

        row = {"id": lid, "igCompletenessAbs": round(gap_abs, 5),
               "igTarget": round(gap_target, 5),
               "igCompletenessRel": (round(abs(gap_abs / gap_target) * 100, 3)
                                     if abs(gap_target) > 1e-9 else None)}
        for name, (v, bp) in methods.items():
            if v is None:
                row[name] = None
                continue
            # rank agreement at the METHOD's resolution, ISM pooled to match
            t_pooled = pool_to(truth, bp) if bp > 1 else truth
            v_pooled = v if len(v) == len(t_pooled) else pool_to(v, bp)
            rho = spearman(v_pooled, t_pooled)
            # per-base ordering for the deletion curve; a coarse method orders within a block by
            # position, which is exactly the handicap its resolution imposes
            full = np.repeat(v, bp)[:SEQ_LEN] if len(v) < SEQ_LEN else v
            order = np.argsort(-full)
            ks, drop = deletion_curve(runner, L, species, order, worst, lo, hi, rc_lo, rc_hi)
            row[name] = {"rho": round(rho, 4), "drop": [round(float(d), 4) for d in drop]}
            curves.setdefault(name, []).append(drop)
        row["deletionK"] = ks
        rows.append(row)
        print(f"  {lid:10s} {time.time() - t0:5.1f}s  "
              f"grad rho={row['grad']['rho']:+.3f}  ig rho={row['ig']['rho']:+.3f}  "
              f"occl rho={row['occl']['rho']:+.3f}  "
              f"rollout rho={row['rollout']['rho'] if row['rollout'] else float('nan'):+.3f}",
              flush=True)

    # ---- aggregate ---------------------------------------------------------------------------
    # One denominator per locus, shared by every method: what ranking by the answer achieves.
    denom = np.array([r["oracle"]["drop"][-1] for r in rows], dtype=np.float64)
    denom = np.where(np.abs(denom) < 1e-9, 1.0, denom)

    def auc(name):
        """Area under the deletion curve, in units of the oracle's own final drop.

        1.0 is the exact-ISM ranking. A method above the baselines has ordered the bases better
        than GC content, distance to TSS or chance; a method near 0 has not.
        """
        a = np.array([r[name]["drop"] for r in rows if r.get(name)], dtype=np.float64)
        d = denom[[i for i, r in enumerate(rows) if r.get(name)]]
        norm = a / d[:, None]
        return float(np.mean(np.trapezoid(norm, dx=1.0) / (norm.shape[1] - 1)))

    scorecard = []
    for name in ["oracle", "grad", "ig", "occl", "rollout", "stem", "gc", "tssdist", "random"]:
        vals = [r[name]["rho"] for r in rows if r.get(name)]
        if not vals:
            continue
        scorecard.append({
            "method": name,
            "medianRho": round(float(np.median(vals)), 4),
            "minRho": round(float(np.min(vals)), 4),
            "maxRho": round(float(np.max(vals)), 4),
            "deletionAucRaw": round(auc(name), 5),
            "resolutionBp": {"occl": OCCL_BP, "rollout": ROLLOUT_BP}.get(name, 1),
        })
    # Expressed as a fraction of the oracle's own curve, so the column reads as "how much of the
    # achievable damage did this ranking find". The raw figure is kept beside it.
    oracle_auc = next((r["deletionAucRaw"] for r in scorecard if r["method"] == "oracle"), None)
    scale = oracle_auc if oracle_auc and abs(oracle_auc) > 1e-9 else 1.0
    for r in scorecard:
        r["deletionAuc"] = round(r["deletionAucRaw"] / scale, 4)
    scorecard.sort(key=lambda r: -r["deletionAuc"])

    # `stem` sits with the baselines, not with the methods under test: the conv stem is linear and
    # unnormalised, so its filters are a basis any invertible recombination leaves unchanged, and
    # "filter #37's consensus" is an artefact of where the optimiser landed. It is a motif-scan
    # baseline in the sense the portfolio means, not a model explanation.
    BASELINES = ("gc", "random", "tssdist", "stem")
    base = max(r["deletionAuc"] for r in scorecard if r["method"] in BASELINES)
    # The oracle is the scale, not a competitor.
    for r in scorecard:
        r["beatsBaselines"] = bool(r["deletionAuc"] > base and r["method"] != "oracle"
                                   and r["method"] not in BASELINES)
        r["role"] = ("ceiling" if r["method"] == "oracle"
                     else "baseline" if r["method"] in BASELINES else "method")

    if not args.skip_randomization:
        print("  cascading parameter randomization (Adebayo et al. 2018), head first:")
        randomization = randomization_sweep(runner, pack, species, loci, RANDOMIZE_LOCI)

    out = {
        "note": ("Every shipped attribution scored against the exact single-base mutagenesis "
                 "planes: rank agreement at each method's own native resolution, and a deletion "
                 "curve driven by real forward passes. A method is promoted only if it beats the "
                 "strongest non-model baseline."),
        "fold": args.fold,
        "loci": len(rows),
        "deletionK": DELETION_K,
        "baselineAuc": round(base, 4),
        "baselines": list(BASELINES),
        "oracleAucRaw": round(scale, 5),
        "scorecard": scorecard,
        "igCompleteness": {
            "medianAbs": round(float(np.median([abs(r["igCompletenessAbs"]) for r in rows])), 5),
            "medianRelPct": round(float(np.median(
                [r["igCompletenessRel"] for r in rows if r["igCompletenessRel"] is not None])), 3),
            "note": ("Reported absolutely as well as relatively: where the target gap is near "
                     "zero a 0.04 miss reads as a several-hundred-percent error."),
        },
        "randomization": randomization,
        "randomizationLoci": RANDOMIZE_LOCI if randomization else 0,
        "perLocus": rows,
    }
    dest = Path(args.out) if args.out else OUT
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"\n  {'method':10s} {'res':>5s} {'median rho':>11s} {'deletion AUC':>13s}  verdict")
    for r in scorecard:
        verdict = ({"ceiling": "— (the scale)", "baseline": "— (baseline)"}
                   .get(r["role"], "promote" if r["beatsBaselines"] else "DEMOTE"))
        print(f"  {r['method']:10s} {r['resolutionBp']:4d}b {r['medianRho']:+11.3f} "
              f"{r['deletionAuc']:13.4f}  {verdict}")
    print(f"\n  elapsed {(time.time() - t_start) / 60:.1f} min")
    print(f"wrote {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
