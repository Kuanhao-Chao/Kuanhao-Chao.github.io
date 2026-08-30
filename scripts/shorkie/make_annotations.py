"""
Build the S. cerevisiae annotation layer for /variant-playground/.

The page draws attribution across a 16,384 bp window and, until now, could not say whether any of
it lands on something real. This produces the annotation that answers that: every SGD feature in
each shipped window, plus transcription-factor binding sites at three clearly separated tiers of
evidence.

  src/data/shorkieAnnotations.json     one record per feature, in WINDOW coordinates

Two sources, two coordinate conventions, and getting them confused would silently mislabel
everything:

  * SGD's GFF3 is **1-based inclusive**.       offset = (gff_start - 1) - window.start
  * UCSC's API is **0-based half-open**.       offset =  chromStart      - window.start

The script refuses to write unless every window is byte-identical to sacCer3 at its recorded
coordinates, and unless SGD's gene coordinates reproduce the gene models already shipped in
shorkieLoci.json. Those two checks are what make an off-by-one loud instead of invisible: a
mislabelled binding site looks exactly like a correct one.

Three tiers of TF evidence, never merged, because they are three different claims:

  harbison-macisaac  conserved regulatory code (UCSC `transRegCode`). ~467 calls in a 16 kb
                     window, of which ~53 carry ChIP evidence. `chipEvidence` is kept per record
                     so the page can default to the supported ones.
  oreganno           literature-curated regulatory regions (UCSC `oreganno`). ~52 a window.
  jaspar             PWM scan (UCSC `jaspar2026`). The UNFILTERED scan is 23,071 hits in one
                     16 kb window -- 1.4 per base -- which is why it is thresholded at score >= 500
                     (~67 a window) and why the page keeps it off by default.

MacIsaac 2006's own host (fraenkel-nsf.csbi.mit.edu) is a 404 and ScerTF does not respond; UCSC is
where that work is still reachable.

Usage:  python3 scripts/shorkie/make_annotations.py [--jaspar-min 500] [--only ID]
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[2]
UCSC = "https://api.genome.ucsc.edu"
SGD_GFF = ("http://sgd-archive.yeastgenome.org/curation/chromosomal_feature/"
           "saccharomyces_cerevisiae.gff.gz")

# SGD `type` -> the class the page groups by. Anything not listed is dropped: the GFF also carries
# chromosomes, `region` records and mRNA duplicates of CDS, none of which are features a reader is
# looking for on a 16 kb window.
SGD_CLASSES = {
    "gene": "gene",
    "CDS": "cds",
    "intron": "intron",
    "five_prime_UTR_intron": "utr_intron",
    "uORF": "uorf",
    "tRNA_gene": "trna",
    "snoRNA_gene": "snorna",
    "ncRNA_gene": "ncrna",
    "snRNA_gene": "snrna",
    "rRNA_gene": "rrna",
    "ARS": "ars",
    "ARS_consensus_sequence": "ars_consensus",
    "long_terminal_repeat": "ltr",
    "LTR_retrotransposon": "transposon",
    "transposable_element_gene": "transposon",
    "centromere": "centromere",
    "centromere_DNA_Element_I": "centromere",
    "centromere_DNA_Element_II": "centromere",
    "centromere_DNA_Element_III": "centromere",
    "telomere": "telomere",
    "telomeric_repeat": "telomere",
    "X_element": "telomere",
    "Y_prime_element": "telomere",
    "pseudogene": "pseudogene",
    "blocked_reading_frame": "pseudogene",
}


def get(url: str, tries: int = 4) -> bytes:
    """One fetch, with backoff. UCSC throttles and SGD's archive is occasionally slow."""
    last: Exception | None = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=180) as r:
                return r.read()
        except Exception as exc:                                  # noqa: BLE001
            last = exc
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"failed after {tries} tries: {url}\n  {last}")


def ucsc_track(track: str, chrom: str, start: int, end: int) -> list[dict]:
    url = (f"{UCSC}/getData/track?genome=sacCer3;track={track}"
           f";chrom={chrom};start={start};end={end}")
    payload = json.loads(get(url))
    for key, value in payload.items():
        if isinstance(value, list):
            return value
        # Some tracks nest by chromosome.
        if isinstance(value, dict) and chrom in value and isinstance(value[chrom], list):
            return value[chrom]
    return []


def ucsc_sequence(chrom: str, start: int, end: int) -> str:
    url = f"{UCSC}/getData/sequence?genome=sacCer3;chrom={chrom};start={start};end={end}"
    return json.loads(get(url))["dna"].upper()


