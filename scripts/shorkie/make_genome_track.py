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

**Two passes, and the difference between them is the point.** The masked pass is a prediction: the
model cannot see the base it is scoring. The unmasked pass can, so it is largely reading its own
input — it is nonetheless the quantity the paper's Figure 2A logo is built on, which is exactly why
it is worth drawing beside the other rather than instead of it. Measured on the 23 shipped packs,
mean IC is 0.217 bits masked against 0.705 unmasked, and the two correlate at only r = 0.62, so the
unmasked pass is not a scaled copy of the masked one.

The unmasked pass costs ONE forward pass a window against the masked pass's seven, so a genome that
already has its masked arrays gains it for about a minute of GPU:

    python3 scripts/shorkie/make_genome_track.py <ckpt> --passes unmasked

Output (gitignored, the tiler turns it into what ships):
    scripts/shorkie/_scratch/genome-track/<chrom>.npy            float32 masked IC per base
    scripts/shorkie/_scratch/genome-track/<chrom>-unmasked.npy   float32 unmasked IC per base
    scripts/shorkie/_scratch/genome-track/manifest.json

Usage:
    python3 scripts/shorkie/make_genome_track.py <lm-checkpoint.h5> [--only chrI]
                                                 [--passes masked,unmasked] [--force]
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


