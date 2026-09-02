"""
Every biological annotation the browser draws, genome-wide, from flat files.

`make_annotations.py` fetches the UCSC REST API per 16 kb window, which is right for 23 windows and
wrong for 12 Mb: the same data is published as small flat files, and the whole genome costs four
downloads instead of hundreds of API calls.

    SGD classes        local, _scratch/saccharomyces_cerevisiae.gff.gz -- tRNA, snoRNA, ncRNA,
                       snRNA, rRNA, ARS + consensus, LTR, transposon, centromere, telomere,
                       pseudogene, uORF, introns
    transRegCode       206,558 Harbison/MacIsaac calls over 102 TFs, each carrying chipEvidence
                       and consSpecies -- the three evidence tiers the other two lab pages draw
    oreganno           ~6,100 literature-curated regulatory regions
    phastConsElements  the conserved elements phastCons calls, as discrete spans
    simpleRepeat       tandem repeats

**JASPAR is deliberately absent.** Unfiltered it is 16.7 M hits genome-wide -- 1.4 per base, which
is not an annotation but a scan. It has no flat file either (bigBed only), so it would need 17 slow
REST calls to produce the weakest of the evidence tiers. The other two lab pages already say the
PWM tier enriches at 1.49x against 3.26x for ChIP-supported sites; this omits it rather than drawing
something that would drown the strong tier.

**Evidence tier is a claim, not a display option**, so it is stored per feature and never merged:
`chipEvidence` good/weak becomes the ChIP-supported tier, and everything else with conservation
becomes the conserved-only tier. Merging them into one "TFBS" layer is how a 9,777-feature result
gets buried under 190,579 weaker ones.

Output:
    public/genome-data/<chrom>/features.json   compact per-class arrays + a name table
    public/genome-data/search.json             gene name -> locus, for the browser's search box

Usage:  python3 scripts/shorkie/make_genome_features.py [--force]
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

from add_loci import load_genes, read_fasta, systematic_id        # noqa: E402
from make_annotations import SGD_CLASSES                          # noqa: E402  one class map

SCRATCH = Path(__file__).resolve().parent / "_scratch"
OUT = ROOT / "public" / "genome-data"
UCSC = "https://hgdownload.soe.ucsc.edu/goldenPath/sacCer3/database"
GFF_ALIAS = {"chrM": "chrmt"}
REV_ALIAS = {v: k for k, v in GFF_ALIAS.items()}

# Classes that are already drawn by the dedicated gene lane and must not be duplicated as generic
# features: the gene lane draws exons and introns from the gene models themselves.
GENE_LANE = {"gene", "cds", "intron"}


def fetch(url: str, tries: int = 3) -> bytes:
    last: Exception | None = None
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=180) as r:
                return r.read()
        except Exception as ex:                                   # noqa: BLE001  retried below
            last = ex
    raise SystemExit(f"could not fetch {url}: {last}")


def ucsc_table(name: str) -> list[list[str]]:
    """A UCSC `database/<name>.txt.gz` as rows of raw fields."""
    raw = fetch(f"{UCSC}/{name}.txt.gz")
    with gzip.open(io.BytesIO(raw), "rt") as fh:
        return [line.rstrip("\n").split("\t") for line in fh if line.strip()]


def sgd_features(gff: Path) -> dict[str, list[dict]]:
    """Non-gene SGD classes, per chromosome, 0-based half-open.

    The gene lane already draws genes, their CDS pieces and their introns from the gene models, so
    those three classes are skipped here: drawing them twice would put a second, subtly different
    copy of every gene under the first.
    """
    out: dict[str, list[dict]] = {}
    opener = gzip.open if gff.suffix == ".gz" else open
    with opener(gff, "rt") as fh:
        for line in fh:
            if line.startswith("#"):
                if line.startswith("##FASTA"):
                    break
                continue
            f = line.rstrip("\n").split("\t")
            if len(f) < 9:
                continue
            chrom, kind, start, end, strand, attrs = f[0], f[2], int(f[3]), int(f[4]), f[6], f[8]
            cls = SGD_CLASSES.get(kind)
            if cls is None or cls in GENE_LANE:
                continue
            kv = dict(p.split("=", 1) for p in attrs.split(";") if "=" in p)
            name = kv.get("gene") or kv.get("Name") or systematic_id(kv.get("ID", "")) or cls
            out.setdefault(REV_ALIAS.get(chrom, chrom), []).append({
                "cls": cls, "start": start - 1, "end": end,       # GFF is 1-based inclusive
                "strand": strand, "name": name,
            })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    genome = read_fasta(SCRATCH / "sacCer3.fa")
    lengths = {c: len(s) for c, s in genome.items()}
    by_chrom: dict[str, list[dict]] = {c: [] for c in genome}

    def add(chrom: str, rec: dict) -> None:
        # Clip to the chromosome rather than dropping: a feature that runs off the end is still a
        # feature, and silently losing it would make a class look sparse at exactly the telomeres.
        n = lengths.get(chrom)
        if n is None:
            return
        rec["start"] = max(0, min(rec["start"], n))
        rec["end"] = max(rec["start"], min(rec["end"], n))
        if rec["end"] > rec["start"]:
            by_chrom[chrom].append(rec)

    print("SGD classes (local GFF)")
    for chrom, recs in sgd_features(SCRATCH / "saccharomyces_cerevisiae.gff.gz").items():
        for r in recs:
            add(chrom, {**r, "source": "sgd"})

    print("transRegCode (Harbison/MacIsaac regulatory code)")
    for f in ucsc_table("transRegCode"):
        # bin chrom chromStart chromEnd name score chipEvidence consSpecies
        chip = f[6]
        cons = int(f[7])
        # Three claims, kept apart. `good`/`weak` chipEvidence is a measurement that the factor
        # binds there; conservation alone is a much weaker statement; neither is a motif match.
        cls = ("tfbs_chip" if chip in ("good", "weak")
               else "tfbs_conserved" if cons > 0 else "tfbs_pwm")
        add(f[1], {"cls": cls, "start": int(f[2]), "end": int(f[3]), "strand": ".",
                   "name": f[4], "source": "harbison-macisaac",
                   "evidence": chip, "consSpecies": cons})

    print("oreganno (curated regulatory regions)")
    for f in ucsc_table("oreganno"):
        # bin chrom chromStart chromEnd id strand name
        add(f[1], {"cls": "regulatory", "start": int(f[2]), "end": int(f[3]),
                   "strand": f[5], "name": f[6], "source": "oreganno"})

    print("phastConsElements7way (conserved elements)")
    for f in ucsc_table("phastConsElements7way"):
        # bin chrom chromStart chromEnd name score   (name is "lod=NN")
        add(f[1], {"cls": "conserved_element", "start": int(f[2]), "end": int(f[3]),
                   "strand": ".", "name": f[4], "source": "phastCons7way",
                   "score": int(f[5])})

    print("simpleRepeat (tandem repeats)")
    for f in ucsc_table("simpleRepeat"):
        # bin chrom chromStart chromEnd name period copyNum consensusSize ...
        add(f[1], {"cls": "repeat", "start": int(f[2]), "end": int(f[3]), "strand": ".",
                   "name": f"{f[5]}bp x{f[6]}", "source": "simpleRepeat"})

    # ---- write, one file a chromosome ---------------------------------------------------------
    OUT.mkdir(parents=True, exist_ok=True)
    totals: dict[str, int] = {}
    for chrom, recs in by_chrom.items():
        recs.sort(key=lambda r: (r["start"], r["end"]))
        # Names repeat heavily -- 102 TFs across 206,558 calls -- so they go in a table and each
        # feature carries an index. That is most of the difference between a 600 KB file and a
        # 150 KB one, and it costs the reader nothing.
        names: list[str] = []
        idx: dict[str, int] = {}
        classes: dict[str, list] = {}
        for r in recs:
            nm = r.get("name") or ""
            if nm not in idx:
                idx[nm] = len(names)
                names.append(nm)
            # [start, length, nameIdx, strand, extra] -- length not end, because a length is a
            # small number and an end is a seven-digit one, and JSON stores both as text.
            strand = {"+": 1, "-": -1}.get(r.get("strand", "."), 0)
            row = [r["start"], r["end"] - r["start"], idx[nm], strand]
            extra = r.get("score", r.get("consSpecies"))
            if extra is not None:
                row.append(int(extra))
            classes.setdefault(r["cls"], []).append(row)
            totals[r["cls"]] = totals.get(r["cls"], 0) + 1
        (OUT / chrom).mkdir(parents=True, exist_ok=True)
        (OUT / chrom / "features.json").write_text(json.dumps(
            {"chrom": chrom, "length": lengths[chrom], "names": names,
             "fields": ["start", "length", "nameIdx", "strand", "extra"],
             "classes": classes}, separators=(",", ":")))
        kb = (OUT / chrom / "features.json").stat().st_size / 1024
        print(f"  {chrom:8s} {len(recs):>7,} features, {len(names):>5,} names, {kb:7.1f} KB")

    # ---- the search index ---------------------------------------------------------------------
    # Every gene's common name and systematic id, genome-wide, in one small file: search must work
    # before any chromosome has been fetched, or typing a gene name would need 17 downloads first.
    genes_by_chrom = load_genes(SCRATCH / "saccharomyces_cerevisiae.gff.gz")
    entries: list[list] = []
    for gff_chrom, gs in genes_by_chrom.items():
        chrom = REV_ALIAS.get(gff_chrom, gff_chrom)
        if chrom not in lengths:
            continue
        for g in gs:
            # Primary common name first, then the synonyms: `searchSuggest` shows this order, and
            # leading with an alias makes the suggestion look like a different gene.
            common = g.get("common") or ""
            rest = sorted(a for a in g.get("aliases", set()) if a and a != g["id"] and a != common)
            aliases = ([common] if common else []) + rest
            entries.append([g["id"], chrom, g["start"], g["end"],
                            1 if g["strand"] == "+" else -1, aliases])
    entries.sort(key=lambda e: (e[1], e[2]))
    (OUT / "search.json").write_text(json.dumps(
        {"fields": ["id", "chrom", "start", "end", "strand", "aliases"], "genes": entries},
        separators=(",", ":")))

    print(f"\n  search index: {len(entries):,} genes, "
          f"{(OUT / 'search.json').stat().st_size/1024:.1f} KB")
    print("  features by class:")
    for cls, n in sorted(totals.items(), key=lambda kv: -kv[1]):
        print(f"    {cls:20s} {n:>8,}")
    print(f"  {sum(totals.values()):,} features over {len(by_chrom)} chromosomes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
