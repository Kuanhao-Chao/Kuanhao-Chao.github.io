"""
At what depth, and at which positions, is the prediction already decided?

Every attribution method on this site answers "which bases mattered". None of them answers "where
in the NETWORK did that information become decisive" -- and that is a different question, because a
base can matter enormously while the representation that carries it only forms three layers in.

This is causal tracing (Meng et al. 2022, *Locating and Editing Factual Associations in GPT*),
adapted to a sequence-to-function model. Three runs:

  1. **clean**    -- the real window. Score `f_clean`, and keep every stage's activations.
  2. **corrupt**  -- the same window with its promoter dinucleotide-shuffled. Score `f_corrupt`.
  3. **restored** -- the corrupted input again, but at ONE stage and ONE band of positions the
     clean activations are written back in. Score `f_restored`.

    recovery(stage, band) = (f_restored - f_corrupt) / (f_clean - f_corrupt)

A cell near 1 says: the information the corruption destroyed is, at that depth and that position,
already sufficient to reconstruct the answer. A cell near 0 says it is not there yet, or not there
any more.

**Why this is not degenerate, and the first design that was.** Patching a whole stage -- every
position of it -- makes everything downstream the clean run's, so recovery is 1 whatever the depth
and the plot says nothing. That is not a bug to work around; it is the reason causal tracing
restores a *band* rather than a layer.

Three controls pin the scale, and they are asserted per locus: restoring every position of the
FIRST stage must recover exactly 1.0, restoring every position of the LAST stage must too by an
independent route, and restoring nothing must recover exactly 0.0. Together they catch the failure
that otherwise passes silently -- a patch written into the CHANNEL axis rather than the position
axis, which broadcasts cleanly and yields entirely plausible numbers.

The obvious fourth control is not one, and the first draft asserted it and failed at **0.9663**.
Restoring every position of a BOTTLENECK stage does not recover 1.0, because the U-Net skip
connections carry `block1..7` straight to the decoder around the transformer entirely -- so a clean
residual stream still meets corrupted skips. That shortfall is a measurement of how much of the
answer bypasses the bottleneck, which nothing else on this page reports, and it is recorded as
`skipBypass` rather than worked around.

**Corrupt by shuffling, not by zeroing.** Zeroing the DNA channels is indistinguishable from a run
of N, so the corrupted run would be out-of-distribution rather than merely uninformative, and every
recovery number would be measuring the model's response to impossible input. The shuffle is
Altschul-Erikson, borrowed from `make_receptive.py` so there is one implementation.

Positions are reported on a common 32-band grid across the 16,384 bp window. Each stage has its own
length -- 16,384 at the stem, 128 at the bottleneck, 1,024 at the last decoder stage -- so a band is
converted to that stage's own index range by fraction, which is exactly the correspondence the rest
of the page already draws.

Output:
    src/data/shorkiePatching.json    per locus: the [stage x band] recovery grid and its controls

Usage:  python3 scripts/shorkie/make_patching.py <ckpt.h5> [--bands 32] [--loci 23]
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

from make_attribution import encode                      # noqa: E402
from make_receptive import dinuc_shuffle, dinuc_counts   # noqa: E402

SEQ_LEN = 16384
# The promoter is what gets corrupted: 1 kb upstream of the gene's own start, on its own strand.
# Corrupting the gene body instead would mostly measure the model reading a broken ORF.
PROMOTER_BP = 1024

# Every named activation, in depth order. `shorkie_torch.forward` records exactly these.
STAGES = (["stem"] + [f"block{i}" for i in range(1, 8)]
          + [f"attn_out{i}" for i in range(1, 9)] + [f"decoder{i}" for i in range(1, 4)])


def stage_axis(name: str, tensor) -> int:
    """Which axis of a stage's tensor is POSITION.

    The convolutional stages are `[B, C, L]` and the transformer stages are `[B, T, C]` -- the
    residual stream is stored untransposed on purpose, because a transpose there is a fresh tensor
    on a branch nothing consumes and silently breaks per-layer relevance. So the axis differs by
    stage, and guessing one for both writes a patch into the channel axis: the shapes broadcast, the
    run completes, and every number is wrong.
    """
    return 1 if name.startswith("attn_out") else 2


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("--bands", type=int, default=32)
    ap.add_argument("--loci", type=int, default=23)
    ap.add_argument("--device", default=None)
    args = ap.parse_args()

    import torch
    from shorkie_torch import build

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    names = json.loads((ROOT / "src" / "data" / "shorkieTrackNames.json").read_text())["identifiers"]
    T0 = [i for i, n in enumerate(names) if "_T0_" in n and 1148 <= i < 4201]

    dev = args.device or ("mps" if torch.backends.mps.is_available() else "cpu")
    model, _ = build(args.checkpoint)
    n_par = sum(p.numel() for p in model.parameters())
    n_bn = sum(b.numel() for n, b in model.named_buffers() if "running" in n)
    if n_par + n_bn != 14_253_567:
        raise SystemExit(f"{args.checkpoint} is not fold-f0 ({n_par + n_bn:,} values)")
    model.eval().to(dev)
    T0t = torch.tensor(T0, device=dev)

    probe = loci["loci"][0]["sequence"][:4000]
    if dinuc_counts(dinuc_shuffle(probe, random.Random(0))) != dinuc_counts(probe):
        raise SystemExit("dinucleotide shuffle did not preserve the dinucleotide counts")

    def run(seq: str, a: int, b: int, want=False, patch_fn=None) -> tuple[float, dict]:
        x = torch.from_numpy(encode(seq, loci["speciesIndex"])).to(dev)
        with torch.no_grad():
            y, acts = model(x, want_intermediates=want, patch_fn=patch_fn)
        score = float(torch.log2(y[0][:, T0t].mean(dim=-1)[a:b].sum() + 1.0))
        return score, (acts or {})

    out, t0 = {}, time.time()
    print(f"  {'gene':<9}{'clean':>8}{'corrupt':>9}{'gap':>7}  {'peak recovery':>14}  band  stage")
    for L in loci["loci"][:args.loci]:
        own = next((f for f in L["features"] if f["name"] == L["id"]), None)
        if not own:
            continue
        a, b = own["start"], own["end"]
        seq = L["sequence"][:SEQ_LEN]

        # The promoter, on the gene's own strand.
        if L["strand"] == "-":
            lo, hi = min(SEQ_LEN, own["txEnd"]), min(SEQ_LEN, own["txEnd"] + PROMOTER_BP)
        else:
            lo, hi = max(0, own["txStart"] - PROMOTER_BP), max(0, own["txStart"])
        if hi - lo < 64:
            continue

        rng = random.Random(hash(L["id"]) & 0xFFFF)
        corrupted = seq[:lo] + dinuc_shuffle(seq[lo:hi], rng) + seq[hi:]

        f_clean, clean_acts = run(seq, a, b, want=True)
        clean_acts = {k: v.detach().clone() for k, v in clean_acts.items() if k in STAGES}
        f_corrupt, _ = run(corrupted, a, b)
        gap = f_clean - f_corrupt

        # A corruption that changed nothing cannot be traced: the denominator is the whole
        # experiment, and dividing by a gap of ~0 turns rounding noise into a recovery of 40.
        if abs(gap) < 1e-3:
            print(f"  {L['gene']:<9}{f_clean:>8.3f}{f_corrupt:>9.3f}{gap:>7.3f}   "
                  f"corruption moved nothing — skipped")
            continue

        def restore(stage: str, i0: int, i1: int):
            """Write the clean activations back over band [i0, i1) of `stage`, and nothing else."""
            def fn(name, tensor):
                if name != stage:
                    return tensor
                donor = clean_acts[name]
                ax = stage_axis(name, tensor)
                n = tensor.shape[ax]
                j0 = max(0, min(n, int(round(i0 / SEQ_LEN * n))))
                j1 = max(j0, min(n, int(round(i1 / SEQ_LEN * n))))
                if j1 <= j0:
                    return tensor
                t = tensor.clone()
                if ax == 1:
                    t[:, j0:j1, :] = donor[:, j0:j1, :]
                else:
                    t[:, :, j0:j1] = donor[:, :, j0:j1]
                return t
            return fn

        grid = np.zeros((len(STAGES), args.bands), dtype=np.float64)
        edges = np.linspace(0, SEQ_LEN, args.bands + 1).round().astype(int)
        for si, stage in enumerate(STAGES):
            for k in range(args.bands):
                f_r, _ = run(corrupted, a, b, patch_fn=restore(stage, edges[k], edges[k + 1]))
                grid[si, k] = (f_r - f_corrupt) / gap

        # Three controls, and the run is not reportable without them.
        #
        # Restoring EVERY position of the FIRST stage makes everything downstream the clean run's,
        # so it must recover exactly 1.0. So must restoring every position of the LAST stage, by a
        # different route -- the head is a deterministic function of it. Restoring nothing must
        # recover exactly 0.0. Those three pin both ends and the scale between them, and they are
        # what catches a patch written into the CHANNEL axis instead of the position axis: that
        # broadcasts cleanly, completes, and produces entirely plausible numbers.
        #
        # The obvious fourth control is not one, and finding that out is the point. Restoring every
        # position of a BOTTLENECK stage does NOT recover 1.0 -- the first draft asserted it would
        # and the check failed at 0.9663. That is not a wiring bug: the U-Net skip connections carry
        # `block1..7` straight to the decoder, around the transformer entirely, so a clean residual
        # stream still meets corrupted skips. The shortfall measures how much of the answer bypasses
        # the bottleneck, which nothing else on this page reports, so it is recorded as a result.
        f_first, _ = run(corrupted, a, b, patch_fn=restore(STAGES[0], 0, SEQ_LEN))
        rec_first = (f_first - f_corrupt) / gap
        f_last, _ = run(corrupted, a, b, patch_fn=restore(STAGES[-1], 0, SEQ_LEN))
        rec_last = (f_last - f_corrupt) / gap
        f_none, _ = run(corrupted, a, b, patch_fn=restore(STAGES[0], 0, 0))
        rec_none = (f_none - f_corrupt) / gap
        f_neck, _ = run(corrupted, a, b, patch_fn=restore("attn_out8", 0, SEQ_LEN))
        rec_neck = (f_neck - f_corrupt) / gap
        for label, got, want in (("first stage, all positions", rec_first, 1.0),
                                 ("last stage, all positions", rec_last, 1.0),
                                 ("no positions", rec_none, 0.0)):
            if abs(got - want) > 5e-3:
                raise SystemExit(f"{L['gene']}: control '{label}' recovered {got:.4f}, want {want}")

        si, bi = np.unravel_index(int(np.argmax(grid)), grid.shape)
        out[L["id"]] = {
            "gene": L["gene"],
            "clean": round(f_clean, 4), "corrupt": round(f_corrupt, 4), "gap": round(gap, 4),
            "promoterBp": [lo, hi],
            "grid": [[round(float(v), 4) for v in row] for row in grid],
            "controls": {
                "firstStageAllPositions": round(rec_first, 5),
                "lastStageAllPositions": round(rec_last, 5),
                "noPositions": round(rec_none, 5),
            },
            # What a fully restored bottleneck does NOT recover: the share of the answer that
            # reaches the decoder through the U-Net skips rather than through the transformer.
            "bottleneckAllPositions": round(rec_neck, 5),
            "skipBypass": round(1.0 - rec_neck, 5),
            "peak": {"stage": STAGES[si], "band": int(bi), "recovery": round(float(grid[si, bi]), 4)},
            # How much of the answer the bottleneck alone carries, averaged over the eight
            # transformer layers -- the depth at which this architecture stops being local.
            "bottleneckMean": round(float(grid[8:16].mean()), 4),
            "stemMean": round(float(grid[0].mean()), 4),
        }
        print(f"  {L['gene']:<9}{f_clean:>8.3f}{f_corrupt:>9.3f}{gap:>7.3f}  "
              f"{grid[si, bi]:>14.3f}  {bi:>4}  {STAGES[si]}")

    if not out:
        raise SystemExit("no locus produced a traceable corruption")

    # Where the promoter's own band sits on the 32-band grid, per locus, so the page can say whether
    # recovery peaks WHERE the corruption was or somewhere else -- which is the interesting half.
    payload = {
        "note": ("Causal tracing. Corrupt the promoter by dinucleotide shuffle, restore the clean "
                 "activations at one stage and one 512 bp band, and measure how much of the clean "
                 "prediction returns. Restoring every band must recover exactly 1.0 and restoring "
                 "none exactly 0.0; both are asserted per locus."),
        "stages": STAGES,
        "bands": args.bands,
        "bandBp": SEQ_LEN // args.bands,
        "promoterBp": PROMOTER_BP,
        "seqLen": SEQ_LEN,
        "loci": out,
        "summary": {
            "loci": len(out),
            "medianBottleneckMean": round(float(np.median([v["bottleneckMean"] for v in out.values()])), 4),
            "medianStemMean": round(float(np.median([v["stemMean"] for v in out.values()])), 4),
            "medianPeakRecovery": round(float(np.median([v["peak"]["recovery"] for v in out.values()])), 4),
            "medianSkipBypass": round(float(np.median([v["skipBypass"] for v in out.values()])), 4),
            "peakStages": sorted({v["peak"]["stage"] for v in out.values()}),
        },
    }
    dest = ROOT / "src" / "data" / "shorkiePatching.json"
    dest.write_text(json.dumps(payload, indent=1) + "\n")
    print(f"\n  wrote {dest.relative_to(ROOT)} — {len(out)} loci in {time.time() - t0:.0f}s")
    print(f"  median recovery from the bottleneck alone: "
          f"{payload['summary']['medianBottleneckMean']:.3f}")
    print(f"  median share bypassing the bottleneck through the U-Net skips: "
          f"{payload['summary']['medianSkipBypass']:.3f}")
    print("  patching audit passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
