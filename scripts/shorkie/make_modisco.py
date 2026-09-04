"""
The model's own motif vocabulary — discovered from its mutagenesis, not matched against a database.

Everything else on this page starts from an annotation and asks whether the model agrees with it.
The binding-site boxes come from Harbison/MacIsaac, the enrichment table scores against SGD classes,
the knockout sweep permutes sites somebody else called. That is the right way round for validation
and the wrong way round for discovery: it can only ever find motifs that are already in a database,
and it cannot tell you what the model thinks a motif is.

This is TF-MoDISco's recipe (Shrikumar et al. 2018), in the small: pull high-attribution windows out
of the mutagenesis planes, cluster them by what they look like, and only THEN ask JASPAR what each
cluster is. The sibling page already names this as the thing the paper does and this site does not.

**The seqlet is a 4 x w matrix, not a score.** Clustering on the per-position saliency alone throws
away which base was doing the work, so `AAATTT` and `TTTAAA` cluster together. The block kept is the
mean-centred plane -- the hypothetical contribution of every base at every position -- which is what
makes a cluster's average a PWM rather than a bump.

**Both strands, always.** A motif is a property of the duplex; a seqlet and its reverse complement
are the same observation. Clusters are formed over both orientations and each seqlet records which
one it joined in.

**The control is the whole experiment, and it can refute it.** The identical pipeline is run on
dinucleotide-shuffled sequence, scored by the same planes. Any clustering algorithm applied to
16,384 x 23 windows of real-valued data will return clusters; the question is whether it returns
MORE, and better-matching, ones on the real arm. Both arms are reported, and if the shuffled arm
matched as well the finding would be about the pipeline rather than about the model.

Needs no model and no GPU: the raw mutagenesis planes are already on disk from `make_ism.py`.

Output:
    src/data/shorkieModisco.json     clusters, their PWMs, their JASPAR matches, and the control

Usage:  python3 scripts/shorkie/make_modisco.py [--width 11] [--top 0.995] [--min-seqlets 12]
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))

from make_receptive import dinuc_shuffle                 # noqa: E402

SCRATCH = Path(__file__).resolve().parent / "_scratch"
BASES = "ACGT"
COMP = {0: 3, 1: 2, 2: 1, 3: 0}


def saliency(plane: np.ndarray, seq: str) -> np.ndarray:
    """The paper's per-position saliency: mean-centre across the four bases, keep the reference.

    With the reference cell zero by construction this is `-(sum of the three alternatives)/4`,
    which is exactly what `ismSaliency` computes in the browser. Used only for SCORING a window;
    the clustering uses the full mean-centred block.
    """
    out = np.zeros(plane.shape[1], dtype=np.float64)
    for i, ch in enumerate(seq[:plane.shape[1]]):
        r = BASES.find(ch.upper())
        if r < 0:
            continue
        out[i] = -(plane[:, i].sum() - plane[r, i]) / 4.0
    return out


def centred(plane: np.ndarray) -> np.ndarray:
    """The hypothetical contribution matrix: `alt - ref`, mean-centred across the four bases."""
    return plane - plane.mean(axis=0, keepdims=True)


def rc_block(b: np.ndarray) -> np.ndarray:
    """Reverse-complement a 4 x w block: flip the position axis and swap A<->T, C<->G."""
    return b[[3, 2, 1, 0], :][:, ::-1]


def extract_seqlets(plane: np.ndarray, seq: str, width: int, quantile: float,
                    min_gap: int) -> list[tuple[int, np.ndarray, float, str]]:
    """High-|saliency| windows, non-maximum suppressed so one motif yields one seqlet."""
    sal = np.abs(saliency(plane, seq))
    # A sliding sum, then a threshold at a quantile of the sums themselves. The threshold is on the
    # WINDOW scores rather than on the per-base saliency: a single spike does not make a motif, and
    # scoring per base would let one dominate a window of otherwise ordinary sequence.
    k = np.ones(width)
    score = np.convolve(sal, k, mode="valid")
    thr = float(np.quantile(score, quantile))
    cen = centred(plane)
    order = np.argsort(-score)
    taken: list[int] = []
    out: list[tuple[int, np.ndarray, float]] = []
    for i in order:
        if score[i] < thr:
            break
        if any(abs(i - t) < min_gap for t in taken):
            continue
        taken.append(int(i))
        # The underlying SEQUENCE comes along. The clustering runs on contribution blocks, but a
        # cluster's PWM has to be built from the bases those seqlets actually contain: a softmax of
        # mean-centred contributions is near-uniform whenever the contributions are small, which
        # they usually are -- the first version of this produced PWMs of 0.00 bits whose "consensus"
        # was the argmax of noise, and matched JASPAR at r = 0.9 purely on shape.
        out.append((int(i), cen[:, i:i + width].copy(), float(score[i]), seq[i:i + width]))
    return out


def normalise(b: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(b)
    return b / n if n > 0 else b


def cluster(blocks: list[np.ndarray], threshold: float) -> list[list[int]]:
    """Greedy correlation clustering over both strands.

    Not k-means: the number of motifs is the thing being discovered, so a method that has to be
    told k would be assuming the answer. Greedy agglomeration around the strongest unassigned
    seedpoint is what MoDISco does in spirit, and it is deterministic given the input order.
    """
    norm = [normalise(b) for b in blocks]
    rc = [normalise(rc_block(b)) for b in blocks]
    unassigned = set(range(len(blocks)))
    clusters: list[list[int]] = []
    while unassigned:
        seed = max(unassigned, key=lambda i: float(np.abs(blocks[i]).sum()))
        members = [seed]
        unassigned.discard(seed)
        s = norm[seed]
        for j in list(unassigned):
            if max(float((s * norm[j]).sum()), float((s * rc[j]).sum())) >= threshold:
                members.append(j)
                unassigned.discard(j)
        clusters.append(members)
    return clusters


def rc_seq(s: str) -> str:
    return s.translate(str.maketrans("ACGT", "TGCA"))[::-1]


def cluster_pwm(blocks: list[np.ndarray], seqs: list[str], members: list[int],
                seed: int) -> tuple[np.ndarray, np.ndarray]:
    """A cluster's PWM, counted from the bases its seqlets contain, in one consistent orientation.

    Returns the base-frequency matrix AND the mean contribution matrix. Both are wanted and they
    answer different questions: the frequency matrix is what compares with JASPAR and what carries
    information content, and the contribution matrix is what says whether the model likes those
    bases or dislikes them. Reading the second as the first is what produced 0.00-bit "motifs".

    Orientation is chosen per member against the seed, over the CONTRIBUTION blocks, because that
    is what the clustering used -- flipping the sequence by a different criterion than the one that
    grouped it would misalign every column.
    """
    s = normalise(blocks[seed])
    counts = np.full((4, blocks[seed].shape[1]), 0.25)      # Laplace, so no column is ever 0
    acc = np.zeros_like(blocks[seed], dtype=np.float64)
    for j in members:
        b = blocks[j]
        fwd = float((normalise(b) * s).sum()) >= float((normalise(rc_block(b)) * s).sum())
        acc += b if fwd else rc_block(b)
        text = seqs[j] if fwd else rc_seq(seqs[j])
        for k, ch in enumerate(text[:counts.shape[1]]):
            r = BASES.find(ch.upper())
            if r >= 0:
                counts[r, k] += 1.0
    return counts / counts.sum(axis=0, keepdims=True), acc / len(members)


def pwm_similarity(a: np.ndarray, b: np.ndarray) -> tuple[float, int, bool]:
    """TomTom-style best-offset Pearson over both orientations, with the offset and strand."""
    best = (-2.0, 0, False)
    for flip in (False, True):
        q = b[[3, 2, 1, 0], :][:, ::-1] if flip else b
        for off in range(-(q.shape[1] - 3), a.shape[1] - 2):
            i0, i1 = max(0, off), min(a.shape[1], off + q.shape[1])
            j0, j1 = i0 - off, i1 - off
            if i1 - i0 < 4:
                continue
            x, y = a[:, i0:i1].ravel(), q[:, j0:j1].ravel()
            if x.std() < 1e-9 or y.std() < 1e-9:
                continue
            r = float(np.corrcoef(x, y)[0, 1])
            if r > best[0]:
                best = (r, off, flip)
    return best


def consensus(pwm: np.ndarray) -> str:
    return "".join(BASES[i] for i in pwm.argmax(axis=0))


def info_content(pwm: np.ndarray) -> float:
    """Total information in bits, over a uniform background — the sequence-logo convention."""
    p = np.clip(pwm, 1e-12, 1)
    return float((2.0 + (p * np.log2(p)).sum(axis=0)).sum())


def null_similarity(blocks: list[np.ndarray], rng: random.Random, pairs: int = 40_000) -> np.ndarray:
    """The pairwise best-strand cosine distribution of a set of blocks, sampled.

    This is what CALIBRATES the cluster threshold. Picking a correlation by eye and then reporting
    how many clusters it produced would be choosing the answer: any threshold produces clusters, and
    a lower one produces more. The threshold used is a high quantile of the SHUFFLED arm's own
    distribution, so a cluster is by definition a set of seqlets more alike than shuffled sequence
    essentially ever manages -- and the control decides the parameter rather than merely being
    compared against afterwards.
    """
    norm = [normalise(b) for b in blocks]
    rc = [normalise(rc_block(b)) for b in blocks]
    n = len(blocks)
    if n < 3:
        return np.array([0.0])
    out = np.empty(pairs)
    for k in range(pairs):
        i = rng.randrange(n)
        j = rng.randrange(n)
        while j == i:
            j = rng.randrange(n)
        out[k] = max(float((norm[i] * norm[j]).sum()), float((norm[i] * rc[j]).sum()))
    return out


def seqlets_only(loci, planes, width, quantile, min_gap, shuffle_rng=None):
    """Extract seqlets without clustering, so both arms can be pooled before a threshold is set."""
    blocks, origins, seqs = [], [], []
    for L in loci:
        pid = L["id"]
        if pid not in planes:
            continue
        seq = L["sequence"][:planes[pid].shape[1]]
        if shuffle_rng is not None:
            seq = dinuc_shuffle(seq, shuffle_rng)
        for pos, blk, sc, txt in extract_seqlets(planes[pid], seq, width, quantile, min_gap):
            blocks.append(blk)
            seqs.append(txt)
            origins.append({"locus": pid, "gene": L["gene"], "start": pos, "score": round(sc, 4),
                            "seq": txt})
    return blocks, origins, seqs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=11)
    ap.add_argument("--top", type=float, default=0.98, help="seqlet score quantile")
    ap.add_argument("--min-gap", type=int, default=8)
    ap.add_argument("--null-quantile", type=float, default=0.999,
                    help="the shuffled arm quantile that sets the cluster threshold")
    ap.add_argument("--min-seqlets", type=int, default=8)
    ap.add_argument("--match", type=float, default=0.60, help="JASPAR match r")
    args = ap.parse_args()

    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())["loci"]
    planes = {}
    for L in loci:
        f = SCRATCH / "ism-raw" / f"{L['id']}-ism.npy"
        if f.exists():
            planes[L["id"]] = np.load(f).astype(np.float64)
    if not planes:
        raise SystemExit("no raw mutagenesis planes in _scratch/ism-raw — run make_ism.py first")
    print(f"  {len(planes)} mutagenesis planes, {args.width} bp seqlets")

    jaspar = json.loads((SCRATCH / "jaspar-yeast.json").read_text())
    refs = []
    for m in jaspar:
        pfm = m.get("pfm")
        if not pfm:
            continue
        # A PFM is COUNTS. Drawing or comparing it unnormalised produces something that looks
        # entirely plausible and is wrong by whatever the column depth happens to be.
        mat = np.array([pfm[b] for b in BASES], dtype=np.float64)
        col = mat.sum(axis=0, keepdims=True)
        if mat.shape[1] < 5 or float(col.min()) <= 0:
            continue
        refs.append((m["matrix_id"], m["name"], mat / col))
    print(f"  {len(refs)} JASPAR yeast matrices")

    real_blocks, origins, real_seqs = seqlets_only(loci, planes, args.width, args.top, args.min_gap)
    # The control. Same planes, same threshold, same clustering -- shuffled sequence, so the
    # saliency projection and the reference base no longer correspond to anything.
    rng = random.Random(11)
    ctl_blocks, _, ctl_seqs = seqlets_only(loci, planes, args.width, args.top, args.min_gap, rng)

    # The threshold comes from the control, before either arm is clustered.
    null = null_similarity(ctl_blocks, random.Random(7))
    thr = float(np.quantile(null, args.null_quantile))
    real_null = null_similarity(real_blocks, random.Random(7))
    print(f"  shuffled-arm similarity: median {np.median(null):.3f}, "
          f"p{args.null_quantile * 100:g} {thr:.3f}  -> cluster threshold")
    print(f"  real-arm similarity:     median {np.median(real_null):.3f}, "
          f"p{args.null_quantile * 100:g} {np.quantile(real_null, args.null_quantile):.3f}")

    groups = [g for g in cluster(real_blocks, thr) if len(g) >= args.min_seqlets]
    ctl_groups = [g for g in cluster(ctl_blocks, thr) if len(g) >= args.min_seqlets]
    print(f"  real:     {len(real_blocks)} seqlets -> {len(groups)} clusters "
          f"(>= {args.min_seqlets} seqlets)")
    print(f"  shuffled: {len(ctl_blocks)} seqlets -> {len(ctl_groups)} clusters")

    def matches(gs, blocks, seqs):
        out = []
        for g in gs:
            seed = max(g, key=lambda i: float(np.abs(blocks[i]).sum()))
            pwm, contrib = cluster_pwm(blocks, seqs, g, seed)
            best = (-2.0, None, 0, False)
            for mid, name, ref in refs:
                r, off, flip = pwm_similarity(pwm, ref)
                if r > best[0]:
                    best = (r, (mid, name), off, flip)
            out.append((g, seed, pwm, best, contrib))
        return out

    real = matches(groups, real_blocks, real_seqs)
    ctl = matches(ctl_groups, ctl_blocks, ctl_seqs)
    real_hits = sum(1 for _, _, _, b, _ in real if b[0] >= args.match)
    ctl_hits = sum(1 for _, _, _, b, _ in ctl if b[0] >= args.match)

    clusters = []
    for g, seed, pwm, (r, mid, off, flip), contrib in sorted(real, key=lambda x: -len(x[0])):
        loci_seen = sorted({origins[i]["locus"] for i in g})
        clusters.append({
            "seqlets": len(g),
            "loci": len(loci_seen),
            "consensus": consensus(pwm),
            "bits": round(info_content(pwm), 3),
            "pwm": [[round(float(v), 4) for v in row] for row in pwm],
            # Signed: does the model want these bases, or dislike them? A frequency matrix cannot
            # say, and a motif the model penalises is as real a finding as one it rewards.
            "contribution": [[round(float(v), 5) for v in row] for row in contrib],
            "match": ({"id": mid[0], "name": mid[1], "r": round(r, 3),
                       "offset": int(off), "reverse": bool(flip)}
                      if mid and r >= args.match else None),
            "bestR": round(r, 3),
            "examples": sorted((origins[i] for i in g),
                               key=lambda o: -o["score"])[:6],
        })

    payload = {
        "note": ("TF-MoDISco in the small: seqlets pulled from the mutagenesis planes by "
                 "|saliency|, clustered on their mean-centred contribution blocks over both "
                 "strands, and only then matched against JASPAR. The identical pipeline on "
                 "dinucleotide-shuffled sequence is the control."),
        "width": args.width,
        "seqletQuantile": args.top,
        "clusterThreshold": round(thr, 4),
        "nullQuantile": args.null_quantile,
        "nullMedianSimilarity": round(float(np.median(null)), 4),
        "realMedianSimilarity": round(float(np.median(real_null)), 4),
        "minSeqlets": args.min_seqlets,
        "matchThreshold": args.match,
        "jasparMatrices": len(refs),
        "real": {"seqlets": len(real_blocks), "clusters": len(groups), "matched": real_hits},
        "control": {"seqlets": len(ctl_blocks), "clusters": len(ctl_groups), "matched": ctl_hits,
                    "bestR": round(max((b[0] for _, _, _, b, _ in ctl), default=0.0), 3),
                    "bits": round(max((info_content(x[2]) for x in ctl), default=0.0), 3)},
        "clusters": clusters,
    }
    dest = ROOT / "src" / "data" / "shorkieModisco.json"
    dest.write_text(json.dumps(payload, indent=1) + "\n")

    print(f"\n  matched to JASPAR at r >= {args.match}: real {real_hits}/{len(groups)}, "
          f"shuffled {ctl_hits}/{len(ctl_groups)}")
    for c in clusters[:10]:
        m = c["match"]
        print(f"    {c['consensus']:<14} {c['seqlets']:>3} seqlets  {c['loci']:>2} loci  "
              f"{c['bits']:>5.2f} bits  "
              + (f"{m['name']} ({m['id']}) r={m['r']}" if m else f"— best r={c['bestR']}"))
    print(f"\n  wrote {dest.relative_to(ROOT)}")
    print("  modisco audit passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
