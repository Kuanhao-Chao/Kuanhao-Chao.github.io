"""A model-conditioned null for the compact motif panel.

THE DEFECT THIS FIXES. `make_modisco.py`'s control calls
`seqlets_only(..., shuffle_rng=rng)`, which dinucleotide-shuffles the SEQUENCE STRING used for
the saliency projection and the reference-base choice -- while `planes[pid]`, the mutagenesis
contributions, stay the ones computed on the REAL window. So the null arm is "real model
attributions read against shuffled letters", and the real arm is "real model attributions read
against real letters". Those are not the same quantity measured under two conditions; the model
never saw the shuffled sequence at all. Exceeding that arm's 99.9th percentile therefore says
much less than the page claimed.

A matched null has to perturb the model's INPUT and recompute. This writes those planes.

TWO ARMS, ONE QUANTITY EACH SIDE

  * grad (all 23 loci, real + `--shuffles` dinucleotide draws each): one forward and one backward
    pass per sequence. The plane is stored in exactly the mutagenesis convention -- entry [b, i]
    is the estimated effect of substituting position i to base b, and the reference row is zero
    by construction -- so `saliency`, `centred` and `extract_seqlets` are drop-in and the two
    arms differ only in which sequence the model was run on.

        grad_plane[b, i] = dg/dx[i, b] - dg/dx[i, ref_i]

    which is the first-order estimate of exactly what the ISM plane holds exactly.

  * ism-slice (a few loci, a promoter window): the same contrast computed by exhaustive
    substitution rather than by a derivative, on real and shuffled input. This is the bridge:
    if the cheap grad null and the expensive ISM null agree on cluster yield, the cheap one can
    carry the comparison. A whole-window ISM per shuffle is ~20 min, which is why it is a slice
    and a subset rather than the primary null.

Output: _scratch/modisco-null/<id>-{grad,ismslice}-{real,sN}.npy   (gitignored)
Usage:  python3 scripts/shorkie/make_null_planes.py [--shuffles 5] [--bridge-loci 3]
"""

from __future__ import annotations

import argparse
import random
import sys
import time
from pathlib import Path

import numpy as np
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
from common import SCRATCH, SEQ_LEN, N_BINS, BASE_IDX  # noqa: E402

NULL_DIR = SCRATCH / "modisco-null"


def seed_for(locus_id: str, salt: int) -> int:
    """A seed keyed on the LOCUS, not on its index in whatever list was filtered.

    Two failure modes are avoided at once. Indexing by position means `--only X` and a full run
    give X different shuffles, so a cached plane and a fresh one silently disagree. And Python's
    `hash()` is salted per process unless PYTHONHASHSEED is fixed, which is the trap the causal
    tracing generator already documents. `crc32` is stable across processes and versions.
    """
    return zlib.crc32(locus_id.encode()) ^ salt
BRIDGE_BP = 2048          # the promoter slice the exhaustive bridge covers


def grad_plane(runner, seq, species, lo, hi, rc_lo, rc_hi):
    """[4, 16384] in the mutagenesis convention: reference row zero, first-order alt effects."""
    x = common.encode(seq, species)
    gf, _ = runner.grad_x(x, lo, hi)
    gr, _ = runner.grad_x(common.rc_encoded(x), rc_lo, rc_hi)
    g = 0.5 * (gf + common.rc_grad_np(gr))                       # [16384, 4]
    s = seq[:SEQ_LEN]
    ref = np.zeros(SEQ_LEN, dtype=np.int64)
    has = np.zeros(SEQ_LEN, dtype=bool)
    for i, c in enumerate(s):
        if c in BASE_IDX:
            ref[i] = BASE_IDX[c]
            has[i] = True
    idx = np.arange(SEQ_LEN)
    out = (g - g[idx, ref][:, None]).T                           # [4, 16384]
    out[ref, idx] = 0.0
    out[:, ~has] = 0.0            # positions with no base carry no substitution effect
    return out


