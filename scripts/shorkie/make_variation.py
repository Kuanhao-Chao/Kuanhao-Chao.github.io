"""
Do the variants that actually segregate in yeast avoid the bases the model says matter?

Every other analysis here asks what the model thinks. This one asks whether what it thinks lines
up with what selection has already done, and it needs NO forward passes at all: the mutagenesis
packs hold all three substitutions at every base of all 23 windows, and UCSC's `evaSnp8` puts
2,544 real segregating variants inside them.

The comparison is PAIRED AT THE BASE, which is what makes it a test rather than a correlation.
For each variant, the observed alternate allele's predicted effect is compared with the two
alternates at the same position that nature did not choose. Position, local sequence context,
gene, coverage and the model's own idiosyncrasies are all held fixed by construction, so no null
model is needed and no matched-background sampling can go wrong.

    ratio = |effect(observed allele)| / mean |effect(the two unobserved alleles)|

Under neutrality that is 1. Below 1 means the alleles that survived are the milder ones.

Split three ways, because the classes are three different strengths of prior expectation:
missense changes a protein, synonymous does not, and non-coding is neither. A model that has
learned regulatory grammar rather than gene structure should separate them.

Two controls it cannot run without:
  * The reference base named in the variant record must match sacCer3 at that coordinate. A
    coordinate convention off by one, or an allele reported on the wrong strand, would otherwise
    produce a clean and completely meaningless answer.
  * The reference row of the ISM plane is ZERO by construction, so it is excluded rather than
    averaged in -- including it would drag every unobserved mean toward zero and manufacture the
    result this script is looking for.

Output: src/data/shorkieVariation.json

Usage:  python3 scripts/shorkie/make_variation.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

from make_ism import dequantize_rows                     # noqa: E402  the pack's OWN inverse

BASES = "ACGT"
SEQ_LEN = 16384
CLASSES = ("variant_missense", "variant_synonymous", "variant_noncoding")
ALLELE = re.compile(r"\b([ACGT])>([ACGT])\b")


def load_ism(locus_id: str) -> np.ndarray | None:
    """The [4 x 16,384] mutagenesis plane, through the pack's own dequantiser."""
    side = ROOT / "public" / "vp-data" / f"{locus_id}.json"
    png = ROOT / "public" / "vp-data" / f"{locus_id}-ism.png"
    if not side.exists() or not png.exists():
        return None
    spec = json.loads(side.read_text()).get("ism")
    if not spec:
        return None
    q = np.array(Image.open(png).convert("L"), dtype=np.uint8)
    if q.shape != (spec["rows"], spec["cols"]):
        raise SystemExit(f"{locus_id}: ism pack is {q.shape}, sidecar says "
                         f"{(spec['rows'], spec['cols'])}")
    return dequantize_rows(q, spec["lo"], spec["hi"], spec.get("space", "linear"))


