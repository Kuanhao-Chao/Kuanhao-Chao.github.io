"""
The paper's own attribution method, as a genome-browser lane.

Full in-silico saturation mutagenesis is 1,231 hours genome-wide and will never run at that scale
(3 substitutions x 16,384 positions x 2 strands a window, measured at 2,950 s a window). But it has
already been run on the 23 analysed windows, and those packs ship. This writes them into a
genome-length array at their true coordinates and leaves every other base as NO DATA.

**A sparse track costs almost nothing.** 23 x 16,384 bp is 3.10% of the genome, and a byte array
that is 97% zeros compresses to about **2% of a dense one** in PNG -- measured, 36 KB against 1,900
for chrIV. So the most expensive attribution in the suite becomes a lane for roughly 300 KB, and the
browser needs no new rendering: byte 0 already means no data, the renderer already leaves a gap
rather than a zero-height bar, and the lane already prints what fraction of the view is missing.

**The decode is IMPORTED, never rewritten.** `dequantize_rows` undoes a log-space pack that is
`sign(v) * 1e-4 * (10^|v| - 1)` with per-row lo/hi, and `saliency` applies the paper's transform --
mean-centre across the four bases, project on the reference. A hand-written decode using
expm1/log1p is monotone and odd, so it preserves signs and argmaxes and passes a sign check while
changing every correlation computed from it. That mistake shipped once.

Output:
    _scratch/genome-track/<chrom>-sk-ism.npy    float32, per base, SIGNED, NaN outside the windows

Usage:  python3 scripts/shorkie/make_ism_track.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

from make_genome_track import OUT, read_fasta            # noqa: E402
from make_ism import dequantize_rows, saliency           # noqa: E402

SCRATCH = Path(__file__).resolve().parent / "_scratch"
SEQ_LEN = 16384


def main() -> int:
    genome = read_fasta(SCRATCH / "sacCer3.fa")
    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())["loci"]
    packs = ROOT / "public" / "vp-data"

    arrays = {c: np.full(len(s), np.nan, dtype=np.float32) for c, s in genome.items()}
    written, skipped = [], []
    for L in loci:
        png, side = packs / f"{L['id']}-ism.png", packs / f"{L['id']}.json"
        if not (png.exists() and side.exists()):
            skipped.append(L["id"])
            continue
        meta = json.loads(side.read_text()).get("ism")
        if not meta:
            skipped.append(L["id"])
            continue
        plane = dequantize_rows(np.asarray(Image.open(png)),
                                np.array(meta["lo"]), np.array(meta["hi"]), meta["space"])
        sal = saliency(plane, L["sequence"][:SEQ_LEN])
        a = arrays[L["chrom"]]
        s = L["start"]
        n = min(SEQ_LEN, len(a) - s)
        # An overlap would mean two windows disagreeing about the same base, which is a fact worth
        # failing on rather than silently resolving by whichever locus came last.
        if np.isfinite(a[s:s + n]).any():
            raise SystemExit(f"{L['id']} overlaps a window already written at {L['chrom']}:{s}")
        a[s:s + n] = sal[:n]
        written.append((L["id"], L["gene"], float(np.abs(sal).max())))

    OUT.mkdir(parents=True, exist_ok=True)
    total_bp = sum(len(s) for s in genome.values())
    scored = 0
    for chrom, a in arrays.items():
        np.save(OUT / f"{chrom}-sk-ism.npy", a)
        scored += int(np.isfinite(a).sum())

    print(f"  {len(written)} windows written, {len(skipped)} skipped {skipped or ''}")
    print(f"  {scored:,} bases scored of {total_bp:,} ({scored / total_bp * 100:.2f}%)"
          f" -- expected {len(written) * SEQ_LEN:,}")
    assert scored == len(written) * SEQ_LEN, "a window was clipped by a chromosome end"
    fin = np.concatenate([a[np.isfinite(a)] for a in arrays.values()])
    print(f"  range {fin.min():+.4f} .. {fin.max():+.4f}, {100 * (fin < 0).mean():.1f}% negative")
    print("  strongest window: "
          + max(written, key=lambda r: r[2])[1] + f" ({max(r[2] for r in written):.4f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
