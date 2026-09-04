"""
WHERE does a motif work?

`make_gia.py` asks whether a motif does anything at all, implanted at the centre of a neutral
background. This asks the question a promoter actually poses: the same motif, walked across a real
window one step at a time, scored on that window's own gene. The output is effect against distance
to the transcription start site -- the constructive counterpart to the TSS metaprofile already
measured from attribution (1.40x a gene's mean base in the 240 bp upstream against 0.94x inside).

**Implanted into REAL sequence, with a scramble control at every position.** Overwriting 8 bp of a
real promoter destroys whatever was there, so a bare implantation curve is partly a map of what was
DESTROYED rather than of what was added. At each position the same bases in a shuffled order are
implanted too, and the reported quantity is the difference:

    effect(p) = score(motif at p) - score(scramble at p)

Both arms overwrite the same span with the same composition, so whatever was destroyed cancels and
what is left is the motif.

**Aligned on the direction of transcription**, never on coordinates: `txStart` on the plus strand,
`txEnd` on the minus, and minus-strand profiles reversed. Without that flip the average puts
promoters against terminators and flattens into something that looks exactly like a real null --
a mistake this repo has already made once with the attribution metaprofile.

Output: src/data/shorkiePosition.json

Usage:  python3 scripts/shorkie/make_position.py <ckpt.h5> [--step 64]
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
from make_gia import rc                                  # noqa: E402

SEQ_LEN, BIN_BP, CROP_BP = 16384, 16, 1024
# Chosen for what each one is: the necessary-but-not-sufficient general factor, the strongest
# sufficient activator, the core promoter element, and the strongest repressor.
MOTIFS = ["rap1", "cbf1", "tata", "ume6"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("--step", type=int, default=64)
    ap.add_argument("--device", default=None)
    args = ap.parse_args()

    import torch
    from shorkie_torch import build

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    mot = json.loads((ROOT / "src" / "data" / "shorkieMotifs.json").read_text())
    iupac = mot["iupac"]
    by_id = {m["id"]: m for m in mot["motifs"]}
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

    rng = random.Random(20260904)
    positions = list(range(0, SEQ_LEN - 32, args.step))

    def score(seq: str, a: int, b: int) -> float:
        x = torch.from_numpy(encode(seq, loci["speciesIndex"])).to(dev)
        with torch.no_grad():
            y = model(x)[0][0][:, T0t].mean(dim=-1)
        return float(torch.log2(y[a:b].sum() + 1.0))

    t0, passes = time.time(), 0
    out: dict = {}
    print(f"  {len(positions)} positions x {len(MOTIFS)} motifs x {len(loci['loci'])} windows, "
          f"motif and scramble at each")

    for mid in MOTIFS:
        cons = by_id[mid]["consensus"]
        inst = "".join(rng.choice(iupac.get(c, "ACGT")) for c in cons)
        scr = list(inst)
        rng.shuffle(scr)
        scr = "".join(scr)
        n = len(inst)
        rows: list[tuple[float, float]] = []      # (distance to TSS, effect)
        per_locus: dict[str, list[float]] = {}
        for L in loci["loci"]:
            own = next((f for f in L["features"] if f["name"] == L["id"]), None)
            if not own:
                continue
            a, b = own["start"], own["end"]
            seq = L["sequence"][:SEQ_LEN]
            plus = own.get("strand", "+") != "-"
            # `txStart`/`txEnd` are WINDOW BASE PAIRS while `start`/`end` on the same feature are
            # OUTPUT BINS -- two coordinate systems in one record, so name which is which rather
            # than inferring it from magnitude.
            tss = own["txStart"] if plus else own["txEnd"]
            eff = []
            for p in positions:
                s_m = seq[:p] + inst + seq[p + n:]
                s_s = seq[:p] + scr + seq[p + n:]
                e = score(s_m, a, b) - score(s_s, a, b)
                passes += 2
                eff.append(e)
                d = (p + n / 2) - tss
                rows.append((d if plus else -d, e))
            per_locus[L["id"]] = [round(v, 5) for v in eff]

        # The metaprofile: bin by distance to the TSS, in the gene's own direction.
        arr = np.array(rows, dtype=float)
        edges = np.arange(-4000, 4001, 250)
        prof, cnt = [], []
        for i in range(len(edges) - 1):
            sel = arr[(arr[:, 0] >= edges[i]) & (arr[:, 0] < edges[i + 1]), 1]
            prof.append(round(float(sel.mean()), 5) if len(sel) else None)
            cnt.append(int(len(sel)))
        up = arr[(arr[:, 0] >= -500) & (arr[:, 0] < 0), 1]
        inn = arr[(arr[:, 0] >= 0) & (arr[:, 0] < 500), 1]
        out[mid] = {
            "name": by_id[mid]["name"], "consensus": cons, "instance": inst, "scramble": scr,
            "positions": positions, "perLocus": per_locus,
            "profileEdges": edges.tolist(), "profile": prof, "profileN": cnt,
            "upstream500": round(float(up.mean()), 5) if len(up) else None,
            "inside500": round(float(inn.mean()), 5) if len(inn) else None,
            "best": round(float(arr[:, 1].max()), 5),
            "bestAt": int(arr[int(np.argmax(arr[:, 1])), 0]),
            "worst": round(float(arr[:, 1].min()), 5),
            "worstAt": int(arr[int(np.argmin(arr[:, 1])), 0]),
        }
        r = out[mid]
        print(f"  {r['name']:<12} upstream 500bp {r['upstream500']:+.4f}   "
              f"inside 500bp {r['inside500']:+.4f}   "
              f"best {r['best']:+.3f} at {r['bestAt']:+d} bp   [{(time.time()-t0)/60:.1f} min]")

    (ROOT / "src" / "data" / "shorkiePosition.json").write_text(json.dumps({
        "note": "One motif implanted at every step across each real window, scored on that "
                "window's own gene, against a scramble of the same bases implanted at the same "
                "position -- so whatever the implantation destroyed cancels. Distances are to the "
                "TSS in the gene's own direction of transcription.",
        "stepBp": args.step, "windows": len(loci["loci"]), "motifs": out,
    }, separators=(",", ":")))
    print(f"\n  {passes:,} forward passes in {(time.time()-t0)/60:.1f} min")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