def ism_slice(runner, seq, species, lo, hi, rc_lo, rc_hi, a, b, batch=32):
    """Exhaustive substitution over [a, b): the same contrast the grad plane estimates."""
    torch, device = runner.torch, runner.device
    x = common.encode(seq, species)
    fwd = torch.from_numpy(np.repeat(x[None], batch, axis=0)).to(device)
    rev = torch.from_numpy(np.repeat(common.rc_encoded(x)[None], batch, axis=0)).to(device)

    def cov(t, p, q, n):
        with torch.no_grad():
            y, _ = runner.model(t)
        return y[:n, p:q, :].mean(dim=-1).sum(dim=-1).float().cpu().numpy()

    ref_f = float(cov(fwd, lo, hi, 1)[0])
    ref_r = float(cov(rev, rc_lo, rc_hi, 1)[0])
    ref_of = np.array([BASE_IDX.get(c, 0) for c in seq[:SEQ_LEN]])
    jobs = [(i, q) for i in range(a, b) if seq[i] in BASE_IDX
            for q in range(4) if q != ref_of[i]]
    plane = np.zeros((4, b - a))
    for s in range(0, len(jobs), batch):
        chunk = jobs[s:s + batch]; n = len(chunk)
        ci = torch.arange(n, device=device)
        pos = torch.as_tensor([i for i, _ in chunk], device=device)
        alt = torch.as_tensor([q for _, q in chunk], device=device)
        rb = torch.as_tensor(ref_of[[i for i, _ in chunk]], device=device)
        mp, ma, mr = SEQ_LEN - 1 - pos, 3 - alt, 3 - rb
        fwd[ci, pos, rb] = 0.0; fwd[ci, pos, alt] = 1.0
        rev[ci, mp, mr] = 0.0; rev[ci, mp, ma] = 1.0
        af = cov(fwd, lo, hi, n); ar = cov(rev, rc_lo, rc_hi, n)
        fwd[ci, pos, alt] = 0.0; fwd[ci, pos, rb] = 1.0
        rev[ci, mp, ma] = 0.0; rev[ci, mp, mr] = 1.0
        for k, (i, q) in enumerate(chunk):
            plane[q, i - a] = 0.5 * ((np.log2(af[k] + 1) - np.log2(ref_f + 1))
                                     + (np.log2(ar[k] + 1) - np.log2(ref_r + 1)))
    return plane


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shuffles", type=int, default=5)
    ap.add_argument("--bridge-loci", type=int, default=3)
    ap.add_argument("--bridge-shuffles", type=int, default=3)
    ap.add_argument("--device", default=None)
    ap.add_argument("--fold", default="f0")
    ap.add_argument("--skip-bridge", action="store_true")
    ap.add_argument("--only", default=None, help="one locus id, for a smoke test")
    args = ap.parse_args()

    import torch
    device = args.device or ("mps" if torch.backends.mps.is_available() else "cpu")
    pack = common.loci_pack(); species = pack["speciesIndex"]
    loci = [L for L in pack["loci"] if not args.only or L["id"] == args.only]
    runner = common.Runner(common.fold_checkpoint(args.fold), device)
    NULL_DIR.mkdir(parents=True, exist_ok=True)
    print(f"device: {device}  fold: {args.fold}  {args.shuffles} shuffles x {len(loci)} loci")

    t0 = time.time()
    for n, L in enumerate(loci):
        lid = L["id"]
        seq = L["sequence"].upper()
        lo, hi = common.gene_body_bins(L["features"], lid)
        rc_lo, rc_hi = N_BINS - hi, N_BINS - lo
        rng = random.Random(seed_for(lid, 90501))
        p = NULL_DIR / f"{lid}-grad-real.npy"
        if not p.exists():
            np.save(p, grad_plane(runner, seq, species, lo, hi, rc_lo, rc_hi))
        for k in range(args.shuffles):
            q = NULL_DIR / f"{lid}-grad-s{k}.npy"
            s = common.dinuc_shuffle(seq, rng)
            if not q.exists():
                np.save(q, grad_plane(runner, s, species, lo, hi, rc_lo, rc_hi))
                np.save(NULL_DIR / f"{lid}-grad-s{k}.seq.npy", np.frombuffer(s.encode(), dtype="S1"))
        print(f"  {lid:10s} grad real + {args.shuffles} shuffles", flush=True)
    print(f"grad arm: {time.time() - t0:.0f}s")

    if args.skip_bridge:
        return 0
    # The bridge: the same contrast by exhaustive substitution, on a promoter slice.
    t1 = time.time()
    for n, L in enumerate(loci[:args.bridge_loci]):
        lid = L["id"]
        seq = L["sequence"].upper()
        lo, hi = common.gene_body_bins(L["features"], lid)
        rc_lo, rc_hi = N_BINS - hi, N_BINS - lo
        tss = common.tss_of(L["features"], lid)
        a = max(0, min(SEQ_LEN - BRIDGE_BP, tss - BRIDGE_BP // 2))
        b = a + BRIDGE_BP
        np.save(NULL_DIR / f"{lid}-ismslice-span.npy", np.array([a, b]))
        rng = random.Random(seed_for(lid, 70701))
        for k in range(args.bridge_shuffles):
            q = NULL_DIR / f"{lid}-ismslice-s{k}.npy"
            s = common.dinuc_shuffle(seq, rng)
            if q.exists():
                continue
            tk = time.time()
            np.save(q, ism_slice(runner, s, species, lo, hi, rc_lo, rc_hi, a, b))
            np.save(NULL_DIR / f"{lid}-ismslice-s{k}.seq.npy",
                    np.frombuffer(s[a:b].encode(), dtype="S1"))
            print(f"  {lid:10s} ism slice shuffle {k}  {time.time() - tk:.0f}s", flush=True)
    print(f"bridge arm: {(time.time() - t1) / 60:.1f} min")
    print(f"wrote {NULL_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
