"""
Turn the genome-wide Shorkie_LM track into what the browser actually fetches.

The track is 12,157,105 float32 values -- 49 MB, and useless to a web page as one blob. This builds
a BigWig-style pyramid of PNG tiles so a viewport fetches only the few tiles it covers, at only the
resolution it can draw.

**Why min and max and not just mean.** A summary bin that stores only its average hides exactly what
a constraint track exists to show: one strongly determined base inside a 4,096 bp bin disappears
into the surrounding noise. Every level above the base stores min, max and mean as three rows, so
the drawing can show the envelope and the reader can see that a bin contains a spike. A pyramid that
smooths is a pyramid that lies.

**Why PNG.** Every other pack in this repo is a PNG for the same reason: `createImageBitmap` decodes
it natively on a worker thread, so no JavaScript inflate ships and no base64 bloats the transfer.
DNA and quantised IC both compress well under deflate.

Levels are 1 / 8 / 64 / 512 / 4096 bp per bin. At a ~1,400 px viewport that covers the whole genome
(8.7 kb/px) through to single bases, with each level used over roughly an 8x zoom range.

Emits, under `public/genome-data/`:
    index.json                      chromosome lengths, level bin sizes, the IC scale
    <chrom>/L<level>/<tile>.png     the pyramid; L0 is one row, coarser levels are min/max/mean
    <chrom>/seq/<tile>.png          the reference, one byte a base, for the letter view
    <chrom>/genes.json              gene models for the gene track

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
IC_MAX = 2.0                       # information content is 2 - H(p), so [0, 2] bits by construction
BASE_IDX = {"A": 0, "C": 1, "G": 2, "T": 3}
# FASTA name -> SGD GFF name, where the two disagree.
GFF_ALIAS = {"chrM": "chrmt"}


def quant(a: np.ndarray) -> np.ndarray:
    """IC in [0, 2] bits to uint8. A fixed scale, not a per-tile one.

    Per-tile scaling would make each tile's bytes mean something different and a reader comparing
    two places on the genome would be comparing two rulers. 2/255 = 0.0078 bits a step, against an
    IC standard deviation around 0.27 -- about 35 steps across a typical spread.
    """
    return np.clip(np.round(a / IC_MAX * 255.0), 0, 255).astype(np.uint8)


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


def pyramid(ic: np.ndarray) -> dict[int, np.ndarray]:
    """Base level plus min/max/mean at each coarser level."""
    out = {0: quant(ic)[None]}
    for li, binbp in enumerate(LEVELS[1:], start=1):
        nb = -(-len(ic) // binbp)
        pad = nb * binbp - len(ic)
        # Pad with NaN so a partial final bin summarises only the bases it really covers.
        v = np.concatenate([ic, np.full(pad, np.nan, dtype=np.float32)]).reshape(nb, binbp)
        with np.errstate(all="ignore"):
            mn = np.nanmin(v, axis=1)
            mx = np.nanmax(v, axis=1)
            me = np.nanmean(v, axis=1)
        out[li] = np.stack([quant(mn), quant(mx), quant(me)])
    return out


def main() -> int:
    man = json.loads((TRACK / "manifest.json").read_text())
    genome = read_fasta(SCRATCH / "sacCer3.fa")
    genes_by_chrom = load_genes(SCRATCH / "saccharomyces_cerevisiae.gff.gz")

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    index: dict = {
        "genome": "sacCer3 / R64",
        "score": "Shorkie_LM information content, 2 - H(p), bits",
        "icMax": IC_MAX,
        "levels": [{"level": i, "binBp": b, "rows": 1 if i == 0 else 3} for i, b in enumerate(LEVELS)],
        "rowNames": ["min", "max", "mean"],
        "tileBins": TILE_BINS,
        "window": {"seqLen": man["seqLen"], "flank": man["flank"], "core": man["core"],
                   "k": man["k"], "phase": 128,
                   "note": "every window starts on a multiple of 128, the U-Net's pooling grid; "
                           "the model is ~20x more sensitive to that phase than to the flank"},
        "chroms": [],
    }

    total_tiles = 0
    total_bytes = 0
    for chrom in sorted(genome, key=lambda c: -len(genome[c])):
        if chrom not in man["chroms"]:
            continue
        ic = np.load(TRACK / f"{chrom}.npy")
        seq = genome[chrom]
        assert len(ic) == len(seq), f"{chrom}: track {len(ic)} vs sequence {len(seq)}"

        levels_meta = []
        for li, rows in pyramid(ic).items():
            k = write_tiles(OUT / chrom / f"L{li}", rows)
            levels_meta.append({"level": li, "bins": int(rows.shape[1]), "tiles": k})
            total_tiles += k

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
            genes.append({"name": g["id"], "strand": g["strand"],
                          "txStart": c0, "txEnd": c1, "cdsStart": c0, "cdsEnd": c1,
                          "exons": [[a, b] for a, b in g["cds"]]})
        genes.sort(key=lambda x: x["txStart"])
        (OUT / chrom / "genes.json").write_text(json.dumps(genes, separators=(",", ":")))

        m = man["chroms"][chrom]
        index["chroms"].append({
            "name": chrom, "length": len(ic), "genes": len(genes),
            "meanIc": m["mean"], "minIc": m["min"], "maxIc": m["max"],
            "shortFlankBases": m["shortFlankBases"],
            "levels": levels_meta,
        })
        used = sum(f.stat().st_size for f in (OUT / chrom).rglob("*") if f.is_file())
        total_bytes += used
        print(f"  {chrom:8s} {len(ic):>9,} bp  {len(genes):>4d} genes  "
              f"{sum(l['tiles'] for l in levels_meta):>4d} tiles  {used/1e6:6.2f} MB")

    (OUT / "index.json").write_text(json.dumps(index, separators=(",", ":")))
    total_bytes += (OUT / "index.json").stat().st_size
    print(f"\n  {len(index['chroms'])} chromosomes, {total_tiles:,} tiles, {total_bytes/1e6:.1f} MB")
    print(f"  levels: {', '.join(f'L{i}={b}bp' for i, b in enumerate(LEVELS))}, "
          f"tile {TILE_BINS:,} bins, IC scale 0-{IC_MAX}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
