"""
Precompute everything the Shorkie_LM page draws.

Shorkie_LM is the masked DNA language model Shorkie is fine-tuned from: the same encoder, but
seven U-Net stages instead of three, so it upsamples all the way back to 16,384 positions and emits
a four-way softmax at every base. It answers "what belongs here", not "what does this express".

  public/lm-data/<id>-masked.png    [4 x 16384] iteratively-masked probabilities  <- the real task
  public/lm-data/<id>-unmasked.png  [4 x 16384] full-context probabilities        <- Figure 2A's
  public/lm-data/<id>-embed.png     [384 x 128] first self-attention layer
  public/lm-data/<id>-lm.json       scales, metrics, the 2-D projection, motif reconstructions

THREE QUANTITIES THAT MUST NEVER BE CONFLATED, measured on TDH3:

  unmasked          the model sees the base it is scoring, so it is largely reading its own input:
                    argmax 97.8% across the whole window, cross-entropy 0.607 bits. It is not a
                    prediction, and it is locally much worse than that average suggests -- over a
                    200 bp promoter span its cross-entropy is 3.159 bits, WORSE than the 2 bits of
                    a uniform guess, because a few positions get near-zero probability on the true
                    base and dominate the mean. Useful as "confidence given full context"; this is
                    nonetheless the pass the paper's Figure 2A logo is built on.
  iteratively       positions partitioned into K disjoint strided sets, each set masked in turn, and
  masked (K=7)      each position read back only from the pass that masked it. K=7 puts 14.3% under
                    mask, matching the checkpoint's own `mask_rate: 0.15`, and the stride leaves
                    every masked base with unmasked neighbours, as in training. argmax 43.0%
                    against 25% chance, cross-entropy 1.757 bits, perplexity 3.380. Seven forward
                    passes, about two seconds. THIS is the prediction.
  single-position   masking one base alone. Bounded by the above: the iterative pass masks that base
  masked            too, plus 1/7 of the others, so it is the same question asked slightly harder.

K=10 gives 43.93% / 1.7528 bits against K=7's 43.00% / 1.7571 -- the result is a property of the
model, not of the stride.

Usage:  python3 scripts/shorkie/make_lm_packs.py <lm_checkpoint.h5> [--only ID] [--k 7]
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

BASE_IDX = {b: i for i, b in enumerate("ACGT")}
SEQ_LEN, IN_CHANNELS = 16384, 170
EMBED_POS, EMBED_CH = 128, 384


def encode(sequence: str, species: int) -> np.ndarray:
    x = np.zeros((1, SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    idx = np.array([BASE_IDX.get(c, -1) for c in sequence[:SEQ_LEN].upper()])
    ok = idx >= 0
    x[0, np.where(ok)[0], idx[ok]] = 1.0
    x[0, :, 5 + species] = 1.0
    return x


def entropy_bits(p: np.ndarray) -> np.ndarray:
    """Shannon entropy per position, in bits. `p` is [N, 4] and each row sums to 1."""
    q = np.clip(p, 1e-12, 1.0)
    return -(p * np.log2(q)).sum(axis=-1)


def quantize_rows(a: np.ndarray, space: str) -> tuple[np.ndarray, list, list]:
    """uint8 per row against that row's own range, linear or in log space.

    Probabilities are not coverage: the quantity every panel displays is the ENTROPY, and
    -p*log2(p) is steepest exactly where p is small, which is where a linear uint8 grid is
    coarsest. `space` lets the caller pick, and the caller verifies the error on the entropy
    rather than on the probabilities.
    """
    b = np.log10(np.clip(a, 1e-6, None)) if space == "log" else a
    lo = b.min(axis=1)
    hi = b.max(axis=1)
    rng = np.maximum(hi - lo, 1e-12)
    q = np.clip(np.round((b - lo[:, None]) / rng[:, None] * 255.0), 0, 255).astype(np.uint8)
    return q, [round(float(v), 8) for v in lo], [round(float(v), 8) for v in hi]


def dequantize_rows(q: np.ndarray, lo, hi, space: str) -> np.ndarray:
    lo = np.asarray(lo)[:, None]
    hi = np.asarray(hi)[:, None]
    v = q.astype(np.float64) / 255.0 * (hi - lo) + lo
    return 10.0 ** v if space == "log" else v


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("--only", default=None)
    ap.add_argument("--k", type=int, default=7, help="iterative masking passes (K=7 ~ 15%)")
    ap.add_argument("--out", default=str(ROOT / "public" / "lm-data"))
    args = ap.parse_args()

    import torch
    from PIL import Image
    from shorkie_torch import build, SHORKIE_LM

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    species = loci["speciesIndex"]
    model, w = build(args.checkpoint, SHORKIE_LM)

    params = sum(p.numel() for p in model.parameters())
    total = sum(int(np.prod(v.shape)) for v in w.tensors.values())
    unused = set(w.tensors) - set(w.used)
    print(f"Shorkie_LM: {params:,} parameters, {total:,} checkpoint values, "
          f"{len(unused)} unconsumed tensors")
    if unused:
        print(f"  refusing: {len(unused)} tensors were never read", file=sys.stderr)
        return 1

    K = args.k
    worst_ent_err = 0.0
    worst_where = ""

    for locus in loci["loci"]:
        if args.only and locus["id"] != args.only:
            continue
        seq = locus["sequence"].upper()
        ref = np.array([BASE_IDX.get(c, -1) for c in seq])
        ok = ref >= 0
        t0 = time.time()

        def run(mask_idx: np.ndarray | None, want_embed: bool = False):
            x = encode(seq, species)
            if mask_idx is not None:
                x[0, mask_idx, :4] = 0.0        # the LM's own masking: zero the four DNA channels
            with torch.no_grad():
                y, acts = model(torch.from_numpy(x), want_intermediates=want_embed)
            emb = None
            if want_embed and acts is not None and "attn_out1" in acts:
                # First self-attention layer, [B, T, C] -> [128, 384]; the paper's Figure 2E basis.
                emb = acts["attn_out1"][0].detach().numpy()
            return y[0].numpy(), emb

        unmasked, emb = run(None, want_embed=True)

        masked = np.zeros((SEQ_LEN, 4), dtype=np.float32)
        for r in range(K):
            sel = np.arange(r, SEQ_LEN, K)
            p, _ = run(sel)
            masked[sel] = p[sel]

        # --- metrics, on the masked pass, which is the one that is a prediction ---------------
        acc = float((masked[ok].argmax(1) == ref[ok]).mean())
        ce = float(-np.log2(np.clip(masked[ok, ref[ok]], 1e-12, 1)).mean())
        ent = entropy_bits(masked)
        un_acc = float((unmasked[ok].argmax(1) == ref[ok]).mean())
        un_ce = float(-np.log2(np.clip(unmasked[ok, ref[ok]], 1e-12, 1)).mean())

        # --- pack, and verify the decode on the ENTROPY, not on the probabilities -------------
        best = None
        for space in ("linear", "log"):
            q, lo, hi = quantize_rows(masked.T.astype(np.float64), space)
            back = dequantize_rows(q, lo, hi, space).T
            back = np.clip(back, 0, None)
            back = back / np.maximum(back.sum(1, keepdims=True), 1e-12)
            err = float(np.abs(entropy_bits(back) - ent).max())
            if best is None or err < best[0]:
                best = (err, space, q, lo, hi)
        ent_err, space, q, lo, hi = best
        if ent_err > worst_ent_err:
            worst_ent_err, worst_where = ent_err, f"{locus['id']} ({space})"

        Image.fromarray(q, mode="L").save(out_dir / f"{locus['id']}-masked.png")
        qu, lou, hiu = quantize_rows(unmasked.T.astype(np.float64), space)
        Image.fromarray(qu, mode="L").save(out_dir / f"{locus['id']}-unmasked.png")

        # Embeddings: [128, 384] -> stored as [384 rows x 128 cols] so a row is one channel, the
        # same orientation every other pack in this repo uses.
        qe, loe, hie = quantize_rows(emb.T.astype(np.float64), "linear")
        Image.fromarray(qe, mode="L").save(out_dir / f"{locus['id']}-embed.png")

        # --- masked-motif reconstruction ------------------------------------------------------
        # Mask a whole curated binding site and read back what the LM puts there. This asks
        # whether the model has learned that a particular sequence belongs at that place from its
        # surroundings alone -- which is NOT the same as knowing the transcription factor, and the
        # page says so. One forward pass per site.
        ann_path = ROOT / "public" / "vp-data" / f"{locus['id']}-ann.json"
        motifs = []
        if ann_path.exists():
            ann = json.loads(ann_path.read_text())
            sites = [f for f in ann["features"]
                     if f["cls"] == "tfbs" and not f.get("truncated")
                     and f.get("evidence", "none") != "none" and f["end"] - f["start"] >= 4]
            for s in sites:
                span = np.arange(s["start"], s["end"])
                p, _ = run(span)
                sub = p[span]
                recalled = "".join("ACGT"[i] for i in sub.argmax(1))
                truth = seq[s["start"]:s["end"]]
                same = sum(a == b for a, b in zip(recalled, truth))
                motifs.append({
                    "name": s["name"], "start": s["start"], "end": s["end"],
                    "evidence": s.get("evidence", "none"),
                    "reference": truth, "recalled": recalled,
                    "identity": round(same / max(len(truth), 1), 4),
                    # Mean probability the LM puts on the base that is really there: a softer and
                    # more honest measure than argmax identity, which is all-or-nothing per base.
                    "meanRefProb": round(float(np.mean([
                        sub[i, BASE_IDX[c]] for i, c in enumerate(truth) if c in BASE_IDX
                    ])), 6) if any(c in BASE_IDX for c in truth) else 0.0,
                })
            motifs.sort(key=lambda m: -m["identity"])

        meta = {
            "gene": locus["gene"],
            "k": K,
            "motifs": motifs,
            "masked": {"rows": 4, "cols": SEQ_LEN, "space": space, "lo": lo, "hi": hi},
            "unmasked": {"rows": 4, "cols": SEQ_LEN, "space": space, "lo": lou, "hi": hiu},
            "embed": {"rows": EMBED_CH, "cols": EMBED_POS, "space": "linear",
                      "lo": loe, "hi": hie},
            "metrics": {
                "maskedArgmax": round(acc, 6),
                "maskedCrossEntropy": round(ce, 6),
                "maskedPerplexity": round(float(2 ** ce), 6),
                "meanEntropy": round(float(ent.mean()), 6),
                "unmaskedArgmax": round(un_acc, 6),
                "unmaskedCrossEntropy": round(un_ce, 6),
                "entropyDecodeError": round(ent_err, 6),
                "motifIdentity": round(float(np.mean([m["identity"] for m in motifs])), 4)
                                 if motifs else 0.0,
                # The floor a reconstruction has to beat: guessing the window's own base
                # composition at every position. Without it, "the LM recalled 6 of 11 bases" has
                # no scale -- a GC-poor promoter is 60% A/T and a constant-A guess scores well.
                "compositionFloor": round(float(
                    max(np.bincount(ref[ok], minlength=4) / max(ok.sum(), 1))
                ), 4),
            },
        }
        (out_dir / f"{locus['id']}-lm.json").write_text(json.dumps(meta, separators=(",", ":")))
        mi = np.mean([m["identity"] for m in motifs]) if motifs else float("nan")
        print(f"  {locus['id']:9s} {locus['gene']:8s} masked argmax {acc*100:5.2f}%  "
              f"CE {ce:.4f}  ppl {2**ce:5.3f}  | unmasked argmax {un_acc*100:5.2f}% CE {un_ce:.3f}"
              f"  | {len(motifs):3d} motifs recalled {mi*100:5.1f}%"
              f"  | entropy err {ent_err:.4f}  [{time.time()-t0:.0f}s]")

    print(f"worst entropy decode error: {worst_ent_err:.4f} bits at {worst_where}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
