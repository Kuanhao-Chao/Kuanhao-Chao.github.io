"""
Check the genome-wide Shorkie_LM track against everything that can contradict it.

Four things, each of which would fail differently:

1. **Coverage.** Every base of all 17 sequences has a score and the total is exactly 12,157,105.
   A windowing bug shows up here as NaNs or as a length that does not match sacCer3.

2. **Agreement with the primary regions -- in shape, not in magnitude, and the reason matters.**
   Each of the 23 shipped loci was scored as ONE window starting at `locus.start`; the track scores
   the same bases from windows starting at multiples of 4,096. Those are different **phases** of the
   U-Net's 128 bp pooling grid, and the model is markedly phase-sensitive:

       windows at the SAME phase (mod 128)   mean |dIC|  0.0020
       windows at DIFFERENT phases           mean |dIC|  0.0395     19.7x

   Measured on FUN12 across nine window starts: four at phase 67 agree to 0.0008-0.0040, three at
   phase 0 agree to 0.0008-0.0013, and every cross-phase pair sits at 0.054. That is an order of
   magnitude larger than the edge effect the flank was chosen for, and it is why this check asserts
   CORRELATION rather than an absolute difference: an absolute bound tight enough to be meaningful
   is unreachable between two different phases, and one loose enough to pass would test nothing.

   The track is self-consistent because every one of its windows is phase 0 -- so every base in the
   genome is scored on one grid, which is what makes the browser's values comparable to each other.
   The per-locus packs are on whatever phase `locus.start` happens to give.

3. **The seams.** Cores abut every 12,288 bp. If the flank were too small the track would step at
   those joins. Tested by comparing |dIC| across a seam against |dIC| at interior positions: they
   must be indistinguishable, because a seam is only a seam in the bookkeeping.

4. **The scale is real.** IC must lie in [0, 2] bits, and chrM must come out markedly more
   predictable than the nuclear chromosomes -- it is AT-rich and repetitive, so a track that did not
   show that would be measuring something else.

Usage:  python3 scripts/shorkie/verify_genome_track.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
TRACK = Path(__file__).resolve().parent / "_scratch" / "genome-track"

FAILED = 0


def check(ok: bool, label: str, detail: str = "") -> None:
    global FAILED
    FAILED += not ok
    print(f"  {'PASS' if ok else 'FAIL'}  {label:52s} {detail}")


def main() -> int:
    man = json.loads((TRACK / "manifest.json").read_text())
    chroms = man["chroms"]
    tracks = {c: np.load(TRACK / f"{c}.npy") for c in chroms}

    print("=== 1. coverage ===")
    total = sum(len(v) for v in tracks.values())
    nan = sum(int(np.isnan(v).sum()) for v in tracks.values())
    check(total == 12_157_105, "every base of sacCer3 has a score", f"{total:,} bases, {len(tracks)} sequences")
    check(nan == 0, "no base was left unscored", f"{nan} NaN")
    bad_len = [c for c, v in tracks.items() if len(v) != chroms[c]["length"]]
    check(not bad_len, "each array matches its manifest length", f"{bad_len[:3] or 'all match'}")

    print("\n=== 2. agreement with the 23 primary regions ===")
    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())["loci"]
    worst, worst_where, checked = 0.0, "", 0
    rs = []
    for l in loci:
        lm_p = ROOT / "public" / "lm-data" / f"{l['id']}-lm.json"
        if not lm_p.exists() or l["chrom"] not in tracks:
            continue
        spec = json.loads(lm_p.read_text())["masked"]
        q = np.asarray(Image.open(ROOT / "public" / "lm-data" / f"{l['id']}-masked.png")).astype(np.float64)
        lo = np.asarray(spec["lo"])[:, None]
        hi = np.asarray(spec["hi"])[:, None]
        v = q / 255.0 * (hi - lo) + lo
        if spec.get("space") == "log":
            v = 10.0 ** v
        p = v.T                                            # [16384, 4]
        p = p / np.maximum(p.sum(axis=1, keepdims=True), 1e-12)
        pack_ic = 2.0 + (p * np.log2(np.clip(p, 1e-12, 1))).sum(axis=1)

        # The central half only: the pack's own edges have a truncated flank by construction.
        a, b = 4096, 12288
        gen = tracks[l["chrom"]][l["start"] + a: l["start"] + b]
        if len(gen) != b - a:
            continue
        d = np.abs(gen - pack_ic[a:b])
        checked += 1
        rs.append(float(np.corrcoef(gen, pack_ic[a:b])[0, 1]))
        if d.mean() > worst:
            worst, worst_where = float(d.mean()), l["gene"]
    check(checked >= 20, "compared against the shipped packs", f"{checked} regions")
    # Structure, not magnitude: the two are on different phases of the 128 bp pooling grid, which
    # costs ~0.04 bits of absolute agreement while leaving the profile intact.
    check(min(rs) > 0.93, "track and packs agree in shape across every region",
          f"min r {min(rs):.4f}, median {np.median(rs):.4f}")
    check(worst < 0.09, "and the offset stays within the measured phase effect",
          f"worst mean |dIC| {worst:.4f} at {worst_where} (cross-phase effect ~0.040)")

    print("\n=== 2b. the track is on one grid phase, which is what makes it comparable ===")
    from make_genome_track import plan_windows          # the rule itself, not a copy of it
    phases = set()
    for c, v in tracks.items():
        for s, _c0, _c1 in plan_windows(len(v)):
            phases.add(s % 128)
    check(phases <= {0}, "every window starts on the pooling grid",
          f"phases seen: {sorted(phases)}")

    print("\n=== 3. the seams ===")
    core = man["core"]
    seam_d, interior_d = [], []
    rng = np.random.default_rng(0)
    for c, v in tracks.items():
        for s in range(core, len(v) - 1, core):
            seam_d.append(abs(float(v[s] - v[s - 1])))
        n = len(seam_d)
        idx = rng.integers(1, len(v) - 1, size=max(n, 1))
        interior_d.extend(abs(float(v[i] - v[i - 1])) for i in idx[:200])
    sm, im = float(np.mean(seam_d)), float(np.mean(interior_d))
    check(len(seam_d) > 900, "every core boundary was examined", f"{len(seam_d)} seams")
    # A real step would make the seam difference stand out against ordinary base-to-base variation.
    check(sm < im * 1.5, "no step at the core boundaries",
          f"mean |dIC| across a seam {sm:.4f} vs {im:.4f} at a random interior position")

    print("\n=== 4. the scale is real ===")
    lo = min(float(v.min()) for v in tracks.values())
    hi = max(float(v.max()) for v in tracks.values())
    check(-0.01 <= lo and hi <= 2.001, "information content lies in [0, 2] bits", f"[{lo:.4f}, {hi:.4f}]")
    nuc = [chroms[c]["mean"] for c in chroms if c != "chrM"]
    check("chrM" in chroms and chroms["chrM"]["mean"] > max(nuc) * 1.5,
          "chrM is far more predictable than the nuclear genome",
          f"chrM {chroms.get('chrM', {}).get('mean', 0):.4f} vs nuclear max {max(nuc):.4f}")

    short = sum(m["shortFlankBases"] for m in chroms.values())
    print(f"\n  {short:,} bases had a flank cut short by a chromosome end "
          f"({short / total * 100:.2f}% of the genome), recorded in the manifest")
    print("\n" + ("ALL CHECKS PASSED" if not FAILED else f"{FAILED} CHECK(S) FAILED"))
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
