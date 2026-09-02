"""
The motif each transcription factor recognises, so a binding-site box can show it.

The browser draws 206,558 binding-site calls and says only that a factor binds there. What the
factor *recognises* is the other half of the claim, and it is what lets a reader check the call: the
page already establishes that only 22.8% of curated calls contain their factor's consensus, which is
a statement nobody can evaluate without seeing the consensus.

**Where the matrices come from.** JASPAR CORE 2026, `tax_id=4932` — 177 matrices for
*S. cerevisiae*, each a position frequency matrix built from ChIP-exo, SELEX or PBM data with a
PubMed id attached. The API is `jaspar.elixir.no/api/v1/matrix/`.

**Matching is through SGD aliases, not just the display name.** The browser's factor names come from
the Harbison/MacIsaac regulatory code and JASPAR's come from its own curation, and they disagree:
`RCS1` in one is `AFT1` in the other. A name-only join silently loses those, and a lost matrix looks
exactly like a factor that has none.

**A factor with no matrix is usually a finding, not a gap.** 93 of the 102 match — three of them
only through an SGD alias (RCS1 is AFT1). Of the nine that do not, seven are explained by SGD's own
GO terms: SWI6, HAP4, MET4, NDD1 and STB1 carry GO:0003713 (transcription coactivator) and DIG1 and
UME1 carry GO:0003714 (corepressor). They bind proteins, not DNA, and appear in a binding-site table
because ChIP pulls down whatever is in the complex. The remaining two, GAL80 and RLR1, carry neither
term and are reported as simply having no matrix — see the note on NO_DNA_GO for why the absence of
GO:0003700 is not used to claim more than that.

Output:
    public/genome-data/motifs.json   per factor: the PFM as probabilities, information content,
                                     JASPAR id/class/family/PubMed, or the reason there is none

Usage:  python3 scripts/shorkie/make_motif_logos.py [--force]
"""

from __future__ import annotations

import argparse
import glob
import gzip
import json
import math
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

SCRATCH = Path(__file__).resolve().parent / "_scratch"
OUT = ROOT / "public" / "genome-data"
JASPAR = "https://jaspar.elixir.no/api/v1/matrix"
BASES = ["A", "C", "G", "T"]

# GO terms that EXPLAIN an absent matrix. A factor carrying one of these is not missing data --
# it is a protein that binds the transcription complex rather than DNA, and appears in a
# binding-site table because ChIP pulls down whatever is in the complex.
#
# Only POSITIVE evidence is used. The tempting inverse -- "no GO:0003700, therefore not a
# sequence-specific DNA-binding factor" -- is wrong, and ABF1 is the counterexample: SGD's GFF
# gives it no GO:0003700 and JASPAR gives it MA0265.3, a ChIP-exo matrix. The `Ontology_term`
# field in this GFF is a partial slice of the full SGD annotation, so its silence means nothing.
NO_DNA_GO = {
    "GO:0003713": "transcription coactivator — binds the complex, not DNA",
    "GO:0003714": "transcription corepressor — binds the complex, not DNA",
}


