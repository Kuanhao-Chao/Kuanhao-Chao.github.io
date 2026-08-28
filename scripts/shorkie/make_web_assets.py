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

# The six loci of Figure 4, by the coordinates the figure itself prints. Panels A-C are promoter
# windows (TSS -450/+50, which the arithmetic confirms against txStart); E-G are gene-body windows
# showing splice sites. These are centred on the FIGURE window rather than the transcript midpoint,
# so what the paper drew sits in the middle of the 896 predicted bins.
#
# Note DTD1 is YDL219W. YDL100C is a different gene; the figure's coordinates are authoritative and
# YDL219W is the gene that lives at chrIV:65,235-65,431 with the 71 bp intron panel E marks.
FIGURE4 = [
    ("YLR344W", "RPL26A", "Fig 4A", "chrXII", 818862, 819362,
     "Ribosomal protein promoter; Fhl1 and Rap1 sites, and a 5' splice site"),
    ("YAL035W", "FUN12", "Fig 4B", "chrI", 75977, 76477,
     "Translation initiation factor; RRPE (Stb3), Dot6p and Abf1 sites"),
    ("YNL132W", "KRE33", "Fig 4C", "chrXIV", 374871, 375371,
     "Ribosome biogenesis; Reb1, RRPE (Stb3) and PAC (Dot6) motifs"),
    ("YDL219W", "DTD1", "Fig 4E", "chrIV", 65235, 65431,
     "D-aminoacyl-tRNA deacylase; start codon, donor, branch point and acceptor in 197 bp"),
    ("YGL087C", "MMS2", "Fig 4F", "chrVII", 346669, 347169,
     "DNA repair; branch point, 5' splice site, start codon and a Reb1 site"),
    ("YGL033W", "HOP2", "Fig 4G", "chrVII", 435625, 436401,
     "Meiotic pairing; a whole intron plus start and stop codons"),
]

# Panel H's database motifs, plus panel D's splicing motifs. IUPAC. Scanned for on both strands in
# the extracted sequence -- a motif is marked only where it is actually found, never placed by eye.
MOTIFS = [
    ("RRPE (Stb3)", "TGAAAAATTTT"), ("PAC (Dot6)", "GCGATGAG"), ("Reb1", "CGGGTAA"),
    ("Rap1", "ACACCCATACAT"), ("Fhl1", "GTAAACA"), ("Abf1", "RTCRYNNNNNACG"),
    ("Cbf1", "GTCACGTG"), ("TATA box", "TATAAA"), ("Tbf1", "AACCCTAA"),
    ("Ume6", "TAGCCGCC"), ("Dot6p", "CTCATCG"), ("Sfp1", "ATGTATGGGT"),
    ("5' splice site", "GTATGT"), ("branch point", "TACTAAC"),
]
IUPAC = {"A": "A", "C": "C", "G": "G", "T": "T", "R": "[AG]", "Y": "[CT]", "S": "[GC]",
         "W": "[AT]", "K": "[GT]", "M": "[AC]", "N": "."}


def _rc(s: str) -> str:
    return s.translate(str.maketrans("ACGT", "TGCA"))[::-1]


def motif_spans(seq: str, lo: int, hi: int) -> list[dict]:
    """Every database motif occurrence inside [lo, hi) of `seq`, on either strand.

    Positions are offsets into the 16,384 bp window, so a test can assert the motif string really
    is at that offset in the shipped sequence.
    """
    import re

    found = []
    window = seq[lo:hi]
    for name, cons in MOTIFS:
        for strand, pattern in (("+", cons), ("-", _rc(cons))):
            if strand == "-" and _rc(cons) == cons:
                continue
            rx = re.compile("".join(IUPAC[b] for b in pattern))
            for m in rx.finditer(window):
                found.append({"name": name, "consensus": cons, "strand": strand,
                              "start": lo + m.start(), "end": lo + m.end()})
    return sorted(found, key=lambda f: (f["start"], f["name"]))


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
    # ---- the six Figure 4 loci, centred on the window the figure prints -------------------
    for systematic, common, panel, chrom, fa_start, fa_end, blurb in FIGURE4:
        if chrom not in fa:
            print(f"  skipping {common}: {chrom} not in the FASTA")
            continue
        centre = (fa_start + fa_end) // 2
        left = max(0, centre - SEQ_LEN // 2)
        seq = fa[chrom][left:left + SEQ_LEN].upper()
        if len(seq) < SEQ_LEN:
            seq += "N" * (SEQ_LEN - len(seq))
        win_start = left + CROP_BP
        strand = genes[systematic][3] if systematic in genes else "+"
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
        # The figure's own window, as offsets into the 16,384 bp input and as predicted bins.
        lo, hi = fa_start - 1 - left, fa_end - left
        motifs = motif_spans(seq, lo, hi)
        loci.append({
            "id": systematic, "gene": common, "blurb": f"{panel} — {blurb}",
            "chrom": chrom, "start": left, "strand": strand,
            "sequence": seq,
            "features": sorted(features, key=lambda f: f["start"]),
            "figurePanel": panel,
            "figureWindow": {
                "chromStart": fa_start, "chromEnd": fa_end,
                "seqStart": lo, "seqEnd": hi,
                "binStart": max(0, (fa_start - 1 - win_start) // BIN_BP),
                "binEnd": min(N_BINS, (fa_end - win_start + BIN_BP - 1) // BIN_BP),
            },
            "motifs": motifs,
        })
        print(f"  {common:<7} {panel}  {chrom}:{fa_start:,}-{fa_end:,}  "
              f"{len(motifs)} motif(s): {', '.join(sorted({m['name'] for m in motifs}))}")

    loci_path = ROOT / "src" / "data" / "shorkieLoci.json"
    loci_path.write_text(json.dumps({"speciesIndex": 109, "binBp": BIN_BP,
                                     "cropBp": CROP_BP, "bins": N_BINS, "loci": loci}))
    print(f"loci       {loci_path.relative_to(ROOT)}  ({loci_path.stat().st_size / 1024:.0f} KB, "
          f"{len(loci)} windows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
