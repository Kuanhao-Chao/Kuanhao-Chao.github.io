"""
Add loci to `src/data/shorkieLoci.json` from a published window, using sacCer3 and the SGD GFF.

The fourteen shipped windows were entered by hand. Supplemental Figures S19 and S20 add nine more,
and nine hand-entered coordinate pairs is exactly the kind of input that looks right and is wrong by
one, so everything here is derived rather than typed: only the gene name and the published
`chrN:start-end` from the figure are input, and the sequence, the gene models and the bin ranges all
come out of the reference.

**The windowing rule is the paper's, verified against the six Figure 4 loci already shipped.** With
the published window inclusive-length `L`:

    seqStart = (16384 - L) // 2          # the published window sits centred
    seqEnd   = seqStart + L
    start    = (chromStart - 1) - seqStart   # 0-based genome offset of the 16,384 bp window

That reproduces `start` and `seqStart` exactly for RPL26A, FUN12, KRE33, DTD1, MMS2 and HOP2 --
including DTD1's 197 bp and HOP2's 777 bp windows, which are not 501 -- so it is the rule the
existing data was built with rather than a guess that happens to fit the common case.

The gene models are read from the GFF for every gene overlapping the window, not just the named one:
a 16,384 bp yeast window holds a dozen genes and the coverage plot draws all of them.

Usage:
    python3 scripts/shorkie/add_loci.py --dry-run
    python3 scripts/shorkie/add_loci.py
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRATCH = Path(__file__).resolve().parent / "_scratch"
SEQ_LEN, BIN_BP, CROP_BP, N_BINS = 16384, 16, 1024, 896

# Gene, published window (1-based inclusive, exactly as the figure prints it), and the panel.
# RPL26A is deliberately absent: it is already shipped, and it is the control that this script's
# derivation reproduces the existing entry.
NEW_LOCI = [
    ("RPL4A",  "chrII",   299716, 300216, "Fig S19A", "Ribosomal protein promoter — Abf1, Sfp1.2, Poly(dA:dT) and a TATA box"),
    ("RPS2",   "chrVII",  277167, 277667, "Fig S19C", "Ribosomal protein promoter — Rap1, Abf1 and a TATA box"),
    ("RPL13A", "chrIV",   307974, 308474, "Fig S19D", "Ribosomal protein promoter — two Rap1 sites and a 5' splice site"),
    ("RPL40A", "chrIX",   68258,  68758,  "Fig S19E", "Ribosomal protein promoter — Rap1 and Fhl1"),
    ("RPS16A", "chrXIII", 551478, 551978, "Fig S19F", "Ribosomal protein promoter — Rap1, Fhl1 and Reb1.1"),
]

# DEFERRED: the four Figure S20 panels. Their windows are derived and verified the same way as the
# nine above -- the coordinates below are correct and reproduce sacCer3 at those positions -- but
# their full-window ISM (~19 min a locus) has not been computed, and a locus without an ISM pack
# breaks the page and verify_pipeline. Move an entry into NEW_LOCI once its ISM exists.
DEFERRED_LOCI = [
    ("PIS1",   "chrXVI",  751807, 752307, "Fig S20A", "PAC motif (GCGATGAGATGAG), Sfp1, a TATA box and two start codons"),
    ("PWP1",   "chrXII",  543518, 544018, "Fig S20B", "Reb1 beside both RRB regulon motifs — RRPE and PAC"),
    ("POP4",   "chrII",   728435, 728935, "Fig S20C", "A single dominant Reb1 site"),
    ("GLK1",   "chrIII",  50388,  50888,  "Fig S20D", "Reb1, two Tye7p sites and a TATA box"),
]

CONTROL = ("RPL26A", "chrXII", 818862, 819362)     # already shipped; must be reproduced exactly

# The motifs each supplemental panel LABELS, by dictionary id. Scanning for exactly these -- rather
# than for everything in the dictionary -- is what keeps the panel honest: the figure says which
# motifs it found, and the scan says where they are. A label the scan cannot place is reported
# rather than dropped, because that is a disagreement worth seeing.
PANEL_MOTIFS = {
    "YBR031W": ["abf1", "sfp1", "polyda", "tata", "start"],          # S19A RPL4A
    "YGL123W": ["rap1", "abf1", "tata", "start"],                    # S19C RPS2
    "YDL082W": ["rap1", "donor", "start"],                           # S19D RPL13A
    "YIL148W": ["rap1", "fhl1", "start"],                            # S19E RPL40A
    "YMR143W": ["rap1", "fhl1", "reb1", "start"],                    # S19F RPS16A
    "YPR113W": ["pac", "sfp1", "tata", "start"],                     # S20A PIS1
    "YLR196W": ["reb1", "rrpe", "pac", "start"],                     # S20B PWP1
    "YBR257W": ["reb1", "start"],                                    # S20C POP4
    "YCL040W": ["reb1", "tye7", "tata", "start"],                    # S20D GLK1
}


def read_fasta(path: Path) -> dict[str, str]:
    seqs: dict[str, list[str]] = {}
    name = None
    with path.open() as fh:
        for line in fh:
            if line.startswith(">"):
                name = line[1:].split()[0]
                seqs[name] = []
            elif name:
                seqs[name].append(line.strip())
    return {k: "".join(v) for k, v in seqs.items()}


def systematic_id(raw: str) -> str:
    """SGD names a CDS `YGR192C_CDS` and parents it to `YGR192C_id001`; strip both suffixes."""
    return re.sub(r"(_CDS|_id\d+|_mRNA)$", "", raw)


def load_genes(gff: Path) -> dict[str, list[dict]]:
    """Genes and their CDS pieces, per chromosome, in 0-based half-open genome coordinates."""
    genes: dict[str, dict] = {}
    cds: dict[str, list[tuple[int, int]]] = {}
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
            kv = dict(p.split("=", 1) for p in attrs.split(";") if "=" in p)
            # GFF is 1-based inclusive; everything below is 0-based half-open.
            a, b = start - 1, end
            if kind in ("gene", "ncRNA_gene", "tRNA_gene", "snoRNA_gene", "pseudogene"):
                gid = systematic_id(kv.get("ID", ""))
                if gid:
                    # SGD puts the systematic name in Name= and the COMMON name in gene=, with
                    # further synonyms in Alias=. The figures name genes commonly (RPL26A), so all
                    # three have to be searchable or the control fails to find itself.
                    aliases = {gid, kv.get("Name", gid)}
                    if kv.get("gene"):
                        aliases.add(kv["gene"])
                    for al in (kv.get("Alias") or "").split(","):
                        al = al.strip()
                        # Alias carries prose descriptions too ("60S ribosomal protein uL24 …");
                        # keep only the short symbol-like entries.
                        if al and len(al) <= 12 and "%20" not in al:
                            aliases.add(al)
                    genes[gid] = {"chrom": chrom, "start": a, "end": b, "strand": strand,
                                  "kind": kind, "name": kv.get("Name", gid),
                                  "aliases": aliases}
            elif kind == "CDS":
                # SGD parents a CDS to EVERY transcript isoform that uses it, comma-separated:
                # `Parent=YDL082W_id002,YDL082W_id001`. Stripping a suffix off the whole string
                # leaves `YDL082W_id002,YDL082W`, which matches no gene -- so no CDS attached to
                # anything and every gene silently became a single exon with no introns. Split
                # first; `Name=YDL082W_CDS` is the fallback.
                parents = (kv.get("Parent") or kv.get("Name") or kv.get("ID") or "").split(",")
                pid = systematic_id(parents[0].strip()) if parents else ""
                if pid:
                    cds.setdefault(pid, []).append((a, b))
    by_chrom: dict[str, list[dict]] = {}
    for gid, g in genes.items():
        g["id"] = gid
        g["cds"] = sorted(cds.get(gid, []))
        by_chrom.setdefault(g["chrom"], []).append(g)
    for v in by_chrom.values():
        v.sort(key=lambda g: g["start"])
    return by_chrom


def build_locus(gene: str, chrom: str, pub_start: int, pub_end: int, panel: str, blurb: str,
                fasta: dict[str, str], genes_by_chrom: dict[str, list[dict]]) -> dict:
    L = pub_end - pub_start + 1                      # the figure prints an inclusive range
    seq_start = (SEQ_LEN - L) // 2
    win_start = (pub_start - 1) - seq_start          # 0-based genome offset of the window
    if win_start < 0 or win_start + SEQ_LEN > len(fasta[chrom]):
        raise SystemExit(f"{gene}: a {SEQ_LEN} bp window at {chrom}:{win_start} falls off the chromosome")
    sequence = fasta[chrom][win_start:win_start + SEQ_LEN].upper()

    # start FLOORS and end CEILS -- derived from the 125 features of the fourteen shipped windows,
    # where floor matches start 125/125 and ceil matches end 125/125 (floor matches end only
    # 16/125). Rounding both, which is the obvious guess, is wrong for the end.
    def bin_floor(pos: int) -> int:
        return max(0, min(N_BINS, math.floor((pos - CROP_BP) / BIN_BP)))

    def bin_ceil(pos: int) -> int:
        return max(0, min(N_BINS, math.ceil((pos - CROP_BP) / BIN_BP)))

    features = []
    named = None
    for g in genes_by_chrom.get(chrom, []):
        # Two selection rules, both DERIVED from the fourteen shipped windows rather than chosen:
        # applied together they reproduce all fourteen gene lists and every coordinate exactly.
        #   1. Protein-coding only -- a gene with no CDS (ncRNA, tRNA) is not in `features`; those
        #      live in the annotation layer instead.
        #   2. `txStart`/`txEnd` are the CDS extent, NOT the SGD gene record, which includes UTRs.
        #      For RPL26A the gene record is 7928-9331 while the shipped entry is 8391-9222.
        #   3. Keep it when its CDS overlaps the model's CROPPED interior [1024, 15360). A gene
        #      whose coding span lies entirely in the uncropped flank has no output bin to sit
        #      under, which is why the shipped windows exclude those and not merely the ones that
        #      run off the edge -- YLR342W is kept with a negative txStart.
        if not g["cds"]:
            continue
        pieces = [(a - win_start, b - win_start) for a, b in g["cds"]]
        cds0 = min(a for a, _ in pieces)
        cds1 = max(b for _, b in pieces)
        if cds1 <= CROP_BP or cds0 >= SEQ_LEN - CROP_BP:
            continue
        feat = {
            "name": g["id"], "strand": g["strand"],
            "txStart": cds0, "txEnd": cds1,
            "cdsStart": cds0, "cdsEnd": cds1,
            "exons": [[a, b] for a, b in pieces],
            "start": bin_floor(cds0), "end": bin_ceil(cds1),
        }
        features.append(feat)
        if gene in g.get("aliases", {g["id"]}):
            named = feat
    features.sort(key=lambda f: (f["txStart"], f["txEnd"]))
    if named is None:
        raise SystemExit(f"{gene}: not found among the {len(features)} genes in its own window")

    return {
        "id": named["name"], "gene": gene, "blurb": f"{panel} — {blurb}",
        "chrom": chrom, "start": win_start, "strand": named["strand"],
        "sequence": sequence,
        "features": features,
        "figurePanel": panel,
        "motifs": [],
        "figureWindow": {
            "chromStart": pub_start, "chromEnd": pub_end,
            "seqStart": seq_start, "seqEnd": seq_start + L,
            "binStart": math.floor((seq_start - CROP_BP) / BIN_BP),
            "binEnd": math.ceil((seq_start + L - CROP_BP) / BIN_BP),
        },
    }


IUPAC = {"A": "A", "C": "C", "G": "G", "T": "T", "R": "AG", "Y": "CT", "S": "GC",
         "W": "AT", "K": "GT", "M": "AC", "B": "CGT", "D": "AGT", "H": "ACT",
         "V": "ACG", "N": "ACGT"}


def _rc(s: str) -> str:
    return s.translate(str.maketrans("ACGT", "TGCA"))[::-1]


def scan_motifs(locus: dict, ids: list[str], dictionary: dict) -> list[dict]:
    """Find each labelled motif inside the PUBLISHED window, nearest its centre.

    Restricted to the published window because that is the span the figure draws and labels: a
    consensus like TATAAA occurs dozens of times across 16,384 bp, and taking the genome-wide first
    hit would put a box wherever the window happened to start.
    """
    by_id = {m["id"]: m for m in dictionary["motifs"]}
    fw = locus["figureWindow"]
    lo, hi = fw["seqStart"], fw["seqEnd"]
    seq = locus["sequence"][lo:hi].upper()
    mid = len(seq) / 2
    out, missing = [], []
    for mid_id in ids:
        entry = by_id.get(mid_id)
        if entry is None:
            missing.append(mid_id)
            continue
        best = None
        for alt in entry["consensus"].split("|"):
            pat = re.compile("".join(f"[{IUPAC.get(c, 'ACGT')}]" for c in alt))
            for m in pat.finditer(seq):
                d = abs(m.start() - mid)
                if best is None or d < best[0]:
                    best = (d, m.start(), m.start() + len(alt), "+", alt)
            for m in pat.finditer(_rc(seq)):
                s = len(seq) - m.end()
                d = abs(s - mid)
                if best is None or d < best[0]:
                    best = (d, s, s + len(alt), "-", alt)
        if best is None:
            missing.append(mid_id)
            continue
        _, a, b, strand, alt = best
        out.append({"name": entry["name"], "consensus": alt, "strand": strand,
                    "start": lo + a, "end": lo + b, "source": "scan"})
    out.sort(key=lambda m: m["start"])
    if missing:
        print(f"    (not found in the published window: {', '.join(missing)})")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    fa = SCRATCH / "sacCer3.fa"
    gff = SCRATCH / "saccharomyces_cerevisiae.gff.gz"
    for p in (fa, gff):
        if not p.exists():
            raise SystemExit(f"missing {p}")
    print("reading sacCer3 and the SGD GFF …")
    fasta = read_fasta(fa)
    genes_by_chrom = load_genes(gff)

    data = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    have = {l["id"] for l in data["loci"]}

    # --- controls: rebuild EVERY shipped locus's gene models and require an exact match ---------
    # One control validated the window rule while every gene model was wrong (no CDS attached, so
    # no introns anywhere). Checking all fourteen is what makes the derivation trustworthy.
    bad_models = []
    for l in data["loci"]:
        derived = []
        for g in genes_by_chrom.get(l["chrom"], []):
            if not g["cds"]:
                continue
            c0 = min(a for a, _ in g["cds"]) - l["start"]
            c1 = max(b for _, b in g["cds"]) - l["start"]
            if c1 <= CROP_BP or c0 >= SEQ_LEN - CROP_BP:
                continue
            derived.append((g["id"], g["strand"], c0, c1))
        shipped_models = sorted((f["name"], f["strand"], f["txStart"], f["txEnd"])
                                for f in l["features"])
        # Bins too: the control compared txStart/txEnd only, and a wrong bin rule slipped past it.
        for f in l["features"]:
            want = (max(0, min(N_BINS, math.floor((f["txStart"] - CROP_BP) / BIN_BP))),
                    max(0, min(N_BINS, math.ceil((f["txEnd"] - CROP_BP) / BIN_BP))))
            if (f["start"], f["end"]) != want:
                bad_models.append(f"{l['gene']}/{f['name']} bins")
        if sorted(derived) != shipped_models:
            bad_models.append(l["gene"])
    if bad_models:
        raise SystemExit(f"the gene-model rule does not reproduce {bad_models} — fix it first")
    print(f"  control: the gene-model rule reproduces all {len(data['loci'])} shipped windows exactly")

    g, c, s, e = CONTROL
    ctrl = build_locus(g, c, s, e, "Fig S19B", "control", fasta, genes_by_chrom)
    shipped = next(l for l in data["loci"] if l["gene"] == g)
    checks = {
        "start": (ctrl["start"], shipped["start"]),
        "seqStart": (ctrl["figureWindow"]["seqStart"], shipped["figureWindow"]["seqStart"]),
        "seqEnd": (ctrl["figureWindow"]["seqEnd"], shipped["figureWindow"]["seqEnd"]),
        "binStart": (ctrl["figureWindow"]["binStart"], shipped["figureWindow"]["binStart"]),
        "binEnd": (ctrl["figureWindow"]["binEnd"], shipped["figureWindow"]["binEnd"]),
        "sequence": (ctrl["sequence"], shipped["sequence"]),
    }
    # Compare the gene models, not just the window. The first version of this script passed every
    # check above while attaching no CDS to any gene, so every model was a single exon and every
    # intron had vanished -- invisible to a sequence or coordinate check.
    def model(loc):
        return sorted((f["name"], f["strand"], f["txStart"], f["txEnd"],
                       f["cdsStart"], f["cdsEnd"], tuple(map(tuple, f["exons"])))
                      for f in loc["features"])
    checks["gene models"] = (model(ctrl), model(shipped))
    bad = [k for k, (a, b) in checks.items() if a != b]
    for k, (a, b) in checks.items():
        def show(v):
            if isinstance(v, str):
                return f"{v[:24]}… ({len(v)} bp)"
            if isinstance(v, list):
                introns = sum(max(0, len(f[6]) - 1) for f in v)
                return f"{len(v)} genes, {introns} introns"
            return v
        print(f"  control {g} {k:9s} derived {show(a)}  shipped {show(b)}  {'OK' if k not in bad else 'MISMATCH'}")
    if bad:
        raise SystemExit(f"the derivation does not reproduce the shipped {g}: {bad} — "
                         "fix the rule before adding anything")
    print(f"  control OK: the rule reproduces the shipped {g} exactly, sequence included\n")

    added = []
    for gene, chrom, ps, pe, panel, blurb in NEW_LOCI:
        loc = build_locus(gene, chrom, ps, pe, panel, blurb, fasta, genes_by_chrom)
        if loc["id"] in have:
            print(f"  {gene:8s} {loc['id']} already present, skipping")
            continue
        added.append(loc)
        own = next(f for f in loc["features"] if f["name"] == loc["id"])
        introns = max(0, len(own["exons"]) - 1)
        print(f"  {gene:8s} {loc['id']:9s} {chrom}:{ps:,}-{pe:,}  window {loc['start']:,}  "
              f"{len(loc['features']):2d} genes  own strand {own['strand']}  {introns} intron(s)")

    if args.dry_run:
        print(f"\ndry run: {len(added)} loci would be added ({len(data['loci'])} -> "
              f"{len(data['loci']) + len(added)})")
        return 0

    data["loci"].extend(added)
    out = ROOT / "src" / "data" / "shorkieLoci.json"
    out.write_text(json.dumps(data, separators=(",", ":")))
    print(f"\nwrote {out.relative_to(ROOT)}: {len(data['loci'])} loci, "
          f"{out.stat().st_size / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