def fetch(url: str, tries: int = 3) -> bytes:
    last: Exception | None = None
    for _ in range(tries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception as ex:                                   # noqa: BLE001  retried below
            last = ex
    raise SystemExit(f"could not fetch {url}: {last}")


def sgd_synonyms(gff: Path) -> tuple[dict[str, set[str]], dict[str, list[str]]]:
    """Every name a gene answers to, and its GO terms.

    Returns `name -> {all names for that gene}` so a lookup by any synonym reaches the rest, and
    `name -> [GO ids]` so an absent matrix can be explained rather than merely reported.
    """
    syn: dict[str, set[str]] = {}
    go: dict[str, list[str]] = {}
    with gzip.open(gff, "rt") as fh:
        for line in fh:
            if line.startswith("#"):
                if line.startswith("##FASTA"):
                    break
                continue
            f = line.rstrip("\n").split("\t")
            if len(f) < 9 or f[2] not in ("gene", "ncRNA_gene", "pseudogene"):
                continue
            kv = dict(p.split("=", 1) for p in f[8].split(";") if "=" in p)
            names = {kv.get("Name", ""), kv.get("gene", "")}
            for a in (kv.get("Alias") or "").split(","):
                a = a.strip()
                # Alias carries prose descriptions too ("60S ribosomal protein uL24 ..."); keep
                # only short symbol-like entries.
                if a and len(a) <= 12 and "%20" not in a:
                    names.add(a)
            names = {n.upper() for n in names if n}
            terms = [g for g in (kv.get("Ontology_term") or "").split(",") if g.startswith("GO:")]
            for n in names:
                syn.setdefault(n, set()).update(names)
                if terms:
                    go.setdefault(n, terms)
    return syn, go


def info_content(probs: list[list[float]]) -> list[float]:
    """Bits per position: 2 − H(p), the same quantity the model's own track reports.

    Uniform background, which is what a DNA sequence logo means by convention — and NOT the yeast
    genome's 38.1% GC. Using the real background would produce relative entropy, a different (and
    for AT-rich yeast, quite differently shaped) quantity, and would silently make these logos
    incomparable with every other logo on this site.
    """
    out = []
    for col in probs:
        h = -sum(p * math.log2(p) for p in col if p > 0)
        out.append(max(0.0, 2.0 - h))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    # The factor names the browser actually draws.
    wanted: set[str] = set()
    for f in glob.glob(str(OUT / "*" / "features.json")):
        d = json.loads(Path(f).read_text())
        for cls in ("tfbs_chip", "tfbs_conserved", "tfbs_pwm"):
            for row in d["classes"].get(cls, []):
                wanted.add(d["names"][row[2]])
    print(f"  {len(wanted)} factor names in the shipped features")

    cache = SCRATCH / "jaspar-yeast.json"
    if cache.exists() and not args.force:
        matrices = json.loads(cache.read_text())
    else:
        listing = json.loads(fetch(
            f"{JASPAR}/?tax_id=4932&collection=CORE&page_size=500&version=latest").decode())
        matrices = []
        for i, m in enumerate(listing.get("results", []), 1):
            matrices.append(json.loads(fetch(f"{JASPAR}/{m['matrix_id']}/").decode()))
            if i % 25 == 0:
                print(f"    fetched {i}/{listing.get('count')}", flush=True)
        SCRATCH.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(matrices, separators=(",", ":")))
    print(f"  {len(matrices)} JASPAR CORE matrices for S. cerevisiae")

    syn, go = sgd_synonyms(SCRATCH / "saccharomyces_cerevisiae.gff.gz")
    by_name: dict[str, dict] = {}
    for m in matrices:
        by_name.setdefault(m["name"].upper(), m)

    out: dict[str, dict] = {}
    matched = 0
    explained = 0
    for tf in sorted(wanted):
        up = tf.upper()
        # Every name this gene answers to -- RCS1 reaches AFT1 this way, and a name-only join
        # would report it as a factor with no known motif.
        candidates = [up] + sorted(syn.get(up, set()) - {up})
        hit = next((by_name[c] for c in candidates if c in by_name), None)
        if hit is None:
            terms = go.get(up, [])
            reason = next((NO_DNA_GO[g] for g in terms if g in NO_DNA_GO), None)
            out[tf] = {"matrix": None,
                       "reason": reason or "no JASPAR CORE matrix for this factor",
                       "explained": bool(reason)}
            explained += bool(reason)
            continue
        pfm = hit["pfm"]
        n = len(pfm["A"])
        # Counts -> probabilities. A PFM is COUNTS, and drawing it unnormalised produces a logo
        # that looks entirely plausible and is wrong by whatever the column depth happens to be.
        probs = []
        for i in range(n):
            col = [float(pfm[b][i]) for b in BASES]
            tot = sum(col) or 1.0
            probs.append([c / tot for c in col])
        out[tf] = {
            "matrix": hit["matrix_id"],
            "jasparName": hit["name"],
            "length": n,
            "probs": [[round(v, 5) for v in col] for col in probs],
            "bits": [round(v, 4) for v in info_content(probs)],
            "class": (hit.get("class") or [None])[0],
            "family": (hit.get("family") or [None])[0],
            "dataType": hit.get("type"),
            "pubmed": (hit.get("pubmed_ids") or [None])[0],
            "matchedVia": None if up == hit["name"].upper() else hit["name"],
        }
        matched += 1

    (OUT / "motifs.json").write_text(json.dumps(
        {"source": "JASPAR CORE 2026, tax_id 4932 (Saccharomyces cerevisiae)",
         "url": "https://jaspar.elixir.no/",
         "background": "uniform — these are information-content logos, not relative entropy",
         "factors": out}, separators=(",", ":")))

    aliased = [k for k, v in out.items() if v.get("matchedVia")]
    print(f"\n  {matched}/{len(wanted)} factors have a matrix "
          f"({len(aliased)} matched only through an SGD alias: {aliased})")
    missing = {k: v["reason"] for k, v in out.items() if not v["matrix"]}
    print(f"  {len(missing)} without one, {explained} of them explained by an SGD GO term:")
    for k, v in sorted(missing.items()):
        print(f"    {k:10s} {v}")
    print(f"  wrote {(OUT / 'motifs.json').stat().st_size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