def main() -> int:
    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())["loci"]
    gd = ROOT / "public" / "genome-data"

    per_class: dict[str, list[float]] = {c: [] for c in CLASSES}
    obs_abs: dict[str, list[float]] = {c: [] for c in CLASSES}
    unobs_abs: dict[str, list[float]] = {c: [] for c in CLASSES}
    signed_obs: dict[str, list[float]] = {c: [] for c in CLASSES}
    checked = mismatched = skipped = 0
    per_locus: dict[str, dict] = {}

    for L in loci:
        plane = load_ism(L["id"])
        if plane is None:
            continue
        seq = L["sequence"][:SEQ_LEN].upper()
        feat_p = gd / L["chrom"] / "features.json"
        if not feat_p.exists():
            continue
        fj = json.loads(feat_p.read_text())
        names = fj["names"]
        hits = 0
        for cls in CLASSES:
            for rec in fj["classes"].get(cls, []):
                start = rec[0]
                off = start - L["start"]
                if not (0 <= off < SEQ_LEN):
                    continue
                m = ALLELE.search(names[rec[2]])
                if not m:
                    skipped += 1
                    continue
                ref, alt = m.group(1), m.group(2)
                checked += 1
                # The control that makes the coordinates trustworthy. A one-base convention error,
                # or an allele reported against the other strand, gives a clean meaningless answer.
                if seq[off] != ref:
                    mismatched += 1
                    continue
                ri, ai = BASES.index(ref), BASES.index(alt)
                if ai == ri:
                    continue
                obs = float(plane[ai, off])
                # The reference row is zero by construction; averaging it in would drag every
                # unobserved mean toward zero and manufacture the result.
                others = [float(plane[b, off]) for b in range(4) if b not in (ri, ai)]
                if not others:
                    continue
                un = float(np.mean([abs(v) for v in others]))
                obs_abs[cls].append(abs(obs))
                unobs_abs[cls].append(un)
                signed_obs[cls].append(obs)
                if un > 1e-12:
                    per_class[cls].append(abs(obs) / un)
                hits += 1
        if hits:
            per_locus[L["id"]] = {"gene": L["gene"], "variants": hits}

    if not checked:
        raise SystemExit("no variants matched a window; check the feature files")

    out: dict = {
        "note": "Each segregating variant's predicted effect against the two alternate alleles at "
                "the SAME base that nature did not choose. Paired at the base, so position, "
                "context and gene are held fixed and no null model is needed. Below 1 means the "
                "alleles that survived are the milder ones.",
        "source": "UCSC evaSnp8 via public/genome-data/<chrom>/features.json; effects from the "
                  "shipped mutagenesis packs, decoded with make_ism.dequantize_rows.",
        "refChecked": checked, "refMismatched": mismatched, "noAlleleInRecord": skipped,
        "classes": {}, "loci": per_locus,
    }
    print(f"  reference base matched sacCer3 at {checked - mismatched:,} of {checked:,} "
          f"variants ({mismatched} mismatched, {skipped} carried no allele)\n")
    print(f"  {'class':<22}{'n':>6}{'obs |eff|':>11}{'unobs |eff|':>13}"
          f"{'ratio':>8}{'median':>8}{'< 1':>8}{'sign z':>8}")
    for cls in CLASSES:
        r = np.array(per_class[cls], dtype=float)
        if not len(r):
            continue
        o = float(np.mean(obs_abs[cls]))
        u = float(np.mean(unobs_abs[cls]))
        # A SIGN TEST on the paired differences, which is the test the design already earns: each
        # variant is its own control, so under neutrality the observed allele is the milder one
        # exactly half the time. Distribution-free, which matters because these ratios are heavily
        # skewed -- the mean of |effect| and the median of the per-site ratios disagree for
        # missense (0.99 against 0.90) because a few sites where the observed allele is much the
        # louder pull the mean up.
        below = int((r < 1).sum())
        n = len(r)
        z = (below - n / 2) / np.sqrt(n / 4) if n else 0.0
        out["classes"][cls] = {
            "n": n,
            "meanObserved": round(o, 6), "meanUnobserved": round(u, 6),
            "ratioOfMeans": round(o / u, 4) if u else None,
            "medianRatio": round(float(np.median(r)), 4),
            "fractionBelow1": round(below / n, 4),
            "signTestZ": round(float(z), 2),
            "meanSignedObserved": round(float(np.mean(signed_obs[cls])), 6),
        }
        print(f"  {cls:<22}{n:>6}{o:>11.5f}{u:>13.5f}"
              f"{o/u:>8.4f}{float(np.median(r)):>8.4f}{below/n:>8.1%}{z:>8.1f}")

    (ROOT / "src" / "data" / "shorkieVariation.json").write_text(
        json.dumps(out, separators=(",", ":")))
    tot = sum(v["n"] for v in out["classes"].values())
    print(f"\n  {tot:,} variants over {len(per_locus)} windows, no forward passes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
