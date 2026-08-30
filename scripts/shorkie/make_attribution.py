"""
Precompute the traceback: which input bases, and which neurons in which layer, drive a chosen
region of the output.

Method is gradient x input. It is a LOCAL LINEAR SENSITIVITY, not a decomposition -- the numbers do
not sum to the prediction, and the page says so. What makes it usable interactively is that
gradients superpose: d(sum over S)/dx = sum over S of d/dx. So precomputing the gradient for each
group of 8 output bins makes any dragged region an EXACT sum of rows, with no approximation.

Three planes per locus:
  attr-input     [112 x 1024]   signed gradient x input, 16 bp input bins -- drag any region
  attr-channels  [112 x 5760]   |grad x activation| per channel, over every mapped stage, in the
                                same channel order as stage_maps, so a stage is a slice of it
  attr-anchor    [N x 16384]    signed, single-base, for each annotated gene body and top peak

Sanity the generator checks and prints: attribution mass should concentrate in the region it was
taken from. On TDH3's body -- 6.2% of the window -- 43.1% of the mass lands inside.

Usage:  python3 scripts/shorkie/make_attribution.py <checkpoint.h5> [--out public/vp-data]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
BASE_IDX = {"A": 0, "C": 1, "G": 2, "T": 3}
SEQ_LEN, IN_CHANNELS, N_BINS = 16384, 170, 896
GROUP_BINS = 8                      # output bins per attribution row -> 128 bp granularity
N_GROUPS = N_BINS // GROUP_BINS     # 112
INPUT_BINS = 1024                   # 16 bp input bins, matching the output bin size
RNA_LO, RNA_HI = 1148, 4201         # the RNA-seq block: what "high expression" means here
N_DNA = 4
MAX_ANCHORS = 12
N_STAGES, STAGE_POS = 18, 128     # the mapped stages, and their common pooled position count


def encode(sequence: str, species: int) -> np.ndarray:
    x = np.zeros((1, SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    for i, base in enumerate(sequence[:SEQ_LEN].upper()):
        j = BASE_IDX.get(base)
        if j is not None:
            x[0, i, j] = 1.0
    x[0, :, 5 + species] = 1.0
    return x


def quantize_rows(a: np.ndarray) -> tuple[np.ndarray, list[float], list[float]]:
    """uint8 per row against that row's own range. Handles signed data; the scales undo it."""
    lo = a.min(axis=1)
    hi = a.max(axis=1)
    rng = np.maximum(hi - lo, 1e-12)
    q = np.clip(np.round((a - lo[:, None]) / rng[:, None] * 255.0), 0, 255).astype(np.uint8)
    return q, [round(float(v), 6) for v in lo], [round(float(v), 6) for v in hi]


def rc_input(x):
    """Reverse-complement the model input: reverse position, swap A<->T and C<->G.

    The species channels are position-indexed but base-agnostic, so they reverse without being
    complemented -- the same split the paper's own RC augmentation makes.
    """
    o = x.flip(1).clone()
    o[:, :, :4] = o[:, :, [3, 2, 1, 0]]
    return o


def rc_grad(g):
    """Map a gradient computed in reverse-complement coordinates back to forward coordinates.

    `rc` is a permutation, so it is its own inverse and orthogonal: d f(rc x)/dx = rc(df/dy) at
    y = rc(x). Applying the same reverse-and-swap to the gradient is therefore exactly right, and
    getting it wrong is silent -- the numbers stay the same size and land on the wrong bases.

    Verified against finite differences on the real model before this shipped: at the same cell,
    the forward gradient reads -0.002388 against a finite difference of -0.002384, and the mapped
    reverse gradient +0.003716 against +0.003815 at eps = 1e-3.
    """
    return g.flip(0)[:, [3, 2, 1, 0]]