def gff_attrs(field: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in field.split(";"):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        out[k] = urllib.parse.unquote(v)
    return out


def systematic_id(a: dict[str, str], gff_type: str) -> str:
    """The ORF name a feature belongs to -- YGR189C, not YGR189C_CDS or YGR189C_id001.

    SGD names a CDS `YGR189C_CDS` and parents it to `YGR189C_id001,YGR189C_id007`; an intron is
    parented the same way. Without this every child feature carries a name that matches nothing,
    which is how the gene-model cross-check below silently checked zero features on its first run.
    """
    parent = a.get("Parent", "").split(",")[0]
    for cand in (parent, a.get("ID", ""), a.get("Name", "")):
        if not cand:
            continue
        cand = re.sub(r"_(id\d+|mRNA|CDS|intron.*)$", "", cand)
        if cand:
            return cand
    return gff_type


def load_sgd() -> list[tuple]:
    """Every SGD feature we care about, as (chrom, start0, end0, strand, class, name, id, note).

    The GFF is cached in the gitignored scratch dir: it is ~20 MB and does not change between
    runs, and re-fetching it made every iteration on the parser cost a download.
    """
    cache = ROOT / "scripts" / "shorkie" / "_scratch" / "saccharomyces_cerevisiae.gff.gz"
    if cache.exists():
        raw = gzip.decompress(cache.read_bytes())
    else:
        blob = get(SGD_GFF)
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(blob)
        raw = gzip.decompress(blob)
    rows: list[tuple] = []
    for line in raw.decode("utf-8", "replace").splitlines():
        if not line or line[0] == "#":
            continue
        f = line.split("\t")
        if len(f) < 9:
            continue
        cls = SGD_CLASSES.get(f[2])
        if cls is None:
            continue
        a = gff_attrs(f[8])
        # GFF3 is 1-based inclusive; everything downstream is 0-based half-open.
        start0 = int(f[3]) - 1
        end0 = int(f[4])
        sid = systematic_id(a, f[2])
        # Display name prefers the common gene name (CRH1); `id` stays systematic so features can
        # be joined to shorkieLoci.json and to each other.
        name = a.get("gene") or (a.get("Name") if not a.get("Name", "").endswith("_CDS") else sid) or sid
        rows.append((f[0], start0, end0, f[6], cls, name, sid,
                     a.get("orf_classification") or a.get("so_term_name") or ""))
    return rows


def clip(records: Iterable[dict], win_start: int, win_len: int) -> list[dict]:
    """Keep anything overlapping the window, clipped to it, with `truncated` recorded.

    A feature running off the edge is kept rather than dropped -- a promoter half in view is still
    the thing the reader is looking at -- but it is marked, so the page never draws a clipped edge
    as if it were a real boundary.
    """
    out = []
    for r in records:
        a = r["start"] - win_start
        b = r["end"] - win_start
        if b <= 0 or a >= win_len:
            continue
        rec = dict(r)
        rec["start"] = max(a, 0)
        rec["end"] = min(b, win_len)
        rec["truncated"] = bool(a < 0 or b > win_len)
        out.append(rec)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jaspar-min", type=int, default=500,
                    help="UCSC score floor for the PWM scan tier (0-1000)")
    ap.add_argument("--only", default=None)
    ap.add_argument("--out", default=str(ROOT / "public" / "vp-data"),
                    help="directory for the per-locus <id>-ann.json files")
    args = ap.parse_args()

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    targets = [l for l in loci["loci"] if not args.only or l["id"] == args.only]

    # ---- gate 1: the windows must BE sacCer3 at their stated coordinates ---------------------
    # Every offset in this file is a subtraction from `start`. If the sequence the model was run on
    # is not the sequence at those coordinates, every annotation is wrong by an unknown amount and
    # looks perfectly plausible.
    print("verifying window sequences against sacCer3")
    for l in targets:
        want = l["sequence"].upper()
        got = ucsc_sequence(l["chrom"], l["start"], l["start"] + len(want))
        if got != want:
            diff = sum(x != y for x, y in zip(got, want))
            print(f"  FAIL {l['id']} {l['chrom']}:{l['start']} differs in {diff} bases",
                  file=sys.stderr)
            return 1
        print(f"  ok   {l['id']:9s} {l['gene']:8s} {l['chrom']}:{l['start']} {len(want)} bp")

    print("fetching SGD annotation")
    sgd = load_sgd()
    print(f"  {len(sgd)} features in the classes this page draws")

    out: dict[str, dict] = {}
    totals: dict[str, int] = {}
    for l in targets:
        win_len = len(l["sequence"])
        lo, hi = l["start"], l["start"] + win_len

        sgd_recs = [
            {"cls": cls, "name": name, "id": sid, "start": s, "end": e, "strand": st,
             "source": "sgd", "note": note}
            for (c, s, e, st, cls, name, sid, note) in sgd
            if c == l["chrom"] and e > lo and s < hi
        ]

        tf = [
            {"cls": "tfbs", "name": r["name"], "start": r["chromStart"], "end": r["chromEnd"],
             "strand": ".", "source": "harbison-macisaac",
             "evidence": r.get("chipEvidence", "none"), "score": r.get("score", 0)}
            for r in ucsc_track("transRegCode", l["chrom"], lo, hi)
        ]

        oreg = [
            {"cls": "regulatory", "name": r.get("name") or r.get("id", "?"),
             "start": r["chromStart"], "end": r["chromEnd"],
             "strand": r.get("strand", "."), "source": "oreganno"}
            for r in ucsc_track("oreganno", l["chrom"], lo, hi)
        ]

        raw_jaspar = ucsc_track("jaspar2026", l["chrom"], lo, hi)
        jaspar = [
            {"cls": "tfbs", "name": r.get("TFName") or r["name"], "start": r["chromStart"],
             "end": r["chromEnd"], "strand": r.get("strand", "."), "source": "jaspar",
             "score": r.get("score", 0), "matrix": r.get("name", "")}
            for r in raw_jaspar if r.get("score", 0) >= args.jaspar_min
        ]

        feats = clip(sgd_recs + tf + oreg + jaspar, l["start"], win_len)
        feats.sort(key=lambda r: (r["start"], r["end"]))
        out[l["id"]] = {
            "chrom": l["chrom"], "start": l["start"], "length": win_len,
            "features": feats,
            # The unfiltered count is kept because it is the argument for the threshold: a reader
            # deciding whether to trust the PWM tier needs to know what was discarded.
            "jasparScanned": len(raw_jaspar),
        }
        for f in feats:
            totals[f["source"]] = totals.get(f["source"], 0) + 1
        chip = sum(1 for f in tf if f.get("evidence") != "none")
        print(f"  {l['id']:9s} {l['gene']:8s} sgd={len(sgd_recs):3d} "
              f"tfbs={len(tf):3d} (chip {chip:2d})  oreganno={len(oreg):3d}  "
              f"jaspar={len(jaspar):3d}/{len(raw_jaspar)}")

    # ---- gate 2: SGD must reproduce the gene models already shipped --------------------------
    # shorkieLoci.json's `features` came from UCSC's sgdGene table via a different path. If the
    # 1-based GFF conversion here were off by one, the two would disagree by exactly one base --
    # which is invisible on a 16 kb drawing and fatal to a motif coordinate.
    checked = matched = 0
    for l in targets:
        by_name: dict[str, list[dict]] = {}
        for f in out[l["id"]]["features"]:
            if f["cls"] == "cds" and not f["truncated"]:
                by_name.setdefault(f["id"], []).append(f)
        for feat in l["features"]:
            cds = by_name.get(feat["name"])
            if not cds:
                continue
            checked += 1
            lo_c = min(c["start"] for c in cds)
            hi_c = max(c["end"] for c in cds)
            if lo_c == feat["cdsStart"] and hi_c == feat["cdsEnd"]:
                matched += 1
            else:
                print(f"  coordinate mismatch {l['id']}/{feat['name']}: "
                      f"sgd {lo_c}-{hi_c} vs shipped {feat['cdsStart']}-{feat['cdsEnd']} "
                      f"(delta {lo_c - feat['cdsStart']:+d}/{hi_c - feat['cdsEnd']:+d})")
    print(f"gene-model cross-check: {matched}/{checked} CDS spans reproduce shorkieLoci.json")
    if checked == 0:
        print("  refusing to write: the cross-check matched no features at all, so it proved "
              "nothing -- the name join is broken", file=sys.stderr)
        return 1
    if matched < checked:
        print("  refusing to write: the GFF conversion disagrees with the shipped gene models",
              file=sys.stderr)
        return 1

    sources = {
        "sgd": "Saccharomyces Genome Database, chromosomal feature GFF3",
        "harbison-macisaac": "Harbison 2004 / MacIsaac 2006 conserved regulatory code "
                             "(UCSC transRegCode)",
        "oreganno": "ORegAnno curated regulatory annotation (UCSC oreganno)",
        "jaspar": f"JASPAR 2026 PWM scan (UCSC jaspar2026), UCSC score >= {args.jaspar_min}",
    }
    out_dir = Path(args.out)
    written = 0
    for locus_id, rec in out.items():
        path = out_dir / f"{locus_id}-ann.json"
        path.write_text(json.dumps({
            "genome": "sacCer3", "jasparMin": args.jaspar_min, "sources": sources, **rec,
        }, separators=(",", ":")))
        written += path.stat().st_size
    print(f"wrote {len(out)} files to {out_dir.relative_to(ROOT)}  "
          f"{written / 1024:.0f} KB total  totals={totals}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
