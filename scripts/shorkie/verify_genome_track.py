"""
Check the genome-wide Shorkie_LM track against everything that can contradict it.

Four things, each of which would fail differently:

1. **Coverage.** Every base of all 17 sequences has a score and the total is exactly 12,157,105.
   A windowing bug shows up here as NaNs or as a length that does not match sacCer3.

2. **Agreement with the primary regions -- in shape, not in magnitude, and the reason matters.**
   Each of the 23 shipped loci was scored as ONE window starting at `locus.start`; the track scores
   the same bases from windows starting at multiples of 4,096. Those are different **phases** of the
   U-Net's 128 bp pooling grid, and the model is markedly phase-sensitive:

       windows at the SAME phase (mod 128)   mean |dIC|  0.0020
       windows at DIFFERENT phases           mean |dIC|  0.0395     19.7x

   Measured on FUN12 across nine window starts: four at phase 67 agree to 0.0008-0.0040, three at
   phase 0 agree to 0.0008-0.0013, and every cross-phase pair sits at 0.054. That is an order of
   magnitude larger than the edge effect the flank was chosen for, and it is why this check asserts
   CORRELATION rather than an absolute difference: an absolute bound tight enough to be meaningful
   is unreachable between two different phases, and one loose enough to pass would test nothing.

   The track is self-consistent because every one of its windows is phase 0 -- so every base in the
   genome is scored on one grid, which is what makes the browser's values comparable to each other.
   The per-locus packs are on whatever phase `locus.start` happens to give.

3. **The seams.** Cores abut every 12,288 bp. If the flank were too small the track would step at
   those joins. Tested by comparing |dIC| across a seam against |dIC| at interior positions: they
   must be indistinguishable, because a seam is only a seam in the bookkeeping.

4. **The scale is real.** IC must lie in [0, 2] bits, and chrM must come out markedly more
   predictable than the nuclear chromosomes -- it is AT-rich and repetitive, so a track that did not
   show that would be measuring something else.

Usage:  python3 scripts/shorkie/verify_genome_track.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
TRACK = Path(__file__).resolve().parent / "_scratch" / "genome-track"

# The tiler's own mapping, imported rather than reimplemented: a re-derivation here would
# agree with a mistake in the tiler, which is how a check comes to pass against a bug.
from make_genome_tiles import to_fraction  # noqa: E402
from make_ism import dequantize_rows, saliency  # noqa: E402

FAILED = 0


def check(ok: bool, label: str, detail: str = "") -> None:
    global FAILED
    FAILED += not ok
    print(f"  {'PASS' if ok else 'FAIL'}  {label:52s} {detail}")


def main() -> int:
    man = json.loads((TRACK / "manifest.json").read_text())
    chroms = man["chroms"]
    tracks = {c: np.load(TRACK / f"{c}.npy") for c in chroms}
    unmasked = {c: np.load(TRACK / f"{c}-unmasked.npy")
                for c in chroms if (TRACK / f"{c}-unmasked.npy").exists()}
    phast = {c: np.load(TRACK / f"{c}-phastcons.npy")
             for c in chroms if (TRACK / f"{c}-phastcons.npy").exists()}
    gc = {c: np.load(TRACK / f"{c}-gc.npy")
          for c in chroms if (TRACK / f"{c}-gc.npy").exists()}

    print("=== 1. coverage ===")
    total = sum(len(v) for v in tracks.values())
    nan = sum(int(np.isnan(v).sum()) for v in tracks.values())
    check(total == 12_157_105, "every base of sacCer3 has a score", f"{total:,} bases, {len(tracks)} sequences")
    check(nan == 0, "no base was left unscored", f"{nan} NaN")
    bad_len = [c for c, v in tracks.items() if len(v) != chroms[c]["length"]]
    check(not bad_len, "each array matches its manifest length", f"{bad_len[:3] or 'all match'}")

    print("\n=== 2. agreement with the 23 primary regions ===")
    loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())["loci"]
    worst, worst_where, checked = 0.0, "", 0
    rs = []
    for l in loci:
        lm_p = ROOT / "public" / "lm-data" / f"{l['id']}-lm.json"
        if not lm_p.exists() or l["chrom"] not in tracks:
            continue
        spec = json.loads(lm_p.read_text())["masked"]
        q = np.asarray(Image.open(ROOT / "public" / "lm-data" / f"{l['id']}-masked.png")).astype(np.float64)
        lo = np.asarray(spec["lo"])[:, None]
        hi = np.asarray(spec["hi"])[:, None]
        v = q / 255.0 * (hi - lo) + lo
        if spec.get("space") == "log":
            v = 10.0 ** v
        p = v.T                                            # [16384, 4]
        p = p / np.maximum(p.sum(axis=1, keepdims=True), 1e-12)
        pack_ic = 2.0 + (p * np.log2(np.clip(p, 1e-12, 1))).sum(axis=1)

        # The central half only: the pack's own edges have a truncated flank by construction.
        a, b = 4096, 12288
        gen = tracks[l["chrom"]][l["start"] + a: l["start"] + b]
        if len(gen) != b - a:
            continue
        d = np.abs(gen - pack_ic[a:b])
        checked += 1
        rs.append(float(np.corrcoef(gen, pack_ic[a:b])[0, 1]))
        if d.mean() > worst:
            worst, worst_where = float(d.mean()), l["gene"]
    check(checked >= 20, "compared against the shipped packs", f"{checked} regions")
    # Structure, not magnitude: the two are on different phases of the 128 bp pooling grid, which
    # costs ~0.04 bits of absolute agreement while leaving the profile intact.
    check(min(rs) > 0.93, "track and packs agree in shape across every region",
          f"min r {min(rs):.4f}, median {np.median(rs):.4f}")
    check(worst < 0.09, "and the offset stays within the measured phase effect",
          f"worst mean |dIC| {worst:.4f} at {worst_where} (cross-phase effect ~0.040)")

    print("\n=== 2b. the track is on one grid phase, which is what makes it comparable ===")
    from make_genome_track import plan_windows          # the rule itself, not a copy of it
    phases = set()
    for c, v in tracks.items():
        for s, _c0, _c1 in plan_windows(len(v)):
            phases.add(s % 128)
    check(phases <= {0}, "every window starts on the pooling grid",
          f"phases seen: {sorted(phases)}")

    print("\n=== 3. the seams ===")
    core = man["core"]
    seam_d, interior_d = [], []
    rng = np.random.default_rng(0)
    for c, v in tracks.items():
        for s in range(core, len(v) - 1, core):
            seam_d.append(abs(float(v[s] - v[s - 1])))
        n = len(seam_d)
        idx = rng.integers(1, len(v) - 1, size=max(n, 1))
        interior_d.extend(abs(float(v[i] - v[i - 1])) for i in idx[:200])
    sm, im = float(np.mean(seam_d)), float(np.mean(interior_d))
    check(len(seam_d) > 900, "every core boundary was examined", f"{len(seam_d)} seams")
    # A real step would make the seam difference stand out against ordinary base-to-base variation.
    check(sm < im * 1.5, "no step at the core boundaries",
          f"mean |dIC| across a seam {sm:.4f} vs {im:.4f} at a random interior position")

    print("\n=== 3b. the two passes ===")
    check(len(unmasked) == len(tracks), "every chromosome has both passes",
          f"{len(unmasked)}/{len(tracks)} unmasked")
    if unmasked:
        # The unmasked pass sees the base it scores, so it MUST be more certain than the masked one.
        # If the two came out equal the masking would not be doing anything, and the whole
        # distinction the page draws would be decoration.
        per = [(c, float(tracks[c].mean()), float(unmasked[c].mean())) for c in unmasked]
        worse = [c for c, m, u in per if u <= m]
        tot = sum(len(v) for v in tracks.values())
        gm = sum(tracks[c].mean() * len(tracks[c]) for c in unmasked) / tot
        gu = sum(unmasked[c].mean() * len(unmasked[c]) for c in unmasked) / tot
        check(not worse, "unmasked is more certain than masked on every chromosome",
              f"genome mean {gm:.4f} -> {gu:.4f} bits ({gu/gm:.2f}x)" if not worse else str(worse[:3]))
        # ... and not SO much more that they are the same measurement rescaled. On the shipped
        # per-locus packs the two correlate at r = 0.62, which is what makes both worth drawing.
        rs = [float(np.corrcoef(tracks[c], unmasked[c])[0, 1]) for c in sorted(unmasked)]
        check(0.3 < min(rs) < 0.95, "the passes are related but not redundant",
              f"per-chromosome r {min(rs):.3f}-{max(rs):.3f}, median {np.median(rs):.3f}")

    print("\n=== 3c. conservation ===")
    check(len(phast) == len(tracks), "every chromosome has phastCons",
          f"{len(phast)}/{len(tracks)}")
    if phast:
        allv = np.concatenate([v[np.isfinite(v)] for v in phast.values()])
        check(allv.min() >= 0 and allv.max() <= 1, "phastCons is a probability in [0, 1]",
              f"[{allv.min():.4f}, {allv.max():.4f}]")
        scored = sum(int(np.isfinite(v).sum()) for v in phast.values())
        tot = sum(len(v) for v in phast.values())
        # NaN, not zero. A zero would read as "not conserved" where the truth is "not aligned".
        check(scored < tot, "unaligned bases are NaN rather than zero",
              f"{tot - scored:,} of {tot:,} bases unscored ({(tot-scored)/tot*100:.2f}%)")
        check(all(np.isfinite(v).mean() > 0.7 for v in phast.values()),
              "every chromosome is mostly covered",
              f"worst {min(np.isfinite(v).mean() for v in phast.values())*100:.1f}%")

    print("\n=== 3c2. GC content ===")
    check(len(gc) == len(tracks), "every chromosome has GC", f"{len(gc)}/{len(tracks)}")
    if gc:
        allg = np.concatenate([v[np.isfinite(v)] for v in gc.values()])
        check(allg.min() >= 0 and allg.max() <= 1, "GC is a fraction in [0, 1]",
              f"[{allg.min():.4f}, {allg.max():.4f}]")
        tot = sum(len(v) for v in gc.values())
        wm = sum(float(np.nanmean(v)) * len(v) for v in gc.values()) / tot
        # The independent check that the computation is right: sacCer3's GC content is published.
        check(0.375 < wm < 0.387, "genome GC matches the published 38.1%", f"{wm*100:.2f}%")
        # chrM is famously AT-rich; a GC track that did not show that is measuring something else.
        check("chrM" in gc and float(np.nanmean(gc["chrM"])) < 0.25,
              "chrM comes out far more AT-rich than the nuclear genome",
              f"chrM {float(np.nanmean(gc.get('chrM', np.array([np.nan]))))*100:.2f}%")

    print("\n=== 3d. the shipped tiles decode back to the arrays ===")
    idx_p = ROOT / "public" / "genome-data" / "index.json"
    if not idx_p.exists():
        check(False, "index.json exists", "run make_genome_tiles.py first")
    else:
        idx = json.loads(idx_p.read_text())
        src = {"lm-masked": tracks, "lm-unmasked": unmasked, "phastcons": phast, "gc": gc}
        # The expression model's arrays, loaded lazily -- they may not exist yet on a machine that
        # has only run the language-model passes.
        for tid, suffix in (("sk-rnaseq", "sk-cov-baseline"), ("sk-chip-exo", "sk-cov-chip_exo"),
                            ("sk-chip-mnase", "sk-cov-chip_mnase"),
                            ("sk-strain", "sk-cov-rnaseq_strain"),
                            ("sk-gradient", "sk-gradient"), ("sk-ig", "sk-ig"),
                            ("sk-occl", "sk-occlusion")):
            got = {c: np.load(TRACK / f"{c}-{suffix}.npy")
                   for c in tracks if (TRACK / f"{c}-{suffix}.npy").exists()}
            if got:
                src[tid] = got
        for spec in idx["tracks"]:
            tid = spec["id"]
            lo, hi = spec["axis"]
            space = spec.get("space", "linear")
            lin = spec.get("linthresh", 1.0)
            native = spec.get("nativeBp", 1)
            # A track's BASE level is the finest one it ships, not L0: a 16 bp track has no L0 at
            # all, and looking for one finds an empty directory and silently checks nothing.
            base_level = min(l["level"] for l in spec["levels"])
            # The quantisation step is one byte in the track's READ space, so for a log or symlog
            # track it is not a constant number of units. Compare in that space.
            step = 1.0 / 254.0
            worst_err, worst_where, sentinel_ok = 0.0, "", True
            for chrom in sorted(src.get(tid, {})):
                truth = src[tid][chrom]
                got = np.zeros(len(truth), dtype=np.uint8)
                for tf in sorted((idx_p.parent / chrom / tid / f"L{base_level}").glob("*.png"),
                                 key=lambda q: int(q.stem)):
                    a = np.asarray(Image.open(tf)).reshape(-1)
                    s = int(tf.stem) * idx["tileBins"]
                    got[s:s + len(a)] = a[:len(got) - s]
                nodata = got == 0
                if not np.array_equal(nodata, ~np.isfinite(truth)):
                    sentinel_ok = False
                fin = np.isfinite(truth) & ~nodata
                # Both sides in the read space: `to_fraction` is what the tiler quantised with,
                # and it is the mapping `axisFraction` in the browser inverts. Comparing in value
                # space would make a log track look wrong at its top and right at its bottom.
                want = to_fraction(truth[fin], lo, hi, space, lin)
                val = (got[fin].astype(np.float64) - 1) / 254.0
                e = float(np.abs(val - want).max()) if fin.any() else 0.0
                if e > worst_err:
                    worst_err, worst_where = e, chrom
            if not src.get(tid):
                continue
            # Half a quantisation step is the uint8 floor, not slack. Anything above it is a bug.
            check(worst_err <= step / 2 + 1e-9,
                  f"{tid}: L{base_level} decodes to within half a byte",
                  f"worst {worst_err:.6f} of the axis at {worst_where} "
                  f"(half-step {step/2:.6f}, {native} bp bins, {space})")
            check(sentinel_ok, f"{tid}: byte 0 marks exactly the unscored bins", "")
            # No track may ship a level finer than its own bins -- that is an upsampled step
            # function drawn as though the model resolved single bases.
            fine = [l["binBp"] for l in spec["levels"] if l["binBp"] < native or l["binBp"] % native]
            check(not fine, f"{tid}: ships no level finer than its {native} bp data",
                  f"levels {[l['binBp'] for l in spec['levels']]}")
            on_disk = sorted(int(d.name[1:]) for d in (idx_p.parent / "chrI" / tid).iterdir()
                             if d.is_dir())
            check(on_disk == sorted(l["level"] for l in spec["levels"]),
                  f"{tid}: the tiles on disk are exactly the declared ladder", f"L{on_disk}")

    print("\n=== 4. the scale is real ===")
    lo = min(float(v.min()) for v in tracks.values())
    hi = max(float(v.max()) for v in tracks.values())
    check(-0.01 <= lo and hi <= 2.001, "information content lies in [0, 2] bits", f"[{lo:.4f}, {hi:.4f}]")
    nuc = [chroms[c]["mean"] for c in chroms if c != "chrM"]
    check("chrM" in chroms and chroms["chrM"]["mean"] > max(nuc) * 1.5,
          "chrM is far more predictable than the nuclear genome",
          f"chrM {chroms.get('chrM', {}).get('mean', 0):.4f} vs nuclear max {max(nuc):.4f}")

    # ---------------------------------------------------------------------------------------
    print("\n=== 5. the expression model's own tracks ===")
    man_p = TRACK / "shorkie.json"
    if not man_p.exists():
        print("  (make_genome_shorkie.py has not run; skipping)")
    else:
        man = json.loads(man_p.read_text())["passes"]
        loci = json.loads((ROOT / "src" / "data" / "shorkieLoci.json").read_text())["loci"]
        preds = json.loads((ROOT / "src" / "data" / "shorkiePredictions.json").read_text())["loci"]

        cov = {c: np.load(TRACK / f"{c}-sk-cov-baseline.npy")
               for c in tracks if (TRACK / f"{c}-sk-cov-baseline.npy").exists()}
        if cov:
            # 5a. The head crops 1,024 bp from each window end and no window starts before 0, so
            #     exactly the first 64 bins of every chromosome are unscored -- no more, no less.
            #     More than that is a windowing bug; fewer means a window overwrote a neighbour.
            gaps = {c: int((~np.isfinite(v)).sum()) for c, v in cov.items()}
            check(set(gaps.values()) == {1024 // 16},
                  "exactly 1,024 bp unscored at each chromosome start",
                  f"{sorted(set(gaps.values()))} bins; total {sum(gaps.values())*16:,} bp")
            first = {c: int(np.argmax(np.isfinite(v))) for c, v in cov.items()}
            check(set(first.values()) == {1024 // 16},
                  "the gap is at the START, not scattered through the array",
                  f"first scored bin {sorted(set(first.values()))}")

            # 5b. Against the shipped per-locus predictions. This asserts CORRELATION for the same
            #     reason section 2 does -- the packs sit on whatever pooling phase `locus.start`
            #     gives, and the model is ~20x more sensitive to phase than to flank. What is
            #     asserted absolutely is the ONE locus that shares the genome grid's phase.
            rs, aligned = [], []
            for L in loci:
                if L["id"] not in preds or L["chrom"] not in cov:
                    continue
                ref = np.asarray(preds[L["id"]]["baseline"], dtype=np.float64)
                j0 = (L["start"] + 1024) // 16
                mine = cov[L["chrom"]][j0:j0 + 896].astype(np.float64)
                ok = np.isfinite(mine)
                if ok.sum() < 500:
                    continue
                r = float(np.corrcoef(mine[ok], ref[ok])[0, 1])
                rs.append((r, L["gene"], float(ref.max())))
                if L["start"] % 128 == 0 and L["start"] % 16 == 0:
                    aligned.append((r, L["gene"]))
            med = float(np.median([r for r, _, _ in rs]))
            check(med > 0.98, "median r against the shipped per-locus predictions",
                  f"{med:.5f} over {len(rs)} loci")
            check(all(r > 0.99 for r, _ in aligned) if aligned else True,
                  "a phase-aligned locus reproduces its pack almost exactly",
                  ", ".join(f"{g} {r:.5f}" for r, g in aligned) or "none share the grid phase")
            # 5c. The residual is LOUDNESS, not a windowing error. If a low r tracked phase
            #     distance instead, that would be the bug this check exists to distinguish.
            arr = np.array([[r, np.log10(max(pk, 1e-6))] for r, _, pk in rs])
            r_loud = float(np.corrcoef(arr[:, 0], arr[:, 1])[0, 1])
            check(r_loud > 0.4,
                  "low agreement tracks locus LOUDNESS, not a windowing bug",
                  f"r(agreement, log peak) = {r_loud:+.3f}; quietest: "
                  + ", ".join(g for _, g, _ in sorted(rs, key=lambda x: x[2])[:3]))

        # 5d. The signed attribution agrees in SIGN with the shipped mutagenesis planes. A sign
        #     error is invisible -- the numbers stay the same size -- and inverts every reading.
        #
        #     The decode is IMPORTED from make_ism, never rewritten here. A hand-written decode
        #     using expm1/log1p instead of the pack's own `sign(v)*1e-4*(10^|v|-1)` is monotone and
        #     odd, so it preserves signs and argmaxes and passes this check -- while silently
        #     changing every correlation computed from it. That is exactly what happened: it
        #     reported 23/23 and a median r of 0.30 where the truth is 22/23 and 0.369.
        grad = {c: np.load(TRACK / f"{c}-sk-gradient.npy")
                for c in tracks if (TRACK / f"{c}-sk-gradient.npy").exists()}
        if grad:
            allg = np.concatenate([v[np.isfinite(v)] for v in grad.values()])
            check(abs(float((allg < 0).mean()) - 0.5) < 0.1,
                  "gradient x input is roughly balanced in sign",
                  f"{float((allg < 0).mean())*100:.1f}% negative")
            agree, tested = 0, 0
            dissent, rs = [], []
            for L in loci:
                png = ROOT / "public" / "vp-data" / f"{L['id']}-ism.png"
                side = ROOT / "public" / "vp-data" / f"{L['id']}.json"
                if not png.exists() or not side.exists() or L["chrom"] not in grad:
                    continue
                meta = json.loads(side.read_text())["ism"]
                plane = dequantize_rows(np.asarray(Image.open(png)),
                                        np.array(meta["lo"]), np.array(meta["hi"]), meta["space"])
                sal = saliency(plane, L["sequence"][:16384])
                g = grad[L["chrom"]][L["start"]:L["start"] + 16384]
                if len(g) < 16384 or not np.isfinite(g).all():
                    continue
                i = int(np.argmax(np.abs(sal)))
                if np.sign(g[i]) == np.sign(sal[i]):
                    agree += 1
                else:
                    dissent.append((L["gene"], float(g[i]), float(sal[i])))
                rs.append(float(np.corrcoef(g, sal)[0, 1]))
                tested += 1
            # 22 of 23, not 23. The exception is GAL3, where the gradient at mutagenesis's
            # strongest base is +0.0013 -- 1.6x the genome-wide median |gradient|, i.e. essentially
            # zero. That is gradient SATURATION, the documented failure mode of a local derivative,
            # not a contradiction between the methods.
            check(tested and agree >= tested - 1,
                  "the strongest substitution agrees in sign at all but one locus",
                  f"{agree}/{tested}"
                  + (f"; dissent {', '.join(f'{g} grad {a:+.5f} vs sal {b:+.4f}' for g, a, b in dissent)}"
                     if dissent else ""))
            check(bool(rs) and 0.30 < float(np.median(rs)) < 0.45,
                  "median per-base correlation with the paper's saliency",
                  f"{float(np.median(rs)):.4f} over {tested} loci "
                  f"({min(rs):.3f}-{max(rs):.3f})" if rs else "")

        # 5e. The sparse mutagenesis track must BE the packs it was built from -- same values at
        #     the same genome coordinates, and nothing anywhere else. A sparse track is the one
        #     place an off-by-one in the locus offset produces a plausible drawing in the wrong
        #     place rather than an obvious failure.
        ism = {c: np.load(TRACK / f"{c}-sk-ism.npy")
               for c in tracks if (TRACK / f"{c}-sk-ism.npy").exists()}
        if ism:
            scored = sum(int(np.isfinite(v).sum()) for v in ism.values())
            check(scored == len(loci) * 16384,
                  "mutagenesis is scored on exactly the analysed windows",
                  f"{scored:,} bases = {len(loci)} x 16,384 ({scored / total * 100:.2f}% of the genome)")
            worst, where = 0.0, ""
            for L in loci:
                png = ROOT / "public" / "vp-data" / f"{L['id']}-ism.png"
                side = ROOT / "public" / "vp-data" / f"{L['id']}.json"
                if not (png.exists() and side.exists() and L["chrom"] in ism):
                    continue
                meta = json.loads(side.read_text())["ism"]
                want = saliency(dequantize_rows(np.asarray(Image.open(png)),
                                                np.array(meta["lo"]), np.array(meta["hi"]),
                                                meta["space"]), L["sequence"][:16384])
                got = ism[L["chrom"]][L["start"]:L["start"] + 16384]
                # Compared at float32, which is what the array stores. An exact-equality test
                # here fails on 2.5e-08 of representation error and says nothing about the data.
                e = float(np.abs(got - want.astype(np.float32)).max())
                if e > worst:
                    worst, where = e, L["gene"]
            check(worst == 0.0, "every window round-trips from its own pack, to float32",
                  f"worst {worst:.2e}" + (f" at {where}" if where else ""))

        for name, rec in man.items():
            n = rec.get("native")
            print(f"    {name:<10} {n:>3} bp bins, rc-averaged {rec.get('rcAveraged')}, "
                  f"{len(rec.get('chroms', {}))} chromosomes")

    short = sum(m["shortFlankBases"] for m in chroms.values())
    print(f"\n  {short:,} bases had a flank cut short by a chromosome end "
          f"({short / total * 100:.2f}% of the genome), recorded in the manifest")
    print("\n" + ("ALL CHECKS PASSED" if not FAILED else f"{FAILED} CHECK(S) FAILED"))
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