def main() -> int:
    import torch
    from PIL import Image
    from shorkie_torch import build

    ckpt = sys.argv[1]
    out_dir = ROOT / (sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "public/vp-data")
    out_dir.mkdir(parents=True, exist_ok=True)
    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    preds = json.loads((ROOT / "src" / "data" / "shorkiePredictions.json").read_text())

    model, _ = build(ckpt)
    model.eval()

    # The paper's 384 T0 RNA-seq tracks -- the same subset the mutagenesis pack scores on, so the
    # gradient and the substitution answer the same question.
    names = json.loads((ROOT / "src" / "data" / "shorkieTrackNames.json").read_text())["identifiers"]
    T0 = [i for i, n in enumerate(names) if "_T0_" in n and 1148 <= i < 4201]
    if len(T0) != 384:
        print(f"expected 384 T0 tracks, found {len(T0)}", file=sys.stderr)
        return 1
    T0_t = torch.tensor(T0)
    print(f"T0 track subset: {len(T0)} tracks, indices {T0[0]}-{T0[-1]}")

    total_bytes = 0
    print(f"{'gene':<9}{'anchors':>8}{'input':>9}{'chans':>9}{'anchor':>9}{'mass in region':>16}")
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    for locus in loci["loci"]:
        if only and locus["id"] != only:
            continue
        x = encode(locus["sequence"], loci["speciesIndex"])
        base = torch.from_numpy(x)

        def target(out, bin_lo: int, bin_hi: int):
            """The scalar being differentiated: log2 of the T0-averaged coverage over the region.

            Deliberately the SAME quantity logSED measures (ensemble.py:97-104), so a gradient and
            a mutagenesis result on this page answer the same question and can be laid side by
            side. The reference term of logSED is a constant, so differentiating log2(S_alt + 1)
            gives the logSED gradient exactly.

            Two axes to keep straight: mean over TRACKS, sum over BINS. Indexing in one step as
            `out[0, lo:hi, T0]` silently transposes them -- an integer beside an array index moves
            the broadcast axis to the front -- which is a mistake this project has already shipped
            once, in the mutagenesis generator.
            """
            cov = out[0][bin_lo:bin_hi][:, T0_t].mean(dim=-1).sum()
            return torch.log2(cov + 1.0)

        def raw_grad(x, bin_lo: int, bin_hi: int, want_channels: bool):
            """One backward pass on one strand. Returns (input gradient, activations)."""
            xt = x.clone().requires_grad_(True)
            out, acts = model(xt, want_intermediates=want_channels)
            if want_channels:
                for k in [k for k in acts if k != "attention"]:
                    acts[k].retain_grad()
            target(out, bin_lo, bin_hi).backward()
            return xt.grad[0, :, :4].detach(), acts

        def attribute(bin_lo: int, bin_hi: int, want_channels: bool):
            """Returns (grad x input, per-channel relevance, per-position relevance).

            The INPUT-SPACE attribution is averaged over both strands, which is what Borzoi does and
            what every published Shorkie ISM run does (`--rc`). Worth knowing what that averaging
            is and is not: this model was NOT trained with reverse-complement augmentation
            (`augment_rc: false` in all four params.json), so it is not rc-equivariant and the two
            strands genuinely disagree -- measured on TDH3, the target reads 15.60 forward against
            14.23 reversed, and the two gradients correlate at 0.31. Averaging them is a deliberate
            test-time augmentation, not a free symmetry, and the page says so.

            The per-stage RELEVANCE margins stay forward-only, deliberately. They describe the
            internal state of one forward pass; averaging a forward-strand activation with a
            reverse-strand one is not a state the model is ever in, and nothing in the literature
            does it.
            """
            g_f, acts = raw_grad(base, bin_lo, bin_hi, want_channels)
            # The output bins reverse too: bin b maps to N_BINS-1-b under a whole-window flip.
            g_r, _ = raw_grad(rc_input(base), N_BINS - bin_hi, N_BINS - bin_lo, False)
            g = 0.5 * (g_f + rc_grad(g_r))
            # Mean-centre across the four bases before projecting. This is the Borzoi convention --
            # present verbatim in the paper's own helper at yeast_helpers.py:274-277, though gated
            # behind a `subtract_avg` that defaults to False and is never reached -- and it is what
            # makes gradient x input comparable with the paper's ISM saliency, which mean-centres
            # by construction. Without it the two methods answer subtly different questions.
            g = (g - g.mean(dim=-1, keepdim=True)).numpy()
            attr = (g * x[0, :, :4]).sum(axis=1)                       # [16384], signed
            chans = poss = None
            if want_channels:
                parts = []
                pos = []
                for k in (["block%d" % i for i in range(1, 8)]
                          + ["attn_out%d" % i for i in range(1, 9)]
                          + ["decoder%d" % i for i in range(1, 4)]):
                    a = acts[k]
                    rel = (a.grad * a).detach().abs()[0]
                    # attn_out is [T, C] on the path; every other stage is [C, T].
                    if k.startswith("attn_out"):
                        rel = rel.transpose(0, 1)
                    parts.append(rel.sum(dim=1).numpy())               # per channel
                    # The OTHER margin. The generator used to discard it, which left the page
                    # unable to say WHERE in the window a stage drew from -- only which of its
                    # channels mattered. Both margins are exact and both superpose over output
                    # bins, so an arbitrary contiguous region is a row-sum of each.
                    #
                    # Pooled to the common STAGE_POS, because the stages do NOT share a position
                    # count: block1 has 16,384 and block7 has 256, so the raw margins total 35,328
                    # and are not a rectangle. Pooling by SUM, not mean -- relevance is additive,
                    # and a mean would make a coarse stage look quieter merely for being coarse.
                    # This is the same pooling the shipped stage_maps use, so the positional axis
                    # of this plane lines up with the raster the page already draws.
                    per = rel.sum(dim=0)                               # per position, native
                    pos.append(per.reshape(STAGE_POS, -1).sum(dim=1).numpy())
                chans = np.concatenate(parts)                          # [5760]
                poss = np.concatenate(pos)                             # [18 x 128]
            return attr, chans, poss

        def integrated_gradients(bin_lo: int, bin_hi: int, steps: int = 32):
            """Integrated gradients along a straight path from an all-zero-DNA baseline.

            The one method on this page that can be checked against its own total. Gradient x input
            has no such property -- its values do not sum to anything in particular -- while IG
            satisfies COMPLETENESS: the attributions sum to f(x) - f(baseline), exactly, in the
            limit of infinitely many steps. The generator returns that gap alongside the sum so the
            approximation error at 32 steps is reported rather than assumed.

            The baseline zeroes the four DNA channels and KEEPS the species channel. A baseline
            with no species is not a sequence this model was ever trained to see, and the resulting
            attributions would be measured against a point off the data manifold entirely.
            """
            b0 = base.clone()
            b0[0, :, :N_DNA] = 0.0
            delta = base - b0
            total = torch.zeros_like(base[0, :, :N_DNA])
            for s in range(1, steps + 1):
                xs = (b0 + (float(s) / steps) * delta).requires_grad_(True)
                out, _ = model(xs, want_intermediates=False)
                target(out, bin_lo, bin_hi).backward()
                # Both strands, like gradient x input above, so the two methods differ only in the
                # path and not in the convention.
                xr = rc_input(b0 + (float(s) / steps) * delta).requires_grad_(True)
                out_r, _ = model(xr, want_intermediates=False)
                target(out_r, N_BINS - bin_hi, N_BINS - bin_lo).backward()
                # NOT mean-centred, deliberately -- and this is the one place on the page where
                # that differs from gradient x input. Completeness is IG's whole reason for being:
                # sum(attributions) = f(x) - f(baseline), exactly. That identity is a telescoping
                # integral of the RAW gradient, and subtracting the per-position mean across bases
                # destroys it. Measured: mean-centring pushed the completeness error from a few
                # percent to 8-650%. Given the choice between matching the other method's
                # convention and keeping the only checkable property any method here has, keep the
                # property -- and say the two differ.
                total += 0.5 * (xs.grad[0, :, :N_DNA].detach()
                                + rc_grad(xr.grad[0, :, :N_DNA].detach()))
            ig = (delta[0, :, :N_DNA] * (total / steps)).sum(dim=-1).numpy()
            # The gap must be averaged over the SAME two strands the attributions were, or
            # completeness is being checked against the wrong target. The average of two complete
            # decompositions is a complete decomposition of the average -- `rc_grad` is a
            # permutation so it preserves the sum, and rc(x) - rc(b) = rc(x - b). Leaving the gap
            # forward-only pushed the error from 0.002-0.15 to 0.22-0.57, which is the change
            # announcing itself rather than a property genuinely lost.
            rlo, rhi = N_BINS - bin_hi, N_BINS - bin_lo
            with torch.no_grad():
                f_x = float(target(model(base, want_intermediates=False)[0], bin_lo, bin_hi))
                f_0 = float(target(model(b0, want_intermediates=False)[0], bin_lo, bin_hi))
                r_x = float(target(model(rc_input(base), want_intermediates=False)[0], rlo, rhi))
                r_0 = float(target(model(rc_input(b0), want_intermediates=False)[0], rlo, rhi))
            return ig, 0.5 * ((f_x - f_0) + (r_x - r_0))

        # --- the draggable matrix: one row per group of 8 output bins
        inp = np.zeros((N_GROUPS, INPUT_BINS), dtype=np.float64)
        chan = np.zeros((N_GROUPS, 5760), dtype=np.float64)
        posn = np.zeros((N_GROUPS, N_STAGES * STAGE_POS), dtype=np.float64)
        for gi in range(N_GROUPS):
            attr, chans, poss = attribute(gi * GROUP_BINS, (gi + 1) * GROUP_BINS, True)
            inp[gi] = attr.reshape(INPUT_BINS, SEQ_LEN // INPUT_BINS).sum(axis=1)
            chan[gi] = chans
            posn[gi] = poss

        # --- anchors: every annotated gene body, plus the top predicted peaks, at base resolution
        anchors = []
        for f in locus["features"]:
            if f["end"] > f["start"]:
                anchors.append({"label": f["name"], "kind": "gene",
                                "binStart": int(f["start"]), "binEnd": int(f["end"])})
        rna = np.array(preds["loci"][locus["id"]]["groups"][2])
        peak = int(rna.argmax())
        anchors.append({"label": f"peak at bin {peak}", "kind": "peak",
                        "binStart": max(0, peak - 12), "binEnd": min(N_BINS, peak + 12)})
        anchors = anchors[:MAX_ANCHORS]
        anch = np.zeros((len(anchors), SEQ_LEN), dtype=np.float64)
        ig_plane = np.zeros((len(anchors), SEQ_LEN), dtype=np.float64)
        for ai, a in enumerate(anchors):
            attr, _, _ = attribute(a["binStart"], a["binEnd"], False)
            anch[ai] = attr
            ig, gap = integrated_gradients(a["binStart"], a["binEnd"])
            ig_plane[ai] = ig
            # Completeness, reported: how close the 32-step sum is to the true prediction gap.
            a["igSum"] = round(float(ig.sum()), 5)
            a["igGap"] = round(float(gap), 5)
            # Absolute AND relative. A near-zero gap makes the ratio meaningless -- one anchor
            # had a gap of -0.08 and a "652%" error that was really an absolute miss of 0.5.
            a["igAbsError"] = round(float(abs(ig.sum() - gap)), 5)
            a["igError"] = round(float(abs(ig.sum() - gap) / max(abs(gap), 1e-9)), 4)
            lo_bp, hi_bp = a["binStart"] * 16 + 1024, a["binEnd"] * 16 + 1024
            inside = np.abs(attr[lo_bp:hi_bp]).sum()
            a["massInside"] = round(float(inside / max(np.abs(attr).sum(), 1e-12)), 4)
            a["windowFraction"] = round((hi_bp - lo_bp) / SEQ_LEN, 4)

        meta = {"groupBins": GROUP_BINS, "groups": N_GROUPS, "inputBins": INPUT_BINS,
                "stages": N_STAGES, "stagePositions": STAGE_POS, "target": "log2(T0 coverage + 1)",
                "meanCentred": True, "strands": "rc-averaged (input space); forward only (relevance)",
                "igSteps": 32, "anchors": anchors}
        sizes = []
        for name, arr in (("attr-input", inp), ("attr-channels", chan), ("attr-anchor", anch),
                          ("attr-positions", posn), ("attr-ig", ig_plane)):
            q, lo, hi = quantize_rows(arr)
            path = out_dir / f"{locus['id']}-{name.split('-')[1]}.png"
            Image.fromarray(q, mode="L").save(path, format="PNG", optimize=True)
            sizes.append(path.stat().st_size)
            meta[name.split("-")[1]] = {"rows": int(arr.shape[0]), "cols": int(arr.shape[1]),
                                        "lo": lo, "hi": hi}
        (out_dir / f"{locus['id']}-attr.json").write_text(json.dumps(meta, separators=(",", ":")))
        total_bytes += sum(sizes) + (out_dir / f"{locus['id']}-attr.json").stat().st_size
        best = max(a["massInside"] for a in anchors)
        print(f"{locus['gene']:<9}{len(anchors):>8}{sizes[0]/1e6:>8.2f}M{sizes[1]/1e6:>8.2f}M"
              f"{sizes[2]/1e6:>8.2f}M{best:>15.1%}")

    print(f"\n{total_bytes/1e6:.1f} MB added across {len(loci['loci'])} loci")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