def array_path(out_dir, chrom: str, which: str):
    """Where a pass's array lives.

    `masked` keeps the bare `<chrom>.npy` it was first written as: 46 MB of it already exists in
    `_scratch`, and renaming would either orphan that or force an eight-minute re-run to recover a
    filename. `unmasked` is suffixed. The tiler maps both onto their published track ids.
    """
    return out_dir / (f"{chrom}.npy" if which == "masked" else f"{chrom}-{which}.npy")


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
    ap.add_argument("--passes", default="masked,unmasked",
                    help="which passes to compute; a pass whose array already exists is skipped")
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

    def window_ic(seq: str, want: set[str]) -> dict[str, np.ndarray]:
        """Per-base information content, 2 - H, for the requested passes.

        Two passes, and they answer different questions -- the difference IS the paper's Figure 2A
        point, so they are computed by the same code on the same encoding rather than by two
        scripts that could drift:

          masked    K disjoint strided sets, each masked in turn, each position read back only from
                    the pass that masked it. K forward passes. This is a PREDICTION.
          unmasked  one forward pass with nothing masked, so the model can see the base it is
                    scoring and is largely reading its own input. NOT a prediction -- but it is the
                    pass the paper's Figure 2A logo is built on.

        Requesting only `unmasked` costs ONE forward pass against the masked pass's seven, which is
        why the whole genome can gain it for about a minute of GPU rather than another eight.
        """
        x0 = encode(seq, species)
        base = torch.from_numpy(x0).to(dev)
        out: dict[str, np.ndarray] = {}

        if "unmasked" in want:
            with torch.no_grad():
                y, _ = model(base)
            out["unmasked"] = (2.0 - entropy_bits(y[0].float().cpu().numpy())).astype(np.float32)

        if "masked" in want:
            probs = np.zeros((SEQ_LEN, 4), dtype=np.float32)
            for r in range(K):
                sel = np.arange(r, SEQ_LEN, K)
                x = base.clone()
                x[0, sel, :4] = 0.0              # the LM masks by zeroing the four DNA channels
                with torch.no_grad():
                    y, _ = model(x)
                probs[sel] = y[0].float().cpu().numpy()[sel]
            out["masked"] = (2.0 - entropy_bits(probs)).astype(np.float32)

        return out

    requested = [w.strip() for w in args.passes.split(",") if w.strip()]
    bad = [w for w in requested if w not in ("masked", "unmasked")]
    if bad:
        raise SystemExit(f"unknown pass(es): {bad}; expected masked and/or unmasked")

    total_windows = sum(len(plan_windows(len(s))) for s in genome.values())
    print(f"{len(genome)} sequences, {sum(map(len, genome.values())):,} bp, {total_windows} windows")
    print(f"passes requested: {', '.join(requested)}\n")
    done_windows = 0
    t_all = time.time()

    for chrom, seq in sorted(genome.items(), key=lambda kv: -len(kv[1])):
        if args.only and chrom != args.only:
            continue
        # Only the passes actually missing are computed. Asking for `unmasked` alone on a genome
        # whose masked arrays already exist costs one forward pass a window instead of eight.
        want = {w for w in requested
                if args.force or not array_path(OUT, chrom, w).exists()
                or chrom not in manifest["chroms"]}
        if not want:
            print(f"  {chrom:8s} already written ({', '.join(requested)}), skipping")
            done_windows += len(plan_windows(len(seq)))
            continue

        n = len(seq)
        plan = plan_windows(n)
        ic = {w: np.full(n, np.nan, dtype=np.float32) for w in want}
        short_flank = 0

        ck_p = OUT / f"{chrom}-partial.npz"
        first = 0
        if ck_p.exists() and not args.force:
            ck = np.load(ck_p)
            # The checkpoint must carry every pass this run is computing, or a resume would silently
            # leave one of them full of NaN and the tiling check would be the first to notice.
            if (int(ck["n"]) == n and int(ck["total"]) == len(plan)
                    and want <= set(str(k) for k in ck.files)):
                for w in want:
                    ic[w] = ck[w]
                first = int(ck["done"])
                short_flank = int(ck["short"])
                print(f"  {chrom:8s} resuming at window {first}/{len(plan)}")

        t0 = time.time()
        for wi in range(first, len(plan)):
            s, c0, c1 = plan[wi]
            win = window_ic(seq[s:s + SEQ_LEN], want)
            for w, v in win.items():
                ic[w][c0:c1] = v[c0 - s:c1 - s]
            # Bases whose flank was cut short by a chromosome end, on either side of this core.
            short_flank += max(0, FLANK - (c0 - s)) + max(0, FLANK - ((s + SEQ_LEN) - c1))
            done_windows += 1

            if (wi + 1) % CKPT_WINDOWS == 0 or wi == len(plan) - 1:
                # `.tmp.npz`, not `.npz.tmp`: np.savez APPENDS `.npz` when the name lacks it, so
                # a `.npz.tmp` temp file is written as `.npz.tmp.npz` and the rename below fails on
                # a path that never existed.
                tmp = OUT / f"{chrom}-partial.tmp.npz"
                np.savez(tmp, done=wi + 1, n=n, total=len(plan), short=short_flank, **ic)
                tmp.replace(ck_p)
                el = time.time() - t_all
                frac = done_windows / max(total_windows, 1)
                print(f"    {chrom} {wi+1}/{len(plan)}  |  {done_windows}/{total_windows} overall "
                      f"({frac*100:4.1f}%)  {el/60:.1f} min elapsed, "
                      f"{(el/frac*(1-frac))/60:.1f} min left", flush=True)

        for w, v in ic.items():
            missing = int(np.isnan(v).sum())
            if missing:
                raise SystemExit(f"{chrom}/{w}: {missing} bases have no score — the cores do not tile")
            np.save(array_path(OUT, chrom, w), v)
        ck_p.unlink(missing_ok=True)

        rec = manifest["chroms"].get(chrom, {})
        rec.update({"length": n, "windows": len(plan), "shortFlankBases": short_flank})
        for w, v in ic.items():
            rec[w] = {"mean": round(float(v.mean()), 5),
                      "min": round(float(v.min()), 5), "max": round(float(v.max()), 5)}
        # The original single-pass manifest wrote mean/min/max at the top level. Keep them as the
        # masked pass's, so nothing that already reads them starts reading a different pass.
        if "masked" in ic:
            rec.update(rec["masked"])
        manifest["chroms"][chrom] = rec
        manifest.update({"flank": FLANK, "core": CORE, "seqLen": SEQ_LEN, "k": K,
                         "score": "information content, 2 - H(p), bits",
                         "passes": {
                             "masked": "iterative masked, K disjoint strided sets — a prediction",
                             "unmasked": "one forward pass, nothing masked — the model sees the base "
                                         "it scores, so it is largely reading its own input. This is "
                                         "the paper's Figure 2A quantity and is NOT a prediction.",
                         }})
        manifest_p.write_text(json.dumps(manifest, indent=1))
        means = "  ".join(f"{w} {v.mean():.4f}" for w, v in sorted(ic.items()))
        print(f"  {chrom:8s} {n:>9,} bp  {len(plan):3d} windows  mean IC {means}"
              f"  [{(time.time()-t0)/60:.1f} min]", flush=True)

    have = sorted(manifest["chroms"])
    tot = sum(m["length"] for m in manifest["chroms"].values())
    print(f"\n{len(have)} chromosomes, {tot:,} bp scored")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
