"""
In-silico saturation mutagenesis across the WHOLE 16,384 bp window, for every locus.

Mutate every base to all three alternatives and measure what the model actually does. This is the
gold standard for this family of models -- Basenji, Enformer, Borzoi and Shorkie are all read this
way -- and unlike gradient x input it is not an approximation of anything. Each cell is a real
forward pass, so the number is the model's own answer to "what if this base were different", with
no linearity assumption and no baseline to argue about.

16,384 positions x 3 substitutions x 2 strands = 98,304 forward passes a locus; 1,376,256 for all
fourteen.

WHY THIS IS NOW AFFORDABLE, HAVING BEEN REFUSED BEFORE
------------------------------------------------------
An earlier round priced full-window ISM at "1.4 h a locus, 39.6 h for all fourteen" and dropped it,
keeping only the paper's ~500 bp promoter windows. That figure was measured against **onnxruntime on
the CPU**, through a graph whose batch axis is pinned at [1, 16384, 170] -- so it baked in both the
slowest engine available and the impossibility of batching. Neither limit belongs to the model. The
PyTorch port in this directory has neither. Measured on an M1 Pro:

    onnxruntime CPU (the recorded figure)          104    ms/substitution
    PyTorch CPU, batch 1                           127.5  ms
    PyTorch MPS, batch 1                            23.1  ms
    PyTorch MPS, batch 32                           13.1  ms
    PyTorch MPS, batch 32, head sliced to T0        10.47 ms   <- what this script does
    ...the same, over the real fourteen-locus run   11.9 ms   (10.1-16.0)

All of those are ms per FORWARD PASS; a substitution costs two, because every published Shorkie ISM
run averages the forward and reverse strands. Measured end to end: 23.8 ms a substitution, 19.5 min
a locus, 4.6 h for all fourteen -- not 39.6. MPS is not a precision compromise either:
against the CPU on the same input it agrees to 6.6e-07 relative, three orders of magnitude tighter
than the fp16 ONNX graph the previous packs were built from.

THE MEASURED QUANTITY IS THE PAPER'S, and is unchanged from the promoter-window version. Three
things about it are easy to get subtly wrong and all three change the numbers:

  1. **logSED**, `log2(sum_alt + 1) - log2(sum_ref + 1)` over the gene's own body bins
     (src/shorkie/models/ensemble.py:97-104). A LOG RATIO, so a silent promoter and a maximal one
     are directly comparable -- which a linear difference is not.
  2. The bins are **SUMMED** inside each log, not averaged. Under a linear difference sum-vs-mean is
     a constant factor and harmless; inside a log it is not.
  3. The track set is the **384 T0 RNA-seq tracks** (`_T0_`, indices 1148-4193), not the whole
     3,053-track RNA-seq block. Figure 5's subject is that ISM saliency CHANGES across induction
     timepoints, so averaging all of them smears the axis the paper proves is not constant.

And logSED is computed **per strand, then averaged** -- not a logSED of averaged coverage, which is
a different and non-antisymmetric quantity. Both strands are run because every published ISM run
passes `--rc`.

The window scored is the gene's own body: a 14,336 bp yeast window holds a dozen genes and the
tallest is rarely the one being edited.

TWO IMPLEMENTATION NOTES
------------------------
  * The head is sliced to the 384 T0 columns before the run. Softplus is elementwise and the
    discarded columns are never read, so the output is identical -- it is 20% less arithmetic. It
    also removes the (tracks, bins) indexing trap that once shipped here: after slicing, every
    column is a T0 track, so `y[lo:hi].mean(-1).sum()` needs no fancy indexing at all.
  * A mutant differs from the reference in FOUR floats. The batch tensors are allocated once on the
    device and mutated in place; rebuilding a [32, 16384, 170] batch is 356 MB of copying for four
    floats of change, which would cost about as much as the forward pass it feeds.

Output, per locus, beside the other packs in public/vp-data/:
  <id>-ism.png     [4 x 16384] uint8, rows A/C/G/T, the reference base's row exactly zero
  the `ism` entry in <id>.json, carrying the per-row scales, the engine, and the decode error

Usage:
  python3 scripts/shorkie/make_ism.py <checkpoint.h5> [--only ID] [--force] [--batch 32]
                                      [--device mps|cpu] [--scratch DIR]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

BASES = "ACGT"
BASE_IDX = {b: i for i, b in enumerate(BASES)}
SEQ_LEN, IN_CHANNELS, N_BINS, BIN_BP, CROP_BP = 16384, 170, 896, 16, 1024
# The logo's default window on the page (`logoWindow` in variantPlayground.ts). The logo rescales
# to whatever it shows, so this is the span the quantisation error has to be judged over.
LOGO_BP = 150
# Batches between checkpoints. 200 x 32 = 6,400 substitutions, about 2.2 min -- small enough that
# an interruption costs little, large enough that writing a 256 KB plane is not part of the cost.
CKPT_BATCHES = 200


def encode(sequence: str, species: int) -> np.ndarray:
    x = np.zeros((SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    for i, base in enumerate(sequence[:SEQ_LEN].upper()):
        j = BASE_IDX.get(base)
        if j is not None:
            x[i, j] = 1.0
    x[:, 5 + species] = 1.0
    return x


def rc_encoded(x: np.ndarray) -> np.ndarray:
    """Reverse-complement an encoded window: reverse positions, swap A<->T and C<->G.

    The species channels are position-indexed but base-agnostic, so they reverse without being
    complemented -- the same split the paper's own RC augmentation makes.
    """
    out = x[::-1, :].copy()
    out[:, :4] = out[:, [3, 2, 1, 0]]
    return np.ascontiguousarray(out)


def gene_body_bins(features: list[dict], gene_id: str) -> tuple[int, int]:
    """The focal gene's own output bins. Measuring the window peak instead measures another gene."""
    for f in features:
        if f["name"] == gene_id:
            lo = max(0, (f["txStart"] - CROP_BP) // BIN_BP)
            hi = min(N_BINS, (f["txEnd"] - CROP_BP) // BIN_BP + 1)
            if hi > lo:
                return int(lo), int(hi)
    return 0, N_BINS


def tss_of(features: list[dict], gene_id: str) -> int:
    """Transcription start: txStart on the plus strand, txEnd on the minus."""
    for f in features:
        if f["name"] == gene_id:
            return int(f["txStart"] if f["strand"] == "+" else f["txEnd"])
    return SEQ_LEN // 2


def saliency(plane: np.ndarray, seq: str) -> np.ndarray:
    """The paper's transform: mean-centre across the four bases, then project on the reference.

    This is what the logo draws, so it is the quantity the quantisation error must be measured on --
    not the raw plane, of which it is a non-trivial function.

    Written as minus the sum of the three ALTERNATIVES over four rather than as an explicit
    mean-centring. The two are identical when the reference cell is exactly zero, which it is on a
    raw plane -- but this function is also run on a DECODED plane to measure packing error, and
    there the reference cell is only zero to within a uint8 level. Skipping it drops that noise
    instead of folding it into every position, and matches `ismSaliency` in shorkieModel.ts, which
    is what the page actually draws.
    """
    out = np.zeros(plane.shape[1], dtype=np.float64)
    for k in range(plane.shape[1]):
        j = BASE_IDX.get(seq[k].upper())
        if j is not None:
            out[k] = -(plane[:, k].sum() - plane[j, k]) / 4.0
    return out


def pack_error(want: np.ndarray, got: np.ndarray, win: int = LOGO_BP) -> tuple[float, float]:
    """Quantisation error on the drawn saliency, both absolutely and as the reader sees it.

    The absolute error is the wrong criterion on a full window, and picking by it is how the first
    run of this script chose LINEAR packing: absolute error is set by the loudest cells -- a handful
    of splice sites near -0.45 -- and linear uint8 serves those perfectly while giving the MEDIAN
    cell 0.54 quantisation levels. Measured on the first pack, 62% of the window fell below a single
    step, i.e. most of the window quantised to noise.

    What a reader sees is set by the logo's y-axis, and the logo shows `win` bp at a time rescaled
    to that window's own maximum. So the error that matters is relative to a LOCAL max, not to the
    window-wide one. That is the number this returns first, and the one the caller picks on.
    """
    err = np.abs(got - want)
    a = np.abs(want)
    pad = win // 2
    local = sliding_window_view(np.pad(a, pad, mode="edge"), win)[:len(a)].max(axis=1)
    return float((err / np.maximum(local, 1e-12)).max()), float(err.max())


def quantize_rows(a: np.ndarray, space: str) -> tuple[np.ndarray, list[float], list[float]]:
    """uint8 per row against that row's own range, linear or signed-log.

    A full window spans a far wider dynamic range than the 500 bp promoter this used to cover:
    splice-site effects near -0.45 beside long stretches at 1e-5. `space` lets the caller try both
    and keep whichever holds the DRAWN quantity more faithfully.
    """
    b = np.sign(a) * np.log10(1.0 + np.abs(a) / 1e-4) if space == "log" else a
    lo = b.min(axis=1)
    hi = b.max(axis=1)
    rng = np.maximum(hi - lo, 1e-12)
    q = np.clip(np.round((b - lo[:, None]) / rng[:, None] * 255.0), 0, 255).astype(np.uint8)
    return q, [round(float(v), 8) for v in lo], [round(float(v), 8) for v in hi]


def dequantize_rows(q: np.ndarray, lo, hi, space: str) -> np.ndarray:
    lo = np.asarray(lo)[:, None]
    hi = np.asarray(hi)[:, None]
    v = q.astype(np.float64) / 255.0 * (hi - lo) + lo
    return np.sign(v) * 1e-4 * (10.0 ** np.abs(v) - 1.0) if space == "log" else v


def repack(out_dir: Path) -> int:
    """Re-quantise every locus from its saved raw plane, with no model and no GPU.

    The packing SPACE and its error are properties of the packing code, not of the forward passes,
    so a change to either must not cost another six-hour run. This is what `_scratch/ism-raw` is
    for: the generating run and the shipped pack can then be produced by different revisions of
    this file without the two silently disagreeing about which space was chosen or what the error
    was. Everything else in the sidecar is left exactly as the run wrote it.
    """
    from PIL import Image

    raw_dir = Path(__file__).resolve().parent / "_scratch" / "ism-raw"
    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    done = 0
    for locus in loci["loci"]:
        raw_p = raw_dir / f"{locus['id']}-ism.npy"
        meta_p = out_dir / f"{locus['id']}.json"
        if not raw_p.exists() or not meta_p.exists():
            print(f"  {locus['id']:10s} no raw plane, skipping")
            continue
        plane = np.load(raw_p).astype(np.float64)
        seq = locus["sequence"].upper()
        want = saliency(plane, seq)
        best = None
        for space in ("linear", "log"):
            q, lows, highs = quantize_rows(plane, space)
            rel, absolute = pack_error(want, saliency(dequantize_rows(q, lows, highs, space), seq))
            if best is None or rel < best[0]:
                best = (rel, absolute, space, q, lows, highs)
        rel, err, space, q, lows, highs = best
        meta = json.loads(meta_p.read_text())
        was = meta.get("ism", {}).get("space")
        Image.fromarray(q, mode="L").save(out_dir / f"{locus['id']}-ism.png")
        meta["ism"].update({"space": space, "lo": lows, "hi": highs,
                            "saliencyDecodeError": round(err, 8),
                            "saliencyRelativeError": round(rel, 6)})
        meta_p.write_text(json.dumps(meta))
        print(f"  {locus['id']:10s} {locus['gene']:8s} {space:6s} pack"
              f"{'' if was == space else f' (was {was})'}"
              f"  err {err:.2e} abs / {rel * 100:.1f}% local")
        done += 1
    print(f"repacked {done} loci from raw planes")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint", nargs="?",
                    help="not needed with --repack, which runs no model")
    ap.add_argument("--out", default=str(ROOT / "public" / "vp-data"))
    ap.add_argument("--only", default=None)
    ap.add_argument("--force", action="store_true", help="redo loci that already have a full plane")
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--device", default=None, help="mps | cpu (default: mps when available)")
    ap.add_argument("--scratch", default=None, help="write here instead, for the overlap check")
    ap.add_argument("--limit", type=int, default=None,
                    help="process only the first N substitutions -- a smoke test, not a pack")
    ap.add_argument("--repack", action="store_true",
                    help="re-quantise from the saved raw planes; no model, no GPU, seconds not hours")
    args = ap.parse_args()

    if args.repack:
        return repack(Path(args.out))
    if not args.checkpoint:
        ap.error("a checkpoint is required unless --repack is given")

    import torch
    import torch.nn as nn
    from PIL import Image
    from shorkie_torch import build

    device = args.device or ("mps" if torch.backends.mps.is_available() else "cpu")
    # Recorded in the metadata: a silent fall back to CPU turns a 4-hour run into a 12-hour one, and
    # the only symptom would be that it is still going in the morning.
    print(f"device: {device}  batch: {args.batch}")

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    species = loci["speciesIndex"]
    names = json.loads((ROOT / "src" / "data" / "shorkieTrackNames.json").read_text())["identifiers"]
    T0 = np.array([i for i, n in enumerate(names) if "_T0_" in n and 1148 <= i < 4201])
    if T0.size != 384:
        print(f"expected 384 T0 tracks, found {T0.size}", file=sys.stderr)
        return 1
    print(f"T0 track subset: {T0.size} tracks, indices {T0.min()}-{T0.max()}")

    model, _ = build(args.checkpoint)
    model.eval()
    head = model.head
    small = nn.Linear(head.in_features, int(T0.size), bias=head.bias is not None)
    with torch.no_grad():
        small.weight.copy_(head.weight[T0])
        if head.bias is not None:
            small.bias.copy_(head.bias[T0])
    model.head = small
    model.to(device)

    out_dir = Path(args.scratch) if args.scratch else Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    B = args.batch

    for locus in loci["loci"]:
        if args.only and locus["id"] != args.only:
            continue
        meta_path = Path(args.out) / f"{locus['id']}.json"
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        if not args.force and not args.scratch and meta.get("ism", {}).get("cols") == SEQ_LEN:
            print(f"  {locus['id']:10s} already full-window, skipping")
            continue

        seq = locus["sequence"].upper()
        lo_bin, hi_bin = gene_body_bins(locus["features"], locus["id"])
        tss = tss_of(locus["features"], locus["id"])
        # Under reversal output bin b maps to N_BINS-1-b, so the gene body occupies
        # [N_BINS-hi, N_BINS-lo) on the reversed strand.
        rc_lo, rc_hi = N_BINS - hi_bin, N_BINS - lo_bin

        ref_np = encode(seq, species)
        fwd = torch.from_numpy(np.repeat(ref_np[None], B, axis=0)).to(device)
        rev = torch.from_numpy(np.repeat(rc_encoded(ref_np)[None], B, axis=0)).to(device)

        def coverage(batch: torch.Tensor, a: int, b: int, n: int) -> np.ndarray:
            with torch.no_grad():
                y = model(batch)[0]                      # [B, 896, 384] -- every column is T0
            return y[:n, a:b, :].mean(dim=-1).sum(dim=-1).float().cpu().numpy()

        ref_f = float(coverage(fwd, lo_bin, hi_bin, 1)[0])
        ref_r = float(coverage(rev, rc_lo, rc_hi, 1)[0])
        ref = 0.5 * (ref_f + ref_r)

        jobs = [(i, b) for i in range(SEQ_LEN) if seq[i] in BASE_IDX
                for b in range(4) if b != BASE_IDX[seq[i]]]
        if args.limit:
            jobs = jobs[:args.limit]
        # Within-locus checkpoint. Resumability was per LOCUS, which is the right granularity when
        # nothing interrupts -- but three interruptions in this run each discarded a partly finished
        # locus, and at ~17 min each that is most of the cost of the locus. The partial plane and the
        # job index are written every CKPT_BATCHES so a restart loses minutes, not a locus.
        raw_dir = Path(__file__).resolve().parent / "_scratch" / "ism-raw"
        raw_dir.mkdir(parents=True, exist_ok=True)
        ckpt_p = raw_dir / f"{locus['id']}-partial.npz"
        plane = np.zeros((4, SEQ_LEN), dtype=np.float64)
        start_at = 0
        if ckpt_p.exists() and not args.limit:
            ck = np.load(ckpt_p)
            # Only resume a checkpoint that describes THIS job list; a changed sequence or batch
            # size would silently splice two different runs together.
            if int(ck["total"]) == len(jobs):
                plane = ck["plane"].astype(np.float64)
                start_at = int(ck["done"])
                print(f"  {locus['id']:10s} resuming from checkpoint at "
                      f"{start_at:,}/{len(jobs):,} substitutions ({start_at / len(jobs) * 100:.1f}%)",
                      flush=True)
            else:
                print(f"  {locus['id']:10s} checkpoint is for a different job list, ignoring",
                      file=sys.stderr)
        t0 = time.time()

        ref_of = np.array([BASE_IDX.get(c, 0) for c in seq])
        for s in range(start_at, len(jobs), B):
            chunk = jobs[s:s + B]
            n = len(chunk)
            # Vectorised scatter rather than a Python loop of single-element writes. Both forms
            # were run in one process over identical jobs: they are BIT-IDENTICAL (max |diff| 0.0)
            # and differ by 0.6% in wall clock -- at batch 32 the forward pass dominates completely
            # and the edit cost is noise. This form is kept for being fewer Python-level ops, not
            # for speed; do not record a speedup here that a measurement does not support.
            ci = torch.arange(n, device=device)
            pos = torch.as_tensor([i for i, _ in chunk], device=device)
            alt = torch.as_tensor([b for _, b in chunk], device=device)
            ref_b = torch.as_tensor(ref_of[[i for i, _ in chunk]], device=device)
            # The same edit on the reverse strand: position i mirrors to SEQ_LEN-1-i and the base
            # complements. Mutating the stored reverse reference is exact and avoids
            # reverse-complementing 32 whole windows per batch.
            mpos, malt, mref = SEQ_LEN - 1 - pos, 3 - alt, 3 - ref_b

            fwd[ci, pos, ref_b] = 0.0
            fwd[ci, pos, alt] = 1.0
            rev[ci, mpos, mref] = 0.0
            rev[ci, mpos, malt] = 1.0

            alt_f = coverage(fwd, lo_bin, hi_bin, n)
            alt_r = coverage(rev, rc_lo, rc_hi, n)

            fwd[ci, pos, alt] = 0.0
            fwd[ci, pos, ref_b] = 1.0
            rev[ci, mpos, malt] = 0.0
            rev[ci, mpos, mref] = 1.0

            # logSED per strand, then averaged.
            sed = 0.5 * ((np.log2(alt_f + 1) - np.log2(ref_f + 1))
                         + (np.log2(alt_r + 1) - np.log2(ref_r + 1)))
            for k, (i, b) in enumerate(chunk):
                plane[b, i] = sed[k]

            if s and s % (B * CKPT_BATCHES) == 0:
                done = s / len(jobs)
                el = time.time() - t0
                span = (s - start_at) / len(jobs)
                if not args.limit:
                    # Atomic: write beside the target and rename, so a kill mid-write cannot leave a
                    # truncated checkpoint that the next run would load as real data.
                    # The temp name must END in .npz: np.savez APPENDS the extension when it is
                    # missing, so a ".npz.tmp" target is written as ".npz.tmp.npz" and the rename
                    # then fails on a path that was never created.
                    tmp = ckpt_p.with_name(f"{locus['id']}-partial.tmp.npz")
                    np.savez(tmp, plane=plane.astype(np.float32), done=s, total=len(jobs))
                    tmp.replace(ckpt_p)
                print(f"    {locus['id']} {done * 100:5.1f}%  {el / 60:5.1f} min elapsed, "
                      f"{(el / span * (1 - done) / 60) if span > 0 else 0:5.1f} min left", flush=True)

        # The raw plane, so a packing decision can ever be revisited without re-running the model.
        # This exists because it once could not be: the first full-window run kept only its uint8
        # pack, the packing space turned out to be wrong, and recovering from that cost a re-run.
        # `raw_dir` is NOT under public/ -- Astro copies that directory verbatim, so a local build
        # would ship 3.6 MB of raw planes into dist/. _scratch is gitignored and never deployed.
        np.save(raw_dir / f"{locus['id']}-ism.npy", plane.astype(np.float32))
        ckpt_p.unlink(missing_ok=True)          # the locus is complete; the partial is now noise

        # --- pack, choosing the space that holds the DRAWN quantity best ----------------------
        # Picked on the LOCAL-relative error -- see pack_error. Absolute error is reported too,
        # because it is what the decode check in verify_pipeline compares against the uint8 floor.
        want = saliency(plane, seq)
        best = None
        for space in ("linear", "log"):
            q, lows, highs = quantize_rows(plane, space)
            rel, absolute = pack_error(want, saliency(dequantize_rows(q, lows, highs, space), seq))
            if best is None or rel < best[0]:
                best = (rel, absolute, space, q, lows, highs)
        rel, err, space, q, lows, highs = best

        if args.limit and not args.scratch:
            print(f"  --limit is a smoke test; refusing to overwrite the real pack for "
                  f"{locus['id']}", file=sys.stderr)
            return 1
        Image.fromarray(q, mode="L").save(out_dir / f"{locus['id']}-ism.png")
        meta["ism"] = {
            "rows": 4, "cols": SEQ_LEN, "space": space, "lo": lows, "hi": highs,
            "start": 0, "tss": int(tss), "ref": float(ref),
            "geneBins": [lo_bin, hi_bin], "score": "logSED", "tracks": int(T0.size),
            "window": "full", "strands": "rc-averaged",
            "engine": f"pytorch/{device}", "saliencyDecodeError": round(err, 8),
            "saliencyRelativeError": round(rel, 6),
        }
        (out_dir / f"{locus['id']}.json").write_text(json.dumps(meta))

        flat = int(np.argmax(np.abs(plane)))
        b, k = flat // SEQ_LEN, flat % SEQ_LEN
        el = time.time() - t0
        print(f"  {locus['id']:10s} {locus['gene']:8s} {len(jobs):,} subs x 2 strands"
              f"  strongest {seq[k]}->{BASES[b]} at {k} bp ({k - tss:+d} from TSS)"
              f"  logSED {plane[b, k]:+.4f}"
              f"  | {space} pack, saliency err {err:.2e} abs / {rel * 100:.1f}% local"
              f"  [{el / 60:.1f} min, {el / len(jobs) / 2 * 1000:.2f} ms/pass]", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
