"""
Turn the genome-wide score arrays into what the browser actually fetches.

Each score is 12,157,105 float32 values -- 49 MB, and useless to a web page as one blob. This builds
a BigWig-style pyramid of PNG tiles per score track, so a viewport fetches only the few tiles it
covers, at only the resolution it can draw.

Three score tracks now share this machinery, which is the point of naming them:

    lm-masked    Shorkie_LM information content from the K=7 iterative masked pass. A PREDICTION.
    lm-unmasked  the same model with nothing masked -- it can see the base it is scoring, so it is
                 largely reading its own input. NOT a prediction, but it is the paper's Figure 2A
                 quantity, and it differs from the masked pass enough to be worth drawing
                 (r = 0.62 on the shipped packs; genome means 0.199 against 0.687 bits).
    phastcons    phastCons 7-yeast conservation. A DIFFERENT UNIT -- a 0-1 posterior, not bits --
                 so it gets its own lane and its own axis and must never share one with the others.

**Why min and max and not just mean.** A summary bin that stores only its average hides exactly what
a constraint track exists to show: one strongly determined base inside a 4,096 bp bin disappears
into the surrounding noise. Every level above the base stores min, max and mean as three rows, so
the drawing can show the envelope and the reader can see that a bin contains a spike. A pyramid that
smooths is a pyramid that lies.

**Byte 0 means NO DATA, and every track uses the same rule.** phastCons has no value for 0.65% of
the genome -- the alignment has no data there, concentrated on chrM (77% coverage) and at telomeres.
Quantised naively that becomes 0, which draws as "completely unconserved" exactly where the truth is
"we do not know". So values occupy 1-255 and 0 is reserved, for every score track rather than only
the one that needs it: one decode rule, and a 0.4% precision cost nobody can see.

**Why PNG.** Every other pack in this repo is a PNG for the same reason: `createImageBitmap` decodes
it natively, so no JavaScript inflate ships and no base64 bloats the transfer.

Levels are 1 / 8 / 64 / 512 / 4096 bp per bin. At a ~1,400 px viewport that covers a whole
chromosome through to single bases, with each level used over roughly an 8x zoom range.

Emits, under `public/genome-data/`:
    index.json                          chromosomes, levels, and the track table
    <chrom>/<track>/L<level>/<tile>.png  the pyramid; L0 is one row, coarser levels are min/max/mean
    <chrom>/seq/<tile>.png               the reference, one byte a base, for the letter view
    <chrom>/genes.json                   gene models for the gene track

`features.json` and `search.json` are written by `make_genome_features.py` and are NOT touched here.

Usage:  python3 scripts/shorkie/make_genome_tiles.py
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

from add_loci import load_genes, read_fasta                       # noqa: E402  the same GFF reader

TRACK = Path(__file__).resolve().parent / "_scratch" / "genome-track"
SCRATCH = Path(__file__).resolve().parent / "_scratch"
OUT = ROOT / "public" / "genome-data"

# bp per bin. 16 is here for Shorkie's own output grid: its head emits 896 bins of 16 bp, and
# without a 16 bp level the coverage tracks would have to fall back to 64 bp -- four times blurrier
# than the data, drawn 3.2 px a bin at the zoom where a reader is looking at a promoter. Level
# NUMBERS are global, so L3 is 64 bp for EVERY track and a tile path can never mean two things; a
# coarse track simply has holes at the fine end of its ladder.
LEVELS = [1, 8, 16, 64, 512, 4096]

# What each `group` means in the panel. Written here rather than inferred from an id prefix in the
# client: which model a lane comes from is a fact about the track, and this file is where a track's
# facts live. The browser carries TWO networks that share an encoder and answer opposite questions,
# and a flat list of nine score lanes hides that completely.
GROUP_LABELS = {
    "constraint": {"label": "Shorkie_LM · constraint",
                   "hint": "predicts the SEQUENCE — tall means the context determines this base"},
    "expression": {"label": "Shorkie · expression",
                   "hint": "predicts what an ASSAY would measure — tall means transcribed"},
    "comparative": {"label": "Independent checks",
                    "hint": "neither model: alignment-based conservation, and a composition control"},
}
TILE_BINS = 65536                  # bins a tile holds, at every level
BASE_IDX = {"A": 0, "C": 1, "G": 2, "T": 3}
# FASTA name -> SGD GFF name, where the two disagree.
GFF_ALIAS = {"chrM": "chrmt"}

# The score tracks, in the order the browser stacks them by default. `file` is the suffix in
# `_scratch/genome-track/`; `axis` is the FIXED display range, declared here so a byte means the
# same thing everywhere within a track and the decoder never has to guess.
TRACKS = [
    {
        "id": "lm-masked", "group": "constraint", "laneTag": "", "file": "", "axis": [0.0, 2.0], "units": "bits",
        "label": "Shorkie_LM · masked",
        "short": "masked",
        "detail": "information content, 2 − H(p), from the K = 7 iterative masked pass",
        "prediction": True,
        "note": "A prediction: every position is read back only from the pass that masked it, so "
                "the model never sees the base it is scoring.",
        "source": "Shorkie_LM (Chao et al. 2025), run over sacCer3 in 16,384 bp windows",
    },
    {
        "id": "lm-unmasked", "group": "constraint", "laneTag": "not a prediction", "file": "unmasked", "axis": [0.0, 2.0], "units": "bits",
        "label": "Shorkie_LM · unmasked",
        "short": "unmasked",
        "detail": "information content from one forward pass with nothing masked",
        "prediction": False,
        "note": "NOT a prediction. The model can see the base it is scoring and is largely reading "
                "its own input, which is why its information content runs ~3.4× the masked pass's. "
                "It is nonetheless the quantity the paper's Figure 2A logo is built on.",
        "source": "Shorkie_LM (Chao et al. 2025), run over sacCer3 in 16,384 bp windows",
    },
    {
        "id": "phastcons", "group": "comparative", "laneTag": "alignment-based", "file": "phastcons", "axis": [0.0, 1.0], "units": "posterior",
        "label": "phastCons · 7 yeasts",
        "short": "phastCons",
        "detail": "posterior probability that a base lies in a conserved element",
        "prediction": False,
        "note": "A DIFFERENT UNIT from the two above — a 0–1 probability, not bits — so it is drawn "
                "on its own axis and must never be read against theirs. It is also alignment-based "
                "where the model is alignment-free, which is what makes it an independent check.",
        "source": "UCSC phastCons7way for sacCer3 (S. cerevisiae, paradoxus, mikatae, "
                  "kudriavzevii, bayanus, castellii, kluyveri)",
    },
    {
        "id": "gc", "group": "comparative", "laneTag": "composition control", "file": "gc",
        "axis": [0.0, 1.0], "units": "fraction",
        "label": "GC content · 50 bp",
        "short": "GC",
        "detail": "fraction of A/C/G/T in a centred 50 bp window that are G or C",
        "prediction": False,
        "note": "A CONTROL rather than a finding. If the model's information content were mostly "
                "base composition it would show here; measured, r = -0.020 genome-wide.",
        "source": "computed from the sacCer3 reference; no external data",
    },
    # ---- the EXPRESSION model. A different network from the two `lm-*` tracks above: Shorkie
    # predicts assay coverage from sequence, where Shorkie_LM predicts the sequence itself. Its head
    # emits 896 bins of 16 bp, so `nativeBp` is 16 and no finer level is written.
    {
        "id": "sk-rnaseq", "group": "expression", "laneTag": "", "file": "sk-cov-baseline",
        "nativeBp": 16, "space": "log1p", "axisFrom": "max", "axis": None, "units": "a.u.",
        "label": "Shorkie · predicted RNA-seq",
        "short": "RNA-seq",
        "detail": "mean predicted coverage over the 384 T0 RNA-seq tracks",
        "prediction": True,
        "note": "The quantity every attribution on this site is scored on, so this lane and the "
                "gradient lane below it describe the same 384 tracks. Drawn on a LOG axis: the "
                "median 16 bp bin reads 2.07 against a maximum of 1,097.6.",
        "source": "Shorkie (Chao et al. 2025), fold f0, run over sacCer3 in 16,384 bp windows",
    },
    {
        "id": "sk-chip-exo", "group": "expression", "laneTag": "", "file": "sk-cov-chip_exo",
        "nativeBp": 16, "space": "log1p", "axisFrom": "max", "axis": None, "units": "a.u.",
        "label": "Shorkie · predicted ChIP-exo",
        "short": "ChIP-exo",
        "detail": "mean predicted coverage over the 1,128 ChIP-exo tracks",
        "prediction": True,
        "note": "A different assay, not a rescaled copy of the RNA-seq lane: genome-wide the two "
                "correlate at r = 0.38.",
        "source": "Shorkie (Chao et al. 2025), fold f0, run over sacCer3 in 16,384 bp windows",
    },
    {
        "id": "sk-chip-mnase", "group": "expression", "laneTag": "", "file": "sk-cov-chip_mnase",
        "nativeBp": 16, "space": "log1p", "axisFrom": "max", "axis": None, "units": "a.u.",
        "label": "Shorkie · predicted ChIP-MNase",
        "short": "MNase",
        "detail": "mean predicted coverage over the 20 ChIP-MNase tracks",
        "prediction": True,
        "note": "Nearly independent of the expression lane -- genome-wide r = 0.08 -- which makes "
                "it the most different thing the model predicts, not a redundant one.",
        "source": "Shorkie (Chao et al. 2025), fold f0, run over sacCer3 in 16,384 bp windows",
    },
    {
        "id": "sk-strain", "group": "expression", "laneTag": "", "file": "sk-cov-rnaseq_strain",
        "nativeBp": 16, "space": "log1p", "axisFrom": "max", "axis": None, "units": "a.u.",
        "label": "Shorkie · predicted 1,000-strain RNA-seq",
        "short": "strain",
        "detail": "mean predicted coverage over the 1,014 natural-isolate RNA-seq tracks",
        "prediction": True,
        "note": "A different RNA-seq corpus from the lane above -- natural isolates rather than "
                "TF-induction timepoints -- and only r = 0.49 with it.",
        "source": "Shorkie (Chao et al. 2025), fold f0, run over sacCer3 in 16,384 bp windows",
    },
    {
        "id": "sk-gradient", "group": "expression", "laneTag": "signed", "file": "sk-gradient",
        "nativeBp": 1, "space": "symlog", "axisFrom": "symmetric", "axis": None, "units": "d log2 cov",
        "label": "Shorkie · gradient x input",
        "short": "grad x in",
        "detail": "signed contribution of each base to the predicted RNA-seq of its window",
        "prediction": False,
        "note": "SIGNED: bars above the zero rule are bases whose presence RAISES the prediction, "
                "below it bases that lower it. Genome-wide this differentiates each window's whole "
                "cropped interior, not a chosen gene, so it does NOT reproduce the per-locus "
                "figures on /shorkie-lab/shorkie/.",
        "source": "Shorkie (Chao et al. 2025), fold f0; d log2(T0 coverage) / d input, x input, "
                  "rc-averaged",
    },
    {
        "id": "sk-induction", "group": "expression", "laneTag": "derived", "file": "sk-induction",
        "nativeBp": 16, "space": "linear", "axis": [0.0, 2.0], "units": "fraction",
        "label": "Shorkie · condition-dependence",
        "short": "induction",
        "detail": "spread of predicted expression across the 13 induction timepoints",
        "prediction": False,
        "note": "Where the model expects expression to DEPEND on the condition, rather than how "
                "much of it there is. High over regulated genes (HOP2 0.455, GAL3 0.297) and low "
                "over the constitutive glycolytic enzymes (PDC1 0.066, TDH3 0.083).",
        "source": "Shorkie (Chao et al. 2025), fold f0; derived from the 13 timepoint means",
    },
    {
        "id": "sk-ism", "group": "expression", "laneTag": "signed · measured · 23 windows",
        "file": "sk-ism", "nativeBp": 1, "space": "symlog", "axisFrom": "symmetric", "axis": None,
        "units": "logSED",
        "label": "Shorkie · mutagenesis (ISM)",
        "short": "ISM",
        "detail": "the paper's own attribution: every substitution actually run",
        "prediction": False,
        "note": "The paper's Figure 4 quantity, and the only method here that changes a base and "
                "looks. It exists on 3.10% of the genome — the 23 analysed windows — because "
                "genome-wide it is 1,231 hours. Everywhere else this lane is blank, which is the "
                "honest rendering of a measurement that was not made.",
        "source": "Shorkie (Chao et al. 2025), fold f0; 98,304 forward passes a window, rc-averaged",
    },
    {
        "id": "sk-ig", "group": "expression", "laneTag": "signed", "file": "sk-ig",
        "nativeBp": 1, "space": "symlog", "axisFrom": "symmetric", "axis": None,
        "units": "d log2 cov",
        "label": "Shorkie · integrated gradients",
        "short": "IG",
        "detail": "signed contribution of each base, integrated from an all-zero-DNA baseline",
        "prediction": False,
        "note": "SIGNED, and NOT a smoother version of the lane above: measured on chrI the two "
                "correlate at only r = 0.60 per base and share 27% of their strongest bases. A "
                "gradient is the slope AT the sequence; this is the integral along the path to it, "
                "so it still reports where the local slope has saturated.",
        "source": "Shorkie (Chao et al. 2025), fold f0; 32-step integrated gradients, rc-averaged",
    },
    {
        "id": "sk-occl", "group": "expression", "laneTag": "signed · exact", "file": "sk-occlusion",
        "nativeBp": 64, "space": "symlog", "axisFrom": "symmetric", "axis": None,
        "units": "d log2 cov",
        "label": "Shorkie · occlusion",
        "short": "occlusion",
        "detail": "measured effect on the prediction of ablating each 64 bp of input",
        "prediction": False,
        "note": "The only EXACT attribution here: every value is the model actually re-run with "
                "that stretch removed, not a derivative of it. 64 bp is the ablation window, so no "
                "finer level exists.",
        "source": "Shorkie (Chao et al. 2025), fold f0; 256 ablations a window, rc-averaged",
    },
]

# The two families that resolve individually. A pooled block mean is honest only when its members
# agree; measured over the 23 analysed windows the ChIP blocks do not (shape r 0.82 and 0.60, level
# 23.7x and 34.3x, argmax 38 and 174 bins apart) while the two RNA-seq blocks are near-degenerate in
# shape (r 0.999) and stay pooled. A family is ONE lane with a picker, not N checkboxes.
HISTONE_MARKS = ["H2B", "H2BK123UB", "H3", "H3K27AC", "H3K36ME3", "H3K4ME3", "H3K79ME3",
                 "H3K9AC", "H4K12AC"]
CHIP_TARGETS = ["SUA7", "SPT15", "TFA1", "TFB4", "RAD3", "CET1", "HTZ1", "SPT7", "HHF1",
                "RAP1", "ABF1", "REB1", "TBF1", "CBF1", "FHL1", "SFP1",
                "GAL4", "MSN2", "HSF1", "PHO4", "INO4", "UME6", "GCN4", "SWI4", "STE12"]

# What each target IS, so the picker names a protein rather than a bare gene symbol. The first nine
# are general machinery -- and they are also the MOST distinct from the pooled mean, which is the
# point: a pooled ChIP-exo lane is dominated by where the pre-initiation complex sits.
TARGET_ROLE = {
    "SUA7": "TFIIB - pre-initiation complex", "SPT15": "TBP - pre-initiation complex",
    "TFA1": "TFIIE - pre-initiation complex", "TFB4": "TFIIH - pre-initiation complex",
    "RAD3": "TFIIH helicase", "CET1": "mRNA capping enzyme",
    "HTZ1": "H2A.Z - promoter-flanking variant", "SPT7": "SAGA coactivator",
    "HHF1": "histone H4",
    "RAP1": "general activator - ribosomal and glycolytic promoters",
    "ABF1": "general regulator - ARS-binding", "REB1": "general regulator - terminator",
    "TBF1": "general regulator - subtelomeric", "CBF1": "centromere and MET regulon",
    "FHL1": "ribosomal protein regulon", "SFP1": "ribosome biogenesis",
    "GAL4": "galactose regulon activator", "MSN2": "general stress response (STRE)",
    "HSF1": "heat-shock factor", "PHO4": "phosphate starvation",
    "INO4": "inositol / phospholipid", "UME6": "early meiotic repressor",
    "GCN4": "amino-acid starvation", "SWI4": "SBF - cell-cycle G1/S",
    "STE12": "mating and filamentation",
}

FAMILY_LABELS = {
    "histone": {"label": "Shorkie - predicted histone marks",
                "hint": "9 marks from the ChIP-MNase block - the most distinct tracks the model "
                        "emits, and the closest thing to a chromatin map sacCer3 has"},
    "chip-exo": {"label": "Shorkie - predicted ChIP-exo, by target",
                 "hint": "25 of 765 targets, picked by measured distinctness and by covering the "
                         "classes - general machinery as well as sequence-specific factors"},
}


def _pretty_mark(m: str) -> str:
    return m.replace("ME3", "me3").replace("AC", "ac").replace("UB", "ub") if len(m) > 3 else m


def family_tracks() -> list[dict]:
    """The 34 per-condition tracks, generated rather than typed out one by one."""
    out = []
    for m in HISTONE_MARKS:
        pretty = _pretty_mark(m)
        out.append({
            "id": f"sk-h-{m.lower()}", "group": "expression", "laneTag": "",
            "file": f"sk-cov-h_{m}", "family": "histone", "familyLabel": pretty,
            "nativeBp": 16, "space": "log1p", "axisFrom": "max", "axis": None, "units": "a.u.",
            "label": f"Shorkie - predicted {pretty}", "short": pretty,
            "detail": f"predicted ChIP-MNase coverage for {pretty}",
            "prediction": True,
            "note": "One histone mark, not the 9-mark average. The marks disagree strongly - "
                    "pairwise shape correlation 0.60 and peaks 174 bins apart - so the pooled lane "
                    "is the least representative average on this page.",
            "source": "Shorkie (Chao et al. 2025), fold f0; mean of that mark's ChIP-MNase tracks",
        })
    for k in CHIP_TARGETS:
        out.append({
            "id": f"sk-tf-{k.lower()}", "group": "expression", "laneTag": "",
            "file": f"sk-cov-tf_{k}", "family": "chip-exo", "familyLabel": k,
            "nativeBp": 16, "space": "log1p", "axisFrom": "max", "axis": None, "units": "a.u.",
            "label": f"Shorkie - predicted {k} ChIP-exo", "short": k,
            "detail": f"predicted ChIP-exo coverage for {k} - {TARGET_ROLE[k]}",
            "prediction": True,
            "note": f"{TARGET_ROLE[k]}. One target of 765, not their average: individual targets "
                    "peak a median 38 bins apart, so the pooled ChIP-exo lane averages experiments "
                    "that disagree about where the signal is.",
            "source": "Shorkie (Chao et al. 2025), fold f0; mean of that target's ChIP-exo tracks",
        })
    return out


TRACKS.extend(family_tracks())

# Every track documents itself, in four fields rather than a paragraph, so a track cannot ship
# without saying where it came from, what it physically measures, how to read it, and -- the field
# that matters most -- what it does NOT mean. `main()` refuses to write an index that is missing
# any of them, which is what "documented" has to mean to survive more than one round.
TRACK_DOCS = {
    'sk-induction': {
        'source': 'Derived, not predicted separately: the 3,053 TF-induction RNA-seq tracks resolve into 13 timepoints (0-180 min) x 337 regulators, and this is the spread across those 13 timepoint means, (max - min) / (mean + 1), per 16 bp bin. Shorkie (Chao et al. 2025), fold f0.',
        'measures': "How much the model expects a position's expression to move across the induction timecourse — condition-DEPENDENCE, not condition. A gene pinned at its maximum in every condition scores near zero however loudly it is transcribed; a gene that is silent in one state and active in another scores high however quiet it is on average.",
        'read': 'Against the coverage lane above it, not on its own. High here and low there is a regulated gene caught in its off state; low here and high there is a constitutive one. Over their own gene bodies the ordering is HOP2 0.455 (meiosis-specific, silent in vegetative growth), MMS2 0.352, POP4 0.302 and GAL3 0.297 (glucose-repressed) at the top, and the glycolytic enzymes at the bottom — PDC1 0.066, ADH1 0.081, FBA1 0.082, TDH3 0.083. A tenfold separation from a quantity nothing was tuned on.',
        'caveat': "This lane exists BECAUSE the obvious alternative failed a measurement. The plan was 13 genome-wide timepoint lanes so a reader could pick a condition; they are indistinguishable — the lowest pairwise correlation among all 13 is 0.9923 and T5 against T0 is 1.0000 — because each averages ~300 regulators and averaging 300 induction experiments washes out every individual induction. The variation is real and lives in the INDIVIDUAL tracks: over GAL1's gene body the 3,053 of them span 43.7x. Those cannot ship genome-wide (337 regulators would be 276 MB), so individual conditions are available inside the 23 analysed windows and nowhere else. Second caveat: a spread of thirteen means is a floor on the true condition-dependence, never a measurement of it.",
    },
    'sk-ism': {
        'source': "Shorkie (Chao et al. 2025, bioRxiv 2025.09.19.677475), fold f0. Every one of the three substitutions at all 16,384 positions of each analysed window, on both strands — 98,304 forward passes a window — then rc-averaged, mean-centred across the four bases and projected on the reference, which is the paper's own recipe in all three files that implement it. The browser reads the same packs the per-locus panels do, through their own decoder.",
        'measures': "What actually happens to the model's predicted log2 RNA-seq coverage when the base that is there is replaced. Not a derivative of that, not an integral of one, and not a block ablation: the finite difference itself, which is why it is the standard this page measures the other three methods against. Positive means the base that is present is HOLDING THE PREDICTION DOWN, so changing it would raise expression; negative means the base is doing work the model relies on.",
        'read': "At base zoom it becomes the paper's sequence logo — letters above the zero rule, mirrored below. Read it against gradient x input directly above: the two agree about direction at 22 of 23 loci and correlate at a median of only 0.369 base by base, and where they disagree it is usually the gradient going flat on a saturated promoter rather than the mutagenesis being wrong.",
        'caveat': "BLANK ON 96.9% OF THE GENOME, and that is a fact about what was computed rather than about the sequence. Full mutagenesis is 2,950 s a window — 1,231 hours, 51 days of GPU, for all 1,493 windows — so it was run on the 23 windows this site analyses and nowhere else. A gap here means 'not measured', never 'no effect'; the lane prints the fraction of the view that is missing so the distinction is on the screen. It also scores each window's own gene body, not the whole cropped interior the gradient lanes use, so the two answer subtly different questions even where both are present.",
    },
    'sk-ig': {
        'source': "Shorkie (Chao et al. 2025, bioRxiv 2025.09.19.677475), the fold-f0 checkpoint, run over sacCer3 in 1,493 windows of 16,384 bp on the same 8,192 bp cores as the language-model tracks, so the two models' lanes are aligned base for base. Not a published track. Integrated gradients at 32 steps from an all-zero-DNA baseline, averaged over both strands — and the completeness target is rc-averaged too, since the average of two complete decompositions is a decomposition of the average.",
        'measures': "The same quantity as the gradient lane — each base's signed contribution to predicted log2 RNA-seq coverage — obtained by integrating the gradient along the straight path from a sequence with no DNA to this one, instead of reading the slope at this one. Its attributions sum to f(sequence) − f(baseline), which is the property it exists for, and it is deliberately NOT mean-centred across the four bases: that identity is a telescoping integral of the raw gradient, and subtracting a per-position mean breaks it (measured, 8–650% completeness error centred against 0.4–13% un-centred).",
        'read': 'The same way as the gradient lane — up raises the prediction, down lowers it — but do NOT read it as a smoothed copy of it. Measured on chrI the two correlate at r = 0.60 per base, 0.44 at 64 bp bins, and their strongest 2,000 bases overlap by only 27%. That gap is the point: a gradient is a local slope, so where a promoter is saturated it reads near zero while the path integral still records the base as load-bearing.',
        'caveat': "Like the gradient lane, this differentiates each window's whole cropped interior rather than a chosen gene — the only target defined at every base — so it does NOT reproduce the region-conditioned figures on /shorkie-lab/shorkie/, where a reader picks a gene first. Gradients superpose, so what is drawn is the sum over everything in view. Two things specific to this lane. First, IG has a REFERENCE POINT and the gradient lane does not, and the reference is not neutral: from an all-zero-DNA input the model predicts 12.43, which is above 62% of real 16 kb windows. So the path from 'no DNA' to a real sequence runs downhill over most of the genome, and this lane comes out 56.2% negative where gradient × input is 50.2% — a fact about the baseline, not about the sequence, so the two lanes' overall balance must not be read against each other. Second, 32 steps is a numerical approximation of an integral, not the integral: measured on real windows the attributions sum to within 0.5–2.3% of f(sequence) − f(baseline), which is the identity the method exists for.",
    },
    'sk-occl': {
        'source': "Shorkie (Chao et al. 2025, bioRxiv 2025.09.19.677475), the fold-f0 checkpoint, run over sacCer3 in 1,493 windows of 16,384 bp on the same 8,192 bp cores as the language-model tracks, so the two models' lanes are aligned base for base. Not a published track. 256 ablations a window at 64 bp, both strands, each one a forward pass — 6.4 hours of GPU for the genome.",
        'measures': "What the model's predicted log2 RNA-seq coverage actually does when 64 bp of input is removed, by zeroing its four DNA channels and re-running. This is the only EXACT method on the page: every other lane reports a derivative or an integral of one, and this reports the measured difference. Zeroing is how the paper's language model masks a position and is indistinguishable to the model from a run of N — so it asks whether the stretch carries information at all, where the motif-knockout panel's shuffle asks whether its ARRANGEMENT matters. Those are different questions and give different answers.",
        'read': 'Down means removing that stretch LOWERS the prediction, so the model was relying on it; up means removing it raises the prediction, which is what a repressive element looks like. Because a whole 64 bp goes at once, a single decisive base and a diffuse stretch of sixty-four weak ones read the same here — the per-base lanes above separate them.',
        'caveat': "Like the gradient lane, this differentiates each window's whole cropped interior rather than a chosen gene — the only target defined at every base — so it does NOT reproduce the region-conditioned figures on /shorkie-lab/shorkie/, where a reader picks a gene first. Gradients superpose, so what is drawn is the sum over everything in view. The resolution is 64 bp because that is the ablation window, and no finer level is stored; a lane drawn at 64 bp while the readout says per base would be the browser claiming precision the measurement does not have. Full single-base mutagenesis is the honest answer to 'what if this one base changed' and is not affordable genome-wide: measured, 1,231 hours.",
    },
    'sk-rnaseq': {
        'source': "Shorkie (Chao et al. 2025, bioRxiv 2025.09.19.677475), the fold-f0 checkpoint, run over sacCer3 in 1,493 windows of 16,384 bp on the same 8,192 bp cores as the language-model tracks, so the two models' lanes are aligned base for base. Not a published track.",
        'measures': "Predicted RNA-seq coverage, averaged over the 384 `_T0_` tracks — the untreated, glucose, vegetative baseline the paper's own Figure 4 mutagenesis is scored on. One value per 16 bp, which is the model's own output bin; nothing finer is written because nothing finer exists.",
        'read': 'High over transcribed genes and low between them. Because the axis is logarithmic, a bar at half height is roughly 30x the value of one at a quarter height, not twice it — the median 16 bp bin reads 2.07 and the maximum 1,097.6, so a linear axis would draw the median at 0.2% of the lane and the track would be a flat line with spikes.',
        'caveat': "Arbitrary units, and NOT comparable with a real coverage file: these are the model's predictions, on the scale its training data happened to have. The first 1,024 bases of every chromosome are blank because the head crops that much from each window end and no window can start before position 0 — 17,408 bases genome-wide, left as no data rather than filled from a window that never scored them. A single forward pass, not reverse-complement averaged, so that this lane reports the same number as the coverage panel on /shorkie-lab/shorkie/ for the same locus.",
    },
    'sk-chip-exo': {
        'source': "Shorkie (Chao et al. 2025, bioRxiv 2025.09.19.677475), the fold-f0 checkpoint, run over sacCer3 in 1,493 windows of 16,384 bp on the same 8,192 bp cores as the language-model tracks, so the two models' lanes are aligned base for base. Not a published track.",
        'measures': 'Predicted ChIP-exo coverage averaged over the 1,128 ChIP-exo tracks: where the model expects a protein to be cross-linked to DNA, across every factor in that corpus at once.',
        'read': "A different assay from the RNA-seq lane and only r = 0.38 with it genome-wide. It is also ORF-enriched (1.20x, against RNA-seq's 17.94x), which is enough to look like an expression track at a glance and not enough to be one — the site has already shipped that confusion once, by reading the paper's channel order instead of the released targets sheet's.",
        'caveat': "Arbitrary units, and NOT comparable with a real coverage file: these are the model's predictions, on the scale its training data happened to have. The first 1,024 bases of every chromosome are blank because the head crops that much from each window end and no window can start before position 0 — 17,408 bases genome-wide, left as no data rather than filled from a window that never scored them. A single forward pass, not reverse-complement averaged, so that this lane reports the same number as the coverage panel on /shorkie-lab/shorkie/ for the same locus.",
    },
    'sk-chip-mnase': {
        'source': "Shorkie (Chao et al. 2025, bioRxiv 2025.09.19.677475), the fold-f0 checkpoint, run over sacCer3 in 1,493 windows of 16,384 bp on the same 8,192 bp cores as the language-model tracks, so the two models' lanes are aligned base for base. Not a published track.",
        'measures': 'Predicted ChIP-MNase coverage averaged over the 20 MNase tracks — nuclease accessibility, which is what a nucleosome map is built from.',
        'read': "Genome-wide this correlates with the expression lane at only r = 0.08, so it is close to an independent statement about the same sequence rather than a restatement of it. It is worth having for a second reason: no measured nucleosome track ships here, because the canonical chemical map (Brogaard 2012, GSE36063) is published only as raw reads — the smallest supplementary file is 238 MB — and UCSC's sacCer3 carries no nucleosome, RNA-seq or TSS signal among its 49 leaf tracks.",
        'caveat': "Arbitrary units, and NOT comparable with a real coverage file: these are the model's predictions, on the scale its training data happened to have. The first 1,024 bases of every chromosome are blank because the head crops that much from each window end and no window can start before position 0 — 17,408 bases genome-wide, left as no data rather than filled from a window that never scored them. A single forward pass, not reverse-complement averaged, so that this lane reports the same number as the coverage panel on /shorkie-lab/shorkie/ for the same locus. It is also the thinnest corpus of the four, at 20 tracks against 1,128.",
    },
    'sk-strain': {
        'source': "Shorkie (Chao et al. 2025, bioRxiv 2025.09.19.677475), the fold-f0 checkpoint, run over sacCer3 in 1,493 windows of 16,384 bp on the same 8,192 bp cores as the language-model tracks, so the two models' lanes are aligned base for base. Not a published track.",
        'measures': 'Predicted RNA-seq coverage averaged over the 1,014 natural-isolate tracks — the 1,000-genomes yeast panel, rather than the TF-induction timecourse the lane above uses.',
        'read': 'r = 0.49 with the T0 lane: related, and far from the same track. The two disagree wherever expression depends on strain background rather than on the induction state.',
        'caveat': "Arbitrary units, and NOT comparable with a real coverage file: these are the model's predictions, on the scale its training data happened to have. The first 1,024 bases of every chromosome are blank because the head crops that much from each window end and no window can start before position 0 — 17,408 bases genome-wide, left as no data rather than filled from a window that never scored them. A single forward pass, not reverse-complement averaged, so that this lane reports the same number as the coverage panel on /shorkie-lab/shorkie/ for the same locus.",
    },
    'sk-gradient': {
        'source': "Shorkie (Chao et al. 2025, bioRxiv 2025.09.19.677475), the fold-f0 checkpoint, run over sacCer3 in 1,493 windows of 16,384 bp on the same 8,192 bp cores as the language-model tracks, so the two models' lanes are aligned base for base. Not a published track. The derivative is taken through the PyTorch port, rc-averaged, and multiplied by the one-hot input.",
        'measures': "How much each individual base contributes to the model's predicted log2 RNA-seq coverage — d log2(sum of T0 coverage + 1) / d input, multiplied by the input. Because the input is one-hot, this keeps the reference base's own contribution and is exactly zero at the three bases that are not there; that is the correct rendering of the quantity, not a simplification of it. Averaged over both strands, which is a test-time augmentation the paper adopts and not a symmetry: the model is not reverse-complement equivariant.",
        'read': 'SIGNED, so the lane has a zero rule in its middle. A bar UP is a base whose presence raises the predicted expression of its window; a bar DOWN is one that lowers it. The axis is symmetric and logarithmic in both directions because the quantity is heavy-tailed: the median base reads |0.0008| against a maximum of 1.34, so a linear axis would draw a typical base at 2.5% of half-height.',
        'caveat': "This is NOT the attribution shown on /shorkie-lab/shorkie/, and it will not reproduce those figures. There, a reader picks a gene and the gradient is taken of that gene's predicted coverage. Genome-wide there is no chosen gene, so the target is each window's whole cropped interior — the only definition that exists at every base. Gradients superpose, so this is the sum of the per-gene attributions of everything in view. Second: a gradient is a LOCAL linear sensitivity, not the effect of actually changing the base. Against the shipped mutagenesis planes it agrees about DIRECTION and much less about magnitude: at 22 of 23 loci the single strongest substitution points the same way, and base by base the median correlation is 0.369 (range 0.05-0.65). The one exception is instructive rather than troubling — at GAL3 the gradient reads +0.0013 at the base mutagenesis calls strongest, which is essentially zero against a genome-wide median |gradient| of 0.0008. That is gradient SATURATION, the documented failure mode of a local derivative, and the reason mutagenesis and integrated gradients are on this page beside it. Full in-silico mutagenesis is the honest answer to 'what if this base changed', and it is not affordable genome-wide: measured, 1,231 hours.",
    },
    "lm-masked": {
        "source": "Shorkie_LM (Chao et al. 2025, bioRxiv 2025.09.19.677475), the fold-f0 checkpoint, run over sacCer3 in 16,384 bp windows. Not a published track.",
        "measures": "Information content, 2 − H(p), of the model's four-way distribution at each base, from the K = 7 iterative masked pass: positions are split into 7 disjoint strided sets, each masked in turn, and every position read back only from the pass that masked it. 2 bits means all the probability on one base; 0 means chance.",
        "read": "High where the surrounding sequence determines what belongs at a position — coding sequence, splice sites, strong binding sites. The nuclear genome averages 0.199 bits, so most of the track is genuinely low and a tall column is the exception rather than the baseline.",
        "caveat": "Confidence is not importance. A base the model predicts well is predictable FROM 165 Saccharomycetales genomes, which is not the same claim as functionally essential — a repetitive tract is highly predictable and carries little function. Read a peak against the conservation and GC lanes before reading it as meaning."
    },
    "lm-unmasked": {
        "source": "The same model and the same run as the masked track, with nothing masked.",
        "measures": "Information content from a single forward pass in which the model can see the base it is scoring. This is the quantity the paper's Figure 2A logo is built on.",
        "read": "Use it to see what masking costs. It runs about 3.4× higher (0.687 bits against 0.199) and picks the right base 97.5% of the time — but confident about WHICH base is not the same as sharply peaked, which is why 97.5% accuracy still averages under 0.7 of a possible 2 bits.",
        "caveat": "NOT A PREDICTION. The model is largely reading its own input, so its certainty here mostly measures how well it copies. It is drawn because the paper uses it and because the gap between the two passes is informative — never as evidence of what the model knows."
    },
    "phastcons": {
        "source": "UCSC phastCons7way for sacCer3 — a phylo-HMM over a 7-species alignment (S. cerevisiae, paradoxus, mikatae, kudriavzevii, bayanus, castellii, kluyveri), from hgdownload.soe.ucsc.edu/goldenPath/sacCer3/phastCons7way/.",
        "measures": "The posterior probability that a base lies in a conserved element, 0 to 1. A statement about what evolution has held still across those seven yeasts.",
        "read": "The independent check on the model: Shorkie_LM is alignment-free and this is alignment-based, so agreement is evidence and disagreement is a question. Genome-wide they correlate at r = 0.121, and both rank coding sequence above intergenic.",
        "caveat": "It SATURATES inside genes — 40.1% of coding bases sit at 0.99 or above, median 0.974 — so the within-CDS correlation of 0.045 is partly range restriction, not purely disagreement. It also has no value for 0.65% of the genome, drawn as a gap and never as zero."
    },
    "gc": {
        "source": "Computed from the sacCer3 reference on this machine; no external data. The genome-wide figure comes out at 38.15% against the published 38.1%, which is the check that the computation is right.",
        "measures": "The fraction of A/C/G/T in a centred 50 bp window that are G or C. 50 bp because a 5 bp window takes only six values and is not a composition, while the model's own 128 bp pooling grid would build the thing being controlled for into the control.",
        "read": "A CONTROL, and a small result is the reassuring one. If the model's information content were mostly base composition it would show here: measured, r = −0.020 genome-wide, so composition explains about 0.04% of the variance in model certainty.",
        "caveat": "Small overall is not zero everywhere. In intergenic sequence r = −0.221 — AT-rich sequence really is more predictable to the model, which is also why chrM at 17.1% GC is the most predictable chromosome in the genome (IC 0.457 against a nuclear 0.198). Read a peak in an AT-rich region with that in mind."
    }
}



_HIST_SRC = ("Shorkie (Chao et al. 2025, bioRxiv 2025.09.19.677475), fold f0, run over sacCer3. "
             "The ChIP-MNase block is 20 tracks over 9 histone marks; this lane is the mean of one "
             "mark's replicates rather than of all 20.")
_TF_SRC = ("Shorkie (Chao et al. 2025, bioRxiv 2025.09.19.677475), fold f0, run over sacCer3. The "
           "ChIP-exo block is 1,128 tracks over 765 targets; this lane is the mean of one target's "
           "replicates rather than of all 1,128.")
_FAM_CAVEAT = ("Arbitrary units, and a PREDICTION rather than an experiment - this is where the "
               "model expects the assay to read, not where anyone measured it. The first 1,024 "
               "bases of every chromosome are blank because the head crops that much from each "
               "window end. And 25 targets of 765 (or 9 marks) is a selection: a factor absent "
               "from the picker is absent because it was not shipped, never because the model "
               "predicts nothing for it.")

for _t in TRACKS:
    if _t.get("family") == "histone":
        TRACK_DOCS[_t["id"]] = {
            "source": _HIST_SRC,
            "measures": f"Predicted ChIP-MNase coverage for {_t['familyLabel']} - nuclease "
                        "accessibility under an antibody for that mark, which is what a chromatin "
                        "map is built from.",
            "read": "Against the expression lane, not alone -- and switch marks in this one lane "
                    "to see the canonical 5'/3' split, which the model reproduces from sequence "
                    "with no chromatin input at all. Measured over the 23 analysed genes, "
                    "normalised to each gene's own mean and oriented 5' to 3': H3K4me3 reads 1.50 "
                    "over the first quarter against 0.85 over the last, H3K9ac 1.38/0.86 and "
                    "H3K27ac 1.32/0.88 -- the promoter-proximal marks. H3K36me3 inverts it, "
                    "0.86/1.14, which is the co-transcriptional gene-body mark. Bulk H2B and H3 "
                    "stay flat (0.97/1.08 and 0.93/1.09), as histones with no positional "
                    "preference should.",
            "caveat": _FAM_CAVEAT + " No MEASURED nucleosome or histone track ships here for "
                      "comparison: the canonical chemical map (Brogaard 2012, GSE36063) is "
                      "published only as raw reads and UCSC's sacCer3 carries no nucleosome signal, "
                      "so there is nothing on this page to check these against.",
        }
    elif _t.get("family") == "chip-exo":
        _k = _t["familyLabel"]
        TRACK_DOCS[_t["id"]] = {
            "source": _TF_SRC,
            "measures": f"Predicted ChIP-exo coverage for {_k} ({TARGET_ROLE[_k]}) - where the "
                        "model expects this protein to be crosslinked to DNA.",
            "read": "A sharp peak is a predicted binding footprint; a broad one over a promoter is "
                    "usually the pre-initiation complex rather than a sequence-specific site. The "
                    "nine general-machinery targets in this picker exist to make that distinction "
                    "visible - they are also the targets that differ most from the pooled ChIP-exo "
                    "mean, which is why that mean is dominated by promoter shape.",
            "caveat": _FAM_CAVEAT + " ChIP-exo crosslinks whatever is in the complex, so a "
                      "predicted peak for a coactivator is not evidence that it touches DNA - the "
                      "browser's motif popup names seven factors here whose absent JASPAR matrix "
                      "is explained by exactly that.",
        }


def to_fraction(a: np.ndarray, lo: float, hi: float,
                space: str = "linear", linthresh: float = 1.0) -> np.ndarray:
    """A value onto [0, 1] up its lane, in the space the track is READ in.

    This is `axisFraction` in `src/lib/genomeBrowser.ts`, and the two must agree exactly or a byte
    decodes to a different height than it was written at. Three spaces, and which one a track uses
    is a property of its DATA rather than a display preference:

      linear  a bounded quantity that fills its range -- bits, a posterior, a GC fraction.
      log1p   predicted coverage, which spans four orders of magnitude. The median 16 bp bin reads
              2.07 against a genome-wide maximum of 1,097.6, so linearly the median sits at 0.2% of
              the lane and the whole track is a flat line with spikes.
      symlog  a SIGNED attribution, heavy-tailed in both directions. Measured on chrIV's
              gradient x input: median |v| 0.00082 against a maximum of 1.34, so on a symmetric
              linear axis the median base draws at 2.5% of half-height.

    Quantising in the read space rather than in value space is the same rule the per-locus packs
    already follow, and for the same measured reason: 256 levels spread linearly over a range
    spanning orders of magnitude waste almost all of themselves on the top.
    """
    v = np.asarray(a, dtype=np.float64)
    if space == "symlog":
        m = max(abs(lo), abs(hi), 1e-12)
        th = max(linthresh, 1e-12)
        f = np.sign(v) * (np.log1p(np.abs(v) / th) / np.log1p(m / th))
        return np.clip(0.5 + 0.5 * f, 0.0, 1.0)
    if space == "log1p":
        return np.clip(np.log1p(np.maximum(0.0, v - lo)) / np.log1p(max(hi - lo, 1e-12)), 0.0, 1.0)
    return np.clip((v - lo) / max(hi - lo, 1e-12), 0.0, 1.0)


def quant(a: np.ndarray, lo: float, hi: float,
          space: str = "linear", linthresh: float = 1.0) -> np.ndarray:
    """A score to uint8 on a FIXED per-track scale, with 0 reserved for "no data".

    Per-tile scaling would make each tile's bytes mean something different and a reader comparing
    two places on the genome would be comparing two rulers. Values land in 1-255; NaN stays 0.
    """
    q = np.clip(np.round(to_fraction(a, lo, hi, space, linthresh) * 254.0), 0, 254) + 1.0
    q[~np.isfinite(np.asarray(a, dtype=np.float64))] = 0.0
    return q.astype(np.uint8)


def write_tiles(dirpath: Path, rows: np.ndarray) -> int:
    """`rows` is [k, n]; write it as PNGs of TILE_BINS columns each."""
    dirpath.mkdir(parents=True, exist_ok=True)
    n = rows.shape[1]
    count = 0
    for t0 in range(0, n, TILE_BINS):
        chunk = rows[:, t0:t0 + TILE_BINS]
        img = Image.fromarray(chunk if chunk.shape[0] > 1 else chunk[0][None], mode="L")
        img.save(dirpath / f"{t0 // TILE_BINS}.png", format="PNG", optimize=True)
        count += 1
    return count


def ladder(native: int) -> list[int]:
    """The level INDICES a track at `native` bp a bin can honestly supply.

    A level finer than the track's own bins would be an upsampled step function; one its bins do not
    divide evenly would aggregate a fraction of a bin, which is a different quantity from a mean.
    Mirrors `nativeLadder` in `src/lib/genomeBrowser.ts`, which is what the client reads.
    """
    return [i for i, b in enumerate(LEVELS) if b >= native and b % native == 0]


def pyramid(values: np.ndarray, lo: float, hi: float, native: int = 1,
            space: str = "linear", linthresh: float = 1.0) -> dict[int, np.ndarray]:
    """Base level plus min/max/mean at each coarser level.

    `values` is at `native` bp a bin, NOT necessarily per base. A summary bin uses only the bins that
    HAVE a value; it is no-data only when every bin under it is. Otherwise a single unscored bin
    would blank a whole 4 kb summary.
    """
    lv = ladder(native)
    out = {lv[0]: quant(values, lo, hi, space, linthresh)[None]}
    for li in lv[1:]:
        step = LEVELS[li] // native
        nb = -(-len(values) // step)
        pad = nb * step - len(values)
        v = np.concatenate([values, np.full(pad, np.nan, dtype=np.float32)]).reshape(nb, step)
        fin = np.isfinite(v)
        empty = ~fin.any(axis=1)
        # Sum/count rather than nanmean: an all-NaN row makes nanmean emit a RuntimeWarning even
        # when the result is discarded, because numpy evaluates the call before np.where picks.
        n_ok = fin.sum(axis=1)
        mn = np.where(empty, np.nan, np.where(fin, v, np.inf).min(axis=1))
        mx = np.where(empty, np.nan, np.where(fin, v, -np.inf).max(axis=1))
        me = np.where(empty, np.nan, np.where(fin, v, 0.0).sum(axis=1) / np.maximum(n_ok, 1))
        out[li] = np.stack([quant(mn, lo, hi, space, linthresh),
                            quant(mx, lo, hi, space, linthresh),
                            quant(me, lo, hi, space, linthresh)])
    return out


def array_for(chrom: str, track: dict) -> Path:
    suffix = track["file"]
    return TRACK / (f"{chrom}.npy" if not suffix else f"{chrom}-{suffix}.npy")


def main() -> int:
    man = json.loads((TRACK / "manifest.json").read_text())
    cons_p = TRACK / "conservation.json"
    cons = json.loads(cons_p.read_text()) if cons_p.exists() else {}
    genome = read_fasta(SCRATCH / "sacCer3.fa")
    genes_by_chrom = load_genes(SCRATCH / "saccharomyces_cerevisiae.gff.gz")

    OUT.mkdir(parents=True, exist_ok=True)
    # NOT rmtree(OUT): `features.json` and `search.json` are written by make_genome_features.py and
    # would be deleted, which is a silent 404 for every annotation track rather than an error here.
    # Only the directories this script owns are cleared.
    for chrom_dir in OUT.iterdir():
        if not chrom_dir.is_dir():
            continue
        for sub in list(chrom_dir.iterdir()):
            if sub.is_dir() and (sub.name == "seq" or sub.name in {t["id"] for t in TRACKS}
                                 or sub.name.startswith("L")):
                shutil.rmtree(sub)

    tracks_present = [t for t in TRACKS
                      if all(array_for(c, t).exists() for c in man["chroms"])]
    need = {"source", "measures", "read", "caveat"}
    bad_docs = {t["id"]: sorted(need - set(TRACK_DOCS.get(t["id"], {})))
                for t in tracks_present if need - set(TRACK_DOCS.get(t["id"], {}))}
    if bad_docs:
        raise SystemExit(f"track(s) missing documentation fields: {bad_docs}")
    missing = [t["id"] for t in TRACKS if t not in tracks_present]
    if missing:
        print(f"  note: skipping track(s) with no arrays: {', '.join(missing)}")

    # A native resolution that divides no level in the ladder cannot be tiled at all: every level
    # would aggregate a fraction of a bin, which is a different quantity from a mean. Refuse here
    # rather than let the client fall back to the coarsest level, where a bad ladder is
    # indistinguishable from a sparse one.
    for tr in tracks_present:
        if not ladder(tr.get("nativeBp", 1)):
            raise SystemExit(f"{tr['id']}: nativeBp {tr['nativeBp']} divides no level in {LEVELS}")

    # Tracks whose axis comes from the data resolve it ONCE, over every chromosome, and the numbers
    # go into the index. A per-chromosome or per-tile range would make each byte mean something
    # different and a reader comparing two places on the genome would be comparing two rulers.
    for tr in tracks_present:
        how = tr.get("axisFrom")
        if not how:
            continue
        vals = np.concatenate([np.load(array_for(c, tr)) for c in man["chroms"]])
        fin = vals[np.isfinite(vals)]
        if how == "symmetric":
            m = float(np.abs(fin).max())
            tr["axis"] = [-m, m]
            # linthresh is the median |v|, which is what puts a TYPICAL base at a readable height
            # rather than pinned to the zero rule: measured on chrIV, 0.00082 against a max of 1.34.
            tr["linthresh"] = round(float(np.median(np.abs(fin))), 8)
        else:
            tr["axis"] = [0.0, float(fin.max())]
        tr["axis"] = [round(v, 6) for v in tr["axis"]]
        print(f"  {tr['id']:<15} axis {tr['axis']} ({tr.get('space','linear')}"
              + (f", linthresh {tr['linthresh']}" if 'linthresh' in tr else "") + ")")

    index: dict = {
        "genome": "sacCer3 / R64",
        "icMax": 2.0,
        "levels": [{"level": i, "binBp": b, "rows": 1 if i == 0 else 3} for i, b in enumerate(LEVELS)],
        "rowNames": ["min", "max", "mean"],
        "groupLabels": GROUP_LABELS,
        "familyLabels": FAMILY_LABELS,
        "tileBins": TILE_BINS,
        "noDataByte": 0,
        "quant": "byte 0 is no data; 1-255 map linearly onto the track's own axis range",
        "tracks": [{**{k: v for k, v in t.items() if k not in ("file", "axisFrom")},
                    # The track's OWN ladder. Level numbers stay global -- L3 is 64 bp for every
                    # track -- so a coarse track simply has holes at the fine end.
                    "levels": [{"level": i, "binBp": LEVELS[i],
                                "rows": 1 if i == ladder(t.get("nativeBp", 1))[0] else 3}
                               for i in ladder(t.get("nativeBp", 1))],
                    "docs": TRACK_DOCS[t["id"]]} for t in tracks_present],
        "window": {"seqLen": man["seqLen"], "flank": man["flank"], "core": man["core"],
                   "k": man["k"], "phase": 128,
                   "note": "every window starts on a multiple of 128, the U-Net's pooling grid; "
                           "the model is ~20x more sensitive to that phase than to the flank"},
        "chroms": [],
    }
    gc_p = TRACK / "gc.json"
    gc_rec = json.loads(gc_p.read_text()) if gc_p.exists() else {}
    if cons.get("comparison"):
        index["comparison"] = cons["comparison"]
    if gc_rec.get("comparison"):
        index["gcComparison"] = gc_rec["comparison"]
    if cons.get("track"):
        index["conservationSource"] = {"track": cons["track"], "units": cons["units"],
                                       "source": cons["source"]}

    total_tiles = 0
    total_bytes = 0
    for chrom in sorted(genome, key=lambda c: -len(genome[c])):
        if chrom not in man["chroms"]:
            continue
        seq = genome[chrom]
        levels_meta: dict[str, list] = {}
        track_stats: dict[str, dict] = {}

        for t in tracks_present:
            values = np.load(array_for(chrom, t))
            native = t.get("nativeBp", 1)
            want = -(-len(seq) // native)
            assert len(values) == want, \
                f"{chrom}/{t['id']}: {len(values)} bins vs {want} at {native} bp"
            lo, hi = t["axis"]
            meta = []
            for li, rows in pyramid(values, lo, hi, native,
                                    t.get("space", "linear"), t.get("linthresh", 1.0)).items():
                k = write_tiles(OUT / chrom / t["id"] / f"L{li}", rows)
                meta.append({"level": li, "bins": int(rows.shape[1]), "tiles": k})
                total_tiles += k
            levels_meta[t["id"]] = meta
            fin = np.isfinite(values)
            track_stats[t["id"]] = {
                "scored": int(fin.sum()),
                "mean": round(float(values[fin].mean()), 5) if fin.any() else None,
                # For a SIGNED track the mean is near zero everywhere by construction, so it is not
                # a baseline anything can be compared against. `meanAbs` is, and it is what the
                # browser's "vs genome" column uses for those lanes -- without it the column is
                # blank for exactly the two lanes a reader most wants to place in context.
                **({"meanAbs": round(float(np.abs(values[fin]).mean()), 6)}
                   if fin.any() and t["axis"][0] < 0 else {}),
                "min": round(float(values[fin].min()), 5) if fin.any() else None,
                "max": round(float(values[fin].max()), 5) if fin.any() else None,
            }

        # The reference, one byte a base: 0-3 for ACGT and 4 for anything else. A byte a base rather
        # than a packed 2-bit stream because deflate reaches roughly the same size on a four-symbol
        # alphabet and the decoder is then a plain array index instead of a bit shuffle.
        codes = np.full(len(seq), 4, dtype=np.uint8)
        arr = np.frombuffer(seq.encode(), dtype=np.uint8)
        for b, i in BASE_IDX.items():
            codes[arr == ord(b)] = i
        total_tiles += write_tiles(OUT / chrom / "seq", codes[None])

        genes = []
        # SGD's GFF names the mitochondrial chromosome `chrmt`; the UCSC FASTA calls it `chrM`.
        # Without the alias chrM silently gets zero genes -- and a browser showing an empty gene
        # track looks like a rendering bug rather than a naming mismatch.
        for g in genes_by_chrom.get(chrom, []) or genes_by_chrom.get(GFF_ALIAS.get(chrom, ""), []):
            if not g["cds"]:
                continue
            c0 = min(a for a, _ in g["cds"])
            c1 = max(b for _, b in g["cds"])
            # The primary common name, never an alphabetical pick from the alias set: SGD lists
            # GAPDH, GLD1, GPD, HSP35, HSP36, SSS2 and TDH3 for YGR192C, and sorting those labels
            # the gene "GAPDH" -- a real protein name, for the wrong reason, on every drawing.
            common = g.get("common") or ""
            genes.append({"name": g["id"], "strand": g["strand"],
                          "txStart": c0, "txEnd": c1, "cdsStart": c0, "cdsEnd": c1,
                          "exons": [[a, b] for a, b in g["cds"]],
                          **({"gene": common} if common and common != g["id"] else {})})
        genes.sort(key=lambda x: x["txStart"])
        (OUT / chrom / "genes.json").write_text(json.dumps(genes, separators=(",", ":")))

        m = man["chroms"][chrom]
        index["chroms"].append({
            "name": chrom, "length": len(seq), "genes": len(genes),
            "shortFlankBases": m["shortFlankBases"],
            "tracks": track_stats,
            "levels": levels_meta,
            # Kept for compatibility with anything already reading the single-track shape.
            "meanIc": track_stats.get("lm-masked", {}).get("mean"),
            "minIc": track_stats.get("lm-masked", {}).get("min"),
            "maxIc": track_stats.get("lm-masked", {}).get("max"),
        })
        used = sum(f.stat().st_size for f in (OUT / chrom).rglob("*") if f.is_file())
        total_bytes += used
        print(f"  {chrom:8s} {len(seq):>9,} bp  {len(genes):>4d} genes  "
              f"{sum(len(v) for v in levels_meta.values()):>2d} level-sets  {used/1e6:6.2f} MB")

    (OUT / "index.json").write_text(json.dumps(index, separators=(",", ":")))
    total_bytes += (OUT / "index.json").stat().st_size
    print(f"\n  {len(index['chroms'])} chromosomes, {len(tracks_present)} score tracks, "
          f"{total_tiles:,} tiles, {total_bytes/1e6:.1f} MB")
    print(f"  tracks: {', '.join(t['id'] + ' ' + str(t['axis']) + ' ' + t['units'] for t in tracks_present)}")
    print(f"  levels: {', '.join(f'L{i}={b}bp' for i, b in enumerate(LEVELS))}, "
          f"tile {TILE_BINS:,} bins, byte 0 = no data")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
