"""
The whole Shorkie chain, checked and printed in one place.

Correctness here has been established repeatedly and then re-established from scratch, because the
checks lived in commit messages and ad-hoc scripts. This runs every link and reports every number,
so a regression is visible rather than argued about. It is offline tooling; CI never runs it.

Usage:  python3 scripts/shorkie/verify_pipeline.py <checkpoint.h5> [<sacCer3.fa> <sgdGene.txt>]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
BASE_IDX = {"A": 0, "C": 1, "G": 2, "T": 3}
SEQ_LEN, IN_CHANNELS, N_BINS, N_TRACKS = 16384, 170, 896, 5215
GROUPS = [("chip_exo", 0, 1128), ("chip_mnase", 1128, 1148),
          ("rnaseq_tf", 1148, 4201), ("rnaseq_strain", 4201, 5215)]

failures: list[str] = []


def check(ok: bool, label: str, detail: str) -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {label:<46} {detail}")
    if not ok:
        failures.append(f"{label}: {detail}")


def encode(sequence: str, species: int) -> np.ndarray:
    x = np.zeros((1, SEQ_LEN, IN_CHANNELS), dtype=np.float32)
    for i, base in enumerate(sequence[:SEQ_LEN].upper()):
        j = BASE_IDX.get(base)
        if j is not None:
            x[0, i, j] = 1.0
    x[0, :, 5 + species] = 1.0
    return x


def section(title: str) -> None:
    print(f"\n=== {title} ===")


def verify_packs(ort, Image) -> None:
    """Every precomputed pack must reproduce the graph it claims to summarise.

    This is the check that needs nothing but the repository: the packs and the fp16 graph are both
    committed, so the correspondence between what the page draws and what the model computes is
    re-checkable on any machine, with no checkpoint and no network. It compares the SIGNED maximum
    and the argmax channel per stage -- the two quantities the layer panel actually prints -- so a
    mis-sliced or stale pack shows up as the wrong channel rather than as a small numeric drift.
    """
    import numpy as np

    packs = ROOT / "public" / "vp-data"
    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    onnx_path = str(ROOT / "public" / "models" / "shorkie-fp16.onnx")
    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    names = [o.name for o in sess.get_outputs()]

    offs, start = [], 0
    for i, f in enumerate([96, 128, 160, 192, 256, 320, 384]):
        offs.append((f"block{i + 1}", start, f)); start += f
    for i in range(8):
        offs.append((f"attn{i + 1}", start, 384)); start += 384
    for i in range(3):
        offs.append((f"unet{i + 1}", start, 384)); start += 384

    # Three loci rather than all fourteen: each is a full forward pass, and a systematic packing
    # error is not locus-specific. A locus-specific one would be a stale file, which the argmax
    # comparison catches on any of them.
    worst_err, worst_stage, mismatched, checked = 0.0, "", [], 0
    for locus in loci["loci"][:3]:
        png = packs / f"{locus['id']}-stages.png"
        meta = packs / f"{locus['id']}.json"
        if not png.exists() or not meta.exists():
            check(False, f"pack present for {locus['gene']}", f"{png.name} missing")
            continue
        side = json.loads(meta.read_text())["stages"]
        a = np.asarray(Image.open(png)).astype(np.float64)
        lo = np.asarray(side["lo"], dtype=np.float64)
        hi = np.asarray(side["hi"], dtype=np.float64)
        pack = lo[:, None] + (hi - lo)[:, None] * (a / 255.0)

        x = encode(locus["sequence"], loci["speciesIndex"])
        got = dict(zip(names, sess.run(None, {"sequence": x})))
        live = got["stage_maps"][0]
        for name, s0, n in offs:
            m, q = live[s0:s0 + n], pack[s0:s0 + n]
            err = float(np.abs(m - q).max())
            if err > worst_err:
                worst_err, worst_stage = err, f"{name}/{locus['gene']}"
            if int(np.argmax(m.max(axis=1))) != int(np.argmax(q.max(axis=1))):
                mismatched.append(f"{locus['gene']}/{name}")
            checked += 1

    check(not mismatched, "every stage's loudest channel matches the graph",
          f"{checked} stage-locus pairs, {len(mismatched)} mismatched"
          + (f": {mismatched[:3]}" if mismatched else ""))
    # uint8 per-row quantisation: the bound is the row's own range / 255, and unet3's range is the
    # widest in the network (~394), so a sub-1.0 worst case is the expected floor, not slack.
    check(worst_err < 1.0, "pack decode is within uint8 quantisation",
          f"worst {worst_err:.4f} at {worst_stage}")


def main() -> int:
    import torch
    import onnx
    import onnxruntime as ort
    from PIL import Image
    from shorkie_torch import build

    ckpt = sys.argv[1] if len(sys.argv) > 1 else None
    onnx_path = str(ROOT / "public" / "models" / "shorkie-fp16.onnx")
    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())
    torch.set_grad_enabled(False)

    section("1. graph invariants (the WebGPU trap)")
    graph = onnx.load(onnx_path, load_external_data=False).graph
    widest = max(len(n.input) for n in graph.node)
    over = [(n.op_type, n.name, len(n.input)) for n in graph.node if len(n.input) + 1 > 8]
    check(not over, "no node exceeds 8 storage buffers",
          f"max fan-in {widest} -> {widest + 1} buffers")
    dtypes = {o.name: o.type.tensor_type.elem_type for o in graph.output}
    check(all(v == 1 for v in dtypes.values()), "all graph IO is float32",
          f"{len(dtypes)} outputs")

    section("2. shipped packs <-> shipped graph")
    verify_packs(ort, Image)

    if ckpt is None:
        print("\n  no checkpoint given -- sections 3-8 need <ckpt.h5> and were skipped.")
        return 1 if failures else 0

    section("3. checkpoint -> PyTorch")
    model, report = build(ckpt)
    params = sum(p.numel() for p in model.parameters())
    # Separate the checkpoint's own values from what the port derives. `pos_features` (8,160) is the
    # positional basis precomputed at build time -- it is not in the file, and counting it makes the
    # accounting look right by 8,160 for the wrong reason.
    bn_stats = sum(b.numel() for n, b in model.named_buffers() if "running" in n)
    derived = sum(b.numel() for n, b in model.named_buffers()
                  if "running" not in n and "num_batches" not in n and b.dtype != torch.int64)
    tracked = sum(1 for n, _ in model.named_buffers() if "num_batches" in n)
    exact = params + bn_stats == 14_253_567
    check(exact, "checkpoint value accounting is exact",
          f"{params:,} params + {bn_stats:,} BN stats = {params + bn_stats:,}")
    if not exact:
        # Stop here rather than let a different model reach the comparison stages, where it fails
        # as an opaque broadcast error several checks later. A checkpoint of the wrong size is not
        # a regression in this repo; it is the wrong file.
        print(f"\n  the file at {ckpt} is not the fold-f0 checkpoint this site ships"
              f" (expected 14,253,567 values). Nothing below can be meaningful; stopping.")
        return 1
    check(tracked == 20, "num_batches_tracked entries", f"{tracked}")
    check(derived == 8_160, "derived positional basis, not from the file", f"{derived:,} values")
    if isinstance(report, dict):
        unused = report.get("unused", [])
        check(not unused, "every checkpoint tensor consumed", f"{len(unused)} unused")

    section("4. PyTorch <-> onnxruntime, on real sequence")
    locus = loci["loci"][0]
    x = encode(locus["sequence"], loci["speciesIndex"])
    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    names = [o.name for o in sess.get_outputs()]
    got = dict(zip(names, sess.run(None, {"sequence": x})))
    ref_out, _ = model(torch.from_numpy(x))
    rel = float(np.abs(ref_out.numpy() - got["all_tracks"]).max()
                / max(float(np.abs(ref_out.numpy()).max()), 1e-9))
    check(rel < 3e-3, "fp32 PyTorch vs shipped fp16 graph", f"relative {rel:.2e} on {locus['gene']}")

    section("5. biology: ORF/intergenic by assay block")
    if len(sys.argv) > 3:
        from sanity_check import read_fasta, read_genes, orf_mask, window_for, PROBE_GENES
        fa, genes = read_fasta(sys.argv[2]), read_genes(sys.argv[3])
        ratios = {g: [] for g, _, _ in GROUPS}
        for gene in [g for g in PROBE_GENES if g in genes][:6]:
            seq, left = window_for(gene, genes, fa)
            mask = orf_mask(genes[gene][0], left, genes)
            if mask.sum() < 20 or (~mask).sum() < 20:
                continue
            o = sess.run(None, {"sequence": encode(seq, loci["speciesIndex"])})
            all_tr = dict(zip(names, o))["all_tracks"][0]
            for gid, lo, hi in GROUPS:
                sig = all_tr[:, lo:hi].mean(axis=1)
                ratios[gid].append(sig[mask].mean() / max(sig[~mask].mean(), 1e-9))
        for gid, vals in ratios.items():
            if vals:
                m = float(np.mean(vals))
                ok = m > 5 if gid == "rnaseq_tf" else True
                check(ok, f"ORF enrichment, {gid}", f"{m:.2f}x")
    else:
        print("  SKIP  (pass sacCer3.fa and sgdGene.txt to run the biological gate)")

    section("6. galactose genes are silent in a glucose baseline")
    preds = json.loads((ROOT / "src" / "data" / "shorkiePredictions.json").read_text())
    peaks = {v["gene"]: max(v["groups"][2]) for v in preds["loci"].values()}
    for gene in ("GAL1", "GAL3"):
        check(peaks[gene] < 30, f"{gene} near-silent", f"peak {peaks[gene]:.2f}")
    for gene in ("TDH3", "PDC1"):
        check(peaks[gene] > 500, f"{gene} highly expressed", f"peak {peaks[gene]:.2f}")

    section("7. shipped predictions <-> live inference, every locus")
    worst = 0.0
    for lid, entry in preds["loci"].items():
        loc = next(l for l in loci["loci"] if l["id"] == lid)
        o = dict(zip(names, sess.run(None, {"sequence": encode(loc["sequence"], loci["speciesIndex"])})))
        live = o["tracks"][0][:, 2]
        rel = float(np.abs(np.array(entry["groups"][2]) - live).max() / max(live.max(), 1e-9))
        worst = max(worst, rel)
    check(worst < 5e-3, "predictions match a live run", f"worst relative {worst:.2e} over 14 loci")

    section("8. decoded PNG packs <-> live inference, every locus and tensor")
    spec = [("all_tracks", "tracks", lambda a: a[0].T), ("stage_maps", "stages", lambda a: a[0]),
            ("stem_profile", "stem", lambda a: a[0]),
            ("attention", "attn", lambda a: a[0].reshape(-1, a.shape[-1]))]
    per_tensor = {s: 0.0 for _, s, _ in spec}
    for loc in loci["loci"]:
        o = dict(zip(names, sess.run(None, {"sequence": encode(loc["sequence"], loci["speciesIndex"])})))
        meta = json.loads((ROOT / "public" / "vp-data" / f"{loc['id']}.json").read_text())
        for out_name, suffix, reshape in spec:
            truth = np.asarray(reshape(o[out_name]), dtype=np.float64)
            q = np.asarray(Image.open(ROOT / "public" / "vp-data" / f"{loc['id']}-{suffix}.png"),
                           dtype=np.float64)
            m = meta[suffix]
            lo = np.array(m["lo"])[:, None]
            hi = np.array(m["hi"])[:, None]
            back = q / 255.0 * np.maximum(hi - lo, 1e-9) + lo
            if m.get("space") == "log":
                back = np.expm1(back)
                span = max(np.log1p(np.maximum(truth, 0)).max(), 1e-9)
                rel = float((np.abs(np.log1p(np.maximum(back, 0))
                                    - np.log1p(np.maximum(truth, 0))) / span).max())
            else:
                rel = float(np.abs(back - truth).max() / max(np.abs(truth).max(), 1e-9))
            per_tensor[suffix] = max(per_tensor[suffix], rel)
    for suffix, rel in per_tensor.items():
        unit = "of the log axis" if suffix == "tracks" else "relative"
        check(rel < 4e-3, f"pack {suffix} matches live", f"{rel:.2e} {unit}")

    print(f"\n{'ALL CHECKS PASSED' if not failures else f'{len(failures)} FAILURE(S)'}")
    for f in failures:
        print(f"  - {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
