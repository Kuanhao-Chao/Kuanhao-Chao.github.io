"""Shared spine for the reliability-foundation generators.

Everything here already existed, scattered across `make_ism.py`, `make_attribution.py` and
`make_receptive.py`. It is lifted rather than copied a fourth time because the pieces are exactly
the ones a divergence would be invisible in: an encoding that puts the species one-hot in the
wrong channel, a reverse-complement map that is silently transposed, or a T0 subset that is the
whole 3,053-track RNA block instead of the 384 `_T0_` records.

The scalar every method on this page differentiates, perturbs or ranks against is

    g(x; a, b) = log2(1 + sum_{r in [a,b)} mean_{t in T0} y_{r,t}(x))

over the focal gene's own body bins. Not the window peak -- a 14,336 bp yeast window holds a
dozen genes and the tallest is rarely the one whose promoter was edited.
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from shorkie_torch import SEQ_LEN, IN_CHANNELS, N_BINS, CROP  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SCRATCH = Path(__file__).resolve().parent / "_scratch"
BASES = "ACGT"
BASE_IDX = {b: i for i, b in enumerate(BASES)}
BIN_BP = 16
CROP_BP = CROP * BIN_BP                 # 1,024 bp cropped from each end
N_PARAMS = 14_253_567                   # the fold-f0 accounting; any fold must match exactly
FOLDS = [f"f{i}" for i in range(8)]


# --------------------------------------------------------------------------------------- encoding

def encode(sequence: str, species: int) -> np.ndarray:
    """[16384, 170]: 4 DNA + 1 special/unused zero channel + 165 species one-hot.

    Channel 4 is deliberately left zero. It is written by no code the paper ships and is not
    established as a mask channel, so calling it one would be an unsupported claim in an array.
    """
    x = np.zeros((SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    for i, base in enumerate(sequence[:SEQ_LEN].upper()):
        j = BASE_IDX.get(base)
        if j is not None:
            x[i, j] = 1.0
    x[:, 5 + species] = 1.0
    return x


def rc_encoded(x: np.ndarray) -> np.ndarray:
    """Reverse positions, swap A<->T and C<->G. Species channels reverse without complementing."""
    out = x[::-1, :].copy()
    out[:, :4] = out[:, [3, 2, 1, 0]]
    return np.ascontiguousarray(out)


def rc_grad_np(g: np.ndarray) -> np.ndarray:
    """Map a [L, 4] gradient from reverse-complement coordinates back to forward ones.

    `rc` is a permutation and its own inverse, so the same reverse-and-swap is exactly right.
    Getting it wrong is silent: the numbers keep their magnitude and land on the wrong bases.
    """
    return g[::-1, [3, 2, 1, 0]].copy()


def rc_position(i: int, length: int = SEQ_LEN) -> int:
    """Where forward position `i` lands under the reverse complement."""
    return length - 1 - i


COMPLEMENT = {"A": "T", "C": "G", "G": "C", "T": "A"}


# ------------------------------------------------------------------------------------ annotation

def gene_body_bins(features: list[dict], gene_id: str) -> tuple[int, int]:
    """The focal gene's own output bins, in the cropped 896-bin frame."""
    for f in features:
        if f["name"] == gene_id:
            lo = max(0, (f["txStart"] - CROP_BP) // BIN_BP)
            hi = min(N_BINS, (f["txEnd"] - CROP_BP) // BIN_BP + 1)
            if hi > lo:
                return int(lo), int(hi)
    return 0, N_BINS


def tss_of(features: list[dict], gene_id: str) -> int:
    """Transcription start in window coordinates: txStart on +, txEnd on -."""
    for f in features:
        if f["name"] == gene_id:
            return int(f["txStart"] if f["strand"] == "+" else f["txEnd"])
    return SEQ_LEN // 2


def strand_of(features: list[dict], gene_id: str) -> str:
    for f in features:
        if f["name"] == gene_id:
            return str(f["strand"])
    return "+"


# ------------------------------------------------------------------------------------- shuffling

def dinuc_shuffle(seq: str, rng: random.Random) -> str:
    """Altschul-Erikson: a random Euler path through the dinucleotide graph.

    Preserves every dinucleotide count exactly, which a naive shuffle does not. The last edge out
    of each vertex is fixed to point along a spanning tree toward the final vertex; that is what
    guarantees the walk can always finish, and is the whole of the algorithm's subtlety.

    Yeast promoters carry heavy dinucleotide bias -- poly(dA:dT) above all -- so a mononucleotide
    shuffle destroys the very thing a composition-matched control is supposed to preserve.
    """
    s = [c for c in seq.upper() if c in "ACGT"]
    if len(s) < 3:
        return "".join(s)
    last = s[-1]
    edges: dict[str, list[str]] = {b: [] for b in "ACGT"}
    for a, b in zip(s, s[1:]):
        edges[a].append(b)

    while True:
        tree: dict[str, str] = {}
        for v in "ACGT":
            if v == last or not edges[v]:
                continue
            tree[v] = rng.choice(edges[v])
        ok = True
        for v in tree:
            seen, cur = set(), v
            while cur != last:
                if cur in seen or cur not in tree:
                    ok = False
                    break
                seen.add(cur)
                cur = tree[cur]
            if not ok:
                break
        if ok:
            break

    order: dict[str, list[str]] = {}
    for v in "ACGT":
        rest = list(edges[v])
        if v in tree:
            rest.remove(tree[v])
        rng.shuffle(rest)
        if v in tree:
            rest.append(tree[v])
        order[v] = rest

    out = [s[0]]
    cur = s[0]
    for _ in range(len(s) - 1):
        nxt = order[cur].pop(0)
        out.append(nxt)
        cur = nxt
    return "".join(out)


def mono_shuffle(seq: str, rng: random.Random) -> str:
    """Composition-preserving but dinucleotide-destroying. A control for the control."""
    s = [c for c in seq.upper() if c in "ACGT"]
    rng.shuffle(s)
    return "".join(s)


def dinuc_counts(seq: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for a, b in zip(seq, seq[1:]):
        out[a + b] = out.get(a + b, 0) + 1
    return out


# ---------------------------------------------------------------------------------------- loading

def loci_pack() -> dict:
    return json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())


def t0_indices() -> np.ndarray:
    """The 384 `_T0_` induction-RNA records, not the whole 3,053-track block.

    Averaging all 3,053 smears the axis every attribution on this page is scored on; the two
    correlate at r = 1.0000 and differ by 1% at the peak, and they are still different estimands.
    """
    names = json.loads((ROOT / "src" / "data" / "shorkieTrackNames.json").read_text())["identifiers"]
    t0 = np.array([i for i, n in enumerate(names) if "_T0_" in n and 1148 <= i < 4201])
    if t0.size != 384:
        raise SystemExit(f"expected 384 T0 tracks, found {t0.size}")
    return t0


def fold_checkpoint(fold: str) -> Path:
    """`_scratch/folds/f<n>/model_best.h5`, or the bare scratch checkpoint for f0."""
    p = SCRATCH / "folds" / fold / "model_best.h5"
    if p.exists():
        return p
    if fold == "f0" and (SCRATCH / "model_best.h5").exists():
        return SCRATCH / "model_best.h5"
    raise FileNotFoundError(
        f"{p} is missing. Fetch it with:\n"
        f"  curl -L --create-dirs -o {p} "
        f"https://storage.googleapis.com/seqnn-share/shorkie_models/shorkie/{fold}/model_best.h5"
    )


class Runner:
    """One fold on one device, head sliced to the 384 T0 columns.

    Slicing the head is free accuracy and about 20% of the runtime: softplus is elementwise, so
    the sliced output is identical to selecting those columns afterwards -- and it removes the
    `y[0, a:b, T0]` fancy-indexing trap, because after slicing every column is already a T0 track.
    """

    def __init__(self, checkpoint: Path | str, device: str, t0: np.ndarray | None = None):
        import torch
        import torch.nn as nn
        from shorkie_torch import build

        self.torch = torch
        self.device = device
        self.t0 = t0 if t0 is not None else t0_indices()
        model, weights = build(str(checkpoint))
        n = sum(int(np.prod(v.shape)) for v in weights.tensors.values())
        if n != N_PARAMS:
            raise SystemExit(
                f"{checkpoint} holds {n:,} values, not the expected {N_PARAMS:,}. "
                "A checkpoint of the wrong size is worse than no measurement: it looks like data."
            )
        unused = weights.report_unused()
        if unused:
            raise SystemExit(f"{checkpoint}: {len(unused)} tensors were never consumed: {unused[:4]}")
        model.eval()
        head = model.head
        small = nn.Linear(head.in_features, int(self.t0.size), bias=head.bias is not None)
        with torch.no_grad():
            small.weight.copy_(head.weight[self.t0])
            if head.bias is not None:
                small.bias.copy_(head.bias[self.t0])
        model.head = small
        model.to(device)
        self.model = model
        self.n_params = n

    def coverage(self, x: "np.ndarray"):
        """[B, 16384, 170] -> [B, 896, 384] predicted T0 coverage."""
        torch = self.torch
        with torch.no_grad():
            t = torch.from_numpy(np.ascontiguousarray(x)).to(self.device)
            out, _ = self.model(t)
            return out.cpu().numpy()

    def score(self, x: np.ndarray, lo: int, hi: int) -> np.ndarray:
        """g(x; lo, hi) for a batch: log2(1 + sum over gene bins of the T0 mean)."""
        y = self.coverage(x)
        return np.log2(1.0 + y[:, lo:hi, :].mean(axis=2).sum(axis=1))

    def score_torch(self, t, lo: int, hi: int):
        """Differentiable g for one sequence tensor already on the device."""
        y, _ = self.model(t)
        return self.torch.log2(1.0 + y[:, lo:hi, :].mean(dim=2).sum(dim=1))

    def grad_x(self, x1: np.ndarray, lo: int, hi: int) -> tuple[np.ndarray, float]:
        """d g / d x over the four DNA channels, for one window. Returns ([16384, 4], g)."""
        torch = self.torch
        t = torch.from_numpy(np.ascontiguousarray(x1)).to(self.device).unsqueeze(0)
        t.requires_grad_(True)
        g = self.score_torch(t, lo, hi)
        g.sum().backward()
        return t.grad[0, :, :4].detach().cpu().numpy().copy(), float(g.item())
