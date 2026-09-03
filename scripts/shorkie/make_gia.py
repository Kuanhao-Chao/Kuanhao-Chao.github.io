"""
Is a motif SUFFICIENT, or only necessary where it already sits?

The knockout sweep (`make_knockout_sweep.py`) is destructive: it shuffles a site that is already
there and reports what the prediction loses. That measures NECESSITY in context, and a site can be
necessary at its own promoter for reasons that have nothing to do with the motif -- it may sit
inside a nucleosome-free stretch, next to a TATA box, at a fixed distance from a TSS the model has
learned. Global Importance Analysis (Koo & Ploenzke 2021) asks the complementary question
constructively: implant the motif into backgrounds that contain nothing else, and see whether the
model responds to the motif alone.

  effect = log2(sum coverage WITH the motif + 1) - log2(sum WITHOUT + 1)

PAIRED, on the same background, so background-to-background variation cancels rather than being
averaged over. Backgrounds are dinucleotide shuffles of the real windows, which preserves yeast
base and dinucleotide composition -- including the poly(dA:dT) bias -- so the model is not being
asked about out-of-distribution input.

Three arms per motif, and the controls are the point:

  forward    the consensus, implanted as written
  reverse    its reverse complement -- a sequence-specific factor reads either strand, so a model
             that has learned the motif should respond to both; this model is NOT rc-equivariant
             (`augment_rc: false`), so that is a real question and not a symmetry being assumed
  scramble   the same bases in a shuffled order -- same composition, no motif. If the scramble
             moves the prediction as much as the motif does, the response is to COMPOSITION and
             the motif is doing nothing. Poly(dA:dT) is the case where this control is degenerate
             by construction (every permutation of AAAAAAAAAA is itself), and the script records
             how many distinct scrambles it actually managed rather than quietly reporting 0 spread.

The baseline pass is shared across every motif, so the cost is B + 3MB passes, not 2MB.

Output: src/data/shorkieGia.json

Usage:  python3 scripts/shorkie/make_gia.py <ckpt.h5> [--backgrounds 200]
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
from make_receptive import dinuc_shuffle                 # noqa: E402

SEQ_LEN, BIN_BP, CROP_BP = 16384, 16, 1024
IMPLANT = SEQ_LEN // 2                # window centre, comfortably inside the head's crop
LOCAL_BP = 512                        # bins within +-512 bp of the implant


IUPAC_COMP = str.maketrans("ACGTRYKMSWBVDHN", "TGCAYRMKSWVBHDN")


def rc(s: str) -> str:
    return s.translate(str.maketrans("ACGT", "TGCA"))[::-1]


def palindromic(pattern: str) -> bool:
    """True when a consensus is its own reverse complement, IUPAC codes included.

    This is the script's own correctness check rather than a curiosity: for such a motif the
    forward and reverse arms implant the IDENTICAL string, so their measured effects must agree
    exactly. Tye7's CACGTG is the case here. Anything else means the implantation, the reverse
    complement or the scoring is not doing what it claims.
    """
    return pattern.translate(IUPAC_COMP)[::-1] == pattern


def join_necessity() -> dict:
    """Cross the sufficiency measured here against the NECESSITY the knockout sweep measured.

    They are different questions and the page has only ever answered the first: the sweep shuffles
    a site that is already in a real promoter and reports what is lost, while GIA asks whether the
    motif alone moves a neutral background. A site can be necessary without being sufficient --
    it may be doing its work through the promoter around it -- and the two-by-two is the honest
    presentation. Needs no model, so it can be redone whenever either input changes.
    """
    gia = json.loads((ROOT / "src" / "data" / "shorkieGia.json").read_text())["motifs"]
    mot = json.loads((ROOT / "src" / "data" / "shorkieMotifs.json").read_text())["motifs"]
    alias = {}
    for m in mot:
        for a in m["aliases"] + [m["name"], m["id"]]:
            alias[a.upper()] = m["id"]

    ko: dict[str, list[float]] = {}
    for f in sorted((ROOT / "public" / "vp-data").glob("*-ko.json")):
        for site in json.loads(f.read_text()).get("sites", []):
            nm = (site.get("name") or "").upper()
            key = alias.get(nm) or alias.get(nm.split(".")[0])
            if key and site.get("effect") is not None:
                ko.setdefault(key, []).append(abs(float(site["effect"])))

    rows = []
    for mid, g in gia.items():
        eff = ko.get(mid)
        if not eff:
            continue
        nec = float(np.mean(eff))
        rows.append({"id": mid, "name": g["name"], "sites": len(eff),
                     "necessity": round(nec, 5),
                     "sufficiency": g["marginOverScramble"], "z": g["marginZ"],
                     "verdict": g["verdict"]})
    if not rows:
        return {}
    med = float(np.median([r["necessity"] for r in rows]))
    for r in rows:
        suff = r["verdict"].startswith("sufficient")
        r["quadrant"] = ("necessary and sufficient" if r["necessity"] >= med and suff
                         else "necessary, not sufficient" if r["necessity"] >= med
                         else "sufficient, not necessary here" if suff
                         else "neither")
    rows.sort(key=lambda r: -r["necessity"])
    return {"medianNecessity": round(med, 5), "note":
            "Necessity is the mean |logSED| when a curated site of this factor is shuffled in its "
            "own promoter, over every swept site; sufficiency is the GIA margin over the motif's "
            "own scramble. High/low necessity is split at the median of the factors that join.",
            "rows": rows}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint", nargs="?")
    ap.add_argument("--backgrounds", type=int, default=200)
    ap.add_argument("--device", default=None)
    ap.add_argument("--join-only", action="store_true",
                    help="recompute the necessity/sufficiency join from existing outputs")
    args = ap.parse_args()

    if args.join_only:
        path = ROOT / "src" / "data" / "shorkieGia.json"
        d = json.loads(path.read_text())
        d["necessityJoin"] = join_necessity()
        path.write_text(json.dumps(d, separators=(",", ":")))
        print(f"  {'factor':<10}{'sites':>6}{'necessity':>11}{'sufficiency':>13}{'z':>7}   quadrant")
        for r in d["necessityJoin"]["rows"]:
            print(f"  {r['name']:<10}{r['sites']:>6}{r['necessity']:>11.4f}"
                  f"{r['sufficiency']:>13.4f}{r['z']:>7.1f}   {r['quadrant']}")
        return 0
    if not args.checkpoint:
        raise SystemExit("a checkpoint is required unless --join-only")

    import torch
    from shorkie_torch import build

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    mot = json.loads((ROOT / "src" / "data" / "shorkieMotifs.json").read_text())
    iupac = mot["iupac"]
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

    lo_bin = max(0, (IMPLANT - LOCAL_BP - CROP_BP) // BIN_BP)
    hi_bin = min(896, (IMPLANT + LOCAL_BP - CROP_BP) // BIN_BP)

    def score(seq: str) -> tuple[float, float]:
        x = torch.from_numpy(encode(seq, loci["speciesIndex"])).to(dev)
        with torch.no_grad():
            y = model(x)[0][0][:, T0t].mean(dim=-1)
        return (float(torch.log2(y[lo_bin:hi_bin].sum() + 1.0)),
                float(torch.log2(y.sum() + 1.0)))

    rng = random.Random(20260903)
    print(f"  building {args.backgrounds} dinucleotide-shuffled backgrounds")
    bgs = []
    src = [L["sequence"][:SEQ_LEN] for L in loci["loci"]]
    for i in range(args.backgrounds):
        bgs.append(dinuc_shuffle(src[i % len(src)], rng))

    t0 = time.time()
    base = [score(b) for b in bgs]
    print(f"  baseline: local {np.mean([b[0] for b in base]):.3f} "
          f"global {np.mean([b[1] for b in base]):.3f}  [{time.time()-t0:.0f}s]")

    def instantiate(cons: str) -> str:
        return "".join(rng.choice(iupac.get(c, "ACGT")) for c in cons)

    out, passes = {}, len(bgs)
    print(f"\n  {'motif':<18}{'len':>4}{'forward':>10}{'reverse':>10}{'scramble':>10}"
          f"{'fwd/scr':>9}   verdict")
    for m in mot["motifs"]:
        cons = m["consensus"]
        if "|" in cons:
            continue                                     # alternation: no single string to implant
        arms: dict[str, list[float]] = {"forward": [], "reverse": [], "scramble": []}
        gl: dict[str, list[float]] = {k: [] for k in arms}
        distinct = set()
        for i, bg in enumerate(bgs):
            fwd = instantiate(cons)
            scr = list(fwd)
            rng.shuffle(scr)
            scr = "".join(scr)
            distinct.add(scr)
            for arm, ins in (("forward", fwd), ("reverse", rc(fwd)), ("scramble", scr)):
                s = bg[:IMPLANT] + ins + bg[IMPLANT + len(ins):]
                l, g = score(s)
                arms[arm].append(l - base[i][0])
                gl[arm].append(g - base[i][1])
                passes += 1
        f, r, s = (float(np.mean(arms[k])) for k in ("forward", "reverse", "scramble"))
        n = len(bgs)
        # Every arm ran on the SAME backgrounds, so the margin over the scramble is a paired
        # difference and its error bar is the sd of the per-background differences -- not
        # sd(forward)/sqrt(n), which throws away the pairing and is much the larger number.
        dif = np.array(arms["forward"]) - np.array(arms["scramble"])
        sem = float(dif.std(ddof=1) / np.sqrt(n))
        scr_sem = float(np.std(arms["scramble"], ddof=1) / np.sqrt(n))
        margin = float(dif.mean())
        if len(distinct) == 1:
            verdict = "degenerate scramble"
        elif abs(margin) < 2 * sem:
            verdict = "not sufficient"
        else:
            verdict = "sufficient, activating" if f > 0 else "sufficient, repressing"
        pal = palindromic(cons)
        if pal and abs(f - r) > 1e-9:
            raise SystemExit(f"{m['name']} is palindromic but its arms differ: {f} vs {r}")
        out[m["id"]] = {
            "name": m["name"], "consensus": cons, "length": len(cons),
            "forward": round(f, 5), "reverse": round(r, 5), "scramble": round(s, 5),
            "marginOverScramble": round(margin, 5), "marginSem": round(sem, 5),
            "marginZ": round(margin / sem, 3) if sem else None,
            "scrambleZ": round(s / scr_sem, 3) if scr_sem else None,
            "palindromic": pal,
            "globalForward": round(float(np.mean(gl["forward"])), 5),
            "forwardSd": round(float(np.std(arms["forward"])), 5),
            "distinctScrambles": len(distinct), "verdict": verdict,
        }
        print(f"  {m['name']:<18}{len(cons):>4}{f:>10.4f}{r:>10.4f}{s:>10.4f}"
              f"{margin / sem if sem else 0:>8.1f}{'  ✓' if pal else '   '} {verdict}")

    (ROOT / "src" / "data" / "shorkieGia.json").write_text(json.dumps({
        "note": "Global Importance Analysis: each consensus implanted at the centre of "
                f"{args.backgrounds} dinucleotide-shuffled backgrounds, paired against the same "
                "background without it. Effect is the change in log2 predicted T0 coverage over "
                f"+-{LOCAL_BP} bp of the implant. The scramble arm is the composition control; the "
                "reverse arm asks whether the model reads the motif on either strand.",
        "backgrounds": args.backgrounds, "implantBp": IMPLANT, "localBp": LOCAL_BP,
        "baselineLocal": round(float(np.mean([b[0] for b in base])), 5),
        "motifs": out,
    }, separators=(",", ":")))
    print(f"\n  {passes:,} forward passes in {(time.time()-t0)/60:.1f} min")

    path = ROOT / "src" / "data" / "shorkieGia.json"
    d = json.loads(path.read_text())
    d["necessityJoin"] = join_necessity()
    path.write_text(json.dumps(d, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
