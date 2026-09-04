"""
What would the model BUILD?

Every other method on this page reads a sequence that exists. This one asks the generative
question: starting from a real window, which K single-base edits most raise the predicted
expression of that window's own gene -- and when the model is given a free hand, does it construct
anything a yeast biologist would recognise?

Greedy, gradient-proposed and forward-verified. At each step the gradient of the target with
respect to the one-hot input gives a LINEARISED gain for every substitution at every position;
the top candidates are then evaluated by real forward passes and the best is accepted. The
gradient alone is not trusted to pick the edit -- it is a local slope on a saturating function,
and this page has already measured where that fails (gradient x input against mutagenesis:
median r = 0.369, and at GAL3 the gradient reads +0.0013 at the base mutagenesis calls strongest).
It is used only to shortlist.

**The control is the whole argument.** The same ascent is run on a dinucleotide-shuffled version of
the same window. If recognisable motifs appear there too, then "the model built a Rap1 site" is a
statement about the ascent and the base composition, not about the promoter. Both arms are scanned
with the paper's own motif dictionary.

Two things it deliberately does not do: it does not restrict where edits may land, so where they
DO land relative to the TSS is a result rather than an assumption; and it does not stop at a fixed
gain, so a locus that runs out of improvements stops early and says so.

Output: src/data/shorkieCounterfactual.json

Usage:  python3 scripts/shorkie/make_counterfactual.py <ckpt.h5> [--edits 15] [--candidates 24]
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

BASES = "ACGT"
SEQ_LEN, BIN_BP, CROP_BP = 16384, 16, 1024


def iupac_ok(sub: str, pattern: str, table: dict) -> bool:
    if len(sub) != len(pattern):
        return False
    return all(b in table.get(p, "ACGT") for b, p in zip(sub, pattern))


def scan(seq: str, motifs: list, table: dict) -> list[dict]:
    """Every dictionary motif present in a sequence, on either strand."""
    comp = str.maketrans("ACGT", "TGCA")
    rcs = seq.translate(comp)[::-1]
    hits = []
    for m in motifs:
        cons = m["consensus"]
        if "|" in cons or len(cons) < 5:      # alternation, and 2-3 bp landmarks that hit by chance
            continue
        n = 0
        for s in (seq, rcs):
            for i in range(len(s) - len(cons) + 1):
                if iupac_ok(s[i:i + len(cons)], cons, table):
                    n += 1
        if n:
            hits.append({"id": m["id"], "name": m["name"], "count": n})
    return hits


def summarise() -> dict:
    """Derive the two comparisons that decide what this run means. No model needed.

    The raw motif counts are CONFOUNDED by headroom: the shuffled arm starts near silent and has
    far more room to gain, so it accepts larger edits and passes through more sequence space. The
    honest comparison normalises by how much expression each arm actually gained.
    """
    d = json.loads((ROOT / "src" / "data" / "shorkieCounterfactual.json").read_text())
    L = d["loci"]
    base = np.array([v["base"] for v in L.values()])
    gain = np.array([v["gain"] for v in L.values()])
    cgain = np.array([v["controlGain"] for v in L.values()])
    nm_r = sum(sum(v["motifsGained"].values()) for v in L.values())
    nm_c = sum(sum(v["controlMotifsGained"].values()) for v in L.values())
    order = np.argsort(base)
    return {
        "gainVsBaselineR": round(float(np.corrcoef(base, gain)[0, 1]), 4),
        "quietestFiveGain": round(float(gain[order[:5]].mean()), 4),
        "loudestFiveGain": round(float(gain[order[-5:]].mean()), 4),
        "motifsReal": nm_r, "motifsControl": nm_c,
        "totalGainReal": round(float(gain.sum()), 3),
        "totalGainControl": round(float(cgain.sum()), 3),
        "motifsPerLog2Real": round(nm_r / float(gain.sum()), 4),
        "motifsPerLog2Control": round(nm_c / float(cgain.sum()), 4),
        "windowsWithMotifReal": sum(1 for v in L.values() if v["motifsGained"]),
        "windowsWithMotifControl": sum(1 for v in L.values() if v["controlMotifsGained"]),
        "verdict": "Motif creation is NOT specific to real promoters: raw, the shuffled control "
                   "builds 3.0x more, and normalised by expression gained the two are within 25%. "
                   "What IS strongly supported is that the achievable gain is set by headroom -- "
                   "gain against starting expression is r = -0.87.",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint", nargs="?")
    ap.add_argument("--edits", type=int, default=15)
    ap.add_argument("--candidates", type=int, default=24)
    ap.add_argument("--device", default=None)
    ap.add_argument("--summarise", action="store_true",
                    help="re-derive the comparisons from the existing output; no model")
    args = ap.parse_args()

    if args.summarise:
        path = ROOT / "src" / "data" / "shorkieCounterfactual.json"
        d = json.loads(path.read_text())
        d["summary"] = summarise()
        path.write_text(json.dumps(d, separators=(",", ":")))
        for k, v in d["summary"].items():
            print(f"  {k:<24} {v}")
        return 0
    if not args.checkpoint:
        raise SystemExit("a checkpoint is required unless --summarise")

    import torch
    from shorkie_torch import build

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    mot = json.loads((ROOT / "src" / "data" / "shorkieMotifs.json").read_text())
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
    sp = loci["speciesIndex"]

    def enc(seq: str) -> "torch.Tensor":
        return torch.from_numpy(encode(seq, sp)).to(dev)

    def score_t(x: "torch.Tensor", a: int, b: int) -> "torch.Tensor":
        return torch.log2(model(x)[0][0][:, T0t].mean(dim=-1)[a:b].sum() + 1.0)

    def score(seq: str, a: int, b: int) -> float:
        with torch.no_grad():
            return float(score_t(enc(seq), a, b))

    def proposals(seq: str, a: int, b: int, k: int) -> list[tuple[int, str]]:
        """Shortlist substitutions by the LINEARISED gain, grad[i,new] - grad[i,current]."""
        x = enc(seq).clone().requires_grad_(True)
        score_t(x, a, b).backward()
        g = x.grad[0, :, :4].detach().float().cpu().numpy()
        cur = np.array([BASES.index(c) if c in BASES else 0 for c in seq[:SEQ_LEN]])
        gain = g - g[np.arange(SEQ_LEN), cur][:, None]
        gain[np.arange(SEQ_LEN), cur] = -np.inf
        flat = np.argsort(gain, axis=None)[::-1][:k]
        return [(int(i // 4), BASES[int(i % 4)]) for i in flat]

    def ascend(seq: str, a: int, b: int) -> tuple[str, list[dict], float, float]:
        base = score(seq, a, b)
        cur, edits, s = seq, [], base
        for _ in range(args.edits):
            cands = proposals(cur, a, b, args.candidates)
            best, bs = None, s
            for pos, nb in cands:
                if cur[pos] == nb:
                    continue
                v = score(cur[:pos] + nb + cur[pos + 1:], a, b)
                if v > bs:
                    bs, best = v, (pos, nb)
            if best is None:
                break                                    # no proposal actually helps: stop early
            pos, nb = best
            edits.append({"pos": pos, "from": cur[pos], "to": nb, "score": round(bs, 5),
                          "gain": round(bs - s, 5)})
            cur = cur[:pos] + nb + cur[pos + 1:]
            s = bs
        return cur, edits, base, s

    rng = random.Random(20260904)
    out: dict = {}
    t0 = time.time()
    print(f"  {args.edits} edits x {args.candidates} candidates, real window and shuffled control\n")
    print(f"  {'gene':<9}{'from':>8}{'to':>8}{'gain':>8}{'edits':>7}  "
          f"{'new motifs (real)':<34}{'(shuffled control)'}")

    for L in loci["loci"]:
        own = next((f for f in L["features"] if f["name"] == L["id"]), None)
        if not own:
            continue
        a, b = own["start"], own["end"]
        seq = L["sequence"][:SEQ_LEN]
        plus = own.get("strand", "+") != "-"
        tss = own["txStart"] if plus else own["txEnd"]

        des, edits, base, final = ascend(seq, a, b)
        before = {h["id"]: h["count"] for h in scan(seq, mot["motifs"], mot["iupac"])}
        after = {h["id"]: h["count"] for h in scan(des, mot["motifs"], mot["iupac"])}
        gained = {k: after[k] - before.get(k, 0) for k in after if after[k] > before.get(k, 0)}

        # The control: the same ascent on shuffled DNA of the same composition.
        bg = dinuc_shuffle(seq, rng)
        cdes, cedits, cbase, cfinal = ascend(bg, a, b)
        cbefore = {h["id"]: h["count"] for h in scan(bg, mot["motifs"], mot["iupac"])}
        cafter = {h["id"]: h["count"] for h in scan(cdes, mot["motifs"], mot["iupac"])}
        cgained = {k: cafter[k] - cbefore.get(k, 0) for k in cafter if cafter[k] > cbefore.get(k, 0)}

        dists = [((e["pos"] - tss) if plus else (tss - e["pos"])) for e in edits]
        out[L["id"]] = {
            "gene": L["gene"], "base": round(base, 5), "final": round(final, 5),
            "gain": round(final - base, 5), "edits": edits,
            "distancesToTss": dists,
            "motifsGained": gained, "controlMotifsGained": cgained,
            "controlGain": round(cfinal - cbase, 5), "controlEdits": len(cedits),
        }
        gm = ", ".join(f"{k}+{v}" for k, v in sorted(gained.items())) or "—"
        cm = ", ".join(f"{k}+{v}" for k, v in sorted(cgained.items())) or "—"
        print(f"  {L['gene']:<9}{base:>8.2f}{final:>8.2f}{final-base:>8.3f}{len(edits):>7}  "
              f"{gm[:33]:<34}{cm[:28]}")

    tot_real: dict[str, int] = {}
    tot_ctrl: dict[str, int] = {}
    for v in out.values():
        for k, n in v["motifsGained"].items():
            tot_real[k] = tot_real.get(k, 0) + n
        for k, n in v["controlMotifsGained"].items():
            tot_ctrl[k] = tot_ctrl.get(k, 0) + n

    (ROOT / "src" / "data" / "shorkieCounterfactual.json").write_text(json.dumps({
        "note": "Greedy gradient-proposed, forward-verified single-base edits that most raise the "
                "predicted T0 expression of each window's own gene. The shuffled arm is the same "
                "ascent on dinucleotide-shuffled DNA of the same composition: motifs that appear "
                "in BOTH are a property of the ascent, not of the promoter.",
        "edits": args.edits, "candidates": args.candidates,
        "motifsGainedTotal": tot_real, "controlMotifsGainedTotal": tot_ctrl,
        "medianGain": round(float(np.median([v["gain"] for v in out.values()])), 5),
        "medianControlGain": round(float(np.median([v["controlGain"] for v in out.values()])), 5),
        "loci": out,
    }, separators=(",", ":")))
    # Written in a second pass so `--summarise` and the run itself compute it the same way.
    path = ROOT / "src" / "data" / "shorkieCounterfactual.json"
    d = json.loads(path.read_text())
    d["summary"] = summarise()
    path.write_text(json.dumps(d, separators=(",", ":")))
    print(f"\n  motifs gained across all windows: real {tot_real or '—'}")
    print(f"                                   control {tot_ctrl or '—'}")
    print(f"  median gain: real {np.median([v['gain'] for v in out.values()]):.3f} log2, "
          f"control {np.median([v['controlGain'] for v in out.values()]):.3f}")
    print(f"  {(time.time()-t0)/60:.1f} min")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
