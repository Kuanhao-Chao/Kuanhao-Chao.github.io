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

LEVELS = [1, 8, 64, 512, 4096]     # bp per bin
TILE_BINS = 65536                  # bins a tile holds, at every level
BASE_IDX = {"A": 0, "C": 1, "G": 2, "T": 3}
# FASTA name -> SGD GFF name, where the two disagree.
GFF_ALIAS = {"chrM": "chrmt"}

# The score tracks, in the order the browser stacks them by default. `file` is the suffix in
# `_scratch/genome-track/`; `axis` is the FIXED display range, declared here so a byte means the
# same thing everywhere within a track and the decoder never has to guess.
TRACKS = [
    {
        "id": "lm-masked", "laneTag": "", "file": "", "axis": [0.0, 2.0], "units": "bits",
        "label": "Shorkie_LM · masked",
        "short": "masked",
        "detail": "information content, 2 − H(p), from the K = 7 iterative masked pass",
        "prediction": True,
        "note": "A prediction: every position is read back only from the pass that masked it, so "
                "the model never sees the base it is scoring.",
        "source": "Shorkie_LM (Chao et al. 2025), run over sacCer3 in 16,384 bp windows",
    },
    {
        "id": "lm-unmasked", "laneTag": "not a prediction", "file": "unmasked", "axis": [0.0, 2.0], "units": "bits",
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
        "id": "phastcons", "laneTag": "alignment-based", "file": "phastcons", "axis": [0.0, 1.0], "units": "posterior",
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
        "id": "gc", "laneTag": "composition control", "file": "gc",
        "axis": [0.0, 1.0], "units": "fraction",
        "label": "GC content · 50 bp",
        "short": "GC",
        "detail": "fraction of A/C/G/T in a centred 50 bp window that are G or C",
        "prediction": False,
        "note": "A CONTROL rather than a finding. If the model's information content were mostly "
                "base composition it would show here; measured, r = -0.020 genome-wide.",
        "source": "computed from the sacCer3 reference; no external data",
    },
]

# Every track documents itself, in four fields rather than a paragraph, so a track cannot ship
# without saying where it came from, what it physically measures, how to read it, and -- the field
# that matters most -- what it does NOT mean. `main()` refuses to write an index that is missing
# any of them, which is what "documented" has to mean to survive more than one round.
TRACK_DOCS = {
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


def quant(a: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """A score to uint8 on a FIXED per-track scale, with 0 reserved for "no data".

    Per-tile scaling would make each tile's bytes mean something different and a reader comparing
    two places on the genome would be comparing two rulers. Values land in 1-255; NaN stays 0.
    """
    v = (np.asarray(a, dtype=np.float64) - lo) / max(hi - lo, 1e-12)
    q = np.clip(np.round(v * 254.0), 0, 254) + 1.0
    q[~np.isfinite(a)] = 0.0
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


def pyramid(values: np.ndarray, lo: float, hi: float) -> dict[int, np.ndarray]:
    """Base level plus min/max/mean at each coarser level.

    A summary bin uses only the bases that HAVE a value; it is no-data only when every base under it
    is. Otherwise a single unscored base would blank a whole 4 kb bin.
    """
    out = {0: quant(values, lo, hi)[None]}
    for li, binbp in enumerate(LEVELS[1:], start=1):
        nb = -(-len(values) // binbp)
        pad = nb * binbp - len(values)
        v = np.concatenate([values, np.full(pad, np.nan, dtype=np.float32)]).reshape(nb, binbp)
        fin = np.isfinite(v)
        empty = ~fin.any(axis=1)
        # Sum/count rather than nanmean: an all-NaN row makes nanmean emit a RuntimeWarning even
        # when the result is discarded, because numpy evaluates the call before np.where picks.
        n_ok = fin.sum(axis=1)
        mn = np.where(empty, np.nan, np.where(fin, v, np.inf).min(axis=1))
        mx = np.where(empty, np.nan, np.where(fin, v, -np.inf).max(axis=1))
        me = np.where(empty, np.nan, np.where(fin, v, 0.0).sum(axis=1) / np.maximum(n_ok, 1))
        out[li] = np.stack([quant(mn, lo, hi), quant(mx, lo, hi), quant(me, lo, hi)])
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

    index: dict = {
        "genome": "sacCer3 / R64",
        "icMax": 2.0,
        "levels": [{"level": i, "binBp": b, "rows": 1 if i == 0 else 3} for i, b in enumerate(LEVELS)],
        "rowNames": ["min", "max", "mean"],
        "tileBins": TILE_BINS,
        "noDataByte": 0,
        "quant": "byte 0 is no data; 1-255 map linearly onto the track's own axis range",
        "tracks": [{**{k: v for k, v in t.items() if k != "file"},
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
            assert len(values) == len(seq), f"{chrom}/{t['id']}: {len(values)} vs {len(seq)}"
            lo, hi = t["axis"]
            meta = []
            for li, rows in pyramid(values, lo, hi).items():
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
