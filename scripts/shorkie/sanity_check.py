"""
The biological sanity gate for the Keras -> PyTorch port.

There is no TensorFlow here, so the ported model cannot be diffed against the original. What can be
checked is whether it behaves like a model that predicts transcription: the predicted RNA-seq
coverage should be high over annotated ORFs and low over intergenic sequence. A wiring error --
a transposed kernel, a mis-split attention head, a skip connection attached to the wrong tensor --
does not survive that test, because it destroys the positional correspondence between sequence and
signal.

It also resolves the one input-contract unknown. The model takes 165 species one-hot channels and
nothing published says which index is S. cerevisiae, so this sweeps every index (plus an all-zero
control) and reports which maximises the ORF/intergenic contrast.

Usage:  python3 scripts/shorkie/sanity_check.py <checkpoint.h5> <sacCer3.fa> <sgdGene.txt>
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).parent))
from shorkie_torch import (  # noqa: E402
    build, SEQ_LEN, IN_CHANNELS, N_DNA, N_MASK, N_SPECIES, N_BINS, CROP,
)

BIN_BP = 16
CROP_BP = CROP * BIN_BP          # 1024 bp trimmed from each end before binning
BASE_IDX = {"A": 0, "C": 1, "G": 2, "T": 3}

# Track blocks, in the order the paper states they are concatenated into the 5,215 outputs.
TRACKS = {
    "rnaseq_tf": (0, 3053),
    "rnaseq_strain": (3053, 4067),
    "chip_exo": (4067, 5195),
    "chip_mnase": (5195, 5215),
}

# Classic highly expressed yeast genes -- if the model works at all, these light up.
PROBE_GENES = ["YGR192C", "YCR012W", "YFL039C", "YOL086C", "YLR044C", "YKL060C"]


def read_fasta(path: str) -> dict[str, str]:
    seqs, name, buf = {}, None, []
    for line in Path(path).read_text().splitlines():
        if line.startswith(">"):
            if name:
                seqs[name] = "".join(buf)
            name, buf = line[1:].split()[0], []
        else:
            buf.append(line.strip())
    if name:
        seqs[name] = "".join(buf)
    return seqs


def read_genes(path: str) -> dict[str, tuple[str, int, int, str]]:
    genes = {}
    for line in Path(path).read_text().splitlines():
        f = line.split("\t")
        if len(f) < 6:
            continue
        genes[f[1]] = (f[2], int(f[4]), int(f[5]), f[3])
    return genes


def encode(seq: str, species: int | None) -> np.ndarray:
    """Build the 16384 x 170 input: 4 DNA + 1 mask + 165 species one-hot."""
    x = np.zeros((1, SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    for i, base in enumerate(seq[:SEQ_LEN].upper()):
        j = BASE_IDX.get(base)
        if j is not None:
            x[0, i, j] = 1.0
    # mask channel stays 0 at inference
    if species is not None:
        x[0, :, N_DNA + N_MASK + species] = 1.0
    return x


def window_for(gene: str, genes: dict, fa: dict) -> tuple[str, int]:
    chrom, start, end, _ = genes[gene]
    centre = (start + end) // 2
    left = max(0, centre - SEQ_LEN // 2)
    seq = fa[chrom][left:left + SEQ_LEN]
    if len(seq) < SEQ_LEN:
        seq = seq + "N" * (SEQ_LEN - len(seq))
    return seq, left


def orf_mask(chrom: str, left: int, genes: dict) -> np.ndarray:
    """Which of the 896 bins overlap any annotated ORF."""
    mask = np.zeros(N_BINS, dtype=bool)
    win_start = left + CROP_BP
    for _, (c, s, e, _) in genes.items():
        if c != chrom or e <= win_start or s >= win_start + N_BINS * BIN_BP:
            continue
        b0 = max(0, (s - win_start) // BIN_BP)
        b1 = min(N_BINS, (e - win_start + BIN_BP - 1) // BIN_BP)
        mask[b0:b1] = True
    return mask


def main() -> int:
    ckpt, fasta, gtf = sys.argv[1], sys.argv[2], sys.argv[3]
    torch.set_grad_enabled(False)
    model, _ = build(ckpt)
    fa, genes = read_fasta(fasta), read_genes(gtf)

    probes = [g for g in PROBE_GENES if g in genes]
    print(f"probing {len(probes)} genes: {', '.join(probes)}\n")

    windows = []
    for g in probes:
        seq, left = window_for(g, genes, fa)
        chrom = genes[g][0]
        windows.append((g, seq, orf_mask(chrom, left, genes)))

    def contrast(species: int | None) -> float:
        ratios = []
        for _, seq, mask in windows:
            if mask.sum() < 20 or (~mask).sum() < 20:
                continue
            out, _ = model(torch.from_numpy(encode(seq, species)))
            lo, hi = TRACKS["rnaseq_tf"]
            sig = out[0, :, lo:hi].mean(dim=-1).numpy()
            ratios.append(float(sig[mask].mean() / max(sig[~mask].mean(), 1e-9)))
        return float(np.mean(ratios)) if ratios else float("nan")

    print("=== control: no species channel set ===")
    print(f"  ORF/intergenic ratio = {contrast(None):.3f}\n")

    print("=== sweeping all 165 species indices ===")
    scores = []
    for s in range(N_SPECIES):
        scores.append((contrast(s), s))
        if (s + 1) % 25 == 0:
            print(f"  ...{s + 1}/{N_SPECIES}")
    scores.sort(reverse=True)
    print("\n  top 5 indices by ORF/intergenic contrast:")
    for r, s in scores[:5]:
        print(f"    species {s:>3}   ratio {r:.3f}")
    print("  bottom 3:")
    for r, s in scores[-3:]:
        print(f"    species {s:>3}   ratio {r:.3f}")

    best_ratio, best_idx = scores[0]
    print(f"\nBEST species index = {best_idx}  (ratio {best_ratio:.3f})")
    print("GATE:", "PASS" if best_ratio > 1.5 else "FAIL -- predictions do not track ORFs")
    return 0 if best_ratio > 1.5 else 1


if __name__ == "__main__":
    raise SystemExit(main())
