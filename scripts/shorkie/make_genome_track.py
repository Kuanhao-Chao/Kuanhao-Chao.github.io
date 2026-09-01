"""
Score the whole R64 genome with Shorkie_LM and keep only each window's uncontaminated core.

The per-locus packs cover 23 hand-picked windows. This produces the same quantity -- per-base
information content from the K = 7 iterative masked pass -- for all 12,157,105 bases of sacCer3, so
the browser can show constraint anywhere rather than only where someone thought to look.

**Why the core and not the whole window.** A base near a window edge has less context than one in
the middle, so its prediction is not comparable. How much less is measurable -- score the same 8,192
bases once centred in a window and once against its edge -- and **the answer depends entirely on
which region you measure**, which is how the first version of this script shipped a flank three
times too small.

    distance from edge   quiet chrIV:400k    structured chrI:76k
                         (IC sd 0.179)       (IC sd 0.293)
      0-64 bp              0.0321              0.1049
      512-1024             0.0112              0.0245
      1024-2048            0.0063              0.0224
      2048-3072            ~0.007              0.0186
      3072-4096            ~0.007              0.0109
      4096-6144            ~0.007              0.0060   <- settles here

On the quiet stretch the effect looks finished by 1 kb, and a 2,048 bp flank looks like a 2x margin.
On a gene promoter -- where the model is actually resolving motifs, and where anyone will look -- it
is still 0.022 bits at 2 kb and only settles around 4 kb. The 2,048 flank was caught by the
verification gate, which found the genome track disagreeing with the shipped per-locus packs by
0.054 bits while three differently-framed windows agreed with each other to 0.0045.

FLANK is therefore **4,096**: a 8,192 bp core, 1,493 windows. At the measured 0.3 s a window that is
about 8 minutes -- the original "50 minutes" for this configuration came from a per-window estimate
that was itself wrong by 6x. **Measure the cost and the error on the case that matters, not on the
first one to hand.**

**Every window sits on the model's 128 bp pooling grid, and that matters more than the flank.**
Scoring the same bases from windows at different phases mod 128 changes information content by
0.0395 bits on average; from windows at the same phase, by 0.0020 -- a factor of 20. The whole track
is therefore computed at phase 0, so every base in the genome is comparable with every other. The
per-locus packs start at `locus.start` and are on whatever phase that gives, which is why the two
agree in shape (r = 0.95-0.99) rather than to the last decimal.

**The pass must be identical to `make_lm_packs.py`'s**, or a primary region and the genome-wide
track would disagree about the same base. `encode` and `entropy_bits` are imported from it rather
than reimplemented, and `verify_genome_track.py` asserts the agreement.

Chromosome ends cannot have a full flank. The largest available core is taken and the affected
bases are recorded in the manifest, because a base scored with 300 bp of left context is not the
same measurement as one scored with 2,048 and the file should say so.

Output (gitignored, the tiler turns it into what ships):
    scripts/shorkie/_scratch/genome-track/<chrom>.npy      float32 IC per base
    scripts/shorkie/_scratch/genome-track/manifest.json

Usage:
    python3 scripts/shorkie/make_genome_track.py <lm-checkpoint.h5> [--only chrI] [--force]
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

from make_lm_packs import encode, entropy_bits, SEQ_LEN          # noqa: E402  the identical pass

SCRATCH = Path(__file__).resolve().parent / "_scratch"
OUT = SCRATCH / "genome-track"
FLANK = 4096                      # measured on a structured region; see the docstring
CORE = SEQ_LEN - 2 * FLANK        # 8,192
K = 7                             # the checkpoint's own mask_rate is 0.15; 1/7 = 14.3%
CKPT_WINDOWS = 8                  # checkpoint cadence, ~2 min of work


def read_fasta(path: Path) -> dict[str, str]:
    seqs: dict[str, list[str]] = {}
    name = None
    with path.open() as fh:
        for line in fh:
            if line.startswith(">"):
                name = line[1:].split()[0]
                seqs[name] = []
            elif name:
                seqs[name].append(line.strip())
    return {k: "".join(v).upper() for k, v in seqs.items()}


def plan_windows(n: int) -> list[tuple[int, int, int]]:
    """`(window_start, core_start, core_end)` covering [0, n) with disjoint cores.

    The CORES are partitioned first and each window is then derived from its core, not the other way
    round. Deriving cores from evenly spaced windows looks equivalent and is not: the final window
    has to be pinned flush to the chromosome end so it does not run off, and its core then overlaps
    its neighbour's. Measured on the real chromosome lengths that double-scored 4,271-8,163 bases
    per chromosome -- every one of them silently overwritten by whichever window came last.

    Each core still gets the largest flank the chromosome allows; only near an end is it smaller,
    and the caller records how many bases that affected.
    """
    out = []
    for c0 in range(0, max(n, 1), CORE):
        c1 = min(c0 + CORE, n)
        # `c0` is a multiple of CORE and FLANK is a multiple of 128, so `c0 - FLANK` is ALWAYS on
        # the pooling grid. Clamping it to `n - SEQ_LEN` -- the obvious way to keep a window inside
        # the chromosome -- is what knocks the last window of each chromosome off that grid, and the
        # model is 20x more sensitive to phase than to the flank. So the window is allowed to run
        # past the end instead and `encode` zero-pads the tail, which is what a chromosome end looks
        # like to the model anyway; those bases are already counted in `shortFlankBases`.
        s = max(0, c0 - FLANK)
        out.append((s, c0, c1))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("--only", default=None, help="one chromosome, e.g. chrI")
    ap.add_argument("--force", action="store_true", help="redo chromosomes already written")
    ap.add_argument("--device", default=None)
    args = ap.parse_args()

    import torch
    from shorkie_torch import build, SHORKIE_LM

    fa = SCRATCH / "sacCer3.fa"
    if not fa.exists():
        raise SystemExit(f"missing {fa}")
    genome = read_fasta(fa)
    species = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())["speciesIndex"]

    dev = args.device or ("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"device: {dev}   flank {FLANK}  core {CORE}  K {K}")
    model, _ = build(args.checkpoint, SHORKIE_LM)
    model.eval()
    model.to(dev)

    OUT.mkdir(parents=True, exist_ok=True)
    manifest_p = OUT / "manifest.json"
    manifest = json.loads(manifest_p.read_text()) if manifest_p.exists() else {"chroms": {}}

    def masked_ic(seq: str) -> np.ndarray:
        """Per-base information content, 2 - H, from the K-pass iterative masked prediction."""
        x0 = encode(seq, species)
        probs = np.zeros((SEQ_LEN, 4), dtype=np.float32)
        base = torch.from_numpy(x0).to(dev)
        for r in range(K):
            sel = np.arange(r, SEQ_LEN, K)
            x = base.clone()
            x[0, sel, :4] = 0.0                  # the LM masks by zeroing the four DNA channels
            with torch.no_grad():
                y, _ = model(x)
            probs[sel] = y[0].float().cpu().numpy()[sel]
        return (2.0 - entropy_bits(probs)).astype(np.float32)

    total_windows = sum(len(plan_windows(len(s))) for s in genome.values())
    print(f"{len(genome)} sequences, {sum(map(len, genome.values())):,} bp, {total_windows} windows\n")
    done_windows = 0
    t_all = time.time()

    for chrom, seq in sorted(genome.items(), key=lambda kv: -len(kv[1])):
        if args.only and chrom != args.only:
            continue
        out_p = OUT / f"{chrom}.npy"
        if out_p.exists() and not args.force and chrom in manifest["chroms"]:
            print(f"  {chrom:8s} already written, skipping")
            done_windows += len(plan_windows(len(seq)))
            continue

        n = len(seq)
        plan = plan_windows(n)
        ic = np.full(n, np.nan, dtype=np.float32)
        short_flank = 0

        ck_p = OUT / f"{chrom}-partial.npz"
        first = 0
        if ck_p.exists() and not args.force:
            ck = np.load(ck_p)
            if int(ck["n"]) == n and int(ck["total"]) == len(plan):
                ic = ck["ic"]
                first = int(ck["done"])
                short_flank = int(ck["short"])
                print(f"  {chrom:8s} resuming at window {first}/{len(plan)}")

        t0 = time.time()
        for wi in range(first, len(plan)):
            s, c0, c1 = plan[wi]
            ic_win = masked_ic(seq[s:s + SEQ_LEN])
            ic[c0:c1] = ic_win[c0 - s:c1 - s]
            # Bases whose flank was cut short by a chromosome end, on either side of this core.
            short_flank += max(0, FLANK - (c0 - s)) + max(0, FLANK - ((s + SEQ_LEN) - c1))
            done_windows += 1

            if (wi + 1) % CKPT_WINDOWS == 0 or wi == len(plan) - 1:
                tmp = OUT / f"{chrom}-partial.tmp.npz"
                np.savez(tmp, ic=ic, done=wi + 1, n=n, total=len(plan), short=short_flank)
                tmp.replace(ck_p)
                el = time.time() - t_all
                frac = done_windows / max(total_windows, 1)
                print(f"    {chrom} {wi+1}/{len(plan)}  |  {done_windows}/{total_windows} overall "
                      f"({frac*100:4.1f}%)  {el/60:.1f} min elapsed, "
                      f"{(el/frac*(1-frac))/60:.1f} min left", flush=True)

        missing = int(np.isnan(ic).sum())
        if missing:
            raise SystemExit(f"{chrom}: {missing} bases have no score — the cores do not tile")
        np.save(out_p, ic)
        ck_p.unlink(missing_ok=True)
        manifest["chroms"][chrom] = {
            "length": n, "windows": len(plan),
            "shortFlankBases": short_flank,
            "mean": round(float(ic.mean()), 5),
            "min": round(float(ic.min()), 5), "max": round(float(ic.max()), 5),
        }
        manifest.update({"flank": FLANK, "core": CORE, "seqLen": SEQ_LEN, "k": K,
                         "score": "information content, 2 - H(p), bits",
                         "pass": "iterative masked, K disjoint strided sets"})
        manifest_p.write_text(json.dumps(manifest, indent=1))
        print(f"  {chrom:8s} {n:>9,} bp  {len(plan):3d} windows  "
              f"mean IC {ic.mean():.4f}  [{(time.time()-t0)/60:.1f} min]", flush=True)

    have = sorted(manifest["chroms"])
    tot = sum(m["length"] for m in manifest["chroms"].values())
    print(f"\n{len(have)} chromosomes, {tot:,} bp scored")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
