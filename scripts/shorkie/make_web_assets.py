"""
Produce every asset the /variant-playground/ page needs.

Three outputs:
  public/models/shorkie-fp16.onnx   the full model, fp16 (int8 was rejected: 16% relative error
                                    on the predicted track, which would visibly misreport the
                                    thing the page exists to show)
  src/data/shorkieStem.json         the 96 conv-stem filters, so the live 60 FPS path can run a
                                    real forward pass in TypeScript without touching ONNX
  src/data/shorkieLoci.json         preset 16,384 bp S. cerevisiae windows with ORF annotation

Usage:
  python3 scripts/shorkie/make_web_assets.py <ckpt.h5> <onnx_fp16> <sacCer3.fa> <sgdGene.txt>
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from shorkie_torch import Weights, SEQ_LEN  # noqa: E402
from sanity_check import read_fasta, read_genes  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BIN_BP, CROP_BP, N_BINS = 16, 1024, 896

# Loci chosen to span the interpretive range: constitutive high expressers, a classic inducible
# promoter, a repressed gene, and a tRNA-dense region where RNA-seq should be quiet.
PRESETS = [
    ("YGR192C", "TDH3", "Glycolytic; one of the most highly transcribed genes in yeast"),
    ("YCR012W", "PGK1", "Phosphoglycerate kinase; canonical strong constitutive promoter"),
    ("YFL039C", "ACT1", "Actin; the standard normalisation gene"),
    ("YOL086C", "ADH1", "Alcohol dehydrogenase; strong fermentative expression"),
    ("YKL060C", "FBA1", "Fructose-bisphosphate aldolase; very high steady-state mRNA"),
    ("YLR044C", "PDC1", "Pyruvate decarboxylase; high glycolytic flux gene"),
    ("YBR020W", "GAL1", "Galactose-inducible; the textbook regulated promoter"),
    ("YDR009W", "GAL3", "Galactose signal transducer; co-regulated with GAL1"),
]


def main() -> int:
    ckpt, onnx_path, fasta, genes_path = sys.argv[1:5]

    # ---- 1. the model -----------------------------------------------------------------
    dest = ROOT / "public" / "models" / "shorkie-fp16.onnx"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(onnx_path, dest)
    print(f"model      {dest.relative_to(ROOT)}  ({dest.stat().st_size / 1e6:.1f} MB)")

    # ---- 2. the conv stem, for the live TypeScript path -------------------------------
    w = Weights(ckpt)
    kernel = w.get("conv1d", "kernel")          # (11, 170, 96)
    bias = w.get("conv1d", "bias")              # (96,)
    # Only the 4 DNA channels matter for a typed sequence: the mask channel is 0 at inference and
    # the species channels are constant across positions, so their contribution is a per-filter
    # offset that folds into the bias.
    dna = kernel[:, :4, :]                      # (11, 4, 96)
    species_offset = kernel[:, 5 + 109, :].sum(axis=0)   # constant contribution of species 109
    stem = {
        "kernelWidth": int(dna.shape[0]),
        "filters": int(dna.shape[2]),
        # flattened [pos][base][filter]
        "weights": [round(float(v), 6) for v in dna.reshape(-1)],
        "bias": [round(float(v), 6) for v in (bias + species_offset)],
        "note": (
            "Conv1D stem of Shorkie f0, DNA channels only. The species-109 one-hot contributes a "
            "constant per-filter offset which is folded into the bias; the mask channel is zero "
            "at inference."
        ),
    }
    stem_path = ROOT / "src" / "data" / "shorkieStem.json"
    stem_path.write_text(json.dumps(stem))
    print(f"stem       {stem_path.relative_to(ROOT)}  ({stem_path.stat().st_size / 1024:.0f} KB)")

    # ---- 3. preset loci ---------------------------------------------------------------
    fa, genes = read_fasta(fasta), read_genes(genes_path)
    loci = []
    for systematic, common, blurb in PRESETS:
        if systematic not in genes:
            print(f"  skipping {systematic}: not in annotation")
            continue
        chrom, start, end, strand = genes[systematic]
        centre = (start + end) // 2
        left = max(0, centre - SEQ_LEN // 2)
        seq = fa[chrom][left:left + SEQ_LEN].upper()
        if len(seq) < SEQ_LEN:
            seq += "N" * (SEQ_LEN - len(seq))
        win_start = left + CROP_BP
        features = [
            {
                "name": nm,
                "start": max(0, (s - win_start) // BIN_BP),
                "end": min(N_BINS, (e - win_start + BIN_BP - 1) // BIN_BP),
                "strand": st,
            }
            for nm, (c, s, e, st) in genes.items()
            if c == chrom and e > win_start and s < win_start + N_BINS * BIN_BP
        ]
        loci.append({
            "id": systematic, "gene": common, "blurb": blurb,
            "chrom": chrom, "start": left, "strand": strand,
            "sequence": seq,
            "features": sorted(features, key=lambda f: f["start"]),
        })
    loci_path = ROOT / "src" / "data" / "shorkieLoci.json"
    loci_path.write_text(json.dumps({"speciesIndex": 109, "binBp": BIN_BP,
                                     "cropBp": CROP_BP, "bins": N_BINS, "loci": loci}))
    print(f"loci       {loci_path.relative_to(ROOT)}  ({loci_path.stat().st_size / 1024:.0f} KB, "
          f"{len(loci)} windows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
