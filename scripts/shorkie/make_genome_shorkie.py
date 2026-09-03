"""
Run the EXPRESSION model over the whole R64 genome, at the resolutions it actually has.

`/shorkie-lab/shorkie/` analyses 23 hand-picked 16 kb windows. This produces the same quantities for
all 12,157,105 bases, so the browser can show what Shorkie predicts anywhere and the 23 windows read
as zoom-ins rather than as the whole story.

**Measured on this machine (MPS, batch 1, fold-f0), 1,502 windows:**

    forward pass                          30 ms a window       45 s genome-wide
    gradient x input, rc-averaged        258 ms                6.5 min
    integrated gradients, 32 steps rc      8.2 s               3.4 h
    occlusion, 256 windows rc             15.4 s               6.4 h
    ISM, 3 subs x 16,384 x 2 strands   2,950 s            1,231 h  -- NOT FEASIBLE

ISM is 51 days and is not attempted. It stays a per-locus quantity, which is what the 23 windows
are for.

**Coverage is a SINGLE forward pass; every attribution is rc-averaged.** That split is not a
shortcut, it is what keeps the page self-consistent: `make_predictions.py` ships each locus's
coverage from one forward pass, so an rc-averaged genome-wide track would print a different number
for the same locus in two panels of the same page. The model is NOT reverse-complement equivariant
(`augment_rc: false`; the two strands' coverage sums differ by up to 2.5x), so the difference would
be large. Every published Shorkie *attribution* run passes `--rc`, and those follow it.

**Every pass writes at the model's OWN resolution, and this is not a size optimisation.** Shorkie's
head emits 896 bins of 16 bp, and occlusion ablates 64 bp at a time. Writing either per-base would
store 12,157,105 numbers carrying 760,000 (or 190,000) values of real information, and the browser
would draw an upsampled step function as though the model resolved single bases. Gradient x input
genuinely is per-base -- it is a derivative with respect to the one-hot input -- so it alone gets
base resolution.

**What the attribution differentiates.** Per locus, gradient x input is conditioned on a traced
region. Genome-wide there is no traced region, so the target is the T0-averaged coverage summed over
each window's cropped interior -- the only definition that is defined at every base. Gradients
superpose, so that is exactly the sum of the per-gene targets in view; it will NOT match the
per-locus page's numbers and the track's documentation says so.

**The first 1,024 bases of every chromosome have no Shorkie score, and nothing can be done about
it.** The head crops 1,024 bp from each end of its 16,384 bp window, and the first window cannot
start before position 0. That is 17,408 bases genome-wide (0.14%), recorded as `headCropBases` and
left as NO DATA rather than filled from a window that never scored them.

Windows sit on `plan_windows` from `make_genome_track.py`, the same cores the language model used,
so the two models' tracks are aligned base for base and can be read against each other.

Output (gitignored; `make_genome_tiles.py` turns it into what ships):
    _scratch/genome-track/<chrom>-sk-cov-<group>.npy    float32, 16 bp bins (5 arrays)
    _scratch/genome-track/<chrom>-sk-grad.npy           float32, per base, SIGNED
    _scratch/genome-track/<chrom>-sk-ig.npy             float32, per base, SIGNED
    _scratch/genome-track/<chrom>-sk-occl.npy           float32, 64 bp bins, SIGNED
    _scratch/genome-track/shorkie.json                  manifest

Usage:
    python3 scripts/shorkie/make_genome_shorkie.py <ckpt.h5> --pass coverage
    python3 scripts/shorkie/make_genome_shorkie.py <ckpt.h5> --pass gradient
    python3 scripts/shorkie/make_genome_shorkie.py <ckpt.h5> --pass ig --steps 32
    python3 scripts/shorkie/make_genome_shorkie.py <ckpt.h5> --pass occlusion --win 64
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

from make_genome_track import OUT, plan_windows, read_fasta          # noqa: E402
from make_attribution import encode, rc_input, rc_grad               # noqa: E402

SCRATCH = Path(__file__).resolve().parent / "_scratch"
SEQ_LEN = 16384
BIN_BP = 16                 # the head's own bin size: 896 bins x 16 bp = 14,336 bp
CROP_BP = 1024              # bases cropped from each window end before the 896 bins begin
N_BINS = 896
CKPT_SECONDS = 90.0         # checkpoint cadence; the long passes WILL be interrupted

# The four assay blocks in the released targets sheet's order (NOT the paper's), plus the T0
# baseline. `baseline` is the set every attribution here is scored on, so putting it in the same
# pass means the coverage lane and the gradient lane describe the same tracks.
GROUPS = [("chip_exo", 0, 1128), ("chip_mnase", 1128, 1148),
          ("rnaseq_tf", 1148, 4201), ("rnaseq_strain", 4201, 5215)]


def array_for(chrom: str, which: str, group: str | None = None) -> Path:
    return OUT / (f"{chrom}-sk-cov-{group}.npy" if which == "coverage"
                  else f"{chrom}-sk-{which}.npy")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("--pass", dest="which", required=True,
                    choices=["coverage", "gradient", "ig", "occlusion"])
    ap.add_argument("--only", default=None, help="one chromosome, for a smoke run")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--steps", type=int, default=32, help="integrated-gradients steps")
    ap.add_argument("--win", type=int, default=64, help="occlusion ablation window, bp")
    ap.add_argument("--device", default=None)
    args = ap.parse_args()

    import torch
    from shorkie_torch import build

    genome = read_fasta(SCRATCH / "sacCer3.fa")
    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    species = loci["speciesIndex"]
    names = json.loads((ROOT / "src" / "data" / "shorkieTrackNames.json").read_text())["identifiers"]

    # The paper's 384 T0 RNA-seq tracks: the subset every attribution on this site is scored on, so
    # a genome-wide gradient answers the same question the per-locus one does.
    T0 = [i for i, n in enumerate(names) if "_T0_" in n and 1148 <= i < 4201]
    if len(T0) != 384:
        raise SystemExit(f"expected 384 T0 tracks, found {len(T0)}")

    dev = args.device or ("mps" if torch.backends.mps.is_available() else "cpu")
    model, _ = build(args.checkpoint)
    n_par = sum(p.numel() for p in model.parameters())
    # Only buffers the CHECKPOINT carries. `pos_features` (8,160) is the positional basis the port
    # precomputes at build time and `num_batches_tracked` (20) is bookkeeping; counting either makes
    # the accounting look right for the wrong reason. 14,243,775 + 9,792 BN statistics = 14,253,567,
    # which is fold-f0 -- a checkpoint of any other size is a DIFFERENT model, and anything measured
    # against it is worse than no measurement: it looks like data.
    n_bn = sum(b.numel() for n, b in model.named_buffers() if "running" in n)
    if n_par + n_bn != 14_253_567:
        raise SystemExit(f"{args.checkpoint}\n  has {n_par:,} params + {n_bn:,} BN stats = "
                         f"{n_par + n_bn:,}; fold-f0 is 14,253,567")
    model.eval().to(dev)
    T0_t = torch.tensor(T0, device=dev)

    native = {"coverage": BIN_BP, "gradient": 1, "ig": 1, "occlusion": args.win}[args.which]
    keys = [g[0] for g in GROUPS] + ["baseline"] if args.which == "coverage" else ["v"]
    print(f"device {dev} | pass {args.which} | native {native} bp | {len(keys)} array(s) a chromosome")

    def raw(x):
        out = model(x)
        return (out[0] if isinstance(out, tuple) else out)[0]         # [896, 5215]

    def forward(x):
        with torch.no_grad():
            return raw(x)

    def target(out896):
        """log2 of the T0-averaged coverage summed over the whole cropped interior.

        Index in TWO steps. `out[a:b, T0]` puts an integer beside an array index, which makes torch
        treat both as advanced and moves the broadcast axis to the front -- silently averaging over
        bins and summing over tracks, the intended quantity with its axes swapped. This repo has
        already shipped that mistake once, in the mutagenesis generator, and `verify_pipeline.py`
        re-derived it the same wrong way and therefore agreed with it.
        """
        return torch.log2(out896[:, T0_t].mean(dim=-1).sum() + 1.0)

    def grad_once(x):
        xt = x.clone().requires_grad_(True)
        target(raw(xt)).backward()
        return xt.grad[0, :, :4].detach()

    # ---- per-window producers -----------------------------------------------------------------
    def window_coverage(x):
        """Per assay group the mean over its tracks, plus the T0 baseline. One forward pass.

        Single strand deliberately -- see the module docstring. This is the same quantity
        `make_predictions.py` ships per locus, computed the same way, so the two must agree.
        """
        y = forward(x)
        out = {g: y[:, a:b].mean(dim=-1).float().cpu().numpy() for g, a, b in GROUPS}
        out["baseline"] = y[:, T0_t].mean(dim=-1).float().cpu().numpy()
        return out

    def window_gradient(x):
        """Signed gradient x input, per base, rc-averaged.

        `rc_grad` maps a gradient computed in reverse-complement coordinates back to forward ones.
        Getting it wrong is silent: the numbers stay the same size and land on the wrong bases.
        The input is one-hot, so `x input` keeps the reference base's own contribution and zeroes
        the three that are not there -- the correct rendering, not a simplification.
        """
        g = (grad_once(x) + rc_grad(grad_once(rc_input(x)))) / 2
        return (g * x[0, :, :4]).sum(dim=-1).float().cpu().numpy()

    def window_ig(x):
        """Integrated gradients from an all-zero-DNA baseline, rc-averaged.

        NOT mean-centred, deliberately: IG's value is that its attributions sum to
        f(x) - f(baseline), and subtracting a per-position mean across bases breaks that identity
        (measured: 8-650% completeness error centred, 0.4-13% un-centred).
        """
        def one(xin):
            base = xin.clone()
            base[0, :, :4] = 0.0
            total = torch.zeros(SEQ_LEN, 4, device=dev)
            for s in range(args.steps):
                total += grad_once(base + ((s + 0.5) / args.steps) * (xin - base))
            return total / args.steps * (xin - base)[0, :, :4]
        return ((one(x) + rc_grad(one(rc_input(x)))) / 2).sum(dim=-1).float().cpu().numpy()

    def window_occlusion(x):
        """Effect on the interior's predicted coverage of ablating each `--win` bp of input.

        Zeroing the four DNA channels is how the paper's LM masks a position and is
        indistinguishable from a run of N: it asks whether the stretch carries information at all,
        where the motif-knockout panel's shuffle asks whether the ARRANGEMENT matters.
        """
        n = SEQ_LEN // args.win
        xr0 = rc_input(x)
        ref_f, ref_r = float(target(forward(x))), float(target(forward(xr0)))
        out = np.zeros(n, dtype=np.float32)
        for i in range(n):
            lo, hi = i * args.win, (i + 1) * args.win
            xf = x.clone()
            xf[0, lo:hi, :4] = 0.0
            xr = xr0.clone()
            xr[0, SEQ_LEN - hi:SEQ_LEN - lo, :4] = 0.0     # the mirrored span: p -> SEQ_LEN-1-p
            out[i] = ((float(target(forward(xf))) - ref_f)
                      + (float(target(forward(xr))) - ref_r)) / 2
        return out

    # ---- the sweep ----------------------------------------------------------------------------
    OUT.mkdir(parents=True, exist_ok=True)
    man_p = OUT / "shorkie.json"
    man = json.loads(man_p.read_text()) if man_p.exists() else {"passes": {}}
    rec = man["passes"].setdefault(args.which, {})
    rec["native"] = native
    rec["keys"] = keys
    rec["rcAveraged"] = args.which != "coverage"
    rec.setdefault("chroms", {})
    if args.which == "ig":
        rec["steps"] = args.steps
    if args.which == "occlusion":
        rec["win"] = args.win

    total = sum(len(plan_windows(len(s))) for c, s in genome.items()
                if not args.only or c == args.only)
    done = 0
    # Windows already on disk when this run started. The ETA has to be computed against the work
    # THIS run does, not against the whole genome: on a resume the elapsed clock covers only the
    # windows since restart, so dividing by the overall fraction reported "0.9 min left" with a
    # third of the genome still to score.
    done_at_start = 0
    t_all = time.time()
    print(f"{len(genome)} sequences, {sum(map(len, genome.values())):,} bp, {total} windows\n")

    for chrom, seq in sorted(genome.items(), key=lambda kv: -len(kv[1])):
        if args.only and chrom != args.only:
            continue
        n = len(seq)
        nb = -(-n // native)
        paths = {k: array_for(chrom, args.which, None if k == "v" else k) for k in keys}
        plan = plan_windows(n)
        if all(p.exists() for p in paths.values()) and not args.force and chrom in rec["chroms"]:
            print(f"  {chrom:8s} already written, skipping")
            done += len(plan)
            done_at_start += len(plan)
            continue

        acc = {k: np.full(nb, np.nan, dtype=np.float32) for k in keys}
        ck_p = OUT / f"{chrom}-sk-{args.which}-partial.npz"
        first = 0
        if ck_p.exists() and not args.force:
            ck = np.load(ck_p)
            if int(ck["n"]) == n and int(ck["total"]) == len(plan) and int(ck["native"]) == native:
                for k in keys:
                    acc[k] = ck[k]
                first = int(ck["done"])
                done += first
                done_at_start += first
                print(f"  {chrom:8s} resuming at window {first}/{len(plan)}")

        t0, t_ck = time.time(), time.time()
        for wi in range(first, len(plan)):
            s, c0, c1 = plan[wi]
            x = torch.from_numpy(encode(seq[s:s + SEQ_LEN], species)).to(dev)

            if args.which == "coverage":
                # The head only covers [s + CROP_BP, s + CROP_BP + 896*16) of the window, so a
                # bin's genome position is the window start plus the crop plus its own offset.
                # Bin b is written only if it falls in this window's own core, which is what keeps
                # neighbouring windows from overwriting each other.
                vals = window_coverage(x)
                b0 = max(0, -(-(c0 - s - CROP_BP) // BIN_BP))
                b1 = min(N_BINS, -(-(c1 - s - CROP_BP) // BIN_BP))
                for b in range(b0, b1):
                    j = (s + CROP_BP + b * BIN_BP) // BIN_BP
                    if 0 <= j < nb:
                        for k, v in vals.items():
                            acc[k][j] = v[b]
            elif args.which == "occlusion":
                v = window_occlusion(x)
                for i in range(len(v)):
                    bp = s + i * args.win
                    if c0 <= bp < c1 and 0 <= bp // native < nb:
                        acc["v"][bp // native] = v[i]
            else:
                v = window_gradient(x) if args.which == "gradient" else window_ig(x)
                acc["v"][c0:c1] = v[c0 - s:c1 - s]

            done += 1
            last = wi == len(plan) - 1
            if last or time.time() - t_ck > CKPT_SECONDS:
                t_ck = time.time()
                # `.tmp.npz`, not `.npz.tmp`: np.savez APPENDS `.npz` when the name lacks it, so a
                # `.npz.tmp` temp file lands as `.npz.tmp.npz` and the rename fails on a path that
                # never existed.
                tmp = OUT / f"{chrom}-sk-{args.which}-partial.tmp.npz"
                np.savez(tmp, done=wi + 1, n=n, total=len(plan), native=native, **acc)
                tmp.replace(ck_p)
                el = time.time() - t_all
                frac = done / max(total, 1)
                # Rate from this run's own work; remaining from the whole genome.
                rate = (done - done_at_start) / max(el, 1e-9)
                left = (total - done) / max(rate, 1e-9)
                print(f"    {chrom} {wi+1}/{len(plan)}  |  {done}/{total} ({frac*100:4.1f}%)  "
                      f"{el/60:.1f} min this run, {left/60:.1f} min left",
                      flush=True)

        for k in keys:
            np.save(paths[k], acc[k])
        ck_p.unlink(missing_ok=True)
        fin = np.isfinite(acc[keys[0]])
        rec["chroms"][chrom] = {
            "length": n, "bins": nb, "windows": len(plan), "scored": int(fin.sum()),
            "unscoredBins": int((~fin).sum()),
            **{f"mean_{k}": (round(float(np.nanmean(acc[k])), 6) if fin.any() else None)
               for k in keys},
        }
        man["passes"][args.which] = rec
        man_p.write_text(json.dumps(man, indent=1))
        print(f"  {chrom:8s} {n:>9,} bp  {nb:>9,} bins  {int((~fin).sum()):>6,} unscored  "
              f"[{(time.time()-t0)/60:.1f} min]", flush=True)

    if not args.only:
        gap = sum(v["unscoredBins"] for v in rec["chroms"].values()) * native
        rec["headCropBases"] = gap
        man_p.write_text(json.dumps(man, indent=1))
        print(f"\n  {gap:,} bases unscored ({gap / sum(map(len, genome.values())) * 100:.2f}%) "
              f"-- the head's {CROP_BP} bp crop at each chromosome start")
    print(f"{len(rec['chroms'])} chromosomes for pass '{args.which}' at {native} bp")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
