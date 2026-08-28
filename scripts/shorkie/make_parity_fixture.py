"""
Generate the fixture that keeps the TypeScript conv stem honest.

The TS implementation in src/lib/shorkieModel.ts is a separate re-implementation of the same
convolution, working from a folded-bias JSON rather than from the checkpoint. That is exactly the
kind of second implementation that drifts silently, so this records what the *full PyTorch model*
produces at its stem for a real yeast window, and the vitest suite asserts the TS output matches.

Only the interior is compared. Keras pads 'same', so within 5 bp of either edge some kernel taps
fall on padding and the species channel's contribution is partial -- the folded-bias shortcut is
correct in the interior and deliberately not claimed at the boundary.

Usage: python3 scripts/shorkie/make_parity_fixture.py <ckpt.h5> <sacCer3.fa> <sgdGene.txt>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).parent))
from shorkie_torch import build, N_DNA, N_MASK  # noqa: E402
from sanity_check import read_fasta, read_genes, encode, window_for  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SPECIES = 109
GENE = "YGR192C"          # TDH3
SAMPLE_START = 4_000      # well inside the window, away from the padded edges
SAMPLE_LEN = 320
KERNEL = 11


def main() -> int:
    ckpt, fasta, genes_path = sys.argv[1], sys.argv[2], sys.argv[3]
    torch.set_grad_enabled(False)
    model, _ = build(ckpt)
    fa, genes = read_fasta(fasta), read_genes(genes_path)

    seq, _ = window_for(GENE, genes, fa)
    _, acts = model(torch.from_numpy(encode(seq, SPECIES)), want_intermediates=True)
    stem = acts["stem"][0].numpy()          # [96, 16384], 'same' padded

    # The TS side is given only this slice and computes a 'valid' convolution over it, so its
    # output position p corresponds to the full model's position SAMPLE_START + p + (KERNEL-1)//2.
    sub = seq[SAMPLE_START : SAMPLE_START + SAMPLE_LEN]
    offset = SAMPLE_START + (KERNEL - 1) // 2
    n_valid = SAMPLE_LEN - KERNEL + 1
    expected = stem[:, offset : offset + n_valid]     # [96, n_valid]

    fixture = {
        "gene": GENE,
        "species": SPECIES,
        "sequence": sub,
        "kernelWidth": KERNEL,
        "validPositions": int(n_valid),
        # Full 96 x n_valid is 30k floats; the test only needs enough to catch a transposition or
        # an off-by-one, so keep every 8th filter at every 16th position, rounded.
        "filterStride": 8,
        "positionStride": 16,
        "expected": [
            [round(float(expected[f, p]), 4) for p in range(0, n_valid, 16)]
            for f in range(0, 96, 8)
        ],
        "note": "stem activations from the full PyTorch model; interior only (see script docstring)",
    }
    out = ROOT / "src" / "lib" / "__fixtures__" / "shorkieStemParity.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fixture))
    print(f"wrote {out.relative_to(ROOT)}  ({out.stat().st_size / 1024:.0f} KB)")
    print(f"  {len(fixture['expected'])} filters x {len(fixture['expected'][0])} positions")
    print(f"  value range {min(map(min, fixture['expected'])):.3f} .. {max(map(max, fixture['expected'])):.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
