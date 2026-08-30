"""
Knock out every curated binding site in every window, and measure what the model loses.

The page has offered six hand-picked motif knockouts, one shuffle each. This replaces that with a
sweep over the whole curated annotation, and reports each site as a MEAN OVER k SHUFFLES WITH ITS
SPREAD rather than a single draw -- one shuffle is one sample, and a single number presented as a
measurement is the thing this script exists to stop.

  public/vp-data/<id>-ko.json    one record per site: effect, sd, span, source, evidence

Scored exactly as the interactive knockout is: logSED over the window's OWN gene, using the paper's
384 `_T0_` RNA-seq subset. A 16 kb yeast window holds a dozen genes and the tallest is rarely the
one whose promoter was edited, so a global peak would report a number about an unrelated gene.

The shuffle is the same seeded Fisher-Yates the browser uses (`knockoutMotif` in
src/lib/shorkieModel.ts), reimplemented here with the identical LCG so a swept value and an
interactive one for the same site and seed agree exactly rather than approximately.

Cost: one forward pass is ~104 ms, so k shuffles x sites x loci. At k=5 over the ChIP-supported
tier (~24 sites a window) that is ~1,700 passes, about 3 minutes. Passing --tier conserved sweeps
everything (~4,300 sites) and takes roughly an hour.

Usage:
  python3 scripts/shorkie/make_knockout_sweep.py [--k 5] [--tier chip|conserved|all] [--only ID]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE_IDX = {b: i for i, b in enumerate("ACGT")}
SEQ_LEN, IN_CHANNELS, N_BINS, BIN_BP, CROP_BP = 16384, 170, 896, 16, 1024


def encode(sequence: str, species: int) -> np.ndarray:
    x = np.zeros((1, SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    for i, base in enumerate(sequence[:SEQ_LEN].upper()):
        j = BASE_IDX.get(base)
        if j is not None:
            x[0, i, j] = 1.0
    x[0, :, 5 + species] = 1.0
    return x


def rc_input(x: np.ndarray) -> np.ndarray:
    o = x[:, ::-1, :].copy()
    o[:, :, :4] = o[:, :, [3, 2, 1, 0]]
    return np.ascontiguousarray(o)


def shuffle_span(seq: str, lo: int, hi: int, seed: int) -> str:
    """The browser's `knockoutMotif`, exactly: same LCG, same Fisher-Yates, same direction.

    Reimplemented rather than approximated so that a value swept here and a knockout run
    interactively for the same site and seed are the same number, not merely similar ones.
    """
    lo = max(0, min(lo, len(seq)))
    hi = max(lo, min(hi, len(seq)))
    if hi - lo < 2:
        return seq
    span = list(seq[lo:hi])
    state = (seed & 0xFFFFFFFF) or 1
    for i in range(len(span) - 1, 0, -1):
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
        j = int((state / 0x100000000) * (i + 1))
        span[i], span[j] = span[j], span[i]
    return seq[:lo] + "".join(span) + seq[hi:]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--k", type=int, default=5, help="shuffles per site")
    ap.add_argument("--tier", default="chip", choices=["chip", "conserved", "all"])
    ap.add_argument("--only", default=None)
    ap.add_argument("--out", default=str(ROOT / "public" / "vp-data"))
    args = ap.parse_args()

    import onnxruntime as ort

    ort.set_default_logger_severity(3)
    onnx_path = ROOT / "public" / "models" / "shorkie-fp16.onnx"
    if not onnx_path.exists():
        print(f"missing {onnx_path}", file=sys.stderr)
        return 1
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    names = json.loads((ROOT / "src" / "data" / "shorkieTrackNames.json").read_text())["identifiers"]
    T0 = np.array([i for i, n in enumerate(names) if "_T0_" in n and 1148 <= i < 4201])
    if T0.size != 384:
        print(f"expected 384 T0 tracks, found {T0.size}", file=sys.stderr)
        return 1

    out_dir = Path(args.out)
    for locus in loci["loci"]:
        if args.only and locus["id"] != args.only:
            continue
        ann_path = out_dir / f"{locus['id']}-ann.json"
        if not ann_path.exists():
            print(f"  skip {locus['id']}: no annotation (run make_annotations.py first)")
            continue
        ann = json.loads(ann_path.read_text())

        sites = []
        for f in ann["features"]:
            if f["cls"] != "tfbs" or f.get("truncated"):
                continue
            src = f.get("source")
            ev = f.get("evidence", "none")
            tier = "pwm" if src == "jaspar" else ("chip" if ev != "none" else "conserved")
            if args.tier == "chip" and tier != "chip":
                continue
            if args.tier == "conserved" and tier == "pwm":
                continue
            if f["end"] - f["start"] < 4:
                continue
            sites.append({**f, "tier": tier})
        if not sites:
            print(f"  {locus['id']:9s} no sites in the {args.tier} tier")
            continue

        # The bins to score over: the body of the gene this window is named for.
        own = [f for f in locus["features"] if f["name"] == locus["id"]]
        if not own:
            print(f"  skip {locus['id']}: window has no feature for its own gene")
            continue
        bin_lo = min(f["start"] for f in own)
        bin_hi = max(f["end"] for f in own)

        def score(seq: str) -> float:
            """logSED over the gene body, rc-averaged, on the paper's T0 subset."""
            x = encode(seq, loci["speciesIndex"])
            f = sess.run(["all_tracks"], {"sequence": x})[0][0]
            r = sess.run(["all_tracks"], {"sequence": rc_input(x)})[0][0][::-1]
            # Two-step indexing: y[0, a:b, T0] would return (tracks, bins).
            cov = 0.5 * (f[bin_lo:bin_hi][:, T0].mean(axis=-1)
                         + r[bin_lo:bin_hi][:, T0].mean(axis=-1))
            return float(np.log2(cov.sum() + 1.0))

        t0 = time.time()
        ref = score(locus["sequence"])
        records = []
        for si, s in enumerate(sites):
            vals = []
            seen: set[str] = set()
            for k in range(args.k):
                # Seed varies per shuffle AND per site, so two sites never share a permutation.
                alt = shuffle_span(locus["sequence"], s["start"], s["end"], seed=1 + si * 97 + k)
                if alt == locus["sequence"]:
                    continue            # a homopolymer cannot be shuffled; not a knockout
                seen.add(alt[s["start"]:s["end"]])
                vals.append(score(alt) - ref)
            if not vals:
                continue
            a = np.array(vals)
            # How many DISTINCT permutations the shuffles actually produced. A low-complexity site
            # has very few: `CCACCC` is five Cs and an A, so most "shuffles" reproduce each other
            # and one reproduces the original. Such a site cannot be knocked out by permutation at
            # all, and a near-zero effect there means "not shuffleable", not "the model ignores
            # it". Without this the two are indistinguishable in the output.
            records.append({
                "name": s["name"], "start": s["start"], "end": s["end"],
                "tier": s["tier"], "source": s["source"],
                "evidence": s.get("evidence", "none"),
                "effect": round(float(a.mean()), 6),
                "sd": round(float(a.std(ddof=1)) if a.size > 1 else 0.0, 6),
                "n": int(a.size),
                "distinct": len(seen),
            })

        records.sort(key=lambda r: r["effect"])
        payload = {
            "gene": locus["gene"], "reference": round(ref, 6),
            "binStart": bin_lo, "binEnd": bin_hi,
            "shuffles": args.k, "tier": args.tier,
            "score": "logSED over the window's own gene body, 384 T0 tracks, rc-averaged",
            "sites": records,
        }
        (out_dir / f"{locus['id']}-ko.json").write_text(json.dumps(payload, separators=(",", ":")))

        worst = records[0] if records else None
        print(f"  {locus['id']:9s} {locus['gene']:8s} {len(records):3d} sites x {args.k} shuffles"
              + (f"  strongest {worst['name']} {worst['effect']:+.4f} ± {worst['sd']:.4f}"
                 if worst else "")
              + f"  [{time.time() - t0:.0f}s]")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
