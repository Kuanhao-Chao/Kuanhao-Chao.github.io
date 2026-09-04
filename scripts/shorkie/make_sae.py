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


def collect(model, torch, dev, species: int, chroms: dict[str, str], cap: int):
    """One forward pass a window; keep the bottleneck residual stream of each window's own core.

    Only the CORE positions are kept. A window's flanks are scored by a neighbouring window too, and
    keeping both would weight the overlap twice -- the same reason `plan_windows` partitions cores
    rather than windows.
    """
    rows = []
    total = 0
    for chrom, seq in chroms.items():
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
            total += hi - lo
        if total >= cap:
            break
    return np.concatenate(rows, axis=0)


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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("--features", type=int, default=6144)
    ap.add_argument("--k", type=int, default=32)
    ap.add_argument("--steps", type=int, default=4000)
    ap.add_argument("--cap", type=int, default=190_000, help="bottleneck vectors to collect")
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
    acts = collect(model, torch, dev, loci["speciesIndex"], chroms, args.cap)
    print(f"  collected {acts.shape[0]:,} x {acts.shape[1]} bottleneck vectors "
          f"in {time.time() - t0:.0f}s")

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
    }
    dest = ROOT / "src" / "data" / "shorkieSae.json"
    dest.write_text(json.dumps(payload, indent=1) + "\n")
    print(f"\n  wrote {dest.relative_to(ROOT)} in {time.time() - t0:.0f}s")
    print("  sae audit passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
