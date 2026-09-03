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
]

# Every track documents itself, in four fields rather than a paragraph, so a track cannot ship
# without saying where it came from, what it physically measures, how to read it, and -- the field
# that matters most -- what it does NOT mean. `main()` refuses to write an index that is missing
# any of them, which is what "documented" has to mean to survive more than one round.
TRACK_DOCS = {
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
        'caveat': "This is NOT the attribution shown on /shorkie-lab/shorkie/, and it will not reproduce those figures. There, a reader picks a gene and the gradient is taken of that gene's predicted coverage. Genome-wide there is no chosen gene, so the target is each window's whole cropped interior — the only definition that exists at every base. Gradients superpose, so this is the sum of the per-gene attributions of everything in view. Second: a gradient is a LOCAL linear sensitivity, not the effect of actually changing the base. Against the shipped mutagenesis planes it agrees in sign — at all eight loci checked the single strongest substitution has the same sign here — and correlates at r = 0.41, which is what a derivative and a finite jump should do where a promoter is saturated. Full in-silico mutagenesis is the honest answer to 'what if this base changed', and it is not affordable genome-wide: measured, 1,231 hours.",
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
