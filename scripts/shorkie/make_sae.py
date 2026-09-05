"""
A sparse dictionary for the bottleneck: are the model's internal features monosemantic?

The layer panel on this page draws every channel of a stage as a row, and the traceback ranks
channels by relevance. Both take the network's own basis for granted. That basis has no reason to be
interpretable: a channel is a direction the optimiser happened to land on, and in a network with
more concepts than channels the concepts sit in SUPERPOSITION -- spread across non-orthogonal
directions, so one channel fires for a binding site and a splice donor and nothing connects them
(Elhage et al. 2022).

A sparse autoencoder looks for a better basis. Train an overcomplete dictionary on the bottleneck's
384-dimensional residual stream with a hard sparsity constraint, and the directions it finds are
under pressure to each mean one thing:

    z = TopK( W_enc (h - b_dec) + b_enc,  k )        h_hat = W_dec z + b_dec

TopK rather than an L1 penalty (Gao et al. 2024): L1 shrinks the values it keeps as well as the ones
it zeroes, so the reconstruction and the sparsity fight each other and the trade-off has to be tuned.
TopK fixes the count and leaves the magnitudes alone, so `k` is a stated property of the run rather
than a hyperparameter someone swept.

**The scale is small, which is the whole reason this is affordable here.** The bottleneck is 128
positions x 384 channels, and there are ~1,493 genome windows, so the training set is ~191k vectors
of dimension 384 -- about 293 MB, minutes on a laptop GPU. Collecting it costs one forward pass a
window.

**Two controls, and the second one can come out negative.**

  1. An SAE trained on SHUFFLED activations must not yield interpretable features. If it does, the
     interpretation is coming from the annotation scoring rather than from the dictionary.
  2. The features are scored against annotation classes with the same circular-shift null the rest
     of this page uses -- and so are the RAW 384 channels. If the raw channels enrich as well as the
     dictionary does, the SAE bought nothing, and that comparison is published whichever way it
     lands. This is the honest question and it is easy to avoid asking.

Output:
    src/data/shorkieSae.json         the dictionary's statistics, its features, and both controls
    public/vp-data/<id>-sae.png      per locus, the top features at bottleneck resolution

Deliberately NOT per base. A feature is a bottleneck quantity at 128 bp a position; writing it per
base would be storing 128 copies of one number and drawing a resolution the dictionary does not have.

Usage:  python3 scripts/shorkie/make_sae.py <ckpt.h5> [--features 6144] [--k 32] [--steps 4000]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

from make_attribution import encode                      # noqa: E402
from make_genome_track import plan_windows, read_fasta   # noqa: E402

SCRATCH = Path(__file__).resolve().parent / "_scratch"
SEQ_LEN = 16384
BOTTLENECK = 128
D_MODEL = 384
# The residual stream after the last transformer layer: the deepest point at which the
# representation is still positional, and the one the decoder reads.
LAYER = "attn_out8"
POS_BP = SEQ_LEN // BOTTLENECK          # 128 bp a bottleneck position
TOP_CELLS = 48                          # top-activating cells kept per feature
KMER = 6
SHIFTS = 256


def collect(model, torch, dev, species: int, chroms: dict[str, str], cap: int):
    """One forward pass a window; keep the bottleneck residual stream of each window's own core.

    Only the CORE positions are kept. A window's flanks are scored by a neighbouring window too, and
    keeping both would weight the overlap twice -- the same reason `plan_windows` partitions cores
    rather than windows.
    """
    rows = []
    # Where each kept vector came from, so a feature's top activations can be turned back into
    # sequence and scored against the annotation. Discarding this is what made the first version
    # of this script able to report a reconstruction and nothing else.
    coords: list[tuple[int, int]] = []
    names = list(chroms)
    total = 0
    for ci, chrom in enumerate(names):
        seq = chroms[chrom]
        for wstart, c0, c1 in plan_windows(len(seq)):
            if total >= cap:
                break
            sub = seq[wstart:wstart + SEQ_LEN]
            if len(sub) < SEQ_LEN:
                sub = sub + "N" * (SEQ_LEN - len(sub))
            x = torch.from_numpy(encode(sub, species)).to(dev)
            with torch.no_grad():
                _, acts = model(x, want_intermediates=True)
            h = acts[LAYER][0]                                  # [128, 384]
            lo = max(0, (c0 - wstart) * BOTTLENECK // SEQ_LEN)
            hi = min(BOTTLENECK, max(lo + 1, (c1 - wstart) * BOTTLENECK // SEQ_LEN))
            rows.append(h[lo:hi].detach().to("cpu").numpy().astype(np.float32))
            for j in range(lo, hi):
                coords.append((ci, wstart + j * POS_BP))
            total += hi - lo
        if total >= cap:
            break
    return np.concatenate(rows, axis=0), np.array(coords, dtype=np.int64), names


def train_sae(torch, acts: np.ndarray, n_features: int, k: int, steps: int, dev: str, seed: int):
    """A TopK sparse autoencoder. Returns the module and its statistics."""
    g = torch.Generator(device="cpu").manual_seed(seed)
    X = torch.from_numpy(acts)
    mean = X.mean(dim=0, keepdim=True)
    scale = X.std().clamp_min(1e-6)
    # The training set stays on the CPU and batches move across. 190k x 384 is only ~292 MB, but a
    # shared GPU is shared: this run died twice at 19 GB of "other allocations" -- a Playwright gate
    # and a site build on the same machine -- and a generator that only completes when nothing else
    # is running is a generator that will not be re-run.
    Xn = (X - mean) / scale

    W_enc = torch.nn.Parameter((torch.randn(D_MODEL, n_features, generator=g) * 0.02).to(dev))
    b_enc = torch.nn.Parameter(torch.zeros(n_features, device=dev))
    b_dec = torch.nn.Parameter(torch.zeros(D_MODEL, device=dev))
    # Tied initialisation, then untied training: starting the decoder as the encoder's transpose is
    # what stops the first few hundred steps being spent discovering that a dictionary should
    # reconstruct its input.
    W_dec = torch.nn.Parameter(W_enc.detach().T.clone())
    opt = torch.optim.Adam([W_enc, b_enc, b_dec, W_dec], lr=3e-4)

    n = Xn.shape[0]
    batch = min(4096, n)
    fired = torch.zeros(n_features, device=dev)
    for step in range(steps):
        idx = torch.randint(0, n, (batch,))
        h = Xn[idx].to(dev)
        pre = (h - b_dec) @ W_enc + b_enc
        # TopK: keep the k largest, zero the rest. No L1, so the kept magnitudes are untouched.
        vals, ind = torch.topk(pre, k, dim=-1)
        z = torch.zeros_like(pre).scatter_(-1, ind, torch.relu(vals))
        recon = z @ W_dec + b_dec
        loss = ((recon - h) ** 2).mean()
        opt.zero_grad()
        loss.backward()
        opt.step()
        with torch.no_grad():
            # Unit-norm decoder columns. Without this the model can shrink a feature's activation
            # and grow its direction to compensate, which makes the activations meaningless as a
            # measure of how strongly a feature fired.
            W_dec.div_(W_dec.norm(dim=-1, keepdim=True).clamp_min(1e-6))
            fired.scatter_add_(0, ind.reshape(-1), torch.ones(ind.numel(), device=dev))

    # The final statistics pass is BATCHED. Run whole, it materialises an n x n_features matrix --
    # 190,000 x 6,144 is 4.7 GB of float32, twice over for the TopK scatter, and it takes the GPU
    # out of memory at the last step of a twenty-minute run. Nothing here needs every row at once.
    with torch.no_grad():
        mu = Xn.mean(dim=0).to(dev)
        num = torch.zeros((), device=dev)
        den = torch.zeros((), device=dev)
        nz = torch.zeros((), device=dev)
        seen = 0
        for i0 in range(0, n, batch):
            h = Xn[i0:i0 + batch].to(dev)
            pre = (h - b_dec) @ W_enc + b_enc
            vals, ind = torch.topk(pre, k, dim=-1)
            z = torch.zeros_like(pre).scatter_(-1, ind, torch.relu(vals))
            recon = z @ W_dec + b_dec
            num += ((recon - h) ** 2).sum()
            den += ((h - mu) ** 2).sum()
            nz += (z > 0).float().sum()
            seen += h.shape[0]
        # Fraction of variance unexplained -- the reconstruction quality, in the units that matter.
        fvu = float(num / den.clamp_min(1e-12))
        alive = int((fired > 0).sum())
        l0 = float(nz / max(1, seen))
    return {"W_enc": W_enc.detach(), "b_enc": b_enc.detach(), "W_dec": W_dec.detach(),
            "b_dec": b_dec.detach(), "mean": mean, "scale": scale}, {
        "fvu": round(fvu, 4), "alive": alive, "dead": n_features - alive,
        "meanL0": round(l0, 2), "vectors": int(n), "features": n_features, "k": k, "steps": steps}


# ------------------------------------------------------------------------------------------------
# Interpretation: what does a feature respond to, and does it correspond to anything biological?
# ------------------------------------------------------------------------------------------------

def encode_all(torch, sae, acts, dev, k, batch=4096):
    """Feature activations for every collected vector, batched. Returns a CPU float32 [n, D]."""
    Xn = (torch.from_numpy(acts) - sae["mean"]) / sae["scale"]
    out = torch.empty((Xn.shape[0], sae["W_enc"].shape[1]), dtype=torch.float32)
    with torch.no_grad():
        for i0 in range(0, Xn.shape[0], batch):
            h = Xn[i0:i0 + batch].to(dev)
            pre = (h - sae["b_dec"]) @ sae["W_enc"] + sae["b_enc"]
            vals, ind = torch.topk(pre, k, dim=-1)
            z = torch.zeros_like(pre).scatter_(-1, ind, torch.relu(vals))
            out[i0:i0 + batch] = z.to("cpu")
    return out.numpy()


def kmer_signature(seqs: list[str], background: dict[str, float], k: int, top: int = 3):
    """The k-mers a feature's top cells are enriched for, over a genome-wide background.

    NOT a position weight matrix. A bottleneck cell is 128 bp, and a PWM over 128 bp of sequence is
    near-uniform whichever way it is built -- the same failure that produced 0.00-bit "motifs" in
    the first motif-discovery run, which still matched JASPAR at r = 0.93 because Pearson normalises
    amplitude away. A k-mer count is the honest summary at this resolution: it says what the cell
    CONTAINS without claiming to know where.
    """
    counts: dict[str, int] = {}
    total = 0
    for s in seqs:
        for i in range(len(s) - k + 1):
            km = s[i:i + k]
            if "N" in km:
                continue
            counts[km] = counts.get(km, 0) + 1
            total += 1
    if total == 0:
        return []
    out = []
    for km, c in counts.items():
        bg = background.get(km, 0.0)
        if bg <= 0 or c < 4:
            continue
        out.append((km, (c / total) / bg, c))
    out.sort(key=lambda r: -r[1])
    return [{"kmer": m, "enrichment": round(e, 2), "count": n} for m, e, n in out[:top]]


def enrichment(signal: np.ndarray, weight: np.ndarray, shifts: int = SHIFTS):
    """The page's own statistic: mean |signal| on `weight` over mean |signal| everywhere.

    Reimplemented in Python because the signal here is 94,970 positions x 6,144 features and cannot
    be computed in a browser -- `make_lm_summary.py` is the precedent for the same trade.

    The offsets are IDENTICAL to the TypeScript `circularShiftOffsets`, and that is checked rather
    than assumed (see `assert_offsets_agree`): the divisor is `shifts + 1 = 257`, which is prime and
    divides neither array length in use, so `i*n/257` always reduces to an odd denominator and can
    never be exactly one half -- there is nothing for JavaScript's round-half-up and Python's
    round-half-to-even to disagree about.
    """
    n = min(len(signal), len(weight))
    s = np.abs(signal[:n]).astype(np.float64)
    w = weight[:n].astype(np.float64)
    if w.sum() <= 0 or s.sum() <= 0:
        return None
    background = s.sum() / n
    obs = float((s * w).sum() / w.sum()) / background
    offs = [int(round(i * n / (shifts + 1))) % n for i in range(1, shifts + 1)]
    offs = [o for o in offs if o != 0]
    null = np.empty(len(offs))
    for j, o in enumerate(offs):
        null[j] = float((s * np.roll(w, o)).sum() / w.sum()) / background
    ge = int((null >= obs).sum())
    return {"ratio": round(obs, 3), "nullMean": round(float(null.mean()), 3),
            "nullSd": round(float(null.std()), 3), "p": round((ge + 1) / (len(offs) + 1), 4)}


def enrichment_batch(signals: np.ndarray, weight: np.ndarray, shifts: int):
    """`enrichment` for many candidates at once: ratio and empirical p per column of `signals`.

    Same statistic, restructured so the null is a matmul. Done candidate by candidate it is
    `candidates x classes x shifts` rolls of a 95,000-element array -- 98 billion element operations,
    minutes to hours. Rolling the WEIGHT once per shift and multiplying it into every candidate at
    once makes it one BLAS matvec per (class, shift): the same 98 GFLOP, but as a matmul.
    """
    n = min(signals.shape[0], len(weight))
    s = np.abs(signals[:n]).astype(np.float64)                 # [n, C]
    w = weight[:n].astype(np.float64)
    wsum = w.sum()
    if wsum <= 0:
        return None
    background = s.sum(axis=0) / n                             # [C]
    ok = background > 0
    obs = np.zeros(s.shape[1])
    obs[ok] = (w @ s)[ok] / wsum / background[ok]
    offs = [int(round(i * n / (shifts + 1))) % n for i in range(1, shifts + 1)]
    offs = [o for o in offs if o != 0]
    ge = np.zeros(s.shape[1], dtype=np.int64)
    for o in offs:
        null = np.zeros(s.shape[1])
        null[ok] = (np.roll(w, o) @ s)[ok] / wsum / background[ok]
        ge += (null >= obs)
    return obs, (ge + 1) / (len(offs) + 1)


def assert_offsets_agree(n: int, shifts: int = SHIFTS) -> None:
    """No exact halves, so Python and JavaScript produce the same circular shifts.

    CLAUDE.md requires this be RE-CHECKED whenever either constant moves, not inherited from the
    16,384-length case it was first established for.
    """
    from fractions import Fraction
    d = shifts + 1
    halves = [i for i in range(1, shifts + 1) if Fraction(i * n, d) % 1 == Fraction(1, 2)]
    if halves:
        raise SystemExit(
            f"circular-shift offsets would differ between Python and JavaScript at n={n:,}: "
            f"{len(halves)} exact halves (first at i={halves[0]}). The published enrichment would "
            f"not be reproducible from the browser implementation.")


def class_masks(coords: np.ndarray, names: list[str], chroms: dict[str, str]):
    """A per-class coverage weight for every collected bottleneck cell.

    Pooled by MEAN, never max: a cell is 128 bp and a 7 bp binding site covers 5% of it. A max marks
    the whole cell annotated and makes every class look identical once pooled -- numbers that mean
    nothing while looking exactly like numbers that do.
    """
    gd = ROOT / "public" / "genome-data"
    out: dict[str, np.ndarray] = {}
    per_chrom: dict[int, dict[str, np.ndarray]] = {}
    for ci, chrom in enumerate(names):
        f = gd / chrom / "features.json"
        if not f.exists():
            continue
        data = json.loads(f.read_text())
        n = len(chroms[chrom])
        per_chrom[ci] = {}
        for cls, rows in data.get("classes", {}).items():
            cov = np.zeros((n + POS_BP) // POS_BP + 1, dtype=np.float64)
            for r in rows:
                start, length = int(r[0]), int(r[1])
                a, b = start, start + max(1, length)
                # Spread the feature's coverage across the cells it touches, in bases.
                for cell in range(a // POS_BP, min(len(cov) - 1, b // POS_BP + 1)):
                    lo, hi = cell * POS_BP, (cell + 1) * POS_BP
                    cov[cell] += max(0, min(b, hi) - max(a, lo))
            per_chrom[ci][cls] = np.clip(cov / POS_BP, 0.0, 1.0)
    classes = sorted({c for m in per_chrom.values() for c in m})
    for cls in classes:
        w = np.zeros(len(coords), dtype=np.float64)
        for i, (ci, bp) in enumerate(coords):
            m = per_chrom.get(int(ci), {}).get(cls)
            if m is None:
                continue
            cell = int(bp) // POS_BP
            if 0 <= cell < len(m):
                w[i] = m[cell]
        if w.sum() > 0:
            out[cls] = w
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("--features", type=int, default=6144)
    ap.add_argument("--k", type=int, default=32)
    ap.add_argument("--steps", type=int, default=4000)
    ap.add_argument("--cap", type=int, default=190_000, help="bottleneck vectors to collect")
    ap.add_argument("--top-features", type=int, default=64,
                    help="features to interpret in depth (all are scored against annotation)")
    ap.add_argument("--device", default=None)
    args = ap.parse_args()

    import torch
    from shorkie_torch import build

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    fa = SCRATCH / "sacCer3.fa"
    if not fa.exists():
        raise SystemExit(f"{fa} not found — the genome sweep needs it")
    chroms = read_fasta(fa)

    dev = args.device or ("mps" if torch.backends.mps.is_available() else "cpu")
    model, _ = build(args.checkpoint)
    n_par = sum(p.numel() for p in model.parameters())
    n_bn = sum(b.numel() for n, b in model.named_buffers() if "running" in n)
    if n_par + n_bn != 14_253_567:
        raise SystemExit(f"{args.checkpoint} is not fold-f0 ({n_par + n_bn:,} values)")
    model.eval().to(dev)

    t0 = time.time()
    acts, coords, names = collect(model, torch, dev, loci["speciesIndex"], chroms, args.cap)
    print(f"  collected {acts.shape[0]:,} x {acts.shape[1]} bottleneck vectors "
          f"in {time.time() - t0:.0f}s")
    # Re-checked here, not inherited: the enrichment below is computed in Python and published as
    # if the browser could reproduce it.
    assert_offsets_agree(acts.shape[0])

    sae, stats = train_sae(torch, acts, args.features, args.k, args.steps, dev, seed=0)
    print(f"  SAE: FVU {stats['fvu']:.4f}, {stats['alive']:,} of {args.features:,} features alive, "
          f"mean L0 {stats['meanL0']}")

    # Control 1: the same training on SHUFFLED activations. Each column is permuted independently,
    # which keeps every channel's marginal distribution exactly and destroys the co-activation
    # structure a dictionary exists to find. A dictionary that reconstructs this as well as the
    # real thing is not finding structure, it is memorising a distribution.
    rng = np.random.default_rng(3)
    shuffled = acts.copy()
    for c in range(shuffled.shape[1]):
        rng.shuffle(shuffled[:, c])
    _, ctl_stats = train_sae(torch, shuffled, args.features, args.k, args.steps, dev, seed=0)
    print(f"  control (shuffled activations): FVU {ctl_stats['fvu']:.4f}, "
          f"{ctl_stats['alive']:,} alive, mean L0 {ctl_stats['meanL0']}")

    # ---------------------------------------------------------------------------------------
    # Interpretation. Everything below needs the trained weights, which the first version of this
    # script threw away -- so they are saved first, and re-running the analysis costs seconds
    # rather than an eleven-minute retrain. Same reason `make_ism.py --repack` keeps its raw plane.
    # ---------------------------------------------------------------------------------------
    SCRATCH.mkdir(exist_ok=True)
    np.savez(SCRATCH / "sae.npz",
             **{k: v.to("cpu").numpy() for k, v in sae.items()}, coords=coords,
             names=np.array(names))

    z = encode_all(torch, sae, acts, dev, args.k)
    print(f"  encoded {z.shape[0]:,} positions x {z.shape[1]:,} features")

    # A genome-wide k-mer background, so a feature's k-mers are enriched against something.
    bg_counts: dict[str, int] = {}
    bg_total = 0
    for chrom in names:
        s = chroms[chrom]
        for i in range(0, len(s) - KMER + 1, 7):        # strided: a background, not a census
            km = s[i:i + KMER]
            if "N" in km:
                continue
            bg_counts[km] = bg_counts.get(km, 0) + 1
            bg_total += 1
    background = {k: v / bg_total for k, v in bg_counts.items()}

    masks = class_masks(coords, names, chroms)
    print(f"  {len(masks)} annotation classes over the collected cells")

    # Rank features by how much total activation they carry, and interpret the top ones. All 6,144
    # are scored against the annotation; only the loudest get a k-mer signature, because that is a
    # per-feature sequence scan and the tail is mostly silent.
    strength = z.sum(axis=0)
    order = np.argsort(-strength)
    features = []
    for fi in order[:args.top_features]:
        col = z[:, fi]
        top = np.argsort(-col)[:TOP_CELLS]
        seqs = []
        for r in top:
            if col[r] <= 0:
                continue
            ci, bp = coords[r]
            s = chroms[names[int(ci)]][int(bp):int(bp) + POS_BP]
            if s:
                seqs.append(s)
        best = None
        for cls, w in masks.items():
            e = enrichment(col, w)
            if e and (best is None or e["ratio"] > best["ratio"]):
                best = {**e, "cls": cls}
        features.append({
            "index": int(fi),
            "cells": int((col > 0).sum()),
            "kmers": kmer_signature(seqs, background, KMER),
            "best": best,
        })

    # ---------------------------------------------------------------------------------------
    # The control that can come out negative: the SAME scoring on the RAW 384 channels. If the raw
    # basis grounds as well as the dictionary does, the dictionary bought nothing -- and that is
    # published either way, the way the counterfactual panel publishes the control that refutes it.
    # ---------------------------------------------------------------------------------------
    # MATCHED candidate counts and MATCHED nulls, or the comparison is rigged. There are 6,144
    # features and 384 channels, so a max over the dictionary is a max over sixteen times as many
    # candidates and would win on that alone; and a null with fewer shifts has a different p floor.
    # So the dictionary is represented by its strongest `dModel` features -- the same number as
    # there are channels -- and both arms use the same shift count.
    n_match = acts.shape[1]
    ctl_shifts = 64

    def best_over_classes(signals: np.ndarray):
        """Each candidate's best enrichment ratio over the annotation classes."""
        best = np.zeros(signals.shape[1])
        for w in masks.values():
            r = enrichment_batch(signals, w, ctl_shifts)
            if r is None:
                continue
            best = np.maximum(best, r[0])
        return best

    raw_best = list(best_over_classes(acts[:, :n_match].astype(np.float64)))
    sae_best = list(best_over_classes(z[:, order[:n_match]].astype(np.float64)))
    verdict = {
        "matchedCandidates": n_match,
        "shifts": ctl_shifts,
        "saeMedianBestRatio": round(float(np.median(sae_best)), 3) if sae_best else None,
        "saeMaxBestRatio": round(float(max(sae_best)), 3) if sae_best else None,
        "rawMedianBestRatio": round(float(np.median(raw_best)), 3) if raw_best else None,
        "rawMaxBestRatio": round(float(max(raw_best)), 3) if raw_best else None,
        "featuresScored": len(sae_best),
        "channelsScored": len(raw_best),
        # The honest headline: does the dictionary ground BETTER than the basis it replaced?
        "dictionaryWins": bool(sae_best and raw_best
                               and float(np.median(sae_best)) > float(np.median(raw_best))),
    }
    print(f"  grounding (matched at {n_match} candidates, {ctl_shifts} shifts):")
    print(f"    SAE features  median best {verdict['saeMedianBestRatio']}, "
          f"max {verdict['saeMaxBestRatio']}")
    print(f"    raw channels  median best {verdict['rawMedianBestRatio']}, "
          f"max {verdict['rawMaxBestRatio']}")
    print(f"    -> the dictionary "
          f"{'grounds better than' if verdict['dictionaryWins'] else 'does NOT beat'} "
          f"the raw basis")

    payload = {
        "note": ("A TopK sparse autoencoder on the bottleneck residual stream. The dictionary is "
                 "overcomplete and the sparsity is a hard count, so each direction is under "
                 "pressure to mean one thing. Trained again on column-shuffled activations as the "
                 "control: that arm keeps every channel's marginal distribution and destroys the "
                 "co-activation structure, so the gap between the two FVUs is what the dictionary "
                 "actually found."),
        "layer": LAYER,
        "dModel": D_MODEL,
        "positions": BOTTLENECK,
        "positionBp": SEQ_LEN // BOTTLENECK,
        "real": stats,
        "control": ctl_stats,
        "reconstructionGain": round(ctl_stats["fvu"] - stats["fvu"], 4),
        "kmer": KMER,
        "topCells": TOP_CELLS,
        "shifts": SHIFTS,
        "classes": sorted(masks),
        "features": features,
        "grounding": verdict,
    }
    dest = ROOT / "src" / "data" / "shorkieSae.json"
    dest.write_text(json.dumps(payload, indent=1) + "\n")
    print(f"\n  wrote {dest.relative_to(ROOT)} in {time.time() - t0:.0f}s")
    print("  sae audit passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
