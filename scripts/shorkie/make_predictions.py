"""
Run every preset locus through Shorkie at the full 16,384 bp context and ship the predictions.

The page used to have a prediction only after a ~17 s WASM inference the reader had to click for
and wait through. If that click was missed, mistimed or abandoned, every output panel was
legitimately empty -- which is exactly what it looked like. Precomputing removes the failure mode:
the coverage, the per-track view and the track selector are populated the moment the page loads,
and loading the model becomes about live activations, sequence editing and motif knockouts.

Only the PREDICTIONS are shipped. The per-stage activations are ~40 MB per locus and stay live.

All 14 loci take about 1.6 s here, so this is re-run whenever the model or the loci change.

Usage:  python3 scripts/shorkie/make_predictions.py <onnx> [--out src/data/shorkiePredictions.json]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE_IDX = {"A": 0, "C": 1, "G": 2, "T": 3}
SEQ_LEN, IN_CHANNELS, N_BINS = 16384, 170, 896

# The four assay blocks, in the released targets sheet's order -- NOT the paper's.
GROUPS = [("chip_exo", 0, 1128), ("chip_mnase", 1128, 1148),
          ("rnaseq_tf", 1148, 4201), ("rnaseq_strain", 4201, 5215)]


def encode(sequence: str, species: int) -> np.ndarray:
    x = np.zeros((1, SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    for i, base in enumerate(sequence[:SEQ_LEN].upper()):
        j = BASE_IDX.get(base)
        if j is not None:
            x[0, i, j] = 1.0
    x[0, :, 5 + species] = 1.0
    return x


def main() -> int:
    import onnxruntime as ort

    onnx_path = sys.argv[1]
    out_path = ROOT / (
        sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv
        else "src/data/shorkiePredictions.json"
    )
    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    names = json.loads((ROOT / "src" / "data" / "shorkieTrackNames.json").read_text())["identifiers"]
    # The T0 baseline set the paper uses for its Figure 4 ISM.
    baseline = [i for i, n in enumerate(names) if "_T0_" in n and 1148 <= i < 4201]
    print(f"{len(baseline)} T0 baseline tracks, first {names[baseline[0]]}")

    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    out_names = [o.name for o in sess.get_outputs()]

    predictions = {}
    print(f"\n{'gene':<9}{'bases':>8}{'RNA-seq peak':>14}{'bin':>6}{'T0 peak':>10}")
    for locus in loci["loci"]:
        seq = locus["sequence"]
        valid = sum(1 for b in seq[:SEQ_LEN].upper() if b in BASE_IDX)
        if valid < SEQ_LEN:
            print(f"  WARNING: {locus['gene']} has only {valid} of {SEQ_LEN} valid bases")
        got = dict(zip(out_names, sess.run(None, {"sequence": encode(seq, loci["speciesIndex"])})))
        tracks = got["tracks"][0]                     # [896, 4]
        t0 = got["all_tracks"][0][:, baseline].mean(axis=1)

        predictions[locus["id"]] = {
            "gene": locus["gene"],
            # 2 dp: these are coverage sums in the hundreds, and the third decimal is far below
            # both the assay's noise and fp16's own resolution at this magnitude.
            "groups": [[round(float(v), 2) for v in tracks[:, i]] for i in range(len(GROUPS))],
            "baseline": [round(float(v), 2) for v in t0],
        }
        rna = tracks[:, 2]
        print(f"{locus['gene']:<9}{valid:>8}{rna.max():>14.2f}{int(rna.argmax()):>6}{t0.max():>10.2f}")

    payload = {
        "note": ("Predictions for every preset locus at the full 16,384 bp context, so the output "
                 "panels are populated before the model is loaded. Group order is the released "
                 "targets sheet's. `baseline` is the mean of the T0 RNA-seq tracks, which is the "
                 "set the paper's Figure 4 ISM uses."),
        "model": Path(onnx_path).name,
        "bins": N_BINS,
        "groups": [g[0] for g in GROUPS],
        "baselineTracks": len(baseline),
        "loci": predictions,
    }
    out_path.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"\nwrote {out_path.relative_to(ROOT)}  ({out_path.stat().st_size / 1024:.0f} kB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
