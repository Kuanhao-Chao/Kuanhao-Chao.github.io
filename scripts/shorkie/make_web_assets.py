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

# Panel H's database motifs, plus panel D's splicing motifs. IUPAC, scanned on both strands.
#
# Two rules learned the hard way. A short consensus matches by chance -- GTATGT turns up every few
# kb, and scanning for it put HOP2's "5' splice site" 633 bp from the real donor, inside exon 2. So
# SPLICE SITES ARE NOT SCANNED: they come from the annotation's exon boundaries, where they are
# known rather than guessed, and the branch point is only accepted where it sits upstream of the
# real acceptor. And a consensus so strict it matches almost nothing is not evidence either: the
# 12-mer first used for Rap1 occurs twice in the whole genome.
MOTIFS = [
    ("RRPE (Stb3)", "TGAAAAATTTT"), ("PAC (Dot6)", "GCGATGAG"), ("Reb1", "CGGGTAA"),
    ("Rap1", "MACCCANNCAY"), ("Fhl1", "GTAAACA"), ("Abf1", "RTCRYNNNNNACG"),
    ("Cbf1", "GTCACGTG"), ("TATA box", "TATAAA"), ("Tbf1", "AACCCTAA"),
    ("Ume6", "TAGCCGCC"), ("Dot6p", "CTCATCG"), ("Sfp1", "ATGTATGGGT"),
]
BRANCH_POINT = "TACTAAC"
IUPAC = {"A": "A", "C": "C", "G": "G", "T": "T", "R": "[AG]", "Y": "[CT]", "S": "[GC]",
         "W": "[AT]", "K": "[GT]", "M": "[AC]", "N": "."}
# Complementing has to know about ambiguity codes. str.maketrans("ACGT","TGCA") leaves R, Y and N
# unchanged, so the minus-strand Abf1 pattern it produced was a different motif entirely.
COMPLEMENT = {"A": "T", "C": "G", "G": "C", "T": "A", "R": "Y", "Y": "R",
              "S": "S", "W": "W", "K": "M", "M": "K", "N": "N"}


def _rc(s: str) -> str:
    return "".join(COMPLEMENT[c] for c in reversed(s))


def splice_spans(gene_row, left: int) -> list[dict]:
    """Donor, acceptor and branch point from the ANNOTATION, not from a sequence scan.

    genePred gives exonStarts/exonEnds; an intron runs from the end of one exon to the start of the
    next. The donor is its first two bases and the acceptor its last two. The branch point is the
    TACTAAC nearest the acceptor, searched only in the 100 bp upstream of it -- where a branch point
    has to be -- so a chance match elsewhere cannot be mistaken for one.
    """
    import re

    chrom, strand = gene_row[2], gene_row[3]
    starts = [int(x) for x in gene_row[9].rstrip(",").split(",")]
    ends = [int(x) for x in gene_row[10].rstrip(",").split(",")]
    if len(starts) < 2:
        return []

    out = []
    for i in range(len(starts) - 1):
        i_start, i_end = ends[i], starts[i + 1]                 # intron, 0-based half-open
        donor, acceptor = (i_start, i_end - 2) if strand == "+" else (i_end - 2, i_start)
        out.append({"name": "5' splice site", "consensus": "annotation", "strand": strand,
                    "start": donor - left, "end": donor - left + 2, "source": "annotation"})
        out.append({"name": "3' splice site", "consensus": "annotation", "strand": strand,
                    "start": acceptor - left, "end": acceptor - left + 2, "source": "annotation"})
    return [m for m in out if 0 <= m["start"] and m["end"] <= SEQ_LEN]


def branch_point_spans(seq: str, splices: list[dict]) -> list[dict]:
    """TACTAAC, but only within 100 bp upstream of an annotated acceptor."""
    import re

    out = []
    for acc in [m for m in splices if m["name"] == "3' splice site"]:
        # "Upstream of the acceptor" is in GENE orientation. On a minus-strand gene that is HIGHER
        # forward coordinates, so searching only [acc-100, acc) finds nothing -- which is how MMS2
        # lost its branch point.
        if acc["strand"] == "+":
            lo, hi = max(0, acc["start"] - 100), acc["start"]
        else:
            lo, hi = acc["end"], min(len(seq), acc["end"] + 100)
        pattern = BRANCH_POINT if acc["strand"] == "+" else _rc(BRANCH_POINT)
        for m in re.finditer(pattern, seq[lo:hi]):
            out.append({"name": "branch point", "consensus": BRANCH_POINT, "strand": acc["strand"],
                        "start": lo + m.start(), "end": lo + m.end(), "source": "annotation-anchored"})
    return out


def motif_spans(seq: str, lo: int, hi: int) -> list[dict]:
    """Every database TF motif occurrence inside [lo, hi) of `seq`, on either strand.

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
                              "start": lo + m.start(), "end": lo + m.end(), "source": "scan"})
    return found


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
    # The full genePred rows too: read_genes() drops exonStarts/exonEnds, and the splice sites are
    # derived from exon structure rather than scanned for.
    genes_raw = {}
    for line in Path(genes_path).read_text().splitlines():
        cols = line.split("\t")
        if len(cols) >= 11:
            genes_raw[cols[1]] = cols
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
        splices = splice_spans(genes_raw[systematic], left) if systematic in genes_raw else []
        motifs = motif_spans(seq, lo, hi) + splices + branch_point_spans(seq, splices)
        # Keep only what falls in the window the figure prints.
        motifs = [m for m in motifs if m["start"] >= lo and m["end"] <= hi]
        motifs.sort(key=lambda m: (m["start"], m["name"]))
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
